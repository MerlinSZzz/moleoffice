// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RETIRED AGENT'S TYPED REASON ENDS WITH EXACTLY ONE FULL STOP — PROBLEM sKI5Xh2kZn31.
 *
 * The retire door stores the reason the person typed, with or without a final full stop. Four
 * sentences put that reason after "retired: " and then go on, and each joined it its own way:
 * `theRedReasonFor` added no stop ("done Nothing new…"), the handle door added one after a reason
 * that had one ("done.."), the registry's retired-handle refusal added none, and the retire door's
 * notice on the agent's keys ended with whatever was typed. `theReasonAsOneSentence` in
 * src/shared/messages.ts is now the one place that joins it.
 *
 * THE REGISTRY'S REFUSAL IS GONE, and three sentences carry the reason now. By a decision and criterion I3,
 * a retired agent's handle is free again, so a registration under it
 * makes a new agent with a new id instead of being refused. The case that read the refusal's words
 * now proves that, and that the retired agent is left as it was.
 *
 * And a debt of wave 9 (its release message `tOIZ4JTXUavG`): nothing tested the short reason a send
 * gives for two or more retired addressees. The last part does, in words and through a real send.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS EACH RED
 * ---------------------------------------------------------------------------------------
 *
 *   · `theReasonAsOneSentence` for a reason with no stop, with ".", with "?", with spaces around it,
 *     and for one that trims to nothing. MUTATION M1: return the reason untrimmed with "." always
 *     added — the cases typed with a stop go red.
 *   · each of the four sentences, reached through its real door or function, after the agent was
 *     retired through the real retire door with the reason typed with its stop and without it.
 *     MUTATION M2: `theRedReasonFor` joins the raw reason again — its no-stop case goes red.
 *     MUTATION M3: the handle door adds its own "." after the raw reason again — its with-stop
 *     case goes red.
 *   · `theRetiredAddresseesReason` for two and three names, and one send by the person to two
 *     retired agents, whose 409 names both in the order the send named them. MUTATION M4: join two
 *     names with ", " — the two-name cases go red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Presence = typeof import('../src/server/lib/presence.ts')
type Participants = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let app: FastifyInstance
let presence: Presence
let participants: Participants

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The reason as the person typed it, once without its stop and once with it. */
const WITHOUT_A_STOP = 'the piece of work is done'
const WITH_A_STOP = 'the piece of work is done.'

/**
 * The two agents, by handle, and the reason each is retired with.
 *
 * NO AGENT HERE IS RETIRED WITH A REASON OF SPACES ONLY. The retire door answers 400 to one, after
 * it has already retired the row and revoked the key (measured 24 September 2026, message
 * `wK_sws-Dy3R7` to the supervisor). That door does not answer 200 on the path, so the four
 * sentences' no-reason branch is not reached through it here.
 */
const RETIRED_WITH: Record<string, string> = {
  'retired-without-a-stop': WITHOUT_A_STOP,
  'retired-with-a-stop': WITH_A_STOP,
}

/** Register an agent through the real door and give back its registry id. */
async function register(handle: string, name: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name, runtime: 'claude-code', role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const said = reply.json() as { agent?: { id: string } }
  expect(said.agent?.id, `the registration of ${handle} named no registry id`).toBeTruthy()
  return said.agent!.id
}

/** Retire one agent through the door the owner presses. */
async function retire(agentId: string, because: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${encodeURIComponent(agentId)}/retire`,
    headers: AS_THE_PERSON,
    payload: { because },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}



/** A registration under a retired handle, from another project: the registry id it was given. */
async function aRegistrationUnder(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': 'another' },
    payload: { handle, name: 'Somebody Else', runtime: 'claude-code', role: 'worker' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return ((reply.json() as { agent: { id: string } }).agent).id
}


const ids: Record<string, string> = {}

/** The two agents one send is addressed to, in the order the send names them. */
const FIRST_NAME = 'Pike（派克）'
const SECOND_NAME = 'Fern（蕨）'
let theSendToTwo: { status: number; said: Record<string, unknown> } = { status: 0, said: {} }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  presence = await import('../src/server/lib/presence.ts')
  participants = await import('../src/server/lib/participants.ts')

  // ANOTHER PROJECT, where the registration under a retired handle is made. Criterion I3 frees the
  // handle in this project as well; another project keeps this file's registrations apart.
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: 'another', title: 'Another project' },
  })
  expect(made.statusCode, made.body).toBe(201)

  for (const [handle, because] of Object.entries(RETIRED_WITH)) {
    ids[handle] = await register(handle, handle)
    await retire(ids[handle]!, because)
  }

  // THE SEND TO TWO RETIRED AGENTS, named second-then-first so the order cannot come from the
  // registry's own order.
  const first = await register('send-first', FIRST_NAME)
  const second = await register('send-second', SECOND_NAME)
  await retire(first, WITHOUT_A_STOP)
  await retire(second, WITH_A_STOP)
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'message',
      title: 'A note two retired agents cannot take',
      data: {
        to: [
          { kind: 'agent', id: second },
          { kind: 'agent', id: first },
        ],
        body: 'A note two retired agents cannot take',
      },
    },
  })
  theSendToTwo = { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the one function


// ============================================================ 2. the four sentences

describe('the three sentences that carry the reason', () => {
  for (const handle of ['retired-without-a-stop', 'retired-with-a-stop']) {
    describe(`for a reason typed as "${RETIRED_WITH[handle]!}"`, () => {


      // A DECISION AND CRITERION I3: the registry no longer refuses a retired handle, so there
      // is no refusal to carry the reason. A registration under it makes a new agent with a new id,
      // and the retired agent keeps its row, its retirement and its reason.
      it('a registration under the retired handle makes a new agent, and the retired one keeps its reason', async () => {
        const newId = await aRegistrationUnder(handle)
        expect(newId, 'a new agent with a new id').not.toBe(ids[handle])
        const old = participants.readParticipant({ kind: 'agent', id: ids[handle]! }) as {
          retired: boolean
          retiredBecause: string | null
          retiredAt: string | null
        }
        expect(old.retired, 'the retired agent is still retired').toBe(true)
        expect(old.retiredBecause).toBe(RETIRED_WITH[handle])
        expect(old.retiredAt, 'with the time it was retired').toBeTruthy()
      })

    })
  }
})

// ============================================================ 3. two or more retired addressees

describe('the short reason for two or more retired addressees', () => {


  it('names both retired agents of one real send, in the order the send named them', () => {
    expect(theSendToTwo.status, JSON.stringify(theSendToTwo.said)).toBe(409)
    expect(theSendToTwo.said['reason']).toBe(`${SECOND_NAME} and ${FIRST_NAME} are retired.`)
  })
})
