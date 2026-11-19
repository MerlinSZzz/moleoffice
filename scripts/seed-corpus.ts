// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEMO CORPUS, READ FROM A FILE. The seed is the program; this is the words.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE WORDS ARE IN A FILE
 * ---------------------------------------------------------------------------------------
 *
 * The corpus is the words of the demo: the records, the pipelines and the history the seed writes.
 * They are kept in a JSON file and not in the program. `scripts/seed.ts` once held them as 4,700
 * lines of TypeScript literals, and those literals described one real research project, with its
 * people's names, inside a public product's source (problem `hX5IX2dz8e58`).
 *
 * The file that ships is `scripts/seed-corpus/public.json`. It describes an invented project: a small
 * town library digitising the microfilm of its old weekly newspaper. An installer may point the
 * setting `MOLE_OFFICE_SEED_CORPUS` at their own corpus file of the same shape, and the seed then
 * writes that corpus instead.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN THE FILE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * IN THE FILE: every record's key, kind, title, summary, `data`, who filed it and when; every
 * pipeline's steps; which records are incomplete on purpose; the back-dated history rows.
 *
 * IN THE PROGRAM: the links between records, the gates on them, the order things are written in,
 * and every check the seed runs afterwards. Those are the SHAPE of the demo — what a reviewer is
 * being shown — and they are the same whatever the corpus says. A corpus file that changed them
 * would be a second seed program in a JSON coat.
 *
 * ---------------------------------------------------------------------------------------
 * A FILE THAT IS NOT THERE STOPS THE SEED
 * ---------------------------------------------------------------------------------------
 *
 * It never falls back to the public corpus. Somebody who set the variable meant to seed their own
 * demo, and quietly writing a different one into their database is the second rule broken: they
 * would then be looking at a corpus about somebody else with nothing on screen to say so.
 */

import { readFileSync } from 'node:fs'

import { settings } from '../src/config/settings.mjs'
import { localStamp } from '@shared/time.ts'
import type { RecordKind } from '@shared/types.ts'
import type { GateKind } from '@shared/work.ts'
import type { ItemState } from '@shared/types.ts'

/** Who wrote a record, in the shape `createRecord` takes. */
export interface CorpusActor {
  type: 'human' | 'agent' | 'system'
  id: string
}

/** When something was filed, as days before today plus a wall-clock time. */
export type At = readonly [days: number, hour: number, minute: number]

/** One record of the corpus, exactly as `file()` in the seed takes it. */
export interface CorpusRecord {
  /** A short key, unique in the corpus, used by the seed's link section to name records. */
  key: string
  kind: RecordKind
  title: string
  /** The one line shown wherever the record is referenced. Null where a record genuinely has none. */
  summary: string | null
  data: Record<string, unknown>
  actor: CorpusActor
  /** Absent means it was filed by THIS RUN, which is the honest stamp for a session still printing. */
  filed?: At
  /** Set on the records the seed retracts on purpose, and nowhere else. */
  retracted?: true
}

/** One step of a pipeline, before it becomes a block record. */
export interface CorpusStep {
  /** A short id, unique within this pipeline, used by the seed to write `needs` and gates. */
  id: string
  name: string
  state: ItemState
  /** The TITLES of the modules that carry it. Resolved to `implements` links by the seed. */
  modules: string[]
  measured?: string
  /** What it waits on, by the short id above. Becomes a `blocks` link carrying the gate. */
  needs?: { stepId: string; gate: GateKind; upTo?: string }[]
}

/** A pipeline's steps and when they were filed. */
export interface CorpusPipelineSteps {
  when: At
  steps: CorpusStep[]
}

/** One back-dated checklist-item move: an item that is `doing` now, and when it started being that. */
export interface CorpusItemTransition {
  /** A fixed id, so a second run recognises this row instead of writing another one. */
  id: string
  /** The TITLE of the module whose checklist moved. */
  module: string
  /** The checklist item's own id, inside that module's parts. */
  item: string
  /** The state it was in before. The change row carries both sides, as a real edit would. */
  from: ItemState
  when: At
  actor: CorpusActor
}

/** One back-dated state-word move: when a record entered the state it is in now. */
export interface CorpusStateTransition {
  id: string
  /** The record's corpus key. */
  key: string
  from: string
  when: At
  actor: CorpusActor
}

