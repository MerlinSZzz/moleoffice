// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON KEEPS LABELS OF THEIR OWN FOR THE MESSAGES THEY WRITE (wave 13y, the owner's writing row).
 *
 * The flag left of Send offers the marks Plan, Ask and none. The person may also make labels of their own: a short word
 * and a colour from the set the page offers. They are kept on the person, not in one browser. A label goes on a message
 * the person writes, when they write it, as the mark does, and an agent reads its word with the message.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office:
 *   1. IN SETTINGS the person adds two labels, renames one, recolours one, and adds and removes a third. After each
 *      press the panel shows what the office stored, which is the word without the spaces typed around it.
 *   2. THE PERSON'S LABELS ARE THEIR OWN SETTING. A word too long, a colour outside the set and two labels with one word
 *      are refused, and so is an agent changing them, each with nothing written.
 *   3. THE SETTINGS PANEL keeps its words, presses and boxes inside its card with the chat beside the page, at 1024
 *      and at 390.
 *   4. THE FLAG'S LIST holds the three marks first, then the person's labels in their order. Choosing a label shows its
 *      word on the flag, in its colour.
 *   5. A MESSAGE SENT WITH A LABEL carries the label's word and colour, and shows the word in that colour under the
 *      message, readable in the light theme and in the dark one. The flag is back at no mark after the send.
 *   6. AN AGENT READS THE LABEL'S WORD WITH THE MESSAGE: in its read of the message, and in the lines it is handed with
 *      the message's words.
 *   7. ONLY THE PERSON SETS A LABEL, ON A MESSAGE THEY WRITE, WHEN THEY WRITE IT: an agent's message with one is
 *      refused, and so is a later write that would change it.
 *
 *   MUTATION A: the flag's list leaves out the person's labels. Red on 4, 5 and 6.
 *   MUTATION B: the send leaves the label out of the message. Red on 5 and 6.
 *   MUTATION C: the dark theme draws a label in its light colours. Red on 5.
 *   MUTATION D: the office lets an agent put a label on its own message. Red on 7.
 *   MUTATION E: the panel shows the word as it was typed, not as it was stored. Red on 1.
 *
 * Everything here is made up: the agent, its line, every label and every message. The servers come from `liveApp` in
 * tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deliveryEnvelope, participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, theAnswerToAWriteInATestOffice, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-labeller' }

/** The panel's address. */
const THE_PANEL_AT = '/settings/chatlabels'
const THE_PANEL = '[data-settings-panel="settings.chatlabels"]'

/** The two labels the flag's list and the send use, as the office stores them. */
const TODAY = { text: 'Made-up today', colour: 'red' }
const LATER = { text: 'Made-up later', colour: 'green' }

const SENT_WITH_A_LABEL = 'Made-up words sent with a label of my own.'

type Label = { text: string; colour: string }

let app: LiveApp
let agentId = ''

/** File one record, and say the answer when it is not the one this office gives. */
async function file(headers: Record<string, string>, body: { kind: string; title: string; data: Record<string, unknown> }, answer = 201): Promise<Response> {
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(filed.status, await filed.clone().text()).toBe(answer)
  return filed
}

/** The person's labels as the office keeps them on the person. */
async function theStoredLabels(): Promise<unknown> {
  const read = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, { headers: AS_THE_OWNER })
  expect(read.status, await read.clone().text()).toBe(200)
  return ((await read.json()) as { participant: { chatLabels?: unknown } }).participant.chatLabels ?? null
}

/** Change the person's labels through the participants door, as these headers, and give the answer's status. */
async function changeTheLabels(headers: Record<string, string>, chatLabels: unknown): Promise<number> {
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ chatLabels }),
  })
  return changed.status
}

