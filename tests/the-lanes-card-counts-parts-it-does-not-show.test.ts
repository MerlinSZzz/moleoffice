// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A detail tick draws up to three written parts and counts the rest on that card. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'
let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-parts-count', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const write = writerFor(app, PROJECT.id)
  office = await buildTheMadeUpOffice(write)
  const id = office.id.reader!
  const names = ['Amber', 'Blue', 'Copper', 'Dappled', 'Emerald']
  const blocks = names.map((name, i) => ({ id: `b-${i}`, type: 'text', text: `${name} is a made up shelf in the example room. The shelf keeps its own collection of little pieces, each marked for a different stage of the imaginary work. Every morning a team member checks the labels, compares the notes with the pieces on the shelf, and writes down anything that has changed. This long account belongs to the invented example and does not describe a real office. It gives a reader enough information to tell the shelves apart and to understand what the pieces are for. The team returns each piece to the correct place at the end of the day so that someone else can find it on a later visit. The signs beside the door say which part of the collection belongs here and the written notes record the small changes over time.` }))
  await write.call('PATCH', `/api/records/${id}`, { summary: 'Five made up shelves keep the example pieces apart.', dataPatch: { summaryBlocks: blocks } })
  const revisions = await write.call('GET', `/api/records/${id}/revisions`)
  await write.call('POST', `/api/records/${id}/short-forms`, { madeFrom: { seq: revisions.revisions[0].seq, contentHash: revisions.revisions[0].contentHash }, forms: { parts: names.map((name, i) => ({ id: `p-${i}`, heading: `${name} shelf`, text30: `The ${name.toLowerCase()} shelf has its own example.`, text120: `The ${name.toLowerCase()} shelf carries an example account for the room.`, covers: [`b-${i}`] })) } })
  await prepareThePage(app, PROJECT.id)
}, 300_000)
afterAll(async () => { await app?.stop() }, 120_000)
it('three parts are shown and the two held back are counted on the card', async () => {
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
  const card = app.page.locator(`${DRAWING} .e-card[data-id="${office.id.reader!}"]`)
  const p = await aPlaceOnTheCard(app.page, office.id.reader!)
  await app.page.mouse.click(p.x, p.y)
  await app.page.getByRole('button', { name: 'Detail on this card', exact: true }).click()
  await expect.poll(async () => card.innerText()).toContain('Amber shelf')
  const words = await card.innerText()
  expect(words).toContain('Blue shelf')
  expect(words).toContain('Copper shelf')
  expect(words).not.toContain('Dappled shelf')
  expect(words).not.toContain('Emerald shelf')
  expect(words).toMatch(/\+2\s+parts of this record/i)
}, 240_000)
