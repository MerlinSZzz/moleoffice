// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * ONE PRESS A SECRETARY MADE FOR THE PERSON, UNDER THEIR GRANT, migration 0280. The flow design's section 7: every
 * press under the grant gives its reason and names the grant, and the person sees every press.
 *
 * WRITTEN BESIDE THE FIRST CHANGE ROW THE PRESS WRITES, in the same transaction, by `thePressRowOf` in
 * src/server/lib/records.ts, its one writer. So a press that was refused or rolled back has no row, and a press that
 * wrote nothing has none either. Every change row the press wrote names this row in `changes.press_id`.
 */
export const pressesForThePerson = sqliteTable(
  'presses_for_the_person',
  {
    /** nanoid, made once per request (`thePressOf` in src/server/lib/http.ts), so every row of one press names one id. */
    id: text('id').primaryKey(),
    /**
     * The project of the first change row the press wrote, as that row is filed, or NULL where no project can be said:
     * the same NULL `changes.workspace_id` carries. A press that wrote in two projects is filed under the first.
     */
    workspaceId: text('workspace_id'),
    /** The agent that pressed, as the change row's `actor_id` names it. */
    agentId: text('agent_id').notNull(),
    /** The session that pressed, resolved as the change row resolves it, or NULL where the request named none. */
    sessionId: text('session_id'),
    /** The id of the grant it was pressed under. */
    grantId: text('grant_id').notNull(),
    /** The door pressed: the operation its route declares in src/shared/ops-list.ts. */
    operation: text('operation').notNull(),
    /** Why the secretary pressed it, as it wrote it. NULL only on a read, which gives no reason. */
    reason: text('reason'),
    /** LOCAL wall clock, from the office's clock. No SQL default, for the reason `changes.at` gives. */
    at: text('at').notNull(),
  },
  (t) => [
    index('presses_for_the_person_grant_at_idx').on(t.grantId, t.at),
    index('presses_for_the_person_agent_at_idx').on(t.agentId, t.at),
  ],
)
