// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HISTORY SAYS WHICH ROWS IT READ FROM EVERY TABLE ITS EVENTS COME FROM.
 *
 * The history door answers `read.sources`, a sentence that says what the read took. It said four kinds of stored row,
 * and the read takes rows of the implementation map as well, so the sentence left out a table its own events name.
 * What is held here:
 *   1. Every table an event of the answer names is named in `read.sources`. The table names are read from the
 *      answer's events, never typed.
 *   3. Each "of this project" in the words is held: a pipeline revision, a link or unlink change row and a link row of
 *      another project are not told in this project's history, and a change row of another project naming a link of
 *      this one does not stop that link being told from its own row.
 *
 * Held elsewhere, and so not here. A withdrawn row of the implementation map is not told, in
 * `tests/what-happened-to-my-modules-claims.test.ts`. A link nobody logged is dated from its own row, in case 5 of
 * `tests/a-history-lists-the-rows-of-one-second-in-the-order-they-were-stored.test.ts`.
 *
 * Every row is made up, in a test office of this file's own. Rows are made through the library's doors. Where a case
 * needs a row in one project that points at a record of another, the link door refuses it, because both ends of a
 * link must be in one project. Those rows are written straight into the database, and each case says which.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { HistoryEvent } from '../src/server/lib/history.ts'

let WORKSPACE = 'default'

let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/history.ts')
let createWorkspace: typeof import('../src/server/lib/workspaces.ts').createWorkspace
let registerRepository: typeof import('../src/server/lib/repositories.ts').registerRepository
let declareRelationship: typeof import('../src/server/lib/implementation.ts').declareRelationship
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/history.ts')
  ;({ createWorkspace } = await import('../src/server/lib/workspaces.ts'))
  ;({ registerRepository } = await import('../src/server/lib/repositories.ts'))
  ;({ declareRelationship } = await import('../src/server/lib/implementation.ts'))
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
  WORKSPACE = `every-table-case-${String(caseNumber)}`
  createWorkspace({ id: WORKSPACE, title: `Every table case ${String(caseNumber)}` })
})

/** A second project for this case, for the rows that must not be told in the first. */
function anotherProject(): string {
  const id = `${WORKSPACE}-elsewhere`
  createWorkspace({ id, title: `Every table case ${String(caseNumber)}, elsewhere` })
  return id
}

function aRecord(kind: Parameters<TestDb['api']['createRecord']>[0]['kind'], title: string, workspaceId = WORKSPACE, data?: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId, kind, title, ...(data === undefined ? {} : { data }), actor: t.api.HUMAN }).id
}

const idsIn = (query: string, value: string): string[] =>
  (t.client.sqlite.prepare(query).all(value) as { id: string }[]).map((row) => row.id)

/** The project one change row is filed in. */
const projectOfChange = (id: string): string | undefined =>
  (t.client.sqlite.prepare('SELECT workspace_id AS project FROM changes WHERE id = ?').get(id) as { project: string } | undefined)?.project

/** Does `act`, and gives the one link or unlink change row it filed. */
function theChangeFiledBy(act: () => unknown): string {
  const linkChanges = (): string[] =>
    (t.client.sqlite.prepare("SELECT id FROM changes WHERE op IN ('link', 'unlink')").all() as { id: string }[]).map((row) => row.id)
  const before = new Set(linkChanges())
  act()
  const filed = linkChanges().filter((id) => !before.has(id))
  expect(filed, 'the link change rows one act filed').toHaveLength(1)
  return filed[0]!
}

let unloggedNumber = 0
/** A link nobody logged, written straight into `links` as the importer writes one. */
function anUnloggedLink(workspaceId: string, fromId: string, toId: string): string {
  unloggedNumber += 1
  const id = `unlogged-${String(unloggedNumber).padStart(4, '0')}`
  t.client.sqlite
    .prepare(
      "INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, created_by) VALUES (?, ?, 'owner', '2026-10-30 09:00:00', '2026-10-30 09:00:00', ?, ?, 'relates_to', 'the importer')",
    )
    .run(id, workspaceId, fromId, toId)
  return id
}

/** The whole read, below the route. */
function history(id: string): HistoryEvent[] {
  const scope = lib.historySubjects(id, WORKSPACE)
  if (scope === null) throw new Error(`no record ${id}`)
  return lib.historyEvents(scope, WORKSPACE)
}

