// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OVERLAP INSIDE ONE STARTER CHAIN OPENS NO GROUP, AND "ABOVE" FOLLOWS THE CARD — P100.
 *
 * In a message, recorded as a decision on problem `Zf1M163BAOdk`:
 * 「问题 Zf1M163BAOdk：同意A+B都做」. Eight overlap groups opened in robotics
 * in one hour, each because a new agent's area under projects/CFC overlapped an agent's, each adding the coordinator
 * as a member "It is above [that agent]" by the starter chain that agent had outgrown when it was made a
 * secretary. This file measures the two halves of the repair, by driving the real registration,
 * claim and work-area doors in one test world.
 *
 *   A. Where the group logic adds "the one above" a member, it reads who the member reports to NOW,
 *      from the card it holds. A secretary's card reports to the person, so nobody is added above a
 *      secretary — even where its own starter still exists, which is the exact defect.
 *   B. An overlap between an agent and one in its own starter chain opens no group and nothing is
 *      said, for a work area and for a claim. Two agents in different chains still open a group.
 *   C. A work-area group that B would no longer open is marked with the office's one existing line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, BY THE DOOR EACH THING REALLY HAPPENS AT
 * ---------------------------------------------------------------------------------------
 *
 *   (a) a secretary's area overlapping its own subordinate's opens no group, and two agents of one
 *       chain claiming the same record open none either;
 *   (b) two agents in different chains still open a group, and each "above" member is the one its
 *       own card names;
 *   (c) a secretary whose starter is still registered gets nobody above it, because its card
 *       reports to the person;
 *   (d) a worker under a supervisor under a secretary: the supervisor is above the worker, the
 *       secretary above the supervisor, and nobody above the secretary;
 *   (e) the marking line, written once into a group B would not open, and not a second time;
 *   (f) where several agents hold the secretary card, the secretary above a supervisor is the one in
 *       its own chain, and a supervisor the person started gets nobody, because none can be named.
 *   (g) changing the words record changes the displayed reports-to sentence, while the declared
 *       card still decides which agent is added above the holder.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN, WITH THE REASON WRITTEN BESIDE EACH
 * ---------------------------------------------------------------------------------------
 *
 *   · revert A in src/server/lib/claims.ts — read the starter chain in `theOneAbove` instead of the
 *     card — and (c) goes red, because the starter is added above the secretary again. (b) also reads the
 *     two above members from the cards, so making `theOneAbove` answer null turns it red.
 *   · take the one-chain `continue` out of `openTheGroupsForAWorkArea` and the filter out of
 *     `overlapsIn` in the same file — revert B — and (a) goes red on both halves.
 *   · make `markTheWorkAreaGroupsInsideOneChain` write nothing — revert C — and (e) goes red.
 *   · make `theSecretaryInTheChainOf` answer null — so "the secretary" falls back to the first row
 *     that holds the card — and (f) goes red on both halves.
 *
 *   · read `theCardInTheOfficesWords(cardFor(theRoleCards(), agent.role))` in `theOneAbove`
 *     instead of the declared card — (g) goes red; the other cases stay green.
 *
 * The original mutations restored claims.ts and groups.ts byte-identical, checked by sha256.
 * The words-record mutation restores claims.ts with `git checkout` and checks its diff is empty.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice, type ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_OVERLAP_ENDED_PREFIX } from '../src/shared/groups.ts'
import { overlapKey } from '../src/shared/claims.ts'

/**
 * THE TWO SERVER MODULES ARE IMPORTED AFTER `freshDb()`, because both reach `src/server/db/client.ts`
 * at import and a static import would open the operator's own database before the test names one.
 */
type ClaimsLib = typeof import('../src/server/lib/claims.ts')
type GroupsLib = typeof import('../src/server/lib/groups.ts')
let claims: ClaimsLib
let team: GroupsLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance

interface Said {
  status: number
  said: Record<string, unknown>
}

