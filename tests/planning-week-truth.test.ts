// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A WEEK SAYS ABOUT ITSELF, AND WHETHER TWO NUMBERS ON ONE SCREEN AGREE.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THESE CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * Three people who had never seen Mole Office drove the eleven-step planning loop on 16 August 2026 and
 * came back with four defects on the schedule. Three of them are covered here; the fourth needs a
 * browser and is in tests/planning-refusal-visible.test.ts.
 *
 *   A  The headline counted a piece of work with parts planned inside it ONCE, and the project
 *      lines two lines below counted every row. A week read "28.5h planned of 10h this week" over
 *      lines adding up to 37.5h, with nothing saying why. All three testers found it on their own.
 *
 *   B  Hours booked on a DAY were invisible to the week holding that day. A piece of work with 5h
 *      in a week and 8h on a Wednesday inside it left one trace: a row reading "5h this week · 8h
 *      on a day · -3h to place" under a heading saying it was not on a day yet. A tester could not
 *      tell whether the minus was a signal or a bug.
 *
 *   D  The loose-time box advertised "next week, 7 September, 5h on Tuesday" and the reader behind
 *      it reads neither of the last two.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE TESTED THIS WAY
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out adding a DOM, so these are the
 * same two shapes as tests/planning-surfaces.test.ts: pure functions called directly, and
 * components rendered to static markup. That is exactly enough for these three, because all three
 * are about what is IN the markup when the reply says a particular thing.
 *
 * THE ARITHMETIC IS NOT WRITTEN OUT HERE. Every fixture below is built by `loadOf`, `fitOf` and
 * `spreadOf` over allocations, so what the surfaces are checked against is the product's own
 * arithmetic and not a number this file decided. A test that hand-wrote the totals would go green
 * on a week the product would never produce.
 *
 * AND D IS CHECKED AGAINST THE READER ITSELF. The examples are read out of the placeholder the
 * component draws and put through `readTimeWords`, so the test cannot drift from the promise: put
 * an example back that the product does not read and this file says which one.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  fitOf,
  loadOf,
  readTimeWords,
  spreadOf,
  type Allocation,
  type Grain,
  type HoursCountedTwice,
  type Load,
  type Period,
} from '../src/shared/planning.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import { type AllocationWithWork } from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'

type PlanningModule = typeof import('../src/web/components/Planning.tsx')
let planning: PlanningModule

beforeAll(async () => {
  // Planning.tsx reaches src/web/api.ts, which reads window.localStorage at module scope. The same
  // stand-in tests/planning-surfaces.test.ts uses; nothing here is under test.
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

// ---------------------------------------------------------------------------- the fixtures

const WEEK = '2026-W33'
/** The week 2026-W33 as a period, which `spreadOf` needs to know which days are inside it. */
const WEEK_PERIOD: Period = { horizon: 'week', key: WEEK, from: '2026-08-10', to: '2026-08-16' }

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
    createdAt: '2026-08-10 09:00:00',
    updatedAt: '2026-08-10 09:00:00',
  }
}

function withWork(a: Allocation, workspaceId = 'panelx', name = `task ${a.recordId}`): AllocationWithWork {
  return {
    allocation: a,
    work: {
      id: a.recordId,
      kind: 'task',
      title: name,
      name,
      within: null,
      workspaceId,
      state: 'todo',
      effortHours: null,
      origin: 'authored',
      deleted: false,
    },
  }
}

/** What one containment reading looks like: every pair of rows where one work is inside another. */
function containment(pairs: [string, string][]): HoursCountedTwice {
  return {
    horizon: 'week',
    period: WEEK,
    pairs: pairs.map(([outer, inner]) => ({
      outer: { id: outer, title: `task ${outer}` },
      inner: { id: inner, title: `task ${inner}` },
    })),
    notChecked: [],
  }
}

/**
 * A week reply, built the way the route builds one.
 *
 * `finer` is `loadOf` per day inside the week and `spread` is `spreadOf` over the same rows, which
 * is exactly what src/server/api/planning.ts does — so a surface reading them here is reading what
 * it would be handed in the running product.
 */
function weekReply(opts: {
  entries: AllocationWithWork[]
  counted?: HoursCountedTwice
  inDays?: Allocation[]
  capacityHours?: number | null
}): PlanReply {
  const { entries, inDays = [], capacityHours = 10 } = opts
  const mine = entries.map((e) => e.allocation)
  const counted = opts.counted ?? containment([])
  const load = loadOf('week', WEEK, mine, counted)
  const covering = [...mine, ...inDays]
  const dayKeys = [...new Set(inDays.map((a) => a.period))].sort()
  const finer: Load[] = dayKeys.map((key) =>
    loadOf('day', key, covering, { horizon: 'day', period: key, pairs: [], notChecked: [] }),
  )
  return {
    horizon: 'week',
    period: WEEK,
    from: WEEK_PERIOD.from,
    to: WEEK_PERIOD.to,
    entries,
    capacity:
      capacityHours === null
        ? null
        : { horizon: 'week', period: WEEK, hours: capacityHours, note: null, updatedAt: '2026-08-10 09:00:00' },
    fit: fitOf(load, capacityHours),
    spread: spreadOf(WEEK_PERIOD, 'day', covering),
    finer,
    allocatableKinds: ALLOCATABLE_KINDS,
    alsoNamed: [],
    shares: [],
    note: 'not read by any surface under test',
  }
}

