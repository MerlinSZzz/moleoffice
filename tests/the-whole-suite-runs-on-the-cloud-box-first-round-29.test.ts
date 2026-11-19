// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE SUITE RUNS ON THE CLOUD BOX FIRST, AND HERE WHEN THE BOX CANNOT RUN IT, by two decisions, in wave 13v
 * round 29.
 *
 * The merge tool asks the cloud door, tools/cloud-suite.mjs, to run the whole suite on the box. A run the box made is read
 * as a run here is: green or red, from the files the door hands back. Exit 75 (the box could not be reached, was busy,
 * has no runner, or timed out), a door that crashes, an answer that cannot be read, or an answer that disagrees with what
 * was handed back makes the suite run here instead, and the log says why. Every suite's line in the log says where it
 * ran and how long it took. The box runs at its own worker count: the queue passes none, and says the count the box's
 * answer gives (message ehJVu_fXbmtQ).
 *
 * EVERY CASE HERE IS MADE UP: tests/stand-in-cloud-suite-door.mjs stands in for the door, and "here" is a function that
 * writes down that it was called. Nothing here reaches the box, and the real door is never called: the case that names
 * it as the real door proves a test-started process refuses to call it.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { aSuiteOnTheBoxOrHere } from '../tools/merge-tool/cloud-suite-door.mjs'

const REPO = join(import.meta.dirname, '..')
const STAND_IN = join(REPO, 'tests', 'stand-in-cloud-suite-door.mjs')
/** A path that is not the stand-in, standing for the real door. It is never called. */
const NOT_THE_STAND_IN = join(REPO, 'tools', 'cloud-suite.mjs')
const COMMIT = 'a'.repeat(40)
const HERE_IS = 'in sandbox made-up-sandbox'

let root = ''
let lines: string[] = []
let ranHere: { calls: number; leftovers: string[] } = { calls: 0, leftovers: [] }
let doorRuns: { label: string; timeoutMs: number }[] = []
let now = 0

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cloud-suite-door-'))
  mkdirSync(join(root, 'clone'))
  mkdirSync(join(root, 'reports'))
  lines = []
  ranHere = { calls: 0, leftovers: [] }
  doorRuns = []
  now = 0
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** What the door is given for the whole suite of a made-up clone. */
function theBox() {
  return {
    clone: join(root, 'clone'),
    commit: COMMIT,
    report: join(root, 'reports', 'suite.json'),
    reads: join(root, 'reports', 'suite-reads'),
    suiteLog: join(root, 'reports', 'suite.log'),
    timeoutSec: 10800,
  }
}

/** The merge tool's run, done here with spawnSync: stdout and stderr in one log, as run() writes them, and the exit. */
function aRun(env: Record<string, string>) {
  return (label: string, command: string, args: string[], { cwd, timeoutMs }: { cwd: string; timeoutMs: number }) => {
    doorRuns.push({ label, timeoutMs })
    const outFile = join(root, `${label}.log`)
    // A DOOR THAT NEVER ENDS is stopped after three seconds here, standing for run()'s own limit.
    const done = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 3000 })
    writeFileSync(outFile, `${done.stdout}${done.stderr}`)
    const timedOut = (done.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT'
    return Promise.resolve({ code: done.status, signal: done.signal, timedOut, stoppedReason: null, outFile })
  }
}

/** The suite run here, which writes down that it was called and what the box had left in the reports folder. */
function here(box: ReturnType<typeof theBox>) {
  return () => {
    ranHere.calls += 1
    ranHere.leftovers = [box.report, box.reads, box.suiteLog].filter((one) => existsSync(one))
    const outFile = join(root, 'suite-here.log')
    writeFileSync(outFile, 'made-up run here\n')
    return Promise.resolve({ code: 0, signal: null, timedOut: false, stoppedReason: null, outFile, tail: '' })
  }
}

function ask(does: string, over: { box?: object | null; door?: string; theRealDoor?: string; env?: Record<string, string>; reason?: string; label?: string } = {}) {
  const box = theBox()
  const calls = join(root, 'calls.jsonl')
  const env = { PATH: String(process.env['PATH']), HOME: join(root, 'home'), STAND_IN_DOOR_DOES: does, STAND_IN_DOOR_CALLS: calls, STAND_IN_DOOR_REASON: over.reason ?? '' }
  const answer = aSuiteOnTheBoxOrHere({
    label: over.label ?? 'suite',
    box: over.box === undefined ? box : over.box,
    here: here(box),
    hereIs: HERE_IS,
    door: over.door ?? STAND_IN,
    theRealDoor: over.theRealDoor ?? NOT_THE_STAND_IN,
    run: aRun(env),
    log: (line: string) => lines.push(line),
    keepTheLog: (file: string) => {
      const kept = join(root, 'kept-suite.log')
      copyFileSync(file, kept)
      return kept
    },
    env: over.env ?? {},
    clock: () => (now += 1500),
  })
  return { answer, box, calls }
}

