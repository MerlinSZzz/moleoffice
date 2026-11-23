// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOX RUN WHOSE LAUNCHER'S PROCESS GROUP HAS ENDED IS CLOSED BY THE MINUTE PASS.
 *
 * A sandbox container outlives the run working in it, so the container closer alone left a run saying it was still
 * going after the command that worked in it had ended. The minute pass now reads every process row a run holds that
 * the office marked as started by the product, released or not, and asks the machine about its process group. When
 * every such group is gone the run is marked crashed, with the group named and the command's recorded exit code or
 * signal in `closedBecause`. A leader still alive, another process of its group still running, a later process
 * reusing the number, or a group that cannot be read leaves the run as it is; the last two of those say why. A run
 * with no marked launcher row is left as it is and named. A run on another computer is not asked about.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first. Make closeTheSandboxRunsWhoseLauncherEnded in
 * src/server/lib/own-rows.ts leave the run running (no patch) and cases 1, 2, 3 and 6 go red. Stop reading released
 * rows (drop includeReleased from its readRows call) and case 3 goes red. Do not treat a leader at another start time
 * as gone and case 6 goes red. Read only the newest launcher row, or close the run when any one row reads gone, and
 * case 7 goes red. Take the marked-row filter out and case 8 goes red. Do not catch a throw from the group reading
 * and case 9 goes red. Take theRowNamesAnotherMachine out of the candidate filter and case 10 goes red. Run the
 * launcher step before the container step and case 11 goes red. Send a signal anywhere in the close and case 12 goes
 * red.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { STILL_GOING_STATES, saysStillGoing } from '../src/config/still-going.mjs'
import { THE_SWEEPS_CLOSE } from '../src/config/finished.mjs'
import { SESSION_STATES } from '../src/shared/types.ts'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'
import type { OsContainerState, OsProcess } from '../src/server/lib/resources.ts'
import type { RemindersPass } from '../src/server/lib/reminders.ts'

let t: TestDb
let folder: string
let resources: typeof import('../src/server/lib/resources.ts')
let reminders: typeof import('../src/server/lib/reminders.ts')
const containers = vi.fn()
const containerState = vi.fn<(name: string) => OsContainerState>()
const processById = vi.fn<(pid: number) => OsProcess | null>()
const processesInGroup = vi.fn<(pgid: number) => OsProcess[]>()
const signal = vi.fn()
const NAME = 'mole-office-sandbox-launcher-test-line'
const FINISHED = '2026-11-21T16:08:08.123456789Z'
const NOW = new Date('2026-11-21T19:33:00Z')
const CRASHED = SESSION_STATES[3]

let madeRuns: string[] = []
let runningContainers: string[] = []

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-ended-launcher-'))
  resources = await import('../src/server/lib/resources.ts')
  reminders = await import('../src/server/lib/reminders.ts')
}, 60_000)

afterAll(() => {
  resources?.useOsProbe(resources.LINUX_PROBE)
  vi.unstubAllEnvs()
  t?.close()
  rmSync(folder, { recursive: true, force: true })
})

beforeEach(() => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  madeRuns = []
  runningContainers = [NAME]
  containers.mockReset().mockImplementation(() => ({
    available: true,
    containers: runningContainers.map(name => ({ id: `synthetic-${name}`, name, image: 'test', status: 'Up' })),
  }))
  containerState.mockReset().mockReturnValue({ ok: true, state: 'stopped', exitCode: 0, finishedAt: FINISHED })
  processById.mockReset().mockReturnValue(null)
  processesInGroup.mockReset().mockReturnValue([])
  signal.mockReset().mockImplementation(() => { throw new Error('this check must never send a signal') })
  resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers, containerState, processById, processesInGroup, killProcessGroup: signal,
  }))
})

afterEach(() => {
  // THE MINUTE PASS READS EVERY PROJECT, so a run this case left still going would be read by the next
  // case's pass. Ending it here leaves the office as this case found it.
  for (const run of madeRuns) {
    const row = t.api.getRecord(run)
    if (row !== null && saysStillGoing(row.data['state'])) {
      t.api.patchRecord(run, { dataPatch: { state: CRASHED } }, t.api.HUMAN)
    }
  }
  resources?.useOsProbe(resources.LINUX_PROBE)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function aRun(state: string = STILL_GOING_STATES[0], more: Record<string, unknown> = {}): string {
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A sandbox launcher test run',
    data: { state, workingDirectory: folder, lastOutputAt: localStamp(new Date()), ...more }, actor: t.api.HUMAN }).id
  madeRuns.push(id)
  const container = resources.registerResource({ workspaceId: 'default', sessionRecordId: id,
    type: 'container', key: NAME, actor: t.api.HUMAN }).id
  t.api.patchRecord(id, { dataPatch: { sandbox: { container } } }, t.api.HUMAN)
  return id
}

