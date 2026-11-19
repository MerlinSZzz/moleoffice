// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING LABELS (migration 0349): their one reader, their writers and their history.
 *
 * A label is a word the person or an agent makes for a kind of work, with what it means. A Casting row carries any
 * labels the table holds, and the roll for work of a label draws only the rows that carry it
 * (src/shared/casting-roll.ts). The labels are one list for the whole installation, as the Casting table is.
 *
 * `casting_labels` holds each label as it is now. A removed label's row is deleted, and `casting_label_changes` keeps
 * one row for each change, with the label before and after, so a removed label's history and last name stay readable.
 * A row's labels cell stores label ids, so a rename changes no row.
 *
 * This file does not import src/server/lib/casting.ts, which imports it. The doors in src/server/api/casting.ts work
 * out who wrote and what allowed it there, and hand both in.
 */
import {
  CASTING_LABEL_CHANGE_KINDS,
  normaliseACastingLabel,
  readCastingCellSource,
  readCastingLabelIds,
  type CastingLabel,
  type CastingLabelChange,
  type CastingLabelChangeKind,
  type CastingLabelHistory,
  type CastingLabelImage,
  type CastingLabelWritten,
  type CastingStoredCell,
} from '@shared/casting.ts'
import { nowStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'

/** Who made a write, and what allowed it where that was more than the writer's own standing. */
export interface CastingLabelWriter {
  by: { kind: string; id: string }
  authority: string | null
}

/** One row of `casting_labels` as SQLite answers it. */
interface HeldLabel {
  id: number
  name: string
  meaning: string | null
  meaning_from: string | null
  changed_at: string
  changed_by_kind: string
  changed_by_id: string
  authority: string | null
}

/** One row of `casting_label_changes` as SQLite answers it. */
interface HeldLabelChange {
  id: number
  label_id: number
  what: string
  at: string
  by_kind: string
  by_id: string
  authority: string | null
  before: string | null
  after: string | null
}

function meaningOf(held: HeldLabel): CastingStoredCell {
  const where = `the meaning of Casting label ${String(held.id)}`
  return { value: held.meaning, from: readCastingCellSource(held.meaning_from === null ? null : JSON.parse(held.meaning_from), where) }
}

function labelOf(held: HeldLabel, rows: number[]): CastingLabel {
  return {
    id: held.id,
    name: held.name,
    meaning: meaningOf(held),
    rows,
    lastChange: { at: held.changed_at, by: { kind: held.changed_by_kind, id: held.changed_by_id }, authority: held.authority },
  }
}

/** The ids of the Casting rows that carry each label, smallest first. */
function theRowsOfEachLabel(): Map<number, number[]> {
  const rows = new Map<number, number[]>()
  for (const row of sqlite.prepare('SELECT id, labels FROM casting_rows WHERE labels IS NOT NULL ORDER BY id').all() as { id: number; labels: string }[]) {
    for (const label of readCastingLabelIds(row.labels, `Casting row ${String(row.id)}`)) rows.set(label, [...(rows.get(label) ?? []), row.id])
  }
  return rows
}

/** EVERY LABEL OF THE TABLE, in the order they were made, each with the rows that carry it. */
export function theCastingLabels(): CastingLabel[] {
  const rows = theRowsOfEachLabel()
  return (sqlite.prepare('SELECT * FROM casting_labels ORDER BY id').all() as HeldLabel[]).map((held) => labelOf(held, rows.get(held.id) ?? []))
}

/** The name of each label the table holds now, by its id, in the order they were made. */
export function theCastingLabelNames(): Map<number, string> {
  return new Map((sqlite.prepare('SELECT id, name FROM casting_labels ORDER BY id').all() as { id: number; name: string }[]).map((one) => [one.id, one.name]))
}

/**
 * THE NAME OF EACH LABEL ID ASKED FOR, BY ITS LAST NAME: the name it has now, or for a removed label the name its
 * history last gave it. An id with neither is a broken store, because a row is given only a label the table holds.
 */
export function theLastNamesOf(ids: Iterable<number>): Record<string, string> {
  const now = theCastingLabelNames()
  const names: Record<string, string> = {}
  for (const id of ids) {
    const name = now.get(id) ?? theNameItsHistoryLastGave(id)
    if (name === null) throw new Error(`The Casting history names label ${String(id)}, which the table does not hold and no change to a label records.`)
    names[String(id)] = name
  }
  return names
}

function theNameItsHistoryLastGave(id: number): string | null {
  const held = sqlite.prepare('SELECT * FROM casting_label_changes WHERE label_id = ? ORDER BY id DESC LIMIT 1').get(id) as HeldLabelChange | undefined
  if (held === undefined) return null
  const change = changeOf(held)
  return (change.after ?? change.before)?.name ?? null
}

/**
 * THE LABEL A NAME ONCE NAMED, when a rename has moved it on: the name that label has now, or null when no label still
 * held was ever called that. A brief that names an old name is refused with the new one, never read as the new one.
 */
export function theNameNowOfALabelOnceCalled(name: string): string | null {
  const now = theCastingLabelNames()
  for (const held of sqlite.prepare("SELECT * FROM casting_label_changes WHERE what = 'rename' ORDER BY id DESC").all() as HeldLabelChange[]) {
    const change = changeOf(held)
    if (change.before?.name === name && now.has(held.label_id)) return now.get(held.label_id)!
  }
  return null
}

/** What one word is, read as a label of the Casting table. */
export type ACastingLabelWord =
  /** A label the table holds, by the name the table stores. */
  | { is: 'a label'; name: string }
  /** The old name of a label that a rename moved on, with the name it has now. It is never read as that label. */
  | { is: 'renamed'; now: string }
  /** No label the table holds, or no label name at all, with every name the table holds, in the order they were made. */
  | { is: 'no label'; labels: string[] }

/**
 * ONE WORD READ AS A LABEL OF THE CASTING TABLE, for a caller that is given a kind of work in words, as a brief's
 * "Difficulty:" line gives one. The word is made a label name as the label doors make one (normaliseACastingLabel in
 * src/shared/casting.ts). The labels are one list for the whole installation, so a project has no labels of its own and
 * the answer is the same in every project. It reads the table, so it runs on the server only.
 */
export function readACastingLabelWord(word: string): ACastingLabelWord {
  const name = normaliseACastingLabel(word)
  const labels = [...theCastingLabelNames().values()]
  if (name !== null && labels.includes(name)) return { is: 'a label', name }
  const now = name === null ? null : theNameNowOfALabelOnceCalled(name)
  return now === null ? { is: 'no label', labels } : { is: 'renamed', now }
}

/**
 * THE LABEL IDS A ROW'S LABELS CELL IS GIVEN, from the names a person writes, separated by commas. Each name is
 * normalised as a label's name is, a name given twice counts once, and the ids come back smallest first. A name the
 * table does not hold is refused, so nothing is written. No name at all is an empty cell.
 */
export function theLabelIdsNamed(words: string): number[] {
  const byName = new Map([...theCastingLabelNames()].map(([id, name]) => [name, id]))
  const ids = new Set<number>()
  for (const part of words.split(',')) {
    const given = part.trim()
    if (given === '') continue
    const name = normaliseACastingLabel(given)
    const id = name === null ? undefined : byName.get(name)
    if (id === undefined) {
      const label = name ?? given
      throw new PanelError(
        `"${label}" is not a label of the Casting table. Make it on the Casting page's Rules tab first, or give a label the table has. Nothing was written.`,
        400, undefined, undefined, undefined, { code: 'castingNotALabelOfTheTable', values: { label } },
      )
    }
    ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

function aLabelName(words: string): string {
  const name = normaliseACastingLabel(words)
  if (name === null) {
    throw new PanelError(
      `"${words}" is not a label. A label is 1 to 32 letters, digits or hyphens; spaces become hyphens. Nothing was written.`,
      400, undefined, undefined, undefined, { code: 'castingNotALabel', values: { label: words } },
    )
  }
  return name
}

function refuseATakenName(name: string): void {
  if (sqlite.prepare('SELECT id FROM casting_labels WHERE name = ?').get(name) === undefined) return
  throw new PanelError(`There is already a label "${name}". Give another name. Nothing was written.`, 409, undefined, undefined, undefined, {
    code: 'castingLabelTaken',
    values: { label: name },
  })
}

function noSuchLabel(idWords: string): PanelError {
  return new PanelError(`There is no Casting label with the id ${idWords}. Nothing was written.`, 404, undefined, undefined, undefined, {
    code: 'castingNoSuchLabel',
    values: { label: idWords },
  })
}

/** The label a door names by its id, as the table holds it now, or a 404. */
function aLabelThatExists(idWords: string): HeldLabel {
  const held = /^[1-9][0-9]*$/u.test(idWords) ? (sqlite.prepare('SELECT * FROM casting_labels WHERE id = ?').get(Number(idWords)) as HeldLabel | undefined) : undefined
  if (held === undefined) throw noSuchLabel(idWords)
  return held
}

/** A meaning as a person writes it: spaces at the ends go, and an empty one empties the cell. */
function aMeaning(value: string | null, at: string, who: CastingLabelWriter): CastingStoredCell {
  const words = value === null ? '' : value.trim()
  if (words === '') return { value: null, from: null }
  return { value: words, from: { at, by: who.by, decision: null, moved: false, copied: false } }
}

function theLabel(id: number): CastingLabel {
  const held = sqlite.prepare('SELECT * FROM casting_labels WHERE id = ?').get(id) as HeldLabel
  return labelOf(held, theRowsOfEachLabel().get(id) ?? [])
}

function imageOf(held: HeldLabel): CastingLabelImage {
  return { name: held.name, meaning: meaningOf(held) }
}

function writeTheChange(labelId: number, what: CastingLabelChangeKind, at: string, who: CastingLabelWriter, before: CastingLabelImage | null, after: CastingLabelImage | null): void {
  sqlite
    .prepare('INSERT INTO casting_label_changes (label_id, what, at, by_kind, by_id, authority, note, before, after) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    .run(labelId, what, at, who.by.kind, who.by.id, who.authority, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after))
}

function stamp(at: string, who: CastingLabelWriter): unknown[] {
  return [at, who.by.kind, who.by.id, who.authority]
}

/** MAKE A LABEL, with what it means if that is given. No row carries it until a row is given it. */
export function addACastingLabel(asked: { name: string; meaning?: { value: string | null } }, who: CastingLabelWriter): CastingLabelWritten {
  const name = aLabelName(asked.name)
  const at = nowStamp()
  const meaning = aMeaning(asked.meaning?.value ?? null, at, who)
  const id = sqlite.transaction(() => {
    refuseATakenName(name)
    const added = sqlite
      .prepare('INSERT INTO casting_labels (name, meaning, meaning_from, changed_at, changed_by_kind, changed_by_id, authority) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, meaning.value, meaning.from === null ? null : JSON.stringify(meaning.from), ...stamp(at, who))
    const made = Number(added.lastInsertRowid)
    writeTheChange(made, 'add', at, who, null, { name, meaning })
    return made
  })()
  return { label: theLabel(id), says: `Made the Casting label "${name}". No row carries it yet.` }
}

/**
 * RENAME A LABEL, OR WRITE WHAT IT MEANS. The rows that carry it keep it, because they hold its id. A name or a meaning
 * that is already the label's is answered as it is, and nothing is written.
 */
export function changeACastingLabel(idWords: string, asked: { name: string } | { meaning: { value: string | null } }, who: CastingLabelWriter): CastingLabelWritten {
  const was = aLabelThatExists(idWords)
  const before = imageOf(was)
  const at = nowStamp()
  if ('name' in asked) {
    const name = aLabelName(asked.name)
    if (name === was.name) return { label: theLabel(was.id), says: `The Casting label is already called "${name}". Nothing was written.` }
    sqlite.transaction(() => {
      refuseATakenName(name)
      sqlite.prepare('UPDATE casting_labels SET name = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = ? WHERE id = ?').run(name, ...stamp(at, who), was.id)
      writeTheChange(was.id, 'rename', at, who, before, { ...before, name })
    })()
    return { label: theLabel(was.id), says: `Renamed the Casting label "${was.name}" to "${name}". The rows that carried it carry it under its new name.` }
  }
  const meaning = aMeaning(asked.meaning.value, at, who)
  if (meaning.value === before.meaning.value) {
    return { label: theLabel(was.id), says: `The Casting label "${was.name}" already ${meaning.value === null ? 'has no meaning written' : 'means that'}. Nothing was written.` }
  }
  sqlite.transaction(() => {
    sqlite
      .prepare('UPDATE casting_labels SET meaning = ?, meaning_from = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = ? WHERE id = ?')
      .run(meaning.value, meaning.from === null ? null : JSON.stringify(meaning.from), ...stamp(at, who), was.id)
    writeTheChange(was.id, 'change', at, who, before, { ...before, meaning })
  })()
  return { label: theLabel(was.id), says: meaning.value === null ? `Emptied what the Casting label "${was.name}" means.` : `Wrote what the Casting label "${was.name}" means.` }
}

/**
 * REMOVE A LABEL NO ROW CARRIES. A label a row carries is refused, naming the rows, because a row would then hold the
 * id of a label that is gone. Its history is kept.
 */
export function removeACastingLabel(idWords: string, who: CastingLabelWriter): CastingLabelWritten {
  const was = aLabelThatExists(idWords)
  const rows = theRowsOfEachLabel().get(was.id) ?? []
  if (rows.length > 0) {
    const listed = rows.join(', ')
    throw new PanelError(
      `The label "${was.name}" is on Casting rows ${listed}. Take it off those rows first, then remove it. Nothing was written.`,
      409, undefined, undefined, undefined, { code: 'castingLabelInUse', values: { label: was.name, rows: listed } },
    )
  }
  const label = labelOf(was, [])
  const at = nowStamp()
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM casting_labels WHERE id = ?').run(was.id)
    writeTheChange(was.id, 'remove', at, who, imageOf(was), null)
  })()
  return { label, says: `Removed the Casting label "${was.name}". Its history is kept.` }
}

function isALabelChangeKind(value: string): value is CastingLabelChangeKind {
  return (CASTING_LABEL_CHANGE_KINDS as readonly string[]).includes(value)
}

function imageFrom(stored: string | null, where: string): CastingLabelImage | null {
  if (stored === null) return null
  const image = JSON.parse(stored) as unknown
  if (typeof image !== 'object' || image === null || Array.isArray(image)) throw new Error(`The Casting labels' history ${where} is not a label.`)
  const { name, meaning } = image as Record<string, unknown>
  if (typeof name !== 'string' || normaliseACastingLabel(name) !== name) throw new Error(`The Casting labels' history ${where} holds no label name.`)
  if (typeof meaning !== 'object' || meaning === null || Array.isArray(meaning)) throw new Error(`The Casting labels' history ${where} holds no meaning.`)
  const value = (meaning as Record<string, unknown>)['value']
  const from = readCastingCellSource((meaning as Record<string, unknown>)['from'], `${where}, its meaning`)
  if ((value !== null && typeof value !== 'string') || (value === null) !== (from === null)) throw new Error(`The Casting labels' history ${where} holds a meaning it cannot read.`)
  return { name, meaning: { value, from } }
}

function changeOf(held: HeldLabelChange): CastingLabelChange {
  const where = `change ${String(held.id)}`
  if (!isALabelChangeKind(held.what)) throw new Error(`The Casting labels' history ${where} says "${held.what}", which is not a kind of change to a label.`)
  return {
    what: held.what,
    at: held.at,
    by: { kind: held.by_kind, id: held.by_id },
    authority: held.authority,
    before: imageFrom(held.before, `${where}, before`),
    after: imageFrom(held.after, `${where}, after`),
  }
}

/** WHAT `GET /api/casting/labels/:id/history` ANSWERS: every change to one label, a removed one too, newest first. */
export function castingLabelHistory(idWords: string): CastingLabelHistory {
  const id = /^[1-9][0-9]*$/u.test(idWords) ? Number(idWords) : null
  const held = id === null ? [] : (sqlite.prepare('SELECT * FROM casting_label_changes WHERE label_id = ? ORDER BY id DESC').all(id) as HeldLabelChange[])
  if (id === null || held.length === 0) throw noSuchLabel(idWords)
  return { label: id, changes: held.map(changeOf) }
}
