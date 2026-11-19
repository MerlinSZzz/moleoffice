// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WAITING ON YOU LISTS EVERYTHING WHOSE MOVE IS THE OWNER'S — PROBLEM qpq63k1PiBNb.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET
 * ---------------------------------------------------------------------------------------
 *
 * THE DEFECT: AQZm6esnQqCr needed the owner, yet it was not in Waiting on you, and a search of
 * Everything did not find it either — a problem carrying two options for the owner was on no list they read.
 *
 * TWO THINGS HID IT. The record said `whose_move: agent`, filed that way by Builder BX3 although the
 * choice was the owner's; and the queue itself listed only some of what waits on the owner. Measured 7 September
 * 2026: `readWaiting` reads forks, planning intents, implementation guesses, records carrying
 * `whose_move` and set-aside rows — and NOTHING about a visitor credential waiting for the owner's
 * confirmation or a message addressed to the owner they have not read. Both are refused to every agent, so
 * both were waiting on the owner and on the owner alone, on no list.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a problem whose move is the owner's is on the list, and says why in words;
 *   · a visitor credential waiting for confirmation is on it, with `confirm` as its act;
 *   · a message addressed to the owner they have not read is on it, with `read` as its act;
 *   · an agent-filed goal the owner has not confirmed is on it, with its Confirm press and Goals page;
 *   · a goal the owner filed is not on it, and confirming an agent-filed goal takes it off;
 *   · confirming the credential takes it off, and so does reading the message;
 *   · every row says where it goes, and the three kinds that are not records do not go to `#/r/`;
 *   · the door refuses a record filed with options and `whose_move: agent`, and says both ways on;
 *   · it says nothing about a record that has finished, whose options are history.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the credential loop from `readWaiting` → the credential cases go red.
 *   drop the message loop → the message cases go red.
 *   make `whereAWaitingRowGoes` always return `recordPath(row.id)` → the destination case goes red.
 *   make `goalNeedsConfirmation` always return false → the goal and page agreement case goes red.
 *   make `assertOptionsForThemAreTheirMove` return early always → the door cases go red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { againstActual, readHorizons, type HorizonRecord, type HorizonsInput } from '../src/shared/horizons.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { whereAWaitingRowGoes } from '../src/web/lib/waiting.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'
import type { HorizonsReading } from '../src/web/pages/HorizonsPage.tsx'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let t: TestDb
let app: FastifyInstance
let credential: string
let message: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function waiting(): Promise<{ items: WaitingItem[] }> {
  const reply = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { items: WaitingItem[] }
}

async function file(
  headers: Record<string, string>,
  data: Record<string, unknown>,
): Promise<{ code: number; said: string; id: string | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'problem', title: 'Something to decide', data },
  })
  const made = reply.statusCode === 201 ? (reply.json() as Record<string, unknown>) : null
  return {
    code: reply.statusCode,
    said: reply.body,
    id: made === null ? null : ((made['record'] as Record<string, unknown>)['id'] as string),
  }
}

