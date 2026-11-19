// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READ-ONLY INTERFACE A PLUGIN READS THROUGH, VERSION 1: ITS CONTRACT. Wave 13x round 14, step 2 of the plugin
 * pipeline udGnc-Bsr15R (block 1DP8abzhUpNb). The views are src/server/lib/plugin-read.ts.
 *
 * WHAT THIS FILE PROVES, in its own office with two keyed agents, a claimed task and messages between them:
 * 1. The family plugin-read holds exactly the six views, every one a GET, and every plugin-read operation is a read.
 *    The fifth, the roster, is the people view's who-is-who without presence, projects or pictures (wave 13y round 50).
 *    The sixth, online, says of each agent on the roster only whether it is online (wave 13y round 66).
 * 2. Each view answers with its shape pinned: the fields named here and no others. A field added to a view, or one
 *    taken away, turns this red, so v1 cannot change shape without somebody changing this file. The people and work
 *    views asked for some agents by ?agents= add one field, notAgents (wave 13y round 50).
 * 3. No view changes a table beyond what a plain GET of the office changes.
 * 4. No view carries a field named like a key, a value shaped like a key (64 hex characters), either agent's key, or
 *    the words of any message.
 * 5. talk reads on from `last`, and an unchanged view asked again with its ETag answers 304.
 * 6. talk shows an agent only the messages it sent or was sent, and says why.
 * 7. work says each run's standing, so a run closed unchecked is not read as confirmed (gap G3).
 * 8. talk with start=latest replays nothing: it answers no message, and the place of the newest one to read on from
 *    (gap G7, wave 13x round 17).
 * 9. talk names, by id, each message withdrawn since withdrawnAfter that the caller could read, and only while it stays
 *    withdrawn. Without withdrawnAfter it names none and says where to begin (gap G9, wave 13x round 17).
 *    Its own subtraction and leftOutGroups count the withdrawals after withdrawnAfter and name, by id, the ones its
 *    limit left out, as the messages' do (wave 13x round 17e).
 * 10. talk names a withdrawn message whose origin is stored as 'Authored', because it draws the message while it is live.
 *    Both read the origin through readOrigin in src/shared/types.ts (3erp_y3PCi76, wave 13x round 20).
 *
 * The time each view takes is held apart, in the timing group: tests/the-plugin-read-views-answer-in-their-budget.test.ts.
 */
import { createHash } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkSubtraction, type LeftOutCounts, type LeftOutGroup } from '../src/shared/disclosure.ts'
import { OPERATIONS } from '../src/shared/ops.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PLUGIN_READ_VIEWS } from '../src/shared/plugins.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const keyOf: Record<string, string> = {}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keyOf[handle]! }
}

/** The words of every message this file writes. Not one of them may reach a plugin. */
/** The ids of the three messages. Two sent in one second are in the talk by id, so they are compared as sets. */
const SENT: string[] = []

const WORDS = [
  'the first words nobody may read through a plugin',
  'the second words nobody may read through a plugin',
  'the third words for the person only',
  'the fourth words, of a message whose origin is stored as Authored',
]

/** Every table's rows, hashed, read from the file rather than listed here. */
function hashOfEveryTable(): Record<string, string> {
  const sqlite = t.client.sqlite
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name)
  const hashes: Record<string, string> = {}
  for (const table of tables) {
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all()
    hashes[table] = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  return hashes
}

function changedTables(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys({ ...before, ...after }).filter((table) => before[table] !== after[table]).sort()
}

/** Every field name in a JSON value, at any depth. */
function everyFieldName(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) everyFieldName(item, into)
  else if (value !== null && typeof value === 'object') {
    for (const [name, inner] of Object.entries(value)) {
      into.push(name)
      everyFieldName(inner, into)
    }
  }
  return into
}

