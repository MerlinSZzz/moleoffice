// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN WITH A LARGE PROMPT STARTS, AND THE WORKER LIVES ON. Problem `3skPvjYAjw_4`.
 *
 * tools/agent-worker.mjs put the whole prompt into one argument of `claude -p <prompt>`. Linux
 * refuses a single argument over 128 KiB, so spawn threw E2BIG out of the run, the worker died with
 * an uncaught stack trace, and nothing was posted for the run. The tool now writes the prompt to the
 * child's stdin, and a spawn that throws is posted as the run's failure.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT. The API, the queued run and the worker are real. `claude` is a
 * synthetic stand-in on PATH: it reads its stdin, and answers with how many bytes it read and
 * whether the marker at the end of the message reached it. The message body is 200,000 bytes of
 * synthetic filler, which is over the kernel's 131,072-byte limit on one argument.
 *
 * THE MUTATIONS. Control: both cases green. (1) The prompt put back into argv in `runClaude`: the
 * first case went red (the run failed with "spawn E2BIG"), the second stayed green, because the
 * failure was posted and the worker lived on. (2) The same, with the try/catch around `spawn`
 * removed as well: both cases went red, and the worker exited 1. Restored with `cp`, proved with
 * `cmp`, both green again.
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
const MARKER = 'SYNTHETIC-END-OF-A-LARGE-PROMPT'
/** Over 131,072 bytes, the most one argument may hold on Linux. */
const FILLER = 200_000

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let bin: string
let runId = ''
let exitCode: number | null = null
let output = ''

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
  if (reply.statusCode < 200 || reply.statusCode >= 300) throw new Error(`${method} ${path}: ${reply.statusCode} ${reply.body.slice(0, 400)}`)
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: 'panelx', title: 'Synthetic office for the large-prompt test' })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // THE RUN'S CASTING ROW. This office attaches the launcher's native selection only from a row whose
  // program and model are the run's, so the model this test invented is now data on the row.
  await ask('POST', '/api/casting/worker', {
    program: { value: 'claude-code' },
    model: { value: 'synthetic-model' },
    native: { model: 'synthetic-model', provider: null, variant: null },
  })

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-large-prompt-'))
  bin = join(scratch, 'bin')
  mkdirSync(bin)
  // The stand-in reads all of stdin, then says what it read. It never looks at its arguments for
  // the prompt, so a prompt that went anywhere but stdin reaches it as zero bytes.
  const fake =
    '#!/usr/bin/env node\n' +
    'let got = ""\n' +
    'process.stdin.on("data", (d) => { got += String(d) })\n' +
    'process.stdin.on("end", () => {\n' +
    `  const answer = "stdin carried " + String(Buffer.byteLength(got)) + " bytes; marker " + (got.includes(${JSON.stringify(MARKER)}) ? "present" : "absent")\n` +
    '  process.stdout.write(JSON.stringify({ result: JSON.stringify({ answer }) }))\n' +
    '})\n'
  writeFileSync(join(bin, 'claude'), fake)
  chmodSync(join(bin, 'claude'), 0o755)

  const thread = ((await ask('POST', '/api/agent/threads', { title: 'Synthetic large prompt', mode: 'direct' }))['thread'] as { id: string }).id
  await ask('POST', `/api/agent/threads/${thread}/messages`, {
    intent: 'discuss',
    body: 'x'.repeat(FILLER) + '\n' + MARKER,
    recipient: { kind: 'new' },
  })
  runId = ((await ask('POST', `/api/agent/threads/${thread}/dispatch`))['runs'] as { id: string }[])[0]!.id

  const child = spawn(process.execPath, [WORKER, '--once', '--api', api, '--model', 'synthetic-model', '--limit', '20000'], {
    cwd: CHECKOUT,
    env: { ...withoutInheritedEffort(), HOME: scratch, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (d) => { output += String(d) })
  child.stderr.on('data', (d) => { output += String(d) })
  exitCode = await new Promise<number | null>((resolve) => child.on('close', resolve))
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('a run whose prompt is larger than one argument may be', () => {
  it('reaches the agent whole, through stdin, and the run finishes', () => {
    const row = t.client.sqlite.prepare('SELECT state, result, error FROM agent_runs WHERE id = ?').get(runId) as { state: string; result: string | null; error: string | null }
    expect(row.state, `the run ended ${row.state}: ${String(row.error)}\n${output}`).toBe('finished')
    const answer = String((JSON.parse(String(row.result)) as { answer?: unknown }).answer)
    expect(answer).toContain('marker present')
    const bytes = Number(/stdin carried (\d+) bytes/.exec(answer)?.[1])
    expect(bytes).toBeGreaterThan(FILLER)
  })

  it('leaves the worker alive to stand down on its own, with the run ended rather than left claimed', () => {
    expect(exitCode, `the worker exited ${String(exitCode)}:\n${output}`).toBe(0)
    const row = t.client.sqlite.prepare('SELECT state FROM agent_runs WHERE id = ?').get(runId) as { state: string }
    expect(['finished', 'failed']).toContain(row.state)
  })
})
