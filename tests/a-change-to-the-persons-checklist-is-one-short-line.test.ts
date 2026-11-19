// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH CHANGE TO THE PERSON'S CHECKLIST SENDS THE PERSON ONE SHORT LINE. Two decisions say: every item
 * added to, removed from, changed on or marked done on a checklist of the person's sends the person one
 * notice; the notice is one short line saying what happened to what; the line "Read as a checklist item"
 * goes. The secretary read the decisions in messages ksOJfkcMchTs
 * and 3raj5zvJvZ5S.
 *
 * WHAT IS PROVED (every name, title, message and key here is made up):
 *   1. An agent adds an item to the person's checklist: one "Added" line to the person alone.
 *   2. An agent changes the item's words, and makes another standing: one "Changed" line each.
 *   3. An agent marks an item done with evidence: one "Marked done" line, and no "Changed" line.
 *   4. An agent sets an item superseded: one "Removed" line.
 *   5. An agent marks the person's item done on the person's words: one "Marked done" line to the person beside that
 *      message, the told agents keep their own line, and the old "Read as a checklist item" line is gone.
 *   6. The same on the agent's own checklist: one line, naming whose checklist.
 *   7. The person's own press sends the person nothing, while the told agents are still told.
 *   8. Changes to an agent's own checklist send the person nothing.
 *   9. Item words longer than 40 characters are cut at 40, and a line break becomes one space.
 *  10. A secretary makes a checklist for the person: one line for three items, "1 item" for one, and none for an
 *      empty one until an item is added.
 *  11. A refused write sends no line.
 *  12. A change to the checklist's title or label sends no line.
 *
 * WHAT IS REAL: a scratch office with a real listener, the key window closed with the person's key, as the live office's
 * is, so the person is proved by a key and an agent is not the person. Chapter 8 rule 3: the person is acted as only
 * inside this throwaway office.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, FOR_THE_PERSON, freshDb, type TestDb } from './helpers.ts'
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

/** The office lines written since `before`, newest last. */
function linesSince(before: number): ReturnType<typeof officeLines> {
  return officeLines().slice(before)
}

/** A message the person sends to one agent, through the ordinary door, with the person's key. */
async function thePersonSays(handle: string, body: string): Promise<string> {
  const sent = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: body, data: { body, to: [agent(handle)] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.status, sent.error).toBe(409)
  return sent.body['record'].id as string
}

/** The words as one line, cut at 40 characters the way the office cuts them. */
function theCutOf(words: string): string {
  const oneLine = words.replace(/\s+/g, ' ').trim()
  const characters = Array.from(oneLine)
  return characters.length <= 40 ? oneLine : `${characters.slice(0, 39).join('')}…`
}

