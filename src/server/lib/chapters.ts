// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CODE OF LAW AT ITS SEMANTIC LEVELS, AND THE CHAPTERS LINE ON ONE AGENT.
 *
 * Criteria C14, C15, C16 and C23 of design/rules/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CHAPTERS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * From the office's chapter records: the one set the office holds, in whichever project they are filed, read by
 * `theOfficesChapterRecords` in lib/office-regulations.ts, which GET /api/office-regulations reads too. The record is
 * the only authority. Every project of an office reads the same set, because an office holds one set of regulations,
 * so an agent in a project that files no chapter is still named its office's. A new office copies the default set into
 * its records at its first start (lib/default-regulations.ts), and its owner may change them there. An office that holds no chapter, or no rule a
 * reader names, is said to hold none; no reader names another office's.
 *
 * UNTIL WAVE 13W THIS FILE READ src/config/rules/chapters.json, the export tools/rules-chapters.mjs
 * writes from the chapter records of the office this repository is developed in. Every other office's
 * agents were named that office's chapters and pointed at its CODE.md.
 * tests/an-agent-is-pointed-at-its-own-offices-regulations.test.ts holds the readers to the office's
 * records. The export is still what this repository's own rules file is made from (src/worker/rules.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN UNWRITTEN POSITION SAYS
 * ---------------------------------------------------------------------------------------
 *
 * Positions 5, 6 and 7 — sketch, digest and the full text — are not written for any chapter yet.
 * Criterion C8: an unwritten position says so and is never a cut-down copy of the one above. So
 * `chapterAt` hands back what IS written up to the position asked for, and one sentence naming the
 * positions nobody has written. It never pads a digest out of an outline.
 */

import {
  A_NAMED_CHAPTER_IS_READ_AT,
  EVERY_AGENT_HOLDS,
  LADDER,
  readAChaptersLine,
  theChaptersLine,
  theRungACardMeans,
  type ChapterName,
  type ChapterNamed,
  type ChaptersLineRead,
  type TheChaptersLine,
} from '@shared/chapters.ts'
import type { Rung } from '@shared/detail.ts'
import { readRoundChapters, savedChaptersLine, type RoundChapters } from '@shared/round-chapters/manifest.ts'
import { chaptersInBothLanguagesFromRecords, chaptersInTheStandingLoad, theNameOfAChapter, type OfficeChapterInBothLanguages } from '@shared/office-rules.ts'
import { selectedChaptersInBothLanguages, type SelectedOfficeChapter } from './office-regulations.ts'
import { theRoleCards } from './roles.ts'
import { cardFor, A_ROW_WITH_NO_ROLE_READS_AS, type NamedChapter, type RolesDeclaration } from '@shared/roles.ts'

/** Every chapter of the office's regulations, in order, read from its records. Empty when the office holds none. */
export function theChapters(): OfficeChapterInBothLanguages[] {
  return selectedChaptersInBothLanguages()
}

/** Just the numbers and names, which is all a chapters line needs to be read against. */
export function chapterNames(): ChapterName[] {
  return theChapters().map((one) => ({ n: one.n, label: theNameOfAChapter(one).name }))
}

/**
 * THE CHAPTERS THE ROLE CARDS POINT AT, EACH WITH ITS NAME IN THIS OFFICE. src/config/roles.json names a chapter by its
 * number only, and this is where a reader of the cards gets the name: `theNameOfAChapter`, in English and in Chinese, the
 * name the regulations page gives it (invariant 9: a name typed in two places drifts). A chapter the office does not hold is left
 * out, since the office has no name to give it; the card's page then draws its bare number, and the card message says
 * the office does not hold it. tests/a-role-card-has-all-its-parts.test.ts holds the cards to the default set's list.
 */
export function theChaptersOfTheCards(decl: RolesDeclaration): NamedChapter[] {
  const held = theChapters()
  return decl.chapters.flatMap((one) => {
    const chapter = held.find((here) => here.n === one.number)
    if (chapter === undefined) return []
    const named = theNameOfAChapter(chapter)
    return [{ number: one.number, name: named.name + (('selectionNotice' in chapter && chapter.selectionNotice) ? ` — ${String(chapter.selectionNotice)}` : ''), zh: named.zh }]
  })
}

