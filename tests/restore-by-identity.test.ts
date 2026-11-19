// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READ THAT TELLS AN AGENT WHO IT IS, WHERE IT WORKS, AND WHAT IT LEFT UNFINISHED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH PIECE IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * F15 point 4 and problem pHFu8nivPZ_O. An agent that comes back — a new session, after a
 * compaction, after a machine restart, tomorrow morning — has to reconstruct who it is from several
 * reads. `GET /api/restore` is the one read: the card it holds, the project it works in and how that
 * was worked out, the open work it filed there, the last session that ran as it, and what changed
 * since that session ended.
 *
 * The tests below are the criterion's own list, one describe each:
 *
 *   · a key answers the agent that holds it and no other, and a handle alone answers the handle;
 *   · a key nobody holds answers that and names no agent, and never falls through to the handle;
 *   · a key sent with somebody else's handle is refused, naming both;
 *   · "changed since" is counted from the last session's end, and an agent nobody has run as is told
 *     that rather than shown everything;
 *   · the unfinished work is the agent's own, not the project's whole backlog;
 *   · the reply names the project it answered about and how that was decided, and a directory that
 *     matched nothing names no project;
 *   · the reply counts itself and says the token figure is an estimate;
 *   · GET /api/onboarding names this door and stays inside its budget.
 *
 * Every one is proved by mutation after a control run; the mutations and their sha256 are in the
 * report, not in this file.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { SYSTEM_LINE_TITLE } from '../src/shared/groups.ts'
import { CHARS_PER_TOKEN } from '../src/config/token-estimate.mjs'
import { ONBOARDING_TOKEN_BUDGET } from '@shared/onboarding.ts'
import type { RecordKind } from '@shared/types.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'

/** The person, so registering an agent is an ordinary act and not the thing under test. */
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** One durable agent this file made, and the things it needs to be read back. */
interface Made {
  handle: string
  key: string
  /** The `agent` record's own id, which is what `ranAs` binds a session to. */
  record: string
}

const made = new Map<string, Made>()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, name] of [
    ['agent-a', 'Agent A'],
    ['agent-b', 'Agent B'],
    ['agent-c', 'Agent C'],
  ] as const) {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle, name, role: 'worker' },
    })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
    const body = reply.json() as {
      record: string
      whatToGiveIt: { key: string }
    }
    expect(body.whatToGiveIt.key, `${handle} was answered no key`).toMatch(/^[0-9a-f]{64}$/)
    made.set(handle, { handle, key: body.whatToGiveIt.key, record: body.record })
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The key of one made agent, or a clear failure. */
function keyOf(handle: string): string {
  const one = made.get(handle)
  if (one === undefined) throw new Error(`no agent ${handle} was made`)
  return one.key
}

/** Write one record straight into the store, attributed to an actor. */
function file(
  actor: { type: 'agent' | 'human'; id: string },
  kind: RecordKind,
  title: string,
  data: Record<string, unknown>,
): string {
  return t.api.createRecord({ workspaceId: WORKSPACE, kind, title, data, actor }).id
}

/**
 * PUT A RECORD AT A NAMED MINUTE, so this file can say when things happened.
 *
 * A test writes its whole story inside one wall-clock second, so every record would otherwise carry
 * the same stamp and no boundary could be measured. Nothing here tests the clock: it tests what
 * "since" means, so the times are stated rather than raced for. Both the record's `updatedAt` and
 * its create change row are moved, because "what changed since" reads the first and `whoFiled`
 * reads the second.
 */
function at(id: string, stamp: string): string {
  t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(stamp, stamp, id)
  t.client.sqlite.prepare('UPDATE changes SET at = ? WHERE record_id = ?').run(stamp, id)
  return id
}

/**
 * PUT A SESSION'S OPENING AND ITS END AT DIFFERENT NAMED MINUTES.
 *
 * The two are different facts and the criterion names the END, so the test has to be able to tell
 * "counted from when the run opened" from "counted from when it ended". A helper that set both to
 * one stamp would make the two indistinguishable and the mutation would not go red.
 */
function openedThenEnded(id: string, opened: string, ended: string): string {
  // AND THE RUN'S FLOW RUN, which the office wrote in the same write as the run (wave 13p round 25), so it moves with it.
  const flowRuns = (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").all(id) as { id: string }[]).map((row) => row.id)
  for (const each of [id, ...flowRuns]) {
    t.client.sqlite.prepare('UPDATE records SET created_at = ?, updated_at = ? WHERE id = ?').run(opened, ended, each)
    t.client.sqlite.prepare('UPDATE changes SET at = ? WHERE record_id = ?').run(opened, each)
  }
  return id
}

/** One request, its status and its parsed body. */
async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url, headers: { 'x-mole-office-workspace': WORKSPACE, ...headers } })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** The named field of a reply, or a clear failure. */
function field<T>(body: Record<string, unknown>, name: string): T {
  expect(body, `the reply carries no "${name}"`).toHaveProperty(name)
  return body[name] as T
}

