// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WORK TO DO, DESIGNED AGAIN: WHAT THE PAGE DRAWS, READ FROM ITS MARKUP.
 *
 * Report n9Mjk3c_sJRu block b-13, with two decisions and problem
 * IfJ_JmeZ-3vr. Each case below is one line of that design:
 *   - Late is drawn before All work, and holds only the work past its date that is not
 *     finished; when there is none it says "Nothing is late" in one quiet line. It was called
 *     "Needs you" until wave 13q's round 28, a name Home's waiting queue keeps (problem uyvrTRyshEJ6);
 *   - By level steps a part in once and never more, however deep it sits;
 *   - no sentence stands between the title and Late, and there is no fold-all bar;
 *   - a kind with no state field draws the short mark, not the words "No state field";
 *   - the page title reads the key its sidebar row reads, in English and in Chinese.
 * The switch and the fold are pressed in tests/work-to-do-in-the-browser.test.ts.
 *
 * Made-up projects and work only.
 */

import { checkSubtraction } from '../src/shared/disclosure.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkChainStep, WorkListReply, WorkRow } from '../src/server/lib/worklist.ts'
import { RAIL_WORD_KEYS } from '../src/shared/surfaces.ts'
import { setWordLanguage, t } from '../src/shared/i18n.ts'

type Page = typeof import('../src/web/pages/family/WorkPage.tsx')
let page: Page

beforeAll(async () => {
  // The page reaches src/web/api.ts and src/web/lib/mode.ts, both of which touch `window` when they
  // load. The smallest stand-in that lets them load; nothing here is under test.
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
  page = await import('../src/web/pages/family/WorkPage.tsx')
})

afterEach(() => {
  setWordLanguage('en')
})

/** Markup with the style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function row(over: Partial<WorkRow> = {}): WorkRow {
  seq += 1
  const title = over.title ?? `Chore ${String(seq)}`
  return {
    id: `c-${String(seq)}`,
    kind: 'task',
    title,
    name: title,
    within: null,
    summary: null,
    state: 'todo',
    workspaceId: 'orchard',
    above: [],
    aboveStopped: null,
    parentsInOtherProjects: [],
    estimateHours: null,
    hoursGiven: [],
    origin: 'authored',
    incompleteCount: 0,
    due: null,
    ...over,
  }
}

function step(over: Partial<WorkChainStep> = {}): WorkChainStep {
  return { id: 'p-1', title: 'Spring planting', kind: 'pipeline', workspaceId: 'orchard', via: 'pipeline order', position: 1, deleted: false, ...over }
}

/** Midday on 14 August 2026, local, so every date below is a fixed number of days from it. */
const NOW = new Date(2026, 7, 14, 12, 0, 0).getTime()

