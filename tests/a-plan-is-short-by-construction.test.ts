// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * P2 — A PLAN IS SHORT BY CONSTRUCTION.
 *
 * What these tests are about, in one sentence each:
 *
 *   - A body line over the ladder's level-2 budget (15 words) and a heading over its level-1 budget
 *     (5 words) are refused on every door that writes a line, in the ladder's own sentence.
 *   - The upper bound only: a short line and a one-word heading are accepted, because the lower
 *     bound belongs to a record's short form and not to a plan line.
 *   - A line written before the rule was refused on write is still read, unchanged, and marked as
 *     over budget where it is drawn — never shortened, hidden or renumbered.
 *   - A filed line's explanation is drawn BESIDE it — the record's conclusion where it has one, its
 *     title otherwise — and the line's own text and the note column are untouched.
 *   - A line takes the record's own shorter form when somebody asks for it, refused by the same
 *     budget when the form is too long, and is written by hand when there is no record.
 *
 * Everything goes through the real doors on a throwaway database, and the drawing is the real
 * `PlanTable` rendered to static markup with `fetch` pointed at the same app, exactly as
 * tests/plan-table.test.ts does it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import { budgetAgainst, SHORT_FORM_SPECS } from '../src/shared/zoom.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'
import type { PlanLineWithWork } from '../src/server/lib/plans.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')

let t: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule

const HUMAN = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** `n` distinct one-word tokens that `countWords` counts as one word each. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i + 1}`).join(' ')
}

type Json = Record<string, unknown>

function bodyOf(res: { body: string }): Json {
  return JSON.parse(res.body) as Json
}

/** Start a plan. The reply is handed back whatever it says, so a refusal can be read. */
async function startPlan(body: string): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  return app.inject({ method: 'POST', url: '/api/plans', payload: { title: 'Budget plan', body } })
}

async function planIdOf(body: string): Promise<string> {
  const res = await startPlan(body)
  expect(res.statusCode, res.body).toBe(201)
  return (bodyOf(res)['plan'] as { id: string }).id
}

async function planLines(id: string): Promise<PlanLineWithWork[]> {
  const res = await app.inject({ method: 'GET', url: `/api/plans/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)['lines'] as PlanLineWithWork[]
}

/** File one record straight into the default project, through the route a person uses. */
async function seedRecord(title: string, summary: string | null): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'task', title, summary, data: { state: 'todo' } },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (bodyOf(res)['record'] as { id: string }).id
}

/** Write this record's own level-1 label through the one short-forms door. */
async function writeLabel(recordId: string, text: string): Promise<void> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${recordId}/revisions`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  const list = (bodyOf(read)['revisions'] as { seq: number; contentHash: string }[]).sort((a, b) => b.seq - a.seq)
  const newest = list[0]
  expect(newest, 'the record has no revision for a short form to name').toBeDefined()
  const wrote = await app.inject({
    method: 'POST',
    url: `/api/records/${recordId}/short-forms`,
    headers: HUMAN,
    payload: { madeFrom: { seq: newest!.seq, contentHash: newest!.contentHash }, forms: { label: text } },
  })
  expect(wrote.statusCode, wrote.body).toBe(200)
}

async function pointLine(planId: string, lineId: string, recordId: string): Promise<void> {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/plans/${planId}/lines/${lineId}`,
    payload: { recordId },
  })
  expect(res.statusCode, res.body).toBe(200)
}

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function wordsSeen(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The plan table as a reader draws it, from the reply the server really wrote. */
function drawn(reply: PlanBlocksReply): string {
  return wordsSeen(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines, onWrote: () => {} }))
}

