// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT SAYS A RESIDENT IS ASLEEP IN ITS NAME ROW, AND DRAWS NO SLEEP PRESS.
 *
 * Everything here is made up: the office is a test office with its own made-up database, and the proposer, the resident
 * and its reason are made-up agents and words. Nothing is read from a real office.
 *
 * WHAT IS MEASURED, each through the browser and each in a new browser context after the change it reads:
 *   1. An awake resident with a sleep recorded and a sleep time: the conversation's head and the contact row draw no
 *      sleep word, and the head draws no sleep press.
 *   2. A resident the person put to sleep: one short word inside the head's name row and one inside the row's name row,
 *      each the "Asleep since" words for the moment the door answered. The chat draws no sleep press.
 *   3. The resident's profile page still draws its sleep presses, with Wake while it sleeps.
 *   4. A resident the person woke: the head and the row draw no sleep word.
 *   5. Asleep again, at 1440 in dark and at 390 in light and dark: the word is in the same two name rows, the chat draws
 *      no press, and at 390 each word lies inside the window, with the head's word shown whole.
 * Each case waits until the dots have drawn the office's reading, so a word that is not drawn is not a reading that has
 * not landed yet.
 *
 * WHY CASES 1, 2, 4 AND 5 FAIL BEFORE THE CHANGE. Before it, the chat's line said how long ago a resident last slept and
 * when it sleeps, so an awake resident with a sleep recorded and a sleep time had a line in the head and in the row
 * (cases 1 and 4). The head drew that line under the name row and not in it, and drew the Sleep and Wake presses beside
 * it (cases 2 and 5). Case 3 passes before the change too: it guards the presses the profile keeps.
 *
 * THE WORDS ARE READ FROM THE CODE THAT SAYS THEM: `createI18n('en').t` for every word a case compares, and the moment
 * asleep from the office's own answer to the door that began the sleep. No sentence is typed into this file.
 */

import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import { whenAContactLastSpoke } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nowStamp } from '../src/shared/time.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { A_SLEEP_TIME, liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

const t = createI18n('en').t

const RESIDENT = { handle: 'made-up-sleeping-resident', name: 'Made-up Resident' } as const
const PROPOSER = { handle: 'made-up-resident-proposer', name: 'Made-up Proposer' } as const

/** One way of looking at the chat: a window width and a theme. */
interface ALook {
  width: number
  theme: 'light' | 'dark'
}

const WIDE_LIGHT: ALook = { width: 1440, theme: 'light' }
const THE_OTHER_LOOKS: readonly ALook[] = [
  { width: 1440, theme: 'dark' },
  { width: 390, theme: 'light' },
  { width: 390, theme: 'dark' },
]

/** The most one case may take: a few new browsers, each opening the chat. */
const A_CASE_MAY_TAKE_MS = 240_000

let app: LiveApp
let person: Record<string, string>
let residentId = ''

interface Reply {
  status: number
  text: string
  json: Record<string, any>
}

