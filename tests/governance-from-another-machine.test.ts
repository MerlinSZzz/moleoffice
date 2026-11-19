// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GOVERNANCE ACT IS REFUSED FROM ANOTHER MACHINE, AND THE REFUSAL READS A MEASUREMENT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/remote-access.md` §6.1 states Mole Office's authority rule as an AND: an act
 * is allowed when the ACTOR may perform it and the MACHINE it was asked from may perform it. The
 * actor half has been enforced for months. The machine half had nothing behind it: every field on
 * an `Actor` except one comes from a header, so anything that could reach the server and typed
 * `x-mole-office-actor-type: human` was a person as far as every guard was concerned. The one field that
 * is measured rather than said is `from`, written by the listener that accepted the connection.
 *
 * These are the acts the product already reserves to the person, asked from each door in turn.
 *
 * ---------------------------------------------------------------------------------------
 * THREE REAL LISTENERS, AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * `app.inject()` cannot ask this question. An injected request is on no socket, so no listener sees
 * it, so its arrival is `undefined` — which means *the rule does not apply* and is the honest answer
 * for a migration or a script. A test that set the symbol by hand would be proving that its own
 * assignment reached the guard. So this file opens three doors onto ONE built app and drives real
 * HTTP through each:
 *
 *   · THIS MACHINE — `app.listen()`, the listener `buildApp` stamps in `src/server/index.ts`.
 *   · ANOTHER MACHINE — a second HTTP server that calls `stampArrival(raw, 'another machine')` and
 *     hands the request to `app.routing`. That is the mechanism `remote-access.md` §4.4 specifies
 *     for the second listener, driven here before that listener exists, so the guard is proved
 *     before anything is reachable rather than after.
 *   · A DOOR NOBODY CLASSIFIED — a third HTTP server that stamps nothing. It cannot happen today,
 *     and it is what `refuseAnUnclassifiedDoor` exists for: the day somebody adds a listener and
 *     forgets to say which side it is on, requests through it are refused rather than promoted to
 *     whatever a local caller may do.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT HERE YET
 * ---------------------------------------------------------------------------------------
 *
 * §6.5 names four guards. All four exist and are asked below: the fourth, `assertMayRemoveAnAsk`,
 * arrived with the delete guard and carries its arrival clause from the commit it landed in, which
 * is what the section below asks of it. What is still deliberately not here is the two planning
 * routes §6.7 refuses by route declaration rather than by a guard.
 * `design/ROUND-TEN-BUILD-PLAN.md` says which wave owns which; nothing in this file should be read
 * as covering the ones it does not name.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * THE OWNER'S OTHER MACHINE, WHICH THIS OFFICE TRUSTS, as the address the proxy door forwards. A made-up documentation address.
 * An ordinary write from it is the owner's, which is the half of this file that shows a remote browser is still a person.
 */
const THEIR_TRUSTED_MACHINE = '198.51.100.9'
const HUMAN_ON_THEIR_TRUSTED_MACHINE = { ...HUMAN, 'x-forwarded-for': THEIR_TRUSTED_MACHINE }

/** An agent, for the one act below that an agent is allowed to make: one on the owner's own words. */
const AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
}

let t: TestDb
let app: FastifyInstance
/** The three doors, as base URLs. Every request below names which one it went through. */
let thisMachine: string
let anotherMachine: string
let anUnclassifiedDoor: string
const extraDoors: Server[] = []

