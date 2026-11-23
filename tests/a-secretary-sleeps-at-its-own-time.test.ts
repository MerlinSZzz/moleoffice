// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT SLEEPS AT ITS OWN TIME, AND THE OFFICE REMINDS IT TO PUT ITS MEMORY, NOTES AND HANDOVER IN ORDER FIRST.
 *
 * The person's decisions of 3 October 2026: a resident sleeps, a postponed sleep is shown on the agent and sent to
 * nobody, and non-urgent messages wait until it wakes.
 * On 6 November each resident sets its own sleep time, at the hour its department is least
 * affected.
 * At points 3 and 4 of another decision, the message at the start of the sleep asks it to tidy as well,
 * and a checklist with many open items is a thing to look at, never a gate. The door is
 * src/server/lib/sleep-windows.ts; the rows are in src/server/lib/resident-sleep.ts.
 *
 * WHAT IS PROVED HERE (every name, path and value is made up; the zone is Europe/London in January, so the office's
 * clock reads UTC):
 *   quiet     1. with no sleep time set, a minute of the clock is one read: no write, no message and no log line, and
 *                the started timer is the same read each minute and nothing else;
 *   door      2. the secretary itself and the person each set and change its sleep time; "3:00" is stored as 03:00 and
 *                the reply shows what was stored, the zone and when the next sleep begins;
 *   refused   3. another agent, a request with no key, an agent that is not a resident, a time that is no time and a
 *                length out of bounds are refused, and nothing is written; a resident without the secretary card sets
 *                its own time;
 *   clock     4. the clock begins the sleep when its time opens, by Mole Office, with one reminder, once, and ends it
 *                when the time is over; the next day it begins again; a wake press is not undone; a time set inside
 *                its own window waits for the next one;
 *   postpone  5. a postponed sleep during the office's sleep ends it, writes one postponed row, sends nothing and does
 *                not begin again; a sleep begun by a press still cannot be postponed;
 *   words     6. the reminder names the memory folder, the notebook and the handover by their doors, asks it to tidy,
 *                names a checklist with more open items than the limit and not one at the limit, and gives no path to
 *                anybody's home;
 *   handed    7. its waiter is handed the reminder and keeps back what is not urgent; the worker's row says the
 *                waiting door hands it; marked seen, it is not handed again;
 *   seen      8. the chat's presence line and the resident's reading carry the sleep time and when the sleep ends;
 *   fails     9. a minute of the started clock that throws is one line in the log, and the next minute runs as before.
 *
 * MUTATIONS (each after a green control run, then restored; logs in the round's out/ folder):
 *   quiet     the clock reads the residents before it asks whether any time is set           → 1 goes red;
 *   door      the door stores the time as sent, not as HH:MM                                  → 2 goes red;
 *   refused   the secretary-card check put back into `setASleepTime`                            → 3 goes red;
 *   clock     the "no row since the start" check taken out of the clock                       → 4 goes red;
 *   clock     the "set before the start" check taken out of the clock                         → 4 goes red;
 *   postpone  `postponeASleep` refuses during the office's sleep as before                    → 5 goes red;
 *   words     the limit read as "at least" instead of "more than"                             → 6 goes red;
 *   handed    `whatTheWaiterIsHanded` hands only urgent messages again                         → 7 goes red;
 *   seen      `theSleepLineOf` leaves out `sleepTime`                                         → 8 goes red;
 *   fails     the catch in `startTheSleepClock` taken out                                      → 9 goes red;
 *   refused   the sleep-time door names its act in the wake door's words                       → 3 goes red;
 *   refused   `theResidentToActOn` names the resident by the reference it was sent             → 3 and 5 go red;
 *   handed    the waiting door's note leaves the reminder out                                  → 7 and 8 go red;
 *   handed    the queue says of the reminder what it says of a held message                    → 7 and 8 go red;
 *   handed    the queue says of every held message what it says of the reminder                → 7 and 8 go red;
 *   handed    `heldWhileItSleeps` gives the reminder's words for both                          → 7 and 8 go red.
 *
 * THE WORDS ARE READ FROM THE CODE THAT SAYS THEM, as the owner's rule asks (a value that can change is not written
 * into a test): a refusal from the function that throws it, called in the test's own process, and a note or a row of
 * the worker's queue from the export the door and the queue use. Where 7 goes red before its end, 8 goes red with it:
 * 7's resident is then still asleep, so 8's first tick wakes it too.
 */

