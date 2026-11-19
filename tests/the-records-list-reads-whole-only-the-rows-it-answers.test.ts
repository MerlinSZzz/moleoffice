// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/records READS WHOLE ONLY THE ROWS IT ANSWERS, AND ANSWERS WHAT IT ANSWERED WHEN IT READ EVERY ROW WHOLE.
 *
 * MEASURED FIRST, wave 13y round 73, on a made-up office of the live shape (made-up data, 82,149 made-up records in
 * one project). The Everything page's first page of fifty took about 1,230 ms for a person and 1,630 ms for an
 * agent. Most of it was one SQL read of every column of every record, about 600 MB, and the parse of each `data`,
 * only to leave rows out, count them, sort them and keep fifty. Read without their `data`, the same rows were about
 * 200 MB and 200 ms. The home, session and narrow shapes answer a few fields of each `data`, and SQLite can leave
 * the rest unread.
 *
 * WHAT THIS PINS.
 *   3. Every answer is the answer the whole reading gives:
 *      - every column of the catalogue, both ways, with and without the light shape, cut into pages, against the
 *        same request with no `limit`, which reads every row whole; and the far ends of a page;
 *      - each cut shape against the same shape sorted by `incomplete`, which reads every row whole, row by row,
 *        and a cut shape sorted by state in the same order as the whole reading;
 *      - the tally's unfiled rows, a family, the decisions with `replacedLeftOut`, and the second level;
 *      - a search the index narrows still counts every replaced decision, not only those that hold the word;
 *      - for an agent that may not read a message: the message is not listed, and no honour reading names it.
 *   The rows carry an `incompleteCount` above 0, so the whole rows' counts are compared too.
 *
 * HOW THE BYTES ARE COUNTED. Every statement that reads from the records table is watched at the database,
 * and the length of every text value it
 * hands back is added up. A request with no `limit` reads every body, and the count is checked to see them, so a
 * count of nearly nothing cannot come from a statement the watch missed.
 *
 * MUTATIONS THAT MAKE THIS RED, each run in round 73 against src/server/api/records.ts:
 *   - read every row whole whatever is asked (`reading` always 'whole'): tests 1 and 2.
 *   - answer the page rows as they were placed, without reading them again (`answered` hands back its rows): tests 1,
 *     3, 5 and 6.
 *   - cut the home shape of every kind to nothing (`theDataAShapeAnswers` keeps only `alsoKeep`): tests 4 and 6.
 *   - leave the state word out of a cut shape sorted by state: test 4.
 *   - count the replaced decisions only among the rows read (`replacedLeftOut` always the difference): test 5.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COLUMN_SORT, type CatalogueColumn } from '../src/shared/catalogue.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'
const PERSON = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})
const DEE = asAgent('dee-bystander')

/** One large body, so a row read whole is told apart from a row read only to be placed. */
const BODY = 'A made-up paragraph nobody on a list page reads, long enough to be counted. '.repeat(200)
/** The word one live decision and one replaced decision hold, and nothing else does. */
const THE_WORD = 'quillwortish'

type Row = Record<string, unknown> & { id: string; kind: string; data: unknown; incompleteCount?: number }
interface Reply {
  records: Row[]
  matched: number
  returned: number
  left: number
  next: string | null
  tally?: { unfiled: Row[] } & Record<string, unknown>
  replacedLeftOut?: number
  secondLevel?: unknown
  farEnds?: Row[]
}

let t: TestDb
let app: FastifyInstance
let m1 = ''
let honourRun = ''
const replacedDecisions: string[] = []

async function ask(query: string, as: Record<string, string> = PERSON): Promise<Reply> {
  const reply = await app.inject({ method: 'GET', url: '/api/records' + query, headers: as })
  expect(reply.statusCode, `${query}: ${reply.body.slice(0, 400)}`).toBe(200)
  return reply.json() as Reply
}

/** Every page of a request, `size` rows at a time, joined. */
async function everyPage(query: string, size: number, as: Record<string, string> = PERSON): Promise<Row[]> {
  const rows: Row[] = []
  for (let offset = 0; ; offset += size) {
    const page = await ask(`${query}${query.includes('?') ? '&' : '?'}limit=${size}&offset=${offset}`, as)
    rows.push(...page.records)
    if (page.left === 0) return rows
  }
}

function aRecord(kind: RecordKind, title: string, data: unknown): string {
  return t.api.createRecord({ workspaceId: HERE, kind, title, data: data as Record<string, unknown>, actor: t.api.HUMAN }).id
}

/**
 * Large notes, each made and changed at its own later time, so every page this file asks for holds only them whatever
 * else was written in the same second.
 */
