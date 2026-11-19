// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITER STAMPED ON EACH ROW OF THE TWO LEDGERS IS COUNTED BY THE CENSUS, and a stamp stored under an agent's old
 * registry id is listed with its canonical id (item 30c, part 2b-4). A changes or revisions row names its writer in
 * actor_type and actor_id. For an agent that id is the handle the request named or the registry id its key proved,
 * and nothing beside it says which, so a stamp is read only where exactly one agent answers to it. The office's own
 * parts and a person are other namespaces and are not read. session_id names a session, never an agent, and is not read.
 *
 * Every agent, alias and row here is made up, in a throwaway office. The stamps are put in place by a direct write,
 * because a write through the office stamps whoever made it.
 *
 * MUTATIONS, after a control run: count a stamp without asking which agents answer to it, and the case of a string
 * two agents answer to goes red. Drop the stamps of one ledger from the census, and the first case goes red. Read the
 * office's own writers as agents, and their case goes red. Read session_id as a stamp, and its case goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_OFFICES_OWN_WRITER_IDS } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, rawHistory, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); inventedRegistry(t) })
afterEach(() => t?.close())

const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const census = async () => (await import('../src/server/lib/registry-aliases/census.ts')).takeIdentityCensus(t.client.sqlite)
// The fixture's old id of its retired agent, which its live agent now holds as its handle.
const sharedString = syntheticAlias.aliasId
const live = 'CanonicalB2'
const liveOldId = 'old-id-of-the-live-agent'

/** A record written by the person, whose change and revision rows are then stamped as written by `id` of `type`. */
function stamped(id: string, type = 'agent'): { changes: string[]; revisions: string[] } {
  const record = t.api.createRecord({ kind: 'note', workspaceId: 'default', title: 'Made-up stamped note', origin: 'fixture', data: {}, actor })
  for (const table of ['changes', 'revisions']) t.client.sqlite.prepare(`UPDATE ${table} SET actor_type = ?, actor_id = ? WHERE record_id = ?`).run(type, id, record.id)
  const ids = (table: string) => (t.client.sqlite.prepare(`SELECT id FROM ${table} WHERE record_id = ? ORDER BY id`).all(record.id) as { id: string }[]).map(one => one.id)
  return { changes: ids('changes'), revisions: ids('revisions') }
}
const atStamps = <T extends { path: string }>(rows: T[]) => rows.filter(one => one.path === 'actor_id' || one.path === 'session_id')
const ofRows = <T extends { row: string }>(rows: T[], ids: string[]) => rows.filter(one => ids.includes(one.row))

describe('the census of the ledgers\' stamps', () => {
  it('lists a stamp under an old id with its canonical id, in both ledgers, and counts it', async () => {
    const lib = await fileSyntheticAlias(t)
    lib.fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: liveOldId, canonicalId: live }])
    const rows = stamped(liveOldId)
    const before = rawHistory(t)
    const read = await census()
    expect(rawHistory(t)).toEqual(before)
    const aliases = atStamps(read.aliases)
    for (const id of rows.changes) expect(aliases).toContainEqual({ table: 'changes', row: id, path: 'actor_id', stored: liveOldId, canonical: live })
    for (const id of rows.revisions) expect(aliases).toContainEqual({ table: 'revisions', row: id, path: 'actor_id', stored: liveOldId, canonical: live })
    expect(read.positions['changes.actor_id']).toBeGreaterThanOrEqual(rows.changes.length)
    expect(read.positions['revisions.actor_id']).toBeGreaterThanOrEqual(rows.revisions.length)
    expect(ofRows(atStamps(read.blocks), [...rows.changes, ...rows.revisions])).toEqual([])
  })

  it('counts a stamp that is one agent\'s handle or its canonical id, and lists neither as an old spelling', async () => {
    await fileSyntheticAlias(t)
    const byHandle = stamped('current-cobalt')
    const byId = stamped(live)
    const every = [...byHandle.changes, ...byHandle.revisions, ...byId.changes, ...byId.revisions]
    const before = await census()
    expect(ofRows(atStamps(before.aliases), every)).toEqual([])
    expect(ofRows(atStamps(before.blocks), every)).toEqual([])
    // The same rows stamped by the person are not read, so the count falls by exactly these rows.
    for (const table of ['changes', 'revisions']) t.client.sqlite.prepare(`UPDATE ${table} SET actor_type = 'human', actor_id = ? WHERE id IN (${every.map(() => '?').join(',')})`).run(actor.id, ...every)
    const after = await census()
    expect((before.positions['changes.actor_id'] ?? 0) - (after.positions['changes.actor_id'] ?? 0)).toBe(byHandle.changes.length + byId.changes.length)
    expect((before.positions['revisions.actor_id'] ?? 0) - (after.positions['revisions.actor_id'] ?? 0)).toBe(byHandle.revisions.length + byId.revisions.length)
  })

  it('blocks a stamp that two agents answer to, one by its old id and one by its handle, and maps it to neither', async () => {
    await fileSyntheticAlias(t)
    const rows = stamped(sharedString)
    const read = await census()
    expect(ofRows(atStamps(read.aliases), [...rows.changes, ...rows.revisions])).toEqual([])
    const blocks = ofRows(atStamps(read.blocks), [...rows.changes, ...rows.revisions])
    expect(blocks.map(one => [one.table, one.reason]).sort()).toEqual([
      ...rows.changes.map(() => ['changes', 'cannot-tell']), ...rows.revisions.map(() => ['revisions', 'cannot-tell']),
    ].sort())
  })

  it('blocks a stamp that no agent answers to, and an empty one', async () => {
    const nobody = stamped('made-up-agent-nobody-registered')
    const empty = stamped('')
    const read = await census()
    const reasons = (rows: { changes: string[]; revisions: string[] }) => [...new Set(ofRows(atStamps(read.blocks), [...rows.changes, ...rows.revisions]).map(one => one.reason))]
    expect(reasons(nobody)).toEqual(['names-no-agent'])
    expect(reasons(empty)).toEqual(['empty-id'])
  })

  it('does not read the office\'s own writers or the person as agents', async () => {
    const rows = [...THE_OFFICES_OWN_WRITER_IDS.map(id => stamped(id)), stamped(sharedString, 'human')]
    const ids = rows.flatMap(one => [...one.changes, ...one.revisions])
    await fileSyntheticAlias(t)
    const read = await census()
    expect(ofRows(atStamps(read.aliases), ids)).toEqual([])
    expect(ofRows(atStamps(read.blocks), ids)).toEqual([])
  })

  it('never reads session_id as an agent, even when it holds an old id', async () => {
    await fileSyntheticAlias(t)
    const rows = stamped(live)
    for (const table of ['changes', 'revisions']) t.client.sqlite.prepare(`UPDATE ${table} SET session_id = ? WHERE id IN (${[...rows.changes, ...rows.revisions].map(() => '?').join(',')})`).run(sharedString, ...rows.changes, ...rows.revisions)
    const read = await census()
    for (const list of [read.aliases, read.blocks]) expect(list.filter(one => one.path === 'session_id')).toEqual([])
  })
})
