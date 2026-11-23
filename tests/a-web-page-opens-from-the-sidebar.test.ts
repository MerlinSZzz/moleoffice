// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WEB PAGE OPENS FROM THE SIDEBAR (wave 13t, package OT-B): the form, the box the window draws the page over, and
 * its bar, exercised in Chromium on a made-up office.
 *
 *   - IN A BROWSER the form says this is a feature of the desktop app, asks for no place, and opens the address in a
 *     new tab within the press. A blocked tab is said, and an address the window would refuse opens nothing.
 *   - IN THE WINDOW WITH NO BRIDGE the form says so, and opens nothing.
 *   - IN THE WINDOW WITH A BRIDGE the bridge is a stand-in that keeps every call, since this test has no window to
 *     draw a page. The form asks for the place; the box takes it and tells the bridge where it is; the bar's presses
 *     reach the bridge; the box stays over a change of route; an office layer over it hides the page and shows its
 *     address; what the window said and a download's question are drawn with their presses; and the office is sent
 *     none of the addresses typed.
 *
 * window.open is stood in too, so no real tab is ever opened.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_SYSTEM_MARK, THE_WINDOW_MARK } from '../src/config/the-window-mark.mjs'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'

const THE_PRESS = '#shell-side [data-target="uiSurface/rail.webpage"]'
const NEW_NOTE = '#shell-side [data-target="uiSurface/rail.quicknote"]'
const MY_NOTES = '#shell-side [data-target="uiSurface/rail.mynotes"]'
const THE_FORM = 'dialog.wp-form'
const THE_BOX = 'section.wp-box'

let app: LiveApp
let theBrowsersUserAgent = ''

/** One call of window.open: the address, the target, and whether the press that made it was still being handled. */
type Opening = { url: string; target: string; inAClick: boolean }
/** The stand-in bridge's record, kept on the page. */
type StandIn = {
  calls: unknown[][]
  state: Record<string, unknown>
  listener: ((state: unknown) => void) | null
  say(state: Record<string, unknown>): void
}

/**
 * WINDOW.OPEN, STOOD IN, SO NO TAB IS EVER OPENED. Each call is kept. While `theTabIsBlocked` is set the call answers
 * null, which is what a blocked tab gives the page. Otherwise it answers a made-up tab, kept, whose opener the page
 * is expected to clear.
 */
async function watchTheOpenings(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const kept = window as unknown as { theOpenings: Opening[]; theTabIsBlocked: boolean; theTabs: { opener: unknown }[] }
    kept.theOpenings = []
    kept.theTabs = []
    kept.theTabIsBlocked = false
    window.open = (url?: string | URL, target?: string) => {
      kept.theOpenings.push({ url: String(url ?? ''), target: target ?? '', inAClick: window.event?.type === 'click' || window.event?.type === 'submit' })
      if (kept.theTabIsBlocked) return null
      const tab = { opener: 'the office page' }
      kept.theTabs.push(tab)
      return tab as unknown as Window
    }
  })
}

/**
 * THE WINDOW'S BRIDGE, STOOD IN, in the shape src/desktop/preload.cjs gives it. Every call is kept. Open answers as the
 * window does, by saying the page is open where it was asked for; close says it is closed.
 */
async function standInTheBridge(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const kept = window as unknown as { theStandIn: StandIn; theWindowsWebPage: unknown }
    const standIn: StandIn = {
      calls: [],
      state: { open: false, said: null, asked: null },
      listener: null,
      say(state) {
        standIn.state = state
        standIn.listener?.(state)
      },
    }
    kept.theStandIn = standIn
    const called = (...call: unknown[]) => { standIn.calls.push(call) }
    const yes = (...call: unknown[]) => {
      called(...call)
      return Promise.resolve(true)
    }
    kept.theWindowsWebPage = {
      read: () => {
        called('read')
        return Promise.resolve(standIn.state)
      },
      open: (asked: { address: string; place: string }) => {
        called('open', asked)
        standIn.say({ open: true, address: asked.address, place: asked.place, title: '', canGoBack: false, canGoForward: false, loading: false, said: null, asked: null })
        return Promise.resolve(true)
      },
      place: (box: unknown) => yes('place', box),
      hide: () => yes('hide'),
      show: () => yes('show'),
      back: () => yes('back'),
      forward: () => yes('forward'),
      reload: () => yes('reload'),
      openOutside: () => yes('openOutside'),
      close: () => {
        called('close')
        standIn.say({ open: false, said: null, asked: null })
        return Promise.resolve(true)
      },
      answerDownload: (answer: unknown) => yes('answerDownload', answer),
      onChange: (then: (state: unknown) => void) => {
        called('onChange')
        standIn.listener = then
      },
    }
  })
}

