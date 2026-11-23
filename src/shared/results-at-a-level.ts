// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH RESULT OF A SEARCH OR OF A LIST OF RECORDS BY KIND, ANSWERED AT A LEVEL, by the person's decision of
 * 20 November 2026.
 *
 * The level is the reading ladder of ./detail.ts: 1 the label, 2 the title, 3 the conclusion (the record's summary),
 * 4 to 6 by part, then full. A level gives everything up to it, so level 3 is the title with the conclusion, and
 * "titles only" is level 2. FULL IS THE RECORD AS STORED, every field, for every kind.
 *
 * FIVE RULES, AND THEY ARE ALL HERE ONCE. `GET /api/search` and `GET /api/records` both call `resultsAtTheirLevels`,
 * and the knowledge search is to call it too.
 *   1. One level option, asked by the request, or else each kind's own default.
 *   2. Each kind's default is a setting (`RESULT_LEVEL_SETTINGS.levelOfEachKind`).
 *   3. A record whose whole content is shorter than the short limit, a setting, is given whole whatever was asked.
 *   4. A level nobody wrote falls back to the next shorter level that exists, and the row says which level is missing
 *      and why. Nothing is cut to fill a level: each level is words somebody stored.
 *   5. The answer has a cap on the characters of the words it gives, a setting. Every result's title is counted
 *      first; then, in the order of the results, each is raised to its level while the total stays within the cap.
 *      From the first one that does not fit, every result is titles only.
 *
 * ONLY THE THREE NUMBERS ARE SETTINGS, and they are read on the server and handed in here, so this file reads no
 * configuration and a page may import its types.
 */
import { levelLabel, positionLabel, positionOf, RUNGS, stepFrom, whyEachLevelIsMissing, type LevelAbsence, type Rung } from './detail.ts'
import { detailSourceOf } from './detailsource.ts'
import { textValuesIn } from './search.ts'
import { RECORD_KINDS, type PanelRecord } from './types.ts'
import { formsWrittenIn, isByPartLevel, readStoredParts, readStoredShortForms, SHORT_FORMS_FIELD, TEXT_DRAWN_AT } from './zoom.ts'

/** The names of the three settings this reads. Declared in src/config/settings.mjs. */
export const RESULT_LEVEL_SETTINGS = {
  levelOfEachKind: 'MOLE_OFFICE_RESULT_LEVEL_OF_EACH_KIND',
  shortUnder: 'MOLE_OFFICE_RESULT_WHOLE_UNDER_CHARACTERS',
  cap: 'MOLE_OFFICE_RESULTS_CAP_CHARACTERS',
} as const

/** The word in the level setting that names every kind it does not name itself. */
export const EVERY_OTHER_KIND = 'others'

/** The word a request and the setting write for one level: `1` to `6`, and `full`. */
export function levelWordOf(rung: Rung): string {
  return rung === 'full' ? 'full' : positionLabel(rung)
}

/** Every level word, shortest first. */
export const RESULT_LEVEL_WORDS: readonly string[] = RUNGS.map(levelWordOf)

/** The level a word names, or null when it names none. */
export function levelNamed(word: string): Rung | null {
  return RUNGS.find((rung) => levelWordOf(rung) === word) ?? null
}

/** The sentence a request is refused with when its level names no level. */
export const NO_SUCH_LEVEL = `level must be one of ${RESULT_LEVEL_WORDS.join(', ')}: 1 the label, 2 the title, 3 the conclusion, 4 to 6 by part, full the whole record`

/** What the three settings say, read and checked. */
export interface LevelSettings {
  /** Each kind's default level, with `others` for every kind the setting does not name. */
  levelOfEachKind: Readonly<Record<string, Rung>>
  /** A record whose whole content is fewer characters than this is given whole. */
  shortUnder: number
  /** The most characters of words one answer gives before its results are titles only. */
  cap: number
}

/**
 * THE LEVEL SETTING READ: `kind=level` pairs joined by commas, such as `decision=full,task=3,others=3`. Every kind is a
 * kind of this office or `others`, every level is a level word, no kind is named twice, and `others` is named, so every
 * kind has a default. Anything else is refused with what was wrong, and no level is guessed.
 */
export function readTheLevelOfEachKind(text: string): { levels: Record<string, Rung> } | { refused: string } {
  const levels: Record<string, Rung> = {}
  for (const pair of text.split(',').map((one) => one.trim()).filter((one) => one !== '')) {
    const [kind, word, ...more] = pair.split('=').map((one) => one.trim())
    if (kind === undefined || word === undefined || more.length > 0) return { refused: `"${pair}" is not kind=level.` }
    if (kind !== EVERY_OTHER_KIND && !(RECORD_KINDS as readonly string[]).includes(kind)) {
      return { refused: `"${kind}" is not a kind of record, nor ${EVERY_OTHER_KIND}.` }
    }
    const rung = levelNamed(word)
    if (rung === null) return { refused: `"${word}" is not a level: ${NO_SUCH_LEVEL}.` }
    if (levels[kind] !== undefined) return { refused: `"${kind}" is named twice.` }
    levels[kind] = rung
  }
  if (levels[EVERY_OTHER_KIND] === undefined) return { refused: `${EVERY_OTHER_KIND}=<level> is missing, so a kind it does not name would have no level.` }
  return { levels }
}

/** WHY ONE RESULT IS AT THE LEVEL IT IS AT. */
export interface TheLevelOfAResult {
  /** The level asked for this result, as a level word. */
  asked: string
  /** Whether the request named the level or the result's kind gave it. */
  askedBy: 'the-request' | 'the-kinds-default'
  /** The level given, as a level word, or null when no level the record has is that short. */
  given: string | null
  /**
   * `asked`       given at the level asked.
   * `short`       the whole record is under the short limit, so it is given whole.
   * `fellBack`    the level asked is missing, so the next shorter one that exists is given. `missing` says which.
   * `pastTheCap`  the answer's cap was reached before this result, so it is titles only.
   */
  because: 'asked' | 'short' | 'fellBack' | 'pastTheCap'
  /** Each level between the one asked and the one given that this record has not got, and why. */
  missing: { level: string; why: LevelAbsence }[]
  /** The same, in words, or null when it was given at the level asked. */
  says: string | null
  /** The characters of the words this result gives. */
  characters: number
}

/** One part of a record written by part, at levels 4 to 6: its heading, and at 5 and 6 its text at that length. */
export interface APartAtLevel {
  id: string
  heading: string
  text?: string
}

/**
 * A RESULT BELOW FULL. It keeps what the narrow row of `GET /api/records` keeps, so a reader that reads only names
 * loses nothing at level 2 or above: the id, the kind, the project, the two times, the provenance mark and the state
 * word. Then the words of each level up to the one given.
 */
export type ARecordInWords<R extends PanelRecord> = Pick<R, 'id' | 'kind' | 'workspaceId' | 'createdAt' | 'updatedAt'> & {
  origin?: R['origin']
  data: { state?: unknown }
  label?: string
  title?: string
  summary?: string | null
  parts?: APartAtLevel[]
  atLevel: TheLevelOfAResult
}

/** A result at its level: the whole record at full, or its words below it. */
export type ARowAtLevel<R extends PanelRecord> = (R & { atLevel: TheLevelOfAResult }) | ARecordInWords<R>

/** WHAT THE ANSWER SAYS ABOUT THE LEVELS OF ALL ITS RESULTS. */
export interface TheLevelsOfAnAnswer {
  /** The level the request named, or null when each result is at its kind's default. */
  asked: string | null
  shortUnder: number
  cap: number
  /** The characters of the words the answer gives, counted over its results. */
  characters: number
  /** How many results are titles only because the cap was reached. */
  pastTheCap: number
  says: string
  /** How to read one record further at a level a reader names. */
  readOne: string
}

/** How one result is read further. */
export const READ_ONE_AT_A_LEVEL = `GET /api/records?ids=<id>&level=<${RESULT_LEVEL_WORDS.join(' | ')}> reads one record at the level it names.`

/**
 * THE TWO STAMPS THE COUNT LEAVES OUT: a run's data.filedTime and a message's data.writtenTime. The office began to
 * write them on 22 November 2026, after the rule of 20 November that a record whose full content is short is given
 * whole. Leaving them out gives back the count that rule was made on. Every other stamp is still counted.
 */
const STAMPS_WRITTEN_AFTER_THE_RULE: readonly string[] = ['data.filedTime', 'data.writtenTime']

/** Whether a text value found at `where` is inside one of those two stamps. */
function isInAStampWrittenAfterTheRule(where: string): boolean {
  return STAMPS_WRITTEN_AFTER_THE_RULE.some((stamp) => where === stamp || where.startsWith(`${stamp}.`))
}

/**
 * The characters of a record's whole content: its title, its summary, and every text value inside its data except
 * the two stamps above.
 */
export function charactersOfTheWhole(record: PanelRecord): number {
  const counted = textValuesIn(record.data).filter((one) => !isInAStampWrittenAfterTheRule(one.where))
  return record.title.length + (record.summary ?? '').length + counted.reduce((sum, one) => sum + one.text.length, 0)
}

const WHY_IN_WORDS: Readonly<Record<LevelAbsence, (kind: string) => string>> = {
  notWritten: () => 'is not written for this record',
  noPlace: (kind) => `has no place on a ${kind}`,
  tooShort: () => 'is not kept for this record, which is shorter than that level',
}

/**
 * THE LEVELS THIS RECORD HAS NOT GOT, and why, from the ladder's own answer (`whyEachLevelIsMissing`). The title and
 * the whole record are always there: the title column is never empty, and full is the record itself.
 */
function theMissingLevels(record: PanelRecord): Readonly<Partial<Record<Rung, LevelAbsence>>> {
  const source = detailSourceOf(record)
  return whyEachLevelIsMissing(source, new Set(formsWrittenIn(source).map((one) => one.rung)))
}

function isThere(missing: Readonly<Partial<Record<Rung, LevelAbsence>>>, rung: Rung): boolean {
  return rung === 'full' || rung === 'title' || missing[rung] === undefined
}

/** From the level asked down to the first level the record has, with each level passed on the way. */
function walkDown(record: PanelRecord, asked: Rung): { given: Rung | null; passed: { rung: Rung; why: LevelAbsence }[] } {
  const absent = theMissingLevels(record)
  const passed: { rung: Rung; why: LevelAbsence }[] = []
  for (let rung: Rung | null = asked; rung !== null; rung = stepFrom(rung, -1)) {
    if (isThere(absent, rung)) return { given: rung, passed }
    const why = absent[rung]
    if (why === undefined) throw new Error(`The level ${levelWordOf(rung)} of record ${record.id} is missing and the ladder gave no reason, so no level was given.`)
    passed.push({ rung, why })
  }
  return { given: null, passed }
}

function asMissing(passed: readonly { rung: Rung; why: LevelAbsence }[]): TheLevelOfAResult['missing'] {
  return passed.map((one) => ({ level: levelWordOf(one.rung), why: one.why }))
}

/** The record's words up to the level given, with what names it. Nothing is shortened: every word is as stored. */
function inWords<R extends PanelRecord>(record: R, given: Rung | null, said: Omit<TheLevelOfAResult, 'given' | 'characters'>): ARecordInWords<R> {
  const reached = given === null ? 0 : positionOf(given)
  const state = record.data['state']
  const row: ARecordInWords<R> = {
    id: record.id,
    kind: record.kind,
    workspaceId: record.workspaceId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...('origin' in record ? { origin: record.origin } : {}),
    data: state === undefined ? {} : { state },
    atLevel: { ...said, given: given === null ? null : levelWordOf(given), characters: 0 },
  }
  let characters = 0
  const label = readStoredShortForms(record.data[SHORT_FORMS_FIELD]).label?.text
  if (reached >= positionOf('label') && label !== undefined) {
    row.label = label
    characters += label.length
  }
  if (reached >= positionOf('title')) {
    row.title = record.title
    characters += record.title.length
  }
  if (reached >= positionOf('gist')) {
    row.summary = record.summary
    characters += (record.summary ?? '').length
  }
  if (given !== null && isByPartLevel(given)) {
    const parts = readStoredParts(record.data[SHORT_FORMS_FIELD])
    if (parts === null) throw new Error(`Record ${record.id} was given at ${levelWordOf(given)} and holds no parts, so no level was given.`)
    const text = TEXT_DRAWN_AT[given]
    row.parts = parts.parts.map((part) => ({ id: part.id, heading: part.heading, ...(text === null ? {} : { text: part[text] }) }))
    characters += row.parts.reduce((sum, part) => sum + part.heading.length + (part.text ?? '').length, 0)
  }
  row.atLevel.characters = characters
  return row
}

function whole<R extends PanelRecord>(record: R, said: Omit<TheLevelOfAResult, 'given' | 'characters'>): ARowAtLevel<R> {
  return { ...record, atLevel: { ...said, given: 'full', characters: charactersOfTheWhole(record) } }
}

/** One result at the level asked, before the cap: whole when asked whole or short, or else walked down. */
function atItsLevel<R extends PanelRecord>(record: R, asked: Rung, askedBy: TheLevelOfAResult['askedBy'], shortUnder: number): ARowAtLevel<R> {
  const base = { asked: levelWordOf(asked), askedBy, missing: [] }
  if (asked === 'full') return whole(record, { ...base, because: 'asked', says: null })
  const characters = charactersOfTheWhole(record)
  if (characters < shortUnder) {
    return whole(record, {
      ...base,
      because: 'short',
      says: `The whole record is ${String(characters)} characters, under the ${String(shortUnder)} below which a record is given whole, so it is given whole and not at ${levelLabel(asked)}.`,
    })
  }
  const { given, passed } = walkDown(record, asked)
  if (passed.length === 0) return inWords(record, given, { ...base, because: 'asked', says: null })
  const why = passed.map((one) => `${levelLabel(one.rung)} ${WHY_IN_WORDS[one.why](record.kind)}`).join('; ')
  const to = given === null ? 'no level: no shorter level exists, and only what names the record is given' : `${levelLabel(given)}, the next shorter level that exists`
  return inWords(record, given, { ...base, missing: asMissing(passed), because: 'fellBack', says: `${why}, so it is given at ${to}. Nothing was cut to fill it.` })
}

/** One result as titles only, because the answer's cap was reached before it. */
function titlesOnly<R extends PanelRecord>(record: R, asked: Rung, askedBy: TheLevelOfAResult['askedBy'], cap: number): ARecordInWords<R> {
  const { given, passed } = walkDown(record, positionOf(asked) < positionOf('title') ? asked : 'title')
  return inWords(record, given, {
    asked: levelWordOf(asked),
    askedBy,
    missing: asMissing(passed),
    because: 'pastTheCap',
    says: `The answer reached its cap of ${String(cap)} characters before this result, so it is titles only. GET /api/records?ids=${record.id}&level=${levelWordOf(asked)} reads it at ${levelLabel(asked)}.`,
  })
}

/** How many results are read whole at a time while the cap is being filled. */
const READ_WHOLE_AT_A_TIME = 50

/**
 * THE RESULTS OF ONE ANSWER, EACH AT ITS LEVEL, AND WHAT THE ANSWER SAYS ABOUT THEM.
 *
 * `records` are in the order the answer gives them, and every one is answered: the cap lowers results to titles only
 * and never leaves one out. They need hold no more than the title, the summary, the state word and the stored short
 * forms; `readWhole` gives the whole records for some of them, in their order, and is asked only for the results
 * before the cap is reached. A caller whose records are already whole leaves it out.
 */
export function resultsAtTheirLevels<R extends PanelRecord>(
  records: readonly R[],
  level: Rung | null,
  settings: LevelSettings,
  readWhole: (some: readonly R[]) => readonly R[] = (some) => some,
): { rows: ARowAtLevel<R>[]; levels: TheLevelsOfAnAnswer } {
  const askedOf = (record: R): Rung => level ?? settings.levelOfEachKind[record.kind] ?? settings.levelOfEachKind[EVERY_OTHER_KIND]!
  const askedBy: TheLevelOfAResult['askedBy'] = level === null ? 'the-kinds-default' : 'the-request'
  // EVERY TITLE IS COUNTED FIRST, so the results past the cap still fit beside the ones before it.
  const titles = records.map((record) => titlesOnly(record, askedOf(record), askedBy, settings.cap))
  let room = settings.cap - titles.reduce((sum, row) => sum + row.atLevel.characters, 0)
  const rows: ARowAtLevel<R>[] = []
  // WHEN THE TITLES ALONE PASS THE CAP, no result is raised above them, so none is read whole.
  let past: number | null = room < 0 ? 0 : null
  for (let from = 0; from < records.length && past === null; from += READ_WHOLE_AT_A_TIME) {
    const some = records.slice(from, from + READ_WHOLE_AT_A_TIME)
    const read = readWhole(some)
    if (read.length !== some.length) throw new Error(`${String(some.length)} records were to be read whole and ${String(read.length)} came back, so no level was given.`)
    for (const [i, record] of read.entries()) {
      const one = atItsLevel(record, askedOf(record), askedBy, settings.shortUnder)
      const more = one.atLevel.characters - titles[from + i]!.atLevel.characters
      if (more > room) {
        past = from + i
        break
      }
      room -= more
      rows.push(one)
    }
  }
  if (past !== null) rows.push(...titles.slice(past))
  const characters = rows.reduce((sum, row) => sum + row.atLevel.characters, 0)
  const pastTheCap = past === null ? 0 : records.length - past
  const fellBack = rows.filter((row) => row.atLevel.because === 'fellBack').length
  const how =
    level === null
      ? `No level was asked, so each result is at its kind's default level, from the setting ${RESULT_LEVEL_SETTINGS.levelOfEachKind}.`
      : `Each result was asked at ${levelLabel(level)}.`
  const capped =
    past === null
      ? ` The results give ${String(characters)} characters of words, within the cap of ${String(settings.cap)}.`
      : past === 0 && room < 0
        ? ` The titles alone pass the cap of ${String(settings.cap)} characters, so every result is titles only.`
        : ` The cap of ${String(settings.cap)} characters was reached at result ${String(past + 1)}, so ${String(pastTheCap)} of the ${String(records.length)} results are titles only.`
  const fell = fellBack === 0 ? '' : ` ${String(fellBack)} result${fellBack === 1 ? '' : 's'} fell back to a shorter level; each one's atLevel.says which level is missing.`
  return {
    rows,
    levels: {
      asked: level === null ? null : levelWordOf(level),
      shortUnder: settings.shortUnder,
      cap: settings.cap,
      characters,
      pastTheCap,
      says: `${how} A record whose whole content is under ${String(settings.shortUnder)} characters is given whole.${capped}${fell}`,
      readOne: READ_ONE_AT_A_LEVEL,
    },
  }
}