async function fileGoal(headers: Record<string, string>, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: {
      kind: 'goal',
      title,
      data: {
        horizon: 'short',
        what: `${title} is true.`,
        owner: THE_TEST_OFFICES_OWNER.id,
        state: 'open',
      },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return ((reply.json() as Record<string, unknown>)['record'] as Record<string, unknown>)['id'] as string
}

async function goalRecords(): Promise<HorizonRecord[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/records?kind=goal&shape=full', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { records: HorizonRecord[] }).records
}

async function goalsPage(goals: HorizonRecord[]): Promise<string> {
  const webApi = await import('../src/web/api.ts')
  webApi.setActor({ type: 'human', id: THE_PERSON })
  const page = await import('../src/web/pages/HorizonsPage.tsx')
  const input: HorizonsInput = {
    goals,
    trajectories: [],
    plannedStates: [],
    modules: [],
    links: [],
    presenceByRecord: {},
    windows: [],
    droppedLines: [],
    titlesById: Object.fromEntries(goals.map((goal) => [goal.id, goal.title])),
    today: '2026-09-29',
  }
  const reading = {
    levels: readHorizons(input, 'normal'),
    actual: againstActual(input, 'normal'),
    spans: { spans: [] },
    partsRead: 0,
    today: input.today,
    participants: { people: [], agents: [] },
    projectOf: {},
  } as unknown as HorizonsReading
  return renderToStaticMarkup(h(page.TheHorizons, { reading })).replace(/<style[\s\S]*?<\/style>/g, ' ')
}

function needsYouMarkup(page: string): string {
  const start = page.indexOf('data-group="needs-you"')
  if (start < 0) return ''
  const openingTag = page.slice(page.lastIndexOf('<', start), start)
  const end = page.indexOf(openingTag.startsWith('<section') ? '</section>' : '</p>', start)
  return end < 0 ? page.slice(start) : page.slice(start, end)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })

  // A CREDENTIAL WAITING FOR THE OWNER. Refused to every agent to confirm, so it waits on the owner alone.
  const asked = await app.inject({
    method: 'POST',
    url: '/api/office/visitors',
    headers: AS_THE_PERSON,
    payload: {
      handle: 'the-other-worker',
      name: 'The worker on loquat',
      role: 'worker',
      conversationPath: '/logs/other.jsonl',
      startDirectory: '/work/other',
    },
  })
  expect(asked.statusCode, asked.body).toBe(201)
  credential = ((asked.json() as Record<string, unknown>)['credential'] as Record<string, unknown>)['id'] as string

  // AND A MESSAGE ADDRESSED TO THE OWNER, FROM AN AGENT, THAT THE OWNER HAS NOT READ.
  const sent = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: {
      kind: 'message',
      title: 'A question for you',
      data: { body: 'Which of the two should I build first?', to: [{ kind: 'person', id: THE_PERSON }] },
    },
  })
  expect(sent.statusCode, sent.body).toBe(201)
  message = ((sent.json() as Record<string, unknown>)['record'] as Record<string, unknown>)['id'] as string

  const browserStore = new Map<string, string>()
  const browserStorage = {
    getItem: (key: string) => browserStore.get(key) ?? null,
    setItem: (key: string, value: string) => void browserStore.set(key, value),
    removeItem: (key: string) => void browserStore.delete(key),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: browserStorage,
    sessionStorage: browserStorage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. what the list holds

describe('the waiting list', () => {
  it('holds a record whose move is the owner’s, which is what it already did', async () => {
    const made = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { symptom: 'a thing', whose_move: 'person', state: 'open' })
    expect(made.code, made.said).toBe(201)
    const row = (await waiting()).items.find((one) => one.id === made.id)
    expect(row, 'a record whose move is the owner’s').toBeDefined()
    expect(row?.act).toBe('answer')
    expect(row?.why.length, 'and it says why in words').toBeGreaterThan(20)
  })

  it('holds a visiting agent asking to come in, which it did not', async () => {
    const row = (await waiting()).items.find((one) => one.id === credential)
    expect(row, 'a credential waiting for the owner is a thing waiting on the owner').toBeDefined()
    expect(row?.act, 'and the press it asks for').toBe('confirm')
    expect(row?.kind).toBe('visiting agent')
    expect(row?.title).toBe('The worker on loquat')
    expect(row?.why, 'the sentence names the agent').toContain('the-other-worker')
  })

  it('holds a person’s device under its own kind and its own word, not as an agent', async () => {
    // Criterion D2 and the ruling: a device asks through the same credential door and is not an
    // agent, so the row and its sentence name a device where an agent's name theirs.
    const asked = await app.inject({
      method: 'POST',
      url: '/api/office/visitors',
      headers: AS_THE_PERSON,
      payload: { device: `${THE_TEST_OFFICES_OWNER.id}-waiting-laptop` },
    })
    expect(asked.statusCode, asked.body).toBe(201)
    const id = String(((asked.json() as Record<string, unknown>)['credential'] as Record<string, unknown>)['id'])
    const row = (await waiting()).items.find((one) => one.id === id)
    expect(row, 'a device waiting for the owner is a thing waiting on the owner').toBeDefined()
    expect(row?.act).toBe('confirm')
    expect(row?.kind, 'a device is not a visiting agent').toBe('visiting device')
    expect(row?.why, 'and the sentence says device').toContain('device')
    expect(row?.why).toContain(`${THE_TEST_OFFICES_OWNER.id}-waiting-laptop`)
  })

  it('holds a message addressed to the owner they have not read, which it did not', async () => {
    const row = (await waiting()).items.find((one) => one.id === message)
    expect(row, 'an unread message addressed to the owner').toBeDefined()
    expect(row?.act).toBe('read')
    expect(row?.kind).toBe('message')
  })

  it('puts an agent-filed goal on both pages until the owner confirms it', async () => {
    const agentGoal = await fileGoal(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'An agent goal for the waiting list')
    const personGoal = await fileGoal(AS_THE_PERSON, 'A person goal for the waiting list')
    const first = (await waiting()).items.filter((one) => one.kind === 'goal')
    expect(first.map((one) => one.id), 'only the agent-filed goal needs the owner’s Confirm').toEqual([agentGoal])
    const row = first[0]!
    expect(row.tier).toBe('settle')
    expect(row.act).toBe('confirm-goal')
    // A DECISION LETS A SECRETARY CONFIRM ON THE PERSON'S WORD, naming the evidence,
    // so "Only you can confirm this goal" stopped being true, and so did "nothing an agent writes can take
    // it away", as answer XXd0tr8rsZl6 says.
    expect(row.why).toContain('You can confirm this goal, or a secretary can on your word, naming the evidence.')
    expect(row.why).toContain('whether an agent naming no evidence could')
    expect(row.why).not.toContain('Only you can')
    expect(row.why).not.toContain('take it away')
    expect(row.because.rule).toBe('refused-act')
    if (row.because.rule === 'refused-act') {
      expect(row.because.doors.some((door) => door.route.includes('PATCH /api/records/:id'))).toBe(true)
    }
    expect(whereAWaitingRowGoes({ id: agentGoal, kind: 'goal' })).toBe(pathFor('horizons'))

    const page = await goalsPage(await goalRecords())
    const needsYou = needsYouMarkup(page)
    const pageGoalIds = [agentGoal, personGoal].filter((id) => needsYou.includes(id)).sort()
    expect(pageGoalIds, 'the Goals page and the door share the same rule').toEqual(first.map((one) => one.id).sort())
    expect(needsYou).toContain(agentGoal)
    expect(needsYou).not.toContain(personGoal)

    const confirmed = await app.inject({
      method: 'PATCH',
      url: `/api/records/${agentGoal}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { confirmed_by: { by: THE_PERSON, at: '2026-09-29' } } },
    })
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect((await waiting()).items.filter((one) => one.kind === 'goal')).toEqual([])
    const after = await goalsPage(await goalRecords())
    expect(needsYouMarkup(after)).not.toContain(agentGoal)
  })

  it('takes the credential off once the owner confirms it', async () => {
    const said = await app.inject({
      method: 'POST',
      url: `/api/office/visitors/${credential}/confirm`,
      headers: AS_THE_PERSON,
    })
    expect(said.statusCode, said.body).toBe(200)
    expect((await waiting()).items.some((one) => one.id === credential), 'nothing is waiting there now').toBe(false)
  })

  it('takes the message off once the owner has read it', async () => {
    const said = await app.inject({
      method: 'POST',
      url: `/api/messages/${message}/mark`,
      headers: AS_THE_PERSON,
      payload: { mark: 'seen' },
    })
    expect(said.statusCode, said.body).toBe(200)
    expect((await waiting()).items.some((one) => one.id === message), 'the owner has read it').toBe(false)
  })
})

// ============================================================ 2. where a row goes

describe('where a row goes when it is pressed', () => {
  it('sends the three kinds that are not records somewhere that exists', () => {
    expect(whereAWaitingRowGoes({ id: 'abc', kind: 'visiting agent' }), 'a credential is at the Embassy').toBe(
      '/visitor/abc',
    )
    expect(
      whereAWaitingRowGoes({ id: 'abc', kind: 'visiting device' }),
      'and a device credential opens the same page, because it is the same door',
    ).toBe('/visitor/abc')
    expect(whereAWaitingRowGoes({ id: 'abc', kind: 'message' }), 'a message opens the chat').toBe('/messages')
    expect(
      whereAWaitingRowGoes({ id: 'abc', kind: 'planning intent' }),
      'a planning intent opens the planning screen',
    ).not.toContain('/r/')
  })

  it('sends a record to its own page, which is what every row used to do', () => {
    expect(whereAWaitingRowGoes({ id: 'abc', kind: 'problem' })).toBe('/r/abc')
  })

  it('sends a goal row to the Goals page', () => {
    expect(whereAWaitingRowGoes({ id: 'goal-1', kind: 'goal' })).toBe(pathFor('horizons'))
  })
})

// ============================================================ 3. the door

describe('the door', () => {
  it('refuses a record filed with options for the owner under an agent’s move', async () => {
    const said = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      symptom: 'a thing with two ways out',
      options: ['do it now', 'wait for the rebuild'],
      whose_move: 'agent',
      state: 'open',
    })
    expect(said.code).toBe(409)
    // THE BODY IS JSON, so a quoted word in the sentence arrives escaped. The assertion checks the
    // words rather than the punctuation around them.
    expect(said.said, 'it names the field that puts it on the owner’s list').toContain('whose_move')
    expect(said.said).toContain('Decisions page')
    expect(said.said, 'and the way that keeps it an agent’s').toContain('attempts')
    expect(said.said).toContain('Nothing was written')
  })

  it('accepts the same record with the move marked as the owner’s', async () => {
    const said = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      symptom: 'a thing with two ways out',
      options: ['do it now', 'wait for the rebuild'],
      whose_move: 'person',
      state: 'open',
    })
    expect(said.code, said.said).toBe(201)
    const row = (await waiting()).items.find((one) => one.id === said.id)
    expect(row, 'and it is on the owner’s list, which is the point').toBeDefined()
  })

  it('refuses a patch that would leave it that way', async () => {
    const made = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { symptom: 'no options yet', whose_move: 'agent', state: 'open' })
    expect(made.code, made.said).toBe(201)
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${made.id as string}`,
      headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
      payload: { dataPatch: { options: ['one', 'the other'] } },
    })
    expect(said.statusCode).toBe(409)
  })

  it('says nothing about a record that has finished, whose options are history', async () => {
    const said = await file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
      symptom: 'it was fixed',
      options: ['the way we did not take'],
      whose_move: 'agent',
      state: 'fixed',
      fix: 'we took the other one',
    })
    expect(said.code, said.said).toBe(201)
  })
})
