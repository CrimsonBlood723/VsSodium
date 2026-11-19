# VsSodium Discord Rich Presence

VsSodium can show a small coding status in the Discord desktop app. It does not connect to Discord's servers directly; it sends the activity to the Discord client running on this computer.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), name it **VsSodium**, and copy its Application ID.
2. In that application's Rich Presence art assets, upload `resources/vssodium/icon.png` from this repository with the asset key `vssodium`.
3. In VsSodium, run **Configure Discord Rich Presence** from the Command Palette and paste the Application ID.
4. Leave the Discord desktop app running. If Discord activity sharing is disabled in your privacy settings, enable it there too.

The default status shares only generic VsSodium activity and uses the `vssodium` art asset. If you name your uploaded asset differently, change `vssodium.discordRichPresence.iconAssetKey` to match. File names are hidden by default; turn on `vssodium.discordRichPresence.showFileName` only if you want Discord to show the active file's name. Run **Toggle Discord Rich Presence** to turn sharing off.
