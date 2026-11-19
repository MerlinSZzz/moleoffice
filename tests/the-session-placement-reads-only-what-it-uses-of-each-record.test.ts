// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION PLACEMENT READS ONLY WHAT IT USES OF EACH RECORD, AND FINDS EACH RECORD IT LOOKS UP AS `listRecords` GIVES IT.
 * Wave 13y round 32, item 3.6; the second case changed in wave 13y round 103.
 *
 * MEASURED FIRST: on 14 October 2026, GET /api/sessions without a narrowing took 154 to 686 ms a warm ask on three
 * copies of an office, asked in one process. On each copy the largest step was `readSessionEvidence`, and its largest
 * part was its read of every record the project lists: 157 to 178 ms on the office copy of 5 October. That read
 * selected every column of every record, and the placement uses four of them: the id, the kind, the title and a
 * pipeline's data. Reading only those, in the same order and under the same condition, took 30 to 50 percent less,
 * and gave the same records in the same order on each copy.
 *
 * MEASURED AGAIN on 28 October 2026, on the made-up office at the scale of 22 October 2026: that read still took 102 ms
 * of each GET /api/sessions without a narrowing, 92 of them the project's view of the message centre, and 89 ms in a
 * project that holds nothing. The placement looks up only some of those records by their ids: the ends of the
 * project's links, the blocks its pipelines list, and the records its change rows name, 992 ids on that office.
 *
 * WHAT THIS HOLDS:
 *   - each statement `readSessionEvidence` lists records with selects their id, kind and title, the time each was
 *     stored, by which they are ordered, and a pipeline's data, and no other column;
 *   - each record the placement looks up in the evidence, while it reads the evidence, places a run and matches what a
 *     run wrote, is found there as `listRecords` gives it, by its id, kind and title, and is not found where
 *     `listRecords` does not give it: a message in the project's view, a note of the project, a pipeline's block, a
 *     message outside it, a deleted record, a record of another project and an id of no record. Each record the project
 *     lists is named in one way only: by a change row, by a link, or by a pipeline's blocks;
 *   - the evidence lists every pipeline and module in `listRecords`' order, and finds a pipeline's block;
 *   - a note and a message in the project's view that nothing names are in no row a listing returns.
 *
 * Until round 103 the second case held that the evidence names every record `listRecords` gives. That kept the
 * placement's answer whole, because a record it looked up and did not find was then one the project does not list.
 * The case holds that purpose for each record looked up, and no longer asks the placement to read the others.
 *
 * WHAT IT DOES NOT HOLD. Where a run is placed; the placement tests hold that.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb

const PERSON = { type: 'human' as const, id: THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
}, 60000)

afterAll(() => {
  t.close()
})

/** The text of every statement `work` runs, with what it returned, by wrapping what the connection's `prepare` hands back. */
function theStatementsOf(work: () => void): { text: string; rows: unknown }[] {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const ran: { text: string; rows: unknown }[] = []
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = original.call(this, text)
    for (const method of ['all', 'get', 'run'] as const) {
      const call = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const rows = call.apply(this, args)
        ran.push({ text, rows })
        return rows
      }
    }
    return statement
  }
  try {
    work()
  } finally {
    sqlite.prepare = original
  }
  return ran
}

/** A statement that reads records in `listRecords`' order. */
const aListing = (text: string): boolean => /from "records"/.test(text) && /order by "records"\."updated_at" desc/.test(text)

/** Every key looked up in a `Map` while `work` runs, with the map it was looked up in. */
function theLookupsOf<T>(work: () => T): { answer: T; lookups: [Map<unknown, unknown>, unknown][] } {
  type Lookup = (this: Map<unknown, unknown>, key: unknown) => unknown
  const prototype = Map.prototype as unknown as Record<'get' | 'has', Lookup>
  const originals = { get: prototype.get, has: prototype.has }
  const lookups: [Map<unknown, unknown>, unknown][] = []
  for (const method of ['get', 'has'] as const) {
    const call = originals[method]
    prototype[method] = function (this: Map<unknown, unknown>, key: unknown) {
      lookups.push([this, key])
      return call.call(this, key)
    }
  }
  try {
    return { answer: work(), lookups }
  } finally {
    prototype.get = originals.get
    prototype.has = originals.has
  }
}

/** A small project: a pipeline with one block, a module, a note, a message written in it, and a record elsewhere. */
function aProject(tag: string): { pipeline: string; block: string; message: string } {
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: `Test pipeline ${tag}`, data: { blockIds: [] }, actor: PERSON }).id
  const block = t.blocks.addBlock(pipeline, { name: `Test block ${tag}`, state: 'todo' }, PERSON).block.id
  t.api.createRecord({ workspaceId: 'default', kind: 'module', title: `Test module ${tag}`, data: {}, actor: PERSON })
  t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `Test note ${tag}`, summary: 'A summary the placement does not read.', data: { body: 'Test.' }, actor: PERSON })
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: `Test message ${tag}`, data: { body: 'Test.', to: [{ kind: 'person', id: THE_PERSON }] }, actor: PERSON }).id
  t.api.createRecord({ workspaceId: 'other-project', kind: 'pipeline', title: `Test pipeline elsewhere ${tag}`, data: { blockIds: [] }, actor: PERSON })
  return { pipeline, block, message }
}

