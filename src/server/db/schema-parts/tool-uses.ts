// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { ActorType } from '@shared/types.ts'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const


/**
 * ONE USE OF A TOOL, ONE ROW. Added by migration 0231, wave 13s round 33.
 *
 * Until this table a use was a line in `data.toolUses` on the calling run's record. Every use rewrote
 * the record, so every use wrote a revision holding the whole list again: 268,483,514 bytes of
 * revisions for one made-up run of 2,000 uses. Now the use door (`writeAUse` in
 * src/server/lib/toolset.ts) writes one use row here, with optional file results in test_file_runs:
 * no record write, no revision and no change row. The rows are append-only, so they are the history of the uses.
 *
 * NOT A RECORD, so an earlier decision still holds: a use never gets a record of its own.
 *
 * `seq` is the order of the use on its run, 1, 2, 3 …, and (run_id, seq) is unique, so two uses
 * cannot claim one place. A row the migration moved out of `data.toolUses` keeps its place in the
 * list as its `seq`, carries `moved_at`, and names no writer: the list did not record who wrote each
 * line, and the old change rows and revisions that do are kept as they are.
 */
export const toolUses = aPartTable(sqliteTable(
  'tool_uses',
  {
    /** nanoid, so one use can be cited. */
    id: text('id').primaryKey(),
    /** The project of the run it was written on. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** The session record of the run that used the tool. */
    runId: text('run_id').notNull(),
    /** Its place on that run, from 1, in the order the uses were written. */
    seq: integer('seq').notNull(),
    /** LOCAL wall clock, from the office's clock. No SQL default, for the reason `reader_anchors` gives. */
    at: text('at').notNull(),
    /** The slug of the tool used. */
    tool: text('tool').notNull(),
    /** What the use did, one line. */
    said: text('said').notNull(),
    /** `agent` or `person`, and the id: who wrote the use. NULL on a row the migration moved, because the list never said. */
    actorType: text('actor_type').$type<ActorType>(),
    actorId: text('actor_id'),
    /** When migration 0231's data step moved this line out of `data.toolUses`, LOCAL wall clock. NULL on a row the use door wrote. */
    movedAt: text('moved_at'),
    /**
     * What the use door found when it checked the line's proof that tools/use-line.mjs sent it, migration 0300:
     * `matches`, `none` or `does not match` (src/config/use-line-proof.mjs). NULL on a row written before the door checked.
     */
    proof: text('proof'),
    /**
     * The same moment as `at`, as an instant with its offset, from the same reading of the clock, migration 0358. NULL on
     * a row written before the migration and on a row moved out of a run's list, which are read from `at` as before.
     */
    atInstant: text('at_instant'),
  },
  (t) => [uniqueIndex('tool_uses_run_seq_idx').on(t.runId, t.seq)],
), existingArchive)