const said = { name: 'This week', range: '10 – 16 August', when: 'now' as const, unit: 'week' }

/** The week surface, as a fresh visit draws it: reading, not editing. */
function drawWeek(reply: PlanReply): string {
  return renderToStaticMarkup(
    h(planning.WeekBuild, { reply, said, wrote: 0, editing: false, onWrote: () => {} }),
  )
}

/** Strip the tags so a sentence can be looked for the way a person reads it. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------- A

describe('the headline and the project lines, on one screen', () => {
  /**
   * The tester's week, in the smallest form that reproduces it: a piece of work with 12h and two
   * parts of it with 5h and 4h. The week costs 12h — the envelope, counted once — and the rows add
   * up to 21h.
   */
  const twoLevels = () =>
    weekReply({
      entries: [
        withWork(allocation('parent', 12)),
        withWork(allocation('childA', 5)),
        withWork(allocation('childB', 4)),
      ],
      counted: containment([
        ['parent', 'childA'],
        ['parent', 'childB'],
      ]),
    })

  it('the two totals really do differ, which is what makes this worth drawing', () => {
    // Stated first so the rest of this block cannot pass by the fixture quietly becoming ordinary.
    const reply = twoLevels()
    expect(reply.fit.load.plannedHours).toBe(12)
    expect(reply.fit.load.rowHours).toBe(21)
  })

  it('says beside the project lines what they add up to and what the headline counts instead', () => {
    const read = text(drawWeek(twoLevels()))
    expect(read).toContain('12h')
    expect(read).toContain('21h over 3 pieces of work')
    expect(read).toContain(
      'These lines count every row on its own, so they come to 21h. The 12h above counts a piece ' +
        'of work and the parts planned inside it once.',
    )
  })

  it('names the row sum from the reading of the period, never a second sum of its own', () => {
    // The sentence must move with the arithmetic. A different week, the same component, and the
    // figures follow `loadOf` — which is what stops this line becoming the third place a week's
    // hours are worked out.
    const reply = weekReply({
      entries: [withWork(allocation('parent', 6)), withWork(allocation('childA', 2))],
      counted: containment([['parent', 'childA']]),
    })
    expect(text(drawWeek(reply))).toContain('so they come to 8h. The 6h above counts')
  })

  it('says nothing at all on an ordinary week, where the two totals are the same number', () => {
    const reply = weekReply({ entries: [withWork(allocation('one', 4)), withWork(allocation('two', 3))] })
    expect(reply.fit.load.plannedHours).toBe(reply.fit.load.rowHours)
    const read = text(drawWeek(reply))
    expect(read).toContain('7h over 2 pieces of work')
    expect(read).not.toContain('count every row on its own')
  })

  it('draws no such line when nobody read what is inside what, because there is nothing to say', () => {
    // `countedTwice: null` is "nobody looked", and the total is then the plain sum. A sentence
    // claiming the two numbers differ would be inventing a reading that was never made.
    const entries = [withWork(allocation('parent', 12)), withWork(allocation('childA', 5))]
    const load = loadOf('week', WEEK, entries.map((e) => e.allocation))
    expect(load.envelopes).toBeNull()
    const markup = renderToStaticMarkup(h(planning.ProjectSplit, { entries, load }))
    expect(text(markup)).not.toContain('count every row on its own')
  })
})

// ---------------------------------------------------------------------------- B

