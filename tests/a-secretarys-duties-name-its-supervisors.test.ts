// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S DUTIES NAME THE SUPERVISORS IT ANSWERS FOR, EACH WITH ITS AREA. Wave 13y round 91, item 12b of the
 * line's requirements: the line under a supervisor's name in the chat is the area a secretary's duties give it, and
 * tests/the-chat-names-each-secretarys-duty.test.ts holds that line. src/shared/kinds.ts declares the optional field
 * `supervisors` last among the duties; src/server/lib/grant/secretary-duties.ts is its guard, and
 * src/server/api/secretary-duties.ts its door. The secretary said yes to those three files for 13s (message UncYbr86ZmaK), and
 * 13s's supervisor set four conditions (message jAl0Ms2rBp4F). Each entry is {agent, area}: a quoted role word in
 * src/ is what tests/one-declaration-decides-what-a-role-may-do.test.ts refuses, so the entry's key is not one.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The secretaries, the
 * supervisors and the worker are made-up agents with made-up handles, each holding the key the office answered. The
 * decision the duties rest on, the duties and every area are made up.
 *
 * THE CASES, in order, on one world:
 *   1. the person writes an entry naming a live supervisor. It is kept, both read doors answer it, and the binding
 *      writes it after every other duty;
 *   2. an entry naming a worker, a secretary, a retired supervisor or no registry agent is refused, through the PUT and
 *      through PATCH /api/records in the same words, and nothing is written;
 *   3. the same supervisor twice is refused, and so is a supervisor another secretary's duties already name. The
 *      secretary's own duties may name their own supervisor again;
 *   4. an area that is empty, over 200 characters or more than one line is refused, and so is an entry holding a key
 *      besides agent and area. An area of exactly 200 characters is kept;
 *   5. the secretary's change of its supervisors is refused without a warrant, with a warrant naming the duties as
 *      they stood, and with words that are not in the decision, and nothing is written. With the person's words and a
 *      warrant naming the change it is written, and the revision keeps the warrant. The person's change needs none;
 *   6. a warrant written before the field was added, for duties with no supervisors, still names the same duties:
 *      the binding is the same string, and the secretary's write carrying it is made. It is a third secretary's
 *      duties, which have never held supervisors, as duties written before the field have not.
 *
 * Red on round 91's tree before the code, and the mutations, each run alone after a control run and restored before
 * the next: see the commit that adds this file and the round's report. Case 6 is green before the code as well, as
 * it must be: it holds what the change may not move.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { SECRETARY_DUTIES_KIND } from '../src/shared/secretary-duties-record.ts'

type TheGuard = typeof import('../src/server/lib/grant/secretary-duties.ts')

const SECRETARY = 'supervisors-map-secretary'
const OTHER_SECRETARY = 'supervisors-speed-secretary'
/** The secretary whose duties never name a supervisor: case 6's. */
const PLAIN_SECRETARY = 'supervisors-plain-secretary'
const FIRST = 'supervisors-map-supervisor'
const SECOND = 'supervisors-speed-supervisor'
const THIRD = 'supervisors-third-supervisor'
const RETIRED = 'supervisors-retired-supervisor'
const WORKER = 'supervisors-worker'
/** A registry id no agent has. */
const NOBODY = 'NoAgentHasIt'

/** The person's words in the decision the duties rest on, which the secretary's warrant quotes. */
const WORDS = 'The made-up map secretary answers for the made-up map supervisors and gives each its area.'
const AREA = 'The made-up map plugin.'
const PLAIN_AREA = 'The made-up night ledger.'

let t: TestDb
let app: FastifyInstance
let guard: TheGuard
let decision = ''
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

/** One entry of `supervisors`, naming the agent by its registry id. */
const entry = (handle: string, area: string): { agent: { kind: string; id: string }; area: string } => ({
  agent: { kind: 'agent', id: idOf(handle) },
  area,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** The person's words, as a warrant the secretary carries for one act. */
function aWarrant(words: string, binding: string): Record<string, unknown> {
  return { saidBy: THE_PERSON, words, where: 'terminal', when: '2026-10-26 19:00', for: [binding] }
}

/** What the office holds about every duties record and every change to one, so a refusal can be shown to write nothing. */
function theDutiesAsStored(): string {
  const kind = SECRETARY_DUTIES_KIND
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT id, title, data, deleted_at FROM records WHERE kind = ? ORDER BY id').all(kind),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
    t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
  ])
}

