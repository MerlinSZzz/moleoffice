// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING THE ROLE CARDS OFF THE DISK, ONCE, WHEN THE SERVER STARTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE AND NOT A TYPESCRIPT DECLARATION
 * ---------------------------------------------------------------------------------------
 *
 * There is a template, so that a user can define a role of their own. A role written in TypeScript
 * is a role only somebody who can edit TypeScript can add, which undoes most of the point of
 * defining your own. So the cards are `design/permissions/roles.json`, this reads
 * them, and everything else in the product reads what this hands back. There is no second list.
 *
 * ---------------------------------------------------------------------------------------
 * A BAD FILE STOPS THE SERVER, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * A card with a part missing, an act nothing publishes or a chapter that does not exist is a
 * permission nobody can enforce. Serving anyway would mean serving a product whose refusals are
 * whatever survived the parse, and nothing on any screen would look wrong. So this throws, the boot
 * fails, and the message names every problem at once rather than the first one.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS READ ONCE, AT THE START, AND ASKING BEFORE THAT IS AN ERROR
 * ---------------------------------------------------------------------------------------
 *
 * Re-reading per request would mean two requests in one second could be answered under two
 * different sets of rules with nothing saying which. So `readTheRoleCards` is called once, from
 * `buildApp`, and `theRoleCards` hands back what it read. Asking before anything has read them
 * throws rather than reading them itself: a reader that quietly loaded a file would be a second
 * moment the rules could come from, and which one a request got would depend on import order.
 *
 * WHY THE ACT VOCABULARY IS PASSED IN. Half of it is the operation names, which live in `shared`.
 * The other half is the `actKey` on each governance guard, which lives in `lib/records.ts` — and
 * that file is on the record write path, so importing it here would make a loop the first time
 * anything on that path wants to know a role. `buildApp` holds both and hands them over.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { REPO_ROOT } from '../../config/settings.mjs'
import { checkTheActsAreReal, problemsWithTheRoleDeclaration, type RolesDeclaration } from '@shared/roles.ts'
import { OPERATIONS } from '@shared/ops.ts'
import { THE_NAMES_BESIDE_THE_DOORS } from '@shared/what-the-grant-carries.ts'

/** Where the cards live, relative to this checkout. One place, so the path is never typed twice. */
export const ROLE_CARDS_FILE = join('src', 'config', 'roles.json')

/** The whole path, so a caller that only wants to name the file does not build it again. */
export function theRoleCardsFile(): string {
  return join(REPO_ROOT, ROLE_CARDS_FILE)
}

let held: RolesDeclaration | null = null
let joined: RolesDeclaration | null = null
let publishedActs: ReadonlySet<string> = new Set()

function refuse(file: string, problems: readonly string[]): never {
  throw new Error(
    `${file} is not a usable set of role cards, so Mole Office did not start. ` +
      `${String(problems.length)} thing${problems.length === 1 ? '' : 's'} to fix:\n  - ${problems.join('\n  - ')}`,
  )
}

/**
 * EVERY ACT KEY A CARD MAY NAME, from the two published sources.
 *
 * `guardActKeys` is the keys the guard registry names, handed in by the caller. It holds BOTH of the
 * registry's keys: the `actKey` of a guard whose act is also refused from another machine, and the
 * `personAct` of a guard that stands in front of one of the person's own acts. A null in either
 * place is a guard that names no act there, and it contributes nothing.
 */
export function everyActThatCanBeNamed(guardActKeys: readonly (string | null)[]): ReadonlySet<string> {
  const acts = new Set<string>(OPERATIONS.map((one) => one.name))
  for (const key of guardActKeys) if (key !== null) acts.add(key)
  return acts
}

