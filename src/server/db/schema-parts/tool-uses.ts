// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { ActorType } from '@shared/types.ts'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const


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
  },
  (t) => [uniqueIndex('tool_uses_run_seq_idx').on(t.runId, t.seq)],
), existingArchive)
