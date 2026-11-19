// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Criterion before production (yBoxl5bOrJf8): each existing work consumer must pass the
 * canonical state's provenance to its actual chip. OLD these projections lost provenance and
 * the chip called the word stored. NEW ordinary words stay; tooltip and Developer detail say
 * derived. Supplied asynchronous reads are separate from the parent's native browser review.
 */
import { createElement as h, type ReactElement } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { AGENT, freshDb, liveApp, theNoteSaysItIsTheBuildWanted, THE_PAGE_BROWSER_TESTS_ARE_SERVED,
  theResizeIsDrawn, waitForThePage, whatThePageWouldBeBuiltFrom, writeDataBypassingTheGate, type LiveApp, type TestDb } from './helpers.ts'
import { MAIN_SUITE_FIX_EXAMPLE, mainSuiteFixSchema } from '../src/shared/main-suite-fix.ts'
import type { AllocatedWork, AllocationWithWork } from '../src/server/lib/planning.ts'
import type { WorkPageReply, WorkRow } from '../src/server/lib/worklist.ts'
import type { PlanLineWithWork } from '../src/server/lib/plans.ts'
import type { TodayReply } from '../src/web/api.ts'

const supplied = vi.hoisted(() => ({ today: null as TodayReply | null }))
vi.mock('../src/web/lib/homereads.ts', async (original) => {
  const real = await original<typeof import('../src/web/lib/homereads.ts')>()
  return { ...real, useSharedRead: (read: unknown, deps: readonly unknown[]) =>
    read === real.readClaimsOnce || read === real.readForksOnce || read === real.readSaidOnce
      ? real.useSharedRead(read as typeof real.readClaimsOnce, deps)
      : [{ status: 'ready', value: { today: supplied.today } }, () => {}] }
})
let workPage: typeof import('../src/web/pages/family/WorkPage.tsx')
let planning: typeof import('../src/web/components/Planning.tsx')
let items: typeof import('../src/web/components/plans/planitems.tsx')
let progress: typeof import('../src/web/components/plans/PlanProgress.tsx')
let home: typeof import('../src/web/pages/HomePage.tsx')
let mode: typeof import('../src/web/lib/mode.ts')
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = { getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage,
    location: { hash: '#/', search: '' }, addEventListener: () => {}, removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) } })
  workPage = await import('../src/web/pages/family/WorkPage.tsx')
  planning = await import('../src/web/components/Planning.tsx')
  items = await import('../src/web/components/plans/planitems.tsx')
  progress = await import('../src/web/components/plans/PlanProgress.tsx')
  home = await import('../src/web/pages/HomePage.tsx')
  mode = await import('../src/web/lib/mode.ts')
})
afterEach(() => mode?.setMode('normal'))

