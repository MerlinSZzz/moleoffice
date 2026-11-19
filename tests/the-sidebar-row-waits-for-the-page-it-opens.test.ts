// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { familyPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

// Test change (wave 13y round 165): All records has no sidebar row now, so the row pressed is Reports. Its page reads
// GET /api/records/reports-and-notes and draws loading rows while it waits, so that is the read held, and a film labels
// the page rather than the record list's filter bar.
let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'sidebar-page-wait',viewport:{width:1440,height:900},theDevServerBecause:'The sidebar navigation wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`shows one ${reduced?'still':'travelling'} light on the sidebar row until the page answers`,async()=>{
  const films=process.env.W13Y_SIDE_FILMS,theme=process.env.W13Y_SIDE_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — sidebar wait',page.locator('.hm-needs'),'sidebar wait');await page.waitForTimeout(500)}
    await page.route('**/api/records/reports-and-notes?**',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    const row=page.locator(`.shell-side a[href="#${familyPath('notes')}"]`).first()
    await row.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — sidebar wait',page.locator('main.page'),'sidebar wait')
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    await expect.poll(async()=>{
      const frame=await lights.first().boundingBox(),button=await row.boundingBox()
      return frame!==null&&button!==null&&button.x+button.width/2>=frame.x&&button.x+button.width/2<=frame.x+frame.width&&button.y+button.height/2>=frame.y&&button.y+button.height/2<=frame.y+frame.height
    },{timeout:10_000}).toBe(true)
    const sample=()=>lights.first().evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample()
    const lap=await page.evaluate(()=>{const word=getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim();return parseFloat(word)*(word.endsWith('ms')?1:1000)})
    await page.waitForTimeout(lap/4);const second=await sample()
    expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(lap+200)
    release();await page.locator('.px-loading').waitFor({state:'detached',timeout:30_000})
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{
    release();await page.unrouteAll({behavior:'wait'})
    const video=page.video();await context.close()
    if(films&&video)await video.saveAs(join(films,`sidebar-wait-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
