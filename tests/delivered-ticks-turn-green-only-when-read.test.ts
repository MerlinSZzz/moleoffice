// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Delivery draws two muted ticks; only the recipient's read turns them green. */
import { mkdirSync } from 'node:fs'
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ConversationReply } from '../src/web/api.ts'
import { contrast, deltaE2000, lab, oklch, strongestPaintedPixel } from './helpers/colour-measures.ts'

let app: LiveApp
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const examples = [
  { mark: 'queued', body: 'Made-up message: waiting.', shape: 'tick', glyph: '✓', label: 'Waiting' },
  { mark: 'delivered', body: 'Made-up message: delivered.', shape: 'double-tick', glyph: '✓✓', label: 'Delivered' },
  { mark: 'seen', body: 'Made-up message: read.', shape: 'read', glyph: '✓✓', label: 'Read' },
] as const
const chat = '.px-chat[data-where="page"]'

async function hideFixtureRouting(page: Page) {
  // THE DISPLAY IS A MADE-UP EXAMPLE. Keep the real stored marks, but leave routing explanations
  // and this test machine's name out of the picture, so all three short letters fit at each width.
  await page.route('**/api/messages/conversation?**', async (route) => {
    const response = await route.fetch()
    const conversation = await response.json() as ConversationReply
    await route.fulfill({ response, json: {
      ...conversation, answering: null, whatHappensToAWaitingMessage: null,
      messages: conversation.messages.map((message) => ({ ...message, routed: [], writtenFrom: null })),
    } })
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'delivered-and-read-ticks', viewport: { width: 1440, height: 1000 } })
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers,
    body: JSON.stringify({ kind: 'agent', title: 'Example agent', data: {
      handle: 'example-ticks-agent', runtime: 'claude-code', state: 'active',
    } }),
  })
  expect(agent.status, await agent.clone().text()).toBe(201)
  for (const example of examples) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST', headers,
      body: JSON.stringify({ kind: 'message', title: example.body, data: {
        body: example.body, to: [{ kind: 'agent', id: 'example-ticks-agent' }],
      } }),
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, await filed.clone().text()).toBe(409)
    const { record } = await filed.json() as { record: { id: string } }
    if (example.mark === 'queued') continue
    const marked = await fetch(`${app.api}/api/messages/${record.id}/mark`, {
      method: 'POST',
      headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'example-ticks-agent' },
      body: JSON.stringify({ mark: example.mark }),
    })
    expect(marked.status, await marked.clone().text()).toBe(200)
  }
  await hideFixtureRouting(app.page)
  await app.page.goto(`${app.site}/?lang=en#/chat`)
  await waitForThePage(app.page, 30_000)
  await app.page.locator(`${chat} .px-chat-contact:has(.px-chat-name:text-is("Example agent"))`).click()
  await app.page.locator(`${chat} .px-chat-words:has-text("${examples[2].body}")`).waitFor()
}, 180_000)

afterAll(async () => {
  if (!app) return
  await app.page.unrouteAll({ behavior: 'wait' })
  await app.stop()
})

