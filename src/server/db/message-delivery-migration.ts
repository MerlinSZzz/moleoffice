// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY MESSAGE ALREADY IN THIS DATABASE GETS A SENDER AND A DELIVERY ROW. A data migration.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN THREE ACTS
 * ---------------------------------------------------------------------------------------
 *
 * 1. Writes `sentBy` on each record of kind `message` that has none: the participant the record's
 *    own creator answers to, read from the revision ledger. The record's newest revision is
 *    restamped in the same transaction, so the ledger still holds what the record holds.
 * 2. Writes the `message_delivery` rows. A message that names nobody gets one row addressed to the
 *    owner, marked `seen` where the old `read` flag was true and `delivered` where it was not. A
 *    message whose `to` names recipients gets one row for each of them, and one for each participant
 *    its `routed` entries gave it to, as the write door writes them: marked `queued`, with the door's
 *    own `inferred_by`. Problem `IywLd0CDUsOK`: this act used to write the owner row whatever `to`
 *    said.
 * 3. Writes on each of those rows that SOMEBODY worked the recipient out rather than being told.
 *    Nobody named one, and the owner is who a line on the message board was always for — that is an
 *    interpretation, and USER.md's eighth invariant says an interpretation is shown beside
 *    somebody's words rather than stored as if they had written it. Which writer worked it out is
 *    decided in one place, `inferredByFor` in `@shared/messages.ts`; a row whose recipient the
 *    writer named outright carries null, and a row the door wrote for a chosen run carries the
 *    door's own tag. The step reports every row it stamps, by id, because the start guard reads a
 *    write off this report and a write the report denies is a write it must refuse over (problem
 *    `IhInQ2Mf5BZq`).
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE OWNER, AND WHY `delivered` RATHER THAN `queued`
 * ---------------------------------------------------------------------------------------
 *
 * Every message in this corpus was written for the person to read on the message board, and the
 * board has been drawing all of them since they were filed. So the owner is who they were to, and
 * `queued` — which means *nothing has read this yet* — would be false of every one of them. A
 * message the owner has not marked read is `delivered`: it reached the board, and the owner has not said
 * they read it. `seen` is written only where the row already says they did.
 *
 * ---------------------------------------------------------------------------------------
 * `from` IS NOT TOUCHED, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the live database on 4 September 2026: all 25 message records carry a `from` line, and
 * they say things like "claude-code · session touch", "panelx · resource sweep" and
 * "claude-code, wave 5". Several of those name nothing in either registry. Rewriting the field into
 * a participant reference would delete twenty-five written lines and invent an identity for the ones
 * that have none. So `from` keeps its words and `sentBy` is written beside it.
 *
 * A MESSAGE WHOSE CREATOR ANSWERS TO NO REGISTRY ROW GETS NO SENDER, and the report counts it.
 * `nobody has looked` and `nobody was found` are different answers, and inventing a participant here
 * would put a false name on somebody else's words.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE, AND THAT IS CHECKED RATHER THAN CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Act 1 skips a record that already has a `sentBy`. Act 2 inserts with ON CONFLICT DO NOTHING
 * against the one-row-per-recipient index. A second run therefore writes nothing and the report says
 * zero for both.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { contentOf, versionOf } from './version.ts'
import { nowStamp } from '@shared/time.ts'
import { THE_PERSON } from '@shared/person.ts'
import {
  INFERRED_BY_THE_MIGRATION,
  INFERRED_BY_THE_ROUTING,
  inferredByFor,
  refsOfRecipients,
  routedCopiesOf,
  type DeliveryMark,
} from '@shared/messages.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { actorTypeWord } from '@shared/words.ts'
// THE ONE PLACE THE ID-OR-HANDLE QUESTION IS ASKED. It takes the database it is given, so this
// migration and the resolver every door reads through ask the same three questions of the same rows,
// rather than keeping two copies of one rule that can drift apart. It is imported from
// lib/agent-references.ts and NOT from lib/participants.ts, because that module imports db/client.ts
// and this one may not: migrate.ts's own header says importing it opens no database.
import { everyAgentAReferenceCouldName } from './agent-references.ts'

/**
 * WHAT A DELIVERY ROW THIS STEP WROTE SAYS ABOUT WHERE ITS RECIPIENT CAME FROM.
 *
 * It is the tag of migration 0115, which is the migration this step belongs to. Written into
 * `message_delivery.inferred_by`, which 0118 adds. The value itself is declared in
 * `@shared/messages.ts` beside `inferredByFor`, so this tag and the door's tag sit in one place.
 */
export const INFERRED_BY = INFERRED_BY_THE_MIGRATION

/** What a restamped revision's `note` says, where it had none. */
export const REVISION_NOTE =
  'The sender was written onto this message when the one message pool arrived. Nothing anybody wrote was changed.'

