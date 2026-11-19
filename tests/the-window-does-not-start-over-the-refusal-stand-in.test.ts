// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOW DOES NOT START THE OFFICE OVER A STAND-IN THAT CARRIES A REFUSAL (the supervisor's addition to round 12).
 *
 * When serve-dev has refused a start and keeps the port with its stand-in, `mole-office start` cannot
 * help: the stand-in still holds the port, and the start's output would replace the sentence the
 * person is meant to read. So the window asks the self-check first, finds the refusal the stand-in
 * carries (tools/serve-dev-stand-in.mjs, `--refusal`), and shows the owner sentence with one press,
 * Check again. It runs no start at all, so no service lock is written.
 *
 * The office here is this test's own: a folder, a database, a home and a port it makes, never the
 * live office's port.
 * The stand-in is the real tools/serve-dev-stand-in.mjs, on a port this test holds. The window is the
 * real one, `src/desktop/main.mjs`, in a real Electron, under the virtual display the window list
 * starts (tests/the-window-display.ts), with --no-sandbox as every window test runs.
 *
 * MUTATION, in src/desktop/main.mjs: findTheOffice starts the office when nothing answers even though
 * the answer carries a refusal: the window then shows what the start said instead of the sentence,
 * and this case goes red.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { ElectronApplication } from 'playwright'
import { afterAll, describe, expect, it } from 'vitest'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { THE_STABLE_TAG_REFUSAL } from '../src/config/stable-tag.mjs'
import { theSandboxWarning } from '../src/config/the-self-check.mjs'
import { WINDOW_WORDS } from '../src/config/the-self-check-words.mjs'
import { executableOf } from '../src/config/session-process.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { holdThePort } from '../tools/serve-dev.mjs'
import { TEST_DATABASE_PREFIX, devStackEnvironment } from './helpers.ts'
import { electronsBinary, stillRunning, whyNoWindowOpensHere } from './the-window-display.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_WINDOW = join(REPO, 'src', 'desktop', 'main.mjs')
const THE_STAND_IN = join(REPO, 'tools', 'serve-dev-stand-in.mjs')

const WHY_NOT = whyNoWindowOpensHere()
if (WHY_NOT !== null) console.log(`the-window-does-not-start-over-the-refusal-stand-in: skipped. ${WHY_NOT}`)

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
}

const folders = new Set<string>()
/** Every Electron this file started, by the pid that leads its own group, and its binary. */
const electrons = new Map<number, string>()
/** Every stand-in this file started, and what stops it. */
const standIns: { stop: () => void }[] = []

afterAll(async () => {
  for (const one of standIns.splice(0)) one.stop()
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
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
}, 60_000)

/**
 * THE REAL STAND-IN on a port this test holds, carrying the stable-tag refusal, exactly as serve-dev
 * starts it. It answers anything with 503, the stand-in header and the refusal in its body.
 */
async function aStandInCarryingTheRefusal(): Promise<number> {
  const port = await aFreePort()
  const held = holdThePort(port)
  const child = spawn(process.execPath, [THE_STAND_IN, `--supervisor-pid=${String(process.pid)}`, '--reason=a test holds the port', `--refusal=${THE_STABLE_TAG_REFUSAL}`], {
    stdio: ['ignore', 'pipe', 'pipe', held as never],
  })
  let said = ''
  child.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
  standIns.push({
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
      held.close()
    },
  })
  const deadline = Date.now() + 20_000
  while (!said.includes('listening') && Date.now() < deadline) await sleep(25)
  if (!said.includes('listening')) throw new Error(`the stand-in did not listen in 20 seconds: ${said}`)
  return port
}

/** An office's world of this test's own, whose port the stand-in holds. */
function aWorld(name: string, port: number): World {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.add(dir)
  const home = join(dir, 'home')
  mkdirSync(home)
  const database = join(dir, 'office.db')
  return { dir, database, port }
}

