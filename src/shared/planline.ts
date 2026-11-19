// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING VALUES A PERSON WRITES INTO A LINE OF A PLAN, AND THE ONLY PLACE THE SYNTAX IS READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A person may say how big an item is, how much time it gets, which project it belongs to and what
 * they want to remember about it, BEFORE the item is a record. You estimate in order to decide
 * whether something is worth filing, so filing must not be the thing that lets you estimate.
 *
 * Until the item is filed as work, those values live in the line's own words:
 *
 *     - Build the controller {size: 15h} {time: 15h this week} {project: greenhouse} {note: ask Sam}
 *
 * Nothing here is a fact about the project. A value in a line is what somebody wrote down. Filing
 * the line as work is what moves each value to the place Mole Office keeps that kind of fact, and
 * `src/server/lib/plans.ts` is where that happens and where it is reported.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY A TRAILING RUN COUNTS, AND AN UNKNOWN KEY IS LEFT ALONE
 * ---------------------------------------------------------------------------------------
 *
 * The groups are read from the END of the line backwards, and reading stops at the first thing that
 * is not one of these four keys in curly brackets. So:
 *
 *   - `use the {clamp} mount {size: 2h}` has one value. The word in brackets in the middle of the
 *     sentence is prose and comes back exactly as typed.
 *   - `the {x} in {y}` has none. It is a line of prose that happens to hold brackets.
 *   - `- fix it {size: 2h} {owner: sam}` has NONE. `owner` is not a key this reads, so it stops
 *     there, and the size group is no longer at the end of the line.
 *
 * AN UNKNOWN KEY IS NEVER SWALLOWED, and that is the whole reason reading stops rather than skips.
 * A person writing `{owner: sam}` has written a sentence about their work; a reader that quietly
 * dropped it because it did not recognise the word would delete what they wrote.
 *
 * ---------------------------------------------------------------------------------------
 * THE ROUND TRIP IS EXACT, AND THAT IS WHY EACH GROUP CARRIES ITS OWN CHARACTERS
 * ---------------------------------------------------------------------------------------
 *
 * `writePlanLine(parsePlanLine(line))` is the line back, byte for byte, for every line. Each value
 * keeps `source` — the group exactly as typed, brackets included — and `before`, the spaces between
 * it and the piece in front of it. So `{ size : 15h }` is stored and printed with its own spacing,
 * and a plan a person saves twice does not drift one space at a time.
 *
 * A plan is written in a text box and the text box is the store, so anything this file cannot put
 * back exactly is something a person loses by pressing Save.
 */

import { budgetAgainst, countWords, SHORT_FORM_SPECS } from './zoom.ts'

/** The four things a line may say about itself. Anything else is prose. */
export const PLANNING_KEYS = ['size', 'time', 'project', 'note'] as const

export type PlanningKey = (typeof PLANNING_KEYS)[number]

export function isPlanningKey(word: string): word is PlanningKey {
  return (PLANNING_KEYS as readonly string[]).includes(word)
}

/** One `{key: value}` group at the end of a line. */
export interface PlanningValue {
  key: PlanningKey
  /** The words between the colon and the closing bracket, with the outer spaces taken off. */
  value: string
  /** The whole group exactly as typed, brackets included, so it can be put back unchanged. */
  source: string
  /** The characters between the piece in front of this group and this group: spaces, or nothing. */
  before: string
}

/** A line of a plan, split into the words and the run of groups at the end of it. */
export interface ParsedLine {
  /** The line without its trailing run of groups, exactly as typed. */
  text: string
  /** The groups, in the order they are written. Empty when the line has none. */
  values: PlanningValue[]
  /** Whatever was typed after the last group: spaces, or nothing. */
  after: string
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t'
}

/**
 * Read one line into its words and its trailing groups. It never changes a character.
 *
 * A line with no trailing run comes back whole in `text`, with no values and an empty `after`, so a
 * caller that only wants the words can use `text` for every line without asking whether it parsed.
 */
export function parsePlanLine(line: string): ParsedLine {
  let end = line.length
  while (end > 0 && isSpace(line[end - 1]!)) end--
  const after = line.slice(end)

  const found: PlanningValue[] = []
  let at = end
  for (;;) {
    if (at === 0 || line[at - 1] !== '}') break
    const open = line.lastIndexOf('{', at - 1)
    if (open === -1) break
    const inside = line.slice(open + 1, at - 1)
    // A group holds no bracket of its own. `{note: a} b}` would otherwise read as a note whose words
    // are `a} b`, which is not what the person wrote.
    if (inside.includes('{') || inside.includes('}')) break
    const colon = inside.indexOf(':')
    if (colon === -1) break
    const key = inside.slice(0, colon).trim()
    if (!isPlanningKey(key)) break
    let start = open
    while (start > 0 && isSpace(line[start - 1]!)) start--
    found.push({
      key,
      value: inside.slice(colon + 1).trim(),
      source: line.slice(open, at),
      before: line.slice(start, open),
    })
    at = start
  }

  if (found.length === 0) return { text: line, values: [], after: '' }
  found.reverse()
  return { text: line.slice(0, at), values: found, after }
}

/** Put a parsed line back together. With nothing changed it gives back the exact line. */
export function writePlanLine(parsed: ParsedLine): string {
  return parsed.text + parsed.values.map((value) => value.before + value.source).join('') + parsed.after
}

