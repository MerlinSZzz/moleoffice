// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * One default roll per new agent, from the owner's probabilities on Casting rows (two decisions of
 * the owner). The caller supplies the scope already chosen by theRowTheToolsTake. This file
 * reads no store and starts no worker; the worker door keeps the returned record on its run.
 */
import { z } from 'zod'
import { THE_INSPECTOR } from './roles.ts'
import { momentOfAnInstant, momentOfStampInZone, stampInZone } from './time.ts'

export const CASTING_ROLL = 'castingRoll'
export const ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL =
  "Only the office writes a run's Casting roll. Nothing was written."

export interface CastingRollRow {
  id: number
  program: string | null
  model: string | null
  effort: string | null
  probability: number | null
  marked: boolean
  /** The names of the labels the row carries. */
  labels: readonly string[]
  /** The row's Out until, as stored, while it is still to come; null when it is empty or has passed. The caller reads the clock. */
  outUntil: string | null
}

const word = z.string().min(1)
const probability = z.number().min(0).max(1)
const rowFields = { rowId: z.number().int().positive(), program: word.nullable(), model: word.nullable(), effort: word.nullable(), probability: probability.nullable() }
const candidate = z.strictObject({ ...rowFields, program: word, model: word, probability, share: probability })
const selected = z.strictObject({ ...rowFields, rowId: rowFields.rowId.nullable(), share: probability.nullable(), number: z.number().min(0).lt(1).nullable() })
const unreadableStop = z.strictObject({ run: word, runtime: word, model: word, kind: z.enum(['session-limit', 'quota']), at: word, resetsAt: word.nullable(), says: word })
const recordShape = z.strictObject({
  choice: z.enum(['named', 'kept', 'rolled', 'marked', 'none']),
  // THE LABEL THE ROLL WAS FOR, by its name then, or 'every row'. A record kept before migration 0349 says hard or
  // simple, which are names too.
  group: word,
  selected: selected.nullable(), candidates: z.array(candidate),
  skipped: z.array(z.strictObject({ ...rowFields, reasons: z.array(word).min(1) })),
  keptFrom: word.nullable(), unreadableStops: z.array(unreadableStop), week: word,
  notes: z.array(word), says: word,
}).superRefine((record, context) => {
  const fail = (message: string): void => { context.addIssue({ code: 'custom', message }) }
  const chosen = record.selected
  const actual = record.choice === 'rolled' || record.choice === 'kept'
  if ((record.choice === 'none') !== (chosen === null)) fail('Only no choice has no selected row.')
  if ((record.choice === 'kept') !== (record.keptFrom !== null)) fail('Only a kept roll names its earlier run.')
  if (chosen !== null) {
    if (actual && (chosen.rowId === null || chosen.program === null || chosen.model === null || chosen.probability === null || chosen.probability <= 0 || chosen.share === null || chosen.share <= 0 || chosen.number === null)) fail('An actual roll keeps its row, probability, share and number.')
    if (!actual && (chosen.number !== null || chosen.share !== null)) fail('A named or marked choice has no roll.')
    if (record.choice === 'named' && (chosen.rowId !== null || chosen.probability !== null || chosen.program === null || chosen.model === null)) fail('A named model is not a Casting row.')
    if (record.choice === 'marked' && chosen.rowId === null) fail('A marked choice names its row.')
    if (actual && !record.candidates.some(row => row.rowId === chosen.rowId && row.program === chosen.program && row.model === chosen.model && row.effort === chosen.effort && row.probability === chosen.probability && row.share === chosen.share)) fail('The selected row must be one of the recorded candidates.')
  }
  if (actual && Math.abs(record.candidates.reduce((sum, row) => sum + row.share, 0) - 1) > 1e-10) fail('An actual roll has shares adding to one.')
})
export type CastingRollRecord = z.infer<typeof recordShape>
export interface EarlierCastingRoll { run: string; record: CastingRollRecord }
export interface CastingLimits {
  /**
   * A null model covers every model on that runtime, used only for Claude's shared login. An OpenCode Go model's limit
   * covers every OpenCode Go model, because they share one allowance (castingLimitName).
   */
  limited: { runtime: string; model: string | null; run: string | null; kind: 'session-limit' | 'quota' | 'week'; at: string; until: number; zone: string; says: string }[]
  unreadableStops: z.infer<typeof unreadableStop>[]
  /** What the reading of the sandboxes' login said to the router. A missing reading is said as missing, never as one under its limit. */
  week: string
}
export interface CastingRollInput {
  role: string
  /** The project the roll is for, which a refusal names. */
  project: string
  rows: readonly CastingRollRow[]
  /** The name of the label the work is marked with, or null for work marked with none. */
  difficulty: string | null
  named: { runtime: string; model: string; effort: string | null } | null
  earlier: EarlierCastingRoll | null
  builderModel: string | null
  limits: CastingLimits
  random: () => number
}
export interface CastingRollAnswer {
  runtime: string | null
  model: string | null
  effort: string | null
  rowId: number | null
  says: string
  record: CastingRollRecord
}

