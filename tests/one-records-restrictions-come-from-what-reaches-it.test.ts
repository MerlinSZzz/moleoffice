// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RECORD'S RESTRICTIONS ARE WORKED OUT FROM WHAT REACHES IT, AND THE ANSWER IS THE WHOLE PROJECT'S ANSWER.
 *
 * MEASURED FIRST, in wave 13y round 79, on the made-up office (made-up data). `restrictionsOn` in
 * src/server/lib/restrictions.ts read every record of the project and every link of the project to answer for one
 * record, and that was most of the time of `GET /api/records/:id`, the dearest operation of the live office. It now
 * reads the record asked for, the restrictions of its project, the links reachable upstream from the record, and the
 * `about`, `resolves`, `implements` and `part_of` links its answer reads.
 *
 * WHAT MUST NOT CHANGE IS THE ANSWER, so the whole-project read stays in the file as the judge. `restrictionsReaching`
 * still builds the whole graph when it is not handed one, and for every record of a small office that holds each kind
 * of reach, in every project, deleted records and an id nobody has included, the two answers must be the same by hash:
 * the same readings in the same order, the same count of deleted records walked past, and the same sentences of what
 * could not be checked.
 *
 * THE OFFICE IS BUILT THROUGH THE DOORS where a door will build it. A few rows are written straight into the table,
 * because no door writes them: links whose two ends are in two projects, links filed in a project their ends are not
 * in, and a restriction in the message centre. Whatever the doors allow today, both reads must agree on what is
 * stored, and each of those rows is one a wider read would wrongly follow.
 *
 * WHAT A CALLER SEES. The record door is asked by the person and by an agent who reads only the messages it is party
 * to. A restricted record gives both the same restrictions; another project's record, an id nobody has and a message
 * the agent is no party to stay refused.
 *
 * THE ORDER. The restrictions are listed by title and, for one title, in the order they were made. That was the order
 * of the index the whole-project scan happened to use on a database with no statistics table, and it is now said in
 * the query. The test checks there is no statistics table, so it is that database it pins.
 *
 * WHAT IT READS. The rows `restrictionsOn` reads for one record must not grow when the project grows by records and
 * links that do not reach it.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import type { TheWalk, UpstreamGraph } from '../src/server/lib/restrictions.ts'

const HERE = 'default'
const THERE = 'robotics-elsewhere'
const CENTRE = 'message-centre'
const NOBODY_HAS_THIS_ID = 'no-record-has-this-id'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': HERE }
const PERSON_THERE = { ...PERSON, 'x-mole-office-workspace': THERE }
const ADA = 'ada-restriction-reader'
const DEE = 'dee-restriction-bystander'
const asAgent = (handle: string) => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': HERE })

type Lib = typeof import('../src/server/lib/restrictions.ts')
type Reading = { restrictionId: string; title: string; kind: string; holdsField: string | null; reach: { how: string; through?: string; distance?: number; carriedFrom?: string }; standing: { state: string; revalidationId?: string | null; resolvedBy?: string } }
type Reply = { found: Reading[]; skippedDeleted: number; couldNotCheck: { what: string; because: string }[] }

let t: TestDb
let app: FastifyInstance
let lib: Lib
const id: Record<string, string> = {}
const twins: string[] = []

async function call(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload: unknown, headers: Record<string, string> = PERSON): Promise<any> {
  const res = await app.inject({ method, url, payload: payload as object, headers })
  if (method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, payload) === 409) expect(res.statusCode, `${method} ${url}: ${res.body}`).toBe(409)
  else expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300)
  return res.json()
}

async function record(kind: string, title: string, data: Record<string, unknown> = { state: 'measured' }, headers = PERSON): Promise<string> {
  return (await call('POST', '/api/records', { kind, title, data }, headers)).record.id as string
}

async function restriction(title: string, severity: 'stops_final' | 'limits_claims' | 'harmless', extra: Record<string, unknown> = {}, headers = PERSON): Promise<string> {
  return record('placeholder', title, {
    what: `${title}: a made-up stand-in.`,
    slot: 'stand_in',
    substitute: 'a made-up value',
    resolved_when: 'Somebody measures it.',
    allowed_uses: severity === 'harmless' ? [] : ['pipeline plumbing'],
    disallowed_claims: severity === 'harmless' ? [] : ['geometric accuracy claims'],
    severity,
    ...extra,
  }, headers)
}

