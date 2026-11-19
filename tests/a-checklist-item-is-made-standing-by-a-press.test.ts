// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS MAKES A CHECKLIST ITEM STANDING, AND A PRESS MAKES IT ORDINARY AGAIN. Wave 13j round loop-6, backlog item 1.
 * Loop-5 built the standing item, with no done box, never marked done and never counted as open work, and
 * an item became standing only through the item door. This is the press for it on the checklist's own
 * page, inside an opened item.
 *
 * WHERE THE PRESS IS. Only on the reader's own checklists, as the door reads "yours": somebody else's checklists are
 * shown to be read. Only on an open item: the door refuses `standing` on an item that is done, in progress or waiting
 * on the owner, because a standing item stays open or replaced only (loop-5, the secretary's answer SzZNUTuPaUXs). A replaced
 * standing item is finished, so it has no press either.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine. Every checklist, agent and message here is made up, and nothing is asked in the owner's name of the
 * live office (chapter 8, rule 3).
 *
 * What is proved:
 *   1. On the reader's own checklist an opened open item has "Make it standing". Pressed, the door stores the item as
 *      standing, the item says it is a standing item, the counts leave it out, and the press then reads "Make it
 *      ordinary".
 *   2. "Make it ordinary", pressed, takes `standing` away: the item is open and ordinary, and counted again.
 *   3. An item that is done, in progress, waiting on the owner or replaced has neither press.
 *   4. Somebody else's checklist, opened on the page, has neither press.
 *   5. A press the door refuses shows why under the item, and nothing is written. Refused because the checklist changed
 *      after the page read it, the words are the code's, and the page reads the checklist again (round loop-8).
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { holdThePagesReadsOfAChecklist, liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  const aLetterNothingHolds = method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds) expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBe(409)
  else expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

const CAMERA = 'Calibrate the camera'
let bench = ''
let kiln = ''

async function theList(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/checklists/${id}`, undefined))['checklist'] as Record<string, any>
}

async function theItem(list: string, words: string): Promise<Record<string, any>> {
  return ((await theList(list))['items'] as Record<string, any>[]).find((one) => one['words'] === words)!
}

async function openThePage(page: Page, id: string): Promise<Locator> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const one = page.locator('.ck1')
  await one.locator('.ck1-counts').waitFor({ timeout: 30_000 })
  return one
}

/** One item of the opened checklist, opened, with its finished items unfolded so every row is drawn. */
async function openedItem(one: Locator, words: string): Promise<Locator> {
  const fold = one.locator('.ckp-fold')
  if ((await fold.count()) > 0 && (await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
  const item = one.locator('.ckp-item', { hasText: words })
  if ((await item.locator('details.ckp-open').getAttribute('open')) === null) await item.locator('summary').click()
  await item.locator('.ckp-facts').first().waitFor({ timeout: 10_000 })
  return item
}

const MAKE = { name: t('w13j.checklistStanding.make'), exact: true }
const UNMAKE = { name: t('w13j.checklistStanding.unmake'), exact: true }

beforeAll(async () => {
  app = await liveApp({ name: 'a-checklist-item-made-standing', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const fitter = (await send('POST', '/api/agents/started', { handle: 'test-fitter', name: 'Test Fitter', role: 'worker' }))['agent'].id as string
  bench = (
    await send('POST', '/api/checklists', {
      title: 'Bench checklist',
      items: [{ words: CAMERA }, { words: 'Tighten the gripper bolts', state: 'in progress' }, { words: 'The old wiring notes', standing: true }],
    })
  )['checklist'].id as string
  await send('POST', `/api/checklists/${bench}/items`, { words: 'Choose a colour for the arm', state: 'waiting on the owner' }, AS('test-fitter'))
  const batteries = (await send('POST', `/api/checklists/${bench}/items`, { words: 'Charge the batteries' }))['item'].id as string
  await send('PATCH', `/api/checklists/${bench}/items/${batteries}`, { state: 'done' })
  const later = (
    await send('POST', '/api/records', { kind: 'message', title: 'The wiring notes are in the manual now', data: { body: 'The wiring notes are in the manual now.', to: [{ kind: 'agent', id: fitter }] } })
  )['record'].id as string
  const notes = (await theItem(bench, 'The old wiring notes'))['id'] as string
  await send('PATCH', `/api/checklists/${bench}/items/${notes}`, { state: 'superseded', supersededBy: later })
  kiln = (await send('POST', '/api/checklists', { title: "Test Fitter's list", items: [{ words: 'Write the firing log' }] }, AS('test-fitter')))['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('a press makes a checklist item standing, and a press makes it ordinary again', () => {
  it('1. on the reader\'s own checklist, "Make it standing" makes an open item standing, and the counts leave it out', async () => {
    const page = app.page
    const one = await openThePage(page, bench)
    expect(await one.locator('.ck1-counts').innerText()).toBe(t('checklists.counts', { open: 3, waiting: 1 }))
    const camera = await openedItem(one, CAMERA)
    expect(await camera.getByRole('button', UNMAKE).count(), 'an ordinary item is not offered "Make it ordinary"').toBe(0)
    await camera.getByRole('button', MAKE).click()
    await expect.poll(async () => (await theItem(bench, CAMERA))['standing'], { timeout: 10_000 }).toBe(true)
    expect((await theItem(bench, CAMERA))['state'], 'it stays open').toBe('open')
    await expect.poll(() => one.locator('.ck1-counts').innerText(), { timeout: 10_000 }).toBe(t('checklists.counts', { open: 2, waiting: 1 }))
    const after = await openedItem(one, CAMERA)
    await expect.poll(() => after.innerText(), { timeout: 10_000 }).toContain(t('w13j.checklistStanding.fact'))
    expect(await after.getByRole('button', UNMAKE).count()).toBe(1)
    expect(await after.getByRole('button', MAKE).count()).toBe(0)
  }, 120_000)

  it('2. "Make it ordinary" takes standing away, and the item is counted again', async () => {
    const page = app.page
    const one = await openThePage(page, bench)
    const camera = await openedItem(one, CAMERA)
    await camera.getByRole('button', UNMAKE).click()
    await expect.poll(async () => Object.hasOwn(await theItem(bench, CAMERA), 'standing'), { timeout: 10_000 }).toBe(false)
    expect((await theItem(bench, CAMERA))['state']).toBe('open')
    await expect.poll(() => one.locator('.ck1-counts').innerText(), { timeout: 10_000 }).toBe(t('checklists.counts', { open: 3, waiting: 1 }))
    const after = await openedItem(one, CAMERA)
    expect(await after.getByRole('button', MAKE).count()).toBe(1)
  }, 120_000)

  it('3. an item that is done, in progress, waiting on the owner or replaced has neither press', async () => {
    const page = app.page
    const one = await openThePage(page, bench)
    for (const words of ['Tighten the gripper bolts', 'Choose a colour for the arm', 'Charge the batteries', 'The old wiring notes']) {
      const item = await openedItem(one, words)
      expect(await item.getByRole('button', MAKE).count(), `${words}: no "Make it standing"`).toBe(0)
      expect(await item.getByRole('button', UNMAKE).count(), `${words}: no "Make it ordinary"`).toBe(0)
    }
  }, 120_000)

  it("4. somebody else's checklist, opened on the page, has neither press", async () => {
    const page = app.page
    const one = await openThePage(page, kiln)
    const item = await openedItem(one, 'Write the firing log')
    expect(await item.getByRole('button', MAKE).count()).toBe(0)
    expect(await item.getByRole('button', UNMAKE).count()).toBe(0)
  }, 120_000)

  it('5. a press refused because the checklist changed says so in the page\'s words, the page reads it again, and nothing is written', async () => {
    const page = app.page
    const one = await openThePage(page, bench)
    const camera = await openedItem(one, CAMERA)
    // THE TEST HOLDS THE PAGE'S READ OF THE CHECKLIST from before the agent's write until the door has answered the
    // press, so the press is the one the page offered before it read the change, and the door refuses it as changed.
    const id = (await theItem(bench, CAMERA))['id'] as string
    const held = await holdThePagesReadsOfAChecklist(page, bench)
    await send('PATCH', `/api/checklists/${bench}/items/${id}`, { state: 'in progress' }, AS('test-fitter'))
    const before = (await theList(bench))['version'] as string
    const answered = page.waitForResponse((reply) => reply.url().includes(`/api/checklists/${bench}/items/${id}`) && reply.request().method() === 'PATCH')
    await camera.getByRole('button', MAKE).click()
    const reply = await answered
    await held.release()
    expect(reply.status(), 'the door refuses it').toBe(409)
    expect(((await reply.json()) as Record<string, unknown>)['code']).toBe('checklistChangedSinceRead')
    // READ AGAIN, THE ITEM IS IN PROGRESS AND HAS NO PRESS, so the words do not ask for another press.
    await expect
      .poll(() => camera.locator('.ck1-refusal').innerText(), { timeout: 10_000 })
      .toBe(t('w13j.checklistPress.readAgain', { refusal: t('server.checklistChangedSinceRead') }))
    expect(await camera.getByRole('button', MAKE).count()).toBe(0)
    expect((await theList(bench))['version'], 'nothing was written').toBe(before)
    expect(Object.hasOwn(await theItem(bench, CAMERA), 'standing')).toBe(false)
  }, 120_000)
})
