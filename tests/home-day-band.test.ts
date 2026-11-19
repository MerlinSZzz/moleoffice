// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S FIRST BAND: what you have to do, today and this week, in every project.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE MEASURED FACTS THIS FILE TURNS INTO FAILURES
 * ---------------------------------------------------------------------------------------
 *
 * Measured against the running product on 14 August 2026, before the band existed:
 *
 *   1. A BROWSER THAT HAD NEVER CHOSEN A PROJECT OPENED ON ONE HOLDING NOTHING. `GET /api/attention`
 *      answered 0 for it while another project answered 7, so the first thing a stranger read was
 *      that nothing needed them, and it was false. Two separate things fix that and both are here:
 *      the band reads routes that take no project at all, and `openingWorkspace` moves a
 *      never-chosen browser to a project with work in it.
 *
 *   2. HOME DREW NO PLANNING AT ALL — no month, no week, no today. Its four fetches were attention,
 *      anchor, changes and records.
 *
 *   3. 203 PIECES OF WORK, 3 OF THEM WITH ANY HOURS, NONE WITH AN ESTIMATE. So "this week" is nearly
 *      empty on real data, and **an empty week must read as "nothing is scheduled" and never as "you
 *      have nothing to do"**. Those are different facts. Every sentence test below is about keeping
 *      them apart, because the failure is silent: a true sentence in the wrong place.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOUNCE-BACK DEFECT, WHICH WAS LIVE AND WHICH NOTHING WOULD HAVE CAUGHT
 * ---------------------------------------------------------------------------------------
 *
 * `openingWorkspace` promised in its own docstring to fire once, for a browser that had never chosen,
 * and to be "never consulted again" afterwards. It read `projectWasNeverChosen`, a module CONSTANT
 * evaluated when the module was first imported, so it stayed true for the life of the page. App.tsx
 * rebuilds the whole interface when the project changes, and its effect therefore called this again
 * on every rebuild. Choosing a project that holds nothing — Default is a real project on the live
 * installation and holds nothing — bounced the reader straight back, with no way out but a reload.
 * Nothing failed: no type error, no failing test, and the docstring said the opposite of the code.
 *
 * The runner's environment is `node` and this project has ruled out jsdom, so the browser modules
 * are loaded behind a window stand-in and their pure functions are called directly — the same way
 * tests/home-bands.test.ts and tests/workspace-switcher.test.ts do it.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
// THE HOURS ON THIS BAND ARE WRITTEN AS THE PERSON, since 16 September 2026. Criterion P3 and
// problem pOTggQdXY6AZ: turning words about time into hours is the person's own act, and every door
// that reaches an allocation now refuses an agent — this file used to write them as an agent and got
// a 201 because the plan's doors carried the rule and the allocations door did not.
import { THE_PERSON } from '../src/shared/person.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import type { WorkListReply } from '../src/server/lib/worklist.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import type { AllocationWithWork } from '../src/server/lib/planning.ts'
import type { TodayReply } from '../src/web/api.ts'

type Home = typeof import('../src/web/pages/HomePage.tsx')
type WorkspaceLib = typeof import('../src/web/lib/workspace.ts')

const ROBOTICS = 'robotics'

/**
 * A window stand-in, installed before any browser module is loaded.
 *
 * src/web/api.ts reads `window.localStorage` at module scope, and src/web/lib/workspace.ts reads it
 * to answer whether this browser has ever chosen a project — which is the thing several tests below
 * are about, so the store is handed back rather than hidden.
 */
function installWindow(stored?: string): Map<string, string> {
  const store = new Map<string, string>()
  if (stored !== undefined) store.set('mole-office.workspace', stored)
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
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  }
  return store
}

/** The page's own readers, loaded fresh. Its module state is nothing, so one load per file is fine. */
async function home(): Promise<Home> {
  installWindow()
  return import('../src/web/pages/HomePage.tsx')
}

// ============================================================================ against the server