async function link(fromId: string, toId: string, type: string, headers = PERSON): Promise<void> {
  await call('POST', '/api/links', { fromId, toId, type }, headers)
}

let straight = 0
/** A link no door would write, written into the table so both reads meet it. See the header. */
function straightIntoTheTable(workspaceId: string, fromId: string, toId: string, type: string): void {
  straight += 1
  t.client.sqlite
    .prepare(
      `INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type)
       VALUES (?, ?, ?, '2026-10-25 09:00:00', '2026-10-25 09:00:00', ?, ?, ?, 0, ?, 'human')`,
    )
    .run(`written-straight-${straight}`, workspaceId, THE_TEST_OFFICES_OWNER.id, fromId, toId, type, THE_TEST_OFFICES_OWNER.id)
}

async function anAgent(handle: string): Promise<string> {
  await call('POST', '/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })).json() as { agents?: { id: string; handle: string }[] }
  const row = (listed.agents ?? []).find((agent) => agent.handle === handle)
  if (row === undefined) throw new Error(`the agent ${handle} was registered and is not listed`)
  return row.id
}

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** The whole-project read, in `restrictionsOn`'s shape: the judge every answer is held to. */
function theWholeProjectsAnswer(recordId: string, workspaceId: string): Reply {
  const whole = lib.restrictionsReaching([recordId], workspaceId)
  return { found: (whole.found.get(recordId) ?? []) as Reading[], skippedDeleted: whole.skippedDeleted, couldNotCheck: whole.couldNotCheck }
}

const on = (recordId: string, workspaceId = HERE): Reply => lib.restrictionsOn(recordId, workspaceId) as Reply

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  lib = await import('../src/server/lib/restrictions.ts')
  await call('POST', '/api/workspaces', { id: THERE, title: 'Robotics' })

  // THE ORDER OF THE LIST. Zeta is made before Alpha, and five restrictions share one title, made in turn.
  id.zeta = await restriction("Zeta: the camera's stand-in focal length", 'stops_final', { holds_field: 'fx' })
  id.alpha = await restriction('Alpha: a stand-in exposure table', 'limits_claims')
  for (let i = 0; i < 5; i += 1) twins.push(await restriction('Twin: one title for five', 'limits_claims'))

  // A CHAIN OVER ALL FOUR DEPENDENCY EDGES. b came out of a, c out of b; d consumes c; d produces e; f measures e.
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) id[name] = await record('claim', `Chain record ${name}`)
  await link(id.b!, id.a!, 'derived_from')
  await link(id.c!, id.b!, 'derived_from')
  await link(id.d!, id.c!, 'consumes')
  await link(id.d!, id.e!, 'produces')
  await link(id.f!, id.e!, 'measures')
  // g rests on f, so what is about g is downstream of f and must not reach it.
  await link(id.g!, id.f!, 'derived_from')
  for (const r of [id.zeta!, id.alpha!, ...twins]) await link(r, id.a!, 'about')
  id.downstream = await restriction('Downstream: about the record that rests on f', 'stops_final')
  await link(id.downstream, id.g!, 'about')

  // A DELETED HOP. f came out of `gone`, which came out of `behind`; what is about `behind` reaches f only through
  // the deleted record, so it does not reach it, and the walk counts the record it could not pass.
  id.behind = await record('claim', 'Behind the deleted record')
  id.gone = await record('claim', 'A deleted step')
  await link(id.gone, id.behind, 'derived_from')
  await link(id.f!, id.gone, 'derived_from')
  id.behindRestriction = await restriction('Behind: about a record past a deleted one', 'stops_final')
  await link(id.behindRestriction, id.behind, 'about')
  await call('DELETE', `/api/records/${id.gone}`, undefined)

  // LINKS THAT ARE NOT DEPENDENCIES. f is about u1 and relates to it; what is about u1 must not reach f.
  id.u1 = await record('claim', 'Unrelated one')
  id.u2 = await record('claim', 'Unrelated two')
  await link(id.u2, id.u1, 'derived_from')
  await link(id.f!, id.u1, 'relates_to')
  await link(id.f!, id.u1, 'about')
  id.unrelated = await restriction('Unrelated: about a record f only mentions', 'stops_final')
  await link(id.unrelated, id.u1, 'about')

  // TWO PATHS OF ONE LENGTH. n consumes p1 and p2, and the restriction is about p2 first: the first declared wins.
  for (const name of ['n', 'p1', 'p2']) id[name] = await record('claim', `Diamond record ${name}`)
  await link(id.n!, id.p1!, 'consumes')
  await link(id.n!, id.p2!, 'consumes')
  id.diamond = await restriction('Diamond: two paths of one length', 'stops_final')
  await link(id.diamond, id.p2!, 'about')
  await link(id.diamond, id.p1!, 'about')

  // CARRIED. A module implements two steps of a pipeline, Y first, and another module is part of X. The restriction is
  // about X first, so the step carried is the first of the module's own links whose step is declared: Y.
  const pipeline = await record('pipeline', 'Perception', {})
  id.x = (await call('POST', `/api/records/${pipeline}/blocks`, { name: 'Pixel segmentation', state: 'doing' })).record.id
  id.y = (await call('POST', `/api/records/${pipeline}/blocks`, { name: 'Depth fusion', state: 'doing' })).record.id
  id.t = await record('module', 'Segmentation module', { state: 'active' })
  id.t2 = await record('module', 'A part of the segmentation step', { state: 'active' })
  await link(id.t, id.y!, 'implements')
  await link(id.t, id.x!, 'implements')
  await link(id.t2, id.x!, 'part_of')
  id.carried = await restriction('Carried: a stand-in for the segmentation step', 'limits_claims')
  await link(id.carried, id.x!, 'about')
  await link(id.carried, id.y!, 'about')
  // A METHOD RAN INSTEAD on Y: the second kind of restriction, made by its own door with its own `about` link.
  await call('PATCH', `/api/records/${id.y}`, { dataPatch: { method: 'Stereo depth fusion' } })
  id.ranInstead = (
    await call('POST', `/api/records/${id.y}/ran-instead`, {
      ran: 'A made-up fixed depth of one metre.',
      because: 'The stereo pair is not mounted yet.',
      since: '2026-10-20',
      allowed_uses: ['downstream plumbing'],
      disallowed_claims: ['that depth fusion works'],
      severity: 'limits_claims',
    })
  ).record.id

  // HARMLESS: direct on what it is about, and nowhere else. It is about a, which f rests on.
  id.harmless = await restriction('Harmless: nothing rests on it', 'harmless')
  await link(id.harmless, id.t, 'about')
  await link(id.harmless, id.a!, 'about')

  // RESOLVED. Two answers, the second made last; one record judged; one record that rests on b only after the answer.
  id.resolved = await restriction('Resolved: an answered stand-in', 'stops_final')
  await link(id.resolved, id.b!, 'about')
  id.answerOne = await record('note', 'The first answer', { body: 'It was measured.' })
  id.answerTwo = await record('note', 'The second answer', { body: 'It was measured again.' })
  await link(id.answerOne, id.resolved, 'resolves')
  await link(id.answerTwo, id.resolved, 'resolves')
  await link(id.answerOne, id.harmless, 'resolves')
  await call('PUT', `/api/revalidations/${id.resolved}/${id.d}`, { state: 'checked', note: 'Looked at again; it holds.' })
  id.late = await record('claim', 'Rests on c only after the answer')
  await link(id.late, id.c!, 'derived_from')

  // A DELETED RESTRICTION, and one about a deleted record.
  id.withdrawn = await restriction('Withdrawn: a deleted restriction', 'stops_final')
  await link(id.withdrawn, id.a!, 'about')
  await call('DELETE', `/api/records/${id.withdrawn}`, undefined)
  id.aboutGone = await restriction('Gone: about a deleted record', 'stops_final')
  await link(id.aboutGone, id.gone, 'about')

  // THE OTHER PROJECT: a restriction about one of its records, a record that rests on that one, and a deleted one.
  id.o = await record('claim', 'A record of the other project', { state: 'measured' }, PERSON_THERE)
  id.q = await record('claim', 'Rests on the other project record', { state: 'measured' }, PERSON_THERE)
  id.oGone = await record('claim', 'A deleted record of the other project', { state: 'measured' }, PERSON_THERE)
  await link(id.q, id.o, 'derived_from', PERSON_THERE)
  id.there = await restriction('There: a restriction of the other project', 'stops_final', {}, PERSON_THERE)
  await link(id.there, id.o, 'about', PERSON_THERE)
  await call('DELETE', `/api/records/${id.oGone}`, undefined, PERSON_THERE)

  // ROWS NO DOOR WRITES (the header says why they are here). Each is one a read that ignored the project would follow.
  id.answerThere = await record('note', 'An answer filed elsewhere', { body: 'Made up.' })
  id.t3 = await record('module', 'A module whose link is filed elsewhere', { state: 'active' })
  id.elsewhereAbout = await restriction('Elsewhere: about a record of the other project', 'limits_claims')
  straightIntoTheTable(HERE, id.f!, id.o, 'consumes')
  straightIntoTheTable(HERE, id.f!, id.oGone, 'consumes')
  straightIntoTheTable(HERE, id.elsewhereAbout, id.o, 'about')
  straightIntoTheTable(HERE, id.there, id.f!, 'about')
  straightIntoTheTable(THERE, id.f!, id.u2!, 'derived_from')
  straightIntoTheTable(THERE, id.unrelated, id.f!, 'about')
  straightIntoTheTable(THERE, id.answerThere, id.zeta!, 'resolves')
  straightIntoTheTable(THERE, id.t3, id.x!, 'implements')
  straightIntoTheTable(THERE, id.there, id.a!, 'about')

  // THE MESSAGE CENTRE. Two messages from the person to ada, the second derived from the first, and a restriction in
  // the centre about the first. No door files a restriction there, so one is moved there by hand.
  await anAgent(ADA)
  await anAgent(DEE)
  const ada = (await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })).json().agents.find((agent: { handle: string }) => agent.handle === ADA).id
  const message = async (title: string) =>
    (await call('POST', '/api/records', { kind: 'message', title, data: { body: `${title}.`, to: [{ kind: 'agent', id: ada }] } })).record.id as string
  id.m1 = await message('A made-up question about the camera')
  id.m2 = await message('A made-up follow-up')
  await link(id.m2, id.m1, 'derived_from')
  id.centreRestriction = await restriction('Centre: a restriction in the message centre', 'limits_claims')
  t.client.sqlite.prepare('UPDATE records SET workspace_id = ? WHERE id = ?').run(CENTRE, id.centreRestriction)
  straightIntoTheTable(CENTRE, id.centreRestriction, id.m1, 'about')
  id.aboutMessage = await restriction('Message: about a message, from the project', 'limits_claims')
  await link(id.aboutMessage, id.m1, 'about')
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the office holds every kind of reach, so the comparison below is not empty', () => {
  it('has direct, carried (both ways), long dependent, resolved, judged, harmless, deleted, centre and refused answers', () => {
    const f = on(id.f!)
    const titles = f.found.map((one) => one.title)
    expect(titles, 'what reaches f along the chain').toEqual(expect.arrayContaining(["Zeta: the camera's stand-in focal length", 'Alpha: a stand-in exposure table', 'Resolved: an answered stand-in']))
    for (const never of ['Downstream', 'Behind', 'Unrelated', 'Harmless', 'There', 'Elsewhere', 'Withdrawn', 'Gone', 'Centre', 'Message', 'Diamond', 'Carried']) {
      expect(titles.some((title) => title.startsWith(never)), `${never} must not reach f`).toBe(false)
    }
    expect(f.found.find((one) => one.restrictionId === id.zeta)!.reach).toMatchObject({ how: 'depends', distance: 5 })
    expect(f.skippedDeleted, 'f rests on a deleted record').toBeGreaterThan(0)

    const resolvedOn = (recordId: string) => on(recordId).found.find((one) => one.restrictionId === id.resolved)
    expect(resolvedOn(id.c!)!.standing).toMatchObject({ state: 'resolved-unchecked', resolvedBy: id.answerTwo })
    expect(resolvedOn(id.c!)!.standing.revalidationId).toEqual(expect.any(String))
    expect(resolvedOn(id.late!)!.standing).toMatchObject({ state: 'resolved-unchecked', revalidationId: null })
    expect(resolvedOn(id.d!), 'd was judged, so the reading is gone from it').toBeUndefined()
    expect(on(id.a!).found.find((one) => one.restrictionId === id.harmless)!.standing.state).toBe('resolved')
    expect(on(id.a!).found.find((one) => one.restrictionId === id.zeta)!.holdsField).toBe('fx')

    const module = on(id.t!).found
    expect(module.find((one) => one.restrictionId === id.carried)!.reach).toEqual({ how: 'carried', through: 'implements', carriedFrom: id.y })
    expect(module.find((one) => one.restrictionId === id.ranInstead)!.kind).toBe('ran_instead')
    expect(on(id.t2!).found.find((one) => one.restrictionId === id.carried)!.reach).toMatchObject({ how: 'carried', through: 'part_of' })
    expect(on(id.t3!).found, 'a module whose link is filed in another project carries nothing').toEqual([])
    const diamond = on(id.n!).found.find((one) => one.restrictionId === id.diamond)!
    expect((diamond.reach as unknown as { path: { recordId: string }[] }).path.at(-1)!.recordId, 'the first declared of two at one length').toBe(id.p2)

    expect(on(id.m2!).found.map((one) => one.restrictionId), 'the centre is walked for a message').toEqual([id.centreRestriction])
    expect(on(id.o!, THERE).found.map((one) => one.restrictionId)).toEqual([id.there])
    expect(on(id.gone!).couldNotCheck.map((one) => one.because)).toContain('it has been deleted, so nothing was walked from it')
    expect(on(NOBODY_HAS_THIS_ID).couldNotCheck.map((one) => one.because)).toContain('no record of that id is in this project')
    expect(on(id.o!).found, 'another project record, asked from here').toEqual([])
  })
})

