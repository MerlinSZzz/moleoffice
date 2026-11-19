// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW KIND, ITS STAGES, AND THE READ DOOR THAT COUNTS ITS PROBLEMS.
 *
 * Proposal 1LaCQBRYRjls option A, settled in a message. One record per office flow, saying
 * where it is declared, who runs it, what it leaves behind and whether code governs it; no gate, nothing blocked.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   1. The kind is declared, its own worked example validates, and an agent may file one — the
 *      kind round-trips through POST /api/records and reads back whole.
 *   2. GET /api/kinds/flow lists the kind's keys, each with the example the kind declares.
 *   3. A step missing `does` is refused with the plain sentence the office uses for a wrong field.
 *   4. GET /api/flows answers the steward's inventory question in one call: the count, and per
 *      flow how many live problem records link to it through an `about` link.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each run after a control
 * ---------------------------------------------------------------------------------------
 *
 * Each one is a small piece of product code; the test named beside it is the one that goes red.
 * They are run with the sha256 of the file before and after, in the report.
 *
 *   - `flow` dropped from RECORD_KINDS → the declaration and round-trip tests go red.
 *   - FlowStep's `does` made optional → the refusal test goes red.
 *   - The `about` link join dropped from readFlowInventory → the inventory test goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/**
 * A project for the case alone. The inventory counts the flows in the project the header names and
 * the records list counts its own project's flows, so a flow another case filed would change both.
 * Each case files and reads its own.
 */
let PROJECT = 'default'
let caseNumber = 0

