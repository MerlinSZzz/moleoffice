// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'reread-arrival-motion',viewport:{width:1440,height:900},theDevServerBecause:'The strip is checked in the real shell.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`a failed reread ${reduced?'appears in place':'rises from the page foot'}`,async()=>{
  const films=process.env.W13Y_REREAD_FILMS,midframe=process.env.W13Y_REREAD_MIDFRAME,theme=process.env.W13Y_REREAD_THEME==='dark'?'dark':'light'
  const evidence=films||midframe
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    // Runtime normally reports this test stack's real paths. The film uses invented paths instead.
    if(evidence)await page.route('**/api/runtime',async route=>{
      const answer=await route.fetch(),headers=answer.headers()
      delete headers['content-length']
      const body=(await answer.text()).replace(/\/(?:home|tmp)\/[^\s"\\]+/g,'/invented/office').replace(/127\.0\.0\.1:\d+/g,'127.0.0.1:1234')
      await route.fulfill({status:answer.status(),headers,body})
    })
    await page.goto(`${app.site}/#/runtime`)
    await page.locator('.rt-again').waitFor({timeout:30_000})
    await page.locator('.px-reread').waitFor({state:'detached',timeout:30_000})
    if(evidence){await putTheMadeUpLabelIn(page,'Made-up data — failed reread',page.locator('.rt-title'),'failed reread');await page.waitForTimeout(600)}
    const refuse=async (route:import('playwright').Route)=>{
      const answer=await route.fetch(),headers=answer.headers()
      delete headers['content-length']
      await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented fault',reason:'An invented reason'})})
    }
    await page.route('**/api/runtime',refuse)
    if(midframe&&!reduced)await page.addStyleTag({content:'.px-reread[data-says="failed"] { animation-play-state: paused !important; animation-delay: calc(-.5 * var(--motion-open)) !important; }'})
    await page.locator('.rt-again').click()
    const strip=page.locator('.px-reread[data-says="failed"]')
    await strip.waitFor({timeout:10_000})
    const motion=await strip.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,open:getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()}))
    if(reduced) expect(motion.name).toBe('none')
    else {
      expect(motion.name).not.toBe('none')
      const ms=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
      expect(ms(motion.duration)).toBe(ms(motion.open))
    }
    if(midframe&&!reduced)await page.screenshot({path:midframe})
    if(films)await page.waitForTimeout(1000)
    await page.unroute('**/api/runtime',refuse)
    await page.locator('.rt-again').click()
    await strip.waitFor({state:'detached',timeout:10_000})
  }finally{
    const video=page.video()
    await page.unrouteAll({behavior:'wait'})
    await context.close()
    if(films&&video)await video.saveAs(join(films,`reread-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

for(const width of [390,1440]) it(`keeps a tall failed-reread strip whole and the last line reachable at ${width}`,async()=>{
  const films=process.env.W13Y_REREAD_FILMS,theme=process.env.W13Y_REREAD_THEME==='dark'?'dark':'light'
  const height=width===390?844:900
  const context=await app.browser.newContext({viewport:{width,height},...(films?{recordVideo:{dir:films,size:{width,height}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    if(films)await page.route('**/api/runtime',async route=>{
      const answer=await route.fetch(),headers=answer.headers()
      delete headers['content-length']
      const body=(await answer.text()).replace(/\/(?:home|tmp)\/[^\s"\\]+/g,'/invented/office').replace(/127\.0\.0\.1:\d+/g,'127.0.0.1:1234')
      await route.fulfill({status:answer.status(),headers,body})
    })
    await page.goto(`${app.site}/?mode=inspect#/runtime`)
    await page.locator('.rt-again').waitFor({timeout:30_000})
    await page.locator('.px-reread').waitFor({state:'detached',timeout:30_000})
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — failed reread',page.locator('.rt-title'),'failed reread');await page.waitForTimeout(600)}
    await page.route('**/api/runtime',async route=>{
      const answer=await route.fetch(),headers=answer.headers()
      delete headers['content-length']
      await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented explanation '.repeat(150),reason:'An invented reason'})})
    })
    await page.locator('.rt-again').click()
    const strip=page.locator('.px-reread[data-says="failed"]')
    await strip.waitFor({timeout:10_000})
    const error=strip.locator('.px-error')
    await expect.poll(async()=>await error.evaluate(element=>element.scrollHeight>element.clientHeight),{timeout:5_000}).toBe(true)
    await page.waitForTimeout(300)
    const stripBox=await strip.boundingBox(),errorBox=await error.boundingBox()
    if(stripBox===null||errorBox===null)throw new Error('The failed strip or its frame has no box')
    expect(stripBox.y+stripBox.height,'the strip ends below the window').toBeLessThanOrEqual(height+0.5)
    expect(errorBox.y+errorBox.height,'the error frame ends below the window').toBeLessThanOrEqual(height+0.5)
    if(width===390){
      const menu=page.locator('.shell-menu'),box=await menu.boundingBox()
      if(box===null)throw new Error('The phone Menu press has no box')
      const reachable=await menu.evaluate(element=>{
        const box=element.getBoundingClientRect(),under=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)
        return under!==null&&(under===element||element.contains(under))
      })
      expect(reachable,'the tall failed strip covers the phone Menu press').toBe(true)
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
      await page.locator('.shell-side[data-drawer="open"]').waitFor({state:'visible'})
      await page.mouse.click(385,600)
      await page.locator('.shell-scrim').waitFor({state:'detached'})
    }
    await page.evaluate(()=>{
      const sentinel=document.createElement('p')
      sentinel.id='test-last-page-line';sentinel.textContent='The invented last line.'
      document.querySelector('main.page')?.append(sentinel)
      window.scrollTo(0,document.documentElement.scrollHeight)
    })
    await expect.poll(async()=>{
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
      const line=await page.locator('#test-last-page-line').boundingBox(),banner=await strip.boundingBox()
      return line!==null&&banner!==null&&line.y+line.height<=banner.y
    },{timeout:5_000}).toBe(true)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — last page line',page.locator('#test-last-page-line'),'last page line');await page.waitForTimeout(1200)}
  }finally{
    const video=page.video()
    await page.unrouteAll({behavior:'wait'});await context.close()
    if(films&&video)await video.saveAs(join(films,`reread-room-${theme}-${width}.webm`))
  }
},120_000)
