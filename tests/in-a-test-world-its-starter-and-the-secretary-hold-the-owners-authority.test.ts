// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY HOLD THE OWNER'S AUTHORITY. Criterion P84, and
 * rule 5 of chapter 8.
 *
 * ---------------------------------------------------------------------------------------
 * THE QUESTION AND WHAT WAS DECIDED
 * ---------------------------------------------------------------------------------------
 *
 * In a test world, does the agent that started it hold the highest authority, or does its secretary hold all of it?
 * The secretary decided both. The agent that started a test world holds the
 * owner's authority there, because it photographs the owner's presses for its handback, and the
 * secretary holds it in every test world, because the secretary reviews worlds for the owner.
 *
 * ---------------------------------------------------------------------------------------
 * MEASURED BEFORE THIS BRANCH, 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A request in a world was attributed exactly as one in the office. `actorFrom` read the three
 * identity headers and nothing else; every one of the owner's acts was refused to every agent with the same
 * sentence — "Trusting a machine is the owner's own act, and this request was made by '[the secretary's handle]', which
 * is not the owner" — and confirming a credential was refused the same way. Nothing in a world knew who
 * had started it: the tool passed no such value, and the ledger row it registers held the branch,
 * the port and the copy path only inside an English sentence. `GET /api/health` said the world was
 * `scratch` with three reasons, and nothing read that on any permission path.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · in the office, which is never a test world, nothing changes: every agent is refused;
 *   · in a world told who started it, that starter does the person's acts;
 *   · so does an agent named as a secretary of the office the copy came from;
 *   · every other agent is refused, and the refusal NAMES who may, by handle;
 *   · the act is recorded as the agent that made it, never as the person: nothing written in a
 *     world is the owner's word.
 *
 * IT DRIVES THE ENVIRONMENT DIRECTLY rather than starting a world with the tool. The tool takes
 * about a minute to copy the corpus and bring two servers up, and what is under test is the rule the
 * two settings carry, not the copying. What the tool writes into those settings is measured by
 * reading the tool itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. In src/server/lib/worldauthority.ts, have `theOwnersAuthorityOf` always answer
 *      `{ holds: false, because: null }` → the starter and the secretary are refused, and the second
 *      and third cases fail.
 *   2. In the same file, have it answer `{ holds: true }` for every agent → the stranger gets
 *      through and the fourth case fails.
 *   3. In src/server/lib/http.ts, stop setting `theOwnersAuthority` on the actor → the same two.
 *   4. Take the `inATestWorld` guard out of `theOwnersAuthorityOf` → the office lets an agent named
 *      by a leftover setting through and the first case fails.
 *   5. In src/server/lib/records.ts, put the wide `if (whoMayDoThePersonsActsHere() !== null) return
 *      null` line back at the head of `whyAnUnregisteredAgentMayNotWrite` → "refuses an
 *      unregistered agent that is neither the starter nor a secretary" fails, because the stranger
 *      is let through by the world alone.
 *   6. In the same function, delete the `if (actor.theOwnersAuthority?.holds === true) return null`
 *      line → "lets a secretary that holds no registry row here write without one" fails, and so
 *      does a-worlds-copy-carries-no-key-hashes' "lets a secretary do the person’s act by name".
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority, theWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** One stack, with the world settings this test wants in the environment before the app is built. */
async function aStack(told: { startedBy?: string; secretaries?: string }): Promise<{
  t: TestDb
  app: FastifyInstance
  at: string
}> {
  const t = await freshDb()
  // THE SETTINGS THE TOOL WRITES INTO A WORLD'S ENVIRONMENT. Set before the app is built, because
  // `theWorldsOwnAuthority` reads them once — which is the same rule the role cards are read under.
  if (told.startedBy === undefined) delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  else process.env.MOLE_OFFICE_WORLD_STARTED_BY = told.startedBy
  if (told.secretaries === undefined) delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  else process.env.MOLE_OFFICE_WORLD_SECRETARIES = told.secretaries
  forgetTheWorldsOwnAuthority()
  const built = await apiApp()
  const app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  /**
   * THE THREE NAMES THIS FILE WRITES UNDER ARE REGISTERED FIRST, because the records door refuses a
   * write under an agent id no registry row holds. `builder-pb` and the test office's secretary are the world's starter
   * and secretary, and `some-worker` is the stranger the authority rule is about: registering it is
   * what lets that rule speak instead of the registry one.
   */
  for (const handle of ['builder-pb', THE_TEST_OFFICES_SECRETARY.handle, 'some-worker']) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...PERSON, 'content-type': 'application/json' },
      payload: { handle, name: handle },
    })
    if (made.statusCode !== 201) throw new Error(`registering ${handle} answered ${String(made.statusCode)}: ${made.body}`)
  }
  return { t, app, at: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}` }
}

async function ask(
  at: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${at}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// ============================================================ 1. the office is never a test world

describe('the office, which is never a test world', () => {
  let stack: { t: TestDb; app: FastifyInstance; at: string }

  beforeAll(async () => {
    stack = await aStack({})
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
  })

  it('was told nothing, so it applies nothing', () => {
    const said = theWorldsOwnAuthority()
    expect(said.inATestWorld, 'the office is not a test world').toBe(false)
    expect(said.startedBy).toBeNull()
    expect(said.secretaries).toEqual([])
  })

  it('refuses every agent the person’s acts, exactly as before', async () => {
    const said = await ask(stack.at, 'POST', '/api/office/trusted-machines', { address: 'loquat' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(said.status).toBe(403)
    expect(String(said.body.error), 'the refusal is the office’s own').toContain('An agent is never the person.')
    expect(String(said.body.error), 'and says nothing about a test world').not.toContain('test world')
  })

  it('still lets the person do them', async () => {
    const said = await ask(stack.at, 'POST', '/api/office/trusted-machines', { address: 'loquat' }, PERSON)
    expect(said.status, JSON.stringify(said.body).slice(0, 200)).toBeLessThan(300)
  })
})

// ============================================================ 2. a world that was told

describe(`a world started by builder-pb, copied from an office whose secretary is ${THE_TEST_OFFICES_SECRETARY.handle}`, () => {
  let stack: { t: TestDb; app: FastifyInstance; at: string }

  beforeAll(async () => {
    stack = await aStack({ startedBy: 'builder-pb', secretaries: `${THE_TEST_OFFICES_SECRETARY.handle},another-secretary` })
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  it('knows its starter and the secretaries of the office it was copied from', () => {
    const said = theWorldsOwnAuthority()
    expect(said.inATestWorld).toBe(true)
    expect(said.startedBy).toBe('builder-pb')
    expect(said.secretaries).toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'another-secretary'])
  })

  it('lets its starter do the person’s acts', async () => {
    const said = await ask(
      stack.at,
      'POST',
      '/api/office/trusted-machines',
      { address: 'loquat' },
      asAgent('builder-pb'),
    )
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBeLessThan(300)
  })

  it.each(['PATCH','DELETE'] as const)('keeps the verified world owner’s %s authority on a held Casting row',async method=>{
    const added=await ask(stack.at,'POST','/api/casting/worker',{program:{value:'codex'},model:{value:'synthetic-world-label'},effort:{value:'synthetic-world-effort'},native:{model:'synthetic-world-native',provider:null,variant:null}},PERSON)
    expect(added.status,JSON.stringify(added.body)).toBe(201)
    const id=(added.body.casting as {id:number}).id
    const read=await ask(stack.at,'GET',`/api/casting/rows/${id}/selection`)
    const selection=read.body.selection as {casting:{revision:string};runtime:string;model:string}
    const filed=await ask(stack.at,'POST','/api/records',{kind:'session',title:'Synthetic held world selection',data:{runtime:selection.runtime,model:selection.model,state:'running',extra:{launcherSelection:selection}}},PERSON)
    expect(filed.status,JSON.stringify(filed.body)).toBe(201)
    const run=(filed.body.record as {id:string}).id
    const held=await ask(stack.at,'POST',`/api/casting/rows/${id}/hold`,{run,revision:selection.casting.revision,refusal:{kind:'model',code:'model_not_found',said:'Synthetic world native model refusal'}},PERSON)
    expect(held.status,JSON.stringify(held.body)).toBe(200)
    const body=method==='PATCH'?{hold:null}:undefined
    const stranger=await ask(stack.at,method,`/api/casting/rows/${id}`,body,asAgent('some-worker'))
    expect(stranger.status).toBe(403)
    const owner=await ask(stack.at,method,`/api/casting/rows/${id}`,body,asAgent('builder-pb'))
    expect(owner.status,JSON.stringify(owner.body)).toBe(200)
  })

  it('lets a secretary of that office do them too', async () => {
    const said = await ask(
      stack.at,
      'POST',
      '/api/office/trusted-machines',
      { address: 'another-machine' },
      asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    )
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBeLessThan(300)
  })

  it('refuses every other agent, and the refusal names who may', async () => {
    const said = await ask(
      stack.at,
      'POST',
      '/api/office/trusted-machines',
      { address: 'a-third-machine' },
      asAgent('some-worker'),
    )
    expect(said.status).toBe(403)
    const why = String(said.body.error)
    expect(why, 'it says this is a test world').toContain('test world')
    expect(why, 'and names the starter').toContain('builder-pb')
    expect(why, 'and the secretaries').toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(why, "and says nothing here counts as the owner's own").toContain("Nothing written here counts as the owner's own")
  })

  it('records the act as the agent that made it, never as the person', async () => {
    const before = await ask(stack.at, 'GET', '/api/office/trusted-machines')
    const machines = (before.body.machines as { address: string; addedBy?: { kind: string; id: string } }[]) ?? []
    const mine = machines.find((one) => one.address === 'loquat')
    expect(mine, 'the starter’s act happened').toBeDefined()
    expect(mine?.addedBy?.kind, 'and it is filed as the agent, not as the owner').toBe('agent')
    expect(mine?.addedBy?.id).toBe('builder-pb')
  })

  /**
   * DELETING A DECISION, WHICH IS THE PERSON'S OWN ACT AND IS REFUSED TO EVERY AGENT EVERYWHERE.
   *
   * It is deleting rather than creating on purpose. An agent that can cite what the person said may
   * already CREATE a decision — the warrant path of 27 August 2026, and `assertMayDecide` — so a
   * create measures that rule and not this one. Deleting has no such path: it is refused to every
   * agent by name, in the office and everywhere else, so what lets it through here is P84 alone.
   */
  it('lets its starter delete a decision, which is refused to every agent in the office', async () => {
    const made = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'decision', title: 'A decision the person made here', data: { ...governsTheWholeProject(), replaces: [], option_taken: 'the first' } },
      PERSON,
    )
    expect(made.status, JSON.stringify(made.body).slice(0, 400)).toBe(201)
    const id = (made.body.record as { id: string }).id

    const stranger = await ask(stack.at, 'DELETE', `/api/records/${id}`, undefined, asAgent('some-worker'))
    expect(stranger.status, 'an agent that holds neither is refused').toBe(403)
    const why = String(stranger.body.error)
    expect(why, 'and the refusal names the starter').toContain('builder-pb')
    expect(why, 'and the secretary').toContain(THE_TEST_OFFICES_SECRETARY.handle)

    const starter = await ask(stack.at, 'DELETE', `/api/records/${id}`, undefined, asAgent('builder-pb'))
    expect(starter.status, JSON.stringify(starter.body).slice(0, 400)).toBeLessThan(300)

    // AND IT IS FILED AS THE AGENT. Nothing written in a world is the owner's word.
    const revisions = await ask(stack.at, 'GET', `/api/records/${id}/revisions`)
    const rows = revisions.body.revisions as { who: { actorType: string; actorId: string } }[]
    expect(rows[0]?.who.actorType, 'filed as the agent, never as the owner').toBe('agent')
    expect(rows[0]?.who.actorId).toBe('builder-pb')
  })

  /**
   * THE NARROWING, BOTH SIDES OF IT, OVER A REAL SOCKET. `another-secretary` is named in the world's
   * secretaries setting but holds no registry row here, so it is the one unregistered id the rule
   * must let through. `nobody-registered-this` is neither the starter nor a secretary, so it is the
   * unregistered id the rule must refuse exactly as the office does. The write is an ordinary note,
   * so nothing else in the product's rules has an opinion about it.
   */
  it('refuses an unregistered agent that is neither the starter nor a secretary', async () => {
    const said = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'note', title: 'x', data: { body: 'x' } },
      asAgent('nobody-registered-this'),
    )
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBe(403)
    expect(String(said.body.error), 'and the refusal is the office’s own').toContain(
      'Nothing is registered as the agent "nobody-registered-this"',
    )
  })

  it('lets a secretary that holds no registry row here write without one', async () => {
    const said = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'note', title: 'x', data: { body: 'x' } },
      asAgent('another-secretary'),
    )
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBe(201)
  })
})

// ============================================================ 3. a world whose starter the tool could not name

/**
 * THE TOOL WRITES BOTH SETTINGS WHATEVER THEY ARE, INCLUDING EMPTY (tools/isolated-mole-office.mjs),
 * and an empty starter means nobody: the run it was given did not say which agent it works as. On 8
 * September 2026 the secretary's review world of main answered 500 at every door that read this, because the
 * declaration of MOLE_OFFICE_WORLD_STARTED_BY refused an empty value. The office still applies nothing:
 * that is the first block above, where neither setting is there at all.
 */
describe(`a world whose starter the tool could not name, copied from an office whose secretary is ${THE_TEST_OFFICES_SECRETARY.handle}`, () => {
  let stack: { t: TestDb; app: FastifyInstance; at: string }

  beforeAll(async () => {
    stack = await aStack({ startedBy: '', secretaries: THE_TEST_OFFICES_SECRETARY.handle })
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  it('reads the empty starter as nobody, and is still a test world', () => {
    const said = theWorldsOwnAuthority()
    expect(said.inATestWorld).toBe(true)
    expect(said.startedBy, 'an empty value is nobody, not a name').toBeNull()
    expect(said.secretaries).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
  })

  it('answers the Embassy instead of failing on the setting', async () => {
    const said = await ask(stack.at, 'GET', '/api/office/embassy', undefined, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBe(200)
  })

  it('lets a secretary of that office do the person’s acts', async () => {
    const said = await ask(stack.at, 'POST', '/api/office/trusted-machines', { address: 'loquat' }, asAgent(THE_TEST_OFFICES_SECRETARY.handle))
    expect(said.status, JSON.stringify(said.body).slice(0, 300)).toBeLessThan(300)
  })
})

// ============================================================ 4. every other door of the owner's

/**
 * EVERY OTHER DOOR OF THE OWNER'S READS THE SAME AUTHORITY. Problem aRP8Co6BB_Hv: until this block, the starter and the
 * secretary held the owner's authority at the doors above and were refused at every other door of the owner's, because those doors
 * were written out one at a time and none of them read `theOwnersAuthority`. Each case below is a door that refused
 * builder-pb on 1 October 2026, and each asks a stranger first, so a door that let every agent through could not pass.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 *   1. In src/server/api/roles.ts, delete the `theOwnersAuthority` line in `refuseAnybodyButThePerson` → giving a card
 *      and raising go red, and changing a card by hand with them, because it reads the record the card door wrote.
 *      Take `&& actor.theOwnersAuthority?.holds !== true` out of the raise's key clause → raising alone goes red.
 *   2. In src/server/lib/rolegate.ts, delete the `theOwnersAuthority` line after `everyActSomeRoleRefuses` → applying
 *      a change set goes red, refused by the gate before the door, because a worker's card refuses `plan.write`.
 *   3. In src/server/api/participants.ts, delete the `1a.` line in `whoMayRetireUnraised` → retiring goes red.
 *   4. In src/server/lib/records.ts, delete the `theOwnersAuthority` line in `checkNobodyIsWritingTheirOwnCard` →
 *      changing a card by hand goes red.
 *   5. In the same file, delete the `theOwnersAuthority` line at the head of `actsForThePerson` → confirming a goal
 *      goes red.
 *   6. In src/server/lib/regulations.ts, delete the `theOwnersAuthority` line → revoking a regulation goes red.
 *   7. In src/server/api/planning.ts, take `actor.theOwnersAuthority?.holds === true ||` out of `carriedForThem` →
 *      applying a change set goes red.
 *   8. In src/server/lib/delegation.ts, delete the `theOwnersAuthority` line in `assertMayConfirmPackage` → confirming
 *      a task finished goes red.
 *   9. In src/server/lib/records.ts, delete the `theOwnersAuthority` line at the head of
 *      `theSecretaryActingForThePerson` → settling a fork goes red.
 */
describe('every other door of the owner\'s, in a world started by builder-pb (problem aRP8Co6BB_Hv)', () => {
  let stack: { t: TestDb; app: FastifyInstance; at: string }
  const STARTER = asAgent('builder-pb')
  const STRANGER = asAgent('some-worker')

  beforeAll(async () => {
    stack = await aStack({ startedBy: 'builder-pb', secretaries: THE_TEST_OFFICES_SECRETARY.handle })
  })

  afterAll(async () => {
    await stack.app.close()
    stack.t.close()
    delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
    forgetTheWorldsOwnAuthority()
  })

  /** The record of the secretary's that the card door wrote the card on, read by the case after it. */
  let argusRecord = ''

  it('lets its starter give a card, and refuses a stranger', async () => {
    const stranger = await ask(stack.at, 'POST', `/api/roles/card/${THE_TEST_OFFICES_SECRETARY.handle}`, { role: 'secretary' }, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'POST', `/api/roles/card/${THE_TEST_OFFICES_SECRETARY.handle}`, { role: 'secretary' }, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBeLessThan(300)
    argusRecord = String(starter.body.writtenOn)
  })

  it('lets its starter change a card on an agent record by hand, as the owner may, and refuses a stranger', async () => {
    expect(argusRecord, 'the case above wrote the card on a record').not.toBe('')
    const stranger = await ask(stack.at, 'PATCH', `/api/records/${argusRecord}`, { dataPatch: { role: 'supervisor' } }, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    // TWO CHANGES, because a write that leaves the card as it was is not a change and is refused to nobody. The second
    // puts the secretary card back, which the raise below needs.
    for (const role of ['supervisor', 'secretary']) {
      const starter = await ask(stack.at, 'PATCH', `/api/records/${argusRecord}`, { dataPatch: { role } }, STARTER)
      expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBeLessThan(300)
    }
  })

  it('lets its starter raise a secretary and end the raise, and refuses a stranger', async () => {
    const stranger = await ask(stack.at, 'POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { reason: 'Review the world' }, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const raised = await ask(stack.at, 'POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { reason: 'Review the world' }, STARTER)
    expect(raised.status, JSON.stringify(raised.body).slice(0, 300)).toBe(201)
    const ended = await ask(stack.at, 'DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, undefined, STARTER)
    expect(ended.status, JSON.stringify(ended.body).slice(0, 300)).toBeLessThan(300)
  })

  it('lets its starter confirm a goal an agent filed, and refuses a stranger', async () => {
    const goal = await ask(stack.at, 'POST', '/api/records', { kind: 'goal', title: 'A goal a worker filed', data: {} }, STRANGER)
    expect(goal.status, JSON.stringify(goal.body).slice(0, 300)).toBe(201)
    const id = (goal.body.record as { id: string }).id
    const confirming = { dataPatch: { confirmed_by: { by: 'builder-pb', at: '2026-10-01 09:00:00' } } }
    const stranger = await ask(stack.at, 'PATCH', `/api/records/${id}`, confirming, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'PATCH', `/api/records/${id}`, confirming, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBeLessThan(300)
  })

  /**
   * SETTLING A FORK IS ASKED OF THE SECRETARY'S CARD FIRST, and builder-pb holds no card, so this
   * case is the one that reaches `theSecretaryActingForThePerson`.
   */
  it('lets its starter settle a fork, which holds no card, and refuses a stranger', async () => {
    const proposal = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'proposal', title: 'Which way the world goes', data: { question: 'Which way?', options: ['a — left', 'b — right'], who_settles_it: 'the owner' } },
      PERSON,
    )
    expect(proposal.status, JSON.stringify(proposal.body).slice(0, 300)).toBe(201)
    const decision = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'decision', title: 'Left', data: { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It is shorter.' } },
      PERSON,
    )
    expect(decision.status, JSON.stringify(decision.body).slice(0, 300)).toBe(201)
    const settling = { fromId: (decision.body.record as { id: string }).id, toId: (proposal.body.record as { id: string }).id, type: 'derived_from' }
    const stranger = await ask(stack.at, 'POST', '/api/links', settling, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'POST', '/api/links', settling, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBeLessThan(300)
  })

  it('lets its starter revoke a regulation, and refuses a stranger', async () => {
    const made = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'regulation', title: 'A regulation of the copy', data: { sentence: 'A rule of the copy.', binds: 'person', since: '2026-10-01' } },
      PERSON,
    )
    expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBe(201)
    const id = (made.body.record as { id: string }).id
    const revoking = { dataPatch: { revoked_at: '2026-10-01 09:00:00', revoked_because: 'The world no longer needs it.' } }
    const stranger = await ask(stack.at, 'PATCH', `/api/records/${id}`, revoking, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'PATCH', `/api/records/${id}`, revoking, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBeLessThan(300)
  })

  /**
   * A WORKER'S CARD REFUSES `plan.write`, so this case goes through the role gate as well as the door: builder-pb is
   * registered with no card, which reads as a worker. The change set is the one tests/apply.test.ts builds.
   */
  it('lets its starter apply a change set the owner settled, and refuses a stranger', async () => {
    const proposal = await ask(
      stack.at,
      'POST',
      '/api/records',
      {
        kind: 'proposal',
        title: 'What this draft would mean as project structure',
        data: {
          question: 'Should the project take this shape?',
          options: ['a — yes, as written', 'b — no'],
          who_settles_it: 'the owner',
          extra: { delta: { ops: [{ op: 'create_record', says: 'Create the task "Made by the change set"', kind: 'task', title: 'Made by the change set', workspaceId: 'default', data: { state: 'todo' } }] } },
        },
      },
      PERSON,
    )
    expect(proposal.status, JSON.stringify(proposal.body).slice(0, 300)).toBe(201)
    const decision = await ask(
      stack.at,
      'POST',
      '/api/records',
      { kind: 'decision', title: 'Yes, as written', data: { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It is right.' } },
      PERSON,
    )
    expect(decision.status, JSON.stringify(decision.body).slice(0, 300)).toBe(201)
    const proposalId = (proposal.body.record as { id: string }).id
    const settled = await ask(stack.at, 'POST', '/api/links', { fromId: (decision.body.record as { id: string }).id, toId: proposalId, type: 'derived_from' }, PERSON)
    expect(settled.status, JSON.stringify(settled.body).slice(0, 300)).toBeLessThan(300)

    const stranger = await ask(stack.at, 'POST', `/api/planning/proposals/${proposalId}/apply`, undefined, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'POST', `/api/planning/proposals/${proposalId}/apply`, undefined, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBe(200)
  })

  it('lets its starter confirm a task of the owner\'s finished, and refuses a stranger', async () => {
    const task = await ask(stack.at, 'POST', '/api/records', { kind: 'task', title: 'A task of the owner\'s', data: { state: 'todo' } }, PERSON)
    expect(task.status, JSON.stringify(task.body).slice(0, 300)).toBe(201)
    const id = (task.body.record as { id: string }).id
    const stranger = await ask(stack.at, 'POST', `/api/delegation/${id}/confirm`, undefined, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'POST', `/api/delegation/${id}/confirm`, undefined, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBe(201)
  })

  it('lets its starter retire an agent it did not start, and refuses a stranger', async () => {
    const because = { because: 'The world is done with it.' }
    const stranger = await ask(stack.at, 'POST', `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/retire`, because, STRANGER)
    expect(stranger.status, JSON.stringify(stranger.body).slice(0, 300)).toBe(403)
    const starter = await ask(stack.at, 'POST', `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/retire`, because, STARTER)
    expect(starter.status, JSON.stringify(starter.body).slice(0, 300)).toBe(200)
  })
})
