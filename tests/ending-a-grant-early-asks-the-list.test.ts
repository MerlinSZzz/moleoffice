// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ENDING A SECRETARY'S GRANT EARLY ASKS THE LIST. The door `DELETE /api/roles/elevation/<handle>` in
 * src/server/api/roles.ts used to declare the operation giving a grant declares, and to refuse every caller that is
 * not the person in its own code, before any list was read. It has its own operation now,
 * `role.end-a-grant-early`, and it asks the one check (`aRaiseCarriesIt` in lib/records.ts) after the person, so a
 * secretary holding the person's grant ends another secretary's grant for them where this office's list of what the
 * grant carries says `may-press`. Giving a grant and an agent ending its own keep `role.elevate` and stay as they were.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Three secretaries are
 * made-up agents: one raised and pressing, one raised whose grant is ended, and one with no grant. Each holds the key
 * the office answered. Every record here is synthetic, and no folder is made outside the test's own database folder.
 * This office's answers are set with `setThisOfficesAnswer`, the function the door for that list calls.
 *
 * FOR EACH CASE, THROUGH THE ROUTE:
 *   1. no grant: the secretary with none hears the door's old refusal, even with this office's row at may-press, and
 *      the other secretary's grant still holds;
 *   2. kept: the raised secretary is refused in the check's words, and the other grant still holds;
 *   3. may-press: the press ends the other secretary's grant. Its stored end words and the line to that secretary name
 *      the pressing secretary and the person's grant, and never say the person ended it. Exactly one press row names
 *      the pressing secretary, the grant, the door and the reason.
 *   4. the person's own press still ends a grant with the words it used before.
 *   5. the other doors are unchanged: the same raised secretary, with this office's answer for this door at may-press,
 *      is still refused giving a grant.
 *
 * MUTATIONS, EACH ALONE AFTER THE GREEN RUN, EACH RESTORED (23 October 2026):
 *   · the DELETE door asks `refuseAnybodyButThePerson` alone again: cases 2 and 3 go red, case 3 at its refusal;
 *   · the end words under the grant say "You ended it." again: case 3 goes red on the stored words;
 *   · `role.end-a-grant-early` taken off the card's `neverPresses`: case 2 goes red, because the press goes through.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import {
  A_TESTS_REASON_FOR_THE_PERSON,
  apiApp,
  FOR_THE_PERSON,
  FOR_THE_PERSON_IN_THE_QUERY,
  freshDb,
  thePersonsKeyHeader,
  type TestDb,
} from './helpers.ts'

const PRESSER = 'grant-ender'
const TARGET = 'grant-ended'
const PLAIN = 'grant-less-secretary'

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
let presserGrantId = ''
let targetRecordId = ''

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

async function start(handle: string): Promise<string> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: 'secretary' })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
  return String(started.body.record ?? '')
}

