// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS ABOUT TIME ARE NAMED, NOT TITLED — CRITERION W7, PROBLEM 1LfS2wzuJerO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, 16 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A card that does not say what it is must not be drawn.
 * Three cards at the bottom of the first band under the Decisions page
 * read "around 1.5 maybe more" and nothing else. They are PLANNING INTENTS — words somebody wrote
 * about time on a record, kept because only a person may turn them into hours — and the row used
 * those words as its own TITLE, so each card carried an estimate with no label and no subject,
 * three cards over.
 *
 * WHAT THE BLOCKS ARE, MEASURED: rows of GET /api/waiting, tier `settle`, kind `planning intent`,
 * act `schedule`, whose stored words are the estimate and whose row id names no record at all — the
 * intents live in their own table, and the press is one press, on the planning screen, that turns
 * the words into hours.
 *
 * THE FIX: THE ROW'S TITLE IS THE WORK the time is for (read off the record by the server), and the
 * words are drawn as what they are, in quotation marks under the title. They are NOT removed. An
 * estimate a person wrote, waiting for one press, is something they can use — the defect was the
 * drawing, not the words. The label "Time you asked for" was drawn over the words and it read
 * strangely, so it is gone; the words stand alone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a real intent, written through the real door, reaches GET /api/waiting as a row whose TITLE
 *     is the record it plans time for and whose `said` carries the words exactly as typed;
 *   · the drawn row is that title over the labelled estimate, in both shapes the page draws.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `intentsWaitingForOnePress` title the row with `intent.said` again → the server case goes
 *     red: the row's title is the estimate again, not the record's.
 *   make `PlanningEstimate` draw the label again → the two drawn cases go red.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { weekKey } from '../src/shared/planning.ts'
import type { WaitingItem } from '../src/server/lib/waiting.ts'

let t: TestDb
let app: FastifyInstance
let page: typeof import('../src/web/pages/GovernancePage.tsx')

/** The record the time is for, named, and the words as they were typed — the owner's own example. */
const WORK_TITLE = 'Widen the jig for the second fixture'
const THE_WORDS = 'around 1.5 maybe more'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

const get = async (url: string): Promise<Record<string, unknown>> => {
  const res = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return JSON.parse(res.body) as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { waitingRoutes } = await import('../src/server/api/waiting.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(planningRoutes, { prefix: '/api' })
  await app.register(waitingRoutes, { prefix: '/api' })
  await app.ready()

  // A RECORD OF WORK, and words about time on it, in a period — an intent Mole Office read, so it
  // is `offered` and its press is live. Kept words with no period are history and wait on nobody.
  const work = t.api.createRecord({
    workspaceId: 'default',
    kind: 'task',
    title: WORK_TITLE,
    data: { state: 'todo' },
    actor: AGENT,
  })
  const made = await app.inject({
    method: 'POST',
    url: '/api/planning/intents',
    headers: PERSON,
    payload: { said: THE_WORDS, recordId: work.id, period: weekKey(new Date()) },
  })
  expect(made.statusCode, made.body).toBe(201)

  // The window stand-in src/web/api.ts reads at module scope, before the page file loads.
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
  const webApi: typeof import('../src/web/api.ts') = await import('../src/web/api.ts')
  expect(typeof webApi.errorMessage).toBe('function')
  page = await import('../src/web/pages/GovernancePage.tsx')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the intent row names the work and carries the words', () => {
  it('on GET /api/waiting the row is titled by the record, and the words ride beside it', async () => {
    const reply = await get('/api/waiting')
    const items = reply['items'] as WaitingItem[]
    const row = items.find((one) => one.kind === 'planning intent')
    expect(row, 'the intent is a row on the owner’s list').toBeDefined()
    expect(row?.title, 'the row is the work the time is for').toBe(WORK_TITLE)
    expect(row?.said, 'the words as typed, kept whole').toBe(THE_WORDS)
    expect(row?.act, 'and the one press it waits for').toBe('schedule')
  })

  it('the drawn ROW is the work over the owner’s own words, with no label', () => {
    const html = renderToStaticMarkup(
      h(page.WaitingRow, { row: fixtureRow(), here: 'default', inspect: false, onOpen: () => {} }),
    )
    expect(html, 'the title is the work').toContain(WORK_TITLE)
    expect(html, 'the estimate still carries the label the owner could not place').not.toContain('Time you asked for')
    expect(html, 'and the words as written stand in quotation marks').toContain(`“${THE_WORDS}”`)
  })

  it('the drawn CARD is the same fact in the other shape the page draws', () => {
    const html = renderToStaticMarkup(
      h(page.WaitingCard, { row: fixtureRow(), here: 'default', inspect: false, onOpen: () => {} }),
    )
    expect(html).toContain(WORK_TITLE)
    expect(html).not.toContain('Time you asked for')
    expect(html).toContain(`“${THE_WORDS}”`)
  })

  it('a row with no words behind it draws no line at all', () => {
    const row = { ...fixtureRow(), said: null }
    expect(
      renderToStaticMarkup(h(page.WaitingRow, { row, here: 'default', inspect: false, onOpen: () => {} })),
    ).not.toContain('data-testid="planning-estimate"')
    expect(
      renderToStaticMarkup(h(page.WaitingCard, { row, here: 'default', inspect: false, onOpen: () => {} })),
    ).not.toContain('data-testid="planning-estimate"')
  })
})

// ============================================================================ the fixture

/**
 * THE ROW AS THE WIRE CARRIES IT, for the drawn half. The server half above proves what the real
 * door really writes; this is the same shape the page has to draw.
 */
function fixtureRow(): WaitingItem {
  return {
    id: 'intent-1',
    tier: 'settle',
    act: 'schedule',
    because: {
      rule: 'refused-act',
      doors: [
        { guard: 'assertMayCommitAnIntent', route: 'POST /api/planning/intents/:id/commit', what: 'turn the words into hours' },
      ],
    },
    why: 'Only you can put this time on your calendar.',
    onThePersonsWords: null,
    replacedButStillHere: null,
    passedOnBy: null,
    fromAgent: { answer: 'not-an-agent' },
    workspaceId: 'default',
    workspaceTitle: 'Default',
    kind: 'planning intent',
    title: WORK_TITLE,
    said: THE_WORDS,
    blocking: 0,
    since: '2026-09-16 10:00:00',
  }
}
