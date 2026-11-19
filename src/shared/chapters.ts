// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAPTERS LINE A STARTER GIVES A SUBAGENT, AND THE LEVEL EACH ONE IS READ AT.
 *
 * Criteria C14, C15 and C16 of design/rules/ACCEPTANCE.md: an agent that starts others can tell them,
 * at the start, which parts of the rules to read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A CHAPTERS LINE IS
 * ---------------------------------------------------------------------------------------
 *
 * A list of chapters of the code of law, each with the reading position it is to be read at. A
 * starter writes it into the brief and sends it when it registers the agent, so somebody who was
 * not there can read back which rules that agent was pointed at.
 *
 * ---------------------------------------------------------------------------------------
 * ONE LADDER, NOT TWO
 * ---------------------------------------------------------------------------------------
 *
 * The level is a rung of the product's seven-position detail ladder, declared in ./detail.ts. That
 * is section 6 of the design's own instruction — *this design mints no second vocabulary* — and it
 * is why nothing here invents words like "brief" or "deep".
 *
 * The role cards in design/permissions/roles.json speak three coarser words, because a card is
 * written for a person to read: `full`, `conclusion`, `label-and-title`. Those three are a naming
 * of three rungs and not a second ladder, and `theRungACardMeans` is the one place the two are
 * joined. Nothing else translates them.
 *
 * ---------------------------------------------------------------------------------------
 * LOOSE INPUT, STRICT STORAGE, VISIBLE INTERPRETATION
 * ---------------------------------------------------------------------------------------
 *
 * A starter may write `5`, `Tests and gates`, `5:full` or `tests and gates : full`. What is stored
 * is always a number and a rung. What could not be read is handed back as a problem naming the
 * word, never dropped and never guessed at.
 */

import { isRung, SEVEN_RUNGS_NAMED, type Rung } from './detail.ts'
import { readStoredWord } from './i18n.ts'

// ============================================================================ the shape

/** One chapter of the code, and the position on the ladder it is to be read at. */
export interface ChapterNamed {
  /** The chapter's number in the code of law, 1 upwards. */
  chapter: number
  /** Where on the seven-position ladder it is read. */
  level: Rung
}

/** A chapter number and its name, which is all this file needs to know about a chapter. */
export interface ChapterName {
  n: number
  label: string
}

/**
 * WHAT A CHAPTER IS READ AT WHEN THE BRIEF NAMES IT AND NAMES NO LEVEL.
 *
 * Section 6: *A chapter the starter named is read at `digest` — the rules with their precedents
 * named — and at `full` when the work touches that rule directly rather than passing near it.*
 */
export const A_NAMED_CHAPTER_IS_READ_AT: Rung = 'digest'

/**
 * WHAT EVERY AGENT HOLDS OF EVERY CHAPTER, NAMED OR NOT: its name and what it governs.
 *
 * Section 6: *Every agent holds positions 1 and 2 for all ten chapters.* Position 2 is `title`, and
 * a rung on this ladder means "this much and everything shorter", so naming the second is naming
 * both. That was written when every chapter was shared. A chapter marked for a role is left out of
 * what every agent holds (`chaptersInTheStandingLoad`), and its role reads it through the card.
 */
export const EVERY_AGENT_HOLDS: Rung = 'title'

/** The three words a role card speaks, and the rung each one names. The only join between them. */
export const WHAT_A_CARD_MEANS: Readonly<Record<string, Rung>> = {
  full: 'full',
  conclusion: 'gist',
  'label-and-title': 'title',
}

/** The rung a card's word names, or null when the card says a word this ladder has no rung for. */
export function theRungACardMeans(word: string): Rung | null {
  return WHAT_A_CARD_MEANS[word] ?? null
}

// ============================================================================ reading a line

/** One chapter that could not be read, with the word that was written and why it was not read. */
export interface ChapterNotRead {
  said: string
  because: string
}

/** What a chapters line turned out to be: what was read, and what was not. */
export interface ChaptersLineRead {
  named: ChapterNamed[]
  problems: ChapterNotRead[]
}

/** Two chapter names match when they match ignoring case, spacing and a leading "the". */
function sameName(a: string, b: string): boolean {
  const plain = (word: string): string =>
    word
      .toLowerCase()
      .replace(/^the\s+/u, '')
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim()
  return plain(a) === plain(b)
}

/**
 * WHY A WORD IS NOT A RUNG, NAMING THE SEVEN THE LADDER DOES HAVE.
 *
 * A refusal that names only the word it would not take leaves the reader guessing what it would.
 * `SEVEN_RUNGS_NAMED` is built from `RUNGS` so this sentence cannot name a ladder the product does
 * not have. Problem `y_HP9aIa0Bd6`: a finished check was thrown away over one such word, and the
 * refusal did not say which words would have been read.
 */
