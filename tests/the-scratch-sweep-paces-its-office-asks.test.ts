// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCRATCH SWEEP IS GENTLE ON THE OFFICE, HOWEVER LONG THE OFFICE TAKES TO ANSWER (wave 13s round 76).
 *
 * tools/sandbox-start.mjs runs the sweep in tools/sweep-run-scratch.mjs at every start. On 22 October 2026 one start
 * walked 45 old run folders, and asked two slow doors for each one back to back: the named-inside check took 4 to 5 s and
 * the search 5 to 6 s, and both hold the office's event loop while they answer. The live office answered nothing for
 * about 11 minutes. So the sweep now keeps a pause between its asks, asks the two slow doors about a few folders per
 * start, and takes the folders it checked longest ago first.
 *
 * WHAT IS PROVED, with a clock and a sleep this file gives the sweep, so nothing here waits:
 *   1. No ask is made sooner than 2 s after the answer before it.
 *   2. The two slow doors are asked about at most 5 folders per start. Each other folder that reached them gets one line
 *      in its finish.log saying it was not checked this time, and goes at a later start.
 *   3. Folders are taken in the order of their last check, read from the lines the sweep writes in finish.log, and never
 *      checked first. A line saying a folder was not checked this time is not a check.
 *   4. Folders that records name are kept at every start, and still every folder gets its turn: over 7 starts, 7 such
 *      folders are each asked about 5 times.
 *   5. The pause is 2 s unless a test sets SWEEP_PAUSE_MS_FOR_A_TEST in the process's environment, and a pause it sets
 *      is never under 0.25 s.
 *
 * The folders here are a stopped run's: a finished or crashed run's folder goes without the two slow doors, and any other
 * ended run's is still asked about at them.
 *
 * Every record and process answer here is synthetic; no container or office is touched.
 *
 * MUTATIONS, each proved red in the run that adds this file: the pause taken out (1); no cap (2, 4); the folders taken
 * by name alone (3, 4); the last check read from every line about the folder, not checked ones included (3, 4).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sweepRunScratch } from '../tools/sweep-run-scratch.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

let root: string, temp: string, instanceDir: string, time: number
/** Every ask the sweep made, with the moment it was made and the moment it was answered. */
let asks: { path: string; at: number; answered: number }[]
/** The folders a live record names, by path. */
let named: Set<string>
const start = new Date(2026, 9, 14, 12).getTime()

