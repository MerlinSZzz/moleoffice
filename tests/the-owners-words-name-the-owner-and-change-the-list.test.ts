// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A decision: a secretary using its own key may record the owner's name or change what
 * the grant carries on the owner's written words for that exact act. The grant alone carries neither act. The stored
 * naming mark remains named-by-the-person for older servers; the change row names the secretary and keeps the words.
 *
 * Real routes and database in a scratch office; all agents, names and quoted words here are synthetic. Refused writes
 * leave the owner, the list, every change row and every press row untouched. The person's own press still works.
 * MUTATIONS, each alone and restored before the next, 23 October 2026, from mutation-1.log through mutation-6.log:
 *   1. Name removed from the naming act: N3 (both secretaries), N3b and N4 no-name red; 20 of 24 pass.
 *   2. aRaiseCarriesIt lets naming pass before the words line when no warrant: only N2 red; 23 of 24 pass.
 *   3. The list door omits aSecretaryWithItsOwnKey: only L5 red; 23 of 24 pass.
 *   4. The list act omits the changes: L3 (both secretaries) and L4 no-changes red; 21 of 24 pass.
 *   5. The naming change row names the person: N3 (both secretaries) and N3b red; 21 of 24 pass.
 *   6. Naming moved back to the doors that do not ask yet and off the words list: N7 red; the inventory's
 *      no-reached-door-on-the-not-yet-list and words-only-doors-on-the-fixed-list cases red; the card test's
 *      fixed-list pin red. These three files report 4 failed and 55 passed. Every mutation exits 1.
 */
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ONLY_THE_PERSON_NAMES_THEMSELVES } from '../src/shared/owner.ts'
import { THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS, THE_DOORS_THAT_DO_NOT_ASK_YET } from '../src/shared/what-the-grant-carries.ts'