function notARungSaid(word: string): string {
  return `"${word}" is not a position on the reading ladder. The reading ladder has seven positions — ${SEVEN_RUNGS_NAMED}.`
}

/**
 * WHAT ONE LEVEL WORD IS READ AS, WHICHEVER SHAPE CARRIES IT (acceptance finding 66; message bbD9i0YMwvMN:
 * invariant 9, one reading of one fact). Trimmed, a rung names itself, and a role card's word names its rung through
 * `theRungACardMeans`; a blank word names no level, so the chapter is read at the named-chapter default. Anything
 * else is no level, and null says so. Until 24 September 2026 the `{chapter, level}` shape took a rung only, so
 * "5:conclusion" was read as gist while `{chapter: 5, level: "conclusion"}` was refused, and a checker's line was
 * read or refused by its punctuation.
 */
function theRungALevelWordNames(word: string): Rung | null {
  const trimmed = word.trim()
  if (trimmed === '') return A_NAMED_CHAPTER_IS_READ_AT
  if (isRung(trimmed)) return trimmed
  return theRungACardMeans(trimmed)
}

/**
 * READ ONE ENTRY OF A CHAPTERS LINE.
 *
 * An entry is a chapter and an optional level, separated by a colon: `5`, `5:full`,
 * `Tests and gates`, `tests and gates:digest`. An entry already stored as `{chapter, level}` is
 * taken as it is, which is what a second registration of the same agent sends back. Its level word
 * is read as the text shape's is, by `theRungALevelWordNames`.
 */
function readOne(said: unknown, chapters: readonly ChapterName[]): ChapterNamed | ChapterNotRead {
  if (typeof said === 'object' && said !== null && !Array.isArray(said)) {
    const held = said as Record<string, unknown>
    const chapter = held['chapter']
    const word = held['level'] ?? A_NAMED_CHAPTER_IS_READ_AT
    const level = typeof word === 'string' ? theRungALevelWordNames(word) : null
    if (typeof chapter !== 'number' || !Number.isInteger(chapter)) {
      return { said: JSON.stringify(said), because: 'its chapter is not a whole number.' }
    }
    if (level === null) {
      return { said: JSON.stringify(said), because: notARungSaid(String(word)) }
    }
    if (!chapters.some((one) => one.n === chapter)) {
      return { said: String(chapter), because: `the office regulations have no chapter ${String(chapter)}.` }
    }
    return { chapter, level }
  }

  if (typeof said !== 'string' || said.trim() === '') {
    return { said: String(said), because: 'it is not a chapter number or a chapter name.' }
  }

  const at = said.lastIndexOf(':')
  const namePart = (at === -1 ? said : said.slice(0, at)).trim()
  const levelPart = at === -1 ? '' : said.slice(at + 1).trim()

  const level = theRungALevelWordNames(levelPart)
  if (level === null) return { said, because: notARungSaid(levelPart) }

  const asNumber = Number(namePart)
  if (namePart !== '' && Number.isInteger(asNumber)) {
    if (!chapters.some((one) => one.n === asNumber)) {
      return { said, because: `the office regulations have no chapter ${String(asNumber)}.` }
    }
    return { chapter: asNumber, level }
  }

  const byName = chapters.find((one) => sameName(one.label, namePart))
  if (byName === undefined) {
    return { said, because: `no chapter of the office regulations is called that.` }
  }
  return { chapter: byName.n, level }
}

/** True when this is a chapter that was read rather than one that was not. */
function wasRead(one: ChapterNamed | ChapterNotRead): one is ChapterNamed {
  return 'chapter' in one
}

/**
 * READ A WHOLE CHAPTERS LINE.
 *
 * Every entry is read, so a line with one bad word still says what its other words were. A chapter
 * named twice keeps the LONGER reading of the two, because a starter that says both `5` and
 * `5:full` means the work touches chapter 5 directly.
 */
export function readAChaptersLine(said: unknown, chapters: readonly ChapterName[]): ChaptersLineRead {
  const entries = Array.isArray(said) ? said : said === undefined || said === null ? [] : [said]
  const named: ChapterNamed[] = []
  const problems: ChapterNotRead[] = []
  for (const one of entries) {
    const read = readOne(one, chapters)
    if (!wasRead(read)) {
      problems.push(read)
      continue
    }
    const already = named.findIndex((held) => held.chapter === read.chapter)
    if (already === -1) named.push(read)
    else if (longerOf(named[already]!.level, read.level) === read.level) named[already] = read
  }
  named.sort((a, b) => a.chapter - b.chapter)
  return { named, problems }
}

