// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HISTORY LISTS THE ROWS OF ONE SECOND IN THE ORDER THE DATABASE STORED THEM, THE SAME ON EVERY READ, AND SAYS
 * WHERE NO STORED FACT GIVES AN ORDER.
 *
 * Every stamp is to the second, and an agent writes several rows in one. The read used to put the rows of one second
 * in the order of their ids, and an id is a random string, so two writes of one second could be listed the wrong way
 * round. What is held here:
 *   1. Change rows of one second go by `append_order`, the higher above, whatever their ids.
 *   2. Revisions of two records in one second go by the order this database holds them in (its rowid).
 *   3. Revisions of one record in one second go by `seq`, the higher above, whatever their ids and rowids.
 *   4. Where the rowid and `seq` disagree, each record keeps the places its revisions hold, and its revisions fill
 *      them by `seq`. One order, with no cycle in it.
 *   5. Between tables there is no stored order, so the read follows one fixed choice: a revision above a change row,
 *      a change row above a link nobody logged, and that above a row of the implementation map.
 *   6. The same order on every read, whatever order SQLite hands the rows back in.
 *   7. Rows of different seconds are still newest first by their stamp. A guard: this held before as well.
 *   8. `linkEventsIn` gives a link and its unlink of one second earliest first, by `append_order`, whatever their
 *      rowids and on every read.
 *   9. A change row with no `append_order`, which no program writes, goes below the change rows of its second that
 *      have one, and such rows go by rowid among themselves.
 *  10. The door's note, read from GET /api, holds the sentences the order is written in.
 *
 * Every row is made up, in a test office of this file's own. Ids, stamps and rowids are rewritten in that office to
 * build the states an import or a copy of the office can leave: an import writes revisions in the order of their ids,
 * and a VACUUM may renumber rowids.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiIndex } from '../src/server/api/kinds.ts'
import type { HistoryEvent } from '../src/server/lib/history.ts'

