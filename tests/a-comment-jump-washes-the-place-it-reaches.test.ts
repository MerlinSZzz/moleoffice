// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { THE_PERSON } from '../src/shared/person.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp,record:string
const person={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
const writer={...person,'x-mole-office-actor-type':'agent','x-mole-office-actor-id':'jump-comment-agent'}
const title='An invented report title for a comment'
async function file(kind:string,name:string,data:unknown,headers=person) {
  const answer=await fetch(`${app.api}/api/records`,{method:'POST',headers,body:JSON.stringify({kind,title:name,data})})
  const body=await answer.text();expect(answer.status,body).toBe(201)
  return (JSON.parse(body) as {record:{id:string}}).record.id
}
beforeAll(async()=>{
  app=await liveApp({name:'comment-jump-wash',viewport:{width:1440,height:900},theDevServerBecause:'A real comment jump is checked before the production build.'})
  await file('agent','Invented Comment Agent',{handle:'jump-comment-agent',runtime:'claude-code',state:'active'})
  record=await file('report',title,{for:'An invented reader',date:'2026-01-01',blocks:[{id:'b-1',type:'text',text:'An invented report paragraph.'}]},writer)
  await file('message','An invented remark',{body:'An invented remark about the title.',target:{target:{kind:'record',recordId:record,workspaceId:'default'},place:{at:'words',span:{quote:title,from:0,to:title.length,field:'title'}}},to:[{kind:'person',id:THE_PERSON}]},writer)
},240_000)
afterAll(async()=>{await app?.stop()})
for(const reduced of [false,true]) it(`washes the comment's destination ${reduced?'without motion':'once'}`,async()=>{
  const films=process.env.W13Y_JUMP_FILMS,theme=process.env.W13Y_JUMP_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  try{
    await page.goto(`${app.site}/#${recordPath(record)}`);await waitForThePage(page)
    if(films){await putTheMadeUpLabelIn(page,'Made-up data — comment jump',page.locator('.rp-head'),'comment jump');await page.waitForTimeout(600)}
    const circle=page.locator('.px-comment-circle').first();await circle.waitFor({timeout:30_000})
    const linger=await page.evaluate(()=>{const value=getComputedStyle(document.documentElement).getPropertyValue('--motion-linger-period').trim();return parseFloat(value)*(value.endsWith('ms')?1:1000)})
    await circle.click()
    await expect.poll(()=>page.evaluate(({title,reduced,linger})=>[...document.querySelectorAll<HTMLElement>('main.page *')].filter(element=>element.textContent?.trim()===title).some(element=>reduced?element.style.boxShadow!=='' : element.getAnimations().some(animation=>animation.effect?.getTiming().duration===linger)),{title,reduced,linger}),{timeout:10_000}).toBe(true)
    if(films)await page.waitForTimeout(linger+300)
  }finally{
    const video=page.video();await context.close()
    if(films&&video)await video.saveAs(join(films,`comment-jump-${theme}-${reduced?'reduced':'motion'}.webm`))
  }
},120_000)
