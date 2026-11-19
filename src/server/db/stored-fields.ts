// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'

/**
 * THE STORED FIELDS THE INDEXES OF MIGRATIONS 0199, 0201, 0209, 0212, 0228, 0266, 0277, 0289, 0292, 0294, 0296, 0301, 0310, 0328 AND 0329 HOLD, each in the one wording a query must use.
 *
 * SQLite uses an index on an expression only for a query that asks the same expression, so these
 * are written once, here, and both the index declarations in records-table.ts and schema.ts and the readers in
 * src/server/lib/messages.ts, src/server/lib/message-centre.ts, src/server/lib/worker.ts, src/server/lib/flow-runs.ts, src/server/lib/broadcast.ts, src/server/lib/reminders.ts, src/server/lib/waiting.ts, src/server/lib/keys.ts, src/server/lib/the-persons-own-words.ts, src/server/lib/next-round.ts, src/server/lib/worker-runs.ts, src/server/lib/stable-upgrade-notices.ts, src/server/lib/cardmessage.ts, src/server/lib/turn-drafts.ts and src/server/lib/a-check-nothing-starts.ts take them from here. Each
 * up to 0266, the one of 0289, the three of 0292 and the ones of 0310, 0328 and 0329 reads its field only from data that is valid JSON and is null
 * otherwise, for the reason migration 0199 gives. The two of 0277 and the one of 0301 read it plainly, for the reason and
 * at the cost migration 0277 gives.
 * Each migration's own SQL holds the same words, and does not change once it has run.
 */
