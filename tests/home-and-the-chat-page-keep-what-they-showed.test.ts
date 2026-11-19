// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GOING BETWEEN HOME AND THE CHAT PAGE SHOWS WHAT EACH PAGE SHOWED LAST, WITH NO LOADING STATE.
 *
 * Problem KyrGDY7xY6fG: going from Home to the chat page and back made Home, and the chat open on
 * its right, load again from nothing, every time. Returning to a page shows at once what it showed
 * last, then brings it up to date quietly, and the chat keeps what it read across the switch.
 *
 * WHAT THIS FILE DOES. In a test office with made-up agents and messages, it opens Home with the
 * corner chat open on a conversation, waits until everything has been read, sets the address to
 * #/chat, waits for the chat page, presses the sidebar's Home, and then sets the address to #/chat
 * once more. Design D's sidebar row opens the chat beside the page rather than leading to the chat
 * page, and no row leads to the page now, so the address is how a person reaches it. From the first
 * press on, it looks at every frame the browser draws, and notes every loading state
 * on the screen: the page's own loading rows, and the chat's "Reading …" lines. It also notes every
 * loading state put into the page, whether or not a frame was drawn while it was there. The test
 * fails if any loading state is drawn, or put into the page at all, on the way back to Home or on
 * the way back to the chat page.
 *
 * PUT IN, NOT ONLY DRAWN. A loading row that the page puts in and replaces before the next frame is
 * never drawn, and whether a frame falls between the two depends on the machine's timing. On the
 * way back to Home the day band put "Loading today, this week and your work…" into the page in 3 of
 * 3 runs on 21 October 2026, and no frame was drawn while it was there in any of the three. The
 * merge queue found this test red in 10 of 93 runs, and the red runs whose output was read named
 * that row. Looking only at the frames made this test red now and then, for a cause that is there
 * every time.
 *
 * THE WORLD IS ITS OWN. `liveApp` starts an API on a port of its own with a database of its own;
 * nothing here reaches the owner's server.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const AGENTS = ['Heron', 'Plover', 'Dunlin'].map((name) => ({ name: `${name} Agent`, handle: `${name.toLowerCase()}-agent` }))
const TALKING_TO = AGENTS[0]!
const LAST_LINE = 'The last line Heron wrote about the conveyor.'

/** The chat's own loading lines, in English, from the one word list the page draws them from. */
const THE_CHATS_LOADING_LINES = [
  t('chat.readingContacts'),
  t('chat.readingGroups'),
  t('chat.readingBetween'),
  t('chat.readingConversation'),
]

async function file(headers: Record<string, string>, body: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
  return ((await made.json()) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'home-chat-keep', viewport: { width: 1440, height: 1000 } })
  for (const agent of AGENTS) {
    await file(AS_THE_OWNER, {
      kind: 'agent',
      title: agent.name,
      data: { handle: agent.handle, runtime: 'claude-code', state: 'active' },
    })
    await file(
      { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle },
      {
        kind: 'message',
        title: `A note from ${agent.name}`,
        data: { body: agent === TALKING_TO ? LAST_LINE : `A note from ${agent.name}.`, to: [{ kind: 'person', id: THE_PERSON }] },
      },
    )
  }
  await file(AS_THE_OWNER, { kind: 'note', title: 'Conveyor belt tension readings' })

  // THE WATCHER, put on the window before the page's own code runs. Every frame it writes down the
  // address and each loading state on the screen, until it is asked for what it saw.
  await app.page.addInitScript((lines: string[]) => {
    const w = window as unknown as { __frames: { at: number; hash: string; loading: string[] }[] | null }
    w.__frames = null
    const look = (): void => {
      if (w.__frames !== null) {
        const loading: string[] = []
        for (const one of document.querySelectorAll('.px-loading')) loading.push(`page: ${one.textContent ?? ''}`)
        for (const one of document.querySelectorAll('.px-chat-empty')) {
          const words = one.textContent ?? ''
          if (lines.includes(words)) loading.push(`chat: ${words}`)
        }
        w.__frames.push({ at: performance.now(), hash: window.location.hash, loading })
      }
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)

    // THE SECOND WATCHER writes down every loading state put into the page, drawn or not, and the
    // time of every change it was told of, so that an empty list is a finding and not silence.
    const p = window as unknown as { __putIn: { at: number; hash: string; what: string }[] | null; __changes: number[] | null }
    p.__putIn = null
    p.__changes = null
    const loadingState = (one: Element): string | null => {
      if (one.matches('.px-loading')) return `page: ${one.textContent ?? ''}`
      const words = one.textContent ?? ''
      return lines.includes(words) ? `chat: ${words}` : null
    }
    const either = '.px-loading, .px-chat-empty'
    new MutationObserver((records) => {
      if (p.__putIn === null || p.__changes === null) return
      const at = performance.now()
      p.__changes.push(at)
      for (const one of records) {
        const found = new Set<Element>()
        for (const node of one.addedNodes) {
          if (!(node instanceof Element)) continue
          if (node.matches(either)) found.add(node)
          for (const inside of node.querySelectorAll(either)) found.add(inside)
        }
        // A change of the words inside one that was already there.
        const around = (one.target instanceof Element ? one.target : one.target.parentElement)?.closest(either)
        if (around) found.add(around)
        for (const state of found) {
          const what = loadingState(state)
          if (what !== null) p.__putIn.push({ at, hash: window.location.hash, what })
        }
      }
    }).observe(document, { childList: true, subtree: true, characterData: true })
  }, THE_CHATS_LOADING_LINES)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** Every loading state drawn since the watcher started, with the address it was drawn on. */