describe('the band reads the same answer whichever project is chosen', () => {
  let t: TestDb
  let app: FastifyInstance
  let todo: PanelRecord

  const file = (kind: RecordKind, title: string, data: Record<string, unknown> = {}): PanelRecord =>
    t.api.createRecord({ workspaceId: ROBOTICS, kind, title, data, actor: AGENT })

  beforeEach(async () => {
    t = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: ROBOTICS, title: 'Robotics' })
    // Three pieces of work, one per bucket the band counts: not finished, finished, and one nothing
    // wrote a state for. The third is the one a careless count would guess about.
    todo = file('task', 'Calibrate the wrist camera', { state: 'todo' })
    file('task', 'Replace the gripper pads', { state: 'done' })
    file('problem', 'The gripper slips at 40N')
  })

  afterEach(async () => {
    await app.close()
    t.close()
  })

  const get = async (url: string, workspace: string) => {
    const res = await app.inject({ method: 'GET', url, headers: { 'x-mole-office-workspace': workspace } })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as Record<string, unknown>
  }

  it('is why a first-time reader is no longer told that nothing needs them', async () => {
    // THE MEASURED FACT, AS A TEST. The project a browser with nothing stored is answered from holds
    // nothing, so the project-scoped band says nothing needs anybody — which is true about that
    // project and false about the person. It is still true here, and it is no longer the whole page.
    const attention = (await get('/api/attention?machine=omit', DEFAULT_WORKSPACE)) as {
      counts: { visible: number }
    }
    expect(attention.counts.visible).toBe(0)

    // The band above it, asked from the same empty project, reports the person's work anyway.
    const { workStanding } = await home()
    const work = (await get('/api/work', DEFAULT_WORKSPACE)) as unknown as WorkListReply
    expect(workStanding(work).unfinished).toBe(1)
    expect(workStanding(work).projects).toBe(1)
  })

  it('answers about every project whichever project the browser names', async () => {
    const fromEmpty = (await get('/api/work', DEFAULT_WORKSPACE)) as unknown as WorkListReply
    const fromFull = (await get('/api/work', ROBOTICS)) as unknown as WorkListReply
    expect(fromEmpty.counted).toBe(fromFull.counted)
    expect(fromEmpty.rows.map((row) => row.id).sort()).toEqual(fromFull.rows.map((row) => row.id).sort())

    const dayFromEmpty = (await get('/api/planning/today', DEFAULT_WORKSPACE)) as unknown as TodayReply
    const dayFromFull = (await get('/api/planning/today', ROBOTICS)) as unknown as TodayReply
    expect(dayFromEmpty.day).toBe(dayFromFull.day)
    expect(dayFromEmpty.allocations.length).toBe(dayFromFull.allocations.length)
  })

  it('counts what is not finished without guessing about what nothing classified', async () => {
    const { workStanding } = await home()
    const work = (await get('/api/work', ROBOTICS)) as unknown as WorkListReply
    const standing = workStanding(work)
    // One of each, and the third is its own answer. Rolling `cannotSay` into either of the others
    // would turn a question into an answer, which is the fifth invariant.
    expect(standing).toMatchObject({ unfinished: 1, finished: 1, cannotSay: 1, withHours: 0 })
  })

  it('reads the week the server says today is in, so the two columns cannot disagree', async () => {
    // The browser never works out which week a day is in. `loadDay` asks for today and builds the
    // week request from what came back, and this is that sequence run against the real routes.
    const today = (await get('/api/planning/today', ROBOTICS)) as unknown as TodayReply
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning/allocations',
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { horizon: 'week', period: today.week, recordId: todo.id, plannedHours: 4 },
    })
    expect(res.statusCode, res.body).toBe(201)

    const week = (await get(`/api/planning/week/${today.week}`, ROBOTICS)) as unknown as PlanReply
    expect(week.period).toBe(today.week)
    expect(week.from <= today.day && today.day <= week.to).toBe(true)

    const { weekLead } = await home()
    expect(weekLead(week)).toBe('1 piece of work this week, 4 hours planned.')
  })

  it('says the planned total is a floor when an allocation did not say how long', async () => {
    const today = (await get('/api/planning/today', ROBOTICS)) as unknown as TodayReply
    for (const hours of [4, null]) {
      const record = file('task', `Sized ${String(hours)}`, { state: 'todo' })
      const res = await app.inject({
        method: 'POST',
        url: '/api/planning/allocations',
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
        payload: { horizon: 'week', period: today.week, recordId: record.id, plannedHours: hours },
      })
      expect(res.statusCode, res.body).toBe(201)
    }

    const week = (await get(`/api/planning/week/${today.week}`, ROBOTICS)) as unknown as PlanReply
    const { weekLead } = await home()
    // "at least" is the whole test. Without it a reader takes 4 hours as the week's whole load when
    // one of its two commitments has no number at all.
    expect(weekLead(week)).toBe(
      '2 pieces of work this week, at least 4 hours planned — one of them does not say how long.',
    )
  })
})

