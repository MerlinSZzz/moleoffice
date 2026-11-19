// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN CHECK TOOL FOR THE WORKER'S SEAT-WAIT CLOCK TEST.
 *
 * It runs no model and judges no work. It prints the two seat lines from src/config/a-checks-seat-wait.mjs and then
 * waits or ends as the clock it was given selects. The four shapes are the four cases of
 * tests/a-checks-clock-leaves-out-its-seat-wait.test.ts:
 *
 *   a clock of 0.04 minutes or more: ask, wait 9 s, settle, then end inside the clock.
 *   a clock of 0.02 to 0.04: ask, wait 9 s, settle, then run 9 s past the clock.
 *   a clock of 0.01 to 0.02: ask and hold the wait open for 9 s, then settle and end.
 *   a smaller clock: print no seat line, and wait to be stopped.
 *
 * The waits are at least three times each clock, so a busy machine does not make a case ambiguous.
 */
import { theCheckBeganAsking, theCheckFinishedAsking } from '../src/config/a-checks-seat-wait.mjs'

const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const limit = Number(value('--limit'))
const now = () => new Date().toISOString()
const say = (line) => process.stdout.write(`${line}\n`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (limit >= 0.04) {
  say(theCheckBeganAsking(now()))
  await sleep(9_000)
  say(theCheckFinishedAsking(now()))
  await sleep(1_000)
  process.exitCode = 3
} else if (limit >= 0.02) {
  say(theCheckBeganAsking(now()))
  await sleep(9_000)
  say(theCheckFinishedAsking(now()))
  await sleep(9_000)
  process.exitCode = 3
} else if (limit >= 0.01) {
  say(theCheckBeganAsking(now()))
  await sleep(9_000)
  say(theCheckFinishedAsking(now()))
  process.exitCode = 3
} else {
  setInterval(() => {}, 60_000)
}
