// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `GET /api/forks` — the person-level projection Home's decision desk is drawn from.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO TESTS THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `design/DECISIONS-PENDING.md` §39 settles that a fork may be settled without leaving the page
 * that lists it, and settles HOW: a person-level projection, *without weakening normal
 * workspace-scoped record access*. Two things therefore have to stay true, and both are asserted
 * below rather than argued in a comment:
 *
 *   1. THE PROJECTION IS NOT A WAY TO READ ANOTHER PROJECT. It spans projects because a fork
 *      waiting on you does not stop waiting while you read a different project. That is not a
 *      licence to hand over anything else that happens to live there. The test files a record in
 *      another project that no fork points at and proves it never appears, under any request the
 *      route can be sent.
 *
 *   2. GOVERNANCE IS STILL HUMAN-ONLY THROUGH THIS PATH. The projection makes a fork easy to find
 *      from anywhere, which is the point; it must not make it settleable by anything that finds it.
 *      The test walks the whole way an agent would: read the projection, take the id out of it,
 *      promote — and asserts the 403, that no decision was written, and that the fork is still
 *      waiting afterwards.
 *
 * `GET /api/records/:id` is untouched by all of this and stays workspace-scoped; the last test in
 * the first block proves the two answer differently for the same id, on purpose.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import type { ForksReply } from '../src/server/api/forks.ts'
import type { NeedsYouReply } from '../src/server/api/needs-you.ts'

let t: TestDb
let app: FastifyInstance

/** Two projects of this case's own, so a per-project read sees only what this case filed. */
let PANELX = 'panelx'
let ROBOTICS = 'robotics'
let caseNumber = 0

/** The forks this case filed, so it can take its own open ones off the queue at its end. */
let forksFiledThisCase: { id: string; workspaceId: string }[] = []

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

beforeEach(async () => {
  caseNumber += 1
  PANELX = `panelx-case-${String(caseNumber)}`
  ROBOTICS = `robotics-case-${String(caseNumber)}`
  forksFiledThisCase = []
  for (const [id, title] of [
    [PANELX, 'Mole Office'],
    [ROBOTICS, 'Robotics'],
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id, title } })
    expect(res.statusCode, res.body).toBe(201)
  }
})

/**
 * A CASE TAKES ITS OWN UNANSWERED FORKS OFF THE QUEUE AT ITS END. The projection spans every project,
 * so a fork one case left open would be waiting in the next case's reading. Every fork below is filed
 * through `fileFork`, which names it here; a fork the case settled is not open and is left alone.
 */
afterEach(async () => {
  const open = new Set((await forks()).forks.map((fork) => fork.recordId))
  for (const { id, workspaceId } of forksFiledThisCase) {
    if (!open.has(id)) continue
    const res = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: asPerson(workspaceId) })
    expect(res.statusCode, res.body).toBe(200)
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** Headers as an agent working in one project sends them. */
const asAgent = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': workspaceId,
})

/** Headers as the person sends them — the browser sets these from the actor selector. */
const asPerson = (workspaceId: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspaceId,
})

