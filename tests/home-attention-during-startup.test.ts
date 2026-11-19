// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { IDENTITY_REFUSAL_CODES } from '../src/shared/refusal-codes.ts'
import { enWave13s } from '../src/shared/words/en-wave-13s.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'home-attention-startup', workspace: 'default', viewport: { width: 1440, height: 900 }, theDevServerBecause: 'This checks the browser startup sequence.' })
}, 180_000)

afterAll(async () => { await app?.stop() }, 180_000)

it('starts the shared attention read before the opening animation finishes', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    const state = { asked: false, askedAtFinish: false, finishing: false, release: () => {} }
    ;(window as unknown as { startupTest: typeof state }).startupTest = state
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
      if (url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home') state.asked = true
      return originalFetch(input, init)
    }
    let boot: { finish: () => Promise<void> } | undefined
    Object.defineProperty(window, 'moleBoot', {
      configurable: true,
      get: () => boot,
      set: (value: { finish: () => Promise<void> }) => {
        boot = value
        const finish = value.finish.bind(value)
        value.finish = () => {
          state.askedAtFinish = state.asked
          state.finishing = true
          return new Promise<void>((resolve) => { state.release = () => { void finish().then(resolve) } })
        }
      },
    })
  })
  const page = await context.newPage()
  const isHomeAttention = (url: string): boolean => {
    const parsed = new URL(url)
    return parsed.pathname === '/api/attention' && parsed.searchParams.get('shape') === 'home'
  }
  const asked: string[] = []
  let answered = false
  page.on('request', request => { if (isHomeAttention(request.url())) asked.push(request.url()) })
  // An ask still on its way when the context closes is let go; while the page is open its error still fails the run.
  page.on('response', response => { if (isHomeAttention(response.url())) void response.finished().then(() => { answered = true }, (error: unknown) => { if (!page.isClosed()) throw error }) })
  try {
    await page.goto(`${app.site}/?lang=en&look=light&mode=normal#/`, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => page.evaluate(() => (window as unknown as { startupTest: { finishing: boolean } }).startupTest.finishing), { timeout: 60_000 }).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { startupTest: { askedAtFinish: boolean } }).startupTest.askedAtFinish)).toBe(true)
    await expect.poll(() => answered, { timeout: 60_000 }).toBe(true)
    await page.evaluate(() => (window as unknown as { startupTest: { release: () => void } }).startupTest.release())
    await waitForThePage(page, 60_000)
    expect(asked.length).toBeGreaterThanOrEqual(1)
  } finally {
    await page.evaluate(() => (window as unknown as { startupTest?: { release: () => void } }).startupTest?.release()).catch(() => {})
    await context.close()
  }
}, 180_000)

it('asks again when the first answer is marked stale before the page mounts', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => {
    const state = { asked: false, askedAtFinish: false, finishing: false, release: () => {} }
    ;(window as unknown as { startupTest: typeof state }).startupTest = state
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
      if (url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home') state.asked = true
      return originalFetch(input, init)
    }
    let boot: { finish: () => Promise<void> } | undefined
    Object.defineProperty(window, 'moleBoot', {
      configurable: true,
      get: () => boot,
      set: (value: { finish: () => Promise<void> }) => {
        boot = value
        const finish = value.finish.bind(value)
        value.finish = () => {
          state.askedAtFinish = state.asked
          state.finishing = true
          return new Promise<void>((resolve) => { state.release = () => { void finish().then(resolve) } })
        }
      },
    })
  })
  const page = await context.newPage()
  const isHomeAttention = (url: string): boolean => {
    const parsed = new URL(url)
    return parsed.pathname === '/api/attention' && parsed.searchParams.get('shape') === 'home'
  }
  const asked: string[] = []
  let answered = false
  page.on('request', request => { if (isHomeAttention(request.url())) asked.push(request.url()) })
  // An ask still on its way when the context closes is let go; while the page is open its error still fails the run.
  page.on('response', response => { if (isHomeAttention(response.url())) void response.finished().then(() => { answered = true }, (error: unknown) => { if (!page.isClosed()) throw error }) })
  try {
    await page.goto(`${app.site}/?lang=en&look=light&mode=normal#/`, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => page.evaluate(() => (window as unknown as { startupTest: { finishing: boolean } }).startupTest.finishing), { timeout: 60_000 }).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { startupTest: { askedAtFinish: boolean } }).startupTest.askedAtFinish)).toBe(true)
    await expect.poll(() => answered, { timeout: 60_000 }).toBe(true)
    await page.evaluate(async () => {
      const modulePath = '/lib/pagecache.ts'
      const importModule = new Function('path', 'return import(path)') as (path: string) => Promise<{ markStale: (names: string[]) => void }>
      const pagecache = await importModule(modulePath)
      pagecache.markStale([])
    })
    await page.evaluate(() => (window as unknown as { startupTest: { release: () => void } }).startupTest.release())
    await waitForThePage(page, 60_000)
    await expect.poll(() => asked.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(2)
  } finally {
    await page.evaluate(() => (window as unknown as { startupTest?: { release: () => void } }).startupTest?.release()).catch(() => {})
    await context.close()
  }
}, 180_000)

