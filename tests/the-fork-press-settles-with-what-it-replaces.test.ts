// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The Decisions card sends what the person's new decision replaces, against a real server. */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en as everyWord } from '../src/shared/words/en.ts'
import { enWave13s as en } from '../src/shared/words/en-wave-13s.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page
// READ FROM THE SERVER'S OWN DECLARATIONS, not typed again here. These modules open a database
// when they load, so beforeAll names this test's own throwaway file before asking for them; the
// server test loads the same three values the same way.
let proposalKind: string
let decisionKind: string
let replacesField: string
const person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: person, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${String(res.status)} ${await res.text()}`)
  return res.json()
}
async function read(path: string): Promise<any> {
  const res = await fetch(`${app.api}${path}`, { headers: person })
  if (!res.ok) throw new Error(`${path}: ${String(res.status)} ${await res.text()}`)
  return res.json()
}
async function fork(title: string): Promise<string> {
  return (await post('/api/records', { kind: proposalKind, title, data: {
    question: 'Which glaze goes on the spring batch?', options: ['The celadon', 'The tenmoku'],
    because: 'The kiln is booked for Friday.', who_settles_it: 'the owner',
  } })).record.id
}
async function earlier(forkId: string, title: string): Promise<string> {
  const id = (await post('/api/records', { kind: decisionKind, title, data: {
    [replacesField]: [], decided_by: 'the owner', authority: 'the owner said so', option_taken: 'The celadon',
  } })).record.id as string
  await post('/api/links', { fromId: id, toId: forkId, type: 'about' })
  return id
}
async function openCard(id: string, title: string, query = ''): Promise<Locator> {
  await page.goto(`${app.site}/${query}#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const card = page.locator('li.dq-tile').filter({ has: page.locator('button.dq-title', { hasText: title }) })
  await card.waitFor({ timeout: 30_000 })
  const readFork = page.waitForResponse((res) => res.url().endsWith(`/api/records/${id}`), { timeout: 30_000 })
  await card.locator('summary.dq-decide-sum').click()
  await readFork
  await card.locator('.px-gov-opt button').first().waitFor({ timeout: 30_000 })
  return card
}
async function chooseOption(card: Locator): Promise<void> {
  await card.locator('.px-gov-opt button').first().click()
}
async function confirm(card: Locator, id: string): Promise<{ sent: any; decision: string }> {
  const path = `/api/records/${id}/promote`
  const request = page.waitForRequest((req) => req.method() === 'POST' && new URL(req.url()).pathname === path, { timeout: 30_000 })
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === path, { timeout: 30_000 })
  const button = card.locator('form button[type="submit"]').first()
  await expect.poll(() => button.getAttribute('aria-disabled'), { timeout: 30_000 }).not.toBe('true')
  await button.click()
  const sent = (await request).postDataJSON()
  const answered = await response
  expect(answered.status()).toBeLessThan(300)
  const reply = await answered.json() as { decision: { id: string } }
  return { sent, decision: reply.decision.id }
}
async function settled(id: string, decision: string): Promise<void> {
  const body = await read(`/api/records/${id}`)
  expect(body.resolution.resolved).toBe(true)
  expect(body.resolution.by.map((one: { id: string }) => one.id)).toEqual([decision])
}
async function supersedes(id: string): Promise<string[]> {
  const body = await read('/api/links?type=supersedes')
  return body.links.filter((link: { fromId: string; type: string }) => link.fromId === id && link.type === 'supersedes')
    .map((link: { toId: string }) => link.toId)
}

beforeAll(async () => {
  app = await liveApp({ name: 'fork-replaces', viewport: { width: 1440, height: 1000 } })
  page = app.page
  // The kind names live in a module that opens a database when it loads. A throwaway file inside
  // this test's own folder is named first, so the import can reach nothing of the operator's.
  process.env['MOLE_OFFICE_DB'] = join(app.dir, 'the-kinds.db')
  const records = await import('../src/server/lib/records.ts')
  proposalKind = records.PROPOSAL_KIND
  decisionKind = records.DECISION_KIND
  replacesField = (await import('../src/server/lib/replaced-decisions.ts')).REPLACES_FIELD
}, 240_000)
afterAll(async () => { await app?.stop() })