function callsIn(file: string): string[][] {
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]) : []
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

/** The two lines of a suite the box did not run: why, and the run here with its time. */
function theLinesOfARunHere(why: string) {
  return [
    `suite is not run on the cloud box, so it runs here, ${HERE_IS}: ${why} (the door's own log ${join(root, 'suite-door.log')})`,
    `suite ran here, ${HERE_IS}: it exited 0; 1.5 s from its start to its end (log ${join(root, 'suite-here.log')})`,
  ]
}

it('reads a green run on the box as a run here, gives the door every word but a worker count, and says where the suite ran, at what count and for how long', async () => {
  const { answer, box, calls } = ask('green')
  const ran = await answer
  expect(callsIn(calls)).toEqual([['run', '--clone', box.clone, '--commit', COMMIT, '--report', box.report, '--reads', box.reads, '--log', box.suiteLog, '--timeout', '10800']])
  expect(doorRuns).toEqual([{ label: 'suite-door', timeoutMs: 10800 * 1000 + 10 * 60 * 1000 }])
  expect(ranHere.calls, 'the suite ran here as well').toBe(0)
  expect(ran).toMatchObject({ code: 0, timedOut: false, where: 'box', wallSec: 1.5, outFile: join(root, 'kept-suite.log'), box: { ran: true, wallSec: 1998.4, workers: 20 } })
  // THE FILES ARE LEFT WHERE A RUN HERE LEAVES THEM, for the caller to read.
  expect(JSON.parse(readFileSync(box.report, 'utf8')).testResults.map((one: { status: string }) => one.status)).toEqual(['passed', 'passed'])
  expect(existsSync(join(box.reads, 'made-up-process.txt'))).toBe(true)
  // THE BOX'S LOAD WHILE THE SUITE RAN is the stand-in's made-up answer, read from the door's last line.
  const { load, availableMemoryMb: memory, samples, everySec } = (JSON.parse(readFileSync(join(root, 'suite-door.log'), 'utf8').trim().split('\n').at(-1)!) as {
    boxLoad: { samples: number; everySec: number; load: { median: number; worst: number }; availableMemoryMb: { median: number; worst: number } }
  }).boxLoad
  expect(lines).toEqual([
    `suite ran on the cloud box: npm test exited 0, 0 file(s) failed, at 20 workers, ${await theCpusNotSaid()}, on commit ${COMMIT.slice(0, 12)}; 1.5 s from the call to its answer, 1998.4 s by the box's own count; ` +
      `while the suite ran the door read the box ${String(samples)} time(s), ${String(everySec)} s apart: its 1-minute load was ${String(load.median)} at the median and ${String(load.worst)} at the worst, ` +
      `its available memory ${String(memory.median)} MB at the median and ${String(memory.worst)} MB at the worst (log ${join(root, 'kept-suite.log')}, the door's own log ${join(root, 'suite-door.log')})`,
  ])
})

it('reads a red run on the box as red, and does not run the suite again here', async () => {
  const { answer, box } = ask('red')
  const ran = await answer
  expect(ranHere.calls).toBe(0)
  expect(ran).toMatchObject({ code: 1, where: 'box', box: { ran: true } })
  expect(JSON.parse(readFileSync(box.report, 'utf8')).testResults.map((one: { status: string }) => one.status)).toEqual(['passed', 'failed'])
  expect(lines[0]).toContain('suite ran on the cloud box: npm test exited 1, 1 file(s) failed, at 20 workers')
})

it('says the door did not give the worker count when its answer names none, and does not put one in', async () => {
  const ran = await ask('no-workers').answer
  expect(ranHere.calls).toBe(0)
  expect(ran).toMatchObject({ code: 0, where: 'box', box: { ran: true, workers: null } })
  expect(lines[0]).toContain('suite ran on the cloud box: npm test exited 0, 0 file(s) failed, at a worker count the door did not say, on commit')
})

it.each([
  ['the box could not be reached', 'made-up: the box did not answer on its address'],
  ['the box was busy', 'made-up: the box is busy with another suite, and runs one at a time'],
  ['no runner is configured', 'made-up: no runner is configured for the box'],
  ['the run timed out', 'made-up: the suite did not end within 10800 s on the box'],
])('runs the suite here when the door exits 75 because %s, and the log says why', async (_case, reason) => {
  const { answer, calls } = ask('not-run', { reason })
  const ran = await answer
  expect(callsIn(calls)).toHaveLength(1)
  expect(ranHere.calls).toBe(1)
  expect(ran).toMatchObject({ code: 0, where: 'here', wallSec: 1.5, outFile: join(root, 'suite-here.log'), box: { ran: false, why: `the door says the box could not run it: ${reason}` } })
  expect(lines).toEqual(theLinesOfARunHere(`the door says the box could not run it: ${reason}`))
})

