// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN tools/agent-worker.mjs STARTED IS HELD TO THE PER-RUN MESSAGE LIMIT AT POST /api/records.
 *
 * Problem `0WNMf6-hqt1x`. The limit is counted from `fromRun`, which the records door writes from the
 * session the request names. A run the agent worker started was told no session id, so it sent no
 * session header, and the office did not know its writes were a run's. Its messages were not counted.
 *
 * Now the worker tells the run the id of the session record it filed for it, and the office knows
 * that record as a run because the office's own agent-run row was claimed by the same worker session
 * the record names as its parent.
 *
 * WHILE PROBLEM J60KF9L_OR-X IS OPEN, a write with a dispatched run's key may not name a run at all
 * (round 63, problem TwH5ICyRxLVd): the office cannot yet tie that key to its run. So every one of the
 * six messages is refused, naming that problem, and none is stored. The run is held more tightly than
 * the limit holds it, not less. When J60KF9L_OR-X is fixed, this file goes back to three stored and
 * three refused by the limit.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The server, the queued agent run, the claim and the worker are
 * real: this runs the real `tools/agent-worker.mjs` against a real API. The `claude` it starts is a
 * stand-in on PATH. The stand-in reads the prompt the worker gave it, sends the headers the prompt
 * tells it to send, and writes six messages to the person, which is what a run writing in a loop looks
 * like from the server's side. Then it prints an envelope and ends.
 */

import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WORKER = fileURLToPath(new URL('../tools/agent-worker.mjs', import.meta.url))

/** The limit this file is written against, set in the environment so the server reads the same. */
const ALLOWED = 3
/** How many messages the stand-in writes. */
const WRITES = 6

const ENVELOPE = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 1,
  duration_ms: 10,
  session_id: '22222222-2222-2222-2222-222222222222',
  total_cost_usd: 0,
  result: JSON.stringify({ answer: 'Synthetic answer from a run that wrote messages in a loop.', wrote: [] }),
  usage: { input_tokens: 1, output_tokens: 1 },
}

/**
 * THE STAND-IN. It reads the prompt on stdin, takes the address and the header lines out of it the
 * way an agent following the prompt would, writes WRITES messages, and records each status it got.
 */
function theStandIn(statusFile: string): string {
  return (
    '#!/usr/bin/env node\n' +
    `const STATUS = ${JSON.stringify(statusFile)}\n` +
    `const WRITES = ${String(WRITES)}\n` +
    `const PERSON = ${JSON.stringify(THE_PERSON)}\n` +
    `const ENVELOPE = ${JSON.stringify(JSON.stringify(ENVELOPE))}\n` +
    "const fs = require('node:fs')\n" +
    "let prompt = ''\n" +
    "process.stdin.on('data', (d) => { prompt += String(d) })\n" +
    "process.stdin.on('end', async () => {\n" +
    "  const api = /Mole Office is at (\\S+?)\\. /.exec(prompt)[1]\n" +
    '  const headers = { "content-type": "application/json" }\n' +
    '  for (const m of prompt.matchAll(/^  (x-mole-office-(?:workspace|actor-type|actor-id|session)): (\\S+)$/gm)) headers[m[1]] = m[2]\n' +
    "  if (process.env.MOLE_AGENT_KEY_FILE) headers['x-mole-office-key'] = fs.readFileSync(process.env.MOLE_AGENT_KEY_FILE, 'utf8').trim()\n" +
    '  const statuses = []\n' +
    '  for (let n = 1; n <= WRITES; n += 1) {\n' +
    "    const r = await fetch(api + '/api/records', { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: 'Loop message ' + n, data: { body: 'Loop message ' + n + ' from a run that will not stop.', to: [{ kind: 'person', id: PERSON }] } }) })\n" +
    '    statuses.push({ status: r.status, body: (await r.text()).slice(0, 400) })\n' +
    '  }\n' +
    '  fs.writeFileSync(STATUS, JSON.stringify({ session: headers["x-mole-office-session"] ?? null, statuses }))\n' +
    "  process.stdout.write(ENVELOPE + '\\n')\n" +
    '})\n'
  )
}

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let statusFile: string
let runId: string
let allowedBefore: string | undefined

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'panelx',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(method: string, path: string, payload?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: method as 'GET',
    url: path,
    headers: { ...AS_PERSON, ...thePersonsKeyHeader() },
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
  if (reply.statusCode < 200 || reply.statusCode >= 300) throw new Error(`${method} ${path}: ${reply.statusCode} ${reply.body}`)
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

beforeAll(async () => {
  allowedBefore = process.env['MOLE_OFFICE_RUN_MESSAGES']
  process.env['MOLE_OFFICE_RUN_MESSAGES'] = String(ALLOWED)
  t = await freshDb()
  // The tool files its records in the home project, which a fresh test database does not hold.
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'the home project this tool writes to' })

  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // THE RUN'S CASTING ROW. This office attaches the launcher's native selection only from a row whose
  // program and model are the run's, so the model this test invented is now data on the row.
  await ask('POST', '/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'opus' },
    native: { model: 'opus', provider: null, variant: null },
  })

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-agent-worker-limit-'))
  statusFile = join(scratch, 'statuses.json')
  const bin = join(scratch, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), theStandIn(statusFile))
  chmodSync(join(bin, 'claude'), 0o755)

  const started = await ask('POST', '/api/agent/threads', { title: 'Synthetic run that writes in a loop', mode: 'review' })
  const thread = (started['thread'] as { id: string }).id
  await ask('POST', '/api/agent/threads/' + thread + '/messages', { intent: 'change', body: 'Say what you changed.', recipient: { kind: 'new' } })
  const sent = await ask('POST', '/api/agent/threads/' + thread + '/dispatch')
  runId = ((sent['runs'] as { id: string }[])[0]!).id
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
  if (allowedBefore === undefined) delete process.env['MOLE_OFFICE_RUN_MESSAGES']
  else process.env['MOLE_OFFICE_RUN_MESSAGES'] = allowedBefore
})