export interface MessageDeliveryReport {
  /** True when `message_delivery` is not there yet, which is the state before migration 0115 has run. */
  tableMissing: boolean
  /**
   * How many messages this run had anything to write for: the ones with no delivery row yet.
   *
   * IT IS NOT HOW MANY MESSAGES THIS DATABASE HOLDS, and its comment said it was until 4 September
   * 2026. That is the whole of problem `5NiHOF49fZ5y`: on a database the backfill has already run
   * against, every message is out of the plan, so this is zero and the line printed "All 0
   * message(s) already say who sent them" — vacuously true of an empty set, and read as an
   * all-clear over twenty-five messages that say nobody sent them. `messagesInDatabase` and
   * `messagesWithNoSender` below are counted over the whole table, whatever this run writes.
   */
  messagesSeen: number
  /** How many message records this database holds, deleted ones included. Counted every run. */
  messagesInDatabase: number
  /** How many of those already had a delivery row before this run. Counted every run. */
  messagesWithRowsAlready: number
  /**
   * How many messages say nobody sent them, counted AFTER this run has written what it can.
   *
   * Counted over the whole table rather than over the plan, so a second run reports it too. On the
   * live database on 4 September 2026 this is 25: the actor ids on those rows are runtime words and
   * run names, and neither registry holds any of them. Problem `r99uXHYnE7ih` is that state, and
   * this number is how a person checks whether it is still there.
   */
  messagesWithNoSender: number
  /** How many got a `sentBy` written on them. */
  sendersWritten: number
  /** How many newest revisions were rewritten so their hash still names what the record holds. */
  ledgerRestamped: number
  /** How many delivery rows this run wrote. */
  deliveriesWritten: number
  /** Of those, how many were owner rows marked seen because the old `read` flag said so. */
  markedSeen: number
  /** Of those, how many were owner rows marked delivered. */
  markedDelivered: number
  /** Of those, how many went to a recipient the message itself names, marked queued. */
  toTheRecipientsNamed: number
  /**
   * Of the rows written, how many are marked queued AND addressed to an agent. The message worker's queue
   * (`theQueue` in src/server/lib/worker.ts) reads exactly those rows as work to hand over, so this is the
   * number of old messages a landing can put in front of an agent. Said on every report line, zero included.
   */
  queuedForAnAgent: number
  /** Messages whose creator answers to no registry row, so no sender could be written. */
  sendersNotFound: { recordId: string; actorType: string; actorId: string }[]
  /**
   * MESSAGES WHOSE STORED ACTOR STAMP NAMES MORE THAN ONE AGENT, so no sender was written for them.
   *
   * ITS OWN LIST AND NOT PART OF `sendersNotFound`, because the two say different things. *Nothing
   * in the registry answers to this name* is one fact; *two agents answer to it and nothing here can
   * tell which wrote the message* is another. Folding them together would report an ambiguity as an
   * absence, which is the guess this list exists to refuse.
   *
   * IT IS EMPTY ON EVERY DATABASE MEASURED SO FAR. An actor stamp can only name two agents once two
   * agents can share a name — one holding it as an id, the other as a handle — and no installation
   * is in that state yet. It is written now because the migration runs again, on real data, every
   * time a merge runs `npm run db:migrate`.
   */
  sendersNamingMoreThanOneAgent: { recordId: string; actorType: string; actorId: string; couldBe: string[] }[]
  /**
   * How many delivery rows were stamped as having had their recipient worked out by this migration.
   *
   * It is not the same number as `deliveriesWritten`. A run that writes rows stamps the ones it
   * wrote; a run on a database whose rows were written before migration 0118 added the column
   * stamps those and writes nothing else.
   *
   * IT IS COUNTED FROM `stampedRows` BELOW rather than from `.changes`, because the guard reads
   * `the step wrote something` off this number and a write whose count is zero is a write the
   * guard reports as unexplained (problem `IhInQ2Mf5BZq`).
   */
  stamped: number
  /**
   * EVERY ROW THIS RUN STAMPED, BY ID, WITH WHAT IT NOW SAYS.
   *
   * The count alone was how problem `IhInQ2Mf5BZq` stayed hidden: the step wrote one row's
   * `inferred_by` while its report said *nothing was written*, so the guard's dry run saw the copy
   * come out byte-different with no report to account for it and refused to serve. A write has to be
   * readable by id, or a person cannot tell an honest write from a silent one.
   */
  stampedRows: StampedDelivery[]
}

/** One delivery row whose `inferred_by` this run wrote. */
export interface StampedDelivery {
  /** The `message_delivery` row's own id, so the report can name it. */
  deliveryId: string
  /** The message it is about. */
  messageId: string
  /** The recipient the row names. */
  recipientKind: string
  recipientId: string
  /** What `inferred_by` held before this run. Null for every row this step stamps. */
  was: string | null
  /** What it holds now. One of the two tags in `@shared/messages.ts`. */
  now: string
}