it('runs the suite here when the door crashes, and the log names the crash', async () => {
  const { answer } = ask('crash')
  const ran = await answer
  expect(ranHere.calls).toBe(1)
  expect(ran.where).toBe('here')
  const doorLog = readFileSync(join(root, 'suite-door.log'), 'utf8')
  expect(doorLog).toContain('Error: the stand-in door broke on purpose')
  expect(lines[0]).toMatch(/^suite is not run on the cloud box, so it runs here, in sandbox made-up-sandbox: the door's last line is not its answer, and it exited 1: ".+"/u)
  expect(lines[1]).toBe(theLinesOfARunHere('')[1])
})

it('runs the suite here when the door\'s answer cannot be read, quoting its last line', async () => {
  const { answer } = ask('unreadable')
  const ran = await answer
  expect(ranHere.calls).toBe(1)
  expect(ran.where).toBe('here')
  expect(lines).toEqual(theLinesOfARunHere(`the door's last line is not its answer, and it exited 0: ${JSON.stringify('{"ran": true, "code": 0, "wallS')}`))
})

it('runs the suite here when the door gives no answer after its own time limit, and says its process group was stopped', async () => {
  const { answer } = ask('hang')
  const ran = await answer
  expect(ranHere.calls).toBe(1)
  expect(ran.where).toBe('here')
  expect(lines).toEqual(theLinesOfARunHere('the door gave no answer within 10 minutes after its own time limit of 10800 s, so its process group was stopped'))
}, 20_000)

it.each([
  ['exit-not-code', 'the door says it ran the suite and npm test exited 0, but it exited 1'],
  ['other-commit', `the door says it ran commit ${'b'.repeat(40)}, not ${COMMIT}, which it was given`],
  ['report-outside', 'names 2 file(s) outside the clone'],
  ['no-log', 'the door says it ran the suite, but handed back no log at '],
  ['no-reads', 'the door says it ran the suite, but handed back no record of what the suite read at '],
])('runs the suite here when the door says it ran but %s, after clearing what the box left', async (does, why) => {
  const { answer } = ask(does)
  const ran = await answer
  expect(ranHere.calls).toBe(1)
  expect(ranHere.leftovers, 'the run here could read a file the box left').toEqual([])
  expect(ran).toMatchObject({ where: 'here', box: { ran: false, why: expect.stringContaining(why) } })
  expect(lines[0]).toContain(why)
})

it('never calls the real door from a run the test suite started, and runs the suite here', async () => {
  const { answer, calls } = ask('green', { door: STAND_IN, theRealDoor: STAND_IN, env: { [THE_TEST_MARK]: String(process.pid) } })
  const ran = await answer
  expect(callsIn(calls), 'the door named as the real one was called').toEqual([])
  expect(ranHere.calls).toBe(1)
  expect(ran).toMatchObject({ where: 'here', box: { ran: false, why: 'the test suite started this run, and a run the test suite started never calls the door of the real cloud box', doorLog: null } })
  expect(lines[1]).toBe(theLinesOfARunHere('')[1])
})

it('runs the suite here when there is no door, as before the tool maintainer\'s door is on main', async () => {
  const missing = join(root, 'no-such-door.mjs')
  const { answer } = ask('green', { door: missing })
  const ran = await answer
  expect(doorRuns).toEqual([])
  expect(ranHere.calls).toBe(1)
  expect(ran.box).toEqual({ ran: false, why: `there is no door at ${missing}`, doorLog: null })
  expect(lines[0]).toBe(`suite is not run on the cloud box, so it runs here, ${HERE_IS}: there is no door at ${missing}`)
})

it('runs a suite the box is not asked for here, saying why when the caller gives a reason, and its time either way', async () => {
  const leftOut = await ask('green', { box: { why: 'made-up: this suite leaves out files, and the door takes no files to leave out' } }).answer
  expect(doorRuns).toEqual([])
  expect(leftOut).toMatchObject({ where: 'here', box: { ran: false, why: 'made-up: this suite leaves out files, and the door takes no files to leave out', doorLog: null } })
  expect(lines).toEqual([
    `suite is not run on the cloud box, so it runs here, ${HERE_IS}: made-up: this suite leaves out files, and the door takes no files to leave out`,
    `suite ran here, ${HERE_IS}: it exited 0; 1.5 s from its start to its end (log ${join(root, 'suite-here.log')})`,
  ])
  lines = []
  now = 0
  const related = await ask('green', { box: null, label: 'related' }).answer
  expect(doorRuns).toEqual([])
  expect(related.where).toBe('here')
  expect(related.box).toBeUndefined()
  expect(lines).toEqual([`related ran here, ${HERE_IS}: it exited 0; 1.5 s from its start to its end (log ${join(root, 'suite-here.log')})`])
})
