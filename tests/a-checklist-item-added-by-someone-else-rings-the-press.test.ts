// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app:LiveApp, checklist:string
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
const agent={...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'checklist-arrival-agent'}
async function post(path:string,body:unknown,headers=person) {
  const answer=await fetch(`${app.api}${path}`,{method:'POST',headers,body:JSON.stringify(body)})
  const text=await answer.text()
  expect(answer.status,text).toBeGreaterThanOrEqual(200)
  expect(answer.status,text).toBeLessThan(300)
  return JSON.parse(text) as {checklist:{id:string}}
}
beforeAll(async()=>{
  app=await liveApp({name:'checklist-arrival-ring',viewport:{width:1440,height:900}})
  await post('/api/agents/started',{handle:'checklist-arrival-agent',name:'Invented Checklist Agent',role:'worker'})
  checklist=(await post('/api/checklists',{title:'An invented checklist',items:[{words:'An invented initial item'}]})).checklist.id
},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`rings for somebody else's new item ${reduced?'without motion':'once'}, not for the person's own`,async()=>{
  const films=process.env.W13Y_CHECKLIST_RING_FILMS,theme=process.env.W13Y_CHECKLIST_RING_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — checklist arrival',page.locator('.hm-needs'),'checklist arrival');await page.waitForTimeout(600)}
    const count=page.locator('.ckw-count'),ring=page.locator('[data-checklist-arrival]')
    await expect.poll(async()=>Number.parseInt((await count.textContent())??'',10),{timeout:30_000}).toBeGreaterThan(0)
    const initial=Number.parseInt((await count.textContent())??'',10)
    expect(await ring.count()).toBe(0)
    await post(`/api/checklists/${checklist}/items`,{words:`The person's invented item ${reduced?'still':'moving'}`})
    await expect.poll(async()=>Number.parseInt((await count.textContent())??'',10),{timeout:30_000}).toBe(initial+1)
    await page.waitForTimeout(1700)
    expect(await ring.count()).toBe(0)
    await post(`/api/checklists/${checklist}/items`,{words:`The agent's invented item ${reduced?'still':'moving'}`},agent)
    await expect.poll(async()=>Number.parseInt((await count.textContent())??'',10),{timeout:30_000}).toBe(initial+2)
    await ring.waitFor({state:'attached',timeout:10_000})
    const state=await ring.evaluate(element=>({animations:element.getAnimations().length,pointer:getComputedStyle(element).pointerEvents}))
    expect(state.pointer).toBe('none')
    if(reduced)expect(state.animations).toBe(0)
    else expect(state.animations).toBeGreaterThan(0)
    await ring.waitFor({state:'detached',timeout:10_000})
    if(films)await page.waitForTimeout(400)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`checklist-arrival-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