/** Why a stored value is not a Casting roll, in the reader's own words, or null because it is one. */
export function whyItIsNotACastingRoll(stored: unknown): string | null {
  const read = recordShape.safeParse(stored)
  return read.success ? null : read.error.message
}

/** Absence means no choice was recorded; a present but unreadable field is a broken store. */
export function readCastingRoll(stored: unknown): CastingRollRecord | null {
  if (stored === undefined) return null
  const read = recordShape.safeParse(stored)
  if (!read.success) throw new Error(`The Casting roll cannot be read: ${read.error.message}`)
  return read.data
}

/** Luna's provider prefixes name the same model, including in stop evidence and inspector comparisons. */
export function castingModelName(model: string): string {
  return model === 'openai/gpt-6-luna' || model === 'opencode-go/gpt-6-luna' ? 'gpt-6-luna' : model
}
/**
 * WHICH LIMIT A MODEL SHARES (round 47). Every OpenCode Go model is paid from one Go allowance, so a Go limit stopped on
 * one of them limits all of them. Any other model is limited by its own name.
 */
export function castingLimitName(program: string, model: string): string {
  return program === 'opencode' && model.startsWith('opencode-go/') ? 'opencode-go' : castingModelName(model)
}
/** Why a row outside the label asked for is skipped. */
export function outsideTheWorkLabelled(label: string): string {
  return `it does not carry the label ${label}`
}

/** Why a row whose Out until is still to come is skipped. */
export function outUntil(instant: string): string {
  return `it is out until ${instant}`
}

/** What the roll answers when no row in force carries the label the work is marked with. */
export function noRowCarriesTheLabel(role: string, project: string, label: string): string {
  return `No Casting row of the ${role} role in force for project ${project} carries the label ${label}, so nothing was drawn. ` +
    'Give the label to a row on the Casting page, or mark the work with a label a row carries.'
}

function isTheLunaFallback(row: CastingRollRow): boolean {
  return row.program === 'opencode' && row.model === 'opencode-go/gpt-6-luna'
}
function theRowFields(row: CastingRollRow): z.infer<typeof selected> {
  return { rowId: row.id, program: row.program, model: row.model, effort: row.effort, probability: row.probability, share: null, number: null }
}
/** What the office's limits say of a program and a model now, one sentence a limit; none when no limit stops it. */
export function theLimitsOn(program: string | null, model: string | null, limits: CastingLimits): string[] {
  return limits.limited.filter(one => one.runtime === program && (one.model === null || (model !== null && castingLimitName(one.runtime, one.model) === castingLimitName(one.runtime, model)))).map(one => one.says)
}

/** Whether a record's selected row is the Luna fallback the marked row bridges to Codex. */
function isTheMarkedLunaFallback(record: CastingRollRecord): boolean {
  return record.choice === 'marked' && record.selected?.program === 'opencode' && record.selected.model === 'opencode-go/gpt-6-luna'
}