it('reuses a current shared answer and reads again after changes, writes, or a project switch', async () => {
  const context = await app.browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(`${app.site}/#/`)
    await waitForThePage(page, 60_000)
    const result = await page.evaluate(async () => {
      const oneReadPath = '/lib/oneread.ts'
      const pagecachePath = '/lib/pagecache.ts'
      const importModule = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
      const { oneRead } = await importModule(oneReadPath) as {
        oneRead: <T>(load: () => Promise<T>, key: () => string) => {
          (): Promise<T>
          current(): Promise<T>
          written(): void
        }
      }
      const { markStale } = await importModule(pagecachePath) as { markStale: (names: string[]) => void }
      let project = 'first-project'
      let calls = 0
      let complete = (): void => { throw new Error('No read is waiting.') }
      const read = oneRead(() => {
        const answer = ++calls
        return new Promise<number>(resolve => { complete = () => resolve(answer) })
      }, () => project)
      const initial = read()
      const joining = read.current()
      const joinedWhileWaiting = initial === joining
      complete()
      const first = await initial
      const held = await read.current()
      const callsAfterHeld = calls
      markStale([])
      const afterChange = read.current()
      complete()
      const changed = await afterChange
      read.written()
      const afterWrite = read.current()
      complete()
      const written = await afterWrite
      project = 'second-project'
      const afterSwitch = read.current()
      complete()
      const switched = await afterSwitch
      project = 'first-project'
      const returned = await read.current()
      return { joinedWhileWaiting, first, held, callsAfterHeld, changed, written, switched, returned, calls }
    })
    expect(result).toEqual({ joinedWhileWaiting: true, first: 1, held: 1, callsAfterHeld: 1, changed: 2, written: 3, switched: 4, returned: 3, calls: 4 })
  } finally {
    await context.close()
  }
}, 180_000)