/** One line the window shows: `AWindowLine` in src/config/the-self-check.mjs. */
type AWindowLine = { say: string } | { heading: string } | { label: string; value: string; path?: true } | { todo: string }
type WindowState = { check: { lines: AWindowLine[]; offers: string[]; busy: boolean; answer: string | null }; officeAddress: string | null; language: string; developer: boolean; visible: boolean }

/** Open the window in a world. */
async function aWindow(world: World, lang?: string): Promise<ElectronApplication> {
  const binary = electronsBinary()
  if ('missing' in binary) throw new Error(binary.missing)
  const env: NodeJS.ProcessEnv = {
    ...devStackEnvironment(world.dir, world.port, await aFreePort(), { database: world.database }),
    HOME: join(world.dir, 'home'),
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    // Playwright starts the window with --inspect and --remote-debugging-port, which the window refuses unless this says on.
    MOLE_OFFICE_WINDOW_DEBUGGING: 'on',
  }
  const { _electron } = await import('playwright')
  const app = await _electron.launch({
    executablePath: binary.path,
    args: ['--no-sandbox', ...(lang === undefined ? [] : [`--lang=${lang}`]), THE_WINDOW],
    env: env as Record<string, string>,
    timeout: 60_000,
  })
  const child: ChildProcess | undefined = app.process()
  const pid = child?.pid
  if (pid !== undefined) electrons.set(pid, binary.path)
  return app
}

/** Wait until the window's state says what `ready` asks, and give it back. */
async function waitFor(app: ElectronApplication, ready: (state: WindowState) => boolean, what: string, everyMs = 200): Promise<WindowState> {
  const deadline = Date.now() + 120_000
  let last: WindowState | null = null
  while (Date.now() < deadline) {
    last = (await app.evaluate(() => (globalThis as unknown as { theMoleOfficeWindow?: { state(): unknown } }).theMoleOfficeWindow?.state() ?? null)) as WindowState | null
    if (last !== null && ready(last)) return last
    await sleep(everyMs)
  }
  throw new Error(`The window did not reach "${what}" in 120 seconds. It last said: ${JSON.stringify(last)}`)
}

describe('the window does not start the office over a stand-in that carries a refusal', () => {
  if (WHY_NOT !== null) {
    it.skip(`skipped: ${WHY_NOT}`, () => {})
    return
  }

  it('says the owner sentence with one press, and writes no service lock, in English and in Chinese', async () => {
    for (const lang of [undefined, 'zh-CN'] as const) {
      const language = lang === undefined ? 'en' : 'zh'
      const words = WINDOW_WORDS[language]
      const port = await aStandInCarryingTheRefusal()
      const world = aWorld(`window-refusal-${language}`, port)
      const app = await aWindow(world, lang)
      try {
        const said = await waitFor(app, (state) => state.check.answer !== null && !state.check.busy, 'the refusal answer')
        expect(said.check.answer).toBe('not-answering')
        expect(said.officeAddress).toBeNull()
        // THE OWNER SENTENCE, FIRST, and the sandbox warning once at the end as every window here shows.
        expect(said.check.lines.slice(0, 1)).toEqual([{ say: words.says.stableTagRefusal }])
        expect(said.check.lines.slice(-4)).toEqual(theSandboxWarning(language))
        // IT SAYS NOTHING THE START SAID, and it offers only Check again.
        expect(said.check.lines).not.toContainEqual({ say: WINDOW_WORDS[language].starting })
        expect(JSON.stringify(said.check.lines)).not.toContain('could not be started')
        expect(said.check.offers).toEqual(['checkAgain'])
        // NO SERVICE WAS STARTED: the world's database has no service lock.
        expect(readTheServiceLock(serviceLockPathFrom({ MOLE_OFFICE_DB: world.database })).state).not.toBe('read')
      } finally {
        if (stillRunning(app.process())) await app.close().catch(() => {})
      }
    }
  }, 300_000)
})
