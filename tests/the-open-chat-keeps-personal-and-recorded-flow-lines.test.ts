// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The open heading alone draws duty, personal words and observed flow, at four widths in both themes. */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { BrowserContext, Locator, Page, Request } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, READY_TIMEOUT_MS, waitForThePage, type LiveApp, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { A_TEST_THAT_STARTS_SOMETHING } from './how-long-a-test-may-take.ts'
import { seedStatusOffice, STATUS_FIXTURE as F, STATUS_PERSON } from './status-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { participantKey } from '../src/shared/messages.ts'
import { STATE_MAX } from '../src/shared/participants.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

let app:LiveApp
let t:TestDb
const words=enWave13y
const output=process.env.W13Y_STATUS_EVIDENCE
const sharp=createRequire(import.meta.url)('sharp')
const A_PERSON='status-invented-reader'
type ParticipantRead={started:string,status?:number,body?:string,failed?:string,serverBefore:readonly string[]}
const participantReads=new WeakMap<Page,ParticipantRead[]>()
/** Observe the independent participant read from the start of each page, including failed requests. */
async function aPageWithParticipantDiagnostics(context:BrowserContext):Promise<Page> {
  const page=await context.newPage()
  const reads:ParticipantRead[]=[]
  const byRequest=new Map<Request,ParticipantRead>()
  participantReads.set(page,reads)
  page.on('request',request=>{
    const url=new URL(request.url())
    if(url.pathname!=='/api/participants'||url.searchParams.get('shape')!=='page')return
    const read:ParticipantRead={started:new Date().toISOString(),serverBefore:app.apiLog()}
    reads.push(read);byRequest.set(request,read)
  })
  page.on('response',response=>{
    const read=byRequest.get(response.request())
    if(read===undefined)return
    read.status=response.status()
    void response.text().then(body=>{read.body=body},err=>{read.body=`Could not read response body: ${String(err)}`})
  })
  page.on('requestfailed',request=>{const read=byRequest.get(request);if(read!==undefined)read.failed=request.failure()?.errorText??'Request failed without a reason.'})
  return page
}
/** The server lines retained since the first participant request, accounting for the rolling log. */
function participantDiagnostics(page:Page):string {
  const reads=participantReads.get(page)??[]
  const before=reads[0]?.serverBefore??[]
  const after=app.apiLog()
  let overlap=Math.min(before.length,after.length)
  while(overlap>0&&!before.slice(-overlap).every((line,i)=>line===after[i]))overlap--
  return JSON.stringify({reads:reads.map(({serverBefore,...read})=>read),serverLines:after.slice(overlap)})
}
/** Whether a conversation's answer is the one the heading was opened on. */
const theConversationOf=(id:string)=>(response:{url():string})=>new URL(response.url()).pathname==='/api/messages/conversation'&&new URL(response.url()).searchParams.get('id')===id
/**
 * HOW LONG ONE WAIT MAY TAKE, AND A CASE IN ALL (problem sJV3z_K9Sq43). Opening a heading is four waits one after another:
 * the page's ready mark, the conversation's answer, the ready mark again, and the part of the heading a case reads. Each
 * had Playwright's own thirty seconds and the case had thirty in all, so on a busy machine their sum ran out the case's
 * time first, and the runner said only "Test timed out in 30000ms", naming no wait. It did so on main and beside an
 * entry, for a person's heading at 1440, on 7 November 2026. Now each wait has this bound and says what it waited for
 * when the bound passes, and a case's time is above the sum of its bounds, so a late answer fails in those words.
 */
const A_WAIT_MAY_TAKE=READY_TIMEOUT_MS
/** The time for a case that makes this many bounded waits, with the time a test that starts something has for the rest. */
const theTimeFor=(waits:number)=>waits*A_WAIT_MAY_TAKE+A_TEST_THAT_STARTS_SOMETHING
/** The waits of a page opened at an address: its load, then its ready mark. */
const A_PAGE=2
/** The waits of one conversation opened by `openTheConversationWith`: its answer, then the ready mark again. */
const AN_OPENING=2
/** The waits of one heading made by `theHeadingOf`: a page, and the conversation opened in it. */
const ONE_HEADING=A_PAGE+AN_OPENING
/** A promise a case waits on, bounded, with the words that say what it waited for when the bound passes. */
async function within<T>(promise:Promise<T>,words:string):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined
  try {
    return await Promise.race([promise,new Promise<never>((_,fail)=>{timer=setTimeout(()=>fail(new Error(words)),A_WAIT_MAY_TAKE)})])
  }finally{clearTimeout(timer)}
}
/**
 * OPEN ONE CONVERSATION AS ANOTHER PAGE DOES, AND WAIT UNTIL ITS ANSWER IS DRAWN. Its answer is listened for before the
 * press, so an answer that comes at once is not missed, and the reads it asks for are counted, so the words tell a late
 * answer from a read never made. `drawn` is the part of the heading a case needs when that part comes from a read of its
 * own, as the name does; it is waited for once the page has drawn the answer, for `within` milliseconds or one wait's
 * whole bound.
 */
