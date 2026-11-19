// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'phone-drawer-motion',viewport:{width:390,height:844},theDevServerBecause:'The drawer is checked on a real phone-size shell.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`the phone drawer ${reduced?'opens and closes at once':'slides in and out with the scrim'}`,async()=>{
  const films=process.env.W13Y_DRAWER_FILMS,theme=process.env.W13Y_DRAWER_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:390,height:844}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — phone drawer',page.locator('.hm-needs'),'phone drawer');await page.waitForTimeout(600)}
    const scrollBefore=await page.evaluate(()=>{
      const spacer=document.createElement('div');spacer.style.height='1200px';spacer.setAttribute('aria-hidden','true')
      document.querySelector('.shell-main')!.append(spacer)
      if(window.scrollY<40)window.scrollTo(0,100)
      return window.scrollY
    })
    expect(scrollBefore).toBeGreaterThan(0)
    const drawer=page.locator('.shell-side'),menu=page.locator('.shell-menu')
    const menuBefore=await menu.evaluate(element=>{const box=element.getBoundingClientRect();element.addEventListener('click',()=>{(window as unknown as {scrollAtMenuClick:number}).scrollAtMenuClick=window.scrollY},{once:true,capture:true});return {top:box.top,bottom:box.bottom}})
    // A locator click scrolls even this already-visible sticky press to the document top. A real
    // pointer press at its visible centre does not perform that test-tool scroll.
    const button=await menu.boundingBox()
    if(button===null)throw new Error('The Menu press has no box')
    await page.mouse.click(button.x+button.width/2,button.y+button.height/2)
    await drawer.waitFor({state:'visible'})
    const afterOpen=await page.evaluate(()=>({scroll:window.scrollY,atClick:(window as unknown as {scrollAtMenuClick:number}).scrollAtMenuClick}))
    expect(afterOpen.scroll,`menu bounds before click ${JSON.stringify(menuBefore)}, scroll at click ${String(afterOpen.atClick)}`).toBe(scrollBefore)
    const opening=await drawer.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,open:getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()}))
    const ms=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    if(reduced)expect(opening.name).toBe('none')
    else {expect(opening.name).not.toBe('none');expect(ms(opening.duration)).toBe(ms(opening.open))}
    if(films)await page.waitForTimeout(700)
    await page.mouse.click(385,600)
    if(!reduced){
      await expect.poll(()=>drawer.getAttribute('data-motion-closing')).toBe('yes')
      const closing=await drawer.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,quick:getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim()}))
      expect(closing.name).not.toBe('none');expect(ms(closing.duration)).toBe(ms(closing.quick))
    }
    await drawer.waitFor({state:'hidden'})
    expect(await page.locator('.shell-scrim').count()).toBe(0)
    expect(await page.evaluate(()=>window.scrollY)).toBe(scrollBefore)
    if(films)await page.waitForTimeout(600)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`drawer-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
