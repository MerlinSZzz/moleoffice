// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHANGE TO WHAT THE PERSON'S GRANT CARRIES: its shape, its words, its check against the list, and the write.
 *
 * The write door, POST /api/office/what-the-grant-carries in src/server/api/what-the-grant-carries.ts, and the request for
 * one press, "change-what-the-grant-carries" in lib/one-press.ts, both take a change and both make it. They are here and
 * not in the door's own file so that lib/one-press.ts need not import a door. The door re-exports each of them under the
 * same name. Who may make a change is the door's question and one-press's, not this file's.
 *
 * NOT IN lib/what-the-grant-carries.ts, which imports nothing from records.ts at run time because the check in records.ts
 * reads it. The write here calls `writeDownASettingChange` from records.ts.
 */
import { z } from 'zod'

import {
  THE_CHOICES_FOR_A_DOOR,
  type AChangeToTheList,
  type AChoiceForADoor,
  type AnAnswerAboutADoor,
} from '@shared/what-the-grant-carries.ts'
import { isADoorTheListNames, whatThisDoorDoes } from '@shared/what-the-grant-carries-words.ts'
import { sqlite } from '../db/client.ts'
import { writeDownASettingChange, type Actor } from './records.ts'
import type { PanelError } from './panel-error.ts'
import {
  THE_SETTING_OF_THE_LIST,
  everyRowOfTheList,
  setThisOfficesAnswer,
  theCardsAnswerAbout,
  thisOfficesAnswerAbout,
} from './what-the-grant-carries.ts'

/** One change: a door, and one of the three answers or the card's default. */
const aChange = z.strictObject({ door: z.string().min(1), answer: z.enum(THE_CHOICES_FOR_A_DOOR) })

/** What the write door and the request for one press both take. */
export const THE_CHANGES_TO_THE_LIST = z.strictObject({ changes: z.array(aChange).min(1) })
export type AChangeAsked = z.infer<typeof aChange>

/** The answer about a door in the words a sentence about a change uses. */
const AN_ANSWER_IN_WORDS: Readonly<Record<AChoiceForADoor, string>> = {
  kept: 'kept for the person',
  'ask-first': 'ask the person first',
  'may-press': 'the secretary may press it',
  default: "the card's answer",
}

/** How a sentence names a door: its English words, or its name where a stale row names a door with none. */
function theDoorInWords(door: string): string {
  return isADoorTheListNames(door) ? `"${whatThisDoorDoes(door).en}"` : door
}

/** One change asked for, in words: `"Setting the list of quick inputs": the secretary may press it`. */
export function aChangeInWords(one: AChangeAsked): string {
  return `${theDoorInWords(one.door)}: ${AN_ANSWER_IN_WORDS[one.answer]}`
}

/** This office's answer about a door, or the card's, in words, as it stands now. */
function theAnswerNowInWords(door: string): string {
  if (!isADoorTheListNames(door)) return 'a row for a door the list no longer names'
  const office = thisOfficesAnswerAbout(door)
  return office === null ? `${AN_ANSWER_IN_WORDS[theCardsAnswerAbout(door)]} (the card's answer)` : AN_ANSWER_IN_WORDS[office.answer]
}

/**
 * One change asked for, from the answer the door has now, in words: `"Setting the list of quick inputs" from kept for
 * the person (the card's answer) to the secretary may press it`. Read each time, so it says what the door has now.
 */
export function aChangeFromNowInWords(one: AChangeAsked): string {
  return `${theDoorInWords(one.door)} from ${theAnswerNowInWords(one.door)} to ${AN_ANSWER_IN_WORDS[one.answer]}`
}

/**
 * THE CHANGES CHECKED AGAINST THE LIST AS IT STANDS, before anything is written. Throws in words through `refuse`, naming
 * the door. A door the list names may take any choice. A door it no longer names may only be removed, and only where a
 * row is left for it.
 */
export function theChangesAreRight(changes: readonly AChangeAsked[], refuse: (words: string) => PanelError): void {
  const seen = new Set<string>()
  let stale: Set<string> | null = null
  for (const one of changes) {
    if (seen.has(one.door)) throw refuse(`${one.door} is asked about twice. Ask about each door once.`)
    seen.add(one.door)
    if (isADoorTheListNames(one.door)) continue
    stale ??= new Set(everyRowOfTheList().stale.map((row) => row.door))
    if (!stale.has(one.door)) throw refuse(`${one.door} is not a door the list of what the grant carries names.`)
    if (one.answer !== 'default') {
      throw refuse(`${one.door} is a door the list no longer names, so its row can only be removed, with "default".`)
    }
  }
}

/**
 * MAKE THE CHANGES AND WRITE THEM DOWN, in one step: every door's answer, and one row in the change log with the
 * answers before and after. The caller has checked who presses and `theChangesAreRight`. Returns each door's answer
 * before and after, null where the card's stands.
 */
export function changeWhatTheGrantCarries(changes: readonly AChangeAsked[], actor: Actor, workspaceId: string): AChangeToTheList[] {
  return sqlite.transaction(() => {
    const changed = changes.map((one) => ({ door: one.door, ...setThisOfficesAnswer(one.door, one.answer, actor) }))
    const asWritten = (answer: AnAnswerAboutADoor | null): string => answer ?? 'default'
    writeDownASettingChange(actor, {
      setting: THE_SETTING_OF_THE_LIST,
      field: 'what the grant carries',
      before: Object.fromEntries(changed.map((one) => [one.door, asWritten(one.before)])),
      after: Object.fromEntries(changed.map((one) => [one.door, asWritten(one.after)])),
      workspaceId,
    })
    return changed
  })()
}
