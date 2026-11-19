// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/work` DRAWS THE FIRST LINES OF ALL WORK AT ONCE AND THE REST AS THE PERSON SCROLLS. Wave 13x, round 10.
 *
 * On an office of the live size `GET /api/work` answers 2,000 rows, and drawing every one kept the page from being
 * ready for most of a second after the answer came. src/web/pages/family/WorkPage.tsx now draws the first
 * `WORK_LINES_DRAWN_FIRST` lines, and more each time the line at the foot comes within a screen of the window. That
 * line says how many are shown of how many, and its press shows them all, so nothing is left out without saying so.
 *
 *   1. `linesOfLevels` places each line in the order the list draws it: a folded level's parts have no place,
 *      and the line over unreadable work and its rows come after the project's tree.
 *   2. By level, 250 rows: the first 100 are drawn and the 101st is not; the heading still counts 250; the foot
 *      says "100 of 250 lines shown." and offers "Show all 250". A second project past the first 100 lines has no section.
 *   3. One list: the table holds 100 rows of 250, with the same foot.
 *   4. A list of 100 lines or fewer is drawn whole and has no foot.
 *   5. In a browser, on 320 filed tasks: 100 lines at first; scrolling to the foot draws 200 more. Opened again,
 *      the press, sent from the top of the page where no scroll can draw anything, draws every line, and the foot
 *      goes.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - WorkPage.tsx, linesOfLevels: `if (!folded.has(node.key))` removed: case 1 goes red.
 *   - WorkPage.tsx, NodeRows: the `>= drawn` return removed: cases 2 and 5 go red.
 *   - WorkPage.tsx, TheRestAsYouScroll: its effect never calls `onMore`: case 5 goes red.
 *   - WorkPage.tsx, the press's `onAll` made `onMore`: case 5 goes red.
 *   - WorkPage.tsx, the table drawn from `reply.rows` whole: case 3 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WorkspacesReply } from '../src/server/api/workspaces.ts'
import type { WorkChainStep, WorkListReply, WorkRow } from '../src/server/lib/worklist.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

type Page = typeof import('../src/web/pages/family/WorkPage.tsx')
let page: Page

