// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `isReplaced` was moved byte for byte out of src/server/lib/flows.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql } from 'drizzle-orm'
import { records } from './schema.ts'

/**
 * WHETHER A LIVE FLOW SUPERSEDES THIS ONE (wave 13p round 40). A flow superseded only by a deleted flow is current. The
 * link may be filed in either end's project, so it is found by its ends and not by its project. The office's writer of
 * flow runs reads it too, to name the flow a run's start fits (src/server/lib/flow-runs.ts).
 */
export const isReplaced = sql`EXISTS (SELECT 1 FROM links l JOIN records n ON n.id = l.from_id
  WHERE l.to_id = ${records.id} AND l.type = 'supersedes' AND n.kind = 'flow' AND n.deleted_at IS NULL)`
