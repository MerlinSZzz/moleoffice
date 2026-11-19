// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE ON A PLAN: what an agent left, and what a person has to press before anything
 * happens.
 *
 * Four things can silently stop being true here, and each has a test:
 *
 *   1. AN EMPTY PANE CLAIMS SOMETHING. "No advice" is not "the plan is fine", and a screen that
 *      reads as the second is telling a reader nobody looked when nobody did.
 *   2. THE CHANGE SET IS DRAWN AFTER THE PRESS RATHER THAN BEFORE IT. What a change set would do
 *      has to be on the screen while the button is still unpressed.
 *   3. ADVICE BECOMES A CHANGE WITHOUT A PERSON. The apply press must not exist until a person has
 *      settled the fork, because settling is the act an agent is refused.
 *   4. THE COUNT ON THE BUTTON DRIFTS FROM THE PANE. Both are drawn from one reply.
 *
 * HOW IT LOOKS LIKE THIS. The runner's environment is `node`: no DOM. So, as tests/plans-pages.
 * test.ts does it, the components are rendered to static markup and `fetch` is pointed at a real
 * Fastify app through `app.inject`. Every reply these pages draw is one the server really wrote.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import type { Delta } from '../src/shared/delta.ts'
import type { PlanBlocksReply, PlanReviewsReply, PlanSinceReadReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')
type PlanReviewModule = typeof import('../src/web/components/plans/PlanReview.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let onePlan: OnePlanModule
let planReview: PlanReviewModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** The plan every test reads. Two plans exist so that "about THIS plan" is a real question. */
let planId: string
let otherPlanId: string

const BODY = ['# Tray clamp', '- replace gripper', '- order the part'].join('\n')

/** A change set that would really do something, so a summary of it is a summary of something. */
const CHANGE_SET: Delta = {
  ops: [
    {
      op: 'create_record',
      says: 'Create the task "Order the gripper part"',
      kind: 'task',
      title: 'Order the gripper part',
      workspaceId: 'default',
      data: { state: 'todo', effort_hours: 2 },
    },
  ],
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

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
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
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: async () => res.body }
  }

  webApi = await import('../src/web/api.ts')
  webApi.setActor({ ...AS_HUMAN })
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  planReview = await import('../src/web/components/plans/PlanReview.tsx')

  planId = (await webApi.api.newPlan('Tray clamp week', BODY)).plan.id
  otherPlanId = (await webApi.api.newPlan('Something else', '# Other')).plan.id
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
function wordsOf(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

/** An agent files advice about a plan, the way the words Mole Office hands it say to. */
function adviseOn(plan: string, opts: { delta?: Delta; title?: string } = {}): string {
  const extra: Record<string, unknown> = { plan }
  if (opts.delta !== undefined) extra['delta'] = opts.delta
  return db.api.createRecord({
    kind: 'proposal',
    workspaceId: 'default',
    title: opts.title ?? 'Two of these lines are one piece of work',
    data: {
      question: 'Should replacing the gripper and ordering the part be one task or two?',
      options: ['A — One task, with the ordering as a step.', 'B — Two tasks, because the part has a lead time.'],
      recommendation: 'Option B — the lead time is the risk.',
      extra,
    },
    actor: AGENT,
  }).id
}

async function reviewsOf(plan: string): Promise<PlanReviewsReply> {
  return webApi.api.planReviews(plan)
}

async function readPlan(plan: string): Promise<{
  reply: PlanBlocksReply
  since: PlanSinceReadReply
  reviews: PlanReviewsReply
}> {
  const [reply, since, reviews] = await Promise.all([
    webApi.api.planBlocks(plan),
    webApi.api.planSinceRead(plan),
    webApi.api.planReviews(plan),
  ])
  return { reply, since, reviews }
}

// ============================================================================ an empty pane

describe('a plan nobody has advised on', () => {
  it('says nobody has left advice, and does not read as a plan somebody checked', async () => {
    const reviews = await reviewsOf(otherPlanId)
    const markup = body(
      h(planReview.PlanReview, {
        plan: otherPlanId,
        title: 'Something else',
        reviews,
        onChanged: () => {},
      }),
    )
    const said = wordsOf(markup)
    // 7FEOshq3mBGG gives ordinary emptiness the short mark. The reason remains readable.
    expect(said).toContain('—')
    expect(markup).toContain('class="px-absent"')
    // AND THE SENTENCE IS NOT DELETED. It rides on the mark, where a screen reader reads it out and
    // the tooltip shows it, so quietening the absence did not destroy the distinction it carried.
    expect(markup).toContain('Nobody has left advice about this plan')
    expect(markup).toContain('not a review saying the plan is fine')
  })

  it('offers the one press that hands the plan to an agent', async () => {
    const reviews = await reviewsOf(otherPlanId)
    const said = wordsOf(
      body(
        h(planReview.PlanReview, {
          plan: otherPlanId,
          title: 'Something else',
          reviews,
          onChanged: () => {},
        }),
      ),
    )
    expect(said).toContain('Ask an agent to look at this')
    expect(said).toContain('Copy the message')
    // The press changes nothing here, and the pane says so before it is pressed.
    expect(said).toContain('It changes nothing here')
  })
})

// ============================================================================ advice that is waiting

describe('advice an agent left, before anybody has settled it', () => {
  it('draws the fork and both options, from the panel the rest of the product uses', async () => {
    adviseOn(planId, { delta: CHANGE_SET })
    const reviews = await reviewsOf(planId)
    const said = wordsOf(
      body(h(planReview.PlanReview, { plan: planId, title: 'Tray clamp week', reviews, onChanged: () => {} })),
    )
    expect(said).toContain('Should replacing the gripper and ordering the part be one task or two?')
    expect(said).toContain('One task, with the ordering as a step.')
    expect(said).toContain('Two tasks, because the part has a lead time.')
  })

  /**
   * THE PRESS SAYS WHAT IT WILL CHANGE BEFORE IT CHANGES IT. What the change set would do is on the
   * screen while the person is still choosing, not after they have committed to anything.
   */
  it('says what the change set would do, with nothing pressed', async () => {
    const reviews = await reviewsOf(planId)
    const said = wordsOf(
      body(h(planReview.PlanReview, { plan: planId, title: 'Tray clamp week', reviews, onChanged: () => {} })),
    )
    // The heading names the option the change set belongs to, because the agent recommended one.
    expect(said).toContain('If you choose B')
    expect(said).toContain('Creates 1 record')
    expect(said).toContain('Create the task "Order the gripper part"')
    // And the sentence that says only a person may choose is on the screen beside it.
    expect(said).toContain('Only you may choose')
  })

  /**
   * THE LINE THAT MAY NOT BE CROSSED, on the screen. Applying is not offered until a person has
   * settled the fork, because settling writes a decision and that is the one act an agent is
   * refused. A pane that offered Apply beside unsettled advice would be offering a press the server
   * answers 409 to, and a reader would fairly read the offer as permission.
   */
  it('does not offer to make the changes until a person has settled it', async () => {
    const reviews = await reviewsOf(planId)
    const said = wordsOf(
      body(h(planReview.PlanReview, { plan: planId, title: 'Tray clamp week', reviews, onChanged: () => {} })),
    )
    expect(said).not.toContain('Apply these changes')
    expect(reviews.reviews[0]?.resolved).toBe(false)
    expect(reviews.waiting).toBe(1)
  })

  it('leaves out advice filed about a different plan', async () => {
    adviseOn(otherPlanId, { title: 'Advice about the other plan' })
    const said = wordsOf(
      body(
        h(planReview.PlanReview, {
          plan: planId,
          title: 'Tray clamp week',
          reviews: await reviewsOf(planId),
          onChanged: () => {},
        }),
      ),
    )
    expect(said).not.toContain('Advice about the other plan')
  })
})

// ============================================================================ once the person settles it

describe('once the person has settled the fork', () => {
  it('offers the press that makes the changes, and lists them above it', async () => {
    const proposal = (await reviewsOf(planId)).reviews[0]?.proposal.id
    expect(proposal).toBeDefined()
    // Through the same route an agent is refused at. The browser only succeeds because the actor
    // says human — set it to an agent and the server refuses, which is the guard working.
    await webApi.api.promoteProposal(proposal as string, {
      title: 'Two tasks, because the part has a lead time',
      data: { because: 'the lead time is the risk', option_taken: 'B — Two tasks, because the part has a lead time.' },
    })

    const reviews = await reviewsOf(planId)
    expect(reviews.reviews[0]?.resolved).toBe(true)
    expect(reviews.waiting).toBe(0)

    const said = wordsOf(
      body(h(planReview.PlanReview, { plan: planId, title: 'Tray clamp week', reviews, onChanged: () => {} })),
    )
    expect(said).toContain('Decided. The changes have not been made yet')
    expect(said).toContain('Apply these changes')
    // Still listed, above the press, so the press is made with the list on the screen.
    expect(said).toContain('Create the task "Order the gripper part"')
  })
})

// ============================================================================ the count on the button

describe('the plan page counts what is waiting on a person', () => {
  it('carries the number on the Review button, from the same reply the pane draws', async () => {
    // A second piece of advice nobody has settled. The first one is settled by the test above, so
    // the count must be 1 rather than 2 — which is what makes it "waiting" rather than "how many".
    adviseOn(planId, { title: 'A second look at the same plan' })
    const { reply, since, reviews } = await readPlan(planId)
    expect(reviews.reviews).toHaveLength(2)
    expect(reviews.waiting).toBe(1)

    const markup = body(h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} }))
    expect(markup).toContain('class="op-waiting"')
    expect(wordsOf(markup)).toContain('Review 1')
  })

  it('draws no number at all when nothing is waiting', async () => {
    const { reply, since, reviews } = await readPlan(otherPlanId)
    // The other plan holds one piece of advice nobody has settled, so this proves the absence by
    // settling it rather than by picking a plan that happens to have none.
    const proposal = reviews.reviews[0]?.proposal.id
    expect(proposal).toBeDefined()
    await webApi.api.promoteProposal(proposal as string, {
      title: 'Leave the other plan as it is',
      data: { because: 'nothing in it has moved' },
    })

    const after = await readPlan(otherPlanId)
    expect(after.reviews.waiting).toBe(0)
    const markup = body(
      h(onePlan.PlanView, { reply, since, reviews: after.reviews, view: 'writing', onView: () => {} }),
    )
    expect(markup).not.toContain('class="op-waiting"')
    expect(wordsOf(markup)).toContain('Review')
  })
})
