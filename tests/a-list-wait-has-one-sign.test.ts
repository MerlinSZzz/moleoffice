// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'list-wait-motion',viewport:{width:1440,height:900},theDevServerBecause:'The list wait is checked before its production build.'})},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`the first list read keeps its rows still and its frame ${reduced?'still':'moving'}`,async()=>{
  const films=process.env.W13Y_LIST_FILMS,theme=process.env.W13Y_LIST_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  let release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/records?*',async route=>{
    if(route.request().method()==='GET')await held
    await route.continue().catch(()=>{})
  })
  try {
    await page.goto(`${app.site}/#/records`)
    const rows=page.locator('.rec > .px-loading .px-loading-rows'),bars=rows.locator('.px-skel-bar')
    await rows.waitFor({timeout:30_000})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — list loading',page.locator('.rec > .px-loading'),'list loading')
    const metrics=await rows.evaluate(element=>{
      const rect=element.getBoundingClientRect(),root=getComputedStyle(document.documentElement),probe=document.createElement('i')
      probe.style.color='var(--accent)';document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove()
      return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,color,delay:root.getPropertyValue('--motion-delay').trim(),lap:root.getPropertyValue('--motion-lap-wide').trim(),settle:root.getPropertyValue('--motion-settle').trim()}
    })
    const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    expect(await bars.evaluateAll(elements=>elements.every(element=>getComputedStyle(element).animationName==='none'))).toBe(true)
    const margin=8,clip={x:Math.floor(metrics.x-margin),y:Math.floor(metrics.y-margin),width:Math.ceil(metrics.width+margin*2),height:Math.ceil(metrics.height+margin*2)}
    await page.waitForTimeout(milliseconds(metrics.delay)+200)
    const pixels=async()=>sharp(await page.screenshot({clip})).ensureAlpha().raw().toBuffer({resolveWithObject:true})
    const first=await pixels()
    await page.waitForTimeout(reduced?milliseconds(metrics.delay)*2:milliseconds(metrics.lap)/4)
    const second=await pixels()
    let changes=0
    const [red,green,blue]=metrics.color.match(/\d+/g)!.map(Number)
    const sides=[new Set<number>(),new Set<number>(),new Set<number>(),new Set<number>()]
    for(let y=0;y<first.info.height;y++)for(let x=0;x<first.info.width;x++){
      const sx=clip.x+x,sy=clip.y+y
      if(sx>metrics.x&&sx<metrics.x+metrics.width&&sy>metrics.y&&sy<metrics.y+metrics.height)continue
      const i=(y*first.info.width+x)*4
      if(Math.abs(first.data[i]!-second.data[i]!)+Math.abs(first.data[i+1]!-second.data[i+1]!)+Math.abs(first.data[i+2]!-second.data[i+2]!)>45)changes++
      const accent=Math.abs(first.data[i]!-red!)<35&&Math.abs(first.data[i+1]!-green!)<35&&Math.abs(first.data[i+2]!-blue!)<35
      const alongX=sx>metrics.x+12&&sx<metrics.x+metrics.width-12,alongY=sy>metrics.y+8&&sy<metrics.y+metrics.height-8
      const side=alongX&&sy>=metrics.y-8&&sy<=metrics.y?0:alongX&&sy>=metrics.y+metrics.height&&sy<=metrics.y+metrics.height+8?1:alongY&&sx>=metrics.x-8&&sx<=metrics.x?2:alongY&&sx>=metrics.x+metrics.width&&sx<=metrics.x+metrics.width+8?3:-1
      if(side>=0&&accent)sides[side]!.add(side<2?x:y)
    }
    if(reduced){
      expect(changes).toBe(0)
      for(let side=0;side<sides.length;side++)expect(sides[side]!.size/(side<2?metrics.width-24:metrics.height-16),`the still frame covers side ${side}`).toBeGreaterThan(.3)
    }
    else {
      const lights=await page.locator('canvas[data-wait-light]').evaluateAll(elements=>elements.map(element=>{
        const rect=element.getBoundingClientRect(),style=getComputedStyle(element)
        return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,visibility:style.visibility}
      }))
      expect(changes,`frame ${JSON.stringify(metrics)}, lights ${JSON.stringify(lights)}, errors ${JSON.stringify(errors)}`).toBeGreaterThan(8)
    }
    if(films)await page.waitForTimeout(reduced?500:milliseconds(metrics.lap)*2)
    release()
    await rows.waitFor({state:'detached',timeout:30_000})
    if(reduced)await page.locator('canvas[data-wait-light]').waitFor({state:'detached',timeout:5_000})
    else {
      const light=page.locator('canvas[data-wait-light]')
      await light.waitFor({state:'visible',timeout:2_000})
      expect(await light.evaluate((element,duration)=>element.getAnimations().some(animation=>animation.effect?.getTiming().duration===duration),milliseconds(metrics.settle)), 'the frame settles after a successful answer').toBe(true)
    }
    if(films)await page.waitForTimeout(600)
  }finally{
    release()
    const video=page.video()
    await page.unrouteAll({behavior:'wait'})
    await context.close()
    if(films&&video)await video.saveAs(join(films,`list-wait-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('fades the waiting light quickly when the first list read fails',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}})
  const page=await context.newPage()
  let release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/records?*',async route=>{
    if(route.request().method()!=='GET'){await route.continue();return}
    const answer=await route.fetch(),headers=answer.headers()
    delete headers['content-length']
    await held
    await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented list fault'})}).catch(()=>{})
  })
  try{
    await page.goto(`${app.site}/#/records`)
    const rows=page.locator('.rec > .px-loading .px-loading-rows')
    await rows.waitFor({timeout:30_000})
    const light=page.locator('canvas[data-wait-light]')
    await light.waitFor({state:'visible',timeout:10_000})
    await light.evaluate(element=>{
      const animate=element.animate.bind(element)
      element.animate=(keyframes,options)=>{
        const result=animate(keyframes,options)
        document.documentElement.dataset.testFailedLightDuration=String(result.effect?.getTiming().duration)
        return result
      }
    })
    const quick=await page.evaluate(()=>{
      const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim()
      return parseFloat(value)*(value.endsWith('ms')?1:1000)
    })
    release()
    await rows.waitFor({state:'detached',timeout:30_000})
    await expect.poll(()=>page.locator('html').getAttribute('data-test-failed-light-duration')).toBe(String(quick))
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
