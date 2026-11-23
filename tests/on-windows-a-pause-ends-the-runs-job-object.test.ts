// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS, A PAUSE OR A STOP OF A RUN ENDS THE WHOLE JOB OBJECT THE RUN WAS STARTED IN, AND A RUN IS PAUSED ONLY ONCE
 * ITS PROGRAM IS READ GONE.
 *
 * On Windows this office starts a run through a starter (src/config/systems/windows-starts.mjs). The run's row records
 * the starter's pid, and group 0, as the Windows reader gives every process. The starter makes the Job Object named for
 * its own pid and starts the program in it. The starter ends when the message worker ends, and the program goes on. On
 * a Windows 11 machine, after "Pause them and shut down", a run was written paused while its program ran for 71 seconds
 * more. The release had read the starter's pid gone and closed the row with nothing ended.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Through the office's own pause and the run's stop door, with a stand-in Windows machine. No PowerShell runs:
 *
 *   1. A run whose starter has ended, with its program in the starter's Job Object: the pause ends that Job Object with
 *      SIGKILL to the starter's group, after asking that the Job Object does not hold this server. The run is paused,
 *      and its row is closed.
 *   2. The same run whose program is still read in the Job Object at the first look after the end, and gone at the
 *      next: the release looks again, and the run is paused.
 *   3. A run whose program is still read alive after the end: it is not paused, the answer says it is still running,
 *      and the row stays open. The release looks at most three times.
 *   4. A run whose Job Object cannot be read after the end: it is not paused, the answer says it cannot be told, and
 *      the row stays open.
 *   5. A run whose starter still runs, with the starter's mark on its command line: the pause ends the starter's Job
 *      Object, and the run is paused.
 *   6. A release of a row whose Job Object cannot be read before any end: nothing is ended, the row stays open, and
 *      the answer says it cannot be told. It is never closed as gone.
 *   7. The run's stop door, for a run whose starter has ended: it ends the Job Object and does not say "ended
 *      already". When the program is still read alive after the end, the door says so, and the run is not written
 *      crashed.
 *   8. On Linux, the pause sends SIGTERM to the run's own process group, as it did before, and asks no Job Object.
 *
 * Only a walk on Windows proves that Windows ends every process in the Job Object. This file proves what the office
 * does with each reading.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_STARTERS_MARK } from '../src/config/systems/windows-starts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type PausingLib = typeof import('../src/server/lib/pausing.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type TheGroups = NonNullable<OsProbe['groups']>

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let pausing: PausingLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The stand-in server's own group on Linux, which nothing here may signal. */
const OWN_GROUP = 4_390_001

/**
 * WHAT THE JOB OBJECT HOLDS AFTER ITS END, on the stand-in machine:
 *   - `empties`: nothing, as Windows should leave it;
 *   - `empties on the second look`: the program is still read at the first look, and gone at the next;
 *   - `keeps`: the program, at every look;
 *   - `cannot be read`: the Job Object cannot be read.
 */
type AfterTheEnd = 'empties' | 'empties on the second look' | 'keeps' | 'cannot be read'

/** The stand-in machine: its processes, each starter's Job Object, and every end sent. */
const live = new Map<number, OsProcess>()
const jobObjects = new Map<number, OsProcess[]>()
const unreadable = new Set<number>()
const looksBeforeItEmpties = new Map<number, number>()
let afterTheEnd: AfterTheEnd = 'empties'
const ended: { group: number; signal: string }[] = []
/** Every look at a starter's Job Object after its end, by the starter's pid. */
const looksAfterTheEnd: number[] = []
/** Every question whether a Job Object holds a process, before an end. */
const holdsAsked: { group: number; pid: number }[] = []
let nextPid = 7_100_001

const THE_REASON = 'Windows refused access to the Job Object.'