describe('restrictionsOn gives the whole project answer for every record', () => {
  it('in every project and the message centre, deleted records and an id nobody has included, by hash', () => {
    const ids = (t.client.sqlite.prepare('SELECT id FROM records ORDER BY rowid').all() as { id: string }[]).map((row) => row.id)
    ids.push(NOBODY_HAS_THIS_ID)
    let compared = 0
    for (const workspaceId of [HERE, THERE, CENTRE]) {
      for (const recordId of ids) {
        const one = on(recordId, workspaceId)
        const whole = theWholeProjectsAnswer(recordId, workspaceId)
        expect(one, `${recordId} in ${workspaceId}`).toEqual(whole)
        expect(hash(one), `${recordId} in ${workspaceId}, by hash`).toBe(hash(whole))
        compared += 1
      }
    }
    expect(compared).toBe(3 * ids.length)
  })
})

describe('the order of the restrictions found', () => {
  it('is by title and, for one title, the order they were made, on a database with no statistics table', () => {
    const statistics = t.client.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'sqlite_stat%'").get() as { n: number }
    expect(statistics.n, 'this pins the order on a database nobody has analysed').toBe(0)
    const found = on(id.a!).found
    const titles = found.map((one) => one.title)
    expect(titles, 'by title').toEqual([...titles].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0)))
    expect(titles.indexOf('Alpha: a stand-in exposure table')).toBeLessThan(titles.indexOf("Zeta: the camera's stand-in focal length"))
    expect(found.filter((one) => one.title === 'Twin: one title for five').map((one) => one.restrictionId), 'one title, in the order made').toEqual(twins)
    expect(hash(found)).toBe(hash(theWholeProjectsAnswer(id.a!, HERE).found))
  })
})

