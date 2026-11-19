// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST READING OF THE SANDBOXES' ROUNDS AFTER A START GIVES THE THREAD BACK BETWEEN SLICES. Wave 13y round 19.
 *
 * On 10 October 2026 the first week-use notice after a restart held the live server for 5,148 ms in one piece: it read
 * 4,082 `out` files, 1.8 GB, many of them to their start. `warmTheRoundsInTheSandboxes` (src/server/lib/logins-week.ts)
 * now does that first reading in slices of at most `A_SLICE_OF_THE_FIRST_READING_MS`, and the tick runs it before the
 * notice, so the notice's own reading opens only what changed.
 *
 * WHAT THIS FILE PROVES, on a root of reading rounds with a 2 MB `out` that has no rate-limit event and so is read to its
 * start (wave 13p round E: a reading round's event is what is read):
 *   - the warm-up runs in many slices, and other work waiting on the event loop runs before it ends;
 *   - after it, `theRoundsInTheSandboxes` answers from what the warm-up kept, and answers what a reading in one piece
 *     answers. That it was kept is seen without replacing node:fs: one `out` is written again with another figure of the
 *     same length and given back its stamp, which only a reading that opens the file again can see.
 * The clock is one that steps 10 ms at each look while the warm-up runs, so how many slices there are does not depend
 * on this machine's speed.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical (the round's report names the logs):
 *   one-slice — the warm-up's slice reads on to the end instead of stopping at the budget: the first test goes red.
 *   not-kept  — the stepped reading never keeps what it found: the second test goes red.
 */

import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'

type WeekLib = typeof import('../src/server/lib/logins-week.ts')

let t: TestDb
let week: WeekLib
let base: string

const READING = ['claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose']

/** A made-up event: seven days `used`, resetting two days after `at`. */
function anEvent(used: number, at: number): string {
  return JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { seven_day: { utilization: used, resetsAt: (at + 2 * 86_400_000) / 1000 } } } })
}

/** One reading round with its start.json and its `out`, last written at `at`. */
function aRun(root: string, run: string, out: string, at: number): void {
  const folder = join(root, 'instance', 'logs', run)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'start.json'), JSON.stringify({ command: READING }))
  writeFileSync(join(folder, 'out'), out)
  utimesSync(join(folder, 'out'), at / 1000, at / 1000)
}

/** Twenty rounds with an event, each at 50% of its seven days, and one 2 MB round without one. */
function aRoot(name: string): string {
  const root = join(base, name)
  for (let i = 0; i < 20; i += 1) {
    const at = 1_700_000_000_000 + i * 1000
    aRun(root, `run-${String(i)}`, `a line\n${anEvent(0.5, at)}\n`, at)
  }
  aRun(root, 'long', 'a line a round writes, and no rate-limit event\n'.repeat(50_000), 1_700_000_100_000)
  return root
}

const byTime = (rounds: { atMs: number }[]): { atMs: number }[] => [...rounds].sort((a, b) => a.atMs - b.atMs)

beforeAll(async () => {
  t = await freshDb()
  week = await import('../src/server/lib/logins-week.ts')
  base = mkdtempSync(join(tmpdir(), 'sandbox-first-reading-'))
}, 120_000)

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
  t.close()
})

it('reads in many slices, and lets other work run before it ends', async () => {
  const root = aRoot('sliced')
  let waited = false
  setImmediate(() => {
    waited = true
  })
  let slices = 0
  let waitedBeforeTheLastSlice = false
  let clock = 0
  const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10))
  try {
    await week.warmTheRoundsInTheSandboxes(root, (work) => {
      slices += 1
      waitedBeforeTheLastSlice = waited
      return work()
    })
  } finally {
    now.mockRestore()
  }
  // 21 FILES AND 36 READS OF 64 KB, two steps to a slice on this clock.
  expect(slices).toBeGreaterThan(20)
  expect(waitedBeforeTheLastSlice, 'nothing waiting on the event loop ran while the first reading went on').toBe(true)
})

it('keeps what it read, so the next reading answers from it and as a reading in one piece', async () => {
  const root = aRoot('kept')
  await week.warmTheRoundsInTheSandboxes(root)
  // THE SAME LENGTH AND THE SAME STAMP, ANOTHER FIGURE: only a reading that opens run-1's out again sees 0.9.
  const out = join(root, 'instance', 'logs', 'run-1', 'out')
  writeFileSync(out, `a line\n${anEvent(0.9, 1_700_000_001_000)}\n`)
  utimesSync(out, 1_700_000_001, 1_700_000_001)
  const after = week.theRoundsInTheSandboxes(root)
  expect(after.some((one) => one.gave.event === 'read' && one.gave.sevenDays?.used === 0.9), 'the reading after the warm-up opened the file again').toBe(false)
  const inOnePiece = week.theRoundsInTheSandboxes(aRoot('in-one-piece'))
  expect(after).toHaveLength(21)
  expect(byTime(after)).toEqual(byTime(inOnePiece))
  expect(after.filter((one) => one.gave.event === 'read')).toHaveLength(20)
})
