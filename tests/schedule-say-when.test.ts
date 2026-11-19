// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SAYING WHEN YOU MEAN, ON THE SCHEDULE, WHERE IT CAN BE SEEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG AND WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * The schedule could already take a period in ordinary words — "next week", "Tuesday", "September"
 * — and the only way to reach it was a shut fold at the bottom of a panel headed "Another day, week
 * or month". A first-time user took forty seconds to find it and two never found it at all. What
 * they were looking at the whole time was the row of period controls: two arrows and Month, Week,
 * Day. The capability existed and its entry point was hidden, which the UX contract names as a
 * feature that is not done.
 *
 * So this file pins four things about the period controls:
 *
 *   1. writing the period in your own words is one of them, in the same group as the arrows and the
 *      three horizons, and not somewhere else on the page;
 *   2. none of the controls that were there before was taken away;
 *   3. the box still does not appear until somebody asks for it, because no page in Mole Office draws a
 *      box on a period you are only reading — `tests/read-before-edit.test.ts` counts them in a real
 *      browser, and this is the same rule checked here without one;
 *   4. what the box offers for a phrase is exactly what the one reader made of it, and never a
 *      nearby period it did not read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE READING IS TESTED THROUGH A PURE FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * What is in the box is the box's own state, so a static render cannot type into it. `whenSaid` is
 * the whole of the decision the box makes about what somebody typed, it is pure, and it is exported
 * for this — the same arrangement `periodShown` on that page already uses, and for the same reason:
 * the part that could quietly make the page lie is the part that can be checked without a browser.
 *
 * THE REFUSALS ARE COMPARED AGAINST THE READER ITSELF, never against a sentence typed in here. A
 * copy of the reader's words in a test is a second place the same fact is written, and it would go
 * on passing after the reader changed its mind.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { readPeriodWords, weekKey } from '../src/shared/planning.ts'

type PlanPageModule = typeof import('../src/web/pages/PlanPage.tsx')
type PlanningModule = typeof import('../src/web/components/Planning.tsx')
let page: PlanPageModule
let planning: PlanningModule

beforeAll(async () => {
  // PlanPage reaches src/web/api.ts, which reads window.localStorage at module scope to restore who
  // you are acting as. The smallest stand-in that lets the module load; nothing here is under test.
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
  page = await import('../src/web/pages/PlanPage.tsx')
  planning = await import('../src/web/components/Planning.tsx')
})

/** Monday 17 August 2026, so every phrase below reads against a day that is stated and not today's. */
const MONDAY = new Date(2026, 7, 17)

/**
 * What is INSIDE the element carrying this class, by walking the div tags and matching them up.
 *
 * WHY NOT WHERE THE STRINGS SIT IN THE MARKUP. This test first checked that the class names came
 * out in the right order, and moving the word box out of the period controls left that order
 * unchanged — so the assertion passed on the arrangement it exists to forbid. Measured by making
 * that exact change and watching nine tests stay green. Being inside is the claim, so being inside
 * is what is measured.
 */
function inside(markup: string, className: string): string {
  const opening = `<div class="${className}"`
  const at = markup.indexOf(opening)
  if (at === -1) throw new Error(`no element with class "${className}" was drawn at all`)
  const from = markup.indexOf('>', at) + 1
  let depth = 1
  let i = from
  while (depth > 0) {
    const open = markup.indexOf('<div', i)
    const close = markup.indexOf('</div>', i)
    if (close === -1) throw new Error(`the element with class "${className}" is never closed`)
    if (open !== -1 && open < close) {
      depth += 1
      i = open + 4
    } else {
      depth -= 1
      if (depth === 0) return markup.slice(from, close)
      i = close + 6
    }
  }
  return ''
}

