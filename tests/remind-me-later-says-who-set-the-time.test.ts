// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMIND ME LATER RECORDS WHO SET THE TIME, AND THE DOOR ASKS WHAT THE GRANT CARRIES. Wave 13s round 68.
 *
 * The person's grant lets the secretary press some of the person's doors for them. Remind me later used to refuse
 * everybody but the person in its own code, and nothing stored who set `remind_at`, so the line that brings the message
 * back always said the person asked for it. This file holds the two halves together:
 *
 *   1. THE DOOR, through its route. An agent with no grant hears the old refusal word for word, even where this
 *      office's list says may-press. A secretary holding the grant is refused in the check's words where this office
 *      has no row, told it is this office's answer where the row says kept, and let through where the row says
 *      may-press. Under the grant the delivery moved is the person's, never the secretary's, and the row and the press
 *      name the secretary and the grant, never the person.
 *   2. THE TIME AND THE LINE. A press by the person records them; a press under the grant records the secretary; a row
 *      written before this round records nobody. The line that brings the message back says the secretary set it under
 *      the grant only where the secretary did, and still waits on the person, so Needs you counts it.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The two secretaries and the
 * worker are made-up agents, each holding the key the office answered. Every record here is synthetic. This office's
 * answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * THE CLOCK IS THIS TEST'S OWN WHERE THE LINE IS READ: only `Date` is faked, and the timer's pass is driven with the
 * moment this file sets.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of the door's guard and the granted cases go red naming
 * the door; write the caller's delivery rather than the person's and the "the person's delivery moved" case goes red;
 * always say the person set the time and the secretary's line case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { sayInEnglish } from '../src/shared/i18n.ts'
import { isABroughtBackLine, theBackAsYouAskedLine } from '../src/shared/office-lines.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'grant-remind-secretary'
const UNRAISED = 'plain-remind-secretary'
const WORKER = 'remind-worker'

/** The refusal an agent with no grant heard before this round, word for word. */
const THE_OLD_REFUSAL =
  `Remind me later is the person's own act. Nothing was written. This request named the agent "${UNRAISED}", and its ` +
  'key proves that agent. An agent\'s key never proves the person. The person presses it in the chat.'

/** The words the line that brings the message back carries when the secretary set the time under the grant. */
const THE_SECRETARY_LINE = 'Back, as the secretary set it'
const THE_SECRETARY_SAID = 'The secretary set this reminder for you under your grant, and this is the one reminder.'

const MINUTE = 60_000
const START = new Date(2026, 9, 21, 10, 0, 0).getTime()

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
let noteId = ''

const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const answered = new Set<string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

async function made(url: string, headers: Record<string, string>, payload: unknown): Promise<string> {
  const filed = await call('POST', url, headers, payload)
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record?.id ?? '')
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** A message to the person that carries an offer to take them to a page, which Remind me later stands beside. */
async function anOffer(words: string): Promise<string> {
  return made('/api/records', as(WORKER), {
    kind: 'message',
    title: words.slice(0, 40),
    data: { body: words, to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: noteId, workspaceId: 'default' } } },
  })
}

/** The person's delivery of one message, with every column the row holds. */
function theDelivery(id: string): Record<string, unknown> | undefined {
  return t.client.sqlite
    .prepare("SELECT * FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
    .get(id) as Record<string, unknown> | undefined
}

/** Every press a secretary made for the person, oldest first. */
function thePresses(): { agent_id: string; grant_id: string; operation: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT * FROM presses_for_the_person ORDER BY rowid').all() as {
    agent_id: string
    grant_id: string
    operation: string
    reason: string | null
  }[]
}

/** Every line the office wrote about one message, with the words and who it was addressed to. */
function theLinesAbout(id: string): { id: string; body: string; said: string | null; to: unknown; sentBy: unknown }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutMessage') = ?")
    .all(id) as { id: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { body: string; saidInFull?: string | null; to: unknown; sentBy: unknown }
    return { id: row.id, body: data.body, said: data.saidInFull ?? null, to: data.to, sentBy: data.sentBy }
  })
}

