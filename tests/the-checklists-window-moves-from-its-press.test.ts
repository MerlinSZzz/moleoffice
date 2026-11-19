// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app:LiveApp
beforeAll(async()=>{
  app=await liveApp({name:'checklists-motion',viewport:{width:1440,height:900},theDevServerBecause:'The panel motion is checked before its production build.'})
  const reply=await fetch(`${app.api}/api/checklists`,{method:'POST',headers:{'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON},body:JSON.stringify({title:'An invented checklist',items:[{words:'Check an invented item'}]})})
  expect(reply.status,await reply.text()).toBe(201)
},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`the panel ${reduced?'opens and closes at once':'drops open and closes back'}`,async()=>{
  const films=process.env.W13Y_CHECKLIST_FILMS,theme=process.env.W13Y_CHECKLIST_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — checklist window',page.locator('.hm-needs'),'checklist window');await page.waitForTimeout(600)}
    const press=page.locator('.ckw-press'),panel=page.locator('.ckw-panel')
    await press.click();await panel.waitFor()
    const opening=await panel.evaluate(element=>{
      const css=getComputedStyle(element),root=getComputedStyle(document.documentElement)
      return {name:css.animationName,duration:css.animationDuration,open:root.getPropertyValue('--motion-open').trim(),quick:root.getPropertyValue('--motion-quick').trim()}
    })
    const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    if(reduced)expect(opening.name).toBe('none')
    else {
      expect(opening.name).not.toBe('none')
      expect(milliseconds(opening.duration)).toBe(milliseconds(opening.open))
      await page.waitForTimeout(milliseconds(opening.open)+50)
    }
    if(films)await page.waitForTimeout(1000)
    await press.click()
    if(reduced)await panel.waitFor({state:'detached'})
    else {
      expect(await panel.count()).toBe(1)
      expect(await panel.getAttribute('aria-hidden')).toBe('true')
      const closing=await panel.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration}))
      expect(closing.name).not.toBe('none')
      expect(closing.name).not.toBe(opening.name)
      expect(milliseconds(closing.duration)).toBe(milliseconds(opening.quick))
      await panel.waitFor({state:'detached'})
    }
    if(films)await page.waitForTimeout(400)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`checklist-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('keeps the panel shadow visible during the opening',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'})
  const page=await context.newPage()
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await page.addStyleTag({content:'.ckw-panel { animation-play-state: paused !important; animation-delay: calc(-.5 * var(--motion-open)) !important; }'})
    await page.locator('.ckw-press').click()
    const panel=page.locator('.ckw-panel');await panel.waitFor()
    const box=await panel.boundingBox()
    if(box===null)throw new Error('The checklist panel has no box')
    const clip={x:Math.ceil(box.x+box.width+1),y:Math.ceil(box.y+12),width:5,height:12}
    const pixels=async()=>sharp(await page.screenshot({clip})).raw().toBuffer()
    const withShadow=await pixels()
    await panel.evaluate(element=>{element.style.setProperty('box-shadow','none','important')})
    const withoutShadow=await pixels()
    let difference=0
    for(let i=0;i<withShadow.length;i++)difference+=Math.abs(withShadow[i]!-withoutShadow[i]!)
    expect(difference,'the moving panel casts its shadow outside its edge').toBeGreaterThan(100)
    await panel.evaluate(element=>{element.style.setProperty('animation','none','important')})
    const full=await panel.boundingBox()
    expect(full?.height,'the panel is still uncovering at the middle of its opening').toBeGreaterThan(box.height+2)
  }finally{await context.close()}
},120_000)
