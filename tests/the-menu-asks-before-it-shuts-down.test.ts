// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MENU'S SHUT DOWN ASKS FIRST (wave 13t, round W32, item 2; src/desktop/main.mjs and
 * src/desktop/question.html).
 *
 * The tray or menu-bar item "Shut down Mole Office" used to stop the office at one press. Now it
 * shows the window's own question over whatever page the window shows. Three cases, each with its
 * own office, folder, database and port, never the live office's port:
 *
 *   1. Pressing the item shows the question and stops nothing. A second press shows the same
 *      question once. The office still answers and the window still shows its page.
 *   2. Cancel removes the question and stops nothing. The office still answers and the window
 *      shows the same page it showed before.
 *   3. Yes removes the question and goes on as the press did: on the check page it runs the stop
 *      command, and the window and the office end.
 *
 * MUTATIONS, each red here and green again when put back (src/desktop/main.mjs):
 *   - the question is not shown: case 1 red;
 *   - Cancel is answered as Yes and runs the stop command: case 2 red;
 *   - Yes removes the question and runs nothing: case 3 red.
 *
 * Pictures. When MOLE_OFFICE_QUESTION_PICTURES names a folder, the question is kept there over an
 * office page at 1440, 990, 660 and 390 pixels wide, in the light and the dark look: eight files,
 * each named by width and look. The same eight are kept with no question shown, as a control, so a
 * bar at the office page's edge can be told from one the question adds.
 *
 * With no Electron binary on this machine, the cases skip and say why, as every other window test
 * does: a machine without the binary says nothing about the menu.
 *
 * Every office here starts with the message worker off, so no case starts an agent's run or writes a
 * rules file into this worktree.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { ElectronApplication } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_BUILT_PAGE, missingWebBuild } from '../src/config/the-built-page.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment } from './helpers.ts'
import { electronsBinary, stillRunning } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_COMMAND = join(REPO, 'src', 'config', 'the-service-command.mjs')
const THE_WINDOW = join(REPO, 'src', 'desktop', 'main.mjs')
const PICTURES = process.env['MOLE_OFFICE_QUESTION_PICTURES']

/** Why no window opens here, or null. This file starts its own display, so it needs only Electron's binary. */
const THE_BINARY = electronsBinary()
const WHY_NOT = 'missing' in THE_BINARY ? THE_BINARY.missing : null
if (WHY_NOT !== null) console.log(`the-menu-asks-before-it-shuts-down: skipped. ${WHY_NOT}`)

/**
 * A DISPLAY OF THIS TEST'S OWN, so the file runs by its name alone through the named-test tool and
 * never opens a window on a person's screen. The window tests' list starts one the same way; this
 * file starts its own because the tool's list cannot be narrowed to one named file. The screen is
 * large enough for the widest picture, 1440 pixels.
 */
let display: ChildProcess | null = null
let theDisplay = ''

async function aVirtualDisplay(): Promise<{ server: ChildProcess; display: string }> {
  const server = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '1600x1200x24', '-nolisten', 'tcp'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
  })
  let said = ''
  const named = await new Promise<string>((done, fail) => {
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
  return { server, display: named }
}

/** Every office's process group this file found in a service lock. */
const groups = new Set<number>()
/** Every Electron this file started, by the pid that leads its own group. */
const electrons = new Set<number>()
const folders = new Set<string>()
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

async function aWorld(name: string): Promise<World> {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const database = join(dir, 'office.db')
  const port = await aFreePort()
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(dir, port, await aFreePort(), { database }),
    HOME: join(dir, 'home'),
    DISPLAY: theDisplay,
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    MOLE_OFFICE_WINDOW_DEBUGGING: 'on',
  }
  delete env['WAYLAND_DISPLAY']
  mkdirSync(env['HOME'] as string)
  const world = { dir, database, port, env }
  worlds.add(world)
  return world
}

function theLock(world: World) {
  const lock = readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: world.database }))
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  return lock.state === 'read' ? lock.lock : null
}

/**
 * Runs the service command in this worktree. world.env already turns the message worker off; it is said
 * again here, last, so that tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts can read that the
 * office it starts starts no agent run and writes no rules file here.
 */
function theCommand(world: World, what: string): Promise<{ code: number | null; out: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [THE_COMMAND, what], {
      cwd: REPO,
      env: { ...world.env, MOLE_OFFICE_MESSAGE_WORKER: 'off' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => {
      theLock(world)
      done({ code, out })
    })
  })
}

async function theOfficeAnswers(world: World): Promise<boolean> {
  try {
    const answer = await fetch(`http://127.0.0.1:${String(world.port)}/api/health`)
    return answer.ok
  } catch {
    return false
  }
}

interface WindowState {
  check: { answer: string | null; busy: boolean }
  officeAddress: string | null
  language: string
  visible: boolean
  showing: { url: string; loading: boolean } | null
  questionShown: boolean
  trayShutDownWent: string | null
}

interface QuestionWords {
  question: string
  says: string
  yes: string
  cancel: string
}