beforeAll(async () => {
  app = await liveApp({ name: 'own-message-labels', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'Made-up Labeller', data: { handle: 'made-up-labeller', runtime: 'claude-code', state: 'active' } })
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-labeller')?.id ?? ''
  expect(agentId, 'made-up-labeller has no registry row').not.toBe('')
  // ONE LINE SO THE CONVERSATION EXISTS.
  await file(AS_THE_AGENT, { kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own, in this theme, with the chat beside the page. */
async function aWindow(width: number, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
  await context.addInitScript((chosen) => {
    localStorage.setItem('mole-office.preset.theme', chosen)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  }, theme)
  const page = await context.newPage()
  return { context, page }
}

/** Go to a page and wait for it, with the pointer off everything. */
async function goTo(page: Page, path: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.mouse.move(1, 1)
}

/** Open the conversation with the made-up agent and wait for its writing box. */
async function openTheConversation(page: Page): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
}

/** The labels the panel draws, each as its box's word and the colour pressed beside it. */
async function thePanelShows(page: Page): Promise<Label[]> {
  return page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).evaluateAll((rows) =>
    rows.map((row) => ({
      text: (row.querySelector('input.chlab-text') as HTMLInputElement | null)?.value ?? '',
      colour: row.querySelector('.chlab-colour[aria-pressed="true"]')?.getAttribute('data-colour') ?? '',
    })),
  )
}

/** Wait until the panel draws exactly these labels, and say what the office stored. */
async function thePanelSettlesOn(page: Page, labels: Label[]): Promise<unknown> {
  await expect.poll(() => thePanelShows(page), { timeout: 15_000 }).toEqual(labels)
  return theStoredLabels()
}

/** The one message that says these words. */
function theMessage(page: Page, words: string) {
  return page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: words }) })
}

/** The person's message with these words, as the person's conversation door lists it. */
async function theListedMessage(words: string): Promise<{ id: string }> {
  const read = await fetch(`${app.api}/api/messages/conversation?kind=agent&id=${encodeURIComponent(agentId)}`, { headers: AS_THE_OWNER })
  expect(read.status).toBe(200)
  const one = ((await read.json()) as { messages: { id: string; body: string }[] }).messages.find((said) => said.body === words)
  if (one === undefined) throw new Error(`no message says "${words}"`)
  return one
}

/**
 * HOW READABLE THIS ELEMENT'S WORDS ARE: the contrast ratio of its text colour against the first ground behind it that
 * is not see-through, by the formula of the Web Content Accessibility Guidelines.
 */
async function theContrastOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((element) => {
    const rgb = (colour: string): [number, number, number, number] => {
      const parts = (colour.match(/[\d.]+/g) ?? []).map(Number)
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }
    const luminance = ([r, g, b]: [number, number, number, number]): number => {
      const channel = (c: number): number => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    let ground: Element | null = element
    let behind = rgb('rgba(0, 0, 0, 0)')
    while (ground !== null) {
      behind = rgb(getComputedStyle(ground).backgroundColor)
      if (behind[3] === 1) break
      ground = ground.parentElement
    }
    const words = luminance(rgb(getComputedStyle(element).color))
    const back = luminance(behind)
    return (Math.max(words, back) + 0.05) / (Math.min(words, back) + 0.05)
  })
}

