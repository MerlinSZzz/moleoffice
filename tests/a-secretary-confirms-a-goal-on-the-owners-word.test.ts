// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY CONFIRMS A GOAL ON THE OWNER'S WORD, NAMING THE EVIDENCE. A secretary may confirm a goal for
 * the owner when it names the evidence, the owner's message or decision that says so; the goal keeps who
 * pressed, on whose word, and the evidence.
 *
 * Before this, `assertMayConfirmAGoal` in src/server/lib/goals.ts refused every agent that wrote `confirmed_by`, warrant
 * or not, unless the owner had raised it for a period. Now a secretary may write it when the confirmation names the
 * person as `by`, the secretary itself as `pressed_by`, and the evidence: `decision:<id>`, a decision the owner made
 * that names the goal, or `message:<id>`, the owner's message, cited by a warrant on the same write.
 *
 * WHAT THIS FILE PROVES, over the record door, with agents registered on real cards:
 *   1. a secretary confirms a goal by the owner's decision that names it; the whole mark is kept, the goal leaves the
 *      person's waiting list, and the change row carries no warrant and no raise;
 *   2. a secretary confirms a goal by the owner's message, cited by a warrant, and the change row carries the warrant;
 *   3. a secretary is refused with no evidence, with a decision that does not name the goal, with its own decision,
 *      with a message and no warrant, with a warrant that cites another place, with evidence of another form, with
 *      `pressed_by` missing or naming somebody else, with `by` not naming the person, and when filing the goal
 *      already confirmed; the refusal for `pressed_by` says what it must hold, the name the request was made under,
 *      which is the handle it named or the registry id its key proved, and not always a handle;
 *   4. an agent that is not a secretary is refused with the owner's decision that names the goal;
 *   5. the person's own press still confirms a goal, and stores only who and when.
 *
 * MUTATIONS, each red here after a green control run:
 *   1. goals.ts, assertMayConfirmAGoal: never take the secretary's path. Both confirmations are refused.
 *   2. goals.ts, the secretary's questions: do not check `pressed_by`. It is written missing, and naming the worker.
 *   3. goals.ts, the secretary's questions: take any decision as the evidence. A decision that does not name the
 *      goal, and the secretary's own decision, are taken.
 *   4. goals.ts, the secretary's questions: do not check where the warrant points. A warrant citing another message
 *      is taken.
 *   5. records.ts, patchRecord: leave out the goal's id. Every secretary's change is refused as a new goal.
 *   6. goals.ts, assertMayConfirmAGoal: ask any agent the secretary's questions. The worker is let through.
 *   7. goals.ts, the secretary's questions: do not check `by`. A confirmation on the secretary's own word is written.
 *   8. goals.ts, the secretary's questions: tell the caller to write its own handle in `pressed_by` again. The case of
 *      `pressed_by` naming somebody else goes red.
 *
 * Everybody and everything here is made up. The database is the test's own.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The card that may act for the person, read from the declaration and never typed. */
function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }
  return said.elevation.onlyThisCardCanHoldIt
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

async function file(headers: Record<string, string>, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await ask('POST', '/api/records', headers, { kind, title, data })
  expect(made.status, made.said).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String((made.body['record'] as { id: string }).id)
}

/** A goal a worker filed, so it waits for the person's Confirm. */
function aWorkersGoal(title: string): Promise<string> {
  return file(asAgent('tamp'), 'goal', title, {
    horizon: 'medium',
    what: 'Every pot in the spring batch leaves the kiln without a crack.',
    owner: THE_PERSON,
    state: 'open',
  })
}

/** A decision the owner made, written down by the secretary from the owner's words filed as the owner's own note. */
async function theOwnersDecision(names: string | null): Promise<string> {
  const prepared = await file(asAgent('quill'), 'note', 'What the owner said about the spring goal', {
    body: 'Yes, that is the goal, said the owner on 12 October.',
    for_the_person_to_file: true,
  })
  const filed = await ask('POST', `/api/records/${prepared}/file-as-my-words`, AS_THE_PERSON)
  expect(filed.status, filed.said).toBe(200)
  const words = String((filed.body['note'] as { id: string }).id)
  return file(asAgent('quill'), 'decision', 'The spring goal is the owner’s', {
    replaces: [],
    decided_by: 'the owner',
    authority: 'the owner said so',
    authority_reference: words,
    option_taken: names === null ? 'The spring goal stands.' : `Goal ${names} stands as written.`,
    because: 'The owner said so on 12 October.',
  })
}