/** Open a listener on a loopback port the operating system picks, and say where it answers. */
async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  // THE ROW A PRESS ON THE WORLDS PAGE WRITES, as tests/a-browser-on-a-trusted-machine-asks-to-pair.test.ts writes it.
  const { trustThisMachine } = await import('../src/server/lib/trustedmachines.ts')
  trustThisMachine(THEIR_TRUSTED_MACHINE, null, 'a press', 'the test trusted this machine', null)
  const built = await apiApp()
  app = built.app
  await app.ready()

  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  anotherMachine = await open(
    createServer((raw, res) => {
      // A proxy on this computer, which is what the door on 127.0.0.1 for a network daemon is. The
      // second word only decides whose address a call is recorded against; every refusal under test
      // here reads the first.
      stampArrival(raw, 'another machine', 'a proxy on this computer')
      app.routing(raw, res)
    }),
  )
  anUnclassifiedDoor = await open(createServer((raw, res) => app.routing(raw, res)))
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
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
  door: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload: unknown,
  headers: Record<string, string> = HUMAN,
): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  // THE ID OF WHATEVER THIS MADE, wherever the reply puts it. A record write answers with `record`,
  // a planning intent answers with `intent`, and some routes answer with a bare `id`.
  const body = (await res.json()) as {
    error?: string
    detail?: string
    id?: string
    record?: { id?: string }
    intent?: { id?: string }
  }
  return {
    status: res.status,
    error: body.error ?? '',
    detail: body.detail ?? '',
    id: body.id ?? body.record?.id ?? body.intent?.id ?? null,
  }
}

/**
 * THE REFUSAL A KEYLESS CLAIM TO BE THE OWNER GETS FROM A MACHINE THIS OFFICE DOES NOT TRUST.
 *
 * Since item 1 of a decision, such a request is refused before any door, by `actorFrom`, with the sentence that says
 * the machine is the reason and what to send. The governance guards' own sentences ("came from
 * another machine", and the name of the act) are therefore no longer what it reads; what is held here is that the act
 * is refused and nothing is written, and that the refusal names the machine as the reason.
 */
function expectRefusedAsAClaimNoKeyProved(answer: Answer): void {
  expect(answer.error).toContain('This request named the person, and it carried no key.')
  expect(answer.error).toContain('This office does not trust the machine this request came from')
  expect(answer.error).toContain('Nothing was read or written.')
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
    title: `Should the ${name} keep its own table?`,
    data: { question: `One table for ${name}, or a record kind?`, options: ['a — its own table', 'b — a record kind'] },
    actor: { type: 'agent', id: 'claude-code' },
  })
  const decision = t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: `The ${name} stays out of the record graph`,
    data: { replaces: [], because: 'it is person-level and a record is project-owned' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  })
  return { proposal: proposal.id, decision: decision.id }
}

describe('a decision is written at the machine Mole Office runs on', () => {
  it('refuses a decision written from another machine, however human the headers are', async () => {
    const before = decisionTitles()
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The gripper stays on position control',
      data: { replaces: [], because: 'force control needs a sensor that is not on the arm' },
    })
    expect(answer.status, `a decision was written from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    // AND THE REFUSAL IS THE WHOLE OF IT. A 403 that wrote the record anyway would be worse than no
    // guard at all: the reply and the database would disagree about who governs this project.
    expect(decisionTitles()).toEqual(before)
  })

  it('writes the same decision when the same request comes from this machine', async () => {
    const answer = await ask(thisMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The gripper stays on position control',
      data: { replaces: [], because: 'force control needs a sensor that is not on the arm' },
    })
    expect(answer.status, answer.error).toBe(201)
    expect(decisionTitles()).toContain('The gripper stays on position control')
  })

  it('cannot be talked out of it by an address the caller wrote itself', async () => {
    // THE POINT OF THE WHOLE MECHANISM, and the exact defect remote-access.md §8.4 says a sibling
    // design has: an origin worked out from the address rather than from the door. Under a proxy on
    // loopback EVERY remote call looks like 127.0.0.1, so a guard reading the address would file the
    // owner's other machine as this one — silently, from a function that looks right.
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'Two listeners, one corpus',
      data: { replaces: [], because: 'the same database is the whole point' },
    }, {
      ...HUMAN,
      'x-forwarded-for': '127.0.0.1',
      'x-real-ip': '127.0.0.1',
      forwarded: 'for=127.0.0.1',
    })
    expect(answer.status, `an address the caller wrote moved the arrival: ${answer.error}`).toBe(403)
    expect(decisionTitles()).not.toContain('Two listeners, one corpus')
  })

  it('has no header spelling that would have worked either', async () => {
    // There is no arrival header to guess at, and a guess is not ignored. `refuseMisspeltActorHeaders`
    // answers anything shaped like one of this product's headers and not on the list, before the actor is
    // built at all — so this is refused as a header Mole Office does not read rather than reaching
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'Arrival by header',
      data: { replaces: [], because: 'a caller cannot say which door it came through' },
    }, { ...HUMAN, 'x-mole-office-arrival': 'this machine' })
    expect(answer.status, answer.error).toBe(400)
    expect(answer.error).toContain('x-mole-office-arrival is not a header Mole Office reads')
    expect(decisionTitles()).not.toContain('Arrival by header')
  })

  it('says the machine is the reason, that nothing was written, and what to send', async () => {
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'decision',
      title: 'The refusal is read by a person',
      data: { replaces: [], because: 'a refusal nobody can act on is a failed refusal' },
    })
    expect(answer.status, answer.error).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    // AND THE WAY ON: the key and the headers to send, and where the machine can be trusted.
    expect(answer.error).toContain('x-mole-office-key')
    expect(answer.error).toContain('on the Worlds page on the computer that runs the office')
  })

  it('refuses promoting a proposal into a decision from another machine', async () => {
    const { proposal } = fork('promotion path')
    const answer = await ask(anotherMachine, 'POST', `/api/records/${proposal}/promote`, {
      title: 'Promotion is settling, and settling is the person’s',
      data: { because: 'the link the promotion writes IS the governance act' },
    })
    expect(answer.status, `a proposal was promoted from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    expect(decisionTitles()).not.toContain('Promotion is settling, and settling is the person’s')
  })
})

