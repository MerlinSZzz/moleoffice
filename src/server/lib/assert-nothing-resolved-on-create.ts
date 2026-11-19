// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `assertNothingResolvedOnCreate` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * `isObject` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * `sentenceForMachineField` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { MACHINE_WRITTEN_FIELDS, WRITTEN_BY, type MachineWrittenField } from '@shared/workdomain.ts'

/**
 * NOTHING IS RESOLVED BY THE CREATE CALL, AND A CREATE THAT ARRIVES RESOLVED IS REFUSED.
 *
 * The create path cannot resolve — it has no resolver to call. What it CAN do is accept a caller's
 * own `resolved`, `responses`, `accepted` or `acknowledged` in the body, and that is the same hole
 * wearing a different door: a domain filed with its own resolution has skipped the criticism the
 * whole mechanism exists to produce, and its revision 1 would read as a hypothesis while holding a
 * conclusion.
 */
export function assertNothingResolvedOnCreate(data: unknown): void {
  if (!isObject(data)) return
  for (const field of MACHINE_WRITTEN_FIELDS) {
    if (data[field] === undefined) continue
    throw new PanelError(
      `A work domain is filed as a HYPOTHESIS and "${field}" is not part of one, so nothing was written. ` +
        `${sentenceForMachineField(field)} File what you believe you are about to do — the objective and the ` +
        `paths, exactly as you would write them — and ask for the resolution afterwards with ` +
        `POST /api/work-domains/<id>/resolve. The ordering is what makes the hypothesis evidence: an agent that ` +
        `reads the machine's answer first is agreeing with it, not being criticised by it.`,
      400,
    )
  }
}
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function sentenceForMachineField(field: MachineWrittenField): string {
  return `It is written by ${WRITTEN_BY[field]} and by nothing else.`
}