describe('the record door shows a caller no more than it did', () => {
  async function read(recordId: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
    const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers })
    return { status: res.statusCode, body: res.json() }
  }

  it('gives the person and an agent who reads only its own messages the same restrictions on a restricted record', async () => {
    const person = await read(id.f!, PERSON)
    const dee = await read(id.f!, asAgent(DEE))
    expect(person.status).toBe(200)
    expect(dee.status).toBe(200)
    expect(hash(dee.body.restrictions)).toBe(hash(person.body.restrictions))
    expect(hash(person.body.restrictions)).toBe(hash(theWholeProjectsAnswer(id.f!, HERE)))
  })

  it('refuses another project record, an id nobody has, and a message the agent is no party to, and names no restriction', async () => {
    for (const headers of [PERSON, asAgent(DEE)]) {
      for (const recordId of [id.o!, NOBODY_HAS_THIS_ID]) {
        const refused = await read(recordId, headers)
        expect(refused.status, `${recordId} for ${headers['x-mole-office-actor-id']}`).toBe(404)
        expect(JSON.stringify(refused.body)).not.toContain('There: a restriction')
        expect(refused.body.restrictions).toBeUndefined()
      }
    }
    const dee = await read(id.m2!, asAgent(DEE))
    expect(dee.status, 'a message dee is no party to').toBe(404)
    expect(JSON.stringify(dee.body)).not.toContain('Centre: a restriction')
    for (const headers of [PERSON, asAgent(ADA)]) {
      const party = await read(id.m2!, headers)
      expect(party.status).toBe(200)
      expect(party.body.restrictions.found.map((one: Reading) => one.restrictionId)).toEqual([id.centreRestriction])
    }
  })
})