/**
 * WHICH DOORS THE ELEVATION RULE NAMES THAT NO ROUTE DECLARES. Its lists, `neverPresses`, `askFirst` and
 * `neverOnItsOwnFiling`, name doors by the operation each door's route declares (src/shared/ops-list.ts). A misspelt
 * door is a door nothing keeps, and nothing on any screen would look wrong, so the server does not start. A governance
 * guard's act key names no door a request presses. The first two may also name a part beside the doors
 * (src/shared/what-the-grant-carries.ts), which a door asks about by that name.
 */
export function checkTheDoorsAreReal(decl: RolesDeclaration): string[] {
  const operations = new Set<string>(OPERATIONS.map((one) => one.name))
  const beside = new Set<string>(Object.keys(THE_NAMES_BESIDE_THE_DOORS))
  const said: string[] = []
  for (const key of ['neverPresses', 'askFirst', 'neverOnItsOwnFiling'] as const) {
    for (const door of decl.elevation[key]) {
      if (operations.has(door) || (key !== 'neverOnItsOwnFiling' && beside.has(door))) continue
      said.push(
        `The elevation rule's ${key} names the door "${door}", which is not an operation in src/shared/ops-list.ts` +
          (key === 'neverOnItsOwnFiling' ? '. ' : ' and not a name beside the doors in src/shared/what-the-grant-carries.ts. ') +
          'A door is named by the operation its route declares.',
      )
    }
  }
  return said
}

/**
 * Read the cards, check them, and hold them for the life of the process.
 *
 * Called once from `buildApp`. A test that wants a different set of cards calls it with its own
 * file after `forgetTheRoleCards()`.
 */
export function readTheRoleCards(input: {
  guardActKeys: readonly (string | null)[]
  file?: string
}): RolesDeclaration {
  const file = input.file ?? theRoleCardsFile()

  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(
      `Mole Office could not read ${file}, so it did not start. That file holds the role cards, which are the only ` +
        'place saying what an agent of each role may do. Nothing infers a set of roles from anything else.',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (why) {
    throw new Error(`${file} is not JSON, so Mole Office did not start: ${String(why)}`)
  }

  const problems = problemsWithTheRoleDeclaration(parsed)
  if (problems.length > 0) refuse(file, problems)

  const decl = parsed as RolesDeclaration
  const wrongActs = [...checkTheActsAreReal(decl, everyActThatCanBeNamed(input.guardActKeys)), ...checkTheDoorsAreReal(decl)]
  if (wrongActs.length > 0) refuse(file, wrongActs)

  held = decl
  joined = null
  publishedActs = everyActThatCanBeNamed(input.guardActKeys)
  return decl
}

/** Shipped and valid added cards for every reader. Throws when nothing has read the shipped cards, rather than reading. */
export function theRoleCards(): RolesDeclaration {
  if (held === null) {
    throw new Error(
      'Nothing has read the role cards yet, and this asked for them. They are read once, when the server starts, ' +
        'by readTheRoleCards in buildApp. A reader that loaded them here instead would be a second moment the ' +
        'rules could come from, and which one a request got would depend on import order.',
    )
  }
  return joined ?? held
}

/** The shipped declaration stays available for locks and for the office's own checker. */
export function theShippedRoleCards(): RolesDeclaration {
  if (held === null) theRoleCards()
  return held!
}

export function thePublishedRoleActs(): ReadonlySet<string> { return publishedActs }

/** Rebuild once after loading saved cards. Request readers share this same snapshot. */
export function joinAddedRoleCards(cards: RolesDeclaration['cards']): void {
  const shipped = theShippedRoleCards()
  const snapshot = { ...shipped, cards: [...shipped.cards, ...cards], shippedCards: shipped.cards }
  // A test that reloads its own file gets the same declaration shape when no added card exists.
  joined = cards.length === 0 ? shipped : snapshot
}

/** Whether the cards have been read. For a caller that has to work either way, and says which. */
export function theRoleCardsAreRead(): boolean {
  return held !== null
}

/** Read them again on the next call. For tests, which point this at a file of their own. */
export function forgetTheRoleCards(): void {
  held = null
  joined = null
  publishedActs = new Set()
}