interface ShutDownQuestion {
  shown: boolean
  views: number
  language: string
  words: QuestionWords
}

type Hook = {
  state(): WindowState
  press(id: 'open' | 'restart' | 'shutDown'): Promise<string | null>
  openTheOffice(): Promise<void>
  look(theme: 'light' | 'dark'): void
  picture(): Promise<string | null>
  shutDownQuestion(): ShutDownQuestion | null
  answerTheShutDownQuestion(answer: 'yes' | 'cancel'): Promise<void>
}

const launched = new WeakMap<ElectronApplication, ChildProcess>()

async function aWindow(world: World): Promise<ElectronApplication> {
  const binary = electronsBinary()
  if ('missing' in binary) throw new Error(binary.missing)
  const { _electron } = await import('playwright')
  const app = await _electron.launch({
    executablePath: binary.path,
    args: ['--no-sandbox', THE_WINDOW],
    env: world.env as Record<string, string>,
    timeout: 60_000,
  })
  const child = app.process()
  launched.set(app, child)
  if (child.pid !== undefined) electrons.add(child.pid)
  return app
}

const theState = (app: ElectronApplication): Promise<WindowState> =>
  app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.state())

async function waitFor(app: ElectronApplication, ready: (state: WindowState) => boolean, what: string, everyMs = 100): Promise<WindowState> {
  const deadline = Date.now() + 120_000
  let last: WindowState | null = null
  while (Date.now() < deadline) {
    last = await theState(app)
    if (ready(last)) return last
    await sleep(everyMs)
  }
  throw new Error(`The window did not reach "${what}" in 120 seconds. It last said: ${JSON.stringify(last)}`)
}

const pressTheTray = (app: ElectronApplication, id: 'shutDown'): Promise<string | null> =>
  app.evaluate(async (_electron, which) => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.press(which), id)

const theQuestion = (app: ElectronApplication): Promise<ShutDownQuestion | null> =>
  app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.shutDownQuestion())

const answerTheQuestion = (app: ElectronApplication, answer: 'yes' | 'cancel'): Promise<void> =>
  app.evaluate(async (_electron, said) => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.answerTheShutDownQuestion(said), answer)

const pressOpen = (app: ElectronApplication): Promise<void> =>
  app.evaluate(async () => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.openTheOffice())

/** Open a world's office, start its window, and open the office page in it. */
async function anOpenOffice(name: string): Promise<{ world: World; app: ElectronApplication }> {
  const missing = missingWebBuild(THE_BUILT_PAGE)
  if (missing !== null) throw new Error(`The window opens the office in production, which serves the built page. ${missing}`)
  const world = await aWorld(name)
  const started = await theCommand(world, 'start')
  expect(started.code, started.out).toBe(0)
  const app = await aWindow(world)
  await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
  await pressOpen(app)
  const page = await app.firstWindow()
  await page.waitForURL(`http://127.0.0.1:${String(world.port)}/**`, { timeout: 60_000 })
  await page.locator('.sbp-shut-down').waitFor({ timeout: 60_000 })
  // The window pairs itself before it opens a new office, so the page stays at the address it opened.
  // Wait until the page's own read of the pairing door says so, so the page's address is the one
  // compared after a cancel.
  await page.waitForFunction(async () => ((await (await fetch('/api/office/pairing')).json()) as { paired?: unknown }).paired === true, undefined, { polling: 500, timeout: 60_000 })
  expect(await page.evaluate(() => window.location.hash)).toBe('')
  return { world, app }
}

beforeAll(async () => {
  if (WHY_NOT !== null) return
  const own = await aVirtualDisplay()
  display = own.server
  theDisplay = `:${own.display}`
})

