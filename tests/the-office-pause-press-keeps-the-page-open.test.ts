// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import {mkdirSync} from 'node:fs'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {liveApp,waitForThePage,type LiveApp} from './helpers.ts'
import {THE_TEST_OFFICES_OWNER} from './a-page-of-a-test-office.ts'
import {putTheMadeUpLabelIn} from './the-made-up-label-above-the-page.ts'
let app:LiveApp
beforeAll(async()=>{
 app=await liveApp({name:'office-pause-press',workspace:'default',viewport:{width:1440,height:1100}})
 const headers={'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-workspace':'default'}
 expect((await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`,{method:'PATCH',headers,body:JSON.stringify({name:'Rowan'})})).status).toBe(200)
 expect((await fetch(`${app.api}/api/office/settings`,{method:'POST',headers,body:JSON.stringify({changes:[{name:'MOLE_OFFICE_MESSAGE_WORKER',value:'off'}],because:'Made-up page fixture does not run agents'})})).status).toBe(200)
 await app.page.addInitScript(({person})=>localStorage.setItem('mole-office.actor',JSON.stringify({type:'human',id:person})),{person:THE_TEST_OFFICES_OWNER.id})
},240_000)
afterAll(async()=>{await app?.stop()},120_000)
it('shows pause and resume on Settings and the paused state on Home, without leaving the office',async()=>{
 const page=app.page
 await page.goto(`${app.site}/?lang=en&mode=inspect#/settings/restart`);await waitForThePage(page,60_000)
 const panel=page.locator('[data-target="uiSurface/settings.restart"]')
 await panel.getByLabel('Why pause or resume?',{exact:true}).fill('Made-up quiet office')
 await panel.getByRole('button',{name:'Pause office',exact:true}).click()
 await expect.poll(()=>panel.innerText()).toContain('Paused by Rowan')
 expect((await fetch(`${app.api}/api/office/pause`)).status).toBe(200)
 const shots=process.env.W13R_ROUND27B_SHOTS;if(shots)mkdirSync(shots,{recursive:true})
 for(const width of [1440,390])for(const theme of ['light'] as const)for(const surface of ['settings','home']){
  await page.evaluate(theme=>localStorage.setItem('mole-office.preset.theme',theme),theme)
  await page.setViewportSize({width,height:1500});await page.goto(`${app.site}/?lang=en&mode=inspect&look=${theme}#/${surface==='settings'?'settings/restart':''}`);await waitForThePage(page,60_000)
  await expect.poll(()=>page.locator('html').getAttribute('data-theme')).toBe(theme)
  const shown=surface==='settings'?panel:page.locator('.office-pause-notice')
  await expect.poll(()=>shown.innerText()).toContain('Paused by Rowan')
  expect(await shown.innerText()).toContain('Made-up quiet office')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${surface} ${width} ${theme}`).toBe(true)
 }
 if(shots)for(const width of [1440,990,660,390])for(const theme of ['light','dark'] as const)for(const surface of ['settings','home']){
  await page.evaluate(theme=>localStorage.setItem('mole-office.preset.theme',theme),theme)
  await page.setViewportSize({width,height:1500});await page.goto(`${app.site}/?lang=en&mode=inspect&look=${theme}#/${surface==='settings'?'settings/restart':''}`);await waitForThePage(page,60_000)
  await expect.poll(()=>page.locator('html').getAttribute('data-theme')).toBe(theme)
  const shown=surface==='settings'?panel:page.locator('.office-pause-notice')
  await expect.poll(()=>shown.innerText()).toContain('Paused by Rowan')
  expect(await shown.innerText()).toContain('Made-up quiet office')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${surface} ${width} ${theme}`).toBe(true)
  await putTheMadeUpLabelIn(page,'Made-up test office — paused office',shown,surface==='settings'?'the Settings page':'the Home page')
  await page.screenshot({path:`${shots}/${surface}-pause-${width}-${theme}.png`,fullPage:false})
 }
 await page.goto(`${app.site}/?lang=en&mode=inspect#/settings/restart`);await waitForThePage(page,60_000)
 await panel.getByLabel('Why pause or resume?',{exact:true}).fill('Made-up resume office')
 await panel.getByRole('button',{name:'Resume office',exact:true}).click()
 await expect.poll(()=>panel.innerText()).toContain('The office is not paused.')
 await page.goto(`${app.site}/?lang=en#/`);await waitForThePage(page,60_000)
 await expect.poll(()=>page.locator('.office-pause-notice').count()).toBe(0)
},300_000)