beforeEach(() => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs/sweep-pace-test-')); temp = join(root, 'tmp'); instanceDir = join(root, 'instance')
  mkdirSync(temp); mkdirSync(instanceDir)
  time = start; asks = []; named = new Set()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** An old stopped run's folder, with something in it. `run` is a synthetic 12-character id. */
function aFolder(run: string): string {
  const folder = join(temp, `${run}-ABC123`)
  mkdirSync(folder); writeFileSync(join(folder, 'evidence.txt'), 'Synthetic scratch')
  return folder
}
const runOf = (folder: string): string => folder.slice(temp.length + 1, temp.length + 13)
const logOf = (run: string): string => join(instanceDir, 'logs', run, 'finish.log')

/** A line the sweep wrote about `folder` at `when`, in the words it writes. */
function aLineWritten(folder: string, when: number, words: string): void {
  const run = runOf(folder)
  mkdirSync(join(instanceDir, 'logs', run), { recursive: true })
  writeFileSync(logOf(run), `${existsSync(logOf(run)) ? readFileSync(logOf(run), 'utf8') : ''}${localStampOf(new Date(when))} run ${run}: scratch sweep folder ${folder} ${words}\n`)
}

/** The door's answer to `path`, and how long the door takes: a record read 50 ms, the two slow doors 5 s. */
function theAnswerTo(path: string): { cost: number; answer: { status: number; body: unknown } } {
  if (path.startsWith('/api/report-files/named-inside?')) {
    const folder = new URL(`http://synthetic${path}`).searchParams.get('folder') ?? ''
    const hiddenCount = named.has(folder) ? 1 : 0
    return { cost: 5_000, answer: { status: 200, body: { folder, records: [], hiddenCount,
      scope: 'Readable live records in this project name their stored paths. hiddenCount counts other live records in every project that name this folder or a path inside it.',
      says: `0 readable records list files inside ${folder}; ${String(hiddenCount)} other live records name the folder or a path inside it.` } } }
  }
  if (path.startsWith('/api/search?')) return { cost: 5_000, answer: { status: 200, body: { counts: { matched: 0 }, elsewhere: [] } } }
  const run = decodeURIComponent(path.slice('/api/records/'.length))
  return { cost: 50, answer: { status: 200, body: { record: { id: run, kind: 'session', updatedAt: localStampOf(new Date(start - 49 * 3_600_000)), data: { state: 'stopped' } } } } }
}

async function sweep(): Promise<void> {
  await sweepRunScratch({ root: temp, instanceDir, workspace: 'synthetic', now: time,
    processes: () => ({ using: [], unreadable: [] }), free: () => ({ why: null, unreadable: [] }),
    clock: () => time, sleep: async (ms: number) => { time += ms },
    ask: async (path: string) => {
      const at = time, { cost, answer } = theAnswerTo(path)
      time += cost
      asks.push({ path, at, answered: time })
      return answer
    } })
}
/** The folders asked about at the named-inside door, in the order asked. */
const askedInside = (): string[] => asks.filter(one => one.path.startsWith('/api/report-files/named-inside?'))
  .map(one => new URL(`http://synthetic${one.path}`).searchParams.get('folder') ?? '')
const notChecked = (folder: string): string[] => (existsSync(logOf(runOf(folder))) ? readFileSync(logOf(runOf(folder)), 'utf8').split('\n') : [])
  .filter(line => line.includes(`scratch sweep folder ${folder} is not checked this time`))

describe('the scratch sweep is gentle on the office', () => {
  it('makes no ask sooner than 2 s after the answer before it', async () => {
    for (const run of ['pace_run_001', 'pace_run_002', 'pace_run_003']) aFolder(run)
    await sweep()
    expect(asks.length, 'the sweep asked nothing, so nothing is measured').toBeGreaterThanOrEqual(9)
    for (let i = 1; i < asks.length; i++) {
      expect(asks[i]!.at - asks[i - 1]!.answered, `${asks[i]!.path} was asked too soon after ${asks[i - 1]!.path}`).toBeGreaterThanOrEqual(2_000)
    }
  })

  it('pauses 2 s unset, and as a test\'s SWEEP_PAUSE_MS_FOR_A_TEST says but never under 0.25 s', async () => {
    const pauses = async (variable: string | undefined): Promise<number[]> => {
      if (variable === undefined) delete process.env['SWEEP_PAUSE_MS_FOR_A_TEST']
      else process.env['SWEEP_PAUSE_MS_FOR_A_TEST'] = variable
      try {
        rmSync(temp, { recursive: true, force: true }); mkdirSync(temp); asks = []
        for (const run of ['wait_run_001', 'wait_run_002']) aFolder(run)
        await sweep()
        return [...new Set(asks.slice(1).map((one, i) => one.at - asks[i]!.answered))]
      } finally { delete process.env['SWEEP_PAUSE_MS_FOR_A_TEST'] }
    }
    expect(await pauses(undefined)).toEqual([2_000])
    expect(await pauses('500')).toEqual([500])
    expect(await pauses('100')).toEqual([250])
    expect(await pauses('none')).toEqual([2_000])
  })

  it('asks the two slow doors about 5 folders at most, and says of each other one that it was not checked this time', async () => {
    const folders = ['cap_run_0001', 'cap_run_0002', 'cap_run_0003', 'cap_run_0004', 'cap_run_0005', 'cap_run_0006', 'cap_run_0007'].map(aFolder)
    await sweep()
    expect(askedInside()).toHaveLength(5)
    expect(asks.filter(one => one.path.startsWith('/api/search?'))).toHaveLength(5)
    const waiting = folders.filter(folder => existsSync(folder))
    expect(waiting).toHaveLength(2)
    for (const folder of waiting) expect(notChecked(folder)).toHaveLength(1)
    for (const folder of folders.filter(one => !waiting.includes(one))) expect(notChecked(folder)).toHaveLength(0)
    asks = []
    await sweep()
    expect(askedInside().sort()).toEqual([...waiting].sort())
    for (const folder of folders) expect(existsSync(folder)).toBe(false)
  })

  it('takes the folders never checked first, then the one checked longest ago', async () => {
    const day = 24 * 3_600_000
    const [checkedThreeDaysAgo, neverChecked, checkedADayAgo, checkedTwoDaysAgo] =
      ['order_run_01', 'order_run_02', 'order_run_03', 'order_run_04'].map(aFolder) as [string, string, string, string]
    aLineWritten(checkedThreeDaysAgo, start - 3 * day, 'is kept: 1 record names files inside it.')
    aLineWritten(checkedADayAgo, start - 4 * day, 'is kept: the folder changed.')
    aLineWritten(checkedADayAgo, start - day, 'is kept: the complete live-record reference check did not answer.')
    aLineWritten(checkedTwoDaysAgo, start - 2 * day, 'is kept: readable prose names it, or its reference check was incomplete.')
    // NOT CHECKED IS NOT A CHECK: a folder that only waited is still never checked.
    aLineWritten(neverChecked, start - 60_000, 'is not checked this time: synthetic.')
    await sweep()
    const order = asks.filter(one => one.path.startsWith('/api/records/')).map(one => one.path.slice('/api/records/'.length))
    expect(order).toEqual([neverChecked, checkedThreeDaysAgo, checkedTwoDaysAgo, checkedADayAgo].map(runOf))
    expect(askedInside()).toEqual([neverChecked, checkedThreeDaysAgo, checkedTwoDaysAgo, checkedADayAgo])
  })

  it('gives every folder its turn when records name them all and they are kept at every start', async () => {
    const folders = ['kept_run_001', 'kept_run_002', 'kept_run_003', 'kept_run_004', 'kept_run_005', 'kept_run_006', 'kept_run_007'].map(aFolder)
    for (const folder of folders) named.add(folder)
    const turns = new Map(folders.map(folder => [folder, 0]))
    for (let starts = 0; starts < 7; starts++) {
      asks = []
      await sweep()
      for (const folder of askedInside()) turns.set(folder, (turns.get(folder) ?? 0) + 1)
      time += 60_000
    }
    for (const folder of folders) expect(existsSync(folder)).toBe(true)
    expect(Object.fromEntries(turns)).toEqual(Object.fromEntries(folders.map(folder => [folder, 5])))
  })
})
