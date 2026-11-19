// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A message reads only the agents on its ownership chain. The sweep still reads the full registry once.
 * The routes cover IDs, handles, ambiguous names, retired agents, cycles, missing owners and reachable owners.
 * The full-registry and narrow readers must agree, while the test checks each expected destination separately.
 */
import { readFileSync } from 'node:fs'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const at = localStamp(new Date())
const inMinutes = (minutes: number): string => localStamp(new Date(Date.now() + minutes * 60_000))

/** The statement that reads the rows one stored string can name, as src/server/lib/participants.ts writes it. */
const THE_ROWS_A_STRING_NAMES = 'SELECT id, handle, started_by_kind, started_by_id FROM agents WHERE id = ? OR handle = ?'
/** The statement `listParticipants` reads every agent row with. */
const EVERY_AGENT = 'SELECT * FROM agents ORDER BY handle, rowid'

let t: TestDb
let app: FastifyInstance
let superiors: typeof import('../src/server/lib/superiors.ts')
let roles: typeof import('../src/server/lib/roles.ts')
/** True while a counted call runs. Meanwhile every value a statement gives back is kept, and every statement run. */
let recording = false
const gaveBack = new Map<unknown, string>()
const ran: { text: string; args: unknown[] }[] = []

const TOP = 'made-up-top'
const TOP_HANDLE = 'made-up-top-handle'
const WAITER = 'made-up-waiter'
const SECRETARY = 'made-up-secretary'
const SHARED = 'made-up-shared-string'
const RETIRED = 'made-up-retired'
const BY_ID = 'made-up-by-id'
const FILLERS = Array.from({ length: 30 }, (_, i) => `made-up-filler-${String(i + 1).padStart(2, '0')}`)

/** The addressees, each with what makes its chain the case it is. */
const ADDRESSEES: readonly { id: string; is: string }[] = [
  { id: BY_ID, is: 'a starter stored by its id' },
  { id: 'made-up-by-handle', is: 'a starter stored by its handle' },
  { id: 'made-up-by-a-shared-handle', is: 'a handle two agents have, one of them retired' },
  { id: 'made-up-by-an-id-and-a-handle', is: "a string that is one agent's id and another agent's handle" },
  { id: 'made-up-through-a-retired', is: 'a chain through a retired agent' },
  { id: 'made-up-in-a-loop', is: 'a loop' },
  { id: 'made-up-unstarted', is: 'no starter' },
  { id: 'made-up-by-nothing', is: 'a starter nothing has as its id or handle' },
  { id: 'made-up-under-a-secretary', is: 'a chain that reaches a secretary' },
  { id: 'made-up-second-secretary', is: 'a secretary addressee' },
  { id: 'made-up-by-an-unknown-kind', is: 'a starter of a kind this build does not know' },
  { id: 'made-up-under-the-waiter', is: 'a starter that can be reached' },
  { id: 'made-up-two-up', is: 'a chain two agents long' },
  { id: 'made-up-retired-addressee', is: 'a retired addressee' },
]

