// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { ProvedHolder, HowACallerProvedItself } from '@shared/types.ts'
import { aPartTable } from '../part-tables.ts'
import {
  STORED_FIELDS,
  THE_CREATE_REVISIONS_BY_SESSION_INDEX,
  THE_FIRST_UPGRADE_NOTICE_INDEX,
  theFirstRevisionOfAnUpgradeNotice,
} from '../stored-fields.ts'

// ---------------------------------------------------------------------------- revisions

/**
 * WHAT A RECORD HELD, kept whole, once per write. The revision ledger.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE EXISTS WHEN `changes` IS RIGHT ABOVE IT
 * ---------------------------------------------------------------------------------------
 *
 * `changes` says WHAT CHANGED. It cannot say WHAT IT WAS. A `create` row stores the record's TITLE
 * and nothing else — measured on 18 August 2026 across all 536 records of the live corpus, Mole Office
 * claim SFqriiCyFWJi — so there is no starting point to replay the later edits onto. Nothing can be
 * reconstructed from the change log alone. A review, an annotation and an agent run all need to say
 * "this is what I was looking at", and before this table none of them could.
 *
 * SO A REVISION STORES CONTENT. It is not derived and it cannot be: the content it holds is exactly
 * the thing the change log does not keep.
 *
 * `changes` IS NOT REPLACED AND IS NOT RE-POINTED. It is the daily page — a day is a filter on
 * `changes.at` — and it does that job. A revision is written BESIDE a change row, in the same
 * transaction, by `saveRevision` in src/server/lib/records.ts. Deriving the change rows from these
 * revisions is the right end state and is deliberately not this pass: it would touch the daily page,
 * the attention ranking, the reader anchor and the export all at once.
 *
 * NO BRANCH, NO MERGE, NO REBASE, and no Git word ever reaches a screen. The owner settled both on
 * 18 August 2026. A person sees what this looked like before, what changed, and put this back.
 *
 * ---------------------------------------------------------------------------------------
 * A REVISION'S IDENTITY IS THE CONTENT HASH THAT WAS ALREADY THERE
 * ---------------------------------------------------------------------------------------
 *
 * `content_hash` is `versionOf()` in src/server/lib/records.ts, over kind, title, summary, data and
 * deletedAt. That string is ALREADY the compare-and-set token every stale-write check in this server
 * uses, so a revision id and a stale-write token are the same string and cannot drift apart: there
 * is only one of them.
 *
 * THE HAZARD, WRITTEN DOWN WHERE SOMEBODY WOULD OTHERWISE ASSUME OTHERWISE. `versionOf` hashes a
 * plain `JSON.stringify`, so KEY ORDER INSIDE `data` IS PART OF THE HASH. Two records holding the
 * same fields in a different order hash differently. That is acceptable — it makes the token
 * conservative, and a conservative token is never wrongly EQUAL, which is the direction that would
 * let a stale write through — but it means two revisions with different hashes are not proof that
 * the content differs. `fieldsThatDiffer` in src/shared/fielddiff.ts is what answers that question.
 */
