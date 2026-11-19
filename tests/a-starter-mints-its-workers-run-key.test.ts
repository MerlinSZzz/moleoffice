// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STARTER THAT FILES ITS WORKER'S RUN IS HANDED THE RUN'S KEY. P83 point 5; message
 * M5m4y7nRUJKn, question a.
 *
 * The office has minted a run key on one path: its own message worker, proved by the office's key,
 * filing a running session that says `startedByMoleOffice`. A launcher inside a sandbox is not the
 * office. It is the served agent's registered starter, and it proves itself with its own agent key.
 * The create door of POST /api/records now mints for that caller too, and for nobody else:
 *
 *   1. the starter, with its own key, is answered `runKey`, and that key under the worker's name is
 *      the worker;
 *   2. another agent's key is answered no key, and the session is still filed;
 *   3. a header claim naming the starter, with no key, is answered no key;
 *   4. a supervisor holding its own RUN key is its worker's starter, so the worker's run is minted too;
 *   5. ending the run revokes the key minted on this path.
 *
 * Every agent is registered through POST /api/agents/started, so each `started_by` is the one that
 * door writes, and every request goes through the real door with `app.inject`.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each in src/server/api/records.ts unless named
 * ---------------------------------------------------------------------------------------
 *
 *   a. Delete the `actor.provedBy === 'an-agent-key' && …` disjunct of `mayAsk`. Cases 1, 4 and 5
 *      go red: no starter is minted anything.
 *   b. Replace `theKeyHolderIsTheRegisteredStarterOf(agent, actor.keyHolder)` with `true`. Case 2
 *      goes red: another agent's key is minted a key.
 *   c. Change that disjunct to `(actor.provedBy === 'an-agent-key' || actor.provedBy === undefined)`
 *      with `actor.keyHolder ?? actor.id`. Case 3 goes red: a header claim is minted a key.
 *   d. Remove the `revokeTheRunKeyRecordedOn(…)` call from `patchRecord` in src/server/lib/records.ts.
 *      Case 5 goes red. That block is the one revoke for both paths, and
 *      tests/a-runs-key-dies-with-the-run.test.ts guards it for the office's path.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * WHETHER A VALUE IS A KEY, as a yes or no. Every assertion on a key asks this, so a failing one
 * prints true or false and never the key itself.
 */
function isAKey(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value)
}

