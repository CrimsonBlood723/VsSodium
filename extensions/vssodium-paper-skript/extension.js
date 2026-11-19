/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const vscode = require('vscode');
const crypto = require('crypto');
const customBlocksFile = '.vssodium/skript-blocks.json';

const blocks = [
	{ id: 'join', label: 'Player Joins', category: 'Events', color: '#4c9f70', template: 'on join:\n\t{{body}}', defaults: { body: 'send "&aWelcome to the server!" to player' } },
	{ id: 'quit', label: 'Player Leaves', category: 'Events', color: '#4c9f70', template: 'on quit:\n\t{{body}}', defaults: { body: 'broadcast "&7%player% left the server."' } },
	{ id: 'chat', label: 'Player Chats', category: 'Events', color: '#4c9f70', template: 'on chat:\n\t{{body}}', defaults: { body: 'set message format to "&7%player%: %message%"' } },
	{ id: 'command', label: 'Player Command', category: 'Events', color: '#4c9f70', template: 'command /{{name}}:\n\ttrigger:\n\t\t{{body}}', defaults: { name: 'hello', body: 'send "&aHello!" to player' } },
	{ id: 'every', label: 'Repeating Task', category: 'Events', color: '#4c9f70', template: 'every {{interval}}:\n\t{{body}}', defaults: { interval: '1 minute', body: 'broadcast "&eA minute has passed!"' } },
	{ id: 'if', label: 'If Condition', category: 'Control', color: '#c18c3b', template: 'if {{condition}}:\n\t{{body}}', defaults: { condition: 'player has permission "example.use"', body: 'send "&aAllowed" to player' } },
	{ id: 'else', label: 'If / Else Branch', category: 'Control', color: '#c18c3b', template: 'if {{condition}}:\n\t{{thenBody}}\nelse:\n\t{{elseBody}}', defaults: { condition: 'player has permission "example.use"', thenBody: 'send "&aAllowed" to player', elseBody: 'send "&cNot allowed" to player' } },
	{ id: 'loop', label: 'Loop Players', category: 'Control', color: '#c18c3b', template: 'loop all players:\n\t{{body}}', defaults: { body: 'send "Hello %loop-player%!" to loop-player' } },
	{ id: 'send', label: 'Send Message', category: 'Players', color: '#4d83bd', template: 'send "{{message}}" to {{target}}', defaults: { message: '&aHello!', target: 'player' } },
	{ id: 'broadcast', label: 'Broadcast Message', category: 'Players', color: '#4d83bd', template: 'broadcast "{{message}}"', defaults: { message: '&eServer announcement' } },
	{ id: 'give', label: 'Give Item', category: 'Players', color: '#4d83bd', template: 'give {{amount}} {{item}} to {{target}}', defaults: { amount: '1', item: 'diamond', target: 'player' } },
	{ id: 'teleport', label: 'Teleport Player', category: 'Players', color: '#4d83bd', template: 'teleport {{target}} to {{location}}', defaults: { target: 'player', location: 'location of player' } },
	{ id: 'setvar', label: 'Set Variable', category: 'Variables', color: '#a66ab3', template: 'set {vssodium::{{variable}}} to {{value}}', defaults: { variable: 'example', value: '1' } },
	{ id: 'wait', label: 'Wait', category: 'World', color: '#558c91', template: 'wait {{duration}}', defaults: { duration: '1 second' } },
	{ id: 'cancel', label: 'Cancel Event', category: 'World', color: '#558c91', template: 'cancel event', defaults: {} }
];

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('vssodium.skript.openBlockBuilder', openBlockBuilder),
		vscode.commands.registerCommand('vssodium.skript.createCustomBlock', createCustomBlock)
	);
}

