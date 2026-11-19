// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * BOOKINGS OF THE HOST GPU: THE LINE, THE OWNER'S PLACE AT THE FRONT, GOING FIRST, AND THE END.
 *
 * The design (report peyJSnLoz_Bk) was approved in a decision. The shapes were agreed in
 * messages L0ZsT2z9ZKQW, sw9PGUtZN72K and arDoBp0zwpvM. This file drives the real doors on a fresh office with a fake
 * process table, and pins seven rules:
 *
 *   1. a booking starts at the time asked even when the GiB booked go over the card, and both holders are
 *      reminded; one bigger than the card is taken too; "when-free" waits for the earliest time it fits;
 *   2. the owner's booking starts at the time it asks for, and the waiting booking beside it is not moved;
 *   3. "cutIn" is the owner's own press: without it nothing running is touched; "after" starts theirs when the running one
 *      ends; "now" tells the running holder it has the grace to stop;
 *   4. an agent's request to go first moves nothing until it is granted, and a grant moves nobody else;
 *   5. a secretary's grant counts only for its own agents;
 *   6. a clash between two secretaries' agents opens ONE group with the two agents and both secretaries;
 *   7. a running booking ends when its program's process group ends.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * ROUND 38 changed rules 1 to 4: no hard gate on GPU memory. The applicants of
 * rules 4 to 6 now book "when-free", so that they wait behind the booking they ask to go ahead of. That
 * round's control,
 * mutations and restore are in block r38 of report F8Js-ygh8Rix. The list below is the runs of the round that
 * wrote this file, against the rules as they were then.
 *
 * Each mutation is in src/server/lib/bookings.ts, and the file was restored byte-identical after each one
 * (sha256 checked before and after each). What went red, of seven:
 *   1. `earliestFit` returns `from` at once → rules 1–6 go red (every placement is at once).
 *   2. `book` treats the owner as an agent (`if (!owner)` → `if (true)`) → rules 2 and 3 go red.
 *   3. `pushLater` always sends `aBookingWasMoved` → rule 3 alone goes red: no grace line.
 *   4. `askToGoFirst` calls `applyTheGrant` as it asks → rules 4, 5 and 6 go red: the booking moved ungranted.
 *   5. `answerAGoFirst` lets any caller answer (the `secretaries` check removed) → rule 5 alone goes red.
 *   6. `whoMustGrant` answers `twoSecretaries: false` → rule 6 alone goes red: no group.
 *   7. `settle` skips a `gone` program → rule 7 alone goes red: the booking stays running.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { participantKey } from '../src/shared/messages.ts'
