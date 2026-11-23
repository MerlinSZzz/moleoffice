// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HAND-OVER READ ASKS SQLITE ONLY FOR THE HAND-OVERS THAT COULD BE LATER than the instant it is given, and for every
 * hand-over whose stamp SQLite cannot vouch for, and its answer is the answer of the code before the change.
 *
 * `theFirstMessageHandedToThisSessionAfter` read every hand-over to the held agent and compared each with the instant in
 * JavaScript. Now SQLite leaves out a hand-over only when its stamp is in the exact form `nowStamp` writes, names a real
 * date and time, and sorts earlier than the UTC wall clock of the instant less a margin wider than any zone's offset. Such a
 * stamp reads as an instant earlier than the one asked about in every zone, so leaving it out changes no answer.
 *
 * THE CASES, each run once with no alias filed and once with an alias filed for every agent:
 *   1. Many hand-overs to one held agent, few of them later. The hand-over statement hands back few rows: every later one,
 *      every stamp in another form, and no well-formed stamp far earlier. The answer is the reference's.
 *   2. The hour that comes twice when the clocks go back, in Europe/London. A hand-over written in the second pass reads
 *      as the first pass, so by today's rule it is not later, and the answer is the next later one, as the reference says.
 *   3. The hour skipped when the clocks go forward, in Europe/London. A stamp whose text is earlier than the instant's own
 *      local text but which reads as later is the answer.
 *   4. An office in a zone behind UTC. A stamp whose text is earlier than the instant's UTC text but which reads as later is
 *      the answer.
 *   5. An unreadable stamp of a live message, earlier in text than any bound, still stops the read with today's words. The
 *      same stamp of a deleted message does not, and the answer is the next later one.
 *   6. The plan still starts from the hold, reads the agent's rows through the recipient index, and never uses the index on
 *      the time of a delivery.
 *
 * THE REFERENCE, `todaysAnswer`, IS A COPY OF THE CODE BEFORE THE CHANGE: it reads every hand-over with no bound and keeps
 * today's rule. That rule is what the answer must keep, so it is written out here and not taken from the code under test.
 * Each case also writes out the answer it expects, so a reference that drifted with the code would still be caught.
 *
 * Every agent, session, message and word below is made up for this fresh test database. This is not a load measurement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { parseAnyStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let F: typeof import('../src/server/lib/the-first-message-handed-to-this-session-after.ts')
let A: typeof import('../src/server/lib/registry-aliases/runs.ts')
let R: typeof import('../src/server/lib/registry-aliases/stamps.ts')

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/** Each made-up agent holds its handle from one made-up session. */
const AGENTS = ['many', 'back', 'forward', 'behind', 'broken', 'broken-but-deleted'] as const
type Agent = (typeof AGENTS)[number]
const handleOf = (agent: Agent) => `invented-${agent}-holder`
const sessionOf = (agent: Agent) => `invented-session-of-the-${agent}-holder`
const oldIdOf = (agent: Agent) => `invented-old-id-of-the-${agent}-holder`
const idOf = {} as Record<Agent, string>

const utc = (year: number, month: number, day: number, hour: number, minute = 0) => Date.UTC(year, month - 1, day, hour, minute)
const utcText = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/** The many hand-overs of case 1: one an hour, in UTC wall clock, the last few later than the instant asked about. */
const MANY = Array.from({ length: 240 }, (_, n) => utcText(utc(2026, 9, 1, 0) + n * 3_600_000))
const MANY_AFTER = utc(2026, 9, 10, 20, 30)
/** Stamps in a form other than the one `nowStamp` writes, or naming no real day, all of them earlier in text than any bound. */
const ODD_FORMS = ['2026-09-01 09:00', '2026-09-01T09:00:00', '2026-09-01T09:00:00+01:00', '2026-02-30 09:00:00']

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  F = await import('../src/server/lib/the-first-message-handed-to-this-session-after.ts')
  A = await import('../src/server/lib/registry-aliases/runs.ts')
  R = await import('../src/server/lib/registry-aliases/stamps.ts')
  for (const agent of AGENTS) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: handleOf(agent), name: `Made-up ${handleOf(agent)}`, workArea: ['src'] } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    idOf[agent] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handleOf(agent)) as { id: string }).id
  }
  const sqlite = t.client.sqlite
  sqlite.transaction(() => {
    for (const agent of AGENTS) hold(`invented-hold-of-the-${agent}-holder`, idOf[agent], sessionOf(agent))

    MANY.forEach((at, n) => message(`invented-many-${n}`, idOf.many, sessionOf('many'), at))
    // The first later hand-over is of a deleted message, so it is passed over and the next is the answer.
    sqlite.prepare("UPDATE records SET deleted_at = '2026-09-11 00:00:00' WHERE id = ?").run(`invented-many-${MANY.indexOf('2026-09-10 21:00:00')}`)
    ODD_FORMS.forEach((at, n) => message(`invented-many-odd-${n}`, idOf.many, sessionOf('many'), at))
    message('invented-many-under-the-old-id-later', oldIdOf('many'), sessionOf('many'), '2026-09-10 20:45:00')
    message('invented-many-under-the-old-id-earlier', oldIdOf('many'), sessionOf('many'), '2026-09-02 00:00:00')

    // ON THE DAY THE CLOCKS GO BACK in Europe/London, 01:00 to 01:59 comes twice, and a stamp in it reads as the first pass.
    message('invented-back-in-the-first-pass', idOf.back, sessionOf('back'), '2026-10-25 01:30:00')
    message('invented-back-in-the-second-pass', idOf.back, sessionOf('back'), '2026-10-25 01:40:00')
    message('invented-back-after-the-hour', idOf.back, sessionOf('back'), '2026-10-25 02:30:00')
    message('invented-back-under-the-old-id', oldIdOf('back'), sessionOf('back'), '2026-10-25 02:10:00')

    // ON THE DAY THE CLOCKS GO FORWARD in Europe/London, 01:00 to 01:59 never comes, and a stamp in it reads as winter time.
    message('invented-forward-before-the-hour', idOf.forward, sessionOf('forward'), '2026-03-29 00:30:00')
    message('invented-forward-in-the-skipped-hour', idOf.forward, sessionOf('forward'), '2026-03-29 01:30:00')
    message('invented-forward-under-the-old-id', oldIdOf('forward'), sessionOf('forward'), '2026-03-29 01:20:00')

    // IN A ZONE TWELVE HOURS BEHIND UTC, a stamp's text is that much earlier than the UTC text of the same instant.
    message('invented-behind-far-earlier', idOf.behind, sessionOf('behind'), '2026-06-09 10:00:00')
    message('invented-behind-earlier', idOf.behind, sessionOf('behind'), '2026-06-09 13:00:00')
    message('invented-behind-earlier-still-in-text', idOf.behind, sessionOf('behind'), '2026-06-09 20:00:00')
    message('invented-behind-later', idOf.behind, sessionOf('behind'), '2026-06-10 06:00:00')
    message('invented-behind-under-the-old-id', oldIdOf('behind'), sessionOf('behind'), '2026-06-10 03:00:00')

    message('invented-broken-unreadable', idOf.broken, sessionOf('broken'), '')
    message('invented-broken-readable', idOf.broken, sessionOf('broken'), '2026-09-10 10:00:00')
    message('invented-deleted-unreadable', idOf['broken-but-deleted'], sessionOf('broken-but-deleted'), '')
    sqlite.prepare("UPDATE records SET deleted_at = '2026-09-11 00:00:00' WHERE id = 'invented-deleted-unreadable'").run()
    message('invented-deleted-readable', idOf['broken-but-deleted'], sessionOf('broken-but-deleted'), '2026-09-10 10:00:00')
  })()
})