/** The whole corpus. */
export interface Corpus {
  /**
   * The day every stamp in the file was written as of, "YYYY-MM-DD".
   *
   * A stamp in the file is literal, and a literal due date leaves the 48-hour window the day after it
   * was written. So the loader moves every stamp by whole days, from this day to the day the seed
   * runs. "Due tomorrow at 17:00" stays due tomorrow at 17:00, whichever day the seed is run.
   */
  today: string
  /** Every hand-written record, in the order the seed files them. */
  records: CorpusRecord[]
  /** A pipeline's steps, by the pipeline's corpus key. */
  blocks: Record<string, CorpusPipelineSteps>
  /** Which records are incomplete on purpose, by title, with the exact paths each is missing. */
  incompleteOnPurpose: Record<string, string[]>
  itemTransitions: CorpusItemTransition[]
  stateTransitions: CorpusStateTransition[]
}

/** The path this run reads its corpus from. Absolute, and printed by the seed on every run. */
export function corpusPath(): string {
  return settings().seedCorpus
}

/**
 * Read the corpus, or refuse and say which file and which setting.
 *
 * Every refusal names the path, because the commonest mistake with a setting that points at a file
 * is a path that is right in one directory and wrong in another.
 */
function readCorpus(): Corpus {
  const path = corpusPath()
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new Error(
      `The seed corpus at ${path} could not be read: ${err instanceof Error ? err.message : String(err)}. ` +
        'MOLE_OFFICE_SEED_CORPUS names it; unset that to use the public corpus in this repository. Nothing ' +
        'was written.',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(
      `The seed corpus at ${path} is not readable JSON: ${err instanceof Error ? err.message : String(err)}. ` +
        'Nothing was written.',
    )
  }
  return movedToToday(checkShape(parsed, path))
}

/**
 * Check the six parts are there and are the right kind of thing, and say which one is not.
 *
 * This is not a schema for everything inside a record: `data` is checked by the same
 * `validateData` an HTTP write goes through, later, when the seed files it. What is checked here is
 * only what would otherwise fail as an unreadable crash inside a loop — a missing key, a records
 * list that is an object, a step list that is a string.
 */
function checkShape(parsed: unknown, path: string): Corpus {
  const bad = (what: string): never => {
    throw new Error(`The seed corpus at ${path} ${what}. Nothing was written.`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return bad('is not an object')
  }
  const c = parsed as Record<string, unknown>
  if (!Array.isArray(c.records)) return bad('has no `records` list')
  if (c.records.length === 0) return bad('has an empty `records` list, so it would seed nothing')
  for (const [i, r] of c.records.entries()) {
    if (typeof r !== 'object' || r === null) return bad(`has a record at position ${String(i)} that is not an object`)
    const rec = r as Record<string, unknown>
    for (const field of ['key', 'kind', 'title'] as const) {
      if (typeof rec[field] !== 'string' || rec[field] === '') {
        return bad(`has a record at position ${String(i)} with no \`${field}\``)
      }
    }
    if (typeof rec.data !== 'object' || rec.data === null) {
      return bad(`has a record "${String(rec.key)}" with no \`data\` object`)
    }
  }
  if (typeof c.blocks !== 'object' || c.blocks === null || Array.isArray(c.blocks)) {
    return bad('has no `blocks` object, which is a pipeline key to its steps')
  }
  for (const [key, value] of Object.entries(c.blocks as Record<string, unknown>)) {
    const v = value as Record<string, unknown> | null
    if (typeof v !== 'object' || v === null || !Array.isArray(v.steps)) {
      return bad(`has no steps for the pipeline "${key}"`)
    }
  }
  if (typeof c.incompleteOnPurpose !== 'object' || c.incompleteOnPurpose === null) {
    return bad('has no `incompleteOnPurpose` object')
  }
  if (typeof c.today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.today)) {
    return bad(
      'has no `today` line ("YYYY-MM-DD"): the day its stamps were written as of. Every stamp in the ' +
        'corpus is moved by whole days from that day to the day the seed runs, so the 48-hour window and ' +
        'the three-day rule keep firing',
    )
  }
  if (!Array.isArray(c.itemTransitions)) return bad('has no `itemTransitions` list')
  if (!Array.isArray(c.stateTransitions)) return bad('has no `stateTransitions` list')
  return parsed as Corpus
}

/** Midnight this morning, local. Timestamps in this project are local; see shared/time.ts. */
export const TODAY: Date = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})()

const DAY_MS = 24 * 60 * 60 * 1000

/** A whole stamp, "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS", and nothing else in the string. */
const A_WHOLE_STAMP = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/

/** How many whole days the corpus's `today` is behind (positive) or ahead of the day the seed runs. */
function daysFrom(corpusToday: string): number {
  const m = A_WHOLE_STAMP.exec(corpusToday)
  if (m === null) throw new Error(`The corpus's today "${corpusToday}" is not a day.`)
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Rounded, because a clock change makes one day of the year 23 or 25 hours long.
  return Math.round((TODAY.getTime() - day.getTime()) / DAY_MS)
}