beforeAll(async () => {
  // THE PAGE REACHES src/web/api.ts and src/web/lib/mode.ts, which touch `window` as they load. The smallest
  // stand-in that lets them load, as in tests/work-page.test.ts; nothing here is under test.
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

/** Markup with the style blocks removed, so a class name in the CSS is not evidence. */
function body(el: React.ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function row(over: Partial<WorkRow> = {}): WorkRow {
  seq += 1
  const title = over.title ?? `Work number ${String(seq)}.`
  return {
    id: `w-${String(seq)}`,
    kind: 'task',
    title,
    name: title,
    within: null,
    summary: null,
    state: 'todo',
    workspaceId: 'robotics',
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

function step(id: string): WorkChainStep {
  return { id, title: `Level ${id}`, kind: 'pipeline', workspaceId: 'robotics', via: 'pipeline order', position: 1, deleted: false }
}

function reply(rows: WorkRow[]): WorkListReply {
  return {
    rows,
    subtraction: { candidates: rows.length, carried: rows.length, leftOut: 0, shortened: 0 },
    leftOutGroups: [],
    counted: rows.length,
    returned: rows.length,
    cap: 2000,
    leftOut: 0,
    order: 'Rows are ordered by project.',
    kinds: ['task'],
    kindsBecause: 'Work here is tasks.',
    note: `${String(rows.length)} pieces of work.`,
  }
}

const PROJECTS = {
  workspaces: [
    { id: 'robotics', title: 'Robotics', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
    { id: 'panelx', title: 'Mole Office', note: null, createdAt: '', updatedAt: '', records: 1, isDefault: false },
  ],
} as unknown as WorkspacesReply

const NOW = new Date(2026, 7, 14, 12, 0, 0).getTime()

describe('the list is drawn in part, and says so', () => {
  it('1: places each line in the order it is drawn, without the parts of a folded level', () => {
    const rows = [
      row({ id: 'a', above: [step('L')] }),
      row({ id: 'b', above: [step('L')] }),
      row({ id: 'c' }),
      row({ id: 'u', above: [], aboveStopped: 'the chain could not be read' }),
      row({ id: 'p', workspaceId: 'panelx' }),
    ]
    const levels = page.buildLevels(rows)
    const open = page.linesOfLevels(levels, new Set())
    expect([...open.projects[0]!.at.entries()]).toEqual([['L', 0], ['a', 1], ['b', 2], ['c', 3]])
    expect(open.projects[0]!.unreadableStart).toBe(4)
    expect(open.projects[1]).toMatchObject({ start: 6 })
    expect(open.total).toBe(7)
    const shut = page.linesOfLevels(levels, new Set(['L']))
    expect([...shut.projects[0]!.at.entries()]).toEqual([['L', 0], ['c', 1]])
    expect(shut.total).toBe(5)
  })

  it('2: by level, draws the first lines, counts every row, and says how many are shown', () => {
    const rows = Array.from({ length: 250 }, (_, n) => row({ title: `Robotics work ${String(n + 1)}.` }))
    rows.push(row({ title: 'The other project.', workspaceId: 'panelx' }))
    const html = body(h(page.WorkList, { reply: reply(rows), projects: PROJECTS, now: NOW }))
    expect(page.WORK_LINES_DRAWN_FIRST).toBe(100)
    expect(html).toContain('Robotics work 100.')
    expect(html).not.toContain('Robotics work 101.')
    expect(html.match(/class="wk-row"/g)?.length).toBe(100)
    expect(html).toContain('<span class="wk-count num">251</span>')
    expect(html).toContain(sayInEnglish('w13w.part.shown', { n: page.WORK_LINES_DRAWN_FIRST, total: 251 }))
    expect(html).toContain('Show all 251')
    expect(html).not.toContain('data-project="panelx"')
  })

  it('3: as one list, the table holds the first rows, with the same foot', () => {
    const rows = Array.from({ length: 250 }, () => row())
    const html = body(h(page.WorkList, { reply: reply(rows), projects: PROJECTS, now: NOW, view: 'flat' }))
    expect(html.match(/class="wk-tr"/g)?.length).toBe(100)
    expect(html).toContain(sayInEnglish('w13w.part.shown', { n: page.WORK_LINES_DRAWN_FIRST, total: 250 }))
  })

  it('4: a list of no more lines than are drawn first is drawn whole, with no foot', () => {
    const rows = Array.from({ length: 100 }, () => row())
    const html = body(h(page.WorkList, { reply: reply(rows), projects: PROJECTS, now: NOW }))
    expect(html.match(/class="wk-row"/g)?.length).toBe(100)
    expect(html).not.toContain('wk-more')
  })
})

describe('in a browser', () => {
  let app: LiveApp | undefined

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('5: draws more as the foot comes near, and every line on the press', async () => {
    app = await liveApp({ name: 'work-in-part', viewport: { width: 1440, height: 1000 } })
    for (let n = 1; n <= 320; n += 1) {
      const res = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        body: JSON.stringify({ kind: 'task', title: `Filed task ${String(n)}.` }),
      })
      if (!res.ok) throw new Error(`A task could not be filed: ${String(res.status)} ${await res.text()}`)
    }
    const browser = app.page
    await browser.goto(`${app.site}/?lang=en#/work`, { timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    const lines = browser.locator('[data-section="all-work"] .wk-row, [data-section="all-work"] .wk-level')
    const foot = browser.locator('[data-section="all-work"] .wk-more')
    await foot.waitFor({ timeout: 30_000 })
    const total = Number(await foot.getAttribute('data-total'))
    expect(total).toBeGreaterThanOrEqual(320)
    expect(await lines.count()).toBe(100)

    await foot.scrollIntoViewIfNeeded()
    await browser.waitForFunction(() => document.querySelectorAll('[data-section="all-work"] .wk-row, [data-section="all-work"] .wk-level').length > 100, undefined, { timeout: 30_000 })
    await browser.waitForTimeout(500)
    expect(await lines.count()).toBe(300)
    expect(await foot.getAttribute('data-drawn')).toBe('300')

    // THE PRESS, ON THE PAGE OPENED AGAIN WITH ITS FIRST 100 LINES. One more step would leave it short of every
    // line, so only a press that draws them all passes. The foot is screens below the top, where no scroll can
    // draw anything, and the press is sent to the button where it stands, without scrolling to it.
    await browser.reload({ timeout: 60_000 })
    await waitForThePage(browser, 60_000)
    await foot.waitFor({ timeout: 30_000 })
    await browser.waitForTimeout(500)
    expect(await lines.count()).toBe(100)
    await foot.getByRole('button').dispatchEvent('click')
    await foot.waitFor({ state: 'detached', timeout: 30_000 })
    expect(await lines.count()).toBe(total)
  }, 300_000)
})
