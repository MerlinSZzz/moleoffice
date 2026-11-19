// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ATTENTION RULE'S RECORDS, READ STRAIGHT FROM SQLITE, ARE THE RECORDS DRIZZLE GAVE (round 26 of wave 13w).
 *
 * `listRecordsForTheAttentionRule` (src/server/lib/records.ts) runs drizzle's query and maps each row
 * itself, by the order of the columns it selected, instead of letting drizzle map it. Drizzle's mapping
 * changed no value of these columns, and its checks of each cell cost about a fifth of the attention
 * reading. This file compares the read with drizzle's own read of the same query, written out here as
 * it was before, on records that use every column: a summary and none, each origin and none, a deleted
 * record, a `data` that is not an object, a report's blocks, a record of another project, and a
 * message in the message centre that is in this project's view.
 *
 * THE LINKS THE RULE READS ARE READ STRAIGHT FROM SQLITE TOO (round 167 of wave 13y). `allLinks` reads
 * only the columns `linkOf` reads, as lists, and builds each link from them. The second part compares
 * that with `allGatedLinks`, which builds each link with `linkOf` from drizzle's own read of every
 * column, field by field and in the same order, on links that use every column: one Mole Office
 * worked out, each kind of maker and none, a maker's type that is no type, a gate, and a link of
 * another project. It also lists every column of the links table, so a column added later fails here
 * until somebody says whether a link is built from it.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line red; RESTORE green, checked with cmp against a saved copy.
 */