// ============================================================================ the sentences

describe('an empty day says nothing is scheduled, never that there is nothing to do', () => {
  const emptyDay = { allocations: [] } as unknown as TodayReply
  const emptyWeek = { entries: [], fit: { load: { plannedHours: 0 }, unstated: 0 } } as unknown as PlanReply

  it('names the absence as a schedule, and says nothing about whether work exists', async () => {
    const { todayLead, weekLead } = await home()
    expect(todayLead(emptyDay)).toBe('Nothing is scheduled for today.')
    expect(weekLead(emptyWeek)).toBe('Nothing is scheduled for this week.')
    for (const line of [todayLead(emptyDay), weekLead(emptyWeek)]) {
      expect(line).not.toMatch(/nothing to do|you are clear|all done|free/i)
    }
  })

  it('is answered in the same breath by the count of what is not finished', async () => {
    const { standingLead } = await home()
    // The pair a reader actually sees when the week is empty and the corpus is not. On the live
    // corpus that is 114 pieces of work in 3 projects under "Nothing is scheduled for today".
    expect(standingLead({ unfinished: 114, finished: 89, cannotSay: 13, projects: 3, withHours: 3, leftOut: 0 })).toBe(
      '114 pieces of work not finished · in 3 projects',
    )
    expect(standingLead({ unfinished: 1, finished: 0, cannotSay: 0, projects: 1, withHours: 0, leftOut: 0 })).toBe(
      '1 piece of work not finished · in 1 project',
    )
  })

  it('says nothing is unfinished only when nothing is, and keeps the unreadable ones out of it', async () => {
    const { standingLead } = await home()
    // Truly clear: this is the only reading in the band that means "you have nothing to do".
    expect(standingLead({ unfinished: 0, finished: 9, cannotSay: 0, projects: 0, withHours: 0, leftOut: 0 })).toBe(
      'Nothing unfinished, anywhere',
    )
    // Not clear at all: nothing wrote a state on some of it, so Mole Office cannot say. The word "known"
    // is the difference and it is the fifth invariant in one adjective. It survives the shortening,
    // which is the only thing about the wording that ever mattered.
    expect(standingLead({ unfinished: 0, finished: 9, cannotSay: 4, projects: 0, withHours: 0, leftOut: 0 })).toBe(
      'Nothing known to be unfinished, anywhere',
    )
  })

  it('says nobody has set the hours a period holds, and never draws that as zero', async () => {
    const { capacityLead } = await home()
    expect(capacityLead(null, 'today')).toBe('Hours today: not set.')
    expect(capacityLead(null, 'this week')).toBe('Hours this week: not set.')
    // THE NUMBER IS THE ANSWER and the column's own heading says which period it is, so the line
    // under the rows is the label and the numeral. Nought hours is still drawn, and it is still a
    // different drawing from the null above, which is the whole point of the pair.
    expect(capacityLead(0, 'today')).toBe('Holds 0 hours')
    expect(capacityLead(7.5, 'this week')).toBe('Holds 7.5 hours')
  })
})

// ============================================================================ home and the schedule

/**
 * ONE WEEK, ONE ANSWER, WHATEVER PAGE IT IS READ ON.
 *
 * THE DEFECT, OBSERVED IN A BROWSER ON 14 AUGUST 2026. Home said "This week holds 10 hours." The
 * Schedule page, one press away through a link on the same band, said "40h planned of 10h this week
 * · over by 30h" about the same week. Both were true. Home printed the capacity and the planned
 * total as two sentences at two ends of a column and never said what the pair adds up to, so a
 * reader who stopped at Home read a week with ten hours in it and a reader who followed the link
 * read a week thirty hours over.
 *
 * EVERY NUMBER BELOW IS THE SERVER'S. `fitOf` in src/shared/planning.ts works out `freeHours` and
 * `overcommitted` once and sends them; Home prints them. These tests are what stops somebody
 * "simplifying" that into a subtraction in the browser, which would be the same fact worked out in
 * two places with nothing making them agree.
 */
