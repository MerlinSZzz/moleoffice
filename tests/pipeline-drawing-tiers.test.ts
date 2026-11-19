// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The drawing presses use the tiers accepted in a decision.
//
// THE THREE START AGAIN CASES ARE ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026. A filed pipeline's
// page draws its lanes now, and `Start again` is drawn only on the canvas, which the modules drawing
// still draws. So those cases arrange the fixture's two modules in the scope `structure`. That scope
// is one for every case, so each of them first forgets what an earlier case left in it.
//
// A MUTATION THAT TURNS IT RED: in `arranged` in src/web/components/graph/Canvas.tsx, drop the loop
// that counts each drawn card with a stored place. `Start again` then names 0 places, and the case
// that it names exactly how many it will forget goes red.
//
// `FORGET IT` IS PRESSED ON THE PIPELINE'S LANES. Their "How this is shown" offers lane and order
// only, so it has no direction select before the card select, and the case picks the card select by
// its label. What is stored for the card beyond lane and order is still put back by the Undo.
//
// A MUTATION THAT TURNS IT RED: in the `Forget it` press of `PresentationForm` in
// src/web/components/graph/Edit.tsx, have the Undo put back an empty arrangement instead of `before`.
// The card's earlier values do not come back, and the Forget it case goes red.
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
import type { LinksReply } from '../src/server/api/links.ts'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { g7bFixture, g7bHeaders, g7bRequest } from './g7b-fixture.ts'
import { pipelineScope, STRUCTURE_SCOPE } from '../src/shared/presentation.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { scopeKey } from '../src/web/components/graph/model.ts'

let app: LiveApp
let page: Page
let fixture: Awaited<ReturnType<typeof g7bFixture>>
beforeAll(async () => {
  app=await liveApp({name:'g7b-tiers',workspace:'default',viewport:{width:1440,height:1000}})
  page=app.page
  page.setDefaultTimeout(15_000)
},240_000)
beforeEach(async () => {
  fixture=await g7bFixture(app)
  await page.goto(`${app.site}/?lang=en#/pipeline/${fixture.pipe.id}`)
  await waitForThePage(page,30_000)
  await page.locator('.gx-loading').waitFor({state:'detached'})
})
afterAll(async () => {await app?.stop()})

async function action(name:string) {
  await page.getByRole('button',{name:'Edit',exact:true}).click()
  await page.locator('.gx-drawer').getByRole('button',{name,exact:true}).click()
}
async function allLinks(){return (await g7bRequest(app,'/api/links')).links as LinksReply['links']}
async function record(id:string){return (await g7bRequest(app,`/api/records/${id}`)).record}
async function undo(){await page.locator('.tiered-undo').getByRole('button',{name:/^Undo/}).click();await page.locator('.tiered-undo').waitFor({state:'detached'})}
/** The modules drawing, with nothing stored for it and no card size kept in this tab. */
async function theModulesDrawingAsItStarts(){
  const headers=Object.fromEntries(Object.entries(g7bHeaders).filter(([name])=>name!=='content-type'))
  const forgot=await fetch(`${app.api}/api/presentation/${encodeURIComponent(STRUCTURE_SCOPE)}`,{method:'DELETE',headers})
  if(!forgot.ok)throw new Error(`the modules drawing could not be forgotten: ${forgot.status} ${await forgot.text()}`)
  await page.goto(`${app.site}/?lang=en#/pipeline/drawing`)
  await page.evaluate(()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith('mole-office.here.card.'))sessionStorage.removeItem(key)})
  await page.reload();await waitForThePage(page,30_000)
  await page.locator('.gx-loading').waitFor({state:'detached'})
}
const canonical=(links:Awaited<ReturnType<typeof allLinks>>)=>links.map(({fromId,toId,type,gate})=>({fromId,toId,type,gate})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))

it('asks before deleting a whole record, names it, and Cancel changes nothing',async()=>{
  await action('Remove an item')
  await page.locator('.gx-drawer select').selectOption({label:'module · Cedar Shelf'})
  await page.getByRole('button',{name:'Delete it (recoverable)',exact:true}).click()
  const question=page.getByRole('dialog')
  expect(await question.locator('blockquote').innerText()).toBe('Cedar Shelf')
  expect((await record(fixture.shelf.id)).deletedAt).toBeNull()
  await question.getByRole('button',{name:'Cancel',exact:true}).click()
  expect((await record(fixture.shelf.id)).deletedAt).toBeNull()
  await page.getByRole('button',{name:'Delete it (recoverable)',exact:true}).click()
  await question.getByRole('button',{name:'Delete it (recoverable)',exact:true}).click()
  await expect.poll(async()=>(await record(fixture.shelf.id)).deletedAt).not.toBeNull()
})

