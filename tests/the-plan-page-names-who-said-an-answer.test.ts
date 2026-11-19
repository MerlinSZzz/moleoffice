// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN PAGE NAMES WHO SAID A PLAN CAME TRUE, AND WHEN, AND COUNTS THE ANSWERS.
 *
 * A plan's line names work. That work may be linked as a `realises` or `instead_of` answer to a
 * planned state. The plan's own read now carries those answers, and the plan's page draws each
 * answer's writer, the moment it was written, and how many answers the plan has.
 *
 * READ FROM THE SERVER'S OWN REPLY. The plan, its lines, the work records, the planned states and
 * the links below are all written through the product's routes, and every assertion is about what
 * `GET /api/plans/:id/blocks` handed back and what `PlanProgress` and `PlanView` draw from it.
 *
 * THE SENTENCES ARE READ FROM THE WORD FILE through `t()`, never copied. The writer's name comes
 * from the registry the page already uses (`writerNamed`), so the file passes the same registry a
 * page would.
 *
 * MUTATIONS, each run alone after a green control and restored: the read's answers taken from the
 * planned state instead of the work record (case 1), the read returning answers for work the plan
 * does not name (case 2), the drawing's count read as zero (case 3), and the page not passing the
 * answers to the drawing (case 4).
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { PlanAnswer, PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'
import { t } from '../src/shared/i18n.ts'
import { linkWord } from '../src/shared/words.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanProgressModule = typeof import('../src/web/components/plans/PlanProgress.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planProgress: PlanProgressModule
let onePlan: OnePlanModule

let planId = ''
let workOne = ''
let workTwo = ''
let stateOne = ''
let stateTwo = ''

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The registry the page reads names from, in the shape `writerNamed` takes. */
const PARTICIPANTS = {
  people: [{ id: THE_TEST_OFFICES_OWNER.id, handle: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name }],
  agents: [],
}

const WORK_ONE = 'Made-up: check the clamp holds.'
const WORK_TWO = 'Made-up: measure the reach.'
const STATE_ONE = 'Made-up: the clamp closes on the pot.'
const STATE_TWO = 'Made-up: the arm reaches the bench.'

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
  const { linkRoutes } = await import('../src/server/api/links.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(linkRoutes, { prefix: '/api' })
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

  const written = await webApi.api.newPlan('Who said a plan came true', '- check the clamp\n- measure the reach')
  planId = written.plan.id
  const [first, second] = written.lines
  if (first === undefined || second === undefined) throw new Error('the made-up plan has two lines')

  const filedOne = await webApi.api.fileLineAsWork(planId, first.id, { kind: 'task', workspaceId: 'default' })
  workOne = filedOne.recordId
  const filedTwo = await webApi.api.fileLineAsWork(planId, second.id, { kind: 'task', workspaceId: 'default' })
  workTwo = filedTwo.recordId

  const madeOne = await webApi.api.createRecord({ kind: 'planned_state', title: STATE_ONE, data: { what: WORK_ONE } })
  stateOne = madeOne.id
  const madeTwo = await webApi.api.createRecord({ kind: 'planned_state', title: STATE_TWO, data: { what: WORK_TWO } })
  stateTwo = madeTwo.id

  await webApi.api.createLink({ fromId: workOne, toId: stateOne, type: 'realises' })
  await webApi.api.createLink({ fromId: workTwo, toId: stateTwo, type: 'instead_of' })
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

/** The answers the read returned, in the shape this file reads them. */
interface ReadAnswer {
  id: string
  workId: string
  workTitle: string | null
  toId: string
  toTitle: string | null
  type: string
  at: string
  by: { actorType: string; actorId: string } | null
}

function answersOf(reply: PlanBlocksReply): PlanAnswer[] {
  return (reply as unknown as { answers: PlanAnswer[] }).answers
}

describe('the plan page and the answers it draws', () => {
  it('1. reads both answers with the work, the planned state, who wrote it and when', async () => {
    const answers = answersOf(await webApi.api.planBlocks(planId))
    expect(answers, 'the plan read carries its answers').toHaveLength(2)
    const realised = answers.find((one) => one.type === 'realises')
    const instead = answers.find((one) => one.type === 'instead_of')
    expect(realised, 'the realises answer is read').toBeDefined()
    expect(instead, 'the instead_of answer is read').toBeDefined()
    expect(realised?.workId).toBe(workOne)
    expect(realised?.workTitle, 'the work record’s own title').toBe('check the clamp')
    expect(realised?.toId).toBe(stateOne)
    expect(realised?.toTitle).toBe(STATE_ONE)
    expect(instead?.workId).toBe(workTwo)
    expect(instead?.toTitle).toBe(STATE_TWO)
    // WHO WROTE IT AND WHEN. The link door stores both, and the read must hand both over.
    for (const answer of answers) {
      expect(answer.by, 'the writer is recorded').toEqual({ actorType: 'human', actorId: THE_TEST_OFFICES_OWNER.id })
      expect(answer.at, 'the moment is a stored stamp').toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    }
  })

  it('2. reads no answer whose work this plan does not name', async () => {
    const other = await webApi.api.createRecord({ kind: 'task', title: 'Made-up: work outside the plan', data: { state: 'todo' } })
    const state = await webApi.api.createRecord({ kind: 'planned_state', title: 'Made-up: a state outside the plan', data: { what: WORK_ONE } })
    await webApi.api.createLink({ fromId: other.id, toId: state.id, type: 'realises' })

    const answers = answersOf(await webApi.api.planBlocks(planId))
    expect(answers, 'the plan still carries only its own two answers').toHaveLength(2)
    expect(answers.map((one) => one.workId)).not.toContain(other.id)
  })

  it('3. draws the count, each writer and each moment', async () => {
    const reply = await webApi.api.planBlocks(planId)
    const said = words(body(h(planProgress.PlanProgress, {
      lines: reply.lines,
      planCreatedAt: reply.plan.createdAt,
      answers: answersOf(reply),
      participants: PARTICIPANTS,
    })))

    expect(said).toContain(t('g7a.horizons.answers', { n: 2 }))
    expect(said, 'the writer the registry names').toContain(THE_TEST_OFFICES_OWNER.name)
    expect(said).toContain(linkWord('realises', 'forward').text)
    expect(said).toContain(linkWord('instead_of', 'forward').text)
    expect(said).toContain(STATE_ONE)
    expect(said).toContain(STATE_TWO)

    const markup = body(h(planProgress.PlanProgress, {
      lines: reply.lines,
      planCreatedAt: reply.plan.createdAt,
      answers: answersOf(reply),
      participants: PARTICIPANTS,
    }))
    expect(markup.match(/<time [^>]*dateTime="[^"]+"/g) ?? [], 'one drawn moment per answer').toHaveLength(2)
  })

  it('4. is drawn on the plan’s own page', async () => {
    const { reply, since, reviews } = await readPlan()
    const markup = body(h(onePlan.PlanView, {
      reply,
      since,
      reviews,
      participants: PARTICIPANTS,
      view: 'table',
      onView: () => {},
    }))
    expect(words(markup)).toContain(t('g7a.horizons.answers', { n: 2 }))
    expect(words(markup)).toContain(THE_TEST_OFFICES_OWNER.name)
  })

  it('5. shows a count of zero when a plan has no answers', async () => {
    const written = await webApi.api.newPlan('Who answered nothing', '- nothing was answered here')
    const [only] = written.lines
    if (only === undefined) throw new Error('the made-up plan has one line')
    await webApi.api.fileLineAsWork(written.plan.id, only.id, { kind: 'task', workspaceId: 'default' })

    const [reply, since, reviews] = await Promise.all([
      webApi.api.planBlocks(written.plan.id),
      webApi.api.planSinceRead(written.plan.id),
      webApi.api.planReviews(written.plan.id),
    ])
    expect(answersOf(reply), 'the plan has no answers').toHaveLength(0)

    const progress = body(h(planProgress.PlanProgress, {
      lines: reply.lines,
      planCreatedAt: reply.plan.createdAt,
      answers: answersOf(reply),
      participants: PARTICIPANTS,
    }))
    expect(words(progress), 'the zero count').toContain(t('g7a.horizons.answers', { n: 0 }))
    expect(progress, 'no answer rows are drawn').not.toContain('pp-answer"')

    const page = body(h(onePlan.PlanView, {
      reply,
      since,
      reviews,
      participants: PARTICIPANTS,
      view: 'table',
      onView: () => {},
    }))
    expect(words(page), 'the page shows the zero count').toContain(t('g7a.horizons.answers', { n: 0 }))
    expect(page, 'no answer rows on the page').not.toContain('pp-answer"')
  })
})
