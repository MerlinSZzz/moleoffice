// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S OWN PAGE SHOWS WHAT WAS PLANNED AGAINST WHAT WAS DONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P3 of design/planning/ACCEPTANCE.md: "the page shows what was planned against what was
 * done." The plan's table draws each line's state word; `PlanProgress` draws the whole plan as one
 * answer — how many lines are filed as work and what happened to that work, and the hours those
 * allocations hold, planned against actually spent.
 *
 * EVERY NUMBER IS READ FROM THE SERVER'S OWN REPLY. The lines below are filed, their records moved
 * through real states and given a real allocation through the product's own routes, and the drawing
 * is rendered from what `GET /api/plans/:id/blocks` hands back. Nothing here is a hand-made reply.
 *
 * WHAT IT DOES NOT PROVE, SAID PLAINLY. A line records only when it was last written and by whom:
 * nothing stores when it first appeared, and a line removed from the plan leaves no row. So the
 * drawing can mark a line as written after the plan was made, and it cannot say whether it was added
 * or edited, or draw a line that is gone. Those are asserted here as the drawing's own words rather
 * than left as absences a reader would take for zeros.
 *
 * Proved by mutation with a control run of this file first: changing `hoursOn` in
 * src/server/lib/plans.ts so it counts unstated hours as zero turns the "not stated" case red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanProgressModule = typeof import('../src/web/components/plans/PlanProgress.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planProgress: PlanProgressModule
let onePlan: OnePlanModule

let planId: string
let addedLineId: string

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

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

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
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
  webApi.setActor({ ...AS_HUMAN })
  planProgress = await import('../src/web/components/plans/PlanProgress.tsx')
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')

  const written = await webApi.api.newPlan('Planned against done', '- alpha\n- beta\n- gamma')
  planId = written.plan.id
  const [alpha, beta, gamma] = written.lines

  const filedAlpha = await webApi.api.fileLineAsWork(planId, alpha!.id, { kind: 'task', workspaceId: 'default' })
  const filedBeta = await webApi.api.fileLineAsWork(planId, beta!.id, { kind: 'task', workspaceId: 'default' })
  const filedGamma = await webApi.api.fileLineAsWork(planId, gamma!.id, { kind: 'task', workspaceId: 'default' })

  // THREE REAL STATES: finished, stopped short, and under way.
  await webApi.api.updateRecord(filedAlpha.recordId, { dataPatch: { state: 'done' } })
  await webApi.api.updateRecord(filedBeta.recordId, { dataPatch: { state: 'failed' } })
  await webApi.api.updateRecord(filedGamma.recordId, { dataPatch: { state: 'doing' } })

  // HOURS ON ONLY ONE OF THEM, planned 4 and actually spent 3, so the sum covers one allocation and
  // the other two lines are drawn as "not stated" rather than as zero.
  const made = await webApi.api.allocate({
    horizon: 'week',
    period: '2026-W36',
    recordId: filedAlpha.recordId,
    plannedHours: 4,
  })
  await webApi.api.changeAllocation(made.allocation.id, { actualHours: 3, state: 'done' })

  // A LINE ADDED AFTER THE PLAN WAS MADE. `nowStamp` has second resolution and this whole fixture
  // can land inside one second, so the stamp is set forward directly: the drawing reads the stamp,
  // and the test needs the stamp to differ from the plan's for a reason that is not timing luck.
  const added = await webApi.api.addLineAfter(planId, '- added later', null, 'a line added after the plan was made', null)
  addedLineId = added.line.id
  db.client.sqlite
    .prepare('UPDATE plan_lines SET updated_at = ? WHERE id = ?')
    .run('2999-01-01 00:00:00', addedLineId)
})

afterAll(async () => {
  await app.close()
  db.close()
})

/** The markup with the hoisted style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** The words a reader sees, with the tags taken out, so an assertion is about the screen. */
function words(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readPlan(): Promise<{
  reply: PlanBlocksReply
  since: PlanSinceReadReply
  reviews: PlanReviewsReply
}> {
  const [reply, since, reviews] = await Promise.all([
    webApi.api.planBlocks(planId),
    webApi.api.planSinceRead(planId),
    webApi.api.planReviews(planId),
  ])
  return { reply, since, reviews }
}

describe('planned against done', () => {
  it('draws each line’s stored state and the hours its work holds', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(body(h(planProgress.PlanProgress, { lines: reply.lines, planCreatedAt: reply.plan.createdAt })))

    expect(said).toContain('Planned against done')
    // THREE REAL STATES. The tally names the one finished and the one stopped short; the third is
    // under way.
    expect(said).toContain('Finished')
    expect(said).toContain('Stopped short')
    expect(said).toContain('Not started or under way')
    // THE HOURS THAT WERE GIVEN, planned against spent. Only alpha holds an allocation: 4 planned,
    // 3 spent.
    expect(said).toContain('4h')
    expect(said).toContain('3h')
    // AND THE LINES WITH NO HOURS SAY SO. This is the case the mutation turns red: if `hoursOn`
    // summed an absent number as zero, every one of these would read `0h`.
    expect(said).toContain('—')
    expect(said).not.toContain('0h')
  })

  it('marks a line written after the plan was made, and says what it cannot know', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(body(h(planProgress.PlanProgress, { lines: reply.lines, planCreatedAt: reply.plan.createdAt })))

    expect(said).toContain('added later')
    expect(said).toContain('written since this plan was made')
    // THE ABSENCE IS SAID, NOT DRAWN AS A ZERO. A line's first appearance and its reason are not
    // stored, and a removed line leaves no row; the drawing says so in its own words.
    expect(said).toContain('is not recorded')
    expect(said).toContain('leaves no row')
  })

  it('is on the plan’s own page, under the table', async () => {
    const { reply, since, reviews } = await readPlan()
    const markup = body(h(onePlan.PlanView, { reply, since, reviews, view: 'table', onView: () => {} }))
    expect(words(markup)).toContain('Planned against done')
  })
})
