// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED LINK-GATE READERS: `readLinkGate`, `sameGate` and `describeStoredGate`. They were moved
 * out of src/server/lib/records.ts, with no change of behaviour; `sameGate` and `describeStoredGate`
 * are exported because `createLink` in records/links.ts calls them.
 *
 * NO CALLER CHANGED. records.ts hands `readLinkGate` on with `export { readLinkGate }`, and every
 * caller still imports it from records.ts.
 *
 * THIS FILE IMPORTS NOTHING FROM records.ts, so there is no cycle and no caller changed.
 */
import {
  GATE_KINDS,
  GATE_STAGE_SORTS,
  gateIsWellFormed,
  gateLabel,
  type Gate,
  type GateKind,
  type GateStageSort,
} from '@shared/work.ts'
import type { LinkGate } from '@shared/types.ts'

/** What the two stored columns mean. The one reader; both link directions go through it. */
export function readLinkGate(row: {
  gate: string | null
  gateUpTo: string | null
  gateUpToSort: string | null
}): LinkGate {
  const word = row.gate === null ? '' : row.gate.trim()
  if (word === '') return { gate: null, gateLabel: null, gateProblem: null, gateStage: null }

  if (!(GATE_KINDS as readonly string[]).includes(word)) {
    return {
      gate: null,
      gateLabel: null,
      gateProblem:
        `this link stores the gate "${word}", which is not one of ${GATE_KINDS.join(' or ')}, so Mole Office ` +
        `cannot say how much it blocks. Nothing wrote that through the API; the row has been edited by hand.`,
      gateStage: null,
    }
  }

  const upTo = row.gateUpTo === null || row.gateUpTo.trim() === '' ? undefined : row.gateUpTo.trim()
  const gate: Gate = upTo === undefined ? { kind: word as GateKind } : { kind: word as GateKind, upTo }
  return {
    gate,
    // WHICH SORT THE STAGE IS, as the write stored it. A stored word outside GATE_STAGE_SORTS is read
    // as not recorded, the same as NULL, because neither says which of the three it is.
    gateStage:
      upTo === undefined
        ? null
        : (GATE_STAGE_SORTS as readonly (string | null)[]).includes(row.gateUpToSort)
          ? (row.gateUpToSort as GateStageSort)
          : 'not_recorded',
    gateLabel: gateLabel(gate),
    // gateIsWellFormed is the check, and it lives in shared/work.ts so that the write path in
    // records/link-gates.ts (checkGate) and this read path cannot disagree about what a well-formed gate is.
    gateProblem: gateIsWellFormed(gate)
      ? null
      : `this link stores a partial gate with no stage, so it does not say how far the blocked record may ` +
        `get. A partial gate that does not say how far is a hard gate that is lying.`,
  }
}

/** Are two gates the same gate? Used to tell a repeated create from a contradicting one. */
export function sameGate(a: Gate | null, b: Gate | null): boolean {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && (a.upTo ?? null) === (b.upTo ?? null)
}

/** How a stored gate is described in a refusal, in the same words a reader would print. */
export function describeStoredGate(stored: LinkGate): string {
  if (stored.gate === null) {
    return stored.gateProblem === null
      ? 'carries no gate, so nobody has said how much it blocks'
      : `carries an unreadable gate — ${stored.gateProblem}`
  }
  return `carries the gate "${stored.gate.kind}" (${stored.gateLabel})`
}
