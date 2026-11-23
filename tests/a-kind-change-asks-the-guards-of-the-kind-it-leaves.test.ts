// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING A RECORD'S KIND MAY NOT WALK AROUND THE GUARDS PROTECTING THE KIND IT WAS.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE, MEASURED OVER REAL HTTP AND NOT REASONED ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the running server on 27 August 2026, as an agent, on throwaway records, against a
 * copy of the owner's own corpus:
 *
 *     PATCH /api/records/<a fork marked "the owner">  {"kind":"note"}   200, and the fork was gone
 *                                                                      from GET /api/needs-you
 *     PATCH /api/records/<a decision>                 {"kind":"note"}   200, and the record was then
 *                                                                      deletable, which a decision is not
 *     DELETE /api/records/<that record>                                 200
 *
 * Problem `hB6JxFlaEvrU`. Three guards protect those two kinds and each is asked by the route that
 * performs the act it is named for — `assertMayRemoveAFork` and the human-only rule by DELETE,
 * `assertMayReclassifyAFork` by the PATCH that writes `who_settles_it`. None was asked when a PATCH
 * moved the record out of the kind they protect, because every one of them reads the kind the
 * record has NOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. The kind change is refused wherever the delete would be refused, and the refusal says what
 *      was actually asked for rather than describing a deletion nobody sent.
 *   2. The record is exactly as it was afterwards, and still in the queue it was in.
 *   3. The two-step attack is closed at the first step: the kind change is refused, and the delete
 *      after it is still refused.
 *   4. A person may do all of it, and an ordinary kind change between kinds nothing guards is
 *      untouched. A guard that refused that would make correcting a mis-typed kind impossible.
 *
 * IT IS THE SEQUENCE THAT IS ASSERTED. Each case presses the buttons in order and reads the record
 * back, because what matters is not one status code but whether the record still stands at the end.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance

let PROJECT = 'panelx'

const asAgent: Record<string, string> = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': PROJECT,
}
const asPerson: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}
/** A request that names nobody. Owner decision §36: that is not evidence a person made it. */
const namingNobody: Record<string, string> = { 'x-mole-office-workspace': PROJECT }

let caseNumber = 0

