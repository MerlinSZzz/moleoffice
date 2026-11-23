// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEYBOARD SHORTCUTS, PRESSED IN A REAL PAGE. Every default holds Alt and one key, or holds Ctrl, or ⌘ on a
 * Mac. No default is a bare key, and none is "g" then a letter.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The claims are about what a real key does on a real page: a key opens the chat or goes to a page,
 * or it does not. A test of the rule alone (tests/the-shortcut-rule.test.ts) would pass on a build
 * that never listens for a key at all. So these cases press real keys and read what the page did:
 *
 *   - every shortcut fires where it should, in English and at ?lang=zh, and the old bare keys and
 *     "g" pairs fire nothing;
 *   - an Alt key fires on the key's place, also when the key gives another character, as Option does
 *     on a Mac;
 *   - no Alt key fires in a text box, where the letters typed are kept;
 *   - no key fires while an input method is composing;
 *   - a key turned off in Settings fires nothing, and the one switch stops every Alt key;
 *   - the Ctrl keys still work in a text box;
 *   - the keys the office already had still work: Escape closes the chat and the talk box, the
 *     send key sends, Alt+Up moves a plan line;
 *   - the hints on the presses name their keys;
 *   - the door refuses a bad value with 400 and writes nothing.
 *
 * A real key press CANNOT carry `isComposing`, because a browser sets it only while a real input
 * method runs. That case dispatches the keydown an input method fires and reads what happened.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'

let app: LiveApp
let reportId: string
let planId: string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AGENT_A = { handle: 'builder-keys-a', title: 'Builder Keys A' }
const AGENT_B = { handle: 'builder-keys-b', title: 'Builder Keys B' }

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function say(handle: string, body: string): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(handle),
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  return ((await said.json()) as { record: { id: string } }).record.id
}

