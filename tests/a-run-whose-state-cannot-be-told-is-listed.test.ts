// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN WHOSE STATE CANNOT BE TOLD IS LISTED AMONG THE RUNS A PAUSE WOULD PAUSE, WITH ITS STATE AS NOT KNOWN, AND THE
 * PAUSE NEVER SAYS IT HAD ALREADY ENDED.
 *
 * On Windows a run's row records the pid of the starter that started it. The starter ends when the message worker ends,
 * and the program goes on in the starter's Job Object. When that Job Object cannot be read, the row's reading cannot tell
 * whether the program still runs. The list of runs a pause would pause used to leave such a run out, and the pause's
 * answer named neither the run nor why. A run whose reading turned so between the list and the pause was said to have
 * already ended.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * With a stand-in Windows machine, as tests/on-windows-a-pause-ends-the-runs-job-object.test.ts builds it. No
 * PowerShell runs, and nothing here runs on Windows:
 *
 *   1. A run whose starter has ended and whose Job Object cannot be read is in the list, among the runs a pause would
 *      pause, with its state as not known. The list's door says the same.
 *   2. The pause sends it to the release. Nothing is ended, it is not written paused, its row stays open, and its answer
 *      says its state could not be told. It is not said to have already ended.
 *   3. A run read running when the list is read, whose Job Object cannot be read by the time the pause reads it, is not
 *      said to have already ended either. Its answer says its state could not be told.
 *   4. A run read running is listed with its state as running, and in the words it had before. A run read gone is not
 *      listed.
 *   5. A run whose row has no start time, and whose pid is in use, is not known either. Its release refuses to signal
 *      it. The pause does not write it paused, its answer gives the refusal, and the pause goes on with the others.
 *
 * Only a walk on Windows proves what Windows answers. This file proves what the office does with each reading.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_STARTERS_MARK } from '../src/config/systems/windows-starts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ALiveRun, TheLiveRunsReading } from '../src/shared/shutting-down.ts'
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

/** The stand-in machine: its processes, each starter's Job Object, which Job Objects cannot be read, and every end. */
const live = new Map<number, OsProcess>()
const jobObjects = new Map<number, OsProcess[]>()
const unreadable = new Set<number>()
/** For a starter named here, how many more looks read its Job Object before it cannot be read. */
const readableLooksLeft = new Map<number, number>()
const ended: { group: number; signal: string }[] = []
let nextPid = 7_300_001

const THE_REASON = 'Windows refused access to the Job Object.'

/** The groups of the stand-in Windows machine: a Job Object never holds this server, and there is no stop pipe. */
function theStandInGroups(): TheGroups {
  return {
    gentleStop: null,
    askToStop: async () => {
      throw new Error("a run's program on Windows has no stop pipe, and this test never asks one")
    },
    jobObjects: {
      readHolds: async (group: number, pid: number) => ({ holds: false, why: `the Job Object of group ${group} does not hold pid ${pid}` }),
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
      jobObjects.delete(group)
    },
    stopContainer: nothing,
    programsOfAnEndedStarter: (starter) => {
      const left = readableLooksLeft.get(starter)
      if (left !== undefined) {
        if (left === 0) unreadable.add(starter)
        else readableLooksLeft.set(starter, left - 1)
      }
      if (unreadable.has(starter)) return { read: false, reason: THE_REASON }
      return { read: true, programs: jobObjects.get(starter) ?? [] }
    },
    groups: theStandInGroups(),
  }
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value)
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: (reply.body === '' ? {} : reply.json()) as Record<string, unknown> }
}

function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

interface ARun {
  session: string
  row: string
  starter: number
}

/**
 * A run the message worker started for an agent on the stand-in Windows machine. Its row was registered while its
 * starter ran, with the starter's mark on its command line. The starter has ended, and its program runs on in the
 * starter's Job Object.
 */
function aRunAtWork(): ARun {
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
  const starter = nextPid
  nextPid += 2
  live.set(starter, { pid: starter, pgid: 0, ppid: 1, command: `powershell.exe -EncodedCommand ${THE_STARTERS_MARK}AAAA`, startedAt: filed.createdAt })
  const row = res.registerResource({
    workspaceId: 'default',
    sessionRecordId: filed.id,
    type: 'process',
    key: String(starter),
    detail: 'a claude-code run answering a message',
    startedByTheProduct: true,
    actor: t.api.HUMAN,
  })
  jobObjects.set(starter, [{ pid: starter + 1, pgid: 0, ppid: starter, command: 'node.exe stand-in-run.mjs', startedAt: filed.createdAt }])
  live.delete(starter)
  return { session: filed.id, row: row.id, starter }
}

function theRowIsOpen(row: string): boolean {
  return (t.client.sqlite.prepare('SELECT released_at AS at FROM session_resources WHERE id = ?').get(row) as { at: string | null }).at === null
}

function theRunsState(session: string): unknown {
  const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(session) as { data: string }).data) as Record<string, unknown>
  return data['state']
}

function listed(session: string): ALiveRun | undefined {
  return pausing.theLiveRuns().pausable.find((one) => one.session === session)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  pausing = await import('../src/server/lib/pausing.ts')
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-worker', name: 'a-worker', runtime: 'claude-code' })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), 'the registration of a-worker answered no key').toBe(true)
}, 60_000)

