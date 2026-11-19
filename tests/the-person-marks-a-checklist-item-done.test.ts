// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S OWN PRESS OR WORDS MARK A CHECKLIST ITEM DONE, AND THE OFFICE TELLS WHOEVER ADDED IT. It is a decision
 * sent in message vTlootllRM0Z in wave 13j, line "supervisors run their own work", round loop-5, item 0, parts c and
 * d:
 *
 *   - the person marks an item done with a press, or with one sentence of the person's that names it, and no further
 *     evidence is asked of the person; evidence stays required for an agent's "done";
 *   - when the person's sentence is read as naming an item, the office shows back which item it was taken to name
 *     (invariant 8);
 *   - when the person marks an item done, the office tells whoever added the item, by itself, or the agents the item
 *     names to tell instead or as well, in one message ("One message can already reach several agents, so use that").
 *
 * Cases:
 *   1. The person's press stores "done" with no evidence, and tells the agent that added the item. An agent's "done"
 *      with no evidence is still refused, and writes nothing.
 *   2. `tell` names the agents told, in place of the adder or beside it, and one message reaches all of them.
 *   3. An item nobody recorded the adder of tells nobody, and the reply says so; so does an item the person added.
 *   4. An agent marks an item done on the person's words: the office keeps which message, tells the adder, and, since
 *      17 October 2026, sends the person one short line beside that message naming the item, as two decisions
 *      have it. The old line that showed the person and the agent which item
 *      the words were read as is gone.
 *      A message that is not the person's, or that the agent may not read, is refused, and so is the person's message
 *      sent without "done".
 *   5. An item that must be in the manual is done by the person's press with no manual section.
 *   6. An item opened again loses the person's mark.
 *   7. The person's raise carries the press for a secretary, and the item and the change log say so.
 *   8. The office writes who added an item and the person's mark; a body that sends either is refused.
 *   9. The owner's own written words ride the press that marks the item done. They are kept exactly as written,
 *      leading and trailing whitespace included, and read back whole; the same notice carries them whole; only the
 *      checklist's own owner writes them; a write carrying them needs the version the checklist had when it was read
 *      (each refusal names its code and writes nothing); a press with a version the checklist no longer has is refused
 *      checklistChangedSinceRead; and opening the item again takes them away with the mark.
 *
 * WHAT IS REAL: a scratch office with a real listener, the key window closed with the person's key, as the live office's
 * is, so the person is proved by a key and an agent is not the person. Every agent, checklist, message and key here is
 * made up. Chapter 8 rule 3: the person is acted as only inside this throwaway office.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const AS_THE_PERSON = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const THE_PERSON_REF = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
const SECRETARY = `${THE_TEST_OFFICES_SECRETARY.handle}-vale`

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : JSON.stringify(read) }
}

function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

const agent = (handle: string): { kind: string; id: string } => ({ kind: 'agent', id: ids.get(handle) ?? '' })

async function versionOf(list: string): Promise<string> {
  const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
  expect(read.status, read.error).toBe(200)
  return read.body['checklist'].version as string
}

async function anItem(list: string, by: Record<string, string>, body: Record<string, unknown>): Promise<string> {
  const added = await ask('POST', `/api/checklists/${list}/items`, by, body)
  expect(added.status, added.error).toBe(201)
  return added.body['item'].id as string
}

/** The lines Mole Office wrote, newest last, as stored. */
function officeLines(): { id: string; to: { kind: string; id: string }[]; notice?: string; saidInFull?: string; body: string; aboutMessage?: string }[] {
  return (
    t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) ORDER BY rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, ...(JSON.parse(row.data) as Record<string, any>) })) as never
}

function linesOfKind(kind: string): ReturnType<typeof officeLines> {
  return officeLines().filter((line) => line.notice === kind)
}

/** A message the person sends to one agent, through the ordinary door, with the person's key. */
async function thePersonSays(handle: string, body: string): Promise<string> {
  const sent = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: body, data: { body, to: [agent(handle)] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.status, sent.error).toBe(409)
  return sent.body['record'].id as string
}