let t: TestDb, app: FastifyInstance
let list: typeof import('../src/server/lib/what-the-grant-carries.ts')
let events: typeof import('../src/server/lib/events.ts')
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const SECRETARY = 'words-clerk', RAISED = 'words-granted-clerk', WORKER = 'words-worker'
const NAME_DOOR = 'office.name-owner', LIST_DOOR = 'office.set-what-the-grant-carries'
const name = 'A made-up owner', language = 'en'
const changes = [{ door: 'office.set-quick-inputs', answer: 'may-press' }, { door: 'office.set-what-is-kept', answer: 'kept' }]
const nameAct = (value = name, lang: string | null = language) => `${NAME_DOOR}:${JSON.stringify({ name: value, language: lang })}`
const listAct = (values = changes) => `${LIST_DOOR}:${JSON.stringify(values)}`
const words = (act: string) => ({ saidBy: THE_PERSON, words: 'Made-up words: record this name and make these changes.', where: 'terminal', when: '2026-10-01 10:00', for: [act] })
const as = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle)! })
const call = (url: string, headers: Record<string, string>, payload: object) => app.inject({ method: 'POST', url, headers, payload })
function rows(sql: string): unknown[] { return t.client.sqlite.prepare(sql).all() }
function state() {
  return { owner: rows('SELECT id, name, office_owner, language FROM people WHERE office_owner IS NOT NULL'), list: rows('SELECT * FROM what_the_grant_carries ORDER BY door'), changes: rows('SELECT * FROM changes ORDER BY append_order'), presses: rows('SELECT * FROM presses_for_the_person ORDER BY rowid') }
}
async function refused(url: string, who: string, payload: object, oldWords?: string) {
  const before = state()
  const reply = await call(url, as(who), payload)
  expect(reply.statusCode, reply.body).toBe(403)
  if (oldWords !== undefined) expect(reply.json().error).toBe(oldWords)
  expect(state()).toEqual(before)
  return reply
}
function audit(setting: string, who: string, warrant?: ReturnType<typeof words>) {
  const found = t.client.sqlite.prepare('SELECT actor_type, actor_id, warrant, elevation, press_id, old_value, new_value FROM changes WHERE record_id=? ORDER BY append_order').all(`setting:${setting}`) as { warrant: string | null }[]
  expect(found).toHaveLength(1)
  expect(found[0]).toMatchObject({ actor_type: who === THE_PERSON ? 'human' : 'agent', actor_id: who, elevation: null, press_id: null })
  if (warrant === undefined) expect(found[0]!.warrant).toBeNull()
  else expect(JSON.parse(found[0]!.warrant!)).toEqual(warrant)
  expect(rows('SELECT * FROM presses_for_the_person')).toEqual([])
  return found[0]
}
async function listRefusal(who: string) {
  const reply = await call('/api/office/what-the-grant-carries', as(who), { changes })
  expect(reply.statusCode, reply.body).toBe(403)
  const error = String(reply.json().error)
  expect(error).toContain('Nothing was changed.')
  return error
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  list = await import('../src/server/lib/what-the-grant-carries.ts')
  events = await import('../src/server/lib/events.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[SECRETARY, 'secretary'], [RAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const made = await call('/api/agents/started', PERSON, { handle, name: handle, role })
    expect(made.statusCode, made.body).toBe(201)
    keys.set(handle, made.json().whatToGiveIt.key)
  }
  const grant = await call(`/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up grant.', endsWhen: 'when you say' })
  expect(grant.statusCode, grant.body).toBe(201)
}, 60_000)
beforeEach(() => {
  // Fixture reset only: every act under test goes through its route.
  t.client.sqlite.prepare("UPDATE people SET name = 'default office owner name', office_owner = 'unnamed', language = NULL WHERE office_owner IS NOT NULL").run()
  t.client.sqlite.prepare('DELETE FROM what_the_grant_carries').run()
  t.client.sqlite.prepare('DELETE FROM changes').run()
  t.client.sqlite.prepare('DELETE FROM presses_for_the_person').run()
  events.forgetTheChannel()
})
afterAll(async () => { await app?.close(); t?.close() })

describe('recording the owner’s name', () => {
  const url = '/api/office/owner'
  it('N1: refuses a secretary without words before reading its other fields', async () => {
    await refused(url, SECRETARY, { name }, ONLY_THE_PERSON_NAMES_THEMSELVES)
    await refused(url, SECRETARY, { wrong: true }, ONLY_THE_PERSON_NAMES_THEMSELVES)
  })
  it('N2: refuses the grant without words even at may-press', async () => {
    list.setThisOfficesAnswer(NAME_DOOR, 'may-press', { type: 'human', id: THE_PERSON })
    await refused(url, RAISED, { name, ...FOR_THE_PERSON }, ONLY_THE_PERSON_NAMES_THEMSELVES)
  })
  it.each([SECRETARY, RAISED])('N3: records the trimmed name on exact words at kept and attributes it to %s', async (who) => {
    list.setThisOfficesAnswer(NAME_DOOR, 'kept', { type: 'human', id: THE_PERSON })
    const warrant = words(nameAct())
    const reply = await call(url, as(who), { name: `  ${name}  `, language, warrant })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json()).toMatchObject({ name, named: true })
    expect(rows('SELECT name, office_owner, language FROM people WHERE office_owner IS NOT NULL')).toEqual([{ name, office_owner: 'named-by-the-person', language }])
    expect(audit('office-owner', who, warrant)).toMatchObject({ old_value: null, new_value: name })
    expect(events.since(0, 'default').events.map((one) => one.event)).toContainEqual(expect.objectContaining({ name: 'list.changed', because: "A secretary recorded the owner's name on the owner's written words." }))
  })
  it('N3b: binds an omitted language as null and leaves the chosen language alone', async () => {
    t.client.sqlite.prepare("UPDATE people SET language='zh' WHERE office_owner IS NOT NULL").run()
    const warrant = words(nameAct(name, null))
    const reply = await call(url, as(SECRETARY), { name, warrant })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(rows('SELECT language FROM people WHERE office_owner IS NOT NULL')).toEqual([{ language: 'zh' }])
    audit('office-owner', SECRETARY, warrant)
  })
  for (const [what, target] of [['another act', listAct()], ['another name', nameAct('Another made-up owner')], ['another language', nameAct(name, 'zh')], ['no name', `${NAME_DOOR}:${JSON.stringify({ language })}`]] as const) {
    it(`N4: refuses words for ${what} and writes nothing`, async () => {
      await refused(url, SECRETARY, { name, language, warrant: words(target) })
    })
  }
  it('N5: refuses a worker carrying exact words in the old words before reading other fields', async () => {
    await refused(url, WORKER, { name, language, warrant: words(nameAct()) }, ONLY_THE_PERSON_NAMES_THEMSELVES)
    await refused(url, WORKER, { warrant: words(nameAct()) }, ONLY_THE_PERSON_NAMES_THEMSELVES)
  })
  it('N6: keeps the person’s own press and announcement', async () => {
    const reply = await call(url, PERSON, { name, language })
    expect(reply.statusCode, reply.body).toBe(200)
    audit('office-owner', THE_PERSON)
    expect(events.since(0, 'default').events.map((one) => one.event)).toContainEqual(expect.objectContaining({ name: 'list.changed', because: "The office's owner gave their name." }))
  })
  it('N7: the inventory says naming asks the check and always needs written words', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/office/what-the-grant-carries', headers: PERSON })
    expect(read.json().doors.find((one: { door: string }) => one.door === NAME_DOOR)).toMatchObject({ asksTheCheck: true, alsoNeedsThePersonsWords: true })
    expect(THE_DOORS_THAT_DO_NOT_ASK_YET).not.toContain(NAME_DOOR)
    expect(THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS).toContain(NAME_DOOR)
  })
})

describe('changing what the grant carries', () => {
  const url = '/api/office/what-the-grant-carries'
  it('L1: refuses a secretary without words and reads the same refusal with the words path explained', async () => {
    const old = await listRefusal(SECRETARY)
    await refused(url, SECRETARY, { changes }, old)
    await refused(url, SECRETARY, { wrong: true }, old)
    const read = await app.inject({ method: 'GET', url, headers: as(SECRETARY) })
    expect(read.json().refusal).toBe(old.replace('Nothing was changed. ', ''))
    expect(read.json().refusal).toContain("person's written words naming this change")
    expect(read.json().refusal).toContain('secretary')
  })
  it('L2: refuses the grant without words even with a may-press row', async () => {
    // The list never names its own write door. Even a stale row cannot make the grant change itself.
    list.setThisOfficesAnswer(LIST_DOOR, 'may-press', { type: 'human', id: THE_PERSON })
    const old = await listRefusal(RAISED)
    await refused(url, RAISED, { changes, ...FOR_THE_PERSON }, old)
  })
  it.each([SECRETARY, RAISED])('L3: exact words change all answers and keep %s and its warrant on the audit', async (who) => {
    const warrant = words(listAct())
    const reply = await call(url, as(who), { changes, warrant })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json().changed).toEqual(changes.map((one) => ({ door: one.door, before: null, after: one.answer })))
    expect(rows('SELECT door, answer, updated_by_kind, updated_by_id FROM what_the_grant_carries ORDER BY door')).toEqual(changes.map((one) => ({ ...one, updated_by_kind: 'agent', updated_by_id: who })))
    expect(audit('what-the-grant-carries', who, warrant)).toMatchObject({ old_value: JSON.stringify(Object.fromEntries(changes.map((one) => [one.door, 'default']))), new_value: JSON.stringify(Object.fromEntries(changes.map((one) => [one.door, one.answer]))) })
  })
  for (const [what, target] of [['another act', nameAct()], ['another answer', listAct([{ door: changes[0]!.door, answer: 'kept' }, changes[1]!])], ['another door', listAct([{ door: NAME_DOOR, answer: 'may-press' }, changes[1]!])], ['another order', listAct([...changes].reverse())], ['no changes', LIST_DOOR]] as const) {
    it(`L4: refuses words for ${what} and writes nothing`, async () => {
      await refused(url, SECRETARY, { changes, warrant: words(target) })
    })
  }
  it('L5: refuses a worker carrying exact words in the old words before reading other fields', async () => {
    const old = await listRefusal(WORKER)
    await refused(url, WORKER, { changes, warrant: words(listAct()) }, old)
    await refused(url, WORKER, { warrant: words(listAct()) }, old)
  })
  it('L6: keeps the person’s own press and gives it no read refusal', async () => {
    const reply = await call(url, PERSON, { changes })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(reply.json().refusal).toBeNull()
    audit('what-the-grant-carries', THE_PERSON)
    expect((await app.inject({ method: 'GET', url, headers: PERSON })).json().refusal).toBeNull()
  })
  it('L7: agreeing to a request remains the person’s own press with its own truthful refusal', async () => {
    const made = await call('/api/one-press', as(WORKER), { act: 'change-what-the-grant-carries', inputs: { changes }, because: 'A made-up request.' })
    expect(made.statusCode, made.body).toBe(201)
    const id = made.json().request.id
    const before = state()
    const reply = await call(`/api/one-press/${id}/agree`, as(RAISED), FOR_THE_PERSON)
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.json().error).toContain("Only the person may agree to this request, pressing Agree themselves.")
    expect(reply.json().error).not.toContain('written words')
    expect(state()).toEqual(before)
    expect((await app.inject({ method: 'GET', url: `/api/one-press/${id}`, headers: PERSON })).json().request.state).toBe('waiting')
    const smuggled = await call('/api/one-press', as(WORKER), { act: 'change-what-the-grant-carries', inputs: { changes, warrant: words(listAct()) }, because: 'A made-up request.' })
    expect(smuggled.statusCode, smuggled.body).toBe(400)
  })
})
