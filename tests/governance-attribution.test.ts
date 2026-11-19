// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * §36 — A GOVERNANCE ACT HAS TO SAY WHO MADE IT, AND SETTLING A FORK IS ONE.
 *
 * The owner settled this after an independent reviewer showed that a request with no headers at all
 * could promote a proposal and the permanent log recorded the owner as having done it:
 *
 *   > Human-only governance actions require explicit human attribution. Missing actor headers are
 *   > not proof of human authority. Ordinary API behaviour may continue to use the existing
 *   > no-header human default where already settled, but governance actions such as Proposal
 *   > promotion, GOVERNANCE-SETTLING LINKS, and Planning approval/apply must require an explicit
 *   > valid human actor.
 *
 * `tests/human-only-http.test.ts` covers the four verbs on a human-only KIND. This file covers the
 * third thing in that sentence, which is not a kind and not a verb: **the link**.
 *
 * WHY THE LINK IS ITS OWN HOLE. A fork is settled by a `derived_from` link from a decision to the
 * proposal — there is no `resolved` field to set, and the link IS the act. Writing the decision is
 * already refused to everything but a stated human. Writing the link was not. So a decision made
 * last week for one fork could be pointed at a DIFFERENT proposal by a request that named nobody,
 * and both `GET /api/needs-you` and the apply gate would then read that fork as settled by a
 * person. Nobody would have settled it, and the change log would say the owner did.
 *
 * The three assertions below are the three places that must give the same answer: the write, the
 * queue, and the door the apply route stands at.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

const HUMAN_HEADERS = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const AGENT_HEADERS = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { needsYouRoutes } = await import('../src/server/api/needs-you.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.register(needsYouRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** A fork an agent reached, and a decision a person really made about a DIFFERENT one. */
function fork(): { proposal: string; decision: string } {
  const proposal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title: 'Should the planning layer keep its own capacity table?',
    data: {
      question: 'One capacity table, or capacity as a record kind?',
      options: ['a — its own table', 'b — a record kind'],
    },
    actor: AGENT,
  })
  const decision = t.api.createRecord({
    workspaceId: 'default',
    kind: 'decision',
    title: 'Planning capacity stays out of the record graph',
    data: { because: 'a plan is person-level and a record is workspace-owned' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  })
  return { proposal: proposal.id, decision: decision.id }
}

async function link(from: string, to: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers,
    payload: { fromId: from, toId: to, type: 'derived_from' },
  })
  return { status: res.statusCode, body: res.body }
}

/** The one answer to "has a person settled this", asked exactly as the queue and the apply gate ask it. */
async function isSettled(proposalId: string): Promise<boolean> {
  const { forkIsSettled } = await import('../src/server/api/needs-you.ts')
  const { proposalResolution, getRecord } = await import('../src/server/lib/records.ts')
  const record = getRecord(proposalId)
  if (record === undefined || record === null) throw new Error(`no proposal ${proposalId}`)
  const resolution = proposalResolution(record)
  if (resolution === null) throw new Error(`${proposalId} is a ${record.kind}, not a proposal`)
  return forkIsSettled(proposalId, resolution)
}

describe('a fork is settled only by a link a stated human made', () => {
  it('refuses the settling link from a request that named nobody', async () => {
    const { proposal, decision } = fork()
    const res = await link(decision, proposal, {})
    expect(res.status, `a header-less settling link was allowed: ${res.body}`).toBe(403)
    expect(res.body).toContain('x-mole-office-actor-type')
    // AND THE FORK IS STILL OPEN. A refusal that wrote the link anyway would be worse than none:
    // the reply and the database would disagree about who governs this project.
    expect(await isSettled(proposal)).toBe(false)
  })

  it('refuses the settling link from an agent, naming it', async () => {
    const { proposal, decision } = fork()
    const res = await link(decision, proposal, AGENT_HEADERS)
    expect(res.status, `an agent settled a fork: ${res.body}`).toBe(403)
    expect(res.body).toContain('claude-code')
    expect(await isSettled(proposal)).toBe(false)
  })

  it('allows it from a stated human, and the fork is then settled', async () => {
    const { proposal, decision } = fork()
    const res = await link(decision, proposal, HUMAN_HEADERS)
    expect(res.status, res.body).toBe(201)
    expect(await isSettled(proposal)).toBe(true)
  })

  it('leaves every other link alone — this is a governance rule, not a new permission layer', async () => {
    // An agent linking a claim to the module it measures is the ordinary work this product exists
    // to record, and a rule that refused it would be a much worse defect than the one being fixed.
    const module = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', actor: AGENT })
    const claim = t.api.createRecord({
      workspaceId: 'default',
      kind: 'claim',
      title: 'The gauge reads 0.4N low at the fingertip',
      data: { evidence: ['0.4 N low at the fingertip over 20 readings'], method: 'compared against the reference mass' },
      actor: AGENT,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: AGENT_HEADERS,
      payload: { fromId: claim.id, toId: module.id, type: 'measures' },
    })
    expect(res.statusCode, res.body).toBe(201)

    // And a header-less `relates_to` between two ordinary records is still the person typing by
    // hand, exactly as it was before §36. The default is unchanged for everything but governance.
    const other = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Wrist', actor: AGENT })
    const ordinary = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: {},
      payload: { fromId: module.id, toId: other.id, type: 'relates_to' },
    })
    expect(ordinary.statusCode, ordinary.body).toBe(201)
  })

  it('is the NARROWEST rule that covers the act, and refuses nothing else', async () => {
    // A note derived from a proposal is ordinary work: `proposalResolution` counts decisions and
    // nothing else, so this link settles nothing and refusing it would be a permission layer this
    // product does not have and was told not to invent.
    const { proposal, decision } = fork()
    const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Some thinking', actor: AGENT })
    const derived = await link(note.id, proposal, {})
    expect(derived.status, derived.body).toBe(201)

    // And a decision that merely RELATES to the fork — the honest weak statement — is not the act.
    const relates = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: AGENT_HEADERS,
      payload: { fromId: decision, toId: proposal, type: 'relates_to' },
    })
    expect(relates.statusCode, relates.body).toBe(201)
    expect(await isSettled(proposal)).toBe(false)
  })
})
