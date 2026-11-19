// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS, A RUN A RESTARTED WORKER PICKS UP IS WATCHED THROUGH ITS STARTER'S JOB OBJECT, AND ITS GROUP IS THE
 * STARTER'S.
 *
 * On Windows the worker starts a run through a starter (src/config/systems/windows-starts.mjs). The starter makes the
 * Job Object named for its own pid, starts the program in it and waits for it. The run's row records the starter's pid,
 * and group 0, because Windows has no process groups. The starter ends when the worker ends, and the program goes on.
 * On a Windows 11 machine (wave 13t, round W9, the fourth label) a run outlived its worker. The next worker picked it up
 * by the starter's pid, which had ended. So it read the run as ended at once, and marked it as crashed while its program
 * ran. It could not stop it either: it asked to end group 0, which the layer refuses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Through the worker's pickup (`pickUpRunsAlreadyGoing`), with a stand-in Windows whose PowerShell answers the reading
 * of the starter's Job Object, and real processes on this machine in place of the programs:
 *
 *   1. A run whose starter has ended is watched by the starter's child in the starter's Job Object. Its handle has the
 *      program's pid and start, and the starter's pid as its group. It reads as running while the program runs, and as
 *      ended once the program has ended. Its stop ends the starter's group, not group 0.
 *   2. The same while the starter still runs: the program is watched, and not the starter.
 *   3. A child that started a whole second before the starter's recorded start is the run's program. One that started
 *      more than a second before it is not. With no such child, or no Job Object, the starter is watched, with its own
 *      pid as its group, and a starter that has ended reads as ended.
 *   4. A check's handle, which carries the worker's own stamp of the start, carries the program's start in its place,
 *      so the program is told from a later process by its own start.
 *   5. A Job Object that cannot be read leaves the run where it is. It is not picked up, the worker's log says why
 *      once, and a later pass that can read it picks it up.
 *   6. On Linux a run is picked up as the server's list gives it.
 *
 * Nothing here runs PowerShell, and nothing here is proved on Windows.
 *
 * Mutations, in the commit message that added this file.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { WhatACommandDid } from '../src/config/process-reader.mjs'
import { startTimeOf } from '../src/config/session-process.mjs'
import * as theSystem from '../src/config/systems/the-system.mjs'
import { windowsGroups } from '../src/config/systems/windows-groups.mjs'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import { pickUpRunsAlreadyGoing, type WorkerSettings } from '../src/worker/index.ts'
import { endRun } from '../src/worker/runtimes/common.ts'

type Watching = Parameters<typeof pickUpRunsAlreadyGoing>[1]

const STARTER = 7100

let scratch: string
const started: ChildProcess[] = []
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-pickup-on-windows-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const child of started.splice(0)) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
})
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const settings = (): WorkerSettings => ({
  api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: scratch,
  runs: 1, hops: 3, outputRoot: scratch, env: { PATH: process.env['PATH'] },
})

/** A real process that waits, and its start as this machine's process table reads it. */
async function aProgram(): Promise<{ child: ChildProcess; pid: number; startedMs: number }> {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' })
  started.push(child)
  await new Promise((resolve, reject) => child.once('spawn', resolve).once('error', reject))
  const pid = child.pid as number
  const at = startTimeOf(pid)
  if (at === null) throw new Error(`The start of process ${String(pid)} could not be read.`)
  return { child, pid, startedMs: at.getTime() }
}

/** A real process that has ended, for a starter that has ended. */
async function anEndedProcess(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await new Promise((resolve) => child.once('exit', resolve))
  return child.pid as number
}

const theEnd = (child: ChildProcess) => new Promise((resolve) => {
  child.once('exit', resolve)
  child.kill('SIGKILL')
})

/** A row of the server's list of runs going, as `GET /api/worker/runs` gives it on Windows: the starter's pid, group 0. */
const aRunsRow = (session: string, pid: number, startedAt: string, runtime = 'claude-code') => ({
  session, messageId: `${session}-message`, agentId: 'made-up-agent', handle: 'made-up-agent', runtime, providerSession: null,
  pid, pgid: 0, startedAt, says: 'Made up: running.', startedBeforeThisServer: true, body: 'Made up.', sentAt: '2026-10-31 12:00:00',
  sentBy: null, routedLine: null,
})

