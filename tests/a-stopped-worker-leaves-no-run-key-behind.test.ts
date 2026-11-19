// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A DISPATCH WORKER THAT IS STOPPED LEAVES NO RUN KEY BEHIND (4 November 2026).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * tools/agent-worker.mjs hands the run's key to claude as a file, alone in a folder made for the run, and removes the
 * folder when claude ends. An office restart ends the worker with SIGTERM while claude may be running, and a closed
 * terminal ends it with SIGHUP. Each must stop claude and wait for it, so that the folder goes before the worker does,
 * and the run must end with its key revoked. A SIGKILL cannot be caught; that run is ended by the office's check of
 * gone workers, which this file does not run.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * A real test office and the real worker, with a stand-in for claude that writes down the key file it was given and
 * then waits. Once it holds the file, the worker is sent the signal. Each case dispatches a run of its own and starts
 * a worker of its own.
 *
 *   1. SIGTERM: the worker exits 0, the key folder is gone, the run failed, and its key is revoked.
 *   2. SIGHUP: the same.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone, in tools/agent-worker.mjs unless named
 * ---------------------------------------------------------------------------------------
 *
 *   a. The SIGHUP handler taken out: case 2 goes red on the worker's exit, which a signal ended.
 *   b. done no longer removes the key folder: both cases go red on the folder.
 *   c. standDown no longer stops claude: both cases go red on the stand-in's own end, which it reached because nothing
 *      stopped it. The worker waits for it, so the folder still goes.
 *   d. The key file is not written: both cases go red on the file while claude ran.
 *   e. serve no longer reports a stopped run: both cases go red on the state, which stays claimed.
 *   f. In src/server/lib/agents.ts, finishRun no longer ends the run's key: both cases go red on the key.
 *   g. claude is not told where the key file is: both cases go red on the stand-in, which the worker never started.
 *   h. The variable is taken out of what claude is given: both cases go red on the stand-in's key file.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const WORKER = fileURLToPath(new URL('../tools/agent-worker.mjs', import.meta.url))
const asPerson = { 'x-mole-office-workspace': 'panelx', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
let api: string
let person: Record<string, string>

async function ask(method: 'GET' | 'POST', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: person, ...(payload === undefined ? {} : { payload: payload as never }) })
}

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Synthetic office', note: 'Only this test uses it.' })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string }
  person = { ...asPerson, 'x-mole-office-key': keys.person }
})

afterAll(async () => { await app?.close(); t?.close() })

interface Stopped {
  code: number | null
  output: string
  keyFile: string
  heldWhileRunning: boolean
  stoppedByTheWorker: boolean
  state: string
  revokedAt: string | null
}

/** Dispatch a run for a new agent, start the worker on it, and send the worker `signal` once claude holds its key file. */
async function stopTheWorkerWith(signal: 'SIGTERM' | 'SIGHUP'): Promise<Stopped> {
  const thread = await ask('POST', '/api/agent/threads', { title: `Synthetic brief stopped by ${signal}`, mode: 'review' })
  expect(thread.statusCode, thread.body).toBe(201)
  const threadId = thread.json().thread.id as string
  const said = await ask('POST', `/api/agent/threads/${threadId}/messages`, { intent: 'change', body: 'Wait until you are stopped.', recipient: { kind: 'new' } })
  expect(said.statusCode, said.body).toBe(201)
  const dispatched = await ask('POST', `/api/agent/threads/${threadId}/dispatch`)
  expect(dispatched.statusCode, dispatched.body).toBe(201)
  const runId = dispatched.json().runs[0].id as string
  const row = t.client.sqlite.prepare('SELECT request FROM agent_runs WHERE id = ?').get(runId) as { request: string }
  const keyId = (JSON.parse(row.request) as { agentKeyId: string }).agentKeyId

  const home = join(dirname(t.file), `home-${signal}`)
  const bin = join(home, 'bin')
  const holding = join(home, 'holding.json')
  const ranOut = join(home, 'ran-to-its-own-end')
  mkdirSync(bin, { recursive: true })
  mkdirSync(join(home, 'tmp'), { recursive: true })
  // The stand-in writes down its key file and its pid, then waits. It ends itself after 30 seconds and leaves a mark, so
  // that a worker that never stops it is seen, and one that dies leaves nothing running for long.
  writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('node:fs');
fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(holding)}, JSON.stringify({ keyFile: process.env.MOLE_AGENT_KEY_FILE ?? null, pid: process.pid,
  held: process.env.MOLE_AGENT_KEY_FILE !== undefined && fs.existsSync(process.env.MOLE_AGENT_KEY_FILE) }));
setTimeout(() => { fs.writeFileSync(${JSON.stringify(ranOut)}, ''); process.exit(3); }, 30000);
`)
  chmodSync(join(bin, 'claude'), 0o755)

  const worker = spawn(process.execPath, [WORKER, '--once', '--api', api, '--model', 'claude-opus-5-5'], {
    cwd: CHECKOUT,
    env: { ...withoutInheritedEffort(), HOME: home, PATH: bin + ':' + process.env['PATH'], TMPDIR: join(home, 'tmp') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  worker.stdout.on('data', (data) => { output += String(data) })
  worker.stderr.on('data', (data) => { output += String(data) })
  const closed = new Promise<number | null>((resolve, reject) => { worker.on('close', resolve); worker.on('error', reject) })

  const until = Date.now() + 60_000
  while (!existsSync(holding) && Date.now() < until && worker.exitCode === null) await new Promise((ok) => setTimeout(ok, 100))
  expect(existsSync(holding), `the stand-in never ran; the worker said: ${output}`).toBe(true)
  const held = JSON.parse(readFileSync(holding, 'utf8')) as { keyFile: string | null; pid: number; held: boolean }
  expect(held.keyFile, 'the stand-in was given no key file').not.toBeNull()

  worker.kill(signal)
  const code = await closed
  // Only under a mutation is the stand-in still running here. It is stopped only while its command is this case's own
  // stand-in, so a pid used again by something else is left alone; where there is no /proc it ends itself.
  try {
    if (readFileSync(`/proc/${String(held.pid)}/cmdline`, 'utf8').includes(join(bin, 'claude'))) process.kill(held.pid, 'SIGKILL')
  } catch { /* already gone, as it should be */ }
  const ended = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string }
  const key = t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE id = ?').get(keyId) as { revoked_at: string | null }
  return { code, output, keyFile: held.keyFile!, heldWhileRunning: held.held, stoppedByTheWorker: !existsSync(ranOut), state: ended.state, revokedAt: key.revoked_at }
}

describe('a dispatch worker that is stopped leaves no run key behind', () => {
  for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    it(`on ${signal}, stops claude, removes the run’s key folder, and ends the run with its key revoked`, async () => {
      const stopped = await stopTheWorkerWith(signal)
      expect(stopped.heldWhileRunning, 'the key file was not there while claude ran').toBe(true)
      expect(stopped.code, stopped.output).toBe(0)
      expect(stopped.stoppedByTheWorker, 'claude was not stopped; it ran to its own end').toBe(true)
      expect(existsSync(dirname(stopped.keyFile)), 'the run’s key folder was left behind').toBe(false)
      expect(stopped.state).toBe('failed')
      expect(stopped.revokedAt, 'the run’s key still opens the office').not.toBeNull()
    }, 90_000)
  }
})