/** The ids of the messages waiting for an answer from the owner, in the order the waiting door sends them. */
async function theWaitingOrder(): Promise<string[]> {
  const reply = await fetch(`${app.api}/api/waiting`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const held = (await reply.json()) as { items: { id: string; kind: string; tier: string }[] }
  return held.items.filter((row) => row.tier === 'asked' && row.kind === 'message').map((row) => row.id)
}

/** Open a page and wait for it, in one language. */
async function open(path: string, lang: '' | 'zh' = ''): Promise<void> {
  await app.page.goto(`${app.site}/${lang === '' ? '' : '?lang=zh'}#${path}`)
  await waitForThePage(app.page, 30_000)
  // THE KEYS ARE LISTENED FOR FROM THE FIRST DRAW; the settings are read from the office once. Give
  // that one read its moment, so a case never races the page's own first read.
  await app.page.waitForSelector('#mole-office-shortcut-keys', { state: 'attached', timeout: 15_000 })
  await sleep(400)
}

/** Take the focus off any box, so a single key reaches the page. */
async function focusNothing(): Promise<void> {
  await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

async function isTheCornerChatOpen(): Promise<boolean> {
  return (await app.page.$('aside.px-chat')) !== null
}

async function closeTheCornerChat(): Promise<void> {
  if (await isTheCornerChatOpen()) {
    // THE CLOSE THAT IS DRAWN BESIDE THE PAGE, never the circle, which design D draws only while the
    // chat is shut and something waits.
    await app.page.click('.px-chat-seam-away')
    await app.page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
  }
}

async function theme(): Promise<string | null> {
  return app.page.evaluate(() => document.documentElement.getAttribute('data-theme'))
}

async function hash(): Promise<string> {
  return app.page.evaluate(() => window.location.hash)
}

async function isTheListOpen(): Promise<boolean> {
  return (await app.page.$('.sck-list')) !== null
}

/** Dispatch the keydown an input method fires while it is composing; answer whether anything took it. */
async function aComposingKey(init: { key: string; code?: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): Promise<boolean> {
  return app.page.evaluate((one) => {
    const event = new KeyboardEvent('keydown', { ...one, isComposing: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  }, init)
}

/** Dispatch the keydown Option and a letter give on a Mac: the letter's place, and another character. */
async function anOptionKey(init: { key: string; code: string }, into = 'body'): Promise<boolean> {
  return app.page.evaluate(
    ([one, where]) => {
      const target = document.querySelector(where as string)
      if (target === null) throw new Error(`nothing on the page answers ${where as string}`)
      const event = new KeyboardEvent('keydown', { ...(one as { key: string; code: string }), altKey: true, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event.defaultPrevented
    },
    [init, into] as const,
  )
}

/** The keys one row draws, each <kbd> by itself. */
async function theKeysOf(row: string): Promise<string[]> {
  return app.page.$$eval(`${row} kbd`, (all) => all.map((one) => one.textContent ?? ''))
}

/** The place of each Alt key, as the page is told it. */
const THE_ALT_PLACES = ['KeyO', 'KeyC', 'KeyG', 'KeyP', 'KeyJ', 'KeyK', 'KeyR', 'KeyX', 'KeyL'] as const

async function isTheQuickSearchOpen(): Promise<boolean> {
  return (await app.page.$('.qs[role="dialog"]')) !== null
}

async function theirShortcuts(): Promise<unknown> {
  const reply = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const held = (await reply.json()) as { people: { id: string; shortcuts?: unknown }[] }
  return held.people.find((one) => one.id === THE_PERSON)?.shortcuts ?? null
}

/** Press one switch on the Settings group and wait until the office holds the change. */
async function pressTheSwitch(which: string, lang: '' | 'zh' = ''): Promise<void> {
  await open('/settings/shortcuts', lang)
  const box = `[data-shortcut-switch="${which}"]`
  await app.page.waitForSelector(`${box}:not([disabled])`, { timeout: 15_000 })
  const before = await app.page.$eval(box, (el) => (el as HTMLInputElement).checked)
  await app.page.click(box)
  await app.page.waitForFunction(
    ([selector, was]) => {
      const el = document.querySelector(selector as string) as HTMLInputElement | null
      return el !== null && el.checked !== was && !el.disabled
    },
    [box, before] as const,
    { timeout: 15_000 },
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'shortcut-keys', viewport: { width: 1440, height: 1000 }, opensAt: 'full', workspace: 'default' })
  // This case exercises the explicit unread-only choice. The person last had the chat beside the page, which is the
  // way the chat key opens it below.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread', chatOpensAs: 'split' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  for (const agent of [AGENT_A, AGENT_B]) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title: agent.title, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
  }
  const report = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'What the gripper did on Tuesday',
      summary: 'One run in three dropped the part.',
      data: { date: '2026-09-30', blocks: [{ id: 'b-prose', type: 'text', text: 'The gripper let go of the part on 37% of runs.' }] },
    }),
  })
  expect(report.status, await report.clone().text()).toBe(201)
  reportId = ((await report.json()) as { record: { id: string } }).record.id
  const plan = await fetch(`${app.api}/api/plans`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ title: 'Two lines', body: '- first line\n- second line' }),
  })
  expect(plan.status, await plan.clone().text()).toBeLessThan(300)
  planId = ((await plan.json()) as { plan: { id: string } }).plan.id
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe.each([
  { lang: '' as const, words: en },
  { lang: 'zh' as const, words: zh },
])('every shortcut fires where it should (lang "$lang")', ({ lang, words }) => {
  it('Ctrl+/ opens and closes the list of keys, in the page language, and ? alone opens nothing', async () => {
    await open('/', lang)
    await focusNothing()
    await app.page.keyboard.press('?')
    await sleep(200)
    expect(await isTheListOpen(), '? alone').toBe(false)
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    expect(await app.page.locator('#sck-list-title').innerText()).toBe(words['settingsCats.cat.keys'])
    expect(await app.page.locator('.sck-row[data-action="theme"] .sck-what').innerText()).toContain(words['shortcuts.what.theme'])
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('.sck-list', { state: 'detached', timeout: 5_000 })
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { state: 'detached', timeout: 5_000 })
    // A NEW PAGE CLOSES IT, however the page changed (here as the Back button would change it).
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    await app.page.evaluate(() => {
      window.location.hash = '#/settings/shortcuts'
    })
    await app.page.waitForSelector('.sck-list', { state: 'detached', timeout: 5_000 })
  }, 60_000)

  it('Ctrl+Shift+K calls the chat up and hides it, and c alone does nothing', async () => {
    await open('/', lang)
    await closeTheCornerChat()
    await focusNothing()
    // NOTHING WAITS, so design D draws no circle: the key opens the same split the sidebar's Chat row opens.
    expect(await app.page.locator('.px-chat-circle').count()).toBe(0)
    await app.page.keyboard.press('c')
    await sleep(200)
    expect(await isTheCornerChatOpen(), 'c alone').toBe(false)
    await app.page.keyboard.press('Control+Shift+K')
    await app.page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
    expect(await app.page.locator('[data-shortcut-line="note"]').count()).toBe(0)
    await app.page.keyboard.press('Control+Shift+K')
    await app.page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
    await app.page.keyboard.press('Control+Shift+K')
    await app.page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
    await closeTheCornerChat()
    // THE SAME AT 390, WHERE THE OPEN CHAT COVERS THE SCREEN AND ITS BACK PRESS CLOSES IT.
    try {
      await app.page.setViewportSize({ width: 390, height: 1000 })
      await open('/', lang)
      await closeTheCornerChat()
      await focusNothing()
      await app.page.keyboard.press('Control+Shift+K')
      await app.page.waitForSelector('aside.px-chat[data-where="split"]', { timeout: 10_000 })
      expect(await app.page.locator('[data-shortcut-line="note"]').count()).toBe(0)
      await app.page.keyboard.press('Control+Shift+K')
      await app.page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 60_000)

  it('Alt+O, Alt+C and Alt+G go to Home, Decisions and Settings, by the place of the key, and g then h goes nowhere', async () => {
    await open('/settings', lang)
    await focusNothing()
    // "g" THEN A LETTER IS NO SHORTCUT: no line waits for the letter, and the page stays.
    await app.page.keyboard.press('g')
    await app.page.keyboard.press('h')
    await sleep(200)
    expect(await app.page.$('[data-shortcut-line]'), 'no line after g').toBe(null)
    expect(await hash(), 'g h').toBe('#/settings')
    await app.page.keyboard.press('Alt+KeyO')
    await app.page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '', undefined, { timeout: 5_000 })
    await app.page.keyboard.press('Alt+KeyC')
    await app.page.waitForFunction(() => window.location.hash === '#/governance', undefined, { timeout: 5_000 })
    await app.page.keyboard.press('Alt+KeyG')
    await app.page.waitForFunction(() => window.location.hash === '#/settings', undefined, { timeout: 5_000 })
    // OPTION AND O GIVE "ø" ON A MAC. The page reads the place, so the same key goes Home.
    expect(await anOptionKey({ key: 'ø', code: 'KeyO' }), 'Option and O are taken').toBe(true)
    await app.page.waitForFunction(() => window.location.hash === '#/' || window.location.hash === '', undefined, { timeout: 5_000 })
  }, 60_000)

  it('Alt+P opens the list of projects with the focus on one', async () => {
    await open('/', lang)
    await app.page.waitForSelector('.sbp-switch:not([disabled])', { timeout: 15_000 })
    await focusNothing()
    await app.page.keyboard.press('Alt+KeyP')
    await app.page.waitForSelector('.sbp-choices:not([hidden])', { timeout: 5_000 })
    await app.page.waitForFunction(() => document.activeElement?.classList.contains('sbp-choice') === true, undefined, { timeout: 5_000 })
  }, 60_000)

  it('Alt+L switches between light and dark, and t alone does not', async () => {
    await open('/', lang)
    await app.page.emulateMedia({ colorScheme: 'light' })
    await focusNothing()
    const was = await theme()
    await app.page.keyboard.press('t')
    await sleep(200)
    expect(await theme(), 't alone').toBe(was)
    const showing = was === 'dark' ? 'dark' : 'light'
    await app.page.keyboard.press('Alt+KeyL')
    expect(await theme()).toBe(showing === 'dark' ? 'light' : 'dark')
    await app.page.keyboard.press('Alt+KeyL')
    expect(await theme()).toBe(showing)
  }, 60_000)

  it('Alt+R puts the focus in the page\'s own search box, and says so where there is none, and / alone does not', async () => {
    await open('/conversations', lang)
    await app.page.waitForSelector('.px-ac-search', { timeout: 15_000 })
    await focusNothing()
    await app.page.keyboard.press('/')
    await sleep(200)
    expect(await app.page.evaluate(() => document.activeElement?.classList.contains('px-ac-search') === true), '/ alone').toBe(false)
    await app.page.keyboard.press('Alt+KeyR')
    await app.page.waitForFunction(() => document.activeElement?.classList.contains('px-ac-search') === true, undefined, { timeout: 5_000 })
    // Nothing was typed into the box the key moved to.
    expect(await app.page.$eval('.px-ac-search', (el) => (el as HTMLInputElement).value)).toBe('')
    await open('/settings', lang)
    await focusNothing()
    await app.page.keyboard.press('Alt+KeyR')
    await app.page.waitForSelector('[data-shortcut-line="note"]', { timeout: 5_000 })
    expect(await app.page.locator('[data-shortcut-line="note"]').innerText()).toBe(words['shortcuts.note.noSearch'])
  }, 60_000)

  it('Alt+J and Alt+K open the messages waiting for the owner\'s answer, one by one', async () => {
    const tag = lang === '' ? 'en' : 'zh'
    const fromA = await say(AGENT_A.handle, `The first message waiting, from A (${tag}).`)
    const fromB = await say(AGENT_B.handle, `The second message waiting, from B (${tag}).`)
    // THE ORDER IS THE WAITING DOOR'S, which the key follows. Two messages filed in the same second
    // may come in either order, so the test reads it rather than assuming it.
    const order = (await theWaitingOrder()).filter((id) => id === fromA || id === fromB)
    expect(order.length, 'both messages wait for the owner\'s answer').toBe(2)
    const [first, second] = order[0] === fromA ? ['A', 'B'] : ['B', 'A']
    await open('/', lang)
    await closeTheCornerChat()
    await focusNothing()
    const chatSays = async (words: string): Promise<void> => {
      try {
        await app.page.waitForFunction(
          (want) => [...document.querySelectorAll('.px-chat-words')].some((el) => (el.textContent ?? '').includes(want)),
          words,
          { timeout: 15_000 },
        )
      } catch (error) {
        // SAY WHAT THE PAGE SHOWED INSTEAD: the line at the foot, and the chat's own words.
        const seen = await app.page.evaluate(() => ({
          note: document.querySelector('[data-shortcut-line]')?.textContent ?? null,
          chat: document.querySelector('.px-chat')?.textContent?.slice(0, 400) ?? null,
          hash: window.location.hash,
        }))
        throw new Error(`the chat never showed "${words}": ${JSON.stringify(seen)}`, { cause: error })
      }
    }
    await app.page.keyboard.press('Alt+KeyJ')
    await chatSays(`from ${first} (${tag})`)
    await focusNothing()
    await app.page.keyboard.press('Alt+KeyJ')
    await chatSays(`from ${second} (${tag})`)
    await focusNothing()
    await app.page.keyboard.press('Alt+KeyK')
    await chatSays(`from ${first} (${tag})`)
    await closeTheCornerChat()
  }, 90_000)
})

