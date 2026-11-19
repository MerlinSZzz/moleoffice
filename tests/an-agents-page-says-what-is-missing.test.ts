// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S PAGE SAYS WHAT IS MISSING, IN WORDS, NOT AS A DASH. Wave 13k round 41, piece 4 (decision WdlQ2ADlhZUu).
 *
 * Before this, every empty fact on an agent's page (src/web/pages/ProfilePage.tsx) was drawn by Absence as a dash,
 * and the sentence saying what was missing was only on the dash's tooltip, which a phone cannot show. Absence now
 * takes one option, `say`, which draws its sentence in place of the dash. The agent's page passes it on each
 * Absence that has a sentence. Every other caller draws as before.
 *
 * WHAT IS CLAIMED: on the page of a newly registered agent, in English and Chinese, in Normal mode,
 *   - every empty fact is drawn as its sentence, and none as a bare dash;
 *   - the sentences for no status, nothing filed, no visits and no work area are on the page, in the page's
 *     language. These are the four a newly registered agent has.
 *
 * MADE-UP DATA: the agent is registered by the test, in the test's own office.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): in Absence
 * (src/web/components/ui.tsx), the sentence is never drawn, so the dash returns. Every case goes red.
 *
 * Set TEST_SHOTS to keep pictures at 1440, 990, 660 and 390, light and dark, English and Chinese.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'

const WORDS = { en: createI18n('en'), zh: createI18n('zh') } as const
const LANGUAGES = ['en', 'zh'] as const

let app: LiveApp
let agentId = ''

async function look(language: 'en' | 'zh', theme = 'light'): Promise<{ said: string[]; dashes: number }> {
  const page = app.page
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), theme)
  await page.goto(`${app.site}/?lang=${language}&mode=normal#${whoPath('agent', agentId)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.prof-name', { timeout: 30_000 })
  await page.waitForSelector('main .px-absent', { timeout: 30_000 })
  return page.evaluate(() => {
    const absent = [...document.querySelectorAll('main .px-absent')] as HTMLElement[]
    return {
      said: absent.filter((one) => one.classList.contains('px-absent-said')).map((one) => (one.textContent ?? '').trim()),
      dashes: absent.filter((one) => !one.classList.contains('px-absent-said')).length,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'agents-page-says-missing', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const response = await fetch(app.api + '/api/agents/started', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
    },
    body: JSON.stringify({ handle: 'test-r41-absence', name: 'Test agent of round 41', role: 'worker' }),
  })
  const text = await response.text()
  expect(response.status, text).toBe(201)
  agentId = (JSON.parse(text) as { agent: { id: string } }).agent.id
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('an agent’s page says what is missing in words', () => {
  for (const language of LANGUAGES) {
    const t = WORDS[language].t
    it(`${language}: every empty fact is its sentence, and none is a bare dash`, async () => {
      const seen = await look(language)
      expect(seen.dashes).toBe(0)
      for (const key of ['g6b.profile.noStatus', 'g6b.profile.nothingFiled', 'g6b.profile.noVisits', 'g6b.profile.noWorkArea'] as const) {
        expect(seen.said, key).toContain(t(key))
      }
    }, 120_000)
  }

  it.runIf(Boolean(process.env[TEST_SHOTS]))('pictures at four widths, light and dark, in both languages', async () => {
    const shots = testShots('agents-page-says-missing')
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 900 })
        for (const language of LANGUAGES) {
          await look(language, theme)
          expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
          const size = await app.page.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
          expect(size.drawn, `${language} ${width} ${theme}`).toBeLessThanOrEqual(size.width)
          await app.page.screenshot({ path: `${shots}/agent-${language}-${width}-${theme}.png`, fullPage: true })
        }
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 580_000)
})
