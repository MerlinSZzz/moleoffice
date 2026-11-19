// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAIT FOR A FIX ROUND (wave 13u round 90). When the tested step leaves an entry testing with a fix round asked for,
 * the office has asked the line's supervisor, or the build sheriff, to start a round. This run keeps the lane and asks
 * the office to look again every LOOK_EVERY_MS, until the round opens or the office bounces the entry. The office
 * decides both, and the bound it holds the lane to; nothing is tested again while the entry waits. The caller passes
 * the office's sleep and step. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { fail, log } from './log-and-state.mjs'

const LOOK_EVERY_MS = 10_000

/** How long past the office's own bound this run keeps looking before it stops: the look past that bound bounces. */
const PAST_THE_BOUND_MS = 2 * 60_000

export const THE_FIX_ROUND_WAIT_NEEDS_SLEEP_AND_STEP = 'waitForTheFixRound needs sleep and step from its caller, as the-merger.mjs passes office-keeper.mjs\'s, so that fix-round.mjs reaches no office module itself.'

/** Whether the entry waits for a fix round that has not opened. */
export function itWaitsForAFixRound(entry) {
  const wait = entry.machine?.waitsForAFixRound
  return entry.state === 'testing' && wait !== undefined && wait !== null && (wait.opened === undefined || wait.opened === null) && (wait.reserved === undefined || wait.reserved === null)
}

/** Look until the round opens or the entry leaves testing, and give back the entry as the office last answered. */
export async function waitForTheFixRound(entry, { sleep, step } = {}) {
  if (typeof sleep !== 'function' || typeof step !== 'function') throw new Error(THE_FIX_ROUND_WAIT_NEEDS_SLEEP_AND_STEP)
  const dueAt = Date.parse(entry.machine.waitsForAFixRound.dueAt)
  if (!Number.isFinite(dueAt)) fail(`Merge entry ${String(entry.id)} waits for a fix round with no readable bound (${String(entry.machine.waitsForAFixRound.dueAt)}).`)
  log(`the entry waits for a fix round until ${String(entry.machine.waitsForAFixRound.until)}; this run looks again every ${String(LOOK_EVERY_MS / 1000)} seconds`)
  let now = entry
  while (itWaitsForAFixRound(now)) {
    if (Date.now() > dueAt + PAST_THE_BOUND_MS) fail(`The office still holds merge entry ${String(entry.id)} for a fix round ${String(PAST_THE_BOUND_MS / 60_000)} minutes after its bound, ${String(now.machine.waitsForAFixRound.until)}; stopping rather than looking again.`)
    await sleep(LOOK_EVERY_MS)
    now = await step('fix-round-looked', {})
  }
  if (now.state === 'testing') log(`the repair was reserved or its round opened: ${JSON.stringify(now.machine?.waitsForAFixRound?.reserved ?? now.machine?.waitsForAFixRound?.opened ?? null)}`)
  return now
}
