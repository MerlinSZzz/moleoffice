// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S QUEUE IS ORDERED BY SEVERAL FACTS, EACH ONE VISIBLE AND CHECKABLE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS NOT A SCORE
 * ---------------------------------------------------------------------------------------
 *
 * *"Do not rely on one opaque numeric weight alone."* And: *"Default ordering should put the most
 * consequential items first."* So there is no score anywhere in this. Seven facts are drawn on each
 * fork, the ordering is a run of sort keys over those facts, and `priority.because` says in plain
 * words which of them put the fork where it is. A reader who disagrees with the order can see which
 * fact to argue with.
 *
 * ---------------------------------------------------------------------------------------
 * SIX ARE COUNTED. ONE IS STATED, AND ONLY THE OWNER MAY STATE IT.
 * ---------------------------------------------------------------------------------------
 *
 * The pin is the fact that exists to override the counted ones, so a pin an agent could write would
 * be one more thing arguing for its own place in the owner's queue. `assertMayPinAFork` refuses it to every
 * agent, on both write doors, in both directions.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}
const AS_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const AGENT = { type: 'agent' as const, id: 'claude-code' }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: FastifyInstance
let forks: typeof import('../src/server/lib/forks.ts')
/** What the office already held when this case began, so its own readings can tell its rows apart. */
let openForksAtStart: string[] = []
let proposalsAtStart = 0

beforeAll(async () => {
  t = await freshDb()
  forks = await import('../src/server/lib/forks.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  openForksAtStart = forks.readForks().open.map((one) => one.recordId)
  proposalsAtStart = t.api.listRecords({ workspaceId: 'default', kind: 'proposal' }).length
})

const fork = (title: string, data: Record<string, unknown> = {}): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: { question: `${title}?`, options: ['a — one way', 'b — the other'], ...data },
    actor: AGENT,
  }).id

const work = (title: string, data: Record<string, unknown> = {}): string =>
  t.api.createRecord({ workspaceId: 'default', kind: 'problem', title, data: { state: 'open', ...data }, actor: AGENT }).id

const holds = (from: string, to: string): void => {
  t.api.createLink({ fromId: from, toId: to, type: 'blocks', actor: AGENT })
}

const priorityOf = (id: string) => forks.readForks().open.find((one) => one.recordId === id)?.priority
/**
 * THE FORKS THIS CASE FILED, in the order the office puts them in.
 *
 * The office's list is read whole, as it is meant to be, and the forks already open when the case
 * began are taken out by id. So the order still sees every project and every fork, and a case's
 * assertion is only about the rows that case added.
 */
const order = (): string[] =>
  forks.readForks().open.map((one) => one.recordId).filter((id) => !openForksAtStart.includes(id))

