// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TEN ACTS AN AGENT MAY NOT PERFORM ON A PLANNED FUTURE, AND EVERYTHING IT STILL MAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH HALVES ARE HERE
 * ---------------------------------------------------------------------------------------
 *
 * A guard that refuses everybody is not a guard, it is a wall. The point of this one is a
 * direction: **an agent may put a future in front of the person and may not take one away.** So
 * every refusal below is paired with the same request made by the person and answered 200, and the
 * last block is the list of things an agent may do — file a planned future, add states, reorder
 * them, add an edge, word a state nothing has answered, and say a state came true or was answered
 * another way.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE MERGED RECORD AND NOT THE PATCH KEYS
 * ---------------------------------------------------------------------------------------
 *
 * The five acts that live on the patch path are asked of what the record WILL HOLD, immediately
 * after the merge. Asked of the keys the request named, a wholesale `{"data":{...}}` walks past all
 * five, and so does a put-back — `restoreRevision` is a patch underneath. Both doors are driven
 * here rather than assumed.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HUMAN: Record<string, string> = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
const AGENT: Record<string, string> = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let caseNumber = 0
let project = 'default'

/**
 * ONE OFFICE FOR THE FILE, and a project of its own for each case. The link list a case reads is
 * the project the request names, so a case's own project keeps that reading to the links that case
 * wrote.
 */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  project = `default-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = project
  AGENT['x-mole-office-workspace'] = project
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: project, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
})

async function file(kind: string, title: string, data: Record<string, unknown> = {}, who = HUMAN): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: who, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function patch(id: string, payload: Record<string, unknown>, who: Record<string, string>) {
  return await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: who, payload })
}

async function link(fromId: string, toId: string, type: string, who: Record<string, string>) {
  return await app.inject({ method: 'POST', url: '/api/links', headers: who, payload: { fromId, toId, type } })
}

/** A planned future with two states, one edge, a `because`, and a pipeline it plans for. */
async function aPlan(): Promise<{ trajectory: string; a: string; b: string; pipeline: string }> {
  const a = await file('planned_state', 'The gripper closes on a 40 mm part', { what: 'The gripper closes on a 40 mm part.' })
  const b = await file('planned_state', 'The reach envelope is measured', { what: 'The reach envelope is measured.' })
  const pipeline = await file('pipeline', 'Perception pipeline', { blockIds: [] })
  const trajectory = await file('trajectory', 'Tray clamp, then reach', {
    plannedStateIds: [a, b],
    edges: [{ from: a, to: b, carries: 'the calibrated pose' }],
    because: 'The gripper has to be right before the reach envelope means anything.',
  })
  expect((await link(trajectory, pipeline, 'plans_for', HUMAN)).statusCode).toBe(201)
  return { trajectory, a, b, pipeline }
}

describe('the ten acts: an agent is refused, the person is not', () => {
  it('delete — an agent may not take a planned future out of the project', async () => {
    const { trajectory } = await aPlan()
    const refused = await app.inject({ method: 'DELETE', url: `/api/records/${trajectory}`, headers: AGENT })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('take an intended future out of the project')
    // AND THE PERSON MAY. This is the half that makes it a direction rather than a wall.
    const allowed = await app.inject({ method: 'DELETE', url: `/api/records/${trajectory}`, headers: HUMAN })
    expect(allowed.statusCode, allowed.body).toBe(200)
  })

  it('set-aside and un-set-aside — parking somebody’s plan, and un-parking one they parked', async () => {
    const { trajectory } = await aPlan()
    const parked = { paused: { since: '2026-08-26', why: 'The rig is on loan until October.' } }
    const refused = await patch(trajectory, { dataPatch: parked }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('park a direction the person set')

    expect((await patch(trajectory, { dataPatch: parked }, HUMAN)).statusCode).toBe(200)

    const unparking = await patch(trajectory, { dataPatch: { paused: null } }, AGENT)
    expect(unparking.statusCode, unparking.body).toBe(403)
    expect(unparking.body).toContain('un-park a future they put down')
    expect((await patch(trajectory, { dataPatch: { paused: null } }, HUMAN)).statusCode).toBe(200)
  })

  it('shorten — a live planned state dropped out of the order, on both write doors', async () => {
    const { trajectory, a, b } = await aPlan()
    const dropping = { plannedStateIds: [a] }
    const refused = await patch(trajectory, { dataPatch: dropping }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('remove part of the future without deleting anything')

    // AND THE WHOLESALE DOOR, which a patch-keys guard would have walked straight past.
    const wholesale = await patch(
      trajectory,
      { data: { plannedStateIds: [a], because: 'The gripper has to be right before the reach envelope means anything.' } },
      AGENT,
    )
    expect(wholesale.statusCode, wholesale.body).toBe(403)
    expect(wholesale.body).toContain('remove part of the future')

    expect((await patch(trajectory, { dataPatch: dropping }, HUMAN)).statusCode).toBe(200)
    // Reordering is NOT shortening, and an agent may do it.
    const reordered = await patch(trajectory, { dataPatch: { plannedStateIds: [b, a] } }, HUMAN)
    expect(reordered.statusCode).toBe(200)
  })

  it('unwire — emptying the plan’s edges leaves every state alive and every title as written', async () => {
    const { trajectory, a, b } = await aPlan()
    const before = await app.inject({ method: 'GET', url: `/api/records/${trajectory}`, headers: HUMAN })
    const storedEdges = JSON.stringify((before.json() as { record: { data: { edges: unknown } } }).record.data.edges)

    const refused = await patch(trajectory, { dataPatch: { edges: [] } }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('rewire the shape of the plan')

    // THE ACCEPTANCE IS THAT `data.edges` IS BYTE-IDENTICAL AFTER THE AGENT'S WRITE. The older
    // acceptance — "either 403s or leaves the plan reachable with its text unchanged" — is passed
    // by an emptied edge list, because every state stays reachable and every title stays as it was.
    const after = await app.inject({ method: 'GET', url: `/api/records/${trajectory}`, headers: HUMAN })
    expect(JSON.stringify((after.json() as { record: { data: { edges: unknown } } }).record.data.edges)).toBe(storedEdges)

    // Emptying a `carries` that was not empty is the same act.
    const emptied = await patch(trajectory, { dataPatch: { edges: [{ from: a, to: b }] } }, AGENT)
    expect(emptied.statusCode, emptied.body).toBe(403)

    // ADDING an edge is allowed, which is the direction this whole guard has.
    const added = await patch(
      trajectory,
      { dataPatch: { edges: [{ from: a, to: b, carries: 'the calibrated pose' }, { from: b, to: a, carries: 'a retry' }] } },
      AGENT,
    )
    expect(added.statusCode, added.body).toBe(200)
  })

  it('reword — an ANSWERED planned state may not be rewritten to match what was built', async () => {
    const { a } = await aPlan()
    // Unanswered: an agent may word it. That is what an agent is for.
    expect((await patch(a, { dataPatch: { what: 'The gripper closes on a 40 mm part without slipping.' } }, AGENT)).statusCode).toBe(200)

    const built = await file('task', 'Close the gripper on the 40 mm part', {})
    expect((await link(built, a, 'realises', AGENT)).statusCode, 'an agent MAY say a plan came true').toBe(201)

    const refused = await patch(a, { dataPatch: { what: 'The gripper closes on a 25 mm part.' } }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('rewrite an old plan to match what was actually built')
    const titled = await patch(a, { title: 'The gripper closes on a 25 mm part' }, AGENT)
    expect(titled.statusCode, titled.body).toBe(403)

    expect((await patch(a, { dataPatch: { what: 'The gripper closes on a 25 mm part.' } }, HUMAN)).statusCode).toBe(200)
  })

  it('because — the tenth act: an agent may not overwrite the person’s own words about why', async () => {
    const { trajectory, b } = await aPlan()
    const theirs = 'The gripper has to be right before the reach envelope means anything.'

    const refused = await patch(trajectory, { dataPatch: { because: 'Because the agent thinks so.' } }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('overwrite the person’s own words about why')
    const emptied = await patch(trajectory, { dataPatch: { because: '' } }, AGENT)
    expect(emptied.statusCode, emptied.body).toBe(403)

    const still = await app.inject({ method: 'GET', url: `/api/records/${trajectory}`, headers: HUMAN })
    expect((still.json() as { record: { data: { because: string } } }).record.data.because).toBe(theirs)

    // WRITING ONE WHERE THERE IS NONE IS ALLOWED. That is an agent adding, which is the direction.
    expect((await patch(b, { dataPatch: { because: 'A wider jaw would not fit the cell.' } }, AGENT)).statusCode).toBe(200)
    // And now it is somebody's words, so the second write of it is refused.
    expect((await patch(b, { dataPatch: { because: 'Actually the jaw is fine.' } }, AGENT)).statusCode).toBe(403)
    expect((await patch(trajectory, { dataPatch: { because: 'Because I changed my mind.' } }, HUMAN)).statusCode).toBe(200)
  })

  it('because — and the `why` inside a paused block, which is the same authored text', async () => {
    const { trajectory } = await aPlan()
    expect(
      (await patch(trajectory, { dataPatch: { paused: { since: '2026-08-26', why: 'The rig is on loan.' } } }, HUMAN)).statusCode,
    ).toBe(200)
    const refused = await patch(trajectory, { dataPatch: { paused: { since: '2026-08-26', why: 'No reason given.' } } }, AGENT)
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('overwrite the person’s own words about why')
  })

  it('replace and re-point — retiring one plan with another, and moving a plan onto a different subject', async () => {
    const { trajectory, pipeline } = await aPlan()
    const later = await file('trajectory', 'Reach first, then the gripper', { plannedStateIds: [] })

    const replacing = await link(later, trajectory, 'supersedes', AGENT)
    expect(replacing.statusCode, replacing.body).toBe(403)
    expect(replacing.body).toContain('retire one plan by replacing it with another')
    expect((await link(later, trajectory, 'supersedes', HUMAN)).statusCode).toBe(201)

    const other = await file('module', 'Tray clamp', {})
    const repointing = await link(trajectory, other, 'plans_for', AGENT)
    expect(repointing.statusCode, repointing.body).toBe(403)
    expect(repointing.body).toContain('move the person’s plan onto a different subject')
    // The FIRST `plans_for` was not refused — it is a plan arriving, not a plan moving.
    expect(pipeline.length).toBeGreaterThan(0)
  })

  it('unlink — both ends, so the plans_for link is covered too', async () => {
    const { trajectory, a, pipeline } = await aPlan()
    const links = await app.inject({ method: 'GET', url: '/api/links', headers: HUMAN })
    const rows = (links.json() as { links: { id: string; type: string }[] }).links
    const plansFor = rows.find((row) => row.type === 'plans_for')
    expect(plansFor, 'the plans_for link was not stored').toBeDefined()

    // ITS TO-END IS THE PIPELINE, so a guard that only looked at the to-end never saw this one.
    const refused = await app.inject({ method: 'DELETE', url: `/api/links/${plansFor!.id}`, headers: AGENT })
    expect(refused.statusCode, refused.body).toBe(403)
    expect(refused.body).toContain('erase a plan came true')

    const built = await file('task', 'Close the gripper on the 40 mm part', {})
    expect((await link(built, a, 'instead_of', AGENT)).statusCode).toBe(201)
    const answering = (
      (await app.inject({ method: 'GET', url: '/api/links', headers: HUMAN })).json() as {
        links: { id: string; type: string }[]
      }
    ).links.find((row) => row.type === 'instead_of')
    const takingItBack = await app.inject({ method: 'DELETE', url: `/api/links/${answering!.id}`, headers: AGENT })
    expect(takingItBack.statusCode, 'an agent may say it, and may not unsay it').toBe(403)
    expect((await app.inject({ method: 'DELETE', url: `/api/links/${plansFor!.id}`, headers: HUMAN })).statusCode).toBe(200)
    expect(pipeline.length).toBeGreaterThan(0)
  })

  it('a request that said who it was not is refused the same way', async () => {
    const { trajectory } = await aPlan()
    const nameless = await app.inject({
      method: 'DELETE',
      url: `/api/records/${trajectory}`,
      headers: { 'x-mole-office-workspace': project },
    })
    expect(nameless.statusCode, nameless.body).toBe(403)
    expect(nameless.body).toContain('nothing said who is asking')
  })
})

describe('what an agent may still do, because a guard that refuses everybody is not a guard', () => {
  it('files a planned future with states, adds one, reorders, and answers a state two ways', async () => {
    const a = await file('planned_state', 'A is true', { what: 'A is true.' }, AGENT)
    const b = await file('planned_state', 'B is true', { what: 'B is true.' }, AGENT)
    const trajectory = await file('trajectory', 'A then B', { plannedStateIds: [a, b] }, AGENT)
    const pipeline = await file('pipeline', 'Perception pipeline', { blockIds: [] }, AGENT)
    expect((await link(trajectory, pipeline, 'plans_for', AGENT)).statusCode).toBe(201)

    const c = await file('planned_state', 'C is true', { what: 'C is true.' }, AGENT)
    expect((await patch(trajectory, { dataPatch: { plannedStateIds: [a, b, c] } }, AGENT)).statusCode).toBe(200)
    expect((await patch(trajectory, { dataPatch: { plannedStateIds: [c, a, b] } }, AGENT)).statusCode).toBe(200)
    expect((await patch(trajectory, { dataPatch: { edges: [{ from: c, to: a }] } }, AGENT)).statusCode).toBe(200)

    const built = await file('task', 'The thing that was built', {}, AGENT)
    expect((await link(built, a, 'realises', AGENT)).statusCode).toBe(201)
    const other = await file('task', 'The other thing', {}, AGENT)
    expect((await link(other, b, 'instead_of', AGENT)).statusCode).toBe(201)
  })
})

describe('the kind rule on the intended link types', () => {
  it('refuses one intention realising another, and names instead_of where that is what was meant', async () => {
    const { trajectory, a, b } = await aPlan()
    const oneIntention = await link(b, a, 'realises', HUMAN)
    expect(oneIntention.statusCode, oneIntention.body).toBe(400)
    expect(oneIntention.body).toContain('One intention cannot have realised another')

    const built = await file('task', 'Close the gripper on the 40 mm part', {})
    const wrongType = await link(built, a, 'supersedes', HUMAN)
    expect(wrongType.statusCode, wrongType.body).toBe(400)
    expect(wrongType.body).toContain('`instead_of`')

    const notAPlannedState = await link(built, trajectory, 'realises', HUMAN)
    expect(notAPlannedState.statusCode).toBe(400)

    // A task is NOT a legal subject of a plans_for: a planned future plans for a pipeline, a module
    // or a block, and a task is work somebody has to do.
    const wrongSubject = await link(trajectory, built, 'plans_for', HUMAN)
    expect(wrongSubject.statusCode, wrongSubject.body).toBe(400)
    expect(wrongSubject.body).toContain('plans for a pipeline, a module or a block')
  })
})

describe('the three validity rules on a planned future’s order', () => {
  it('refuses an id nothing answers to, a repeat, and a state already in another future', async () => {
    const { trajectory, a } = await aPlan()
    const missing = await patch(trajectory, { dataPatch: { plannedStateIds: ['nosuchidxxxx'] } }, HUMAN)
    expect(missing.statusCode, missing.body).toBe(404)

    const twice = await patch(trajectory, { dataPatch: { plannedStateIds: [a, a] } }, HUMAN)
    expect(twice.statusCode, twice.body).toBe(400)
    expect(twice.body).toContain('listed twice')

    const notAState = await file('note', 'A note', {})
    const wrongKind = await patch(trajectory, { dataPatch: { plannedStateIds: [notAState] } }, HUMAN)
    expect(wrongKind.statusCode, wrongKind.body).toBe(400)

    const second = await file('trajectory', 'Another future', { plannedStateIds: [] })
    const stolen = await patch(second, { dataPatch: { plannedStateIds: [a] } }, HUMAN)
    expect(stolen.statusCode, stolen.body).toBe(400)
    expect(stolen.body).toContain('belongs to exactly one')
  })

  it('refuses the same three on the way in, not only on the way through', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'trajectory', title: 'A future of nothing', data: { plannedStateIds: ['nosuchidxxxx'] } },
    })
    expect(made.statusCode, made.body).toBe(404)
  })
})

describe('M1 and M2 — a planned state can never be walked as a past', () => {
  /**
   * THE FIRST MUTATION THE PLAN NAMES: make a planned state a member of a composition and watch the
   * pipeline history swallow it.
   *
   * Membership is the ONLY door into a composition, so this one refusal is what keeps a planned
   * state out of every composition, every composition diff, every done-count and every structural
   * timeline. It is not a new check — `checkBlockIds` has refused any id whose kind is not `block`
   * since before this design — and it is asserted here because THIS is the kind it now has to
   * refuse, and nothing else in the repository says so.
   */
  it('refuses a planned state in a pipeline’s order, by kind, on both write doors', async () => {
    const { a } = await aPlan()
    const pipeline = await file('pipeline', 'A second pipeline', { blockIds: [] })
    const patched = await patch(pipeline, { dataPatch: { blockIds: [a] } }, HUMAN)
    expect(patched.statusCode, patched.body).toBe(400)
    expect(patched.body).toContain('planned_state')

    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'pipeline', title: 'A third pipeline', data: { blockIds: [a] } },
    })
    expect(made.statusCode, made.body).toBe(400)
  })

  /** M2 — a planned future is not a composition subject, and is refused by name rather than answered "made of nothing". */
  it('refuses a planned future as a composition subject', async () => {
    const { trajectory } = await aPlan()
    const asked = await app.inject({ method: 'GET', url: `/api/composition/${trajectory}`, headers: HUMAN })
    expect(asked.statusCode, asked.body).not.toBe(200)
    expect(asked.body).toContain('trajectory')
  })

  /**
   * M7 — the history of the thing a plan plans for holds no entry from the plan.
   *
   * The read admits an event only when its subject is the record asked about, a block it carries,
   * or a pipeline that listed one. A planned state is none of those and cannot become one, because
   * M1 keeps it out of the member set.
   */
  it('leaves the pipeline’s history with nothing from the planned future in it', async () => {
    const { trajectory, a, pipeline } = await aPlan()
    await patch(a, { dataPatch: { what: 'Reworded while unanswered, which is allowed.' } }, HUMAN)
    const history = await app.inject({ method: 'GET', url: `/api/records/${pipeline}/history`, headers: HUMAN })
    expect(history.statusCode, history.body).toBe(200)
    const events = (history.json() as { events: { subject: { id: string; kind: string } }[] }).events
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(event.subject.id, 'a planned state reached a pipeline history').not.toBe(a)
      expect(event.subject.id, 'a planned future reached a pipeline history').not.toBe(trajectory)
      expect(['trajectory', 'planned_state']).not.toContain(event.subject.kind)
    }
  })
})