/** The groups of the stand-in Windows machine: a Job Object never holds this server, and there is no stop pipe. */
function theStandInGroups(): TheGroups {
  return {
    gentleStop: null,
    askToStop: async () => {
      throw new Error("a run's program on Windows has no stop pipe, and this test never asks one")
    },
    jobObjects: {
      readHolds: async (group: number, pid: number) => {
        holdsAsked.push({ group, pid })
        return { holds: false, why: `the Job Object of group ${group} does not hold pid ${pid}` }
      },
    },
  } as unknown as TheGroups
}

/** A stand-in Windows machine. Its starter's Job Object is read through `programsOfAnEndedStarter`. */
function aWindowsMachine(): OsProbe {
  const nothing = (): never => {
    throw new Error('this stand-in machine is not asked this')
  }
  return {
    platform: 'win32',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: nothing,
    listeningPorts: () => [],
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: (group, signal) => {
      ended.push({ group, signal })
      live.delete(group)
      if (afterTheEnd === 'keeps') return
      if (afterTheEnd === 'cannot be read') {
        unreadable.add(group)
        return
      }
      looksBeforeItEmpties.set(group, afterTheEnd === 'empties on the second look' ? 1 : 0)
    },
    stopContainer: nothing,
    programsOfAnEndedStarter: (starter) => {
      if (ended.some((one) => one.group === starter)) looksAfterTheEnd.push(starter)
      if (unreadable.has(starter)) return { read: false, reason: THE_REASON }
      const looks = looksBeforeItEmpties.get(starter)
      if (looks === 0) jobObjects.delete(starter)
      if (looks !== undefined) looksBeforeItEmpties.set(starter, Math.max(0, looks - 1))
      return { read: true, programs: jobObjects.get(starter) ?? [] }
    },
    groups: theStandInGroups(),
  }
}

/** A stand-in Linux machine, as the other tests of a stop build it. */
function aLinuxMachine(): OsProbe {
  return {
    ...res.LINUX_PROBE,
    platform: 'linux',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((one) => one.pgid === pgid),
    processTable: () => ({ ok: true, processes: [...live.values()].map((one) => ({ pid: one.pid, command: one.command, cwd: null })) }),
    listeningPorts: () => [],
    ownProcessGroup: () => OWN_GROUP,
    killProcessGroup: (group, signal) => {
      ended.push({ group, signal })
      for (const one of [...live.values()]) if (one.pgid === group) live.delete(one.pid)
    },
  }
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value)
}

function asAgent(handle: string, key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

async function ask(url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  return { status: reply.statusCode, body: (reply.body === '' ? {} : reply.json()) as Record<string, unknown> }
}

function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

let starterKey = ''

/**
 * WHERE A RUN'S STARTER STANDS when the test begins: ended, with the program in its Job Object; or still running, with
 * the starter's mark on its command line.
 */
type TheStarter = 'ended' | 'running'

interface ARun {
  session: string
  row: string
  starter: number
}

/** The row of a run, registered while its starter ran, as the message worker registers it. */
function theStartersRow(session: string, startedAt: string, platform: 'win32' | 'linux'): { row: string; starter: number } {
  const starter = nextPid
  nextPid += 2
  const command = platform === 'win32' ? `powershell.exe -EncodedCommand ${THE_STARTERS_MARK}AAAA` : 'claude --print a round of work'
  live.set(starter, { pid: starter, pgid: platform === 'win32' ? 0 : starter, ppid: 1, command, startedAt })
  res.useOsProbe(platform === 'win32' ? aWindowsMachine() : aLinuxMachine())
  const row = res.registerResource({
    workspaceId: 'default',
    sessionRecordId: session,
    type: 'process',
    key: String(starter),
    detail: 'a claude-code run answering a message',
    startedByTheProduct: true,
    actor: t.api.HUMAN,
  })
  return { row: row.id, starter }
}

/** The program a starter started, in its Job Object. */
function itsProgram(starter: number, startedAt: string): void {
  jobObjects.set(starter, [{ pid: starter + 1, pgid: 0, ppid: starter, command: 'node.exe stand-in-run.mjs', startedAt }])
}

/** A run the message worker started for an agent, at work on the stand-in Windows machine. */
function aRunAtWork(starterIs: TheStarter): ARun {
  const filed = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'a run the message worker started',
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      servingAgent: 'a-worker',
      servingAgentId: idOf('a-worker'),
      deliveringMessage: 'aMadeUpMessage',
      providerSession: 'a-made-up-conversation',
    },
    actor: t.api.HUMAN,
  })
  const { row, starter } = theStartersRow(filed.id, filed.createdAt, 'win32')
  itsProgram(starter, filed.createdAt)
  if (starterIs === 'ended') live.delete(starter)
  return { session: filed.id, row, starter }
}