/** One chapter of the office by number, or null. */
export function chapterNumbered(n: number): OfficeChapterInBothLanguages | null {
  return theChapters().find((one) => one.n === n) ?? null
}

/** One rule as its chapter holds it, with its place in the chapter counted from 1. */
export interface ARuleFound {
  number: number
  name: string
  text: string
  /** The same recovery notice the selected chapter carries, empty for a usable stored chapter. */
  selectionNotice: string
}

/**
 * ONE RULE OF ONE CHAPTER OF THE OFFICE, found by its id, so a rule moved to another number is still the one read.
 * Null when the office holds no such chapter, or its chapter holds no rule with that id; `theAbsenceOfARule` says which.
 */
export function theRuleWithTheId(chapter: number, rule: string): ARuleFound | null {
  const held = chapterNumbered(chapter)
  const at = held === null ? -1 : held.outline.findIndex((one) => one.id === rule)
  if (held === null || at === -1) return null
  const selectionNotice = (held as Partial<SelectedOfficeChapter>).selectionNotice ?? ''
  return { number: at + 1, name: held.outline[at]!.name, text: held.outline[at]!.text + (selectionNotice ? `\n\n${selectionNotice}` : ''), selectionNotice }
}

/**
 * WHICH OF THE TWO IS MISSING, THE CHAPTER OR ITS RULE, as the start of a sentence. The brief and the inspector's
 * prompt both say it when `theRuleWithTheId` finds nothing, so the two say the same.
 */
export function theAbsenceOfARule(chapter: number, rule: string): string {
  return chapterNumbered(chapter) === null
    ? `This office's regulations hold no chapter ${String(chapter)}`
    : `This office's chapter ${String(chapter)} holds no rule with the id ${rule}`
}

// ============================================================================ a chapter at a level

/** One chapter written out at one position on the ladder. */
export interface ChapterAtALevel {
  chapter: number
  level: Rung
  /** The chapter, written out to that position. */
  text: string
  /** The positions nobody has written yet, said out loud rather than filled in. Criterion C8. */
  unwritten: string | null
  bytes: number
}

/** Where a rung sits on the ladder, 1 upwards. */
function positionOf(rung: Rung): number {
  return LADDER.indexOf(rung) + 1
}

/**
 * WHAT NOBODY HAS WRITTEN, for a read that asked past position 4.
 *
 * Positions 5, 6 and 7 for a chapter are the sketch, the digest and the full text with every
 * precedent told. A chapter record carries positions 1 to 4. A reader that
 * asked for a digest is told that, and is given the four positions that exist.
 */
function unwrittenAbove(level: Rung): string | null {
  if (positionOf(level) <= 4) return null
  return (
    'Positions 5, 6 and 7 of this chapter — the sketch, the digest and the full text with every ' +
    'precedent told — are not written for any chapter yet. What is above is positions 1 to 4: the ' +
    'name, what it governs, the Conclusion and the rules with the words under each. Read the ' +
    'absence as nobody has written it, not as there being nothing more.'
  )
}

/**
 * ONE CHAPTER, WRITTEN OUT TO ONE POSITION ON THE LADDER.
 *
 * A rung means "this much and everything shorter", which is how the detail control already reads,
 * so asking for `outline` gives the name, what it governs, the Conclusion and the rules.
 */
export function chapterAt(chapter: OfficeChapterInBothLanguages, level: Rung): ChapterAtALevel {
  const at = positionOf(level)
  const notice = (chapter as Partial<SelectedOfficeChapter>).selectionNotice
  const lines: string[] = [`## Chapter ${String(chapter.n)} — ${theNameOfAChapter(chapter).name}`]
  if (notice) lines.push('', notice)
  if (at >= 2) lines.push('', `**${chapter.title}**`)
  if (at >= 3) lines.push('', chapter.conclusion)
  if (at >= 4) {
    lines.push('', '### The rules')
    for (const [i, rule] of chapter.outline.entries()) {
      lines.push('', `${String(i + 1)}. **${rule.name}**`, '', `   ${rule.text}`)
    }
    lines.push('', `*Why it exists.* ${chapter.context}`)
  }
  const unwritten = unwrittenAbove(level)
  if (unwritten !== null) lines.push('', `*${unwritten}*`)
  const text = lines.join('\n')
  return { chapter: chapter.n, level, text, unwritten, bytes: Buffer.byteLength(text, 'utf8') }
}

