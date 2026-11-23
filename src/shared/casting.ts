// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING TABLE (选角表): FOR EACH ROLE, THE WAYS THE OFFICE CASTS IT.
 *
 * A decision named it 选角表 in Chinese and Casting in English. Choosing again when models change
 * is recasting, and only this table changes. A later decision says each role may be cast several ways, and which suits
 * depends on the task's difficulty, the quota it uses and the cost for what it gives. That decision replaced another,
 * which replaced the first one. Item 3 of one more decision
 * says that handing out work names a role and never a model, so a new model means changing this table
 * only.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * -----------------------------------------------------------------------------------------
 *
 * The shapes the doors answer, the strict readers of a stored cell's source, probability, labels and
 * Out until, and the rule that says which casting the tools take. The store, the doors, the reader in
 * src/server/lib/run-models.ts and the page all read them from here, so each is worked out in one
 * place (the ninth invariant).
 *
 * Probability words are normalised here when a door writes them, stored as canonical decimals, read
 * strictly here, and shown as percentages on the page (the eighth invariant).
 *
 * -----------------------------------------------------------------------------------------
 * ONE ROW PER CASTING, AND THE ONE ROW THE TOOLS TAKE
 * -----------------------------------------------------------------------------------------
 *
 * A row is one way to cast one role, for every project or for one project. That is its scope. A role
 * has as many rows as it has castings. In each scope that has any row, exactly one row carries the
 * mark "The tools take this one": the tools that start agents, the builder's model and the check's
 * model take that row when no model is named. The mark is never called a default.
 *
 * A PROJECT'S CASTINGS REPLACE THE EVERY-PROJECT CASTINGS FOR THAT ROLE, AS A WHOLE. If a project has
 * any row for a role, the tools take the project's marked row, and nothing of the every-project rows.
 * If it has none, they take the every-project marked row. Round 1's rule, that a project row's empty
 * cell took the every-project value cell by cell, is gone: with several rows it has no clear meaning.
 * Migration 0190 copied such values into the project rows, so nothing changed in silence.
 *
 * AN EMPTY CELL IS AN ANSWER. It means nothing is written there. It is never filled with a guess, and
 * a reader that needs the value says the cell is empty.
 */
import { AGENT_RUNTIMES, isAgentRuntime } from './participants.ts'
import { aCopyOfTheSettings, whyTheSettingsCannotBeStored } from '../config/the-launchers-own-settings.mjs'
import { A_PROVIDER_ID } from './the-provider-table.ts'
import { clockStamp, momentOfAnInstant, uniqueMomentOfStoredStampInZone } from './time.ts'
import type { CastingLabelRule } from './casting-label-rules.ts'

/**
 * The cells of a row, in the order a person reads them: what the role is cast with, then when it
 * suits (the task's difficulty, the quota it uses, the cost for what it gives), then its labels,
 * then its probability, then until when it is out, then why.
 */
export const CASTING_CELLS = ['program', 'model', 'effort', 'difficulty', 'quota', 'cost', 'labels', 'probability', 'out_until', 'why'] as const
export type CastingCell = (typeof CASTING_CELLS)[number]

/** The three cells that say when a casting suits. */
export const WHEN_IT_SUITS_CELLS = ['difficulty', 'quota', 'cost'] as const satisfies readonly CastingCell[]

/** The programs a row may name: the runtime words the office knows, from the one list. */
export const CASTING_PROGRAMS = AGENT_RUNTIMES

/**
 * NORMALISE THE WORDS A PERSON GIVES FOR A PROBABILITY. A decimal is from 0 to 1; a percentage is from 0% to 100%.
 * The answer is the canonical decimal stored in the Casting cell.
 */
