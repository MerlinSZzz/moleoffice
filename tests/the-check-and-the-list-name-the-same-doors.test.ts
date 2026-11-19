// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY DOOR THE GRANT'S CHECK IS ASKED ABOUT IS A DOOR THE LIST NAMES, AND EVERY DOOR THE LIST SAYS ASKS IT DOES. Wave 13s
 * round 2a.
 *
 * The check asks about a press by the names of its door: the route's operation, the act the role gate asks about for
 * it, and the parts the guard names beside it. Each office's person may give any door the list names an answer of their
 * own (src/shared/what-the-grant-carries.ts). A name the check is asked about that the list does not name is never looked
 * up in this office's table, so the card's answer stands there and the person cannot change it, while the page shows
 * nothing about it. A door the list says asks the check, and that does not, shows the person an answer nothing reads.
 *
 * THE FOLDER tests/where-the-grant-check-is-asked/ HOLDS ONE FILE FOR EVERY SERVER FILE THAT CALLS THE CHECK, at the server
 * file's path under src/server with .json for .ts. Its keys are `doors`, every door and part that reaches the file's calls,
 * and `why`. One file each, as the folder of person-only checks has, so two branches that each add a calling file change
 * two files. A call is a line that is not a comment and names one of the check's four entry points with an opening
 * bracket, counted as that folder's test counts. How many calls a file holds is read from the file each time and is not
 * written in the folder, because a number copied into a test turns it red whenever another line adds a call
 * (a settled decision).
 *
 * WHAT THIS DOES NOT CATCH. The doors in a file were traced by reading, from the route to the call. A new call in a file
 * the folder already holds, and a new route that reaches an old call, turn nothing here red; their doors are traced by
 * reading. The write guard of the kinds only the person
 * may write is reached by every door that writes such a record; the doors named for it are the record doors that take
 * any kind and the doors that write one of those kinds themselves, and a door that writes one through a shared function
 * further away was not traced.
 *
 * A DOOR THAT ALSO NEEDS THE PERSON'S WORDS. A guard that lets a secretary through only when it brings the person's words
 * for the one change refuses the grant alone, whatever the list answers. The page and the line that tells a secretary it
 * was raised say so of the doors on the fixed list of those (src/shared/what-the-grant-carries.ts). The last check finds
 * such a guard as a call line that refuses a caller with no warrant before it asks the check, and holds every door it
 * finds to the fixed list. A guard that asks for the words in another shape is not found. The fixed list may also hold a
 * door whose guard asks the check without words, when the file writes a card's words, because a change to a card's words
 * needs the person's words and a decision of the owner's whatever the list answers (src/server/lib/card-words.ts); the
 * last check holds every other door on the fixed list to the shape it finds. And no door the secretary card asks the
 * person about first has that shape, so the card's answer is what a secretary with no words hears.
 *
 * MUTATION, NAMED, AFTER A CONTROL RUN (the report of the run that added this file): a door taken off the list turns the
 * second check red naming it. A call added to a server file the folder does not hold, or a folder file taken away, turns
 * the first check red naming the file (the report of the run that took the counts out).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isOperationName } from '../src/shared/ops.ts'
import { THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS, THE_DOORS_THAT_DO_NOT_ASK_YET, THE_NAMES_BESIDE_THE_DOORS } from '../src/shared/what-the-grant-carries.ts'
import { THE_DOORS_THE_LIST_NAMES } from '../src/shared/what-the-grant-carries-words.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const FOLDER = join(CHECKOUT, 'tests', 'where-the-grant-check-is-asked')

/** The check's four entry points. Each of the last three asks the first. */
const THE_ENTRY_POINTS = ['mayPressForThePerson', 'aRaiseCarriesIt', 'actsForThePerson', 'theSecretaryActingForThePerson']

/**
 * THE ONE FILE WHOSE CALL NAMES NO DOOR OF ITS OWN. The role gate asks the check for every operation some role refuses,
 * so that a raise adds the power it gives to the caller's own. Which doors that reaches is the power's acts on the card,
 * and the last check below holds those to the list.
 */
const THE_ROLE_GATE = 'src/server/lib/rolegate.ts'

interface WhereItIsAsked {
  doors: string[]
  why: string
}

function readTheFolder(): Record<string, WhereItIsAsked> {
  const out: Record<string, WhereItIsAsked> = {}
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      const where = relative(CHECKOUT, path)
      if (!name.endsWith('.json')) throw new Error(`${where} is not a .json file, so it says nothing about a call`)
      const one = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      const unknown = Object.keys(one).filter((key) => !['doors', 'why'].includes(key))
      if (unknown.length > 0) throw new Error(`${where} has keys this reader does not know: ${unknown.join(', ')}`)
      const doors = one['doors']
      if (!Array.isArray(doors) || doors.some((door) => typeof door !== 'string' || door.trim() === '')) {
        throw new Error(`${where}: "doors" is not a list of names`)
      }
      if (typeof one['why'] !== 'string' || one['why'].trim() === '') throw new Error(`${where}: "why" is empty`)
      const file = `src/server/${relative(FOLDER, path).replace(/\.json$/, '.ts')}`
      out[file] = { doors: doors as string[], why: one['why'] as string }
    }
  }
  walk(FOLDER)
  return out
}

const TRACED = readTheFolder()

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
  return out.sort()
}

const A_CALL = new RegExp(`\\b(${THE_ENTRY_POINTS.join('|')})\\(`, 'g')
const A_DEFINITION = new RegExp(`function (${THE_ENTRY_POINTS.join('|')})\\(`)

