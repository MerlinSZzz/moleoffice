// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW FINDS ITS OFFICE, AND THE TRAY KEEPS IT (criteria W2(b), W2(c), W3 shown and W4; wave
 * 13t's plan hp7Z-IW9JWSX, piece H4; src/desktop/main.mjs).
 *
 * Every office here is this test's own: a folder, a database, a home and a port it makes, never the
 * live office's port.
 * The window is the real one, `src/desktop/main.mjs`, in a real Electron, under the virtual display the
 * window list starts (tests/the-window-display.ts), with --no-sandbox as H0 measured.
 *
 *   1. With nothing running, the window starts the office with `mole-office start`, says it answers,
 *      and opens it. Its close button hides it and stops nothing. A second launch hands over to it and
 *      exits, and no second service starts. The tray's restart restarts the service, and the window
 *      opens it again. The tray's shut down asks first, then stops the service and the window.
 *   2. With a service already running, a window finds it through the service lock and starts none.
 *   3. When the office answering at the declared port is another database, the window says so in
 *      words, in English and in Chinese, and does not open that office as this one.
 *
 * The tray has no panel under a virtual display, so its items are read and pressed through the hook
 * src/desktop/main.mjs keeps on its main process for that (`globalThis.theMoleOfficeWindow`).
 *
 * When MOLE_OFFICE_WINDOW_PICTURES names a folder, the window's pictures are kept there: the new
 * office's first page open in the window, and the check page saying the wrong world, in light and
 * dark, in English and in Chinese, each at 1440, 990, 660 and 390 pixels wide. Since round 14d the
 * check page's first start and its Open press are kept as well, the same ways; the first start's
 * pictures come from a case that runs only then.
 *
 * MUTATIONS, in src/desktop/main.mjs unless another file is named:
 *   - the single-instance lock is not taken: a second launch stays, case 1 red;
 *   - the close button closes the window: the app ends, case 1 red;
 *   - the tray's restart runs `start` instead of `restart`: the service is the same process, case 1 red;
 *   - the window does not start a service when nothing answers: case 1 red;
 *   - the wrong world is opened as if it were this office: case 3 red;
 *   - the tray's picture names a file that is not there: the window refuses to start, every case red;
 *   - the check page's picture names a file that is not there (in src/desktop/check.html): case 3 red;
 *   - `markEveryPageOf` adds nothing (src/config/the-window-mark.mjs): the window's page does not say
 *     it is the window, cases 1 and 2 red;
 *   - `whatTheWindowSays` leaves out what the person can do (src/config/the-self-check.mjs): case 3 red;
 *   - the check page draws a folder path as plain text (src/desktop/check.js): case 3 red;
 *   - the pairing page's rule for a Chinese heading is taken out (src/web/pages/PairingPage.tsx):
 *     case 2 red, in its browser.
 *
 * ROUND 14 OF WAVE 13T. Every window here runs with --no-sandbox, so each check page ends with the
 * sandbox warning and a healthy office opens on the Open press (`pressOpen`). A first start says only
 * that Mole Office is starting. MUTATIONS, in src/desktop/main.mjs:
 *   - a first start says the self-check's not-answering line before "Starting Mole Office.": case 1 red;
 *   - the warning is left off the check page: cases 1, 2 and 3 red;
 *   - the window never reads the office's Developer mode (`readTheOfficesMode` returns at once): case 1 red.
 * And in other files:
 *   - src/desktop/check.css keeps colours of its own instead of the office's tokens: case 3 red;
 *   - the Chinese tray says an English word (src/config/the-self-check-words.mjs): case 2 red.
 *
 * ROUND 15 OF WAVE 13T. The check page ends with its About line, which names the version package.json
 * holds (decision sKPFWjOuQVEe), in English and Chinese. MUTATIONS:
 *   - src/desktop/check.js does not draw the About line: case 3 red;
 *   - src/desktop/main.mjs gives the About line no version (`w.about(null)`): case 3 red.
 *
 * ROUND W44 OF WAVE 13T: THE WINDOW PAIRS ITSELF. Before the window opens
 * an office that offers pairing and has not paired it, it presses the pairing door itself, from a hidden page of
 * its own on the office's address (SW-1; W44's window pressed through its Electron session). So the window never
 * shows the Pairing page, and a web browser still does.
 *   - Case 1: a new office opens on its first page. The page's own read of the door answers paired, the
 *     window's session holds the key's cookie, and the office logged one press, which the window's hidden pairing
 *     page sent. Opened again after the tray's restart, the window reads the door once more and presses nothing.
 *   - Case 2: the window, closed and opened again, reads the door once and presses nothing. A browser
 *     with no cookie that opens the same office is still shown the Pairing page and its press.
 *   - Case 4: a refused press shows the check page with the refusal's words and Check again, and writes
 *     one line to the window's log. A refusal with the code senderNotReadInTime is asked again first.
 *   - Case 5: where the door does not offer pairing, nothing is pressed and the office opens as before.
 * THE ANSWERS IN CASES 4 AND 5 ARE THIS TEST'S, NOT THE OFFICE'S: `aWatchOnTheDoor` puts a stand-in in
 * front of the window's pairing page for the door alone. What the office itself was sent is read from its
 * request log, the `api_calls` table. MUTATIONS, in src/desktop/main.mjs, each after a control run of the
 * window list's six files, which passed:
 *   - the press is never made: cases 1, 2 and 4 red, and cases 1 and 2 of
 *     tests/the-menu-asks-before-it-shuts-down.test.ts;
 *   - the press is made with Node's fetch from the main process: cases 1, 2, 4 and 5 red, and the same
 *     two cases of the menu's file;
 *   - the press is made when the window is already paired: cases 1 and 2 red;
 *   - the press is made when the door does not offer pairing: case 5 red;
 *   - a refused press opens the Pairing page: case 4 red.
 * The two older mutations of the window's mark and of the Chinese heading rule were run again with this
 * code, and turned red what the list above says; the first also turns red the one case of
 * tests/the-window-opens-the-office.test.ts, as that file says.
 * That no sentence about pairing is added, to Settings or anywhere else, is held by the round's diff.
 *
 * ROUND W45 OF WAVE 13T: THE WINDOW SAYS WHICH WAY ITS PAIRING FAILED (order Taoqs_zf5qoU, and
 * ruling WkXyAvl74-3Z that a pairing that fails is a failure said in words). The window's two
 * sentences for it are its only words about pairing.
 *   - Case 6: when the window's read of the door, or its press, gets no answer at all, the check page says
 *     the window could not reach the office, with the error the window got, and offers Check again. It does
 *     not say that the office answered. When the office refuses the read, the check page says the office
 *     answered, with its reason, as case 4 shows for a refused press. Each failure is written once to the
 *     window's log, and nothing loads. The failures are the watch's, in the network's place.
 * Case 6 was red on W44's code, at its first press: the window said the office answered, and nothing had.
 * MUTATIONS, in src/desktop/main.mjs, each after a control run of the window list's six files, which passed:
 *   - a request that got no answer is handed back as the office's refusal, as W44's code did: case 6 red;
 *   - a refused read is handed back as a request that got no answer: case 6 red;
 *   - the window's log says the refusal's sentence whichever way the pairing failed: case 6 red.
 *
 * ROUND W45 OF WAVE 13T: A QUICK NOTE FROM ANY PROGRAM. A decision picked option C, and 13y builds the note
 * page. The window holds a key from the system (src/desktop/the-quick-note.mjs), and the tray
 * has New quick note after Open.
 *   - Case 7: the system gave the window its key, and the tray shows the key beside New quick note. A note asked
 *     for twice while the check page waits for Open does not open yet: the check page says once, first, that it
 *     opens once the office is open, and the log says so once. When Open opens the office, one note opens. Then
 *     the key pressed on the display, the tray's New quick note and the office page's line each open one more.
 *     Each note window shows the note page's address on the office the window shows, stays on top of other
 *     windows and is shown. A note window that is closed is gone, and the others stay.
 *   - Cases 1 and 2: the tray's items hold New quick note after Open, in English and in Chinese, with the key.
 * THE KEY IS PRESSED ON THE DISPLAY, through its XTEST extension as `pressAt` presses the mouse, so it reaches
 * the window as a key pressed in any other program does. The window runs on a display of its own
 * (aDisplayOfItsOwn), because the display xvfb-run makes takes a connection only with its cookie. Only Linux
 * under X is shown here: a Wayland desktop, Windows and the Mac are not.
 * MUTATIONS, in src/desktop/main.mjs, each after a control run of the window list's six files, which passed:
 *   - the key is never asked of the system: cases 1, 2 and 7 red, as the tray then says the key is not set;
 *   - the key's press opens nothing: case 7 red;
 *   - a note asked for before the office showed is dropped when it shows: case 7 red;
 *   - a note window does not stay on top: case 7 red;
 *   - the office page's line opens nothing: case 7 red;
 *   - the check page does not say that a note waits: case 7 red;
 *   - a second ask while a note waits is not left out: case 7 red.
 *
 * ROUND W47 OF WAVE 13T: A QUICK NOTE ONLY FOR AN OFFICE THAT HAS THE NOTE PAGE (decision vSqupTqsiUW1). The window
 * offers New quick note, and asks the system for its key, only once the office page it shows has said that it has
 * the note page (THE_PAGE_SAYS.itHasTheQuickNotePage). An office page built from code that has the note page's route
 * says it (src/web/main.tsx).
 * THE ANSWER IS THIS TEST'S, in cases 7 and 8 (theOfficePageAnswersOfTheNotePage): a script the window's page runs
 * before each office page says the line in case 7, and drops it wherever the page says it in case 8. So both hold
 * whether or not 13y's page is built, and cases 1 and 2 read the tray before the office page has shown.
 *   - Case 8: an office page that does not say it. The tray holds no New quick note, and the key is not taken from
 *     the system. The key pressed on the display opens nothing, and the office page's line asking for a note opens
 *     nothing either; the window's log says once that no note opened, and why.
 *   - Case 7: before the office page has said it, the same. Once it has, the key is taken and the tray shows it
 *     beside New quick note, and the key, the tray and the page's line each open a note, as round W45 built them.
 *     A note asked for twice while the tray restarts the office waits, and opens once the office shows again.
 *     The case ends with the tray's Shut down, as case 1 does after its restart. Closed by the test's driver
 *     instead, the window's processes ended within 20 seconds, but the close did not return until the restarted
 *     service ended. Why is not shown yet.
 *   - Cases 1 and 2: before the office page shows, the tray holds no New quick note, in English and in Chinese.
 * Every case here was red on W46's code, which took the key and offered New quick note at its start.
 * THE STATE ONCE THREW IN CASE 7, read in the moment between a closing note window's end and its 'closed' event.
 * Case 5 of tests/the-quick-note-key-on-each-system.test.ts holds the fix (theNotesOpen), because this case
 * cannot make that moment come on demand.
 * MUTATIONS, in src/desktop/main.mjs, each after a control run of the window list's six files, which passed:
 *   - the window takes the key and offers New quick note at its start, as W46's code did: cases 1, 2, 7 and 8 red;
 *   - the window does not hear the office page say that it has the note page: case 7 red;
 *   - the tray's menu is not made again once the office page has said it: case 7 red;
 *   - a note asked for before the office page has said it opens anyway: case 8 red;
 *   - the window's log says nothing of a note asked for before the office page has said it: case 8 red;
 *   - once the office page has said it, the window does not ask the system for the key: case 7 red.
 *
 * SW-1, ROUND 1, OF WAVE 13T: THE WINDOW PAIRS WITH A DEVICE KEY IN TWO HALVES. The office no longer puts a whole
 * key in a browser. Its press sets a cookie half, HttpOnly, and answers a header half, and only the two together are
 * the person. So the window pairs from a hidden page of its own whose address is the pairing door, in the window's
 * session. That page's script reads the door and presses it with the window's name for itself, in the window's
 * language, and keeps the header half in the office's own storage on that address, where the office's page reads it.
 * The window's main process sends the door nothing.
 *   - THE WATCH IS A ROUTE ON THE WINDOW'S BROWSER CONTEXT NOW (`aWatchOnTheDoor`). It counts and answers only the
 *     fetch and XHR requests of the hidden pairing page, told apart by that page's address. The page's own load, the
 *     office page's own reads of the door and this test's reads go to the office. A request it gives no answer is
 *     aborted, so the error the window gets is Chromium's own, and case 6 reads it from the check page.
 *   - Cases 1 and 2: the window's page keeps a header half, its session holds the cookie half, HttpOnly, and no old
 *     key cookie, and its read of the door with both halves says paired. In case 1 the office lists one credential
 *     under the window's English name for itself, confirmed, and after the tray's restart the same one, with
 *     nothing pressed.
 *   - The case "ending a browser's credential leaves the window paired": a browser pairs with the same office, and
 *     the window's page ends that browser's credential, as the person does on the Visitors page. The browser's read
 *     with both its halves then says it is not paired. The window's read still says paired, and its own credential is
 *     still confirmed.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import type { ElectronApplication, Page, Request } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'