function theRowIsOpen(row: string): boolean {
  return (t.client.sqlite.prepare('SELECT released_at AS at FROM session_resources WHERE id = ?').get(row) as { at: string | null }).at === null
}

function theRunsState(session: string): unknown {
  const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(session) as { data: string }).data) as Record<string, unknown>
  return data['state']
}

async function pauseIt(run: ARun): Promise<{ paused: boolean; outcome: string }> {
  const { paused } = await pausing.pauseTheRunsAtWork(t.api.HUMAN, 'a test pauses the office', 'pause')
  const mine = paused.find((one) => one.session === run.session)
  expect(mine, 'the pause did not list the run').toBeDefined()
  return { paused: mine!.paused, outcome: mine!.outcome }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  pausing = await import('../src/server/lib/pausing.ts')
  starterKey = await register('the-starter', AS_THE_PERSON, 'supervisor')
  await register('a-worker', asAgent('the-starter', starterKey))
}, 60_000)

beforeEach(() => {
  live.clear()
  jobObjects.clear()
  unreadable.clear()
  looksBeforeItEmpties.clear()
  afterTheEnd = 'empties'
  ended.length = 0
  looksAfterTheEnd.length = 0
  holdsAsked.length = 0
})

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe("the office's pause of a run on Windows", () => {
  it("1: ends the ended starter's Job Object, and the run is paused once its program is read gone", async () => {
    const run = aRunAtWork('ended')
    const answer = await pauseIt(run)
    expect(holdsAsked).toEqual([{ group: run.starter, pid: process.pid }])
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(answer.paused, answer.outcome).toBe(true)
    expect(theRunsState(run.session)).toBe('paused')
    expect(theRowIsOpen(run.row)).toBe(false)
  })

  it('2: looks again when the program is still read at the first look, and pauses the run once it is gone', async () => {
    const run = aRunAtWork('ended')
    afterTheEnd = 'empties on the second look'
    const answer = await pauseIt(run)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(looksAfterTheEnd).toEqual([run.starter, run.starter])
    expect(answer.paused, answer.outcome).toBe(true)
    expect(theRunsState(run.session)).toBe('paused')
  })

  it('3: does not pause a run whose program is still read alive after the end, and says it is still running', async () => {
    const run = aRunAtWork('ended')
    afterTheEnd = 'keeps'
    const answer = await pauseIt(run)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(answer.paused).toBe(false)
    expect(answer.outcome).toContain('its program is still running after it')
    expect(answer.outcome).toContain('The row is left open.')
    expect(theRunsState(run.session)).toBe('running')
    expect(theRowIsOpen(run.row)).toBe(true)
    expect(looksAfterTheEnd.length).toBeGreaterThanOrEqual(1)
    expect(looksAfterTheEnd.length).toBeLessThanOrEqual(3)
  })

  it('4: does not pause a run whose Job Object cannot be read after the end, and says it cannot be told', async () => {
    const run = aRunAtWork('ended')
    afterTheEnd = 'cannot be read'
    const answer = await pauseIt(run)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(answer.paused).toBe(false)
    expect(answer.outcome).toContain('Whether it has stopped cannot be told, so it is not paused.')
    expect(answer.outcome).toContain(THE_REASON)
    expect(theRunsState(run.session)).toBe('running')
    expect(theRowIsOpen(run.row)).toBe(true)
  })

  it("5: ends the Job Object of a starter that still runs, with the starter's mark, and pauses the run", async () => {
    const run = aRunAtWork('running')
    const answer = await pauseIt(run)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(answer.paused, answer.outcome).toBe(true)
    expect(theRunsState(run.session)).toBe('paused')
  })
})

