// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND FIVE, WAVE B: giving time in words, and a conflict that helps rather than refuses.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST HERE
 * ---------------------------------------------------------------------------------------
 *
 * Three things on the Schedule, all of them in src/web/components/Planning.tsx:
 *
 *   1. A box that takes words about time, beside the three shortcuts that used to be the whole
 *      control. Words that read cleanly get a period and a press that opens it. Words that do not
 *      get Mole Office's own sentence saying why, and NO date is ever invented from them.
 *   2. The words already kept, drawn so that not one of them can be mistaken for a commitment, and
 *      never counted into anything.
 *   3. Parts of a piece of work that come to more than the work itself: shown at the top of the
 *      note, in the heaviest type on it, with the press that reaches the hours.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LOOKS LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * Same two shapes as tests/planning-surfaces.test.ts, and for the same reason: the runner has no
 * DOM, so a pure function is called directly and a component is rendered to static markup. What
 * that covers is what must be IN the markup, which on these surfaces is the whole doctrine — a
 * date that must not appear, a press that must not be drawn, and a sentence that must be.
 *
 * Typing into the box is not simulated. It does not need to be: what is in the box is a prop the
 * surface holds, exactly like the hours box beside the add section, so a test states it directly.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  fitOf,
  loadOf,
  parsePeriod,
  spreadOf,
  type Allocation,
  type Grain,
  type HoursCountedTwice,
} from '../src/shared/planning.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import type {
  AllocationWithWork,
  PlanningIntent,
  PlanningIntentWithPeriodReading,
} from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'

type PlanningModule = typeof import('../src/web/components/Planning.tsx')
let planning: PlanningModule

beforeAll(async () => {
  // Planning.tsx reaches src/web/api.ts, which reads window.localStorage at module scope to restore
  // who you are acting as. The smallest stand-in that lets the module load; nothing here is under
  // test. Same stub as tests/planning-surfaces.test.ts.
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
})

/** Sunday 16 August 2026, the day of the feedback this wave is built from. */
const NOW = new Date(2026, 7, 16, 12, 0, 0)

/** The server's day, week and month, as the page reads them, on that same day. */
const TODAY = { day: '2026-08-16', week: '2026-W33', month: '2026-08' }

/** The markup without the stylesheet, so an assertion is about words and not about CSS. */
function onScreen(markup: string): string {
  return markup.replace(/<style[^>]*>.*?<\/style>/gs, '')
}

// ============================================================================ reading the words

describe('what Mole Office makes of words about time', () => {
  const said = (words: string) => planning.timeSaid(words, NOW)

  it('reads a week, a day, a month and a range of days, none of which is a stored key', () => {
    expect(said('next week')?.period?.key).toBe('2026-W34')
    expect(said('2026-09-07')?.period?.key).toBe('2026-09-07')
    expect(said('september')?.period?.key).toBe('2026-09')
    // A RANGE THAT IS EXACTLY A PERIOD. Monday to Sunday is a week; the shared reader refuses a
    // range that is not one, which is the test two cases below.
    expect(said('monday to sunday')?.period?.key).toBe('2026-W34')
  })

  it('reads how long as well as when, out of one sentence', () => {
    const both = said('15h next week')
    expect(both?.hours).toBe(15)
    expect(both?.period?.key).toBe('2026-W34')
  })

  it('says nothing about hours when the words said nothing about hours', () => {
    // "Mole Office could not read a number of hours from these words" beside somebody who only asked to
    // look at next week is a complaint about a question they did not ask.
    expect(said('next week')?.aboutHours).toBeNull()
    expect(said('15h next week')?.aboutHours).toContain('15 hours')
  })

  it('turns "sometime next week" into no date at all, and says which word stopped it', () => {
    // THE ONE THAT MATTERS. A product that reads "Tuesday afternoon" and then reads this one to be
    // consistent has invented a fact. The sentence names the word so the person can correct it.
    const vague = said('sometime next week')
    expect(vague?.period).toBeNull()
    expect(vague?.aboutWhen).toContain('sometime')
    expect(vague?.aboutWhen).toContain('kept them exactly as they are')
    expect(JSON.stringify(vague)).not.toContain('2026-W')
  })

  it('refuses a range of days that is not exactly a period, rather than rounding it up to one', () => {
    const three = said('7 to 9 september')
    expect(three?.period).toBeNull()
    expect(three?.aboutWhen).toContain('could not read a period')
  })

  it('reads an empty box as nothing written, which is not a failed reading', () => {
    expect(said('')).toBeNull()
    expect(said('   ')).toBeNull()
  })
})