export function normaliseCastingProbability(value: string): string {
  const refusal = () => new Error(`You gave "${value}". Give a decimal from 0 to 1, or a percentage from 0% to 100%. Nothing was written.`)
  const trimmed = value.trim()
  const match = /^([0-9]*)(?:\.([0-9]+))?(\s*%)?$/.exec(trimmed)
  const wholeWords = match?.[1] ?? ''
  const fraction = match?.[2] ?? ''
  if (match === null || (wholeWords === '' && fraction === '')) {
    throw refusal()
  }

  const isPercentage = match[3] !== undefined
  const whole = wholeWords.replace(/^0+/, '') || '0'
  const wholeNumber = BigInt(whole)
  const hasFraction = /[1-9]/.test(fraction)
  if (isPercentage ? wholeNumber > 100n || (wholeNumber === 100n && hasFraction) : wholeNumber > 1n || (wholeNumber === 1n && hasFraction)) {
    throw refusal()
  }

  const digits = `${wholeWords === '' ? '0' : wholeWords}${fraction}`.replace(/^0+/, '') || '0'
  if (digits === '0') return '0'
  const scale = fraction.length + (isPercentage ? 2 : 0)
  if (scale === 0) return digits
  const padded = digits.padStart(scale + 1, '0')
  const point = padded.length - scale
  const integer = padded.slice(0, point)
  const decimal = padded.slice(point).replace(/0+$/, '')
  return decimal === '' ? integer : `${integer}.${decimal}`
}

/** READ THE CANONICAL VALUE IN A STORED PROBABILITY CELL. An empty cell is null; any other shape is a broken store. */
export function readCastingProbability(value: string | null): number | null {
  if (value === null) return null
  if (!/^(?:0|1|0\.\d*[1-9])$/.test(value)) {
    throw new Error(`The Casting table's stored probability "${value}" is not canonical.`)
  }
  return Number(value)
}

/**
 * NORMALISE THE WORDS A PERSON GIVES FOR A LABEL'S NAME, or null when they are not a label. Spaces at the ends go,
 * each run of spaces inside becomes one hyphen, and letters are lower-cased; a letter with no case, such as Chinese,
 * is kept as it is. What is left must be letters, digits and hyphens, from 1 to 32 of them, counted as a person
 * counts letters and not as UTF-16 units.
 */
export function normaliseACastingLabel(words: string): string | null {
  const name = words.trim().replace(/\s+/gu, '-').toLowerCase()
  if (!/^[\p{L}\p{Nd}-]+$/u.test(name)) return null
  const letters = [...name].length
  return letters >= 1 && letters <= 32 ? name : null
}

/**
 * READ A STORED LABELS CELL: the ids of the labels the row carries, smallest first. An empty cell is no label. Any
 * other shape is a broken store, because the writer stores only a list of ids it found in the labels table.
 */
export function readCastingLabelIds(value: string | null, where: string): number[] {
  if (value === null) return []
  let ids: unknown
  try {
    ids = JSON.parse(value)
  } catch {
    throw new Error(`The Casting table's labels for ${where} are not a list: "${value}".`)
  }
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id, n) => Number.isSafeInteger(id) && (id as number) > 0 && (n === 0 || (id as number) > (ids as number[])[n - 1]!))) {
    throw new Error(`The Casting table's labels for ${where} are not a list of label ids, smallest first: "${value}".`)
  }
  return ids as number[]
}

/**
 * NORMALISE THE WORDS A PERSON GIVES FOR AN OUT UNTIL, or null when they name no one moment. An instant with its
 * offset is taken as it is. A date and a time with no offset, such as 2026-11-18 09:00, is read on the office's
 * clock in `zone`; a time the clocks skip or pass twice names no one moment, so it is null too. The answer is the
 * instant with the office's offset, which the cell stores.
 */
