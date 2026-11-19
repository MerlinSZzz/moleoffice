// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN NAMES AS ITS PARENT ONLY A SESSION ITS CALLER HAS A PART IN. Problem NlOyicZP_Jjt.
 *
 * A run's `parentAttachment` decides who is told when the run ends, and other readers follow it
 * upward. Until this rule, any caller could name any session. A session belongs to the agent it
 * answers as, read by theAgentASessionAnswersAs (the handle it holds, then ranAs, then servingAgent),
 * the same function the finished-child line uses to choose whom it wakes; when it answers as none, it
 * belongs to whoever filed it. Now a caller may name only:
 *   1. its own session: one that belongs to the caller. The session header does not count, because
 *      nothing proves it: a caller may send any run's id there;
 *   2. a session it started (it filed it and the session serves no agent, or it is above the session's
 *      agent in the chain of starters);
 *   3. a session of somebody above the caller in the caller's own chain of starters.
 * Anything else is refused with 403, a sentence naming the rule and the parent, and nothing written.
 * THE PERSON, PROVED, MAY NAME ANY SESSION: by the person's key, or from inside the office's own program, read
 * as `assertMayEndARun` reads them. the secretary's choice, message kZ-sT3-XGHLe: the harm is an agent waking
 * another agent's session, and a broken chain (a loop, a gone starter) should not lock them out. A
 * request that only says it is the person, with no key of theirs, gets no exemption.
 *
 * THE AGENTS. The person registers the secretary and a stranger. The secretary registers two
 * supervisors, S and S2, and a worker of its own. S registers worker V; S2 registers worker W2.
 * The secretary files S's run R, as it does with register-a-run.mjs.
 *
 *   (a) the secretary files a worker run naming R: accepted, because the secretary started S and filed R.
 *   (b) S files a run naming its own run R, which its session header names: accepted.
 *   (c) V, started by S, names R: accepted, because S is above V.
 *   (d) the stranger names R: refused, and nothing is written.
 *   (e) W2, a worker of S2, names R: refused. S2 and S are siblings, both started by the secretary.
 *   (f) a parent that is not a session, or that no record answers: refused.
 *   (g) the person names the run of S: accepted, because the chain of starters above S reaches them.
 *   (h) the stranger sends R as its own session header and names R: refused. The header proves nothing.
 *   (i) the message worker names the session the API server filed for it: accepted, because both
 *       are the office's own writers, which count as one filer.
 *   (j) the secretary files a session that serves the inspector, then names it: refused. A secretary
 *       may file a session for the inspector without being above it, so filing one is no part in it (check
 *       KsikOTgBUqEC). Before the filing door of round 30 a stranger filed one for S here.
 *   (l) the API server files a session that serves S, and the message worker names it: refused. The
 *       office's own writers count as one filer only for a session that serves no agent.
 *   (p) the person files a session that serves no agent but names S through ranAs, and the stranger names it
 *       as a parent: refused. (Before the filing door of round 30 the stranger filed it; that door refuses it now.) Whose session it is is read by theAgentASessionAnswersAs, the function the
 *       finished-child line uses to choose whom it wakes (check 2-sXnXxz1tf4).
 *   (q) the same through a held handle: the session holds the handle of S. Refused.
 *   (r) the secretary, who started S, names the session that ran as S: accepted.
 *   (m) the person, from inside the office, names a session whose agent's chain of starters loops and
 *       never reaches them: accepted.
 *   (n) a stranger names the same session: refused.
 *   (o) a request that says it is the person, with no key of theirs, names it: refused.
 *   (k) the stranger files a session that serves no agent, then names it: accepted. Such a session
 *       belongs to whoever filed it. This guards against the fix refusing too much; it has no mutation
 *       of its own, because the "own" rule accepts it too.
 * The patch path and the lifecycle door (POST /api/attachments) each have one accepted case and
 * one refused case.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone, in src/server/lib/records.ts
 * ---------------------------------------------------------------------------------------
 *
 *   m1. The call to `assertThisCallerMayNameThisParent` taken off the create path: (d), (e), (f) and
 *       the lifecycle refusal go red.
 *   m2. The "started" branch of `whyThisCallerMayNotNameThisParent` taken out: (a) and (g) go red.
 *   m3. The "ancestor" branch taken out: (c) and the patch acceptance go red.
 *   m4. `whyThisCallerMayNotNameThisParent` made to answer null at once: (d), (e), (f), the patch
 *       refusal and the lifecycle refusal go red.
 *   m5. The call taken off the patch path: the patch refusal goes red.
 *   m6. The session header counted as the caller's own session again: (h) goes red.
 *   m7. The office's own writers no longer counted as one filer: (i) goes red.
 *   m8. Filing counted as starting whatever the session serves again (the `serves === null` test taken
 *       off the agent filer's line): (j) goes red.
 *   m9. The same test taken off the office's line: (l) goes red.
 *   m10. The person's exemption taken out: (m) goes red.
 *   m11. The exemption given to anybody who says it is the person, without the proof: (o) goes red.
 *   m12. Whose session it is read from servingAgent alone again (theAgentARunServes): (p), (q) and (r)
 *        go red. (r) because the session that ran as S is then read as the stranger's.
 *   m13. The held handle left out of theAgentASessionAnswersAs: (q) goes red.
 *   m14. The chain of starters above the session's agent left out of rule 2: (a) and (r) go red.
 */

import type { AddressInfo } from 'node:net'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(
  method: 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a refusal. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

async function register(handle: string, by: Record<string, string>, role: string): Promise<void> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** File a session with the headers given. `serving` names the agent it serves, when it serves one. */
async function fileARun(
  headers: Record<string, string>,
  title: string,
  extra: Record<string, unknown> = {},
  serving?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return ask('POST', '/api/records', headers, {
    kind: 'session',
    title,
    data: {
      state: 'running',
      runtime: 'claude-code',
      ...(serving === undefined ? {} : { servingAgent: serving, servingAgentId: idOf(serving) }),
      ...extra,
    },
  })
}

function idIn(body: Record<string, unknown>): string {
  return String((body['record'] as { id?: string } | undefined)?.id ?? '')
}

/** How many records carry this title. A refused write leaves none. */
function howManyCalled(title: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
}

/** The parent a session record holds now, read from the database. */
function parentOf(id: string): unknown {
  const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.parentAttachment') AS parent FROM records WHERE id = ?").get(id) as
    | { parent: unknown }
    | undefined
  return row?.parent ?? null
}

/** The refusal this rule gives, checked for its rule sentence, the parent it names and "nothing was written". */
function expectTheRefusal(reply: { status: number; body: Record<string, unknown> }, parent: string): void {
  expect(reply.status, said(reply.body)).toBe(403)
  expect(said(reply.body)).toContain(`"${parent}"`)
  expect(said(reply.body)).toContain('A caller may name as a run\'s parent only its own session')
  expect(said(reply.body)).toContain('Nothing was written.')
}

let R = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(THE_TEST_OFFICES_SECRETARY.handle, AS_THE_PERSON, 'secretary')
  await register('a-stranger', AS_THE_PERSON, 'supervisor')
  await register('inspector-one', AS_THE_PERSON, 'inspector')
  await register('sup-s', asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'supervisor')
  await register('sup-s2', asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'supervisor')
  await register(`${THE_TEST_OFFICES_SECRETARY.handle}-worker`, asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'worker')
  await register('worker-v', asAgent('sup-s'), 'worker')
  await register('worker-w2', asAgent('sup-s2'), 'worker')
  // The secretary files S's run, as register-a-run.mjs does.
  const r = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'the run of S', {}, 'sup-s')
  expect(r.status, said(r.body)).toBe(201)
  R = idIn(r.body)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the create path accepts a parent the caller has a part in', () => {
  it(`(a) ${THE_TEST_OFFICES_SECRETARY.handle} files a worker run naming the run of a supervisor it started`, async () => {
    const w = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `a worker run ${THE_TEST_OFFICES_SECRETARY.handle} files under S`, { parentAttachment: R }, `${THE_TEST_OFFICES_SECRETARY.handle}-worker`)
    expect(w.status, said(w.body)).toBe(201)
    expect(parentOf(idIn(w.body))).toBe(R)
  })

  it('(b) a supervisor names its own run, the run that serves it', async () => {
    const own = await fileARun(asAgent('sup-s', R), 'a subagent run S files under its own run', { parentAttachment: R })
    expect(own.status, said(own.body)).toBe(201)
    expect(parentOf(idIn(own.body))).toBe(R)
  })

  it('(c) a worker names the run of the supervisor that started it', async () => {
    const v = await fileARun(asAgent('worker-v'), 'the run of V under S', { parentAttachment: R }, 'worker-v')
    expect(v.status, said(v.body)).toBe(201)
    expect(parentOf(idIn(v.body))).toBe(R)
  })
})

