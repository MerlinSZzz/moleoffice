// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT SAYING IT WENT SOMEWHERE ELSE, AND WHAT PANELX MAKES OF THAT WITHOUT OVERRULING IT.
 *
 * Two claims, and the second is the one that is easy to ship broken.
 *
 * 1. The closed lists are closed. A question outside the eleven, a verdict outside the three and a
 *    source outside the two are refused, and `wanted_other` is required with `other` and forbidden
 *    without it — both halves, because a rule that only fires one way is half a rule.
 * 2. THE REFUSALS DO NOT REFUSE EVERYBODY. Every test here has its opposite: a legitimate report of
 *    each shape is accepted. A guard that turned away every caller would pass the first half of this
 *    file on its own.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { outsideReads } from '../src/server/db/schema.ts'
import { WANTED, VERDICTS, OUTSIDE_SOURCES, isOperationName, operationNamed } from '../src/shared/ops.ts'

/** The project this case reports into, made fresh so a count sees only this case's rows. */
let HERE = 'default'
let caseNumber = 0

const agent = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-13',
  'x-mole-office-workspace': HERE,
})

let t: TestDb
let app: FastifyInstance
let makeWorkspace: (input: { id: string; title: string }) => unknown

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

beforeEach(() => {
  caseNumber += 1
  HERE = `usage-outside-case-${String(caseNumber)}`
  makeWorkspace({ id: HERE, title: `Usage outside case ${String(caseNumber)}` })
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** The rows this case filed, and no earlier case's. */
const stored = () => t.client.db.select().from(outsideReads).where(eq(outsideReads.workspaceId, HERE)).all()

async function report(body: unknown, headers: Record<string, string> = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/usage/outside-reads', headers: { ...agent(), ...headers }, payload: body as object })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

const A_GOOD_REPORT = {
  source: 'file',
  what: 'design/CURRENT-CAMPAIGN.md',
  wanted: 'which-campaign',
  verdict: 'gap',
}

describe('the report is accepted, and stored as the agent sent it', () => {
  it('takes a legitimate report and files one row', async () => {
    const { status, body } = await report(A_GOOD_REPORT)
    expect(status).toBe(201)
    const rows = stored()
    expect(rows.length).toBe(1)
    expect(rows[0]!.wanted).toBe('which-campaign')
    // THE VERDICT IS STORED AS SENT. Mole Office compares; it does not correct.
    expect(rows[0]!.verdict).toBe('gap')
    expect(rows[0]!.what).toBe('design/CURRENT-CAMPAIGN.md')
    expect(body['id']).toBeTypeOf('string')
  })

  it('joins the report to the call that filed it, so the machine is read once and not stored twice', async () => {
    await report(A_GOOD_REPORT)
    const row = stored()[0]!
    expect(row.callId).toBeTypeOf('string')
    // AND THE TABLE HOLDS NO ADDRESS OF ITS OWN. The one value whose meaning changes with the
    // serving arrangement lives in one place.
    expect(Object.keys(row)).not.toContain('clientAddr')
  })

  it('says what it counted the claim as, without changing what it stored', async () => {
    // `which-campaign` IS ANSWERED BY AN OPERATION, so an agent calling it a gap is "not found":
    // Mole Office had something and the agent did not use it. That is evidence about discoverability, not
    // about a missing capability, and the two must not be one number.
    const answered = await report(A_GOOD_REPORT)
    expect(answered.body['counted']).toBe('not found')
    expect(answered.body['moleOfficeHasAnOperationFor']).toBe('project.bootstrap')

    // `repo-head` IS ANSWERED BY NOTHING, so the same verdict is a capability gap.
    const unanswered = await report({ source: 'shell', what: 'git rev-parse HEAD', wanted: 'repo-head', verdict: 'gap' })
    expect(unanswered.body['counted']).toBe('capability gap')
    expect(unanswered.body['moleOfficeHasAnOperationFor']).toBeNull()
  })

  it('keeps a shell command whole, because the query-string rule is about the request log and not this table', async () => {
    // THE FIXTURE THAT PROVES THE RULE IS NOT WIDER THAN ITS TABLE. `npm test 2>&1 | tail` is a
    // correct value here, and a rule forbidding `&` on all four tables would turn it red.
    const { status } = await report({
      source: 'shell',
      what: 'npm test 2>&1 | tail',
      wanted: 'build-or-test-result',
      verdict: 'boundary',
    })
    expect(status).toBe(201)
    expect(stored()[0]!.what).toBe('npm test 2>&1 | tail')
  })
})

describe('the closed lists are closed, and each refusal has its opposite', () => {
  it('refuses a question that is not one of the eleven, and takes every one that is', async () => {
    const refused = await report({ ...A_GOOD_REPORT, wanted: 'what-the-weather-is' })
    expect(refused.status).toBe(400)
    for (const entry of WANTED) {
      const ok = await report({
        source: 'file',
        what: 'somewhere',
        wanted: entry.name,
        verdict: 'unsure',
        ...(entry.name === 'other' ? { wanted_other: 'which robot arm is plugged in' } : {}),
      })
      expect(ok.status, entry.name).toBe(201)
    }
  })

  it('refuses a fourth verdict, and takes all three', async () => {
    const refused = await report({ ...A_GOOD_REPORT, verdict: 'probably' })
    expect(refused.status).toBe(400)
    for (const verdict of VERDICTS) {
      const ok = await report({ ...A_GOOD_REPORT, verdict })
      expect(ok.status, verdict).toBe(201)
    }
  })

  it('refuses a third source, and takes both', async () => {
    const refused = await report({ ...A_GOOD_REPORT, source: 'memory' })
    expect(refused.status).toBe(400)
    for (const source of OUTSIDE_SOURCES) {
      const ok = await report({ ...A_GOOD_REPORT, source })
      expect(ok.status, source).toBe(201)
    }
  })

  it('requires the words beside `other`, and forbids them beside a question that has a word', async () => {
    const missing = await report({ ...A_GOOD_REPORT, wanted: 'other' })
    expect(missing.status).toBe(400)
    expect(String(missing.body['error'])).toContain('wanted_other')

    const spare = await report({ ...A_GOOD_REPORT, wanted_other: 'something else entirely' })
    expect(spare.status).toBe(400)

    // AND BOTH LEGITIMATE SHAPES ARE ACCEPTED, which is what makes the two refusals above rules
    // rather than a door that is simply shut.
    expect((await report({ ...A_GOOD_REPORT, wanted: 'other', wanted_other: 'which robot arm is plugged in' })).status).toBe(201)
    expect((await report(A_GOOD_REPORT)).status).toBe(201)
  })

  it('refuses a key nobody declared, with dataPatch semantics — the bag is not replaced by a valid body', async () => {
    // AN UNKNOWN KEY IS REFUSED RATHER THAN DROPPED. A body that carried a misspelt field and was
    // accepted would file a row missing the thing the caller thought it had sent.
    const { status, body } = await report({ ...A_GOOD_REPORT, verdictt: 'gap' })
    expect(status).toBe(400)
    expect(String(body['error'])).toContain('verdictt')
  })
})

describe('the question list is bound to the operation vocabulary in both directions', () => {
  it('names only operations that exist and are live', () => {
    // WITHOUT THIS, retiring `project.needs-you` leaves this map pointing at it, and a real
    // capability gap goes on being labelled "not found" with nothing anywhere failing: no type
    // error, no red test, no visible symptom.
    for (const entry of WANTED) {
      if (entry.answeredBy === null) continue
      expect(isOperationName(entry.answeredBy), entry.name).toBe(true)
      expect(operationNamed(entry.answeredBy)?.live, entry.name).toBe(true)
    }
  })
})