/** Expected recipient, passed owners and outcome for the ownership walk. */
const EXPECTED: Record<string, { to: string | null; passedOver: string[]; ending: string; stoppedAt?: string }> = {
  'a starter stored by its id': { to: TOP, passedOver: [], ending: 'reached' },
  'a starter stored by its handle': { to: TOP, passedOver: [], ending: 'reached' },
  'a handle two agents have, one of them retired': { to: null, passedOver: [], ending: 'broken', stoppedAt: 'made-up-by-a-shared-handle' },
  "a string that is one agent's id and another agent's handle": { to: SHARED, passedOver: [], ending: 'reached' },
  'a chain through a retired agent': { to: WAITER, passedOver: [RETIRED], ending: 'reached' },
  'a loop': { to: null, passedOver: ['made-up-loop-1', 'made-up-loop-2'], ending: 'broken', stoppedAt: 'made-up-loop-2' },
  'no starter': { to: null, passedOver: [], ending: 'ownerless' },
  'a starter nothing has as its id or handle': { to: null, passedOver: [], ending: 'broken', stoppedAt: 'made-up-by-nothing' },
  'a chain that reaches a secretary': { to: TOP, passedOver: [SECRETARY], ending: 'reached' },
  'a secretary addressee': { to: TOP, passedOver: [], ending: 'reached' },
  'a starter of a kind this build does not know': { to: null, passedOver: [], ending: 'ownerless' },
  'a starter that can be reached': { to: WAITER, passedOver: [], ending: 'reached' },
  'a chain two agents long': { to: TOP, passedOver: [BY_ID], ending: 'reached' },
  'a retired addressee': { to: TOP, passedOver: [], ending: 'reached' },
}

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE RECORDER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    for (const method of ['all', 'get', 'iterate'] as const) {
      const run = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof run !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const answer = run.apply(this, args)
        if (!recording) return answer
        const said = text.replace(/\s+/g, ' ').trim()
        ran.push({ text: said, args })
        if (method === 'iterate') return keepingEach(answer as Iterable<unknown>, said)
        for (const row of method === 'all' ? (answer as unknown[]) : [answer]) keepTheValuesOf(row, said)
        return answer
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  superiors = await import('../src/server/lib/superiors.ts')
  roles = await import('../src/server/lib/roles.ts')
  expect(roles.theRoleCardsAreRead(), 'the role cards are read, so a secretary can be one').toBe(true)
  const card = theSecretaryCard()

  const person = { kind: 'person', id: THE_PERSON }
  const agent = (id: string) => ({ kind: 'agent', id })
  anAgent(TOP, TOP_HANDLE, person, { role: card })
  aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: TOP, deliveringMessage: 'made-up-answered-message', providerSession: 'made-up-conversation', waitsUntil: inMinutes(30) })
  anAgent(WAITER, WAITER, person)
  aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: WAITER, deliveringMessage: 'made-up-answered-message', providerSession: 'made-up-conversation', waitsUntil: inMinutes(30) })
  anAgent(SECRETARY, SECRETARY, agent(TOP), { role: card })
  anAgent('made-up-second-secretary', 'made-up-second-secretary', agent(TOP), { role: card })
  // THE STRING THAT IS AN ID AND A HANDLE. The id answers it; the agent with it as a handle is under a secretary, so an
  // answer by handle would end the walk somewhere else.
  anAgent(SHARED, 'made-up-x', person)
  aSession({ state: 'finished', runtime: 'claude-code', servingAgentId: SHARED, deliveringMessage: 'made-up-answered-message', providerSession: 'made-up-conversation', waitsUntil: inMinutes(30) })
  anAgent('made-up-y', SHARED, agent(SECRETARY))
  // ONE HANDLE, TWO AGENTS: one retired, as the index on live handles allows. Each has a starter, so picking either ends
  // the walk somewhere other than where nobody answering ends it.
  anAgent('made-up-twice-old', 'made-up-twice', agent(TOP), { retired: 1 })
  anAgent('made-up-twice-new', 'made-up-twice', agent(WAITER))
  anAgent(RETIRED, RETIRED, agent(WAITER), { retired: 1 })
  anAgent('made-up-loop-1', 'made-up-loop-1', agent('made-up-loop-2'))
  anAgent('made-up-loop-2', 'made-up-loop-2', agent('made-up-loop-1'))

  anAgent(BY_ID, BY_ID, agent(TOP))
  anAgent('made-up-by-handle', 'made-up-by-handle', agent(TOP_HANDLE))
  anAgent('made-up-by-a-shared-handle', 'made-up-by-a-shared-handle', agent('made-up-twice'))
  anAgent('made-up-by-an-id-and-a-handle', 'made-up-by-an-id-and-a-handle', agent(SHARED))
  anAgent('made-up-through-a-retired', 'made-up-through-a-retired', agent(RETIRED))
  anAgent('made-up-in-a-loop', 'made-up-in-a-loop', agent('made-up-loop-1'))
  anAgent('made-up-unstarted', 'made-up-unstarted', null)
  anAgent('made-up-by-nothing', 'made-up-by-nothing', agent('made-up-nothing-has-this-name'))
  anAgent('made-up-under-a-secretary', 'made-up-under-a-secretary', agent(SECRETARY))
  anAgent('made-up-by-an-unknown-kind', 'made-up-by-an-unknown-kind', { kind: 'made-up-kind', id: TOP })
  anAgent('made-up-under-the-waiter', 'made-up-under-the-waiter', agent(WAITER))
  anAgent('made-up-two-up', 'made-up-two-up', agent(BY_ID))
  anAgent('made-up-retired-addressee', 'made-up-retired-addressee', agent(TOP), { retired: 1 })

  // THE AGENTS NO CHAIN NAMES. The first has the top agent's handle in upper case; a few are retired.
  FILLERS.forEach((id, i) => anAgent(id, i === 0 ? TOP_HANDLE.toUpperCase() : `${id}-handle`, person, { retired: i % 7 === 3 ? 1 : 0 }))
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function theSecretaryCard(): string {
  return (JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
}

/** One registry row and its avatar, written at the table as tests/a-message-to-an-agent-is-stored-by-its-id.test.ts writes one. */
function anAgent(id: string, handle: string, startedBy: { kind: string; id: string } | null, more: { retired?: number; role?: string } = {}): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
    )
    .run(`avatar-default-agent-${id}`, at)
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at, started_by_kind, started_by_id, role) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, handle, handle, `avatar-default-agent-${id}`, more.retired ?? 0, more.retired === 1 ? at : null, at, startedBy?.kind ?? null, startedBy?.id ?? null, more.role ?? null)
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, startedBy?.kind === 'agent' ? startedBy.id : null, id, 'id')
  }
}

