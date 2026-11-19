// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLACEHOLDER MAY NOT SETTLE GOVERNANCE, AND MAY NOT BE ERASED INSTEAD.
 *
 * ---------------------------------------------------------------------------------------
 * THE FORK
 * ---------------------------------------------------------------------------------------
 *
 * The owner: *"If the unresolved issue is fundamentally an owner Decision, a Placeholder may say
 * 'final detector architecture not chosen'. It may link the relevant Decision. The currently-used
 * temporary option does not become canonical merely because work continued with it."* And, in the owner's
 * failure-modes list: *use Placeholder to settle human governance*.
 *
 * The fork is a `blocks` link from the proposal to the placeholder — the fork blocks the slot from
 * being filled, which is literally what `blocks` means. Marking the slot resolved while the choice
 * is open is the act the owner forbids, so it is refused, TO EVERYBODY. A person who wants it resolved
 * writes the decision first, which is one request.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE TWO-REQUEST ERASURE, WHICH THE FORK RULE DOES NOT COVER
 * ---------------------------------------------------------------------------------------
 *
 * An agent files one `resolves` link — honest, and allowed, because resolving a restriction is a
 * claim about the world — and then marks every affected record `not_affected`. A person's
 * `stops_final` placeholder, whose whole purpose is to say *this still cannot be called final*,
 * then stops being drawn anywhere, with no reason recorded and no person involved.
 *
 * One combination is refused: `not_affected`, on a `stops_final` restriction, that a person wrote,
 * from an agent. `checked` stays open to agents, `not_affected` at `limits_claims` stays open, and
 * every one of those is proved here — a guard that refuses everybody is not a guard.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function record(kind: string, title: string, data: Record<string, unknown>, headers = PERSON): Promise<string> {
  const made = await post('/api/records', { kind, title, data }, headers)
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

async function judge(
  restriction: string,
  recordId: string,
  payload: unknown,
  headers = PERSON,
): Promise<{ status: number; body: any }> {
  const res = await app.inject({
    method: 'PUT',
    url: `/api/revalidations/${restriction}/${recordId}`,
    payload: payload as object,
    headers,
  })
  return { status: res.statusCode, body: res.json() }
}

async function aPlaceholder(severity = 'stops_final', headers = PERSON): Promise<string> {
  return record(
    'placeholder',
    'The final detector architecture is not chosen',
    {
      what: 'Nobody has chosen the final detector architecture.',
      slot: 'stand_in',
      substitute: 'the two-stage detector we happened to have running',
      because: 'The trials had to start this week.',
      resolved_when: 'The architecture decision is made and the chosen detector is in place.',
      allowed_uses: ['pipeline plumbing'],
      disallowed_claims: ['any comparison of detector quality', 'production deployment validation'],
      severity,
    },
    headers,
  )
}

describe('a placeholder waiting on a fork cannot be resolved', () => {
  it('refuses the resolving link while the proposal is open, even for the person', async () => {
    const placeholder = await aPlaceholder()
    const fork = await record('proposal', 'Which detector architecture', {
      question: 'Which detector architecture do we build on?',
      options: ['the two-stage one', 'the single-shot one'],
    })
    expect((await post('/api/links', { fromId: fork, toId: placeholder, type: 'blocks' })).status).toBe(201)

    const answer = await record('claim', 'The two-stage detector is in place', { state: 'measured' })
    const refused = await post('/api/links', { fromId: answer, toId: placeholder, type: 'resolves' })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toContain('fork nobody has settled')
    expect(refused.body.error).toContain(fork)
  })

  it('allows it once the fork has been settled, so the refusal is about the fork and not about the kind', async () => {
    const placeholder = await aPlaceholder()
    const fork = await record('proposal', 'Which detector architecture', {
      question: 'Which detector architecture do we build on?',
      options: ['the two-stage one', 'the single-shot one'],
    })
    expect((await post('/api/links', { fromId: fork, toId: placeholder, type: 'blocks' })).status).toBe(201)
    const decision = await record('decision', 'We build on the two-stage detector', {
      replaces: [],
      because: 'It is the one the trials ran on and the numbers hold.',
    })
    expect((await post('/api/links', { fromId: decision, toId: fork, type: 'derived_from' })).status).toBe(201)

    const answer = await record('claim', 'The two-stage detector is in place', { state: 'measured' })
    const allowed = await post('/api/links', { fromId: answer, toId: placeholder, type: 'resolves' })
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201)
  })

  it('resolves a placeholder with no fork behind it, because the rule is narrow', async () => {
    const placeholder = await aPlaceholder()
    const answer = await record('claim', 'Somebody supplied it', { state: 'measured' })
    expect((await post('/api/links', { fromId: answer, toId: placeholder, type: 'resolves' })).status).toBe(201)
  })

  it('refuses one restriction resolving another', async () => {
    const one = await aPlaceholder()
    const other = await record('placeholder', 'Another unresolved slot', {
      what: 'Something else is unresolved.',
      slot: 'empty',
      resolved_when: 'Somebody supplies it.',
      allowed_uses: ['plumbing'],
      disallowed_claims: ['numbers'],
      severity: 'limits_claims',
    })
    const refused = await post('/api/links', { fromId: other, toId: one, type: 'resolves' })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toContain('cannot resolve')
  })

  it('is in no reply of the governance queue, and changes no count there', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/waiting', headers: PERSON })
    const forksBefore = await app.inject({ method: 'GET', url: '/api/forks', headers: PERSON })
    const placeholder = await aPlaceholder()
    const after = await app.inject({ method: 'GET', url: '/api/waiting', headers: PERSON })
    const forksAfter = await app.inject({ method: 'GET', url: '/api/forks', headers: PERSON })

    expect(JSON.stringify(after.json())).not.toContain(placeholder)
    expect(JSON.stringify(forksAfter.json())).not.toContain(placeholder)
    expect(after.json().items.length).toBe(before.json().items.length)
    expect(forksAfter.json().forks.length).toBe(forksBefore.json().forks.length)
    const needsYou = await app.inject({ method: 'GET', url: '/api/needs-you', headers: PERSON })
    expect(JSON.stringify(needsYou.json())).not.toContain(placeholder)
  })
})

