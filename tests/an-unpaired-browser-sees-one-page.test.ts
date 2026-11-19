// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { IDENTITY_REFUSAL_CODES } from '../src/shared/refusal-codes.ts'
import { enWave13s } from '../src/shared/words/en-wave-13s.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app:LiveApp
const code=Object.keys(IDENTITY_REFUSAL_CODES)[0]!
const serverWords=enWave13s[`server.${code}` as keyof typeof enWave13s]
const words=enWave13y
const evidence=process.env.W13Y_PAIRING_EVIDENCE

beforeAll(async()=>{app=await liveApp({name:'unpaired-page',viewport:{width:1440,height:900}})})
afterAll(async()=>{await app?.stop()})

it('shows one pairing page on the office refusal, with the right action for each machine',async()=>{
  const lightPictures=new Map<string,Buffer>()
  for(const trusted of [false,true]) for(const width of [1440,990,660,390]) for(const theme of ['light','dark'] as const) {
    const context=await app.browser.newContext({viewport:{width,height:width===390?844:900},colorScheme:theme})
    await context.addInitScript(look=>{localStorage.setItem('mole-office.preset.theme',look);localStorage.setItem('mole-office.language','en')},theme)
    const page=await context.newPage()
    let askedDevice:unknown
    let canAsk=trusted
    let pairingHeaders:Record<string,string>={}
    await page.route('**/api/participants/agent/**',async route=>{
      const real=await route.fetch()
      await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
    })
    await page.route('**/api/office/pairing',async route=>{
      const real=await route.fetch();pairingHeaders=real.headers()
      await route.fulfill({response:real,status:200,json:{paired:false,offered:false,mayAsk:canAsk,waiting:null}})
    })
    await page.route('**/api/office/pairing/ask',async route=>{
      askedDevice=JSON.parse(route.request().postData()??'{}').device
      await route.fulfill({status:200,headers:pairingHeaders,json:{credentialId:'invented-credential',device:askedDevice,waitingForConfirmation:true}})
    })
    try {
      await page.goto(`${app.site}/#/records`)
      await page.getByRole('heading',{name:words['pairing.unpaired.title']}).waitFor({timeout:10_000})
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      expect(await page.getByRole('main').count()).toBe(1)
      expect(await page.locator('.sidebar, .px-chat, [role="alert"]').count()).toBe(0)
      if(trusted) {
        await page.getByText(words['pairing.unpaired.ask'],{exact:true}).waitFor()
      } else {
        await page.getByText(words['pairing.unpaired.trust'],{exact:true}).waitFor()
        expect(await page.getByRole('button',{name:words['pairing.unpaired.askButton']}).count()).toBe(0)
      }
      const image=await page.screenshot()
      const pictureKey=`${String(trusted)}-${width}`
      if(theme==='light')lightPictures.set(pictureKey,image)
      else expect(image.equals(lightPictures.get(pictureKey)!),'the dark picture must differ from the light picture').toBe(false)
      if(evidence) {
        mkdirSync(evidence,{recursive:true})
        await putTheMadeUpLabelIn(page,'Made-up data — pairing state',page.getByRole('heading',{name:words['pairing.unpaired.title']}),`${width}, ${theme}`)
        await page.screenshot({path:join(evidence,`${trusted?'trusted':'untrusted'}-${width}-${theme}.png`)})
      }
      if(!trusted) {
        canAsk=true
        await page.getByRole('button',{name:words['pairing.unpaired.retry']}).click()
      }
      await page.getByRole('button',{name:words['pairing.unpaired.askButton']}).click()
      await page.getByText(words['pairing.unpaired.waiting'],{exact:true}).waitFor()
      expect(typeof askedDevice).toBe('string')
    } finally {await context.close()}
  }
},240_000)

it('replaces an already open shell when a later page read gets the same refusal',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await page.route('**/api/records?**',async route=>{
      const real=await route.fetch()
      await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
    })
    await page.evaluate(()=>{window.location.hash='#/records'})
    await page.getByRole('heading',{name:words['pairing.unpaired.title']}).waitFor({timeout:10_000})
    expect(await page.locator('.sidebar, .px-chat, [role="alert"]').count()).toBe(0)
  }finally{await context.close()}
},120_000)