// ============================================================================ the box on screen

/** The Time in words panel, with whatever is in its box. */
function wordsPanel(
  words: string,
  opts: { editing?: boolean } = {},
): string {
  return onScreen(
    renderToStaticMarkup(
      h(planning.TimeInWords, {
        said: words,
        onSaid: () => {},
        editing: opts.editing ?? false,
        today: TODAY,
        now: NOW,
        onWrote: () => {},
      }),
    ),
  )
}

describe('the box that takes words about time', () => {
  it('keeps today, this week and this month as the three shortcuts', () => {
    // They were the whole control. They stay, as the commonest three things to type.
    const markup = wordsPanel('')
    expect(markup).toContain('>today<')
    expect(markup).toContain('>this week<')
    expect(markup).toContain('>this month<')
  })

  it('offers the way to a period it read, addressed by name rather than by key', () => {
    const markup = wordsPanel('next week')
    expect(markup).toContain('href="#/plan/2026-W34"')
    // The press says what it opens in the period's own name. "2026-W34" is what an address holds.
    expect(markup).toContain('Open Next week')
  })

  it('reaches a period no button offers: a named day, a month, and a range of days', () => {
    expect(wordsPanel('2026-09-07')).toContain('href="#/plan/2026-09-07"')
    expect(wordsPanel('september')).toContain('href="#/plan/2026-09"')
    expect(wordsPanel('monday to sunday')).toContain('href="#/plan/2026-W34"')
  })

  it('draws no way anywhere from words it could not read, and no date from them either', () => {
    const markup = wordsPanel('sometime next week')
    expect(markup).toContain('sometime')
    expect(markup).not.toContain('href="#/plan/')
    expect(markup).not.toContain('2026-W')
    expect(markup).not.toContain('Open ')
  })

  it('draws the press that writes only while the period is being planned', () => {
    // The box itself changes nothing, so it is drawn while reading — that is how a person reaches
    // another period. Keeping the words is a write and lives behind Edit like every other write.
    expect(wordsPanel('sometime next week', { editing: false })).not.toContain('Keep these words')
    expect(wordsPanel('sometime next week', { editing: true })).toContain('Keep these words')
  })

  it('keeps the box behind a press while the period is being read, and open while it is planned', () => {
    // A PAGE BEING READ DRAWS NO BOX. tests/read-before-edit.test.ts opens every address in a real
    // browser and counts them, and it caught this panel drawing one. A closed fold is a press
    // somebody has not made yet, which is the tier the contract calls "expanded" and the tier that
    // test allows. This assertion is the cheap guard on the expensive one.
    const reading = wordsPanel('', { editing: false })
    expect(reading).toContain('<details class="px-pl-fold">')
    expect(reading).toContain('Another day, week or month')
    expect(reading).not.toContain('px-pl-fold" open')

    const planning = wordsPanel('', { editing: true })
    expect(planning).toContain('<details class="px-pl-fold" open=""')
  })

  it('says nothing about the words until there are some', () => {
    const empty = wordsPanel('', { editing: true })
    expect(empty).not.toContain('Keep these words')
    expect(empty).not.toContain('could not read')
  })
})

