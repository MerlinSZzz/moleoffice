// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DETAIL NOTE OPENS AND CLOSES WITH A PRESS, AND IS HIDDEN WHENEVER ITS CARD IS LET GO. Wave 13u round 232.
 *
 * THE FAULT THIS CRITERION NAMES: a card whose record has no parts written gets a Detail tick that cannot be turned
 * on, and a note beside it that says why (src/web/components/graph/lanes/engine.ts, e-detail-reason; styles.ts hides
 * it while the card is not selected). Its press only ever sets the note visible, and the note's own hidden flag is
 * cleared by nothing but the press. So the note comes back without a press when the card is selected again, a second
 * press on the tick does not close it, and Escape hides it only through the selection rule while its flag stays open.
 *
 * WHAT IS PROVED, case by case, on the lanes of the pipeline drawn in areas at 1440 by 1000 in light, with real mouse
 * and key presses:
 *   1. select the card, press the tick, the note shows; select another card, then select this card again with no press
 *      on the tick: the note is not shown;
 *   2. press the tick, the note shows; press the tick again: the note is hidden;
 *   3. press the tick, then Escape: the note is hidden; select the card again: the note is still hidden.
 * "Shown" is read from the note's own box (getBoundingClientRect with width and height above 0, and getComputedStyle
 * not display none or visibility hidden), not only from an attribute. The made-up office is
 * tests/a-made-up-office-drawn-in-lanes.ts. Its modules have no parts written, so their Detail tick cannot be turned
 * on; the reader module is the card these cases use.
 *
 * RED UNTIL THE CODE: at 34eead9a2 cases 1, 2 and 3 are red: 1 and 2 because the note stays shown, and 3 because it
 * shows again when the card is selected once more.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { pipelinePath } from '../src/web/components/router.tsx'
import { liveApp, type LiveApp } from './helpers.ts'
import { DRAWING, PROJECT, aPlaceOnTheCard, buildTheMadeUpOffice, openThePage, prepareThePage, theDrawingIsDrawn, writerFor, type MadeUpOffice } from './a-made-up-office-drawn-in-lanes.ts'

let app: LiveApp
let office: MadeUpOffice
beforeAll(async () => {
  app = await liveApp({ name: 'lanes-detail-note', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  office = await buildTheMadeUpOffice(writerFor(app, PROJECT.id))
  await prepareThePage(app, PROJECT.id)
}, 240_000)
afterAll(async () => { await app?.stop() }, 120_000)

const cardOf = (recordId: string) => `${DRAWING} .e-card[data-id="${recordId}"]`
async function open() {
  await openThePage(app, pipelinePath(office.id.drawn!))
  await theDrawingIsDrawn(app.page)
}
/** Whether the card's detail note is shown, read from the note's own box and its computed style. */
async function noteShown(recordId: string): Promise<boolean> {
  return app.page.evaluate(({ selector, id }) => {
    const note = document.querySelector(`${selector} .e-card[data-id="${CSS.escape(id)}"] .e-detail-reason`)
    if (note === null) return false
    const style = getComputedStyle(note)
    const box = note.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
  }, { selector: DRAWING, id: recordId })
}
/** Selects a card with a real mouse press on a place that is the card and not its title. */
async function selectCard(recordId: string) {
  const place = await aPlaceOnTheCard(app.page, recordId)
  await app.page.mouse.click(place.x, place.y)
  await expect.poll(() => app.page.locator(DRAWING).getAttribute('data-selected')).toBe(recordId)
}
/** Presses the card's Detail tick with a real mouse press; the tick is shown only while its card is selected. */
async function pressTheTick(recordId: string) {
  const tick = app.page.locator(`${cardOf(recordId)} .e-detail`)
  await expect.poll(() => tick.isVisible()).toBe(true)
  const box = await tick.boundingBox()
  expect(box, `the Detail tick of ${recordId} has a box`).not.toBeNull()
  await app.page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

it('the note does not come back when another card is selected and this one is selected again', async () => {
  await open()
  await selectCard(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note is hidden before any press on the tick').toBe(false)
  await pressTheTick(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note shows after a press on the tick').toBe(true)
  await selectCard(office.id.next!)
  expect(await noteShown(office.id.reader!), 'the note is hidden while another card is selected').toBe(false)
  await selectCard(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note is not shown again when its card is selected again with no press on the tick').toBe(false)
}, 180_000)
it('a second press on the tick hides the note', async () => {
  await open()
  await selectCard(office.id.reader!)
  await pressTheTick(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note shows after a press on the tick').toBe(true)
  await pressTheTick(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note is hidden after a second press on the tick').toBe(false)
}, 180_000)
it('Escape hides the note, and it stays hidden when the card is selected again', async () => {
  await open()
  await selectCard(office.id.reader!)
  await pressTheTick(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note shows after a press on the tick').toBe(true)
  await app.page.keyboard.press('Escape')
  await expect.poll(() => app.page.locator(DRAWING).getAttribute('data-selected')).toBeNull()
  expect(await noteShown(office.id.reader!), 'the note is hidden after Escape').toBe(false)
  await selectCard(office.id.reader!)
  expect(await noteShown(office.id.reader!), 'the note is still hidden after the card is selected again').toBe(false)
}, 180_000)
