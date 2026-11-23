// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH PIPELINES STAND STILL: THE ONE PLACE THIS IS WORKED OUT. Wave 13s round 281, point HD-2e of home as a data
 * dashboard. A pipeline stands still when it has a step that is not done, and every step of it that is not done is
 * paused. Home's Late or stuck draws them, through the door in src/server/api/pipelines-standing-still.ts, and the
 * answer's shape is src/shared/pipelines-standing-still.ts.
 *
 * ONE STATEMENT, AND ONLY THE ROWS HOME DRAWS. It reads the project's live pipelines and the live steps they name, each
 * step by its id, and hands the server at most as many pipelines as Late or stuck draws, with how many stand still in
 * all. No step row and no other pipeline comes back (decision OQR0WDVq0FkP).
 *
 * EACH VALUE IS READ AS src/shared/blocks.ts READS IT FOR A PIPELINE'S STEPS:
 * - A step is named by an entry of the pipeline's blockIds list that is text, trimmed and not empty. A step named twice
 *   is one step.
 * - A step is a live block of the same project.
 * - A step's state is text and, trimmed, one of the item states by its own name. A step in any other state is not read.
 * - A step is paused when its pause holds a since and a why that are text and not empty once trimmed, as readPause in
 *   src/shared/work.ts reads them.
 * Every trim takes off what JavaScript's trim() takes off.
 *
 * A LABEL WRITTEN TWICE IN ONE OBJECT may not be read here as JSON.parse reads it, and nothing is built for it. The
 * office writes data with JSON.stringify, which never writes one.
 */
import { HOME_ALARMS_SHOWN } from '@shared/attention-first-page.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import { WHAT_TRIM_TAKES_OFF, type PipelinesStandingStill } from '@shared/pipelines-standing-still.ts'
import { ITEM_STATES } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'

const PIPELINE_KIND = 'pipeline'
const DONE = 'done'

/**
 * A STEP'S PAUSE IS 0 OR 1, NEVER NULL. Each half of the pause test starts with json_type(...) IS 'text', which is never
 * NULL, so a step with no pause reads as 0. min() below passes over a NULL, so a pipeline with a step that is not
 * paused would then stand still.
 */
const STATEMENT =
  'WITH entries AS (' +
  ' SELECT DISTINCT p.id AS pipeline, trim(e.value, ?) AS step' +
  " FROM records p, json_each(p.data, '$.blockIds') e" +
  ' WHERE p.kind = ? AND p.workspace_id = ? AND p.deleted_at IS NULL' +
  " AND json_type(p.data, '$.blockIds') = 'array' AND e.type = 'text' AND trim(e.value, ?) <> ''" +
  '), steps AS (' +
  " SELECT x.pipeline, trim(json_extract(b.data, '$.state'), ?) AS state," +
  " (json_type(b.data, '$.paused.since') IS 'text' AND trim(json_extract(b.data, '$.paused.since'), ?) <> ''" +
  " AND json_type(b.data, '$.paused.why') IS 'text' AND trim(json_extract(b.data, '$.paused.why'), ?) <> '') AS paused" +
  ' FROM entries x JOIN records b ON b.id = x.step' +
  " WHERE b.kind = ? AND b.workspace_id = ? AND b.deleted_at IS NULL AND json_type(b.data, '$.state') = 'text'" +
  " AND trim(json_extract(b.data, '$.state'), ?) IN (SELECT value FROM json_each(?))" +
  '), still AS (' +
  ' SELECT pipeline, count(*) AS unfinished FROM steps WHERE state <> ? GROUP BY pipeline HAVING min(paused) = 1' +
  ')' +
  ' SELECT p.id, p.title, p.workspace_id AS workspaceId, s.unfinished, count(*) OVER () AS total' +
  ' FROM still s JOIN records p ON p.id = s.pipeline' +
  ' ORDER BY p.updated_at DESC, p.id ASC LIMIT ?'

/** A row as the statement hands it back. */
interface AStillRow {
  id: string
  title: string
  workspaceId: string
  unfinished: number
  total: number
}

/**
 * The project's pipelines that stand still: at most as many as Late or stuck draws, newest first and then by id, as
 * the records list orders them, and how many there are in all.
 */
export function thePipelinesStandingStill(workspaceId: string): PipelinesStandingStill {
  const rows = sqlite
    .prepare(STATEMENT)
    .all(
      WHAT_TRIM_TAKES_OFF,
      PIPELINE_KIND,
      workspaceId,
      WHAT_TRIM_TAKES_OFF,
      WHAT_TRIM_TAKES_OFF,
      WHAT_TRIM_TAKES_OFF,
      WHAT_TRIM_TAKES_OFF,
      BLOCK_KIND,
      workspaceId,
      WHAT_TRIM_TAKES_OFF,
      JSON.stringify(ITEM_STATES),
      DONE,
      HOME_ALARMS_SHOWN,
    ) as AStillRow[]
  return {
    rows: rows.map(({ id, title, workspaceId: project, unfinished }) => ({ id, title, workspaceId: project, unfinished })),
    total: rows[0]?.total ?? 0,
  }
}
