// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { pathFor, recordPath, whoPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
let app:LiveApp
beforeAll(async()=>{app=await liveApp({name:'agent-row-wait',viewport:{width:1440,height:900}})},240_000)
afterAll(async()=>{await app?.stop()})
for(const fails of [false,true])it(`keeps an agent row until its profile ${fails?'fails':'answers'}`,async()=>{
  const title=`An invented agent row ${fails?'failure':'success'}`,handle=`invented-row-agent-${fails?'fail':'pass'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'agent',title,data:{handle,runtime:'claude-code',state:'active'}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const roster=await (await fetch(`${app.api}/api/participants?shape=page`)).json() as {agents:{id:string;handle:string;record:string|null}[]}
  const agent=roster.agents.find(one=>one.handle===handle);expect(agent?.record).toBe(id)
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/participants/agent/${agent!.id}/profile`,async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented destination failure.'})}:{response:answer})})
    expect(await row.locator('a.rec-cell-title').getAttribute('href')).toBe(`#${whoPath('agent',agent!.id)}`)
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    if(!fails)await row.evaluate(element=>{const changes=new MutationObserver(()=>{if(!element.isConnected){changes.disconnect();return}if(!document.querySelector('canvas[data-wait-light]'))document.documentElement.dataset.testRowFrameGap='yes'});changes.observe(document.body,{childList:true,subtree:true})})
    release()
    if(fails){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${whoPath('agent',agent!.id)}`);await waitForThePage(page);expect(reads).toBe(1);expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const missing of [false,true])it(`keeps the agent press while the registry ${missing?'reports no profile':'answers'}`,async()=>{
  const title=`An invented agent registry ${missing?'missing':'slow'}`,handle=`invented-registry-${missing?'missing':'slow'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'agent',title,data:{handle,runtime:'claude-code',state:'active'}})})
  const body=await response.text();expect(response.status,body).toBe(201);const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const roster=await (await fetch(`${app.api}/api/participants?shape=page`)).json() as {agents:{id:string;handle:string;record:string|null}[]}
  const agent=roster.agents.find(one=>one.handle===handle)!;expect(agent.record).toBe(id)
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,recordReads=0;const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.route('**/api/participants?shape=page',async route=>{const answer=await route.fetch(),json=await answer.json() as {agents:{id:string}[]};held=true;await gate;if(missing)json.agents=json.agents.filter(one=>one.id!==agent.id);await route.fulfill({response:answer,json})})
    await page.goto(`${app.site}/#${pathFor('records')}`)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000});await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.route(`**/api/records/${id}`,async route=>{recordReads++;await route.continue()})
    await row.locator('a.rec-cell-title').click();expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>page.locator('canvas[data-wait-light]').count(),{timeout:10_000}).toBe(1)
    release()
    await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${missing?recordPath(id):whoPath('agent',agent.id)}`)
    if(missing){await page.getByText(t('records.agent.noProfile'),{exact:true}).waitFor({timeout:5_000});expect(recordReads).toBe(1);await page.reload();await waitForThePage(page);expect(await page.getByText(t('records.agent.noProfile'),{exact:true}).count()).toBe(0)}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

it('leaves the row in place when the missing-profile record read is refused',async()=>{
  const title='An invented agent whose record fails',handle='invented-registry-refusal'
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'agent',title,data:{handle,runtime:'claude-code',state:'active'}})})
  const body=await response.text();expect(response.status,body).toBe(201);const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  try{
    await page.route('**/api/participants?shape=page',async route=>{const answer=await route.fetch(),json=await answer.json() as {agents:{handle:string}[]};json.agents=json.agents.filter(one=>one.handle!==handle);await route.fulfill({response:answer,json})})
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/records/${id}`,async route=>{const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];await route.fulfill({status:500,headers,body:JSON.stringify({error:'An invented record failure.'})})})
    await row.locator('a.rec-cell-title').click();await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:5_000})
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`);expect(await row.isVisible()).toBe(true)
  }finally{await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)


it('does not let a late agent profile undo navigation elsewhere',async()=>{
  const title='An invented agent with a late profile',handle='invented-registry-late'
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'agent',title,data:{handle,runtime:'claude-code',state:'active'}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const roster=await (await fetch(`${app.api}/api/participants?shape=page`)).json() as {agents:{id:string;handle:string}[]}
  const agent=roster.agents.find(one=>one.handle===handle)!
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false;const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    await page.route(`**/api/participants/agent/${agent.id}/profile`,async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.locator('tr').filter({has:page.getByText(title,{exact:true})}).locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.evaluate(()=>{window.location.hash='#/'});release();await page.waitForTimeout(500);expect(new URL(page.url()).hash).toBe('#/')
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