import { DEVICE_HALF_COOKIE, DEVICE_HALF_HEADER, DEVICE_HALF_KEY, KEY_COOKIE } from '../src/config/key-header.mjs'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { theQuickNoteAddress } from '../src/config/the-quick-note-address.mjs'
import * as quickNoteAddress from '../src/config/the-quick-note-address.mjs'
import { theSandboxWarning } from '../src/config/the-self-check.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { THE_PAGE_SAYS, isTheWindow } from '../src/config/the-window-mark.mjs'
import { executableOf, theProcessAt } from '../src/config/session-process.mjs'
import { serviceLockPathFrom, theVersion } from '../src/config/settings.mjs'
import { createI18n } from '../src/shared/i18n.ts'
import { A_NOTE_ASKED_FOR_WITHOUT_THE_NOTE_PAGE, theQuickNoteKey } from '../src/desktop/the-quick-note.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment, storeNormalModeWhereNothingIsStored } from './helpers.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { pairTheContext } from './a-paired-context.ts'
import { electronsBinary, stillRunning, theOfficesBackground, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_WINDOW = join(REPO, 'src', 'desktop', 'main.mjs')
const PICTURES = process.env['MOLE_OFFICE_WINDOW_PICTURES']

const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`the-window-finds-its-office: skipped. ${WHY_NOT}`)

/** Every office's process group this file found in a service lock. */
const groups = new Set<number>()
/** Every Electron this file started, by the pid that leads its own group, and its binary. */
const electrons = new Map<number, string>()
const folders = new Set<string>()
/** Every world this file made, so the clean-up reads each one's lock even when a case failed before it did. */
const worlds = new Set<World>()

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function aFreePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

interface World {
  dir: string
  database: string
  port: number
  env: NodeJS.ProcessEnv
}

/** An office's world of this test's own; `port` may be shared, to make a wrong world on purpose. */
async function aWorld(name: string, port?: number): Promise<World> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  const thePort = port ?? (await aFreePort())
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(dir, thePort, await aFreePort(), { database }),
    HOME: home,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    // Playwright starts the window with --inspect and --remote-debugging-port, which the window refuses unless this says on.
    MOLE_OFFICE_WINDOW_DEBUGGING: 'on',
  }
  const world = { dir, database, port: thePort, env }
  worlds.add(world)
  return world
}

/** The service lock of a world now, recording its group to stop. */
function theLock(world: World) {
  const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: world.database }))
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  return lock.state === 'read' ? lock.lock : null
}

/** Run the mole-office command in a world. */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: world.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      theLock(world)
      done({ code, out })
    })
  })
}

/** One line the window shows: `AWindowLine` in src/config/the-self-check.mjs. */
type AWindowLine = { say: string } | { heading: string } | { label: string; value: string; path?: true } | { todo: string }
/** A note window the window has open: its page, whether it stays on top, and whether it is shown (round W45). */
type ANoteWindow = { url: string; onTop: boolean; visible: boolean }
type WindowState = {
  check: { lines: AWindowLine[]; offers: string[]; busy: boolean; answer: string | null }
  officeAddress: string | null
  language: string
  developer: boolean
  visible: boolean
  // Whether the system gave the window its key: null before the window asked, which it does only once the office page
  // has said it has the note page (`page`, round W47).
  quickNote: { key: string; set: boolean | null; page: boolean; windows: ANoteWindow[] }
}

/**
 * THE PROCESS OF EACH WINDOW, kept at launch: Playwright's app.process() gives undefined once Electron
 * has exited, so a clean-up after a shutdown asks this instead (`stillRunning` in the-window-display.ts).
 */
const launched = new WeakMap<ElectronApplication, ChildProcess>()
/** What each window wrote to its log, which is its standard error, from its launch. */
const logged = new WeakMap<ElectronApplication, string[]>()

/** Open the window in a world. */
async function aWindow(world: World, lang?: string): Promise<ElectronApplication> {
  const binary = electronsBinary()
  if ('missing' in binary) throw new Error(binary.missing)
  const { _electron } = await import('playwright')
  const app = await _electron.launch({
    executablePath: binary.path,
    args: ['--no-sandbox', ...(lang === undefined ? [] : [`--lang=${lang}`]), THE_WINDOW],
    env: world.env as Record<string, string>,
    timeout: 60_000,
  })
  const child = app.process()
  launched.set(app, child)
  const said: string[] = []
  logged.set(app, said)
  child.stderr?.on('data', (chunk: Buffer) => said.push(chunk.toString()))
  const pid = child.pid
  if (pid !== undefined) electrons.set(pid, binary.path)
  // A new office's owner starts in Developer mode. The window's office pages store Normal where nothing is stored,
  // so that a case turns Developer mode on itself.
  await storeNormalModeWhereNothingIsStored(app.context())
  return app
}

/** The lines of a window's log that are this sentence, whole. */
function theLinesSaying(app: ElectronApplication, sentence: string): number {
  return (logged.get(app) ?? []).join('').split('\n').filter((line) => line === sentence).length
}

/** What the office logged of the requests to its pairing door, oldest first, read from its own request log. */
function thePairingCalls(world: World): { method: string; status: number }[] {
  const db = new Database(world.database, { readonly: true, fileMustExist: true })
  try {
    return db.prepare("SELECT method, status FROM api_calls WHERE route = '/api/office/pairing' ORDER BY at_ms").all() as { method: string; status: number }[]
  } finally {
    db.close()
  }
}

/** The presses the office logged at its pairing door, by the status each was answered with. */
const thePressesLogged = (world: World): number[] => thePairingCalls(world).filter((call) => call.method === 'POST').map((call) => call.status)

/**
 * THE COOKIES THE WINDOW'S SESSION HOLDS FOR AN ADDRESS, by name and whether each is HttpOnly. Only those
 * two are read: the cookie half is half of the window's key, and its value is never read here.
 */
function theWindowsCookies(app: ElectronApplication, address: string): Promise<{ name: string; httpOnly: boolean }[]> {
  return app.evaluate(async ({ session }, url) => (await session.defaultSession.cookies.get({ url })).map((one) => ({ name: one.name, httpOnly: one.httpOnly === true })), address)
}

/**
 * An answer the stand-in gives in the office's place: a status and a JSON body, or, from round W45, no answer at all.
 * Since SW-1 a request given no answer is aborted, and the error the window gets is Chromium's, not this test's.
 */
type AnAnswer = { status: number; body: unknown } | 'no answer'

/** What each window's watch has seen at the pairing door, by method. Kept in this test's process. */
const watches = new WeakMap<ElectronApplication, { GET: number; POST: number }>()

/** Whether an address is the pairing door's. */
const isThePairingDoor = (address: URL): boolean => address.pathname === '/api/office/pairing'

/**
 * WHETHER A REQUEST CAME FROM THE WINDOW'S HIDDEN PAIRING PAGE (SW-1). That page's own address is the pairing door, and
 * no other page in the window has that address. A request whose page cannot be read is not that page's.
 */
function fromThePairingPage(request: Request): boolean {
  try {
    return isThePairingDoor(new URL(request.frame().url()))
  } catch {
    return false
  }
}

/**
 * A WATCH ON THE WINDOW'S PAIRING PAGE, AT THE PAIRING DOOR ALONE (round W44, and SW-1). Since SW-1 the window reads and
 * presses the door from a hidden page of its own whose address is the door, so the watch is a route on the window's
 * whole browser context, for the door's path. It counts the fetch and XHR requests that page sends to the door, by
 * method. For the nth request of a method it gives the nth answer it was given for that method, if there is one: a
 * status and a JSON body, or an aborted request for no answer. The office is then never asked. The hidden page's own
 * load, the office page's own reads of the door, this test's reads from that page, and every request after the answers
 * run out go to the office as they were sent. ITS ANSWERS ARE THIS TEST'S, NOT THE OFFICE'S. Given no answers, it only
 * counts.
 */
async function aWatchOnTheDoor(app: ElectronApplication, answers: { GET: AnAnswer[]; POST: AnAnswer[] } = { GET: [], POST: [] }): Promise<void> {
  const seen = { GET: 0, POST: 0 }
  watches.set(app, seen)
  await app.context().route(isThePairingDoor, async (route) => {
    const request = route.request()
    const method = request.method()
    const asked = request.resourceType() === 'fetch' || request.resourceType() === 'xhr'
    if (!asked || (method !== 'GET' && method !== 'POST') || !fromThePairingPage(request)) {
      await route.continue()
      return
    }
    const answer = answers[method][seen[method]]
    seen[method] += 1
    if (answer === undefined) await route.continue()
    else if (answer === 'no answer') await route.abort()
    else await route.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) })
  })
}

/** The requests the watch saw at the pairing door since it was put there, by method. */
function whatTheWatchSaw(app: ElectronApplication): Promise<{ GET: number; POST: number }> {
  const seen = watches.get(app)
  if (seen === undefined) return Promise.reject(new Error('No watch was put on the pairing door.'))
  return Promise.resolve({ ...seen })
}

/** The header half the window's pairing page kept in the office's storage, where the office's page reads it. */
function theHeaderHalfIn(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), DEVICE_HALF_KEY)
}