describe('when a shortcut must not fire', () => {
  it('no Alt key fires in a text box, and the letters typed there are kept', async () => {
    await open('/conversations')
    await app.page.emulateMedia({ colorScheme: 'light' })
    await closeTheCornerChat()
    await app.page.waitForSelector('.px-ac-search', { timeout: 15_000 })
    const themeBefore = await theme()
    const hashBefore = await hash()
    await app.page.click('.px-ac-search')
    await app.page.keyboard.type('ct?/nNg')
    await app.page.keyboard.press('h')
    for (const place of THE_ALT_PLACES) await app.page.keyboard.press(`Alt+${place}`)
    // ON A MAC, OPTION AND A LETTER TYPE A CHARACTER, so the press is left to the box.
    expect(await anOptionKey({ key: 'ø', code: 'KeyO' }, '.px-ac-search'), 'Option and O in a box').toBe(false)
    expect(await app.page.$eval('.px-ac-search', (el) => (el as HTMLInputElement).value)).toBe('ct?/nNgh')
    expect(await isTheListOpen(), 'no list').toBe(false)
    expect(await isTheQuickSearchOpen(), 'no quick search').toBe(false)
    expect(await isTheCornerChatOpen(), 'no chat').toBe(false)
    expect(await theme(), 'the look did not change').toBe(themeBefore)
    expect(await hash(), 'the page did not change').toBe(hashBefore)
  }, 60_000)

  it('at ?lang=zh, no key fires while an input method is composing, and none is taken from it', async () => {
    await open('/', 'zh')
    await closeTheCornerChat()
    await focusNothing()
    const themeBefore = await theme()
    expect(await aComposingKey({ key: 'l', code: 'KeyL', altKey: true }), 'a composing Alt+L is left to the input method').toBe(false)
    expect(await aComposingKey({ key: '/', code: 'Slash', ctrlKey: true })).toBe(false)
    expect(await aComposingKey({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true })).toBe(false)
    expect(await aComposingKey({ key: 'j', code: 'KeyJ', altKey: true })).toBe(false)
    expect(await aComposingKey({ key: 'r', code: 'KeyR', altKey: true })).toBe(false)
    await sleep(300)
    expect(await theme()).toBe(themeBefore)
    expect(await isTheListOpen()).toBe(false)
    expect(await isTheCornerChatOpen()).toBe(false)
    expect(await app.page.$('[data-shortcut-line]')).toBe(null)
  }, 60_000)

  it('a key turned off in Settings fires nothing, and the list and Settings draw the Alt keys', async () => {
    await pressTheSwitch('theme')
    expect(await theirShortcuts()).toEqual({ singleKeys: true, off: ['theme'] })
    // SETTINGS SAYS WHAT ITS SWITCH TURNS OFF, and each row draws its keys.
    expect(await app.page.locator('[data-shortcut-switch="single-keys"] ~ .scp-words .scp-word').innerText()).toBe(enWave13y['shortcuts.settings.outsideSwitch'])
    expect(await theKeysOf('.scp-row[data-shortcut="home"] .scp-keys')).toEqual(['Alt', 'O'])
    expect(await theKeysOf('.scp-row[data-shortcut="chat"] .scp-keys')).toEqual(['Ctrl', 'Shift', 'K'])
    await open('/')
    await app.page.emulateMedia({ colorScheme: 'light' })
    await focusNothing()
    const before = await theme()
    await app.page.keyboard.press('Alt+KeyL')
    await sleep(200)
    expect(await theme(), 'Alt+L is off').toBe(before)
    // THE OTHERS STILL FIRE.
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    expect(await app.page.getAttribute('.sck-row[data-action="theme"]', 'data-off')).toBe('yes')
    expect(await app.page.getAttribute('.sck-row[data-action="home"]', 'data-off')).toBe('no')
    expect(await theKeysOf('.sck-row[data-action="home"]')).toEqual(['Alt', 'O'])
    expect(await theKeysOf('.sck-row[data-action="keys"]')).toEqual(['Ctrl', '/'])
    await app.page.keyboard.press('Escape')
    // AND BACK ON.
    await pressTheSwitch('theme')
    expect(await theirShortcuts()).toEqual({ singleKeys: true, off: [] })
  }, 90_000)

  it('at ?lang=zh, the one switch turns every Alt key off, and the Ctrl keys still work', async () => {
    await pressTheSwitch('single-keys', 'zh')
    expect(await theirShortcuts()).toEqual({ singleKeys: false, off: [] })
    await open('/settings', 'zh')
    await closeTheCornerChat()
    await app.page.emulateMedia({ colorScheme: 'light' })
    await focusNothing()
    const themeBefore = await theme()
    for (const place of THE_ALT_PLACES) await app.page.keyboard.press(`Alt+${place}`)
    await sleep(300)
    expect(await isTheCornerChatOpen(), 'Alt+J and Alt+K are off').toBe(false)
    expect(await isTheQuickSearchOpen(), 'Alt+X is off').toBe(false)
    expect(await theme(), 'Alt+L is off').toBe(themeBefore)
    expect(await hash(), 'Alt+O and Alt+C are off').toBe('#/settings')
    expect(await app.page.$('[data-shortcut-line]'), 'no note from Alt+R').toBe(null)
    expect(await app.page.$('.sbp-choices:not([hidden])'), 'Alt+P is off').toBe(null)
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    expect(await app.page.getAttribute('.sck-row[data-action="theme"]', 'data-off')).toBe('yes')
    expect(await app.page.getAttribute('.sck-row[data-action="home"]', 'data-off')).toBe('yes')
    await app.page.keyboard.press('Escape')
    await app.page.keyboard.press('Control+Shift+K')
    await app.page.waitForSelector('aside.px-chat', { timeout: 10_000 })
    await closeTheCornerChat()
    await pressTheSwitch('single-keys', 'zh')
    expect(await theirShortcuts()).toEqual({ singleKeys: true, off: [] })
  }, 120_000)

  it('the Ctrl keys work in a text box', async () => {
    await open('/conversations')
    await closeTheCornerChat()
    await app.page.waitForSelector('.px-ac-search', { timeout: 15_000 })
    await app.page.click('.px-ac-search')
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('.sck-list', { state: 'detached', timeout: 5_000 })
    // THE FOCUS WENT BACK TO THE BOX IT CAME FROM.
    expect(await app.page.evaluate(() => document.activeElement?.classList.contains('px-ac-search'))).toBe(true)
    await app.page.keyboard.press('Control+Shift+K')
    await app.page.waitForSelector('aside.px-chat', { timeout: 10_000 })
    await closeTheCornerChat()
  }, 60_000)
})

