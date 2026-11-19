// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PAUSING THE RUNS AT WORK WHEN MOLE OFFICE IS SHUT DOWN ON PURPOSE.
 *
 * Criterion W6 of design/window/ACCEPTANCE.md, the server side (piece H6 of plan hp7Z-IW9JWSX):
 * "If no agent run is going, Mole Office closes at once. If some are, the shutdown lists them (which
 * agent, which message, since when) … on that confirmation the runs are paused with their data kept,
 * and then Mole Office closes." The window's second confirmation is piece H8 and is not here. The
 * page that resumes a paused run with one press is piece H7 and is not here either.
 *
 * ---------------------------------------------------------------------------------------
 * A SHUTDOWN IS NOT A RESTART
 * ---------------------------------------------------------------------------------------
 *
 * A signal to the server (`mole-office stop`, a merge under `tsx watch`) leaves every run going on
 * purpose: the next server's worker picks them up and carries on any a restart cut off (criterion
 * M24). That is unchanged. This file is the other way out: a person asked to shut Mole Office down,
 * so the runs are stopped and kept, and none of them starts again by itself. Question 2 of the plan
 * is answered by one fact: a run
 * stopped half way is stopped for something urgent, so it waits for a press.
 *
 * A PAUSED RUN IS NEVER CARRIED ON BY ITSELF, AND NOTHING HERE HAD TO SAY SO. The worker picks up
 * only records whose state is `running` (`runsToPickUp` in lib/worker.ts), and the door that ends a
 * run a restart cut off refuses any other state (`whyThisRunWasCutOff`). `paused` is neither, so a
 * paused run is left alone by both. tests/a-shutdown-pauses-the-runs-at-work.test.ts proves it.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * 1. The message worker is stopped first. It watches every run it started and writes how each one
 *    ended the moment its process goes; left running, it would write `crashed` over `paused`, and
 *    it could start a new run for a queued message after the list was read.
 * 2. Each run the office started is stopped by its process group, through the same release a
 *    person's stop uses, and waited for. Only a run whose process is gone is written `paused`: a run
 *    that survives the signal is reported as still running, never as paused.
 * 3. Each paused run's conversation id is read from its record. It was written when the run started
 *    (piece H5), so a run killed mid-turn still has it. A run without one is said to have none,
 *    because it can then not be resumed by its id.
 * 4. The answer goes back, and then the server shuts down through its one way out.
 */

