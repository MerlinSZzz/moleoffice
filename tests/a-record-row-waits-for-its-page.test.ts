// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { pathFor, recordPath } from '../src/web/components/router.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp,first:string,second:string
const titles=['An invented first report for navigation','An invented second report for navigation']
async function file(title:string):Promise<string>{
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'report',title,data:{for:'An invented reader',date:'2026-01-01',blocks:[{id:'b-1',type:'text',text:'An invented paragraph.'}]}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  return (JSON.parse(body) as {record:{id:string}}).record.id
}
beforeAll(async()=>{app=await liveApp({name:'record-row-wait',viewport:{width:1440,height:900}});first=await file(titles[0]!);second=await file(titles[1]!)},240_000)
afterAll(async()=>{await app?.stop()})

async function watchFrame(row: import('playwright').Locator) {
  await row.evaluate(element=>{
    const changes=new MutationObserver(()=>{if(!element.isConnected){changes.disconnect();return}if(!document.querySelector('canvas[data-wait-light]'))document.documentElement.dataset.testRowFrameGap='yes'})
    changes.observe(document.body,{childList:true,subtree:true})
  })
}


for(const fails of [false,true]) for(const reduced of fails?[true]:[false,true]) it(`holds the pressed row until its record ${fails?'fails':'answers'}, ${reduced?'reduced':'motion'}`,async()=>{
  const films=fails?undefined:process.env.W13Y_ROW_FILMS,theme=process.env.W13Y_ROW_THEME==='dark'?'dark':'light'
  if(films)mkdirSync(films,{recursive:true})
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:reduced?'reduce':'no-preference',...(films?{recordVideo:{dir:films,size:{width:1440,height:900}}}:{})})
  await context.addInitScript(look=>localStorage.setItem('mole-office.preset.theme',look),theme)
  const page=await context.newPage()
  let release!:()=>void,held=false,detailReads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(titles[0]!,{exact:true})})
    await row.waitFor({timeout:30_000})
    if(films)await putTheMadeUpLabelIn(page,'Made-up data — record row',page.locator('.rec-filterbar'),'record row')
    await page.route(`**/api/records/${first}`,async route=>{detailReads+=1;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented destination failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>row.isVisible(),{timeout:5_000}).toBe(true)
    const lights=page.locator('canvas[data-wait-light]')
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.first().boundingBox(),box=await row.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(films)await page.waitForTimeout(1500)
    if(!fails && reduced)await watchFrame(row)
    release()
    if(fails){
      await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000})
      expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`);expect(await row.isVisible()).toBe(true)
    }else{
      await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(first,'report')}`)
      await page.getByRole('heading',{name:titles[0]!,exact:true}).waitFor({timeout:30_000})
      if(films)await putTheMadeUpLabelIn(page,'Made-up data — record row',page.getByRole('heading',{name:titles[0]!,exact:true}),'record destination')
      await waitForThePage(page)
      expect(detailReads,'the prepared answer is handed to the page without another record read').toBe(1)
    }
    if(!fails && reduced)expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()
    await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});const video=page.video();await context.close();if(films&&video)await video.saveAs(join(films,`record-row-${theme}-${reduced?'reduced':'motion'}.webm`))}
},120_000)

