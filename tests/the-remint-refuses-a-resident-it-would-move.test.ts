// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT REFUSES A RESIDENT IT WOULD GIVE A NEW ID. Wave 13s round 166, item 30c part 3.
 *
 * A permanent resident's personal space is the folder named by the resident's id, made when it was confirmed
 * (theSpaceOf in src/server/lib/residents.ts). The re-mint gives every legacy agent a new id and moves no folder, so
 * after it nothing would find a legacy resident's space. Until a space is found by something the re-mint keeps, a
 * legacy resident stops the re-mint: the map is not made, a map made before is stopped, and nothing is staged or
 * written. Here a throwaway office holds made-up agents, some of them residents. Cases:
 *   1. a legacy agent that is a resident, live or retired, stops the map, each named by its id and handle with the
 *      reason; a minted resident does not, because it keeps its id; with no legacy resident the map is made;
 *   2. a map made before a legacy agent became a resident is stopped by the resident, and not only by the changed row,
 *      and the write refuses it and changes no id;
 *   3. staging refuses while a legacy resident is there, and writes no file; once it is not, a map is staged.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-refuses-a-resident-it-would-move.test.ts
 * After a green control, copy src/server/lib/registry-aliases/remint-map.ts, then make one of these changes:
 *   1. put `[...uncertain]` in place of `[...uncertain, ...residents]`: the map is made, and cases 1 and 3 go red;
 *   2. put `true` in place of `row['resident_since'] === null`: no resident stops anything, and cases 1, 2 and 3 go red;
 *   3. delete the line `if (from === 'legacy') { const stop = whyAResidentStopsTheRemint(row); if (stop !== null) stops.push(stop) }`:
 *      a map made before is stopped only by the changed row, and case 2 goes red;
 *   4. put `.from !== 'uncertain' ?` in place of `.from === 'legacy' ?`, where the residents are read for the map: a
 *      minted resident stops it, and case 1 goes red.
 * Restore the file with cp after each change, check it with cmp, and run the command again for green.
 *
 * Every id, handle and time here is made up, in a throwaway office.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
beforeEach(async () => { t = await freshDb(); madeUpRegistry() })
afterEach(() => t?.close())

const map = () => import('../src/server/lib/registry-aliases/remint-map.ts')
const db = () => t.client.sqlite

const LEGACY_LIVE = 'legacy-lark'
const LEGACY_RETIRED = 'legacy-wren'
const LEGACY_PLAIN = 'legacy-tern'
const MINTED = { id: 'MintedLive_1', handle: 'minted-live' }
const SINCE = '2026-10-31 04:00:00'

function anAgent(id: string, handle: string, retired = false): void {
  db().prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)').run(id, `Made-up ${handle}`, handle, 'made-up-asset', '2026-01-01 00:00:00', retired ? 1 : 0)
}
function madeUpRegistry(): void {
  db().prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)').run('made-up-asset', 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  anAgent(LEGACY_LIVE, LEGACY_LIVE)
  anAgent(LEGACY_RETIRED, LEGACY_RETIRED, true)
  anAgent(LEGACY_PLAIN, LEGACY_PLAIN)
  anAgent(MINTED.id, MINTED.handle)
}
/** Makes an agent a resident, as the confirm press writes the residency, with made-up records. */
function aResident(id: string): void {
  db().prepare(
    "UPDATE agents SET resident_since = ?, resident_proposal = ?, resident_decision = ?, resident_confirmed_by_kind = 'person', resident_confirmed_by_id = 'made-up-person' WHERE id = ?",
  ).run(SINCE, `proposal-of-${id}`, `decision-of-${id}`, id)
}
function noLongerAResident(id: string): void {
  db().prepare('UPDATE agents SET resident_since = NULL, resident_proposal = NULL, resident_decision = NULL, resident_confirmed_by_kind = NULL, resident_confirmed_by_id = NULL WHERE id = ?').run(id)
}
/** A generator that gives these ids in turn, and fails the test when it runs out. */
function theseIds(...ids: string[]): () => string {
  let next = 0
  return () => {
    const id = ids[next++]
    if (id === undefined) throw new Error('The made-up generator ran out of ids.')
    return id
  }
}
const NEW_IDS = ['NewIdNumber1', 'NewIdNumber2', 'NewIdNumber3', 'NewIdNumber4', 'NewIdNumber5']
const theIds = () => (db().prepare('SELECT id FROM agents ORDER BY id').all() as { id: string }[]).map((row) => row.id)
/** The refusals that name this agent by its id and handle and give the resident's reason. */
const namingTheResident = (said: readonly string[], reason: string, id: string, handle: string) =>
  said.filter((one) => one.includes(JSON.stringify(id)) && one.includes(JSON.stringify(handle)) && one.includes(reason))