/** An agent's own headers: its name, and its key where it sends one. */
function asAgent(handle: string, key?: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** Register an agent through the starter door, as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, {
    handle,
    name: handle,
    runtime: 'claude-code',
    ...(role === undefined ? {} : { role }),
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** The starter the registry holds for an agent, as the starter door wrote it. */
function startedByOf(handle: string): string | null {
  const row = t.client.sqlite.prepare('SELECT started_by_id AS id FROM agents WHERE handle = ? AND retired = 0').get(handle) as
    | { id: string | null }
    | undefined
  return row?.id ?? null
}

const SANDBOX = {
  template: 'a-template',
  container: 'a-container-resource',
  folder: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/a-test-sandbox`,
}

/** File a running session serving `handle`, with the headers given. */
async function fileARun(
  handle: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown>; id: string; runKey: string | null }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
  const runKey = (filed.body['runKey'] as { key?: string } | undefined)?.key ?? null
  return { ...filed, id: String((filed.body['record'] as { id?: string } | undefined)?.id ?? ''), runKey }
}

/** Write a note with the headers given, and read who the change row names. */
async function whoWritesWith(headers: Record<string, string>, title: string): Promise<{ status: number; actor: { type: string; id: string } | undefined }> {
  const note = await ask('POST', '/api/records', headers, { kind: 'note', title, data: { body: title } })
  const id = String((note.body['record'] as { id?: string } | undefined)?.id ?? '')
  const actor = t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(id) as { type: string; id: string } | undefined
  return { status: note.status, actor }
}

/** The key and nothing else, so the change row can only name the key's holder. */
function theKeyAlone(key: string): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }
}

/**
 * WHETHER A KEY IS THIS AGENT, driven two ways. Under the agent's own name the write is filed and the
 * change row names that agent. With the key alone the change row names the key's holder, which only
 * the key can have said.
 */
async function expectTheKeyIs(key: string, handle: string): Promise<void> {
  const named = await whoWritesWith(asAgent(handle, key), `written as ${handle} with its key`)
  expect(named.status).toBe(201)
  expect(named.actor).toEqual({ type: 'agent', id: handle })
  const alone = await whoWritesWith(theKeyAlone(key), `written with ${handle}'s key alone`)
  expect(alone.status).toBe(201)
  expect(alone.actor, `the key is not ${handle}'s`).toEqual({ type: 'agent', id: idOf(handle) })
}

let starterKey = ''
let starterSession = ''
let starterOwnRunKey: string | null = null

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE STARTER IS THE PERSON'S, AND THE WORKERS ARE THE STARTER'S. The stranger is the person's too,
  // so it is registered and holds a real key, but it started nobody here.
  starterKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  await register('a-stranger', AS_THE_PERSON, 'supervisor')
  await register('worker-one', asAgent('the-launcher', starterKey))
  await register('worker-two', asAgent('the-launcher', starterKey))
  await register('worker-three', asAgent('the-launcher', starterKey))
  await register('worker-five', asAgent('the-launcher', starterKey))
  expect(startedByOf('worker-one')).toBe(idOf('the-launcher'))
  // THE STARTER'S OWN RUN, filed with its own key. Its starter is the person; the second case reads
  // that it was minted nothing.
  const own = await fileARun('the-launcher', asAgent('the-launcher', starterKey))
  expect(own.status, JSON.stringify(own.body)).toBe(201)
  starterSession = own.id
  starterOwnRunKey = own.runKey
  // THE STARTER'S RUN IS IN THE SANDBOX, as a launcher inside one is: the container row `tools/sandbox.mjs up` registers,
  // and the field the person puts on its run. A run filed from inside a sandbox names only that sandbox
  // (tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts).
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-18 10:00:00', 'agent:fixture')")
    .run(SANDBOX.container, 'mole-office-sandbox-a-test-sandbox', `Sandbox a-test-sandbox, from the template a-template; ${theWordsNamingTheFolder(SANDBOX.folder)} Started by node tools/sandbox.mjs up.`)
  const put = await ask('PATCH', `/api/records/${starterSession}`, AS_THE_PERSON, { dataPatch: { sandbox: SANDBOX } })
  expect(put.status, JSON.stringify(put.body)).toBe(200)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the served agent’s registered starter is minted the run key', () => {
  it('answers runKey to the starter’s own key, and the key under the worker’s name is the worker', async () => {
    // FILED UNDER THE STARTER'S KEY AND THE STARTER'S OWN SESSION, with the sandbox the launcher writes.
    const run = await fileARun('worker-one', asAgent('the-launcher', starterKey, starterSession), { sandbox: SANDBOX })
    expect(run.status, JSON.stringify(run.body)).toBe(201)
    expect(isAKey(run.runKey), 'the starter was minted no key').toBe(true)
    expect((run.body['runKey'] as { handle?: string }).handle).toBe('worker-one')
    expect(run.runKey === starterKey, 'the starter was handed its own key back').toBe(false)

    // THE SESSION HEADER NAMES THE STARTER'S OWN RECORD BY ID, so the create binds nothing to the new run.
    expect(run.body['sessionBinding'], JSON.stringify(run.body['sessionBinding'])).toBeUndefined()
    const stored = await ask('GET', `/api/records/${run.id}`, AS_THE_PERSON)
    const data = ((stored.body['record'] as { data?: Record<string, unknown> }).data ?? {}) as Record<string, unknown>
    expect(data['sandbox']).toEqual(SANDBOX)
    expect(typeof (data['extra'] as Record<string, unknown> | undefined)?.['runKeyId']).toBe('string')

    // THE KEY IS THE WORKER, under the worker's own name, and not the starter.
    await expectTheKeyIs(run.runKey ?? '', 'worker-one')
  })

  it('answers no key to another agent’s key, and still files the session', async () => {
    const strangerKey = String(
      ((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-second-stranger', name: 'a-second-stranger', runtime: 'claude-code', role: 'supervisor' })).body['whatToGiveIt'] as { key?: string }).key,
    )
    // A STRANGER TO worker-two MAY NOT FILE ITS SESSION AT ALL since the filing door (round 30), so nothing is
    // filed and nothing is minted.
    const refused = await fileARun('worker-two', asAgent('a-second-stranger', strangerKey))
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.runKey === null, 'an agent that did not start worker-two was minted its key').toBe(true)
    // AN AGENT TWO RUNGS ABOVE A WORKER MAY FILE ITS SESSION, and is still not its registered starter: the session is
    // filed, and no key is minted.
    const middleKey = await register('a-middle', asAgent('a-second-stranger', strangerKey), 'supervisor')
    await register('worker-six', asAgent('a-middle', middleKey))
    const run = await fileARun('worker-six', asAgent('a-second-stranger', strangerKey))
    expect(run.status, JSON.stringify(run.body)).toBe(201)
    expect(run.id).not.toBe('')
    expect(run.runKey === null, 'an agent that did not start worker-six was minted its key').toBe(true)
    // AND AN AGENT IS NOT ITS OWN STARTER: the launcher's own run, filed with its own key, was minted nothing.
    expect(starterOwnRunKey === null, 'the launcher was minted a key for its own run').toBe(true)
  })

  it('answers no key to a header claim naming the starter with no key', async () => {
    const run = await fileARun('worker-three', asAgent('the-launcher'))
    expect(run.runKey === null, 'a claim with no key was minted a key').toBe(true)
  })

  it('mints through a run key: a supervisor holding its own run key starts its worker’s run', async () => {
    // THE SUPERVISOR IS THE LAUNCHER'S, AND ITS RUN IS MINTED ON THE STARTER'S PATH.
    await register('a-supervisor', asAgent('the-launcher', starterKey), 'supervisor')
    const supervisorRun = await fileARun('a-supervisor', asAgent('the-launcher', starterKey))
    const supervisorsRunKey = supervisorRun.runKey
    expect(isAKey(supervisorsRunKey), 'the supervisor’s run was minted no key').toBe(true)

    // THE SUPERVISOR REGISTERS ITS WORKER WITH ITS RUN KEY, so the worker's starter is the supervisor.
    await register('a-sandboxed-worker', asAgent('a-supervisor', supervisorsRunKey ?? ''))
    expect(startedByOf('a-sandboxed-worker')).toBe(idOf('a-supervisor'))

    const run = await fileARun('a-sandboxed-worker', asAgent('a-supervisor', supervisorsRunKey ?? '', supervisorRun.id))
    expect(run.status, JSON.stringify(run.body)).toBe(201)
    expect(isAKey(run.runKey), 'the supervisor’s run key did not mint its worker’s run').toBe(true)
    await expectTheKeyIs(run.runKey ?? '', 'a-sandboxed-worker')
  })

  it('revokes the key minted on this path when the run ends', async () => {
    const run = await fileARun('worker-five', asAgent('the-launcher', starterKey))
    expect(isAKey(run.runKey), 'the starter was minted no key').toBe(true)
    await expectTheKeyIs(run.runKey ?? '', 'worker-five')

    // ENDED AS `crashed`. `finished` needs a registered work area to seal, which this test has none of,
    // and `patchRecord` revokes on every word that ends a run, `finished`, `crashed` and `orphaned` alike.
    const ended = await ask('PATCH', `/api/records/${run.id}`, asAgent('the-launcher', starterKey), { dataPatch: { state: 'crashed' } })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)

    const row = t.client.sqlite
      .prepare('SELECT revoked_at AS at, revoked_because AS because FROM held_keys WHERE id = ?')
      .get(
        String(
          ((
            (await ask('GET', `/api/records/${run.id}`, AS_THE_PERSON)).body['record'] as { data?: { extra?: Record<string, unknown> } }
          ).data?.extra ?? {})['runKeyId'],
        ),
      ) as { at: string | null; because: string | null } | undefined
    expect(row?.at, 'the run ended and its key was not revoked').not.toBeNull()
    expect(String(row?.because)).toContain(run.id)
    const after = await whoWritesWith(theKeyAlone(run.runKey ?? ''), 'after the run ended')
    expect(after.actor, 'the ended run’s key still names the worker').not.toEqual({ type: 'agent', id: idOf('worker-five') })
  })
})