/**
 * A CHECK'S CHAPTERS LINE, WITH EACH ENTRY WHOSE LEVEL THE DOOR CANNOT READ TAKEN AT THE LEVEL THE PROMPT WROTE THAT
 * CHAPTER OUT AT (acceptance finding 65; problem OZfz8TM0M-xF). The inspector tool calls this before it posts a
 * verdict. On 24 September 2026 a check answered "rules" for every chapter it read, and the office recorded that it had
 * read none: a record a reader auditing the release cannot tell from a check that really read nothing.
 *
 * WHETHER A WORD IS A LEVEL IS ASKED OF `readOne`, the door's own reading, and decided nowhere else. The first version
 * decided it by the ladder alone, in the tool, and sent "5:conclusion", which the door reads as gist, as full: a claim
 * the door could read, overwritten by a stronger one (the inspector's refusal of run khJNblavaqqj).
 *
 * An entry is changed only when the door reads its level word as no level, so that it is neither a rung nor a word a
 * role card uses for one, and it names by its number a chapter the prompt wrote out. It is then taken at that
 * chapter's level in the prompt, since that is what the check was given to read, and a sentence says so. No entry the
 * door can read is ever changed. Every other entry is sent as it was said, and the door says what it could not read.
 * That covers a chapter the prompt did not write out and a chapter named by its name. Since acceptance finding 66 the
 * door reads a level word alike in both shapes, so a role card's word in the `{chapter, level}` shape is read, not
 * changed.
 */
export function chaptersAtTheLevelsWrittenOut(
  said: unknown,
  writtenOut: readonly { chapter: number; level: string }[],
): { chaptersRead: unknown; taken: string[] } {
  if (!Array.isArray(said)) return { chaptersRead: said, taken: [] }
  const taken: string[] = []
  const chaptersRead = said.map((entry: unknown) => {
    const parts = theChapterAndTheLevelWordOf(entry)
    if (parts === null) return entry
    const at = writtenOut.find((one) => one.chapter === parts.chapter)?.level
    if (!isRung(at)) return entry
    // THE DOOR'S OWN READING OF THE WORD, the one both shapes share (acceptance finding 66).
    if (wasRead(readOne(`${String(parts.chapter)}:${parts.word}`, [{ n: parts.chapter, label: '' }]))) return entry
    taken.push(
      `chapter ${String(parts.chapter)} was said to be read at "${parts.word}", which is neither a position on the ` +
        `reading ladder nor a word a role card uses for one, so it is taken at ${at}, the level the prompt wrote it out at`,
    )
    return { chapter: parts.chapter, level: at }
  })
  return { chaptersRead, taken }
}

/**
 * The chapter number an entry names and the level word it says, split as `readOne` splits it; null when it names its
 * chapter other than by a whole number, or says no level word.
 */
function theChapterAndTheLevelWordOf(entry: unknown): { chapter: number; word: string } | null {
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    const held = entry as Record<string, unknown>
    const chapter = held['chapter']
    const level = held['level']
    if (typeof chapter !== 'number' || !Number.isInteger(chapter) || typeof level !== 'string') return null
    return { chapter, word: level }
  }
  if (typeof entry !== 'string') return null
  const at = entry.lastIndexOf(':')
  if (at === -1) return null
  const chapterPart = entry.slice(0, at).trim()
  if (!/^\d+$/u.test(chapterPart)) return null
  return { chapter: Number(chapterPart), word: entry.slice(at + 1).trim() }
}

/** Which of two rungs is the longer read. Ties answer with the first. */
export function longerOf(a: Rung, b: Rung): Rung {
  return positionOf(b) > positionOf(a) ? b : a
}

/** Where a rung sits on the ladder, 1 upwards. Declared here from the ladder, never typed out. */
function positionOf(rung: Rung): number {
  return LADDER.indexOf(rung) + 1
}

/**
 * THE LADDER, IN ORDER, held here so this file can compare two rungs without importing the whole
 * detail module into the browser bundle twice.
 * `tests/a-starter-names-the-chapters-and-the-run-records-them.test.ts` fails if it stops matching
 * `RUNGS` in ./detail.ts.
 */
export const LADDER: readonly Rung[] = ['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full']

/**
 * WHERE A CHAPTER HELD AT ITS NAME SITS ON THE LADDER, in the words the check's prompt says it (acceptance finding 72;
 * message _gDlv52vFqAQ). The prompt holds every chapter at its name and what it governs, which are the ladder's
 * first two rungs. Said in words alone, an inspector read chapter 6 there and wrote its level as "name", which is no
 * rung, so that part of its chapters line could not be read. So the prompt names the rungs beside its words, from LADDER.
 */
export function aChapterAtItsNameOnTheLadder(): { rungs: string; readAt: Rung } {
  const [name, governs] = LADDER
  return {
    rungs: `the rungs \`${String(name)}\` and \`${String(governs)}\` of the reading ladder, which runs ${LADDER.join(', ')}`,
    readAt: governs ?? 'title',
  }
}

// ============================================================================ what applies

/** Where the chapters an agent must read came from. */
export type WhereTheChaptersCameFrom = 'the brief' | 'the role card'