describe('an agent cannot erase a person’s restriction by dismissing it', () => {
  /** A person's `stops_final` placeholder about A, with B resting on A, resolved by an agent. */
  async function resolvedByAnAgent(severity = 'stops_final', author = PERSON) {
    const a = await record('claim', 'The restricted result', { state: 'measured' }, author)
    const b = await record('claim', 'The result that rests on it', { state: 'measured' }, author)
    const placeholder = await aPlaceholder(severity, author)
    expect((await post('/api/links', { fromId: placeholder, toId: a, type: 'about' }, author)).status).toBe(201)
    expect((await post('/api/links', { fromId: b, toId: a, type: 'derived_from' }, author)).status).toBe(201)
    const answer = await record('claim', 'The detector is in place', { state: 'measured' }, AGENT)
    // RESOLVING IS ALLOWED TO AN AGENT. It is a claim about the world and an agent may make one.
    const resolved = await post('/api/links', { fromId: answer, toId: placeholder, type: 'resolves' }, AGENT)
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201)
    expect(resolved.body.revalidation.written).toBe(2)
    return { placeholder, a, b }
  }

  it('refuses "was not affected" from an agent, on every record it reached, and names what to do instead', async () => {
    const { placeholder, a, b } = await resolvedByAnAgent()
    for (const id of [a, b]) {
      const refused = await judge(placeholder, id, { state: 'not_affected', note: 'I think it is fine' }, AGENT)
      expect(refused.status).toBe(403)
      expect(refused.body.error).toContain('file a claim or a comment')
    }
    // AND THE RESTRICTION IS STILL RETURNED ON BOTH.
    for (const id of [a, b]) {
      const res = await app.inject({ method: 'GET', url: `/api/restrictions?record=${id}`, headers: PERSON })
      expect(res.json().found.map((r: any) => r.restrictionId)).toContain(placeholder)
    }
  })

  it('takes "still stands" from the same agent, so the guard is narrow and not a wall', async () => {
    const { placeholder, b } = await resolvedByAnAgent()
    const accepted = await judge(placeholder, b, { state: 'checked' }, AGENT)
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    expect(accepted.body.row.state).toBe('checked')
  })

  it('takes "was not affected" from the same agent when the restriction only limits claims', async () => {
    const { placeholder, b } = await resolvedByAnAgent('limits_claims')
    const accepted = await judge(
      placeholder,
      b,
      { state: 'not_affected', note: 'This result never used the detector output at all.' },
      AGENT,
    )
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
  })

  it('takes "was not affected" from an agent on an agent’s own stops_final restriction', async () => {
    const { placeholder, b } = await resolvedByAnAgent('stops_final', AGENT)
    const accepted = await judge(
      placeholder,
      b,
      { state: 'not_affected', note: 'This one was mine and it never reached this result.' },
      AGENT,
    )
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
  })

  it('takes it from the person, whose restriction it is', async () => {
    const { placeholder, b } = await resolvedByAnAgent()
    const accepted = await judge(
      placeholder,
      b,
      { state: 'not_affected', note: 'Looked at it — this one never rested on the intrinsics.' },
      PERSON,
    )
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
  })

  it('refuses "was not affected" with no reason, from anybody', async () => {
    const { placeholder, b } = await resolvedByAnAgent('limits_claims')
    for (const who of [PERSON, AGENT]) {
      const refused = await judge(placeholder, b, { state: 'not_affected' }, who)
      expect(refused.status).toBe(400)
      expect(refused.body.error).toContain('needs a reason')
    }
    // AND "STILL STANDS" NEEDS NONE, because "I re-ran it and it holds" is a complete answer.
    expect((await judge(placeholder, b, { state: 'checked' }, PERSON)).status).toBe(200)
  })
})
