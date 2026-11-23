// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SCREEN, TWO NUMBERS OR TWO SENTENCES THAT DENY EACH OTHER.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THESE CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Three first-time users drove Mole Office in a browser on 18 August 2026, with no documents of their
 * own, and an agent drove the agent path with a real agent. Every defect below is one of them
 * reading two things on one screen that could not both be true, or one sentence describing
 * something other than what it was counting. None is a missing capability.
 *
 *   1  A NEW PLAN WITH ONE SIZE IN IT SAID NOBODY HAD SIZED ANYTHING. `2h` typed into the estimate
 *      cell of an untracked row, and the footer read "Nobody has sized anything in this plan. · 10
 *      nobody has sized · 10 not tracked as work · 1 sized in the plan only, which is in no total".
 *      The lead read the TRACKED total; the clauses read the plan's own words. Reproduced twice.
 *   2  THE ROWS AND THE FOOTER GAVE TWO SIZES FOR ONE PLAN. Parent 8h, parts 6h and 5h: the footer
 *      said "so it takes at least 11h" and the rows above went on saying 8h, with nothing on the
 *      screen joining the two. Both readings are right — 8h is the envelope, 11h is the floor — and
 *      a person who cannot tell which is which concludes the product is broken.
 *   3  THE SCHEDULE SHOWED A BLOCK ON A WEEK AND SAID NOTHING WAS ON THAT WEEK. On `#/plan/2026-W35`
 *      at once: one block, `Mon 24 – Thu 27 August, 4 days`; "Hours on this week" 0 and "0h planned
 *      this week"; and "Nothing is on next week yet". A tester said this was the one that would stop
 *      them trusting the numbers. **A window carries no hours by design**, so "0h planned" is true.
 *      The false one is the third.
 *   4  `null` REACHED A READER. "Schedule — null hours in 2026-08-17" on a plan's Writing view.
 *
 * CRITERION CHANGE, as decided: the panel of hours no longer says that a block on the board gives
 * no hours, so the cases that counted the blocks for that sentence are gone. Defect 3 is still held
 * by the sentence about hours, in part 3.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THEY ARE MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out adding a DOM, so this file uses
 * the two shapes the other planning tests use: a component rendered to static markup, and `fetch`
 * pointed at a real Fastify app through `app.inject`. Every plan below is written through the real
 * route and read back through the real route, so the arithmetic under the words is the product's
 * own and never a number this file decided.
 *
 * THE ARITHMETIC IS NOT UNDER TEST HERE AND IS NOT CHANGED BY ANY OF THIS. `src/shared/envelope.ts`
 * is the one place effort is added over a tree and `tests/envelope.test.ts` proves it. What is under
 * test is whether the screen says which of its two true numbers is which.
 */

import { sayInEnglish } from '../src/shared/i18n.ts'
import Fastify, { type FastifyInstance } from 'fastify'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb, THIS_TEST_ONLY_DRAWS_THE_TABLE } from './helpers.ts'
import { weekKey } from '../src/shared/planning.ts'
import { fitOf, loadOf, parsePeriod, spreadOf, type Allocation } from '../src/shared/planning.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import { type AllocationWithWork } from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import type { PlanBlocksReply } from '../src/web/api.ts'

type WebApi = typeof import('../src/web/api.ts')
type PlanTableModule = typeof import('../src/web/components/plans/PlanTable.tsx')
type PlanItemsModule = typeof import('../src/web/components/plans/planitems.tsx')
type OnePlanModule = typeof import('../src/web/pages/plans/OnePlanPage.tsx')
type PlanWritingModule = typeof import('../src/web/pages/plans/PlanWriting.tsx')
type PlanningModule = typeof import('../src/web/components/Planning.tsx')

let db: TestDb
let app: FastifyInstance
let webApi: WebApi
let planTable: PlanTableModule
let planItems: PlanItemsModule
let onePlan: OnePlanModule
let planWriting: PlanWritingModule
let planning: PlanningModule

const AS_HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