describe('the fork press settles with what it replaces', () => {
  it('sends an empty list when there are no candidates', async () => {
    const title = 'Which clay for the summer batch?'
    const id = await fork(title)
    const card = await openCard(id, title)
    await chooseOption(card)
    const result = await confirm(card, id)
    expect(result.sent.data[replacesField]).toEqual([])
    await settled(id, result.decision)
    expect(await card.locator('.px-error, .px-gov-refused').count()).toBe(0)
  }, 180_000)

  it('shows the candidate and records its replacement', async () => {
    const title = 'Which glaze for the autumn batch?'
    const oldTitle = 'The autumn batch takes celadon'
    const id = await fork(title)
    const old = await earlier(id, oldTitle)
    const card = await openCard(id, title)
    const list = card.locator('fieldset.px-gov-replaces')
    await list.waitFor({ timeout: 30_000 })
    const words = await list.innerText()
    expect(words).toContain(oldTitle)
    expect(words).toContain(old)
    expect(words).toContain(id)
    await chooseOption(card)
    expect(await card.locator('form button[type="submit"]').first().getAttribute('aria-disabled')).toBe('true')
    await list.getByRole('checkbox', { name: new RegExp(old) }).check()
    const result = await confirm(card, id)
    expect(result.sent.data[replacesField]).toEqual([old])
    await settled(id, result.decision)
    expect((await read(`/api/records/${result.decision}`)).record.data[replacesField]).toEqual([old])
    expect(await supersedes(result.decision)).toEqual([old])
  }, 180_000)

  it('records none when the person chooses none of the candidates', async () => {
    const title = 'Which glaze for the winter batch?'
    const id = await fork(title)
    await earlier(id, 'The winter batch takes celadon')
    const card = await openCard(id, title)
    const list = card.locator('fieldset.px-gov-replaces')
    await list.waitFor({ timeout: 30_000 })
    await chooseOption(card)
    await list.getByRole('checkbox', { name: en['decisions.replaces.none'] }).check()
    const result = await confirm(card, id)
    expect(result.sent.data[replacesField]).toEqual([])
    await settled(id, result.decision)
    expect(await supersedes(result.decision)).toEqual([])
  }, 180_000)

  it('offers the retry when the candidates cannot be read', async () => {
    const title = 'Which glaze for the failed read batch?'
    const oldTitle = 'The failed read batch takes celadon'
    const id = await fork(title)
    const old = await earlier(id, oldTitle)
    const readFork = `**/api/records/${id}`
    let reads = 0
    let failedOnce = false
    // THE CANDIDATE READ AND THE CARD'S OWN decisionsThatNameIt READ ARE THE SAME GET, with the same
    // headers, so src/web/api.ts answers the second one out of the first one's flight: one request
    // serves both. Failing it fails both, which is why the candidate's note is inside
    // form.px-gov-form and the card's own note is outside it. Every read after this one, including
    // the retry's, is let through; the route comes off before the retry is pressed.
    await page.route(readFork, async (route) => {
      reads += 1
      if (reads <= 2) {
        failedOnce = true
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"the candidates could not be read"}' })
        return
      }
      await route.continue()
    })
    try {
      const card = await openCard(id, title)
      const note = card.locator('form.px-gov-form .px-error')
      await note.waitFor({ timeout: 30_000 })
      expect(await note.innerText()).toContain(en['decisions.replaces.unread'])
      expect(failedOnce).toBe(true)
      const retry = note.getByRole('button', { name: everyWord['error.retry'] })
      expect(await retry.count()).toBe(1)
      // The card draws its confirm press once an option is taken; taking one writes nothing.
      await chooseOption(card)
      const submit = card.locator('form button[type="submit"]').first()
      await submit.waitFor({ timeout: 30_000 })
      // A FAILED READ STILL KEEPS THE CONFIRM PRESS OFF. It stays off until the retry answers and
      // the person chooses what this decision replaces.
      expect(await submit.getAttribute('aria-disabled')).toBe('true')
      await page.unroute(readFork)
      const answered = page.waitForResponse((res) => res.url().endsWith(`/api/records/${id}`) && res.status() === 200, { timeout: 30_000 })
      await retry.click()
      await answered
      const list = card.locator('fieldset.px-gov-replaces')
      await list.waitFor({ timeout: 30_000 })
      const words = await list.innerText()
      expect(words).toContain(oldTitle)
      expect(words).toContain(old)
      expect(words).toContain(id)
      expect(await submit.getAttribute('aria-disabled')).toBe('true')
      await list.getByRole('checkbox', { name: new RegExp(old) }).check()
      const result = await confirm(card, id)
      expect(result.sent.data[replacesField]).toEqual([old])
      await settled(id, result.decision)
      expect((await read(`/api/records/${result.decision}`)).record.data[replacesField]).toEqual([old])
      expect(await supersedes(result.decision)).toEqual([old])
    } finally {
      await page.unroute(readFork)
    }
  }, 180_000)

  it.skipIf(!process.env['FORK_REPLACES_SHOTS'])('photographs a checked candidate at four widths in both themes and languages', async () => {
    const shots = process.env['FORK_REPLACES_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const title = 'Which glaze for the picture batch?'
    const id = await fork(title)
    const old = await earlier(id, 'The picture batch takes celadon')
    const pictures = new Map<string, Buffer>()
    const pictureAt = (width: number, theme: string, lang: string): Buffer => {
      const held = pictures.get(`${String(width)}-${theme}-${lang}`)
      if (held === undefined) throw new Error(`no ${theme} picture at ${String(width)}px in ${lang}`)
      return held
    }
    // NAVIGATE BEFORE THE FIRST SET, so this case runs alone as well as after its neighbours. A
    // filtered run starts at about:blank, where the browser refuses access to localStorage; the
    // page must be on the app's own origin before a theme is written.
    await page.goto(app.site, { timeout: 60_000 })
    for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) for (const lang of ['en', 'zh']) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((value) => localStorage.setItem('mole-office.preset.theme', value), theme)
      const card = await openCard(id, title, `?lang=${lang}`)
      const list = card.locator('fieldset.px-gov-replaces')
      await list.waitFor({ timeout: 30_000 })
      await list.getByRole('checkbox', { name: new RegExp(old) }).check()
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await list.scrollIntoViewIfNeeded()
      const path = join(shots, `fork-replaces-${String(width)}-${theme}-${lang}.png`)
      await page.screenshot({ path, fullPage: true })
      pictures.set(`${String(width)}-${theme}-${lang}`, readFileSync(path))
    }
    // A DARK PICTURE EQUAL TO ITS LIGHT ONE IS NOT A DARK PICTURE. A screenshot that never changed
    // theme would pass every other check in this case, so the bytes are compared as bytes.
    for (const width of [1440, 990, 660, 390]) for (const lang of ['en', 'zh']) {
      expect(
        pictureAt(width, 'dark', lang).equals(pictureAt(width, 'light', lang)),
        `the dark picture at ${String(width)}px in ${lang} is byte-equal to the light one`,
      ).toBe(false)
    }
  }, 600_000)
})
