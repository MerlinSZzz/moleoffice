// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'shutdown-question-wait',viewport:{width:1440,height:900},theDevServerBecause:'The question wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`puts one ${reduced?'still':'travelling'} light on the waiting shutdown question`,async()=>{
  const films=process.env.W13Y_SHUTDOWN_FILMS,theme=process.env.W13Y_SHUTDOWN_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await page.route('**/api/office/live-runs',async route=>{
      const answer=await route.fetch(),headers=answer.headers();delete headers['content-length']
      held=true;await gate
      await route.fulfill({status:200,headers,body:JSON.stringify({pausable:[],notPausable:[],mayPress:false,says:'An invented reading.'})})
    })
    await page.locator('.sbp-shut-down').click()
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const dialog=page.locator('dialog.sd-question'),lights=page.locator('canvas[data-wait-light]')
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — shutdown question',dialog.locator('h2'),'shutdown question')
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.first().boundingBox(),box=await dialog.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(reduced && box!==null){
      const accent=await page.evaluate(()=>{const probe=document.createElement('i');probe.style.color='var(--accent)';document.body.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value.match(/\d+/g)!.map(Number)})
      const image=await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({resolveWithObject:true})
      const sides=[0,0,0,0]
      for(let y=0;y<image.info.height;y++)for(let x=0;x<image.info.width;x++){
        const index=(y*image.info.width+x)*4
        if(Math.abs(image.data[index]!-accent[0]!)>30||Math.abs(image.data[index+1]!-accent[1]!)>30||Math.abs(image.data[index+2]!-accent[2]!)>30)continue
        if(x>box.x+12&&x<box.x+box.width-12&&Math.abs(y-box.y)<12)sides[0]!++
        if(x>box.x+12&&x<box.x+box.width-12&&Math.abs(y-(box.y+box.height))<12)sides[1]!++
        if(y>box.y+12&&y<box.y+box.height-12&&Math.abs(x-box.x)<12)sides[2]!++
        if(y>box.y+12&&y<box.y+box.height-12&&Math.abs(x-(box.x+box.width))<12)sides[3]!++
      }
      for(const [side,count] of sides.entries())expect(count,`the frame is visible on side ${side} above the dialog`).toBeGreaterThan(20)
    }
    const sample=()=>lights.first().evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample(),lap=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-lap').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    await page.waitForTimeout(lap/4);const second=await sample()
    expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(lap+200)
    release();await dialog.locator('.px-loading').waitFor({state:'detached',timeout:30_000})
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
    if(films){
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
      await page.screenshot({path:join(films,`shutdown-answer-${theme}-${reduced?'reduced':'motion'}.png`)})
      await page.waitForTimeout(1500)
    }
  }finally{
    release();await page.unrouteAll({behavior:'wait'})
    const video=page.video();await context.close()
    if(films&&video)await video.saveAs(join(films,`shutdown-wait-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
