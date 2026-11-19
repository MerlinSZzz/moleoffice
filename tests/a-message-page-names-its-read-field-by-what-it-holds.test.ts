// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE PAGE NAMES ITS `read` FIELD BY WHAT THE FIELD HOLDS. Problem gyRw1dubpNbK.
 *
 * Round 21 gave every declared field one word per language, keyed by the field alone. A report's
 * `read` says whether the person it is for has read it, and its Chinese word is 是否已读, "whether it
 * has been read". A message's `read` is declared in src/shared/kinds.ts as NOT whether the message has
 * been read: it is a mark the messages from before delivery marks carry, and nothing reads it now. So
 * on a Chinese message page in developer mode the field was labelled with what its declaration denies.
 * A message's `read` now has a word of its own kind, `record.field.message.read`: 旧版已读标记 in
 * Chinese, "old read mark" in English. A report keeps 是否已读.
 *
 * The same sweep found a session's `detail`, which is how the run ended. It was titled 详细程度, "how
 * detailed", which is a context bundle's meaning. A session's section is now titled 结束情况.
 *
 * WHAT THIS PROVES, IN A REAL BROWSER, IN DEVELOPER MODE:
 *   - on a Chinese message page being changed, the box that writes the read field, opened from the
 *     fold of declared fields, is labelled 旧版已读标记, and the page nowhere says 是否已读;
 *   - on an English message page the same box is labelled "old read mark";
 *   - a Chinese report page still names its read field 是否已读, so the word is the kind's and not a
 *     new word for every kind;
 *   - a Chinese session page titles its detail section 结束情况 and not 详细程度.
 *
 * MADE-UP RECORDS, FILED THROUGH THE API: a letter about a seed library, a report on it, a run.
 *
 * MUTATIONS, each after a green control run, each restored to green:
 *   - in `fieldLabel` (src/web/pages/RecordPage.tsx) delete the lookup of `record.field.<kind>.<key>`.
 *     Red: the two message cases read 是否已读 and "read".
 *   - take `(key === 'detail' && kind === 'session')` out of `sectionTitleKey`
 *     (src/web/components/sections.ts). Red: the session's section is titled 详细程度.
 *
 * PICTURES. The message page in developer mode with that box open at 1440 in the light look and at 1440
 * in Chinese; the session page at 1440 in Chinese. They go to a folder of the test's own, or under
 * TEST_SHOTS where that names one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const SHOTS = testShots('message-read-field')

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let page: Page
let messageId = ''
let reportId = ''
let sessionId = ''

async function file(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  expect(res.status, await res.clone().text()).toBe(201)
  return ((await res.json()) as { record: { id: string } }).record.id
}

async function open(address: string, lang: 'en' | 'zh', ready: string, width = 1440, scheme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${lang}&mode=inspect#/r/${address}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
}

/**
 * THE LABEL ON THE BOX THAT WRITES ONE DECLARED FIELD. The fold of declared fields is opened, the
 * field's row is found by its key, and its Write press opens the box under it.
 */
async function labelOfTheBoxFor(key: string): Promise<string> {
  const fold = page.locator('article.rp details[data-testid="declared-fields"]')
  await fold.locator(':scope > summary').click()
  const row = fold.locator('li.fw-row').filter({ has: page.locator('code.fw-key', { hasText: new RegExp(`^${key}$`) }) })
  await row.locator('.fw-head button').click()
  const label = row.locator('label.px-label').first()
  await label.waitFor({ timeout: 30_000 })
  await label.scrollIntoViewIfNeeded()
  return (await label.innerText()).trim()
}

beforeAll(async () => {
  app = await liveApp({ name: 'message-read-field', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  messageId = await file({
    kind: 'message',
    title: 'The seed library opens on Saturday',
    summary: 'A made-up letter about a seed library.',
    data: { body: 'The made-up seed library opens on Saturday at ten.', to: [{ kind: 'person', id: THE_PERSON }] },
  })
  reportId = await file({
    kind: 'report',
    title: 'What the seed library lent this month',
    summary: 'A made-up report on a seed library.',
    data: {
      blocks: [{ id: 'one', type: 'text', text: 'The made-up library lent forty packets of beans.' }],
      for: 'the made-up garden club',
      date: '2026-09-29',
    },
  })
  sessionId = await file({
    kind: 'session',
    title: 'Sorting the made-up seed packets',
    summary: 'A made-up run that ended.',
    data: { state: 'finished', doing: 'Sorting the made-up seed packets.', detail: 'exit 0, every packet sorted' },
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a field whose key means two things is named by what it holds on each kind', () => {
  it('labels the box for a message\'s read field 旧版已读标记 on a Chinese page, and never 是否已读', async () => {
    await open(`${messageId}/edit`, 'zh', 'article.rp details[data-testid="declared-fields"]')
    const label = await labelOfTheBoxFor('read')
    await page.screenshot({ path: join(SHOTS, 'message-developer-1440-zh-light.png') })
    // THE WORD ITSELF, written out, so the test does not pass by reading back whatever the list holds.
    expect(label).toBe('旧版已读标记')
    expect(await page.locator('article.rp').innerText()).not.toContain('是否已读')
  }, 180_000)

  it('labels it "old read mark" on an English page at 1440', async () => {
    await open(`${messageId}/edit`, 'en', 'article.rp details[data-testid="declared-fields"]')
    expect(await labelOfTheBoxFor('read')).toBe('old read mark')
    await page.screenshot({ path: join(SHOTS, 'message-developer-1440-en-light.png') })
  }, 300_000)

  it('still names a report\'s read field 是否已读, because that is what a report\'s holds', async () => {
    await open(`${reportId}/edit`, 'zh', 'article.rp details[data-testid="declared-fields"]')
    expect(await labelOfTheBoxFor('read')).toBe('是否已读')
  }, 180_000)

  it('titles a session\'s detail section 结束情况 on a Chinese page, and not 详细程度', async () => {
    await open(sessionId, 'zh', '.rp')
    // THE SECTION IS A FOLD, closed on load, so its words are on the page and not shown. Its title is
    // the fold's one visible line.
    await page.getByText('exit 0, every packet sorted').first().waitFor({ state: 'attached', timeout: 30_000 })
    await page.screenshot({ path: join(SHOTS, 'session-developer-1440-zh-light.png'), fullPage: true })
    const text = await page.locator('article.rp').innerText()
    expect(text).toContain('结束情况')
    expect(text).not.toContain('详细程度')
  }, 180_000)
})