let WORKSPACE = 'default'
/** The made-up second each case puts its rows in. No row of this office is written in it otherwise. */
const ONE_SECOND = '2026-01-02 03:04:05'

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/history.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/history.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
  ;({ app } = await apiApp())
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // A project of this case's own, so a history sees only the rows this case made.
  caseNumber += 1
  WORKSPACE = `one-second-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `One second case ${String(caseNumber)}` })
})

/** The case's own prefix for a rewritten id, and the case's own range of rowids, far above any row written. */
const tag = (): string => `order-${String(caseNumber)}`
const rowidAbove = (n: number): number => 1_000_000 * caseNumber + n

function aRecord(kind: Parameters<TestDb['api']['createRecord']>[0]['kind'], title: string, data?: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, ...(data === undefined ? {} : { data }), actor: t.api.HUMAN }).id
}

function renamed(id: string, title: string): void {
  t.api.patchRecord(id, { title }, t.api.HUMAN)
}

/** A module that carries one block by `implements`, so the module's history holds the revisions of two records. */
function aModuleCarryingABlock(): { module: string; block: string } {
  const pipeline = aRecord('pipeline', 'A made-up pipeline', { blockIds: [] })
  const block = t.blocks.addBlock(pipeline, { name: 'A made-up step', state: 'todo' }, t.api.HUMAN).block.id
  const module = aRecord('module', 'A made-up module')
  t.api.createLink({ fromId: module, toId: block, type: 'implements', actor: t.api.HUMAN })
  return { module, block }
}

interface Stored {
  id: string
  rowid: number
}

/** One record's revisions, by `seq`. */
function revisionsOf(recordId: string): (Stored & { seq: number })[] {
  return t.client.sqlite.prepare('SELECT id, rowid, seq FROM revisions WHERE record_id = ? ORDER BY seq').all(recordId) as (Stored & { seq: number })[]
}

/** One record's change rows, in the order the change log gave them. */
function changesOf(recordId: string): (Stored & { appendOrder: number | null })[] {
  return t.client.sqlite
    .prepare('SELECT id, rowid, append_order AS appendOrder FROM changes WHERE record_id = ? ORDER BY append_order')
    .all(recordId) as (Stored & { appendOrder: number | null })[]
}

type Table = HistoryEvent['source']['table']
const STAMP_OF: Record<Table, string> = { revisions: 'at', changes: 'at', links: 'created_at', implementation_map: 'stated_at' }

/**
 * Rewrites one made-up row of this case's office: its stamp, then its rowid, then its id. Gives the key its event is
 * known by, `table:id`.
 */
function rewrite(table: Table, id: string, set: { at?: string; rowid?: number; id?: string }): string {
  if (set.at !== undefined) t.client.sqlite.prepare(`UPDATE ${table} SET ${STAMP_OF[table]} = ? WHERE id = ?`).run(set.at, id)
  if (set.rowid !== undefined) t.client.sqlite.prepare(`UPDATE ${table} SET rowid = ? WHERE id = ?`).run(set.rowid, id)
  if (set.id !== undefined) t.client.sqlite.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).run(set.id, id)
  return `${table}:${set.id ?? id}`
}

/** The whole read, below the route. */
function history(id: string): HistoryEvent[] {
  const scope = lib.historySubjects(id, WORKSPACE)
  if (scope === null) throw new Error(`no record ${id}`)
  return lib.historyEvents(scope, WORKSPACE)
}

const keyOf = (event: HistoryEvent): string => `${event.source.table}:${event.source.id}`

/** The events of one history in one second, in the order the read lists them. */
const inTheSecond = (events: HistoryEvent[], at = ONE_SECOND): string[] => events.filter((event) => event.at === at).map(keyOf)

/** Runs `read` with SQLite handing back every unordered SELECT's rows the other way round. */
function withTheRowsReversed<T>(read: () => T): T {
  t.client.sqlite.pragma('reverse_unordered_selects = ON')
  try {
    return read()
  } finally {
    t.client.sqlite.pragma('reverse_unordered_selects = OFF')
  }
}

/**
 * A module and its block whose revisions of one second the database holds against their numbers, the state an
 * import leaves: it writes revisions in the order of their ids, and here the ids are the module's second revision,
 * the block's first, the module's first. Gives the keys in the order the history must list them.
 */
function aSecondWhereTheRowidAndTheSeqDisagree(): { module: string; expected: string[] } {
  const { module, block } = aModuleCarryingABlock()
  renamed(module, 'A made-up module, renamed')
  const moduleRevisions = revisionsOf(module)
  const first = moduleRevisions[0]!
  const second = moduleRevisions[moduleRevisions.length - 1]!
  expect(second.seq, 'the module has a revision after its first').toBeGreaterThan(first.seq)
  const blocks = revisionsOf(block)[0]!
  const secondKey = rewrite('revisions', second.id, { at: ONE_SECOND, rowid: rowidAbove(1), id: `${tag()}-a` })
  const blocksKey = rewrite('revisions', blocks.id, { at: ONE_SECOND, rowid: rowidAbove(2), id: `${tag()}-b` })
  const firstKey = rewrite('revisions', first.id, { at: ONE_SECOND, rowid: rowidAbove(3), id: `${tag()}-c` })
  // The database holds the module's first revision highest, the block's in the middle and the module's second lowest.
  // The module keeps the first and the third place, and its revisions fill them by `seq`.
  return { module, expected: [secondKey, blocksKey, firstKey] }
}

/** The one link or unlink change row `act` filed. */
function theChangeFiledBy(act: () => unknown): string {
  const before = new Set((t.client.sqlite.prepare('SELECT id FROM changes').all() as { id: string }[]).map((row) => row.id))
  act()
  const filed = (t.client.sqlite.prepare("SELECT id FROM changes WHERE op IN ('link', 'unlink')").all() as { id: string }[])
    .map((row) => row.id)
    .filter((id) => !before.has(id))
  expect(filed, 'the link change rows one act filed').toHaveLength(1)
  return filed[0]!
}

describe('a history lists the rows of one second in the order the database stored them', () => {
  it('1. lists change rows of one second by the order the change log gave them, whatever their ids', () => {
    const note = aRecord('note', 'A made-up note')
    renamed(note, 'A made-up note, renamed once')
    renamed(note, 'A made-up note, renamed twice')
    const rows = changesOf(note)
    expect(rows.length, 'the note has a change row for its making and one for each renaming').toBeGreaterThanOrEqual(3)
    const earlier = rows[rows.length - 2]!
    const later = rows[rows.length - 1]!
    // The earlier row's id now sorts above the later one's.
    const earlierKey = rewrite('changes', earlier.id, { at: ONE_SECOND, id: `${tag()}-z` })
    const laterKey = rewrite('changes', later.id, { at: ONE_SECOND, id: `${tag()}-a` })
    expect(inTheSecond(history(note))).toEqual([laterKey, earlierKey])
  })

  it('2. lists revisions of two records in one second by the order this database holds them in, whatever their ids', () => {
    const { module, block } = aModuleCarryingABlock()
    const blocks = revisionsOf(block)[0]!
    const modules = revisionsOf(module)[0]!
    expect(modules.rowid, 'the module was written after its block').toBeGreaterThan(blocks.rowid)
    // The block's id now sorts above the module's.
    const blocksKey = rewrite('revisions', blocks.id, { at: ONE_SECOND, id: `${tag()}-z` })
    const modulesKey = rewrite('revisions', modules.id, { at: ONE_SECOND, id: `${tag()}-a` })
    expect(inTheSecond(history(module))).toEqual([modulesKey, blocksKey])
  })

  it('3. lists two revisions of one record in one second by their seq, the higher above, whatever their ids and rowids', () => {
    const note = aRecord('note', 'A made-up note')
    renamed(note, 'A made-up note, renamed')
    const [first, second] = revisionsOf(note)
    expect(second!.seq).toBeGreaterThan(first!.seq)
    // The first revision's id and its rowid now both sort above the second's.
    const firstKey = rewrite('revisions', first!.id, { at: ONE_SECOND, rowid: rowidAbove(2), id: `${tag()}-z` })
    const secondKey = rewrite('revisions', second!.id, { at: ONE_SECOND, rowid: rowidAbove(1), id: `${tag()}-a` })
    expect(inTheSecond(history(note))).toEqual([secondKey, firstKey])
  })

  it('4. keeps each record in the places its revisions hold, filled by seq, where the rowid and the seq disagree', () => {
    const { module, expected } = aSecondWhereTheRowidAndTheSeqDisagree()
    expect(inTheSecond(history(module))).toEqual(expected)
  })

  it('5. lists a revision above a change row, that above a link nobody logged, and that above a map row, both ways round by id', () => {
    const repositoryId = `${tag()}-repository`
    t.client.sqlite
      .prepare("INSERT INTO repositories (id, workspace_id, name, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, 'made-up')")
      .run(repositoryId, WORKSPACE, `made-up-${tag()}`, ONE_SECOND, ONE_SECOND)
    const other = aRecord('note', 'Another made-up note')
    for (const [which, idsInTheOrder] of [
      ['ids rising down the list', ['a', 'b', 'c', 'd']],
      ['ids falling down the list', ['d', 'c', 'b', 'a']],
    ] as const) {
      const note = aRecord('note', `A made-up note, ${which}`)
      const [revisionId, changeId, linkId, mapId] = idsInTheOrder.map((letter) => `${tag()}-${which.split(' ')[1]!}-${letter}`)
      const revisionKey = rewrite('revisions', revisionsOf(note)[0]!.id, { at: ONE_SECOND, id: revisionId })
      const changeKey = rewrite('changes', changesOf(note)[0]!.id, { at: ONE_SECOND, id: changeId })
      t.client.sqlite
        .prepare("INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, created_by) VALUES (?, ?, 'owner', ?, ?, ?, ?, 'relates_to', 'the importer')")
        .run(linkId, WORKSPACE, ONE_SECOND, ONE_SECOND, note, other)
      t.client.sqlite
        .prepare(
          "INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note, stated_at, stated_by) VALUES (?, ?, ?, ?, 'src/made-up.ts', 'implements', 'declared', NULL, ?, 'made-up')",
        )
        .run(mapId, WORKSPACE, note, repositoryId, ONE_SECOND)
      expect(inTheSecond(history(note)), which).toEqual([revisionKey, changeKey, `links:${linkId!}`, `implementation_map:${mapId!}`])
    }
  })

  it('6. gives the same order on every read, whatever order SQLite hands the rows back in', () => {
    const { module, expected } = aSecondWhereTheRowidAndTheSeqDisagree()
    for (const row of changesOf(module)) rewrite('changes', row.id, { at: ONE_SECOND })
    const first = history(module)
    const reversed = withTheRowsReversed(() => history(module))
    expect(inTheSecond(first).length, 'the change rows and revisions put in the second').toBeGreaterThan(expected.length)
    expect(reversed.map(keyOf)).toEqual(first.map(keyOf))
    expect(history(module).map(keyOf)).toEqual(first.map(keyOf))
  })

  it('7. still lists rows of different seconds newest first by their stamp, whatever their ids and rowids', () => {
    const note = aRecord('note', 'A made-up note')
    renamed(note, 'A made-up note, renamed once')
    renamed(note, 'A made-up note, renamed twice')
    // Each row gets a second of its own, the oldest row the newest second, and an id that sorts the other way.
    const rows: [Table, string][] = [
      ...revisionsOf(note).map((row): [Table, string] => ['revisions', row.id]),
      ...changesOf(note).map((row): [Table, string] => ['changes', row.id]),
    ]
    const stamps = rows.map((_, i) => `2026-01-02 03:05:${String(59 - i).padStart(2, '0')}`)
    const expected = rows.map(([table, id], i) => rewrite(table, id, { at: stamps[i]!, id: `${tag()}-${String(i).padStart(2, '0')}` }))
    const told = history(note).filter((event) => stamps.includes(event.at))
    expect(told.map(keyOf)).toEqual(expected)
  })

  it('8. gives a link and its unlink of one second earliest first from linkEventsIn, whatever their rowids, on every read', () => {
    const from = aRecord('note', 'A made-up note')
    const to = aRecord('note', 'Another made-up note')
    let linkId = ''
    const made = theChangeFiledBy(() => {
      linkId = t.api.createLink({ fromId: from, toId: to, type: 'relates_to', actor: t.api.HUMAN }).id
    })
    const unmade = theChangeFiledBy(() => t.api.deleteLink(linkId, t.api.HUMAN, WORKSPACE))
    // A copy that renumbered the rows now holds the unlink first. The change log's order is left as it was.
    rewrite('changes', made, { at: ONE_SECOND, rowid: rowidAbove(2) })
    rewrite('changes', unmade, { at: ONE_SECOND, rowid: rowidAbove(1) })
    const ours = (rows: { id: string }[]): string[] => rows.map((row) => row.id).filter((id) => id === made || id === unmade)
    for (const [which, read] of [
      ['every link act of the project', () => lib.linkEventsIn(WORKSPACE)],
      ['the link acts at one record', () => lib.linkEventsIn(WORKSPACE, new Set([from]))],
    ] as const) {
      expect(ours(read()), which).toEqual([made, unmade])
      expect(ours(withTheRowsReversed(read)), `${which}, the rows handed back the other way round`).toEqual([made, unmade])
    }
  })

  it('9. lists a change row with no append_order below those of its second that have one, and such rows by rowid', () => {
    const note = aRecord('note', 'A made-up note')
    for (const n of ['once', 'twice', 'three times']) renamed(note, `A made-up note, renamed ${n}`)
    const rows = changesOf(note)
    expect(rows.length).toBeGreaterThanOrEqual(4)
    const [first, second, third] = rows.slice(-3)
    // No program writes such a row: the trigger of migration 0194 numbers every insert that names none.
    t.client.sqlite.prepare('UPDATE changes SET append_order = NULL WHERE id IN (?, ?)').run(first!.id, second!.id)
    const firstKey = rewrite('changes', first!.id, { at: ONE_SECOND, id: `${tag()}-c` })
    const secondKey = rewrite('changes', second!.id, { at: ONE_SECOND, id: `${tag()}-b` })
    const thirdKey = rewrite('changes', third!.id, { at: ONE_SECOND, id: `${tag()}-a` })
    expect(inTheSecond(history(note))).toEqual([thirdKey, secondKey, firstKey])
  })

  it('10. says in the door’s note, read from GET /api, how the rows of one second are ordered and where no stored fact orders them', async () => {
    expect(typeof lib.THE_ORDER_IN_ONE_SECOND, 'history.ts exports the sentences the order is written in').toBe('string')
    const index = (await app.inject({ method: 'GET', url: '/api' })).json() as ApiIndex
    const door = index.endpoints.find((endpoint) => endpoint.method === 'GET' && endpoint.path === '/api/records/:id/history')
    expect(door, 'GET /api lists the history door').toBeDefined()
    expect(door!.description).toContain(lib.THE_ORDER_IN_ONE_SECOND)
  })
})
