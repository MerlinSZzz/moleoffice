// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DISCHARGING AN OBLIGATION: `dischargeObligation`, the two shapes it takes and gives, and the states that discharge.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. `noRecordHasThisId` and `incompletenessOf` are taken from records.ts and
 * are read only inside `dischargeObligation`, so nothing of records.ts is read while this file is being evaluated.
 * `Actor` and `DataPatchOutcome` are type-only imports, which the compiler erases.
 */
import { OBLIGATION_STATES, type ObligationState } from '@shared/kinds.ts'
import { readFulfilment, type Fulfilment } from '@shared/work.ts'
import { now } from '@shared/now.ts'
import type { PanelRecord } from '@shared/types.ts'
import { PanelError } from '../panel-error.ts'
import { type Actor, type DataPatchOutcome } from '../records.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import type { Incompleteness } from '../validate.ts'
import { getRecord } from './reading.ts'
import { patchRecord } from './patching.ts'

// ============================================================ discharging an obligation
//
// THE FIELD EXISTED AND NOTHING EVER WROTE IT. `data.done` has been declared in shared/kinds.ts
// from the start and read by every alarm rule that has ever shipped, and no interface, no script
// and no seed ever set it. So every obligation in the database looked permanent, and an analysis
// of the product concluded — wrongly — that there was no way to record that a promise had been
// kept. This is the missing action, and it writes the field that already exists rather than
// inventing a second one beside it.

/**
 * The obligation states that discharge it, DERIVED from the shared reader rather than typed again.
 *
 * `readFulfilment` in shared/work.ts is what decides whether an obligation is still owed, and it
 * decides it from these words. Asking it, instead of writing "fulfilled" and "cancelled" here,
 * means a change to that rule cannot leave this endpoint offering a word that no longer discharges
 * anything — the exact two-places-that-must-agree defect this codebase keeps finding.
 */
export const DISCHARGE_STATES: readonly ObligationState[] = OBLIGATION_STATES.filter(
  (state) => readFulfilment({ state }).done,
)

// Loud at import rather than quiet at request time. An empty list would mean this action could
// never write a state that agrees with `done: true`, and shared/kinds.ts refuses a record where
// those two disagree — so every discharge would fail with a validation error about a field the
// caller never sent.
if (DISCHARGE_STATES.length === 0) {
  throw new Error(
    'No obligation state discharges an obligation any more: OBLIGATION_STATES in shared/kinds.ts and ' +
      'readFulfilment in shared/work.ts no longer agree on a word that means "kept".',
  )
}

/** The state a discharge writes when the caller does not say which of the two happened. */
const DEFAULT_DISCHARGE_STATE: ObligationState = 'fulfilled'

/**
 * End a sentence that quotes something somebody else wrote, without doubling their full stop.
 *
 * A discharge note is written by a person and usually ends in a full stop, so pasting it into a
 * sentence and adding one produced "…acknowledged them on the 9th.." in the reply. Small, and this
 * text is read by the person who just did the thing.
 */