let list = ''

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [
    ['lark', 'Lark', 'worker'],
    ['quill', 'Quill', 'worker'],
    ['gauge', 'Gauge', 'worker'],
    [SECRETARY, `${THE_TEST_OFFICES_SECRETARY.name} Vale`, 'secretary'],
  ] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', AS_THE_PERSON)
  expect(closed.status, closed.error).toBe(200)
  const made = await ask('POST', '/api/checklists', AS_THE_PERSON, { title: 'Kiln checklist' })
  expect(made.status, made.error).toBe(201)
  list = made.body['checklist'].id as string
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the person's own press or words mark an item done, and the office tells whoever added it", () => {
  it("1. the person's press stores done with no evidence and tells the adder; an agent's done with no evidence is still refused", async () => {
    const item = await anItem(list, as('lark'), { words: 'Fire the test tiles' })
    const before = await versionOf(list)
    const refused = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { state: 'done' })
    expect(refused.status, refused.error).toBe(400)
    expect(refused.error).toContain('is "done" with no evidence')
    expect(await versionOf(list), 'an agent refused writes nothing').toBe(before)
    expect(linesOfKind('thePersonMarkedAnItemDone')).toEqual([])

    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done' })
    expect(done.status, done.error).toBe(200)
    const stored = done.body['item']
    expect(stored.state).toBe('done')
    expect(stored.evidence).toBeUndefined()
    expect(stored.addedBy).toEqual(agent('lark'))
    expect(stored.doneByThePerson).toMatchObject({ by: THE_PERSON_REF, told: [agent('lark')] })
    expect(stored.doneByThePerson.onThePersonsWords).toBeUndefined()
    expect(stored.doneByThePerson.underTheRaise).toBeUndefined()
    expect(done.body['says']).toContain('The office told Lark')

    const told = linesOfKind('thePersonMarkedAnItemDone')
    expect(told).toHaveLength(1)
    expect(told[0]!.id).toBe(stored.doneByThePerson.notice)
    expect(told[0]!.to).toEqual([agent('lark')])
    expect(told[0]!.saidInFull).toContain('Fire the test tiles')
    expect(told[0]!.saidInFull).toContain('Kiln checklist')
  })

  it('2. tell names the agents told, in place of the adder or beside it, and one message reaches every one', async () => {
    const instead = await anItem(list, as('lark'), { words: 'Sweep the kiln shelf', tell: ['quill', 'gauge'] })
    const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
    expect(read.body['checklist'].items.find((one: { id: string }) => one.id === instead).tell).toEqual([agent('quill'), agent('gauge')])
    const linesBefore = linesOfKind('thePersonMarkedAnItemDone').length
    const one = await ask('PATCH', `/api/checklists/${list}/items/${instead}`, AS_THE_PERSON, { state: 'done' })
    expect(one.status, one.error).toBe(200)
    expect(one.body['item'].doneByThePerson.told).toEqual([agent('quill'), agent('gauge')])
    const first = linesOfKind('thePersonMarkedAnItemDone').slice(linesBefore)
    expect(first, 'one message, to the two it names and not to the adder').toHaveLength(1)
    expect(first[0]!.to).toEqual([agent('quill'), agent('gauge')])

    const beside = await anItem(list, as('lark'), { words: 'Weigh the glaze', tell: ['lark', 'quill', 'gauge'] })
    const two = await ask('PATCH', `/api/checklists/${list}/items/${beside}`, AS_THE_PERSON, { state: 'done' })
    expect(two.status, two.error).toBe(200)
    const second = linesOfKind('thePersonMarkedAnItemDone').slice(linesBefore + 1)
    expect(second, 'one message reaches three agents').toHaveLength(1)
    expect(second[0]!.to).toEqual([agent('lark'), agent('quill'), agent('gauge')])

    const before = await versionOf(list)
    const aPerson = await ask('POST', `/api/checklists/${list}/items`, as('lark'), { words: 'Tell the person', tell: [`person:${THE_TEST_OFFICES_OWNER.id}`] })
    expect(aPerson.status, aPerson.error).toBe(400)
    const nobody = await ask('POST', `/api/checklists/${list}/items`, as('lark'), { words: 'Tell nobody known', tell: ['no-such-agent'] })
    expect(nobody.status, nobody.error).toBe(404)
    expect(await versionOf(list), 'a refused tell writes nothing').toBe(before)
  })

  it('3. an item nobody recorded the adder of tells nobody, and says so; so does an item the person added', async () => {
    const old = await anItem(list, as('lark'), { words: 'Label the old shelf' })
    // AN ITEM WRITTEN BEFORE THE OFFICE KEPT WHO ADDED IT, made here by taking the field out of the stored row.
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(list) as { data: string }
    const data = JSON.parse(row.data) as { items: Record<string, unknown>[] }
    for (const one of data.items) if (one['id'] === old) delete one['addedBy']
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), list)
    const linesBefore = officeLines().length

    const unrecorded = await ask('PATCH', `/api/checklists/${list}/items/${old}`, AS_THE_PERSON, { state: 'done' })
    expect(unrecorded.status, unrecorded.error).toBe(200)
    expect(unrecorded.body['item'].doneByThePerson.told).toEqual([])
    expect(unrecorded.body['item'].doneByThePerson.notice).toBeUndefined()
    expect(unrecorded.body['says']).toContain('Nobody recorded who added this item')

    const own = await anItem(list, AS_THE_PERSON, { words: 'Buy more cones' })
    const ownDone = await ask('PATCH', `/api/checklists/${list}/items/${own}`, AS_THE_PERSON, { state: 'done' })
    expect(ownDone.status, ownDone.error).toBe(200)
    expect(ownDone.body['item'].addedBy).toEqual(THE_PERSON_REF)
    expect(ownDone.body['item'].doneByThePerson.told).toEqual([])
    expect(ownDone.body['says']).toContain('nobody was told')
    expect(officeLines().length, 'nobody told is no message').toBe(linesBefore)
  })

  it("4. an agent marks it done on the person's words; the office keeps which message, tells the adder and shows back which item", async () => {
    const item = await anItem(list, as('gauge'), { words: 'Glaze the second batch' })
    const words = await thePersonSays('lark', 'The second batch is glazed, tick it off.')
    const before = await versionOf(list)

    const withoutDone = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), { onThePersonsWords: words })
    expect(withoutDone.status, withoutDone.error).toBe(400)
    const own = await ask('POST', '/api/records', as('lark'), { kind: 'message', title: 'Mine', data: { body: 'I say it is glazed.', to: [THE_PERSON_REF] } })
    expect(own.status, own.error).toBe(201)
    const notThePersons = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), { state: 'done', onThePersonsWords: own.body['record'].id })
    expect(notThePersons.status, notThePersons.error).toBe(403)
    expect(notThePersons.error).toContain("not the person's own words")
    const notReadable = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { state: 'done', onThePersonsWords: words })
    expect(notReadable.status, notReadable.error).toBe(404)
    expect(await versionOf(list), 'each refusal writes nothing').toBe(before)

    const linesBefore = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), { state: 'done', onThePersonsWords: words })
    expect(done.status, done.error).toBe(200)
    expect(done.body['item'].doneByThePerson).toMatchObject({ by: agent('lark'), onThePersonsWords: words, told: [agent('gauge')] })
    expect(done.body['says']).toContain('Glaze the second batch')
    const written = officeLines().slice(linesBefore)
    const shown = written.filter((line) => line.notice === 'markedDoneOnAChecklist')
    expect(shown, 'one line tells the person the item was marked done').toHaveLength(1)
    expect(shown[0]!.to).toEqual([THE_PERSON_REF])
    expect(shown[0]!.aboutMessage).toBe(words)
    expect(shown[0]!.body).toBe('Marked done on your checklist: «Glaze the second batch»')
    expect(shown[0]!.saidInFull).toBeUndefined()
    expect(written.filter((line) => line.notice === 'theOfficeReadThePersonsWordsAsAnItem'), 'the old line is gone').toEqual([])
    const told = written.filter((line) => line.notice === 'thePersonMarkedAnItemDone')
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([agent('gauge')])
  })

  it("5. an item that must be in the manual is done by the person's press with no manual section", async () => {
    const item = await anItem(list, as('lark'), { words: 'Write the firing curve in my manual', mustBeInManual: true })
    const refused = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), { state: 'done' })
    expect(refused.status, refused.error).toBe(400)
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done' })
    expect(done.status, done.error).toBe(200)
    expect(done.body['item'].state).toBe('done')
  })

  it("6. an item opened again loses the person's mark", async () => {
    const item = await anItem(list, as('lark'), { words: 'Clean the kiln wash' })
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done' })
    expect(done.status, done.error).toBe(200)
    const opened = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), { state: 'open' })
    expect(opened.status, opened.error).toBe(200)
    expect(opened.body['item'].doneByThePerson).toBeUndefined()
  })

  it("7. the person's raise carries the press for a secretary, and the item and the change log say so", async () => {
    const item = await anItem(list, as('lark'), { words: 'Order the kiln posts' })
    const unraised = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as(SECRETARY), { state: 'done' })
    expect(unraised.status, unraised.error).toBe(400)
    const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, AS_THE_PERSON, { reason: 'Tick items for me' })
    expect(pressed.status, pressed.error).toBe(201)
    try {
      const raised = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as(SECRETARY), { ...FOR_THE_PERSON, state: 'done' })
      expect(raised.status, raised.error).toBe(200)
      expect(raised.body['item'].doneByThePerson).toMatchObject({ by: agent(SECRETARY), underTheRaise: true, told: [agent('lark')] })
      const row = t.client.sqlite
        .prepare('SELECT elevation FROM changes WHERE record_id = ? AND actor_id = ? ORDER BY rowid DESC LIMIT 1')
        .get(list, SECRETARY) as { elevation: string | null } | undefined
      expect(row?.elevation ?? null, 'the change log names the raise').not.toBeNull()
    } finally {
      await ask('DELETE', `/api/roles/elevation/${SECRETARY}`, AS_THE_PERSON)
    }
  })

  it("8. the office writes who added an item and the person's mark; a body that sends either is refused", async () => {
    const before = await versionOf(list)
    const added = await ask('POST', `/api/checklists/${list}/items`, as('lark'), { words: 'Claim to be Quill', addedBy: agent('quill') })
    expect(added.status, added.error).toBe(400)
    const item = await anItem(list, as('lark'), { words: 'Stack the bricks' })
    const middle = await versionOf(list)
    expect(middle).not.toBe(before)
    const marked = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('lark'), {
      state: 'done',
      doneByThePerson: { at: '2026-10-13 12:00:00', by: THE_PERSON_REF, told: [] },
    })
    expect(marked.status, marked.error).toBe(400)
    expect(await versionOf(list), 'a refused body writes nothing').toBe(middle)
  })

  it("9. the owner's own written words ride the press that marks the item done, and the notice carries them whole", async () => {
    const item = await anItem(list, as('lark'), { words: 'Paint the kiln door' })
    // KEPT EXACTLY AS WRITTEN, leading and trailing whitespace included, and with a line break and quotes, so
    // "whole" is a thing the test can tell from a cut or a trim.
    const passage = '  The door is painted.\nIt took two coats, and I used the "kiln red" tin.\nDry by Friday.  \n'
    const before = await versionOf(list)

    // A RESPONSE COMES ONLY FROM THE CHECKLIST'S OWN OWNER, AND ONLY WITH THE DONE PRESS AND THE VERSION READ.
    const byAnAgent = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { state: 'done', response: passage })
    expect(byAnAgent.status, byAnAgent.error).toBe(403)
    expect(byAnAgent.body['code']).toBe('checklistOwnWordsNotTheOwner')
    expect(await versionOf(list), 'a refused writer writes nothing').toBe(before)
    const withoutDone = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { response: passage, ifVersion: before })
    expect(withoutDone.status, withoutDone.error).toBe(400)
    expect(withoutDone.body['code']).toBe('checklistOwnWordsNeedTheDonePress')
    expect(await versionOf(list), 'a response without the done press writes nothing').toBe(before)
    const withoutVersion = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done', response: passage })
    expect(withoutVersion.status, withoutVersion.error).toBe(400)
    expect(withoutVersion.body['code']).toBe('checklistOwnWordsNeedTheVersion')
    expect(await versionOf(list), 'a response without the version writes nothing').toBe(before)
    const stale = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done', response: passage, ifVersion: 'a-version-it-never-had' })
    expect(stale.status, stale.error).toBe(409)
    expect(stale.body['code']).toBe('checklistChangedSinceRead')
    expect(await versionOf(list), 'a stale press writes nothing and moves no version').toBe(before)

    const linesBefore = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done', response: passage, ifVersion: before })
    expect(done.status, done.error).toBe(200)
    expect(done.body['item'].response).toBe(passage)
    const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
    expect(read.body['checklist'].items.find((one: { id: string }) => one.id === item).response).toBe(passage)

    // THE SAME NOTICE THE ITEM'S AGENT ALREADY GETS, WITH THE WORDS WHOLE AND THE ITEM'S OWN WORDS BESIDE THEM.
    const told = officeLines().slice(linesBefore).filter((line) => line.notice === 'thePersonMarkedAnItemDone')
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([agent('lark')])
    expect(told[0]!.saidInFull).toContain(passage)
    expect(told[0]!.saidInFull).toContain('Paint the kiln door')
    expect(officeLines().slice(linesBefore).filter((line) => line.notice !== 'thePersonMarkedAnItemDone'), 'no other line is written').toEqual([])

    // OPENING IT AGAIN TAKES THE WORDS AWAY WITH THE MARK.
    const opened = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'open' })
    expect(opened.status, opened.error).toBe(200)
    expect(opened.body['item'].response).toBeUndefined()
  })
})