/** How many change rows the test has written, so a refused press can be shown to write none. */
function marker(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

function changesSince(mark: number): { actor_type: string; actor_id: string }[] {
  return t.client.sqlite.prepare('SELECT actor_type, actor_id FROM changes WHERE rowid > ? ORDER BY rowid').all(mark) as { actor_type: string; actor_id: string }[]
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RAISED, 'secretary'], [UNRAISED, 'secretary'], [WORKER, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  noteId = await made('/api/records', PERSON, { kind: 'note', title: 'A made-up place to be led to', data: { date: '2026-10-21', body: 'A made-up note.' } })
}, 60_000)

beforeEach(() => {
  // A reminder left by an earlier case is not this case's, and the timer reads every row whose time has come.
  t.client.sqlite.prepare('UPDATE message_delivery SET remind_at = NULL, reminded_at = NULL').run()
})

afterEach(() => {
  vi.useRealTimers()
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the door asks what the grant carries', () => {
  it('refuses an agent with no grant in its old words, whatever this office says, and writes nothing', async () => {
    answer('message.remind-me-later', 'may-press')
    const offer = await anOffer('Come and look at the note, case one.')
    const before = JSON.stringify(theDelivery(offer))
    const refused = await call('POST', `/api/messages/${offer}/remind-me-later`, as(UNRAISED), { choice: 'in-30-minutes', ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toBe(THE_OLD_REFUSAL)
    expect(JSON.stringify(theDelivery(offer)), 'a refused press changed the delivery').toBe(before)
  })

  it('refuses a granted secretary where this office has no row, in the check’s words naming the door', async () => {
    const offer = await anOffer('Come and look at the note, case two.')
    const before = JSON.stringify(theDelivery(offer))
    const refused = await call('POST', `/api/messages/${offer}/remind-me-later`, as(RAISED), { choice: 'in-30-minutes', ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('The secretary card keeps message.remind-me-later for the person')
    expect(JSON.stringify(theDelivery(offer)), 'a refused press changed the delivery').toBe(before)
  })

  it('says the refusal is this office’s answer where the row is kept, and writes nothing', async () => {
    answer('message.remind-me-later', 'kept')
    const offer = await anOffer('Come and look at the note, case three.')
    const before = JSON.stringify(theDelivery(offer))
    const refused = await call('POST', `/api/messages/${offer}/remind-me-later`, as(RAISED), { choice: 'in-30-minutes', ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain("This office's list of what the grant carries, since")
    expect(refused.error).toContain('keeps message.remind-me-later for the person')
    expect(JSON.stringify(theDelivery(offer)), 'a refused press changed the delivery').toBe(before)
  })

  it('lets a granted secretary move the person’s delivery, and names the secretary and the grant, never the person', async () => {
    answer('message.remind-me-later', 'may-press')
    const offer = await anOffer('Come and look at the note, case four.')
    const before = theDelivery(offer)
    const mark = marker()
    const done = await call('POST', `/api/messages/${offer}/remind-me-later`, as(RAISED), { choice: 'in-30-minutes', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)

    const after = theDelivery(offer)
    expect(after?.['recipient_kind'], 'the delivery moved is not the person’s').toBe('person')
    expect(after?.['recipient_id'], 'the delivery moved is not the person’s').toBe(THE_PERSON)
    expect(after?.['remind_at'], 'the press wrote no time').not.toBeNull()
    expect(after?.['remind_at']).not.toBe(before?.['remind_at'])
    expect(after?.['remind_set_by_kind'], 'the time does not name the secretary').toBe('agent')
    expect(after?.['remind_set_by_id'], 'the time does not name the secretary').toBe(RAISED)

    const press = thePresses().at(-1)
    expect(press?.agent_id, 'the press names nobody').toBe(RAISED)
    expect(press?.grant_id, 'the press names no grant').not.toBe('')
    expect(press?.operation).toBe('message.remind-me-later')
    expect(press?.reason).toBe(A_TESTS_REASON_FOR_THE_PERSON)

    const rows = changesSince(mark)
    expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
  })
})

describe('the line says who set the time', () => {
  it('says the secretary set it under the grant, and Needs you still counts the line', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    answer('message.remind-me-later', 'may-press')
    const offer = await anOffer('Come and look at the note, the line case.')
    const done = await call('POST', `/api/messages/${offer}/remind-me-later`, as(RAISED), { choice: 'in-30-minutes', ...FOR_THE_PERSON })
    expect(done.status, done.raw).toBe(200)
    expect((await call('POST', `/api/messages/${offer}/mark`, PERSON, { mark: 'seen' })).status).toBe(200)

    const { bringBackTheMessagesThatAreDue } = await import('../src/server/lib/remind-me-later.ts')
    const due = bringBackTheMessagesThatAreDue(new Date(START + 30 * MINUTE))
    expect(due.failed).toEqual([])
    expect(due.back.map((one) => one.messageId)).toEqual([offer])
    const lines = theLinesAbout(offer)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.to).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(lines[0]?.body, 'the line says the person asked for it').toBe(THE_SECRETARY_LINE)
    expect(lines[0]?.said, 'the line says the person asked for it').toBe(THE_SECRETARY_SAID)
    const line = { sentBy: moleOffice(), body: lines[0]?.body ?? '' }
    expect(isABroughtBackLine(line), 'the line no longer counts as one that waits on the person').toBe(true)

    const lineId = due.back[0]?.line ?? ''
    vi.setSystemTime(START + 31 * MINUTE)
    const waiting = await call('GET', '/api/messages?only=waiting-for-me', PERSON)
    expect((waiting.body.messages as { id: string }[]).map((one) => one.id)).toContain(lineId)
    const needs = await call('GET', '/api/waiting', PERSON)
    expect(JSON.stringify(needs.body), 'Needs you does not list the line').toContain(lineId)
  })

  it('keeps today’s words where the person set the time or nobody recorded who did', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    const byThePerson = await anOffer('Come and look at the note, the person set it.')
    const pressed = await call('POST', `/api/messages/${byThePerson}/remind-me-later`, PERSON, { choice: 'in-2-hours' })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(theDelivery(byThePerson)?.['remind_set_by_kind'], 'the person’s press records nobody').toBe('human')
    expect(theDelivery(byThePerson)?.['remind_set_by_id']).toBe(THE_PERSON)

    // AN OLDER ROW: a time set before this round, with nobody recorded beside it.
    const unknown = await anOffer('Come and look at the note, nobody recorded who set it.')
    t.client.sqlite
      .prepare("UPDATE message_delivery SET remind_at = '2026-10-21 12:00:00', reminded_at = NULL WHERE message_id = ? AND recipient_kind = 'person'")
      .run(unknown)

    const { bringBackTheMessagesThatAreDue } = await import('../src/server/lib/remind-me-later.ts')
    const due = bringBackTheMessagesThatAreDue(new Date(START + 120 * MINUTE))
    expect(due.failed).toEqual([])
    expect(due.back.map((one) => one.messageId).sort()).toEqual([byThePerson, unknown].sort())
    for (const id of [byThePerson, unknown]) {
      const lines = theLinesAbout(id)
      expect(lines, `${id} did not come back once`).toHaveLength(1)
      expect(lines[0]?.body, `${id} did not keep today’s words`).toBe(theBackAsYouAskedLine(sayInEnglish).line)
      expect(lines[0]?.said, `${id} did not keep today’s words`).toBe(theBackAsYouAskedLine(sayInEnglish).said)
      expect(isABroughtBackLine({ sentBy: moleOffice(), body: lines[0]?.body ?? '' })).toBe(true)
    }
  })
})