it('asks before deleting a block and removes it from the stored order in the same press',async()=>{
  await action('Add or edit a block')
  const row=page.locator('.gx-order-row').filter({hasText:'Read Cards'})
  const before=(await record(fixture.pipe.id)).data.blockIds
  await row.getByRole('button',{name:'Remove',exact:true}).click()
  const question=page.getByRole('dialog')
  expect(await question.locator('blockquote').innerText()).toBe(fixture.second.title)
  expect((await record(fixture.pipe.id)).data.blockIds).toEqual(before)
  await question.getByRole('button',{name:'Remove',exact:true}).click()
  await expect.poll(async()=>(await record(fixture.pipe.id)).data.blockIds).toEqual(before.filter((id:string)=>id!==fixture.second.id))
  expect((await record(fixture.second.id)).deletedAt).not.toBeNull()
})

it('asks before replacing a relationship and explains the possible failed second write',async()=>{
  const before=await allLinks()
  const old=before.find(link=>link.fromId===fixture.shelf.id&&link.toId===fixture.desk.id)!
  await action('Change a relationship')
  await page.locator('.gx-drawer select').nth(0).selectOption(`link:${old.id}`)
  await page.locator('.gx-drawer select').nth(2).selectOption('hard')
  await page.getByRole('button',{name:'Replace it',exact:true}).click()
  const question=page.getByRole('dialog')
  expect(await question.innerText()).toContain('If saving fails, the old relationship will be absent.')
  expect(await allLinks()).toEqual(before)
  await question.getByRole('button',{name:'Replace it',exact:true}).click()
  await expect.poll(async()=>(await allLinks()).some(link=>link.id===old.id)).toBe(false)
  await expect.poll(async()=>(await allLinks()).some(link=>link.fromId===old.fromId&&link.toId===old.toId&&link.type==='blocks'&&link.gate?.kind==='hard')).toBe(true)
})

it('drops the old gate when a blocking relationship becomes a different kind',async()=>{
  const old=(await allLinks()).find(link=>link.fromId===fixture.shelf.id&&link.toId===fixture.desk.id)!
  expect(old.gate?.kind).toBe('partial')
  await action('Change a relationship')
  await page.locator('.gx-drawer select').nth(0).selectOption(`link:${old.id}`)
  await page.locator('.gx-drawer select').nth(1).selectOption('relates_to')
  await page.getByRole('button',{name:'Replace it',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'Replace it',exact:true}).click()
  await expect.poll(async()=>(await allLinks()).some(link=>link.fromId===old.fromId&&link.toId===old.toId&&link.type==='relates_to'&&link.gate===null)).toBe(true)
  expect((await allLinks()).some(link=>link.id===old.id)).toBe(false)
})

it('removes a relationship at once and Undo recreates its ends, type and partial gate',async()=>{
  const before=await allLinks()
  const old=before.find(link=>link.fromId===fixture.shelf.id&&link.toId===fixture.desk.id)!
  await action('Remove a relationship')
  await page.locator('.gx-drawer select').selectOption(`link:${old.id}`)
  await page.getByRole('button',{name:'Remove it',exact:true}).click()
  await page.locator('.tiered-undo').waitFor()
  expect(await page.getByRole('dialog').count()).toBe(0)
  expect((await allLinks()).some(link=>link.id===old.id)).toBe(false)
  await undo()
  expect(canonical(await allLinks())).toEqual(canonical(before))
})

it('undoes Save the block with exactly the earlier name, state and carrier set',async()=>{
  const before=await record(fixture.second.id)
  const links=await allLinks()
  await action('Add or edit a block')
  await page.locator('.gx-drawer select').nth(1).selectOption(fixture.second.id)
  await page.locator('.gx-carrier').filter({hasText:'Cedar Shelf'}).getByRole('button',{name:'stop carrying',exact:true}).click()
  await page.locator('.gx-drawer input').first().fill('Read Covers')
  await page.getByRole('button',{name:'Save the block',exact:true}).click()
  await page.locator('.tiered-undo').waitFor()
  expect((await record(fixture.second.id)).title).toContain('Read Covers')
  expect((await allLinks()).filter(link=>link.toId===fixture.second.id&&link.type==='implements').length).toBe(1)
  await undo()
  const after=await record(fixture.second.id)
  expect({title:after.title,data:after.data}).toEqual({title:before.title,data:before.data})
  expect(canonical(await allLinks())).toEqual(canonical(links))
})

