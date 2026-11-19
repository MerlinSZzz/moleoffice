// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { ProvedHolder, HowACallerProvedItself } from '@shared/types.ts'
import { aPartTable } from '../part-tables.ts'

// ---------------------------------------------------------------------------- changes

/**
 * The change log. This is what replaces daily pages: a day is a filter on `at`.
 *
 * One row per field changed, so "what changed about this module last week" is answerable
 * without diffing whole records.
 */
export const changes = aPartTable(sqliteTable(
  'changes',
  {
    id: text('id').primaryKey(),
    recordId: text('record_id').notNull(),
    /**
     * Which project this change happened in, or NULL when nothing can say.
     *
     * ---------------------------------------------------------------------------------------
     * WHY THIS COLUMN EXISTS AND WHY IT IS A COPY OF THE RECORD'S
     * ---------------------------------------------------------------------------------------
     *
     * `changes` IS the daily view — a day is a filter on `at` — and "what happened while I was
     * away" is a question about ONE project. Every other project-owned table carried
     * `workspace_id` from the first migration; this one did not, and that made it the only place
     * where the boundary could not be a WHERE clause. It was the largest table and the one the
     * attention rule and the reader anchor both read whole.
     *
     * A JOIN BACK TO `records` WOULD NOT DO. `record_id` is not a declared foreign key, so the
     * join is not guaranteed total, and a change row whose record is missing would silently drop
     * out of every per-project count — the daily page would answer "nothing happened" about work
     * that did. Storing it makes the filter total and makes a missing record VISIBLE as NULL.
     *
     * IT IS DERIVED, NOT PASSED. `logChange` reads it from the record the change is about, in the
     * same statement, so the two cannot disagree — the fix this codebase's recurring defect asks
     * for. A caller cannot supply it and there is no parameter for one.
     *
     * NULLABLE, AND NULL IS A REAL ANSWER: no record answers to this row's `record_id`, so nobody
     * can say which project it belongs to. The backfill in workspace-migration.ts leaves those
     * rows NULL and counts them rather than picking a workspace for them.
     */
    workspaceId: text('workspace_id'),
    /** create, update, delete, link, unlink */
    op: text('op').notNull(),
    /** human, agent, system */
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    /** The agent session responsible, when there was one. Lets a page link back to its work. */
    sessionId: text('session_id'),
    field: text('field'),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    /**
     * THE PERSON'S OWN WORDS THIS WRITE WAS MADE ON, as JSON, or NULL for an ordinary write.
     *
     * A governance write an agent is otherwise refused goes through when the request carries a
     * warrant: who said it, their words, where they said them and when. The shape and the reading
     * are in src/shared/warrant.ts. NULL is the ordinary case and it means nobody claimed anybody's
     * words for this row — never that words were said and lost.
     *
     * IT IS STORED BESIDE THE ACTOR AND NOT IN A TABLE OF ITS OWN, because it is a fact about THIS
     * write and about no other. A row in another table would have to be joined to be read, and a
     * join that came back empty would leave a change row saying an agent did something only a
     * person may do, with nothing beside it saying why that was allowed.
     */
    warrant: text('warrant'),
    /**
     * THE ELEVATION THIS WRITE WAS MADE UNDER, as JSON, or NULL for an ordinary write.
     *
     * Every write made while a secretary is acting for the person names the grant it
     * was made under. The same shape and the same reason as `warrant` above — a governance write an
     * agent is otherwise refused went through, and the ledger says on what authority — with one
     * difference: a warrant is the person's quoted words for one act, and this is the person's press for a period.
     *
     * ONLY THE GUARD THAT USED IT WRITES IT. An elevated secretary filing an ordinary note needed no
     * elevation, so nothing is stored on that row; storing it would put *acting for the person*
     * beside a write that any worker could have made.
     */
    elevation: text('elevation'),
    /** The one package item whose signature carried this act, as JSON text; NULL otherwise. */
    signed_item: text('signed_item'),
    /**
     * WHO A KEY PROVED, WHERE THAT DIFFERS FROM `actor_id`. The actor id keeps the name the request's
     * headers gave — the change log must keep naming the agent that wrote each record, because six of the office's own processes
     * send the office's key under an agent's name on every request — and the holder the key proved
     * is recorded here beside it.
     *
     * ONE CASE WHERE IT DOES NOT DIFFER: the create and the mint of a run a starter files by hand
     * for its agent carry the starter's own key, so that run's own key proves the run (lib/keys.ts).
     * There the key proved the agent `actor_id` names, and the change log and the export draw no
     * proved-by words for it (`theKeyProvedTheRowsOwnWriter` in lib/agent-references.ts).
     *
     * STORED AS JSON, inline, through the same `mode: 'json'` the revision ledger's `data` uses, so
     * the browser reads the object off the row and no page has to parse a string. `ProvedHolder`
     * says what is in it; NULL is the ordinary case and means the rule did not apply.
     *
     * THIS IS ONE OF THE TWO LEDGERS AND NOT BOTH, which is why it is written from one function:
     * `logChange` and `saveRevision` share `provedHolderWritten`, as they share `attributionFor`,
     * and a fact written in one ledger and not the other is drift between the ledgers with nothing
     * failing. Migration 0168 adds it to this table and to `revisions` in the same two statements.
     */
    provedHolder: text('proved_holder', { mode: 'json' }).$type<ProvedHolder>(),
    /**
     * HOW A KEY PROVED THE REQUEST THAT MADE THIS WRITE, or NULL when no key proved it. Migration 0178.
     *
     * The word `actorFrom` puts on the actor as `provedBy`: `the-person-key` (the person's key, or a device
     * of theirs they confirmed), `the-office-key` or `an-agent-key`. It is written on every keyed write,
     * where `proved_holder` above is written only when the key and the headers disagree, or on a
     * starter's own run's create and mint. A warrant
     * written after the key window closed may cite only words the person's key proved, and this is where that
     * is read. On a row written before 0178, NULL means nobody recorded it.
     *
     * ONE OF THE TWO LEDGERS AND NOT BOTH, for the reason `proved_holder` gives: `logChange` and
     * `saveRevision` write it from one function, `provedByWritten`, in one transaction.
     */
    provedBy: text('proved_by').$type<HowACallerProvedItself>(),
    /**
     * When it happened, LOCAL wall clock. NO SQL DEFAULT, for the reason `base.createdAt` gives:
     * `datetime('now')` is UTC and this column is read as local time, so a default here would put
     * a wrong stamp on a change row behind a successful write. `logChange` passes `now()`.
     *
     * A wrong stamp costs more here than anywhere else in the database. `changes` IS the daily
     * page — a day is a filter on this column — so a row an hour out is a row filed on the wrong
     * day, and "what happened while I was away" is the question the whole product exists to answer.
     */
    at: text('at').notNull(),
    /**
     * THE PLACE OF THIS ROW IN THE ORDER THE LOG WAS APPENDED IN. Migration 0194.
     *
     * A reader's anchor sits on one row, and "what has changed since I last looked" is every row
     * placed after it. `at` cannot say that, because a stamp is to the second and the seed back-dates
     * rows; `id` cannot, because it is random. This column is the order, and a higher number was
     * appended later.
     *
     * NO PROGRAM WRITES IT. The trigger `changes_append_order_next` in migration 0194 gives each new
     * row one more than the highest number in the table, whichever program inserted it. The importer
     * is the one writer that names a number, because it carries an archive's order back in; see
     * `appendOrderOfTheInserts` in src/server/lib/import.ts. Unique, so no two rows share a place.
     *
     * The migration filled the rows that existed from their rowid, which was the same order.
     */
    appendOrder: integer('append_order'),
    /**
     * THE PRESS FOR THE PERSON THIS ROW WAS WRITTEN BY, a row of `presses_for_the_person`, or NULL. Migration 0280.
     *
     * Written by `logChange` only where a secretary's grant allowed the write, the row `elevation` above is written
     * on. Every change row of one press names the same press. NULL is every ordinary write, and on a row written
     * before 0280 it means nobody recorded a press.
     */
    pressId: text('press_id'),
  },
  (t) => ({
    appendOrderIdx: uniqueIndex('changes_append_order_idx').on(t.appendOrder),
    /** The rows of one press. Partial, so the ordinary write, which names no press, adds nothing to it. */
    pressIdx: index('changes_press_idx').on(t.pressId).where(sql`press_id IS NOT NULL`),
    recordIdx: index('changes_record_idx').on(t.recordId),
    atIdx: index('changes_at_idx').on(t.at),
    sessionIdx: index('changes_session_idx').on(t.sessionId),
    /**
     * (workspace_id, at), in that order, because every read of this table is now "one project's
     * day". A plain index on `workspace_id` would narrow to a third of the log and then sort it;
     * this one is already in the order the daily page and the reader anchor both want.
     */
    workspaceAtIdx: index('changes_workspace_at_idx').on(t.workspaceId, t.at),
    /**
     * The rows that bind a run name, and only those: migration 0229. `boundToName` in
     * src/server/lib/records.ts reads the newest of them for one name.
     */
    sessionNameIdx: index('changes_session_name_idx')
      .on(t.workspaceId, t.newValue, t.at, t.id)
      .where(sql`field = 'sessionName'`),
    /**
     * The create rows written as an agent, and only those: migration 0335. A check finds the records the run's agent
     * filed through it (`everythingThisAgentWrote` in src/server/lib/inspection.ts), by the agent's stamps, and takes
     * the other three columns from the index itself.
     */
    agentCreateIdx: index('changes_agent_create_idx')
      .on(t.actorId, t.appendOrder, t.recordId, t.workspaceId)
      .where(sql`op = 'create' AND actor_type = 'agent'`),
  }),
), { existingArchive: true })
