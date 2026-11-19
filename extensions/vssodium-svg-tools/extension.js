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
		await vscode.window.showTextDocument(document, {
			viewColumn: vscode.ViewColumn.One,
			preview: false
		});
		await vscode.commands.executeCommand('vscode.openWith', uri, 'imagePreview.previewEditor', vscode.ViewColumn.Beside);
	}));
}

function deactivate() { }

module.exports = { activate, deactivate };
