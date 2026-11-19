// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCHEDULE PAGE ITSELF: src/web/pages/PlanPage.tsx.
 *
 * WHAT IS TESTED HERE AND WHY IT IS SO SMALL. The panels are tested in
 * tests/planning-surfaces.test.ts, and whether the page reads or edits is tested by driving the
 * real browser in tests/read-before-edit.test.ts. What is left is one decision this page makes on
 * its own: which reply is on the screen while the next one is in flight.
 *
 * That decision could quietly make the page lie — a kept reply drawn under another period's heading
 * would be last week's rows presented as this week's — so it is a pure function and it is pinned
 * here.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PlanReply } from '../src/server/api/planning.ts'

type PlanPageModule = typeof import('../src/web/pages/PlanPage.tsx')
let page: PlanPageModule

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
})

/** Only the field this decision reads. The panels get the whole reply; this function gets one word. */
const reply = (period: string): PlanReply => ({ period }) as PlanReply

describe('which period is on the screen while the next reply is in flight', () => {
  it('keeps the period up during a re-read, so a write does not throw the page away', () => {
    // Every write re-reads, and `useAsync` goes back to loading while it does. That used to unmount
    // the whole panel, which threw away the words typed to find the work being added.
    const kept = reply('2026-W33')
    expect(page.periodShown({ status: 'loading' }, kept, '2026-W33')).toBe(kept)
  })

  it('never draws one period’s numbers under another period’s heading', () => {
    // Pressing "next week" changes the address, and the kept reply is still last week's. Drawn, it
    // would be last week's rows presented as this week's.
    expect(page.periodShown({ status: 'loading' }, reply('2026-W33'), '2026-W34')).toBeNull()
  })

  it('drops what it kept when the re-read fails, rather than leaving a stale week looking current', () => {
    expect(page.periodShown({ status: 'error', message: 'the server said no' }, reply('2026-W33'), '2026-W33')).toBeNull()
  })

  it('shows the reply that arrived, whatever was kept', () => {
    const fresh = reply('2026-W34')
    expect(page.periodShown({ status: 'ready', value: fresh }, reply('2026-W33'), '2026-W34')).toBe(fresh)
    // A ready reply of null is `#/plan/today` before the server has said what day it is. Nothing is
    // known yet, and the kept week must not stand in for it.
    expect(page.periodShown({ status: 'ready', value: null }, reply('2026-W33'), null)).toBeNull()
  })
})

// ============================================================================ what the page is called

/**
 * THE PAGE'S OWN NAME, AND WHERE IT COMES FROM.
 *
 * The schedule named the PERIOD and never itself: the rail said "Schedule" and the content area
 * said "This week", so the one page a person opens every week was the only one that did not say
 * which room they were in. The audit that measured every route named it as this page's biggest
 * single fix.
 *
 * The name is read out of the rail row that opens the page, so there is one string. This test
 * reads it from the same place rather than typing "Schedule", which would put the name in a third.
 */
describe('the page says what it is', () => {
  const strip = (markup: string): string => markup.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')

  it('heads itself with the words the rail row uses, at the top of the content', async () => {
    const S = await import('../src/web/components/Sidebar.tsx')
    const markup = strip(
      renderToStaticMarkup(
        h(page.PlanHead, { period: '2026-W33', todayDay: '2026-08-13', editing: false, here: '/plan/2026-W33' }),
      ),
    )
    expect(markup, 'the page draws no heading of its own, so nothing on it says where you are').toContain(
      `<h1 class="px-plan-page" data-title-is="its-label">${S.pageTitle('plan')}</h1>`,
    )
  })

  // CRITERION CHANGE (wave 13j round 12). It read: the period is an h2 of class px-plan-name in the
  // period bar. The owner adopted the shared page head, rule R9 of report n9Mjk3c_sJRu, block b-3:
  // a title and ONE LINE under it. So the period is said in that line, under
  // the title, and the control row below holds only controls.
  it('says the period in the one line under the title, and not as the page’s name', async () => {
    const planning = await import('../src/web/components/Planning.tsx')
    const said = planning.periodSaid('2026-W33', { day: '2026-08-13', week: '2026-W33', month: '2026-08' })
    const markup = strip(
      renderToStaticMarkup(h(page.PlanHead, { period: '2026-W33', said, editing: false, here: '/plan/2026-W33' })),
    )
    const line = /<p class="px-plan-line">([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? ''
    expect(line, 'the head draws no line under its title').not.toBe('')
    expect(line).toContain('This week')
    // And what it covers stays with it, in words. The stored key is Inspect's (plan 7FEOshq3mBGG),
    // and tests/no-stored-week-key-in-normal.test.ts holds that.
    expect(line).toContain('10 – 16 August 2026')
    expect(markup.indexOf('<h1'), 'the line is not under the title').toBeLessThan(markup.indexOf('px-plan-line'))
    const bar = strip(renderToStaticMarkup(h(page.PeriodBar, { period: '2026-W33', said, todayDay: '2026-08-13' })))
    expect(bar, 'the control row draws a heading again').not.toMatch(/<h[1-6]/)
  })
})