interface MessageRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  created_at: string
}

/**
 * THE AGENTS ONE STORED ACTOR STAMP COULD NAME, for the report's own sentence.
 *
 * Each one is drawn as `name (id)`, so a person reading the report can see which two rows the
 * migration would have had to choose between and can go and look at either.
 */
function agentsThatCouldBe(sqlite: Database.Database, actorId: string): string[] {
  const could = everyAgentAReferenceCouldName(sqlite, actorId)
  const said = new Map<string, string>()
  for (const one of [could.byId, could.liveByHandle, could.retiredByHandle]) {
    if (one !== null) said.set(one.id, `${one.name} (${one.id})`)
  }
  return [...said.values()]
}

/** Whether the table this writes into exists yet. */
function tableIsThere(sqlite: Database.Database, name: string): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  return row !== undefined
}

/** One message, what it would get, and why it would not. */
export interface MessagePlan {
  recordId: string
  /**
   * The participant the creator answers to, or null when no sender could be written.
   *
   * Null has two reasons and `namesMoreThanOneAgent` below is what tells them apart: nothing in
   * either registry answers to the stamp, or more than one agent does.
   */
  sentBy: { kind: 'person' | 'agent'; id: string } | null
  /**
   * TRUE WHEN THE STORED ACTOR STAMP NAMES MORE THAN ONE AGENT, so no sender was written for it.
   *
   * *Nothing answers* and *two things answer* are different facts, and a reader has to be able to
   * tell them apart. Writing the wrong name on somebody's words is worse than writing none.
   */
  namesMoreThanOneAgent: boolean
  /** Who made the record, straight off the ledger, so a refusal can name them. */
  actorType: string
  actorId: string
  /** True when the record already carries a `sentBy` and act 1 will skip it. */
  senderAlreadyThere: boolean
  /** The delivery rows act 2 would write for it, one per recipient. Never empty. */
  deliveries: PlannedDelivery[]
}

/** One delivery row act 2 would write. */
export interface PlannedDelivery {
  to: ParticipantRef
  mark: DeliveryMark
  /** What `inferred_by` would hold: null where the writer named this recipient. */
  inferredBy: string | null
  /** True for the owner row written because the message names nobody. */
  becauseItNamesNobody: boolean
}

/**
 * WHO ACT 2 WRITES ROWS FOR, AND WITH WHAT.
 *
 * A MESSAGE THAT NAMES RECIPIENTS IS GIVEN THE ROWS THE WRITE DOOR WOULD HAVE GIVEN IT. The door
 * (`keepTheDeliveryRowsInStep` in src/server/lib/messages.ts) writes one row per participant in `to`
 * with the `inferred_by` of `inferredByFor`, and one per participant the routing added with
 * `INFERRED_BY_THE_ROUTING`, all `queued`. This reads `to` and `routed` with the same two shared
 * readers the door reads them with. It cannot call the door itself: that file opens the database
 * the moment it is imported, and a migration may not. The plan leaves out every message with a
 * `toGroup` or a `chosenRecipient`, so the door's other two branches never apply here.
 *
 * `queued` BECAUSE NOTHING SAYS ANYBODY PICKED THEM UP. The old `read` flag was the owner's mark on
 * the board, and it says nothing about anybody else.
 *
 * A MESSAGE THAT NAMES NOBODY is a line on the board from before the pool, and the owner is who it
 * was for. That is the only case that gets the owner row, and its mark reads the old flag.
 */
function deliveriesFor(data: Record<string, unknown>, wasRead: unknown): PlannedDelivery[] {
  const named = refsOfRecipients(data['to'])
  const routed = routedCopiesOf(data)
  if (named.length === 0 && routed.length === 0) {
    return [
      {
        to: { kind: 'person', id: THE_PERSON },
        // THE OLD FLAG IS READ AS SQLITE STORED IT: json_extract gives 1 for true and 0 for false.
        mark: wasRead === 1 || wasRead === true ? 'seen' : 'delivered',
        inferredBy: INFERRED_BY,
        becauseItNamesNobody: true,
      },
    ]
  }
  const namedBy = inferredByFor(data)
  return [
    ...named.map((to) => ({ to, mark: 'queued' as const, inferredBy: namedBy, becauseItNamesNobody: false })),
    ...routed.map((to) => ({ to, mark: 'queued' as const, inferredBy: INFERRED_BY_THE_ROUTING, becauseItNamesNobody: false })),
  ]
}

/**
 * What this run would write, worked out before anything is written.
 *
 * Exported so a test can read the plan without applying it, the way the other data migrations here
 * are tested.
 */
