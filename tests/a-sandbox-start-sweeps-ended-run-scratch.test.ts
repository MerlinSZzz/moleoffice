// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Synthetic records and a synthetic complete process namespace; no container or live office is touched.
 *
 * A PROCESS THE SWEEP CANNOT READ IS NAMED (the secretary, message fZET9FDl5ZKz, on item 2r of wave 13n): its pid, its
 * command name, its user and which read was refused, so a test's not-dumpable python3 is told from a real holder at a
 * glance. The rule is unchanged: the sweep still keeps a folder while any process cannot be read.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { A_CRASHED_RUNS_SCRATCH_WAITS_MS, SCRATCH_SWEEP_RULE, sweepRunScratch } from '../tools/sweep-run-scratch.mjs'
import { theProcessesUsing } from '../tools/scratch-folder-checks.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
let root: string, temp: string, instanceDir: string, folder: string
const run = 'abcd_efg-123', now = new Date(2026, 9, 14, 12).getTime()
let state: string, hours: number, merged: boolean, using: string[], hiddenCount: number, records: unknown[], unreadable: string[], unreadableAgain: string[] | null, about: string | null
beforeEach(() => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  root = mkdtempSync(join(process.cwd(), '.logs/sweep-test-')); temp = join(root, 'tmp'); instanceDir = join(root, 'instance')
  mkdirSync(temp); mkdirSync(instanceDir); folder = join(temp, run + '-ABC123'); mkdirSync(folder); writeFileSync(join(folder, 'evidence.txt'), 'Synthetic scratch')
  state = 'crashed'; hours = 49; merged = false; using = []; hiddenCount = 0; records = []; unreadable = []; unreadableAgain = null; about = null
})
/** The named-inside answer as the real door gives it, about the folder asked unless a case says another. */
function namedInside() {
  const answered = about ?? folder
  return { folder: answered, records, hiddenCount,
    scope: 'Readable live records in this project name their stored paths. hiddenCount counts other live records in every project that name this folder or a path inside it.',
    says: `${String(records.length)} readable records list files inside ${answered}; ${String(hiddenCount)} other live records name the folder or a path inside it.` }
}
const finishLog = () => readFileSync(join(instanceDir, 'logs', run, 'finish.log'), 'utf8')
afterEach(() => rmSync(root, { recursive: true, force: true }))
async function sweep() {
  // THE PAUSE BETWEEN OFFICE ASKS IS NOT WAITED HERE; tests/the-scratch-sweep-paces-its-office-asks.test.ts proves it.
  await sweepRunScratch({ root: temp, instanceDir, workspace: 'synthetic', now, sleep: async () => {},
    processes: () => ({ using, unreadable }), free: () => ({ why: using.length ? using.join('; ') : null, unreadable: unreadableAgain ?? unreadable }),
    ask: async (path: string) => ({ status: 200, body: path.startsWith('/api/report-files/') ? namedInside()
      : path.startsWith('/api/search') ? { counts: { matched: 0 }, elsewhere: [] }
        : path.endsWith('synthetic-merge') ? { record: { kind: 'merge_entry', data: { run, state: merged ? 'merged' : 'queued' } } }
          : { record: { id: run, kind: 'session', updatedAt: localStampOf(new Date(now - hours * 3_600_000)), data: { state, integrated: { entry: 'synthetic-merge' } } } } }) })
}
it('sweeps an ended run past 48 hours and logs its id, bytes and exact rule', async () => {
  await sweep(); expect(existsSync(folder)).toBe(false)
  const log = readFileSync(join(instanceDir, 'logs', run, 'finish.log'), 'utf8')
  expect(log).toContain(`run ${run}`); expect(log).toMatch(/\(\d+ bytes\) is removed. Rule:/)
})
it('keeps a process-held folder and removes it at the next sweep after that process ends', async () => {
  using = ['Synthetic process 17 holds a file open']; await sweep(); expect(existsSync(folder)).toBe(true)
  using = []; await sweep(); expect(existsSync(folder)).toBe(false)
})
/**
 * A RECORD THAT NAMES THE FOLDER KEEPS IT ONLY FOR A RUN THAT DID NOT FINISH OR CRASH: a finished or crashed run's folder goes
 * when its wait has passed, whatever names it. A stopped run's folder is still kept while a live record names it.
 */
