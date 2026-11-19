// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SCHEDULE ON HOME, AS A WEEK. Seven days from today, today first and lit, each day with its entries. The
 * entries come from the door the schedule page reads (GET /api/planning/day/<day>). An entry carries no
 * time of day, so none is drawn. "Open the schedule" opens the schedule page. A day with nothing planned
 * draws nothing after its heading. A day whose reading did not answer says so, and is never drawn as a day
 * with nothing on it.
 *
 * The runner's environment is node, so the week is rendered to static markup, with a window stand-in
 * installed before anything that reads it is loaded, as tests/home-bands.test.ts does.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'

type Week = typeof import('../src/web/components/home/HomeWeek.tsx')
type Router = typeof import('../src/web/components/router.tsx')
let week: Week
let router: Router

beforeAll(async () => {
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
  week = await import('../src/web/components/home/HomeWeek.tsx')
  router = await import('../src/web/components/router.tsx')
})

const TODAY = '2026-11-13'

function entry(id: string, name: string | null) {
  return {
    allocation: { id: `made-up-allocation-${id}`, horizon: 'day', period: TODAY, recordId: `made-up-work-${id}`, plannedHours: null, actualHours: null, state: 'planned', note: null, createdAt: '2026-11-12 10:00:00', updatedAt: '2026-11-12 10:00:00' },
    work: name === null ? null : { id: `made-up-work-${id}`, kind: 'task', title: name, name, within: null, workspaceId: 'default', state: null, effortHours: null, origin: null, deleted: false },
  }
}
function plan(day: string, entries: ReturnType<typeof entry>[]) {
  return { status: 'ready' as const, value: { horizon: 'day', period: day, from: day, to: day, entries } }
}

function draw(days: { day: string; plan: unknown }[]): string {
  return renderToStaticMarkup(h(week.HomeWeekDays, { today: TODAY, days: days as never, projectName: (id: string) => `Made-up project ${id}` }))
}

/** The markup of one day, from its own mark to the next day's. */
function dayOf(html: string, day: string): string {
  const start = html.indexOf(`data-home-day="${day}"`)
  expect(start, `no day ${day}`).toBeGreaterThanOrEqual(0)
  const next = html.indexOf('data-home-day="', start + 1)
  return html.slice(start, next === -1 ? undefined : next)
}

/** What a day draws after its heading, up to the end of the day. */
function underTheHeading(day: string): string {
  return day.slice(day.indexOf('</h3>') + '</h3>'.length, day.lastIndexOf('</li>'))
}

describe('the seven days', () => {
  it('runs seven days from today, today first, across the end of a month, a year and a change of the clocks', () => {
    expect(week.sevenDaysFrom(TODAY)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'])
    expect(week.sevenDaysFrom('2026-11-28')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'])
    expect(week.sevenDaysFrom('2026-12-29')).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'])
    expect(week.sevenDaysFrom('2026-10-24')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
  })
})

describe('the drawing', () => {
  it('draws seven days in order with today first and lit, an entry on its own day with no time, and nothing beside an empty day', () => {
    const days = week.sevenDaysFrom(TODAY).map(day => ({ day, plan: plan(day, day === '2026-11-15' ? [entry('one', 'Made-up entry on the third day')] : []) }))
    const html = draw(days)
    const drawn = [...html.matchAll(/data-home-day="([^"]+)"/g)].map(one => one[1])
    expect(drawn).toEqual(week.sevenDaysFrom(TODAY))
    expect(dayOf(html, TODAY)).toContain('data-today="true"')
    for (const day of drawn.slice(1)) expect(dayOf(html, day!)).not.toContain('data-today')

    const third = dayOf(html, '2026-11-15')
    expect(third).toContain('Made-up entry on the third day')
    expect(third).toContain('data-home-entry')
    for (const day of drawn.filter(one => one !== '2026-11-15')) {
      expect(dayOf(html, day!)).not.toContain('Made-up entry on the third day')
      expect(underTheHeading(dayOf(html, day!)), `${day!} draws something beside its heading`).toBe('')
    }
    // The entry has no time of day, so none is drawn.
    expect(third).not.toContain('data-home-entry-time')
    expect(third.replace(/<[^>]*>/g, ' ')).not.toMatch(/\b\d{1,2}:\d{2}\b/)
  })

  it('says a day whose reading did not answer, never that it holds nothing, and says a gone piece of work', () => {
    const days = week.sevenDaysFrom(TODAY).map((day, n) => ({
      day,
      plan: n === 1 ? { status: 'error', message: 'made-up failure' } : n === 2 ? { status: 'loading' } : plan(day, n === 3 ? [entry('gone', null)] : []),
    }))
    const html = draw(days)
    const failed = dayOf(html, '2026-11-14')
    expect(failed).toContain(t('home.week.unread'))
    expect(dayOf(html, '2026-11-15')).toContain(t('home.week.reading'))
    expect(dayOf(html, '2026-11-16')).toContain(t('schedule.gone'))
  })

  it('opens the schedule page from "Open the schedule"', () => {
    const html = draw(week.sevenDaysFrom(TODAY).map(day => ({ day, plan: plan(day, []) })))
    expect(html).toMatch(new RegExp(`href="#${router.pathFor('plan')}"[^>]*>${t('home.openTheSchedule')}<`))
  })
})