const fromValidJson = (data: SQLWrapper, read: SQL): SQL => sql`(CASE WHEN json_valid(${data}) THEN ${read} END)`
export const STORED_FIELDS = {
  /** A message's stored sender id, `data.sentBy.id`. */
  messageSentById: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.sentBy.id')`),
  /** What kind of JSON value a message's typed `from` line is. */
  messageTypedFromType: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_type(${data}, '$.from')`),
  /** What kind of JSON value a message's `routed` list is. */
  messageRoutedType: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_type(${data}, '$.routed')`),
  /** The message a notice is about, `data.aboutMessage`. */
  messageAboutMessage: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.aboutMessage')`),
  /** Whether a session's `data.state` is `running`: 1, 0, or null when the data is not JSON. */
  sessionIsRunning: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.state') = 'running'`),
  /**
   * Whether a session's run has not ended: 0 when `data.state` is one of the four words that end a run, and 1 for any
   * other state, for no state and for data that is not JSON, so the read keeps such a row and fails on it as before.
   * Migration 0294, whose index is partial to it. The four words are `RUN_IS_OVER_STATES` in src/server/lib/keys.ts,
   * written out here because keys.ts reads schema.ts. Case 6 of tests/the-online-view-says-whether-each-agent-is-online.test.ts
   * holds these words to `theRunHasEnded`, so the two cannot answer differently.
   */
  sessionHasNotEnded: (data: SQLWrapper): SQL =>
    sql`(CASE WHEN json_valid(${data}) THEN coalesce(json_extract(${data}, '$.state') NOT IN ('finished', 'crashed', 'paused', 'orphaned'), 1) ELSE 1 END)`,
  /**
   * Whether a session's next round is wanted: 1 when `data.nextRound.state` is `wanted`, 0 otherwise, and 1 for data that
   * is not JSON, so the worker's read keeps such a row and fails on it as before. Migration 0296, whose index is partial to
   * it. The words are `NEXT_ROUND` and the first of `NEXT_ROUND_STATES` in src/shared/next-round.ts, written out here
   * because schema.ts reads only types from src/shared. Case D of
   * tests/migration-0296-the-worker-finds-wanted-rounds-and-worker-runs-by-index.test.ts holds them to those names.
   */
  sessionWantsANextRound: (data: SQLWrapper): SQL =>
    sql`(CASE WHEN json_valid(${data}) THEN json_extract(${data}, '$.nextRound.state') = 'wanted' ELSE 1 END)`,
  /**
   * Whether a session's data holds worker runs at all: 1 when it has a `workerRuns` field of any value, 0 when it has none,
   * and 1 for data that is not JSON, for the reason above. Migration 0296. The worker reads the entries with json_each,
   * which no index WHERE may name, so the index holds every run with the field and the read keeps its own test of each
   * entry. The word is `WORKER_RUNS` in src/shared/worker-runs.ts, written out and held as the field above is.
   */
  sessionHoldsWorkerRuns: (data: SQLWrapper): SQL =>
    sql`(CASE WHEN json_valid(${data}) THEN json_type(${data}, '$.workerRuns') IS NOT NULL ELSE 1 END)`,
  /**
   * The package a worker's run was filed for, `data.workerPackage.task`. Migration 0350, read only from valid JSON. The
   * word is `WORKER_PACKAGE` in src/shared/worker-runs.ts, written out because schema.ts reads only types from
   * src/shared. Its index holds sessions only, and its reader in src/server/lib/package-workers.ts also says
   * `kind = 'session'` and that this field `IS NOT NULL`.
   */
  sessionWorkerPackageTask: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.workerPackage.task')`),
  /**
   * When the worker's package was asked for, `data.workerPackage.askedAt`. Migration 0350, read only from valid JSON.
   * It is a local stamp written by `nowStamp`, so a day is found with a range and never with `substr`: a range is what
   * an index can answer.
   */
  sessionWorkerPackageAskedAt: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.workerPackage.askedAt')`),
  /** The message a session's run was started to hand over, `data.deliveringMessage`. */
  sessionDeliveringMessage: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.deliveringMessage')`),
  /** Session references reached by indexes before the full candidate condition, migration 0286. */
  sessionServingAgentId: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.servingAgentId')`),
  sessionServingAgent: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.servingAgent')`),
  sessionFirstBindingAgent: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.ranAs[0].agentId')`),
  /**
   * Rows exact reference lookups cannot exclude: malformed JSON, odd serving/binding text, or a binding beyond the
   * first. Non-array bindings are retained too. Readers still decide; this is only an indexed candidate bucket.
   */
  sessionReferenceNeedsFallback: (data: SQLWrapper): SQL => sql`(CASE WHEN json_valid(${data}) THEN (
    json_extract(${data}, '$.servingAgentId') GLOB '*[^A-Za-z0-9_-]*'
    OR json_extract(${data}, '$.servingAgent') GLOB '*[^A-Za-z0-9_-]*'
    OR json_extract(${data}, '$.ranAs[0].agentId') GLOB '*[^A-Za-z0-9_-]*'
    OR json_array_length(${data}, '$.ranAs') > 1
    OR json_type(${data}, '$.ranAs') NOT IN ('array', 'null')
  ) ELSE 1 END)`,
  /** The run a flow run belongs to, `data.run`. Migration 0201. */
  flowRunRun: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.run')`),
  /** The flow a flow run names, `data.flow`. Migration 0212. */
  flowRunFlow: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.flow')`),
  /** What kind of JSON value a message's `data.target` is, or null when it has none. Migration 0209. */
  messageTargetType: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_type(${data}, '$.target')`),
  /** The broadcast slot a message is marked for, `data.extra.broadcastSlot`. Migration 0228. */
  messageBroadcastSlot: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.extra.broadcastSlot')`),
  /** The broadcast slot a message says has nothing to report, `data.extra.broadcastSkip`. Migration 0228. */
  messageBroadcastSkip: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.extra.broadcastSkip')`),
  /** The cause a stopped-run notice is about, `data.extra.m94.cause`. Migration 0228. */
  messageStopCause: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.extra.m94.cause')`),
  /** Whose next move a record says it is, `data.whose_move`, on a record of any kind. Migration 0266. */
  whoseMove: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.whose_move')`),
  /** The group a message went to, `data.toGroup`. Migration 0292. */
  messageToGroup: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.toGroup')`),
  /** The project a message was written in, `data.writtenIn.project`. Migration 0292. */
  messageWrittenInProject: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.writtenIn.project')`),
  /** The project a message's writer said it is about, `data.aboutProject`. Migration 0292. */
  messageAboutProject: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.aboutProject')`),
  /** The run key a session's record or a revision names, `data.extra.runKeyId`. Migration 0277, read plainly. */
  runKeyId: (data: SQLWrapper): SQL => sql`json_extract(${data}, '$.extra.runKeyId')`,
  /** The dispatched run a revision's session was filed for, `data.extra.agentRun`. Migration 0277, read plainly. */
  agentRun: (data: SQLWrapper): SQL => sql`json_extract(${data}, '$.extra.agentRun')`,
  /**
   * Whether a message is a stable upgrade notice: its `data.notice` is `stableUpgradeNotice`. Migration 0301, read plainly.
   * The word is `STABLE_UPGRADE_NOTICE_EVENT` in src/shared/stable-upgrade-notices.ts, written out here because schema.ts
   * reads only types from src/shared. Case D of tests/migration-0301-the-upgrade-notices-are-found-by-index.test.ts holds
   * it to that name.
   */
  messageIsAnUpgradeNotice: (data: SQLWrapper): SQL => sql`json_extract(${data}, '$.notice') = 'stableUpgradeNotice'`,
  /**
   * The prepared note a secretary filed under the person's grant, `data.filed_under_the_grant.from`. Migration 0289, read
   * only from valid JSON. Its index holds notes only, and its two readers also say `kind = 'note'` and that this field
   * `IS NOT NULL`, the index's WHERE term for term.
   */
  noteFiledUnderTheGrantFrom: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.filed_under_the_grant.from')`),
  /**
   * The card whose handbook a message carried, `data.extra.handbookSent.card`. Migration 0310, read only from valid JSON.
   * The word is `HANDBOOK_SENT_MARK` in src/server/lib/cardmessage.ts, written out here because cardmessage.ts reads
   * schema.ts. Case D of tests/migration-0310-the-handbook-message-is-found-by-index.test.ts holds it to that name. Its index
   * holds messages only, and its reader also says `kind = 'message'` and that this field `IS NOT NULL`.
   */
  messageHandbookSentCard: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.extra.handbookSent.card')`),
  /**
   * The agent a turn draft is held for, `data.turn.agent.id`, while the draft is neither sent (`data.sentAs`) nor refused
   * when it went (`data.turn.notSent`), and null otherwise. Migration 0328, read only from valid JSON. The words are `TURN`
   * in src/shared/turn-drafts.ts and `SENT_AS` in src/shared/drafts.ts, written out here because schema.ts reads only
   * types from src/shared. Case D of tests/migration-0328-a-held-turn-draft-is-found-by-index.test.ts holds them to those
   * names. Its index holds drafts only, and its readers in src/server/lib/turn-drafts.ts also say `kind = 'draft'`.
   */
  heldTurnDraftAgentId: (data: SQLWrapper): SQL =>
    fromValidJson(
      data,
      sql`(CASE WHEN json_extract(${data}, '$.sentAs') IS NULL AND json_extract(${data}, '$.turn.notSent') IS NULL THEN json_extract(${data}, '$.turn.agent.id') END)`,
    ),
  /**
   * When a run's starter is told that nothing in the office would start its queued check, `data.aCheckNothingStarts.tellAfterMs`,
   * while that mark is neither told nor let go, and null otherwise. Migration 0329, read only from valid JSON. The word is
   * `A_CHECK_NOTHING_STARTS` in src/shared/whether-a-check-would-start.ts, written out here because schema.ts reads only
   * types from src/shared. Case 9 of tests/a-check-nothing-will-start-says-so.test.ts holds it to that name. Its index
   * holds sessions only, and its reader also says `kind = 'session'` and that this field `IS NOT NULL`.
   */
  sessionTellsOfACheckNothingStartsAfter: (data: SQLWrapper): SQL =>
    fromValidJson(data, sql`CASE WHEN json_type(${data}, '$.aCheckNothingStarts.told') IS NULL AND json_type(${data}, '$.aCheckNothingStarts.notTold') IS NULL THEN json_extract(${data}, '$.aCheckNothingStarts.tellAfterMs') END`),
  /**
   * The run a message is about, `data.aboutRun`. Migration 0339, read only from valid JSON. Its index holds messages only.
   * Its readers ask whether the office already wrote a line about a run: in src/server/lib/worker.ts when a child run
   * finishes, and in src/server/lib/the-line-next-round.ts when a next round is asked or starts. Each also says
   * `kind = 'message'` and asks this field equal to the run, which SQLite reads as the index's `IS NOT NULL`.
   */
  messageAboutRun: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.aboutRun')`),
  /**
   * The summons mark a message carries, `data.summons`, which only the summons door writes. Migration 0339, read only
   * from valid JSON. Its index holds messages only, and its reader in src/server/lib/summons.ts also says
   * `kind = 'message'` and that this field `IS NOT NULL`.
   */
  messageSummons: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.summons')`),
  /**
   * The week-use mark a message carries, `data.extra.loginsWeek`, which only the week-use notice writes. Migration 0339,
   * read only from valid JSON. Its index holds messages only, and its reader in src/server/lib/logins-week.ts also says
   * `kind = 'message'` and that this field `IS NOT NULL`.
   */
  messageLoginsWeek: (data: SQLWrapper): SQL => fromValidJson(data, sql`json_extract(${data}, '$.extra.loginsWeek')`),
} as const

