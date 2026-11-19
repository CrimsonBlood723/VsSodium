/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { Socket, connect } from 'net';
import * as vscode from 'vscode';

const CONFIGURATION = 'vssodium.discordRichPresence';
const CONFIGURE_COMMAND = 'vssodium.discordRichPresence.configure';
const TOGGLE_COMMAND = 'vssodium.discordRichPresence.toggle';

class DiscordIpcClient {
	private socket: Socket | undefined;
	private receiveBuffer = Buffer.alloc(0);
	private ready = false;
	private readyResolver: (() => void) | undefined;
	onConnectionClosed: (() => void) | undefined;

	async connect(applicationId: string): Promise<void> {
		let lastError: Error | undefined;
		for (const pipe of getIpcPaths()) {
			const socket = connect(pipe);
			try {
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Discord IPC connection timed out')), 1500);
					socket.once('connect', () => {
						clearTimeout(timeout);
						resolve();
					});
					socket.once('error', error => {
						clearTimeout(timeout);
						reject(error);
					});
				});
				this.socket = socket;
				this.receiveBuffer = Buffer.alloc(0);
				socket.on('data', data => this.handleData(data));
				socket.on('close', () => {
					this.reset();
					this.onConnectionClosed?.();
				});
				socket.on('error', () => this.reset());
				socket.write(this.frame(0, JSON.stringify({ v: 1, client_id: applicationId })));
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => reject(new Error('Discord IPC handshake timed out')), 3000);
					this.readyResolver = () => {
						clearTimeout(timeout);
						resolve();
					};
					socket.once('close', () => {
						clearTimeout(timeout);
						reject(new Error('Discord IPC closed before handshake completed'));
					});
				});
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				socket.destroy();
			}
		}
		throw lastError ?? new Error('Discord desktop IPC endpoint was not found');
	}

	setActivity(activity: Record<string, unknown> | null): void {
		if (!this.socket || !this.ready) {
			return;
		}
		this.socket.write(this.frame(1, JSON.stringify({
			cmd: 'SET_ACTIVITY',
			args: { pid: process.pid, activity },
			nonce: randomUUID()
		})));
	}

	disconnect(): void {
		this.socket?.destroy();
		this.reset();
	}

	private frame(opcode: number, payload: string): Buffer {
		const body = Buffer.from(payload, 'utf8');
		const header = Buffer.alloc(8);
		header.writeUInt32LE(opcode, 0);
		header.writeUInt32LE(body.length, 4);
		return Buffer.concat([header, body]);
	}

	private handleData(data: Buffer): void {
		this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
		while (this.receiveBuffer.length >= 8) {
			const opcode = this.receiveBuffer.readUInt32LE(0);
			const payloadLength = this.receiveBuffer.readUInt32LE(4);
			if (this.receiveBuffer.length < 8 + payloadLength) {
				return;
			}
			const payload = this.receiveBuffer.subarray(8, 8 + payloadLength).toString('utf8');
			this.receiveBuffer = this.receiveBuffer.subarray(8 + payloadLength);
			if (opcode === 1) {
				try {
					const message = JSON.parse(payload) as { evt?: string };
					if (message.evt === 'READY') {
						this.ready = true;
						this.readyResolver?.();
						this.readyResolver = undefined;
					}
				} catch {
					// Ignore malformed messages from the local Discord IPC endpoint.
				}
			}
		}
	}

	private reset(): void {
		this.socket = undefined;
		this.ready = false;
	}
}

function getIpcPaths(): string[] {
	if (process.platform === 'win32') {
		return Array.from({ length: 10 }, (_, index) => `\\\\?\\pipe\\discord-ipc-${index}`);
	}
	const paths = ['/tmp/discord-ipc-0', join(homedir(), '.config', 'discord-ipc-0')];
	if (process.env['XDG_RUNTIME_DIR']) {
		paths.unshift(join(process.env['XDG_RUNTIME_DIR'], 'app', 'com.discordapp.Discord', 'discord-ipc-0'));
		paths.unshift(join(process.env['XDG_RUNTIME_DIR'], 'discord-ipc-0'));
	}
	if (process.platform === 'linux') {
		paths.push(join(tmpdir(), 'discord-ipc-0'));
	}
	return [...new Set(paths)];
}

