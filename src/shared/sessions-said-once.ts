// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EVERY ROW OF A NARROWED SESSIONS ANSWER SAYS ALIKE, SAID ONCE.
 *
 * `GET /api/sessions?only=running` repeated two values on every row: `placement`, which a narrowed
 * answer never works out and so is the same on every row, and `stateReason`, which every run filed
 * by hand with no log shares. Measured in wave 13y's round 29 on two copies of the office, they were
 * 279 and 193 bytes a row, 42 to 44% of a 1.6 MB answer. Round 30 added `itsProcess`, what the office
 * sees of a hand-filed run's process, which every such run that recorded no pid shares: about 70 bytes
 * a row on the same copies.
 *
 * THE RULE. The answer carries `saidOnce`, the value most rows hold for each of these fields. A row
 * leaves a field out when its value is that one, byte for byte. A row whose value differs keeps its
 * own, so no row loses a value it does not share. A reader puts the value back for every row that
 * left it out.
 *
 * ONE PLACE, in shared/, because the server says the values once and the page puts them back, and
 * two copies of the rule could drift with nothing failing.
 */

/** The fields a narrowed answer may say once. */
export const SAID_ONCE_FIELDS = ['placement', 'stateReason', 'itsProcess'] as const
type SaidOnceField = (typeof SAID_ONCE_FIELDS)[number]

/** A row with the fields it shares left out. */
export type ARowSaidOnce<R> = Omit<R, SaidOnceField> & Partial<Pick<R, SaidOnceField & keyof R>>

/** The value most rows hold for each field. A field no row holds is absent. */
export type SaidOnce<R> = Partial<Pick<R, SaidOnceField & keyof R>>

/**
 * Say once what most rows say alike, and leave it out of those rows.
 *
 * The value said once is the one most rows hold, and the earliest row's when two are held equally
 * often. Values are compared as JSON, so a placement with its keys in another order counts as a
 * different value and is kept on its row.
 */
export function sayOnce<R extends Record<SaidOnceField, unknown>>(rows: readonly R[]): { rows: ARowSaidOnce<R>[]; saidOnce: SaidOnce<R> } {
  const saidOnce: Record<string, unknown> = {}
  const said = new Map<SaidOnceField, string>()
  for (const field of SAID_ONCE_FIELDS) {
    const held = new Map<string, { value: unknown; rows: number }>()
    for (const row of rows) {
      const word = JSON.stringify(row[field])
      const one = held.get(word)
      if (one === undefined) held.set(word, { value: row[field], rows: 1 })
      else one.rows += 1
    }
    let most: [string, { value: unknown; rows: number }] | null = null
    for (const entry of held) if (most === null || entry[1].rows > most[1].rows) most = entry
    if (most === null) continue
    saidOnce[field] = most[1].value
    said.set(field, most[0])
  }
  return {
    rows: rows.map((row) => {
      const left: Record<string, unknown> = { ...row }
      for (const [field, word] of said) if (JSON.stringify(row[field]) === word) delete left[field]
      return left as ARowSaidOnce<R>
    }),
    saidOnce: saidOnce as SaidOnce<R>,
  }
}

/**
 * Every row made whole again: each field a row left out is put back from `saidOnce`.
 *
 * It reads what came over the wire, so it takes anything. A row that is not an object, and a
 * `saidOnce` that is not one, are passed on as they are, and the reader's own checks then say what is
 * wrong with them.
 */
export function wholeRows(rows: readonly unknown[], saidOnce: unknown): unknown[] {
  if (typeof saidOnce !== 'object' || saidOnce === null || Array.isArray(saidOnce)) return [...rows]
  const once = saidOnce as Record<string, unknown>
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return row
    const made: Record<string, unknown> = { ...(row as Record<string, unknown>) }
    for (const field of SAID_ONCE_FIELDS) if (!Object.hasOwn(made, field) && Object.hasOwn(once, field)) made[field] = once[field]
    return made
  })
}