/** What the window's page reads at the pairing door, sending the header half with the cookie half its session sends. */
function thePagesReadOfTheDoor(page: Page, half: string): Promise<unknown> {
  return page.evaluate(
    async ({ header, value }) => ((await (await fetch('/api/office/pairing', { headers: { [header]: value } })).json()) as { paired?: unknown }).paired,
    { header: DEVICE_HALF_HEADER, value: half },
  )
}

/** The credentials the office lists, read from the window's page with both halves: each one's id, name and standing. */
function theCredentialsFrom(page: Page, half: string): Promise<{ id: string; name: string; standing: string }[]> {
  return page.evaluate(
    async ({ header, value }) => {
      const reply = await fetch('/api/office/visitors', { headers: { [header]: value } })
      if (!reply.ok) throw new Error(`The office's list of credentials answered ${String(reply.status)}.`)
      const said = (await reply.json()) as { credentials: { id: string; name: string; standing: string }[] }
      return said.credentials.map(({ id, name, standing }) => ({ id, name, standing }))
    },
    { header: DEVICE_HALF_HEADER, value: half },
  )
}

/**
 * THE WINDOW'S PAGE IS THE OFFICE'S FIRST PAGE, AND IT IS PAIRED (round W44, and SW-1). The page never went to the
 * Pairing page. It keeps a header half, and its session holds the cookie half, HttpOnly, and no old key cookie. Its
 * own read of the door with both halves answers paired. And it says it is the window, by the mark `markEveryPageOf`
 * adds. Neither half is printed. The header half is handed back, for the case's own reads.
 */
async function theWindowIsPairedAt(app: ElectronApplication, page: Page, address: string): Promise<string> {
  await page.locator('.sbp-shut-down').waitFor({ timeout: 60_000 })
  const half = (await theHeaderHalfIn(page)) ?? ''
  expect(half !== '', "the window's page keeps no header half").toBe(true)
  const cookies = await theWindowsCookies(app, address)
  expect(cookies).toContainEqual({ name: DEVICE_HALF_COOKIE, httpOnly: true })
  expect(cookies.map((one) => one.name), 'the window holds the old key cookie').not.toContain(KEY_COOKIE)
  expect(await thePagesReadOfTheDoor(page, half), "the window's page is not paired").toBe(true)
  expect(await page.evaluate(() => window.location.hash), "the window's page went to another page").toBe('')
  expect(await page.locator('.pair').count(), 'the window showed the Pairing page').toBe(0)
  expect(isTheWindow(await page.evaluate(() => navigator.userAgent)), "the window's page does not say it is the window").toBe(true)
  return half
}

/** Wait until the window's state says what `ready` asks, and give it back. */
async function waitFor(app: ElectronApplication, ready: (state: WindowState) => boolean, what: string, everyMs = 500): Promise<WindowState> {
  const deadline = Date.now() + 120_000
  let last: WindowState | null = null
  while (Date.now() < deadline) {
    last = (await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow?: { state(): unknown } }).theMoleOfficeWindow?.state() ?? null)) as WindowState | null
    if (last !== null && ready(last)) return last
    await sleep(everyMs)
  }
  throw new Error(`The window did not reach "${what}" in 120 seconds. It last said: ${JSON.stringify(last)}`)
}

/**
 * PRESS OPEN, AS THE PERSON DOES. Every window here runs with --no-sandbox, so a healthy office is
 * held on the check page under the sandbox warning until Open is pressed (round 14 of wave 13t).
 */
async function pressOpen(app: ElectronApplication): Promise<void> {
  await app.evaluate(async () => {
    await (globalThis as unknown as { theMoleOfficeWindow: { openTheOffice(): Promise<void> } }).theMoleOfficeWindow.openTheOffice()
  })
}

/** The tray's items as its menu was last set, each an id or a separator. */
async function theTrayItemsOf(app: ElectronApplication): Promise<{ id?: string; label?: string; key?: string; separator?: true }[]> {
  return app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: { trayItems(): { id?: string; label?: string; key?: string; separator?: true }[] } }).theMoleOfficeWindow.trayItems())
}

/** Whether the window holds this key from the system. */
async function theKeyIsTaken(app: ElectronApplication, accelerator: string): Promise<boolean> {
  return app.evaluate(({ globalShortcut }, which) => globalShortcut.isRegistered(which), accelerator)
}

/**
 * THE OFFICE PAGE'S ANSWER ABOUT THE NOTE PAGE, GIVEN BY THIS TEST (round W47). A script the window's page runs
 * before each page it loads: on an office page, 'has it' says THE_PAGE_SAYS.itHasTheQuickNotePage once the page's
 * document is read, and 'has none' drops that line wherever the page says it, on any of its console's ways.
 */
async function theOfficePageAnswersOfTheNotePage(page: Page, answer: 'has it' | 'has none'): Promise<void> {
  await page.addInitScript(
    ({ line, hasIt }) => {
      if (!window.location.protocol.startsWith('http')) return
      if (hasIt) {
        window.addEventListener('DOMContentLoaded', () => console.info(line))
        return
      }
      for (const way of ['log', 'info', 'debug', 'warn', 'error'] as const) {
        const said = console[way].bind(console)
        console[way] = (...args: unknown[]) => {
          if (!(args.length === 1 && args[0] === line)) said(...args)
        }
      }
    },
    { line: THE_PAGE_SAYS.itHasTheQuickNotePage, hasIt: answer === 'has it' },
  )
}

async function pressTheTray(app: ElectronApplication, id: 'open' | 'newNote' | 'restart' | 'shutDown'): Promise<unknown> {
  return app.evaluate(async (_electron, which) => {
    return (globalThis as unknown as { theMoleOfficeWindow: { press(id: string): Promise<unknown> } }).theMoleOfficeWindow.press(which)
  }, id)
}

/** Answer the window's shutdown question, as the person presses one of its two buttons. */
async function answerTheQuestion(app: ElectronApplication, answer: 'yes' | 'cancel'): Promise<void> {
  await app.evaluate(async (_electron, said) => {
    await (globalThis as unknown as { theMoleOfficeWindow: { answerTheShutDownQuestion(answer: 'yes' | 'cancel'): Promise<void> } }).theMoleOfficeWindow.answerTheShutDownQuestion(said)
  }, answer)
}

/** The four widths chapter 6 asks every screen to be looked at in. */
const PICTURE_WIDTHS = [1440, 990, 660, 390] as const

/**
 * A PICTURE AT EACH OF THE FOUR WIDTHS. A page that lasts only a while, as the first start's does, names
 * what it must still say in `still`: the window's state is read after each picture, and a picture taken
 * after the page had moved on is thrown away with an error instead of being kept under that page's name.
 */
async function aPicture(app: ElectronApplication, name: string, theme: 'light' | 'dark', still?: (state: WindowState) => boolean): Promise<void> {
  if (PICTURES === undefined || PICTURES === '') return
  mkdirSync(PICTURES, { recursive: true })
  const page = await app.firstWindow()
  await page.emulateMedia({ colorScheme: theme })
  for (const width of PICTURE_WIDTHS) {
    await app.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900)
    }, width)
    await sleep(400)
    const file = join(PICTURES, `${name}-${String(width)}-${theme}.png`)
    const picture = await page.screenshot({ fullPage: true })
    if (still !== undefined) {
      const now = (await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: { state(): unknown } }).theMoleOfficeWindow.state())) as WindowState
      if (!still(now)) throw new Error(`The picture ${file} was not kept: the page had moved on before it was taken. It then said: ${JSON.stringify(now.check.lines)}`)
    }
    writeFileSync(file, picture)
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800)
  })
}

/**
 * AN X DISPLAY OF ONE WINDOW'S OWN (round W2), for the box a refused window shows on Linux. Xvfb picks a
 * free display number and says it on a pipe (-displayfd), keeps its screen in a file (-fbdir), and starts
 * black (-br), so whatever is lit there was drawn by the one window started on it. It does not reset when its
 * last client leaves (-noreset), because after a reset it answers no new connection (round W45). Xvfb leads a
 * group of its own, and SIGTERM ends it, which also takes its socket and its lock file away. The window list
 * already needs Xvfb, through xvfb-run.
 */
const displays = new Set<ChildProcess>()
async function aDisplayOfItsOwn(): Promise<{ display: string; screen: string; server: ChildProcess }> {
  const folder = mkdtempSync(`${TEST_DATABASE_PREFIX}screen-`)
  folders.add(folder)
  const server = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1024x768x24', '-fbdir', folder, '-br', '-nolisten', 'tcp', '-noreset'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  })
  displays.add(server)
  const display = await new Promise<string>((done, fail) => {
    let said = ''
    const late = setTimeout(() => fail(new Error('Xvfb named no display within 15 s.')), 15_000)
    server.stdio[3]?.on('data', (chunk: Buffer) => {
      said += chunk.toString()
      if (!said.includes('\n')) return
      clearTimeout(late)
      done(said.trim())
    })
    server.on('error', (err) => fail(err))
    server.on('exit', (code) => fail(new Error(`Xvfb ended with ${String(code)} before it named a display.`)))
  })
  return { display, screen: join(folder, 'Xvfb_screen0'), server }
}

/**
 * HOW MUCH OF A DISPLAY IS LIT, and how far right and down, read from the file Xvfb keeps its screen in.
 * The file is an XWD picture: a header of 32-bit big-endian fields (its own size first; the width, the
 * height, the bits per pixel, the bytes per line and the number of colours at fields 4, 5, 11, 12 and
 * 19), then 12 bytes per colour, then the pixels.
 */
function whatIsLit(screen: string): { lit: number; right: number; bottom: number } {
  const xwd = readFileSync(screen)
  const field = (at: number) => xwd.readUInt32BE(at * 4)
  const [width, height, step, line] = [field(4), field(5), field(11) / 8, field(12)]
  const pixels = field(0) + field(19) * 12
  let lit = 0
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = pixels + y * line + x * step
      if (xwd[at] === 0 && xwd[at + 1] === 0 && xwd[at + 2] === 0) continue
      lit += 1
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return { lit, right, bottom }
}

/**
 * A CONNECTION TO AN X DISPLAY'S XTEST EXTENSION, over the display's own socket, because the machine has no
 * xdotool. The X protocol's connection setup and QueryExtension (98). `fake` makes one of XTEST's FakeInput
 * requests (minor 2), and `send` writes them, then GetInputFocus (43), whose answer says the server has taken
 * them. Since round W45, `keycodeOf` asks the server which key gives a keysym, by GetKeyboardMapping (101).
 * A key pressed this way makes the server send every client MappingNotify events (34) before that answer, so
 * `send` passes over events. A read that gets nothing for 10 s fails and says so.
 */
