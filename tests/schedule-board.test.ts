// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEEK AS A BOARD: where a block is drawn, what it says, and what it must never say.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A person needs a week they can place work on. If a piece of work will be worked on from this
 * Thursday until next Wednesday, the person should be able to place it across that span without first
 * working out exactly how many hours belong on each day. That is a new fact —
 * `work_windows` — and a new surface for it, and this file holds the three things about that
 * surface that could quietly be wrong:
 *
 *   1. WHERE A BLOCK IS DRAWN. A span that leaves the week has to be clamped to the columns that
 *      exist AND say it continues. Clipped silently, a fourteen-day span is drawn as a four-day
 *      plan, and nothing on the screen would say so.
 *   2. WHAT A BLOCK SAYS. **A window carries no hours and is in no total.** The schema comment says
 *      it in capitals, the route says it, `tests/work-windows.test.ts` holds the server to it, and
 *      this holds the words on the screen to it.
 *   3. WHICH WORD FINISHES A PIECE OF WORK. Done writes the record's own state, and the word is the
 *      kind's: `done` on a task, `fulfilled` or `cancelled` on an obligation, three more on a
 *      problem, and none at all on a direction. A press that wrote `done` on all five would be
 *      writing a value the server refuses on three of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LAYOUT IS TESTED THROUGH PURE FUNCTIONS
 * ---------------------------------------------------------------------------------------
 *
 * The runner's environment is `node` and this project has ruled out adding a DOM, so the same two
 * shapes as tests/planning-surfaces.test.ts: pure functions called directly, and presentational
 * components rendered to static markup. `placeOn`, `boardOf`, `windowSaid`, `stateOfSpread`,
 * `stateOfKeptWords` and `endingWordsOf` are exported for exactly this — they are the parts that
 * could make the board lie, and every one of them can be checked without a browser.
 *
 * WHAT THIS DOES NOT COVER, said rather than implied: whether a drag lands, whether the arrow keys
 * move a block in a real browser, and whether the seven columns become a list at 390. Those are
 * browser and screenshot questions and belong to `node tools/review.mjs` and a driven session.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { KIND_SPECS, declaredTypeOf } from '../src/shared/kinds.ts'
import { progressOf } from '../src/shared/work.ts'
import { ALLOCATABLE_KINDS } from '../src/shared/work.ts'
import type { WindowWithWork } from '../src/server/lib/windows.ts'
import type { AllocatedWork, AllocationWithWork } from '../src/server/lib/planning.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

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

/** The ISO week of Monday 17 August 2026. Every day key below is one of its seven. */
const WEEK = '2026-W34'

/**
 * Its seven days, written out.
 *
 * WRITTEN OUT RATHER THAN COMPUTED, for two reasons. `describe` bodies run before `beforeAll`, so
 * the module under test is not imported yet; and the first test below compares `daysOf` against
 * these, which would be circular if the rest of the file took its days from `daysOf` as well.
 */
const DAYS = [
  '2026-08-17',
  '2026-08-18',
  '2026-08-19',
  '2026-08-20',
  '2026-08-21',
  '2026-08-22',
  '2026-08-23',
] as const

function work(over: Partial<AllocatedWork> = {}): AllocatedWork {
  return {
    id: 'rec-1',
    kind: 'task',
    title: 'Test gripper',
    name: 'Test gripper',
    within: null,
    workspaceId: 'robotics',
    state: 'todo',
    effortHours: 8,
    origin: null,
    deleted: false,
    ...over,
  }
}

function windowOn(id: string, startsOn: string, endsOn: string, over: Partial<WindowWithWork['window']> = {}): WindowWithWork {
  return {
    window: {
      id,
      recordId: `rec-${id}`,
      startsOn,
      endsOn,
      note: null,
      state: 'planned',
      createdAt: '2026-08-17 09:00:00',
      updatedAt: '2026-08-17 09:00:00',
      ...over,
    },
    work: work({ id: `rec-${id}` }),
  }
}

// ============================================================================ 1 — the seven days

