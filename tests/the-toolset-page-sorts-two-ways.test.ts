// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLSET PAGE, IN A REAL BROWSER: CATEGORY CARDS AND THEIR MANUALS. Piece P3.
 *
 * `#/toolset` reads GET /api/toolset. This files a small catalogue in a throwaway office and proves
 * the owner-approved list and manual: grouped cards, the audience switch, a proposed category in
 * Needs you, a document without item numbers, and developer facts kept out of the ordinary view.
 *
 * This test used to require a two-way audience filter and numbered manual items. A decision changes the words to All /
 * Using the office / Developing it, keeps developer tools under All, gives every card its category's icon, and removes
 * the item numbers.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KEPT_HERE, PART_OF_THE_OFFICE } from '../src/shared/toolset.ts'
import { zh } from '../src/shared/words/zh.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage, governsTheWholeProject } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let app: LiveApp
let page: Page
let proposedCategory: string

async function callApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_PERSON, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await callApi<{ record: { id: string } }>('/api/records', { kind, title, data })
  return made.record.id
}

function aTool(input: {
  slug: string
  forWhom: string
  category?: string
  state?: string | null
  entry?: string
  kept?: string
  location?: string
}): Record<string, unknown> {
  return {
    entry: input.entry ?? 'tool',
    slug: input.slug,
    does: `The ${input.slug} tool does one thing for this test.`,
    forWhom: input.forWhom,
    ...(input.category === undefined ? {} : { category: input.category }),
    whenToUse: 'When this test needs it.',
    whenNotToUse: 'At any other time.',
    whoMayUse: 'Anybody in this test office.',
    howToCall: `node tools/${input.slug}.mjs`,
    example: `node tools/${input.slug}.mjs --once`,
    costs: 'Nothing worth counting.',
    protects: 'Nothing leaves this test office.',
    eachUseRecords: 'Nothing.',
    keptBy: 'This test.',
    version: 'Version 1.',
    kept: input.kept ?? KEPT_HERE,
    ...(input.state === null ? {} : { state: input.state ?? 'built' }),
    ...(input.location === undefined ? {} : { location: input.location }),
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'toolset-page', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const decision = await file('decision', 'The builders category is confirmed', {
    ...governsTheWholeProject(), replaces: [],
    decided_on: '2026-09-25',
    because: 'A category for the tools that build the office.',
    decided_by: 'the owner',
  })
  const confirmed = await file('tool_category', 'Developing the office', {
    says: 'Tools the people who develop the office use.',
    confirmedBy: decision,
  })
  proposedCategory = await file('tool_category', 'Pages and pictures', {
    says: "Tools that photograph or draw the office's pages.",
  })

  await file('tool', 'Page screenshots', aTool({
    slug: 'page-screenshots',
    forWhom: 'users',
    category: proposedCategory,
    location: 'tools/missing-page-screenshots.mjs',
  }))
  await file('tool', 'Page preview', aTool({
    slug: 'page-preview',
    forWhom: 'users',
    category: proposedCategory,
    location: 'package.json',
  }))
  await file('tool', 'Run named tests', aTool({
    slug: 'run-named-tests',
    forWhom: 'developers',
    category: confirmed,
    state: 'not built yet',
  }))
  await file('tool', 'Search', aTool({
    slug: 'search',
    forWhom: 'both',
    category: confirmed,
    state: null,
  }))
  await file('tool', 'Mail tool', aTool({
    slug: 'mail-tool',
    forWhom: 'both',
    category: confirmed,
    entry: 'service',
    kept: 'elsewhere',
  }))
  await file('tool', 'Write a good brief', aTool({
    slug: 'write-a-good-brief',
    forWhom: 'both',
    entry: PART_OF_THE_OFFICE,
    kept: 'elsewhere',
  }))
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function openAddress(address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The tool slugs on cards, sorted. Office how-to links are deliberately not cards. */
async function toolsDrawn(): Promise<string[]> {
  return (await page.locator('.tls-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-tool') ?? ''))).sort()
}

async function press(who: string, expected: string[]): Promise<string[]> {
  await page.getByRole('button', { name: who, exact: true }).click()
  const deadline = Date.now() + 15_000
  let drawn = await toolsDrawn()
  while (Date.now() < deadline && JSON.stringify(drawn) !== JSON.stringify(expected)) {
    await page.waitForTimeout(150)
    drawn = await toolsDrawn()
  }
  return drawn
}

describe('the toolset page in a real browser', () => {
  it('groups cards by category, repeats the group icon and opens the manual from the whole card', async () => {
    await openAddress('#/toolset')
    await page.waitForSelector('.tls-card', { timeout: 60_000 })
    expect(await page.locator('.tls-jumps .tls-jump').allInnerTexts()).toEqual([
      'Needs you', 'Developing the office', 'How the office works',
    ])

    const cards = page.locator('.tls-card')
    expect(await toolsDrawn()).toEqual(['mail-tool', 'page-preview', 'page-screenshots', 'run-named-tests', 'search'])
    const first = page.locator('.tls-card[data-tool="page-screenshots"]')
    const second = page.locator('.tls-card[data-tool="page-preview"]')
    expect(await first.evaluate((card) => card.tagName)).toBe('A')
    expect(await first.getAttribute('href')).toContain('/toolset/page-screenshots')
    expect(await first.locator('.tls-group-icon').count()).toBe(1)
    expect(await first.locator('.tls-group-icon').getAttribute('data-group')).toBe(
      await second.locator('.tls-group-icon').getAttribute('data-group'),
    )
    expect(await first.locator('.tls-does').evaluate((line) => getComputedStyle(line).whiteSpace)).toBe('nowrap')
    expect(await first.innerText()).toContain('Office users')
    expect(await first.innerText()).toContain('File missing')
    expect(await first.getByText('File missing', { exact: true }).getAttribute('data-tone')).toBe('alarm')
    expect(await page.locator('.tls-card[data-tool="run-named-tests"]').getByText('Not built yet', { exact: true }).getAttribute('data-tone')).toBe('warn')
    expect(await page.locator('.tls-card[data-tool="page-preview"]').getByText('Ready', { exact: true }).getAttribute('data-tone')).toBe('neutral')
    expect(await page.locator('.tls-card[data-tool="search"] .px-absent').count()).toBe(1)

    const a = await first.boundingBox()
    const b = await second.boundingBox()
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2)
    expect(Math.abs(a!.x - b!.x)).toBeGreaterThan(0)

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const drawnWidth = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
      expect(drawnWidth.page, `sideways overflow at ${width}px`).toBeLessThanOrEqual(drawnWidth.viewport)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })

    await first.click()
    await page.waitForFunction(() => location.hash.endsWith('/toolset/page-screenshots'))
    await page.waitForSelector('.tls-manual', { timeout: 60_000 })
    expect(await page.locator('h1').innerText()).toContain('Page screenshots')
  }, 120_000)

  it('shows developer tools under All and filters for office users or developers', async () => {
    await openAddress('#/toolset')
    await page.waitForSelector('.tls-card', { timeout: 60_000 })
    expect(await page.locator('.tls-audience-switch').innerText()).toContain('All')
    expect(await page.locator('.tls-audience-switch').innerText()).toContain('Using the office')
    expect(await page.locator('.tls-audience-switch').innerText()).toContain('Developing it')
    expect(await toolsDrawn()).toContain('run-named-tests')

    expect(await press('Using the office', ['mail-tool', 'page-preview', 'page-screenshots', 'search'])).toEqual([
      'mail-tool', 'page-preview', 'page-screenshots', 'search',
    ])
    expect(await press('Developing it', ['mail-tool', 'run-named-tests', 'search'])).toEqual([
      'mail-tool', 'run-named-tests', 'search',
    ])
    expect(await press('All', ['mail-tool', 'page-preview', 'page-screenshots', 'run-named-tests', 'search'])).toEqual([
      'mail-tool', 'page-preview', 'page-screenshots', 'run-named-tests', 'search',
    ])
  }, 120_000)

  it('puts a proposed category in Needs you and Confirm opens the existing reason box', async () => {
    await openAddress('#/toolset')
    await page.waitForSelector('.tls-card', { timeout: 60_000 })
    const needsYou = page.locator('.tls-needs-you')
    expect(await needsYou.locator('h2').innerText()).toBe('Needs you')
    const proposed = needsYou.locator(`.tls-category[data-category="${proposedCategory}"]`)
    expect(await proposed.innerText()).toContain('Pages and pictures')
    expect(await proposed.getByRole('button', { name: 'Confirm', exact: true }).count()).toBe(1)
    await proposed.getByRole('button', { name: 'Confirm', exact: true }).click()
    expect(await proposed.getByRole('textbox').count()).toBe(1)
    expect(await proposed.getByText('Why are you confirming it?', { exact: true }).count()).toBe(1)
  }, 120_000)

  it('reads as a short document, keeps developer facts out of normal mode and draws them in developer mode', async () => {
    await openAddress('#/toolset/page-screenshots')
    await page.waitForSelector('.tls-section', { timeout: 60_000 })
    const manual = page.locator('.tls-manual')
    expect(await manual.locator('h1').innerText()).toBe('Page screenshots')
    expect(await manual.locator('.tls-manual-icon').count()).toBe(1)
    expect(await manual.locator('.tls-manual-head .tls-does').innerText()).toBe(
      'The page-screenshots tool does one thing for this test.',
    )
    expect(await manual.locator('.tls-facts').innerText()).toContain('File missing')
    expect(await manual.locator('.tls-facts').innerText()).toContain('Office users')
    expect(await manual.locator('.tls-facts').innerText()).toContain('Pages and pictures')
    expect(await manual.locator('.tls-section h2').allInnerTexts()).toEqual([
      'When to use it', 'When not to use it', 'Who may use it', 'What it costs', 'What it protects',
    ])
    expect(await manual.locator('.tls-item').count()).toBe(0)
    expect(await manual.locator('.tls-crumbs').count()).toBe(0)
    expect(await manual.locator('.num').count()).toBe(0)
    const normal = await manual.innerText()
    for (const developerFact of [
      'node tools/page-screenshots.mjs',
      'node tools/page-screenshots.mjs --once',
      'Nothing.',
      'This test.',
      'Version 1.',
      'tools/missing-page-screenshots.mjs',
    ]) expect(normal).not.toContain(developerFact)

    await openAddress('?mode=inspect#/toolset/page-screenshots')
    await page.waitForSelector('.tls-developer', { timeout: 60_000 })
    const developer = await page.locator('.tls-manual').innerText()
    for (const developerFact of [
      'node tools/page-screenshots.mjs',
      'node tools/page-screenshots.mjs --once',
      'Nothing.',
      'This test.',
      'Version 1.',
      'tools/missing-page-screenshots.mjs',
    ]) expect(developer).toContain(developerFact)
    expect(await page.locator('.tls-manual .num').count()).toBe(0)
    expect(developer.match(/tools\/missing-page-screenshots\.mjs/g)?.length).toBe(1)
  }, 120_000)

  it('shows the mail service as one tool that runs by itself and points its manual to Settings › Tools', async () => {
    await openAddress('#/toolset')
    await page.waitForSelector('.tls-card[data-tool="mail-tool"]', { timeout: 60_000 })
    const card = page.locator('.tls-card[data-tool="mail-tool"]')
    expect(await card.innerText()).toContain('Runs by itself')
    expect(await card.locator('.tls-group-icon').count()).toBe(1)
    await card.click()
    await page.waitForFunction(() => location.hash.endsWith('/toolset/mail-tool'))
    await page.waitForSelector('.tls-manual', { timeout: 60_000 })
    const pointer = page.getByRole('link', { name: 'Settings › Tools', exact: true })
    expect(await pointer.count()).toBe(1)
    expect(await pointer.getAttribute('href')).toContain('/settings/mailtool')

    await openAddress('?lang=zh#/toolset/mail-tool')
    await page.waitForSelector('.tls-manual', { timeout: 60_000 })
    const translatedPointer = page.getByRole('link', { name: zh['r15.toolset.settingsTools'], exact: true })
    expect(await translatedPointer.count()).toBe(1)
    expect(await translatedPointer.getAttribute('href')).toContain('/settings/mailtool')
  }, 120_000)

  it('ends with plain office how-to links', async () => {
    await openAddress('#/toolset')
    await page.waitForSelector('.tls-card', { timeout: 60_000 })
    const howTo = page.locator('.tls-how-office')
    expect(await howTo.locator('h2').innerText()).toBe('How the office works')
    const link = howTo.getByRole('link', { name: 'Write a good brief', exact: true })
    expect(await link.count()).toBe(1)
    expect(await link.getAttribute('class')).toContain('tls-how-link')
    expect(await howTo.locator('.tls-card').count()).toBe(0)
    expect(await howTo.locator('.px-panel').count()).toBe(0)
  }, 120_000)

  it('gives an empty catalogue the state word "none" without controls', async () => {
    // THE FIRST STACK ANSWERS THIS ONE READ WITH AN EMPTY CATALOGUE, so no second office starts.
    await page.route('**/api/toolset', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as Record<string, unknown>
      await route.fulfill({
        response,
        json: { ...body, categories: [], withoutACategory: [], partsOfTheOffice: [] },
      })
    })
    try {
      await openAddress('#/toolset')
      await page.waitForSelector('.tls-none', { timeout: 60_000 })
      expect(await page.locator('.tls-none').innerText()).toBe(sayInEnglish('absence.none'))
      expect(await page.locator('.tls-audience-switch,.tls-jumps').count()).toBe(0)
      expect(await page.locator('.tls button').count()).toBe(0)
    } finally {
      await page.unroute('**/api/toolset')
    }
  }, 120_000)
})
