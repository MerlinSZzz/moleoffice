// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE EVENT STREAM FOR ALL OF A PERSON'S TABS, measured with eight tabs in one browser.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A browser keeps at most six HTTP/1.1 connections to one address, and every Mole Office tab held one
 * for its event stream. Measured in round 1 of wave 13j with eight tabs in one browser: the sixth tab
 * never finished loading. One stream is shared by all of a person's tabs; src/web/lib/onestream.ts is
 * how.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 *   1. Eight tabs of the office in one browser all load, the server holds one stream for the browser,
 *      and an event reaches every tab within a few seconds. The key window is closed first, and the
 *      one stream proves itself with the paired browser's key, as the page's other requests do.
 *   2. When the tab holding the stream closes, another takes it over, and an event written in between
 *      still reaches every tab that is left (the new holder picks up with the last event id).
 *   3. A hidden tab keeps what it is handed and hands it to its panels when it is shown again.
 *   4. A browser without BroadcastChannel holds one stream per tab, as before, and says so.
 *
 * ON MAIN, case 1 is red: from the sixth tab on the page never says it has drawn, and the server holds
 * one stream per tab; the stream carries no cookie, so no open page is proved by a key.
 *
 * THE PHOTOGRAPHS of the eight tabs go to ONE_STREAM_SHOTS when it is set.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** Only subscription messages are held; locks, stream reads and event broadcasts stay native. */
interface HandoverGate {
  armed: boolean
  ticks: number[]
  held: (() => void)[]
  release: () => void
}

const gateIn = (page: Page) => page.evaluate(() => {
  const gate = (window as unknown as { streamHandoverGate: HandoverGate }).streamHandoverGate
  return { ticks: gate.ticks, held: gate.held.length }
})

const TABS = 8

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let agentId = ''
const tabs: Page[] = []

/** A request made with this browser's cookies, which is how the paired browser's key is sent. */
async function asThisBrowser(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await app.context.request.fetch(`${app.api}${path}`, {
    method,
    headers: OWNER,
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  })
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

async function channel(): Promise<{ pagesOpen: number; pagesProvedByAKey: number; lastId: number }> {
  return (await asThisBrowser('GET', '/api/events/state')).json as { pagesOpen: number; pagesProvedByAKey: number; lastId: number }
}

async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean, ms: number): Promise<T> {
  const end = Date.now() + ms
  let value = await read()
  while (!ok(value) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 100))
    value = await read()
  }
  return value
}