/** The one live duties record naming this secretary. */
function theRecordOf(handle: string): { id: string; data: Record<string, unknown> } {
  const row = t.client.sqlite
    .prepare(`SELECT id, data FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.secretary.id') = ?`)
    .get(SECRETARY_DUTIES_KIND, idOf(handle)) as { id: string; data: string } | undefined
  if (row === undefined) throw new Error(`no duties record names ${handle}`)
  return { id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }
}

/** The duties the PUT takes, as the secretary's record holds them now, with `supervisors` as given. */
function theDutiesWith(supervisors: unknown[] | undefined): Record<string, unknown> {
  const { data } = theRecordOf(SECRETARY)
  const { secretary: _secretary, supervisors: _held, ...duties } = data
  return supervisors === undefined ? duties : { ...duties, supervisors }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  guard = await import('../src/server/lib/grant/secretary-duties.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [
    [SECRETARY, THE_SECRETARY],
    [OTHER_SECRETARY, THE_SECRETARY],
    [PLAIN_SECRETARY, THE_SECRETARY],
    [FIRST, THE_SUPERVISOR],
    [SECOND, THE_SUPERVISOR],
    [THIRD, THE_SUPERVISOR],
    [RETIRED, THE_SUPERVISOR],
    [WORKER, THE_WORKER],
  ] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const retired = await call('POST', `/api/participants/agent/${RETIRED}/retire`, PERSON, { because: 'A made-up retirement for this test.' })
  expect(retired.status, retired.raw).toBe(200)
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'A made-up decision on the map secretary and its supervisors',
    data: { option_taken: WORDS, because: 'A made-up reason.', decided_by: THE_OWNER, ...governsTheWholeProject(), replaces: [] },
  })
  expect(filed.status, filed.raw).toBe(201)
  decision = String(filed.body.record.id)
  // THE SECRETARY'S DUTIES BEFORE ANY SUPERVISOR, written as they could be before the field.
  const put = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, { area: AREA, restsOn: [decision] })
  expect(put.status, put.raw).toBe(201)
  const plain = await call('PUT', `/api/secretaries/${idOf(PLAIN_SECRETARY)}/duties`, PERSON, { area: PLAIN_AREA, restsOn: [decision] })
  expect(plain.status, plain.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a secretary's duties name its supervisors", () => {
  it('1: the person writes an entry naming a live supervisor, and it is kept, answered by both doors and bound last', async () => {
    const supervisors = [entry(FIRST, 'The made-up map tiles.')]
    const put = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith(supervisors))
    expect(put.status, put.raw).toBe(200)
    expect(put.body.written).toBe('changed')
    expect(put.body.record.data.supervisors).toEqual(supervisors)
    expect(put.body.duties.supervisors).toEqual(supervisors)
    const all = await call('GET', '/api/secretaries/duties', as(WORKER))
    expect(all.status, all.raw).toBe(200)
    const listed = (all.body.secretaries as { agent: { id: string }; duties: { supervisors?: unknown } | null }[]).find(
      (one) => one.agent.id === idOf(SECRETARY),
    )
    expect(listed?.duties?.supervisors, all.raw).toEqual(supervisors)
    // THE FIELD GOES LAST, after every duty there was before it, so the binding of duties without it does not move.
    expect(guard.THE_DUTIES_FIELDS.at(-1)).toBe('supervisors')
    const data = theRecordOf(SECRETARY).data
    expect(guard.theBindingOf(idOf(SECRETARY), data)).toBe(
      `${guard.THE_ACT_OF_SETTING_DUTIES}:${idOf(SECRETARY)}:${JSON.stringify({ area: AREA, restsOn: [decision], supervisors })}`,
    )
  })

  it('2: an entry naming a worker, a secretary, a retired supervisor or no registry agent is refused, by both doors, and nothing is written', async () => {
    const { id } = theRecordOf(SECRETARY)
    for (const [named, why] of [
      [idOf(WORKER), `${WORKER}, which holds the ${THE_WORKER} card`],
      [idOf(OTHER_SECRETARY), `${OTHER_SECRETARY}, which holds the ${THE_SECRETARY} card`],
      [idOf(RETIRED), `${RETIRED}, and ${RETIRED} is retired`],
      [NOBODY, `the agent ${NOBODY}, and no agent has that registry id`],
    ] as const) {
      const supervisors = [{ agent: { kind: 'agent', id: named }, area: 'A made-up area.' }]
      const before = theDutiesAsStored()
      const put = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith(supervisors))
      expect(put.status, put.raw).toBe(400)
      expect(put.error).toContain(`data.supervisors names ${why}`)
      expect(theDutiesAsStored()).toBe(before)
      const patched = await call('PATCH', `/api/records/${id}`, PERSON, { dataPatch: { supervisors } })
      expect(patched.status, patched.raw).toBe(400)
      expect(patched.error).toBe(put.error)
      expect(theDutiesAsStored()).toBe(before)
    }
  })

  it("3: the same supervisor twice is refused, and so is one another secretary's duties name, but not the secretary's own", async () => {
    let before = theDutiesAsStored()
    const twice = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith([
      entry(FIRST, 'The made-up map tiles.'),
      entry(FIRST, 'The made-up map page.'),
    ]))
    expect(twice.status, twice.raw).toBe(400)
    expect(twice.error).toContain(`data.supervisors names ${FIRST} twice`)
    expect(theDutiesAsStored()).toBe(before)

    const { id: mine } = theRecordOf(SECRETARY)
    const taken = await call('PUT', `/api/secretaries/${idOf(OTHER_SECRETARY)}/duties`, PERSON, {
      area: 'The made-up response speed.',
      restsOn: [decision],
      supervisors: [entry(FIRST, 'The made-up speed of the map.')],
    })
    expect(taken.status, taken.raw).toBe(409)
    expect(taken.error).toContain(`data.supervisors names ${FIRST}, and the duties ${mine}`)
    expect(theDutiesAsStored()).toBe(before)

    const other = await call('PUT', `/api/secretaries/${idOf(OTHER_SECRETARY)}/duties`, PERSON, {
      area: 'The made-up response speed.',
      restsOn: [decision],
      supervisors: [entry(SECOND, 'The made-up slow requests.')],
    })
    expect(other.status, other.raw).toBe(201)
    before = theDutiesAsStored()
    // THE SECRETARY'S OWN RECORD DOES NOT REFUSE ITSELF as the duties already naming its supervisor.
    const own = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith([
      entry(FIRST, 'The made-up map tiles, and their colours.'),
      entry(THIRD, 'The made-up map page.'),
    ]))
    expect(own.status, own.raw).toBe(200)
    expect(own.body.written).toBe('changed')
    expect(theDutiesAsStored()).not.toBe(before)
  })

  it('4: an area empty, over 200 characters or of two lines is refused, and so is an entry with another key; 200 characters are kept', async () => {
    const at = guard.AN_AREA_AT_MOST
    expect(at).toBe(200)
    for (const area of ['', 'x'.repeat(at + 1), 'The made-up map tiles.\nAnd their colours.']) {
      const before = theDutiesAsStored()
      const put = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith([entry(FIRST, area)]))
      expect(put.status, `${JSON.stringify(area.slice(0, 30))}: ${put.raw}`).toBe(400)
      expect(put.error).toContain(`The area of each entry of data.supervisors is one line of at most ${String(at)} characters`)
      expect(theDutiesAsStored()).toBe(before)
    }
    const before = theDutiesAsStored()
    const more = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith([
      { ...entry(FIRST, 'The made-up map tiles.'), since: '2026-10-26' },
    ]))
    expect(more.status, more.raw).toBe(400)
    expect(more.error).toContain('Each entry of data.supervisors holds agent and area, and nothing else')
    expect(theDutiesAsStored()).toBe(before)

    const longest = [entry(FIRST, 'y'.repeat(at))]
    const kept = await call('PUT', `/api/secretaries/${idOf(SECRETARY)}/duties`, PERSON, theDutiesWith(longest))
    expect(kept.status, kept.raw).toBe(200)
    expect(theRecordOf(SECRETARY).data['supervisors']).toEqual(longest)
  })

  it("5: the secretary's change of its supervisors needs a warrant naming that change and the person's words; the person's needs none", async () => {
    const asTheyStand = theDutiesWith(theRecordOf(SECRETARY).data['supervisors'] as unknown[])
    const changed = theDutiesWith([entry(THIRD, 'The made-up map page, from the secretary.')])
    const url = `/api/secretaries/${idOf(SECRETARY)}/duties`
    const binding = guard.theBindingOf(idOf(SECRETARY), changed)
    expect(binding).not.toBe(guard.theBindingOf(idOf(SECRETARY), asTheyStand))
    const before = theDutiesAsStored()

    const none = await call('PUT', url, as(SECRETARY), changed)
    expect(none.status, none.raw).toBe(403)
    expect(none.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone)
    expect(theDutiesAsStored()).toBe(before)

    // A WARRANT FOR THE DUTIES AS THEY STOOD does not name a change of the supervisors. The door's warrant reader
    // refuses it before the guard is asked, so the words are the reader's.
    const stale = await call('PUT', url, as(SECRETARY), {
      ...changed,
      warrant: aWarrant(WORDS, guard.theBindingOf(idOf(SECRETARY), asTheyStand)),
    })
    expect(stale.status, stale.raw).toBe(403)
    expect(stale.error).toContain(`This request acts on "${binding}", which it does not name`)
    expect(theDutiesAsStored()).toBe(before)

    const notTheirs = await call('PUT', url, as(SECRETARY), { ...changed, warrant: aWarrant('Words the person never said.', binding) })
    expect(notTheirs.status, notTheirs.raw).toBe(403)
    expect(notTheirs.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheirWords)
    expect(theDutiesAsStored()).toBe(before)

    const warrant = aWarrant(WORDS, binding)
    const written = await call('PUT', url, as(SECRETARY), { ...changed, warrant })
    expect(written.status, written.raw).toBe(200)
    const { id, data } = theRecordOf(SECRETARY)
    expect(data['supervisors']).toEqual(changed['supervisors'])
    const kept = t.client.sqlite.prepare('SELECT warrant FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { warrant: string | null }
    expect(kept.warrant === null ? null : JSON.parse(kept.warrant)).toMatchObject({ words: WORDS, for: [binding] })

    const byThePerson = await call('PUT', url, PERSON, asTheyStand)
    expect(byThePerson.status, byThePerson.raw).toBe(200)
    expect(theRecordOf(SECRETARY).data['supervisors']).toEqual(asTheyStand['supervisors'])
  })

  it('6: a warrant written before the field, for duties with no supervisors, still names the same duties', async () => {
    // THE THIRD SECRETARY'S DUTIES, which have never held supervisors. The map secretary's have since case 1, and a PUT
    // leaving out a field the record holds is refused by the gate writes-that-empty-fields, so this case is not theirs.
    // THE ORDER THE BINDING WROTE BEFORE ROUND 91, written here and not read from the guard: it is the past a warrant
    // already written was bound in, and the guard's list is what this case holds still.
    const before91 = ['area', 'responsibleFor', 'lines', 'doors', 'reportsToThePerson', 'restsOn']
    const duties: Record<string, unknown> = {
      restsOn: [decision],
      reportsToThePerson: ['A made-up line to the person when a supervisor changes.'],
      lines: ['a made-up line'],
      responsibleFor: ['The made-up night ledger.'],
      area: PLAIN_AREA,
    }
    const written = `${guard.THE_ACT_OF_SETTING_DUTIES}:${idOf(PLAIN_SECRETARY)}:${JSON.stringify(
      Object.fromEntries(before91.filter((key) => duties[key] !== undefined).map((key) => [key, duties[key]])),
    )}`
    expect(guard.theBindingOf(idOf(PLAIN_SECRETARY), duties)).toBe(written)
    expect(guard.theBindingOf(idOf(PLAIN_SECRETARY), { secretary: { kind: 'agent', id: idOf(PLAIN_SECRETARY) }, ...duties })).toBe(written)
    const put = await call('PUT', `/api/secretaries/${idOf(PLAIN_SECRETARY)}/duties`, as(PLAIN_SECRETARY), { ...duties, warrant: aWarrant(WORDS, written) })
    expect(put.status, put.raw).toBe(200)
    expect(put.body.written).toBe('changed')
    expect(theRecordOf(PLAIN_SECRETARY).data).toEqual({ secretary: { kind: 'agent', id: idOf(PLAIN_SECRETARY) }, ...duties })
  })
})
