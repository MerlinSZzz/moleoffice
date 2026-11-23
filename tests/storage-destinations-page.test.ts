// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real settings page save/reload and eight English pictures. No upload or live office.
 * Mutations: drop a physical category row, forget tick edits, display a guessed core size.
 */
import { beforeAll,afterAll,it,expect } from 'vitest'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import Database from 'better-sqlite3'
import { liveApp,waitForThePage,type LiveApp } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { STORAGE_CATEGORIES } from '../src/shared/storage/categories.ts'
import { englishWords } from '../src/shared/words/joined.ts'
const scratch=aTestDatabaseFolder('destination-page'), oldHome=process.env['HOME']
const template=JSON.parse(readFileSync(new URL('../sandboxes/mole-office-dev/sandbox.json',import.meta.url),'utf8'))
const templateFile=template.secrets.hostFile.replace(/^~(?=\/)/,scratch)
if(!templateFile.startsWith(scratch+sep))throw new Error("The sandbox template's secrets file is not under the home folder, so the test will not write it.")
const windowsFile='C:\\Users\\made-up\\AppData\\Roaming\\mole-office\\storage-destination-secrets.env'
let app:LiveApp
const words=englishWords() as unknown as Record<string,string>
const word=(key:string)=>words[`storageDestinations.${key}`]!
const fill=(key:string,values:Record<string,string>)=>Object.entries(values).reduce((said,[name,value])=>said.split(`{${name}}`).join(value),words[key]!)
const panel='[data-storage-destinations]'
beforeAll(async()=>{
  process.env['HOME']=scratch
  app=await liveApp({name:'destination-settings',viewport:{width:1440,height:1000},theDevServerBecause:'The criterion runs against changed settings source before the joined build; page mutations must change the served page.'})
})
afterAll(async()=>{await app?.stop();if(oldHome===undefined)delete process.env['HOME'];else process.env['HOME']=oldHome;rmSync(scratch,{recursive:true,force:true})})
async function open(){await app.page.goto(`${app.site}/?lang=en#/settings/storage`);await app.page.reload();await waitForThePage(app.page,30_000)}
async function takePictures(prefix:string,redraw:()=>Promise<void>){
  const shots=process.env['STORAGE_DESTINATION_SHOTS']
  if(!shots)return
  mkdirSync(shots,{recursive:true})
  for(const theme of ['light','dark'] as const){
    await app.page.emulateMedia({colorScheme:theme})
    await app.page.evaluate((chosen)=>localStorage.setItem('mole-office.preset.theme',chosen),theme)
    await app.page.reload();await waitForThePage(app.page,30_000)
    await redraw()
    await putTheMadeUpLabelIn(app.page,'Made-up test office — all sizes and destinations are synthetic',app.page.locator('[data-settings-panel="settings.storage"]'),'storage destinations')
    for(const width of [1440,990,660,390]){
      await app.page.setViewportSize({width,height:1000});await app.page.waitForTimeout(150)
      expect(await app.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
      await app.page.evaluate(()=>window.scrollTo(0,0))
      const clip=await app.page.evaluate(()=>{
        const block=document.querySelector('[data-settings-panel="settings.storage"]')!,label=document.querySelector('[data-made-up-label]')!
        const b=block.getBoundingClientRect(),l=label.getBoundingClientRect()
        const x=Math.max(0,b.left+window.scrollX-12),y=Math.max(0,l.top+window.scrollY-8)
        return {x,y,width:Math.min(document.documentElement.scrollWidth,b.right+window.scrollX+12)-x,height:b.bottom+window.scrollY+12-y}
      })
      const file=join(shots,`${prefix}-${width}-${theme}.png`)
      await app.page.screenshot({path:file,fullPage:true,clip})
      if(theme==='dark')expect(readFileSync(file).equals(readFileSync(join(shots,`${prefix}-${width}-light.png`))),'a dark picture is not the light one at the same width').toBe(false)
    }
  }
}
it('draws the destination form, full defaults, unknown measurements and saves ticks across reload',async()=>{
  await open()
  expect(await app.page.locator(panel).count(),'storage settings panel on the actual Settings page').toBe(1)
  const where=app.page.locator(`${panel} [data-storage-credentials]`)
  expect(await where.count(),'the section says where credentials are kept').toBe(1)
  expect(await where.locator('p').allTextContents(),'a sentence holds the file').not.toEqual(expect.arrayContaining([expect.stringContaining(templateFile)]))
  expect(await where.locator('dt').allTextContents()).toEqual([words['storageDestinations.row.credentialsFile']!])
  expect(await where.locator('dd code').textContent(),'the file is on its own row').toBe(templateFile)
  expect(await where.locator('dd').textContent(),'the row says the file is not made yet').toContain(words['storageDestinations.row.notMadeYet']!)
  expect(await where.textContent()).toContain(word('fromTemplates'))
  expect(await app.page.locator(`${panel} [data-storage-mode-cannot-tell]`).count()).toBe(0)
  expect(await app.page.locator(`${panel} [data-storage-credentials-refused]`).count()).toBe(0)
  const {DEFAULT_UPLOAD_POLICY,destinationWarningBytes}=await import('../src/shared/storage/destinations.ts')
  await app.page.locator(panel).getByRole('button',{name:word('add'),exact:true}).click()
  const form=app.page.locator('[data-storage-form]')
  for(const [key,on] of Object.entries(DEFAULT_UPLOAD_POLICY).filter(([,value])=>typeof value==='boolean'))expect(await form.locator(`[name="${key}"]`).isChecked(),key).toBe(on)
  expect(await form.locator('[name="core"]').isDisabled()).toBe(true)
  expect(await form.locator('[name="thresholdMB"]').inputValue()).toBe(String(DEFAULT_UPLOAD_POLICY.thresholdMB))
  expect(await form.locator('[data-storage-core]').textContent()).toContain(word('notMeasured'))
  await form.locator('[name="name"]').fill('made-up-archive')
  await form.locator('[name="path"]').fill('/made-up/archive')
  await form.locator('[name="limitMB"]').fill('100')
  await form.locator('[name="workers"]').check();await form.locator('[name="text"]').uncheck()
  await form.locator('[name="thresholdMB"]').fill('7')
  await form.getByRole('button',{name:word('save'),exact:true}).click()
  await app.page.getByText(word('saved'),{exact:true}).waitFor()
  await app.page.reload();await waitForThePage(app.page,30_000)
  await app.page.locator(panel).getByRole('button',{name:'made-up-archive',exact:true}).click()
  expect(await form.locator('[name="workers"]').isChecked()).toBe(true);expect(await form.locator('[name="text"]').isChecked()).toBe(false)
  expect(await form.locator('[name="thresholdMB"]').inputValue()).toBe('7')
  expect(await form.textContent()).toContain(`${destinationWarningBytes(100_000_000)/1_000_000} MB`);expect(await form.textContent()).toContain(word('coreContinues'))
  expect(await form.locator('[data-storage-held]').textContent()).toContain(word('noUpload'))
})
it('shows every measured physical category, incomplete coverage, and a secret form without saved values',async()=>{
  const db=new Database(join(app.dir,'panelx.db'),{fileMustExist:true})
  try{for(const [i,category] of STORAGE_CATEGORIES.entries())db.prepare('INSERT INTO storage_totals(category,bytes,files) VALUES(?,?,?) ON CONFLICT(category) DO UPDATE SET bytes=excluded.bytes,files=excluded.files').run(category,(i+1)*1_000_000,1)}finally{db.close()}
  await open();await app.page.locator(panel).getByRole('button',{name:'made-up-archive',exact:true}).click()
  for(const [i,category] of STORAGE_CATEGORIES.entries())expect(await app.page.locator(`[data-storage-category="${category}"]`).textContent()).toContain(`${i+1} MB`)
  expect(await app.page.locator(panel).textContent()).toContain(word('incomplete'))
  await app.page.locator('[name="kind"]').selectOption('s3')
  await app.page.locator('[name="endpoint"]').fill('https://store.invalid');await app.page.locator('[name="bucket"]').fill('made-up');await app.page.locator('[name="region"]').fill('made-up-region-1')
  await app.page.locator('[name="credentialAction"]').selectOption('replace')
  const madeUp='made-up-browser-secret';await app.page.locator('[name="accessKeyId"]').fill(madeUp);await app.page.locator('[name="secretAccessKey"]').fill(madeUp)
  await app.page.getByRole('button',{name:word('save'),exact:true}).click();await app.page.getByText(word('saved'),{exact:true}).waitFor()
  expect(await app.page.locator('[data-storage-form]').innerHTML()).not.toContain(madeUp)
  expect(await app.page.locator('[name="credentialAction"]').inputValue()).toBe('retain')
  await takePictures('destinations',async()=>{await app.page.locator(panel).getByRole('button',{name:'made-up-archive',exact:true}).click()})
})
it('draws an installed office on Windows, and a refused secrets file with its check',async()=>{
  const routePattern='**/api/office/storage-destinations'
  await app.page.route(routePattern,async route=>{
    if(route.request().method()!=='GET'){await route.continue();return}
    const response=await route.fetch()
    const reply=await response.json()
    await route.fulfill({response,json:{...reply,destinations:[],credentials:{file:windowsFile,from:'data-folder',exists:false,usable:true,refused:null,modeSaysWhoMayRead:false}}})
  })
  try{
    await open()
    expect(await app.page.locator(panel).textContent()).toContain(word('none'))
    const where=app.page.locator(`${panel} [data-storage-credentials]`)
    expect(await where.count(),'the section says where credentials are kept').toBe(1)
    expect(await where.locator('p').allTextContents(),'a sentence holds the file').not.toEqual(expect.arrayContaining([expect.stringContaining(windowsFile)]))
    expect(await where.locator('dt').allTextContents()).toEqual([words['storageDestinations.row.credentialsFile']!])
    expect(await where.locator('dd code').textContent(),'the file is on its own row').toBe(windowsFile)
    expect(await where.locator('dd').textContent(),'the row says the file is not made yet').toContain(words['storageDestinations.row.notMadeYet']!)
    expect(await where.textContent()).toContain(word('fromDataFolder'))
    const cannotTell=app.page.locator(`${panel} [data-storage-mode-cannot-tell]`)
    expect(await cannotTell.count(),'the Windows rule is drawn').toBe(1)
    expect(await cannotTell.textContent()).toContain(word('modeCannotTell'))
    expect(await app.page.locator(`${panel} [data-storage-credentials-refused]`).count()).toBe(0)
    await takePictures('installed',async()=>{})
  }finally{
    await app.page.unroute(routePattern)
  }
  mkdirSync(dirname(templateFile),{recursive:true})
  writeFileSync(templateFile,'UNRELATED_LOGIN=made-up-unrelated\n')
  chmodSync(templateFile,0o644)
  try{
    await open()
    const refused=app.page.locator(`${panel} [data-storage-credentials-refused]`)
    expect(await refused.count(),'the refused file is named').toBe(1)
    expect(await refused.textContent()).toContain(fill('server.storageDestinationSecretsOthersMayRead',{mode:'644'}))
    expect(await refused.textContent()).toContain(word('credentialsUnusable'))
    await app.page.locator(panel).getByRole('button',{name:'made-up-archive',exact:true}).click()
    const form=app.page.locator('[data-storage-form]')
    expect(await form.textContent()).toContain(word('credentialsUnknown'))
    await form.getByRole('button',{name:word('save'),exact:true}).click()
    const alert=app.page.locator(`${panel} [role="alert"]`).filter({hasText:fill('server.storageDestinationSecretsOthersMayRead',{mode:'644'})})
    await alert.first().waitFor()
    expect(await alert.first().textContent()).toContain(fill('server.storageDestinationSecretsOthersMayRead',{mode:'644'}))
    await takePictures('refused',async()=>{
      await app.page.locator(panel).getByRole('button',{name:'made-up-archive',exact:true}).click()
      await app.page.locator('[data-storage-form]').getByRole('button',{name:word('save'),exact:true}).click()
      await app.page.locator(`${panel} [role="alert"]`).first().waitFor()
    })
  }finally{
    chmodSync(templateFile,0o600)
    rmSync(templateFile,{force:true})
  }
})
