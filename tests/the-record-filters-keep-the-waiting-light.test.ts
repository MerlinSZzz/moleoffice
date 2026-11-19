// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'record-search-wait',viewport:{width:1440,height:900},theDevServerBecause:'The search wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`keeps one ${reduced?'still':'travelling'} light on the search field until its answer is drawn`,async()=>{
  const films=process.env.W13Y_FILTER_FILMS,theme=process.env.W13Y_FILTER_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — record search',page.locator('.rec-filterbar'),'record search')
    await page.route('**/api/records?**',async route=>{
      if(new URL(route.request().url()).searchParams.get('q')!=='invented-wait')return route.continue()
      const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})
    })
    const field=page.getByRole('textbox',{name:t('g7a.records.search'),exact:true})
    await field.fill('invented-wait');await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    await expect.poll(async()=>{const frame=await lights.first().boundingBox(),box=await field.boundingBox();return frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height},{timeout:10_000}).toBe(true)
    const sample=()=>lights.first().evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample(),lap=await page.evaluate(()=>{const word=getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim();return parseFloat(word)*(word.endsWith('ms')?1:1000)})
    await page.waitForTimeout(lap/4);const second=await sample();expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(lap+200)
    release();await waitForThePage(page)
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`search-wait-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)

it('ends the search light without a flash when the new reading fails',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    await page.route('**/api/records?**',async route=>{
      if(new URL(route.request().url()).searchParams.get('q')!=='invented-failure')return route.continue()
      const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate
      await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented search failure.'})})
    })
    const field=page.getByRole('textbox',{name:t('g7a.records.search'),exact:true})
    await field.fill('invented-failure');await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const light=page.locator('canvas[data-wait-light]');await expect.poll(()=>light.count(),{timeout:10_000}).toBe(1)
    const frame=await light.boundingBox(),box=await field.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    await light.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const result=animate(frames,options);document.documentElement.dataset.testSearchLightDuration=String(result.effect?.getTiming().duration);return result}})
    const quick=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    release()
    await expect.poll(()=>page.locator('html').getAttribute('data-test-search-light-duration'),{timeout:10_000}).toBe(String(quick))
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('keeps the waiting light on the chosen kind until its list answers',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const select=page.getByRole('combobox',{name:t('g7a.records.kind'),exact:true})
    const chosen=await select.locator('option').evaluateAll(options=>options.map(option=>(option as HTMLOptionElement).value).find(value=>value!=='')!)
    await page.route('**/api/records?**',async route=>{
      if(new URL(route.request().url()).searchParams.get('kind')!==chosen)return route.continue()
      const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})
    })
    await select.selectOption(chosen);await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.first().boundingBox(),box=await select.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    release();await waitForThePage(page);await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
