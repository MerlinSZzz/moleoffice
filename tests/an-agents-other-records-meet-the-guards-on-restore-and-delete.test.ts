// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RECORDS MEET THE GUARDS WHEN ONE IS BROUGHT BACK, DELETED, OR FILED IN ANOTHER PROJECT. Wave 13p round 29.
 *
 * THREE GAPS, one describe each:
 *
 *   1. Bringing back a deleted agent record asked only the card guard and the broadcast-times guard. A record holding a
 *      credential the registry row does not hold, or a start folder none of the agent's other live records holds, came
 *      back with it. Putting back an earlier VERSION goes through the ordinary change door, which already asks both;
 *      that is measured here too, so a change to either road shows.
 *   2. Deleting any agent record retired its agent, even while another live record of the same agent remained in
 *      another project. The agent is retired only with its last live record now, and the reply says which.
 *   3. A new agent record filed under a live handle in another project became the record a secretary's broadcast
 *      times were read from, so the times the agent held were dropped with nothing said. The record read is now the
 *      first-filed live one.
 *
 * MUTATION PROOF, after a control run, each restored exactly (wave 13p round 29, logs in the round's folder):
 *   no-credential-on-restore: the restore guard not asking the credential guard turns the credential case red;
 *   no-folder-on-restore: the restore guard not asking the start-folder guard turns the two folder cases red;
 *   no-credential-on-patch and no-folder-on-patch: the change door not asking those guards turns the version cases red;
 *   retire-always: the delete not asking for another live record turns the delete case red;
 *   newest-again: the agent's record read newest first again turns the second-project case red;
 *   times-always: the restore asking the times of every record turns the newer-record case red.
 *
 * Everybody and everything here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RecordKind } from '../src/shared/types.ts'

type BroadcastLib = typeof import('../src/server/lib/broadcast.ts')

let t: TestDb
let app: FastifyInstance
let broadcast: BroadcastLib

const THERE = 'orchard'
const ELSEWHERE = 'meadow'
const GROVE = 'grove'
const FOLDER_A = '/tmp/r29-made-up-start-folder-a'
const FOLDER_B = '/tmp/r29-made-up-start-folder-b'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const idOf: Record<string, string> = {}

function asAgent(handle: string, workspace = 'default'): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf[handle]! }
}

function personIn(workspace: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace }
}

async function ask(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ code: number; said: Record<string, unknown>; body: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown>, body: reply.body }
}

async function register(handle: string, role: string): Promise<void> {
  const { code, said } = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(code, `registering ${handle}: ${JSON.stringify(said).slice(0, 300)}`).toBe(201)
  idOf[handle] = (said as { agent: { id: string } }).agent.id
}

/** A record filed directly by the person in `workspaceId`. The create path asks neither the credential nor the folder. */
function file(workspaceId: string, kind: RecordKind, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId, kind, title: `a ${kind} of this test`, data, actor: { type: 'human', id: THE_PERSON } }).id
}

/** The registry row a record is mapped to, or undefined. */
function rowOf(recordId: string): { id: string; retired: number; credential: string | null } | undefined {
  return t.client.sqlite
    .prepare('SELECT a.id AS id, a.retired AS retired, a.credential AS credential FROM agent_records m JOIN agents a ON a.id = m.agent_id WHERE m.record_id = ?')
    .get(recordId) as { id: string; retired: number; credential: string | null } | undefined
}

/** Whether one agent's registry row is retired. */
function isRetired(handle: string): boolean {
  return (t.client.sqlite.prepare('SELECT retired FROM agents WHERE id = ?').get(idOf[handle]) as { retired: number }).retired === 1
}

/** The record one agent registered with, which is its first-filed. */
function firstRecordOf(handle: string): string {
  return (t.client.sqlite
    .prepare("SELECT r.id AS id FROM agent_records m JOIN records r ON r.id = m.record_id WHERE m.agent_id = ? AND r.kind = 'agent' ORDER BY r.created_at ASC, r.rowid ASC LIMIT 1")
    .get(idOf[handle]) as { id: string }).id
}

