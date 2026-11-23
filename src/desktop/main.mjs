// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STANDALONE WINDOW OF MOLE OFFICE: Electron's main process (wave 13t, piece H4).
 *
 * Criteria W2(b), W2(c), W3 and W4 of design/window/ACCEPTANCE.md. The window and the browser stay
 * as alike as possible, and the first release runs from the checkout
 * (`npm run window`), with no installer.
 *
 * WHAT IT DOES, IN ORDER:
 *   1. It takes Electron's single-instance lock. A second launch hands over to the first window and
 *      exits, so a second window never starts a second service (W2(c)).
 *   2. It reads the one declaration, src/config/settings.mjs: the database, its service lock and the
 *      port. It never chooses a database or a port of its own (W9).
 *   3. It asks what answers for this office, through the self-check (src/config/the-self-check.mjs),
 *      at the port the service lock records, or the declared port when there is no lock.
 *   4. When nothing answers, it starts the service with `mole-office start`, run by this computer's
 *      Node, and asks again (W2(b)). The service is the command's, in a process group of its own: the
 *      window is never its parent and never its owner (W8).
 *   5. It shows the answer in words on its own check page before any page of the office (W3). It
 *      opens the office only when the office this checkout declares answers. When the world it
 *      reaches is another one, or cannot be told, it says which and does not show that office as this
 *      one. When that office is unhealthy, it says why and offers to open it anyway.
 *   6. Its close button hides it to the tray, and stops nothing (W4). The tray's menu opens it,
 *      restarts the service or shuts Mole Office down, window and service.
 *   7. THE MENU'S SHUT DOWN ASKS FIRST (round W32). It shows the window's own question over whatever
 *      page the window shows (src/desktop/question.html, in a view of its own), and returns at once.
 *      Cancel removes the question and stops nothing, so the page under it is exactly as it was. Yes
 *      goes on as the press did before: when the window shows an office page, the press is handed to
 *      that page, which asks the one question its own Shutdown control asks
 *      (src/web/components/ShutDown.tsx); otherwise the window runs `mole-office stop`. When the page
 *      takes the press, the server checks who pressed and the window grants nothing. The page then
 *      writes a line to its console, and the window closes only once the office has stopped answering,
 *      its service lock has gone and `mole-office stop` finds nothing left running
 *      (src/desktop/what-the-shut-down-left.mjs), or at once when the person chose to close only the
 *      window. When the stop finds the terminal holder left running, the window says what the stop said.
 *   8. A QUICK NOTE FROM ANY PROGRAM (round W45). A key the window holds from the system, the tray's New
 *      quick note, and a line the office page writes each open a new note window on the office the window
 *      shows (src/desktop/the-quick-note.mjs). When the system refuses the key, the tray says so.
 *   9. A SERVER THAT STOPPED WITHOUT BEING ASKED TO IS STARTED AGAIN. The window watches the server its
 *      service lock names, and once that server has gone, reads the note it left beside the lock
 *      (src/desktop/starting-the-server-again.mjs). When the note says no stop was asked for, the check
 *      page says so, and says when the window starts the server again. Each try waits longer than the one
 *      before, and after the last one the page says the window has stopped trying. After a stop that
 *      was asked for, the window changes nothing. When nothing says how the server stopped, as after a
 *      SIGKILL, the page says so and the next start is the person's Check again. The window never shows
 *      itself for any of this.
 *  10. A SERVICE OLDER THAN THE WINDOW IS NOT OPENED BY ITSELF. A service keeps running when Mole Office is
 *      replaced by a newer copy. The window compares the version the service's health check says with its own
 *      (src/desktop/the-services-version.mjs). When the service is older, the check page says so, with both
 *      versions, and offers Restart the service and Open it anyway. When the service is newer, the window opens it
 *      as before, and its log says so. A healthy service whose health check has no version field is read as older.
 *      When the service says its version is null or something that is not a version, or the window knows no version
 *      of its own, the window compares nothing and does as before.
 *  11. A WEB PAGE IN THE WINDOW (package OT-B). The office page lays out a box for one web page, in its own place or
 *      in a column on its left or right, and says where the box is through the bridge src/desktop/preload.cjs gives
 *      it on the office's own origin. The window draws the page in a view of its own over that box. The view is kept
 *      out of the office by src/desktop/the-web-page.mjs: its own session, no preload, no loopback address and no
 *      office address. Every bridge call is checked for its sender and its arguments. The view hides when the
 *      office page asks, and while the window does not show the office page. The address and the place are kept in
 *      the window's own data folder and opened again after a restart. The office never sees that file.
 *
 * ONLY THE OFFICE ON THIS MACHINE. The window opens the office its checkout declares, on this
 * machine; another machine's office stays in the browser (the plan's question 1, answer A, for the
 * first release). The office it opens is one address, `theOfficeAddress`, worked out in one place, so
 * an office elsewhere can be added later as a second source of that address without undoing anything.
 *
 * THE WORDS are in src/config/the-self-check-words.mjs, in English and Chinese, chosen by the language a
 * `--lang` switch names (`--lang=zh-CN` gives Chinese), and otherwise by the system's first language.
 *
 * FROM A CHECKOUT, THE NODE THE SERVICE COMMAND RUNS ON is looked up in the window's whole environment, so on Windows a
 * search path held as `Path` is found.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import inspector from 'node:inspector'
import { BrowserWindow, Menu, Tray, WebContentsView, app, dialog, globalShortcut, ipcMain, nativeImage, nativeTheme } from 'electron'
import { readHowTheServerEnded } from '../config/how-the-server-ended.mjs'
import { DEVICE_HALF_HEADER, DEVICE_HALF_KEY } from '../config/key-header.mjs'
import { whereIsThisTool } from '../config/runtimes.mjs'
import { ENV_FILE, REPO_ROOT, THE_INSTALL, howToStart, settingValue, settings, theInstallsNode, thePerUserDataFolder, theVersion } from '../config/settings.mjs'
import { theSandboxWarning, theWorldTheDeclarationNames, whatAnswersForThisOffice, whatTheWindowSays } from '../config/the-self-check.mjs'
import { WINDOW_WORDS, theSystemsLanguage } from '../config/the-self-check-words.mjs'
import { theQuickNoteAddress } from '../config/the-quick-note-address.mjs'
import { readTheServiceLock } from '../config/the-service-lock.mjs'
import { THE_PAGE_SAYS, THE_TRAY_ASKS_TO_SHUT_DOWN, markEveryPageOf, withoutTheWindowsMarks } from '../config/the-window-mark.mjs'
import { isSetToOpenAtLogin, listenToTheSystem, theTrayItems, theTrayPicture } from './the-window-on-this-system.mjs'
import { A_NOTE_ASKED_FOR_WITHOUT_THE_NOTE_PAGE, THE_MAIN_WINDOW, THE_NOTE_WINDOW, giveTheWindowItsMenuRow, theNotesOpen, theQuickNoteKey, theQuickNoteWindowOptions } from './the-quick-note.mjs'
import { oneLoadAtATime } from './one-load-at-a-time.mjs'
import { START_AGAIN_AFTER_MS, TRIES_COUNT_WITHIN_MS, WATCH_EVERY_MS, howTheWatchedServerIs, theNextTry, theProcessIsRunning, whatTheTryFindsInTheLock } from './starting-the-server-again.mjs'
import { whatTheShutDownLeft, whatTheWindowSaysOfTheStop } from './what-the-shut-down-left.mjs'
import { THE_DEBUGGING_SETTING, keepTheInspectorShut, whyTheWindowRefusesToStart } from './the-debugging-switches.mjs'
import { howTheServicesVersionCompares } from './the-services-version.mjs'
import { printAPage, thePrintAsked } from './print-a-page.mjs'
import {
  THE_KEPT_PAGES_FILE,
  fromTheOfficePage,
  keepTheContentsOut,
  keepTheSessionOut,
  theDownloadAnswerAsked,
  theHttpsAddressAsked,
  theKeptPage,
  theKeptPagesText,
  theOpeningAsked,
  theRectangleAsked,
  theWebPagesPreferences,
  whyTheAddressIsRefused,
} from './the-web-page.mjs'

/**
 * 0. NO DEBUGGING SWITCH, before anything else (wave 13t, round 23). A window given --remote-debugging-port,
 * --inspect or their kin refuses to start and says why, on a Mac and on Linux alike, unless the developer
 * setting MOLE_OFFICE_WINDOW_DEBUGGING says on (src/desktop/the-debugging-switches.mjs). The words go to
 * stderr, and into a box.
 *
 * THE BOX ON LINUX (round W2). Before the app is ready, Electron shows the box on a Mac, but on Linux it only
 * writes the words to stderr. So on Linux the refused window waits for the app to be ready, shows the box,
 * and ends with 1 once Ok is pressed. It cannot await that here: Electron makes the app ready only after this
 * module has run, so an await of app.whenReady() at the top of it never ends (measured with Electron 44.5.1).
 * While it waits, the rest of this module only defines things, and the refused window asks for no lock (1
 * below), so it starts nothing. It closes Node's inspector first: a debugger was measured to attach to an
 * --inspect window while its box waited, and after the close it cannot connect. Chromium's debugging port
 * stays open while the box waits, and answered nothing then, measured on Linux. On Windows the words go to
 * stderr only, as before; whether a box is shown there is the Windows port's to decide.
 */
// A PRINT RUN is read first, from the command line alone (src/desktop/print-a-page.mjs). A print switch that is
// not followed by the page and the PDF ends the run at once with 1, and so does a refused print run below: the
// office's door is waiting for the program to end, and nobody is there to press a box.
/** @type {{ html: string, pdf: string } | null} */
let THE_PRINT = null
try {
  THE_PRINT = thePrintAsked(process.argv)
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  app.exit(1)
  process.exit(1)
}
// A setting that is neither on nor off is refused in the same way: thrown here, it would leave Electron's
// error box open with the window's program still running, measured on Linux.
/** @type {string | null} */
let THE_DEBUGGING_ALLOWED = null
/** @type {string | null} */
let THE_REFUSAL = null
try {
  // A kept choice that could not be read is thrown here, by its name, and refuses the window below. A print run
  // asks for no setting at all and is judged as if the setting were off: the door starts it with the office's own
  // environment, and reading the setting there would open the office's database.
  THE_DEBUGGING_ALLOWED = THE_PRINT === null ? settingValue(THE_DEBUGGING_SETTING) : 'off'
  THE_REFUSAL = whyTheWindowRefusesToStart({
    platform: process.platform,
    hasSwitch: (name) => app.commandLine.hasSwitch(name),
    inspectorUrl: inspector.url(),
    setting: String(THE_DEBUGGING_ALLOWED),
    envFile: ENV_FILE,
  })
} catch (err) {
  THE_REFUSAL = `Mole Office will not start: ${err instanceof Error ? err.message : String(err)}`
}
if (THE_REFUSAL !== null) {
  const refusal = THE_REFUSAL
  process.stderr.write(`${refusal}\n`)
  inspector.close()
  const showTheBoxAndEnd = () => {
    dialog.showErrorBox('Mole Office will not start', refusal)
    app.exit(1)
    process.exit(1)
  }
  if (THE_PRINT !== null) {
    app.exit(1)
    process.exit(1)
  } else if (process.platform === 'linux') app.whenReady().then(showTheBoxAndEnd)
  else if (process.platform === 'darwin') showTheBoxAndEnd()
  else {
    app.exit(1)
    process.exit(1)
  }
}
if (THE_DEBUGGING_ALLOWED !== 'on') keepTheInspectorShut(process)

