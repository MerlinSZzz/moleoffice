// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HIS CARD HOLDS HIS BROWSERS AND MACHINES, IN A REAL BROWSER. Design C of early idea B9, the page half.
 *
 * his-card-holds-his-browsers-and-machines.test.ts holds the doors and the drawing. This file holds what
 * only a page in a browser shows, against a real stack whose made-up browsers came in through the doors:
 *
 *   1. THE PART'S PLACE: on his own card, after his head and before the card's other parts, which keep
 *      their order. It is not drawn on an agent's card.
 *   2. A PRESS ON A ROW calls the door it called before: Revoke key takes the key back at once and Undo
 *      gives it back, on the row of that browser.
 *   3. THE OLD ADDRESSES: a browser's credential page opens his card at that browser's row; an agent's
 *      credential page is as it was.
 *   4. THE EMBASSY draws no browser row and no browser ask, and his one row says how many he has and
 *      how many wait, with the way to his card.
 *   5. THE WORLDS PAGE keeps its panel for the machines, as a count and the way to his card, with no
 *      press of its own.
 *
 * Every browser, agent and machine here is made up by this file.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The headers of an agent, under the handle its registration answered. */
function asTheAgent(handle: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

const PAIRED = 'Made-up kitchen tablet'
const WAITING = 'Made-up garden phone'
const AGENT = 'Made-up heron visitor'
const made = { paired: '', waiting: '', agent: '' }

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function theWholeEmbassy(): Promise<WhatTheEmbassySays> {
  const reply = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_PERSON })
  expect(reply.status).toBe(200)
  return (await reply.json()) as WhatTheEmbassySays
}

async function open(path: string): Promise<void> {
  await app.page.goto(`${app.site}/#${path}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'his-card-browsers', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE AGENT THAT ASKS IS REGISTERED FIRST. This server is reached on a socket, and there a write under
  // an agent id that no registry row answers to is refused with 403. The person starts it, and it asks
  // under the handle the registration answers.
  const started = await post('/api/agents/started', { handle: 'a-made-up-asker', name: 'A made-up asker', role: 'worker' })
  const asker = asTheAgent(String(started['whatToGiveIt'].handle))
  // ONE BROWSER PAIRED, ONE WAITING, AND ONE AGENT ASKING, through the ask door and his confirm.
  made.paired = String((await post('/api/office/visitors', { device: PAIRED }, asker))['credential'].id)
  await post(`/api/office/visitors/${made.paired}/confirm`, {})
  made.waiting = String((await post('/api/office/visitors', { device: WAITING }, asker))['credential'].id)
  made.agent = String((await post('/api/office/visitors', {
    handle: 'made-up-heron', name: AGENT, role: 'worker', conversationPath: '/tmp/made-up-heron.jsonl',
  }, asker))['credential'].id)
  // AND ONE MACHINE THIS OFFICE TRUSTS.
  await post('/api/office/trusted-machines', { address: 'made-up-box.test', note: 'made up' })
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', 'default')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('his card', () => {
  it('draws the part after his head and before the card\'s other parts', async () => {
    const { whoPath } = await import('../src/web/components/router.tsx')
    await open(whoPath('person', THE_PERSON))
    const part = app.page.locator('[data-target$="profile.browsers"]')
    await part.waitFor({ state: 'visible', timeout: 30_000 })
    const order = await app.page.evaluate(() => {
      const named = (selector: string): Element | null => document.querySelector(selector)
      const head = named('.prof-head')
      const part = named('[data-target$="profile.browsers"]')
      const rest = named('.prof-sides')
      if (head === null || part === null || rest === null) return 'one of the three is not drawn'
      const before = (a: Element, b: Element): boolean =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      return before(head, part) && before(part, rest) ? 'head, part, rest' : 'out of order'
    })
    expect(order).toBe('head, part, rest')
    expect(await part.locator(`[data-browser="${made.paired}"]`).count(), 'the paired browser').toBe(1)
    expect(await part.locator('.emb-asking-card', { hasText: WAITING }).count(), 'the waiting one').toBe(1)
    expect(await part.locator('.emb-asking-card', { hasText: AGENT }).count(), 'no agent').toBe(0)
    expect(await part.getByText('made-up-box.test').count(), 'the machine').toBeGreaterThan(0)
  }, 120_000)

  it('is not drawn on an agent\'s card', async () => {
    const { whoPath } = await import('../src/web/components/router.tsx')
    const somebody = (await theWholeEmbassy()).rows.find((one) => one.who.kind === 'agent' && one.registered && !one.device)
    expect(somebody, 'an agent registered here to open').toBeDefined()
    await open(whoPath('agent', String(somebody?.who.id)))
    await app.page.locator('.prof-head').first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await app.page.locator('[data-target$="profile.browsers"]').count()).toBe(0)
  }, 120_000)

  it('takes a browser\'s key back on its row at once, and gives it back on Undo', async () => {
    const { hisBrowserPath } = await import('../src/web/components/router.tsx')
    const keyOf = async () =>
      (await theWholeEmbassy()).rows.find((one) => one.credential === made.paired)?.heldKeys[0]?.id ?? null
    const key = await keyOf()
    expect(key).toBeTruthy()
    await open(hisBrowserPath(made.paired))
    const row = app.page.locator(`[data-browser="${made.paired}"]`)
    const press = row.getByRole('button', { name: en['embassyKeys.revokeOwn'], exact: true })
    await press.waitFor({ state: 'visible', timeout: 30_000 })
    await press.click()
    const bar = app.page.locator('.tiered-undo')
    await bar.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await keyOf(), 'the key is taken back at once').toBeNull()
    await bar.getByRole('button', { name: /^Undo/ }).click()
    await press.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await keyOf(), 'and Undo gives the same key back').toBe(key)
  }, 120_000)
})

describe('the old addresses', () => {
  it('opens his card at the row of a browser from its credential page', async () => {
    const { hisBrowserPath, visitorPath } = await import('../src/web/components/router.tsx')
    await open(visitorPath(made.paired))
    const row = app.page.locator(`[data-browser="${made.paired}"]`)
    await row.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await row.getAttribute('data-picked'), 'the row the old address named').toBe('yes')
    expect(new URL(app.page.url()).hash, 'and the address is his card\'s').toBe(`#${hisBrowserPath(made.paired)}`)
    expect(await app.page.locator('.cred').count(), 'not the credential page').toBe(0)
  }, 120_000)

  it('leaves an agent\'s credential page as it was', async () => {
    const { visitorPath } = await import('../src/web/components/router.tsx')
    await open(visitorPath(made.agent))
    await app.page.locator('.cred').first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await app.page.locator('[data-target$="profile.browsers"]').count()).toBe(0)
  }, 120_000)
})

