// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON KEEPS THEIR OWN SETTINGS FOR EVERY FLAG (wave 14d, DB-3).
 *
 * The four flags the office ships and the menu's 'No mark' entry are one kind of thing with the person's own flags:
 * each has a name, a description, an instruction for the agent, a short word, a flag colour and a words colour. Their
 * settings for the shipped ones are on their own row, and a thing left out is its default. An own flag's four new
 * things are beside its word and colour in `chat_labels`.
 *
 * WHAT THIS FILE PROVES:
 *   (a) a name the person gives a shipped flag is the name the button, the menu and the bubble show.
 *   (b) the instruction the office hands over is the person's, on every hand-over that carries the message.
 *   (c) the description shows in the menu under the flag's name: the person's own, or the office's for a shipped flag
 *       they left as it is, and the office's is not kept as theirs. 'No mark' and an own flag with none show no line.
 *   (d) a flag's colours are drawn on the flag and its words, readable in both themes.
 *   (e) an own flag with no instruction is handed over by its word only.
 *   (f) a message with no flag is handed over byte for byte as it was before flags existed.
 *   (g) a name too long, an empty name, a two-line instruction, a colour outside the ten, and an agent's write are
 *       each refused with nothing written.
 *   (h) an export carries the settings.
 *   (i) a message stores only its own label's word and colour; the four things are refused there.
 *   (j) the office's defaults, each shipped flag in its own colour, and a message marked none, unchanged.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deliveryEnvelope } from '../src/shared/messages.ts'
import {
  LONGEST_LABEL,
  readMessageLabel,
  readMessageLabelEntry,
  readMessageLabels,
  type MessageLabelEntry,
} from '../src/shared/message-label.ts'
import { readShippedFlags, theFlagsOf, whatTheLabelAsks, whatTheMarkAsks, type StoredShippedFlags } from '../src/shared/intent-mark.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whyTheChangeIsRefused } from '../src/shared/why-the-change-is-refused.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { participantKey } from '../src/shared/messages.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-flagger' }

const SETTINGS: StoredShippedFlags = {
  'just-ask': {
    name: 'Answer plainly',
    description: 'Answer only, in plain words.',
    instruction: 'Answer the question. Change nothing and start no work.',
    shortWord: 'Plain',
    colour: 'purple',
    wordsColour: 'green',
  },
  'proposal-first': {
    name: 'Plan it first',
    instruction: 'Come back with one plan. Build nothing until I say yes.',
    shortWord: 'Plan',
    colour: 'amber',
    wordsColour: 'red',
  },
  none: { name: 'Nothing at all' },
}

let app: LiveApp
let agentId = ''

async function change(headers: Record<string, string>, shippedFlags: unknown): Promise<number> {
  return (await changeSaying(headers, shippedFlags)).status
}

async function changeSaying(headers: Record<string, string>, shippedFlags: unknown): Promise<{ status: number; text: string }> {
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ shippedFlags }),
  })
  return { status: changed.status, text: await changed.clone().text() }
}

async function readParticipant(): Promise<{ shippedFlags?: unknown; chatLabels?: unknown }> {
  const read = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { participant: { shippedFlags?: unknown; chatLabels?: unknown } }).participant
}

async function sendA(agent: string, body: string, label?: MessageLabelEntry): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title: 'Made-up flagged line', data: { body, to: [{ kind: 'agent', id: agent }], ...(label === undefined ? {} : { label }) } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

async function openTheConversation(page: Page): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

async function goTo(page: Page, path: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.mouse.move(1, 1)
}