async function raise(handle: string): Promise<string> {
  const raised = await call('POST', `/api/roles/elevation/${handle}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  return String(raised.body.elevation?.id ?? '')
}

/** This office's answer about one door, as the person gives it, taken back after each case. */
function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

/** Every grant ever made to the other secretary, oldest first. */
async function theTargetsGrants(): Promise<Record<string, unknown>[]> {
  const read = await call('GET', `/api/records/${targetRecordId}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return (read.body.record?.data?.elevation ?? []) as Record<string, unknown>[]
}

async function theTargetsLastGrant(): Promise<Record<string, unknown> | undefined> {
  const every = await theTargetsGrants()
  return every[every.length - 1]
}

/** The line the office wrote to the secretary whose grant ended, by the id the door answered. */
async function theLineToTheTarget(id: unknown): Promise<{ line: string; said: string; toTheTarget: boolean }> {
  const read = await call('GET', `/api/records/${String(id)}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  const record = read.body.record as { data: { body?: string; saidInFull?: string; to?: { kind: string; id: string }[] } }
  return {
    line: String(record.data.body ?? ''),
    said: String(record.data.saidInFull ?? ''),
    toTheTarget: (record.data.to ?? []).some((to) => to.kind === 'agent' && to.id === ids.get(TARGET)),
  }
}

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

const theEnding = `/api/roles/elevation/${TARGET}?${FOR_THE_PERSON_IN_THE_QUERY}`

/** A refusal, with the other grant still holding and neither a change row nor a press row written. */
async function refusedAndNothingChanged(who: string, words: string): Promise<string> {
  const before = JSON.stringify(await theTargetsLastGrant())
  const mark = marker()
  const pressMark = pressesMarker()
  const refused = await call('DELETE', theEnding, as(who))
  expect(refused.status, refused.raw).toBe(403)
  expect(refused.error).toContain(words)
  expect(JSON.stringify(await theTargetsLastGrant()), 'a refused press ended the other grant').toBe(before)
  expect(rowsSince(mark), 'a refused press wrote a change row').toEqual([])
  expect(pressesSince(pressMark), 'a refused press wrote a press row').toEqual([])
  return refused.error
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
  for (const handle of [PRESSER, TARGET, PLAIN]) {
    const record = await start(handle)
    if (handle === TARGET) targetRecordId = record
  }
  expect(targetRecordId).not.toBe('')
  presserGrantId = await raise(PRESSER)
  expect(presserGrantId).not.toBe('')
  expect(await raise(TARGET)).not.toBe('')
}, 60_000)

// EVERY CASE THAT ENDS THE OTHER SECRETARY'S GRANT LEAVES IT ENDED, so the next case raises it again first.
beforeEach(async () => {
  const last = await theTargetsLastGrant()
  if (last === undefined || last['endedAt'] !== null) expect(await raise(TARGET)).not.toBe('')
})

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('ending a grant early asks the list', () => {
  it('1: with no grant, even with the row at may-press, refuses in its old words and changes nothing', async () => {
    answer('role.end-a-grant-early', 'may-press')
    await refusedAndNothingChanged(PLAIN, "Ending a secretary's grant early is the person's own act")
  })

  it('2: kept, with no row, refuses the raised secretary in the check’s words and changes nothing', async () => {
    await refusedAndNothingChanged(PRESSER, 'The secretary card keeps role.end-a-grant-early for the person')
  })

  it('3: with the row at may-press, ends the other grant, and the words name the secretary and the grant', async () => {
    answer('role.end-a-grant-early', 'may-press')
    const mark = marker()
    const pressMark = pressesMarker()
    const done = await call('DELETE', theEnding, as(PRESSER))
    expect(done.status, done.raw).toBeLessThan(300)

    const grant = await theTargetsLastGrant()
    expect(grant?.['endedAt'], 'the other grant did not end').toEqual(expect.any(String))
    const because = String(grant?.['endedBecause'] ?? '')
    expect(because).toContain(PRESSER)
    expect(because).toContain(presserGrantId)
    expect(because).toContain("under the person's grant")
    expect(because).not.toContain('You ended it.')
    expect(because).not.toContain('The person ended it.')
    expect(because).not.toContain(THE_PERSON)

    const told = await theLineToTheTarget(done.body.told)
    expect(told.line).toBe('Your raise has ended')
    expect(told.said).toContain(PRESSER)
    expect(told.said).toContain(presserGrantId)
    expect(told.said).toContain("under the person's grant")
    expect(told.said).not.toContain('The person ended it.')
    expect(told.said).not.toContain(THE_PERSON)
    expect(told.toTheTarget, 'the line did not go to the secretary whose grant ended').toBe(true)

    const rows = rowsSince(mark)
    const namesTheGrant = (row: { elevation: string | null }): boolean => {
      if (row.elevation === null) return false
      try {
        return (JSON.parse(row.elevation) as { id?: string }).id === presserGrantId
      } catch {
        return false
      }
    }
    expect(
      rows.some((row) => row.actor_id === PRESSER && namesTheGrant(row)),
      `no change row names the secretary and the grant: ${JSON.stringify(rows)}`,
    ).toBe(true)
    expect(rows.filter((row) => row.actor_type === 'human'), 'a change row names the person as the one who did it').toEqual([])

    const presses = pressesSince(pressMark)
    const ours = presses.filter(
      (row) =>
        row.agent_id === PRESSER &&
        row.grant_id === presserGrantId &&
        row.operation === 'role.end-a-grant-early' &&
        row.reason === A_TESTS_REASON_FOR_THE_PERSON,
    )
    expect(ours, `the press row does not name the secretary, the grant, the door and the reason: ${JSON.stringify(presses)}`).toHaveLength(1)
  })

  it("4: the person's own press still ends a grant with the words it used before", async () => {
    const done = await call('DELETE', `/api/roles/elevation/${TARGET}`, PERSON)
    expect(done.status, done.raw).toBe(200)
    const grant = await theTargetsLastGrant()
    expect(grant?.['endedAt']).toEqual(expect.any(String))
    expect(grant?.['endedBecause']).toBe('You ended it.')
    const told = await theLineToTheTarget(done.body.told)
    expect(told.line).toBe('Your raise has ended')
    expect(told.said).toContain('The person ended it.')
    expect(told.toTheTarget).toBe(true)
  })

  it('5: the other doors are unchanged, so giving a grant is still refused with this door at may-press', async () => {
    answer('role.end-a-grant-early', 'may-press')
    const before = JSON.stringify((await call('GET', `/api/records/${String(ids.get(PLAIN))}`, PERSON)).body.record?.data?.elevation ?? null)
    const refused = await call('POST', `/api/roles/elevation/${PLAIN}`, as(PRESSER), {
      reason: 'A made-up raise for another secretary.',
      ...FOR_THE_PERSON,
    })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain("Starting or ending a secretary's right to act for you is the person's own act")
    const after = JSON.stringify((await call('GET', `/api/records/${String(ids.get(PLAIN))}`, PERSON)).body.record?.data?.elevation ?? null)
    expect(after, 'the refused press gave a grant').toBe(before)
  })
})
