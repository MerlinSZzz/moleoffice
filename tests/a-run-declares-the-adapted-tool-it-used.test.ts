// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN DECLARES THE TOOL MOLE OFFICE ADAPTS THAT IT USED, AND THE USAGE SPLIT COUNTS THAT, NOT THE FREE WORD.
 *
 * Problem uh6-H72Zik9H, and option 3 of a decision: a session record's `runtime` stays a
 * free word, and a separate declared field, `adaptedTool`, records the adapted tool and is the one
 * counted. What is held here:
 *
 *   1. A run with only a free word, even the name of an adapted tool, is counted under "not declared".
 *   2. Two spellings of one tool (`codex`, `codex-cli`) are one tool only through the declared field.
 *   3. A declared value that is not an adapted tool is refused at the record door and at the attachment door,
 *      with the kind's own sentence, and nothing is written.
 *   4. The message worker declares the tool of a real adapter and declares none for the fake runtime.
 *
 * tests/register-a-run-files-a-runnable-session.test.ts holds the fifth: a run filed by tools/register-a-run.mjs
 * carries the declared tool.
 *
 * THE MUTATIONS, each run after a control (the commit message names the commands and the logs):
 *
 *   M1 src/server/lib/usage-agents.ts, the join: read the free word when nothing is declared
 *      (`record.adaptedTool ?? (isAgentRuntime(record.runtimeWord) ? record.runtimeWord : null)`) → case 1 red.
 *   M2 src/server/lib/usage-agents.ts, the split's key: key the row by the free word
 *      (`const key = record?.runtimeWord ?? adaptedTool ?? ''`) → case 2 red.
 *   M3 src/shared/kinds.ts, the session kind: `adaptedTool` typed `'string'` instead of the list → case 3 red.
 *   M4 src/worker/runtimes/adapter.ts `theToolARunDeclares`: answer the runtime word whatever it is → case 4 red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { AgentUsage } from '../src/server/lib/usage-agents.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { theToolARunDeclares } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance

/** File a session record through the door, and answer its id. */
async function aRun(title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'session', title, data: { state: 'running', ...data } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** One request-log row under a run, as the recorder writes it, so the split has a call to count. */
function aCallUnder(run: string, id: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'human', ?, ?, 'default', 'none')",
    )
    .run(id, Date.now(), THE_PERSON, run)
}

/** How many session records the project holds, counted in the table. */
function sessionsHeld(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
}

async function theSplit(): Promise<AgentUsage> {
  const usage = await import('../src/server/lib/usage-agents.ts')
  return usage.agentUsage(Date.now() - 60_000, 'default')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the usage split counts the declared tool', () => {
  it('counts a run with only a free word under "not declared", even when the word names an adapted tool', async () => {
    const run = await aRun('A run that only says claude-code in its free word', { runtime: 'claude-code' })
    aCallUnder(run, 'call-free-word-only')
    const split = await theSplit()
    const arrival = split.arrivals.find((one) => one.sessionId === run)
    expect(arrival?.adaptedTool, 'the free word was read as a declared tool').toBeNull()
    expect(arrival?.declaredBy).toBeNull()
    expect(arrival?.runtimeWord, 'the free word is not shown as it was written').toBe('claude-code')
    const claude = split.byFramework.find((row) => row.adaptedTool === 'claude-code')
    expect(claude, 'a run that declared nothing was counted under claude-code').toBeUndefined()
    const notDeclared = split.byFramework.find((row) => row.adaptedTool === null)
    expect(notDeclared?.sessions, 'the run is not counted under "not declared"').toBeGreaterThanOrEqual(1)
    expect(notDeclared?.why, 'the "not declared" row does not say why').toContain('declared no tool')
  })

  it('counts two spellings of one tool as one tool, and only through the declared field', async () => {
    const plain = await aRun('A codex run spelled codex', { runtime: 'codex', adaptedTool: 'codex' })
    const other = await aRun('A codex run spelled codex-cli', { runtime: 'codex-cli', adaptedTool: 'codex' })
    const undeclared = await aRun('A codex-cli run that declared nothing', { runtime: 'codex-cli' })
    aCallUnder(plain, 'call-codex')
    aCallUnder(other, 'call-codex-cli')
    aCallUnder(undeclared, 'call-codex-cli-undeclared')
    const split = await theSplit()
    const codexRows = split.byFramework.filter((row) => row.adaptedTool === 'codex')
    expect(codexRows, 'codex is split into more than one row').toHaveLength(1)
    expect(codexRows[0]?.sessions, 'the two declared codex runs are not one tool with two runs').toBe(2)
    expect(split.arrivals.find((one) => one.sessionId === other)?.declaredBy).toBe('the session record')
    expect(split.arrivals.find((one) => one.sessionId === undeclared)?.adaptedTool, 'codex-cli with nothing declared was counted as codex').toBeNull()
  })
})

describe('a declared value that is not an adapted tool is refused, and nothing is written', () => {
  it('refuses it at the record door, on a new run and on a change', async () => {
    const before = sessionsHeld()
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'session', title: 'A run that declares a spelling', data: { state: 'running', adaptedTool: 'codex-cli' } },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body, 'the refusal does not say what the field takes').toContain('takes only a tool Mole Office adapts')
    for (const word of AGENT_RUNTIMES) expect(refused.body, word).toContain(word)
    expect(sessionsHeld(), 'a refused run was written all the same').toBe(before)

    const run = await aRun('A run whose declared tool is changed to a word that is not one', { runtime: 'vite', adaptedTool: 'opencode' })
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_PERSON, payload: { dataPatch: { adaptedTool: 'vite' } } })
    expect(changed.statusCode, changed.body).toBe(400)
    const read = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: AS_THE_PERSON })
    expect((read.json() as { record: { data: Record<string, unknown> } }).record.data['adaptedTool'], 'the refused change was written').toBe('opencode')
  })

  it('refuses it at the attachment door, and takes an adapted tool there', async () => {
    const before = sessionsHeld()
    const refused = await app.inject({ method: 'POST', url: '/api/attachments', headers: AS_THE_PERSON, payload: { title: 'An attached run with a spelling', adaptedTool: 'codex-cli' } })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('takes only a tool Mole Office adapts')
    expect(sessionsHeld(), 'a refused attachment was written all the same').toBe(before)

    const taken = await app.inject({ method: 'POST', url: '/api/attachments', headers: AS_THE_PERSON, payload: { title: 'An attached kimi run', runtime: 'kimi-cli', adaptedTool: 'kimi' } })
    expect(taken.statusCode, taken.body).toBeLessThan(300)
    expect(sessionsHeld()).toBe(before + 1)
  })
})

describe('the message worker declares the tool of the adapter it starts', () => {
  it('declares a real adapter’s tool and none for the fake runtime', () => {
    expect(theToolARunDeclares(new ClaudeCodeAdapter({}))).toBe('claude-code')
    expect(theToolARunDeclares(new FakeAdapter('a-script.mjs', {})), 'a fake run was declared as a real tool').toBeNull()
    expect(theToolARunDeclares({ runtime: 'inspection-tool' })).toBeNull()
    expect(theToolARunDeclares({ runtime: 'merge-tool' })).toBeNull()
  })
})