describe('the seven columns are the week the rest of the page counts', () => {
  it('walks Monday to Sunday, from the one period reader', () => {
    expect(planning.daysOf(WEEK)).toEqual([...DAYS])
  })

  it('answers with no days at all for something that is not a period, rather than a guessed week', () => {
    // Absence beats a guess. A board drawn on seven invented days would be a week nobody asked for.
    expect(planning.daysOf('next tuesday')).toEqual([])
    expect(planning.daysOf('2026-02-30')).toEqual([])
  })

  it('steps a day forward and back across a month boundary', () => {
    expect(planning.dayPlus('2026-08-31', 1)).toBe('2026-09-01')
    expect(planning.dayPlus('2026-09-01', -1)).toBe('2026-08-31')
    expect(planning.dayPlus('2026-08-20', 6)).toBe('2026-08-26')
  })
})

// ============================================================================ 2 — where it is drawn

describe('a span that leaves the week is drawn as leaving it', () => {
  const days = DAYS

  it('places a one-day block in its own column', () => {
    expect(planning.placeOn(days, { startsOn: '2026-08-19', endsOn: '2026-08-19' })).toEqual({
      from: 3,
      to: 3,
      startsBefore: false,
      endsAfter: false,
    })
  })

  it('clamps a span that runs past Sunday AND says it runs on', () => {
    // The example: this Thursday until next Wednesday. Drawn to the end of the week,
    // and `endsAfter` is what stops the drawing claiming the work ends on Sunday.
    const place = planning.placeOn(days, { startsOn: '2026-08-20', endsOn: '2026-08-26' })
    expect(place).toEqual({ from: 4, to: 7, startsBefore: false, endsAfter: true })
  })

  it('clamps a span that began before Monday AND says it began earlier', () => {
    const place = planning.placeOn(days, { startsOn: '2026-08-13', endsOn: '2026-08-18' })
    expect(place).toEqual({ from: 1, to: 2, startsBefore: true, endsAfter: false })
  })

  it('says both when the span swallows the whole week', () => {
    expect(planning.placeOn(days, { startsOn: '2026-08-01', endsOn: '2026-09-01' })).toEqual({
      from: 1,
      to: 7,
      startsBefore: true,
      endsAfter: true,
    })
  })

  it('draws nothing at all for a span that does not touch these days', () => {
    expect(planning.placeOn(days, { startsOn: '2026-08-24', endsOn: '2026-08-28' })).toBeNull()
    expect(planning.placeOn(days, { startsOn: '2026-08-01', endsOn: '2026-08-16' })).toBeNull()
  })

  it('draws nothing rather than a nearby column when the day cannot be placed', () => {
    // A day inside the week's range that is not one of its days cannot happen through the route,
    // which answers about overlap. If it ever does, one block fewer beats one block in the wrong
    // place: a block drawn a day out is a lie a reader cannot see.
    expect(planning.placeOn([], { startsOn: '2026-08-19', endsOn: '2026-08-19' })).toBeNull()
  })
})

