// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN WRITES OF A RUN'S FIELDS: the later-look mark, how the round ended, the next round, one worker run,
 * the Casting roll and the cut asked. Each is the only write of its field. Each asks the human-only guard and keeps
 * its own change row and revision. They were moved whole out of src/server/lib/records.ts in wave 13s round 108, with
 * no change of behaviour, so that a change to them no longer meets another line's change in that file. The line that
 * owns them is 13n.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. A test deleted on 13 November 2026 held that. No line changed in the move. `patchRecord` in records.ts still calls `writeTheEndedRunLookMark`. The refusals of these fields to an
 * ordinary write stay in records.ts, in `createRecordWithReport` and `patchRecord`.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes the guard `assertMayWrite` and four helpers from it. That
 * is safe for the same reason as records/reading.ts: every reference this file makes to records.ts is inside a
 * function body, so nothing of records.ts is read while it is still being evaluated.
 *
 * tests/guard-human-only.test.ts and tests/revision-ledger-agrees-with-the-change-log.test.ts read this folder as well
 * as records.ts, so each write here is still found, and must still ask the guard and keep a revision.
 */
import { eq } from 'drizzle-orm'
import { CASTING_ROLL, type CastingRollRecord } from '@shared/casting-roll.ts'
import { ENDED_RUN_LOOK_FIELD } from '@shared/ended-run-resources.ts'
import { HOW_THE_ROUND_ENDED } from '@shared/how-the-round-ended.ts'
import { NEXT_ROUND } from '@shared/next-round.ts'
import { moleOffice } from '@shared/participants.ts'
import { CUT_ASKED, IMAGES_GIVEN, WORKER_PACKAGE, WORKER_RUNS, type TheCutAsked, type TheImagesGiven, type TheWorkerPackage } from '@shared/worker-runs.ts'
import { db, sqlite } from '../../db/client.ts'
import { theWorkerRunKeyToWrite } from '../registry-aliases/worker-runs.ts'
import { records } from '../../db/schema.ts'
import { assertMayWrite, saveRevision, type Actor } from '../records.ts'
import { logChange } from '../log-change.ts'
import { now } from '@shared/now.ts'
import { sameJson } from '@shared/same-json.ts'
import { getRecord } from './reading.ts'

/**
 * yFiC5HsshiTi: only the office calls this later-look path. Like every record write, it asks the
 * human-only guard and keeps its own revision, so its change rows and revision name the same actor.
 */
export function writeTheEndedRunLookMark(id: string, endedAt: string | null, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing its later look mark.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so its later look mark cannot be written.`)
  const data = { ...held.data }
  const before = data[ENDED_RUN_LOOK_FIELD]
  if (endedAt === null) delete data[ENDED_RUN_LOOK_FIELD]
  else data[ENDED_RUN_LOOK_FIELD] = endedAt
  if (sameJson(before, data[ENDED_RUN_LOOK_FIELD])) return
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${ENDED_RUN_LOOK_FIELD}`, before, data[ENDED_RUN_LOOK_FIELD])
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S WRITE OF `howTheRoundEnded` (wave 13j round loop-1), the only one. Like the look mark above it asks the
 * human-only guard and keeps its own revision. src/server/lib/how-a-round-ended.ts decides what it holds.
 */
