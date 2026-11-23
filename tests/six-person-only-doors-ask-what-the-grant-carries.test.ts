// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SIX PERSON-ONLY DOORS ASK WHAT THE GRANT CARRIES. Each door below refused every caller that is not the person in
 * its own code, before any list was read, so neither the secretary card nor this office's answer changed what it did.
 * Each now asks the one check (`aRaiseCarriesIt` in lib/records.ts) after the person, so a secretary holding the
 * person's grant presses it for them where this office's list of what the grant carries says `may-press`, and an
 * office that changed nothing behaves as before: the secretary card keeps every one of these doors.
 *
 * A SECRETARY'S OWN RIGHT IS ASKED BEFORE THE GRANT, AND A SECRETARY NEVER PRESSES ITS OWN FILING. The booking door asks
 * `mayAnswer` first: a secretary the request needs answers as itself, even where this office keeps the door, and its
 * answer names no grant. Only a secretary with no right of its own asks the person's grant, and it tells the check that
 * the holder of the booking that asks filed the request, so the card's `neverOnItsOwnFiling` stops it granting its own.
 * Confirming a resident asks the person first, then the check with the proposal's filer, then its old refusal: a raised
 * secretary confirms another secretary's proposal where this office says may-press, and never its own. Under the grant the
 * residency's confirmed-by fields name the secretary, the decision keeps `decided_by` "the owner", and exactly one press
 * row names the secretary, the grant, the door and the reason.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of
 * them raised, a worker under each of them, and several resident candidates are made-up agents, each holding the key the
 * office answered. Every record here is synthetic, and no folder is made outside the test's own database folder. This
 * office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary hears the door's old refusal, even with this office's row at may-press, and
 *      nothing changes;
 *   2. granted, no row: the raised secretary is refused in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through, and the change rows name the secretary and the grant, never the
 *      person. A door that keeps what it changed outside the change log still leaves its press row, which names the
 *      secretary, the grant and the door.
 *
 * THE BOOKING DOOR'S OWN CASES say a secretary the request needs answers as itself where this office keeps the door, with
 * no press row and no grant on the answer, and that a secretary granting its own request under may-press is refused and
 * the request still waits. The RESIDENT DOOR'S OWN CASES say no grant hears its old refusal, kept refuses the raised
 * secretary, may-press confirms another secretary's proposal and names the secretary in the residency and the grant in
 * the press row, its own filing is refused, and nothing is written by a refusal.
 *
 * MUTATIONS RUN ON 23 OCTOBER 2026, each alone and then restored, and every case each one turned red:
 *   1. asking the grant before `mayAnswer` again: booking case 1 alone.
 *   2. taking `filedBy` out of the booking door: booking case 2 alone.
 *   3. taking `booking.answer` off `neverOnItsOwnFiling`: booking case 2 alone.
 *   4. confirming asking the person alone again: resident cases 2, 3 and 4 (kept, may-press, and its own filing).
 *   5. taking `resident.confirm` off `neverOnItsOwnFiling`: resident case 4 (its own filing) alone.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_SLEEP_TIME, A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'grant-secretary'
const UNRAISED = 'plain-secretary'
const WORKER = 'grant-worker'
const WORKER_OF_RAISED = 'grant-raised-worker'
const CANDIDATE = 'grant-resident-candidate'
const OTHER_SECRETARYS_CANDIDATE = 'grant-other-proposal-candidate'
const ITS_OWN_CANDIDATE = 'grant-own-proposal-candidate'
const NO_GRANTS_CANDIDATE = 'grant-no-grant-candidate'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
let grantId = ''

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

async function made(url: string, headers: Record<string, string>, payload: unknown, answers: 201 | 409 = 201): Promise<string> {
  const filed = await call('POST', url, headers, payload)
  expect(filed.status, filed.raw).toBe(answers)
  return String(filed.body.record?.id ?? filed.body.request?.id ?? filed.body.proposal?.id)
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The last change row, so a case can say what it wrote. */
function marker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

function rowsSince(mark: number): { record_id: string; actor_type: string; actor_id: string; elevation: string | null; press_id: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT record_id, actor_type, actor_id, elevation, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { record_id: string; actor_type: string; actor_id: string; elevation: string | null; press_id: string | null }[]
}

function pressesMarker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM presses_for_the_person').get() as { n: number }).n
}