async function openTheConversationWith(page:Page,who:{kind:'agent'|'person',id:string},drawn?:{part:Locator,is:string,within?:number}) {
  const which=`the conversation with ${who.kind} ${who.id}`
  let asked=0
  const counting=(request:{url():string})=>{if(theConversationOf(who.id)(request))asked++}
  page.on('request',counting)
  try {
    const answer=page.waitForResponse(theConversationOf(who.id),{timeout:A_WAIT_MAY_TAKE}).catch(()=>null)
    await page.evaluate(([event,key])=>window.dispatchEvent(new CustomEvent(event,{detail:key})),[OPEN_AT,participantKey(who)] as const)
    const reply=await answer
    if(reply===null)throw new Error(asked===0
      ?`Opening ${which} made no read of it within ${A_WAIT_MAY_TAKE} ms.`
      :`Opening ${which} read it ${asked===1?'once':`${asked} times`}, and no answer came within ${A_WAIT_MAY_TAKE} ms.`)
    await waitForThePage(page,A_WAIT_MAY_TAKE).catch((err:unknown)=>{throw new Error(`${which} answered, and then the page did not finish drawing. ${String(err instanceof Error?err.message:err)}`)})
    const bound=drawn?.within??A_WAIT_MAY_TAKE
    if(drawn!==undefined)await drawn.part.waitFor({timeout:bound}).catch(async()=>{
      const shown=await page.locator('.px-chat-them').last().innerText({timeout:1_000}).catch(()=>null)
      throw new Error(`${which} answered and the page finished drawing, but the heading did not show ${drawn.is} within ${bound} ms. ${shown===null?'No heading was drawn.':`The heading showed: ${JSON.stringify(shown)}`} Participant reads and server lines: ${participantDiagnostics(page)}`)
    })
    return reply
  }finally{page.off('request',counting)}
}
/**
 * THE AGENT'S STATUS AS THE CONVERSATION'S ANSWER CARRIES IT, changed for one case. Since wave 13y round 115 the heading
 * reads the agent's dot, personal words and work line from the conversation's answer, read in the moment of its Cannot
 * reach notice, and the chat makes no status read of its own. Each answer's status as the door sent it is kept in the
 * list returned, so a case can ask that the door sent one.
 */
async function changeTheStatusItCarries(page:Page,change:(status:{available:true,value:any})=>unknown) {
  const sent:unknown[]=[]
  await page.route('**/api/messages/conversation?**',async route=>{
    const real=await route.fetch();const body=await real.json()
    sent.push(body.status)
    const status=body.status?.available===true?change(body.status):undefined
    await route.fulfill({response:real,json:status===undefined?body:{...body,status}})
  })
  return sent
}
beforeAll(async()=>{
  t=await freshDb();const api=(await apiApp()).app;await api.ready();await seedStatusOffice(t,api)
  for(const id of [F.all,F.presence,F.unrecorded]) {
    const reply=await api.inject({method:'POST',url:'/api/records',headers:STATUS_PERSON,payload:{kind:'message',title:'A made-up conversation',data:{body:'The invented ledger is ready to read.',to:[{kind:'agent',id}]}}})
    expect(reply.statusCode,reply.body).toBe(theAnswerToAWriteInATestOffice(STATUS_PERSON,{kind:'message',data:{to:[{kind:'agent',id}]}}))
  }
  // The ledger keeper's conversation is long enough to scroll in the corner window at a phone's width.
  for(let n=1;n<=24;n++) {
    const reply=await api.inject({method:'POST',url:'/api/records',headers:STATUS_PERSON,payload:{kind:'message',title:'A made-up conversation',data:{body:`Invented ledger line ${n}: a made-up count to read.`,to:[{kind:'agent',id:F.all}]}}})
    expect(reply.statusCode,reply.body).toBe(theAnswerToAWriteInATestOffice(STATUS_PERSON,{kind:'message',data:{to:[{kind:'agent',id:F.all}]}}))
  }
  // ANOTHER PERSON, for a person's heading beside the agents' (wave 13y round 115). Made up, and labelled in the pictures.
  const picture=t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as {id:string}
  t.client.sqlite.prepare('INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(A_PERSON,'Invented Reader',A_PERSON,picture.id,'Reading the invented ledger.',F.at,F.at)
  {
    const reply=await api.inject({method:'POST',url:'/api/records',headers:STATUS_PERSON,payload:{kind:'message',title:'A made-up conversation',data:{body:'The invented ledger is ready for you too.',to:[{kind:'person',id:A_PERSON}]}}})
    expect(reply.statusCode,reply.body).toBe(201)
  }
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data,'$.writtenFrom.machine','invented-workbench') WHERE kind='message'").run()
  await api.close()
  // Direct invented rows need their baseline ledger before the ordinary startup guard will serve them.
  const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
  migrateRevisions(t.client.sqlite)
  app=await liveApp({name:'open-chat-status',viewport:{width:1440,height:1000},database:t.file})
})
afterAll(async()=>{
  if(output&&app)cpSync(app.dir,join(output,'browser-runtime'),{recursive:true})
  await app?.stop()
  if(output&&t)cpSync(dirname(t.file),join(output,'browser-database'),{recursive:true})
  t?.close()
})

it('reports a refused participant read beside the missing name',async()=>{
  const context=await app.browser.newContext();const page=await aPageWithParticipantDiagnostics(context)
  const status=503;const body=JSON.stringify({error:'The invented participant read was refused.'})
  const name=(t.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').get(A_PERSON) as {name:string}).name
  await page.route('**/api/participants?shape=page',route=>route.fulfill({status,contentType:'application/json',body}))
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    const head=page.locator('.px-chat-them').last()
    let failure=''
    try {
      // THE NAME NEVER COMES, because every read of the participants is refused at once. So this wait always runs out,
      // and it is three seconds rather than a whole bound.
      await openTheConversationWith(page,{kind:'person',id:A_PERSON},{part:head.locator('.px-chat-name',{hasText:name}),is:'the invented name',within:3_000})
    } catch(err) { failure=String(err) }
    expect(failure).toContain(`"status":${status}`)
    expect(failure).toContain(JSON.stringify(body))
    expect(failure).toContain('"serverLines":')
  }finally{await context.close()}
},theTimeFor(A_PAGE+AN_OPENING+1))

