// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
// The provenance vocabulary lives in shared/types.ts; borrowing its type keeps the column from
// drifting from that list without restating or enforcing the rule here. See `origin` below.
import type { RecordOrigin } from '@shared/types.ts'
import type { BaseColumns } from './schema.ts'
import { STORED_FIELDS } from './stored-fields.ts'

export const makeRecords = (base: BaseColumns) => sqliteTable(
  'records',
  {
    ...base,
    /** One of RECORD_KINDS. Not a foreign key; the list lives in shared/types.ts. */
    kind: text('kind').notNull(),
    /** Short name. Typing this name is how you create a link, so it must be unique. */
    title: text('title').notNull(),
    /**
     * One line saying what this record is, on the home page and in every list.
     *
     * WHATEVER THE WRITER SENT, STORED VERBATIM, ON EVERY KIND. This said "generated for most
     * kinds, never hand-maintained" until 2026-08-10 and neither half was ever true: `createRecord`
     * in src/server/lib/records.ts stores `body.summary` unchanged, `patchRecord` replaces it with
     * whatever a PATCH sends, nothing generates one and nothing refuses a hand-written one. So this
     * column is exactly as current as the last person who typed into it.
     *
     * The same sentence was in src/shared/types.ts, was corrected there, and survived here — one
     * statement in two files with nothing making them agree, which is this codebase's recurring
     * defect. The long version of the correction is on `summary` in types.ts; this is the short one,
     * and the two say the same thing on purpose.
     */
    summary: text('summary'),
    /** Kind-specific fields as JSON. Validated in the application, not by SQLite. */
    data: text('data', { mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
    /**
     * Soft delete. Records are never removed, so a link can point at something deleted and
     * be shown as broken rather than silently vanishing. This is the "no silent fallbacks"
     * rule applied to the database.
     */
    deletedAt: text('deleted_at'),
    /**
     * How this record entered the corpus: `authored`, `fixture`, or NULL for nobody has said.
     *
     * THE ENVELOPE, NOT `data`, AND THAT IS THE WHOLE POINT OF THE COLUMN. Origin has to survive an
     * export, it has to be answerable by a WHERE clause rather than by parsing every row, and above
     * all it must not be something a `dataPatch` can quietly rewrite — a record cannot be allowed to
     * relabel its own provenance. Inside `data` it would fail all three.
     *
     * NULLABLE, WITH NO SQL DEFAULT, AND NOTHING BACKFILLED IT WHOLESALE. NULL means nobody has
     * recorded how this row got here, which is a different fact from `authored` and the expensive
     * one to confuse: reading NULL as `authored` turns the absence of a judgement into a judgement,
     * in the exact direction that makes fixture content read as part of the project record.
     * `readOrigin` in shared/types.ts answers null for absent, null and any word outside the list,
     * and `unstampedOriginNote()` is the sentence for it.
     *
     * THE VALUES THAT ARE IN THIS COLUMN TODAY WERE MEASURED, NOT INFERRED. The rows that existed
     * when the column arrived were measured one at a time, by two independent lines of evidence that
     * had to agree, and stamped by src/server/db/origin-migration.ts. That measurement left this
     * repository on 5 September 2026 because it held private record ids and titles; its result is
     * this column. There is no rule anywhere that decides `fixture` from a title, a date
     * or a word in the content, and there must never be one: `fixture` is a fact about the WRITE
     * PATH that the writer knows at write time, and everything else is a guess wearing its clothes.
     *
     * NOTHING IS CHECKED HERE, the same arrangement `links.gate` and `records.data` have and for the
     * same reason: the vocabulary lives in shared/types.ts, the check belongs on the write path
     * where a refusal can be a sentence, and a CHECK constraint would be a second statement of one
     * rule that could drift from the first.
     *
     * NO INDEX. The same argument `links.gate` gives: this workspace holds 385 records, every list
     * query already reads them all through `records_live_idx`, and an index nothing needs still has
     * to be written on every record create and update.
     */
    origin: text('origin').$type<RecordOrigin>(),
  },
  (t) => ({
    kindIdx: index('records_kind_idx').on(t.kind),
    // NOT UNIQUE, since the migration `0030_titles_may_repeat`. It was UNIQUE(workspace_id, title)
    // from the first migration until 17 August 2026, and the person overturned the rule behind it:
    // ID is identity, title is presentation, titles may repeat. The person met the old rule by deleting a
    // plan line, writing it again, and being refused because work of that title already existed —
    // work they had just deleted, since the unique index covered deleted rows too.
    //
    // THE INDEX STAYS, because looking a title up is still what linking by name does, and a lookup
    // that a person waits for should not walk the table. What it no longer does is decide that two
    // records are one because they are called the same thing. Every place that turns a title into a
    // record refuses when more than one live record answers, and names them: see `recordsByTitle`
    // and `liveMatches` in src/server/lib/records.ts.
    titleIdx: index('records_title_idx').on(t.workspaceId, t.title),
    liveIdx: index('records_live_idx').on(t.workspaceId, t.deletedAt),
    updatedIdx: index('records_updated_idx').on(t.updatedAt),
    // ONE MERGE ENTRY PER LANE, and the database is what says so. Migration 0171.
    // `data.occupies` is the lane — the directory a changeset lands in — that an entry holds
    // right now; it is present only while the entry's state holds one, and `moveEntry` in
    // src/server/lib/merge-queue.ts is the one writer of it and of the state together. Partial, so
    // every other record and every entry holding no lane costs nothing. Written here with the same
    // words as the migration so a generated migration would make the same index.
    mergeLaneIdx: uniqueIndex('records_one_merge_entry_per_lane')
      .on(sql`json_extract(data, '$.occupies')`)
      .where(sql`kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.occupies') IS NOT NULL`),
    landedInstantIdx: index('records_landed_instant_idx')
      .on(t.workspaceId, sql`CASE WHEN json_type(data, '$.integrated.time.instant') = 'text' AND json_extract(data, '$.integrated.time.instant') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*' AND (json_extract(data, '$.integrated.time.instant') GLOB '*Z' OR json_extract(data, '$.integrated.time.instant') GLOB '*[+-][0-9][0-9]:[0-9][0-9]') THEN unixepoch(json_extract(data, '$.integrated.time.instant'), 'subsec') END`, t.id)
      .where(sql`kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged'`),
    landedInstantRepoIdx: index('records_landed_instant_repo_idx')
      .on(t.workspaceId, sql`json_extract(data, '$.changeset.root')`, sql`CASE WHEN json_type(data, '$.integrated.time.instant') = 'text' AND json_extract(data, '$.integrated.time.instant') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*' AND (json_extract(data, '$.integrated.time.instant') GLOB '*Z' OR json_extract(data, '$.integrated.time.instant') GLOB '*[+-][0-9][0-9]:[0-9][0-9]') THEN unixepoch(json_extract(data, '$.integrated.time.instant'), 'subsec') END`, t.id)
      .where(sql`kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged'`),
    landedLaneIdx: index('records_landed_lane_idx')
      .on(t.workspaceId, sql`CASE WHEN json_type(data, '$.changeset.root') = 'text' THEN json_extract(data, '$.changeset.root') || CASE WHEN json_extract(data, '$.documents') IS NULL THEN '' ELSE ' documents' END END`, sql`CASE WHEN json_type(data, '$.integrated.time.instant') = 'text' AND json_extract(data, '$.integrated.time.instant') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*' AND (json_extract(data, '$.integrated.time.instant') GLOB '*Z' OR json_extract(data, '$.integrated.time.instant') GLOB '*[+-][0-9][0-9]:[0-9][0-9]') THEN unixepoch(json_extract(data, '$.integrated.time.instant'), 'subsec') END`, t.id)
      .where(sql`kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged'`),
    landedRepoLaneIdx: index('records_landed_repo_lane_idx')
      .on(t.workspaceId, sql`json_extract(data, '$.changeset.root')`, sql`CASE WHEN json_type(data, '$.changeset.root') = 'text' THEN json_extract(data, '$.changeset.root') || CASE WHEN json_extract(data, '$.documents') IS NULL THEN '' ELSE ' documents' END END`, sql`CASE WHEN json_type(data, '$.integrated.time.instant') = 'text' AND json_extract(data, '$.integrated.time.instant') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*' AND (json_extract(data, '$.integrated.time.instant') GLOB '*Z' OR json_extract(data, '$.integrated.time.instant') GLOB '*[+-][0-9][0-9]:[0-9][0-9]') THEN unixepoch(json_extract(data, '$.integrated.time.instant'), 'subsec') END`, t.id)
      .where(sql`kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged'`),
    // A READER'S MESSAGES, A RUNNING RUN AND A RUN THAT CARRIES A MESSAGE, found without reading every
    // record. Each holds one kind and starts with its stored field, so no other query is moved onto
    // it. Migration 0199 says which readers ask each of these, and what they cost without them.
    messageSentByIdx: index('records_message_sent_by_idx')
      .on(STORED_FIELDS.messageSentById(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageTypedFromIdx: index('records_message_typed_from_idx')
      .on(STORED_FIELDS.messageTypedFromType(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageRoutedIdx: index('records_message_routed_idx')
      .on(STORED_FIELDS.messageRoutedType(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageAboutMessageIdx: index('records_message_about_message_idx')
      .on(STORED_FIELDS.messageAboutMessage(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    sessionRunningIdx: index('records_session_running_idx')
      .on(STORED_FIELDS.sessionIsRunning(t.data), t.workspaceId)
      .where(sql`kind = 'session'`),
    sessionDeliveringMessageIdx: index('records_session_delivering_message_idx')
      .on(STORED_FIELDS.sessionDeliveringMessage(t.data), t.workspaceId)
      .where(sql`kind = 'session'`),
    // Listed people and work views reach reference candidates without visiting ordinary sessions of other agents.
    // The fallback bucket retains unusual values and bindings for the readers to decide.
    sessionServingAgentIdIdx: index('records_session_serving_agent_id_idx')
      .on(STORED_FIELDS.sessionServingAgentId(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session'`),
    sessionServingAgentIdx: index('records_session_serving_agent_idx')
      .on(STORED_FIELDS.sessionServingAgent(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session'`),
    sessionFirstBindingAgentIdx: index('records_session_first_binding_agent_idx')
      .on(STORED_FIELDS.sessionFirstBindingAgent(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session'`),
    sessionReferenceFallbackIdx: index('records_session_reference_fallback_idx')
      .on(STORED_FIELDS.sessionReferenceNeedsFallback(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session'`),
    // THE RUNS OF A PROJECT THAT HAVE NOT ENDED, found without reading every run. Migration 0294. Partial to
    // the kind and to `sessionHasNotEnded`, so only a read that names both in these words is moved onto it
    // (`theRunsTheDotsRead` in src/server/lib/presence.ts).
    sessionNotEndedIdx: index('records_session_not_ended_idx')
      .on(t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionHasNotEnded(t.data)}`),
    // THE RUNS THAT WANT A NEXT ROUND, AND THE RUNS THAT HOLD WORKER RUNS, found by the message worker without reading every
    // run. Migration 0296. Each is partial to the kind and to its stored field, so only a read that names
    // both in these words is moved onto it (`theRoundsToStart` and `theWorkerRunsToStart`).
    sessionWantsANextRoundIdx: index('records_session_wants_a_next_round_idx')
      .on(t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionWantsANextRound(t.data)}`),
    sessionHoldsWorkerRunsIdx: index('records_session_holds_worker_runs_idx')
      .on(t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionHoldsWorkerRuns(t.data)}`),
    // A PACKAGE'S WORKERS, found from either end: every worker run filed for one package, and every package asked for
    // on one day. Migration 0350. Both are partial to sessions and to the stored field, so a read that names
    // their WHERE terms with STORED_FIELDS is moved onto them.
    sessionWorkerPackageTaskIdx: index('records_session_worker_package_task_idx')
      .on(STORED_FIELDS.sessionWorkerPackageTask(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionWorkerPackageTask(t.data)} IS NOT NULL`),
    sessionWorkerPackageAskedAtIdx: index('records_session_worker_package_asked_at_idx')
      .on(STORED_FIELDS.sessionWorkerPackageAskedAt(t.data), t.workspaceId, t.deletedAt)
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionWorkerPackageAskedAt(t.data)} IS NOT NULL`),
    // A RUN'S FLOW RUN, found without reading every flow run. Migration 0201.
    flowRunRunIdx: index('records_flow_run_run_idx')
      .on(STORED_FIELDS.flowRunRun(t.data))
      .where(sql`kind = 'flow_run'`),
    // A FLOW'S RUNS, newest first and counted without reading every flow run. Migration 0212.
    flowRunFlowIdx: index('records_flow_run_flow_idx')
      .on(STORED_FIELDS.flowRunFlow(t.data), t.deletedAt, t.createdAt)
      .where(sql`kind = 'flow_run'`),
    // THE MESSAGES THAT HAVE A TARGET, which every comment does, found without reading every message. Migration 0209.
    messageTargetIdx: index('records_message_target_idx')
      .on(t.workspaceId, t.deletedAt)
      .where(sql`kind = 'message' AND ${STORED_FIELDS.messageTargetType(t.data)} IS NOT NULL`),
    // THE OFFICE'S MARKED LINES, found without reading every message: a broadcast slot, a slot with nothing
    // to report, and the cause of a stopped-run notice. Migration 0228.
    messageBroadcastSlotIdx: index('records_message_broadcast_slot_idx')
      .on(STORED_FIELDS.messageBroadcastSlot(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageBroadcastSkipIdx: index('records_message_broadcast_skip_idx')
      .on(STORED_FIELDS.messageBroadcastSkip(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageStopCauseIdx: index('records_message_stop_cause_idx')
      .on(STORED_FIELDS.messageStopCause(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    // A MESSAGE BY THE GROUP IT WENT TO, AND BY THE PROJECT IT WAS WRITTEN IN OR IS ABOUT, found without reading every
    // message. Migration 0292 says which readers ask each of these, and what they cost without them.
    messageToGroupIdx: index('records_message_to_group_idx')
      .on(STORED_FIELDS.messageToGroup(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageWrittenInProjectIdx: index('records_message_written_in_project_idx')
      .on(STORED_FIELDS.messageWrittenInProject(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    messageAboutProjectIdx: index('records_message_about_project_idx')
      .on(STORED_FIELDS.messageAboutProject(t.data), t.workspaceId)
      .where(sql`kind = 'message'`),
    // EVERY MESSAGE BY ITS MOMENT, so the talk view reads from its place. Migration 0293. Partial to the
    // message centre as well as the kind, so only a read that names both in these words is moved onto it
    // (`theViewFromAMoment` in src/server/lib/message-centre.ts).
    messageMomentIdx: index('records_message_moment_idx')
      .on(t.createdAt)
      .where(sql`kind = 'message' AND workspace_id = 'message-centre'`),
    // THE RECORDS THAT SAY WHOSE NEXT MOVE IT IS, live or deleted, found without reading every record. Migration 0266.
    // Partial, so a record that does not carry the field is not in it.
    whoseMoveIdx: index('records_whose_move_idx')
      .on(t.deletedAt)
      .where(sql`${STORED_FIELDS.whoseMove(t.data)} IS NOT NULL`),
    // THE SESSION THAT NAMES A RUN KEY, found without reading every session. Migration 0277. src/server/lib/keys.ts
    // asks it for every key it labels and for a finished run's own key.
    sessionRunKeyIdIdx: index('records_session_run_key_id_idx')
      .on(STORED_FIELDS.runKeyId(t.data))
      .where(sql`kind = 'session'`),
    // THE NOTE A SECRETARY FILED UNDER THE PERSON'S GRANT FROM A PREPARED ONE, found without reading every note.
    // Migration 0289. src/server/lib/the-persons-own-words.ts asks it on every press that files or
    // marks a prepared note, and on every page of the notes waiting for the person.
    noteFiledUnderTheGrantFromIdx: index('records_note_filed_under_the_grant_from_idx')
      .on(STORED_FIELDS.noteFiledUnderTheGrantFrom(t.data))
      .where(sql`kind = 'note' AND ${STORED_FIELDS.noteFiledUnderTheGrantFrom(t.data)} IS NOT NULL`),
    // THE MESSAGE THAT CARRIED A CARD'S HANDBOOK TO AN AGENT, found without reading every message. Migration 0310.
    // src/server/lib/cardmessage.ts asks it each time a card message is written to an agent.
    messageHandbookSentCardIdx: index('records_message_handbook_sent_card_idx')
      .on(STORED_FIELDS.messageHandbookSentCard(t.data))
      .where(sql`kind = 'message' AND ${STORED_FIELDS.messageHandbookSentCard(t.data)} IS NOT NULL`),
    // THE TURN DRAFTS HELD NOW, by the agent they are held for, found without reading every draft. Migration 0328.
    // src/server/lib/turn-drafts.ts asks it on every read of a conversation with an agent, on a run's own
    // inbox read, at a turn's end, when a run finishes or seals, and at each pass of the reminders.
    heldTurnDraftAgentIdx: index('records_held_turn_draft_agent_idx')
      .on(STORED_FIELDS.heldTurnDraftAgentId(t.data))
      .where(sql`kind = 'draft' AND ${STORED_FIELDS.heldTurnDraftAgentId(t.data)} IS NOT NULL`),
    // THE RUNS WHOSE STARTER IS DUE TO HEAR THAT NOTHING WOULD START THEIR CHECK, found without reading every run.
    // Migration 0329. src/server/lib/a-check-nothing-starts.ts asks it on every minute pass.
    sessionTellsOfACheckNothingStartsIdx: index('records_session_check_nothing_starts_idx')
      .on(STORED_FIELDS.sessionTellsOfACheckNothingStartsAfter(t.data))
      .where(sql`kind = 'session' AND ${STORED_FIELDS.sessionTellsOfACheckNothingStartsAfter(t.data)} IS NOT NULL`),
    // A MESSAGE BY THE RUN IT IS ABOUT, found without reading every message. Migration 0339. The office asks it before it
    // writes a line about a run, so that it never writes the same line twice.
    messageAboutRunIdx: index('records_message_about_run_idx')
      .on(STORED_FIELDS.messageAboutRun(t.data))
      .where(sql`kind = 'message' AND ${STORED_FIELDS.messageAboutRun(t.data)} IS NOT NULL`),
    // THE SUMMONSES, in the order they were made, found without reading every message. Migration 0339. The read of the
    // summonses since a place names this index.
    messageSummonsIdx: index('records_message_summons_idx')
      .on(t.createdAt)
      .where(sql`kind = 'message' AND ${STORED_FIELDS.messageSummons(t.data)} IS NOT NULL`),
    // THE WEEK-USE NOTICES, found without reading every message. Migration 0339. The notice reads the ones already sent
    // through this index, so that it never tells a share twice.
    messageLoginsWeekIdx: index('records_message_logins_week_idx')
      .on(t.createdAt)
      .where(sql`kind = 'message' AND ${STORED_FIELDS.messageLoginsWeek(t.data)} IS NOT NULL`),
  }),
)
