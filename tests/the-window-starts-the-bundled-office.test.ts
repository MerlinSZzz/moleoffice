// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WINDOW RUN FROM A BUNDLE STARTS THE BUNDLED OFFICE. Packaging step 1, piece 3 (wave 13t round 12).
 *
 * src/desktop/main.mjs starts the service of the install it runs from. It tells which the way the
 * server does, through the declaration (src/config/settings.mjs, THE INSTALL AND ITS DATA): a build
 * stamp beside its own code means a bundle. So `electron <bundle>/window.mjs` runs the bundle's
 * mole-office.mjs, and the service it starts runs from the bundle with its data in the per-user data
 * folder, which is also the window's own folder. A window run from a checkout starts the checkout's
 * service, which tests/the-window-finds-its-office.test.ts shows.
 *
 * A window test: it runs only on the window list (`node tools/run-named-tests.mjs --list window`),
 * under a virtual display. Its bundle, home and port are its own; never the live office.
 *
 * Three-run proofs: node tools/run-named-tests.mjs --list window
 * MUTATION: src/desktop/main.mjs runs the checkout's command whatever install it runs from: red,
 * because a bundle holds no src/config/the-service-command.mjs and nothing starts.
 * MUTATION (round 13): src/desktop/main.mjs runs the command with the Node on PATH even from an install:
 * red, because the service then runs on that Node and not on the installation's own.
 *
 * MUTATION (round 14): src/desktop/main.mjs does not read --no-sandbox from its command line: red,
 * because the check page carries no warning and the window opens the office by itself.
 * MUTATION (round 14): the window opens a healthy office by itself even without its sandbox: red,
 * because the check page offers no Open press and the office is shown before it.
 *
 * MUTATION (round 16, 5 October 2026): src/desktop/main.mjs does not load the page again when its
 * renderer ends: red, because drawn() never answers after forcefullyCrashRenderer (the same as the
 * Chinese check page in the container runs without the sandbox). Before the fix this case was red in
 * the same way.
 *
 * ROUND 16C: A FEW RELOADS, THEN A LOUD STOP, AND NONE WHILE QUITTING. The renderer is ended 3 times
 * and the check page must come back each time (the control: within the limit, the window reloads).
 * The 4th end, within 60 seconds, must show the window's own plain page saying the page kept stopping,
 * with the window's title saying it and the log saying it, and a 5th end must load nothing. A second
 * window is then told Mole Office is quitting (Electron's before-quit, given without quitting), and an
 * end of its renderer must load nothing.
 * MUTATION (round 16c): src/desktop/main.mjs never stops at the limit (`if (false && reloadedAt.length >=
 * RELOADS_AT_MOST)`): red, because the 4th end loads the check page again and the plain page never shows.
 * MUTATION (round 16c): src/desktop/main.mjs does not look at `quitting` before it reloads: red, because
 * the second window's page is loaded again while it is quitting.
 *
 * ROUND 17: THE RENDERER IS KILLED, NOT CRASHED, so a run leaves no core dump on the machine (six
 * crashes of one check of round 16c left 1.2 GB). The log must say each end was a kill.
 * MUTATION (round 17): endTheRenderer ends the renderer with SIGHUP, which also leaves no core dump: red,
 * because the log says the page stopped another way than killed. (Going back to forcefullyCrashRenderer
 * was not run as the mutation, because it would leave the dumps again.)
 *
 * ROUND 17B: THE TERMINAL HOLDER IS STOPPED TOO. Every bundle carries holder.mjs since round 17, so the
 * bundled office's start also starts a terminal holder, in a process group of its own, and the office's
 * stop leaves it running on purpose (src/config/the-service-command.mjs, its header). The test asks the
 * holder's socket in its own home for the holder's process, records that process's group with the
 * office's, prints what each group holds before it stops it, and stops only a group whose every process
 * runs from this file's folder. After the clean-up no process of a recorded group may be left, and no
 * holder may answer on the socket: an assertion of the clean-up, so a run that leaves one is red.
 * MUTATION (round 17b): the clean-up does not stop the holder's group: red, because the holder is still
 * running after the clean-up and still answers on its socket.
 * Before round 17b the test's folder names were longer, and under a sandbox's own temporary folder the
 * holder's socket path came to 115 bytes, over the 107 a Unix socket allows: there the holder refused to
 * start and the office ran without one, so a run in a sandbox left no holder while a run under /tmp did.
 * The names are now short, and the case fails, quoting the holder's log, when no holder answers.
 *
 * MUTATION (round 14): scripts/bundle.mjs does not copy src/web/tokens.css: red, because the bundled
 * check page is drawn without the office's colours.
 *
 * ROUND 14: A WINDOW RUN WITHOUT CHROMIUM'S SANDBOX SAYS SO. Every window test runs Electron with
 * --no-sandbox, as the AppImage's own launcher does on a stock Ubuntu 24.04 desktop, so this window
 * ends its check page with the warning and waits for the Open press before it shows the office.
 *
 * AN INSTALLED WINDOW RUNS THE OFFICE ON THE INSTALLATION'S OWN NODE, and not on the Node on PATH.
 * On Linux that Node is the window's own Electron program, told to run as Node by ELECTRON_RUN_AS_NODE=1
 * (theInstallsNode in src/config/settings.mjs), and a bundle carries no Node of its own. So this test checks
 * the service runs on the Electron program that runs the window, and runs the bundled command on it too.
 *
 * ROUND W48 OF WAVE 13T: A WINDOW WHOSE OFFICE WAITS FOR ITS UPDATE (decision 5ELTycOeGmer, problem
 * 26HFV8dpvQ8A). beta.5's window could not open an installed office that waits for its owner's Back up and update.
 * The window pairs before it opens an office, and the waiting office serves no pairing door, so the window showed
 * only Check again. Now the window opens the offer without pairing, and pairs before the office's own page loads.
 *   - Case 2: the bundled office makes its file and stops. The file is then given a note written straight into it,
 *     past every door, so the update really would write to it, as tests/an-installed-office-updates-on-the-owners-press.test.ts
 *     writes one. A window run from the bundle, never paired with it, starts the office, which waits for the press. Open
 *     shows the offer in the window, with its press. Pressed there, the update gives the note its revision, and the
 *     window shows the office's first page, paired: its session holds the key's cookie. The office logged the window's
 *     read and press of its pairing door first, and every call to the door after them was a read that carried the key.
 *     The window's press of the door is answered 3 seconds late, as on Windows, where the office reads who pressed with
 *     a script of about a second, so a page that loaded before the window had paired would show the Pairing page.
 *   - Case 2 was red with the window as it was before this round: the window showed its check page, which said the
 *     office answered but did not pair it, and not the offer.
 *   - MUTATIONS, each after a control run with the window's change in, each red in case 2:
 *     W1: the window pairs a waiting office first, as before: red, the window shows its check page and not the offer.
 *     W2: the window opens the offer and puts no hold on the office's next load: red, the window's page is not paired.
 *     W3: the hold lets the healthy office's load go without pairing: red, the window's page is not paired.
 *     W4: the hold lets the load go first and pairs after it: red, the window's page is not paired. Before the press
 *     was answered late, W4 passed, because the window had paired before the page read the door.
 * The two cases share one bundle, which the first of them to run makes. Each has its own home and port.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import type { ElectronApplication } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'

import { KEY_COOKIE } from '../src/config/key-header.mjs'
import { commandLineOf, theProcessAt } from '../src/config/session-process.mjs'
import { askTheHolder, theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { theSandboxWarning } from '../src/config/the-self-check.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { THE_UPDATE_WAITS } from '../src/config/world-address.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { electronsBinary, stillRunning, theOfficesBackground, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`the-window-starts-the-bundled-office: skipped. ${WHY_NOT}`)

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const began = Date.now()
/** One line per step, with the seconds since the file began, so a stop says where it stopped. */
const step = (what: string): void => console.log(`the-window-starts-the-bundled-office: ${String(Math.round((Date.now() - began) / 1000))}s ${what}`)
const groups = new Set<number>()
const electrons = new Set<number>()
let dir = ''
/**
 * Each office a case starts: its database, and the socket its terminal holder listens on in that case's own home. Each
 * is known before its window starts, so the clean-up can read every lock and ask every holder whatever failed.
 */
type AnOffice = { database: string; holderSocket: string }
const offices: AnOffice[] = []

/**
 * RECORD THE TERMINAL HOLDER'S GROUP: ask the holder of one of this file's offices for its process, and add that
 * process's group to the groups the clean-up stops. The group is read from the process, not assumed.
 * Gives the group, or null when no holder of this office answers.
 */
async function recordTheHolder({ database, holderSocket }: AnOffice): Promise<number | null> {
  const hello = await askTheHolder(holderSocket, { op: 'hello' }, 1_000).catch(() => null)
  if (hello === null || hello['database'] !== database) return null
  const holder = theProcessAt(Number(hello['pid']))
  if (!holder.here || holder.pgid === null) return null
  groups.add(holder.pgid)
  return holder.pgid
}

/** WHAT A PROCESS GROUP HOLDS, read from /proc: each process in it, with its command line. */
function membersOf(group: number): { pid: number; command: string }[] {
  const members: { pid: number; command: string }[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^[0-9]+$/.test(name)) continue
    const one = theProcessAt(Number(name))
    if (one.here && one.pgid === group) members.push({ pid: Number(name), command: commandLineOf(Number(name)) ?? '(its command line could not be read)' })
  }
  return members
}

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

type WindowState = {
  check: { answer: string | null; lines: unknown[]; offers: string[]; busy: boolean }
  officeAddress: string | null
  showing: { url: string; loading: boolean } | null
}

async function waitFor(app: ElectronApplication, ready: (state: WindowState) => boolean, what: string): Promise<WindowState> {
  const deadline = Date.now() + 120_000
  let last: WindowState | null = null
  while (Date.now() < deadline) {
    last = (await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow?: { state(): unknown } }).theMoleOfficeWindow?.state() ?? null)) as WindowState | null
    if (last !== null && ready(last)) return last
    await sleep(500)
  }
  throw new Error(`The window did not reach "${what}" in 120 seconds. It last said: ${JSON.stringify(last)}`)
}