/**
 * THE INSTALL THIS WINDOW RUNS FROM, AND THE COMMAND OF THAT INSTALL. The declaration says which
 * (src/config/settings.mjs, THE INSTALL AND ITS DATA): a window run from a checkout starts the
 * checkout's service through src/config/the-service-command.mjs, and a window run from a bundle
 * (`electron <bundle>/window.mjs`) starts the bundled service through the bundle's mole-office.mjs. It
 * tells which by the build stamp beside its own code, the same test the server makes, so the window
 * and the service it starts always agree on where the data is.
 */
const REPO = REPO_ROOT
const THE_COMMAND_ARGS = howToStart('command').args
/**
 * THE WINDOW'S PICTURES ARE THE PRODUCT'S LOGO. The window's icon is the logo's PNG itself, and the
 * tray's is the 32-pixel tab icon the page already uses, which
 * tests/the-brand-carries-the-owners-logo.test.ts compares with that PNG. The window makes no copy of its own.
 */
const THE_WINDOWS_ICON = join(REPO, 'assets', 'mole-office.png')
const THE_TRAYS_PICTURE = theTrayPicture(process.platform, REPO)

/**
 * A picture from a file, or an error naming the file. Electron returns an empty picture for a file it
 * cannot read, and says nothing; a window with no icon would hide that the file is gone.
 *
 * @param {string} path
 */
function thePicture(path) {
  const picture = nativeImage.createFromPath(path)
  if (picture.isEmpty()) throw new Error(`The window's picture ${path} could not be read.`)
  return picture
}

/**
 * WHAT THE CHECK PAGE SHOWS NOW: its lines, and the presses it offers. The page reads it through the
 * preload; nothing else in the window keeps a copy. `theCheckAsShown` makes it from `theCheckWasGiven`.
 *
 * @type {{ lines: import('../config/the-self-check.mjs').AWindowLine[], offers: ('openAnyway' | 'openTheOffice' | 'checkAgain' | 'restartTheService')[], busy: boolean, answer: string | null }}
 */
let theCheck = { lines: [], offers: [], busy: true, answer: null }
/** @type {typeof theCheck} what the check page was last given to show, before the window adds its own lines */
let theCheckWasGiven = theCheck
/** Whether a quick note was asked for while the window did not show the office. It opens once the office shows. */
let aQuickNoteWaits = false

/** The office's address the window may open, or null while none answers as this checkout's office. */
let theOfficeAddress = /** @type {string | null} */ (null)
/**
 * Whether the office at `theOfficeAddress` was found waiting for "Back up and update" (round W48). The window
 * then opens its offer without pairing, and pairs once the update is done (`holdTheOfficesReload`).
 */
let theOfficeWaitsForItsUpdate = false

/**
 * WHETHER THIS WINDOW RUNS WITHOUT CHROMIUM'S SANDBOX, read from its own command line (wave 13t, round
 * 14). The Mole Office AppImage's launcher adds --no-sandbox by itself where the system refuses user
 * namespaces, as on a stock Ubuntu 24.04 desktop, and says nothing. The window says it instead: every
 * check page ends with the warning (`theSandboxWarning` in src/config/the-self-check.mjs), and a
 * healthy office is opened only when the person presses Open, so the warning is read and not
 * flashed past. It warns and does not refuse: refusing would shut out every tester
 * on such a desktop.
 */
const THE_SANDBOX_IS_OFF = app.commandLine.hasSwitch('no-sandbox')

/**
 * WHETHER THE PERSON HAS TURNED ON THE OFFICE'S DEVELOPER MODE, as the window last read it from the
 * office's own page. The switch is the office's (src/web/lib/mode.ts keeps it in the page's
 * localStorage under this key, with the stored word `inspect`), and the window's pages of the office
 * share one storage, so the window reads the switch there and keeps no setting of its own. It reads
 * it each time an office page finishes loading and just before it leaves the office for its check
 * page. Before the office has been shown in this run, nothing has been read, and the check page shows
 * no system detail.
 */
const THE_OFFICES_MODE_KEY = 'mole-office.mode'
let theOfficeIsInDeveloperMode = false

/** Whether the window shows a page of the office now: its pages are http, the check page is a file. */
const showingTheOffice = () => theWindow !== null && theWindow.webContents.getURL().startsWith('http')

/**
 * Read the office's Developer mode from the office page the window shows now. Only an office page is
 * asked: before the first page, the window shows nothing, and a script sent there never answers.
 */
async function readTheOfficesMode() {
  if (theWindow === null || !showingTheOffice()) return
  try {
    const stored = await theWindow.webContents.executeJavaScript(`localStorage.getItem(${JSON.stringify(THE_OFFICES_MODE_KEY)})`)
    theOfficeIsInDeveloperMode = stored === 'inspect'
  } catch {
    // The page went away while it was being read. What was read before stands.
  }
}

/** True once the person has asked to shut down, so closing the window then really closes it. */
let quitting = false

/**
 * HOW OFTEN THE WINDOW LOADS ITS PAGE AGAIN AFTER THE PAGE'S RENDERER ENDS (round 16c): at most 3 times
 * in 60 seconds. One reload cures a page that stopped once, as in round 16's container runs, where each
 * picture ended the renderer once. A page that stops on every load stops again within seconds, so it
 * uses up the 3 at once and the window stops. A page that stops two or three times for unrelated
 * reasons still comes back, and a stop an hour later is not counted against an old one.
 */
const RELOADS_AT_MOST = 3
const RELOADS_WITHIN_MS = 60_000
/** When the window loaded its page again, within the last RELOADS_WITHIN_MS. */
let reloadedAt = /** @type {number[]} */ ([])
/** True once the page kept stopping and the window stopped loading it again, for the rest of this run. */
let stoppedReloading = false

/**
 * THE SERVER THE WINDOW WATCHES, to start it again when it stops without being asked to (9 above): the token
 * and the process its service lock named while it ran. Null while the window watches none.
 *
 * @type {import('./starting-the-server-again.mjs').AWatchedServer | null}
 */
let theWatchedServer = null
/** When each try to start the server again was made. Only the person's Check again and Restart forget them. */
let theTriesMade = /** @type {number[]} */ ([])
/** The timer of the try that waits for its turn, or null when no try waits. */
let theWaitingTry = /** @type {ReturnType<typeof setTimeout> | null} */ (null)
/** True while a try runs `mole-office start`. */
let aTryRuns = false
/** Why the watch last could not tell how the server is, so each new reason is logged once. */
let theLastCannotTell = /** @type {string | null} */ (null)

/** @type {BrowserWindow | null} */
let theWindow = null
/** Every load of the window waits here for the one before it (src/desktop/one-load-at-a-time.mjs). */
const loadInTurn = oneLoadAtATime((said) => process.stderr.write(`${said}\n`))
/** @type {Tray | null} */
let theTray = null
/** The tray's menu as it was last set. */
/** @type {Electron.MenuItemConstructorOptions[]} */
let theTrayMenuSet = []
/**
 * The quick-note key on this system, and whether the system gave it to the window. Null until an office page
 * has said its office has the note page, because the window asks for the key only then (`offerTheQuickNote`).
 */
const THE_QUICK_NOTE_KEY = theQuickNoteKey(process.platform)
/** @type {boolean | null} */
let theQuickNoteKeyIsSet = null
/** Whether an office page the window showed has said its office has the note page. */
const theOfficeHasTheNotePage = () => theQuickNoteKeyIsSet !== null
/** The note windows open now, one note each, kept until each one's 'closed'. A closing one may already be destroyed. */
const theNotes = new Set(/** @type {BrowserWindow[]} */ ([]))
/**
 * THE QUESTION THE MENU'S SHUT DOWN SHOWS, as a view over whatever page the window shows, or null
 * when it is not shown. It is the shell's own page (src/desktop/question.html), so the office's page
 * under it is untouched and a cancel leaves it exactly as it was (round W32).
 *
 * @type {WebContentsView | null}
 */
let theQuestion = null
const THE_QUESTION_PAGE = join(REPO, 'src', 'desktop', 'question.html')

const words = () => WINDOW_WORDS[theLanguage()]
// The window's words are in the language a --lang switch names, when the window is started with one.
// Otherwise they are in the system's first language, and in English when the system lists none
// (theSystemsLanguage). app.getLocale() is not read: it answers from the languages the app carries
// (THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs), and the system's own list does not depend on them.
// The switch's own value is read, so a language the app carries no locale file for still counts.
const theLanguage = () => theSystemsLanguage(app.commandLine.hasSwitch('lang') ? [app.commandLine.getSwitchValue('lang')] : app.getPreferredSystemLanguages())

// The app's own name and folder, set before anything reads them: launched as `electron
// src/desktop/main.mjs` it would otherwise be called Electron and keep its data under that name. The
// single-instance lock below lives in this folder too.
app.setName('Mole Office')
// A print run keeps its own folder beside the page instead, and opens no page of the office.
if (THE_PRINT === null) {
  // The same folder the declaration names for a bundle's data, so the window and the office share one.
  app.setPath('userData', thePerUserDataFolder())
  // Every page this app opens carries the window's marks: that it is the window, and which system it
  // stands on. The Settings sentence names the menu as each system names it (round W32).
  markEveryPageOf(app, process.platform)
}

