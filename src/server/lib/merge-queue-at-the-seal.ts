// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE PUTS A SEALED ROUND IN THE MERGE QUEUE ITSELF, WAITS FOR THE LINE'S EARLIER ENTRY, AND HOLDS (wave 13u
 * round 93, item 30 steps 1 to 4). Proved by tests/the-office-queues-a-sealed-round.test.ts.
 *
 * A LINE is an agent whose record says `queuesAtTheSeal.on`. The person or a secretary with its own key turns it on or
 * off at POST /api/merge-queue/lines, with a reason, and the agent record keeps each change in its revisions.
 *
 * WHEN A RUN OF A LINE THAT IS ON IS SEALED with a git submission, and the gate 'queue-at-the-seal' is on, the office
 * decides what to do with the seal and keeps what it did on the run as `atTheSeal.queued`
 * (src/shared/merge-queue-at-the-seal.ts):
 *
 *   1. An entry for this run and this commit is there already: it submits nothing, and names that entry.
 *   2. The seal waited for an entry of the line that has since bounced or been withdrawn: it submits nothing, and sends
 *      the line's starter one message naming that entry.
 *   3. The queue is held (gate 'queue-held'): the seal waits for the hold.
 *   4. With the gate 'queue-waits-for-the-line' on, another run of the same line has an entry still under way: the
 *      seal waits for that entry.
 *   5. Otherwise it submits the seal, as the office, to the repository the line names.
 *
 * Each decision reads what is already done before it acts, so asking twice gives one result. A seal that waits is
 * decided again when an entry ends at the merge queue's doors (`theOfficeDecidesTheWaitingSeals`), when the person or a
 * secretary asks at POST /api/merge-queue/at-the-seal/again, and at once when the hold is lifted (round 94,
 * `theOfficeDecidesTheSealsTheHoldKept`): at the settings door, and when a choice of the hold with an end runs out.
 *
 * WHAT IS NOT MOVED: who may submit by hand, and who confirms a released check, stay as they were. A submitted entry waits
 * in the queue for the check's verdict as any other does. A round whose check the seal holds, because its last message did
 * not say it seals, is not decided at the seal; asking again decides it.
 */
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { MERGE_ENTRY_KIND, MERGE_STATES, MERGE_STATE_SPECS, type MergeState } from '@shared/merge-queue.ts'
import { AT_THE_SEAL, readQueuedAtTheSeal, readQueuesAtTheSeal, thePartAtTheSeal, type QueuedAtTheSeal, type QueuesAtTheSeal } from '@shared/merge-queue-at-the-seal.ts'
import type { QueueHeld } from '@shared/merge-queue-page.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { gateNamed } from '../../config/gates.mjs'
import { gatePosition } from '../../config/settings.mjs'
import { sqlite } from '../db/client.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { gateMet } from './gate-counts.ts'
import { theAgentOfARun, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { asTheOfficeAtTheSeal, eachHasAPlace, submitAMergeEntry, theQueueIsHeld } from './merge-queue.ts'
import { theRepositoryNamed } from './the-repository-named.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { theLandingsAreReadBelow } from './merge-queue-same-work.ts'
import { QUEUES_AT_THE_SEAL, asTheOfficeWriting } from './merge-queue-fields-the-office-writes.ts'
import { type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { aPatchThatReplaces, getRecord, nothingWrittenSentence, patchRecord, theLastChangeOfASetting, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { readRunSeal } from './sealed-tip.ts'

const FINAL_STATES: readonly MergeState[] = MERGE_STATES.filter((state) => MERGE_STATE_SPECS[state].final)

/** The line an agent's record holds, or null when it holds none the office wrote. */
function theLineOf(agent: { id: string }): QueuesAtTheSeal | null {
  const bound = anyRecordForAgent(agent.id)
  if (bound === null) return null
  return readQueuesAtTheSeal(getRecord(bound.record)?.data[QUEUES_AT_THE_SEAL])
}

/** Keep the note on the run, as the office, replacing whatever note was there. The note about the next round stays. */
function keep(run: PanelRecord, note: QueuedAtTheSeal, writes?: { wrote: boolean }): QueuedAtTheSeal {
  const before = thePartAtTheSeal(getRecord(run.id)?.data, 'queued')
  const value = typeof before === 'object' && before !== null && !Array.isArray(before) ? aPatchThatReplaces(before as Record<string, unknown>, note) : note
  const result = asTheOfficeWriting(AT_THE_SEAL, () => patchRecord(run.id, { dataPatch: { [AT_THE_SEAL]: { queued: value } } }, THE_OFFICE))
  if (writes && result.newSeq !== null) writes.wrote = true
  return note
}

/** The newest merge entry for this run and this commit, in any state, or null. */
function theEntryForThisSeal(runId: string, commit: string): string | null {
  const row = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.run') = ? AND ` +
        `json_extract(data, '$.changeset.commit') = ? ORDER BY ${theOrderWritten('records')} DESC, rowid DESC LIMIT 1`,
    )
    .get(MERGE_ENTRY_KIND, runId, commit) as { id: string } | undefined
  return row?.id ?? null
}

/** The first entry, in the order written, of another run of the same line that is still under way, or null. */
function theLinesEntryUnderWay(agent: RegisteredAgent, run: PanelRecord): string | null {
  const rows = sqlite
    .prepare(
      `SELECT id, json_extract(data, '$.run') AS run, ${theOrderWritten('records')} AS written FROM records ` +
        `WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL AND json_extract(data, '$.run') != ? ` +
        `AND json_extract(data, '$.state') NOT IN (${FINAL_STATES.map(() => '?').join(', ')}) ORDER BY written, rowid`,
    )
    .all(MERGE_ENTRY_KIND, run.workspaceId, run.id, ...FINAL_STATES) as { id: string; run: unknown; written: number | null }[]
  for (const row of eachHasAPlace(rows)) {
    const theirs = typeof row.run === 'string' ? getRecord(row.run) : null
    if (theirs !== null && theAgentOfARun(theirs)?.id === agent.id) return row.id
  }
  return null
}

/** The entry a seal waited for ended without landing: tell the line's starter once, and keep that it was not queued. */
function notQueued(run: PanelRecord, agent: RegisteredAgent, entry: string, ended: 'bounced' | 'withdrawn', commit: string, writes?: { wrote: boolean }): QueuedAtTheSeal {
  const recipient = whoIsToldOfTheRun(agent)
  const starter = 'to' in recipient ? recipient.to : null
  const inside = { wrote: false }
  const result = sqlite.transaction(() => {
    const told =
      starter === null
        ? null
        : writeAMessage({
            workspaceId: run.workspaceId,
            to: [starter],
            onlyThem: true,
            aboutRun: run.id,
            actor: THE_OFFICE,
            notice: 'aSealWasNotQueued',
            title: `Run ${run.id} was not put in the merge queue`,
            body:
              `Run ${run.id} ("${run.title}") was sealed at commit ${commit.slice(0, 12)}, and the office did not put it in the merge queue. ` +
              `It waited for merge entry ${entry} of the same line, and that entry ${ended === 'bounced' ? 'bounced' : 'was withdrawn'}. ` +
              'The office will not submit this seal. Submit it by hand at POST /api/merge-queue once the line is put right, or seal the run again.',
          })
    if (told !== null) inside.wrote = true
    return keep(run, {
      outcome: 'not-queued',
      entry,
      ended,
      ...(told === null ? { notTold: 'Nobody is recorded as having started this line.' } : { told }),
      commit,
      at: nowStamp(),
    }, inside)
  })()
  if (writes && inside.wrote) writes.wrote = true
  return result
}

/**
 * DECIDE ONE SEALED RUN, at its seal or again. Null when the office has nothing to decide: the run is not a git seal of
 * a line that is on, or the gate 'queue-at-the-seal' is off. At the seal the gate counts every seal of a line that is on,
 * whichever way it is set. A refusal of the submission is kept as `cannot` with the queue's own words.
 */
export function decideASealedRound(runId: string, asked: 'at-the-seal' | 'again', writes?: { wrote: boolean }): QueuedAtTheSeal | null {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || run.deletedAt) return null
  const submission = run.data['submission'] as { kind?: unknown } | undefined
  if (submission?.kind !== 'git') return null
  const seal = readRunSeal(run.id)
  const commit = seal?.seal.git?.commit
  if (commit === undefined) return null
  const agent = theAgentOfARun(run)
  if (agent === null) return null
  const line = theLineOf(agent)
  if (line?.on !== true || line.repository === undefined) return null
  if (asked === 'at-the-seal' ? gateMet('queue-at-the-seal') !== '1' : gatePosition('queue-at-the-seal') !== '1') return null

  const stored = readQueuedAtTheSeal(thePartAtTheSeal(run.data, 'queued'))
  const same = stored !== null && stored.commit === commit ? stored : null
  if (same !== null && (same.outcome === 'queued' || same.outcome === 'already' || same.outcome === 'not-queued')) return same

  // DONE ALREADY: by hand, or by the office in an earlier ask. Read before anything else, so nothing is done twice.
  const done = theEntryForThisSeal(run.id, commit)
  if (done !== null) return keep(run, { outcome: 'already', entry: done, commit, at: nowStamp() }, writes)

  if (same?.outcome === 'waits' && same.for === 'an-earlier-entry') {
    const earlier = getRecord(same.entry)
    const state = earlier !== null && earlier.kind === MERGE_ENTRY_KIND && !earlier.deletedAt ? (earlier.data['state'] as MergeState) : null
    if (state === 'bounced' || state === 'withdrawn') return notQueued(run, agent, same.entry, state, commit, writes)
  }

  if (theQueueIsHeld()) {
    if (same?.outcome === 'waits' && same.for === 'the-hold') return same
    gateMet('queue-held')
    if (writes) writes.wrote = true
    return keep(run, { outcome: 'waits', for: 'the-hold', commit, at: nowStamp() }, writes)
  }

  const underWay = theLinesEntryUnderWay(agent, run)
  if (underWay !== null) {
    const waits = gatePosition('queue-waits-for-the-line')
    if (waits === '1' && same?.outcome === 'waits' && same.for === 'an-earlier-entry' && same.entry === underWay) return same
    const wait = gateMet('queue-waits-for-the-line')
    if (writes) writes.wrote = true
    if (wait === '1') return keep(run, { outcome: 'waits', for: 'an-earlier-entry', entry: underWay, commit, at: nowStamp() }, writes)
  }

  try {
    const result = sqlite.transaction(() => {
      const submitted = asTheOfficeAtTheSeal(() =>
        submitAMergeEntry({ workspaceId: run.workspaceId, submission: { run: run.id, changeset: { adapter: 'git', repository: line.repository! } }, actor: THE_OFFICE }),
      )
      return keep(run, { outcome: 'queued', entry: submitted.entry.id, commit, at: nowStamp() })
    })()
    if (writes) writes.wrote = true
    return result
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return keep(run, { outcome: 'cannot', says: error.message, commit, at: nowStamp() }, writes)
  }
}

/**
 * AT THE SEAL, from the record door after the seal is written. A failure is answered as `notKept` with its words, because
 * the seal stands whatever the office then did with it.
 *
 * BEFORE IT DECIDES, when the run's seal has a git part, it starts `theLandingsAreReadBelow` with that seal's repository
 * and commit, and does not wait for it. Those are the same two values the door that takes a submission reads, so a
 * submission that comes after the seal finds the patches kept instead of reading them while it waits. A seal that cannot
 * be read here starts nothing: the decision below reads it again and says what is wrong in its own words.
 */
export function theOfficeDecidesAtTheSeal(runId: string): QueuedAtTheSeal | { notKept: string } | null {
  try {
    const git = readRunSeal(runId)?.seal.git
    if (git != null) void theLandingsAreReadBelow(git.repository, git.commit)
  } catch {
    // Nothing was started: `decideASealedRound` reads the seal again and says what is wrong in its own words.
  }
  try {
    return decideASealedRound(runId, 'at-the-seal')
  } catch (error) {
    return { notKept: error instanceof Error ? error.message : String(error) }
  }
}

/** One waiting seal the office decided again, or could not. */
export type AWaitingSealDecided = { run: string; queuedAtTheSeal: QueuedAtTheSeal | null } | { run: string; failed: string }

/**
 * DECIDE EVERY SEAL THAT WAITS, oldest note first, after an entry ended at a merge queue door or the hold was lifted.
 * Nothing is read while the gate 'queue-at-the-seal' is off. A failure of one run is answered beside the others and does
 * not undo the door's act.
 */
export function theOfficeDecidesTheWaitingSeals(writes?: { wrote: boolean }): AWaitingSealDecided[] {
  if (gatePosition('queue-at-the-seal') !== '1') return []
  const waiting = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.${AT_THE_SEAL}.queued.outcome') = 'waits' ` +
        `ORDER BY json_extract(data, '$.${AT_THE_SEAL}.queued.at'), rowid`,
    )
    .all() as { id: string }[]
  return waiting.map(({ id }): AWaitingSealDecided => {
    try {
      return { run: id, queuedAtTheSeal: decideASealedRound(id, 'again', writes) }
    } catch (error) {
      return { run: id, failed: error instanceof Error ? error.message : String(error) }
    }
  })
}

