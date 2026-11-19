// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TodayReply } from '../src/web/api.ts'
import type { PlanReply } from '../src/server/api/planning.ts'
import type { RecordReply } from '../src/server/api/records.ts'

// Plan 7FEOshq3mBGG, by a decision: every schedule view reads the lists; ending work offers a guarded
// inverse.
let app: LiveApp
let today: TodayReply
let script: string
const work: Record<string, string> = {}
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const content = ['Orchard Trial', 'Water the Saplings', 'Prepare the Beds', 'Deliver the Basket', 'Mend the Gate',
  'Made-up planting note', 'Quill', 'A quiet afternoon', 'Mystery Work', 'Morning Routine', 'Orchard Steps']
const shots = process.env.W13K_SCHEDULE_SHOTS

async function request(path: string, method = 'GET', body?: unknown) {
  const reply = await fetch(`${app.api}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(reply.ok, `${method} ${path}: ${await reply.clone().text()}`).toBe(true)
  return reply.json()
}

beforeAll(async () => {
  app = await liveApp({ name: 'schedule-g8b', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await request('/workspaces/default', 'PATCH', { title: content[0] })
  await request(`/participants/person/${THE_PERSON}`, 'PATCH', { name: 'Quill' })
  today = await request('/planning/today')
  const pipeline = await request('/records', 'POST', { kind:'pipeline', title:'Orchard Steps', data:{} })
  for (const [kind, title, state] of [
    ['task', content[1], 'doing'], ['block', content[2], 'doing'],
    ['obligation', content[3], 'open'], ['problem', content[4], 'open'],
  ]) {
    const made = kind === 'block'
      ? await request(`/records/${pipeline.record.id}/blocks`, 'POST', { name:title, state })
      : await request('/records', 'POST', { kind, title, data: { state } })
    work[kind!] = made.record.id
    for (const horizon of ['day', 'week', 'month'] as const) await request('/planning/allocations', 'POST', {
      horizon, period: today[horizon], recordId: made.record.id, plannedHours: kind === 'obligation' ? null : 2,
      note: 'Made-up planting note',
    })
  }
  const month = await request(`/planning/month/${today.month}`)
  for (const [index,state] of [[0,'done'],[1,'dropped']] as const) await request(`/planning/allocations/${month.entries[index].allocation.id}`, 'PATCH', {state,actualHours:2})
  await request('/planning/windows', 'POST', { recordId: work.task, startsOn: today.day, endsOn: today.day, note: 'A quiet afternoon' })
  for (const horizon of ['day', 'week', 'month'] as const) await request(`/planning/capacity/${horizon}/${today[horizon]}`, 'PUT', {
    hours: horizon === 'day' ? 8 : horizon === 'week' ? 25 : 100, note: 'Made-up planting note',
  })
  const routine = await request('/records', 'POST', {kind:'task',title:'Morning Routine',data:{state:'todo'}})
  const day: PlanReply = await request(`/planning/day/${today.day}`)
  today.recurring = [{ recurrence:{id:'recurrence-q73',recordId:routine.record.id,every:'weekdays',days:[1,3,5],hoursEach:null},
    work:{...day.entries[0]!.work!,id:routine.record.id,title:'Morning Routine',name:'Morning Routine',within:null,state:'todo'} }]
  const bundled = await bundlePageCode({
    stdin: { resolveDir: process.cwd(), sourcefile: 'schedule-g8b-browser.tsx', loader: 'tsx', contents: `import './tests/a-page-of-a-test-office.ts';
      import React, {useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import * as P from './src/web/components/Planning.tsx';
      import {api, setActor} from './src/web/api.ts';
      import {UI_CSS} from './src/web/components/ui.tsx';
      import {setMode} from './src/web/lib/mode.ts';
      import {setWorkspace} from './src/web/lib/workspace.ts';
      import {theApiIsOnPort} from './src/web/lib/api-address.ts';
      import {t,setWordLanguage,wordCheck} from './src/shared/i18n.ts';
      import {readLanguage} from './src/web/lib/language.ts';
      theApiIsOnPort(${app.apiPort});setWorkspace('default');setActor({type:'human',id:${JSON.stringify(THE_PERSON)}});
      // The page reads the language of the person just set, and that reading ends by setting the words'
      // language. It must end before this page sets a language itself, or it puts English back over a
      // Chinese drawing. Since round 80 a reading begun before setActor is not handed to the new person,
      // so the page's own reading ends later than the first drawing unless the page waits for it here.
      await readLanguage();
      const root=createRoot(document.getElementById('test'));
      const today=${JSON.stringify(today)};
      let view='week', language='en', editing=false, empty=false, revision=0;
      let current=null;
      const unknown={id:'record-q73',kind:'task',title:'Mystery Work',name:'Mystery Work',within:null,state:'todo',
        workspaceId:'unknown-project-q73',effortHours:null,origin:null,deleted:false};
      async function draw(nextLanguage=language,nextView=view,nextEditing=editing,nextEmpty=empty) {
        language=nextLanguage;view=nextView;editing=nextEditing;empty=nextEmpty;
        setWordLanguage(language);setMode('normal');document.documentElement.lang=language;
        const unit=view==='today'?'day':view==='review'?'month':view;
        const period=empty ? (unit==='day'?'2032-06-16':unit==='week'?'2032-W25':'2032-06') : today[unit];
        const reply=await api.plan(period);const said=P.periodSaid(period,today);
        current={reply,said,period};render();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }
      function Words() {const [said,setSaid]=useState('');return <P.TimeInWords said={said} onSaid={setSaid}
        editing={editing} today={today} onWrote={()=>void draw()}/>;}
      function render() {
        const {reply,said,period}=current;const wrote=revision;
        const onWrote=()=>{revision++;void draw()};
        const props={reply,said,editing,onWrote};
        flushSync(()=>root.render(<><style>{UI_CSS}</style>
          <section id="schedule" data-view={view}>
            {view==='week'?<P.WeekBuild {...props} wrote={wrote} todayDay={today.day}/>:null}
            {view==='month'?<P.MonthPlan {...props} today={today}/>:null}
            {view==='day'?<P.DayPlan {...props} today={today} wrote={wrote}/>:null}
            {view==='today'?<P.TodayPlan {...props} today={today} planHere="#/plan/today/edit"/>:null}
            {view==='review'?<P.MonthReview period={period} said={said} wrote={wrote} editing={editing} onWrote={onWrote}/>:null}
            <div id="unread-project"><P.WorkIdent work={unknown} recordId={unknown.id}/></div>
            <div id="coverage-words"><Words/></div>
          </section>
        </>));
      }
      window.schedule={draw,check:wordCheck,reread:()=>draw(),revision:()=>revision};
      await draw();
    ` }, write: false, bundle: true, format: 'esm', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = bundled.outputFiles[0]!.text
}, 180_000)

afterAll(async () => { await app?.stop() })

async function prepare(page: Page) {
  await page.route('**/schedule-g8b', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test" class="page"></main></body></html>' }))
  await page.route('**/api/planning/windows?**', async route => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.windows?.length) body.owners[body.windows[0].window.id] = 'agent:agent-stamp-q73:/tmp/branch-q73:port-47391:stored_field_q73:door-q73:setting-q73'
    await route.fulfill({ response, json: body })
  })
  const faults: string[] = []
  page.on('pageerror', error => faults.push(error.stack ?? error.message))
  await page.goto(`${app.api}/schedule-g8b`)
  await page.addStyleTag({ content: readFileSync(new URL('../src/web/tokens.css', import.meta.url), 'utf8') +
    readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8').replace(/@import[^;]+;/g, '') +
    'main.page { margin: 0 auto; padding: 24px; max-width: 1100px; }' })
  await page.addScriptTag({ type: 'module', content: script })
  await page.waitForFunction(() => Boolean((window as any).schedule))
  expect(faults).toEqual([])
  return faults
}

async function draw(page: Page, language: string, view: string, editing = false, empty = false) {
  await page.evaluate(({language,view,editing,empty}) => (window as any).schedule.draw(language,view,editing,empty), {language,view,editing,empty})
  await expect.poll(async () => await page.locator('#schedule .px-loading').count()).toBe(0)
  if (view === 'week') {
    await expect.poll(async () => await page.locator('#schedule .px-pl-board').count()).toBe(1)
    if (!empty && await page.locator('.px-pl-open').count() === 0 && await page.locator('.px-pl-block').count()) await page.locator('.px-pl-block').first().click()
  }
}




it('ends every supported kind through the undo tier, keeps the row on reread, restores the exact state and refuses a newer write', async () => {
  const page = app.page
  await prepare(page)
  const finishes = [['task','done','Done'],['block','done','Done'],['obligation','fulfilled','fulfilled'],
    ['obligation','cancelled','cancelled'],['problem','fixed','fixed'],['problem','worked_around','worked around'],['problem','accepted','accepted']]
  for (const [kind, ending, label] of finishes) {
    const id = work[kind!]!
    const initial = kind === 'task' || kind === 'block' ? 'doing' : 'open'
    await request(`/records/${id}`, 'PATCH', { dataPatch: { state: initial } })
    await draw(page, 'en', 'today')
    const before: RecordReply = await request(`/records/${id}`)
    const allocation = (await request(`/planning/day/${today.day}`)).entries.find((entry: any) => entry.allocation.recordId === id).allocation
    const row = page.locator('.px-pl-arow').filter({ has: page.locator(`a[href="#/r/${id}"]`) })
    if ((kind === 'obligation' || kind === 'problem') && await row.getByRole('button', {name:'Done',exact:true}).count()) await row.getByRole('button', {name:'Done',exact:true}).click()
    await row.getByRole('button', {name:label!,exact:true}).click()
    await expect.poll(async () => (await request(`/records/${id}`)).record.data.state).toBe(ending)
    await page.evaluate(() => (window as any).schedule.reread())
    const undo = row.getByRole('button', {name:/^Undo \(/})
    await expect.poll(() => undo.count()).toBe(1)
    expect(await undo.isVisible()).toBe(true)
    expect((await request(`/planning/day/${today.day}`)).entries.find((entry: any) => entry.allocation.id === allocation.id).allocation).toEqual(allocation)
    await undo.click()
    await expect.poll(async () => (await request(`/records/${id}`)).record.data).toEqual(before.record.data)
  }
  const id = work.task!
  await draw(page, 'en', 'today')
  const row = page.locator('.px-pl-arow').filter({ has: page.locator(`a[href="#/r/${id}"]`) })
  await row.getByRole('button', {name:'Done',exact:true}).click()
  const undo = row.getByRole('button', {name:/^Undo \(/})
  await expect.poll(() => undo.count()).toBe(1)
  await request(`/records/${id}`, 'PATCH', { dataPatch: { state: 'blocked' } })
  await page.evaluate(() => (window as any).schedule.reread())
  expect(await row.locator('.px-pl-isdone').count()).toBe(0)
  // The page reads a refused reply a moment after the browser has it, as on a busy machine. So the error is
  // drawn after the reply has arrived, and the check waits for it rather than counting once.
  await page.evaluate(() => {
    const fetchNow = window.fetch
    window.fetch = async (...asked: Parameters<typeof fetch>) => {
      const reply = await fetchNow(...asked)
      if (reply.status === 409) await new Promise(resolve => setTimeout(resolve, 300))
      return reply
    }
  })
  const refused = page.waitForResponse(reply => reply.request().method() === 'PATCH' && reply.url().endsWith(`/records/${id}`))
  await undo.click()
  expect((await refused).status()).toBe(409)
  expect((await request(`/records/${id}`)).record.data.state).toBe('blocked')
  await expect.poll(() => row.locator('.px-error').count(), { timeout: 5_000 }).toBeGreaterThan(0)
}, 180_000)

it('expires the undo offer without restoring work, and keeps readable columns at every required width and look', async () => {
  const page = app.page
  await prepare(page)
  const id = work.task!
  await request(`/records/${id}`, 'PATCH', { dataPatch: { state:'doing' } })
  await draw(page, 'en', 'today')
  const row = page.locator('.px-pl-arow').filter({ has: page.locator(`a[href="#/r/${id}"]`) })
  await page.clock.install()
  await row.getByRole('button', {name:'Done',exact:true}).click()
  await expect.poll(() => row.getByRole('button', {name:/^Undo \(/}).count()).toBe(1)
  if (shots) {
    mkdirSync(shots, {recursive:true})
    await page.addStyleTag({content:'#unread-project, #coverage-words { display: none; }'})
    for (const width of [660,390]) for (const theme of ['light','dark']) {
      await page.setViewportSize({width,height:1000})
      await page.evaluate(theme => document.documentElement.dataset.theme=theme, theme)
      expect(await row.locator('.px-pl-ident').evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(100)
      await page.screenshot({path:join(shots,`undo-${width}-${theme}-en.png`),fullPage:true})
    }
  }
  await page.clock.fastForward(11_000)
  expect(await row.getByRole('button', {name:/^Undo \(/}).count()).toBe(0)
  expect((await request(`/records/${id}`)).record.data.state).toBe('done')
  await page.clock.resume()
  await request(`/records/${id}`, 'PATCH', { dataPatch: { state:'doing' } })
  const sizes: unknown[] = []
  if (shots) mkdirSync(shots, { recursive:true })
  for (const width of [1440,390]) for (const theme of ['light']) {
    await page.setViewportSize({width,height:1000})
    await page.evaluate(theme => document.documentElement.dataset.theme=theme, theme)
    for (const view of ['week','day','month','today','review']) {
      await draw(page,'en',view,view!=='today')
      if (shots) await page.addStyleTag({content:'#unread-project, #coverage-words { display: none; }'})
      const measured = await page.evaluate(() => ({width:innerWidth,drawn:document.documentElement.scrollWidth,
        columns:[...document.querySelectorAll('.px-pl-arow .px-pl-ident')].map(node=>node.getBoundingClientRect().width)}))
      expect(measured.drawn, `${view} ${width} ${theme} overflows`).toBeLessThanOrEqual(width)
      expect(measured.columns.every(size => size >= 100), `${view} ${width} has a collapsed work column: ${measured.columns}`).toBe(true)
      sizes.push({view,theme,...measured})
      if (shots) await page.screenshot({path:join(shots,`${view}-${width}-${theme}-en.png`),fullPage:true})
      if (shots && width===1440) {
        await draw(page,'zh',view,view!=='today')
        await page.screenshot({path:join(shots,`${view}-${width}-${theme}-zh.png`),fullPage:true})
      }
    }
  }
  if (shots) writeFileSync(join(shots,'measurements.json'),JSON.stringify(sizes,null,2))
}, 180_000)
