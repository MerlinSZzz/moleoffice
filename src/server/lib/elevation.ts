// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY ACTING FOR THE PERSON. Criterion P59.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The raise is given only by the person's own press, in the product, on the secretary's card. Only a
 * secretary can hold it. Before the raise a secretary still has some limits; while it holds, that
 * secretary has every one of the person's acts.
 *
 * So an elevation is a STANDING WARRANT. A warrant is the person's quoted words for one act; an elevation is
 * their press for every act of theirs, for a period. They answer the same question — is this agent
 * allowed to do a thing that is the person's — so they open the same doors, and no door opens for
 * one that does not open for the other.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS STORED, AND WHY IT IS BOTH PLACES
 * ---------------------------------------------------------------------------------------
 *
 * The press writes `data.elevation` on the secretary's `agent` RECORD, through the ordinary record
 * write path. That is what makes the grant a thing with a history: a change row and a revision, both
 * saying the person made it and when, and both readable on the record's own page.
 *
 * `keepTheAgentRegistryInStep` then copies it to `agents.elevation`, and THAT is what a refusal
 * reads. Two reasons. The registry row is the installation's and an `agent` record belongs to one
 * project, so reading the record would make "may this agent act for them" depend on which project the
 * request named. And the gate already reads that row for the role, so the question is one row lookup
 * rather than two. It is the same arrangement `role` has, for the same two reasons.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ENDS, AND WHICH OF THEM NEED SOMEBODY TO PRESS ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * All three ends can be used. `elevationStillHolds` in @shared/roles.ts is the reading:
 *
 *   · AT A TIME. Compared to the clock on every request. Nothing runs, nothing is scheduled, and the
 *     grant stops holding the moment the stamp passes. A background job would be a second thing that
 *     could be down while the product went on believing an agent could act for them.
 *   · WHEN A PIECE OF WORK ENDS. Cannot be answered from the grant alone, so it holds until
 *     `endedAt` is written, and releasing the claim on that record is what writes it —
 *     `elevationsThatEndWith` below, read from the one place a claim is released. That is the
 *     product's own answer to "a piece of work ended": it is the same event that retires the agents
 *     started for it.
 *   · WHEN YOU SAY. Holds until their press.
 *
 * WHO ENDS ONE EARLY. The person, at DELETE /api/roles/elevation/<handle>, and the raised agent itself, only its own
 * raise, at POST /api/roles/raises/<id>/end. Nobody else. Giving or lengthening a raise is the
 * person's press alone, refused to every agent, raised or not, which is criterion P60.
 */

import { nanoid } from 'nanoid'

import { sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { db } from '../db/client.ts'
import { changes, pressesForThePerson, records, revisions } from '../db/schema.ts'
import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm'
import { nowStamp, parseStoredStamp } from '@shared/time.ts'
import { isADoorTheListNames, whatThisDoorDoes } from '@shared/what-the-grant-carries-words.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { revocationOf } from '../db/revocation-of.ts'
import { WHAT_THE_PERIOD_DID, elevationStillHolds, whatThePeriodDidKey, mayBeElevated, type ActUnderThePeriod, type Elevation, type TheDoorOfAPress, type TheReasonOfAnAct } from '@shared/roles.ts'
import { theReasonsOfThePresses } from '../db/the-reasons-of-the-presses.ts'
import { readElevations, readElevation } from '@shared/read-elevations.ts'
import { A_SETTING_ON_THE_LEDGER } from '@shared/a-setting-on-the-ledger.ts'
import { theGrantOnTheRow } from './elevations-that-end-with.ts'
import { theElevationOn } from './elevations-that-end-with.ts'
import type { SessionRunRow } from '../db/types/elevation.ts'

export { readElevations, readElevation }

/**
 * THE REGISTRY ID AN ARRIVING REFERENCE NAMES, or null because no agent bears it. A caller hands
 * these functions an agent's id or its handle: the caller's own header, or a handle from a request.
 * The one resolver says which agent it means, criterion I2, and a reference two agents answer to is
 * refused there with a 409 naming both.
 */
function theAgentIdNamedBy(reference: string): string | null {
  return theAgentAnArrivingReferenceNames(reference, 'reading')?.agent.id ?? null
}

export { theGrantOnTheRow } from './elevations-that-end-with.ts'

/** One agent's grants, for an agent named by its id or its handle. */
function theGrantOn(reference: string): ReturnType<typeof theGrantOnTheRow> {
  const id = theAgentIdNamedBy(reference)
  return id === null ? null : theGrantOnTheRow(id)
}

/** Every grant ever made to one agent, oldest first. For a caller that is writing the next one. */
export function everyGrantMadeTo(reference: string): Elevation[] {
  return theGrantOn(reference)?.every ?? []
}

/**
 * THE ELEVATION THIS AGENT IS ACTING UNDER RIGHT NOW, or null.
 *
 * Null for an agent that never had one, for a grant that has ended, for a grant whose time has
 * passed, and for an agent whose card cannot hold one at all — the declaration says which card can,
 * so a secretary demoted to a supervisor stops acting for them without anything having to be run.
 */
export function theElevationHeldBy(reference: string): Elevation | null {
  const held = theGrantOn(reference)
  return held === null ? null : theElevationOn(held)
}

export { theElevationOn } from './elevations-that-end-with.ts'

export { whoIsActingForThePerson } from './elevations-that-end-with.ts'

/**
 * ONE RAISE, FOUND BY ITS ID, with the agent it was given to and every grant on that agent's row. Null where no agent's
 * row holds a grant with that id. The door where a raised agent ends its own raise names the raise by its id, and whose
 * raise it is comes from the row that holds it, never from the request. `holds` is the reading
 * every refusal uses (`theElevationOn`): only the last grant on a row can hold, and only until its end.
 */
export function theRaiseWithTheId(raiseId: string): { agentId: string; handle: string; every: Elevation[]; grant: Elevation; holds: boolean } | null {
  // THE TEXT SEARCH ONLY NARROWS THE ROWS; the id is then compared exactly on each grant read back.
  const rows = sqlite.prepare('SELECT id, handle FROM agents WHERE elevation IS NOT NULL AND instr(elevation, ?) > 0').all(raiseId) as Record<string, unknown>[]
  for (const row of rows) {
    const held = theGrantOnTheRow(String(row['id']))
    const grant = held?.every.find((one) => one.id === raiseId)
    if (held === null || grant === undefined) continue
    return { agentId: held.agentId, handle: String(row['handle']), every: held.every, grant, holds: theElevationOn(held)?.id === raiseId }
  }
  return null
}

/**
 * THE GRANT ON A ROW WHETHER IT HOLDS OR NOT, for a screen that says what happened rather than only
 * what is true now. A card that has just stopped acting for them says so; a card that never did says
 * nothing.
 */
export function theGrantEverMadeTo(reference: string): Elevation | null {
  return theGrantOn(reference)?.grant ?? null
}

/**
 * A NEW GRANT, as the object that goes on the record. Nothing here writes: the caller writes it
 * through the record path, so the grant gets a change row and a revision like any other write.
 */
export function aGrant(input: { endsWhen: string; until: string | null; by: string; reason?: string | null; run?: string | null }): Elevation {
  return {
    // THE CLOCK AND FOUR CHARACTERS. An id a person can read beats a random one on a ledger row
    // they are trying to match to a card, so the stamp leads. The four characters are there because
    // the clock alone is NOT enough: ending a grant and making another in the same second gave two
    // grants one id, and the record validator refused the write — rightly, and it is the reason this
    // line is not just the stamp.
    id: `elevation-${nowStamp().replace(/[^0-9]/g, '')}-${nanoid(4)}`,
    endsWhen: input.endsWhen,
    until: input.until,
    grantedAt: nowStamp(),
    grantedBy: input.by,
    endedAt: null,
    endedBecause: null,
    reason: input.reason ?? null,
    run: input.run ?? null,
  }
}

export { asStored } from '@shared/as-stored.ts'

/**
 * THE RAISES A RUN RECORDS, read from a session record's `raises`, oldest first. The start and the end of a raise sit on
 * the run the secretary was in when they pressed. A list for the reason the grants are one:
 * the record merge replaces an array wholesale and walks into an object. It reads what is there and grants nothing.
 */
export function readRaises(value: unknown): Record<string, unknown>[] {
  const many = Array.isArray(value) ? value : []
  return many.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null && typeof (one as Record<string, unknown>)['elevation'] === 'string')
}

/** One grant as the run records it: its id, when they pressed, what it ends at, and their reason. */
export function aRaiseOnTheRun(grant: Elevation): Record<string, unknown> {
  return {
    elevation: grant.id,
    from: grant.grantedAt,
    ...(grant.until === null ? {} : { until: grant.until }),
    reason: grant.reason ?? '',
  }
}

