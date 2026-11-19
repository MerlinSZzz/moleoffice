// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A SECRETARY FILES UNDER THE PERSON'S GRANT NEVER READS AS THE PERSON'S OWN. Wave 13s round 2b. Five doors were the
 * person's alone: filing a prepared note's words as their own, saying a prepared note is not what they said, filing every
 * waiting note at once, and reading and writing an agent's handover. Each now asks the one check (`aRaiseCarriesIt` in
 * lib/records.ts) after the person, so a secretary holding the person's grant presses it for them where this office's
 * list of what the grant carries says `may-press`. An office that changed nothing behaves as before: the secretary card
 * keeps each of these doors.
 *
 * WHAT A PRESS UNDER THE GRANT WRITES. A note filed under the grant is the secretary's note. It holds
 * `filed_under_the_grant`, which names the prepared note, the secretary, the grant and the press, and it never holds
 * `filed_from`, so it is never the person's own words. A prepared note the secretary marks as not the person's words
 * holds `not_what_they_said_under_the_grant`, and never `not_what_the_person_said`. Either answers the prepared note once:
 * it no longer waits, and a later press on it, the person's own among them, is refused in words that name the secretary
 * and the grant. A handover written under the grant names the secretary as its writer.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two secretaries, one of them
 * raised, and a worker are made-up agents, each holding the key the office answered. Every record here is synthetic.
 * This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH DOOR, THROUGH ITS ROUTE:
 *   1. no grant: the unraised secretary hears the door's old refusal, even with this office's row at may-press, and
 *      nothing changes;
 *   2. granted, with no row: the raised secretary is refused in the check's words, naming the door, and nothing changes;
 *   3. the row at kept: the refusal says it is this office's answer, and nothing changes;
 *   4. the row at may-press: the press goes through, and what the press wrote names the secretary and the grant, never
 *      the person. A press that writes leaves one press row naming the secretary, the grant and the door; reading the
 *      handover leaves none, as no read does.
 *
 * MUTATIONS, after a control run: take `aRaiseCarriesIt` out of one door's guard, and that door's case 4 goes red.
 * Write a press row for a read under the grant, and the handover read's case 4 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { operationNamed } from '../src/shared/ops.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RAISED = 'grant-secretary'
const UNRAISED = 'plain-secretary'
const WORKER = 'made-up-worker'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()

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

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** The last change row and the last press row, so a case can say what it wrote. */
function marker(): { changes: number; presses: number } {
  const n = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return { changes: n('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes'), presses: n('SELECT COALESCE(MAX(rowid), 0) AS n FROM presses_for_the_person') }
}

interface AChangeRow {
  record_id: string
  op: string
  actor_type: string
  actor_id: string
  elevation: string | null
  press_id: string | null
}

interface APressRow {
  id: string
  agent_id: string
  grant_id: string
  operation: string
  reason: string | null
}

function changesSince(mark: { changes: number }): AChangeRow[] {
  return t.client.sqlite
    .prepare('SELECT record_id, op, actor_type, actor_id, elevation, press_id FROM changes WHERE rowid > ? ORDER BY rowid')
    .all(mark.changes) as AChangeRow[]
}

function pressesSince(mark: { presses: number }): APressRow[] {
  return t.client.sqlite
    .prepare('SELECT id, agent_id, grant_id, operation, reason FROM presses_for_the_person WHERE rowid > ? ORDER BY rowid')
    .all(mark.presses) as APressRow[]
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))
const dataOf = (id: string): Record<string, unknown> => t.api.getRecord(id)?.data ?? {}
const theNotes = (): string => readAll("SELECT id, data, deleted_at FROM records WHERE kind = 'note' ORDER BY id")
const theHandovers = (): string => readAll('SELECT * FROM handovers ORDER BY rowid')
const theGrantOf = (row: AChangeRow): string => String((JSON.parse(row.elevation ?? 'null') as { id?: unknown } | null)?.id)

