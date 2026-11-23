// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { openTheChat } from './open-the-chat.ts'

let app:LiveApp
const contact={id:'contact-wait-example',name:'Invented Waiting Contact'},words='An invented earlier conversation'
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
async function write(kind:string,title:string,data:unknown){const record={kind,title,data};const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:person,body:JSON.stringify(record)});const body=await response.text();expect(response.status,body).toBe(theAnswerToAWriteInATestOffice(person,record))}
beforeAll(async()=>{
  app=await liveApp({name:'contact-wait',viewport:{width:1440,height:900}})
  await write('agent',contact.name,{handle:contact.id,runtime:'claude-code',state:'active'})
  await write('message',words,{body:words,to:[{kind:'agent',id:contact.id}]})
},240_000)
afterAll(async()=>{await app?.stop()})
for(const outcome of ['motion','reduced','failure'] as const)it(`keeps the contact's ${outcome} waiting light until its conversation answers`,async()=>{
  const films=outcome==='failure'?undefined:process.env.W13Y_CONTACT_FILMS,theme=process.env.W13Y_CONTACT_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:outcome==='reduced'?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — contact wait',page.locator('.hm-needs'),'contact wait')
    await openTheChat(page)
    const row=page.locator('.px-chat-contact').filter({hasText:contact.name});await row.waitFor({timeout:30_000})
    await page.route('**/api/messages/conversation?**',async route=>{const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(outcome==='failure'?{status:500,headers,body:JSON.stringify({error:'An invented conversation failure.'})}:{response:answer})})
    await row.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(async()=>{if(await lights.count()!==1)return false;const frame=await lights.boundingBox(),box=await row.boundingBox();return frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height},{timeout:10_000}).toBe(true)
    const sample=()=>lights.evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample();await page.waitForTimeout(300);const second=await sample();expect(first.some((value,i)=>value!==second[i])).toBe(outcome!=='reduced')
    if(films){await page.waitForTimeout(1400);const third=await sample();expect(second.some((value,i)=>value!==third[i])).toBe(outcome!=='reduced')}
    if(outcome==='failure')await lights.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const animation=animate(frames,options);document.documentElement.dataset.testContactFade=String(animation.effect?.getTiming().duration);return animation}})
    release()
    if(outcome==='failure')await expect.poll(()=>page.locator('html').getAttribute('data-test-contact-fade'),{timeout:30_000}).toBe('160')
    else await page.locator('.px-chat-said .px-chat-one').filter({hasText:words}).waitFor({timeout:30_000})
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
    if(films){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:join(films,`contact-answer-${theme}-${outcome}.png`)});await page.waitForTimeout(1500)}
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`contact-wait-${theme}-${outcome}.webm`))}
},120_000)

it('follows the later contact when the first answer arrives late',async()=>{
  const other={id:'contact-wait-other',name:'Another Invented Contact'},otherWords='An invented later conversation'
  await write('agent',other.name,{handle:other.id,runtime:'claude-code',state:'active'})
  await write('message',otherWords,{body:otherWords,to:[{kind:'agent',id:other.id}]})
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChat(page)
    const firstRow=page.locator('.px-chat-contact').filter({hasText:contact.name})
    const firstId=(await firstRow.getAttribute('data-contact'))!.split(':').slice(1).join(':')
    await page.route('**/api/messages/conversation?**',async route=>{
      if(new URL(route.request().url()).searchParams.get('id')!==firstId)return route.continue()
      const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})
    })
    await firstRow.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.locator('.px-chat-contact').filter({hasText:other.name}).click()
    await page.locator('.px-chat-said .px-chat-one').filter({hasText:otherWords}).waitFor({timeout:30_000})
    release();await page.waitForTimeout(500)
    expect(await page.locator('.px-chat-said .px-chat-one').filter({hasText:otherWords}).count()).toBe(1)
    expect(await page.locator('.px-chat-said .px-chat-one').filter({hasText:words}).count()).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('does not reopen a chat closed before its contact answers',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChat(page)
    await page.route('**/api/messages/conversation?**',async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.keyboard.press('Escape');await expect.poll(()=>page.locator('.px-chat').count()).toBe(0)
    release();await page.waitForTimeout(500)
    expect(await page.locator('.px-chat').count()).toBe(0)
    // AND THE ANSWER CHANGED NOTHING IN IT. An answer taken in while the chat is closed chooses its contact without
    // opening the panel, so the chat is opened again: it shows its contact rows, and no conversation is chosen or drawn.
    await openTheChat(page)
    expect(await page.locator('.px-chat-them').count(),'the late answer chose its contact while the chat was closed').toBe(0)
    await page.locator('.px-chat-contact').filter({hasText:contact.name}).waitFor({timeout:30_000})
    expect(await page.locator('.px-chat-said .px-chat-one').filter({hasText:words}).count()).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
