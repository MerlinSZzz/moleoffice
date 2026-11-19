// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW BRINGS ITS SERVER BACK (src/desktop/main.mjs, with src/desktop/starting-the-server-again.mjs).
 *
 * `aFreePort`, `aWorld`, `theLock`, `theCommand`, `aWindow`, `waitFor`, `aPicture`, the clean-up after all the cases
 * and the skip are copied from tests/the-window-finds-its-office.test.ts. `untilTheProcessIsGone` and the preload are
 * copied from tests/the-server-writes-how-it-ended.test.ts. Every office here is this test's own: a folder, a
 * database, a home and a port it makes, never the live office's port. The window is the real one, in a real
 * Electron, under the virtual display the window list starts, with --no-sandbox. So every check page ends with the
 * sandbox warning, and a healthy office waits there for the Open press.
 *
 * Each world has a preload of this file's own, written into the world's folder, as case 3 of
 * tests/the-server-writes-how-it-ended.test.ts writes it. On SIGUSR2 it throws an uncaught error, so a server sent
 * SIGUSR2 ends with no stop asked for. Playwright removes NODE_OPTIONS from the environment it starts Electron with,
 * so the window's environment cannot carry the preload. Its PATH can: the world's folder holds a `node` of its own,
 * first on that PATH, which puts the preload in NODE_OPTIONS and runs the Node that runs this file. The window runs
 * `mole-office start` with the first `node` on its PATH, and the command hands its environment to the server it
 * starts, so every server the window starts loads the preload. Only the lock's process is ever sent SIGUSR2. The
 * module and its words are new, so every case imports them when it runs.
 *   1. A server that ended with no stop asked for is started again. The page says so first, with the wait before the
 *      first try, and is busy. Then the window finds a new server at the same address, and watches it. The window was
 *      hidden before the server ended, and none of this shows it.
 *   2. A server stopped with `mole-office stop` is not started again, and what the window shows does not change.
 *   3. A server ended by SIGKILL writes no note, so the window cannot tell how it stopped. Its page says so and offers
 *      Check again, and the window starts nothing.
 *   4. The pictures, when MOLE_OFFICE_WINDOW_PICTURES names a folder. In this case's worlds every start after the first
 *      end fails. The preload's SIGUSR2 also leaves a file in the world's folder, and a server that finds that file as
 *      it loads exits at once, before it takes its lock, so `mole-office start` fails. The pictures are of the page
 *      that says a try failed and when the next one comes, taken during that wait, and of the page that says the
 *      window has stopped trying. Each is taken in English and in Chinese, light and dark, at 1440, 990, 660 and 390
 *      pixels wide. Case 3 keeps its page's pictures too, in English.
 *   5. The tray's Restart, pressed while a try to start the server again waits, cancels that try as the press begins.
 *      The restart starts one server, and no try comes after it.
 *
 * MUTATIONS, proved after a control run on the commit whose message is "the window starts its server again: the code":
 *   - `never-again`, a server that stopped with no stop asked for watched no more and not started again: case 1 red;
 *   - `every-end-again`, a server started again after every stop: cases 2 and 3 red.
 * Proved after a control run on the commit whose message is "the window says when its service is older: the code":
 *   - `restart-keeps-the-wait`, the tray's Restart leaves the try that waits: case 5 red.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { delimiter, join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import type { ElectronApplication } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'
import { readHowTheServerEnded } from '../src/config/how-the-server-ended.mjs'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { theSandboxWarning } from '../src/config/the-self-check.mjs'
import { EXIT } from '../src/config/the-service-command.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { executableOf, theProcessAt } from '../src/config/session-process.mjs'
import { THE_SERVER_ENTRY, serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment } from './helpers.ts'
import { electronsBinary, stillRunning, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_WINDOW = join(REPO, 'src', 'desktop', 'main.mjs')
const PICTURES = process.env['MOLE_OFFICE_WINDOW_PICTURES']
const THE_PRELOAD_MESSAGE = 'the preload this test wrote ended the server on an uncaught error'
const THE_PRELOADS_REFUSAL = 'the preload this test wrote ends every server that starts after the first one ended'

const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`the-window-brings-its-server-back: skipped. ${WHY_NOT}`)

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

