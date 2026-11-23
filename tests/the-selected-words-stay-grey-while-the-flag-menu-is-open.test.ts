// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SELECTED WORDS STAY GREY WHILE THE FLAG MENU IS OPEN.
 *
 * The person selects words in the writing box and presses the flag press. Before, the selection vanished as the press
 * took the focus, so the person could not see which words the flag would mark. Now the selected words keep a grey
 * ground while the menu is open. Once a flag is chosen they take that flag's colour. If none is chosen, the grey goes
 * and the selection is as it was.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, light and dark, at 1440 and at 390:
 *   (a) while the menu is open, the selected words are drawn on a grey ground, readable, and unlike the box's own ground.
 *   (b) once a flag is chosen, the same words are drawn on that flag's soft ground.
 *   (c) the menu opened on other words and shut with Escape leaves them no ground, the box focused and the same words
 *       selected.
 *   (d) the menu opened on other words and shut by pressing the flag press again leaves them no ground and the same
 *       words selected.
 *
 * A drawn ground is read as any element in the writing area, other than the box itself, whose text is exactly the
 * words and whose background is not transparent. So it holds whatever element draws the ground. The flag's colour is
 * read from a probe of the flag colour stylesheet, never copied. Everything here is made up: the agent, its one line
 * and the words. The servers come from `liveApp` in tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const JUST_ASK = enWave13n['message.intent.name.justAsk'] as string
/** The person's colour for Just ask, so the colour read after the choice is one the person chose. */
const THE_CHOSEN_COLOUR = 'purple'

const FLAGGED = 'Flag these words.'
const LEFT_ALONE = 'Leave these alone.'
const BODY = `Some words first. ${FLAGGED} ${LEFT_ALONE}`

type Look = 'light' | 'dark'
interface Size { width: number; height: number }
const SIZES: readonly Size[] = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]
const LOOKS: readonly Look[] = ['light', 'dark']

let app: LiveApp
let agentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'selected-words-grey', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags: { 'just-ask': { colour: THE_CHOSEN_COLOUR } } }),
  })
  expect(changed.status, await changed.clone().text()).toBe(200)
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Selector', data: { handle: 'made-up-selector', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-selector')?.id ?? ''
  expect(agentId, 'made-up-selector has no registry row').not.toBe('')
  // ONE LINE FROM THE AGENT, so the person's next message is a reply in a conversation that exists.
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-selector' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function aWindow(size: Size, look: Look): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: size, colorScheme: look })
  await context.addInitScript((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'split')
    localStorage.setItem('mole-office.chat.split-side', 'right')
  }, look)
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

/** Select some words in the box, as the person does before pressing the flag press. */
async function selectInTheBox(page: Page, words: string): Promise<{ from: number; to: number }> {
  const from = BODY.indexOf(words)
  expect(from, `the words "${words}" are not in the box`).toBeGreaterThan(-1)
  const to = from + words.length
  await page.locator('.px-chat-write textarea').evaluate((el, [a, b]) => {
    const box = el as HTMLTextAreaElement
    box.focus()
    box.setSelectionRange(a as number, b as number)
    box.dispatchEvent(new Event('select', { bubbles: true }))
  }, [from, to] as const)
  return { from, to }
}

async function pressTheFlagPress(page: Page): Promise<void> {
  await page.locator('.px-chat-write .px-chat-intent').click()
  await page.locator('.px-menu .px-menu-item', { hasText: JUST_ASK }).waitFor({ timeout: 15_000 })
}

/** The red, green, blue and alpha of a computed colour, as Chromium writes it in rgb() or in color(srgb ...). */
function channels(colour: string): [number, number, number, number] {
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(colour)
  if (rgb !== null) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\s*\)$/.exec(colour)
  if (srgb !== null) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])]
  throw new Error(`a colour this test cannot read: ${colour}`)
}

function luminance(colour: string): number {
  const [r, g, b] = channels(colour).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** How far apart two colours are, in the sum of their channels. */
function distance(a: string, b: string): number {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)
}

/** Every ground drawn under exactly these words in the writing area, other than the box itself, with the box's ink. */
async function theGroundsUnder(page: Page, words: string): Promise<{ grounds: string[]; ink: string }> {
  const drawn = await page.evaluate((wanted) => {
    const box = document.querySelector('.px-chat-write textarea') as HTMLTextAreaElement
    const grounds: string[] = []
    for (const element of document.querySelectorAll('.px-chat-write *')) {
      if (element === box || (element.textContent ?? '') !== wanted) continue
      grounds.push(getComputedStyle(element).backgroundColor)
    }
    return { grounds, ink: getComputedStyle(box).color }
  }, words)
  return { grounds: drawn.grounds.filter((ground) => channels(ground)[3] > 0), ink: drawn.ink }
}