afterAll(async () => { await app?.close(); t?.close() })

/** A made-up live hold on an agent's handle by a session. */
function hold(id: string, agent: string, session: string): void {
  t.client.sqlite.prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, agent, session, 'invented-machine', 'claude-code', '2026-01-01 06:00:00', '2026-01-01 07:00:00', null, null)
}

/** A made-up message to an agent and its one delivery, whose sentence says which session took it, as the took door writes it. */
function message(id: string, agent: string, takenBy: string, at: string): void {
  const written = at === '' ? '2026-01-01 08:00:00' : at
  t.client.sqlite.prepare('INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, MESSAGE_CENTRE, THE_TEST_OFFICES_OWNER.id, written, written, 'message', `Made-up ${id}`, JSON.stringify({ body: `Made-up words of ${id}`, sentBy: { kind: 'person', id: THE_PERSON }, to: [{ kind: 'agent', id: agent }] }), 'authored')
  t.client.sqlite.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(`${id}-delivery`, id, 'agent', agent, 'seen', at, theLiveSessionTookIt(takenBy))
}

/** Every agent's old id is filed as an alias of its registry id, so a delivery stored under the old id is the agent's. */
async function fileTheOldIds(): Promise<void> {
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, AGENTS.map((agent) => ({ namespace: 'agent-registry', aliasId: oldIdOf(agent), canonicalId: idOf[agent] })))
}

