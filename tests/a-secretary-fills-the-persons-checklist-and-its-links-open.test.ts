// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY FILLS ITS PERSON'S CHECKLIST, AND AN ITEM'S LINKS OPEN THEIR RECORDS. A decision,
 * from a message, says a secretary has the power to fill the checklist, and a checklist item's links
 * open.
 * Wave 13j round 57.
 *
 * WHICH PERSON A SECRETARY SERVES. The office keeps no person for each secretary: `people.office_owner` holds exactly one
 * row, lib/owner.ts reads it into THE_PERSON, and the agents table has no person column. So a secretary's person is the
 * office's owner, and that is who `forThePerson` names.
 *
 * HOW A SECRETARY SAYS IT. Every press for the person gives its reason, so `forThePerson` is {"reason": "…"}, the field
 * a press under the person's grant carries. lib/for-the-person.ts takes it off the body before the door reads it, and
 * the door reads it on the caller's press.
 *
 * WHAT IS PROVED HERE (every name, title and block is made up):
 *   1. A secretary proved by its own key makes a checklist with "forThePerson": {"reason": "…"}. The person owns it, the
 *      person's own read (the one the checklists window makes) holds it, and its change log names the secretary.
 *   2. The secretary adds an item to that checklist and changes it, and the change log names the secretary each time.
 *   3. An ordinary agent with its own key sends forThePerson with its reason and is refused for not being a secretary,
 *      not for its reason, and nothing is written.
 *   4. A request that names the secretary in its headers and sends no key is refused, and nothing is written.
 *   5. Before anybody has said who owns the office, a secretary's forThePerson is refused, and nothing is written.
 *   6. A reading's `linked` gives each record an item names its title, and a manual section's block its name. A message
 *      the reader may not read has no title there; the person, who reads every message, gets its title.
 *   7. An opened item draws each link as a link that opens the record, with its title, and a manual section with its
 *      block's name.
 *
 * MUTATIONS, each after a green control run (7 passed), then restored (7 passed):
 *   a. `thePersonASecretaryMakesItFor` in src/server/lib/checklists.ts returns the caller: cases 1 and 2 went red.
 *   b. `addAnItem` refuses a caller who is not the checklist's owner: cases 2, 6 and 7 went red.
 *   c. the `theKeyProvesASecretary` refusal in `thePersonASecretaryMakesItFor` is taken out: cases 3 and 4 went red.
 *   d. `readAChecklist` returns `linked: []`: cases 6 and 7 went red.
 *   e. `ItemFacts` in src/web/components/ChecklistParts.tsx draws no links: case 7 went red, alone.
 *   f. the card is read from the headers (`holdsTheSecretaryCard(me)`) instead of the key: case 4 went red, alone.
 *   g. `makeAChecklist` reads no reason on the caller's press, so every checklist is the caller's own: cases 1 to 5
 *      went red, an ordinary agent's among them, which was made with 201 and not refused.
 */

