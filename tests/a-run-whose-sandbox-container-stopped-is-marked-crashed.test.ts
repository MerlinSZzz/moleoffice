// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WHOSE SANDBOX CONTAINER HAS STOPPED IS MARKED CRASHED BY THE MINUTE PASS.
 *
 * On 15 October 2026 a line sandbox container ended with exit 0, and the run working in it stayed "running" for six
 * hours with no process. The minute pass now asks docker about the container a still-going run names in
 * `data.sandbox.container`. A stopped container marks the run crashed with the container's exit code and finish time.
 * A container docker no longer has marks it crashed with no exit code. Docker that cannot answer writes nothing on the
 * run, and the pass's report says why. A run on another computer is not asked about, because this computer's docker
 * knows nothing of that computer's containers.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first. Make closeTheRunsWhoseSandboxContainerStopped in
 * src/server/lib/own-rows.ts leave the run running (no patch) and the cases that expect a crashed run go red. Take its
 * theRowNamesAnotherMachine check out and the other-computer case goes red.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { STILL_GOING_STATES, saysStillGoing } from '../src/config/still-going.mjs'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import type { OsContainerState, OsProcess } from '../src/server/lib/resources.ts'

let t: TestDb
let folder: string
let resources: typeof import('../src/server/lib/resources.ts')
let reminders: typeof import('../src/server/lib/reminders.ts')
const containers = vi.fn()
const containerState = vi.fn<(name: string) => OsContainerState>()
const processById = vi.fn<(pid: number) => OsProcess | null>()
const signal = vi.fn()
const NAME = 'mole-office-sandbox-test-line'
const FINISHED = '2026-10-15T05:22:00.123456789Z'
const NOW = new Date('2026-10-15T11:22:00Z')

let madeRuns: string[] = []

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-stopped-container-'))
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
  containers.mockReset().mockReturnValue({ available: true, containers: [] })
  containerState.mockReset().mockReturnValue({ ok: true, state: 'stopped', exitCode: 0, finishedAt: FINISHED })
  processById.mockReset().mockReturnValue(null)
  signal.mockReset().mockImplementation(() => { throw new Error('this check must never send a signal') })
  resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers, containerState, processById, killProcessGroup: signal,
  }))
})