/**
 * A STORED FIELD WRITTEN OUT AS TEXT, for a statement prepared on the SQLite handle and not built with drizzle, as
 * src/server/lib/keys.ts prepares its own. `column` is the data column in the words that statement uses, such as
 * `data` or `filed.data`. A field whose words would need a parameter is refused, because the text would then not be
 * the whole of what SQLite is asked.
 */
export function theWordsOfAStoredField(field: (data: SQLWrapper) => SQL, column: string): string {
  const { sql: words, params } = new SQLiteSyncDialect().sqlToQuery(field(sql.raw(column)))
  if (params.length > 0) throw new Error(`The stored field read from ${column} needs ${String(params.length)} parameter(s), so it cannot be written out as text.`)
  return words
}

/** The index of migration 0301, which the reads of the upgrade notices name. */
export const THE_FIRST_UPGRADE_NOTICE_INDEX = 'revisions_first_upgrade_notice_idx'

/** The index of migration 0315, which the read of a run's own message to its starter names. */
export const THE_CREATE_REVISIONS_BY_SESSION_INDEX = 'revisions_session_create_idx'

/**
 * THE FIRST REVISION OF A STABLE UPGRADE NOTICE, in the words of the WHERE of migration 0301's index. Each read of the
 * notices in src/server/lib/stable-upgrade-notices.ts says these words, so SQLite may read that index. `table` is the
 * name the read gives the revisions, such as `r`, or none.
 */
export function theFirstRevisionOfAnUpgradeNotice(table?: string): string {
  const column = (name: string): string => (table === undefined ? name : `${table}.${name}`)
  return `${column('seq')} = 1 AND ${column('op')} = 'create' AND ${column('kind')} = 'message' AND ` +
    theWordsOfAStoredField(STORED_FIELDS.messageIsAnUpgradeNotice, column('data'))
}

/**
 * THE KIND, WRITTEN OUT IN THE WORDS OF THOSE INDEXES. Each index holds one kind, and SQLite uses it
 * only for a query that names the kind in the same words. A kind passed as a value does not count.
 */
export const ONE_KIND_WRITTEN_OUT = {
  message: sql`"records"."kind" = 'message'`,
  session: sql`"records"."kind" = 'session'`,
  flowRun: sql`"records"."kind" = 'flow_run'`,
  note: sql`"records"."kind" = 'note'`,
} as const