afterAll(async () => {
  for (const world of worlds) theLock(world)
  for (const pid of electrons) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  await sleep(2_000)
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended between the look and the signal.
    }
  }
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
  if (display?.pid !== undefined) {
    try {
      process.kill(-display.pid, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
}, 60_000)

describe('the menu asks before it shuts the office down', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('1. pressing the menu\'s Shut down shows the question once, and stops nothing', async () => {
    const { world, app } = await anOpenOffice('menu-asks')
    const before = theLock(world)
    const beforeUrl = (await theState(app)).showing?.url
    try {
      const went = await pressTheTray(app, 'shutDown')
      expect(went).toBe('to the question')
      await waitFor(app, (state) => state.questionShown, 'the question')
      const question = await theQuestion(app)
      expect(question).toEqual({
        shown: true,
        views: 1,
        language: 'en',
        words: {
          question: WINDOW_WORDS.en.trayShutDownQuestion,
          says: WINDOW_WORDS.en.trayShutDownSays,
          yes: WINDOW_WORDS.en.trayShutDownYes,
          cancel: WINDOW_WORDS.en.trayShutDownCancel,
        },
      })
      // A second press shows the same question once, and does not stack another.
      expect(await pressTheTray(app, 'shutDown')).toBe('to the question')
      expect((await theQuestion(app))?.views).toBe(1)
      // It has stopped nothing: the office answers, the service is the same one, the window lives, and
      // the page underneath is the page it was.
      await sleep(1_500)
      expect(await theOfficeAnswers(world)).toBe(true)
      expect(theLock(world)?.pid).toBe(before?.pid)
      expect(stillRunning(launched.get(app))).toBe(true)
      expect((await theState(app)).showing?.url).toBe(beforeUrl)
      await answerTheQuestion(app, 'cancel')
    } finally {
      if (stillRunning(launched.get(app))) await app.close().catch(() => {})
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  it('2. Cancel removes the question, and the office and its page stay as they were', async () => {
    const { world, app } = await anOpenOffice('menu-cancel')
    const before = theLock(world)
    const beforeUrl = (await theState(app)).showing?.url
    try {
      expect(await pressTheTray(app, 'shutDown')).toBe('to the question')
      await waitFor(app, (state) => state.questionShown, 'the question')
      expect(await theQuestion(app)).not.toBeNull()
      await answerTheQuestion(app, 'cancel')
      await waitFor(app, (state) => !state.questionShown, 'the question gone')
      expect(await theQuestion(app)).toBeNull()
      await sleep(1_500)
      expect(await theOfficeAnswers(world)).toBe(true)
      expect(theLock(world)?.pid).toBe(before?.pid)
      expect(stillRunning(launched.get(app))).toBe(true)
      expect((await theState(app)).showing?.url).toBe(beforeUrl)
      expect((await theState(app)).trayShutDownWent).toBe('cancelled')
    } finally {
      if (stillRunning(launched.get(app))) await app.close().catch(() => {})
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)

  it('3. Yes removes the question, and the press goes on as it did: the office and the window end', async () => {
    const world = await aWorld('menu-yes')
    const started = await theCommand(world, 'start')
    expect(started.code, started.out).toBe(0)
    const before = theLock(world)
    const app = await aWindow(world)
    try {
      // The window runs without its sandbox here, so a healthy office is held on the check page. Yes
      // must run the stop command, which is what the press did on that page before this round.
      await waitFor(app, (state) => state.officeAddress !== null && state.check.answer === 'healthy' && !state.check.busy, 'the office found')
      expect((await theState(app)).showing?.url).toMatch(/^file:.*check\.html$/)
      const closed = new Promise<void>((done) => launched.get(app)?.on('exit', () => done()))
      expect(await pressTheTray(app, 'shutDown')).toBe('to the question')
      await waitFor(app, (state) => state.questionShown, 'the question')
      await answerTheQuestion(app, 'yes')
      await Promise.race([closed, new Promise((_, refuse) => setTimeout(() => refuse(new Error('the window did not close after Yes')), 60_000))])
      expect(theLock(world)).toBeNull()
      expect(await theOfficeAnswers(world)).toBe(false)
      expect(before?.pid).toBeDefined()
    } finally {
      if (stillRunning(launched.get(app))) await app.close().catch(() => {})
    }
  }, 300_000)

  it.runIf(PICTURES !== undefined && PICTURES !== '')('pictures the question at four widths in both looks', async () => {
    const folder = PICTURES as string
    mkdirSync(folder, { recursive: true })
    const { world, app } = await anOpenOffice('menu-pictures')
    const page = await app.firstWindow()
    const at = async (look: 'light' | 'dark', width: number): Promise<void> => {
      // THE PAGE'S LOOK, as tests/the-window-finds-its-office.test.ts takes it: the driver's own
      // emulation, because the system's colour scheme does not reach a page it starts.
      await page.emulateMedia({ colorScheme: look })
      await app.evaluate((_electron, theme) => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.look(theme), look)
      await app.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(size, 900)
      }, width)
      await sleep(500)
    }
    const shoot = async (name: string): Promise<void> => {
      const picture = await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow: Hook }).theMoleOfficeWindow.picture())
      expect(picture, `no picture for ${name}`).not.toBeNull()
      writeFileSync(join(folder, `${name}.png`), Buffer.from(picture as string, 'base64'))
    }
    try {
      // THE SAME PICTURES WITH NO QUESTION, as a control: they show whether a bar at the office
      // page's edge is the page's own or was added by the question or the picture.
      for (const look of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390] as const) {
          await at(look, width)
          await shoot(`the-office-${String(width)}-${look}`)
        }
      }
      expect(await pressTheTray(app, 'shutDown')).toBe('to the question')
      await waitFor(app, (state) => state.questionShown, 'the question')
      for (const look of ['light', 'dark'] as const) {
        for (const width of [1440, 990, 660, 390] as const) {
          await at(look, width)
          await shoot(`the-question-${String(width)}-${look}`)
        }
      }
      expect((await theQuestion(app))?.shown).toBe(true)
      await answerTheQuestion(app, 'cancel')
    } finally {
      await page.emulateMedia({ colorScheme: 'light' }).catch(() => undefined)
      if (stillRunning(launched.get(app))) await app.close().catch(() => {})
    }
    const stopped = await theCommand(world, 'stop')
    expect(stopped.code, stopped.out).toBe(0)
  }, 300_000)
})