afterEach(() => {
  // THE MINUTE PASS READS EVERY PROJECT, so a run this case left still going would be read by the next
  // case's pass. Ending it here leaves the office as this case found it.
  for (const run of madeRuns) {
    const row = t.api.getRecord(run)
    if (row !== null && saysStillGoing(row.data['state'])) {
      t.api.patchRecord(run, { dataPatch: { state: 'crashed' } }, t.api.HUMAN)
    }
  }
  resources?.useOsProbe(resources.LINUX_PROBE)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function aRun(state: string = STILL_GOING_STATES[0], workspaceId = 'default', more: Record<string, unknown> = {}): string {
  const id = t.api.createRecord({ workspaceId, kind: 'session', title: 'A sandbox test run',
    data: { state, workingDirectory: folder, lastOutputAt: localStamp(new Date()), ...more }, actor: t.api.HUMAN }).id
  madeRuns.push(id)
  return id
}

function aContainer(run: string): string {
  return resources.registerResource({ workspaceId: 'default', sessionRecordId: run,
    type: 'container', key: NAME, actor: t.api.HUMAN }).id
}

function inTheContainer(run: string, container: string): void {
  t.api.patchRecord(run, { dataPatch: { sandbox: { container } } }, t.api.HUMAN)
}

function pass() {
  return reminders.sendTheRemindersThatAreDue('default', NOW, NOW, folder)
}

function stillGoing(run: string): void {
  expect(t.api.getRecord(run)?.data['state']).toBe(STILL_GOING_STATES[0])
  expect(t.api.getRecord(run)?.data['closedBecause']).toBeUndefined()
}

it('marks every still-going run on a stopped container crashed and closes its gone process rows', () => {
  const runs = STILL_GOING_STATES.map(state => aRun(state))
  const container = aContainer(runs[0]!)
  for (const run of runs) inTheContainer(run, container)
  const processes = runs.map((run, index) => {
    const pid = 41000 + index
    processById.mockReturnValue({ pid, pgid: pid, ppid: 1, command: 'synthetic worker', startedAt: localStamp(NOW) })
    return resources.registerResource({ workspaceId: 'default', sessionRecordId: run,
      type: 'process', key: String(pid), actor: t.api.HUMAN }).id
  })
  processById.mockReturnValue(null)
  const report = pass()
  expect(report.sandboxContainerRowsClosed.sort()).toEqual(runs.sort())
  expect(report.sandboxContainerProblems).toEqual([])
  for (const run of runs) {
    expect(t.api.getRecord(run)?.data).toMatchObject({
      state: 'crashed', closedHow: 'went-stale', closedAt: localStamp(NOW),
      closedBecause: `its sandbox container ${NAME} stopped at ${localStamp(new Date(FINISHED))} with exit 0`,
    })
  }
  for (const id of processes) {
    const row = t.client.sqlite.prepare('SELECT released_at, released_by FROM session_resources WHERE id = ?')
      .get(id) as { released_at: string | null; released_by: string }
    expect(row.released_at).not.toBeNull()
    expect(row.released_by).toBe(`system:${theOfficesOwnId(t)}`)
  }
  expect(containers).toHaveBeenCalledTimes(1)
  expect(containerState).toHaveBeenCalledExactlyOnceWith(NAME)
  expect(signal).not.toHaveBeenCalled()
})

it('reads a released container row and says when docker no longer has the container without inventing an exit code', () => {
  const run = aRun()
  const container = aContainer(run)
  inTheContainer(run, container)
  resources.closeRowThatStoppedMatching(container, 'default', 'the container was removed', t.api.HUMAN)
  containerState.mockReturnValue({ ok: true, state: 'gone' })
  expect(pass().sandboxContainerRowsClosed).toEqual([run])
  const data = t.api.getRecord(run)!.data
  expect(data['state']).toBe('crashed')
  expect(data['closedBecause']).toBe(`docker no longer has its sandbox container ${NAME}, so how it ended is not known`)
  expect(String(data['closedBecause'])).not.toMatch(/exit|code/)
})

it.each(['listing', 'inspection', 'missing method'])('leaves the run unchanged when docker cannot answer: %s', kind => {
  const run = aRun()
  inTheContainer(run, aContainer(run))
  if (kind === 'listing') containers.mockReturnValue({ available: false, reason: 'the docker daemon is down' })
  if (kind === 'inspection') containerState.mockReturnValue({ ok: false, reason: 'the docker daemon is down' })
  if (kind === 'missing method') resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers, containerState: undefined, processById,
  }))
  const report = pass()
  stillGoing(run)
  expect(report.sandboxContainerRowsClosed).toEqual([])
  expect(report.sandboxContainerProblems.join('; ')).toContain(kind === 'missing method' ? 'cannot inspect' : 'the docker daemon is down')
  if (kind === 'listing') expect(containerState).not.toHaveBeenCalled()
})

it('leaves a running container alone and never inspects it', () => {
  const run = aRun()
  inTheContainer(run, aContainer(run))
  containers.mockReturnValue({ available: true, containers: [{ id: 'synthetic-container', name: NAME, image: 'test', status: 'Up' }] })
  expect(pass().sandboxContainerRowsClosed).toEqual([])
  stillGoing(run)
  expect(containerState).not.toHaveBeenCalled()
})

it('leaves a container that started between the listing and inspection alone', () => {
  const run = aRun()
  inTheContainer(run, aContainer(run))
  containerState.mockReturnValue({ ok: true, state: 'running' })
  expect(pass().sandboxContainerRowsClosed).toEqual([])
  stillGoing(run)
})

