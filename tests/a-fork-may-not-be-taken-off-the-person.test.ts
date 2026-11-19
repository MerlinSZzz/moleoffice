// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY NOT TAKE A FORK OFF THE OWNER BY REWRITING WHO SETTLES IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES, AND IT WAS ONE COMMIT OLD WHEN IT WAS FOUND
 * ---------------------------------------------------------------------------------------
 *
 * Commit 6e9af68 taught `assertMaySettleFork` to read the fork's `who_settles_it` field. Nothing
 * guarded the field. Measured over HTTP on the running server on 27 August 2026, as an agent:
 *
 *     PATCH /api/records/<a fork marked "the owner"> {"dataPatch":{"who_settles_it":"an agent"}}  200
 *     POST  /api/links {"fromId":"<a decision>","toId":"<that fork>","type":"derived_from"}       201
 *
 * Two requests and the fork was gone from the owner's queue. A guard that reads a field anybody may write
 * is not a guard.
 *
 * ---------------------------------------------------------------------------------------
 * THE LINE THIS FILE DRAWS, AND MOST OF THE FIELD IS ON THE OPEN SIDE OF IT
 * ---------------------------------------------------------------------------------------
 *
 * Refused: changing `who_settles_it` away from "the owner" on a fork that already stores it.
 * Allowed, and it MUST stay allowed, because it is how the owner's queue gets sorted at all:
 *
 *   · classifying a fork nobody has classified,
 *   · reclassifying a fork that says "an agent", "the parent" or "a measurement", any direction,
 *   · marking a fork "the owner", which hands one TO the owner,
 *   · sending back the value the record already holds, which changes nothing.
 *
 * The easy wrong fix here is a guard on the KEY rather than on the CHANGE. It would refuse an agent
 * that edits the question on one of the owner's forks and sends the whole record back, and `an ordinary
 * edit to one of the owner's forks` below is the test that goes red when somebody writes it.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ONE FACT THAT USED TO BE WORKED OUT IN TWO PLACES
 * ---------------------------------------------------------------------------------------
 *
 * `priorityOf` in src/server/lib/forks.ts read `fields['who_settles_it'] === THE_OWNER` itself while
 * `whoSettlesThisFork` in src/server/lib/records.ts was the reader the guard asks. The last describe
 * block reads the source and fails if a second reading comes back, because that drift is invisible:
 * no type error, no failing behaviour test, and the guard and the ordering quietly disagree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { FORK_SETTLERS, THE_OWNER, type ForkSettler } from '../src/shared/kinds.ts'
import type { ForksReply } from '../src/server/api/forks.ts'

let t: TestDb
let app: FastifyInstance

/** This case's own project, so a per-project read sees only what this case filed. */
let PROJECT = 'panelx'
let caseNumber = 0

let asAgent: Record<string, string> = {}
let asPerson: Record<string, string> = {}
/** A request that names nobody. Owner decision §36: that is not evidence a person made it. */
let namingNobody: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `panelx-case-${String(caseNumber)}`
  asAgent = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-workspace': PROJECT,
  }
  asPerson = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': PROJECT,
  }
  namingNobody = { 'x-mole-office-workspace': PROJECT }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork, filed by an agent. `undefined` is the fifth answer: nobody has said. */
/**
 * A fork the PERSON filed, with whatever classification they gave it.
 *
 * FILED BY THE PERSON SINCE 3 SEPTEMBER 2026, and this file is what that rule is about. Every test here is
 * about a fork the OWNER reserved — its own describe block says so — and since that date an agent
 * may correct a classification IT wrote, under the rule that an engineering question is the
 * agent's (`design/messages/ACCEPTANCE.md` W3). A fixture that filed the person's classification under an
 * agent's name was testing the wrong fork: it made the guard refuse the agent its own sentence,
 * which is not what this file exists to hold. Filing as the person is the case, and nothing else moved.
 */
async function fileFork(settles: ForkSettler | undefined): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson,
    payload: {
      kind: 'proposal',
      title: `Position or force control? (${settles ?? 'unclassified'})`,
      data: {
        question: 'Position control or force control for the handover?',
        options: ['a — position control', 'b — force control'],
        ...(settles === undefined ? {} : { who_settles_it: settles }),
      },
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = asAgent,
): Promise<{ statusCode: number; body: string; message: string }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.body
  let message = ''
  try {
    const parsed = res.json() as { error?: string; message?: string; detail?: string }
    message = `${parsed.message ?? ''} ${parsed.error ?? ''} ${parsed.detail ?? ''}`
  } catch {
    message = body
  }
  return { statusCode: res.statusCode, body, message }
}

