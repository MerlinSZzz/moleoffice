// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

export const onePressRequests = aPartTable(sqliteTable(
  'one_press_requests',
  {
    /** nanoid, so one request can be cited. */
    id: text('id').primaryKey(),
    /** The project it was asked in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** Which known act, by its name in src/server/lib/one-press.ts. */
    act: text('act').notNull(),
    /** The act's fixed inputs, as JSON, checked by that act before the row was written. */
    inputs: text('inputs').notNull(),
    /** The registry id of the agent that asked, proved by its own key. */
    askedBy: text('asked_by').notNull(),
    /** The sentence the person reads, written by the office from the act and its inputs. */
    shows: text('shows').notNull(),
    /** The agent's own words about why, or NULL. Drawn only in Developer mode. */
    because: text('because'),
    /** `waiting`, `done`, `could-not`, `refused` or `withdrawn`. */
    state: text('state').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    askedAt: text('asked_at').notNull(),
    /** When it stopped waiting, LOCAL wall clock, or NULL while it waits. */
    answeredAt: text('answered_at'),
    /** `person` or `agent`, and the id in that registry: who agreed, refused or withdrew it. NULL while it waits. */
    answeredByKind: text('answered_by_kind'),
    answeredById: text('answered_by_id'),
    /** What the act did, or why it could not run, or NULL while it waits. */
    outcome: text('outcome'),
  },
  (t) => [index('one_press_requests_state_idx').on(t.state, t.askedAt)],
), existingArchive)
