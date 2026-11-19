// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `isRetired` was moved byte for byte out of src/server/lib/flows.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql } from 'drizzle-orm'
import { records } from './schema.ts'

/**
 * Whether a flow carries a retired mark, `retired` (wave 13p round 40b): no flow replaced it, and it is not followed.
 * `IS`, not `=`: json_type is NULL when the key is absent, and `NOT (replaced OR NULL)` would leave out every flow.
 */
export const isRetired = sql`(json_valid(${records.data}) AND json_type(${records.data}, '$.retired') IS 'object')`