import { clockStamp } from '@shared/time.ts'
import { theOwnPartOf } from '../../config/own-rows.mjs'
import { saysStillGoing } from '../../config/still-going.mjs'
import type { ParticipantRef } from '@shared/participants.ts'
import { readMessage, sayWhereADeliveryStands } from './messages.ts'
import { theLastToolRunStillRuns } from './merge-queue.ts'
import { patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { askAProcessGroupToStop, listResources, releaseResource } from './resources.ts'
import { everyRunRow } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'

import type { ALiveRun, APausedRun, TheLiveRuns } from '@shared/shutting-down.ts'
export type { ALiveRun, APausedRun, TheLiveRuns } from '@shared/shutting-down.ts'

function dataOf(row: { data: unknown }): Record<string, unknown> {
  return typeof row.data === 'object' && row.data !== null && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {}
}

function said(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** The message a run answers, by id and title, or the id alone when the message cannot be read. */
function theMessage(messageId: string, workspaceId: string): { id: string; title: string } {
  try {
    const message = readMessage(messageId, workspaceId)
    return { id: messageId, title: message.title }
  } catch {
    return { id: messageId, title: '' }
  }
}

/**
 * EVERY RUN AT WORK ON THIS MACHINE, IN EVERY PROJECT: the agent, the message and since when.
 *
 * Every project, because the office is shut down for all of them at once.
 *
 * A RUN THE OFFICE STARTED counts while its own process is still going, read by the same question the
 * worker's other readers ask (`theLastToolRunStillRuns`). A record that says `running` for a process
 * that has already gone is not at work: a crash or a restart cut it off, and the next start carries
 * it on as criterion M24 says.
 *
 * A SESSION THE OFFICE DID NOT START — a terminal a person is working in, an agent's own session —
 * counts while a process registered under it is still alive. The office cannot pause it, because it
 * did not start it and does not hold it, and the list says so: it keeps running after the shutdown.
 * A record that says `running` with nothing alive under it is not listed, because nothing can be said
 * to be running there.
 */
export function theLiveRuns(): TheLiveRuns {
  const pausable: ALiveRun[] = []
  const notPausable: ALiveRun[] = []
  for (const row of everyRunRow()) {
    const data = dataOf(row)
    const state = said(data['state'])
    if (state === null || !saysStillGoing(state)) continue
    const since = said(data['startedAt']) ?? row.createdAt
    const conversation = said(data['providerSession'])
    const agent = theAgentARunServes(data)
    const messageId = said(data['deliveringMessage'])
    if (data['startedByMoleOffice'] === true) {
      // The office's own processes (the server's row, the worker's row) and its tools (the check, the
      // merge tool) answer no message for an agent, and a shutdown does not pause them.
      if (messageId === null || agent === null) continue
      if (theLastToolRunStillRuns(row.workspaceId, { session: row.id }) === null) continue
      pausable.push({
        session: row.id,
        workspaceId: row.workspaceId,
        agent: { id: agent.id, handle: agent.handle },
        message: theMessage(messageId, row.workspaceId),
        since,
        conversation,
        pausable: true,
        says:
          conversation === null
            ? 'A shutdown pauses it. No conversation id was recorded for it, so it cannot be resumed by its id.'
            : `A shutdown pauses it and keeps its conversation, ${conversation}.`,
      })
      continue
    }
    // THE OFFICE'S OWN PARTS ARE NOT LISTED. The API server files its own row with an `ownPart` block
    // and no `startedByMoleOffice` mark, and until round 10b of wave 13t this list said "Mole Office did
    // not start "The API server"", which is false: it is the office. A shutdown stops it anyway.
    if (theOwnPartOf({ id: row.id, title: row.title, data }) !== null) continue
    const alive = listResources({ workspaceId: row.workspaceId, sessionRecordId: row.id }).some(
      (one) => one.type === 'process' && one.releasedAt === null && one.liveness.state === 'alive',
    )
    if (!alive) continue
    notPausable.push({
      session: row.id,
      workspaceId: row.workspaceId,
      agent: agent === null ? null : { id: agent.id, handle: agent.handle },
      message: messageId === null ? null : theMessage(messageId, row.workspaceId),
      since,
      conversation,
      pausable: false,
      says:
        `Mole Office did not start "${row.title}", so it cannot pause it. It keeps running after the shutdown.`,
    })
  }
  return { pausable, notPausable }
}

/** An actor as the participant a record names, or null where it is neither a person nor an agent. */
export function asParticipant(actor: Actor): ParticipantRef | null {
  if (actor.type === 'human') return { kind: 'person', id: actor.id }
  if (actor.type === 'agent') return { kind: 'agent', id: actor.id }
  return null
}

/**
 * PAUSE EVERY RUN THE OFFICE STARTED THAT IS STILL AT WORK, and say what happened to each.
 *
 * The caller has stopped the message worker first (see THE ORDER above). Each run's process group is
 * stopped through `releaseResource`, the release a person's stop uses, with `force` because the run's
 * session IS the process and it is still going. Only when the process is gone is the record written
 * `paused`, with who asked, when and why, and the message it was answering says so on its delivery row.
 */
export async function pauseTheRunsAtWork(who: Actor, because: string, operation: 'shutdown' | 'pause' = 'shutdown'): Promise<{ paused: APausedRun[]; notPausable: ALiveRun[] }> {
  const live = theLiveRuns()
  const pausedBy = asParticipant(who)
  const out: APausedRun[] = []
  for (const run of live.pausable) {
    const row = theLastToolRunStillRuns(run.workspaceId, { session: run.session })
    if (row === null) {
      // It ended between the list and the pause. Nothing was signalled, and it is not called paused.
      out.push({ ...run, paused: false, outcome: 'It had already ended before it could be paused, so nothing was done to it.' })
      continue
    }
    const released = await releaseResource(
      row.row.id,
      { actor: who, force: true, note: `stopped by a ${operation} of Mole Office, which pauses the runs at work: ${because}` },
      run.workspaceId,
    )
    if (released.stillAlive) {
      out.push({ ...run, paused: false, outcome: `It was asked to stop and is still running, so it is not paused. ${released.outcome}` })
      continue
    }
    const at = clockStamp()
    const sentence = `Paused by a ${operation} of Mole Office at ${at.stamp}: ${because}`
    patchRecord(
      run.session,
      {
        dataPatch: {
          state: 'paused',
          doing: sentence,
          paused: { at: at.stamp, time: at, by: pausedBy, because },
        },
      },
      THE_WORKER,
    )
    if (run.message !== null && run.agent !== null) {
      try {
        sayWhereADeliveryStands(run.message.id, { kind: 'agent', id: run.agent.id }, { because: sentence })
      } catch {
        // The message or its delivery row is gone. The run's own record says it was paused.
      }
    }
    out.push({
      ...run,
      paused: true,
      outcome:
        run.conversation === null
          ? 'Paused. No conversation id was recorded for it, so it cannot be resumed by its id.'
          : `Paused, with its conversation ${run.conversation} kept.`,
    })
  }
  return { paused: out, notPausable: live.notPausable }
}

/**
 * HOW THIS SERVER STOPS ITS WORKER AND SHUTS ITSELF DOWN, handed over by src/server/index.ts at start.
 *
 * The door cannot reach either by itself: the worker's process group and the one way out both belong
 * to the server's start. A server built without them (the in-process server the tests build with
 * `apiApp`) has nothing to shut down, and the door refuses before it pauses anything.
 */
export interface TheWayOut {
  /** Stop the message worker and wait for it to be gone. Throws, saying why, when it cannot. */
  stopTheWorker: () => Promise<string>
  /** Start the server's one way out. It returns at once; the server exits shortly after. */
  shutDown: (why: string) => void
}

/**
 * ASK THE MESSAGE WORKER'S GROUP TO STOP, AND SAY SO IN WORDS WHEN THE ASK IS REFUSED.
 *
 * The ask is SIGTERM to the group on Linux and the Mac, and a stop request on the group's pipe on Windows
 * (askAProcessGroupToStop in lib/resources.ts). A refusal is answered with the reason the ask gave, so the
 * pause door and the shutdown door say why instead of a bare error, and say that nothing was paused or shut
 * down.
 */
export async function askTheMessageWorkerToStop(pgid: number, platform?: string): Promise<void> {
  try {
    await askAProcessGroupToStop(pgid, platform)
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).trim()
    throw new PanelError(
      `The message worker in group ${String(pgid)} could not be asked to stop, so no run was paused and Mole Office ` +
        `was not shut down. It may still be running. The ask was refused: ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`,
      503,
    )
  }
}

let theWayOut: TheWayOut | null = null

/** Called once by src/server/index.ts, after the worker is started and the way out is written. */
export function thisServerShutsDownWith(way: TheWayOut): void {
  theWayOut = way
}

/** The way out, or a refusal saying this server has none. */
export function theWayOutOfThisServer(): TheWayOut {
  if (theWayOut === null) {
    throw new PanelError(
      'This server was started without a way to shut itself down, so nothing was paused and nothing was shut down. ' +
        'A server started with `mole-office start` or `npm start` has one.',
      503,
    )
  }
  return theWayOut
}
