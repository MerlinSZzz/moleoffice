// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GUARD THAT NOBODY REGISTERED IS A FAILING BUILD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office reserves a handful of acts to the person. Each one is refused by its own `assertMay…`
 * function, and until now the only way to find out how many of them there are was to read
 * `src/server/lib/records.ts` and hope. Two things need that answer: the governance queue, which
 * lists the forks a person still has to answer, and the remote action scope, which is written over
 * the same set. Both were going to keep their own list of guard names.
 *
 * `GOVERNANCE_GUARDS` in lib/records.ts is the one list, and it holds the guard FUNCTIONS rather
 * than their names. This file is what keeps it whole: it imports every file under
 * `src/server/lib/`, finds every exported function whose name begins `assertMay`, and fails when
 * one of them has no entry. So a fourth guard cannot be written without being registered, and
 * whoever writes it finds out on the day rather than in an audit two months later.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SWEEP IS OVER THE DIRECTORY AND NOT OVER ONE FILE
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/settings-and-governance.md` §8.4 asks for it in those words, and says
 * why: another design in the same round exports a guard of its own from a different module. A test
 * scoped to `records.ts` would let that one escape both this list and anything written over it, and
 * the promise that the registry is the one list would be false on arrival.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT PROVE, SAID SO NOBODY TRUSTS IT FURTHER THAN IT GOES
 * ---------------------------------------------------------------------------------------
 *
 * That a guard is CALLED. A guard exported here, registered here, and called from no route at all
 * would pass every assertion below — which is problem `h7Qg4zU2hqvb`, a guard reported as landed
 * that had been written in a worktree nobody merged. Each guard has its own test that drives the
 * real route, and that is where being called is proved.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
// Type-only, so this import is erased before it runs. A value import of records.ts at the top of
// this file would open a database before helpers.ts had pointed MOLE_OFFICE_DB at a throwaway one.
import type { GovernanceGuard } from '../src/server/lib/records.ts'

const LIB = fileURLToPath(new URL('../src/server/lib/', import.meta.url))

/** Every TypeScript file under lib/, including the subdirectories, as absolute paths. */
function everyFileUnder(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...everyFileUnder(path))
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found.sort()
}

/** One exported guard, as the sweep found it. */
interface Found {
  /** The path, relative to the checkout, for a failure message somebody can act on. */
  where: string
  name: string
  fn: (...args: never[]) => void
}

let t: TestDb
let swept: Found[]
let registry: readonly GovernanceGuard[]
let files: string[]

beforeAll(async () => {
  // A THROWAWAY DATABASE FIRST, AND THIS IS NOT A FORMALITY. Importing lib/records.ts imports
  // db/client.ts, which opens whatever `MOLE_OFFICE_DB` names the moment it is loaded. Without this the
  // sweep below would open the owner's own corpus.
  t = await freshDb()
  files = everyFileUnder(LIB)
  swept = []
  let records: Record<string, unknown> | null = null
  for (const file of files) {
    // Imported by absolute path so that the module the registry comes from and the modules the
    // guards come from are the same instances, which is what makes the identity comparison below
    // mean anything.
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    if (file === join(LIB, 'records.ts')) records = module
    for (const [name, value] of Object.entries(module)) {
      if (!name.startsWith('assertMay')) continue
      if (typeof value !== 'function') continue
      swept.push({ where: file.slice(file.indexOf('src/')), name, fn: value as (...args: never[]) => void })
    }
  }
  if (records === null) throw new Error('the sweep did not reach src/server/lib/records.ts')
  registry = records['GOVERNANCE_GUARDS'] as readonly GovernanceGuard[]
})

afterAll(() => {
  t.close()
})

describe('the sweep itself', () => {

  it('finds guards, and finds the ones this repository is known to have', () => {
    expect(swept.length).toBeGreaterThan(0)
    const names = swept.map((g) => g.name).sort()
    expect(names).toContain('assertMayWrite')
    expect(names).toContain('assertMaySettleFork')
    expect(names).toContain('assertMayRemoveAFork')
    // Problem 32iIemHHJSt7: this guard refused an agent for months while it had no `export`
    // keyword, so the sweep never saw it and the registry never held it.
    expect(names).toContain('assertMayRemoveAnExportedBundle')
  })
})

describe('every guard is registered', () => {
  it('has an entry for each exported assertMay function, matched by the function itself', () => {
    // MATCHED BY IDENTITY AND NOT BY NAME. Two files could export a function of the same name, and
    // a registry entry holding the wrong one of them would read as correct in every message and
    // refuse the wrong act.
    const registered = new Set(registry.map((entry) => entry.guard))
    const missing = swept.filter((guard) => !registered.has(guard.fn))
    expect(
      missing.map((g) => `${g.name} (${g.where})`),
      'these guards are exported and have no entry in GOVERNANCE_GUARDS in src/server/lib/records.ts. ' +
        'Add one, saying what the act is, which route performs it, and what it is pending on — or null ' +
        'when the guard refuses an act and there is no queue of objects waiting on it.',
    ).toEqual([])
  })


})