describe('a person\'s own labels in Settings', () => {
  it('1. are added, renamed, recoloured and removed, and the panel shows what the office stored', async () => {
    const { context, page } = await aWindow(1440, 'light')
    try {
      await goTo(page, THE_PANEL_AT)
      await page.locator(THE_PANEL).waitFor({ timeout: 30_000 })
      expect(await thePanelShows(page)).toEqual([])

      const add = async (typed: string, colour: string): Promise<void> => {
        await page.fill(`${THE_PANEL} .chlab-new input.chlab-text`, typed)
        await page.click(`${THE_PANEL} .chlab-new .chlab-colour[data-colour="${colour}"]`)
        await page.click(`${THE_PANEL} .chlab-new .chlab-add`)
      }
      // TWO LABELS, THE SECOND TYPED WITH SPACES AROUND IT. The office keeps the word without them, and so does the panel.
      await add('Made-up soon', 'red')
      await add('   Made-up later   ', 'blue')
      expect(await thePanelSettlesOn(page, [{ text: 'Made-up soon', colour: 'red' }, { text: 'Made-up later', colour: 'blue' }])).toEqual([
        { text: 'Made-up soon', colour: 'red' },
        { text: 'Made-up later', colour: 'blue' },
      ])

      // RENAME THE FIRST.
      await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(0).locator('.chlab-field[data-field="name"] input.chlab-text').fill('Made-up today')
      await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(0).locator('.chlab-save').click()
      // AN INSTRUCTION TYPED WITH ENTER STAYS ONE LINE: the office refuses a line break, so the box puts a space there.
      const first = page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(0)
      const instruction = first.locator('.chlab-field[data-field="instruction"] textarea')
      await instruction.fill('Read the table first.')
      await instruction.press('Enter')
      await instruction.type('Then answer.')
      await first.locator('.chlab-save').click()
      await expect.poll(async () => ((await theStoredLabels()) as { instruction?: string }[] | null)?.[0]?.instruction ?? null).toBe('Read the table first. Then answer.')
      const TODAY_ASKING = { ...TODAY, instruction: 'Read the table first. Then answer.' }
      // RECOLOUR THE SECOND, then save the row.
      await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(1).locator('[data-colour-for="flag"] .chlab-colour[data-colour="green"]').click()
      await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(1).locator('.chlab-save').click()
      expect(await thePanelSettlesOn(page, [TODAY, LATER])).toEqual([TODAY_ASKING, LATER])

      // A THIRD, AND IT IS REMOVED AGAIN.
      await add('Made-up gone', 'grey')
      expect(await thePanelSettlesOn(page, [TODAY, LATER, { text: 'Made-up gone', colour: 'grey' }])).toEqual([TODAY_ASKING, LATER, { text: 'Made-up gone', colour: 'grey' }])
      await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(2).locator('.chlab-remove').click()
      expect(await thePanelSettlesOn(page, [TODAY, LATER])).toEqual([TODAY_ASKING, LATER])

      // AND A NEW PAGE DRAWS THEM FROM THE OFFICE, not from anything this page kept.
      await page.reload({ timeout: 60_000 })
      await waitForThePage(page, 60_000)
      expect(await thePanelSettlesOn(page, [TODAY, LATER])).toEqual([TODAY_ASKING, LATER])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('2. are the person\'s own setting: a long word, a colour outside the set, one word twice and an agent are refused', async () => {
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, LATER])).toBe(200)
    expect(await changeTheLabels(AS_THE_OWNER, [{ text: 'A made-up word far too long', colour: 'red' }])).toBe(400)
    expect(await changeTheLabels(AS_THE_OWNER, [{ text: 'Made-up', colour: 'a made-up colour' }])).toBe(400)
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, { text: TODAY.text, colour: 'blue' }])).toBe(400)
    expect(await changeTheLabels(AS_THE_AGENT, [{ text: 'Made-up', colour: 'red' }])).toBe(403)
    expect(await theStoredLabels()).toEqual([TODAY, LATER])
  }, 60_000)

  it('3. keep their words, presses and boxes inside the panel\'s card with the chat beside the page, at 1024 and 390', async () => {
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, LATER])).toBe(200)
    for (const width of [1024, 390]) {
      const { context, page } = await aWindow(width, 'light')
      try {
        await goTo(page, THE_PANEL_AT)
        await page.locator(`${THE_PANEL} .chlab-one[data-kind="own"]`).nth(1).waitFor({ timeout: 30_000 })
        const outside = await page.locator(THE_PANEL).evaluate((card) => {
          const edge = card.getBoundingClientRect()
          return [...card.querySelectorAll('.chlab input, .chlab button, .chlab p, .chlab label, .chlab span')]
            .filter((one) => one.getBoundingClientRect().width > 0)
            .filter((one) => {
              const box = one.getBoundingClientRect()
              return box.left < edge.left - 0.5 || box.right > edge.right + 0.5
            })
            .map((one) => `${one.tagName.toLowerCase()}.${one.getAttribute('class') ?? ''}`)
        })
        expect(outside, `at ${String(width)}`).toEqual([])
      } finally {
        await context.close()
      }
    }
  }, 180_000)
})

