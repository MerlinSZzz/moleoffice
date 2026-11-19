// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'refreshing-light',viewport:{width:1440,height:900},theDevServerBecause:'The refreshing light is checked in the real shell.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const width of [1440,390])for(const reduced of [false,true])it(`a reread uses one ${reduced?'still':'travelling'} light at ${width}`,async()=>{
  const films=width===1440?process.env.W13Y_REFRESH_FILMS:undefined,theme=process.env.W13Y_REFRESH_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/runtime`)
    await page.locator('.rt-again').waitFor({timeout:30_000})
    await page.locator('.px-reread').waitFor({state:'detached',timeout:30_000})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — refresh',page.locator('.rt-title'),'refresh')
    await page.route('**/api/runtime',async route=>{const answer=await route.fetch();await held;await route.fulfill({response:answer}).catch(()=>{})})
    await page.locator('.rt-again').click()
    const target=page.locator(width>=1024?'.sbp-disc[data-refreshing]':'.shell-menu[data-refreshing]')
    await target.waitFor({state:'visible',timeout:10_000})
    const light=page.locator('canvas[data-wait-light]')
    await expect.poll(()=>light.count(),{timeout:10_000}).toBe(1)
    const geometry=await target.evaluate(element=>{
      const rect=element.getBoundingClientRect(),old=getComputedStyle(element,'::after')
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,oldDisplay:old.display,oldContent:old.content}
    })
    const canvas=await light.boundingBox()
    expect(canvas).not.toBeNull()
    expect(geometry.x).toBeGreaterThanOrEqual(canvas!.x)
    expect(geometry.x).toBeLessThanOrEqual(canvas!.x+canvas!.width)
    expect(geometry.y).toBeGreaterThanOrEqual(canvas!.y)
    expect(geometry.y).toBeLessThanOrEqual(canvas!.y+canvas!.height)
    expect(geometry.oldDisplay==='none'||geometry.oldContent==='none','the old rotating ring is absent').toBe(true)
    expect(await light.evaluate(element=>getComputedStyle(element).pointerEvents)).toBe('none')
    const pixels=()=>light.evaluate(element=>Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(0,0,(element as HTMLCanvasElement).width,(element as HTMLCanvasElement).height).data))
    const first=await pixels()
    const lap=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    await page.waitForTimeout(lap/4)
    const second=await pixels()
    expect(first.some((value,index)=>value!==second[index])).toBe(!reduced)
    if(films)await page.waitForTimeout(lap+200)
    release();await page.locator('.px-reread').waitFor({state:'detached',timeout:10_000})
    await light.waitFor({state:'detached',timeout:10_000})
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`refresh-wait-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)