describe('blocks that overlap never share a row', () => {
  const days = DAYS

  it('puts two overlapping spans on two rows and a later one back on the first', () => {
    const laid = planning.boardOf(days, [
      windowOn('a', '2026-08-17', '2026-08-19'),
      windowOn('b', '2026-08-18', '2026-08-20'),
      windowOn('c', '2026-08-21', '2026-08-22'),
    ])
    expect(laid.map((one) => [one.window.id, one.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ])
  })

  it('does not depend on the order the rows arrived in', () => {
    const ordered = planning.boardOf(days, [
      windowOn('a', '2026-08-17', '2026-08-19'),
      windowOn('b', '2026-08-18', '2026-08-20'),
    ])
    const shuffled = planning.boardOf(days, [
      windowOn('b', '2026-08-18', '2026-08-20'),
      windowOn('a', '2026-08-17', '2026-08-19'),
    ])
    expect(shuffled.map((one) => [one.window.id, one.lane])).toEqual(ordered.map((one) => [one.window.id, one.lane]))
  })

  it('leaves out a window that does not touch the week rather than drawing it at column zero', () => {
    const laid = planning.boardOf(days, [windowOn('far', '2026-09-01', '2026-09-03')])
    expect(laid).toEqual([])
  })
})

// ============================================================================ 3 — no hours, ever

describe('a block says when, and never how much', () => {
  it('writes one day as one day, and a span with the number of days it covers', () => {
    expect(planning.windowSaid({ startsOn: '2026-08-19', endsOn: '2026-08-19' })).toBe('Wed 19 August, one day')
    expect(planning.windowSaid({ startsOn: '2026-08-20', endsOn: '2026-08-26' })).toBe('Thu 20 – Wed 26 August, 7 days')
  })

  it('writes the month on both ends when the span crosses one', () => {
    expect(planning.windowSaid({ startsOn: '2026-08-30', endsOn: '2026-09-02' })).toBe(
      'Sun 30 August – Wed 2 September, 4 days',
    )
  })

  it('never puts a number of hours in what a span says', () => {
    // THE ONE THING THIS SURFACE MUST NOT DO. A window answers when and an allocation answers how
    // much; a span sentence carrying an hours figure would be the board claiming a commitment
    // nobody made, and every total on the page would then read as though it counted it.
    for (const span of [
      { startsOn: '2026-08-17', endsOn: '2026-08-17' },
      { startsOn: '2026-08-17', endsOn: '2026-08-23' },
      { startsOn: '2026-08-30', endsOn: '2026-09-02' },
    ]) {
      expect(planning.windowSaid(span), 'a span sentence printed a number of hours').not.toMatch(/\d+(\.\d+)?\s*h\b/)
    }
  })

  it('tells the reader in the interface that a block is days and not hours', () => {
    expect(planning.BOARD_HELP).toContain('not a number of hours')
  })

  it('says how to work the board from the keyboard, in the interface rather than in a manual', () => {
    // A board that can only be driven with a mouse fails this repository's accessibility standard,
    // and a keyboard equivalent nobody can find is the same failure with an extra step.
    expect(planning.BOARD_HELP).toContain('arrow keys')
    expect(planning.BOARD_HELP).toContain('Shift')
  })

  it('says what the seven columns become on a narrow screen', () => {
    expect(planning.BOARD_HELP).toContain('narrow screen')
  })
})

// ============================================================================ 4 — the finishing word

describe('the word that finishes a piece of work comes from the kind, not from this page', () => {
  it('gives a task and a block exactly one word, and it is the word they declare', () => {
    expect(planning.endingWordsOf('task')).toEqual(['done'])
    expect(planning.endingWordsOf('block')).toEqual(['done'])
  })

  it('gives a kind that ends several ways all of them, so nobody picks one for the person', () => {
    // An obligation ends fulfilled or cancelled; a problem ends fixed, worked around or accepted.
    // Writing `done` on either would be a value the server refuses, and choosing one of the several
    // would be Mole Office making a judgement about somebody's work.
    expect(planning.endingWordsOf('obligation').length).toBeGreaterThan(1)
    expect(planning.endingWordsOf('problem').length).toBeGreaterThan(1)
    expect(planning.endingWordsOf('obligation')).toContain('fulfilled')
    expect(planning.endingWordsOf('problem')).toContain('fixed')
  })

  it('gives a kind with no state field nothing at all, rather than inventing a word for it', () => {
    // A direction records how far it has been taken, on its own ladder, and has no `state` field.
    expect(planning.endingWordsOf('direction')).toEqual([])
    expect(planning.endingWordsOf('not-a-kind')).toEqual([])
  })

  /**
   * THE PART THAT SURVIVES A KIND CHANGING ITS VOCABULARY NEXT YEAR.
   *
   * The three cases above are what the kinds say TODAY. This one says the rule: every word offered
   * is a word that kind declares, and every word offered means the work is finished. Written this
   * way it cannot pass by agreeing with a copy of the list kept in this file.
   */
  it('offers only words the kind declares, and only words that mean finished', () => {
    for (const kind of ALLOCATABLE_KINDS) {
      const spec = KIND_SPECS[kind] as { fields: readonly { key: string; type: string }[] }
      const field = spec.fields.find((one) => one.key === 'state')
      const declared = field === undefined ? [] : declaredTypeOf(field as never)
      const words: readonly string[] =
        field === undefined ? [] : 'values' in (declared as { values?: string[] }) ? ((declared as { values: string[] }).values) : []
      for (const offered of planning.endingWordsOf(kind)) {
        expect(words, `"${offered}" is offered for a ${kind} and that kind does not declare it`).toContain(offered)
        expect(progressOf(offered), `"${offered}" is offered as finishing a ${kind} and does not mean finished`).toBe(
          'finished',
        )
      }
    }
  })
})

// ============================================================================ 5 — the states, in words

describe('every row says the state it is actually in', () => {
  it('names the five states a spread row can be in', () => {
    // "Needs a day" is the contract's own word and it belongs to two of these: hours left to place,
    // and a week that committed without saying how much while no day holds any of it.
    expect(planning.stateOfSpread({ plannedHours: 5, scheduledHours: 3, finer: 1, unscheduledHours: 2 }, 'day')).toBe(
      'Needs a day',
    )
    expect(planning.stateOfSpread({ plannedHours: 5, scheduledHours: 5, finer: 2, unscheduledHours: 0 }, 'day')).toBe(
      'All on days',
    )
    expect(planning.stateOfSpread({ plannedHours: 0, scheduledHours: 0, finer: 0, unscheduledHours: 0 }, 'day')).toBe(
      'Nothing to place',
    )
    // The week gave no number, so nobody can say whether any is LEFT — which is why this one may
    // never read "All on days".
    expect(
      planning.stateOfSpread({ plannedHours: null, scheduledHours: 2, finer: 1, unscheduledHours: null }, 'day'),
    ).toBe('Partly on days')
    expect(
      planning.stateOfSpread({ plannedHours: null, scheduledHours: 0, finer: 0, unscheduledHours: null }, 'day'),
    ).toBe('Needs a day')
  })

  it('names what a kept time phrase is waiting on, and tells the two missing halves apart', () => {
    expect(planning.stateOfKeptWords({ period: null, recordId: 'rec-1' })).toBe('Not placed yet')
    expect(planning.stateOfKeptWords({ period: '2026-W34', recordId: null })).toBe('Names no work')
    expect(planning.stateOfKeptWords({ period: '2026-W34', recordId: 'rec-1' })).toBe('Ready to schedule')
  })
})

// ============================================================================ 6 — the rows got simpler

/** One allocation with the work it names, only the fields these surfaces read. */
function entry(hours: number | null, over: Partial<AllocatedWork> = {}): AllocationWithWork {
  return {
    allocation: {
      id: `alloc-${over.id ?? 'a'}`,
      horizon: 'week',
      period: WEEK,
      recordId: over.id ?? 'rec-1',
      plannedHours: hours,
      actualHours: null,
      state: 'planned',
      note: null,
      fromPlanLine: null,
      createdAt: '2026-08-17 09:00:00',
      updatedAt: '2026-08-17 09:00:00',
      createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    },
    work: work(over),
  } as AllocationWithWork

}

const rows = (entries: AllocationWithWork[], editing = false): string =>
  renderToStaticMarkup(
    h(planning.PlanRows, { entries, unit: 'week', editing, onWrote: () => {} }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

describe('a scheduled row says less, and nothing it says is guesswork', () => {
  it('draws nothing at all where nobody has said how many hours', () => {
    // The row draws no phrase such as "no hours yet" where it would not help the person make a
    // decision. docs/UX-CONTRACT.md lists that exact phrase under "say nothing".
    const markup = rows([entry(null)])
    expect(markup).not.toContain('no hours yet')
  })

  it('still prints the number when there is one', () => {
    expect(rows([entry(4)])).toContain('4h')
  })

  it('offers one press for Done on the row, with the three-way control no longer beside it', () => {
    // MEASURED WHERE IT MATTERS: the row itself, which is everything before the menu opens. The
    // three outcome words still exist and are still reachable — they are inside the shut menu, and
    // the next test is about that. What changed is that an unfinished row no longer carries a
    // pressed button reading "not yet". An unfinished row stays in its normal state.
    const markup = rows([entry(4)])
    const onTheRow = markup.slice(0, markup.indexOf('<details'))
    expect(onTheRow, 'the row does not offer Done at all').toContain('>Done<')
    expect(onTheRow, 'the three-way control is still on the row beside Done').not.toContain('>not yet<')
    expect(onTheRow).not.toContain('didn’t happen')
  })

  it('keeps the exceptional outcome reachable, in the menu, named for the hours it is about', () => {
    const markup = rows([entry(4)])
    expect(markup).toContain('didn’t happen')
    expect(markup).toContain('What became of this week’s hours')
  })

  it('leaves the row menu there while the period is being read, because those are presses', () => {
    // Taking the row off the period is planning and stays behind Edit; saying what became of the
    // hours records one fact and is allowed while reading, exactly as it always was.
    const reading = rows([entry(4)], false)
    expect(reading).toContain('<summary')
    expect(reading).not.toContain('Take off this week')
    expect(rows([entry(4)], true)).toContain('Take off this week')
  })

  it('drops the kind and the resting state word from a scheduled row', () => {
    // The current work row carries too much: the kind and the resting state word are dropped.
    const markup = rows([entry(4, { kind: 'task', state: 'todo' })])
    expect(markup).not.toContain('>task<')
    expect(markup).not.toContain('>todo<')
    // The estimate stays, and so does the project, which on a page spanning
    // several is the difference between a week and a merge.
    expect(markup).toContain('est 8h')
    // 7FEOshq3mBGG: the registry has not answered during this static render.
    expect(markup).not.toContain('robotics')
    expect(markup).toContain('Project name unavailable')
  })

  it('keeps a state that says the work STOPPED SHORT, because that is the one a person acts on', () => {
    expect(rows([entry(4, { state: 'blocked' })])).toContain('blocked')
  })

  it('draws a finished piece of work as finished, off the record and not off the slice', () => {
    // It used to strike the name when the SLICE was done, which told a person the task was over
    // when five of its hours had been used up.
    expect(rows([entry(4, { state: 'done' })])).toContain('px-pl-donerow')
    expect(rows([entry(4, { state: 'todo' })])).not.toContain('px-pl-donerow')
  })

  it('draws no Done at all for a kind that records no finishing, and says where the answer lives', () => {
    const markup = rows([entry(4, { kind: 'direction', state: null })])
    expect(markup).not.toContain('>Done<')
    expect(markup).toContain('does not record being finished')
  })
})

// ============================================================================ 7 — what the week draws

/** The smallest plan reply a week surface will draw, with only the fields it reads. */
function weekReply(entries: AllocationWithWork[] = []): PlanReply {
  return {
    horizon: 'week',
    period: WEEK,
    from: '2026-08-17',
    to: '2026-08-23',
    entries,
    capacity: null,
    fit: {
      load: {
        allocations: entries.length,
        stated: entries.filter((e) => e.allocation.plannedHours !== null).length,
        plannedHours: 0,
        rowHours: 0,
        actualHours: 0,
        envelopes: null,
      },
      capacityHours: null,
      freeHours: null,
      overcommitted: null,
      unstated: 0,
    },
    finer: null,
    spread: null,
    alsoNamed: [],
    allocatableKinds: ALLOCATABLE_KINDS,
    note: '',
  } as unknown as PlanReply
}

const weekMarkup = (editing: boolean): string =>
  renderToStaticMarkup(
    h(planning.WeekBuild, {
      reply: weekReply(),
      said: planning.periodSaid(WEEK, null),
      wrote: 0,
      editing,
      todayDay: '2026-08-19',
      onWrote: () => {},
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

describe('the board is the middle of the page and the backlog is behind a press', () => {
  // CRITERION CHANGE (wave 13j round 12). It read: the board is drawn above the hours, because the
  // schedule is the visual centre of the page. Wave 13k's proposal for this page, report n9Mjk3c_sJRu
  // block b-13, put the hours first, then the week as seven columns. So the
  // hours are above the board now.
  it('draws the hours above the board', () => {
    const markup = weekMarkup(false)
    const board = markup.indexOf(planning.BOARD_TITLE)
    const hours = markup.indexOf('Hours on this week')
    expect(board, 'the board is not on the week at all').toBeGreaterThan(-1)
    expect(hours, 'the hours panel is not on the week at all').toBeGreaterThan(-1)
    expect(hours, 'the board is drawn above the hours').toBeLessThan(board)
  })

  it('names the hours panel for what is in it, not with a pronoun pointing out of it', () => {
    expect(weekMarkup(false)).not.toContain('What is on it')
  })

  it('puts the whole work list behind a press, and drops the heading that said nothing', () => {
    // "Do not make Anything else / the entire 244-record corpus dominate the normal Schedule page."
    const markup = weekMarkup(true)
    // THE WHOLE TAG, not the class name on its own. Asserted loosely, this passed with the fold
    // taken away entirely — the body it leaves behind is class "px-pl-drawerbody", which contains
    // the four words of the looser assertion. Measured by removing the fold on 18 August 2026 and
    // watching nothing go red.
    expect(markup).toContain(
      '<details class="px-pl-drawer"><summary class="px-btn px-pl-drawersum">' +
        '<span class="px-pl-drawermark" aria-hidden="true"></span>Find work to give hours to</summary>',
    )
    expect(markup).not.toContain('Anything else')
  })

  /**
   * THE DRAWER LOOKS LIKE THE PRESS IT IS, AND THREE TESTERS SAID IT DID NOT.
   *
   * One lost a minute looking for the way to add work to a week and another never found the drawer
   * at all. It was quiet grey text in a thin outline: everything about the drawing said label. The
   * button class is borrowed from ui.tsx rather than restated, so this asserts the borrowing.
   */
  it('draws the drawer as a button with a mark saying it opens', () => {
    const markup = weekMarkup(true)
    expect(markup, 'the summary is not drawn as a button').toContain('<summary class="px-btn px-pl-drawersum">')
    expect(markup, 'nothing on the control says it unfolds').toContain(
      '<span class="px-pl-drawermark" aria-hidden="true">',
    )
  })
})

// ============================================================================ 8 — where a block went

/**
 * A BLOCK THAT LEAVES THE WEEK SAYS WHERE IT WENT.
 *
 * A tester stretched a block and moved it right until it crossed Sunday. The board said "Nothing is
 * placed across this week yet." and the work was on the next week, correct and invisible. What is
 * checked here is the sentence: it names the work, it names the week against the week on screen, and
 * it hands back the period key the way to follow it is built from. Whether it is DRAWN, and whether
 * focus lands on it, is a browser question and lives in tests/schedule-board-keyboard.test.ts.
 */
describe('a block that leaves the week says where it went', () => {
  const somewhere = { startsOn: '2026-08-19', endsOn: '2026-08-20' }

  it('says nothing at all while the block is still on this week', () => {
    // Including one that only overlaps it. The board still draws it, so there is nothing to explain.
    expect(planning.wentOffTheWeek(WEEK, somewhere, 'Test gripper')).toBeNull()
    expect(planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-14', endsOn: '2026-08-17' }, 'Test gripper')).toBeNull()
    expect(planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-23', endsOn: '2026-08-29' }, 'Test gripper')).toBeNull()
  })

  it('names the work and the week after this one, and hands back that week', () => {
    const said = planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-24', endsOn: '2026-08-25' }, 'Test gripper')
    expect(said).not.toBeNull()
    expect(said?.said).toBe('Test gripper is now on the week after this one, 24 – 30 August 2026.')
    expect(said?.period).toBe('2026-W35')
  })

  it('names the week before this one when a block goes back past Monday', () => {
    const said = planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-16', endsOn: '2026-08-16' }, 'Test gripper')
    expect(said?.said).toBe('Test gripper is now on the week before this one, 10 – 16 August 2026.')
    expect(said?.period).toBe('2026-W33')
  })

  it('never says "next week", because this board is not told what day it is', () => {
    // "Next week" is a claim about today. The schedule can be opened on any week, and a sentence
    // that called 2026-W35 "next week" while somebody was reading October would be false.
    const said = planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-24', endsOn: '2026-08-24' }, 'Test gripper')
    expect(said?.said).not.toContain('next week')
    expect(said?.said).not.toContain('last week')
  })

  it('still says where it went when the record the block named is gone', () => {
    const said = planning.wentOffTheWeek(WEEK, { startsOn: '2026-08-24', endsOn: '2026-08-24' }, null)
    expect(said?.said).toBe('That block is now on the week after this one, 24 – 30 August 2026.')
  })

  it('names a week further off by its own name rather than pretending it is the one next door', () => {
    const said = planning.wentOffTheWeek(WEEK, { startsOn: '2026-09-08', endsOn: '2026-09-08' }, 'Test gripper')
    expect(said?.said).toBe('Test gripper is now on Week of 7 September, 7 – 13 September 2026.')
    expect(said?.period).toBe('2026-W37')
  })
})

// ============================================================================ 9 — what the board may draw

/**
 * THE BOARD DRAWS THE LAST ANSWER IT HAS, AND ONLY WHILE IT IS ABOUT THE DAYS ON SCREEN.
 *
 * The board keeps the answer it already has while the next one is in flight, because going back to
 * a loading state on every write took the whole board — and the focused block with it — off the
 * screen. That keeping has one danger, and this is it: an answer about ANOTHER week must never be
 * drawn under this week's headings. So the answer carries the days it was asked about and is only
 * handed back while those are the days being drawn.
 */
describe('the board draws the last answer it has, and never another week', () => {
  const answer = (from: string, to: string) => ({ from, to, windows: [], note: '' })

  it('hands back an answer about exactly these days', () => {
    const held = answer('2026-08-17', '2026-08-23')
    expect(planning.boardAnswerFor(held as never, DAYS)).toBe(held)
  })

  it('refuses an answer about another week, so last week cannot be drawn under this week', () => {
    expect(planning.boardAnswerFor(answer('2026-08-10', '2026-08-16') as never, DAYS)).toBeNull()
    expect(planning.boardAnswerFor(answer('2026-08-24', '2026-08-30') as never, DAYS)).toBeNull()
  })

  it('answers null when nobody has read anything yet, which is not an empty week', () => {
    // The caller draws its loading state for this. A week nobody has looked at and a week with
    // nothing on it are two different facts and the board says them differently.
    expect(planning.boardAnswerFor(null, DAYS)).toBeNull()
    expect(planning.boardAnswerFor(answer('2026-08-17', '2026-08-23') as never, [])).toBeNull()
  })
})

// ============================================================================ 10 — the note at rest

/**
 * A SCHEDULED BLOCK HAS AN OBVIOUS PLACE TO LEAVE A NOTE, AND YOU DO NOT HAVE TO PRESS EDIT FIRST.
 *
 * A scheduled task must have an obvious, light place for this kind of note, not a separate
 * technical record page. The box existed
 * and was drawn only while the address ended in /edit — so with nothing written and the week being
 * read, NOTHING was drawn, and a tester concluded a block had nowhere to keep a note and wrote
 * theirs into the record's summary instead.
 *
 * WHAT IS CHECKED HERE IS THE RESTING STATE OF THE PANEL: a press and no box. The page's rule is
 * that reading draws no fields, and `tests/read-before-edit.test.ts` counts that in a browser, so
 * this asserts both halves — the press is there AND the box is not.
 */
describe('the note on a block, while the week is being read', () => {
  const openBlock = (over: Record<string, unknown>) =>
    renderToStaticMarkup(
      h(planning.OpenBlock as never, {
        block: {
          window: {
            id: 'win-1',
            recordId: 'rec-1',
            startsOn: '2026-08-19',
            endsOn: '2026-08-20',
            note: null,
            state: 'planned',
            createdAt: '2026-08-17 09:00:00',
            updatedAt: '2026-08-17 09:00:00',
          },
          work: work(),
          place: { from: 3, to: 4, startsBefore: false, endsAfter: false },
          lane: 0,
        },
        editing: false,
        busy: false,
        failed: null,
        onMove: () => {},
        onStretch: () => {},
        onNote: () => {},
        onState: () => {},
        onRemove: () => {},
        onWrote: () => {},
        ...over,
      } as never),
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  const withNote = (note: string | null, over: Record<string, unknown> = {}) => {
    const block = {
      window: {
        id: 'win-1',
        recordId: 'rec-1',
        startsOn: '2026-08-19',
        endsOn: '2026-08-20',
        note,
        state: 'planned',
        createdAt: '2026-08-17 09:00:00',
        updatedAt: '2026-08-17 09:00:00',
      },
      work: work(),
      place: { from: 3, to: 4, startsBefore: false, endsAfter: false },
      lane: 0,
    }
    return openBlock({ block, ...over })
  }

  it('offers a press to write one, with nothing written and the week being read', () => {
    const markup = openBlock({})
    expect(markup, 'a block with no note offers no way to write one while the week is read').toContain('Add a note')
  })

  it('draws no box until that press is made, because reading is the resting state', () => {
    // The page's rule, and the reason this is a press and not a box. A field here would be counted
    // by tests/read-before-edit.test.ts, which opens the schedule in a browser and allows none.
    expect(openBlock({})).not.toContain('<textarea')
  })

  it('still draws the box straight away while the week is being edited', () => {
    // Nothing was taken away from the editing view. It draws boxes because that is what it is for.
    expect(openBlock({ editing: true })).toContain('<textarea')
  })

  it('shows a note that is there, and offers the press that changes it', () => {
    const markup = withNote('Grip starts slipping above 15N; recalibrate before the next test.')
    expect(markup).toContain('Grip starts slipping above 15N; recalibrate before the next test.')
    expect(markup, 'a note can be read but not corrected without pressing Edit').toContain('Change this note')
    expect(markup).not.toContain('<textarea')
  })

  it('keeps the note as the words an agent can be asked about, with nothing else in that element', () => {
    // The server finds quoted words by counting characters into the window's stored `note`, so the
    // element carrying that mark holds the note and no label, no press and no punctuation of its own.
    const markup = withNote('Grip starts slipping above 15N.')
    expect(markup).toContain(
      '<p class="px-pl-opennoteread" data-text-field="note" data-text-offset="0">Grip starts slipping above 15N.</p>',
    )
  })
})
