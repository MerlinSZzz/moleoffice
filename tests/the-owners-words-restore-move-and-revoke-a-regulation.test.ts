// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A decision lets a secretary restore, move and revoke a regulation
 * on the owner's written words for that act. The grant still restores and moves, and never revokes.
 * These cases use the record routes of a scratch office, synthetic regulations and agents, and
 * inspect the records, revisions, changes and presses in its database after each request.
 * A move binds the act, record and destination as regulation.move:{"record":id,"to":project}.
 * Every regulation carried with another record needs its own binding and its own id in the words.
 * Mutations run independently on 23 October 2026, after green.log passed all 49 cases.
 * Mutation 1: Remove the regulation.revoke act check. mutation-1.log exited 1; these cases went red:
 *   revoke refuses words for another act and writes nothing
 *   revoke refuses words for another record and writes nothing
 *   revoke refuses words for record alone and writes nothing
 *   revoke refuses words for another act even with the grant and writes nothing
 *   revoke refuses words for another record even with the grant and writes nothing
 *   revoke refuses words for record alone even with the grant and writes nothing
 * Mutation 2: Ask the revocation words clause on create too. mutation-2.log exited 1; these cases went red:
 *   refuses an agent create already revoked, even with words naming a revocation
 * Mutation 3: Remove the secretary check for restore, retaining the words mark. mutation-3.log exited 1; these cases went red:
 *   restore refuses a worker with the right words in the old refusal and writes nothing
 * Mutation 4: Ignore the move destination while matching the act and record. mutation-4.log exited 1; these cases went red:
 *   move refuses words for another project and writes nothing
 *   move refuses words for another project even with the grant and writes nothing
 *   requires separate words for a regulation moving with another record
 * Mutation 5: Let wrong restore words fall through to the grant. mutation-5.log exited 1; these cases went red:
 *   restore refuses words for another act even with the grant and writes nothing
 *   restore refuses words for another record even with the grant and writes nothing
 *   restore refuses words for record alone even with the grant and writes nothing
 * Each mutation was restored with git checkout before the next; the clean restore is run again.
 */
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Warrant } from '../src/shared/warrant.ts'

let t: TestDb, app: FastifyInstance, seeded: Database.Database
let secretary: Record<string, string>, worker: Record<string, string>, secretaryId: string, workerId: string
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
const revocation = { revoked_at: '2026-10-23', revoked_because: 'Made-up reason: this rule has done its work.' }
const regulation = (title = 'Made-up regulation') => ({ kind: 'regulation', title, data: { sentence: 'Made-up constraint for this scratch office.', binds: 'person', since: '2026-10-23' } })
const words = (...targets: string[]): Warrant => ({ saidBy: THE_TEST_OFFICES_OWNER.id, words: 'Made-up words authorising this one act.', where: 'terminal', when: '2026-10-23 10:00', for: targets })
const moveAct = (id: string, to = 'destination') => `regulation.move:${JSON.stringify({ record: id, to })}`
type Act = 'restore' | 'move' | 'revoke'
const binding = (act: Act, id: string) => act === 'move' ? moveAct(id) : `regulation.${act}:${id}`