it('shows pairing when the very first owner read is refused',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  await page.route('**/api/office/owner',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
  })
  try {
    await page.goto(`${app.site}/#/records`)
    await page.getByRole('heading',{name:words['pairing.unpaired.title']}).waitFor({timeout:10_000})
    expect(await page.locator('.sidebar, .px-chat, [role="alert"]').count()).toBe(0)
  }finally{await context.close()}
},120_000)

it('lets a trusted browser ask again when its earlier request has ended',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  let standing:'pending'|'ended'='pending'
  let pairingHeaders:Record<string,string>={}
  await page.route('**/api/participants/agent/**',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
  })
  await page.route('**/api/office/pairing',async route=>{
    const real=await route.fetch();pairingHeaders=real.headers()
    await route.fulfill({response:real,status:200,json:{paired:false,offered:false,mayAsk:true,waiting:standing==='ended'?{device:'invented device',askedAt:'2026-01-01',standing}:null}})
  })
  await page.route('**/api/office/pairing/ask',route=>route.fulfill({status:200,headers:pairingHeaders,json:{credentialId:'invented',device:'invented device',waitingForConfirmation:true}}))
  try {
    await page.goto(`${app.site}/#/records`)
    await page.getByRole('button',{name:words['pairing.unpaired.askButton']}).click()
    await page.getByText(words['pairing.unpaired.waiting'],{exact:true}).waitFor()
    standing='ended'
    await page.getByRole('button',{name:words['pairing.unpaired.askButton']}).waitFor({timeout:10_000})
  }finally{await context.close()}
},120_000)

it('does not show the pairing page when the office admits a fresh browser',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  try {
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    expect(await page.getByRole('heading',{name:words['pairing.unpaired.title']}).count()).toBe(0)
  }finally{await context.close()}
},120_000)

it('shows the server’s wait sentence when too many pairing requests were made',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  const sentence='An invented pairing limit: try again in 17 seconds.'
  let pairingHeaders:Record<string,string>={}
  await page.route('**/api/participants/agent/**',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
  })
  await page.route('**/api/office/pairing',async route=>{
    const real=await route.fetch();pairingHeaders=real.headers()
    await route.fulfill({response:real,status:200,json:{paired:false,offered:false,mayAsk:true,waiting:null}})
  })
  await page.route('**/api/office/pairing/ask',route=>route.fulfill({status:429,headers:pairingHeaders,json:{error:sentence}}))
  try {
    await page.goto(`${app.site}/#/records`)
    await page.getByRole('button',{name:words['pairing.unpaired.askButton']}).click()
    await page.getByText(sentence,{exact:true}).waitFor({timeout:10_000})
    expect(await page.getByText(words['pairing.unpaired.waiting'],{exact:true}).count()).toBe(0)
  }finally{await context.close()}
},120_000)

it('names the pending device read from the server after a reload',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  const device='An invented pending device'
  await page.route('**/api/participants/agent/**',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:403,json:{error:serverWords,code,values:{}}})
  })
  await page.route('**/api/office/pairing',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:200,json:{paired:false,offered:false,mayAsk:true,waiting:{device,askedAt:'2026-01-01',standing:'pending'}}})
  })
  try {
    await page.goto(`${app.site}/#/records`)
    await page.getByText(words['pairing.unpaired.waiting'],{exact:true}).waitFor({timeout:10_000})
    await page.getByText(device,{exact:true}).waitFor({timeout:10_000})
  }finally{await context.close()}
},120_000)

it('does not treat an unrelated refusal as a pairing refusal',async()=>{
  const context=await app.browser.newContext();const page=await context.newPage()
  const reason='An invented agent key is missing.'
  await page.route('**/api/participants/agent/**',async route=>{
    const real=await route.fetch()
    await route.fulfill({response:real,status:403,json:{error:reason}})
  })
  try {
    await page.goto(`${app.site}/#/records`)
    await page.getByText(reason,{exact:false}).waitFor({timeout:10_000})
    expect(await page.getByRole('heading',{name:words['pairing.unpaired.title']}).count()).toBe(0)
  }finally{await context.close()}
},120_000)
