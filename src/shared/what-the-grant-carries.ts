// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE: THE CARD'S DEFAULT, AND THE DOORS THIS OFFICE'S PERSON CHANGED.
 * Wave 13s round 2a of the flow design's step 3.
 *
 * -----------------------------------------------------------------------------------------
 * WHY EACH OFFICE HAS ITS OWN LIST
 * -----------------------------------------------------------------------------------------
 *
 * The secretary card names the doors the person's grant never presses for them (`elevation.neverPresses` in
 * src/config/roles.json) and the doors it asks the person about first (`elevation.askFirst`). When the list was
 * made, the point was this: what one person keeps for themselves another may not, and one door may be added, removed or
 * changed, so the list must not be fixed in the code. So the card's lists are only the default. The person of each
 * office may give any door one of the three answers below, and that answer stands in this office until they choose the
 * default again. The answers are kept in the table `what_the_grant_carries` (migration 0287), one row per door changed.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT A DOOR IS HERE
 * -----------------------------------------------------------------------------------------
 *
 * A door is named by the operation its route declares (src/shared/ops-list.ts), as the card's lists name it. A few
 * doors do two things, and only one of them is the person's: ending a visitor's session is the person's when the
 * device is a person's, and revoking a key is the person's when the key is a person's. Those parts have their own
 * names, beside the doors (`THE_NAMES_BESIDE_THE_DOORS`), so the list can keep the part and leave the rest of the door
 * to the grant. Writing a regulation is one of them too: it is done through the doors that write records, which every
 * kind shares.
 *
 * The doors the list may name are the doors that have words in src/shared/what-the-grant-carries-words.ts. A test
 * holds every door on the card's lists and every door only the person may press to having words there.
 */
import { OPERATIONS } from './ops.ts'

/** The three answers about a door, the strictest first. */
export const THE_ANSWERS_ABOUT_A_DOOR = ['kept', 'ask-first', 'may-press'] as const
export type AnAnswerAboutADoor = (typeof THE_ANSWERS_ABOUT_A_DOOR)[number]

/** What the write door takes for one door: one of the three answers, or the card's default, which removes the row. */
export const THE_CHOICES_FOR_A_DOOR = [...THE_ANSWERS_ABOUT_A_DOOR, 'default'] as const
export type AChoiceForADoor = (typeof THE_CHOICES_FOR_A_DOOR)[number]

export function isAnAnswerAboutADoor(value: unknown): value is AnAnswerAboutADoor {
  return typeof value === 'string' && (THE_ANSWERS_ABOUT_A_DOOR as readonly string[]).includes(value)
}

/**
 * THE STRICTER OF TWO ANSWERS. A press is named by its operation, by the act its gate asks about, and by any part
 * beside the door it touches; when those names have different answers, the strictest of them is the answer.
 */
export function theStricterAnswer(one: AnAnswerAboutADoor, other: AnAnswerAboutADoor): AnAnswerAboutADoor {
  return THE_ANSWERS_ABOUT_A_DOOR.indexOf(one) <= THE_ANSWERS_ABOUT_A_DOOR.indexOf(other) ? one : other
}

/**
 * THE NAMES BESIDE THE DOORS: a part of what some doors do that the list can keep apart from the rest, each with what it
 * does in the words a refusal says it. Writing a regulation and writing a decision are asked by every door that writes a
 * record, when the record is one of those kinds (`assertMayWrite`); each of the three visitor parts by the door named
 * before its colon (src/server/api/visitors.ts). Committing hours is a part of two doors that many other routes share,
 * `plan.time` and `plan.write`, and the one guard every hour-writing path calls asks it (`assertMayCommitTheHours`).
 */
