// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CALLER CANNOT CLAIM TO BE A PERSON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/settings-and-governance.md` §8.11 measured the hole and named it in one
 * sentence: *"the hole is not the missing header. It is the present one: any caller that sends
 * x-mole-office-actor-type: human with any id is a stated human and is refused nothing in §8"*. Its item
 * 1 says what closes it — *"An identity the server established, not one the caller declared"*.
 *
 * `tests/governance-from-another-machine.test.ts` proves the other half of `remote-access.md` §6.1's
 * AND: the MACHINE an act was asked from. That half reads `actor.from`, which is a measurement. This
 * file asks the question that half cannot: the request below arrives through the listener Mole Office
 * really runs, from the machine Mole Office really runs on, and its whole credential is the word `human`
 * in a header beside a name it made up.
 *
 * Three acts, because those are the three the product reserves to the person and the three a
 * verification ran at HEAD and got 201, 201 and 200 for.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET AND NOT `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The rule reads `actor.from`, which is written by the listener that accepted the connection. An
 * injected request is on no socket, so no listener saw it, so its arrival is `undefined` — which
 * means *the rule does not apply*, and is the honest answer for a migration or a script. A test
 * that reached the guard in-process would be proving something about a caller this rule is not
 * about. So this file listens on a port and drives it with `fetch`, which is what curl, the browser
 * and every JavaScript agent are.
 *
 * ---------------------------------------------------------------------------------------
 * HALF OF THIS FILE IS THE PART THAT MUST NOT HAVE BEEN TAKEN AWAY
 * ---------------------------------------------------------------------------------------
 *
 * A rule like this fails by becoming a censor, and it fails quietly: the refusals go green and the
 * owner finds out at their own keyboard. So the same three acts are asked again through the same door
 * in the name Mole Office has on file and must all go through, an agent must still be refused in the
 * words that send it to file a proposal rather than in these new ones, a request that names nobody
 * must still be refused for naming nobody, an ordinary write must be untouched whatever name it
 * carries, and a caller no listener saw must be answered exactly as it was before.
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, one, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** The whole credential the verification used: the word `human`, and a name it made up. */
const A_MADE_UP_NAME = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': `not-${THE_TEST_OFFICES_OWNER.id}-at-all`,
}

/**
 * The name Mole Office has on file — what the browser's actor control sends, and what it fills in itself.
 *
 * WRITTEN OUT HERE ON PURPOSE, AND NOT IMPORTED. Everywhere in `src/` that decides who the person
 * is now reads one declaration, `THE_PERSON` in src/shared/person.ts. This file does not, because a
 * test that imports the value it is checking cannot tell you the value is wrong — it would go green
 * whatever the name became. So this is an independent statement of what the product must do, and
 * renaming the person turns this file red, which is what a rename should do.
 *
 * The agreement between the server and the browser is a different question and it has its own file:
 * tests/the-browser-and-the-server-mean-the-same-person.test.ts.
 */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

let t: TestDb
let app: FastifyInstance
/** The door Mole Office really answers on: `app.listen()`, stamped `this machine` by buildApp. */
let thisMachine: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
})

afterAll(async () => {
  await app.close()
  t.close()
})

interface Answer {
  status: number
  error: string
  detail: string
  id: string | null
}

async function ask(
  method: 'POST' | 'DELETE',
  path: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<Answer> {
  const res = await fetch(`${thisMachine}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  const body = (await res.json()) as {
    error?: string
    detail?: string
    id?: string
    record?: { id?: string }
  }
  return {
    status: res.status,
    error: body.error ?? '',
    detail: body.detail ?? '',
    id: body.id ?? body.record?.id ?? null,
  }
}

/** Every live decision's title, read from the database rather than from a reply. */
function decisionTitles(): string[] {
  return t.api
    .listRecords({ workspaceId: 'default', kind: 'decision' })
    .map((r: { title: string }) => r.title)
}

/** A fork an agent filed, and a decision the person really wrote about it. */
function fork(name: string): { proposal: string; decision: string } {
  const proposal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: `Should ${name} be settled by whoever asks?`,
    data: { question: `Who settles ${name}?`, options: ['a — the person', 'b — anybody'] },
    actor: { type: 'agent', id: 'claude-code' },
  })
  const decision = t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: `${name} is settled by the person`,
    data: { replaces: [], because: 'a fork is answered by whoever the question is waiting on' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  })
  return { proposal: proposal.id, decision: decision.id }
}

async function isResolved(proposal: string): Promise<boolean> {
  const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
  const record = getRecord(proposal)
  expect(record).not.toBeNull()
  return proposalResolution(record as never)?.resolved === true
}

async function isDeleted(proposal: string): Promise<boolean> {
  const { getRecord } = await import('../src/server/lib/records.ts')
  return (getRecord(proposal) as { deletedAt: string | null }).deletedAt !== null
}

