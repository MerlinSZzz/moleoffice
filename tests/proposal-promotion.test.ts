// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK AN AGENT FILED, AND THE GOVERNANCE ACT THAT SETTLES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT, AND WHAT tests/vocab-proposal.test.ts IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * That file reads the declarations: that `proposal` exists, that it is not human-only, that it
 * carries no `resolved` field. This one drives the running server and asks what the PRODUCT does:
 *
 *   1. AN AGENT CANNOT MANUFACTURE A HUMAN DECISION. Not by writing one, not by promoting a
 *      proposal, and not by claiming in the body that a human decided. Every attempt is tried here
 *      against the real routes, and each one is checked for what it LEFT BEHIND — a refusal that
 *      wrote something is not a refusal.
 *   2. THE HUMAN SETTLES IT IN ONE REQUEST, and that request IS the record of having settled it:
 *      the decision and the link that resolves the proposal are one transaction, so a decision
 *      that exists with nothing joining it to the fork it answers cannot happen.
 *   3. THE PROPOSAL IS PRESERVED, NOT REWRITTEN. It is the provenance of the decision — the fork as
 *      it stood, including the option nobody took — so promotion must not consume it, re-kind it,
 *      edit it, or copy its author's words into a record filed under somebody else's name.
 *   4. RESOLUTION IS DERIVED FROM THE LINK. The sharpest test in the file proves this rather than
 *      asserting it: the same proposal, never written to again, answers "settled" and "open" and
 *      "settled" as the DECISION comes and goes. A stored flag could not do that.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, freshDb, one, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

/** A throwaway database with the real record and link routes registered over it. */
async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}
const AS_HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function errorOf(res: { body: string }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

function recordOf(res: { body: string }): Record<string, unknown> {
  const record = bodyOf(res)['record']
  if (typeof record !== 'object' || record === null) {
    throw new Error(`expected a record, got ${res.body.slice(0, 200)}`)
  }
  return record as Record<string, unknown>
}

interface Resolution {
  resolved: boolean
  by: { id: string; title: string; deleted: boolean; linkedBy: string }[]
  note: string
}

/** The fork as an agent would file it: a real question, two defensible answers, the reasoning. */
const FORK = {
  question: 'Do we stay on position control until the reprint has been measured?',
  options: [
    'Stay on position control: nothing to re-tune, and the compliance question stays open another fortnight.',
    'Move to torque control now: it answers the compliance question, and makes any regression from the reprint impossible to attribute.',
  ],
  recommendation: 'Stay on position control until the reprint is measured.',
  because: 'Changing the controller and the hardware in the same week makes any regression impossible to attribute.',
  evidence: ['The reprint landed on the bench on the 9th and has had no force table taken off it.'],
  revisit_when: 'the effort 12 reprint has been measured',
}

let h: Harness

beforeEach(async () => {
  h = await freshApp()
})
afterEach(async () => {
  await h.app.close()
  h.db.close()
})

/** File the fork as the agent, and hand back its id. This is the part an agent is allowed to do. */
async function fileFork(title = 'Position control or torque control for the handover?'): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AGENT,
    payload: { kind: 'proposal', title, data: FORK },
  })
  expect(res.statusCode, res.body).toBe(201)
  return String(recordOf(res)['id'])
}

/** What the product says about whether a fork has been settled, read where a reader reads it. */
async function resolutionOf(proposalId: string): Promise<Resolution> {
  const page = await h.app.inject({ method: 'GET', url: `/api/records/${proposalId}` })
  expect(page.statusCode, page.body).toBe(200)
  const resolution = bodyOf(page)['resolution']
  if (resolution === undefined) throw new Error('a proposal was read back with no resolution on it')
  return resolution as unknown as Resolution
}

// ============================================================ 1. an agent cannot manufacture one

