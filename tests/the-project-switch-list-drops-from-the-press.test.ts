// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'project-switch-motion',viewport:{width:1440,height:900},theDevServerBecause:'The project switch is reviewed before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`the project list ${reduced?'opens and closes at once':'drops from its switch and fades away'}`,async()=>{
  const films=process.env.W13Y_PROJECT_FILMS,theme=process.env.W13Y_PROJECT_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — project switch',page.locator('.hm-needs'),'project switch');await page.waitForTimeout(600)}
    const press=page.locator('.sbp-switch'),list=page.locator('.sbp-choices')
    await press.waitFor({state:'visible'})
    await expect.poll(()=>press.isEnabled()).toBe(true)
    await press.click()
    await list.waitFor({state:'visible'})
    const opening=await list.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,open:getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()}))
    const ms=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    if(reduced)expect(opening.name).toBe('none')
    else {expect(opening.name).not.toBe('none');expect(ms(opening.duration)).toBe(ms(opening.open))}
    if(films)await page.waitForTimeout(700)
    await press.click()
    if(!reduced){
      await expect.poll(()=>list.getAttribute('data-motion-closing')).toBe('yes')
      expect(await list.getAttribute('aria-hidden')).toBe('true')
      expect(await list.getAttribute('inert')).not.toBeNull()
      const closing=await list.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,quick:getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim()}))
      expect(closing.name).not.toBe('none');expect(ms(closing.duration)).toBe(ms(closing.quick))
    }
    await list.waitFor({state:'hidden'})
    if(films)await page.waitForTimeout(600)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`project-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