const THE_SCENARIOS=[['all-lines',F.all],['presence-only',F.presence],['unrecorded-flow',F.unrecorded]] as const
for(const width of [1440,990,660,390]) for(const theme of ['light','dark'] as const) it(`keeps all three heading scenarios readable at ${width} in ${theme}`,async()=>{
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:theme})
  await context.addInitScript(look=>{localStorage.setItem('mole-office.preset.theme',look);localStorage.setItem('mole-office.language','en')},theme)
  const page=await aPageWithParticipantDiagnostics(context)
  const requests:string[]=[]
  page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/status'))requests.push(r.url())})
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    for(const [scenario,id] of THE_SCENARIOS) {
      const head=page.locator('.px-chat-them').last()
      // THE NAME IS THE PARTICIPANTS' READ, which is its own and may land after the conversation's, so the picture waits for
      // it (wave 13y round 115: at 390 the pictures were taken with "Name unavailable").
      await openTheConversationWith(page,{kind:'agent',id},{part:head.locator('.px-chat-name').filter({hasNotText:'Name unavailable'}),is:'a name'})
      // AN AGENT WITH NO RUN HAS NO "WORKING ON" LINE: nothing is drawn where there is nothing to say (wave 13y round 111).
      expect(await head.locator('.px-chat-flow').count()).toBe(scenario==='presence-only'?0:1)
      const text=await head.innerText()
      if(scenario==='presence-only')expect(text).not.toContain(words['chat.status.flow'])
      else expect(text).toContain(words['chat.status.flow'])
      if(scenario==='all-lines') {
        expect(text.indexOf(F.duty)).toBeLessThan(text.indexOf(F.personal))
        expect(text.indexOf(F.personal)).toBeLessThan(text.indexOf(words['chat.status.flow']!))
        expect(await head.locator('.px-chat-flow-summary').innerText()).toContain(F.currentStep)
        expect(await head.locator('.px-chat-flow-summary a').count()).toBe(1)
        expect(await head.locator('.px-chat-them-state').getAttribute('title')).toContain(F.personal)
        expect(await head.locator('.px-chat-them-state').textContent()).toContain(F.personal+' (')
      } else {
        // A RUN WITH NO RECORDED STEP IS NAMED BY ITS TITLE, and no words stand in for the step nobody recorded.
        if(scenario==='unrecorded-flow')expect(await head.locator('.px-chat-flow-summary').innerText()).toContain(F.unrecordedRun)
        expect(text).not.toContain('Not recorded')
        expect(await head.locator('.px-chat-them-state').count()).toBe(0)
        await head.locator('.px-chat-edit-personal').click()
        expect(await head.locator('.px-chat-state-box').inputValue()).toBe('')
        await head.locator('.px-chat-state-edit button').first().click()
        expect(await head.locator('.px-chat-state-box').count()).toBe(0)
      }
      const overflow=await head.evaluate(el=>el.scrollWidth>el.clientWidth+1)
      expect(overflow).toBe(false)
      // The duty shows two lines at most, with a press for the rest; the personal line wraps whole; the step keeps two, and
      // "and 1 more" may take a third.
      const lines=await head.evaluate(el=>Object.fromEntries(['.duty-line','.px-chat-them-state','.px-chat-flow-summary'].map(at=>{const n=el.querySelector(at);return [at,n===null?0:n.getBoundingClientRect().height/parseFloat(getComputedStyle(n).lineHeight)]})))
      if(width===390) {
        expect(lines['.duty-line'],JSON.stringify(lines)).toBeLessThanOrEqual(2.05)
        expect(lines['.px-chat-them-state'],JSON.stringify(lines)).toBeLessThanOrEqual(3.1)
        expect(lines['.px-chat-flow-summary'],JSON.stringify(lines)).toBeLessThanOrEqual(3.1)
      }
      expect(await page.locator('.px-chat-contact .px-chat-flow').count()).toBe(0)
      if(output) {
        const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
        await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head,`${scenario}, ${width}, ${theme}`)
        await page.screenshot({path:join(dir,`${scenario}-${width}-${theme}.png`)})
        writeFileSync(join(dir,`${scenario}-${width}-${theme}.json`),JSON.stringify({text,requests,overflow,lines},null,2))
      }
      // THE STATUS COMES WITH THE CONVERSATION'S ANSWER (wave 13y round 115), so the chat makes no status read of its own.
      // Asked after the picture, so a run of this file before the change still draws the heading as it was.
      expect(requests,'the chat made a status read of its own').toEqual([])
      if(scenario==='all-lines') {
        const more=head.locator('.px-chat-flow-more')
        const readCount=requests.length
        await more.click()
        const dialog=page.getByRole('dialog')
        await dialog.waitFor({state:'visible'})
        expect(await dialog.innerText()).toContain('Ledger run one')
        expect(await dialog.innerText()).toContain('Ledger run two')
        expect(await dialog.innerText()).toContain(F.currentStep)
        const bounds=await dialog.evaluate(el=>{const box=el.getBoundingClientRect();return {left:box.left,right:box.right,width:innerWidth,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}})
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(bounds.width)
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth+1)
        if(output) {
          await putTheMadeUpLabelIn(page,'Made-up data — the complete recorded run list',dialog.locator('h2'),`recorded runs, ${width}, ${theme}`)
          await page.screenshot({path:join(output,'pictures',`all-runs-${width}-${theme}.png`)})
        }
        // A short real viewport makes this same complete list need scrolling; no extra data or read is made.
        const previousViewport=page.viewportSize()!
        await page.setViewportSize({width,height:200})
        const short=await dialog.evaluate(el=>{const box=el.getBoundingClientRect();el.scrollTop=el.scrollHeight;return {top:box.top,bottom:box.bottom,height:innerHeight,scrollTop:el.scrollTop,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}})
        expect(short.top).toBeGreaterThanOrEqual(0)
        expect(short.bottom).toBeLessThanOrEqual(short.height)
        expect(short.scrollHeight).toBeGreaterThan(short.clientHeight)
        expect(short.scrollTop).toBeGreaterThan(0)
        await page.setViewportSize(previousViewport)
        await page.keyboard.press('Escape')
        await dialog.waitFor({state:'hidden'})
        expect(await more.evaluate(el=>el===document.activeElement)).toBe(true)
        expect(requests.length).toBe(readCount)
      }
    }
    // Preserve the personal editor's independent exit without saving a new line.
    await openTheConversationWith(page,{kind:'agent',id:F.all})
    await page.locator('.px-chat-them .px-chat-them-state').last().click()
    expect(await page.locator('.px-chat-them .px-chat-state-box').inputValue()).toBe(F.personal)
    await page.locator('.px-chat-them .px-chat-state-edit button').first().click()
    expect(await page.locator('.px-chat-them .px-chat-state-box').count()).toBe(0)
  }finally{await context.close()}
},theTimeFor(A_PAGE+THE_SCENARIOS.length*(AN_OPENING+1)+AN_OPENING))