import { homedir } from 'node:os'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const zoneBefore = process.env.TZ

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

async function started(handle: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
  return { id, key }
}
const as = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

/** The words a refused call threw, or a failure saying it was not refused, so a test compares a door with the code that says them. */
function refusalOf(run: () => unknown): string {
  try {
    run()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected the call to be refused, but it returned')
}

function count(sql: string, ...args: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...args) as { n: number }).n
}

/** Propose and confirm, by a secretary and the person. */
async function makeAResident(handle: string): Promise<void> {
  const proposed = await inject('POST', '/api/residents/proposals', as('sec-made-up'), { agentId: handle, because: 'It has done steady work here for weeks.', sleepTime: { startsAt: '12:00', minutes: 60 } })
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await inject('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, AS_THE_PERSON)
  expect(confirmed.status, confirmed.text).toBe(200)
}

async function sendTo(handle: string, body: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: idOf(handle) }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, filed.text).toBe(409)
  return String(filed.json['record'].id)
}

/** Set a sleep time at a moment this test chooses, as `who`. */
async function setTheTime(when: string, handle: string, headers: Record<string, string>, body: unknown): Promise<Reply> {
  vi.setSystemTime(new Date(when))
  return inject('PUT', `/api/residents/${idOf(handle)}/sleep-time`, headers, body)
}

let clock: typeof import('../src/server/lib/sleep-windows.ts')

/** One minute of the sleep clock, at a moment this test chooses. */
async function tickAt(when: string, log: (line: string) => void = () => {}): Promise<{ began: string[]; woke: string[] }> {
  clock ??= await import('../src/server/lib/sleep-windows.ts')
  vi.setSystemTime(new Date(when))
  return clock.aMinuteOfTheSleepClock(Date.parse(when), log)
}

interface ARow {
  id: string
  what: string
  began_at: string
  ended_at: string | null
  by_kind: string
  by_id: string
  wakes_at: string | null
  reminder_id: string | null
}
const rowsOf = (handle: string): ARow[] =>
  t.client.sqlite.prepare('SELECT * FROM resident_sleeps WHERE agent_id = ? ORDER BY began_at, rowid').all(idOf(handle)) as ARow[]
const remindersTo = (handle: string): number =>
  count(
    "SELECT count(*) AS n FROM records r JOIN message_delivery d ON d.message_id = r.id WHERE r.kind = 'message' AND json_extract(r.data, '$.notice') = 'yourSleepTimeHasBegun' AND d.recipient_id = ?",
    idOf(handle),
  )

beforeAll(async () => {
  process.env.TZ = 'Europe/London'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2030-01-15T00:00:00Z'))
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-made-up', 'secretary')
  for (const handle of ['sec-door', 'sec-clock', 'sec-postpone', 'sec-words', 'sec-waiter', 'sec-seen', 'sec-not-resident']) await started(handle, 'secretary')
  for (const handle of ['res-worker', 'other-one']) await started(handle, 'worker')
})