export function planMessageDelivery(sqlite: Database.Database): {
  tableMissing: boolean
  messages: MessagePlan[]
} {
  if (!tableIsThere(sqlite, 'message_delivery') || !tableIsThere(sqlite, 'records')) {
    return { tableMissing: true, messages: [] }
  }

  // WHO MADE EACH MESSAGE, from the create row of the change log. That is where authorship lives in
  // this database: the record row itself carries `owner_id`, which holds the OWNER whenever an agent
  // wrote it, so reading it would file every agent's message as the person's.
  const creators = new Map<string, { type: string; id: string }>()
  if (tableIsThere(sqlite, 'changes')) {
    const rows = sqlite
      .prepare(
        "SELECT record_id AS recordId, actor_type AS actorType, actor_id AS actorId FROM changes " +
          "WHERE op = 'create' ORDER BY at",
      )
      .all() as { recordId: string; actorType: string; actorId: string }[]
    for (const row of rows) creators.set(row.recordId, { type: row.actorType, id: row.actorId })
  }

  const peopleThere = tableIsThere(sqlite, 'people')
  const agentsThere = tableIsThere(sqlite, 'agents')
  const person = peopleThere ? sqlite.prepare('SELECT id FROM people WHERE id = ?') : null

  // ONLY THE MESSAGES THAT REACHED NOBODY. A message written since the pool arrived already has one
  // row per recipient, and several of them were addressed to an agent and not to the owner at all.
  // Giving one of those an owner row would say a message reached the owner that never was sent to them.
  // Found by the start-up gate, which refuses to serve a database a migration would still write to:
  // it reported three such rows on a scratch copy on 4 September 2026.
  //
  // AND NEVER A COMMENT, OR A MESSAGE THAT NAMED ANYBODY.
  //
  // The rule above was an assumption about the corpus and not a check, and it was wrong the moment
  // a message could be written to nobody on purpose. Two comments were once written
  // to an agent through the composer, which sent no recipient with them (fixed in the same
  // change as this). They arrived with no delivery rows, this backfill caught them at the next
  // start, and they were then addressed to the owner — so the pool said two comments the owner sent to an agent
  // had reached the owner themselves. Problem `Kyr3b1hr3jjR`.
  //
  // A COMMENT IS A MESSAGE WITH A `target`, and that is what tells one from a board row: the rows
  // this backfill exists for were written before comments were messages at all, and not one of them
  // has a target or a chosen recipient. So a message carrying either is left alone, and a comment
  // addressed to nobody stays addressed to nobody, which is the truth about it.
  //
  // AND NEITHER IS A GROUP MESSAGE, for the same reason, added with criterion GM1. A message with
  // a `toGroup` names its own membership, and who in that membership is told is decided by the @ in
  // its words. So a group message can legitimately reach nobody —
  // an office line in a group holding only agents, or a message that @s only its sender — and this
  // backfill writing an owner row onto one would say a message reached the owner that was never sent to
  // them. The rows this backfill exists for are board rows, and not one of them carries a `toGroup`.
  // A modern sweep notice explicitly addresses nobody when no secretary is qualified.
  // Its empty recipient list is intentional; the old board inference must never add a person.
  const rows = sqlite
    .prepare(
      "SELECT id, data, json_extract(data, '$.read') AS wasRead, json_extract(data, '$.sentBy') AS sentBy " +
        'FROM records WHERE kind = \'message\' ' +
        'AND id NOT IN (SELECT message_id FROM message_delivery) ' +
        "AND json_extract(data, '$.target') IS NULL " +
        "AND json_extract(data, '$.chosenRecipient') IS NULL " +
        "AND json_extract(data, '$.toGroup') IS NULL " +
        "AND NOT (json_extract(data, '$.notice') IS 'deadLetterSweep' " +
        "AND json_type(data, '$.to') IS 'array' AND json_array_length(data, '$.to') = 0) " +
        'ORDER BY created_at, id',
    )
    .all() as { id: string; data: string; wasRead: unknown; sentBy: unknown }[]

  const messages: MessagePlan[] = []
  for (const row of rows) {
    const made = creators.get(row.id) ?? { type: '', id: '' }
    let sentBy: { kind: 'person' | 'agent'; id: string } | null = null
    let namesMoreThanOneAgent = false
    if (made.type === 'human' && person !== null) {
      const found = person.get(made.id) as { id: string } | undefined
      if (found !== undefined) sentBy = { kind: 'person', id: found.id }
    } else if (made.type === 'agent' && agentsThere) {
      /**
       * WHICH AGENT THIS STORED ACTOR STAMP NAMES, ASKED THE WAY THE RESOLVER ASKS IT.
       *
       * ---------------------------------------------------------------------------------------
       * WHY THE HANDLE HALF STAYS
       * ---------------------------------------------------------------------------------------
       *
       * `changes.actor_id` is not a reference to an agent. It is a free-text actor stamp: whatever
       * arrived in the header, stored as typed and never resolved before storage. The rows this
       * backfill exists for were written before the registry existed, and the handle half is the
       * only reason any of them resolves at all. Dropping it would turn messages that have a sender
       * into messages that say nobody sent them, which is a worse answer and not a truer one.
       *
       * ---------------------------------------------------------------------------------------
       * BUT IT MAY NEVER GUESS, AND IT USED TO
       * ---------------------------------------------------------------------------------------
       *
       * It used to be `SELECT id FROM agents WHERE id = ? OR handle = ?` — one statement, no
       * ordering, so SQLite hands back whichever row it reaches first. That is harmless while every
       * agent's id equals its handle. Once a handle can belong to a second agent, one stamp can name
       * two agents and this would file a message as being from whichever the database reached first.
       *
       * PUTTING THE WRONG NAME ON SOMEBODY'S WORDS IS WORSE THAN PUTTING NONE. So where the stamp
       * names more than one agent, no sender is written and the run reports the stamp by name — the
       * same shape as `sendersNotFound`, and a separate list because *more than one answers* and
       * *nothing answers* are different facts and a reader must be able to tell them apart.
       *
       * ---------------------------------------------------------------------------------------
       * THIS MIGRATION IS NOT FROZEN HISTORY
       * ---------------------------------------------------------------------------------------
       *
       * It is not run at server start — `prepareToServe` refuses to serve a database a migration
       * would still write to. It runs from `npm run db:migrate`, from scripts/reset.ts and from
       * scripts/restore-check.ts, and `npm run db:migrate` is what a merge runs on the live database.
       * So it will run again, on real data, after this lands. It is declared safe to run twice and
       * still is: this changes which rows it declines to write, never which rows it rewrites.
       *
       * THE QUESTION IS ASKED IN ONE PLACE. `everyAgentAReferenceCouldName` takes the database it is
       * given, so this reads the same three questions the resolver reads rather than keeping a
       * fourth copy of them here.
       */
      const could = everyAgentAReferenceCouldName(sqlite, made.id)
      const named = new Map<string, string>()
      for (const one of [could.byId, could.liveByHandle, could.retiredByHandle]) {
        if (one !== null) named.set(one.id, one.id)
      }
      if (named.size > 1) {
        namesMoreThanOneAgent = true
      } else if (named.size === 1) {
        sentBy = { kind: 'agent', id: [...named.keys()][0]! }
      }
    }
    messages.push({
      recordId: row.id,
      sentBy,
      namesMoreThanOneAgent,
      actorType: made.type,
      actorId: made.id,
      senderAlreadyThere: row.sentBy !== null && row.sentBy !== undefined,
      deliveries: deliveriesFor(JSON.parse(row.data) as Record<string, unknown>, row.wasRead),
    })
  }
  return { tableMissing: false, messages }
}

