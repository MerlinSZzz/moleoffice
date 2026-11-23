// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS DOOR HANDS ONLY THE OPEN ITEMS WHEN IT IS ASKED TO, AND TODAY'S ANSWER WHEN IT IS NOT.
 *
 * `GET /api/checklists` answers every item of every checklist it lists. The page, the window and the count in the side
 * bar draw a checklist's finished items only once the fold under its card is pressed, and the finished items are most
 * of the bytes. So the door takes `?items=open`: each checklist then carries its unfinished items whole, and for each
 * finished item only its id and who added it. Its counts are still worked out from every item, and the records, the
 * people, the flows and the presses it lists are the ones the whole answer lists, narrowed to what the unfinished items
 * name.
 *
 * What is proved, on this test's own office:
 *   1. WITH `?items=open`, for `?projects=all`, `?projects=all&owner=everyone` and `?projects=<one>&owner=everyone`:
 *      the same checklists in the same order; each one's head and counts as in the whole answer; its items the whole
 *      answer's unfinished items, in their stored order; its finished items' ids and adders, in their stored order, with
 *      no adder where none was recorded; and its linked records, people, flows and presses the whole answer's lists
 *      narrowed to what the kept items name, in the same order. On one checklist the lists are written out by hand, so
 *      the narrowing is seen to drop something: the proof only a done item names, the agent only a done item names
 *      and the flow only a done item stands for. A message the reader may not read, which a done item links and an
 *      open item names only in its words, is kept as the whole answer keeps it, as not readable.
 *   2. WITHOUT THE KEY, no checklist carries `finishedItems`, and each one is what `GET /api/checklists/:id` answers.
 *   3. `?items=` WITH ANY OTHER VALUE is refused with a 400, and nothing is written.
 *
 * Every checklist, item, agent, project, message and report here is made up for this test, and its words say so where
 * a person would read them. `freshDb` and `apiApp` give the test its own database and API, and nothing is asked of the
 * live office.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { piecesOfBody } from '../src/shared/messages.ts'

let t: TestDb
let app: FastifyInstance

/** The second project, made up. */
const PROJECT_B = 'sample-project-b'

const asPerson = (project = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
})
const asAgent = (handle: string, project = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': project,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
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

async function written(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<Record<string, any>> {
  const r = await call(method, url, headers, payload)
  expect(r.status, `${method} ${url}: ${JSON.stringify(r.body).slice(0, 600)}`).toBeLessThan(300)
  return r.body
}

/** A made-up report with one block, b-1, to stand as a done item's evidence. */
function aReport(title: string, workspaceId: string): string {
  return t.api.createRecord({
    workspaceId,
    kind: 'report',
    title,
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'A made-up section for this test.' }] },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/** A made-up message from the person to one agent alone, so another agent may not read it. */
function aMessageTo(agentId: string, body: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'A made-up message',
    data: { body, to: [{ kind: 'agent', id: agentId }], sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
  }).id
}

/**
 * A MADE-UP FLOW RUN THAT AN ITEM CAN STAND FOR. Only the office files a flow run, so a report is filed and its row is
 * turned into a flow run about another made-up record, which is what the checklist's reading of its flows asks of one.
 */
function aFlowRun(about: string): string {
  const id = aReport('A made-up flow run', 'default')
  t.client.sqlite.prepare("UPDATE records SET kind = 'flow_run', data = ? WHERE id = ?").run(JSON.stringify({ module: about }), id)
  return id
}

/** Takes who added these items out of the stored row, as an item written before the office kept it would be. */
function forgetWhoAdded(list: string, items: readonly string[]): void {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(list) as { data: string }
  const data = JSON.parse(row.data) as { items: Record<string, unknown>[] }
  for (const one of data.items) if (items.includes(one['id'] as string)) delete one['addedBy']
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), list)
}

/** How many records there are and when the last one changed, so a refusal can be seen to write nothing. */
function whatIsStored(): { n: number; last: string | null } {
  return t.client.sqlite.prepare('SELECT count(*) AS n, max(updated_at) AS last FROM records').get() as { n: number; last: string | null }
}

const FINISHED = new Set(['done', 'superseded'])
const isFinished = (item: { state: string }): boolean => FINISHED.has(item.state)

/** Every record id these items name: as a link, as evidence, or in their words. */
function theRecordsNamedBy(items: readonly Record<string, any>[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    for (const id of (item['links'] ?? []) as string[]) ids.add(id)
    for (const one of (item['evidence'] ?? []) as { record?: string }[]) if (one.record !== undefined) ids.add(one.record)
    for (const piece of piecesOfBody(item['words'] as string)) if (piece.what === 'record') ids.add(piece.recordId)
  }
  return ids
}