afterAll(async () => {
  await app.close()
  t.close()
  vi.useRealTimers()
  if (zoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = zoneBefore
})

describe('a minute with nothing due', () => {
  it('1: with no sleep time set, the clock reads once, and writes, sends and logs nothing', async () => {
    const sqlite = t.client.sqlite
    const sleeps = count('SELECT count(*) AS n FROM resident_sleeps')
    const messages = count("SELECT count(*) AS n FROM records WHERE kind = 'message'")
    const log = vi.fn()
    // THE MODULE IS LOADED FIRST, so what it prepares on loading is not counted as the minute's read.
    clock ??= await import('../src/server/lib/sleep-windows.ts')

    const prepared = vi.spyOn(sqlite, 'prepare')
    let done: { began: string[]; woke: string[] }
    try {
      done = await tickAt('2030-01-15T00:05:00Z', log)
      expect(prepared).toHaveBeenCalledTimes(1)
      expect(String(prepared.mock.calls[0]![0]).trim()).toMatch(/^SELECT/i)
    } finally {
      prepared.mockRestore()
    }
    expect(done).toEqual({ began: [], woke: [] })
    expect(log).not.toHaveBeenCalled()

    // THE STARTED TIMER, a few times a second here: each minute is that same one read, and nothing is logged.
    const each = vi.spyOn(sqlite, 'prepare')
    const timer = clock.startTheSleepClock(log, 20)
    try {
      await new Promise((go) => setTimeout(go, 150))
    } finally {
      clearInterval(timer)
    }
    const asked = each.mock.calls.map((call) => String(call[0]))
    each.mockRestore()
    expect(asked.length).toBeGreaterThan(1)
    expect(new Set(asked).size).toBe(1)
    expect(log).not.toHaveBeenCalled()
    expect(count('SELECT count(*) AS n FROM resident_sleeps')).toBe(sleeps)
    expect(count("SELECT count(*) AS n FROM records WHERE kind = 'message'")).toBe(messages)
  })
})

describe('the sleep-time door', () => {
  it('2: the secretary and the person set and change it; the time is stored as HH:MM and shown back with the zone and the next sleep', async () => {
    await makeAResident('sec-door')
    const id = idOf('sec-door')

    const byItself = await setTheTime('2030-01-15T00:10:00Z', 'sec-door', as('sec-door'), { startsAt: '3:00', minutes: 120 })
    expect(byItself.status, byItself.text).toBe(200)
    expect(byItself.json['sleep'].sleepTime).toEqual({
      startsAt: '03:00',
      minutes: 120,
      zone: 'Europe/London',
      setAt: '2030-01-15 00:10:00',
      setBy: { kind: 'agent', id },
      nextBeginsAt: '2030-01-15 03:00:00',
    })
    for (const shown of ['03:00', '120 minutes', 'Europe/London', '2030-01-15 03:00:00']) expect(byItself.json['said']).toContain(shown)

    const byThePerson = await setTheTime('2030-01-15T00:11:00Z', 'sec-door', AS_THE_PERSON, { startsAt: '23.15', minutes: 30 })
    expect(byThePerson.status, byThePerson.text).toBe(200)
    expect(byThePerson.json['sleep'].sleepTime).toMatchObject({ startsAt: '23:15', minutes: 30, setBy: { kind: 'person', id: THE_PERSON }, nextBeginsAt: '2030-01-15 23:15:00' })
    expect(byThePerson.json['said']).toContain('23:15')

    const stored = t.client.sqlite.prepare('SELECT sleep_time_starts AS s, sleep_time_minutes AS m, sleep_time_set_by AS b FROM agents WHERE id = ?').get(id)
    expect(stored).toEqual({ s: '23:15', m: 30, b: 'person' })

    const reading = await inject('GET', `/api/residents/${id}`, as('sec-door'))
    expect(reading.status, reading.text).toBe(200)
    expect(reading.json['resident'].sleep.sleepTime).toEqual(byThePerson.json['sleep'].sleepTime)
    expect(reading.json['resident'].holdsTheSecretaryCard).toBe(true)
    // SETTING IT BEGINS NO SLEEP.
    expect(rowsOf('sec-door')).toEqual([])
  })

  it('3: another agent, no key, not a resident, no time and a length out of bounds are refused; a resident without the card sets its time', async () => {
    await makeAResident('res-worker')
    const { SLEEP_TIME_SHORTEST_MINUTES, SLEEP_TIME_LONGEST_MINUTES } = await import('../src/shared/residents.ts')
    const { HAVING_A_SLEEP_TIME, theResidentToActOn } = await import('../src/server/lib/residents.ts')
    const stored = (handle: string): unknown =>
      t.client.sqlite.prepare('SELECT sleep_time_starts AS s, sleep_time_minutes AS m, sleep_time_set_at AS at, sleep_time_set_by AS b FROM agents WHERE id = ?').get(idOf(handle))
    const before = stored('sec-door')
    const at = '2030-01-15T00:30:00Z'

    const byAnother = await setTheTime(at, 'sec-door', as('other-one'), { startsAt: '04:00', minutes: 60 })
    expect(byAnother.status, byAnother.text).toBe(403)
    const noKey = await setTheTime(at, 'sec-door', asAgent('sec-door'), { startsAt: '04:00', minutes: 60 })
    expect(noKey.status, noKey.text).toBe(403)
    const notAResident = await setTheTime(at, 'sec-not-resident', AS_THE_PERSON, { startsAt: '04:00', minutes: 60 })
    expect(notAResident.status, notAResident.text).toBe(409)
    expect(notAResident.json['error']).toBe(refusalOf(() => theResidentToActOn(idOf('sec-not-resident'), HAVING_A_SLEEP_TIME)))
    const noCard = await setTheTime(at, 'res-worker', AS_THE_PERSON, { startsAt: '04:00', minutes: 60 })
    expect(noCard.status, noCard.text).toBe(200)
    expect(stored('res-worker')).toMatchObject({ s: '04:00', m: 60, b: 'person' })

    for (const body of [
      { startsAt: '25:00', minutes: 60 },
      { startsAt: '3', minutes: 60 },
      { startsAt: 'at night', minutes: 60 },
      { startsAt: '04:00', minutes: SLEEP_TIME_SHORTEST_MINUTES - 1 },
      { startsAt: '04:00', minutes: SLEEP_TIME_LONGEST_MINUTES + 1 },
      { startsAt: '04:00', minutes: 90.5 },
      { startsAt: '04:00' },
      { startsAt: '04:00', minutes: 60, by: 'the person' },
    ]) {
      const refused = await setTheTime(at, 'sec-door', AS_THE_PERSON, body)
      expect(refused.status, `${JSON.stringify(body)}: ${refused.text}`).toBe(400)
    }
    expect(stored('sec-door')).toEqual(before)
    expect(stored('res-worker')).toMatchObject({ s: '04:00', m: 60, b: 'person' })
    expect(stored('sec-not-resident')).toEqual({ s: null, m: null, at: null, b: null })
  })
})

describe('the clock begins and ends the sleep', () => {
  it('4: at its time, by Mole Office, with one reminder, once; it ends when the time is over; a wake press holds; a time set inside its window waits', async () => {
    await makeAResident('sec-clock')
    const id = idOf('sec-clock')
    const set = await setTheTime('2030-01-15T00:40:00Z', 'sec-clock', as('sec-clock'), { startsAt: '03:00', minutes: 120 })
    expect(set.status, set.text).toBe(200)
    const { moleOffice } = await import('../src/shared/participants.ts')

    expect(await tickAt('2030-01-15T02:59:50Z')).toEqual({ began: [], woke: [] })
    expect(rowsOf('sec-clock')).toEqual([])

    const log = vi.fn()
    expect(await tickAt('2030-01-15T03:00:20Z', log)).toEqual({ began: [id], woke: [] })
    const [first] = rowsOf('sec-clock')
    expect(first).toMatchObject({ what: 'slept', began_at: '2030-01-15 03:00:20', ended_at: null, by_kind: 'agent', by_id: moleOffice().id, wakes_at: '2030-01-15 05:00:00' })
    expect(remindersTo('sec-clock')).toBe(1)
    expect(t.api.getRecord(String(first!.reminder_id))!.data['notice']).toBe('yourSleepTimeHasBegun')
    expect(log).toHaveBeenCalledTimes(1)

    // ONCE: the next minute begins nothing and sends nothing.
    expect(await tickAt('2030-01-15T03:01:20Z')).toEqual({ began: [], woke: [] })
    expect(rowsOf('sec-clock')).toHaveLength(1)
    expect(remindersTo('sec-clock')).toBe(1)

    expect(await tickAt('2030-01-15T05:00:10Z')).toEqual({ began: [], woke: [id] })
    expect(rowsOf('sec-clock')[0]!.ended_at).toBe('2030-01-15 05:00:10')
    expect(await tickAt('2030-01-15T05:01:10Z')).toEqual({ began: [], woke: [] })

    // THE NEXT DAY IT BEGINS AGAIN, and a wake press inside the window is not undone by the next minute.
    expect(await tickAt('2030-01-16T03:00:30Z')).toEqual({ began: [id], woke: [] })
    expect(remindersTo('sec-clock')).toBe(2)
    vi.setSystemTime(new Date('2030-01-16T03:30:00Z'))
    expect((await inject('POST', `/api/residents/${id}/wake`, AS_THE_PERSON)).status).toBe(200)
    expect(await tickAt('2030-01-16T03:31:00Z')).toEqual({ began: [], woke: [] })
    expect(await tickAt('2030-01-16T05:00:30Z')).toEqual({ began: [], woke: [] })
    expect(rowsOf('sec-clock')).toHaveLength(2)

    // A TIME SET INSIDE ITS OWN WINDOW waits for the next one, and the reply says when that is.
    const again = await setTheTime('2030-01-17T03:20:00Z', 'sec-clock', as('sec-clock'), { startsAt: '03:00', minutes: 120 })
    expect(again.json['sleep'].sleepTime.nextBeginsAt).toBe('2030-01-18 03:00:00')
    expect(await tickAt('2030-01-17T03:21:00Z')).toEqual({ began: [], woke: [] })
    expect(rowsOf('sec-clock')).toHaveLength(2)
    expect(remindersTo('sec-clock')).toBe(2)
  })

  it('5: postponed during the office’s sleep, the sleep ends, one row is written, nothing is sent, and it does not begin again', async () => {
    await makeAResident('sec-postpone')
    const id = idOf('sec-postpone')
    expect((await setTheTime('2030-01-17T05:30:00Z', 'sec-postpone', as('sec-postpone'), { startsAt: '06:00', minutes: 60 })).status).toBe(200)
    expect(await tickAt('2030-01-17T06:00:30Z')).toEqual({ began: [id], woke: [] })

    const messages = (): number => count("SELECT count(*) AS n FROM records WHERE kind = 'message'")
    const deliveries = (): number => count('SELECT count(*) AS n FROM message_delivery')
    const waiting = async (): Promise<number> => ((await inject('GET', '/api/waiting', AS_THE_PERSON)).json['items'] as unknown[]).length
    const before = { messages: messages(), deliveries: deliveries(), waiting: await waiting() }

    vi.setSystemTime(new Date('2030-01-17T06:05:00Z'))
    const postponed = await inject('POST', `/api/residents/${id}/sleep/postpone`, as('sec-postpone'), { because: 'A made-up review runs late.' })
    expect(postponed.status, postponed.text).toBe(201)
    expect(postponed.json['sleep'].asleep).toBeNull()
    expect(postponed.json['sleep'].postponedInAll).toBe(1)
    expect(rowsOf('sec-postpone').map((row) => [row.what, row.ended_at])).toEqual([
      ['slept', '2030-01-17 06:05:00'],
      ['postponed', null],
    ])
    expect(messages()).toBe(before.messages)
    expect(deliveries()).toBe(before.deliveries)
    expect(await waiting()).toBe(before.waiting)
    expect(await tickAt('2030-01-17T06:06:00Z')).toEqual({ began: [], woke: [] })

    // A SLEEP BEGUN BY A PRESS is still not postponed: it is ended by waking.
    vi.setSystemTime(new Date('2030-01-17T06:10:00Z'))
    expect((await inject('POST', `/api/residents/${id}/sleep`, as('sec-postpone'), {})).status).toBe(201)
    const pressed = await inject('POST', `/api/residents/${id}/sleep/postpone`, as('sec-postpone'), { because: 'A made-up reason.' })
    expect(pressed.status, pressed.text).toBe(409)
    const { postponeASleep, residencyOf } = await import('../src/server/lib/residents.ts')
    const itself = { type: 'agent' as const, id, provedBy: 'an-agent-key' as const, keyHolder: id }
    expect(pressed.json['error']).toBe(refusalOf(() => postponeASleep(residencyOf(id)!, 'A made-up reason.', itself)))
    expect((await inject('POST', `/api/residents/${id}/wake`, as('sec-postpone'))).status).toBe(200)
  })
})

describe('the reminder at the start of the sleep', () => {
  it('6: names the three things by their doors, asks it to tidy, names a crowded checklist, and gives no home path', async () => {
    await makeAResident('sec-words')
    const id = idOf('sec-words')
    const { MEMORY_FOLDER, OPEN_ITEMS_WORTH_A_LOOK, PERSONAL_SPACE_DIRECTORY } = await import('../src/shared/residents.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const { theSpaceOf } = await import('../src/server/lib/residents.ts')
    // A STANDING ITEM IS NOT OPEN WORK (isOpenWork in src/shared/checklists.ts), so the list at the limit has more items
    // than the limit and is still not named.
    const aList = async (title: string, open: number, standing: number): Promise<string> => {
      const items = [
        ...Array.from({ length: open }, (_, n) => ({ words: `A made-up open item ${String(n + 1)}` })),
        ...Array.from({ length: standing }, (_, n) => ({ words: `A made-up standing item ${String(n + 1)}`, standing: true })),
      ]
      const made = await inject('POST', '/api/checklists', as('sec-words'), { title, items })
      expect(made.status, made.text).toBe(201)
      return String(made.json['checklist'].id)
    }
    const crowded = await aList('A made-up list over the limit', OPEN_ITEMS_WORTH_A_LOOK + 1, 0)
    await aList('A made-up list at the limit', OPEN_ITEMS_WORTH_A_LOOK, 2)

    expect((await setTheTime('2030-01-17T06:40:00Z', 'sec-words', as('sec-words'), { startsAt: '07:00', minutes: 60 })).status).toBe(200)
    // A CROWDED CHECKLIST HOLDS NOTHING: the sleep begins all the same.
    expect(await tickAt('2030-01-17T07:00:30Z')).toEqual({ began: [id], woke: [] })
    const reminder = t.api.getRecord(String(rowsOf('sec-words')[0]!.reminder_id))!
    const said = String(reminder.data['saidInFull'])

    expect(said).toBe(
      SYSTEM_LINES.yourSleepTimeHasBegun('sec-words', id, '2030-01-17 08:00:00', 'Europe/London', [
        { id: crowded, title: 'A made-up list over the limit', open: OPEN_ITEMS_WORTH_A_LOOK + 1 },
      ]).said,
    )
    expect(reminder.data['body']).toBe(SYSTEM_LINES.yourSleepTimeHasBegun('sec-words', id, '', '', []).line)
    for (const door of [
      `PUT /api/residents/${id}/space/file?path=${MEMORY_FOLDER}`,
      'POST /api/agents/sec-words/notebook/entries',
      'PATCH /api/agents/sec-words/notebook/entries/',
      `PUT /api/agents/${id}/handover`,
      'PATCH /api/checklists/',
      'PATCH /api/records/',
      `POST /api/residents/${id}/sleep/postpone`,
    ]) {
      expect(said, door).toContain(door)
    }
    expect(said).toContain('A made-up list over the limit')
    expect(said).not.toContain('A made-up list at the limit')
    for (const home of ['/home/', '~/', PERSONAL_SPACE_DIRECTORY, theSpaceOf(id), homedir()]) expect(said, home).not.toContain(home)
    expect(count('SELECT count(*) AS n FROM message_delivery WHERE message_id = ? AND recipient_id = ?', reminder.id, id)).toBe(1)
    expect(await tickAt('2030-01-17T08:00:10Z')).toEqual({ began: [], woke: [id] })
  })

  it('7: its waiter is handed the reminder and keeps back what is not urgent; the worker says the waiting door hands it; once seen it is not handed again', async () => {
    await makeAResident('sec-waiter')
    const id = idOf('sec-waiter')
    expect((await setTheTime('2030-01-17T08:05:00Z', 'sec-waiter', as('sec-waiter'), { startsAt: '08:30', minutes: 60 })).status).toBe(200)
    vi.setSystemTime(new Date('2030-01-17T08:10:00Z'))
    const canWait = await sendTo('sec-waiter', 'A made-up note that can wait.')
    expect(await tickAt('2030-01-17T08:30:30Z')).toEqual({ began: [id], woke: [] })
    const reminder = String(rowsOf('sec-waiter')[0]!.reminder_id)
    const since = rowsOf('sec-waiter')[0]!.began_at
    const { heldWhileItSleeps, THE_REMINDER_IS_HANDED_OVER_TOO } = await import('../src/server/lib/resident-sleep.ts')

    const asleep = await inject('GET', '/api/handles/sec-waiter/waiting', as('sec-waiter'))
    expect(asleep.status, asleep.text).toBe(200)
    expect((asleep.json['waiting'] as { messageId: string }[]).map((one) => one.messageId)).toEqual([reminder])
    expect(asleep.json['keptBack']).toBeGreaterThanOrEqual(1)
    expect(asleep.json['note']).toContain(THE_REMINDER_IS_HANDED_OVER_TOO)

    const queue = (await inject('GET', '/api/worker/queue', AS_THE_PERSON)).json['queue'] as Record<string, unknown>[]
    const rowOf = (messageId: string): Record<string, unknown> | undefined => queue.find((one) => one['messageId'] === messageId)
    expect(rowOf(reminder)?.['heldWhileAsleep']).toBe(heldWhileItSleeps('sec-waiter', since, true))
    expect(rowOf(canWait)?.['heldWhileAsleep']).toBe(heldWhileItSleeps('sec-waiter', since, false))
    expect(rowOf(reminder)?.['heldWhileAsleep']).not.toBe(rowOf(canWait)?.['heldWhileAsleep'])

    const seen = await inject('POST', `/api/messages/${reminder}/mark`, as('sec-waiter'), { mark: 'seen' })
    expect(seen.status, seen.text).toBe(200)
    const after = await inject('GET', '/api/handles/sec-waiter/waiting', as('sec-waiter'))
    expect(after.json['waiting']).toEqual([])
    expect(after.json['keptBack']).toBe(asleep.json['keptBack'])
    expect(await tickAt('2030-01-17T09:30:10Z')).toEqual({ began: [], woke: [id] })
  })
})

describe('where the sleep time is seen', () => {
  it('8: the chat’s presence line and the resident’s reading carry the sleep time and when the sleep ends', async () => {
    await makeAResident('sec-seen')
    const id = idOf('sec-seen')
    const presence = async (): Promise<Record<string, any>> =>
      (await inject('GET', `/api/presence/agent/${id}`, AS_THE_PERSON)).json['presence'] as Record<string, any>

    expect((await presence())['residentSleep']).toEqual({ asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: { startsAt: '12:00', minutes: 60 } })
    expect((await setTheTime('2030-01-17T10:30:00Z', 'sec-seen', AS_THE_PERSON, { startsAt: '11.00', minutes: 60 })).status).toBe(200)
    expect((await presence())['residentSleep']).toEqual({ asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: { startsAt: '11:00', minutes: 60 } })

    expect(await tickAt('2030-01-17T11:00:30Z')).toEqual({ began: [id], woke: [] })
    expect((await presence())['residentSleep']).toEqual({
      asleepSince: '2030-01-17 11:00:30',
      lastSleptAt: null,
      wakesAt: '2030-01-17 12:00:00',
      sleepTime: { startsAt: '11:00', minutes: 60 },
    })
    const reading = await inject('GET', `/api/residents/${id}`, AS_THE_PERSON)
    expect(reading.json['resident'].sleep.asleep.wakesAt).toBe('2030-01-17 12:00:00')
    expect(reading.json['resident'].sleep.sleepTime.nextBeginsAt).toBe('2030-01-18 11:00:00')
    expect(reading.json['resident'].holdsTheSecretaryCard).toBe(true)
    expect((await inject('GET', `/api/residents/${idOf('res-worker')}`, AS_THE_PERSON)).json['resident'].holdsTheSecretaryCard).toBe(false)
  })
})

describe('a minute that fails', () => {
  it('9: a minute of the started clock that throws is one line in the log, and the next minute runs as before', async () => {
    clock ??= await import('../src/server/lib/sleep-windows.ts')
    const lines: string[] = []
    const prepared = vi.spyOn(t.client.sqlite, 'prepare')
    prepared.mockImplementationOnce(() => {
      throw new Error('Test: the minute read failed.')
    })
    const timer = clock.startTheSleepClock((line) => lines.push(line), 20)
    let asked: number
    try {
      await new Promise((go) => setTimeout(go, 150))
    } finally {
      clearInterval(timer)
      asked = prepared.mock.calls.length
      prepared.mockRestore()
    }
    expect(lines.filter((line) => line.includes('Test: the minute read failed.'))).toHaveLength(1)
    expect(asked).toBeGreaterThan(1)
  })
})
