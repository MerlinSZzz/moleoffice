// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CRASHED RUN'S SCRATCH FOLDER WAITS A DAY, AND A RECORD THAT NAMES A FINISHED OR CRASHED RUN'S FOLDER DOES NOT KEEP IT.
 *
 * tools/sweep-run-scratch.mjs sweeps old runs' scratch folders at each sandbox start. A finished run's folder goes after its
 * hour and a crashed run's after A_CRASHED_RUNS_SCRATCH_WAITS_MS, counted from the end of its command and from its record's
 * last change when no end is recorded. A record or a search hit that names the folder keeps neither. The checks that do
 * keep a folder stay: it must be the folder made, and no process may work in it or hold a file in it. A folder the sweep
 * keeps because the run has not ended, or because the run's record could not be read, gets a line saying what was read.
 *
 * Every record, process and answer here is synthetic; no container or office is touched. The waits are read from the
 * sweep's own exports.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { A_CRASHED_RUNS_SCRATCH_WAITS_MS, A_FINISHED_RUNS_SCRATCH_WAITS_MS, sweepRunScratch } from '../tools/sweep-run-scratch.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

const run = 'crash_wait_1', now = new Date(2026, 10, 16, 12).getTime(), HOUR = 3_600_000
let root: string, temp: string, instanceDir: string, folder: string
/** The office's answer to a read of the run's record. */
let theRunsRecord: { status: number; body: unknown }
/** The processes the first check finds, and the reason the check just before the removal gives, or null. */
let using: string[], atTheEnd: string | null

beforeEach(() => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs/crash-wait-test-')); temp = join(root, 'tmp'); instanceDir = join(root, 'instance')
  mkdirSync(temp); mkdirSync(instanceDir); folder = join(temp, `${run}-ABC123`); mkdirSync(folder); writeFileSync(join(folder, 'evidence.txt'), 'Synthetic scratch')
  using = []; atTheEnd = null
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A session record for the run in `state`, last changed at `changed`, its command ended at `ended` when one is given. */
function aRun(state: string, changed: number, ended?: number): { status: number; body: unknown } {
  return { status: 200, body: { record: { id: run, kind: 'session', updatedAt: localStampOf(new Date(changed)),
    data: { state, ...(ended === undefined ? {} : { commandEnded: { at: localStampOf(new Date(ended)), code: 3 } }) } } } }
}

/** One sweep. Every other door answers that a readable record lists a file in the folder, and that a search finds it. */
async function sweep(): Promise<void> {
  await sweepRunScratch({ root: temp, instanceDir, workspace: 'synthetic', now, clock: () => now, sleep: async () => {},
    processes: () => ({ using, unreadable: [] }), free: () => ({ why: atTheEnd, unreadable: [] }),
    ask: async (path: string) => path.startsWith('/api/report-files/named-inside?')
      ? { status: 200, body: { folder, hiddenCount: 0,
        records: [{ id: 'synthetic-report', kind: 'report', title: 'Synthetic report', paths: [{ where: 'data.blocks[#evidence].path', path: join(folder, 'evidence.txt') }] }],
        scope: 'Readable live records in this project name their stored paths. hiddenCount counts other live records in every project that name this folder or a path inside it.',
        says: `1 readable records list files inside ${folder}; 0 other live records name the folder or a path inside it.` } }
      : path.startsWith('/api/search?') ? { status: 200, body: { counts: { matched: 1 }, elsewhere: [] } }
        : theRunsRecord })
}
/** What each line the sweep wrote about the folder in the run's finish.log says after the folder's path. */
const linesAbout = (): string[] => {
  const log = join(instanceDir, 'logs', run, 'finish.log')
  return (existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []).filter(line => line.includes(` ${folder} `))
    .map(line => line.slice(line.indexOf(` ${folder} `) + folder.length + 2))
}

it("removes a finished run's folder after its wait, though a record names a file in it", async () => {
  theRunsRecord = aRun('finished', now - A_FINISHED_RUNS_SCRATCH_WAITS_MS - HOUR / 2)
  await sweep()
  expect(existsSync(folder)).toBe(false)
})

// The hours are written out, not counted from A_CRASHED_RUNS_SCRATCH_WAITS_MS, so a wait other than 24 hours is red here.
it.each([
  { hours: 23, stays: true },
  { hours: 25, stays: false },
])("a crashed run's folder that a record names, $hours hours after the end of its command, stays: $stays", async ({ hours, stays }) => {
  const ended = now - hours * HOUR
  theRunsRecord = aRun('crashed', ended, ended)
  await sweep()
  expect(existsSync(folder)).toBe(stays)
  if (stays) expect(linesAbout().join('\n')).toContain(localStampOf(new Date(ended)))
})

it("counts a crashed run's wait from the end of its command, not from its record's last change", async () => {
  theRunsRecord = aRun('crashed', now - 2 * HOUR, now - A_CRASHED_RUNS_SCRATCH_WAITS_MS - HOUR)
  await sweep()
  expect(existsSync(folder)).toBe(false)
})

it.each([
  { seen: 'by the first check', first: ['process 4242 works in it'], last: null, pid: '4242' },
  { seen: 'by the check just before the removal', first: [], last: 'process 4343 holds a file in it open', pid: '4343' },
])("keeps a crashed run's folder past its wait while a process uses it, seen $seen, and names the process", async ({ first, last, pid }) => {
  const ended = now - A_CRASHED_RUNS_SCRATCH_WAITS_MS - HOUR
  theRunsRecord = aRun('crashed', ended, ended); using = first; atTheEnd = last
  await sweep()
  expect(existsSync(folder)).toBe(true)
  expect(linesAbout().join('\n')).toContain(pid)
})

it("keeps a running run's folder, and its line names the state read", async () => {
  theRunsRecord = aRun('running', now - 100 * HOUR)
  await sweep()
  expect(existsSync(folder)).toBe(true)
  expect(linesAbout()).toHaveLength(1)
  expect(linesAbout()[0]).toContain('running')
})

it.each([
  { what: 'the office answers 404', answer: { status: 404, body: { error: 'Synthetic: no such record' } }, names: '404' },
  { what: 'the record is a report', answer: { status: 200, body: { record: { id: run, kind: 'report', updatedAt: '2026-11-01 08:00:00', data: {} } } }, names: 'report' },
  { what: 'the record was deleted', answer: { status: 200, body: { record: { id: run, kind: 'session', updatedAt: '2026-11-01 08:00:00', deletedAt: '2026-11-02 09:30:00', data: { state: 'crashed' } } } }, names: '2026-11-02 09:30:00' },
])('keeps a folder whose run state cannot be read when $what, and its line says why', async ({ answer, names }) => {
  theRunsRecord = answer
  await sweep()
  expect(existsSync(folder)).toBe(true)
  expect(linesAbout()).toHaveLength(1)
  expect(linesAbout()[0]).toContain(names)
})
