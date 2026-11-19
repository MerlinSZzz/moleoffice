// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
let app: LiveApp
beforeAll(async () => {
  app = await liveApp({name:'office-control-presses',workspace:'default',viewport:{width:1440,height:1100}})
  const headers = {'content-type':'application/json','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id,'x-mole-office-workspace':'default'}
  expect((await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`,{method:'PATCH',headers,body:JSON.stringify({name:'Rowan'})})).status).toBe(200)
  expect((await fetch(`${app.api}/api/agents/started`,{method:'POST',headers,body:JSON.stringify({handle:'fixture-finch',name:'Finch',role:'secretary'})})).status).toBe(201)
  expect((await fetch(`${app.api}/api/records`,{method:'POST',headers,body:JSON.stringify({kind:'decision',title:'Made-up restart permission',data:{replaces:[]}})})).status).toBe(201)
  await app.page.addInitScript(({person})=>localStorage.setItem('mole-office.actor',JSON.stringify({type:'human',id:person})),{person:THE_TEST_OFFICES_OWNER.id})
},240_000)
afterAll(async()=>{await app?.stop()},120_000)
it('saves a runtime value, shows its source and audit at once, and keeps it after a reload',async()=>{
  const page=app.page
  await page.goto(`${app.site}/?lang=en&mode=inspect#/settings/officecontrols`);await waitForThePage(page,60_000)
  const panel=page.locator('[data-target="uiSurface/settings.officecontrols"]')
  await panel.getByLabel('Find a setting', {exact:true}).fill('REPLY_REMINDER_MINUTES')
  const row=panel.locator('.orc-setting');await row.locator(':scope > summary').click()
  await row.getByLabel('Value',{exact:true}).fill('9');await row.getByLabel('Why change this?',{exact:true}).fill('Made-up demonstration reason')
  await row.getByRole('button',{name:'Save value',exact:true}).click()
  await expect.poll(()=>row.innerText()).toContain('9, from the office database.')
  expect(await row.innerText()).toContain('Changed by Rowan');expect(await row.innerText()).toContain('Made-up demonstration reason')
  await page.reload();await panel.getByLabel('Find a setting',{exact:true}).fill('REPLY_REMINDER_MINUTES');await row.locator(':scope > summary').click()
  expect(await row.getByLabel('Value',{exact:true}).inputValue()).toBe('9')
  await row.getByLabel('Value',{exact:true}).fill('0');await row.getByLabel('Why change this?',{exact:true}).fill('Made-up invalid choice')
  await row.getByRole('button',{name:'Save value',exact:true}).click()
  await expect.poll(()=>row.innerText()).toContain('positive whole number')
  expect(await row.locator(':scope > summary').innerText()).toContain('9, from the office database.')
  await row.getByLabel('Why change this?',{exact:true}).fill('Made-up removal')
  await row.getByRole('button',{name:'Remove saved value',exact:true}).click()
  await expect.poll(()=>row.innerText()).toContain('3, from the built-in default.')
  await row.getByLabel('Value',{exact:true}).fill('9');await row.getByLabel('Why change this?',{exact:true}).fill('Made-up demonstration reason');await row.getByRole('button',{name:'Save value',exact:true}).click()
  await expect.poll(()=>row.innerText()).toContain('9, from the office database.')
},180_000)
it('gives and takes back an exact agent grant, refuses an unmanaged restart, and fits both pages at four widths in both themes',async()=>{
  const page=app.page
  await page.goto(`${app.site}/?lang=en&mode=inspect#/settings/restart`);await waitForThePage(page,60_000)
  const panel=page.locator('[data-target="uiSurface/settings.restart"]')
  await panel.locator('details > summary').first().click()
  await panel.getByLabel('Find an agent by name',{exact:true}).fill('Finch');await panel.getByRole('button',{name:'Find agents',exact:true}).click()
  await expect.poll(()=>panel.getByLabel('Agent',{exact:true}).innerText()).toContain('Finch')
  await panel.getByLabel('Agent',{exact:true}).selectOption({label:'Finch'})
  await panel.getByLabel('Find a decision by its words',{exact:true}).fill('Made-up restart permission');await panel.getByRole('button',{name:'Find decisions',exact:true}).click()
  await expect.poll(()=>panel.getByLabel('Decision',{exact:true}).innerText()).toContain('Made-up restart permission')
  await panel.getByLabel('Decision',{exact:true}).selectOption({label:'Made-up restart permission'})
  await panel.getByLabel('Why give or remove this grant?',{exact:true}).fill('Made-up permission reason');await panel.getByRole('button',{name:'Give restart and pause permission',exact:true}).click()
  await expect.poll(()=>panel.innerText()).toContain('Finch: Made-up restart permission (allowed)')
  await panel.getByLabel('Why give or remove this grant?',{exact:true}).fill('Made-up revocation');await panel.getByRole('button',{name:'Take back permission',exact:true}).click()
  await expect.poll(()=>panel.innerText()).toContain('No other agent has a live grant.')
  await panel.getByLabel('Why give or remove this grant?',{exact:true}).fill('Made-up permission reason');await panel.getByRole('button',{name:'Give restart and pause permission',exact:true}).click()
  await expect.poll(()=>panel.innerText()).toContain('Finch: Made-up restart permission (allowed)')
  await panel.getByLabel('Why restart?',{exact:true}).fill('Made-up restart reason')
  expect(await panel.getByRole('button',{name:'Restart',exact:true}).isDisabled()).toBe(true)
  const shots=process.env.W13R_ROUND27_SHOTS;if(shots)mkdirSync(shots,{recursive:true})
  for(const width of [1440]) for(const theme of ['light','dark']) for(const surface of ['officecontrols','restart']) {
    await page.evaluate((theme)=>localStorage.setItem('mole-office.preset.theme',theme),theme)
    await page.setViewportSize({width,height:1500});await page.goto(`${app.site}/?lang=en&mode=inspect&look=${theme}#/settings/${surface}`);await waitForThePage(page,60_000)
    await expect.poll(()=>page.locator('html').getAttribute('data-theme')).toBe(theme)
    const shown=page.locator(`[data-target="uiSurface/settings.${surface}"]`);await shown.waitFor({timeout:30_000})
    if(surface==='officecontrols'){await shown.getByLabel('Find a setting',{exact:true}).fill('REPLY_REMINDER_MINUTES');await shown.locator('.orc-setting > summary').click();await expect.poll(()=>shown.innerText()).toContain('9, from the office database.')}
    else {await expect.poll(()=>shown.innerText()).toContain('Finch: Made-up restart permission (allowed)')}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${surface} ${width} ${theme}`).toBe(true)
    await page.mouse.move(width-1,1499)
    if(shots){
      await putTheMadeUpLabelIn(page,'Made-up test office — demonstration controls',shown,surface==='officecontrols'?'the Office controls page':'the Restart page')
      await page.screenshot({path:`${shots}/settings-${surface}-${width}-${theme}.png`,fullPage:false})
    }
  }
},300_000)
it('the runtime model note names the saved controls, and fits four widths in both themes',async()=>{
  // Wave 13y round 119: the Working page's line for a map turned off went with the older built-in map, so only the Runtime note is read here.
  const page=app.page
  const shots=process.env.W13R_ROUND27_OTHER_SHOTS;if(shots)mkdirSync(shots,{recursive:true})
  for(const width of [1440]) for(const theme of ['light','dark']) for(const surface of ['runtime']) {
    await page.evaluate((theme)=>localStorage.setItem('mole-office.preset.theme',theme),theme)
    await page.setViewportSize({width,height:1500});await page.goto(`${app.site}/?lang=en&mode=inspect&look=${theme}#/${surface}`);await waitForThePage(page,60_000)
    await expect.poll(()=>page.locator('html').getAttribute('data-theme')).toBe(theme)
    const shown=page.locator('[data-target="uiSurface/runtime.places"]')
    await shown.waitFor({timeout:60_000})
    await expect.poll(()=>shown.innerText(),{timeout:30_000}).toContain('office runtime controls decide')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${surface} ${width} ${theme}`).toBe(true)
    await page.mouse.move(width-1,1499)
    if(shots){
      await putTheMadeUpLabelIn(page,'Made-up test office — saved control wording',shown,'the Runtime page')
      await page.screenshot({path:`${shots}/${surface}-${width}-${theme}.png`,fullPage:false})
    }
  }
},300_000)

// These replies are synthetic browser states. The real restart test proves both starter paths.
for (const missing of [false,true]) it(missing ? 'leaves an accepted restart unverified when its answer has no server identity' : 'does not mistake a restart before the press for completion of this press',async()=>{
  const page=app.page;let accepted=false,replacement=false,polls=0
  await page.route('**/api/office/restart',async(route)=>{
    const response=await route.fetch();const reading=await response.json()
    if(route.request().method()==='POST'){accepted=true;await route.fulfill({response,status:200,json:{requested:true,mode:'checkout',...(missing?{}:{instance:'made-up-accepting-server'})}});return}
    if(accepted)polls++
    await route.fulfill({response,json:{...reading,mode:'checkout',instance:accepted?(replacement?'made-up-replacement-server':'made-up-accepting-server'):'made-up-page-server'}})
  })
  try {
    await page.goto(`${app.site}/?lang=en&mode=inspect#/settings/restart`);await waitForThePage(page,60_000)
    const panel=page.locator('[data-target="uiSurface/settings.restart"]')
    await panel.getByLabel('Why restart?',{exact:true}).fill('Made-up browser confirmation test')
    await panel.getByRole('button',{name:'Restart',exact:true}).click()
    if(missing){await expect.poll(()=>panel.innerText()).toContain('The restart is unverified.');expect(polls).toBe(0)}
    else {
      await expect.poll(()=>polls,{timeout:15_000}).toBeGreaterThan(0)
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
      expect(await panel.innerText()).not.toContain('The office is answering again.')
      replacement=true
      await expect.poll(()=>panel.innerText(),{timeout:15_000}).toContain('The office is answering again.')
    }
  } finally {await page.unroute('**/api/office/restart')}
},120_000)