const PROJECTS = {
  workspaces: [
    { id: 'orchard', title: 'Hillside orchard', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
    { id: 'bakery', title: 'Riverside bakery', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
  ],
} as unknown as WorkspacesReply

function reply(rows: WorkRow[]): WorkListReply {
  const answer: WorkListReply = {
    rows,
    subtraction: { candidates: rows.length, carried: rows.length, leftOut: 0, shortened: 0 },
    leftOutGroups: [],
    counted: rows.length,
    returned: rows.length,
    cap: 2000,
    leftOut: 0,
    order: 'Rows are ordered by project.',
    kinds: ['obligation', 'task'],
    kindsBecause: 'Work here means the kinds under Work to do.',
    note: `${String(rows.length)} pieces of work.`,
  }
  checkSubtraction('work page fixture', answer.subtraction, answer.leftOutGroups)
  return answer
}

const list = (rows: WorkRow[], props: Record<string, unknown> = {}) =>
  body(h(page.WorkList, { reply: reply(rows), projects: PROJECTS, now: NOW, ...props }))

const owed = (title: string, date: string, over: Partial<WorkRow> = {}) =>
  row({ title, kind: 'obligation', state: 'open', due: { when: 'date', date }, ...over })

/** The markup of one section of the page, by its `data-section`. */
function section(html: string, name: 'late' | 'all-work'): string {
  const start = html.indexOf(`data-section="${name}"`)
  if (start < 0) return ''
  const open = html.lastIndexOf('<section', start)
  let depth = 0
  const tag = /<section\b|<\/section>/g
  tag.lastIndex = open
  for (let found = tag.exec(html); found !== null; found = tag.exec(html)) {
    depth += found[0] === '</section>' ? -1 : 1
    if (depth === 0) return html.slice(open, found.index + '</section>'.length)
  }
  return ''
}

describe('Late comes first, and holds only the work past its date that is not finished', () => {
  const rows = () => [
    row({ title: 'Order more mulch', state: 'todo' }),
    owed('Return the borrowed tiller', '2026-08-01'),
    owed('Send the soil samples', '2026-08-02', { state: 'fulfilled' }),
    owed('Pay the water bill', '2026-09-30'),
    owed('Renew the food licence', '2026-08-10', { workspaceId: 'bakery' }),
  ]

  it('draws Late before All work', () => {
    const html = list(rows())
    const needs = html.indexOf('data-section="late"')
    const all = html.indexOf('data-section="all-work"')
    expect(needs, 'there is no Late section').toBeGreaterThan(-1)
    expect(all, 'there is no All work section').toBeGreaterThan(-1)
    expect(needs, 'Late is drawn after All work').toBeLessThan(all)
    expect(section(html, 'late')).toContain('>Late<')
    expect(section(html, 'all-work')).toContain('>All work<')
  })

  it('holds the late unfinished work, most late first, with its project, and nothing else', () => {
    const needs = section(list(rows()), 'late')
    expect(needs).toContain('Return the borrowed tiller')
    expect(needs).toContain('Renew the food licence')
    expect(needs.indexOf('Return the borrowed tiller'), 'the latest is not first').toBeLessThan(needs.indexOf('Renew the food licence'))
    // Kept after its date: nobody is behind on it. Still to come: not late. No date: cannot be late.
    expect(needs).not.toContain('Send the soil samples')
    expect(needs).not.toContain('Pay the water bill')
    expect(needs).not.toContain('Order more mulch')
    // It mixes projects and has no project column, so each row names its project.
    expect(needs).toContain('Riverside bakery')
    expect(needs).toContain('Hillside orchard')
  })

  it('says "Nothing is late" in one quiet line when nothing is late', () => {
    const needs = section(list([row({ title: 'Order more mulch' }), owed('Pay the water bill', '2026-09-30')]), 'late')
    expect(needs).toContain('<p class="wk-quiet">Nothing is late</p>')
    expect(needs).not.toContain('wk-row')
  })
})

describe('By level steps a part in once, and never more', () => {
  it('draws every part at one step in, however deep it sits, and what sits under nothing at the margin', () => {
    const pipeline = step()
    const block = step({ id: 'b-1', title: 'Plant the saplings', kind: 'block', via: 'part of link', position: null })
    const task = step({ id: 't-1', title: 'Label every row', kind: 'task', via: 'part of link', position: null })
    const html = list([
      row({ id: 'b-1', title: 'Plant the saplings', kind: 'block', state: 'doing', above: [pipeline] }),
      row({ id: 't-1', title: 'Label every row', above: [pipeline, block] }),
      row({ id: 't-2', title: 'Tie each label twice', above: [pipeline, block, task] }),
      row({ id: 't-3', title: 'Order more mulch' }),
    ])
    const all = section(html, 'all-work')
    const steps = [...all.matchAll(/--wk-in:(\d+)/g)].map((found) => found[1])
    // The pipeline's heading and the task under nothing at the margin; the three parts one step in.
    expect(steps.length, 'no level was drawn at all').toBe(5)
    expect(new Set(steps), 'a level is drawn at more than two edges').toEqual(new Set(['0', '1']))
    expect(steps.filter((one) => one === '1').length, 'the three parts are not all one step in').toBe(3)
    // Every parent still has its own press, so which parts are whose is still said.
    expect(all.match(/<button type="button" class="wk-toggle"/g)?.length).toBe(3)
    expect(page.indentStep(0)).toBe(0)
    expect(page.indentStep(1)).toBe(1)
    expect(page.indentStep(4)).toBe(1)
  })
})

describe('nothing stands between the title and Late', () => {
  it('draws no sentence above the list and no bar that folds every level', () => {
    const pipeline = step()
    const html = list([
      row({ title: 'Plant the saplings', above: [pipeline] }),
      row({ title: 'Made-up chore', origin: 'fixture' }),
      row({ title: 'Given hours', hoursGiven: [{ horizon: 'week', period: '2026-W33', plannedHours: 3, actualHours: null, state: 'planned' }] }),
    ])
    // THE PAGE OPENS WITH LATE: nothing is drawn before its section. Since wave 13k's round 18
    // the section may stand inside the elements that set the page's two columns side by side
    // (components/SideBySide.tsx), so what may come before it is those elements and their sheet,
    // and no word at all.
    const start = html.indexOf('<div class="wk-page">') + '<div class="wk-page">'.length
    const first = html.indexOf('<section')
    expect(html.slice(first, html.indexOf('>', first)), 'the first section is not Late').toContain('data-section="late"')
    const before = html.slice(start, first).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    expect(before.replace(/<\/?div[^>]*>/g, ''), 'something is drawn before Late').toBe('')
    expect(html).not.toContain('fam-arith')
    expect(html).not.toContain('pieces of work across')
    expect(html).not.toContain('are made-up examples')
    expect(html).not.toContain('have been given hours')
    expect(html).not.toMatch(/Fold all|Open all/)
  })
})

describe('a kind with no state field draws the short mark', () => {
  it('draws the dash with its reason on hover, where the words "No state field" stood', () => {
    const html = list([row({ title: 'Try a cover crop', kind: 'direction', state: null })])
    expect(html).not.toContain(t('sheet.noState.noField'))
    expect(html).toContain(`<span class="px-absent" title="${t('workPage.noStateHint')}">${t('absence.mark')}`)
  })

  it('still says a state was expected and not written, which a person can act on', () => {
    expect(list([row({ title: 'Stake the young trees', kind: 'task', state: null })])).toContain(t('sheet.noState.unwritten'))
  })
})

describe('the page title reads what its sidebar row reads', () => {
  const title = () => /<h1 class="fam-title"[^>]*>([^<]*)<\/h1>/.exec(body(h(page.WorkPage, { onFiled: () => {} })))?.[1]

  it('in English', () => {
    setWordLanguage('en')
    expect(title()).toBe(t(RAIL_WORD_KEYS['rail.work']))
    expect(title()).toBe('Work to do')
  })

  it('in Chinese', () => {
    setWordLanguage('zh')
    expect(title()).toBe(t(RAIL_WORD_KEYS['rail.work']))
    expect(title()).not.toBe('Work to do')
  })
})