export function activate(context: vscode.ExtensionContext): void {
	const client = new DiscordIpcClient();
	const startedAt = Date.now();
	let reconnectTimer: NodeJS.Timeout | undefined;
	let connecting = false;
	let disposed = false;
	let status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
	status.command = CONFIGURE_COMMAND;
	context.subscriptions.push(status);

	const getConfig = () => vscode.workspace.getConfiguration(CONFIGURATION);
	const getActivity = (): Record<string, unknown> => {
		const editor = vscode.window.activeTextEditor;
		const showFileName = getConfig().get<boolean>('showFileName', false);
		const iconAssetKey = getConfig().get<string>('iconAssetKey', 'vssodium').trim();
		const activity: Record<string, unknown> = {
			details: 'Coding in VsSodium',
			state: editor ? 'Editing code' : vscode.workspace.workspaceFolders?.length ? 'Workspace open' : 'At the Welcome screen',
			timestamps: { start: startedAt },
			instance: false
		};
		if (iconAssetKey) {
			activity.assets = { large_image: iconAssetKey, large_text: 'VsSodium' };
		}
		if (showFileName && editor) {
			activity.state = editor.document.uri.scheme === 'file' ? editor.document.uri.fsPath.split(/[\\/]/).pop() ?? 'Editing code' : 'Editing code';
		}
		return activity;
	};
	const updateStatus = (connected: boolean) => {
		const enabled = getConfig().get<boolean>('enabled', false);
		status.text = enabled
			? connected ? '$(radio-tower) Discord: On' : '$(radio-tower) Discord: Waiting'
			: '$(radio-tower) Discord: Off';
		status.tooltip = enabled
			? connected ? vscode.l10n.t('Discord Rich Presence is connected. Click to configure.') : vscode.l10n.t('Discord Rich Presence is enabled. Click to configure the application ID or check the Discord desktop app.')
			: vscode.l10n.t('Discord Rich Presence is off. Click to configure.');
		status.show();
	};
	client.onConnectionClosed = () => {
		updateStatus(false);
		if (!disposed && getConfig().get<boolean>('enabled', false) && !reconnectTimer) {
			reconnectTimer = setTimeout(() => {
				reconnectTimer = undefined;
				void connectAndPublish();
			}, 10_000);
		}
	};
	const stop = () => {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = undefined;
		}
		client.setActivity(null);
		client.disconnect();
		updateStatus(false);
	};
	const connectAndPublish = async () => {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = undefined;
		}
		const config = getConfig();
		const applicationId = config.get<string>('applicationId', '').trim();
		if (disposed || !config.get<boolean>('enabled', false) || !applicationId || connecting) {
			updateStatus(false);
			return;
		}
		connecting = true;
		try {
			await client.connect(applicationId);
			if (disposed || !getConfig().get<boolean>('enabled', false)) {
				client.disconnect();
				return;
			}
			client.setActivity(getActivity());
			updateStatus(true);
		} catch {
			updateStatus(false);
			reconnectTimer = setTimeout(() => void connectAndPublish(), 10_000);
		} finally {
			connecting = false;
		}
	};

	const configure = async () => {
		const currentId = getConfig().get<string>('applicationId', '');
		const applicationId = await vscode.window.showInputBox({
			title: vscode.l10n.t('Configure Discord Rich Presence'),
			prompt: vscode.l10n.t('Enter the Application ID from your Discord Developer Portal application.'),
			placeHolder: vscode.l10n.t('Discord Application ID'),
			value: currentId,
			ignoreFocusOut: true,
			validateInput: value => value.trim() && !/^\d{17,20}$/.test(value.trim())
				? vscode.l10n.t('Enter the numeric Application ID shown in the Discord Developer Portal.')
				: undefined
		});
		if (applicationId === undefined) {
			return;
		}
		await getConfig().update('applicationId', applicationId.trim(), vscode.ConfigurationTarget.Global);
		await getConfig().update('enabled', true, vscode.ConfigurationTarget.Global);
		stop();
		void connectAndPublish();
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(CONFIGURE_COMMAND, configure),
		vscode.commands.registerCommand(TOGGLE_COMMAND, async () => {
			if (getConfig().get<boolean>('enabled', false)) {
				await getConfig().update('enabled', false, vscode.ConfigurationTarget.Global);
				stop();
			} else if (!getConfig().get<string>('applicationId', '').trim()) {
				await configure();
			} else {
				await getConfig().update('enabled', true, vscode.ConfigurationTarget.Global);
				void connectAndPublish();
			}
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CONFIGURATION)) {
				stop();
				void connectAndPublish();
			}
		}),
		vscode.window.onDidChangeActiveTextEditor(() => client.setActivity(getActivity())),
		vscode.workspace.onDidChangeWorkspaceFolders(() => client.setActivity(getActivity()))
	);
	context.subscriptions.push({
		dispose: () => {
			disposed = true;
			stop();
		}
	});
	updateStatus(false);
	void connectAndPublish();
}
