// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN STARTED FOR AN AGENT NEVER CARRIES THE GRANT THAT AGENT HOLDS, AND ITS MESSAGES SAY SO.
 *
 * The second half of criterion M81, on problem `i05BSaUcdfXF` of 7 September 2026.
 *
 * WHAT WENT WRONG, MEASURED. At 17:33:53 the office started a run under the secretary's handle while the secretary's own
 * session was between two runs of its waiter. Elevation is looked up by handle, so the run carried
 * the grant the person had pressed on the secretary: it patched a registry row, filed a problem and wrote
 * in group RJ03J5R5EhDe as the secretary, saying the opposite of what the session had said a minute before.
 * The person had granted their acts to the mind they were talking to, not to every run that would ever
 * wear that name.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. With the grant made, the secretary's own session may promote a fork the owner reserved. That is the
 *    control: it says the grant really is in force, so the refusal below is about the run and not
 *    about the grant having failed to be made.
 * 2. The same act, sent with the run's session on it, is refused 403, and the refusal says the
 *    agent holds the grant and the run does not carry it.
 * 3. A message the run writes carries `fromRun` naming that run, and the chat reads it back, so a
 *    reader can tell a run's words from the session's under one handle.
 * 4. A session record that is NOT one Mole Office started is not treated as a run: an ordinary
 *    terminal keeps the grant, or the fix would take away the thing it is protecting.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 5 cases, all green. Then, in `actsForThePerson` in src/server/lib/records.ts, the
 * line
 * `if (theRunAWriteCameFrom(actor.sessionId) !== null) return false` was deleted, so a run inherits
 * the grant its agent holds again.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × refuses the same act to a run the office started for the same agent, and says why
 *
 * The change was put back and the control run again: 5 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The secretary writing, saying which session the write belongs to. */
function asArgus(session?: string): Record<string, string> {
  return {
    ...AS_THE_PERSON,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
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
  return { status: reply.statusCode, said: String((body as { error?: unknown })['error'] ?? reply.body), body }
}

/** A session record of the shape the message worker files for a run it starts. */
async function aRunFor(handle: string): Promise<string> {
  const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'session',
    title: `${handle} answering a message`,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: handle },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

/** A session record of the shape the hook files for a terminal somebody opened. */
async function aTerminal(): Promise<string> {
  const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'session',
    title: 'A terminal somebody opened',
    data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
  })
  return String((filed.body['record'] as { id: string }).id)
}

/** A fork the owner reserved: promoting one is the act an elevation opens and nothing else does. */
async function aForkTheOwnerReserved(title: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asArgus(), {
    kind: 'proposal',
    title,
    data: {
      question: 'Which of the two?',
      options: ['One', 'The other'],
      because: 'Because somebody has to choose.',
      who_settles_it: 'the owner',
    },
  })
  expect(filed.status, filed.said).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

async function promote(fork: string, headers: Record<string, string>) {
  return ask('POST', `/api/records/${fork}/promote`, headers, {
    ...FOR_THE_PERSON,
    title: 'What was chosen',
    data: {
      decided_by: 'the owner',
      authority: 'the owner said so',
      because: 'One of them, and this is the reasoning.',
    },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  // THE PERSON'S OWN PRESS. It is refused to every agent, so it is made as the person. Every case in
  // this file reads the same grant, and the person's press ends when they say.
  const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the grant is the session the person pressed on, and a run does not inherit it', () => {
  it('lets the session the person granted it to do the person’s act, which is the control', async () => {
    const fork = await aForkTheOwnerReserved('A fork the owner reserved, settled by the session')
    const done = await promote(fork, asArgus(await aTerminal()))
    expect(done.status, done.said).toBe(201)
  })

  it('refuses the same act to a run the office started for the same agent, and says why', async () => {
    const fork = await aForkTheOwnerReserved('A fork the owner reserved, reached by a run')
    const run = await aRunFor(THE_TEST_OFFICES_SECRETARY.handle)

    const no = await promote(fork, asArgus(run))

    expect(no.status).toBe(403)
    expect(no.said).toContain("holds the person's grant")
    expect(no.said).toContain('a run does not carry the grant')
    expect(no.said).toContain(run)
  })

  it('leaves the grant alone for a session Mole Office did not start, so an ordinary terminal keeps it', async () => {
    const fork = await aForkTheOwnerReserved('A fork the owner reserved, settled from a terminal')
    const done = await promote(fork, asArgus(await aTerminal()))
    expect(done.status, done.said).toBe(201)
  })
})

describe('a message a run writes says it is a run', () => {
  it('carries the run on the record and reads back as the run that wrote it', async () => {
    const run = await aRunFor(THE_TEST_OFFICES_SECRETARY.handle)
    const filed = await ask('POST', '/api/records', asArgus(run), {
      kind: 'message',
      title: 'Builder CD makes the fix',
      data: { body: 'Builder CD makes the fix and nothing goes up a level.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    expect(filed.status, filed.said).toBe(201)
    const id = String((filed.body['record'] as { id: string }).id)

    const stored = (await ask('GET', `/api/records/${id}`, AS_THE_PERSON)).body['record'] as {
      data: Record<string, unknown>
    }
    expect(stored.data['fromRun']).toBe(run)

    const read = (await ask('GET', `/api/messages/${id}`, AS_THE_PERSON)).body['message'] as {
      ranBy: { run: string; runtime: string; model: string | null } | null
    }
    // THE RUN RECORDED NO MODEL, so the message says none rather than a guess (problem 2tbFWxiFyjtv).
    expect(read.ranBy).toEqual({ run, runtime: 'claude-code', model: null })
  })

  it('writes nothing of the kind for a message the session itself wrote', async () => {
    const filed = await ask('POST', '/api/records', asArgus(await aTerminal()), {
      kind: 'message',
      title: 'The session speaking for itself',
      data: { body: 'Nothing goes up a level yet; I am still reading.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    const id = String((filed.body['record'] as { id: string }).id)
    const stored = (await ask('GET', `/api/records/${id}`, AS_THE_PERSON)).body['record'] as {
      data: Record<string, unknown>
    }
    expect(stored.data['fromRun']).toBeUndefined()
  })
})
