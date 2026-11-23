// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The Wave 6 planning surfaces: src/web/components/Planning.tsx.
 *
 * WHY IT LOOKS LIKE THIS. The runner's environment is `node` and this project has ruled out adding
 * a DOM, so the same two shapes as tests/records-queries-pages.test.ts: pure functions called
 * directly, and presentational components rendered to static markup with react-dom/server. That is
 * enough for what must be IN the markup — and on these surfaces what must be in the markup is
 * mostly the counting doctrine: every total says how many rows it could not count, and an absence
 * is drawn as an absence.
 *
 * WHAT THIS DOES NOT COVER: whether the panels read at 1440 and stack at 390, and whether a write
 * lands. Those are screenshot and browser questions and were answered that way — driving the real
 * app against a copy of the corpus, which is how the two defects in this file's history were found
 * (a search panel unmounted by its own success, and a refusal sentence that collapsed the title
 * column to one character wide).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE TEST AUDIT OF 3 SEPTEMBER 2026 CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * MOST OF THIS FILE ALREADY ASSERTED WORDS A PERSON READS. Three places did not, and all three read
 * a `.tsx` file as text and matched code in it with a regular expression:
 *
 *   THE ACCENT CENSUS kept a hand-written list of the six class names that spend the accent on this
 *   page. `src/shared/colourroles.ts` already holds that list with a reason beside each entry, and
 *   the colour role register's test compared it against the same file — so this
 *   was a second copy of one fact, which is the defect at the head of CLAUDE.md. It is gone. What
 *   is left here is that the register still reads this file, and that every hue on this page is
 *   said in words as well.
 *
 *   THE TWO ABSENCE CHECKS at the foot of the file read `Planning.tsx`. One of them froze a count
 *   at one and would have called a second honest loud absence a failure; it asks the property
 *   instead. The other draws both surfaces and checks each prints exactly what the one writer says,
 *   and keeps the "typed once" line, which no rendering can make.
 */

import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  containsPeriod,
  fitOf,
  loadOf,
  parsePeriod,
  spreadOf,
  type Allocation,
  type Grain,
  type HoursCountedTwice,
} from '../src/shared/planning.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import { type AllocationWithWork } from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import type { WorkRow } from '../src/server/lib/worklist.ts'
import type { TodayReply } from '../src/web/api.ts'
import { theWordListText } from './word-list-files.ts'

type PlanningModule = typeof import('../src/web/components/Planning.tsx')
let planning: PlanningModule

beforeAll(async () => {
  // Planning.tsx reaches src/web/api.ts, which reads window.localStorage at module scope to
  // restore who you are acting as. The smallest stand-in that lets the module load; nothing here
  // is under test. Same stub as tests/records-queries-pages.test.ts.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    // `search` is read at import time by lib/mode.ts. Empty is "nothing in the address decides",
    // which is what every test below wants.
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  planning = await import('../src/web/components/Planning.tsx')
})

/**
 * The same module with a different address, for the things that are read once at import.
 *
 * The import has to be busted out of the cache because those settings are read at module scope on
 * purpose: an effect would show one frame of the wrong view. See tests/mode.test.ts, which boots
 * the same way.
 *
 * `?ux=…` used to pick one of two week designs for a single visit. The registry that read it is
 * deleted, and the test below that still passes such an address is what proves the address now
 * reaches nothing.
 */
async function bootPlanning(search: string): Promise<PlanningModule> {
  const w = (globalThis as unknown as { window: { location: { search: string } } }).window
  w.location.search = search
  vi.resetModules()
  const fresh = (await import('../src/web/components/Planning.tsx')) as PlanningModule
  w.location.search = ''
  return fresh
}