beforeAll(async () => {
  app = await liveApp({ name: 'own-flags', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Flagger', data: { handle: 'made-up-flagger', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-flagger')?.id ?? ''
  expect(agentId).not.toBe('')
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

describe('the person\'s flags', () => {
  it('(j) with nothing changed, every shipped flag and No mark reads as the office ships it', () => {
    const flags = theFlagsOf(null, null)
    expect(flags.shipped.map((one) => one.name)).toEqual([
      enWave13n['message.intent.name.justAsk'],
      enWave13n['message.intent.name.proposalFirst'],
      enWave13y['message.intent.name.align'],
      enWave13y['message.intent.name.giveOptions'],
    ])
    expect(flags.shipped.map((one) => one.instruction)).toEqual([
      enWave13n['message.intent.justAsk'],
      enWave13n['message.intent.proposalFirst'],
      enWave13y['message.intent.align'],
      enWave13y['message.intent.giveOptions'],
    ])
    expect(flags.shipped.map((one) => one.description)).toEqual([
      t('chat.intent.description.justAsk'),
      t('chat.intent.description.proposalFirst'),
      t('chat.intent.description.align'),
      t('chat.intent.description.giveOptions'),
    ])
    expect(flags.noMark.description).toBeNull()
    expect(flags.shipped.map((one) => one.shortWord)).toEqual([
      enWave13y['chat.intent.short.justAsk'],
      enWave13y['chat.intent.short.proposalFirst'],
      enWave13y['chat.intent.short.align'],
      enWave13y['chat.intent.short.giveOptions'],
    ])
    expect(Object.fromEntries(flags.shipped.map((one) => [one.id, [one.colour, one.wordsColour]]))).toEqual({
      'just-ask': ['pink', 'pink'],
      'proposal-first': ['light-blue', 'light-blue'],
      align: ['orange', 'orange'],
      'give-options': ['forest-green', 'forest-green'],
    })
    expect(flags.noMark.name).toBe(enWave13n['chat.intent.name.none'])
    expect(flags.noMark.instruction).toBeNull()
  })

  it('(j) a label list stored as today reads back unchanged, with no new field set', () => {
    const stored = [{ text: 'Today', colour: 'red' }, { text: 'Later', colour: 'green' }]
    expect(readMessageLabels(stored)).toEqual({ ok: true, labels: stored })
  })

  it('(a, c) a shipped flag\'s name, description and short word are the person\'s, stored and read back', async () => {
    expect(await change(AS_THE_OWNER, SETTINGS)).toBe(200)
    expect(await readParticipant()).toMatchObject({ shippedFlags: SETTINGS })
    const flags = theFlagsOf(SETTINGS, null)
    expect(flags.shipped[0]).toMatchObject({ name: 'Answer plainly', description: 'Answer only, in plain words.', shortWord: 'Plain', colour: 'purple', wordsColour: 'green' })
    expect(flags.shipped[1]).toMatchObject({ name: 'Plan it first', description: t('chat.intent.description.proposalFirst'), colour: 'amber', wordsColour: 'red' })
    expect(flags.noMark.name).toBe('Nothing at all')
  })

  it('(b) the instruction the message is handed over with is the person\'s, from their row', async () => {
    expect(await change(AS_THE_OWNER, SETTINGS)).toBe(200)
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
    await context.addInitScript(() => {
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', 'right')
    })
    const page = await context.newPage()
    try {
      await goTo(page, '/')
      await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      await page.fill('.px-chat-write textarea', 'Made-up words asking only.')
      await page.locator('.px-chat-write .px-chat-intent').click()
      await page.locator('.px-menu .px-menu-item', { hasText: SETTINGS['just-ask']!.name! }).click()
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
    } finally {
      await context.close()
    }
    const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: AS_THE_OWNER })
    const messages = ((await read.json()) as { messages: { id: string; body: string }[] }).messages
    const messageId = messages.find((one) => one.body === 'Made-up words asking only.')?.id
    expect(messageId, 'the message was not stored').toBeDefined()
    const wire = await fetch(`${app.api}/api/messages/${messageId!}`, { headers: AS_THE_AGENT })
    expect(wire.status, await wire.clone().text()).toBe(200)
    const message = ((await wire.json()) as { message: Record<string, unknown> }).message
    expect(message['intent']).toBe('just-ask')
    expect(message['whatTheMarkAsks']).toBe(SETTINGS['just-ask']!.instruction)
  }, 120_000)

  it('(b) an own flag\'s instruction is on the message every read hands over', async () => {
    const own: MessageLabelEntry = { text: 'Read this', colour: 'red', instruction: 'Read the whole table first.' }
    const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
      method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatLabels: [own] }),
    })
    expect(changed.status, await changed.clone().text()).toBe(200)
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
    await context.addInitScript(() => {
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', 'right')
    })
    const page = await context.newPage()
    try {
      await goTo(page, '/')
      await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      await page.fill('.px-chat-write textarea', 'Made-up words under an own instruction.')
      await page.locator('.px-chat-write .px-chat-intent').click()
      await page.locator('.px-menu .px-menu-item', { hasText: own.text }).click()
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
    } finally {
      await context.close()
    }
    const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: AS_THE_OWNER })
    const messages = ((await read.json()) as { messages: { id: string; body: string }[] }).messages
    const messageId = messages.find((one) => one.body === 'Made-up words under an own instruction.')?.id
    expect(messageId, 'the message was not stored').toBeDefined()
    const wire = await fetch(`${app.api}/api/messages/${messageId!}`, { headers: AS_THE_AGENT })
    expect(wire.status, await wire.clone().text()).toBe(200)
    const message = ((await wire.json()) as { message: Record<string, unknown> }).message
    expect(message['label']).toEqual({ text: own.text, colour: own.colour })
    expect(message['whatTheLabelAsks']).toBe(own.instruction)
  }, 120_000)

  it('(b) every hand-over prints the label\'s instruction after its word and the mark\'s instruction last', () => {
    const own: MessageLabelEntry = { text: 'Read this', colour: 'red', instruction: 'Read the whole table first.' }
    const flags = theFlagsOf(SETTINGS, [own])
    const label = { text: own.text, colour: own.colour }
    const lines = deliveryEnvelope({
      from: 'the person', message: 'a-made-up-message-id', label,
      whatTheLabelAsks: whatTheLabelAsks(label, flags),
      whatTheMarkAsks: whatTheMarkAsks('just-ask', flags),
    })
    const word = lines.findIndex((line) => line.includes(own.text))
    const labelAsks = lines.indexOf(own.instruction!)
    const markAsks = lines.indexOf(SETTINGS['just-ask']!.instruction!)
    expect(word, lines.join('\n')).toBeGreaterThan(-1)
    expect(labelAsks, lines.join('\n')).toBeGreaterThan(word)
    expect(markAsks, lines.join('\n')).toBeGreaterThan(labelAsks)
  })

  it('(e) an own flag with no instruction is handed over by its word only', () => {
    const flags = theFlagsOf(null, [{ text: 'Quiet', colour: 'grey' }])
    const label = { text: 'Quiet', colour: 'grey' as const }
    expect(whatTheLabelAsks(label, flags)).toBeNull()
    const lines = deliveryEnvelope({ from: 'the person', message: 'a-made-up-message-id', label, whatTheLabelAsks: null, whatTheMarkAsks: null })
    expect(lines.filter((line) => line.includes('Quiet'))).toHaveLength(1)
    expect(lines).toHaveLength(deliveryEnvelope({ from: 'the person', message: 'a-made-up-message-id', label, whatTheMarkAsks: null }).length)
  })

  it('(f) a message with no mark and no label is handed over as it was before flags existed', () => {
    expect(deliveryEnvelope({ from: 'the person', message: 'a-made-up-message-id', intent: 'none' })).toEqual(
      deliveryEnvelope({ from: 'the person', message: 'a-made-up-message-id' }),
    )
  })

  it('(g) a name too long, an empty name, a two-line instruction, a colour outside the ten, and an agent are refused', async () => {
    // THE SENTENCE EACH REFUSAL GIVES IS READ FROM THE ONE STRICT READING, never copied here. The door adds
    // "Nothing was written." after it, so the answer must hold the reading's sentence.
    const refusalOf = (value: unknown): string => {
      const read = readShippedFlags(value)
      expect(read.ok, `the reading took ${JSON.stringify(value)}`).toBe(false)
      return read.ok ? '' : read.why
    }
    const theError = async (answer: { status: number; text: string }, status: number): Promise<string> => {
      expect(answer.status, answer.text).toBe(status)
      const body = JSON.parse(answer.text) as { error?: unknown }
      expect(typeof body.error, answer.text).toBe('string')
      return body.error as string
    }
    const tooLong = { 'just-ask': { name: 'x'.repeat(LONGEST_LABEL + 1) } }
    const long = await changeSaying(AS_THE_OWNER, tooLong)
    expect(await theError(long, 400)).toContain(refusalOf(tooLong))
    const emptyName = { 'just-ask': { name: '   ' } }
    const empty = await changeSaying(AS_THE_OWNER, emptyName)
    expect(await theError(empty, 400)).toContain(refusalOf(emptyName))
    const twoLineInstruction = { 'just-ask': { instruction: 'One line.\nAnother line.' } }
    const twoLines = await changeSaying(AS_THE_OWNER, twoLineInstruction)
    expect(await theError(twoLines, 400)).toContain(refusalOf(twoLineInstruction))
    const paddedWord = { 'proposal-first': { shortWord: ' Padded ' } }
    const padded = await changeSaying(AS_THE_OWNER, paddedWord)
    expect(await theError(padded, 400)).toContain(refusalOf(paddedWord))
    const twoLineWord = { 'proposal-first': { shortWord: 'One\nTwo' } }
    const shortTwoLines = await changeSaying(AS_THE_OWNER, twoLineWord)
    expect(await theError(shortTwoLines, 400)).toContain(refusalOf(twoLineWord))
    expect((await changeSaying(AS_THE_OWNER, { 'just-ask': { colour: 'teal' } })).status).toBe(400)
    expect((await changeSaying(AS_THE_OWNER, { none: { name: 'No mark', instruction: 'Nothing' } })).status).toBe(400)
    // AN AGENT MAY NOT WRITE A PERSON'S OWN SETTINGS: the sentence is the one rule that refuses it.
    const notTheirs = whyTheChangeIsRefused('messageLink', { kind: 'person', id: THE_PERSON }, { kind: 'agent', id: 'made-up-flagger' })
    expect(notTheirs).not.toBeNull()
    const byAgent = await changeSaying(AS_THE_AGENT, { 'just-ask': { name: 'Mine' } })
    expect(await theError(byAgent, 403)).toBe(notTheirs)
    expect(await readParticipant()).toMatchObject({ shippedFlags: SETTINGS })
  })

  it('(i) a message stores only an own label\'s word and colour, and refuses its four other things', async () => {
    const wide = { text: 'Read this', colour: 'red', description: 'A description', instruction: 'An instruction', shortWord: 'Read', wordsColour: 'green' }
    expect(readMessageLabel(wide).ok).toBe(false)
    expect(readMessageLabelEntry(wide).ok).toBe(true)
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST', headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'message', title: 'Made-up label with more', data: { body: 'Made-up words.', to: [{ kind: 'agent', id: agentId }], label: wide } }),
    })
    expect(made.status, await made.clone().text()).toBe(400)
  })

  it('(a, c, d) the menu, the flag and the bubble draw the person\'s name, description and short word', async () => {
    expect(await change(AS_THE_OWNER, SETTINGS)).toBe(200)
    const ask = SETTINGS['just-ask']!
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
    await context.addInitScript(() => {
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', 'right')
    })
    const page = await context.newPage()
    try {
      await goTo(page, '/settings/chatlabels')
      const row = page.locator('[data-settings-panel="settings.chatlabels"] .chlab-one[data-kind="shipped"][data-flag="just-ask"]')
      await row.waitFor({ timeout: 30_000 })
      expect(await row.locator('.chlab-field[data-field="name"] input').inputValue()).toBe(SETTINGS['just-ask']!.name)
      expect(await row.locator('.chlab-field[data-field="description"] input').inputValue()).toBe(SETTINGS['just-ask']!.description)
      expect(await row.locator('[data-colour-for="flag"] .chlab-colour[aria-pressed="true"]').getAttribute('data-colour')).toBe(SETTINGS['just-ask']!.colour)
      expect(await row.locator('[data-colour-for="words"] .chlab-colour[aria-pressed="true"]').getAttribute('data-colour')).toBe(SETTINGS['just-ask']!.wordsColour)
      // (c) A SHIPPED FLAG WITH NO DESCRIPTION OF THE PERSON'S shows the office's in its box, and a save keeps it as the
      // office's: nothing is stored for it, so a later change of the office's words reaches the person.
      const plan = page.locator('[data-settings-panel="settings.chatlabels"] .chlab-one[data-kind="shipped"][data-flag="proposal-first"]')
      expect(await plan.locator('.chlab-field[data-field="description"] input').inputValue()).toBe(t('chat.intent.description.proposalFirst'))
      await plan.locator('.chlab-save').click()
      await page.locator('[data-settings-panel="settings.chatlabels"] .chlab-say').waitFor({ timeout: 15_000 })
      const keptPlan = ((await readParticipant()).shippedFlags as StoredShippedFlags | undefined)?.['proposal-first']
      expect(keptPlan).toMatchObject({ name: SETTINGS['proposal-first']!.name })
      expect(keptPlan?.description).toBeUndefined()

      await goTo(page, '/')
      await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
      await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
      const flag = page.locator('.px-chat-write .px-chat-intent')
      await flag.click()
      const line = page.locator('.px-menu .px-menu-item', { hasText: ask.name! })
      await line.waitFor({ timeout: 15_000 })
      expect(await line.locator('.px-chat-intent-line-what').textContent()).toBe(ask.description)
      const noMark = page.locator('.px-menu .px-menu-item', { hasText: SETTINGS.none!.name! })
      expect(await noMark.locator('.px-chat-intent-line-what').count()).toBe(0)
      await line.click()
      expect(await flag.locator('.px-chat-intent-word').textContent()).toBe(ask.shortWord)
      expect(await flag.getAttribute('data-colour')).toBe(ask.colour)
      expect(await flag.getAttribute('data-words-colour')).toBe(ask.wordsColour)
      // THE WORDS COLOUR IS STORED AND SHOWN IN SETTINGS, AND NOTHING DRAWS IT YET. The short word on the flag keeps the
      // text colour a chosen flag has always drawn it in, so a shipped flag looks as it did before.
      const drawnWord = await flag.locator('.px-chat-intent-word').evaluate((element) => getComputedStyle(element).color)
      const theTextColour = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--text)'
        document.body.appendChild(probe)
        const colour = getComputedStyle(probe).color
        probe.remove()
        return colour
      })
      expect(drawnWord).toBe(theTextColour)
      await page.fill('.px-chat-write textarea', 'Made-up words under a renamed flag.')
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
      const mark = page.locator('.px-chat-foot .px-chat-intent-mark', { hasText: ask.name! }).last()
      await mark.waitFor({ timeout: 30_000 })
      expect(await mark.textContent()).toBe('Answer plainly')
      expect(await mark.getAttribute('data-colour')).toBe(ask.colour)

      // (a, c) SET BACK TO THE DEFAULT: today's name again, and the office's description under it again.
      expect(await change(AS_THE_OWNER, { 'just-ask': {} })).toBe(200)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await openTheConversation(page)
      await page.locator('.px-chat-write .px-chat-intent').click()
      await page.locator('.px-menu').waitFor({ timeout: 15_000 })
      const reset = page.locator('.px-menu .px-menu-item', { hasText: enWave13n['message.intent.name.justAsk'] })
      await reset.waitFor({ timeout: 15_000 })
      expect(await reset.locator('.px-chat-intent-line-what').textContent()).toBe(t('chat.intent.description.justAsk'))
      await reset.click()
      expect(await page.locator('.px-chat-write .px-chat-intent-word').textContent()).toBe(enWave13y['chat.intent.short.justAsk'])

      // (a) AN OWN FLAG RENAMED shows in the menu, on the flag and on the bubble. It starts as an existing flag, so the
      // old name must be gone rather than a second flag standing beside it.
      const before = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
        method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatLabels: [{ text: 'Old own name', colour: 'red' }] }),
      })
      expect(before.status, await before.clone().text()).toBe(200)
      const renamed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
        method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatLabels: [{ text: 'Own name', colour: 'blue' }] }),
      })
      expect(renamed.status, await renamed.clone().text()).toBe(200)
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await openTheConversation(page)
      await page.locator('.px-chat-write .px-chat-intent').click()
      await page.locator('.px-menu').waitFor({ timeout: 15_000 })
      expect(await page.locator('.px-menu .px-menu-item', { hasText: 'Old own name' }).count()).toBe(0)
      // (c) AN OWN FLAG WITH NO DESCRIPTION shows no line under its name.
      expect(await page.locator('.px-menu .px-menu-item', { hasText: 'Own name' }).locator('.px-chat-intent-line-what').count()).toBe(0)
      await page.locator('.px-menu .px-menu-item', { hasText: 'Own name' }).click()
      expect(await page.locator('.px-chat-write .px-chat-intent-word').textContent()).toBe('Own name')
      await page.fill('.px-chat-write textarea', 'Made-up words under an own renamed flag.')
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, { timeout: 30_000 })
      const ownMark = page.locator('.px-chat-foot .px-chat-label-mark', { hasText: 'Own name' }).last()
      await ownMark.waitFor({ timeout: 30_000 })
      expect(await ownMark.textContent()).toBe('Own name')
    } finally {
      await context.close()
    }
  }, 180_000)
})
