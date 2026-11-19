// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Round 75 of wave 13y: the read of when a session was handed messages starts from the session's live hold.
 * Round 82 of wave 13y: it hands back only what its one caller uses, the first message handed over later than an
 * instant, and looks up in the records table only the messages handed over later than that instant.
 * Every agent, session, message and word below is made up for this fresh test database. This is not a load measurement.
 *
 * The people view and the online view ask it for each agent that holds its handle. SQLite walked every delivery to any
 * agent each time and only then looked for the hold, because nothing told it to start from the hold. Then, on a made-up
 * office with 18,552 hand-overs to one session, most of its time went on looking every one of them up in the records
 * table, while its caller, lib/answering.ts, uses only the first hand-over later than the transcript's last write.
 * A keeps what the read hands back. B asks SQLite's plan, with the statement's own values, where the read starts.
 * C asks which messages the read looks up in the records table, and in what order.
 *
 * Mutations of src/server/lib/handles.ts each turn it red: plain joins in place of the cross joins (B), a delivery taken
 * by any session counted (A), a queued delivery counted (A); and since round 82 the records table joined to every
 * hand-over again (C), every hand-over looked up rather than only the later ones (C), the look-up left out (A), and the
 * stamps compared as text rather than as instants (A, the repeated hour).
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { parseAnyStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const HELD = 'invented-session-held'
const ELSEWHERE = 'invented-session-elsewhere'
const RELEASED = 'invented-session-released'
const REPEATED = 'invented-session-in-the-repeated-hour'
let holder: string
let other: string
let third: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const ids: string[] = []
  for (const handle of ['invented-holder', 'invented-other', 'invented-third']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: `Made-up ${handle}`, workArea: ['src'] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    ids.push((t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id)
  }
  ;[holder, other, third] = ids as [string, string, string]
  const sqlite = t.client.sqlite
  sqlite.transaction(() => {
    hold('invented-hold-live', holder, HELD, null)
    hold('invented-hold-released', other, RELEASED, '2026-10-24 09:00:00')
    message('invented-handed-later', { kind: 'agent', id: holder }, 'seen', HELD, '2026-10-24 10:00:05')
    message('invented-handed-first', { kind: 'agent', id: holder }, 'delivered', HELD, '2026-10-24 10:00:01')
    message('invented-still-queued', { kind: 'agent', id: holder }, 'queued', HELD, '2026-10-24 10:00:02')
    message('invented-taken-elsewhere', { kind: 'agent', id: holder }, 'seen', ELSEWHERE, '2026-10-24 10:00:03')
    message('invented-withdrawn', { kind: 'agent', id: holder }, 'seen', HELD, '2026-10-24 10:00:04')
    sqlite.prepare("UPDATE records SET deleted_at = '2026-10-24 10:01:00' WHERE id = 'invented-withdrawn'").run()
    message('invented-to-a-person-of-that-id', { kind: 'person', id: holder }, 'seen', HELD, '2026-10-24 10:00:06')
    message('invented-to-the-other-agent', { kind: 'agent', id: other }, 'seen', HELD, '2026-10-24 10:00:07')
    message('invented-not-a-message', { kind: 'agent', id: holder }, 'seen', HELD, '2026-10-24 10:00:08', 'note')
    message('invented-handed-last', { kind: 'agent', id: holder }, 'seen', HELD, '2026-10-24 10:00:09')
    message('invented-released-hand-over', { kind: 'agent', id: other }, 'seen', RELEASED, '2026-10-24 08:00:00')
    // ON THE DAY THE CLOCKS GO BACK in Europe/London, 01:00 to 01:59 comes twice. A stored stamp of 01:30 reads as the first
    // 01:30, in summer time (00:30 UTC). The instant asked about below is 01:10 in winter time (01:10 UTC): later than that
    // stamp, though its own wall clock reads earlier.
    hold('invented-hold-repeated', third, REPEATED, null)
    message('invented-handed-in-the-first-hour', { kind: 'agent', id: third }, 'seen', REPEATED, '2026-10-25 01:30:00')
    message('invented-handed-after-the-hour', { kind: 'agent', id: third }, 'seen', REPEATED, '2026-10-25 02:30:00')
    // Many deliveries to other agents, so a walk of every agent's deliveries would differ from a read of one agent's.
    for (let n = 0; n < 200; n++) message(`invented-to-somebody-${n}`, { kind: 'agent', id: `invented-somebody-${n % 7}` }, 'seen', `invented-session-${n % 5}`, '2026-10-24 07:00:00')
  })()
})

afterAll(async () => { await app?.close(); t?.close() })

/** A made-up hold on an agent's handle by a session, released at `released` or live while it is null. */
function hold(id: string, agent: string, session: string, released: string | null): void {
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, agent, session, 'invented-machine', 'claude-code', '2026-10-24 06:00:00', '2026-10-24 10:00:00', released, released === null ? null : 'Made-up release.')
}

/** A made-up record and one delivery of it, whose sentence says which session took it, written as the took door writes it. */
function message(id: string, to: { kind: string; id: string }, mark: string, takenBy: string, at: string, kind = 'message'): void {
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, at, at, kind, `Made-up ${id}`, JSON.stringify({ body: `Made-up words of ${id}`, sentBy: { kind: 'person', id: THE_PERSON }, to: [to] }), 'authored')
  t.client.sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`${id}-delivery`, id, to.kind, to.id, mark, at, theLiveSessionTookIt(takenBy))
}

/** The first message handed to `session` later than the instant `after`, as its milliseconds, or null. One instant, not a list: a list has no getTime. */
async function firstHandedAfter(session: string, after: number): Promise<number | null> {
  const { theFirstMessageHandedToThisSessionAfter } = await import('../src/server/lib/handles.ts')
  const first = theFirstMessageHandedToThisSessionAfter(session, new Date(after))
  return first === null ? null : first.getTime()
}