async function whatWasSeen(): Promise<{ at: number; hash: string; loading: string[] }[]> {
  return app.page.evaluate(() => (window as unknown as { __frames: { at: number; hash: string; loading: string[] }[] }).__frames)
}

/** Every loading state put into the page since the second watcher started, drawn or not, and every change it was told of. */
async function whatWasPutIn(): Promise<{ putIn: { at: number; hash: string; what: string }[]; changes: number[] }> {
  return app.page.evaluate(() => {
    const p = window as unknown as { __putIn: { at: number; hash: string; what: string }[]; __changes: number[] }
    return { putIn: p.__putIn, changes: p.__changes }
  })
}

describe('Home, the chat page, Home, the chat page', () => {
  it('draws no loading state on the way back to either page', async () => {
    const { page } = app
    // THE CORNER IS REMEMBERED OPEN BEFORE THE PAGE'S OWN CODE RUNS, and not written into a page
    // that is still starting. Problem -00P6LqHCex1: this case timed out about one run in three on
    // the press on Heron's contact, because there was no corner at all. It used to open Home, write
    // "yes" under mole-office.chat.open, and load the page again. But the chat panel reads that key
    // when it first draws and writes down what it read a moment later, from an effect; on a page
    // that had never stored anything it reads nothing and writes "no". When the test's "yes" landed
    // between that read and that write, the panel's "no" came after it and won, the second load read
    // "no", and the corner stayed a closed circle. Measured on 1 October 2026 with every read and
    // write of that key logged: on a red run the page read nothing at 191 ms, the test wrote "yes"
    // at 196 ms and the page wrote "no" at 212 ms; on a green run the page's "no" came before the
    // test's "yes". An init script runs before any of the page's code, so the panel reads "yes" at
    // its first drawing and writes "yes" back, and there is no gap for the test's word to fall into.
    await page.addInitScript(() => {
      localStorage.setItem('mole-office.chat.open', 'yes')
    })
    await page.goto(`${app.site}/#/`)
    await waitForThePage(page, 30_000)
    const corner = '.px-chat[data-where="corner"]'
    await page.click(`${corner} .px-chat-contact:has(.px-chat-name:text-is("${TALKING_TO.name}"))`)
    await page.waitForSelector(`${corner} .px-chat-words:has-text("${LAST_LINE}")`, { timeout: 30_000 })
    // EVERYTHING ON HOME HAS BEEN READ: no loading state is left anywhere.
    await page.waitForFunction(() => document.querySelectorAll('.px-loading').length === 0, undefined, { timeout: 30_000 })
    await page.waitForTimeout(1_000)

    await page.evaluate(() => {
      ;(window as unknown as { __frames: unknown[] }).__frames = []
      ;(window as unknown as { __putIn: unknown[] }).__putIn = []
      ;(window as unknown as { __changes: unknown[] }).__changes = []
    })
    // TO THE CHAT PAGE, by its address #/chat in the location bar, the way a person goes. Design D's
    // sidebar Chat row opens the split instead, and no row leads to the chat page, so the address is
    // the only way there. Setting the hash changes the page without a page load, so the watchers put
    // on the window keep watching.
    await page.evaluate(() => { window.location.hash = '#/chat' })
    const onThePage = '.px-chat[data-where="page"]'
    await page.waitForSelector(`${onThePage} .px-chat-words:has-text("${LAST_LINE}")`, { timeout: 30_000 })
    await page.waitForTimeout(1_500)
    const home = page.locator('.shell-side a.shell-link[href="#/"]')
    expect(await home.count(), 'the sidebar has no Home row to press').toBe(1)
    const backToHomeAt = await page.evaluate(() => performance.now())
    await home.click()
    await page.waitForSelector(`${corner} .px-chat-words:has-text("${LAST_LINE}")`, { timeout: 30_000 })
    await page.waitForTimeout(2_000)
    const backToTheChatAt = await page.evaluate(() => performance.now())
    // THE SECOND WAY TO THE CHAT PAGE IS THE SAME ADDRESS, because design D draws no row to it.
    await page.evaluate(() => { window.location.hash = '#/chat' })
    await page.waitForSelector(`${onThePage} .px-chat-words:has-text("${LAST_LINE}")`, { timeout: 30_000 })
    await page.waitForTimeout(2_000)

    const frames = await whatWasSeen()
    const loadingIn = (from: number, to: number): string[] => [
      ...new Set(frames.filter((one) => one.at >= from && one.at < to).flatMap((one) => one.loading.map((what) => `${one.hash} ${what}`))),
    ]
    const there = loadingIn(0, backToHomeAt)
    const backHome = loadingIn(backToHomeAt, backToTheChatAt)
    const backToTheChat = loadingIn(backToTheChatAt, Number.POSITIVE_INFINITY)
    const framesIn = (from: number, to: number): number => frames.filter((one) => one.at >= from && one.at < to).length
    console.log(`the first visit to the chat page (${String(framesIn(0, backToHomeAt))} frames): ${there.join(' | ') || 'no loading state'}`)
    console.log(`back to Home (${String(framesIn(backToHomeAt, backToTheChatAt))} frames): ${backHome.join(' | ') || 'no loading state'}`)
    console.log(`back to the chat page (${String(framesIn(backToTheChatAt, Number.POSITIVE_INFINITY))} frames): ${backToTheChat.join(' | ') || 'no loading state'}`)

    const { putIn, changes } = await whatWasPutIn()
    const putInDuring = (from: number, to: number): string[] => [
      ...new Set(putIn.filter((one) => one.at >= from && one.at < to).map((one) => `${one.hash} ${one.what}`)),
    ]
    const changesIn = (from: number, to: number): number => changes.filter((at) => at >= from && at < to).length
    const putInBackHome = putInDuring(backToHomeAt, backToTheChatAt)
    const putInBackToTheChat = putInDuring(backToTheChatAt, Number.POSITIVE_INFINITY)
    console.log(`put into the page on the way back to Home (${String(changesIn(backToHomeAt, backToTheChatAt))} changes): ${putInBackHome.join(' | ') || 'no loading state'}`)
    console.log(`put into the page on the way back to the chat page (${String(changesIn(backToTheChatAt, Number.POSITIVE_INFINITY))} changes): ${putInBackToTheChat.join(' | ') || 'no loading state'}`)

    // BOTH WATCHERS SAW SOMETHING on both ways back, so the empty lists below are a finding and not silence.
    expect(framesIn(backToHomeAt, backToTheChatAt)).toBeGreaterThan(10)
    expect(framesIn(backToTheChatAt, Number.POSITIVE_INFINITY)).toBeGreaterThan(10)
    expect(changesIn(backToHomeAt, backToTheChatAt), 'the page was not seen to change on the way back to Home').toBeGreaterThan(0)
    expect(changesIn(backToTheChatAt, Number.POSITIVE_INFINITY), 'the page was not seen to change on the way back to the chat page').toBeGreaterThan(0)
    expect(backHome, 'a loading state was drawn on the way back to Home').toEqual([])
    expect(backToTheChat, 'a loading state was drawn on the way back to the chat page').toEqual([])
    expect(putInBackHome, 'a loading state was put into the page on the way back to Home, drawn or not').toEqual([])
    expect(putInBackToTheChat, 'a loading state was put into the page on the way back to the chat page, drawn or not').toEqual([])
  }, 240_000)
})
