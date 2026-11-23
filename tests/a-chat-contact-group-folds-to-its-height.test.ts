// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_ROLE_GROUPS } from '../src/shared/contacts.ts'
import { openTheChat } from './open-the-chat.ts'

let app:LiveApp
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
const upperRole=AGENT_ROLE_GROUPS[0]!.key,lowerRole=AGENT_ROLE_GROUPS[3]!.key
async function add(handle:string,name:string,role:string) {
  let answer=await fetch(`${app.api}/api/records`,{method:'POST',headers:person,body:JSON.stringify({kind:'agent',title:name,data:{handle,runtime:'claude-code',state:'active',role}})})
  expect(answer.status,await answer.text()).toBe(201)
  answer=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':handle},body:JSON.stringify({kind:'message',title:`A made-up line from ${name}`,data:{body:`A made-up line from ${name}`,to:[{kind:'person',id:THE_PERSON}]}})})
  expect(answer.status,await answer.text()).toBe(201)
}
beforeAll(async()=>{
  app=await liveApp({name:'contact-group-fold-motion',viewport:{width:1440,height:900},theDevServerBecause:'The contacts fold is checked before the production build.'})
  await add('fold-secretary','Invented Secretary',upperRole)
  await add('fold-worker','Invented Worker',lowerRole)
},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`moves the groups below a fold ${reduced?'at once':'over the fold duration'}`,async()=>{
  const reset=await fetch(`${app.api}/api/messages/contact-groups/${upperRole}`,{method:'PATCH',headers:person,body:JSON.stringify({collapsed:false})})
  expect(reset.status,await reset.text()).toBe(200)
  const films=process.env.W13Y_CONTACT_FOLD_FILMS,theme=process.env.W13Y_CONTACT_FOLD_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — contact fold',page.locator('.hm-needs'),'contact fold');await page.waitForTimeout(600)}
    await openTheChat(page)
    await page.locator('.px-chat-tab[data-tab="contacts"]').click()
    const group=page.locator(`.px-chat-group-of[data-group="${upperRole}"]`)
    const lower=page.locator(`.px-chat-group-of[data-group="${lowerRole}"]`)
    const fold=group.locator('.px-chat-fold')
    await group.locator('.px-chat-contact').first().waitFor({timeout:30_000})
    await lower.waitFor({timeout:30_000})
    if(!films)await page.addStyleTag({content:':root { --motion-open: 2000ms !important; }'})
    const original=await lower.evaluate(element=>element.getBoundingClientRect().top)
    if(films)await page.waitForTimeout(800)
    await fold.click()
    await expect.poll(()=>fold.getAttribute('aria-expanded'),{timeout:30_000}).toBe('false')
    const start=await lower.evaluate(element=>element.getBoundingClientRect().top)
    if(reduced){
      expect(start).toBeLessThan(original-10)
    }else if(films){
      await page.waitForTimeout(400)
      expect(await lower.evaluate(element=>element.getBoundingClientRect().top)).toBeLessThan(original-10)
    }else{
      await page.waitForTimeout(500)
      const middle=await lower.evaluate(element=>element.getBoundingClientRect().top)
      await page.waitForTimeout(1800)
      const end=await lower.evaluate(element=>element.getBoundingClientRect().top)
      expect(start-middle).toBeGreaterThan(2)
      expect(middle-end).toBeGreaterThan(2)
      expect(original-end).toBeGreaterThan(10)
    }
    if(films)await page.waitForTimeout(800)
    await fold.click()
    await expect.poll(()=>fold.getAttribute('aria-expanded'),{timeout:30_000}).toBe('true')
    if(!reduced&&films)await page.waitForTimeout(400)
    await group.locator('.px-chat-contact').first().waitFor({timeout:30_000})
    if(films)await page.waitForTimeout(500)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`contact-fold-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('keeps each contact time and unread count inside the chat panel as groups fold',async()=>{
  const reset=await fetch(`${app.api}/api/messages/contact-groups/${upperRole}`,{method:'PATCH',headers:person,body:JSON.stringify({collapsed:false})})
  expect(reset.status,await reset.text()).toBe(200)
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChat(page)
    await page.locator('.px-chat-tab[data-tab="contacts"]').click()
    const panel=page.locator('.px-chat'),upper=page.locator(`.px-chat-group-of[data-group="${upperRole}"]`),lower=page.locator(`.px-chat-group-of[data-group="${lowerRole}"]`)
    const check=async (group:typeof upper)=>{
      const row=group.locator('.px-chat-contact').first()
      await row.waitFor({timeout:30_000})
      const bounds=await panel.boundingBox(),time=await row.locator('.px-chat-contact-when').boundingBox(),badge=await row.locator('.px-chat-unread').boundingBox()
      if(bounds===null||time===null||badge===null)throw new Error('A contact time or unread count was not drawn')
      expect(time.x+time.width,'the contact time is cut by the panel').toBeLessThanOrEqual(bounds.x+bounds.width)
      expect(badge.x+badge.width,'the unread count is cut by the panel').toBeLessThanOrEqual(bounds.x+bounds.width)
    }
    await check(upper);await check(lower)
    const fold=upper.locator('.px-chat-fold')
    await fold.click();await expect.poll(()=>fold.getAttribute('aria-expanded'),{timeout:30_000}).toBe('false')
    await page.waitForTimeout(400)
    await check(lower)
  }finally{await context.close()}
},120_000)
