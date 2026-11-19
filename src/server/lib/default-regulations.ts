// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FRESH OFFICE COPIES THE DEFAULT REGULATIONS INTO ITS OWN CHAPTER RECORDS, ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * An office's regulations are its chapter records: `module` records carrying `extra.chapter`, read by
 * the regulations page (lib/office-regulations.ts). A fresh office holds none, so its page had nothing
 * to show and its owner nothing to change. By a decision, a fresh office copies the default
 * regulations into its own chapter records at its first run, so its owner can read and change them on
 * the page, without a terminal. See chapter 10, rule 4.
 *
 * The default set is src/config/rules/default-regulations.json: the owner's chapters, each rule in
 * the neutral words of its twin, with the Chinese of every chapter and every rule. A rule marked as only
 * for this office is left out, and the file lists it under `leftOut`. Each rule says where its
 * Chinese came from (`zhFrom`). The file is not written by hand: tools/rules-chapters.mjs writes it from
 * the chapter records, by `theDefaultSetFromRecords` in src/shared/default-set.ts.
 * tests/a-fresh-office-copies-the-default-regulations.test.ts holds its outline to the
 * owner's export, rule id for rule id, so a rule in neither the set nor `leftOut` fails a test.
 *
 * ---------------------------------------------------------------------------------------
 * EACH DEFAULT CHAPTER ONCE, AND NEVER OVER A CHAPTER THE OFFICE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * The copy runs at every start. It reads which chapter numbers the office has ever held: in every
 * project, deleted chapters included, because Mole Office never really deletes a record. It copies
 * each chapter of the default set whose number is not among them, and it changes no chapter the
 * office holds. So:
 *   - an office that has never held a chapter gets the whole set;
 *   - an office whose chapters were copied or filed before the role chapters came into the set gets
 *     the role chapters at its next start, and the chapters it holds are not changed;
 *   - a second start finds every number held and writes nothing;
 *   - an owner who deletes a chapter does not get it back at the next start; the restore on the
 *     regulations page brings it back.
 * A chapter whose number was changed counts only under the number it holds now. Its old number is
 * only in its revisions, so a start copies the default chapter of the old number.
 *
 * Every start reads the file and the number of each of its chapters, and stops, naming the file,
 * when it cannot. The rest of the file is read and checked only when a chapter is to be copied.
 *
 * The chapters go into the project the office's live chapters are in, by the rule the chapter
 * restore uses (`theProjectOfTheChapters` in chapter-rows.ts), or into `default` when it holds none.
 * All of it is one transaction: the office gets every chapter it lacks, or none.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS
 * ---------------------------------------------------------------------------------------
 *
 * Each copied chapter carries `extra.copiedFromTheDefaults`, saying when, from which file, and
 * whether the office held a chapter record when it was copied. A stamp written before that last
 * field came lacks it, and reads as holding none. That is true of every such stamp: the rule that a
 * start copied only into an office that had never held a chapter came in with the stamp itself, so
 * no stamp was ever written into an office that had held one. The regulations page reads the stamps
 * and says, in the page's language, which start copied which chapters, and that they may be
 * changed. The start prints one line either way, which the server's log keeps. The writes are the
 * office's own (`system`, with its live row's id), so each chapter's history says who wrote it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { REPO_ROOT } from '../../config/settings.mjs'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { asTheOfficesCopyOfTheDefaults, createRecord, patchRecord, type Actor } from './records.ts'
import { isAChapterRow, theProjectOfTheChapters } from './chapter-rows.ts'
import { listRevisions } from './revisions.ts'
import { writeShortForms } from './zoom.ts'
import { A_CHAPTER, theEnglishHashOfAChapter, theEnglishHashOfARule, type CopiedFromTheDefaults } from '@shared/office-rules.ts'
import { WHERE_A_RULES_CHINESE_CAME_FROM } from '@shared/default-set.ts'
import { moleOffice } from '@shared/participants.ts'
import { nowStamp } from '@shared/time.ts'
import { contentOfChapter, problemsWithAChapter } from '@shared/chapter-check.ts'
import { readTheDefaultRegulations } from './read-the-default-regulations.ts'
import { THE_DEFAULT_REGULATIONS_FILE } from './read-the-default-regulations.ts'
import { THE_DEFAULT_REGULATIONS_PATH } from './read-the-default-regulations.ts'
import { theChaptersListedIn } from './read-the-default-regulations.ts'

export { THE_DEFAULT_REGULATIONS_FILE } from './read-the-default-regulations.ts'
export { THE_DEFAULT_REGULATIONS_PATH } from './read-the-default-regulations.ts'

function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** One rule of the default set. */
export interface DefaultRule {
  id: string
  name: string
  text: string
  /** The rule's Chinese: its name and its text, in the words the default set's English says. */
  zh: { name: string; text: string }
  /**
   * WHERE THAT CHINESE CAME FROM, so a reader can tell the two apart: started from the owner's own
   * chapter record, or written for the default set because the record had none.
   */
  zhFrom: (typeof WHERE_A_RULES_CHINESE_CAME_FROM)[number]
}


/** One chapter of the default set, with the Chinese of its label, title and conclusion. */
export interface DefaultChapter {
  n: number
  forRole?: string
  label: string
  title: string
  conclusion: string
  context: string
  outline: DefaultRule[]
  zh: { label: string; title: string; conclusion: string }
}

/** What one start did, in words. */
export interface WhatTheCopyDid {
  /** How many chapter records it wrote, or zero when none was copied. */
  copied: number
  /** The line the start prints. */
  line: string
}

