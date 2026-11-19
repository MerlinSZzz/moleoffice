// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app:LiveApp, threadId:string
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
beforeAll(async()=>{
  app=await liveApp({name:'persistent-refused-presses',viewport:{width:1440,height:900},theDevServerBecause:'The persistent presses are checked before the production build.'})
  const thread=await fetch(`${app.api}/api/agent/threads`,{method:'POST',headers:person,body:JSON.stringify({title:'An invented conversation',mode:'direct'})})
  expect(thread.status,await thread.clone().text()).toBe(201)
  threadId=((await thread.json()) as {thread:{id:string}}).thread.id
  const message=await fetch(`${app.api}/api/agent/threads/${threadId}/messages`,{method:'POST',headers:person,body:JSON.stringify({intent:'ask',body:'An invented first message.',recipient:{kind:'new'}})})
  expect(message.ok,await message.text()).toBe(true)
},240_000)
afterAll(async()=>{await app?.stop()})

for(const surface of ['conversation','regulations'] as const)it(`fades a refused ${surface} press while the button remains`,async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    if(surface==='conversation'){
      await page.goto(`${app.site}/#/conversations`);await waitForThePage(page)
      await page.locator('.px-thread-row').first().click()
      await page.locator('.px-reply textarea').fill('An invented reply.')
    } else {
      await page.goto(`${app.site}/#/regulations`);await waitForThePage(page)
      await page.getByRole('button',{name:t('regulationsMode.edit'),exact:true}).click()
    }
    const press=surface==='conversation'?page.locator('.px-reply .px-talk-do .px-btn').first():page.locator('.ofc-rule-mark .px-btn').first()
    await press.waitFor({timeout:30_000})
    const endpoint=surface==='conversation'?`**/api/agent/threads/${threadId}/messages`:'**/api/office-regulations/only-this-office'
    await page.route(endpoint,async route=>{if(route.request().method()!=='POST')return route.continue();held=true;await gate;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'An invented refusal.'})})})
    await press.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const light=page.locator('canvas[data-wait-light]');await expect.poll(()=>light.count(),{timeout:10_000}).toBe(1)
    await light.evaluate(element=>{
      const context=(element as HTMLCanvasElement).getContext('2d')!
      context.roundRect=new Proxy(context.roundRect,{apply(target,thisArg,args){document.documentElement.dataset.testSuccessFlash='yes';return Reflect.apply(target,thisArg,args)}})
      const animate=element.animate.bind(element);element.animate=(frames,options)=>{const fade=animate(frames,options);document.documentElement.dataset.testRefusedLight=String(fade.effect?.getTiming().duration);return fade}
    })
    const quick=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    release()
    await expect.poll(()=>page.locator('html').getAttribute('data-test-refused-light'),{timeout:30_000}).toBe(String(quick))
    expect(await page.locator('html').getAttribute('data-test-success-flash')).toBeNull()
    expect(await press.isVisible()).toBe(true)
    await expect.poll(()=>light.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
