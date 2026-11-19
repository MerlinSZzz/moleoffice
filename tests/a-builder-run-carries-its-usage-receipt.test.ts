// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * U3 / T1: A CLAUDE CODE RUN STARTED BY A BUILDER'S BRIEF CARRIES ITS USAGE RECEIPT.
 *
 * WHAT IS PROVED HERE, AND WHY IT IS NOT THE EXTRACTOR TEST.
 *
 * The extractor case already exists in tests/a-run-carries-its-usage-receipt.test.ts, and it would
 * pass today. This test drives the path instead: it queues two real agent runs, runs the real
 * `tools/agent-worker.mjs` against a real API without `--once`, with a stand-in `claude` on PATH
 * that prints a known Claude Code envelope, and then reads the records back and asserts where the
 * receipts are, field for field. A test that only called `claudeUsage` would not see the tool at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS EXPECTED BEFORE, AND WHY IT CHANGED. Problem f8-ejfdHdNBJ.
 * ---------------------------------------------------------------------------------------
 *
 * Until 30 September 2026 this file served one run with `--once` and expected the receipt on the
 * worker's OWN session record. A worker that serves several runs patched each receipt onto that one
 * record, so every receipt but the last was lost. Now each run the tool serves gets a session record
 * of its own, and the receipt is written there. The worker's own record carries none.
 */

import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { thePersonsKeyHeader, apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const WORKER = fileURLToPath(new URL('../tools/agent-worker.mjs', import.meta.url))

/** The envelope the stand-in prints. Every field the extractor reads is a distinct measured number. */
const ENVELOPE = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  duration_ms: 1234,
  session_id: '11111111-1111-1111-1111-111111111111',
  total_cost_usd: 0.5,
  result: JSON.stringify({ answer: 'Synthetic builder answer for the receipt test.' }),
  usage: { input_tokens: 11, cache_read_input_tokens: 22, cache_creation_input_tokens: 33, output_tokens: 44 },
  modelUsage: { 'claude-opus-5': { inputTokens: 11 } },
}

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let fakeClaudeDir: string
const runIds: string[] = []

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

async function record(id: string): Promise<{ record: { data: Record<string, unknown> } }> {
  return (await ask('GET', '/api/records/' + id)) as unknown as { record: { data: Record<string, unknown> } }
}

beforeAll(async () => {
  t = await freshDb()
  // The tool's own session record is filed in the home project it writes to, which a fresh test
  // database does not hold. Create it, so the tool can file its record and the test can read it.
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: 'panelx', title: 'Mole Office', note: 'the home project this tool writes to' })

  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })

  // THE RUN'S CASTING ROW. This office attaches the launcher's native selection only from a row whose
  // program and model are the run's, so the model this test invented is now data on the row.
  await ask('POST', '/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'opus' },
    native: { model: 'opus', provider: null, variant: null },
  })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-builder-receipt-'))
  fakeClaudeDir = join(scratch, 'bin')
  mkdirSync(fakeClaudeDir)
  const fake = '#!/usr/bin/env node\n' + `process.stdout.write(${JSON.stringify(JSON.stringify(ENVELOPE))} + '\\n')\n`
  writeFileSync(join(fakeClaudeDir, 'claude'), fake)
  chmodSync(join(fakeClaudeDir, 'claude'), 0o755)

  // TWO real queued runs for the tool to serve, each addressed to a new agent, the shape the
  // dispatch route writes, and each claimed over HTTP exactly as any worker claims one.
  for (const n of [1, 2]) {
    const started = await ask('POST', '/api/agent/threads', { title: 'Synthetic builder brief ' + String(n), mode: 'review' })
    const thread = (started['thread'] as { id: string }).id
    await ask('POST', '/api/agent/threads/' + thread + '/messages', {
      intent: 'change',
      body: 'Say what you changed.',
      recipient: { kind: 'new' },
    })
    const sent = await ask('POST', '/api/agent/threads/' + thread + '/dispatch')
    runIds.push(((sent['runs'] as { id: string }[])[0]!).id)
  }
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

/** The session records the tool filed for one run, read by the run id the tool wrote on each. */
function theRecordsOfRun(run: string): { id: string; data: Record<string, unknown> }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.extra.agentRun') = ?")
    .all(run) as { id: string; data: string }[]
  return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
}

const RECEIPT = {
  runtime: 'claude-code',
  inputTokens: 11,
  cachedInputTokens: 22,
  cacheCreationInputTokens: 33,
  outputTokens: 44,
  model: 'claude-opus-5',
  durationMs: 1234,
  costUsd: 0.5,
  inputIncludesCached: false,
}

describe('a builder run carries its usage receipt', () => {
  let out = ''
  let session: string | undefined

  it('a worker serving two runs writes each receipt on that run\'s own session record', async () => {
    const child = spawn(process.execPath, [WORKER, '--api', api, '--name', 'claude-code@fixture', '--model', 'opus', '--every', '200'], {
      cwd: CHECKOUT,
      env: { ...withoutInheritedEffort(), PATH: fakeClaudeDir + ':' + (process.env['PATH'] ?? '') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    child.stdout.on('data', (data) => { out += String(data) })
    child.stderr.on('data', (data) => { err += String(data) })
    const closed = new Promise<number | null>((resolve) => child.on('close', resolve))
    try {
      const deadline = Date.now() + 30_000
      const ended = () => runIds.every((id) => {
        const row = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(id) as { state: string } | undefined
        return row?.state === 'finished' || row?.state === 'failed'
      })
      while (!ended() && child.exitCode === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
    } finally {
      child.kill('SIGTERM')
    }
    const code = await closed
    expect(code, `the tool exited ${String(code)}:\n${out}\n${err}`).toBe(0)

    session = /is session (\S+)/.exec(out)?.[1]
    expect(session, `the tool never said which session record it filed:\n${out}`).toBeTruthy()
    for (const run of runIds) {
      const mine = theRecordsOfRun(run)
      expect(mine.length, `run ${run} has ${String(mine.length)} session records of its own:\n${out}`).toBe(1)
      expect(mine[0]!.id).not.toBe(session)
      expect(mine[0]!.data['usageReceipt']).toMatchObject(RECEIPT)
      expect(mine[0]!.data['state'], 'a run that answered has finished').toBe('finished')
    }
  }, 60_000)

  // HB1 (wave 13s round 36): the model is read from the envelope the stand-in printed, never from `--model opus`.
  it('writes on each run\'s own record the model the envelope says served it', () => {
    for (const run of runIds) {
      expect(theRecordsOfRun(run)[0]!.data['served']).toEqual({
        model: 'claude-opus-5',
        temperature: 'not reported',
        briefBytes: 'not reported',
        contextTokens: { largestTurn: 'not reported', total: 'not reported' },
      })
    }
  })

  it('leaves no receipt on the worker\'s own session record, which spent nothing itself', async () => {
    expect(session).toBeTruthy()
    const data = (await record(session!)).record.data
    expect(data['usageReceipt']).toBeUndefined()
  })

  it('the runs it served really finished, so the receipts belong to runs and not to dry claims', async () => {
    for (const run of runIds) {
      const row = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(run) as { state: string } | undefined
      expect(row?.state).toBe('finished')
    }
  })
})