import { and, desc, eq, getTableColumns, or } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-09-01 09:00:00', ?, ?, ?, ?, ?, ?, ?)`,
  )
  add.run('rr-task', HERE, '2026-09-01 09:00:01', 'task', 'A made-up task', 'A made-up summary', JSON.stringify({ state: 'doing', due: '2026-09-10', body: 'not read' }), null, 'fixture')
  add.run('rr-note', HERE, '2026-09-01 09:00:02', 'note', 'A made-up note', null, '{}', null, null)
  add.run('rr-gone', HERE, '2026-09-01 09:00:03', 'task', 'A made-up deleted task', null, JSON.stringify({ state: 'todo' }), '2026-09-02 09:00:00', 'authored')
  add.run('rr-list', HERE, '2026-09-01 09:00:04', 'note', 'A made-up note whose data is a list', null, '[1, 2]', null, 'a word that is no origin')
  add.run('rr-report', HERE, '2026-09-01 09:00:05', 'report', 'A made-up report', null, JSON.stringify({ for: 'the owner', blocks: [{ id: 'b-1', type: 'text', text: 'made-up' }, { id: 'b-2', type: 'text', text: 'made-up' }], done: false }), null, 'fixture')
  add.run('rr-elsewhere', 'elsewhere', '2026-09-01 09:00:06', 'task', 'A made-up task in another project', null, JSON.stringify({ state: 'blocked' }), null, null)
  add.run('rr-message', MESSAGE_CENTRE, '2026-09-01 09:00:07', 'message', 'A made-up message written here', null, JSON.stringify({ body: 'made-up words', writtenIn: { project: HERE } }), null, null)
  const link = t.client.sqlite.prepare(
    `INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, gate, gate_up_to, gate_up_to_sort, carries)
     VALUES (?, ?, 'owner', ?, '2026-09-03 09:00:00', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  link.run('rl-worked-out', HERE, '2026-09-01 10:00:01', 'rr-note', 'rr-task', 'relates_to', 1, 'mole-office', 'system', null, null, null, null)
  link.run('rl-person', HERE, '2026-09-01 10:00:02', 'rr-task', 'rr-note', 'blocks', 0, 'owner', 'human', 'partial', 'review', 'b', 'made-up words carried')
  link.run('rl-agent', HERE, '2026-09-01 10:00:03', 'rr-report', 'rr-task', 'about', 0, 'a-made-up-agent', 'agent', null, null, null, null)
  link.run('rl-not-recorded', HERE, '2026-09-01 10:00:04', 'rr-gone', 'rr-note', 'relates_to', 0, 'owner', null, null, null, null, null)
  link.run('rl-no-type', HERE, '2026-09-01 10:00:05', 'rr-list', 'rr-note', 'relates_to', 0, 'owner', 'a word that is no type', null, null, null, null)
  link.run('rl-elsewhere', 'elsewhere', '2026-09-01 10:00:06', 'rr-elsewhere', 'rr-elsewhere', 'relates_to', 1, 'owner', 'human', null, null, null, null)
}, 60_000)

afterAll(() => {
  t.close()
})

describe('the attention rule records read', () => {
  it('gives what drizzle gave for the same query', async () => {
    const { db } = await import('../src/server/db/client.ts')
    const { records } = await import('../src/server/db/schema.ts')
    const { messagesInTheViewOf, justThisProject } = await import('../src/server/lib/messages.ts')
    // THE READ AS IT WAS, through drizzle's mapping.
    const kept = R.onlyTheseFieldsOf(R.THE_FIELDS_THE_ATTENTION_RULE_READS, ['blocks'])
    const before = db
      .select({ ...getTableColumns(records), data: kept })
      .from(records)
      .where(or(eq(records.workspaceId, HERE), and(eq(records.kind, 'message'), messagesInTheViewOf(justThisProject(HERE)))))
      .orderBy(desc(records.updatedAt))
      .all()
      .map((row) => R.toRecord({ ...row, data: JSON.parse(row.data) as Record<string, unknown> } as typeof records.$inferSelect))
    const now = R.listRecordsForTheAttentionRule(HERE)
    expect(now).toEqual(before)
    // The records above are all there, so the comparison is about something.
    for (const id of ['rr-task', 'rr-note', 'rr-gone', 'rr-list', 'rr-report', 'rr-message']) expect(now.some((one) => one.id === id), id).toBe(true)
    expect(now.some((one) => one.id === 'rr-elsewhere')).toBe(false)
    expect(now.find((one) => one.id === 'rr-report')?.data).toEqual({ for: 'the owner', blocks: [null, null], done: false })
  })
})

describe('the links the attention rule reads', () => {
  /** A link as `linkOf` builds it from drizzle's read of every column: `allGatedLinks` without what it adds. */
  const asLinkOfBuiltIt = (workspaceId: string) =>
    R.allGatedLinks(workspaceId).map(({ gate, gateLabel, gateProblem, gateStage, broken, carries, ...link }) => link)

  it('are the links linkOf builds from drizzle, field by field and in the same order', () => {
    for (const workspaceId of [HERE, 'elsewhere']) {
      const before = asLinkOfBuiltIt(workspaceId)
      const now = R.allLinks(workspaceId)
      expect(now.map((one) => one.id), workspaceId).toEqual(before.map((one) => one.id))
      before.forEach((one, i) => {
        // Each field on its own, so a failure names the field and not only the link.
        for (const field of new Set([...Object.keys(one), ...Object.keys(now[i] ?? {})])) {
          expect((now[i] as Record<string, unknown> | undefined)?.[field], `${one.id} ${field}`).toStrictEqual((one as Record<string, unknown>)[field])
        }
      })
    }
    // Across every project the read has no project to narrow by, so it is compared as a set.
    const everywhere = [...asLinkOfBuiltIt(HERE), ...asLinkOfBuiltIt('elsewhere')].sort((a, b) => a.id.localeCompare(b.id))
    expect([...R.allLinks(R.ACROSS_WORKSPACES)].sort((a, b) => a.id.localeCompare(b.id))).toStrictEqual(everywhere)
  })

  it('use every column they are made from, so the comparison is about something', () => {
    const now = R.allLinks(HERE)
    expect(now.map((one) => one.id).sort()).toEqual(['rl-agent', 'rl-no-type', 'rl-not-recorded', 'rl-person', 'rl-worked-out'])
    expect(now.find((one) => one.id === 'rl-worked-out')?.inferred).toBe(true)
    expect(now.find((one) => one.id === 'rl-person')?.inferred).toBe(false)
    expect(now.map((one) => one.createdByType).sort()).toEqual(['agent', 'human', 'system', null, null].sort())
    expect(new Set(now.map((one) => one.type))).toEqual(new Set(['relates_to', 'blocks', 'about']))
  })

})
