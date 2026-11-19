// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW SAYS WHEN THE SERVICE THAT ANSWERS IS OLDER THAN ITSELF (src/desktop/main.mjs, with
 * src/desktop/the-services-version.mjs).
 *
 * A service keeps running when Mole Office is replaced by a newer copy. The newer window then finds the older service
 * healthy, and before this it opened it, so the person worked in the older version without knowing. Now the window
 * compares the version the service's health check says with its own. When the service is older, its check page says
 * so with both versions, and offers Restart the service and Open it anyway. It does not open the office by itself.
 *
 * AN OLDER SERVICE, MADE AS AN UPDATE LEAVES ONE. Each case starts the bundle's service with the bundle's own
 * `mole-office.mjs start`, on the Node the bundle carries, while the bundle's build stamp names the version it was
 * bundled with. Then only `version` in the bundle's build-stamp.json is changed, to a newer one: the same version with
 * its patch number one higher (0.1.0-beta.6 becomes 0.1.1-beta.6). A process reads the stamp once, as it starts
 * (THE_INSTALL in src/config/settings.mjs), so the running service keeps the version it started with. A window started
 * after the change, and every command it runs, read the newer one. That is what replacing the installed files under a
 * running service does: the service runs the old version, and everything started afterwards runs the new one.
 *   1. The check page says what the self-check found, then that the service is older, with both versions, then the
 *      sandbox warning. It offers Restart the service and Open it anyway, and it shows no office.
 *   2. The page's own Restart the service press restarts the service. The service lock then names a new server, the
 *      health check says the newer version, and the window opens the office on the Open press.
 *   3. The page's own Open it anyway press opens the older service, and leaves it running.
 *   4. The pictures, when MOLE_OFFICE_WINDOW_PICTURES names a folder: the page of case 1, in English and in Chinese,
 *      light and dark, at 1440, 990, 660 and 390 pixels wide.
 *
 * COPIED FROM tests/the-window-starts-the-bundled-office.test.ts: `step`, `groups`, `electrons`, `offices`,
 * `recordTheHolder`, `membersOf`, `aFreePort`, `waitFor`, `theBundle`, `aHomeOfItsOwn`, `theDatabaseIn`, the
 * clean-up after all the cases and the skip. `aPicture` is copied from tests/the-window-finds-its-office.test.ts, and
 * `closeTheWindow` from tests/the-window-brings-its-server-back.test.ts. Every bundle, home and port here is this
 * file's own, never the live office. A window test: it runs only on the window list (`node tools/run-named-tests.mjs
 * --list window`), under a virtual display, with --no-sandbox, so every check page ends with the sandbox warning.
 * The cases share one bundle, which the first of them to run makes, and run one after the other. Each has its own
 * home, port and service. The module and its words are new, so every case imports them when it runs.
 *
 * MUTATIONS, proved after a control run on the commit whose message is "the window says when its service is older:
 * the code":
 *   - `never-older`, the window never asks how the service's version compares: cases 1, 2 and 3 red;
 *   - `restart-press-not-wired`, the page's Restart the service press does nothing: case 2 red.
 */

import { type ChildProcess, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { ElectronApplication } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'

import { commandLineOf, theProcessAt } from '../src/config/session-process.mjs'
import { askTheHolder, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { theSandboxWarning, whatTheWindowSays } from '../src/config/the-self-check.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { WORLD_HEADER, parseWorldHeader } from '../src/config/world-header.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'
import { electronsBinary, stillRunning, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PICTURES = process.env['MOLE_OFFICE_WINDOW_PICTURES']
const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`the-window-says-its-service-is-older: skipped. ${WHY_NOT}`)

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))
const began = Date.now()
/** One line per step, with the seconds since the file began, so a stop says where it stopped. */
const step = (what: string): void => console.log(`the-window-says-its-service-is-older: ${String(Math.round((Date.now() - began) / 1000))}s ${what}`)
const groups = new Set<number>()
const electrons = new Set<number>()
let dir = ''
/** The version the bundle was made with, read from its stamp once it is made. */
let bundledVersion = ''
/**
 * Each office a case starts: its database, and the socket its terminal holder listens on in that case's own home. Each
 * is known before its service starts, so the clean-up can read every lock and ask every holder whatever failed.
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

/** One line the window shows: `AWindowLine` in src/config/the-self-check.mjs. */
type AWindowLine = { say: string } | { heading: string } | { label: string; value: string; path?: true } | { todo: string }
type WindowState = {
  check: { answer: string | null; lines: AWindowLine[]; offers: string[]; busy: boolean }
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

/** The window has an answer, and is not busy with it. */
const answered = (state: WindowState): boolean => state.check.answer !== null && state.check.answer !== 'not-answering' && !state.check.busy

/**
 * THE BUNDLE EVERY CASE RUNS, made once, in this file's own folder, with the Node an installation carries.
 * SHORT NAMES, because the holder's socket is in the per-user data folder under a case's home, and a Unix
 * socket's path may be at most 107 bytes.
 */
function theBundle(): string {
  if (dir !== '') return join(dir, 'bundle')
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}so-`)
  const bundle = join(dir, 'bundle')
  const made = spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', bundle], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })
  expect(made.status, `${made.stdout}\n${made.stderr}`).toBe(0)
  // THE NODE AN INSTALLATION CARRIES: a copy of this test's own, so it is a file of the bundle's.
  const shipped = join(bundle, 'runtime', 'bin', 'node')
  mkdirSync(join(bundle, 'runtime', 'bin'), { recursive: true })
  copyFileSync(process.execPath, shipped)
  chmodSync(shipped, 0o755)
  const version = (JSON.parse(readFileSync(join(bundle, 'build-stamp.json'), 'utf8')) as { version?: unknown }).version
  if (typeof version !== 'string') throw new Error(`The bundle's build stamp names no version: ${JSON.stringify(version)}`)
  bundledVersion = version
  step(`bundled, as version ${version}`)
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