let list = ''
let own = ''

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
    ['quill', 'Quill', 'worker'],
    ['lark', 'Lark', 'worker'],
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
  // AN AGENT'S OWN CHECKLIST, which the person does not own.
  const theirs = await ask('POST', '/api/checklists', as('quill'), { title: "Quill's bench" })
  expect(theirs.status, theirs.error).toBe(201)
  own = theirs.body['checklist'].id as string
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("each change to the person's checklist sends the person one short line", () => {
  it('1. an agent adds an item: one "Added" line to the person alone', async () => {
    const before = officeLines().length
    const added = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words: 'Glaze the second batch' })
    expect(added.status, added.error).toBe(201)
    const lines = linesSince(before)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([THE_PERSON_REF])
    expect(lines[0]!.notice).toBe('addedToYourChecklist')
    expect(lines[0]!.body).toBe('Added to your checklist: «Glaze the second batch»')
    expect(lines[0]!.saidInFull).toBeUndefined()
    expect(lines[0]!.aboutMessage).toBeUndefined()
  })

  it('2. an agent changes the words, and makes an item standing: one "Changed" line each', async () => {
    const item = await anItem(list, as('quill'), { words: 'Sweep the kiln shelf' })
    const beforeWords = officeLines().length
    const changed = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { words: 'Sweep the kiln shelf twice' })
    expect(changed.status, changed.error).toBe(200)
    const words = linesSince(beforeWords)
    expect(words).toHaveLength(1)
    expect(words[0]!.to).toEqual([THE_PERSON_REF])
    expect(words[0]!.notice).toBe('changedOnYourChecklist')
    expect(words[0]!.body).toBe('Changed on your checklist: «Sweep the kiln shelf twice»')
    expect(words[0]!.saidInFull).toBeUndefined()
    expect(words[0]!.aboutMessage).toBeUndefined()

    const standing = await anItem(list, as('quill'), { words: 'Read the firing log every morning' })
    const beforeStanding = officeLines().length
    const stood = await ask('PATCH', `/api/checklists/${list}/items/${standing}`, as('quill'), { standing: true })
    expect(stood.status, stood.error).toBe(200)
    const line = linesSince(beforeStanding)
    expect(line).toHaveLength(1)
    expect(line[0]!.notice).toBe('changedOnYourChecklist')
    expect(line[0]!.body).toBe('Changed on your checklist: «Read the firing log every morning»')
  })

  it('3. an agent marks an item done with evidence: one "Marked done" line and no "Changed" line', async () => {
    const item = await anItem(list, as('quill'), { words: 'Fire the test tiles' })
    const before = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), {
      state: 'done',
      addEvidence: [{ kind: 'commit', commit: '9c0612d44' }],
    })
    expect(done.status, done.error).toBe(200)
    const lines = linesSince(before)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([THE_PERSON_REF])
    expect(lines[0]!.notice).toBe('markedDoneOnAChecklist')
    expect(lines[0]!.body).toBe('Marked done on your checklist: «Fire the test tiles»')
    expect(lines[0]!.saidInFull).toBeUndefined()
    expect(lines[0]!.aboutMessage).toBeUndefined()
    expect(lines.filter((line) => line.notice === 'changedOnYourChecklist')).toEqual([])
  })

  it('4. an agent sets an item superseded: one "Removed" line', async () => {
    const item = await anItem(list, as('quill'), { words: 'Buy the old glaze' })
    const later = await thePersonSays('quill', 'We use the new glaze now.')
    const before = officeLines().length
    const removed = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), {
      state: 'superseded',
      supersededBy: later,
    })
    expect(removed.status, removed.error).toBe(200)
    const lines = linesSince(before)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([THE_PERSON_REF])
    expect(lines[0]!.notice).toBe('removedFromYourChecklist')
    expect(lines[0]!.body).toBe('Removed from your checklist: «Buy the old glaze»')
    expect(lines[0]!.saidInFull).toBeUndefined()
    expect(lines[0]!.aboutMessage).toBeUndefined()
  })

  it("5. an agent marks the person's item done on the person's words: one line beside that message, and the old line is gone", async () => {
    const item = await anItem(list, as('gauge'), { words: 'Glaze the second batch' })
    const words = await thePersonSays('quill', 'The second batch is glazed, tick it off.')
    const before = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { state: 'done', onThePersonsWords: words })
    expect(done.status, done.error).toBe(200)
    expect(done.body['says']).toContain('Glaze the second batch')

    const lines = linesSince(before)
    const shown = lines.filter((line) => line.notice === 'markedDoneOnAChecklist')
    expect(shown, 'one line tells the person the item was marked done').toHaveLength(1)
    expect(shown[0]!.to).toEqual([THE_PERSON_REF])
    expect(shown[0]!.body).toBe('Marked done on your checklist: «Glaze the second batch»')
    expect(shown[0]!.aboutMessage).toBe(words)
    expect(shown[0]!.saidInFull).toBeUndefined()
    expect(lines.filter((line) => line.to.some((to) => to.kind === 'agent' && to.id === agent('quill').id)), 'no line from this write reaches quill').toEqual([])

    const told = lines.filter((line) => line.notice === 'thePersonMarkedAnItemDone')
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([agent('gauge')])
    expect(linesOfKind('theOfficeReadThePersonsWordsAsAnItem'), 'the old line is gone').toEqual([])
  })

  it("6. an agent marks its own item done on the person's words: one line naming whose checklist", async () => {
    const item = await anItem(own, as('quill'), { words: 'Oil the bench' })
    const words = await thePersonSays('quill', 'The bench is oiled, tick it off.')
    const before = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${own}/items/${item}`, as('quill'), { state: 'done', onThePersonsWords: words })
    expect(done.status, done.error).toBe(200)
    const lines = linesSince(before)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.to).toEqual([THE_PERSON_REF])
    expect(lines[0]!.notice).toBe('markedDoneOnAChecklist')
    expect(lines[0]!.body).toBe("Marked done on Quill's checklist: «Oil the bench»")
    expect(lines[0]!.aboutMessage).toBe(words)
    expect(lines[0]!.saidInFull).toBeUndefined()
  })

  it("7. the person's own press sends the person nothing, and the told agents are still told", async () => {
    const item = await anItem(list, as('quill'), { words: 'Stack the fired tiles' })
    const beforeDone = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${list}/items/${item}`, AS_THE_PERSON, { state: 'done' })
    expect(done.status, done.error).toBe(200)
    const afterDone = linesSince(beforeDone)
    expect(afterDone.filter((line) => line.to.some((to) => to.id === THE_TEST_OFFICES_OWNER.id && to.kind === 'person'))).toEqual([])
    const told = afterDone.filter((line) => line.notice === 'thePersonMarkedAnItemDone')
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([agent('quill')])

    const other = await anItem(list, as('quill'), { words: 'Open the damper every morning' })
    const beforeStanding = officeLines().length
    const stood = await ask('PATCH', `/api/checklists/${list}/items/${other}`, AS_THE_PERSON, { standing: true })
    expect(stood.status, stood.error).toBe(200)
    expect(linesSince(beforeStanding)).toEqual([])
  })

  it("8. changes to an agent's own checklist send the person nothing", async () => {
    const before = officeLines().length
    const item = await anItem(own, as('lark'), { words: 'Sweep the floor' })
    const changed = await ask('PATCH', `/api/checklists/${own}/items/${item}`, as('lark'), { words: 'Sweep the floor twice' })
    expect(changed.status, changed.error).toBe(200)
    const done = await ask('PATCH', `/api/checklists/${own}/items/${item}`, as('lark'), {
      state: 'done',
      addEvidence: [{ kind: 'commit', commit: 'abcdef1' }],
    })
    expect(done.status, done.error).toBe(200)
    const later = await thePersonSays('lark', 'The old floor note is out of date.')
    const next = await anItem(own, as('lark'), { words: 'Paint the bench' })
    const removed = await ask('PATCH', `/api/checklists/${own}/items/${next}`, as('lark'), { state: 'superseded', supersededBy: later })
    expect(removed.status, removed.error).toBe(200)
    expect(linesSince(before), 'no line to the person').toEqual([])
  })

  it('9. long words are cut at 40 characters, and a line break becomes one space', async () => {
    const words = 'A made-up item about the kiln shelf and its second glaze, which runs long\nacross two lines'
    const before = officeLines().length
    const added = await ask('POST', `/api/checklists/${list}/items`, as('quill'), { words })
    expect(added.status, added.error).toBe(201)
    const lines = linesSince(before)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.notice).toBe('addedToYourChecklist')
    const cut = /^Added to your checklist: «(.*)»$/.exec(lines[0]!.body)?.[1]
    expect(cut, lines[0]!.body).toBeDefined()
    expect(Array.from(cut!)).toHaveLength(40)
    expect(cut).toBe(theCutOf(words))
    expect(cut!.endsWith('…')).toBe(true)
    expect(cut).toBe(`${Array.from(words.replace(/\s+/g, ' ').trim()).slice(0, 39).join('')}…`)
  })

  it('10. a checklist made for the person is one line, and an empty one sends nothing until its first item', async () => {
    const beforeThree = officeLines().length
    const three = await ask('POST', '/api/checklists', as(SECRETARY), {
      title: 'Studio move',
      ...FOR_THE_PERSON,
      items: [{ words: 'Pack the moulds' }, { words: 'Label the crates' }, { words: 'Book the van' }],
    })
    expect(three.status, three.error).toBe(201)
    const threeLines = linesSince(beforeThree)
    expect(threeLines).toHaveLength(1)
    expect(threeLines[0]!.to).toEqual([THE_PERSON_REF])
    expect(threeLines[0]!.notice).toBe('aChecklistWasMadeForYou')
    expect(threeLines[0]!.body).toBe('A checklist was made for you: «Studio move», 3 items')
    expect(threeLines[0]!.saidInFull).toBeUndefined()
    expect(threeLines[0]!.aboutMessage).toBeUndefined()

    const beforeOne = officeLines().length
    const one = await ask('POST', '/api/checklists', as(SECRETARY), {
      title: 'Studio move, one thing',
      ...FOR_THE_PERSON,
      items: [{ words: 'Pack the moulds' }],
    })
    expect(one.status, one.error).toBe(201)
    const oneLines = linesSince(beforeOne)
    expect(oneLines).toHaveLength(1)
    expect(oneLines[0]!.notice).toBe('aChecklistWasMadeForYou')
    expect(oneLines[0]!.body).toBe('A checklist was made for you: «Studio move, one thing», 1 item')

    const beforeNone = officeLines().length
    const none = await ask('POST', '/api/checklists', as(SECRETARY), { title: 'Studio move, empty', ...FOR_THE_PERSON })
    expect(none.status, none.error).toBe(201)
    expect(linesSince(beforeNone), 'an empty checklist sends nothing').toEqual([])
    const emptyId = none.body['checklist'].id as string
    const beforeFirst = officeLines().length
    const first = await ask('POST', `/api/checklists/${emptyId}/items`, as('quill'), { words: 'Find the tape' })
    expect(first.status, first.error).toBe(201)
    const firstLines = linesSince(beforeFirst)
    expect(firstLines).toHaveLength(1)
    expect(firstLines[0]!.notice).toBe('addedToYourChecklist')
    expect(firstLines[0]!.body).toBe('Added to your checklist: «Find the tape»')
  })

  it('11. a refused write sends no line', async () => {
    const item = await anItem(list, as('quill'), { words: 'Check the pyrometer' })
    const stale = await versionOf(list)
    const moved = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { words: 'Check the pyrometer twice' })
    expect(moved.status, moved.error).toBe(200)

    const beforeStale = officeLines().length
    const refusedStale = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), {
      words: 'Check the pyrometer a third time',
      ifVersion: stale,
    })
    expect(refusedStale.status, refusedStale.error).toBe(409)
    expect(linesSince(beforeStale), 'a stale write sends nothing').toEqual([])

    const beforeNoEvidence = officeLines().length
    const refusedDone = await ask('PATCH', `/api/checklists/${list}/items/${item}`, as('quill'), { state: 'done' })
    expect(refusedDone.status, refusedDone.error).toBe(400)
    expect(linesSince(beforeNoEvidence), 'a done with no evidence sends nothing').toEqual([])
  })

  it('12. a change to the checklist title or label sends no line', async () => {
    const beforeTitle = officeLines().length
    const renamed = await ask('PATCH', `/api/checklists/${list}`, as('quill'), { title: 'Kiln checklist, renamed' })
    expect(renamed.status, renamed.error).toBe(200)
    expect(linesSince(beforeTitle), 'a title change sends nothing').toEqual([])

    const beforeLabel = officeLines().length
    const labelled = await ask('PATCH', `/api/checklists/${list}`, as('quill'), { label: 'Firing bench' })
    expect(labelled.status, labelled.error).toBe(200)
    expect(linesSince(beforeLabel), 'a label change sends nothing').toEqual([])
  })
})