/** The session record the tool filed for the agent run, read by the run id the tool wrote on it. */
function theRecordOfTheRun(run: string): { id: string; data: Record<string, unknown> } {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.extra.agentRun') = ?")
    .all(run) as { id: string; data: string }[]
  expect(rows.length, `the tool filed ${String(rows.length)} records for run ${run}`).toBe(1)
  return { id: rows[0]!.id, data: JSON.parse(rows[0]!.data) as Record<string, unknown> }
}

function messagesNaming(run: string): number {
  return (t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.fromRun') = ?")
    .get(run) as { n: number }).n
}

describe('a run the agent worker started, writing messages straight to POST /api/records', () => {
  let said: { session: string | null; statuses: { status: number; body: string }[] }
  let out = ''

  it('runs once under the real worker, and the stand-in writes six messages', async () => {
    const child = spawn(process.execPath, [WORKER, '--api', api, '--name', 'claude-code@fixture', '--model', 'opus', '--every', '200'], {
      cwd: CHECKOUT,
      env: { ...withoutInheritedEffort(), PATH: join(scratch, 'bin') + ':' + (process.env['PATH'] ?? '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    child.stdout.on('data', (data) => { out += String(data) })
    child.stderr.on('data', (data) => { err += String(data) })
    const closed = new Promise<number | null>((resolve) => child.on('close', resolve))
    try {
      const deadline = Date.now() + 30_000
      const ended = () => {
        const row = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string } | undefined
        return row?.state === 'finished' || row?.state === 'failed'
      }
      while (!ended() && child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      child.kill('SIGTERM')
    }
    await closed
    expect(existsSync(statusFile), `the stand-in never ran:\n${out}\n${err}`).toBe(true)
    said = JSON.parse(readFileSync(statusFile, 'utf8')) as typeof said
    expect(said.statuses.length).toBe(WRITES)
  }, 60_000)

  it('was told the id of the session record the worker filed for it', () => {
    expect(said.session, `the prompt named no session:\n${out}`).toBe(theRecordOfTheRun(runId).id)
  })

  // A DISPATCHED RUN'S KEY MAY NOT NAME A RUN YET (src/server/lib/the-run-a-key-holds.ts). Mutation: that refusal
  // taken out of src/server/lib/http.ts: red, three stored and three refused by the limit.
  it('refuses every one of the six, naming the problem that keeps a dispatched run from naming its run', () => {
    expect(said.statuses.map((one) => one.status), said.statuses.map((one) => one.body).join('\n')).toEqual(Array.from({ length: WRITES }, () => 403))
    for (const one of said.statuses) expect(one.body).toContain('until problem J60KF9L_OR-X is fixed')
  })

  it('stores no message that names the run', () => {
    expect(messagesNaming(theRecordOfTheRun(runId).id)).toBe(0)
  })
})

/**
 * THE RECORD IS NOT TAKEN AT ITS WORD. A session record that names the same agent run but a parent
 * that did not claim it is not that run, so a write naming it is not stamped and not counted.
 */
describe('a session record naming an agent run another worker claimed', () => {
  it('is not a run at the records door', async () => {
    // A REAL SESSION THAT DID NOT CLAIM THE RUN, filed by the person, so the person may name it as a parent (problem
    // NlOyicZP_Jjt). An id that names no session is refused at the records door now.
    const notTheClaimer = await ask('POST', '/api/records', {
      kind: 'session',
      title: 'A session that did not claim the agent run',
      data: { state: 'running' },
    })
    const filed = await ask('POST', '/api/records', {
      kind: 'session',
      title: 'A record claiming an agent run it did not serve',
      data: { state: 'running', parentAttachment: (notTheClaimer['record'] as { id: string }).id, extra: { agentRun: runId } },
    })
    const impostor = (filed['record'] as { id: string }).id
    const written = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...AS_PERSON, ...thePersonsKeyHeader(), 'x-mole-office-session': impostor },
      payload: { kind: 'message', title: 'Not a run', data: { body: 'Written under a record that is not a run.', to: [{ kind: 'person', id: THE_PERSON }] } },
    })
    expect(written.statusCode, written.body).toBe(201)
    expect(messagesNaming(impostor)).toBe(0)
  })
})
