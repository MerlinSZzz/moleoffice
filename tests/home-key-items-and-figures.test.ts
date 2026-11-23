// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S KEY ITEMS AND ITS FIGURES, AS THEY ARE DRAWN. Home shows each open key item of the projects shown with its title,
 * its progress and where that came from, and its estimate of the time left, marked as an estimate with who made it and
 * when. With every project shown, each item names its project. Each of home's figures is one data entry whose answer is
 * shaped for one picture part, and a figure nobody recorded is drawn as not recorded, never as a zero.
 *
 * The runner's environment is node, so the parts are rendered to static markup, with a window stand-in installed before
 * anything that reads it is loaded, as tests/picture-parts.test.ts does. The reads behind the figures are proved by
 * tests/home-figures-my-decisions.test.ts and tests/the-office-reads-the-four-figures-home-lacks.test.ts.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage, t, writtenMoment } from '../src/shared/i18n.ts'
import type { KeyItemRead, TheKeyItems } from '../src/shared/key-items.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type KeyItems = typeof import('../src/web/components/home/HomeKeyItems.tsx')
type Figures = typeof import('../src/web/components/home/HomeFigures.tsx')
let keyItems: KeyItems
let figures: Figures

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
  setWordLanguage('en')
  keyItems = await import('../src/web/components/home/HomeKeyItems.tsx')
  figures = await import('../src/web/components/home/HomeFigures.tsx')
})

/** Words as the static markup writes them. */
const escaped = (words: string) => words.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

const ONE = { id: 'made-up-project-one', title: 'Made-up project one' }
const TWO = { id: 'made-up-project-two', title: 'Made-up project two' }
const SET_AT = '2026-11-10 09:30:00'
const ESTIMATED_AT = '2026-11-11 14:00:00'

/** A made-up key item, open, with the progress and estimate given. */
function anItem(id: string, project: { id: string; title: string | null }, progress: KeyItemRead['progress'], estimate: KeyItemRead['estimate']): KeyItemRead {
  return { id, title: `Made-up key item ${id}`, project, state: 'open', place: 1, packages: [], progress, estimate }
}

const COUNTED = anItem('a', ONE, { from: 'packages', done: 3, of: 4, percent: 75, packages: [] }, {
  state: 'estimated', hoursLeft: 30, days: 1, hours: 6, estimatedBy: { kind: 'person', id: THE_PERSON, handle: null }, estimatedAt: ESTIMATED_AT,
})
const SET = anItem('b', TWO, { from: 'set', percent: 40, setBy: { kind: 'agent', id: 'made-up-secretary', handle: 'made-up-secretary' }, setAt: SET_AT }, { state: 'not-estimated' })
const NOT_SET = anItem('c', TWO, { from: 'not-set' }, {
  state: 'estimated', hoursLeft: 5, days: 0, hours: 5, estimatedBy: { kind: 'agent', id: 'made-up-agent', handle: null }, estimatedAt: ESTIMATED_AT,
})

const ready = (items: KeyItemRead[]): { status: 'ready'; value: TheKeyItems } => ({ status: 'ready', value: { projects: 'every', state: 'open', items } })

