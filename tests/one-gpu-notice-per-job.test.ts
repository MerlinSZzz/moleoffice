// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE GPU NOTICE FOR EACH JOB WITH NO BOOKING.
 *
 * One watcher pass saw two pids of one host scope during a booking. The owner and the holder each got
 * two notices. These cases drive the real booking doors on a fresh database with a fake process table.
 * They pin one notice with the job's summed memory, no new notice for its later pid, and one notice
 * for each of two different scopes. Their mutations are per-pid job keys, recording told by pid,
 * and grouping every job of a booking together.
 *
 * THE OWNER IS TOLD ONLY WHEN ASKING FOR IT: at the default only the holder hears of a job with
 * no booking; with the setting on, the owner is told once for each job beside the holder, as before. Mutations: the
 * owner told whatever the setting says turns the default case red; the owner never told turns the setting case red.
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

/** A process table the test changes between requests. It never signals anything. */
function fakeProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
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

/** A running program on the fake machine: a group leader. */
async function start(booking: string): Promise<void> {
  const pid = 4300
  live.set(pid, { pid, pgid: pid, ppid: 1, command: 'test-run-4300', startedAt: '2026-10-08 10:00:00' })
  expect((await ask(`/api/bookings/${booking}/program`, asAgent('wa1'), { pid })).status).toBe(200)
}

/** The watcher hands in one reading through its real door. */
async function aReading(processes: Process[] = []): Promise<string[]> {
  const usedMiB = 900 + processes.reduce((sum, p) => sum + p.mib, 0)
  const read = await ask('/api/resources/gpu/reading', asAgent('quill'), { readAt: localStamp(new Date()), totalMiB: 16303, usedMiB, processes })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
  return read.said['settled'] as string[]
}

const THE_SCOPE = 'tmux-spawn-a6e25d21-test.scope'
const host = (pid: number, mib: number, unit = THE_SCOPE): Process => ({ pid, pgid: pid, mib, who: { kind: 'host', unit } })
const twoPids = () => [host(7777, 512), host(8888, 5120)]

beforeAll(async () => {
  home = aTestDatabaseFolder('gpu-notice-home')
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

afterEach(async () => {
  const left = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')").all() as { id: string }[]
  for (const one of left) expect((await ask(`/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
  await aReading()
})

afterAll(async () => {
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
  vi.unstubAllEnvs()
  removeThisTestFolder(home)
})

describe('one GPU notice for each job with no booking', () => {
  // One watcher pass saw two pids of one host scope during a booking.
  it('tells the holder once for two pids of one scope, with their summed GiB, and the owner nothing at the default', async () => {
    const booking = await booked()
    await start(booking)
    const before = { holder: agentLines().length, owner: ownerLines().length }
    const told = await aReading(twoPids())
    const holder = agentLines().slice(before.holder)
    expect(holder.map((m) => m.body)).toEqual(['A job with no booking leaves no room on the GPU'])
    expect(ownerLines().slice(before.owner), 'the owner was told without asking').toEqual([])
    const job = `Host service ${THE_SCOPE} (5.5 GiB)`
    expect(holder[0]!.saidInFull).toBe(`${job} is on the card with no booking, during your GPU booking ${booking}. With it there, the card has room for 9 GiB, and 10 GiB is booked now. Nothing was stopped.`)
    expect(told).toEqual([`${job} is on the card with no booking during booking ${booking}: its holder was told.`])
  })

  it('tells the owner once too, beside the holder, when the setting asks for it', async () => {
    const was = process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS']
    process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS'] = '1'
    try {
      const booking = await booked()
      await start(booking)
      const before = { holder: agentLines().length, owner: ownerLines().length }
      await aReading(twoPids())
      const owner = ownerLines().slice(before.owner)
      expect(agentLines().slice(before.holder).map((m) => m.body)).toEqual(['A job with no booking leaves no room on the GPU'])
      expect(owner.map((m) => m.body), 'the owner asked and was not told').toEqual(['A job with no booking leaves no room on the GPU'])
      const job = `Host service ${THE_SCOPE} (5.5 GiB)`
      expect(owner[0]!.saidInFull).toBe(`${job} is on the card with no booking, during wa1's GPU booking. With it there, the card has room for 9 GiB, and 10 GiB is booked now. Nothing was stopped. It is on the Resources page.`)
    } finally {
      if (was === undefined) delete process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS']
      else process.env['MOLE_OFFICE_TELL_THE_OWNER_OF_UNBOOKED_GPU_JOBS'] = was
    }
  })

  it('tells nobody again when a third pid of the same scope appears in a later pass', async () => {
    const booking = await booked()
    await start(booking)
    await aReading(twoPids())
    const before = { holder: agentLines().length, owner: ownerLines().length }
    const told = await aReading([...twoPids(), host(9999, 1024)])
    expect(agentLines().slice(before.holder)).toEqual([])
    expect(ownerLines().slice(before.owner)).toEqual([])
    expect(told).toEqual([])
  })

  it('tells the holder once for each of two different scopes in one pass', async () => {
    const booking = await booked()
    await start(booking)
    const before = agentLines().length
    const other = 'tmux-spawn-another-test.scope'
    const told = await aReading([host(7777, 512), host(8888, 5120, other)])
    const holder = agentLines().slice(before)
    expect(holder.map((m) => m.body)).toEqual(['A job with no booking leaves no room on the GPU', 'A job with no booking leaves no room on the GPU'])
    expect(holder.map((m) => m.saidInFull)).toEqual([
      `Host service ${THE_SCOPE} (0.5 GiB) is on the card with no booking, during your GPU booking ${booking}. With it there, the card has room for 9 GiB, and 10 GiB is booked now. Nothing was stopped.`,
      `Host service ${other} (5 GiB) is on the card with no booking, during your GPU booking ${booking}. With it there, the card has room for 9 GiB, and 10 GiB is booked now. Nothing was stopped.`,
    ])
    expect(told).toHaveLength(2)
  })
})
