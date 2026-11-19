// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLACE A RECORD WAS WRITTEN IN, AS SQL.
 * `theOrderWritten` was moved byte for byte out of src/server/lib/merge-queue.ts, with no change of
 * behaviour. That file re-exports it.
 */

/**
 * THE PLACE A RECORD WAS WRITTEN IN, as SQL for the record under `alias`: the `append_order` of its create row in the
 * change log (migration 0194). The queue orders its entries and pushes by it, and not by `created_at`. That column is
 * the office's local time in words, with no offset, and on the night the clocks go back the hour from 01:00 comes twice:
 * an entry written at 01:10 winter time sorts before one written twenty minutes earlier, at 01:50 summer time. The
 * records door writes every record and its create row in one transaction, and an import carries each row's place.
 *
 * `rowid` comes after it only to break a tie. It is not the order on its own, because every copy of the office starts
 * with VACUUM INTO, which may number a table's rows afresh. A record with no create row has no place, and
 * `eachHasAPlace` refuses to order it.
 */
export function theOrderWritten(alias: string): string {
  return `(SELECT changes.append_order FROM changes WHERE changes.record_id = ${alias}.id AND changes.op = 'create')`
}
