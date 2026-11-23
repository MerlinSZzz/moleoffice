// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER TAKES ITS PROJECT FROM THE RECORD IT HOLDS, NOT FROM THE CHECKOUT'S .env.
 *
 * F15 point 1; problem `kXXiGKoVoGQN`, linked to `pHFu8nivPZ_O`. The ruling: without
 * `--workspace` the tool takes the project from the session record it holds, then from the agent
 * record, and from `.env` last; its first line says which of the three it used. A `--workspace` that
 * disagrees with the record is still refused, because a caller that names a project and holds a
 * record in another one has a real contradiction and guessing between the two is this whole piece's
 * defect.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY A REAL CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The waiter is spawned the way a person starts it, against a listening server, so what is measured
 * is the real first line and the real hold:
 *
 *   1. the session record's project is used, and the first line says so;
 *   2. when no session record answers, the agent record's project is used, and the first line says so;
 *   3. when neither answers, the checkout's `.env` is used, and the first line says so;
 *   4. a `--workspace` that disagrees with the session record is refused and nothing is held.
 *
 * The spawn is asynchronous: `spawnSync` would block this process's event loop, and the API is
 * listening in this process.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const WAITER = join(CHECKOUT, 'tools', 'hold-the-handle.mjs')

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  const made = await server.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: 'robotics', title: 'Robotics' },
  })
  expect(made.statusCode, made.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
})

/** File one record in one project through the route an agent uses, and hand back its id. */
async function file(workspaceId: string, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspaceId,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'the-waiter-test',
    },
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  if (kind === 'agent') {
    const key = (res.json() as { whatToGiveIt: { key: string } }).whatToGiveIt.key
    writeFileSync(join(dirname(t.file), `${String(data['handle'])}.key`), key, { mode: 0o600 })
  }
  return (res.json() as { record: { id: string } }).record.id
}

interface WaiterRun {
  stdout: string
  stderr: string
  code: number | null
}

/**
 * Start the waiter, wait until it has held or stopped, and hand back what it printed.
 *
 * On the ordinary path this stops the child as soon as the hold is printed; the test's server is
 * torn down afterwards, so the hold it leaves is nobody's problem.
 */
function runWaiter(args: string[], env: Record<string, string>): Promise<WaiterRun> {
  return new Promise((resolve) => {
    const home = mkdtempSync(join(tmpdir(), 'mole-office-waiter-home-'))
    const child = spawn('node', [WAITER, ...args], {
      env: { ...process.env, HOME: home, MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: join(dirname(t.file), `${args[args.indexOf('--agent') + 1]}.key`), MOLE_OFFICE_API: url, MOLE_OFFICE_DB: t.file, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill('SIGKILL')
      } catch {
        // The child had already gone, which is the outcome this wanted.
      }
      rmSync(home, { recursive: true, force: true })
      resolve({ stdout, stderr, code })
    }
    const timer = setTimeout(() => { finish(null) }, 15_000)
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      if (stdout.includes('Holding the handle')) finish(null)
    })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('exit', (code) => { finish(code) })
  })
}

/** The first line the waiter printed. */
const firstLine = (run: WaiterRun): string => (run.stdout.split('\n')[0] ?? '').trim()

describe('the waiter takes its project from the record before the checkout', () => {
  it('takes it from the session record, and the first line says so', async () => {
    const handle = 'waiter-from-session'
    await file('robotics', 'agent', 'Waiter from session', { handle, state: 'active' })
    const session = await file('robotics', 'session', 'A run in robotics', { state: 'running', runtime: 'claude-code' })

    const run = await runWaiter(['--agent', handle, '--session', session], { MOLE_OFFICE_WORKSPACE: 'default' })
    expect(firstLine(run)).toBe('Project "robotics" taken from the session record.')
    expect(run.stdout).toContain('Holding the handle')
  })

  it('falls back to the agent record when no session record answers, and the first line says so', async () => {
    const handle = 'waiter-from-agent'
    await file('robotics', 'agent', 'Waiter from agent', { handle, state: 'active' })

    const run = await runWaiter(
      ['--agent', handle, '--session', 'no-such-session-record'],
      { MOLE_OFFICE_WORKSPACE: 'default' },
    )
    expect(firstLine(run)).toBe('Project "robotics" taken from the agent record.')
  })

  it('falls back to the setting when neither record answers, and the first line says where the setting came from', async () => {
    const standIn = createServer((_req, res) => { res.writeHead(404); res.end() })
    await new Promise<void>((resolve) => standIn.listen(0, '127.0.0.1', resolve))
    try {
      const address = standIn.address()
      const api = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
      const run = await runWaiter(
        ['--agent', 'nobody-registered-as-this', '--session', 'no-such-session-record'],
        { MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_API: api, MOLE_AGENT_KEY_FILE: '', MOLE_AGENT_KEY: 'made-up-key-for-the-stand-in' },
      )
      expect(firstLine(run)).toBe('Project "default" taken from MOLE_OFFICE_WORKSPACE in this process\'s environment.')
    } finally {
      standIn.closeAllConnections()
      await new Promise<void>((resolve) => standIn.close(() => resolve()))
    }
  })

  it('refuses a --workspace that disagrees with the session record, and holds nothing', async () => {
    const handle = 'waiter-disagrees'
    await file('robotics', 'agent', 'Waiter that disagrees', { handle, state: 'active' })
    const session = await file('robotics', 'session', 'Another run in robotics', { state: 'running', runtime: 'claude-code' })

    const run = await runWaiter(['--agent', handle, '--session', session, '--workspace', 'default'], {
      MOLE_OFFICE_WORKSPACE: 'default',
    })
    expect(run.code).not.toBe(0)
    expect(run.stderr).toContain('disagrees with the session record')
    expect(run.stderr).toContain('"robotics"')
    expect(run.stdout, 'the waiter held a handle its project contradiction should have stopped').not.toContain(
      'Holding the handle',
    )
  })
})