describe('what a week says about the days inside it', () => {
  /** 5h given to the week, 8h given to a Wednesday inside it: the tester's second scenario. */
  const overPlaced = () =>
    weekReply({
      entries: [withWork(allocation('solo', 5))],
      inDays: [allocation('solo', 8, { horizon: 'day', period: '2026-08-12' })],
    })

  it('says how many hours are already on days inside it, and that the two are not added', () => {
    const read = text(drawWeek(overPlaced()))
    // THE TWO NUMBERS ARE SEPARATED BY LAYOUT NOW, NOT BY A SENTENCE. Each sits under its own
    // heading with a rule between them, so nobody adds them; `docs/UX-CONTRACT.md` forbids
    // fixing a layout with a sentence. Finding 26 of the language audit, 19 August 2026.
    expect(read).toContain('On particular days inside this week')
    expect(read).toContain('8h')
    expect(read).not.toContain('not added together')
  })

  it('does not add the days into the week, which would count the same work twice', () => {
    const reply = overPlaced()
    // The week's own total is untouched by the day: 5h, not 13h.
    expect(reply.fit.load.plannedHours).toBe(5)
    // AND IT SAYS WHAT IT COUNTS. It read "5h planned of 10h this week" over a line saying 8h was
    // already on the days inside that week, which a first-time user on 16 August 2026 read as two
    // opposite statements about one week. The number is unchanged; the words name the week itself.
    expect(text(drawWeek(reply))).toContain('5h planned of 10h on the week itself')
    expect(text(drawWeek(reply))).not.toContain('5h planned of 10h this week')
  })

  it('counts the work whose days hold more than the week gives it, on the headline', () => {
    expect(text(drawWeek(overPlaced()))).toContain(
      '1 piece of work has more on the days than this week gives it, listed below',
    )
  })

  it('says nothing about the inside of a week whose days hold nothing', () => {
    const read = text(drawWeek(weekReply({ entries: [withWork(allocation('solo', 5))] })))
    expect(read).not.toContain('already on the days inside this week')
  })

  it('draws the work as a conflict rather than as a negative number to place', () => {
    const markup = renderToStaticMarkup(h(planning.NotOnADay, { reply: overPlaced() }))
    const read = text(markup)
    // The old drawing, which a tester could not read: a minus inside "to place".
    expect(read).not.toContain('-3h to place')
    expect(read).toContain('The days inside this week hold more hours than this week gives this work.')
    expect(read).toContain('3h more than this week gives it')
    expect(read).toContain('Both numbers cannot be right')
    expect(markup).toContain('data-conflict="yes"')
  })

  it('stops calling the panel "not yet on a day" when some of it is more than on a day', () => {
    const markup = renderToStaticMarkup(h(planning.NotOnADay, { reply: overPlaced() }))
    // THE HEADING NAMES THE PANEL'S SUBJECT AND EVERY ROW NAMES ITS OWN STATE. The owner named the
    // old string on 17 August 2026: "labels such as On a day, and not on one yet are not acceptable
    // Normal-mode language if the owner cannot tell what they mean." It was two states joined by a
    // comma, over rows that can be in five.
    //
    // AND IT SAYS HOURS RATHER THAN WORK, since 18 August 2026. A tester looked here for the one
    // thing on a day that week — a block, placed across four days — and it is not in this panel,
    // because a block carries no hours. The heading was wider than the panel's own arithmetic.
    expect(text(markup)).toContain('Which days this week’s hours are on')
    expect(text(markup)).not.toContain('Which days this week’s work is on')
    expect(text(markup)).not.toContain('On a day, and not on one yet')
  })

  it('leaves an ordinary part-placed row where it was, in its own group and its own words', () => {
    const reply = weekReply({
      entries: [withWork(allocation('solo', 5))],
      inDays: [allocation('solo', 2, { horizon: 'day', period: '2026-08-12' })],
    })
    const read = text(renderToStaticMarkup(h(planning.NotOnADay, { reply })))
    expect(read).toContain('5h this week · 2h on a day · 3h to place')
    expect(read).not.toContain('more than this week gives')
    expect(read).not.toContain('Both numbers cannot be right')
  })
})

// ---------------------------------------------------------------------------- D

describe('the box that takes a time in words', () => {
  /** The examples the box shows, read out of the component rather than written down here. */
  function examples(): string[] {
    const markup = renderToStaticMarkup(
      h(planning.TimeInWords, {
        said: '',
        onSaid: () => {},
        editing: true,
        today: null,
        onWrote: () => {},
      }),
    )
    const found = markup.match(/placeholder="([^"]*)"/)
    if (found === null) throw new Error('the time-in-words box no longer draws a placeholder at all')
    return (found[1] ?? '').split(',').map((one) => one.trim())
  }

  it('shows more than one example, or there is nothing to keep honest', () => {
    expect(examples().length).toBeGreaterThan(1)
  })

  it('reads every example it shows', () => {
    // A PLACEHOLDER IS A PROMISE. It used to offer "7 September" and "5h on Tuesday", and
    // `readTimeWords` reads neither — so two thirds of what the box advertised came back as
    // "Mole Office could not read a period from these words".
    const now = new Date('2026-08-16T10:00:00')
    const refused = examples().filter((one) => !readTimeWords(one, now).period.read)
    expect(refused).toEqual([])
  })

  it('reads the hours out of an example that carries them', () => {
    const now = new Date('2026-08-16T10:00:00')
    const withHours = examples().filter((one) => readTimeWords(one, now).hours.read)
    expect(withHours.length).toBeGreaterThan(0)
  })
})