describe('the keys the office already had still work', () => {
  it('Escape closes the corner chat, and with the list over it Escape closes only the list', async () => {
    await open('/')
    await closeTheCornerChat()
    await openTheChatBeside(app.page)
    await app.page.waitForSelector('aside.px-chat', { timeout: 10_000 })
    await focusNothing()
    await app.page.keyboard.press('Control+/')
    await app.page.waitForSelector('.sck-list', { timeout: 5_000 })
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('.sck-list', { state: 'detached', timeout: 5_000 })
    expect(await isTheCornerChatOpen(), 'the chat stayed').toBe(true)
    await focusNothing()
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
  }, 60_000)

  it('the send key sends, and letters typed in the message box are typed', async () => {
    await open('/')
    await closeTheCornerChat()
    await openTheChatBeside(app.page)
    await app.page.waitForSelector('aside.px-chat', { timeout: 10_000 })
    if ((await app.page.$('.px-chat-box')) === null) {
      await app.page.click('.px-chat-contact')
      await app.page.waitForSelector('.px-chat-box', { timeout: 15_000 })
    }
    await app.page.fill('.px-chat-box', '')
    await app.page.click('.px-chat-box')
    await app.page.keyboard.type('ct gh sent')
    expect(await app.page.$eval('.px-chat-box', (el) => (el as HTMLTextAreaElement).value)).toBe('ct gh sent')
    await app.page.keyboard.press('Shift+Enter')
    await app.page.waitForFunction(
      () => [...document.querySelectorAll('.px-chat-words')].some((el) => (el.textContent ?? '').includes('ct gh sent')),
      undefined,
      { timeout: 15_000 },
    )
    await closeTheCornerChat()
  }, 60_000)

  it('Escape closes the talk box', async () => {
    await open(`/r/${reportId}`)
    await closeTheCornerChat()
    await app.page.waitForSelector('[data-target^="reportBlock/"] [data-text-field]', { timeout: 30_000 })
    await app.page.evaluate(() => {
      const el = document.querySelector('[data-target^="reportBlock/"] [data-text-field]')
      if (el === null) throw new Error('the report paragraph is not on the page')
      const range = document.createRange()
      range.selectNodeContents(el)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      const at = el.getBoundingClientRect()
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.round(at.left + 20), clientY: Math.round(at.top + 8) }))
    })
    await app.page.waitForSelector('.px-talk', { timeout: 15_000 })
    await app.page.click('.px-talk textarea')
    await app.page.keyboard.press('Escape')
    await app.page.waitForSelector('.px-talk', { state: 'detached', timeout: 10_000 })
    expect(await isTheListOpen()).toBe(false)
  }, 90_000)

  it('Alt+Up moves a line in a plan', async () => {
    await open(`/plans/${planId}`)
    await app.page.waitForSelector('.pw-box', { timeout: 30_000 })
    await app.page.click('.pw-box')
    await app.page.evaluate(() => {
      const box = document.querySelector('.pw-box') as HTMLTextAreaElement
      box.focus()
      box.setSelectionRange(box.value.length, box.value.length)
    })
    await app.page.keyboard.press('Alt+ArrowUp')
    await app.page.waitForFunction(
      () => (document.querySelector('.pw-box') as HTMLTextAreaElement).value === '- second line\n- first line',
      undefined,
      { timeout: 5_000 },
    )
  }, 60_000)
})