/**
 * THE HOLD LIFTED (wave 13u round 94): every seal that waits is decided again at once, by the same path as an entry that
 * ended. `heldBefore` says whether the queue was held before the change: read at the settings door before it writes, and
 * true at the run-out when a choice of the hold ran out. Nothing is decided while the queue is still held.
 */
export function theOfficeDecidesTheSealsTheHoldKept(heldBefore: boolean): AWaitingSealDecided[] {
  if (!heldBefore || theQueueIsHeld()) return []
  return theOfficeDecidesTheWaitingSeals()
}

/** ASKED AGAIN by the person or a secretary: refused while the gate or the run's line is off, so nothing reads as done. */
export function askTheOfficeAgain(runId: string, workspaceId: string): { run: string; queuedAtTheSeal: QueuedAtTheSeal; says: string; nothingWritten?: string } {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || run.deletedAt || run.workspaceId !== workspaceId) throw new PanelError(`No run ${runId} in this project.`, 404)
  if (gatePosition('queue-at-the-seal') !== '1') {
    throw new PanelError(`The office puts no sealed round in the merge queue while the setting ${gateNamed('queue-at-the-seal').setting} is off, so run ${runId} was not decided. Nothing was written.`, 409)
  }
  const writes = { wrote: false }
  const decided = decideASealedRound(runId, 'again', writes)
  if (decided === null) {
    throw new PanelError(`Run ${runId} is not a git seal of a line that is turned on, so the office has nothing to decide. Nothing was written.`, 409)
  }
  const nothingWritten = writes.wrote ? undefined : nothingWrittenSentence({ kind: 'already-stored' })
  return { run: runId, queuedAtTheSeal: decided, says: nothingWritten ?? whatTheNoteSays(runId, decided), ...(nothingWritten === undefined ? {} : { nothingWritten }) }
}

