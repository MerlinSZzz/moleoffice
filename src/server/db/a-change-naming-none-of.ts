// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `aChangeNamingNoneOf` was moved byte for byte out of src/server/lib/records/change-log.ts, with no change of behaviour.
 * `THE_HONOUR_KEY` was moved byte for byte out of src/server/lib/records/change-log.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql, type SQL } from 'drizzle-orm'
import { changes } from './schema.ts'

/**
 * A CHANGE ROW THAT NAMES NONE OF THESE MESSAGES: not as the record it is about, and not as the value it
 * logged, which is where a link row keeps the record at its other end. Undefined when there are none.
 * One bound value holds the whole list, so a long list does not run into SQLite's limit.
 */
export function aChangeNamingNoneOf(hidden: readonly string[] | undefined): SQL | undefined {
  if (hidden === undefined || hidden.length === 0) return undefined
  const list = JSON.stringify(hidden)
  // A RUN'S HONOUR READING NAMES RECORDS INSIDE ITS VALUE: each signal's evidence is a list of record ids,
  // so a row logged under `data.honour` holds them as strings inside a JSON value, and it names such a
  // message too. Only those rows are opened, and each string inside them is looked up among the hidden
  // messages. Searching each row's text for each hidden id instead took the change log from 0.3 seconds
  // to 0.8 for an agent, on a copy of the office's data with about 10,000 messages. The other doors that
  // hand a honour reading back take the ids out of it instead (`theHonourThisReaderMaySee` in lib/honour.ts).
  const honour = `data.${THE_HONOUR_KEY}%`
  return sql`(${changes.recordId} NOT IN (SELECT value FROM json_each(${list})) AND coalesce(${changes.oldValue}, '') NOT IN (SELECT value FROM json_each(${list})) AND coalesce(${changes.newValue}, '') NOT IN (SELECT value FROM json_each(${list})) AND (coalesce(${changes.field}, '') NOT LIKE ${honour} OR NOT EXISTS (SELECT 1 FROM json_tree(CASE WHEN json_valid(${changes.oldValue}) THEN ${changes.oldValue} ELSE '[]' END) AS one WHERE one.type = 'text' AND one.atom IN (SELECT value FROM json_each(${list})) UNION ALL SELECT 1 FROM json_tree(CASE WHEN json_valid(${changes.newValue}) THEN ${changes.newValue} ELSE '[]' END) AS one WHERE one.type = 'text' AND one.atom IN (SELECT value FROM json_each(${list})))))`
}
/** Where a run's honour reading is kept on its session record, `data.honour`. Read by lib/honour.ts, which writes it. */
export const THE_HONOUR_KEY = 'honour'
