// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO MADE A DECISION IS READ AS AN AGENT'S NAME, AND THE OWNER'S VALUE AS NOBODY'S.
 *
 * Agents record their own choices as decisions under their own names, so `decided_by` holds the owner's value or the
 * handle or id of the agent that made the choice. The identity register listed it among the fields that hold no
 * identity, so the census never read it: a project's archive did not carry the alias of an old id stored there, and the
 * re-mint's check of its stamps did not read it.
 *
 * The register now lists it as a stamp. The owner's value names the person, so it is never read as an agent's name: it
 * is not found, not blocked and not told to the re-mint's list of stamps. A value no agent answers to is blocked as one
 * that names no agent, which is not a value that cannot be told, so no project archive is refused for it.
 *
 * WHAT IS CLAIMED:
 *   1. the register lists who made a decision as a stamp, with the owner's value, as the code writes it, as the person's,
 *      and not among the fields that hold no identity;
 *   2. a decision the owner made is read as nobody's name: nothing found, nothing blocked, no stamp told;
 *   3. a decision an agent made is read as that agent, by its handle, its id or an old id;
 *   4. a value no agent answers to is blocked as naming no agent, and one that two agents answer to as one that cannot
 *      be told which;
 *   5. the census carries the alias of an old id stored there, counts nothing there as a value that cannot be told,
 *      blocks only the value no agent answers to, and tells the re-mint's list every value but the owner's.
 *
 * Every agent, alias and value here is made up, in a throwaway office. Case 5 writes the three values into the rows
 * straight: the library's create does not fill who made a decision, and the door's check of who signed it is not
 * what is under test.
 *
 * MUTATIONS, each after a control run (the commit that adds this file names the logs):
 *   1. the stamp reader reads the owner's value like any other: cases 2 and 5 go red.
 *   2. the register lists the field among those that hold no identity again: cases 1, 3, 4 and 5 go red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AStampAt } from '../src/server/lib/registry-aliases/census.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, syntheticAlias } from './registry-alias-fixture.ts'

let t: TestDb
beforeEach(async () => {
  t = await freshDb()
  inventedRegistry(t)
  await fileSyntheticAlias(t)
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: OLD_ID, canonicalId: LIVE }])
})
afterEach(() => t?.close())

const register = () => import('../src/server/lib/registry-aliases/identity-positions.ts')
const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')

const SITE = 'decision.decided_by'
const PATH = 'data.decided_by'
/** The fixture's retired agent's handle, which names it alone. */
const RETIRED = { handle: 'current-cobalt' }
/** The fixture's live agent, and an old id of it that this file files as an alias. */
const LIVE = 'CanonicalB2'
const OLD_ID = 'old-id-of-the-live-agent'
/** MADE-UP: a value no agent answers to, by an id, an old id or a handle. */
const NOBODY = 'a made-up role nobody holds'
const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** One decision's data read, with every stamp the reader told. */
async function read(decidedBy: string) {
  const { readRecordIdentities } = await reader()
  const told: string[] = []
  const reading = readRecordIdentities(t.client.sqlite, 'decision', { decided_by: decidedBy }, 'data', (one) => told.push(one.stored))
  return { ...reading, told }
}

const foundAs = (stored: string, canonical: string) => ({ path: PATH, as: 'value', stored, canonical, site: SITE, parse: 'stamp' })

describe('who made a decision, in the identity register', () => {
  // MUTATION 2: listed among the fields that hold no identity: red.
  it("1. is listed as a stamp, with the owner's value as the person's, and not among the fields that hold no identity", async () => {
    const { NOT_IDENTITY, thePositionAt } = await register()
    const entry = thePositionAt(SITE)
    expect(entry?.parse, 'who made a decision is not read as a stamp').toBe('stamp')
    expect(entry?.whenThePerson, "the owner's value is not the one that names the person").toBe(THE_OWNER)
    expect(NOT_IDENTITY.map((one) => one.site)).not.toContain(SITE)
  })

  // MUTATION 1: the owner's value read like any other: red.
  it("2. reads a decision the owner made as nobody's name: nothing found, nothing blocked, no stamp told", async () => {
    expect(await read(THE_OWNER)).toEqual({ found: [], blocks: [], told: [] })
  })

  it('3. reads a decision an agent made as that agent, by its handle, its id or an old id', async () => {
    // A handle is found as itself: only an old id has an alias to carry.
    expect(await read(RETIRED.handle)).toEqual({ found: [foundAs(RETIRED.handle, RETIRED.handle)], blocks: [], told: [RETIRED.handle] })
    expect(await read(LIVE)).toEqual({ found: [foundAs(LIVE, LIVE)], blocks: [], told: [LIVE] })
    expect(await read(OLD_ID)).toEqual({ found: [foundAs(OLD_ID, LIVE)], blocks: [], told: [OLD_ID] })
  })

  it('4. blocks a value no agent answers to as naming no agent, and one two agents answer to as one that cannot be told', async () => {
    const nobody = await read(NOBODY)
    expect(nobody.found).toEqual([])
    expect(nobody.blocks.map((one) => [one.path, one.reason])).toEqual([[PATH, 'names-no-agent']])
    // The fixture's alias is an old id of the retired agent and the live agent's handle.
    const two = await read(syntheticAlias.aliasId)
    expect(two.found).toEqual([])
    expect(two.blocks.map((one) => [one.path, one.reason])).toEqual([[PATH, 'cannot-tell']])
  })
})

describe('who made a decision, in the census', () => {
  // MUTATIONS 1 and 2: red.
  it("5. carries an old id's alias, counts nothing as untold, blocks only the value no agent answers to, and tells every value but the owner's", async () => {
    const aDecision = () => t.api.createRecord({ kind: 'decision', workspaceId: 'default', title: 'Made-up operating choice', origin: 'fixture', data: { replaces: [] }, actor }).id
    const owners = aDecision()
    const byAnOldId = aDecision()
    const byNobody = aDecision()
    const stored = (id: string) => (JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, unknown>)
    const write = t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
    write.run(JSON.stringify({ ...stored(owners), decided_by: THE_OWNER }), owners)
    write.run(JSON.stringify({ ...stored(byAnOldId), decided_by: OLD_ID }), byAnOldId)
    write.run(JSON.stringify({ ...stored(byNobody), decided_by: NOBODY }), byNobody)

    const { takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const stamps: AStampAt[] = []
    const census = takeIdentityCensus(t.client.sqlite, undefined, stamps)
    const atTheField = <T extends { table: string; path: string }>(list: readonly T[]) => list.filter((one) => one.table === 'records' && one.path === PATH)

    expect(atTheField(census.aliases)).toEqual([{ table: 'records', row: byAnOldId, path: PATH, stored: OLD_ID, canonical: LIVE }])
    expect(Object.keys(census.untold).filter((site) => site.includes('decided_by')), 'a value there was counted as one that cannot be told').toEqual([])
    expect(atTheField(census.blocks).map((one) => [one.row, one.reason])).toEqual([[byNobody, 'names-no-agent']])
    const told = atTheField(stamps).map((one) => [one.row, one.stored])
    expect([...told].sort(), "the re-mint's list of stamps is not every value but the owner's").toEqual([[byAnOldId, OLD_ID], [byNobody, NOBODY]].sort())
  })
})
