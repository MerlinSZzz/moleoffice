// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'wait-light',viewport:{width:1440,height:900},theDevServerBecause:'The wait is checked before its production build.'})},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`a waiting press has a ${reduced?'still':'moving'} accent frame outside it`,async()=>{
  const films=process.env.W13Y_WAIT_LIGHT_FILMS,theme=process.env.W13Y_WAIT_LIGHT_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/ui`);await waitForThePage(page)
    const button=page.locator('.px-btn[data-pending="1"]').first()
    await button.scrollIntoViewIfNeeded();await button.waitFor()
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — component sheet',page.locator('.px-sheet-sec').filter({has:button}),'waiting press')
    const metrics=await button.evaluate(element=>{
      const box=element.getBoundingClientRect(), probe=document.createElement('i')
      probe.style.color='var(--accent)';document.body.append(probe)
      const color=getComputedStyle(probe).color;probe.remove()
      const tokens=getComputedStyle(document.documentElement)
      return {x:box.x,y:box.y,width:box.width,height:box.height,color,delay:tokens.getPropertyValue('--motion-delay').trim(),lap:tokens.getPropertyValue('--motion-lap').trim()}
    })
    const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    const [red,green,blue]=metrics.color.match(/\d+/g)!.map(Number)
    const margin=8
    const clip={x:Math.floor(metrics.x-margin),y:Math.floor(metrics.y-margin),width:Math.ceil(metrics.width+margin*2),height:Math.ceil(metrics.height+margin*2)}
    await page.waitForTimeout(milliseconds(metrics.delay)+200)
    const pixels=async()=>sharp(await page.screenshot({clip})).ensureAlpha().raw().toBuffer({resolveWithObject:true})
    const a=await pixels()
    await page.waitForTimeout(reduced?milliseconds(metrics.delay)*2:milliseconds(metrics.lap)/4)
    const b=await pixels()
    let accent=0,changed=0
    const sides=[new Set<number>(),new Set<number>(),new Set<number>(),new Set<number>()]
    for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++) {
      const screenX=clip.x+x,screenY=clip.y+y
      const outside=screenX<=metrics.x||screenX>=metrics.x+metrics.width||screenY<=metrics.y||screenY>=metrics.y+metrics.height
      if(!outside)continue
      const i=(y*a.info.width+x)*4
      const isAccent=Math.abs(a.data[i]!-red!)<35&&Math.abs(a.data[i+1]!-green!)<35&&Math.abs(a.data[i+2]!-blue!)<35
      if(isAccent)accent++
      const alongX=screenX>metrics.x+12&&screenX<metrics.x+metrics.width-12
      const alongY=screenY>metrics.y+8&&screenY<metrics.y+metrics.height-8
      const side=alongX&&screenY>=metrics.y-4&&screenY<=metrics.y?0:alongX&&screenY>=metrics.y+metrics.height&&screenY<=metrics.y+metrics.height+4?1:alongY&&screenX>=metrics.x-4&&screenX<=metrics.x?2:alongY&&screenX>=metrics.x+metrics.width&&screenX<=metrics.x+metrics.width+4?3:-1
      if(side>=0&&isAccent)sides[side]!.add(side<2?x:y)
      if(Math.abs(a.data[i]!-b.data[i]!) + Math.abs(a.data[i+1]!-b.data[i+1]!) + Math.abs(a.data[i+2]!-b.data[i+2]!) > 45)changed++
    }
    expect(accent,'accent pixels outside the waiting press').toBeGreaterThan(8)
    if(reduced){
      expect(changed,'a reduced-motion frame does not travel').toBe(0)
      for(let side=0;side<sides.length;side++){
        const length=side<2?metrics.width-24:metrics.height-16
        expect(sides[side]!.size/length,`the still frame covers side ${side}; button ${JSON.stringify(metrics)}`).toBeGreaterThan(.3)
      }
    }
    else expect(changed,'the light travels along the frame').toBeGreaterThan(8)
    if(films)await page.waitForTimeout(reduced?milliseconds(metrics.delay)*8:milliseconds(metrics.lap)*2)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`waiting-press-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