async function ask(
  method: 'POST' | 'GET' | 'PATCH',
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Said> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> | undefined })
  let said: Record<string, unknown> = {}
  try {
    said = reply.json() as Record<string, unknown>
  } catch {
    said = { text: reply.body }
  }
  return { status: reply.statusCode, said }
}

/** Register an agent and insist the door wrote it. */
async function register(
  handle: string,
  role: string,
  workArea: string[] | undefined,
  by: Record<string, string>,
): Promise<void> {
  const body: Record<string, unknown> = { handle, name: handle, runtime: 'claude-code' }
  if (role !== '') body.role = role
  if (workArea !== undefined) body.workArea = workArea
  const answer = await ask('POST', '/api/agents/started', by, body)
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

/** A task record nothing else names, so a claim on it cannot collide by accident. */
function aTask(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title,
    actor: { type: 'human', id: THE_PERSON },
    data: {},
  }).id
}

/** A running session record for one agent. */
function aRun(handle: string, title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    actor: { type: 'agent', id: handle },
    data: { state: 'running', runtime: 'claude-code' },
  }).id
}

/** File a claim as the agent, and hand back the groups it opened. */
async function claim(handle: string, recordId: string): Promise<string[]> {
  const answer = await ask('POST', '/api/claims', asAgent(handle), {
    run: aRun(handle, `${handle} on ${recordId}`),
    things: [{ what: 'record', id: recordId }],
  })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
  return (answer.said['groupsOpened'] as string[] | undefined) ?? []
}

/** Widen an agent's work area through the door, as the agent that may. */
async function widen(handle: string, area: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('POST', `/api/participants/agent/${handle}/work-area`, by, {
    workArea: area,
    because: 'A test widened it to make the overlap the decision is about.',
  })
  expect(answer.status, `widen ${handle}: ${JSON.stringify(answer.said)}`).toBe(200)
}

interface HeldGroup {
  id: string
  name: string
  members: { who: ParticipantRef; because: string }[]
}

/** The group opened for one work-area pair, read straight off the rows it was written to. */
function workAreaGroup(first: string, second: string): HeldGroup | null {
  const row = t.client.sqlite
    .prepare('SELECT id, name FROM groups WHERE about = ?')
    .get(claims.workAreaOverlapKey(first, second)) as { id: string; name: string } | undefined
  if (row === undefined) return null
  const rows = t.client.sqlite
    .prepare('SELECT member_kind, member_id, joined_because FROM group_members WHERE group_id = ? AND left_at IS NULL')
    .all(row.id) as { member_kind: string; member_id: string; joined_because: string }[]
  return {
    id: row.id,
    name: row.name,
    members: rows.map((one) => ({
      who: { kind: one.member_kind as ParticipantRef['kind'], id: one.member_id },
      because: one.joined_because,
    })),
  }
}