type AnXTest = {
  fake: (type: number, detail: number, atX?: number, atY?: number) => Buffer
  send: (requests: Buffer[]) => Promise<void>
  keycodeOf: (keysym: number) => Promise<number>
}
async function withXTestAt<T>(display: string, act: (x: AnXTest) => Promise<T>): Promise<T> {
  const socket = createConnection(`/tmp/.X11-unix/X${display}`)
  let held = Buffer.alloc(0)
  let more: (() => void) | null = null
  socket.on('data', (chunk: Buffer) => {
    held = Buffer.concat([held, chunk])
    more?.()
  })
  const read = async (want: number): Promise<Buffer> => {
    while (held.length < want) {
      let late: NodeJS.Timeout | undefined
      await Promise.race([
        new Promise<void>((done) => (more = done)),
        new Promise<never>((_done, fail) => (late = setTimeout(() => fail(new Error(`The X server at :${display} sent nothing for 10 s.`)), 10_000))),
      ]).finally(() => clearTimeout(late))
    }
    const out = held.subarray(0, want)
    held = held.subarray(want)
    return out
  }
  await new Promise<void>((done, fail) => {
    socket.once('connect', done)
    socket.once('error', fail)
  })
  try {
    const hello = Buffer.alloc(12)
    hello.write('l', 0)
    hello.writeUInt16LE(11, 2)
    socket.write(hello)
    const head = await read(8)
    if (head[0] !== 1) throw new Error(`The X server at :${display} refused the connection.`)
    const setup = await read(head.readUInt16LE(6) * 4)
    const root = setup.readUInt32LE(32 + Math.ceil(setup.readUInt16LE(16) / 4) * 4 + (setup[21] ?? 0) * 8)
    const name = Buffer.from('XTEST')
    const ask = Buffer.alloc(8 + Math.ceil(name.length / 4) * 4)
    ask[0] = 98
    ask.writeUInt16LE(ask.length / 4, 2)
    ask.writeUInt16LE(name.length, 4)
    name.copy(ask, 8)
    socket.write(ask)
    const extension = await read(32)
    if (extension[0] !== 1 || extension[8] !== 1) throw new Error(`The X server at :${display} has no XTEST extension.`)
    const fake = (type: number, detail: number, atX = 0, atY = 0): Buffer => {
      const request = Buffer.alloc(36)
      request[0] = extension[9] ?? 0
      request[1] = 2
      request.writeUInt16LE(9, 2)
      request[4] = type
      request[5] = detail
      request.writeUInt32LE(type === 6 ? root : 0, 12)
      request.writeInt16LE(atX, 24)
      request.writeInt16LE(atY, 26)
      return request
    }
    const sync = Buffer.alloc(4)
    sync[0] = 43
    sync.writeUInt16LE(1, 2)
    const send = async (requests: Buffer[]): Promise<void> => {
      socket.write(Buffer.concat([...requests, sync]))
      // An event's first byte is its code, 2 or more; an answer's is 1, and an error's 0.
      let answer = await read(32)
      while ((answer[0] ?? 0) >= 2) answer = await read(32)
      if (answer[0] !== 1) throw new Error(`The X server at :${display} did not answer after the press.`)
    }
    // The keyboard's map: for each key from the lowest to the highest the server has, its keysyms.
    const [lowest, highest] = [setup[26] ?? 0, setup[27] ?? 0]
    const keycodeOf = async (keysym: number): Promise<number> => {
      const mapping = Buffer.alloc(8)
      mapping[0] = 101
      mapping.writeUInt16LE(2, 2)
      mapping[4] = lowest
      mapping[5] = highest - lowest + 1
      socket.write(mapping)
      const reply = await read(32)
      if (reply[0] !== 1) throw new Error(`The X server at :${display} did not give its keyboard's map.`)
      const each = reply[1] ?? 1
      const keysyms = await read(reply.readUInt32LE(4) * 4)
      for (let at = 0; at + 4 <= keysyms.length; at += 4) {
        if (keysyms.readUInt32LE(at) === keysym) return lowest + Math.floor(at / 4 / each)
      }
      throw new Error(`No key on the X server at :${display} gives the keysym 0x${keysym.toString(16)}.`)
    }
    return await act({ fake, send, keycodeOf })
  } finally {
    socket.end()
  }
}

/** PRESS THE FIRST MOUSE BUTTON AT A POINT OF AN X DISPLAY, as a person would: a move to the point, a press, a release. */
async function pressAt(display: string, x: number, y: number): Promise<void> {
  await withXTestAt(display, ({ fake, send }) => send([fake(6, 0, x, y), fake(4, 1), fake(5, 1)]))
}

/** The X keysyms of the modifiers an Electron accelerator names, the left key of each, from X11's keysymdef.h. */
const THE_MODIFIERS_KEYSYMS: Record<string, number> = { Control: 0xffe3, Shift: 0xffe1, Alt: 0xffe9, Super: 0xffeb }

/**
 * PRESS A SHORTCUT ON AN X DISPLAY, as a person's keyboard does (round W45): each key of an Electron accelerator
 * down in its order, then each up in the other order. A letter's keysym is its small letter's code.
 */
async function pressTheShortcutAt(display: string, accelerator: string): Promise<void> {
  const keysyms = accelerator.split('+').map((name) => {
    const keysym = THE_MODIFIERS_KEYSYMS[name] ?? (/^[A-Z]$/.test(name) ? name.toLowerCase().charCodeAt(0) : undefined)
    if (keysym === undefined) throw new Error(`This test cannot press the key ${name} of ${accelerator}.`)
    return keysym
  })
  await withXTestAt(display, async ({ fake, send, keycodeOf }) => {
    const keys: number[] = []
    for (const keysym of keysyms) keys.push(await keycodeOf(keysym))
    await send([...keys.map((key) => fake(2, key)), ...[...keys].reverse().map((key) => fake(3, key))])
  })
}

/** The number of the X display a world's window runs on, which the window list's xvfb-run set. */
function theDisplayOf(world: World): string {
  const display = /^:(\d+)/.exec(world.env['DISPLAY'] ?? '')?.[1]
  if (display === undefined) throw new Error('The window runs on no X display this test can press a key on.')
  return display
}

/** Whether a debugger can connect to Node's inspector at this address. */
function aDebuggerConnects(address: string): Promise<'connected' | 'refused' | 'no answer within 5 s'> {
  return new Promise((done) => {
    const socket = new WebSocket(address)
    const late = setTimeout(() => done('no answer within 5 s'), 5_000)
    socket.onopen = () => {
      clearTimeout(late)
      socket.close()
      done('connected')
    }
    socket.onerror = () => {
      clearTimeout(late)
      done('refused')
    }
  })
}

