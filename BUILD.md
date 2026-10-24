# Building the installer (for you, not the client)

The client never needs Node, npm or any developer tools. You build once and send them the installer.

## Option A: build on your own Windows PC
1. Install Node.js (LTS) from nodejs.org.
2. In this folder run: `npm install` then `npm run dist:win`
3. Send the client `dist/IQ-Motors-POS-Setup-0.1.0.exe`.

## Option B: let GitHub build both Windows and Mac (no local setup)
1. Push this folder to a GitHub repository (branch `main`).
2. Open the repo's **Actions** tab, run **Build installers** if it did not start by itself.
3. When it finishes, download the `installer-windows-latest` (.exe) and `installer-macos-latest` (.dmg) artifacts.

## What the client does
- **Windows:** double-click the `.exe`. It installs and puts an "IQ Motors POS" icon on the desktop. Windows may show a blue "unknown publisher" warning the first time: click **More info → Run anyway**.
- **Mac:** open the `.dmg`, drag the app to Applications, then right-click the app → **Open** the first time.
- First run: open **Settings**, enter the Gmail address and app password once, then press **Test email login**.

The installer has everything inside it. The Mercedes login window will use the app's built-in browser, so no separate browser needs installing.
