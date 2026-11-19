// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION THAT SETTLES A FORK FILES THE WORK IT CREATES, AND NOBODY OWES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * THE ANSWER to who owes the work a decision makes:
 *
 * The work belongs to the project; whoever is given that part is whose it is; it is not the
 * proposer's for having asked the question. Criteria P32 to P35 of design/permissions/ACCEPTANCE.md,
 * designed in its section 3.7.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Measured on a copy of the owner's corpus on 7 September 2026: 113 decisions settle a fork and not one of
 * them has a task. Settling a fork wrote the answer and nothing at all about the work the answer
 * makes, so an agent arriving afterwards met a decided question and no work.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH CASE HOLDS, AND WHY IT IS NOT ONE CASE
 * ---------------------------------------------------------------------------------------
 *
 * P32 is the kind and the shape: a `task`, one of them, linked to the decision, with nobody at the
 * other end. Filing an `obligation` would pass a test that only counted records.
 * P33 is the words, and it has two halves that fail in opposite directions: a fork that wrote
 * `resultWillBeUsedTo` and one that did not. A rule that invented words for the second would look
 * right on the first.
 * P34 is that a claim is the assignment, which needed no new mechanism — so the test drives the
 * claim doors that already exist rather than asserting about a field.
 * P35 is the negative: the proposer is not on the task. It is checked over every stored word of the
 * record, because "not in a field called owner" is not the same as "not named".
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { theWorkADecisionCreates } from '../src/shared/decisionwork.ts'

let t: TestDb
let app: FastifyInstance

/**
 * A project for the case alone. The cases count the tasks and obligations in the project before and
 * after a promotion, so a task another case's fork created would change the count. Each case files
 * its own fork and reads its own project.
 */
let PROJECT = 'default'
let caseNumber = 0

/** The agent that files the fork. It must be nowhere on the work the decision creates. */
const THE_PROPOSER = 'claude-code/the-one-that-asked'

let AS_THE_PROPOSER: Record<string, string>
let AS_PERSON: Record<string, string>
let AS_SOMEBODY_ELSE: Record<string, string>

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
  PROJECT = `decision-work-case-${String(caseNumber)}`
  AS_THE_PROPOSER = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_PROPOSER,
    'x-mole-office-workspace': PROJECT,
  }
  AS_PERSON = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': PROJECT,
  }
  AS_SOMEBODY_ELSE = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'the-one-that-took-it',
    'x-mole-office-workspace': PROJECT,
  }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'A project for one case' } })
  expect(made.statusCode, made.body).toBe(201)
})

/** A fork the proposer filed, with or without saying what the answer would be used for. */
function aFork(question: string, resultWillBeUsedTo?: string): string {
  const data: Record<string, unknown> = { question, options: ['a — one way', 'b — the other'] }
  if (resultWillBeUsedTo !== undefined) data['resultWillBeUsedTo'] = resultWillBeUsedTo
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'proposal',
    title: `Fork · ${question}`,
    data,
    actor: { type: 'agent', id: THE_PROPOSER },
  }).id
}

interface Promoted {
  status: number
  error: string
  decision: { id: string }
  work: { task: { id: string; title: string; summary: string | null; kind: string; data: Record<string, unknown> }; fromTheFork: boolean }
  note: string
}

