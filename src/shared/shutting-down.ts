// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SHUTDOWN DOORS ANSWER, for the server that writes it and the page that draws it. Criterion W6 of
 * design/window/ACCEPTANCE.md; the doors are src/server/api/shutdown.ts and the press is
 * src/web/components/ShutDown.tsx.
 */

/** One run at work when the list was read. */
export interface ALiveRun {
  /** The run's own session record. */
  session: string
  /** The project it is in. */
  workspaceId: string
  /** The agent it serves, by registry id and handle, or null where the record names no agent. */
  agent: { id: string; handle: string } | null
  /** The message it is answering, or null for a session the office did not start. */
  message: { id: string; title: string } | null
  /** When it started, in local time. */
  since: string
  /** Its conversation id, as recorded when it started (piece H5), or null because none was recorded. */
  conversation: string | null
  /** Whether a shutdown can pause it. Only a run the office started can be. */
  pausable: boolean
  /** One plain sentence saying what a shutdown does to it. */
  says: string
}

/** What a shutdown would find: the runs it pauses and the ones it cannot. */
export interface TheLiveRuns {
  pausable: ALiveRun[]
  notPausable: ALiveRun[]
}

/** What happened to one run when a shutdown paused it. */
export interface APausedRun extends ALiveRun {
  /** True once its process is gone and its record says `paused`. False when it survived the signal. */
  paused: boolean
  /** What happened, in one sentence. */
  outcome: string
}

/** GET /api/office/live-runs. `mayPress` is the press's own person-only check, asked of this caller. */
export interface TheLiveRunsReading extends TheLiveRuns {
  mayPress: boolean
  says: string
}

/** POST /api/office/shut-down, once it is shutting down. */
export interface TheShutDownAnswer {
  shuttingDown: true
  workerStopped: string
  paused: APausedRun[]
  notPaused: APausedRun[]
  notPausable: ALiveRun[]
  says: string
}
