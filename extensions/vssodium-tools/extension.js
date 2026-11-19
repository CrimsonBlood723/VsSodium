/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const vscode = require('vscode');

const liteSettings = {
	'editor.minimap.enabled': false,
	'editor.stickyScroll.enabled': false,
	'editor.codeLens': false,
	'workbench.editor.limit.enabled': true,
	'workbench.editor.limit.value': 8,
	'files.watcherExclude': {
		'**/.git/objects/**': true,
		'**/node_modules/**': true,
		'**/dist/**': true,
		'**/build/**': true
	},
	'search.exclude': {
		'**/node_modules': true,
		'**/dist': true,
		'**/build': true
	}
};

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('vssodium.performance.open', openPerformanceCenter),
		vscode.commands.registerCommand('vssodium.lite.toggle', () => toggleLiteMode(context)),
		vscode.commands.registerCommand('vssodium.project.createStarter', createStarterProject)
	);
}

async function openPerformanceCenter() {
	const choice = await vscode.window.showQuickPick([
		{ label: `$(pulse) ${vscode.l10n.t('Open Process Explorer')}`, description: vscode.l10n.t('See live CPU and memory use by VsSodium process'), command: 'workbench.action.openProcessExplorer' },
		{ label: `$(extensions) ${vscode.l10n.t('Review Extensions')}`, description: vscode.l10n.t('Disable extensions you do not use'), command: 'workbench.extensions.action.showInstalledExtensions' },
		{ label: `$(zap) ${vscode.l10n.t('Toggle Lite Workspace Mode')}`, description: vscode.l10n.t('Reduce file watching and editor rendering overhead'), command: 'vssodium.lite.toggle' },
		{ label: `$(new-folder) ${vscode.l10n.t('Create Project from Starter Kit')}`, description: vscode.l10n.t('Start a TypeScript, Python, or Rust project'), command: 'vssodium.project.createStarter' }
	], { title: vscode.l10n.t('VsSodium Performance Center'), placeHolder: vscode.l10n.t('Choose a performance or productivity action') });
	if (choice) {
		await vscode.commands.executeCommand(choice.command);
	}
}

async function toggleLiteMode(context) {
	if (!vscode.workspace.workspaceFolders?.length) {
		void vscode.window.showWarningMessage(vscode.l10n.t('Open a folder or workspace before changing Lite Workspace Mode.'));
		return;
	}
	const configuration = vscode.workspace.getConfiguration('vssodium');
	const enabled = configuration.get('liteMode', false);
	if (!enabled) {
		const confirm = await vscode.window.showInformationMessage(
			vscode.l10n.t('Lite Workspace Mode excludes common generated folders from search and file watching, hides selected editor decorations, and limits open tabs. Review these workspace settings after applying.'),
			{ modal: true }, vscode.l10n.t('Enable Lite Mode')
		);
		if (confirm !== vscode.l10n.t('Enable Lite Mode')) {
			return;
		}
		const previous = {};
		for (const key of Object.keys(liteSettings)) {
			previous[key] = vscode.workspace.getConfiguration().inspect(key)?.workspaceValue;
		}
		await context.workspaceState.update('liteModePreviousSettings', previous);
		for (const [key, value] of Object.entries(liteSettings)) {
			await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Workspace);
		}
		await configuration.update('liteMode', true, vscode.ConfigurationTarget.Workspace);
		void vscode.window.showInformationMessage(vscode.l10n.t('Lite Workspace Mode is on.'));
		return;
	}
	const previous = context.workspaceState.get('liteModePreviousSettings', {});
	for (const key of Object.keys(liteSettings)) {
		await vscode.workspace.getConfiguration().update(key, previous[key], vscode.ConfigurationTarget.Workspace);
	}
	await configuration.update('liteMode', undefined, vscode.ConfigurationTarget.Workspace);
	await context.workspaceState.update('liteModePreviousSettings', undefined);
	void vscode.window.showInformationMessage(vscode.l10n.t('Lite Workspace Mode is off.'));
}

async function createStarterProject() {
	const selected = await vscode.window.showQuickPick([
		{ label: vscode.l10n.t('TypeScript + Node.js'), id: 'typescript' },
		{ label: vscode.l10n.t('Python'), id: 'python' },
		{ label: vscode.l10n.t('Rust'), id: 'rust' }
	], { title: vscode.l10n.t('Choose a Starter Kit') });
	if (!selected) {
		return;
	}
	const folder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: vscode.l10n.t('Choose Project Parent Folder') });
	if (!folder?.length) {
		return;
	}
	const name = await vscode.window.showInputBox({ title: vscode.l10n.t('Name Your Project'), value: 'my-project', validateInput: value => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) ? undefined : vscode.l10n.t('Use letters, numbers, dots, dashes, or underscores.') });
	if (!name) {
		return;
	}
	const project = vscode.Uri.joinPath(folder[0], name);
	try {
		if ((await vscode.workspace.fs.readDirectory(project)).length > 0) {
			void vscode.window.showWarningMessage(vscode.l10n.t('The folder {0} is not empty. Choose another project name to avoid replacing files.', project.fsPath));
			return;
		}
	} catch {
		// The project folder does not exist yet.
	}
	try {
		await vscode.workspace.fs.createDirectory(project);
		const files = starterFiles(selected.id, name);
		for (const [relativePath, content] of Object.entries(files)) {
			const uri = vscode.Uri.joinPath(project, relativePath);
			await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
			await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
		}
		const open = await vscode.window.showInformationMessage(vscode.l10n.t('Created {0} starter project at {1}.', selected.label, project.fsPath), vscode.l10n.t('Open Project'));
		if (open) {
			await vscode.commands.executeCommand('vscode.openFolder', project, true);
		}
	} catch (error) {
		void vscode.window.showErrorMessage(vscode.l10n.t('Could not create starter project: {0}', error.message));
	}
}

function starterFiles(kind, name) {
	if (kind === 'typescript') {
		return {
			'package.json': JSON.stringify({ name: name.toLowerCase(), version: '1.0.0', private: true, scripts: { build: 'tsc', start: 'node dist/index.js' }, devDependencies: { typescript: '^5.0.0' } }, null, 2) + '\n',
			'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', rootDir: 'src', outDir: 'dist', strict: true }, include: ['src/**/*.ts'] }, null, 2) + '\n',
			'src/index.ts': "console.log('Hello from VsSodium!');\n",
			'README.md': '# ' + name + '\n\nInstall dependencies with `npm install`, then run `npm start`.\n'
		};
	}
	if (kind === 'python') {
		return {
			'main.py': "def main():\n    print('Hello from VsSodium!')\n\nif __name__ == '__main__':\n    main()\n",
			'README.md': '# ' + name + '\n\nRun with `python main.py`.\n',
			'.gitignore': '__pycache__/\n.venv/\n'
		};
	}
	return {
			'Cargo.toml': `[package]\nname = "${name.replace(/[^a-zA-Z0-9_-]/g, '-')}"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n`,
		'src/main.rs': 'fn main() {\n    println!("Hello from VsSodium!");\n}\n',
		'README.md': '# ' + name + '\n\nBuild and run with `cargo run`.\n'
	};
}

function deactivate() { }

module.exports = { activate, deactivate };