describe('the three acts the product reserves to the person, asked in a made-up name', () => {
  it('refuses a decision written in a name Mole Office cannot place', async () => {
    const before = decisionTitles()
    const answer = await ask(
      'POST',
      '/api/records',
      {
        kind: 'decision',
        title: 'The gripper stays on position control',
        data: { ...governsTheWholeProject(), replaces: [], because: 'a header is not a person' },
      },
      A_MADE_UP_NAME,
    )
    expect(answer.status, `a made-up name wrote a decision: ${answer.error}`).toBe(403)
    expect(answer.error).toContain('not somebody Mole Office can place')
    expect(answer.error).toContain('Nothing was written')
    // AND THE REFUSAL IS THE WHOLE OF IT. A 403 that wrote the record anyway would be worse than no
    // guard at all: the reply and the change log would disagree about who governs this project.
    expect(decisionTitles()).toEqual(before)
  })

  it('refuses a fork settled in a name Mole Office cannot place, and leaves it open', async () => {
    const { proposal, decision } = fork('the settling link')
    const answer = await ask(
      'POST',
      '/api/links',
      { fromId: decision, toId: proposal, type: 'derived_from' },
      A_MADE_UP_NAME,
    )
    expect(answer.status, `a made-up name settled a fork: ${answer.error}`).toBe(403)
    expect(answer.error).toContain('not somebody Mole Office can place')
    expect(await isResolved(proposal)).toBe(false)
  })

  it('refuses an unsettled fork deleted in a name Mole Office cannot place, and leaves it in the queue', async () => {
    const { proposal } = fork('the queue')
    const answer = await ask('DELETE', `/api/records/${proposal}`, undefined, A_MADE_UP_NAME)
    expect(answer.status, `a made-up name emptied the queue: ${answer.error}`).toBe(403)
    expect(answer.error).toContain('not somebody Mole Office can place')
    expect(await isDeleted(proposal)).toBe(false)
  })

  it('refuses promoting a proposal into a decision in a name Mole Office cannot place', async () => {
    // TWO CLAUSES HOLD THIS ONE UP, and it is recorded here so nobody reads a green as proof of
    // either. Promotion writes the decision AND the `derived_from` link, so it passes through
    // `assertMayWrite` with verb `promote` and through `assertMaySettleFork`. Measured: with either
    // clause alone removed this stays green, and with both removed it goes red. The product claim is
    // still worth asserting — promotion is the shortest path to a settled fork — but the mutation
    // that fires it is the pair, not one.
    //
    // THE PAIR, RUN. 25 August 2026, clean worktree, `npm run build` first. Control: 13 passed,
    // exit 0. Then both clauses off in one run — `if (` to `if (false && ` at records.ts:5582 in
    // `assertMaySettleFork` and records.ts:5634 in `assertMayWrite`, line numbers as of `beee6e9` —
    // 4 failed | 9 passed, exit 1: this `it`, `refuses a decision written in a name Mole Office cannot
    // place`, `refuses a fork settled in a name Mole Office cannot place, and leaves it open`, and `says
    // what it could not do, and does not pretend the name it accepts is a proof`. Restored from a
    // copy taken before the edit, checked byte-identical, and 13 passed again. The build plan's
    // *Proven it* bullet lists this as its sixth mutation.
    const { proposal } = fork('promotion')
    const answer = await ask(
      'POST',
      `/api/records/${proposal}/promote`,
      { title: 'Promotion is settling, and settling is the person’s', data: { because: 'the link is the act' } },
      A_MADE_UP_NAME,
    )
    expect(answer.status, `a made-up name promoted a proposal: ${answer.error}`).toBe(403)
    expect(decisionTitles()).not.toContain('Promotion is settling, and settling is the person’s')
    expect(await isResolved(proposal)).toBe(false)
  })

  it('says what it could not do, and does not pretend the name it accepts is a proof', async () => {
    const answer = await ask(
      'POST',
      '/api/records',
      { kind: 'decision', title: 'The refusal is read by a person', data: {
        ...governsTheWholeProject(), replaces: [], because: 'a refusal nobody can act on failed' } },
      A_MADE_UP_NAME,
    )
    expect(answer.error).toContain('Writing a decision')
    expect(answer.error).toContain(`"not-${THE_TEST_OFFICES_OWNER.id}-at-all"`)
    // The refusal must not read as a login. It narrows the act to one name; it does not establish
    // that whoever sent that name is the person, and the wire half says so in those words.
    expect(answer.detail).toContain(`claimed: human "not-${THE_TEST_OFFICES_OWNER.id}-at-all"`)
    expect(answer.detail).toContain('it does not prove the caller is that person')
  })

  it('has no header spelling that buys the name either', async () => {
    // There is nothing to send. The name Mole Office has on file is not read from any header, and a
    // guess at one is answered by `refuseMisspeltActorHeaders` before the actor is built at all.
    const answer = await ask(
      'POST',
      '/api/records',
      { kind: 'decision', title: 'A person by header', data: {
        ...governsTheWholeProject(), replaces: [], because: 'there is no such header' } },
      { ...A_MADE_UP_NAME, 'x-mole-office-actor-established': 'yes' },
    )
    expect(answer.status, answer.error).toBe(400)
    expect(answer.error).toContain('x-mole-office-actor-established is not a header Mole Office reads')
    expect(decisionTitles()).not.toContain('A person by header')
  })
})