export const revisions = aPartTable(sqliteTable(
  'revisions',
  {
    /** anOfficeId() in src/server/lib/ids.ts, the way `changes.id` is made. */
    id: text('id').primaryKey(),
    /**
     * The record this revision is of.
     *
     * NOT A DECLARED FOREIGN KEY, for the reason `changes.record_id` is not one: the history of a
     * record has to survive whatever happens to the row, and a reference the database enforces would
     * make a row impossible to remove without taking its history with it.
     */
    recordId: text('record_id').notNull(),
    /**
     * Which project this revision was written in, or NULL when nothing can say.
     *
     * DERIVED FROM THE RECORD IN THE SAME STATEMENT, NEVER A PARAMETER — the rule and the reasoning
     * are `changes.workspace_id` above, and this column copies both. A revision's project is the
     * project of the record it is of; that is the same fact, not a second one, and a caller that
     * could supply it would be a second place stating it.
     *
     * NULLABLE, AND NULL IS A REAL ANSWER, exactly as it is on a change row: no record answers to
     * this `record_id`, so nobody can say which project it belongs to.
     */
    workspaceId: text('workspace_id'),
    /**
     * 1-based, and per record. So "the one before this" has an answer.
     *
     * This is what makes the ledger a ledger rather than a pile of snapshots. It is gapless because
     * `saveRevision` takes `max(seq) + 1` inside the same transaction as the write, and the UNIQUE
     * index below is what makes two writers unable to agree on the same number.
     */
    seq: integer('seq').notNull(),
    /** `versionOf()` of the content in this row. See the block above for what that means. */
    contentHash: text('content_hash').notNull(),
    // ---------------------------------------------------------------------------------------
    // THE CONTENT, AS THE API SERVES IT AND NOT AS THE ROW STORES IT
    // ---------------------------------------------------------------------------------------
    //
    // `toRecord` in src/server/lib/records.ts turns an absent `data` into `{}`, and hashing a raw
    // row would hash a different object from the one a caller was handed — so the record could never
    // match its own version. `saveRevision` re-reads the row, puts it through `toRecord`, and stores
    // what comes out. The five columns below are exactly the five `versionOf` hashes, in its order.
    /** The kind the record was at this moment. A patch can change it, so it is stored per revision. */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    /** The kind-specific fields, whole. Validated on the write path, never by SQLite. */
    data: text('data', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    /**
     * The record's soft-delete stamp AT THIS REVISION, not at the moment you read it.
     *
     * A SOFT DELETE WRITES A REVISION, carrying this set. Being deleted is a real state of the
     * record, and putting it back needs the state before it — so skipping the revision on a delete
     * would leave the one write whose "before" nobody can reach.
     */
    deletedAt: text('deleted_at'),
    /**
     * What kind of write produced this: create, update, delete, restore or baseline.
     *
     * `restore` is putting an earlier revision's content back, and it WRITES A NEW REVISION rather
     * than removing anything — history is never rewritten here. `baseline` is the one nobody
     * performed: see the backfill in src/server/db/revision-backfill.ts, whose `note` says in plain
     * words that the content is what the record held when this table was built and NOT what it held
     * when it was created. The word list is `REVISION_OPS` in src/shared/types.ts; nothing is
     * checked here, for the reason `records.origin` gives.
     */
    op: text('op').notNull(),
    /** human, agent, system — the same three a change row carries, from the same headers. */
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    /** The agent session responsible, when there was one, resolved the way `logChange` resolves it. */
    sessionId: text('session_id'),
    /**
     * When it happened, LOCAL wall clock, through `now()`. NO SQL DEFAULT.
     *
     * The same reason `changes.at` gives at length: `datetime('now')` is UTC, every stamp in this
     * database is read as local time, and a default here would put a wrong moment on a revision
     * behind a successful write.
     */
    at: text('at').notNull(),
    /**
     * Why, when there is a why. Ordinary writes leave it NULL.
     *
     * A restore says which revision it put back. A baseline says what it is and what it is not.
     * Nothing is generated into this column: an absent note means nobody said anything, which is
     * different from nothing having happened.
     */
    note: text('note'),
    /**
     * THE PERSON'S OWN WORDS THIS REVISION WAS WRITTEN ON, as JSON, or NULL for an ordinary write.
     *
     * The same column `changes.warrant` is, in the same shape and for the same reason, on the other
     * ledger — the two are written in one transaction by `attributionFor`'s two callers, so a write
     * cannot be on somebody's words in one ledger and not in the other.
     *
     * THIS IS WHERE AN ACT ON SOMEBODY'S WORDS LIVES. A revision holds the whole record as it stood,
     * so the words, the write they allowed and what the record held before it are one row and its
     * neighbour. Nothing else has to be looked up to show a person what was done on their sentence.
     */
    warrant: text('warrant'),
    /**
     * THE ELEVATION THIS REVISION WAS WRITTEN UNDER, as JSON, or NULL for an ordinary write.
     *
     * The same column `changes.elevation` is, in the same shape and for the same reason, on the
     * other ledger — the two are written in one transaction by `attributionFor`'s two callers, so a
     * write cannot be made under an elevation in one ledger and not in the other.
     */
    elevation: text('elevation'),
    /** The one package item whose signature carried this act, as JSON text; NULL otherwise. */
    signed_item: text('signed_item'),
    /**
     * WHO A KEY PROVED, WHERE THAT DIFFERS FROM `actor_id`, and the starter's own key on the create
     * and the mint of a run a starter files by hand. The same column `changes.proved_holder` is, in
     * the same shape and for the same reason, on the other ledger: `saveRevision` and `logChange`
     * write in one transaction from one function, `provedHolderWritten`, so a fact cannot be on one
     * ledger and not the other. Criterion P83, point 5. Migration 0168 adds both in the same file.
     */
    provedHolder: text('proved_holder', { mode: 'json' }).$type<ProvedHolder>(),
    /**
     * HOW A KEY PROVED THE REQUEST THAT MADE THIS REVISION, or NULL when no key proved it. The same
     * column `changes.proved_by` is, written by the same function in the same transaction. Migration
     * 0178. A warrant cites a record's words by the revision that created it, so this is the column
     * the warrant check reads for a `message` or `annotation` record.
     */
    provedBy: text('proved_by').$type<HowACallerProvedItself>(),
    /**
     * WHICH EARLIER REVISION OF THIS RECORD THIS ONE TOOK BACK, or NULL, which is nearly always.
     *
     * A person revoking an act made on their words does not erase it. The act's revision stays
     * exactly as it was, the record is put back to what it held before, and THAT write is a new
     * revision carrying this column set to the act's `seq`. So "is this act still standing" is
     * answered by looking for a later revision naming it, and no row is ever rewritten.
     *
     * IT IS A NUMBER AND NOT A NOTE. The note beside it says the same thing in words for a reader;
     * this is what a query reads. A sentence that had to be parsed to answer a permission question
     * would be a fact stored in prose, which is worse than storing it twice.
     */
    revokesSeq: integer('revokes_seq'),
    /**
     * THE PLACES IN `data` WHOSE VALUE ANOTHER REVISION OF THE RECORD HOLDS WHOLE, each with that revision's number, as
     * `{"extra.roundChapters": 1}`. NULL means `data` is whole.
     *
     * A session's revision holds its round chapters whole in the first revision with that value, and their hash in each
     * later one (migration 0351). NULL on every revision written before that and on every revision of another kind.
     * Read a revision's whole data with `wholeRevisionData` in src/server/db/revision-stored-once.ts; a read of `data`
     * alone sees the hash.
     */
    parts: text('parts', { mode: 'json' }).$type<Record<string, number>>(),
  },
  (t) => ({
    /**
     * THE ONE THAT MAKES THE LEDGER A LEDGER. Two revisions of one record may not hold one `seq`, so
     * "the one before this" is a single row and a gap is impossible to write.
     */
    recordSeqIdx: uniqueIndex('revisions_record_seq_idx').on(t.recordId, t.seq),
    /** One record's history in the order it happened, which is how the list route reads it. */
    recordAtIdx: index('revisions_record_at_idx').on(t.recordId, t.at),
    /** "Which revision is this token" — the lookup a stale-write report and an annotation both make. */
    contentHashIdx: index('revisions_content_hash_idx').on(t.contentHash),
    /** One project's ledger over a span, the order `changes_workspace_at_idx` is in and for its reason. */
    workspaceAtIdx: index('revisions_workspace_at_idx').on(t.workspaceId, t.at),
    /**
     * The first revision that names a run key, which is the key's binding: `theOriginalMintOf` and
     * `theReopenBindingOf` in src/server/lib/keys.ts ask it on every keyed write. Migration 0277, wave 13n.
     */
    runKeyIdIdx: index('revisions_run_key_id_idx').on(STORED_FIELDS.runKeyId(t.data)),
    /** The first revision of a session filed for a dispatched run, by that run. Migration 0277, wave 13n. */
    firstAgentRunIdx: index('revisions_first_agent_run_idx').on(STORED_FIELDS.agentRun(t.data)).where(sql`seq = 1`),
    /**
     * The first revision of each stable upgrade notice, oldest first, as the reads of the notices order them. Migration 0301,
     * wave 13q. Its WHERE is `theFirstRevisionOfAnUpgradeNotice`, so the reads that say those words are moved onto it.
     */
    firstUpgradeNoticeIdx: index(THE_FIRST_UPGRADE_NOTICE_INDEX).on(t.at, t.recordId).where(sql.raw(theFirstRevisionOfAnUpgradeNotice())),
    /**
     * Each create revision, by the session it was written in: the records a run wrote. `theRunsOwnMessageTo` in
     * src/server/lib/sealed-tip.ts starts from it. Migration 0315, wave 13s.
     */
    sessionCreateIdx: index(THE_CREATE_REVISIONS_BY_SESSION_INDEX).on(t.sessionId).where(sql`op = 'create'`),
    /**
     * Each revision by its kind, then its project, then its place in its record. The record page's history reads a
     * project's pipeline revisions by it (`historyEvents` in src/server/lib/history.ts), and so do the take-back checks
     * and the other reads of a kind's first revisions in a project. The kind comes first, so a read by project alone
     * keeps `revisions_workspace_at_idx`. Migration 0326, wave 13y.
     */
    kindWorkspaceSeqIdx: index('revisions_kind_workspace_seq_idx').on(t.kind, t.workspaceId, t.seq),
    /**
     * Each revision by its project, then its record, its op and its `at`: the project graph counts each record's
     * revisions from it alone (`readProjectGraph` in src/server/lib/project-graph.ts). Migration 0353, wave 13s.
     */
    workspaceRecordOpAtIdx: index('revisions_workspace_record_op_at_idx').on(t.workspaceId, t.recordId, t.op, t.at),
  }),
), { existingArchive: true })
