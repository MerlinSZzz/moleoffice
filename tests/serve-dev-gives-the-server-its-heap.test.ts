// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SERVE-DEV GIVES THE SERVER THE HEAP MOLE_OFFICE_SERVER_HEAP_MB NAMES, AND THE SERVER SAYS WHAT IT GOT.
 *
 * With an allowed value the server is started with --max-old-space-size=<value> before its --import,
 * and its start line says the heap limit V8 reports and the setting's value. Without the setting the
 * server's arguments carry no heap flag, and the line says the setting is not set. A value outside the
 * range stops serve-dev with the setting's sentence before any server starts.
 *
 * Each case runs the real tools/serve-dev.mjs in a copy of the parts a server needs, as
 * tests/the-built-office-is-supervised.test.ts does, on its own free ports and its own database, with
 * the message worker and the terminal holder off and no office setting inherited from this process.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readFileSync, symlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { SERVER_HEAP_MB_BOUNDS } from '../src/config/settings.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { commandThatStopsWithItsOwner } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HEAP = 'MOLE_OFFICE_SERVER_HEAP_MB'
const ALLOWED = '12288'
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
/** How long one start may take: a server compiled from a fresh copy took up to a minute on a loaded machine. */
const A_START_TAKES_AT_MOST = 120_000

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      probe.close(() => done(port))
    })
  })
}

/** Whether a recorded process, or with a negative number its group, has ended. */
function ended(pid: number): boolean {
  try { process.kill(pid, 0); return false } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
    throw error
  }
}

async function until(test: () => boolean | Promise<boolean>, what: string, within: number, said: () => string): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (await test()) return
    await sleep(250)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s. serve-dev said:\n${said()}`)
}

let copy = ''
/** What each case started: the serve-dev group, the server's pid once read, and the database folder. */
const startedHere: { group: number; server: number | null; folder: string }[] = []

beforeAll(() => {
  copy = aTestDatabaseFolder('server-heap-checkout')
  // src/config holds roles.json, which the server reads before it serves.
  for (const part of ['src', 'tools', 'for-agents', 'drizzle', 'package.json', 'tsconfig.json']) {
    cpSync(join(REPO, part), join(copy, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(copy, 'node_modules'))
})

afterEach(async () => {
  for (const one of startedHere.splice(0)) {
    if (!ended(-one.group)) {
      process.kill(-one.group, 'SIGTERM')
      try { await until(() => ended(-one.group), 'the recorded serve-dev group to end', 10_000, () => '') }
      catch {
        if (!ended(-one.group)) process.kill(-one.group, 'SIGKILL')
        await until(() => ended(-one.group), 'the recorded serve-dev group to end after SIGKILL', 5_000, () => '')
      }
    }
    // The server is in a group of its own and ends itself once serve-dev is gone.
    if (one.server !== null) await until(() => ended(one.server as number), 'the recorded server to end', 15_000, () => '')
    removeThisTestFolder(one.folder)
  }
})

afterAll(() => {
  if (copy !== '') removeThisTestFolder(copy)
})

/** Start serve-dev in the copy with the heap setting given, or with none. */
async function serveDev(heap: string | null) {
  const port = await freePort()
  const webPort = await freePort()
  const folder = aTestDatabaseFolder('server-heap-db')
  const database = join(folder, 'mole-office.db')
  const inherited = withoutInheritedEffort()
  for (const name of Object.keys(inherited)) if (name.startsWith('MOLE_OFFICE_')) delete inherited[name]
  const env = {
    ...inherited,
    MOLE_OFFICE_PORT: String(port),
    MOLE_OFFICE_WEB_PORT: String(webPort),
    MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`,
    MOLE_OFFICE_DB: database,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_MESSAGE_WORKER: 'off',
    MOLE_OFFICE_TERMINAL_HOLDER: 'off',
    MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0',
    ...(heap === null ? {} : { [HEAP]: heap }),
    // The start line is said at info.
    LOG_LEVEL: 'info',
    NODE_OPTIONS: undefined,
    VITEST: undefined,
    VITEST_WORKER_ID: undefined,
  } as NodeJS.ProcessEnv
  const watched = commandThatStopsWithItsOwner(process.execPath, ['tools/serve-dev.mjs'])
  const child = spawn(watched.command, watched.args, { cwd: copy, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env })
  if (child.pid === undefined) throw new Error('serve-dev was not started')
  const record = { group: child.pid, server: null as number | null, folder }
  startedHere.push(record)
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { pid: child.pid, port, database, record, exited, said: () => output }
}