describe('an agent may file the fork and may not settle it', () => {
  it('files the fork, and the fork reads as an open question with nobody named on it', async () => {
    const proposalId = await fileFork()

    const resolution = await resolutionOf(proposalId)
    expect(resolution.resolved).toBe(false)
    expect(resolution.by).toEqual([])
    // The answer says how it WOULD be settled, because a caller reading "open" is exactly the
    // caller who needs to know what closes it.
    expect(resolution.note).toContain(`/api/records/${proposalId}/promote`)
    expect(resolution.note).toContain('derived_from')
  })

  it('refuses the agent that tries to settle its own fork, and leaves the fork open', async () => {
    const proposalId = await fileFork()

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_AGENT,
      payload: {
        title: 'Stay on position control until the reprint is measured',
        data: { because: 'attribution' },
      },
    })
    expect(res.statusCode, res.body).toBe(403)
    // The refusal is about who is asking, and it says what was NOT written — which is the sentence
    // that stops an agent believing it half worked.
    expect(errorOf(res)).toContain('agent')
    expect(errorOf(res)).toContain('claude-code')

    // Nothing was manufactured. No decision exists at all, and the fork still reads as open.
    expect(h.db.api.listRecords({ workspaceId: 'default', kind: 'decision', includeDeleted: true })).toHaveLength(0)
    expect((await resolutionOf(proposalId)).resolved).toBe(false)
    expect(h.db.api.resolveLinks(proposalId)).toEqual([])
  })

  it('refuses a decision an agent claims the human made, whichever way the claim is written', async () => {
    // THE ATTACK THIS PRODUCT WAS WARNED ABOUT, in the words of decision 1 option (c): an agent
    // records a choice "the human already made". If a claim inside the body could carry that, the
    // one access control in the product would be a convention. It cannot: who is asking comes from
    // the actor headers, and the body is never consulted about it.
    const claims: Record<string, unknown>[] = [
      // The claim as a field of its own. `decision` declares no such field, so it is refused by the
      // ordinary gate — and that refusal must not be mistaken for the guard doing the work.
      { decidedBy: 'human', because: `${THE_TEST_OFFICES_OWNER.id} said so in the standup` },
      // The claim smuggled through the declared escape hatch, which IS stored for other kinds. The
      // guard has to answer first, before anything looks at what is in the bag.
      { extra: { decidedBy: 'human', citation: `${THE_TEST_OFFICES_OWNER.id} said so in the standup` } },
      // And with no claim at all, so the answers can be compared.
      { because: 'attribution' },
      // ADDED 27 AUGUST 2026, WHEN THE RULE CHANGED AND THIS ATTACK DID NOT. An agent may now write
      // down a decision the OWNER made — but only by citing a durable record of the owner making it. So
      // the claim is now a declared field rather than a smuggled one, and these are the two ways of
      // getting it wrong: the owner's name with no reference at all, and the owner's name with a reference nothing
      // answers to. Both are the same attack in the shape the new rule gives it.
      { decided_by: 'the owner', authority: 'the owner said so', because: `${THE_TEST_OFFICES_OWNER.id} said so in the standup` },
      {
        decided_by: 'the owner',
        authority: 'the owner said so',
        authority_reference: 'nosuchrecord',
        because: `${THE_TEST_OFFICES_OWNER.id} said so in the standup`,
      },
      // And the owner's name on somebody else's authority, which is the agent deciding under the owner's signature.
      { decided_by: 'the owner', authority: 'a measurement', because: 'the numbers say so' },
    ]

    for (const data of claims) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/api/records',
        headers: AS_AGENT,
        payload: { kind: 'decision', title: `Stay on position control ${JSON.stringify(data).length}`, data },
      })
      // 403 every time: the guard runs before the field gate, so the answer is "not yours to
      // write" and never "your citation is malformed" — which would read as an invitation to send
      // a better-formed one.
      expect(res.statusCode, `${JSON.stringify(data)} -> ${res.body}`).toBe(403)
      // THE WORDS CHANGED WITH THE RULE AND THE ACT DID NOT. Each of these is refused, and the
      // refusal says which of the two things is wrong: nothing said what the decision stands on, or
      // it says the owner decided it and cannot show where the owner said so. Neither is "your citation is
      // malformed, send a better one".
      expect(errorOf(res)).toMatch(/`authority` is missing|`authority_reference` is missing|nothing in Mole Office answers to that id|cannot both be true from an agent/)
    }
    expect(h.db.api.listRecords({ workspaceId: 'default', kind: 'decision', includeDeleted: true })).toHaveLength(0)
  })

  it('gives an agent nowhere to write "this fork is settled" on the proposal itself', async () => {
    // The other half of "an agent cannot manufacture a decision": it must not be able to make the
    // QUEUE look empty either. There is no field for it, so the write is refused rather than stored
    // where nothing reads it.
    const proposalId = await fileFork()
    for (const dataPatch of [{ resolved: true }, { state: 'decided' }, { decided_by: THE_TEST_OFFICES_OWNER.id }]) {
      const res = await h.app.inject({
        method: 'PATCH',
        url: `/api/records/${proposalId}`,
        headers: AS_AGENT,
        payload: { dataPatch },
      })
      expect(res.statusCode, `${JSON.stringify(dataPatch)} -> ${res.body}`).toBe(400)
    }
    expect((await resolutionOf(proposalId)).resolved).toBe(false)
  })
})