for(const width of [1440,390]) for(const theme of ['light','dark'] as const) it(`draws a person's heading with no agent's status at ${width} in ${theme}`,async()=>{
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:theme})
  await context.addInitScript(look=>{localStorage.setItem('mole-office.preset.theme',look);localStorage.setItem('mole-office.language','en')},theme)
  const page=await aPageWithParticipantDiagnostics(context)
  const requests:string[]=[]
  page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/status'))requests.push(r.url())})
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    const head=page.locator('.px-chat-them').last()
    // THE NAME AND THE PERSONAL LINE ARE THE PARTICIPANTS' READ, which may land after the conversation's.
    const reply=await openTheConversationWith(page,{kind:'person',id:A_PERSON},{part:head.locator('.px-chat-name',{hasText:'Invented Reader'}),is:'the name Invented Reader'})
    expect(await head.locator('.px-chat-flow').count()).toBe(0)
    if(output) {
      const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
      await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head,`a person, ${width}, ${theme}`)
      await page.screenshot({path:join(dir,`person-${width}-${theme}.png`)})
    }
    // A PERSON HAS NO AGENT'S STATUS, and the conversation's answer says so by null (wave 13y round 115).
    expect((await reply.json()).status,'the conversation door says a person has no agent’s status').toBeNull()
    expect(requests).toEqual([])
  }finally{await context.close()}
},theTimeFor(A_PAGE+AN_OPENING+1))

/** What `handTheNamesOverWithTheProjects` held in the page, and whether it handed both over. */
type HeldReads={held:string[],handedOver:boolean,names?:string}
const THE_NAMES='/api/participants?shape=page'
const THE_PROJECTS='/api/workspaces'
const THE_CIRCLE='/api/messages/circle'
/**
 * THE NAMES AND THE LIST OF PROJECTS ANSWER IN ONE TURN OF THE BROWSER, the names first, once the circle has answered.
 * A browser that never chose a project draws the corner chat at once and holds the chat page until the list of projects
 * answers. The closed corner reads the names and the circle, and its answer marks the names current for the whole page.
 * So in this order the page's chat is drawn in the same turn as the corner's names, and it starts from what the corner
 * last kept, before its names came. Each answer's body is held in the page, where the app reads it, so the order does
 * not depend on when the answers reach the browser. The names' body is kept, so a case reads the name the server sent.
 */
async function handTheNamesOverWithTheProjects(context:BrowserContext) {
  await context.addInitScript(([names,projects,circle])=>{
    const read=Response.prototype.text
    const record:HeldReads={held:[],handedOver:false}
    const waiting=new Map<string,()=>void>()
    let circleAnswered=false
    const handOverWhenAllHaveCome=()=>{
      if(record.handedOver||!circleAnswered||!waiting.has(names)||!waiting.has(projects))return
      record.handedOver=true
      waiting.get(names)!();waiting.get(projects)!()
    }
    Response.prototype.text=function(this:Response) {
      const body=read.call(this)
      if(this.url==='')return body
      const at=new URL(this.url);const which=at.pathname+at.search
      if(which===circle)return body.then(text=>{circleAnswered=true;handOverWhenAllHaveCome();return text})
      if((which!==names&&which!==projects)||record.held.includes(which))return body
      record.held.push(which)
      return body.then(text=>new Promise<string>(resolve=>{
        if(which===names)record.names=text
        waiting.set(which,()=>resolve(text));handOverWhenAllHaveCome()
      }))
    }
    ;(window as unknown as {theHeldReads:HeldReads}).theHeldReads=record
  },[THE_NAMES,THE_PROJECTS,THE_CIRCLE] as const)
}
for(const width of [1440,990,660,390]) for(const theme of ['light','dark'] as const) it(`draws the name the server sent when the chat page is drawn as the names answer, at ${width} in ${theme}`,async()=>{
  const context=await app.browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:theme})
  await context.addInitScript(look=>{localStorage.setItem('mole-office.preset.theme',look);localStorage.setItem('mole-office.language','en')},theme)
  await handTheNamesOverWithTheProjects(context)
  const page=await aPageWithParticipantDiagnostics(context)
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    const held=await page.evaluate(()=>(window as unknown as {theHeldReads:HeldReads}).theHeldReads)
    expect(held,'the names and the list of projects were held, and handed over together').toMatchObject({held:expect.arrayContaining([THE_NAMES,THE_PROJECTS]),handedOver:true})
    const sent=(JSON.parse(held.names!) as {people:{id:string,name:string}[]}).people.find(one=>one.id===A_PERSON)
    expect(sent,'the names the server sent hold the invented person').toBeDefined()
    const head=page.locator('.px-chat-them').last()
    await openTheConversationWith(page,{kind:'person',id:A_PERSON},{part:head.locator('.px-chat-name',{hasText:sent!.name}),is:`the name the server sent, ${sent!.name}`})
    if(output) {
      const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
      await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head,`a person, the names held, ${width}, ${theme}`)
      await page.screenshot({path:join(dir,`person-names-held-${width}-${theme}.png`)})
    }
  }finally{await context.close()}
},theTimeFor(A_PAGE+AN_OPENING+1))

