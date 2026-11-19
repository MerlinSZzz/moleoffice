// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A PLAN'S LINES FOR DISPLAY, AND PRINTING VERBATIM WHATEVER CANNOT BE READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR, AND THE ONE THING IT MUST NEVER DO
 * ---------------------------------------------------------------------------------------
 *
 * A plan is a document a person writes. It holds prose, headings, bullets, numbered lists, tick
 * boxes and tables, and NONE of it is project truth. Nothing here parses a line for meaning, and nothing here decides
 * that a line is a task, a deadline or an estimate. A line becomes a record only when a person
 * presses "File as work", which is a write in src/server/lib/plans.ts and not a reading of text.
 *
 * So this file answers one question: how should this line be drawn on screen? It answers with a
 * block per line — a heading, a bullet, a numbered item, a tick box, a paragraph — and it groups
 * consecutive table lines into one table so a pipe table draws as a table.
 *
 * The blocks are a flat list, in the order the lines were written. `src/shared/planoutline.ts`
 * turns them into a tree when a caller needs one; the tree is worked out from these blocks every
 * time and never stored.
 *
 * WHEN IT CANNOT READ SOMETHING IT SAYS SO AND PRINTS THE LINES EXACTLY AS TYPED. It never guesses,
 * never repairs and never drops a line. `MathText.tsx` set that precedent in this product and this
 * follows it. A run of table lines can be unreadable for two reasons: the first line has no row of
 * dashes under it, or a later row has a different number of cells from the heading. Its block keeps
 * the reason and its numbers, and the page says why in plain words.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY LINE COMES BACK, IN ORDER, UNCHANGED
 * ---------------------------------------------------------------------------------------
 *
 * Each block carries the lines it was made from. Concatenating the lines of every block in order
 * gives back exactly the lines that went in, with the same ids and the same text. That is the
 * property tests/plandoc.test.ts proves, and it is what makes "printed exactly as typed" a fact
 * about the data rather than a promise in a comment. A renderer that only ever prints `line.text`
 * is therefore always able to draw the document, whatever this file made of it.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS A SECOND BLOCK READER IN THIS PRODUCT, AND IT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * `renderMarkdown` in `src/web/components/SummaryBlocks.tsx` also decides which lines are headings,
 * lists and quotes, for a record's summary. That is two readers on purpose, not the drift this
 * repository keeps finding: a plan's reader must be byte exact and line addressable, because every
 * line here is a stored row somebody can file as work, give hours to and point at a record, so it
 * hands back every character it was given, in the same lines, with the same ids. A summary has no
 * stored lines and no addresses, so it reflows paragraphs, joins wrapped lines and drops blank ones
 * — all three of which this file may never do. DO NOT MERGE THEM: merging would either make a plan
 * quietly rewrite what somebody typed, or give a summary a line model nothing uses. The INSIDE of a
 * line is a different matter and was merged this pass: what bold, code, a link and `$maths$` mean is
 * answered once, in `src/shared/inline.ts`, for both. Those two files say the same thing at their
 * ends; this is the third end, written so that a reader arriving here first sees a decision rather
 * than a duplicate.
 *
 * NOTHING HERE READS A DATABASE. It is a pure function of the lines it is given, so the browser and
 * the server read a plan the same way.
 */

import { readStoredWord, type WordKey, type WordValues } from './i18n.ts'
import { tableRowCells } from './table-row.ts'

/**
 * The three things a plan can be.
 *
 * A PLAN CAN END, and that is why `done` and `dropped` are here. Without them a plan only ever
 * accumulates and an old one rots into a wall of stale text. Nothing computes these; a person sets
 * one while editing the plan.
 *
 * `done` means the writing did what it was for. `dropped` means it did not and nobody will finish
 * it. They are different answers and a reader wants to know which, so there is no single "closed".
 */
export const PLAN_STATES = ['open', 'done', 'dropped'] as const

export type PlanState = (typeof PLAN_STATES)[number]

export function isPlanState(value: unknown): value is PlanState {
  return typeof value === 'string' && (PLAN_STATES as readonly string[]).includes(value)
}

/**
 * A whole document split into the lines a plan stores, one per stored row.
 *
 * SPLIT ON THE NEWLINE AND NOTHING ELSE. No trimming, no re-wrapping, no dropping of blank lines,
 * no collapsing of runs. A blank line is a line, trailing spaces are kept, and a body ending in a
 * newline ends in an empty line — because that is what the person typed.
 *
 * THE NEWLINE INCLUDES THE CARRIAGE RETURN. This function removes nothing, so a `\r` in the string
 * it is given stays inside the line it is on.
 *
 * NO STORED PLAN LINE HOLDS ONE ANY MORE, and that is decided one level up rather than here.
 * `linesOfDocument` in src/server/lib/plans.ts takes the line ending off a whole document — carriage
 * return and newline, newline alone, or carriage return alone — and then calls this. It counts what
 * it took off and both routes that store a document say so in words, which is what keeps it from
 * being a silent rewrite of somebody's writing.
 *
 * THIS COMMENT USED TO SAY THE OPPOSITE: that the carriage return was kept deliberately, and that a
 * Windows paste came back out with its `\r`. It did come back out, and that was the defect. A plan
 * pasted in from a Windows file lost every one of its bindings to real work the first time somebody
 * typed a character in it. The writing box is a textarea and the HTML standard says a textarea gives
 * its value back with every line ending as a plain newline, so one keystroke sent back a document in
 * which every line differed from the stored one by a character no person can produce. `plandiff.ts`
 * compares characters, so every row was deleted and replaced and every record binding went with it.
 */