// ============================================================ the key answers its own holder

describe('a key answers the agent that holds it, and a handle alone answers the handle', () => {
  it('answers agent B for agent B’s key and never agent A', async () => {
    const withB = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-b') })
    expect(withB.status, JSON.stringify(withB.body).slice(0, 300)).toBe(200)
    const agent = field<{ handle: string; name: string }>(withB.body, 'agent')
    expect(agent.handle).toBe('agent-b')
    expect(agent.name).toBe('Agent B')

    // THE CONTROL: the same read with A's key answers A, so the assertion above is about the key
    // and not about a route that answers the same thing whatever is sent.
    const withA = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-a') })
    expect(withA.status).toBe(200)
    expect(field<{ handle: string }>(withA.body, 'agent').handle).toBe('agent-a')
  })

  it('answers the handle when no key was sent', async () => {
    const res = await get('/api/restore/agent-b')
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200)
    expect(field<{ handle: string }>(res.body, 'agent').handle).toBe('agent-b')
  })
})

// ============================================================ a key nobody holds

describe('a key nobody holds answers nobody and names no agent', () => {
  const NOBODY = 'f'.repeat(64)

  it('answers that nobody holds it, and names no agent', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': NOBODY })
    expect(res.status).toBe(404)
    expect(String(res.body['error'])).toContain('Nobody holds this key')
    expect(res.body, 'a key nobody holds named an agent anyway').not.toHaveProperty('agent')
  })

  it('does not fall through to the handle when the key is not held', async () => {
    // THIS IS THE HALF THAT MATTERS: a request carrying a key it got wrong must not be answered as
    // the agent whose name it guessed.
    const res = await get('/api/restore/agent-a', { 'x-mole-office-key': NOBODY })
    expect(res.status).toBe(404)
    expect(String(res.body['error'])).toContain('Nobody holds this key')
    expect(res.body, 'a key nobody holds fell through to the handle and named agent A').not.toHaveProperty('agent')
  })
})

// ============================================================ a key that contradicts the handle

describe('a key sent with somebody else’s handle is refused, naming both', () => {
  it('refuses the contradiction and names the key’s holder and the handle', async () => {
    const res = await get('/api/restore/agent-a', { 'x-mole-office-key': keyOf('agent-b') })
    expect(res.status).toBe(400)
    const said = String(res.body['error'])
    expect(said).toContain('agent-b')
    expect(said).toContain('agent-a')
    expect(res.body, 'a refused contradiction answered about an agent anyway').not.toHaveProperty('agent')
  })
})

// ============================================================ changed since the last session ended

