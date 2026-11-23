// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND SIX: THE PLANNING SURFACES SAYING THINGS THAT ARE NOT TRUE.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THESE CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * The owner used Mole Office on 16 August 2026 and three first-time users drove the planning
 * loop the same day. Every defect below is one of them reading two sentences on one screen that
 * denied each other, or one number counting something its own words did not describe. None of them
 * is a missing capability. All of them are the product asserting something false.
 *
 *   1  A week's own total read "12h planned this week" and, eleven lines below, a kept line about
 *      the same work read "Nothing has been scheduled from it yet". Both were true — the WORDS were
 *      never scheduled while an allocation existed — and as printed they were two opposite
 *      statements about one item.
 *   2  A row went on printing "Mole Office read this as … 3 hours" after the press that turned it into
 *      hours, until the list came back from the server. A reading of something still to happen,
 *      drawn after it happened.
 *   3  A week holding a 3h allocation on a day inside it drew "0h planned this week" and "Nothing is
 *      on this week yet", with "3h is already on the days inside this week" between them.
 *   4  A plan card read "3 lines with no time on any week" after three of five rows were scheduled.
 *      The count included a heading and a blank line, neither of which can ever hold hours.
 *   5  The Review pane drew a 27-word paragraph about advice nobody had left, on a pane whose only
 *      other content is the press that asks for some. Home was cleaned of exactly this pattern and
 *      this was missed.
 *   6  A plan row printed a record id at a reader who can do nothing with one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE TESTED THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out adding a DOM, so this is the
 * same two shapes as tests/planning-week-truth.test.ts: a pure function called directly, and a
 * component rendered to static markup. Every one of these six is about what is IN the markup when
 * the reply says a particular thing, so that is exactly enough.
 *
 * THE ARITHMETIC IS NOT WRITTEN OUT HERE. Every week fixture is built by `loadOf`, `fitOf` and
 * `spreadOf` over allocations, exactly as src/server/api/planning.ts builds one, so the surfaces are
 * checked against the product's own arithmetic and not against a number this file decided.
 *
 * AND EACH CHECK STATES THE CONTRADICTION AS WELL AS THE FIX. It is not enough to assert the new
 * sentence: what failed was two sentences standing together, so the test asserts that the second one
 * is not there beside the first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import {
  fitOf,
  loadOf,
  parsePeriod,
  spreadOf,
  type Allocation,
  type Grain,
  type Load,
} from '../src/shared/planning.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import type {
  AllocationWithWork,
  PlanningIntent,
  PlanningIntentWithPeriodReading,
} from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import type { PlanSummary } from '../src/server/lib/plans.ts'