describe('a person\'s own label on a message', () => {
  it('4. stands in the flag\'s list after the three marks, and the flag shows its word in its colour once chosen', async () => {
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, LATER])).toBe(200)
    const { context, page } = await aWindow(1440, 'light')
    try {
      await goTo(page, '/')
      await openTheConversation(page)
      const flag = page.locator('.px-chat-write .px-chat-intent')
      await flag.click()
      await page.locator('.px-menu .px-menu-item').nth(4).waitFor({ timeout: 15_000 })
      expect(await page.locator('.px-menu .px-menu-item .px-chat-intent-line-name').allTextContents()).toEqual([
        enWave13n['message.intent.name.justAsk'],
        enWave13n['message.intent.name.proposalFirst'],
        TODAY.text,
        LATER.text,
        enWave13n['chat.intent.name.none'],
      ])
      await page.locator('.px-menu .px-menu-item', { hasText: TODAY.text }).click()
      expect(await flag.locator('.px-chat-intent-word').textContent()).toBe(TODAY.text)
      expect(await flag.getAttribute('data-colour')).toBe(TODAY.colour)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('5. goes with the message, is drawn under it in its colour, readable in light and dark, and the flag is blank after', async () => {
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, LATER])).toBe(200)
    const light = await aWindow(1440, 'light')
    try {
      const page = light.page
      await goTo(page, '/')
      await openTheConversation(page)
      await page.fill('.px-chat-write textarea', SENT_WITH_A_LABEL)
      const flag = page.locator('.px-chat-write .px-chat-intent')
      await flag.click()
      await page.locator('.px-menu .px-menu-item', { hasText: TODAY.text }).click()
      await page.click('.px-chat-write .px-chat-send')
      await page.waitForFunction(() => (document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement | null)?.value === '', undefined, {
        timeout: 30_000,
      })
      // THE FLAG IS BLANK AGAIN, as after a mark.
      expect(await flag.getAttribute('data-chosen')).toBe('no')
      expect(await flag.locator('.px-chat-intent-word').count()).toBe(0)

      // THE STORED MESSAGE CARRIES THE LABEL'S WORD AND COLOUR.
      await expect.poll(async () => (await theListedMessage(SENT_WITH_A_LABEL).catch(() => null)) !== null, { timeout: 30_000 }).toBe(true)
      const sent = await theListedMessage(SENT_WITH_A_LABEL)
      const read = await fetch(`${app.api}/api/records/${sent.id}`, { headers: AS_THE_OWNER })
      expect(read.status).toBe(200)
      expect(((await read.json()) as { record: { data: Record<string, unknown> } }).record.data['label']).toEqual(TODAY)

      // AND THE MESSAGE SHOWS IT UNDER ITS WORDS, IN ITS COLOUR.
      const mark = theMessage(page, SENT_WITH_A_LABEL).locator('.px-chat-foot .px-chat-label-mark')
      await mark.waitFor({ timeout: 30_000 })
      expect(await mark.textContent()).toBe(TODAY.text)
      expect(await mark.getAttribute('data-colour')).toBe(TODAY.colour)
      expect(await theContrastOf(page, '.px-chat-one .px-chat-foot .px-chat-label-mark'), 'light').toBeGreaterThanOrEqual(4.5)
      // A CHOSEN FLAG'S GROUND IS ITS OWN COLOUR'S SOFT GROUND, not the panel's ground.
      const panelGround = await mark.evaluate((element) => {
        const probe = document.createElement('span')
        probe.style.background = 'var(--panel-2)'
        element.parentElement?.appendChild(probe)
        const colour = getComputedStyle(probe).backgroundColor
        probe.remove()
        return colour
      })
      const ground = await mark.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(ground, 'light').not.toBe(panelGround)
    } finally {
      await light.context.close()
    }

    const dark = await aWindow(1440, 'dark')
    try {
      const page = dark.page
      await goTo(page, '/')
      expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('dark')
      await openTheConversation(page)
      const mark = theMessage(page, SENT_WITH_A_LABEL).locator('.px-chat-foot .px-chat-label-mark')
      await mark.waitFor({ timeout: 30_000 })
      expect(await theContrastOf(page, '.px-chat-one .px-chat-foot .px-chat-label-mark'), 'dark').toBeGreaterThanOrEqual(4.5)
      const panelGround = await mark.evaluate((element) => {
        const probe = document.createElement('span')
        probe.style.background = 'var(--panel-2)'
        element.parentElement?.appendChild(probe)
        const colour = getComputedStyle(probe).backgroundColor
        probe.remove()
        return colour
      })
      const ground = await mark.evaluate((element) => getComputedStyle(element).backgroundColor)
      expect(ground, 'dark').not.toBe(panelGround)
    } finally {
      await dark.context.close()
    }
  }, 180_000)

  it("5a. a chosen flag's ground is its own colour's soft ground in both themes, and its word is readable on it", async () => {
    expect(await changeTheLabels(AS_THE_OWNER, [TODAY, LATER])).toBe(200)
    for (const theme of ['light', 'dark'] as const) {
      const { context, page } = await aWindow(1440, theme)
      try {
        await goTo(page, '/')
        await openTheConversation(page)
        const flag = page.locator('.px-chat-write .px-chat-intent')
        await flag.click()
        await page.locator('.px-menu .px-menu-item', { hasText: TODAY.text }).click()
        const measured = await flag.evaluate((element) => {
          const probe = (value: string): string => {
            const made = document.createElement('span')
            made.style.background = value
            element.appendChild(made)
            const colour = getComputedStyle(made).backgroundColor
            made.remove()
            return colour
          }
          return { ground: getComputedStyle(element).backgroundColor, soft: probe('var(--label-soft)'), panel: probe('var(--panel-2)') }
        })
        expect(measured.ground, theme).toBe(measured.soft)
        expect(measured.soft, theme).not.toBe('rgba(0, 0, 0, 0)')
        expect(measured.ground, theme).not.toBe(measured.panel)
        expect(await theContrastOf(page, '.px-chat-write .px-chat-intent[data-chosen="yes"] .px-chat-intent-word'), theme).toBeGreaterThanOrEqual(4.5)
      } finally {
        await context.close()
      }
    }
  }, 180_000)

  it('6. is read by the agent as its word, with the message', async () => {
    const sent = await theListedMessage(SENT_WITH_A_LABEL)
    const read = await fetch(`${app.api}/api/messages/${sent.id}`, { headers: AS_THE_AGENT })
    expect(read.status, await read.clone().text()).toBe(200)
    const message = ((await read.json()) as { message: { label?: unknown; intent?: unknown } }).message
    expect(message.label).toEqual(TODAY)
    // THE LINES A HAND-OVER PRINTS ABOVE THE MESSAGE'S WORDS, from what the read handed over, as the hooks pass it.
    const handedOver = { from: 'the person', message: sent.id, intent: message.intent, label: message.label }
    expect(deliveryEnvelope(handedOver).filter((line) => line.includes(TODAY.text))).toHaveLength(1)
  }, 60_000)

  it('7. is set only by the person, on a message they write, when they write it', async () => {
    // AN AGENT'S MESSAGE WITH A LABEL IS REFUSED, AND NOTHING IS WRITTEN.
    await file(
      AS_THE_AGENT,
      { kind: 'message', title: 'Made-up labelled line', data: { body: 'Made-up line with a label.', to: [{ kind: 'person', id: THE_PERSON }], label: LATER } },
      403,
    )
    // A LABEL OUTSIDE THE RULES IS REFUSED ON A MESSAGE TOO.
    const badly = { kind: 'message', title: 'Made-up badly labelled ask', data: { body: 'Made-up ask.', to: [{ kind: 'agent', id: agentId }], label: { text: 'Made-up', colour: 'a made-up colour' } } }
    await file(AS_THE_OWNER, badly, 400)
    // AND THE PERSON'S OWN LABEL STAYS AS IT WAS WRITTEN.
    const sent = await theListedMessage(SENT_WITH_A_LABEL)
    const changed = await fetch(`${app.api}/api/records/${sent.id}`, {
      method: 'PATCH',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ dataPatch: { label: LATER } }),
    })
    expect(changed.status, await changed.clone().text()).toBe(403)
    const read = await fetch(`${app.api}/api/records/${sent.id}`, { headers: AS_THE_OWNER })
    expect(((await read.json()) as { record: { data: Record<string, unknown> } }).record.data['label']).toEqual(TODAY)
    // A WELL-MADE LABEL ON THE PERSON'S OWN MESSAGE IS STORED.
    const well = { kind: 'message', title: 'Made-up labelled ask', data: { body: 'Made-up ask with a label.', to: [{ kind: 'agent', id: agentId }], label: LATER } }
    await file(AS_THE_OWNER, well, theAnswerToAWriteInATestOffice(AS_THE_OWNER, well))
  }, 60_000)
})