describe('the hints and the door', () => {
  it("the sidebar's Chat row, the phone's press, the circle and the Settings row name their keys", async () => {
    await open('/')
    await app.page.waitForSelector('.shell-chat[aria-keyshortcuts]', { timeout: 10_000 })
    expect(await app.page.getAttribute('.shell-chat', 'aria-keyshortcuts')).toBe('Control+Shift+K')
    expect(await app.page.getAttribute('.shell-chat', 'title')).toContain('Ctrl+Shift+K')
    // THE TOP BAR'S PRESS NAMES THE SAME KEYS ON A PHONE.
    try {
      await app.page.setViewportSize({ width: 390, height: 1000 })
      await open('/')
      await app.page.waitForSelector('.shell-chat-phone[aria-keyshortcuts]', { timeout: 10_000 })
      expect(await app.page.getAttribute('.shell-chat-phone', 'aria-keyshortcuts')).toBe('Control+Shift+K')
      expect(await app.page.getAttribute('.shell-chat-phone', 'title')).toContain('Ctrl+Shift+K')
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
    // THE CIRCLE KEEPS THEM WHILE IT IS DRAWN, which needs something waiting.
    const waiting = await say(AGENT_A.handle, 'A message the circle waits with.')
    try {
      await open('/')
      await app.page.waitForSelector('.px-chat-circle[aria-keyshortcuts]', { timeout: 10_000 })
      expect(await app.page.getAttribute('.px-chat-circle', 'aria-keyshortcuts')).toBe('Control+Shift+K')
      expect(await app.page.getAttribute('.px-chat-circle', 'title')).toContain('Ctrl+Shift+K')
    } finally {
      const marked = await fetch(`${app.api}/api/messages/${waiting}/mark`, {
        method: 'POST',
        headers: AS_THE_OWNER,
        body: JSON.stringify({ mark: 'seen' }),
      })
      expect(marked.status, await marked.text()).toBe(200)
    }
    expect(await app.page.getAttribute('.sbp-settings', 'title')).toContain('Alt+G')
    expect(await app.page.getAttribute('.sbp-settings', 'title')).not.toContain('g s')
    expect(await app.page.getAttribute('.sbp-settings', 'aria-keyshortcuts')).toBe('Alt+G')
  }, 60_000)

  it('refuses a bad value with 400 and writes nothing, and takes a good one', async () => {
    const before = await theirShortcuts()
    for (const bad of [
      { singleKeys: 'no', off: [] },
      { singleKeys: true, off: ['review'] },
      { singleKeys: true, off: ['chat', 'chat'] },
      { singleKeys: true, off: [], more: true },
      'off',
    ]) {
      const refused = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
        method: 'PATCH',
        headers: AS_THE_OWNER,
        body: JSON.stringify({ shortcuts: bad }),
      })
      expect(refused.status, JSON.stringify(bad)).toBe(400)
      expect(await refused.text()).toContain('Nothing was written')
      expect(await theirShortcuts(), 'the refusal wrote nothing').toEqual(before)
    }
    const taken = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ shortcuts: { singleKeys: true, off: ['search', 'chat'] } }),
    })
    expect(taken.status, await taken.clone().text()).toBe(200)
    expect(await theirShortcuts()).toEqual({ singleKeys: true, off: ['chat', 'search'] })
    const cleared = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ shortcuts: null }),
    })
    expect(cleared.status, await cleared.clone().text()).toBe(200)
    expect(await theirShortcuts()).toBe(null)
  }, 60_000)
})