async function openBlockBuilder() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'skript' || !editor.document.fileName.toLowerCase().endsWith('.sk')) {
		void vscode.window.showWarningMessage(vscode.l10n.t('Open a .sk Skript file before starting the block builder.'));
		return;
	}
	const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
	if (!folder) {
		void vscode.window.showWarningMessage(vscode.l10n.t('Save the Skript file inside an open workspace to use the block builder.'));
		return;
	}
	const customBlocks = await readCustomBlocks(folder);
	const panel = vscode.window.createWebviewPanel(
		'vssodium.paperSkriptBuilder',
		vscode.l10n.t('Skript Block Builder'),
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
		{ enableScripts: true, enableCommandUris: false, localResourceRoots: [] }
	);
	panel.webview.html = getBuilderHtml(panel.webview, customBlocks);
	panel.webview.onDidReceiveMessage(async message => {
		if (message.type !== 'apply' || typeof message.text !== 'string') {
			return;
		}
		const confirm = await vscode.window.showWarningMessage(
			vscode.l10n.t('Replace the contents of {0} with the blocks you built? The editor change can be undone.', vscode.workspace.asRelativePath(editor.document.uri)),
			{ modal: true },
			vscode.l10n.t('Replace File')
		);
		if (!confirm) {
			return;
		}
		const document = await vscode.workspace.openTextDocument(editor.document.uri);
		const textEditor = await vscode.window.showTextDocument(document, { viewColumn: editor.viewColumn, preview: false });
		const lastPosition = document.positionAt(document.getText().length);
		const applied = await textEditor.edit(edit => edit.replace(new vscode.Range(new vscode.Position(0, 0), lastPosition), message.text));
		if (applied) {
			void vscode.window.showInformationMessage(vscode.l10n.t('Skript blocks were added to the editor. Save the file to update it on your Paper server.'));
		} else {
			void vscode.window.showErrorMessage(vscode.l10n.t('Could not update the Skript editor.'));
		}
	});
}

