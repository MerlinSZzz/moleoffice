// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLOUD BOX SAYS ITS LOAD WHILE THE SUITE RAN. Hooks of the queue's suite on the cloud box ran out of time, and no
 * kept log said how busy the box was while they waited. Now the door, tools/cloud-suite.mjs, reads the box's 1-minute
 * load and its available memory every 15 seconds while npm test runs. It answers how many times it read them, the
 * median and the worst of each, and how many times it could not read them (tools/the-box-under-the-suite.mjs works
 * these out). The merge tool writes them on the suite's "ran on the cloud box" line, or says that the door did not
 * give them.
 *
 * EVERY SAMPLE HERE IS MADE UP. tests/stand-in-cloud-suite-door.mjs stands in for the door, and nothing reaches the
 * box. The numbers on the line are read from the stand-in's answer, so none is copied here. The real door's sampling
 * is run in tests/the-cloud-suite-door-runs-the-commit.test.ts.
 *
 * THE BOX'S CPUS (criterion 24). The door now answers the box's CPUs, the workers it used and the count its runner file
 * names. The line gives them, and the load for each CPU, or says the door did not give the CPUs. Cases 6 to 8. A door
 * that gives the CPUs and read no load gets its line too, with no load for each CPU made up. Case 9.
 *
 * MUTATION PROOF (logs named in the report of the run that added each case), each alone after a green control:
 *   - the median is the mean of every sample: cases 1 and 2 go red;
 *   - the merge tool's line leaves out the box's load: case 3 goes red;
 *   - the line leaves out the load for each CPU: cases 6 and 7 go red;
 *   - the line leaves out the CPUs: cases 6, 7 and 8 go red;
 *   - the line works out the load for each CPU when the door read no load: case 9 goes red, with no line written.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { aSuiteOnTheBoxOrHere } from '../tools/merge-tool/cloud-suite-door.mjs'

const REPO = join(import.meta.dirname, '..')
const STAND_IN = join(REPO, 'tests', 'stand-in-cloud-suite-door.mjs')
/** A path that is not the stand-in, standing for the real door. It is never called. */
const NOT_THE_STAND_IN = join(REPO, 'tools', 'cloud-suite.mjs')
const COMMIT = 'd'.repeat(40)