describe('the other two governance acts are asked the same question', () => {
  it('refuses a fork settled from another machine, and leaves it open', async () => {
    const { proposal, decision } = fork('settling link')
    const answer = await ask(anotherMachine, 'POST', '/api/links', {
      fromId: decision,
      toId: proposal,
      type: 'derived_from',
    })
    expect(answer.status, `a fork was settled from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
    const record = getRecord(proposal)
    expect(record).not.toBeNull()
    expect(proposalResolution(record as never)?.resolved).toBe(false)
  })

  it('refuses an act on the owner’s words revoked from another machine, and leaves the act standing', async () => {
    // THE PRESS IS THE OWNER'S AND IT IS PRESSED HERE. An agent may close a record the owner asked about when it can
    // quote the owner saying so; taking that back is the owner's own act, so it is refused from another machine
    // exactly as settling a fork is. `design/messages/ACCEPTANCE.md` W2.
    const asked = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'Whose move · the wrist camera drops a frame every third cycle',
      data: { whose_move: 'person', symptom: 'a dropped frame' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
    const closed = await ask(
      thisMachine,
      'PATCH',
      `/api/records/${asked}`,
      {
        dataPatch: { state: 'accepted' },
        warrant: {
          saidBy: THE_TEST_OFFICES_OWNER.id,
          words: 'that one is fine, close it',
          where: 'terminal',
          when: '2026-09-03 10:00',
          for: [asked],
        },
      },
      AGENT,
    )
    expect(closed.status, closed.error).toBe(200)

    const answer = await ask(anotherMachine, 'POST', `/api/records/${asked}/revisions/2/revoke`, undefined)
    expect(answer.status, `an act was revoked from another machine: ${answer.error}`).toBe(403)
    // THE ROUTE'S OWN DECLARATION ANSWERS FIRST, in the words `GET /api/access` publishes, because
    // this route says `reach: 'local'` and the door is refused before the handler runs.
    // `assertMayRevokeAnAct` asks the same question again behind it, which is where the sentence
    // naming the act comes from for a caller that reaches the guard some other way.
    expect(answer.error).toContain('came from another computer')
    expect(answer.error).toContain("Taking back an agent's act done on your own words")
    const record = t.api.getRecord(asked) as { data: Record<string, unknown> }
    expect(record.data['state'], 'the act was undone from another machine').toBe('accepted')
  })

  it('refuses an unsettled fork deleted from another machine, and leaves it in the queue', async () => {
    const { proposal } = fork('queue')
    const answer = await ask(anotherMachine, 'DELETE', `/api/records/${proposal}`, undefined)
    expect(answer.status, `a fork was deleted from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    const { getRecord } = await import('../src/server/lib/records.ts')
    expect((getRecord(proposal) as { deletedAt: string | null }).deletedAt).toBeNull()
  })
})

describe('the queue of things the person was asked is not emptied from another machine either', () => {
  /**
   * A problem the person asked on, and it is the person who asked.
   *
   * Written in-process, so its revision ledger says `human` and the guard's third act — an agent
   * withdrawing its own request — is not what is being asked about here. What is being asked about
   * is the machine.
   */
  function anAsk(name: string): string {
    return t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: `Whose move · ${name}`,
      data: { whose_move: 'person', symptom: name },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
  }

  function held(id: string): { deletedAt: string | null; state: unknown } {
    const record = t.api.getRecord(id) as { deletedAt: string | null; data: Record<string, unknown> }
    return { deletedAt: record.deletedAt, state: record.data['state'] }
  }

  it('refuses it deleted from another machine, and leaves it in the queue', async () => {
    const id = anAsk('the gripper drops the part on the third cycle')
    const answer = await ask(anotherMachine, 'DELETE', `/api/records/${id}`, undefined)
    expect(answer.status, `an ask was deleted from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    expect(held(id).deletedAt).toBeNull()
  })

  it('refuses it closed from another machine, and the state does not move', async () => {
    const id = anAsk('the calibration drifts overnight')
    const answer = await ask(anotherMachine, 'PATCH', `/api/records/${id}`, {
      dataPatch: { state: 'fixed' },
    })
    expect(answer.status, `an ask was closed from another machine: ${answer.error}`).toBe(403)
    expectRefusedAsAClaimNoKeyProved(answer)
    expect(held(id).state).toBeUndefined()
  })

  it('deletes the same record when the same request comes from this machine', async () => {
    // THE HALF THAT KEEPS THE CLAUSE FROM BEING "REFUSE EVERYBODY". The owner's own queue is theirs to
    // empty, at the machine Mole Office runs on, and the refusals above are about the door and nothing
    // else.
    const id = anAsk('the same request, one door along')
    const answer = await ask(thisMachine, 'DELETE', `/api/records/${id}`, undefined)
    expect(answer.status, answer.error).toBe(200)
    expect(held(id).deletedAt).not.toBeNull()
  })
})

describe('the owner’s week is not scheduled from another machine either', () => {
  /** Words about time on a real piece of work, kept and read, waiting for somebody to commit them. */
  async function offered(): Promise<string> {
    const work = t.api.createRecord({
      workspaceId: 'default',
      kind: 'task',
      title: 'Bring the second listener up',
      data: { state: 'todo' },
      actor: { type: 'agent', id: 'claude-code' },
    }).id
    const made = await ask(thisMachine, 'POST', '/api/planning/intents', { said: '3h next week', recordId: work })
    expect(made.status, made.error).toBe(201)
    return made.id as string
  }

  /** Rows in the allocations table, straight from SQLite. Nothing can hide behind a reply here. */
  const allocationRows = (): number =>
    (t.client.sqlite.prepare('SELECT count(*) AS n FROM allocations').get() as { n: number }).n

  it('refuses the commit from another machine, and writes no hours', async () => {
    const intent = await offered()
    const before = allocationRows()
    const answer = await ask(anotherMachine, 'POST', `/api/planning/intents/${intent}/commit`, undefined)
    expect(answer.status, `hours were scheduled from another machine: ${answer.error}`).toBe(403)
    // THE OUTER WALL ANSWERS THIS ONE NOW, AND THAT IS A CHANGE THIS CASE RECORDS RATHER THAN HIDES.
    // Until wave 15 the sentence here was `assertMayCommitAnIntent`'s own -- *came from another
    // machine*, *Nothing was scheduled*. The route is declared `reach: 'local'`, so the request hook
    // in lib/reach.ts now refuses it at `onRequest`, before any handler and therefore before the
    // guard. The claim is unchanged and is still checked below the wording: 403, and not one row in
    // `allocations`. The guard's own clause is proved directly in the case underneath this one,
    // because a clause nothing can reach is a clause nothing proves.
    expect(answer.error).toContain('came from another computer')
    expect(answer.error).toContain('Nothing was written')
    expect(answer.error).toContain('Turning words about time into hours')
    expect(answer.detail).toContain('arrival: another machine')
    expect(allocationRows()).toBe(before)
  })

  it('is refused by the guard too, which the wall above now stands in front of', async () => {
    // THE INNER WALL, ASKED DIRECTLY. `assertMayCommitAnIntent` gained its arrival clause in wave 1
    // and the hook above it means no HTTP request reaches it any more. Two walls is the intent --
    // the hook cannot see whether a record is an unsettled proposal, and the guard cannot run before
    // a handler that deletes things -- but an inner wall nothing exercises is an inner wall nobody
    // would notice falling down. So it is exercised here, as a function, with the arrival set the
    // way a listener would set it.
    const { assertMayCommitAnIntent } = await import('../src/server/lib/records.ts')
    const intent = { id: 'i1', said: '3h next week', period: '2026-09-01/2026-09-07' }
    expect(() =>
      assertMayCommitAnIntent(intent, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, stated: true, from: 'another machine' }),
    ).toThrow(/another machine/)
    // And it lets the same actor through from this machine, so the clause above is about the
    // arrival and not about the actor.
    expect(() =>
      assertMayCommitAnIntent(intent, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, sessionId: null, stated: true, from: 'this machine' }),
    ).not.toThrow()
  })

  it('commits the same intent when the same request comes from this machine', async () => {
    const intent = await offered()
    const before = allocationRows()
    const answer = await ask(thisMachine, 'POST', `/api/planning/intents/${intent}/commit`, undefined)
    expect(answer.status, answer.error).toBe(201)
    expect(allocationRows()).toBe(before + 1)
  })
})

describe('being on another machine is a permission and not an audience', () => {
  it('lets an ordinary write through from another machine, attributed to the person who made it', async () => {
    // THE HALF THAT WOULD BE EASY TO GET WRONG. `remote-access.md` §2: a remote browser is a person,
    // and there is no fourth reader. If this file only proved refusals, "remote cannot be human"
    // would pass it — and that rule would leave the owner a half-dead product on their other machine.
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'note',
      title: 'Read from the other machine, written from the other machine',
      summary: 'an ordinary write is ordinary from anywhere',
    }, HUMAN_ON_THEIR_TRUSTED_MACHINE)
    expect(answer.status, answer.error).toBe(201)
    const wrote = one(
      t.client.sqlite
        .prepare('select actor_type as type, actor_id as id from changes where record_id = ?')
        .all(answer.id) as { type: string; id: string }[],
      'change rows for the note written from another machine',
    )
    expect(wrote).toEqual({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  })

  it('lets a proposal be filed from another machine — the fork is open to everybody', async () => {
    const answer = await ask(anotherMachine, 'POST', '/api/records', {
      kind: 'proposal',
      title: 'Should the second listener be switched on before the guards are green?',
      data: { question: 'Order, or convenience?', options: ['a — guards first', 'b — listener first'] },
    }, HUMAN_ON_THEIR_TRUSTED_MACHINE)
    expect(answer.status, answer.error).toBe(201)
  })
})

describe('a door nobody classified', () => {
  it('refuses a human-only act that arrived through it, and says the fault is Mole Office’s', async () => {
    const before = decisionTitles()
    const answer = await ask(anUnclassifiedDoor, 'POST', '/api/records', {
      kind: 'decision',
      title: 'A third listener nobody classified',
      data: { replaces: [], because: 'an unstamped door is a broken assumption, not a permission question' },
    })
    expect(answer.status, `an unclassified door wrote a decision: ${answer.error}`).toBe(500)
    expect(answer.error).toContain('could not tell which door this request came through')
    expect(answer.error).toContain('This is a fault in Mole Office, not in your request')
    expect(decisionTitles()).toEqual(before)
  })

  it('still answers an in-process caller, which is on no socket at all', async () => {
    // The case the rule above must not take with it: `app.inject()` is how the whole suite reaches
    // the product, and it is unstamped because no listener could have seen it.
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode, res.body).toBe(200)
  })
})