async function call(method: 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string> = person, payload?: object) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
}
async function register(role: string) {
  const handle = `made-up-${role}`
  const made = await call('POST', '/api/agents/started', person, { handle, name: `Made-up ${role}`, role })
  expect(made.statusCode, made.body).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const id = agentByHandle(handle)!.id
  return { id, headers: { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-key': makeAnAgentKey(id, null) } }
}
async function answer(value: 'kept' | 'may-press') {
  const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
  setThisOfficesAnswer('record:regulation', value, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
}
async function grant() {
  await answer('may-press')
  const made = await call('POST', '/api/roles/elevation/made-up-secretary', { ...person, ...thePersonsKeyHeader() }, { reason: 'Made-up grant for this test.', endsWhen: 'when you say' })
  expect(made.statusCode, made.body).toBe(201)
}
async function filed(title?: string) {
  const made = await call('POST', '/api/records', person, regulation(title))
  expect(made.statusCode, made.body).toBe(201)
  return made.json().record.id as string
}
async function prepare(act: Act) {
  const id = await filed()
  if (act === 'restore') expect((await call('DELETE', `/api/records/${id}`)).statusCode).toBe(200)
  return id
}
function snapshot() {
  return JSON.stringify(['records', 'changes', 'revisions', 'presses_for_the_person'].map(table => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
}
async function press(act: Act, id: string, who: Record<string, string>, warrant?: Warrant) {
  const extra = { ...(warrant === undefined ? {} : { warrant }), ...(who === person ? {} : FOR_THE_PERSON) }
  return act === 'revoke'
    ? call('PATCH', `/api/records/${id}`, who, { dataPatch: revocation, ...extra })
    : call('POST', `/api/records/${id}/${act === 'move' ? 'workspace' : 'restore'}`, who, { ...(act === 'move' ? { to: 'destination' } : {}), ...extra })
}
async function refused(act: Act, id: string, who: Record<string, string>, warrant?: Warrant) {
  const before = snapshot()
  const reply = await press(act, id, who, warrant)
  expect(reply.statusCode, reply.body).toBe(403)
  expect(snapshot(), 'a refused act wrote to the database').toBe(before)
  return reply
}
function revision(id: string, warrant?: Warrant, granted = false, actorId = secretaryId) {
  const row = t.client.sqlite.prepare('SELECT actor_type, actor_id, warrant, elevation FROM revisions WHERE record_id=? ORDER BY seq DESC LIMIT 1').get(id) as { actor_type: string; actor_id: string; warrant: string | null; elevation: string | null }
  expect(row).toMatchObject({ actor_type: 'agent', actor_id: actorId })
  expect(row.actor_id).not.toBe(THE_TEST_OFFICES_OWNER.id)
  expect(row.warrant === null ? null : JSON.parse(row.warrant)).toEqual(warrant ?? null)
  expect(row.elevation !== null).toBe(granted)
  const changes = t.client.sqlite.prepare('SELECT actor_type,actor_id,warrant FROM changes WHERE record_id=? ORDER BY append_order DESC LIMIT 1').get(id) as { actor_type: string; actor_id: string; warrant: string | null }
  expect(changes).toMatchObject({ actor_type: 'agent', actor_id: actorId })
  expect(changes.warrant === null ? null : JSON.parse(changes.warrant)).toEqual(warrant ?? null)
}

// ONE OFFICE FOR THE FILE, AND THE SAME DATABASE AT THE START OF EVERY CASE. The server modules and
// the app are built once, here. Four things in their memory carry from one case to the next: the
// events ring (lib/events.ts), the key-use memory (lib/keys.ts), the request-log counter
// (lib/usage.ts) and the session cache (lib/records.ts). No assertion here reads any of them.
// The database is copied once the agents, the destination and the answer are in it, and SQLite's
// backup writes that copy back into the same file before each case, so the app keeps its
// connection and no case sees what another case wrote. Until this change every case built its
// own office, which was 0.6 of the 0.7 s a case took.
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const clerk = await register('secretary')
  secretary = clerk.headers; secretaryId = clerk.id
  const madeWorker = await register('worker')
  worker = madeWorker.headers; workerId = madeWorker.id
  expect((await call('POST', '/api/workspaces', person, { id: 'destination', title: 'Made-up destination' })).statusCode).toBe(201)
  await answer('kept')
  const copy = join(dirname(t.file), 'seeded.db')
  await t.client.sqlite.backup(copy)
  seeded = new Database(copy, { readonly: true })
})
beforeEach(async () => { await seeded.backup(t.file) })
afterAll(async () => { await app?.close(); seeded?.close(); t?.close() })

for (const act of ['restore', 'move', 'revoke'] as const) describe(act, () => {
  it('refuses a secretary with no words and no grant, and writes nothing', async () => {
    await refused(act, await prepare(act), secretary)
  })
  it('accepts the secretary’s words for this act at kept and keeps its name and words', async () => {
    const id = await prepare(act), warrant = words(id, binding(act, id))
    const reply = await press(act, id, secretary, warrant)
    expect(reply.statusCode, reply.body).toBe(200)
    const stored = t.api.getRecord(id)!
    if (act === 'restore') expect(stored.deletedAt).toBeNull()
    if (act === 'move') expect(stored.workspaceId).toBe('destination')
    if (act === 'revoke') expect(stored.data).toMatchObject(revocation)
    revision(id, warrant)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM presses_for_the_person').get()).toEqual({ n: 0 })
  })
  for (const raised of [false, true]) {
    for (const wrong of ['another act', 'another record', 'no record id', 'record alone', ...(act === 'move' ? ['another project'] : [])]) {
      it(`refuses words for ${wrong}${raised ? ' even with the grant' : ''} and writes nothing`, async () => {
        const id = await prepare(act)
        if (raised) await grant()
        const warrant = wrong === 'another act' ? words(id, `regulation.delete:${id}`)
          : wrong === 'another record' ? words(id, binding(act, 'another-record'))
          : wrong === 'no record id' ? words(binding(act, id))
          : wrong === 'another project' ? words(id, moveAct(id, 'another-project')) : words(id)
        await refused(act, id, secretary, warrant)
      })
    }
  }
  it('refuses a worker with the right words in the old refusal and writes nothing', async () => {
    const id = await prepare(act)
    const old = await refused(act, id, worker)
    const withWords = await refused(act, id, worker, words(id, binding(act, id)))
    if (act !== 'revoke') expect(withWords.json().error).toBe(old.json().error)
    else expect(withWords.json().error).toContain('revoked_at')
  })
  it(act === 'revoke' ? 'refuses the grant alone at may-press and writes nothing' : 'accepts the grant alone at may-press and records the secretary and grant', async () => {
    const id = await prepare(act)
    await grant()
    if (act === 'revoke') await refused(act, id, secretary)
    else {
      const reply = await press(act, id, secretary)
      expect(reply.statusCode, reply.body).toBe(200)
      revision(id, undefined, true)
    }
  })
})

it('refuses an agent create already revoked, even with words naming a revocation', async () => {
  const body = regulation('Made-up already revoked rule')
  const before = snapshot()
  const reply = await call('POST', '/api/records', secretary, { ...body, data: { ...body.data, ...revocation }, warrant: words(body.title, `regulation.revoke:${body.title}`) })
  expect(reply.statusCode, reply.body).toBe(403)
  expect(snapshot()).toBe(before)
})
it('lets the person revoke a regulation and records the person without words', async () => {
  const id = await filed()
  const reply = await press('revoke', id, person)
  expect(reply.statusCode, reply.body).toBe(200)
  const row = t.client.sqlite.prepare('SELECT actor_type,actor_id,warrant FROM revisions WHERE record_id=? ORDER BY seq DESC LIMIT 1').get(id)
  expect(row).toEqual({ actor_type: 'human', actor_id: THE_TEST_OFFICES_OWNER.id, warrant: null })
})
it('requires separate words for a regulation moving with another record', async () => {
  const id = await filed(), companion = await filed('Made-up companion regulation')
  const linked = await call('POST', '/api/links', person, { fromId: id, toId: companion, type: 'about' })
  expect(linked.statusCode, linked.body).toBe(201)
  const request = (warrant: Warrant) => call('POST', `/api/records/${id}/workspace`, secretary, { to: 'destination', also: [companion], warrant })
  for (const warrant of [words(id, moveAct(id)), words(id, companion, moveAct(id)), words(id, companion, moveAct(id), moveAct(companion, 'another-project')), words(id, moveAct(id), moveAct(companion))]) {
    const before = snapshot()
    const reply = await request(warrant)
    expect(reply.statusCode, reply.body).toBe(403)
    expect(snapshot()).toBe(before)
  }
  const warrant = words(id, companion, moveAct(id), moveAct(companion))
  const reply = await request(warrant)
  expect(reply.statusCode, reply.body).toBe(200)
  for (const moved of [id, companion]) { expect(t.api.getRecord(moved)!.workspaceId).toBe('destination'); revision(moved, warrant) }
})

for (const act of ['write', 'change'] as const) describe(`existing ${act} on any agent’s words`, () => {
  it('accepts words naming this title or record and records the worker and words', async () => {
    const body = regulation(), id = act === 'change' ? await filed() : undefined
    const warrant = words(id ?? body.title)
    const reply = act === 'change'
      ? await call('PATCH', `/api/records/${id}`, worker, { dataPatch: { since: '2026-10-22' }, warrant })
      : await call('POST', '/api/records', worker, { ...body, warrant })
    expect(reply.statusCode, reply.body).toBe(act === 'change' ? 200 : 201)
    revision(id ?? reply.json().record.id, warrant, false, workerId)
  })
  it('refuses words naming another title or record and writes nothing', async () => {
    const id = act === 'change' ? await filed() : undefined, before = snapshot()
    const reply = act === 'change'
      ? await call('PATCH', `/api/records/${id}`, worker, { dataPatch: { since: '2026-10-22' }, warrant: words('another-record') })
      : await call('POST', '/api/records', worker, { ...regulation(), warrant: words('another title') })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(snapshot()).toBe(before)
  })
})
it('keeps deletion refused on the secretary’s words with no grant', async () => {
  const id = await filed(), before = snapshot()
  const reply = await call('DELETE', `/api/records/${id}`, secretary, { warrant: words(id, `regulation.delete:${id}`) })
  expect(reply.statusCode, reply.body).toBe(403)
  expect(snapshot()).toBe(before)
})

it('restores an earlier version as a change on words naming the record and keeps the secretary and words', async () => {
  const id = await filed()
  const changed = await call('PATCH', `/api/records/${id}`, person, { dataPatch: { since: '2026-10-22' } })
  expect(changed.statusCode, changed.body).toBe(200)
  const warrant = words(id)
  const restored = await call('POST', `/api/records/${id}/revisions/1/restore`, secretary, { warrant })
  expect(restored.statusCode, restored.body).toBe(200)
  expect(t.api.getRecord(id)!.data['since']).toBe('2026-10-23')
  revision(id, warrant)
})
for (const carried of [false, true]) it(`refuses an earlier-version restore with ${carried ? 'words for another record' : 'no words and no grant'} and writes nothing`, async () => {
  const id = await filed()
  expect((await call('PATCH', `/api/records/${id}`, person, { dataPatch: { since: '2026-10-22' } })).statusCode).toBe(200)
  const before = snapshot()
  const reply = await call('POST', `/api/records/${id}/revisions/1/restore`, secretary, carried ? { warrant: words('another-record') } : {})
  expect(reply.statusCode, reply.body).toBe(403)
  expect(snapshot()).toBe(before)
})