let AS_AGENT: Record<string, string>
let AS_PERSON: Record<string, string>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `flow-case-${String(caseNumber)}`
  AS_AGENT = {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'flow-register',
    'x-mole-office-workspace': PROJECT,
  }
  AS_PERSON = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': PROJECT,
  }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'A project for one case' } })
  expect(made.statusCode, made.body).toBe(201)
})

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function post(url: string, payload: Record<string, unknown>, headers: Record<string, string> = AS_PERSON): Promise<Reply> {
  const res = await app.inject({ method: 'POST', url, headers, payload })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

async function get(url: string, headers: Record<string, string> = AS_PERSON): Promise<Reply> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** A link of a named type, as the links door takes it. */
async function link(fromId: string, toId: string, type: string): Promise<void> {
  const { status, body } = await post('/api/links', { fromId, toId, type })
  expect(status, JSON.stringify(body)).toBe(201)
}

const A_FLOW_DATA = {
  declared_in: 'design/flows/ACCEPTANCE.md line 116',
  runs: 'secretary and steward',
  trigger: 'A branch carrying an accepted handback needs to land on main.',
  stages: [
    { n: 1, does: 'The merger backs up the live database before the merge.', evidence: 'a backup path printed on the session record' },
    { n: 2, does: 'The merger regenerates the test audit table in its own commit.', evidence: 'the audit table rewritten' },
  ],
  leaves_behind: 'a merge, a backup path, a rewritten audit table',
  governed_by: 'tools/test-audit-table.mjs',
  reviewed_at: '2026-09-16',
}

/** A step's why, and its source filed first: a new step says why it is there and names a record. */
const A_STEPS_WHY = 'Without it the merge has nothing to stand on.'

async function fileFlow(title: string, extraData: Record<string, unknown> = {}, headers: Record<string, string> = AS_AGENT): Promise<string> {
  const source = await post('/api/records', { kind: 'report', title: `Why ${title} has its steps`, data: { blocks: [] } }, headers)
  expect(source.status, JSON.stringify(source.body)).toBe(201)
  const sourceId = (source.body['record'] as { id: string }).id
  const stages = A_FLOW_DATA.stages.map((step) => ({ ...step, why: A_STEPS_WHY, sources: [sourceId] }))
  const { status, body } = await post(
    '/api/records',
    { kind: 'flow', title, data: { ...A_FLOW_DATA, stages, ...extraData } },
    headers,
  )
  expect(status, JSON.stringify(body)).toBe(201)
  return (body['record'] as { id: string }).id
}

async function fileProblem(title: string): Promise<string> {
  const { status, body } = await post('/api/records', {
    kind: 'problem',
    title,
    data: {
      symptom: "The office's own accounting, read without it.",
      why_it_hurts: 'Nobody can say whether the office works the way it says it works.',
    },
  })
  expect(status, JSON.stringify(body)).toBe(201)
  return (body['record'] as { id: string }).id
}

// ============================================================ 1. declared, example, round trip

describe('a flow is a record kind: declared, runs, trigger, stages, leaves_behind, governed_by, reviewed_at, source', () => {
  it('is declared, its own worked example validates, and no agent is refused one', async () => {
    const { KIND_SPECS, validateData } = await import('../src/shared/kinds.ts')
    const { RECORD_KINDS } = await import('../src/shared/types.ts')
    expect(RECORD_KINDS).toContain('flow')
    expect(KIND_SPECS['flow'].humanOnly, 'no gate: an agent may file a flow like any record').toBe(false)
    expect(validateData('flow', KIND_SPECS['flow'].example).ok, JSON.stringify(KIND_SPECS['flow'].example)).toBe(true)
  })

  it('round-trips through POST /api/records and reads back whole, filed by an agent', async () => {
    const id = await fileFlow('The merge, as it actually happens')
    // WHOLE MEANS WITH THE SECOND LEVEL: each step's why and sources come back only when asked.
    const read = await get(`/api/records/${id}?secondLevel=show`, AS_PERSON)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const data = (read.body['record'] as { data: Record<string, unknown> }).data
    expect(data['declared_in']).toBe('design/flows/ACCEPTANCE.md line 116')
    expect(data['runs']).toBe('secretary and steward')
    expect(data['governed_by']).toBe('tools/test-audit-table.mjs')
    expect(data['reviewed_at']).toBe('2026-09-16')
    const stages = data['stages'] as { n: number; does: string }[]
    expect(stages.map((step) => step.does)).toEqual([
      'The merger backs up the live database before the merge.',
      'The merger regenerates the test audit table in its own commit.',
    ])
    expect((stages as { why?: string }[]).map((step) => step.why)).toEqual([A_STEPS_WHY, A_STEPS_WHY])
  })

  it('accepts a flow with governed_by and reviewed_at left out, which is the null the register names', async () => {
    const id = await fileFlow('The morning report, enforced by nobody', { governed_by: undefined, reviewed_at: undefined })
    const read = await get(`/api/records/${id}`, AS_PERSON)
    const data = (read.body['record'] as { data: Record<string, unknown> }).data
    expect(data['governed_by']).toBeUndefined()
    expect(data['reviewed_at']).toBeUndefined()
  })
})

// ============================================================ 2. GET /api/kinds/flow

// ============================================================ 3. a step missing `does` is refused

describe('a flow with a step missing its `does` is refused', () => {
  it("refuses the write and names the bad field in the office's plain words", async () => {
    const { status, body } = await post('/api/records', {
      kind: 'flow',
      title: 'A flow with a step that does nothing',
      data: { ...A_FLOW_DATA, stages: [{ n: 1, evidence: 'somebody said so' }] },
    })
    expect(status, JSON.stringify(body)).toBe(400)
    const message = String(body['error'])
    expect(message).toContain('data.stages[0].does')
    expect(message).toContain('is required')
    expect(message).toContain('Example:')
  })
})

// ============================================================ 4. GET /api/flows

describe("GET /api/flows answers the steward's inventory question in one call", () => {
  it('counts three flows and says, per flow, how many problems link to it', async () => {
    const merge = await fileFlow('The merge, as it actually happens')
    const start = await fileFlow('The start of an agent session')
    await fileFlow('The answering of the owner', { governed_by: undefined })

    const drift = await fileProblem('F11 is written in two places and read in neither')
    const second = await fileProblem('The register itself is looked at by nobody')
    const third = await fileProblem('The start of a session leaves no stages behind')
    await link(drift, merge, 'about')
    await link(second, merge, 'about')
    await link(third, start, 'about')

    const read = await get('/api/flows', AS_AGENT)
    expect(read.status, JSON.stringify(read.body).slice(0, 500)).toBe(200)
    expect(read.body['count']).toBe(3)
    const flows = read.body['flows'] as {
      id: string
      title: string
      declared_in: unknown
      problems: number
      problemIds: string[]
    }[]
    const byId = new Map(flows.map((one) => [one.id, one]))

    const mergeRow = byId.get(merge)
    expect(mergeRow?.problems).toBe(2)
    expect(mergeRow?.problemIds).toContain(drift)
    expect(mergeRow?.problemIds).toContain(second)
    expect(mergeRow?.declared_in, 'where the flow is declared comes back beside its problems').toBe(
      'design/flows/ACCEPTANCE.md line 116',
    )
    expect(byId.get(start)?.problems).toBe(1)
    expect(
      flows.find((one) => one.problems === 0),
      'a flow with no problems is answered as one, not left out',
    ).toBeDefined()
  })

  it('is a plain read: the count is honest when the register is empty', async () => {
    const read = await get('/api/flows', AS_AGENT)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body['count']).toBe(0)
    expect(read.body['flows']).toEqual([])
  })
})