/** The server serve-dev started, once it answers under that serve-dev, and the arguments it was started with. */
async function theServerOf(started: Awaited<ReturnType<typeof serveDev>>): Promise<string[]> {
  let server = 0
  await until(async () => {
    try {
      const answered = await fetch(`http://127.0.0.1:${String(started.port)}/api/runtime`, {
        headers: { 'x-mole-office-workspace': 'default' },
        signal: AbortSignal.timeout(4000),
      })
      if (!answered.ok) return false
      const runtime = (await answered.json()) as { process?: { pid?: number }; supervisor?: { watching?: unknown; pid?: number | null } }
      if (runtime.supervisor?.watching !== true || runtime.supervisor.pid !== started.pid) return false
      server = runtime.process?.pid ?? 0
      return server > 0
    } catch {
      return false
    }
  }, 'a server under this serve-dev answering', A_START_TAKES_AT_MOST, started.said)
  started.record.server = server
  // One process's own command line, by the pid the server gave.
  return readFileSync(`/proc/${String(server)}/cmdline`, 'utf8').split('\0').filter((word) => word !== '')
}

/** The heap limit and the setting's words on the start line, once it is said. */
async function theStartLine(started: Awaited<ReturnType<typeof serveDev>>, value: string): Promise<{ limit: number }> {
  const line = new RegExp(`heap limit (\\d+) MB \\(${HEAP} ${value}\\)`)
  await until(() => line.test(started.said()), 'the start line with the heap limit', 10_000, started.said)
  return { limit: Number(line.exec(started.said())?.[1]) }
}

describe('serve-dev and the server heap', () => {
  it(`starts the server with --max-old-space-size before --import when ${HEAP} is ${ALLOWED}, and the start line says so`, async () => {
    const started = await serveDev(ALLOWED)
    const args = await theServerOf(started)
    const flag = `--max-old-space-size=${ALLOWED}`
    expect(args, args.join(' ')).toContain(flag)
    expect(args).toContain('--import')
    expect(args.indexOf(flag)).toBeLessThan(args.indexOf('--import'))
    const { limit } = await theStartLine(started, ALLOWED)
    expect(limit).toBeGreaterThanOrEqual(Number(ALLOWED))
  }, A_START_TAKES_AT_MOST + 30_000)

  it(`starts the server with no heap flag when ${HEAP} is not set, and the start line says it is not set`, async () => {
    const started = await serveDev(null)
    const args = await theServerOf(started)
    expect(args).toContain('--import')
    expect(args.filter((word) => word.startsWith('--max-old-space-size')), args.join(' ')).toEqual([])
    const { limit } = await theStartLine(started, 'not set')
    expect(limit).toBeGreaterThan(0)
  }, A_START_TAKES_AT_MOST + 30_000)

  it(`stops before any server starts when ${HEAP} is out of range, with the setting's sentence`, async () => {
    const started = await serveDev('1024')
    const code = await Promise.race([started.exited, sleep(60_000).then(() => 'still running' as const)])
    expect(code, started.said()).not.toBe('still running')
    expect(code, started.said()).not.toBe(0)
    expect(code, started.said()).not.toBeNull()
    const said = started.said()
    expect(said).toContain(HEAP)
    expect(said).toContain('1024')
    expect(said).toContain(String(SERVER_HEAP_MB_BOUNDS.fewest))
    expect(said).toContain(String(SERVER_HEAP_MB_BOUNDS.most))
    // No server: none said its start line, and none made the database.
    expect(said).not.toContain('API on http://')
    expect(existsSync(started.database)).toBe(false)
  }, 90_000)
})