async function call(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let json: Record<string, any> = {}
  try {
    json = JSON.parse(text) as Record<string, any>
  } catch {
    json = {}
  }
  return { status: res.status, text, json }
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const asAgent = (handle: string, key: string): Record<string, string> => ({
  ...asPerson(),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function started(handle: string, name: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await call('POST', '/api/agents/started', asPerson(), { handle, name, role, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  return { id: String(reply.json['agent'].id), key: String(reply.json['whatToGiveIt']?.key) }
}

/** The resident's sleep as the office reads it now, from the presence door the chat's dots read. */
async function theSleepAsRead(): Promise<Record<string, any>> {
  const read = await call('GET', `/api/presence/agent/${residentId}`, asPerson())
  expect(read.status, read.text).toBe(200)
  const sleep = read.json['presence']?.['residentSleep']
  expect(sleep, `the office's presence reading has no sleep for the made-up resident: ${read.text}`).toBeTypeOf('object')
  return sleep as Record<string, any>
}

/** The resident's contact row, by the registry id it is drawn for. */
const theRow = (page: Page): ReturnType<Page['locator']> => page.locator(`.px-chat-contact[data-contact="agent:${residentId}"]`).first()

/** The conversation's head. */
const theHead = (page: Page): ReturnType<Page['locator']> => page.locator('.px-chat-them')

/** How many sleep presses the chat draws, anywhere in it. */
const thePressesInTheChat = (page: Page): Promise<number> => page.locator('.px-chat .sleep-presses').count()

/** The words a word draws, trimmed. */
async function theWordsOf(word: ReturnType<Page['locator']>): Promise<string> {
  return ((await word.textContent()) ?? '').trim()
}

/**
 * Run `look` in a new browser context of this width and theme, set as the page reads them before it is drawn, and close
 * it after. A new context keeps nothing a page read before, so what it draws is read after the change.
 */
async function inANewBrowser(look: ALook, see: (page: Page) => Promise<void>): Promise<void> {
  const context = await app.browser.newContext({ viewport: { width: look.width, height: 900 }, reducedMotion: 'reduce' })
  await context.addInitScript((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, look.theme)
  try {
    const page = await context.newPage()
    await see(page)
  } finally {
    await context.close()
  }
}

/** Open the chat on its contact list, and wait until the resident's row has drawn the office's reading in its dot. */
async function openTheContactList(page: Page, look: ALook): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000, waitUntil: 'domcontentloaded' })
  await waitForThePage(page, 60_000)
  expect(await page.locator('html').getAttribute('data-theme'), 'the page did not take the theme it was given').toBe(look.theme)
  await openTheChat(page)
  await page.locator('.px-chat-tab[data-tab="contacts"]').click()
  await theRow(page).waitFor({ state: 'visible', timeout: 30_000 })
  await theRow(page)
    .locator('.px-chat-dot:not([data-colour="none"])')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch((err: unknown) => {
      throw new Error(`the resident's contact row never drew the office's reading in its dot, so a missing sleep word would prove nothing: ${String(err)}`)
    })
}

/** Open the resident's conversation from its row, and wait until the head has drawn the office's reading in its dot. */
async function openTheConversation(page: Page, look: ALook): Promise<void> {
  await openTheContactList(page, look)
  await theRow(page).click()
  await page.locator('.px-chat-back').first().waitFor({ state: 'visible', timeout: 30_000 })
  await theHead(page).locator('.px-chat-them-top').first().waitFor({ state: 'visible', timeout: 30_000 })
  await theHead(page)
    .locator('.px-chat-them-top .px-chat-dot:not([data-colour="none"])')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 })
    .catch((err: unknown) => {
      throw new Error(`the conversation's head never drew the office's reading in its dot, so a missing sleep word would prove nothing: ${String(err)}`)
    })
}

/** Whether an element's box lies inside the window's width. */
async function insideTheWindow(at: ReturnType<Page['locator']>): Promise<boolean> {
  return at.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return box.left >= 0 && box.right <= window.innerWidth
  })
}

/** Put the resident to sleep through the door, as the person, and answer the words the chat should say for it. */
async function putItToSleep(): Promise<string> {
  const slept = await call('POST', `/api/residents/${residentId}/sleep`, asPerson(), {})
  expect(slept.status, slept.text).toBe(201)
  const since = String(slept.json['sleep'].asleep.since)
  const read = await theSleepAsRead()
  expect(read['asleepSince'], 'the office does not read the resident asleep since the moment the door answered').toBe(since)
  expect(read['wakesAt'], 'a sleep the person began has no time to wake').toBeNull()
  return t('resident.sleep.line.asleepSince', { when: whenAContactLastSpoke(since, nowStamp()) })
}

