// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND THE OFFICE PUTS IN THE MERGE QUEUE AT THE SEAL (wave 13u round 93, item 30 steps 1 to 4): the line on the agent's
 * record and the note on the run, which only the office writes, as the server stores them and the pages read them.
 * src/server/lib/merge-queue-at-the-seal.ts writes both; src/server/lib/merge-queue-fields-the-office-writes.ts refuses
 * any other write of either.
 */
import type { ParticipantRef } from './participants.ts'

/**
 * THE FIELD OF A RUN THAT HOLDS WHAT THE OFFICE DID AT THE SEAL, in two parts: `queued`, what it did with the seal for the
 * merge queue, and `nextRound`, what it did about the next round (src/shared/next-round-at-the-seal.ts). One field and
 * not two since round 96, because each field of a session costs its share of the compact read, which has a limit
 * (tests/onboarding-read.test.ts). Each writer writes its own part, and the other part stays as it was. A run sealed by
 * an earlier revision of the office may also hold a third part, `yeses`. Nothing reads or writes it now.
 */
export const AT_THE_SEAL = 'atTheSeal'

/** The two parts of a run's `atTheSeal`. */
export type APartAtTheSeal = 'queued' | 'nextRound'

/** One part of a run's `atTheSeal`, as stored, or undefined when the run has none. Read with the part's own reader. */
export function thePartAtTheSeal(data: Record<string, unknown> | null | undefined, part: APartAtTheSeal): unknown {
  const field = data?.[AT_THE_SEAL]
  return typeof field === 'object' && field !== null && !Array.isArray(field) ? (field as Record<string, unknown>)[part] : undefined
}

/** WHETHER AN AGENT'S LINE IS TURNED ON, kept on its agent record as `queuesAtTheSeal`. */
export interface QueuesAtTheSeal {
  on: boolean
  /** The repository, by id or name, the line's entries go to. Present whenever `on` is true. */
  repository?: string
  because: string
  by: ParticipantRef
  /** Local wall clock. */
  at: string
}

/** WHAT A WAITING SEAL WAITS FOR: an entry of the same line still under way, or the queue's hold. */
export const WHAT_A_SEAL_WAITS_FOR = ['an-earlier-entry', 'the-hold'] as const

/** HOW AN ENTRY A SEAL WAITED FOR ENDED, when the office then queued nothing. */
export const HOW_THE_ENTRY_ENDED = ['bounced', 'withdrawn'] as const

/**
 * WHAT THE OFFICE DID WITH A RUN'S SEAL, kept on the run as `atTheSeal.queued`. Each names the seal's commit and when the
 * office wrote it, in local wall clock.
 *
 *   - queued: the office submitted the seal, as merge entry `entry`.
 *   - already: an entry for this run and this commit was there when the office looked, so it submitted nothing.
 *   - waits: the office submitted nothing yet, for `for`; with an earlier entry, `entry` names it.
 *   - not-queued: the entry it waited for ended without landing, so it submits nothing. `told` is the message to the
 *     line's starter, or absent with `notTold` saying why nobody was told.
 *   - cannot: the queue refused the submission, and `says` holds its words.
 */
export type QueuedAtTheSeal =
  | { outcome: 'queued'; entry: string; commit: string; at: string }
  | { outcome: 'already'; entry: string; commit: string; at: string }
  | { outcome: 'waits'; for: 'an-earlier-entry'; entry: string; commit: string; at: string }
  | { outcome: 'waits'; for: 'the-hold'; commit: string; at: string }
  | { outcome: 'not-queued'; entry: string; ended: (typeof HOW_THE_ENTRY_ENDED)[number]; told?: string; notTold?: string; commit: string; at: string }
  | { outcome: 'cannot'; says: string; commit: string; at: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** The note as stored, or null when the value is not one the office writes. */
export function readQueuedAtTheSeal(value: unknown): QueuedAtTheSeal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const note = value as Record<string, unknown>
  const { outcome, commit, at } = note
  if (!isText(commit) || !isText(at)) return null
  if ((outcome === 'queued' || outcome === 'already') && isText(note['entry'])) return { outcome, entry: note['entry'], commit, at }
  if (outcome === 'waits' && note['for'] === 'an-earlier-entry' && isText(note['entry'])) return { outcome, for: 'an-earlier-entry', entry: note['entry'], commit, at }
  if (outcome === 'waits' && note['for'] === 'the-hold') return { outcome, for: 'the-hold', commit, at }
  if (outcome === 'not-queued' && isText(note['entry']) && (note['ended'] === 'bounced' || note['ended'] === 'withdrawn')) {
    return {
      outcome,
      entry: note['entry'],
      ended: note['ended'],
      ...(isText(note['told']) ? { told: note['told'] } : {}),
      ...(isText(note['notTold']) ? { notTold: note['notTold'] } : {}),
      commit,
      at,
    }
  }
  if (outcome === 'cannot' && isText(note['says'])) return { outcome, says: note['says'], commit, at }
  return null
}

/** The line as stored on an agent record, or null when the value is not one the office writes. */
export function readQueuesAtTheSeal(value: unknown): QueuesAtTheSeal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const line = value as Record<string, unknown>
  const by = line['by'] as Record<string, unknown> | null | undefined
  if (typeof line['on'] !== 'boolean' || !isText(line['because']) || !isText(line['at'])) return null
  if (typeof by !== 'object' || by === null || (by['kind'] !== 'agent' && by['kind'] !== 'person') || !isText(by['id'])) return null
  if (line['on'] && !isText(line['repository'])) return null
  return {
    on: line['on'],
    ...(isText(line['repository']) ? { repository: line['repository'] } : {}),
    because: line['because'],
    by: { kind: by['kind'], id: by['id'] },
    at: line['at'],
  }
}