it('undoes Forget it with every earlier presentation value',async()=>{
  const scope=encodeURIComponent(pipelineScope(fixture.pipe.id))
  const prior={lane:'Reading room',order:3,role:'prominent',emphasis:'active',x:120,y:75}
  await g7bRequest(app,`/api/presentation/${scope}/nodes/${fixture.second.id}`,'PUT',{intent:prior})
  await page.reload();await waitForThePage(page,30_000)
  await action('How this is shown')
  await page.locator('.gx-drawer').getByLabel('Which card you are arranging',{exact:true}).selectOption(fixture.second.id)
  await page.getByRole('button',{name:'Forget it',exact:true}).click()
  await page.locator('.tiered-undo').waitFor()
  expect((await g7bRequest(app,`/api/presentation/${scope}`)).intent.nodes?.[fixture.second.id]).toBeUndefined()
  await undo()
  expect((await g7bRequest(app,`/api/presentation/${scope}`)).intent.nodes[fixture.second.id]).toEqual(prior)
})

it('undoes Start again with the full arrangement and every saved card size, including an undrawn card',async()=>{
  await theModulesDrawingAsItStarts()
  const rawScope=STRUCTURE_SCOPE,scope=encodeURIComponent(rawScope)
  const first={x:80,y:90,lane:'Reading room',order:1,role:'compact'}
  const second={x:360,y:120,emphasis:'active'}
  await g7bRequest(app,`/api/presentation/${scope}/direction`,'PUT',{intent:{direction:'down'}})
  await g7bRequest(app,`/api/presentation/${scope}/nodes/${fixture.shelf.id}`,'PUT',{intent:first})
  await g7bRequest(app,`/api/presentation/${scope}/nodes/${fixture.desk.id}`,'PUT',{intent:second})
  const before=(await g7bRequest(app,`/api/presentation/${scope}`)).intent
  // The modules drawing keeps a card's size under its own name, `modules`, and its places under
  // `structure`: on a pipeline's drawing the two names were one.
  await page.evaluate(({scope,id})=>{
    sessionStorage.setItem(`mole-office.here.card.${scope}.${id}`,JSON.stringify({room:1.3,height:210,width:340,level:'title',detail:false}))
  },{scope:scopeKey({at:'modules'}),id:fixture.empty.id})
  await page.reload();await waitForThePage(page,30_000)
  const sizes=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('mole-office.here.card.')).sort())
  expect(sizes.length).toBeGreaterThan(0)
  await page.getByRole('button',{name:'Start again',exact:true}).click()
  await page.locator('.tiered-undo').waitFor()
  expect((await g7bRequest(app,`/api/presentation/${scope}`)).intent).toEqual({})
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('mole-office.here.card.')))).toEqual([])
  await undo()
  expect((await g7bRequest(app,`/api/presentation/${scope}`)).intent).toEqual(before)
  expect(await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('mole-office.here.card.')).sort())).toEqual(sizes)
})

it('Start again names exactly how many places and sizes it will forget',async()=>{
  await theModulesDrawingAsItStarts()
  const scope=encodeURIComponent(STRUCTURE_SCOPE)
  await g7bRequest(app,`/api/presentation/${scope}/nodes/${fixture.shelf.id}`,'PUT',{intent:{x:80,y:90}})
  await page.reload();await waitForThePage(page,30_000)
  const reset=page.getByRole('button',{name:'Start again',exact:true})
  await expect.poll(()=>reset.getAttribute('title')).toBe('Forget 1 place and 0 sizes you have given this drawing, and lay it out again.')
})

it('Start again explains an unchanged drawing instead of claiming a save is pending',async()=>{
  await theModulesDrawingAsItStarts()
  const reset=page.getByRole('button',{name:'Start again',exact:true})
  await expect.poll(()=>reset.getAttribute('aria-disabled')).toBe('true')
  await reset.dispatchEvent('click')
  expect(await page.locator('.px-why').innerText()).toBe(englishWords()['g7b.press.resetAlready' as never])
  expect(await page.locator('.tiered-undo').count()).toBe(0)
})

it('names an undrawn card when its saved arrangement cannot be applied, without its identifier',async()=>{
  const unlinked=(await g7bRequest(app,'/api/records','POST',{kind:'module',title:'Cedar Quiet Shelf',data:{context:'A spare shelf for books.',parts:[]}})).record
  await g7bRequest(app,`/api/presentation/structure/nodes/${unlinked.id}`,'PUT',{intent:{lane:'Reading room',order:1,emphasis:'active'}})
  await page.goto(`${app.site}/?lang=en#/pipeline/drawing`);await waitForThePage(page,30_000)
  const report=page.locator('.gx-report')
  await expect.poll(()=>report.innerText()).toContain('Cedar Quiet Shelf')
  expect(await report.innerText()).toContain('could not be applied')
  expect(await report.innerText()).not.toContain(unlinked.id)
})
