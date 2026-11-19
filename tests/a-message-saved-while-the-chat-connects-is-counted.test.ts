// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE SAVED WHILE THE PAGE IS STILL CONNECTING IS COUNTED WITHOUT A RELOAD. Problem k8n8yOWOzHI1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The chat reads its lists when it is mounted, and the page opens its live connection beside that;
 * neither waited for the other. A message saved after the lists were read and before the server was
 * holding the connection was in no list and was announced to no connection, so the number on the
 * circle stayed one short until something read the lists again.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * In a real browser against an office of its own, the page's first stream request is held back by the
 * test. While it is held, after the circle has been read, an agent sends the person a message. Then the
 * stream is let through. The number on the circle must come to equal the contact list's own number,
 * which counts that message, without a reload.
 *
 * RED ON MAIN: the circle stays one short. CONTROL: green with the change. MUTATIONS, each red with the
 * circle one short: in src/web/lib/onestream.ts `iHoldAnOpenStream`, never pass the answer on to the
 * panels; in src/server/lib/events.ts `reachedAPageBeforeItWasCounted`, count nothing. The other half,
 * that a load with nothing in the gap reads no list twice, is held by
 * tests/the-home-page-asks-once-and-light.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_WRITER = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'gap-writer' }

async function file(headers: Record<string, string>, body: unknown): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
}

async function sayToThem(words: string): Promise<void> {
  await file(AS_THE_WRITER, { kind: 'message', title: words.slice(0, 40), data: { body: words, to: [{ kind: 'person', id: THE_PERSON }] } })
}

async function theNumberOnTheCircle(): Promise<number> {
  return Number((await app.page.textContent('.px-chat-circle .px-chat-unread').catch(() => null)) ?? '0')
}

async function theContactListsNumber(): Promise<number> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  const held = (await got.json()) as { unread: { messages: number; groups: number } }
  return held.unread.messages + held.unread.groups
}

beforeAll(async () => {
  app = await liveApp({ name: 'gap-counted', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'Gap Writer', data: { handle: 'gap-writer', runtime: 'claude-code', state: 'active' } })
  await sayToThem('The first reading is 3.1 V.')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the chat and its live connection', () => {
  it('counts a message saved after the lists were read and before the connection was listening', async () => {
    const saidInTheGap = { done: false }
    // THE CIRCLE'S FIRST READ, watched for from before the page loads.
    const circleRead = app.page.waitForResponse((res) => new URL(res.url()).pathname === '/api/messages/circle', { timeout: 60_000 })
    // THE FIRST STREAM REQUEST IS HELD until the circle has been read and the message has been saved.
    //
    // THE ROUTE STAYS FOR THE WHOLE TEST, AND IS NOT GIVEN `times: 1`. Problem hNZ3P6Z3r88e. With
    // `times: 1`, Playwright removes the route as it lets the held request go, and with no route left
    // it turns the browser's request interception off. A request the page sent in that moment was
    // paused by the browser and never let go: the page's own fetch had been called, Playwright never
    // reported the request, it never answered, and the page's ready mark never came. Measured on
    // 1 October 2026: 2 of 11 runs went red this way, each naming a different home-page request in
    // flight (/api/claims, /api/groups?shape=page, /api/records/<id>). So the interception stays on,
    // and every request after the first stream request passes straight on.
    let heldTheFirst = false
    await app.page.route(
      (url) => url.pathname === '/api/events',
      async (route) => {
        if (heldTheFirst) {
          await route.continue()
          return
        }
        heldTheFirst = true
        await circleRead
        await sayToThem('Saved while the page was connecting.')
        saidInTheGap.done = true
        await route.continue()
      },
    )
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page, 60_000)
    // THE CONTROL: the message really was saved in the gap, and the contact list counts it.
    const deadline = Date.now() + 30_000
    while (!saidInTheGap.done && Date.now() < deadline) await app.page.waitForTimeout(200)
    expect(saidInTheGap.done).toBe(true)
    const expected = await theContactListsNumber()
    expect(expected).toBe(2)
    // THE CIRCLE COMES TO COUNT IT, without a reload.
    await app.page
      .waitForFunction(
        (want: number) => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') === want,
        expected,
        { timeout: 20_000 },
      )
      .catch(() => undefined)
    expect(await theNumberOnTheCircle()).toBe(expected)
  }, 180_000)
})