/** The office is made once for the file. Each case gets its own project, and its own queue. */
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
  PROJECT = `guard-case-${String(caseNumber)}`
  for (const headers of [asAgent, asPerson, namingNobody]) headers['x-mole-office-workspace'] = PROJECT
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: PROJECT, title: `Guard case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

async function file(
  kind: string,
  title: string,
  data: Record<string, unknown>,
  headers: Record<string, string> = asAgent,
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

const fork = (title: string, settles?: string): Promise<string> =>
  file('proposal', title, {
    question: `${title}?`,
    options: ['a — one way', 'b — the other'],
    ...(settles === undefined ? {} : { who_settles_it: settles }),
  })

/** A decision an agent may write: it says what it stands on. */
const decision = (title: string): Promise<string> =>
  file('decision', title, {
    ...governsTheWholeProject(), replaces: [], because: 'The measurement is in the record.', authority: 'a measurement', decided_by: 'claude-code' })

interface Answer {
  statusCode: number
  message: string
}

function readAnswer(res: { statusCode: number; body: string; json: () => unknown }): Answer {
  let message = res.body
  try {
    const parsed = res.json() as { error?: string; message?: string; detail?: string }
    message = `${parsed.message ?? ''} ${parsed.error ?? ''} ${parsed.detail ?? ''}`
  } catch {
    /* the body is not JSON; the raw body is the message */
  }
  return { statusCode: res.statusCode, message }
}

async function changeKind(id: string, kind: string, headers: Record<string, string> = asAgent): Promise<Answer> {
  return readAnswer(await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { kind } }))
}

async function remove(id: string, headers: Record<string, string> = asAgent): Promise<Answer> {
  return readAnswer(await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers }))
}

/** What the record IS now, read back rather than trusted from a reply. */
async function kindOf(id: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: asAgent })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { kind: string } }).record.kind
}

/** The ids still waiting on a person. */
async function waitingOnTheOwner(): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/forks', headers: asAgent })
  return (res.json() as { forks: { recordId: string }[] }).forks.map((one) => one.recordId)
}

describe('a fork nobody has answered', () => {
  it('may not be changed into a note, and stays in the queue', async () => {
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const refused = await changeKind(theirs, 'note')
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('Changing an unsettled proposal into a note')
    expect(refused.message).toContain('only a person may answer')
    expect(await kindOf(theirs)).toBe('proposal')
    expect(await waitingOnTheOwner(), 'the fork left the queue anyway').toContain(theirs)
  })

  it('is refused whether or not anybody has classified it', async () => {
    const unclassified = await fork('Should the tailnet hop be issued at all')
    const refused = await changeKind(unclassified, 'note')
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await kindOf(unclassified)).toBe('proposal')

    // AND ON A FORK THE CORPUS SAYS AN AGENT SETTLES. Deleting one of those is refused too — the
    // rule is about the question being open, not about whose question it is — so this is refused
    // in the same words rather than being a hole the classification opens.
    const mine = await fork('Which repository are the module claims relative to', 'an agent')
    expect((await changeKind(mine, 'note')).statusCode).toBe(403)
    expect(await kindOf(mine)).toBe('proposal')
  })

  it('does not tell the caller a delete was refused, because it did not ask for one', async () => {
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const refused = await changeKind(theirs, 'note')
    expect(refused.message, 'the refusal describes an act nobody asked for').not.toContain('Deleting an unsettled')
  })

  it('says the same thing on the delete, so the second step is closed as well', async () => {
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    expect((await changeKind(theirs, 'note')).statusCode).toBe(403)
    const alsoRefused = await remove(theirs)
    expect(alsoRefused.statusCode, alsoRefused.message).toBe(403)
    expect(alsoRefused.message).toContain('Deleting an unsettled proposal')
    expect(await kindOf(theirs)).toBe('proposal')
    expect(await waitingOnTheOwner()).toContain(theirs)
  })

  it('is refused to a request that names nobody', async () => {
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const refused = await changeKind(theirs, 'note', namingNobody)
    expect(refused.statusCode, refused.message).toBe(403)
    expect(await kindOf(theirs)).toBe('proposal')
  })

  it('is the person’s to make, and they are refused none of it', async () => {
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const made = await changeKind(theirs, 'note', asPerson)
    expect(made.statusCode, made.message).toBe(200)
    expect(await kindOf(theirs)).toBe('note')
  })
})

describe('a fork the owner reserved, after it has been answered', () => {
  it('may not be changed into a note either, and the refusal names the settled state', async () => {
    // TWO GUARDS REFUSE THIS NOW, AND THE FIRST ONE CHANGED ON 27 AUGUST 2026. `assertMayRemoveAFork`
    // used to let any SETTLED fork go, on the argument that deleting one takes nothing off the owner's
    // queue. An adversary used that: it deleted a fork the owner had settled one request earlier,
    // 200, and the pair vanished from every fork reading. A settled fork is still the owner's record and
    // the decision beside it is still the owner's, so the guard now refuses a fork that is the owner's whether or
    // not it has been answered — and it is the one that answers first.
    //
    // `assertMayReclassifyAFork` is still behind it and still refuses the same write for its own
    // reason, which the next test asserts on an unsettled fork.
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const answer = await file(
      'decision',
      'A module card is a boundary',
      {
        ...governsTheWholeProject(),
        replaces: [], because: 'They said so on the call.', authority: 'the owner said so', authority_reference: 'the call on 20 August', decided_by: THE_OWNER },
      asPerson,
    )
    const settled = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asPerson,
      payload: { fromId: answer, toId: theirs, type: 'derived_from' },
    })
    expect(settled.statusCode, settled.body).toBe(201)

    const refused = await changeKind(theirs, 'note')
    expect(refused.statusCode, refused.message).toBe(403)
    // AND THE REFUSAL SAYS WHERE THE FORK ACTUALLY STANDS. It used to say "still open, still in
    // GET /api/needs-you" about every fork it refused, which is false about this one.
    expect(refused.message).toContain('nobody is waiting on any more')
    expect(refused.message).toContain('already settled')
    expect(refused.message, 'the refusal calls a settled fork open').not.toContain('still open')
    expect(await kindOf(theirs)).toBe('proposal')
  })
})

describe('a decision, which is the one kind only the person may write', () => {
  it('may not be changed into a note by an agent', async () => {
    const made = await decision('The wrist camera is recalibrated before every replay')
    const refused = await changeKind(made, 'note')
    expect(refused.statusCode, refused.message).toBe(403)
    expect(refused.message).toContain('Only the human may change a decision into something else')
    expect(refused.message).toContain('WHY THIS IS THE SAME ACT AS DELETING IT')
    expect(await kindOf(made)).toBe('decision')
  })

  it('may not be changed into a claim either, and the kind it becomes is not the question', async () => {
    const made = await decision('The wrist camera is recalibrated before every replay')
    expect((await changeKind(made, 'claim')).statusCode).toBe(403)
    expect(await kindOf(made)).toBe('decision')
  })

  it('is still not deletable after the kind change is refused', async () => {
    const made = await decision('The wrist camera is recalibrated before every replay')
    expect((await changeKind(made, 'note')).statusCode).toBe(403)
    const alsoRefused = await remove(made)
    expect(alsoRefused.statusCode, alsoRefused.message).toBe(403)
    expect(alsoRefused.message).toContain('Only the human may delete a decision')
    expect(await kindOf(made)).toBe('decision')
  })

  it('names the fork an agent writes instead', async () => {
    const made = await decision('The wrist camera is recalibrated before every replay')
    const refused = await changeKind(made, 'note')
    expect(refused.message).toContain('POST /api/records {"kind":"proposal"')
    expect(refused.message).toContain('should stop being one')
  })

  it('is the person’s to make', async () => {
    const made = await file(
      'decision',
      'The wrist camera is recalibrated before every replay',
      {
        ...governsTheWholeProject(),
        replaces: [], because: 'They said so.', authority: 'the owner said so', authority_reference: 'the call on 20 August', decided_by: THE_OWNER },
      asPerson,
    )
    expect((await changeKind(made, 'note', asPerson)).statusCode).toBe(200)
    expect(await kindOf(made)).toBe('note')
  })
})

describe('what is deliberately untouched, because a guard that refuses everything is a lock', () => {
  it('lets an agent correct a mis-typed kind between kinds nothing guards', async () => {
    const note = await file('note', 'Recalibrate the wrist camera', { body: 'It should have been filed as work.' })
    const made = await changeKind(note, 'task')
    expect(made.statusCode, made.message).toBe(200)
    expect(await kindOf(note)).toBe('task')
  })

  it('lets an agent change a note into a proposal, because nothing guards a note', async () => {
    const note = await file('note', 'Position control or force control', { body: 'This is really a fork.' })
    const made = await app.inject({
      method: 'PATCH',
      url: `/api/records/${note}`,
      headers: asAgent,
      payload: { kind: 'proposal' },
    })
    expect(made.statusCode, made.body).toBe(200)
    expect(await kindOf(note)).toBe('proposal')
  })

  it('does not fire when the kind is not changing', async () => {
    // A PATCH asking for the kind the record already has is asking for a state it is already in.
    const theirs = await fork('Is a module card a boundary', THE_OWNER)
    const same = await changeKind(theirs, 'proposal')
    expect(same.statusCode, same.message).toBe(200)
    expect(await kindOf(theirs)).toBe('proposal')
  })
})

