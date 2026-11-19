// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp,message:string
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
beforeAll(async()=>{
  app=await liveApp({name:'mark-all-wait',viewport:{width:1440,height:900}})
  const agent=await fetch(`${app.api}/api/records`,{method:'POST',headers:person,body:JSON.stringify({kind:'agent',title:'Invented Mark Sender',data:{handle:'invented-mark-sender',runtime:'claude-code',state:'active'}})})
  expect(agent.status,await agent.clone().text()).toBe(201)
  const said=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'invented-mark-sender'},body:JSON.stringify({kind:'message',title:'An invented unread message',data:{body:'An invented unread message.',to:[{kind:'person',id:THE_PERSON}]}})})
  expect(said.status,await said.clone().text()).toBe(201);message=((await said.json()) as {record:{id:string}}).record.id
},240_000)
afterAll(async()=>{await app?.stop()})

it('fades the Mark all read light quickly when its mark is refused',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('messages')}`);await waitForThePage(page)
    const press=page.locator('.px-ms-mark-all .px-btn');await press.waitFor({timeout:30_000})
    await page.route(`**/api/messages/${message}/mark`,async route=>{
      const answer=await route.fetch(),headers=answer.headers();delete headers['content-length']
      held=true;await gate;await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented mark refusal.'})})
    })
    await press.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const light=page.locator('canvas[data-wait-light]');await expect.poll(()=>light.count(),{timeout:10_000}).toBe(1)
    const frame=await light.boundingBox(),box=await press.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    await light.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const result=animate(frames,options);document.documentElement.dataset.testMarkLightDuration=String(result.effect?.getTiming().duration);return result}})
    const quick=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    release();await page.locator('.px-ms-page-head + .px-error').waitFor({timeout:30_000})
    await expect.poll(()=>page.locator('html').getAttribute('data-test-mark-light-duration'),{timeout:10_000}).toBe(String(quick))
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const reduced of [false,true])it(`keeps the Mark all read light until the marks answer, ${reduced?'reduced':'motion'}`,async()=>{
  const films=process.env.W13Y_MARK_FILMS,theme=process.env.W13Y_MARK_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const said=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'invented-mark-sender'},body:JSON.stringify({kind:'message',title:'An invented unread message for the wait',data:{body:'An invented unread message for the wait.',to:[{kind:'person',id:THE_PERSON}]}})})
  expect(said.status,await said.clone().text()).toBe(201)
  const id=((await said.json()) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('messages')}`);await waitForThePage(page)
    const press=page.locator('.px-ms-mark-all .px-btn');await press.waitFor({timeout:30_000})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — mark all read',page.locator('.px-ms-page-head'),'mark all read')
    await page.route(`**/api/messages/${id}/mark`,async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await press.click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(async()=>{if(await lights.count()!==1)return false;const frame=await lights.boundingBox(),box=await press.boundingBox();return frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height},{timeout:10_000}).toBe(true)
    const sample=()=>lights.evaluate(element=>{const canvas=element as HTMLCanvasElement;return Array.from(canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data)})
    const first=await sample();await page.waitForTimeout(300);const second=await sample();expect(first.some((value,i)=>value!==second[i])).toBe(!reduced)
    if(films)await page.waitForTimeout(1400)
    release();await page.locator('.px-ms-nothing-unread').waitFor({timeout:30_000});await expect.poll(()=>lights.count(),{timeout:30_000}).toBe(0)
    if(films){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path:join(films,`mark-answer-${theme}-${reduced?'reduced':'motion'}.png`)});await page.waitForTimeout(1500)}
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`mark-wait-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)

for(const outcome of ['goes','stays','failure'] as const)it(`keeps the mark light until the updated pool answers: ${outcome}`,async()=>{
  const createMessage=async(title:string)=>{
    const said=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'invented-mark-sender'},body:JSON.stringify({kind:'message',title,data:{body:title,to:[{kind:'person',id:THE_PERSON}]}})})
    expect(said.status,await said.clone().text()).toBe(201);return ((await said.json()) as {record:{id:string}}).record.id
  }
  const id=await createMessage('An invented message to mark before the pool answers')
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let releaseMark!:()=>void,releasePool!:()=>void,markHeld=false,markDone=false,poolHeld=false
  const markGate=new Promise<void>(resolve=>{releaseMark=resolve}),poolGate=new Promise<void>(resolve=>{releasePool=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('messages')}`);await waitForThePage(page)
    const press=page.locator('.px-ms-mark-all .px-btn');await press.waitFor({timeout:30_000})
    await page.route(`**/api/messages/${id}/mark`,async route=>{const answer=await route.fetch();markHeld=true;await markGate;await route.fulfill({response:answer});markDone=true})
    await page.route('**/api/messages?**',async route=>{
      const url=new URL(route.request().url())
      if(!markDone||url.searchParams.has('only'))return route.continue()
      poolHeld=true;await poolGate
      if(outcome==='failure')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'An invented pool read failure.'})})
      else await route.continue()
    })
    await press.click();await expect.poll(()=>markHeld,{timeout:30_000}).toBe(true)
    const light=page.locator('canvas[data-wait-light]');await expect.poll(()=>light.count(),{timeout:10_000}).toBe(1)
    await light.evaluate(element=>{const animate=element.animate.bind(element);element.animate=(frames,options)=>{const animation=animate(frames,options);document.documentElement.dataset.testMarkEnding=String(animation.effect?.getTiming().duration);return animation}})
    releaseMark();await expect.poll(()=>poolHeld,{timeout:30_000}).toBe(true)
    await page.waitForTimeout(300)
    expect(await light.count(),'the wait lasts until the replacement answer').toBe(1)
    expect(await page.locator('html').getAttribute('data-test-mark-ending')).toBeNull()
    if(outcome==='stays')await createMessage('An invented message arriving after the mark')
    releasePool()
    if(outcome==='failure'){
      const quick=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-quick').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
      await expect.poll(()=>page.locator('html').getAttribute('data-test-mark-ending'),{timeout:30_000}).toBe(String(quick))
      await page.locator('.px-ms-page-head + .px-error').waitFor({timeout:30_000})
    }else if(outcome==='stays'){
      const settle=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-settle').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
      await expect.poll(()=>page.locator('html').getAttribute('data-test-mark-ending'),{timeout:30_000}).toBe(String(settle))
      await expect.poll(()=>press.isVisible()).toBe(true)
    }else{
      await page.locator('.px-ms-nothing-unread').waitFor({timeout:30_000})
      await expect.poll(()=>light.count(),{timeout:10_000}).toBe(0)
      expect(await page.locator('html').getAttribute('data-test-mark-ending'),'a removed target has no success flash').toBeNull()
    }
  }finally{releaseMark();releasePool();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

// THE PAGE'S CLOCK STANDS STILL, so "before the delay" is a time this case sets and not how fast the machine is. The
// case used to measure the click-to-element time in the page against the delay: the arranged replies took 13.3 to
// 35.6 ms alone. In the whole suite on 13 November 2026 it went red and was green alone. A loaded machine can make the
// replies take longer than the delay, and then the light rightly comes up though the page is right. Now the mark's
// answer is held while the page's clock runs to 1 ms short of the delay, the updated pool then answers at once, and
// only after that does the clock run past it.
it('shows no Mark all read light when the marks and updated pool answer before the delay',async()=>{
  const title='An invented quickly marked message'
  const said=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'invented-mark-sender'},body:JSON.stringify({kind:'message',title,data:{body:title,to:[{kind:'person',id:THE_PERSON}]}})})
  expect(said.status,await said.clone().text()).toBe(201)
  const id=((await said.json()) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    const initialPool=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/messages'&&url.searchParams.has('limit')&&!url.searchParams.has('only')})
    await page.goto(`${app.site}/#${pathFor('messages')}`);await waitForThePage(page)
    const initial=await initialPool,pool=await initial.json() as Record<string,unknown>,headers=await initial.allHeaders()
    delete headers['content-length']
    const press=page.locator('.px-ms-mark-all .px-btn');await press.waitFor({timeout:30_000})
    await page.route('**/api/messages?**',route=>{
      const url=new URL(route.request().url())
      if(url.searchParams.get('only')==='waiting-for-me'&&url.searchParams.get('narrow')==='1')return route.fulfill({headers,json:{messages:[{id}],next:null,returned:1}})
      if(!url.searchParams.has('only')&&url.searchParams.has('limit'))return route.fulfill({headers,json:{...pool,unreadForYou:0}})
      return route.continue()
    })
    await page.route('**/api/messages/*/mark',async route=>{held=true;await gate;await route.fulfill({headers,json:{}})})
    await page.clock.install();await page.clock.pauseAt(Date.now()+60_000)
    const delay=await page.evaluate(()=>{
      const root=document.documentElement
      root.dataset.testQuickLights='0'
      new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLCanvasElement&&node.hasAttribute('data-wait-light'))root.dataset.testQuickLights=String(Number(root.dataset.testQuickLights)+1)}).observe(document.body,{childList:true,subtree:true})
      document.querySelector<HTMLButtonElement>('.px-ms-mark-all .px-btn')!.click()
      const value=getComputedStyle(root).getPropertyValue('--motion-delay').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)
    })
    expect(delay,'the light has a delay to answer within').toBeGreaterThan(1)
    await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.clock.runFor(delay-1)
    release();await page.locator('.px-ms-nothing-unread').waitFor({timeout:30_000})
    await page.clock.runFor(delay)
    expect(await page.locator('html').getAttribute('data-test-quick-lights')).toBe('0')
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