/**
 * THE PRELOAD OF A WORLD, written into its folder. On SIGUSR2 it throws an uncaught error. When every start after the
 * first end fails, the signal also leaves a file in the folder first. A server's main thread that finds that file as it
 * loads then says so on its standard error and exits, before it takes its lock.
 */
function aPreload(dir: string, everyStartAfterTheFirstEndFails: boolean): string {
  const preload = join(dir, 'end-on-an-uncaught-error.mjs')
  const ended = JSON.stringify(join(dir, 'a-server-has-ended'))
  const refuse = everyStartAfterTheFirstEndFails
    ? `import { existsSync, writeFileSync } from 'node:fs'\n` +
      `import { isMainThread } from 'node:worker_threads'\n` +
      `if (isMainThread && (process.argv[1] ?? '').endsWith(${JSON.stringify(`/${THE_SERVER_ENTRY}`)}) && existsSync(${ended})) {\n` +
      `  process.stderr.write(${JSON.stringify(`${THE_PRELOADS_REFUSAL}\n`)})\n` +
      `  process.exit(1)\n` +
      `}\n`
    : ''
  const mark = everyStartAfterTheFirstEndFails ? `  writeFileSync(${ended}, '')\n` : ''
  writeFileSync(preload, `${refuse}process.on('SIGUSR2', () => {\n${mark}  setImmediate(() => {\n    throw new Error(${JSON.stringify(THE_PRELOAD_MESSAGE)})\n  })\n})\n`)
  return preload
}

/**
 * A NODE OF THE WORLD'S OWN, in this folder: it runs the Node that runs this file, with the world's preload in
 * NODE_OPTIONS. Playwright removes NODE_OPTIONS from the window's environment, but not its PATH.
 */
function aNodeWithThePreload(dir: string, preload: string): void {
  writeFileSync(join(dir, 'node'), `#!/bin/sh\nexport NODE_OPTIONS='--import=${pathToFileURL(preload).href}'\nexec '${process.execPath}' "$@"\n`, {
    mode: 0o755,
  })
}

/** An office's world of this test's own, whose every server the window starts loads the world's preload. */
async function aWorld(name: string, { everyStartAfterTheFirstEndFails = false } = {}): Promise<World> {
  const missing = missingWebBuild(THE_BUILT_PAGE)
  if (missing !== null) throw new Error(`The window opens the office in production, which serves the built page. ${missing}`)
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  aNodeWithThePreload(bin, aPreload(dir, everyStartAfterTheFirstEndFails))
  const stack = devStackEnvironment(dir, port, await aFreePort(), { database })
  const env: NodeJS.ProcessEnv = {
    ...stack,
    HOME: home,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    // Playwright starts the window with --inspect and --remote-debugging-port, which the window refuses unless this says on.
    MOLE_OFFICE_WINDOW_DEBUGGING: 'on',
    // The window runs the first node on its PATH: the world's own, which loads the preload.
    PATH: `${bin}${delimiter}${stack['PATH'] ?? ''}`,
  }
  const world = { dir, database, port, env }
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
    const child = spawn(process.execPath, [THE_COMMAND, what], { cwd: REPO, env: { ...world.env, MOLE_OFFICE_MESSAGE_WORKER: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      theLock(world)
      done({ code, out })
    })
  })
}

/** Wait, bounded, until no process runs at the number. */
async function untilTheProcessIsGone(pid: number, what: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (theProcessAt(pid).here) {
    if (Date.now() > deadline) throw new Error(`Process ${String(pid)} was still running 30 seconds ${what}.`)
    await sleep(100)
  }
}

/** One line the window shows: `AWindowLine` in src/config/the-self-check.mjs. */
type AWindowLine = { say: string } | { heading: string } | { label: string; value: string; path?: true } | { todo: string }
type WindowState = {
  check: { lines: AWindowLine[]; offers: string[]; busy: boolean; answer: string | null }
  officeAddress: string | null
  language: string
  visible: boolean
  // Whether the window watches a server it would start again, how many tries it has made, and whether one waits.
  startsTheServerAgain: { watching: boolean; tries: number; waiting: boolean }
}

/**
 * THE PROCESS OF EACH WINDOW, kept at launch: Playwright's app.process() gives undefined once Electron
 * has exited, so a clean-up after a shutdown asks this instead (`stillRunning` in the-window-display.ts).
 */
