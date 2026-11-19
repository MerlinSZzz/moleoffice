// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER AND THE ONE WRITER OF THIS OFFICE'S LIST OF WHAT THE PERSON'S GRANT CARRIES. Wave 13s round 2a.
 *
 * src/shared/what-the-grant-carries.ts says what the list is. This file is the one place in the server that reads and
 * writes its table, `what_the_grant_carries` (migration 0287): one row for each door this office's person changed. A door
 * with no row has the card's answer. Nothing is cached: the check reads the row of each name it asks about, by its
 * primary key, at each press.
 *
 * IT IMPORTS NOTHING FROM records.ts AT RUN TIME. The check in records.ts reads this file, so a value from records.ts
 * here would be a loop on the record write path. The actor is a type, and the door that writes calls
 * `writeDownASettingChange` itself.
 */
import { nowStamp } from '../../shared/time.ts'
import {
  doesThisDoorAlsoNeedThePersonsWords,
  doesThisDoorAskTheCheck,
  isAnAnswerAboutADoor,
  theStricterAnswer,
  type AnAnswerAboutADoor,
  type AStaleRow,
  type WhatTheGrantCarriesReading,
  type WhoSetIt,
} from '../../shared/what-the-grant-carries.ts'
import { THE_DOORS_THE_LIST_NAMES, isADoorTheListNames, whatThisDoorDoes } from '../../shared/what-the-grant-carries-words.ts'
import { sqlite } from '../db/client.ts'
import type { Actor } from './records.ts'
import { theRoleCards } from './roles.ts'

/** The table's name, for the setting the change log keeps beside it. */
export const THE_SETTING_OF_THE_LIST = 'what-the-grant-carries'

interface ARow {
  door: string
  answer: string
  updated_at: string
  updated_by_kind: string
  updated_by_id: string
}

/** One office answer about a door, as the check and the read door read it. */
export type AnOfficeAnswer = WhoSetIt & { answer: AnAnswerAboutADoor }

function asAnAnswer(row: ARow): AnOfficeAnswer {
  // The table's CHECK holds `answer` to the three answers, so another value is a row nothing here wrote.
  if (!isAnAnswerAboutADoor(row.answer)) {
    throw new Error(`The what_the_grant_carries row for ${row.door} holds the answer "${row.answer}", which is not one of the three.`)
  }
  return { answer: row.answer, kind: row.updated_by_kind, id: row.updated_by_id, at: row.updated_at }
}

/**
 * THIS OFFICE'S ANSWER ABOUT ONE DOOR, or null when it uses the card's. One lookup by the primary key. A name that is not
 * a door the list may name is not looked up at all, so a row left for a door the office no longer has never matches.
 */
export function thisOfficesAnswerAbout(door: string): AnOfficeAnswer | null {
  if (!isADoorTheListNames(door)) return null
  const row = sqlite
    .prepare('SELECT door, answer, updated_at, updated_by_kind, updated_by_id FROM what_the_grant_carries WHERE door = ?')
    .get(door) as ARow | undefined
  return row === undefined ? null : asAnAnswer(row)
}

/** THE CARD'S ANSWER ABOUT ONE DOOR: kept where its `neverPresses` names it, ask first where its `askFirst` does. */
export function theCardsAnswerAbout(door: string): AnAnswerAboutADoor {
  const { neverPresses, askFirst } = theRoleCards().elevation
  if (neverPresses.includes(door)) return 'kept'
  if (askFirst.includes(door)) return 'ask-first'
  return 'may-press'
}

/** The answer about a press, the name it was the answer for, and whose answer it was. `at` is when this office set it. */
export interface TheAnswerAboutAPress {
  answer: AnAnswerAboutADoor
  name: string
  by: 'the card' | 'this office'
  at: string | null
}

/**
 * THE ANSWER ABOUT A PRESS NAMED BY THESE NAMES, as the check asks it: for each name, this office's answer where it has
 * one and the card's otherwise, and the strictest of them. Where two names give the same answer the first stands, so a
 * refusal names the operation before the act its gate asks about. One lookup by primary key for each name the list
 * names, and none for the others.
 */
export function theAnswerAboutAPress(names: readonly string[]): TheAnswerAboutAPress {
  let found: TheAnswerAboutAPress | null = null
  for (const name of new Set(names)) {
    const office = thisOfficesAnswerAbout(name)
    const one: TheAnswerAboutAPress =
      office === null
        ? { answer: theCardsAnswerAbout(name), name, by: 'the card', at: null }
        : { answer: office.answer, name, by: 'this office', at: office.at }
    if (found === null || (one.answer !== found.answer && theStricterAnswer(one.answer, found.answer) === one.answer)) found = one
  }
  if (found === null) throw new Error('A press was asked about with no name at all, so nothing says which door it is.')
  return found
}