describe('the person is not a special case', () => {
  it('(g) the person names the run of S, whose chain of starters reaches them', async () => {
    const p = await fileARun(AS_THE_PERSON, 'a run the person files under S', { parentAttachment: R })
    expect(p.status, said(p.body)).toBe(201)
    expect(parentOf(idIn(p.body))).toBe(R)
  })
})

describe('the office files under its own sessions', () => {
  it('(i) the message worker names the session the API server filed for it', async () => {
    const workersOwn = t.api.createRecord({
      kind: 'session',
      title: 'the message worker, as the API server files it',
      workspaceId: 'default',
      origin: 'fixture',
      data: { state: 'running', startedByMoleOffice: true },
      actor: { type: 'agent', id: 'mole-office/the-api-server' },
    }).id
    const run = await fileARun(asAgent('mole-office/the-message-worker', workersOwn), 'a run the message worker starts', {
      parentAttachment: workersOwn,
    })
    expect(run.status, said(run.body)).toBe(201)
    expect(parentOf(idIn(run.body))).toBe(workersOwn)
  })
})

describe('the create path refuses any other parent, and writes nothing', () => {
  it('(h) a stranger sends the run of S as its own session header, and names it', async () => {
    const title = 'a stranger under S, naming S as its own session'
    const refused = await fileARun(asAgent('a-stranger', R), title, { parentAttachment: R }, 'a-stranger')
    expectTheRefusal(refused, R)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(d) a stranger names the run of S', async () => {
    const title = 'a stranger under S'
    const refused = await fileARun(asAgent('a-stranger'), title, { parentAttachment: R }, 'a-stranger')
    expectTheRefusal(refused, R)
    expect(said(refused.body)).toContain('"a-stranger" has no part in it')
    expect(howManyCalled(title)).toBe(0)
  })

  it('(e) a worker of a sibling supervisor names the run of S', async () => {
    const title = 'a worker of S2 under S'
    const refused = await fileARun(asAgent('worker-w2'), title, { parentAttachment: R }, 'worker-w2')
    expectTheRefusal(refused, R)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(f) a parent that is not a session, or that no record answers', async () => {
    const note = await ask('POST', '/api/records', asAgent(THE_TEST_OFFICES_SECRETARY.handle), { kind: 'note', title: 'not a session', data: { body: 'x' } })
    expect(note.status, said(note.body)).toBe(201)
    const noteId = idIn(note.body)
    const onANote = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'under a note', { parentAttachment: noteId })
    expectTheRefusal(onANote, noteId)
    expect(said(onANote.body)).toContain('not a session')
    const onNothing = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'under nothing', { parentAttachment: 'no-such-run-id' })
    expectTheRefusal(onNothing, 'no-such-run-id')
    expect(howManyCalled('under a note') + howManyCalled('under nothing')).toBe(0)
  })
})

