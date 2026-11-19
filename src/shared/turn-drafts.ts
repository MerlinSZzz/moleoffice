// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TURN DRAFT: WHAT AN AGENT'S RUN WROTE TO ONE SET OF READERS IN ONE TURN, HELD UNTIL IT GOES AS ONE MESSAGE.
 *
 * The words and the one field. The rules are in src/server/lib/turn-drafts.ts.
 */

/** The draft field that makes a draft a turn draft. Only Mole Office writes it. */
export const TURN = 'turn' as const

/** The minutes within which a turn draft to a person goes after its first words were held, even while the turn runs on. */
export const A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES = 10

/** The refusal of a write that sets `turn`, or changes a turn draft, by hand. */
export const ONLY_THE_OFFICE_WRITES_A_TURN_DRAFT =
  'A turn draft holds the messages your run wrote to these readers in this turn, and Mole Office alone writes it and ' +
  'sends it: at the end of the turn, when the run reads its inbox, when it finishes, and to a person within ' +
  `${String(A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES)} minutes. A write may not set data.${TURN} or change a turn draft. ` +
  'To send it now, read your inbox or end the turn (POST /api/drafts/turn). To send a message at once, write it ' +
  'with "urgent": true. ' +
  'Nothing was written.'

/** Whether a draft's data makes it a turn draft. */
export function isATurnDraft(data: unknown): boolean {
  return data !== null && typeof data === 'object' && !Array.isArray(data) && Object.hasOwn(data, TURN)
}

/** Whether Mole Office will still send this turn draft by itself: a turn draft whose send was not refused. */
export function theOfficeWillSendThisTurnDraft(data: unknown): boolean {
  if (!isATurnDraft(data)) return false
  const turn = (data as Record<string, unknown>)[TURN]
  return turn !== null && typeof turn === 'object' && !Object.hasOwn(turn, 'notSent')
}