export { ended } from './elevations-that-end-with.ts'

export { elevationsThatEndWith } from './elevations-that-end-with.ts'

/**
 * WHICH ACTS WERE MADE UNDER ONE PERIOD. Criterion P19.
 *
 * ---------------------------------------------------------------------------------------
 * THE STAMP IS ALREADY WRITTEN; THIS IS THE READING THAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * `elevationWritten` in `lib/records.ts` puts the grant on the CHANGE row and on the REVISION of
 * the write it allowed, and on nothing else. There was no reader: nothing anywhere asked those rows
 * back by period, so a period could be shown and its acts could not. This is that reader, and it is
 * the only place the answer is worked out.
 *
 * TWO LEDGERS, BECAUSE THERE ARE TWO SHAPES OF ACT. A record write keeps a whole revision, so the
 * revision is one act and carries the `seq` that names it for an undo. A link write keeps no
 * revision — it does not change what a record holds — and it is logged as a change row with `op`
 * link or unlink. Reading only revisions would leave every fork settled, replaced or reopened under
 * a period off the list; reading only changes would split a multi-field write into several rows.
 * So this asks both and joins them into one list.
 *
 * IT IS FILTERED BY PROJECT. A grant is on the agent and reaches every project, but a page is about
 * one project, so a page in another project does not list this one's acts. `json_valid` guards the
 * comparison: a row whose elevation text this build cannot read is a row this reader says nothing
 * about rather than one it invents a period for.
 *
 * A THIRD LEDGER, FOR A PRESS THAT WROTE NO CHANGE ROW (wave 13s round 2a). Every press under the
 * grant leaves a row in `presses_for_the_person`, with its reason; a door outside the change log
 * leaves that row and nothing else. A press row that no change row names is listed here as an act
 * of its own, among the others by time, its door named by the list of what the grant carries where
 * that list has words for it and by what its routes say otherwise. Reads under the grant are among
 * them, with no reason, because a read gives none.
 *
 * EACH ACT CARRIES ITS PRESS'S REASON. A link or setting act reads it from the press its change
 * row names. A revision names no press, so its reason is MATCHED and not linked: the change rows
 * of the same record, by the same agent, under the same grant, stamped at most a second from the
 * revision, that name a press. One press there gives its reason; two or more cannot be told apart,
 * and the act says so; none means no reason was written down.
 *
 * NEWEST FIRST, and the order is the stored stamps: two rows of one write share a stamp and are
 * tied by `seq`, so a multi-field write reads in the order it happened.
 */
export { A_SETTING_ON_THE_LEDGER } from '@shared/a-setting-on-the-ledger.ts'

/**
 * WHAT THE ROUTES OF ONE OPERATION SAY THEY DO, for a door the list of what the grant carries has no words for, or null
 * where they say nothing or different things. The caller hands it in, because the routes are known to the server that
 * registered them and not to this file.
 */
export type WhatTheRoutesSay = (operation: string) => string | null