it('follows the latest row pressed when an earlier destination answers later',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void,held=false
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    await page.route(`**/api/records/${first}`,async route=>{const answer=await route.fetch();held=true;await gate;await route.fulfill({response:answer})})
    await page.getByRole('link',{name:titles[0]!,exact:true}).click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    await page.getByRole('link',{name:titles[1]!,exact:true}).click()
    await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(second,'report')}`)
    release();await page.waitForTimeout(500)
    expect(new URL(page.url()).hash).toBe(`#${recordPath(second,'report')}`)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const fails of [false,true])it(`keeps a handbook row until its page ${fails?'fails':'answers'}`,async()=>{
  const title=`An invented handbook for navigation ${fails?'failure':'success'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'handbook',title,data:{for:'An invented reader',state:'draft',text:{en:{opening:'An invented instruction.'}},hangs_on:[{project:'default'}],text_changes:[{languages:['en'],why:'An invented first text.'}]}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/records/${id}`,async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented handbook failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>row.isVisible()).toBe(true)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.boundingBox(),box=await row.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(!fails)await watchFrame(row)
    release()
    if(fails){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(id,'handbook')}`);await page.getByRole('heading',{name:title,exact:true}).waitFor({timeout:30_000});expect(reads).toBe(1);expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const fails of [false,true])it(`keeps a incident row until its page ${fails?'fails':'answers'}`,async()=>{
  const title=`An invented incident for navigation ${fails?'failure':'success'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'incident',title,data:{loss:'An invented loss.',timeline:[{id:'m-1',at:'2026-01-01',who:'An invented operator',what:'An invented event.',evidence:'ev-placeholder'}]}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/records/${id}`,async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented incident failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>row.isVisible()).toBe(true)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.boundingBox(),box=await row.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(!fails)await watchFrame(row)
    release()
    if(fails){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(id,'incident')}`);await page.getByRole('heading',{name:title,exact:true}).waitFor({timeout:30_000});expect(reads).toBe(1);expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const fails of [false,true])it(`keeps a pipeline row until its page ${fails?'fails':'answers'}`,async()=>{
  const title=`An invented pipeline for navigation ${fails?'failure':'success'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'pipeline',title,data:{blockIds:[]}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route('**/api/attention?shape=flow',async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented pipeline failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>row.isVisible()).toBe(true)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.boundingBox(),box=await row.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(!fails)await watchFrame(row)
    release()
    if(fails){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(id,'pipeline')}`);await page.locator('.pp').waitFor({timeout:30_000});expect(await page.locator('.pp').textContent()).toContain(title);expect(reads).toBe(1);expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)

for(const fails of [false,true])it(`keeps a session row until its page ${fails?'fails':'answers'}`,async()=>{
  const title=`An invented session for navigation ${fails?'failure':'success'}`
  const response=await fetch(`${app.api}/api/records`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'session',title,data:{state:'running'}})})
  const body=await response.text();expect(response.status,body).toBe(201)
  const id=(JSON.parse(body) as {record:{id:string}}).record.id
  const context=await app.browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  let release!:()=>void,held=false,reads=0
  const gate=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.goto(`${app.site}/#${pathFor('records')}`);await waitForThePage(page)
    const row=page.locator('tr').filter({has:page.getByText(title,{exact:true})});await row.waitFor({timeout:30_000})
    await page.route(`**/api/records/${id}`,async route=>{reads++;const answer=await route.fetch(),headers=answer.headers();delete headers['content-length'];held=true;await gate;await route.fulfill(fails?{status:500,headers,body:JSON.stringify({error:'An invented session failure.'})}:{response:answer})})
    await row.locator('a.rec-cell-title').click();await expect.poll(()=>held,{timeout:30_000}).toBe(true)
    expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)
    await expect.poll(()=>row.isVisible()).toBe(true)
    const lights=page.locator('canvas[data-wait-light]');await expect.poll(()=>lights.count(),{timeout:10_000}).toBe(1)
    const frame=await lights.boundingBox(),box=await row.boundingBox()
    expect(frame!==null&&box!==null&&frame.x<=box.x&&frame.y<=box.y&&frame.x+frame.width>=box.x+box.width&&frame.y+frame.height>=box.y+box.height).toBe(true)
    if(!fails)await watchFrame(row)
    release()
    if(fails){await page.getByText(t('error.brokenSays'),{exact:true}).first().waitFor({timeout:30_000});expect(new URL(page.url()).hash).toBe(`#${pathFor('records')}`)}
    else{await expect.poll(()=>new URL(page.url()).hash,{timeout:30_000}).toBe(`#${recordPath(id,'session')}`);await page.getByRole('heading',{name:title,exact:true}).waitFor({timeout:30_000});expect(reads).toBe(1);expect(await page.locator('html').getAttribute('data-test-row-frame-gap')).toBeNull()}
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
