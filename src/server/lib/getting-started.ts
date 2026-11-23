// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GETTING-STARTED REPORT A NEW OFFICE FILES, AND THE FIRST ENTRY IT STARTS (wave 13y round 138, item 74).
 *
 * `fileTheGettingStartedReport` runs once, inside the write that gives a new office's person their name (nameTheOwner in
 * lib/owner.ts), so a naming that stands always has its report, and an office whose person was named before never gets
 * one. It files one report written by the office, makes one checklist the person owns with one standing item that links
 * the report, and writes the first entry down as a setting of the office: one change-log row, `on`, naming all three.
 *
 * THE FIRST ENTRY IS KEPT ON THE CHANGE LOG OF A SETTING, NOT ON THE REPORT'S `read`. That field is the person's own
 * statement about a report, which they may change either way at any time, and the first entry ends for good. The
 * change log already keeps who changed a setting and when, so the end is one row by the person, and no table is added.
 *
 * `endTheFirstEntry` writes the second row, `ended`, when the person opens the report from the checklist. Only the
 * person may: an agent that ended it would hide the steps from the person who has not seen them yet.
 */

import { existsSync } from 'node:fs'

import { whereThePublicFileIs } from '../../config/settings.mjs'
import { createI18n, sayInEnglish, WORD_LISTS, type Language, type Say, type WordValues } from '@shared/i18n.ts'
import {
  THE_FIRST_ENTRY_SETTING,
  THE_GETTING_STARTED_FOLDER,
  THE_GETTING_STARTED_PICTURES,
  THE_GETTING_STARTED_WORDS,
  THE_RIGHT_CLICK_ITEMS,
  type GettingStartedWordKey,
  type TheFirstEntry,
  type TheFirstEntryKept,
} from '@shared/getting-started.ts'
import { moleOffice } from '@shared/participants.ts'
import { nowStamp } from '@shared/time.ts'
import type { ImageBlock, ListBlock, TextBlock } from '@shared/types.ts'
import { DEFAULT_WORKSPACE } from '@shared/workspaces.ts'
import { makeAChecklist } from './checklists.ts'
import { createRecord, getRecord, theLastChangeOfASetting, writeDownASettingChange, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'

function theOffice(): Actor {
  return { type: 'system', id: moleOffice().id }
}

/** Where one picture of one language is, in this install: public/ in a checkout, the built page in a bundle. */
function wherePictureIs(language: Language, file: string): string {
  return whereThePublicFileIs(`${THE_GETTING_STARTED_FOLDER}/${language}/${file}`)
}

/** Whether a language holds every word and every picture of the report. */
function holdsAllOfIt(language: Language): boolean {
  return (
    THE_GETTING_STARTED_WORDS.every((key) => WORD_LISTS[language][key] !== undefined) &&
    THE_GETTING_STARTED_PICTURES.every((file) => existsSync(wherePictureIs(language, file)))
  )
}

/**
 * FILE THE REPORT, ITS CHECKLIST AND ITS ITEM, AND START THE FIRST ENTRY. Called inside the naming's transaction, so a
 * throw here leaves the person unnamed and nothing filed.
 */
export function fileTheGettingStartedReport(input: { person: string; name: string; language: Language | null }): TheFirstEntryKept {
  const asked = input.language ?? 'en'
  const language: Language = holdsAllOfIt(asked) ? asked : 'en'
  const reader: Say = language === 'en' ? sayInEnglish : createI18n(language).t
  // THE REPORT SAYS ONLY THE WORDS ON ITS LIST. holdsAllOfIt chose the language from that list, so a word said here and
  // missing from it could be drawn in English in a report filed as Chinese.
  const say = (key: GettingStartedWordKey, values?: WordValues): string => reader(key, values)
  // A PICTURE THE INSTALL DOES NOT HOLD IS A BROKEN INSTALL, said here rather than filed as a picture that is not there.
  for (const file of THE_GETTING_STARTED_PICTURES) {
    const path = wherePictureIs(language, file)
    if (!existsSync(path)) {
      throw new Error(`The getting-started picture ${path} is not in this install, so the report that shows it could not be filed. Nothing was changed.`)
    }
  }
  const picture = (id: string, file: string, alt: GettingStartedWordKey): ImageBlock => ({
    id,
    type: 'image',
    path: wherePictureIs(language, file),
    alt: say(alt),
    caption: say('gettingStarted.report.madeUp'),
  })
  const text = (id: string, heading: string, words: string): TextBlock => ({ id, type: 'text', heading, text: words })
  // THE RIGHT-CLICK PART: one picture of the whole box, then one line for each of its items,
  // in the box's order. A line names a press by the word the box draws for it, so a renamed press is renamed here too.
  const presses = {
    copy: say('talk.copy'),
    contact: say('talk.sendTo.contact'),
    note: say('talk.sendTo.note'),
    send: say('talk.send'),
    startReview: say('talk.startReview'),
    more: say('talk.more'),
  }
  const [embassyPicture, admitPicture, boxPicture] = THE_GETTING_STARTED_PICTURES
  const blocks: (TextBlock | ImageBlock | ListBlock)[] = [
    text('welcome', say('gettingStarted.report.welcome.heading', { name: input.name }), say('gettingStarted.report.welcome.text')),
    text('embassy', say('gettingStarted.report.embassy.heading'), say('gettingStarted.report.embassy.text', { embassy: say('nav.embassy'), menu: say('frameWords.menu') })),
    picture('embassy-picture', embassyPicture, 'gettingStarted.report.embassy.alt'),
    text('admit', say('gettingStarted.report.admit.heading'), say('gettingStarted.report.admit.text', { admit: say('g6b.ask.admit'), refuse: say('g6b.ask.refuse') })),
    picture('admit-picture', admitPicture, 'gettingStarted.report.admit.alt'),
    text('right-click', say('gettingStarted.report.rightClick.heading'), say('gettingStarted.report.rightClick.text')),
    picture('right-click-picture', boxPicture, 'gettingStarted.report.rightClick.alt'),
    { id: 'right-click-items', type: 'list', items: THE_RIGHT_CLICK_ITEMS.map((key) => say(key, presses)) },
    text('stays', say('gettingStarted.report.stays.heading'), say('gettingStarted.report.stays.text')),
  ]
  const report = createRecord({
    kind: 'report',
    title: say('gettingStarted.report.title'),
    data: { blocks, for: input.name, date: nowStamp().slice(0, 10) },
    workspaceId: DEFAULT_WORKSPACE,
    actor: theOffice(),
  })
  const checklist = makeAChecklist({
    workspaceId: DEFAULT_WORKSPACE,
    said: { title: say('gettingStarted.checklist.title'), items: [{ words: say('gettingStarted.item.words', { report: report.id }), links: [report.id], standing: true }] },
    actor: theOffice(),
    forOwner: { kind: 'person', id: input.person },
  })
  const item = checklist.items[0]
  if (item === undefined) throw new Error(`Checklist ${checklist.id} was made with its getting-started item, and holds no item.`)
  const kept: TheFirstEntryKept = { state: 'on', report: report.id, checklist: checklist.id, item: item.id }
  writeDownASettingChange(theOffice(), { setting: THE_FIRST_ENTRY_SETTING, field: 'the first entry', before: null, after: kept, workspaceId: DEFAULT_WORKSPACE })
  return kept
}

/** What the newest row keeps, or null when no row was ever written. A row in another shape is a broken assumption. */
function theKeptFirstEntry(): { kept: TheFirstEntryKept; by: { type: string; id: string }; at: string } | null {
  const last = theLastChangeOfASetting(THE_FIRST_ENTRY_SETTING)
  if (last === null) return null
  const kept = (last.to === null ? null : JSON.parse(last.to)) as Partial<TheFirstEntryKept> | null
  if (
    kept === null ||
    (kept.state !== 'on' && kept.state !== 'ended') ||
    typeof kept.report !== 'string' ||
    typeof kept.checklist !== 'string' ||
    typeof kept.item !== 'string'
  ) {
    throw new Error(`The change-log row ${last.id} of the setting ${THE_FIRST_ENTRY_SETTING} does not hold a first entry: ${String(last.to)}.`)
  }
  return { kept: kept as TheFirstEntryKept, by: last.by, at: last.at }
}

/** GET /api/getting-started: the first entry as the change log keeps it, and whether the page draws it. */
export function theFirstEntry(): TheFirstEntry {
  const found = theKeptFirstEntry()
  if (found === null) {
    return {
      state: 'none',
      report: null,
      checklist: null,
      item: null,
      shows: false,
      ended: null,
      says: 'This office has no first entry: its person was named before the office filed a getting-started report, or no person has been named yet.',
    }
  }
  const { kept } = found
  const at = { report: kept.report, checklist: kept.checklist, item: kept.item }
  if (kept.state === 'ended') {
    return { state: 'ended', ...at, shows: false, ended: { by: found.by, at: found.at }, says: 'The first entry ended when the person opened its report, so the page draws it no more.' }
  }
  const report = getRecord(kept.report)
  const checklist = getRecord(kept.checklist)
  const items = checklist === null ? [] : ((checklist.data as { items?: { id: string; state: string }[] }).items ?? [])
  const item = items.find((one) => one.id === kept.item)
  const gone =
    report === null || report.deletedAt !== null
      ? `its report ${kept.report} was taken away`
      : checklist === null || checklist.deletedAt !== null
        ? `its checklist ${kept.checklist} was taken away`
        : item === undefined
          ? `its item ${kept.item} is no longer on its checklist`
          : item.state !== 'open'
            ? `its item ${kept.item} is no longer open`
            : null
  if (gone !== null) return { state: 'on', ...at, shows: false, ended: null, says: `The first entry is on, but ${gone}, so the page does not draw it.` }
  return { state: 'on', ...at, shows: true, ended: null, says: 'The first entry is on: the page draws it until the person opens its report from the checklist.' }
}

/** POST /api/getting-started/opened: the person opened the report from the checklist, so the first entry ends. */
export function endTheFirstEntry(actor: Actor): { changed: boolean; firstEntry: TheFirstEntry } {
  if (!thePersonIsProved(actor)) {
    throw new PanelError('Only the person ends the first entry, by opening its report from the checklist. Nothing was changed.', 403)
  }
  const found = theKeptFirstEntry()
  if (found === null) throw new PanelError('This office has no first entry to end. Nothing was changed.', 409)
  if (found.kept.state === 'ended') return { changed: false, firstEntry: theFirstEntry() }
  writeDownASettingChange(actor, {
    setting: THE_FIRST_ENTRY_SETTING,
    field: 'the first entry',
    before: found.kept,
    after: { ...found.kept, state: 'ended' },
    workspaceId: DEFAULT_WORKSPACE,
  })
  return { changed: true, firstEntry: theFirstEntry() }
}