/** Every request a pass makes, answered from `answers` by method and path, or with an empty object. */
function anOfficeStandIn(answers: Record<string, unknown>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const answer = answers[`${init?.method ?? 'GET'} ${new URL(url).pathname}`] ?? {}
    return new Response(JSON.stringify(answer), { status: 200 })
  })
}

const printed = (stdout: string): WhatACommandDid => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })

/** The Job Object reading's answer: the Job Object holds these pids, and these are the starter's children. */
const theJobObjectHolds = (starter: number, children: { pid: number; startedMs: number }[]) =>
  printed(
    `{"job":"there","pids":[${children.map((one) => one.pid).join(',')}]}\r\n` +
      `${JSON.stringify(children.map((one) => ({ ProcessId: one.pid, ParentProcessId: starter, CreationDate: one.startedMs, Name: 'node.exe', CommandLine: 'node.exe made-up-run.mjs' })))}\r\n`,
  )

/**
 * This machine, with the Windows groups in place of its own, over a stand-in PowerShell that answers each reading of a
 * Job Object with `answer`. Only that script is answered. Answers the scripts asked and the spy on the group signal.
 */
function aStandInWindows(answer: () => WhatACommandDid) {
  const scripts: string[] = []
  const powershell = (script: string): WhatACommandDid => {
    scripts.push(script)
    if (!script.includes('MoleOfficeJobList')) throw new Error(`this test does not answer that script: ${script.slice(0, 200)}`)
    return answer()
  }
  // The way that waits for PowerShell answers as the way that holds the thread does.
  const groups = windowsGroups({ powershell, startPowerShell: async (script: string) => powershell(script) })
  const signal = vi.spyOn(groups, 'signal').mockImplementation(() => undefined)
  vi.spyOn(theSystem, 'thisSystem').mockReturnValue({ ...theSystem.theSystemFor(process.platform), groups })
  return { scripts, signal }
}

async function pickUp(watching: Watching = []) {
  const took = await pickUpRunsAlreadyGoing(settings(), watching)
  return { took, watching }
}