/** One agent's open heading: on the chat page, or in the side panel that another page opens. A case may ask for a shorter
 *  window, or for another duty, which the duties answer then carries in place of the stored one. A side panel opens
 *  beside the page, unless the case asks for the chat in its own window, which is as tall as the browser window lets it be. */
async function theHeadingOf(width:number,theme:'light'|'dark',where:'page'|'panel',instead:{height?:number,duty?:string,inItsOwnWindow?:true}={}) {
  const context=await app.browser.newContext({viewport:{width,height:instead.height??(width===390?844:1000)},colorScheme:theme})
  await context.addInitScript(([look,own])=>{
    localStorage.setItem('mole-office.preset.theme',look);localStorage.setItem('mole-office.language','en')
    if(own)localStorage.setItem('mole-office.chat.open','yes')
  },[theme,instead.inItsOwnWindow===true] as const)
  const page=await aPageWithParticipantDiagnostics(context)
  if(instead.duty!==undefined)await page.route('**/api/secretaries/duties*',async route=>{
    const real=await route.fetch();const body=await real.json()
    for(const one of body.secretaries)if(one.agent.id===F.all)one.duties.area=instead.duty
    await route.fulfill({response:real,json:body})
  })
  await page.goto(`${app.site}/#/${where==='page'?'chat':'messages'}`);await waitForThePage(page)
  await openTheConversationWith(page,{kind:'agent',id:F.all})
  return {context,page,head:page.locator(where==='page'?'.px-chat-them':'.px-chat .px-chat-them').last()}
}
const BOTH_THEMES=['light','dark'] as const
const BELOW_1440_AND_THE_PANEL=[[1440,'page'],[990,'page'],[660,'page'],[390,'page'],[1440,'panel']] as const
/** Each place with the themes its cases draw it in: a side panel in both, a page in light. */
const inTheirThemes=(places:readonly (readonly [number,'page'|'panel'])[])=>places.flatMap(([width,where])=>(where==='panel'?BOTH_THEMES:['light'] as const).map(theme=>[width,where,theme] as const))
const BELOW_1440_AND_THE_PANEL_IN_THEIR_THEMES=inTheirThemes(BELOW_1440_AND_THE_PANEL)

/** How far the colour drawn just above the heading's bottom edge is from the panel's own colour, from 0 to 255. It is read
 *  from the screen, because the shade is a background and only the drawn picture shows it. The point is two pixels above
 *  the line under the heading, in its left padding, where nothing in the heading draws. */
async function theShadeAtTheBottomOf(page:Page,head:Locator) {
  const at=await head.evaluate(el=>{
    const box=el.getBoundingClientRect()
    return {x:Math.round(box.left+el.clientLeft+4),y:Math.round(box.top+el.clientTop+el.clientHeight-2),
      panel:getComputedStyle(el.closest('.px-chat')!).backgroundColor.match(/\d+/g)!.slice(0,3).map(Number)}
  })
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))
  const shot=await page.screenshot({clip:{x:at.x,y:at.y,width:1,height:1}})
  const drawn:number[]=[...(await sharp(shot).removeAlpha().raw().toBuffer()).subarray(0,3)]
  return Math.max(...drawn.map((one,i)=>Math.abs(one-at.panel[i]!)))
}

it('draws the recorded runs heading as its word, in one form in both themes',async()=>{
  for(const theme of BOTH_THEMES) {
    const {context,page,head}=await theHeadingOf(1440,theme,'page')
    try {
      await head.locator('.px-chat-flow-more').click()
      const title=page.getByRole('dialog').locator('h2')
      await title.waitFor({state:'visible'})
      expect.soft(await title.innerText(),theme).toBe(words['chat.status.allRuns'])
    }finally{await context.close()}
  }
},theTimeFor(BOTH_THEMES.length*ONE_HEADING))

it('keeps the personal line’s setter whole and in view below 1440 and in the side panel',async()=>{
  expect(F.personal,'the longest personal line the door stores, so the pictures show the worst case').toHaveLength(STATE_MAX)
  for(const [width,where,theme] of BELOW_1440_AND_THE_PANEL_IN_THEIR_THEMES) {
    const {context,page,head}=await theHeadingOf(width,theme,where)
    try {
      const line=head.locator('.px-chat-them-state')
      expect(await line.textContent()).toContain(F.personal)
      const seen=await line.evaluate(el=>{
        const box=el.getBoundingClientRect();const setter=el.querySelector('.px-chat-state-setter')!;const one=setter.getBoundingClientRect()
        const tops=[...setter.getClientRects()].map(part=>part.top)
        return {cut:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1,oneLine:Math.max(...tops)-Math.min(...tops)<parseFloat(getComputedStyle(setter).lineHeight)/2,
          inside:one.left>=box.left-0.5&&one.right<=box.right+0.5&&one.top>=box.top-0.5&&one.bottom<=box.bottom+0.5}
      })
      if(output&&where==='panel') {
        const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
        // Above the name, inside the heading: a label across the whole panel would lie over its resize grip.
        await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head.locator('.px-chat-them-top'),`side panel, ${width}, ${theme}`)
        await page.screenshot({path:join(dir,`side-panel-${width}-${theme}.png`)})
      }
      expect.soft(seen,`${width}, ${where}, ${theme}`).toEqual({cut:false,oneLine:true,inside:true})
    }finally{await context.close()}
  }
},theTimeFor(BELOW_1440_AND_THE_PANEL_IN_THEIR_THEMES.length*ONE_HEADING))

