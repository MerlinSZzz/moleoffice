// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO OWNS THIS OFFICE: THE SETTING IN THE DATABASE, HOW IT IS WRITTEN AT THE FIRST MIGRATE, AND
 * HOW IT IS READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DECIDED
 * ---------------------------------------------------------------------------------------
 *
 * The owner comes from the installer, not from the code. Row FLO-14 of a
 * decision says so. A fresh office writes no built-in person. An office
 * that already holds work names its owner in its .env, by the id and name of a person it already
 * holds, and nothing else in its database moves.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES
 * ---------------------------------------------------------------------------------------
 *
 * On the owner's own `people` row, in `office_owner` (the owner migration `the_owner_comes_from_the_installer`). NULL means the person is not
 * the owner; one of the three words below means they are, and says where their name came from. At
 * most one row carries a word, which a unique index in the database holds. A column on the row the
 * owner already has, and not a table of settings, for the reason 0188 and 0191 give.
 *
 * THE NAME IS THE ROW'S OWN `name`. While nobody has given one, the row holds the English
 * placeholder, so every place that draws the owner's name draws the placeholder and never a blank.
 * `readTheOfficeOwner` answers name null in that state, because the placeholder is not a name
 * anybody gave.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIRST MIGRATE, EVERY CASE
 * ---------------------------------------------------------------------------------------
 *
 * `settleTheOfficeOwner` runs inside every migrate (the participants step). Once a row carries the
 * mark, it only checks that MOLE_OFFICE_OWNER_ID, where set, still names that row, and stops the
 * migrate with a sentence where it does not. Before any row carries it:
 *
 *   - A NEW OFFICE (no records and no person yet): the owner is MOLE_OFFICE_OWNER_ID, or `owner`
 *     when nothing said. The name is MOLE_OFFICE_OWNER_NAME, or none: the row holds the placeholder
 *     and the mark says `unnamed`.
 *   - AN OFFICE THAT ALREADY HOLDS WORK (records, or a person): both settings must be set. Where it
 *     holds no person yet (records from before people had rows), the owner's row is written from
 *     them. Otherwise the id must be a person already in it and the name the name that person
 *     already has; then the mark is written on that row and nothing else changes. Anything else
 *     stops the migrate with a sentence naming what to set. It never picks an owner for an office by itself, because
 *     that would silently give somebody's work to a person nobody named.
 *
 * `refuseAnOfficeWithNoOwnerToWrite` asks the same question BEFORE the SQL migrations run, so an
 * office that would be refused is refused before anything in it has changed.
 */

import type Database from 'better-sqlite3'
import { settingValue } from '../../config/settings.mjs'
import { whyHandleIsRefused } from '@shared/participants.ts'
import { OWNER_NAME_LIMITS, THE_GUIDE_ADDRESS, THE_OWNER_PLACEHOLDER } from '@shared/owner.ts'

/**
 * The three words `people.office_owner` may hold.
 *
 * - `unnamed`: the owner, and nobody has given their name yet. The row's name is the placeholder.
 * - `named-by-the-installer`: the name came from MOLE_OFFICE_OWNER_NAME at the first migrate.
 * - `named-by-the-person`: the person gave it in their own browser, through POST /api/office/owner.
 */
export const OFFICE_OWNER_MARKS = ['unnamed', 'named-by-the-installer', 'named-by-the-person'] as const
export type OfficeOwnerMark = (typeof OFFICE_OWNER_MARKS)[number]

/** The id a new office gives its owner when MOLE_OFFICE_OWNER_ID is not set. */
export const THE_OWNER_ID_WHEN_NOTHING_SAID = 'owner'

/** The owner as the database holds them. */
export interface OfficeOwnerRow {
  id: string
  /** The name given, or null while the mark says `unnamed`. */
  name: string | null
  mark: OfficeOwnerMark
}

/** The two settings, as the installer gave them. Each is null when not set. */
export interface OwnerSettings {
  id: string | null
  name: string | null
}

/** Read MOLE_OFFICE_OWNER_ID and MOLE_OFFICE_OWNER_NAME from the environment and .env, through the one reader. */
export function theOwnerSettings(): OwnerSettings {
  return { id: setOrNull(settingValue('MOLE_OFFICE_OWNER_ID')), name: setOrNull(settingValue('MOLE_OFFICE_OWNER_NAME')) }
}

/** An empty value means the same as not set (the settings' own `emptyMeans` says so): null. */
function setOrNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value
}

function hasColumn(sqlite: Database.Database): boolean {
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('people')").all() as { name: string }[]
  return columns.some((one) => one.name === 'office_owner')
}

