// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'
let app:LiveApp
const handle='invented-empty-chat',name='Invented Empty Chat'
const headers={'content-type':'application/json','x-mole-office-workspace':'default','x-mole-office-actor-type':'human','x-mole-office-actor-id':THE_PERSON}
beforeAll(async()=>{
  app=await liveApp({name:'chat-empty-notice',viewport:{width:1440,height:900},theDevServerBecause:'The optimistic send is checked before the production build.'})
  for(const record of [{kind:'agent',title:name,data:{handle,runtime:'claude-code',state:'active'}},{kind:'message',title:'An invented existing contact',data:{body:'An invented existing contact',to:[{kind:'agent',id:handle}]}}]){
    const response=await fetch(`${app.api}/api/records`,{method:'POST',headers,body:JSON.stringify(record)});expect(response.status,await response.text()).toBe(theAnswerToAWriteInATestOffice(headers,record))
  }
},240_000)
afterAll(async()=>{await app?.stop()})
it('does not announce an empty conversation beneath an optimistic message',async()=>{
  const context=await app.browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage()
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve})
  try{
    await page.route('**/api/messages/conversation?**',async route=>{const answer=await route.fetch(),json=await answer.json() as {messages:unknown[]};json.messages=[];await route.fulfill({response:answer,json})})
    await page.route('**/api/records',async route=>{if(route.request().method()==='POST'&&(route.request().postDataJSON() as {kind?:string}).kind==='message'){await held;await route.abort()}else await route.continue()})
    await page.goto(`${app.site}/#/`);await waitForThePage(page)
    await openTheChat(page)
    await page.locator('.px-chat-contact').filter({hasText:name}).click()
    await page.locator('.px-chat-box').fill('An invented message being sent');await page.locator('.px-chat-send').click()
    await page.locator('.px-chat-bubble[data-send-state="sending"]').waitFor({timeout:30_000})
    expect(await page.locator('.px-chat').textContent()).not.toContain(CHAT_WORDS.noMessagesYet)
    expect(await page.locator('.px-chat-empty').count()).toBe(0)
  }finally{release();await page.unrouteAll({behavior:'wait'});await context.close()}
},120_000)