/** A note the worker writes down for the person to file. */
async function aPreparedNote(words: string): Promise<string> {
  const filed = await call('POST', '/api/records', as(WORKER), {
    kind: 'note',
    title: `Made up: ${words}`,
    data: { date: '2026-10-21', body: `Made up: the person said ${words}.`, for_the_person_to_file: true },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

/** The ids of the notes the person's page lists as waiting. */
async function theWaitingNotes(): Promise<string[]> {
  const read = await call('GET', '/api/the-persons-words?limit=25', PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body.notes as { id: string }[]).map((one) => one.id)
}

/** The lines the office wrote to the worker about the notes it wrote down. */
function theLinesToTheWorker(): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT json_extract(data, '$.saidInFull') AS said FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'aNoteForThePerson' ORDER BY rowid")
      .all() as { said: string }[]
  ).map((row) => row.said)
}

interface APress {
  method: 'GET' | 'POST' | 'PUT'
  url: string
  /** The body the press sends, or undefined for a read, which sends none and gives no reason. */
  body: Record<string, unknown> | undefined
  state: () => string
}

interface ADoor {
  door: string
  /** The door's refusal before it asked the check, which a caller with no grant still hears. */
  oldWords: string
  make: () => Promise<APress>
  /** What a press that went through wrote, checked against its change rows and its one press row. A read has none. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrote: (done: { body: any }, rows: AChangeRow[], press: APressRow) => Promise<void> | void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sent(press: APress, who: string): Promise<{ status: number; body: any; error: string; raw: string }> {
  return call(press.method, press.url, as(who), press.body === undefined ? undefined : { ...press.body, ...FOR_THE_PERSON })
}

async function refusedAndNothingChanged(press: APress, who: string, words: string): Promise<string> {
  const before = press.state()
  const mark = marker()
  const refused = await sent(press, who)
  expect(refused.status, refused.raw).toBe(403)
  expect(refused.error).toContain(words)
  expect(press.state(), 'a refused press changed something').toBe(before)
  expect(changesSince(mark), 'a refused press wrote a change row').toEqual([])
  expect(pressesSince(mark), 'a refused press wrote a press row').toEqual([])
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
      const said = await refusedAndNothingChanged(press, UNRAISED, one.oldWords)
      expect(said).not.toContain('grant')
    })

    it('2: granted, with no row, refuses in the check’s words naming the door', async () => {
      await refusedAndNothingChanged(press, RAISED, `The secretary card keeps ${one.door} for the person`)
    })

    it('3: with the row at kept, says it is this office’s answer', async () => {
      answer(one.door, 'kept')
      const said = await refusedAndNothingChanged(press, RAISED, `keeps ${one.door} for the person`)
      expect(said).toContain("This office's list of what the grant carries, since")
    })

    it('4: with the row at may-press, goes through, and what it writes names the secretary and the grant', async () => {
      answer(one.door, 'may-press')
      const mark = marker()
      const done = await sent(press, RAISED)
      expect(done.status, `${one.door}: ${done.raw}`).toBeLessThan(300)
      if (operationNamed(one.door)?.effect === 'read') {
        expect(pressesSince(mark), `${one.door} is a read, and it wrote a press row`).toEqual([])
        await one.wrote(done, changesSince(mark), undefined as never)
        return
      }
      const presses = pressesSince(mark)
      expect(presses, 'one press is one row').toHaveLength(1)
      const pressed = presses[0]!
      expect(pressed).toMatchObject({ agent_id: RAISED, operation: one.door, reason: press.body === undefined ? null : A_TESTS_REASON_FOR_THE_PERSON })
      const rows = changesSince(mark)
      expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])
      for (const row of rows.filter((row) => row.actor_id === RAISED)) {
        expect(theGrantOf(row), `a change row of the press does not name the grant: ${JSON.stringify(row)}`).toBe(pressed.grant_id)
        expect(row.press_id).toBe(pressed.id)
      }
      await one.wrote(done, rows, pressed)
    })
  })
}

/** What a note filed under the grant holds: the secretary's note, naming the prepared note, the grant and the press. */
function expectFiledUnderTheGrant(noteId: string, preparedId: string, rows: AChangeRow[], pressed: APressRow): void {
  const data = dataOf(noteId)
  expect(data['filed_under_the_grant']).toEqual({ from: preparedId, by: { kind: 'agent', id: ids.get(RAISED) }, grant: pressed.grant_id, press: pressed.id })
  expect(data['filed_from'], 'a note filed under the grant says it was filed as the person’s own').toBeUndefined()
  expect(data['body']).toBe(dataOf(preparedId)['body'])
  const created = rows.find((row) => row.record_id === noteId && row.op === 'create')
  expect(created, 'no change row created the note').toBeDefined()
  expect(created).toMatchObject({ actor_type: 'agent', actor_id: RAISED, press_id: pressed.id })
}

/** A prepared note answered under the grant no longer waits, its page names no note of the person's, and a second press is refused. */
async function expectAnsweredOnce(preparedId: string, said: string): Promise<void> {
  expect(await theWaitingNotes()).not.toContain(preparedId)
  const page = await call('GET', `/api/records/${preparedId}`, PERSON)
  expect(page.status, page.raw).toBe(200)
  expect(page.body.filedAsThePersonsWords, 'the prepared note’s page names a note of the person’s own').toBeNull()
  const before = theNotes()
  for (const [url, payload] of [
    [`/api/records/${preparedId}/file-as-my-words`, {}],
    [`/api/records/${preparedId}/not-what-i-said`, {}],
    ['/api/the-persons-words/confirm-all', { ids: [preparedId] }],
  ] as const) {
    const again = await call('POST', url, PERSON, payload)
    expect(again.status, `${url}: ${again.raw}`).toBe(409)
    expect(again.error).toContain(said)
    expect(again.error).toContain(`"${RAISED}"`)
    expect(again.error).toContain("under the person's grant")
  }
  expect(theNotes(), 'a refused second press changed a note').toBe(before)
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
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RAISED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the person's own words under the grant", () => {
  let filedFrom = ''
  theFourCases({
    door: 'record.file-as-my-words',
    oldWords: "Filing words as your own is the person's own act",
    make: async () => {
      filedFrom = await aPreparedNote('the shelf goes on the left wall')
      return { method: 'POST', url: `/api/records/${filedFrom}/file-as-my-words`, body: {}, state: theNotes }
    },
    wrote: async (done, rows, pressed) => {
      const noteId = String(done.body.note.id)
      expect(done.body.filedFrom).toBe(filedFrom)
      expectFiledUnderTheGrant(noteId, filedFrom, rows, pressed)
      const told = theLinesToTheWorker().at(-1) ?? ''
      expect(told).toContain(`"${RAISED}" filed your note ${filedFrom}`)
      expect(told).toContain("under the person's grant")
      expect(told).not.toContain('The person confirmed')
      await expectAnsweredOnce(filedFrom, `filed these words under the person's grant, as the note ${noteId}`)
    },
  })

  let marked = ''
  theFourCases({
    door: 'record.not-what-i-said',
    oldWords: "Saying a note is not what you said is the person's own act",
    make: async () => {
      marked = await aPreparedNote('the paint is blue')
      return { method: 'POST', url: `/api/records/${marked}/not-what-i-said`, body: {}, state: theNotes }
    },
    wrote: async (done, rows, pressed) => {
      expect(done.body.note.id).toBe(marked)
      const data = dataOf(marked)
      expect(data['not_what_the_person_said'], 'the secretary’s answer is stored as the person’s mark').toBeUndefined()
      const mark = data['not_what_they_said_under_the_grant'] as Record<string, unknown>
      expect(mark).toMatchObject({ by: { kind: 'agent', id: ids.get(RAISED) }, grant: pressed.grant_id, press: pressed.id })
      expect(String(mark['at'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(Object.keys(mark).sort()).toEqual(['at', 'by', 'grant', 'press'])
      expect(rows.find((row) => row.record_id === marked)).toMatchObject({ actor_type: 'agent', actor_id: RAISED, press_id: pressed.id })
      const told = theLinesToTheWorker().at(-1) ?? ''
      expect(told).toContain(`"${RAISED}" said under the person's grant that your note ${marked}`)
      expect(told).not.toContain('The person said')
      await expectAnsweredOnce(marked, `said under the person's grant, at ${String(mark['at'])}, that the note ${marked} is not what the person said`)
    },
  })

  let all: string[] = []
  theFourCases({
    door: 'record.confirm-all-my-words',
    oldWords: "Filing words as your own is the person's own act",
    make: async () => {
      all = [await aPreparedNote('the door opens inwards'), await aPreparedNote('the lamp needs a new bulb')]
      return { method: 'POST', url: '/api/the-persons-words/confirm-all', body: { ids: all }, state: theNotes }
    },
    wrote: async (done, rows, pressed) => {
      const filed = done.body.filed as { note: { id: string }; filedFrom: string }[]
      expect(filed.map((one) => one.filedFrom)).toEqual(all)
      for (const one of filed) expectFiledUnderTheGrant(one.note.id, one.filedFrom, rows, pressed)
      for (const one of filed) await expectAnsweredOnce(one.filedFrom, `filed these words under the person's grant, as the note ${one.note.id}`)
    },
  })

  theFourCases({
    door: 'agent.handover-write',
    oldWords: `The handover of "${WORKER}" is written by "${WORKER}" itself, sending its own agent key, or by the person. This request is neither`,
    make: async () => ({
      method: 'PUT',
      url: `/api/agents/${WORKER}/handover`,
      body: { text: 'Made up: the next session finishes the shelf.' },
      state: theHandovers,
    }),
    wrote: async (done, rows) => {
      expect(done.body.handover).toMatchObject({ agentId: ids.get(WORKER), writtenByKind: 'agent', writtenById: ids.get(RAISED), text: 'Made up: the next session finishes the shelf.' })
      expect(done.body.says).toContain(`written by the secretary "${ids.get(RAISED)}" under the person's grant`)
      expect(rows, 'a handover keeps its writer in its own row').toEqual([])
      const read = await call('GET', `/api/agents/${WORKER}/handover`, PERSON)
      expect(read.status, read.raw).toBe(200)
      expect(read.body.current).toMatchObject({ id: done.body.handover.id, writtenByKind: 'agent', writtenById: ids.get(RAISED) })
    },
  })

  theFourCases({
    door: 'agent.handover',
    oldWords: `The handover of "${WORKER}" is read by "${WORKER}" itself, by the person, and by the agent that started "${WORKER}". This request is none of them`,
    make: async () => {
      const written = await call('PUT', `/api/agents/${WORKER}/handover`, PERSON, { text: 'Made up: the person wrote this handover.' })
      expect(written.status, written.raw).toBe(200)
      return { method: 'GET', url: `/api/agents/${WORKER}/handover`, body: undefined, state: theHandovers }
    },
    wrote: async (done, rows) => {
      const theirs = await call('GET', `/api/agents/${WORKER}/handover`, PERSON)
      expect(done.body.current, 'the secretary read another handover than the person reads').toEqual(theirs.body.current)
      expect(done.body.current).not.toBeNull()
      expect(rows, 'a read wrote a change row').toEqual([])
    },
  })
})