function hasTable(sqlite: Database.Database, table: string): boolean {
  return sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

/**
 * The owner, or null when no row carries the mark (a database migrated before the owner migration's step ran, or
 * none at all). A word in the column that is not one of the three stops with a sentence.
 */
export function readTheOfficeOwner(sqlite: Database.Database): OfficeOwnerRow | null {
  if (!hasTable(sqlite, 'people') || !hasColumn(sqlite)) return null
  const row = sqlite.prepare('SELECT id, name, office_owner AS mark FROM people WHERE office_owner IS NOT NULL').get() as
    | { id: string; name: string; mark: string }
    | undefined
  if (row === undefined) return null
  if (!(OFFICE_OWNER_MARKS as readonly string[]).includes(row.mark)) {
    throw new Error(
      `The person ${JSON.stringify(row.id)} is marked as this office's owner with ${JSON.stringify(row.mark)}, which is not ` +
        `one of ${OFFICE_OWNER_MARKS.join(', ')}. Nothing was read as the owner.`,
    )
  }
  const mark = row.mark as OfficeOwnerMark
  return { id: row.id, name: mark === 'unnamed' ? null : row.name, mark }
}

/** Whether the database already holds anybody's work: a record, or a person. */
function holdsWork(sqlite: Database.Database): boolean {
  const records = hasTable(sqlite, 'records') && sqlite.prepare('SELECT 1 FROM records LIMIT 1').get() !== undefined
  const people = hasTable(sqlite, 'people') && sqlite.prepare('SELECT 1 FROM people LIMIT 1').get() !== undefined
  return records || people
}

function peopleIn(sqlite: Database.Database): string[] {
  if (!hasTable(sqlite, 'people')) return []
  return (sqlite.prepare('SELECT id FROM people ORDER BY id').all() as { id: string }[]).map((one) => one.id)
}

/** The two lines to add, said the same way in every refusal. */
const ADD_THE_TWO =
  'Add MOLE_OFFICE_OWNER_ID (the id of the person who owns this office) and MOLE_OFFICE_OWNER_NAME (their name) ' +
  'to .env, then run the migrate again.'

/** Why an id or a name from the installer cannot be used, or null when it can. */
function whySettingsAreRefused(settings: OwnerSettings): string | null {
  if (settings.id !== null) {
    const why = whyHandleIsRefused(settings.id)
    if (why !== null) return `MOLE_OFFICE_OWNER_ID is ${JSON.stringify(settings.id)}, and an owner's id is a handle: ${why}`
  }
  if (settings.name !== null) {
    const name = settings.name.trim()
    if (name.length < OWNER_NAME_LIMITS.shortest || name.length > OWNER_NAME_LIMITS.longest) {
      return `MOLE_OFFICE_OWNER_NAME must be ${String(OWNER_NAME_LIMITS.shortest)} to ${String(OWNER_NAME_LIMITS.longest)} characters after trimming.`
    }
  }
  return null
}

/** What `settleTheOfficeOwner` found or would do, before it writes anything. */
type OwnerPlan =
  | { kind: 'already'; owner: OfficeOwnerRow }
  | { kind: 'mark-existing'; id: string; mark: OfficeOwnerMark }
  | { kind: 'write-new'; id: string; name: string; mark: OfficeOwnerMark }
  | { kind: 'refuse'; why: string }

function planTheOwner(sqlite: Database.Database, settings: OwnerSettings): OwnerPlan {
  const refused = whySettingsAreRefused(settings)
  if (refused !== null) return { kind: 'refuse', why: `${refused} Nothing was written.` }
  const owner = readTheOfficeOwner(sqlite)
  if (owner !== null) {
    if (settings.id !== null && settings.id !== owner.id) {
      return {
        kind: 'refuse',
        why:
          `MOLE_OFFICE_OWNER_ID is ${JSON.stringify(settings.id)}, and this office's owner is ${JSON.stringify(owner.id)}. ` +
          'The owner of an office is written once, at its first migrate, and this setting does not change it. ' +
          `Set MOLE_OFFICE_OWNER_ID to ${JSON.stringify(owner.id)} or take the line out. Nothing was changed.`,
      }
    }
    return { kind: 'already', owner }
  }
  if (!holdsWork(sqlite)) {
    const id = settings.id ?? THE_OWNER_ID_WHEN_NOTHING_SAID
    if (settings.name === null) return { kind: 'write-new', id, name: THE_OWNER_PLACEHOLDER.en, mark: 'unnamed' }
    return { kind: 'write-new', id, name: settings.name.trim(), mark: 'named-by-the-installer' }
  }
  if (settings.id === null || settings.name === null) {
    const missing = [settings.id === null ? 'MOLE_OFFICE_OWNER_ID' : null, settings.name === null ? 'MOLE_OFFICE_OWNER_NAME' : null]
      .filter((one) => one !== null)
      .join(' and ')
    return {
      kind: 'refuse',
      why:
        'This office already holds work and does not say who owns it, and Mole Office will not choose an owner for ' +
        `somebody's work by itself. ${missing} ${missing.includes(' and ') ? 'are' : 'is'} not set. ${ADD_THE_TWO} ` +
        'Nothing was changed.',
    }
  }
  const people = peopleIn(sqlite)
  // RECORDS AND NOBODY REGISTERED: an office from before people had rows (migration 0114). Its records
  // were filed under an id the installer now names, so the owner's row is written with both settings.
  if (people.length === 0) return { kind: 'write-new', id: settings.id, name: settings.name.trim(), mark: 'named-by-the-installer' }
  if (!people.includes(settings.id)) {
    return {
      kind: 'refuse',
      why:
        `MOLE_OFFICE_OWNER_ID is ${JSON.stringify(settings.id)}, and no person in this office has that id` +
        (people.length === 0 ? '; it holds no person at all.' : `; the people it holds are ${people.join(', ')}.`) +
        ' An office that already holds work is given to a person it already has. Nothing was changed.',
    }
  }
  const held = sqlite.prepare('SELECT name FROM people WHERE id = ?').get(settings.id) as { name: string }
  if (held.name !== settings.name.trim()) {
    return {
      kind: 'refuse',
      why:
        `MOLE_OFFICE_OWNER_NAME is ${JSON.stringify(settings.name.trim())}, and the person ${JSON.stringify(settings.id)} is ` +
        `already called ${JSON.stringify(held.name)} in this office. The first migrate writes who the owner is and does ` +
        `not rename them. Set MOLE_OFFICE_OWNER_NAME to ${JSON.stringify(held.name)}. Nothing was changed.`,
    }
  }
  return { kind: 'mark-existing', id: settings.id, mark: 'named-by-the-installer' }
}

/**
 * STOP BEFORE ANYTHING CHANGES when this office would be refused an owner. Called by `migrateInPlace`
 * before the SQL migrations run. It writes nothing.
 */
export function refuseAnOfficeWithNoOwnerToWrite(sqlite: Database.Database, settings: OwnerSettings = theOwnerSettings()): void {
  const plan = planTheOwner(sqlite, settings)
  if (plan.kind === 'refuse') throw new Error(plan.why)
}

/** What the owner step did, for the migrate's report. */
export interface OwnerSettled {
  owner: OfficeOwnerRow
  /** `written` when this run wrote the owner's row, `marked` when it marked a person already here, `kept` when nothing changed. */
  did: 'written' | 'marked' | 'kept'
}

/**
 * Write the owner at the first migrate, or check it on every later one. Returns what was done, or
 * null when the migrations run so far have not made the column yet. It throws a sentence, and writes
 * nothing, in every case the file header says is refused.
 *
 * `writeRow` is the participants step's own writer of a person row with its generated picture, so
 * the owner's row is made exactly the way it always was.
 */
export function settleTheOfficeOwner(
  sqlite: Database.Database,
  writeRow: (id: string, name: string) => void,
  settings: OwnerSettings = theOwnerSettings(),
): OwnerSettled | null {
  // THE MIGRATIONS THIS RUN WAS GIVEN STOP BEFORE THE OWNER MIGRATION, so there is no column to write
  // the owner into yet: a test that migrates to an earlier point, or a folder that is not the whole of
  // drizzle/. Nothing is written, and the report says so.
  if (!hasColumn(sqlite)) return null
  const plan = planTheOwner(sqlite, settings)
  switch (plan.kind) {
    case 'refuse':
      throw new Error(plan.why)
    case 'already':
      return { owner: plan.owner, did: 'kept' }
    case 'mark-existing':
      sqlite.prepare('UPDATE people SET office_owner = ? WHERE id = ?').run(plan.mark, plan.id)
      return { owner: readTheOfficeOwner(sqlite) as OfficeOwnerRow, did: 'marked' }
    case 'write-new':
      writeRow(plan.id, plan.name)
      sqlite.prepare('UPDATE people SET office_owner = ? WHERE id = ?').run(plan.mark, plan.id)
      return { owner: readTheOfficeOwner(sqlite) as OfficeOwnerRow, did: 'written' }
  }
}

/** The owner's line in the migrate's report. */
export function describeTheOwner(settled: OwnerSettled): string {
  const who = settled.owner.name === null
    ? `${JSON.stringify(settled.owner.id)}, with no name given yet: the person gives it at ${THE_GUIDE_ADDRESS}`
    : `${JSON.stringify(settled.owner.id)}, named ${JSON.stringify(settled.owner.name)}`
  if (settled.did === 'written') return `The owner of this office was written: ${who}.`
  if (settled.did === 'marked') return `The person ${who} was marked as the owner of this office. No other row changed.`
  return `The owner of this office is ${who}.`
}
