// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { isDeepStrictEqual } from 'node:util'
import { AT_THE_SEAL } from '@shared/merge-queue-at-the-seal.ts'

/**
 * TWO FIELDS ONLY THE OFFICE WRITES AT THE SEAL: one for a round it puts in the merge queue (wave 13u round 93, item 30),
 * and one for what it did at a run's seal, for the queue and for the next round it asks for (rounds 93 and 94, put in
 * one field in round 96).
 *
 *   - `queuesAtTheSeal`, on an agent's record: whether the agent's line is turned on, the repository its entries go to,
 *     who turned it on or off, when and why. Written only by POST /api/merge-queue/lines.
 *   - `atTheSeal`, on a run, in two parts. `queued` is what the office did with the run's seal, written at the seal and
 *     each time it decides a waiting seal again (lib/merge-queue-at-the-seal.ts). `nextRound` is what it did about the
 *     run's next round, written at the seal (lib/next-round-at-the-seal.ts). A run sealed by an earlier revision of the
 *     office may also hold a third part, `yeses`, which nothing writes now.
 *
 * The record door refuses any other write that sets, changes or drops either of them, or any part of one:
 * lib/office-only-run-fields.ts asks `aFieldTheQueueWritesThatWouldMove` on every create, patch and revision restore.
 *
 * ITS OWN FILE, IMPORTING NOTHING OF THE SERVER, because lib/records.ts reads it through lib/office-only-run-fields.ts,
 * and lib/merge-queue-at-the-seal.ts and lib/next-round-at-the-seal.ts, which hold the mark while they write, import
 * lib/records.ts.
 */
export const QUEUES_AT_THE_SEAL = 'queuesAtTheSeal'
export type AFieldTheQueueWrites = typeof QUEUES_AT_THE_SEAL | typeof AT_THE_SEAL

/** The refusal of `queuesAtTheSeal` at the record door, on a create, on a patch and on a revision restore. */
export const ONLY_THE_OFFICE_WRITES_QUEUES_AT_THE_SEAL = 'The office writes queuesAtTheSeal at POST /api/merge-queue/lines. Nothing was written.'

/** The refusal of `atTheSeal`, or of any part of it, at the record door, on a create, on a patch and on a revision restore. */
export const ONLY_THE_OFFICE_WRITES_AT_THE_SEAL = 'The office writes atTheSeal when a run is sealed, and when it decides a waiting seal again. Nothing was written.'

let writing: AFieldTheQueueWrites | null = null

/** Run one write as the office writing `field`. The mark is cleared whether the write succeeds or throws. */
export function asTheOfficeWriting<T>(field: AFieldTheQueueWrites, write: () => T): T {
  const before = writing
  writing = field
  try {
    return write()
  } finally {
    writing = before
  }
}

/**
 * WHETHER A WHOLE `data` WOULD MOVE ONE OF THE TWO FIELDS, asked of `stored`, the data the record holds now, and
 * `whole`, the data about to replace it. It answers the first such field, or null when both hold the same value of
 * each, including when both leave it out. The office's own write passes while it holds the mark for that field.
 */
export function aFieldTheQueueWritesThatWouldMove(
  stored: Record<string, unknown>,
  whole: Record<string, unknown>,
): { field: AFieldTheQueueWrites; refusal: string; move: 'added' | 'changed' | 'dropped' } | null {
  const fields = [
    { field: QUEUES_AT_THE_SEAL, refusal: ONLY_THE_OFFICE_WRITES_QUEUES_AT_THE_SEAL },
    { field: AT_THE_SEAL, refusal: ONLY_THE_OFFICE_WRITES_AT_THE_SEAL },
  ] as const
  for (const { field, refusal } of fields) {
    if (writing === field) continue
    const now = stored[field]
    const then = whole[field]
    if (isDeepStrictEqual(then, now)) continue
    return { field, refusal, move: now === undefined ? 'added' : then === undefined ? 'dropped' : 'changed' }
  }
  return null
}