it.each([
  { state: 'crashed', stays: false },
  { state: 'stopped', stays: true },
])('a folder named by a live readable record, of a $state run, stays: $stays', async ({ state: ended, stays }) => {
  state = ended
  records = [{ id: 'synthetic-report', kind: 'report', title: 'Synthetic report', paths: [{ where: 'data.blocks[#evidence].path', path: join(folder, 'evidence.txt') }] }]
  await sweep(); expect(existsSync(folder)).toBe(stays)
  if (stays) expect(finishLog()).toContain(`is kept: 1 record names files inside ${folder}, 1 you can read and 0 you may not.`)
})
it('keeps a stopped run\'s folder named by hidden live records', async () => {
  state = 'stopped'; hiddenCount = 2; await sweep(); expect(existsSync(folder)).toBe(true)
  expect(finishLog()).toContain(`is kept: 2 records name files inside ${folder}, 0 you can read and 2 you may not.`)
})
it('keeps a stopped run\'s folder when the named-inside answer is about another folder', async () => {
  state = 'stopped'; about = join(temp, 'another_run1-ABC123'); await sweep(); expect(existsSync(folder)).toBe(true)
  expect(finishLog()).toContain('is kept: the complete live-record reference check did not answer.')
})
it('keeps a run that ended an hour ago without its own merged entry', async () => {
  hours = 1; await sweep(); expect(existsSync(folder)).toBe(true)
})
it('sweeps a recent ended run whose own entry merged', async () => {
  hours = 1; merged = true; await sweep(); expect(existsSync(folder)).toBe(false)
})
/**
 * A FINISHED RUN'S FOLDER WAITS AN HOUR, NOT 48 (problem GqMeoOjj7OwX). A run that says finished and then exits had its folder
 * kept by its own finish (the office refused the record search after the key window, 403), and the next start's sweep kept it
 * 48 hours more: 24.9 GB in the containers by 9 November. Any other ended run still waits 48 hours.
 */
it('sweeps a finished run whose record last changed more than an hour ago, though its own entry has not merged', async () => {
  state = 'finished'; hours = 1.5; await sweep(); expect(existsSync(folder)).toBe(false)
  expect(finishLog()).toMatch(/\(\d+ bytes\) is removed. Rule: /)
  expect(finishLog()).toContain(SCRATCH_SWEEP_RULE)
})
it('keeps a finished run whose record changed under an hour ago, and says the hour', async () => {
  state = 'finished'; hours = 0.5; await sweep(); expect(existsSync(folder)).toBe(true)
  expect(finishLog()).toContain('is kept: the run has not ended with its own merge merged or a record last changed more than an hour ago, as a finished run.')
})
/** A CRASHED RUN WITH NO END OF ITS COMMAND RECORDED counts its wait from its record's last change, and its line names that moment. */
it('keeps a crashed run whose record changed two hours ago, for its wait, and names the wait and the moment read', async () => {
  state = 'crashed'; hours = 2; await sweep(); expect(existsSync(folder)).toBe(true)
  const line = finishLog().split('\n').find(one => one.includes(`${folder} is kept: `)) ?? ''
  expect(line).toContain(`${String(A_CRASHED_RUNS_SCRATCH_WAITS_MS / 3_600_000)} hours`)
  expect(line).toContain(localStampOf(new Date(now - hours * 3_600_000)))
})
it('keeps a hand-named round folder', async () => {
  rmSync(folder, { recursive: true }); folder = join(temp, 'round-51-handwritten'); mkdirSync(folder); writeFileSync(join(folder, 'kept'), 'Synthetic hand notes')
  await sweep(); expect(existsSync(folder)).toBe(true)
})
/** Two processes as the checks name them when they cannot be read; synthetic. */
const A_PYTHON = 'process 17 (python3, user 1000), whose working folder and open files were refused (EACCES)'
const A_SHELL = 'process 23 (sh, user 1000), whose open files were refused (EPERM)'
it('keeps scratch when process inspection is incomplete, and names the process it could not read', async () => {
  unreadable = [A_PYTHON]; await sweep(); expect(existsSync(folder)).toBe(true)
  expect(finishLog()).toContain(`is kept: 1 process could not be read by this helper's user: ${A_PYTHON}.`)
})
it('keeps scratch when the check just before the removal cannot read processes, and names each', async () => {
  unreadableAgain = [A_PYTHON, A_SHELL]; await sweep(); expect(existsSync(folder)).toBe(true)
  expect(finishLog()).toContain(`is kept: 2 processes could not be read by this helper's user: ${A_PYTHON}; ${A_SHELL}.`)
  expect(finishLog()).not.toContain('process inspection was incomplete')
})
it('never removes scratch belonging to a still-running run', async () => {
  state = 'running'; merged = true; await sweep(); expect(existsSync(folder)).toBe(true)
})