beforeEach(() => {
  // A RUN OF AN EARLIER CASE READS GONE FROM HERE ON: its starter and its Job Object are gone from the stand-in machine.
  live.clear()
  jobObjects.clear()
  unreadable.clear()
  readableLooksLeft.clear()
  ended.length = 0
  res.useOsProbe(aWindowsMachine())
})

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a run whose Job Object cannot be read', () => {
  it('1: is listed among the runs a pause would pause, with its state as not known, and the door says so', async () => {
    const run = aRunAtWork()
    unreadable.add(run.starter)
    const one = listed(run.session)
    expect(one, 'the list left the run out').toBeDefined()
    expect(one!.pausable).toBe(true)
    expect(one!.state).toBe('not known')
    expect(one!.says).toContain('Whether it still runs cannot be told')
    expect(one!.says).toContain(THE_REASON)
    expect(one!.agent?.handle).toBe('a-worker')

    const door = await ask('GET', '/api/office/live-runs', AS_THE_PERSON)
    expect(door.status, said(door.body)).toBe(200)
    const reading = door.body as unknown as TheLiveRunsReading
    const onTheDoor = reading.pausable.find((each) => each.session === run.session)
    expect(onTheDoor, 'the door left the run out').toBeDefined()
    expect(onTheDoor!.state).toBe('not known')
    expect(reading.says).toContain('cannot be told.')
  })

  it('2: is sent to the release by the pause, is not written paused, and its answer says its state could not be told', async () => {
    const run = aRunAtWork()
    unreadable.add(run.starter)
    const { paused } = await pausing.pauseTheRunsAtWork(t.api.HUMAN, 'a test pauses the office', 'pause')
    const mine = paused.find((one) => one.session === run.session)
    expect(mine, 'the pause did not name the run').toBeDefined()
    expect(mine!.paused).toBe(false)
    expect(mine!.state).toBe('not known')
    expect(mine!.outcome).toContain('cannot be told, so it is not paused.')
    expect(mine!.outcome).toContain('Nothing was ended, and the row is left open')
    expect(mine!.outcome).toContain(THE_REASON)
    expect(mine!.outcome).not.toContain('already ended')
    expect(ended).toEqual([])
    expect(theRunsState(run.session)).toBe('running')
    expect(theRowIsOpen(run.row)).toBe(true)
  })
})

describe('a run whose reading turns not known between the list and the pause', () => {
  it('3: is not said to have already ended, and its answer says its state could not be told', async () => {
    const run = aRunAtWork()
    // The list's look reads the program in the Job Object. Every look after it cannot read the Job Object.
    readableLooksLeft.set(run.starter, 1)
    const { paused } = await pausing.pauseTheRunsAtWork(t.api.HUMAN, 'a test pauses the office', 'pause')
    const mine = paused.find((one) => one.session === run.session)
    expect(mine, 'the pause did not name the run').toBeDefined()
    expect(mine!.state, 'the list did not read the run running, so this case proves nothing').toBe('running')
    expect(mine!.paused).toBe(false)
    expect(mine!.outcome).toContain('cannot be told, so it is not paused.')
    expect(mine!.outcome).toContain(THE_REASON)
    expect(mine!.outcome).not.toContain('already ended')
    expect(ended).toEqual([])
    expect(theRunsState(run.session)).toBe('running')
    expect(theRowIsOpen(run.row)).toBe(true)
  })
})

describe('a run whose row has no start time and whose pid is in use', () => {
  it('5: is not paused, its answer gives the refusal of its release, and the pause goes on with the others', async () => {
    // A row restored from an archive carries no start time. Its pid is now held by a program the run did not start.
    const restored = aRunAtWork()
    t.client.sqlite.prepare('UPDATE session_resources SET os_started_at = NULL WHERE id = ?').run(restored.row)
    live.set(restored.starter, { pid: restored.starter, pgid: 0, ppid: 1, command: 'notepad.exe', startedAt: '2026-01-01 00:00:00' })
    const other = aRunAtWork()
    expect(listed(restored.session)?.state, 'the restored row is not read as not known, so this case proves nothing').toBe('not known')
    const { paused } = await pausing.pauseTheRunsAtWork(t.api.HUMAN, 'a test pauses the office', 'pause')
    const mine = paused.find((one) => one.session === restored.session)
    expect(mine, 'the pause did not name the run').toBeDefined()
    expect(mine!.paused).toBe(false)
    expect(mine!.outcome).toContain('cannot be told, so it is not paused.')
    expect(mine!.outcome).toContain('Refusing to signal anything.')
    expect(theRunsState(restored.session)).toBe('running')
    expect(theRowIsOpen(restored.row)).toBe(true)
    expect(paused.find((one) => one.session === other.session)?.paused, 'the pause did not go on to the other run').toBe(true)
    expect(ended).toEqual([{ group: other.starter, signal: 'SIGKILL' }])
  })
})

describe('a run read running or gone', () => {
  it('4: a run read running is listed as running, in the words it had before', () => {
    const run = aRunAtWork()
    const one = listed(run.session)
    expect(one, 'the list left the run out').toBeDefined()
    expect(one!.state).toBe('running')
    expect(one!.says).toBe('A shutdown pauses it and keeps its conversation, a-made-up-conversation.')
  })

  it('4: a run read gone is not listed', () => {
    const run = aRunAtWork()
    jobObjects.delete(run.starter)
    expect(listed(run.session)).toBeUndefined()
  })
})