/**
 * End the window's renderer, as a crash does, by killing its process (round 17). On Linux,
 * forcefullyCrashRenderer makes the renderer really crash, and each crash left a core dump of about
 * 200 MB on the machine running the test: six per run, 1.2 GB at 04:36 on 5 October from one check of
 * round 16c. A killed process leaves none, and the window treats every way its page stops the same.
 */
async function endTheRenderer(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const pid = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId()
    if (pid !== undefined && pid > 0) process.kill(pid, 'SIGKILL')
  })
}

/** Wait up to 20 seconds for the check page to be drawn again with all its lines, in the office's colours. */
async function theCheckPageDrawnAgain(app: ElectronApplication, lines: number, what: string): Promise<void> {
  const deadline = Date.now() + 20_000
  let again: unknown = null
  while (Date.now() < deadline) {
    // Each ask has 3 seconds: a page whose renderer has gone never answers at all.
    again = await app.evaluate(async () => {
      const asked = (globalThis as unknown as { theMoleOfficeWindow: { drawn(): Promise<unknown> } }).theMoleOfficeWindow.drawn()
      return Promise.race([asked, new Promise((done) => setTimeout(() => done({ error: 'no answer within 3 seconds' }), 3_000))])
    })
    const page = again as { url?: string; lines?: number } | null
    if (page?.url?.startsWith('file:') === true && page.lines === lines) break
    await sleep(300)
  }
  expect(again, what).toMatchObject({ lines, background: theOfficesBackground('light') })
}

