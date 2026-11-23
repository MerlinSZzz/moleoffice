// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHIPPED FLAGS ARE LIGHT PINK, LIGHT BLUE, LIGHT ORANGE AND FOREST GREEN.
 *
 * The person asked for Just ask in light pink, Proposal first in light blue and Align in light orange. Before, every
 * shipped flag was blue. Later the person asked for a fourth flag, Give options, in forest green. A shipped flag's colour
 * is not stored until the person changes it, so a flag whose colour the person has not changed takes its new colour in
 * an office that already exists, and a colour the person chose stays.
 *
 * WHAT THIS FILE PROVES:
 *   (a) with nothing stored, each shipped flag has its own colour, and its words take the same colour.
 *   (b) on the flag press and in the menu, light and dark, each flag is drawn in its colour's family of hues: the press
 *       on a light ground in the light theme, with its word readable on it, and the menu's dot readable on the menu.
 *   (c) flagged words in the writing box, light and dark, are drawn in their flag's hue and readable both on the box and
 *       on the flag's soft ground.
 *   (d) in an office where the person renamed one shipped flag and chose another's colour, the renamed one is drawn in
 *       its new colour, and the chosen colour stays.
 *   (e) light and dark, forest green is drawn in its own family of hues, and its ink and soft ground are not green's.
 *       Forest green is its own colour in the set, not another name for green.
 *
 * Forest green is in (a) to (d) as well. On the code before it, no shipped flag is named Give options, so the menu has
 * no line for it and (a) to (d) fail. The stylesheet has no rule for forest green, so (e) fails too: its probe takes
 * the text colour of the writing area, outside the family.
 *
 * A colour's family is read as a range of hues, so the test holds whatever exact shade the stylesheet works out, and
 * never copies one. Everything here is made up: the agent, its one line and the words. The servers come from `liveApp`
 * in tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theFlagsOf } from '../src/shared/intent-mark.ts'
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

type Look = 'light' | 'dark'
const LOOKS: readonly Look[] = ['light', 'dark']

/** Each shipped flag, its name in the menu, the colour it ships in, and the hues that colour's family spans, in degrees. */
const THE_FLAGS = [
  { id: 'just-ask', name: enWave13n['message.intent.name.justAsk'] as string, colour: 'pink', hues: [315, 355] },
  { id: 'proposal-first', name: enWave13n['message.intent.name.proposalFirst'] as string, colour: 'light-blue', hues: [195, 225] },
  { id: 'align', name: enWave13y['message.intent.name.align'] as string, colour: 'orange', hues: [18, 42] },
  { id: 'give-options', name: enWave13y['message.intent.name.giveOptions'] as string, colour: 'forest-green', hues: [100, 145] },
] as const

const RUNS = ['First words here.', 'Second words here.', 'Third words here.', 'Fourth words here.'] as const
const BODY = RUNS.join(' ')

let app: LiveApp
let agentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'shipped-flag-colours', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Colourer', data: { handle: 'made-up-colourer', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-colourer')?.id ?? ''
  expect(agentId, 'made-up-colourer has no registry row').not.toBe('')
  // ONE LINE FROM THE AGENT, so the person's next message is a reply in a conversation that exists.
  const line = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-colourer' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(line.status, await line.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function aWindow(look: Look): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: look })
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

/** The red, green, blue and alpha of a computed colour, as Chromium writes it in rgb() or in color(srgb ...). */
function channels(colour: string): [number, number, number, number] {
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(colour)
  if (rgb !== null) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  const srgb = /^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\s*\)$/.exec(colour)
  if (srgb !== null) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])]
  throw new Error(`a colour this test cannot read: ${colour}`)
}

/** The hue of a colour, in degrees from 0 to 360. */
function hue(colour: string): number {
  const [r, g, b] = channels(colour)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return Number.NaN
  const turn = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min)
  return (turn * 60 + 360) % 360
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

function expectInTheFamily(colour: string, hues: readonly [number, number], what: string): void {
  const at = hue(colour)
  expect(at >= hues[0] && at <= hues[1], `${what}: ${colour} has the hue ${String(Math.round(at))}, outside ${String(hues[0])} to ${String(hues[1])}`).toBe(true)
}