/** One member of a group by handle, or null. */
function member(group: HeldGroup | null, handle: string): { who: ParticipantRef; because: string } | null {
  return group?.members.find((one) => participantKey(one.who) === participantKey({ kind: 'agent', id: idOf(handle) })) ?? null
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

// ======================================================================== the world

beforeAll(async () => {
  t = await freshDb()
  claims = await import('../src/server/lib/claims.ts')
  team = await import('../src/server/lib/groups.ts')
  app = (await apiApp()).app
  await app.ready()

  // THE STARTER IS A REAL AGENT ABOVE THE SECRETARY'S STARTER CHAIN, which is the defect: it started the
  // agent that becomes the secretary, so the old reading kept adding that starter above it for ever.
  await register(THE_TEST_OFFICES_SECRETARY.handle, 'supervisor', [`src/${THE_TEST_OFFICES_SECRETARY.handle}`], AS_THE_PERSON)
  await register('sec', 'supervisor', ['src/sec'], asAgent(THE_TEST_OFFICES_SECRETARY.handle))
  // AND THE CARD CHANGES TO SECRETARY. The area stays, because an area stored before the rule keeps
  // working; the card is what decides who is above it from now on.
  const appointed = await ask('POST', '/api/roles/card/sec', AS_THE_PERSON, { role: 'secretary' })
  expect(appointed.status, JSON.stringify(appointed.said)).toBe(201)

  // THE CHAIN sec -> sup-s -> work-s, all with areas inside one another. Used for (a), (d) and (e).
  await register('sup-s', 'supervisor', ['src/s'], asAgent('sec'))
  await register('work-s', 'worker', ['src/s/deep'], asAgent('sup-s'))

  // TWO INDEPENDENT CHAINS at the person, so an overlap with them is a real collision. Used for (b)
  // and (c).
  await register('sup-x', 'supervisor', ['src/x'], asAgent('sec'))
  await register('work-x', 'worker', ['src/x/deep'], asAgent('sup-x'))
  await register('sup-y', 'supervisor', ['src/y'], asAgent('sec'))
  await register('work-y', 'worker', ['src/y/deep'], asAgent('sup-y'))
  await register('sup-q', 'supervisor', ['src/q'], AS_THE_PERSON)

  // THE CLAIMS THAT MAKE "AT WORK" TRUE. Written before the overlapping registration, so the
  // registration is what opens the group.
  await claim('work-x', aTask('the work X holds'))
  await claim('work-s', aTask('the work S holds'))
  await claim('sup-s', aTask('the work the supervisor holds'))
  await claim('sec', aTask('the work the secretary holds'))

  // (b) A DIFFERENT CHAIN, WIDENED OVER work-x's AREA. This one group is the control that B did not
  // silence everything.
  await widen('work-y', ['src/x'], asAgent('sup-y'))

  // (a) A REGISTRATION INSIDE sec's OWN CHAIN, over sec's own area. Same chain, so no group.
  await register('same-sup', 'supervisor', ['src/sec'], asAgent('sec'))
  await register('same-work', 'worker', ['src/sec'], asAgent('same-sup'))

  // (c) A DIFFERENT CHAIN OVER sec's AREA. sec is the secretary, so nobody is added above it.
  await register('work-q', 'worker', ['src/sec'], asAgent('sup-q'))

  // (d) ONE LEVEL UP EACH TIME. work-r is over work-s's area, so sup-s is above work-s. work-t is over
  // sup-s's area, so sec is above sup-s and nobody is above sec.
  await register('sup-r', 'supervisor', ['src/r'], AS_THE_PERSON)
  await register('work-r', 'worker', ['src/s/deep'], asAgent('sup-r'))
  await register('sup-t', 'supervisor', ['src/t'], AS_THE_PERSON)
  await register('work-t', 'worker', ['src/s'], asAgent('sup-t'))

  // (f) A SECOND SECRETARY, AND A CHAIN UNDER IT. Three agents hold the secretary card on the owner's office
  // on 15 September 2026, so "the secretary" a supervisor's card names must be the one in the
  // holder's own starter chain and not the first row that holds the card, which was the same agent every
  // time. sup-z is started by sec2 and overlapped from another chain; sup-q was started by the
  // person and has no secretary in its chain, so with several secretaries nobody can be named.
  await register('sec2', 'supervisor', ['src/two'], AS_THE_PERSON)
  const second = await ask('POST', '/api/roles/card/sec2', AS_THE_PERSON, { role: 'secretary' })
  expect(second.status, JSON.stringify(second.said)).toBe(201)
  await register('sup-z', 'supervisor', ['src/z'], asAgent('sec2'))
  await claim('sup-z', aTask('the work Z holds'))
  await register('sup-u', 'supervisor', ['src/u'], AS_THE_PERSON)
  await register('work-u', 'worker', ['src/z'], asAgent('sup-u'))
  await claim('sup-q', aTask('the work Q holds'))
  await register('sup-v', 'supervisor', ['src/v'], AS_THE_PERSON)
  await register('work-v', 'worker', ['src/q'], asAgent('sup-v'))
}, 300_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ======================================================================== (a) one chain

describe('an overlap inside one starter chain opens no group and says nothing', () => {
  it('opens no group when a secretary\u2019s own subordinate registers over its area', () => {
    // sec -> sup-s -> work-s is one chain, and sec -> same-sup -> same-work is another arm of it.
    for (const [first, second] of [
      ['sec', 'same-sup'],
      ['sec', 'same-work'],
      ['same-sup', 'same-work'],
    ] as const) {
      expect(workAreaGroup(first, second), `a group was opened for ${first} and ${second}`).toBeNull()
    }
    // AND NOTHING ELSE IN THE CHAIN: the same for the arm sec -> sup-s -> work-s, whose areas were
    // registered before "at work" was true and so never opened anything either.
    for (const [first, second] of [
      ['sec', 'sup-s'],
      ['sec', 'work-s'],
      ['sup-s', 'work-s'],
    ] as const) {
      expect(workAreaGroup(first, second), `a group was opened for ${first} and ${second}`).toBeNull()
    }
  })

  it('opens no group when two agents of one chain claim the same record', async () => {
    const shared = aTask('the record both of the chain reach for')
    const firstGroups = await claim('sup-s', shared)
    expect(firstGroups, 'the first claim of the chain opens nothing').toEqual([])
    const secondGroups = await claim('work-s', shared)
    expect(secondGroups, 'a claim inside one chain opened a group').toEqual([])
    const key = overlapKey(
      { kind: 'agent', id: 'sup-s' },
      { kind: 'agent', id: 'work-s' },
      { what: 'record', id: shared },
    )
    const opened = t.client.sqlite.prepare('SELECT id FROM groups WHERE about = ?').get(key) as { id: string } | undefined
    expect(opened, 'a group exists for a claim overlap inside one chain').toBeUndefined()
  })
})

// ======================================================================== (b) two chains

describe('two agents in different chains still open a group, with the above from their cards', () => {
  it('holds both agents and the one above each, read from the card each holds', () => {
    const group = workAreaGroup('work-x', 'work-y')
    expect(group, 'the different-chain overlap opened no group').not.toBeNull()
    const ids = group?.members.map((one) => one.who.id).sort() ?? []
    expect(ids).toEqual(['sup-x', 'sup-y', 'work-x', 'work-y'].map(idOf).sort())
    // THE WORKER CARD SAYS "Its starter", so each worker's own starter is the member above it.
    expect(member(group, 'sup-x')?.because).toContain('above work-x')
    expect(member(group, 'sup-y')?.because).toContain('above work-y')
    // AND THE OWNER IS NOT IN IT, which is the claim-overlap rule and not this one.
    expect(ids).not.toContain(THE_PERSON)
  })

  it('still opens a group when two different chains claim the same record', async () => {
    const shared = aTask('the record two chains reach for')
    await claim('work-x', shared)
    const second = await claim('work-y', shared)
    expect(second, 'two different chains on one record must still open a group').toHaveLength(1)
  })
})

// ======================================================================== (c) the person

describe('an agent whose card reports to the person gets nobody above it', () => {
  it('adds nobody above the secretary, though its own starter is still registered', () => {
    const group = workAreaGroup('sec', 'work-q')
    expect(group, 'the different-chain overlap with the secretary opened no group').not.toBeNull()
    // sec IS IN IT, and its own starter is not above it: the secretary card reports to the person.
    expect(member(group, 'sec'), 'the secretary is not a member of its own overlap group').not.toBeNull()
    expect(member(group, THE_TEST_OFFICES_SECRETARY.handle), `${THE_TEST_OFFICES_SECRETARY.handle} was added above the secretary by the old starter chain`).toBeNull()
    const aboveTheSecretary = group?.members.filter((one) => one.because.includes('above sec')) ?? []
    expect(aboveTheSecretary, 'a member says it is above the secretary').toEqual([])
    // AND THE OTHER SIDE STILL GETS ITS OWN STARTER, so the reading did not simply stop.
    expect(member(group, 'sup-q')?.because).toContain('above work-q')
  })
})

// ======================================================================== (d) the ladder

describe('a worker under a supervisor under a secretary', () => {
  it('puts the supervisor above the worker', () => {
    const group = workAreaGroup('work-s', 'work-r')
    expect(group, 'the overlap over the worker\u2019s area opened no group').not.toBeNull()
    expect(member(group, 'sup-s')?.because, 'the supervisor is not above the worker').toContain('above work-s')
  })

  it('puts the secretary above the supervisor, and nobody above the secretary', () => {
    const group = workAreaGroup('sup-s', 'work-t')
    expect(group, 'the overlap over the supervisor\u2019s area opened no group').not.toBeNull()
    expect(member(group, 'sec')?.because, 'the secretary is not above the supervisor').toContain('above sup-s')
    const aboveTheSecretary = group?.members.filter((one) => one.because.includes('above sec')) ?? []
    expect(aboveTheSecretary, 'a member says it is above the secretary').toEqual([])
  })
})

// ======================================================================== (e) the marking

describe('the office marks a group that criterion B would no longer open', () => {
  /** A group of the shape the real ghost groups had: a work-area overlap between two of one chain. */
  let ghost = ''

  it('writes the one existing line, once, into the ghost group', () => {
    const opened = team.openAGroupAndSayWhy(
      {
        workspaceId: 'default',
        name: 'A group from before the decision',
        openedBy: { kind: 'agent', id: idOf('sup-s') },
        because: 'Opened before criterion B, the way the day\u2019s ghost groups were.',
        members: [
          { who: { kind: 'agent', id: idOf('work-s') }, because: 'Its area overlaps.' },
          { who: { kind: 'agent', id: idOf('sup-s') }, because: 'It is above work-s.' },
        ],
        about: claims.workAreaOverlapKey('sup-s', 'work-s'),
      },
      { type: 'agent', id: 'sup-s' },
    )
    ghost = opened.id

    const wouldMark = claims.theWorkAreaGroupsInsideOneChain('default')
    expect(wouldMark.map((one) => one.id)).toContain(ghost)

    const marked = claims.markTheWorkAreaGroupsInsideOneChain({ type: 'system', id: moleOffice().id }, 'default')
    expect(marked).toContain(ghost)

    const said = t.client.sqlite
      .prepare(
        "SELECT json_extract(data, '$.body') AS body, json_extract(data, '$.saidInFull') AS said_in_full " +
          // A MESSAGE IS KEPT IN THE MESSAGE CENTRE, marked with the project it was written for.
          "FROM records WHERE workspace_id = 'message-centre' AND kind = 'message' " +
          "AND json_extract(data, '$.writtenIn.project') = 'default' AND json_extract(data, '$.toGroup') = ?",
      )
      .all(ghost) as { body: string; said_in_full: string | null }[]
    const marking = said.filter((one) => one.body.startsWith(THE_OVERLAP_ENDED_PREFIX))
    expect(marking, 'the ghost group was not marked').toHaveLength(1)
    expect(marking[0]?.body).toBe(
      `Overlap ended: ${claims.THE_OVERLAP_WAS_INSIDE_ONE_CHAIN}`,
    )
    expect(marking[0]?.body).toContain('the overlap was inside one starter chain')
    expect(marking[0]?.body).toContain('the group is not needed')
    expect(marking[0]?.said_in_full ?? null, 'the marking line kept a hover sentence').toBeNull()
  })

  it('writes no second line when it is run again, and marks nothing else', () => {
    expect(claims.theWorkAreaGroupsInsideOneChain('default').map((one) => one.id)).not.toContain(ghost)
    const marked = claims.markTheWorkAreaGroupsInsideOneChain({ type: 'system', id: moleOffice().id }, 'default')
    expect(marked).toEqual([])
    const count = t.client.sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.toGroup') = ? " +
          "AND json_extract(data, '$.body') LIKE 'Overlap ended%'",
      )
      .get(ghost) as { n: number }
    expect(count.n).toBe(1)
  })
})

// ======================================================================== (f) several secretaries

describe('where several agents hold the secretary card, "the secretary" is the one in the holder\u2019s own chain', () => {
  it('puts the chain\u2019s own secretary above the supervisor, not the first row that holds the card', () => {
    const group = workAreaGroup('sup-z', 'work-u')
    expect(group, 'the overlap over the second chain\u2019s supervisor opened no group').not.toBeNull()
    expect(member(group, 'sec2')?.because, 'the second secretary is not above its own supervisor').toContain('above sup-z')
    expect(member(group, 'sec'), 'the first secretary was added above a supervisor it never started').toBeNull()
  })

  it('names nobody above a supervisor the person started, because the office cannot say which secretary', () => {
    const group = workAreaGroup('sup-q', 'work-v')
    expect(group, 'the overlap over the person-started supervisor opened no group').not.toBeNull()
    const above = group?.members.filter((one) => one.because.includes('above sup-q')) ?? []
    expect(above, 'a secretary was guessed above a supervisor the person started').toEqual([])
    expect(member(group, 'sup-v')?.because).toContain('above work-v')
  })
})

// ======================================================================== (g) words are not authority

it('keeps the declared secretary above a supervisor after its words say it reports to the person', async () => {
  const words = await import('../src/server/lib/card-words.ts')
  words.fileTheCardWordsOnce({ full: null, why: 'MADE-UP: no commit was read for this test.' })
  const roles = await ask('GET', '/api/roles', AS_THE_PERSON)
  expect(roles.status).toBe(200)
  const record = (roles.said['words'] as { role: string; record: string | null }[])
    .find((one) => one.role === 'supervisor')?.record
  expect(record).toBeTruthy()
  const reportsTo = 'MADE-UP: it reports to the person.'
  const patched = await ask('PATCH', `/api/records/${record!}`, AS_THE_PERSON, { dataPatch: { reportsTo } })
  expect(patched.status, JSON.stringify(patched.said)).toBe(200)
  try {
    const changed = await ask('GET', '/api/roles', AS_THE_PERSON)
    expect(changed.status).toBe(200)
    expect((changed.said['cards'] as { name: string; reportsTo: string }[])
      .find((card) => card.name === 'supervisor')?.reportsTo).toBe(reportsTo)

    await register('made-up-above-supervisor', 'supervisor', ['src/made-up-above'], asAgent('sec2'))
    await claim('made-up-above-supervisor', aTask('MADE-UP work held for the above check'))
    await register('made-up-above-other-starter', 'supervisor', ['src/made-up-other'], AS_THE_PERSON)
    await register('made-up-above-other-worker', 'worker', ['src/made-up-above'], asAgent('made-up-above-other-starter'))
    const group = workAreaGroup('made-up-above-supervisor', 'made-up-above-other-worker')
    expect(group, 'the different-chain overlap opened no group').not.toBeNull()
    const above = group!.members.filter((one) => one.because.includes('above made-up-above-supervisor'))
    expect(above.map((one) => one.who)).toEqual([{ kind: 'agent', id: idOf('sec2') }])
    expect(member(group, 'made-up-above-other-starter')?.because).toContain('above made-up-above-other-worker')
  } finally {
    const declared = (await import('../src/server/lib/roles.ts')).theRoleCards().cards.find((card) => card.name === 'supervisor')!
    const restored = await ask('PATCH', `/api/records/${record!}`, AS_THE_PERSON, { dataPatch: { reportsTo: declared.reportsTo } })
    expect(restored.status).toBe(200)
  }
})