export function actsUnderThePeriod(elevationId: string, workspaceId: string | null, whatTheRoutesSay: WhatTheRoutesSay): ActUnderThePeriod[] {
  const recordActs = db
    .select({
      recordId: revisions.recordId,
      title: revisions.title,
      kind: revisions.kind,
      op: revisions.op,
      seq: revisions.seq,
      actorId: revisions.actorId,
      at: revisions.at,
    })
    .from(revisions)
    .where(
      and(
        ...(workspaceId === null ? [isNull(revisions.workspaceId)] : [eq(revisions.workspaceId, workspaceId)]),
        sql`json_valid(${revisions.elevation}) AND json_extract(${revisions.elevation}, '$.id') = ${elevationId}`,
      ),
    )
    .all()

  const linkActs = db
    .select({
      recordId: changes.recordId,
      title: records.title,
      kind: records.kind,
      op: changes.op,
      actorId: changes.actorId,
      at: changes.at,
      pressId: changes.pressId,
    })
    .from(changes)
    .leftJoin(records, eq(records.id, changes.recordId))
    .where(
      and(
        ...(workspaceId === null ? [isNull(changes.workspaceId)] : [eq(changes.workspaceId, workspaceId)]),
        inArray(changes.op, ['link', 'unlink']),
        sql`json_valid(${changes.elevation}) AND json_extract(${changes.elevation}, '$.id') = ${elevationId}`,
      ),
    )
    .all()

  // AND THE SETTINGS CHANGED UNDER IT, which wrote no record (A_SETTING_ON_THE_LEDGER above).
  const settingActs = db
    .select({ recordId: changes.recordId, field: changes.field, op: changes.op, actorId: changes.actorId, at: changes.at, pressId: changes.pressId })
    .from(changes)
    .where(
      and(
        ...(workspaceId === null ? [isNull(changes.workspaceId)] : [eq(changes.workspaceId, workspaceId)]),
        eq(changes.op, 'update'),
        like(changes.recordId, `${A_SETTING_ON_THE_LEDGER}%`),
        sql`json_valid(${changes.elevation}) AND json_extract(${changes.elevation}, '$.id') = ${elevationId}`,
      ),
    )
    .all()

  // AND EVERY PRESS UNDER IT THAT WROTE NO CHANGE ROW, so no record names it (`writeDownAPressOutsideTheLog` in
  // lib/records.ts). A PRESS FILED IN NO PROJECT IS THE OFFICE'S OWN: it is listed once where the acts are read with no
  // project (the card a returning agent reads), and on every project's page, because the grant reaches every project
  // and a project's page is the only place the person reads what was pressed under it.
  const pressActs = db
    .select({
      id: pressesForThePerson.id,
      operation: pressesForThePerson.operation,
      reason: pressesForThePerson.reason,
      agentId: pressesForThePerson.agentId,
      at: pressesForThePerson.at,
    })
    .from(pressesForThePerson)
    .where(
      and(
        eq(pressesForThePerson.grantId, elevationId),
        workspaceId === null
          ? isNull(pressesForThePerson.workspaceId)
          : or(eq(pressesForThePerson.workspaceId, workspaceId), isNull(pressesForThePerson.workspaceId)),
        sql`NOT EXISTS (SELECT 1 FROM changes WHERE changes.press_id = ${pressesForThePerson.id})`,
      ),
    )
    .all()

  const reasonOf = theReasonsOfTheActs(elevationId, workspaceId)

  const acts: ActUnderThePeriod[] = [
    ...recordActs.map((row) => ({
      recordId: row.recordId,
      title: row.title,
      kind: row.kind,
      op: row.op,
      what: WHAT_THE_PERIOD_DID[row.op] ?? row.op,
      whatKey: whatThePeriodDidKey(row.op),
      seq: row.seq,
      revoked: revocationOf(row.recordId, row.seq),
      actorId: row.actorId,
      at: row.at,
      door: null,
      reason: reasonOf.aRevision(row.recordId, row.actorId, row.at),
    })),
    ...linkActs.map((row) => ({
      recordId: row.recordId,
      // A record the ledger remembers after it was hard-removed still names the act by its id. The
      // title is the better answer wherever the record is there, which is every case this writes.
      title: row.title ?? row.recordId,
      kind: row.kind ?? '',
      op: row.op,
      what: WHAT_THE_PERIOD_DID[row.op] ?? row.op,
      whatKey: whatThePeriodDidKey(row.op),
      seq: null,
      revoked: null,
      actorId: row.actorId,
      at: row.at,
      door: null,
      reason: reasonOf.aPress(row.pressId),
    })),
    ...settingActs.map((row) => ({
      recordId: row.recordId,
      title: row.field ?? row.recordId.slice(A_SETTING_ON_THE_LEDGER.length),
      kind: 'setting',
      op: row.op,
      what: WHAT_THE_PERIOD_DID[row.op] ?? row.op,
      whatKey: whatThePeriodDidKey(row.op),
      seq: null,
      revoked: null,
      actorId: row.actorId,
      at: row.at,
      door: null,
      reason: reasonOf.aPress(row.pressId),
    })),
    ...pressActs.map((row) => {
      const door = theDoorOf(row.operation, whatTheRoutesSay)
      return {
        recordId: null,
        title: door.words?.en ?? row.operation,
        kind: '',
        op: 'press',
        what: 'pressed it for the person',
        whatKey: null,
        seq: null,
        revoked: null,
        actorId: row.agentId,
        at: row.at,
        door,
        reason: row.reason === null ? NO_REASON_WRITTEN : { written: row.reason },
      }
    }),
  ]
  return acts.sort((a, b) => (a.at === b.at ? (b.seq ?? 0) - (a.seq ?? 0) : b.at.localeCompare(a.at)))
}

