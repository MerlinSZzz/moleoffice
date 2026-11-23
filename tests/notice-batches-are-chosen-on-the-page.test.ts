// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { t } from '../src/shared/i18n.ts'
import type { Locator } from 'playwright'
let app: LiveApp, db:TestDb
const headers = { 'content-type':'application/json', 'x-mole-office-workspace':'default', 'x-mole-office-actor-type':'human', 'x-mole-office-actor-id':THE_TEST_OFFICES_OWNER.id }
beforeAll(async () => {
  db=await freshDb()
  const {asNoticeRulesDoor}=await import('../src/server/lib/notice-rules-door.ts')
  const recipient={kind:'person' as const,id:THE_TEST_OFFICES_OWNER.id}
  asNoticeRulesDoor(()=>db.api.createRecord({kind:'notice_rules',title:'Made-up notice choices',workspaceId:'message-centre',actor:{type:'human',id:THE_TEST_OFFICES_OWNER.id},data:{recipient,mutedKinds:[],batchedKinds:['theBroadcastIsDue'],because:'Made-up batch for the pictures'}}))
  const {writeASystemLineToOne}=await import('../src/server/lib/groups.ts'),{SYSTEM_LINES}=await import('../src/shared/groups.ts'),{moleOffice}=await import('../src/shared/participants.ts')
  writeASystemLineToOne(recipient,'default',{...SYSTEM_LINES.theBroadcastIsDue('Made-up pending report'),line:'Made-up pending report'}, {type:'system',id:moleOffice().id})
  app = await liveApp({database:db.file,name:'notice-batch-choices',workspace:'default',viewport:{width:1440,height:1100}})
  await app.context.addInitScript(({person}) => { localStorage.setItem('mole-office.actor',JSON.stringify({type:'human',id:person})); localStorage.setItem('mole-office.preset.theme',new URLSearchParams(location.search).get('look') ?? 'light') }, {person:THE_TEST_OFFICES_OWNER.id})
},240_000)
afterAll(async () => { await app?.stop();db?.close() },120_000)
async function reading() { const r=await fetch(app.api+'/api/messages/notice-rules',{headers});expect(r.status).toBe(200);return await r.json() as {batchedKinds:string[];mutedKinds:string[]} }
// THE PAGE TAKES A SAVE'S REPLY AFTER THE SERVER HAS STORED THE SAVE, and then puts the stored choices back in its form and
// empties the reason. A choice made before that is undone, and the next save stores the old choice again. So after each save
// this file waits for the page's empty reason before it reads the server or makes the next choice. On 12 November 2026 the
// merge queue's run of the related files read the mute back as [] at its poll, and the file was green alone on the same tree.
async function tookTheReply(rules:Locator) { await expect.poll(()=>rules.getByLabel(t('noticeRules.reason')).inputValue(),{timeout:30_000,message:'the page did not take the reply to its save'}).toBe('') }
async function open(width=1440,theme='light') {
  await app.page.setViewportSize({width,height:1100}); await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=normal&look=${theme}#/messages`);await waitForThePage(app.page,60_000)
  const rules=app.page.locator('.px-notice-rules');await rules.locator(':scope > summary').click();return rules
}
it('saves one batch choice per kind, previews both restored lists, and returns to office defaults',async () => {
  const rules=await open(), choice=rules.locator('[data-notice-kind=theBroadcastIsDue]')
  await choice.selectOption('batch');await rules.getByLabel(t('noticeRules.reason')).fill('Made-up batch choice')
  await rules.getByRole('button',{name:t('noticeRules.save'),exact:true}).click();await tookTheReply(rules)
  await expect.poll(async ()=>(await reading()).batchedKinds).toEqual(['theBroadcastIsDue'])
  expect((await reading()).mutedKinds).toEqual([])
  await choice.selectOption('mute');await rules.getByLabel(t('noticeRules.reason')).fill('Made-up mute choice')
  await rules.getByRole('button',{name:t('noticeRules.save'),exact:true}).click();await tookTheReply(rules)
  await expect.poll(async ()=>(await reading()).mutedKinds).toEqual(['theBroadcastIsDue'])
  expect((await reading()).batchedKinds).toEqual([])
  await rules.getByText(t('noticeRules.history'),{exact:true}).click()
  expect(await rules.locator('[data-restore-effect]').count()).toBeGreaterThan(0)
  await rules.getByLabel(t('noticeRules.reason')).fill('Made-up restore')
  await rules.getByRole('button',{name:t('noticeRules.restore'),exact:true}).last().click();await tookTheReply(rules)
  await expect.poll(async ()=>(await reading()).batchedKinds).toEqual(['theBroadcastIsDue'])
},120_000)
it('draws the batch choices and boundary at 1440 and 390 in the light theme',async () => {
  const folder=process.env.W13S_BATCH_SHOTS;if(folder)mkdirSync(folder,{recursive:true})
  for(const width of [1440,390]) {
    const theme='light'
    const rules=await open(width,theme)
    await rules.getByLabel(t('noticeRules.find')).fill('report')
    expect(await rules.locator('[data-notice-kind=theBroadcastIsDue]').inputValue()).toBe('batch')
    expect(await rules.locator('.px-notice-batch-pending').innerText()).toContain(t('noticeRules.readPending'))
    await rules.getByText(t('noticeRules.history'),{exact:true}).click()
    expect(await rules.locator('[data-batch-boundary]').innerText()).toContain(t('noticeRules.batchLimitName'))
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${theme}`).toBe(true)
    if(folder) {await putTheMadeUpLabelIn(app.page,'Made-up test office — notice batch choices',rules,'the Messages page');await app.page.screenshot({path:`${folder}/notice-batches-${width}-${theme}.png`,fullPage:true})}
  }
},240_000)
it('shows the ownership change notice choice at 1440 and 390 in the light theme',async () => {
  const {t: words}=await import('../src/shared/i18n.ts')
  const folder=process.env.OWNER_NOTICE_PICTURES
  if(folder)mkdirSync(folder,{recursive:true})
  const wordKey='noticeWords.theOwnerOfAnAgentChanged'
  const description=words(wordKey)
  for(const width of [1440,390]) {
    const theme='light'
    const rules=await open(width,theme)
    await rules.getByLabel(words('noticeRules.find')).fill(description)
    await expect.poll(()=>rules.locator(`[data-notice-kind=${wordKey.split('.')[1]}]`).isVisible(),{timeout:10_000}).toBe(true)
    expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
    expect(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${theme}`).toBe(true)
    if(folder) {await putTheMadeUpLabelIn(app.page,'Made-up test office — ownership notice choice',rules,'the Messages page');await app.page.screenshot({path:`${folder}/ownership-notice-${width}-${theme}.png`,fullPage:true})}
  }
},240_000)