it('shows two lines of the longest duty and a press that opens the rest, below 1440 and in the side panel',async()=>{
  // Imported after the scratch office is made: the duties guard reaches the database client, which opens its file on import.
  const { AN_AREA_AT_MOST }=await import('../src/server/lib/grant/secretary-duties.ts')
  expect(F.duty,'the longest duty the door stores, so the pictures show the worst case').toHaveLength(AN_AREA_AT_MOST)
  expect(F.duty,'a duty is one line').not.toMatch(/[\r\n]/)
  const folded:string[]=[]
  for(const [width,where,theme] of BELOW_1440_AND_THE_PANEL_IN_THEIR_THEMES) {
    const {context,head}=await theHeadingOf(width,theme,where)
    try {
      const line=head.locator('.duty-line')
      const press=head.locator('.duty-line-more')
      expect(await line.textContent()).toBe(F.duty)
      const seen=()=>line.evaluate(el=>({lines:el.getBoundingClientRect().height/parseFloat(getComputedStyle(el).lineHeight),
        cut:el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1}))
      // TWO LINES AT MOST, so the heading leaves room for the conversation, and where they cut the duty a press says that
      // there is more and opens it (wave 13y round 113). Where the two lines hold it all, there is no press.
      const two=await seen()
      expect.soft(two.lines,`${width}, ${where}, ${theme}: folded`).toBeLessThanOrEqual(2.05)
      if(!two.cut) {
        expect.soft(await press.count(),`${width}, ${where}, ${theme}: a press for a duty that is all shown`).toBe(0)
        continue
      }
      folded.push(`${width}, ${where}`)
      expect.soft(await press.textContent(),`${width}, ${where}, ${theme}`).toBe(words['chat.duty.more'])
      await press.click()
      await expect.poll(()=>press.textContent()).toBe(words['chat.duty.less'])
      expect.soft((await seen()).cut,`${width}, ${where}, ${theme}: opened`).toBe(false)
    }finally{await context.close()}
  }
  // THE PRESS IS PROVED where the heading is narrowest, or the longest duty would prove nothing about it.
  expect(folded).toContain('390, page')
  expect(folded).toContain('1440, panel')
},theTimeFor(BELOW_1440_AND_THE_PANEL_IN_THEIR_THEMES.length*ONE_HEADING))

it('keeps the composer’s controls whole in a short side panel, where the heading gives way and shows that it scrolls',async()=>{
  for(const theme of BOTH_THEMES) {
    // A window 400 pixels tall leaves the chat's own window at most 304, too short for the heading and the composer
    // together. Beside the page the chat takes the window's whole height, which is not a short panel.
    const {context,page,head}=await theHeadingOf(1440,theme,'panel',{height:400,inItsOwnWindow:true})
    try {
      const list=await head.evaluate(el=>{const said=el.closest('.px-chat')!.querySelector('.px-chat-said')!;const s=getComputedStyle(said);return said.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom)})
      expect(list,'the message list still has height, so the panel is not short enough for this case to prove anything').toBeLessThan(2)
      // Each control of the writing row is drawn, and no box that clips what it holds cuts it, up to the panel itself.
      const cut=await head.evaluate((el,controls)=>{const panel=el.closest('.px-chat')!;return controls.flatMap(at=>{
        const control=panel.querySelector(at);if(control===null||control.getClientRects().length===0)return [`${at} is not drawn`]
        const one=control.getBoundingClientRect()
        for(let box=control.parentElement;box!==null;box=box.parentElement) {
          const s=getComputedStyle(box)
          if(s.overflowX!=='visible'||s.overflowY!=='visible') {
            const b=box.getBoundingClientRect();const top=b.top+box.clientTop;const left=b.left+box.clientLeft
            if(one.top<top-0.5||one.left<left-0.5||one.bottom>top+box.clientHeight+0.5||one.right>left+box.clientWidth+0.5)return [`${at} is cut by .${[...box.classList].join('.')}`]
          }
          if(box===panel)break
        }
        return []
      })},['.px-chat-attach-add','.px-chat-quote-press','.px-chat-intent','.px-chat-box','.px-chat-send'])
      expect.soft(cut,theme).toEqual([])
      expect.soft(await head.evaluate(el=>el.scrollHeight>el.clientHeight+1),`${theme}: the heading scrolls inside itself`).toBe(true)
      expect.soft(await theShadeAtTheBottomOf(page,head),`${theme}: a shade at the heading's bottom edge says there is more`).toBeGreaterThanOrEqual(16)
      if(output) {
        const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
        await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head.locator('.px-chat-them-top'),`short side panel, ${theme}`)
        await page.screenshot({path:join(dir,`side-panel-short-${theme}.png`)})
      }
      await head.evaluate(el=>{el.scrollTop=el.scrollHeight})
      expect.soft(await theShadeAtTheBottomOf(page,head),`${theme}: scrolled to its end, the heading draws no shade`).toBeLessThanOrEqual(2)
      if(output)await page.screenshot({path:join(output,'pictures',`side-panel-short-end-${theme}.png`)})
    }finally{await context.close()}
  }
},theTimeFor(BOTH_THEMES.length*ONE_HEADING))

const A_SHORT_DUTYS_PLACES=inTheirThemes([...BELOW_1440_AND_THE_PANEL,[390,'panel']])
it('draws a short duty’s heading whole and with no shade, below 1440 and in the side panel at 1440 and 390',async()=>{
  const duty='Keeps the night ledger.'
  for(const [width,where,theme] of A_SHORT_DUTYS_PLACES) {
    const {context,page,head}=await theHeadingOf(width,theme,where,{duty})
    try {
      expect(await head.locator('.duty-line').textContent()).toBe(duty)
      expect.soft(await head.locator('.duty-line-more').count(),`${width}, ${where}, ${theme}: a press for a duty that is all shown`).toBe(0)
      const seen={scrolls:await head.evaluate(el=>el.scrollHeight>el.clientHeight+1),shade:await theShadeAtTheBottomOf(page,head)}
      expect.soft(seen.scrolls||seen.shade>2,`${width}, ${where}, ${theme}: ${JSON.stringify(seen)}`).toBe(false)
    }finally{await context.close()}
  }
},theTimeFor(A_SHORT_DUTYS_PLACES.length*ONE_HEADING))