it.each([
  ['light', 'light'], ['dark', 'dark'], ['auto', 'light'], ['auto', 'dark'],
  // Retired saved looks draw their replacement, as the appearance picker explains.
  ['mono', 'light'], ['hc', 'light'], ['muted', 'light'], ['coffee', 'dark'], ['futuristic', 'dark'],
  // The six themes.
  ['paper', 'light'], ['high-contrast', 'light'], ['warm-night', 'dark'], ['burrow', 'light'], ['neutral-grey', 'light'],
  ['fresh-leaf', 'light'],
] as const)('draws waiting, delivered and read with their own glyph, colour and accessible word: %s / system %s', async (theme, system) => {
  await app.page.emulateMedia({ colorScheme: system })
  await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  const colours: Record<string, { colour: string; bubble: string }> = {}
  for (const example of examples) {
    const mark = app.page.locator(`${chat} .px-chat-one[data-mine="yes"]`)
      .filter({ has: app.page.locator(`.px-chat-words:has-text("${example.body}")`) }).locator('.px-chat-mark')
    await mark.waitFor()
    const drawn = await mark.evaluate((element) => {
      const probe = document.createElement('span')
      element.append(probe)
      probe.style.color = 'var(--chat-tick)'
      const muted = getComputedStyle(probe).color
      probe.remove()
      let background: Element | null = element.closest('.px-chat-bubble')
      if (!background) throw new Error('The mark is not in a message bubble.')
      let bubble = ''
      while (background) {
        bubble = getComputedStyle(background).backgroundColor
        if (bubble !== 'transparent' && bubble !== 'rgba(0, 0, 0, 0)') break
        background = background.parentElement
      }
      if (!background) throw new Error('No painted background behind the message mark.')
      return {
        shape: element.getAttribute('data-shape'),
        glyph: [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(''),
        label: element.getAttribute('aria-label'), colour: getComputedStyle(element).color, bubble, muted,
      }
    })
    expect(drawn.shape, `${theme}: ${example.mark}`).toBe(example.shape)
    expect(drawn.glyph).toBe(example.glyph)
    expect(drawn.label).toBe(example.label)
    colours[example.mark] = drawn
    if (example.mark !== 'seen') expect.soft(drawn.colour, `${theme}: ${example.mark}`).toBe(drawn.muted)
  }
  const read = colours.seen!
  const delivered = colours.delivered!
  const measured = {
    theme, system, applied: await app.page.getAttribute('html', 'data-theme'), read, delivered,
    readContrast: contrast(read.colour, read.bubble),
    deliveredContrast: contrast(delivered.colour, delivered.bubble),
    readOklch: oklch(read.colour), deliveredOklch: oklch(delivered.colour),
    deltaE2000: deltaE2000(lab(read.colour), lab(delivered.colour)),
  }
  const numbers = JSON.stringify(measured)
  console.log(`Chat tick colours: ${numbers}`)
  expect.soft(measured.readContrast, `read contrast >= 3:1; ${numbers}`).toBeGreaterThanOrEqual(3)
  expect.soft(measured.readOklch.h, `read green hue >= 125; ${numbers}`).toBeGreaterThanOrEqual(125)
  expect.soft(measured.readOklch.h, `read green hue <= 165; ${numbers}`).toBeLessThanOrEqual(165)
  expect.soft(measured.readOklch.C, `read green chroma >= 0.12; ${numbers}`).toBeGreaterThanOrEqual(0.12)
  expect.soft(measured.deliveredOklch.C, `delivered is not green: chroma <= 0.05; ${numbers}`).toBeLessThanOrEqual(0.05)
  expect.soft(measured.deltaE2000, `read and delivered differ: deltaE2000 >= 25; ${numbers}`).toBeGreaterThanOrEqual(25)
}, 120_000)

// Decode the browser's PNG in its own canvas: no PNG dependency or separate decoder to maintain.
async function screenshotPixels(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const picture = new Image()
    picture.src = `data:image/png;base64,${base64}`
    await picture.decode()
    const canvas = document.createElement('canvas')
    canvas.width = picture.naturalWidth
    canvas.height = picture.naturalHeight
    const drawing = canvas.getContext('2d')!
    drawing.drawImage(picture, 0, 0)
    return { width: canvas.width, height: canvas.height,
      pixels: [...drawing.getImageData(0, 0, canvas.width, canvas.height).data] }
  }, png.toString('base64'))
}

