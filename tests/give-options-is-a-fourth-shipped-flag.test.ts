// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GIVE OPTIONS IS A FOURTH SHIPPED FLAG, after Just ask, Proposal first and Align.
 *
 * The person asked for a flag that makes an agent come back with two or three whole options, each with its cost and one
 * marked as its recommendation, and build nothing until the person chooses one. It is stored on the message as the mark
 * "give-options", and it ships in forest green.
 *
 * WHAT THIS FILE PROVES:
 *   (a) with nothing stored, Give options is the fourth shipped flag, and its name, instruction, description and short
 *       word are the office's words for it, in English and in Chinese. Its instruction is one line and is the sentence
 *       the office hands over for a message marked give-options; its description is a few words. It ships in forest
 *       green, and its words take the same colour.
 *   (b) a new office's flag menu lists Give options after Align, with its description under its name.
 *   (c) an office whose person changed the older flags before Give options existed lists it too, and stores nothing
 *       for it.
 *   (d) a message the person flags Give options in the box is stored with the mark "give-options", and an agent's read
 *       of it hands over the flag's instruction.
 *   (e) the person can rename Give options and change its words, as with the other flags: the menu and the press show
 *       them, and an agent's read hands over the person's instruction. A two-line instruction is refused.
 *   (f) in Settings, the person can change its colour, as with the other flags. Its row shows forest green chosen, by
 *       the colour's own word. Once the person chooses green and saves, green is stored and the menu draws it green.
 *
 * No shipped flag can be hidden in Settings, so this file has no case for hiding one. Every word of the office's is
 * read from the word lists, never copied. That a run the office starts is handed the instruction is case (g) of
 * tests/a-run-the-office-starts-is-handed-the-persons-mark.test.ts. Its colour, light and dark, is in
 * tests/the-shipped-flags-are-light-pink-light-blue-and-light-orange.test.ts.
 *
 * On the code before this flag, the office ships three flags and refuses the mark "give-options", so every case here
 * fails there. Everything here is made up: the agent, its one line and the words. The servers come from `liveApp` in
 * tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { readShippedFlags, theFlagsOf, whatTheMarkAsks, type StoredShippedFlags } from '../src/shared/intent-mark.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { zhWave13y } from '../src/shared/words/zh-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-chooser' }

/** The word keys of the flag's four words, each in the English and the Chinese list. */
const THE_KEYS = {
  name: 'message.intent.name.giveOptions',
  instruction: 'message.intent.giveOptions',
  description: 'chat.intent.description.giveOptions',
  shortWord: 'chat.intent.short.giveOptions',
} as const

const GIVE_OPTIONS = {
  name: enWave13y[THE_KEYS.name] as string,
  instruction: enWave13y[THE_KEYS.instruction] as string,
  description: t(THE_KEYS.description),
  shortWord: enWave13y[THE_KEYS.shortWord] as string,
}

/** The person's own words for Give options, made up for this test. A name is at most 16 characters. */
const RENAMED = {
  name: 'Show me choices',
  description: 'Made-up: a few ways, then I pick.',
  instruction: 'Made-up: bring two ways with their costs and wait for my pick.',
  shortWord: 'Choices',
}

const THE_PANEL_AT = '/settings/chatlabels'
const THE_PANEL = '[data-settings-panel="settings.chatlabels"]'

let app: LiveApp
let agentId = ''
/** The message case (d) sent, which case (e) reads again. */
let flaggedId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'give-options-flag', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Chooser', data: { handle: 'made-up-chooser', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-chooser')?.id ?? ''
  expect(agentId, 'made-up-chooser has no registry row').not.toBe('')
  // ONE LINE FROM THE AGENT, so the person's next message is a reply in a conversation that exists.
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_AGENT,
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own, at a path of the site, with the chat beside the page. */
async function aWindowAt(path: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return { context, page }
}