/** A message the person wrote to the secretary. */
function thePersonsMessage(body: string): Promise<string> {
  return file(AS_THE_PERSON, 'message', 'About the spring goal', { body, to: [{ kind: 'agent', id: 'quill' }] })
}

/** The person's words in that message, as a warrant for this one goal. */
function aWarrant(goal: string, message: string): Record<string, unknown> {
  return { saidBy: THE_PERSON, words: 'Yes, confirm the spring goal.', where: `message:${message}`, when: '2026-10-12 21:06', for: [goal] }
}

function confirm(headers: Record<string, string>, goal: string, mark: Record<string, unknown>, warrant?: Record<string, unknown>) {
  return ask('PATCH', `/api/records/${goal}`, headers, {
    dataPatch: { confirmed_by: mark },
    ...(warrant === undefined ? {} : { warrant }),
  })
}

async function theMark(goal: string): Promise<unknown> {
  const back = await ask('GET', `/api/records/${goal}`, AS_THE_PERSON)
  expect(back.status, back.said).toBe(200)
  return (back.body['record'] as { data: Record<string, unknown> }).data['confirmed_by']
}

async function waitsForThePerson(goal: string): Promise<boolean> {
  const reply = await ask('GET', '/api/waiting', AS_THE_PERSON)
  expect(reply.status, reply.said).toBe(200)
  return (reply.body['items'] as { id: string; kind: string }[]).some((one) => one.kind === 'goal' && one.id === goal)
}