it("lists records by their id, kind and title, the time each was stored and a pipeline's data", async () => {
  aProject('one')
  const { readSessionEvidence } = await import('../src/server/lib/sessions.ts')
  const listings = theStatementsOf(() => readSessionEvidence('default'))
    .map((one) => one.text)
    .filter(aListing)
  expect(listings.length, 'the statements that list records').toBeGreaterThan(0)
  for (const listing of listings) {
    const selected = listing.slice(listing.indexOf('select ') + 'select '.length, listing.indexOf(' from "records"'))
    // A PIPELINE'S DATA AND '{}' FOR EVERY OTHER RECORD, worked out in the statement.
    const pipelinesData = /\(CASE WHEN (?:"records"\.)?"kind" = \? THEN (?:"records"\.)?"data" ELSE '\{\}' END\)/
    expect(selected, 'the data the listing selects').toMatch(pipelinesData)
    const columns = [...selected.replace(pipelinesData, '').replaceAll('"records".', '').matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    expect(columns.sort(), 'the columns the listing selects').toEqual(['id', 'kind', 'title', 'updated_at'])
  }
})

it('finds each record it looks up as listRecords gives it, lists pipelines and modules in order, and reads no record nothing names', async () => {
  const { pipeline, block, message } = aProject('two')
  const { readSessionEvidence, placementOf } = await import('../src/server/lib/sessions.ts')
  const { whatIsHeldAbout } = await import('../src/server/lib/recipients.ts')
  const db = t.client.sqlite
  const aNote = (workspaceId: string, title: string): string => t.api.createRecord({ workspaceId, kind: 'note', title, data: { body: 'Test.' }, actor: PERSON }).id
  const aMessage = (workspaceId: string, title: string): string =>
    t.api.createRecord({ workspaceId, kind: 'message', title, data: { body: 'Test.', to: [{ kind: 'person', id: THE_PERSON }] }, actor: PERSON }).id

  // A RUN, AND WHAT IT NAMES: the message in the project's view, by a change row it wrote; a note of the project, by a
  // link alone; a message written in another project, a note since deleted and a note of another project, by a link and
  // by a change row; and an id of no record, by a change row, since no link can name it. The block is named by its
  // pipeline alone. So each record the project lists is named in one way only, and each way is held on its own.
  const run = aNote('default', 'Test run two')
  const linked = aNote('default', 'Test note linked two')
  const outside = aMessage('other-project', 'Test message elsewhere two')
  const deleted = aNote('default', 'Test note deleted two')
  t.api.deleteRecord(deleted, PERSON)
  const elsewhere = aNote('other-project', 'Test note elsewhere two')
  const noRecord = 'test-no-such-record-two'
  const link = db.prepare(
    'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by) ' +
      "VALUES (?, 'default', ?, '2026-10-28 12:00:00', '2026-10-28 12:00:00', ?, ?, 'relates_to', 0, ?)",
  )
  for (const [i, id] of [linked, outside, deleted, elsewhere].entries()) link.run(`test-link-two-${String(i)}`, THE_PERSON, run, id, THE_PERSON)
  const wrote = db.prepare(
    'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) ' +
      "VALUES (?, ?, 'default', 'update', 'agent', 'test-agent-two', ?, 'title', NULL, NULL, '2026-10-28 12:00:00')",
  )
  for (const [i, id] of [message, outside, deleted, elsewhere, noRecord].entries()) wrote.run(`test-change-two-${String(i)}`, id, run)
  // TWO RECORDS NOTHING NAMES: no link, no block and no change row. Their change rows are taken out, as a row older than
  // the newest rows the placement reads is. So are those of the linked note and the block, which are named otherwise.
  const unnamedNote = aNote('default', 'Test note nothing names two')
  const unnamedMessage = aMessage('default', 'Test message nothing names two')
  db.prepare('DELETE FROM changes WHERE record_id IN (?, ?, ?, ?)').run(unnamedNote, unnamedMessage, linked, block)

  const listed = new Map(t.api.listRecords({ workspaceId: 'default' }).map((record) => [record.id, record]))
  // THE FIXTURE HOLDS WHAT IT MEANS TO: listRecords gives the two messages written in the project and its notes and
  // block, and none of the rest.
  for (const id of [message, unnamedMessage, unnamedNote, run, linked, block]) expect(listed.has(id), `listRecords gives ${id}`).toBe(true)
  for (const id of [outside, deleted, elsewhere, noRecord]) expect(listed.has(id), `listRecords does not give ${id}`).toBe(false)

  // EVERY LOOKUP IN THE EVIDENCE'S RECORDS, while it is read, while the run is placed and while what it wrote is matched.
  const { answer: evidence, lookups } = theLookupsOf(() => {
    const read = readSessionEvidence('default')
    placementOf(run, run, read)
    whatIsHeldAbout(listed.get(run)!, read)
    return read
  })
  const lookedUp = new Set(lookups.filter(([map]) => map === evidence.records).map(([, key]) => key))
  for (const id of [message, linked, outside, deleted, elsewhere, noRecord, block]) expect(lookedUp, `the placement looks up ${id}`).toContain(id)
  const named = (record: { id: string; kind: string; title: string } | undefined) => (record === undefined ? null : { id: record.id, kind: record.kind, title: record.title })
  for (const id of lookedUp) expect(named(evidence.records.get(id as string)), `the record ${String(id)}`).toEqual(named(listed.get(id as string)))
  expect(evidence.projects.map(named)).toEqual([...listed.values()].filter((record) => record.kind === 'pipeline' || record.kind === 'module').map(named))
  expect(evidence.blocks.get(block)?.pipeline.id, "the block's pipeline").toBe(pipeline)

  // NO LISTING READS A RECORD NOTHING NAMES.
  const listings = theStatementsOf(() => readSessionEvidence('default')).filter((one) => aListing(one.text))
  for (const id of [unnamedNote, unnamedMessage]) {
    expect(listings.filter((one) => JSON.stringify(one.rows).includes(id)), `the listings that return ${id}`).toEqual([])
    expect(evidence.records.has(id), `the evidence holds ${id}`).toBe(false)
  }
})