it('keeps the long duty’s heading whole and with no shade in the corner window at 390, where the long conversation gives way',async()=>{
  for(const theme of BOTH_THEMES) {
    const {context,page,head}=await theHeadingOf(390,theme,'panel')
    try {
      // This window has no set height, only a cap, so how much of the overflow each part gives up goes by its length.
      const listScrolls=await head.evaluate(el=>{const said=el.closest('.px-chat')!.querySelector('.px-chat-said')!;return said.scrollHeight>said.clientHeight+1})
      expect(listScrolls,'the conversation does not scroll, so this case proves nothing').toBe(true)
      const seen={scrolls:await head.evaluate(el=>el.scrollHeight>el.clientHeight+1),shade:await theShadeAtTheBottomOf(page,head)}
      expect.soft(seen.scrolls||seen.shade>2,`${theme}: ${JSON.stringify(seen)}`).toBe(false)
      if(output) {
        const dir=join(output,'pictures');mkdirSync(dir,{recursive:true})
        await putTheMadeUpLabelIn(page,'Made-up data — an invented ledger office',head.locator('.px-chat-them-top'),`corner window, 390, ${theme}`)
        await page.screenshot({path:join(dir,`side-panel-390-${theme}.png`)})
      }
    }finally{await context.close()}
  }
},theTimeFor(BOTH_THEMES.length*ONE_HEADING))

it('keeps “and 1 more” whole, after the end of the link or on a line of its own',async()=>{
  for(const [width,where] of BELOW_1440_AND_THE_PANEL) {
    const {context,head}=await theHeadingOf(width,'light',where)
    try {
      const seen=await head.locator('.px-chat-flow-summary').evaluate(el=>{
        const link=[...el.querySelector('a')!.getClientRects()];const more=el.querySelector('.px-chat-flow-more')!;const box=more.getBoundingClientRect()
        const last=link[link.length-1]!;const middle=(box.top+box.bottom)/2
        // A link's line boxes may overlap by a fraction of a pixel, so the button's middle says which line it is on.
        return {lines:Math.round(box.height/parseFloat(getComputedStyle(more).lineHeight)),afterTheEnd:middle>last.top&&middle<last.bottom&&box.left>=last.right-0.5,
          onItsOwnLine:box.top>=el.querySelector('.px-chat-flow-main')!.getBoundingClientRect().bottom-0.5}
      })
      expect.soft(seen.lines,`${width}, ${where}`).toBe(1)
      expect.soft(seen.afterTheEnd||seen.onItsOwnLine,`${width}, ${where}: ${JSON.stringify(seen)}`).toBe(true)
    }finally{await context.close()}
  }
},theTimeFor(BELOW_1440_AND_THE_PANEL.length*ONE_HEADING))

const TIED_THEN_MISSING=[false,true] as const
it('does not invent a newest run from tied or missing recorded start times',async()=>{
  const context=await app.browser.newContext();const page=await aPageWithParticipantDiagnostics(context)
  let missing=false
  const sent=await changeTheStatusItCarries(page,status=>{
    if(status.value.flow.available)for(const run of status.value.flow.value.runs)run.run.startedAtMs=missing?null:1
    return status
  })
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    for(const absent of TIED_THEN_MISSING) {
      missing=absent
      await openTheConversationWith(page,{kind:'agent',id:F.presence})
      await openTheConversationWith(page,{kind:'agent',id:F.all})
      expect(sent.at(-1),'the conversation door answers the agent’s status').toMatchObject({available:true})
      // NO RUN IS NAMED, AND NO WORDS SAY SO: only the press that lists every run (wave 13y round 111).
      expect((await page.locator('.px-chat-flow-summary .px-chat-flow-main').innerText()).trim()).toBe(`${words['chat.status.flow']}:`)
      expect(await page.locator('.px-chat-flow-summary .px-chat-flow-more').innerText()).toBe(words['chat.status.viewRuns'])
      expect(await page.locator('.px-chat-flow-summary a').count()).toBe(0)
    }
  }finally{await context.close()}
},theTimeFor(A_PAGE+TIED_THEN_MISSING.length*2*AN_OPENING))

const THE_FAILED_READS=['the status','the conversation'] as const
const ANOTHER_THEN_THE_FAILED=[F.all,F.unrecorded] as const
it('says the status could not be read after a failed read and never leaves the previous agent’s flow under another name',async()=>{
  // TWO FAILED READS, each in a page of its own after another agent's heading: the door could not read the status beside
  // the conversation, or the conversation's read failed, so nothing beside it was read (wave 13y round 115).
  for(const failed of THE_FAILED_READS) {
    const context=await app.browser.newContext();const page=await aPageWithParticipantDiagnostics(context)
    const sent:unknown[]=[]
    await page.route('**/api/messages/conversation?**',async route=>{
      if(new URL(route.request().url()).searchParams.get('id')!==F.unrecorded)return route.fallback()
      const real=await route.fetch();const body=await real.json();sent.push(body.status)
      if(failed==='the conversation')await route.fulfill({response:real,status:503,contentType:'application/json',body:JSON.stringify({error:'An invented read failure.'})})
      else await route.fulfill({response:real,json:{...body,status:{available:false}}})
    })
    try {
      await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
      for(const id of ANOTHER_THEN_THE_FAILED) {
        await openTheConversationWith(page,{kind:'agent',id})
      }
      // A FAILED READ SAYS SO, in the presence word and on the "Working on" line, and never that the agent is away.
      expect(await page.locator('.px-chat-them .px-chat-presence-word').textContent(),failed).toBe('Could not be read')
      expect(await page.locator('.px-chat-them .px-chat-flow').textContent(),failed).toContain('Could not be read')
      expect(await page.locator('.px-chat-them .px-chat-flow a').count(),failed).toBe(0)
      expect(await page.locator('.px-chat-them .px-chat-dot').getAttribute('data-colour'),failed).toBe('none')
      expect(sent[0],'the conversation door answers the agent’s status').toMatchObject({available:true})
    }finally{await context.close()}
  }
},theTimeFor(THE_FAILED_READS.length*(A_PAGE+ANOTHER_THEN_THE_FAILED.length*AN_OPENING)))