beforeAll(async () => {
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

  t = await freshDb()
  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { zoomRoutes } = await import('../src/server/api/zoom.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
  await app.register(zoomRoutes, { prefix: '/api' })
  await app.ready()

  ;(globalThis as unknown as { fetch: unknown }).fetch = async (
    input: unknown,
    init: { method?: string; headers?: HeadersInit; body?: string } = {},
  ) => {
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      ...(init.body === undefined ? {} : { payload: init.body }),
    })
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      text: async () => res.body,
    }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ a — the body line budget

describe('a body line is held to the level-2 budget, and only from above', () => {
  it('refuses a 16-word line on create, in the ladder\'s own sentence', async () => {
    const res = await startPlan(words(16))
    expect(res.statusCode, res.body).toBe(400)
    const error = bodyOf(res)['error'] as string
    expect(error).toContain(budgetAgainst(SHORT_FORM_SPECS.title, words(16))!)
    expect(error).toContain('may be at most 15')
    expect(error).toContain('Nothing was written.')
  })

  it('accepts a 15-word line', async () => {
    const id = await planIdOf(words(15))
    const lines = await planLines(id)
    expect(lines.map((one) => one.line.text)).toEqual([words(15)])
  })

  it('refuses a 16-word line added to a plan and to a whole document', async () => {
    const id = await planIdOf('a short line')
    const added = await app.inject({
      method: 'POST',
      url: `/api/plans/${id}/lines`,
      payload: { text: words(16), reason: 'the test is about the budget, so it sends a reason' },
    })
    expect(added.statusCode, added.body).toBe(400)
    expect(bodyOf(added)['error'] as string).toContain('may be at most 15')

    const bulk = await app.inject({
      method: 'PUT',
      url: `/api/plans/${id}/lines`,
      payload: { lines: [{ text: words(16) }], reason: 'the test is about the budget in a whole document' },
    })
    expect(bulk.statusCode, bulk.body).toBe(400)

    const document = await app.inject({
      method: 'PUT',
      url: `/api/plans/${id}/body`,
      payload: { body: words(16) },
    })
    expect(document.statusCode, document.body).toBe(400)
  })

  it('refuses a 16-word line on patch, and accepts a 15-word one', async () => {
    const id = await planIdOf('a short line')
    const lineId = (await planLines(id))[0]!.line.id

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: words(16) },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(bodyOf(refused)['error'] as string).toContain('may be at most 15')
    // NOTHING WAS WRITTEN, so the line still reads what it read.
    expect((await planLines(id))[0]!.line.text).toBe('a short line')

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: words(15) },
    })
    expect(accepted.statusCode, accepted.body).toBe(200)
    expect((await planLines(id))[0]!.line.text).toBe(words(15))
  })

  it('does not spend the budget on the trailing planning groups', async () => {
    const id = await planIdOf('a short line')
    const lineId = (await planLines(id))[0]!.line.id
    const withValues = `${words(15)} {size: 15h} {note: ${words(12)}}`
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: withValues },
    })
    expect(res.statusCode, res.body).toBe(200)
    expect((await planLines(id))[0]!.line.text).toBe(withValues)
  })
})

// ============================================================ b — the heading budget

describe('a heading is held to the level-1 budget, and only from above', () => {
  it('refuses a 6-word heading in the ladder\'s own sentence', async () => {
    const res = await startPlan(`# ${words(6)}`)
    expect(res.statusCode, res.body).toBe(400)
    const error = bodyOf(res)['error'] as string
    expect(error).toContain(budgetAgainst(SHORT_FORM_SPECS.label, words(6))!)
    expect(error).toContain('may be at most 5')
  })

  it('accepts a 5-word heading and a one-word heading', async () => {
    const five = await planIdOf(`# ${words(5)}`)
    expect((await planLines(five))[0]!.line.text).toBe(`# ${words(5)}`)
    const one = await planIdOf('# Goals')
    expect((await planLines(one))[0]!.line.text).toBe('# Goals')
  })

  it('holds every heading to the level-1 budget, whatever its level', async () => {
    const six = await startPlan(`###### ${words(6)}`)
    expect(six.statusCode, six.body).toBe(400)
  })
})

// ============================================================ c — what is already over is drawn over

describe('a line written before the rule is still read, unchanged, and drawn as over budget', () => {
  it('keeps the words exactly and marks them where they are drawn', async () => {
    const id = await planIdOf('- a short line')
    const long = `- ${words(17)}`
    // THE DOOR REFUSES THIS NOW, so the row is written straight into the table, which is the only
    // way to build a line that was written before the rule existed. Nothing else is changed.
    const lineId = (await planLines(id))[0]!.line.id
    t.client.sqlite
      .prepare('UPDATE plan_lines SET text = ? WHERE id = ?')
      .run(long, lineId)

    const lines = await planLines(id)
    expect(lines[0]!.line.text, 'an old line was rewritten by a reading').toBe(long)

    const reply = await webApi.api.planBlocks(id)
    const seen = drawn(reply)
    expect(seen, 'the over-budget line was not drawn as it was written').toContain(words(17))
    expect(seen, 'the over-budget line was not marked').toContain('over the 15-word budget by 2')
  })

  it('marks an over-budget heading with its own budget', async () => {
    const id = await planIdOf('# Goals')
    t.client.sqlite
      .prepare('UPDATE plan_lines SET text = ? WHERE plan_id = ?')
      .run(`# ${words(7)}`, id)
    const reply = await webApi.api.planBlocks(id)
    const seen = drawn(reply)
    expect(seen).toContain(`# ${words(7)}`.slice(2))
    expect(seen).toContain('over the 5-word budget by 2')
  })
})

// ============================================================ d — the explanation beside the line