const launched = new WeakMap<ElectronApplication, ChildProcess>()

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
  const pid = child.pid
  if (pid !== undefined) electrons.set(pid, binary.path)
  return app
}

/**
 * Close a window, as a case's last step even when it failed. A close that has not ended in 30 seconds ends the
 * window's group instead, so a failure in the case is reported in its own words, and not as its time running out.
 */
async function closeTheWindow(app: ElectronApplication): Promise<void> {
  const child = launched.get(app)
  if (!stillRunning(child)) return
  const ended = await Promise.race([app.close().then(() => true, () => true), sleep(30_000).then(() => false)])
  if (!ended && child?.pid !== undefined) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
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

/** The window's state now. */
const theStateOf = (app: ElectronApplication) => waitFor(app, () => true, 'a state')

/** Healthy at the world's address, and not busy: under the sandbox warning, waiting for the Open press. */
const healthyAt = (world: World) => (state: WindowState) =>
  state.officeAddress === `http://127.0.0.1:${String(world.port)}` && state.check.answer === 'healthy' && !state.check.busy

/** Whether the page says this sentence on a line of its own. */
const saying = (sentence: string) => (state: WindowState) => state.check.lines.some((line) => 'say' in line && line.say === sentence)

/** The wait before a try, counted from the first, as the module says it. */
function theWaitBefore(waits: readonly number[], index: number): number {
  const wait = waits[index]
  if (wait === undefined) throw new Error(`The module names no wait before try ${String(index + 1)}.`)
  return wait
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

describe('the window brings its server back', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('starts its server again after it stopped without being asked to, says so first, and opens it again', async () => {
    const world = await aWorld('brings-back')
    const app = await aWindow(world)
    try {
      await waitFor(app, healthyAt(world), 'healthy')
      await waitFor(app, (state) => state.startsTheServerAgain.watching, 'watching its server')
      const { START_AGAIN_AFTER_MS } = await import('../src/desktop/starting-the-server-again.mjs')
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const first = theLock(world)
      if (first === null) throw new Error('The window started no service.')
      // The close button hides the window. Nothing below may show it again.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
      await waitFor(app, (state) => !state.visible, 'hidden')

      process.kill(first.pid, 'SIGUSR2')
      await untilTheProcessIsGone(first.pid, 'after SIGUSR2')
      expect(readHowTheServerEnded(serviceLockPathFrom({ MOLE_OFFICE_DB: world.database }))).toMatchObject({
        state: 'read',
        note: { token: first.token, pid: first.pid, stopAskedFor: null },
      })
      const said = await waitFor(app, saying(WINDOW_WORDS.en.stoppedUnasked), 'saying its server stopped without being asked to', 100)
      expect(said.check.lines).toEqual([
        { say: WINDOW_WORDS.en.stoppedUnasked },
        { say: WINDOW_WORDS.en.startsAgainIn(theWaitBefore(START_AGAIN_AFTER_MS, 0) / 1000, 1, START_AGAIN_AFTER_MS.length) },
        ...theSandboxWarning('en'),
      ])
      expect(said.check.busy).toBe(true)
      expect(said.check.offers).toEqual([])
      expect(said.visible).toBe(false)

      const back = await waitFor(app, (state) => healthyAt(world)(state) && state.startsTheServerAgain.watching, 'healthy again, and watching')
      const second = theLock(world)
      expect(second, 'no server took the lock again').not.toBeNull()
      expect(second?.token).not.toBe(first.token)
      expect(theProcessAt(second?.pid ?? -1).here).toBe(true)
      expect(back.startsTheServerAgain.tries).toBe(1)
      expect(back.visible).toBe(false)
    } finally {
      await closeTheWindow(app)
    }
  }, 300_000)

  it('does not start its server again after a stop that was asked for, and changes nothing it shows', async () => {
    const world = await aWorld('stopped-on-purpose')
    const app = await aWindow(world)
    try {
      await waitFor(app, healthyAt(world), 'healthy')
      const shown = (await waitFor(app, (state) => state.startsTheServerAgain.watching, 'watching its server')).check
      const { START_AGAIN_AFTER_MS, WATCH_EVERY_MS } = await import('../src/desktop/starting-the-server-again.mjs')
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      expect(theLock(world), 'the window started no service').not.toBeNull()

      const stopped = await theCommand(world, 'stop')
      expect(stopped.code, stopped.out).toBe(0)
      const states: WindowState[] = []
      await waitFor(
        app,
        (state) => {
          states.push(state)
          return !state.startsTheServerAgain.watching
        },
        'watching nothing after the stop',
        100,
      )
      const until = Date.now() + theWaitBefore(START_AGAIN_AFTER_MS, 0) + 2 * WATCH_EVERY_MS
      while (Date.now() < until) {
        states.push(await theStateOf(app))
        await sleep(250)
      }
      expect(theLock(world)).toBeNull()
      expect(states.at(-1)?.startsTheServerAgain).toEqual({ watching: false, tries: 0, waiting: false })
      const sentences = states.flatMap((state) => state.check.lines).flatMap((line) => ('say' in line ? [line.say] : []))
      for (const never of [WINDOW_WORDS.en.stoppedUnasked, WINDOW_WORDS.en.stoppedWithoutSayingHow]) {
        expect(typeof never).toBe('string')
        expect(sentences).not.toContain(never)
      }
      for (const state of states) expect(state.check).toEqual(shown)
    } finally {
      await closeTheWindow(app)
    }
  }, 300_000)

  it('says it cannot tell how its server stopped after a SIGKILL, and does not start it again', async () => {
    const world = await aWorld('killed')
    const app = await aWindow(world)
    try {
      await waitFor(app, healthyAt(world), 'healthy')
      await waitFor(app, (state) => state.startsTheServerAgain.watching, 'watching its server')
      const { START_AGAIN_AFTER_MS, WATCH_EVERY_MS } = await import('../src/desktop/starting-the-server-again.mjs')
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const first = theLock(world)
      if (first === null) throw new Error('The window started no service.')

      process.kill(first.pid, 'SIGKILL')
      await untilTheProcessIsGone(first.pid, 'after SIGKILL')
      const said = await waitFor(app, saying(WINDOW_WORDS.en.stoppedWithoutSayingHow), 'saying it cannot tell how its server stopped', 100)
      expect(said.check).toEqual({
        lines: [{ say: WINDOW_WORDS.en.stoppedWithoutSayingHow }, ...theSandboxWarning('en')],
        offers: ['checkAgain'],
        busy: false,
        answer: 'not-answering',
      })

      await sleep(theWaitBefore(START_AGAIN_AFTER_MS, 0) + 2 * WATCH_EVERY_MS)
      const after = await theStateOf(app)
      // The lock a SIGKILL leaves is still the old server's, and names a process that has gone.
      const lock = theLock(world)
      expect(lock?.token).toBe(first.token)
      expect(theProcessAt(first.pid).here).toBe(false)
      expect(after.startsTheServerAgain).toEqual({ watching: false, tries: 0, waiting: false })
      expect(after.check).toEqual(said.check)
      await aPicture(app, 'stopped-without-saying-how-en', 'light')
      await aPicture(app, 'stopped-without-saying-how-en', 'dark')
    } finally {
      await closeTheWindow(app)
    }
  }, 300_000)

  it.runIf(PICTURES !== undefined && PICTURES !== '')(
    'keeps pictures of the page between two tries and of the page after the last, in English and in Chinese',
    async () => {
      const { START_AGAIN_AFTER_MS, TRIES_COUNT_WITHIN_MS } = await import('../src/desktop/starting-the-server-again.mjs')
      const { WINDOW_WORDS } = await import('../src/config/the-self-check-words.mjs')
      const attempts = START_AGAIN_AFTER_MS.length
      for (const [language, lang] of [['en', undefined], ['zh', 'zh-CN']] as const) {
        const words = WINDOW_WORDS[language]
        const world = await aWorld(`brings-back-pictures-${language}`, { everyStartAfterTheFirstEndFails: true })
        const app = await aWindow(world, lang)
        try {
          await waitFor(app, healthyAt(world), 'healthy')
          await waitFor(app, (state) => state.startsTheServerAgain.watching, 'watching its server')
          const first = theLock(world)
          if (first === null) throw new Error('The window started no service.')
          process.kill(first.pid, 'SIGUSR2')

          // The first try has failed, and the second waits.
          const second = saying(words.startsAgainIn(theWaitBefore(START_AGAIN_AFTER_MS, 1) / 1000, 2, attempts))
          const between = await waitFor(app, second, 'waiting for the second try', 100)
          const failed = between.check.lines[1]
          const failedSays = failed !== undefined && 'say' in failed ? failed.say : ''
          expect(between.check.lines[0]).toEqual({ say: words.stoppedUnasked })
          // The start's own words follow its exit code, and the server's log in them says why it ended.
          expect(failedSays.startsWith(words.couldNotStart(EXIT.FAILED, '')), failedSays).toBe(true)
          expect(failedSays).toContain(THE_PRELOADS_REFUSAL)
          expect(between.check.lines.slice(2)).toEqual([{ say: words.startsAgainIn(theWaitBefore(START_AGAIN_AFTER_MS, 1) / 1000, 2, attempts) }, ...theSandboxWarning(language)])
          expect(between.check.busy).toBe(true)
          await aPicture(app, `a-try-failed-${language}`, 'light', second)
          await aPicture(app, `a-try-failed-${language}`, 'dark', second)

          // Every try has failed, and the window tries no more by itself.
          const last = await waitFor(app, saying(words.stoppedTrying(attempts, TRIES_COUNT_WITHIN_MS / 60_000)), 'stopped trying')
          expect(last.check.lines[0]).toEqual({ say: words.stoppedUnasked })
          expect(last.check.lines.slice(2)).toEqual([{ say: words.stoppedTrying(attempts, TRIES_COUNT_WITHIN_MS / 60_000) }, ...theSandboxWarning(language)])
          expect(last.check.offers).toEqual(['checkAgain'])
          expect(last.check.busy).toBe(false)
          expect(last.startsTheServerAgain).toEqual({ watching: false, tries: attempts, waiting: false })
          await aPicture(app, `stopped-trying-${language}`, 'light')
          await aPicture(app, `stopped-trying-${language}`, 'dark')
        } finally {
          await closeTheWindow(app)
        }
      }
    },
    600_000,
  )

  it('a Restart pressed while a try waits cancels the try and restarts once', async () => {
    const world = await aWorld('restart-waits')
    const app = await aWindow(world)
    try {
      await waitFor(app, healthyAt(world), 'healthy')
      await waitFor(app, (state) => state.startsTheServerAgain.watching, 'watching its server')
      const { START_AGAIN_AFTER_MS, WATCH_EVERY_MS } = await import('../src/desktop/starting-the-server-again.mjs')
      const first = theLock(world)
      if (first === null) throw new Error('The window started no service.')

      process.kill(first.pid, 'SIGUSR2')
      await untilTheProcessIsGone(first.pid, 'after SIGUSR2')
      await waitFor(app, (state) => state.startsTheServerAgain.waiting, 'a try waiting', 100)
      // The press is not waited for here, so the state is read as the press begins, before its command has ended.
      const pressed = (await app.evaluate(() => {
        const window = (globalThis as unknown as { theMoleOfficeWindow: { press(id: string): Promise<unknown>; state(): unknown } }).theMoleOfficeWindow
        void window.press('restart')
        return window.state()
      })) as WindowState
      expect(pressed.startsTheServerAgain).toMatchObject({ waiting: false, tries: 0 })

      const back = await waitFor(app, (state) => healthyAt(world)(state) && theLock(world)?.token !== first.token, 'healthy again, under a new lock')
      const restarted = theLock(world)
      expect(restarted, 'no server took the lock after the restart').not.toBeNull()
      expect(theProcessAt(restarted?.pid ?? -1).here).toBe(true)
      expect(back.startsTheServerAgain).toMatchObject({ waiting: false, tries: 0 })

      // NO TRY COMES AFTER THE RESTART: once the first try's wait has passed, the lock still names the restart's server.
      await sleep(theWaitBefore(START_AGAIN_AFTER_MS, 0) + 2 * WATCH_EVERY_MS)
      const after = await theStateOf(app)
      expect(theLock(world)?.token).toBe(restarted?.token)
      expect(after.startsTheServerAgain).toEqual({ watching: true, tries: 0, waiting: false })
    } finally {
      await closeTheWindow(app)
    }
  }, 300_000)
})