// ============================================================ 2. the human settles it, in one act

describe('the human settles a fork in one request', () => {
  it('files the decision and the link that resolves the proposal, in one act', async () => {
    const proposalId = await fileFork()

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: {
        title: 'Stay on position control until the reprint is measured',
        summary: 'Do not change the controller and the hardware in the same week.',
        data: {
          decided_on: '2026-08-11',
          because: 'A regression after two changes at once cannot be attributed to either of them.',
          revisit_when: 'the effort 12 reprint has been measured',
        },
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const body = bodyOf(res)

    const decision = body['decision'] as { id: string; kind: string; title: string }
    expect(decision.kind).toBe('decision')

    // The link is the resolution, so it is part of what this one request did rather than a second
    // thing the caller has to remember. It points FROM the decision TO the proposal: the decision
    // was derived from the fork, and reading it the other way round would reverse which record is
    // the governance act.
    const link = body['link'] as { type: string; from: { id: string }; to: { id: string } }
    expect(link.type).toBe('derived_from')
    expect(link.from.id).toBe(decision.id)
    expect(link.to.id).toBe(proposalId)

    // And the fork now reads as settled, from the link and from nothing else.
    const resolution = body['resolution'] as unknown as Resolution
    expect(resolution.resolved).toBe(true)
    expect(one(resolution.by, 'resolving decision').id).toBe(decision.id)

    // The same answer where a reader would look for it.
    const asRead = await resolutionOf(proposalId)
    expect(asRead.resolved).toBe(true)
    expect(asRead.note).toContain('Stay on position control until the reprint is measured')

    // The proposal's own page shows the relationship from its end, in the words the contract
    // publishes for it: the proposal is the SOURCE OF the decision.
    const backlink = one(h.db.api.resolveLinks(proposalId), 'link on the proposal')
    expect(backlink.label).toBe('source of')
    expect(backlink.other.id).toBe(decision.id)
  })

  it('keeps the proposal exactly as its author wrote it, and copies not one word of it', async () => {
    const proposalId = await fileFork()
    const before = h.db.api.getRecord(proposalId)
    const changesBefore = h.db.api.listChanges({ workspaceId: 'default', recordId: proposalId }).length

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: {
        title: 'Stay on position control until the reprint is measured',
        data: { because: 'A regression after two changes at once cannot be attributed to either.' },
      },
    })
    expect(res.statusCode, res.body).toBe(201)

    // THE PROPOSAL IS PROVENANCE, so promotion may not consume it, re-kind it or edit it. Compared
    // whole rather than field by field: a promotion that quietly stamped anything on it — a date, a
    // flag, a "promoted" marker — would fail here, which is the point.
    expect(h.db.api.getRecord(proposalId)).toEqual(before)
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: proposalId })).toHaveLength(changesBefore)

    // NOTHING WAS COPIED ACROSS. The proposal's question, options, reasoning and evidence are the
    // AGENT'S words; the server moving them into a human-only record would be the false provenance
    // the human-only rule exists to prevent, done by the server instead of by the agent.
    const decision = bodyOf(res)['decision'] as { id: string; data: Record<string, unknown> }
    expect(decision.data).toEqual({
      because: 'A regression after two changes at once cannot be attributed to either.',
      // WRITTEN BY PANELX, NOT COPIED FROM THE PROPOSAL. `recorded_by` says who wrote the decision
      // down and is filled from the actor on this request — a caller may not send it. It is the one
      // key on a decision that does not come from the person promoting the fork, and it says the
      // person did it. See tests/authority-on-a-decision.test.ts.
      recorded_by: `human ${THE_TEST_OFFICES_OWNER.id}`,
      // AND THE THREE THE ROUTE WRITES SO THE DECISION CAN BE CORRECTED AFTERWARDS, added on 6
      // September 2026. They are not copied from the proposal either: `authority_reference` holds
      // the proposal's ID and none of its words. Until then a promoted decision said nothing about
      // what it stood on, so the first attempt to correct one was refused for the fields the route
      // had left blank — problem `EV_G2eOWHeWy`, and
      // tests/a-promoted-decision-says-what-it-stands-on.test.ts is where the rule is proved.
      authority: 'the owner said so',
      decided_by: 'the owner',
      authority_reference: proposalId,
      // AND WHAT IT REPLACES, answered by the office because neither the press nor the proposal said, and no earlier
      // decision shares a subject with the fork (problem ZSWftCSVUP2r). Written by the route, not copied.
      replaces: [],
      why_it_replaces_none: 'Nobody named one, and no earlier decision in this project is linked to the same records as the fork it settles.',
    })
    expect(Object.keys(decision.data)).not.toContain('question')
    expect(Object.keys(decision.data)).not.toContain('options')

    // And it SAYS so, rather than leaving a human to discover that the reasoning did not come with
    // it — including what is left on the proposal that they might want to carry across by hand.
    const note = String(bodyOf(res)['note'])
    expect(note).toContain('nothing was copied')
    expect(note).toContain(proposalId)
    expect(note).toContain('alternatives_rejected')
  })

  /**
   * HOW THIS TEST MAKES THE WRITE FAIL CHANGED ON 17 AUGUST 2026, and the owner is why.
   *
   * It used to file a note called "A title somebody already took" and then promote onto that title,
   * because a repeated title was refused. The owner overturned that rule — ID is identity, title is
   * presentation, titles may repeat — so the same request is now a 201 and the old test was
   * measuring a refusal that no longer exists.
   *
   * It is rewritten rather than deleted, and the refusal it uses now is the field gate: a decision
   * with a key its kind does not declare. What it still proves is that a REFUSED promotion leaves
   * no decision, no link and an open proposal.
   *
   * WHAT IS NO LONGER MEASURED HERE, said rather than left to be discovered. The taken title was the
   * only refusal reachable over HTTP that could fire with the decision row already inserted, so this
   * no longer exercises the rollback itself — every refusal a request can now provoke happens before
   * the insert. The transaction is still there (`promoteProposal` in src/server/lib/records.ts) and
   * nothing in this file measures it any more.
   */
  it('writes nothing at all when the decision is refused', async () => {
    const proposalId = await fileFork()

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'Stay on position control', data: { because: 'whatever', nonsense: 1 } },
    })
    expect(res.statusCode, res.body).toBe(400)

    expect(h.db.api.listRecords({ workspaceId: 'default', kind: 'decision', includeDeleted: true })).toHaveLength(0)
    expect(h.db.api.resolveLinks(proposalId)).toEqual([])
    expect((await resolutionOf(proposalId)).resolved).toBe(false)
  })

  it('files the decision when its title is one another record already answers to, and says so', async () => {
    // The other half of the rule the test above used to pin. A fork settled with a title somebody
    // has used before is a real thing to record, and the reply names what else is called that.
    const proposalId = await fileFork()
    const note = h.db.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'A title somebody already took',
      actor: AGENT,
    })

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'A title somebody already took', data: { because: 'whatever' } },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect((bodyOf(res)['sameTitle'] as { id: string }[]).map((r) => r.id)).toEqual([note.id])
    expect((await resolutionOf(proposalId)).resolved).toBe(true)
  })

  it('will not settle one fork twice, and names the decision that settled it', async () => {
    const proposalId = await fileFork()
    const first = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'Stay on position control' },
    })
    expect(first.statusCode, first.body).toBe(201)

    const again = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'Move to torque control now' },
    })
    expect(again.statusCode, again.body).toBe(409)
    expect(errorOf(again)).toContain('Stay on position control')
    // Two decisions derived from one fork with nothing saying which of them stands is worse than a
    // refusal, so the second one is not written at all.
    expect(h.db.api.listRecords({ workspaceId: 'default', kind: 'decision' })).toHaveLength(1)
    expect(errorOf(again)).toContain('supersedes')
  })

  it('refuses to promote something that is not a fork, or a fork that was withdrawn', async () => {
    const notAFork = h.db.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Just a note', actor: AGENT })
    const wrongKind = await h.app.inject({
      method: 'POST',
      url: `/api/records/${notAFork.id}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'A decision about a note' },
    })
    expect(wrongKind.statusCode, wrongKind.body).toBe(400)
    expect(errorOf(wrongKind)).toContain('note')

    const withdrawn = await fileFork('A fork that was withdrawn')
    expect((await h.app.inject({ method: 'DELETE', url: `/api/records/${withdrawn}`, headers: AS_HUMAN })).statusCode).toBe(200)
    const deleted = await h.app.inject({
      method: 'POST',
      url: `/api/records/${withdrawn}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'A decision from a withdrawn fork' },
    })
    // A decision derived from reasoning that is off every page is worse than one with no proposal
    // at all, so the restore route is named instead.
    expect(deleted.statusCode, deleted.body).toBe(400)
    expect(errorOf(deleted)).toContain(`/api/records/${withdrawn}/restore`)

    const nothing = await h.app.inject({
      method: 'POST',
      url: '/api/records/no-such-id/promote',
      headers: AS_HUMAN,
      payload: { title: 'A decision from nothing' },
    })
    expect(nothing.statusCode).toBe(404)
    expect(h.db.api.listRecords({ workspaceId: 'default', kind: 'decision', includeDeleted: true })).toHaveLength(0)
  })
})