type Outcome = { answer: number | null } | { threw: string }

function outcomeOf(act: () => Date | null): Outcome {
  try {
    const at = act()
    return { answer: at === null ? null : at.getTime() }
  } catch (error) {
    return { threw: (error as Error).message }
  }
}

/**
 * THE REFERENCE: A COPY OF THE CODE BEFORE THE CHANGE. Every hand-over to the held agent is read with no bound, each is
 * compared with the instant as an instant, an unreadable stamp of a live message stops the read with the same words, and
 * the answer is the first later one whose message is live. It also gives back how many hand-overs it read.
 */
function todaysAnswer(sessionRecordId: string, after: Date): { outcome: Outcome; read: number } {
  const sqlite = t.client.sqlite
  const aliases = A.theFiledAliasesReadOnce(sqlite)
  let rows: { at: string; messageId: string }[]
  if (!aliases.anyFiled()) {
    rows = sqlite
      .prepare(
        'SELECT d.at AS at, d.message_id AS messageId FROM handle_holds h ' +
          "CROSS JOIN message_delivery d ON d.recipient_kind = 'agent' AND d.recipient_id = h.agent_id " +
          "WHERE h.session_record_id = ? AND h.released_at IS NULL AND d.mark <> 'queued' AND d.because = ?",
      )
      .all(sessionRecordId, theLiveSessionTookIt(sessionRecordId)) as { at: string; messageId: string }[]
  } else {
    const holders = sqlite.prepare('SELECT h.agent_id AS agentId FROM handle_holds h WHERE h.session_record_id = ? AND h.released_at IS NULL').all(sessionRecordId) as { agentId: string }[]
    const ids = [...new Set(holders.flatMap((whose) => R.theRegistryIdsOf(sqlite, whose.agentId, aliases)))]
    rows =
      ids.length === 0
        ? []
        : (sqlite
            .prepare(`SELECT d.at AS at, d.message_id AS messageId FROM message_delivery d WHERE d.recipient_kind = 'agent' AND d.recipient_id ${A.isOneOf(ids)} AND d.mark <> 'queued' AND d.because = ?`)
            .all(...ids, theLiveSessionTookIt(sessionRecordId)) as { at: string; messageId: string }[])
  }
  const outcome = outcomeOf(() => {
    const aLiveMessage = sqlite.prepare("SELECT 1 AS found FROM records WHERE id = ? AND kind = 'message' AND deleted_at IS NULL")
    const isALiveMessage = (messageId: string): boolean => aLiveMessage.get(messageId) !== undefined
    const later: { at: Date; messageId: string }[] = []
    for (const row of rows) {
      const when = parseAnyStamp(row.at)
      if (when === null) {
        if (!isALiveMessage(row.messageId)) continue
        throw new Error(
          `The delivery of message ${row.messageId} to the session filed as record ${sessionRecordId} carries the time ` +
            `"${row.at}", which cannot be read, so whether that session read it cannot be worked out.`,
        )
      }
      if (when.getTime() > after.getTime()) later.push({ at: when, messageId: row.messageId })
    }
    later.sort((a, b) => a.at.getTime() - b.at.getTime())
    return later.find((whose) => isALiveMessage(whose.messageId))?.at ?? null
  })
  return { outcome, read: rows.length }
}

type Asked = { sql: string; args: unknown[]; ats: string[] }

/** The read under test, with every hand-over statement it ran: its text, its values and the stamps it handed back. */
function theReadOf(agent: Agent, after: number): { outcome: Outcome; asked: Asked[] } {
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (...args: unknown[]) => unknown[] }
  const original = proto.all
  const asked: Asked[] = []
  proto.all = function (this: { source: string }, ...args: unknown[]): unknown[] {
    const rows = original.apply(this, args)
    if (this.source.includes('d.because = ?')) asked.push({ sql: this.source, args, ats: (rows as { at: string }[]).map((row) => row.at) })
    return rows
  }
  const kept: { outcome?: Outcome } = {}
  try {
    kept.outcome = outcomeOf(() => F.theFirstMessageHandedToThisSessionAfter(sessionOf(agent), new Date(after)))
  } finally {
    proto.all = original
  }
  return { outcome: kept.outcome!, asked }
}