/**
 * THE PROGRAM AND THE MODEL A RECORD STARTS, read from the record alone, so a start reads what its ask stored (round 46)
 * by the rule the roll itself answered with. Both are null when the selected row leaves either empty.
 */
export function theStartOfARoll(record: CastingRollRecord): Omit<CastingRollAnswer, 'says' | 'record'> {
  const chosen = record.selected
  let runtime = chosen?.program ?? null
  let model = chosen?.model ?? null
  // A named model is used as named. Default Luna starts on Codex; the launcher owns its fallback.
  if (record.choice !== 'named' && runtime === 'codex' && model !== null) model = castingModelName(model)
  if (isTheMarkedLunaFallback(record)) {
    runtime = 'codex'
    model = 'gpt-6-luna'
  }
  if (runtime === null || model === null) return { runtime: null, model: null, effort: null, rowId: chosen?.rowId ?? null }
  return { runtime, model, effort: chosen?.effort ?? null, rowId: chosen?.rowId ?? null }
}

/** The rules are ordered: a named model, an actual earlier roll, the marked-row bridge, then one draw. */
export function theCastingRoll(input: CastingRollInput): CastingRollAnswer {
  const { rows, difficulty, limits } = input
  const record: CastingRollRecord = { choice: 'none', group: difficulty ?? 'every row', selected: null, candidates: [], skipped: [], keptFrom: null, unreadableStops: limits.unreadableStops, week: limits.week, notes: [], says: '' }
  const answer = (says: string): CastingRollAnswer => {
    const start = theStartOfARoll(record)
    if (isTheMarkedLunaFallback(record)) record.notes.push('Luna starts on Codex; the launcher owns its OpenCode Go fallback (a decision of the owner).')
    if (record.selected !== null && start.runtime === null) says = `${says.replace(/\.$/, '')}; its program or model cell is empty.`
    record.says = says
    return { ...start, says, record }
  }
  if (input.named !== null) {
    record.choice = 'named'
    record.selected = { rowId: null, program: input.named.runtime, model: input.named.model, effort: input.named.effort, probability: null, share: null, number: null }
    return answer(`The caller named ${input.named.runtime} ${input.named.model}, so no Casting roll was made.`)
  }
  if (input.earlier?.record.choice === 'rolled') {
    const prior = readCastingRoll(input.earlier.record)!
    const priorRow = rows.find(row => row.id === prior.selected!.rowId)
    if (priorRow?.outUntil != null) return answer(`The previous roll selected row ${String(priorRow.id)}, but ${outUntil(priorRow.outUntil)}.`)
    const limited = theLimitsOn(prior.selected!.program, prior.selected!.model, limits)
    if (limited.length > 0) return answer(`The previous roll selected row ${String(prior.selected!.rowId)}, but ${limited.join(' ')}`)
    record.choice = 'kept'
    record.selected = prior.selected
    record.candidates = prior.candidates
    record.keptFrom = input.earlier.run
    record.group = prior.group
    if (!rows.some(row => row.id === prior.selected!.rowId)) record.notes.push(`Row ${String(prior.selected!.rowId)} is no longer in the Casting table; its roll is still kept.`)
    record.notes.push(...theLimitsOn(prior.selected!.program, prior.selected!.model, limits))
    return answer(`The agent keeps row ${String(prior.selected!.rowId)} from run ${input.earlier.run}'s roll.`)
  }
  for (const row of rows) {
    if (row.probability !== null && (!Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1)) throw new Error(`Casting row ${String(row.id)} has an unreadable probability.`)
  }
  const carries = (row: CastingRollRow): boolean => difficulty === null || row.labels.includes(difficulty)
  // A LABEL NO ROW CARRIES IS REFUSED, and the marked row is not taken in its place: work marked with a label must be
  // given a row of that label.
  if (difficulty !== null && !rows.some(row => !isTheLunaFallback(row) && carries(row))) return answer(noRowCarriesTheLabel(input.role, input.project, difficulty))
  const inGroup = (row: CastingRollRow): boolean => !isTheLunaFallback(row) && carries(row)
  const isTheBuildersModel = (row: CastingRollRow): boolean =>
    input.role === THE_INSPECTOR && input.builderModel !== null && row.model !== null && castingModelName(row.model) === castingModelName(input.builderModel)
  const reasonsFor = (row: CastingRollRow): string[] => {
    const reasons: string[] = []
    if (isTheLunaFallback(row)) reasons.push('Luna on OpenCode Go is only the launcher fallback after Codex limits it (a decision of the owner)')
    if (difficulty !== null && !carries(row)) reasons.push(outsideTheWorkLabelled(difficulty))
    if (row.outUntil !== null) reasons.push(outUntil(row.outUntil))
    if (isTheBuildersModel(row)) reasons.push('the builder used this model; a check uses a different model')
    reasons.push(...theLimitsOn(row.program, row.model, limits))
    if (row.probability === null) reasons.push('no probability is set')
    if (row.program === null || row.model === null) reasons.push('the program or model cell is empty')
    return reasons
  }
  const ordered = [...rows].sort((a, b) => a.id - b.id)
  const remaining: CastingRollRow[] = []
  for (const row of ordered) {
    const reasons = reasonsFor(row)
    if (reasons.length > 0) {
      const { share: _share, number: _number, ...fields } = theRowFields(row)
      record.skipped.push({ ...fields, rowId: row.id, reasons })
    } else remaining.push(row)
  }
  // Remind, never gate. With no probabilities set, take the marked row. A
  // probability of 0 only means a row is not drawn, and a check never draws the builder's model, so neither is a number
  // the roll can use. A limit is, and keeps its own answer below.
  if (!rows.some(row => inGroup(row) && !isTheBuildersModel(row) && row.probability !== null && row.probability > 0)) {
    const set = rows.filter(row => inGroup(row) && row.probability !== null)
    const why = set.length === 0 ? `no probability is set for ${input.role} in ${record.group}`
      : set.some(row => row.probability! > 0) ? `the only probability above zero for ${input.role} in ${record.group} is on the builder's model, which a check does not use`
      : `every probability set for ${input.role} in ${record.group} is zero`
    const marked = rows.find(row => row.marked)
    if (marked === undefined) return answer(`${why.charAt(0).toUpperCase()}${why.slice(1)}, and the Casting table has no marked row to take.`)
    if (marked.outUntil !== null) return answer(`${why.charAt(0).toUpperCase()}${why.slice(1)}, and marked row ${String(marked.id)} cannot be taken because ${outUntil(marked.outUntil)}.`)
    const markedStart = theStartOfARoll({ ...record, choice: 'marked', selected: theRowFields(marked) })
    const limited = [...new Set([...theLimitsOn(marked.program, marked.model, limits), ...theLimitsOn(markedStart.runtime, markedStart.model, limits)])]
    if (limited.length > 0) return answer(`${why.charAt(0).toUpperCase()}${why.slice(1)}, and marked row ${String(marked.id)} cannot be taken: ${limited.join(' ')}`)
    record.choice = 'marked'
    record.selected = theRowFields(marked)
    record.notes.push(...reasonsFor(marked))
    return answer(`The tools take marked row ${String(marked.id)} because ${why}.`)
  }
  const total = remaining.reduce((sum, row) => sum + row.probability!, 0)
  record.candidates = remaining.map(row => ({ rowId: row.id, program: row.program!, model: row.model!, effort: row.effort, probability: row.probability!, share: total === 0 ? 0 : row.probability! / total }))
  if (total === 0) {
    const why = record.skipped.map(row => `Row ${String(row.rowId)} (${row.program ?? 'empty program'} ${row.model ?? 'empty model'}): ${row.reasons.map(reason => reason.replace(/\.$/, '')).join('; ')}`)
    why.push(...record.candidates.map(row => `Row ${String(row.rowId)} (${row.program} ${row.model}): its probability is zero`))
    return answer(`No model can be rolled for ${input.role} in ${record.group}: ${why.join('; ')}.`)
  }
  const number = input.random()
  if (!Number.isFinite(number) || number < 0 || number >= 1) throw new Error('The Casting random source must answer a number from zero up to, but not including, one.')
  let sum = 0
  const positive = record.candidates.filter(row => row.share > 0)
  // The last positive row closes the interval despite floating-point addition rounding a sum below one.
  const chosen = positive.find((row, index) => { sum += row.share; return number < sum || index === positive.length - 1 })!
  record.choice = 'rolled'
  record.selected = { ...chosen, number }
  return answer(`The ${record.group} Casting roll ${String(number)} chose row ${String(chosen.rowId)} (${chosen.program} ${chosen.model}).`)
}