describe('changed since is counted from the last session’s end', () => {
  /**
   * THE DAY THIS FILE STATES ITS OWN MOMENTS ON, and every stamp below is built from it.
   *
   * This read counts every record whose `updatedAt` sorts after the last session's end, so the
   * answer moves if any record in the workspace carries the real clock. The three registrations the
   * top-level `beforeAll` makes are stamped with the real clock, and once "now" passed SESSION_ENDED
   * they were counted as changes: that is the red this fixture had. They are re-stamped at
   * REGISTRATIONS_FILED below, and moving DAY moves every stated moment, registrations included.
   */
  const DAY = '2026-09-15'
  const REGISTRATIONS_FILED = `${DAY} 08:45:00`
  const SESSION_OPENED = `${DAY} 09:00:00`
  const BEFORE_IT_ENDED = `${DAY} 09:05:00`
  const SESSION_ENDED = `${DAY} 09:10:00`
  const AFTER_IT_ENDED = `${DAY} 09:15:00`

  let beforeId = ''
  let afterId = ''
  let sessionId = ''

  beforeAll(() => {
    // THE THREE REGISTRATIONS, MOVED OFF THE REAL CLOCK. The top-level `beforeAll` registered them
    // through the route, which stamped them with the moment it ran. They are not part of this story,
    // so they are filed at a stated minute before the run opened; otherwise they sort after
    // SESSION_ENDED as soon as the wall clock passes it and the read counts them.
    for (const handle of ['agent-a', 'agent-b', 'agent-c'] as const) {
      const one = made.get(handle)
      if (one === undefined) throw new Error(`no agent ${handle} was made`)
      at(one.record, REGISTRATIONS_FILED)
    }
    // AND THE CARD MESSAGES THOSE REGISTRATIONS WROTE. Under a decision of the owner's, each registration
    // writes its new agent one system message. Those are records too. They belong to the
    // registration and not to this story, so they are moved to the same stated minute. Without
    // this they carry the real clock, sort after SESSION_ENDED, and are counted as changes.
    // A MESSAGE IS KEPT IN THE MESSAGE CENTRE, with the project it was written for as its mark,
    // so they are found there, by that mark.
    const cardMessages = t.client.sqlite
      .prepare(
        "SELECT id FROM records WHERE workspace_id = 'message-centre' AND kind = 'message' AND title = ? " +
          "AND json_extract(data, '$.writtenIn.project') = ?",
      )
      .all(SYSTEM_LINE_TITLE, WORKSPACE) as { id: string }[]
    expect(cardMessages.length, 'the three registrations wrote no card messages').toBe(3)
    for (const one of cardMessages) at(one.id, REGISTRATIONS_FILED)
    // THE PROBLEM FILED WHILE THE SESSION WAS RUNNING, which is NOT a change since it ended.
    beforeId = at(
      file({ type: 'agent', id: 'agent-a' }, 'problem', 'Filed while the session was running', { state: 'open' }),
      BEFORE_IT_ENDED,
    )
    // THE SESSION ITSELF, bound to A's own record through `ranAs`, with the end this read counts from.
    // A finished run is filed historically, so the finish writer does not try to seal a Git tip in a
    // test fixture.
    sessionId = openedThenEnded(
      historicalSession(t, {
        workspaceId: WORKSPACE,
        kind: 'session',
        title: 'The run that filed the problem',
        actor: { type: 'agent', id: 'agent-a' },
        data: {
          state: 'finished',
          ranAs: [{ workspaceId: WORKSPACE, agentId: made.get('agent-a')?.record ?? '' }],
          doing: 'measuring the gripper',
          closedAt: SESSION_ENDED,
          closedHow: 'provider-event',
          closedBecause: 'the measurement finished',
        },
      }).id,
      SESSION_OPENED,
      SESSION_ENDED,
    )
    // AND THE PROBLEM FILED AFTER IT ENDED, which is the one change since.
    afterId = at(
      file({ type: 'agent', id: 'agent-a' }, 'problem', 'Filed after the session ended', { state: 'open' }),
      AFTER_IT_ENDED,
    )
  })

  it('counts exactly the record filed after the session ended, and names the moment', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-a') })
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200)
    const changed = field<{ since: string | null; count: number | null; records: { id: string }[] }>(
      res.body,
      'changedSince',
    )
    expect(changed.since).toBe(SESSION_ENDED)
    expect(changed.count, 'a change filed while the session was running was counted as since it ended').toBe(1)
    expect(changed.records.map((one) => one.id)).toEqual([afterId])
    expect(changed.records.map((one) => one.id)).not.toContain(beforeId)
    expect(changed.records.map((one) => one.id)).not.toContain(sessionId)
  })

  it('names the last session, when it ended and what it said it was doing', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-a') })
    const last = field<{ id: string; endedAt: string | null; endedHow: string | null; doing: string | null }>(
      res.body,
      'lastSession',
    )
    expect(last.id).toBe(sessionId)
    expect(last.endedAt).toBe(SESSION_ENDED)
    expect(last.endedHow).toBe('provider-event')
    expect(last.doing).toBe('measuring the gripper')
  })

  it('tells an agent nobody has run as that, rather than showing it everything', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-c') })
    expect(res.status).toBe(200)
    expect(field<unknown>(res.body, 'lastSession'), 'agent C was given somebody else’s session').toBeNull()
    const changed = field<{ count: number | null; since: string | null; says: string }>(res.body, 'changedSince')
    expect(changed.count, 'an agent nobody has run as was shown every change as if it had').toBeNull()
    expect(changed.since).toBeNull()
    expect(changed.says).toMatch(/nobody has run as this agent/i)
  })
})

// ============================================================ the unfinished work is its own

describe('the unfinished work is the agent’s own, not the project’s whole backlog', () => {
  let mineId = ''
  let theirsId = ''

  beforeAll(() => {
    mineId = file({ type: 'agent', id: 'agent-a' }, 'problem', 'A’s own open problem', { state: 'open' })
    theirsId = file({ type: 'agent', id: 'agent-b' }, 'problem', 'B’s own open problem', { state: 'open' })
  })

  it('carries the loops this agent filed and not another agent’s', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-a') })
    const unfinished = field<{ loops: { id: string }[]; count: number | null; projectOpenLoops: number | null }>(
      res.body,
      'unfinished',
    )
    const ids = unfinished.loops.map((one) => one.id)
    expect(ids, 'the agent’s own open problem is missing').toContain(mineId)
    expect(ids, 'another agent’s open problem was handed over as this agent’s own').not.toContain(theirsId)
    expect(unfinished.count).toBeGreaterThanOrEqual(1)
    // AND THE PROJECT TOTAL IS SAID BESIDE IT, so "your own" is not read as "all of it".
    expect(unfinished.projectOpenLoops).toBeGreaterThanOrEqual(2)
  })

  it('carries none when the agent filed no open work, and says so as an absence', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-c') })
    const unfinished = field<{ loops: unknown[]; count: number | null; says: string }>(res.body, 'unfinished')
    expect(unfinished.loops).toEqual([])
    expect(unfinished.count).toBe(0)
    expect(unfinished.says).toMatch(/no open work .* was filed by this agent/i)
  })
})

