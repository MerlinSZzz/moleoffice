// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

export const MADE_UP_BLOCK_TEXT = 'Made-up report block words'
export const MADE_UP_REPORT_TEXT = 'Made-up words describe a small workshop and its recorded observations.'

let browser: Browser
let context: BrowserContext
let page: Page
let script = ''
let server: Server | undefined
let site = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      sourcefile: 'touch-menu-page.ts', resolveDir: process.cwd(), loader: 'ts',
      contents: `
        import './tests/a-page-of-a-test-office.ts';
        import { targetAttributes } from './src/shared/targets.ts';
        import { partOfMoleOffice } from './src/web/components/agent/pointing.ts';
        import { startDispatch, whatIsOpen } from './src/web/components/agent/open.ts';
        Object.entries(targetAttributes({kind:'reportBlock',recordId:'made-up-record',blockId:'made-up-block'}))
          .forEach(([name,value]) => document.getElementById('block').setAttribute(name,value));
        Object.entries(partOfMoleOffice({surface:'composer.subject'}))
          .forEach(([name,value]) => document.getElementById('composer-surface').setAttribute(name,value));
        let taps = 0;
        document.getElementById('tap').addEventListener('click', () => { taps += 1 });
        startDispatch();
        window.touchTest = {
          opened: () => {
            const opened = whatIsOpen().opened;
            return opened === null ? null : { target: opened.pointed.context.target, place: opened.pointed.place, at: opened.at };
          },
          taps: () => taps,
          offered: () => whatIsOpen().offered !== null,
        };
      `,
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not bundle')
  // THE PAGE AND ITS BUNDLE ARE SERVED OVER HTTP FROM THIS PROCESS. The bundle is about 23 MB, and handed to each page
  // through Playwright it took about 3 s a page; fetched by the page it takes well under one. Every other address
  // answers the made-up page, as the route that served it before did, and nothing is kept in the browser's cache.
  // The bundle is a classic script, which a page reads in its own encoding unless the answer names one; the made-up
  // page names none, so the bundle's answer says UTF-8.
  const serving = createServer((asked, answer) => {
    const theScript = asked.url === '/page.js'
    answer.writeHead(200, { 'content-type': theScript ? 'text/javascript; charset=utf-8' : 'text/html', 'cache-control': 'no-store' })
    answer.end(theScript ? script : `
    <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{margin:0} #main{min-height:2300px} #block{height:150px;margin:40px 20px;background:#eee}
    #gap{height:160px} #tap{margin:20px;width:150px;height:55px}</style></head>
    <body><main id="main"><div id="block"><span id="words">${MADE_UP_BLOCK_TEXT}</span></div>
    <span id="loose">Made-up loose page words</span><span id="composer-surface">Made-up composer words</span><div id="gap"></div>
    <button id="tap" type="button">Made-up control</button></main></body></html>`)
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  site = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}`
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  page = await context.newPage()
  await page.goto(`${site}/`)
  await page.addScriptTag({ url: `${site}/page.js` })
})

afterEach(async () => { await context?.close() })

type Opened = { target: unknown; place: unknown; at: { x: number; y: number } } | null
const opened = () => page.evaluate(() => (window as unknown as { touchTest: { opened: () => Opened } }).touchTest.opened())
const taps = () => page.evaluate(() => (window as unknown as { touchTest: { taps: () => number } }).touchTest.taps())
const offered = () => page.evaluate(() => (window as unknown as { touchTest: { offered: () => boolean } }).touchTest.offered())
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function centre(selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox()
  if (box === null) throw new Error(`The made-up ${selector} is not on screen`)
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
}

async function touch(at: { x: number; y: number }, hold: number, movement = 0): Promise<void> {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
  await wait(hold)
  if (movement !== 0) {
    for (let step = 1; step <= 5; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y + movement * step / 5 }] })
      await wait(30)
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await wait(150)
}

// Chromium's desktop touch emulation does not create the phone's selection. These cases set the
// selection a phone would leave during the held touch, and exercise the real touch and menu path.
async function selectWords(from: number, to: number): Promise<void> {
  await page.evaluate(({ from, to }) => {
    const node = document.querySelector('#words')?.firstChild
    if (!node) throw new Error('the words are missing')
    const selection = window.getSelection()
    if (!selection) throw new Error('there is no selection')
    selection.setBaseAndExtent(node, from, node, to)
  }, { from, to })
}

async function wordPoint(): Promise<{ x: number; y: number }> {
  return centre('#words')
}

describe('a held finger and ordinary touch gestures', () => {
  it('opens after lifting from a word and keeps the selection', async () => {
    const at = await wordPoint()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await wait(650)
    expect(await opened(), 'the menu opened before the finger lifted').toBeNull()
    await selectWords(8, 14)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(opened).toMatchObject({
      target: { kind: 'reportBlock', recordId: 'made-up-record', blockId: 'made-up-block' },
      place: { at: 'quote', words: MADE_UP_BLOCK_TEXT.slice(8, 14) },
    })
    expect(await page.evaluate(() => String(window.getSelection()))).toBe(MADE_UP_BLOCK_TEXT.slice(8, 14))
    await cdp.detach()
  })

  it('opens about already selected words after lifting', async () => {
    await selectWords(8, 20)
    await touch(await wordPoint(), 700)
    expect(await opened()).toMatchObject({ place: { at: 'quote', words: MADE_UP_BLOCK_TEXT.slice(8, 20) } })
  })

  it('updates the subject when one end of the selection changes', async () => {
    await selectWords(8, 14)
    await touch(await wordPoint(), 700)
    expect(await opened()).toMatchObject({ place: { at: 'quote', words: MADE_UP_BLOCK_TEXT.slice(8, 14) } })
    await selectWords(8, 20)
    await expect.poll(opened).toMatchObject({ place: { at: 'quote', words: MADE_UP_BLOCK_TEXT.slice(8, 20) } })
  })

  it('opens about a word’s block after lift when no selection was made', async () => {
    await touch(await wordPoint(), 700)
    expect(await opened()).toMatchObject({ target: { kind: 'reportBlock', recordId: 'made-up-record', blockId: 'made-up-block' },
      place: { at: 'surface' } })
    expect(await page.evaluate(() => String(window.getSelection()))).toBe('')
  })

  it('does not offer a composer surface when a later selection is inside it', async () => {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [await centre('#loose')] })
    await wait(650)
    await page.evaluate(() => {
      const node = document.querySelector('#loose')?.firstChild
      if (!node) throw new Error('made-up loose words missing')
      window.getSelection()?.setBaseAndExtent(node, 0, node, 7)
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(opened).not.toBeNull()
    await page.evaluate(() => {
      const node = document.querySelector('#composer-surface')?.firstChild
      if (!node) throw new Error('made-up composer words missing')
      window.getSelection()?.setBaseAndExtent(node, 0, node, 7)
    })
    await wait(150)
    expect(await offered()).toBe(false)
    await cdp.detach()
  })

  it('opens at the finger about the block found under it', async () => {
    const at = await centre('#block')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await wait(700)
    expect(await opened(), 'the block did not open before lift').toMatchObject({
      target: { kind: 'reportBlock', recordId: 'made-up-record', blockId: 'made-up-block' }, at,
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  })

  it('opens at the finger about the page when no smaller thing is there', async () => {
    const at = await centre('#gap')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await wait(700)
    expect(await opened(), 'the page did not open before lift').toMatchObject({ target: { kind: 'page', route: '/' }, at })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  })

  it('lets a moving finger scroll without opening', async () => {
    const before = await page.evaluate(() => scrollY)
    await touch({ x: 190, y: 700 }, 40, -300)
    expect(await page.evaluate(() => scrollY), 'the moving finger did not scroll').toBeGreaterThan(before)
    expect(await opened(), 'scrolling opened the menu').toBeNull()
  })

  it('lets a short tap activate its control without opening', async () => {
    await touch(await centre('#tap'), 40)
    expect(await taps(), 'the short tap did not activate the control').toBe(1)
    expect(await opened(), 'the short tap opened the menu').toBeNull()
  })
})

// This uses the real drawing so that a menu opening over a picked-up card cannot pass unnoticed.
describe('a card keeps its held drag', () => {
  let app: import('./helpers.ts').LiveApp
  let drawing: Page
  let first = ''
  let report = ''

  beforeAll(async () => {
    const { liveApp } = await import('./helpers.ts')
    const { THE_TEST_OFFICES_OWNER } = await import('./a-page-of-a-test-office.ts')
    app = await liveApp({ name: 'touch-menu-card', viewport: { width: 390, height: 800 }, hasTouch: true })
    drawing = app.page
    const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
    const ids: string[] = []
    for (const title of ['Made-up first module', 'Made-up second module', 'Made-up third module']) {
      const response = await fetch(`${app.api}/api/records`, {
        method: 'POST', headers, body: JSON.stringify({ kind: 'module', title, data: { state: 'active', parts: [] } }),
      })
      if (!response.ok) throw new Error(`creating the made-up module returned ${response.status}`)
      ids.push(((await response.json()) as { record: { id: string } }).record.id)
    }
    first = ids[0] ?? ''
    const reportResponse = await fetch(`${app.api}/api/records`, {
      method: 'POST', headers, body: JSON.stringify({ kind: 'report', title: 'Made-up touch report', data: {
        for: 'Made-up reader', date: '2026-11-15', blocks: [{ id: 'made-up-text', type: 'text',
          heading: 'Made-up section', text: MADE_UP_REPORT_TEXT }],
      } }),
    })
    if (!reportResponse.ok) throw new Error(`creating the made-up report returned ${reportResponse.status}`)
    report = ((await reportResponse.json()) as { record: { id: string } }).record.id
    for (const toId of ids.slice(1)) {
      const response = await fetch(`${app.api}/api/links`, {
        method: 'POST', headers, body: JSON.stringify({ fromId: first, toId, type: 'relates_to' }),
      })
      if (!response.ok) throw new Error(`linking the made-up modules returned ${response.status}`)
    }
  }, 300_000)

  afterAll(async () => { await app?.stop() }, 60_000)

  it('keeps the selection and updates the real menu when its end moves', async () => {
    const { t } = await import('../src/shared/i18n.ts')
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    try {
      // This Chromium is the file's own, so it stores Normal mode as the shared one does: see the helper.
      await (await import('./helpers.ts')).storeNormalModeWhereNothingIsStored(phone)
      await phone.addInitScript(() => localStorage.setItem('mole-office.detail.reportContent', 'full'))
      const view = await phone.newPage()
      await view.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
      const words = view.locator('[data-text-field="data.blocks[#made-up-text].text"]').first()
      await words.waitFor({ timeout: 60_000 })
      await words.scrollIntoViewIfNeeded()
      const at = await words.evaluate(el => {
        const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
        if (!node) throw new Error('the made-up text is missing')
        const range = document.createRange()
        range.setStart(node, 0); range.setEnd(node, 7)
        const box = range.getBoundingClientRect()
        return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
      })
      const cdp = await phone.newCDPSession(view)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
      await wait(650)
      expect(await view.locator('.px-talk').count(), 'the menu opened before the lift').toBe(0)
      await words.evaluate(el => {
        const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
        if (!node) throw new Error('the made-up text is missing')
        window.getSelection()?.setBaseAndExtent(node, 0, node, 7)
      })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await view.locator('.px-talk').waitFor({ state: 'visible', timeout: 10_000 })
      expect(await view.evaluate(() => String(window.getSelection()))).toBe(MADE_UP_REPORT_TEXT.slice(0, 7))
      const instruction = view.locator('.px-talk textarea').first()
      expect(await instruction.evaluate(el => document.activeElement === el)).toBe(false)
      await expect.poll(() => view.locator('.px-talk-chip-what').textContent()).toContain(MADE_UP_REPORT_TEXT.slice(0, 7))
      expect(await view.locator('.px-talk').getByText(t('talk.state.notOnThisPage'), { exact: true }).count(), 'the quote is on this page').toBe(0)
      await words.evaluate(el => {
        const range = window.getSelection()?.getRangeAt(0)
        if (!range) throw new Error('made-up selection missing')
        const box = range.getBoundingClientRect()
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: box.left + 1, clientY: box.top + 1 }))
      })
      await wait(150)
      expect(await view.locator('.px-talk').count(), 'the selected text press closed the menu').toBe(1)
      const instructionText = 'Made-up instruction'
      await instruction.fill(instructionText)
      await words.evaluate(el => {
        const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
        if (!node) throw new Error('the made-up text is missing')
        window.getSelection()?.setBaseAndExtent(node, 0, node, 13)
      })
      await expect.poll(() => view.locator('.px-talk-chip-what').textContent()).toContain(MADE_UP_REPORT_TEXT.slice(0, 13))
      expect(await view.locator('.px-talk').getByText(t('talk.state.notOnThisPage'), { exact: true }).count(), 'the adjusted quote is on this page').toBe(0)
      expect(await instruction.inputValue()).toBe(instructionText)
      await instruction.tap()
      expect(await instruction.evaluate(el => document.activeElement === el)).toBe(true)
      await view.locator('.px-talk-close').click()
      await view.locator('.px-talk').waitFor({ state: 'hidden' })
      await view.evaluate(() => window.getSelection()?.removeAllRanges())
      await words.click({ button: 'right' })
      await view.locator('.px-talk').waitFor({ state: 'visible' })
      await expect.poll(() => view.locator('.px-talk textarea').first().evaluate(el => document.activeElement === el)).toBe(true)
      await cdp.detach()
    } finally {
      await phone.close()
    }
  }, 120_000)

  it('still closes for an outside touch without a selection and for a mouse press on selected text', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    try {
      // This Chromium is the file's own, so it stores Normal mode as the shared one does: see the helper.
      await (await import('./helpers.ts')).storeNormalModeWhereNothingIsStored(phone)
      await phone.addInitScript(() => localStorage.setItem('mole-office.detail.reportContent', 'full'))
      const view = await phone.newPage()
      for (const pointerType of ['touch', 'mouse'] as const) {
        await view.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
        const words = view.locator('[data-text-field="data.blocks[#made-up-text].text"]').first()
        await words.waitFor({ timeout: 60_000 }); await words.scrollIntoViewIfNeeded()
        const at = await words.evaluate(el => {
          const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
          if (!node) throw new Error('the made-up text is missing')
          const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 7)
          const box = range.getBoundingClientRect()
          return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
        })
        const cdp = await phone.newCDPSession(view)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }); await wait(650)
        await words.evaluate(el => {
          const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()
          if (!node) throw new Error('the made-up text is missing')
          window.getSelection()?.setBaseAndExtent(node, 0, node, 7)
        })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach()
        await view.locator('.px-talk').waitFor({ state: 'visible' })
        if (pointerType === 'touch') await view.evaluate(() => window.getSelection()?.removeAllRanges())
        await words.evaluate((el, { pointerType, at }) => {
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType, clientX: at.x, clientY: at.y }))
        }, { pointerType, at })
        await view.locator('.px-talk').waitFor({ state: 'hidden', timeout: 10_000 })
      }
    } finally {
      await phone.close()
    }
  }, 120_000)

  it('still picks up and moves a card', async () => {
    const { waitForThePage } = await import('./helpers.ts')
    const { theDrawingHasSettled } = await import('./the-drawing-has-settled.ts')
    const { t } = await import('../src/shared/i18n.ts')
    await drawing.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
    await waitForThePage(drawing, 60_000)
    await drawing.getByRole('button', { name: t('g7b.model.graph') }).first().click()
    await drawing.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
    await theDrawingHasSettled(drawing)
    const relativePlace = async () => drawing.evaluate((id) => {
      const cards = [...document.querySelectorAll('.gx-card')]
      const card = cards.find((one) => (one.getAttribute('data-target') ?? '').startsWith(`record/${id}/`))
      if (!card || cards.length < 2) throw new Error('the made-up cards are not drawn')
      const boxes = cards.map((one) => one.getBoundingClientRect())
      const box = card.getBoundingClientRect()
      return { x: box.x - boxes.reduce((sum, one) => sum + one.x, 0) / boxes.length,
        y: box.y - boxes.reduce((sum, one) => sum + one.y, 0) / boxes.length }
    }, first)
    const at = await drawing.evaluate((id) => {
      const card = document.querySelector(`.gx-card[data-target^="record/${id}/"]`)
      if (!card) throw new Error('the made-up card is missing')
      const box = card.getBoundingClientRect()
      const controls = [...card.querySelectorAll('button, a, .gx-grip')].map((one) => one.getBoundingClientRect())
      let best: { x: number; y: number; clear: number } | null = null
      for (let y = box.top + 3; y < box.bottom - 2; y += 2) for (let x = box.left + 3; x < box.right - 2; x += 2) {
        if (document.elementFromPoint(x, y) !== card) continue
        let clear = Math.min(x - box.left, box.right - x, y - box.top, box.bottom - y)
        for (const control of controls) clear = Math.min(clear, Math.hypot(Math.max(control.left - x, 0, x - control.right), Math.max(control.top - y, 0, y - control.bottom)))
        if (!best || clear > best.clear) best = { x, y, clear }
      }
      if (!best || best.clear < 12) throw new Error('the card has no clear point for a finger')
      return { x: Math.round(best.x), y: Math.round(best.y) }
    }, first)
    const before = await relativePlace()
    const cdp = await drawing.context().newCDPSession(drawing)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] })
    await drawing.waitForSelector('[data-picked-up="1"]', { timeout: 5_000 })
    expect(await drawing.locator('.px-talk').count(), 'the menu opened over the held card').toBe(0)
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x + 70 * step / 4, y: at.y + 90 * step / 4 }] })
      await wait(50)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await theDrawingHasSettled(drawing)
    const after = await relativePlace()
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y), 'the card did not move').toBeGreaterThan(60)
  }, 240_000)
})
