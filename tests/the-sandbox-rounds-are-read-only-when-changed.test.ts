// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' ROUNDS ARE READ AGAIN ONLY WHERE THEY CHANGED. Wave 13p round 29b, piece 8, for check Odu0fNRyn2da:
 * theRoundsInTheSandboxes (src/server/lib/logins-week.ts) read every `out` on every secretary inbox read, every profile
 * load and every 60-second tick, 2,282 files, 230 ms cold and 36 ms warm.
 *
 * WHAT THIS FILE PROVES, on a seeded set of 2,300 reading rounds (wave 13p round E: only a reading round's `out` is
 * opened, and what is read from it is its rate-limit event):
 *   - a second read opens no file and answers the same rounds, and takes less than half the time of the first;
 *   - a changed `out`, a new run folder and a removed one are each read again or dropped, and nothing else is opened.
 *
 * Files opened are counted by a pass-through mock of node:fs that counts readFileSync and openSync calls under the
 * seeded folder: since wave 13y round 17 an `out` is opened and read from its end, not read whole.
 *
 * MUTATION PROOF, after a control run: the kept read made never to match, so every read opens every file. The round's
 * report names the logs.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'

const opened = vi.hoisted(() => ({ under: '', count: 0 }))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const readFileSync = ((...args: Parameters<typeof real.readFileSync>) => {
    if (opened.under !== '' && typeof args[0] === 'string' && args[0].startsWith(opened.under)) opened.count += 1
    return real.readFileSync(...args)
  }) as typeof real.readFileSync
  const openSync = ((...args: Parameters<typeof real.openSync>) => {
    if (opened.under !== '' && typeof args[0] === 'string' && args[0].startsWith(opened.under)) opened.count += 1
    return real.openSync(...args)
  }) as typeof real.openSync
  return { ...real, default: { ...real, readFileSync, openSync }, readFileSync, openSync }
})

type WeekLib = typeof import('../src/server/lib/logins-week.ts')

let t: TestDb
let week: WeekLib
let base: string

const RUNS = 2_300
const INSTANCES = 3
/** About the size of a real reading round's `out`: some words, then the rate-limit event, then the result line. */
const WORDS = 'a line a round writes before its event\n'.repeat(90)
const READING = ['claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose']
const RESULT = JSON.stringify({ type: 'result', subtype: 'success', result: 'A made-up answer.' })

/** A made-up event: seven days `used`, resetting two days after `at`. */
function anEvent(used: number, at: number): string {
  return JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { seven_day: { utilization: used, resetsAt: (at + 2 * 86_400_000) / 1000 } } } })
}

/** One reading round with its start.json and its `out`, last written at `at`. */
function aRun(root: string, instance: string, run: string, used: number, at: number): void {
  const folder = join(root, instance, 'logs', run)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'start.json'), JSON.stringify({ command: READING }))
  writeFileSync(join(folder, 'out'), `${WORDS}${anEvent(used, at)}\n${RESULT}\n`)
  utimesSync(join(folder, 'out'), at / 1000, at / 1000)
}

/** The seven days a round's event gave, or null. */
function usedIn(round: ReturnType<WeekLib['theRoundsInTheSandboxes']>[number]): number | null {
  return round.gave.event === 'read' ? (round.gave.sevenDays?.used ?? null) : null
}

/** A root holding `RUNS` run folders over `INSTANCES` instances. */
function aSeededRoot(name: string): string {
  const root = join(base, name)
  for (let i = 0; i < RUNS; i += 1) aRun(root, `instance-${String(i % INSTANCES)}`, `run-${String(i)}`, (i % 100) / 100, 1_700_000_000_000 + i * 1000)
  return root
}

/** The milliseconds one read of `root` took, and the files it opened. */
function timed(root: string): { ms: number; opened: number; rounds: ReturnType<WeekLib['theRoundsInTheSandboxes']> } {
  opened.under = root
  opened.count = 0
  const started = performance.now()
  const rounds = week.theRoundsInTheSandboxes(root)
  return { ms: performance.now() - started, opened: opened.count, rounds }
}

const byTime = (rounds: { atMs: number }[]): { atMs: number }[] => [...rounds].sort((a, b) => a.atMs - b.atMs)

beforeAll(async () => {
  t = await freshDb()
  week = await import('../src/server/lib/logins-week.ts')
  base = mkdtempSync(join(tmpdir(), 'sandbox-rounds-'))
}, 120_000)

afterAll(() => {
  rmSync(base, { recursive: true, force: true })
  t.close()
})

describe('the sandboxes’ rounds are read again only where they changed', () => {
  it('opens no file on a second read of 2,300 rounds, answers the same, and takes less than half the time', () => {
    // A FIRST ROOT warms the code itself, so the first read timed below is the files' cost and not the compiler's.
    week.theRoundsInTheSandboxes(aSeededRoot('warm-up'))
    const root = aSeededRoot('timed')
    const first = timed(root)
    const again = [timed(root), timed(root), timed(root)]
    // THE TIME FIRST, so a read that keeps nothing fails here on its time and not only on the files it opened.
    const fastest = Math.min(...again.map((one) => one.ms))
    console.info(`[sandbox rounds] ${String(RUNS)} rounds: first read ${first.ms.toFixed(1)} ms, fastest of three later reads ${fastest.toFixed(1)} ms`)
    expect(fastest * 2).toBeLessThan(first.ms)
    expect(first.rounds).toHaveLength(RUNS)
    expect(first.opened).toBe(RUNS * 2)
    for (const one of again) {
      expect(one.opened).toBe(0)
      expect(byTime(one.rounds)).toEqual(byTime(first.rounds))
    }
  })

  it('reads a changed out, a new run and a removed run again, and opens nothing else', () => {
    const root = join(base, 'changing')
    aRun(root, 'one', 'r1', 0.1, 1_700_000_000_000)
    aRun(root, 'one', 'r2', 0.2, 1_700_000_001_000)
    aRun(root, 'two', 'r3', 0.3, 1_700_000_002_000)
    expect(timed(root).opened).toBe(6)

    // r2 WRITES A LATER FIGURE: its out and its start.json are opened again, and nothing else.
    aRun(root, 'one', 'r2', 0.25, 1_700_000_003_000)
    const changed = timed(root)
    expect(changed.opened).toBe(2)
    expect(usedIn(changed.rounds.find((one) => one.atMs === 1_700_000_003_000)!)).toBe(0.25)
    expect(changed.rounds).toHaveLength(3)

    // A NEW RUN in the second instance is found and read; the others are not opened.
    aRun(root, 'two', 'r4', 0.4, 1_700_000_004_000)
    const added = timed(root)
    expect(added.opened).toBe(2)
    expect(added.rounds).toHaveLength(4)

    // A REMOVED RUN drops out of the answer.
    rmSync(join(root, 'one', 'logs', 'r1'), { recursive: true, force: true })
    const removed = timed(root)
    expect(removed.opened).toBe(0)
    expect(removed.rounds.map((one) => `${one.folder} ${String(usedIn(one))}`).sort()).toEqual(['r2 0.25', 'r3 0.3', 'r4 0.4'])
  })
})