describe('stepping from one period to the next', () => {
  it('steps a month by the calendar and not by thirty days', () => {
    expect(planning.shift('2026-01', 1)).toBe('2026-02')
    expect(planning.shift('2026-12', 1)).toBe('2027-01')
    expect(planning.shift('2026-03', -1)).toBe('2026-02')
  })

  it('steps a week across an ISO year boundary, where the key year is not the calendar year', () => {
    // 2026-W53 runs 28 December 2026 to 3 January 2027, so the week after it is 2027-W01 and the
    // week before it is 2026-W52. Stepping by seven days and re-reading the key is what gets this
    // right; adding one to the number would produce "2026-W54", which is not a week.
    expect(planning.shift('2026-W53', 1)).toBe('2027-W01')
    expect(planning.shift('2026-W53', -1)).toBe('2026-W52')
  })

  it('steps a day across a month end', () => {
    expect(planning.shift('2026-08-31', 1)).toBe('2026-09-01')
    expect(planning.shift('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('hands back anything that is not a period, rather than inventing one', () => {
    // The arrows then lead nowhere new and the page's own error says what a period looks like.
    expect(planning.shift('2026-W99', 1)).toBe('2026-W99')
    expect(planning.shift('not a period', 1)).toBe('not a period')
  })
})

describe('the weeks a month covers', () => {
  it('lists every ISO week that touches the month, in order, once each', () => {
    const weeks = planning.weeksOf('2026-08')
    expect(weeks.map((w) => w.key)).toEqual([
      '2026-W31',
      '2026-W32',
      '2026-W33',
      '2026-W34',
      '2026-W35',
      '2026-W36',
    ])
  })

  it('says which of them run outside the month rather than rounding them into it', () => {
    // August 2026 starts on a Saturday and ends on a Monday, so the first and last weeks straddle.
    const weeks = planning.weeksOf('2026-08')
    expect(weeks.filter((w) => !w.whole).map((w) => w.key)).toEqual(['2026-W31', '2026-W36'])
  })

  it('agrees with containsPeriod for every week it returns, in every month of a year', () => {
    // The flag is the one thing here that could quietly become decoration, so it is checked
    // against the shared function that defines it rather than against a list written by hand.
    for (let month = 1; month <= 12; month++) {
      const key = `2026-${String(month).padStart(2, '0')}`
      const outer = parsePeriod(key)
      expect(outer).not.toBeNull()
      for (const week of planning.weeksOf(key)) {
        const inner = parsePeriod(week.key)
        expect(inner).not.toBeNull()
        expect(week.whole).toBe(containsPeriod(outer!, inner!))
      }
    }
  })

  it('answers nothing for a key that is not a month', () => {
    expect(planning.weeksOf('2026-W33')).toEqual([])
    expect(planning.weeksOf('2026-13')).toEqual([])
  })
})

/** One allocation with its work, built for a test. Only the fields these surfaces read are set. */
function entry(
  recordId: string,
  plannedHours: number | null,
  work: Partial<NonNullable<AllocationWithWork['work']>> | null,
  at: { horizon: Grain; period: string } = { horizon: 'week', period: '2026-W33' },
): AllocationWithWork {
  return {
    allocation: {
      id: `a-${recordId}`,
      horizon: at.horizon,
      period: at.period,
      recordId,
      plannedHours,
      actualHours: null,
      state: 'planned',
      note: null,
      createdAt: '2026-08-12 09:00:00',
      updatedAt: '2026-08-12 09:00:00',
    },
    work:
      work === null
        ? null
        : {
            id: recordId,
            kind: 'task',
            title: `task ${recordId}`,
            name: `task ${recordId}`,
            within: null,
            workspaceId: 'panelx',
            state: 'todo',
            effortHours: null,
            origin: 'authored',
            deleted: false,
            ...work,
          },
  }
}

describe("one person's hours, cut by the projects sharing them", () => {
  it('names every project and adds up only the hours that were stated', () => {
    const markup = renderToStaticMarkup(
      h(planning.ProjectSplit, {
        entries: [
          entry('a', 4, { workspaceId: 'panelx' }),
          entry('b', 2, { workspaceId: 'panelx' }),
          entry('c', 3, { workspaceId: 'robotics' }),
        ],
      }),
    )
    // 7FEOshq3mBGG: an unread project name has a label; its stored id is for Inspect.
    expect(markup).not.toContain('panelx')
    expect(markup).not.toContain('robotics')
    expect(markup).toContain('Project name unavailable')
    expect(markup).toContain('6h over 2 pieces of work')
    expect(markup).toContain('3h over 1 piece of work')
  })

  it('says how many of a project’s allocations gave no number at all', () => {
    // THE COUNT IS THE POINT. 4h over three allocations is a floor while two of them said nothing,
    // and a line that showed only the total would read as the whole.
    const markup = renderToStaticMarkup(
      h(planning.ProjectSplit, {
        entries: [entry('a', 4, {}), entry('b', null, {}), entry('c', null, {})],
      }),
    )
    expect(markup).toContain('4h over 3 pieces of work, 2 of them with no hours')
  })

  it('counts an allocation whose record is gone under its own heading rather than dropping it', () => {
    const markup = renderToStaticMarkup(
      h(planning.ProjectSplit, { entries: [entry('a', 4, {}), entry('gone', 2, null)] }),
    )
    expect(markup).toContain('record gone')
    expect(markup).toContain('2h over 1 piece of work')
  })

  it('rounds the sum, because 0.1 and 0.2 planned is not 0.30000000000000004 hours', () => {
    const markup = renderToStaticMarkup(
      h(planning.ProjectSplit, { entries: [entry('a', 0.1, {}), entry('b', 0.2, {})] }),
    )
    expect(markup).toContain('0.3h over 2 pieces of work')
    expect(markup).not.toContain('0.30000000000000004')
  })

  it('draws nothing at all when the period is empty', () => {
    expect(renderToStaticMarkup(h(planning.ProjectSplit, { entries: [] }))).toBe('')
  })
})

describe('how a plan names the work it points at', () => {
  it('says which project owns the work, on every row', () => {
    // On the one page that legitimately spans projects, this is the difference between a week and
    // a merge, so it is checked rather than assumed.
    const markup = renderToStaticMarkup(
      h(planning.WorkIdent, {
        work: entry('a', 1, { workspaceId: 'robotics' }).work,
        recordId: 'a',
      }),
    )
    expect(markup).not.toContain('robotics')
    expect(markup).toContain('Project name unavailable')
  })

  it("shows a block's own name and reports its pipeline separately", () => {
    const markup = renderToStaticMarkup(
      h(planning.WorkIdent, {
        work: entry('b', 1, { kind: 'block', name: 'Wave 5', within: 'The campaign' }).work,
        recordId: 'b',
      }),
    )
    expect(markup).toContain('Wave 5')
    expect(markup).toContain('in The campaign')
  })

  it('reports a record that has gone instead of drawing an empty row', () => {
    const markup = renderToStaticMarkup(h(planning.WorkIdent, { work: null, recordId: 'PiQzVdq42ufa' }))
    expect(markup).toContain('the record this named is gone')
    // THE ID IS DEVELOPER MODE'S. It used to be printed in brackets to everybody, and
    // docs/UX-CONTRACT.md puts record ids in Developer mode by name: a nanoid tells a Normal
    // reader nothing they can act on. Nothing is lost — the id is still drawn in the other mode,
    // and tests/plan-surfaces-say-what-is-true.test.ts checks both directions.
    expect(markup).not.toContain('PiQzVdq42ufa')
  })

  it('marks work that has been deleted since the allocation was written', () => {
    const markup = renderToStaticMarkup(
      h(planning.WorkIdent, { work: entry('c', 1, { deleted: true }).work, recordId: 'c' }),
    )
    // Sentence case. Capitals mark chrome, never content — docs/UX-CONTRACT.md. Finding 11.
    expect(markup).toContain('Deleted')
    expect(markup).not.toContain('DELETED')
  })

  it('calls a made-up example what every other page calls it', () => {
    // ONE CONCEPT, ONE WORD. This drew a tag reading FIXTURE — the stored value — while the plan
    // table, the work page and the record page all say "Made-up example". Two words for one idea,
    // and the one this page used is the one only a programmer decodes.
    const markup = renderToStaticMarkup(
      h(planning.WorkIdent, { work: entry('d', 1, { origin: 'fixture' }).work, recordId: 'd' }),
    )
    expect(markup).toContain('Made-up example')
    expect(markup).not.toContain('FIXTURE')
  })

  it('says nothing about origin on a reading that carries none', () => {
    // `GET /api/work` sends no origin, so the panel that offers work has `origin: null` on every
    // row. That means "this reading carries no origin", not "nobody recorded one", and drawing
    // "Origin not recorded" for it would be a claim about the record that nothing supports.
    const markup = renderToStaticMarkup(
      h(planning.WorkIdent, { work: entry('e', 1, { origin: null }).work, recordId: 'e' }),
    )
    expect(markup).not.toContain('Origin not recorded')
    expect(markup).not.toContain('Made-up example')
  })
})

// ============================================================================================
// THE 2026-08-13 REDESIGN
//
// Two independent audits opened this page cold and returned the same verdict: guessable, not
// clear. Everything below pins one of their findings, and each one is a thing that was TRUE of
// the page on the day it was measured rather than a rule somebody thought of afterwards.
// ============================================================================================

/**
 * A whole plan reply, with its arithmetic computed by the SAME functions the server calls.
 *
 * Nothing here hand-writes a `fit` or a `spread`. tests/deadline-panel.test.ts learnt this the
 * expensive way: a hand-written report can hold a combination the arithmetic never produces, and a
 * test of that is a test of nothing.
 */
function planReply(opts: {
  horizon: Grain
  period: string
  entries?: AllocationWithWork[]
  capacityHours?: number | null
  /** Allocations at the FINER horizon inside this period — a week inside a month, a day inside a week. */
  inside?: Allocation[]
  /**
   * This period's containment reading, which the route ALWAYS sends and which is therefore never
   * null here by default. An empty reading is "somebody looked and there is no pair"; `null` would
   * be "nobody looked", and a fixture defaulting to that would draw a warning on every period the
   * real product draws none on.
   */
  countedTwice?: HoursCountedTwice | null
}): PlanReply {
  const parsed = parsePeriod(opts.period)
  if (parsed === null) throw new Error(`the test asked for "${opts.period}", which is not a period`)
  const entries = opts.entries ?? []
  const mine = entries.map((e) => e.allocation)
  const inside = opts.inside ?? []
  const capacity =
    opts.capacityHours === undefined || opts.capacityHours === null
      ? null
      : { horizon: opts.horizon, period: opts.period, hours: opts.capacityHours, note: null, updatedAt: '2026-08-13 09:00:00' }
  const countedTwice =
    opts.countedTwice === undefined
      ? { horizon: opts.horizon, period: opts.period, pairs: [], notChecked: [] }
      : opts.countedTwice
  const load = loadOf(opts.horizon, opts.period, mine, countedTwice)
  const finerGrain: Grain | null = opts.horizon === 'month' ? 'week' : opts.horizon === 'week' ? 'day' : null
  const all = [...mine, ...inside]
  return {
    horizon: opts.horizon,
    period: opts.period,
    from: parsed.from,
    to: parsed.to,
    entries,
    capacity,
    fit: fitOf(load, capacity?.hours ?? null),
    spread: finerGrain === null ? null : spreadOf(parsed, finerGrain, all),
    finer:
      finerGrain === null
        ? null
        : [...new Set(inside.map((a) => a.period))]
            .sort()
            .map((key) => loadOf(finerGrain, key, all, { horizon: finerGrain, period: key, pairs: [], notChecked: [] })),
    allocatableKinds: ALLOCATABLE_KINDS,
    alsoNamed: [],
    shares: [],
    note: 'the server’s own sentence about this period',
  }
}

/** One allocation at a finer horizon inside the period being drawn. */
function inside(recordId: string, horizon: Grain, period: string, plannedHours: number | null): Allocation {
  return {
    id: `i-${recordId}-${period}`,
    horizon,
    period,
    recordId,
    plannedHours,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-12 09:00:00',
    updatedAt: '2026-08-12 09:00:00',
  }
}

/** The server's day, week and month, as the page reads them. Thursday 13 August 2026. */
const TODAY = { day: '2026-08-13', week: '2026-W33', month: '2026-08' }

describe('what a period is called', () => {
  it('says Today, Tomorrow and Yesterday rather than a stored key', () => {
    // THE TITLE WAS THE KEY — "2026-W33", "2026-08-13" — with the human range demoted underneath
    // it and nothing at all saying whether a day had been or was to come.
    expect(planning.periodSaid('2026-08-13', TODAY).name).toBe('Today')
    expect(planning.periodSaid('2026-08-14', TODAY).name).toBe('Tomorrow')
    expect(planning.periodSaid('2026-08-12', TODAY).name).toBe('Yesterday')
    expect(planning.periodSaid('2026-W33', TODAY).name).toBe('This week')
    expect(planning.periodSaid('2026-W34', TODAY).name).toBe('Next week')
    expect(planning.periodSaid('2026-W32', TODAY).name).toBe('Last week')
    expect(planning.periodSaid('2026-08', TODAY).name).toBe('This month')
    expect(planning.periodSaid('2026-09', TODAY).name).toBe('Next month')
  })

  it('names a period that is nowhere near today without pretending it is relative', () => {
    expect(planning.periodSaid('2026-11-04', TODAY).name).toBe('Wed 4 November')
    expect(planning.periodSaid('2026-W45', TODAY).name).toBe('Week of 2 November')
    expect(planning.periodSaid('2026-11', TODAY).name).toBe('November 2026')
  })

  it('says whether it has been or is still to come, and says NOTHING until the server has answered', () => {
    // Absence beats a guess: with no answer from the server about what day it is, a page that said
    // "still to come" would be reading this browser's clock, which is the one this product does not
    // write its stamps with.
    expect(planning.periodSaid('2026-08-12', TODAY).when).toBe('past')
    expect(planning.periodSaid('2026-08-14', TODAY).when).toBe('ahead')
    expect(planning.periodSaid('2026-08-13', TODAY).when).toBe('now')
    expect(planning.periodSaid('2026-W33', TODAY).when).toBe('now')
    expect(planning.periodSaid('2026-08-14', null).when).toBe('unknown')
    expect(planning.periodSaid('2026-08-14', null).name).toBe('Fri 14 August')
  })

  it('writes the days it covers out, and writes the month once when both ends share it', () => {
    expect(planning.periodSaid('2026-W33', TODAY).range).toBe('10 – 16 August 2026')
    expect(planning.periodSaid('2026-W36', TODAY).range).toBe('31 August – 6 September 2026')
    // A DAY WITH ITS WEEKDAY AND ITS YEAR, as Intl's British English writes it, with a comma after the weekday:
    // every day is written by the office's one formatter since wave 13q's round 28.
    expect(planning.periodSaid('2026-08-13', TODAY).range).toBe('Thu, 13 August 2026')
    expect(planning.periodSaid('2026-08', TODAY).range).toBe('1 – 31 August 2026')
  })

  it('says a period is unknown without exposing its invalid stored key', () => {
    expect(planning.periodSaid('2026-W99', TODAY).name).toBe('Unknown period')
    expect(planning.periodSaid('2026-W99', TODAY).when).toBe('unknown')
  })
})

describe('the same moment at another horizon', () => {
  it('lands on TODAY when today is inside the period, not on the first of it', () => {
    // MEASURED ON 2026-08-13: from the month 2026-08 the "day" pill went to 2026-08-01, every
    // time, on a page opened in the middle of that month. A month either contains today or it does
    // not, and when it does, the day a person means by "day" is today.
    expect(planning.atGrain('2026-08', 'day', TODAY.day)).toBe('2026-08-13')
    expect(planning.atGrain('2026-W33', 'day', TODAY.day)).toBe('2026-08-13')
    expect(planning.atGrain('2026-08', 'week', TODAY.day)).toBe('2026-W33')
  })

  it('lands on the first day when today is somewhere else entirely', () => {
    expect(planning.atGrain('2026-11', 'day', TODAY.day)).toBe('2026-11-01')
    expect(planning.atGrain('2026-W45', 'day', TODAY.day)).toBe('2026-11-02')
  })

  it('does not read this browser’s clock when the server has not said what day it is', () => {
    expect(planning.atGrain('2026-08', 'day', null)).toBe('2026-08-01')
  })

  it('hands back anything that is not a period', () => {
    expect(planning.atGrain('not a period', 'day', TODAY.day)).toBe('not a period')
  })
})

/**
 * The markup WITHOUT the stylesheet in it. Every planning component renders its own `<style>`, and
 * a class name or a comment in there is not a word anybody reads — so an assertion about the words
 * on the screen has to drop it first, or it is really an assertion about the CSS.
 */
function onScreen(markup: string): string {
  return markup.replace(/<style[^>]*>.*?<\/style>/gs, '')
}

describe('a week, read top to bottom', () => {
  const week = () =>
    planReply({
      horizon: 'week',
      period: '2026-W33',
      capacityHours: 10,
      entries: [entry('a', 10, { name: 'Wave 5' }), entry('b', null, { name: 'Wave 6' }), entry('c', null, { name: 'Wave 7' })],
    })

  it('draws how full it is as a bar with every band also written out', () => {
    // No state is carried by colour alone: the bar has a text alternative and the numbers are in
    // the sentence under it, so a reader who cannot see the fill loses nothing.
    const markup = renderToStaticMarkup(
      h(planning.WeekBuild, { reply: week(), said: planning.periodSaid('2026-W33', TODAY), wrote: 0, editing: true, onWrote: () => {} }),
    )
    expect(markup).toContain('10 of 10 hours planned this week')
    expect(markup).toContain('planned of')
    expect(markup).toContain('left')
    // The total is a floor while anything says no hours, and the bar says so rather than showing a
    // confident number about nothing.
    // NOT "a floor", which is a term of art, and not "the hatching", which names a visual texture
    // in prose. Finding 25 of the language audit, 19 August 2026.
    expect(markup).toContain(sayInEnglish('schedule.unstatedCount', { n: 2 }))
    expect(markup).not.toContain('floor')
    expect(markup).not.toContain('hatching')
  })

  it('never shows a free-hours figure for a week nobody has sized', () => {
    const markup = renderToStaticMarkup(
      h(planning.WeekBuild, {
        reply: planReply({ horizon: 'week', period: '2026-W33', entries: [entry('a', 4, {})] }),
        said: planning.periodSaid('2026-W33', TODAY),
        wrote: 0,
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('Hours this week: not set')
    expect(markup).not.toContain('hours planned this week</')
    // And the one press that answers it, rather than four widgets in a row.
    expect(markup).toContain('Set week capacity')
  })

  it('puts the way to add work at the END, after the summary and the rows', () => {
    // THE BUILDER WAS THE THIRD PANEL DOWN, under a summary and a table of finer periods, on the
    // page whose job is putting work on a week.
    const markup = renderToStaticMarkup(
      h(planning.WeekBuild, { reply: week(), said: planning.periodSaid('2026-W33', TODAY), wrote: 0, editing: true, onWrote: () => {} }),
    )
    const rows = markup.indexOf('Wave 5')
    const add = markup.indexOf('Add work to this week')
    expect(rows).toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(rows)
  })

  it('makes the add section the empty state, instead of a sentence that leads nowhere', () => {
    const markup = renderToStaticMarkup(
      h(planning.WeekBuild, {
        reply: planReply({ horizon: 'week', period: '2026-W33' }),
        said: planning.periodSaid('2026-W33', TODAY),
        wrote: 0,
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(markup).not.toContain('Nothing is planned in this period')
    // The add section is the work list, and with no server behind it that is its loading state —
    // which is still the section, in the place the section goes, rather than a dead end.
    expect(markup).toContain('every piece of work in every project')
  })

  it('says none of it in storage words', () => {
    const markup = onScreen(renderToStaticMarkup(
      h(planning.WeekBuild, { reply: week(), said: planning.periodSaid('2026-W33', TODAY), wrote: 0, editing: true, onWrote: () => {} }),
    ))
    for (const word of [
      'planned at this horizon',
      'the period holds',
      'say no hours',
      'scheduled against unscheduled',
      'horizon',
      // PLAIN WORDS, AS A RULE. These are the names the database and this code use for the thing;
      // none of them is what a person would say out loud about their own week.
      'allocation',
      'unplaced',
      'slice of time',
    ]) {
      expect(markup, `"${word}" is the storage model on the screen`).not.toContain(word)
    }
  })

  /**
   * THE OWNER, ON THIS PAGE: *"design and add accent color to some important part or tags for
   * better visual instruction. The text mount is good now."* — the words were right and nothing on
   * the page was lit. So the hours still free carry the accent, because that figure is the one a
   * person reads this line to find and the one that decides whether they add more work.
   *
   * Three endings, three next acts, and the two that carry a hue carry a word beside it.
   */
  it('lights the hours still free, says “full” when there are none, and keeps over in the alarm ink', () => {
    const gauge = (planned: number, capacity: number): string =>
      onScreen(renderToStaticMarkup(
        h(planning.WeekBuild, {
          reply: planReply({
            horizon: 'week',
            period: '2026-W33',
            capacityHours: capacity,
            entries: [entry('a', planned, { name: 'Wave 5' })],
          }),
          said: planning.periodSaid('2026-W33', TODAY),
          wrote: 0,
          editing: true,
          onWrote: () => {},
        }),
      ))

    const room = gauge(4, 10)
    expect(room, 'the hours still free are not marked at all').toContain('class="px-pl-free"')
    expect(room, 'the figure is carried by colour with no word beside it').toMatch(/px-pl-free">6h<\/strong> left/)

    const exactly = gauge(10, 10)
    expect(exactly, 'a full week was drawn as though it still had room').not.toContain('px-pl-free')
    expect(exactly).toContain('full')

    // A week that is over is a fault and keeps the ink it always had. It is the only urgent thing
    // on the row, which is what the contract allows.
    const over = gauge(14, 10)
    expect(over).toContain('px-pl-overword')
    expect(over).not.toContain('px-pl-free')
  })

  /**
   * THE COLOUR HAS TO SURVIVE BEING READ IN GREY, and this is the half of that a reader can check.
   *
   * ---------------------------------------------------------------------------------------
   * WHY THE CENSUS THAT WAS HERE IS GONE, AND WHERE IT WENT
   * ---------------------------------------------------------------------------------------
   *
   * THIS USED TO KEEP A HAND-WRITTEN LIST OF THE SIX CLASS NAMES THAT SPEND THE ACCENT ON THIS
   * PAGE, read out of `Planning.tsx` with a regular expression and compared as an exact set. That is
   * the same fact worked out in two places — the defect at the head of `CLAUDE.md` — because
   * `src/shared/colourroles.ts` already holds that list, with a written reason beside each entry,
   * and the colour role register's test compared it against the same file. The
   * copy here went red on a rename, said nothing about what got drawn, and had to be edited by hand
   * every time the register was.
   *
   * SO THE CENSUS IS RUN BY THE FILE THAT OWNS IT, and what is left here is the two things this
   * file can say that the register cannot: that the register is still looking at this page at all,
   * and that every hue on it is said in words as well.
   */
  it('leaves the census of what spends the accent to the register, and checks it still looks here', async () => {
    // If somebody drops this file out of the register's scope, the accent census stops covering the
    // planning surfaces and nothing else notices. That is what this line is for.
    const { OWNED_STYLESHEETS } = await import('../src/shared/colourroles.ts')
    expect(
      OWNED_STYLESHEETS,
      'the colour role register no longer reads the planning surfaces, so nothing counts what they spend',
    ).toContain('src/web/components/Planning.tsx')
  })

  it('says every one of its coloured facts in words as well, so grey loses nothing', () => {
    // A rule that spends the accent on something that decides nothing makes the accent mean
    // "important", and then it means nothing. The check a reader can make is the other way round:
    // wherever a hue carries a fact here, a word carries the same fact beside it.
    const week = planReply({
      horizon: 'week',
      period: '2026-W33',
      capacityHours: 10,
      entries: [entry('a', 4, { name: 'Wave 5' })],
    })
    const gauge = onScreen(
      renderToStaticMarkup(
        h(planning.WeekBuild, {
          reply: week,
          said: planning.periodSaid('2026-W33', TODAY),
          wrote: 0,
          editing: true,
          onWrote: () => {},
        }),
      ),
    )
    // The bar's fill is a quantity and the quantity is written out beside it.
    expect(gauge, 'the bar carries the total in colour and nowhere in words').toContain(
      '4 of 10 hours planned this week',
    )
    // The hours still free are the figure the accent is spent on, and the word is beside them.
    expect(gauge).toMatch(/6h<\/strong> left/)

    // The chosen outcome is a control state, and which one is chosen is said to a screen reader as
    // well as painted. `aria-pressed` is the same fact the hue carries.
    const row = renderToStaticMarkup(
      h(planning.PlanRows, {
        entries: [entry('a', 10, { name: 'Wave 5' })],
        unit: 'week',
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(row, 'which outcome is chosen is carried by colour alone').toContain('aria-pressed="true"')
  })
})

/**
 * BUILDING A WEEK, WHICH IS ONE ARRANGEMENT AND WAS TWO.
 *
 * A second arrangement asked three plain questions in a numbered order — how much time, what are
 * you working on, how long will each take — so the owner could compare it against pressing work
 * straight into the week. Round four kept the direct one and it was deleted.
 */
describe('building a week', () => {
  const reply = planReply({
    horizon: 'week',
    period: '2026-W33',
    capacityHours: 10,
    entries: [entry('a', 10, { name: 'Wave 5' }), entry('b', null, { name: 'Wave 6' })],
  })
  const said = { name: 'This week', range: '10 – 16 August 2026', when: 'now' as const, unit: 'week' }
  const draw = (mod: PlanningModule): string =>
    renderToStaticMarkup(h(mod.WeekBuild, { reply, said, wrote: 0, editing: true, onWrote: () => {} }))

  it('presses work into a week with capacity in it, and asks no numbered questions', async () => {
    const markup = draw(await bootPlanning(''))
    expect(markup).toContain('Add work to this week')
    // The deleted arrangement's own words. It was reachable at `?ux=plan-week:guided` until the
    // slot went; if any of it comes back, it comes back here first.
    expect(markup, 'the guided week is being drawn again').not.toContain('How much time do you have this week?')
    expect(markup).not.toContain('What are you working on?')
    expect(markup).not.toContain('How long will each take?')
  })

  it('states the week’s conclusion once, from the reply it was handed', async () => {
    // The surface presents props and computes nothing. A total worked out down here could disagree
    // with the one the parent computed, on the same week, with nothing failing.
    expect(draw(await bootPlanning(''))).toMatch(/10 of 10 hours planned this week/)
  })

  it('cannot be sent to a design that no longer exists by the address', async () => {
    // `?ux=…` was read once at import by a registry that is now deleted. An address naming a design
    // must do nothing at all rather than reach a half of one.
    expect(draw(await bootPlanning('?ux=plan-week:guided'))).toBe(draw(await bootPlanning('')))
  })
})

describe('a month and the weeks inside it', () => {
  const month = () =>
    planReply({
      horizon: 'month',
      period: '2026-08',
      inside: [inside('a', 'week', '2026-W33', 10), inside('b', 'week', '2026-W33', null)],
    })

  it('says both numbers in one line instead of contradicting itself in adjacent panels', () => {
    // MEASURED ON 2026-08-13: #/plan/2026-08 headlined "0h planned at this horizon / Nothing is
    // planned in this period" while the panel directly below listed ten hours placed in the weeks
    // inside it. Both were true. Nothing on the page said so.
    const markup = renderToStaticMarkup(
      h(planning.MonthPlan, {
        reply: month(),
        said: planning.periodSaid('2026-08', TODAY),
        today: TODAY,
        editing: true,
        onWrote: () => {},
      }),
    )
    // THE TWO NUMBERS ARE SEPARATED BY LAYOUT NOW, NOT BY A SENTENCE. Each sits under its own
    // heading with a rule between them, so nobody adds them; `docs/UX-CONTRACT.md` forbids
    // fixing a layout with a sentence. Finding 26 of the language audit, 19 August 2026.
    expect(markup).toContain('On the month itself')
    expect(markup).toContain('On particular weeks inside it')
    expect(markup).not.toContain('not added together')
    expect(markup).not.toContain('Nothing is planned in this period')
  })

  it('says how many of the month’s OWN rows gave no hours', () => {
    // Only the weeks' unstated count was on this line, so putting work on the month with no hours
    // changed nothing on it: the same "5h given to the month itself" before the press and after,
    // with nothing anywhere saying a row had been written. Measured in a browser on 2026-08-14.
    const markup = renderToStaticMarkup(
      h(planning.MonthPlan, {
        reply: planReply({
          horizon: 'month',
          period: '2026-08',
          entries: [
            entry('m', 5, {}, { horizon: 'month', period: '2026-08' }),
            entry('n', null, {}, { horizon: 'month', period: '2026-08' }),
          ],
        }),
        said: planning.periodSaid('2026-08', TODAY),
        today: TODAY,
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('5h')
    expect(markup).toContain('On the month itself')
    expect(markup).toContain('plus 1 with no hours yet')
  })

  it('makes the weeks the month’s own content, each with its hours', () => {
    const markup = renderToStaticMarkup(
      h(planning.MonthPlan, {
        reply: month(),
        said: planning.periodSaid('2026-08', TODAY),
        today: TODAY,
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('10 – 16 August 2026')
    expect(markup).toContain('#/plan/2026-W33')
    expect(markup).toContain('10h')
    // A WEEK WITH NOTHING IN IT IS DRAWN AS AN ABSENCE RATHER THAN AS A ZERO, and quietly. It read
    // "nothing planned", once per empty week, which on a month whose weeks are empty is the same
    // two words five times down one panel. The sentence is on the mark.
    expect(markup, 'an empty week draws no absence at all, or draws it as a zero').toContain(
      '<span class="px-pl-was"><span class="px-absent"',
    )
    // And a week that straddles the month boundary says so rather than being rounded in.
    expect(markup).toContain('runs outside this month')
    // The one you are in, said in the strip, because the whole point of the strip is getting in.
    expect(markup).toContain('you are in this one')
  })
})

/**
 * A TOTAL THAT COUNTS A PIECE OF WORK AND THE PARTS INSIDE IT ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BLOCK ASSERTED UNTIL 16 AUGUST 2026, AND WHY IT SAYS SOMETHING ELSE NOW
 * ---------------------------------------------------------------------------------------
 *
 * Hours on a piece of work and hours on a part of that same work could not both exist in one
 * period: `createAllocation` refused the second write. So a pair reaching a total meant the total
 * was adding one piece of work up twice, and the note beside it said exactly that. Measured on the
 * live corpus: 2026-W33 held 10 hours on "DOUBLE parent" and 8 on "DOUBLE child", which is part of
 * it, and the card read "40h planned of 10h this week" with no note anywhere.
 *
 * Round five replaced that doctrine — design/ROUND-FIVE.md, decision 2 — because the owner plans
 * coarse first and refines later. The hours on the highest allocated piece of work are an ENVELOPE,
 * the hours below it are ASSIGNED, and the tree costs the period the envelope and never the sum. A
 * pair is ordinary planning, so the note is a fact about the plan rather than a warning.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE TESTS BELOW PIN, AND IT IS NOT LESS THAN BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * 1. The tree contributes its envelope: 15h on a piece of work with 5h and 4h inside it is 15.
 * 2. The note says what is assigned to named parts and what is not yet broken down.
 * 3. Both numbers are stated. The plain sum of the rows stands beside the total, because a number
 *    nobody wrote is what the old doctrine existed to prevent and that part did not change.
 * 4. Parts that come to more than the work holding them are a real conflict: SHOWN, never refused,
 *    and the tree then costs the larger number.
 * 5. "Nobody looked" is still told from "somebody looked and found no pair", and a row whose
 *    containment could not be read is still named.
 */
describe('a total that counts a piece of work and the parts inside it once', () => {
  /** Baseline holds the week's envelope; Controller and Perception explain part of it. */
  const insideBaseline = (over: Partial<HoursCountedTwice> = {}): HoursCountedTwice => ({
    horizon: 'week',
    period: '2026-W33',
    pairs: [
      { outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c1', title: 'Controller' } },
      { outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c2', title: 'Perception' } },
    ],
    notChecked: [],
    ...over,
  })

  /** The week decision 2 is written about: 15h on Baseline, 5h and 4h on parts of it. */
  const drawWeek = (
    countedTwice: HoursCountedTwice | null,
    hours: { parent: number; first: number; second: number } = { parent: 15, first: 5, second: 4 },
  ): string =>
    renderToStaticMarkup(
      h(planning.WeekBuild, {
        reply: planReply({
          horizon: 'week',
          period: '2026-W33',
          entries: [
            entry('p', hours.parent, { name: 'Baseline' }),
            entry('c1', hours.first, { name: 'Controller' }),
            entry('c2', hours.second, { name: 'Perception' }),
          ],
          capacityHours: 20,
          countedTwice,
        }),
        said: planning.periodSaid('2026-W33', TODAY),
        wrote: 0,
        editing: false,
        onWrote: () => {},
      }),
    )

  /**
   * Only the note about what is planned inside what.
   *
   * Every title is also on the rows under it, so an assertion about what the NOTE names has to be
   * about the note and not about the page. Empty string is "the note was not drawn at all", which
   * is itself one of the answers below.
   */
  const note = (markup: string): string => {
    const found = /<div class="px-pl-inside"[^>]*>[\s\S]*?<\/div>/.exec(onScreen(markup))
    return found === null ? '' : found[0]
  }

  it('costs the period its envelope, so 15h with 5h and 4h inside it is 15 and never 24', () => {
    const markup = drawWeek(insideBaseline())
    // The gauge's own text alternative, which is where the total is a number rather than a bar.
    expect(markup).toContain('15 of 20 hours planned this week')
    expect(markup).not.toContain('24 of 20 hours planned this week')
  })

  it('says what is assigned to named parts and what is not yet broken down', () => {
    const drawn = note(drawWeek(insideBaseline()))
    expect(drawn).toContain(
      '“Baseline” has 15h here, of which 9h is planned on parts inside it and 6h is not yet broken down.',
    )
    // BOTH ENDS OF EVERY PAIR ARE NAMED, which is what the old note did too: "two of these rows are
    // related" without saying which two is not something a reader can act on.
    expect(drawn).toContain('“Controller” has 5h here.')
    expect(drawn).toContain('“Perception” has 4h here.')
  })

  it('states the plain sum of the rows beside the total, so no number is quietly subtracted', () => {
    // THE HALF OF THE OLD DOCTRINE THAT SURVIVED. The total is now the envelope rather than the sum,
    // so the sum has to be on the screen next to it: a reader who adds the rows up gets 24 and the
    // page has to say why it says 15, in its own words, rather than leave them to work it out.
    expect(note(drawWeek(insideBaseline()))).toContain(sayInEnglish('schedule.rowsAddUp', { rows: 24 }))
  })

  it('shows parts that come to more than the work holding them, and then costs the larger number', () => {
    // 10h on Baseline with 8h and 5h inside it. Both numbers cannot be right, the week costs 13, and
    // design/ROUND-FIVE.md is explicit that this is SHOWN rather than refused — the write goes
    // through and the conflict is on the screen. tests/envelope.test.ts is the server end of it.
    const markup = drawWeek(insideBaseline(), { parent: 10, first: 8, second: 5 })
    const drawn = note(markup)
    expect(drawn).toContain('3h more than the work itself')
    expect(drawn).toContain('This week counts the larger number, 13h')
    expect(drawn).toContain('Both cannot be right')
    expect(markup).toContain('13 of 20 hours planned this week')
    // Drawn as a conflict, and it is the ONLY shape here that is: an ordinary tree is a fact about
    // the plan and must not be dressed as a fault, or the fault stops being read.
    expect(drawn).toContain('data-conflict="yes"')
    expect(note(drawWeek(insideBaseline()))).not.toContain('data-conflict')
  })

  it('says nothing at all when somebody looked and no row is inside another', () => {
    // The ordinary week has to stay quiet, or the note stops being read by the week it matters in.
    // And with nothing inside anything there is no envelope: the total is the plain sum of the rows.
    const markup = onScreen(drawWeek(insideBaseline({ pairs: [] })))
    expect(note(markup)).toBe('')
    expect(markup).not.toContain(sayInEnglish('schedule.rowsAddUp', { rows: 24 }))
    expect(markup).not.toContain('not yet broken down')
    expect(markup).not.toContain(sayInEnglish('schedule.partsNotChecked'))
    expect(markup).toContain('24 of 20 hours planned this week')
  })

  it('tells "nobody looked" from "no pair found", because they are two answers', () => {
    // `countedTwice: null` is no caller having read what contains what. The total beside it is then
    // the plain sum of every row, which IS a piece of work counted twice when the week holds a tree,
    // and the note says so instead of claiming an envelope nobody read.
    expect(drawWeek(null)).toContain(sayInEnglish('schedule.partsNotChecked'))
  })

  it('draws parent not read beside the row when a row’s containment could not be read', () => {
    const drawn = note(
      drawWeek(
        insideBaseline({
          pairs: [],
          notChecked: [{ recordId: 'x', title: 'Tray clamp work', why: 'The chain above it is longer than Mole Office walks.' }],
        }),
      ),
    )
    expect(drawn).toContain(sayInEnglish('schedule.parentsNotRead', { n: 1 }))
    expect(drawn).toContain('Tray clamp work')
    expect(drawn).not.toContain('longer than Mole Office walks')
  })

  it('draws it on a month and on a day too, because every total has the same duty', () => {
    const monthMarkup = renderToStaticMarkup(
      h(planning.MonthPlan, {
        reply: planReply({
          horizon: 'month',
          period: '2026-08',
          entries: [
            entry('p', 15, { name: 'Baseline' }, { horizon: 'month', period: '2026-08' }),
            entry('c1', 5, { name: 'Controller' }, { horizon: 'month', period: '2026-08' }),
          ],
          countedTwice: {
            horizon: 'month',
            period: '2026-08',
            pairs: [{ outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c1', title: 'Controller' } }],
            notChecked: [],
          },
        }),
        said: planning.periodSaid('2026-08', TODAY),
        today: TODAY,
        editing: false,
        onWrote: () => {},
      }),
    )
    expect(note(monthMarkup)).toContain(sayInEnglish('schedule.rowsAddUp', { rows: 20 }))
    expect(note(monthMarkup)).toContain('10h is not yet broken down')

    const dayMarkup = renderToStaticMarkup(
      h(planning.DayPlan, {
        reply: planReply({
          horizon: 'day',
          period: '2026-08-17',
          entries: [
            entry('p', 3, { name: 'Baseline' }, { horizon: 'day', period: '2026-08-17' }),
            entry('c1', 1, { name: 'Controller' }, { horizon: 'day', period: '2026-08-17' }),
          ],
          countedTwice: {
            horizon: 'day',
            period: '2026-08-17',
            pairs: [{ outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c1', title: 'Controller' } }],
            notChecked: [],
          },
        }),
        said: planning.periodSaid('2026-08-17', TODAY),
        today: null,
        wrote: 0,
        editing: false,
        onWrote: () => {},
      }),
    )
    expect(note(dayMarkup)).toContain(sayInEnglish('schedule.rowsAddUp', { rows: 4 }))
    expect(note(dayMarkup)).toContain('2h is not yet broken down')
  })
})

/**
 * WHAT SOMEBODY SAID THE HOURS A PERIOD HOLDS ARE FOR — one label, everywhere it appears.
 *
 * The field that writes this note and the lines that read it back were three separate sentences.
 * A second week-building screen built its own — "You have 10 hours this week for do something." —
 * which is the broken English the reading view had already stopped producing, in the second place
 * the same fact was written out. That screen has since been deleted; the rule outlived it.
 */
describe('the note on the hours a period holds', () => {
  const withNote = (): PlanReply => {
    const reply = planReply({ horizon: 'week', period: '2026-W33', entries: [entry('a', 4, {})], capacityHours: 10 })
    return {
      ...reply,
      capacity: { horizon: 'week', period: '2026-W33', hours: 10, note: 'do something', updatedAt: '2026-08-12 23:41:06' },
    }
  }

  const drawWeek = (mod: PlanningModule, editing: boolean): string =>
    renderToStaticMarkup(
      h(mod.WeekBuild, {
        reply: withNote(),
        said: planning.periodSaid('2026-W33', TODAY),
        wrote: 0,
        editing,
        onWrote: () => {},
      }),
    )

  it('never builds a sentence around the person’s own words', () => {
    for (const markup of [drawWeek(planning, false), drawWeek(planning, true)]) {
      expect(markup).toContain('do something')
      expect(markup, 'the note was put inside a sentence this page wrote').not.toContain('for do something')
    }
  })

  it('asks and answers the same question, in the same words', () => {
    // The field that writes it and the line that reads it back are one declaration, so a person
    // cannot be asked one thing and shown the answer under another.
    expect(drawWeek(planning, false)).toContain(sayInEnglish('schedule.capacityNoteLabel', { unit: sayInEnglish('schedule.week') }))
    expect(drawWeek(planning, true)).toContain(sayInEnglish('schedule.capacityNoteLabel', { unit: sayInEnglish('schedule.week') }))
  })

  it('names the hours it is about, because a week card shows two sets of them', () => {
    // It said "these hours", directly under a line reading "18h planned of 10h this week". The
    // nearer set of hours is the planned one and the note is about the other.
    expect(drawWeek(planning, false)).not.toContain('What these hours are for')
  })
})

describe('a day that is not today', () => {
  const day = () =>
    planReply({ horizon: 'day', period: '2026-08-17' })

  it('offers the week’s work, which is the only write affordance it ever had', () => {
    // THE DEFECT: the only day-level add lived inside "comes round today", which draws nothing
    // unless the day on screen is the server's own day. Every other day said "Nothing is planned in
    // this period" and offered no control that could change it.
    const markup = renderToStaticMarkup(
      h(planning.DayPlan, {
        reply: day(),
        said: planning.periodSaid('2026-08-17', TODAY),
        today: null,
        wrote: 0,
        editing: true,
        onWrote: () => {},
      }),
    )
    // THE HEADING SAYS THE STATE THE ROWS ARE IN. It read "From this week, not yet on a day", which
    // is where the rows came from followed by what has not happened to them; `docs/UX-CONTRACT.md`
    // names this state "Needs a day".
    expect(markup).toContain('Work from this week that needs a day')
    expect(markup).not.toContain('Nothing is planned in this period')
  })

  it('does not call a day that is not today "today"', () => {
    const markup = renderToStaticMarkup(
      h(planning.DayPlan, {
        reply: day(),
        said: planning.periodSaid('2026-08-17', TODAY),
        today: null,
        wrote: 0,
        editing: true,
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('planned on this day')
    expect(markup).not.toContain('planned today')
  })
})

describe('the row that gives work its hours', () => {
  const rows = () =>
    renderToStaticMarkup(
      h(planning.PlanRows, {
        entries: [entry('a', 10, { name: 'Wave 5' }), entry('b', null, { name: 'Wave 6' })],
        unit: 'week',
        editing: true,
        onWrote: () => {},
      }),
    )

  it('heads its columns and puts the unit in the control', () => {
    // The hours box had no visible label, no column heading and no unit — its only naming was an
    // aria-label — and it sat immediately left of a state control, so "give this three hours" read
    // as "open the dropdown".
    const markup = rows()
    expect(markup).toContain('>hours<')
    expect(markup).toContain('px-pl-unit')
  })

  it('names what became of the hours as being about the hours, not about the work', () => {
    // THE ROW HAS TWO COMPLETIONS ON IT NOW AND THEY MEAN DIFFERENT THINGS. Done says the WORK is
    // finished and writes the record's own state. The three outcome presses say what became of the
    // hours THIS PERIOD gave it and write the allocation's, which §34 says completes that slice and
    // nothing else. A row that did not say which was which would be the worst possible version of
    // that rule, so both the visible label and the group's accessible name name the hours.
    const markup = rows()
    expect(markup).toContain('What became of this week’s hours')
    expect(markup).toContain('aria-label="what became of the hours this week gave Wave 5"')
  })

  it('draws an em dash for hours nobody has stated, and never a nought', () => {
    // Empty is a real answer and it is not zero: somebody committed to this work in this period
    // without saying for how long. A 0 in the box would say "no time at all", which is a different
    // fact about a different week.
    const markup = rows()
    expect(markup).toContain('placeholder="—"')
    expect(markup).not.toContain('placeholder="0"')
  })

  it('puts how it went on presses that say which one is chosen, in plain words', () => {
    const markup = rows()
    expect(markup).toContain('aria-pressed="true"')
    // THE STORED WORD IS NOT THE WORD ON SCREEN. `planned` and `dropped` are what an allocation is
    // stored as; "not yet" and "didn't happen" are what those are to a person reading last week.
    expect(markup).toContain('>not yet<')
    expect(markup).toContain('>didn\u2019t happen<')
    expect(markup).not.toContain('>dropped<')
  })

  it('moves removing a row behind its menu, and names what it removes it from', () => {
    const markup = rows()
    expect(markup).toContain('Take off this week')
    expect(markup).toContain('<summary')
  })

  it('says that a finished slice did not finish the work it names, and points at the press that would', () => {
    const done = entry('a', 2, { name: 'Wave 5', title: 'Wave 5', state: 'doing' })
    done.allocation.state = 'done'
    const markup = renderToStaticMarkup(
      h(planning.PlanRows, { entries: [done], unit: 'week', editing: true, onWrote: () => {} }),
    )
    expect(markup).toContain('The hours this week gave this are finished')
    // IT USED TO END "Open the record to say the work itself is done", because that was the only
    // way to do it. The row now carries the press, so the sentence names the press.
    expect(markup).toContain('press Done to say')
    expect(markup).not.toContain('Open the record to say')
  })
})

/**
 * One piece of work as `GET /api/work` sends it. Only the fields these surfaces read are set, and
 * every one of them is a real field of `WorkRow` — a test fixture that invented a field would pass
 * while the product read something else.
 */
function workRow(id: string, over: Partial<WorkRow> = {}): WorkRow {
  return {
    id,
    kind: 'task',
    title: `task ${id}`,
    name: `task ${id}`,
    within: null,
    summary: null,
    state: 'todo',
    workspaceId: 'panelx',
    above: [],
    aboveStopped: null,
    parentsInOtherProjects: [],
    estimateHours: null,
    hoursGiven: [],
    origin: null,
    incompleteCount: 0,
    due: null,
    ...over,
  }
}

/** A step in the chain above a piece of work. */
function step(id: string, title: string): WorkRow['above'][number] {
  return { id, title, kind: 'pipeline', workspaceId: 'panelx', via: 'pipeline order', position: 1, deleted: false }
}

describe('choosing the level of work a period is offered', () => {
  const corpus = [
    workRow('a'),
    workRow('b', { workspaceId: 'robotics' }),
    workRow('c', { kind: 'block', name: 'Wave 5', above: [step('p1', 'The campaign')] }),
    workRow('d', { kind: 'block', name: 'a gripper step', above: [step('p1', 'The campaign'), step('c', 'Wave 5')] }),
  ]

  it('offers every level the work actually sits at, and no level it does not', () => {
    // THE CONTROL COMES FROM THE ROWS. A level nobody has is a level the control must not offer,
    // because an option that always returns nothing is a claim that there is nothing there.
    const levels = planning.levelsOf(corpus)
    expect(levels.map((l) => l.key)).toEqual(['any', '0', '1', '2'])
    expect(levels.map((l) => l.count)).toEqual([4, 2, 1, 1])
    // Plain words, never the stored shape of the answer.
    expect(levels.map((l) => l.label)).toEqual(['Every level', 'Part of nothing', 'One level in', '2 levels in'])
  })

  it('offers a block’s parts, which is the thing a week could not do before', () => {
    // The owner: the week "mostly offers whole pipeline blocks, which is too coarse". A part of a
    // block is two levels in, and there was no query in the product that returned one.
    const parts = planning.offered(corpus, { project: 'any', level: '2', words: '' })
    expect(parts.map((r) => r.id)).toEqual(['d'])
  })

  it('offers work from every project, and can be narrowed to one', () => {
    expect(planning.projectsOf(corpus).map((p) => p.key)).toEqual(['any', 'panelx', 'robotics'])
    expect(
      planning.offered(corpus, { project: 'robotics', level: 'any', words: '' }).map((r) => r.id),
    ).toEqual(['b'])
  })

  it('narrows by every word, so a second word narrows rather than widens', () => {
    const one = planning.offered(corpus, { project: 'any', level: 'any', words: 'gripper' })
    expect(one.map((r) => r.id)).toEqual(['d'])
    const both = planning.offered(corpus, { project: 'any', level: 'any', words: 'gripper campaign' })
    // "campaign" is the chain above it, which is part of what a person sees on the row.
    expect(both.map((r) => r.id)).toEqual(['d'])
    expect(planning.offered(corpus, { project: 'any', level: 'any', words: 'gripper wave 9' })).toEqual([])
  })

  it('never draws a press the server would refuse', () => {
    // MEASURED before this list existed: a session, a message and a proposal all rendered "add to
    // 2026-W33", and the server allows only task, block, obligation, direction and problem. The way
    // to find that out was to press one. The list comes from the plan's own reply, out of the
    // declaration the write path enforces. `purchase` is work a person reads on the Work page and
    // is not something a plan can give hours to, and there are five of them in the live corpus.
    const markup = renderToStaticMarkup(
      h(planning.WorkOffer, {
        row: workRow('p', { kind: 'purchase', name: 'a gripper' }),
        horizon: 'week' as const,
        period: '2026-W33',
        hours: { said: 'nothing' as const },
        planned: [],
        allocatable: ALLOCATABLE_KINDS,
        label: 'add to this week',
        onWrote: () => {},
      }),
    )
    expect(markup).not.toContain('add to this week')
    expect(markup).toContain(sayInEnglish('schedule.cannotBePlanned'))
  })

  it('still offers the press when the plan has not been read, rather than guessing a refusal', () => {
    // Absence beats a guess in both directions. Not knowing which kinds a plan holds is not the
    // same as knowing this one is refused, and the server's own refusal is printed on the row.
    const markup = renderToStaticMarkup(
      h(planning.WorkOffer, {
        row: workRow('p', { kind: 'purchase' }),
        horizon: 'week' as const,
        period: '2026-W33',
        hours: { said: 'nothing' as const },
        planned: [],
        allocatable: null,
        label: 'add to this week',
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('add to this week')
  })

  it('says what each offered piece of work sits inside, and when that chain is not whole', () => {
    const markup = renderToStaticMarkup(
      h(planning.WorkOffer, {
        row: workRow('d', {
          kind: 'block',
          name: 'a gripper step',
          above: [step('p1', 'The campaign'), step('c', 'Wave 5')],
          aboveStopped: 'two records claim this as a part',
          parentsInOtherProjects: ['robotics'],
        }),
        horizon: 'week' as const,
        period: '2026-W33',
        hours: { said: 'nothing' as const },
        planned: [],
        allocatable: ALLOCATABLE_KINDS,
        label: 'add to this week',
        onWrote: () => {},
      }),
    )
    expect(markup).toContain('in The campaign › Wave 5')
    // 7FEOshq3mBGG: normal mode names the missing reading without its raw field or project id.
    expect(markup).toContain(sayInEnglish('schedule.parentNotRead'))
    expect(markup).not.toContain('two records claim this as a part')
    expect(markup).not.toContain('part of work in robotics')
    expect(markup).toContain('part of work in Project name unavailable')
  })
})

/**
 * A REFUSAL IS PRINTED WHOLE, AND THE BROWSER READS NOTHING OUT OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS BLOCK ASSERTED UNTIL 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * `waysOutOf` took an allocation id out of the clause `take the hours off "<work>" (allocation
 * <id>)` and the row drew a press that deleted that row. The refusal holding that clause was the one
 * that stopped a piece of work and its parts both having hours in one period, and round five removed
 * it: planning coarse first and refining later is how the owner plans. No refusal in the product
 * writes that clause any more, so both the reader and the press are deleted rather than left in
 * place — machinery kept alive against a sentence nobody writes reads like a working feature.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED INSTEAD, AND IT IS THE STRICTER RULE
 * ---------------------------------------------------------------------------------------
 *
 * The browser prints the server's sentence word for word and invents no control from any part of it,
 * INCLUDING FROM A SENTENCE IN THE OLD SHAPE. That last one is what would fail if the reader came
 * back, and it is why the old sentence is still a fixture in this file.
 *
 * THE REFUSAL THAT REMAINS IS NOT SOFTENED. Two rows for one record in one period are still refused,
 * because they cannot say whether they add up or correct each other. tests/envelope.test.ts provokes
 * that 409 from a real server, and tests/refusal-way-out.test.ts proves the sentence below is still
 * what `createAllocation` produces; here it is what the browser does with it.
 */
describe('a refusal is printed whole, and the browser reads nothing out of it', () => {
  /** The refusal a person still meets, word for word, from src/server/lib/planning.ts. */
  const ALREADY =
    '"Complete experiment" already has an allocation in 2026-W36 (rQCRokHecqPg, 2h). A second one would be ' +
    'two rows that cannot say whether they add up or correct each other. Change the row it already has ' +
    'instead. Open 2026-W36 under Schedule, press "Plan this week" at the top right, and set the hours on its row.'

  /** The refusal round five deleted, kept as the shape a reader would match if one came back. */
  const GONE =
    '"a gripper step" is part of "Wave 5" (c), which already has 3h (allocation a-c) in 2026-W33. In one ' +
    'period, hours go to a piece of work or to its parts, never to both, or 2026-W33 counts the same hours ' +
    'twice. If you meant to plan the parts, take the hours off the larger piece of work first. Open 2026-W33 ' +
    'under Schedule, press Edit, and take the hours off "Wave 5" (allocation a-c). If you meant its hours to ' +
    'cover this, they already do, and there is nothing to add here.'

  /** What a person reads out of the drawn refusal, with the tags off and the entities back. */
  const words = (markup: string): string =>
    markup
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')

  const drawn = (message: string): string =>
    renderToStaticMarkup(h(planning.Refusal, { message })).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  it('prints every word the server said, including the row it names and the way out', () => {
    // A shortened refusal drops the row's id, the hours already on it, or the sentence at the end
    // saying what to do — and a refusal a person cannot act on is a wall.
    expect(words(drawn(ALREADY))).toContain(ALREADY)
  })

  it('draws no press under a refusal, because none of them asks for a row to be deleted', () => {
    // Deleting the row this sentence names would throw away its note and the hours actually spent
    // on it, which is the one thing the sentence did not ask for.
    expect(drawn(ALREADY)).not.toContain('<button')
  })

  it('invents nothing even from the sentence that used to yield a press', () => {
    // THE GUARD AGAINST THE DELETED READER COMING BACK. The old clause names an allocation, and a
    // browser that read it would draw a press that takes the hours off a piece of work whose parts
    // are being planned — which round five made ordinary, so the press would destroy a plan somebody
    // meant. The sentence is printed and nothing else happens to it.
    const markup = drawn(GONE)
    expect(words(markup)).toContain(GONE)
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('a-c<')
  })

  it('draws nothing about a refusal until there has been one', () => {
    // The stylesheet is rendered inside the markup, so it is taken off before anything is asserted
    // NOT to be there: every class name in the file is in the markup either way.
    const markup = renderToStaticMarkup(
      h(planning.WorkOffer, {
        row: workRow('d', { name: 'a gripper step' }),
        horizon: 'week' as const,
        period: '2026-W33',
        hours: { said: 'nothing' as const },
        planned: [],
        allocatable: ALLOCATABLE_KINDS,
        label: 'add to this week',
        onWrote: () => {},
      }),
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    // Rendered without a server, so the refusal cannot have happened yet.
    expect(markup).not.toContain('px-pl-refusal')
    expect(markup).toContain('add to this week')
  })
})

describe('today is where the work gets done, not a second place to plan it', () => {
  const todayReply = (over: Partial<TodayReply> = {}): TodayReply =>
    ({
      day: '2026-08-13',
      week: '2026-W33',
      month: '2026-08',
      allocations: [],
      recurring: [],
      ...over,
    }) as TodayReply

  const draw = (reply: PlanReply, today: TodayReply) =>
    renderToStaticMarkup(
      h(planning.TodayPlan, {
        reply,
        said: planning.periodSaid('2026-08-13', TODAY),
        today,
        planHere: '/plan/today/edit',
        onWrote: () => {},
      }),
    )

  it('has no control that plans: no capacity field, no placing, no adding', () => {
    // THE DEFECT: `#/plan/today` was the day surface at another address, so it could set the day's
    // capacity, place the week's work and add work — every planning control the dated day has. Two
    // surfaces that both plan is how a person ends up with two ideas of what a day holds.
    const markup = draw(
      planReply({ horizon: 'day', period: '2026-08-13', entries: [entry('a', 2, { name: 'Wave 5' })] }),
      todayReply(),
    )
    expect(markup).not.toContain('Day capacity')
    expect(markup).not.toContain('Set day capacity')
    expect(markup).not.toContain('Work from this week that needs a day')
    expect(markup).not.toContain('Add work to this day')
    expect(markup).not.toContain('Hours each')
  })

  it('keeps what belongs to doing: what is on today, marking it done, and what was spent', () => {
    const markup = draw(
      planReply({ horizon: 'day', period: '2026-08-13', entries: [entry('a', 2, { name: 'Wave 5' })] }),
      todayReply(),
    )
    expect(markup).toContain('Wave 5')
    // Marking a slice done is one press and it is allowed here, because recording what happened is
    // not planning.
    expect(markup).toContain('>done<')
    expect(markup).toContain('say what you spent')
  })

  it('opens with no box on it, and turns one on for the row you press', () => {
    // READING IS THE RESTING STATE EVERYWHERE, and Today is where that is easiest to lose: it is
    // the page a person lives on. tests/read-before-edit.test.ts walks the real page and fails when
    // a box is drawn on arrival; this holds the same line here, where it is cheap to run.
    const markup = draw(
      planReply({ horizon: 'day', period: '2026-08-13', entries: [entry('a', 2, { name: 'Wave 5' })] }),
      todayReply(),
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('<select')
  })

  it('offers the way to plan today once, not twice, when there is nothing on it', () => {
    // The empty state is already the offer. The same two words again three lines under it is the
    // repeated text the owner counted on other pages.
    const markup = draw(planReply({ horizon: 'day', period: '2026-08-13' }), todayReply())
    expect(markup.match(/Plan today/g) ?? []).toHaveLength(1)
  })

  it('leads to the two surfaces that do plan, rather than explaining that it does not', () => {
    const markup = draw(
      planReply({ horizon: 'day', period: '2026-08-13', entries: [entry('a', 2, { name: 'Wave 5' })] }),
      todayReply(),
    )
    expect(markup).toContain('Plan today')
    expect(markup).toContain('Plan this week')
    // The address the page handed down, and not one built here: on `#/plan/today` that spelling is
    // what keeps a person on the day they are having rather than on a date that stops being today.
    expect(markup).toContain('#/plan/today/edit')
    expect(markup).toContain('#/plan/2026-W33/edit')
  })

  it('offers what comes round as one press, at the recurrence’s own hours', () => {
    const markup = draw(
      planReply({ horizon: 'day', period: '2026-08-13' }),
      todayReply({
        recurring: [
          {
            recurrence: {
              id: 'rec1',
              recordId: 'r1',
              every: 'weekdays',
              days: null,
              hoursEach: 0.25,
            },
            work: entry('r1', null, { name: 'standup' }).work,
          } as TodayReply['recurring'][number],
        ],
      }),
    )
    expect(markup).toContain('Comes round today')
    expect(markup).toContain('put on today')
    // No hours box: the number is the recurrence's own, or nobody said. A box here would be a
    // planning control on the surface that is not for planning.
    expect(markup).not.toContain('Hours each')
  })
})


// ============================================================================ how absence is drawn

/**
 * HOW LOUDLY THIS PAGE SAYS SOMETHING IS NOT THERE.
 *
 * `design/ROUND-FOUR.md` sorts absences by one test — does the reader have to DO something about
 * this absence — and the owner named this page's capacity sentence as one that pays too much. The
 * rule that matters here is the one it would be easy to break while quietening: an empty day and a
 * day whose WEEK is empty are two different facts, and drawing them the same way sends a person to
 * plan a day with nothing to draw from.
 */
describe('an absence is drawn at the weight the reader needs, and never flattened', () => {
  const planningSource = readFileSync(new URL('../src/web/components/Planning.tsx', import.meta.url), 'utf8')

  it('draws an empty week as a mark and the press that fills it, not as a sentence', () => {
    const markup = onScreen(
      renderToStaticMarkup(
        h(planning.WeekBuild, {
          reply: planReply({ horizon: 'week', period: '2026-W34' }),
          said: planning.periodSaid('2026-W34', TODAY),
          wrote: 0,
          editing: false,
          onWrote: () => {},
        }),
      ),
    )
    // The quiet drawing: a dimmed dash carrying the sentence, and the way out beside it.
    //
    // THE SENTENCE SAYS HOURS, because hours are what this panel counts. It said "Nothing is on
    // next week yet" until 18 August 2026, on a week that could be carrying a block on the board
    // above it — see `noHoursOn` in Planning.tsx for the screen that was measured.
    expect(markup, 'an empty week is not drawn as an absence at all').toContain(
      '<span class="px-absent" title="No hours are on next week yet.">',
    )
    expect(markup, 'the press that fills the week is gone, which makes the mark a dead end').toContain(
      'Add work to this week',
    )
    // And it does NOT take the tier that keeps a sentence: an empty week is ordinary.
    expect(markup, 'an empty week is drawn at the weight reserved for an absence a reader must act on').not.toContain(
      'data-tier="must-act-on"',
    )
  })

  it('says nobody has said how many hours a period holds as a mark that is not a blank', () => {
    const markup = onScreen(
      renderToStaticMarkup(
        h(planning.DayPlan, {
          reply: planReply({ horizon: 'day', period: '2026-08-17' }),
          said: planning.periodSaid('2026-08-17', TODAY),
          today: null,
          wrote: 0,
          editing: false,
          onWrote: () => {},
        }),
      ),
    )
    // NOT A BLANK AND NOT A ZERO. The label names the fact, the mark says nobody has said, and the
    // dashed edge is what tells "nobody has said" from "there are none" — see Absence in ui.tsx.
    expect(markup).toContain('Hours this day')
    expect(markup).toContain('not set')
    expect(markup, 'the dashed edge that means nobody can say is gone').toContain('data-edge="dashed"')
    expect(markup, 'the sentence did not survive the quietening, so nothing says what is missing').toContain(
      'Hours this day: not set.',
    )
  })

  // 7FEOshq3mBGG, b-6: an empty week keeps its explanation on the mark and its link beside it.
  it('draws an empty source week as a mark with a way to that week', () => {
    const emptyWeek = planningSource.slice(planningSource.indexOf('if (week.value.entries.length === 0)'),
      planningSource.indexOf('if (rows.length === 0)', planningSource.indexOf('if (week.value.entries.length === 0)')))
    expect(emptyWeek).toContain('<NothingOn')
    expect(emptyWeek).not.toContain('tier="must-act-on"')
    expect(emptyWeek).toContain('planPeriodPath(weekKey)')
  })

  /**
   * “NOBODY HAS SAID HOW MANY HOURS” IS WRITTEN IN ONE PLACE AND EVERY SURFACE READS IT FROM THERE.
   *
   * The field that ASKS the question and the mark that REPORTS the absence are two different places
   * on two different surfaces, and both print this. Typed out in each, one could be changed and the
   * other left — the defect at the head of CLAUDE.md.
   */
  it('writes “nobody has said how many hours” in one place, so the surfaces cannot drift', () => {
    expect(planning.hoursNotSaid('today')).toBe('Hours today: not set.')
    expect(planning.hoursNotSaid('this week')).toBe('Hours this week: not set.')

    // THE TWO SURFACES, DRAWN, EACH PRINTING WHAT THAT ONE WRITER SAYS. A surface that built the
    // sentence itself would have to match this character for character to pass.
    const week = onScreen(
      renderToStaticMarkup(
        h(planning.WeekBuild, {
          reply: planReply({ horizon: 'week', period: '2026-W33', entries: [entry('a', 4, {})] }),
          said: planning.periodSaid('2026-W33', TODAY),
          wrote: 0,
          editing: true,
          onWrote: () => {},
        }),
      ),
    )
    expect(week, 'the question is asked in words this page wrote for itself').toContain(
      planning.hoursNotSaid('this week'),
    )

    const day = onScreen(
      renderToStaticMarkup(
        h(planning.DayPlan, {
          reply: planReply({ horizon: 'day', period: '2026-08-17' }),
          said: planning.periodSaid('2026-08-17', TODAY),
          today: null,
          wrote: 0,
          editing: false,
          onWrote: () => {},
        }),
      ),
    )
    expect(day, 'the mark reports the absence in words of its own').toContain(planning.hoursNotSaid('this day'))

    // 7FEOshq3mBGG moves the sentence into the source list, beside its Chinese translation.
    // Every file of the English list, en.ts and every wave's part (wave 13j, round 41).
    const english = theWordListText('en')
    const typed = english.match(/Hours \{period\}: not set/g) ?? []
    expect(typed.length).toBe(1)
    expect(planningSource).toContain("t('schedule.capacityUnknown'")
  })
})
