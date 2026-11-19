// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON OWNS THE COLUMN WIDTHS OF THE PLAN TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER REPORTED, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * *"The current split view can crush Note and Project into almost one-character columns, produce
 * horizontal scrolling, and sometimes change column width unexpectedly after interacting with a row.
 * This materially affects usability. Let the person adjust column widths naturally and retain their
 * layout preference. Do not let an interaction unexpectedly rewrite a layout the person just
 * established."*
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAN SILENTLY STOP BEING TRUE
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE TABLE GOES BACK TO LAYING ITSELF OUT. A browser deciding the columns from the contents
 *      re-decides them on every draw, which IS the reported defect. Nothing would fail: the table
 *      still looks like a table.
 *   2. A COLUMN LOSES ITS FLOOR and a drag can take it to one character wide again.
 *   3. A STORED LAYOUT THIS BUILD CANNOT USE IS QUIETLY PART-USED. Then somebody sees a table they
 *      did not arrange with nothing on the screen saying why.
 *
 * The drag itself, the persistence and "an interaction does not rewrite a width" are measured in a
 * real browser in `tests/plan-table-reach.test.ts`, which already has one. What is here is the rule
 * a browser cannot make more true: the arithmetic, the reading of what was stored, and the markup
 * that carries a width at all.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planId: string

const store = new Map<string, string>()

beforeAll(async () => {
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
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
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

  const written = await webApi.api.newPlan('Widths', ['# Tray clamp', '- replace the gripper'].join('\n'))
  planId = written.plan.id
})

afterAll(async () => {
  await app.close()
  db.close()
})

beforeEach(() => {
  store.clear()
  webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
})

async function read(): Promise<PlanBlocksReply> {
  return webApi.api.planBlocks(planId)
}

function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

function words(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============================================================ the floor and the ceiling

describe('a column has a floor and a ceiling', () => {
  it('will not draw a column narrower than the floor, whatever it is asked for', () => {
    expect(planTable.widthWithin(0)).toBe(planTable.NARROWEST_COLUMN)
    expect(planTable.widthWithin(-400)).toBe(planTable.NARROWEST_COLUMN)
    // The floor is the whole point: this is the "almost one-character column" the owner reported.
    expect(planTable.NARROWEST_COLUMN).toBeGreaterThanOrEqual(40)
  })

  it('will not draw one wider than the ceiling, which is a drag that ran away', () => {
    expect(planTable.widthWithin(100_000)).toBe(planTable.WIDEST_COLUMN)
  })

  it('keeps a width between the two, as a whole number of pixels', () => {
    expect(planTable.widthWithin(220.4)).toBe(220)
    expect(planTable.widthWithin(221.5)).toBe(222)
  })

  it('gives the words the most room and one of the writer own columns a fixed share', () => {
    expect(planTable.widthByDefault('what')).toBeGreaterThan(planTable.widthByDefault('type'))
    // A column Mole Office knows nothing about the contents of gets the same width whatever it is called.
    expect(planTable.widthByDefault('yours:Owner')).toBe(planTable.widthByDefault('yours:Days'))
  })
})

// ============================================================ what was stored

describe('reading a remembered layout', () => {
  it('reads nothing as nothing, which is a person who has never dragged one', () => {
    expect(planTable.widthsFromStored(null)).toEqual({ widths: {}, why: null })
  })

  it('reads a layout back exactly', () => {
    expect(planTable.widthsFromStored('{"what":420,"note":180}')).toEqual({
      widths: { what: 420, note: 180 },
      why: null,
    })
  })

  /**
   * A VALUE THIS BUILD CANNOT USE IS DROPPED WHOLE AND ANNOUNCED, never part-used. That is the house
   * rule every remembered setting in this app follows — `readChoice` in src/web/lib/store.ts
   * enforces it for the simple ones — and a half-used layout is worse than none: the person is
   * looking at a table they did not arrange with nothing saying why.
   */
  for (const [what, stored] of [
    ['is not readable at all', 'not json'],
    ['is a list rather than a layout', '[320, 180]'],
    ['holds something that is not a number of pixels', '{"what":"wide"}'],
    ['holds a width this build will not draw', '{"what":5}'],
    ['holds a width past the ceiling', '{"what":99999}'],
  ] as const) {
    it(`drops the whole layout and says so when it ${what}`, () => {
      const read = planTable.widthsFromStored(stored)
      expect(read.widths, stored).toEqual({})
      expect(read.why, stored).toContain('dropped the column widths')
      // AND IT SAYS WHAT HAPPENS NEXT, because a person who is not told is left wondering whether
      // the layout is coming back.
      expect(read.why, stored).toContain('back at their own widths')
    })
  }
})

// ============================================================ what reaches the screen

describe('the table draws every column at a width it was given', () => {
  it('writes one explicit width per column, so nothing is left for the browser to decide', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    // A colgroup with one col per column, each carrying pixels. Without this the browser lays the
    // table out from the contents and re-does it on every draw — the reported defect.
    expect(markup).toContain('<colgroup>')
    const cols = markup.match(/<col style="width:\d+px"\/>/g) ?? []
    // The pick control, then Task, Type, Estimate, Schedule, Project, Note.
    expect(cols).toHaveLength(7)
    expect(markup).toContain(`<col style="width:${String(planTable.widthByDefault('what'))}px"/>`)
  })

  it('uses the width this person set instead of the column own', async () => {
    store.set(planTable.widthsKey(), '{"note":512}')
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(markup).toContain('<col style="width:512px"/>')
    // And it offers to put it back, which it does not when nothing has been set.
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).toContain('Reset widths')
  })

  it('offers nothing to reset when this person has set nothing', async () => {
    const reply = await read()
    expect(words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))).not.toContain('Reset widths')
  })

  /**
   * AND A STORED LAYOUT THIS BUILD CANNOT USE IS ANNOUNCED ON THE SCREEN, not only in the reading.
   * The rule is only worth anything if the person is told.
   */
  it('says on the screen when it dropped a layout it could not use, and takes it out of storage', async () => {
    store.set(planTable.widthsKey(), '{"what":"as wide as you like"}')
    const reply = await read()
    const said = words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(said).toContain('The column widths could not be saved or restored')
    expect(store.get(planTable.widthsKey()), 'the unusable value is still stored, so it will complain again').toBeUndefined()
  })

  /** Two people share this machine, so a layout is one person's. */
  it('keeps one person layout apart from another', () => {
    webApi.setActor({ type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    const mine = planTable.widthsKey()
    webApi.setActor({ type: 'agent', id: 'claude' })
    expect(planTable.widthsKey()).not.toBe(mine)
    expect(planTable.widthsKey()).toContain('mole-office.plan.widths.')
  })

  /**
   * THE HEADING CARRIES THE EDGE YOU DRAG, and it is reachable from a keyboard. A drag-only control
   * does not exist for anybody using one, and the layout is the thing being changed here.
   */
  it('gives every column an edge with a name, a value and a range', async () => {
    const reply = await read()
    const markup = body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: planId, lines: reply.lines }))
    expect(markup).toContain('role="separator"')
    expect(markup).toContain('aria-label="Change the width of Task"')
    expect(markup).toContain(`aria-valuemin="${String(planTable.NARROWEST_COLUMN)}"`)
    expect(markup).toContain(`aria-valuemax="${String(planTable.WIDEST_COLUMN)}"`)
    expect(markup).toContain('tabindex="0"')
  })
})
