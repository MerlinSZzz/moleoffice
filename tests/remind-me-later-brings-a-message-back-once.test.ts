// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMIND ME LATER BRINGS A MESSAGE BACK ONCE, AT THE CHOSEN TIME, KEPT BY THE OFFICE ACROSS A RESTART, AND ONLY THE
 * PERSON MAY PRESS IT. That is a decision, in wave 13n round 45.
 *
 *   1. The press (POST /api/messages/:id/remind-me-later) stores the time the person chose. Before that time the office
 *      writes nothing; at it, the office writes one line to the person, about the message and carrying its offer, and
 *      the line waits on the person (Needs you lists it). A second pass writes nothing more.
 *   2. The time is the office's and not a page's: a fresh load of the timer's module, as after a restart, brings the
 *      message back on its first tick, with no page open.
 *   3. An agent's press is refused in words, a choice outside the three is refused, and nothing is written.
 *   4. The three times are worked out in one place: 30 minutes, 2 hours, and the next 07:00.
 *
 * THE CLOCK IS THIS TEST'S OWN. Only `Date` is faked, and the timer's pass is driven with the moment this file sets.
 *
 * MUTATIONS, each named in the commit that meets this file, after a control run: the pass leaves out the
 * `reminded_at` write (case 1 goes red, the second pass writes again); the pass ignores the time (case 1 goes red
 * before the time); the timer's first tick is taken out (case 2 goes red); the door lets an agent press it (case 3
 * goes red); the morning choice is 08:00 (case 4 goes red).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whenAPutOffMessageComesBack } from '../src/shared/remind-me-later.ts'

let t: TestDb
let app: FastifyInstance
let placeId = ''

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const GUIDE = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'guide-rl' }

const MINUTE = 60_000
const START = new Date(2026, 9, 7, 10, 0, 0).getTime()

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function anOffer(words: string): Promise<string> {
  const made = await inject('POST', '/api/records', GUIDE, {
    kind: 'message',
    title: words.slice(0, 40),
    data: {
      body: words,
      to: [{ kind: 'person', id: THE_PERSON }],
      lead: { target: { kind: 'record', recordId: placeId, workspaceId: 'default' } },
    },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return (made.body['record'] as { id: string }).id
}

/** Every line the office wrote about message `id`, with its addressee and its offer. */
function theLinesAbout(id: string): { to: unknown; lead: unknown }[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutMessage') = ?")
    .all(id) as { data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to: unknown; lead: unknown }
    return { to: data.to, lead: data.lead }
  })
}