/**
 * THE BUNDLE EVERY CASE RUNS, made once, in this file's own folder.
 * SHORT NAMES, because the holder's socket is in the per-user data folder under a case's home, and a Unix
 * socket's path may be at most 107 bytes. Under a sandbox's longer temporary folder the old names
 * (bundled-window-, home) made it 115, the holder refused to start, and nothing showed it.
 */
function theBundle(): string {
  if (dir !== '') return join(dir, 'bundle')
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}bw-`)
  const bundle = join(dir, 'bundle')
  const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
  expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
  step('bundled')
  return bundle
}

/** A home and a port of a case's own, in this file's folder, and the environment its window runs in. */
async function aHomeOfItsOwn(name: string): Promise<{ home: string; port: number; env: Record<string, string> }> {
  const home = join(dir, name)
  mkdirSync(home)
  const port = await aFreePort()
  // THE DISPLAY'S SETTINGS STAY, AND NONE OF THIS SHELL'S MOLE OFFICE SETTINGS DO.
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith('MOLE_') || key.startsWith('VITEST') || key === 'XDG_CONFIG_HOME') continue
    env[key] = value
  }
  // Playwright starts the window with --inspect and --remote-debugging-port, which the window refuses unless this says on.
  Object.assign(env, { HOME: home, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_WINDOW_DEBUGGING: 'on' })
  return { home, port, env }
}

/** The database an installed office keeps in the per-user data folder under this home. */
const theDatabaseIn = (home: string): string => join(home, '.config', 'mole-office', 'data', 'mole-office.db')

/** The note written into an office's file past every door, which the update must give its first revision. */
const PAST_THE_DOOR = 'written-past-the-door'

/** How many revisions the note written past the door has, read from the office's file. */
function revisionsOfTheNote(database: string): number {
  const file = new Database(database, { readonly: true, fileMustExist: true })
  try {
    return (file.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(PAST_THE_DOOR) as { n: number }).n
  } finally {
    file.close()
  }
}

/** What the office logged of the requests to its pairing door, oldest first, read from its own request log. */
function thePairingCalls(database: string): { method: string; status: number; identity: string }[] {
  const file = new Database(database, { readonly: true, fileMustExist: true })
  try {
    return file
      .prepare("SELECT method, status, identity_source AS identity FROM api_calls WHERE route = '/api/office/pairing' ORDER BY at_ms, rowid")
      .all() as { method: string; status: number; identity: string }[]
  } finally {
    file.close()
  }
}

afterAll(async () => {
  // THE WINDOW STARTS THE OFFICE BY ITSELF, so a case that failed before reading the lock has a service
  // this file never recorded. Each lock is read here, first, to record its group.
  for (const office of offices) {
    const lock = readTheServiceLock(`${office.database}.service.json`)
    if (lock.state === 'read') groups.add(lock.lock.pgid)
    // SO IS THE TERMINAL HOLDER the office started, which the office's own stop leaves running.
    await recordTheHolder(office)
  }
  for (const pid of electrons) {
    if (!theProcessAt(pid).here) continue
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  // CHAPTER 2: WHAT EACH GROUP HOLDS IS READ AND PRINTED BEFORE IT IS STOPPED, and a group is stopped
  // only when every process in it runs from this file's folder.
  const refused: string[] = []
  const running: number[] = []
  for (const group of groups) {
    const members = membersOf(group)
    console.log(`the-window-starts-the-bundled-office: group ${String(group)} holds ${members.length === 0 ? 'nothing' : members.map((one) => `${String(one.pid)} ${one.command}`).join('; ')}`)
    if (members.length === 0) continue
    const strangers = members.filter((one) => dir === '' || !one.command.includes(dir))
    if (strangers.length > 0) refused.push(`group ${String(group)} was not stopped, because it holds processes that do not run from ${dir}: ${strangers.map((one) => `${String(one.pid)} ${one.command}`).join('; ')}`)
    else running.push(group)
  }
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some((group) => membersOf(group).length > 0) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter((one) => membersOf(one).length > 0)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
  await sleep(500)
  // NOTHING THIS FILE STARTED OUTLIVES IT: no process of a recorded group, and no holder on its socket.
  const left = [...groups].flatMap((group) => membersOf(group).map((one) => `group ${String(group)}: ${String(one.pid)} ${one.command}`))
  const stillAnswers: string[] = []
  for (const { holderSocket } of offices) if ((await askTheHolder(holderSocket, { op: 'hello' }, 1_000).catch(() => null)) !== null) stillAnswers.push(holderSocket)
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  expect(refused).toEqual([])
  expect(left, 'processes this file started are still running after its clean-up').toEqual([])
  expect(stillAnswers, "a terminal holder still answers on one of this file's sockets after its clean-up").toEqual([])
}, 60_000)

describe.skipIf(WHY_NOT !== null)('a window run from a bundle', () => {
  it('starts the bundled office, which keeps its data in the per-user data folder', async () => {
    const bundle = theBundle()
    const { home, port, env } = await aHomeOfItsOwn('h')
    const database = theDatabaseIn(home)
    const holderSocket = theTerminalHolderSocket(database, env)
    const office = { database, holderSocket }
    offices.push(office)
    const binary = electronsBinary()
    if ('missing' in binary) throw new Error(binary.missing)
    const { _electron } = await import('playwright')
    const app = await _electron.launch({ executablePath: binary.path, args: ['--no-sandbox', join(bundle, 'window.mjs')], env, timeout: 60_000 })
    // KEPT AT LAUNCH: Playwright's app.process() gives undefined once Electron has exited.
    const child = app.process()
    const pid = child.pid
    if (pid !== undefined) electrons.add(pid)
    // WHAT THE WINDOW'S PROGRAM PRINTS, kept to read what it said of its page (round 16).
    let printed = ''
    child.stderr?.on('data', (chunk) => (printed += String(chunk)))
    step('the window launched')

    try {
      const state = await waitFor(app, (one) => one.check.answer !== null && one.check.answer !== 'not-answering', 'an answer')
      step(`the window answered ${String(state.check.answer)}`)
      const lock = readTheServiceLock(`${database}.service.json`)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      // ROUND 17B: THE OFFICE STARTED A TERMINAL HOLDER, in a group of its own, which the clean-up stops.
      const holderGroup = await recordTheHolder(office)
      step(`the terminal holder's process group is ${String(holderGroup)}`)
      expect(state.check.answer, JSON.stringify(state.check.lines)).toBe('healthy')
      expect(lock.state).toBe('read')
      const holderLog = theTerminalHolderLog(database, env)
      expect(holderGroup, `no terminal holder of this office answered on its socket. Its log (${holderLog}) says: ${existsSync(holderLog) ? readFileSync(holderLog, 'utf8') : 'nothing; there is no log'}`).not.toBeNull()
      if (lock.state === 'read') expect(holderGroup).not.toBe(lock.lock.pgid)
      // THE SERVICE IT STARTED RUNS FROM THE BUNDLE, with its database in the per-user data folder.
      const runtime = (await (await fetch(`http://127.0.0.1:${String(port)}/api/runtime`)).json()) as { repository: { path: string }; database: { path: string } }
      expect(runtime.repository.path).toBe(bundle)
      expect(runtime.database.path).toBe(database)
      expect(existsSync(join(bundle, 'data'))).toBe(false)
      // AND IT RUNS ON THE INSTALLATION'S OWN NODE, not on the one on PATH.
      // On Linux that is the Electron program the window runs on.
      if (lock.state === 'read') expect(readlinkSync(`/proc/${String(lock.lock.pid)}/exe`), 'the office does not run on the program the window runs on').toBe(realpathSync(binary.path))

      // ROUND 14: STARTED WITHOUT CHROMIUM'S SANDBOX, as the AppImage's launcher starts it on a stock
      // Ubuntu 24.04 desktop, the window says so at the end of its check page and opens the office only
      // when the person presses Open, so the warning is read and not flashed past.
      const held = await waitFor(app, (one) => one.check.answer === 'healthy' && !one.check.busy, 'healthy, and waiting for the press')
      expect(held.check.lines.slice(-4)).toEqual(theSandboxWarning('en'))
      expect(held.check.offers).toEqual(['openTheOffice'])
      expect(held.showing?.url.startsWith('file:')).toBe(true)
      // The bundled check page is painted in the office's own colours, which the bundle carries.
      const drawn = (await app.evaluate(async () => (globalThis as unknown as { theMoleOfficeWindow: { drawn(): Promise<unknown> } }).theMoleOfficeWindow.drawn())) as { background: string }
      expect(drawn.background).toBe(theOfficesBackground('light'))

      // ROUND 16: THE PAGE COMES BACK WHEN ITS RENDERER ENDS. In round 15's and 16's container runs,
      // while the Chinese check page showed the warning, Electron said the page's frame was disposed, and
      // from then on no question about the page was answered. The renderer is ended here on purpose,
      // and the check page must be drawn again, with all its lines, within 20 seconds.
      // ROUND 16C: three times, the window's limit in 60 seconds, and each time it must come back.
      const firstEnd = Date.now()
      for (let end = 1; end <= 3; end += 1) {
        await endTheRenderer(app)
        await theCheckPageDrawnAgain(app, held.check.lines.length, `the check page after its renderer ended (end ${String(end)} of 3)`)
        step(`the check page was drawn again after its renderer ended (end ${String(end)} of 3)`)
      }
      expect(printed).toContain("The window's page stopped (")
      expect(printed).toContain('so the window loads it again (3 of at most 3 times in 60 seconds)')
      // ROUND 17: every end was a kill and none a crash, so this test leaves no core dump behind.
      expect(printed).toContain("The window's page stopped (killed,")
      expect(printed).not.toContain("The window's page stopped (crashed,")

      // ROUND 16C: THE 4TH END WITHIN 60 SECONDS IS A LOUD STOP. The window loads the page no more and
      // shows its own plain page, in its language, under a title that says it, and the log says it.
      expect(Date.now() - firstEnd, 'the three ends took longer than the window counts them, so the 4th would not be over its limit').toBeLessThan(50_000)
      await endTheRenderer(app)
      const stoppedAt = await waitFor(app, (one) => one.showing?.url.startsWith('data:') === true && !one.showing.loading, 'the plain page that says the page kept stopping')
      const said = WINDOW_WORDS.en.keptStopping
      const shown = (await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        return { title: window?.getTitle(), text: (await window?.webContents.executeJavaScript('document.body.innerText')) as string }
      })) as { title: string; text: string }
      expect(shown.title).toBe(said.title)
      expect(shown.text).toContain(said.heading)
      expect(shown.text).toContain(said.why(4, 60))
      expect(shown.text).toContain(said.todo(stoppedAt.officeAddress))
      expect(printed).toContain(`${said.why(4, 60)} ${said.todo(stoppedAt.officeAddress)}`)
      step('the 4th end showed the plain page that says the page kept stopping')
      // And after the stop, an end loads nothing: the renderer stays gone.
      await endTheRenderer(app)
      await sleep(5_000)
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.isCrashed())).toBe(true)
      expect(printed).toContain('The window stopped loading its page earlier, so it does nothing now.')
      expect(printed).not.toContain('(4 of at most 3')
      step('a 5th end loaded nothing')
      await app.evaluate(async () => {
        await (globalThis as unknown as { theMoleOfficeWindow: { openTheOffice(): Promise<void> } }).theMoleOfficeWindow.openTheOffice()
      })
      await waitFor(app, (one) => one.showing?.url.startsWith(`http://127.0.0.1:${String(port)}`) === true, 'the office open after the press')
      step('the warning was shown, and the office opened on the press')

      // AND ITS TRAY SHUTS THE BUNDLED OFFICE DOWN, window and service, as from a checkout.
      const closed = new Promise<void>((done) => child.on('exit', () => done()))
      await app
        .evaluate(async (_electron) => {
          await (globalThis as unknown as { theMoleOfficeWindow: { press(id: string): Promise<void> } }).theMoleOfficeWindow.press('shutDown')
        })
        .catch(() => {
          // The main process may end before it answers; that is the shutdown working.
        })
      await app.evaluate(async () => {
        await (globalThis as unknown as { theMoleOfficeWindow: { answerTheShutDownQuestion(answer: 'yes'): Promise<void> } }).theMoleOfficeWindow.answerTheShutDownQuestion('yes')
      })
      await closed
      step('the window and the office shut down')
      expect(readTheServiceLock(`${database}.service.json`).state).toBe('absent')
    } finally {
      // A case that fails half way still ends its window; the office is stopped by its group below.
      if (stillRunning(child)) child.kill('SIGKILL')
    }

    // ROUND 16C: NO RELOAD WHILE QUITTING. A second window, started the same way, is given Electron's
    // before-quit, the event every quit begins with, without quitting. Its renderer is then ended, and the
    // page must stay gone. Round 16's AppImage run printed reloads while the program was being stopped.
    const second = await _electron.launch({ executablePath: binary.path, args: ['--no-sandbox', join(bundle, 'window.mjs')], env, timeout: 60_000 })
    const secondChild = second.process()
    if (secondChild.pid !== undefined) electrons.add(secondChild.pid)
    let secondPrinted = ''
    secondChild.stderr?.on('data', (chunk) => (secondPrinted += String(chunk)))
    try {
      const held = await waitFor(second, (one) => one.check.answer === 'healthy' && !one.check.busy, 'the second window healthy, and waiting for the press')
      const lock = readTheServiceLock(`${database}.service.json`)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      expect(held.showing?.url.startsWith('file:')).toBe(true)
      await second.evaluate(({ app }) => {
        app.emit('before-quit', { preventDefault: () => {} })
      })
      await endTheRenderer(second)
      await sleep(5_000)
      expect(await second.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.isCrashed())).toBe(true)
      expect(secondPrinted).toContain('while Mole Office is shutting down, so the window does not load it again.')
      expect(secondPrinted).not.toContain('so the window loads it again')
      expect(secondPrinted).not.toContain("The window's page stopped (crashed,")
      step('the second window, quitting, did not load its page again')
      const closed = new Promise<void>((done) => secondChild.on('exit', () => done()))
      await second
        .evaluate(async () => {
          await (globalThis as unknown as { theMoleOfficeWindow: { press(id: string): Promise<void> } }).theMoleOfficeWindow.press('shutDown')
        })
        .catch(() => {
          // The main process may end before it answers; that is the shutdown working.
        })
      await second.evaluate(async () => {
        await (globalThis as unknown as { theMoleOfficeWindow: { answerTheShutDownQuestion(answer: 'yes'): Promise<void> } }).theMoleOfficeWindow.answerTheShutDownQuestion('yes')
      })
      await closed
      step('the second window and the office shut down')
      expect(readTheServiceLock(`${database}.service.json`).state).toBe('absent')
    } finally {
      if (stillRunning(secondChild)) secondChild.kill('SIGKILL')
    }
  }, 420_000)

  it('shows an office that waits for its update its offer without pairing, and opens it paired once the update is done', async () => {
    const bundle = theBundle()
    const { home, port, env } = await aHomeOfItsOwn('u')
    const database = theDatabaseIn(home)
    const office = { database, holderSocket: theTerminalHolderSocket(database, env) }
    offices.push(office)
    const address = `http://127.0.0.1:${String(port)}`

    // THE OFFICE AN EARLIER VERSION LEFT. The bundled office makes its file, with its owner named as an installer names
    // them, and stops. An office that was used has a named owner, so its first page is the office and not the guide that
    // asks a new office's person for their name. The file is then given a note written straight into it, past every
    // door, so the update really would write to it, as the update's own test does.
    // The bundled command is run as the window runs it: on the Electron program, told to run as Node.
    const binary = electronsBinary()
    if ('missing' in binary) throw new Error(binary.missing)
    const command = (what: 'start' | 'stop', more: Record<string, string> = {}) =>
      spawnSync(binary.path, [join(bundle, 'mole-office.mjs'), what], { env: { ...env, ...more, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 120_000 })
    const started = command('start', { MOLE_OFFICE_OWNER_NAME: 'A made-up owner' })
    const first = readTheServiceLock(`${database}.service.json`)
    if (first.state === 'read') groups.add(first.lock.pgid)
    await recordTheHolder(office)
    expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0)
    const stopped = command('stop')
    expect(stopped.status, `${stopped.stdout}\n${stopped.stderr}`).toBe(0)
    const file = new Database(database, { fileMustExist: true })
    try {
      const owner = file.prepare('SELECT id FROM people WHERE office_owner IS NOT NULL').get() as { id: string }
      const workspace = file.prepare('SELECT id FROM workspaces ORDER BY id LIMIT 1').get() as { id: string }
      file
        .prepare(
          'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, origin, kind, title, summary, data) ' +
            "VALUES (?, ?, ?, '2026-10-10 09:00:00', '2026-10-10 09:00:00', 'authored', 'note', ?, NULL, ?)",
        )
        .run(PAST_THE_DOOR, workspace.id, owner.id, 'a note nothing filed', '{"body":"made-up test data"}')
    } finally {
      file.close()
    }
    step('the office was made and stopped, and its file was given a note past the door')

    const { _electron } = await import('playwright')
    const app = await _electron.launch({ executablePath: binary.path, args: ['--no-sandbox', join(bundle, 'window.mjs')], env, timeout: 60_000 })
    const child = app.process()
    if (child.pid !== undefined) electrons.add(child.pid)
    try {
      // THE WINDOW STARTS THE OFFICE, AND THE OFFICE WAITS FOR ITS OWNER'S PRESS: its health says so.
      const waiting = await waitFor(app, (one) => one.check.answer !== null && one.check.answer !== 'not-answering' && !one.check.busy, 'an answer')
      const lock = readTheServiceLock(`${database}.service.json`)
      if (lock.state === 'read') groups.add(lock.lock.pgid)
      await recordTheHolder(office)
      const health = await fetch(`${address}/api/health`)
      expect(health.status).toBe(503)
      expect(await health.json()).toMatchObject({ [THE_UPDATE_WAITS]: true })
      expect(waiting.check.offers, JSON.stringify(waiting.check.lines)).toEqual(['openTheOffice'])
      step('the office waits for the press, and the window offers Open')

      // OPEN SHOWS THE OFFER IN THE WINDOW, WITH ITS PRESS, though the window has not paired.
      await app.evaluate(async () => {
        await (globalThis as unknown as { theMoleOfficeWindow: { openTheOffice(): Promise<void> } }).theMoleOfficeWindow.openTheOffice()
      })
      const shown = await waitFor(
        app,
        (one) => one.check.offers.includes('checkAgain') || (one.showing?.url.startsWith(address) === true && !one.showing.loading),
        'the offer, or the check page saying why not',
      )
      expect(shown.showing?.url, `the window did not show the offer. Its check page says: ${JSON.stringify(shown.check.lines)}`).toBe(`${address}/`)
      const page = await app.firstWindow()
      const press = page.locator('#back-up-and-update')
      await press.waitFor({ timeout: 30_000 })
      expect(await press.isEnabled(), 'the offer does not let the window press').toBe(true)
      expect(revisionsOfTheNote(database), 'the update wrote before the press').toBe(0)
      step('the window shows the offer and its press')

      // PRESSED THERE, THE UPDATE RUNS, AND THE WINDOW SHOWS THE OFFICE'S FIRST PAGE, PAIRED. The window's own press of the
      // pairing door is answered 3 seconds late, as on Windows, where the office reads who pressed with a script of about a
      // second. A page of the office that loaded before the window had paired would read the door without the key in that
      // time, and show the Pairing page.
      await app.evaluate(({ session }, door) => {
        const slowed = { presses: 0 }
        ;(globalThis as unknown as { theSlowedPresses: typeof slowed }).theSlowedPresses = slowed
        session.defaultSession.webRequest.onBeforeSendHeaders((request, go) => {
          if (request.method !== 'POST' || request.url !== door) {
            go({})
            return
          }
          slowed.presses += 1
          setTimeout(() => go({}), 3_000)
        })
      }, `${address}/api/office/pairing`)
      await press.click()
      // The office's first page, or its Pairing page, is looked for in the page and not on the screen, because on this
      // display the page's sidebar is closed and its shut-down button is hidden.
      const notShown = await page
        .waitForFunction(() => document.querySelector('.sbp-shut-down, .pair') !== null, undefined, { timeout: 120_000 })
        .then(
          () => null,
          async (failed: unknown) => `${String(failed)}\nThe page at ${page.url()} says: ${(await page.locator('body').innerText().catch(() => '')).slice(0, 600)}`,
        )
      expect(notShown, "neither the office's first page nor its Pairing page showed").toBeNull()
      step('the office shows')
      expect(revisionsOfTheNote(database), 'the update did not write what the start check said it would').toBe(1)
      expect(await page.evaluate(() => window.location.hash), "the window's page went to another page").toBe('')
      expect(await page.locator('.pair').count(), 'the window showed the Pairing page').toBe(0)
      const read = await page.evaluate(async () => ((await (await fetch('/api/office/pairing')).json()) as { paired?: unknown }).paired)
      expect(read, "the window's page is not paired").toBe(true)
      const cookies = await app.evaluate(
        async ({ session }, url) => (await session.defaultSession.cookies.get({ url })).map((one) => ({ name: one.name, httpOnly: one.httpOnly === true })),
        address,
      )
      expect(cookies).toContainEqual({ name: KEY_COOKIE, httpOnly: true })
      // THE WINDOW PAIRED BEFORE THE OFFICE'S PAGE ASKED: the door's first two calls were the window's read and its
      // press, and every call after them was a read that carried the key. A page that loaded first would have read
      // the door without the key, and shown the Pairing page.
      const calls = thePairingCalls(database)
      expect(calls.slice(0, 2).map((one) => `${one.method} ${String(one.status)}`)).toEqual(['GET 200', 'POST 200'])
      expect(calls.slice(2).filter((one) => one.method !== 'GET' || one.identity !== 'key')).toEqual([])
      const slowed = await app.evaluate(() => (globalThis as unknown as { theSlowedPresses: { presses: number } }).theSlowedPresses.presses)
      expect(slowed, "the window's press of the pairing door was not slowed, so this case shows nothing of the order").toBeGreaterThan(0)
      step('the window opened the office, paired')
    } finally {
      if (stillRunning(child)) child.kill('SIGKILL')
    }
  }, 420_000)
})