describe('what one record costs to answer', () => {
  /**
   * The rows every statement hands back while `act` runs. The statement's own prototype is watched, so a statement
   * prepared once and kept is counted as well as one prepared now.
   */
  function rowsReadDuring(act: () => void): number {
    const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => object }
    type Methods = Record<'all' | 'get' | 'iterate', (this: unknown, ...args: unknown[]) => any>
    const proto = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Methods
    const kept: Methods = { all: proto.all, get: proto.get, iterate: proto.iterate }
    let rows = 0
    proto.all = function (...args) {
      const found = kept.all.apply(this, args) as unknown[]
      rows += found.length
      return found
    }
    proto.get = function (...args) {
      const found = kept.get.apply(this, args)
      if (found !== undefined) rows += 1
      return found
    }
    proto.iterate = function* (...args) {
      for (const row of kept.iterate.apply(this, args) as Iterable<unknown>) {
        rows += 1
        yield row
      }
    }
    try {
      act()
    } finally {
      Object.assign(proto, kept)
    }
    return rows
  }

  it('reads no more rows when the project grows by records and links that do not reach the record', async () => {
    const before = on(id.f!)
    const small = rowsReadDuring(() => on(id.f!))
    let previous: string | null = null
    for (let i = 0; i < 20; i += 1) {
      const made = await record('claim', `A record that reaches nothing asked, ${i}`)
      if (previous !== null) await link(made, previous, i % 2 === 0 ? 'derived_from' : 'consumes')
      if (i % 4 === 0) await call('DELETE', `/api/records/${made}`, undefined)
      previous = made
    }
    const large = rowsReadDuring(() => on(id.f!))
    expect(small, 'the counter saw the read').toBeGreaterThan(0)
    expect(large, `rows read for one record: ${small} before twenty more records and their links, ${large} after`).toBe(small)
    expect(hash(on(id.f!)), 'and the answer did not change').toBe(hash(before))
  })
})

/**
 * NEVER CALLED: the compiler is the test. The graph built for one record holds only the edges upstream of it, so a
 * downstream walk over it would find nothing and say so as if nothing rested on the record. Its own type keeps it from
 * the downstream walk, and the line below must stay an error for `tsc` to pass.
 */
function aGraphOfOneRecordIsNeverWalkedDownstream(walk: TheWalk, graph: UpstreamGraph): void {
  walk(graph, 'a record', 'upstream')
  // @ts-expect-error the graph of one record holds no downstream edges, so only the upstream walk may take it
  walk(graph, 'a record', 'downstream')
}
void aGraphOfOneRecordIsNeverWalkedDownstream