describe('the facts, each one counted from something a person can check', () => {
  it('counts the work a fork is holding up, and what depends on that work', () => {
    const f = fork('A fork holding two things up')
    const stuck = work('The thing that is stuck')
    const other = work('The second thing that is stuck')
    holds(f, stuck)
    holds(f, other)
    // Something depending on the stuck work: that is how far this fork reaches.
    const downstream = work('Work that depends on the stuck thing')
    t.api.createLink({ fromId: downstream, toId: stuck, type: 'consumes', actor: AGENT })

    expect(priorityOf(f)?.blocking).toBe(2)
    expect(priorityOf(f)?.reaches, 'the fork does not reach itself or the work it names').toBe(1)
  })

  it('reads safety off the WORK, because a fork declares no consequence of its own', () => {
    const f = fork('A fork holding up something dangerous')
    const dangerous = work('The e-stop does nothing', {
      consequence: { bearer: 'person', what: 'somebody could be hurt if the arm does not stop' },
    })
    holds(f, dangerous)
    expect(priorityOf(f)?.safety).toBe(true)

    const quiet = fork('A fork holding up something harmless')
    const tidy = work('Tidy the log format', { consequence: { bearer: 'owner', what: 'the logs stay noisy' } })
    holds(quiet, tidy)
    expect(priorityOf(quiet)?.safety).toBe(false)
  })

  it('reads governance off the fork’s own who_settles_it', () => {
    const theOwners = fork('Only the owner may settle this', { who_settles_it: 'the owner' })
    const theirs = fork('An agent may settle this', { who_settles_it: 'an agent' })
    const unsaid = fork('Nobody has said who settles this')
    expect(priorityOf(theOwners)?.governance).toBe(true)
    expect(priorityOf(theirs)?.governance).toBe(false)
    // ABSENT IS NOT THE OWNER. A fork nobody classified must not be counted as governance.
    expect(priorityOf(unsaid)?.governance).toBe(false)
  })

  it('says in plain words which facts put a fork where it is, and says so when none did', () => {
    const f = fork('A fork holding one thing up')
    holds(f, work('The stuck thing'))
    const said = priorityOf(f)?.because ?? ''
    expect(said).toContain('Ordered by')
    expect(said).toContain('it is holding up 1 piece of work')

    const nothing = fork('A fork nothing is behind')
    expect(priorityOf(nothing)?.because).toContain('Nothing recorded about this fork makes it urgent')
  })

  it('carries no score, anywhere', () => {
    // The one thing ruled out. If a number that is not one of the named facts ever
    // appears on `priority`, somebody has added the opaque weight back.
    const f = fork('A fork')
    const p = priorityOf(f) as unknown as Record<string, unknown>
    expect(Object.keys(p).sort()).toEqual(
      ['because', 'blocking', 'governance', 'namesAnOption', 'pinned', 'reaches', 'safety', 'waitingDays'].sort(),
    )
  })
})

describe('the most consequential first', () => {
  it('puts the pin above everything, then safety, then how much is stuck', () => {
    const quiet = fork('Nothing is behind this one')
    const busy = fork('This one is holding three things up')
    for (const n of [1, 2, 3]) holds(busy, work(`Stuck work ${String(n)}`))
    const dangerous = fork('This one is holding up something dangerous')
    holds(dangerous, work('The e-stop does nothing', {
      consequence: { bearer: 'person', what: 'somebody could be hurt' },
    }))
    const pinned = fork('The owner pinned this one')
    t.api.patchRecord(pinned, { dataPatch: { pinned: true } }, HUMAN)

    expect(order()).toEqual([pinned, dangerous, busy, quiet])
  })

  it('a pinned fork holding nothing up still comes before a busy one, which is the point of a pin', () => {
    const busy = fork('Holding five things up')
    for (const n of [1, 2, 3, 4, 5]) holds(busy, work(`Stuck work ${String(n)}`))
    const pinned = fork('The owner pinned this one and nothing is behind it')
    t.api.patchRecord(pinned, { dataPatch: { pinned: true } }, HUMAN)
    expect(order()[0]).toBe(pinned)
  })

  it('breaks a tie by how far it reaches, then by whether it is the owner\'s to settle', () => {
    const far = fork('One thing stuck, three records behind it')
    const stuck = work('The stuck thing')
    holds(far, stuck)
    for (const n of [1, 2, 3]) {
      t.api.createLink({ fromId: work(`Downstream ${String(n)}`), toId: stuck, type: 'consumes', actor: AGENT })
    }
    const near = fork('One thing stuck, nothing behind it', { who_settles_it: 'the owner' })
    holds(near, work('A stuck thing nothing depends on'))
    expect(order()).toEqual([far, near])
  })
})

