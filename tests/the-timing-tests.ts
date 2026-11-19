// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Timing claims run separately from merge gates: wave 13r round 22, agreements
 * IIn_6cgXcULg and fHiYFULUPYw_. Absolute press times under heavy machine load
 * cannot judge a page reliably. The strict 300 ms claim is retained, never raised.
 *
 * Run: node tools/run-named-tests.mjs --list timing. The secretary runs it weekly and after
 * review-panel changes, on a quiet machine. Dated measurements stay in .logs/.
 * TIMING_GROUP_VARIABLE opts only that named run in. TIMING_RESULTS_VARIABLE names
 * its results file. TIMING_READING_FIXTURE_VARIABLE is for labelled tool-test
 * stand-ins only, with both --root and --vitest; real runs read the machine.
 *
 * Quiet means BOTH one-minute load readings are at most a quarter of the machine's
 * processors. Load and cores have the same whole-machine scope; a sandbox quota
 * is not that count. A busy run exits 3 and is unqualified, regardless of times.
 */
import { cpus, loadavg } from 'node:os'
import { readFileSync } from 'node:fs'

export const TIMING_TESTS = [{ file: 'tests/the-review-panel-answers-each-press-in-time.test.ts', authority: 'Wave 13r round 22; merge-tool agreement IIn_6cgXcULg; tools agreement fHiYFULUPYw_' }, { file: 'tests/the-plugin-read-views-answer-in-their-budget.test.ts', authority: 'Wave 13x round 14, plugin pipeline udGnc-Bsr15R block 1DP8abzhUpNb; held to the same agreements IIn_6cgXcULg and fHiYFULUPYw_' }, { file: 'tests/agents-at-work-answers-within-a-second-at-the-live-size.test.ts', authority: 'Wave 13y round 133, requirement 71: the three doors Agents at work waits on, at the size of the live office on 4 November 2026; held to the same agreements as the two entries before it' }, { file: 'tests/an-agents-read-of-every-message-answers-in-time-at-the-live-size.test.ts', authority: "Wave 13y round 143, item 85: an agent's two reads of every message, at the size of the live message centre on 7 November 2026; held to the same agreements as the three entries before it" }, { file: 'tests/the-check-read-answers-within-its-budget-at-the-live-size.test.ts', authority: 'Wave 13n round DM, the requirement of 7 November 2026: GET /api/checks/:run at the size of the live office on 4 November 2026; held to the same agreements as the entries before it' }, { file: 'tests/the-project-board-answers-within-a-second-at-the-live-size.test.ts', authority: 'Wave 13u round 216, package BV point BV-2: GET /api/projects/:project/board at the size of the live office on 13 November 2026; held to the same agreements as the entries before it' }, { file: 'tests/the-lanes-drawing-is-first-drawn-within-3-seconds.test.ts', authority: "Wave 13u round 231, package lKv0HtJ4whvk point PV-R2 (Z6pIQVoZV5Bd): the lanes drawing's first drawing of the reel and of a made-up 54-box pipeline, in a production build; not met at the round's tip, as the secretary agreed in xAe4ak9XWDkO; held to the same agreements as the entries before it" }] as const
export const TIMING_GROUP_VARIABLE = 'MOLE_OFFICE_TIMING_GROUP'
export const TIMING_GROUP_VALUE = 'asked-by-name'
export const TIMING_RESULTS_VARIABLE = 'PANEL_TIMES_OUT'
export const TIMING_READING_FIXTURE_VARIABLE = 'TIMING_MACHINE_READING_FROM_A_TEST'
export const QUIET_CORE_SHARE = 0.25
export const TIMING_COMMAND = 'node tools/run-named-tests.mjs --list timing'

export interface TimingMachineReading { load1: number; cores: number; memAvailableKiB: number }

/** A test may supply a labelled stand-in; the real command always reads this machine. */
export function timingMachineReading(fixture?: string): TimingMachineReading {
  if (fixture !== undefined) {
    const value = JSON.parse(readFileSync(fixture, 'utf8')) as TimingMachineReading
    if (!Number.isFinite(value.load1) || value.load1 < 0 || !Number.isInteger(value.cores) || value.cores < 1 || !Number.isFinite(value.memAvailableKiB) || value.memAvailableKiB < 0) throw new Error(`Invalid timing machine reading in ${fixture}.`)
    return value
  }
  const memory = /^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'))
  if (memory === null) throw new Error('The timing group cannot read MemAvailable from /proc/meminfo.')
  return { load1: loadavg()[0]!, cores: cpus().length, memAvailableKiB: Number(memory[1]) }
}

export function isQuietForTiming(reading: TimingMachineReading): boolean {
  return reading.load1 <= reading.cores * QUIET_CORE_SHARE
}