function pressesSince(mark: number): { agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark) as { agent_id: string; grant_id: string; operation: string; reason: string | null }[]
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))

interface APress {
  method: 'POST' | 'PUT'
  url: string
  body: Record<string, unknown>
  state: () => string | Promise<string>
}

interface ADoor {
  door: string
  /** The door's refusal before it asked the check, which a caller with no grant still hears. */
  oldWords: string
  /** Whether the press that goes through writes a change row. False means only its press row is written. */
  writesAChangeRow: boolean
  make: () => Promise<APress>
}

async function refusedAndNothingChanged(press: APress, who: string, words: string): Promise<string> {
  const before = await press.state()
  const mark = marker()
  const pressMark = pressesMarker()
  const refused = await call(press.method, press.url, as(who), { ...press.body, ...FOR_THE_PERSON })
  expect(refused.status, refused.raw).toBe(403)
  expect(refused.error).toContain(words)
  expect(await press.state(), 'a refused press changed something').toBe(before)
  expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
  expect(pressesSince(pressMark), 'a refused press wrote a press row').toEqual([])
  return refused.error
}

function theFourCases(one: ADoor): void {
  describe(one.door, () => {
    let press: APress
    beforeAll(async () => {
      press = await one.make()
    })

    it('1: with no grant, even with the row at may-press, refuses in its old words and changes nothing', async () => {
      answer(one.door, 'may-press')
      await refusedAndNothingChanged(press, UNRAISED, one.oldWords)
    })

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      await refusedAndNothingChanged(press, RAISED, `The secretary card keeps ${one.door} for the person`)
    })

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(press, RAISED, `keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })

    it('4: with the row at may-press, goes through, and the write names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      const before = await press.state()
      const mark = marker()
      const pressMark = pressesMarker()
      const done = await call(press.method, press.url, as(RAISED), { ...press.body, ...FOR_THE_PERSON })
      expect(done.status, `${one.door}: ${done.raw}`).toBeLessThan(300)
      expect(await press.state(), 'the press changed nothing').not.toBe(before)
      const rows = rowsSince(mark)
      if (one.writesAChangeRow) {
        expect(rows.some((row) => row.actor_id === RAISED && row.elevation !== null), `no change row names the grant: ${JSON.stringify(rows)}`).toBe(true)
        expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
      }
      const presses = pressesSince(pressMark)
      expect(
        presses.some((row) => row.agent_id === RAISED && row.grant_id === grantId && row.operation === one.door),
        `no press row names the secretary, the grant and the door: ${JSON.stringify(presses)}`,
      ).toBe(true)
    })
  })
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const made = [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker'], [CANDIDATE, 'worker'], [OTHER_SECRETARYS_CANDIDATE, 'worker'], [ITS_OWN_CANDIDATE, 'worker'], [NO_GRANTS_CANDIDATE, 'worker']] as const
  for (const [handle, role] of made) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  // THE RAISED SECRETARY'S OWN WORKER, so a request to go first needs it, as the real chain does.
  const underTheRaised = await call('POST', '/api/agents/started', as(RAISED), { handle: WORKER_OF_RAISED, name: WORKER_OF_RAISED, role: 'worker' })
  expect(underTheRaised.status, underTheRaised.raw).toBe(201)
  keys.set(WORKER_OF_RAISED, String(underTheRaised.body.whatToGiveIt?.key ?? ''))
  ids.set(WORKER_OF_RAISED, String(underTheRaised.body.agent?.id ?? ''))
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  grantId = String(raised.body.elevation?.id ?? '')
  expect(grantId).not.toBe('')
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('six person-only doors ask what the grant carries', () => {
  theFourCases({
    door: 'delegation.take',
    oldWords: 'An agent takes a package with the claim it already has',
    writesAChangeRow: true,
    make: async () => {
      const task = await made('/api/records', PERSON, { kind: 'task', title: 'A made-up packaged task', data: {} })
      const packaged = await call('POST', `/api/delegation/${task}/package`, PERSON, {
        moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))],
        forTheOutside: 'Build the made-up module on its own.',
        suits: 'own_module',
        acceptance: 'The made-up module runs on its own and its tests pass.',
        acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
      })
      expect(packaged.status, packaged.raw).toBe(201)
      return {
        method: 'POST',
        url: `/api/delegation/${task}/take`,
        body: {
          who: 'A made-up outside chat',
          comesBack: 'A made-up zip and a note of what it did not finish.',
          byWhen: '2026-10-25',
        },
        state: () => readAll("SELECT json_extract(data, '$.takenOutside') FROM records WHERE id = ?", task),
      }
    },
  })

  theFourCases({
    door: 'delegation.return',
    oldWords: "An agent's return is the ordinary acceptance exactly as it stands today",
    writesAChangeRow: true,
    make: async () => {
      const task = await made('/api/records', PERSON, { kind: 'task', title: 'A made-up packaged task to return', data: {} })
      const packaged = await call('POST', `/api/delegation/${task}/package`, PERSON, {
        moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))],
        forTheOutside: 'Build the made-up module on its own.',
        suits: 'own_module',
        acceptance: 'The made-up module runs on its own and its tests pass.',
        acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
      })
      expect(packaged.status, packaged.raw).toBe(201)
      return {
        method: 'POST',
        url: `/api/delegation/${task}/return`,
        body: { fromOutside: 'A made-up outside chat', words: 'Made-up words that came back.' },
        state: () => readAll("SELECT json_extract(data, '$.returns') FROM records WHERE id = ?", task),
      }
    },
  })

  describe('resident.confirm', () => {
    const theResidentRow = (candidate: string): string =>
      readAll('SELECT resident_since, resident_confirmed_by_kind, resident_confirmed_by_id FROM agents WHERE id = ?', ids.get(candidate))
    const recordsNow = (): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n

    async function aProposalBy(who: string, candidate: string): Promise<string> {
      const proposed = await call('POST', '/api/residents/proposals', as(who), {
        agentId: ids.get(candidate),
        because: 'It has done steady work here for weeks.',
        sleepTime: A_SLEEP_TIME,
      })
      expect(proposed.status, proposed.raw).toBe(201)
      return String(proposed.body.proposal?.id ?? '')
    }

    it('1: with no grant, even at may-press, refuses in its old words and changes nothing', async () => {
      answer('resident.confirm', 'may-press')
      const proposal = await aProposalBy(RAISED, NO_GRANTS_CANDIDATE)
      await refusedAndNothingChanged(
        {
          method: 'POST',
          url: `/api/residents/proposals/${proposal}/confirm`,
          body: {},
          state: () => theResidentRow(NO_GRANTS_CANDIDATE),
        },
        UNRAISED,
        "Confirming a permanent resident is the person's own act",
      )
    })

    it('2: with the row at kept, says it is this office’s answer and writes nothing', async () => {
      answer('resident.confirm', 'kept')
      const proposal = await aProposalBy(UNRAISED, CANDIDATE)
      const before = recordsNow()
      const said = await refusedAndNothingChanged(
        {
          method: 'POST',
          url: `/api/residents/proposals/${proposal}/confirm`,
          body: {},
          state: () => theResidentRow(CANDIDATE),
        },
        RAISED,
        'keeps resident.confirm for the person',
      )
      expect(said).toContain("This office's list of what the grant carries, since")
      expect(recordsNow(), 'a refused press wrote a record').toBe(before)
    })

    it('3: with the row at may-press, another secretary’s proposal is confirmed, and the secretary is named', async () => {
      answer('resident.confirm', 'may-press')
      const proposal = await aProposalBy(UNRAISED, OTHER_SECRETARYS_CANDIDATE)
      const mark = marker()
      const pressMark = pressesMarker()
      const done = await call('POST', `/api/residents/proposals/${proposal}/confirm`, as(RAISED), { ...FOR_THE_PERSON })
      expect(done.status, done.raw).toBe(200)
      const row = t.client.sqlite
        .prepare('SELECT resident_since, resident_confirmed_by_kind, resident_confirmed_by_id FROM agents WHERE id = ?')
        .get(ids.get(OTHER_SECRETARYS_CANDIDATE)) as { resident_since: string | null; resident_confirmed_by_kind: string | null; resident_confirmed_by_id: string | null }
      expect(row.resident_since).not.toBeNull()
      expect(row.resident_confirmed_by_kind).toBe('agent')
      expect(row.resident_confirmed_by_id).toBe(ids.get(RAISED))
      const decision = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(String(done.body.decision?.id)) as { data: string }
      expect((JSON.parse(decision.data) as { decided_by?: string }).decided_by).toBe('the owner')
      const rows = rowsSince(mark)
      expect(rows.filter((one) => one.actor_type === 'human'), `a change row says the person pressed it: ${JSON.stringify(rows)}`).toEqual([])
      expect(
        rows.some((one) => one.actor_id === RAISED && one.elevation !== null),
        `no change row names the secretary and the grant: ${JSON.stringify(rows)}`,
      ).toBe(true)
      expect(pressesSince(pressMark), 'the confirm did not leave exactly one press row naming the secretary, the grant, the door and the reason').toEqual([
        { agent_id: RAISED, grant_id: grantId, operation: 'resident.confirm', reason: A_TESTS_REASON_FOR_THE_PERSON },
      ])
    })

    it('4: its own filing is refused at may-press, and nothing is written', async () => {
      answer('resident.confirm', 'may-press')
      const proposal = await aProposalBy(RAISED, ITS_OWN_CANDIDATE)
      const before = recordsNow()
      const said = await refusedAndNothingChanged(
        {
          method: 'POST',
          url: `/api/residents/proposals/${proposal}/confirm`,
          body: {},
          state: () => theResidentRow(ITS_OWN_CANDIDATE),
        },
        RAISED,
        'never lets the grant press resident.confirm on something the same secretary filed',
      )
      expect(said).toContain('Ask the person to press it.')
      expect(recordsNow(), 'a refused press wrote a record').toBe(before)
    })
  })

  theFourCases({
    door: 'booking.answer',
    oldWords: "A secretary's answer counts only for its own agents",
    writesAChangeRow: true,
    make: async () => {
      const ahead = await call('POST', '/api/bookings', as(WORKER), {
        resource: 'gpu',
        gib: 1,
        minutes: 30,
        purpose: 'a made-up test run',
        start: 'now',
      })
      expect(ahead.status, ahead.raw).toBe(201)
      // THE APPLICANT'S TURN IS AN HOUR AWAY, so the request is still waiting through every case: a request whose
      // booking's own turn has come lapses.
      const mine = await call('POST', '/api/bookings', as(WORKER), {
        resource: 'gpu',
        gib: 1,
        minutes: 30,
        purpose: 'a made-up test run asking to go first',
        start: { at: localStamp(new Date(Date.now() + 60 * 60 * 1000)) },
      })
      expect(mine.status, mine.raw).toBe(201)
      const asked = await call('POST', `/api/bookings/${String(mine.body.booking.id)}/go-first`, as(WORKER), {
        ahead: String(ahead.body.booking.id),
      })
      expect(asked.status, asked.raw).toBe(200)
      return {
        method: 'POST',
        url: `/api/bookings/${String(mine.body.booking.id)}/go-first/answer`,
        body: { grant: false },
        state: () => readAll("SELECT json_extract(data, '$.goFirst.state') FROM records WHERE id = ?", String(mine.body.booking.id)),
      }
    },
  })

  theFourCases({
    door: 'agent.start-a-new-agent',
    oldWords: 'Starting a new agent is the person',
    writesAChangeRow: true,
    make: async () => {
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      await made('/api/records', PERSON, {
        kind: 'message',
        title: 'A made-up message to an unreachable agent',
        data: { body: 'A made-up question waiting for an agent.', to: [{ kind: 'agent', id: ids.get(WORKER) }] },
      }, 409)
      return {
        method: 'POST',
        url: `/api/agents/${String(ids.get(WORKER))}/start-a-new-agent`,
        body: {},
        state: () => readAll("SELECT count(*) AS n FROM records WHERE kind = 'agent' AND deleted_at IS NULL"),
      }
    },
  })

  theFourCases({
    door: 'message.start-an-agent',
    oldWords: 'Starting an agent for a message is the person',
    writesAChangeRow: true,
    make: async () => {
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      const message = await made('/api/records', PERSON, {
        kind: 'message',
        title: 'A made-up message that waits for a press',
        data: { body: 'A made-up question that a run would answer.', to: [{ kind: 'agent', id: ids.get(WORKER) }] },
      }, 409)
      return {
        method: 'POST',
        url: `/api/messages/${message}/start-an-agent`,
        body: {},
        state: () => readAll("SELECT json_extract(data, '$.runWasAskedFor') FROM records WHERE id = ?", message),
      }
    },
  })

  theFourCases({
    door: 'message.not-now',
    oldWords: "Not now is the person's answer to an offer drawn on their screen",
    writesAChangeRow: false,
    make: async () => {
      const note = await made('/api/records', PERSON, { kind: 'note', title: 'A made-up place to be led to', data: { date: '2026-10-21', body: 'A made-up note.' } })
      const offer = await made('/api/records', as(WORKER), {
        kind: 'message',
        title: 'A made-up offer to the person',
        data: {
          body: 'Come and look at the made-up note.',
          to: [{ kind: 'person', id: THE_PERSON }],
          lead: { target: { kind: 'record', recordId: note, workspaceId: 'default' } },
        },
      })
      return {
        method: 'POST',
        url: `/api/messages/${offer}/not-now`,
        body: {},
        state: () =>
          readAll(
            "SELECT offer_put_off_at FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person' AND recipient_id = ?",
            offer,
            THE_PERSON,
          ),
      }
    },
  })
})

describe('booking.answer asks a secretary’s own right before the grant', () => {
  async function aBooking(who: string, start: 'now' | { at: string }): Promise<string> {
    const booked = await call('POST', '/api/bookings', as(who), {
      resource: 'gpu',
      gib: 1,
      minutes: 30,
      purpose: 'a made-up test run',
      start,
    })
    expect(booked.status, booked.raw).toBe(201)
    return String(booked.body.booking?.id ?? '')
  }
  const anHourFromNow = (): { at: string } => ({ at: localStamp(new Date(Date.now() + 60 * 60 * 1000)) })
  const theRequest = (booking: string): string => readAll("SELECT json_extract(data, '$.goFirst') AS goFirst FROM records WHERE id = ?", booking)

  it('1: a secretary the request needs answers as itself where this office keeps the door, and names no grant', async () => {
    answer('booking.answer', 'kept')
    const ahead = await aBooking(WORKER_OF_RAISED, 'now')
    const mine = await aBooking(WORKER_OF_RAISED, anHourFromNow())
    const asked = await call('POST', `/api/bookings/${mine}/go-first`, as(WORKER_OF_RAISED), { ahead })
    expect(asked.status, asked.raw).toBe(200)
    const mark = marker()
    const pressMark = pressesMarker()
    const done = await call('POST', `/api/bookings/${mine}/go-first/answer`, as(RAISED), { ...FOR_THE_PERSON, grant: true })
    expect(done.status, done.raw).toBe(200)
    expect(done.body.state).toBe('granted')
    expect(pressesSince(pressMark), 'an answer in its own right wrote a press row').toEqual([])
    const rows = rowsSince(mark)
    expect(rows.filter((one) => one.actor_type === 'human'), `a change row says the person answered it: ${JSON.stringify(rows)}`).toEqual([])
    expect(rows.some((one) => one.record_id === mine && one.actor_id === RAISED), `no change row names the secretary: ${JSON.stringify(rows)}`).toBe(true)
    expect(rows.filter((one) => one.elevation !== null), 'an answer in its own right named the grant').toEqual([])
  })

  it('2: a secretary granting its own request at may-press is refused for its own filing, and the request still waits', async () => {
    answer('booking.answer', 'may-press')
    const ahead = await aBooking(WORKER, 'now')
    const mine = await aBooking(RAISED, anHourFromNow())
    const asked = await call('POST', `/api/bookings/${mine}/go-first`, as(RAISED), { ahead })
    expect(asked.status, asked.raw).toBe(200)
    const before = theRequest(mine)
    const mark = marker()
    const pressMark = pressesMarker()
    const refused = await call('POST', `/api/bookings/${mine}/go-first/answer`, as(RAISED), { ...FOR_THE_PERSON, grant: true })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press booking.answer on something the same secretary filed')
    expect(theRequest(mine), 'a refused press settled the request').toBe(before)
    expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
    expect(pressesSince(pressMark), 'a refused press wrote a press row').toEqual([])
  })
})

describe('starting an agent under the grant names the secretary who pressed', () => {
  async function aWaitingMessage(title: string): Promise<string> {
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    return await made('/api/records', PERSON, {
      kind: 'message',
      title,
      data: { body: 'A made-up question waiting for a press.', to: [{ kind: 'agent', id: ids.get(WORKER) }] },
    }, 409)
  }

  async function theMark(messageId: string): Promise<Record<string, unknown>> {
    const read = await call('GET', `/api/records/${messageId}`, PERSON)
    expect(read.status, read.raw).toBe(200)
    return ((read.body.record?.data ?? {}) as Record<string, unknown>)['runWasAskedFor'] as Record<string, unknown>
  }

  async function theReasonToTheAgent(messageId: string): Promise<string> {
    const read = await call('GET', `/api/messages/${messageId}`, PERSON)
    expect(read.status, read.raw).toBe(200)
    const rows = (read.body.message?.deliveries ?? []) as { because: string | null; to: { kind: string } }[]
    const toTheAgent = rows.filter((one) => one.to.kind === 'agent')
    expect(toTheAgent).toHaveLength(1)
    return String(toTheAgent[0]?.because ?? '')
  }

  it('message.start-an-agent: the mark and the reason name the secretary and the grant, never the person', async () => {
    answer('message.start-an-agent', 'may-press')
    const message = await aWaitingMessage('A made-up message that waits for the secretary')
    const pressed = await call('POST', `/api/messages/${message}/start-an-agent`, as(RAISED), { ...FOR_THE_PERSON })
    expect(pressed.status, pressed.raw).toBeLessThan(300)

    const asked = await theMark(message)
    expect(asked['by']).toBe(RAISED)
    expect(asked['by']).not.toBe(THE_PERSON)

    const because = await theReasonToTheAgent(message)
    expect(because).toContain(RAISED)
    expect(because).toContain("under the person's grant")
    expect(because).not.toContain(THE_PERSON)
  })

  it("the person's own message.start-an-agent press still names the person, word for word", async () => {
    const message = await aWaitingMessage('A made-up message the person starts')
    const pressed = await call('POST', `/api/messages/${message}/start-an-agent`, PERSON, {})
    expect(pressed.status, pressed.raw).toBeLessThan(300)

    const asked = await theMark(message)
    expect(asked['by']).toBe(THE_PERSON)
    expect(await theReasonToTheAgent(message)).toBe(
      `${THE_PERSON} pressed to start an agent for this message at ${String(asked['at'])}, so a run may be started for it.`,
    )
  })

  it('agent.start-a-new-agent: each moved message names the secretary and the grant, and the new agent reports to the person', async () => {
    answer('agent.start-a-new-agent', 'may-press')
    const message = await aWaitingMessage('A made-up message the secretary carries')
    const pressed = await call('POST', `/api/agents/${String(ids.get(WORKER))}/start-a-new-agent`, as(RAISED), { ...FOR_THE_PERSON })
    expect(pressed.status, pressed.raw).toBeLessThan(300)

    const madeAgent = String(pressed.body.agent ?? '')
    expect(madeAgent).not.toBe('')
    const agentRecord = await call('GET', `/api/records/${madeAgent}`, PERSON)
    expect(agentRecord.status, agentRecord.raw).toBe(200)
    expect(agentRecord.body.record?.data?.['startedBy']).toEqual({ kind: 'person', id: THE_PERSON })

    const moved = (pressed.body.moved ?? []) as string[]
    expect(moved.length).toBeGreaterThan(0)
    for (const copy of moved) {
      const asked = await theMark(copy)
      expect(asked['by']).toBe(RAISED)
      expect(asked['by']).not.toBe(THE_PERSON)
      const because = await theReasonToTheAgent(copy)
      expect(because).toContain(RAISED)
      expect(because).toContain("under the person's grant")
      expect(because).not.toContain(THE_PERSON)
    }
  })

  it("the person's own agent.start-a-new-agent press still names the person, and the new agent reports to the person", async () => {
    const message = await aWaitingMessage('A made-up message the person carries')
    const pressed = await call('POST', `/api/agents/${String(ids.get(WORKER))}/start-a-new-agent`, PERSON, {})
    expect(pressed.status, pressed.raw).toBeLessThan(300)

    const madeAgent = String(pressed.body.agent ?? '')
    const agentRecord = await call('GET', `/api/records/${madeAgent}`, PERSON)
    expect(agentRecord.body.record?.data?.['startedBy']).toEqual({ kind: 'person', id: THE_PERSON })

    const moved = (pressed.body.moved ?? []) as string[]
    expect(moved.length).toBeGreaterThan(0)
    for (const copy of moved) {
      const asked = await theMark(copy)
      expect(asked['by']).toBe(THE_PERSON)
      expect(await theReasonToTheAgent(copy)).toBe(
        `${THE_PERSON} pressed to start an agent for this message at ${String(asked['at'])}, so a run may be started for it.`,
      )
    }
  })
})
