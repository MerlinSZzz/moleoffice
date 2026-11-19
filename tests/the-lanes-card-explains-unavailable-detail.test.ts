// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A selected card with no written parts shows its unavailable detail tick and its reason;
 * a real pointer press reports the reason without changing any card's reading content. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'
let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-unavailable-detail', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)
it('a card without parts explains the unavailable tick and the press changes no card', async () => {
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
  const p = await aPlaceOnTheCard(app.page, office.id.reader!)
  await app.page.mouse.click(p.x, p.y)
  const card = app.page.locator(`${DRAWING} .e-card[data-id="${office.id.reader!}"]`)
  const contents = async () => app.page.locator(`${DRAWING} .e-card`).evaluateAll(cards => cards.map(card => ({
    id: card.getAttribute('data-id'),
    reading: [...card.querySelectorAll('.e-head, .e-chip-row, .e-summary, .e-parts')].map(part => part.textContent),
  })))
  const before = await contents()
  const tick = card.getByRole('button', { name: 'Detail on this card', exact: true })
  expect(await tick.isVisible()).toBe(true)
  expect(await tick.getAttribute('aria-disabled')).toBe('true')
  const box = await tick.boundingBox()
  expect(box).not.toBeNull()
  await app.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect.poll(() => card.getByRole('status').textContent()).toContain('This record is not written by part, so there is no level 4, 5 or 6 for the detail tick to show.')
  expect(await contents()).toEqual(before)
}, 180_000)
