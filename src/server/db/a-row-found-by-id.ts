// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql, type SQL } from 'drizzle-orm'
import { records } from './schema.ts'

/**
 * THE KIND OF A ROW ALREADY FOUND BY ITS ID, ASKED SO THAT SQLITE DOES NOT LOOK THE KIND UP IN AN INDEX. Asked with
 * `eq`, the kind led SQLite to read every row of that kind through `records_kind_idx` and test each id against the
 * list, rather than find the few ids through the primary key: 5.5 ms for 50 messages among 12,500, and 0.06 ms
 * with this (wave 13y round 13). The unary plus keeps the same test and takes the column out of every index.
 */
export const theKindOfARowFoundById = (kind: string): SQL => sql`+${records.kind} = ${kind}`

/**
 * THE PROJECT OF A ROW ALREADY FOUND BY ITS ID, asked so that SQLITE DOES NOT LOOK THE PROJECT UP IN AN INDEX either.
 * With the kind asked as above and the project asked with `eq`, SQLite read every live record of the project through
 * `records_live_idx` instead of the kind's index: 16 ms for 157 runs among 15,945 live records, and 0.40 ms with both
 * asked this way (wave 13y round 35). A read that asks both needs both.
 */
export const theProjectOfARowFoundById = (workspaceId: string): SQL => sql`+${records.workspaceId} = ${workspaceId}`
