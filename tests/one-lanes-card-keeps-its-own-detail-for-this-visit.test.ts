// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A selected card's detail tick changes only that card, survives a reload in its tab, and does
 * not carry into a new tab. This is the filed made-up pipeline page in the production build. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { detailKeyForSurface } from '../src/shared/detail.ts'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'
const SUMMARY = 'An amber shelf stores the made up pieces here.'
const HEADING = 'The blue pieces'
let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-one-detail', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  office = await buildTheMadeUpOffice(write)
  const id = office.id.reader!
  await write.call('PATCH', `/api/records/${id}`, { summary: SUMMARY, dataPatch: { summaryBlocks: [{ id: 'b-1', type: 'text', text: 'The little room has shelves along each wall, and the team has marked the shelves with different colours. The amber shelf holds pieces waiting to be sorted, while the blue shelf holds pieces ready for an example. Each morning the team checks the contents and writes a short note beside the door. A person who needs a piece can read the note and find the right place without moving the other boxes. When the room becomes busy, one person records which pieces have gone out and another checks the empty spaces. At the end of the day they compare those notes and return any unused pieces to their shelves. The arrangement gives everyone a clear way to see what is available and what still needs attention. The room remains a simple example, with no connection to any real office or collection. The team can change its labels when the contents change, but each note should make sense to someone seeing the room for the first time. A second visit should begin with the same clear account of the shelves and their contents.' }] } })
  const revisions = await write.call('GET', `/api/records/${id}/revisions`)
  const newest = revisions.revisions[0]
  await write.call('POST', `/api/records/${id}/short-forms`, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { parts: [{ id: 'p-1', heading: HEADING, text30: 'The examples have a separate short account.', text120: 'The examples have a separate longer account for this card.', covers: ['b-1'] }] } })
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop() }, 120_000)
it('the tick shows written parts at the default title level and restores that card alone', async () => {
  await app.page.goto(app.site)
  await app.page.evaluate(key => { localStorage.removeItem(key); sessionStorage.clear() }, detailKeyForSurface('graph'))
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
  const card = app.page.locator(`${DRAWING} .e-card[data-id="${office.id.reader!}"]`)
  const others = async () => app.page.locator(`${DRAWING} .e-card:not([data-id="${office.id.reader!}"])`).evaluateAll(cards => cards.map(c => [c.getAttribute('data-id'), c.textContent]))
  const original = await card.innerText()
  const beforeOthers = await others()
  expect(original).not.toContain(HEADING)
  expect(original).not.toContain(SUMMARY)
  const p = await aPlaceOnTheCard(app.page, office.id.reader!)
  await app.page.mouse.click(p.x, p.y)
  await app.page.getByRole('button', { name: 'Detail on this card', exact: true }).click()
  await expect.poll(async () => card.innerText()).toContain(HEADING)
  expect(await others()).toEqual(beforeOthers)
  await app.page.getByRole('button', { name: 'Detail on this card', exact: true }).click()
  await expect.poll(async () => card.innerText()).not.toContain(HEADING)
  expect(await others()).toEqual(beforeOthers)
}, 240_000)
it('the tick changes one card, returns in this tab, and is absent in another tab', async () => {
  await app.page.goto(app.site)
  await app.page.evaluate(key => localStorage.setItem(key, 'gist'), detailKeyForSurface('graph'))
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
  const card = app.page.locator(`${DRAWING} .e-card[data-id="${office.id.reader!}"]`)
  const others = async () => app.page.locator(`${DRAWING} .e-card:not([data-id="${office.id.reader!}"])`).evaluateAll(cards => cards.map(c => [c.getAttribute('data-id'), c.textContent]))
  const beforeOthers = await others()
  expect(await card.innerText()).toContain(SUMMARY)
  const p = await aPlaceOnTheCard(app.page, office.id.reader!)
  await app.page.mouse.click(p.x, p.y)
  await app.page.getByRole('button', { name: 'Detail on this card', exact: true }).click()
  await expect.poll(async () => card.innerText()).toContain(HEADING)
  expect(await others()).toEqual(beforeOthers)
  await app.page.reload()
  await theDrawingIsDrawn(app.page)
  await expect.poll(async () => card.innerText()).toContain(HEADING)
  const tab = await app.page.context().newPage()
  try {
    await tab.goto(`${app.site}/?lang=en&theme=light#${pipelinePath(office.id.drawn!)}`)
    await theDrawingIsDrawn(tab)
    const otherTab = tab.locator(`${DRAWING} .e-card[data-id="${office.id.reader!}"]`)
    expect(await otherTab.innerText()).toContain(SUMMARY)
    expect(await otherTab.innerText()).not.toContain(HEADING)
  } finally { await tab.close() }
}, 240_000)