/** The owner's desk, out of the one reading both fork surfaces answer from. */
async function deskRows(): Promise<ForksReply['forks']> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as ForksReply).forks
}

/** What the record actually stores now, read back through the route a person would read it with. */
async function storedSettler(id: string): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  const record = (res.json() as { record: { data: Record<string, unknown> } }).record
  return record.data['who_settles_it']
}

describe('a fork the owner reserved may not be reclassified by an agent', () => {
  it('refuses an agent that would change "the owner" to "an agent", and the record does not move', async () => {
    const fork = await fileFork(THE_OWNER)
    const refused = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })

    expect(refused.statusCode, refused.body).toBe(403)
    // THE REFUSAL IS THE FEATURE. An agent that is refused has to be able to read two things: what
    // was not written, and what it may do instead. A 403 that says only "no" costs its next turn.
    expect(refused.message).toContain('Nothing was written')
    expect(refused.message).toContain('two requests')
    expect(refused.message).toContain('Classifying a fork NOBODY has classified')
    // AND THE FORK IS EXACTLY AS IT WAS. A refusal that wrote the row anyway would be worse than
    // none: the reply and the database would disagree about who governs this project.
    expect(await storedSettler(fork)).toBe(THE_OWNER)
  })

  it('refuses every other word, not only "an agent"', async () => {
    for (const word of FORK_SETTLERS.filter((one) => one !== THE_OWNER)) {
      const fork = await fileFork(THE_OWNER)
      const refused = await patch(fork, { dataPatch: { who_settles_it: word } })
      expect(refused.statusCode, `"${word}" was allowed: ${refused.body}`).toBe(403)
      expect(await storedSettler(fork)).toBe(THE_OWNER)
    }
  })

  it('refuses a `data` body that deletes the field by leaving it out', async () => {
    // THE WALK-AROUND, AND IT SENDS THE FIELD NOWHERE. `data` replaces the whole object, so a body
    // that never mentions `who_settles_it` takes the classification off the owner. A guard that only
    // looked at keys it was SENT would pass this one and the hole would still be open.
    const fork = await fileFork(THE_OWNER)
    const refused = await patch(fork, {
      data: { question: 'Position control or force control for the handover?', options: ['a', 'b'] },
    })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.message).toContain('leave it out')
    expect(await storedSettler(fork)).toBe(THE_OWNER)
  })

  it('refuses a request that named nobody, because an absent header is not a person', async () => {
    const fork = await fileFork(THE_OWNER)
    const refused = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } }, namingNobody)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.message).toContain('x-mole-office-actor-type')
    expect(await storedSettler(fork)).toBe(THE_OWNER)
  })

  it('lets the person take their own fork off themselves', async () => {
    const fork = await fileFork(THE_OWNER)
    const allowed = await patch(fork, { dataPatch: { who_settles_it: 'a measurement' } }, asPerson)
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(await storedSettler(fork)).toBe('a measurement')
  })
})

describe('sorting the queue stays open to agents, which is the point of the field', () => {
  it('lets an agent classify a fork nobody has classified', async () => {
    const fork = await fileFork(undefined)
    const allowed = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(await storedSettler(fork)).toBe('an agent')
  })

  it('lets an agent reclassify a fork that is already an agent’s', async () => {
    // NOBODY IS BEING ROBBED. This fork was never the owner's, so moving it between the three
    // non-governance answers takes nothing off anybody, and an agent that discovers a named
    // experiment answers a question should be able to say so.
    const fork = await fileFork('an agent')
    const allowed = await patch(fork, { dataPatch: { who_settles_it: 'a measurement' } })
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(await storedSettler(fork)).toBe('a measurement')
  })

  it('lets an agent hand a fork TO the owner', async () => {
    // THE SAFE DIRECTION, AND THE OWNER'S OWN RULE POINTS AT IT: if you are unsure whether a fork is the owner's,
    // it is the owner's. An agent escalating is never the act this guard exists to stop.
    const fork = await fileFork('an agent')
    const allowed = await patch(fork, { dataPatch: { who_settles_it: THE_OWNER } })
    expect(allowed.statusCode, allowed.body).toBe(200)
    expect(await storedSettler(fork)).toBe(THE_OWNER)
  })

  it('lets an agent make an ordinary edit to one of the owner’s forks, including sending the whole record back', async () => {
    // THE GUARD FIRES ON THE VALUE CHANGING, NOT ON THE KEY BEING PRESENT. A rule written the other
    // way would make the owner's forks uneditable by the agents that file them, and this is the test that
    // goes red the day somebody writes it that way.
    const fork = await fileFork(THE_OWNER)
    const patched = await patch(fork, { dataPatch: { recommendation: 'Take (b). The load cell is on the bench.' } })
    expect(patched.statusCode, patched.body).toBe(200)

    // `replace: true` because this body is not in fact the whole record — it leaves out the
    // recommendation the write above added — and a wholesale `data` now has to say that the fields
    // it does not carry are meant to go. What is being tested is unchanged: the fork's settler is
    // sent back at the value it already holds, and that is an ordinary edit rather than a
    // classification being taken off the owner.
    const wholeRecord = await patch(fork, {
      data: {
        question: 'Position control or force control for the handover?',
        options: ['a — position control', 'b — force control'],
        who_settles_it: THE_OWNER,
      },
      replace: true,
    })
    expect(wholeRecord.statusCode, wholeRecord.body).toBe(200)
    expect(await storedSettler(fork)).toBe(THE_OWNER)
  })
})