/** `act` with the process in the time zone `zone`, set back after. */
function inZone<T>(zone: string, act: () => T): T {
  const zoneBefore = process.env.TZ
  process.env.TZ = zone
  try {
    return act()
  } finally {
    if (zoneBefore === undefined) delete process.env.TZ
    else process.env.TZ = zoneBefore
  }
}

/** The one hand-over statement of a read. */
function theOneStatement(asked: Asked[]): Asked {
  expect(asked.map((one) => one.sql), 'the hand-over statements of one read').toHaveLength(1)
  return asked[0]!
}

describe.each([
  ['with no alias filed', false],
  ['with an alias filed for every agent', true],
] as const)('the hand-over read, %s', (_name, aliased) => {
  beforeAll(async () => {
    if (aliased) await fileTheOldIds()
    // THE CONTROL: the read takes the branch this run is named for.
    expect(A.theFiledAliasesReadOnce(t.client.sqlite).anyFiled(), 'whether an alias is filed').toBe(aliased)
  })

  it('1. of many hand-overs, it asks for the later ones and every stamp in another form, and answers as today', () => {
    inZone('UTC', () => {
      const today = todaysAnswer(sessionOf('many'), new Date(MANY_AFTER))
      // THE CONTROL: the reference reads every hand-over of the agent, and there are many.
      expect(today.read, 'the hand-overs the reference read').toBeGreaterThanOrEqual(MANY.length + ODD_FORMS.length)
      const { outcome, asked } = theReadOf('many', MANY_AFTER)
      const expected = aliased ? utc(2026, 9, 10, 20, 45) : utc(2026, 9, 10, 22)
      expect(outcome, 'the answer').toEqual({ answer: expected })
      expect(outcome, "the reference's answer").toEqual(today.outcome)
      const handedBack = theOneStatement(asked).ats
      expect(handedBack.length, 'the hand-overs the statement handed back').toBeLessThan(50)
      for (const at of ['2026-09-10 21:00:00', '2026-09-10 22:00:00', '2026-09-10 23:00:00', ...ODD_FORMS]) expect(handedBack, 'the hand-overs handed back').toContain(at)
      expect(handedBack.includes('2026-09-10 20:45:00'), 'the later hand-over under the old id, handed back').toBe(aliased)
      for (const at of ['2026-09-01 00:00:00', '2026-09-02 00:00:00', '2026-09-05 12:00:00']) expect(handedBack, 'the hand-overs handed back').not.toContain(at)
    })
  })

  it('2. in the hour that comes twice, a hand-over of the second pass is not later, and the next later one is the answer', () => {
    inZone('Europe/London', () => {
      const after = utc(2026, 10, 25, 1, 10)
      // THE CONTROL: both stamps in the hour read as the first pass, earlier than the instant; the one after it, later.
      expect(parseAnyStamp('2026-10-25 01:30:00')!.getTime(), 'the first-pass stamp').toBe(utc(2026, 10, 25, 0, 30))
      expect(parseAnyStamp('2026-10-25 01:40:00')!.getTime(), 'the second-pass stamp').toBe(utc(2026, 10, 25, 0, 40))
      const { outcome, asked } = theReadOf('back', after)
      expect(outcome, 'the answer').toEqual({ answer: aliased ? utc(2026, 10, 25, 2, 10) : utc(2026, 10, 25, 2, 30) })
      expect(outcome, "the reference's answer").toEqual(todaysAnswer(sessionOf('back'), new Date(after)).outcome)
      const handedBack = theOneStatement(asked).ats
      for (const at of ['2026-10-25 01:30:00', '2026-10-25 01:40:00', '2026-10-25 02:30:00']) expect(handedBack, 'the hand-overs handed back').toContain(at)
    })
  })

  it('3. in the hour skipped when the clocks go forward, a stamp earlier in text than the local time is later, and is the answer', () => {
    inZone('Europe/London', () => {
      const after = utc(2026, 3, 29, 1, 10)
      // THE CONTROL: the instant's local wall clock is 02:10 summer time, and the skipped 01:30 reads as later than it.
      expect([new Date(after).getHours(), new Date(after).getMinutes()], "the instant's local wall clock").toEqual([2, 10])
      expect(parseAnyStamp('2026-03-29 01:30:00')!.getTime(), 'the stamp in the skipped hour').toBe(utc(2026, 3, 29, 1, 30))
      const { outcome } = theReadOf('forward', after)
      expect(outcome, 'the answer').toEqual({ answer: aliased ? utc(2026, 3, 29, 1, 20) : utc(2026, 3, 29, 1, 30) })
      expect(outcome, "the reference's answer").toEqual(todaysAnswer(sessionOf('forward'), new Date(after)).outcome)
    })
  })

  it('4. in a zone behind UTC, a stamp earlier in text than the UTC time is later, and is the answer', () => {
    inZone('Etc/GMT+12', () => {
      const after = utc(2026, 6, 10, 12)
      // THE CONTROL: the stamp's text is earlier than the instant's UTC text, and it reads as later than the instant.
      expect('2026-06-10 06:00:00' < utcText(after), 'the stamp sorts before the UTC text').toBe(true)
      expect(parseAnyStamp('2026-06-10 06:00:00')!.getTime(), 'the stamp, read').toBe(utc(2026, 6, 10, 18))
      const { outcome, asked } = theReadOf('behind', after)
      expect(outcome, 'the answer').toEqual({ answer: aliased ? utc(2026, 6, 10, 15) : utc(2026, 6, 10, 18) })
      expect(outcome, "the reference's answer").toEqual(todaysAnswer(sessionOf('behind'), new Date(after)).outcome)
      const handedBack = theOneStatement(asked).ats
      for (const at of ['2026-06-09 13:00:00', '2026-06-09 20:00:00', '2026-06-10 06:00:00']) expect(handedBack, 'the hand-overs handed back').toContain(at)
    })
  })

  it("5. an unreadable stamp of a live message still stops the read with today's words, and of a deleted one does not", () => {
    inZone('UTC', () => {
      const after = utc(2026, 9, 5, 0)
      // THE CONTROL: the empty stamp cannot be read, and it sorts before every stamp.
      expect(parseAnyStamp(''), 'the empty stamp, read').toBeNull()
      const live = theReadOf('broken', after)
      expect(live.outcome, "the reference's outcome").toEqual(todaysAnswer(sessionOf('broken'), new Date(after)).outcome)
      expect('threw' in live.outcome ? live.outcome.threw : 'no error', 'the error').toContain('invented-broken-unreadable')
      expect(theOneStatement(live.asked).ats, 'the hand-overs handed back').toContain('')
      const deleted = theReadOf('broken-but-deleted', after)
      expect(deleted.outcome, 'the answer').toEqual({ answer: utc(2026, 9, 10, 10) })
      expect(deleted.outcome, "the reference's answer").toEqual(todaysAnswer(sessionOf('broken-but-deleted'), new Date(after)).outcome)
    })
  })

  it('6. the plan starts from the hold, reads the recipient index for the agent, and never the index on the time', () => {
    inZone('UTC', () => {
      const one = theOneStatement(theReadOf('many', MANY_AFTER).asked)
      type Step = { detail: string }
      const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.args) as Step[]
      const steps = plan.map((step) => step.detail).filter((detail) => /^(SEARCH|SCAN) /.test(detail))
      const wrong: string[] = []
      if (!aliased) {
        if (!one.sql.includes("CROSS JOIN message_delivery d ON d.recipient_kind = 'agent' AND d.recipient_id = h.agent_id")) wrong.push('the statement no longer joins the deliveries after the hold')
        if (!/^SEARCH h USING (COVERING )?INDEX handle_holds_session_idx \(session_record_id=\?\)/.test(steps[0] ?? '')) wrong.push(`the plan starts with "${steps[0]}"`)
      }
      if (!steps.some((step) => step.includes('message_delivery_recipient_idx (recipient_kind=? AND recipient_id=?)'))) wrong.push('the recipient index is not read for the agent')
      for (const step of steps) {
        if (step.includes('message_delivery_at_idx')) wrong.push(`a step uses the index on the time: "${step}"`)
        if (/message_delivery_recipient_idx \(recipient_kind=\?\)/.test(step)) wrong.push(`a step reads the recipient index by kind alone: "${step}"`)
        if (/^SCAN (d|message_delivery)\b/.test(step)) wrong.push(`a step scans the deliveries: "${step}"`)
      }
      expect(wrong, steps.join('\n')).toEqual([])
    })
  })
})