/**
 * A synthetic /proc/<pid> with a working folder, a folder of open files, and a command name and status unless left out.
 * A `state` puts a State line in the status, and `threads` makes a task folder holding those thread ids.
 */
function aSyntheticProcess(proc: string, pid: number, named: { comm: string, uids: string, state?: string, threads?: number[] } | null) {
  const at = join(proc, String(pid))
  mkdirSync(join(at, 'fd'), { recursive: true }); symlinkSync(instanceDir, join(at, 'cwd'))
  if (named !== null) {
    writeFileSync(join(at, 'comm'), `${named.comm}\n`)
    writeFileSync(join(at, 'status'), `Name:\t${named.comm}\n${named.state === undefined ? '' : `State:\t${named.state}\n`}Uid:\t${named.uids}\nGid:\t1000\t1000\t1000\t1000\n`)
  }
  for (const thread of named?.threads ?? []) mkdirSync(join(at, 'task', String(thread)), { recursive: true })
  return at
}
it('process inspection is incomplete even when only fds cannot be read, and the process is named with its real user', () => {
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 17, { comm: 'python3', uids: '1000\t0\t0\t0' })
  chmodSync(join(at, 'fd'), 0)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: ['process 17 (python3, user 1000), whose open files were refused (EACCES)'] }) }
  finally { chmodSync(join(at, 'fd'), 0o700) }
})
it('names a process whose working folder, open files, command name and user all could not be read', () => {
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 18, { comm: 'python3', uids: '1000\t1000\t1000\t1000' })
  aSyntheticProcess(proc, 19, null)
  chmodSync(at, 0o600)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: ['process 18 (name not read, user not read), whose working folder and open files were refused (EACCES)'] }) }
  finally { chmodSync(at, 0o700) }
})
it('leaves out a process that is gone by the time its name is read, after its open files were refused', () => {
  // Receipt sf9-scu4CJC8: the next start's sweep kept a crashed run's folder for 'process 17499 (name not read, user not read),
  // whose open files were refused (EACCES)'. A live process always has its comm and status; both gone means it had exited
  // between the reads, and a process that is gone holds nothing open. Process 18 above, still there and unreadable, is kept.
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 20, null)
  chmodSync(join(at, 'fd'), 0)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: [] }) }
  finally { chmodSync(join(at, 'fd'), 0o700) }
})
it.each([
  { gone: 'its command name and its status are', status: false, counted: false },
  { gone: 'its command name alone is', status: true, counted: true },
])('after its open files were refused, a process whose $gone gone when they are read is counted: $counted', ({ status, counted }) => {
  // A process can end between the look that finds its comm and status (theProcessIsGone) and the reads that name it, as
  // one of the fake container's own processes did beside a sweep in round AC of wave 13n. A link to nothing stands for a
  // file that went in between: the look finds the link, and a read finds nothing. Both gone means the process exited, and
  // a process that has exited holds nothing open; one still there means it is still there, and it is counted.
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 22, null)
  symlinkSync(join(root, 'nothing-here'), join(at, 'comm'))
  if (status) writeFileSync(join(at, 'status'), 'Name:\tpython3\nUid:\t1000\t1000\t1000\t1000\n')
  else symlinkSync(join(root, 'nothing-here'), join(at, 'status'))
  chmodSync(join(at, 'fd'), 0)
  const unreadable = counted ? ['process 22 (name not read, user 1000), whose open files were refused (EACCES)'] : []
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable }) }
  finally { chmodSync(join(at, 'fd'), 0o700) }
})
it.each([
  { comm: 'py\nthon3', named: 'py?thon3' },
  { comm: 'a\x01b\x1fc d~e\x7ff', named: 'a?b?c d~e?f' },
])('puts a ? for each control character in the command name of a process it names ($named), so the name cannot start a line of its own', ({ comm, named }) => {
  // A process sets its own command name, so a newline in it would write a false line into finish.log and the sweep's
  // lines. Every character below 0x20, and 0x7f, becomes a ?; a space (0x20) and a ~ (0x7e) stay as they are.
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 21, { comm, uids: '1000\t1000\t1000\t1000' })
  chmodSync(join(at, 'fd'), 0)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: [`process 21 (${named}, user 1000), whose open files were refused (EACCES)`] }) }
  finally { chmodSync(join(at, 'fd'), 0o700) }
})

