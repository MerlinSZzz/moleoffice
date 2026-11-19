// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A TABLE IN A SCHEMA PART SAYS ABOUT ITSELF, and the one place those sayings are read.
 *
 * A table declared in a file under schema-parts/ is wrapped in `aPartTable`, beside its declaration,
 * with two answers: whether an archive carries it, and what the restore proof does with it. That is
 * one of three: it compares the table, it counts the table as a loss a restore is allowed, with why
 * and how to put it back, or it leaves the table out, with why. lib/export.ts and
 * scripts/restore-check.ts read those answers through `everyPartTable()` in every-part-table.ts, so a line that
 * adds a table changes neither file. The tables declared in schema.ts itself are not read here; their
 * lists at the foot of schema.ts, and in the two files, stay as they are. A moved table can say
 * `existingArchive: true` when that exact table is already in the authored registry; its existing
 * pages, order, scope and fixed restore proof remain in charge, so it is not a generic part region.
 * Existing measured tables likewise keep their exclusion through `existingMeasured: true`.
 *
 * A TABLE THAT SAYS NOTHING IS REFUSED, BY NAME. It is not exported by default and not left out of
 * the proof by default: `thePartTables` throws a sentence naming the table and each answer it is
 * missing, and both files read the parts when they load, so neither can run with such a table.
 *
 * NOTHING HERE MAY IMPORT schema.ts. Every part file imports this one, and schema.ts imports every
 * part file, so an import back would be a cycle that runs before either side holds a value.
 */

import { getTableColumns, getTableName, is } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'

/**
 * Writes at least one row into the proof's corpus through the product's own writer, and says in a
 * sentence what it wrote. A table with no row proves nothing, so the proof fails when this writes no
 * row. Import the writer inside the function, never at the top of the part file: a part file is read
 * by processes that must not open the database. A writer above the database folder gives its fill
 * instead, through `theFillGivenBy` below.
 */
type FillForTheProof = () => Promise<string>

/**
 * A FILL GIVEN FROM ABOVE. An import from a part up to a file outside src/server/db, even inside the
 * fill, puts this folder inside the server's import cycle. So a part whose fill needs such a file
 * says `fillForTheProof: theFillGivenBy('<that file>')`, and that file calls `giveTheFill` with the
 * same path when it loads. The proof loads the file before it fills. The fills are kept under a symbol
 * every copy of this module shares, for the reason `WHAT_IT_SAYS` below is.
 */
const FILLS_GIVEN_FROM_ABOVE = Symbol.for('mole-office: the restore proof fills given from above the database folder')

function fillsGivenFromAbove(): Map<string, FillForTheProof> {
  const shared = globalThis as unknown as Record<symbol, Map<string, FillForTheProof> | undefined>
  return (shared[FILLS_GIVEN_FROM_ABOVE] ??= new Map())
}

/** Give the fill of every part that names `file`. Called by that file when it loads; a later copy of it replaces the fill. */
export function giveTheFill(file: string, fill: FillForTheProof): void {
  fillsGivenFromAbove().set(file, fill)
}

/** The fill `file` gives. Asked before that file has loaded, it fails and names the file. */
export function theFillGivenBy(file: string): FillForTheProof {
  return async () => {
    const fill = fillsGivenFromAbove().get(file)
    if (fill === undefined) {
      throw new Error(
        `The restore proof asked for the fill ${file} gives, and ${file} has not been loaded, so no fill was given. ` +
          'Load it before the proof fills the part tables.',
      )
    }
    return fill()
  }
}

/**
 * Only for a table an archive carries and that has no `workspaceId` column: why a row of it belongs
 * to no project, in a sentence a project's archive prints where these rows would have been. Write it
 * with no full stop at the end, as `WHY_NO_PROJECT` in why-no-project.ts does; the archive puts its own after it.
 */
type NoProjectBecause = string

/** The three things the restore proof can do with a part table. */
export const WHAT_THE_RESTORE_PROOF_DOES = ['compared', 'may be lost', 'not in this proof'] as const

