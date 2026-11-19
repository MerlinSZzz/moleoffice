// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINK ROW ON A RECORD PAGE SAYS ITS RELATION, NOT "UNKNOWN LINK". Problem gaYJ80izWMXa.
 *
 * Every link row on a record page read "unknown link: blocked by" (in Chinese 未知关联：被其阻碍).
 * The links panel made the reader's word ("blocked by") and handed it to the link mark as if it
 * were the stored type, and the mark made a word from it a second time. "blocked by" is no stored
 * type, so the second call answered the unknown-link word. The mark now takes the stored type and
 * the end the reader stands on, and makes the word once.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER, IN ENGLISH AND IN CHINESE: a record page with one link out of
 * it and one link into it draws each row's badge as the relation's own word, forward for the link
 * out and reverse for the link in, and no badge reads the unknown-link word.
 *
 * MADE-UP RECORDS, FILED AND LINKED THROUGH THE API.
 *
 * MUTATION, after a control run: in src/web/components/LinkPanel.tsx hand LinkMark the made word
 * again (`type={linkWord(link.type, ...).text}`). Every badge reads the unknown-link word, so both
 * languages go red. Restored, green again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const SHOTS = testShots('link-row-relation')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let page: Page
let middleId = ''

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  expect(res.status, await res.clone().text()).toBe(201)
  return res.json()
}

async function file(title: string): Promise<string> {
  const reply = await post('/api/records', { kind: 'problem', title, summary: 'A made-up problem.', data: { symptom: 'The shelf creaks.', state: 'open' } })
  return reply.record.id as string
}

/** The words of every mark on the page's link rows. */
async function badges(language: 'en' | 'zh', width = 1440, scheme: 'light' | 'dark' = 'light'): Promise<string[]> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto(`${app.site}/?lang=${language}#/r/${middleId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The links sit in a fold under the rail, whose summary says how many there are. Open it.
  await page.locator('.lp-link').first().waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('details.rd-fold:has(.lp-link) > summary').first().click()
  await page.locator('.lp-link').first().waitFor({ timeout: 30_000 })
  await page.locator('.lp-list').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(SHOTS, `link-rows-${width}-${language}-${scheme}.png`) })
  return page.locator('.lp-link .px-chip-word').allTextContents()
}

beforeAll(async () => {
  app = await liveApp({ name: 'link-row-relation', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  const before = await file('The lantern shelf is not bolted down')
  middleId = await file('The lantern archive cannot be moved')
  const after = await file('The archive move is planned for spring')
  // On the middle record's page: a link into it (shown from the reverse end) and a link out of it.
  await post('/api/links', { fromId: before, toId: middleId, type: 'blocks' })
  await post('/api/links', { fromId: middleId, toId: after, type: 'blocks' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a link row on a record page', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`draws the relation's own word in both directions (${language})`, async () => {
      const words = createI18n(language)
      const unknownLead = words.t('word.unknown.link', { stored: '' })
      const seen = await badges(language)
      expect(seen).toContain(words.t('word.link.forward.blocks'))
      expect(seen).toContain(words.t('word.link.reverse.blocks'))
      expect(seen.filter((one) => one.startsWith(unknownLead.trim())), 'a badge reads the unknown-link word').toEqual([])
    }, 180_000)
  }

  it('is photographed at 390 and in the dark look for the supervisor', async () => {
    // Pictures only: the same reading at the other width and look must still hold the words.
    const words = createI18n('en')
    for (const [width, scheme] of [[390, 'light'], [1440, 'dark'], [390, 'dark']] as const) {
      const seen = await badges('en', width, scheme)
      expect(seen).toContain(words.t('word.link.reverse.blocks'))
    }
  }, 300_000)
})
