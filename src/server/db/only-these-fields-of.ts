// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `onlyTheseFieldsOf` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql, type SQL } from 'drizzle-orm'
import { records } from './schema.ts'

/**
 * A RECORD'S `data` WITH ONLY THESE FIELDS KEPT, as SQL, for `listRecordsWithDataAs`.
 *
 * Each field keeps its value as stored: an object or a list stays one, and true, false and null stay
 * what they are. A field named in `listsAsTheirLength` that holds a list is kept as a list of the same
 * length, each entry replaced by null, for a reader that only counts it. A kept field named in
 * `objectsWithOnlyTheseParts` that holds an object is kept as an object with only the parts named for it,
 * each as stored. A field the record does not hold stays absent. A `data` that is not an object is kept
 * whole. The names are constants in the source, never words from a request.
 */
export function onlyTheseFieldsOf(
  fields: readonly string[],
  listsAsTheirLength: readonly string[] = [],
  objectsWithOnlyTheseParts: Readonly<Record<string, readonly string[]>> = {},
): SQL<string> {
  const names = (list: readonly string[]): SQL =>
    list.length === 0 ? sql`NULL` : sql.join(list.map((name) => sql.raw(`'${name.replaceAll("'", "''")}'`)), sql`, `)
  // A VALUE AS IT IS STORED, from one row of a `json_each`: `json` gives an object or a list back as one, not as its text.
  const asStored = (row: 'field' | 'part'): SQL => {
    const of = sql.raw(row)
    return sql`CASE ${of}.type
        WHEN 'object' THEN json(${of}.value) WHEN 'array' THEN json(${of}.value)
        WHEN 'true' THEN json('true') WHEN 'false' THEN json('false') WHEN 'null' THEN json('null')
        ELSE ${of}.value END`
  }
  const narrowed = Object.entries(objectsWithOnlyTheseParts).map(
    ([name, parts]) =>
      sql`WHEN field.key IN (${names([name])}) AND field.type = 'object' THEN json((SELECT json_group_object(part.key, ${asStored('part')}) FROM json_each(field.value) AS part WHERE part.key IN (${names(parts)})))`,
  )
  // `json_type` IS ASKED ONLY OF A DATA THAT DOES NOT BEGIN WITH "{". It parses the whole data, and the walk parses it
  // again: over every session record of the two large copies of an office, the expression took 44 to 48 ms with the
  // check asked of every record, and 33 to 36 ms this way (wave 13y round 34). JSON that begins with "{" is an object,
  // and a data that begins with "{" and is not JSON fails in the walk, as it failed in the check.
  return sql<string>`(CASE WHEN substr(${records.data}, 1, 1) = '{' OR json_type(${records.data}) = 'object' THEN (
      SELECT json_group_object(field.key, CASE
        WHEN field.key IN (${names(listsAsTheirLength)}) AND field.type = 'array' THEN (SELECT json_group_array(json('null')) FROM json_each(field.value))
        ${sql.join(narrowed, sql` `)}
        ELSE ${asStored('field')} END)
      FROM json_each(${records.data}) AS field WHERE field.key IN (${names(fields)})
    ) ELSE ${records.data} END)`
}