/** The chapters line as it stands for one agent: what was named, what applies, and the difference. */
export interface TheChaptersLine {
  /** What the starter named, or null because the starter named nothing. */
  named: ChapterNamed[] | null
  /** What the agent must read: the named list, or the card's own Must read line. */
  mustRead: ChapterNamed[]
  /** Where `mustRead` came from. */
  from: WhereTheChaptersCameFrom
  /** The sentence a screen or a reply says. Null when the starter did name chapters. */
  says: string | null
}

/**
 * THE SENTENCE FOR A BRIEF THAT NAMED NO CHAPTER. Criterion C15.
 *
 * Section 7.1: *A starter that names no chapter has named the default set … Silence is not an
 * exemption.* The emptiness is said out loud rather than left as an absent field, because an empty
 * list and a list nobody wrote look identical once they are both nothing.
 */
export function noChaptersNamed(role: string): string {
  return `no chapters named; the ${role} default applies`
}

/**
 * WHAT ONE AGENT MUST READ.
 *
 * `named` is what its starter wrote. `onItsCard` is the Must read line of the card it holds, which
 * is where the default comes from — the default chapters are not typed anywhere, they are the worker
 * card's own line, so changing that card changes the default with no code change.
 */
export function theChaptersLine(input: {
  named: readonly ChapterNamed[] | null
  onItsCard: readonly ChapterNamed[]
  role: string
}): TheChaptersLine {
  if (input.named !== null && input.named.length > 0) {
    return { named: [...input.named], mustRead: [...input.named], from: 'the brief', says: null }
  }
  return {
    named: input.named === null ? null : [],
    mustRead: [...input.onItsCard],
    from: 'the role card',
    says: noChaptersNamed(input.role),
  }
}

/** One chapters line said in words, for a message or a report. */
export function chaptersLineInWords(line: readonly ChapterNamed[], chapters: readonly ChapterName[]): string {
  if (line.length === 0) return 'none'
  return line
    .map((one) => {
      const name = chapters.find((held) => held.n === one.chapter)?.label ?? `chapter ${String(one.chapter)}`
      return `${String(one.chapter)} ${name} at ${one.level}`
    })
    .join(', ')
}

// ============================================================================ what a report says

/** The field on a report record that says which chapters the run read. Criterion C16. */
export const CHAPTERS_READ = 'chaptersRead'

/**
 * What one report says it read, off `chaptersRead`, or null because it does not say. Here and not in the check's own file
 * so the check and the reminder before the seal read it one way (src/server/lib/inspection.ts, before-the-seal-rules.ts).
 */
export function whatAReportSaysItRead(record: { data: unknown }): number[] | null {
  const data = record.data
  const held = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[CHAPTERS_READ] : undefined
  if (!Array.isArray(held)) return null
  return held.filter((one): one is number => typeof one === 'number' && Number.isInteger(one))
}

/** What a report's chapters-read list says when set against what the brief named. */
export interface ChaptersReadAgainstTheBrief {
  read: number[]
  named: number[]
  /** Named by the brief and not in the report. */
  missed: number[]
  /** In the report and not named by the brief. Not a fault: an agent may read more. */
  extra: number[]
  says: string
}

/**
 * SET A REPORT'S CHAPTERS-READ LIST AGAINST THE CHAPTERS ITS BRIEF NAMED.
 *
 * Reading a chapter nobody named is not a fault and is not reported as one. Not reading one that
 * was named is what somebody has to look at, so it is what the sentence leads with.
 */
export function chaptersReadAgainstTheBrief(
  read: readonly number[],
  named: readonly ChapterNamed[],
): ChaptersReadAgainstTheBrief {
  const wanted = named.map((one) => one.chapter)
  const missed = wanted.filter((n) => !read.includes(n))
  const extra = read.filter((n) => !wanted.includes(n))
  const list = (many: readonly number[]): string => many.map((n) => String(n)).join(', ')
  const says =
    missed.length > 0
      ? `The brief named ${list(wanted)} and this report says it read ${read.length === 0 ? 'none of them' : list(read)}. Not read: ${list(missed)}.`
      : read.length === 0
        ? 'This report says it read no chapter, and its brief named none either.'
        : `Every chapter the brief named was read${extra.length > 0 ? `, and ${list(extra)} as well` : ''}.`
  return { read: [...read], named: wanted, missed, extra, says }
}

/**
 * What a report with no chapters-read list is answered with. Absence, said out loud.
 *
 * Written once, as `g2b.report.noChaptersTitle` in src/shared/words/en.ts, because the record page
 * draws the same sentence through `t()`. It is read once, when this file loads; on the server that
 * reading is English, and the server is what answers with it.
 */
export const NO_CHAPTERS_READ_SAID = readStoredWord('g2b.report.noChaptersTitle')
