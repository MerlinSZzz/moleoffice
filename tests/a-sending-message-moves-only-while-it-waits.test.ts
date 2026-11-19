// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { openTheChat } from './open-the-chat.ts'

let app:LiveApp
const contact={id:'motion-contact',name:'Motion Contact'}
const headers={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}

beforeAll(async()=>{
  app=await liveApp({name:'send-motion',viewport:{width:1440,height:900},theDevServerBecause:'The waiting mark is checked before its production build.'})
  for(const record of [
    {kind:'agent',title:contact.name,data:{handle:contact.id,runtime:'claude-code',state:'active'}},
    {kind:'message',title:'An invented first message',data:{body:'An invented first message',to:[{kind:'agent',id:contact.id}]}},
  ]) {
    const reply=await fetch(`${app.api}/api/records`,{method:'POST',headers,body:JSON.stringify(record)})
    expect(reply.status,await reply.text()).toBe(theAnswerToAWriteInATestOffice(headers,record))
  }
},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`the sending clock ${reduced?'stands still':'turns after the delay'}`,async()=>{
  const films=process.env.W13Y_SEND_FILMS,theme=process.env.W13Y_SEND_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  const failures:string[]=[]
  page.on('requestfailed',request=>failures.push(`${request.url()}: ${request.failure()?.errorText??'failed'}`))
  const officeHeaders=Object.fromEntries((await fetch(`${app.api}/api/office/pairing`,{headers:{origin:app.site}})).headers)
  delete officeHeaders['content-length']
  let release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/records',async route=>{
    if(route.request().method()==='POST' && (route.request().postDataJSON() as {kind?:string}).kind==='message') {
      await held
      await route.fulfill({status:201,headers:{...officeHeaders,'access-control-allow-origin':app.site,'access-control-allow-credentials':'true'},json:{record:{id:'invented-message'}}}).catch(()=>{})
    } else await route.continue()
  })
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — sending a message',page.locator('.hm-needs'),'sending message')
    await openTheChat(page)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click()
    await page.locator('.px-chat-box').fill('An invented message being sent')
    await page.locator('.px-chat-send').click()
    const mark=page.locator('.px-chat-bubble[data-send-state="sending"] .px-chat-mark')
    await mark.waitFor()
    const observed=await mark.evaluate(element=>{
      const style=getComputedStyle(element),tokens=getComputedStyle(document.documentElement)
      return {name:style.animationName,delay:style.animationDelay,duration:style.animationDuration,lap:tokens.getPropertyValue('--motion-lap-wide').trim(),start:tokens.getPropertyValue('--motion-delay').trim()}
    })
    if(reduced)expect(observed.name).toBe('none')
    else {
      const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
      expect(observed.name).not.toBe('none')
      expect(milliseconds(observed.duration)).toBe(milliseconds(observed.lap))
      expect(milliseconds(observed.delay)).toBe(milliseconds(observed.start))
    }
    if(films)await page.waitForTimeout(reduced?600:parseFloat(observed.lap)*(observed.lap.endsWith('ms')?1:1000)*1.5)
    release()
    const tick=page.locator('.px-chat-bubble[data-send-state="sent"] .px-chat-mark')
    try {await tick.waitFor({timeout:6000})} catch {
      throw new Error(`The sent mark did not appear: ${await page.locator('.px-chat-said').innerText()}; ${failures.join('; ')}`)
    }
    const appeared=await tick.evaluate(element=>{
      const style=getComputedStyle(element),tokens=getComputedStyle(document.documentElement)
      return {name:style.animationName,duration:style.animationDuration,open:tokens.getPropertyValue('--motion-open').trim()}
    })
    if(reduced)expect(appeared.name).toBe('none')
    else {
      const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
      expect(appeared.name).not.toBe('none')
      expect(milliseconds(appeared.duration)).toBe(milliseconds(appeared.open))
    }
    if(films)await page.waitForTimeout(800)
  }finally{
    release()
    const video=page.video()
    await page.unrouteAll({behavior:'wait'})
    await context.close()
    if(films&&video)await video.saveAs(join(films,`send-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('shows the sent tick when the stored message arrives before its HTTP answer',async()=>{
  const context=await app.browser.newContext({reducedMotion:'no-preference'})
  const page=await context.newPage()
  let release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/records',async route=>{
    if(route.request().method()==='POST'&&(route.request().postDataJSON() as {kind?:string}).kind==='message'){
      const answer=await route.fetch()
      await held
      await route.fulfill({response:answer}).catch(()=>{})
    }else await route.continue()
  })
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChat(page)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click()
    const words='An invented message recorded before its reply'
    await page.locator('.px-chat-box').fill(words)
    await page.locator('.px-chat-send').click()
    const row=page.locator('.px-chat-said .px-chat-one').filter({hasText:words})
    await row.locator('.px-chat-mark[data-shape="tick"]').waitFor({timeout:30_000})
    const mark=row.locator('.px-chat-mark[data-shape="tick"]')
    const motion=await mark.evaluate(element=>({name:getComputedStyle(element).animationName,duration:getComputedStyle(element).animationDuration,open:getComputedStyle(document.documentElement).getPropertyValue('--motion-open').trim()}))
    const ms=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    expect(motion.name,await row.evaluate(element=>element.outerHTML)).not.toBe('none')
    expect(ms(motion.duration)).toBe(ms(motion.open))
    expect(await row.count()).toBe(1)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