it('asks docker nothing when no still-going run names a sandbox container', () => {
  const run = aRun()
  const ended = aRun('unknown')
  inTheContainer(ended, aContainer(run))
  expect(pass().sandboxContainerRowsClosed).toEqual([])
  stillGoing(run)
  expect(t.api.getRecord(ended)?.data['state']).toBe('unknown')
  expect(containers).not.toHaveBeenCalled()
  expect(containerState).not.toHaveBeenCalled()
})

it('leaves a run on another computer alone and asks this computer\'s docker nothing about it', () => {
  // A name this computer does not call itself, so the run is read as elsewhere.
  const run = aRun(STILL_GOING_STATES[0], 'default', { machine: 'another-test-computer' })
  inTheContainer(run, aContainer(run))
  const report = pass()
  stillGoing(run)
  expect(report.sandboxContainerRowsClosed).toEqual([])
  expect(report.sandboxContainerProblems).toEqual([])
  expect(containers).not.toHaveBeenCalled()
  expect(containerState).not.toHaveBeenCalled()
})

it('leaves a run with a missing container row alone and reports the missing row', () => {
  const run = aRun()
  inTheContainer(run, 'missing-container-row')
  const report = pass()
  stillGoing(run)
  expect(report.sandboxContainerProblems.join('; ')).toContain('no container row')
  expect(containers).not.toHaveBeenCalled()
})

it('shares one docker listing and inspection across every project in the minute pass', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const elsewhere = createWorkspace({ id: 'another-test-project', title: 'Another test project' })
  const first = aRun()
  const second = aRun(STILL_GOING_STATES[0], elsewhere.id)
  inTheContainer(first, aContainer(first))
  const otherContainer = resources.registerResource({ workspaceId: elsewhere.id, sessionRecordId: second,
    type: 'container', key: NAME, actor: t.api.HUMAN })
  inTheContainer(second, otherContainer.id)
  expect(pass().sandboxContainerRowsClosed.sort()).toEqual([first, second].sort())
  expect(containers).toHaveBeenCalledTimes(1)
  expect(containerState).toHaveBeenCalledTimes(1)
})

it('reads docker inspection strictly and distinguishes a missing container from a failed question', () => {
  const calls = join(folder, 'docker-arguments.json')
  const executable = join(folder, 'docker')
  vi.stubEnv('PATH', `${folder}:${process.env['PATH'] ?? ''}`)
  const answer = (stdout: string, stderr = '', code = 0) => {
    writeFileSync(executable, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)))\nprocess.stdout.write(${JSON.stringify(stdout)})\nprocess.stderr.write(${JSON.stringify(stderr)})\nprocess.exit(${code})\n`, { mode: 0o755 })
    return resources.LINUX_PROBE.containerState!(NAME)
  }
  expect(answer(`false\t0\t${FINISHED}\n`)).toEqual({ ok: true, state: 'stopped', exitCode: 0, finishedAt: FINISHED })
  expect(JSON.parse(readFileSync(calls, 'utf8'))).toEqual([
    'inspect', '--type', 'container', '--format', '{{.State.Running}}\t{{.State.ExitCode}}\t{{.State.FinishedAt}}', NAME,
  ])
  expect(answer(`true\t0\t0001-01-01T00:00:00Z\n`)).toEqual({ ok: true, state: 'running' })
  expect(answer('', `Error: No such container: ${NAME}`, 1)).toEqual({ ok: true, state: 'gone' })
  for (const [stdout, stderr, code] of [
    ['', 'Cannot connect to the Docker daemon', 1], ['', 'No such object: something else', 1],
    ['unreadable', '', 0], [`false\t0\tnot-a-time`, '', 0], [`false\t0\t${FINISHED}\textra`, '', 0],
    [`maybe\t0\t${FINISHED}`, '', 0], [`false\tno-code\t${FINISHED}`, '', 0],
  ] as const) {
    expect(answer(stdout, stderr, code)).toMatchObject({ ok: false, reason: expect.any(String) })
  }
})