/** The whole read, through the route, as the page reads it. */
async function historyThroughTheDoor(id: string): Promise<{ events: HistoryEvent[]; read: { sources: string } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}/history`, headers: { 'x-mole-office-workspace': WORKSPACE } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { events: HistoryEvent[]; read: { sources: string } }
}

type Table = HistoryEvent['source']['table']

describe('a history names in read.sources every table its events come from', () => {
  it('1. names in read.sources the table of every event, with a row of every table in the answer', async () => {
    // A revision and a change row, through the record door.
    const module = aRecord('module', 'A made-up module')
    const note = aRecord('note', 'A made-up note')
    // A row of the implementation map, through the door that states one. It needs a repository of this project.
    const repositoryId = registerRepository({ workspaceId: WORKSPACE, name: `made-up-${String(caseNumber)}`, actor: t.api.HUMAN }).id
    const mapRow = declareRelationship({ workspaceId: WORKSPACE, recordId: module, repositoryId, pattern: 'src/made-up.ts', actor: t.api.HUMAN }).row.id
    // A link no change row names. Every door that makes a link also logs it, so this one is written straight into
    // the database, as the importer writes one.
    const link = anUnloggedLink(WORKSPACE, module, note)

    // The type checker refuses a table of `source.table` that this list leaves out.
    const made: Record<Table, string[]> = {
      revisions: idsIn('SELECT id FROM revisions WHERE record_id = ?', module),
      changes: idsIn('SELECT id FROM changes WHERE record_id = ?', module),
      links: [link],
      implementation_map: [mapRow],
    }
    const answer = await historyThroughTheDoor(module)
    for (const [table, ids] of Object.entries(made)) {
      expect(
        answer.events.some((event) => event.source.table === table && ids.includes(event.source.id)),
        `the answer holds an event of a row the case wrote into ${table}`,
      ).toBe(true)
    }
    const tables = new Set(answer.events.map((event) => event.source.table))
    for (const table of tables) expect(answer.read.sources, `read.sources names ${table}, which an event came from`).toContain(table)
  })


  it('3. tells no pipeline revision of another project, even one whose list of blocks gained a block of this one', () => {
    const elsewhere = anotherProject()
    const pipeline = aRecord('pipeline', 'A made-up pipeline', WORKSPACE, { blockIds: [] })
    const block = t.blocks.addBlock(pipeline, { name: 'A made-up step', state: 'todo' }, t.api.HUMAN).block.id
    const otherPipeline = aRecord('pipeline', 'A made-up pipeline elsewhere', elsewhere, { blockIds: [] })
    // The record door refuses a block of another project in a pipeline's list, so the other pipeline's revision that
    // gained the block is written straight into the database. It stands for a row an import or a hand could write.
    t.client.sqlite
      .prepare(
        'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, op, actor_type, actor_id, at) ' +
          "SELECT 'a-made-up-revision-elsewhere', record_id, workspace_id, seq + 1, content_hash, kind, title, summary, ?, 'update', actor_type, actor_id, at FROM revisions WHERE record_id = ? AND seq = 1",
      )
      .run(JSON.stringify({ blockIds: [block] }), otherPipeline)
    const otherRevisions = idsIn('SELECT id FROM revisions WHERE record_id = ?', otherPipeline)
    expect(otherRevisions.length, 'the other pipeline has a revision that gained the block').toBeGreaterThan(1)
    const told = history(block).filter((event) => otherRevisions.includes(event.source.id))
    expect(told.map((event) => event.source.id), 'a pipeline revision of another project').toEqual([])
  })

  it('4. tells no link or unlink change row of another project filed at a subject from the other end', () => {
    const elsewhere = anotherProject()
    const subject = aRecord('note', 'A made-up note')
    const [from, to] = ['one', 'two'].map((name) => aRecord('note', `A made-up note elsewhere, ${name}`, elsewhere))
    const change = theChangeFiledBy(() => t.api.createLink({ fromId: from!, toId: to!, type: 'relates_to', actor: t.api.HUMAN }))
    // The link door refuses a link whose ends are in two projects, so the change row is pointed at this project's
    // record straight in the database.
    t.client.sqlite.prepare('UPDATE changes SET new_value = ? WHERE id = ?').run(subject, change)
    expect(projectOfChange(change), 'the change row is of the other project').toBe(elsewhere)
    const told = history(subject).filter((event) => event.source.id === change)
    expect(told.map((event) => event.source.id), 'a link change row of another project').toEqual([])
  })

  it('5. tells no link row of another project with an end at a subject', () => {
    const elsewhere = anotherProject()
    const subject = aRecord('note', 'A made-up note')
    const from = aRecord('note', 'A made-up note elsewhere', elsewhere)
    // The link door refuses a link whose ends are in two projects, so this row is written straight into the database.
    const link = anUnloggedLink(elsewhere, from, subject)
    const told = history(subject).filter((event) => event.source.id === link)
    expect(told.map((event) => event.source.id), 'a link row of another project').toEqual([])
  })

  it('6. tells a link of this project nobody logged here from its own row, though a change row of another project names it', () => {
    const elsewhere = anotherProject()
    const subject = aRecord('note', 'A made-up note')
    const here = aRecord('note', 'Another made-up note')
    const link = anUnloggedLink(WORKSPACE, here, subject)
    const [from, to] = ['one', 'two'].map((name) => aRecord('note', `A made-up note elsewhere, ${name}`, elsewhere))
    const change = theChangeFiledBy(() => t.api.createLink({ fromId: from!, toId: to!, type: 'relates_to', actor: t.api.HUMAN }))
    // The link door refuses a link whose ends are in two projects, so the other project's change row is made to name
    // this project's link straight in the database: its from end, its type and its to end.
    t.client.sqlite.prepare('UPDATE changes SET record_id = ?, new_value = ? WHERE id = ?').run(here, subject, change)
    expect(projectOfChange(change), 'the change row is of the other project').toBe(elsewhere)
    const told = history(subject).filter((event) => event.source.id === link)
    expect(told.map((event) => event.source.id), 'the link of this project nobody logged here').toEqual([link])
  })
})