describe('filing a session is starting it only when the session serves no agent', () => {
  it('(j) a secretary files a session that serves the inspector, then names it: refused, and nothing is written', async () => {
    // A secretary may file a session for the inspector without being above it (message 1uZgEr3aLmke), so this
    // filing is accepted and gives the secretary no part in the session (check KsikOTgBUqEC). Until the filing door of round 30
    // this case had a stranger file a session for S, which that door now refuses.
    const forTheInspector = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `a session ${THE_TEST_OFFICES_SECRETARY.handle} files for the inspector`, {}, 'inspector-one')
    expect(forTheInspector.status, said(forTheInspector.body)).toBe(201)
    const filedForIt = idIn(forTheInspector.body)
    const title = `${THE_TEST_OFFICES_SECRETARY.handle} under the session it filed for the inspector`
    const refused = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), title, { parentAttachment: filedForIt }, `${THE_TEST_OFFICES_SECRETARY.handle}-worker`)
    expectTheRefusal(refused, filedForIt)
    expect(said(refused.body)).toContain(`"${THE_TEST_OFFICES_SECRETARY.handle}" has no part in it`)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(l) the API server files a session that serves S, and the message worker names it: refused', async () => {
    const forS = t.api.createRecord({
      kind: 'session',
      title: 'a session the API server files for S',
      workspaceId: 'default',
      origin: 'fixture',
      data: { state: 'running', servingAgent: 'sup-s', servingAgentId: idOf('sup-s') },
      actor: { type: 'agent', id: 'mole-office/the-api-server' },
    }).id
    const title = 'a run the message worker starts under the session filed for S'
    const refused = await fileARun(asAgent('mole-office/the-message-worker'), title, { parentAttachment: forS })
    expectTheRefusal(refused, forS)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(k) a caller files a session that serves no agent, then names it: accepted', async () => {
    const plain = await fileARun(asAgent('a-stranger'), 'a session the stranger files for nobody')
    expect(plain.status, said(plain.body)).toBe(201)
    const own = idIn(plain.body)
    const run = await fileARun(asAgent('a-stranger'), 'a stranger under the session it filed for nobody', { parentAttachment: own }, 'a-stranger')
    expect(run.status, said(run.body)).toBe(201)
    expect(parentOf(idIn(run.body))).toBe(own)
  })
})

