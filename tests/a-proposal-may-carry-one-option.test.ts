// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROPOSAL MAY CARRY ONE OPTION WHEN THAT OPTION IS A PLAN TO APPROVE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The proposal kind's `options` guidance said *"Two at least: one option is not a fork, it is a
 * plan"*. Nothing enforced it — the validator accepts an array of any length — but agents read the
 * guidance over `GET /api/kinds` and obey it as a rule. An agent filed a case with one real answer as
 * three options because of it, and the owner saw three where the case had one and asked for the
 * writer to fit the number to the case. On 21 September 2026 the agent patched its proposal down to a
 * single option and the reply was 200 with nothing incomplete.
 *
 * THE GUIDANCE IS NOW THE ONLY PLACE THE RULE LIVES, and these tests hold the product to what it
 * promises: one option is accepted with nothing incomplete, it is drawn on the proposal page, and a
 * decision settles it like any other. The words themselves are pinned in tests/kinds.test.ts,
 * because that is the file that fails when a description drifts.
 *
 * THE MUTATION FOR EACH TEST. There is no minimum in the product to delete, so the proof breaks the
 * promise instead: a two-option check added to the validator turns the two write-and-settle tests
 * red, and making `optionCards` drop a lone option turns the drawing test red. Both were applied,
 * observed red, and put back.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

const WORKSPACE = 'default'
const PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
  'content-type': 'application/json',
}
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': WORKSPACE,
  'content-type': 'application/json',
}

/** The one answer a plan-to-approve fork carries. It states the plan and what it costs. */
const ONE_OPTION = 'Adopt the plan as written: it is the shortest road to the result, and it leaves the two open jobs waiting.'

const QUESTION = 'Approve the plan as written?'

let t: TestDb
let app: FastifyInstance
type GovernanceModule = typeof import('../src/web/components/Governance.tsx')
let Governance: GovernanceModule

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // The browser half needs a window stand-in before the component tree is imported, exactly as
  // tests/a-proposal-says-what-the-answer-is-for.test.ts describes. Nothing in it is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  Governance = await import('../src/web/components/Governance.tsx')
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

async function get(url: string, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

/** A plan put to the person, filed by an agent with the one option it has. Returns its id. */
async function fileThePlan(): Promise<string> {
  const filed = await post(
    '/api/records',
    { kind: 'proposal', title: QUESTION, data: { question: QUESTION, options: [ONE_OPTION] } },
    AGENT,
  )
  expect(filed.status, `an agent could not file a one-option proposal: ${JSON.stringify(filed.body)}`).toBe(201)
  return filed.body.record.id as string
}

/** The fork's panel as markup, without its stylesheet: a class name in CSS is not words on a screen. */
function card(data: Record<string, unknown>): string {
  const html = renderToStaticMarkup(
    h(Governance.ProposalGovernance, {
      recordId: 'p1',
      title: QUESTION,
      data,
      resolved: false,
      sections: sectionsOf({ id: 'p1', kind: 'proposal', data, title: QUESTION, summary: null, relations: [] }),
      onSettled: () => {},
    }),
  )
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

// ============================================================ accepted

describe('a proposal with one option is a complete record', () => {
  it('is accepted with nothing incomplete, and stores the single option', async () => {
    const filed = await post(
      '/api/records',
      { kind: 'proposal', title: QUESTION, data: { question: QUESTION, options: [ONE_OPTION] } },
      AGENT,
    )
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.body.record.data.options).toEqual([ONE_OPTION])
    // NOTHING INCOMPLETE is the claim the guidance makes: one option is not a stub, it is the case.
    expect(filed.body.incomplete).toEqual([])
  })
})

// ============================================================ drawn

describe('the fork panel the proposal page mounts draws the one option', () => {
  it('draws the option, and calls the section one option rather than an empty fork', () => {
    const html = card({ question: QUESTION, options: [ONE_OPTION] })
    expect(html).toContain(QUESTION)
    expect(html).toContain(ONE_OPTION)
    // THE HEADING THE READER SEES. A fork with one option is one option, not a fork with a missing
    // second one — the title counts it through the word list's singular form.
    expect(html).toContain('1 option')
    expect(html).toContain('px-gov-opts')
  })
})

// ============================================================ settled

describe('a proposal with one option is settled by a decision like any other', () => {
  it('reads open, and reads settled the moment the person promotes it', async () => {
    const fork = await fileThePlan()
    const before = await get(`/api/records/${fork}`)
    expect(before.body.resolution.resolved, before.body.resolution?.note).toBe(false)

    const settled = await post(`/api/records/${fork}/promote`, {
      title: 'Adopt the plan',
      data: {
        option_taken: ONE_OPTION,
        option_index: 0,
        because: 'The two open jobs wait on this, and the plan is the shortest road.',
      },
    })
    expect(settled.status, JSON.stringify(settled.body)).toBeLessThan(300)

    const after = await get(`/api/records/${fork}`)
    expect(after.body.resolution.resolved).toBe(true)
    expect(after.body.resolution.by.map((one: { id: string }) => one.id)).toContain(settled.body.decision.id)
    // THE ONE OPTION IS THE ONE TAKEN, so the decision that took it has nothing to reject. The
    // guidance says so in words; this is the product saying it in the record by leaving the field
    // out altogether.
    expect(settled.body.decision.data.option_taken).toBe(ONE_OPTION)
    expect(settled.body.decision.data.alternatives_rejected).toBeUndefined()
  })
})