describe('the week says whether it fits, in the same terms the schedule uses', () => {
  /**
   * A `Fit` with only the four fields this sentence reads. The rest of `Load` is the containment
   * report and the actual-hours tally, and none of it reaches these words — spelling it out would
   * be a fixture asserting things the function does not look at.
   */
  const fit = (over: {
    capacityHours: number | null
    load?: { plannedHours: number }
    freeHours?: number | null
    overcommitted?: boolean | null
    unstated?: number
  }) =>
    ({
      load: { plannedHours: 0 },
      freeHours: null,
      overcommitted: null,
      unstated: 0,
      ...over,
    }) as unknown as PlanReply['fit']

  it('says how far over the week is, from the server own free-hours figure', async () => {
    const { weekHoldsLead } = await home()
    // The live reading on 14 August 2026: capacity 10, planned 40, freeHours -30, overcommitted.
    const line = weekHoldsLead(
      fit({ capacityHours: 10, load: { plannedHours: 40 }, freeHours: -30, overcommitted: true }),
    )
    expect(line).toBe('Holds 10 hours · 40 hours planned · over by 30 hours')
    // The number is not worked out here. Hand it a fit whose freeHours disagrees with the two other
    // numbers and the sentence follows the server, because the server is the one that decides.
    const followed = weekHoldsLead(
      fit({ capacityHours: 10, load: { plannedHours: 40 }, freeHours: -7, overcommitted: true }),
    )
    expect(followed).toContain('over by 7 hours')
  })

  it('calls an over-full week a floor while any allocation has no hours on it', async () => {
    const { weekHoldsLead } = await home()
    const line = weekHoldsLead(
      fit({ capacityHours: 10, load: { plannedHours: 40 }, freeHours: -30, overcommitted: true, unstated: 2 }),
    )
    // Both halves take "at least": an unsized commitment can only make the total and the overage
    // bigger, so neither number is the whole.
    expect(line).toBe('Holds 10 hours · at least 40 hours planned · over by at least 30 hours')
  })

  it('calls the hours left a ceiling for the same reason, and never the same word as the floor', async () => {
    const { weekHoldsLead } = await home()
    expect(weekHoldsLead(fit({ capacityHours: 10, load: { plannedHours: 4 }, freeHours: 6, overcommitted: false }))).toBe(
      'Holds 10 hours · 4 hours planned · 6 hours free',
    )
    // With an unsized commitment the total is a floor and what is left is a CEILING. "at least 6
    // hours left" would be the exact opposite of the truth.
    const unsized = weekHoldsLead(
      fit({ capacityHours: 10, load: { plannedHours: 4 }, freeHours: 6, overcommitted: false, unstated: 1 }),
    )
    expect(unsized).toContain('at most 6 hours')
    expect(unsized).not.toContain('at least 6')
  })

  it('puts that sentence on the week column, which is the half a passing helper does not prove', async () => {
    // THE TRAP THIS CATCHES. `weekHoldsLead` was written and tested and then not called: the column
    // went on printing the capacity alone, every test above stayed green, and the defect was still
    // on the screen. `dayBandWords` decides what each column carries, so this reads what the page
    // will actually say.
    const { dayBandWords } = await home()
    const day = { day: '2026-08-14', allocations: [], capacity: null, recurring: [] } as unknown as TodayReply
    const week = {
      entries: [],
      fit: fit({ capacityHours: 10, load: { plannedHours: 40 }, freeHours: -30, overcommitted: true }),
    } as unknown as PlanReply
    const words = dayBandWords(day, week)
    expect(words.week.holds).toContain('over by 30 hours')
    // And the day column does NOT say whether the day fits, because the day route sends no such
    // arithmetic and working it out here would be a second answer to the server's question.
    expect(words.today.holds).toBe('Hours today: not set.')
    expect(words.today.holds).not.toContain('over by')
  })

  it('says a full week is full, and never that nobody has said how many hours it holds', async () => {
    const { weekHoldsLead, capacityLead } = await home()
    expect(weekHoldsLead(fit({ capacityHours: 10, load: { plannedHours: 10 }, freeHours: 0, overcommitted: false }))).toBe(
      'Holds 10 hours · 10 hours planned · full',
    )
    // Nobody has set a capacity: the one answer that is not arithmetic, and it is the SAME sentence
    // the day column uses, from the same function, so the two columns cannot word it differently.
    // It is the one branch here that stays a sentence, because it is never page text — `holdsUnset`
    // sends it to the tooltip of a dashed mark reading `not set`.
    expect(weekHoldsLead(fit({ capacityHours: null }))).toBe(capacityLead(null, 'this week'))
  })
})