/** A browser window with the conversation with the made-up agent open, at its writing box. */
async function aWindow(): Promise<{ context: BrowserContext; page: Page }> {
  const { context, page } = await aWindowAt('/')
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

async function openTheMenu(page: Page): Promise<void> {
  await page.locator('.px-chat-write .px-chat-intent').click()
  await page.locator('.px-menu .px-menu-item').first().waitFor({ timeout: 15_000 })
}

/** The names the open menu lists, in order. */
async function theMenusNames(page: Page): Promise<string[]> {
  return page.locator('.px-menu .px-menu-item .px-chat-intent-line-name').allTextContents()
}

/** The line of one flag in the open menu, found by its name alone. */
function theLine(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.locator('.px-menu .px-menu-item').filter({ has: page.locator('.px-chat-intent-line-name', { hasText: new RegExp('^' + escaped + '$') }) })
}

async function changeTheFlags(shippedFlags: unknown): Promise<{ status: number; text: string }> {
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags }),
  })
  return { status: changed.status, text: await changed.text() }
}

async function theStoredFlags(): Promise<Record<string, unknown> | undefined> {
  const read = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { participant: { shippedFlags?: Record<string, unknown> } }).participant.shippedFlags
}

/** The message as the agent's inbox read hands it over. */
async function theAgentReads(messageId: string): Promise<Record<string, unknown>> {
  const wire = await fetch(`${app.api}/api/messages/${messageId}`, { headers: AS_THE_AGENT })
  expect(wire.status, await wire.clone().text()).toBe(200)
  return ((await wire.json()) as { message: Record<string, unknown> }).message
}