it('keeps fresh personal words with their fresh setter when the registry snapshot is older',async()=>{
  const context=await app.browser.newContext()
  const page=await aPageWithParticipantDiagnostics(context)
  const sent=await changeTheStatusItCarries(page,status=>({...status,value:{...status.value,
    personal:{text:'A newer personal observation',setAt:F.at,setBy:{kind:'agent',id:F.presence}},
    presence:{available:true,value:{colour:'red',word:'A made-up presence reading',says:'An invented status input.'}}}}))
  // THE STATUS DOOR IS NOT WHERE THE HEADING READS: here it contradicts the conversation's answer, and the heading draws
  // the conversation's (wave 13y round 115).
  await page.route('**/api/plugin-read/v1/status?**',async route=>{
    const real=await route.fetch();const body=await real.json()
    for(const agent of body.agents)if(agent.id===F.all){
      agent.personal={text:'A personal line only the status door says',setAt:F.at,setBy:{kind:'agent',id:F.unrecorded}}
      agent.presence={available:true,value:{colour:'green',word:'A presence only the status door says',says:'An invented status input.'}}
    }
    await route.fulfill({response:real,json:body})
  })
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    await openTheConversationWith(page,{kind:'agent',id:F.all})
    expect(sent.at(-1),'the conversation door answers the agent’s status').toMatchObject({available:true})
    const line=page.locator('.px-chat-them .px-chat-them-state')
    expect(await line.textContent()).toContain('A newer personal observation')
    expect(await line.locator('.px-chat-state-by').textContent()).toContain('Bell Listener')
    expect(await page.locator('.px-chat-them .px-chat-dot').getAttribute('data-colour')).toBe('red')
    expect(await page.locator('.px-chat-them .px-chat-dot').getAttribute('aria-label')).toBe('A made-up presence reading')
    await line.click()
    expect(await page.locator('.px-chat-them .px-chat-state-box').inputValue()).toBe('A newer personal observation')
  }finally{await context.close()}
},theTimeFor(A_PAGE+AN_OPENING))

it('keeps a newly saved personal line when an older heading read finishes last',async()=>{
  const context=await app.browser.newContext();const page=await aPageWithParticipantDiagnostics(context)
  let release!:()=>void
  let captured!:()=>void
  let answered!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  const seen=new Promise<void>(resolve=>{captured=resolve})
  const oldReply=new Promise<void>(resolve=>{answered=resolve})
  let first=true
  // THE HEADING'S READ IS THE CONVERSATION'S, which carries the status (wave 13y round 115), so that is the read held.
  await page.route('**/api/messages/conversation?**',async route=>{
    const real=await route.fetch()
    if(first&&new URL(route.request().url()).searchParams.get('id')===F.all){first=false;captured();await held;await route.fulfill({response:real});answered();return}
    await route.fulfill({response:real})
  })
  try {
    await page.goto(`${app.site}/#/chat`);await waitForThePage(page)
    await page.evaluate(([event,key])=>window.dispatchEvent(new CustomEvent(event,{detail:key})),[OPEN_AT,participantKey({kind:'agent',id:F.all})] as const)
    await within(seen,`Opening the conversation with agent ${F.all} had no answer to hold within ${A_WAIT_MAY_TAKE} ms.`)
    await page.locator('.px-chat-them .px-chat-them-state').click({timeout:A_WAIT_MAY_TAKE}).catch(async err=>{
      const shown=await page.locator('.px-chat-them').last().innerText({timeout:1_000}).catch(()=>null)
      throw new Error(`Opening the conversation with agent ${F.all} had its answer held, but its personal line could not be clicked within ${A_WAIT_MAY_TAKE} ms. ${String(err instanceof Error?err.message:err)} ${shown===null?'No heading was drawn.':`The heading showed: ${JSON.stringify(shown)}`} Participant reads and server lines: ${participantDiagnostics(page)}`)
    })
    await page.locator('.px-chat-them .px-chat-state-box').fill('A line saved after the held reading')
    // BEFORE ROUND 115 THE READ AFTER A SAVE WAS A STATUS READ, and none of the conversation was made while the held one was
    // out, so this says so instead of waiting for the case's whole time.
    const freshReply=page.waitForResponse(theConversationOf(F.all),{timeout:A_WAIT_MAY_TAKE}).catch(()=>{throw new Error(`no answer to a read of the conversation came within ${A_WAIT_MAY_TAKE} ms of the save`)})
    await page.locator('.px-chat-them .px-chat-state-box').press('Enter')
    await freshReply
    await expect.poll(()=>page.locator('.px-chat-them .px-chat-them-state').textContent()).toContain('A line saved after the held reading')
    release();await oldReply;await waitForThePage(page)
    expect(await page.locator('.px-chat-them .px-chat-them-state').textContent()).toContain('A line saved after the held reading')
  }finally{release();await context.close()}
},theTimeFor(A_PAGE+3))