/** A provider reset, with the zone used to read its words. The office zone is explicit when the words omit it. */
export interface CastingReset { until: number; zone: string; usedOfficeZone: boolean }

/**
 * Read only the two provider forms the office has observed, using the common Intl-backed clock reader, and the instant
 * the launcher writes for an OpenCode Go reset.
 */
export function parseCastingReset(words: string | null, stoppedAt: number, officeZone: string): CastingReset | null {
  if (words === null) return null
  // AN INSTANT WITH ITS OFFSET is how the launcher writes an OpenCode Go reset (round 47). It is exact, so no zone reads
  // it; the office zone only shows it.
  const instant = momentOfAnInstant(words.trim())
  if (instant !== null) return { until: instant, zone: officeZone, usedOfficeZone: false }
  const claude = /^(\d{1,2}):(\d{2})\s*(am|pm)\s*\(([^)]+)\)$/i.exec(words.trim())
  const codex = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:st|nd|rd|th)?, (\d{4}) (\d{1,2}):(\d{2}) (AM|PM)$/i.exec(words.trim())
  if (claude === null && codex === null) return null
  const hour = Number(claude?.[1] ?? codex?.[4])
  const minute = Number(claude?.[2] ?? codex?.[5])
  if (hour < 1 || hour > 12 || minute > 59) return null
  const half = (claude?.[3] ?? codex?.[6])!.toLowerCase()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const clock = `${pad(hour % 12 + (half === 'pm' ? 12 : 0))}:${pad(minute)}:00`
  const zone = claude?.[4] ?? officeZone
  // A provider can write an unknown zone; that makes its words unreadable, not the whole request broken.
  try { stampInZone(0, zone) } catch (error) { if (error instanceof RangeError) return null; throw error }
  const exact = (stamp: string): number | null => {
    const ms = momentOfStampInZone(stamp, zone)
    return ms !== null && stampInZone(ms, zone) === stamp ? ms : null
  }
  if (codex !== null) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(codex[1]!.toLowerCase()) + 1
    const until = exact(`${codex[3]}-${pad(month)}-${pad(Number(codex[2]))} ${clock}`)
    return until === null ? null : { until, zone, usedOfficeZone: true }
  }
  if (!Number.isFinite(stoppedAt)) return null
  const date = stampInZone(stoppedAt, zone).slice(0, 10)
  const day = Date.parse(`${date}T00:00:00Z`)
  for (let offset = 0; offset < 3; offset++) {
    const stamp = `${stampInZone(day + offset * 86_400_000, 'UTC').slice(0, 10)} ${clock}`
    const first = exact(stamp)
    if (first === null) continue
    // A repeated autumn hour has a second occurrence. Derive its offset from the next day's wall clock.
    const tomorrow = first + 86_400_000
    const tomorrowWall = momentOfStampInZone(stampInZone(tomorrow, zone), 'UTC')!
    const firstWall = momentOfStampInZone(stamp, 'UTC')!
    const second = tomorrow - (tomorrowWall - firstWall)
    const future = [first, second].filter(ms => ms > stoppedAt && stampInZone(ms, zone) === stamp)
    if (future.length > 0) return { until: Math.min(...future), zone, usedOfficeZone: false }
  }
  return null
}
