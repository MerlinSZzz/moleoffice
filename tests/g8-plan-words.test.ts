// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import type { PlanLine } from '../src/web/api.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { missingAndNotWaiting, notWaitingForTranslation } from './words-waiting-for-translation.ts'

let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const shots = process.env.W13K_PLANS_SHOTS
const period = '2026-W40'
const content = ['- [x]', 'Default', 'Footbridge walk', 'Check the map', 'Pack a picnic', 'River route', 'Empty notebook', 'Map check']
let identifiers: string[]
let photographedPlan: string
async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(app.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(response.ok, await response.clone().text()).toBe(true)
  return response.json()
}

beforeAll(async () => {
  app = await liveApp({ name: 'g8-plan-words', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await request(`/api/participants/person/${THE_PERSON}`, 'PATCH', { name: 'Morgan' })
  const made = await request('/api/plans', 'POST', { title: 'Footbridge walk', body: '# River route\n- [x] Check the map\n- Pack a picnic' })
  const blank = await request('/api/plans', 'POST', { title: 'Empty notebook', body: '' })
  photographedPlan = made.plan.id
  const filed = await request(`/api/plans/${made.plan.id}/lines/${made.lines[1].id}/file-as-work`, 'POST', { kind: 'task', workspaceId: 'default' })
  const neighbour = await request('/api/records', 'POST', { kind: 'task', title: 'Pack a picnic', data: { state: 'todo' } })
  await request('/api/links', 'POST', { fromId: filed.recordId, toId: neighbour.record.id, type: 'blocks' })
  await request('/api/planning/allocations', 'POST', { horizon: 'week', period, recordId: filed.recordId, plannedHours: 3, note: 'Map check' })
  const [reply, empty, shelf, graph] = await Promise.all([
    request(`/api/plans/${made.plan.id}/blocks`), request(`/api/plans/${blank.plan.id}/blocks`), request('/api/plans'), request(`/api/plan-graph/week/${period}`),
  ])
  identifiers = [made.plan.id, blank.plan.id, filed.recordId, neighbour.record.id, ...made.lines.map((line: PlanLine) => line.id), 'writer-machinery-42', 'missing-work-42']
  const fixture = { reply, empty, shelf, graph, period }
  const bundled = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'g8-browser.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { setWordLanguage, wordCheck, t } from './src/shared/i18n.ts';
      import { en } from './src/shared/words/en.ts';
      import { zh } from './src/shared/words/zh.ts';
      import { theApiIsOnPort } from './src/web/lib/api-address.ts';
      import { setActor } from './src/web/api.ts';
      import { setMode } from './src/web/lib/mode.ts';
      import { UI_CSS } from './src/web/components/ui.tsx';
      import { PlansPage, PlansGrid } from './src/web/pages/plans/PlansPage.tsx';
      import { PlanView } from './src/web/pages/plans/OnePlanPage.tsx';
      import { PlanPage } from './src/web/pages/PlanPage.tsx';
      import { PlanGraphView } from './src/web/components/graph/PlanGraph.tsx';
      const fixture=${JSON.stringify(fixture)};
      theApiIsOnPort(${app.apiPort});setActor({type:'human',id:${JSON.stringify(THE_PERSON)}});
      const root=createRoot(document.getElementById('test'));
      const since={neverRead:false,writtenBy:['writer-machinery-42'],written:[{...fixture.reply.lines[1].line,updatedBy:'writer-machinery-42'}]};
      const reviews={reviews:[],waiting:0,note:'raw api path /api/private'};
      window.g8={
        check:wordCheck,
        words(){return Object.keys(en).filter(key=>key.startsWith('g8.')).map(key=>({key,en:en[key],zh:zh[key],drawn:t(key,{n:2,value1:2,value2:3,value3:4,value4:5,value5:6,value6:7,value7:8,value8:9,value9:10,value10:11})}));},
        draw(view,language){
          setWordLanguage(language);setMode('normal');
          let page;
          if(view==='shelf')page=<PlansPage/>;
          else if(view==='empty-shelf')page=<PlansGrid reply={{plans:[],closed:0,note:''}}/>;
          else if(view==='schedule'||view==='schedule-start')page=<PlanPage period={fixture.period}/>;
          else if(view==='graph')page=<PlanGraphView reply={{...fixture.graph,note:'raw api path /api/private'}}/>;
          else if(view==='empty-graph')page=<PlanGraphView reply={{...fixture.graph,nodes:[],edges:[],note:'raw api path /api/private'}}/>;
          else page=<PlanView reply={view==='empty-plan'?fixture.empty:fixture.reply} since={since} reviews={reviews} view={view==='writing'?'writing':view==='review'?'review':'both'} onView={()=>{}}/>;
          flushSync(()=>root.render(<React.Fragment key={view}><style>{UI_CSS}</style><div data-g8-view={view}>{page}</div></React.Fragment>));
        }
      };
      window.g8.draw('shelf','en');
    ` },
    loader: { '.css': 'empty' }, write: false, bundle: true, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
  })
  await app.page.route('**/g8-browser', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test"></main></body></html>' }))
  await app.page.goto(`${app.api}/g8-browser`)
  await app.page.addStyleTag({ content: readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '') })
  await app.page.addScriptTag({ type: 'module', content: bundled.outputFiles[0]!.text })
  await app.page.waitForFunction(() => Boolean((window as any).g8))
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

async function draw(view: string, language: string) {
  await app.page.evaluate(({ view, language }) => (window as any).g8.draw(view, language), { view, language })
  await waitForThePage(app.page, 30_000)
  if (view === 'schedule-start' && await app.page.locator('.px-plan-start form').count() === 0) await app.page.locator('.px-plan-start button').click()
  if (view === 'graph') {
    const graph = app.page.locator('.pg-switch button').first()
    if (await graph.isEnabled()) await graph.click()
    await waitForThePage(app.page, 30_000)
  }
}

// These readers also belong to pages outside G8; xmH_thE0aOaX leaves them to their owners.
const inheritedSelectors = [
  '[data-target="uiSurface/plan.board"]', '[data-target="uiSurface/plan.hours"]', '[data-target="uiSurface/plan.became"]', '[data-target="uiSurface/plan.words"]', '[data-target="uiSurface/plan.days"]', '[data-target="uiSurface/plan.period"]', '[data-target="uiSurface/plan.today"]', '[data-target="uiSurface/plan.unallocated"]',
  '.gx-card', '.gx-card-face', '.pw-became-words', '.px-stamp',
]
const inheritedWords: Record<string, string[]> = {
  'src/web/components/Planning.tsx': ['Next week', 'Week of 28 September', '28 September – 4 October 2026'],
  'src/web/components/graph/card.ts': ['Graph', 'Draw', 'List'],
  'src/web/components/graph/lines.ts': ['waits for', 'leads to', 'planned', 'related', 'one thing waits for another', 'the first one leads to the second', 'intended, not yet done', 'joined, and neither waits for the other'],
  'src/web/components/graph/CardFace.tsx': ['The right edge of this card', 'The bottom edge of this card', 'The bottom-right corner of this card', '. Drag it and that part of the card moves; the edges you are not holding stay where they are. On a phone, hold it and then drag.', '— drag it to move that edge alone'],
  'src/web/components/ui.tsx': ['The stored state word is "todo", shown as "" — . This drawing means: not started.'],
  'src/shared/kinds.ts': ['Something to do that is small enough to finish, and what it is waiting on.', 'Something owed to somebody else by a date.', 'Something wrong or blocking, with what it costs and what makes it stop.', 'A line of exploration, tracked by how far it has actually been taken.'],
  'src/server/api/plan-graph.ts': ['other records in "Default"', 'Nothing joins them to this question: none is a goal, an obligation, a direction or allocated in this period, and none is one stored link from anything that is.'],
}
async function drawnWords() {
  return app.page.locator('[data-g8-view]').evaluate((root, skip) => {
    const result: string[] = []
    const excluded = (node: Element) => skip.some(selector => node.closest(selector))
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const parent = walk.currentNode.parentElement
      if (!parent || parent.closest('style,script') || excluded(parent) || parent.closest('[hidden]')) continue
      if (parent.getClientRects().length) result.push(walk.currentNode.textContent ?? '')
    }
    for (const node of root.querySelectorAll('[title],[aria-label],input[placeholder],textarea[placeholder]')) {
      if (excluded(node) || node.closest('[hidden]') || !node.getClientRects().length) continue
      for (const attr of ['title', 'aria-label', 'placeholder']) if (node.getAttribute(attr)) result.push(node.getAttribute(attr)!)
    }
    return result
  }, inheritedSelectors)
}

it.each(['shelf', 'writing', 'table', 'review', 'schedule', 'schedule-start', 'graph'])('%s reads its words in English, Chinese and the test language, without fallback or machinery', async view => {
  for (const language of ['en', 'zh', 'xx', 'en']) {
    await draw(view, language)
    // Criterion change (wave 13j round 11, the goals piece): the Schedule no longer holds the goal drawing, so only the
    // drawing itself is read in its two presentations.
    for (const presentation of view === 'graph' ? ['graph', 'list'] : ['page']) {
      if (presentation !== 'page') {
        const press = app.page.locator('.pg-switch button').nth(presentation === 'graph' ? 0 : 1)
        if (await press.isEnabled()) await press.click()
        await waitForThePage(app.page, 30_000)
      }
      const check = await app.page.evaluate(() => (window as any).g8.check())
      expect(missingAndNotWaiting(check.missingByLanguage)).toEqual({ en: [], zh: [] })
      // English-first keys may wait for Chinese; every fallback outside that recorded list still fails.
      expect(notWaitingForTranslation(check.fallbacks.map((one: { key: string }) => one.key))).toEqual([])
      const words = await drawnWords()
      const all = words.join('\n')
      for (const id of identifiers) expect(all, `${view}: ${id}`).not.toContain(id)
      expect(all).not.toMatch(/\/api\/|\.sqlite|data\.state|MOLE_OFFICE_|127\.0\.0\.1:\d+/)
      expect(all).not.toMatch(/unknown state|未知状态/i)
      if (language === 'xx') {
        const remaining = words.map(word => {
          let left = word
          while (/⟦[^⟦⟧]*⟧/.test(left)) left = left.replace(/⟦[^⟦⟧]*⟧/g, '')
          for (const text of [...Object.values(inheritedWords).flat(), ...content].sort((a,b) => b.length-a.length)) if (text) left = left.split(text).join('')
          return left.trim()
        }).filter(word => /\p{L}/u.test(word))
        expect(remaining, view).toEqual([])
      }
    }
  }
})

it.each([
  ['empty-shelf', '.pl-nothing'], ['empty-plan', '.pt-nothing'],
  ['review', '.pr-none'], ['empty-graph', '.px-panel-body > .px-absent'],
])('%s uses the short mark for ordinary emptiness', async (view, selector) => {
  for (const language of ['en', 'zh', 'xx']) {
    await draw(view, language)
    const empty = app.page.locator(selector)
    expect(await empty.count(), selector).toBeGreaterThan(0)
    expect(await empty.first().evaluate(node => { const clone=node.cloneNode(true) as Element; clone.querySelectorAll('.px-sr').forEach(node=>node.remove()); return clone.textContent?.trim() })).toBe(language === 'xx' ? '⟦—·⟧' : '—')
  }
})

/** The plan's first project picker in its table view: how wide it is drawn, and how wide its whole choice needs it to be. */
async function theProjectChoice(page: Page) {
  await page.locator('.op-view').nth(2).click()
  const choice = page.locator('.pi-project-pick').first()
  await choice.waitFor()
  return choice.evaluate(node => {
    const original = node.getBoundingClientRect().width
    const copy = node.cloneNode(true) as HTMLSelectElement
    copy.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;width:max-content;max-width:none;min-width:0;font:${getComputedStyle(node).font}`
    document.body.append(copy)
    const needed = copy.getBoundingClientRect().width
    copy.remove()
    return { original, needed, label: (node as HTMLSelectElement).selectedOptions[0]?.textContent, font: getComputedStyle(node).font }
  })
}

it('keeps the whole project choice readable at 660 and 990 pixels', async () => {
  const page = await app.context.newPage()
  try {
    for (const width of [660, 990]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${app.site}/?lang=en&look=light#/plans/${photographedPlan}`)
      await waitForThePage(page, 30_000)
      const sizes = await theProjectChoice(page)
      expect(sizes.label).toBe('Default')
      expect(sizes.original, `${width}: ${JSON.stringify(sizes)}`).toBeGreaterThanOrEqual(sizes.needed)
    }
  } finally { await page.close() }
})

it('photographs the plan views with made-up content when requested', async () => {
  if (!shots) return
  const measurements = []
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) for (const language of width === 1440 ? ['en', 'zh', 'xx'] : ['en']) {
    const context = await app.browser.newContext({ viewport: { width, height: width < 700 ? 900 : 1000 }, colorScheme: theme as 'light' | 'dark' })
    await context.addInitScript(look => localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    try {
      for (const view of ['schedule', 'schedule-start']) {
        await page.goto(`${app.site}/?lang=${language}#/plan/${period}`)
        await waitForThePage(page, 30_000)
        await page.locator('.px-plan-start button').waitFor({ state: 'visible' })
        if (view === 'schedule-start') await page.locator('.px-plan-start button').click()
        await waitForThePage(page, 30_000)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(shots, `${view}-${width}-${theme}-${language}.png`), fullPage: true })
        measurements.push({ view, width, theme, language, ...await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth, cells: innerWidth === 660 ? [...document.querySelectorAll('.pt-table td')].map(cell => ({ text: cell.textContent, width: cell.getBoundingClientRect().width })) : [] })) })
      }
    } finally { await context.close() }
  }
  writeFileSync(join(shots, 'measurements.json'), JSON.stringify(measurements, null, 2))
}, 180_000)
