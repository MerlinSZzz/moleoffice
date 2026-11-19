// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FRAME EVERY PAGE SHARES ASKS ONLY WHAT THE PAGE DRAWS, AND ASKS THE REST WHEN IT IS DRAWN. Wave 13x round 13.
 *
 * Round 12 measured every sidebar page waiting on the frame's 22 requests. Three of them drew nothing on most pages:
 *   - GET /api/office/pairing, which only the pairing page draws, and which only an arrival at no address acts on (it
 *     moves an unpaired machine to that page). It is now asked on those two only.
 *   - GET /api/messages/pictures, the limits on a picture in a message, which only the message box draws. It is now asked
 *     when the box's picture row is drawn.
 *   - GET /api/messages/circle, which the offers of a lead (src/web/components/Leading.tsx) asked for who is reading.
 *     With the chat panel open nothing else asks it, and the panel's own contact list says the same `me`. It is now
 *     asked only when the reader's pool holds a message to pick offers from, and not when the panel has said already.
 *
 * WHAT THIS FILE PROVES, in a real browser against an office of its own, counted at the wire:
 *   1. A page at an address asks neither the pairing nor the picture limits. An arrival at no address asks the pairing.
 *   2. With the chat panel open and no offer waiting, the page asks GET /api/messages/circle not at all, and the panel
 *      draws its contacts.
 *   3. An offer that waits is still drawn, with the panel open and with it closed.
 *   4. Opening a conversation draws the message box, and the box asks the picture limits.
 *
 * RED AT 9a0932db9 (the tip before this change): 1, 2, and 4 (the limits were asked before the box was drawn). CONTROL: green. MUTATIONS, each run and each red:
 *   1. App.tsx asks the pairing on every page (`pairingAsked` always true). Red in 1.
 *   2. `usePictureToSend` asks the limits at mount (`wanted` starts true). Red in 1 and 4.
 *   3. Leading's mount reads the circle beside the pool, as it did. Red in 2.
 *   4. Leading's effect returns before it sets `me`. Red in 3.
 *   5. `PictureToSendRow` does not call `askTheLimits`. Red in 4.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
/** Every request the page made, by path and query, in the order it made them. */
const asked: string[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

/** The chat panel's own key for whether the corner panel was open (src/web/components/Chat.tsx `OPEN_KEY`). */
const THE_PANEL_WAS_OPEN = 'mole-office.chat.open'

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** How many requests since `from` went to this path, whatever their query. */
function howMany(path: string, from = 0): number {
  return asked.slice(from).filter((one) => one.split('?')[0] === path).length
}

/** Load `address` afresh with the corner panel open or closed, and wait until the offers have read their pool. */
async function load(address: string, panelOpen: boolean): Promise<number> {
  await app.page.goto(`${app.site}/#/records`)
  await app.page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [THE_PANEL_WAS_OPEN, panelOpen ? 'yes' : 'no'])
  await app.page.goto('about:blank')
  const from = asked.length
  await app.page.goto(`${app.site}/${address}`)
  await waitForThePage(app.page, 60_000)
  await expect.poll(() => asked.slice(from).filter((one) => {
    const url = new URL(one, app.site)
    return url.pathname === '/api/messages' && url.searchParams.get('only') === 'waiting-for-me' &&
      url.searchParams.get('leads') === '1' && url.searchParams.get('full') === '1'
  }).length, { timeout: 30_000 }).toBeGreaterThan(0)
  if (panelOpen) await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-contact').length > 0, undefined, { timeout: 30_000 })
  // THE FRAME'S READS ARE ALL ASKED BY NOW: the pool and the contacts are among its last. A moment more, so a read
  // asked after them is counted too.
  await app.page.waitForTimeout(1_500)
  return from
}

beforeAll(async () => {
  app = await liveApp({ name: 'frame-asks', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'frame-writer', data: { handle: 'frame-writer', runtime: 'claude-code', state: 'active' } })
  await file(asAgent('frame-writer'), { kind: 'message', title: 'A note', data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] } })
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push(`${url.pathname}${url.search}`)
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the frame every page shares', () => {
  it('asks neither the pairing nor the picture limits on a page at an address, and the pairing at no address', async () => {
    const from = await load('#/records', false)
    expect(howMany('/api/office/pairing', from), asked.slice(from).join('\n')).toBe(0)
    expect(howMany('/api/messages/pictures', from), asked.slice(from).join('\n')).toBe(0)
    const bare = await load('', false)
    expect(howMany('/api/office/pairing', bare), asked.slice(bare).join('\n')).toBeGreaterThan(0)
  }, 180_000)

  it('asks no circle with the panel open and no offer waiting, and the panel draws its contacts', async () => {
    const from = await load('#/records', true)
    // A PAGE OF IT, since round 20 of wave 13u.
    expect(howMany('/api/messages/contact-list', from), 'the control: the open panel read its list').toBeGreaterThan(0)
    expect(howMany('/api/messages/circle', from), asked.slice(from).join('\n')).toBe(0)
  }, 180_000)

  it('still draws an offer that waits, with the panel open and closed', async () => {
    const target = await file(AS_THE_OWNER, { kind: 'note', title: 'A page to be led to', data: { date: '2026-10-11', body: 'Made-up page.' } })
    await file(asAgent('frame-writer'), {
      kind: 'message',
      title: 'Come and look',
      data: { body: 'Come and look at this page.', to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: target, workspaceId: 'default' } } },
    })
    for (const panelOpen of [true, false]) {
      await load('#/records', panelOpen)
      await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
    }
  }, 240_000)

  it('asks the picture limits when a conversation draws the message box', async () => {
    const from = await load('#/records', true)
    expect(howMany('/api/messages/pictures', from)).toBe(0)
    await app.page.click('.px-chat-contact')
    await app.page.waitForSelector('.px-chat-attach-add', { timeout: 30_000 })
    await expect.poll(() => howMany('/api/messages/pictures', from), { timeout: 20_000 }).toBeGreaterThan(0)
  }, 180_000)
})