/** The same version with its patch number one higher, and anything after the patch number kept. */
function aNewerVersion(version: string): string {
  const read = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(version)
  if (read === null) throw new Error(`${version} is not a version this test can make a newer one of.`)
  return `${read[1] ?? ''}.${read[2] ?? ''}.${String(Number(read[3]) + 1)}${read[4] ?? ''}`
}

/** Write this version into the bundle's build stamp, and change nothing else in it. */
function theStampSays(bundle: string, version: string): void {
  const file = join(bundle, 'build-stamp.json')
  const stamp = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  // The stamp is written as src/config/build-stamp.mjs writes it, so only the version's line differs.
  writeFileSync(file, `${JSON.stringify({ ...stamp, version }, null, 2)}\n`)
}

/** An older service, running, and the bundle replaced under it by a newer version. */
type AnOlderService = {
  bundle: string
  env: Record<string, string>
  database: string
  address: string
  /** The version the service runs, and the newer one the bundle now says. */
  older: string
  newer: string
  /** The lock the older service took. */
  lock: { token: string; pid: number; pgid: number }
}

/** START THE SERVICE AT THE BUNDLED VERSION, THEN MAKE THE BUNDLE NEWER under it. */
async function anOlderService(name: string): Promise<AnOlderService> {
  const bundle = theBundle()
  const { home, port, env } = await aHomeOfItsOwn(name)
  const database = theDatabaseIn(home)
  const office = { database, holderSocket: theTerminalHolderSocket(database, env) }
  offices.push(office)
  // A case before this one may have left the stamp newer.
  theStampSays(bundle, bundledVersion)
  const started = spawnSync(join(bundle, 'runtime', 'bin', 'node'), [join(bundle, 'mole-office.mjs'), 'start'], { env, encoding: 'utf8', timeout: 120_000 })
  const lock = readTheServiceLock(`${database}.service.json`)
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  await recordTheHolder(office)
  expect(started.status, `${started.stdout}\n${started.stderr}`).toBe(0)
  if (lock.state !== 'read') throw new Error(`The service started, but its lock could not be read: ${JSON.stringify(lock)}`)
  const newer = aNewerVersion(bundledVersion)
  theStampSays(bundle, newer)
  step(`${name}: a service of version ${bundledVersion} runs, and the bundle now says ${newer}`)
  return { bundle, env, database, address: `http://127.0.0.1:${String(port)}`, older: bundledVersion, newer, lock: lock.lock }
}

/** The service's lock now, recording its group to stop. */
function theLockOf(older: AnOlderService) {
  const lock = readTheServiceLock(`${older.database}.service.json`)
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  return lock.state === 'read' ? lock.lock : null
}

/** The answer the self-check gives for the service, as healthy: its world is read from its own health check. */
async function theHealthyAnswer(older: AnOlderService) {
  const health = await fetch(`${older.address}/api/health`)
  const world = parseWorldHeader(health.headers.get(WORLD_HEADER))
  if (!world.ok) throw new Error(`The service's health check carries no world this can read: ${world.why}`)
  return { answer: 'healthy' as const, address: older.address, world: world.world, holder: null }
}