afterAll(async () => {
  // A WINDOW STARTS ITS OFFICE BY ITSELF, so a case that failed before reading the lock has a service
  // this file never recorded. Each world's lock is read here, first, to record its group.
  for (const world of worlds) theLock(world)
  const stillOurs = (pid: number): boolean => {
    const binary = electrons.get(pid)
    const running = executableOf(pid)
    return binary !== undefined && running !== null && running === realpathSync(binary)
  }
  for (const group of [...electrons.keys()].filter(stillOurs)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  // The displays the refusal case started and did not end, each by the group its Xvfb leads.
  for (const group of [...displays].filter(stillRunning).map((server) => server.pid)) {
    if (group === undefined) continue
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const running = [...groups].filter((group) => theProcessAt(group).here)
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => theProcessAt(group).here) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => theProcessAt(one).here)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('the window finds its office, and the tray keeps it', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('starts the office when nothing answers, hides to the tray, hands a second launch over, and restarts from the tray', async () => {
    const missing = missingWebBuild(THE_BUILT_PAGE)
    if (missing !== null) throw new Error(`The window opens the office in production, which serves the built page. ${missing}`)
    const world = await aWorld('window-finds')
    expect(theLock(world)).toBeNull()

    const app = await aWindow(world)
    try {
      // A FIRST START IS SAID PLAINLY (round 14): only that Mole Office is starting, with no address
      // and none of the system's detail, and the sandbox warning once, at the end.
      const starting = await waitFor(app, (state) => state.check.lines.some((line) => 'say' in line && line.say === WINDOW_WORDS.en.starting), 'starting', 100)
      expect(starting.check.lines).toEqual([{ say: WINDOW_WORDS.en.starting }, ...theSandboxWarning('en')])
      const opened = await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'healthy')
      expect(opened.officeAddress).toBe(`http://127.0.0.1:${String(world.port)}`)
      expect(opened.check.lines).toEqual([{ say: WINDOW_WORDS.en.says.healthy(`http://127.0.0.1:${String(world.port)}`) }, ...theSandboxWarning('en')])
      expect(opened.check.offers).toEqual(['openTheOffice'])
      // The tray offers what W4 and a decision ask, in the window's language. No office page
      // has shown, so none has said it has the note page, and the tray holds no New quick note (round W47).
      const items = await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: { trayItems(): unknown } }).theMoleOfficeWindow.trayItems())
      expect(items).toEqual([
        { id: 'open', label: 'Open Mole Office' },
        { id: 'restart', label: 'Restart the service' },
        { separator: true },
        { id: 'shutDown', label: 'Shut down Mole Office' },
      ])
      await aPicture(app, 'the-open-press-en', 'light')
      await aPicture(app, 'the-open-press-en', 'dark')
      const address = `http://127.0.0.1:${String(world.port)}`
      await aWatchOnTheDoor(app)
      await pressOpen(app)
      const page = await app.firstWindow()
      await page.waitForURL(`${address}/**`, { timeout: 60_000 })
      const first = theLock(world)
      expect(first, 'the window started no service').not.toBeNull()
      // THE WINDOW PAIRED ITSELF (round W44): the new office opens on its first page, not the Pairing page.
      // The office was pressed once and said yes, and the press came from the window's hidden pairing page.
      const half = await theWindowIsPairedAt(app, page, address)
      expect(thePressesLogged(world), 'the office was not pressed once, and paired').toEqual([200])
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 1, POST: 1 })
      // THE WINDOW'S KEY IS A CREDENTIAL OF ITS OWN (SW-1): the office lists one under the window's name for itself,
      // confirmed. The office stores confirmed as 'trusted'.
      const theWindows = (await theCredentialsFrom(page, half)).filter((one) => one.name === WINDOW_WORDS.en.theWindowsDeviceName)
      expect(theWindows.map((one) => one.standing), "the office does not list the window's credential once, confirmed").toEqual(['trusted'])
      await aPicture(app, 'the-first-page-in-the-window-en', 'light')
      await aPicture(app, 'the-first-page-in-the-window-en', 'dark')

      // W4: the close button hides the window and stops nothing.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
      const hidden = await waitFor(app, (state) => !state.visible, 'hidden')
      expect(hidden.officeAddress).not.toBeNull()
      expect(theLock(world)?.pid).toBe(first?.pid)
      expect(theProcessAt(first?.pid ?? -1).here).toBe(true)

      // W2(c): a second launch hands over to this window and exits; no second service starts.
      const binary = electronsBinary()
      if ('missing' in binary) throw new Error(binary.missing)
      const second = spawn(binary.path, ['--no-sandbox', THE_WINDOW], { env: world.env, detached: true, stdio: 'ignore' })
      if (second.pid !== undefined) electrons.set(second.pid, binary.path)
      const exited = await new Promise<boolean>((done) => {
        const bound = setTimeout(() => done(false), 30_000)
        second.on('exit', () => {
          clearTimeout(bound)
          done(true)
        })
      })
      expect(exited, 'the second launch did not exit').toBe(true)
      await waitFor(app, (state) => state.visible, 'shown again by the second launch')
      expect(theLock(world)?.pid).toBe(first?.pid)

      // THE WINDOW READS THE OFFICE'S OWN DEVELOPER MODE (round 14). Nothing has turned it on yet. The
      // switch is turned on in the office's page, and the window reads it as it leaves the office for
      // its check page, here on the tray's restart.
      expect((await waitFor(app, () => true, 'a state')).developer).toBe(false)
      await page.evaluate(() => localStorage.setItem('mole-office.mode', 'inspect'))
      // The tray's restart restarts the service, and the window opens it again.
      await pressTheTray(app, 'restart')
      const afterRestart = await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy', 'healthy after the restart')
      expect(afterRestart.developer).toBe(true)
      const restarted = theLock(world)
      expect(restarted?.pid).not.toBe(first?.pid)
      expect(theProcessAt(first?.pid ?? -1).here).toBe(false)

      // The tray's shut down asks first, then stops the service and the window with it.
      // AND IT IS THE PAGE'S ONE QUESTION THAT DOES IT (criterion W6, wave 13n round 58), not the stop command: the
      // office page takes the tray's ask, finds no run at work and presses at once. The tray's press answers which
      // way it went, which is the window's own question (round W32).
      const closed = new Promise<void>((done) => launched.get(app)?.on('exit', () => done()))
      // The restart left the window on its check page, which cannot ask; the office page is opened again, as the person would.
      await pressOpen(app)
      await page.waitForURL(`${address}/**`, { timeout: 60_000 })
      // The restarted office is the same office, and the window is paired with it: one read, no press, and the same
      // one credential.
      const halfAfterTheRestart = await theWindowIsPairedAt(app, page, address)
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 2, POST: 1 })
      expect(thePressesLogged(world)).toEqual([200])
      const stillTheWindows = (await theCredentialsFrom(page, halfAfterTheRestart)).filter((one) => one.name === WINDOW_WORDS.en.theWindowsDeviceName)
      expect(stillTheWindows, "the window's credential is not the same one after the restart").toEqual(theWindows)
      // The page's press goes out after the tray's ask is answered, so the answer comes back before the window closes.
      const went = await pressTheTray(app, 'shutDown').catch(() => 'the window was gone before it answered')
      expect(went, 'the menu did not ask before it shut down').toBe('to the question')
      await answerTheQuestion(app, 'yes')
      await Promise.race([closed, new Promise((_, refuse) => setTimeout(() => refuse(new Error(`the window did not close after the tray's shut down, which went ${String(went)}`)), 60_000))])
      expect(theLock(world)).toBeNull()
    } finally {
      // A case that fails half way still closes its window, so a later case is not drawn beside it.
      // Without this, one failure here made a later case's page crash (round 9b of wave 13t). A close
      // that has not ended in 30 seconds ends the window's group instead, so a failure above is reported
      // in its own words, and not as this case's time running out.
      const child = launched.get(app)
      if (stillRunning(child)) {
        const ended = await Promise.race([app.close().then(() => true, () => true), sleep(30_000).then(() => false)])
        if (!ended && child?.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            // Ended between the look and the signal.
          }
        }
      }
    }
  }, 300_000)

  it('finds a running service through its lock, and starts none', async () => {
    const world = await aWorld('window-reuses')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const before = theLock(world)
    expect(before).not.toBeNull()

    // In Chinese, so the window's first page is looked at in Chinese as well.
    const address = `http://127.0.0.1:${String(world.port)}`
    const app = await aWindow(world, 'zh-CN')
    try {
      const found = await waitFor(app, (state) => state.officeAddress !== null && !state.check.busy, 'the office found')
      expect(found.check.answer).toBe('healthy')
      expect(found.check.lines.slice(-4)).toEqual(theSandboxWarning('zh'))
      // THE TRAY'S WORDS IN CHINESE. The tray has no panel under a virtual display, so no picture of its
      // menu can be taken here; its words are read and checked instead (round 14). No office page has shown
      // yet, so the tray holds no New quick note (round W47); case 7 reads it once the page has said it.
      const items = await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: { trayItems(): unknown } }).theMoleOfficeWindow.trayItems())
      expect(items).toEqual([
        { id: 'open', label: '打开 Mole Office' },
        { id: 'restart', label: '重启服务' },
        { separator: true },
        { id: 'shutDown', label: '关闭 Mole Office' },
      ])
      await aPicture(app, 'the-open-press-zh', 'light')
      await aPicture(app, 'the-open-press-zh', 'dark')
      await aWatchOnTheDoor(app)
      await pressOpen(app)
      const page = await app.firstWindow()
      await page.waitForURL(`${address}/**`, { timeout: 60_000 })
      // The window paired itself with the office it found, as with the one it started (round W44).
      await theWindowIsPairedAt(app, page, address)
      expect(thePressesLogged(world)).toEqual([200])
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 1, POST: 1 })
      await aPicture(app, 'the-first-page-in-the-window-zh', 'light')
      await aPicture(app, 'the-first-page-in-the-window-zh', 'dark')
      expect(found.check.lines).not.toContainEqual({ say: WINDOW_WORDS.zh.starting })
      expect(theLock(world)?.pid).toBe(before?.pid)
    } finally {
      await app.close()
    }
    // Closing the window's app leaves the service running (W1).
    expect(theProcessAt(before?.pid ?? -1).here).toBe(true)

    // OPENED AGAIN, THE WINDOW IS STILL PAIRED (round W44): it reads the door once and presses nothing.
    const again = await aWindow(world, 'zh-CN')
    try {
      await waitFor(again, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found again')
      await aWatchOnTheDoor(again)
      await pressOpen(again)
      const page = await again.firstWindow()
      await page.waitForURL(`${address}/**`, { timeout: 60_000 })
      await theWindowIsPairedAt(again, page, address)
      expect(await whatTheWatchSaw(again)).toEqual({ GET: 1, POST: 0 })
      expect(thePressesLogged(world), 'the window opened again pressed the door').toEqual([200])
    } finally {
      await again.close()
    }

    // A BROWSER IS STILL SHOWN THE PAIRING PAGE AND ITS PRESS (round W44). It has no cookie, so the office
    // offers it pairing, and the page asks the person to press. Its words are read by their keys.
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ locale: 'zh-CN' })
      await storeNormalModeWhereNothingIsStored(context)
      const page = await context.newPage()
      await page.goto(`${address}/`)
      const zh = createI18n('zh')
      await page.locator('.pair').waitFor({ timeout: 60_000 })
      await page.locator('.pair .px-panel-title').getByText(zh.t('g4.pairing.titleOffered'), { exact: true }).waitFor({ timeout: 10_000 })
      await page.locator('.pair').getByRole('button', { name: zh.t('g4.pairing.press'), exact: true }).waitFor({ timeout: 10_000 })
      expect(await page.evaluate(() => window.location.hash)).toBe('#/pairing')
      expect((await context.cookies(address)).map((one) => one.name)).not.toContain(DEVICE_HALF_COOKIE)
      // The Chinese heading reads as a heading: in the light look it is larger than the text under it,
      // as the English heading's capitals and weight make it read (the review of round 9).
      await page.emulateMedia({ colorScheme: 'light' })
      const sizes = await page.evaluate(() => {
        const style = (selector: string): CSSStyleDeclaration => getComputedStyle(document.querySelector(selector) as Element)
        return {
          heading: Number.parseFloat(style('.pair .px-panel-title').fontSize),
          text: Number.parseFloat(style('.pair .pair-say').fontSize),
          weight: Number(style('.pair .px-panel-title').fontWeight),
        }
      })
      expect(sizes.heading).toBeGreaterThan(sizes.text)
      // Bold is asked for as well. A font with no bold face draws it regular, which is what this
      // sandbox's one Chinese font does (WenQuanYi Zen Hei, Regular only), so the size is what shows here.
      expect(sizes.weight).toBeGreaterThanOrEqual(600)
    } finally {
      await browser.close()
    }
    expect(thePressesLogged(world), 'the browser pressed the door').toEqual([200])
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // THE FIRST START, PICTURED (round 14d). The check page says only "Starting Mole Office." while the
  // start command waits for the new server, about five seconds here, which is shorter than eight
  // pictures take. So once the server's lock is written, its process group is paused: the command keeps
  // waiting (up to START_WAIT_MS) and the page stays as it is. The group goes on after the pictures,
  // and the window then finds its office healthy. It runs only when pictures are asked for.
  it.runIf(PICTURES !== undefined && PICTURES !== '')('pictures the first start, in English and Chinese, then stops its service', async () => {
    for (const lang of [undefined, 'zh-CN'] as const) {
      const words = WINDOW_WORDS[lang === undefined ? 'en' : 'zh']
      const world = await aWorld(`window-start-${lang === undefined ? 'en' : 'zh'}`)
      const app = await aWindow(world, lang)
      let paused: number | null = null
      try {
        const stillStarting = (state: WindowState): boolean => state.check.answer !== 'healthy' && state.check.lines.some((line) => 'say' in line && line.say === words.starting)
        await waitFor(app, stillStarting, 'starting', 50)
        const deadline = Date.now() + 60_000
        while (paused === null && Date.now() < deadline) {
          const lock = theLock(world)
          if (lock !== null) {
            process.kill(-lock.pgid, 'SIGSTOP')
            paused = lock.pgid
          } else await sleep(20)
        }
        if (paused === null) throw new Error('The new server wrote no lock in 60 seconds, so the first start could not be held for its pictures.')
        const held = await waitFor(app, () => true, 'its state')
        expect(stillStarting(held), `the window had moved on before the server was paused: ${JSON.stringify(held.check.lines)}`).toBe(true)
        expect(held.check.lines).toEqual([{ say: words.starting }, ...theSandboxWarning(lang === undefined ? 'en' : 'zh')])
        await aPicture(app, `the-first-start-${lang === undefined ? 'en' : 'zh'}`, 'light', stillStarting)
        await aPicture(app, `the-first-start-${lang === undefined ? 'en' : 'zh'}`, 'dark', stillStarting)
        process.kill(-paused, 'SIGCONT')
        paused = null
        await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'healthy')
        // The tray's Shut down stops the service and the window, as in case 1. (Playwright's close, asked
        // while the window was held on this page, had not returned five minutes later.)
        const closed = new Promise<void>((done) => launched.get(app)?.on('exit', () => done()))
        const went = await pressTheTray(app, 'shutDown').catch(() => null)
        if (went === 'to the question') await answerTheQuestion(app, 'yes').catch(() => undefined)
        await closed
        expect(theLock(world)).toBeNull()
      } finally {
        if (paused !== null) process.kill(-paused, 'SIGCONT')
        if (stillRunning(launched.get(app))) await app.close().catch(() => {})
      }
    }
  }, 300_000)

  it('says when another office answers at the declared port, in English and Chinese, and does not open it', async () => {
    // Another office, on another database, at the port this world declares.
    const theirs = await aWorld('window-theirs')
    const started = await theCommand(theirs, 'start')
    expect(started.code, started.out).toBe(0)
    const ours = await aWorld('window-ours', theirs.port)
    // This world's database exists, so its identity can be read and is shown to differ. A database not
    // yet made has no identity, and the window then says the office cannot be told (round 6b), which is
    // a different answer from the one this case is about.
    writeFileSync(ours.database, '')

    for (const lang of [undefined, 'zh-CN'] as const) {
      const says = WINDOW_WORDS[lang === undefined ? 'en' : 'zh'].says
      const app = await aWindow(ours, lang)
      try {
        const said = await waitFor(app, (state) => state.check.answer !== null && !state.check.busy, 'an answer')
        expect(said.check.answer).toBe('wrong-world')
        expect(said.officeAddress).toBeNull()
        const address = `http://127.0.0.1:${String(theirs.port)}`
        // WHAT IS WRONG, first, in plain words; then why it is not opened.
        expect(said.check.lines.slice(0, 2)).toEqual([{ say: says.wrongWorld(address) }, { say: says.notOpened }])
        // WHAT EACH VALUE MEANS: every value has a label that says what it is, the folder is a path,
        // and the kind of office is said in words rather than as a stored label.
        const facts = said.check.lines.filter((line): line is { label: string; value: string; path?: true } => 'label' in line)
        expect(facts).toContainEqual({ label: says.labels.repository, value: realpathSync(REPO), path: true })
        expect(facts).toContainEqual({ label: says.labels.port, value: String(theirs.port) })
        expect(facts.map((fact) => fact.label)).toEqual(expect.arrayContaining(Object.values(says.labels)))
        expect(facts).toContainEqual({ label: says.labels.standing, value: says.standingMeans['scratch'] })
        // WHAT THE PERSON CAN DO, last of what the self-check found; then the sandbox warning, once.
        expect(said.check.lines.slice(-4)).toEqual(theSandboxWarning(lang === undefined ? 'en' : 'zh'))
        expect(said.check.lines.at(-5)).toEqual({ todo: says.wrongTodo })
        // No word only somebody who builds Mole Office would know, in any sentence, heading or label.
        const words = said.check.lines.map((line) => ('say' in line ? line.say : 'heading' in line ? line.heading : 'todo' in line ? line.todo : line.label))
        expect(words.join('\n')).not.toMatch(/checkout|declares|scratch|代码目录|声明|临时世界/i)

        const page = await app.firstWindow()
        expect(page.url()).toMatch(/^file:.*check\.html$/)
        await page.getByText(says.wrongTodo).waitFor({ timeout: 30_000 })
        // THE ABOUT LINE names the version, the one package.json holds.
        expect(theVersion()).not.toBeNull()
        expect(await page.locator('#about').textContent()).toBe(`Mole Office ${String(theVersion())}`)
        // The owner's mark at the top really loads: a broken picture draws an empty frame and fails nothing else.
        await page.locator('img.icon').evaluate((img: HTMLImageElement) => img.decode())
        expect(await page.locator('img.icon').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(47)
        // A FOLDER PATH BREAKS ONLY AFTER A SLASH. At 390 the path wraps, and no piece between two
        // slashes is split, so "mole-office" is never drawn as "mole-" and "office".
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(390, 900))
        await sleep(400)
        const pieces = await page.locator('.fact .value .whole').evaluateAll((all) => all.map((one) => ({ text: one.textContent, lines: one.getClientRects().length })))
        expect(pieces.length).toBeGreaterThan(3)
        expect(pieces.filter((piece) => piece.lines !== 1)).toEqual([])
        // THE CHECK PAGE IS PAINTED IN THE OFFICE'S OWN COLOURS, light and dark, so the window keeps one
        // shade as the office opens (round 14; round 13's dark check page was blue-grey).
        for (const look of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: look })
          expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(theOfficesBackground(look))
        }
        await aPicture(app, `the-wrong-world-${lang === undefined ? 'en' : 'zh'}`, 'light')
        await aPicture(app, `the-wrong-world-${lang === undefined ? 'en' : 'zh'}`, 'dark')
      } finally {
        await app.close()
      }
      // The window started nothing for its own database.
      expect(theLock(ours)).toBeNull()
    }
    const stopped = await theCommand(theirs, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // ROUND W44 OF WAVE 13T. The two refusals below are the watch's, in the office's place. The first is in the
  // shape the server sends when the operating system did not say in time who sent a request, with its sentence
  // read from the word list by its key; the wait in it is this test's own number. The second is a sentence of
  // this test's own, which no office says.
  const THE_STAND_INS_REFUSAL = "This is the test's stand-in for the pairing door, and it did not pair this window."
  const theWait = { seconds: 10 }
  const NOT_READ_IN_TIME: AnAnswer = { status: 503, body: { error: createI18n('en').t('server.senderNotReadInTime', theWait), code: 'senderNotReadInTime', values: theWait } }
  const REFUSED: AnAnswer = { status: 403, body: { error: THE_STAND_INS_REFUSAL } }

  it('shows its check page with the refusal when the press is refused, after asking again once when the sender was not read in time', async () => {
    const world = await aWorld('window-pair-refused')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const app = await aWindow(world)
    try {
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      await aWatchOnTheDoor(app, { GET: [], POST: [NOT_READ_IN_TIME, REFUSED] })
      await pressOpen(app)
      const said = WINDOW_WORDS.en.couldNotPair(THE_STAND_INS_REFUSAL)
      const shown = await waitFor(app, (state) => state.check.lines.some((line) => 'say' in line && line.say === said), 'the refusal shown')
      // The refusal's words, then the sandbox warning every window here shows; Check again is the one press.
      expect(shown.check.lines).toEqual([{ say: said }, ...theSandboxWarning('en')])
      expect(shown.check.offers).toEqual(['checkAgain'])
      const page = await app.firstWindow()
      expect(page.url()).toMatch(/^file:.*check\.html$/)
      // The first refusal was asked again, and the second was the last: the office itself was pressed by neither.
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 1, POST: 2 })
      expect(thePressesLogged(world)).toEqual([])
      expect(theLinesSaying(app, WINDOW_WORDS.en.couldNotPair(THE_STAND_INS_REFUSAL)), "the window's log did not say the refusal once").toBe(1)
    } finally {
      await app.close()
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  it('presses nothing where the office does not offer pairing, and opens the office as before', async () => {
    const world = await aWorld('window-pair-not-offered')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const app = await aWindow(world)
    try {
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      // The door's answer where pairing is not offered, as an office on a Mac or Windows outside the installed app gives it.
      await aWatchOnTheDoor(app, { GET: [{ status: 200, body: { paired: false, offered: false, mayAsk: false, waiting: null } }], POST: [] })
      await pressOpen(app)
      const page = await app.firstWindow()
      await page.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 1, POST: 0 })
      expect(thePressesLogged(world)).toEqual([])
    } finally {
      await app.close()
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // ROUND W45 OF WAVE 13T (order Taoqs_zf5qoU, after W44's check was refused). When the window's read
  // or press of the pairing door gets no answer at all, the window says it could not reach the office, and not
  // that the office answered. When the office answers the read with a refusal, the window says the office
  // answered, and gives its reason. The failures are the watch's, in the network's place. Since SW-1 the watch
  // aborts the request, so the error the window gets is Chromium's own. It is not written here: it is read from the
  // check page, between the two ends of the window's sentence, and it must not be empty.
  const NO_ANSWER: AnAnswer = 'no answer'
  const OFFERED: AnAnswer = { status: 200, body: { paired: false, offered: true, mayAsk: false, waiting: null } }
  const [UNREACHED_BEFORE, UNREACHED_AFTER] = WINDOW_WORDS.en.couldNotReachPairing('\u0000').split('\u0000') as [string, string]

  /** The error the check page says the window got when it could not reach the door, or null when it says no such thing. */
  const theUnreachedErrorIn = (state: WindowState): string | null => {
    for (const line of state.check.lines) {
      if (!('say' in line) || line.say.length < UNREACHED_BEFORE.length + UNREACHED_AFTER.length) continue
      if (line.say.startsWith(UNREACHED_BEFORE) && line.say.endsWith(UNREACHED_AFTER)) return line.say.slice(UNREACHED_BEFORE.length, line.say.length - UNREACHED_AFTER.length)
    }
    return null
  }

  it('says it could not reach the office when its read or press of the pairing door gets no answer, and that the office answered when it refuses the read', async () => {
    const world = await aWorld('window-pair-unreached')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const app = await aWindow(world)
    try {
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      // Three presses of Open: the first read gets no answer; the second read is answered and the press gets
      // no answer; the third read is refused.
      await aWatchOnTheDoor(app, { GET: [NO_ANSWER, OFFERED, REFUSED], POST: [NO_ANSWER] })
      const errors: string[] = []
      for (const [press, seen] of [
        [1, { GET: 1, POST: 0 }],
        [2, { GET: 2, POST: 1 }],
      ] as const) {
        await pressOpen(app)
        const shown = await waitFor(app, (state) => theUnreachedErrorIn(state) !== null, `press ${String(press)} said`)
        const error = theUnreachedErrorIn(shown) ?? ''
        expect(error, `press ${String(press)}: the window gave no error of its own`).not.toBe('')
        expect(shown.check.lines, `press ${String(press)}: the window said the office answered, and nothing had`).not.toContainEqual({ say: WINDOW_WORDS.en.couldNotPair(error) })
        expect(shown.check.lines).toEqual([{ say: WINDOW_WORDS.en.couldNotReachPairing(error) }, ...theSandboxWarning('en')])
        expect(shown.check.offers).toEqual(['checkAgain'])
        expect(await whatTheWatchSaw(app)).toEqual(seen)
        errors.push(error)
      }
      await pressOpen(app)
      const refused = WINDOW_WORDS.en.couldNotPair(THE_STAND_INS_REFUSAL)
      const shown = await waitFor(app, (state) => state.check.lines.some((line) => 'say' in line && line.say === refused), 'the refused read said')
      expect(shown.check.lines).toEqual([{ say: refused }, ...theSandboxWarning('en')])
      expect(await whatTheWatchSaw(app)).toEqual({ GET: 3, POST: 1 })
      const page = await app.firstWindow()
      expect(page.url()).toMatch(/^file:.*check\.html$/)
      expect(thePressesLogged(world)).toEqual([])
      const unreached = [...new Set(errors)].map((error) => theLinesSaying(app, WINDOW_WORDS.en.couldNotReachPairing(error)))
      expect(unreached.reduce((all, lines) => all + lines, 0), "the window's log did not say each unanswered request once").toBe(2)
      expect(theLinesSaying(app, refused), "the window's log did not say the refused read once").toBe(1)
    } finally {
      await app.close()
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // SW-1, ROUND 1, OF WAVE 13T. The window and a browser each pair with the same office, and each gets a device key of
  // its own. The window's page ends the browser's credential, as the person does on the Visitors page. The browser is
  // then not paired, and the window still is. The browser's name for itself is this test's own.
  const A_BROWSERS_NAME = "This test's browser beside the window"

  it("ending a browser's credential leaves the window paired", async () => {
    const world = await aWorld('window-ends-a-browser')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const address = `http://127.0.0.1:${String(world.port)}`
    const app = await aWindow(world)
    try {
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      await pressOpen(app)
      const page = await app.firstWindow()
      await page.waitForURL(`${address}/**`, { timeout: 60_000 })
      const half = await theWindowIsPairedAt(app, page, address)

      // A BROWSER PAIRS WITH THE SAME OFFICE, with a key of its own in two halves.
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext()
        const paired = await pairTheContext(context, address, A_BROWSERS_NAME)
        const before = await theCredentialsFrom(page, half)
        const theWindows = before.filter((one) => one.name === WINDOW_WORDS.en.theWindowsDeviceName)
        const theBrowsers = before.filter((one) => one.name === A_BROWSERS_NAME)
        expect(theWindows.map((one) => one.standing), "the office does not list the window's credential once, confirmed").toEqual(['trusted'])
        expect(theBrowsers.map((one) => one.standing), "the office does not list the browser's credential once, confirmed").toEqual(['trusted'])

        // THE WINDOW'S PAGE ENDS THE BROWSER'S CREDENTIAL, with both of the window's halves.
        const ended = await page.evaluate(
          async ({ id, header, value }) => {
            const reply = await fetch(`/api/office/visitors/${encodeURIComponent(id)}/end`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', [header]: value },
              body: '{}',
            })
            return reply.status
          },
          { id: theBrowsers[0]?.id ?? '', header: DEVICE_HALF_HEADER, value: half },
        )
        expect(ended, "the window's page could not end the browser's credential").toBe(200)

        // THE BROWSER IS NOT PAIRED NOW: its read with both its halves says so.
        const theBrowsersRead = await context.request.get(`${address}/api/office/pairing`, { headers: { [DEVICE_HALF_HEADER]: paired.headerHalf } })
        expect(theBrowsersRead.status()).toBe(200)
        expect(((await theBrowsersRead.json()) as { paired?: unknown }).paired, 'the browser whose credential was ended is still paired').toBe(false)

        // AND THE WINDOW STILL IS: its page's read with both halves says paired, and its own credential is still confirmed.
        expect(await thePagesReadOfTheDoor(page, half), "ending the browser's credential unpaired the window").toBe(true)
        const after = await theCredentialsFrom(page, half)
        expect(after.filter((one) => one.name === WINDOW_WORDS.en.theWindowsDeviceName), "the window's credential changed").toEqual(theWindows)
        expect(after.filter((one) => one.name === A_BROWSERS_NAME).map((one) => ({ id: one.id, standing: one.standing }))).toEqual([{ id: theBrowsers[0]?.id, standing: 'ended' }])
      } finally {
        await browser.close()
      }
    } finally {
      await app.close()
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // ROUND W45 OF WAVE 13T: A QUICK NOTE FROM ANY PROGRAM, as a decision's option C has it, AND ROUND W47: ONLY ONCE
  // THE OFFICE PAGE HAS SAID IT HAS THE NOTE PAGE.
  // That answer is this test's (theOfficePageAnswersOfTheNotePage).
  // A note window shows the note page when the built page has its route, and the office's page for an address it does
  // not know when the built page is older than the route.
  it('offers a quick note once the office page says it has the note page, opens one on top from its key, its tray and the page, and opens one asked for while the office was away once it shows', async () => {
    const world = await aWorld('window-quick-note')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    // A display of the window's own, which takes this test's key presses with no cookie.
    const own = await aDisplayOfItsOwn()
    world.env['DISPLAY'] = `:${own.display}`
    delete world.env['WAYLAND_DISPLAY']
    const app = await aWindow(world)
    const key = theQuickNoteKey(process.platform)
    const en = WINDOW_WORDS.en
    /** Whether the check page's first line says a note waits for the office. */
    const aNoteWaits = (state: WindowState): boolean => {
      const first = state.check.lines[0]
      return first !== undefined && 'say' in first && first.say === en.aQuickNoteWaitsForTheOffice
    }
    const healthy = (state: WindowState): boolean => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy
    try {
      const found = await waitFor(app, healthy, 'the office found')
      // BEFORE THE OFFICE PAGE HAS SAID IT, the window has not asked the system for the key, and offers no note.
      expect(found.quickNote).toEqual({ key: key.accelerator, set: null, page: false, windows: [] })
      expect(await theKeyIsTaken(app, key.accelerator)).toBe(false)
      expect((await theTrayItemsOf(app)).map((item) => item.id)).not.toContain('newNote')

      // OPEN: the office page says it has the note page. The system gives the window its key, and the tray shows
      // the key beside New quick note, after Open.
      const page = await app.firstWindow()
      await theOfficePageAnswersOfTheNotePage(page, 'has it')
      await pressOpen(app)
      await page.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
      const offered = await waitFor(app, (state) => state.quickNote.page, 'the office page said it has the note page')
      expect(offered.quickNote).toEqual({ key: key.accelerator, set: true, page: true, windows: [] })
      expect(await theKeyIsTaken(app, key.accelerator)).toBe(true)
      expect((await theTrayItemsOf(app)).slice(0, 2)).toEqual([
        { id: 'open', label: en.trayOpen },
        { id: 'newNote', label: en.trayNewNote, key: key.accelerator },
      ])

      // THE KEY, pressed on the display; then the tray's New quick note; then the office page's line. One note each,
      // on the note page's address on the office the window shows, on top of other windows.
      const note: ANoteWindow = { url: theQuickNoteAddress(found.officeAddress ?? ''), onTop: true, visible: true }
      expect(note.url.startsWith(`http://127.0.0.1:${String(world.port)}/`)).toBe(true)
      const opened = (count: number) => (state: WindowState) => state.quickNote.windows.length === count && state.quickNote.windows.every((one) => one.url === note.url)
      await pressTheShortcutAt(theDisplayOf(world), key.accelerator)
      expect((await waitFor(app, opened(1), "the key's note opened")).quickNote.windows).toEqual([note])
      await pressTheTray(app, 'newNote')
      expect((await waitFor(app, opened(2), "the tray's note opened")).quickNote.windows).toEqual([note, note])
      await page.evaluate((line) => console.log(line), THE_PAGE_SAYS.openAQuickNote)
      expect((await waitFor(app, opened(3), "the page's note opened")).quickNote.windows).toEqual([note, note, note])

      if (PICTURES !== undefined && PICTURES !== '') {
        const shown = app.windows().find((one) => one.url() === note.url)
        if (shown === undefined) throw new Error(`No page of the window shows ${note.url}.`)
        for (const theme of ['light', 'dark'] as const) {
          await shown.emulateMedia({ colorScheme: theme })
          await sleep(400)
          writeFileSync(join(PICTURES, `a-quick-note-window-${theme}.png`), await shown.screenshot())
        }
      }

      // A note window that is closed is gone, and the others stay.
      await app.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find((one) => one.webContents.getURL() === url)?.close(), note.url)
      expect((await waitFor(app, opened(2), 'one note closed')).quickNote.windows).toEqual([note, note])

      // ASKED FOR TWICE WHILE THE OFFICE IS AWAY, as the tray restarts it and the check page waits for Open: no note
      // opens yet, the page says once, first, that it opens once the office is open, and the window's log says so
      // once. The office page said it has the note page in this run, so the item and the key stay.
      await pressTheTray(app, 'restart')
      const again = await waitFor(app, healthy, 'the office found again')
      expect(again.quickNote).toEqual({ key: key.accelerator, set: true, page: true, windows: [note, note] })
      await pressTheTray(app, 'newNote')
      await waitFor(app, aNoteWaits, 'the note waits for the office')
      await pressTheTray(app, 'newNote')
      const waits = await waitFor(app, aNoteWaits, 'the note still waits for the office')
      expect(waits.quickNote.windows).toEqual([note, note])
      expect(waits.check.lines.slice(1)).toEqual(again.check.lines)
      await expect.poll(() => page.locator('#lines').innerText(), { timeout: 10_000 }).toContain(en.aQuickNoteWaitsForTheOffice)
      expect(theLinesSaying(app, en.aQuickNoteWaitsForTheOffice), "the window's log did not say once that the note waits").toBe(1)
      await aPicture(app, 'a-quick-note-waits-en', 'light', aNoteWaits)
      await aPicture(app, 'a-quick-note-waits-en', 'dark', aNoteWaits)

      // OPEN: the office shows again, and the one note that waited opens. The press returns once the office has
      // shown, so a second note would be there already.
      await pressOpen(app)
      await page.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
      expect((await waitFor(app, opened(3), 'the note that waited opened')).quickNote.windows).toEqual([note, note, note])

      // THE TRAY'S SHUT DOWN stops the restarted service and the window, as in case 1.
      const closed = new Promise<void>((done) => launched.get(app)?.on('exit', () => done()))
      const went = await pressTheTray(app, 'shutDown').catch(() => 'the window was gone before it answered')
      expect(went, 'the menu did not ask before it shut down').toBe('to the question')
      await answerTheQuestion(app, 'yes')
      await Promise.race([closed, new Promise((_, refuse) => setTimeout(() => refuse(new Error(`the window did not close after the tray's shut down, which went ${String(went)}`)), 60_000))])
      expect(theLock(world)).toBeNull()
    } finally {
      // As in case 1: a window still open after a failure is closed, and its group is ended if the close has not
      // returned in 30 seconds.
      const child = launched.get(app)
      if (stillRunning(child)) {
        const ended = await Promise.race([app.close().then(() => true, () => true), sleep(30_000).then(() => false)])
        if (!ended && child?.pid !== undefined) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            // Ended between the look and the signal.
          }
        }
      }
    }
  }, 300_000)

  it('closes a marked native note on Back and keeps an unmarked main-window route in the office', async () => {
    const built = await bundlePageCode({
      stdin: {
        contents: `import './tests/a-page-of-a-test-office.ts';
          import { createElement as h } from 'react';
          import { createRoot } from 'react-dom/client';
          import { api } from './src/web/api.ts';
          import { theApiIsOnPort } from './src/web/lib/api-address.ts';
          import { QuickNotePage } from './src/web/pages/QuickNotePage.tsx';
          import { QuickNoteBeside } from './src/web/components/QuickNoteBeside.tsx';
          import { openAQuickNote } from './src/web/lib/open-a-quick-note.ts';
          api.participant = async () => ({ participant: {} });
          // This page is served by the office at its own origin; this bundle does not load the app entry that names the port.
          theApiIsOnPort(null);
          window.noteWindowTest = {
            showNote: () => createRoot(document.getElementById('note-test')).render(h(QuickNotePage)),
            showShell: () => createRoot(document.getElementById('note-test')).render(h(QuickNoteBeside)),
            openFloating: () => openAQuickNote(),
          };`,
        resolveDir: REPO,
        loader: 'tsx',
      },
      bundle: true, write: false, platform: 'browser', format: 'esm',
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    const script = built.outputFiles[0]?.text ?? ''
    if (script === '') throw new Error('The native note test page did not build')
    const world = await aWorld('window-note-navigation')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const own = await aDisplayOfItsOwn()
    world.env['DISPLAY'] = `:${own.display}`
    delete world.env['WAYLAND_DISPLAY']
    const app = await aWindow(world)
    const english = createI18n('en')
    type TestWindow = Window & { noteWindowTest: { showNote(): void; showShell(): void; openFloating(): void } }
    const install = async (page: Page, which: 'note' | 'shell') => {
      await page.evaluate((target) => {
        const host = document.createElement('div')
        host.id = 'note-test'
        if (target === 'note') document.body.replaceChildren(host)
        else document.body.append(host)
      }, which)
      await page.addScriptTag({ content: script, type: 'module' })
      await page.waitForFunction(() => 'noteWindowTest' in window)
      await page.evaluate((target) => {
        const test = (window as unknown as TestWindow).noteWindowTest
        if (target === 'note') test.showNote()
        else test.showShell()
      }, which)
    }
    try {
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the made-up office found')
      const main = await app.firstWindow()
      await theOfficePageAnswersOfTheNotePage(main, 'has it')
      await pressOpen(app)
      await main.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
      await waitFor(app, (state) => state.quickNote.page, 'the note page offered')
      await install(main, 'shell')
      const [native] = await Promise.all([app.waitForEvent('window', { timeout: 30_000 }), pressTheTray(app, 'newNote')])
      await waitFor(app, (state) => state.quickNote.windows.length === 1, 'the native note opened')
      await native.waitForURL((url) => url.hash === '#/quick-note', { timeout: 30_000 })
      const marker = (quickNoteAddress as unknown as { THE_QUICK_NOTE_WINDOW_MARKER: string }).THE_QUICK_NOTE_WINDOW_MARKER
      expect(typeof marker).toBe('string')
      expect(new URL(native.url()).searchParams.has(marker)).toBe(true)
      await install(native, 'note')
      await native.locator('.qn-note').waitFor({ timeout: 30_000 })
      await native.getByRole('button', { name: new RegExp(english.t('quickNote.back')) }).click()
      await expect.poll(() => native.isClosed(), { timeout: 15_000 }).toBe(true)
      await expect.poll(() => new URL(main.url()).hash, { timeout: 15_000 }).toBe('#/my-notes')
      expect(main.isClosed()).toBe(false)
      const [doneNote] = await Promise.all([app.waitForEvent('window', { timeout: 30_000 }), pressTheTray(app, 'newNote')])
      await waitFor(app, (state) => state.quickNote.windows.length === 1, 'another native note opened')
      await doneNote.waitForURL((url) => url.hash === '#/quick-note', { timeout: 30_000 })
      await install(doneNote, 'note')
      await doneNote.locator('.qn-note').waitFor({ timeout: 30_000 })
      await doneNote.getByRole('button', { name: english.t('quickNote.done'), exact: true }).click()
      await expect.poll(() => doneNote.isClosed(), { timeout: 15_000 }).toBe(true)
      expect(main.isClosed()).toBe(false)
      // The current page code opens a floating note first, then a real Electron child window.
      await main.evaluate(() => (window as unknown as TestWindow).noteWindowTest.openFloating())
      const floating = main.locator('#note-test [data-quick-note-beside]')
      await floating.locator('.qn-field').fill('Made-up native words and drawing')
      const sheet = await floating.locator('.qn-paper').boundingBox()
      if (sheet === null) throw new Error('The floating sheet was not drawn')
      await main.mouse.move(sheet.x + 60, sheet.y + 180)
      await main.mouse.down()
      await main.mouse.move(sheet.x + 140, sheet.y + 220, { steps: 8 })
      await main.mouse.up()
      await floating.locator('.qn-stroke').waitFor()
      const [popped] = await Promise.all([
        app.waitForEvent('window', { timeout: 20_000 }),
        floating.locator('[data-part="pop-out"]').click(),
      ])
      await popped.waitForURL((url) => url.hash.startsWith('#/quick-note/'), { timeout: 30_000 })
      await install(popped, 'note')
      await popped.locator('.qn-stroke').waitFor({ timeout: 30_000 })
      await expect.poll(() => popped.locator('.qn-note').innerText(), { timeout: 30_000 }).toContain('Made-up native words and drawing')
      await floating.waitFor({ state: 'detached', timeout: 20_000 })
      await popped.close()
      await main.evaluate(() => { window.location.hash = '#/quick-note' })
      await main.waitForURL((url) => url.hash === '#/quick-note')
      await install(main, 'note')
      await main.locator('.qn-note').waitFor({ timeout: 30_000 })
      await main.getByRole('button', { name: new RegExp(english.t('quickNote.back')) }).click()
      await expect.poll(() => new URL(main.url()).hash, { timeout: 15_000 }).toBe('#/my-notes')
      expect(main.isClosed()).toBe(false)
    } finally {
      await app.close().catch(() => undefined)
      await theCommand(world, 'stop')
    }
  }, 300_000)

  // ROUND W47 OF WAVE 13T: AN OFFICE WHOSE PAGE DOES NOT SAY IT HAS THE NOTE PAGE (decision vSqupTqsiUW1). That answer
  // is this test's: the line is dropped wherever the office page says it, so the case holds once 13y's page is built.
  it('offers no quick note, and leaves the key to the system, while the office page has not said it has the note page', async () => {
    const world = await aWorld('window-no-note-page')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const own = await aDisplayOfItsOwn()
    world.env['DISPLAY'] = `:${own.display}`
    delete world.env['WAYLAND_DISPLAY']
    const app = await aWindow(world)
    const key = theQuickNoteKey(process.platform)
    const none = { key: key.accelerator, set: null, page: false, windows: [] }
    try {
      const found = await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      expect(found.quickNote).toEqual(none)
      const page = await app.firstWindow()
      await theOfficePageAnswersOfTheNotePage(page, 'has none')
      await pressOpen(app)
      await page.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
      // The office page has drawn, so it has said what it says as it starts. The line said on its console now is
      // dropped as well, as the page's own would be. The shut-down button is looked for in the page and not on the
      // screen, because on this display the page's sidebar is closed and the button is hidden.
      await page.locator('.sbp-shut-down').waitFor({ state: 'attached', timeout: 60_000 })
      await page.evaluate((line) => console.info(line), THE_PAGE_SAYS.itHasTheQuickNotePage)

      // THE TRAY HOLDS NO NEW QUICK NOTE, and the window has not taken the key from the system.
      expect((await theTrayItemsOf(app)).map((item) => item.id ?? 'separator')).toEqual(['open', 'restart', 'separator', 'shutDown'])
      expect(await theKeyIsTaken(app, key.accelerator)).toBe(false)

      // THE KEY, pressed on the display, opens nothing, and nor does the office page's line asking for a note. The
      // window's log says once that the page's ask opened no note. The key's press is given two seconds more.
      await pressTheShortcutAt(theDisplayOf(world), key.accelerator)
      await page.evaluate((line) => console.log(line), THE_PAGE_SAYS.openAQuickNote)
      await expect.poll(() => theLinesSaying(app, A_NOTE_ASKED_FOR_WITHOUT_THE_NOTE_PAGE), { timeout: 10_000 }).toBe(1)
      await sleep(2_000)
      const after = await waitFor(app, () => true, 'the window read')
      expect(after.quickNote).toEqual(none)
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 'a window opened beside the office').toBe(1)
      expect(page.url().startsWith(`http://127.0.0.1:${String(world.port)}/`), 'the window left the office page').toBe(true)
    } finally {
      await app.close()
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  // ROUND 23 OF WAVE 13T: the real window, given a debugging switch with no developer setting, refuses to
  // start in words and starts no service (src/desktop/the-debugging-switches.mjs; every case above is the
  // control, started by Playwright with those switches and the setting on). MUTATION: main.mjs does not ask
  // whyTheWindowRefusesToStart: the window starts its office, this case red.
  //
  // ROUND W2 OF WAVE 13T: on Linux the window also shows the refusal in a box, as on a Mac, and ends with 1
  // once Ok is pressed. Each window runs on a display of its own (aDisplayOfItsOwn), so what is lit there is
  // its box. Given --inspect, it closes Node's inspector before the box, so no debugger can connect while the
  // box waits. MUTATIONS, in main.mjs:
  //   - the box shown on a Mac only, as before: red, the window ends before anything is lit;
  //   - the box shown on Linux before the app is ready: red, the same, because Electron then only writes it;
  //   - the inspector left open: red, a debugger connects while the box waits.
  it('refuses to start with a debugging switch when the developer setting is off, says why in a box, and starts no office', async () => {
    const binary = electronsBinary()
    if ('missing' in binary) throw new Error(binary.missing)
    for (const given of ['--remote-debugging-port=0', '--inspect=0']) {
      const world = await aWorld('refuses')
      const own = await aDisplayOfItsOwn()
      const env: NodeJS.ProcessEnv = { ...world.env, DISPLAY: `:${own.display}` }
      delete env['MOLE_OFFICE_WINDOW_DEBUGGING']
      delete env['WAYLAND_DISPLAY']
      const window = spawn(binary.path, ['--no-sandbox', given, THE_WINDOW], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
      if (window.pid !== undefined) electrons.set(window.pid, binary.path)
      let said = ''
      window.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
      window.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
      const ended = new Promise<number | null>((done) => window.on('exit', (exitCode) => done(exitCode)))
      const name = given.slice(0, given.indexOf('='))
      const words = `Mole Office will not start, because it was given the debugging switch ${name}.`
      for (let waited = 0; waited < 30_000 && !said.includes(words) && stillRunning(window); waited += 250) await sleep(250)
      expect(said).toContain(words)
      // THE BOX. Something is lit on the window's own display while the window still runs, and is drawn whole.
      let lit = whatIsLit(own.screen)
      for (let waited = 0; waited < 30_000 && lit.lit === 0 && stillRunning(window); waited += 250) {
        await sleep(250)
        lit = whatIsLit(own.screen)
      }
      await sleep(500)
      lit = whatIsLit(own.screen)
      expect(stillRunning(window), `the window given ${given} ended before it showed its box\n${said}`).toBe(true)
      expect(lit.lit, `the window given ${given} drew nothing on its display\n${said}`).toBeGreaterThan(0)
      if (name === '--inspect') {
        const inspector = /Debugger listening on (ws:\/\/\S+)/.exec(said)?.[1]
        expect(inspector, `the window given ${given} never said where its inspector listened\n${said}`).toBeDefined()
        expect(await aDebuggerConnects(String(inspector))).toBe('refused')
      }
      // OK. With no window manager the box is drawn from the display's top left corner, and its Ok button
      // runs along its bottom edge, measured on Electron 44.5.1.
      await pressAt(own.display, Math.floor(lit.right / 2), lit.bottom - 12)
      const code = await Promise.race([ended, sleep(30_000).then(() => 'still running after 30 s')])
      expect(code, `the window given ${given} did not end with 1 once Ok was pressed\n${said}`).toBe(1)
      expect(theLock(world), `the window given ${given} started an office`).toBeNull()
      const group = own.server.pid
      if (group !== undefined) process.kill(-group, 'SIGTERM')
      for (let waited = 0; waited < 15_000 && stillRunning(own.server); waited += 100) await sleep(100)
    }
  }, 180_000)
})
