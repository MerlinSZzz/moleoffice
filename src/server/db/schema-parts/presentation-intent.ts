// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

// ---------------------------------------------------------------------------- presentation intent

/**
 * How somebody wants a structure PRESENTED. One row per target, inside one scope.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH LAYER THIS IS, AND WHICH LAYER IT MUST NEVER BECOME
 * ---------------------------------------------------------------------------------------
 *
 * src/shared/presentation.ts defines three layers and this table is the middle one. The rule it
 * states, in full: STORE MEANING AND PRESENTATION INTENT, DERIVE RENDERING.
 *
 *   1. CANONICAL — records, links, gates, pipeline blocks. `records` and `links` in `schema.ts`.
 *   2. PRESENTATION INTENT — this table. `direction`, `lane`, `order`, `role`, `emphasis`,
 *      `collapsed`, `near`. A closed vocabulary, checked by `checkScopeIntent` and
 *      `checkNodeIntent` on every write.
 *   3. DERIVED RENDERING — x, y, sizes, edge routes. ELK works those out on every draw and none
 *      of them is stored anywhere.
 *
 * NO COORDINATE, NO COLOUR AND NO CSS MAY EVER BE STORED HERE, and the refusal is by name rather
 * than by falling through an unknown-key check: `GEOMETRY_KEYS` in shared/presentation.ts lists
 * them and explains why each is excluded. The test for whether a value belongs in this table is
 * whether an AGENT could set it from what it knows about the work, without looking at a screen.
 * "This is a safety module" belongs here. "This node is at 420,180" does not.
 *
 * NO DERIVED LAYOUT CACHE MAY BE KEPT IN THIS TABLE EITHER. A cache is allowed by the boundary,
 * but it is a separate, droppable thing: deleting it may change only how long the next draw takes.
 * Mixing authored intent with disposable geometry in one table is how the boundary gets lost,
 * because after that nobody can drop the geometry without dropping what a person wrote.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS KEYED BY SCOPE AND TARGET RATHER THAN STORED ON THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A SCOPE is which structure is being presented: `structure` for the whole-project module graph,
 * or `pipeline:<id>` for one pipeline's own drawing. The same module can be prominent in one
 * pipeline's drawing and compact in another, so intent is a fact about a record IN A DRAWING and
 * not a fact about the record. Stored on the record it would have one value for every drawing, and
 * the second reader to want a different arrangement would have to overwrite the first.
 *
 * `target` is what inside the scope: a RECORD ID, or the sentinel `(scope)` for the scope's own
 * settings — today that is `direction` and nothing else. The sentinel is in brackets so it cannot
 * collide with a record id, which may not contain one.
 *
 * It used to have a second form, `step:<stepId>`, because a pipeline step was a nested object with
 * no row of its own. A block is a record, so there is one form and the reference is a real one. The
 * block migration rewrote every stored `step:` target to the block's id, in the same transaction
 * that created the blocks, and reported any it could not resolve rather than dropping them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A RECORD, AND WHY IT IS NOT A SECOND panel_layouts
 * ---------------------------------------------------------------------------------------
 *
 * Not a record, for the three reasons `reader_anchors` gives: it would flood
 * the change log if it were written as often as a layout is, it would appear on the Records page
 * as something researched, and nothing will ever link to "how the bench work is arranged" by name.
 *
 * But UNLIKE a panel layout it IS written to `changes`, and that difference is the point. A panel
 * layout is written on every drag, dozens of times a day, and burying a day of research under
 * "layout updated" rows would destroy the daily view. Presentation intent is AUTHORED: a person or
 * an agent decides that the safety work belongs in its own lane and says so once. Absent is meant
 * to stay the common case — see the comment on `NodeIntent` in shared/presentation.ts. So it is
 * rare, it is deliberate, it is exactly the kind of thing "what happened while I was away" should
 * report, and the writer is worth naming.
 */
export const presentationIntent = aPartTable(sqliteTable(
  'presentation_intent',
  {
    /** Which workspace. One today and it is always 'default'; here because every other table has it. */
    workspaceId: text('workspace_id').notNull().default('default'),
    /**
     * `structure`, or `pipeline:<id>`. Built by `pipelineScope()` so the string is never typed twice.
     *
     * IT HOLDS A RECORD ID, AND THAT RECORD'S KIND CAN CHANGE SINCE 17 AUGUST 2026. `parseScope` in
     * lib/presentation.ts refuses to read a `pipeline:<id>` scope once the record is not a pipeline,
     * so changing an empty pipeline into another kind puts its saved drawing out of reach. A pipeline
     * that still holds steps cannot have its kind changed at all, so this is only ever an empty one.
     *
     * JUDGED GOOD ENOUGH ON 18 AUGUST 2026 AND THIS IS WHY. The rows are not deleted, nothing
     * overwrites them, and changing the kind back makes every one of them readable again. It fails
     * loudly — a 400 naming the record's real kind — and it is reversible with one request. What was
     * missing was the warning, and `drawingLeftBehind` in lib/records.ts now says it at the moment
     * of the kind change, which is before somebody can be surprised by it rather than after.
     */
    scope: text('scope').notNull(),
    /** A record id, or the sentinel `(scope)` for the scope's own settings. */
    target: text('target').notNull(),
    /**
     * The intent itself, as JSON: a `NodeIntent` on a node row, `{ "direction": … }` on the scope row.
     *
     * NOTHING IS CHECKED BY SQLITE, the same arrangement `records.data` and `links.gate` have and for
     * the same reason. The check is `checkScopeIntent` / `checkNodeIntent` in shared/presentation.ts,
     * on the write path, where a refusal can be a paragraph explaining why a coordinate is not stored.
     * A CHECK constraint here would be a second statement of a rule that could drift from the first,
     * and all it could ever say is "CHECK constraint failed".
     */
    intent: text('intent', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    /**
     * When it was written, LOCAL, in the form shared/time.ts writes.
     *
     * NO SQL DEFAULT, for the reason `reader_anchors.last_seen_at` gives: `datetime('now')` is UTC,
     * and a column added today must not carry a default that is wrong by the machine's offset while
     * it waits for the one caller that forgets. The writer passes `now()`; an INSERT that omits this
     * fails loudly instead.
     */
    updatedAt: text('updated_at').notNull(),
    /** Who wrote it: `${actor.type}:${actor.id}`, so "human:owner" or "agent:claude-code". */
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    // One row per target per scope per workspace. Writing intent for the same target twice is the
    // same intent, changed — not a second opinion sitting beside the first.
    pk: primaryKey({ columns: [t.workspaceId, t.scope, t.target] }),
    // No separate index on (workspace_id, scope). The primary key's own index already starts with
    // those two columns, so reading one scope's rows uses it; a second index would only be one more
    // thing to write on every save.
  }),
), existingArchive)

export type PresentationIntentRow = typeof presentationIntent.$inferSelect
export type NewPresentationIntentRow = typeof presentationIntent.$inferInsert