import { localStamp } from '../src/shared/time.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
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
    killProcessGroup: () => {
      throw new Error('a booking never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  }
}

interface Said {
  status: number
  said: Record<string, unknown>
}

async function ask(path: string, headers: Record<string, string>, body?: unknown): Promise<Said> {
  const reply = await app.inject({ method: body === undefined && !path.includes('/cancel') ? 'GET' : 'POST', url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, workArea: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

interface BookingOnTheWire {
  id: string
  data: { startsAt: string; endsAt: string; state: string; goFirst?: { state: string; secretaries: unknown[]; group?: string } }
}

async function book(by: Record<string, string>, gib: number, minutes: number, extra: Record<string, unknown> = {}): Promise<Said> {
  return ask('/api/bookings', by, { resource: 'gpu', gib, minutes, purpose: 'a test run', start: 'now', ...extra })
}

async function booked(by: Record<string, string>, gib: number, minutes: number, extra: Record<string, unknown> = {}): Promise<BookingOnTheWire> {
  const answer = await book(by, gib, minutes, extra)
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return answer.said['booking'] as BookingOnTheWire
}

function now(id: string): BookingOnTheWire['data'] {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as BookingOnTheWire['data']
}

/**
 * WHETHER A BOOKING STARTS NOW: within the seconds the request that placed it took. A booking placed "now"
 * starts at the second of its own request, which is not always the second an earlier booking started in,
 * so comparing the two went red at a second's turn (wave 13s round 30d).
 */
async function startsWithin<T>(request: () => Promise<T>, startsAt: (answer: T) => string): Promise<T> {
  const asked = localStamp(new Date())
  const answer = await request()
  const answered = localStamp(new Date())
  const at = startsAt(answer)
  expect(at >= asked && at <= answered, `${at} is not between ${asked} and ${answered}, so it did not start now`).toBe(true)
  return answer
}

/** The system lines written to one agent, newest last. */
function linesTo(handle: string): { body: string; saidInFull?: string }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY created_at, rowid")
    .all() as { data: string }[]
  const id = idOf(handle)
  return rows
    .map((row) => JSON.parse(row.data) as { body: string; saidInFull?: string; to?: { kind: string; id: string }[] })
    .filter((m) => (m.to ?? []).some((one) => one.kind === 'agent' && one.id === id))
}

/** A running program on the fake machine: a group leader. */
function start(pid: number): void {
  live.set(pid, { pid, pgid: pid, ppid: 1, command: `test-run-${String(pid)}`, startedAt: '2026-10-08 10:00:00' })
}

beforeAll(async () => {
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())

  // TWO SECRETARIES, each with two agents under it, and the GPU watcher.
  await register('sec-a', 'supervisor', ['src/sec-a'], AS_THE_PERSON)
  expect((await ask('/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('sec-b', 'supervisor', ['src/sec-b'], AS_THE_PERSON)
  expect((await ask('/api/roles/card/sec-b', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', ['src/a1'], asAgent('sec-a'))
  await register('wa2', 'worker', ['src/a2'], asAgent('sec-a'))
  await register('wb1', 'worker', ['src/b1'], asAgent('sec-b'))
  await register('card-watcher', 'worker', ['src/card-watcher'], AS_THE_PERSON)

  // THE CARD: 16303 MiB, so 15 GiB to book (change 1).
  const read = await ask('/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: '2026-10-08 18:00:00', totalMiB: 16303, usedMiB: 900, processes: [] })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
}, 300_000)

afterEach(async () => {
  // EVERY TEST STARTS FROM AN EMPTY LINE: the owner cancels whatever is left.
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask(`/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
})

describe('the line', () => {
  it('1. starts a booking at the time asked when the GiB go over the card, reminds both holders, and lets "when-free" wait', async () => {
    const first = await booked(asAgent('wa1'), 10, 60)
    const second = await startsWithin(() => booked(asAgent('wb1'), 10, 30), (two) => two.data.startsAt)
    expect(now(first.id).startsAt, 'the first booking was moved').toBe(first.data.startsAt)
    // BOTH HOLDERS ARE REMINDED, each with every declaration (the booking that brought the reminder first), the
    // total and the card's size.
    expect(linesTo('wa1').at(-1)?.saidInFull).toContain(
      `wb1's booking ${second.id} declares 10 GiB; your booking ${first.id} declares 10 GiB. Together that is 20 GiB, and the card has 15 GiB (16303 MiB).`,
    )
    expect(linesTo('wb1').at(-1)?.body).toMatch(/^Booked GPU memory goes over the card from /)
    expect(linesTo('wb1').at(-1)?.saidInFull).toContain(`your booking ${second.id} declares 10 GiB; wa1's booking ${first.id} declares 10 GiB.`)
    // "WHEN-FREE" WAITS, by its own choice, for the earliest time its GiB fit.
    const waits = await booked(asAgent('wa2'), 5, 30, { start: 'when-free' })
    expect(waits.data.startsAt, 'the "when-free" booking did not wait for room').toBe(second.data.endsAt)
  })

  it('1b. takes a booking bigger than the card, and reminds its holder', async () => {
    const big = await book(asAgent('wa1'), 16, 30)
    expect(big.status, JSON.stringify(big.said)).toBe(201)
    expect(linesTo('wa1').at(-1)?.saidInFull).toContain('declares 16 GiB. That is 16 GiB, and the card has 15 GiB (16303 MiB).')
  })

  it('2. starts the owner’s booking at the time the person asked, and moves nobody', async () => {
    const agents = await booked(asAgent('wa1'), 10, 60)
    await startsWithin(() => booked(AS_THE_PERSON, 10, 30), (their) => their.data.startsAt)
    expect(now(agents.id).startsAt, 'the agent’s booking was moved').toBe(agents.data.startsAt)
    expect(linesTo('wa1').at(-1)?.body).toMatch(/^Booked GPU memory goes over the card from /)
  })

  it('3. "cutIn" is the person’s own press: without it nothing running is touched; "after" waits; "now" gives the grace to stop', async () => {
    const agents = await booked(asAgent('wa1'), 10, 60)
    start(4100)
    expect((await ask(`/api/bookings/${agents.id}/program`, asAgent('wa1'), { pid: 4100 })).status).toBe(200)
    expect(now(agents.id).state).toBe('running')
    // WITHOUT A CHOICE THE OWNER'S BOOKING STARTS NOW, beside the running one, which is not touched.
    const unchosen = await startsWithin(() => booked(AS_THE_PERSON, 10, 30), (their) => their.data.startsAt)
    expect(now(agents.id).state).toBe('running')
    expect(now(agents.id).startsAt).toBe(agents.data.startsAt)
    expect((await ask(`/api/bookings/${unchosen.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
    // "AFTER": the owner's starts when the running one ends.
    const after = await booked(AS_THE_PERSON, 10, 30, { cutIn: 'after' })
    expect(after.data.startsAt).toBe(agents.data.endsAt)
    expect(now(agents.id).state).toBe('running')
    expect((await ask(`/api/bookings/${after.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
    const owners = await booked(AS_THE_PERSON, 10, 30, { cutIn: 'now' })
    expect(now(agents.id).state, 'the running booking was not taken off the card').toBe('waiting')
    expect(now(agents.id).startsAt).toBe(owners.data.endsAt)
    const told = linesTo('wa1').at(-1)
    expect(told?.body, 'the holder was not told to stop').toContain('goes first on the GPU: stop by')
  })
})

describe('going first', () => {
  it('4. moves nothing until the request is granted, and the grant moves nobody else', async () => {
    const holders = await booked(asAgent('wa1'), 10, 60)
    const mine = await booked(asAgent('wa2'), 10, 30, { start: 'when-free' })
    const asked = await ask(`/api/bookings/${mine.id}/go-first`, asAgent('wa2'), { ahead: holders.id })
    expect(asked.status, JSON.stringify(asked.said)).toBe(200)
    expect(now(mine.id).startsAt, 'the request moved the booking before anybody granted it').toBe(mine.data.startsAt)
    expect(now(holders.id).startsAt).toBe(holders.data.startsAt)
    // ONE AGENT'S SECRETARY: sec-a's grant is the one needed, and it moves the line.
    expect(now(mine.id).goFirst?.secretaries).toEqual([{ kind: 'agent', id: idOf('sec-a') }])
    // THE GRANT PUTS IT ON THE CARD NOW, beside the holder's, which stays where it is.
    const granted = await startsWithin(
      () => ask(`/api/bookings/${mine.id}/go-first/answer`, asAgent('sec-a'), { grant: true }),
      () => now(mine.id).startsAt,
    )
    expect(granted.status, JSON.stringify(granted.said)).toBe(200)
    expect(now(holders.id).startsAt, 'the grant moved the booking it went ahead of').toBe(holders.data.startsAt)
    const { NO_OTHER_BOOKING_WAS_MOVED } = await import('../src/server/lib/bookings.ts')
    expect(granted.said['says'] as string).toContain(NO_OTHER_BOOKING_WAS_MOVED)
  })

  it('5. counts a secretary’s grant only for its own agents', async () => {
    const holders = await booked(asAgent('wa1'), 10, 60)
    const mine = await booked(asAgent('wa2'), 10, 30, { start: 'when-free' })
    expect((await ask(`/api/bookings/${mine.id}/go-first`, asAgent('wa2'), { ahead: holders.id })).status).toBe(200)
    const strangers = await ask(`/api/bookings/${mine.id}/go-first/answer`, asAgent('sec-b'), { grant: true })
    expect(strangers.status, 'another secretary granted a request that is not its own agents’').toBe(403)
    expect(now(mine.id).goFirst?.state).toBe('asked')
    expect(now(mine.id).startsAt).toBe(mine.data.startsAt)
    // AND THE OWNER MAY ALWAYS DECIDE IT.
    expect((await ask(`/api/bookings/${mine.id}/go-first/answer`, AS_THE_PERSON, { grant: false })).status).toBe(200)
    expect(now(mine.id).goFirst?.state).toBe('refused')
  })

  it('6. opens one group with the two agents and both secretaries when two secretaries’ agents clash', async () => {
    const holders = await booked(asAgent('wb1'), 10, 60)
    const mine = await booked(asAgent('wa1'), 10, 30, { start: 'when-free' })
    const asked = await ask(`/api/bookings/${mine.id}/go-first`, asAgent('wa1'), { ahead: holders.id })
    expect(asked.status, JSON.stringify(asked.said)).toBe(200)
    const group = asked.said['group'] as string | null
    expect(group, 'no group was opened for the clash').not.toBeNull()
    const members = t.client.sqlite
      .prepare('SELECT member_kind, member_id FROM group_members WHERE group_id = ? AND left_at IS NULL')
      .all(group) as { member_kind: string; member_id: string }[]
    expect(members.map((m) => participantKey({ kind: m.member_kind as 'agent', id: m.member_id })).sort()).toEqual(
      ['wa1', 'wb1', 'sec-a', 'sec-b'].map((h) => participantKey({ kind: 'agent', id: idOf(h) })).sort(),
    )
    // ONE GRANT IS NOT ENOUGH: both secretaries are needed.
    expect((await ask(`/api/bookings/${mine.id}/go-first/answer`, asAgent('sec-a'), { grant: true })).status).toBe(200)
    expect(now(mine.id).goFirst?.state).toBe('asked')
    expect((await ask(`/api/bookings/${mine.id}/go-first/answer`, asAgent('sec-b'), { grant: true })).status).toBe(200)
    expect(now(mine.id).goFirst?.state).toBe('granted')
    // THE SAME TWO BOOKINGS NEVER OPEN A SECOND GROUP.
    const groups = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM groups WHERE about LIKE 'booking-clash|%'").get() as { n: number }
    expect(groups.n).toBe(1)
  })
})

describe('the end of a booking', () => {
  it('7. ends a running booking when its program’s process group ends', async () => {
    const mine = await booked(asAgent('wa1'), 10, 60)
    start(4200)
    expect((await ask(`/api/bookings/${mine.id}/program`, asAgent('wa1'), { pid: 4200 })).status).toBe(200)
    expect(now(mine.id).state).toBe('running')
    live.delete(4200)
    // A GET CHANGES NOTHING, and names it.
    const gpu = await ask('/api/resources/gpu?secondLevel=show', asAgent('wa1'))
    expect(gpu.status, JSON.stringify(gpu.said)).toBe(200)
    expect((gpu.said['says'] as string)).toContain('Its program has ended')
    expect(now(mine.id).state).toBe('running')
    // THE NEXT WRITE SETTLES IT.
    await booked(asAgent('wb1'), 1, 10)
    expect(now(mine.id).state, 'the booking outlived its program').toBe('ended')
  })
})
