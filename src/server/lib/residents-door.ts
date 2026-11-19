// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE RESIDENTS' OWN DOORS ARE SETTLING A RESIDENCY PROPOSAL RIGHT NOW.
 *
 * A residency proposal is settled only by Confirm and Not now (src/server/lib/residents.ts), because confirming one
 * makes the agent's space in the same act. The generic ways of settling a fork (promote, choose again, a decision
 * filed with a link to it, POST /api/links) all reach `assertMaySettleFork` in lib/records/fork-settling.ts,
 * which refuses a
 * residency proposal unless this says the residents' doors are the ones writing. It is a flag held for the length of
 * one synchronous call, the shape `officeIsWritingSeal` has for the sealed tip, and it imports nothing, so
 * lib/records/fork-settling.ts can read it without a cycle.
 */

let settling = false

/** Run `write` as the residents' doors, so the settling link it makes is not refused. Synchronous only. */
export function whileTheResidentsDoorsSettle<T>(write: () => T): T {
  const was = settling
  settling = true
  try {
    return write()
  } finally {
    settling = was
  }
}

/** True only inside `whileTheResidentsDoorsSettle`. */
export function theResidentsDoorsAreSettling(): boolean {
  return settling
}
