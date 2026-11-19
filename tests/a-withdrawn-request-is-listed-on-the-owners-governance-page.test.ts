// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REQUEST TO THE OWNER THAT ITS ASKER WITHDREW IS DRAWN ON THE OWNER'S GOVERNANCE PAGE, under what is not counted, with who
 * withdrew it and when (decision tFl1YWLH3eCl; wave 13w round 5b).
 *
 * A browser test against a real stack: an agent the owner started asks the owner for a card through the real door, withdraws it with
 * its own key, and the page is opened at #/governance. The fold of what is not counted is opened, and the line names
 * the request in the page's words, naming the asker as a message from it does (decision 3vcZMADIndHA), and says who
 * withdrew it by the same name.
 *
 * MUTATION (after a green control): take the withdrawn list out of the fold in GovernancePage.tsx → red.
 *
 * PHOTOGRAPHS at 1440, 990, 660 and 390, light and dark, in English and Chinese, when REKEY_SHOTS names a folder.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { cardWord } from '../src/shared/card-words.ts'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const ASKER = 'withdraws-its-ask'
// THE NAME THIS TEST GIVES THE ASKER when it starts it below: made up here, and none of the product's words.
const ASKER_NAME = `The agent ${ASKER}`
// THE LINE'S WORDS, from the word files: the asker by that name, and the card.
const title = sayInEnglish('decisions.cardAskRow', { asker: ASKER_NAME, card: cardWord('supervisor', sayInEnglish) })

/** Every key in a reply replaced, so no failure message carries one. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, hidden(text)).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function openTheFold(lang: 'en' | 'zh'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${lang}#/governance`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  // A goto that changes only the hash keeps the page, so it is loaded again to read the language and the look.
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  const fold = app.page.locator('[data-target="uiSurface/governance.excluded"]')
  await fold.waitFor({ state: 'visible', timeout: 30_000 })
  if ((await fold.getAttribute('open')) === null) await fold.locator('summary').click()
  await fold.locator('.gq-withdrawn').waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'withdrawn-ask', viewport: { width: 1440, height: 1000 } })
  const key = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  // THE ASKER'S KEY IS HELD HERE ONLY, in memory: never printed, never written.
  const started = await post('/api/agents/started', { ...AS_THE_PERSON, ...key }, { handle: ASKER, name: ASKER_NAME, role: 'worker', workArea: ['work'] })
  const asker = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': ASKER }
  const asked = await post('/api/roles/requests', asker, { asking: 'supervisor', because: 'Test: to lead a wave' })
  const request = String(asked['request'] ?? asked['record']?.id ?? asked['id'])
  await post(`/api/roles/requests/${request}/withdraw`, { ...asker, 'x-mole-office-key': String(started['whatToGiveIt']?.key) }, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the owner\'s governance page', () => {
  it('names the withdrawn request under what is not counted, with who withdrew it', async () => {
    await openTheFold('en')
    const line = app.page.locator('.gq-withdrawn li')
    expect(await line.count()).toBe(1)
    expect(await line.locator('.gq-withdrawn-open').textContent()).toBe(title)
    expect(await line.textContent()).toContain(`withdrawn by ${ASKER_NAME}, which asked, at `)
    // NOT IN THE ROWS: the line's words are drawn once on the page, in the fold, and nowhere it could be pressed as waiting.
    expect(await app.page.getByText(title, { exact: true }).count()).toBe(1)
  }, 120_000)

  it.skipIf(!process.env['REKEY_SHOTS'])('photographs the list at four widths, light and dark, in English and Chinese', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['REKEY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const lang of ['en', 'zh'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          await openTheFold(lang)
          expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
          const measured = await app.page.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
          expect(measured.drawn, `${lang} ${width} ${theme} is wider than the screen`).toBeLessThanOrEqual(width)
          await app.page.locator('.gq-withdrawn').scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: `${shots}/withdrawn-${lang}-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
    }
  }, 900_000)
})