/** A field name is shaped like a key when one of its words is one of these. camelCase, kebab and snake are split. */
const KEY_WORDS = new Set(['key', 'keys', 'token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'credential', 'credentials', 'cookie', 'cookies', 'authorization', 'bearer'])
function namedLikeAKey(name: string): boolean {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((word) => KEY_WORDS.has(word.toLowerCase()))
}

/** The withdrawals of a read that names none: none was asked for, or none came after withdrawnAfter, so none is left out. */
function noneNamed(last: string) {
  return { ids: [], last, more: false, subtraction: { candidates: 0, carried: 0, leftOut: 0, shortened: 0 }, leftOutGroups: [{ cause: 'budget', bucket: 'withdrawal_limit', count: 0, ids: [] }] }
}

function view(name: string, headers: Record<string, string> = AS_THE_PERSON, query = '') {
  return app.inject({ method: 'GET', url: `/api/plugin-read/v1/${name}${query || (name === 'status' ? '?agents=' : '')}`, headers })
}

/** The id of the agent with this handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** Send a message through the door every agent uses, answered `expected` when the caller names it, and answer its id. */
async function say(headers: Record<string, string>, words: string, to: object, expected?: number): Promise<string> {
  const body = { kind: 'message', title: words, data: { body: words, to: [to] } }
  const sent = await app.inject({ method: 'POST', url: '/api/records', headers, payload: body })
  expect(sent.statusCode, sent.body.slice(0, 300)).toBe(expected ?? theAnswerToAWriteInATestOffice(headers, body))
  return sent.json().record.id as string
}

/** The same headers with no body type, for a door that takes no body. */
function noBody(headers: Record<string, string>): Record<string, string> {
  const { 'content-type': _type, ...rest } = headers
  return rest
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['alpha', 'beta']) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker', workArea: ['src'] } })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(201)
    keyOf[handle] = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
    expect(keyOf[handle]).toMatch(/^[0-9a-f]{64}$/)
  }
  // A RUN OF alpha'S THAT CLAIMS A TASK, so the work view has work in it.
  const session = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('alpha'), payload: { kind: 'session', title: 'Synthetic run for the plugin read test', data: { state: 'running', runtime: 'codex', servingAgent: 'alpha' } } })
  expect(session.statusCode, session.body.slice(0, 300)).toBe(201)
  const task = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent('alpha'), payload: { kind: 'task', title: 'Synthetic task for the plugin read test', data: { state: 'doing' } } })
  expect(task.statusCode, task.body.slice(0, 300)).toBe(201)
  const claim = await app.inject({ method: 'POST', url: '/api/claims', headers: asAgent('alpha'), payload: { run: session.json().record.id, things: [{ what: 'record', id: task.json().record.id }] } })
  expect(claim.statusCode, claim.body.slice(0, 300)).toBe(201)
  // THREE MESSAGES, sent through the door every agent uses: alpha to beta, beta to alpha, and one from the person to
  // beta that alpha may not see. Registering an agent sends messages of its own, and those are in the talk too.
  // NOTHING HOLDS alpha OR beta IN THE TEST OFFICE YET, so the office stores each agent's message, routes it and answers
  // 409. The messages are stored all the same, and the talk lists them.
  SENT.push(await say(asAgent('alpha'), WORDS[0]!, { kind: 'agent', id: idOf('beta') }, 409))
  SENT.push(await say(asAgent('beta'), WORDS[1]!, { kind: 'agent', id: idOf('alpha') }, 409))
  SENT.push(await say(AS_THE_PERSON, WORDS[2]!, { kind: 'agent', id: idOf('beta') }))
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the plugin read interface, version 1', () => {
  it('1. holds every declared view, every one a GET, and every operation a read', async () => {
    expect(PLUGIN_READ_VIEWS).toContain('status')
    const reply = await app.inject({ method: 'GET', url: '/api/families/plugin-read', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
    const doors = (reply.json() as { endpoints: { method: string; path: string }[] }).endpoints.map((d) => `${d.method} ${d.path}`).sort()
    expect(doors).toEqual(PLUGIN_READ_VIEWS.map((v) => `GET /api/plugin-read/v1/${v}`).sort())
    const operations = OPERATIONS.filter((o) => o.name.startsWith('plugin-read.'))
    expect(operations.map((o) => o.name).sort()).toEqual(PLUGIN_READ_VIEWS.map((v) => `plugin-read.${v}`).sort())
    for (const operation of operations) expect(operation.effect, operation.name).toBe('read')
  })

  it('2. answers each view in its pinned shape', async () => {
    const fields = (value: object) => Object.keys(value).sort()
    const projects = (await view('projects')).json()
    expect(fields(projects)).toEqual(['interface', 'narrowedByPermission', 'projects', 'view'])
    expect(projects).toMatchObject({ interface: 'office-read/1', view: 'projects' })
    expect(fields(projects.projects[0])).toEqual(['id', 'name'])

    const people = (await view('people')).json()
    expect(fields(people)).toEqual(['agents', 'interface', 'narrowedByPermission', 'people', 'view'])
    expect(fields(people.people[0])).toEqual(['handle', 'id', 'kind', 'name'])
    const alpha = people.agents.find((a: { handle: string }) => a.handle === 'alpha')
    expect(fields(alpha)).toEqual(['appearance', 'appearanceChosen', 'createdAt', 'handle', 'id', 'kind', 'name', 'presence', 'projects', 'retired', 'role', 'scale', 'startedBy', 'visitor'])
    expect(fields(alpha.presence[0])).toEqual(['colour', 'project', 'word'])
    // THE SAVED MAP SCALE IS THE ONE STORED AT REGISTRATION, copied and not drawn again (gap G1, ttQWZUdwBnPa).
    const stored = t.client.sqlite.prepare('SELECT pixel_scale FROM agents WHERE handle = ?').get('alpha') as { pixel_scale: string | null }
    expect(stored.pixel_scale, 'a worker registered here has a saved scale').not.toBeNull()
    expect(alpha.scale).toEqual(JSON.parse(stored.pixel_scale!))
    expect(fields(alpha.scale)).toEqual(['roleAtGeneration', 'value', 'version'])

    const work = (await view('work')).json()
    expect(fields(work)).toEqual(['interface', 'narrowedByPermission', 'view', 'work'])
    const task = work.work.find((w: { title: string }) => w.title === 'Synthetic task for the plugin read test')
    expect(task, JSON.stringify(work).slice(0, 500)).toBeDefined()
    expect(fields(task)).toEqual(['agent', 'association', 'detail', 'doing', 'executing', 'id', 'project', 'recordedState', 'runStanding', 'title', 'updatedAt'])
    // A TASK IS NOT A RUN, so it has no standing; the run that claims it has one (gap G3, ttQWZUdwBnPa).
    expect(task.runStanding).toBeNull()
    const run = work.work.find((w: { title: string }) => w.title === 'Synthetic run for the plugin read test')
    expect(run, JSON.stringify(work).slice(0, 500)).toBeDefined()
    expect(fields(run)).toEqual(fields(task))
    expect(run.runStanding).toBe('working')

    // THE PEOPLE AND WORK VIEWS FOR SOME AGENTS add the ids asked that no agent has, and nothing else.
    const somePeople = (await view('people', AS_THE_PERSON, `?agents=${String(alpha.id)},nobody-here`)).json()
    expect(fields(somePeople)).toEqual(['agents', 'interface', 'narrowedByPermission', 'notAgents', 'people', 'view'])
    expect(somePeople.notAgents).toEqual(['nobody-here'])
    expect(fields(somePeople.agents[0])).toEqual(fields(alpha))
    const someWork = (await view('work', AS_THE_PERSON, `?agents=${String(alpha.id)},nobody-here`)).json()
    expect(fields(someWork)).toEqual(['interface', 'narrowedByPermission', 'notAgents', 'view', 'work'])
    expect(someWork.notAgents).toEqual(['nobody-here'])

    const roster = (await view('roster')).json()
    expect(fields(roster)).toEqual(['agents', 'interface', 'narrowedByPermission', 'people', 'view'])
    expect(roster).toMatchObject({ interface: 'office-read/1', view: 'roster' })
    expect(fields(roster.people[0])).toEqual(['handle', 'id', 'kind', 'name'])
    const alphaOnTheRoster = roster.agents.find((a: { handle: string }) => a.handle === 'alpha')
    expect(fields(alphaOnTheRoster)).toEqual(['createdAt', 'handle', 'id', 'kind', 'name', 'retired', 'role', 'startedBy', 'visitor'])

    const online = (await view('online')).json()
    expect(fields(online)).toEqual(['agents', 'interface', 'narrowedByPermission', 'view'])
    expect(online).toMatchObject({ interface: 'office-read/1', view: 'online' })
    expect(fields(online.agents.find((a: { id: string }) => a.id === alphaOnTheRoster.id))).toEqual(['id', 'online'])

    const talk = (await view('talk')).json()
    expect(fields(talk)).toEqual(['interface', 'last', 'leftOutGroups', 'messages', 'more', 'narrowedByPermission', 'refusal', 'subtraction', 'view', 'withdrawn'])
    expect(talk.messages.map((m: { id: string }) => m.id).filter((id: string) => SENT.includes(id)).sort()).toEqual([...SENT].sort())
    expect(fields(talk.messages[0])).toEqual(['at', 'from', 'id', 'project', 'to'])
    expect(fields(talk.withdrawn)).toEqual(['ids', 'last', 'leftOutGroups', 'more', 'subtraction'])
  })

  it('3. changes no table beyond what a plain GET of the office changes', async () => {
    // WHAT ANY REQUEST WRITES (the trace of the request, and the like) is measured on a read that writes nothing of its own.
    const plainBefore = hashOfEveryTable()
    expect((await app.inject({ method: 'GET', url: '/api/plugins', headers: AS_THE_PERSON })).statusCode).toBe(200)
    const anyRequestWrites = new Set(changedTables(plainBefore, hashOfEveryTable()))
    let newcomers = 0
    for (const name of PLUGIN_READ_VIEWS) {
      for (const headers of [AS_THE_PERSON, asAgent('alpha')]) {
        // A NEW AGENT BEFORE EACH READ, so a view that saved map seats would have a seat to save: the scene saves a
        // seat only for an agent that has none (src/server/lib/pixel-office.ts).
        const handle = `newcomer-${String(newcomers++)}`
        const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker', workArea: ['src'] } })
        expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
        const before = hashOfEveryTable()
        const reply = await view(name, headers)
        expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
        const changed = changedTables(before, hashOfEveryTable()).filter((table) => !anyRequestWrites.has(table))
        expect(changed, `GET /api/plugin-read/v1/${name} changed these tables`).toEqual([])
      }
    }
  })

  it('4. carries no key, nothing named or shaped like one, and no words of a message', async () => {
    for (const name of PLUGIN_READ_VIEWS) {
      for (const headers of [AS_THE_PERSON, asAgent('alpha')]) {
        const body = (await view(name, headers)).body
        const named = everyFieldName(JSON.parse(body)).filter(namedLikeAKey)
        expect(named, `${name} has fields named like a key`).toEqual([])
        expect(body, `${name} has a value shaped like a key`).not.toMatch(/[0-9a-fA-F]{64}/)
        for (const key of Object.values(keyOf)) expect(body.includes(key), `${name} carries an agent's key`).toBe(false)
        for (const words of WORDS) expect(body.includes(words), `${name} carries the words of a message`).toBe(false)
      }
    }
  })

  it('5. reads on from last, and answers 304 when nothing changed', async () => {
    const whole = (await view('talk')).json()
    expect(whole.more).toBe(false)
    // ONE MESSAGE AT A TIME, FROM THE START, READS EVERY MESSAGE ONCE AND IN ORDER.
    const oneByOne: string[] = []
    let after: string | null = null
    for (let step = 0; step < whole.messages.length + 2; step++) {
      const page: { messages: { id: string }[]; more: boolean; last: string | null; subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup[] } = (
        await view('talk', AS_THE_PERSON, `?limit=1${after === null ? '' : `&after=${encodeURIComponent(after)}`}`)
      ).json()
      oneByOne.push(...page.messages.map((m: { id: string }) => m.id))
      expect(page.more).toBe(oneByOne.length < whole.messages.length)
      // WHAT THE LIMIT LEFT OUT IS NAMED: every message not yet read, by id, and the counts add up.
      checkSubtraction('talk, one message at a time', page.subtraction, page.leftOutGroups)
      expect(page.leftOutGroups.flatMap((group) => group.ids ?? [])).toEqual(whole.messages.slice(oneByOne.length).map((m: { id: string }) => m.id))
      after = page.last
      if (!page.more) break
    }
    expect(oneByOne).toEqual(whole.messages.map((m: { id: string }) => m.id))
    const none = (await view('talk', AS_THE_PERSON, `?after=${encodeURIComponent(whole.last)}`)).json()
    expect(none).toMatchObject({ messages: [], last: whole.last, more: false })
    expect((await view('talk', AS_THE_PERSON, '?after=nonsense')).statusCode).toBe(400)
    for (const name of PLUGIN_READ_VIEWS) {
      const once = await view(name)
      const etag = once.headers['etag']
      expect(etag, `${name} has an ETag`).toBeTruthy()
      const again = await app.inject({ method: 'GET', url: `/api/plugin-read/v1/${name}${name === 'status' ? '?agents=' : ''}`, headers: { ...AS_THE_PERSON, 'if-none-match': String(etag) } })
      expect(again.statusCode, `${name} asked again with its ETag`).toBe(304)
    }
  })

  it('6. shows an agent only the messages it sent or was sent, and says why', async () => {
    const talk = (await view('talk', asAgent('alpha'))).json()
    expect(talk.messages.map((m: { id: string }) => m.id).filter((id: string) => SENT.includes(id)).sort()).toEqual(SENT.slice(0, 2).sort())
    expect(typeof talk.refusal).toBe('string')
  })

  it('7. says a run closed unchecked as closed unchecked, so a plugin need not read it as confirmed', async () => {
    // THE DETAIL OF A RUN CLOSED UNCHECKED IS 'completed', whose words are "Confirmed complete" (src/shared/pixel-office.ts),
    // and v1 keeps that value. The standing beside it is what tells the two apart. The closure is written straight into
    // this throwaway office's file, in the shape the closing door stores (readClosedUnchecked in src/shared/releasing.ts).
    // A RUN CLOSED UNCHECKED IS IN THE WORK VIEW WHILE ITS AGENT STILL HOLDS ITS HANDLE ON IT: a claim stops being live
    // when its run closes (src/server/lib/claims.ts), and a hold does not. So alpha holds its handle on the run first.
    const work = (await view('work')).json()
    const id = work.work.find((w: { title: string }) => w.title === 'Synthetic run for the plugin read test').id as string
    const held = await app.inject({ method: 'POST', url: '/api/handles/alpha/hold', headers: asAgent('alpha'), payload: { session: id, machine: 'a-synthetic-machine', runtime: 'codex' } })
    expect(held.statusCode, held.body.slice(0, 300)).toBe(201)
    const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
    const closedUnchecked = { by: { kind: 'person', id: THE_PERSON }, at: '2026-10-12 12:00:00', because: 'Synthetic: closed unchecked for the plugin read test.' }
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(row.data), closedUnchecked }), id)
    const after = (await view('work')).json()
    const run = after.work.find((w: { id: string }) => w.id === id)
    expect(run, JSON.stringify(after).slice(0, 500)).toBeDefined()
    expect(run).toMatchObject({ detail: 'completed', runStanding: 'closed unchecked' })
  })

  it('8. starts at the newest message with start=latest, and replays nothing before it', async () => {
    // THE NEWEST MESSAGE IN THE OFFICE IS ONE alpha MAY NOT READ: the person sends a message to beta, in a second after every
    // other message, because messages sent in one second are placed by id, and an id is drawn at random.
    const sentBefore = String((await view('talk')).json().last).split('~')[0]!
    while (localStamp(new Date()) <= sentBefore) await new Promise((resolve) => setTimeout(resolve, 50))
    await say(AS_THE_PERSON, 'Synthetic: the newest line, which alpha may not read', { kind: 'agent', id: idOf('beta') })
    const whole = (await view('talk')).json()
    expect(whole.messages.length, 'there is history that start=latest must not replay').toBeGreaterThan(0)
    const start = (await view('talk', AS_THE_PERSON, '?start=latest')).json()
    expect(start).toMatchObject({ messages: [], last: whole.last, more: false })
    // THE ANSWER IS THE ONE `after` AT THE NEWEST MESSAGE GIVES, so its counts are of the messages after that.
    expect(start.subtraction).toEqual({ candidates: 0, carried: 0, leftOut: 0, shortened: 0 })
    checkSubtraction('talk from the newest message', start.subtraction, start.leftOutGroups)
    expect(start.withdrawn).toEqual(noneNamed(whole.withdrawn.last))

    // AN AGENT STARTS AT THE NEWEST MESSAGE IT MAY READ, which is not the newest in the office.
    const alphaWhole = (await view('talk', asAgent('alpha'))).json()
    const alphaStart = (await view('talk', asAgent('alpha'), '?start=latest')).json()
    expect(alphaStart).toMatchObject({ messages: [], last: alphaWhole.last, more: false })
    expect(alphaStart.last).not.toBe(whole.last)

    // WHAT IS SENT AFTER THE START IS READ ON FROM IT, AND ONLY THAT. A place is to the second, so a message sent in the
    // second of the newest one, with an id that sorts before it, would not be read on from that place: the message is
    // sent in a later second, so this case holds the start and not that.
    const newestSecond = String(whole.last).split('~')[0]!
    while (localStamp(new Date()) <= newestSecond) await new Promise((resolve) => setTimeout(resolve, 50))
    const later = await say(asAgent('beta'), 'Synthetic: a line sent after the start', { kind: 'agent', id: idOf('alpha') })
    const next = (await view('talk', AS_THE_PERSON, `?after=${encodeURIComponent(start.last)}`)).json()
    expect(next.messages.map((m: { id: string }) => m.id)).toEqual([later])

    // start=latest IS THE ONLY START, AND IT IS GIVEN ALONE.
    expect((await view('talk', AS_THE_PERSON, '?start=oldest')).statusCode).toBe(400)
    expect((await view('talk', AS_THE_PERSON, `?start=latest&after=${encodeURIComponent(whole.last)}`)).statusCode).toBe(400)
    expect((await view('talk', AS_THE_PERSON, `?start=latest&withdrawnAfter=${String(whole.withdrawn.last)}`)).statusCode).toBe(400)
  })

  it('9. names a message withdrawn since withdrawnAfter to those who could read it, and only while it stays withdrawn', async () => {
    type Talk = { messages: { id: string }[]; withdrawn: { ids: string[]; last: string; more: boolean; subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup[] } }
    const talk = async (headers: Record<string, string>, query = ''): Promise<Talk> => (await view('talk', headers, query)).json() as Talk
    const beta = asAgent('beta')

    // WITHOUT withdrawnAfter NOTHING IS NAMED, and `last` is where to begin.
    const before = await talk(AS_THE_PERSON)
    expect(before.withdrawn).toEqual(noneNamed(before.withdrawn.last))
    expect(before.withdrawn.last).toMatch(/^\d+$/u)
    expect(before.messages.map((m) => m.id)).toEqual(expect.arrayContaining([SENT[0], SENT[2]]))
    const mark = { person: before.withdrawn.last, alpha: (await talk(asAgent('alpha'))).withdrawn.last, beta: (await talk(beta)).withdrawn.last }
    const tag = String((await view('talk')).headers['etag'])

    // THE PERSON WITHDRAWS THEIR MESSAGE TO beta, WHICH alpha MAY NOT READ, AND alpha WITHDRAWS ITS MESSAGE TO beta.
    for (const [id, headers] of [[SENT[2]!, AS_THE_PERSON], [SENT[0]!, asAgent('alpha')]] as const) {
      const gone = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: noBody(headers) })
      expect(gone.statusCode, gone.body.slice(0, 300)).toBe(200)
    }
    const person = await talk(AS_THE_PERSON, `?withdrawnAfter=${mark.person}`)
    expect(person.withdrawn).toMatchObject({ ids: [SENT[2], SENT[0]], more: false })
    // THE WITHDRAWALS CARRY THEIR OWN COUNTS, as the messages do: the ones after withdrawnAfter, and none left out.
    expect(person.withdrawn.subtraction).toEqual({ candidates: 2, carried: 2, leftOut: 0, shortened: 0 })
    checkSubtraction('the withdrawals named to the person', person.withdrawn.subtraction, person.withdrawn.leftOutGroups)
    expect(person.messages.map((m) => m.id)).not.toContain(SENT[0])
    expect(person.messages.map((m) => m.id)).not.toContain(SENT[2])
    expect((await talk(beta, `?withdrawnAfter=${mark.beta}`)).withdrawn.ids, 'beta was sent both').toEqual([SENT[2], SENT[0]])
    expect((await talk(asAgent('alpha'), `?withdrawnAfter=${mark.alpha}`)).withdrawn.ids, 'alpha may read only its own').toEqual([SENT[0]])

    // READ ON FROM `last`, NOTHING MORE IS NAMED; AND ONE AT A TIME, EACH IS NAMED ONCE.
    expect((await talk(AS_THE_PERSON, `?withdrawnAfter=${person.withdrawn.last}`)).withdrawn).toEqual(noneNamed(person.withdrawn.last))
    const first = await talk(AS_THE_PERSON, `?withdrawnAfter=${mark.person}&limit=1`)
    // THE LIMIT LEAVES ONE OUT, AND THE ANSWER NAMES IT BY ID, as it names the messages it leaves out.
    expect(first.withdrawn).toMatchObject({
      ids: [SENT[2]], more: true,
      subtraction: { candidates: 2, carried: 1, leftOut: 1, shortened: 0 },
      leftOutGroups: [{ cause: 'budget', bucket: 'withdrawal_limit', count: 1, ids: [SENT[0]] }],
    })
    checkSubtraction('the withdrawals one at a time', first.withdrawn.subtraction, first.withdrawn.leftOutGroups)
    const second = await talk(AS_THE_PERSON, `?withdrawnAfter=${first.withdrawn.last}&limit=1`)
    expect(second.withdrawn).toEqual({
      ids: [SENT[0]], last: person.withdrawn.last, more: false,
      subtraction: { candidates: 1, carried: 1, leftOut: 0, shortened: 0 },
      leftOutGroups: [{ cause: 'budget', bucket: 'withdrawal_limit', count: 0, ids: [] }],
    })

    // A WITHDRAWAL CHANGES THE VIEW, so a plugin asking with the tag it held is answered in full, not with 304.
    const asked = await app.inject({ method: 'GET', url: '/api/plugin-read/v1/talk', headers: { ...AS_THE_PERSON, 'if-none-match': tag } })
    expect(asked.statusCode).toBe(200)
    // WITHOUT withdrawnAfter NONE IS NAMED AFTER A WITHDRAWAL EITHER, and start=latest replays none: a first read is told
    // only where to begin.
    expect(asked.json().withdrawn, 'a read without withdrawnAfter').toEqual(noneNamed(person.withdrawn.last))
    expect((await talk(AS_THE_PERSON, '?start=latest')).withdrawn, 'a read from start=latest').toEqual(noneNamed(person.withdrawn.last))

    // A MESSAGE RESTORED IS NOT WITHDRAWN, SO IT IS NOT NAMED.
    const back = await app.inject({ method: 'POST', url: `/api/records/${SENT[0]!}/restore`, headers: noBody(asAgent('alpha')) })
    expect(back.statusCode, back.body.slice(0, 300)).toBe(200)
    expect((await talk(AS_THE_PERSON, `?withdrawnAfter=${mark.person}`)).withdrawn.ids).toEqual([SENT[2]])

    expect((await view('talk', AS_THE_PERSON, '?withdrawnAfter=nonsense')).statusCode).toBe(400)
  })

  it("10. names a withdrawn message whose origin is stored as 'Authored', as it draws the message while it is live", async () => {
    type Talk = { messages: { id: string }[]; withdrawn: { ids: string[]; last: string } }
    const talk = async (query = ''): Promise<Talk> => (await view('talk', AS_THE_PERSON, query)).json() as Talk
    // THE ORIGIN IS WRITTEN HERE BY HAND, because every door stores `authored`. A row written by hand, or by an older
    // office, may say 'Authored', and readOrigin reads that as authored.
    // NOTHING HOLDS beta IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The message is
    // stored all the same, and the talk draws it.
    const id = await say(asAgent('alpha'), WORDS[3]!, { kind: 'agent', id: idOf('beta') }, 409)
    t.client.sqlite.prepare("UPDATE records SET origin = 'Authored' WHERE id = ?").run(id)
    const live = await talk()
    expect(live.messages.map((m) => m.id), 'the message is drawn while it is live').toContain(id)

    const gone = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: noBody(asAgent('alpha')) })
    expect(gone.statusCode, gone.body.slice(0, 300)).toBe(200)
    const after = await talk(`?withdrawnAfter=${live.withdrawn.last}`)
    expect(after.messages.map((m) => m.id)).not.toContain(id)
    expect(after.withdrawn.ids, 'the message is named once it is withdrawn').toEqual([id])
  })
})
