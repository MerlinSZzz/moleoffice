// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GETTING-STARTED REPORT AND THE FIRST ENTRY, AS THE SERVER AND THE PAGE BOTH READ THEM (wave 13y round 138, item 74).
 *
 * When the person of a new office gives their name in the welcome guide, the office files one report that shows where
 * the Embassy is and how an agent is let in, and puts it on the person's checklist (src/server/lib/getting-started.ts).
 * While that item is new, the page greys everything but the chat corner and then the checklist press, until the person
 * opens the report from the checklist (src/web/lib/first-entry.tsx). That is the first entry.
 *
 * THE REPORT IS IN THE PERSON'S LANGUAGE ONLY WHERE THAT LANGUAGE HOLDS ALL OF IT: every word below, and every picture
 * in that language's folder of THE_GETTING_STARTED_FOLDER. Where it lacks any of them, the whole report is in English,
 * and no block of it says so: the person can do nothing about a translation nobody has written yet. A report half in
 * one language and half in another is not filed.
 */
import type { WordKey } from './i18n.ts'

/** Every word the report and its checklist item are written in. */
export const THE_GETTING_STARTED_WORDS = [
  'gettingStarted.report.title',
  'gettingStarted.report.welcome.heading',
  'gettingStarted.report.welcome.text',
  'gettingStarted.report.embassy.heading',
  'gettingStarted.report.embassy.text',
  'gettingStarted.report.embassy.alt',
  'gettingStarted.report.admit.heading',
  'gettingStarted.report.admit.text',
  'gettingStarted.report.admit.alt',
  'gettingStarted.report.stays.heading',
  'gettingStarted.report.stays.text',
  'gettingStarted.report.madeUp',
  'gettingStarted.checklist.title',
  'gettingStarted.item.words',
] as const satisfies readonly WordKey[]

/**
 * THE FOLDER THE PICTURES ARE IN, from the checkout's root, with one folder in it for each language. It is under
 * public/ because an installed office carries public/ in its built page and carries no assets/ but its icon
 * (scripts/bundle.mjs), so a picture kept anywhere else would be missing from every installed office's report.
 */
export const THE_GETTING_STARTED_FOLDER = 'public/getting-started'

/**
 * THE TWO PICTURES, by file name in each language's folder of THE_GETTING_STARTED_FOLDER. They are photographs of a
 * made-up office, taken by tests/the-first-entry-shows-the-way-in.test.ts, and each is captioned as made up.
 */
export const THE_GETTING_STARTED_PICTURES = ['the-embassy-in-the-list.png', 'an-agent-asking-at-the-embassy.png'] as const

/** The setting whose change log keeps the first entry: one row when the office starts it, one when the person ends it. */
export const THE_FIRST_ENTRY_SETTING = 'first-entry'

/** What the first entry's rows hold: the report, its checklist and its item, and whether it is still on. */
export interface TheFirstEntryKept {
  state: 'on' | 'ended'
  report: string
  checklist: string
  item: string
}

/** GET /api/getting-started. */
export interface TheFirstEntry {
  /** `none` when no getting-started report was ever filed in this office. */
  state: 'none' | 'on' | 'ended'
  report: string | null
  checklist: string | null
  item: string | null
  /**
   * WHETHER THE PAGE DRAWS THE FIRST ENTRY: it is on, its report is held, and its item is still open on the checklist.
   * A first entry whose report or item is gone is not drawn, so it can never hold the person behind its layer.
   */
  shows: boolean
  /** Who ended it and when, from the change log. Null while it is on, and when there is none. */
  ended: { by: { type: string; id: string }; at: string } | null
  /** The reading in one sentence: what is kept, and why the page draws it or not. */
  says: string
}