describe('where the box is reachable from', () => {
  /**
   * A control nothing mounts is a control nobody can use, and every period that is PLANNED gets it.
   * Today does not: it is the surface for doing the work, not a second place to plan it.
   *
   * CRITERION CHANGE (wave 13j round 12). It read: WeekBuild, MonthPlan and DayPlan each draw
   * "Time in words". The Schedule was designed again on the proposal the owner adopted (report
   * n9Mjk3c_sJRu, block b-13): going to a period in words is the date field in the control row, and
   * this section, which keeps words and lists kept words, is at the foot of the page. So the page
   * draws it, once, for a week, a month and a day, and not while today is being worked. The page
   * is drawn here before any reply arrives; the section does not wait for the period's reply.
   */
  const drawPage = async (props: Record<string, unknown>): Promise<string> => {
    const page = await import('../src/web/pages/PlanPage.tsx')
    return onScreen(renderToStaticMarkup(h(page.PlanPage, props)))
  }

  it('is on the week', async () => {
    expect(await drawPage({ period: '2026-W33' })).toContain('Time in words')
  })

  it('is on the month', async () => {
    expect(await drawPage({ period: '2026-08' })).toContain('Time in words')
  })

  it('is on the day', async () => {
    expect(await drawPage({ period: '2026-08-17' })).toContain('Time in words')
  })

  it('is at the foot of the page, under the plan starter', async () => {
    const markup = await drawPage({ period: '2026-W33' })
    expect(markup.indexOf('Write a new plan')).toBeGreaterThan(-1)
    expect(markup.indexOf('Time in words'), 'Time in words is drawn above the plan starter').toBeGreaterThan(markup.indexOf('Write a new plan'))
  })

  it('is not on today while it is being worked', async () => {
    expect(await drawPage({ today: true })).not.toContain('Time in words')
  })
})

// ============================================================================ the words kept

/** One row of the intents table, with only the fields this surface reads set. */
function intent(over: Partial<PlanningIntentWithPeriodReading> = {}): PlanningIntentWithPeriodReading {
  const { periodReading, ...fields } = over
  const row: PlanningIntent = {
    id: `i-${over.said ?? 'x'}`,
    said: 'sometime next week',
    recordId: null,
    planLineId: null,
    horizon: null,
    period: null,
    hours: null,
    state: 'kept',
    createdAt: '2026-08-16 12:00:00',
    createdBy: 'human:robin',
    ...fields,
  }
  return {
    ...row,
    periodReading: periodReading ?? { period: null, namesStoredPeriod: false },
  }
}

function keptList(
  intents: PlanningIntentWithPeriodReading[],
  opts: { editing?: boolean; committed?: number } = {},
): string {
  const committed = opts.committed ?? 0
  return onScreen(
    renderToStaticMarkup(
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
    ),
  )
}