describe('the record\'s explanation is drawn beside the line, never inside it', () => {
  it('draws the conclusion where the record has one, and leaves the line and the note alone', async () => {
    const summary = 'The baseline drifted two millimetres after the third run, so the mount is being reprinted.'
    const recordId = await seedRecord('Baseline calibration', summary)
    const id = await planIdOf('- cal the baseline')
    const lineId = (await planLines(id))[0]!.line.id
    await pointLine(id, lineId, recordId)
    const noted = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { remark: 'ask Sam about the shim' },
    })
    expect(noted.statusCode, noted.body).toBe(200)

    const lines = await planLines(id)
    expect(lines[0]!.explanation).toEqual({ level: 'conclusion', text: summary })
    // THE LINE'S OWN WORDS ARE UNCHANGED, and the summary is not in them.
    expect(lines[0]!.line.text).toContain('cal the baseline')
    expect(lines[0]!.line.text).not.toContain('drifted two millimetres')
    // THE NOTE STILL LIVES IN THE LINE AND STILL SAYS WHAT IT SAID.
    expect(lines[0]!.line.remark).toBe('ask Sam about the shim')

    const seen = drawn(await webApi.api.planBlocks(id))
    expect(seen, 'the conclusion was not drawn').toContain(summary)
    expect(seen, 'the words were not said as what they are').toContain('Conclusion')
    expect(seen, 'the note was lost from the line').toContain('ask Sam about the shim')
  })

  it('falls back to the record\'s title when it has no conclusion, and says so', async () => {
    const recordId = await seedRecord('Baseline calibration', null)
    const id = await planIdOf('- cal the baseline')
    const lineId = (await planLines(id))[0]!.line.id
    await pointLine(id, lineId, recordId)

    const lines = await planLines(id)
    expect(lines[0]!.explanation).toEqual({ level: 'title', text: 'Baseline calibration' })
    const seen = drawn(await webApi.api.planBlocks(id))
    expect(seen).toContain('Baseline calibration')
    expect(seen).toContain('Title')
  })
})

// ============================================================ e — taking the record's own form

describe('a line takes the record\'s own shorter form when somebody asks', () => {
  it('offers the level-1 label, and taking it fills the line', async () => {
    const recordId = await seedRecord('Baseline calibration', null)
    await writeLabel(recordId, 'Baseline check')
    const id = await planIdOf('- cal the baseline')
    const lineId = (await planLines(id))[0]!.line.id
    await pointLine(id, lineId, recordId)

    const lines = await planLines(id)
    expect(lines[0]!.shortForm).toEqual({ level: 'label', text: 'Baseline check' })

    // THE PRESS IS DRAWN, with the rung it came from named.
    const seen = drawn(await webApi.api.planBlocks(id))
    expect(seen).toContain('Use the label')

    // TAKING IT: the words go into the line, marker kept, and the door accepts them.
    const took = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: lines[0]!.shortForm!.text },
    })
    expect(took.statusCode, took.body).toBe(200)
    expect((await planLines(id))[0]!.line.text).toBe('Baseline check')
  })

  it('falls back to the level-2 title when no label is written', async () => {
    const recordId = await seedRecord('Baseline calibration', null)
    const id = await planIdOf('- cal the baseline')
    const lineId = (await planLines(id))[0]!.line.id
    await pointLine(id, lineId, recordId)
    const lines = await planLines(id)
    expect(lines[0]!.shortForm).toEqual({ level: 'title', text: 'Baseline calibration' })
    expect(drawn(await webApi.api.planBlocks(id))).toContain('Use the title')
  })

  it('refuses a title too long for a line rather than cutting it', async () => {
    const recordId = await seedRecord(words(16), null)
    const id = await planIdOf('- cal the baseline')
    const lineId = (await planLines(id))[0]!.line.id
    await pointLine(id, lineId, recordId)

    const lines = await planLines(id)
    expect(lines[0]!.shortForm).toEqual({ level: 'title', text: words(16) })
    const took = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: lines[0]!.shortForm!.text },
    })
    expect(took.statusCode, took.body).toBe(400)
    expect(bodyOf(took)['error'] as string).toContain('may be at most 15')
    // AND NOTHING WAS CUT INTO THE LINE.
    expect((await planLines(id))[0]!.line.text).toBe('- cal the baseline')
  })

  it('leaves a line that names no record to be written by hand', async () => {
    const id = await planIdOf('- write this myself')
    const lines = await planLines(id)
    expect(lines[0]!.shortForm).toBeNull()
    const seen = drawn(await webApi.api.planBlocks(id))
    expect(seen).not.toContain('Use the label')
    // AND THE HAND-WRITTEN LINE IS STILL HELD TO THE SAME BUDGET.
    const lineId = lines[0]!.line.id
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: words(16) },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    const accepted = await app.inject({
      method: 'PATCH',
      url: `/api/plans/${id}/lines/${lineId}`,
      payload: { text: words(15) },
    })
    expect(accepted.statusCode, accepted.body).toBe(200)
  })
})