/** A session record of this file's own. */
function aSession(data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'A made-up session', data, actor: t.api.HUMAN }).id
}

/** Keep each value of one row, with the first statement that gave it back, for a failure's message. */
function keepTheValuesOf(row: unknown, text: string): void {
  const values = Array.isArray(row) ? row : typeof row === 'object' && row !== null ? Object.values(row) : [row]
  for (const value of values) if (!gaveBack.has(value)) gaveBack.set(value, text.slice(0, 200))
}

function* keepingEach(rows: Iterable<unknown>, text: string): Generator<unknown> {
  for (const row of rows) {
    keepTheValuesOf(row, text)
    yield row
  }
}

/** Run one call with the recorder on, from nothing kept. */
function counted<T>(call: () => T): T {
  gaveBack.clear()
  ran.length = 0
  recording = true
  try {
    return call()
  } finally {
    recording = false
  }
}

/** The agents no chain names whose ids a statement gave back, each with that statement. */
function theFillersRead(): string[] {
  return FILLERS.filter((id) => gaveBack.has(id)).map((id) => `${id} from ${gaveBack.get(id) ?? ''}`)
}

type Route = ReturnType<typeof superiors.theRoutingOfOneAddressee>

/** Summarise the route using the product's own words for each ending. */
function inShort(route: Route, word: typeof import('../src/shared/i18n.ts').t): unknown {
  const said = route.said
  const end = said?.ending
  const values = {
    addressee: said?.addressee ?? '',
    reached: end && 'reached' in end ? end.reached : '',
    stoppedAt: end && 'stoppedAt' in end ? end.stoppedAt : '',
  }
  const options = [
    ['chatEnglish.routed.ending.ownerReached', 'reached'],
    ['chatEnglish.routed.ending.ownerWaiting', 'waiting'],
    ['chatEnglish.routed.ending.ownerless', 'ownerless'],
    ['chatEnglish.routed.ending.ownerBroken', 'broken'],
    ['chatEnglish.routed.ending.ownerSender', 'sender'],
  ] as const
  const ending = options.find(([key]) => route.line.endsWith(word(key, values)))?.[1] ?? 'other'
  return {
    to: route.to?.id ?? null,
    passedOver: route.passedOver.map((one) => one.who.id),
    ending,
    ...(ending === 'broken' ? { stoppedAt: values.stoppedAt } : {}),
  }
}

const SENDERS: readonly { name: string; who: ParticipantRef | null }[] = [
  { name: 'the person', who: null },
  { name: 'the waiter', who: { kind: 'agent', id: WAITER } },
  { name: 'nobody', who: null },
]

/** The sender a case names; the person's ref is read once the office is made. */
const senderOf = (name: string, who: ParticipantRef | null): ParticipantRef | null => (name === 'the person' ? { kind: 'person', id: THE_PERSON } : who)

