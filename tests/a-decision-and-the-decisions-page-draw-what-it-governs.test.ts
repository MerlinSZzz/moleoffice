// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION'S PAGE DRAWS WHAT IT GOVERNS, AND THE DECISIONS PAGE ANSWERS WHICH DECISIONS GOVERN
 * A PLACE.
 *
 * What is proved, in a browser against a test office of its own, in English and in Chinese:
 *   1. a decision's Governs section draws a module by its title, linked to it, and then the files part, governsFiles,
 *      in the same list. A decision that names no page and says what no page fits draws that entry in its Governs
 *      section, which its files part or its nothingFits alone fills;
 *   2. the lookup on the Decisions page, asked about a file, lists the decisions whose files part reaches it newest
 *      first, marks the replaced one with what replaced it, and says how many decisions say nothing in governs: one
 *      that says no page fits it is one of them.
 *
 * Set W13Q_R40_SHOTS to a folder to photograph both at 1440, 990, 660 and 390, light and dark, in both languages.
 *
 * Three-run proof, this whole file each time, after `npm run build`:
 *   node tools/run-named-tests.mjs tests/a-decision-and-the-decisions-page-draw-what-it-governs.test.ts
 * Mutations, one at a time, each built, restored with cp and checked with cmp:
 *   A. src/shared/sections.ts, the `holdsGovernedPlaces(kind, key) && ...` arm of `drawableAsWords` removed: case 1 red.
 *   B. src/web/components/WhichDecisionsGovern.tsx, `|| one.id !== ''` added to the condition of the `dg-replaced`
 *      span, so it is never drawn: case 2 red.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
const shots = process.env.W13Q_R40_SHOTS
const contexts: BrowserContext[] = []
const ids: Record<string, string> = {}

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function request(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(`${app.api}${path}`, { method, headers: HEADERS, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(response.ok, `${path}: ${await response.clone().text()}`).toBe(true)
  return response.json()
}

const file = async (kind: string, title: string, data: Record<string, unknown>): Promise<string> =>
  (await request('/api/records', 'POST', { kind, title, data })).record.id as string

/**
 * A decision, a second after the one before: the office stamps a record to the second, and the lookup's newest-first
 * order is what case 2 reads, so two decisions in one second would tie.
 */
async function decide(title: string, extra: Record<string, unknown>): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1_100))
  const data = { option_taken: title, because: 'A made-up reason for a test office.', ...governsTheWholeProject(), replaces: [], ...extra }
  return file('decision', title, data)
}

async function aWindow(width: number, theme: 'light' | 'dark' = 'light'): Promise<Page> {
  const context = await app.browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
  contexts.push(context)
  await context.grantPermissions(['local-network-access'], { origin: app.site })
  await context.addInitScript(`localStorage.setItem('mole-office.preset.theme', '${theme}')`)
  return context.newPage()
}

/** The decision's page with its Governs section open: the one that names a module and a file, unless another is named. */
async function theDecision(page: Page, language: 'en' | 'zh', which = 'placed'): Promise<void> {
  await page.goto(`${app.site}/?lang=${language}#/r/${String(ids[which])}`)
  await waitForThePage(page, 30_000)
  const heading = createI18n(language).t('record.section.governs')
  await page.getByText(heading, { exact: true }).last().click()
  await page.locator('ul.rd-governs').waitFor({ timeout: 10_000 })
}

