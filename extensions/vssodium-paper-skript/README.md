# VsSodium Paper Skript

This built-in extension adds syntax highlighting and snippets for `.sk` scripts used by the Skript plugin on Paper servers. It also includes a visual block builder that writes generated Skript into the open `.sk` editor.

## Use the Block Builder

1. Open or create a `.sk` file inside a workspace folder.
2. Run **VsSodium Skript: Open Skript Block Builder** from the Command Palette or the editor title button.
3. Add event, control, player, variable, or world blocks. Edit the fields and drag blocks to reorder them.
4. Choose **Apply to .sk File** and confirm. The generated text is inserted into the editor and can be undone; save it before loading it on your Paper server.

The built-in blocks cover common events, commands, repeating tasks, conditions, loops, messages, item grants, teleports, variables, waits, and event cancellation. The builder creates Skript text; the Paper server's installed Skript version and addons still determine which effects and expressions are available.

## Add a Custom Block

Run **VsSodium Skript: Create Custom Skript Block** in a `.sk` file. Enter a block name and a one-line Skript template. Use placeholders such as `{{message}}` or `{{target}}` for editable fields. Definitions are stored in `.vssodium/skript-blocks.json` in the workspace and can be edited there.
