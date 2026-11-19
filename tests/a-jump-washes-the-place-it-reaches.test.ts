// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'

let app:LiveApp,record:string
beforeAll(async()=>{
  app=await liveApp({name:'jump-wash',viewport:{width:1440,height:900}})
  const answer=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON},body:JSON.stringify({kind:'note',title:'An invented history',data:{body:'An invented record.'}})})
  const body=await answer.text();expect(answer.status,body).toBe(201)
  record=(JSON.parse(body) as {record:{id:string}}).record.id
},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`the place a chapter jump reaches is ${reduced?'held still in a wash':'washed after the scroll'}`,async()=>{
  const context=await app.browser.newContext({reducedMotion:reduced?'reduce':'no-preference'})
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/regulations`);await waitForThePage(page)
    const button=page.locator('.ofc-toc-go').last()
    await button.waitFor({timeout:30_000})
    const number=await button.getAttribute('data-chapter')
    const heading=page.locator(`#ofc-ch-${number}`)
    const before=await heading.evaluate(element=>getComputedStyle(element).backgroundColor)
    const linger=await page.evaluate(()=>{
      const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-linger-period').trim()
      return value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    })
    await button.click()
    await expect.poll(()=>heading.evaluate(element=>getComputedStyle(element).backgroundColor),{timeout:5_000}).not.toBe(before)
    if(reduced)expect(await heading.evaluate(element=>element.getAnimations().length)).toBe(0)
    else expect(await heading.evaluate((element,duration)=>element.getAnimations().some(animation=>animation.effect?.getTiming().duration===duration),linger)).toBe(true)
    const edge=await heading.evaluate((element,{reduced,linger})=>{
      const width=getComputedStyle(document.documentElement).getPropertyValue('--focus-w').trim()
      const animation=element.getAnimations().find(one=>one.effect?.getTiming().duration===linger)
      const shadow=reduced?getComputedStyle(element).boxShadow:String((animation?.effect as KeyframeEffect|undefined)?.getKeyframes()[0]?.boxShadow??'')
      return {width,shadow}
    },{reduced,linger})
    expect(edge.shadow,'the wash has an inset edge on all four sides').toContain(`0px 0px 0px ${edge.width}`)
    await page.waitForTimeout(linger+200)
    expect(await heading.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(before)
  }finally{await context.close()}
},120_000)

for(const reduced of [false,true]) for(const place of ['record history','Settings'] as const) it(`washes the ${place} reached by a jump ${reduced?'without motion':'once'}`,async()=>{
  const context=await app.browser.newContext({reducedMotion:reduced?'reduce':'no-preference'}),page=await context.newPage()
  try{
    let target:import('playwright').Locator
    if(place==='record history'){
      await page.goto(`${app.site}/#${recordPath(record,undefined,'history')}`)
      target=page.locator('.rh-fold')
      await target.waitFor({timeout:30_000})
    }else{
      await page.goto(`${app.site}/?mode=inspect#/settings`);await waitForThePage(page)
      const press=page.locator('.sf-jump:not([aria-current="true"])').first()
      await press.waitFor({timeout:30_000})
      const category=await press.getAttribute('data-category')
      await press.click()
      target=page.locator(`.sf-cat[data-category="${category}"] .sf-cat-title`)
      await target.waitFor({timeout:30_000})
    }
    const linger=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-linger-period').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    await expect.poll(()=>target.evaluate((element,{reduced,linger})=>reduced?element.style.boxShadow!=='' : element.getAnimations().some(animation=>animation.effect?.getTiming().duration===linger),{reduced,linger}),{timeout:5_000}).toBe(true)
    await page.waitForTimeout(linger+200)
    expect(await target.evaluate(element=>element.style.boxShadow)).toBe('')
  }finally{await context.close()}
},120_000)