describe('the re-mint and the permanent residents', () => {
  it('1. a legacy resident, live or retired, stops the map, named with the reason; a minted resident does not', async () => {
    const { planTheRemint, A_RESIDENT_STOPS_THE_REMINT } = await map()
    const before = planTheRemint(db(), theseIds(...NEW_IDS))
    expect('map' in before, JSON.stringify(before)).toBe(true)

    aResident(MINTED.id)
    const withAMintedResident = planTheRemint(db(), theseIds(...NEW_IDS))
    expect('map' in withAMintedResident, JSON.stringify(withAMintedResident)).toBe(true)

    aResident(LEGACY_LIVE)
    aResident(LEGACY_RETIRED)
    const plan = planTheRemint(db(), theseIds(...NEW_IDS))
    expect('refused' in plan, JSON.stringify(plan)).toBe(true)
    const refused = 'refused' in plan ? plan.refused : []
    expect(refused).toHaveLength(2)
    expect(namingTheResident(refused, A_RESIDENT_STOPS_THE_REMINT, LEGACY_LIVE, LEGACY_LIVE)).toHaveLength(1)
    expect(namingTheResident(refused, A_RESIDENT_STOPS_THE_REMINT, LEGACY_RETIRED, LEGACY_RETIRED)).toHaveLength(1)
    expect(refused.some((one) => one.includes(JSON.stringify(MINTED.id)) || one.includes(JSON.stringify(LEGACY_PLAIN)))).toBe(false)
  })

  it('2. a map made before a legacy agent became a resident is stopped by the resident, and the write changes no id', async () => {
    const { planTheRemint, whatStopsTheMap, A_RESIDENT_STOPS_THE_REMINT } = await map()
    const { writeTheRemint } = await import('../src/server/lib/registry-aliases/remint-write.ts')
    const plan = planTheRemint(db(), theseIds(...NEW_IDS))
    if (!('map' in plan)) throw new Error(`The map was not made: ${plan.refused.join(' ')}`)
    expect(whatStopsTheMap(db(), plan.map)).toEqual([])

    aResident(LEGACY_LIVE)
    const stops = whatStopsTheMap(db(), plan.map)
    expect(namingTheResident(stops, A_RESIDENT_STOPS_THE_REMINT, LEGACY_LIVE, LEGACY_LIVE)).toHaveLength(1)
    expect(stops.filter((one) => one.includes(A_RESIDENT_STOPS_THE_REMINT))).toHaveLength(1)

    const ids = theIds()
    const written = writeTheRemint(db(), plan.map)
    expect('refused' in written, JSON.stringify(written)).toBe(true)
    expect(namingTheResident('refused' in written ? written.refused : [], A_RESIDENT_STOPS_THE_REMINT, LEGACY_LIVE, LEGACY_LIVE)).toHaveLength(1)
    expect(theIds()).toEqual(ids)
  })

  it('3. staging refuses while a legacy resident is there and writes no file, and stages once it is not', async () => {
    const { A_RESIDENT_STOPS_THE_REMINT } = await map()
    const { stageTheRemint } = await import('../src/server/db/remint-migration.ts')
    aResident(LEGACY_PLAIN)
    const refusedFile = join(dirname(t.file), 'refused-remint.json')
    expect(() => stageTheRemint(db(), refusedFile, [], theseIds(...NEW_IDS))).toThrow(A_RESIDENT_STOPS_THE_REMINT)
    expect(existsSync(refusedFile)).toBe(false)

    noLongerAResident(LEGACY_PLAIN)
    const stagedFile = join(dirname(t.file), 'staged-remint.json')
    const staged = stageTheRemint(db(), stagedFile, [], theseIds(...NEW_IDS))
    expect(existsSync(stagedFile)).toBe(true)
    expect(staged.map.entries.find((entry) => entry.oldId === LEGACY_PLAIN)?.from).toBe('legacy')
  })
})
