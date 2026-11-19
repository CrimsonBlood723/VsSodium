/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const vscode = require('vscode');

/** @param {vscode.ExtensionContext} context */
function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('vssodium.svg.openWithPreview', async resource => {
		const uri = resource instanceof vscode.Uri ? resource : vscode.window.activeTextEditor?.document.uri;
		if (!uri || uri.scheme !== 'file' || !uri.fsPath.toLowerCase().endsWith('.svg')) {
			return;
		}

		const document = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(document, { preview: false });
		const panel = vscode.window.createWebviewPanel(
			'vssodium.svg.livePreview',
			vscode.l10n.t('SVG Preview: {0}', vscode.workspace.asRelativePath(uri)),
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{ enableScripts: false, enableCommandUris: false, localResourceRoots: [] }
		);
		const render = () => {
			const svg = document.getText();
			const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
			panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background-color:var(--vscode-editor-background);background-image:linear-gradient(45deg,var(--vscode-editorWidget-background) 25%,transparent 25%),linear-gradient(-45deg,var(--vscode-editorWidget-background) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,var(--vscode-editorWidget-background) 75%),linear-gradient(-45deg,transparent 75%,var(--vscode-editorWidget-background) 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.preview{max-width:100%;max-height:100%;overflow:auto}.preview img{display:block;max-width:min(90vw,1000px);max-height:90vh}</style></head><body><main class="preview"><img alt="${vscode.l10n.t('SVG preview')}" src="${image}"></main></body></html>`;
		};
		render();
		const changeListener = vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.uri.toString() === document.uri.toString()) {
				render();
			}
		});
		panel.onDidDispose(() => changeListener.dispose());
	}));
}

function deactivate() { }

module.exports = { activate, deactivate };