async function createCustomBlock() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'skript') {
		void vscode.window.showWarningMessage(vscode.l10n.t('Open a Skript file in a workspace before creating a custom block.'));
		return;
	}
	const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
	if (!folder) {
		return;
	}
	const label = await vscode.window.showInputBox({ title: vscode.l10n.t('Name Your Custom Block'), prompt: vscode.l10n.t('This name appears in the builder palette.'), validateInput: value => value.trim() ? undefined : vscode.l10n.t('Enter a block name.') });
	if (!label) {
		return;
	}
	const template = await vscode.window.showInputBox({
		title: vscode.l10n.t('Enter a Skript Template'),
		prompt: vscode.l10n.t('Use {{fieldName}} for editable fields, for example: send "{{message}}" to {{target}}'),
		validateInput: value => value.trim() ? undefined : vscode.l10n.t('Enter a Skript line or template.')
	});
	if (!template) {
		return;
	}
	const customBlocks = await readCustomBlocks(folder);
	const id = `custom-${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	const definition = { id, label: label.trim(), category: 'Custom', color: '#bd6b56', template: template.trim() };
	const existingIndex = customBlocks.findIndex(block => block.id === id);
	if (existingIndex >= 0) {
		customBlocks[existingIndex] = definition;
	} else {
		customBlocks.push(definition);
	}
	const target = vscode.Uri.joinPath(folder.uri, customBlocksFile);
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(target, '..'));
	await vscode.workspace.fs.writeFile(target, Buffer.from(`${JSON.stringify(customBlocks, null, 2)}\n`, 'utf8'));
	void vscode.window.showInformationMessage(vscode.l10n.t('Saved custom block "{0}". Reopen the block builder to use it.', definition.label));
}

async function readCustomBlocks(folder) {
	try {
		const uri = vscode.Uri.joinPath(folder.uri, customBlocksFile);
		const parsed = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
		if (Array.isArray(parsed)) {
			return parsed.filter(block => block && typeof block.id === 'string' && typeof block.label === 'string' && typeof block.template === 'string' && block.category === 'Custom');
		}
	} catch {
		// No custom block file has been created yet.
	}
	return [];
}

function getBuilderHtml(webview, customBlocks) {
	const nonce = crypto.randomBytes(16).toString('hex');
	const allBlocks = [...blocks, ...customBlocks];
	const safeJson = JSON.stringify(allBlocks).replace(/</g, '\\u003c');
	const text = value => vscode.l10n.t(value);
	const ui = {
		title: text('Skript Block Builder'),
		palette: text('Block Palette'),
		workspace: text('Build Your Skript'),
		drag: text('Drag blocks to reorder them. Edit each block’s fields, then apply the generated script to the open .sk file.'),
		apply: text('Apply to .sk File'),
		clear: text('Clear Blocks'),
		add: text('Add'),
		remove: text('Remove'),
		empty: text('Add blocks from the palette to start building.')
	};
	return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ui.title}</title><style nonce="${nonce}">
		:root{color-scheme:dark;--surface:var(--vscode-sideBar-background);--panel:var(--vscode-editorWidget-background);--border:var(--vscode-widget-border);--text:var(--vscode-foreground);--muted:var(--vscode-descriptionForeground);--accent:var(--vscode-button-background)}*{box-sizing:border-box}body{margin:0;color:var(--text);background:var(--surface);font:13px var(--vscode-font-family, sans-serif)}header{position:sticky;top:0;z-index:2;padding:14px 18px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}h1{font-size:16px;margin:0;font-weight:600}.actions{display:flex;gap:8px}button{border:1px solid var(--border);border-radius:4px;color:var(--text);background:var(--panel);padding:7px 10px;cursor:pointer;font:inherit}button:hover{filter:brightness(1.14)}button.primary{background:var(--accent);color:var(--vscode-button-foreground);border-color:transparent}.layout{display:grid;grid-template-columns:minmax(210px,280px) minmax(320px,1fr);min-height:calc(100vh - 54px)}aside{padding:16px;border-right:1px solid var(--border)}main{padding:16px 20px;min-width:0}.section-title{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin:0 0 12px}.hint{color:var(--muted);line-height:1.5;margin:0 0 16px}.category{margin:18px 0 8px;color:var(--muted);font-size:12px;font-weight:600}.palette-item{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;margin:5px 0;border-left:4px solid var(--block-color);background:var(--panel)}.placed-list{display:flex;flex-direction:column;gap:10px;min-height:220px}.empty{padding:24px;border:1px dashed var(--border);border-radius:8px;color:var(--muted);text-align:center}.block{border:1px solid var(--border);border-left:5px solid var(--block-color);background:var(--panel);border-radius:6px;padding:11px 12px;box-shadow:0 2px 6px #0002}.block.dragging{opacity:.45}.block-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.block-title{font-weight:600}.block-tools{display:flex;gap:6px;align-items:center}.drag-handle{color:var(--muted);cursor:grab;font-size:16px}.block-fields{display:flex;flex-wrap:wrap;gap:8px}.field{display:flex;flex-direction:column;gap:4px;min-width:140px;flex:1;color:var(--muted);font-size:11px}.field input,.field textarea{width:100%;padding:7px 8px;border:1px solid var(--border);border-radius:4px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);font:12px var(--vscode-editor-font-family,monospace)}.field textarea{min-height:54px;resize:vertical}.builder-actions{display:flex;justify-content:flex-end;gap:8px;margin:14px 0}.custom-note{font-size:11px;line-height:1.5;color:var(--muted);margin-top:18px}@media(max-width:760px){.layout{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid var(--border)}.palette{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px}}
		</style></head><body><header><h1>${ui.title}</h1><div class="actions"><button id="clear">${ui.clear}</button><button id="apply" class="primary">${ui.apply}</button></div></header><div class="layout"><aside><h2 class="section-title">${ui.palette}</h2><p class="hint">${ui.drag}</p><div id="palette"></div><p class="custom-note">${text('Use “Create Custom Skript Block” from the Command Palette to add your own one-line blocks. Custom block templates are saved in .vssodium/skript-blocks.json.')}</p></aside><main><h2 class="section-title">${ui.workspace}</h2><div id="placed" class="placed-list"></div><div class="builder-actions"><button id="clear-bottom">${ui.clear}</button><button id="apply-bottom" class="primary">${ui.apply}</button></div></main></div><script nonce="${nonce}">
		const definitions=${safeJson};const labels=${JSON.stringify(ui)};const vscode=acquireVsCodeApi();let placed=[];let dragIndex=-1;const container=document.getElementById('placed');const palette=document.getElementById('palette');
		function fieldsOf(block){return [...block.template.matchAll(/{{\\s*([a-zA-Z0-9_]+)\\s*}}/g)].map(match=>match[1]).filter((name,index,array)=>array.indexOf(name)===index)}
		function addBlock(id){const definition=definitions.find(block=>block.id===id);if(definition){placed.push({id,values:{...(definition.defaults||{})}});renderPlaced()}}
		function renderPalette(){palette.replaceChildren();const categories=[...new Set(definitions.map(block=>block.category||'Custom'))];for(const category of categories){const heading=document.createElement('div');heading.className='category';heading.textContent=category;palette.append(heading);for(const block of definitions.filter(item=>(item.category||'Custom')===category)){const button=document.createElement('button');button.className='palette-item';button.style.setProperty('--block-color',block.color||'#bd6b56');const name=document.createElement('span');name.textContent=block.label;const add=document.createElement('span');add.textContent='+ '+labels.add;button.append(name,add);button.addEventListener('click',()=>addBlock(block.id));palette.append(button)}}}
		function renderPlaced(){container.replaceChildren();if(!placed.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=labels.empty;container.append(empty);return}placed.forEach((entry,index)=>{const definition=definitions.find(block=>block.id===entry.id);if(!definition)return;const card=document.createElement('section');card.className='block';card.draggable=true;card.style.setProperty('--block-color',definition.color||'#777');card.addEventListener('dragstart',event=>{dragIndex=index;card.classList.add('dragging');event.dataTransfer.effectAllowed='move'});card.addEventListener('dragend',()=>card.classList.remove('dragging'));card.addEventListener('dragover',event=>event.preventDefault());card.addEventListener('drop',event=>{event.preventDefault();if(dragIndex<0||dragIndex===index)return;const [moved]=placed.splice(dragIndex,1);placed.splice(index,0,moved);dragIndex=-1;renderPlaced()});const head=document.createElement('div');head.className='block-head';const title=document.createElement('span');title.className='block-title';title.textContent=definition.label;const tools=document.createElement('div');tools.className='block-tools';const handle=document.createElement('span');handle.className='drag-handle';handle.textContent='⠿';handle.title=labels.drag;const remove=document.createElement('button');remove.textContent=labels.remove;remove.addEventListener('click',()=>{placed.splice(index,1);renderPlaced()});tools.append(handle,remove);head.append(title,tools);card.append(head);const fields=document.createElement('div');fields.className='block-fields';for(const name of fieldsOf(definition)){const label=document.createElement('label');label.className='field';const caption=document.createElement('span');caption.textContent=name;const input=name==='body'?document.createElement('textarea'):document.createElement('input');input.value=entry.values[name]??'';input.addEventListener('input',()=>entry.values[name]=input.value);label.append(caption,input);fields.append(label)}card.append(fields);container.append(card)})}
		function generate(){return placed.map(entry=>{const block=definitions.find(item=>item.id===entry.id);return block.template.replace(/{{\\s*([a-zA-Z0-9_]+)\\s*}}/g,(_,name,offset)=>{const value=entry.values[name]??'';const lineStart=block.template.lastIndexOf(String.fromCharCode(10),offset)+1;const prefix=block.template.slice(lineStart,offset);return value.split(String.fromCharCode(10)).join(String.fromCharCode(10)+(prefix.trim()===''?prefix:''))})}).join('\\n\\n')+'\\n'}function clear(){placed=[];renderPlaced()}function apply(){vscode.postMessage({type:'apply',text:generate()})}
		document.getElementById('clear').addEventListener('click',clear);document.getElementById('clear-bottom').addEventListener('click',clear);document.getElementById('apply').addEventListener('click',apply);document.getElementById('apply-bottom').addEventListener('click',apply);renderPalette();renderPlaced();
		</script></body></html>`;
}

function deactivate() { }

module.exports = { activate, deactivate };
