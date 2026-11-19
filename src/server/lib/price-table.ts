// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READER AND THE ONE WRITER OF THE PRICE TABLE IN FORCE. Criterion U3.
 *
 * -----------------------------------------------------------------------------------------
 * WHAT THIS IS
 * -----------------------------------------------------------------------------------------
 *
 * The price table's shape and the sentence for "nobody has set one" are declared once in
 * `src/shared/price-table.ts`. This file is the one place in the server that reads and writes
 * what is in force. The store is the singleton row `price_table`, in the shape
 * `preview_root_additions` uses. No row means nobody has set a table.
 *
 * -----------------------------------------------------------------------------------------
 * WHO READS IT
 * -----------------------------------------------------------------------------------------
 *
 * `receiptsFromRuns` in `src/server/lib/usage-receipts.ts` calls `priceTableInForce` and works
 * out the estimate per group and overall. `GET /api/usage/agents`, the citizen's page, a record's
 * "what this cost" panel and start-cost all reach it through that one summation. Nothing is
 * cached: every call reads the row.
 *
 * -----------------------------------------------------------------------------------------
 * A ROW THAT CANNOT BE READ IS NOT "NONE"
 * -----------------------------------------------------------------------------------------
 *
 * The writer only stores a table `readPriceTable` accepted, so a row that fails the same check
 * later is a broken assumption. It throws and names the table. Reading it as "none" would hide a
 * table the person set behind the sentence saying nobody set one.
 */
import { readPriceTable, type PriceTable, type PriceTableReading } from '../../shared/price-table.ts'
import { underTheRaise } from '../../shared/renamed-words.ts'
import { nowStamp } from '../../shared/time.ts'
import { sqlite } from '../db/client.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** The table in force, and who set it and when. All three are null when there is no row. */
export interface ThePriceTableAsStored {
  reading: PriceTableReading
  setAt: string | null
  /** The kind and id the write was stamped with, exactly as stored. */
  setBy: { kind: string; id: string } | null
  /** The grant a write made in the owner's name carried, or null when the owner made it themselves. */
  authority: string | null
}

/** The row, read fresh, or the honest absence. Throws, naming the table, when it cannot be read. */
export function thePriceTableAsStored(): ThePriceTableAsStored {
  const held = sqlite
    .prepare('SELECT settings, updated_at, updated_by_kind, updated_by_id, authority FROM price_table WHERE only_row = 1')
    .get() as
    | { settings: string; updated_at: string; updated_by_kind: string; updated_by_id: string; authority: string | null }
    | undefined
  if (held === undefined) return { reading: readPriceTable(undefined), setAt: null, setBy: null, authority: null }
  let reading: PriceTableReading
  try {
    reading = readPriceTable(JSON.parse(held.settings))
  } catch (err) {
    throw new Error(
      `The price table stored in the price_table row cannot be read: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (reading.state !== 'set') throw new Error('The price_table row holds no table, and a row is only written with one.')
  return {
    reading,
    setAt: held.updated_at,
    setBy: { kind: held.updated_by_kind, id: held.updated_by_id },
    authority: held.authority,
  }
}

/** WHAT PRICE TABLE IS IN FORCE: the stored one, or `none` when nobody has set one. */
export function priceTableInForce(): PriceTableReading {
  return thePriceTableAsStored().reading
}

/**
 * SET THE PRICE TABLE, replacing any table set before.
 *
 * The table is checked with `readPriceTable` BEFORE anything is written, so a refused table leaves
 * the row exactly as it was. What is stored is what the check kept, so the reply shows back what
 * the office made of the person's input.
 */
export function setThePriceTable(table: unknown, who: Actor): ThePriceTableAsStored {
  let reading: PriceTableReading
  try {
    reading = readPriceTable(table)
  } catch (err) {
    throw new PanelError(`${err instanceof Error ? err.message : String(err)} Nothing was written.`, 400)
  }
  if (reading.state !== 'set') {
    throw new PanelError('No table was sent. To remove the price table, clear it. Nothing was written.', 400)
  }
  const stored: PriceTable = reading.table
  const authority =
    who.theOwnersAuthority?.holds === true
      ? who.theOwnersAuthority.because
      // OR THEIR RAISE, named by its grant: the row then says what allowed the write, as every
      // other write under a raise does on its ledger row.
      : who.elevationUsed === true && who.elevation !== undefined
        ? underTheRaise(who.elevation.id)
        : null
  sqlite
    .prepare(
      'INSERT INTO price_table (only_row, settings, updated_at, updated_by_kind, updated_by_id, authority) ' +
        'VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(only_row) DO UPDATE SET settings=excluded.settings, ' +
        'updated_at=excluded.updated_at, updated_by_kind=excluded.updated_by_kind, updated_by_id=excluded.updated_by_id, ' +
        'authority=excluded.authority',
    )
    .run(JSON.stringify(stored), nowStamp(), who.type, who.id, authority)
  return thePriceTableAsStored()
}

/**
 * REMOVE THE PRICE TABLE, so the reading is `none` again. Removing an absent table changes nothing.
 * The row goes, so nothing afterwards says who removed it.
 */
export function clearThePriceTable(): ThePriceTableAsStored {
  sqlite.prepare('DELETE FROM price_table WHERE only_row = 1').run()
  return thePriceTableAsStored()
}

/** What `GET /api/office/price-table` answers: the table as stored, and what a reader needs beside it. */
export interface WhatThePriceTableDoorSays extends ThePriceTableAsStored {
  /** The unit sentence, so no reader works out the unit for itself. */
  unit: string
  /** The sentence saying nobody has set a table, or null when one is set. */
  says: string | null
  /** Why this caller may not change the table, in the words the write door refuses with, or null when it may. */
  refusal: string | null
}