const theOpenings = (page: Page): Promise<Opening[]> => page.evaluate(() => (window as unknown as { theOpenings: Opening[] }).theOpenings)
const theCalls = (page: Page): Promise<unknown[][]> => page.evaluate(() => (window as unknown as { theStandIn: StandIn }).theStandIn.calls)
const theCallsNamed = async (page: Page, name: string): Promise<unknown[][]> => (await theCalls(page)).filter((call) => call[0] === name)
const sayToTheBox = (page: Page, state: Record<string, unknown>) =>
  page.evaluate((said) => { (window as unknown as { theStandIn: StandIn }).theStandIn.say(said) }, state)

async function go(page: Page, hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/**
 * A fresh context at 1440 by 900: the light look, the chat shut and the sidebar wide, then window.open stood in, and
 * the bridge as well when asked. `theWindow` gives it the window's marks in its user agent.
 */
async function aWindow(as: { theWindow?: boolean; aBridge?: boolean } = {}): Promise<{ context: BrowserContext; page: Page; sent: string[] }> {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(as.theWindow === true ? { userAgent: `${theBrowsersUserAgent} ${THE_WINDOW_MARK} ${THE_SYSTEM_MARK}linux` } : {}),
  })
  await context.addInitScript(({ key }) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, 'expanded')
  }, { key: SIDEBAR_KEY })
  await openRecordPagesAt(context, 'full')
  await watchTheOpenings(context)
  if (as.aBridge === true) await standInTheBridge(context)
  const page = await context.newPage()
  // EVERYTHING THE PAGE SENDS THE OFFICE, so the test can say no web address was in any of it.
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith(app.site) || request.url().startsWith(app.api)) sent.push(`${request.url()} ${request.postData() ?? ''}`)
  })
  return { context, page, sent }
}

/** Press the sidebar's Web page row, and wait for the form. */
async function openTheForm(page: Page) {
  await page.locator(THE_PRESS).click()
  const form = page.locator(THE_FORM)
  await form.waitFor({ timeout: 20_000 })
  return form
}

const theAddressField = (page: Page) => page.locator(THE_FORM).getByLabel(sayInEnglish('webPage.form.address'), { exact: true })
const whatItOpens = (page: Page) => page.locator(`${THE_FORM} [data-part="opens"]`)