/** The version the service's health check says now. */
const theVersionTheServiceSays = async (older: AnOlderService): Promise<unknown> => ((await (await fetch(`${older.address}/api/health`)).json()) as { version?: unknown }).version

/**
 * THE PROCESS OF EACH WINDOW, and what it printed, kept at launch: Playwright's app.process() gives undefined once
 * Electron has exited.
 */
const launched = new WeakMap<ElectronApplication, { child: ChildProcess; printed: () => string }>()

/**
 * WHAT THE WINDOW HAS PRINTED, once it says this, or after 15 seconds. The test hears the window's stderr only from
 * the moment `launch` returns. Electron holds its start until Playwright connects, and by then an older service that
 * already runs has been found and its line printed. So a test reads the line the window prints when it checks again.
 */
async function printedOnceItSays(app: ElectronApplication, said: string): Promise<string> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const printed = launched.get(app)?.printed() ?? ''
    if (printed.includes(said) || Date.now() >= deadline) return printed
    await sleep(200)
  }
}

/** Open the window the bundle carries. */
async function aWindow(older: AnOlderService, lang?: string): Promise<ElectronApplication> {
  const binary = electronsBinary()
  if ('missing' in binary) throw new Error(binary.missing)
  const { _electron } = await import('playwright')
  const app = await _electron.launch({
    executablePath: binary.path,
    args: ['--no-sandbox', ...(lang === undefined ? [] : [`--lang=${lang}`]), join(older.bundle, 'window.mjs')],
    env: older.env,
    timeout: 60_000,
  })
  const child = app.process()
  if (child.pid !== undefined) electrons.add(child.pid)
  let printed = ''
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  launched.set(app, { child, printed: () => printed })
  return app
}

/**
 * Close a window, as a case's last step even when it failed. A close that has not ended in 30 seconds ends the
 * window instead, so a failure in the case is reported in its own words, and not as its time running out.
 */
async function closeTheWindow(app: ElectronApplication): Promise<void> {
  const child = launched.get(app)?.child
  if (!stillRunning(child)) return
  const ended = await Promise.race([app.close().then(() => true, () => true), sleep(30_000).then(() => false)])
  if (!ended && stillRunning(child)) child?.kill('SIGKILL')
}

/** Press the button on the window's check page that says this. */
async function pressOnThePage(app: ElectronApplication, label: string): Promise<void> {
  const page = await app.firstWindow()
  await page.locator('#offers button', { hasText: label }).click({ timeout: 30_000 })
}

/** The four widths chapter 6 asks every screen to be looked at in. */
const PICTURE_WIDTHS = [1440, 990, 660, 390] as const