/**
 * SAY, ON EACH DELIVERY ROW THIS PRODUCT WORKED OUT, THAT THIS PRODUCT WORKED IT OUT.
 *
 * Returns the rows it stamped, each by id. It writes only where the stamp is missing AND the
 * message's own recipient was worked out rather than named, which is the same question the door
 * asks through `inferredByFor`. Every row whose writer named a recipient is left exactly as it was.
 *
 * IT IS A RULE RATHER THAN A LIST OF IDS, so it is right on the next database as well as on this
 * one. And it is here rather than in the SQL of migration 0118, because a SQL migration in this
 * repository is additive and never rewrites a row; `tests/migration.test.ts` refuses an UPDATE in
 * one, and that rule is what makes a migration safe to run against the only copy of the data.
 *
 * THE PREDICATE IS SHARED WITH THE DOOR and is not spelled again here. It used to be `no to and no
 * toGroup`, which is not the whole answer: a message whose writer chose a run also had a recipient
 * worked out, and this function called that one of its own. That stamped one row of the live
 * database while the report said nothing was written, and the start guard refused to serve
 * (problem `IhInQ2Mf5BZq`). Reading it through `inferredByFor` is what stops the two answers
 * drifting apart again.
 *
 * SAFE TO RUN TWICE: the second run finds no row without a stamp and writes nothing.
 */