describe('words somebody wrote about time, kept where they can be found again', () => {
  it('shows the words exactly as written, and says what Mole Office read from them', () => {
    // THE ROW SAYS WHAT WAS READ AND NOT WHAT WAS NOT SCHEDULED. The old sentence was the list's
    // own claim repeated once per row, and on a week whose total said "12h planned this week" it
    // put a denial of that total under it. The list still says it, once — see the check below.
    const markup = keptList([intent({ said: 'sometime next week, finish the controller' })])
    expect(markup).toContain('sometime next week, finish the controller')
    expect(markup).toContain('Mole Office read no day, week or month from these words.')
    expect(markup).not.toContain('Nothing has been scheduled from these words.')
  })

  it('says in so many words that none of these is in any total', () => {
    // THE LOAD-BEARING HALF OF THE EIGHTH RULE. A kept intent adds to no week and uses no capacity,
    // and a surface that left the reader to infer that from how the row is drawn is claiming less
    // than it must.
    //
    // AND THE SECOND SENTENCE IS THE OTHER HALF. Without it, "nothing came from these words" beside
    // a week that has hours reads as one of the two being wrong. Neither is.
    const markup = keptList([intent()])
    expect(markup).toContain('Nothing on the plan came from these words')
    expect(markup).toContain('in no total')
    expect(markup).toContain('The work they name may still have hours, given some other way.')
  })

  it('shows an interpretation beside the words and never instead of them', () => {
    const markup = keptList([
      intent({
        said: 'Tuesday afternoon',
        state: 'offered',
        period: '2026-08-18',
        horizon: 'day',
        hours: 3,
        periodReading: { period: '2026-08-18', namesStoredPeriod: true },
      }),
    ])
    expect(markup).toContain('Tuesday afternoon')
    // ONE NAMING OF THE PERIOD IN THE SENTENCE, and it is the days it covers. A day is CALLED
    // "Tue 18 August" and COVERS "Tue, 18 August 2026", so a sentence carrying both said it twice. The day is
    // written by the office's one day formatter (wave 13q's round 28), whose English puts a comma after the
    // weekday when it writes the year.
    expect(markup).toContain('Mole Office read this as Tue, 18 August 2026, 3 hours.')
    expect(markup).not.toContain('Nothing has been scheduled from it yet')
  })

  it('draws no press to schedule words that name no piece of work, and says why', () => {
    // The server refuses this commit, so a press offering it would be a fake affordance. What the
    // row offers instead is the period, which is where the work can be put on it.
    const markup = keptList(
      [intent({
        said: 'Tuesday afternoon',
        state: 'offered',
        period: '2026-08-18',
        horizon: 'day',
        periodReading: { period: '2026-08-18', namesStoredPeriod: true },
      })],
      { editing: true },
    )
    expect(markup).not.toContain('Give it that time')
    expect(markup).toContain('name no piece of work')
    expect(markup).toContain('href="#/plan/2026-08-18"')
  })

  it('offers the press only when a period AND a piece of work are both there, and only while planning', () => {
    const withWork = [
      intent({
        said: '5h on Tuesday',
        state: 'offered',
        period: '2026-08-18',
        horizon: 'day',
        hours: 5,
        recordId: 'rec1',
        periodReading: { period: '2026-08-18', namesStoredPeriod: true },
      }),
    ]
    expect(keptList(withWork, { editing: true })).toContain('Give it that time')
    expect(keptList(withWork, { editing: false })).not.toContain('Give it that time')
  })

  it('lists only what is unscheduled, and counts the rest rather than listing it twice', () => {
    // A committed intent became an ordinary allocation and is on the period's own rows. Listing it
    // here as well would put the same hours in two places on one screen.
    const markup = keptList([intent({ said: 'sometime next week' })], { committed: 2 })
    expect(markup).toContain('sometime next week')
    expect(markup).toContain('2 more have been scheduled')
  })

  it('draws nothing at all when nothing is waiting', () => {
    expect(keptList([])).toBe('')
    expect(keptList([intent({ state: 'committed', period: '2026-W34', horizon: 'week' })])).toBe('')
  })
})

// ============================================================================ the envelope