async function promote(forkId: string, title: string): Promise<Promoted> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${forkId}/promote`,
    headers: AS_PERSON,
    payload: { title, data: { because: 'the owner said so' } },
  })
  const body = res.json() as Partial<Promoted> & { error?: string }
  return {
    status: res.statusCode,
    error: body.error ?? '',
    decision: body.decision ?? { id: '' },
    work: body.work ?? { task: { id: '', title: '', summary: null, kind: '', data: {} }, fromTheFork: false },
    note: body.note ?? '',
  }
}

/** Every record of a kind that is live in the project, out of the database. */
function every(kind: RecordKind): { id: string; title: string; summary: string | null; data: Record<string, unknown> }[] {
  return t.api.listRecords({ workspaceId: PROJECT, kind }) as unknown as {
    id: string
    title: string
    summary: string | null
    data: Record<string, unknown>
  }[]
}

/** The links stored on a record, both directions, as the record read gives them. */
async function linksOn(id: string): Promise<{ type: string; isBacklink: boolean; other: { id: string; kind: string } | null }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_PERSON })
  const body = res.json() as {
    links?: { type: string; isBacklink: boolean; other?: { id: string; kind: string } | null }[]
  }
  return (body.links ?? []).map((one) => ({ type: one.type, isBacklink: one.isBacklink, other: one.other ?? null }))
}

async function claimsOn(id: string): Promise<{ claimant: { kind: string; id: string } }[]> {
  const res = await app.inject({ method: 'GET', url: `/api/claims/on/${id}`, headers: AS_PERSON })
  const body = res.json() as { claims?: { claimant: { kind: string; id: string } }[] }
  return body.claims ?? []
}

// ================================================== P32 — a task, one of them, owed by nobody

describe('a decision that settles a fork files a task owed by nobody', () => {
  it('files exactly one task, linked to the decision, and no obligation at all', async () => {
    const fork = aFork('Does an orphaned session count as over?', 'Rewrite the session sweeper so it says orphaned')
    expect(every('task'), 'nothing has filed a task before the fork is settled').toHaveLength(0)

    const done = await promote(fork, 'An orphaned session counts as over')
    expect(done.status, done.error).toBe(201)

    const tasks = every('task')
    expect(tasks, 'one settled fork files one task').toHaveLength(1)
    expect(every('obligation'), 'the work is the project’s, so it is a task and never an obligation').toHaveLength(0)
    expect(done.work.task.id).toBe(tasks[0]?.id)
    expect(done.work.task.kind).toBe('task')

    const links = await linksOn(done.work.task.id)
    const toTheDecision = links.filter((one) => one.other?.id === done.decision.id)
    expect(toTheDecision, 'the task says which decision it came out of').toHaveLength(1)
    expect(toTheDecision[0]?.type).toBe('derived_from')
    expect(toTheDecision[0]?.isBacklink, 'the link is stored on the task, pointing at the decision').toBe(false)
  })

  it('leaves the task with nobody at the other end and nothing that could make it late', () => {
    // The `task` kind declares no `owedTo` and no `due`, so this is what the record actually holds
    // rather than a convention: a field that could name somebody does not exist on it.
    const fork = aFork('Should a stale claim be a problem?', 'Add the stale-claim reading to the claims page')
    return promote(fork, 'A stale claim is a problem').then(async (done) => {
      expect(done.status, done.error).toBe(201)
      const stored = t.api.getRecord(done.work.task.id) as { data: Record<string, unknown> }
      expect(stored.data['owedTo'], 'nobody owes it').toBeUndefined()
      expect(stored.data['due'], 'nothing makes it late').toBeUndefined()
      expect(stored.data['whose_move'], 'nobody has said whose move it is, which is a real answer').toBeUndefined()
      expect(stored.data['state']).toBe('todo')
      expect(await claimsOn(done.work.task.id), 'nobody has claimed it yet').toHaveLength(0)
    })
  })

  it('says in the reply what it filed and how it becomes somebody’s', async () => {
    const fork = aFork('Do groups follow the pool?', 'Move the old groups into the pool')
    const done = await promote(fork, 'Groups follow the pool')
    expect(done.status, done.error).toBe(201)
    expect(done.note).toContain(done.work.task.id)
    expect(done.note).toContain('POST /api/claims')
  })
})

// ================================================== P33 — the words are the fork's, or say they are not

describe('the task’s words are the fork’s own, and say so when the fork wrote none', () => {
  it('takes the fork’s resultWillBeUsedTo unchanged as the task’s title', async () => {
    const words = 'Rewrite chapter 7 rule 2 so a lead may cross projects and a comment may not'
    const fork = aFork('May a lead cross projects?', words)
    const done = await promote(fork, 'A lead may cross projects and a comment may not')
    expect(done.status, done.error).toBe(201)
    expect(done.work.fromTheFork).toBe(true)
    expect(done.work.task.title, 'the fork’s own sentence, not a sentence written for it').toBe(words)
    expect(done.work.task.summary ?? '').toContain("the fork's own words")
  })

  it('says nobody wrote it down when the fork left the field out, and invents nothing', async () => {
    const fork = aFork('Should the inspector stay on the tree?')
    const done = await promote(fork, 'The inspector is off the tree')
    expect(done.status, done.error).toBe(201)
    expect(done.work.fromTheFork).toBe(false)
    expect(done.work.task.title).toContain('The inspector is off the tree')
    expect(done.work.task.summary ?? '', 'the absence is the answer, said in the record itself').toContain(
      'nobody has written what that work is',
    )
    // AND NOTHING FROM THE FORK IS PUT THERE INSTEAD. The question, the options and the fork's title
    // are the proposer's words about a choice, not a description of work, and copying one in would
    // be exactly the invention the rule forbids.
    expect(done.work.task.title).not.toContain('Should the inspector stay')
    expect(done.work.task.summary ?? '').not.toContain('Should the inspector stay')
  })

  it('is the same rule the backfill tool reads, worked out in one place', () => {
    const both = theWorkADecisionCreates({ decisionTitle: 'A title', forkData: { resultWillBeUsedTo: 'Do the thing' } })
    expect(both.title).toBe('Do the thing')
    expect(both.fromTheFork).toBe(true)
    const neither = theWorkADecisionCreates({ decisionTitle: 'A title', forkData: {} })
    expect(neither.fromTheFork).toBe(false)
    expect(neither.title).toContain('A title')
  })
})

// ================================================== P34 — the claim is the assignment

describe('whoever takes the work claims it, and the claim is the assignment', () => {
  it('names nobody before anybody claims it, and names the holder after', async () => {
    const fork = aFork('Does a retired agent keep its inbox?', 'Keep the inbox on a retired agent and say so on its row')
    const done = await promote(fork, 'A retired agent keeps its inbox')
    expect(done.status, done.error).toBe(201)
    const task = done.work.task.id

    expect(await claimsOn(task), 'before anybody takes it, it is nobody’s').toHaveLength(0)

    // The taker registers and files a run, because a claim is made by somebody Mole Office holds.
    const taker = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'agent',
      title: 'The one that took it',
      data: { handle: 'the-one-that-took-it', role: 'worker', workArea: ['src'] },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    })
    const run = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'session',
      title: 'A run that took the work',
      data: { state: 'running' },
      actor: { type: 'agent', id: 'the-one-that-took-it' },
    }).id

    const filed = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: AS_SOMEBODY_ELSE,
      payload: { run, things: [{ what: 'record', id: task }] },
    })
    expect(filed.statusCode, filed.body).toBe(201)

    const held = await claimsOn(task)
    expect(held, 'the claim is what makes it somebody’s').toHaveLength(1)
    // THE CLAIM HOLDS THE ID THE REGISTRY GAVE THE TAKER, which is not its handle.
    const takerId = (
      t.client.sqlite.prepare('SELECT agent_id FROM agent_records WHERE record_id = ?').get(taker.id) as { agent_id: string }
    ).agent_id
    expect(held[0]?.claimant.id).toBe(takerId)
  })
})

// ================================================== P35 — the proposer is not named on it

describe('the agent that filed the fork is not named on the work', () => {
  it('has the proposer’s handle nowhere on the task, in any field', async () => {
    const fork = aFork('Should a world say whose it is?', 'Put the world’s claim to be the owner’s on the Embassy row')
    const done = await promote(fork, 'A world’s claim to be the owner’s is a claim')
    expect(done.status, done.error).toBe(201)

    const stored = t.api.getRecord(done.work.task.id) as {
      title: string
      summary: string | null
      data: Record<string, unknown>
    }
    const everyStoredWord = JSON.stringify(stored)
    expect(everyStoredWord, 'the proposer owes nothing for having asked').not.toContain(THE_PROPOSER)
    expect(everyStoredWord).not.toContain('the-one-that-asked')
  })

  it('does not ask the proposer either: no claim is filed for it', async () => {
    const fork = aFork('Does a visitor keep its history?', 'Mark the credential ended and keep the rows')
    const done = await promote(fork, 'A visitor that becomes a citizen keeps its visit history')
    expect(done.status, done.error).toBe(201)
    const held = await claimsOn(done.work.task.id)
    expect(held, 'nothing was assigned to anybody, least of all the proposer').toHaveLength(0)
  })

  it('files the fork as the proposer and the work as nobody’s, in one promotion', async () => {
    const fork = aFork('Is a chapter a record?', 'Write the chapters as records and generate the file')
    const beforeTasks = every('task').length
    const done = await promote(fork, 'A chapter is a record and the record is the only authority')
    expect(done.status, done.error).toBe(201)
    expect(every('task')).toHaveLength(beforeTasks + 1)
    // The proposer filed the fork and is on the fork's own change row; that is where it belongs.
    const fromTheProposer = await app.inject({ method: 'GET', url: `/api/records/${fork}`, headers: AS_THE_PROPOSER })
    expect(fromTheProposer.statusCode).toBe(200)
  })
})