export function linesOfBody(body: string): string[] {
  return body.split('\n')
}

/**
 * The lines joined back into one document.
 *
 * `bodyOfLines(linesOfBody(body)) === body` for every string, and tests/plandoc.test.ts proves it
 * on bodies with blank lines, trailing whitespace, tables and no trailing newline. That round trip
 * is what makes it safe for migration 0010 to store a draft's body as lines: the words are moved,
 * not rewritten.
 */
export function bodyOfLines(lines: readonly string[]): string {
  return lines.join('\n')
}

/** One stored line, as this file needs it: its id, and the words exactly as typed. */
export interface PlanDocLine {
  id: string
  text: string
}

/** Every block kind carries the lines it was made from, in the order they were stored. */
interface FromLines {
  lines: readonly PlanDocLine[]
}

/**
 * How one part of a plan should be drawn.
 *
 * One block per line, with one exception: consecutive table lines become a single `table` block,
 * because a table drawn a row at a time is not a table. Every block carries its lines, so a
 * renderer can always fall back to printing them.
 */
export type PlanBlock =
  /** An empty line. It is kept because the spacing a person typed is part of what they wrote. */
  | ({ kind: 'blank' } & FromLines)
  /** A heading: one to six hashes, a space, then the words. `text` has the hashes removed. */
  | ({ kind: 'heading'; level: number; text: string } & FromLines)
  /** A bullet. `indent` is how many spaces it was written with, so nesting draws as written. */
  | ({ kind: 'bullet'; indent: number; text: string } & FromLines)
  /** A bullet whose words start with a box. `done` is whether the box has an x in it. */
  | ({ kind: 'tickbox'; indent: number; done: boolean; text: string } & FromLines)
  /**
   * A numbered list item: some spaces, digits, a full stop, a space, then the words.
   *
   * `number` is the digits exactly as written, so `01.` stays `01` and a list that starts at 3 stays
   * starting at 3. Nothing here renumbers anything. `text` is the words with the marker removed, and
   * the stored line still holds the marker, so the document comes back character for character.
   *
   * A box after the number — `1. [x] done` — is not read as a tick box. Only a bullet's is. That is
   * the smallest rule that reads what people have actually written here.
   */
  | ({ kind: 'numbered'; indent: number; number: string; text: string } & FromLines)
  /** An ordinary line of prose. Drawn as the words themselves, unchanged. */
  | ({ kind: 'paragraph'; text: string } & FromLines)
  /** A pipe table that reads cleanly: a heading row, a separator row, then the rows. */
  | ({ kind: 'table'; heading: readonly string[]; rows: readonly (readonly string[])[] } & FromLines)
  /**
   * Lines Mole Office could not read, to be printed exactly as typed with `why` shown beside them.
   *
   * This is the honest answer and not a failure to handle a case. `why` is written for the person
   * looking at the screen, so it says what disagrees rather than naming a rule they cannot see.
   *
   * `because` is the same reason as a code with its numbers. A page says it in the page's own
   * language with `whyNotRead(because, t)`; `why` is that sentence in English, which is what the
   * server sends. Both come from `whyNotRead`, so they cannot say different things.
   */
  | ({ kind: 'notUnderstood'; because: NotReadBecause; why: string } & FromLines)

/**
 * WHY A RUN OF TABLE LINES COULD NOT BE READ, as a code with its numbers.
 *
 * `noDashRow`: there is no row of dashes under the first line, so nothing says which line is the
 * heading. `cellsDisagree`: a row has `cells` cells where the heading row has `headings`.
 */
export type NotReadBecause =
  | { code: 'noDashRow' }
  | { code: 'cellsDisagree'; headings: number; cells: number }

/**
 * The sentence for a reason, in whichever language `say` speaks.
 *
 * `say` is `t` on a page, so the page draws it in the page's language. Left out, it is
 * `readStoredWord`, which is English on the server, so the server's reply stays English.
 */
export function whyNotRead(
  because: NotReadBecause,
  say: (key: WordKey, values?: WordValues) => string = readStoredWord,
): string {
  return because.code === 'noDashRow'
    ? say('planDoc.notRead.noDashRow')
    : say('planDoc.notRead.cellsDisagree', { n: because.cells, headings: because.headings })
}

function notUnderstood(because: NotReadBecause, lines: readonly PlanDocLine[]): PlanBlock {
  return { kind: 'notUnderstood', because, why: whyNotRead(because), lines }
}