/** The colour an element is drawn on: its own background, or the first one behind it that is not transparent. */
async function theGroundBehind(element: Locator): Promise<string> {
  return element.evaluate((element) => {
    for (let at: Element | null = element; at !== null; at = at.parentElement) {
      const ground = getComputedStyle(at).backgroundColor
      if (ground !== 'rgba(0, 0, 0, 0)' && ground !== 'transparent') return ground
    }
    return getComputedStyle(document.body).backgroundColor
  })
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

/** The ink and the soft ground of one flag colour, read from a probe of the flag colour stylesheet in the writing area. */
async function theInkAndSoftOf(page: Page, colour: string): Promise<{ ink: string; soft: string }> {
  return page.evaluate((wanted) => {
    const probe = document.createElement('span')
    probe.className = 'px-label-ink'
    probe.dataset['colour'] = wanted
    probe.style.color = 'var(--label-ink)'
    probe.style.background = 'var(--label-soft)'
    document.querySelector('.px-chat-write')!.append(probe)
    const style = getComputedStyle(probe)
    const drawn = { ink: style.color, soft: style.backgroundColor }
    probe.remove()
    return drawn
  }, colour)
}

/** A computed colour's red, green and blue, each rounded to a whole number. */
function rounded(colour: string): [number, number, number] {
  const [r, g, b] = channels(colour)
  return [Math.round(r), Math.round(g), Math.round(b)]
}

async function openTheMenu(page: Page): Promise<void> {
  await page.locator('.px-chat-write .px-chat-intent').click()
  await page.locator('.px-menu .px-menu-item').first().waitFor({ timeout: 15_000 })
}

/** The line of one flag in the open menu, found by its name alone, so a description that holds the word is not taken. */
function theLine(page: Page, name: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exactly = new RegExp('^' + escaped + '$')
  return page.locator('.px-menu .px-menu-item').filter({ has: page.locator('.px-chat-intent-line-name', { hasText: exactly }) })
}

describe('the shipped flags\' colours', () => {
  it('(a) with nothing stored, each shipped flag ships in its own colour, and its words take it too', () => {
    const shipped = Object.fromEntries(theFlagsOf(null, null).shipped.map((one) => [one.id, [one.colour, one.wordsColour]]))
    expect(shipped).toEqual(Object.fromEntries(THE_FLAGS.map((one) => [one.id, [one.colour, one.colour]])))
  })

  it('(a) a colour the person chose stays, and a flag whose colour they left takes its new one', () => {
    const shipped = theFlagsOf({ 'just-ask': { name: 'Made-up ask' }, 'proposal-first': { colour: 'green' } }, null).shipped
    expect(Object.fromEntries(shipped.map((one) => [one.id, one.colour]))).toEqual({
      'just-ask': 'pink',
      'proposal-first': 'green',
      align: 'orange',
      'give-options': 'forest-green',
    })
  })

  for (const look of LOOKS) {
    it(`(b) ${look}: the flag press and the menu draw each flag in its colour, readable`, async () => {
      const { context, page } = await aWindow(look)
      try {
        await page.fill('.px-chat-write textarea', 'Made-up words for the whole message.')
        for (const flag of THE_FLAGS) {
          const where = `${look}, ${flag.name}`
          await openTheMenu(page)
          const line = theLine(page, flag.name)
          expect(await line.locator('.px-chat-intent-line').getAttribute('data-colour'), `${where}: the menu line`).toBe(flag.colour)
          const dot = await line.locator('.px-chat-intent-line-name').evaluate((element) => getComputedStyle(element, '::before').backgroundColor)
          expectInTheFamily(dot, flag.hues, `${where}: the menu's dot`)
          const menuGround = await theGroundBehind(line.locator('.px-chat-intent-line-name'))
          expect(contrast(dot, menuGround), `${where}: the dot ${dot} on the menu's ${menuGround}`).toBeGreaterThanOrEqual(3)

          await line.click()
          await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
          const press = page.locator('.px-chat-write .px-chat-intent')
          expect(await press.getAttribute('data-colour'), `${where}: the press`).toBe(flag.colour)
          const drawn = await press.evaluate((element) => {
            const style = getComputedStyle(element)
            const word = element.querySelector('.px-chat-intent-word')
            return { border: style.borderTopColor, ground: style.backgroundColor, word: word === null ? null : getComputedStyle(word).color }
          })
          expectInTheFamily(drawn.border, flag.hues, `${where}: the press's border`)
          expectInTheFamily(drawn.ground, flag.hues, `${where}: the press's ground`)
          if (look === 'light') expect(luminance(drawn.ground), `${where}: the press's ground ${drawn.ground} is not light`).toBeGreaterThanOrEqual(0.5)
          expect(drawn.word, `${where}: the press draws no short word`).not.toBeNull()
          expect(contrast(drawn.word!, drawn.ground), `${where}: the word ${drawn.word!} on ${drawn.ground}`).toBeGreaterThanOrEqual(4.5)
        }
      } finally {
        await context.close()
      }
    }, 180_000)

    it(`(c) ${look}: flagged words in the box are drawn in their flag's hue, readable`, async () => {
      const { context, page } = await aWindow(look)
      try {
        await page.fill('.px-chat-write textarea', BODY)
        const boxGround = await page.locator('.px-chat-write textarea').evaluate((el) => getComputedStyle(el).backgroundColor)
        for (const [at, flag] of THE_FLAGS.entries()) {
          const where = `${look}, ${flag.name}`
          const from = BODY.indexOf(RUNS[at]!)
          await page.locator('.px-chat-write textarea').evaluate((el, [a, b]) => {
            const box = el as HTMLTextAreaElement
            box.focus()
            box.setSelectionRange(a as number, b as number)
            box.dispatchEvent(new Event('select', { bubbles: true }))
          }, [from, from + RUNS[at]!.length] as const)
          await openTheMenu(page)
          await theLine(page, flag.name).click()
          await page.locator('.px-menu').waitFor({ state: 'detached', timeout: 15_000 })
          const words = page.locator(`.px-chat-mark-paint .px-chat-marked[data-flag-name="${flag.name}"]`)
          await words.waitFor({ timeout: 15_000 })
          expect(await words.textContent(), `${where}: the flagged words`).toBe(RUNS[at])
          expect(await words.getAttribute('data-colour'), `${where}: the flagged words`).toBe(flag.colour)
          const ink = await words.evaluate((element) => getComputedStyle(element).color)
          expectInTheFamily(ink, flag.hues, `${where}: the flagged words`)
          const soft = await theSoftGroundOf(page, flag.colour)
          expect(contrast(ink, boxGround), `${where}: the words ${ink} on the box's ${boxGround}`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(ink, soft), `${where}: the words ${ink} on the flag's ${soft}`).toBeGreaterThanOrEqual(4.5)
        }
      } finally {
        await context.close()
      }
    }, 180_000)

    it(`(e) ${look}: forest green is drawn in its own family, and not as green is drawn`, async () => {
      const { context, page } = await aWindow(look)
      try {
        const forest = await theInkAndSoftOf(page, 'forest-green')
        const green = await theInkAndSoftOf(page, 'green')
        const family = THE_FLAGS[3].hues
        expectInTheFamily(forest.ink, family, `${look}: forest green's ink`)
        expectInTheFamily(forest.soft, family, `${look}: forest green's soft ground`)
        expect(rounded(forest.ink), `${look}: forest green's ink ${forest.ink} is green's ${green.ink}`).not.toEqual(rounded(green.ink))
        expect(rounded(forest.soft), `${look}: forest green's soft ground ${forest.soft} is green's ${green.soft}`).not.toEqual(rounded(green.soft))
      } finally {
        await context.close()
      }
    }, 180_000)
  }

  it('(d) in an office the person already changed, a renamed flag takes its new colour and a chosen colour stays', async () => {
    const changed = await fetch(`${app.api}/api/participants/person/${encodeURIComponent(THE_PERSON)}`, {
      method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ shippedFlags: { 'just-ask': { name: 'Made-up ask' }, 'proposal-first': { colour: 'green' } } }),
    })
    expect(changed.status, await changed.clone().text()).toBe(200)
    const { context, page } = await aWindow('light')
    try {
      await openTheMenu(page)
      const asked = theLine(page, 'Made-up ask')
      expect(await asked.locator('.px-chat-intent-line').getAttribute('data-colour')).toBe('pink')
      const dot = await asked.locator('.px-chat-intent-line-name').evaluate((element) => getComputedStyle(element, '::before').backgroundColor)
      expectInTheFamily(dot, THE_FLAGS[0].hues, 'the renamed flag\'s dot')
      expect(await theLine(page, THE_FLAGS[1].name).locator('.px-chat-intent-line').getAttribute('data-colour')).toBe('green')
      expect(await theLine(page, THE_FLAGS[2].name).locator('.px-chat-intent-line').getAttribute('data-colour')).toBe('orange')
      expect(await theLine(page, THE_FLAGS[3].name).locator('.px-chat-intent-line').getAttribute('data-colour')).toBe('forest-green')
    } finally {
      await context.close()
    }
  }, 180_000)
})