describe('and the person at this machine is refused none of it', () => {
  it('writes a decision through the same door, in the name Mole Office has on file', async () => {
    const answer = await ask(
      'POST',
      '/api/records',
      {
        kind: 'decision',
        title: 'The owner writes their own decisions',
        data: { ...governsTheWholeProject(), replaces: [], because: 'this is the path the browser takes, through the same listener' },
      },
      THE_PERSON,
    )
    expect(answer.status, answer.error).toBe(201)
    expect(decisionTitles()).toContain('The owner writes their own decisions')
  })

  it('settles a fork through the same door', async () => {
    const { proposal, decision } = fork('the person’s own settling link')
    const answer = await ask(
      'POST',
      '/api/links',
      { fromId: decision, toId: proposal, type: 'derived_from' },
      THE_PERSON,
    )
    expect(answer.status, answer.error).toBe(201)
    expect(await isResolved(proposal)).toBe(true)
  })

  it('takes a fork out of its own queue through the same door', async () => {
    const { proposal } = fork('the person’s own queue')
    const answer = await ask('DELETE', `/api/records/${proposal}`, undefined, THE_PERSON)
    expect(answer.status, answer.error).toBe(200)
    expect(await isDeleted(proposal)).toBe(true)
  })
})

describe('nothing else changed about who is refused, or why', () => {
  it('still refuses an agent in the words that send it to file a proposal', async () => {
    const answer = await ask(
      'POST',
      '/api/records',
      { kind: 'decision', title: 'A decision from an agent', data: {
        ...governsTheWholeProject(), replaces: [], because: 'agents file forks' } },
      AN_AGENT,
    )
    expect(answer.status, answer.error).toBe(403)
    // THE WORDS CHANGED ON 27 AUGUST 2026 AND THE ACT DID NOT. This used to expect "Only the human
    // may create a decision", which was the whole rule until the owner replaced it with "An Agent
    // may close a question when it can cite sufficient authoritative evidence." A decision that
    // stands on nothing is still refused to every agent, and the refusal now says which of the two
    // it is. See tests/an-agent-may-decide-what-it-can-cite.test.ts for the rule itself.
    expect(answer.error).toContain('`authority` is missing')
    expect(answer.error).toContain('What an agent writes instead is the FORK')
    // AND NOT FOR THE NEW REASON. An agent told "Mole Office cannot place you" would go looking for a
    // name instead of filing the fork, which is the one thing this rule must not teach it.
    expect(answer.error).not.toContain('not somebody Mole Office can place')
  })

  it('still refuses a request that names nobody for naming nobody', async () => {
    const answer = await ask(
      'POST',
      '/api/records',
      { kind: 'decision', title: 'A decision from a request with no headers', data: {
        ...governsTheWholeProject(), replaces: [], because: 'silence' } },
      { 'content-type': 'application/json' },
    )
    expect(answer.status, answer.error).toBe(403)
    expect(answer.error).toContain('sent no actor headers')
    expect(answer.error).not.toContain('not somebody Mole Office can place')
  })

  it('leaves an ordinary write alone, whatever name it carries', async () => {
    const answer = await ask(
      'POST',
      '/api/records',
      { kind: 'note', title: 'A note in a name Mole Office has never heard', summary: 'an ordinary write is ordinary' },
      A_MADE_UP_NAME,
    )
    expect(answer.status, answer.error).toBe(201)
    const wrote = one(
      t.client.sqlite
        .prepare('select actor_type as type, actor_id as id from changes where record_id = ?')
        .all(answer.id) as { type: string; id: string }[],
      'change rows for the note',
    )
    expect(wrote).toEqual({ type: 'human', id: `not-${THE_TEST_OFFICES_OWNER.id}-at-all` })
  })

  it('answers a caller no listener saw exactly as it did before', async () => {
    // The case this rule must not take with it: a migration and `app.inject()` are on no socket, so
    // no listener could have seen them and there is no claim through a header to check. This is the
    // same shape `stated` and `from` already have, and it is why the whole suite still runs.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': 'somebody-in-process' },
      payload: {
        kind: 'decision',
        title: 'A decision from a caller on no socket at all',
        data: { ...governsTheWholeProject(), replaces: [], because: 'no listener saw this, so there is nothing to place' },
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect(decisionTitles()).toContain('A decision from a caller on no socket at all')
  })
})
