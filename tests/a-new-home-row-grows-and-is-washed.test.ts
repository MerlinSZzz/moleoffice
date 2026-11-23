// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
async function fileFork(title:string):Promise<string> {
  const response=await fetch(`${app.api}/api/records`,{
    method:'POST',headers:{'content-type':'application/json','x-mole-office-actor-type':'agent','x-mole-office-actor-id':'claude-code'},
    body:JSON.stringify({kind:'proposal',title,data:{question:'An invented question?',options:['One','Two'],recommendation:'One',because:'An invented reason.',who_settles_it:'the owner'}}),
  })
  const answer=await response.json() as {record?:{id:string};error?:string}
  expect(response.status,JSON.stringify(answer)).toBe(201)
  return answer.record!.id
}
async function fileAgentQuestion(title:string):Promise<string> {
  const response=await fetch(`${app.api}/api/records`,{
    method:'POST',headers:{'content-type':'application/json','x-mole-office-actor-type':'agent','x-mole-office-actor-id':'claude-code'},
    body:JSON.stringify({kind:'problem',title,data:{symptom:'An invented question.',whose_move:'person',state:'open'}}),
  })
  const answer=await response.json() as {record?:{id:string};error?:string}
  expect(response.status,JSON.stringify(answer)).toBe(201)
  const id=answer.record!.id
  const reading=await (await fetch(`${app.api}/api/waiting`)).json() as {items:{id:string;because:{rule:string;actorType?:string;writtenBy?:string|null}}[]}
  const row=reading.items.find(one=>one.id===id)
  expect(row?.because).toMatchObject({rule:'whose-move',actorType:'agent'})
  expect(row?.because.writtenBy).toBeTruthy()
  return id
}
// THE AGENT THAT ASKED WITHDRAWS ITS QUESTION, THEN FIXES THE PROBLEM. An agent may not close a problem that still asks
// the person something, because that answers the question for them; the asker may take its own question back first.
async function fixQuestion(id:string):Promise<void> {
  for(const dataPatch of [{whose_move:null},{state:'fixed',fix:'An invented fix.'}]) {
    const response=await fetch(`${app.api}/api/records/${id}`,{
      method:'PATCH',headers:{'content-type':'application/json','x-mole-office-actor-type':'agent','x-mole-office-actor-id':'claude-code'},
      body:JSON.stringify({dataPatch}),
    })
    expect(response.status,await response.text()).toBe(200)
  }
  const reading=await (await fetch(`${app.api}/api/waiting`)).json() as {items:{id:string}[]}
  expect(reading.items.map(one=>one.id),'a fixed question no longer waits on the person').not.toContain(id)
}
// A REFUSED CLOSE KEEPS THE IDS IT DID NOT CLOSE, so the next case closes them first and its own row is still drawn.
async function fixTheQuestionsFiledBefore():Promise<void> {
  while(filedBefore.length>0) {
    await fixQuestion(filedBefore[0]!)
    filedBefore.shift()
  }
}
// HOME DRAWS ONLY THE FIRST TWO ROWS OF NEEDS YOU, oldest first, so a row filed after two others is not drawn. Each
// case fixes the questions the cases before it filed, before it files its own, and its new row is the second.
const filedBefore:string[]=[]
let existing=''
beforeAll(async()=>{app=await liveApp({name:'home-arrival-motion',viewport:{width:1440,height:900}});existing=await fileAgentQuestion('An invented existing question')},240_000)
afterAll(async()=>{await app?.stop()})