/** Write one message as the person, and return the id of the event that announced it. */
async function aMessage(words: string): Promise<number> {
  const made = await asThisBrowser('POST', '/api/records', { kind: 'message', title: words.slice(0, 30), data: { body: words, to: [{ kind: 'agent', id: agentId }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(made.status, JSON.stringify(made.json)).toBe(409)
  return (await channel()).lastId
}

/** The id of the last event each tab's panels were handed. */
async function lastHanded(page: Page): Promise<number> {
  const said = await page.evaluate(() => document.documentElement.dataset['moleOfficeLastEvent'] ?? '0')
  return Number(said.split(' ')[0])
}

async function howItListens(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dataset['moleOfficeStream'] ?? '')
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-stream', viewport: { width: 1200, height: 800 } })
  await app.context.addInitScript(() => {
    const gate: HandoverGate = {
      armed: false,
      ticks: [],
      held: [],
      release: () => {
        gate.armed = false
        for (const send of gate.held.splice(0)) send()
      },
    }
    ;(window as unknown as { streamHandoverGate: HandoverGate }).streamHandoverGate = gate
    const NativeChannel = window.BroadcastChannel
    window.BroadcastChannel = class extends NativeChannel {
      constructor(name: string) {
        super(name)
        this.addEventListener('message', (message: MessageEvent<{ type?: string; id?: number }>) => {
          if (message.data.type === 'tick' && message.data.id !== undefined) gate.ticks.push(message.data.id)
        })
      }

      override postMessage(message: { type?: string }): void {
        if (gate.armed && (message.type === 'hello' || message.type === 'wants')) {
          gate.held.push(() => super.postMessage(message))
          return
        }
        super.postMessage(message)
      }
    }
  })
  // PAIR THIS BROWSER: the reply sets the person's key as a cookie in this browser's own jar.
  const paired = await asThisBrowser('POST', '/api/office/pairing')
  expect(paired.status, JSON.stringify(paired.json)).toBe(200)
  const agent = await asThisBrowser('POST', '/api/records', { kind: 'agent', title: 'Tab reader', data: { handle: 'tab-reader', runtime: 'claude-code', state: 'active' } })
  expect(agent.status, JSON.stringify(agent.json)).toBe(201)
  const registry = (await asThisBrowser('GET', '/api/participants')).json as { agents: { id: string; handle: string }[] }
  agentId = registry.agents.find((one) => one.handle === 'tab-reader')?.id ?? ''
  // AND THE KEY WINDOW IS CLOSED, so from here a request is the person only with the key.
  const closed = await asThisBrowser('POST', '/api/office/key-window/close')
  expect(closed.status, JSON.stringify(closed.json)).toBe(200)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('one stream for every tab', () => {
  it('loads eight tabs, holds one stream proved by the browser’s key, and hands an event to every tab', async () => {
    tabs.push(app.page)
    for (let i = 1; i < TABS; i += 1) tabs.push(await app.context.newPage())
    for (const [i, page] of tabs.entries()) {
      await page.goto(`${app.site}/#/`)
      await waitForThePage(page, 30_000).catch((err: unknown) => {
        throw new Error(`tab ${String(i + 1)} of ${String(TABS)} never finished drawing: ${String(err)}`)
      })
    }
    const held = await until(channel, (one) => one.pagesOpen === 1 && one.pagesProvedByAKey === 1, 15_000)
    expect(held.pagesOpen, 'the server does not hold exactly one stream for this browser').toBe(1)
    expect(held.pagesProvedByAKey, 'the stream did not carry the browser’s key').toBe(1)
    const how = await Promise.all(tabs.map(howItListens))
    expect(how.filter((one) => one === 'holds the stream for every tab').length, how.join(' / ')).toBe(1)
    expect(how.filter((one) => one === 'shares another tab’s stream').length, how.join(' / ')).toBe(TABS - 1)

    const id = await aMessage('One message every tab has to hear.')
    for (const [i, page] of tabs.entries()) {
      const got = await until(() => lastHanded(page), (one) => one >= id, 5_000)
      expect(got, `tab ${String(i + 1)} was not handed the event within five seconds`).toBeGreaterThanOrEqual(id)
    }

    const shots = process.env['ONE_STREAM_SHOTS']
    if (shots !== undefined && shots !== '') {
      mkdirSync(shots, { recursive: true })
      for (const [i, page] of tabs.entries()) await page.screenshot({ path: join(shots, `tab-${String(i + 1)}-of-${String(TABS)}.png`) })
    }
  }, 300_000)

  it('hands the stream to another tab when the holder closes, and loses nothing written in between', async () => {
    const how = await Promise.all(tabs.map(howItListens))
    const holder = how.indexOf('holds the stream for every tab')
    expect(holder).toBeGreaterThanOrEqual(0)
    // FORCE THE REPLAY BEFORE THE HELLOS. The replacement request waits until the message exists;
    // followers' subscription messages wait until every follower has heard the replay's tick.
    let letTheRequestThrough!: () => void
    const requestMayGo = new Promise<void>((resolve) => { letTheRequestThrough = resolve })
    let theRequestArrived!: () => void
    const replacementAsked = new Promise<void>((resolve) => { theRequestArrived = resolve })
    for (const page of tabs) {
      await page.evaluate(() => {
        ;(window as unknown as { streamHandoverGate: HandoverGate }).streamHandoverGate.armed = true
      })
      await page.route((url) => url.pathname === '/api/events', async (route) => {
        theRequestArrived()
        await requestMayGo
        await route.continue()
      })
    }
    let id = 0
    try {
      const [closing] = tabs.splice(holder, 1)
      await closing?.close()
      await replacementAsked
      id = await aMessage('Written while the stream changes hands.')
      letTheRequestThrough()
      for (const page of tabs) {
        const isHolder = (await howItListens(page)) === 'holds the stream for every tab'
        if (isHolder) {
          expect(await until(() => lastHanded(page), (one) => one >= id, 10_000)).toBeGreaterThanOrEqual(id)
        } else {
          const got = await until(() => gateIn(page), (one) => one.ticks.includes(id) && one.held > 0, 10_000)
          expect(got.ticks, 'the replacement replay must advance the follower before its hello is released').toContain(id)
          expect(got.held, 'the follower must still be waiting to restore its subscription').toBeGreaterThan(0)
        }
      }
    } finally {
      letTheRequestThrough()
      for (const page of tabs) await page.evaluate(() => {
        ;(window as unknown as { streamHandoverGate: HandoverGate }).streamHandoverGate.release()
      })
    }
    for (const [i, page] of tabs.entries()) {
      const got = await until(() => lastHanded(page), (one) => one >= id, 10_000)
      expect(got, `tab ${String(i + 1)} lost the event written while the stream changed hands`).toBeGreaterThanOrEqual(id)
    }
    const after = await Promise.all(tabs.map(howItListens))
    expect(after.filter((one) => one === 'holds the stream for every tab').length, after.join(' / ')).toBe(1)
    const held = await until(channel, (one) => one.pagesOpen === 1, 15_000)
    expect(held.pagesOpen).toBe(1)
  }, 120_000)

  it('keeps what a hidden tab is handed and hands it over when the tab is shown', async () => {
    const page = tabs[tabs.length - 1] as Page
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((to) => {
        Object.defineProperty(document, 'visibilityState', { value: to, configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      }, state)
    const before = await lastHanded(page)
    await setVisibility('hidden')
    const id = await aMessage('Written while one tab is hidden.')
    const other = tabs[0] as Page
    await until(() => lastHanded(other), (one) => one >= id, 5_000)
    expect(await lastHanded(page), 'a hidden tab handed an event to its panels').toBe(before)
    await setVisibility('visible')
    expect(await until(() => lastHanded(page), (one) => one >= id, 5_000), 'the tab was shown and the kept event was not handed over').toBeGreaterThanOrEqual(id)
  }, 120_000)

  it('holds one stream per tab in a browser without BroadcastChannel, and says so', async () => {
    // THE PAIRED BROWSER'S COOKIES, because the key window is closed: a browser without them is shown the pairing page, which holds no stream.
    const context = await app.browser.newContext({ storageState: await app.context.storageState() })
    try {
      await context.addInitScript(() => {
        Reflect.deleteProperty(window, 'BroadcastChannel')
      })
      const page = await context.newPage()
      const warned: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'warning') warned.push(message.text())
      })
      await page.goto(`${app.site}/#/`)
      await waitForThePage(page, 30_000)
      expect(await until(() => howItListens(page), (one) => one !== '', 10_000)).toBe('this tab alone')
      expect(warned.some((one) => one.includes('each tab holds its own event stream')), warned.join('\n')).toBe(true)
    } finally {
      await context.close()
    }
  }, 120_000)
})