// ============================================================ which project, and how it was decided

describe('the reply names the project it answered about and how that was decided', () => {
  it('says the request named it with the workspace header', async () => {
    const res = await get('/api/restore', { 'x-mole-office-key': keyOf('agent-b') })
    const project = field<{ id: string | null; howWorkedOut: string }>(res.body, 'project')
    expect(project.id).toBe(WORKSPACE)
    expect(project.howWorkedOut).toMatch(/named it with x-mole-office-workspace/i)
  })

  it('names no project and says nothing matched for a directory no project holds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/restore?directory=/tmp/mole-office-nothing-registers-this',
      headers: { 'x-mole-office-key': keyOf('agent-b') },
    })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    const body = res.json() as { project: { id: string | null; howWorkedOut: string } }
    expect(body.project.id).toBeNull()
    expect(body.project.howWorkedOut).toMatch(/nothing matched/i)
    expect(body.project.howWorkedOut).not.toMatch(/"default"/)
  })

  it('matches a working directory against a registered repository root, and says so', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = mkdtempSync(join(tmpdir(), 'restore-root-'))
    try {
      const registered = await app.inject({
        method: 'POST',
        url: '/api/implementation/repositories',
        headers: AS_THE_PERSON,
        payload: { name: 'restore-scratch', root },
      })
      expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)

      const directory = join(root, 'a', 'subdirectory')
      const res = await app.inject({
        method: 'GET',
        url: `/api/restore?directory=${encodeURIComponent(directory)}`,
        headers: { 'x-mole-office-key': keyOf('agent-b') },
      })
      expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
      const body = res.json() as { project: { id: string | null; howWorkedOut: string; asked: { directory: string | null } } }
      expect(body.project.id).toBe(WORKSPACE)
      expect(body.project.asked.directory).toBe(directory)
      expect(body.project.howWorkedOut).toMatch(/working directory/i)
      expect(body.project.howWorkedOut).toMatch(/repository root/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ============================================================ it counts itself

describe('the reply reports its own size and says the token figure is an estimate', () => {
  it('counts characters and bytes exactly, and estimates tokens from the divisor', async () => {
    const { RESTORE_TOKEN_BUDGET } = await import('../src/server/api/participants.ts')
    const res = await app.inject({
      method: 'GET',
      url: '/api/restore',
      headers: { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-key': keyOf('agent-a') },
    })
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
    const body = res.json() as {
      size: {
        characters: number
        bytes: number
        tokensEstimated: number
        charsPerTokenAssumed: number
        budgetTokensEstimated: number
        fits: boolean
        tokensAreAnEstimate: string
      }
      leftOut: unknown[]
      leftOutNote: string
    }
    const size = body.size
    expect(size.charsPerTokenAssumed).toBe(CHARS_PER_TOKEN)
    expect(size.tokensEstimated).toBe(Math.round(size.characters / CHARS_PER_TOKEN))
    expect(size.characters).toBeLessThanOrEqual(res.body.length)
    expect(size.budgetTokensEstimated).toBe(RESTORE_TOKEN_BUDGET)
    expect(size.fits).toBe(true)
    expect(size.tokensEstimated).toBeLessThanOrEqual(RESTORE_TOKEN_BUDGET)
    expect(size.tokensAreAnEstimate).toContain('estimate')
    // A REPLY THAT FITS DROPS NOTHING AND SAYS SO, which is a real answer and not an absence.
    expect(body.leftOut).toEqual([])
    expect(body.leftOutNote).toContain('Nothing was left out')
  })
})

// ============================================================ the onboarding read names the door

describe('GET /api/onboarding names this door and stays inside its budget', () => {
  it('names GET /api/restore among the doors, and still fits', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      doors: { route: string; what: string }[]
      size: { tokensEstimated: number; fits: boolean }
    }
    const door = body.doors.find((one) => one.route === 'GET /api/restore')
    expect(door, 'the onboarding read does not name GET /api/restore').toBeDefined()
    expect(door?.what.length ?? 0, 'the door carries no sentence').toBeGreaterThan(0)
    expect(body.size.tokensEstimated).toBeLessThanOrEqual(ONBOARDING_TOKEN_BUDGET)
    expect(body.size.fits).toBe(true)
  })
})
