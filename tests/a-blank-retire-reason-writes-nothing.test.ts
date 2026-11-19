// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BLANK RETIRE REASON WRITES NOTHING, AND A REFUSED RETIREMENT IS UNDONE WHOLE.
 *
 * Problem `HeqtGKcycLvq`. POST /api/participants/agent/<id>/retire with a reason of spaces only
 * answered 400 "This agent record was not stored" after it had already retired the registry row
 * and revoked the agent's keys. Only the last write, the patch on the agent record, refused the
 * blank reason. The door now refuses a reason that trims to nothing before it writes, and its
 * writes run in one SQLite transaction.
 *
 * Each case drives the door and then drives the key: a note written with the key alone must still
 * be read as the agent. The registry row, the `held_keys` rows and the agent record are read too.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * Case 1: take `.trim()` out of `retireBody` in src/server/api/participants.ts. The blank reason
 * then reaches the writes, the agent record's kind refuses it with a different sentence, and the
 * case goes red on the sentence.
 *
 * Case 2: remove the `sqlite.transaction(() => { … })()` wrapper around the retire door's writes.
 * The registry row is then retired and the keys revoked before the record patch refuses, and the
 * case goes red.
 *
 * Case 3 is the ordinary path and is a control only.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

const THE_SENTENCE = 'a retirement says why, so a reader can tell a closed test agent from a live one.'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The key and nothing else, so the actor id can only have come from the key. */
const THE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

interface Registered {
  key: string
  recordId: string
}

/** Register an agent as the person, and hand back its key and the id of its agent record. */
async function register(handle: string): Promise<Registered> {
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name: handle, role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  const key = String((registered.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  const read = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const recordId = String((read.json() as { participant?: { record?: string | null } }).participant?.record ?? '')
  // THE AGENT HAS A RECORD, so the door's record patch is one of the writes in every case here.
  expect(recordId, 'the registration filed no agent record').not.toBe('')
  return { key, recordId }
}

async function retire(handle: string, because: string): Promise<{ status: number; error: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers: AS_THE_PERSON,
    payload: { because },
  })
  return { status: reply.statusCode, error: String((reply.json() as { error?: unknown }).error ?? '') }
}

/** Who the office reads a note written with this key alone as. */
async function whoTheKeyNames(key: string): Promise<{ type: string; id: string } | undefined> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...THE_KEY_ALONE, 'x-mole-office-key': key },
    payload: { kind: 'note', title: 'Written with the key alone', data: { body: 'Who does this key name?' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const recordId = String((reply.json() as { record?: { id?: string } }).record?.id)
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

async function readsRetired(handle: string): Promise<unknown> {
  const read = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return (read.json() as { participant?: { retired?: unknown } }).participant?.retired
}

function registryRow(handle: string): { retired: number; retired_because: string | null } | undefined {
  return t.client.sqlite.prepare('SELECT retired, retired_because FROM agents WHERE handle = ?').get(handle) as
    | { retired: number; retired_because: string | null }
    | undefined
}

/** The live keys the agent with this handle holds. A key is kept under its registry id (criterion I5). */
function liveKeys(handle: string): number {
  const row = t.client.sqlite
    .prepare('SELECT COUNT(*) AS live FROM held_keys WHERE whose_id = (SELECT id FROM agents WHERE handle = ?) AND revoked_at IS NULL')
    .get(handle) as { live: number }
  return row.live
}

/** The registry id of the agent with this handle, which since the mint (criterion I1) is not the handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

function recordState(recordId: string): unknown {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(recordId) as { data: string } | undefined
  return row === undefined ? undefined : (JSON.parse(row.data) as { state?: unknown }).state
}

/** Everything the retire door may change, read at once, so "nothing changed" is one comparison. */
async function whatTheDoorCouldChange(handle: string, registered: Registered): Promise<Record<string, unknown>> {
  return {
    readsRetired: await readsRetired(handle),
    row: registryRow(handle),
    liveKeys: liveKeys(handle),
    recordState: recordState(registered.recordId),
  }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the retire door checks the reason before it writes anything', () => {
  it.each([
    ['spaces', '   ', 'blank-spaces'],
    ['a tab and a line break', '\t\n', 'blank-tab-and-line-break'],
  ])('refuses a reason of %s only, and the agent, its key and its record are as they were', async (_what, blank, handle) => {
    const registered = await register(handle)

    // CONTROL: the agent is live, its row is live, its key is live and names it.
    const before = await whatTheDoorCouldChange(handle, registered)
    expect(before).toEqual({ readsRetired: false, row: { retired: 0, retired_because: null }, liveKeys: 1, recordState: 'active' })
    expect(await whoTheKeyNames(registered.key)).toEqual({ type: 'agent', id: idOf(handle) })

    const refused = await retire(handle, blank)
    expect(refused.status, refused.error).toBe(400)
    expect(refused.error, 'the refusal is not the sentence about a reason').toContain(THE_SENTENCE)

    // NOTHING MOVED: the same four readings, and the key still names the agent.
    expect(await whatTheDoorCouldChange(handle, registered), 'the refused retirement changed something').toEqual(before)
    expect(await whoTheKeyNames(registered.key), 'the key stopped naming the agent').toEqual({ type: 'agent', id: idOf(handle) })
  })

  it('undoes every write when the record patch refuses after the row and the keys were written', async () => {
    const handle = 'rolled-back'
    const registered = await register(handle)
    const before = await whatTheDoorCouldChange(handle, registered)
    expect(before).toEqual({ readsRetired: false, row: { retired: 0, retired_because: null }, liveKeys: 1, recordState: 'active' })

    // THE AGENT RECORD HOLDS A VALUE ITS KIND NOW REFUSES, as a record stored before a rule was
    // written would. `patchRecord` checks the `notes` path of the whole agent record after the patch
    // (`checkAgentNotes`) and refuses a relative one, so the door's record patch is refused whatever
    // the reason says.
    // After the trim in `retireBody`, no reason passes the door and is refused by the kind, so this
    // is how the test makes a later write refuse.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.notes', 'a/relative/path') WHERE id = ?")
      .run(registered.recordId)

    const refused = await retire(handle, 'the test retires it, and the record patch refuses')
    expect(refused.status, refused.error).toBe(400)
    expect(refused.error, 'the refusal is not the record patch refusing the notes path').toContain('"notes" is "a/relative/path"')

    // THE ROW AND THE KEYS WERE WRITTEN BEFORE THE REFUSAL, and the transaction undid both.
    expect(await whatTheDoorCouldChange(handle, registered), 'the refused retirement was left half done').toEqual(before)
    expect(await whoTheKeyNames(registered.key), 'the key stopped naming the agent').toEqual({ type: 'agent', id: idOf(handle) })
  })

  it('still retires an agent for a reason with words, stores it trimmed and revokes its key', async () => {
    const handle = 'retired-for-a-reason'
    const registered = await register(handle)
    expect(await whoTheKeyNames(registered.key)).toEqual({ type: 'agent', id: idOf(handle) })

    const retired = await retire(handle, '  the test retires it  ')
    expect(retired.status, retired.error).toBe(200)

    expect(await whatTheDoorCouldChange(handle, registered)).toEqual({
      readsRetired: true,
      row: { retired: 1, retired_because: 'the test retires it' },
      liveKeys: 0,
      recordState: 'retired',
    })
    expect(await whoTheKeyNames(registered.key), 'the retired agent’s key still names it').not.toEqual({
      type: 'agent',
      id: handle,
    })
  })
})