export function stampWhatWasInferred(sqlite: Database.Database): { stamped: number; rows: StampedDelivery[] } {
  if (!tableIsThere(sqlite, 'message_delivery') || !tableIsThere(sqlite, 'records')) {
    return { stamped: 0, rows: [] }
  }
  // EVERY ROW WITHOUT A STAMP, whatever its message says. The message's own `data` decides which of
  // them the office worked a recipient out for, and the ones it did not are skipped below.
  const candidates = sqlite
    .prepare(
      'SELECT d.id AS deliveryId, d.message_id AS messageId, d.recipient_kind AS recipientKind, ' +
        'd.recipient_id AS recipientId, d.inferred_by AS was, r.data AS data ' +
        'FROM message_delivery d JOIN records r ON r.id = d.message_id ' +
        "WHERE d.inferred_by IS NULL AND r.kind = 'message'",
    )
    .all() as {
    deliveryId: string
    messageId: string
    recipientKind: string
    recipientId: string
    was: string | null
    data: string
  }[]
  const update = sqlite.prepare('UPDATE message_delivery SET inferred_by = ? WHERE id = ?')
  const rows: StampedDelivery[] = []
  const apply = sqlite.transaction(() => {
    for (const one of candidates) {
      let data: unknown
      try {
        data = JSON.parse(one.data)
      } catch {
        // A message whose stored data will not parse is not a row this can reason about, and it is
        // left alone rather than guessed at. The record door refuses to store one.
        continue
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data)) continue
      const now = inferredByFor(data as Record<string, unknown>)
      if (now === null) continue
      update.run(now, one.deliveryId)
      rows.push({
        deliveryId: one.deliveryId,
        messageId: one.messageId,
        recipientKind: one.recipientKind,
        recipientId: one.recipientId,
        was: one.was,
        now,
      })
    }
  })
  apply()
  return { stamped: rows.length, rows }
}

/**
 * WHAT THE MESSAGES IN THIS DATABASE LOOK LIKE NOW, whatever this run wrote.
 *
 * Three counts over the whole table, so a run that has nothing to write still has something true to
 * say. `planMessageDelivery` deliberately sees only the messages with no delivery row, which is
 * right for deciding what to write and is what made the report on an already-migrated database read
 * as an all-clear.
 */
function countTheMessages(sqlite: Database.Database): {
  inDatabase: number
  withRows: number
  withNoSender: number
} {
  if (!tableIsThere(sqlite, 'message_delivery') || !tableIsThere(sqlite, 'records')) {
    return { inDatabase: 0, withRows: 0, withNoSender: 0 }
  }
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS inDatabase, " +
        'SUM(CASE WHEN id IN (SELECT message_id FROM message_delivery) THEN 1 ELSE 0 END) AS withRows, ' +
        "SUM(CASE WHEN json_extract(data, '$.sentBy') IS NULL THEN 1 ELSE 0 END) AS withNoSender " +
        "FROM records WHERE kind = 'message'",
    )
    .get() as { inDatabase: number; withRows: number | null; withNoSender: number | null }
  return {
    inDatabase: row.inDatabase,
    withRows: row.withRows ?? 0,
    withNoSender: row.withNoSender ?? 0,
  }
}