async function file(workspaceId: string, kind: string, title: string, data: unknown = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(workspaceId),
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** The same write, under the person's own name. See `fileFork` for why a fork uses it. */
async function fileAsThePerson(
  workspaceId: string,
  kind: string,
  title: string,
  data: unknown = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson(workspaceId),
    payload: { kind, title, data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * A decision, as the PERSON files one, because nobody else may.
 *
 * `file` above sends agent headers, and an agent asking to write a `decision` is refused with a 403
 * — which is the one access control in this product and is tested in its own right below. This is
 * how the corpus these tests read gets its decisions: through the door, as the human.
 */
async function fileDecision(workspaceId: string, title: string, data: unknown = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asPerson(workspaceId),
    payload: { kind: 'decision', title, data: data !== null && typeof data === 'object' && !Array.isArray(data) ? { replaces: [], ...(data as Record<string, unknown>) } : data },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/**
 * A fork the PERSON filed: the question, the options, and why it came up.
 *
 * FILED BY THE OWNER SINCE 3 SEPTEMBER 2026, and only because of what these tests are about. A fork an
 * AGENT files now says `who_settles_it: "an agent"` unless the agent names something else, on the
 * owner's ruling that an engineering question is the agent's (`design/messages/ACCEPTANCE.md` W3),
 * so an agent can no longer file one nobody has classified. This desk's tests are about a fork on
 * THE OWNER'S list — including the row that says nobody has said who settles it, which is now the owner's to file.
 * Nothing else about them moved.
 */
async function fileFork(
  workspaceId: string,
  title: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const id = await fileAsThePerson(workspaceId, 'proposal', title, {
    question: 'Should the gripper close on contact, or on force?',
    options: [
      'a — Close on contact: simple, and it crushes anything soft.',
      'b — Close on force: needs the load cell calibrated first.',
    ],
    recommendation: 'Take (b). The load cell is already on the bench.',
    because: 'Two demos have crushed a cup each.',
    evidence: ['Two cups crushed on 12 August, both on contact-close.'],
    revisit_when: 'A gripper with a compliant pad, which would make contact-close safe.',
    ...over,
  })
  forksFiledThisCase.push({ id, workspaceId })
  return id
}

/**
 * The rows of a whole-office list that were not there when the case started. The projection spans
 * every project, so a case that lists it keeps the whole reading and compares what the case added.
 */
function addedSince<T>(before: readonly T[], after: readonly T[], key: (one: T) => string): T[] {
  const had = new Set(before.map(key))
  return after.filter((one) => !had.has(key(one)))
}

async function link(workspaceId: string, fromId: string, toId: string, type: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: asAgent(workspaceId),
    payload: { fromId, toId, type },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** The projection, read the way any surface reads it. `headers` says who is asking and from where. */
async function forks(headers: Record<string, string> = asPerson(PANELX)): Promise<ForksReply> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ForksReply
}

// ============================================================================ what it answers

describe('the forks waiting on a person, across every project', () => {
  it('lists a fork from a project the request is not working in', async () => {
    const mine = await fileFork(PANELX, 'Should a fork be settleable from Home?')
    const theirs = await fileFork(ROBOTICS, 'Should the gripper close on contact?')

    // Asked from `panelx`, and both come back. This is the whole reason the projection exists: the
    // queue spans projects, and a fork waiting on you does not stop waiting because you are
    // reading a different project today.
    const read = await forks(asPerson(PANELX))
    expect(read.forks.map((fork) => fork.recordId).sort()).toEqual([mine, theirs].sort())
    expect(read.forks.find((fork) => fork.recordId === theirs)?.workspaceId).toBe(ROBOTICS)
    // And the project is named, not only keyed, because the desk says where a fork lives in words.
    expect(read.forks.find((fork) => fork.recordId === theirs)?.workspaceTitle).toBe('Robotics')

    // THE ORDINARY RECORD READ IS UNCHANGED AND STILL REFUSES THE SAME ID. Both sentences are true
    // at once, which is what §39 settled: the projection is a different route, not a hole in this
    // one.
    const direct = await app.inject({ method: 'GET', url: `/api/records/${theirs}`, headers: asPerson(PANELX) })
    expect(direct.statusCode).toBe(404)
    expect(direct.body).toContain(ROBOTICS)
  })

  it('carries enough of each fork to settle it without a second request', async () => {
    const forkId = await fileFork(PANELX, 'Should a fork be settleable from Home?')
    const held = await file(PANELX, 'task', 'Wire the desk to the projection')
    await link(PANELX, forkId, held, 'blocks')

    const fork = one((await forks()).forks, 'fork')
    expect(fork.question).toBe('Should the gripper close on contact, or on force?')
    expect(fork.options).toBe(2)
    // TWO FACTS SINCE 27 AUGUST 2026, and this fork carries both: a recommendation was written and
    // Mole Office can tell which option it points at.
    expect(fork.recommendationWritten).toBe(true)
    expect(fork.namesAnOption).toBe(true)
    // The work it is holding up, BY NAME. A count says whether it matters; the name says what it is.
    expect(fork.blocks.map((b) => b.title)).toEqual(['Wire the desk to the projection'])
    // The fork's own fields, as written, which is what the panel that settles it reads.
    expect(fork.fields['revisit_when']).toBe('A gripper with a compliant pad, which would make contact-close safe.')
    expect(fork.fields['evidence']).toEqual(['Two cups crushed on 12 August, both on contact-close.'])
    expect(fork.unreadable).toEqual([])
    // WHY IT IS ON THE OWNER'S LIST, AND IT IS NOW READ FROM THIS FORK RATHER THAN SAID OF ALL OF THEM.
    // This fork sets no `who_settles_it`, so the answer is the one nobody has given, and Mole Office
    // says that outright instead of inferring the owner from an empty field.
    //
    // THE ASSERTION USED TO BE `toContain('refuses it to every agent')`, from the single sentence
    // `WHY_A_PERSON` that was drawn on every row. That sentence stopped being true on 27 August
    // 2026, when a fork could say an agent settles it, and it was replaced by one sentence per
    // answer — `whoMaySettleThisFork` in src/server/lib/forks.ts.
    expect(fork.because).toContain('Nobody has said who settles this fork')
    expect(fork.because).toContain('an empty field is not permission')
  })

  it('says in the note how many are waiting and how many projects they are in', async () => {
    await fileFork(PANELX, 'One')
    await fileFork(ROBOTICS, 'Two')
    expect((await forks()).note).toContain('2 forks are waiting on you, in 2 projects')
  })

  it('agrees with GET /api/needs-you about which forks are open', async () => {
    await fileFork(PANELX, 'One')
    await fileFork(ROBOTICS, 'Two')

    const short = await app.inject({ method: 'GET', url: '/api/needs-you', headers: asPerson(PANELX) })
    const listed = (short.json() as NeedsYouReply).actions.map((a) => a.recordId)
    // One reading behind both. If they could disagree, the queue and the desk would disagree about
    // what is waiting on a person, on the same screen.
    expect((await forks()).forks.map((fork) => fork.recordId)).toEqual(listed)
  })

  it('says what it could not read on a fork rather than handing back a shorter one', async () => {
    const forkId = await fileFork(PANELX, 'Should the gripper close on contact?')
    // WRITTEN STRAIGHT INTO THE TABLE, going round the validation that would refuse it — the same
    // thing tests/helpers.ts does for a settling link, and for the same reason: rows restored from
    // an archive carry whatever they carried, and the reader is what has to defend itself.
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ question: 'Which one?', options: ['a — the first', { b: 'the second' }] }), forkId)

    const fork = one((await forks()).forks, 'fork')
    // The count is of what a person can actually read, and the difference is stated rather than
    // absorbed: two counted and one shown would be a queue promising a choice that is not there.
    expect(fork.options).toBe(1)
    expect(one(fork.unreadable, 'unreadable note')).toContain('1 of the 2 options on this fork is not text')
    expect((await forks()).note).toContain('could not be read')
  })
})

// ============================================================================ the first guard

describe('the projection is not a way to read another project', () => {
  /**
   * THE RECORD THIS TEST IS ABOUT. It lives in another project, nothing points at it, and no fork
   * mentions it. If a title like this can be got out of the projection then the projection has
   * become the cross-project record reader §39 exists to avoid building.
   */
  const SECRET = 'The load cell calibration nobody outside robotics should learn from this route'

  it('never names a record in another project that no fork points at', async () => {
    await fileFork(PANELX, 'Should a fork be settleable from Home?')
    const unrelated = await file(ROBOTICS, 'task', SECRET)

    const body = JSON.stringify(await forks(asPerson(PANELX)))
    expect(body).not.toContain(SECRET)
    expect(body).not.toContain(unrelated)
  })

  it('answers the same thing however the request is dressed up', async () => {
    await fileFork(PANELX, 'Should a fork be settleable from Home?')
    const unrelated = await file(ROBOTICS, 'task', SECRET)

    // THE ROUTE TAKES NOTHING, so there is nothing to aim. Every one of these is a caller trying to
    // name a record, a kind or a project, and the reply is identical to the plain one every time.
    const plain = JSON.stringify(await forks(asPerson(PANELX)))
    for (const query of [
      `?id=${unrelated}`,
      `?recordId=${unrelated}`,
      '?kind=task',
      `?workspace=${ROBOTICS}`,
      `?workspaceId=${ROBOTICS}`,
      '?q=load%20cell',
    ]) {
      const res = await app.inject({ method: 'GET', url: `/api/forks${query}`, headers: asPerson(PANELX) })
      expect(res.statusCode, `${query}: ${res.body}`).toBe(200)
      expect(res.body, `${query} changed the answer`).toBe(plain)
      expect(res.body, `${query} reached a record in another project`).not.toContain(SECRET)
    }
  })

  it('names a record in another project only when a fork there is holding it up', async () => {
    // The one way another project's record appears: the fork itself says it is holding it up. That
    // is the fork naming its own consequence, which is the same thing an allocation does in
    // planning — and it is the reason anybody can tell whether the fork matters today.
    const forkId = await fileFork(ROBOTICS, 'Should the gripper close on contact?')
    const held = await file(ROBOTICS, 'task', 'Calibrate the load cell')
    await link(ROBOTICS, forkId, held, 'blocks')
    const quiet = await file(ROBOTICS, 'task', SECRET)

    const body = JSON.stringify(await forks(asPerson(PANELX)))
    expect(body).toContain('Calibrate the load cell')
    // And the one beside it, in the same project, that no fork points at is still not readable here.
    expect(body).not.toContain(SECRET)
    expect(body).not.toContain(quiet)
  })
})

// ============================================================================ what you decided

/**
 * THE OTHER HALF OF THE PROJECTION: the decisions themselves, in every project.
 *
 * `settled` is the forks somebody answered. `decisions` is the larger list, because most decisions
 * in this corpus answer no proposal at all — they were filed on their own — and no reading of forks
 * can see one. Home draws its "what you decided" cards from it and so does `#/decisions`, and both
 * of them ask this one route rather than asking two and hoping the answers agree.
 */
describe('the decisions a person has already made', () => {
  it('carries a decision that answers no proposal, which no reading of forks can see', async () => {
    const before = await forks()
    const alone = await fileDecision(PANELX, 'Never change the GPU driver on the workstation', {
      because: 'The 5070 Ti is marginally stable and a driver change has cost two days before.',
    })
    const read = await forks()
    expect(read.forks).toEqual([])
    expect(addedSince(before.settled, read.settled, (one) => one.decisionId)).toEqual([])
    expect(addedSince(before.decisions, read.decisions, (one) => one.recordId).map((one) => one.recordId)).toEqual([alone])
  })

  it('answers across projects, like the forks beside it', async () => {
    const before = await forks()
    await fileDecision(PANELX, 'Timestamps are local wall-clock', { because: 'A day has to mean the operator day.' })
    await fileDecision(ROBOTICS, 'The gripper closes on force', { because: 'Two demos crushed a cup.' })
    const read = await forks(asPerson(PANELX))
    expect(addedSince(before.decisions, read.decisions, (one) => one.recordId).map((one) => one.workspaceId).sort()).toEqual([PANELX, ROBOTICS])
    expect(read.decisions.find((one) => one.workspaceId === ROBOTICS)?.workspaceTitle).toBe('Robotics')
  })

  it('says which of the fork options was taken, and says when none of them was', async () => {
    // design/DECISIONS-PENDING §38: a decision selects a recorded option or an explicit custom one.
    // `optionIndex` null with `optionTaken` filled is "none of these" — a real stored answer, and
    // the one a reader must be able to tell from "nobody recorded which".
    const before = await forks()
    const forkId = await fileFork(PANELX, 'How should the gripper close?')
    const done = await app.inject({
      method: 'POST',
      url: `/api/records/${forkId}/promote`,
      headers: asPerson(PANELX),
      payload: {
        title: 'Close on force',
        data: { because: 'The load cell is on the bench.', option_taken: 'b — Close on force', option_index: 1 },
      },
    })
    expect(done.statusCode, done.body).toBe(201)

    const read = await forks()
    const decided = one(addedSince(before.decisions, read.decisions, (one) => one.recordId), 'decision')
    expect(decided.optionTaken).toBe('b — Close on force')
    expect(decided.optionIndex).toBe(1)
    // The fork it answers, and the question, so a card can lead with what was being asked.
    expect(decided.proposalId).toBe(forkId)
    expect(decided.question).toBe('Should the gripper close on contact, or on force?')
  })

  it('says in the note that it carries them, so a caller is not left to discover the field', async () => {
    await fileDecision(PANELX, 'Timestamps are local wall-clock', { because: 'A day has to mean the operator day.' })
    expect((await forks()).note.length).toBeGreaterThan(0)
    const { FORKS_NOTE } = (await import('../src/server/api/forks.ts')) as typeof import('../src/server/api/forks.ts')
    expect(FORKS_NOTE).toContain('decisions')
  })
})

// ============================================================================ the second guard

describe('settling a fork found here is still refused to an agent', () => {
  it('refuses the agent that reads the projection and promotes what it found, and leaves the fork open', async () => {
    const forkId = await fileFork(ROBOTICS, 'Should the gripper close on contact?')

    // THE WHOLE WAY AN AGENT WOULD COME. The projection is a read and an agent may read it; what it
    // must not become is a way round the one access control in the product.
    const found = one((await forks(asAgent(PANELX))).forks, 'fork')
    expect(found.recordId).toBe(forkId)

    const tried = await app.inject({
      method: 'POST',
      url: `/api/records/${found.recordId}/promote`,
      headers: asAgent(found.workspaceId),
      payload: { title: 'Close on force', data: { because: 'The agent decided by itself.' } },
    })
    expect(tried.statusCode, tried.body).toBe(403)
    expect(tried.body).toContain('Only the human may promote a proposal')
    expect(tried.body).toContain('claude-code')

    // NOTHING WAS WRITTEN. A 403 that had already filed the decision would be the worst of both.
    const decisions = await app.inject({ method: 'GET', url: '/api/records?kind=decision', headers: asAgent(ROBOTICS) })
    expect((decisions.json() as { records: unknown[] }).records).toEqual([])
    // And the fork is still waiting, which is what the desk would draw a moment later.
    expect((await forks()).forks.map((fork) => fork.recordId)).toEqual([forkId])
  })

  it('lets the person settle it in the fork\'s own project, and moves it to settled', async () => {
    const before = await forks()
    const forkId = await fileFork(ROBOTICS, 'Should the gripper close on contact?')
    const found = one((await forks(asPerson(PANELX))).forks, 'fork')

    // THE DESK SENDS THE FORK'S OWN PROJECT, which is where the decision belongs and where the
    // guard is asked. It is the same route the record page posts to; there is no second way to
    // write a decision and this test would be the place a second one showed up.
    const done = await app.inject({
      method: 'POST',
      url: `/api/records/${found.recordId}/promote`,
      headers: asPerson(found.workspaceId),
      payload: { title: 'Close on force', data: { because: 'The load cell is on the bench.' } },
    })
    expect(done.statusCode, done.body).toBe(201)
    const decisionId = (done.json() as { decision: { id: string } }).decision.id

    const after = await forks()
    expect(after.forks).toEqual([])
    const settled = one(addedSince(before.settled, after.settled, (one) => one.decisionId), 'settled fork')
    expect(settled.proposalId).toBe(forkId)
    expect(settled.decisionId).toBe(decisionId)
    expect(settled.workspaceId).toBe(ROBOTICS)
    // NO FORK OPEN IS NOT NOTHING WAITING, so the note says it counts forks only (problem fnH7QaRvvkd9).
    expect(after.note).toBe(
      'No fork is open. This counts forks only; everything waiting on the person is at GET /api/waiting.',
    )

    // The decision landed in the fork's project, not in the one the reader happened to be in.
    const read = await app.inject({ method: 'GET', url: `/api/records/${decisionId}`, headers: asPerson(ROBOTICS) })
    expect(read.statusCode).toBe(200)
  })
})