/**
 * WHAT EVERY AGENT HOLDS OF THE WHOLE CODE: each chapter's name and what it governs.
 *
 * Criterion C9 measures this in bytes on the generated file; this is the same list assembled for a
 * prompt. It is what an inspector holds of the chapters its brief did NOT name (criterion C23). An
 * office that holds no chapter is told so in a sentence, not given an empty list.
 */
export function everyChapterAtItsName(chapters: readonly OfficeChapterInBothLanguages[]): { text: string; bytes: number } {
  const shared = chaptersInTheStandingLoad(chapters)
  const text =
    chapters.length === 0
      ? 'This office holds no chapter of its regulations.'
      : shared.length === 0
        ? 'This office holds no shared chapter of its regulations. Role chapters are read through their cards.'
        : shared.map((one) => `${String(one.n)}. ${theNameOfAChapter(one).name} — ${one.title}${(one as Partial<SelectedOfficeChapter>).selectionNotice ? ' — ' + (one as Partial<SelectedOfficeChapter>).selectionNotice : ''}`).join('\n')
  return { text, bytes: Buffer.byteLength(text, 'utf8') }
}

// ============================================================================ the line on an agent

/** The field on an `agent` record that holds the chapters its starter named. Criterion C14. */
export const MUST_READ = 'mustRead'

/**
 * WHAT ONE ROLE CARD'S MUST-READ LINE IS, ON THE PRODUCT'S OWN LADDER.
 *
 * The default set is not typed anywhere. It is the card's own line, translated once, here — so their
 * *the worker card's Must read line* is literally where the default chapters come from, and editing
 * src/config/roles.json changes the default with no code change.
 */
export function whatTheCardSays(role: string): ChapterNamed[] {
  const card = cardFor(theRoleCards(), role)
  if (card === null) return []
  const out: ChapterNamed[] = []
  for (const one of card.mustRead.chapters) {
    const level = theRungACardMeans(one.level)
    // A CARD WORD THIS LADDER HAS NO RUNG FOR IS DROPPED AND NOT GUESSED AT. It cannot happen while
    // readTheRoleCards checks the file, and if the card vocabulary ever grows a fourth word this is
    // the line that has to be told about it rather than the one that quietly picks something.
    if (level !== null) out.push({ chapter: one.chapter, level })
  }
  return out.sort((a, b) => a.chapter - b.chapter)
}

/** Read a chapters line as it was sent to a registration, against the chapters the office holds. */
export function readTheChaptersNamed(said: unknown): ChaptersLineRead {
  return readAChaptersLine(said, chapterNames())
}

/**
 * WHAT ONE AGENT MUST READ, from what its starter named and the card it holds.
 *
 * `named` is read off the agent record's `mustRead`. `null` means the starter named nothing, which
 * is not the same as naming an empty list, and both come out of `theChaptersLine` saying so.
 */
export function theChaptersLineFor(input: { named: unknown; role: string | null; savedSelection?: RoundChapters | null }): TheChaptersLine {
  if (input.savedSelection != null) return savedChaptersLine(readRoundChapters(input.savedSelection))
  const role = input.role ?? A_ROW_WITH_NO_ROLE_READS_AS
  const named = input.named === undefined || input.named === null ? null : readTheChaptersNamed(input.named).named
  return theChaptersLine({ named, onItsCard: theCardLineOf(input.role), role })
}

/** The Must read line of the card an agent holds, with a row that has no role read as `theChaptersLineFor` reads it. */
export function theCardLineOf(role: string | null): ChapterNamed[] {
  return whatTheCardSays(role ?? A_ROW_WITH_NO_ROLE_READS_AS)
}

export { A_NAMED_CHAPTER_IS_READ_AT, EVERY_AGENT_HOLDS }