beforeAll(async () => {
  app = await liveApp({ name: 'web-page', viewport: { width: 1440, height: 900 } })
  theBrowsersUserAgent = await app.page.evaluate(() => navigator.userAgent)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('in a browser', () => {
  it('is a row after New note, whose form says it is the desktop app’s and opens a new tab within the press', async () => {
    const { context, page, sent } = await aWindow()
    try {
      await go(page, '/')
      const press = page.locator(THE_PRESS)
      await press.waitFor({ timeout: 30_000 })
      expect(await press.innerText()).toContain(sayInEnglish('nav.webPage'))
      const order = await page.evaluate(() => [...document.querySelectorAll('#shell-side [data-target]')].map((one) => one.getAttribute('data-target')))
      expect(order.indexOf('uiSurface/rail.webpage'), 'right after New note').toBe(order.indexOf('uiSurface/rail.quicknote') + 1)
      expect(await page.locator(NEW_NOTE).count()).toBe(1)
      const form = await openTheForm(page)
      expect(await form.getAttribute('data-opens')).toBe('tab')
      expect(await form.innerText()).toContain(sayInEnglish('webPage.form.desktopOnly'))
      expect(await form.locator('.wp-form-places').count(), 'a browser asks for no place').toBe(0)
      await theAddressField(page).fill('example.com')
      expect(await whatItOpens(page).innerText()).toBe(sayInEnglish('webPage.form.opens', { address: 'https://example.com/' }))
      const before = new URL(page.url()).hash
      await form.getByRole('button', { name: sayInEnglish('webPage.form.openInATab'), exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 10_000 })
      expect(await theOpenings(page)).toEqual([{ url: 'https://example.com/', target: '_blank', inAClick: true }])
      expect(await page.evaluate(() => (window as unknown as { theTabs: { opener: unknown }[] }).theTabs), 'the tab is not given this page').toEqual([{ opener: null }])
      expect(new URL(page.url()).hash, 'the office page stays where it was').toBe(before)
      expect(context.pages()).toHaveLength(1)
      expect(sent.filter((one) => one.includes('example.com')), 'the office is sent no web address').toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('says a blocked tab, and keeps the form', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      await theAddressField(page).fill('https://example.com/a')
      await page.evaluate(() => { (window as unknown as { theTabIsBlocked: boolean }).theTabIsBlocked = true })
      await form.getByRole('button', { name: sayInEnglish('webPage.form.openInATab'), exact: true }).click()
      await form.locator('.wp-form-failed[role="alert"]', { hasText: sayInEnglish('webPage.form.tabBlocked') }).waitFor({ timeout: 10_000 })
      expect(await theOpenings(page)).toHaveLength(1)
      expect(await form.isVisible()).toBe(true)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('opens nothing for no address, or one the window would refuse, and says why', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      const open = form.getByRole('button', { name: sayInEnglish('webPage.form.openInATab'), exact: true })
      expect(await open.getAttribute('aria-disabled'), 'with no address').toBe('true')
      for (const [typed, why] of [
        ['localhost:3000', 'webPage.refused.loopback'],
        ['http://127.0.0.1:9/', 'webPage.refused.loopback'],
        [app.site, 'webPage.refused.the-office'],
        ['file:///etc/hosts', 'webPage.refused.scheme'],
      ] as const) {
        await theAddressField(page).fill(typed)
        expect(await whatItOpens(page).innerText(), typed).toBe(sayInEnglish(why))
        expect(await open.getAttribute('aria-disabled'), typed).toBe('true')
        await open.dispatchEvent('click')
        await form.locator('.px-why', { hasText: sayInEnglish(why) }).waitFor({ timeout: 10_000 })
      }
      expect(await theOpenings(page)).toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)
})

describe('in the window app with no bridge', () => {
  it('says the window gave the page no bridge, and opens nothing', async () => {
    const { context, page } = await aWindow({ theWindow: true })
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      expect(await form.getAttribute('data-opens')).toBe('window')
      await form.locator('[role="alert"]', { hasText: sayInEnglish('webPage.form.noBridge') }).waitFor({ timeout: 10_000 })
      await theAddressField(page).fill('https://example.com/')
      const open = form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true })
      expect(await open.getAttribute('aria-disabled')).toBe('true')
      await open.dispatchEvent('click')
      expect(await theOpenings(page)).toEqual([])
      expect(await page.locator(THE_BOX).count()).toBe(0)
    } finally {
      await context.close()
    }
  }, 180_000)
})

describe('in the window app with a bridge', () => {
  it('opens the page where it was asked for, tells the bridge where the box is, and keeps it over a change of route', async () => {
    const { context, page, sent } = await aWindow({ theWindow: true, aBridge: true })
    try {
      await go(page, '/')
      await expect.poll(() => theCallsNamed(page, 'read'), { timeout: 20_000 }).toHaveLength(1)
      expect(await page.locator(THE_BOX).count(), 'no page is open').toBe(0)
      const form = await openTheForm(page)
      const places = form.locator('.wp-form-places input[type="radio"]')
      expect(await places.count()).toBe(3)
      expect(await form.getByRole('radio', { name: sayInEnglish('webPage.place.right'), exact: true }).isChecked(), 'the right column first').toBe(true)
      await form.getByRole('radio', { name: sayInEnglish('webPage.place.left'), exact: true }).check()
      await theAddressField(page).fill('https://example.com')
      await form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true }).click()
      await form.waitFor({ state: 'detached', timeout: 10_000 })
      expect(await theCallsNamed(page, 'open')).toEqual([['open', { address: 'https://example.com/', place: 'left' }]])
      const box = page.locator(`${THE_BOX}[data-place="left"]`)
      await box.waitFor({ timeout: 10_000 })
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-web-page'))).toBe('left')
      expect(await box.getByRole('textbox', { name: sayInEnglish('webPage.bar.address'), exact: true }).inputValue()).toBe('https://example.com/')
      const drawn = await box.boundingBox()
      const main = await page.locator('#main').boundingBox()
      if (drawn === null || main === null) throw new Error('the box or the page is not drawn')
      expect(drawn.x + drawn.width, 'the box is left of the page').toBeLessThanOrEqual(main.x + 1)
      await expect.poll(async () => (await theCallsNamed(page, 'show')).length, { timeout: 10_000 }).toBeGreaterThan(0)
      const placed = (await theCallsNamed(page, 'place')).at(-1)?.[1] as { x: number; y: number; width: number; height: number } | undefined
      const area = await box.locator('.wp-area').boundingBox()
      if (placed === undefined || area === null) throw new Error('the box was not placed')
      expect(Math.abs(placed.x - area.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.y - area.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(placed.width - area.width)).toBeLessThanOrEqual(1)
      expect(placed.height).toBeGreaterThan(0)
      const before = new URL(page.url()).hash
      await page.locator(MY_NOTES).click()
      await page.waitForFunction((was) => window.location.hash !== was, before, { timeout: 10_000 })
      await waitForThePage(page, 60_000)
      expect(await box.count(), 'the box stays over a change of route').toBe(1)
      expect(await theCallsNamed(page, 'open'), 'and the page is not opened again').toHaveLength(1)
      expect(sent.filter((one) => one.includes('example.com')), 'the office is sent no web address').toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('gives the body to the page, and the office page back when it is closed', async () => {
    const { context, page } = await aWindow({ theWindow: true, aBridge: true })
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      await form.getByRole('radio', { name: sayInEnglish('webPage.place.body'), exact: true }).check()
      await theAddressField(page).fill('https://example.com/')
      await form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true }).click()
      const box = page.locator(`${THE_BOX}[data-place="body"]`)
      await box.waitFor({ timeout: 10_000 })
      await expect.poll(() => page.locator('#main').isVisible(), { timeout: 10_000 }).toBe(false)
      await box.getByRole('button', { name: sayInEnglish('webPage.bar.close'), exact: true }).click()
      await box.waitFor({ state: 'detached', timeout: 10_000 })
      expect(await theCallsNamed(page, 'close')).toHaveLength(1)
      await expect.poll(() => page.locator('#main').isVisible(), { timeout: 10_000 }).toBe(true)
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-web-page'))).toBe(false)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('sends the bar’s presses to the bridge, and refuses an address the window would refuse', async () => {
    const { context, page } = await aWindow({ theWindow: true, aBridge: true })
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      await theAddressField(page).fill('https://example.com/')
      await form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true }).click()
      const box = page.locator(`${THE_BOX}[data-place="right"]`)
      await box.waitFor({ timeout: 10_000 })
      const back = box.getByRole('button', { name: sayInEnglish('webPage.bar.back'), exact: true })
      expect(await back.getAttribute('aria-disabled'), 'there is no earlier page').toBe('true')
      await back.dispatchEvent('click')
      await box.locator('.px-why', { hasText: sayInEnglish('webPage.bar.noEarlier') }).waitFor({ timeout: 10_000 })
      expect(await theCallsNamed(page, 'back')).toEqual([])
      await sayToTheBox(page, { open: true, address: 'https://example.com/', place: 'right', title: 'Made-up title', canGoBack: true, canGoForward: true, loading: true, said: null, asked: null })
      await box.locator('.wp-state[role="status"]', { hasText: sayInEnglish('webPage.bar.loading') }).waitFor({ timeout: 10_000 })
      await back.click()
      await box.getByRole('button', { name: sayInEnglish('webPage.bar.forward'), exact: true }).click()
      await box.getByRole('button', { name: sayInEnglish('webPage.bar.reload'), exact: true }).click()
      await box.getByRole('button', { name: sayInEnglish('webPage.bar.outside'), exact: true }).click()
      await expect.poll(async () => (await theCalls(page)).map((call) => call[0]).filter((name) => ['back', 'forward', 'reload', 'openOutside'].includes(String(name))), { timeout: 10_000 })
        .toEqual(['back', 'forward', 'reload', 'openOutside'])
      const address = box.getByRole('textbox', { name: sayInEnglish('webPage.bar.address'), exact: true })
      await address.fill('http://127.0.0.1:9/')
      await address.press('Enter')
      await box.locator('.wp-said[role="alert"]', { hasText: sayInEnglish('webPage.refused.loopback') }).waitFor({ timeout: 10_000 })
      expect(await theCallsNamed(page, 'open'), 'a refused address is not asked of the window').toHaveLength(1)
      await address.fill('example.org')
      await address.press('Enter')
      await expect.poll(() => theCallsNamed(page, 'open'), { timeout: 10_000 }).toEqual([
        ['open', { address: 'https://example.com/', place: 'right' }],
        ['open', { address: 'https://example.org/', place: 'right' }],
      ])
      expect(await theOpenings(page), 'the window opens no tab').toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('hides the page while an office layer is over it, and shows its address instead', async () => {
    const { context, page } = await aWindow({ theWindow: true, aBridge: true })
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      await theAddressField(page).fill('https://example.com/')
      await form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true }).click()
      const area = page.locator(`${THE_BOX} .wp-area`)
      await expect.poll(() => area.getAttribute('data-hidden'), { timeout: 10_000 }).toBe('no')
      const hiddenBefore = (await theCallsNamed(page, 'hide')).length
      const shownBefore = (await theCallsNamed(page, 'show')).length
      const again = await openTheForm(page)
      await expect.poll(() => area.getAttribute('data-hidden'), { timeout: 10_000 }).toBe('yes')
      expect((await theCallsNamed(page, 'hide')).length).toBeGreaterThan(hiddenBefore)
      expect(await area.locator('.wp-hidden').innerText()).toContain(sayInEnglish('webPage.bar.hidden'))
      expect(await area.locator('.wp-hidden-address').innerText()).toBe('https://example.com/')
      expect(await theAddressField(page).inputValue(), 'the form opened again holds the open page').toBe('https://example.com/')
      await again.getByRole('button', { name: sayInEnglish('webPage.form.cancel'), exact: true }).click()
      await again.waitFor({ state: 'detached', timeout: 10_000 })
      await expect.poll(() => area.getAttribute('data-hidden'), { timeout: 10_000 }).toBe('no')
      expect((await theCallsNamed(page, 'show')).length).toBeGreaterThan(shownBefore)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('draws what the window said, and a download’s question with its two presses', async () => {
    const { context, page } = await aWindow({ theWindow: true, aBridge: true })
    try {
      await go(page, '/')
      const form = await openTheForm(page)
      await theAddressField(page).fill('https://example.com/')
      await form.getByRole('button', { name: sayInEnglish('webPage.form.open'), exact: true }).click()
      const box = page.locator(THE_BOX)
      await box.waitFor({ timeout: 10_000 })
      const open = { open: true, address: 'https://example.com/', place: 'right', title: '', canGoBack: false, canGoForward: false, loading: false }
      await sayToTheBox(page, { ...open, said: { refused: 'loopback', address: 'http://localhost:3000/' }, asked: null })
      await box.locator('.wp-said[role="status"]', {
        hasText: sayInEnglish('webPage.said.refused', { address: 'http://localhost:3000/', why: sayInEnglish('webPage.refused.loopback') }),
      }).waitFor({ timeout: 10_000 })
      await sayToTheBox(page, {
        ...open,
        said: { download: 'saved', name: 'report.pdf', path: '/made-up/Downloads/report.pdf' },
        asked: { id: 3, name: 'other.zip', from: 'https://example.com/other.zip' },
      })
      await box.locator('.wp-said', { hasText: sayInEnglish('webPage.said.saved', { path: '/made-up/Downloads/report.pdf' }) }).waitFor({ timeout: 10_000 })
      const asks = box.getByRole('group', { name: sayInEnglish('webPage.download.asks', { name: 'other.zip' }), exact: true })
      expect(await asks.innerText()).toContain(sayInEnglish('webPage.download.from', { address: 'https://example.com/other.zip' }))
      await asks.getByRole('button', { name: sayInEnglish('webPage.download.save'), exact: true }).click()
      await asks.getByRole('button', { name: sayInEnglish('webPage.download.dontSave'), exact: true }).click()
      await expect.poll(() => theCallsNamed(page, 'answerDownload'), { timeout: 10_000 }).toEqual([
        ['answerDownload', { id: 3, save: true }],
        ['answerDownload', { id: 3, save: false }],
      ])
      await sayToTheBox(page, { ...open, said: { download: 'not-saved', name: 'other.zip' }, asked: null })
      await box.locator('.wp-said', { hasText: sayInEnglish('webPage.said.notSaved', { name: 'other.zip' }) }).waitFor({ timeout: 10_000 })
      expect(await box.locator('.wp-asks').count(), 'the question goes once it is answered').toBe(0)
    } finally {
      await context.close()
    }
  }, 180_000)
})