/** How many calls of the check a file holds: lines that are not comments, less the lines that define an entry point. */
function callsIn(file: string): number {
  let calls = 0
  for (const line of readFileSync(join(CHECKOUT, file), 'utf8').split('\n')) {
    if (/^\s*(\*|\/\/|\/\*)/.test(line) || A_DEFINITION.test(line)) continue
    calls += [...line.matchAll(A_CALL)].length
  }
  return calls
}

/** A call line that refuses a caller who brings none of the person's words before it asks the check. */
const ONLY_WITH_THE_PERSONS_WORDS = /warrant === undefined\s*\|\|\s*!theSecretaryActingForThePerson\(/

/** A call line that writes a role card's words, which an agent may change only on the person's words and the owner's decision. */
const WRITES_A_CARDS_WORDS = /\b(keepTheWordsOfAnAddedCard|removeTheWordsOfAnAddedCard)\(/

/** The doors of every traced file holding a line, not a comment, that `shape` matches. */
function theDoorsOfTheFilesWith(shape: RegExp): string[] {
  const doors = new Set<string>()
  for (const [file, one] of Object.entries(TRACED)) {
    const lines = readFileSync(join(CHECKOUT, file), 'utf8').split('\n')
    if (lines.some((line) => !/^\s*(\*|\/\/|\/\*)/.test(line) && shape.test(line))) {
      for (const door of one.doors) doors.add(door)
    }
  }
  return [...doors].sort()
}

/** The doors of every traced file holding a call line that asks the check only with the person's words. */
function theDoorsAskedOnlyWithThePersonsWords(): string[] {
  return theDoorsOfTheFilesWith(ONLY_WITH_THE_PERSONS_WORDS)
}

const EVERY_TRACED_DOOR = new Set(Object.values(TRACED).flatMap((one) => one.doors))
const ON_THE_LIST = (door: string): boolean => Object.hasOwn(THE_DOORS_THE_LIST_NAMES, door)

describe('the check and the list name the same doors', () => {
  it('every server file that calls the check has its file in the folder, and every file in the folder is one that calls it', () => {
    const calling = theServerFiles().filter((file) => callsIn(file) > 0)
    expect(calling.filter((file) => !Object.hasOwn(TRACED, file)), 'calls the check and has no file in the folder').toEqual([])
    expect(Object.keys(TRACED).filter((file) => !calling.includes(file)).sort(), 'has a file in the folder and calls no check').toEqual([])
  })

  it('every door and part that reaches a call is one the list names', () => {
    expect([...EVERY_TRACED_DOOR].filter((door) => !ON_THE_LIST(door)).sort()).toEqual([])
  })

  it('no door that reaches a call is on the list of doors that do not ask the check yet', () => {
    expect([...EVERY_TRACED_DOOR].filter((door) => THE_DOORS_THAT_DO_NOT_ASK_YET.includes(door)).sort()).toEqual([])
  })

  it('every door the list names reaches a call, or is on the list of doors that do not ask the check yet', () => {
    const unasked = Object.keys(THE_DOORS_THE_LIST_NAMES).filter(
      (door) => !EVERY_TRACED_DOOR.has(door) && !THE_DOORS_THAT_DO_NOT_ASK_YET.includes(door),
    )
    expect(unasked.sort()).toEqual([])
  })

  it('every part beside the doors is one the list names', () => {
    expect(Object.keys(THE_NAMES_BESIDE_THE_DOORS).filter((name) => !ON_THE_LIST(name)).sort()).toEqual([])
  })

  it('only the role gate calls the check without naming a door of its own', () => {
    const doorless = Object.entries(TRACED)
      .filter(([, one]) => one.doors.length === 0)
      .map(([file]) => file)
    expect(doorless).toEqual([THE_ROLE_GATE])
  })

  it('the doors that ask the check only with the person\'s words are on the fixed list of doors that also need them, and the card asks first about none of them', () => {
    const found = theDoorsAskedOnlyWithThePersonsWords()
    expect(found.length, 'a guard that asks only with the person\'s words').toBeGreaterThan(0)
    expect(found.filter((door) => !THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS.includes(door)), 'not on the fixed list').toEqual([])
    const forTheCardsWords = theDoorsOfTheFilesWith(WRITES_A_CARDS_WORDS)
    expect(
      THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS.filter((door) => !found.includes(door) && !forTheCardsWords.includes(door)).sort(),
      'on the fixed list, with a guard that asks the check without the words, and no card\'s words to write',
    ).toEqual([])
    const roles = JSON.parse(readFileSync(join(CHECKOUT, 'src', 'config', 'roles.json'), 'utf8')) as { elevation: { askFirst: string[] } }
    expect(roles.elevation.askFirst.filter((door) => found.includes(door)).sort(), 'asked about first, and asked only with the words').toEqual([])
  })

  it('every act of the power the grant gives that is a route operation is a door the list names', () => {
    const roles = JSON.parse(readFileSync(join(CHECKOUT, 'src', 'config', 'roles.json'), 'utf8')) as {
      elevation: { givesThePower: string }
      powers: { name: string; acts: { act: string }[] }[]
    }
    const power = roles.powers.find((one) => one.name === roles.elevation.givesThePower)
    if (power === undefined) throw new Error(`The card names the power "${roles.elevation.givesThePower}", and no power has that name`)
    const operations = power.acts.map((one) => one.act).filter((act) => isOperationName(act))
    expect(operations.length).toBeGreaterThan(0)
    expect(operations.filter((act) => !ON_THE_LIST(act)).sort()).toEqual([])
  })
})