type Measure = { median: number; worst: number }
type BoxLoad = { everySec: number; samples: number; notRead: number; load: Measure | null; availableMemoryMb: Measure | null }
type Summary = (text: string, everySec: number) => BoxLoad
type Said = { boxLoad?: BoxLoad; workers?: number; cpus?: number; runnerWorkers?: number }

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cloud-box-load-'))
  mkdirSync(join(root, 'clone'))
  mkdirSync(join(root, 'reports'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The module that works out the box's load, read by its path so this file type-checks before the module is there. */
async function theSummary(): Promise<{ summary: Summary; every: number }> {
  const module = (await import(join(REPO, 'tools', 'the-box-under-the-suite.mjs'))) as object
  const summary = Reflect.get(module, 'theBoxUnderTheSuite') as Summary | undefined
  const every = Reflect.get(module, 'BOX_SAMPLED_EVERY_SEC') as number | undefined
  expect(summary, 'the module exports theBoxUnderTheSuite').toBeTypeOf('function')
  expect(every, 'the module exports how often the box is read').toBeTypeOf('number')
  return { summary: summary!, every: every! }
}

/** The lines the door's sampler writes: the 1-minute load, a space, and the available memory in kB. */
const linesOf = (samples: [number, number][]) => samples.map(([load, kb]) => `${String(load)} ${String(kb)}\n`).join('')
const middleOf = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[half]! : (sorted[half - 1]! + sorted[half]!) / 2
}

describe('the box under the suite, worked out from the sampler\'s lines', () => {
  it('1: an odd count gives the middle sample as the median, the highest load and the least memory as the worst', async () => {
    const { summary, every } = await theSummary()
    expect(every, 'the box is read every 15 seconds').toBe(15)
    const samples: [number, number][] = [[0.5, 8_192_000], [3.25, 4_096_000], [9.75, 2_048_000], [2, 6_144_000], [4.5, 1_024_000]]
    const loads = samples.map(([load]) => load)
    const megabytes = samples.map(([, kb]) => kb / 1024)
    expect(summary(linesOf(samples), every)).toEqual({
      everySec: every,
      samples: 5,
      notRead: 0,
      load: { median: middleOf(loads), worst: Math.max(...loads) },
      availableMemoryMb: { median: middleOf(megabytes), worst: Math.min(...megabytes) },
    })
  })

  it('2: an even count gives the mean of the two middle samples, and a line that is not a reading is counted as not read', async () => {
    const { summary, every } = await theSummary()
    const samples: [number, number][] = [[1, 102_400], [2, 307_200], [4, 204_800], [10, 51_200]]
    const loads = samples.map(([load]) => load)
    const megabytes = samples.map(([, kb]) => kb / 1024)
    const said = summary(`${linesOf(samples.slice(0, 2))} \n${linesOf(samples.slice(2))}`, every)
    expect(said).toEqual({
      everySec: every,
      samples: 4,
      notRead: 1,
      load: { median: middleOf(loads), worst: Math.max(...loads) },
      availableMemoryMb: { median: middleOf(megabytes), worst: Math.min(...megabytes) },
    })
    expect(summary('', every), 'no line is no sample, and no median is made up').toEqual({ everySec: every, samples: 0, notRead: 0, load: null, availableMemoryMb: null })
  })
})

/** The merge tool's call of the stand-in door, and the lines it wrote. */
async function theLinesOf(does: string, more: Record<string, string> = {}): Promise<{ lines: string[]; said: Said }> {
  const box = {
    clone: join(root, 'clone'),
    commit: COMMIT,
    report: join(root, 'reports', 'suite.json'),
    reads: join(root, 'reports', 'suite-reads'),
    suiteLog: join(root, 'reports', 'suite.log'),
    timeoutSec: 10800,
  }
  const env = { PATH: String(process.env['PATH']), HOME: join(root, 'home'), STAND_IN_DOOR_DOES: does, ...more }
  const lines: string[] = []
  const ran = await aSuiteOnTheBoxOrHere({
    label: 'suite',
    box,
    here: () => { throw new Error('the suite ran here, though the box ran it') },
    hereIs: 'in sandbox made-up-sandbox',
    door: STAND_IN,
    theRealDoor: NOT_THE_STAND_IN,
    run: (label: string, command: string, args: string[], { cwd }: { cwd: string }) => {
      const outFile = join(root, `${label}.log`)
      const done = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 10_000 })
      writeFileSync(outFile, `${done.stdout}${done.stderr}`)
      return Promise.resolve({ code: done.status, signal: done.signal, timedOut: false, stoppedReason: null, outFile })
    },
    log: (line: string) => lines.push(line),
    keepTheLog: (file: string) => {
      const kept = join(root, 'kept-suite.log')
      copyFileSync(file, kept)
      return kept
    },
    env: {},
  })
  expect(ran).toMatchObject({ code: 0, where: 'box', box: { ran: true } })
  const said = JSON.parse(readFileSync(join(root, 'suite-door.log'), 'utf8').trim().split('\n').at(-1) ?? '') as Said
  return { lines, said }
}

/**
 * THE WORDS FOR A BOX WHOSE CPUS THE DOOR DID NOT SAY are the door's, read from it so none is copied here, and a change
 * of them changes no line of this file. Read by name, so this file type-checks before the door exports them.
 */
async function theCpusNotSaid(): Promise<string> {
  const said = Reflect.get(await import('../tools/merge-tool/cloud-suite-door.mjs'), 'CPUS_NOT_SAID') as unknown
  expect(said, 'the door exports the words for a box whose CPUs it was not told').toBeTypeOf('string')
  return said as string
}