/** Write the senders and the delivery rows. Nothing else in this database moves. */
export function migrateMessageDelivery(sqlite: Database.Database): MessageDeliveryReport {
  const plan = planMessageDelivery(sqlite)
  const report: MessageDeliveryReport = {
    tableMissing: plan.tableMissing,
    messagesSeen: plan.messages.length,
    messagesInDatabase: 0,
    messagesWithRowsAlready: 0,
    messagesWithNoSender: 0,
    sendersWritten: 0,
    ledgerRestamped: 0,
    deliveriesWritten: 0,
    markedSeen: 0,
    markedDelivered: 0,
    toTheRecipientsNamed: 0,
    queuedForAnAgent: 0,
    sendersNotFound: [],
    sendersNamingMoreThanOneAgent: [],
    stamped: 0,
    stampedRows: [],
  }
  if (plan.tableMissing) return report

  const readRecord = sqlite.prepare(
    'SELECT id, kind, title, summary, data, deleted_at, created_at FROM records WHERE id = ?',
  )
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const newestRevision = sqlite.prepare('SELECT id, seq, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
  const restamp = sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
  // THIS STEP'S OWN ROWS SAY THIS STEP WORKED THE RECIPIENT OUT. The messages it writes rows for
  // name nobody, and the owner is who a line on the board was always for. That is an interpretation,
  // so it is written down beside the row rather than left looking like something a writer typed.
  // A row the door writes carries its own answer from `inferredByFor`, which is null when the writer
  // named the recipient and the door's own tag when the door read one out of what the writer chose.
  // Migration 0118 adds the column; `stampWhatWasInferred` below is what gives the same answer to
  // rows this step had already written before the column existed.
  const insertDelivery = sqlite.prepare(
    'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, inferred_by) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(message_id, recipient_kind, recipient_id) DO NOTHING',
  )
  const ledgerIsThere = tableIsThere(sqlite, 'revisions')

  const apply = sqlite.transaction(() => {
    const touched: string[] = []

    // ---- ACT 1. THE SENDER, on every message that has none and whose creator can be found.
    for (const one of plan.messages) {
      if (one.senderAlreadyThere) continue
      if (one.sentBy === null) {
        // TWO REASONS FOR NO SENDER, KEPT APART. Nothing answers to the stamp, or more than one agent
        // does. Reporting an ambiguity as an absence would hide the one case where a guess was
        // refused, which is the case a reader most needs to see.
        if (one.namesMoreThanOneAgent) {
          report.sendersNamingMoreThanOneAgent.push({
            recordId: one.recordId,
            actorType: one.actorType,
            actorId: one.actorId,
            couldBe: agentsThatCouldBe(sqlite, one.actorId),
          })
        } else {
          report.sendersNotFound.push({ recordId: one.recordId, actorType: one.actorType, actorId: one.actorId })
        }
        continue
      }
      const row = readRecord.get(one.recordId) as MessageRow | undefined
      if (row === undefined) throw new Error(`Message ${one.recordId} went between planning this migration and running it.`)
      const data = JSON.parse(row.data) as Record<string, unknown>
      data['sentBy'] = one.sentBy
      setData.run(JSON.stringify(data), one.recordId)
      report.sendersWritten += 1
      touched.push(one.recordId)
    }

    // ---- THE LEDGER, AFTER EVERY RECORD HAS MOVED, so the content it is stamped from is the final
    // one. A record whose newest revision is not restamped cannot be written to again: the next
    // write compares what the ledger says the record holds against what it holds, and they differ.
    if (ledgerIsThere) {
      for (const recordId of touched) {
        const row = readRecord.get(recordId) as MessageRow | undefined
        if (row === undefined) throw new Error(`Message ${recordId} went while this migration was running.`)
        const newest = newestRevision.get(recordId) as { id: string; seq: number; note: string | null } | undefined
        if (newest === undefined) continue
        const content = contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        })
        restamp.run(JSON.stringify(content.data), versionOf(content), newest.note ?? REVISION_NOTE, newest.id)
        report.ledgerRestamped += 1
      }
    }

    // ---- ACT 2. THE DELIVERY ROWS: the owner for a message that names nobody, and otherwise the
    // recipients it names. See `deliveriesFor`.
    for (const one of plan.messages) {
      const row = readRecord.get(one.recordId) as MessageRow | undefined
      if (row === undefined) continue
      for (const going of one.deliveries) {
        const wrote = insertDelivery.run(
          anOfficeId(),
          one.recordId,
          going.to.kind,
          going.to.id,
          going.mark,
          // THE MESSAGE'S OWN CREATION TIME, because that is when it was written. This run's clock
          // would say every message in the corpus was delivered the day the pool arrived, which is a
          // fact about the migration and not about the message.
          row.created_at,
          going.inferredBy,
        ).changes
        report.deliveriesWritten += wrote
        if (wrote === 1) {
          if (going.mark === 'queued' && going.to.kind === 'agent') report.queuedForAnAgent += 1
          if (!going.becauseItNamesNobody) report.toTheRecipientsNamed += 1
          else if (going.mark === 'seen') report.markedSeen += 1
          else report.markedDelivered += 1
        }
      }
    }

    // ---- ACT 3. SAY WHICH ROWS THIS PRODUCT WORKED THE RECIPIENT OUT FOR. The report keeps every
    // one by id, because the guard reads a step's write off the report and a write it cannot name is
    // a write it must treat as unexplained (problem `IhInQ2Mf5BZq`).
    const stamped = stampWhatWasInferred(sqlite)
    report.stamped = stamped.stamped
    report.stampedRows = stamped.rows

    // ---- AND COUNT THE WHOLE TABLE, WHATEVER THIS RUN WROTE. Reported by `describeMessageDelivery`
    // so that a run with nothing to do still says what is in the database rather than saying nothing
    // is wrong with it. Problem `5NiHOF49fZ5y`.
    const counted = countTheMessages(sqlite)
    report.messagesInDatabase = counted.inDatabase
    report.messagesWithRowsAlready = counted.withRows
    report.messagesWithNoSender = counted.withNoSender
  })

  apply()
  // Read so the stamp is taken at the same clock as everything else here, and so a reader of this
  // file can see that nothing writes a SQL default.
  void nowStamp()
  return report
}

/**
 * WHERE THE DELIVERY ROWS THIS STEP WROTE WENT, in words: how many went to the owner because their message
 * names nobody, how many are queued to the recipients their message names, and how many of those are queued
 * for an agent, which the message worker's queue reads as work to hand over.
 *
 * THE ONE PLACE THESE COUNTS ARE SAID. `describeMessageDelivery` below and the messages line of THE_STEPS in
 * ./migrate.ts, which `previewMigration` and the start-up guard print, both read it, so the preview cannot
 * say something about these rows that the run's own report does not.
 */