const NO_REASON_WRITTEN: TheReasonOfAnAct = { written: null, because: 'none written' }

/** The door a press outside the change log pressed, named as `TheDoorOfAPress` says. */
function theDoorOf(operation: string, whatTheRoutesSay: WhatTheRoutesSay): TheDoorOfAPress {
  if (isADoorTheListNames(operation)) return { words: whatThisDoorDoes(operation), operation }
  const said = whatTheRoutesSay(operation)
  return { words: said === null ? null : { en: said, zh: null }, operation }
}

/**
 * THE REASON OF EACH ACT UNDER ONE GRANT IN ONE PROJECT, read from the press rows.
 *
 * A LINK OR A SETTING ACT IS ONE CHANGE ROW, and the row names its press. A REVISION NAMES NO PRESS, so it is matched to
 * one: the change rows of the same record, by the same agent, naming the same grant and a press, stamped at most one
 * second from the revision. The revision and its change rows are stamped by separate reads of the clock in one write, so
 * they can fall in two seconds, and no further apart. This is a match and not a stored link. Where the change rows in
 * that window name one press, that press's reason is the act's. Where they name two or more, which happens when two
 * presses on one record fall within a second of each other, it cannot tell which is the act's and says so, rather
 * than give one of them. Where they name none, or the press row is gone, no reason was written down.
 */
function theReasonsOfTheActs(
  elevationId: string,
  workspaceId: string | null,
): { aPress: (pressId: string | null) => TheReasonOfAnAct; aRevision: (recordId: string, actorId: string, at: string) => TheReasonOfAnAct } {
  // FROM THIS GRANT'S PRESS ROWS TO THE CHANGE ROWS THAT NAME THEM. A CROSS JOIN, because SQLite keeps the order of
  // one: the press rows are found by their grant and the change rows by their press, both through an index. Joined the
  // other way, every change row of the project was read to test the grant on it. A change row whose press row is gone
  // is not read, so it gives no reason, as before.
  const pressed = db
    .select({ recordId: changes.recordId, actorId: changes.actorId, at: changes.at, pressId: changes.pressId })
    .from(pressesForThePerson)
    .crossJoin(changes)
    .where(
      and(
        eq(pressesForThePerson.grantId, elevationId),
        eq(changes.pressId, pressesForThePerson.id),
        ...(workspaceId === null ? [isNull(changes.workspaceId)] : [eq(changes.workspaceId, workspaceId)]),
        sql`json_valid(${changes.elevation}) AND json_extract(${changes.elevation}, '$.id') = ${elevationId}`,
      ),
    )
    .all()
  const reasons = theReasonsOfThePresses([...new Set(pressed.map((row) => row.pressId!))])
  const aPress = (pressId: string | null): TheReasonOfAnAct => {
    const reason = pressId === null ? null : (reasons.get(pressId) ?? null)
    return reason === null ? NO_REASON_WRITTEN : { written: reason }
  }
  const within = (one: string, other: string): boolean => {
    const [a, b] = [parseStoredStamp(one), parseStoredStamp(other)]
    // A stamp this build cannot read matches only a stamp written the same.
    return a === null || b === null ? one === other : Math.abs(a - b) <= 1000
  }
  const aRevision = (recordId: string, actorId: string, at: string): TheReasonOfAnAct => {
    const matched = new Set(
      pressed.filter((row) => row.recordId === recordId && row.actorId === actorId && within(row.at, at)).map((row) => row.pressId!),
    )
    if (matched.size > 1) return { written: null, because: 'cannot tell' }
    return aPress(matched.size === 1 ? [...matched][0]! : null)
  }
  return { aPress, aRevision }
}

export { theFirstRecordForAgentStatement } from '../db/any-record-for-agent.ts'

export { anyRecordForAgent } from '../db/any-record-for-agent.ts'

export { theRunAWriteCameFrom } from '../db/the-run-a-write-came-from.ts'

export { theRunsWritesCameFrom } from '../db/the-runs-writes-came-from.ts'

export { WHICH_RUN_A_SESSION_IS } from '../db/the-run-a-write-came-from.ts'
export { A_LIVE_SESSION_RECORD } from '../db/the-run-a-write-came-from.ts'

export type { SessionRunRow } from '../db/types/elevation.ts'

export { theRunTheRowSays } from '../db/the-run-a-write-came-from.ts'