/** The groups on this line with this key, in the order they are written. */
export function valuesFor(parsed: ParsedLine, key: PlanningKey): PlanningValue[] {
  return parsed.values.filter((value) => value.key === key)
}

/**
 * The line's note, or null.
 *
 * NULL WHEN THE LINE HOLDS MORE THAN ONE NOTE GROUP, because Mole Office will not pick one of two things
 * a person wrote. The words are still there in the line and nothing has been hidden: the line's own
 * text is what a reader sees, and this is only the convenience read for a box that shows one note.
 */
export function noteOf(line: string): string | null {
  const notes = valuesFor(parsePlanLine(line), 'note')
  if (notes.length !== 1) return null
  return notes[0]!.value
}

/**
 * Why this note cannot be written into a line's words, or null when it can be.
 *
 * A sentence rather than a thrown error, because this file is shared with the browser and the
 * refusal a caller needs belongs to whichever surface is refusing.
 */
export function whyNoteCannotBeWritten(note: string): string | null {
  if (note.includes('{') || note.includes('}')) {
    return (
      'A note cannot hold a curly bracket. The note is kept in the line\'s own words and the brackets are ' +
      'what mark it there, so a bracket inside one would end it in the middle.'
    )
  }
  if (/[\r\n]/.test(note)) {
    return 'A note is part of one line of the plan, so it cannot hold a line ending.'
  }
  return null
}

/**
 * The line with this note on it: added, replaced, or taken off when the note is null or empty.
 *
 * Every note group already on the line is removed first, so a line never ends up with two notes
 * because somebody wrote in the box twice. The words in front are not touched.
 *
 * Check `whyNoteCannotBeWritten` first. This does not check, because the caller has to be able to
 * refuse in its own words rather than have this file throw through it.
 */
export function lineWithNote(line: string, note: string | null): string {
  const parsed = parsePlanLine(line)
  const kept = parsed.values.filter((value) => value.key !== 'note')
  const words = note === null ? '' : note.trim()
  if (words === '') return writePlanLine({ ...parsed, values: kept })
  const empty = parsed.text === '' && kept.length === 0
  const added: PlanningValue = {
    key: 'note',
    value: words,
    source: `{note: ${words}}`,
    before: empty ? '' : ' ',
  }
  return writePlanLine({ ...parsed, values: [...kept, added] })
}

// ---------------------------------------------------------------------------- the word budget

/** A heading line: one to six hashes, a space, then the heading's own words. */
const A_HEADING = /^(#{1,6}) +(.*)$/

/**
 * THE TWO BUDGETS A PLAN LINE IS HELD TO, READ OFF THE LADDER RATHER THAN WRITTEN AGAIN.
 *
 * A BODY LINE IS HELD TO THE LEVEL-2 BUDGET (at most 15 words) and A HEADING TO THE LEVEL-1 BUDGET
 * (at most 5 words). Both are the ladder's own specs, imported here, so the plan door and the record
 * door refuse in one sentence and cannot drift apart. P2 of design/planning/ACCEPTANCE.md.
 *
 * EVERY HEADING IS HELD TO THE LEVEL-1 BUDGET, and that is a decision made on the data. A heading
 * in a plan document is the name of a part of the plan — a plan or a sub-plan
 * is named with the level-1 or level-2 form — and nothing in this product stores which heading names
 * a sub-plan: `plan_lines` holds id, planId, position, text, recordId, remark and two stamps, and no
 * sub-plan pointer exists anywhere. So the narrower budget is the honest reading for all of them.
 */
const BUDGET_OF_A_HEADING = SHORT_FORM_SPECS.label
const BUDGET_OF_A_LINE = SHORT_FORM_SPECS.title

/**
 * WHY A LINE OR A HEADING IS OVER ITS BUDGET, OR NULL — THE UPPER BOUND ONLY.
 *
 * AT MOST, AND NOTHING ELSE. A blank line and a one-word heading are accepted, because the ladder's
 * lower bound belongs to a record's short form and not to a plan line: a refusal of "Goals" would be
 * a rule nobody asked for. So the count is compared with the maximum and `budgetAgainst`, the one
 * function that turns a budget and a text into the office's refusal, is asked only once the count is
 * over. It cannot come back empty there, and the guard below keeps a future change to it from
 * turning an over-budget line into a silent pass.
 *
 * IT ANSWERS AND DOES NOT THROW, because it has two callers that do different things with the answer:
 * `checkLineBudget` in src/server/lib/plans.ts refuses the write, and migration 0196
 * (src/server/db/drafts-into-plans-migration.ts) leaves a draft where it is and says why. It moved
 * here from plans.ts for the second caller, which may not open the database plans.ts opens; the rule
 * is still written once.
 *
 * THE WORDS OF A LINE ARE THE LINE WITHOUT ITS TRAILING RUN OF `{key: value}` GROUPS, which is what
 * `parsePlanLine` reads out and the same words the table draws. A note or a size is a field the line
 * carries, not part of what it says, so writing one does not spend the budget.
 */
export function whyALineIsOverItsBudget(text: string): string | null {
  const heading = A_HEADING.exec(text)
  const budget = heading === null ? BUDGET_OF_A_LINE : BUDGET_OF_A_HEADING
  const words = parsePlanLine(heading === null ? text : heading[2]!).text
  if (countWords(words) <= budget.maxWords) return null
  return budgetAgainst(budget, words)
}