function aLauncher(run: string, pid: number, startedAt = localStamp(NOW)): string {
  processById.mockReturnValue({ pid, pgid: pid, ppid: 1, command: 'synthetic launcher', startedAt })
  return resources.registerResource({ workspaceId: 'default', sessionRecordId: run,
    type: 'process', key: String(pid), startedByTheProduct: true, actor: t.api.HUMAN }).id
}

function anUnmarkedProcess(run: string, pid: number): string {
  processById.mockReturnValue({ pid, pgid: pid, ppid: 1, command: 'synthetic process', startedAt: localStamp(NOW) })
  return resources.registerResource({ workspaceId: 'default', sessionRecordId: run,
    type: 'process', key: String(pid), actor: t.api.HUMAN }).id
}

function aProcessAt(pid: number, startedAt: string, pgid = pid): OsProcess {
  return { pid, pgid, ppid: 1, command: 'synthetic process', startedAt }
}

function pass(): RemindersPass {
  return reminders.sendTheRemindersThatAreDue('default', NOW, NOW, folder)
}

function stillGoing(run: string, state: string = STILL_GOING_STATES[0]): void {
  expect(t.api.getRecord(run)?.data['state']).toBe(state)
  expect(t.api.getRecord(run)?.data['closedBecause']).toBeUndefined()
}

it('closes a running run and an idle run whose launcher leader and group are gone', () => {
  const runs = STILL_GOING_STATES.map(state => aRun(state))
  const pids = [51001, 51002]
  runs.forEach((run, index) => { aLauncher(run, pids[index]!) })
  processById.mockReturnValue(null)
  processesInGroup.mockReturnValue([])
  const report = pass()
  expect(report.sandboxLauncherRowsClosed.sort()).toEqual([...runs].sort())
  expect(report.sandboxLauncherProblems).toEqual([])
  for (const [index, run] of runs.entries()) {
    expect(t.api.getRecord(run)?.data).toMatchObject({
      state: CRASHED, closedHow: THE_SWEEPS_CLOSE, closedAt: localStamp(NOW),
      closedBecause: `the process group ${pids[index]} of its sandbox launcher has ended, and nobody recorded how its command ended`,
    })
  }
})

it('says how the command ended from its exit code, its signal, and when nothing was recorded', () => {
  const at = '2026-11-21 16:08:08'
  const withCode = aRun(STILL_GOING_STATES[0], { commandEnded: { at, code: 7 } })
  const withSignal = aRun(STILL_GOING_STATES[1], { commandEnded: { at, signal: 'SIGTERM' } })
  const withNone = aRun()
  aLauncher(withCode, 52001)
  aLauncher(withSignal, 52002)
  aLauncher(withNone, 52003)
  processById.mockReturnValue(null)
  const report = pass()
  expect(report.sandboxLauncherRowsClosed.sort()).toEqual([withCode, withSignal, withNone].sort())
  expect(t.api.getRecord(withCode)?.data['closedBecause']).toBe(
    `the process group 52001 of its sandbox launcher has ended, and its command ended at ${at} with exit 7`)
  expect(t.api.getRecord(withSignal)?.data['closedBecause']).toBe(
    `the process group 52002 of its sandbox launcher has ended, and its command ended at ${at} with signal SIGTERM`)
  expect(t.api.getRecord(withNone)?.data['closedBecause']).toBe(
    'the process group 52003 of its sandbox launcher has ended, and nobody recorded how its command ended')
})

it('reads a launcher row that was given back, and closes the run when its group is gone', () => {
  const run = aRun()
  const launcher = aLauncher(run, 53001)
  resources.closeRowThatStoppedMatching(launcher, 'default', 'given back in the test', t.api.HUMAN)
  processById.mockReturnValue(null)
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([run])
  expect(t.api.getRecord(run)?.data).toMatchObject({ state: CRASHED, closedHow: THE_SWEEPS_CLOSE })
})