/** Every row, the doors the list names apart from the rows left for doors it no longer names. */
export function everyRowOfTheList(): { answers: Map<string, AnOfficeAnswer>; stale: AStaleRow[] } {
  const rows = sqlite
    .prepare('SELECT door, answer, updated_at, updated_by_kind, updated_by_id FROM what_the_grant_carries ORDER BY door')
    .all() as ARow[]
  const answers = new Map<string, AnOfficeAnswer>()
  const stale: AStaleRow[] = []
  for (const row of rows) {
    if (isADoorTheListNames(row.door)) answers.set(row.door, asAnAnswer(row))
    else stale.push({ door: row.door, answer: row.answer, kind: row.updated_by_kind, id: row.updated_by_id, at: row.updated_at })
  }
  return { answers, stale }
}

/**
 * THE LIST AS IT STANDS: every door the list names, in its order, with the card's answer, this office's and the one in
 * force, how many doors have each answer in force, and the rows left for doors the list no longer names. The read door
 * answers this, and the line that tells a secretary it was raised counts from it.
 */
export function theListAsItStands(): Omit<WhatTheGrantCarriesReading, 'refusal'> {
  const { answers, stale } = everyRowOfTheList()
  const counts: Record<AnAnswerAboutADoor, number> = { kept: 0, 'ask-first': 0, 'may-press': 0 }
  const doors = Object.keys(THE_DOORS_THE_LIST_NAMES).map((door) => {
    const card = theCardsAnswerAbout(door)
    const office = answers.get(door) ?? null
    const answer = office?.answer ?? card
    counts[answer] += 1
    return {
      door,
      words: whatThisDoorDoes(door),
      card,
      office,
      answer,
      asksTheCheck: doesThisDoorAskTheCheck(door),
      alsoNeedsThePersonsWords: doesThisDoorAlsoNeedThePersonsWords(door, card, answer),
    }
  })
  return { doors, counts, stale }
}

/** How many doors the grant does not press now, in each of the three kinds, and how many it asks the person about first. */
export interface WhatTheGrantDoesNotPress {
  doNotAskYet: number
  kept: number
  needWords: number
  askFirst: number
}

/**
 * HOW MANY OF THE DOORS THE LIST NAMES THE GRANT DOES NOT PRESS NOW, and how many it asks the person about first. Each
 * door is counted once, in the first kind that fits it, so the three kinds make the whole: a door that does not ask the
 * check yet, whatever its answer, because it still refuses the secretary; a door this office keeps for the person; and a
 * door that also needs the person's words for each change, because the grant alone does not press it.
 */
export function whatTheGrantDoesNotPressNow(): WhatTheGrantDoesNotPress {
  const counts: WhatTheGrantDoesNotPress = { doNotAskYet: 0, kept: 0, needWords: 0, askFirst: 0 }
  for (const one of theListAsItStands().doors) {
    if (!one.asksTheCheck) counts.doNotAskYet += 1
    else if (one.answer === 'kept') counts.kept += 1
    else if (one.alsoNeedsThePersonsWords) counts.needWords += 1
    else if (one.answer === 'ask-first') counts.askFirst += 1
  }
  return counts
}

/**
 * GIVE ONE DOOR THIS OFFICE'S ANSWER, or remove its row so the card's answer stands. The door that calls this has checked
 * the caller and the door, and writes the change down after it. Returns the answer before and after, null for none. An
 * answer the door already has is left as it is, so who set it and when stay true.
 */
export function setThisOfficesAnswer(
  door: string,
  answer: AnAnswerAboutADoor | 'default',
  who: Actor,
): { before: AnAnswerAboutADoor | null; after: AnAnswerAboutADoor | null } {
  // THE ANSWER IS CHECKED HERE, so no caller can store one of its own words. The two doors check it with their schema
  // first, and this is the one place the table is written: an answer that is not one of the three, or "default", is
  // refused whoever calls it and nothing is written.
  if (answer !== 'default' && !isAnAnswerAboutADoor(answer)) {
    throw new Error(
      `The answer "${String(answer)}" about "${door}" is not one of kept, ask-first, may-press, or default, so nothing ` +
        'was written. This is a fault in the caller, not in the office.',
    )
  }
  const before = sqlite.prepare('SELECT answer FROM what_the_grant_carries WHERE door = ?').get(door) as { answer: string } | undefined
  const was = before !== undefined && isAnAnswerAboutADoor(before.answer) ? before.answer : null
  if (before !== undefined && before.answer === answer) return { before: was, after: was }
  if (answer === 'default') {
    sqlite.prepare('DELETE FROM what_the_grant_carries WHERE door = ?').run(door)
    return { before: was, after: null }
  }
  sqlite
    .prepare(
      'INSERT INTO what_the_grant_carries (door, answer, updated_at, updated_by_kind, updated_by_id) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(door) DO UPDATE SET answer=excluded.answer, updated_at=excluded.updated_at, ' +
        'updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id',
    )
    .run(door, answer, nowStamp(), who.type, who.id)
  return { before: was, after: answer }
}
