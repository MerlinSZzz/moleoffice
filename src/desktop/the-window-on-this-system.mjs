// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE WINDOW DOES DIFFERENTLY ON A MAC (wave 13t, round 20), apart from Electron so a test on Linux
 * can stand the platform in as darwin and read every answer.
 *
 * Three things, each from round 18's list:
 *   - THE MENU-BAR PICTURE. macOS draws a menu-bar picture in the bar's own colour when the picture is a
 *     template: black with transparency, named ending in Template. The colour logo the tray shows on Linux
 *     would stay a coloured square in a dark menu bar. src/desktop/mole-office-trayTemplate.png and its @2x
 *     twin are the logo's dark lines, made from src/web/logo/mole-office-tab-16.png and -32.png.
 *   - THE DOCK. Closing the window hides it, as on Linux. A Mac user then clicks the Dock icon to get it
 *     back, and Electron says so with the app's `activate` event; without a listener the click does nothing.
 *   - OPEN AT LOGIN: Electron's own login item, which the person also
 *     sees and can turn off in System Settings, under General, Login Items. Only the Electron program can
 *     set it, so it is an item of the menu-bar menu. It is offered only by an installed app, because from a
 *     checkout the item would start Electron itself at login, not Mole Office.
 *
 * OPEN AT LOGIN ON WINDOWS TOO (round W12). In the beta, an office on Windows runs from the person's
 * sign-in to their sign-out, with no administrator step. The same item of the tray's menu, from an
 * installed app, sets Electron's login item, which on Windows is a value of the person's own Run key in
 * the registry. Windows lists such a value in its Startup apps, where the person can turn it off without
 * removing it. Electron's documentation says that its `openAtLogin` does not ask whether the value is
 * turned off, and that its `executableWillLaunchAtLogin` does. So on Windows the tick follows the second
 * (`isSetToOpenAtLogin`). None of this has run on Windows yet.
 *
 * Linux is unchanged: the colour picture, no Dock, and start at login through the page's press, on Settings
 * and on Terminal management (src/config/start-at-login.mjs).
 */

import { join } from 'node:path'

/**
 * The picture the tray or menu bar shows, and whether macOS should draw it as a template.
 *
 * @param {NodeJS.Platform} platform
 * @param {string} root the install's root, or the checkout's
 * @returns {{ path: string, template: boolean }}
 */
export function theTrayPicture(platform, root) {
  if (platform === 'darwin') return { path: join(root, 'src', 'desktop', 'mole-office-trayTemplate.png'), template: true }
  return { path: join(root, 'src', 'web', 'logo', 'mole-office-tab-32.png'), template: false }
}

/**
 * Whether the menu offers Open at login: on a Mac and on Windows, from an installed app.
 *
 * @param {NodeJS.Platform} platform
 * @param {boolean} packaged Electron's `app.isPackaged`
 */
export function offersOpenAtLogin(platform, packaged) {
  return (platform === 'darwin' || platform === 'win32') && packaged
}

/**
 * Whether the item is ticked, from what Electron says of the login item. On Windows, whether the program
 * will start at sign-in: false when the Run key's value is there but turned off in Windows' Startup apps.
 *
 * @param {NodeJS.Platform} platform
 * @param {{ openAtLogin: boolean, executableWillLaunchAtLogin?: boolean }} said Electron's `app.getLoginItemSettings()`
 */
export function isSetToOpenAtLogin(platform, said) {
  return platform === 'win32' ? said.executableWillLaunchAtLogin === true : said.openAtLogin
}

/**
 * The tray's items, in the order the menu shows them.
 *
 * NEW QUICK NOTE (round W45) comes after Open, once an office page has said its office has the note page. Until
 * then `quickNoteKey` is null, and the tray has neither the item nor a line about its key. The quick-note key is
 * shown beside it only when the system gave the key to the window, which holds it itself
 * (src/desktop/the-quick-note.mjs), so the menu does not take it. When the system refused the key, a line under
 * the item says so and cannot be pressed.
 *
 * @param {{ trayOpen: string, trayNewNote: string, quickNoteKeyNotSet: (key: string) => string, trayRestart: string, trayShutDown: string, trayOpenAtLogin: string }} w
 * @param {{ open: () => void, newNote: () => void, restart: () => void, shutDown: () => void, openAtLogin: (on: boolean) => void }} presses
 * @param {{ platform: NodeJS.Platform, packaged: boolean, opensAtLogin: () => boolean, quickNoteKey: { accelerator: string, said: string, set: boolean } | null }} system
 */
export function theTrayItems(w, presses, system) {
  const key = system.quickNoteKey
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const items = [{ id: 'open', label: w.trayOpen, click: () => presses.open() }]
  if (key !== null) {
    items.push(
      key.set
        ? { id: 'newNote', label: w.trayNewNote, accelerator: key.accelerator, registerAccelerator: false, click: () => presses.newNote() }
        : { id: 'newNote', label: w.trayNewNote, click: () => presses.newNote() },
    )
    if (!key.set) items.push({ id: 'quickNoteKeyNotSet', label: w.quickNoteKeyNotSet(key.said), enabled: false })
  }
  items.push({ id: 'restart', label: w.trayRestart, click: () => presses.restart() })
  if (offersOpenAtLogin(system.platform, system.packaged)) {
    items.push({ id: 'openAtLogin', type: 'checkbox', label: w.trayOpenAtLogin, checked: system.opensAtLogin(), click: (item) => presses.openAtLogin(item.checked) })
  }
  items.push({ type: 'separator' }, { id: 'shutDown', label: w.trayShutDown, click: () => presses.shutDown() })
  return items
}

/**
 * Listen for what the system sends the app: on a Mac, a click on the Dock icon shows the window.
 *
 * @param {{ on: (event: 'activate', listener: () => void) => unknown }} app
 * @param {NodeJS.Platform} platform
 * @param {() => void} show
 */
export function listenToTheSystem(app, platform, show) {
  if (platform === 'darwin') app.on('activate', () => show())
}