describe('the two requests, run one after the other, which is how this was found', () => {
  it('refuses the escalation and the fork is still the owner’s at the link door', async () => {
    const fork = await fileFork(THE_OWNER)
    const decisionRes = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asPerson,
      payload: {
        kind: 'decision',
        title: 'Stay on position control',
        data: { replaces: [],
          because: 'The left finger has no force sensor.',
          authority: 'a measurement',
          decided_by: 'claude-code',
        },
      },
    })
    expect(decisionRes.statusCode, decisionRes.body).toBe(201)
    const decision = (decisionRes.json() as { record: { id: string } }).record.id

    // REQUEST ONE, which used to answer 200.
    const step = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } })
    expect(step.statusCode, step.body).toBe(403)

    // REQUEST TWO, asked anyway, because a guard that only holds when the first one is obeyed is
    // not holding anything.
    const link = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asAgent,
      payload: { fromId: decision, toId: fork, type: 'derived_from' },
    })
    expect(link.statusCode, link.body).toBe(403)

    // AND IT IS STILL ON THE OWNER'S DESK.
    const desk = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
    expect(desk.statusCode, desk.body).toBe(200)
    const open = (desk.json() as ForksReply).forks.map((one) => one.recordId)
    expect(open).toContain(fork)
  })
})

describe('who settles a fork is read in one place', () => {
  it('orders the queue by what that one reader says', async () => {
    const ownersFork = await fileFork(THE_OWNER)
    const theirs = await fileFork('an agent')
    const unsaid = await fileFork(undefined)

    const desk = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
    expect(desk.statusCode, desk.body).toBe(200)
    const rows = new Map((desk.json() as ForksReply).forks.map((one) => [one.recordId, one]))

    expect(rows.get(ownersFork)?.priority.governance).toBe(true)
    expect(rows.get(theirs)?.priority.governance).toBe(false)
    // NOBODY HAS SAID IS NOT "THE OWNER'S" HERE, ON PURPOSE. The queue treats an unclassified fork as the owner's
    // for the question of who may SETTLE it, because absence is not permission. The ordering fact
    // is a different claim — the corpus SAYS this is a governance question — and nobody said that.
    expect(rows.get(unsaid)?.priority.governance).toBe(false)
    expect(rows.get(ownersFork)?.priority.because).toContain('it says only you may settle it')
  })

  it('tells a person who settles each fork, in that fork’s own words', async () => {
    // ONE SENTENCE PER ANSWER, AND THE ROW PICKS ITS OWN. Until 27 August 2026 one sentence was
    // drawn on every row saying settling was refused to every agent. That went false the day a
    // fork could say an agent settles it, and it was giving the wrong REASON on the owner's own forks
    // even before then: they are refused because the fork says the owner settles it, not because
    // settling is a governance act.
    const rows = new Map<string, string>()
    for (const settles of [THE_OWNER, 'an agent', 'the parent', 'a measurement', undefined] as const) {
      rows.set(settles ?? 'unclassified', await fileFork(settles))
    }
    const read = new Map((await deskRows()).map((one) => [one.recordId, one.because]))
    const because = (key: string): string => read.get(rows.get(key) ?? '') ?? ''

    expect(because(THE_OWNER)).toContain('Only you may settle this fork')
    expect(because('unclassified')).toContain('Nobody has said who settles this fork')
    expect(because('unclassified')).toContain('an empty field is not permission')
    expect(because('an agent')).toContain('It says an agent settles it')
    expect(because('the parent')).toContain('goes up one level')
    expect(because('a measurement')).toContain('a measurement answers it')
    // AND NONE OF THEM STILL CARRIES THE SENTENCE THAT STOPPED BEING TRUE.
    for (const key of [THE_OWNER, 'an agent', 'the parent', 'a measurement', 'unclassified']) {
      expect(because(key), `${key} still says settling is refused to every agent`).not.toContain(
        'so Mole Office refuses it to every agent',
      )
    }
  })
})
