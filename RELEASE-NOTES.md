# Mole Office 0.1.0-beta.9: release notes

This is a beta release. Some parts do not work yet. The section "What does not work yet", near the end
of these notes, lists them.

## What Mole Office is

Mole Office is a project office for people and agents. An agent is an AI tool that works on a project,
such as Claude Code, Codex or OpenCode. Mole Office keeps a project's plans, work, decisions, findings and
reports, and the history of each. So the next agent or person can carry on from where the last one
stopped, instead of working everything out again.

Mole Office keeps your work in one data folder on your own computer. The folder holds a SQLite
database, the backups Mole Office makes of it, and the files people attach. "Where your data is", below,
names the folder on each system. The [README](README.md) says more about what Mole Office does.

## Download the installers

The installers for Linux, Windows and the Mac are on the [Releases page](../../releases). "Install",
below, says how to install each one.

## Build the installers

The folder these notes are in holds the source code of Mole Office. You can also build the installers
from it yourself.

You need Node 22, at version 22.18 or later, and npm. The build loads TypeScript files, and Node 22 does
that from 22.18 on. The Mac build refuses any Node other than Node 22.

You also need a network connection. The build downloads the npm packages, the Chromium browser, Electron
and the programs that make the installers. `npm run package:linux` and `npm run package:windows` keep
what they download in a cache folder in your home folder.

| Installer | Built on | You also need |
|---|---|---|
| Linux: a .deb and an AppImage | Linux, on an x64 or arm64 processor | `ar`, from binutils, and `dpkg-deb` |
| Windows: one setup program | Linux, on an x64 processor | nothing more |
| Mac: a .dmg and a .zip | a Mac with Apple silicon | Apple's tools and a certificate, below |

To build the Linux and Windows installers, run these steps in this folder, in this order:

```bash
npm ci
npm run build
PLAYWRIGHT_BROWSERS_PATH=0 node node_modules/playwright/cli.js install chromium
npm run package:linux
npm run package:windows
```

1. `npm ci` installs the packages that `package-lock.json` names.
2. `npm run build` checks the types and builds the pages.
3. The third line installs the Chromium browser into the `node_modules` folder here. `npm ci` does not
   install Chromium. Before a package script builds anything, it runs the tests that the project marks
   as privacy tests. Some of these tests start Chromium. When Chromium is missing or cannot start, the
   package script stops and builds nothing. It then says how to install Chromium.
4. `npm run package:linux` makes the Linux installers. It also makes the bundle, so you do not run
   `npm run bundle` yourself. When Electron's runtime is not in `node_modules` yet, the script puts it
   in, and says so.
5. `npm run package:windows` makes the Windows installer. It checks every file it downloads against a
   fixed hash. It stops when a file does not match. It also stops on any computer that is not Linux on
   x64, and says why. So on an arm64 computer, run only the Linux script.

The installers go into `dist/installers` here. To put them in another folder, add
`-- --out <folder>` to a package script. On an x64 computer the files are these, where `<version>` is the
version in the first line of these notes:

- `mole-office-<version>-amd64.deb`, the office for Ubuntu and Debian;
- `mole-office-map-<version>-amd64.deb`, the office map. The office map is an extra part that draws
  the office's people, agents and work as a map, and changes nothing. It needs the office's .deb of the
  same version;
- `mole-office-<version>-x86_64.AppImage`, the office in one file, without the map;
- `mole-office-<version>-x64-setup.exe`, the office for Windows.

On an arm64 computer, the processor part of each Linux file name is different. These notes do not
list those names, because they were not checked for this release.

**The Mac.** The Mac app has steps of its own. On a Mac with Apple silicon, run this one command in
this folder:

```bash
node scripts/build-on-a-mac.mjs
```

It needs Node 22 at 22.18 or later, Apple's command-line tools, and one Developer ID Application
certificate in the keychain. To notarise the app, it also needs a keychain profile named
`mole-office-notary`. It checks each of these before it builds anything. When one is missing, it stops
and says which one. Then it runs `npm ci`, puts in Electron's runtime and Chromium, and runs
`npm run build`. Last, it makes two apps in `dist/mac`, each signed and notarised, as a `.dmg` and a
`.zip`. One is `mole-office-<version>-arm64`, without the office map. The other is
`mole-office-<version>-arm64-with-the-map`. To sign the apps for your own Mac only, without notarising,
add `--local` to the command. On Linux or Windows, `npm run package:mac` stops, says
"This builds the Mac app, and it needs a Mac.", and builds nothing.