import type { FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ChecklistReading } from '../src/shared/checklists.ts'
import { NOBODY_HAS_SAID, THE_PERSON } from '../src/shared/person.ts'
import { ItemRow } from '../src/web/components/ChecklistParts.tsx'
import { apiApp, FOR_THE_PERSON, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

async function call(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()

/** Register an agent through the starter door with the card named, and keep its registry id and key. */
async function started(handle: string, role: string): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = (r.body['agent'] as { id: string }).id
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}

const asTheSecretary = (): Record<string, string> => asAgent('a-made-up-secretary', agents.get('a-made-up-secretary')!.key)
const asTheWorker = (): Record<string, string> => asAgent('a-made-up-worker', agents.get('a-made-up-worker')!.key)

/** Who each revision of one record names as its writer, oldest first. */
function writers(id: string): { type: string; actor: string; note: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS actor, note FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(id) as { type: string; actor: string; note: string | null }[]
}

function checklistsInTheOffice(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'checklist'").get() as { n: number }).n
}

let manual = ''
let message = ''
let made: ChecklistReading

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('a-made-up-secretary', 'secretary')
  await started('a-made-up-worker', 'worker')
  manual = t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'A made-up experiment manual',
    data: { blocks: [{ id: 'b-1', type: 'text', heading: 'Calibrating the made-up camera', text: 'Made up for this test.' }] },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  // A MESSAGE FROM THE PERSON TO THE SECRETARY ALONE, so the worker may not read it and the person may.
  message = t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'A made-up request to the secretary',
    data: { body: 'Put the manual in my checklist.', to: [{ kind: 'agent', id: agents.get('a-made-up-secretary')!.id }], sentBy: { kind: 'person', id: THE_PERSON } },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a secretary fills its person\'s checklist', () => {
  it('1. a secretary proved by its own key makes a checklist the person owns, and the person reads it as their own', async () => {
    const r = await call('POST', '/api/checklists', asTheSecretary(), { title: 'A made-up checklist for the person', ...FOR_THE_PERSON })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    made = r.body['checklist'] as ChecklistReading
    expect(made.owner).toEqual({ kind: 'person', id: THE_PERSON })
    expect(r.body['says']).toContain(`is made for ${made.ownerName}`)
    expect(r.body['says']).toContain('Its change log names you.')
    // THE CHANGE LOG NAMES THE SECRETARY, not the person and not the office.
    expect(writers(made.id).map(({ type, actor }) => `${type}:${actor}`)).toEqual(['agent:a-made-up-secretary'])
    // THE PERSON'S OWN READ, the one the checklists window at the top right makes, holds it.
    const mine = await call('GET', '/api/checklists', AS_THE_PERSON)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect((mine.body['checklists'] as ChecklistReading[]).map((one) => one.id)).toContain(made.id)
    // AND THE SECRETARY'S OWN READ DOES NOT: it is not the secretary's checklist.
    const theirs = await call('GET', '/api/checklists', asTheSecretary())
    expect((theirs.body['checklists'] as ChecklistReading[]).map((one) => one.id)).not.toContain(made.id)
  })

  it('2. the secretary adds an item to it and changes the item, and the change log names the secretary each time', async () => {
    const added = await call('POST', `/api/checklists/${made.id}/items`, asTheSecretary(), {
      words: 'Read the made-up experiment manual.',
      fromMessage: message,
      links: [manual],
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const changed = await call('PATCH', `/api/checklists/${made.id}/items/${added.body['item'].id as string}`, asTheSecretary(), { state: 'in progress' })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body['checklist'].owner).toEqual({ kind: 'person', id: THE_PERSON })
    expect(writers(made.id).map(({ type, actor }) => `${type}:${actor}`)).toEqual([
      'agent:a-made-up-secretary',
      'agent:a-made-up-secretary',
      'agent:a-made-up-secretary',
    ])
    const mine = await call('GET', '/api/checklists', AS_THE_PERSON)
    const read = (mine.body['checklists'] as ChecklistReading[]).find((one) => one.id === made.id)
    expect(read?.items.map((item) => [item.words, item.state])).toEqual([['Read the made-up experiment manual.', 'in progress']])
  })

  it('3. an ordinary agent with its own key sends forThePerson and is refused, and nothing is written', async () => {
    const before = checklistsInTheOffice()
    const r = await call('POST', '/api/checklists', asTheWorker(), { title: 'A made-up checklist a worker tries', ...FOR_THE_PERSON })
    // REFUSED FOR WHO IT IS, AND NOT FOR ITS REASON, which is well made.
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(JSON.stringify(r.body)).toContain('Only a secretary, proved by its own key, may make a checklist for the person')
    expect(JSON.stringify(r.body)).not.toContain('The reason for the person is not usable')
    expect(checklistsInTheOffice()).toBe(before)
  })

  it('4. a request that names the secretary and sends no key is refused, and nothing is written', async () => {
    const before = checklistsInTheOffice()
    const r = await call('POST', '/api/checklists', asAgent('a-made-up-secretary'), { title: 'A made-up keyless checklist', ...FOR_THE_PERSON })
    expect(r.status, JSON.stringify(r.body)).toBe(403)
    expect(checklistsInTheOffice()).toBe(before)
  })

  it('5. before anybody has said who owns the office, a secretary\'s forThePerson is refused, and nothing is written', async () => {
    const before = checklistsInTheOffice()
    // THE SERVER'S OWN COPY OF THE MODULE: freshDb resets the modules, so the one imported at the top of this file is
    // not the one the server reads. Imported now, after the server, it is.
    const person = await import('../src/shared/person.ts')
    const owner = person.THE_PERSON
    person.theOwnerIsKnown(NOBODY_HAS_SAID)
    try {
      const r = await call('POST', '/api/checklists', asTheSecretary(), { title: 'A made-up checklist for nobody', ...FOR_THE_PERSON })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(JSON.stringify(r.body)).toContain('Nobody has said who owns this office yet')
    } finally {
      person.theOwnerIsKnown(owner)
    }
    expect(checklistsInTheOffice()).toBe(before)
  })
})

describe('an item\'s links open their records', () => {
  let read: ChecklistReading

  it('6. the reading titles every record the items name, names a manual section\'s block, and keeps a message\'s title from a reader who may not read it', async () => {
    const added = await call('POST', `/api/checklists/${made.id}/items`, asTheSecretary(), {
      words: 'Calibrate the made-up camera.',
      links: [message],
      state: 'done',
      evidence: [{ kind: 'manual section', record: manual, block: 'b-1' }],
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const asTheWorkerReads = await call('GET', `/api/checklists/${made.id}`, asTheWorker())
    expect(asTheWorkerReads.status, JSON.stringify(asTheWorkerReads.body)).toBe(200)
    const linked = (asTheWorkerReads.body['checklist'] as ChecklistReading).linked
    expect(linked).toEqual([
      { id: manual, found: true, kind: 'report', title: 'A made-up experiment manual', blocks: [{ id: 'b-1', name: 'Calibrating the made-up camera' }] },
      { id: message, found: false, because: 'no message you may read' },
    ])
    expect(JSON.stringify(asTheWorkerReads.body)).not.toContain('A made-up request to the secretary')
    const asThePersonReads = await call('GET', `/api/checklists/${made.id}`, AS_THE_PERSON)
    read = asThePersonReads.body['checklist'] as ChecklistReading
    expect(read.linked.find((one) => one.id === message)).toEqual({ id: message, found: true, kind: 'message', title: 'A made-up request to the secretary', blocks: [] })
  })

  it('7. an opened item draws each link as a link that opens its record, with its title, and a manual section with its block', () => {
    const [first, second] = read.items
    const anchor = (path: string, words: string): RegExp => new RegExp(`<a href="#${path}"[^>]*>${words}</a>`)
    const one = renderToStaticMarkup(h(ItemRow, { item: first!, list: read }))
    expect(one).toMatch(anchor(`/report/${manual}`, 'A made-up experiment manual'))
    const two = renderToStaticMarkup(h(ItemRow, { item: second!, list: read }))
    expect(two).toMatch(anchor(`/message/${message}`, 'A made-up request to the secretary'))
    expect(two).toMatch(anchor(`/report/${manual}`, 'Manual section: Calibrating the made-up camera, in A made-up experiment manual'))
  })
})
