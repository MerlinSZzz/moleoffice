// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {mkdirSync} from 'node:fs'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {liveApp,waitForThePage,type LiveApp} from './helpers.ts'
import {THE_TEST_OFFICES_OWNER} from './a-page-of-a-test-office.ts'
import {putTheMadeUpLabelIn} from './the-made-up-label-above-the-page.ts'
let app:LiveApp
const headers={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id}
beforeAll(async()=>{
 app=await liveApp({name:'running-number-notice-presses',workspace:'default',viewport:{width:1440,height:1100}})
 await app.page.addInitScript(({person})=>{localStorage.setItem('mole-office.actor',JSON.stringify({type:'human',id:person}));localStorage.setItem('mole-office.preset.theme',new URLSearchParams(location.search).get('look')??'light')},{person:THE_TEST_OFFICES_OWNER.id})
 const renamed=await fetch(app.api+'/api/participants/person/'+THE_TEST_OFFICES_OWNER.id,{method:'PATCH',headers,body:JSON.stringify({name:'Rowan (made-up)'})});expect(renamed.status).toBe(200)
 for(const title of ['Made-up landing notice','Made-up report reminder','Made-up ordinary message']){
  const created=await fetch(app.api+'/api/records',{method:'POST',headers,body:JSON.stringify({kind:'message',title,data:{body:title+' — demonstration data',to:[{kind:'person',id:THE_TEST_OFFICES_OWNER.id}]}})});expect(created.status).toBe(201)
 }
},240_000)
afterAll(async()=>{await app?.stop()},120_000)
it('saves and restores personal choices on the message centre, and a settings press resets a number to its shipped value',async()=>{
 const page=app.page
 await page.goto(app.site+'/?lang=en&mode=normal#/messages');await waitForThePage(page,60_000)
 const rules=page.locator('.px-notice-rules');await rules.locator(':scope > summary').click()
 const notice=rules.locator('[data-notice-kind=theBroadcastIsDue]');await notice.selectOption('mute')
 await rules.getByLabel('Why change these rules?').fill('Made-up quiet notice choice')
 await rules.getByRole('button',{name:'Save wake rules',exact:true}).click()
 await expect.poll(async()=>{const r=await fetch(app.api+'/api/messages/notice-rules',{headers});return (await r.json() as {mutedKinds:string[]}).mutedKinds}).toEqual(['theBroadcastIsDue'])
 await page.reload();await waitForThePage(page,60_000);await rules.locator(':scope > summary').click();expect(await notice.inputValue()).toBe('mute')
 await rules.getByLabel('Why change these rules?').fill('Made-up defaults choice');await rules.getByRole('button',{name:'Use office wake defaults',exact:true}).click();await expect.poll(()=>notice.inputValue()).toBe('default')
 await rules.getByLabel('Why change these rules?').fill('Made-up restore');await rules.getByText('Previous choices',{exact:true}).click();await rules.getByRole('button',{name:'Restore these choices',exact:true}).last().click();await expect.poll(()=>notice.inputValue()).toBe('mute')
 expect(await page.getByText(/Made-up ordinary message/).count()).toBeGreaterThan(0)
 await page.goto(app.site+'/?lang=en&mode=inspect#/settings/officecontrols');await waitForThePage(page,60_000)
 const cap=page.locator('[data-setting=MOLE_OFFICE_BUS_MOST_ENTRIES]');await cap.locator(':scope > summary').click()
 await cap.getByLabel('Value',{exact:true}).fill('12');await cap.getByLabel('Why change this?').fill('Made-up cap choice');await cap.getByRole('button',{name:'Save value',exact:true}).click();await expect.poll(()=>cap.innerText()).toContain('12')
 await cap.getByLabel('Why change this?').fill('Made-up shipped reset');await cap.getByRole('button',{name:'Reset to shipped value',exact:true}).click()
 await expect.poll(async()=>{const r=await fetch(app.api+'/api/office/settings',{headers});return (await r.json() as {settings:{name:string;chosen:string}[]}).settings.find(s=>s.name==='MOLE_OFFICE_BUS_MOST_ENTRIES')?.chosen}).toBe('8')
},180_000)
it('fits both changed pages at 1440 and 390 in light with labelled made-up data',async()=>{
 const folder=process.env.W13R_SETTINGS1_SHOTS;if(folder)mkdirSync(folder,{recursive:true})
 for(const route of ['messages','settings/officecontrols'])for(const width of [1440,390])for(const theme of ['light']){
  const page=app.page;await page.setViewportSize({width,height:1100});await page.goto('about:blank');await page.goto(`${app.site}/?lang=en&mode=${route==='messages'?'normal':'inspect'}&look=${theme}#/${route}`);await waitForThePage(page,60_000)
  const section=route==='messages'?page.locator('.px-notice-rules'):page.locator('[data-setting=MOLE_OFFICE_BUS_MOST_ENTRIES]')
  await section.waitFor();await section.locator(':scope > summary').click()
  if(route==='messages')await section.getByLabel('Find a notice kind').fill('report')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} ${width} ${theme}`).toBe(true)
  expect((await section.boundingBox())!.width).toBeGreaterThan(0)
  if(folder){
   await putTheMadeUpLabelIn(page,'Made-up test office — demonstration settings and messages',section,route==='messages'?'the Messages page':'the Office controls page')
   await page.screenshot({path:`${folder}/${route.replace('/','-')}-${width}-${theme}.png`,fullPage:false})
  }
 }
},180_000)
