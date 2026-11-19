// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BOOKED RUN'S CHILDREN COUNT FOR ITS GPU BOOKING BY THEIR CGROUP.
 *
 * A booking names the process group of its program. A runner that starts its model workers in sessions of their
 * own (setsid) gives each worker a process group of its own, so a reading of the card found them in no booked
 * group and told the holder, and the owner, of a job with no booking during the booking that covered them. setsid
 * starts a new session and a new group but keeps the cgroup: the workers sit in the same systemd scope as the
 * booked group. So a GPU process counts for the booking whose booked group's cgroup is the process's own scope.
 * When that cgroup is the whole user slice, it says nothing about who started what, and the parent chain decides
 * instead: the process counts when the booked group is among its ancestors.
 *
 * These cases drive the real booking and reading doors on a fresh database with a fake process table and a fake
 * cgroup table.
 *
 * WHAT IS PROVED
 *   1. A worker the booked leader started under setsid, in the leader's scope, is not a job with no booking.
 *   2. The same when the worker's parent has exited and it was re-parented: the cgroup still says whose it is.
 *   3. A process in another scope during the booking is still a job with no booking, and its holder is told.
 *   4. When the booked group sits in the whole user slice, a descendant of the booked leader counts and an
 *      unrelated process in the same slice does not.
 *   5. A pid the booked leader had, used again by another program, makes nobody in that scope count, even on a
 *      read that settles nothing: the booked program is not the live one any more.
 *   6. The machine's own probe reads a process's cgroup v2 path from /proc, and answers null for a pid that is gone.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type Process = { pid: number; pgid: number | null; mib: number; who: { kind: 'host'; unit: string } }

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
let home: string
const live = new Map<number, OsProcess>()
/** Each fake process's cgroup v2 path, as /proc/<pid>/cgroup's "0::" line gives it. */
const cgroups = new Map<number, string>()

/** A process table the test changes between requests. It never signals anything. */
function fakeProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    cgroupOf: (pid: number) => cgroups.get(pid) ?? null,
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => { throw new Error('a booking never signals anything') },
    stopContainer: () => { throw new Error('this test stops nothing') },
  }
}

async function ask(path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: body === undefined && !path.includes('/cancel') ? 'GET' : 'POST', url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, by: Record<string, string>): Promise<void> {
  const answer = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea: [`src/${handle}`] })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

/** The messages to one participant, in the order written. */
function linesTo(to: { kind: string; id: string }): { body: string; saidInFull?: string }[] {
  const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY rowid").all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull?: string; to?: { kind: string; id: string }[] })
    .filter((m) => (m.to ?? []).some((one) => one.kind === to.kind && one.id === to.id))
}
const agentLines = () => linesTo({ kind: 'agent', id: idOf('wa1') })
const ownerLines = () => linesTo({ kind: 'person', id: THE_PERSON })

async function booked(): Promise<string> {
  const answer = await ask('/api/bookings', asAgent('wa1'), { resource: 'gpu', gib: 10, minutes: 60, purpose: 'a test run', start: 'now' })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return (answer.said['booking'] as { id: string }).id
}

const LEADER = 4300
/** A running program on the fake machine: a group leader, in the given cgroup. */
async function start(booking: string, cgroup: string): Promise<void> {
  live.set(LEADER, { pid: LEADER, pgid: LEADER, ppid: 1, command: 'test-run-4300', startedAt: '2026-10-08 10:00:00' })
  cgroups.set(LEADER, cgroup)
  expect((await ask(`/api/bookings/${booking}/program`, asAgent('wa1'), { pid: LEADER })).status).toBe(200)
}

/** A process the leader started in a session of its own (setsid): its own group, the parent and the cgroup given. */
function aChild(pid: number, ppid: number, cgroup: string): void {
  live.set(pid, { pid, pgid: pid, ppid, command: `worker-${pid}`, startedAt: '2026-10-08 10:01:00' })
  cgroups.set(pid, cgroup)
}

/** The processes on the card that GET /api/resources/gpu says no booking accounts for. */
async function withoutABooking(): Promise<number[]> {
  const view = await ask('/api/resources/gpu?secondLevel=show', AS_THE_PERSON)
  expect(view.status, JSON.stringify(view.said)).toBe(200)
  const second = view.said['secondLevel'] as { withoutABooking: { pid: number }[] } | undefined
  expect(second, 'the second level was not given').toBeDefined()
  return second!.withoutABooking.map((p) => p.pid).sort((a, b) => a - b)
}

/** The watcher hands in one reading through its real door. */
async function aReading(processes: Process[] = []): Promise<string[]> {
  const usedMiB = 900 + processes.reduce((sum, p) => sum + p.mib, 0)
  const read = await ask('/api/resources/gpu/reading', asAgent('quill'), { readAt: localStamp(new Date()), totalMiB: 16303, usedMiB, processes })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
  return read.said['settled'] as string[]
}

