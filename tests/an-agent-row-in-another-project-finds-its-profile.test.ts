// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { EVERY_PROJECT } from '../src/shared/across-projects.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor, recordPath, whoPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
let app:LiveApp
const project='invented-other-project',title='An invented agent in another project',handle='invented-other-agent'
let recordId='',agentId=''
beforeAll(async()=>{
  app=await liveApp({name:'other-project-agent-row',viewport:{width:1440,height:900},theDevServerBecause:'The cross-project row is checked before the production build.'})
  const headers={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
  const projectReply=await fetch(`${app.api}/api/workspaces`,{method:'POST',headers,body:JSON.stringify({id:project,title:'An invented other project'})});expect(projectReply.status,await projectReply.text()).toBe(201)
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{...headers,'x-mole-office-workspace':project},body:JSON.stringify({kind:'agent',title,data:{handle,runtime:'claude-code',state:'active'}})})
  const body=await response.text();expect(response.status,body).toBe(201);recordId=(JSON.parse(body) as {record:{id:string}}).record.id
  const roster=await (await fetch(`${app.api}/api/participants?shape=page`,{headers})).json() as {agents:{id:string;handle:string}[]};agentId=roster.agents.find(one=>one.handle===handle)!.id
},240_000)
afterAll(async()=>{await app?.stop()})
for(const outcome of ['profile','missing','failure'] as const)it(`keeps a different project's agent row while its record ${outcome}`,async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0;const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    if(outcome==='missing')await page.route(/\/api\/participants(?:\?.*)?$/,async route=>{const response=await route.fetch(),body=await response.json() as {agents:{id:string}[]};body.agents=body.agents.filter(one=>one.id!==agentId);await route.fulfill({response,json:body})})
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    await page.locator('.rec-filterbar .pch-select').selectOption(EVERY_PROJECT)
    await page.getByLabel(t('g7a.records.search'),{exact:true}).fill(title)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/records/${recordId}`,async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(outcome==='failure'?{status:500,headers,body:JSON.stringify({error:'An invented record failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:5_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`);await expect.poll(()=>page.locator('canvas[data-wait-light]').count(),{timeout:10_000}).toBe(1)
    release()
    if(outcome==='failure'){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:10_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else if(outcome==='profile'){await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${whoPath('agent',agentId)}`);await waitForThePage(page);expect(reads).toBe(1)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(recordId)}`);await page.getByText(t('records.agent.noProfile'),{exact:true}).waitFor({timeout:30_000});expect(reads).toBe(1)}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