## Install

[The beta guide](docs/beta/for-your-ai.md) describes each install step in more detail.

### Linux: the .deb, for Ubuntu and Debian

The .deb installs Mole Office into `/opt/mole-office` and adds **Mole Office** to the app menu. It needs
your administrator password once. In the folder that holds the .deb, run:

```bash
sudo apt install ./mole-office-<version>-amd64.deb
```

To install the office map as well, name its .deb in the same command, after the office's .deb. The two
must be of the same version.

An update first stops every running Mole Office installed in `/opt/mole-office`, for every user of the
computer. It changes no file until they have stopped. Every terminal that Mole Office held closes too.
When the update has finished, open **Mole Office** from the app menu again. If an office does not stop,
the update installs nothing. Lines that begin `Mole Office:` then say whose office did not stop.

### Linux: the AppImage

The AppImage is one file that runs without being installed, and it needs no administrator password. It
has no office map, and none can be added to it. In the folder that holds it, run:

```bash
chmod +x ./mole-office-<version>-x86_64.AppImage
./mole-office-<version>-x86_64.AppImage
```

The AppImage needs no FUSE library on the computer. If it still stops at once with a message about
FUSE, [the beta guide](docs/beta/for-your-ai.md) says how to run it unpacked instead.

Some systems, Ubuntu 24.04 among them, do not allow Chromium's sandbox. On such a system the AppImage
starts its window without the sandbox. The window then first shows a warning headed "This window runs
without Chromium's sandbox". The warning says what the sandbox is for, and how to turn it on. To go on,
press **Open Mole Office**.

### Windows

The installer installs Mole Office for you alone, and never asks for an administrator.

1. Open `mole-office-<version>-x64-setup.exe` with a double click.
2. The installer is not signed yet, so Windows may warn about it. In English the warning is usually
   "Windows protected your PC". Press **More info**, then **Run anyway**.
3. On a first install, choose the folder to install into. The folder offered,
   `%LOCALAPPDATA%\Programs\mole-office`, is fine. The installer does not accept a folder that already
   holds other files. It does not accept the data folder, or a folder inside it, either.
4. On a first install, the next page asks for the data folder. The folder offered,
   `%APPDATA%\mole-office`, is fine. You can move it later, in **Settings**.
5. A later page has one box, **Office map**. Tick it to install the office map. On a first install the
   box is not ticked.
6. The installer adds **Mole Office** to the Start menu and the Desktop. It opens Mole Office when it
   has finished.

An update skips the folder pages, and installs into the folder already in use.

### Mac

Open the .dmg, and drag **Mole Office** onto **Applications**. Then open Mole Office from
**Applications**, not from the disk image. A notarised build needs no change in System Settings to open.

### The first start

The first page is titled **Welcome to Mole Office**. Choose the language of the pages, and type your
name. Then press **Open my office**.

### Where your data is

- Linux: `~/.config/mole-office`. When `XDG_CONFIG_HOME` is set, the folder is `mole-office` in it.
- Windows: the folder you chose on the data page. The folder offered is `%APPDATA%\mole-office`.
- Mac: `~/Library/Application Support/mole-office`.

### After an update

A newer version may first have to update its database. It never does that by itself. The window
opens on a page titled **Mole Office needs to update its database**, with a button **Back up and
update**. When you press it, Mole Office first makes a backup of your records and checks it, and then
updates them. It never deletes that backup.

## What does not work yet

- No npm package has been published. To run Mole Office from the tree for development, follow the
  README's [Running it](README.md#running-it) section.
- The Linux and Windows installers are not signed. Windows warns about its installer, as step 2 of the
  Windows install says.
- On Linux, the app is set to check that its own files were not changed, but that check protects
  nothing yet. Signing the Linux app is left for a later release.
- The Windows installer can be built only on Linux on an x64 processor. The installer does not run on
  Linux, so it can be tried only by installing it on Windows.
- The Mac app can be built only on a Mac with Apple silicon, with an Apple Developer ID certificate.
- Installing, adding and removing the office map has not yet been tried on a real computer, on Linux,
  Windows or the Mac.
- The AppImage has no office map.
- There is no login with a password. Your window acts as you with a key kept on your computer. Any
  program on your computer that can read that key can act as you too. So the records say who did what,
  but they cannot prove that you did it and not such a program.
- Some pages are in English only, such as the update page and the Windows installer's own messages.
- Nothing in the README's section "What is being built toward" is finished yet.

## Licence

The licence is in [LICENSE](LICENSE).
