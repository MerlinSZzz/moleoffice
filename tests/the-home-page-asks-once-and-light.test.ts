// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decision OQR0WDVq0FkP): Home asks one door
// for the pipelines that stand still, and the records list in Home's shape for no pipeline and no step.
// Before, Home asked the records list in Home's shape once for the pipelines and once for the blocks.
/** Home reuses reads under StrictMode and asks its approved page data once per project. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Request } from 'playwright'
import type { ReadInFlight } from '../src/web/components/ui.tsx'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page
let readOnce: typeof import('../src/web/components/ui.tsx').readOnce
let sameReadDeps: typeof import('../src/web/components/ui.tsx').sameReadDeps

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const ui = await import('../src/web/components/ui.tsx')
  readOnce = ui.readOnce
  sameReadDeps = ui.sameReadDeps
})

describe('readOnce meets React StrictMode', () => {
  it('reuses the first request when StrictMode runs the same effect twice', async () => {
    let calls = 0
    const held: { current: ReadInFlight<number> | null } = { current: null }
    const load = (): Promise<number> => { calls += 1; return Promise.resolve(calls) }
    const deps = ['the project', 0]
    const first = readOnce(held, deps, load)
    const second = readOnce(held, deps, load)
    expect(calls).toBe(1)
    expect(second).toBe(first)
    await expect(second).resolves.toBe(1)
  })

  it('starts a fresh request when dependencies changed', async () => {
    let calls = 0
    const held: { current: ReadInFlight<number> | null } = { current: null }
    const load = (): Promise<number> => { calls += 1; return Promise.resolve(calls) }
    const first = readOnce(held, ['one project'], load)
    const second = readOnce(held, ['another project'], load)
    expect(calls).toBe(2)
    await expect(first).resolves.toBe(1)
    await expect(second).resolves.toBe(2)
  })

})

beforeAll(async () => {
  app = await liveApp({ name: 'home-asks-new-sections-once', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
})

afterAll(async () => { await app?.stop() })

async function loadHome(): Promise<{ url: string; headers: Record<string, string> }[]> {
  const seen: { url: string; headers: Record<string, string> }[] = []
  const watch = (request: Request): void => {
    if (request.url().includes('/api/')) seen.push({ url: request.url(), headers: request.headers() })
  }
  page.on('request', watch)
  try {
    await page.goto(`${app.site}/?home-read=${String(Date.now())}#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    // THE PROJECT CARDS ARE ON THEIR OWN PAGE SINCE A DECISION. Agents at work is
    // Home's last section.
    await page.locator('[data-home-section="agents"]').waitFor()
    await page.waitForTimeout(500)
  } finally {
    page.removeListener('request', watch)
  }
  return seen
}

function pathOf(url: string): string { return new URL(url).pathname }
function queryOf(url: string, name: string): string | null { return new URL(url).searchParams.get(name) }

describe('Home reads its five sections once', () => {
  /**
   * MUTATION: render each project effect without its readOnce guard and React StrictMode duplicates
   * the page-specific attention and roster reads. Removing the section read also makes these
   * non-vacuous assertions fail. Needs you continues to share the frame's one GET /api/waiting.
   */
  it('reads waiting once, and attention and roster once for the current project', async () => {
    const asked = await loadHome()
    const waiting = asked.filter(one => pathOf(one.url) === '/api/waiting')
    expect(waiting).toHaveLength(1)

    const currentAttention = asked.filter(one => pathOf(one.url) === '/api/attention' && queryOf(one.url, 'shape') === 'home' && one.headers['x-mole-office-workspace'] === 'default')
    expect(currentAttention, 'the Home project attention reading was missing or duplicated').toHaveLength(1)
    expect(queryOf(currentAttention[0]!.url, 'machine')).toBe('omit')

    // AGENTS AT WORK READS THE ROSTER IN HOME'S SHAPE, the fields it draws, and never the whole roster
    // (round 31 of wave 13k: the whole roster was 681 KB for one project of a made-up office of the live shape).
    const currentRoster = asked.filter(one => pathOf(one.url) === '/api/working' && queryOf(one.url, 'only') === null && queryOf(one.url, 'shape') === 'home' && one.headers['x-mole-office-workspace'] === 'default')
    expect(currentRoster, 'the Agents at work reading was missing or duplicated').toHaveLength(1)
    expect(asked.filter(one => pathOf(one.url) === '/api/working' && queryOf(one.url, 'only') === null && queryOf(one.url, 'shape') === null), 'Home must not ask the whole roster').toEqual([])

    expect(asked.filter(one => pathOf(one.url) === '/api/records' && queryOf(one.url, 'shape') === null), 'Home must not ask the full record list').toEqual([])
    // PROBLEM dfi72F0VtyK5, case 1, kept from before the five-section Home: no session records.
    expect(asked.filter(one => pathOf(one.url) === '/api/records' && queryOf(one.url, 'kind') === 'session'), 'Home must not ask for the session records').toEqual([])
    // THIS PROJECT'S PIPELINES THAT STAND STILL, ONCE: Late or stuck asks the one door that answers them. It never asks
    // the records list for every pipeline or every step of the project.
    expect(asked.filter(one => pathOf(one.url) === '/api/records' && queryOf(one.url, 'shape') === 'home'), 'Home must not ask its pipelines and steps as whole kinds').toEqual([])
    const standingStill = asked.filter(one => pathOf(one.url) === '/api/pipelines/standing-still' && one.headers['x-mole-office-workspace'] === 'default')
    expect(standingStill, 'the pipelines standing still reading was missing or duplicated').toHaveLength(1)
    expect(asked.filter(one => pathOf(one.url) === '/api/planning/today')).toHaveLength(1)
    // THE WEEK IS NOT ASKED FOR. Home draws today only since a decision. The week's hours
    // are on the plan page.
    expect(asked.filter(one => pathOf(one.url).startsWith('/api/planning/week'))).toHaveLength(0)
  }, 120_000)
})