/** The Decisions page with the lookup opened and asked about one file. */
async function theLookup(page: Page, language: 'en' | 'zh'): Promise<void> {
  await page.goto(`${app.site}/?lang=${language}#/governance`)
  await waitForThePage(page, 30_000)
  const panel = page.locator('[data-target="uiSurface/decisions.governing"]')
  // The form is shut on arrival, as a page being read draws no box until somebody presses for one.
  await panel.locator('summary.dg-open').click()
  await panel.locator('input').fill('src/shared/paths.ts')
  await panel.locator('button[type="submit"]').click()
  await panel.locator('.dg-answer').waitFor({ timeout: 10_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'what-it-governs', workspace: 'default', viewport: { width: 1440, height: 900 } })
  if (shots) mkdirSync(shots, { recursive: true })
  ids['module'] = await file('module', 'Test: the path rules module', { context: 'A made-up module for a test office.' })
  ids['older'] = await decide('Test: shared code stays free of server imports', { governsFiles: ['src/shared'] })
  ids['placed'] = await decide('Test: one path rule for every caller', {
    governs: [{ record: ids['module'] }],
    governsFiles: ['src/shared/paths.ts'],
  })
  ids['replacing'] = await decide('Test: shared code may import the word lists', {
    governsFiles: ['src/shared/words'],
    replaces: [ids['older']],
  })
  // NOTHING IN GOVERNS: a decision door refuses one that names nothing, so this one says no page fits it.
  ids['nothing'] = await decide('Test: a decision that says nothing about where it applies', {
    governs: undefined,
    nothingFits: [{ missing: 'module', what: 'Where it applies, which no page names' }],
  })
}, 240_000)

afterAll(async () => {
  for (const context of contexts) await context.close()
  await app?.stop()
}, 60_000)

describe('what a decision governs, drawn', () => {
  it('1: the decision page draws a module by its title and then its file, and what no page fits, in both languages', async () => {
    for (const language of ['en', 'zh'] as const) {
      const page = await aWindow(1440)
      await theDecision(page, language)
      const rows = page.locator('ul.rd-governs > li')
      expect(await rows.count()).toBe(2)
      const module = rows.nth(0).locator('a')
      expect((await module.innerText()).trim()).toBe('Test: the path rules module')
      expect(await module.getAttribute('href')).toContain(String(ids['module']))
      expect(await rows.nth(1).getAttribute('data-governs')).toBe('file')
      expect((await rows.nth(1).innerText()).trim()).toBe('src/shared/paths.ts')

      // NO PAGE, NO FILE: the Governs section is still drawn, and it draws what no page fits.
      await theDecision(page, language, 'nothing')
      const unplaced = page.locator('ul.rd-governs > li')
      expect(await unplaced.count()).toBe(1)
      expect(await unplaced.nth(0).getAttribute('data-governs')).toBe('nothing-fits')
      expect(await unplaced.nth(0).innerText()).toContain('Where it applies, which no page names')
    }
  }, 120_000)

  it('2: the lookup lists the decisions over a file newest first, marks the replaced one, and counts the unplaced', async () => {
    for (const language of ['en', 'zh'] as const) {
      const words = createI18n(language)
      const page = await aWindow(1440)
      await theLookup(page, language)
      const panel = page.locator('[data-target="uiSurface/decisions.governing"]')
      const rows = panel.locator('.dg-row')
      expect(await rows.count()).toBe(2)
      expect((await rows.nth(0).locator('a').first().innerText()).trim()).toBe('Test: one path rule for every caller')
      expect((await rows.nth(1).locator('a').first().innerText()).trim()).toBe('Test: shared code stays free of server imports')
      expect(await rows.nth(0).getAttribute('data-replaced')).toBeNull()
      const replaced = rows.nth(1).locator('.dg-replaced')
      expect((await replaced.innerText()).replace(/\s+/g, ' ').trim()).toBe(
        `${words.t('decisions.governing.replacedBy')} Test: shared code may import the word lists`,
      )
      expect((await panel.locator('.dg-state').first().innerText()).trim()).toBe(words.t('decisions.governing.unplaced', { n: 1, of: 4 }))
    }

    if (shots) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          for (const language of ['en', 'zh'] as const) {
            const page = await aWindow(width, theme)
            await theDecision(page, language)
            await page.locator('ul.rd-governs').scrollIntoViewIfNeeded()
            await page.screenshot({ path: join(shots, `governs-decision-${String(width)}-${theme}-${language}.png`) })
            await theLookup(page, language)
            await page.locator('[data-target="uiSurface/decisions.governing"]').scrollIntoViewIfNeeded()
            await page.screenshot({ path: join(shots, `governs-lookup-${String(width)}-${theme}-${language}.png`) })
          }
        }
      }
    }
  }, 480_000)
})