describe('Give options, the fourth shipped flag', () => {
  it('(a) with nothing stored, Give options is the fourth shipped flag, in the office\'s words and in forest green', () => {
    const flags = theFlagsOf(null, null)
    expect(flags.shipped.map((one) => one.id)).toEqual(['just-ask', 'proposal-first', 'align', 'give-options'])
    expect(flags.shipped[3]).toMatchObject({ kind: 'shipped', id: 'give-options', ...GIVE_OPTIONS, colour: 'forest-green', wordsColour: 'forest-green' })
    for (const [what, words] of Object.entries(GIVE_OPTIONS)) expect(words, `Give options has no ${what}`).toBeTruthy()
    expect(GIVE_OPTIONS.instruction.includes('\n'), 'the instruction is more than one line').toBe(false)
    expect(whatTheMarkAsks('give-options')).toBe(GIVE_OPTIONS.instruction)
    expect(GIVE_OPTIONS.description.split(/\s+/).length, `the description is not a few words: ${GIVE_OPTIONS.description}`).toBeLessThanOrEqual(12)
    // THE CHINESE LIST HAS EACH OF THE FOUR WORDS, and its instruction is one line too.
    const zh: Readonly<Record<string, unknown>> = zhWave13y
    for (const [what, key] of Object.entries(THE_KEYS)) {
      expect(typeof zh[key] === 'string' && zh[key] !== '', `the Chinese list has no ${what} for Give options`).toBe(true)
    }
    expect(String(zh[THE_KEYS.instruction]).includes('\n'), 'the Chinese instruction is more than one line').toBe(false)
  })

  it('(b) a new office\'s menu lists Give options after Align, with its description', async () => {
    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toEqual([
        enWave13n['message.intent.name.justAsk'],
        enWave13n['message.intent.name.proposalFirst'],
        enWave13y['message.intent.name.align'],
        GIVE_OPTIONS.name,
        enWave13n['chat.intent.name.none'],
      ])
      expect(await theLine(page, GIVE_OPTIONS.name).locator('.px-chat-intent-line-what').textContent()).toBe(GIVE_OPTIONS.description)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(c) an office whose person changed the older flags lists Give options too, and stores nothing for it', async () => {
    const before: StoredShippedFlags = { 'just-ask': { name: 'Made-up ask' }, align: { colour: 'green' } }
    const changed = await changeTheFlags(before)
    expect(changed.status, changed.text).toBe(200)
    expect(await theStoredFlags()).toEqual(before)
    expect(theFlagsOf(before, null).shipped.map((one) => one.name)).toEqual([
      'Made-up ask',
      enWave13n['message.intent.name.proposalFirst'],
      enWave13y['message.intent.name.align'],
      GIVE_OPTIONS.name,
    ])
    expect(theFlagsOf(before, null).shipped[3]).toMatchObject({ id: 'give-options', ...GIVE_OPTIONS, colour: 'forest-green' })
    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toEqual([
        'Made-up ask',
        enWave13n['message.intent.name.proposalFirst'],
        enWave13y['message.intent.name.align'],
        GIVE_OPTIONS.name,
        enWave13n['chat.intent.name.none'],
      ])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(d) a message flagged Give options is stored with the mark, and the agent\'s read hands over its instruction', async () => {
    const words = 'Made-up words: how should the bench keep its fixtures?'
    const { context, page } = await aWindow()
    try {
      await page.fill('.px-chat-write textarea', words)
      await openTheMenu(page)
      await theLine(page, GIVE_OPTIONS.name).click()
      await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
      expect(await page.locator('.px-chat-write .px-chat-intent').getAttribute('data-intent')).toBe('give-options')
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
    } finally {
      await context.close()
    }
    const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: AS_THE_OWNER })
    expect(read.status, await read.clone().text()).toBe(200)
    const messages = ((await read.json()) as { messages: { id: string; body: string; intent?: string }[] }).messages
    const sent = messages.find((one) => one.body === words)
    expect(sent, 'the message was not stored').toBeDefined()
    expect(sent?.intent).toBe('give-options')
    flaggedId = sent!.id
    const message = await theAgentReads(flaggedId)
    expect(message['intent']).toBe('give-options')
    expect(message['whatTheMarkAsks']).toBe(GIVE_OPTIONS.instruction)
  }, 180_000)

  it('(e) the person renames Give options and changes its words, and they are what is shown and handed over', async () => {
    expect(flaggedId, 'case (d) did not run').not.toBe('')
    const changed = await changeTheFlags({ 'give-options': RENAMED })
    expect(changed.status, changed.text).toBe(200)
    expect(await theStoredFlags()).toEqual({ 'give-options': RENAMED })
    expect(theFlagsOf({ 'give-options': RENAMED }, null).shipped[3]).toMatchObject({ id: 'give-options', ...RENAMED })
    expect((await theAgentReads(flaggedId))['whatTheMarkAsks']).toBe(RENAMED.instruction)

    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toContain(RENAMED.name)
      expect(await theMenusNames(page)).not.toContain(GIVE_OPTIONS.name)
      expect(await theLine(page, RENAMED.name).locator('.px-chat-intent-line-what').textContent()).toBe(RENAMED.description)
      await theLine(page, RENAMED.name).click()
      await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
      expect(await page.locator('.px-chat-write .px-chat-intent .px-chat-intent-word').textContent()).toBe(RENAMED.shortWord)
    } finally {
      await context.close()
    }

    expect(readShippedFlags({ 'give-options': { instruction: 'One line.\nAnother line.' } }).ok).toBe(false)
    const twoLines = await changeTheFlags({ 'give-options': { instruction: 'One line.\nAnother line.' } })
    expect(twoLines.status, twoLines.text).toBe(400)
    expect(await theStoredFlags()).toEqual({ 'give-options': RENAMED })
  }, 180_000)

  it('(f) in Settings the person changes its colour from forest green to green, and the menu draws it green', async () => {
    expect(await theStoredFlags(), 'case (e) did not run').toEqual({ 'give-options': RENAMED })
    const settings = await aWindowAt(THE_PANEL_AT)
    try {
      const row = settings.page.locator(`${THE_PANEL} .chlab-one[data-kind="shipped"][data-flag="give-options"]`)
      await row.waitFor({ timeout: 30_000 })
      const forest = row.locator('[data-colour-for="flag"] .chlab-colour[data-colour="forest-green"]')
      expect(await forest.getAttribute('aria-pressed'), 'the row does not show forest green chosen').toBe('true')
      expect(await forest.getAttribute('aria-label')).toBe(enWave13y['settingsPanel.chatLabels.colour.forest-green'])
      await row.locator('[data-colour-for="flag"] .chlab-colour[data-colour="green"]').click()
      await row.locator('.chlab-save').click()
      await expect.poll(async () => theStoredFlags(), { timeout: 30_000 }).toEqual({ 'give-options': { ...RENAMED, colour: 'green' } })
    } finally {
      await settings.context.close()
    }
    expect(theFlagsOf({ 'give-options': { ...RENAMED, colour: 'green' } }, null).shipped[3]).toMatchObject({ colour: 'green', wordsColour: 'green' })

    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theLine(page, RENAMED.name).locator('.px-chat-intent-line').getAttribute('data-colour')).toBe('green')
    } finally {
      await context.close()
    }
  }, 180_000)
})
