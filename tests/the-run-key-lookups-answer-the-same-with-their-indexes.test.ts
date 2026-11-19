// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUN-KEY LOOKUPS ANSWER THE SAME WITH THEIR INDEXES AS WITHOUT THEM. Wave 13n, run st5EG9M1BNjt: the brief of
 * 19 October 2026, point 4.
 *
 * Migration 0277 adds revisions_run_key_id_idx and records_session_run_key_id_idx so that the binding's lookups in
 * src/server/lib/keys.ts find their rows without reading a whole table (tests/the-run-key-lookups-are-found-by-their-
 * indexes.test.ts shows the plans). An index is only a way to find a row, so each lookup must answer what it answered
 * before: the same run for every key, from the first revision that names the key by rowid.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * On a made-up office, five keys are asked three questions, `theRunThisRunKeyIsBoundTo`,
 * `theKeyWithThisIdIsItsHoldersOwn` and `whatTheKeyWithThisIdIsFor`, first with both indexes dropped (the control) and
 * then with both made again from their own words:
 *
 *   - a run key minted when its run was filed: bound to that run, and the newest;
 *   - a reopened terminal run's new key: bound to that run, and the newest;
 *   - the key that reopen replaced: bound to the same run, and not the newest;
 *   - an agent's own key, which no binding names: bound to nothing, and its holder's own;
 *   - a minted run key whose id a later PATCH copied onto another session: still bound to the run it was minted for.
 *
 * Both times every key gets the answer above, and the two sets of answers are the same.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, after a green control
 * ---------------------------------------------------------------------------------------
 *
 *   a. `theOriginalMintOf` reads the newest revision that names the key (ORDER BY rowid DESC) in place of the first: the
 *      copied key's answer goes red. The test stops at the first of its two answers, the one without the indexes.
 *
 * Every key here is made up, and no assertion prints one.
 */

import { dirname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let keys: typeof import('../src/server/lib/keys.ts')

/** The two indexes the binding's lookups use, which this test drops and makes again. */
const THE_INDEXES = ['revisions_run_key_id_idx', 'records_session_run_key_id_idx'] as const

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': key }
}

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json()
}

/** Register an agent through the starter door and hand back its key. */
async function register(handle: string, by: Record<string, string>, role = 'worker'): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  return String((made['whatToGiveIt'] as { key?: string } | undefined)?.key)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** File a running session serving `handle`, as the launcher, which mints the run its key. */
async function fileARun(handle: string, launcherKey: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent('the-launcher', launcherKey), {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle },
  })
  expect((filed['runKey'] as { key?: string } | undefined)?.key, 'the run was minted no key').toBeTypeOf('string')
  return String((filed['record'] as { id?: string } | undefined)?.id)
}

/** The key row a run's record names now. */
function theKeyIdOf(run: string): string {
  return (t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS id FROM records WHERE id = ?").get(run) as { id: string }).id
}

type Answers = Record<string, { boundTo: { run: string; newest: boolean } | null; itsHoldersOwn: boolean; madeFor: unknown }>

let asked: Record<string, string> = {}
let expected: Record<string, { boundTo: { run: string; newest: boolean } | null; itsHoldersOwn: boolean }> = {}

function theAnswers(): Answers {
  const answers: Answers = {}
  for (const [name, id] of Object.entries(asked)) {
    answers[name] = {
      boundTo: keys.theRunThisRunKeyIsBoundTo(id) ?? null,
      itsHoldersOwn: keys.theKeyWithThisIdIsItsHoldersOwn(id),
      madeFor: keys.whatTheKeyWithThisIdIsFor(id),
    }
  }
  return answers
}

function theIndexesThere(): string[] {
  const names = t.client.sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${THE_INDEXES.map(() => '?').join(', ')})`).all(...THE_INDEXES) as { name: string }[]
  return names.map((one) => one.name).sort()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  keys = await import('../src/server/lib/keys.ts')
  const terminals = await import('../src/server/lib/terminal-agents.ts')

  const launcherKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  const ownKey = await register('a-made-up-supervisor', asAgent('the-launcher', launcherKey), 'supervisor')
  await register('a-made-up-worker', asAgent('the-launcher', launcherKey))

  const minted = await fileARun('a-made-up-supervisor', launcherKey)

  const copiedFrom = await fileARun('a-made-up-worker', launcherKey)
  const copiedOnto = await fileARun('a-made-up-worker', launcherKey)
  await ask('PATCH', `/api/records/${copiedOnto}`, asAgent('the-launcher', launcherKey), { dataPatch: { extra: { runKeyId: theKeyIdOf(copiedFrom) } } })

  await register('a-made-up-terminal-agent', AS_THE_PERSON)
  const agent = { id: idOf('a-made-up-terminal-agent'), handle: 'a-made-up-terminal-agent' }
  const opened = terminals.fileATerminalsRunAndItsKey({
    agent,
    runtime: 'claude-code',
    folder: dirname(t.file),
    providerSession: null,
    workspaceId: 'default',
    actor: { type: 'human', id: THE_PERSON, sessionId: null, provedBy: 'the-person-key' },
    title: 'a made-up terminal opened again',
    doing: 'Works in a terminal the office holds, opened by the person.',
    extra: {},
  })
  const replaced = theKeyIdOf(opened.session)
  const proof = (t.client.sqlite.prepare('SELECT mint_proved_by AS proof FROM held_keys WHERE id = ?').get(replaced) as { proof: string | null }).proof
  terminals.giveAReopenedRunANewKey(opened.session, agent.id, { id: replaced, proof } as never)

  asked = {
    'a minted run key': theKeyIdOf(minted),
    "a reopened run's new key": theKeyIdOf(opened.session),
    'the key that reopen replaced': replaced,
    "an agent's own key": keys.theHeldKeyRowWhoseHashIs(keys.keyHash(ownKey))?.id ?? '',
    'a minted key whose id was copied onto another session': theKeyIdOf(copiedFrom),
  }
  expected = {
    'a minted run key': { boundTo: { run: minted, newest: true }, itsHoldersOwn: false },
    "a reopened run's new key": { boundTo: { run: opened.session, newest: true }, itsHoldersOwn: false },
    'the key that reopen replaced': { boundTo: { run: opened.session, newest: false }, itsHoldersOwn: false },
    "an agent's own key": { boundTo: null, itsHoldersOwn: true },
    'a minted key whose id was copied onto another session': { boundTo: { run: copiedFrom, newest: true }, itsHoldersOwn: false },
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('every key gets the same answer with the indexes dropped (the control) and made again', () => {
  expect(new Set(Object.values(asked)).size, 'five different keys').toBe(5)
  expect(theIndexesThere(), 'the migration made both indexes').toEqual([...THE_INDEXES].sort())
  const words = THE_INDEXES.map((name) => (t.client.sqlite.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(name) as { sql: string }).sql)

  for (const name of THE_INDEXES) t.client.sqlite.exec(`DROP INDEX ${name}`)
  expect(theIndexesThere(), 'the control runs with both indexes dropped').toEqual([])
  const without = theAnswers()

  for (const sql of words) t.client.sqlite.exec(sql)
  expect(theIndexesThere(), 'both indexes made again').toEqual([...THE_INDEXES].sort())
  const withThem = theAnswers()

  for (const [name, answer] of Object.entries(expected)) {
    expect(without[name], `${name}, without the indexes`).toMatchObject(answer)
    expect(withThem[name], `${name}, with the indexes`).toMatchObject(answer)
  }
  expect(withThem).toEqual(without)
})