function endSentence(text: string): string {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`
}

export interface DischargeInput {
  /**
   * What settled it, in one line. REQUIRED, and that is stricter than the field spec, on purpose.
   *
   * `data.fulfilledNote` is optional on the record, because a record written by hand may not have
   * one. This ACTION requires it for the same reason `Pause.why` is required: a discharge with no
   * note is indistinguishable from a mis-click six weeks later, and this is the only moment the
   * person who knows what settled it is still here to say so.
   */
  note: string
  /** When it was discharged. Defaults to now. Stored as sent; a caller may know a past date. */
  at?: string
  /** `fulfilled` — it was delivered. `cancelled` — it stopped being owed, which is not the same. */
  state?: ObligationState
}

export interface DischargeResult {
  record: PanelRecord
  /** What the record now says about the promise, read back through shared/work.ts. */
  fulfilment: Fulfilment
  /** Which paths moved, in the same report a merge patch gives. Null when nothing was written. */
  dataPatch: DataPatchOutcome | null
  incomplete: Incompleteness[]
  /** True when the promise was already recorded as kept, and this call wrote nothing. */
  alreadyDischarged: boolean
  note: string
}

/**
 * Record that a promise was kept: `data.done`, beside `fulfilledAt` and `fulfilledNote`.
 *
 * WHY IT WRITES `state` TOO. shared/kinds.ts refuses a record whose `done` and `state` disagree —
 * `done: true` next to `state: "open"` is two opposite claims about one obligation — so a
 * discharge that set only `done` would be refused on every obligation that has ever said it was
 * open. The two are written together, and which of the two discharge words applies is the
 * caller's to choose because "delivered" and "stopped being owed" are different pieces of news.
 *
 * WHY IT GOES THROUGH patchRecord. This is an ordinary write and it must leave an ordinary trail:
 * one change row per path, attributed, dated, and visible in today's change log like anything
 * else. Nothing here writes to the database itself; a second write path would be a second place
 * for the history rules to be forgotten.
 */
export function dischargeObligation(id: string, input: DischargeInput, actor: Actor): DischargeResult {
  const record = getRecord(id)
  if (!record) throw noRecordHasThisId(id)
  if (record.kind !== 'obligation') {
    throw new PanelError(
      `Only an obligation is owed to somebody, and ${id} is a ${record.kind} ("${record.title}"). ` +
        `\`owedTo\`, \`done\`, \`fulfilledAt\` and \`fulfilledNote\` are declared on obligations alone — ` +
        `GET /api/kinds/${record.kind} lists what a ${record.kind} takes, and PATCH /api/records/${id} ` +
        `{"dataPatch":{…}} is how it is changed.`,
    )
  }

  const note = input.note.trim()
  if (note === '') {
    throw new PanelError(
      'Say what settled it, in one line: {"note":"Both pages are in the shared drive and the reviewer ' +
        'acknowledged them."}. This is the answer to `what_proves_it_done` rather than a repeat of it — that ' +
        'field says what WOULD settle the obligation, this one says what DID — and a discharge with no note ' +
        'is indistinguishable from a mis-click when somebody reads the record a year later.',
    )
  }

  const state = input.state ?? DEFAULT_DISCHARGE_STATE
  if (!DISCHARGE_STATES.includes(state)) {
    throw new PanelError(
      `"${state}" does not discharge an obligation. Send one of: ${DISCHARGE_STATES.join(', ')} — ` +
        `"fulfilled" if it was delivered, "cancelled" if it stopped being owed, which is not the same thing ` +
        `and is worth saying out loud.`,
    )
  }

  // Already kept. Nothing is written and nothing is overwritten: a second discharge would move
  // `fulfilledAt` to today for a promise kept last week, which is the one fact about it worth
  // keeping. Reported rather than answered with a cheerful 200 that hides that it did nothing.
  const before = readFulfilment(record.data)
  if (before.done) {
    return {
      record,
      fulfilment: before,
      dataPatch: null,
      incomplete: incompletenessOf(record),
      alreadyDischarged: true,
      note:
        `"${record.title}" was already recorded as discharged` +
        (before.at === null ? ', though nothing says when' : ` on ${before.at}`) +
        (before.note === null ? '. ' : `: ${endSentence(before.note)} `) +
        `Nothing was written — a second discharge would move the date to today for a promise kept ` +
        `earlier. To correct what is stored, PATCH /api/records/${id} {"dataPatch":{…}}.`,
    }
  }

  const at = input.at === undefined || input.at.trim() === '' ? now() : input.at.trim()
  const result = patchRecord(
    id,
    { dataPatch: { done: true, state, fulfilledAt: at, fulfilledNote: note } },
    actor,
  )
  const after = readFulfilment(result.record.data)

  return {
    record: result.record,
    fulfilment: after,
    dataPatch: result.dataPatch,
    incomplete: result.incomplete,
    alreadyDischarged: false,
    note:
      `"${result.record.title}" is recorded as ${state} on ${at}: ${endSentence(note)} It is no longer owed, so ` +
      `it drops off the attention list — and it stays in the archive, because an obligation that vanished ` +
      `when it was met would leave no proof it ever was.`,
  }
}