/** The newest revision of one record whose data held one value at one path. */
function versionHolding(recordId: string, path: string, value: string): number {
  return (t.client.sqlite
    .prepare('SELECT seq FROM revisions WHERE record_id = ? AND json_extract(data, ?) = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId, path, value) as { seq: number }).seq
}

const A_CREDENTIAL_SENTENCE = 'The credential on an agent is measured when it registers'
const A_FOLDER_SENTENCE = 'on an agent record is changed by the person, or by the door that does that act, and this request is neither'
const A_RESTORE_SENTENCE = 'Bringing this agent record back would put what it holds back on its agent'

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  t = await freshDb()
  broadcast = await import('../src/server/lib/broadcast.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const [id, title] of [[THERE, 'Orchard'], [ELSEWHERE, 'Meadow'], [GROVE, 'Grove']]) {
    const made = await ask('POST', '/api/workspaces', AS_THE_PERSON, { id, title })
    expect(made.code, made.body.slice(0, 300)).toBeLessThan(300)
  }
  await register('g-cred', 'worker')
  await register('g-fold', 'worker')
  await register('g-lone', 'worker')
  await register('g-rev', 'worker')
  await register('g-two', 'worker')
  await register('g-sec', 'secretary')
  await register('w-one', 'worker')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('bringing back a deleted agent record meets the credential guard and the start-folder guard', () => {
  it('refuses bringing back a record holding a credential its registry row does not hold, the person as well', async () => {
    const carried = file(THERE, 'agent', { handle: 'g-cred', credential: 'made-up-credential' })
    expect(rowOf(carried)?.id).toBe(idOf['g-cred'])
    expect(rowOf(carried)?.credential).toBeNull()
    const gone = await ask('DELETE', `/api/records/${carried}`, personIn(THERE))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const back = await ask('POST', `/api/records/${carried}/restore`, personIn(THERE))
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain(A_RESTORE_SENTENCE)
    expect(back.body).toContain(A_CREDENTIAL_SENTENCE)
    expect(t.api.getRecord(carried)?.deletedAt).not.toBeNull()
    expect(rowOf(carried)?.credential).toBeNull()
  })

  it('refuses an agent bringing back a start folder no other live record holds, and lets the person', async () => {
    const carried = file(THERE, 'agent', { handle: 'g-fold', startFolder: FOLDER_A })
    expect(rowOf(carried)?.id).toBe(idOf['g-fold'])
    const gone = await ask('DELETE', `/api/records/${carried}`, personIn(THERE))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const refused = await ask('POST', `/api/records/${carried}/restore`, asAgent('w-one', THERE))
    expect(refused.code, refused.body.slice(0, 400)).toBe(403)
    expect(refused.body).toContain(A_RESTORE_SENTENCE)
    expect(refused.body).toContain(A_FOLDER_SENTENCE)
    expect(t.api.getRecord(carried)?.deletedAt).not.toBeNull()
    const byThePerson = await ask('POST', `/api/records/${carried}/restore`, personIn(THERE))
    expect(byThePerson.code, byThePerson.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(carried)?.deletedAt).toBeNull()
  })

  it('lets an agent bring back a start folder another live record of the agent holds, so the refusal is about the folder', async () => {
    const kept = file(ELSEWHERE, 'agent', { handle: 'g-fold', startFolder: FOLDER_B })
    const carried = file(GROVE, 'agent', { handle: 'g-fold', startFolder: FOLDER_B })
    expect(rowOf(kept)?.id).toBe(idOf['g-fold'])
    expect(rowOf(carried)?.id).toBe(idOf['g-fold'])
    const gone = await ask('DELETE', `/api/records/${carried}`, personIn(GROVE))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const back = await ask('POST', `/api/records/${carried}/restore`, asAgent('w-one', GROVE))
    expect(back.code, back.body.slice(0, 400)).toBe(200)
  })

  it('refuses an agent bringing back the only record of an agent when it holds a start folder', async () => {
    const only = firstRecordOf('g-lone')
    const set = await ask('POST', '/api/participants/agent/g-lone/start-folder', AS_THE_PERSON, { startFolder: FOLDER_A, because: 'This test.' })
    expect(set.code, set.body.slice(0, 400)).toBe(200)
    const gone = await ask('DELETE', `/api/records/${only}`, AS_THE_PERSON)
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    expect(isRetired('g-lone')).toBe(true)
    const back = await ask('POST', `/api/records/${only}/restore`, asAgent('w-one'))
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain(A_FOLDER_SENTENCE)
    expect(t.api.getRecord(only)?.deletedAt).not.toBeNull()
  })
})

describe('putting back an earlier version of an agent record meets the same two guards', () => {
  it('refuses an agent putting back a version with another start folder', async () => {
    const record = firstRecordOf('g-rev')
    for (const folder of [FOLDER_A, FOLDER_B]) {
      const set = await ask('POST', '/api/participants/agent/g-rev/start-folder', AS_THE_PERSON, { startFolder: folder, because: 'This test.' })
      expect(set.code, set.body.slice(0, 400)).toBe(200)
    }
    const seq = versionHolding(record, '$.startFolder', FOLDER_A)
    const back = await ask('POST', `/api/records/${record}/revisions/${seq}/restore`, asAgent('w-one'), {})
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain(A_FOLDER_SENTENCE)
    expect(t.api.getRecord(record)?.data['startFolder']).toBe(FOLDER_B)
  })

  it('refuses putting back a version with another credential, the person as well', async () => {
    const record = file(THERE, 'agent', { handle: 'g-rev-cred', credential: 'made-up-credential-a' })
    expect(rowOf(record)?.credential).toBe('made-up-credential-a')
    // PAST THE DOORS, AS DATA OLDER THAN THE GUARD COULD BE: the record holds another credential now.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.credential', 'made-up-credential-b') WHERE id = ?").run(record)
    const seq = versionHolding(record, '$.credential', 'made-up-credential-a')
    const back = await ask('POST', `/api/records/${record}/revisions/${seq}/restore`, personIn(THERE), {})
    expect(back.code, back.body.slice(0, 400)).toBe(403)
    expect(back.body).toContain(A_CREDENTIAL_SENTENCE)
    expect(t.api.getRecord(record)?.data['credential']).toBe('made-up-credential-b')
  })
})

describe('deleting one of an agent’s records retires the agent only with its last live record', () => {
  it('keeps the agent while a record of it remains, says so, and retires it with the last', async () => {
    const first = firstRecordOf('g-two')
    const second = file(THERE, 'agent', { handle: 'g-two' })
    expect(rowOf(second)?.id).toBe(idOf['g-two'])
    const one = await ask('DELETE', `/api/records/${first}`, AS_THE_PERSON)
    expect(one.code, one.body.slice(0, 400)).toBe(200)
    expect(isRetired('g-two')).toBe(false)
    expect(String(one.said['note'])).toContain(
      `The registry row "g-two" is not retired, because its agent still has a record that is not deleted: "a agent of this test" (${second}) in project ${THERE}.`,
    )
    const last = await ask('DELETE', `/api/records/${second}`, personIn(THERE))
    expect(last.code, last.body.slice(0, 400)).toBe(200)
    expect(isRetired('g-two')).toBe(true)
    expect(String(last.said['note'])).toContain('The registry row "g-two" is retired with it')
  })
})

describe('a new agent record in another project does not become the one a secretary’s times are read from', () => {
  it('reads g-sec’s times off the record it registered with after a record of it is filed in another project', async () => {
    const set = await ask('POST', '/api/participants/agent/g-sec/broadcast-times', AS_THE_PERSON, { times: ['12:00'], because: 'This test.' })
    expect(set.code, set.body.slice(0, 300)).toBe(200)
    const first = firstRecordOf('g-sec')
    const newer = file(THERE, 'agent', { handle: 'g-sec' })
    expect(rowOf(newer)?.id).toBe(idOf['g-sec'])
    broadcast.syncTheBroadcastSchedules()
    expect(broadcast.theTimesOf(idOf['g-sec']!)).toEqual(['12:00'])
    const elevation = await import('../src/server/lib/elevation.ts')
    expect(elevation.anyRecordForAgent(idOf['g-sec']!)?.record).toBe(first)
  })

  it('brings back g-sec’s newer record, which holds no times and is not the one read, so it is not refused for that', async () => {
    const newer = (t.client.sqlite
      .prepare("SELECT id FROM records WHERE workspace_id = ? AND kind = 'agent' AND json_extract(data, '$.handle') = 'g-sec'")
      .get(THERE) as { id: string }).id
    const gone = await ask('DELETE', `/api/records/${newer}`, personIn(THERE))
    expect(gone.code, gone.body.slice(0, 400)).toBe(200)
    const back = await ask('POST', `/api/records/${newer}/restore`, personIn(THERE))
    expect(back.code, back.body.slice(0, 400)).toBe(200)
    expect(broadcast.theTimesOf(idOf['g-sec']!)).toEqual(['12:00'])
  })
})