/** The note in one sentence, for a door's reply. */
function whatTheNoteSays(runId: string, note: QueuedAtTheSeal): string {
  switch (note.outcome) {
    case 'queued': return `The office submitted run ${runId} as merge entry ${note.entry}.`
    case 'already': return `Merge entry ${note.entry} already carries run ${runId} at this commit, so the office submitted nothing.`
    case 'waits': return note.for === 'the-hold' ? `Run ${runId} waits: the merge queue is held.` : `Run ${runId} waits for merge entry ${note.entry} of the same line to land.`
    case 'not-queued': return `Run ${runId} is not queued: merge entry ${note.entry} of the same line ${note.ended === 'bounced' ? 'bounced' : 'was withdrawn'}.`
    case 'cannot': return `The merge queue refused run ${runId}: ${note.says}`
  }
}

/**
 * TURN A LINE ON OR OFF, kept on the agent's record as the office. The door has asked who is calling; this reads the
 * agent and the repository, and refuses a line that would name neither.
 */
export function turnALine(input: { workspaceId: string; agent: string; on: boolean; because: string; repository?: string; actor: Actor }): { agent: string; line: QueuesAtTheSeal; says: string; nothingWritten?: string } {
  const found = theAgentAnArrivingReferenceNames(input.agent, 'writing')
  if (found === null) throw new PanelError(`No agent is called "${input.agent}", so no line was turned. Nothing was written.`, 404)
  const bound = anyRecordForAgent(found.agent.id)
  if (bound === null) throw new PanelError(`Agent "${input.agent}" has no agent record to keep its line on. Nothing was written.`, 409)
  const repository = input.repository === undefined ? undefined : theRepositoryNamed(input.repository, input.workspaceId).name
  const by: ParticipantRef | null = participantForActor(input.actor)
  if (by === null) throw new PanelError(`Nothing is registered as "${input.actor.id}", so the line would name nobody as who turned it. Nothing was written.`, 403)
  const line: QueuesAtTheSeal = { on: input.on, ...(repository === undefined ? {} : { repository }), because: input.because, by, at: nowStamp() }
  const record = getRecord(bound.record)!
  const before = record.data[QUEUES_AT_THE_SEAL]
  const value = typeof before === 'object' && before !== null && !Array.isArray(before) ? aPatchThatReplaces(before as Record<string, unknown>, { ...line }) : line
  const result = asTheOfficeWriting(QUEUES_AT_THE_SEAL, () => patchRecord(record.id, { dataPatch: { [QUEUES_AT_THE_SEAL]: value } }, THE_OFFICE))
  const nothingWritten = result.nothingWritten ? nothingWrittenSentence({ kind: 'already-stored' }) : undefined
  return {
    agent: found.agent.id,
    line,
    ...(nothingWritten === undefined ? {} : { nothingWritten }),
    says: nothingWritten ?? (input.on
      ? `The line of ${found.agent.handle} is turned on: its sealed rounds go to ${repository!} once the office queues at the seal.`
      : `The line of ${found.agent.handle} is turned off: the office puts none of its sealed rounds in the merge queue.`),
  }
}

/** WHO HELD THE QUEUE, WHEN AND WHY, read from the setting's last kept change; null while it is not held. */
export function whoHeldTheQueue(): QueueHeld | null {
  if (!theQueueIsHeld()) return null
  const last = theLastChangeOfASetting(`runtime:${gateNamed('queue-held').setting}`)
  let after: { value?: unknown; because?: unknown } | null = null
  try {
    after = last?.to === null || last === null ? null : (JSON.parse(last.to) as { value?: unknown; because?: unknown })
  } catch {
    after = null
  }
  // HELD BY THE SETTING'S OWN FILE, or by a change the log does not hold: who, when and why are not known.
  if (last === null || after?.value !== '1') return { by: null, at: null, because: null }
  return { by: participantForActor(last.by), at: last.at, because: typeof after.because === 'string' ? after.because : null }
}