describe('a run a restarted worker picks up on Windows', () => {
  it("1: whose starter has ended is watched by the program in the starter's Job Object, and its stop ends the starter's group", async () => {
    const starter = await anEndedProcess()
    const program = await aProgram()
    const { scripts, signal } = aStandInWindows(() => theJobObjectHolds(starter, [program]))
    anOfficeStandIn({ 'GET /api/worker/runs': { runs: [aRunsRow('made-up-run', starter, localStamp(new Date(program.startedMs - 500)))] } })

    const { took, watching } = await pickUp()
    expect(took).toEqual(['made-up-run'])
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain(`Local\\mole-office-group-${String(starter)}`)
    const [run] = watching
    expect(run!.handle).toMatchObject({ pid: program.pid, pgid: starter, startedAt: localStamp(new Date(program.startedMs)) })
    expect(run!.adapter.alive(run!.handle)).toBe(true)

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(endRun(run!.handle)).toBe(true)
    expect(signal.mock.calls).toEqual([[starter, 'SIGKILL']])

    await theEnd(program.child)
    expect(run!.adapter.alive(run!.handle)).toBe(false)
  })

  it('2: whose starter still runs is watched by the program, and not by the starter', async () => {
    const starter = await aProgram()
    const program = await aProgram()
    aStandInWindows(() => theJobObjectHolds(starter.pid, [program]))
    anOfficeStandIn({ 'GET /api/worker/runs': { runs: [aRunsRow('made-up-run', starter.pid, localStamp(new Date(starter.startedMs)))] } })

    const { watching } = await pickUp()
    expect(watching[0]!.handle).toMatchObject({ pid: program.pid, pgid: starter.pid })
    await theEnd(program.child)
    expect(watching[0]!.adapter.alive(watching[0]!.handle)).toBe(false)
  })

  it('3: takes a child a whole second older than the starter, not one older still, and else watches the starter in its own group', async () => {
    const starter = await anEndedProcess()
    const startedAt = '2026-10-31 12:00:10'
    const starterMs = new Date(2026, 9, 31, 12, 0, 10).getTime()
    const cases: [string, WhatACommandDid, number][] = [
      ['a child a whole second older', theJobObjectHolds(starter, [{ pid: 7201, startedMs: starterMs - 1000 }]), 7201],
      ['a child older than that, then one after', theJobObjectHolds(starter, [{ pid: 7202, startedMs: starterMs - 1001 }, { pid: 7203, startedMs: starterMs + 3000 }]), 7203],
      ['only a child older than that', theJobObjectHolds(starter, [{ pid: 7204, startedMs: starterMs - 1001 }]), starter],
      ['a Job Object with no child of the starter', theJobObjectHolds(starter, []), starter],
      ['no Job Object', printed('{"job":"missing"}\r\n'), starter],
    ]
    for (const [what, answer, watched] of cases) {
      vi.restoreAllMocks()
      aStandInWindows(() => answer)
      anOfficeStandIn({ 'GET /api/worker/runs': { runs: [aRunsRow('made-up-run', starter, startedAt)] } })
      const { watching } = await pickUp()
      expect(watching[0]?.handle, what).toMatchObject({ pid: watched, pgid: starter })
      if (watched === starter) {
        expect(watching[0]!.handle.startedAt, what).toBe(startedAt)
        expect(watching[0]!.adapter.alive(watching[0]!.handle), what).toBe(false)
      }
    }
  })

  it("4: a check's handle carries the program's start in place of the worker's stamp, and reads as running", async () => {
    const starter = await anEndedProcess()
    const program = await aProgram()
    aStandInWindows(() => theJobObjectHolds(starter, [program]))
    // A starter that took three seconds to start its program (made up): the worker stamped the start three seconds before it.
    const theWorkersStamp = clockStamp(() => new Date(program.startedMs - 3000))
    anOfficeStandIn({
      'GET /api/worker/runs': { runs: [aRunsRow('made-up-check', starter, theWorkersStamp.stamp, 'inspection-tool')] },
      'GET /api/records/made-up-check': { record: { data: { startedTime: theWorkersStamp, extra: { inspectionRun: 'made-up-inspection', inspectionMinutes: 5 } } } },
    })

    const { watching } = await pickUp()
    const handle = watching[0]!.handle
    expect(handle).toMatchObject({ pid: program.pid, pgid: starter })
    expect(Date.parse(handle.startedTime!.instant)).toBe(program.startedMs)
    expect(watching[0]!.adapter.alive(handle)).toBe(true)
  })

  it('5: is left where it is while its Job Object cannot be read, said once, and picked up once it can be', async () => {
    const starter = await anEndedProcess()
    const program = await aProgram()
    let answer = printed('{"job":"refused"}\r\n')
    aStandInWindows(() => answer)
    anOfficeStandIn({ 'GET /api/worker/runs': { runs: [aRunsRow('made-up-refused-run', starter, localStamp(new Date(program.startedMs)))] } })
    const written = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const watching: Watching = []
    expect((await pickUp(watching)).took).toEqual([])
    expect((await pickUp(watching)).took).toEqual([])
    expect(watching).toEqual([])
    const said = written.mock.calls.map(([text]) => String(text)).filter((text) => text.includes('made-up-refused-run'))
    expect(said).toHaveLength(1)
    expect(said[0]).toContain(`Local\\mole-office-group-${String(starter)}`)
    expect(said[0]).toContain('Windows refused access to it.')
    expect(said[0]).toContain('not picked up')

    answer = theJobObjectHolds(starter, [program])
    expect((await pickUp(watching)).took).toEqual(['made-up-refused-run'])
    expect(watching[0]!.handle).toMatchObject({ pid: program.pid, pgid: starter })
  })
})

describe('a run a restarted worker picks up on Linux', () => {
  it.skipIf(process.platform !== 'linux')("6: is picked up as the server's list gives it", async () => {
    const program = await aProgram()
    const startedAt = localStamp(new Date(program.startedMs))
    anOfficeStandIn({ 'GET /api/worker/runs': { runs: [{ ...aRunsRow('made-up-run', program.pid, startedAt), pgid: program.pid }] } })

    const { watching } = await pickUp()
    expect(watching[0]!.handle).toMatchObject({ pid: program.pid, pgid: program.pid, startedAt })
    expect(watching[0]!.adapter.alive(watching[0]!.handle)).toBe(true)
  })
})
