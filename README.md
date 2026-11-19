# VsSodium

VsSodium is an independent, open-source code editor built from the Code - OSS source tree. It keeps the familiar editing, debugging, and extension workflow while adding a VsSodium identity and a set of custom editor features.

VsSodium is not affiliated with or endorsed by Microsoft. Visual Studio Code and related names are Microsoft trademarks. The upstream source and license notices are included in this repository.

## Features

- **VsSodium themes:** Light, Dark, Violet, Crimson, Aurora, and Ember color themes.
- **VsSodium file icons:** A dedicated icon theme for common programming languages and file types.
- **SVG source tools:** Editable SVG text files with syntax highlighting, snippets, and a command to show the source beside the image preview.
- **Optional Discord Rich Presence:** Share editor activity with the Discord desktop app. It is off by default, and file names are hidden by default. See the [setup guide](extensions/vssodium-discord-rpc/README.md).
- **Extensions:** Browse and install extensions through the Open VSX Registry.
- **Code - OSS editor features:** Editing, navigation, debugging, and workspace features from the upstream open-source codebase.

## Download and install

Check the [VsSodium Releases page](https://github.com/CrimsonBlood723/VsSodium/releases) for published installers. For Windows, download the VsSodium installer, run it, and follow the setup prompts. If no release is listed yet, a public installer has not been published.

## Build from source

Use the Node.js version listed in [`.nvmrc`](.nvmrc) and the pnpm version pinned in [`package.json`](package.json). The project uses pnpm; npm and Yarn are not supported for installing the repository dependencies.

From the repository root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run compile
```

To launch the development build on Windows:

```powershell
.\scripts\code.bat
```

On macOS or Linux, launch it with:

```sh
./scripts/code.sh
```

### Build a Windows x64 user installer

Run these commands from the repository root:

```powershell
corepack pnpm run gulp vscode-win32-x64
corepack pnpm run gulp vscode-win32-x64-user-setup
```

The installer is created under `.build/win32-x64/user-setup/`. The upstream packaging task names it `VSCodeSetup.exe`; rename it to `VsSodium Installer.exe` before sharing if you want the VsSodium-branded filename. Local builds are unsigned unless Windows signing has been configured.

## Report an issue or contribute

Report VsSodium-specific bugs and feature requests in [GitHub Issues](https://github.com/CrimsonBlood723/VsSodium/issues). Include your VsSodium version, Windows/macOS/Linux version, steps to reproduce, and any error text. Contributions can be submitted as pull requests to this repository.

## License and upstream acknowledgements

VsSodium is based on the open-source Code - OSS project. This repository includes the upstream MIT license and copyright notice in [`LICENSE.txt`](LICENSE.txt), along with third-party notices for bundled components. Please retain the applicable notices when redistributing builds.