/** Wake the resident through the door, as the person, and check the office reads it awake with its last sleep recorded. */
async function wakeIt(): Promise<void> {
  const woke = await call('POST', `/api/residents/${residentId}/wake`, asPerson())
  expect(woke.status, woke.text).toBe(200)
  const read = await theSleepAsRead()
  expect(read['asleepSince'], 'the office still reads the resident asleep after the wake').toBeNull()
  expect(read['lastSleptAt'], 'the office has no last sleep recorded after the wake').not.toBeNull()
  expect(read['sleepTime'], 'the resident has no sleep time').not.toBeNull()
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-asleep-word', viewport: { width: 1440, height: 900 } })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  const proposer = await started(PROPOSER.handle, PROPOSER.name, 'secretary')
  const resident = await started(RESIDENT.handle, RESIDENT.name, 'secretary')
  residentId = resident.id
  const proposed = await call('POST', '/api/residents/proposals', asAgent(PROPOSER.handle, proposer.key), {
    agentId: residentId,
    because: 'Made-up reason: it has kept this office’s schedule for weeks.',
    sleepTime: A_SLEEP_TIME,
  })
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await call('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, asPerson())
  expect(confirmed.status, confirmed.text).toBe(200)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('the chat’s word for a resident’s sleep', () => {
  it('1: an awake resident with a sleep recorded and a sleep time has no sleep word and no press in the chat', async () => {
    await putItToSleep()
    await wakeIt()
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheConversation(page, WIDE_LIGHT)
      expect(await theHead(page).locator('.px-chat-sleep').count(), 'the head draws a sleep word for an awake resident').toBe(0)
      expect(await theHead(page).locator('.sleep-presses').count(), 'the head draws sleep presses').toBe(0)
      expect(await thePressesInTheChat(page), 'the chat draws sleep presses').toBe(0)
    })
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheContactList(page, WIDE_LIGHT)
      expect(await theRow(page).locator('.px-chat-sleep').count(), 'the row draws a sleep word for an awake resident').toBe(0)
    })
  }, A_CASE_MAY_TAKE_MS)

  it('2: a resident the person put to sleep has one asleep word in the head’s name row and in the row’s, and no press', async () => {
    const asleep = await putItToSleep()
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheConversation(page, WIDE_LIGHT)
      const word = theHead(page).locator('.px-chat-them-top .px-chat-sleep')
      await expect.poll(() => word.count(), { timeout: 30_000, message: 'the head’s name row does not draw one asleep word' }).toBe(1)
      expect(await theWordsOf(word)).toBe(asleep)
      expect(await word.getAttribute('data-sleep')).toBe('asleep')
      expect(await theHead(page).locator('.px-chat-sleep').count(), 'the head draws a second sleep word outside its name row').toBe(1)
      expect(await thePressesInTheChat(page), 'the chat draws sleep presses').toBe(0)
    })
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheContactList(page, WIDE_LIGHT)
      const word = theRow(page).locator('.px-chat-contact-top .px-chat-sleep')
      await expect.poll(() => word.count(), { timeout: 30_000, message: 'the row’s name row does not draw one asleep word' }).toBe(1)
      expect(await theWordsOf(word)).toBe(asleep)
      expect(await word.getAttribute('data-sleep')).toBe('asleep')
      expect(await thePressesInTheChat(page), 'the chat draws sleep presses').toBe(0)
    })
  }, A_CASE_MAY_TAKE_MS)

  it('3: the resident’s profile page still draws its sleep presses, with Wake while it sleeps', async () => {
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await page.goto(`${app.site}/?lang=en#${whoPath('agent', residentId)}`, { timeout: 60_000, waitUntil: 'domcontentloaded' })
      await waitForThePage(page, 60_000)
      const presses = page.locator('[data-sleep-presses="asleep"]')
      await presses.first().waitFor({ state: 'visible', timeout: 60_000 })
      await presses.first().getByRole('button', { name: t('resident.sleep.press.wake'), exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
    })
  }, A_CASE_MAY_TAKE_MS)

  it('4: a resident the person woke has no sleep word in the head or the row', async () => {
    await wakeIt()
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheConversation(page, WIDE_LIGHT)
      expect(await theHead(page).locator('.px-chat-sleep').count(), 'the head still draws a sleep word after the wake').toBe(0)
      expect(await thePressesInTheChat(page), 'the chat draws sleep presses').toBe(0)
    })
    await inANewBrowser(WIDE_LIGHT, async (page) => {
      await openTheContactList(page, WIDE_LIGHT)
      expect(await theRow(page).locator('.px-chat-sleep').count(), 'the row still draws a sleep word after the wake').toBe(0)
    })
  }, A_CASE_MAY_TAKE_MS)

  it('5: asleep again, at 1440 dark and at 390 light and dark, the word is in both name rows and lies inside the window', async () => {
    const asleep = await putItToSleep()
    for (const look of THE_OTHER_LOOKS) {
      const where = `at ${String(look.width)} in ${look.theme}`
      await inANewBrowser(look, async (page) => {
        await openTheContactList(page, look)
        const rowWord = theRow(page).locator('.px-chat-contact-top .px-chat-sleep')
        await expect.poll(() => rowWord.count(), { timeout: 30_000, message: `the row’s name row does not draw one asleep word ${where}` }).toBe(1)
        expect(await theWordsOf(rowWord), where).toBe(asleep)
        if (look.width === 390) expect(await insideTheWindow(rowWord), `the row’s word lies outside the window ${where}`).toBe(true)

        await theRow(page).click()
        await page.locator('.px-chat-back').first().waitFor({ state: 'visible', timeout: 30_000 })
        const headWord = theHead(page).locator('.px-chat-them-top .px-chat-sleep')
        await expect.poll(() => headWord.count(), { timeout: 30_000, message: `the head’s name row does not draw one asleep word ${where}` }).toBe(1)
        expect(await theWordsOf(headWord), where).toBe(asleep)
        if (look.width === 390) {
          expect(await insideTheWindow(headWord), `the head’s word lies outside the window ${where}`).toBe(true)
          const cut = await headWord.evaluate((el) => el.scrollWidth > el.clientWidth)
          expect(cut, `the head’s word is cut short ${where}`).toBe(false)
        }
        expect(await thePressesInTheChat(page), `the chat draws sleep presses ${where}`).toBe(0)
      })
    }
  }, A_CASE_MAY_TAKE_MS * 2)
})