function bigNotes(count: number, from: number): void {
  for (let i = from; i < from + count; i += 1) {
    const id = aRecord('note', `Zz, a large made-up note ${String(i).padStart(3, '0')}`, { body: BODY })
    const at = `2099-01-01 00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`
    t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(at, at, id)
  }
}


/** Take away the copies the office routed to somebody up the chain, so only the addressee is a party. */
function onlyTheAddressee(messageId: string, addressee: string): void {
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(messageId, addressee)
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  delete data['routed']
  writeDataBypassingTheGate(t, messageId, data)
}

async function anAgent(handle: string): Promise<string> {
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: PERSON,
    payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })).json() as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((one) => one.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  // WHAT THE HOME SHAPE CARRIES PER KIND: a module's state, parts and label, a pipeline's blocks, a block's pause.
  const module = aRecord('module', 'A made-up module', { state: 'active', parts: [] })
  writeDataBypassingTheGate(t, module, {
    state: 'active',
    parts: [{ id: 'part-1', name: 'The door', items: [{ id: 'item-1', text: 'Open it', state: 'todo' }] }],
    context: 'a context no list shape carries',
    shortForms: { label: { text: 'A made-up module label', madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent' } },
  })
  const pipeline = aRecord('pipeline', 'A made-up pipeline', { blockIds: [] })
  const added = await app.inject({ method: 'POST', url: `/api/records/${pipeline}/blocks`, headers: PERSON, payload: { name: 'Sense the pot', state: 'todo' } })
  expect(added.statusCode, added.body).toBe(201)
  const block = (added.json() as { record: { id: string } }).record.id
  writeDataBypassingTheGate(t, pipeline, { blockIds: [block], source: 'the test' })
  writeDataBypassingTheGate(t, block, { state: 'todo', measured: 'p50 42 ms', paused: { since: '2026-10-24 09:00:00', because: 'made up' } })

  // STATES TO SORT BY, and a problem whose data is gone, so its incompleteCount is above 0.
  aRecord('task', 'A made-up task being done', { state: 'doing' })
  aRecord('task', 'A made-up task that is done', { state: 'done' })
  aRecord('task', 'Another made-up task, Zebra first in title', { state: 'todo' })
  const problem = aRecord('note', 'A made-up note to be emptied', { body: 'short' })
  writeDataBypassingTheGate(t, problem, {})
  for (const state of ['running', 'finished', 'crashed']) aRecord('session', `A made-up run that ${state}`, { state, detail: `it ${state}`, runtime: 'claude-code' })

  // A RECORD WHOSE DATA IS NOT AN OBJECT, which every shape keeps whole.
  const listy = aRecord('note', 'A made-up note whose data is a list', { body: 'soon a list' })
  writeDataBypassingTheGate(t, listy, ['a', 'list', 'of', 'words'])

  // DECISIONS: two replaced by later ones, one of each holding the word.
  const decide = (title: string): string => aRecord('decision', title, { option_taken: title, because: 'A made-up reason.' })
  const olderWithTheWord = decide(`An older made-up decision about ${THE_WORD}`)
  const olderWithout = decide('An older made-up decision about the clamp')
  const laterOne = decide('A later made-up decision that replaces the first')
  const laterTwo = decide('A later made-up decision that replaces the second')
  decide(`A live made-up decision about ${THE_WORD}`)
  t.api.createLink({ fromId: laterOne, toId: olderWithTheWord, type: 'supersedes', actor: t.api.HUMAN })
  t.api.createLink({ fromId: laterTwo, toId: olderWithout, type: 'supersedes', actor: t.api.HUMAN })
  replacedDecisions.push(olderWithTheWord, olderWithout)
  writeDataBypassingTheGate(t, laterOne, { option_taken: 'A later one', because: 'A made-up reason.', basis: { evidence: ['a made-up basis'] } })

  // A FLOW, whose reasons are the second level.
  const flow = aRecord('flow', 'A made-up flow', { stages: [] })
  writeDataBypassingTheGate(t, flow, {
    stages: [{ id: 'stage-1', name: 'Sense', why: 'A made-up reason for the stage.', sources: ['a made-up source'] }],
    step_changes: [{ at: '2026-10-24 09:00:00', what: 'a made-up change' }],
  })
  const linked = await app.inject({ method: 'POST', url: '/api/links', headers: PERSON, payload: { fromId: flow, toId: module, type: 'about' } })
  expect(linked.statusCode, linked.body).toBe(201)
  // A RECORD OF A KIND NOBODY DECLARES ANY MORE, as an old office keeps, which no heading holds, so the tally names it
  // unfiled. Every declared kind has a heading.
  const retired = aRecord('note', 'A made-up record of a retired kind', { body: 'kept from before' })
  t.client.sqlite.prepare('UPDATE records SET kind = ? WHERE id = ?').run('a_retired_kind', retired)

  // A MESSAGE dee MAY NOT READ, and a run whose honour reading names it.
  const ada = await anAgent('ada-writer')
  const bo = await anAgent('bo-reader')
  await anAgent('dee-bystander')
  expect(ada).not.toBe('')
  m1 = t.api.createRecord({
    kind: 'message',
    title: 'A made-up letter for bo alone',
    workspaceId: HERE,
    data: { body: 'made-up words for bo', to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  onlyTheAddressee(m1, bo)
  honourRun = aRecord('session', 'A made-up run with an honour reading', { state: 'finished', runtime: 'claude-code' })
  writeDataBypassingTheGate(t, honourRun, { state: 'finished', runtime: 'claude-code', honour: { signals: [{ said: 'a made-up signal', evidence: [m1, block] }] } })

  // THE LARGE NOTES THE PAGE MUST NOT READ WHOLE, so the first page is all of them whatever comes later.
  bigNotes(25, 0)
}, 300_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('GET /api/records reads whole only the rows it answers', () => {


  it('3: every column, both ways, cut into pages, answers the rows the whole reading answers', async () => {
    const whole = await ask('?shape=full')
    expect(whole.records.some((row) => (row.incompleteCount ?? 0) > 0), 'no row is incomplete, so no count is compared').toBe(true)
    for (const column of Object.keys(COLUMN_SORT) as CatalogueColumn[]) {
      for (const direction of ['asc', 'desc']) {
        for (const shape of ['&shape=full', '&shape=light']) {
          const query = `?sort=${column}&direction=${direction}${shape}`
          const all = await ask(query)
          expect(all.matched).toBe(whole.matched)
          expect(await everyPage(query, 7), query).toEqual(all.records)
        }
      }
    }
    expect(await everyPage('?shape=full', 9), 'the listed order').toEqual(whole.records)
    // THE FAR ENDS of a page are the far ends of the whole reading. A far end is never a row of the page, so the page
    // holds the flow and not the module it is about.
    const farWhole = await ask('?kind=flow&farEnds=light&shape=full')
    const farPaged = await ask('?kind=flow&farEnds=light&limit=1000&shape=full')
    expect(farWhole.farEnds?.length ?? 0, 'no far end, so none is compared').toBeGreaterThan(0)
    expect(farPaged.farEnds).toEqual(farWhole.farEnds)
    expect(farPaged.records).toEqual(farWhole.records)
  })

  it('4: each cut shape answers, row by row, what the whole reading answers', async () => {
    // THE HOME SHAPE IS ASKED ONE PAGE OF THE MOST ROWS, because the whole list in it is refused. The page is every
    // record of this office, so `left` is 0 and every row is still compared.
    const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
    for (const shape of ['home', 'session', 'narrow']) {
      const page = shape === 'home' ? `&limit=${String(RECORD_LIST_MAX_LIMIT)}` : ''
      const cut = await ask(`?shape=${shape}${page}`)
      const whole = await ask(`?shape=${shape}&sort=incomplete${page}`)
      expect(cut.left, `${shape}: the page left rows out`).toBe(0)
      expect(cut.matched).toBe(whole.matched)
      const byId = new Map(whole.records.map((row) => [row.id, row]))
      for (const row of cut.records) expect(row, `${shape}: ${row.kind} ${row.id}`).toEqual(byId.get(row.id))
      expect(cut.secondLevel, `${shape}: the second level`).toEqual(whole.secondLevel)
      // SORTED BY STATE, in the order the whole reading sorts every row by state.
      for (const direction of ['asc', 'desc']) {
        const inOrder = (await ask(`?sort=state&direction=${direction}&shape=full`)).records.map((row) => row.id)
        expect((await ask(`?shape=${shape}&sort=state&direction=${direction}${page}`)).records.map((row) => row.id), `${shape} by state ${direction}`).toEqual(inOrder)
        expect((await everyPage(`?shape=${shape}&sort=state&direction=${direction}`, 11)).map((row) => row.id)).toEqual(inOrder)
      }
    }
    // THE HOME SHAPE STILL CARRIES WHAT HOME DRAWS, so the comparison above is over rows that hold something.
    const home = (await ask(`?shape=home&limit=${String(RECORD_LIST_MAX_LIMIT)}`)).records
    const module = home.find((row) => row.kind === 'module')!
    expect((module.data as { shortForms?: { label?: { text?: string } } }).shortForms?.label?.text).toBe('A made-up module label')
    expect((home.find((row) => row.kind === 'pipeline')!.data as { blockIds?: unknown[] }).blockIds).toHaveLength(1)
    expect((home.find((row) => row.kind === 'block')!.data as { paused?: unknown }).paused).toBeDefined()
    expect(home.find((row) => row.title === 'A made-up note whose data is a list')!.data).toEqual(['a', 'list', 'of', 'words'])
  })

  it('5: the tally, a family, the decisions and a narrowed search count what the whole reading counts', async () => {
    const tallyWhole = await ask('?shape=light&tally=family')
    const tallyPaged = await ask('?shape=light&tally=family&limit=3')
    expect(tallyWhole.tally!.unfiled.length, 'nothing is unfiled, so no unfiled row is compared').toBeGreaterThan(0)
    expect(tallyPaged.tally).toEqual(tallyWhole.tally)

    expect(await everyPage('?family=decisions&shape=full', 2)).toEqual((await ask('?family=decisions&shape=full')).records)
    expect(await everyPage('?family=structure&shape=light', 2)).toEqual((await ask('?family=structure&shape=light')).records)

    for (const replaced of ['', '&replaced=include']) {
      const all = await ask(`?kind=decision${replaced}&shape=full`)
      expect(await everyPage(`?kind=decision${replaced}&shape=full`, 2), replaced).toEqual(all.records)
      expect((await ask(`?kind=decision${replaced}&limit=2&shape=full`)).replacedLeftOut).toBe(all.replacedLeftOut)
    }
    expect((await ask('?kind=decision&shape=full')).replacedLeftOut).toBe(replacedDecisions.length)
    const withReplacements = (await ask('?kind=decision&replaced=include&shape=full')).records.filter((row) => replacedDecisions.includes(row.id))
    expect(withReplacements.map((row) => row.replacedBy !== undefined)).toEqual([true, true])

    // A SEARCH THE INDEX NARROWS reads only the records that may hold the word, and still counts both replaced
    // decisions, though only one of them holds it.
    const searched = await ask(`?kind=decision&q=${THE_WORD}&shape=full`)
    expect(searched.records.map((row) => row.title)).toEqual([`A live made-up decision about ${THE_WORD}`])
    expect(searched.replacedLeftOut).toBe(replacedDecisions.length)
    // ASKED OVER EVERY KIND, nothing is left out as replaced, so both decisions that hold the word are matched.
    expect((await ask(`?q=${THE_WORD}&limit=1&shape=full`)).matched).toBe(2)

    // THE SECOND LEVEL of a page, and of every row.
    for (const query of ['?kind=flow&shape=full', '?kind=decision&replaced=include&shape=full', '?shape=light&sort=kind']) {
      const all = await ask(query)
      const paged = await ask(`${query}&limit=1000`)
      expect(paged.secondLevel, query).toEqual(all.secondLevel)
      expect(paged.records, query).toEqual(all.records)
    }
    expect((await ask('?kind=flow&shape=full&limit=1')).secondLevel, 'the flow held nothing back').toBeDefined()
  })

  it('6: an agent is not listed a message it may not read, and no honour reading names it, whichever way it is read', async () => {
    const whole = await ask('?shape=full', DEE)
    expect(whole.records.map((row) => row.id)).not.toContain(m1)
    expect(await everyPage('?shape=full', 13, DEE)).toEqual(whole.records)
    expect(await everyPage('?sort=kind&shape=light', 13, DEE)).toEqual((await ask('?sort=kind&shape=light', DEE)).records)
    const run = (await ask('?kind=session&shape=full&limit=50', DEE)).records.find((row) => row.id === honourRun)!
    expect(JSON.stringify(run.data)).not.toContain(m1)
    expect(JSON.stringify(run.data), 'the honour reading lost the record dee may read').toContain('a made-up signal')
    // THE HOME SHAPE ONE PAGE OF THE MOST ROWS, as in test 4: the whole list in it is refused.
    const { RECORD_LIST_MAX_LIMIT } = await import('../src/server/api/records.ts')
    for (const shape of ['home', 'session', 'narrow']) {
      const page = shape === 'home' ? `&limit=${String(RECORD_LIST_MAX_LIMIT)}` : ''
      const cut = await ask(`?shape=${shape}${page}`, DEE)
      const wholeShape = await ask(`?shape=${shape}&sort=incomplete${page}`, DEE)
      expect(cut.left, `${shape}: the page left rows out`).toBe(0)
      expect(cut.records.map((row) => row.id)).not.toContain(m1)
      const byId = new Map(wholeShape.records.map((row) => [row.id, row]))
      for (const row of cut.records) expect(row, `${shape}: ${row.id}`).toEqual(byId.get(row.id))
      expect(cut.matched).toBe(wholeShape.matched)
    }
    // THE PERSON IS LISTED THE MESSAGE, so leaving it out above is the reader's rule and not a missing row.
    expect((await ask('?limit=1000&shape=full')).records.map((row) => row.id)).toContain(m1)
  })
})