/** The two answers a part table gives, beside its declaration. */
export type WhatAnArchiveAndARestoreDo =
  | {
      /** An archive carries every row of it, and an import writes them back. */
      readonly exported: true
      /**
       * scripts/restore-check.ts exports the table, deletes the database, imports the archive and
       * compares every row and every column of the table, as stored.
       */
      readonly restore: 'compared'
      readonly fillForTheProof: FillForTheProof
      readonly noProjectBecause?: NoProjectBecause
    }
  | {
      /** No archive carries it, and an import writes none of it. */
      readonly exported: false
      /**
       * A restore brings none of it back, and that is allowed. It is one of the restore proof's
       * `DECLARED_LOSSES`: the proof fills the table, and fails when the loss stops happening.
       */
      readonly restore: 'may be lost'
      /** Why a restore may lose it, in a sentence or more with its own full stop. */
      readonly why: string
      /** What a person does to put it back after a restore, or why nothing can. */
      readonly repair: string
      readonly fillForTheProof: FillForTheProof
    }
  | {
      /** Whether an archive carries it. An archive that does carries every row, and an import writes them back. */
      readonly exported: boolean
      /**
       * The restore proof neither fills nor compares it. It is on the proof's `NOT_IN_THIS_PROOF`, which
       * is only for a table nothing under src/ writes: tests/restore-check.test.ts fails the day a
       * file under src/ writes it, naming the file.
       */
      readonly restore: 'not in this proof'
      /** Why nothing can put a row in it, in a sentence or more with its own full stop. */
      readonly why: string
      /** As above, for a table an archive carries. */
      readonly noProjectBecause?: NoProjectBecause
    }

/** An existing authored archive and its fixed restore proof already handle this exact table. */
export type ExistingArchive = { readonly existingArchive: true }

/** A table the existing derived list already classifies; it has no archive region. */
export type ExistingDerived = { readonly existingDerived: true }

/** A table the existing measured list excludes from archives and restore proofs. */
export type ExistingMeasured = { readonly existingMeasured: true }

/** One table a schema part declares, with what it says about itself. */
export interface PartTable {
  /** The SQL table name. */
  readonly name: string
  /** The name the part exports it under. */
  readonly binding: string
  /** Where it was found, for a sentence that names it. */
  readonly part: string
  readonly table: SQLiteTable
  readonly says: WhatAnArchiveAndARestoreDo
  /**
   * The SQL column that says which project a row is in, or null when the table belongs to no
   * project. Read off a `workspaceId` column, by the rule `WORKSPACE_COLUMN` in schema.ts uses.
   */
  readonly workspaceColumn: string | null
}

/**
 * Where the answers are kept: on the table object itself, under a symbol every copy of this module
 * shares. A test that resets its modules gets a second copy of this file, and the answers must still
 * be found on a table the first copy wrapped.
 */
const WHAT_IT_SAYS = Symbol.for('mole-office: what an archive and a restore do with a schema part table')

/** Declare a schema part's table with its two answers. Returns the same table. */
export function aPartTable<T extends SQLiteTable>(table: T, says: WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured): T {
  if (Object.hasOwn(table, WHAT_IT_SAYS)) {
    throw new Error(
      `The table "${getTableName(table)}" is given its export and restore answers twice. Wrap it in aPartTable once, ` +
        'beside its declaration.',
    )
  }
  Object.defineProperty(table, WHAT_IT_SAYS, { value: says, enumerable: false })
  return table
}

function whatItSays(table: SQLiteTable): WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured | undefined {
  return (table as unknown as Record<symbol, WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured | undefined>)[WHAT_IT_SAYS]
}

function usesExistingArchive(says: WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured): says is ExistingArchive {
  return 'existingArchive' in says && says.existingArchive === true
}

function usesExistingDerived(says: WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured): says is ExistingDerived {
  return 'existingDerived' in says && says.existingDerived === true
}

function usesExistingMeasured(says: WhatAnArchiveAndARestoreDo | ExistingArchive | ExistingDerived | ExistingMeasured): says is ExistingMeasured {
  return 'existingMeasured' in says && says.existingMeasured === true
}

/** The two answers, as a sentence that says how to write them. */
const THE_TWO_ANSWERS =
  "exported: true or false, and restore: 'compared', 'may be lost' with a why and a repair, or 'not in this proof' with a why"

/** Each answer a declaration lacks, as the words a refusal names it with. Empty when it lacks none. */
function whatTheDeclarationLacks(says: Readonly<Record<string, unknown>>): string[] {
  const lacks: string[] = []
  if (typeof says['exported'] !== 'boolean') lacks.push('exported, which says whether an archive carries it (true or false)')
  const restore = says['restore']
  if (!(WHAT_THE_RESTORE_PROOF_DOES as readonly unknown[]).includes(restore)) {
    lacks.push("restore, which says what the restore proof does with it ('compared', 'may be lost' or 'not in this proof')")
  }
  const said = (key: string): boolean => {
    const value = says[key]
    return typeof value === 'string' && value.trim() !== ''
  }
  if (restore === 'may be lost' && !said('why')) lacks.push('why, which says why a restore may lose it')
  if (restore === 'may be lost' && !said('repair')) lacks.push('repair, which says how to put it back after a restore, or why nothing can')
  if (restore === 'not in this proof' && !said('why')) lacks.push('why, which says why nothing can put a row in it')
  if ((restore === 'compared' || restore === 'may be lost') && typeof says['fillForTheProof'] !== 'function') {
    lacks.push('fillForTheProof, which writes the rows the restore proof needs')
  }
  return lacks
}