export const THE_NAMES_BESIDE_THE_DOORS = {
  'record:regulation': 'writing a regulation',
  'record:decision': 'writing a decision',
  'office.end-visitor:a-persons-device': "ending a session on a person's device",
  'office.revoke-key:a-persons-key': "revoking a person's key",
  'office.undo-key-revocation:a-persons-key': "undoing the revocation of a person's key",
  'plan:committing-hours': 'committing hours on the calendar',
} as const
export type ANameBesideTheDoors = keyof typeof THE_NAMES_BESIDE_THE_DOORS

export function isANameBesideTheDoors(name: string): name is ANameBesideTheDoors {
  return Object.hasOwn(THE_NAMES_BESIDE_THE_DOORS, name)
}

/**
 * THE DOORS THAT DO NOT ASK THE CHECK YET. Each answers in its own code before any list is read, so neither the card
 * nor this office's answer changes what it does. Most refuse every caller that is not the person. Restarting the office
 * also lets in an agent that holds its own live restart grant and uses its own key; the person gives that grant at a
 * door of its own. The page says so on each, so a "may press" there is never shown as if the secretary could press it. The card keeps every one of them, so a new
 * office behaves as before when they are wired. A test holds every person-only guard that does not ask the check to a
 * door on this list.
 */
export const THE_DOORS_THAT_DO_NOT_ASK_YET: readonly string[] = [
  // Stopping and starting the office. A restart starts a new server on the same database file, and that server can
  // migrate the file in place, so the grant does not carry it.
  'office.restart',
  // Signing a readiness checklist as the person: the person's own signature goes only through a door only the person
  // can use.
  'readiness.sign-as-the-person',
  // Giving the gate-count spool to this office's world: only the person, proved as the person, presses it, and no grant
  // and no raise does.
  'office.hand-over-gate-count-spool',
]

/**
 * THE DOORS THAT ALSO NEED THE PERSON'S WORDS, whatever the list answers. Each refuses a secretary that brings no words
 * of the person's naming the one change, so the grant alone does not press it. That refusal is in the door's code and
 * not on the card, so the person cannot change it from the list. Naming the owner and setting who may restart the office
 * need them for every change. The two role card doors need them only for a change to a card's words
 * (`THE_DOORS_THAT_NEED_THE_PERSONS_WORDS_ONLY_FOR_A_CARDS_WORDS`). The page says so beside each of these doors, and the
 * line that tells a secretary it was raised counts them as not pressed.
 *
 * A door off this list may take the person's words for one change too, and ask the check when it has none. The card
 * asks first about such a door. While this office's answer about it is ask-first as well, it also needs the person's
 * words, since nothing records the person's answer about one press (`doesThisDoorAlsoNeedThePersonsWords`).
 */
export const THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS: readonly string[] = [
  // Adding, removing or changing the words of a role card needs the person's words and the person's decision, whatever
  // the list answers (src/server/lib/card-words.ts). Where the list lets the grant press these doors, it carries only a
  // change that leaves the card's words as they are, such as its powers.
  'role.set-added',
  'role.restore-added',
  // A restart grant lets an agent restart the office, and a restart can migrate the database in use, so the grant
  // does not give one until a restart is shown not to.
  'office.set-restart-grant',
  // A secretary records the owner's name only with the owner's written words for that name. The grant alone never
  // does. The stored mark stays the person's naming because an older server would refuse a new stored word.
  'office.name-owner',
]

/**
 * THE DOORS ON THAT LIST THAT NEED THE PERSON'S WORDS ONLY FOR A CHANGE TO A CARD'S WORDS. A change to a role card's
 * words needs the person's words and the person's decision (src/server/lib/card-words.ts). A change that leaves the words
 * as they are, such as the card's powers, needs neither, so where the list lets the grant press these doors, the grant
 * alone presses that change.
 */
export const THE_DOORS_THAT_NEED_THE_PERSONS_WORDS_ONLY_FOR_A_CARDS_WORDS: readonly string[] = ['role.set-added', 'role.restore-added']

/** Whether the card and the answer in force both ask first, so every change needs the person's words for itself. */
function bothAskFirst(card: AnAnswerAboutADoor, answer: AnAnswerAboutADoor): boolean {
  return card === 'ask-first' && answer === 'ask-first'
}