describe('the route of a message reads only the agents its chain of owners names', () => {
  it('1 and 2. routes each addressee through owners and reads no agent off its chain', async () => {
    const { t: word } = await import('../src/shared/i18n.ts')
    const answers: Record<string, unknown> = {}
    const expected: Record<string, unknown> = {}
    const offTheChain: string[] = []
    for (const { id, is } of ADDRESSEES) {
      const addressee: ParticipantRef = { kind: 'agent', id }
      const sweep = superiors.theReadingsForOneSend(PROJECT)
      const reach = sweep.reachOf(id)
      expect(reach, `${is}: the addressee cannot be reached`).not.toBeNull()
      expect(reach!.was, is).not.toBe('could not tell')
      const cannot = reach as NonNullable<typeof reach> & { was: Exclude<NonNullable<typeof reach>['was'], 'could not tell'> }
      for (const { name, who } of SENDERS) {
        const sender = senderOf(name, who)
        const before = superiors.theRoutingOfOneAddressee(addressee, cannot, sender, sweep)
        // A NEW MESSAGE'S READINGS FOR EACH ROUTE, with the addressee's reach already read, so what is counted is the walk.
        const message = superiors.theReadingsForOneMessage(PROJECT)
        expect(message.reachOf(id), is).toEqual(reach)
        const after = counted(() => superiors.theRoutingOfOneAddressee(addressee, cannot, sender, message))
        offTheChain.push(...theFillersRead().map((read) => `${is}, sent by ${name}: ${read}`))
        expect(after, `${is}, sent by ${name}`).toEqual(before)
        answers[`${is}, sent by ${name}`] = inShort(after, word)
        const target = EXPECTED[is]!
        expected[`${is}, sent by ${name}`] = name === 'the waiter' && target.to === WAITER
          ? { ...target, to: null, ending: 'sender' }
          : target
      }
    }
    expect(offTheChain, 'the agents no chain names that a route read').toEqual([])
    expect(answers).toEqual(expected)
  })

  it('3. a message to three agents reads each stored string once and no agent off their chains', () => {
    const to = [BY_ID, 'made-up-by-handle', 'made-up-two-up']
    const sweep = superiors.theReadingsForOneSend(PROJECT)
    const asItWas = to.map((id) => {
      const reach = sweep.reachOf(id)
      expect(reach?.was, id).toBe('nothing answering')
      return superiors.theRoutingOfOneAddressee({ kind: 'agent', id }, reach as NonNullable<typeof reach> & { was: 'nothing answering' }, { kind: 'person', id: THE_PERSON }, sweep)
    })
    const stored = counted(
      () =>
        t.api.createRecord({
          workspaceId: PROJECT,
          kind: 'message',
          title: 'A made-up question',
          data: { body: 'A made-up question.', to: to.map((id) => ({ kind: 'agent', id })) },
          actor: t.api.HUMAN,
        }).id,
    )
    // THE ROUTE READS NO AGENT OFF THE CHAINS. The message is a person's send to three agents nothing holds, so the
    // 409's reason also names the secretary card holders; it finds them through the narrow `theSecretaries` read, and
    // reads each of those rows for its name. No filler here is a secretary, so no filler is read.
    expect(theFillersRead(), 'the agents no chain names that the message read').toEqual([])
    const strings = ran.filter((one) => one.text === THE_ROWS_A_STRING_NAMES).map((one) => String(one.args[0]))
    // THREE STRINGS: the top agent's id and its handle, and the id of the agent two-up's chain passes first.
    expect(strings.sort(), 'the stored strings read, each once').toEqual([BY_ID, TOP, TOP_HANDLE].sort())
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(stored) as { data: string }).data) as Record<string, unknown>
    expect(data['routed'], 'the routing the message stored').toEqual(JSON.parse(JSON.stringify(asItWas)))
  })

  it('4. the guard: the readings the sweep uses read every agent once for two routes, and the recorder sees them', () => {
    const sweep = superiors.theReadingsForOneSend(PROJECT)
    for (const id of [BY_ID, 'made-up-by-handle']) {
      const reach = sweep.reachOf(id) as NonNullable<ReturnType<typeof sweep.reachOf>> & { was: 'nothing answering' }
      expect(reach?.was, id).toBe('nothing answering')
    }
    counted(() => {
      for (const id of [BY_ID, 'made-up-by-handle']) {
        superiors.theRoutingOfOneAddressee({ kind: 'agent', id }, sweep.reachOf(id) as NonNullable<ReturnType<typeof sweep.reachOf>> & { was: 'nothing answering' }, null, sweep)
      }
    })
    expect(ran.filter((one) => one.text === EVERY_AGENT).length, 'the reads of every agent for two routes').toBe(1)
    expect(ran.filter((one) => one.text === THE_ROWS_A_STRING_NAMES).length, 'the reads of the rows one string names').toBe(0)
    expect(theFillersRead().length, 'the agents no chain names that the sweep read').toBe(FILLERS.length)
  })
})
