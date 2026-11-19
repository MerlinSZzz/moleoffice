// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { familyPath, pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

// Test change (wave 13y round 165): the menu holds only the entries in front, so the first three cases press Reports,
// whose page reads GET /api/records/reports-and-notes and draws loading rows while it waits, and hold that read. The
// fourth presses Decisions, whose page reads its forks with no loading rows. All records and the toolset are on All
// pages now, out of the menu.
let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'phone-menu-page-wait',viewport:{width:390,height:844},theDevServerBecause:'The phone navigation wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`keeps one ${reduced?'still':'travelling'} light on Menu until the chosen page answers`,async()=>{
  const films=process.env.W13Y_MENU_FILMS,theme=process.env.W13Y_MENU_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:390,height:844}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — phone Menu wait',page.locator('main.page'),'phone Menu wait');await page.waitForTimeout(500)}
    await page.route('**/api/records/reports-and-notes?**',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    const menu=page.locator('.shell-menu'),box=await menu.boundingBox()
    if(box===null)throw new Error('The phone Menu press has no box')
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
    const row=page.locator(`.shell-side a[href="#${familyPath('notes')}"]`).first()
    await row.click()
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const light=lights.first()
    await expect.poll(async()=>{
      const frame=await light.boundingBox(),button=await menu.boundingBox()
      return frame!==null&&button!==null&&button.x+button.width/2>=frame.x&&button.x+button.width/2<=frame.x+frame.width&&button.y+button.height/2>=frame.y&&button.y+button.height/2<=frame.y+frame.height
    },{timeout:10_000}).toBe(true)
    const sample=()=>light.evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample()
    const lap=await page.evaluate(()=>{const word=getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim();return parseFloat(word)*(word.endsWith('ms')?1:1000)})
    await page.waitForTimeout(lap/4)
    const second=await sample()
    expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(lap+200)
    release()
    await page.locator('.px-loading').waitFor({state:'detached',timeout:30_000})
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
    expect(await menu.evaluate(element=>element.matches(':focus-visible')), 'a pointer-opened drawer does not leave a keyboard focus ring on Menu').toBe(false)
  }finally{
    release();await page.unrouteAll({behavior:'wait'})
    const video=page.video();await context.close()
    if(films&&video)await video.saveAs(join(films,`menu-wait-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('ends the Menu light as a failure when the chosen page cannot be read',async()=>{
  const context=await app.browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await page.evaluate(()=>{
      const animate=Element.prototype.animate
      Element.prototype.animate=function(keyframes,options){
        if(this.matches('canvas[data-wait-light]')) (window as Window & {waitEnds?:number[]}).waitEnds=[...((window as Window & {waitEnds?:number[]}).waitEnds??[]),typeof options==='number'?options:Number(options?.duration)]
        return animate.call(this,keyframes,options)
      }
    })
    await page.route('**/api/records/reports-and-notes?**',async route=>{held=true;await gate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'The invented read failed.'})})})
    const menu=page.locator('.shell-menu'),box=await menu.boundingBox()
    if(box===null)throw new Error('The phone Menu press has no box')
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
    await page.locator(`.shell-side a[href="#${familyPath('notes')}"]`).first().click()
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await expect.poll(()=>page.locator('canvas[data-wait-light]').count(),{timeout:10_000}).toBe(1)
    const lightBox=await page.locator('canvas[data-wait-light]').first().boundingBox(),menuBox=await menu.boundingBox()
    expect(lightBox!==null&&menuBox!==null&&menuBox.x+menuBox.width/2>=lightBox.x&&menuBox.x+menuBox.width/2<=lightBox.x+lightBox.width&&menuBox.y+menuBox.height/2>=lightBox.y&&menuBox.y+menuBox.height/2<=lightBox.y+lightBox.height).toBe(true)
    release()
    await page.locator('.px-error').first().waitFor({timeout:30_000})
    const quick=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    await expect.poll(()=>page.evaluate(()=>(window as Window & {waitEnds?:number[]}).waitEnds??[]),{timeout:10_000}).toContain(quick)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('waits for a page that uses a plain status line instead of loading rows',async()=>{
  const context=await app.browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await page.route('**/api/forks',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    const menu=page.locator('.shell-menu'),box=await menu.boundingBox()
    if(box===null)throw new Error('The phone Menu press has no box')
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
    const row=page.locator(`.shell-side a[href="#${pathFor('governance')}"]`).first()
    await row.click()
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await expect.poll(()=>page.locator('canvas[data-wait-light]').count(),{timeout:10_000}).toBe(1)
    const lightBox=await page.locator('canvas[data-wait-light]').first().boundingBox(),menuBox=await menu.boundingBox()
    expect(lightBox!==null&&menuBox!==null&&menuBox.x+menuBox.width/2>=lightBox.x&&menuBox.x+menuBox.width/2<=lightBox.x+lightBox.width&&menuBox.y+menuBox.height/2>=lightBox.y&&menuBox.y+menuBox.height/2<=lightBox.y+lightBox.height).toBe(true)
    release()
    await page.locator('.gq-title').waitFor({timeout:30_000})
    await expect.poll(()=>page.locator('canvas[data-wait-light]').count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