function theDeliveryOf(id: string): { remind_at: string | null; reminded_at: string | null } | undefined {
  return t.client.sqlite
    .prepare("SELECT remind_at, reminded_at FROM message_delivery WHERE message_id = ? AND recipient_kind = 'person'")
    .get(id) as { remind_at: string | null; reminded_at: string | null } | undefined
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await inject('POST', '/api/agents/started', PERSON, { handle: 'guide-rl', name: 'Guide RL', workArea: ['src'] })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const note = await inject('POST', '/api/records', PERSON, {
    kind: 'note',
    title: 'The place the guide offers to show',
    data: { date: '2026-10-07', body: 'A note to be led to.' },
  })
  expect(note.status, JSON.stringify(note.body)).toBe(201)
  placeId = (note.body['record'] as { id: string }).id
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('Remind me later', () => {
  it('brings the message back once, at the chosen time, as a line that waits on the person', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    const id = await anOffer('Come and look at the note, case one.')
    const pressed = await inject('POST', `/api/messages/${id}/remind-me-later`, PERSON, { choice: 'in-30-minutes' })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(pressed.body['remindAt']).toBe('2026-10-07 10:30:00')
    // THE PERSON READS IT NOW, so what waits later is the line the office writes and not the first message.
    expect((await inject('POST', `/api/messages/${id}/mark`, PERSON, { mark: 'seen' })).status).toBe(200)

    const { bringBackTheMessagesThatAreDue } = await import('../src/server/lib/remind-me-later.ts')
    expect(bringBackTheMessagesThatAreDue(new Date(START + 29 * MINUTE)).back, 'it came back before its time').toEqual([])
    expect(theLinesAbout(id)).toEqual([])

    const due = bringBackTheMessagesThatAreDue(new Date(START + 30 * MINUTE))
    expect(due.failed).toEqual([])
    expect(due.back.map((one) => one.messageId)).toEqual([id])
    const lines = theLinesAbout(id)
    expect(lines).toHaveLength(1)
    expect(lines[0]?.to).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(lines[0]?.lead, 'the line does not carry the first offer').toMatchObject({ target: { kind: 'record', recordId: placeId, workspaceId: 'default' } })

    // IT WAITS ON THE PERSON: the waiting-for-me read and Needs you both hold the line.
    const lineId = due.back[0]?.line ?? ''
    vi.setSystemTime(START + 31 * MINUTE)
    const waiting = await inject('GET', '/api/messages?only=waiting-for-me', PERSON)
    expect((waiting.body['messages'] as { id: string }[]).map((one) => one.id)).toContain(lineId)
    const needs = await inject('GET', '/api/waiting', PERSON)
    expect(JSON.stringify(needs.body), 'Needs you does not list the line').toContain(lineId)

    // ONCE.
    expect(bringBackTheMessagesThatAreDue(new Date(START + 90 * MINUTE)).back, 'it came back twice').toEqual([])
    expect(theLinesAbout(id)).toHaveLength(1)
  })

  it('is kept by the office: a fresh start of the timer brings it back on its first tick', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    const id = await anOffer('Come and look at the note, case two.')
    const pressed = await inject('POST', `/api/messages/${id}/remind-me-later`, PERSON, { choice: 'in-2-hours' })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(theDeliveryOf(id)?.remind_at).toBe('2026-10-07 12:00:00')

    // THE OFFICE WAS DOWN AT 12:00 AND COMES BACK AT 12:40. Nothing of the press is held in memory: the module is
    // loaded afresh, as a restart loads it, and its first tick runs when it starts.
    vi.setSystemTime(START + 160 * MINUTE)
    vi.resetModules()
    const fresh = await import('../src/server/lib/remind-me-later.ts')
    const said: string[] = []
    fresh.startBringingMessagesBack((line) => said.push(line))
    expect(theLinesAbout(id), `the first tick after the restart did not bring it back: ${said.join(' | ')}`).toHaveLength(1)
    expect(theDeliveryOf(id)?.reminded_at).toBe('2026-10-07 12:40:00')
  })

  it("refuses an agent's press and a choice outside the three, in words, and writes nothing", async () => {
    const id = await anOffer('Come and look at the note, case three.')
    const byAnAgent = await inject('POST', `/api/messages/${id}/remind-me-later`, GUIDE, { choice: 'in-30-minutes' })
    expect(byAnAgent.status, JSON.stringify(byAnAgent.body)).toBe(403)
    expect(String(byAnAgent.body['error'])).toContain("Remind me later is the person's own act")
    const outside = await inject('POST', `/api/messages/${id}/remind-me-later`, PERSON, { choice: 'in-a-week' })
    expect(outside.status, JSON.stringify(outside.body)).toBe(400)
    expect(theDeliveryOf(id)?.remind_at ?? null, 'a refused press wrote a time').toBe(null)
  })

  it('works out the three times in one place', () => {
    const at = (h: number, m: number) => new Date(2026, 9, 7, h, m, 0)
    expect(whenAPutOffMessageComesBack('in-30-minutes', at(23, 50))).toBe('2026-10-08 00:20:00')
    expect(whenAPutOffMessageComesBack('in-2-hours', at(10, 0))).toBe('2026-10-07 12:00:00')
    expect(whenAPutOffMessageComesBack('at-7-next-morning', at(22, 0))).toBe('2026-10-08 07:00:00')
    expect(whenAPutOffMessageComesBack('at-7-next-morning', at(1, 0))).toBe('2026-10-07 07:00:00')
    expect(whenAPutOffMessageComesBack('at-7-next-morning', at(7, 0))).toBe('2026-10-08 07:00:00')
  })
})