/** Every participant these items name: who added each, who it tells, who marked it done and who was told. */
function thePeopleNamedBy(items: readonly Record<string, any>[]): Set<string> {
  const who = new Set<string>()
  const name = (one: { kind: string; id: string } | undefined): void => {
    if (one !== undefined) who.add(`${one.kind}:${one.id}`)
  }
  for (const item of items) {
    name(item['addedBy'])
    for (const one of (item['tell'] ?? []) as { kind: string; id: string }[]) name(one)
    name(item['doneByThePerson']?.['by'])
    for (const one of (item['doneByThePerson']?.['told'] ?? []) as { kind: string; id: string }[]) name(one)
  }
  return who
}

const HEAD = ['id', 'workspaceId', 'title', 'owner', 'ownerName', 'version', 'updatedAt'] as const

const idOf: Record<string, string> = {}
let kiln = ''
let proof = ''
let notes = ''
let hidden = ''
let flowOpen = ''
let flowDone = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['quill', 'lark']) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson(), payload: { handle, name: handle, role: 'worker' } })
    expect(r.statusCode, r.body).toBe(201)
    idOf[handle] = (r.json() as { agent: { id: string } }).agent.id
  }
  await written('POST', '/api/workspaces', asPerson(), { id: PROJECT_B, title: 'Sample project B (made up)' })

  proof = aReport('A made-up proof', 'default')
  notes = aReport('Made-up notes', 'default')
  // TWO MESSAGES TO LARK ALONE, which quill, the reader below, may not read. A done item links the first and an open
  // item names it only in its words; the second is named only in an open item's words.
  hidden = aMessageTo(idOf['lark']!, 'A made-up message for lark alone.')
  const hiddenInWordsOnly = aMessageTo(idOf['lark']!, 'Another made-up message for lark alone.')
  const later = aMessageTo(idOf['quill']!, 'The made-up glaze notes are in the manual now.')
  flowOpen = aFlowRun(notes)
  flowDone = aFlowRun(notes)

  // THE PERSON'S CHECKLIST, in the first project, holding every sort of item, in the order they are added here.
  kiln = (
    await written('POST', '/api/checklists', asPerson(), {
      title: 'Kiln checklist (made up)',
      items: [
        { words: 'Sweep the made-up kiln shed' },
        { words: 'Fire the made-up test tiles', state: 'done', evidence: [{ kind: 'manual section', record: proof, block: 'b-1' }] },
        { words: 'My made-up lab manual', standing: true },
        { words: 'Old made-up glaze notes' },
        { words: `Read the made-up notes ${notes} and the message ${hiddenInWordsOnly}`, links: [flowOpen] },
        { words: 'Box the made-up offcuts', state: 'done', evidence: [{ kind: 'commit', commit: '0a1b2c3' }], links: [hidden, flowDone] },
        { words: `Ask about the made-up message ${hidden} again` },
      ],
    })
  )['checklist'].id as string
  await written('POST', `/api/checklists/${kiln}/items`, asAgent('quill'), { words: 'Choose the made-up glaze', state: 'waiting on the owner' })
  const weigh = (await written('POST', `/api/checklists/${kiln}/items`, asAgent('quill'), { words: 'Weigh the made-up clay' }))['item'].id as string
  const jars = (await written('POST', `/api/checklists/${kiln}/items`, asAgent('lark'), { words: 'Label the made-up jars' }))['item'].id as string
  await written('PATCH', `/api/checklists/${kiln}/items/i-4`, asPerson(), { state: 'superseded', supersededBy: later })
  await written('PATCH', `/api/checklists/${kiln}/items/${weigh}`, asPerson(), { state: 'done' })
  await written('PATCH', `/api/checklists/${kiln}/items/${jars}`, asAgent('lark'), { state: 'done', addEvidence: [{ kind: 'commit', commit: '7a8b9c0' }] })
  // ONE OPEN ITEM AND ONE DONE ITEM WITH NOBODY RECORDED AS HAVING ADDED THEM.
  forgetWhoAdded(kiln, ['i-1', 'i-2'])

  // QUILL'S CHECKLISTS: one in each project, and the one in the first project has nothing finished.
  const shelf = (
    await written('POST', '/api/checklists', asAgent('quill', PROJECT_B), {
      title: 'Shelf checklist (made up)',
      items: [
        { words: 'Clear the made-up top shelf' },
        { words: 'Paint the made-up shelf', state: 'done', evidence: [{ kind: 'manual section', record: aReport('Another made-up proof', PROJECT_B), block: 'b-1' }] },
        { words: 'Is the made-up paint dry?', state: 'waiting on the owner' },
      ],
    })
  )['checklist'].id as string
  const brushes = (await written('POST', `/api/checklists/${shelf}/items`, asPerson(PROJECT_B), { words: 'Bring the made-up brushes' }))['item'].id as string
  await written('PATCH', `/api/checklists/${shelf}/items/${brushes}`, asAgent('quill', PROJECT_B), { state: 'done', addEvidence: [{ kind: 'commit', commit: '1d2e3f4' }] })
  await written('POST', '/api/checklists', asAgent('quill'), { title: 'Bench checklist (made up)', items: [{ words: 'Wipe the made-up bench' }] })

  // THE PERSON'S CHECKLIST IN THE SECOND PROJECT, so that project has two owners.
  await written('POST', '/api/checklists', asPerson(PROJECT_B), {
    title: 'Glaze checklist (made up)',
    items: [{ words: 'Mix the made-up blue glaze' }, { words: 'Test the made-up blue glaze', state: 'done', evidence: [{ kind: 'commit', commit: '4d5e6f7' }] }],
  })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The three list reads the page, the window and the side bar ask, each read as quill. */