/**
 * A PICTURE AT EACH OF THE FOUR WIDTHS. A page that lasts only a while names what it must still say in `still`: the
 * window's state is read after each picture, and a picture taken after the page had moved on is thrown away with an
 * error instead of being kept under that page's name.
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

afterAll(async () => {
  // A CASE THAT FAILED HALF WAY may have a service this file never recorded. Each lock is read here, first, to
  // record its group.
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
    console.log(`the-window-says-its-service-is-older: group ${String(group)} holds ${members.length === 0 ? 'nothing' : members.map((one) => `${String(one.pid)} ${one.command}`).join('; ')}`)
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

describe.skipIf(WHY_NOT !== null)('a window whose service is older than itself', () => {
  it('says the service is older, with both versions, and offers Restart the service and Open it anyway', async () => {
    const older = await anOlderService('o1')
    const app = await aWindow(older)
    try {
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const words = WINDOW_WORDS.en
      const shown = await waitFor(app, answered, 'an answer')
      step(`o1: the window answered ${String(shown.check.answer)}`)
      expect(shown.check.lines).toEqual([
        ...whatTheWindowSays(await theHealthyAnswer(older), 'en'),
        { say: words.anOlderService(older.older, older.newer) },
        ...theSandboxWarning('en'),
      ])
      expect(shown.check.offers).toEqual(['restartTheService', 'openAnyway'])
      expect(shown.check.busy).toBe(false)
      expect(shown.check.answer).toBe('healthy')
      expect(shown.officeAddress).toBe(older.address)
      expect(shown.showing?.url.startsWith('file:')).toBe(true)
      // The page's own presses, with their own labels: Restart the service is the tray's.
      const page = await app.firstWindow()
      await page.locator('#offers button').first().waitFor({ timeout: 30_000 })
      expect(await page.locator('#offers button').allInnerTexts()).toEqual([words.trayRestart, words.openAnyway])
      // The window's log says it, in English, each time it finds the older service. The page asks again through its
      // own bridge, so the line is printed after the test listens.
      await page.evaluate(() => (window as unknown as { theWindowsCheck: { checkAgain(): Promise<unknown> } }).theWindowsCheck.checkAgain())
      expect(await printedOnceItSays(app, words.anOlderService(older.older, older.newer))).toContain(words.anOlderService(older.older, older.newer))
      const again = await waitFor(app, answered, 'the window to answer again')
      expect(again.check.offers).toEqual(['restartTheService', 'openAnyway'])
      // The window started nothing: the older service still holds its lock.
      expect(theLockOf(older)?.token).toBe(older.lock.token)
    } finally {
      await closeTheWindow(app)
    }
  }, 420_000)

  it('Restart the service starts this version, and the window opens it', async () => {
    const older = await anOlderService('o2')
    const app = await aWindow(older)
    try {
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const words = WINDOW_WORDS.en
      const shown = await waitFor(app, answered, 'an answer')
      expect(shown.check.offers, JSON.stringify(shown.check.lines)).toEqual(['restartTheService', 'openAnyway'])
      await pressOnThePage(app, words.trayRestart)
      step('o2: Restart the service was pressed')

      // THE SERVICE THAT ANSWERS NOW IS THIS VERSION: the window says what it found, and waits for the Open press.
      const back = await waitFor(app, (state) => answered(state) && state.check.offers.includes('openTheOffice'), 'healthy again, waiting for the Open press')
      const lock = theLockOf(older)
      await recordTheHolder({ database: older.database, holderSocket: theTerminalHolderSocket(older.database, older.env) })
      expect(back.check.lines).toEqual([...whatTheWindowSays(await theHealthyAnswer(older), 'en'), ...theSandboxWarning('en')])
      expect(back.check.offers).toEqual(['openTheOffice'])
      expect(lock, 'no service holds the lock after the restart').not.toBeNull()
      expect(lock?.token).not.toBe(older.lock.token)
      expect(theProcessAt(lock?.pid ?? -1).here).toBe(true)
      expect(theProcessAt(older.lock.pid).here).toBe(false)
      expect(await theVersionTheServiceSays(older)).toBe(older.newer)
      step('o2: the restarted service runs the newer version')

      await pressOnThePage(app, words.openTheOffice)
      await waitFor(app, (state) => state.showing?.url.startsWith(older.address) === true && !state.showing.loading, 'the office open')
      step('o2: the window opened the office')
    } finally {
      await closeTheWindow(app)
    }
  }, 420_000)

  it('Open it anyway opens the older service and leaves it running', async () => {
    const older = await anOlderService('o3')
    const app = await aWindow(older)
    try {
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const words = WINDOW_WORDS.en
      const shown = await waitFor(app, answered, 'an answer')
      expect(shown.check.offers, JSON.stringify(shown.check.lines)).toEqual(['restartTheService', 'openAnyway'])
      await pressOnThePage(app, words.openAnyway)
      await waitFor(app, (state) => state.showing?.url.startsWith(older.address) === true && !state.showing.loading, 'the office open')
      step('o3: the window opened the older service')
      expect(theLockOf(older)?.token).toBe(older.lock.token)
      expect(theProcessAt(older.lock.pid).here).toBe(true)
      expect(await theVersionTheServiceSays(older)).toBe(older.older)
    } finally {
      await closeTheWindow(app)
    }
  }, 420_000)

  it.runIf(PICTURES !== undefined && PICTURES !== '')(
    'keeps pictures of the page that says the service is older, in English and in Chinese',
    async () => {
      const older = await anOlderService('p')
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      for (const [language, lang] of [['en', undefined], ['zh', 'zh-CN']] as const) {
        const app = await aWindow(older, lang)
        try {
          const lines = [
            ...whatTheWindowSays(await theHealthyAnswer(older), language),
            { say: WINDOW_WORDS[language].anOlderService(older.older, older.newer) },
            ...theSandboxWarning(language),
          ]
          const shown = await waitFor(app, answered, 'an answer')
          expect(shown.check.lines).toEqual(lines)
          const still = (state: WindowState): boolean => JSON.stringify(state.check.lines) === JSON.stringify(lines) && !state.check.busy
          await aPicture(app, `an-older-service-${language}`, 'light', still)
          await aPicture(app, `an-older-service-${language}`, 'dark', still)
          step(`p: the pictures in ${language} were taken`)
        } finally {
          await closeTheWindow(app)
        }
      }
    },
    420_000,
  )
})
