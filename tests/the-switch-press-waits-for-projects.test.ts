// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SWITCH PRESS WAITS WHILE THE PROJECTS ARE READ, and opens the list once they have come.
 *
 * Round 161 of wave 13y made the press wait until there is a list to open, as the sidebar did before and as
 * tests/workspace-switcher.test.ts requires of the drawing: no list while there is nothing to choose from. This file
 * first proved a press made while the projects were read, with a waiting light on it. That press is no longer offered,
 * so the file now proves the wait in a browser, with the projects held back by the test:
 *
 *   - success: while the projects are read the press is disabled, no waiting light is on it and nothing is read again;
 *     once they have come, one press opens the list. In motion and with reduced motion.
 *   - failure: when the projects could not be read, the press stays disabled and the wait line says so.
 *   - cancel: once the projects have come, a second press shuts the list it opened.
 *
 * MUTATION: the press enabled while the projects are read (`disabled={workspaces.status === 'error'}` in
 * src/web/components/Sidebar.tsx) turns all four cases red at their first check.
 *
 * Set W13Y_SWITCH_FILMS to a folder outside the checkout to film the success cases, and W13Y_SWITCH_THEME to dark for
 * the dark look. Every project here is made up, and a film says so above the page.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
beforeAll(async()=>{app=await liveApp({name:'switch-project-wait',viewport:{width:1440,height:900},theDevServerBecause:'The switch wait is checked before the production build.'})},240_000)
afterAll(async()=>{await app?.stop()})
for(const outcome of ['success','failure','cancel'] as const) for(const reduced of outcome==='success'?[false,true]:[true]) it(`the Switch press waits while projects read: ${outcome}, ${reduced?'reduced':'motion'}`,async()=>{
  const films=outcome==='success'?process.env.W13Y_SWITCH_FILMS:undefined,theme=process.env.W13Y_SWITCH_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.route('**/api/workspaces',async route=>{
      reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate
      await route.fulfill(outcome==='failure'?{status:500,headers,body:JSON.stringify({error:'An invented projects failure.'})}:{response:answer})
    })
    await page.goto(`${app.site}/#/`,{waitUntil:'domcontentloaded'})
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const button=page.locator('.sbp-switch');await button.waitFor({timeout:30_000})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — project switch',page.locator('.shell-main'),'project switch')
    const lightsOnSwitch=()=>page.evaluate(()=>{
      const button=document.querySelector('.sbp-switch')!.getBoundingClientRect()
      return [...document.querySelectorAll('canvas[data-wait-light]')].filter(element=>{
        const frame=element.getBoundingClientRect()
        return frame.x<=button.x&&frame.y<=button.y&&frame.right>=button.right&&frame.bottom>=button.bottom
      }).length
    })
    // WHILE THE PROJECTS ARE READ there is no list to open, so the press waits and draws nothing over itself.
    expect(await button.isDisabled(),'the press while the projects are read').toBe(true)
    expect(await button.getAttribute('aria-expanded')).toBe('false')
    expect(await lightsOnSwitch()).toBe(0)
    if(films)await page.waitForTimeout(1400)
    expect(reads).toBe(1)
    release()
    if(outcome==='failure'){
      await page.locator('.sbp-choices-wait').waitFor()
      expect(await button.isDisabled(),'the press after the projects failed').toBe(true)
    }else{
      await expect.poll(()=>button.isDisabled(),{timeout:30_000}).toBe(false)
      await button.click({timeout:3000})
      await expect.poll(()=>button.getAttribute('aria-expanded'),{timeout:30_000}).toBe('true')
      if(outcome==='cancel'){
        await button.click({timeout:3000})
        await expect.poll(()=>button.getAttribute('aria-expanded'),{timeout:30_000}).toBe('false')
      }
    }
    // A second read here is another part of the page asking for the projects, not the press reading again: a
    // failed read is not kept, so an asker that mounts after the 500 starts a new request. The read the press
    // must not make was counted before the release, so the failure case does not count reads after it.
    if(outcome!=='failure')expect(reads).toBe(1)
    await expect.poll(lightsOnSwitch,{timeout:10_000}).toBe(0)
    if(films){
      await page.evaluate(()=>{const label=document.querySelector<HTMLElement>('[data-made-up-label]');if(label)label.textContent='Made-up data — project switch, answer drawn'})
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
      await page.screenshot({path:join(films,`switch-answer-${theme}-${reduced?'reduced':'motion'}.png`)})
      await page.waitForTimeout(1500)
    }
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`switch-wait-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)