export function whereTheDeliveryRowsWent(report: MessageDeliveryReport): string {
  return (
    `${String(report.markedSeen + report.markedDelivered)} are addressed to the owner because their message ` +
    `names nobody: ${String(report.markedSeen)} marked read because the message already said so, and ` +
    `${String(report.markedDelivered)} marked delivered. ` +
    `${String(report.toTheRecipientsNamed)} are addressed to the recipients their message names, marked ` +
    `queued, as the write door marks them. ${String(report.queuedForAnAgent)} row(s) were queued for an agent, ` +
    `and the message worker's queue reads queued rows addressed to an agent as work to hand over.`
  )
}

/** One line for the migration report, whether this step did anything or not. */
export function describeMessageDelivery(report: MessageDeliveryReport): string {
  if (report.tableMissing) {
    return (
      'messages: this database has no `message_delivery` table, so NOTHING was written and nothing was skipped ' +
      'over — there was nowhere to write. Migration 0115 creates it; point the command at the whole drizzle/ folder.'
    )
  }
  // NOTHING TO DO IS SAID IN THE COUNTS OF THE WHOLE TABLE, not of the plan. The plan sees only the
  // messages with no delivery row, so on an already-migrated database it is empty and this line used
  // to read "All 0 message(s) already say who sent them and who they reached" — vacuously true of an
  // empty set, and read as an all-clear over twenty-five messages that say nobody sent them.
  // Problem `5NiHOF49fZ5y`.
  const senders =
    report.messagesWithNoSender === 0
      ? ' Every one of them says who sent it.'
      : ` ${String(report.messagesWithNoSender)} of them still say nobody sent them: neither registry holds the ` +
        'actor that wrote those, and no sender was invented for them.'
  // NOTHING TO DO IS SAID ONLY WHEN NOTHING WAS WRITTEN, and the stamp is now part of that sum.
  // Before 12 September 2026 it was left out, so a run that stamped one row printed *nothing was
  // written* and the start guard refused over a write the report denied (problem `IhInQ2Mf5BZq`).
  const wrote =
    report.sendersWritten + report.deliveriesWritten + report.stamped === 0
      ? `messages: Nothing to do: the delivery rows exist for all ${String(report.messagesWithRowsAlready)} of the ` +
        `${String(report.messagesInDatabase)} message(s) in this database, so nothing was written, and no row was ` +
        `queued for an agent.${senders}`
      : `messages: ${String(report.messagesSeen)} message(s) read. ${String(report.sendersWritten)} of them were given the ` +
        `participant their writer answers to, restamping ${String(report.ledgerRestamped)} newest revision(s). ` +
        `${String(report.deliveriesWritten)} delivery row(s) were written. ${whereTheDeliveryRowsWent(report)} ` +
        `No message's words were changed and none was deleted.` +
        // AND THE SAME COUNT OF THE WHOLE TABLE ON A RUN THAT WROTE SOMETHING, so the two runs are
        // read against each other rather than saying different things about one database.
        senders
  const lines = [wrote]
  if (report.stampedRows.length > 0) {
    // EVERY ROW, BY ID AND WHAT CHANGED. A count alone is the shape of the defect this repairs: the
    // guard's dry run reads the same report, and a write it cannot name is one it must refuse over.
    lines.push(
      `${String(report.stamped)} delivery row(s) had the stamp written that says which writer worked their ` +
        'recipient out, because nobody named one for them: ' +
        report.stampedRows
          .map(
            (one) =>
              `${one.deliveryId} (message ${one.messageId}, ${one.recipientKind} ${one.recipientId}): ` +
              `inferred_by ${one.was === null ? 'null' : `"${one.was}"`} -> "${one.now}"`,
          )
          .join('; ') +
        '. A row somebody addressed says nothing there, and the writer\u2019s own words are untouched.',
    )
  }
  for (const one of report.sendersNotFound) {
    lines.push(
      `${one.recordId} was left with no sender: it was written by ` +
        `${one.actorType === '' ? 'nobody the change log names' : `${actorTypeWord(one.actorType).text} "${one.actorId}"`}, ` +
        'and neither registry holds that. Its own `from` line is untouched and says what its writer typed.',
    )
  }
  for (const one of report.sendersNamingMoreThanOneAgent) {
    lines.push(
      `${one.recordId} was left with no sender because "${one.actorId}" names more than one agent: ` +
        `${one.couldBe.join(' and ')}. Nothing here can tell which of them wrote it, and putting the wrong ` +
        'name on somebody\u2019s words is worse than putting none. Its own `from` line is untouched.',
    )
  }
  return lines.join(' ')
}