async function tickPage(theme: 'light' | 'dark', deviceScaleFactor: number) {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1000 }, deviceScaleFactor, colorScheme: theme,
    storageState: await app.context.storageState(),
  })
  try {
    await context.addInitScript((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await hideFixtureRouting(page)
    await page.goto(`${app.site}/?lang=en#/chat`)
    await waitForThePage(page, 30_000)
    await page.locator(`${chat} .px-chat-contact:has(.px-chat-name:text-is("Example agent"))`).click()
    await page.locator(`${chat} .px-chat-words:has-text("${examples[2].body}")`).waitFor()
    await page.evaluate(() => document.fonts.ready)
    return page
  } catch (error) {
    for (const page of context.pages()) await page.unrouteAll({ behavior: 'wait' })
    await context.close()
    throw error
  }
}

it('paints read ticks clearly green in Light and Dark at one and two device pixels per CSS pixel', async () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const scale of [1, 2]) {
      const page = await tickPage(theme, scale)
      try {
        const colours: Record<string, unknown> = {}
        const painted: Record<string, { colour: string; bubble: string }> = {}
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('DOM.enable')
        await cdp.send('CSS.enable')
        const { root } = await cdp.send('DOM.getDocument')
        for (const example of examples) {
          const row = page.locator(`${chat} .px-chat-one[data-mine="yes"]`)
            .filter({ has: page.locator(`.px-chat-words:has-text("${example.body}")`) })
          const mark = row.locator('.px-chat-mark')
          await mark.scrollIntoViewIfNeeded()
          const box = await mark.boundingBox()
          const bubbleBox = await row.locator('.px-chat-bubble').boundingBox()
          if (!box || !bubbleBox) throw new Error('A tick or its bubble has no box.')
          const computed = await mark.evaluate((element) => {
            const bubble = getComputedStyle(element.closest('.px-chat-bubble')!).backgroundColor
            const drawing = document.createElement('canvas').getContext('2d')!
            drawing.fillStyle = bubble
            return { colour: getComputedStyle(element).color, bubble, bubbleHex: drawing.fillStyle,
              font: getComputedStyle(element).font }
          })
          const picture = await screenshotPixels(page, await mark.screenshot({ animations: 'disabled' }))
          // Sample the bubble's left padding on the mark's row, outside the glyph and border.
          const background = await screenshotPixels(page, await page.screenshot({ clip: {
            x: Math.ceil(bubbleBox.x) + 5, y: Math.floor(box.y + box.height / 2), width: 1, height: 1,
          } }))
          const bubble = strongestPaintedPixel(background.pixels, computed.bubble)
          const colour = strongestPaintedPixel(picture.pixels, bubble)
          const { nodeId } = await cdp.send('DOM.querySelector', {
            nodeId: root.nodeId, selector: `${chat} .px-chat-mark[data-shape="${example.shape}"]`,
          })
          const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
          painted[example.mark] = { colour, bubble }
          colours[example.mark] = { colour, bubble, computed, fonts, width: picture.width, height: picture.height,
            contrast: contrast(colour, bubble), oklch: oklch(colour) }
          expect.soft(bubble, `${theme} ${scale}x ${example.mark}: painted and computed bubble agree`).toBe(computed.bubbleHex)
          expect.soft([background.width, background.height], `${theme}: screenshot uses device pixels`).toEqual([scale, scale])
        }
        const read = painted.seen!
        const delivered = painted.delivered!
        const measured = { theme, scale, colours, readContrast: contrast(read.colour, read.bubble),
          readOklch: oklch(read.colour), deliveredOklch: oklch(delivered.colour),
          deltaE2000: deltaE2000(lab(read.colour), lab(delivered.colour)) }
        const numbers = JSON.stringify(measured)
        console.log(`Painted chat tick colours: ${numbers}`)
        expect.soft(measured.readContrast, `painted read contrast >= 3:1; ${numbers}`).toBeGreaterThanOrEqual(3)
        expect.soft(measured.readOklch.h, `painted read green hue >= 125; ${numbers}`).toBeGreaterThanOrEqual(125)
        expect.soft(measured.readOklch.h, `painted read green hue <= 165; ${numbers}`).toBeLessThanOrEqual(165)
        expect.soft(measured.readOklch.C, `painted read green chroma >= 0.12; ${numbers}`).toBeGreaterThanOrEqual(0.12)
        expect.soft(measured.deliveredOklch.C, `delivered is not green: painted chroma <= 0.05; ${numbers}`).toBeLessThanOrEqual(0.05)
        expect.soft(measured.deltaE2000, `painted read and delivered differ: deltaE2000 >= 25; ${numbers}`).toBeGreaterThanOrEqual(25)
        await cdp.detach()
      } finally {
        await page.unrouteAll({ behavior: 'wait' })
        await page.context().close()
      }
    }
  }
}, 180_000)

it('photographs the three made-up messages at four widths in both looks, only when asked', async () => {
  const shots = process.env['CHAT_TICKS_SHOTS']
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    const page = await tickPage(theme, 2)
    try {
      await closeCrop(page, `${shots}/chat-ticks-1440-${theme}-close-2x.png`)
    } finally {
      await page.unrouteAll({ behavior: 'wait' })
      await page.context().close()
    }
  }
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark']) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      const rows = app.page.locator(`${chat} .px-chat-one[data-mine="yes"]`)
      await rows.nth(2).waitFor()
      expect(await rows.count()).toBe(3)
      const bounds = await rows.evaluateAll((all) => all.map((row) => {
        const box = row.getBoundingClientRect()
        return { x: box.x, right: box.right, top: box.top, bottom: box.bottom }
      }))
      for (const [index, box] of bounds.entries()) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(width)
        if (index > 0) expect(box.top).toBeGreaterThanOrEqual(bounds[index - 1]!.bottom)
      }
      await app.page.screenshot({ path: `${shots}/chat-ticks-${width}-${theme}.png` })
      if (width === 1440) {
        await closeCrop(app.page, `${shots}/chat-ticks-1440-${theme}-close.png`)
      }
    }
  }
}, 300_000)

async function closeCrop(page: Page, path: string) {
  const ticks = await page.locator(`${chat} .px-chat-mark`).evaluateAll((all) => all.map((mark) => {
    const box = mark.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
  }))
  const x = Math.floor(Math.min(...ticks.map((box) => box.left))) - 12
  const y = Math.floor(Math.min(...ticks.map((box) => box.top))) - 12
  await page.screenshot({ path, clip: {
    x, y, width: Math.ceil(Math.max(...ticks.map((box) => box.right))) - x + 12,
    height: Math.ceil(Math.max(...ticks.map((box) => box.bottom))) - y + 12,
  } })
}
