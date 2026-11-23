// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALIGN IS A THIRD SHIPPED FLAG, beside Just ask and Proposal first.
 *
 * The person asked for a flag that makes an agent align first, then restate what was agreed, then wait for the
 * person's yes to that restatement before it acts. A yes the person gave after comments had been taken as a yes to the
 * first design; under this flag it is a yes to the restated version.
 *
 * WHAT THIS FILE PROVES:
 *   (a) with nothing stored, the shipped flags are Just ask, Proposal first, Align and Give options, and Align's name,
 *       instruction, description and short word are the office's words for it. Its instruction is one line and is the
 *       sentence the office hands over for a message marked align; its description is a few words.
 *   (b) a new office's flag menu lists Align after Proposal first, with its description under its name. Give options,
 *       the fourth shipped flag, comes after Align.
 *   (c) an office whose person changed the two older flags before Align existed lists Align too, and stores nothing
 *       for it.
 *   (d) a message the person flags Align in the box is stored with the mark, and an agent's read of it hands over
 *       Align's instruction.
 *   (e) the person can rename Align and change its words, as with the other flags: the menu and the press show them,
 *       and an agent's read hands over the person's instruction. A two-line instruction is refused.
 *
 * Every word of the office's is read from the word lists, never copied. That a run the office starts is handed the
 * instruction is case (f) of tests/a-run-the-office-starts-is-handed-the-persons-mark.test.ts. Everything here is made
 * up: the agent, its one line and the words. The servers come from `liveApp` in tests/helpers.ts, on a database in its
 * own temporary folder.
 */

import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { t } from '../src/shared/i18n.ts'
import { readShippedFlags, theFlagsOf, whatTheMarkAsks, type StoredShippedFlags } from '../src/shared/intent-mark.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-aligner' }

/** The fourth shipped flag's name, which the menu lists after Align. tests/give-options-is-a-fourth-shipped-flag.test.ts holds the rest of it. */
const GIVE_OPTIONS = enWave13y['message.intent.name.giveOptions'] as string

const ALIGN = {
  name: enWave13y['message.intent.name.align'] as string,
  instruction: enWave13y['message.intent.align'] as string,
  description: t('chat.intent.description.align'),
  shortWord: enWave13y['chat.intent.short.align'] as string,
}

/** The person's own words for Align, made up for this test. A name is at most 16 characters. */
const RENAMED = {
  name: 'Agree it first',
  description: 'Made-up: agree, say it back, then act.',
  instruction: 'Made-up: say back what we agreed and wait for my yes to that.',
  shortWord: 'Agree',
}

let app: LiveApp
let agentId = ''
/** The message case (d) sent, which case (e) reads again. */
let flaggedId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'align-flag', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Aligner', data: { handle: 'made-up-aligner', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-aligner')?.id ?? ''
  expect(agentId, 'made-up-aligner has no registry row').not.toBe('')
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

async function aWindow(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
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

describe('Align, the third shipped flag', () => {
  it('(a) with nothing stored, Align is the third shipped flag, in the office\'s words', () => {
    const flags = theFlagsOf(null, null)
    expect(flags.shipped.map((one) => one.id)).toEqual(['just-ask', 'proposal-first', 'align', 'give-options'])
    expect(flags.shipped[2]).toMatchObject({ kind: 'shipped', ...ALIGN })
    for (const [what, words] of Object.entries(ALIGN)) expect(words, `Align has no ${what}`).not.toBe('')
    expect(ALIGN.instruction.includes('\n'), 'the instruction is more than one line').toBe(false)
    expect(whatTheMarkAsks('align')).toBe(ALIGN.instruction)
    expect(ALIGN.description.split(/\s+/).length, `the description is not a few words: ${ALIGN.description}`).toBeLessThanOrEqual(12)
  })

  it('(b) a new office\'s menu lists Align after Proposal first, with its description', async () => {
    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toEqual([
        enWave13n['message.intent.name.justAsk'],
        enWave13n['message.intent.name.proposalFirst'],
        ALIGN.name,
        GIVE_OPTIONS,
        enWave13n['chat.intent.name.none'],
      ])
      expect(await theLine(page, ALIGN.name).locator('.px-chat-intent-line-what').textContent()).toBe(ALIGN.description)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(c) an office whose person changed the two older flags lists Align too, and stores nothing for it', async () => {
    const before: StoredShippedFlags = { 'just-ask': { name: 'Made-up ask' }, 'proposal-first': { colour: 'green' } }
    const changed = await changeTheFlags(before)
    expect(changed.status, changed.text).toBe(200)
    expect(await theStoredFlags()).toEqual(before)
    expect(theFlagsOf(before, null).shipped.map((one) => one.name)).toEqual([
      'Made-up ask',
      enWave13n['message.intent.name.proposalFirst'],
      ALIGN.name,
      GIVE_OPTIONS,
    ])
    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toEqual([
        'Made-up ask',
        enWave13n['message.intent.name.proposalFirst'],
        ALIGN.name,
        GIVE_OPTIONS,
        enWave13n['chat.intent.name.none'],
      ])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('(d) a message flagged Align is stored with the mark, and the agent\'s read hands over Align\'s instruction', async () => {
    const words = 'Made-up words: here is the design, with my comments.'
    const { context, page } = await aWindow()
    try {
      await page.fill('.px-chat-write textarea', words)
      await openTheMenu(page)
      await theLine(page, ALIGN.name).click()
      await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
      expect(await page.locator('.px-chat-write .px-chat-intent').getAttribute('data-intent')).toBe('align')
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
    expect(sent?.intent).toBe('align')
    flaggedId = sent!.id
    const message = await theAgentReads(flaggedId)
    expect(message['intent']).toBe('align')
    expect(message['whatTheMarkAsks']).toBe(ALIGN.instruction)
  }, 180_000)

  it('(e) the person renames Align and changes its words, and they are what is shown and handed over', async () => {
    expect(flaggedId, 'case (d) did not run').not.toBe('')
    const changed = await changeTheFlags({ align: RENAMED })
    expect(changed.status, changed.text).toBe(200)
    expect(await theStoredFlags()).toEqual({ align: RENAMED })
    expect(theFlagsOf({ align: RENAMED }, null).shipped[2]).toMatchObject({ id: 'align', ...RENAMED })
    expect((await theAgentReads(flaggedId))['whatTheMarkAsks']).toBe(RENAMED.instruction)

    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      expect(await theMenusNames(page)).toContain(RENAMED.name)
      expect(await theMenusNames(page)).not.toContain(ALIGN.name)
      expect(await theLine(page, RENAMED.name).locator('.px-chat-intent-line-what').textContent()).toBe(RENAMED.description)
      await theLine(page, RENAMED.name).click()
      await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
      expect(await page.locator('.px-chat-write .px-chat-intent .px-chat-intent-word').textContent()).toBe(RENAMED.shortWord)
    } finally {
      await context.close()
    }

    expect(readShippedFlags({ align: { instruction: 'One line.\nAnother line.' } }).ok).toBe(false)
    const twoLines = await changeTheFlags({ align: { instruction: 'One line.\nAnother line.' } })
    expect(twoLines.status, twoLines.text).toBe(400)
    expect(await theStoredFlags()).toEqual({ align: RENAMED })
  }, 180_000)
})