/** The same stamp `days` later, keeping its wall-clock time and whether it carried one. */
function movedStamp(stamp: string, days: number): string {
  const m = A_WHOLE_STAMP.exec(stamp)
  if (m === null) return stamp
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0))
  d.setDate(d.getDate() + days)
  const whole = localStamp(d)
  return m[4] === undefined ? whole.slice(0, 10) : whole
}

/** Every string that is a whole stamp, anywhere in the value, moved by `days`. Everything else as it was. */
function moved(value: unknown, days: number): unknown {
  if (typeof value === 'string') return movedStamp(value, days)
  if (Array.isArray(value)) return value.map((v) => moved(v, days))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, moved(v, days)]))
  }
  return value
}

/** The whole corpus with every stamp moved from the day it was written as of to today. */
function movedToToday(corpus: Corpus): Corpus {
  const days = daysFrom(corpus.today)
  if (days === 0) return corpus
  return { ...(moved(corpus, days) as Corpus), today: corpus.today }
}

/** The corpus this run seeds. Read once, when this module is first imported, with its stamps moved to today. */
export const CORPUS: Corpus = readCorpus()

/**
 * HOW A CORPUS NAMES THE OFFICE'S OWNER: with this one word, wherever a person id goes. Problem
 * Nht4tEXhgM8B. The public corpus named a built-in person, and since the owner came from the installer a fresh
 * database holds no such person, so the seed stopped at its first write. The owner is not known when
 * this file is read: it is the person the migrate of the database being seeded marked. So the seed
 * reads it and hands it to `writeTheOwnerIntoTheCorpus`, once, before its first write.
 *
 * NOT A USABLE ID, ON PURPOSE: it has spaces and brackets, so a place the seed did not write the owner
 * into is refused at the write that reaches it rather than filed under a plausible person. A corpus
 * that names a person by their own id is written as it says.
 */
export const THE_OWNER_IN_A_CORPUS = "<the office's owner>"

/**
 * Write `ownerId` wherever the corpus says THE_OWNER_IN_A_CORPUS, in place, and say how many places.
 * A string equal to the word is the whole of what is replaced; no other text is touched.
 */
export function writeTheOwnerIntoTheCorpus(ownerId: string): number {
  let written = 0
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const [i, item] of value.entries()) {
        if (item === THE_OWNER_IN_A_CORPUS) {
          value[i] = ownerId
          written += 1
        } else visit(item)
      }
    } else if (typeof value === 'object' && value !== null) {
      const object = value as Record<string, unknown>
      for (const [key, item] of Object.entries(object)) {
        if (item === THE_OWNER_IN_A_CORPUS) {
          object[key] = ownerId
          written += 1
        } else visit(item)
      }
    }
  }
  visit(CORPUS)
  return written
}

/** How many whole days the corpus's stamps were moved to land on today. Printed by the seed. */
export const CORPUS_DAYS_MOVED: number = daysFrom(CORPUS.today)

/** Every record of one kind, in corpus order. The seed files them family by family. */
export function ofKind(kind: RecordKind): CorpusRecord[] {
  return CORPUS.records.filter((r) => r.kind === kind)
}

/** One record by its corpus key, or a refusal naming the key. */
export function corpusRecord(key: string): CorpusRecord {
  const found = CORPUS.records.find((r) => r.key === key)
  if (found === undefined) {
    throw new Error(`The corpus at ${corpusPath()} has no record with the key "${key}".`)
  }
  return found
}

/** One pipeline's steps by its corpus key, or a refusal naming the key. */
export function corpusSteps(key: string): CorpusPipelineSteps {
  const found = CORPUS.blocks[key]
  if (found === undefined) {
    throw new Error(`The corpus at ${corpusPath()} has no steps for the pipeline "${key}".`)
  }
  return found
}

/**
 * The curated summary blocks a module carries, by the module's corpus key.
 *
 * Two modules in the public corpus carry one. They are read back out of the record rather than
 * stored a second time beside it, so there is one copy of them and nothing to keep in step.
 */
export function corpusSummary(key: string): unknown[] {
  const blocks = corpusRecord(key).data.summaryBlocks
  if (!Array.isArray(blocks)) {
    throw new Error(`The corpus record "${key}" carries no \`summaryBlocks\` array.`)
  }
  return blocks
}

/**
 * The two curated summaries the tests read.
 *
 * They are exported by name because `tests/summary-schema.test.ts` runs every block the seed writes
 * through the server's own zod schemas, and it needs something to name. Each is named after the
 * module that carries it.
 */
export const SCANNER_SUMMARY: unknown[] = corpusSummary('mod-scanner')
export const OCR_SUMMARY: unknown[] = corpusSummary('mod-ocr')