const SLICE = '/user.slice/user-1000.slice/user@1000.service'
const THE_SCOPE = 'tmux-spawn-booked-test.scope'
const IN_THE_SCOPE = `${SLICE}/app.slice/${THE_SCOPE}`
const ANOTHER_SCOPE = 'tmux-spawn-another-test.scope'
const host = (pid: number, mib: number, unit: string): Process => ({ pid, pgid: pid, mib, who: { kind: 'host', unit } })

beforeAll(async () => {
  home = aTestDatabaseFolder('gpu-cgroup-home')
  vi.stubEnv('HOME', home)
  // THE AGENT THAT HANDS IN THE READINGS IS THE GPU WATCHER. An office names it in a setting or by this line, and a
  // fresh database names nobody.
  vi.stubEnv('MOLE_OFFICE_GPU_WATCHER', 'quill')
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())
  await register('sec-a', 'supervisor', AS_THE_PERSON)
  expect((await ask('/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', asAgent('sec-a'))
  await register('quill', 'worker', AS_THE_PERSON)
  await aReading()
}, 300_000)

// SETTLED FIRST, THEN CANCELLED: with every fake process gone, a reading ends each booking whose program has ended, so
// a case that failed halfway, its booked pid used again, cannot leave a booking the next cleanup is refused to cancel.
afterEach(async () => {
  live.clear()
  cgroups.clear()
  await aReading()
  const left = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')").all() as { id: string }[]
  for (const one of left) expect((await ask(`/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
})

afterAll(async () => {
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
  vi.unstubAllEnvs()
  removeThisTestFolder(home)
})

describe("a booked run's children count for its GPU booking by their cgroup", () => {
  it('(1) counts a worker the booked leader started under setsid in its own scope, and tells nobody', async () => {
    const booking = await booked()
    await start(booking, IN_THE_SCOPE)
    aChild(4310, LEADER, IN_THE_SCOPE)
    const before = { holder: agentLines().length, owner: ownerLines().length }
    const told = await aReading([host(4310, 5120, THE_SCOPE)])
    expect(told).toEqual([])
    expect(agentLines().slice(before.holder)).toEqual([])
    expect(ownerLines().slice(before.owner)).toEqual([])
    expect(await withoutABooking()).toEqual([])
  })

  it('(2) still counts it after its parent has exited and it was re-parented', async () => {
    const booking = await booked()
    await start(booking, IN_THE_SCOPE)
    aChild(4311, 1, IN_THE_SCOPE)
    const told = await aReading([host(4311, 5120, THE_SCOPE)])
    expect(told).toEqual([])
    expect(await withoutABooking()).toEqual([])
  })

  it('(3) tells the holder of a process in another scope during the booking, as before', async () => {
    const booking = await booked()
    await start(booking, IN_THE_SCOPE)
    aChild(5000, 1, `${SLICE}/app.slice/${ANOTHER_SCOPE}`)
    const before = agentLines().length
    const told = await aReading([host(5000, 5120, ANOTHER_SCOPE)])
    // The booking still fits beside it, so the holder gets the quiet line; that the holder is told is what counts here.
    expect(agentLines().slice(before)).toHaveLength(1)
    expect(told).toEqual([`Host service ${ANOTHER_SCOPE} (5 GiB) is on the card with no booking during booking ${booking}: its holder was told.`])
    expect(await withoutABooking()).toEqual([5000])
  })

  it('(4) in the whole user slice, counts a descendant of the booked leader and not an unrelated process', async () => {
    const booking = await booked()
    await start(booking, SLICE)
    aChild(4320, LEADER, SLICE)
    aChild(4321, 4320, SLICE)
    aChild(6000, 1, SLICE)
    const told = await aReading([host(4321, 1024, 'user@1000.service'), host(6000, 5120, 'user@1000.service')])
    expect(await withoutABooking()).toEqual([6000])
    expect(told).toHaveLength(1)
  })

  it('(5) counts nobody in the scope once the booked pid belongs to another program, on a read that settles nothing', async () => {
    const booking = await booked()
    await start(booking, IN_THE_SCOPE)
    aChild(4310, LEADER, IN_THE_SCOPE)
    expect(await aReading([host(4310, 5120, THE_SCOPE)])).toEqual([])
    // The leader's pid is used again by a program that started later, in the same scope. GET reads and writes nothing,
    // so the booking is not settled first; the child must still not count for it.
    live.set(LEADER, { pid: LEADER, pgid: LEADER, ppid: 1, command: 'another-program', startedAt: '2026-10-08 11:00:00' })
    expect(await withoutABooking()).toEqual([4310])
    // The next reading settles it: the booking ends with its program, as the watcher's next tick would make it.
    await aReading()
    const state = t.client.sqlite.prepare("SELECT json_extract(data, '$.state') AS state FROM records WHERE id = ?").get(booking) as { state: string }
    expect(state.state).not.toBe('running')
  })

  it("(6) reads this process's cgroup v2 path through the machine's own probe, and null for a pid that is gone", () => {
    const own = res.LINUX_PROBE.cgroupOf?.(process.pid)
    expect(typeof own, 'the Linux probe gave no cgroup for this process').toBe('string')
    expect(own!.startsWith('/')).toBe(true)
    expect(res.LINUX_PROBE.cgroupOf?.(2 ** 22 + 7)).toBeNull()
  })
})