export function writeHowTheRoundEnded(id: string, value: Record<string, unknown>, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing how its round ended.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so how its round ended cannot be written.`)
  const data = { ...held.data }
  const before = data[HOW_THE_ROUND_ENDED]
  data[HOW_THE_ROUND_ENDED] = value
  if (sameJson(before, value)) return
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${HOW_THE_ROUND_ENDED}`, before, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S WRITE OF `nextRound` (wave 13j round loop-2), the only one, built like `writeHowTheRoundEnded` above.
 * src/server/lib/next-round.ts decides what it holds and who it is written as.
 */
export function writeTheNextRound(id: string, value: Record<string, unknown>, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing its next round.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so its next round cannot be written.`)
  const data = { ...held.data }
  const before = data[NEXT_ROUND]
  data[NEXT_ROUND] = value
  if (sameJson(before, value)) return
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${NEXT_ROUND}`, before, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S WRITE OF ONE ENTRY OF `workerRuns` (wave 13j round loop-3), the only one, built like `writeTheNextRound`
 * above. The entry is the worker's, by its registry id. src/server/lib/worker-runs.ts decides what it holds. It is written
 * under the key already stored for the same canonical id, which is never renamed, and under the canonical id otherwise.
 */
export function writeTheWorkerRun(id: string, agentId: string, value: Record<string, unknown>, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing its worker runs.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so its worker runs cannot be written.`)
  const data = { ...held.data }
  const all = typeof data[WORKER_RUNS] === 'object' && data[WORKER_RUNS] !== null && !Array.isArray(data[WORKER_RUNS]) ? (data[WORKER_RUNS] as Record<string, unknown>) : {}
  const key = theWorkerRunKeyToWrite(sqlite, all, agentId)
  const before = Object.hasOwn(all, key) ? all[key] : undefined
  if (sameJson(before, value)) return
  data[WORKER_RUNS] = { ...all, [key]: value }
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${WORKER_RUNS}.${key}`, before, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S ONE WRITE OF A RUN'S CASTING ROLL, which every ordinary write is refused (ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL).
 * Written once: the same roll again changes nothing, and a different one is a broken assumption, so it throws.
 */
export function writeTheCastingRoll(id: string, value: CastingRollRecord, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing its Casting roll.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so it holds no Casting roll.`)
  const before = held.data[CASTING_ROLL]
  if (sameJson(before, value)) return
  if (before !== undefined) throw new Error(`Run ${id} already holds a different Casting roll, and a roll is written once.`)
  const data = { ...held.data, [CASTING_ROLL]: value }
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${CASTING_ROLL}`, undefined, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S ONE WRITE OF WHICH COMMIT A WORKER'S RUN WAS ASKED TO BE CUT FROM, which every ordinary write is refused
 * (ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED). Written once, as the Casting roll is: the same value again changes nothing,
 * and a different one is a broken assumption, so it throws.
 */
export function writeTheCutAsked(id: string, value: TheCutAsked, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing which commit it was asked to be cut from.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so it holds no cut asked.`)
  const before = held.data[CUT_ASKED]
  if (sameJson(before, value)) return
  if (before !== undefined) throw new Error(`Run ${id} already holds a different cut asked, and it is written once.`)
  const data = { ...held.data, [CUT_ASKED]: value }
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${CUT_ASKED}`, undefined, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S ONE WRITE OF THE PACKAGE A WORKER'S RUN WAS STARTED FOR, which every ordinary write is refused
 * (ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE). Written once, as the cut asked is: the same value again changes nothing,
 * and a different one is a broken assumption, so it throws.
 */
export function writeTheWorkerPackage(id: string, value: TheWorkerPackage, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing the package it was started for.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so it holds no worker package.`)
  const before = held.data[WORKER_PACKAGE]
  if (sameJson(before, value)) return
  if (before !== undefined) throw new Error(`Run ${id} already holds a different worker package, and it is written once.`)
  const data = { ...held.data, [WORKER_PACKAGE]: value }
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${WORKER_PACKAGE}`, undefined, value)
    saveRevision(id, 'update', actor)
  })()
}

/**
 * THE OFFICE'S ONE WRITE OF WHICH IMAGES A WORKER'S RUN WAS GIVEN, which every ordinary write is refused
 * (ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN). Written once, as the cut asked is: the same value again changes nothing,
 * and a different one is a broken assumption, so it throws.
 */
export function writeTheImagesGiven(id: string, value: TheImagesGiven, actor: Actor): void {
  const held = getRecord(id)
  if (held === null) throw new Error(`Run ${id} could not be read while writing which images it was given.`)
  assertMayWrite(held.kind, 'change', actor, id)
  if (held.kind !== 'session') throw new Error(`Record ${id} is not a session, so it holds no images given.`)
  const before = held.data[IMAGES_GIVEN]
  if (sameJson(before, value)) return
  if (before !== undefined) throw new Error(`Run ${id} already holds different images given, and they are written once.`)
  const data = { ...held.data, [IMAGES_GIVEN]: value }
  sqlite.transaction(() => {
    db.update(records).set({ data, updatedAt: now() }).where(eq(records.id, id)).run()
    logChange(id, 'update', actor, `data.${IMAGES_GIVEN}`, undefined, value)
    saveRevision(id, 'update', actor)
  })()
}

/** The look's office write, kept with its notice and closures in the caller's transaction. */
export function clearTheEndedRunLookMark(id: string): void {
  writeTheEndedRunLookMark(id, null, { type: 'system', id: moleOffice().id })
}
