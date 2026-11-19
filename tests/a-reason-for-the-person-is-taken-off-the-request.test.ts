// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REASON A SECRETARY GIVES FOR A PRESS UNDER THE PERSON'S GRANT IS TAKEN OFF THE REQUEST BEFORE THE DOOR READS IT.
 * Wave 13s round 1. The agreed flow design, section 7: each press
 * under the grant gives its reason.
 *
 * The reason travels as `"forThePerson": {"reason": "…"}` in the body, or as `forThePerson.reason=…` in the query of a
 * request with no body. `takeTheReasonForThePerson` in src/server/lib/for-the-person.ts takes it off before every door,
 * so no door's own schema changes, and refuses with a 400, nothing done:
 *   - a reason in both the body and the query;
 *   - a reason on the person's own request;
 *   - a reason that is empty, longer than the limit, or not an object holding one `reason`;
 *   - a key in the query spelt another way, or the reason given there twice.
 * A reason from an agent that holds no grant is kept and nothing reads it.
 *
 * MUTATION, after a control run (the report of the run that added this file):
 *   · the field left on the body → "takes the reason off the body", "takes a reason of the longest length" and "keeps
 *     the reason of an agent that holds no grant" are red, because each door refuses a field it does not know;
 *   · the person's request let through with a reason → "refuses a reason on the person's own request" is red;
 *   · the both-places refusal taken out → "refuses a reason given in the body and in the query" is red;
 *   · the misspelt-key refusal taken out → "refuses a key spelt another way" is red;
 *   · the repeated-key refusal taken out → "refuses the reason given twice in the query" is red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import {
  A_TESTS_REASON_FOR_THE_PERSON,
  apiApp,
  freshDb,
  FOR_THE_PERSON,
  FOR_THE_PERSON_IN_THE_QUERY,
  thePersonsKeyHeader,
  type TestDb,
} from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
/** The longest reason, THE_LONGEST_REASON_FOR_THE_PERSON in src/server/lib/records.ts. */
const THE_LONGEST = 1000

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

function thePresses(): { operation: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT operation, reason FROM presses_for_the_person ORDER BY rowid').all() as { operation: string; reason: string | null }[]
}

function theChangeRows(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
}

async function aForkTheOwnerReserved(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(SECRETARY), {
    kind: 'proposal',
    title,
    data: { question: 'Which of the two?', options: ['One', 'The other'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

function promote(fork: string, headers: Record<string, string>, extra: Record<string, unknown> = {}, query = '') {
  return ask('POST', `/api/records/${fork}/promote${query}`, headers, {
    ...extra,
    title: 'What was chosen',
    data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them, and this is the reasoning.' },
  })
}

/** A decision the person wrote. Deleting one is an act only the grant opens to the secretary. */
async function aDecisionThePersonWrote(): Promise<string> {
  const made = await ask('POST', '/api/records', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, {
    kind: 'decision',
    title: 'A decision filed by mistake',
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It was filed by mistake.' },
  })
  expect(made.status, made.said).toBe(201)
  return String((made.body['record'] as { id: string }).id)
}

/** A promote refused with a 400, saying this, that wrote nothing. */
async function refusedAndNothingWritten(said: string, send: (fork: string) => ReturnType<typeof ask>): Promise<void> {
  const fork = await aForkTheOwnerReserved('A fork pressed with a reason the office cannot use')
  const presses = thePresses().length
  const rows = theChangeRows()
  const no = await send(fork)
  expect(no.status, no.said).toBe(400)
  expect(no.said).toContain(said)
  expect(no.said).toContain('Nothing was done.')
  expect(thePresses()).toHaveLength(presses)
  expect(theChangeRows()).toBe(rows)
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).status).toBe(201)
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'a-worker', name: 'A worker', role: 'worker', workArea: ['src'] })).status).toBe(201)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('where the reason travels', () => {
  it('takes the reason off the body, so the door never sees it, and the press keeps it', async () => {
    const fork = await aForkTheOwnerReserved('A fork pressed with its reason in the body')
    const done = await promote(fork, asAgent(SECRETARY), FOR_THE_PERSON)
    expect(done.status, done.said).toBe(201)
    expect(thePresses().at(-1)).toEqual({ operation: 'record.promote', reason: A_TESTS_REASON_FOR_THE_PERSON })
  })

  it('takes the reason off the query of a request with no body', async () => {
    const decision = await aDecisionThePersonWrote()
    const without = await ask('DELETE', `/api/records/${decision}`, asAgent(SECRETARY))
    expect(without.status, without.said).toBe(400)
    expect(without.said).toContain('gives its')

    const done = await ask('DELETE', `/api/records/${decision}?${FOR_THE_PERSON_IN_THE_QUERY}`, asAgent(SECRETARY))
    expect(done.status, done.said).toBe(200)
    expect(thePresses().at(-1)).toEqual({ operation: 'record.remove', reason: A_TESTS_REASON_FOR_THE_PERSON })
  })

  it('takes a reason of the longest length the office keeps', async () => {
    const fork = await aForkTheOwnerReserved('A fork pressed with the longest reason')
    const longest = 'r'.repeat(THE_LONGEST)
    expect((await promote(fork, asAgent(SECRETARY), { forThePerson: { reason: longest } })).status).toBe(201)
    expect(thePresses().at(-1)?.reason).toBe(longest)
  })
})

describe('what it refuses, with nothing done', () => {
  it('refuses a reason given in the body and in the query', async () => {
    await refusedAndNothingWritten('both in its body', (fork) => promote(fork, asAgent(SECRETARY), FOR_THE_PERSON, `?${FOR_THE_PERSON_IN_THE_QUERY}`))
  })

  it("refuses a reason on the person's own request", async () => {
    await refusedAndNothingWritten("is the person's own", (fork) => promote(fork, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, FOR_THE_PERSON))
  })

  it('refuses an empty reason, a reason past the limit, and a field that is not one reason', async () => {
    for (const forThePerson of [{ reason: '' }, { reason: '   ' }, { reason: 'r'.repeat(THE_LONGEST + 1) }, 'A reason, not in an object.', { reason: 'Why.', also: 'More.' }, {}]) {
      await refusedAndNothingWritten('The reason for the person is not usable', (fork) => promote(fork, asAgent(SECRETARY), { forThePerson }))
    }
  })

  it('refuses a key spelt another way', async () => {
    for (const key of ['forThePerson', 'forThePerson.reasons', 'forThePersonReason']) {
      await refusedAndNothingWritten(`"${key}"`, (fork) => promote(fork, asAgent(SECRETARY), {}, `?${key}=Why.`))
    }
  })

  it('refuses the reason given twice in the query', async () => {
    await refusedAndNothingWritten('2 times', (fork) => promote(fork, asAgent(SECRETARY), {}, `?${FOR_THE_PERSON_IN_THE_QUERY}&${FOR_THE_PERSON_IN_THE_QUERY}`))
  })
})

describe('what it leaves alone', () => {
  it('keeps the reason of an agent that holds no grant, and writes no press', async () => {
    const presses = thePresses().length
    const note = await ask('POST', '/api/records', asAgent('a-worker'), { ...FOR_THE_PERSON, kind: 'note', title: 'A note with a reason nobody reads', data: { body: 'x' } })
    expect(note.status, note.said).toBe(201)
    expect(thePresses()).toHaveLength(presses)
  })

  it('leaves a request that gives no reason as it was', async () => {
    const note = await ask('POST', '/api/records', asAgent(SECRETARY), { kind: 'note', title: 'A note with no reason', data: { body: 'x' } })
    expect(note.status, note.said).toBe(201)
  })
})
