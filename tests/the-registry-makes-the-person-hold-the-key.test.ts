// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTRY IS THE GATE: EVERY ONE OF THE PERSON'S DECLARED ACTS ASKS FOR THE KEY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P83, point 1: a request is the person only when it carries the person's key. Until
 * that landed, every guard that reserves an act to the person read the caller's own header
 * (`actor.type === 'human'`), so the whole set of the person's acts was open to anything that could
 * reach the port and type one word.
 *
 * `GOVERNANCE_GUARDS` in src/server/lib/records.ts names each act of the person's in its `personAct`
 * field, and `design/permissions/roles.json` under `The person's own acts` is the declaration it
 * names them from. The two must agree, and each guard whose `personAct` is non-null must actually
 * ask the one question `thePersonIsProved` answers.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE GUARD HALF IS BOUND, AND WHY IT IS THE SOURCE AND NOT A LABEL
 * ---------------------------------------------------------------------------------------
 *
 * A label nobody checks is worth nothing, so this file READS THE SOURCE of each guard and asks
 * whether its body calls `thePersonIsProved` or `assertThePersonIsProved`. That is the same shape
 * tests/the-published-refusal-is-the-one-enforced.test.ts uses for the arrival clause, and it is
 * copied on purpose: the registry cannot drift from the code without a red test naming the guard.
 *
 * A source scan proves a clause is written, not that it fires; tests/the-window-keeps-every-
 * trusted-caller-working.test.ts drives the same doors over real sockets and reads the 403.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { GovernanceGuard } from '../src/server/lib/records.ts'

const LIB = fileURLToPath(new URL('../src/server/lib/', import.meta.url))

/** The one call every guard of the person's own acts must make. */
const ASKS_FOR_THE_KEY = ['thePersonIsProved', 'assertThePersonIsProved']

/** Every TypeScript file under lib/, including subdirectories. */
function everyFileUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...everyFileUnder(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found.sort()
}

/**
 * The source of one exported function, from its `export function <name>(` to the next top-level
 * `export`, or to the end of the file. Crude on purpose and checked rather than trusted: the test
 * below asserts a body was found for every registered guard.
 */
function sourceOfExportedFunction(name: string): { where: string; body: string } | null {
  for (const file of everyFileUnder(LIB)) {
    const text = readFileSync(file, 'utf8')
    const start = text.indexOf(`export function ${name}(`)
    if (start === -1) continue
    const after = text.indexOf('\nexport ', start + 1)
    return {
      where: file.slice(file.indexOf('src/')),
      body: after === -1 ? text.slice(start) : text.slice(start, after),
    }
  }
  return null
}

/** Every function any lib file exports, so a guard's helper can be followed by name. */
function everyExportedFunctionName(): string[] {
  const names = new Set<string>()
  for (const file of everyFileUnder(LIB)) {
    for (const found of readFileSync(file, 'utf8').matchAll(/export function (\w+)\(/g)) {
      if (found[1] !== undefined) names.add(found[1])
    }
  }
  return [...names]
}

const EXPORTED_FUNCTION_NAMES = everyExportedFunctionName()

/**
 * DOES THIS GUARD ASK THE KEY QUESTION, directly or through a helper in its own file?
 *
 * Criterion P83, point 1 is one statement of who a proved person is, and the code keeps it in one
 * place: `assertMayChangeTheOfficeScene` delegates to `pixelSettingsRefusal`, which is the same
 * helper the screen's `mayChange` flag asks, so the door and the drawing cannot disagree. A scan
 * that read only the guard's own body would demand the sentence be written twice, which is the
 * defect the delegation removes. So the question is followed ONE level down, and the helper is
 * only accepted when it lives in the guard's own file and is really called by the guard.
 */
function asksForTheKey(guardName: string, found: { where: string; body: string } | null): boolean {
  if (found === null) return false
  if (ASKS_FOR_THE_KEY.some((name) => found.body.includes(name))) return true
  for (const helper of EXPORTED_FUNCTION_NAMES) {
    if (helper === guardName) continue
    if (!new RegExp(`\\b${helper}\\s*\\(`).test(found.body)) continue
    const helperBody = sourceOfExportedFunction(helper)
    if (helperBody === null || helperBody.where !== found.where) continue
    if (ASKS_FOR_THE_KEY.some((name) => helperBody.body.includes(name))) return true
  }
  return false
}

let t: TestDb
let registry: readonly GovernanceGuard[]

beforeAll(async () => {
  // A throwaway database first: importing lib/records.ts opens whatever MOLE_OFFICE_DB names.
  t = await freshDb()
  registry = (await import('../src/server/lib/records.ts')).GOVERNANCE_GUARDS
})

afterAll(() => {
  t.close()
})

describe('every act the registry declares as the person’s asks for the key', () => {
  it('finds the source of every registered guard, so the scan below is reading something', () => {
    const missing = registry
      .map((entry) => ({ name: entry.guard.name, found: sourceOfExportedFunction(entry.guard.name) }))
      .filter((one) => one.found === null || one.found.body.length < 200)
    expect(missing.map((one) => one.name)).toEqual([])
  })

  it('names at least one act of the person’s, so the scan is not vacuous', () => {
    expect(registry.filter((one) => one.personAct !== null).length).toBeGreaterThan(0)
  })

  it('fails when an act declared as the person’s does not ask for the key', () => {
    const silent = registry
      .filter((entry) => entry.personAct !== null)
      .map((entry) => {
        const found = sourceOfExportedFunction(entry.guard.name)
        const asks = asksForTheKey(entry.guard.name, found)
        return { name: entry.guard.name, act: entry.personAct, where: found?.where ?? 'not found', asks }
      })
      .filter((one) => !one.asks)
    expect(
      silent.map((one) => `${one.name} (${one.where}) does not ask for the key for ${one.act}`),
    ).toEqual([])
  })

})