function theChangeRows(goal: string): { actor_type: string; actor_id: string; warrant: string | null; elevation: string | null }[] {
  return t.client.sqlite
    .prepare("SELECT actor_type, actor_id, warrant, elevation FROM changes WHERE record_id = ? AND field LIKE 'data.confirmed_by%'")
    .all(goal) as { actor_type: string; actor_id: string; warrant: string | null; elevation: string | null }[]
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'quill', name: 'Quill', role: theSecretaryCard() })
  expect(started.status, started.said).toBe(201)
  const worker = await ask('POST', '/api/agents/started', asAgent('quill'), {
    handle: 'tamp',
    name: 'Tamp',
    role: 'worker',
    workArea: ['src'],
  })
  expect(worker.status, worker.said).toBe(201)
}, 120_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('a secretary confirms a goal on the owner’s word', () => {
  it('confirms it by the owner’s decision that names it, keeps the whole mark, and the goal stops waiting', async () => {
    const goal = await aWorkersGoal('No cracked pots in the spring batch')
    const decision = await theOwnersDecision(goal)
    expect(await waitsForThePerson(goal)).toBe(true)

    const mark = { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${decision}` }
    const done = await confirm(asAgent('quill'), goal, mark)
    expect(done.status, done.said).toBe(200)
    expect(await theMark(goal)).toEqual(mark)
    expect(await waitsForThePerson(goal)).toBe(false)

    // THE ACT IS THE SECRETARY'S OWN, on the evidence it names: no warrant and no raise on the change row.
    const rows = theChangeRows(goal)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row).toEqual({ actor_type: 'agent', actor_id: 'quill', warrant: null, elevation: null })
  })

  it('confirms it by the owner’s message, cited by a warrant, and the change row keeps the warrant', async () => {
    const goal = await aWorkersGoal('No warped plates in the spring batch')
    const message = await thePersonsMessage('Yes, confirm the spring goal.')

    const mark = { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `message:${message}` }
    const done = await confirm(asAgent('quill'), goal, mark, aWarrant(goal, message))
    expect(done.status, done.said).toBe(200)
    expect(await theMark(goal)).toEqual(mark)
    expect(await waitsForThePerson(goal)).toBe(false)

    const rows = theChangeRows(goal)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(String(row.warrant)).toContain(`message:${message}`)
  })
})

describe('a secretary is refused when the evidence does not hold', () => {
  it('is refused with no evidence at all', async () => {
    const goal = await aWorkersGoal('No glaze runs in the spring batch')
    const refused = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill' })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('confirmed_by')
    expect(refused.said).toContain('evidence')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused with the owner’s decision that does not name the goal', async () => {
    const goal = await aWorkersGoal('No pinholes in the spring batch')
    const decision = await theOwnersDecision(null)
    const refused = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${decision}` })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('names this goal')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused with its own decision, even one that names the goal', async () => {
    const goal = await aWorkersGoal('No crawling glaze in the spring batch')
    const own = await file(asAgent('quill'), 'decision', 'The spring goal stands', {
      replaces: [],
      decided_by: 'quill',
      authority: 'a measurement',
      authority_reference: 'Two firings without a crawl.',
      option_taken: `Goal ${goal} stands.`,
      because: 'Measured over two firings.',
    })
    const refused = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${own}` })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('a live decision the person made')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused with the owner’s message and no warrant, or a warrant that cites another place', async () => {
    const goal = await aWorkersGoal('No dunting in the spring batch')
    const message = await thePersonsMessage('Yes, confirm the spring goal.')
    const other = await thePersonsMessage('The kiln is booked for Friday.')
    const mark = { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `message:${message}` }

    const bare = await confirm(asAgent('quill'), goal, mark)
    expect(bare.status, bare.said).toBe(403)
    expect(bare.said).toContain('carries no warrant')

    const elsewhere = await confirm(asAgent('quill'), goal, mark, aWarrant(goal, other))
    expect(elsewhere.status, elsewhere.said).toBe(403)
    expect(elsewhere.said).toContain(`cites "message:${other}"`)
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused with evidence of any other form', async () => {
    const goal = await aWorkersGoal('No shivering in the spring batch')
    const refused = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: 'terminal' })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('decision:')
    expect(refused.said).toContain('message:')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused when pressed_by is missing or names somebody else', async () => {
    const goal = await aWorkersGoal('No blistering in the spring batch')
    const decision = await theOwnersDecision(goal)
    const missing = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', evidence: `decision:${decision}` })
    expect(missing.status, missing.said).toBe(403)
    expect(missing.said).toContain('pressed_by')

    const another = await confirm(asAgent('quill'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'tamp', evidence: `decision:${decision}` })
    expect(another.status, another.said).toBe(403)
    expect(another.said).toContain('pressed_by')
    expect(another.said).toContain('the name this request was made under')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused when by does not name the person', async () => {
    const goal = await aWorkersGoal('No bloating in the spring batch')
    const decision = await theOwnersDecision(goal)
    const refused = await confirm(asAgent('quill'), goal, { by: 'quill', at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${decision}` })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('"by"')
    expect(await theMark(goal)).toBeUndefined()
  })

  it('is refused when filing a goal already confirmed', async () => {
    const decision = await theOwnersDecision(null)
    const made = await ask('POST', '/api/records', asAgent('quill'), {
      kind: 'goal',
      title: 'No dust on the spring batch',
      data: {
        horizon: 'medium',
        what: 'Every pot in the spring batch is free of dust.',
        owner: THE_PERSON,
        state: 'open',
        confirmed_by: { by: THE_PERSON, at: '2026-10-12', pressed_by: 'quill', evidence: `decision:${decision}` },
      },
    })
    expect(made.status, made.said).toBe(403)
    expect(made.said).toContain('File the goal first')
  })
})

describe('an agent that is not a secretary is refused', () => {
  it('is refused with the owner’s decision that names the goal', async () => {
    const goal = await aWorkersGoal('No scratches on the spring batch')
    const decision = await theOwnersDecision(goal)
    const refused = await confirm(asAgent('tamp'), goal, { by: THE_PERSON, at: '2026-10-12', pressed_by: 'tamp', evidence: `decision:${decision}` })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('confirmed_by')
    expect(await theMark(goal)).toBeUndefined()
  })
})

describe('the person still confirms a goal', () => {
  it('confirms it with a press that stores who and when', async () => {
    const goal = await aWorkersGoal('No chips on the spring batch')
    const done = await confirm(AS_THE_PERSON, goal, { by: THE_PERSON, at: '2026-10-12' })
    expect(done.status, done.said).toBe(200)
    expect(await theMark(goal)).toEqual({ by: THE_PERSON, at: '2026-10-12' })
    expect(await waitsForThePerson(goal)).toBe(false)
  })
})
