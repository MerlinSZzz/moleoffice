// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
const contact={id:'arrival-contact',name:'Arrival Contact'}
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
const agent={...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':contact.id}
const first='An invented message already here'

async function write(headers:Record<string,string>,kind:string,title:string,data:unknown) {
  const record={kind,title,data}
  const answer=await fetch(`${app.api}/api/records`,{method:'POST',headers,body:JSON.stringify(record)})
  const body=await answer.text()
  expect(answer.status,body).toBe(theAnswerToAWriteInATestOffice(headers,record))
  return JSON.parse(body) as {record:{id:string}}
}
beforeAll(async()=>{
  app=await liveApp({name:'chat-arrival-motion',viewport:{width:1440,height:900},theDevServerBecause:'The arrival is checked before its production build.'})
  // This test reads the count on the sidebar's Chat row, which carries it only when the button stays while there are unread messages.
  const unreadOnly=await fetch(`${app.api}/api/participants/person/${THE_PERSON}`,{method:'PATCH',headers:person,body:JSON.stringify({chatButtonStays:'when-unread'})})
  expect(unreadOnly.status,await unreadOnly.clone().text()).toBe(200)
  await write(person,'agent',contact.name,{handle:contact.id,runtime:'claude-code',state:'active'})
  await write(person,'message',first,{body:first,to:[{kind:'agent',id:contact.id}]})
},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`draws an arriving message ${reduced?'without motion':'with one rise'}, but leaves the opened history still`,async()=>{
  const films=process.env.W13Y_CHAT_ARRIVAL_FILMS,theme=process.env.W13Y_CHAT_ARRIVAL_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — chat arrival',page.locator('.hm-needs'),'chat arrival')
    await openTheChatBeside(page)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click()
    const old=page.locator('.px-chat-said .px-chat-one').filter({hasText:first})
    await old.waitFor()
    if(films)await page.waitForTimeout(600)
    expect(await old.evaluate(element=>getComputedStyle(element).animationName)).toBe('none')
    await expect.poll(()=>page.locator('.shell-side .shell-chat .shell-chat-count').count()).toBe(0)
    await page.evaluate(()=>{
      const row=document.querySelector('.shell-side .shell-chat')!
      const readings:number[]=[]
      ;(window as unknown as {unreadReadings:number[]}).unreadReadings=readings
      new MutationObserver(()=>readings.push(row.querySelectorAll('.shell-chat-count').length)).observe(row,{childList:true,subtree:true,characterData:true,attributes:true})
    })
    const words=`An invented message arriving with ${reduced?'less':'ordinary'} motion`
    await write(agent,'message',words,{body:words,to:[{kind:'person',id:THE_PERSON}]})
    const arrived=page.locator('.px-chat-said .px-chat-one').filter({hasText:words})
    await arrived.waitFor({timeout:30_000})
    await page.waitForTimeout(1000)
    expect(await page.evaluate(()=>(window as unknown as {unreadReadings:number[]}).unreadReadings)).not.toContain(1)
    const motion=await arrived.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,open:getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()}))
    if(reduced)expect(motion.name).toBe('none')
    else {
      expect(motion.name).not.toBe('none')
      const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
      expect(milliseconds(motion.duration)).toBe(milliseconds(motion.open))
    }
    if(films)await page.waitForTimeout(1000)
  }finally{
    const video=page.video()
    await context.close()
    if(films&&video)await video.saveAs(join(films,`chat-arrival-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('still counts a message in a different conversation',async()=>{
  const other={id:'another-arrival-contact',name:'Distant Colleague'}
  await write(person,'agent',other.name,{handle:other.id,runtime:'claude-code',state:'active'})
  await write(person,'message','An invented other conversation',{body:'An invented other conversation',to:[{kind:'agent',id:other.id}]})
  const context=await app.browser.newContext({viewport:{width:1440,height:900}})
  const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChatBeside(page)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click()
    await page.locator('.px-chat-said .px-chat-one').filter({hasText:first}).waitFor()
    await expect.poll(()=>page.locator('.shell-side .shell-chat .shell-chat-count').count()).toBe(0)
    const fromOther={...agent,'x-mole-office-actor-id':other.id}
    const sent=await write(fromOther,'message','An invented message elsewhere',{body:'An invented message elsewhere',to:[{kind:'person',id:THE_PERSON}]})
    await expect.poll(async()=>await page.locator('.shell-side .shell-chat .shell-chat-count').allTextContents(),{timeout:30_000}).toEqual(['1'])
    const marked=await fetch(`${app.api}/api/messages/${sent.record.id}/mark`,{method:'POST',headers:person,body:JSON.stringify({mark:'seen'})})
    expect(marked.status,await marked.text()).toBe(200)
    await expect.poll(()=>page.locator('.shell-side .shell-chat .shell-chat-count').count(),{timeout:30_000}).toBe(0)
  }finally{await context.close()}
},120_000)

it('keeps the unread count when the server cannot record that the message was read',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}})
  const page=await context.newPage()
  const reason='An invented failure to record the read'
  let refused=false
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChatBeside(page)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click()
    await page.locator('.px-chat-said .px-chat-one').filter({hasText:first}).waitFor()
    await expect.poll(()=>page.locator('.shell-side .shell-chat .shell-chat-count').count()).toBe(0)
    await page.route('**/api/messages/seen',route=>{refused=true;return route.fulfill({status:500,json:{error:reason}})})
    await write(agent,'message','An invented message whose read fails',{body:'An invented message whose read fails',to:[{kind:'person',id:THE_PERSON}]})
    await expect.poll(()=>refused,{timeout:30_000}).toBe(true)
    await expect.poll(async()=>await page.locator('.shell-side .shell-chat .shell-chat-count').allTextContents(),{timeout:30_000}).toEqual(['1'])
  }finally{await context.close()}
},120_000)