describe('the suite\'s "ran on the cloud box" line', () => {
  it('3: gives how many times the door read the box and how far apart, and the median and the worst of its load and its memory', async () => {
    const { lines, said } = await theLinesOf('green')
    const box = said.boxLoad!
    expect(box.samples, 'the stand-in read the box').toBeGreaterThan(0)
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect(line.startsWith('suite ran on the cloud box: '), 'the line keeps the start tools/queue-history.mjs reads').toBe(true)
    expect(line).toContain(`while the suite ran the door read the box ${String(box.samples)} time(s), ${String(box.everySec)} s apart: ` +
      `its 1-minute load was ${String(box.load!.median)} at the median and ${String(box.load!.worst)} at the worst, ` +
      `its available memory ${String(box.availableMemoryMb!.median)} MB at the median and ${String(box.availableMemoryMb!.worst)} MB at the worst`)
    expect(line, 'a box read every time says no reading was missed').not.toContain('could not read')
  })

  it('4: says the door read the box at no time, and how many times it could not read it, with no median made up', async () => {
    const { lines, said } = await theLinesOf('load-partly-read')
    const box = said.boxLoad!
    expect(box.samples).toBe(0)
    expect(lines[0]).toContain(`while the suite ran the door read the box 0 time(s), ${String(box.everySec)} s apart; ${String(box.notRead)} other time(s) it could not read it`)
    expect(lines[0]).not.toContain('at the median')
  })

  it('5: says the door did not give the box\'s load when its answer has none', async () => {
    const { lines, said } = await theLinesOf('no-load')
    expect(said.boxLoad).toBeUndefined()
    expect(lines[0]).toContain('the door did not say the box\'s load and available memory')
  })
})

describe('the line says the box\'s CPUs and the load for each CPU (criterion 24)', () => {
  /** The load for each CPU, to two decimals, as the line gives it. */
  const eachCpu = (load: number, cpus: number) => String(Math.round((load / cpus) * 100) / 100)

  it('6: a box of fewer CPUs than its runner file names: the line gives the workers, the CPUs, the runner file\'s count, and the load for each CPU', async () => {
    const { lines, said } = await theLinesOf('green', { STAND_IN_DOOR_CPUS: '8' })
    expect(said.runnerWorkers!, 'the made-up box has fewer CPUs than its runner file names').toBeGreaterThan(said.cpus!)
    const box = said.boxLoad!
    expect(lines[0]).toContain(`at ${String(said.workers)} workers, one for each of the box's ${String(said.cpus)} CPUs, where its runner file names ${String(said.runnerWorkers)}, `)
    expect(lines[0]).toContain(`its 1-minute load was ${String(box.load!.median)} at the median and ${String(box.load!.worst)} at the worst, ` +
      `which is ${eachCpu(box.load!.median, said.cpus!)} and ${eachCpu(box.load!.worst, said.cpus!)} for each of its ${String(said.cpus)} CPUs, its available memory`)
  })

  it('7: a box of more CPUs: the line gives the workers and the CPUs', async () => {
    const { lines, said } = await theLinesOf('green', { STAND_IN_DOOR_CPUS: '32' })
    expect(said.workers).toBe(said.runnerWorkers)
    expect(lines[0]).toContain(`at ${String(said.workers)} workers, on a box of ${String(said.cpus)} CPUs, `)
    expect(lines[0]).toContain(`for each of its ${String(said.cpus)} CPUs`)
  })

  it('8: an answer with no CPUs: the line says the door did not say them, and gives no load for each CPU', async () => {
    const { lines, said } = await theLinesOf('green')
    expect(said.cpus).toBeUndefined()
    expect(lines[0]).toContain(`at ${String(said.workers)} workers, ${await theCpusNotSaid()}, `)
    expect(lines[0]).not.toContain('for each of its')
  })

  it('9: an answer with the CPUs and no load read: the line is written, says the door read the box at no time, and gives no load for each CPU', async () => {
    const { lines, said } = await theLinesOf('load-partly-read', { STAND_IN_DOOR_CPUS: '8' })
    const box = said.boxLoad!
    expect(said.cpus).toBe(8)
    expect(box.samples).toBe(0)
    expect(box.load, 'the door read no load, so it gives none').toBeNull()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(`while the suite ran the door read the box 0 time(s), ${String(box.everySec)} s apart; ${String(box.notRead)} other time(s) it could not read it`)
    expect(lines[0]).not.toContain('at the median')
    expect(lines[0]).not.toContain('for each of its')
  })
})