export function normaliseCastingOutUntil(words: string, zone: string): string | null {
  const trimmed = words.trim()
  let ms = momentOfAnInstant(trimmed)
  if (ms === null) {
    const wall = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(:\d{2})?$/u.exec(trimmed)
    if (wall === null) return null
    ms = uniqueMomentOfStoredStampInZone(`${wall[1]!} ${wall[2]!}${wall[3] ?? ':00'}`, zone)
    if (ms === null) return null
  }
  try {
    return clockStamp(() => new Date(ms)).instant
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/** READ A STORED OUT UNTIL: the moment it names, or null when the cell is empty. Any other value is a broken store. */
export function readCastingOutUntil(value: string | null, where: string): number | null {
  if (value === null) return null
  const ms = momentOfAnInstant(value)
  if (ms === null) throw new Error(`The Casting table's Out until for ${where} is not an instant: "${value}".`)
  return ms
}

/** THE FIXED RULES OF LABELS AND THE ROLL, kept in a file that imports nothing; that file says why. */
export { CASTING_LABEL_RULES, type CastingLabelRule } from './casting-label-rules.ts'

/**
 * ONE LABEL OF THE TABLE: its own id, its name, what it means with where that came from, the rows that carry it,
 * smallest first, and its last change.
 */
export interface CastingLabel {
  id: number
  name: string
  meaning: CastingStoredCell
  rows: number[]
  lastChange: CastingChange
}

/** What a change to a label did. `migrate` is migration 0349's own row, for the labels it made from the work groups. */
export const CASTING_LABEL_CHANGE_KINDS = ['add', 'rename', 'change', 'remove', 'migrate'] as const
export type CastingLabelChangeKind = (typeof CASTING_LABEL_CHANGE_KINDS)[number]

/** A label as its history holds it. */
export interface CastingLabelImage {
  name: string
  meaning: CastingStoredCell
}

/** One change to a label, newest first in the answer. `before` is null for an add, `after` for a removal. */
export interface CastingLabelChange {
  what: CastingLabelChangeKind
  at: string
  by: { kind: string; id: string }
  authority: string | null
  before: CastingLabelImage | null
  after: CastingLabelImage | null
}

/** What `GET /api/casting/labels/:id/history` answers. */
export interface CastingLabelHistory {
  label: number
  changes: CastingLabelChange[]
}

/** What the label doors answer: the label as it is now, or as it was for a removal, and one sentence on what was done. */
export interface CastingLabelWritten {
  label: CastingLabel
  says: string
}

/**
 * WHERE ONE CELL'S VALUE CAME FROM, AS IT IS STORED.
 *
 * `at` and `by` are the write that set the value. `decision` is the owner's decision the writer
 * named for it, with the project that decision is filed in, or null because none was named.
 * `moved` is true for a value carried over from the Settings panel "The model each run uses" by
 * migration 0189; `at` and `by` are then that panel's last write. `copied` is true for a value
 * migration 0190 copied from the every-project row of the same role into a project row that left
 * the cell empty; `at`, `by`, `decision` and `moved` are then the every-project cell's. Sources
 * written before migration 0190 have no `copied`, and none of them was copied.
 *
 * `decisionWords` is present only where a migration set a value on the words of a decision rather
 * than a decision record: migration 0318 set each work group with the words the roll's old list
 * carried for it, migration 0349 carried those words into the labels cell, and 0349 wrote the meanings
 * of the labels hard and simple with their recorded source words.
 */
export interface CastingCellSource {
  at: string
  by: { kind: string; id: string }
  decision: { id: string; project: string } | null
  decisionWords?: string
  moved: boolean
  copied: boolean
}

/** One cell as stored: a value and where it came from, both null when the cell is empty. */
export interface CastingStoredCell {
  value: string | null
  from: CastingCellSource | null
}

/** The last change to a row: who, when, and what allowed it where the owner's authority in a test world did (authorityOf in src/server/lib/casting.ts). */
export interface CastingChange {
  at: string
  by: { kind: string; id: string }
  authority: string | null
}

/**
 * Native fields are independent of the Office model label and the existing effort cell. `provider` is the program's own
 * route. `providerRow` names a row of the provider table (src/shared/the-provider-table.ts) the check takes its key and
 * base address from, and is there only when the row names one.
 */
export interface CastingNative { model: string; provider: string | null; variant: string | null; providerRow?: string; settings?: CastingSetting[] }
/** One of a row's own program settings: src/config/the-launchers-own-settings.mjs says what a name and a value may be. */
export interface CastingSetting { name: string; value: unknown }
export interface CastingHold { revision: string; run: string; refusal: { kind: 'model' | 'option'; code: string; said: string }; at: string }
export interface CastingSelection { runtime: string; model: string; native: CastingNative & { effort: string | null }; casting: { id: number; revision: string } | null }
export interface CastingNativeState { native?: CastingNative | null; selectionRevision?: string; hold?: CastingHold | null }
export function readCastingNative(value: unknown): CastingNative | null {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('The Casting native selection is unreadable.')
  const native = value as Record<string, unknown>
  const word = (one: unknown) => typeof one === 'string' && one.trim() === one && one.length > 0 && one.length <= 4096 && !/[\x00-\x1f\x7f]/.test(one)
  const keys = Object.keys(native).filter(key => key !== 'providerRow').sort().join(',')
  if ((keys !== 'model,provider,variant' && keys !== 'model,provider,settings,variant') || !word(native['model']) ||
    !['provider','variant'].every(key => native[key] === null || word(native[key])) ||
    ('providerRow' in native && !(typeof native['providerRow'] === 'string' && A_PROVIDER_ID.test(native['providerRow'])))) throw new Error('The Casting native selection is incomplete or malformed.')
  if (!('settings' in native)) return native as unknown as CastingNative
  const providerRow = 'providerRow' in native ? {providerRow:native['providerRow'] as string} : {}
  const why = whyTheSettingsCannotBeStored(native['settings'])
  if (why !== null || (native['settings'] as unknown[]).length === 0) throw new Error(`The Casting native selection's settings are unreadable: ${why ?? 'an empty list is stored as no settings.'}`)
  return {model:native['model'] as string,provider:native['provider'] as string | null,variant:native['variant'] as string | null,...providerRow,settings:aCopyOfTheSettings(native['settings'] as CastingSetting[])}
}

/** One casting: one way to cast one role, in one scope. */
export interface CastingRow extends CastingNativeState {
  /** The row's own id. */
  id: number
  role: string
  /** The project this row is for, or null for every project. */
  project: string | null
  /** The project's title, or null for every project. */
  projectTitle: string | null
  /** True for the one row of its scope the tools take when no model is named. */
  marked: boolean
  cells: Record<CastingCell, CastingStoredCell>
  lastChange: CastingChange
}

/**
 * A row as the table's reading draws it: the row, and what the office's limits say of its program now, one sentence
 * a limit, or no sentence when no limit stops it. Only the reading carries this, because only it reads the limits.
 */
export interface CastingRowInTheTable extends CastingRow {
  officeOut: string[]
}

/**
 * WHAT THE ROLL WOULD DO NOW FOR WORK OF ONE LABEL, in one worker scope: draw among rows with their shares, take the
 * marked row, or draw nothing because no row carries the label. It is worked out with the roll itself, with the
 * office's limits as they are now and no earlier roll, and it is never a roll: no number is drawn.
 */
export interface CastingLabelDraw {
  label: number
  choice: 'drawn' | 'marked' | 'none'
  /** The rows the roll would draw from, each with its share from 0 to 1; for `marked`, the marked row with share 1. */
  rows: { rowId: number; share: number }[]
}

/** The castings of one role in one scope, oldest first. */
export interface CastingScope {
  project: string | null
  projectTitle: string | null
  castings: CastingRowInTheTable[]
  /** For the worker's scopes, what the roll would do for each label the table holds; null for any other role. */
  draws: CastingLabelDraw[] | null
}

/** One role card with its castings, every project first, then each project that has its own. */
export interface CastingRoleCard {
  role: string
  scopes: CastingScope[]
  /** For a role with no casting at all, the sentence that says so; null otherwise. */
  says: string | null
}

/** What a role nobody has cast says, written once. */
export const NOBODY_HAS_CAST_THIS_ROLE = 'Nobody has cast this role. The table holds no casting for it.'

/** What `GET /api/casting` answers. */
export interface CastingReading {
  /**
   * Each role card in the order the cards are declared, then any role the table holds that no card
   * declares, rather than hiding it. A card with no casting has no scopes and a sentence. The office
   * failing to read the table is an error answer, never an empty list.
   */
  roles: CastingRoleCard[]
  /** The program words a row may name. */
  programs: readonly string[]
  /** Every label of the table, in the order they were made. */
  labels: CastingLabel[]
  /** The fixed rules of labels and the roll, as the code applies them. */
  rules: readonly CastingLabelRule[]
  /** The office's time zone, in which an Out until with no offset is read. */
  officeTimeZone: string
  /**
   * EVERY AGENT OF A HARNESS THE OFFICE HAS NO ADAPTER FOR, by handle, with the harness's word. No row can name that
   * harness as its program, because the office cannot start it; the page says its model is chosen there.
   */
  harnesses: { handle: string; harness: string }[]
}

/** What `GET /api/casting/for/:role` answers. */
export interface CastingFor {
  role: string
  /** The project asked about, or null for every project. */
  project: string | null
  /**
   * Which scope's marked row answered: the project's own castings, the every-project castings, or
   * null because the table marks no casting for this role there.
   */
  scope: 'the project' | 'every project' | null
  /** The marked row that answered, or null. */
  casting: CastingRow | null
  program: string | null
  model: string | null
  effort: string | null
  /** The marked row's cells, or every cell empty when there is no marked row. */
  cells: Record<CastingCell, CastingStoredCell>
  /** The cells the marked row leaves empty, in order; every cell when there is none. */
  empty: CastingCell[]
  /** One plain sentence: which row the tools take and what it casts, or that the table marks none. */
  says: string
}

/** What a change to a casting row did. `migrate` is a migration's own row: 0190's, 0318's for the work group, and 0349's for the labels. */
export const CASTING_CHANGE_KINDS = ['add', 'change', 'remove', 'mark', 'unmark', 'migrate', 'hold'] as const
export type CastingChangeKind = (typeof CASTING_CHANGE_KINDS)[number]

/** A row as a history entry holds it: its cells, and whether it carried the mark. */
export interface CastingImage extends CastingNativeState {
  cells: Record<CastingCell, CastingStoredCell>
  /** Null in an image written before migration 0190, which kept no mark. */
  marked: boolean | null
  /**
   * The work group of an image written before migration 0349, which held that cell; such an image has no labels or
   * Out until, and they are drawn empty. Absent in a newer image.
   */
  workGroup?: CastingStoredCell
}

/** One entry of a role's history, newest first in the answer. */
export interface CastingHistoryEntry {
  /** The casting row the change was to. */
  castingId: number
  project: string | null
  what: CastingChangeKind
  at: string
  by: { kind: string; id: string }
  authority: string | null
  /** The decisions the write named for its cells. */
  decisions: string[]
  /** A note the office wrote with the change, such as what a migration did, or null. */
  note: string | null
  /** The row before, or null when the change added it. */
  before: CastingImage | null
  /** The row after, or null when the change removed it. */
  after: CastingImage | null
}

/** What `GET /api/casting/:role/history` answers. */
export interface CastingHistory {
  role: string
  /** The one casting asked about with ?casting=, or null for every casting of the role. */
  casting: number | null
  changes: CastingHistoryEntry[]
  /** The name of each label id the images name, by its last name, a removed label's too. */
  labelNames: Record<string, string>
}

/** What the add, remove and mark doors answer beside the row: one sentence on what was done. */
export interface CastingWritten {
  casting: CastingRow
  says: string
}

/** What an empty cell says. */
export const NOTHING_IS_WRITTEN_HERE = 'Nothing is written here yet.'

/** THE NOTE ON A VALUE MOVED FROM THE SETTINGS PANEL, written once for migration 0189 and the reader. */
export const MOVED_FROM_SETTINGS = 'Moved from Settings, The model each run uses, by migration 0189.'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * READ ONE STORED CELL SOURCE, OR REFUSE IT LOUDLY.
 *
 * Null means the cell is empty. Anything that is not the shape above throws, because a store
 * holding something unreadable is a broken assumption and not an empty cell. Two fields may be
 * absent: `copied`, which sources written before migration 0190 do not have, and `decisionWords`,
 * which only the data steps of migrations 0318 and 0349 write.
 */
export function readCastingCellSource(stored: unknown, where: string): CastingCellSource | null {
  if (stored === null || stored === undefined) return null
  if (!isObject(stored)) throw new Error(`The Casting table's source for ${where} is not an object.`)
  const at = stored['at']
  const by = stored['by']
  const decision = stored['decision']
  const moved = stored['moved']
  const copied = stored['copied']
  const decisionWords = stored['decisionWords']
  if (typeof at !== 'string' || at === '') throw new Error(`The Casting table's source for ${where} names no time.`)
  if (!isObject(by) || typeof by['kind'] !== 'string' || typeof by['id'] !== 'string') {
    throw new Error(`The Casting table's source for ${where} names nobody.`)
  }
  if (typeof moved !== 'boolean') throw new Error(`The Casting table's source for ${where} does not say whether it was moved.`)
  if (copied !== undefined && typeof copied !== 'boolean') throw new Error(`The Casting table's source for ${where} holds a "copied" that is not true or false.`)
  let named: CastingCellSource['decision'] = null
  if (decision !== null) {
    if (!isObject(decision) || typeof decision['id'] !== 'string' || typeof decision['project'] !== 'string') {
      throw new Error(`The Casting table's source for ${where} names a decision it cannot read.`)
    }
    named = { id: decision['id'], project: decision['project'] }
  }
  const source: CastingCellSource = { at, by: { kind: by['kind'], id: by['id'] }, decision: named, moved, copied: copied === true }
  if (decisionWords !== undefined) {
    if (typeof decisionWords !== 'string' || decisionWords.trim() === '') {
      throw new Error(`The Casting table's source for ${where} holds decision words that are blank or not text.`)
    }
    source.decisionWords = decisionWords
  }
  return source
}

/** Whether a word is a program a row may name. */
export function isACastingProgram(value: string): boolean {
  return isAgentRuntime(value)
}

/**
 * THE ROW THE TOOLS TAKE FOR ONE PROJECT: the project's marked row if the project has any row for
 * the role, else the every-project marked row, else none. The one place the rule is applied.
 *
 * `rows` are every row of ONE role. A scope that has rows and no mark is a broken store, because
 * every writer keeps one mark in a scope that has rows, so it throws rather than picking one.
 */
export function theRowTheToolsTake<T extends { project: string | null; marked: boolean }>(
  rows: readonly T[],
  project: string | null,
): { row: T; scope: 'the project' | 'every project' } | null {
  const inScope = (scope: string | null) => rows.filter((row) => row.project === scope)
  const marked = (scope: string | null): T => {
    const found = inScope(scope).filter((row) => row.marked)
    if (found.length !== 1) {
      throw new Error(`The Casting table holds ${String(found.length)} marked rows in ${scope === null ? 'every project' : scope} for one role; it must hold exactly one.`)
    }
    return found[0] as T
  }
  if (project !== null && inScope(project).length > 0) return { row: marked(project), scope: 'the project' }
  if (inScope(null).length > 0) return { row: marked(null), scope: 'every project' }
  return null
}

/**
 * THE ROWS IN FORCE FOR ONE PROJECT: every row of the scope whose marked row the tools take, by the rule above, and
 * that marked row. None when the table marks no row. `rows` are every row of ONE role. The server's roll
 * (src/server/lib/the-rows-in-force.ts) and the new agent dialog read their rows here, so both read one scope.
 */
export function theRowsOfTheScopeInForce<T extends { project: string | null; marked: boolean }>(
  rows: readonly T[],
  project: string | null,
): { rows: T[]; marked: T } | null {
  const taken = theRowTheToolsTake(rows, project)
  if (taken === null) return null
  const scope = taken.scope === 'the project' ? project : null
  return { rows: rows.filter((row) => row.project === scope), marked: taken.row }
}

/** A row with every cell empty. */
export function anEmptyRow(): Record<CastingCell, CastingStoredCell> {
  return Object.fromEntries(CASTING_CELLS.map((cell) => [cell, { value: null, from: null }])) as Record<CastingCell, CastingStoredCell>
}
