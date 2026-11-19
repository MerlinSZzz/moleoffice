// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PERSON-ONLY CHECK IN THE SERVER IS SORTED: CARRIED BY A RAISE, OR KEPT FOR THE OWNER. A raised secretary holds
 * the owner's acts but a few. The secretary's answers m0ciRes8jDRM named the few: closing the
 * key window, any write of a regulation, changing who the owner is with the doors that decide who the person is, and
 * the owner's keys, logins and summons settings. Those settings moved later. A secretary sets
 * those for the owner on the owner's words or under the owner's raise, so their doors ask the card and then the owner's
 * words or the owner's raise (`theSecretaryActingForThePerson`, which asks `actsForThePerson`).
 *
 * A door that asks `thePersonIsProved` or `assertThePersonIsProved` keeps an act for the owner. The folder
 * tests/person-only-checks/ holds one file for every file that asks it, saying how many times, and whether what it keeps is carried by a raise (the file asks `aRaiseCarriesIt`, or
 * `actsForThePerson`, which asks it), kept for the owner (it asks neither), mixed, a secretary's already (a secretary does it
 * with its own key and no raise), or not an act at all (what a read shows). A
 * new check, in a new file or an old one, turns this red until somebody sorts it, so no door can be added that a raise
 * silently opens or silently misses. Owner-decided settings may also be carried on words only:
 * the caller requires a warrant before it asks the secretary helper, so a raise alone is refused.
 *
 * MUTATION, NAMED, AFTER A CONTROL RUN (the report of the run that added this file): the raise taken out of the goal
 * spans' guard turns the carried check red.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))

type Sort = 'on words only' | 'carried' | 'kept' | 'mixed' | 'not an act' | "a secretary's already"

/**
 * Every file that keeps an act for the owner, how many checks it holds, and how each is sorted, with the reason. One file
 * in tests/person-only-checks/ for each, at the server file's path under src/server with .json for .ts: so the sort of
 * src/server/api/goal-spans.ts is tests/person-only-checks/api/goal-spans.json. Its keys are `sort`, `checks`, `why`, and
 * `background` where a decision stands behind it.
 *
 * ONE FILE EACH, NOT ONE LIST, in wave 13t round 36. The sorts were
 * one list in this file, and branches that each sorted a new door added a row at the end of the same
 * group, or changed counts on neighbouring
 * lines, so the two could not both be merged. A new door now adds its own file, or changes its own file's count.
 */
const SORTED_FOLDER = join(CHECKOUT, 'tests', 'person-only-checks')
const SORTS: readonly Sort[] = ['on words only', 'carried', 'kept', 'mixed', 'not an act', "a secretary's already"]

function readTheSorts(): Record<string, { sort: Sort; checks: number; why: string }> {
  const out: Record<string, { sort: Sort; checks: number; why: string }> = {}
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      const where = relative(CHECKOUT, path)
      if (!name.endsWith('.json')) throw new Error(`${where} is not a .json file, so it sorts nothing`)
      const one = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      const unknown = Object.keys(one).filter((key) => !['sort', 'checks', 'why', 'background'].includes(key))
      if (unknown.length > 0) throw new Error(`${where} has keys this reader does not know: ${unknown.join(', ')}`)
      if (!SORTS.includes(one['sort'] as Sort)) throw new Error(`${where}: "sort" is not one of ${SORTS.join(', ')}`)
      if (!Number.isInteger(one['checks']) || (one['checks'] as number) < 1) throw new Error(`${where}: "checks" is not a whole number above 0`)
      if (typeof one['why'] !== 'string' || one['why'].trim() === '') throw new Error(`${where}: "why" is empty`)
      const file = `src/server/${relative(SORTED_FOLDER, path).replace(/\.json$/, '.ts')}`
      out[file] = { sort: one['sort'] as Sort, checks: one['checks'] as number, why: one['why'] as string }
    }
  }
  walk(SORTED_FOLDER)
  return out
}

const SORTED = readTheSorts()

/** Every .ts file under src/server, as a path from the checkout. */
function theServerFiles(): string[] {
  const out: string[] = []
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.ts')) out.push(relative(CHECKOUT, path))
    }
  }
  walk(join(CHECKOUT, 'src', 'server'))
  return out
}

/** How many person-only checks a file's code holds: calls, not the definitions and not the comments. */
function checksIn(text: string): number {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .filter((line) => !/function (assertThePersonIsProved|thePersonIsProved|thePersonPressedItThemselves)\(/.test(line))
    .reduce((sum, line) => sum + (line.match(/\b(assertThePersonIsProved|thePersonIsProved|thePersonPressedItThemselves)\(/g) ?? []).length, 0)
}

const asksTheRaise = (text: string): boolean => /\b(aRaiseCarriesIt|actsForThePerson|theSecretaryActingForThePerson)\(/.test(text)

describe('every person-only check in the server', () => {
  const found = Object.fromEntries(
    theServerFiles()
      .map((file) => [file, readFileSync(join(CHECKOUT, file), 'utf8')] as const)
      .filter(([, text]) => checksIn(text) > 0),
  )


  it('asks the raise where the list says it is carried, and not where it says it is kept', () => {
    for (const [file, one] of Object.entries(SORTED)) {
      const text = found[file] ?? ''
      if (one.sort === 'carried' || one.sort === 'mixed') expect(asksTheRaise(text), `${file}: ${one.why}`).toBe(true)
      if (one.sort === 'on words only') expect(/\b(aRaiseCarriesIt|actsForThePerson)\(/.test(text), `${file}: ${one.why}`).toBe(false)
      if (one.sort === 'kept') expect(asksTheRaise(text), `${file}: ${one.why}`).toBe(false)
      if (one.sort === "a secretary's already") expect(/\b(theKeyProvesASecretary|maySpeakForTheSecretary|whatTheCallersOwnKeyProvesForThisAct)\(/.test(text), `${file}: ${one.why}`).toBe(true)
    }
  })
})