it('leaves the run running while the leader is alive at the start time the row recorded', () => {
  const run = aRun()
  const startedAt = localStamp(NOW)
  aLauncher(run, 54001, startedAt)
  processById.mockReturnValue(aProcessAt(54001, startedAt))
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  expect(report.sandboxLauncherProblems).toEqual([])
  stillGoing(run)
})

it('leaves the run running while another process of its launcher group runs on after the leader', () => {
  const run = aRun()
  aLauncher(run, 55001)
  processById.mockReturnValue(null)
  processesInGroup.mockImplementation(pgid => pgid === 55001
    ? [aProcessAt(55002, localStamp(NOW), 55001)]
    : [])
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  expect(report.sandboxLauncherProblems).toEqual([])
  stillGoing(run)
})

it('closes the run when the pid was given to a later process and the group is empty', () => {
  const run = aRun()
  aLauncher(run, 56001, localStamp(new Date('2026-11-21T18:00:00Z')))
  processById.mockReturnValue(aProcessAt(56001, localStamp(new Date('2026-11-21T19:00:00Z'))))
  processesInGroup.mockReturnValue([])
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([run])
  expect(t.api.getRecord(run)?.data).toMatchObject({ state: CRASHED, closedHow: THE_SWEEPS_CLOSE })
  expect(String(t.api.getRecord(run)?.data['closedBecause'])).toContain('56001')
})

it('leaves the run running when an older launcher is gone and a newer one is alive', () => {
  const run = aRun()
  aLauncher(run, 57001, localStamp(new Date('2026-11-21T18:00:00Z')))
  const newerStartedAt = localStamp(new Date('2026-11-21T19:00:00Z'))
  aLauncher(run, 57002, newerStartedAt)
  processById.mockImplementation(pid => pid === 57002 ? aProcessAt(57002, newerStartedAt) : null)
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  expect(report.sandboxLauncherProblems).toEqual([])
  stillGoing(run)
})

it('leaves a run with no launcher row alone and names it, whether it has an unmarked process row or none', () => {
  const withoutRows = aRun()
  const withAnUnmarkedRow = aRun()
  anUnmarkedProcess(withAnUnmarkedRow, 58002)
  processById.mockReturnValue(null)
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  stillGoing(withoutRows)
  stillGoing(withAnUnmarkedRow)
  expect(report.sandboxLauncherProblems.join('; ')).toContain(withoutRows)
  expect(report.sandboxLauncherProblems.join('; ')).toContain(withAnUnmarkedRow)
  expect(report.sandboxLauncherProblems.join('; ')).toContain('no process row its launcher registered')
})

it('leaves the run running and says the reading failed when the process cannot be read', () => {
  const run = aRun()
  aLauncher(run, 59001)
  processById.mockImplementation(() => { throw new Error('the process table could not be read') })
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  stillGoing(run)
  expect(report.sandboxLauncherProblems.join('; ')).toContain('the process table could not be read')
})

it('leaves a run on another computer alone and never asks about its pid', () => {
  const run = aRun(STILL_GOING_STATES[0], { machine: 'another-test-computer' })
  aLauncher(run, 60001)
  processById.mockClear()
  processById.mockReturnValue(null)
  const report = pass()
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  expect(report.sandboxLauncherProblems).toEqual([])
  stillGoing(run)
  expect(processById).not.toHaveBeenCalledWith(60001)
})

it('lets the container closer close a run on a stopped container and keeps it out of the launcher ids', () => {
  const run = aRun()
  aLauncher(run, 61001)
  processById.mockReturnValue(null)
  runningContainers = []
  containerState.mockReturnValue({ ok: true, state: 'stopped', exitCode: 0, finishedAt: FINISHED })
  const report = pass()
  expect(report.sandboxContainerRowsClosed).toEqual([run])
  expect(report.sandboxLauncherRowsClosed).toEqual([])
  expect(report.sandboxLauncherProblems).toEqual([])
  expect(t.api.getRecord(run)?.data).toMatchObject({ state: CRASHED })
  expect(String(t.api.getRecord(run)?.data['closedBecause'])).toContain('sandbox container')
})

it('sends no signal while closing a run whose launcher group is gone', () => {
  const run = aRun()
  aLauncher(run, 62001)
  processById.mockReturnValue(null)
  expect(pass().sandboxLauncherRowsClosed).toEqual([run])
  expect(signal).not.toHaveBeenCalled()
})