beforeAll(async () => {
  // The smallest window stand-in these modules need, installed before they are imported. Both
  // src/web/api.ts and src/web/lib/mode.ts read storage at module scope. Nothing here is under test;
  // the same stub as tests/plan-table.test.ts and tests/plan-writing-derived.test.ts.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  db = await freshDb()

  const { planRoutes } = await import('../src/server/api/plans.ts')
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { workRoutes } = await import('../src/server/api/work.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  app = Fastify()
  installErrorHandling(app)
  await app.register(planRoutes, { prefix: '/api' })
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(workRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
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
  planTable = await import('../src/web/components/plans/PlanTable.tsx')
  planItems = await import('../src/web/components/plans/planitems.tsx')
  onePlan = await import('../src/web/pages/plans/OnePlanPage.tsx')
  planWriting = await import('../src/web/pages/plans/PlanWriting.tsx')
  planning = await import('../src/web/components/Planning.tsx')
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
function words(el: React.ReactElement): string {
  return body(el)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A plan written through the real route, read back through the real route. */
async function planOf(name: string, lines: readonly string[]): Promise<PlanBlocksReply> {
  const written = await webApi.api.newPlan(`${name} ${String(Date.now())}`, lines.join('\n'))
  return webApi.api.planBlocks(written.plan.id)
}

/** Track one line as work, with an estimate on the record or with none at all. */
async function track(planId: string, lineId: string, hours: number | null): Promise<string> {
  const filed = await webApi.api.fileLineAsWork(planId, lineId, {
    kind: 'task',
    workspaceId: 'default',
    ...(hours === null ? {} : { data: { effort_hours: hours } }),
  })
  return filed.recordId
}

/** The table as the plan page draws it. */
function tableWords(reply: PlanBlocksReply): string {
  return words(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))
}

// ============================================================================ 1 — the footer's first sentence

describe('1 — a plan with a size in it is never told nobody has sized anything', () => {
  /**
   * THE TESTER'S PLAN. Nothing is tracked as work, and one line says how big it is in the plan's own
   * words — which is what typing `2h` into the estimate cell of an untracked row writes.
   */
  const sizedInThePlanOnly = () =>
    planOf('sized in the plan', ['# Handover', '- rewrite the controller {size: 2h}', '- write the report'])

  it('has no total, because nothing tracked as work carries an estimate', async () => {
    // Stated first, so nothing below can pass by the fixture quietly gaining a tracked estimate.
    const reply = await sizedInThePlanOnly()
    const { items } = planItems.planItemsOf(reply.lines)
    expect(planTable.planEffortOf(items).total).toBeNull()
  })

  it('does not say nobody has sized anything, one clause from the count of what was sized', async () => {
    const said = tableWords(await sizedInThePlanOnly())
    expect(said).not.toContain('Nobody has sized anything')
    // CRITERION CHANGE (problem ZPNVOJkn1oVp, wave 13k round 14): no total is said in words, not with a
    // lone dash that read as a stray mark before "· 3 not sized as work".
    expect(said).toContain(`${sayInEnglish('planTable.total.none')} · `)
  })

  it('still counts the size the person wrote', async () => {
    // The clause the lead sentence used to contradict. Both halves of the paragraph now say the
    // same thing about the same plan.
    // CRITERION CHANGE, as decided: the count no longer goes on to say it is in no total; the
    // absent total beside it says so.
    expect(tableWords(await sizedInThePlanOnly())).toContain(sayInEnglish('planTable.sizedInPlanOnly', { n: 1 }).trim())
  })

  it('uses the same short mark when nothing has a size, which is the control', async () => {
    const said = tableWords(await planOf('nothing sized', ['# Handover', '- rewrite the controller', '- write the report']))
    expect(said).toContain(`${sayInEnglish('planTable.total.nothingSized')} · `)
    expect(said).not.toMatch(/— · \d+ not sized as work/)
  })

  it('names what the unsized count counts, which is the estimate on the work', async () => {
    // "9 nobody has sized" counted rows whose TRACKED work has no estimate, so it counted the row
    // somebody had just sized in the plan. It says what it counts now.
    const said = tableWords(await sizedInThePlanOnly())
    expect(said).toContain('not sized as work')
    expect(said).not.toContain('nobody has sized ·')
  })
})

// ============================================================================ 2 — the rows and the footer

describe('2 — the envelope and the floor, drawn where each of them comes from', () => {
  /**
   * THE TESTER'S PLAN: a heading holding a piece of work of 8h whose two parts are 6h and 5h.
   *
   * The heading is untracked, so the table derives its 8h from what is under it. The bullet is
   * tracked with its own 8h. The parts add up to 11h, which is more than either of them says.
   */
  async function eightOverElevenM(): Promise<PlanBlocksReply> {
    const reply = await planOf('over', [
      '# Handover',
      '- rewrite the controller',
      '  - calibrate the jig',
      '  - write the report',
    ])
    const at = (text: string) => reply.lines.find((line) => line.line.text.trim().endsWith(text))!.line.id
    await track(reply.plan.id, at('rewrite the controller'), 8)
    await track(reply.plan.id, at('calibrate the jig'), 6)
    await track(reply.plan.id, at('write the report'), 5)
    return webApi.api.planBlocks(reply.plan.id)
  }

  it('really is 8h with an 11h floor, from the one arithmetic, before anything is drawn', async () => {
    const reply = await eightOverElevenM()
    const { items } = planItems.planItemsOf(reply.lines)
    const effort = planTable.planEffortOf(items)
    const heading = effort.byId.get(items[0]!.key)
    const parent = effort.byId.get(items[1]!.key)

    expect(heading?.shown, 'the heading no longer derives 8h from its parts').toBe(8)
    expect(heading?.atLeast, 'the floor no longer reaches the heading').toBe(11)
    expect(parent?.own).toBe(8)
    expect(parent?.over).toBe(3)
    expect(effort.total).toBe(8)
    expect(effort.atLeastTotal).toBe(11)
  })

  it('says the floor on the rows it comes from, in the same words the footer uses', async () => {
    const said = tableWords(await eightOverElevenM())
    // The heading's cell: what the plan says, and the least it can take, side by side.
    expect(said).toContain('8h from its parts')
    expect(said).toContain('at least 11h')
  })

  it('draws both numbers under the table', async () => {
    // CRITERION CHANGE, as decided: the footer draws the two numbers with a short label each, and
    // no longer explains which is which or where the marked rows are.
    const said = tableWords(await eightOverElevenM())
    expect(said).toContain('8h in all, from 1 of 1 top-level rows.')
    expect(said).toContain(sayInEnglish('planTable.partsOver', { atLeast: planItems.atLeastSaid(11) }).trim())
  })

  it('keeps the red mark on the row whose own parts overflow it, and its two numbers', async () => {
    const reply = await eightOverElevenM()
    expect(body(h(planTable.PlanTable, { versionToWriteOn: THIS_TEST_ONLY_DRAWS_THE_TABLE, plan: reply.plan.id, lines: reply.lines }))).toContain('class="pi-over"')
    expect(tableWords(reply)).toContain('The parts of this add up to 11h, which is 3h more than the 8h written here')
  })

  /**
   * THE ROW THE OLD DRAWING LEFT UNMARKED, AND IT IS THE COMMONEST SHAPE OF ALL.
   *
   * A row whose own parts fit inside it, holding a row whose parts do not: 9h over 8h over 6h and
   * 5h. `over` is null on the 9h row, so it carried no mark at all, while the footer counted the
   * floor that came up through it. Nothing on the screen led from the total to the row it came from.
   */
  async function deeperDown(): Promise<PlanBlocksReply> {
    const reply = await planOf('deep', [
      '- ship the arm',
      '  - rewrite the controller',
      '    - calibrate the jig',
      '    - write the report',
    ])
    const at = (text: string) => reply.lines.find((line) => line.line.text.trim().endsWith(text))!.line.id
    await track(reply.plan.id, at('ship the arm'), 9)
    await track(reply.plan.id, at('rewrite the controller'), 8)
    await track(reply.plan.id, at('calibrate the jig'), 6)
    await track(reply.plan.id, at('write the report'), 5)
    return webApi.api.planBlocks(reply.plan.id)
  }

  it('marks a row whose own parts fit but whose parts hold more inside them', async () => {
    const reply = await deeperDown()
    const { items } = planItems.planItemsOf(reply.lines)
    const top = planTable.planEffortOf(items).byId.get(items[0]!.key)
    // The 9h row: its own breakdown is 8h, which fits, so there is no red mark on it.
    expect(top?.own).toBe(9)
    expect(top?.over, 'this row now overflows on its own, so it is the wrong fixture').toBeNull()
    expect(top?.atLeast).toBe(11)

    const said = tableWords(reply)
    expect(said).toContain('at least 11h')
    expect(said).toContain('9h in all, from 1 of 1 top-level rows.')
  })

  it('says nothing about a floor on a plan whose parts fit, which is the control', async () => {
    const reply = await planOf('fits', ['- rewrite the controller', '  - calibrate the jig', '  - write the report'])
    const at = (text: string) => reply.lines.find((line) => line.line.text.trim().endsWith(text))!.line.id
    await track(reply.plan.id, at('rewrite the controller'), 15)
    await track(reply.plan.id, at('calibrate the jig'), 5)
    await track(reply.plan.id, at('write the report'), 4)
    const said = tableWords(await webApi.api.planBlocks(reply.plan.id))

    expect(said).toContain('15h in all, from 1 of 1 top-level rows.')
    expect(said).not.toContain('at least')
  })
})

// ============================================================================ 3 — the week with a block on it

/** The week the tester was on: Monday 24 to Sunday 30 August 2026. */
const WEEK = '2026-W35'
const DAY_IN_WEEK = '2026-08-25'

/** One allocation, at whichever horizon and period it is put on. */
function allocation(recordId: string, plannedHours: number | null, period = WEEK): Allocation {
  return {
    id: `a-${recordId}-${period}`,
    horizon: period === WEEK ? 'week' : 'day',
    period,
    recordId,
    plannedHours,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-17 09:00:00',
    updatedAt: '2026-08-17 09:00:00',
  } as Allocation
}

/** A week reply, built the way src/server/api/planning.ts builds one. */
function weekReply(entries: AllocationWithWork[] = [], inDays: Allocation[] = []): PlanReply {
  const parsed = parsePeriod(WEEK)
  if (parsed === null) throw new Error('2026-W35 is not a period, which cannot happen')
  const mine = entries.map((e) => e.allocation)
  const covering = [...mine, ...inDays]
  const load = loadOf('week', WEEK, mine, { horizon: 'week', period: WEEK, pairs: [], notChecked: [] })
  return {
    horizon: 'week',
    period: WEEK,
    from: parsed.from,
    to: parsed.to,
    entries,
    capacity: null,
    fit: fitOf(load, null),
    spread: spreadOf(parsed, 'day', covering),
    finer: [],
    allocatableKinds: ALLOCATABLE_KINDS,
    alsoNamed: [],
    shares: [],
    note: 'not read by any surface under test',
  } as unknown as PlanReply
}

const weekSaid = { name: 'Next week', range: '24 – 30 August', when: 'ahead' as const, unit: 'week' }

describe('3 — a week carrying a block is never told nothing is on it', () => {
  const drawWeek = (): string =>
    words(
      h(planning.WeekBuild, {
        reply: weekReply(),
        said: weekSaid,
        wrote: 0,
        editing: false,
        onWrote: () => {},
      }),
    )

  it('says what the empty panel counts, which is hours', () => {
    // The sentence a person met beside a block covering four days. It claimed the whole week and it
    // counts allocations, so it is now about hours and the block it cannot see is not denied.
    const said = drawWeek()
    expect(said).toContain('No hours are on next week yet.')
    expect(said).not.toContain('Nothing is on next week yet')
  })

  it('says the same thing on a day, where a block placed across the week is also drawn', () => {
    const said = words(
      h(planning.DayPlan, {
        reply: { ...weekReply(), horizon: 'day', period: DAY_IN_WEEK } as unknown as PlanReply,
        said: { name: 'Tue 25 August', range: 'Tuesday 25 August 2026', when: 'ahead' as const, unit: 'day' },
        today: null,
        wrote: 0,
        editing: false,
        onWrote: () => {},
      }),
    )
    expect(said).toContain('No hours are on tue 25 august yet.')
    expect(said).not.toContain('Nothing is on')
  })

  it('names the panel about days for what it counts, which is hours', () => {
    // A tester looked here for the only thing on a day that week — a block — and it is not in this
    // panel, because a block carries no hours. The heading was wider than the panel's arithmetic.
    const reply = weekReply(
      [{ allocation: allocation('rec-one', 5), work: null } as unknown as AllocationWithWork],
      [allocation('rec-one', 2, DAY_IN_WEEK)],
    )
    const said = words(h(planning.NotOnADay, { reply }))
    expect(said).toContain('Which days this week’s hours are on')
    expect(said).not.toContain('Which days this week’s work is on')
  })
})

// ============================================================================ 4 — null is not a word

describe('4 — what a line became, with no word nobody would say', () => {
  /**
   * THE SENTENCE IS COMPOSED ON THE SERVER, so this writes a real allocation with no hours on it and
   * reads the real reply back. A test that made the string up would prove only that this file can
   * spell it.
   */
  async function withHoursNobodySaid(): Promise<{ reply: PlanBlocksReply; says: string }> {
    // THE PLAN'S NAME CARRIES NO FOUR-LETTER WORD OF ITS OWN, because one of the tests below reads
    // the whole page and asks whether the word reached the reader anywhere on it.
    const plan = await planOf('hours nobody said', ['# Handover', '- rewrite the controller'])
    const lineId = plan.lines.find((line) => line.line.text.trim().endsWith('rewrite the controller'))!.line.id
    const recordId = await track(plan.plan.id, lineId, null)
    // COMMITTED TO A WEEK WITH NO NUMBER OF HOURS, which is a real and ordinary state: somebody
    // means to do this next week and has not said for how long.
    await webApi.api.allocate({ horizon: 'week', period: weekKey(new Date()), recordId, plannedHours: null })
    const reply = await webApi.api.planBlocks(plan.plan.id)
    const line = reply.lines.find((one) => one.line.id === lineId)!
    const value = line.derived.find((one) => one.key === 'time')!
    return { reply, says: value.says }
  }

  it('never prints null at a reader, in either mode', async () => {
    const { says } = await withHoursNobodySaid()
    expect(planWriting.valueInWords(says, false)).not.toContain('null')
    expect(planWriting.valueInWords(says, true)).not.toContain('null')
  })

  it('says the fact in words: nobody has said how many hours yet', () => {
    // The exact shape, so the mend cannot quietly stop matching what the server writes. The real
    // string is checked by the test above; this one pins the words a person reads.
    //
    // A DAY KEY STAYS A DATE IN BOTH MODES, which is `periodsInWords` and not this mend: a date is
    // something a person reads, and a week key is not. The week below shows the other half.
    expect(planWriting.valueInWords('null hours in 2026-08-17', true)).toBe('no hours yet in 2026-08-17')
    expect(planWriting.valueInWords('null hours in 2026-08-17', false)).toBe('no hours yet in 2026-08-17')
    expect(planWriting.valueInWords('null hours in 2026-W34 — done', false)).toBe(
      'no hours yet in Week of 17 August — done',
    )
  })

  it('leaves a value that says a real number of hours exactly as it was', () => {
    // The control. Nothing about this mend may touch a value that has hours in it.
    expect(planWriting.valueInWords('3 hours in 2026-08-17', true)).toBe('3 hours in 2026-08-17')
    expect(planWriting.valueInWords('3 hours in 2026-W34', false)).toBe('3 hours in Week of 17 August')
  })

  it('keeps null off the Writing view of a real plan', async () => {
    const { reply } = await withHoursNobodySaid()
    const [since, reviews] = await Promise.all([
      webApi.api.planSinceRead(reply.plan.id),
      webApi.api.planReviews(reply.plan.id),
    ])
    const said = words(
      h(onePlan.PlanView, { reply, since, reviews, view: 'writing', onView: () => {} }),
    )
    expect(said).toContain('What these lines became')
    expect(said).toContain('no hours yet')
    expect(said).not.toContain('null')
  })
})