/**
 * Whether a door also needs the person's words, so the grant alone does not press every change it makes: a door on the
 * fixed list, or a door the card asks first about while the answer in force is ask-first too.
 */
export function doesThisDoorAlsoNeedThePersonsWords(door: string, card: AnAnswerAboutADoor, answer: AnAnswerAboutADoor): boolean {
  return THE_DOORS_THAT_ALSO_NEED_THE_PERSONS_WORDS.includes(door) || bothAskFirst(card, answer)
}

/**
 * Whether a door needs the person's words only for a change to a card's words, so the grant alone may press its other
 * changes. False where the card and the answer both ask first, because then every change needs them.
 */
export function doesThisDoorNeedThePersonsWordsOnlyForACardsWords(door: string, card: AnAnswerAboutADoor, answer: AnAnswerAboutADoor): boolean {
  return THE_DOORS_THAT_NEED_THE_PERSONS_WORDS_ONLY_FOR_A_CARDS_WORDS.includes(door) && !bothAskFirst(card, answer)
}

/** Whether a door asks the check yet. */
export function doesThisDoorAskTheCheck(door: string): boolean {
  return !THE_DOORS_THAT_DO_NOT_ASK_YET.includes(door)
}

/** Whether a name is a door the office has: an operation, or a name beside the doors. */
export function isADoorTheOfficeHas(name: string): boolean {
  return isANameBesideTheDoors(name) || OPERATIONS.some((one) => one.name === name)
}

/** Who set an office's answer about a door, and when, as the row is stamped. `at` is the office's local wall clock. */
export interface WhoSetIt {
  kind: string
  id: string
  at: string
}

/** One door as the read door gives it. */
export interface ADoorAndWhatTheGrantDoes {
  door: string
  /** What the door does, in English and in Chinese. */
  words: { en: string; zh: string }
  /** The card's answer, which is the answer when this office has none. */
  card: AnAnswerAboutADoor
  /** This office's answer and who gave it, or null when this office uses the card's. */
  office: (WhoSetIt & { answer: AnAnswerAboutADoor }) | null
  /** The answer in force: this office's when it has one, the card's otherwise. */
  answer: AnAnswerAboutADoor
  /**
   * Whether the door asks the check yet. A door that does not answers in its own code whatever the list says, so a
   * "may press" there is not yet true for the secretary. Most such doors refuse every caller that is not the person;
   * restarting the office also lets in an agent holding its own restart grant.
   */
  asksTheCheck: boolean
  /**
   * Whether the door also needs the person's words, so the grant alone does not press every change it makes: always for
   * a door on the fixed list, and for a door the card asks first about while the answer in force is ask-first too. On
   * the two role card doors only a change to a card's words needs them
   * (`doesThisDoorNeedThePersonsWordsOnlyForACardsWords`).
   */
  alsoNeedsThePersonsWords: boolean
}

/** A row naming a door the office no longer has. The check never matches it; it is shown so the person can remove it. */
export interface AStaleRow extends WhoSetIt {
  door: string
  answer: string
}

/** What the read door answers. */
export interface WhatTheGrantCarriesReading {
  doors: ADoorAndWhatTheGrantDoes[]
  /** How many doors have each answer in force. */
  counts: Record<AnAnswerAboutADoor, number>
  stale: AStaleRow[]
  /** Null when this caller may change the list, and otherwise the words the write door refuses it with. */
  refusal: string | null
}

/** One door a change asked about: this office's answer before and after it, null where the card's answer stands. */
export interface AChangeToTheList {
  door: string
  before: AnAnswerAboutADoor | null
  after: AnAnswerAboutADoor | null
}

/** What the write door answers: the list as it now stands, and each door it was asked to change. */
export interface WhatTheGrantCarriesAfterAChange extends WhatTheGrantCarriesReading {
  changed: AChangeToTheList[]
}
