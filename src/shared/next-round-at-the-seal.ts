// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT ROUND THE OFFICE ASKS FOR AT THE SEAL (wave 13u round 94, item 30 step 5) OR AT THE RELEASE (wave 13r round
 * AX, item 24): the note only the office writes, as the server stores it and the pages read it.
 * src/server/lib/next-round-at-the-seal.ts writes it; src/server/lib/merge-queue-fields-the-office-writes.ts refuses any
 * other write of it.
 */

/** When the office looked: when the run was sealed, or when a check released it. */
export const NEXT_ROUND_MOMENTS = ['seal', 'release'] as const
export type NextRoundMoment = (typeof NEXT_ROUND_MOMENTS)[number]

/**
 * WHAT THE OFFICE DID ABOUT A RUN'S NEXT ROUND, kept on the run as `atTheSeal.nextRound`. Each says when the office
 * wrote it, in local wall clock, and at which moment. A note written before the release moment was added names no
 * moment, and was written at the seal. How the round then went is the run's own `nextRound`.
 *
 *   - asked: the office asked for the next round, with the brief at `brief.path`, whose sha256 it read then; `says`, when present, says why no secretary was told.
 *   - already: a next round was asked for this run before the office looked, so it asked nothing. `says` says by whom.
 *   - not-asked: the office asked nothing, and `says` says why.
 */
export type NextRoundAtTheSeal =
  | { outcome: 'asked'; moment: NextRoundMoment; brief: { path: string; sha256: string }; at: string; says?: string }
  | { outcome: 'already'; moment: NextRoundMoment; says: string; at: string }
  | { outcome: 'not-asked'; moment: NextRoundMoment; says: string; at: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** The note as stored, or null when the value is not one the office writes. */
export function readNextRoundAtTheSeal(value: unknown): NextRoundAtTheSeal | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const note = value as Record<string, unknown>
  const { outcome, at } = note
  if (!isText(at)) return null
  const moment = note['moment'] === undefined ? 'seal' : note['moment']
  if (!NEXT_ROUND_MOMENTS.includes(moment as NextRoundMoment)) return null
  const when = moment as NextRoundMoment
  const brief = note['brief'] as Record<string, unknown> | null | undefined
  if (outcome === 'asked' && typeof brief === 'object' && brief !== null && isText(brief['path']) && isText(brief['sha256'])) {
    return { outcome, moment: when, brief: { path: brief['path'], sha256: brief['sha256'] }, at, ...(isText(note['says']) ? { says: note['says'] } : {}) }
  }
  if ((outcome === 'already' || outcome === 'not-asked') && isText(note['says'])) return { outcome, moment: when, says: note['says'], at }
  return null
}