// 1. ONE WINDOW PER USER. A second launch hands over and exits.
if (THE_REFUSAL !== null) {
  // A refused window asks for no lock, so a window started while its box waits does not hand over to it
  // (0 above).
} else if (THE_PRINT !== null) {
  // A print run takes no lock either: it neither waits for a running window nor hands its page over to one.
  printAPage(app, THE_PRINT)
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showTheWindow())
  // On a Mac a click on the Dock icon shows the window again (src/desktop/the-window-on-this-system.mjs).
  listenToTheSystem(app, process.platform, () => showTheWindow())
  app.whenReady().then(start)
  // The window lives in the tray when its own window is closed, so closing the last window ends nothing.
  app.on('window-all-closed', () => {})
  // A quit the system asks for, or one asked for in any other way, closes the window for real. The
  // service is the command's and keeps running (W1); only the tray's Shut down stops it as well.
  app.on('before-quit', () => {
    quitting = true
  })
  // The quick-note key goes back to the system when the window ends.
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

/** The declaration this checkout makes, read now. */
function theDeclaration() {
  const declared = settings()
  return { declared, lockPath: declared.serviceLockPath }
}

/**
 * WHERE THIS CHECKOUT'S OFFICE SHOULD ANSWER: the port its service lock records, or the declared port
 * when there is no lock to read. The world expected there is the declaration's, at that port.
 */
function whereToAsk() {
  const { declared, lockPath } = theDeclaration()
  const lock = readTheServiceLock(lockPath)
  const port = lock.state === 'read' ? lock.lock.port : declared.apiPort
  return { address: `http://127.0.0.1:${String(port)}`, expected: { ...theWorldTheDeclarationNames(declared), port: String(port) } }
}

/** Ask once what answers for this office. */
async function askTheSelfCheck() {
  const { address, expected } = whereToAsk()
  return whatAnswersForThisOffice({ address, expected, asks: 1, waitMs: 3_000 })
}

/**
 * RUN THE mole-office COMMAND, and say how it ended and what it printed. The window never starts the
 * server itself: the command does, in a group of its own, and the server and the worker it starts
 * run on the Node that runs it.
 *
 * WHICH NODE. An installed window runs it on the install's own Node (theInstallsNode in
 * src/config/settings.mjs), never with one on PATH: the machine may have no Node, or one of another
 * version than the bundles were made for. When that Node is missing the window says so and starts
 * nothing. A window run from a checkout uses this computer's Node on PATH, as it always has.
 * On Linux the install's own Node is this app's own program, told to run as Node. On Windows and the
 * Mac it is the Node the installation carries.
 *
 * The exit code is null when the command did not end with one: it did not run, or a signal ended it.
 * It is exported so a test can read the options its start passes
 * (tests/eleven-more-starts-ask-for-no-window.test.ts).
 *
 * @param {'start' | 'stop' | 'restart'} what
 * @returns {Promise<{ ok: boolean, code: number | null, said: string }>}
 */
