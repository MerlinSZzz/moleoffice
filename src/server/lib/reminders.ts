// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS: F10 AND F13, BUILT AND TESTED TOGETHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT F10 AND F13 ASK FOR
 * ---------------------------------------------------------------------------------------
 *
 * Both criteria are in design/flows/ACCEPTANCE.md:
 *
 *   F10. Reminders about the office flow. 1. They are Mole Office messages and need no reply. 2. A reminder
 *        names the agent's registered role and duties, and says to read those duties' rules again if forgotten,
 *        especially after a compaction. 3. A reminder follows the work's expected time or tokens: a working agent
 *        that reaches them gets a mild reminder that needs no reply; if it has not finished within the second
 *        expected period, it must tell its supervisor why it is stuck, and the supervisor decides whether there
 *        is a larger problem, such as a module cut wrongly that should be split further or planned again.
 *
 *   F13. The idle flow. 1. The agent waits for work. 2. After n hours idle, the system sends it a reminder
 *        of its registered role and duties, and says to read those duties' rules again if forgotten. 3. The
 *        agent waits for work, and the system sends no more flow messages (the heartbeat goes on).
 *
 * The two triggers are built together and tested together, and n is one hour to start. The reminders
 * are for a run that was working in a flow and stopped by an accident: a compaction, a lost handle or
 * a crashed tool. So a reminder is judged on whether such a run is found and told, not on the timing
 * of a healthy one.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE READINGS THIS BUILD STANDS ON, AND THE ALTERNATIVES IT DECLINED
 * ---------------------------------------------------------------------------------------
 *
 * THE SECOND CHECKPOINT IS TWICE THE TYPED EXPECTED DURATION. F10's second expected period is the second
 * occurrence of the expected time, and "within" it means: the first period runs 0→T, the second runs T→2T, and
 * the escalation falls at 2T. That is a READING of F10, not arithmetic F10 states. The
 * alternatives considered were: a second period measured from the first reminder (rejected — nothing
 * in F10 moves the clock to the reminder), and a period measured from when the lateness was
 * first noticed (rejected for the same reason). It needs no new constant, and it does not borrow
 * F13's idle hour, which measures a different thing — an agent with no work at all, against how long
 * a piece of work was expected to take. Borrowing it would escalate a ten-minute step at one hour
 * ten and an eight-hour step at nine hours.
 *
 * THE SECOND STAGE GOES TO THE AGENT, TELLING IT TO SPEAK TO ITS SUPERVISOR. F10 says the
 * escalation becomes a message to the supervisor FROM the agent, saying why it is stuck. Who says why
 * it is stuck can only be the agent — the office does not know, and the message door refuses any
 * writer whose `sentBy` is not the writer itself (src/server/lib/records.ts), so Mole Office could
 * never file a message under an agent's name without forging it, which M110 names exactly: the office
 * is not an agent sender, its own messages go to an agent whatever its presence. So the office's part
 * at 2T is what F10 asks for — it makes the agent speak to its supervisor: a line to the
 * agent, naming the run, telling it to tell its supervisor why it is stuck, so the supervisor can
 * decide whether the module is wrongly cut. An agent alive enough to answer files that message
 * itself, in its own words. THE GAP THIS LEAVES, SAID PLAINLY: a run stopped dead by an accident
 * cannot answer, so its supervisor is not told by this mechanism alone. Whether the office should
 * also write the supervisor directly in that case is a decision F10 does not contain, and it was
 * taken to Supervisor SA rather than built.
 *
 * THESE TWO REMINDERS ARE BY TIME ONLY. When they were built, a run's token count was known only after
 * the run exited, so they never fired on tokens. Since wave 14d the office reads a running run's
 * tokens (src/config/tokens-so-far.mjs), and the step reminder (src/server/lib/step-reminders.ts), a
 * step of this pass of its own, fires on them. These two were left as they were.
 *
 * THE TIME HALF IS BUILT AGAINST AN EXPECTED TIME TYPED BY WHOEVER STARTS THE TASK. It may be typed at
 * the start door (the person's press, POST /api/messages/:id/start-an-agent) or on the run's own
 * record afterwards. Where nobody typed one, NOTHING is reminded, and the criterion says so plainly
 * rather than pretending it fires. No default expected time exists, because a guessed one would
 * remind healthy runs about a deadline nobody set.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING SWEEPS. An agent whose last activity is older than the moment this watcher started is left
 * alone until it is active again: measured on the live office on 11 September 2026, 61 agents read
 * offline and not retired, and three of them were working perfectly well — the supervisors of the
 * three clusters and every worker of this cluster. An agent with NO recorded activity is also left
 * alone: nobody has recorded anything is a real answer. The reminders judge activity — messages sent
 * and received, runs started and their output — and never the presence reading, for the same reason
 * M109 lists instead of retiring on it: presence is true only for an agent that runs a waiter, and an
 * agent started as a subagent holds no handle and reads offline while working.
 *
 * THE REMINDERS DO NOT READ WHETHER A COMPACTION HAPPENED. Since wave 13k round 46 tools/session-hook.mjs
 * tells a compaction apart (SessionStart source `compact`), gives the role and rules back first and
 * records it in the run's `data.compactions`; nothing here reads that. So the note to re-read the
 * rules is in EVERY reminder, which is what F10's "especially after a compaction" asks for: *especially*
 * after, not only. The office does not send a second reminder for the same spell, and it sends nothing while
 * an agent is working: the idle spell is measured from the newest activity, and an office line is not
 * activity, so a reminder never restarts the clock it belongs to.
 *
 * SENT ONCE PER SPELL AND PER STAGE, seen by reading the conversation rather than by storing a flag:
 * each line below is fixed words, and the reader looks for those exact words beside the recipient
 * (and, for F10, beside the run they name), the way `tellTheGroupTheAgentsAreWaiting` does.
 */

import { join } from 'node:path'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { records, messageDelivery, ONE_KIND_WRITTEN_OUT, STORED_FIELDS, theKindOfARowFoundById, theProjectOfARowFoundById } from '../db/schema.ts'
import { and, eq, inArray, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { REPO_ROOT } from '../../config/settings.mjs'
import { anInstantNamesItsStamp, localStamp, momentOfAStampAndItsInstant, parseAnyStamp } from '@shared/time.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { SANDBOX_RUN_REMINDER } from '../../config/launcher-notices.mjs'
import { idleReminderHours, replyReminderMinutes } from './env.ts'
import { writeASystemLineToOne } from './groups.ts'
import { aFreshCount, countedApart } from './slow-requests.ts'
// THE SECRETARY'S BROADCAST, by a decision of 16 September 2026. It is its own module
// because the schedule, the reminder, the recognition and the pause are one subject; this watcher
// calls one tick of it beside the flow reminders, on the same clock and at the same moment.
import { sendTheBroadcastRemindersThatAreDue, theFirstReadingsOfTheBroadcasts } from './broadcast.ts'
import { sendTheStepRemindersThatAreDue } from './step-reminders.ts'
import { sendTheMainWorldRemindersThatAreDue } from './main-world.ts'
// A DRAFT NOT SENT, said once per version to its writer or its writer's starter.
import { sendTheDraftRemindersThatAreDue } from './drafts.ts'
import { sendTheTurnDraftsThatAreDue } from './turn-drafts.ts'
import { sendTheChecklistRemindersThatAreDue, theOpenItemsSentenceFor } from './checklists.ts'
import { sendTheReplyRemindersThatAreDue, type ReplyReminderCatchUp } from './reply-reminder.ts'
// A NOTEBOOK, OR A PROJECT'S MODULES OR FLOWS, LEFT UNCHANGED, said once a day. Decisions jlXCnK4feOuR and aZGg6gerakM1.
import { sendTheStaleRecordRemindersThatAreDue } from './stale-records.ts'
import { type RegisteredAgent } from './participants.ts'
import { theseAgentsInTheRegistrysOrder } from '../db/these-agents-in-the-registrys-order.ts'
import { readParticipant } from '../db/read-participant.ts'
// THE ROLE AND DUTIES SENTENCE, and the one place it lives now that the card message carries it too.
import { theRoleAndDutiesOf } from './cardmessage.ts'
import { createLink, getRecord, patchRecord, type Actor } from './records.ts'
import { theAgentOfARunForItsSeal } from './inspection.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { tellTheStartersOfChecksNothingStarts } from './a-check-nothing-starts.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { everyAgentsIdentityReadOnce, theOneAgentAStringNames, type TheIdentityOf } from './agent-references.ts'
import { THE_PERSON } from '@shared/person.ts'
// WHICH PROJECTS THIS INSTALLATION HOLDS. The registry is the one list, since the sweep's record
// reads are per project and reading only the project the server started in left the rest unswept.
import { listWorkspaces } from '../db/list-workspaces.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { messagesInTheViewOf } from './message-centre.ts'
// THE READING OF A STOP CAUSE IS SHARED WITH THE HOOK, so the hook's `end` branch and this sweep
// cannot come to two different answers about why one run stopped. Criterion M94 and the office's
// decision.
import {
  STOP_CAUSE_KIND_IN_SQL,
  THE_CAUSES_THEY_MUST_ACT_ON,
  theCauseInWords,
  thePatchThatClosesARun,
  theStopCauseInTheTranscript,
  theStopCauseOf,
} from '../../config/stopped-run-cause.mjs'
// AND THE HOLDING ROWS OF ISOLATED WORLDS THAT ARE GONE. The withdrawn lease design left rows
// titled `Holding isolated world …` saying `running` for worlds stopped long before.
// Problem `2G9jNsuJwJf4`. The file says what a holding row is and
// where the list of what is running comes from.
import { closeTheHoldingRowsOfWorldsThatAreGone } from './isolated-worlds.ts'
import { closeTheOwnRowsWhoseProcessIsGone, closeTheRunningRowsWhoseDirectoryIsGone, closeTheRunsWhoseSandboxContainerStopped, closeTheSandboxRunsWhoseLauncherEnded, theProcessesTheOwnRowsCloseReads, theSandboxContainerReadingsForAPass } from './own-rows.ts'
import { theFieldsOfEverySession, theSessionIdsWhere } from './session-fields.ts'
import { saysStillGoing } from '../../config/still-going.mjs'
import { theNewestUsesWithTheirMomentsOf } from './newest-use.ts'
import { theRecordsThatMayHoldOneOf } from './record-text-index.ts'
import { endDispatchesWhoseWorkerIsGone, theProcessesTheGoneDispatchCheckReads } from './gone-dispatch-workers.ts'
import { osProbe, readFirst } from './resources.ts'
import { nameTheKeyFilesInTheSandboxesASliceAtATime } from './key-files.ts'
import { tellTheSecretaryHowMuchOfTheWeekIsUsed, warmTheRoundsInTheSandboxes } from './logins-week.ts'
import { tellTheSecretaryOfTheHold } from './checks-held-for-a-limit.ts'
import { sendTheGovernsCheck, theGovernsCheckIsDue, theServersDay } from './governs.ts'
import { A_LONG_RUN_MS, named, runNamed } from './named-timers.ts'
import { theBoundPort } from './bound-address.ts'

/** The office writes its reminders in its own name, and never in an agent's. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** How often the reminders look, in milliseconds. A reminder is an hour late at worst. */
const EVERY = 60_000
/** How often the office looks for key files left in sandboxes' out/ folders: it walks folders, so not every minute. */
const KEY_FILES_EVERY = 10 * 60_000

/** Where the isolated-world tool keeps one directory per world it has started. */
export function theIsolatedWorldsFolder(): string {
  return join(REPO_ROOT.replace(/\/$/, ''), '.logs', 'isolated')
}

// ============================================================================ the clocks

/** A stamp this product can read, as milliseconds, or null because it is not one. */
function inMs(stamp: unknown): number | null {
  if (typeof stamp !== 'string' || stamp.trim() === '') return null
  const at = parseAnyStamp(stamp)
  return at === null ? null : at.getTime()
}

/** The shapes of an instant `clockStamp` writes, as GLOB patterns: seconds, then milliseconds or none, then Z or an offset. */
const THE_SHAPES_OF_AN_INSTANT = ['Z', '.[0-9][0-9][0-9]Z', '[-+][0-9][0-9]:[0-9][0-9]', '.[0-9][0-9][0-9][-+][0-9][0-9]:[0-9][0-9]']
  .map((end) => `'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]${end}'`)

/**
 * WHETHER AN INSTANT NAMES THE STAMP BESIDE IT, TESTED BY SQLITE: the test `anInstantNamesItsStamp` in src/shared/time.ts
 * makes, so a grouped reading follows the rule of `momentOfAStampAndItsInstant` and no row is read in JavaScript. The
 * instant has one of the shapes above, and its first 19 characters are the stamp with T for the space. SQLite's
 * `replace` changes every space where `String.replace` changes the first, and the two tests agree all the same: those 19
 * characters of an instant of these shapes hold one T and no space, so a stamp with more than one space fails both. It
 * is NULL when the instant is NULL, and `CASE WHEN` reads NULL as false.
 */
function anInstantNamesItsStampInSQLite(stamp: SQLWrapper, instant: SQL): SQL {
  const shaped = sql.join(THE_SHAPES_OF_AN_INSTANT.map((shape) => sql`${instant} GLOB ${sql.raw(shape)}`), sql` OR `)
  return sql`((${shaped}) AND substr(${instant}, 1, 19) = replace(${stamp}, ' ', 'T'))`
}

/**
 * THE MOMENT A STAMP NAMES, READ WITH ITS INSTANT BY SQLITE, AS MILLISECONDS, or NULL when the instant does not name the
 * stamp or cannot be read. So a grouped `max` can take the latest moment. The moment is the instant's second in its
 * offset, with the milliseconds left out, as `momentOfAStampAndItsInstant` gives it: SQLite's `julianday()` is handed the
 * first 19 characters and what follows the milliseconds, Z or the offset, and reads that as its moment in UTC, as
 * `Date.parse` does. It would read a bare number as a count of days, so it is asked only after the shape is tested. It is
 * looser than `momentOfAnInstant` only on words no clock writes: it takes a day past the end of its month and the hour
 * 24, and gives NULL for an offset of more than fourteen hours.
 */
function theMomentInSQLiteOf(stamp: SQLWrapper, instant: SQL): SQL<number | null> {
  const theZone = sql`CASE WHEN substr(${instant}, 20, 1) = '.' THEN substr(${instant}, 24) ELSE substr(${instant}, 20) END`
  const theSecond = sql`julianday(substr(${instant}, 1, 19) || ${theZone})`
  return sql<number | null>`CASE WHEN ${anInstantNamesItsStampInSQLite(stamp, instant)} THEN CAST(round((${theSecond} - 2440587.5) * 86400000) AS INTEGER) END`
}

/**
 * THE VALUE SQLITE'S `max` KEEPS OF TWO, as read from a column or from `json_extract`: NULL is passed over, a number
 * comes before any text, text before any blob, and text is ordered by its UTF-8 bytes. So '2030-03-04T19:00:00Z' comes
 * after '2030-03-04 20:00:00', because "T" comes after a space, though it is the earlier time.
 */
function theLaterInSQLitesOrder(one: unknown, other: unknown): unknown {
  if (one === null || one === undefined) return other
  if (other === null || other === undefined) return one
  return inSQLitesOrder(other, one) > 0 ? other : one
}

/** Below zero when `one` comes first in SQLite's order of values, zero when they are equal, above zero after. */
function inSQLitesOrder(one: unknown, other: unknown): number {
  const rank = (value: unknown): number => (typeof value === 'number' || typeof value === 'bigint' ? 0 : typeof value === 'string' ? 1 : 2)
  if (rank(one) !== rank(other)) return rank(one) - rank(other)
  if (typeof one === 'string' && typeof other === 'string') return inUTF8Order(one, other)
  if (typeof one === 'number' || typeof one === 'bigint') return one < (other as number) ? -1 : one > (other as number) ? 1 : 0
  return Buffer.compare(one as Uint8Array, other as Uint8Array)
}

/**
 * TWO TEXTS IN THE ORDER OF THEIR UTF-8 BYTES, which is the order of their code points. JavaScript compares UTF-16 units,
 * which differs from it only where a surrogate meets a letter from U+E000 up, so there the code points are compared.
 */
function inUTF8Order(one: string, other: string): number {
  const shorter = Math.min(one.length, other.length)
  for (let at = 0; at < shorter; at++) {
    const a = one.charCodeAt(at)
    const b = other.charCodeAt(at)
    if (a === b) continue
    if (a < 0xd800 && b < 0xd800) return a - b
    // THE PAIR STARTS ONE UNIT EARLIER when the units before are the same high surrogate.
    const from = at > 0 && ((a >= 0xdc00 && a <= 0xdfff) || (b >= 0xdc00 && b <= 0xdfff)) ? at - 1 : at
    return one.codePointAt(from)! - other.codePointAt(from)!
  }
  return one.length - other.length
}

// ============================================================================ what counts as activity

/**
 * THE NEWEST ACTIVITY OF EVERY AGENT, IN ONE READING, as milliseconds by registry id.
 *
 * Activity is what the agent sent, what was sent to it, the runs it has, what those runs wrote
 * down, and their uses of tools. Nothing here reads presence, and the office's own lines are not activity — a reminder, a
 * group line or a finish line is a flow message, and F13's step 3 says the heartbeat
 * continues and no further flow message is sent; if the office's own lines counted as received, the
 * first reminder would restart the clock it belongs to and a second reminder could never be honest
 * about being a new spell.
 *
 * IT IS THREE GROUPED READINGS AND NOT ONE PER AGENT, because this runs every minute against a
 * registry that holds hundreds of agents: per agent would be a scan of every message per agent, and
 * three scans once a minute is less than the queue read the office already answers twice a second.
 *
 * THE MESSAGES ARE READ ONLY FROM A DAY BEFORE `since`. `theIdleReminderIsDue` passes over an agent whose newest
 * activity is before the watcher started, so a message written before then can change no answer: when the newest is
 * after `since` it is among the rows read, and when it is not, the agent is passed over either way. The stored stamp is
 * compared before any JSON is parsed. A day of margin, because a local stamp's order can step back at a clock change; a
 * stamp not in the stored form is always read. Measured 10 October 2026 on a copy at the live counts: the two message
 * readings parsed all 31,000 messages, 140 ms of every minute (wave 13y round 16).
 *
 * AND EVERY READING FINDS ITS ROWS BY `updated_at`, THROUGH `records_updated_idx` (wave 13y round 17). A row's created_at
 * and the newest output its run wrote down are never later than its updated_at: the insert sets both stamps to `now()`,
 * every later write sets updated_at to `now()` (see lib/session-fields.ts for the writes), and an output is written down
 * after it happened. So a row whose updated_at is before the cut has nothing at or after `since` to give, and is passed
 * over either way. That holds only for stamps in the stored form; on the live office on 10 October 2026 no record had
 * any other, and none had created_at after updated_at. Before this the runs were read whole, about 45 ms a pass on a
 * copy at the live counts, and each message reading still visited every message to compare its stamp. A use of a tool
 * is the one thing that breaks that claim, because it moves no stamp on its run, so the runs that are running are read
 * as well, through their own index, and each is asked for its newest use (round 33b).
 *
 * A MESSAGE WHOSE DATA IS NOT VALID JSON cannot say who sent it, and its delivery rows say only who it reached. It is
 * left out of the agents' activity and given back in `unreadable`, with the time it was written, from the same rows the
 * two message readings take. Before wave 13q such a message stopped the whole pass with an error.
 *
 * `identityOf` answers which agent each run serves, from every agent's identity read once. With one statement for each
 * run and group, and every agent built for the loop that sends, the idle step ran 3,585 statements a pass on a made-up
 * office of the live size; with these, 1,371.
 *
 * EACH ACTIVITY'S STAMP IS READ WITH THE MOMENT KEPT BESIDE IT, by the rule of `momentOfAStampAndItsInstant` in
 * src/shared/time.ts: a message's `writtenTime`, a run's `filedTime` and `lastOutputTime`, and a use's `at_instant`
 * (migration 0358). On the night the clocks go back a stamp alone reads the second pass of the hour from 01:00 as the
 * first, so an agent that sent a message at 01:10 winter time was reminded half an hour later. The moment is read only
 * when it names the stamp beside it, so a stamp changed alone is read from its words. Each message reading gives two
 * values for each agent: the latest stamp of the messages whose moment does not name it, kept as SQLite's `max` keeps it
 * and read as before, and the latest of the moments that do, which SQLite works out by the same rule
 * (`theMomentInSQLiteOf`). A run gives its stamps the same way, grouped here, and a use gives its stamp or its moment. The
 * newest activity is the latest of all of them, as milliseconds. A moment that names its stamp and cannot be read gives
 * nothing, as a stamp that cannot be read gives nothing.
 */
function activityPerAgent(since: number, identityOf: TheIdentityOf): { newest: Map<string, number>; unreadable: { id: string; createdAt: string }[] } {
  const fromTheDayBefore = localStamp(new Date(since - 24 * 3_600_000))
  const writtenSince = sql`(${records.createdAt} >= ${fromTheDayBefore} OR ${records.createdAt} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]')`
  // `+kind` KEEPS SQLITE OFF THE KIND INDEX, so it takes the rows changed since the cut by `records_updated_idx`.
  const changedSince = sql`${records.updatedAt} >= ${fromTheDayBefore}`
  const ofKind = (kind: 'message' | 'session') => sql`+${records.kind} = ${kind}`
  const office = moleOffice().id
  const perAgent = new Map<string, number>()
  const keepTheMoment = (who: unknown, ms: number | null): void => {
    if (typeof who !== 'string' || who === '' || ms === null) return
    const held = perAgent.get(who)
    if (held === undefined || ms > held) perAgent.set(who, ms)
  }
  const keep = (who: unknown, at: unknown): void => keepTheMoment(who, inMs(at))
  // A MESSAGE WHOSE MOMENT NAMES ITS STAMP GIVES ITS MOMENT, and any other gives its stamp: one written before its moment
  // was kept, and one whose stamp was changed alone.
  const writtenTime = sql`json_extract(${records.data}, '$.writtenTime.instant')`
  const theLatestStampWithNoMoment = sql<string | null>`max(CASE WHEN ${anInstantNamesItsStampInSQLite(records.createdAt, writtenTime)} THEN NULL ELSE ${records.createdAt} END)`
  const theLatestMoment = sql<number | null>`max(${theMomentInSQLiteOf(records.createdAt, writtenTime)})`
  // RECEIVED: a delivery row naming the agent, on a message the office did not write. A CROSS JOIN, because SQLite keeps
  // the order of one: the messages are read first and cut by their stamp, and only theirs are looked up among the
  // delivery rows. Joined the other way, every agent's delivery row looked its message up first, 39 ms against 14.
  for (const row of db
    .select({ who: messageDelivery.recipientId, at: theLatestStampWithNoMoment, moment: theLatestMoment })
    .from(records)
    .crossJoin(messageDelivery)
    .where(
      and(
        changedSince,
        eq(messageDelivery.messageId, records.id),
        eq(messageDelivery.recipientKind, 'agent'),
        ofKind('message'),
        isNull(records.deletedAt),
        writtenSince,
        sql`CASE WHEN json_valid(${records.data}) THEN NOT (json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${office}) END`,
      ),
    )
    .groupBy(messageDelivery.recipientId)
    .all()) {
    keep(row.who, row.at)
    keepTheMoment(row.who, row.moment)
  }
  // SENT: a message whose sender is an agent — its own answers are filed under its name. The
  // office's own sends are excluded, for the reason at the top.
  for (const row of db
    .select({ who: sql<string>`json_extract(${records.data}, '$.sentBy.id')`, at: theLatestStampWithNoMoment, moment: theLatestMoment })
    .from(records)
    .where(
      and(
        changedSince,
        ofKind('message'),
        isNull(records.deletedAt),
        writtenSince,
        sql`CASE WHEN json_valid(${records.data}) THEN json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') != ${office} END`,
      ),
    )
    .groupBy(sql`json_extract(${records.data}, '$.sentBy.id')`)
    .all()) {
    keep(row.who, row.at)
    keepTheMoment(row.who, row.moment)
  }
  // THE MESSAGES NEITHER READING COULD READ, oldest first.
  const unreadable = db
    .select({ id: records.id, createdAt: records.createdAt })
    .from(records)
    .where(and(changedSince, ofKind('message'), isNull(records.deletedAt), writtenSince, sql`NOT json_valid(${records.data})`))
    .orderBy(records.createdAt, records.id)
    .all()
  // ITS RUNS: a run started for the agent, and the newest output any of its runs wrote down. A run
  // names its agent by handle in `servingAgent` and by registry id in `servingAgentId`, so the runs
  // are grouped by both, and each group is counted for the agent `theAgentARunServes` reads from it.
  // The map is keyed by registry id, and since criterion I1 a new agent's handle is not its id.
  //
  // THE START AND THE NEWEST OUTPUT COME FROM ONE PASS over the session records. `max` leaves out a
  // run with no `lastOutputAt`, so a group where no run wrote one has no newest output, and `keep`
  // passes over it. That is the same answer a second pass limited to runs with an output gave.
  //
  // THE RUNS ARE READ PLAINLY AND GROUPED HERE, and the same rows are the changed runs asked about for their uses below.
  // Grouped by SQLite, the sorter copied each run's whole record: on a made-up office of the live size that reading took
  // 52 to 67 ms, and the same rows read plainly 18 ms. Each group keeps the stamp SQLite's `max` would keep
  // (`theLaterInSQLitesOrder`), so a group whose stamps are written two ways counts the same one as before. A run's stamp
  // is kept only when the moment beside it does not name it, and the group keeps the latest of the moments that do, as
  // milliseconds.
  const aRunThatNamesItsAgent = sql`json_extract(${records.data}, '$.servingAgent') IS NOT NULL`
  const changedRuns = db
    .select({
      id: records.id,
      handle: sql<unknown>`json_extract(${records.data}, '$.servingAgent')`,
      agentId: sql<unknown>`json_extract(${records.data}, '$.servingAgentId')`,
      at: records.createdAt,
      output: sql<unknown>`json_extract(${records.data}, '$.lastOutputAt')`,
      filedTime: sql<unknown>`json_extract(${records.data}, '$.filedTime.instant')`,
      outputTime: sql<unknown>`json_extract(${records.data}, '$.lastOutputTime.instant')`,
    })
    .from(records)
    .where(and(changedSince, ofKind('session'), isNull(records.deletedAt), aRunThatNamesItsAgent))
    .all()
  const groups = new Map<string, { handle: unknown; agentId: unknown; at: unknown; output: unknown; moment: number | null }>()
  const theLaterMoment = (one: number | null, other: number | null): number | null => (one === null ? other : other === null ? one : Math.max(one, other))
  // A stamp whose moment does not name it is not read here: it goes to its group's stamp, and is read below.
  const readWithItsGroup = (): null => null
  for (const run of changedRuns) {
    const at = anInstantNamesItsStamp(run.at, run.filedTime) ? null : run.at
    const output = anInstantNamesItsStamp(run.output, run.outputTime) ? null : run.output
    const moment = theLaterMoment(
      momentOfAStampAndItsInstant(run.at, run.filedTime, readWithItsGroup),
      momentOfAStampAndItsInstant(run.output, run.outputTime, readWithItsGroup),
    )
    // THE KEY TELLS A NUMBER FROM THE SAME DIGITS AS TEXT, as SQLite's grouping does.
    const key = JSON.stringify([run.handle, run.agentId])
    const held = groups.get(key)
    if (held === undefined) groups.set(key, { handle: run.handle, agentId: run.agentId, at, output, moment })
    else {
      held.at = theLaterInSQLitesOrder(held.at, at)
      held.output = theLaterInSQLitesOrder(held.output, output)
      held.moment = theLaterMoment(held.moment, moment)
    }
  }
  for (const group of groups.values()) {
    const who = theAgentARunServes({ servingAgent: group.handle, servingAgentId: group.agentId }, identityOf)?.id ?? null
    keep(who, group.at)
    keep(who, group.output)
    keepTheMoment(who, group.moment)
  }
  // ITS RUNS' USES OF TOOLS (wave 13s round 33b, message IatdjoGLajNS). A use is one row of `tool_uses` and moves
  // nothing on the run's record, not even updated_at, so the cut above cannot find a run that has only used tools. The
  // runs asked about are the running ones, through their index, and the ones changed since the cut, through
  // `records_updated_idx`; each run's newest use is one indexed lookup (lib/newest-use.ts). A run that ended and was not
  // changed since the cut is not asked: a use is written by a run that is working.
  const servedBy = new Map<string, string>()
  // ONLY THE TWO FIELDS THAT NAME ITS AGENT are read, and no run is read whole, as in the reading above.
  const theRunAndItsAgent = {
    id: records.id,
    handle: sql<unknown>`json_extract(${records.data}, '$.servingAgent')`,
    agentId: sql<unknown>`json_extract(${records.data}, '$.servingAgentId')`,
  }
  const serves = (rows: readonly { id: string; handle: unknown; agentId: unknown }[]): void => {
    for (const row of rows) {
      const who = theAgentARunServes({ servingAgent: row.handle, servingAgentId: row.agentId }, identityOf)?.id ?? null
      if (who !== null) servedBy.set(row.id, who)
    }
  }
  serves(
    db
      .select(theRunAndItsAgent)
      .from(records)
      .where(and(eq(records.kind, 'session'), isNull(records.deletedAt), sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`, aRunThatNamesItsAgent))
      .all(),
  )
  serves(changedRuns)
  for (const [run, use] of theNewestUsesWithTheirMomentsOf(servedBy.keys())) {
    keepTheMoment(servedBy.get(run), momentOfAStampAndItsInstant(use.at, use.atInstant, inMs))
  }
  return { newest: perAgent, unreadable }
}

// ============================================================================ what has been said already

/** One office line already said to an agent: its stamp, and the moment kept beside it, null when none was kept. */
interface TheIdleLineSaid {
  at: string
  instant: unknown
}

/**
 * THE OFFICE LINES ALREADY WRITTEN TO EACH AGENT with one exact wording, as their stamps by the
 * agent's registry id, each with the moment the record door kept beside its stamp (`data.writtenTime`), or null on a line
 * written before it kept one. `theIdleReminderIsDue` reads the moment only when it names the stamp. They are read beside the delivery rows, so the reader and the writer agree
 * about who a line reached.
 *
 * ONE READING FOR EVERY AGENT, NOT ONE PER AGENT. A tick asks this for each agent past its idle
 * hour, and each separate reading was a join over the office's messages, about 13 ms on a copy of
 * the owner's office on 25 September 2026. The tick reads it once, the first time an agent needs it.
 *
 * ONLY THE LINES WRITTEN SINCE A DAY BEFORE `since` ARE READ, and `since` is when the watcher started. A line counts for
 * an agent only when it was written at or after the agent's newest activity, and `theIdleReminderIsDue` passes over an
 * agent whose newest activity is before `since`. So an older line can change no answer. The rows are found by
 * `updated_at`, for the reason `activityPerAgent` gives, with the same day of margin and the same reading of a stamp
 * not in the stored form. MEASURED, 22 October 2026, on an office of that day's shape
 * (tests/the-two-timers-at-the-live-shape.test.ts): reading every line the office ever wrote was about 25 ms of every
 * minute once the first agents were past their hour. The rows read grow with the time since the start, and are never
 * more than every message changed in that time.
 */
function officeLinesSaidToEachAgent(line: string, since: number): Map<string, TheIdleLineSaid[]> {
  const out = new Map<string, TheIdleLineSaid[]>()
  const fromTheDayBefore = localStamp(new Date(since - 24 * 3_600_000))
  // THE MESSAGES CHANGED SINCE THE CUT ARE FOUND FIRST, THROUGH `records_updated_idx`, and only their delivery rows are
  // read, by the message's id. Joined from the delivery rows, SQLite took every delivery row to an agent and looked its
  // message up: 91 ms and 113.7 MB read from the file each minute, on a copy of the office on 15 October 2026 (wave 13y
  // round 36). The index is named, so a missing index is an error and not a slow read. CROSS JOIN keeps that order.
  // A MESSAGE WHOSE DATA IS NOT VALID JSON IS NOT REACHED, as it was not when these lines were found through the index of
  // who wrote a message: the writer is read through `json_valid` first, and the body only from a message the office wrote.
  for (const one of db.all<{ to: string; at: string; instant: unknown }>(sql`SELECT ${messageDelivery.recipientId} AS "to", ${records.createdAt} AS at,
    json_extract(${records.data}, '$.writtenTime.instant') AS instant
    FROM ${records} INDEXED BY records_updated_idx
    CROSS JOIN ${messageDelivery} ON ${messageDelivery.messageId} = ${records.id}
    WHERE ${and(
      sql`${records.updatedAt} >= ${fromTheDayBefore}`,
      sql`(${records.createdAt} >= ${fromTheDayBefore} OR ${records.createdAt} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]')`,
      ONE_KIND_WRITTEN_OUT.message,
      isNull(records.deletedAt),
      sql`CASE WHEN ${STORED_FIELDS.messageSentById(records.data)} = ${moleOffice().id} THEN json_extract(${records.data}, '$.body') = ${line} AND json_extract(${records.data}, '$.sentBy.kind') = 'agent' END`,
      eq(messageDelivery.recipientKind, 'agent'),
    )}`)) {
    const said = { at: one.at, instant: one.instant }
    const held = out.get(one.to)
    if (held === undefined) out.set(one.to, [said])
    else held.push(said)
  }
  return out
}

/**
 * THE OFFICE LINES ALREADY WRITTEN ABOUT RUNS with any of the given wordings, as one key per run
 * and wording (see `aboutARun`).
 *
 * ONE READING FOR EVERY RUN, NOT TWO PER RUN. The expected-time loop asks two wordings of every run
 * it watches, and each separate question was a scan of the office's messages, about 10 ms on a copy
 * of the owner's office on 25 September 2026. A run id is only ever matched as text, as the separate
 * question matched it, so a line whose `aboutRun` is not text names no run here either.
 */
function officeLinesSaidAboutRuns(lines: readonly string[]): Set<string> {
  const out = new Set<string>()
  // THE OFFICE'S OWN MESSAGES ARE FOUND THROUGH THE INDEX OF WHO WROTE A MESSAGE (migration 0199), as the idle lines are
  // above. Asked by the kind alone, SQLite tested every message of the office for its words and its writer: 37.6 ms and
  // 60.4 MiB read from the file each time, on a copy of the office made on 5 October 2026 (wave 13y round 39), against
  // 13.8 ms and 25.8 MiB this way, which tests only the messages the office wrote, 11,724 of 25,696 there. A test on a
  // made-up office holds the same lines about the same runs. The index is named, so a missing index is an error and not
  // a slow read, and the kind is written out, because SQLite uses that index only for a query that names the kind in its
  // words. A message whose data is not valid JSON is not reached, because the index holds no writer for it; asked the old
  // way, such a message stopped the read with an error.
  for (const one of db.all<{ run: unknown; line: unknown }>(sql`SELECT json_extract(${records.data}, '$.aboutRun') AS run,
    json_extract(${records.data}, '$.body') AS line
    FROM ${records} INDEXED BY records_message_sent_by_idx
    WHERE ${and(
      ONE_KIND_WRITTEN_OUT.message,
      eq(STORED_FIELDS.messageSentById(records.data), moleOffice().id),
      isNull(records.deletedAt),
      sql`json_extract(${records.data}, '$.aboutRun') IS NOT NULL`,
      sql`json_extract(${records.data}, '$.body') IN (${sql.join(
        lines.map((line) => sql`${line}`),
        sql`, `,
      )})`,
      sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
    )}`)) {
    if (typeof one.run === 'string' && typeof one.line === 'string') out.add(aboutARun(one.run, one.line))
  }
  return out
}

/** The key `officeLinesSaidAboutRuns` keeps for one run and one wording. */
function aboutARun(run: string, line: string): string {
  return JSON.stringify([run, line])
}

// ============================================================================ M94, why a run stopped

/**
 * A RUN THAT STOPPED FOR A REASON THE PERSON MUST ACT ON, TOLD TO THEM ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE OFFICE READS THE TRANSCRIPT ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * `tools/session-hook.mjs` writes the stop cause at SessionEnd, and that is enough for a session
 * that ends cleanly. It is NOT enough for the case this criterion exists for: a session stopped by
 * a limit does not end — Claude Code answers the request with a 429 and the session waits to be
 * resumed — so SessionEnd may never fire, and a session whose terminal is closed while it is
 * limited never reaches it at all. The run record then sits at `running` with nothing behind it.
 * This sweep reads such a run's own transcript and writes the cause down, through the same two
 * functions the hook calls.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE NOTICE PER CAUSE PER HOUR, AND WHERE THE LAST-NOTICE FACT LIVES
 * ---------------------------------------------------------------------------------------
 *
 * A cause is not told per run, which is the fault M94 names (ten copies): runs stopped for the same
 * cause are folded into one notice naming all of them. The fact "this cause has already been told
 * inside the hour" is kept ON THE NOTICE MESSAGE ITSELF, in `data.extra.m94`, and read back by
 * `theLastNoticeFor`. A record and not a flag in memory, so a restart of the API cannot resend it;
 * and the same records table every other reader already reads, so nothing new has to be kept in
 * step. The cause's own words and the machine-readable cause are on the run record, written by the
 * hook or by the close below.
 */

/** How stale a run's last output must be before its transcript is read for a stop cause. */
const A_STOPPED_RUN_IS_QUIET_FOR = 5 * 60_000

/** At most one notice per cause in this long. Criterion M94: one notice per cause per hour. */
const ONE_NOTICE_PER_CAUSE_EVERY = 60 * 60_000

/** One run the sweep is judging for a stop cause, as the record holds it. */
interface ARunThatMayHaveStopped {
  id: string
  title: string
  data: Record<string, unknown>
  createdAt: string
}

/**
 * When a run last produced output, as milliseconds, or null because it never recorded one. The step reminder reads it
 * too, as one of a run's signs of life (./step-reminders.ts).
 */
export function theLastOutputOf(run: Pick<ARunThatMayHaveStopped, 'data'>): number | null {
  const lastOutputTime = run.data['lastOutputTime'] as { instant?: unknown } | undefined
  return inMs(lastOutputTime?.instant) ?? inMs(run.data['lastOutputAt'])
}

/** The transcript the hook wrote onto this run, or null because nobody recorded one. */
function theLogPathOf(run: ARunThatMayHaveStopped): string | null {
  const extra = run.data['extra']
  if (extra === null || typeof extra !== 'object') return null
  const discovered = (extra as Record<string, unknown>)['discovered']
  if (discovered === null || typeof discovered !== 'object') return null
  const path = (discovered as Record<string, unknown>)['logPath']
  return typeof path === 'string' && path !== '' ? path : null
}

/**
 * THE RUNS THAT WENT QUIET STILL SAYING THEY ARE RUNNING, with a transcript somebody can read.
 *
 * A run with no `lastOutputAt` is left alone: nothing recorded when it last spoke, and inventing a
 * clock for it would read a transcript that may belong to work still going. A run whose output is
 * recent is left alone: it is writing, and its last line is ordinary work.
 */
function theRunsThatWentQuietStillSayingRunning(workspaceId: string, now: Date): ARunThatMayHaveStopped[] {
  const at = now.getTime()
  // ONLY THE ROWS WHOSE KEPT FIELDS MAY HOLD ARE ASKED ABOUT (lib/session-fields.ts); the condition below still decides.
  const mayHold = theSessionIdsWhere(
    workspaceId,
    (one) => (one.state === 'running' || one.state === 'orphaned') && !one.closedBecauseIsSet && one.hasALogPath,
  )
  if (mayHold.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): a run that went away without closing keeps saying it is running, so this
  // list grows with the project's runs. The rowid is read as well, and the joined rows are sorted by it again.
  const rows: ARunThatMayHaveStopped[] = readInPieces(mayHold, (piece) =>
    db
      .select({ id: records.id, title: records.title, data: records.data, createdAt: records.createdAt, rowid: sql<number>`${records}.rowid` })
      .from(records)
      .where(
        and(
          inArray(records.id, piece),
          theKindOfARowFoundById('session'),
          theProjectOfARowFoundById(workspaceId),
          isNull(records.deletedAt),
          sql`json_extract(${records.data}, '$.state') IN ('running', 'orphaned')`,
          sql`json_extract(${records.data}, '$.closedBecause') IS NULL`,
          sql`json_extract(${records.data}, '$.extra.discovered.logPath') IS NOT NULL`,
        ),
      )
      // IN THE ORDER THE ROWS WERE STORED, which is the order the kind's index gave when this read walked it.
      .orderBy(sql`${records}.rowid`)
      .all(),
  )
    .sort((one, other) => one.rowid - other.rowid)
    .map((row) => ({ id: row.id, title: row.title, data: row.data, createdAt: row.createdAt }))
  return rows.filter((run) => {
    const lastOutput = theLastOutputOf(run)
    return lastOutput !== null && at - lastOutput >= A_STOPPED_RUN_IS_QUIET_FOR
  })
}

/**
 * READ THE TRANSCRIPTS AND WRITE THE CAUSE, with the same function the hook uses.
 *
 * Only a cause that was really read closes a record. A transcript that says nothing leaves the run
 * exactly as it is: absence is a real answer and the office does not invent a reason so it can send
 * a notice.
 */
function closeTheRunsTheTranscriptSaysStopped(workspaceId: string, now: Date): string[] {
  const closed: string[] = []
  for (const run of theRunsThatWentQuietStillSayingRunning(workspaceId, now)) {
    const cause = theStopCauseInTheTranscript(theLogPathOf(run))
    if (cause === null) continue
    patchRecord(run.id, { dataPatch: thePatchThatClosesARun(cause, now, null) }, theOffice())
    closed.push(run.id)
  }
  return closed
}

/**
 * EVERY RUN EACH CAUSE STOPPED, by cause, newest last.
 *
 * ONE READING FOR EVERY CAUSE, NOT ONE PER CAUSE. The tick used to ask this once for each cause the person
 * must act on. Each question was a scan of the session records, about 7 ms on a copy of the owner's office
 * on 25 September 2026. The single reading gives the rows in the order they were stored, as each question did, so
 * each cause's runs come back in the order its own question gave them. Since wave 13y round 35 it finds them by their
 * ids and not through the kind's index: 8.3 ms on a copy of the office, and 0.03 ms.
 */
function theRunsStoppedForEachCause(workspaceId: string, causes: readonly string[]): Map<string, ARunThatMayHaveStopped[]> {
  const out = new Map<string, ARunThatMayHaveStopped[]>()
  // ONLY THE ROWS WHOSE KEPT FIELDS MAY HOLD ARE ASKED ABOUT (lib/session-fields.ts); the condition below still decides.
  const mayHold = theSessionIdsWhere(
    workspaceId,
    (one) => typeof one.stopCause === 'string' && causes.includes(one.stopCause) && one.closedBecauseIsSet,
  )
  if (mayHold.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): every run a cause ever stopped in the project is named here, so this list
  // grows with the project's runs. The rowid is read as well, and the joined rows are sorted by it again.
  for (const row of readInPieces(mayHold, (piece) =>
    db
      .select({
        id: records.id,
        title: records.title,
        data: records.data,
        createdAt: records.createdAt,
        cause: sql<unknown>`${sql.raw(STOP_CAUSE_KIND_IN_SQL)}`,
        rowid: sql<number>`${records}.rowid`,
      })
      .from(records)
      .where(
        and(
          inArray(records.id, piece),
          theKindOfARowFoundById('session'),
          theProjectOfARowFoundById(workspaceId),
          isNull(records.deletedAt),
          sql`${sql.raw(STOP_CAUSE_KIND_IN_SQL)} IN (${sql.join(
            causes.map((cause) => sql`${cause}`),
            sql`, `,
          )})`,
          sql`json_extract(${records.data}, '$.closedBecause') IS NOT NULL`,
        ),
      )
      // IN THE ORDER THE ROWS WERE STORED, newest last, which is the order the kind's index gave when this read walked it.
      .orderBy(sql`${records}.rowid`)
      .all(),
  ).sort((one, other) => one.rowid - other.rowid)) {
    if (typeof row.cause !== 'string') continue
    const run: ARunThatMayHaveStopped = { id: row.id, title: row.title, data: row.data, createdAt: row.createdAt }
    const held = out.get(row.cause)
    if (held === undefined) out.set(row.cause, [run])
    else held.push(run)
  }
  return out
}

/**
 * THE NEWEST NOTICE ALREADY SENT FOR EACH CAUSE, by cause. A cause no notice was ever sent for is
 * not in the map.
 *
 * ONE READING FOR EVERY CAUSE, NOT ONE PER CAUSE. Each separate question was a scan of the office's
 * messages, about 17 ms on a copy of the owner's office on 25 September 2026. The newest stamp is `max`
 * here, where it was the first row in newest-first order before, and those are the same stamp.
 */
function theLastNoticeForEachCause(workspaceId: string, causes: readonly string[]): Map<string, { at: string }> {
  const out = new Map<string, { at: string }>()
  // THE NOTICES ARE FOUND FIRST, THROUGH THE INDEX ON THE CAUSE (migration 0228), and only they are read. Asked
  // as one plain query, SQLite read the data of every message: 107 ms of the pass on live on 10 October 2026. Given
  // the cause in the index's words, it still chose the kind's index, or the project's for the view's test, so
  // the index is named, in a subquery the outer reading takes ids from. A missing index is then an error and not
  // a slow read. ONE STATEMENT, so the tick still asks this question once
  // (tests/the-minute-tick-and-the-runtime-door-read-once.test.ts).
  const theNotices = sql`(SELECT id FROM records INDEXED BY records_message_stop_cause_idx WHERE kind = 'message' AND (CASE WHEN json_valid(data) THEN json_extract(data, '$.extra.m94.cause') END) IN (${sql.join(
    causes.map((one) => sql`${one}`),
    sql`, `,
  )}))`
  // CROSS JOIN, because SQLite keeps that order: the notices first, then each one's record by its id. Asked as
  // `id IN (the notices)` instead, it began from the project's index, for the view's test, and read every live record
  // of the project. A plain JOIN is planned in this order too on the test's office; CROSS JOIN makes it a rule.
  const rows = db.all<{ cause: unknown; at: string }>(sql`SELECT json_extract(${records.data}, '$.extra.m94.cause') AS cause, max(${records.createdAt}) AS at
    FROM ${theNotices} AS notice CROSS JOIN ${records} ON ${records.id} = notice.id
    WHERE ${and(
      theKindOfARowFoundById('message'),
      // THIS PROJECT'S VIEW OF THE MESSAGE CENTRE, or a notice would be sent again on every tick.
      messagesInTheViewOf(justThisProject(workspaceId)),
      isNull(records.deletedAt),
      sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent'`,
      sql`json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
    )}
    GROUP BY cause`)
  for (const row of rows) {
    if (typeof row.cause === 'string') out.set(row.cause, { at: row.at })
  }
  return out
}

/** The cause's own words from a run that carried one, falling back to its close sentence. */
function theCauseSaidBy(run: ARunThatMayHaveStopped): string {
  const said = theStopCauseOf(run.data)?.['said']
  if (typeof said === 'string' && said !== '') return said
  return typeof run.data['closedBecause'] === 'string' ? run.data['closedBecause'] : ''
}

/**
 * The reset time one run's cause carries, or null because it carries none. When the cause also says where its reset
 * came from (`resetFrom`, which the launcher writes for a Go stop), those words follow the time as they were stored,
 * so the person can tell a time the error named from one the office assumed. A cause that says nothing about it gets
 * nothing added.
 */
function theResetThisRunNames(run: ARunThatMayHaveStopped): string | null {
  const stopCause = theStopCauseOf(run.data)
  if (stopCause === null) return null
  const { resetsAt: resets, resetFrom: from } = stopCause
  if (typeof resets !== 'string' || resets === '') return null
  return typeof from === 'string' && from !== '' ? `${resets}, ${from}` : resets
}

/**
 * THE MESSAGE A STOPPED RUN WAS CARRYING, by its record id, or null because it named none.
 *
 * Criterion M128: the M94 notice is a system line in the conversation it is about, and this is the
 * message that puts it there. It is read off the run's own `deliveringMessage`, so it is where the
 * run really was and never a guess. A run that was not delivering a message — a check, a manual
 * start — names none, and the notice then falls back to the person's own conversation with the
 * office.
 */
function theMessageThisRunWasCarrying(run: ARunThatMayHaveStopped): string | null {
  const said = run.data['deliveringMessage']
  return typeof said === 'string' && said !== '' && said !== 'none-here' ? said : null
}

/**
 * ONE NOTICE PER CAUSE IN AN HOUR, naming every run that cause stopped since the last notice.
 *
 * Nothing is sent when the cause stopped no run since the last notice, and nothing is sent twice
 * inside the hour. When no notice has ever been sent for a cause, every run recorded for it is
 * named once — which is how a stop that happened while the server was down is still told.
 */
function tellThemOncePerCause(workspaceId: string, now: Date): string[] {
  const at = now.getTime()
  const sent: string[] = []
  // THE RUNS AND THE LAST NOTICES ARE READ ONCE FOR EVERY CAUSE. A notice this loop writes names
  // only its own cause, and that cause has already been judged, so no later cause's answer changes.
  // The notices are read only when some cause stopped a run, as they were before.
  const stoppedFor = theRunsStoppedForEachCause(workspaceId, THE_CAUSES_THEY_MUST_ACT_ON)
  const lastNotices =
    stoppedFor.size === 0
      ? new Map<string, { at: string }>()
      : theLastNoticeForEachCause(workspaceId, THE_CAUSES_THEY_MUST_ACT_ON)
  for (const theCause of THE_CAUSES_THEY_MUST_ACT_ON) {
    const runs = stoppedFor.get(theCause) ?? []
    if (runs.length === 0) continue
    const last = lastNotices.get(theCause) ?? null
    const lastAt = last === null ? null : inMs(last.at)
    if (lastAt !== null && at - lastAt < ONE_NOTICE_PER_CAUSE_EVERY) continue
    const sinceLast =
      lastAt === null
        ? runs
        : runs.filter((run) => {
            const closed = inMs(run.data['closedAt'])
            return closed !== null && closed > lastAt
          })
    if (sinceLast.length === 0) continue
    const firstStopped = sinceLast[0]
    if (firstStopped === undefined) continue
    const resets = sinceLast.map(theResetThisRunNames).find((one) => one !== null) ?? null
    // CRITERION M128: THE MESSAGE THE RUNS WERE CARRYING, so the notice can be a system line in the
    // conversation it is about and name that message. A run that carried none names none.
    const messages = sinceLast
      .map(theMessageThisRunWasCarrying)
      .filter((one): one is string => one !== null)
    const wrote = writeASystemLineToOne(
      { kind: 'person', id: THE_PERSON },
      workspaceId,
      SYSTEM_LINES.theRunsAStopCauseStopped(
        sinceLast.map((run) => ({ id: run.id, title: run.title })),
        theCauseInWords(theCause),
        theCauseSaidBy(firstStopped),
        resets,
        messages,
      ),
      theOffice(),
      // WHICH MESSAGE THE NOTICE IS ABOUT, when one can be named. `isBetween` draws the line in the
      // conversation that message is in, which is what "a notice about a conversation is a system
      // line in it" means; the line is still addressed to the person alone.
      messages.length === 0 ? undefined : { message: messages[0] },
      // THE FACT THAT THIS CAUSE WAS TOLD, kept on the notice itself so a restart cannot resend it.
      { m94: { cause: theCause, runs: sinceLast.map((run) => run.id), at } },
    )
    // AND THE LINK, so a reader of the notice opens the exact message it names rather than the run.
    const firstMessage = messages[0]
    if (firstMessage !== undefined) {
      createLink({ fromId: wrote.id, toId: firstMessage, type: 'about', actor: theOffice() })
    }
    sent.push(theCause)
  }
  return sent
}

// ============================================================================ F13, the idle trigger

/** What the idle reminder says, whole, for one agent. */
function theIdleReminder(agent: RegisteredAgent): string {
  const hours = idleReminderHours()
  const hours1 = hours === 1 ? 'an hour' : `${String(hours)} hours`
  // ITS OPEN CHECKLIST ITEMS, when it has any (an agent's point 4): the
  // one sentence the brief and the report reminders print, from shared/checklists.ts.
  const open = theOpenItemsSentenceFor({ kind: 'agent', id: agent.id })
  return `You have been idle for about ${hours1} — nothing sent to you and nothing sent by you. ${theRoleAndDutiesOf(agent.role)}${open === null ? '' : ` ${open}`}`
}

/**
 * WHETHER ONE AGENT'S IDLE REMINDER IS DUE, and it is due at most once per spell.
 *
 * A spell starts at the newest activity the watcher has seen. An agent whose newest activity is
 * OLDER than the moment this watcher started is left alone: its going idle was never observed, and
 * reminding agents that were already quiet when the office restarted would be the sweep the brief
 * forbids. An agent with nothing recorded is left alone too.
 *
 * `unreadableAt` is when the newest message the pass could not read was written, or null when there is none. Such a
 * message could be any agent's newer activity, sent or received, or the spell's reminder already said. So an agent
 * whose newest activity is not after it is not reminded, which can only under-remind.
 *
 * `idleTime` gives how long an agent is quiet before it is reminded, in milliseconds, from the settings.
 */
function theIdleReminderIsDue(
  agent: RegisteredAgent,
  activity: ReadonlyMap<string, number>,
  now: number,
  watchingSince: number,
  idleLinesSaidTo: (agentId: string) => readonly TheIdleLineSaid[],
  unreadableAt: number | null,
  idleTime: () => number,
): boolean {
  if (agent.retired) return false
  const newest = activity.get(agent.id) ?? null
  if (newest === null || newest < watchingSince) return false
  if (now - newest < idleTime()) return false
  if (unreadableAt !== null && unreadableAt >= newest) return false
  // SENT ONCE PER SPELL: a line to this agent written at or after its newest activity is the
  // spell's one reminder. AT OR AFTER, not strictly after, because a stamp is truncated to the
  // second: a line written in the same second as the activity it answers cannot be told apart from
  // one written before it, and reading it as after can only under-remind — the spell is taken as
  // already reminded — never repeat, which is the direction the person's step 3 chooses. The reverse reading
  // would re-send a reminder whenever activity and tick shared a second.
  // A LINE'S STAMP IS READ WITH THE MOMENT KEPT BESIDE IT, by the one rule each activity is read by: the moment only when
  // it names the stamp.
  for (const said of idleLinesSaidTo(agent.id)) {
    const written = momentOfAStampAndItsInstant(said.at, said.instant, inMs)
    if (written !== null && written >= newest) return false
  }
  return true
}

/**
 * THE AGENTS THAT STARTED AN AGENT WITH A RUN STILL RUNNING, by registry id. A run is running when its
 * session record says so; its agent is the one `theAgentARunServes` reads, and that agent's starter is
 * the `startedBy` on its registry row. A person who started an agent is not in the set.
 */
function theStartersOfARunningRun(identityOf: TheIdentityOf): ReadonlySet<string> {
  const starters = new Set<string>()
  for (const row of db
    .select({ data: records.data })
    .from(records)
    // THROUGH THE INDEX OF RUNNING RUNS (`STORED_FIELDS.sessionIsRunning`), so the few running rows are read and not every one.
    .where(and(eq(records.kind, 'session'), isNull(records.deletedAt), sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`))
    .all()) {
    const served = theAgentARunServes(row.data, identityOf)
    if (served === null) continue
    const agent = readParticipant({ kind: 'agent', id: served.id })
    if (agent === null || !('retired' in agent) || agent.startedBy?.kind !== 'agent') continue
    const starter = theOneAgentAStringNames(sqlite, agent.startedBy.id)
    if (starter !== null) starters.add(starter.id)
  }
  return starters
}

// ============================================================================ the long sandbox run

/**
 * A RUN IN A SANDBOX THAT STILL SAYS RUNNING 8 HOURS AFTER IT WAS FILED IS SAID ONCE TO ITS
 * STARTER (problem Grbb87VX3pND). It is a reminder and stops nothing.
 *
 * THE CLOCK IS THE OFFICE'S OWN: the run's filing stamp, which the run cannot write, against this tick's time. Until 18
 * October 2026 the launcher in the sandbox kept this clock and sent the reminder under the run's key, and the office read
 * it as the run's own last word to its starter. The line itself is the memory that it was said. It goes to the starter a
 * seal tells (`whoIsToldOfTheRun`), and a run whose starter cannot be named is not reminded. It reads every project, as the
 * drafts' reminder does.
 *
 * AT MOST ONE LINE IN 8 HOURS TO EACH STARTER (wave 13y round 141). One line for each run sent one supervisor 104 lines
 * in one night on 5 November 2026. Now a starter's first line goes at once. After it, nothing more goes to that starter
 * for `ONE_LONG_RUN_LINE_EVERY`, and the next line names every run that became due in that time and still says running.
 * Each run is named once. The lines are the memory of both: a line names its runs in `extra.longRuns`, and the wait counts
 * from the newest line's own stamp (`theLongRunLinesSaid`).
 *
 * A RUN ITS STARTER HAS CLOSED IS NOT NAMED. Closing a run stores when and why it ended and leaves its work state as it
 * was, so a closed run can still say running. The step reads a run as open the way `listAttachments` in attachments.ts
 * does in SQL: no `closedAt` is stored.
 */
function sendTheLongSandboxRunRemindersThatAreDue(now: Date): string[] {
  const at = now.getTime()
  const dueBy = at - SANDBOX_RUN_REMINDER.ms
  const due = db
    .select({ id: records.id, workspaceId: records.workspaceId, createdAt: records.createdAt, data: records.data })
    .from(records)
    // THROUGH THE INDEX OF RUNNING RUNS (`STORED_FIELDS.sessionIsRunning`), so the few running rows are read and not every one.
    .where(and(eq(records.kind, 'session'), isNull(records.deletedAt), sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`, sql`json_extract(${records.data}, '$.sandbox') IS NOT NULL`, sql`json_extract(${records.data}, '$.closedAt') IS NULL`))
    .all()
    .map((run) => ({ ...run, filed: inMs(run.createdAt) }))
    .filter((run): run is typeof run & { filed: number } => run.filed !== null && run.filed <= dueBy)
    // IN THE ORDER THE RUNS WERE FILED, so a line names them oldest first, and its `aboutRun` is the oldest.
    .sort((one, other) => one.filed - other.filed || one.id.localeCompare(other.id))
  if (due.length === 0) return []
  const said = theLongRunLinesSaid(SYSTEM_LINES.aSandboxRunHasRunLong('').line)
  const waiting = new Map<string, { to: ParticipantRef; runs: (typeof due)[number][] }>()
  for (const run of due) {
    if (said.named.has(run.id)) continue
    const agent = theAgentOfARunForItsSeal(run)
    const starter = agent === null ? null : whoIsToldOfTheRun(agent)
    if (starter === null || !('to' in starter)) continue
    const key = anAddressee(starter.to.kind, starter.to.id)
    const theirs = waiting.get(key) ?? { to: starter.to, runs: [] }
    theirs.runs.push(run)
    waiting.set(key, theirs)
  }
  const reminded: string[] = []
  for (const [key, { to, runs }] of waiting) {
    const last = said.lastTo.get(key)
    if (last !== undefined && at - last < ONE_LONG_RUN_LINE_EVERY) continue
    const [first] = runs
    if (first === undefined) continue
    const ids = runs.map((one) => one.id)
    writeASystemLineToOne(to, first.workspaceId, SYSTEM_LINES.aSandboxRunHasRunLong(theLongRunSentence(ids)), theOffice(), { run: first.id }, { longRuns: ids })
    reminded.push(...ids)
  }
  return reminded
}

/** After a starter's long-run line, no other goes to that starter for this long (wave 13y round 141). */
const ONE_LONG_RUN_LINE_EVERY = 8 * 3_600_000

/** The key a starter is kept under in `theLongRunLinesSaid`. */
function anAddressee(kind: string, id: string): string {
  return JSON.stringify([kind, id])
}

/** The long-run line's sentence, naming every run it is about, oldest first. */
function theLongRunSentence(runs: readonly string[]): string {
  const hours = String(SANDBOX_RUN_REMINDER.hours)
  const which =
    runs.length === 1
      ? `Run ${String(runs[0])} still says running more than ${hours} hours after it was filed. This is a reminder; nothing stops it.`
      : `${String(runs.length)} runs still say running more than ${hours} hours after they were filed: ${runs.join(', ')}. This is a reminder; nothing stops them.`
  return `${which} Mole Office writes you at most one such line in ${String(ONE_LONG_RUN_LINE_EVERY / 3_600_000)} hours, and names each run once.`
}

/**
 * WHAT THE LONG-RUN LINES HAVE SAID, read off the lines themselves: every run one of them names, and when each starter was
 * last sent one. A line names its runs in `extra.longRuns`; a line written before wave 13y round 141 names one run, in
 * `aboutRun`. One reading, through the index of who wrote a message, as `officeLinesSaidAboutRuns` reads.
 *
 * THE INDEX OF THE RECORDS' TEXT NAMES THE FEW RECORDS THAT MAY HOLD THE LINE, and only those are read, by their keys.
 * Through the index of who wrote a message, every line the office ever sent was read and parsed to find a handful: on a
 * made-up office of the live size, 47,953 lines and about 60 ms of every minute's pass. When the index cannot narrow,
 * the reading goes through the index of who wrote a message as before. Either way the same conditions choose the lines.
 */
function theLongRunLinesSaid(line: string): { named: Set<string>; lastTo: Map<string, number> } {
  const named = new Set<string>()
  const lastTo = new Map<string, number>()
  const theFields = sql`SELECT json_extract(${records.data}, '$.aboutRun') AS run,
    json_extract(${records.data}, '$.extra.longRuns') AS runs, json_extract(${records.data}, '$.to[0].kind') AS toKind,
    json_extract(${records.data}, '$.to[0].id') AS toId, ${records.createdAt} AS at`
  const theLines = and(
    ONE_KIND_WRITTEN_OUT.message,
    eq(STORED_FIELDS.messageSentById(records.data), moleOffice().id),
    isNull(records.deletedAt),
    sql`json_extract(${records.data}, '$.body') = ${line}`,
    sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
  )
  const mayHold = theRecordsThatMayHoldOneOf([line])
  // A CROSS JOIN, because SQLite keeps the order of one: the keys first, and each record looked up by its key.
  const lines =
    mayHold === undefined
      ? sql`${theFields} FROM ${records} INDEXED BY records_message_sent_by_idx WHERE ${theLines}`
      : sql`${theFields} FROM json_each(${JSON.stringify(mayHold)}) AS kept CROSS JOIN ${records} ON ${records.id} = kept.value WHERE ${theLines}`
  for (const one of db.all<{ run: unknown; runs: unknown; toKind: unknown; toId: unknown; at: unknown }>(lines)) {
    if (typeof one.run === 'string') named.add(one.run)
    if (typeof one.runs === 'string') {
      for (const run of JSON.parse(one.runs) as unknown[]) if (typeof run === 'string') named.add(run)
    }
    const sent = inMs(one.at)
    if (typeof one.toKind !== 'string' || typeof one.toId !== 'string' || sent === null) continue
    const key = anAddressee(one.toKind, one.toId)
    lastTo.set(key, Math.max(lastTo.get(key) ?? sent, sent))
  }
  return { named, lastTo }
}

// ============================================================================ F10, the expected-time trigger

/** One run the office is watching for its expected time, read off its record. */
interface RunPastItsTime {
  id: string
  agentId: string
  startMs: number
  expectedMs: number
}

/**
 * THE RUNNING RUNS THAT CARRY A TYPED EXPECTED TIME.
 *
 * A run is a session record that says it is running, names the agent it serves, and carries
 * `expectedMinutes` — typed at the start door or on the record afterwards. A run without one is not
 * reminded about, and that absence is the criterion's plain answer, not a gap: where nobody typed an
 * expected time, nothing is reminded.
 */
function runsCarryingAnExpectedTime(workspaceId: string): RunPastItsTime[] {
  const rows = db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        // THE FILTER IS THE DATABASE'S, NOT JAVASCRIPT'S. A project holds thousands of session
        // records and this runs every minute; only a running run that names its agent and carries a
        // typed expected time is worth reading whole, and that is a handful. THE RUNNING ROWS ARE FOUND THROUGH THEIR INDEX
        // (`STORED_FIELDS.sessionIsRunning`): asked as a plain json_extract, SQLite parsed every session row of the project
        // to find them, 23 ms of every minute at the live counts (wave 13y round 16).
        sql`${STORED_FIELDS.sessionIsRunning(records.data)} = 1`,
        sql`json_extract(${records.data}, '$.servingAgent') IS NOT NULL`,
        sql`json_extract(${records.data}, '$.expectedMinutes') IS NOT NULL`,
      ),
    )
    .all()
  const out: RunPastItsTime[] = []
  // THE DATA COLUMN COMES BACK AS AN OBJECT, not as a string: the schema declares it
  // `mode: 'json'`, so drizzle hands back what was stored, already read. A row whose JSON cannot be
  // read was refused at the door, so there is nothing to catch here — a row that cannot be read
  // names no run and is skipped by the field checks below.
  for (const row of rows) {
    const said: Record<string, unknown> = row.data
    const expected = said['expectedMinutes']
    if (typeof expected !== 'number' || !Number.isInteger(expected) || expected <= 0) continue
    // THE START IS THE RUN'S OWN WORD ABOUT ITSELF: the instant beside startedAt when the run has
    // one, and startedAt alone when it does not. A run that carries neither has no clock to judge.
    const startMs = inMs((said['startedTime'] as { instant?: unknown } | undefined)?.instant) ?? inMs(said['startedAt'])
    if (startMs === null) continue
    // THE AGENT'S REGISTRY ID, read the way every reader of a run reads it. A run whose stored names
    // lead to no one agent has nobody to remind, and is skipped.
    const agentId = theAgentARunServes(said)?.id ?? null
    if (agentId === null) continue
    out.push({ id: row.id, agentId, startMs, expectedMs: expected * 60_000 })
  }
  return out
}

// ============================================================================ the tick

export interface RemindersPass {
  idleReminded: string[]
  expectedTimeReached: string[]
  twiceExpectedTime: string[]
  /** The run of each step reminder sent, once for each (src/server/lib/step-reminders.ts). Wave 14d. */
  stepReminded: string[]
  /** The runs the office itself closed because their transcript said why they stopped. Criterion M94. */
  runsClosedWithACause: string[]
  /** The causes a notice was sent for this tick, at most one per cause. Criterion M94. */
  noticesSent: string[]
  /** The holding rows closed because their isolated world is not running. Problem `2G9jNsuJwJf4`. */
  worldHoldsClosed: string[]
  /** The office's own rows closed because the process they named is gone, in every project of the installation. Problem `1p-pQxYe0RLB`. */
  deadOwnRowsClosed: string[]
  /** Claimed dispatches whose registered worker process is gone on this machine. */
  crashedDispatches: string[]
  /** The running rows closed because their working directory is gone and they recorded no process, in every project of the installation. */
  directoryGoneRowsClosed: string[]
  /** Runs closed after their sandbox container stopped or disappeared, across every project. */
  sandboxContainerRowsClosed: string[]
  /** Runs whose sandbox container could not be checked, with each reason. */
  sandboxContainerProblems: string[]
  /** Runs closed after their sandbox launcher's process group ended, across every project. */
  sandboxLauncherRowsClosed: string[]
  /** Runs whose sandbox launcher could not be read, with each reason. */
  sandboxLauncherProblems: string[]
  /** Secretaries reminded before their broadcast slot. */
  broadcastsReminded: string[]
  /** Secretaries told once that their broadcasts are paused by the unanswered rule. */
  broadcastsPaused: string[]
  /** Secretaries reminded once more because a slot's report has not come. */
  broadcastsWithNoReport: string[]
  /** Runs on the host past the main world's limits, each said once to its starter. */
  mainWorldOver: string[]
  /** Why the main world's limits could not be read this tick, or null because they were. */
  mainWorldProblem: string | null
  /** Drafts not sent whose reminder was said this tick, once per version, in every project. */
  draftsReminded: string[]
  /**
   * The turn drafts Mole Office sent in this pass: to a person, or to a group with a person among its members, after
   * ten minutes, or of a run that ended.
   */
  turnDraftsSent: string[]
  /** Runs in a sandbox said once to their starter as still running 8 hours after they were filed, in every project. */
  longSandboxRunsReminded: string[]
  /** Runs whose queued check nothing in the office would start, told once to their starter an hour after the ask, by run id. */
  checksNothingStartsTold: string[]
  /** The persons' messages whose agent was reminded once that it has not replied, by message id. */
  repliesReminded: string[]
  /** Why the reply reminder could not run this tick, or null because it ran. */
  replyReminderProblem: string | null
  /** Messages whose data is not valid JSON, which the idle and reply reminders passed over, oldest first. Wave 13q. */
  unreadableMessages: string[]
  /** Notebooks and projects' modules left unchanged, said once a day. Decisions jlXCnK4feOuR and aZGg6gerakM1. */
  staleReminded: string[]
  /** What the record-duty check could not say, each once while this server runs, or why it could not run this tick. */
  staleNotSaid: string[]
  /** Broadcast times that could not be read, the setting's or a secretary's stored ones, each said once while this server runs. */
  broadcastTimesUnreadable: string[]
  /** Checklist item reminders that fired this tick, each `<checklist id>/<item id>`, to the owner alone. */
  checklistItemsReminded: string[]
}


/** Why the record-duty check could not run, each reason said once while this server runs. */
const theStaleCheckFailuresSaid = new Set<string>()

/** One step of a pass: its name, its whole time, and its time, statements and rows inside SQLite. */
export interface AStepOfThePass {
  name: string
  ms: number
  sqliteMs: number
  statements: number
  rows: number
}

/**
 * THE LINE FOR A LONG PASS, step by step, slowest first, so a slow tick on live names where its time went (wave 13y round
 * 19). A step's time outside SQLite is its own code and what it read from disk or asked of the system, such as a
 * transcript or a process. Exported so the test reads the sentence the server writes.
 */
export function sayTheStepsOfAPass(totalMs: number, steps: readonly AStepOfThePass[]): string {
  const round = (ms: number): string => (ms < 10 ? ms.toFixed(1) : String(Math.round(ms)))
  const counted = steps.reduce((sum, one) => sum + one.ms, 0)
  const each = [...steps]
    .sort((a, b) => b.ms - a.ms)
    .map(
      (one) =>
        `${one.name} ${round(one.ms)} ms (${round(one.sqliteMs)} ms inside SQLite, ${String(one.statements)} statements, ` +
        `${String(one.rows)} rows)`,
    )
  return (
    `the flow reminders' pass took ${round(totalMs)} ms, ${round(Math.max(0, totalMs - counted))} ms of it outside its ` +
    `steps. Its steps, slowest first: ${each.join('; ')}.`
  )
}

/**
 * THE LOG'S ONE LINE FOR THE MESSAGES A PASS COULD NOT READ: how many, and the first three. Said in every pass that meets
 * any, so a message that stays unreadable stays in the log. Exported so the test reads the sentence the server writes.
 */
export function theUnreadableMessagesSaid(ids: readonly string[]): string {
  const named = ids.slice(0, 3).join(', ')
  const more = ids.length > 3 ? ` and ${String(ids.length - 3)} more` : ''
  return (
    `The flow reminders passed over ${String(ids.length)} ${ids.length === 1 ? 'message' : 'messages'} whose data is not valid JSON: ` +
    `${named}${more}. The data of such a message could not be read, so the idle and reply reminders sent nothing it could make wrong.`
  )
}

/** A turn of the event loop: what is waiting runs before what follows this. */
const aTurn = (): Promise<void> => new Promise((done) => setImmediate(done))

/**
 * ONE MINUTE'S PASS, ONE STEP AT A TIME, WITH THE THREAD GIVEN BACK BEFORE EACH STEP, so the server answers between two
 * steps. In one run the pass held the live server for 0.63 to 1.25 s each minute (wave 13y round 166). The interval
 * below runs this, and `run` is the run it gives each step, so each step is a named run of its own. It answers what the
 * pass did and how long its steps held the thread, which leaves out the turns between them.
 *
 * ON WINDOWS THE PASS STAYS ONE RUN, WITH THE PROCESSES IT READS READ FIRST (`readFirst` in lib/resources.ts), so it
 * does not hold the server's thread while PowerShell answers. The processes named are those of the office's own rows
 * and of this machine's dispatch claims. A run another step ends, whose process rows its end then reads, is read as
 * before.
 */
export async function theMinutePass(
  workspaceId: string,
  now: Date,
  watchingSince: Date,
  isolatedWorldsFolder: string = theIsolatedWorldsFolder(),
  steps: AStepOfThePass[] = [],
  replyCatchUp?: ReplyReminderCatchUp,
  run: (work: () => void) => void = (work) => work(),
): Promise<{ did: RemindersPass; heldMs: number }> {
  const pass = theStepsOfAPass(workspaceId, now, watchingSince, isolatedWorldsFolder, steps, replyCatchUp)
  let heldMs = 0
  const timed = (work: () => void): void => {
    const began = performance.now()
    try {
      run(work)
    } finally {
      heldMs += performance.now() - began
    }
  }
  if (osProbe().readProcessById !== undefined) {
    await readFirst(
      () => [
        ...theProcessesTheGoneDispatchCheckReads(),
        ...listWorkspaces().flatMap((project) => theProcessesTheOwnRowsCloseReads({ workspaceId: project.id, now })),
      ],
      () => timed(() => {
        for (const one of pass.theSteps) one()
      }),
    )
    return { did: pass.report, heldMs }
  }
  for (const one of pass.theSteps) {
    await aTurn()
    timed(one)
  }
  return { did: pass.report, heldMs }
}

/**
 * ONE TICK OF THE REMINDER WATCHER: find what is due and say it, once.
 *
 * Exported so a test can run exactly one tick with a clock of its own, in one run. The interval below runs the same
 * steps through `theMinutePass`, each as a run of its own, with the real clock.
 *
 * `isolatedWorldsFolder` is the tool's own `.logs/isolated` directory. It is a parameter so a test
 * can point one tick at a world list of its own, which is the only way the world check can be
 * proved without touching the checkout the suite runs in.
 */
export function sendTheRemindersThatAreDue(
  workspaceId: string,
  now: Date,
  watchingSince: Date,
  isolatedWorldsFolder: string = theIsolatedWorldsFolder(),
  steps: AStepOfThePass[] = [],
  replyCatchUp?: ReplyReminderCatchUp,
): RemindersPass {
  const pass = theStepsOfAPass(workspaceId, now, watchingSince, isolatedWorldsFolder, steps, replyCatchUp)
  for (const one of pass.theSteps) one()
  return pass.report
}

/**
 * THE STEPS OF ONE PASS, IN THEIR ORDER, NOT YET RUN, and the answer they fill in. The whole pass above runs them in one
 * run and the timer's pass runs each as a run of its own, so both run the same steps in the same order (wave 13y round
 * 166). A step reads the office when it runs, so what a request changed between two steps is read by the later one.
 */
function theStepsOfAPass(
  workspaceId: string,
  now: Date,
  watchingSince: Date,
  isolatedWorldsFolder: string,
  steps: AStepOfThePass[],
  replyCatchUp: ReplyReminderCatchUp | undefined,
): { report: RemindersPass; theSteps: (() => void)[] } {
  const theSteps: (() => void)[] = []
  // EACH STEP IS TIMED AND COUNTED APART, into `steps`, so the tick can say which step a long pass spent its time in.
  const step = <T>(name: string, work: () => T): T => {
    const began = performance.now()
    const did = aFreshCount()
    try {
      return countedApart(did, work)
    } finally {
      steps.push({ name, ms: performance.now() - began, sqliteMs: did.ms, statements: did.statements, rows: did.rows })
    }
  }
  const report: RemindersPass = {
    idleReminded: [],
    expectedTimeReached: [],
    twiceExpectedTime: [],
    stepReminded: [],
    runsClosedWithACause: [],
    noticesSent: [],
    worldHoldsClosed: [],
    deadOwnRowsClosed: [],
    crashedDispatches: [],
    directoryGoneRowsClosed: [],
    sandboxContainerRowsClosed: [],
    sandboxContainerProblems: [],
    sandboxLauncherRowsClosed: [],
    sandboxLauncherProblems: [],
    broadcastsReminded: [],
    broadcastsPaused: [],
    broadcastsWithNoReport: [],
    mainWorldOver: [],
    mainWorldProblem: null,
    draftsReminded: [],
    turnDraftsSent: [],
    longSandboxRunsReminded: [],
    checksNothingStartsTold: [],
    repliesReminded: [],
    replyReminderProblem: null,
    unreadableMessages: [],
    staleReminded: [],
    staleNotSaid: [],
    broadcastTimesUnreadable: [],
    checklistItemsReminded: [],
  }
  const at = now.getTime()
  const since = watchingSince.getTime()
  // THE MESSAGES THIS PASS COULD NOT READ, from the idle reminder and the reply reminder, each once.
  const unreadable: { id: string; createdAt: string }[] = []

  // F13, AGENT BY AGENT. One reading of everybody's activity; the per-agent work is only the
  // comparison and, for the rare agent past its hour, the read-back of what has been said already.
  theSteps.push(() => step('the idle reminder', () => {
    const identityOf = everyAgentsIdentityReadOnce(sqlite)
    const { newest: activity, unreadable: unreadableHere } = activityPerAgent(since, identityOf)
    unreadable.push(...unreadableHere)
    // A STAMP THIS PRODUCT CANNOT READ could be the newest of all.
    const unreadableAt = unreadableHere.reduce<number | null>((newest, one) => Math.max(newest ?? -Infinity, inMs(one.createdAt) ?? Infinity), null)
    // THE IDLE LINES ALREADY SAID, read once for every agent and only when an agent first needs them.
    // A line this loop writes goes to one agent, and that agent has already been judged, so the one
    // reading answers every later agent exactly as a fresh reading would.
    let idleLinesSaid: Map<string, TheIdleLineSaid[]> | null = null
    const idleLinesSaidTo = (agentId: string): readonly TheIdleLineSaid[] => {
      idleLinesSaid ??= officeLinesSaidToEachAgent(SYSTEM_LINES.youHaveBeenIdle('').line, since)
      return idleLinesSaid.get(agentId) ?? []
    }
    let startersWaiting: ReadonlySet<string> | null = null
    // THE IDLE TIME IS READ FROM THE SETTINGS ONCE, when the first agent needs it.
    let idleMs: number | null = null
    const theIdleTime = (): number => (idleMs ??= idleReminderHours() * 3_600_000)
    // ONLY AN AGENT WITH ACTIVITY CAN BE DUE, so only those agents are built, in the registry's order as before. Every
    // agent of the registry built took about 18 ms of each pass on a made-up office of the live size.
    for (const agent of theseAgentsInTheRegistrysOrder([...activity.keys()])) {
      if (!theIdleReminderIsDue(agent, activity, at, since, idleLinesSaidTo, unreadableAt, theIdleTime)) continue
      // A SECRETARY WITH ROUNDS RUNNING IS WAITING ON PURPOSE: what it queues next comes from those
      // runs, so it is not reminded of its duties. One notice per fact, by a decision.
      startersWaiting ??= theStartersOfARunningRun(identityOf)
      if (startersWaiting.has(agent.id) && holdsTheSecretaryCard({ kind: 'agent', id: agent.id })) continue
      const to = { kind: 'agent', id: agent.id } as const
      writeASystemLineToOne(to, workspaceId, SYSTEM_LINES.youHaveBeenIdle(theIdleReminder(agent)), theOffice())
      report.idleReminded.push(agent.handle)
    }
  }))

  // F10, RUN BY RUN. The first stage at T is the mild reminder needing no reply. The second stage at
  // 2T makes the agent communicate with its supervisor — see the reading at the top of this file.
  // WHAT HAS BEEN SAID ABOUT THESE RUNS, read once for all of them. A line this loop writes is about
  // the run being judged, and each run is judged once, so no later run's answer changes.
  theSteps.push(() => step('the expected time', () => {
    const watchedRuns = runsCarryingAnExpectedTime(workspaceId)
    const first = SYSTEM_LINES.theExpectedTimeHasArrived('').line
    const second = SYSTEM_LINES.twiceTheExpectedTime('').line
    const saidAboutRuns = watchedRuns.length === 0 ? new Set<string>() : officeLinesSaidAboutRuns([first, second])
    for (const run of watchedRuns) {
      const agent = readParticipant({ kind: 'agent', id: run.agentId })
      if (agent === null || !('retired' in agent) || agent.retired) continue
      const to = { kind: 'agent', id: agent.id } as const
      const pastT = at >= run.startMs + run.expectedMs
      const past2T = at >= run.startMs + 2 * run.expectedMs
      const saidT = saidAboutRuns.has(aboutARun(run.id, first))
      const said2T = saidAboutRuns.has(aboutARun(run.id, second))
      if (past2T && saidT && !said2T) {
        writeASystemLineToOne(
          to,
          workspaceId,
          SYSTEM_LINES.twiceTheExpectedTime(
            `The run filed as record ${run.id} is still going and it has passed TWICE its expected time. Your flow ` +
              'says what happens now: tell your supervisor why you are stuck, in your own words, so the supervisor ' +
              'can decide whether there is a bigger problem — whether the module was cut the wrong way and needs ' +
              'to be re-cut or re-planned. A mild reminder was sent when the expected time arrived; this one is ' +
              'the escalation, and no further flow message follows it while the run keeps going.',
          ),
          theOffice(),
          { run: run.id },
        )
        report.twiceExpectedTime.push(run.id)
        continue
      }
      if (pastT && !saidT) {
        writeASystemLineToOne(
          to,
          workspaceId,
          SYSTEM_LINES.theExpectedTimeHasArrived(
            `The run filed as record ${run.id} has reached its expected time and is still going. Nothing is asked ` +
              'of you for this reminder and no reply is needed. If the work is nearly done, carry on; if it has ' +
              'stopped for an accident — a compaction, a lost handle, a crashed tool — this is the moment to say so.',
          ),
          theOffice(),
          { run: run.id },
        )
        report.expectedTimeReached.push(run.id)
      }
    }
  }))

  // A RUN'S REMINDER OF ITS ROLE, ITS DUTIES AND ITS CURRENT STEP, at each change of step and again by tokens or by time
  // (wave 14d). The file says when one is due and what is counted.
  theSteps.push(() => step('the step reminder', () => {
    report.stepReminded.push(...sendTheStepRemindersThatAreDue(workspaceId, now, watchingSince))
  }))

  // A DRAFT THAT HAS NOT BEEN SENT, by point 5 of a decision. Beside the idle reminder and read
  // the same way: once its time has passed since its newest version, one office line to its writer,
  // or to the writer's starter once the writer's run has ended, and never again for that version.
  // It never sends the draft. It reads every project, as the closers below do.
  theSteps.push(() => { report.draftsReminded = step('the drafts', () => sendTheDraftRemindersThatAreDue(now, theOffice())) })

  // A HELD MESSAGE THAT IS DUE: a turn draft to a person, or to a group with a person among its members, ten minutes
  // after its first words were held, even while the turn runs on, and one whose run has ended or no longer reports its
  // turns. Filed by Mole Office, with the agent as the sender (lib/turn-drafts.ts).
  theSteps.push(() => { report.turnDraftsSent = step('the turn drafts', () => sendTheTurnDraftsThatAreDue(now)) })

  // A RUN IN A SANDBOX STILL RUNNING 8 HOURS AFTER IT WAS FILED, by item 5 of a decision: one office line to its
  // starter, once, on the office's own clock. It stops nothing. It reads every project, as the
  // drafts' reminder does.
  theSteps.push(() => { report.longSandboxRunsReminded = step('the long sandbox runs', () => sendTheLongSandboxRunRemindersThatAreDue(now)) })

  // A QUEUED CHECK THAT NOTHING IN THE OFFICE WOULD START, told once to its run's starter (lib/a-check-nothing-starts.ts).
  // It reads every project, through its own index, as the long sandbox runs' step does.
  theSteps.push(() => { report.checksNothingStartsTold = step('the checks nothing starts', () => tellTheStartersOfChecksNothingStarts(now)) })

  // A CHECKLIST ITEM'S OWN REMINDER, by point 7 of a decision. Off until the
  // checklist's owner switches it on; at its time, one office line to that owner alone, once, while the
  // item is open. It reads every project, as the drafts' reminder does.
  theSteps.push(() => {
    report.checklistItemsReminded = step('the checklists', () => sendTheChecklistRemindersThatAreDue(now)).map((one) => `${one.checklist}/${one.item}`)
  })
  // A PERSON'S MESSAGE HANDED TO AN AGENT'S LIVE SESSION WITH NO REPLY, wave 13y round 11. Once its minutes have passed
  // since delivery and the agent has written nothing to the person in that conversation, one office line wakes the
  // agent for it, and never a second one. Its deliveries also include the bounded pre-stop window captured at startup.
  // A SETTING THAT CANNOT BE READ IS SAID IN THE LOG, and every sweep below still runs.
  theSteps.push(() => {
    try {
      report.repliesReminded = step('the reply reminder', () => sendTheReplyRemindersThatAreDue(workspaceId, now, watchingSince, theOffice(), replyCatchUp, unreadable))
    } catch (err) {
      report.replyReminderProblem = err instanceof Error ? err.message : String(err)
    }
    report.unreadableMessages = unreadable
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1))
      .map((one) => one.id)
  })

  // THE RECORD-DUTY CHECK, decisions jlXCnK4feOuR and aZGg6gerakM1: a notebook unchanged for 7 days and a project's
  // modules unchanged for 14, each said at most once a day. It blocks nothing, so a setting it cannot read is said in
  // the log and every sweep below still runs.
  theSteps.push(() => {
    try {
      const stale = step('the record-duty check', () => sendTheStaleRecordRemindersThatAreDue(now, theOffice()))
      report.staleReminded = stale.reminded
      report.staleNotSaid = stale.couldNotSay
    } catch (err) {
      // SAID ONCE WHILE THIS SERVER RUNS, as the check's own sentences are: a setting it cannot read was said on every
      // tick until wave 13p round 27b. A different reason is said when it first comes.
      const why = `the check could not run (${err instanceof Error ? err.message : String(err)})`
      report.staleNotSaid = theStaleCheckFailuresSaid.has(why) ? [] : [why]
      theStaleCheckFailuresSaid.add(why)
    }
  })

  // THE SECRETARY'S BROADCAST, by a decision of 16 September 2026. Each un-retired
  // secretary with a live schedule is reminded at slot minus the lead, once per slot, unless the
  // unanswered rule has paused it — in which case it is told once, in one sentence. It reads the
  // same `now` and the same messages the rest of this tick reads.
  theSteps.push(() => {
    const broadcast = step('the broadcasts', () => sendTheBroadcastRemindersThatAreDue(workspaceId, now, theOffice()))
    report.broadcastsReminded = broadcast.reminded
    report.broadcastsPaused = broadcast.paused
    report.broadcastsWithNoReport = broadcast.noReport
    report.broadcastTimesUnreadable = broadcast.unreadable
  })

  // THE MAIN WORLD'S LIMITS, by a decision of 22 September 2026: a run on the host past its secretary's share, or past
  // the office's total, is said once to whoever started it. Nothing stops.
  // A SETTING THAT CANNOT BE READ IS SAID IN THE LOG, and every sweep below still runs.
  theSteps.push(() => {
    try {
      report.mainWorldOver = step('the main world', () => sendTheMainWorldRemindersThatAreDue(workspaceId, theOffice()))
    } catch (err) {
      report.mainWorldProblem = err instanceof Error ? err.message : String(err)
    }
  })

  // M94, THE CAUSE AND THEN THE ONE NOTICE. A run stopped by a limit can never reach SessionEnd,
  // so the office reads its own transcript and writes the cause down here; then every cause this
  // hour, whether the hook wrote it or this sweep did, is folded into one notice to the person.
  theSteps.push(() => { report.crashedDispatches = step('the gone dispatch workers', () => endDispatchesWhoseWorkerIsGone()) })
  theSteps.push(() => { report.runsClosedWithACause = step('the stop causes in transcripts', () => closeTheRunsTheTranscriptSaysStopped(workspaceId, now)) })
  theSteps.push(() => { report.noticesSent = step('one notice per cause', () => tellThemOncePerCause(workspaceId, now)) })
  // AND THE HOLDING ROWS OF WORLDS THAT ARE GONE. A world the tool no longer shows as running has
  // nothing behind the row that says it is, so the row is closed with that one cause.
  theSteps.push(() => {
    report.worldHoldsClosed = step('the world holds', () =>
      closeTheHoldingRowsOfWorldsThatAreGone({
        workspaceId,
        folder: isolatedWorldsFolder,
        now,
        actor: theOffice(),
      }),
    )
  })
  // Read the sandbox first, so its observed stop is recorded before another closer finds only a missing process or directory.
  // A RUN FILED BETWEEN THIS STEP AND THE CLOSERS AFTER IT is not among the ids they are given, so they read it at
  // the next pass.
  const stillGoingIdsByProject = new Map<string, string[]>()
  theSteps.push(() => step('the sandbox containers', () => {
    const readContainer = theSandboxContainerReadingsForAPass()
    for (const project of listWorkspaces()) {
      // These closers run together. Share their superset, then let each database filter and state check decide.
      const sessionIds = theSessionIdsWhere(project.id, one => saysStillGoing(one.state))
      stillGoingIdsByProject.set(project.id, sessionIds)
      const closed = closeTheRunsWhoseSandboxContainerStopped({ workspaceId: project.id, now, actor: theOffice(), readContainer, sessionIds })
      report.sandboxContainerRowsClosed.push(...closed.closed)
      report.sandboxContainerProblems.push(...closed.problems)
    }
  }))
  /**
   * AND THE SANDBOX RUNS WHOSE LAUNCHER'S PROCESS GROUP HAS ENDED, IN EVERY PROJECT. A sandbox container outlives
   * the run working in it, so the container closer alone leaves a run saying it is going after its command ended.
   * A run whose launcher still lives, whose liveness cannot be read, or which is another computer's run is left as
   * it is; the second is named in the report.
   */
  theSteps.push(() => step('the ended sandbox launchers', () => {
    for (const project of listWorkspaces()) {
      const closed = closeTheSandboxRunsWhoseLauncherEnded({
        workspaceId: project.id, now, actor: theOffice(), sessionIds: stillGoingIdsByProject.get(project.id),
      })
      report.sandboxLauncherRowsClosed.push(...closed.closed)
      report.sandboxLauncherProblems.push(...closed.problems)
    }
  }))
  /**
   * AND THE OFFICE'S OWN ROWS WHOSE PROCESS HAS GONE, IN EVERY PROJECT OF THE INSTALLATION. The
   * sweep was started in one project and read only that project's rows, so a row of the office's
   * own filed in another project said running while this closer read right past it. The registry
   * names every project, so it is read here, project by project. Problem `1p-pQxYe0RLB`. It never
   * writes `crashed`.
   */
  theSteps.push(() => step('the own rows', () => {
    for (const project of listWorkspaces()) {
      report.deadOwnRowsClosed.push(
        ...closeTheOwnRowsWhoseProcessIsGone({ workspaceId: project.id, now, actor: theOffice(), sessionIds: stillGoingIdsByProject.get(project.id) }),
      )
    }
  }))
  /**
   * AND THE RUNNING ROWS WHOSE WORKING DIRECTORY IS GONE, WHICH RECORDED NO PROCESS FOR THE CLOSE
   * ABOVE TO ASK ABOUT — IN EVERY PROJECT OF THE INSTALLATION, for the same reason the close above
   * it is. A run launched from a worktree that was later removed is the shape this reaches: the
   * directory is gone, so no finish through the door could have sealed it, and the row said running
   * for ever. Problem `2plCt-8-b-pW`. It never writes `crashed`.
   */
  theSteps.push(() => step('the gone working directories', () => {
    for (const project of listWorkspaces()) {
      report.directoryGoneRowsClosed.push(
        ...closeTheRunningRowsWhoseDirectoryIsGone({ workspaceId: project.id, now, actor: theOffice(), sessionIds: stillGoingIdsByProject.get(project.id) }),
      )
    }
  }))
  return { report, theSteps }
}

/**
 * HOW THE LOG NAMES CLOSED ROWS. A bare id was enough while the sweep read one project, because the
 * log said which one at the start. Now the two closers read every project, so when the
 * installation holds more than one, the project is said beside each id — `bO306uhlFxqZ (panelx)`.
 * One project, and the id alone is what the log has always said. A row that cannot be read any more
 * is named by its id alone: nothing is invented about where it was.
 */
export function theClosedRowsSaidForTheLog(ids: string[]): string {
  const everyProject = listWorkspaces()
  if (everyProject.length < 2) return ids.join(', ')
  return ids
    .map((id) => {
      const row = getRecord(id)
      return row === null ? id : `${id} (${row.workspaceId})`
    })
    .join(', ')
}

/** The reply reminder's bounded restart window, worked out once while this watcher starts. */
function theReplyCatchUpAtStart(watchingSince: Date): ReplyReminderCatchUp | undefined {
  // THE STOP SOURCE IS THE CALL LOG, read backwards by its time index once, before this start.
  // usage.ts inserts synchronously in onResponse, without batches. usage-reads.ts prunes old rows
  // at startup (14/180 days by default). The waiter take (handle.took) and delivered message read
  // (message.pool) each leave a call row after writing delivery; neither is counted by the hour.
  // The newest such call is therefore never earlier than its delivery. Folded handle waits,
  // beats and worker waits write no such delivery. They can leave the recorded stop earlier than
  // the real stop, moving this bounded window earlier rather than making it wider.
  const call = sqlite.prepare(
    'SELECT at_ms AS at FROM api_calls INDEXED BY api_calls_at_idx WHERE at_ms < ? ORDER BY at_ms DESC LIMIT 1',
  ).get(watchingSince.getTime()) as { at: number } | undefined
  let stop = call === undefined ? null : new Date(call.at)
  if (stop === null) {
    // FALLBACK SOURCE: THE NEWEST DELIVERY ROW, when no retained call precedes this start.
    const delivery = sqlite.prepare(
      'SELECT at FROM message_delivery INDEXED BY message_delivery_at_idx WHERE at <= ? ORDER BY at DESC LIMIT 1',
    ).get(localStamp(watchingSince)) as { at: string } | undefined
    if (delivery === undefined) return undefined
    stop = parseAnyStamp(delivery.at)
    if (stop === null) throw new Error(`The last delivery time "${delivery.at}" cannot be read for reply reminder catch-up.`)
  }
  return { since: new Date(stop.getTime() - replyReminderMinutes() * 60_000 - EVERY), until: stop }
}

/**
 * START THE REMINDER WATCHER, AND SAY WHAT IT DID.
 *
 * One unref'd interval, so it never holds the server open, and one tick's failure is a line in the
 * log rather than a server down: a reminder the office cannot send costs far less than the API it
 * would take down with it. `watchingSince` is when THIS server started watching, and it resets with
 * every restart on purpose — that is the no-sweep rule. Only the reply reminder also keeps the bounded
 * pre-stop delivery window above, so a restart does not lose a person's recent unanswered delivery.
 */
export function startTheReminders(workspaceId: string, log: (line: string) => void): void {
  const watchingSince = new Date()
  let roundAccountsChecked = false
  let replyCatchUp: ReplyReminderCatchUp | undefined
  try {
    replyCatchUp = theReplyCatchUpAtStart(watchingSince)
  } catch (err) {
    // A BROKEN REPLY SETTING OR CLOCK MUST NOT STOP THE API OR THE OTHER REMINDERS.
    log(`The reply reminder could not capture its restart window: ${err instanceof Error ? err.message : String(err)}`)
  }
  // THE ROUND ACCOUNTS A STOP LEFT OPEN ARE LOOKED FOR AT ONCE, when this process already holds its port, rather than at
  // the first minute tick. The flag is taken before the import, so a tick that arrives while this look is in flight skips
  // it: the look runs once per start. A failed look clears the flag, and the next tick asks again.
  const lookForRoundAccounts = async (): Promise<void> => {
    if (roundAccountsChecked || theBoundPort() === null) return
    roundAccountsChecked = true
    try {
      const { finishTheRoundAccountsLeftAtAStop } = await import('./how-a-round-ended.ts')
      finishTheRoundAccountsLeftAtAStop()
      log('The office looked for round accounts still waiting for git after a start.')
      const { closeWaitingRunsWhileChecksAreOff } = await import('./close-waiting-checks-when-off.ts')
      const checksOff = await closeWaitingRunsWhileChecksAreOff()
      log(`The office closed ${String(checksOff.closed.length)} waiting runs and skipped ${String(checksOff.skipped.length)} at its start while checks were off: ${[...checksOff.closed, ...checksOff.skipped].map((one) => `${one.run}: ${one.why}`).join('; ') || 'none'}.`)
    } catch (err) {
      roundAccountsChecked = false
      log(`The office could not look for incomplete round accounts: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const tick = async (): Promise<void> => {
    await lookForRoundAccounts()
    try {
      const steps: AStepOfThePass[] = []
      const { did: done, heldMs } = await theMinutePass(workspaceId, new Date(), watchingSince, theIsolatedWorldsFolder(), steps, replyCatchUp, (work) =>
        runNamed('the flow reminders', log, work),
      )
      if (heldMs > A_LONG_RUN_MS) log(sayTheStepsOfAPass(heldMs, steps))
      const said = [
        done.idleReminded.length === 0 ? null : `idle reminder to ${done.idleReminded.join(', ')}`,
        done.expectedTimeReached.length === 0 ? null : `expected time reached for ${done.expectedTimeReached.join(', ')}`,
        done.twiceExpectedTime.length === 0 ? null : `twice the expected time for ${done.twiceExpectedTime.join(', ')}`,
        done.stepReminded.length === 0 ? null : `a step reminder for ${done.stepReminded.join(', ')}`,
        done.runsClosedWithACause.length === 0
          ? null
          : `a stop cause written onto ${done.runsClosedWithACause.join(', ')}`,
        done.noticesSent.length === 0 ? null : `one notice per cause for ${done.noticesSent.join(', ')}`,
        done.worldHoldsClosed.length === 0
          ? null
          : `a holding row closed for a world that is not running: ${done.worldHoldsClosed.join(', ')}`,
        done.deadOwnRowsClosed.length === 0
          ? null
          : `a row of the office's own closed for a process that is gone: ${theClosedRowsSaidForTheLog(done.deadOwnRowsClosed)}`,
        done.crashedDispatches.length === 0
          ? null
          : `dispatch runs ended after their worker disappeared: ${done.crashedDispatches.join(', ')}`,
        done.directoryGoneRowsClosed.length === 0
          ? null
          : `a running row closed for a working directory that is gone: ${theClosedRowsSaidForTheLog(done.directoryGoneRowsClosed)}`,
        done.sandboxContainerRowsClosed.length === 0
          ? null
          : `runs marked crashed because their sandbox container stopped or disappeared: ${theClosedRowsSaidForTheLog(done.sandboxContainerRowsClosed)}`,
        done.sandboxContainerProblems.length === 0
          ? null
          : `sandbox containers could not be checked: ${done.sandboxContainerProblems.join('; ')}`,
        done.sandboxLauncherRowsClosed.length === 0
          ? null
          : `runs marked crashed because their sandbox launcher's process group ended: ${theClosedRowsSaidForTheLog(done.sandboxLauncherRowsClosed)}`,
        done.sandboxLauncherProblems.length === 0
          ? null
          : `sandbox launchers could not be read: ${done.sandboxLauncherProblems.join('; ')}`,
        done.broadcastsReminded.length === 0
          ? null
          : `a broadcast reminder to ${done.broadcastsReminded.join(', ')}`,
        done.broadcastsPaused.length === 0 ? null : `broadcasts paused for ${done.broadcastsPaused.join(', ')}`,
        done.broadcastsWithNoReport.length === 0
          ? null
          : `a reminder that the slot's report has not come to ${done.broadcastsWithNoReport.join(', ')}`,
        done.mainWorldOver.length === 0 ? null : `a main-world reminder about ${done.mainWorldOver.join(', ')}`,
        done.mainWorldProblem === null ? null : `the main world's limits could not be read (${done.mainWorldProblem})`,
        done.draftsReminded.length === 0 ? null : `a reminder about a draft not sent: ${done.draftsReminded.join(', ')}`,
        done.turnDraftsSent.length === 0 ? null : `held messages sent: ${done.turnDraftsSent.join(', ')}`,
        done.longSandboxRunsReminded.length === 0
          ? null
          : `a reminder that a sandbox run has run past ${String(SANDBOX_RUN_REMINDER.hours)} hours: ${done.longSandboxRunsReminded.join(', ')}`,
        done.checksNothingStartsTold.length === 0 ? null : `a check nothing would start, told to the run's starter: ${done.checksNothingStartsTold.join(', ')}`,
        done.repliesReminded.length === 0 ? null : `a reminder that a person waits for a reply: ${done.repliesReminded.join(', ')}`,
        done.replyReminderProblem === null ? null : `the reply reminder could not run (${done.replyReminderProblem})`,
        done.staleReminded.length === 0 ? null : `a reminder about a record left unchanged to ${done.staleReminded.join(', ')}`,
        done.staleNotSaid.length === 0 ? null : `the record-duty check could not say: ${done.staleNotSaid.join('; ')}`,
        done.broadcastTimesUnreadable.length === 0
          ? null
          : `broadcast times could not be read: ${done.broadcastTimesUnreadable.join('; ')}`,
      ].filter((one) => one !== null)
      if (said.length > 0) log(`The office sent a flow reminder: ${said.join('; ')}.`)
      if (done.unreadableMessages.length > 0) log(theUnreadableMessagesSaid(done.unreadableMessages))
    } catch (err) {
      log(`The reminder watcher could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    }
    /**
     * AND THE SECRETARIES' NOTICE THAT THE SANDBOXES' CLAUDE LOGIN HAS USED 50% OR 80% OF ITS SEVEN DAYS
     * (lib/logins-week.ts). Its own step so a fault in reading the sandboxes' logs never stops the reminders above, and
     * outside `sendTheRemindersThatAreDue` so the suites that read that function never read this machine's sandboxes. Only
     * the office sends it: a world's secretaries are copies, and the same seven days would be said twice.
     */
    void (async () => {
      const { theOfficeIsInThisDatabase } = await import('./office.ts')
      if (!theOfficeIsInThisDatabase()) return
      // AND THE SECRETARY'S LINES WHEN NEW CHECKS ARE HELD FOR A 5-HOUR LIMIT AND WHEN THEY START AGAIN
      // (lib/checks-held-for-a-limit.ts). Office only for the same reason, and caught here so a fault in it never stops
      // the week-use notice.
      try {
        const told = runNamed('the hold on new checks', log, () => tellTheSecretaryOfTheHold(Date.now(), theOffice()))
        if (told.length > 0) log(`The office told the secretary about the hold on new checks: ${told.join(' ')}`)
      } catch (err) {
        log(`The hold on new checks could not be said: ${err instanceof Error ? err.message : String(err)}`)
      }
      // THE FIRST READING AFTER A START IS DONE IN SLICES THAT GIVE THE THREAD BACK. In one piece it held the live
      // server for 5,148 ms on 10 October 2026 (wave 13y round 19). After it, the notice's own reading opens only what
      // changed, as every later tick's does.
      await warmTheRoundsInTheSandboxes(undefined, (work) => runNamed('the week-use notice, its first reading', log, work))
      const sent = runNamed('the week-use notice', log, () =>
        tellTheSecretaryHowMuchOfTheWeekIsUsed(workspaceId, new Date(), theOffice()),
      )
      if (sent.length > 0) log(`The office told the secretary who takes usage notices how much of a login's week is used: ${sent.join('; ')}.`)
    })().catch((err: unknown) => {
      log(`The week-use notice could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    })
  }
  // THE LOOK IS ASKED FOR NOW, not after the first interval. The server calls this only once its port is bound, so the
  // accounts a stop left open are finished during the start rather than up to a minute later.
  void lookForRoundAccounts()
  // EACH TIMER HERE IS NAMED, so a long run of one is a line in the log and the loop watch can say whose a hold was.
  // See lib/named-timers.ts.
  const watch: NodeJS.Timeout = setInterval(named('the flow reminders', log, tick), EVERY)
  watch.unref()

  /**
   * THE FIRST READINGS THE PASS KEEPS ARE MADE NOW, ONE PIECE AT A TIME WITH THE THREAD GIVEN BACK BETWEEN THEM: the
   * fields of every session row (lib/session-fields.ts), and each secretary's messages to the person and the person's
   * answers to it (lib/broadcast.ts). Made by the first pass instead, they would hold the thread in one run. Each piece
   * is named, so a long one is a line in the log. A piece the pass needs before it is made is made by the pass, and the
   * piece then reads only what changed. A piece that fails stops the rest, and the pass makes them and says its own fault.
   */
  void (async () => {
    await aTurn()
    const pieces = runNamed('the flow reminders, a first reading', log, () => [() => void theFieldsOfEverySession(), ...theFirstReadingsOfTheBroadcasts()])
    for (const piece of pieces) {
      await aTurn()
      runNamed('the flow reminders, a first reading', log, piece)
    }
  })().catch((err: unknown) => {
    log(`The flow reminders' first readings could not be made at the start: ${err instanceof Error ? err.message : String(err)}`)
  })

  /**
   * AND THE WORLDS WHOSE ADDRESS ANSWERS NOTHING. Criterion P87's third part. It is its own
   * unref'd interval rather than part of `sendTheRemindersThatAreDue` because that function is
   * synchronous and a whole suite reads its return value; the address reading is the one thing here
   * that opens a socket. One failed tick is a line in the log, exactly as above.
   */
  const worldTick = (): void => {
    void sweepTheWorldsAndSayWhatHappened(log).catch((err: unknown) => {
      log(`The world watcher could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    })
  }
  const watchWorlds: NodeJS.Timeout = setInterval(named('the world sweep', log, worldTick), EVERY)
  watchWorlds.unref()

  /**
   * AND THE KEY FILES LEFT IN SANDBOXES' out/ FOLDERS (problem 296sqTPPdWsQ; lib/key-files.ts says what is looked at, who
   * is told and that nothing is deleted). Its own unref'd interval, KEY_FILES_EVERY apart, because it walks folders on
   * disk. Only the office walks them: a world's own table is a copy, and its notices would be a second list saying the
   * same thing about the same files. One failed walk is a line in the log, exactly as above. The walk reads every entry
   * a slice at a time and gives the thread back between two slices. Each slice is timed as the key-file check.
   */
  const keyFilesTick = (): void => {
    void (async () => {
      const { theOfficeIsInThisDatabase } = await import('./office.ts')
      if (!theOfficeIsInThisDatabase()) return
      await nameTheKeyFilesInTheSandboxesASliceAtATime(workspaceId, log, (work) => runNamed('the key-file check', log, work))
    })().catch((err: unknown) => {
      log(`The key-file check could not finish a walk: ${err instanceof Error ? err.message : String(err)}`)
    })
  }
  const watchKeyFiles: NodeJS.Timeout = setInterval(named('the key-file check', log, keyFilesTick), KEY_FILES_EVERY)
  watchKeyFiles.unref()

  /**
   * AND ONCE A NIGHT, WHAT THE DECISIONS GOVERN (lib/governs.ts says what is checked). It
   * reminds and never blocks: the project's named secretary is sent one message when a list is not empty, and every
   * project gets one line in the log saying what was sent or why nothing was. One failed project is a line in the log,
   * and the rest are still checked.
   */
  let governsCheckedOn: string | null = null
  const governsTick = (): void => {
    const now = new Date()
    if (!theGovernsCheckIsDue(now, governsCheckedOn)) return
    governsCheckedOn = theServersDay(now)
    for (const project of listWorkspaces()) {
      try {
        log(sendTheGovernsCheck(project.id, now, theOffice()))
      } catch (err) {
        log(`The governs check could not finish for ${project.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  const watchGoverns: NodeJS.Timeout = setInterval(named('the governs check', log, governsTick), KEY_FILES_EVERY)
  watchGoverns.unref()
}

/**
 * ONE WORLD TICK: REPAIR THE OFFICE'S OWN HOME ROW, SWEEP THE REST, AND SAY WHAT HAPPENED.
 *
 * THE REPAIR IS LOGGED BESIDE THE CLOSES AND THE LEFT-ALONES. The office reopens a home row that a
 * timed-out read had closed, and the row a person reads changes state; a change with no line in the
 * log is the kind of silence this repository forbids. The line carries the row id and the reason,
 * both of which are in the answer `makeSureThisOfficesHomeRowIsAlive` gives back.
 *
 * EXPORTED SO A TEST CAN DRIVE ONE TICK and read the lines, without waiting for the interval that
 * `startTheReminders` sets up.
 */
export async function sweepTheWorldsAndSayWhatHappened(log: (line: string) => void): Promise<void> {
  const { closeTheWorldsNothingIsServing, makeSureThisOfficesHomeRowIsAlive, theOfficeIsInThisDatabase } = await import(
    './office.ts'
  )
  // ONLY THE OFFICE HOLDS THE LIST A PERSON READS. A world's own table is its own copy, and a
  // copy that closed rows on its own reading would be a second list deciding the same fact.
  if (!theOfficeIsInThisDatabase()) return
  // THE OFFICE'S OWN HOME ROW IS REPAIRED FIRST. The tick runs inside the office's own world, and a
  // row closed earlier by a timed-out read is put back before the sweep runs, so every list that
  // reads "the office's home world" reads a live home again.
  // THE PARTS AFTER A WAIT ARE RUNS OF THEIR OWN, under the timer's name (lib/named-timers.ts).
  const repair = runNamed('the world sweep', log, makeSureThisOfficesHomeRowIsAlive)
  if (repair.repaired) {
    log(`The office reopened its own home row: ${repair.why}.`)
  }
  const done = await runNamed('the world sweep', log, closeTheWorldsNothingIsServing)
  if (done.closed.length > 0) log(`The office closed ${String(done.closed.length)} world(s) whose address answers nothing.`)
  if (done.leftAlone.length > 0) {
    log(
      `The office could not read ${String(done.leftAlone.length)} world(s) and left them alone: ` +
        done.leftAlone.map((one) => one.id).join(', '),
    )
  }
}