it('shows pairing after a refused early read and asks again after pairing', async () => {
  const context = await app.browser.newContext()
  await context.addInitScript(() => {
    const state = { asked: false, askedAtFinish: false, finishing: false, unhandled: 0, release: () => {} }
    ;(window as unknown as { startupTest: typeof state }).startupTest = state
    window.addEventListener('unhandledrejection', () => { state.unhandled += 1 })
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
      if (url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home') state.asked = true
      return originalFetch(input, init)
    }
    let boot: { finish: () => Promise<void> } | undefined
    Object.defineProperty(window, 'moleBoot', {
      configurable: true,
      get: () => boot,
      set: (value: { finish: () => Promise<void> }) => {
        boot = value
        const finish = value.finish.bind(value)
        value.finish = () => {
          state.askedAtFinish = state.asked
          state.finishing = true
          return new Promise<void>(resolve => { state.release = () => { void finish().then(resolve) } })
        }
      },
    })
  })
  const page = await context.newPage()
  const refusal = Object.keys(IDENTITY_REFUSAL_CODES)[0]!
  const sentence = enWave13s[`server.${refusal}` as keyof typeof enWave13s]
  let paired = false
  let homeReads = 0
  await page.route('**/api/attention?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('shape') !== 'home') return route.continue()
    homeReads += 1
    if (homeReads === 1) {
      const real = await route.fetch()
      await route.fulfill({ response: real, status: 403, json: { error: sentence, code: refusal, values: {} } })
      return
    }
    await route.continue()
  })
  await page.route('**/api/office/pairing', async route => {
    const real = await route.fetch()
    await route.fulfill({ response: real, status: 200, json: { paired, offered: false, mayAsk: false, waiting: null } })
  })
  try {
    await page.goto(`${app.site}/#/`)
    await expect.poll(() => page.evaluate(() => (window as unknown as { startupTest: { finishing: boolean } }).startupTest.finishing), { timeout: 60_000 }).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { startupTest: { askedAtFinish: boolean } }).startupTest.askedAtFinish)).toBe(true)
    await expect.poll(() => page.evaluate(async () => {
      const modulePath = '/lib/unpaired.ts'
      const importModule = new Function('path', 'return import(path)') as (path: string) => Promise<{ thisBrowserNeedsPairing: () => boolean }>
      const pairing = await importModule(modulePath)
      return pairing.thisBrowserNeedsPairing()
    }), { timeout: 60_000 }).toBe(true)
    await page.evaluate(() => (window as unknown as { startupTest: { release: () => void } }).startupTest.release())
    await page.locator('main.unpaired-page').waitFor({ timeout: 60_000 })
    expect(homeReads).toBe(1)
    expect(await page.evaluate(() => (window as unknown as { startupTest: { unhandled: number } }).startupTest.unhandled)).toBe(0)
    expect(await page.locator('.sidebar, .px-chat').count()).toBe(0)
    paired = true
    await Promise.all([page.waitForEvent('load'), page.locator('main.unpaired-page button').click()])
    await expect.poll(() => page.evaluate(() => (window as unknown as { startupTest: { finishing: boolean } }).startupTest.finishing), { timeout: 60_000 }).toBe(true)
    await page.evaluate(() => (window as unknown as { startupTest: { release: () => void } }).startupTest.release())
    await waitForThePage(page, 60_000)
    expect(homeReads).toBeGreaterThanOrEqual(2)
    expect(await page.locator('main.unpaired-page').count()).toBe(0)
  } finally {
    await context.close()
  }
}, 180_000)

it('starts attention during the opening only for Home', async () => {
  const askedBeforeFinish = async (hash: string): Promise<boolean> => {
    const context = await app.browser.newContext()
    await context.addInitScript(() => {
      const state = { asked: false, atFinish: false, finishing: false, release: () => {} }
      ;(window as unknown as { startupScopeTest: typeof state }).startupScopeTest = state
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
        if (url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home') state.asked = true
        return originalFetch(input, init)
      }
      let boot: { finish: () => Promise<void> } | undefined
      Object.defineProperty(window, 'moleBoot', {
        configurable: true,
        get: () => boot,
        set: (value: { finish: () => Promise<void> }) => {
          boot = value
          value.finish = () => {
            state.atFinish = state.asked
            state.finishing = true
            return new Promise<void>(resolve => { state.release = resolve })
          }
        },
      })
    })
    const page = await context.newPage()
    try {
      await page.goto(`${app.site}/${hash}`, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => page.evaluate(() => (window as unknown as { startupScopeTest: { finishing: boolean } }).startupScopeTest.finishing), { timeout: 60_000 }).toBe(true)
      return await page.evaluate(() => (window as unknown as { startupScopeTest: { atFinish: boolean } }).startupScopeTest.atFinish)
    } finally {
      await page.evaluate(() => (window as unknown as { startupScopeTest?: { release: () => void } }).startupScopeTest?.release()).catch(() => {})
      await context.close()
    }
  }

  expect(await askedBeforeFinish('#/')).toBe(true)
  expect(await askedBeforeFinish(`#/${THE_QUICK_NOTE_SEGMENT}`)).toBe(false)
}, 180_000)

interface HeldOpening { homeAsks: number; askedAtFinish: boolean; finishing: boolean }

/** Hold the opening's last frames until the test lets them play, and count the page's asks for Home's attention. */
async function holdTheOpening(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const state = { homeAsks: 0, askedAtFinish: false, finishing: false, release: () => {} }
    ;(window as unknown as { heldOpening: typeof state }).heldOpening = state
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
      if (url.pathname === '/api/attention' && url.searchParams.get('shape') === 'home') state.homeAsks += 1
      return originalFetch(input, init)
    }
    let boot: { finish: () => Promise<void> } | undefined
    Object.defineProperty(window, 'moleBoot', {
      configurable: true,
      get: () => boot,
      set: (value: { finish: () => Promise<void> }) => {
        boot = value
        const finish = value.finish.bind(value)
        value.finish = () => {
          state.askedAtFinish = state.homeAsks > 0
          state.finishing = true
          return new Promise<void>(resolve => { state.release = () => { void finish().then(resolve) } })
        }
      },
    })
  })
}