// ============================================================================ what a cut list cut

/**
 * A LIST THAT CUTS MUST NOT CUT THE BIGGEST THING, AND MUST SAY WHAT IT CUT.
 *
 * THE DEFECT, OBSERVED IN A BROWSER ON 14 AUGUST 2026. The week drew "6 of 7 shown · the whole
 * week" and the allocation it left out was the largest in the week. The rows arrived in the
 * server's order, which is about when they were written, and the cap took whatever fell off the
 * end.
 */
describe('the day and the week are cut from the bottom, never from the top', () => {
  const entry = (plannedHours: number | null, id: string) =>
    ({ allocation: { id, plannedHours }, work: null }) as unknown as AllocationWithWork

  it('puts the biggest first, so a cap can only ever take the smallest', async () => {
    const { biggestFirst } = await home()
    const order = biggestFirst([entry(2, 'a'), entry(10, 'b'), entry(1, 'c'), entry(8, 'd')])
    expect(order.map((one) => one.allocation.plannedHours)).toEqual([10, 8, 2, 1])
  })

  it('does not treat an allocation with no hours as a small one', async () => {
    const { biggestFirst } = await home()
    // An unsized commitment is one nobody has measured, not one measured at zero. It sorts after
    // the numbers rather than among them, and the line under the rows says how many were left out
    // for that reason.
    const order = biggestFirst([entry(null, 'a'), entry(3, 'b'), entry(null, 'c'), entry(9, 'd')])
    expect(order.map((one) => one.allocation.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('states the ceiling on everything it left out, and adds no hours together to do it', async () => {
    const { cutLead } = await home()
    // The rows are biggest first, so the first row of the cut is the largest thing not shown — which
    // is the exact ceiling on all of them, read off the ordering rather than summed.
    expect(cutLead([entry(1, 'a'), entry(1, 'b'), entry(0.5, 'c')])).toBe('3 left out · 1 hour or smaller')
    expect(cutLead([entry(2, 'a')])).toBe('1 left out · 2 hours or smaller')
  })

  it('counts the ones nothing sized, rather than folding them into the ceiling', async () => {
    const { cutLead } = await home()
    expect(cutLead([entry(1, 'a'), entry(null, 'b'), entry(null, 'c')])).toBe(
      '3 left out · 1 hour or smaller · 2 of them do not say how long',
    )
    // Every cut row is unsized: there is no ceiling to state and the line says so instead of
    // printing one.
    expect(cutLead([entry(null, 'a'), entry(null, 'b')])).toBe('2 left out · none says how long')
    expect(cutLead([])).toBe('')
  })

  it('draws the largest allocation even when the cap cuts, which is the half the helpers cannot prove', async () => {
    // THE TRAP. `biggestFirst` and `cutLead` can both be right while the column quietly stops
    // calling them — which is exactly what the defect was. So this renders the column and looks for
    // the biggest row's own hours in the markup.
    const { DayColumn } = await home()
    const sized = (h: number, name: string) =>
      ({
        allocation: { id: `a${name}`, plannedHours: h },
        work: { id: `w${name}`, name, workspaceId: 'robotics', state: null, kind: 'task', within: null, deleted: false },
      }) as unknown as AllocationWithWork
    // Eight rows against a cap of six, with the biggest LAST in the order handed in — which is the
    // shape the server sent on 14 August 2026, when a 10-hour allocation fell off the end.
    const entries = [1, 2, 3, 4, 5, 6, 7, 40].map((h) => sized(h, `job of ${String(h)}`))
    const html = renderToStaticMarkup(
      createElement(DayColumn, {
        declares: { surface: null },
        title: 'This week',
        words: {
          lead: 'a lead',
          nothingOn: false,
          holds: 'This week holds 10 hours.',
          period: 'this week',
          holdsUnset: false,
        },
        note: 'a note',
        opens: 'the arithmetic',
        entries,
        projectName: () => 'Robotics',
        seeAll: 'the whole week',
        explains: 'how the hours above were worked out',
      }),
    )
    expect(html).toContain('job of 40')
    // The order is stated, and so is what fell off, with the exact ceiling on it.
    expect(html).toContain('biggest first')
    expect(html).toContain('2 left out · 2 hours or smaller')
    // The two SMALLEST rows are the ones cut, and the largest is not.
    expect(html).not.toContain('job of 1<')
    expect(html).not.toContain('job of 2<')
  })
})

/**
 * THE TWO SENTENCES THE OWNER NAMED, AND WHAT STANDS WHERE THEY STOOD.
 *
 * The two sentences "Nothing is scheduled for this week." and "Nobody has said how many
 * hours today holds." carried full sentence weight for facts a reader does not act on. The rule that
 * settles what replaces them is in design/ROUND-FOUR.md and it is not "delete it": an empty day is
 * ORDINARY EMPTINESS and gets a dimmed dash, and a capacity nobody set is a difference the reader
 * must be able to tell — null is not zero — so it keeps a mark with the dashed edge that means a
 * gap somebody can close.
 *
 * BOTH SENTENCES ARE STILL REACHABLE, and that is half of what is checked here. They moved onto the
 * mark's own tooltip, and the server's whole paragraph is still one press away.
 */
describe('the day band draws an absence at its weight, and never as a blank', () => {
  /** One column, rendered from the words `dayBandWords` would hand it. */
  const column = (DayColumn: unknown, words: Record<string, unknown>, entries: unknown[] = []) =>
    renderToStaticMarkup(
      createElement(DayColumn as never, {
        declares: { surface: null },
        title: 'Today, 2026-08-15',
        words,
        note: 'the server paragraph',
        opens: 'what today is',
        entries,
        projectName: () => 'Mole Office',
        seeAll: 'today, whole',
      } as never),
    )

  it('draws a dash where “Nothing is scheduled for today.” was, and keeps the sentence on it', async () => {
    const { DayColumn, todayLead, capacityLead } = await home()
    const empty = { allocations: [] } as unknown as TodayReply
    const html = column(DayColumn, {
      lead: todayLead(empty),
      nothingOn: true,
      holds: capacityLead(10, 'today'),
      period: 'today',
      holdsUnset: false,
    })
    // The quiet drawing is there and it is not blank: a blank would read as "there is none" on a
    // screen where the truth could be "nobody looked".
    expect(html).toContain('px-absent')
    // The sentence is NOT a line of text a reader sees any more. The screen-reader copy is stripped
    // first, because that one is deliberately there and is checked below.
    const seen = html.replace(/<span class="px-sr">[^<]*<\/span>/g, '')
    expect(seen).not.toContain('>Nothing is scheduled for today.<')
    // ...and it is not gone either, in either channel. This is the half an agent quietening this
    // will be tempted to skip.
    expect(html).toContain('title="Nothing is scheduled for today."')
    expect(html).toContain('<span class="px-sr">Nothing is scheduled for today.</span>')
  })

  it('says the hours are not set in three words, and never lets that read as zero', async () => {
    const { DayColumn, todayLead, capacityLead } = await home()
    const empty = { allocations: [] } as unknown as TodayReply
    const html = column(DayColumn, {
      lead: todayLead(empty),
      nothingOn: true,
      holds: capacityLead(null, 'today'),
      period: 'today',
      holdsUnset: true,
    })
    expect(html).toContain('Hours today')
    expect(html).toContain('not set')
    // THE DASHED EDGE IS THE POINT. It is what separates a capacity nobody has set from one set to
    // zero, and it is the shape this product already uses for "nobody can say".
    expect(html).toContain('data-edge="dashed"')
    // Never a number that nobody wrote.
    expect(html).not.toContain('0 hours')
    // The whole sentence survives on the mark.
    expect(html).toContain('Hours today: not set.')
  })

  it('draws the sentence, not a dash, when the period has something on it', async () => {
    const { DayColumn } = await home()
    const html = column(DayColumn, {
      lead: '3 pieces of work this week, 10 hours planned.',
      nothingOn: false,
      holds: 'This week holds 10 hours and 10 hours are planned into it. It is full.',
      period: 'this week',
      holdsUnset: false,
    })
    expect(html).toContain('3 pieces of work this week')
    expect(html).not.toContain('px-absent')
  })

  it('marks an allocation nobody sized apart from one of no hours', async () => {
    const { DayColumn } = await home()
    const unsized = {
      allocation: { id: 'a1', plannedHours: null },
      work: { id: 'w1', name: 'a job', workspaceId: 'panelx', state: null, kind: 'task', within: null, deleted: false },
    }
    const html = column(
      DayColumn,
      { lead: '1 piece of work on today.', nothingOn: false, holds: 'Today holds 8 hours.', period: 'today', holdsUnset: false },
      [unsized],
    )
    expect(html).toContain('not sized')
    expect(html).toContain('data-edge="dashed"')
    // "0 hours" would be a number nobody wrote, and `biggestFirst` would then be sorting it as the
    // smallest commitment in the period rather than as one nobody has measured.
    expect(html).not.toContain('>0<')
  })
})

describe('what is not finished, counted from the one classifier this product has', () => {
  const row = (state: string | null, workspaceId = 'panelx', periods: number = 0) => ({
    id: `r${state ?? 'none'}${workspaceId}`,
    state,
    workspaceId,
    hoursGiven: Array.from({ length: periods }, () => ({ horizon: 'week', period: '2026-W33' })),
  })
  const reply = (rows: unknown[], leftOut = 0) => ({ rows, leftOut }) as unknown as WorkListReply

  it('separates not finished, finished, and the ones nothing has classified', async () => {
    const { workStanding } = await home()
    const standing = workStanding(
      reply([
        row('todo'),
        row('doing'),
        row('blocked'),
        row('done'),
        row('fixed'),
        row(null),
        row('a word nothing has ever classified'),
      ]),
    )
    expect(standing).toMatchObject({ unfinished: 3, finished: 2, cannotSay: 2 })
  })

  it('counts the projects the unfinished work sits in, and not the finished work', async () => {
    const { workStanding } = await home()
    const standing = workStanding(
      reply([row('todo', 'panelx'), row('doing', 'robotics'), row('done', 'unassigned')]),
    )
    expect(standing.projects).toBe(2)
  })

  it('counts how many unfinished pieces have ever been given hours, and never adds the hours up', async () => {
    const { workStanding } = await home()
    // Two periods on one piece of work is ONE piece of work with hours. Hours at different horizons
    // are never added, and this count is deliberately of rows rather than of hours for that reason.
    const standing = workStanding(reply([row('todo', 'panelx', 2), row('doing', 'robotics', 0)]))
    expect(standing.withHours).toBe(1)
  })

  it('carries how many pieces of work the reply left out, so a cut list is never read as the whole', async () => {
    const { workStanding } = await home()
    expect(workStanding(reply([row('todo')], 91)).leftOut).toBe(91)
  })
})

// ============================================================================ where a browser opens

describe('a browser that has never chosen a project', () => {
  /** A fresh copy of the module, with whatever this browser had stored before it loaded. */
  async function fresh(stored?: string): Promise<WorkspaceLib> {
    vi.resetModules()
    installWindow(stored)
    return import('../src/web/lib/workspace.ts')
  }

  const projects = [
    { id: DEFAULT_WORKSPACE, title: 'Default', records: 0 },
    { id: 'panelx', title: 'Mole Office', records: 167 },
    { id: 'robotics', title: 'Robotics', records: 185 },
  ]

  it('opens on the project with the most in it, and says why in the projects own names', async () => {
    const ws = await fresh()
    expect(ws.currentWorkspace()).toBe(DEFAULT_WORKSPACE)
    const open = ws.openingWorkspace(projects)
    expect(open?.id).toBe('robotics')
    // The ids are lookup keys. This sentence is printed on the frame the moment the page opens, and
    // it carries both counts so a reader can check the move rather than take it on trust.
    expect(open?.because).toBe(
      'Opened Robotics, which holds 185 records. You have not chosen a project, and Default holds 0 records.',
    )
  })

  it('still moves a never-chosen browser when one stray record has been left in the default', async () => {
    // THE DEFECT, OBSERVED IN A FRESH BROWSER ON 14 AUGUST 2026, AFTER THIS WAS BELIEVED FIXED.
    // The rule was "leave the current project alone whenever it holds anything at all", so the whole
    // fix evaporated the day somebody filed one record into `default`: a stranger landed on
    // "Default · 1", was told nothing was owed, and had 197 records of robotics work in a dropdown.
    // The server's own note on `default` says a record left in it is a record NOBODY HAS ASSIGNED to
    // a project, so one such record was never evidence that a reader belongs there.
    const ws = await fresh()
    const open = ws.openingWorkspace([{ id: DEFAULT_WORKSPACE, title: 'Default', records: 1 }, ...projects.slice(1)])
    expect(open?.id).toBe('robotics')
    // Both counts, and the singular inflected. The sentence is the whole defence of the move.
    expect(open?.because).toBe(
      'Opened Robotics, which holds 185 records. You have not chosen a project, and Default holds 1 record.',
    )
  })

  it('leaves the browser where it is when no project holds more than this one', async () => {
    // Most records wins outright, so a default that IS the fullest project is a real answer and is
    // left alone. There is no threshold and nothing for a reader to work out.
    const ws = await fresh()
    expect(
      ws.openingWorkspace([
        { id: DEFAULT_WORKSPACE, title: 'Default', records: 300 },
        { id: 'panelx', title: 'Mole Office', records: 167 },
      ]),
    ).toBe(null)
  })

  it('draws nothing when every project is empty, because there is nowhere to send anybody', async () => {
    const ws = await fresh()
    expect(ws.openingWorkspace([{ id: DEFAULT_WORKSPACE, title: 'Default', records: 0 }])).toBe(null)
  })

  it('breaks a tie by id, so two browsers of one installation open on the same project', async () => {
    const ws = await fresh()
    const tied = [
      { id: DEFAULT_WORKSPACE, title: 'Default', records: 0 },
      { id: 'zeta', title: 'Zeta', records: 12 },
      { id: 'alpha', title: 'Alpha', records: 12 },
    ]
    expect(ws.openingWorkspace(tied)?.id).toBe('alpha')
    // The same list in the other order gives the same answer. Without the second sort key the
    // server's listing order decides it, and nothing tells a reader why they landed where they did.
    expect(ws.openingWorkspace([tied[0]!, tied[2]!, tied[1]!])?.id).toBe('alpha')
  })

  it('never fires again once a project has been chosen, even an empty one', async () => {
    // THE BOUNCE-BACK. Default is a real project on the live installation and holds nothing, so
    // choosing it deliberately used to send the reader straight back to Robotics with no way out but
    // a reload. The whole of this test is the second call.
    const ws = await fresh()
    expect(ws.openingWorkspace(projects)?.id).toBe('robotics')
    ws.setWorkspace('robotics')
    expect(ws.openingWorkspace(projects)).toBe(null)

    ws.setWorkspace(DEFAULT_WORKSPACE)
    expect(ws.currentWorkspace()).toBe(DEFAULT_WORKSPACE)
    expect(ws.openingWorkspace(projects)).toBe(null)
  })

  it('says on the screen that it moved the browser, and only once the move has happened', async () => {
    // THE DEFECT, OBSERVED IN A BROWSER ON 14 AUGUST 2026. The move happened and NOTHING ON THE
    // SCREEN SAID SO: App.tsx held the sentence in state inside the component that the switch
    // throws away, so `.shell-opened` was not in the document at all afterwards. A browser that
    // silently moves you to another project is the failure this whole file is about.
    const ws = await fresh()
    // Offering is not doing. Until the move is made there is nothing true to print.
    expect(ws.workspaceOpenedNote()).toBe(null)
    const open = ws.openingWorkspace(projects)
    expect(ws.workspaceOpenedNote()).toBe(null)
    ws.setWorkspace(open?.id ?? '')
    expect(ws.workspaceOpenedNote()).toBe(open?.because)
  })

  it('never says it moved a browser that was moved by a person', async () => {
    // A press in the switcher needs no explanation of itself, and a sentence saying Mole Office chose
    // this project for somebody who chose it would be false.
    const ws = await fresh()
    ws.openingWorkspace(projects)
    ws.setWorkspace('panelx')
    expect(ws.workspaceOpenedNote()).toBe(null)
  })

  it('does not fire for a browser that already had a project stored', async () => {
    const ws = await fresh('panelx')
    expect(ws.currentWorkspace()).toBe('panelx')
    expect(ws.projectWasNeverChosen()).toBe(false)
    expect(ws.openingWorkspace([{ id: 'panelx', title: 'Mole Office', records: 0 }, ...projects.slice(2)])).toBe(null)
  })

  it('treats a stored value it had to throw away as a choice, so the reported reset stays true', async () => {
    // The boot fault says the value was dropped, that this browser is now reading the stated default,
    // and asks the reader to choose the project they meant. Moving them somewhere else in the same
    // breath would make all three clauses false.
    const ws = await fresh('Robotics Project!')
    expect(ws.workspaceBootFault()).not.toBe(null)
    expect(ws.currentWorkspace()).toBe(DEFAULT_WORKSPACE)
    expect(ws.openingWorkspace(projects)).toBe(null)
  })
})