/*
 * A PROCESS THAT HAS ENDED AND WAITS ONLY TO BE REAPED IS LEFT OUT: its State is Z or X and its task folder lists only
 * itself. Such a process has already closed its files and let go of its working folder, but its open files read as
 * refused (EACCES), so until round AC of wave 13n the sweep kept a finished run's folder for it. Every other case counts
 * the process: State is read from status first and the task folder second, and a read that is refused counts it.
 */
const ENDED = 'process 31 (python3, user 1000), whose open files were refused (EACCES)'
it.each([
  { what: 'a process that has ended and waits only to be reaped', state: 'Z (zombie)', threads: [31], counted: false },
  { what: 'a process that has ended and is being reaped', state: 'X (dead)', threads: [31], counted: false },
  { what: 'an ended first thread whose other threads still run', state: 'Z (zombie)', threads: [31, 32], counted: true },
  { what: 'a process still running partway through its exit', state: 'R (running)', threads: [31], counted: true },
  { what: 'a new process that took the pid after an ended one was reaped', state: 'S (sleeping)', threads: [31], counted: true },
  { what: 'a process whose status has no State line', state: undefined, threads: [31], counted: true },
  { what: 'an ended process with no task folder to read', state: 'Z (zombie)', threads: [], counted: true },
])('after its open files were refused, $what is counted: $counted', ({ state, threads, counted }) => {
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 31, { comm: 'python3', uids: '1000\t1000\t1000\t1000', state, threads })
  chmodSync(join(at, 'fd'), 0)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: counted ? [ENDED] : [] }) }
  finally { chmodSync(join(at, 'fd'), 0o700) }
})
it.each([
  { what: 'status', named: 'process 31 (python3, user not read), whose open files were refused (EACCES)' },
  { what: 'task', named: ENDED },
])('counts an ended process whose $what cannot be read', ({ what, named }) => {
  const proc = join(root, 'synthetic-proc'), at = aSyntheticProcess(proc, 31, { comm: 'python3', uids: '1000\t1000\t1000\t1000', state: 'Z (zombie)', threads: [31] })
  chmodSync(join(at, 'fd'), 0); chmodSync(join(at, what), 0)
  try { expect(theProcessesUsing(folder, proc)).toEqual({ using: [], unreadable: [named] }) }
  finally { chmodSync(join(at, 'fd'), 0o700); chmodSync(join(at, what), 0o700) }
})
