// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S OWN ACTS ARE NAMED ONCE: THE DECLARATION AND THE GUARD REGISTRY HOLD THE SAME SET.
 *
 * Report `jT4wVUdiwdiI` found 21 acts only the person may do, and they came from two places that
 * did not know about each other: 11 were declared under `The person's own acts` in
 * `design/permissions/roles.json`, and 10 more were kept by `GOVERNANCE_GUARDS` in
 * lib/records.ts and named by no power at all. The ten are
 * declared too, one table read by the role gate, the refusal sentences and GET /api/access, as R1 of a decision
 * says.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS, AND WHY A DIFF IS THE RIGHT SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * The declaration is the authority. The registry says, in `personAct`, which act in the declaration
 * each guard stands in front of. A second list of the same acts is exactly the defect this
 * repository names as its own, so this file does not check that the counts match: it reads both and
 * asserts the SETS are equal, in both directions.
 *
 * A control is asserted first, because an equality of two empty sets is also an equality. The two
 * counts are then named, so a reader can tell ten missing from one.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const DECLARATION = theRoleCardsFile()

interface DeclaredAct {
  act: string
  inWords: string
}

/** The declaration as JSON text, nothing read through a type. */
function theDeclaration(): {
  powers: { name: string; acts: DeclaredAct[] }[]
  elevation: { givesThePower: string }
} {
  return JSON.parse(readFileSync(DECLARATION, 'utf8')) as {
    powers: { name: string; acts: DeclaredAct[] }[]
    elevation: { givesThePower: string }
  }
}

/** The acts under the one power an elevation hands over — the person's own. */
function actsTheDeclarationCallsTheirs(): DeclaredAct[] {
  const decl = theDeclaration()
  const power = decl.powers.find((one) => one.name === decl.elevation.givesThePower)
  if (power === undefined) throw new Error(`the declaration has no power named "${decl.elevation.givesThePower}"`)
  return power.acts
}

let t: TestDb
let registry: readonly { guard: { name: string }; act: string; personAct: string | null }[]

beforeAll(async () => {
  // A THROWAWAY DATABASE FIRST: importing lib/records.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  registry = (await import('../src/server/lib/records.ts')).GOVERNANCE_GUARDS
})

afterAll(() => {
  t.close()
})

describe('the two sources name the same set of person-only acts', () => {
  it('has acts on both sides, so an empty equality cannot pass for the rule', () => {
    const declared = actsTheDeclarationCallsTheirs()
    const fromRegistry = registry.filter((one) => one.personAct !== null)
    expect(declared.length).toBeGreaterThan(0)
    expect(fromRegistry.length).toBeGreaterThan(0)
  })

  it('declares every act the registry keeps for the person, and no act it does not', () => {
    const declared = actsTheDeclarationCallsTheirs().map((one) => one.act).sort()
    const fromRegistry = registry
      .filter((one) => one.personAct !== null)
      .map((one) => one.personAct as string)
      .sort()
    expect(fromRegistry).toEqual(declared)
  })

})

