// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP OFFICE HOLDS THE LINKS THE HORIZONS AND EDIT READS ASK FOR.
 *
 * Round 2 of line 14c, item 6. GET /api/links was narrowed in round 1 so each page asks only the links it shows,
 * but two of its reads were measured only empty because the made-up office held no link of their types:
 * Horizons asks `typeToKind=serves:goal,realises:planned_state,instead_of:planned_state&shape=answer`
 * (src/web/pages/HorizonsPage.tsx:163), and Edit asks `type=implements&toId=<block>&shape=draw`
 * (src/web/components/graph/Edit.tsx:1154 and :1157). tests/the-office-at-the-live-scale.ts now adds the four kinds
 * to the 13 November scale, after the four kinds it already wrote, so those keep their counts and their order.
 *
 * THIS FILE BUILDS TWO SMALL OFFICES at oneIn(13-november, 20): one with the new counts, and one with the same
 * scale and the four new counts at 0. It does not build a full office, and it never copies a database.
 * oneIn divides the four new fields too: at one in twenty this build makes 1 `serves`, 1 `realises`, 1 `instead_of`
 * and 26 `implements` links.
 *
 *   1  each new type runs from a module to the kind its type names; the count of each type is the scale's own field;
 *      no `implements` link points at a deleted block, because this office has no deleted block;
 *   2  the four old kinds are the same rows, in the same order, as the build with the new counts at 0, so their
 *      counts and their order did not move;
 *   3  no path of `serves`, `realises` or `instead_of` leads back to where it started.
 *
 * MUTATION: the planned one is a count or a from/to kind in the new links step of the scale file; either turns case 1
 * red, and a from side that is not a module also turns case 3 red. The file is put back with cp, checked with sha256sum,
 * and this file is run again for green.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, oneIn, THE_LIVE_OFFICE_ON_13_NOVEMBER, type AScale } from './the-office-at-the-live-scale.ts'

const SCALE = oneIn(THE_LIVE_OFFICE_ON_13_NOVEMBER, 20)
/** The same office before the new links: the four counts are the only thing taken away. */
const WITHOUT_THE_READ_LINKS: AScale = {
  ...SCALE,
  servesToGoals: 0,
  realisesToPlannedStates: 0,
  insteadOfToPlannedStates: 0,
  implementsToBlocks: 0,
}
const OLD_TYPES = ['relates_to', 'about', 'discusses', 'measures'] as const
type LinkRow = { id: string; fromId: string; toId: string; type: string; createdAt: string }
type NewLinkRow = { type: string; fromKind: string; toKind: string; deletedAt: string | null; n: number }

let withTheLinks: TestDb
let withoutTheLinks: TestDb

/** The links of `types`, in the order the build stored them. */
function linksOf(db: TestDb, types: readonly string[]): LinkRow[] {
  return db.client.sqlite
    .prepare(`select id, from_id as fromId, to_id as toId, type, created_at as createdAt from links where type in (${types.map(() => '?').join(', ')}) order by rowid`)
    .all(...types) as LinkRow[]
}

beforeAll(async () => {
  withTheLinks = await freshDb()
  buildTheOfficeAtAScale(withTheLinks.client.sqlite, THE_TEST_OFFICES_OWNER.id, SCALE)
  withoutTheLinks = await freshDb()
  buildTheOfficeAtAScale(withoutTheLinks.client.sqlite, THE_TEST_OFFICES_OWNER.id, WITHOUT_THE_READ_LINKS)
}, 240_000)

afterAll(() => {
  withTheLinks?.close()
  withoutTheLinks?.close()
})

it('makes each new type from a module to the kind its type names, and no implements link at a deleted block', () => {
  const rows = withTheLinks.client.sqlite
    .prepare(
      `select l.type, f.kind as fromKind, t.kind as toKind, t.deleted_at as deletedAt, count(*) as n
       from links l join records f on f.id = l.from_id join records t on t.id = l.to_id
       where l.type in ('serves', 'realises', 'instead_of', 'implements')
       group by l.type, f.kind, t.kind, t.deleted_at
       order by l.type`,
    )
    .all() as NewLinkRow[]
  expect(rows).toEqual([
    { type: 'implements', fromKind: 'module', toKind: 'block', deletedAt: null, n: SCALE.implementsToBlocks },
    { type: 'instead_of', fromKind: 'module', toKind: 'planned_state', deletedAt: null, n: SCALE.insteadOfToPlannedStates },
    { type: 'realises', fromKind: 'module', toKind: 'planned_state', deletedAt: null, n: SCALE.realisesToPlannedStates },
    { type: 'serves', fromKind: 'module', toKind: 'goal', deletedAt: null, n: SCALE.servesToGoals },
  ])
  // The count of each type is the scale's, read here rather than copied.
  expect(Object.fromEntries(rows.map((one) => [one.type, one.n]))).toEqual({
    serves: SCALE.servesToGoals,
    realises: SCALE.realisesToPlannedStates,
    instead_of: SCALE.insteadOfToPlannedStates,
    implements: SCALE.implementsToBlocks,
  })
}, 60_000)

it('keeps the four old kinds at the counts and in the order the build made before the new links', () => {
  const before = linksOf(withoutTheLinks, OLD_TYPES)
  const after = linksOf(withTheLinks, OLD_TYPES)
  expect(after.length).toBeGreaterThan(0)
  expect(after).toEqual(before)
}, 60_000)

it('has no serves, realises or instead_of path that leads back to where it started', () => {
  const rows = linksOf(withTheLinks, ['serves', 'realises', 'instead_of'])
  const next = new Map<string, string[]>()
  for (const one of rows) next.set(one.fromId, [...(next.get(one.fromId) ?? []), one.toId])
  const leadsBack = (start: string, at: string, seen: Set<string>): boolean => {
    for (const to of next.get(at) ?? []) {
      if (to === start) return true
      if (seen.has(to)) continue
      seen.add(to)
      if (leadsBack(start, to, seen)) return true
    }
    return false
  }
  const backToItself = [...next.keys()].filter((start) => leadsBack(start, start, new Set([start])))
  expect(backToItself).toEqual([])
}, 60_000)