/** The box's own ground, read before anything is selected or flagged. */
async function theBoxGround(page: Page): Promise<string> {
  return page.locator('.px-chat-write textarea').evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** The soft ground of one flag colour, read from a probe of the flag colour stylesheet in the writing area. */
async function theSoftGroundOf(page: Page, colour: string): Promise<string> {
  return page.evaluate((wanted) => {
    const probe = document.createElement('span')
    probe.className = 'px-label-ink'
    probe.dataset['colour'] = wanted
    probe.style.background = 'var(--label-soft)'
    document.querySelector('.px-chat-write')!.append(probe)
    const ground = getComputedStyle(probe).backgroundColor
    probe.remove()
    return ground
  }, colour)
}

/** What the box holds selected now, and whether it has the focus. */
async function theBoxSelection(page: Page): Promise<{ from: number; to: number; focused: boolean }> {
  return page.locator('.px-chat-write textarea').evaluate((el) => {
    const box = el as HTMLTextAreaElement
    return { from: box.selectionStart, to: box.selectionEnd, focused: document.activeElement === box }
  })
}

/** The selected words are on a grey ground while the menu is open: grey, unlike the box's ground, and readable. */
async function expectGreyWhileOpen(page: Page, words: string, boxGround: string, where: string): Promise<void> {
  const { grounds, ink } = await theGroundsUnder(page, words)
  expect(grounds, `${where}: the selected words have no ground while the flag menu is open`).not.toEqual([])
  for (const ground of grounds) {
    const [r, g, b] = channels(ground)
    expect(Math.max(r, g, b) - Math.min(r, g, b), `${where}: the ground ${ground} is not grey`).toBeLessThanOrEqual(16)
    expect(distance(ground, boxGround), `${where}: the ground ${ground} cannot be told from the box's ${boxGround}`).toBeGreaterThanOrEqual(30)
    expect(contrast(ground, ink), `${where}: the words in ${ink} cannot be read on ${ground}`).toBeGreaterThanOrEqual(4.5)
  }
}

describe('the selected words stay grey while the flag menu is open', () => {
  for (const size of SIZES) for (const look of LOOKS) {
    const where = `${look} at ${String(size.width)}`

    it(`(a, b) ${where}: grey while the menu is open, the flag's colour once one is chosen`, async () => {
      const { context, page } = await aWindow(size, look)
      try {
        await page.fill('.px-chat-write textarea', BODY)
        const boxGround = await theBoxGround(page)
        await selectInTheBox(page, FLAGGED)
        await pressTheFlagPress(page)
        await expectGreyWhileOpen(page, FLAGGED, boxGround, where)

        await page.locator('.px-menu .px-menu-item', { hasText: JUST_ASK }).click()
        await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
        const soft = await theSoftGroundOf(page, THE_CHOSEN_COLOUR)
        const { grounds } = await theGroundsUnder(page, FLAGGED)
        expect(grounds, `${where}: the flagged words have no ground once the flag is chosen`).not.toEqual([])
        for (const ground of grounds) expect(ground, `${where}: the flagged words are not on the flag's soft ground`).toBe(soft)
      } finally {
        await context.close()
      }
    }, 180_000)

    it(`(c) ${where}: Escape takes the grey away and keeps the same words selected`, async () => {
      const { context, page } = await aWindow(size, look)
      try {
        await page.fill('.px-chat-write textarea', BODY)
        const boxGround = await theBoxGround(page)
        const selected = await selectInTheBox(page, LEFT_ALONE)
        await pressTheFlagPress(page)
        await expectGreyWhileOpen(page, LEFT_ALONE, boxGround, where)

        await page.keyboard.press('Escape')
        await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
        expect((await theGroundsUnder(page, LEFT_ALONE)).grounds, `${where}: the grey stayed after Escape`).toEqual([])
        expect(await theBoxSelection(page), `${where}: the selection is not as it was`).toEqual({ ...selected, focused: true })
      } finally {
        await context.close()
      }
    }, 180_000)

    it(`(d) ${where}: pressing the flag press again takes the grey away and keeps the same words selected`, async () => {
      const { context, page } = await aWindow(size, look)
      try {
        await page.fill('.px-chat-write textarea', BODY)
        const boxGround = await theBoxGround(page)
        const selected = await selectInTheBox(page, LEFT_ALONE)
        await pressTheFlagPress(page)
        await expectGreyWhileOpen(page, LEFT_ALONE, boxGround, where)

        await page.locator('.px-chat-write .px-chat-intent').click()
        await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
        expect((await theGroundsUnder(page, LEFT_ALONE)).grounds, `${where}: the grey stayed after the menu was shut`).toEqual([])
        const after = await theBoxSelection(page)
        expect({ from: after.from, to: after.to }, `${where}: the selection is not as it was`).toEqual(selected)
      } finally {
        await context.close()
      }
    }, 180_000)
  }
})