const when = (stamp: string) => parseAnyStamp(stamp)!.getTime()

/** Every statement `act` ran that reads the records table, with the values it was given. */
async function recordsReadDuring(act: () => Promise<unknown>): Promise<{ sql: string; args: unknown[] }[]> {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<'all' | 'get' | 'iterate', (...args: unknown[]) => unknown>
  const originals = { all: proto.all, get: proto.get, iterate: proto.iterate }
  const seen: { sql: string; args: unknown[] }[] = []
  for (const name of ['all', 'get', 'iterate'] as const) {
    const original = originals[name]
    proto[name] = function (this: { source: string }, ...args: unknown[]) {
      if (/\brecords\b/.test(this.source)) seen.push({ sql: this.source, args })
      return original.apply(this, args)
    }
  }
  try {
    await act()
  } finally {
    Object.assign(proto, originals)
  }
  return seen
}

describe('A. the read hands back the first hand-over later than the instant', () => {
  it('names the first of the held agent\'s messages this session took later than the instant, not queued, live and of the message kind', async () => {
    expect(await firstHandedAfter(HELD, when('2026-10-24 09:00:00'))).toBe(when('2026-10-24 10:00:01'))
    // NOT THE QUEUED ONE (10:00:02), NOR THE ONE ANOTHER SESSION TOOK (10:00:03). The withdrawn one (10:00:04) is passed
    // over, and the next is the answer, not none.
    expect(await firstHandedAfter(HELD, when('2026-10-24 10:00:01'))).toBe(when('2026-10-24 10:00:05'))
    // NOT THE ONE TO A PERSON OF THAT ID (10:00:06), NOR THE OTHER AGENT'S (10:00:07). The record that is not a message
    // (10:00:08) is passed over, and the next is the answer.
    expect(await firstHandedAfter(HELD, when('2026-10-24 10:00:05'))).toBe(when('2026-10-24 10:00:09'))
    expect(await firstHandedAfter(HELD, when('2026-10-24 10:00:09'))).toBeNull()
  })
  it('names nothing for a session whose hold was released, or that holds nothing', async () => {
    expect(await firstHandedAfter(RELEASED, when('2026-10-24 06:00:00'))).toBeNull()
    expect(await firstHandedAfter('invented-session-holding-nothing', when('2026-10-24 06:00:00'))).toBeNull()
  })
  it('compares instants, not stamp text, in the hour that comes twice on the day the clocks go back', async () => {
    const zoneBefore = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      // THE CASE MEANS SOMETHING ONLY IF THE STORED 01:30 READS AS THE FIRST 01:30, before the instant asked about.
      expect(new Date(when('2026-10-25 01:30:00')).toISOString()).toBe('2026-10-25T00:30:00.000Z')
      expect(await firstHandedAfter(REPEATED, Date.UTC(2026, 9, 25, 1, 10, 0))).toBe(Date.UTC(2026, 9, 25, 2, 30, 0))
    } finally {
      if (zoneBefore === undefined) delete process.env.TZ
      else process.env.TZ = zoneBefore
    }
  })
})

describe('B. SQLite starts from the hold', () => {
  it('finds the hold by its session, then that one agent\'s deliveries by kind and id, and walks no other agent\'s', async () => {
    type Step = { id: number; parent: number; detail: string }
    const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (this: { source: string }, ...args: unknown[]) => unknown }
    const original = proto.all
    const seen: { sql: string; args: unknown[] }[] = []
    proto.all = function (...args) { seen.push({ sql: this.source, args }); return original.apply(this, args) }
    try { await firstHandedAfter(HELD, when('2026-10-24 06:00:00')) } finally { proto.all = original }
    const reads = seen.filter(one => one.sql.includes('message_delivery'))
    expect(reads.length).toBeGreaterThan(0)
    const wrong: string[] = []
    for (const one of reads) {
      const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.args) as Step[]
      const steps = plan.map(step => step.detail).filter(detail => /^(SEARCH|SCAN) /.test(detail))
      if (!/^SEARCH h USING (COVERING )?INDEX handle_holds_session_idx \(session_record_id=\?\)/.test(steps[0] ?? '')) wrong.push(`does not start from the hold of the session: ${steps.join('; ')}`)
      if (!steps.some(step => step.includes('message_delivery_recipient_idx (recipient_kind=? AND recipient_id=?)'))) wrong.push(`reads no one agent's deliveries: ${steps.join('; ')}`)
      for (const step of steps) {
        if (/message_delivery_recipient_idx \(recipient_kind=\?\)/.test(step)) wrong.push(`walks every agent's deliveries: ${step}`)
        if (/^SCAN (d|message_delivery)\b/.test(step)) wrong.push(`walks every delivery: ${step}`)
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('C. only the messages handed over later than the instant are looked up in the records table, oldest first, until one is a live message', () => {
  it('reads the hand-overs without the records table, then looks up the later ones one by one and stops at the first that passes', async () => {
    const asked = async (after: string) => {
      const seen = await recordsReadDuring(() => firstHandedAfter(HELD, when(after)))
      expect(seen.filter(one => one.sql.includes('message_delivery')).map(one => one.sql)).toEqual([])
      return seen.map(one => one.args[0])
    }
    expect(await asked('2026-10-24 09:00:00')).toEqual(['invented-handed-first'])
    expect(await asked('2026-10-24 10:00:01')).toEqual(['invented-withdrawn', 'invented-handed-later'])
    expect(await asked('2026-10-24 10:00:05')).toEqual(['invented-not-a-message', 'invented-handed-last'])
    expect(await asked('2026-10-24 10:00:09')).toEqual([])
  })
})