describe('only the owner may pin a fork', () => {
  it('refuses an agent, and says what to do instead', async () => {
    const f = fork('A fork an agent would like moved up')
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_AGENT,
      payload: { dataPatch: { pinned: true } },
    })
    expect(reply.statusCode).toBe(403)
    const said = (reply.json() as { error: string }).error
    expect(said).toContain('only the owner may do it')
    expect(said, 'the refusal does not say what an agent CAN do to move the order').toContain('"type":"blocks"')
    expect(priorityOf(f)?.pinned).toBe(false)
  })

  it('refuses an agent filing a fork already pinned', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'A fork that pins itself on the way in',
        data: { question: 'Which?', options: ['a — one', 'b — two'], pinned: true },
      },
    })
    expect(reply.statusCode).toBe(403)
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'proposal' }).length - proposalsAtStart).toBe(0)
  })

  it('refuses an agent TAKING a pin off, which is pinning in the other direction', async () => {
    const f = fork('A fork the owner pinned')
    t.api.patchRecord(f, { dataPatch: { pinned: true } }, HUMAN)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_AGENT,
      payload: { dataPatch: { pinned: false } },
    })
    expect(reply.statusCode).toBe(403)
    expect(priorityOf(f)?.pinned).toBe(true)
  })

  it('leaves an agent’s ordinary edit to a pinned fork alone', async () => {
    // The guard fires on the VALUE CHANGING, not on the key being present. Refusing an ordinary
    // edit would make a pinned fork unmaintainable by the agent that files them.
    const f = fork('A fork the owner pinned')
    t.api.patchRecord(f, { dataPatch: { pinned: true } }, HUMAN)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_AGENT,
      payload: { dataPatch: { because: 'more reasoning, learnt since' } },
    })
    expect(reply.statusCode, (reply.json() as { error?: string }).error).toBe(200)
    expect(priorityOf(f)?.pinned).toBe(true)
  })

  it('lets the owner pin one, and refuses a request that names nobody', async () => {
    const f = fork('A fork')
    const theOwnersResponse = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_PERSON,
      payload: { dataPatch: { pinned: true } },
    })
    expect(theOwnersResponse.statusCode, (theOwnersResponse.json() as { error?: string }).error).toBe(200)
    expect(priorityOf(f)?.pinned).toBe(true)

    const other = fork('Another fork')
    const silent = await app.inject({
      method: 'PATCH',
      url: `/api/records/${other}`,
      headers: { 'x-mole-office-workspace': 'default' },
      payload: { dataPatch: { pinned: true } },
    })
    expect(silent.statusCode).toBe(403)
    expect((silent.json() as { error: string }).error).toContain('sent no actor headers')
  })

  it('a `data` that replaces the whole object cannot take the pin off by leaving it out', async () => {
    // The guard refuses the FIELD, so a caller that simply omits it on a full replace would walk
    // around the guard rather than break it. The stored value is carried across instead.
    const f = fork('A fork the owner pinned')
    t.api.patchRecord(f, { dataPatch: { pinned: true } }, HUMAN)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_AGENT,
      // `replace: true` says the rewrite is meant, which is exactly the request this test is
      // simulating: an agent sending a whole new object and expecting everything it left out to go.
      // The pin is what may not go, and that is the guard being tested.
      payload: { data: { question: 'Rewritten?', options: ['a — one way', 'b — the other'] }, replace: true },
    })
    expect(reply.statusCode, (reply.json() as { error?: string }).error).toBe(200)
    expect(priorityOf(f)?.pinned, 'an agent took the owner’s pin off by not mentioning it').toBe(true)
  })

  it('lets a write through that sends the value the record already holds', async () => {
    // Restoring a revision hands a whole stored body back to the write path. That is the record's
    // own value going back where it came from, not a caller pinning anything, and refusing it would
    // make an earlier revision of a pinned fork unrestorable.
    const f = fork('A fork the owner pinned')
    t.api.patchRecord(f, { dataPatch: { pinned: true } }, HUMAN)
    const reply = await app.inject({
      method: 'PATCH',
      url: `/api/records/${f}`,
      headers: AS_AGENT,
      payload: {
        data: { question: 'Rewritten?', options: ['a — one way', 'b — the other'], pinned: true },
        replace: true,
      },
    })
    expect(reply.statusCode, (reply.json() as { error?: string }).error).toBe(200)
    expect(priorityOf(f)?.pinned).toBe(true)
  })

  it('is registered where every guard is listed', async () => {
    const { GOVERNANCE_GUARDS, assertMayPinAFork } = await import('../src/server/lib/records.ts')
    expect(GOVERNANCE_GUARDS.find((one) => one.guard === assertMayPinAFork)).toBeDefined()
  })
})