for(const reduced of [false,true]) it(`a new Home row ${reduced?'is washed without moving':'grows and is washed'} while the existing row stays still`,async()=>{
  const films=process.env.W13Y_HOME_FILMS,theme=process.env.W13Y_HOME_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try {
    await fixTheQuestionsFiledBefore()
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    const list=page.locator('.hm-needs-list'),old=list.locator('li').first()
    await old.waitFor({timeout:30_000})
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — new Home row',page.locator('.hm-needs'),'Home arrival');await page.waitForTimeout(600)}
    expect(await old.evaluate(element=>element.getAnimations().length)).toBe(0)
    const count=Number(await page.locator('.hm-needs-count').innerText())
    // Record the real animation at its start: the browser can finish a short opening before a locator polls the row.
    await page.evaluate(()=>{
      const animate=Element.prototype.animate
      Element.prototype.animate=function(keyframes,options){
        const animation=animate.call(this,keyframes,options)
        if(this.matches('.hm-needs-item')) this.setAttribute('data-test-opening',JSON.stringify({frames:(animation.effect as KeyframeEffect).getKeyframes(),duration:animation.effect?.getTiming().duration}))
        return animation
      }
    })
    // The real reading does not yet carry arrival cause. This fixture adds the future fact for one
    // agent-created row so the visual effect can be checked without guessing from whose_move.
    await page.route('**/api/waiting',async route=>{
      const answer=await route.fetch(),headers=answer.headers()
      delete headers['content-length']
      const body=await answer.json() as {items:{title:string;arrivalCause?:{kind:string;id:string}}[]}
      for(const item of body.items)if(item.title.startsWith('An invented incoming question'))item.arrivalCause={kind:'agent',id:'claude-code'}
      await route.fulfill({status:answer.status(),headers,body:JSON.stringify(body)})
    })
    const id=await fileAgentQuestion(`An invented incoming question for ${reduced?'less':'ordinary'} motion`)
    filedBefore.push(id)
    const row=page.locator(`[data-home-waiting-id="${id}"]`).locator('xpath=ancestor::li[1]')
    await row.waitFor({timeout:30_000})
    const observed=await row.evaluate(element=>{
      const root=getComputedStyle(document.documentElement)
      const opening=element.getAttribute('data-test-opening')
      return {background:getComputedStyle(element).backgroundColor,shadow:getComputedStyle(element).boxShadow,edge:root.getPropertyValue('--focus-w').trim(),open:root.getPropertyValue('--motion-open').trim(),linger:root.getPropertyValue('--motion-linger-period').trim(),animations:element.getAnimations().map(animation=>({frames:(animation.effect as KeyframeEffect).getKeyframes(),duration:animation.effect?.getTiming().duration})),opening:opening===null?null:JSON.parse(opening) as {frames:Keyframe[];duration:number|string}}
    })
    await expect.poll(async()=>Number(await page.locator('.hm-needs-count').innerText())).toBe(count+1)
    const milliseconds=(value:string)=>value.endsWith('ms')?parseFloat(value):parseFloat(value)*1000
    if(reduced) {
      expect(observed.animations).toHaveLength(0)
      expect(observed.background).not.toBe(await old.evaluate(element=>getComputedStyle(element).backgroundColor))
      expect(observed.shadow,'the wash has an inset edge on all four sides').toContain(`0px 0px 0px ${observed.edge}`)
    }else {
      expect(observed.opening?.frames.some(frame=>'height' in frame)).toBe(true)
      expect(observed.opening?.duration).toBe(milliseconds(observed.open))
      expect(observed.animations.some(animation=>animation.frames.some(frame=>String(frame.boxShadow??'').includes(`0px 0px 0px ${observed.edge}`))),'the wash has an inset edge on all four sides').toBe(true)
    }
    await page.waitForTimeout(milliseconds(observed.open)+milliseconds(observed.linger)+100)
    expect(await row.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(await old.evaluate(element=>getComputedStyle(element).backgroundColor))
  }finally{
    const video=page.video()
    await page.unrouteAll({behavior:'wait'})
    await context.close()
    if(films&&video)await video.saveAs(join(films,`home-arrival-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)

it('draws new rows plainly when their arrival cause is not known, even if an agent wrote the move',async()=>{
  const context=await app.browser.newContext({reducedMotion:'reduce'})
  const page=await context.newPage()
  try {
    await fixTheQuestionsFiledBefore()
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    const old=page.locator('.hm-needs-list li').first();await old.waitFor({timeout:30_000})
    const plain=await old.evaluate(element=>getComputedStyle(element).backgroundColor)
    const id=await fileFork('An invented fork whose arrival has no named cause')
    const row=page.locator(`[data-home-waiting-id="${id}"]`).locator('xpath=ancestor::li[1]')
    await row.waitFor({timeout:30_000})
    expect(await row.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(plain)
    expect(await row.evaluate(element=>element.getAnimations().length)).toBe(0)
    // The existing question is fixed, so the agent's question is the second row after the new fork.
    await fixQuestion(existing)
    const asked=await fileAgentQuestion('An invented agent question with no arrival cause')
    const askedRow=page.locator(`[data-home-waiting-id="${asked}"]`).locator('xpath=ancestor::li[1]')
    await askedRow.waitFor({timeout:30_000})
    expect(await askedRow.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(plain)
    expect(await askedRow.evaluate(element=>element.getAnimations().length)).toBe(0)
  }finally{await context.close()}
},120_000)