/** One allocation with its work. Only the fields these surfaces read are set. */
function entry(recordId: string, plannedHours: number | null, name: string, at: { horizon: Grain; period: string }): AllocationWithWork {
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
    work: {
      id: recordId,
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

/** A plan reply for one period, built the way the route builds one. */
function planReply(opts: {
  horizon: Grain
  period: string
  entries: AllocationWithWork[]
  countedTwice: HoursCountedTwice
  capacityHours?: number
}): PlanReply {
  const parsed = parsePeriod(opts.period)
  if (parsed === null) throw new Error(`the test asked for "${opts.period}", which is not a period`)
  const mine: Allocation[] = opts.entries.map((e) => e.allocation)
  const capacity =
    opts.capacityHours === undefined
      ? null
      : { horizon: opts.horizon, period: opts.period, hours: opts.capacityHours, note: null, updatedAt: '2026-08-13 09:00:00' }
  const load = loadOf(opts.horizon, opts.period, mine, opts.countedTwice)
  const finerGrain: Grain | null = opts.horizon === 'month' ? 'week' : opts.horizon === 'week' ? 'day' : null
  return {
    horizon: opts.horizon,
    period: opts.period,
    from: parsed.from,
    to: parsed.to,
    entries: opts.entries,
    capacity,
    fit: fitOf(load, capacity?.hours ?? null),
    spread: finerGrain === null ? null : spreadOf(parsed, finerGrain, mine),
    finer: finerGrain === null ? null : [],
    allocatableKinds: ALLOCATABLE_KINDS,
    alsoNamed: [],
    shares: [],
    note: 'the server’s own sentence about this period',
  }
}

/**
 * 15h on Baseline this week, with Controller and Perception inside it.
 *
 * `over` makes the parts exceed the envelope, which is the one shape in this note that is a
 * conflict rather than an ordinary plan.
 */
function baselineWeek(hours: { parent: number; first: number; second: number }): PlanReply {
  const at = { horizon: 'week' as const, period: '2026-W33' }
  return planReply({
    horizon: 'week',
    period: '2026-W33',
    capacityHours: 20,
    entries: [
      entry('p', hours.parent, 'Baseline', at),
      entry('c1', hours.first, 'Controller', at),
      entry('c2', hours.second, 'Perception', at),
    ],
    countedTwice: {
      horizon: 'week',
      period: '2026-W33',
      pairs: [
        { outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c1', title: 'Controller' } },
        { outer: { id: 'p', title: 'Baseline' }, inner: { id: 'c2', title: 'Perception' } },
      ],
      notChecked: [],
    },
  })
}

/** Only the note about what is planned inside what, so an assertion is about it and not the page. */
function insideNote(markup: string): string {
  const found = /<div class="px-pl-inside"[^>]*>[\s\S]*?<\/div>/.exec(onScreen(markup))
  return found === null ? '' : found[0]
}

function week(hours: { parent: number; first: number; second: number }, editing: boolean): string {
  return renderToStaticMarkup(
    h(planning.WeekBuild, {
      reply: baselineWeek(hours),
      said: planning.periodSaid('2026-W33', TODAY),
      wrote: 0,
      editing,
      onWrote: () => {},
    }),
  )
}

describe('parts that come to more than the work holding them', () => {
  it('says it first, in the heaviest type in the note', () => {
    // IT WAS A SENTENCE FOUR LINES DOWN A QUIET GREY BOX, at the same size and in the same ink as
    // the ordinary facts around it. The conflict is now the first line, and it is a heading rather
    // than a list item — weight in proportion to whether somebody has to act.
    const drawn = insideNote(week({ parent: 10, first: 8, second: 5 }, false))
    expect(drawn).toContain('Parts add up to more than the work holding them.')
    expect(drawn.indexOf('Parts add up to more')).toBeLessThan(drawn.indexOf('planned at two levels'))
    expect(drawn).toContain('px-pl-inside-clash')
    expect(drawn).toContain('<strong>')
  })

  it('offers the press that reaches the hours, while the period is being read', () => {
    // The hours are text while reading and the boxes that change them are behind Edit, so the
    // conflict carries the way there. Stating "change the hours" with nothing to press is a
    // conflict a person cannot act on.
    const drawn = insideNote(week({ parent: 10, first: 8, second: 5 }, false))
    expect(drawn).toContain('Change these hours')
    expect(drawn).toContain('href="#/plan/2026-W33/edit"')
  })

  it('draws no press while the period is being planned, because the boxes are already on the rows', () => {
    const drawn = insideNote(week({ parent: 10, first: 8, second: 5 }, true))
    expect(drawn).toContain('Parts add up to more than the work holding them.')
    expect(drawn).not.toContain('Change these hours')
  })

  it('says none of it about an ordinary plan that fits inside its envelope', () => {
    // 15h on Baseline with 5h and 4h inside it is coarse-to-fine planning, not a fault. A warning
    // drawn on the ordinary week teaches a reader to skip the box by the week it matters in.
    const drawn = insideNote(week({ parent: 15, first: 5, second: 4 }, false))
    expect(drawn).not.toContain('Parts add up to more')
    expect(drawn).not.toContain('Change these hours')
    expect(drawn).not.toContain('px-pl-inside-clash')
  })

  it('still says what is here, what is on parts inside it, and what is not yet broken down', () => {
    // The three numbers asked for, in one sentence, on the ordinary case.
    expect(insideNote(week({ parent: 15, first: 5, second: 4 }, false))).toContain(
      '“Baseline” has 15h here, of which 9h is planned on parts inside it and 6h is not yet broken down.',
    )
  })
})