describe('the key items on home', () => {
  it('draws each key item of two projects in its order, with its title, its project, its progress and its estimate', () => {
    const markup = renderToStaticMarkup(h(keyItems.KeyItemsList, { reading: ready([COUNTED, SET, NOT_SET]), every: true }))
    expect(markup).toContain(escaped(t('home.keyItems.title')))
    const order = [COUNTED, SET, NOT_SET].map((item) => markup.indexOf(`data-home-key-item="${item.id}"`))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    for (const item of [COUNTED, SET, NOT_SET]) expect(markup).toContain(escaped(item.title))
    expect(markup).toContain(`data-home-key-item-project="${ONE.id}"`)
    expect(markup).toContain(`data-home-key-item-project="${TWO.id}"`)
    expect(markup).toContain(escaped(ONE.title))
    expect(markup).toContain(escaped(TWO.title))
    expect(markup).toContain(escaped(t('home.keyItems.fromPackages')))
    expect(markup).toContain(escaped(keyItems.keyItemEstimate(COUNTED)))
    expect(markup).toContain(escaped(keyItems.keyItemProgress(SET).label))
    expect(markup).toContain(escaped(t('home.keyItems.notEstimated')))
  })

  it('names no project when one project is shown', () => {
    const markup = renderToStaticMarkup(h(keyItems.KeyItemsList, { reading: ready([COUNTED]), every: false }))
    expect(markup).toContain('data-home-key-item="a"')
    expect(markup).not.toContain('data-home-key-item-project')
  })

  it('says no key item is kept and how one is added, when there is none', () => {
    const markup = renderToStaticMarkup(h(keyItems.KeyItemsList, { reading: ready([]), every: true }))
    expect(markup).toContain('data-home-key-items-none')
    expect(markup).toContain(escaped(t('home.keyItems.none')))
    expect(markup).toContain(escaped(t('home.keyItems.howToAdd')))
    expect(markup).not.toContain('data-home-key-item=')
  })

  it('says where each progress came from: counted from packages, set with who and when, or set by nobody and not a zero', () => {
    expect(keyItems.keyItemProgress(COUNTED)).toEqual({ label: t('home.keyItems.fromPackages'), state: { status: 'ready', data: { done: 3, total: 4 } } })
    const noPoints = anItem('d', ONE, { from: 'packages', done: 0, of: 0, percent: null, packages: [] }, { state: 'not-estimated' })
    expect(keyItems.keyItemProgress(noPoints).state).toEqual({ status: 'not-recorded' })
    expect(keyItems.keyItemProgress(SET)).toEqual({
      label: t('home.keyItems.setBy', { percent: 40, who: 'made-up-secretary', when: writtenMoment(SET_AT) }),
      state: { status: 'ready', data: { done: 40, total: 100 } },
    })
    expect(keyItems.keyItemProgress(NOT_SET)).toEqual({ label: t('home.keyItems.notSet'), state: { status: 'not-recorded' } })
  })

  it('marks each estimate as an estimate, with who made it and when', () => {
    expect(keyItems.keyItemEstimate(COUNTED)).toBe(t('home.keyItems.estimate', { days: 1, hours: 6, who: t('home.keyItems.you'), when: writtenMoment(ESTIMATED_AT) }))
    expect(keyItems.keyItemEstimate(NOT_SET)).toBe(t('home.keyItems.estimate', { days: 0, hours: 5, who: t('home.keyItems.anAgent'), when: writtenMoment(ESTIMATED_AT) }))
    expect(keyItems.keyItemEstimate(SET)).toBe(t('home.keyItems.notEstimated'))
    expect(keyItems.whoInWords({ kind: 'person', id: 'made-up-person', handle: null })).toBe(t('home.keyItems.aPerson'))
  })
})

describe('home\'s figures, each one entry shaped for one part', () => {
  it('counts his open checklist items over every checklist read', () => {
    const reply = { checklists: [{ counts: { open: 3 } }, { counts: { open: 0 } }, { counts: { open: 2 } }] } as unknown as Parameters<typeof figures.MY_CHECKLIST.shape>[0]
    expect(figures.MY_CHECKLIST.shape(reply)).toEqual({ status: 'ready', data: { value: 5, unit: t('home.figure.openItems') } })
    expect(figures.MY_CHECKLIST.part).toBe('big-number')
  })

  it('counts his decisions, and draws the time a decision waits on him as hours per day, or not recorded when he settled none', () => {
    const decisions = {
      projects: [ONE.id, TWO.id], from: '2026-11-02', to: '2026-11-03', timeZone: 'UTC', settled: 3, averageMinutes: 70, notTimed: 0, cut: false, says: '',
      days: [{ day: '2026-11-02', settled: 2, averageMinutes: 75 }, { day: '2026-11-03', settled: 0, averageMinutes: null }],
    }
    expect(figures.MY_DECISIONS.shape(decisions)).toEqual({ status: 'ready', data: { value: 3, unit: t('home.figure.forksSettled') } })
    expect(figures.MY_DECISION_TIME.part).toBe('line-over-days')
    expect(figures.MY_DECISION_TIME.shape(decisions)).toEqual({
      status: 'ready', data: { points: [{ day: '2026-11-02', value: 1.3 }, { day: '2026-11-03', value: null }] },
    })
    expect(figures.MY_DECISION_TIME.shape({ ...decisions, settled: 0, averageMinutes: null })).toEqual({ status: 'not-recorded' })
  })

  it('draws the packages of each line with the no-line row in words, and the suite\'s time as not recorded when no run was timed', () => {
    const byLine = { lines: [{ line: 'made-up-line', total: 4 }, { line: null, total: 1 }] } as unknown as Parameters<typeof figures.PACKAGES_BY_LINE.shape>[0]
    expect(figures.PACKAGES_BY_LINE.shape(byLine)).toEqual({
      status: 'ready', data: { columns: [t('home.figure.line'), t('home.figure.packages')], rows: [['made-up-line', 4], [t('home.figure.noLine'), 1]] },
    })
    const suite = (minutes: number | null) => ({ median: { minutes, over: minutes === null ? 0 : 2 } }) as unknown as Parameters<typeof figures.SUITE_MINUTES.shape>[0]
    expect(figures.SUITE_MINUTES.shape(suite(null))).toEqual({ status: 'not-recorded' })
    expect(figures.SUITE_MINUTES.shape(suite(31.6))).toEqual({ status: 'ready', data: { value: 32, unit: t('home.figure.minutes') } })
  })
})