export { readTheDefaultRegulations } from './read-the-default-regulations.ts'

export { theChaptersListedIn } from './read-the-default-regulations.ts'

/** How many chapter records this office has ever held, in any project, deleted ones included. */
export function chapterRecordsEverHeld(): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(records)
    .where(isAChapterRow())
    .get()
  return row?.n ?? 0
}

/**
 * THE CHAPTER NUMBERS THIS OFFICE HAS EVER HELD, in any project, deleted ones included. A chapter record whose number
 * is not a whole number of at least 1 is among them, and matches no chapter of the default set.
 */
export function chapterNumbersEverHeld(): number[] {
  return db
    .selectDistinct({ n: sql<number>`json_extract(${records.data}, ${A_CHAPTER.jsonPath})` })
    .from(records)
    .where(isAChapterRow())
    .all()
    .map((row) => row.n)
}

/**
 * COPY INTO THIS OFFICE EACH DEFAULT CHAPTER WHOSE NUMBER IT HAS NEVER HELD. Called once by every start
 * (src/server/index.ts), after the database is migrated and before anything is served.
 */
export function copyTheDefaultRegulationsOnce(file = THE_DEFAULT_REGULATIONS_PATH, checkout?: string): WhatTheCopyDid {
  const everHeld = new Set(chapterNumbersEverHeld())
  const lacking = theChaptersListedIn(file).numbers.filter((n) => !everHeld.has(n))
  const held = chapterRecordsEverHeld()
  if (lacking.length === 0) return { copied: 0, line: theLineOfTheCopy({ held, copied: [], project: '' }) }
  const chapters = readTheDefaultRegulations(file, checkout).filter((chapter) => lacking.includes(chapter.n))
  const project = theProjectOfTheChapters()
  const copiedFromTheDefaults: CopiedFromTheDefaults = { file: THE_DEFAULT_REGULATIONS_FILE, at: nowStamp(), officeHeldChapters: held > 0 }
  // THE OFFICE'S OWN COPY NEEDS NO DECISION OF THE OWNER'S, so it is the one write a chapter's outline guard lets
  // through without the person or a warrant (`asTheOfficesCopyOfTheDefaults` in lib/records/served-doors.ts).
  asTheOfficesCopyOfTheDefaults(() =>
    sqlite.transaction(() => {
      for (const chapter of chapters) copyOneChapter(chapter, copiedFromTheDefaults, project)
    })(),
  )
  return { copied: chapters.length, line: theLineOfTheCopy({ held, copied: chapters.map((chapter) => chapter.n), project }) }
}

/**
 * THE LINE A START PRINTS ABOUT THE COPY, from how many chapter records the office had ever held before it, the numbers
 * it copied, and the project it copied them into. The tests read it from here.
 */
export function theLineOfTheCopy(copy: { held: number; copied: readonly number[]; project: string }): string {
  const { held, copied, project } = copy
  if (copied.length === 0) {
    return `The default regulations were not copied: this office already holds ${String(held)} chapter record${held === 1 ? '' : 's'}, ` +
      'and every chapter number of the default set is among them, deleted ones counted.'
  }
  if (held === 0) {
    return `This office held no chapter of regulations, so the ${String(copied.length)} chapters of the default set ` +
      `(${THE_DEFAULT_REGULATIONS_FILE}) were copied into its "${project}" project. The owner may change them on the regulations page.`
  }
  const one = copied.length === 1
  return `This office has never held ${one ? 'chapter' : 'chapters'} ${copied.join(', ')} of the default set (${THE_DEFAULT_REGULATIONS_FILE}), ` +
    `so ${one ? 'that chapter was' : `those ${String(copied.length)} chapters were`} copied into its "${project}" project. ` +
    'The chapters it held were not changed. The owner may change them on the regulations page.'
}

/**
 * ONE CHAPTER, IN THREE WRITES. The record first; then its label, which is a short form and has its
 * own door; then its Chinese half, last, because that half names the hash of the English it
 * translates and the label is part of that English.
 */
function copyOneChapter(chapter: DefaultChapter, copiedFromTheDefaults: CopiedFromTheDefaults, project: string): void {
  const record = createRecord({
    kind: 'module',
    title: chapter.title,
    summary: chapter.conclusion,
    workspaceId: project,
    actor: theOffice(),
    data: {
      context: chapter.context,
      state: 'active',
      parts: [],
      // EACH RULE WITH ITS CHINESE, written from this English: `from` is the hash of the rule's name and
      // text, as `ruleEnglish` in @shared/office-rules.ts reads them, so the page draws it as current.
      summaryBlocks: chapter.outline.map((rule) => ({
        id: rule.id,
        type: 'text',
        heading: rule.name,
        text: rule.text,
        zh: { heading: rule.zh.name, text: rule.zh.text, from: theEnglishHashOfARule(rule) },
      })),
      extra: { chapter: chapter.n, ...(chapter.forRole === undefined ? {} : { forRole: chapter.forRole }), copiedFromTheDefaults },
    },
  })
  const newest = listRevisions(record.id, 1).revisions[0]
  if (newest === undefined) throw new Error(`Chapter ${String(chapter.n)} was filed as ${record.id} and has no revision to name.`)
  writeShortForms(
    record.id,
    project,
    { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: chapter.label } },
    theOffice(),
  )
  patchRecord(
    record.id,
    {
      dataPatch: {
        zh: {
          title: chapter.zh.title,
          summary: chapter.zh.conclusion,
          label: chapter.zh.label,
          from: theEnglishHashOfAChapter(chapter),
        },
      },
    },
    theOffice(),
  )
}