// ============================================================ 3. resolution is derived, not stored

describe('whether a fork is settled is read off the link, every time it is asked', () => {
  it('answers settled, then open, then settled again — while the proposal is never written to', async () => {
    // THE PROOF THAT IT IS DERIVED. A stored flag could not do this: the proposal is written once,
    // at the start, and never again — and its answer changes twice, because the answer is a fact
    // about the DECISION and the link, which is exactly what "derived" means.
    const proposalId = await fileFork()
    const wroteOnce = h.db.api.listChanges({ workspaceId: 'default', recordId: proposalId }).length

    const promoted = await h.app.inject({
      method: 'POST',
      url: `/api/records/${proposalId}/promote`,
      headers: AS_HUMAN,
      payload: { title: 'Stay on position control' },
    })
    expect(promoted.statusCode, promoted.body).toBe(201)
    const decisionId = (bodyOf(promoted)['decision'] as { id: string }).id
    expect((await resolutionOf(proposalId)).resolved).toBe(true)

    // The human withdraws the decision. The link is KEPT — a withdrawn answer is part of the record
    // — and the fork goes back into the queue rather than reading as settled by something that is
    // on no page any more.
    expect((await h.app.inject({ method: 'DELETE', url: `/api/records/${decisionId}`, headers: AS_HUMAN })).statusCode).toBe(200)
    const reopened = await resolutionOf(proposalId)
    expect(reopened.resolved).toBe(false)
    expect(one(reopened.by, 'withdrawn decision').deleted).toBe(true)
    expect(reopened.note).toContain('Open again')

    // And back, on the restore.
    expect((await h.app.inject({ method: 'POST', url: `/api/records/${decisionId}/restore`, headers: AS_HUMAN })).statusCode).toBe(200)
    expect((await resolutionOf(proposalId)).resolved).toBe(true)

    // Through all three answers the proposal was never touched.
    expect(h.db.api.listChanges({ workspaceId: 'default', recordId: proposalId })).toHaveLength(wroteOnce)
  })

  it('is not answered at all for a kind the question does not apply to', async () => {
    // "Unresolved" about a module would be a state Mole Office invented. The key is absent instead.
    const module = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: 'YuMi controller',
      data: { context: 'why', parts: [] },
      actor: AGENT,
    })
    const page = await h.app.inject({ method: 'GET', url: `/api/records/${module.id}` })
    expect('resolution' in bodyOf(page)).toBe(false)
  })

  it('is not fooled by a link of another type, or by a record that is not a decision', async () => {
    // The rule is narrow on purpose: a `decision`, through `derived_from`, pointing AT the proposal.
    // Anything looser would let an ordinary agent link close a question nobody answered.
    const proposalId = await fileFork()
    const session = h.db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'a run', data: { state: 'finished' }, actor: AGENT })
    const decision = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'decision',
      title: 'Something the human decided about something else',
      actor: h.db.api.HUMAN,
    })

    // A session derived from the proposal: not a decision, so the fork is still open.
    h.db.api.createLink({ fromId: session.id, toId: proposalId, type: 'derived_from', actor: AGENT })
    // A decision that merely RELATES to it: the honest weak statement, and it settles nothing.
    h.db.api.createLink({ fromId: decision.id, toId: proposalId, type: 'relates_to', actor: AGENT })
    // The proposal pointing at the decision, which is the same link read backwards. It says the
    // fork was derived from the decision, which is not what happened and must not resolve it.
    h.db.api.createLink({ fromId: proposalId, toId: decision.id, type: 'derived_from', actor: AGENT })

    expect((await resolutionOf(proposalId)).resolved).toBe(false)
  })

  it('refuses the agent that would point an existing decision at a fork — §36 answers §21', async () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and the comment beside it named §21 in
    // design/DECISIONS-PENDING.md as the open question about whether it should be allowed. The
    // owner answered it inside §36: a governance-settling link requires an explicit human actor.
    //
    // Why it was worth closing rather than reading around: the agent was never manufacturing a
    // decision — the human wrote that, and the human-only guard held — but pointing it at a
    // DIFFERENT fork settles that fork, and the settling IS the link. A decision about position
    // control could be made to answer a question about the gripper by something that had no
    // authority to answer either.
    const proposalId = await fileFork()
    const decision = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'decision',
      title: 'Stay on position control',
      actor: h.db.api.HUMAN,
    })

    const linked = await h.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: AS_AGENT,
      payload: { fromId: decision.id, toId: proposalId, type: 'derived_from' },
    })
    expect(linked.statusCode, linked.body).toBe(403)
    expect(linked.body).toContain('claude-code')
    // The fork is exactly as it was — still open, still the person's to answer.
    expect((await resolutionOf(proposalId)).resolved).toBe(false)
  })

  it('still says WHO joined the two when a person does it, because a link carries its own author', async () => {
    // The reading did not go away with the refusal above. A human other than the one who wrote the
    // decision may point it at a fork, and "who settled this" is a different question from "who
    // decided it" — so the resolution names the linker rather than letting every settling read as
    // the decision-writer's act.
    const proposalId = await fileFork()
    const decision = h.db.api.createRecord({ workspaceId: 'default',
      kind: 'decision',
      title: 'Stay on position control',
      actor: h.db.api.HUMAN,
    })

    const linked = await h.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { fromId: decision.id, toId: proposalId, type: 'derived_from' },
    })
    expect(linked.statusCode, linked.body).toBe(201)

    const resolution = await resolutionOf(proposalId)
    expect(resolution.resolved).toBe(true)
    expect(one(resolution.by, 'resolving decision').linkedBy).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(resolution.note).toContain(THE_TEST_OFFICES_OWNER.id)
  })
})