/** The period bar as somebody sees it, reading or planning. Style blocks are not what is measured. */
function bar(editing: boolean): string {
  const said = planning.periodSaid('2026-W34', { day: '2026-08-17', week: '2026-W34', month: '2026-08' })
  const markup = renderToStaticMarkup(
    h(page.PeriodBar, { period: '2026-W34', said, todayDay: '2026-08-17', editing, now: MONDAY }),
  )
  return markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('writing a period in your own words is one of the period controls', () => {
  it('is offered on the period controls while the period is being read', () => {
    const markup = bar(false)
    expect(
      markup,
      'the period controls offer no way to write a period in words, so the arrows and the three ' +
        'horizons are the whole of what a reader can see again',
    ).toContain(page.SAY_WHEN_PRESS)
  })

  it('sits in the same group as the arrows and the three horizons, not elsewhere on the page', () => {
    for (const editing of [false, true]) {
      const group = inside(bar(editing), 'px-plan-nav')
      expect(
        group,
        'the Month / Week / Day control is not in the group that holds the period controls',
      ).toContain('px-plan-horizons')
      expect(
        group,
        'writing the period in words is drawn somewhere other than the period controls, which is ' +
          'the arrangement nobody could find',
      ).toContain(editing ? 'px-plan-when-box' : 'px-plan-when-open')
    }
  })

  it('opens as a box the moment the period is being planned', () => {
    const markup = bar(true)
    expect(markup, 'the box is not open while the period is being planned').toContain(
      'aria-label="a date or period, in your own words"',
    )
    expect(markup, 'the press is still drawn beside the open box').not.toContain(page.SAY_WHEN_PRESS)
  })

  it('draws no box on a period that is only being read, like every other page', () => {
    // The rule is the product's and it is checked in a browser by tests/read-before-edit.test.ts.
    // It is checked again here because this control is the one most likely to break it: it is a box
    // whose job — going somewhere — is reading, so it is the one somebody would leave open.
    const markup = bar(false)
    for (const tag of ['<input', '<select', '<textarea']) {
      expect(markup, `the period controls draw ${tag} on a period nobody has pressed Edit on`).not.toContain(tag)
    }
  })

  it('takes nothing away: the arrows and the three horizons are still there', () => {
    for (const editing of [false, true]) {
      const markup = bar(editing)
      for (const control of ['← previous', 'Month', 'Week', 'Day', 'next →']) {
        expect(markup, `"${control}" is gone from the period controls`).toContain(control)
      }
    }
  })
})

describe('the box promises only what the reader actually takes', () => {
  it('reads every example it shows', () => {
    for (const example of page.SAY_WHEN_EXAMPLES) {
      const read = readPeriodWords(example, MONDAY)
      expect(
        read.read,
        `the box offers "${example}" as an example and the reader takes nothing from it, so the ` +
          'placeholder promises something the box does not do',
      ).toBe(true)
    }
  })
})

describe('what the box offers for what somebody typed', () => {
  it('offers nothing at all for an empty box', () => {
    // Being handed nothing is not a failed reading, and answering it with the reader's complaint
    // about being handed nothing is noise on a control nobody has used yet.
    expect(page.whenSaid('', MONDAY)).toEqual({ offer: 'nothing' })
    expect(page.whenSaid('   ', MONDAY)).toEqual({ offer: 'nothing' })
  })

  it('offers the period it read, with the reader’s own sentence about it', () => {
    const offer = page.whenSaid('next week', MONDAY)
    expect(offer.offer).toBe('open')
    if (offer.offer !== 'open') return
    // The week after the Monday above, worked out by the same function the whole product uses.
    expect(offer.key).toBe(weekKey(new Date(2026, 7, 24)))
    const read = readPeriodWords('next week', MONDAY)
    expect(read.read && offer.how === read.how, 'the box writes a second sentence of its own').toBe(true)
  })

  it('offers nowhere to go when the reader read nothing, and says why in the reader’s words', () => {
    // Every one of these is a phrase a person really writes. None of them is a period, and the
    // failure this guards against is the box quietly offering the nearest one it could find.
    for (const phrase of [
      'sometime next week',
      'before Friday',
      'the first half of September',
      'around 1.5 maybe more',
      'when Sam is back',
    ]) {
      const offer = page.whenSaid(phrase, MONDAY)
      expect(offer.offer, `"${phrase}" was offered as somewhere to go`).toBe('none')
      if (offer.offer !== 'none') continue
      const read = readPeriodWords(phrase, MONDAY)
      expect(
        !read.read && offer.why === read.why,
        `the box explains "${phrase}" in words of its own instead of the reader's`,
      ).toBe(true)
    }
  })
})