const views = ['work list', 'planning identity', 'work offer', 'plan item', 'plan progress', 'home allocation', 'home agenda'] as const
function draw(view: typeof views[number], derived: boolean): string {
  const state = derived ? 'worked_around' : 'open'
  const work: AllocatedWork & { stateSource: 'stored' | 'derived from mainSuiteFix' } = {
    id: 'synthetic-work-provenance', kind: 'problem', title: 'Synthetic work provenance specimen',
    name: 'Synthetic work provenance specimen', within: null, workspaceId: 'default',
    state, stateSource: derived ? 'derived from mainSuiteFix' : 'stored', effortHours: null, origin: 'fixture', deleted: false,
  }
  const row: WorkRow & { stateSource: 'stored' | 'derived from mainSuiteFix' } = {
    ...work, summary: null, above: [], aboveStopped: null, parentsInOtherProjects: [], estimateHours: null,
    hoursGiven: [], incompleteCount: 0, due: null, origin: 'fixture',
  }
  const entry = { line: { id: 'synthetic-plan-line', recordId: work.id, text: 'Synthetic filed line', updatedAt: '2026-10-15 10:00:00' },
    work, derived: [], kept: [], explanation: null, shortForm: null } as unknown as PlanLineWithWork
  const allocation = { allocation: { id: 'synthetic-allocation', recordId: work.id, horizon: 'day', period: '2026-10-16',
    plannedHours: 1, actualHours: null, state: 'planned', note: null, createdAt: '2026-10-15 10:00:00', updatedAt: '2026-10-15 10:00:00' }, work } as AllocationWithWork
  const reply = { rows: [row], counted: 1, returned: 1, cap: 25, leftOut: 0,
    subtraction: { candidates: 1, carried: 1, leftOut: 0, shortened: 0 }, leftOutGroups: [],
    order: 'Synthetic fixture order.', kinds: ['problem'], kindsBecause: 'Synthetic problem work.', note: 'Synthetic work row.' } as WorkPageReply
  let element: ReactElement
  switch (view) {
    case 'work list': element = h(workPage.WorkList, { reply, projects: { workspaces: [], current: { id: 'default', stated: true }, choosing: 'Synthetic project selection.' }, now: 0 }); break
    case 'planning identity': element = h(planning.WorkIdent, { work, recordId: work.id }); break
    case 'work offer': element = h(planning.WorkOffer, { row, allocatable: ['problem'], action: null }); break
    case 'plan item': element = h(items.ItemStands, { item: { entry } as Parameters<typeof items.ItemStands>[0]['item'] }); break
    case 'plan progress': element = h(progress.PlanProgress, { lines: [entry], planCreatedAt: '2026-10-15 09:00:00' }); break
    case 'home allocation': element = h(home.DayColumn, { declares: { surface: null }, title: 'Synthetic day',
      words: { lead: 'Synthetic allocation', nothingOn: false, holds: 'Synthetic capacity', period: 'today', holdsUnset: false },
      note: 'Synthetic day evidence.', opens: 'Synthetic details', explains: null, entries: [allocation],
      projectName: () => 'Synthetic project', seeAll: '#/plan' }); break
    case 'home agenda':
      supplied.today = { day: '2026-10-16', allocations: [allocation], capacity: null, recurring: [] } as unknown as TodayReply
      element = h(home.HomePage, { waiting: { status: 'loading' }, attention: { status: 'loading' }, onWaitingChanged: () => {}, onAttentionChanged: () => {} }); break
  }
  const before = JSON.stringify({ work, row, entry, allocation, reply })
  const html = renderToStaticMarkup(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
  expect(JSON.stringify({ work, row, entry, allocation, reply })).toBe(before)
  return html
}
it.each(views)('%s passes state provenance into its rendered chip', (view) => {
  for (const inspect of [false, true]) {
    mode.setMode(inspect ? 'inspect' : 'normal')
    const derived = draw(view, true)
    expect(derived).toContain('Derived state')
    expect(derived).toContain('worked around')
    expect(derived).not.toContain('stored as worked_around')
    expect(derived).not.toContain('The stored state word is &quot;worked_around&quot;')
    if (inspect) expect(derived).toContain('derived from mainSuiteFix')
    const stored = draw(view, false)
    expect(stored).toContain(inspect ? 'The stored state word is &quot;open&quot;' : 'Stored state')
    expect(stored).not.toContain('derived from mainSuiteFix')
  }
})

// Criterion first, Lqzfnolk51L9 forwarded whole in I9RK4E9VL5i7; method PLVeYLDyv4Wn.
// OLD: the Developer qualifier occupied the title's horizontal space on Home at 390.
// NEW: the full qualifier is below its unchanged primary chip, and the title has the whole
// content column. Normal and ordinary stored controls keep their original words and geometry.
// The actual prebuilt QA page must already match source: this file never builds a page.
let browserApp: LiveApp | undefined
let browserDb: TestDb | undefined
let fixture: { active: string; ordinary: string; precedence: string; plan: string }
const layoutTitle = (key: string) => `Synthetic section comparison — ${key} (Made-up data)`
beforeAll(async () => {
  const stamp = join(dirname(THE_PAGE_BROWSER_TESTS_ARE_SERVED), 'web-for-tests-built-from.json')
  if (!existsSync(join(THE_PAGE_BROWSER_TESTS_ARE_SERVED, 'index.html')) || !existsSync(stamp) ||
    !theNoteSaysItIsTheBuildWanted(JSON.parse(readFileSync(stamp, 'utf8')), whatThePageWouldBeBuiltFrom())) {
    throw new Error('The provenance browser criterion requires an existing current-source QA build; build it in the compiler phase first.')
  }
  browserDb = await freshDb()
  const db = browserDb
  const active = mainSuiteFixSchema.parse({ ...structuredClone(MAIN_SUITE_FIX_EXAMPLE),
    pending: { phase: 'repair', says: 'Synthetic repair awaits verification; Made-up data.' } })
  const returned = mainSuiteFixSchema.parse({ ...structuredClone(active), outcome: { returned: 'synthetic-layout-return' } })
  const ids = new Map<string, string>()
  for (const [key, data] of [
    ['ordinary', { state: 'open' }], ['active', { mainSuiteFix: active }], ['offer', { mainSuiteFix: active }],
    ['populated', { mainSuiteFix: returned }], ['precedence', { state: 'open', mainSuiteFix: returned }], ['unwritten', {}],
  ] as const) {
    const record = db.api.createRecord({ workspaceId: 'default', kind: 'problem', title: layoutTitle(key),
      summary: 'Made-up data; no cloud run, release or merge occurred.', origin: 'fixture', actor: AGENT,
      data: { symptom: 'Synthetic provenance layout specimen.' } })
    writeDataBypassingTheGate(db, record.id, { symptom: 'Synthetic provenance layout specimen. Made-up data.', ...data })
    ids.set(key, record.id)
  }
  const { createPlan, bindLineToWork } = await import('../src/server/lib/plans.ts')
  const planKeys = ['ordinary', 'populated', 'active', 'precedence', 'unwritten']
  const plan = createPlan({ title: 'Synthetic provenance layout plan (Made-up data)',
    body: planKeys.map(key => `- ${layoutTitle(key)}`).join('\n') }, AGENT)
  for (let i = 0; i < planKeys.length; i++) bindLineToWork(plan.plan.id, plan.lines[i]!.id, { recordId: ids.get(planKeys[i]!)! }, AGENT)
  const { dayKey } = await import('../src/shared/planning.ts')
  // Direct, labelled synthetic fixture rows; this does not claim the scheduling door accepted an act.
  for (const [i, key] of ['ordinary', 'active', 'precedence'].entries()) {
    db.client.sqlite.prepare('INSERT INTO allocations(id,horizon,period,record_id,planned_hours,state,note,created_at,updated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(`synthetic-layout-allocation-${i}`, 'day', dayKey(new Date()), ids.get(key)!, 1, 'planned',
        'Made-up data; no scheduling authority is claimed.', '2026-10-15 09:30:00', '2026-10-15 09:30:00', 'agent:synthetic-layout-fixture')
  }
  fixture = { active: ids.get('active')!, ordinary: ids.get('ordinary')!, precedence: ids.get('precedence')!, plan: plan.plan.id }
  browserApp = await liveApp({ name: 'home-provenance-layout', viewport: { width: 390, height: 1000 }, database: db.file })
})
afterAll(async () => { await browserApp?.stop(); browserDb?.close() })

it('Home at 390 keeps its full title column and places exact Developer provenance below the state in both themes', async () => {
  const app = browserApp!
  const observations: unknown[] = []
  const violations: string[] = []
  for (const theme of ['light', 'dark']) {
    const context = await app.browser.newContext({ viewport: { width: 390, height: 1000 } })
    try {
      await context.addInitScript(value => localStorage.setItem('mole-office.preset.theme', value), theme)
      const page = await context.newPage()
      const widths = new Map<string, number>()
      for (const mode of ['normal', 'inspect']) {
        await page.goto(`${app.site}/?lang=en&mode=${mode}#/`, { waitUntil: 'domcontentloaded' })
        await waitForThePage(page, 30_000)
        await page.locator(`.hm-agenda-link[href$="/${fixture.active}"] .px-chip-word`).waitFor()
        await page.evaluate(() => document.fonts.ready)
        await theResizeIsDrawn(page)
        const measured = await page.evaluate(({ fixture, mode, theme }) => {
          const rect = (element: Element) => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom } }
          const rows = [fixture.active, fixture.ordinary, fixture.precedence].map(id => {
            const row = document.querySelector<HTMLElement>(`.hm-agenda-link[href$="/${id}"]`)!
            const title = row.querySelector<HTMLElement>('.hm-row-title')!, hours = row.querySelector<HTMLElement>('.hm-hours')!
            const chip = row.querySelector<HTMLElement>('.px-chip-stored')!, word = chip.querySelector<HTMLElement>('.px-chip-word')!
            const qualifier = row.querySelector<HTMLElement>('.px-chip-stored-word')
            return { id, row:rect(row), title:rect(title), hours:rect(hours), chip:rect(chip), titleText:title.innerText,
              word:word.innerText, tooltip:chip.title, gap:parseFloat(getComputedStyle(row).columnGap) || 0,
              qualifier:qualifier ? { box:rect(qualifier), text:qualifier.innerText, clientWidth:qualifier.clientWidth,
                scrollWidth:qualifier.scrollWidth, overflow:getComputedStyle(qualifier).overflow, ellipsis:getComputedStyle(qualifier).textOverflow } : null }
          })
          return { mode, theme, actualTheme:document.documentElement.dataset.theme, actualMode:document.documentElement.dataset.mode,
            language:document.documentElement.lang, rows }
        }, { fixture, mode, theme })
        observations.push(measured)
        expect(measured.actualTheme).toBe(theme)
        expect(measured.actualMode).toBe(mode)
        expect(measured.language).toBe('en')
        for (const row of measured.rows) {
          expect(row.word).toBe('open')
          const key = row.id === fixture.active ? 'active' : row.id === fixture.ordinary ? 'ordinary' : 'precedence'
          // Home's actual title region draws the summary at its opening reading length.
          expect(row.titleText).toBe('Made-up data; no cloud run, release or merge occurred.')
          if (mode === 'normal') {
            expect(row.qualifier).toBeNull()
            expect(row.tooltip).toBe(`${key === 'active' ? 'Derived' : 'Stored'} state: open`)
            widths.set(key, row.title.width)
          } else if (key === 'active') {
            expect(row.qualifier?.text).toBe('derived from mainSuiteFix: open')
            expect(row.tooltip).toContain('Derived state word is "open" (derived from mainSuiteFix)')
            if (!row.qualifier || row.qualifier.box.y < row.chip.bottom - 1) violations.push(`${theme}: provenance shares the primary chip line`)
            const available = row.row.width - row.hours.width - row.gap
            if (row.title.width < available - 2) violations.push(`${theme}: title width ${row.title.width} is below its full content column ${available}`)
            if (row.qualifier && (row.qualifier.scrollWidth > row.qualifier.clientWidth + 1 || row.qualifier.overflow === 'hidden' || row.qualifier.ellipsis === 'ellipsis')) violations.push(`${theme}: provenance is clipped`)
          } else {
            expect(row.qualifier).toBeNull()
            expect(row.tooltip).toContain('The stored state word is "open"')
            expect(row.title.width).toBeCloseTo(widths.get(key)!, 0)
          }
        }
      }
    } finally { await context.close() }
  }
  console.log('HOME_PROVENANCE_GEOMETRY ' + JSON.stringify(observations))
  expect(violations).toEqual([])
})