const READS = ['?projects=all', '?projects=all&owner=everyone', `?projects=${PROJECT_B}&owner=everyone`] as const

async function bothAnswers(query: string): Promise<{ whole: Record<string, any>; open: Record<string, any> }> {
  const whole = await call('GET', `/api/checklists${query}`, asAgent('quill'))
  expect(whole.status, JSON.stringify(whole.body).slice(0, 600)).toBe(200)
  const open = await call('GET', `/api/checklists${query}&items=open`, asAgent('quill'))
  expect(open.status, JSON.stringify(open.body).slice(0, 600)).toBe(200)
  return { whole: whole.body, open: open.body }
}

describe('the checklists door hands only the open items when it is asked to', () => {
  it('1. with ?items=open, each checklist keeps its head and counts, its unfinished items whole and its finished ones by id and adder, and the lists narrowed to what the kept items name', async () => {
    for (const query of READS) {
      const { whole, open } = await bothAnswers(query)
      const { checklists: wholeLists, ...wholeRest } = whole
      const { checklists: openLists, ...openRest } = open
      expect(openRest, `${query}: the rest of the answer`).toEqual(wholeRest)
      expect((openLists as { id: string }[]).map((one) => one.id), `${query}: the same checklists in the same order`).toEqual(
        (wholeLists as { id: string }[]).map((one) => one.id),
      )
      expect((wholeLists as unknown[]).length, `${query}: something is listed`).toBeGreaterThan(0)
      for (const [at, w] of (wholeLists as Record<string, any>[]).entries()) {
        const o = (openLists as Record<string, any>[])[at]!
        const where = `${query}, ${w['title'] as string}`
        expect(Object.keys(o).sort(), `${where}: its keys`).toEqual([...Object.keys(w), 'finishedItems'].sort())
        for (const key of HEAD) expect(o[key], `${where}: ${key}`).toEqual(w[key])
        expect(o['counts'], `${where}: counts from every item`).toEqual(w['counts'])
        const items = w['items'] as Record<string, any>[]
        const kept = items.filter((item) => !isFinished(item as { state: string }))
        expect(o['items'], `${where}: the unfinished items, whole, in their stored order`).toEqual(kept)
        expect(o['finishedItems'], `${where}: each finished item's id and adder, in their stored order`).toEqual(
          items.filter((item) => isFinished(item as { state: string })).map((item) => (item['addedBy'] === undefined ? { id: item['id'] } : { id: item['id'], addedBy: item['addedBy'] })),
        )
        const records = theRecordsNamedBy(kept)
        expect(o['linked'], `${where}: linked`).toEqual((w['linked'] as { id: string }[]).filter((one) => records.has(one.id)))
        const people = thePeopleNamedBy(kept)
        expect(o['named'], `${where}: named`).toEqual((w['named'] as { who: { kind: string; id: string } }[]).filter((one) => people.has(`${one.who.kind}:${one.who.id}`)))
        const keptIds = new Set(kept.map((item) => item['id'] as string))
        expect(o['flows'], `${where}: flows`).toEqual((w['flows'] as { item: string }[]).filter((one) => keptIds.has(one.item)))
        const presses = new Set(kept.flatMap((item) => (item['doneByThePerson']?.['press'] === undefined ? [] : [item['doneByThePerson']['press'] as string])))
        expect(o['presses'], `${where}: presses`).toEqual((w['presses'] as { id: string }[]).filter((one) => presses.has(one.id)))
      }
    }
  })

  it('1. on the kiln checklist the narrowing drops what only a finished item names, and keeps the unreadable message an open item names in words', async () => {
    const { whole, open } = await bothAnswers('?projects=all&owner=everyone')
    const w = (whole['checklists'] as Record<string, any>[]).find((one) => one['id'] === kiln)!
    const o = (open['checklists'] as Record<string, any>[]).find((one) => one['id'] === kiln)!
    // WORKED OUT FROM THE ITEMS ADDED ABOVE, in the order they were added.
    expect((w['items'] as { id: string }[]).map((one) => one.id)).toEqual(['i-1', 'i-2', 'i-3', 'i-4', 'i-5', 'i-6', 'i-7', 'i-8', 'i-9', 'i-10'])
    expect((o['items'] as { id: string }[]).map((one) => one.id), 'open, standing, open, open, waiting').toEqual(['i-1', 'i-3', 'i-5', 'i-7', 'i-8'])
    expect(o['finishedItems']).toEqual([
      { id: 'i-2' },
      { id: 'i-4', addedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } },
      { id: 'i-6', addedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } },
      { id: 'i-9', addedBy: { kind: 'agent', id: idOf['quill'] } },
      { id: 'i-10', addedBy: { kind: 'agent', id: idOf['lark'] } },
    ])
    expect(o['counts']).toEqual({ open: 4, waitingOnTheOwner: 1, done: 4, superseded: 1, standing: 1 })
    expect((w['linked'] as { id: string }[]).map((one) => one.id), 'the second message to lark is named only in words, and is left out').toEqual([proof, flowOpen, hidden, flowDone, notes])
    expect((o['linked'] as { id: string }[]).map((one) => one.id), 'the proof and the second flow only done items name').toEqual([flowOpen, hidden, notes])
    expect((o['linked'] as { id: string }[]).find((one) => one.id === hidden)).toEqual({ id: hidden, found: false, because: 'no message you may read' })
    expect((w['named'] as { who: { id: string } }[]).map((one) => one.who.id)).toEqual([THE_TEST_OFFICES_OWNER.id, idOf['quill'], idOf['lark']])
    expect((o['named'] as { who: { id: string } }[]).map((one) => one.who.id), 'lark added only a done item').toEqual([THE_TEST_OFFICES_OWNER.id, idOf['quill']])
    expect((w['flows'] as { item: string; flowRun: string }[]).map((one) => [one.item, one.flowRun])).toEqual([['i-5', flowOpen], ['i-6', flowDone]])
    expect((o['flows'] as { item: string; flowRun: string }[]).map((one) => [one.item, one.flowRun])).toEqual([['i-5', flowOpen]])
  })

  it('2. without the key, no checklist carries finished items by id, and each is what GET /api/checklists/:id answers', async () => {
    for (const query of READS) {
      const whole = await call('GET', `/api/checklists${query}`, asAgent('quill'))
      expect(whole.status, JSON.stringify(whole.body).slice(0, 600)).toBe(200)
      for (const list of whole.body['checklists'] as Record<string, any>[]) {
        expect(Object.keys(list), `${query}, ${list['title'] as string}`).not.toContain('finishedItems')
        const one = await call('GET', `/api/checklists/${list['id'] as string}?projects=all`, asAgent('quill'))
        expect(one.status, JSON.stringify(one.body).slice(0, 600)).toBe(200)
        expect(list, `${query}, ${list['title'] as string}`).toEqual(one.body['checklist'])
      }
    }
  })

  it('3. ?items= with any other value is refused with a 400, and nothing is written', async () => {
    const before = whatIsStored()
    for (const value of ['', 'all', 'OPEN', 'whole', 'open,done', 'open&items=open']) {
      for (const query of [`?items=${value}`, `?projects=all&items=${value}`, `?projects=all&owner=everyone&items=${value}`]) {
        const r = await call('GET', `/api/checklists${query}`, asAgent('quill'))
        expect(r.status, `${query}: ${JSON.stringify(r.body).slice(0, 300)}`).toBe(400)
      }
    }
    expect(whatIsStored(), 'the refusals wrote nothing').toEqual(before)
  })
})