type PlanningModule = typeof import('../src/web/components/Planning.tsx')
type PlansModule = typeof import('../src/web/pages/plans/PlansPage.tsx')
type ReviewModule = typeof import('../src/web/components/plans/PlanReview.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let planning: PlanningModule
let plans: PlansModule
let review: ReviewModule
let mode: ModeModule

beforeAll(async () => {
  // The smallest window stand-in these modules need, installed before they are imported. src/web/
  // api.ts and src/web/lib/mode.ts both read storage at module scope. Nothing here is under test;
  // same stub as tests/planning-week-truth.test.ts.
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
  planning = await import('../src/web/components/Planning.tsx')
  plans = await import('../src/web/pages/plans/PlansPage.tsx')
  review = await import('../src/web/components/plans/PlanReview.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

/** The week every fixture here is about: Monday 24 to Sunday 30 August 2026. */
const WEEK = '2026-W35'
/** A day inside it, which is where the hours go that the week's own line does not count. */
const DAY_IN_WEEK = '2026-08-25'
/** The server's day, week and month, as the page reads them. */
const TODAY = { day: '2026-08-17', week: '2026-W34', month: '2026-08' }

/** Strip the tags so a sentence can be looked for the way a person reads it. */
function text(markup: string): string {
  return markup
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One allocation, at whichever horizon and period it is put on. */
function allocation(
  recordId: string,
  plannedHours: number | null,
  at: { horizon: Grain; period: string } = { horizon: 'week', period: WEEK },
): Allocation {
  return {
    id: `a-${recordId}-${at.period}`,
    horizon: at.horizon,
    period: at.period,
    recordId,
    plannedHours,
    actualHours: null,
    state: 'planned',
    note: null,
    createdAt: '2026-08-17 09:00:00',
    updatedAt: '2026-08-17 09:00:00',
  }
}

/** An allocation with the work it names, or with no work at all where the record is gone. */
function withWork(one: Allocation, name: string | null = `task ${one.recordId}`): AllocationWithWork {
  if (name === null) return { allocation: one, work: null }
  return {
    allocation: one,
    work: {
      id: one.recordId,
      kind: 'task',
      title: name,
      name,
      within: null,
      workspaceId: 'panelx',
      state: 'todo',
      effortHours: null,
      origin: 'authored',
      deleted: false,
    },
  }
}

/**
 * A week reply, built the way src/server/api/planning.ts builds one.
 *
 * `inDays` is what goes on days INSIDE the week, which is the shape defect 3 is about: those hours
 * are real and are never part of the week's own total.
 */
function weekReply(opts: {
  entries?: AllocationWithWork[]
  inDays?: Allocation[]
  capacityHours?: number | null
}): PlanReply {
  const parsed = parsePeriod(WEEK)
  if (parsed === null) throw new Error('2026-W35 is not a period, which cannot happen')
  const entries = opts.entries ?? []
  const inDays = opts.inDays ?? []
  const capacityHours = opts.capacityHours === undefined ? null : opts.capacityHours
  const mine = entries.map((e) => e.allocation)
  const covering = [...mine, ...inDays]
  const counted = { horizon: 'week' as const, period: WEEK, pairs: [], notChecked: [] }
  const load = loadOf('week', WEEK, mine, counted)
  const finer: Load[] = [...new Set(inDays.map((a) => a.period))]
    .sort()
    .map((key) => loadOf('day', key, covering, { horizon: 'day', period: key, pairs: [], notChecked: [] }))
  return {
    horizon: 'week',
    period: WEEK,
    from: parsed.from,
    to: parsed.to,
    entries,
    capacity:
      capacityHours === null
        ? null
        : { horizon: 'week', period: WEEK, hours: capacityHours, note: null, updatedAt: '2026-08-17 09:00:00' },
    fit: fitOf(load, capacityHours),
    spread: spreadOf(parsed, 'day', covering),
    finer,
    allocatableKinds: ALLOCATABLE_KINDS,
    alsoNamed: [],
    shares: [],
    note: 'not read by any surface under test',
  }
}

const said = { name: 'Next week', range: '24 – 30 August', when: 'ahead' as const, unit: 'week' }

/** The week surface as a fresh visit draws it: reading, not editing. */
function drawWeek(reply: PlanReply): string {
  return renderToStaticMarkup(
    h(planning.WeekBuild, { reply, said, wrote: 0, editing: false, onWrote: () => {} }),
  )
}

/** One row of words somebody wrote about time. Only the fields these surfaces read are set. */
function intent(over: Partial<PlanningIntentWithPeriodReading> = {}): PlanningIntentWithPeriodReading {
  const { periodReading, ...fields } = over
  const row: PlanningIntent = {
    id: 'i-one',
    said: '12h this week',
    state: 'offered',
    period: WEEK,
    horizon: 'week',
    hours: 12,
    reading: 'the server’s own sentence about these words',
    recordId: 'rec-one',
    planLineId: null,
    canScheduled: true,
    createdAt: '2026-08-17 09:00:00',
    createdBy: 'robin',
    ...fields,
  } as PlanningIntent
  return {
    ...row,
    periodReading: periodReading ?? { period: '2026-W34', namesStoredPeriod: false },
  }
}

/** The list of kept words, drawn on its own. */
function keptList(
  intents: PlanningIntentWithPeriodReading[],
  opts: { editing?: boolean; committed?: number } = {},
): string {
  const committed = opts.committed ?? 0
  return renderToStaticMarkup(
    h(planning.WordsKept, {
      reply: {
        intents,
        counts: {
          all: intents.length + committed,
          kept: intents.filter((i) => i.state === 'kept').length,
          offered: intents.filter((i) => i.state === 'offered').length,
          committed,
        },
        note: 'the server’s own sentence about these intents',
      },
      today: TODAY,
      editing: opts.editing ?? false,
      onCommitted: () => {},
    }),
  )
}

// ============================================================================ 1

describe('1 — words nobody scheduled, on a week that has hours', () => {
  /**
   * The screen: 12 hours really are on the week, and the words written about that work are
   * still sitting in the kept list. Both facts are true at once and this is the pair that has to
   * read as two facts rather than as a contradiction.
   */
  const weekWithHours = () => weekReply({ entries: [withWork(allocation('rec-one', 12), 'the controller')] })

  it('the week really does hold the hours, which is what makes the pair worth drawing', () => {
    // Stated first so nothing below can pass by the fixture quietly becoming an empty week.
    expect(weekWithHours().fit.load.plannedHours).toBe(12)
    expect(text(drawWeek(weekWithHours()))).toContain('12h planned this week')
  })

  it('does not print a denial of that total on every kept row', () => {
    const read = text(keptList([intent()]))
    expect(read).not.toContain('Nothing has been scheduled from it yet')
    expect(read).not.toContain('Nothing has been scheduled from these words')
  })

  it('marks the words once as not on the plan and in no total', () => {
    const read = text(keptList([intent()]))
    expect(read.split(sayInEnglish('schedule.keptNotOnPlan')).length - 1).toBe(1)
  })

  it('shows the kept period as given when the words name another period', () => {
    // The eighth rule: the interpretation is drawn beside the words and never instead of them.
    // Quietening the scheduling sentence must not have taken either of those with it.
    const read = text(keptList([intent({ said: 'about 12h this week' })]))
    expect(read).toContain('about 12h this week')
    expect(read).toContain('This is for 24 – 30 August 2026. Your words do not name this period.')
    expect(read).toContain('Your words name 17 – 23 August 2026.')
    expect(read).not.toContain('Mole Office read this as')
  })

  it('says Mole Office read no period, rather than what was not scheduled, when it read none', () => {
    const read = text(keptList([intent({
      said: 'sometime soon',
      state: 'kept',
      period: null,
      horizon: null,
      hours: null,
      periodReading: { period: null, namesStoredPeriod: false },
    })]))
    expect(read).toContain('Mole Office read no day, week or month from these words.')
    expect(read).toContain('sometime soon')
  })
})

// ============================================================================ 2 — see the browser

/**
 * DEFECT 2 IS NOT HERE, AND THAT IS DELIBERATE.
 *
 * A row goes on saying what Mole Office WOULD do with words until the press that does it has answered.
 * That state only exists after a real press against a real server, so proving it needs a browser
 * and it is in tests/kept-words-after-the-press.test.ts. What this file can honestly say about it
 * is the half below: before any press, the reading is what the row draws.
 */
describe('2 — the row before the press, which is the state the browser test starts from', () => {
  it('draws the given period when the words named a different one before the press', () => {
    const read = text(keptList([intent()], { editing: true }))
    expect(read).toContain('This is for 24 – 30 August 2026. Your words do not name this period.')
    expect(read).not.toContain('Mole Office read this as')
    expect(read).not.toContain('These words are hours on the plan now.')
    expect(read).toContain('Give it that time')
  })

  it('uses the singular unit when the row holds one hour', () => {
    const read = text(keptList([intent({ hours: 1 })]))
    expect(read).toContain('The row holds 1 hour.')
  })
})

// ============================================================================ 3

describe('3 — a week whose days hold hours is not an empty week', () => {
  /** Nothing on the week itself; 3 hours on the Tuesday inside it. The tester's screen. */
  const threeOnADay = () =>
    weekReply({ inDays: [allocation('rec-one', 3, { horizon: 'day', period: DAY_IN_WEEK })] })

  it('the week really does hold nothing of its own and the day really does hold 3h', () => {
    const reply = threeOnADay()
    expect(reply.fit.load.plannedHours).toBe(0)
    expect(reply.entries).toHaveLength(0)
    expect(reply.finer?.map((l) => l.plannedHours)).toEqual([3])
  })

  it('does not say the week is empty when the days inside it are not', () => {
    expect(text(drawWeek(threeOnADay()))).not.toContain('No hours are on next week yet')
  })

  it('says what is empty — the week itself — and still offers the press that fills it', () => {
    const read = text(drawWeek(threeOnADay()))
    expect(read).toContain('Nothing has been given time by next week itself.')
    expect(read).toContain('Add work to this week')
  })

  it('says what the total counts, so 0h does not read as a denial of the 3h below it', () => {
    const read = text(drawWeek(threeOnADay()))
    expect(read).toContain('0h planned on the week itself')
    expect(read).not.toContain('0h planned this week')
    // And the line that carries the other number is still there and still says they are separate.
    // THE TWO NUMBERS ARE SEPARATED BY LAYOUT NOW, NOT BY A SENTENCE. Each sits under its own
    // heading with a rule between them, so nobody adds them; `docs/UX-CONTRACT.md` forbids
    // fixing a layout with a sentence. Finding 26 of the language audit, 19 August 2026.
    expect(read).toContain('On particular days inside this week')
    expect(read).toContain('3h')
    expect(read).not.toContain('not added together')
  })

  it('says the same thing on a week that has a capacity, where the total is drawn as a bar', () => {
    const read = text(drawWeek(weekReply({
      inDays: [allocation('rec-one', 3, { horizon: 'day', period: DAY_IN_WEEK })],
      capacityHours: 20,
    })))
    expect(read).toContain('0h planned of 20h on the week itself')
    expect(read).not.toContain('0h planned of 20h this week')
  })

  it('leaves an ordinary week alone: nothing inside it, so the words do not change', () => {
    // The control for the two above. A week with nothing finer says "this week" and calls itself
    // empty, because on that week both of those are true.
    //
    // THE EMPTY SENTENCE SAYS HOURS. It read "Nothing is on next week yet" until 18 August 2026,
    // which is false on a week with a block placed across it — see part 7 below.
    const read = text(drawWeek(weekReply({ capacityHours: 20 })))
    expect(read).toContain('0h planned of 20h this week')
    expect(read).toContain('No hours are on next week yet')
    expect(read).not.toContain('on the week itself')
  })
})

// ============================================================================ 4

describe('4 — what a plan card counts', () => {
  /**
   * The owner's plan: five rows filed as work of which three have hours, written in a document that
   * also holds a heading and a blank line. Eleven lines, five of them filed.
   *
   * `withNoTimeOnAnyPeriod` is the server's own count of every line no allocation names, which is
   * the six unfiled lines plus the two filed ones with no hours.
   */
  function summary(over: Partial<PlanSummary> = {}): PlanSummary {
    return {
      plan: {
        id: 'Rm4Cw7Bk3Ne8',
        title: 'Getting the arm to hand something over',
        state: 'open',
        readAt: null,
        readByAgent: null,
        readUnderGrant: null,
        createdAt: '2026-08-01 09:00:00',
        updatedAt: '2026-08-17 09:00:00',
        createdBy: THE_TEST_OFFICES_OWNER.id,
        movedFromDraft: null,
      },
      version: 'aa11bb22cc33dd44',
      lines: 11,
      filedAsWork: 5,
      withNoTimeOnAnyPeriod: 8,
      firstLines: ['# Getting the arm to hand something over', ''],
      ...over,
    }
  }

  it('reads the number of scheduled lines out of the two counts the server already sends', () => {
    // Not a second arithmetic. `lines - withNoTimeOnAnyPeriod` is the complement of that count over
    // the same lines, so it is exactly the lines an allocation names.
    expect(plans.scheduledLines(summary())).toBe(3)
    expect(plans.scheduledLines(summary({ lines: 11, withNoTimeOnAnyPeriod: 11 }))).toBe(0)
  })

  it('counts only lines somebody filed as work, so a heading and a blank line cannot be in it', () => {
    const read = text(renderToStaticMarkup(h(plans.PlansGrid, { reply: { plans: [summary()], closed: 0, note: '' } })))
    // "filed as work" is the code's phrase; "tracked" is the word the editor's own button uses.
    // Finding 33, 19 August 2026. "Scheduled" counts time on ANY period, not this one, as "on a week" did.
    expect(read).toContain(sayInEnglish('g8.shelf.ofTrackedTimeOnAWeek', { scheduled: 3, n: 5 }))
    // The old sentence counted the six lines nobody filed, which on this plan is a heading, a blank
    // line and four lines of prose.
    expect(read).not.toContain('8 lines with no time on any week')
    expect(read).not.toContain('with no time on any week')
  })

  it('says nothing at all about a plan nobody has filed anything from', () => {
    // Ordinary writing. Nobody acts on it, so it gets no weight — and the line count is not a
    // stand-in, because the length of a document is not progress through it.
    const read = text(
      renderToStaticMarkup(
        h(plans.PlansGrid, {
          reply: { plans: [summary({ filedAsWork: 0, withNoTimeOnAnyPeriod: 11 })], closed: 0, note: '' },
        }),
      ),
    )
    expect(read).not.toContain('filed as work')
    // No count at all, with any numbers: the count's one and other forms, each cut after its last number, are not drawn.
    for (const n of [1, 2]) {
      expect(read).not.toContain(sayInEnglish('g8.shelf.ofTrackedTimeOnAWeek', { scheduled: 0, n }).replace(/^.*\d\s*/u, ''))
    }
    // What the card is FOR is still there: it can still be told from another card.
    expect(read).toContain('Getting the arm to hand something over')
  })

  it('agrees with itself in both directions on a plan where everything is scheduled', () => {
    const read = text(
      renderToStaticMarkup(
        h(plans.PlansGrid, {
          reply: { plans: [summary({ lines: 6, filedAsWork: 1, withNoTimeOnAnyPeriod: 5 })], closed: 0, note: '' },
        }),
      ),
    )
    expect(read).toContain(sayInEnglish('g8.shelf.ofTrackedTimeOnAWeek', { scheduled: 1, n: 1 }))
  })
})

// ============================================================================ 5

describe('5 — advice nobody has left', () => {
  const empty = { reviews: [], waiting: 0, note: 'the server’s own sentence about this plan’s advice' }

  function drawReview(): string {
    return renderToStaticMarkup(
      h(review.PlanReview, {
        plan: 'Rm4Cw7Bk3Ne8',
        title: 'Getting the arm to hand something over',
        reviews: empty as unknown as Parameters<ReviewModule['PlanReview']>[0]['reviews'],
        onChanged: () => {},
      }),
    )
  }

  it('does not pay a paragraph for an absence the press above it already answers', () => {
    const read = text(drawReview().replace(/<span class="px-sr">[\s\S]*?<\/span>/g, ' '))
    expect(read).not.toContain('That is not a review saying the plan is fine')
    expect(read).not.toContain('it means none has been filed')
  })

  it('still says which of the two absences this is, in as little ink as carries it', () => {
    const markup = drawReview()
    expect(text(markup)).toContain('—')
    // 7FEOshq3mBGG gives the empty advice list a short mark; its reason still names the absence.
    expect(markup).toContain('class="px-absent"')
    expect(markup).toContain('Nobody has left advice about this plan')
  })

  it('keeps the whole sentence where a reader who wants it can get it', () => {
    // Quietening an absence is not deleting one. The sentence rides on the mark, which is what a
    // screen reader reads out and what the tooltip shows.
    expect(drawReview()).toContain(
      'That is not a review saying the plan is fine — it means none has been filed.',
    )
  })

  it('still offers the press that fills the absence', () => {
    expect(text(drawReview())).toContain('Copy the message')
  })
})

// ============================================================================ 6

describe('6 — record ids on a planning surface', () => {
  /** An id shaped exactly like a real one: twelve characters of the nanoid alphabet. */
  const GONE = 'PiQzVdq42ufa'

  function inMode(markup: () => string, which: 'normal' | 'inspect'): string {
    mode.setMode(which)
    try {
      return markup()
    } finally {
      mode.setMode('normal')
    }
  }

  const rowForAGoneRecord = () =>
    renderToStaticMarkup(
      h(planning.PlanRows, {
        entries: [withWork(allocation(GONE, 4), null)],
        unit: 'week',
        editing: false,
        onWrote: () => {},
      }),
    )

  it('says the record is gone without printing its id at a reader who cannot use one', () => {
    const read = inMode(() => text(rowForAGoneRecord()), 'normal')
    expect(read).toContain('the record this named is gone')
    expect(read).not.toContain(GONE)
  })

  it('prints the id in Developer mode, so nothing became unreachable', () => {
    expect(inMode(() => text(rowForAGoneRecord()), 'inspect')).toContain(GONE)
  })

  const spreadRowWithNoName = () =>
    renderToStaticMarkup(
      h(planning.NotOnADay, {
        reply: weekReply({
          entries: [withWork(allocation('rec-one', 5), 'the controller')],
          inDays: [allocation(GONE, 2, { horizon: 'day', period: DAY_IN_WEEK })],
        }),
      }),
    )

  it('names a row the plan cannot name in words rather than by its id', () => {
    const read = inMode(() => text(spreadRowWithNoName()), 'normal')
    expect(read).toContain('the record this named is gone')
    expect(read).not.toContain(GONE)
  })

  it('gives Developer mode the id on that row too, because there it is the only handle left', () => {
    expect(inMode(() => text(spreadRowWithNoName()), 'inspect')).toContain(GONE)
  })
})
