// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * A CONVERSATION WITH AN AGENT ABOUT REAL WORK.
 *
 * The thread, message and run tables are the agent layer's storage, declared in one migration so it was
 * built against a schema rather than beside one. `src/server/lib/agents.ts` is what reads and writes
 * them; it arrived on 18 August 2026 and all three were classified as AUTHORED on the same day.
 *
 * `mode` is `direct` or `review`, and it is the whole difference between the two ways of talking to
 * an agent: a `direct` thread sends each message when it is written, and a `review` thread collects
 * messages and sends them together when the person finishes the review. One grammar, two dispatch
 * times.
 *
 * `state` is `open` (being written), `dispatched` (handed to a runtime), `answered` (a reply came
 * back) or `abandoned` (the person walked away). Nothing computes it; a person or the dispatch
 * writes it.
 *
 * AUTHORED, and workspace-owned unlike the planning layer: a conversation is about one project's
 * work, so it belongs to that project like every other authored row outside planning.
 */
export const agentThreads = aPartTable(sqliteTable(
  'agent_threads',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The project this conversation is about. */
    workspaceId: text('workspace_id').notNull(),
    /** What the conversation is about, in the writer's words. */
    title: text('title').notNull(),
    /** `direct` or `review`. Says WHEN messages are sent, not what they may say. */
    mode: text('mode').notNull(),
    /** `open`, `dispatched`, `answered` or `abandoned`. */
    state: text('state').notNull().default('open'),
    /** LOCAL wall clock, both. Who wrote it: `${actor.type}:${actor.id}`. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [index('agent_threads_workspace_idx').on(table.workspaceId)],
), { existingArchive: true })