const HEADING = /^(#{1,6}) +(.*)$/
const BULLET = /^( *)[-*+] +(.*)$/
const TICKBOX = /^\[([ xX])\] ?(.*)$/
const NUMBERED = /^( *)(\d+)\. +(.*)$/

/** A table line is one whose first non-space character is a pipe. Nothing else counts as one. */
function isTableLine(text: string): boolean {
  return text.trimStart().startsWith('|')
}

/**
 * The cells of one pipe row.
 *
 * `tableRowCells` in src/shared/table-row.ts is the one reader of where a cell begins and ends. It
 * leaves a pipe alone inside `$...$`, `$$...$$` and a back-tick code span, and reads `\|` as one
 * literal pipe, so a row can hold `$|A-B|$` and still line up with its heading.
 */
function cellsOf(text: string): string[] {
  return tableRowCells(text).map((cell) => cell.text.trim())
}

/** A separator row is one whose every cell is dashes, with an optional colon at either end. */
function isSeparatorRow(text: string): boolean {
  const cells = cellsOf(text)
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

/**
 * Read one run of consecutive table lines, or say why it cannot be read.
 *
 * Three things have to hold, and each one has its own sentence when it does not: there is a
 * separator row under the heading, and every row has as many cells as the heading. A run that fails
 * any of them is returned whole as `notUnderstood`, never half-read — half a table is a guess about
 * which half was meant.
 */
function readTable(run: readonly PlanDocLine[]): PlanBlock {
  if (run.length < 2 || !isSeparatorRow(run[1]!.text)) return notUnderstood({ code: 'noDashRow' }, run)
  const heading = cellsOf(run[0]!.text)
  const rows: string[][] = []
  for (const line of run.slice(2)) {
    const cells = cellsOf(line.text)
    if (cells.length !== heading.length) {
      return notUnderstood({ code: 'cellsDisagree', headings: heading.length, cells: cells.length }, run)
    }
    rows.push(cells)
  }
  return { kind: 'table', heading, rows, lines: run }
}

/** Read one line that is not part of a table. This never fails: prose is always readable. */
function readLine(line: PlanDocLine): PlanBlock {
  const lines = [line]
  if (line.text.trim() === '') return { kind: 'blank', lines }

  const heading = HEADING.exec(line.text)
  if (heading !== null) return { kind: 'heading', level: heading[1]!.length, text: heading[2]!, lines }

  const bullet = BULLET.exec(line.text)
  if (bullet !== null) {
    const indent = bullet[1]!.length
    const rest = bullet[2]!
    const tick = TICKBOX.exec(rest)
    if (tick !== null) {
      return { kind: 'tickbox', indent, done: tick[1]!.toLowerCase() === 'x', text: tick[2]!, lines }
    }
    return { kind: 'bullet', indent, text: rest, lines }
  }

  const numbered = NUMBERED.exec(line.text)
  if (numbered !== null) {
    return {
      kind: 'numbered',
      indent: numbered[1]!.length,
      number: numbered[2]!,
      text: numbered[3]!,
      lines,
    }
  }

  // Everything else is prose, including a line of seven hashes and a list numbered with brackets
  // rather than full stops. Prose is drawn as the words themselves, so there is nothing here that
  // could be got wrong.
  return { kind: 'paragraph', text: line.text, lines }
}

/**
 * Turn a plan's stored lines into the blocks a reader sees.
 *
 * Every line goes into exactly one block, in order. Nothing is dropped, nothing is merged except
 * consecutive table lines, and nothing is invented.
 */
export function blocksOf(lines: readonly PlanDocLine[]): PlanBlock[] {
  const blocks: PlanBlock[] = []
  let at = 0
  while (at < lines.length) {
    const line = lines[at]!
    if (isTableLine(line.text)) {
      let end = at
      while (end < lines.length && isTableLine(lines[end]!.text)) end += 1
      blocks.push(readTable(lines.slice(at, end)))
      at = end
      continue
    }
    blocks.push(readLine(line))
    at += 1
  }
  return blocks
}

/**
 * THE ROW OF DASHES A TABLE IS MISSING, AND THE LINE IT GOES UNDER.
 *
 * Only for a run read as `noDashRow`, and null for anything else. It is an offer for a person to
 * accept with a press: nothing here writes it into a plan, and the reader never adds it by itself.
 * The row has one cell of three dashes for each cell of the first line, and it keeps that line's
 * indent. Adding it does not promise a table: if the rows below then disagree with the heading,
 * the run is read as `cellsDisagree` and still printed as typed.
 */
export function dashRowFor(block: PlanBlock): { under: PlanDocLine; text: string } | null {
  if (block.kind !== 'notUnderstood' || block.because.code !== 'noDashRow') return null
  const under = block.lines[0]
  if (under === undefined) return null
  const indent = under.text.slice(0, under.text.length - under.text.trimStart().length)
  return { under, text: `${indent}|${' --- |'.repeat(cellsOf(under.text).length)}` }
}