describe('whose session it is, read as the finished-child line reads it (check 2-sXnXxz1tf4)', () => {
  /** The agent record of sup-s in this project: what a session's ranAs names. */
  const agentRecordOf = (handle: string): string =>
    (
      t.client.sqlite
        .prepare("SELECT id FROM records WHERE kind = 'agent' AND workspace_id = 'default' AND json_extract(data, '$.handle') = ?")
        .get(handle) as { id: string }
    ).id

  /** A session the person files, from inside the office, that serves no agent but names sup-s through ranAs. Until the
   * filing door of round 30 the stranger filed it, which that door now refuses; the person, proved, may. */
  async function aSessionThatRanAsS(title: string): Promise<string> {
    const made = await fileARun(AS_THE_PERSON, title, { ranAs: [{ workspaceId: 'default', agentId: agentRecordOf('sup-s') }] })
    expect(made.status, said(made.body)).toBe(201)
    return idIn(made.body)
  }

  it('(p) the person files a session that ran as S, and the stranger names it: refused, and nothing is written', async () => {
    const ranAsS = await aSessionThatRanAsS('a session the person files that ran as S')
    const title = 'a stranger under the session that ran as S'
    const refused = await fileARun(asAgent('a-stranger'), title, { parentAttachment: ranAsS }, 'a-stranger')
    expectTheRefusal(refused, ranAsS)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(q) the stranger files a session that holds the handle of S, then names it: refused', async () => {
    const plain = await fileARun(asAgent('a-stranger'), 'a session the stranger files that holds the handle of S')
    expect(plain.status, said(plain.body)).toBe(201)
    const holding = idIn(plain.body)
    // THE HOLD, as the hold tool writes it: sup-s's handle held by this session, heard from just now.
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    t.client.sqlite
      .prepare('INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('test-hold-of-s', idOf('sup-s'), holding, 'test-machine', 'claude-code', stamp, stamp)
    try {
      const title = 'a stranger under the session that holds the handle of S'
      const refused = await fileARun(asAgent('a-stranger'), title, { parentAttachment: holding }, 'a-stranger')
      expectTheRefusal(refused, holding)
      expect(howManyCalled(title)).toBe(0)
    } finally {
      t.client.sqlite.prepare('DELETE FROM handle_holds WHERE id = ?').run('test-hold-of-s')
    }
  })

  it(`(r) ${THE_TEST_OFFICES_SECRETARY.handle}, who started S, names the session that ran as S: accepted`, async () => {
    const ranAsS = await aSessionThatRanAsS('a second session the person files that ran as S')
    const run = await fileARun(asAgent(THE_TEST_OFFICES_SECRETARY.handle), `a run ${THE_TEST_OFFICES_SECRETARY.handle} files under the session that ran as S`, { parentAttachment: ranAsS }, `${THE_TEST_OFFICES_SECRETARY.handle}-worker`)
    expect(run.status, said(run.body)).toBe(201)
    expect(parentOf(idIn(run.body))).toBe(ranAsS)
  })
})

describe(`the person, proved, may name any session (${THE_TEST_OFFICES_SECRETARY.handle}, message kZ-sT3-XGHLe)`, () => {
  /** A session serving an agent whose chain of starters loops, so it never reaches the person. */
  let inALoop = ''

  beforeAll(async () => {
    await register('loop-higher', asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'supervisor')
    await register('loop-sup', asAgent('loop-higher'), 'supervisor')
    await register('loop-worker', asAgent('loop-sup'), 'worker')
    // THE LOOP: loop-higher is now started by loop-worker, as a broken registry could say.
    t.client.sqlite
      .prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?")
      .run(idOf('loop-worker'), idOf('loop-higher'))
    const made = await fileARun(asAgent('loop-sup'), 'the run of loop-sup', {}, 'loop-sup')
    expect(made.status, said(made.body)).toBe(201)
    inALoop = idIn(made.body)
  })

  it('(m) the person, from inside the office, names a session in a looped chain: accepted', () => {
    const run = t.api.createRecord({
      kind: 'session',
      title: 'a run the person files under a session in a loop',
      workspaceId: 'default',
      origin: 'fixture',
      data: { state: 'running', runtime: 'claude-code', parentAttachment: inALoop },
      actor: t.api.HUMAN,
    }).id
    expect(parentOf(run)).toBe(inALoop)
  })

  it('(n) a stranger names the same session: still refused', async () => {
    const title = 'a stranger under a session in a loop'
    const refused = await fileARun(asAgent('a-stranger'), title, { parentAttachment: inALoop }, 'a-stranger')
    expectTheRefusal(refused, inALoop)
    expect(howManyCalled(title)).toBe(0)
  })

  it('(o) a request that says it is the person, from this computer with no key of theirs, names it: refused', async () => {
    // THROUGH A REAL LISTENER, because app.inject() carries no listener and so is the office itself, which the
    // exemption admits. On a listener with no key, the office counts the request as the person while their key window is open,
    // for most of their acts; this exemption, like assertMayEndARun, asks for their key.
    await app.listen({ host: '127.0.0.1', port: 0 })
    const door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
    const title = 'a request in their name under a session in a loop'
    const sent = await fetch(`${door}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ kind: 'session', title, data: { state: 'running', runtime: 'claude-code', parentAttachment: inALoop } }),
    })
    const refused = { status: sent.status, body: (await sent.json()) as Record<string, unknown> }
    expectTheRefusal(refused, inALoop)
    expect(howManyCalled(title)).toBe(0)
  })
})

describe('the patch path asks the same rule when a write sets or changes the parent', () => {
  it('accepts a worker setting the run of its own supervisor as its parent', async () => {
    const v = await fileARun(asAgent('worker-v'), 'a second run of V, with no parent yet', {}, 'worker-v')
    expect(v.status, said(v.body)).toBe(201)
    const id = idIn(v.body)
    const patched = await ask('PATCH', `/api/records/${id}`, asAgent('worker-v'), { dataPatch: { parentAttachment: R } })
    expect(patched.status, said(patched.body)).toBe(200)
    expect(parentOf(id)).toBe(R)
  })

  it('refuses a stranger setting the run of S as its parent, and changes nothing', async () => {
    const x = await fileARun(asAgent('a-stranger'), 'the stranger\'s own run', {}, 'a-stranger')
    expect(x.status, said(x.body)).toBe(201)
    const id = idIn(x.body)
    const refused = await ask('PATCH', `/api/records/${id}`, asAgent('a-stranger'), { dataPatch: { parentAttachment: R, doing: 'changed' } })
    expectTheRefusal(refused, R)
    expect(parentOf(id)).toBeNull()
    const doing = t.client.sqlite.prepare("SELECT json_extract(data, '$.doing') AS doing FROM records WHERE id = ?").get(id) as { doing: unknown }
    expect(doing.doing).toBeNull()
  })
})

describe('the lifecycle door asks the same rule', () => {
  it('opens a child under the caller\'s own run', async () => {
    const opened = await ask('POST', '/api/attachments', asAgent('sup-s', R), { title: 'a child S opens', parentAttachment: R })
    expect(opened.status, said(opened.body)).toBe(200)
    const id = String((opened.body['attachment'] as { id?: string } | undefined)?.id ?? '')
    expect(parentOf(id)).toBe(R)
  })

  it('refuses a stranger opening a child under the run of S, and writes nothing', async () => {
    const title = 'a child the stranger opens'
    const refused = await ask('POST', '/api/attachments', asAgent('a-stranger'), { title, parentAttachment: R })
    expectTheRefusal(refused, R)
    expect(howManyCalled(title)).toBe(0)
  })
})