const theHeldOpening = (page: Page): Promise<HeldOpening> => page.evaluate(() => {
  const { homeAsks, askedAtFinish, finishing } = (window as unknown as { heldOpening: HeldOpening }).heldOpening
  return { homeAsks, askedAtFinish, finishing }
})

const letTheOpeningPlay = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { heldOpening: { release: () => void } }).heldOpening.release())

it('asks attention again when Home is drawn again after the quick note in one page load', async () => {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await holdTheOpening(context)
  const page = await context.newPage()
  try {
    await page.goto(`${app.site}/?lang=en&look=light&mode=normal#/`, { waitUntil: 'domcontentloaded' })
    await expect.poll(async () => (await theHeldOpening(page)).finishing, { timeout: 60_000 }).toBe(true)
    expect((await theHeldOpening(page)).askedAtFinish).toBe(true)
    await letTheOpeningPlay(page)
    await waitForThePage(page, 60_000)
    await page.evaluate(() => { (window as unknown as { theSamePageLoad: boolean }).theSamePageLoad = true })
    await page.evaluate((segment) => { window.location.hash = `#/${segment}` }, THE_QUICK_NOTE_SEGMENT)
    await waitForThePage(page, 60_000)
    expect(await page.locator('.sidebar').count()).toBe(0)
    const asksBeforeHome = (await theHeldOpening(page)).homeAsks
    await page.evaluate(() => { window.location.hash = '#/' })
    await waitForThePage(page, 60_000)
    expect((await theHeldOpening(page)).homeAsks).toBeGreaterThan(asksBeforeHome)
    expect(await page.evaluate(() => (window as unknown as { theSamePageLoad?: boolean }).theSamePageLoad)).toBe(true)
  } finally {
    await letTheOpeningPlay(page).catch(() => {})
    await context.close()
  }
}, 180_000)

it('draws the pairing page and keeps no answer when the page is not paired', async () => {
  const context = await app.browser.newContext()
  await holdTheOpening(context)
  const page = await context.newPage()
  const refusal = Object.keys(IDENTITY_REFUSAL_CODES)[0]!
  const sentence = enWave13s[`server.${refusal}` as keyof typeof enWave13s]
  await page.route('**/api/attention?**', async route => {
    if (new URL(route.request().url()).searchParams.get('shape') !== 'home') return route.continue()
    const real = await route.fetch()
    await route.fulfill({ response: real, status: 403, json: { error: sentence, code: refusal, values: {} } })
  })
  await page.route('**/api/office/pairing', async route => {
    const real = await route.fetch()
    await route.fulfill({ response: real, status: 200, json: { paired: false, offered: false, mayAsk: false, waiting: null } })
  })
  try {
    await page.goto(`${app.site}/#/`)
    await expect.poll(async () => (await theHeldOpening(page)).finishing, { timeout: 60_000 }).toBe(true)
    expect((await theHeldOpening(page)).askedAtFinish).toBe(true)
    await expect.poll(() => page.evaluate(async () => {
      const importModule = new Function('path', 'return import(path)') as (path: string) => Promise<{ thisBrowserNeedsPairing: () => boolean }>
      return (await importModule('/lib/unpaired.ts')).thisBrowserNeedsPairing()
    }), { timeout: 60_000 }).toBe(true)
    await letTheOpeningPlay(page)
    await page.locator('main.unpaired-page').waitFor({ timeout: 60_000 })
    expect(await page.locator('.sidebar, .px-chat').count()).toBe(0)
    const kept = await page.evaluate(async () => {
      const importModule = new Function('path', 'return import(path)') as (path: string) => Promise<{ readAttentionHomeOnce: { held: () => unknown } }>
      return (await importModule('/lib/oneread.ts')).readAttentionHomeOnce.held() !== undefined
    })
    expect(kept).toBe(false)
  } finally {
    await letTheOpeningPlay(page).catch(() => {})
    await context.close()
  }
}, 180_000)
