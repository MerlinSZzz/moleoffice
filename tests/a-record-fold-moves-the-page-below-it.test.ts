// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp,recordId:string
beforeAll(async()=>{
  app=await liveApp({name:'record-fold-motion',viewport:{width:1440,height:900},theDevServerBecause:'The fold is checked before its production build.'})
  const reply=await fetch(`${app.api}/api/records`,{
    method:'POST',headers:{'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON,'x-mole-office-workspace':'default'},
    body:JSON.stringify({kind:'problem',title:'An invented problem for the fold',data:{symptom:'An invented symptom that gives this fold something to show.',why_it_hurts:'An invented consequence.',state:'open',whose_move:'person'}}),
  })
  const answer=await reply.json() as {record?:{id:string};error?:string}
  expect(reply.status,JSON.stringify(answer)).toBe(201);recordId=answer.record!.id
},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`a record fold ${reduced?'changes height at once':'moves to its height'} and turns its arrow`,async()=>{
  const films=process.env.W13Y_FOLD_FILMS,theme=process.env.W13Y_FOLD_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/r/${recordId}`);await waitForThePage(page)
    const fold=page.locator('.rd-fold-body').first(),summary=fold.locator('summary').first()
    await summary.waitFor({timeout:30_000})
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — record fold',fold,'record fold');await page.waitForTimeout(600)}
    const closed=(await fold.boundingBox())!.height
    const closedArrow=await summary.evaluate(element=>getComputedStyle(element,'::before').transform)
    const timing=await fold.evaluate(()=>{
      const root=getComputedStyle(document.documentElement)
      return {open:root.getPropertyValue('--motion-open').trim(),quick:root.getPropertyValue('--motion-quick').trim(),delay:root.getPropertyValue('--motion-delay').trim()}
    })
    const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    await summary.click()
    const early=(await fold.boundingBox())!.height
    const arrow=await summary.evaluate(element=>({transform:getComputedStyle(element,'::before').transform,duration:getComputedStyle(element,'::before').transitionDuration}))
    await page.waitForTimeout(milliseconds(timing.open)+milliseconds(timing.delay))
    const fullyOpen=(await fold.boundingBox())!.height
    const openArrow=await summary.evaluate(element=>getComputedStyle(element,'::before').transform)
    expect(fullyOpen).toBeGreaterThan(closed+10)
    expect(openArrow).not.toBe(closedArrow)
    if(reduced){expect(Math.abs(early-fullyOpen)).toBeLessThan(2);expect(milliseconds(arrow.duration)).toBe(milliseconds(timing.quick))}
    else {
      expect(early).toBeLessThan(fullyOpen-2)
      expect(milliseconds(arrow.duration)).toBe(milliseconds(timing.quick))
    }
    if(films)await page.waitForTimeout(800)
    await summary.click()
    const closing=(await fold.boundingBox())!.height
    await page.waitForTimeout(milliseconds(timing.open)+milliseconds(timing.delay))
    const fullyClosed=(await fold.boundingBox())!.height
    expect(Math.abs(fullyClosed-closed)).toBeLessThan(2)
    if(reduced)expect(Math.abs(closing-fullyClosed)).toBeLessThan(2)
    else expect(closing).toBeGreaterThan(fullyClosed+2)
    if(films)await page.waitForTimeout(400)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`fold-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('moves the whole fold height without a final or initial jump',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'})
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/r/${recordId}`);await waitForThePage(page)
    const fold=page.locator('.rd-fold-body').first(),summary=fold.locator('summary').first()
    await summary.waitFor({timeout:30_000})
    // Slow the same declared transition so the browser can be sampled near each endpoint.
    await page.evaluate(()=>document.documentElement.style.setProperty('--motion-open','2s'))
    const duration=await fold.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-open'))*1000)
    await summary.click()
    await page.waitForTimeout(duration*.95)
    const almost=(await fold.boundingBox())!
    const almostOpen=almost.y+almost.height
    await page.waitForTimeout(duration*.15)
    const fullyOpen=(await fold.boundingBox())!
    expect(Math.abs(fullyOpen.y+fullyOpen.height-almostOpen),'the last instant of opening adds no unanimated space').toBeLessThan(3)
    await summary.click()
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
    const closing=(await fold.boundingBox())!
    const startClose=closing.y+closing.height
    expect(Math.abs(startClose-(fullyOpen.y+fullyOpen.height)),'closing removes no unanimated space').toBeLessThan(3)
  }finally{await context.close()}
},120_000)