export function runTheCommand(what) {
  const installs = theInstallsNode()
  if (THE_INSTALL.from === 'bundle' && !existsSync(installs.program)) {
    return Promise.resolve({ ok: false, code: null, said: words().noShippedNode(installs.program) })
  }
  const node = THE_INSTALL.from === 'bundle' ? installs.program : whereIsThisTool(installs.program, process.env)
  if (node === null) return Promise.resolve({ ok: false, code: null, said: words().noNode })
  return new Promise((done) => {
    const child = spawn(node, [...THE_COMMAND_ARGS, what], { cwd: REPO, env: { ...process.env, ...installs.environment }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let said = ''
    child.stdout.on('data', (chunk) => (said += String(chunk)))
    child.stderr.on('data', (chunk) => (said += String(chunk)))
    child.on('error', (err) => done({ ok: false, code: null, said: err.message }))
    child.on('close', (code) => done({ ok: code === 0, code, said: said.trim() }))
  })
}

/**
 * Show the check page with these lines and presses, and keep them for the page to read, as
 * `theCheckAsShown` shows them.
 */
function showTheCheck(lines, offers = [], busy = false, answer = null) {
  theCheckWasGiven = { lines, offers, busy, answer }
  theCheck = theCheckAsShown()
  // Which page the window shows is read when this load's turn comes, not now: a load before it may change it.
  void loadInTurn('the check page', async () => {
    if (theWindow === null) return
    if (theWindow.webContents.getURL().startsWith('file:')) {
      theWindow.webContents.send('the-check-changed')
      return
    }
    // Leaving the office: read its Developer mode first, while its page is still there to ask.
    await readTheOfficesMode()
    await theWindow?.loadFile(join(REPO, 'src', 'desktop', 'check.html'))
  })
}

/**
 * The check page as it is shown: what it was last given, after one line that says a quick note waits for the
 * office while one does (round W45). When the window runs without its sandbox, the warning is the last thing
 * on the page, once.
 */
function theCheckAsShown() {
  const { lines, offers, busy, answer } = theCheckWasGiven
  const waiting = aQuickNoteWaits ? [{ say: words().aQuickNoteWaitsForTheOffice }] : []
  return { lines: [...waiting, ...lines, ...(THE_SANDBOX_IS_OFF ? theSandboxWarning(theLanguage()) : [])], offers, busy, answer }
}

/** The isolated world the pairing script runs in: not 0, the page's own, and not 999, the preload's. */
const THE_PAIRING_WORLD = 1

/**
 * THE WINDOW PAIRS ITSELF, BEFORE IT OPENS AN OFFICE THAT OFFERS PAIRING, so the person never sees
 * the Pairing page in the window. A web browser still shows it. The window opens a hidden page of its
 * own on the pairing door's address, in the window's own session, with no preload and no Node, and one
 * script on that page reads the door and presses it. So the press is the office origin's own request,
 * and the cookie half it is given goes into the store the window's page reads. The header half has one
 * keeper: the office origin's storage, where the window's page reads it. The main process never holds
 * a half, and the script hands back only what happened. A press refused as senderNotReadInTime is made
 * once more. Any other refusal of the read or the press is handed back with the office's reason. A
 * load, a read or a press that gets no answer at all is handed back with the window's own error,
 * because the office said nothing.
 *
 * @param {string} address
 * @returns {Promise<{ refused: string } | { unreached: string } | null>} null when the window is paired or the office offers no pairing
 */
async function pairTheWindowWith(address) {
  if (theWindow === null) return null
  const door = `${address}/api/office/pairing`
  const page = new BrowserWindow({
    show: false,
    webPreferences: { session: theWindow.webContents.session, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  try {
    await page.loadURL(door)
    const script = thePairingScript(door, words().theWindowsDeviceName)
    const handed = /** @type {unknown} */ (await page.webContents.executeJavaScriptInIsolatedWorld(THE_PAIRING_WORLD, [{ code: script }]))
    if (typeof handed === 'object' && handed !== null) {
      if ('refused' in handed && typeof handed.refused === 'string') return { refused: handed.refused }
      if ('unreached' in handed && typeof handed.unreached === 'string') return { unreached: handed.unreached }
      if ('mayOpen' in handed && handed.mayOpen === true) return null
    }
    throw new Error(`The pairing page handed back ${JSON.stringify(handed)}.`)
  } catch (err) {
    return { unreached: err instanceof Error ? err.message : String(err) }
  } finally {
    page.destroy()
  }
}

/**
 * The one script the hidden pairing page runs. It reads the door with the header half it keeps, if it
 * keeps one, and presses only when the office says the window is not paired and offers pairing. Its
 * requests skip the browser's kept copy, because the page's own load of the door has just kept the
 * office's answer, tagged and marked no-cache, so a plain read would be answered 304 from that copy and
 * not by the office. It hands back the office's own error or the HTTP status when the office refused,
 * the page's own error when nothing answered, and mayOpen otherwise. It never hands back a half.
 *
 * @param {string} door the pairing door's whole address
 * @param {string} device the name the window gives itself at the press
 */
function thePairingScript(door, device) {
  return `(async () => {
  const door = ${JSON.stringify(door)}
  const key = ${JSON.stringify(DEVICE_HALF_KEY)}
  const device = ${JSON.stringify(device)}
  const kept = localStorage.getItem(key)
  const half = kept === null || kept === '' ? {} : { ${JSON.stringify(DEVICE_HALF_HEADER)}: kept }
  const ask = async (init) => {
    let reply
    try {
      reply = await fetch(door, { credentials: 'include', cache: 'no-store', ...init })
    } catch (err) {
      return { unreached: err instanceof Error ? err.message : String(err) }
    }
    const body = await reply.json().catch(() => null)
    const said = typeof body === 'object' && body !== null ? body : null
    if (reply.ok && said !== null) return { said }
    const error = typeof said?.error === 'string' && said.error !== '' ? said.error : reply.status + ' ' + reply.statusText
    return { refused: error, code: said?.code ?? null }
  }
  const read = await ask({ headers: half })
  if (!('said' in read)) return read
  if (read.said.paired === true || read.said.offered !== true) return { mayOpen: true }
  const press = () => ask({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device }) })
  let pressed = await press()
  if ('refused' in pressed && pressed.code === 'senderNotReadInTime') pressed = await press()
  if (!('said' in pressed)) return pressed
  if (typeof pressed.said.deviceHalf === 'string') localStorage.setItem(key, pressed.said.deviceHalf)
  return { mayOpen: true }
})()`
}

/**
 * Open the office at this address, after every load asked for before it, once the window has paired
 * itself with it (`pairTheWindowWith`). When the window is not paired, it does not open the office. The
 * check page gives the office's reason when the office refused, or says the window could not reach the
 * office when a request got no answer, and offers to check again. Open anyway is
 * not offered there, because it would only press the door again. When the office's page does not
 * load, the check page says why, and offers to open it anyway or check again. A quick note asked for
 * before the office showed opens once it does (round W45).
 *
 * AN OFFICE THAT WAITS FOR "BACK UP AND UPDATE" IS OPENED WITHOUT PAIRING (round W48). While it waits, it
 * answers every door of the office, the pairing door too, with updateWaiting, so the window could never
 * pair and the owner never reached the press. The window opens the offer unpaired instead, and holds the
 * office's next load until it has paired (`holdTheOfficesReload`).
 *
 * @param {string} address
 * @param {import('../config/the-self-check.mjs').AWindowLine[]} lines what the check page says above the reason, if the page does not open
 * @param {string | null} answer the self-check's answer
 */
async function openTheOfficeAt(address, lines, answer) {
  letTheOfficesLoadsGo()
  if (theOfficeWaitsForItsUpdate) {
    const failed = await loadInTurn('the office', async () => {
      await theWindow?.loadURL(`${address}/`)
      holdTheOfficesReload(address)
    })
    if (failed !== null) showTheCheck([...lines, { say: words().couldNotOpen(failed) }], ['openAnyway', 'checkAgain'], false, answer)
    return
  }
  const pairing = { notPaired: /** @type {{ refused: string } | { unreached: string } | null} */ (null) }
  // The press is made in the office load's own turn, so no other load can come between it and the page.
  const failed = await loadInTurn('the office', async () => {
    pairing.notPaired = await pairTheWindowWith(address)
    if (pairing.notPaired === null) await theWindow?.loadURL(`${address}/`)
  })
  if (pairing.notPaired !== null) sayTheWindowIsNotPaired(pairing.notPaired, lines, answer)
  else if (failed !== null) showTheCheck([...lines, { say: words().couldNotOpen(failed) }], ['openAnyway', 'checkAgain'], false, answer)
  else theOfficeShows()
}

/**
 * The check page says the window is not paired, with the office's reason or the window's own error, and offers
 * to check again. Open anyway is not offered, because it would only press the door again.
 *
 * @param {{ refused: string } | { unreached: string }} notPaired what `pairTheWindowWith` handed back
 * @param {import('../config/the-self-check.mjs').AWindowLine[]} lines what the check page says above the reason
 * @param {string | null} answer the self-check's answer
 */
function sayTheWindowIsNotPaired(notPaired, lines, answer) {
  /** @param {import('../config/the-self-check-words.mjs').WindowWords} w */
  const why = (w) => ('refused' in notPaired ? w.couldNotPair(notPaired.refused) : w.couldNotReachPairing(notPaired.unreached))
  process.stderr.write(`${why(WINDOW_WORDS.en)}\n`)
  showTheCheck([...lines, { say: why(words()) }], ['checkAgain'], false, answer)
}

/** The office shows now, so the quick note asked for before it opens (round W45). */
function theOfficeShows() {
  if (!aQuickNoteWaits) return
  aQuickNoteWaits = false
  openAQuickNote()
}

/**
 * Whether the self-check found an installed office waiting for "Back up and update" (src/server/lib/the-update.ts).
 *
 * @param {import('../config/the-self-check.mjs').WhatAnswers} found
 */
const itWaitsForItsUpdate = (found) => found.answer === 'unhealthy' && found.updateWaiting === true

/**
 * THE WINDOW HOLDS THE WAITING OFFICE'S NEXT LOAD UNTIL IT HAS PAIRED (round W48). Once the update is done,
 * the offer's page loads the office again by itself, and the office then offers pairing. Unheld, that load
 * would show the Pairing page. So every load of an office page in this window waits while the window asks
 * the self-check:
 *  - still waiting for the update: the load goes on;
 *  - healthy: the window pairs, and the load goes on paired. When it cannot pair, the load is cancelled and
 *    the check page says why, as `openTheOfficeAt` does;
 *  - any other answer: the load is cancelled, and the window finds its office again.
 * Every other request goes on at once. The hold ends when the office is healthy, when the window loads a page
 * that is not the office's, and when the window opens its office again.
 *
 * @param {string} address
 */
function holdTheOfficesReload(address) {
  if (theWindow === null) return
  const page = theWindow.webContents.id
  theWindow.webContents.session.webRequest.onBeforeRequest((request, go) => {
    if (request.resourceType !== 'mainFrame' || request.webContentsId !== page) {
      go({})
      return
    }
    if (!request.url.startsWith(`${address}/`)) {
      go({})
      letTheOfficesLoadsGo()
      return
    }
    void (async () => {
      const found = await askTheSelfCheck()
      if (itWaitsForItsUpdate(found)) {
        go({})
        return
      }
      if (found.answer !== 'healthy') {
        go({ cancel: true })
        letTheOfficesLoadsGo()
        await findTheOffice(false)
        return
      }
      theOfficeWaitsForItsUpdate = false
      const notPaired = await pairTheWindowWith(address)
      go(notPaired === null ? {} : { cancel: true })
      letTheOfficesLoadsGo()
      if (notPaired === null) theOfficeShows()
      else sayTheWindowIsNotPaired(notPaired, whatTheWindowSays(found, theLanguage(), { developer: theOfficeIsInDeveloperMode }), found.answer)
    })()
  })
}

/** End the hold `holdTheOfficesReload` put on the office's loads, if one is on. */
function letTheOfficesLoadsGo() {
  theWindow?.webContents.session.webRequest.onBeforeRequest(null)
}

/**
 * FIND THE OFFICE, START IT IF NOTHING ANSWERS, AND SAY WHAT WAS FOUND (W2(b), W3).
 *
 * @param {boolean} startIfSilent whether to start the service when nothing answers
 */
async function findTheOffice(startIfSilent = true) {
  // A try that waits to start the server again is not made: finding the office replaces it (9 above).
  if (theWaitingTry !== null) clearTimeout(theWaitingTry)
  theWaitingTry = null
  theOfficeAddress = null
  showTheCheck([{ say: words().checking }], [], true)
  const reader = { developer: theOfficeIsInDeveloperMode }
  let found = await askTheSelfCheck()
  // A STAND-IN THAT NAMED A REFUSAL IS NOT STARTED OVER. serve-dev kept the port with its stand-in
  // after a refused start, so a start cannot help and its output would replace the owner's sentence
  // (the supervisor's addition to round 12; src/config/stable-tag.mjs).
  if (found.answer === 'not-answering' && found.refusal === undefined && startIfSilent) {
    // On a first start this is the normal path, so it says only that the office is starting. What the
    // self-check found is shown too in Developer mode, with the system's own detail.
    const starting = { say: words().starting }
    showTheCheck(reader.developer ? [...whatTheWindowSays(found, theLanguage(), reader), starting] : [starting], [], true)
    const started = await runTheCommand('start')
    if (!started.ok) {
      showTheCheck([{ say: words().couldNotStart(started.code, started.said) }], ['checkAgain'], false, 'not-answering')
      return
    }
    found = await askTheSelfCheck()
  }
  const lines = whatTheWindowSays(found, theLanguage(), reader)
  // AN INSTALLED OFFICE WAITING FOR "BACK UP AND UPDATE" is opened like a healthy one: its page is the
  // offer, in words, and the press is the owner's there (src/server/lib/the-update.ts, round 58). The window
  // opens it without pairing (`openTheOfficeAt`, round W48).
  theOfficeWaitsForItsUpdate = itWaitsForItsUpdate(found)
  // A SERVICE OLDER THAN THIS WINDOW is not opened by itself (10 above). The page says so and offers the restart,
  // which runs this window's version, or the older service as it is.
  const versions = howTheServicesVersionCompares(found, theVersion())
  if (versions.is === 'older') {
    theOfficeAddress = found.address
    process.stderr.write(`${WINDOW_WORDS.en.anOlderService(versions.service, versions.window)}\n`)
    showTheCheck([...lines, { say: words().anOlderService(versions.service, versions.window) }], ['restartTheService', 'openAnyway'], false, found.answer)
    return
  }
  if (versions.is === 'newer') {
    process.stderr.write(`The service that answers runs Mole Office ${versions.service}, newer than this window's ${versions.window}. The window goes on as it did before it compared versions.\n`)
  }
  if (found.answer === 'healthy' || theOfficeWaitsForItsUpdate) {
    theOfficeAddress = found.address
    if (THE_SANDBOX_IS_OFF) {
      // The office opens on the person's press, under the warning, so the warning is read.
      showTheCheck(lines, ['openTheOffice'], false, found.answer)
      return
    }
    showTheCheck([...lines, { say: words().opening }], [], true, found.answer)
    await openTheOfficeAt(found.address, lines, found.answer)
    return
  }
  if (found.answer === 'unhealthy') {
    theOfficeAddress = found.address
    showTheCheck(lines, ['openAnyway', 'checkAgain'], false, found.answer)
    return
  }
  if (found.answer === 'wrong-world' || found.answer === 'cannot-tell') {
    // The lines already say why it is not opened and what the person can do.
    showTheCheck(lines, ['checkAgain'], false, found.answer)
    return
  }
  showTheCheck(lines, ['checkAgain'], false, found.answer)
}

/**
 * ONE LOOK AT THE SERVER (9 above), every WATCH_EVERY_MS. It does nothing while Mole Office shuts down, or while
 * a try waits or runs, because the try reads the lock itself. What it found is decided apart from Electron
 * (`howTheWatchedServerIs`).
 */
function watchTheServer() {
  if (quitting || theWaitingTry !== null || aTryRuns) return
  const { lockPath } = theDeclaration()
  const found = howTheWatchedServerIs({
    watched: theWatchedServer,
    lock: readTheServiceLock(lockPath),
    isRunning: theProcessIsRunning,
    readTheNote: () => readHowTheServerEnded(lockPath),
  })
  if (found.is === 'cannot tell yet') {
    if (found.why !== theLastCannotTell) process.stderr.write(`The window cannot tell yet how its server is. ${found.why}\n`)
    theLastCannotTell = found.why
    return
  }
  theLastCannotTell = null
  if (found.is === 'running') {
    theWatchedServer = { token: found.token, pid: found.pid }
    return
  }
  theWatchedServer = null
  if (found.is === 'not watched') return
  if (found.is === 'stopped') {
    process.stderr.write(`The window's server was asked to stop (${found.because}), so the window does not start it again.\n`)
    return
  }
  if (found.is === 'stopped unasked') {
    process.stderr.write(`${WINDOW_WORDS.en.stoppedUnasked} It ended with exit code ${String(found.exitCode)}, as the note beside its lock says.\n`)
    startTheServerAgain(null)
    return
  }
  process.stderr.write(`${WINDOW_WORDS.en.stoppedWithoutSayingHow} ${found.why}\n`)
  theOfficeAddress = null
  showTheCheck([{ say: words().stoppedWithoutSayingHow }], ['checkAgain'], false, 'not-answering')
}

/**
 * THE NEXT TRY TO START THE SERVER AGAIN, made after its wait, or the page that says the window has stopped
 * trying (9 above). Either page says first that the server stopped, then how the try before failed, if one did.
 *
 * @param {{ code: number | null, said: string } | null} failed how the try before this one failed, or null when the server's own end comes before it
 */
function startTheServerAgain(failed) {
  theOfficeAddress = null
  /** @param {import('../config/the-self-check-words.mjs').WindowWords} w */
  const stopped = (w) => [{ say: w.stoppedUnasked }, ...(failed === null ? [] : [{ say: w.couldNotStart(failed.code, failed.said) }])]
  const next = theNextTry(theTriesMade, Date.now())
  if (next === null) {
    const minutes = TRIES_COUNT_WITHIN_MS / 60_000
    process.stderr.write(`${WINDOW_WORDS.en.stoppedTrying(START_AGAIN_AFTER_MS.length, minutes)}\n`)
    showTheCheck([...stopped(words()), { say: words().stoppedTrying(START_AGAIN_AFTER_MS.length, minutes) }], ['checkAgain'], false, 'not-answering')
    return
  }
  theTriesMade = next.triedAt
  process.stderr.write(`${WINDOW_WORDS.en.startsAgainIn(next.afterMs / 1000, next.attempt, next.attempts)}\n`)
  showTheCheck([...stopped(words()), { say: words().startsAgainIn(next.afterMs / 1000, next.attempt, next.attempts) }], [], true, 'not-answering')
  theWaitingTry = setTimeout(() => {
    theWaitingTry = null
    void makeTheTry(next.attempt, next.attempts)
  }, next.afterMs)
}

/**
 * ONE TRY TO START THE SERVER AGAIN, counted as it is made. A try that comes while Mole Office shuts down is not
 * made. When the lock names a running server by then, somebody else started it, so the try starts nothing and
 * the window finds that server instead. When the process check cannot tell whether the lock's server runs, the
 * window logs why and runs the start command, which finds a running server itself.
 *
 * @param {number} attempt which try this is
 * @param {number} attempts how many tries there are
 */
async function makeTheTry(attempt, attempts) {
  if (quitting) return
  theTriesMade.push(Date.now())
  const found = whatTheTryFindsInTheLock({ lock: readTheServiceLock(theDeclaration().lockPath), isRunning: theProcessIsRunning })
  if (found.is === 'running') {
    process.stderr.write(`The server runs again already, as process ${String(found.pid)}, so the window starts nothing and finds it.\n`)
    await findTheOffice(false)
    return
  }
  if (found.is === 'cannot tell') {
    process.stderr.write(`The window could not tell whether the server runs: ${found.why}\n`)
  }
  process.stderr.write(`${WINDOW_WORDS.en.startingAgain(attempt, attempts)}\n`)
  showTheCheck([{ say: words().stoppedUnasked }, { say: words().startingAgain(attempt, attempts) }], [], true, 'not-answering')
  aTryRuns = true
  const started = await runTheCommand('start')
  aTryRuns = false
  if (started.ok) {
    await findTheOffice(false)
    return
  }
  process.stderr.write(`${WINDOW_WORDS.en.couldNotStart(started.code, started.said)}\n`)
  startTheServerAgain(started)
}

/**
 * Text made safe to put in a page's HTML.
 *
 * @param {string} text
 */
const asHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * THE PAGE KEPT STOPPING, said in the window (round 16c). The page that kept stopping cannot say it, so
 * the window shows a plain page of its own, written here, in the window's language. Its title says it
 * too, because the system draws a window's title even when no page can be drawn at all.
 *
 * @param {number} times how often the page stopped within RELOADS_WITHIN_MS
 */
function showThePageKeptStopping(times) {
  if (theWindow === null) return
  const said = words().keptStopping
  theWindow.setTitle(said.title)
  const html =
    `<!doctype html><html lang="${theLanguage()}"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark">` +
    `<title>${asHtml(said.title)}</title></head><body style="font-family: sans-serif; margin: 2rem; max-width: 40rem; line-height: 1.5">` +
    `<h1>${asHtml(said.heading)}</h1><p>${asHtml(said.why(times, RELOADS_WITHIN_MS / 1000))}</p><p>${asHtml(said.todo(theOfficeAddress))}</p></body></html>`
  theWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
    process.stderr.write(`The window could not show the page that says its page kept stopping: ${err instanceof Error ? err.message : String(err)}\n`)
  })
}

function showTheWindow() {
  if (theWindow === null) return
  if (theWindow.isMinimized()) theWindow.restore()
  theWindow.show()
  theWindow.focus()
}

/**
 * THE QUESTION OVER THE WINDOW'S PAGE. It fills the window's content area and is given a transparent
 * background, so the page under it shows through the scrim and is not reloaded or changed. A second
 * press while it is shown shows the same one again: there is only ever one view.
 */
function showTheShutDownQuestion() {
  if (theWindow === null || theQuestion !== null) return
  showTheWindow()
  const view = new WebContentsView({
    webPreferences: {
      preload: join(REPO, 'src', 'desktop', 'question-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  view.setBackgroundColor('#00000000')
  theWindow.contentView.addChildView(view)
  theQuestion = view
  fitTheQuestion()
  view.webContents.loadFile(THE_QUESTION_PAGE).then(
    () => view.webContents.focus(),
    (err) => process.stderr.write(`The window could not show its shutdown question: ${err instanceof Error ? err.message : String(err)}\n`),
  )
}

/** Keep the question over the whole of the window's page when the window is resized. */
function fitTheQuestion() {
  if (theWindow === null || theQuestion === null) return
  const { width, height } = theWindow.getContentBounds()
  theQuestion.setBounds({ x: 0, y: 0, width, height })
}

/** Remove the question and let its page go. It stops nothing by itself. */
function removeTheShutDownQuestion() {
  if (theQuestion === null) return
  const view = theQuestion
  theQuestion = null
  theWindow?.contentView.removeChildView(view)
  // The page goes a moment later, so a press's answer can reach the page that made it before its
  // web contents is closed under the reply.
  setTimeout(() => {
    if (!view.webContents.isDestroyed()) view.webContents.close()
  }, 200)
}

// ---------------------------------------------------------------------------- 11. a web page in the window

/**
 * THE WEB PAGE THE WINDOW DRAWS OVER THE OFFICE PAGE'S BOX, or null when none is open. One at a time.
 *
 * @type {{
 *   view: WebContentsView,
 *   address: string,
 *   place: import('./the-web-page.mjs').Place,
 *   title: string,
 *   bounds: { x: number, y: number, width: number, height: number } | null,
 *   hiddenByThePage: boolean,
 *   theOfficeIsAway: boolean,
 * } | null}
 */
let theWebPage = null
/** What the bar was last told: a refusal, a page that did not load, or how a download ended. */
let theWebPagesSaid = /** @type {import('./the-web-page.mjs').Said | null} */ (null)
/** The downloads waiting for the person's answer on the bar, by the id the session gave each. */
const theDownloadsAsked = new Map(/** @type {[number, { asked: import('./the-web-page.mjs').AskedDownload, answer: (yes: boolean) => void }][]} */ ([]))
/** The sessions given their rules. Every view of the partition shares one, and it is given them once. */
const theSessionsKeptOut = new WeakSet()
/** The names given to downloads since the window started. */
const theNamesGiven = new Set(/** @type {string[]} */ ([]))
/** Whether the page kept from the last run was read. It is read once, when the office page first asks. */
let theKeptPageWasRead = false
const theKeptPagesPath = () => join(app.getPath('userData'), THE_KEPT_PAGES_FILE)

/** What the bar draws: the page's address, title and place, whether it can go back or forward, and what it was told. */
function theWebPagesState() {
  const asked = theDownloadsAsked.values().next().value?.asked ?? null
  if (theWebPage === null) return { open: false, said: theWebPagesSaid, asked }
  const contents = theWebPage.view.webContents
  return {
    open: true,
    address: theWebPage.address,
    place: theWebPage.place,
    title: theWebPage.title,
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    loading: contents.isLoading(),
    said: theWebPagesSaid,
    asked,
  }
}

/** Tell the office page the bar has changed. A check page the window shows instead has no listener, and is told nothing it can use. */
function sayTheWebPageChanged() {
  if (theWindow !== null && !theWindow.webContents.isDestroyed()) theWindow.webContents.send('the-web-page-changed', theWebPagesState())
}

/** @param {import('./the-web-page.mjs').Said} said */
function tellTheBar(said) {
  theWebPagesSaid = said
  sayTheWebPageChanged()
}

/** Put the view over its box, and show it only while the office page has placed it, has not hidden it, and is shown. */
function showOrHideTheWebPage() {
  if (theWebPage === null) return
  if (theWebPage.bounds !== null) theWebPage.view.setBounds(theWebPage.bounds)
  theWebPage.view.setVisible(theWebPage.bounds !== null && !theWebPage.hiddenByThePage && !theWebPage.theOfficeIsAway)
}

/** Keep the page's address and place for the next start, or forget them once it is closed. */
function keepTheWebPage() {
  try {
    if (theWebPage === null) rmSync(theKeptPagesPath(), { force: true })
    else writeFileSync(theKeptPagesPath(), theKeptPagesText(theWebPage))
  } catch (err) {
    process.stderr.write(`The window could not keep the web page for its next start: ${err instanceof Error ? err.message : String(err)}\n`)
  }
}

/** The page the last run kept, checked again as if it were asked for now, or null. */
function readTheKeptPage() {
  /** @type {string | null} */
  let text = null
  try {
    text = readFileSync(theKeptPagesPath(), 'utf8')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') {
      process.stderr.write(`The window could not read the web page it kept, so it opens none: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }
  const kept = theKeptPage(text, theOfficeAddress)
  if (text !== null && kept === null) process.stderr.write('The web page the window kept is not one it may open, so it opens none.\n')
  return kept
}

/**
 * THE SESSION'S RULES, given once (src/desktop/the-web-page.mjs). A download is saved in the downloads folder, and
 * waits for the person's answer on the bar first.
 *
 * @param {Electron.Session} session
 */
function keepTheWebPagesSessionOut(session) {
  if (theSessionsKeptOut.has(session)) return
  theSessionsKeptOut.add(session)
  keepTheSessionOut({
    session,
    office: () => theOfficeAddress,
    userAgent: withoutTheWindowsMarks(app.userAgentFallback),
    downloads: {
      // A name given to a download still being saved is taken too, though its file is not in the folder yet.
      isTaken: (name) => theNamesGiven.has(name) || existsSync(join(app.getPath('downloads'), name)),
      pathOf: (name) => {
        theNamesGiven.add(name)
        return join(app.getPath('downloads'), name)
      },
      ask: (asked) =>
        new Promise((answer) => {
          theDownloadsAsked.set(asked.id, { asked, answer })
          sayTheWebPageChanged()
        }),
    },
    tell: tellTheBar,
  })
}

/**
 * OPEN THE PAGE THE OFFICE PAGE ASKED FOR, already checked. With a page open, the same view goes to the new address,
 * and the same address only moves it to the new place.
 *
 * @param {{ address: string, place: import('./the-web-page.mjs').Place }} opening
 */
function openTheWebPage({ address, place }) {
  if (theWindow === null) return
  if (theWebPage !== null) {
    theWebPage.place = place
    if (theWebPage.address !== address) {
      theWebPage.address = address
      theWebPagesSaid = null
      void theWebPage.view.webContents.loadURL(address).catch(() => undefined)
    }
    keepTheWebPage()
    sayTheWebPageChanged()
    return
  }
  const view = new WebContentsView({ webPreferences: theWebPagesPreferences() })
  const contents = view.webContents
  keepTheWebPagesSessionOut(contents.session)
  keepTheContentsOut({ contents, office: () => theOfficeAddress, tell: tellTheBar })
  const page = { view, address, place, title: '', bounds: null, hiddenByThePage: false, theOfficeIsAway: false }
  /** @param {string} url */
  const wentTo = (url) => {
    if (theWebPage !== page) return
    page.address = url
    if (theWebPagesSaid !== null && !('download' in theWebPagesSaid)) theWebPagesSaid = null
    keepTheWebPage()
    sayTheWebPageChanged()
  }
  contents.on('did-navigate', (_event, url) => wentTo(url))
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) wentTo(url)
  })
  contents.on('page-title-updated', (_event, title) => {
    if (theWebPage !== page) return
    page.title = title
    sayTheWebPageChanged()
  })
  contents.on('did-start-loading', () => sayTheWebPageChanged())
  contents.on('did-stop-loading', () => sayTheWebPageChanged())
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    // -3 is a load another load replaced, and -20 one the rules refused, which the bar was told of already.
    if (theWebPage === page && isMainFrame && code !== -3 && code !== -20) tellTheBar({ failed: description, address: url })
  })
  view.setVisible(false)
  theWindow.contentView.addChildView(view)
  // The shut-down question draws above everything, so it is put on top again (7 above).
  if (theQuestion !== null) theWindow.contentView.addChildView(theQuestion)
  theWebPage = page
  theWebPagesSaid = null
  keepTheWebPage()
  sayTheWebPageChanged()
  void contents.loadURL(address).catch(() => undefined)
}

/** Close the page. A download still waiting for an answer is not saved. */
function closeTheWebPage() {
  if (theWebPage === null) return
  const { view } = theWebPage
  theWebPage = null
  for (const { answer } of theDownloadsAsked.values()) answer(false)
  theDownloadsAsked.clear()
  theWindow?.contentView.removeChildView(view)
  if (!view.webContents.isDestroyed()) view.webContents.close()
  keepTheWebPage()
  sayTheWebPageChanged()
}

/**
 * THE WEB PAGE'S BRIDGE, from the office page. Each call is refused, and does nothing, unless it came from the office
 * page the window shows, from its main frame and on the office's own origin. Each argument is checked by
 * src/desktop/the-web-page.mjs before it is used. "Open in the ordinary browser" takes no address from the office
 * page: it opens the view's own, and only an http or https one. The call for an account sign-in's address (round 242)
 * takes one, and opens it in the system's browser only when it is https (theHttpsAddressAsked).
 *
 * Electron's shell is asked for where it is used, so the stand-in Electron of
 * tests/eleven-more-starts-ask-for-no-window.test.ts need not carry it.
 */
function giveTheOfficePageItsBridge() {
  /** @param {Electron.IpcMainInvokeEvent} event */
  const fromTheOffice = (event) => fromTheOfficePage(event, theWindow?.webContents ?? null, theOfficeAddress)
  // The preload asks for the office's origin before the page's own code runs, and gives the bridge only there.
  ipcMain.on('the-offices-origin', (event) => {
    event.returnValue = theWindow !== null && event.sender === theWindow.webContents && theOfficeAddress !== null ? new URL(theOfficeAddress).origin : null
  })
  ipcMain.handle('the-web-page', (event) => {
    if (!fromTheOffice(event)) return null
    if (theWebPage === null && !theKeptPageWasRead) {
      theKeptPageWasRead = true
      const kept = readTheKeptPage()
      if (kept !== null) openTheWebPage(kept)
    }
    return theWebPagesState()
  })
  ipcMain.handle('web-page-open', (event, asked) => {
    if (!fromTheOffice(event)) return false
    const opening = theOpeningAsked(asked, theOfficeAddress)
    if (opening === null) return false
    theKeptPageWasRead = true
    openTheWebPage(opening)
    return true
  })
  ipcMain.handle('web-page-place', (event, asked) => {
    if (!fromTheOffice(event) || theWebPage === null || theWindow === null) return false
    const { width, height } = theWindow.getContentBounds()
    const bounds = theRectangleAsked(asked, { width, height, zoom: theWindow.webContents.getZoomFactor() })
    if (bounds === null) return false
    theWebPage.bounds = bounds
    theWebPage.theOfficeIsAway = false
    showOrHideTheWebPage()
    return true
  })
  for (const [channel, hidden] of /** @type {const} */ ([['web-page-hide', true], ['web-page-show', false]])) {
    ipcMain.handle(channel, (event) => {
      if (!fromTheOffice(event) || theWebPage === null) return false
      theWebPage.hiddenByThePage = hidden
      theWebPage.theOfficeIsAway = false
      showOrHideTheWebPage()
      return true
    })
  }
  ipcMain.handle('web-page-back', (event) => {
    if (!fromTheOffice(event) || theWebPage === null || !theWebPage.view.webContents.navigationHistory.canGoBack()) return false
    theWebPage.view.webContents.navigationHistory.goBack()
    return true
  })
  ipcMain.handle('web-page-forward', (event) => {
    if (!fromTheOffice(event) || theWebPage === null || !theWebPage.view.webContents.navigationHistory.canGoForward()) return false
    theWebPage.view.webContents.navigationHistory.goForward()
    return true
  })
  ipcMain.handle('web-page-reload', (event) => {
    if (!fromTheOffice(event) || theWebPage === null) return false
    theWebPage.view.webContents.reload()
    return true
  })
  ipcMain.handle('web-page-close', (event) => {
    if (!fromTheOffice(event) || theWebPage === null) return false
    closeTheWebPage()
    return true
  })
  ipcMain.handle('web-page-outside', async (event) => {
    if (!fromTheOffice(event) || theWebPage === null) return false
    const address = theWebPage.view.webContents.getURL()
    if (whyTheAddressIsRefused(address, theOfficeAddress) !== null) return false
    const { shell } = await import('electron')
    await shell.openExternal(address)
    return true
  })
  // Round 242: an account sign-in's address, opened in the system's browser. Only an https address is opened.
  ipcMain.handle('web-page-https', async (event, asked) => {
    if (!fromTheOffice(event)) return false
    const address = theHttpsAddressAsked(asked)
    if (address === null) return false
    const { shell } = await import('electron')
    await shell.openExternal(address)
    return true
  })
  ipcMain.handle('web-page-download', (event, asked) => {
    if (!fromTheOffice(event)) return false
    const answer = theDownloadAnswerAsked(asked)
    const waiting = answer === null ? undefined : theDownloadsAsked.get(answer.id)
    if (answer === null || waiting === undefined) return false
    theDownloadsAsked.delete(answer.id)
    waiting.answer(answer.save)
    sayTheWebPageChanged()
    return true
  })
}

/**
 * THE ANSWER TO THE QUESTION. Cancel removes it and stops nothing. Yes removes it and goes on exactly
 * as the menu's press did before this round: to the office page's question when one is shown, and
 * otherwise to the stop command.
 *
 * @param {'yes' | 'cancel'} answer
 */
async function answerTheShutDownQuestion(answer) {
  if (theQuestion === null || (answer !== 'yes' && answer !== 'cancel')) return
  removeTheShutDownQuestion()
  if (answer === 'cancel') {
    theTrayShutDownWent = 'cancelled'
    return
  }
  await shutDownAsThePressAlwaysDid()
}

/** What the menu's Shut down did before the question: hand it to the page, or run the stop command. */
async function shutDownAsThePressAlwaysDid() {
  // An office page takes the press when it can ask the question (ShutDown.tsx cancels the event).
  if (showingTheOffice() && theWindow !== null) {
    showTheWindow()
    const ask = `!window.dispatchEvent(new CustomEvent(${JSON.stringify(THE_TRAY_ASKS_TO_SHUT_DOWN)}, { cancelable: true }))`
    let taken = false
    try {
      taken = (await theWindow.webContents.executeJavaScript(ask)) === true
    } catch {
      // The page went away while it was asked: the press falls through to the command below.
    }
    if (taken) {
      theTrayShutDownWent = 'to the page'
      return
    }
  }
  theTrayShutDownWent = 'to the stop command'
  showTheCheck([{ say: words().stopping }], [], true)
  const stopped = await runTheCommand('stop')
  if (!stopped.ok) {
    showTheWindow()
    showTheCheck([{ say: whatTheWindowSaysOfTheStop(stopped, words()) }], ['checkAgain'], false, theCheck.answer)
    return
  }
  quitting = true
  app.quit()
}

/** The tray's four presses, in the order the menu shows them. */
const TRAY_PRESSES = {
  open: () => showTheWindow(),
  newNote: () => openAQuickNote(),
  restart: async () => {
    showTheWindow()
    // ONE SERVICE COMMAND AT A TIME. While a try runs `mole-office start`, the press runs no restart beside it. The
    // page goes on showing the try, which says the window is starting the server. Once the try has ended, the page
    // says what the window found, and Restart can be pressed again.
    if (aTryRuns) {
      process.stderr.write('Restart did nothing: a try to start the server again runs now, and the window runs one service command at a time.\n')
      return
    }
    // A try that waits is not made: the restart replaces it, and the tries start over (9 above).
    if (theWaitingTry !== null) clearTimeout(theWaitingTry)
    theWaitingTry = null
    theTriesMade = []
    theOfficeAddress = null
    showTheCheck([{ say: words().restarting }], [], true)
    const restarted = await runTheCommand('restart')
    if (!restarted.ok) {
      showTheCheck([{ say: words().couldNotRestart(restarted.code, restarted.said) }], ['checkAgain'], false, 'not-answering')
      return
    }
    await findTheOffice(false)
  },
  // It shows the question and returns at once, so nothing waits for the answer.
  shutDown: () => {
    theTrayShutDownWent = 'to the question'
    showTheShutDownQuestion()
  },
}

/**
 * A NEW QUICK NOTE (round W45), from the key, the tray or the office page's line: a window of its own that
 * stays on top of other windows and shows the office's note page. It opens only while the window shows the
 * office, which it has paired by then, so the note window, on the same session, is paired too.
 *
 * ASKED FOR BEFORE THEN, THE NOTE WAITS. The window comes forward, its check page says first that the note
 * opens once the office is open, and `openTheOfficeAt` opens it when the office shows. The check page is told
 * only when it is the page shown, and is not loaded for this, so an ask while the office loads does not take
 * the window away from the office. A second ask while one waits adds nothing.
 *
 * ONLY ONCE AN OFFICE PAGE HAS SAID ITS OFFICE HAS THE NOTE PAGE (`offerTheQuickNote`). Before that only the
 * office page's own line can ask, because the tray has no New quick note and the key is not taken. No note
 * opens, and the window's log says so.
 */
function openAQuickNote() {
  if (!theOfficeHasTheNotePage()) {
    process.stderr.write(`${A_NOTE_ASKED_FOR_WITHOUT_THE_NOTE_PAGE}\n`)
    return
  }
  if (!showingTheOffice() || theOfficeAddress === null) {
    showTheWindow()
    if (aQuickNoteWaits) return
    aQuickNoteWaits = true
    process.stderr.write(`${WINDOW_WORDS.en.aQuickNoteWaitsForTheOffice}\n`)
    theCheck = theCheckAsShown()
    if (theWindow?.webContents.getURL().startsWith('file:') === true) theWindow.webContents.send('the-check-changed')
    return
  }
  const note = new BrowserWindow(theQuickNoteWindowOptions({ title: words().title, icon: thePicture(THE_WINDOWS_ICON) }))
  giveTheWindowItsMenuRow(note, THE_NOTE_WINDOW, process.platform)
  theNotes.add(note)
  note.on('closed', () => theNotes.delete(note))
  const address = theQuickNoteAddress(theOfficeAddress)
  note.loadURL(address).catch((err) => {
    process.stderr.write(`The note window could not load ${address}: ${err instanceof Error ? err.message : String(err)}\n`)
  })
}

/** Which way the tray's last Shut down went. Null before one. */
/** @type {'to the question' | 'to the page' | 'to the stop command' | 'cancelled' | null} */
let theTrayShutDownWent = null

/** How long the window waits for the office to stop answering after its page said it is shutting down. */
const STOPPED_ANSWERING_WITHIN_MS = 20_000

/**
 * WHAT THE OFFICE PAGE SAYS ON ITS CONSOLE (THE_PAGE_SAYS in src/config/the-window-mark.mjs). Only a
 * line from the office page the window shows counts. A line grants nothing: the shutdown itself was
 * the server's, after its own check of who pressed; the window only closes after it.
 *
 * @param {string} line
 */
async function whenThePageSays(line) {
  if (!showingTheOffice() || quitting) return
  if (line === THE_PAGE_SAYS.itHasTheQuickNotePage) {
    offerTheQuickNote()
    return
  }
  if (line === THE_PAGE_SAYS.openAQuickNote) {
    openAQuickNote()
    return
  }
  if (line === THE_PAGE_SAYS.closeOnlyTheWindow) {
    quitting = true
    app.quit()
    return
  }
  if (line !== THE_PAGE_SAYS.shuttingDown) return
  const since = Date.now()
  let answer = 'healthy'
  while (Date.now() - since < STOPPED_ANSWERING_WITHIN_MS) {
    const found = await askTheSelfCheck()
    answer = found.answer
    if (found.answer === 'not-answering') {
      // The server stops answering before it ends the terminal holder, so what it left is asked once its lock has gone.
      const stopped = await whatTheShutDownLeft({ lockPath: theDeclaration().lockPath, runTheStop: () => runTheCommand('stop') })
      if (!stopped.ok) {
        theOfficeAddress = null
        showTheWindow()
        showTheCheck([{ say: whatTheWindowSaysOfTheStop(stopped, words()) }], ['checkAgain'], false, 'not-answering')
        return
      }
      quitting = true
      app.quit()
      return
    }
    await new Promise((done) => setTimeout(done, 1_000))
  }
  theOfficeAddress = null
  showTheWindow()
  showTheCheck([{ say: words().stillAnswering(STOPPED_ANSWERING_WITHIN_MS / 1000) }], ['checkAgain'], false, answer)
}

/**
 * A PICTURE OF THE WINDOW AND THE QUESTION ON IT. The window's own page does not draw a view added
 * over it, so the page and the question are put together in a window that is never shown. The test
 * hook uses this; nothing in the product does.
 */
async function pictureOfTheWindow() {
  if (theWindow === null) return null
  const below = await theWindow.webContents.capturePage()
  if (theQuestion === null) return below.toPNG().toString('base64')
  const above = await theQuestion.webContents.capturePage()
  return putOnePictureOverAnother(below, above)
}

/**
 * One picture drawn over another, at the size of the picture below. It is made in a window that is
 * never shown, because Electron gives no way to draw two pictures together. The pictures go to
 * files and the page loads them from its own folder: a data: URL would carry both as base64 and
 * Chromium refuses one over 2 MB.
 *
 * @param {Electron.NativeImage} below
 * @param {Electron.NativeImage} above
 */
async function putOnePictureOverAnother(below, above) {
  const { width, height } = below.getSize()
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-picture-'))
  const page = join(folder, 'picture.html')
  writeFileSync(join(folder, 'below.png'), below.toPNG())
  writeFileSync(join(folder, 'above.png'), above.toPNG())
  writeFileSync(
    page,
    `<!doctype html><html><head><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style></head><body><canvas id="picture" width="${String(width)}" height="${String(height)}"></canvas><script>\n` +
      `const paint = document.getElementById('picture').getContext('2d')\n` +
      `const imageOf = (source) => new Promise((done, fail) => { const image = new Image(); image.onload = () => done(image); image.onerror = fail; image.src = source })\n` +
      `Promise.all([imageOf('below.png'), imageOf('above.png')]).then(([under, over]) => {\n` +
      `  paint.drawImage(under, 0, 0, ${String(width)}, ${String(height)})\n` +
      `  paint.drawImage(over, 0, 0, ${String(width)}, ${String(height)})\n` +
      `  document.title = 'drawn'\n` +
      `})\n` +
      `</script></body></html>`,
  )
  const frame = new BrowserWindow({
    show: false,
    width,
    height,
    frame: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false },
  })
  try {
    await frame.loadFile(page)
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline && (await frame.webContents.executeJavaScript('document.title')) !== 'drawn') {
      await new Promise((done) => setTimeout(done, 50))
    }
    return (await frame.webContents.capturePage()).toPNG().toString('base64')
  } finally {
    frame.destroy()
    rmSync(folder, { recursive: true, force: true })
  }
}

/**
 * THE OFFICE HAS THE NOTE PAGE, as an office page the window shows has said. Only now does the window ask the
 * system for the quick-note key and put New quick note in its tray, so neither opens a page the office does not
 * know. The system may refuse the key, and then the window's log and its tray say so. Said again, it changes
 * nothing: the window keeps the answer until it closes.
 */
function offerTheQuickNote() {
  if (theOfficeHasTheNotePage()) return
  theQuickNoteKeyIsSet = globalShortcut.register(THE_QUICK_NOTE_KEY.accelerator, () => openAQuickNote())
  if (!theQuickNoteKeyIsSet) process.stderr.write(`${WINDOW_WORDS.en.quickNoteKeyNotSet(THE_QUICK_NOTE_KEY.said)}\n`)
  setTheTrayMenu()
}

/** Build the tray's menu again from what the window knows now, and set it. */
function setTheTrayMenu() {
  theTrayMenuSet = theTrayMenu()
  theTray?.setContextMenu(Menu.buildFromTemplate(theTrayMenuSet))
}

/** The tray's menu, in the window's language. */
function theTrayMenu() {
  return theTrayItems(
    words(),
    {
      open: () => void TRAY_PRESSES.open(),
      newNote: () => TRAY_PRESSES.newNote(),
      restart: () => void TRAY_PRESSES.restart(),
      shutDown: () => void TRAY_PRESSES.shutDown(),
      // Electron's own login item: System Settings shows it under General, Login Items, and on Windows it
      // is a value of the person's Run key. The menu is built again so its tick says what the system now
      // holds, not what was pressed.
      openAtLogin: (on) => {
        app.setLoginItemSettings({ openAtLogin: on })
        setTheTrayMenu()
      },
    },
    {
      platform: process.platform,
      packaged: app.isPackaged,
      opensAtLogin: () => isSetToOpenAtLogin(process.platform, app.getLoginItemSettings()),
      quickNoteKey: theQuickNoteKeyIsSet === null ? null : { ...THE_QUICK_NOTE_KEY, set: theQuickNoteKeyIsSet },
    },
  )
}

async function start() {
  const icon = thePicture(THE_WINDOWS_ICON)
  theWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: words().title,
    icon,
    show: true,
    webPreferences: {
      preload: join(REPO, 'src', 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  giveTheWindowItsMenuRow(theWindow, THE_MAIN_WINDOW, process.platform)
  // W4: the close button hides the window to the tray. Only a shutdown closes it.
  theWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    theWindow?.hide()
  })
  // The question covers the whole page, so it follows a resized window.
  theWindow.on('resize', () => fitTheQuestion())
  const trayPicture = thePicture(THE_TRAYS_PICTURE.path)
  // A Mac draws a template picture in the menu bar's own colour (src/desktop/the-window-on-this-system.mjs).
  if (THE_TRAYS_PICTURE.template) trayPicture.setTemplateImage(true)
  theTray = new Tray(trayPicture)
  theTray.setToolTip(words().trayTooltip)
  setTheTrayMenu()
  theTray.on('click', () => showTheWindow())
  // The window watches its server from now on, to start it again when it stops without being asked to (9 above).
  setInterval(watchTheServer, WATCH_EVERY_MS)
  theWindow.webContents.on('did-finish-load', () => void readTheOfficesMode())
  theWindow.webContents.on('console-message', (details) => void whenThePageSays(details.message))
  // WHEN THE PAGE'S RENDERER ENDS, the window loads the same page again and says so. Electron does not:
  // the window stays empty and nothing sent to the page is answered. Round 16's container run showed
  // that on the Chinese check page without the sandbox: just after the GPU process exited, Electron said
  // the page's frame was disposed, and the probe's questions went unanswered.
  //
  // ROUND 16C: A FEW TIMES, THEN A LOUD STOP. A page that stops on every load would otherwise be loaded
  // for ever, so the window loads it again at most RELOADS_AT_MOST times in RELOADS_WITHIN_MS. The next
  // stop in that time ends it: the window loads it no more, and shows a plain page of its own saying so.
  // While Mole Office is shutting down, it never loads the page again: the page ending then is the quit.
  theWindow.webContents.on('render-process-gone', (_event, details) => {
    const stopped = `The window's page stopped (${details.reason}, exit code ${String(details.exitCode)})`
    if (quitting) {
      process.stderr.write(`${stopped} while Mole Office is shutting down, so the window does not load it again.\n`)
      return
    }
    if (stoppedReloading) {
      process.stderr.write(`${stopped}. The window stopped loading its page earlier, so it does nothing now.\n`)
      return
    }
    const now = Date.now()
    reloadedAt = reloadedAt.filter((at) => now - at < RELOADS_WITHIN_MS)
    if (reloadedAt.length >= RELOADS_AT_MOST) {
      stoppedReloading = true
      const times = reloadedAt.length + 1
      const said = WINDOW_WORDS.en.keptStopping
      process.stderr.write(`${stopped}. ${said.why(times, RELOADS_WITHIN_MS / 1000)} ${said.todo(theOfficeAddress)}\n`)
      showThePageKeptStopping(times)
      return
    }
    reloadedAt.push(now)
    process.stderr.write(`${stopped}, so the window loads it again (${String(reloadedAt.length)} of at most ${String(RELOADS_AT_MOST)} times in ${String(RELOADS_WITHIN_MS / 1000)} seconds).\n`)
    theWindow?.webContents.reload()
  })

  // The check page asks for what it shows, and for its presses. Only the window's own local page
  // may ask: a request from any other page is refused.
  /** @param {Electron.IpcMainInvokeEvent} event */
  const fromTheCheckPage = (event) => event.senderFrame?.url.startsWith('file:') === true
  ipcMain.handle('the-check', (event) => {
    if (!fromTheCheckPage(event)) return null
    const w = words()
    return {
      ...theCheck,
      language: theLanguage(),
      title: w.title,
      about: w.about(theVersion()),
      labels: { openAnyway: w.openAnyway, openTheOffice: w.openTheOffice, checkAgain: w.checkAgain, restartTheService: w.trayRestart },
    }
  })
  ipcMain.handle('check-again', async (event) => {
    if (!fromTheCheckPage(event)) return
    // The person's Check again forgets the tries to start the server again, so they start over (9 above).
    theTriesMade = []
    await findTheOffice(true)
  })
  ipcMain.handle('open-anyway', async (event) => {
    if (fromTheCheckPage(event) && theOfficeAddress !== null) await openTheOfficeAt(theOfficeAddress, [], theCheck.answer)
  })
  // The page's Restart the service is the tray's Restart, pressed on the page.
  ipcMain.handle('restart-the-service', async (event) => {
    if (fromTheCheckPage(event)) await TRAY_PRESSES.restart()
  })

  // THE QUESTION'S WORDS AND ITS TWO PRESSES. Only the view this window made may ask, and only
  // while it is on its own file page: any other page is given nothing and changes nothing.
  /** @param {Electron.IpcMainInvokeEvent} event */
  const fromTheQuestionPage = (event) =>
    theQuestion !== null && event.sender === theQuestion.webContents && event.senderFrame?.url.startsWith('file:') === true
  ipcMain.handle('the-question', (event) => {
    if (!fromTheQuestionPage(event)) return null
    const w = words()
    return {
      language: theLanguage(),
      words: {
        question: w.trayShutDownQuestion,
        says: w.trayShutDownSays,
        yes: w.trayShutDownYes,
        cancel: w.trayShutDownCancel,
      },
    }
  })
  ipcMain.handle('answer-the-question', async (event, answer) => {
    if (!fromTheQuestionPage(event)) return
    if (answer !== 'yes' && answer !== 'cancel') return
    await answerTheShutDownQuestion(answer)
  })

  // THE WEB PAGE (11 above). When the window's own page is replaced, by a reload or by the check page, its box is gone
  // with it, so the view is hidden until an office page places it again. A route change inside the office page is not
  // a new page, and keeps the view where it is.
  theWindow.webContents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument || theWebPage === null) return
    theWebPage.theOfficeIsAway = true
    showOrHideTheWebPage()
  })
  giveTheOfficePageItsBridge()

  /**
   * WHAT A TEST READS AND PRESSES, from the main process. Playwright's `electron.evaluate` reaches
   * this process and nothing else does: no page can, because the preload exposes none of it. Under a
   * virtual display there is no panel to show the tray, so this is how a test presses its items.
   *
   * An installed window is driven the same way, through Electron's inspector, by a script run on the
   * Node the installation carries (tests/installed/drive-the-window.mjs), because a machine with no
   * Node has no Playwright. So the hook also closes the window as its close button does, sets the
   * light or dark look, and gives back a picture of what the window shows.
   */
  globalThis.theMoleOfficeWindow = {
    state: () => ({
      check: theCheck,
      officeAddress: theOfficeAddress,
      language: theLanguage(),
      // The About line the check page shows, so a test of an installed window can say which version it drove.
      about: words().about(theVersion()),
      developer: theOfficeIsInDeveloperMode,
      visible: theWindow?.isVisible() ?? false,
      // Which page the window shows, and whether it is still loading: the check page is a file:, the office is not.
      showing: theWindow === null ? null : { url: theWindow.webContents.getURL(), loading: theWindow.webContents.isLoading() },
      questionShown: theQuestion !== null,
      trayShutDownWent: theTrayShutDownWent,
      // The quick-note key, whether the system gave it (null before the window asked), whether an office page has
      // said its office has the note page, and each note window open: its page, and whether it stays on top.
      quickNote: {
        key: THE_QUICK_NOTE_KEY.accelerator,
        set: theQuickNoteKeyIsSet,
        page: theOfficeHasTheNotePage(),
        windows: theNotesOpen(theNotes),
      },
      // Whether the window watches a server to start it again, how many tries it has made and not forgotten, and
      // whether a try waits (9 above).
      startsTheServerAgain: { watching: theWatchedServer !== null, tries: theTriesMade.length, waiting: theWaitingTry !== null },
    }),
    // The tray's menu as it was last set. The key beside an item, and an item that cannot be pressed, are said
    // only where they are.
    trayItems: () =>
      theTrayMenuSet.map((item) =>
        'id' in item
          ? { id: item.id, label: item.label, ...(item.accelerator === undefined ? {} : { key: item.accelerator }), ...(item.enabled === false ? { enabled: false } : {}) }
          : { separator: true },
      ),
    // Answers which way a Shut down went, since the window may be gone before its state can be read again.
    press: async (/** @type {'open' | 'newNote' | 'restart' | 'shutDown'} */ id) => {
      await TRAY_PRESSES[id]()
      return id === 'shutDown' ? theTrayShutDownWent : null
    },
    // The check page's Open press, as the person makes it when the window runs without its sandbox.
    openTheOffice: async () => {
      if (theOfficeAddress !== null) await openTheOfficeAt(theOfficeAddress, [], theCheck.answer)
    },
    closeTheWindow: () => theWindow?.close(),
    look: (/** @type {'light' | 'dark'} */ theme) => {
      nativeTheme.themeSource = theme
      // A window started by the tests' driver keeps the system's colour scheme from reaching its
      // pages, so the question is also told the look through the token layer's own attribute. The
      // window's page takes the same look through the driver's own emulation.
      if (theQuestion !== null) {
        void theQuestion.webContents
          .executeJavaScript(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`)
          .catch(() => undefined)
      }
    },
    // Whether the question is shown, its words, and how many views of it there are: a second press
    // shows the same question once.
    shutDownQuestion: () => {
      if (theQuestion === null) return null
      const w = words()
      return {
        shown: true,
        views: theWindow?.contentView.children.length ?? 1,
        language: theLanguage(),
        words: { question: w.trayShutDownQuestion, says: w.trayShutDownSays, yes: w.trayShutDownYes, cancel: w.trayShutDownCancel },
      }
    },
    answerTheShutDownQuestion: async (/** @type {'yes' | 'cancel'} */ answer) => {
      if (theQuestion === null) return
      const which = answer === 'yes' ? '#yes' : '#cancel'
      const deadline = Date.now() + 10_000
      // Press the page's own button, so the test goes through question.js, its preload and the
      // sender check, as the person's press does. It returns once the question is gone: the view is
      // not closed under a caller, and a closing window is not asked to quit halfway through that.
      while (theQuestion !== null && !theQuestion.webContents.isDestroyed() && Date.now() < deadline) {
        const click = theQuestion.webContents
          .executeJavaScript(`(() => { const button = document.querySelector(${JSON.stringify(which)}); if (button === null || button.textContent === '') return false; button.click(); return true })()`)
          .catch(() => false)
        // A page that cannot answer in time is not allowed to hold the caller, and it is not answered
        // for here either: an answer made in this process would skip question.js and the sender check
        // that the test is there to go through. A press that went through may have closed the page
        // before its reply came back, and then no question is left.
        const pressed = await Promise.race([click, new Promise((done) => setTimeout(() => done('no answer'), 3_000))])
        if (pressed === true) break
        if (pressed === 'no answer') {
          if (theQuestion === null) return
          throw new Error(`The question's page did not answer the ${answer} press within 3 s, and the question is still shown.`)
        }
        await new Promise((done) => setTimeout(done, 50))
      }
      const gone = Date.now() + 2_000
      while (theQuestion !== null && Date.now() < gone) await new Promise((done) => setTimeout(done, 25))
    },
    // The window's page, with the question over it when the question is shown.
    picture: async () => pictureOfTheWindow(),
    // What the page shows has drawn, read from the page itself: how many of the check page's lines it
    // shows, how much text an office page shows, and the background it is painted in. A picture taken
    // before this matches the window's state shows a page without its style (round 13's Chinese dark one).
    drawn: async () =>
      theWindow === null
        ? null
        : await theWindow.webContents.executeJavaScript(
            `(() => { const bg = (el) => getComputedStyle(el).backgroundColor; const body = bg(document.body); return { url: location.href, lines: document.querySelectorAll('#lines > *').length, text: document.body.innerText.length, background: body === 'rgba(0, 0, 0, 0)' ? bg(document.documentElement) : body } })()`,
          ),
  }

  await findTheOffice(true)
}