/**
 * Every table the parts declare, or one refusal naming every problem found.
 *
 * `parts` maps where each part is to what it exports. `namesTaken` are the table names schema.ts and
 * the migrations already use. It refuses:
 *   - a part table with no answers from `aPartTable`, naming both answers it is missing;
 *   - a part table whose answers lack one this file asks for, naming each one it lacks;
 *   - a table no archive carries that says the restore proof compares it, and a table an archive
 *     carries that says a restore may lose it;
 *   - one table name declared twice, by two parts or by a part and schema.ts;
 *   - a table an archive carries that has no `workspaceId` column and says no `noProjectBecause`, or
 *     has both.
 *
 * Existing-archive tables must match the authored registry by identity and are omitted from the
 * generic part result. A different table with the same name is refused.
 *
 * Existing measured tables must match the measured registry by identity and are omitted from the
 * generic part result. One table exported under two names is one table, and is counted once.
 */
export function thePartTables(
  parts: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  namesTaken: readonly string[],
  existingArchives: ReadonlyMap<string, SQLiteTable> = new Map(),
  existingDerived: ReadonlyMap<string, SQLiteTable> = new Map(),
  legacyDerivedNames: readonly string[] = [],
  existingMeasured: ReadonlyMap<string, SQLiteTable> = new Map(),
  measuredNames: readonly string[] = [],
): readonly PartTable[] {
  const found: PartTable[] = []
  const existing: { name: string; binding: string; part: string }[] = []
  const problems: string[] = []
  const seen = new Set<unknown>()
  for (const [part, exports] of parts) {
    for (const [binding, value] of Object.entries(exports)) {
      if (!is(value, SQLiteTable) || seen.has(value)) continue
      seen.add(value)
      const name = getTableName(value)
      const says = whatItSays(value)
      if (says === undefined) {
        problems.push(
          `\`${binding}\` in ${part} declares the table "${name}" and does not say what an archive and a restore do with ` +
            'it. Its declaration is missing exported, which says whether an archive carries it, and restore, which says ' +
            'what the restore proof does with it. It is not exported and not left out of the proof by default: ' +
            'src/server/lib/export.ts and scripts/restore-check.ts refuse to load until it says both. Wrap it in ' +
            `aPartTable from src/server/db/part-tables.ts, beside the table, with ${THE_TWO_ANSWERS}.`,
        )
        continue
      }
      if (usesExistingArchive(says) && usesExistingDerived(says)) {
        problems.push(`"${name}" (\`${binding}\` in ${part}) cannot be both authored and derived.`)
        continue
      }
      // A bridge is the whole answer, not a way to hide a second archive or restore answer.
      // Inspect property presence as well as value: callers from JavaScript can supply false here.
      const asItCame = says as unknown as Readonly<Record<string, unknown>>
      const hasArchiveBridge = 'existingArchive' in asItCame
      const hasDerivedBridge = 'existingDerived' in asItCame
      const hasMeasuredBridge = 'existingMeasured' in asItCame
      const hasGenericAnswer = ['exported', 'restore', 'fillForTheProof', 'noProjectBecause', 'why', 'repair']
        .some((key) => key in asItCame)
      if ([hasArchiveBridge, hasDerivedBridge, hasMeasuredBridge].filter(Boolean).length > 1 || ((hasArchiveBridge || hasDerivedBridge || hasMeasuredBridge) && hasGenericAnswer)) {
        problems.push(`"${name}" (\`${binding}\` in ${part}) mixes a legacy bridge with another archive or restore answer.`)
        continue
      }
      // The original authored registry owns this archive's page, order, scope and restore proof.
      // Only the very same table object may use that path; a second declaration is not a move.
      if (usesExistingArchive(says)) {
        existing.push({ name, binding, part })
        if (namesTaken.filter((taken) => taken === name).length !== 1 || legacyDerivedNames.includes(name) || measuredNames.includes(name) || existingDerived.has(name) || existingMeasured.has(name) || existingArchives.get(name) !== value) {
          problems.push(`"${name}" (\`${binding}\` in ${part}) does not match an exclusively authored table in the existing archive.`)
        }
        continue
      }
      // The legacy derived list retains its classification and order, and owns no archive region.
      if (usesExistingDerived(says)) {
        existing.push({ name, binding, part })
        if (!legacyDerivedNames.includes(name) || measuredNames.includes(name) || namesTaken.filter((taken) => taken === name).length !== 1 || existingArchives.has(name) || existingMeasured.has(name) || existingDerived.get(name) !== value) {
          problems.push(`"${name}" (\`${binding}\` in ${part}) does not match an exclusively legacy-derived table.`)
        }
        continue
      }
      // The measured list owns this exclusion; it must remain the very same table object.
      if (usesExistingMeasured(says)) {
        existing.push({ name, binding, part })
        if (!measuredNames.includes(name) || legacyDerivedNames.includes(name) || namesTaken.filter((taken) => taken === name).length !== 1 || existingArchives.has(name) || existingDerived.has(name) || existingMeasured.get(name) !== value) {
          problems.push(`"${name}" (\`${binding}\` in ${part}) does not match an exclusively measured table in the existing list.`)
        }
        continue
      }
      // Read as it came, because a declaration reached through a cast or from JavaScript is not held to the type.
      const lacks = whatTheDeclarationLacks(asItCame)
      if (lacks.length > 0) {
        problems.push(
          `"${name}" (\`${binding}\` in ${part}) is wrapped in aPartTable, and its declaration is missing ` +
            `${lacks.join(', and ')}. src/server/lib/export.ts and scripts/restore-check.ts refuse to load until it says ` +
            `${lacks.length === 1 ? 'it' : 'them'}.`,
        )
        continue
      }
      if (asItCame['exported'] === false && asItCame['restore'] === 'compared') {
        problems.push(
          `"${name}" (\`${binding}\` in ${part}) says no archive carries it and that the restore proof compares it. A ` +
            "restore brings back only what an archive carries, so it cannot be both. Say exported: true, or restore: 'may " +
            "be lost' or 'not in this proof'.",
        )
        continue
      }
      if (asItCame['exported'] === true && asItCame['restore'] === 'may be lost') {
        problems.push(
          `"${name}" (\`${binding}\` in ${part}) says an archive carries it and that a restore may lose it. An import ` +
            "writes back every row an archive carries, so it cannot be both. Say exported: false, or restore: 'compared' " +
            "or 'not in this proof'.",
        )
        continue
      }
      const columns = getTableColumns(value) as Record<string, { name: string } | undefined>
      const workspaceColumn = columns['workspaceId']?.name ?? null
      if (says.exported) {
        const because = says.noProjectBecause?.trim() ?? ''
        if (workspaceColumn === null && because === '') {
          problems.push(
            `"${name}" (\`${binding}\` in ${part}) is carried by an archive and has no workspaceId column, so nothing says ` +
              "which project a row is in. Give it a workspaceId column, or say in noProjectBecause why a row of it " +
              'belongs to no project.',
          )
        }
        if (workspaceColumn !== null && because !== '') {
          problems.push(
            `"${name}" (\`${binding}\` in ${part}) has a workspaceId column and also says it belongs to no project. ` +
              'It cannot be both. Take out noProjectBecause, or the column.',
          )
        }
      }
      found.push({ name, binding, part, table: value, says, workspaceColumn })
    }
  }
  const byName = new Map<string, PartTable[]>()
  for (const table of found) byName.set(table.name, [...(byName.get(table.name) ?? []), table])
  for (const old of existing) {
    const same = existing.filter((table) => table.name === old.name).length + (byName.get(old.name)?.length ?? 0)
    if (same > 1) problems.push(`The table "${old.name}" is declared ${same} times, including \`${old.binding}\` in ${old.part}.`)
  }
  for (const [name, tables] of byName) {
    if (tables.length > 1) {
      problems.push(
        `The table "${name}" is declared ${tables.length} times: ${tables.map((t) => `as \`${t.binding}\` in ${t.part}`).join(', ')}. ` +
          'One name is one table in the database, so all but one must be renamed.',
      )
    }
    if (namesTaken.includes(name)) {
      problems.push(
        `The table "${name}" (${tables.map((t) => `\`${t.binding}\` in ${t.part}`).join(', ')}) has the name of a table ` +
          'schema.ts or a migration already has. One name is one table in the database, so the part table must be renamed.',
      )
    }
  }
  if (problems.length > 0) {
    throw new Error(`The schema parts cannot be read, so no table was taken from them. ${problems.join(' ')}`)
  }
  return found
}
