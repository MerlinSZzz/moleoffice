// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY CARD NAMES THE DOORS THE PERSON'S GRANT NEVER PRESSES, AND THE DOORS IT ASKS ABOUT FIRST, by operation.
 * Wave 13s round 1. The flow design in section 7.
 *
 * The elevation rule in src/config/roles.json holds two lists of door names, `neverPresses` and `askFirst`. A door is
 * named by the operation its route declares in src/shared/ops-list.ts. Two checks stand in front of them, and either
 * stops the server at start:
 *   - the shape, in `problemsWithTheRoleDeclaration` (src/shared/roles.ts): each is a list of names, no name twice, no
 *     name in both lists;
 *   - the names, in `checkTheDoorsAreReal` (src/server/lib/roles.ts): each is a real operation. A guard's act key is
 *     not one, because no request presses it as a door.
 * A misspelt door is a door nothing keeps, and nothing on any screen would look wrong, so the server does not start.
 *
 * MUTATION, after a control run (the report of the run that added this file):
 *   · the operation test in `checkTheDoorsAreReal` taken out → "refuses a misspelt door", "refuses a guard's act key"
 *     and "does not start" are red;
 *   · the door check left out of `readTheRoleCards` → "does not start" is red;
 *   · the repeated-name test in `elevationProblems` taken out → "refuses a door named twice" is red;
 *   · the both-lists test taken out → "refuses a door in both lists" is red;
 *   · the list test taken out → "refuses a list that is missing or not of names" is red.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { checkTheDoorsAreReal, readTheRoleCards, theRoleCardsFile } from '../src/server/lib/roles.ts'
import { problemsWithTheRoleDeclaration, type RolesDeclaration } from '../src/shared/roles.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
// IMPORTED AFTER `freshDb`, which says which database the server's modules open.
let records: typeof import('../src/server/lib/records.ts')

/** The shipped cards, read off the disk fresh for each case. */
function theShippedCards(): RolesDeclaration {
  return JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as RolesDeclaration
}

/** The shipped cards with one change to the elevation rule. */
function theCardsWith(change: (rule: Record<string, unknown>) => void): RolesDeclaration {
  const decl = theShippedCards()
  change(decl.elevation as unknown as Record<string, unknown>)
  return decl
}

let folder: string | null = null

beforeAll(async () => {
  t = await freshDb()
  records = await import('../src/server/lib/records.ts')
}, 60_000)

afterAll(() => {
  t?.close()
})

afterEach(() => {
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
})

describe('the shipped card', () => {
  it('names its doors in two lists, each door a real operation', () => {
    const decl = theShippedCards()
    expect(problemsWithTheRoleDeclaration(decl)).toEqual([])
    expect(checkTheDoorsAreReal(decl)).toEqual([])
    expect(decl.elevation.neverPresses.length).toBeGreaterThan(0)
    expect(Array.isArray(decl.elevation.askFirst)).toBe(true)
  })
})

describe('the names', () => {
  it('refuses a misspelt door', () => {
    const decl = theCardsWith((rule) => {
      rule['askFirst'] = ['record.promotes']
    })
    expect(checkTheDoorsAreReal(decl)).toEqual([expect.stringContaining('askFirst names the door "record.promotes", which is not an operation')])
  })

  it("refuses a guard's act key, which names no door a request presses", () => {
    const decl = theCardsWith((rule) => {
      rule['neverPresses'] = [...(rule['neverPresses'] as string[]), 'regulation.revoke']
    })
    expect(checkTheDoorsAreReal(decl)).toEqual([expect.stringContaining('neverPresses names the door "regulation.revoke"')])
  })

  it('does not start with a door that is not an operation', () => {
    folder = mkdtempSync(join(tmpdir(), 'mole-office-roles-'))
    const file = join(folder, 'roles.json')
    const decl = theCardsWith((rule) => {
      rule['neverPresses'] = ['office.shut-down-everything']
    })
    writeFileSync(file, JSON.stringify(decl, null, 2))
    expect(() => readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]), file })).toThrow(
      /did not start[\s\S]*neverPresses names the door "office\.shut-down-everything"/,
    )
  })
})

describe('the shape', () => {
  it('refuses a door named twice', () => {
    const decl = theCardsWith((rule) => {
      rule['askFirst'] = ['record.promote', 'record.promote']
    })
    expect(problemsWithTheRoleDeclaration(decl)).toContainEqual(expect.stringContaining('askFirst names record.promote more than once'))
  })

  it('refuses a door in both lists', () => {
    const decl = theCardsWith((rule) => {
      rule['askFirst'] = [(rule['neverPresses'] as string[])[0]!]
    })
    expect(problemsWithTheRoleDeclaration(decl)).toContainEqual(expect.stringContaining('both in neverPresses and in askFirst'))
  })

  it('refuses a list that is missing or not of names', () => {
    for (const [key, value] of [
      ['neverPresses', undefined],
      ['askFirst', 'record.promote'],
      ['askFirst', [3]],
      ['neverPresses', ['']],
    ] as const) {
      const decl = theCardsWith((rule) => {
        if (value === undefined) delete rule[key]
        else rule[key] = value
      })
      expect(problemsWithTheRoleDeclaration(decl), `${key}: ${JSON.stringify(value)}`).toContainEqual(
        expect.stringContaining(`${key} is not a list of operation names`),
      )
    }
  })
})
