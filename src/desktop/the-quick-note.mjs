// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A QUICK NOTE FROM ANY PROGRAM: THE KEY, AND THE WINDOW IT OPENS (wave 13t, round W45, option C of quick notes).
 * Apart from Electron, so a test on Linux can stand the platform in as any system.
 *
 * A press of the key, or of the tray's New quick note, opens a new note window on the office the window
 * shows: a small window that stays on top of other windows and shows the office's note page
 * (src/config/the-quick-note-address.mjs). Each press opens one note in a window of its own. A note window
 * closes at once, with no question, because the page saves as the person writes. 13y builds the page.
 *
 * ONLY FOR AN OFFICE THAT HAS THE NOTE PAGE. The window puts New quick note in its tray, and asks the system for
 * the key, only once an office page it shows has said that its office has the note page
 * (THE_PAGE_SAYS.itHasTheQuickNotePage in src/config/the-window-mark.mjs). Until then the tray has no such item,
 * the key is left to other programs, and an ask from the office page opens nothing, so no note shows a page the
 * office does not know. The page answers from the build it was served from, which is the build a note window
 * loads. The window keeps the answer until it closes, so an office that loses the page while the window runs
 * is not noticed.
 *
 * WHY THE PAGE SAYS IT, AND NOT AN ANSWER FROM THE SERVER. A door that answers which pages the office has
 * would be a new door on the server, and the server can answer from a newer build than the page it serves.
 *
 * THE KEY ON EACH SYSTEM, each on none of its system's own lists of shortcuts (read on 7 November 2026):
 *   - Linux: Ctrl+Alt+N. GNOME's help page of shortcuts has none with N, and its Ctrl+Alt ones are Tab,
 *     Delete and Shift+R. KDE Plasma's own list could not be read. On Linux AltGr is a key of its own, so
 *     Ctrl+Alt+N takes no character away.
 *   - Windows: Windows+Shift+N. Windows' list has Windows+N, Ctrl+N and Ctrl+Shift+N, and no Windows+Shift+N.
 *     Ctrl+Alt is not used on Windows, because Windows sends AltGr as Ctrl+Alt, so on a Polish keyboard
 *     Ctrl+Alt+N would take away the letter ń.
 *   - The Mac: Shift+Option+Command+N. Apple's list has Command-N, Shift-Command-N, Control-Command-N and
 *     Option-Command-N, and no Shift-Option-Command-N.
 * A program may take one of these keys for itself. Then the system refuses it to Mole Office, the tray says
 * the key is not set, and the tray's New quick note still opens a note. The key has been pressed only on Linux
 * under X, in cases 7 and 8 of tests/the-window-finds-its-office.test.ts. On a Wayland desktop, on Windows and
 * on the Mac it has not been pressed yet.
 */

/**
 * THE QUICK-NOTE KEY ON EACH SYSTEM: Electron's name for it, and the name its system shows a person.
 *
 * @type {Readonly<Record<'linux' | 'win32' | 'darwin', { accelerator: string, said: string }>>}
 */
export const THE_QUICK_NOTE_KEYS = {
  linux: { accelerator: 'Control+Alt+N', said: 'Ctrl+Alt+N' },
  win32: { accelerator: 'Super+Shift+N', said: 'Windows+Shift+N' },
  darwin: { accelerator: 'Shift+Alt+Command+N', said: '⇧⌥⌘N' },
}

/**
 * The quick-note key on this system: Windows' on Windows, the Mac's on a Mac, and Linux's elsewhere.
 *
 * @param {NodeJS.Platform} platform
 */
export function theQuickNoteKey(platform) {
  return THE_QUICK_NOTE_KEYS[platform === 'win32' || platform === 'darwin' ? platform : 'linux']
}

/**
 * What the window's log says when a note is asked for before an office page has said its office has the note
 * page. Only the office page's own line can ask then, because the tray has no New quick note and the key is not
 * taken. No note opens.
 */
export const A_NOTE_ASKED_FOR_WITHOUT_THE_NOTE_PAGE =
  'A quick note was asked for, but no office page has said that its office has the note page, so no note opened.'

/** The size a note window opens at. The person may make it bigger or smaller. */
export const A_NOTE_WINDOWS_SIZE = { width: 420, height: 520 }

/** The note window, as the step after it is made is told: it keeps no menu row. */
export const THE_NOTE_WINDOW = 'note'

/** The main window, as the same step is told: it keeps the menu row it has today. */
export const THE_MAIN_WINDOW = 'main'

/**
 * THE OPTIONS A NOTE WINDOW IS MADE WITH. The window is the note's own: it stays on top of other
 * windows, it is shown at once, and it can draw the note page because its web preferences keep the
 * page away from Node. No auto-hide option is set: the menu row is there after construction, and
 * the step below takes it off.
 *
 * @param {{ title: string, icon: import('electron').NativeImage }} parts
 * @returns {import('electron').BrowserWindowConstructorOptions}
 */
export function theQuickNoteWindowOptions({ title, icon }) {
  return {
    ...A_NOTE_WINDOWS_SIZE,
    alwaysOnTop: true,
    title,
    icon,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  }
}

/**
 * THE STEP AFTER A WINDOW IS MADE THAT GIVES IT THE MENU ROW IT SHOULD HAVE.
 *
 * Electron's default menu is each window's own top menu. The note window is 420 by 520 and stays on
 * top, so it keeps no row for menus a note does not need. `removeMenu()` is Electron's call for
 * that, documented as "Remove the window's menu bar." and marked Linux and Windows only. A bar that
 * is removed is not there to bring back, so Alt shows nothing: this is not `autoHideMenuBar`, where
 * the docs say "users can still bring up the menu bar by pressing the single `Alt` key".
 *
 * THE MAIN WINDOW KEEPS THE ROW. On a Mac there is no row in a window at all: the menu is the
 * screen's top bar, one for the whole application, and `removeMenu()` is not a Mac call, so nothing
 * changes.
 *
 * @param {{ removeMenu: () => void }} window
 * @param {'note' | 'main'} which
 * @param {NodeJS.Platform} platform
 */
export function giveTheWindowItsMenuRow(window, which, platform) {
  if (which === THE_NOTE_WINDOW && platform !== 'darwin') window.removeMenu()
}

/**
 * THE NOTE WINDOWS OPEN NOW, as the window's state lists them: each one's page, whether it stays on top, and
 * whether it is shown. A note window Electron has destroyed is left out. A closing window has been seen destroyed
 * a moment before its 'closed' event, and a destroyed window throws when it is asked anything, so the set the
 * window keeps may still hold one in that moment.
 *
 * @param {Iterable<{ isDestroyed: () => boolean, webContents: { getURL: () => string }, isAlwaysOnTop: () => boolean, isVisible: () => boolean }>} notes
 * @returns {{ url: string, onTop: boolean, visible: boolean }[]}
 */
export function theNotesOpen(notes) {
  return [...notes]
    .filter((note) => !note.isDestroyed())
    .map((note) => ({ url: note.webContents.getURL(), onTop: note.isAlwaysOnTop(), visible: note.isVisible() }))
}