describe('the Embassy and the Worlds page', () => {
  it('draws no browser on the Embassy, and his row says how many with the way to his card', async () => {
    const { hrefOf, whoPath } = await import('../src/web/components/router.tsx')
    const { EMBASSY_WORDS } = await import('../src/web/pages/EmbassyPage.tsx')
    await open('/embassy')
    const asking = app.page.locator('[data-target$="embassy.asking"]')
    await asking.locator('.emb-asking-card', { hasText: AGENT }).waitFor({ state: 'visible', timeout: 30_000 })
    expect(await asking.locator('.emb-asking-card', { hasText: WAITING }).count(), 'no browser asks there').toBe(0)
    expect(await app.page.locator('.emb-row[data-device="yes"]').count(), 'no browser row').toBe(0)
    expect(await app.page.getByText(PAIRED).count(), 'and no browser by its name').toBe(0)
    const toHisCard = app.page.locator(`a[href="${hrefOf(whoPath('person', THE_PERSON))}"]`)
    const his = app.page.locator('.emb-row').filter({ has: toHisCard })
    await his.first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await his.count(), 'his one row').toBe(1)
    expect(await his.innerText()).toContain(EMBASSY_WORDS.hisBrowsers(1))
    expect(await his.innerText()).toContain(EMBASSY_WORDS.hisBrowsersWaiting(1))
  }, 120_000)

  it('keeps the machines panel on the Worlds page as a count and the way to his card, with no press', async () => {
    const { hrefOf, whoPath } = await import('../src/web/components/router.tsx')
    await open('/worlds')
    const panel = app.page.locator('[data-target$="worlds.trusted"]')
    await panel.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await panel.locator(`a[href="${hrefOf(whoPath('person', THE_PERSON))}"]`).count(), 'the way to his card').toBe(1)
    expect(await panel.locator('button').count(), 'no press of its own').toBe(0)
    expect(await panel.locator('input').count(), 'and no field').toBe(0)
  }, 120_000)
})