describe('a release on Windows whose reading cannot tell', () => {
  it('6: ends nothing, leaves the row open and says it cannot be told, so the row is never closed as gone', async () => {
    const run = aRunAtWork('ended')
    unreadable.add(run.starter)
    const released = await res.releaseResource(run.row, { actor: t.api.HUMAN, force: true }, 'default')
    expect(ended).toEqual([])
    expect(released.acted).toBe(false)
    expect(released.stillAlive).toBe('unknown')
    expect(released.outcome).toContain('cannot be told')
    expect(released.outcome).toContain(THE_REASON)
    expect(theRowIsOpen(run.row)).toBe(true)
  })
})

describe("the run's stop door on Windows", () => {
  /** A worker's run filed by its starter's key, so the starter may stop it through its door. */
  async function aWorkersRun(): Promise<ARun> {
    const filed = await ask('/api/records', asAgent('the-starter', starterKey), {
      kind: 'session',
      title: 'a-worker at work',
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-worker'), servingAgent: 'a-worker' },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    const session = String((filed.body['record'] as { id?: string } | undefined)?.id ?? '')
    const createdAt = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(session) as { at: string }).at
    const { row, starter } = theStartersRow(session, createdAt, 'win32')
    itsProgram(starter, createdAt)
    live.delete(starter)
    return { session, row, starter }
  }

  it('7: ends the Job Object of a run whose starter has ended, and does not say it ended already', async () => {
    const run = await aWorkersRun()
    const stop = await ask(`/api/runtime/runs/${run.session}/stop`, asAgent('the-starter', starterKey), { why: 'it will not stop' })
    expect(stop.status, said(stop.body)).toBe(200)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(stop.body['stopped']).toBe(true)
    expect(stop.body['stillAlive']).toBe(false)
    expect(String(stop.body['outcome'])).toContain(`The Job Object of group ${run.starter} was ended at once`)
    expect(JSON.stringify(stop.body)).not.toContain('ended already')
    expect(theRowIsOpen(run.row)).toBe(false)
  })

  it('7: says a run whose program is still read alive after the end is still running, and does not write it crashed', async () => {
    const run = await aWorkersRun()
    afterTheEnd = 'keeps'
    const stop = await ask(`/api/runtime/runs/${run.session}/stop`, asAgent('the-starter', starterKey), { why: 'it will not stop' })
    expect(stop.status, said(stop.body)).toBe(200)
    expect(ended).toEqual([{ group: run.starter, signal: 'SIGKILL' }])
    expect(stop.body['stillAlive']).toBe(true)
    expect(String(stop.body['outcome'])).toContain('its program is still running after it')
    expect(JSON.stringify(stop.body)).not.toContain('ended already')
    expect(theRunsState(run.session)).toBe('running')
    expect(theRowIsOpen(run.row)).toBe(true)
  })
})

describe('the pause on Linux', () => {
  it("8: sends SIGTERM to the run's own process group, as before, and asks no Job Object", async () => {
    const filed = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run the message worker started on Linux',
      data: {
        state: 'running',
        runtime: 'claude-code',
        startedByMoleOffice: true,
        servingAgent: 'a-worker',
        servingAgentId: idOf('a-worker'),
        deliveringMessage: 'aMadeUpMessage',
      },
      actor: t.api.HUMAN,
    })
    const { starter } = theStartersRow(filed.id, filed.createdAt, 'linux')
    const answer = await pauseIt({ session: filed.id, row: '', starter })
    expect(ended).toEqual([{ group: starter, signal: 'SIGTERM' }])
    expect(holdsAsked).toEqual([])
    expect(answer.paused, answer.outcome).toBe(true)
  })
})
