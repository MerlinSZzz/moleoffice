// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTEXT BUNDLES PAGE IS A FORM, WITH THE PREVIEW BESIDE IT AND THE KEPT BUNDLES UNDER THEM.
 *
 * Wave 13q round 10 (the bundles page), task y36lOOu_rQfl, plan 7FEOshq3mBGG. The design is block
 * b-17 of report n9Mjk3c_sJRu, taken under two decisions: the width is used side by side,
 * and every question was answered as recommended.
 *
 * WHAT THIS FILE PROVES, in a test office with made-up records, in a real browser:
 *   1. the form has three labelled rows, About, For and Detail, each drawn as a label beside its
 *      controls;
 *   2. the preview stands beside the form at 1440 and below it at 390;
 *   3. Copy the bundle is the page's one primary press, and it puts on the clipboard exactly the text
 *      the preview shows;
 *   4. Keep it for later files a bundle, which then appears in the list of kept bundles.
 *
 * THE THREE RUNS are in the commit that adds this file: a control run, one guarded line broken per
 * test, and the restore.
 *
 * Set W13Q_BUNDLES_SHOTS to a folder to photograph the page at 1440, 990, 660 and 390 in both looks,
 * at 1440 in Chinese and at 1440 in the test language. The ordinary run takes no picture. Each picture
 * is of the page's own column, so the sidebar and the name of the person in it are not in it.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
const shots = process.env.W13Q_BUNDLES_SHOTS
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A made-up pottery studio: two modules, a problem and one bundle somebody kept earlier. */
const MODULE = 'Kiln firing schedule'
const SECOND_MODULE = 'Glaze mixing bench'
const PROBLEM = 'Glaze crawls on the north shelf'
const KEPT = 'Recover the studio before the spring sale'
/** The name the Keep it for later test keeps a bundle under. */
const KEPT_BY_THE_PAGE = 'Hand the kiln notes to the night firing'

async function request(path: string, body?: unknown, method = 'POST'): Promise<any> {
  const response = await fetch(`${app.api}${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: HEADERS,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, `${method} ${path}: ${await response.clone().text()}`).toBe(true)
  return response.json()
}

/** Open the page fresh, in a language, at a width and in a look. */
async function open(language = 'en', width = 1440, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  await app.page.goto(`${app.site}/?lang=${language}#/bundles`)
  await app.page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('#bx-preset')
}

/** Ask for the reading the page opens on, with the press that reads it, and wait for its text. */
async function readIt(): Promise<void> {
  await app.page.locator('#bx-read').click()
  await app.page.waitForSelector('#bx-thetext', { timeout: 60_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'bundles-form', viewport: { width: 1440, height: 900 } })
  await request('/api/records', { kind: 'module', title: MODULE, summary: 'When each shelf is fired, and how hot.' })
  await request('/api/records', { kind: 'module', title: SECOND_MODULE, summary: 'Where glazes are weighed and mixed.' })
  await request('/api/records', {
    kind: 'problem',
    title: PROBLEM,
    summary: 'The glaze pulls back from the clay on pots fired on the north shelf.',
    data: { symptom: 'Bare patches after firing.', state: 'open' },
  })
  await request('/api/records', { kind: 'context_bundle', title: KEPT, data: { scope: 'project', preset: 'recover_project' } })
}, 240_000)
afterAll(async () => {
  await app?.stop()
})

describe('pictures', () => {
  it.runIf(shots !== undefined && shots !== '')('photographs the page at four widths, both looks, Chinese and the test language', async () => {
    const folder = shots as string
    mkdirSync(folder, { recursive: true })
    const take = async (name: string): Promise<void> => {
      await app.page.waitForTimeout(300)
      // THE WHOLE PAGE, CUT TO THE PAGE'S OWN COLUMN. An element picture scrolls the element to the
      // top of the window, where the app's fixed bar then covers the title; a full-page picture from
      // the top has no bar over the column.
      await app.page.evaluate(() => window.scrollTo(0, 0))
      const box = await app.page.locator('.px-page').boundingBox()
      if (box === null) throw new Error('the page column is not drawn')
      await app.page.screenshot({ path: join(folder, `${name}.png`), fullPage: true, clip: box })
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await open('en', width, theme)
        await take(`bundles-${String(width)}-${theme}-arrival`)
        await readIt()
        await take(`bundles-${String(width)}-${theme}`)
      }
    }
    await open('zh', 1440, 'light')
    await readIt()
    await take('bundles-1440-light-zh')
    await open('xx', 1440, 'light')
    await readIt()
    await take('bundles-1440-light-xx')
  }, 600_000)
})

describe('the context bundles page', () => {
  it('draws the form as three labelled rows, About, For and Detail, each name beside its controls', async () => {
    await open('en', 1440)
    const rows = app.page.locator('.bx-new .bxp-row')
    const names: string[] = []
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i)
      names.push((await row.locator('.bxp-label').innerText()).trim())
      const label = await row.locator('.bxp-label').boundingBox()
      const controls = await row.locator('.bxp-controls').boundingBox()
      expect(label !== null && controls !== null, `row ${String(i + 1)} has no name or no controls`).toBe(true)
      // BESIDE, AS SETTINGS DRAWS A LABELLED ROW: the name ends before the controls start, on the same line.
      expect(label!.x + label!.width, `row ${names[i]}: the name is not beside its controls`).toBeLessThanOrEqual(controls!.x)
      expect(Math.abs(label!.y - controls!.y), `row ${names[i]}: the name is not level with its controls`).toBeLessThan(12)
    }
    expect(names).toEqual(['About', 'For', 'Detail'])
    // AND EACH ROW HOLDS ITS OWN CONTROLS.
    expect(await rows.nth(0).locator('input[type=radio]').count()).toBe(2)
    expect(await rows.nth(1).locator('#bx-preset').count()).toBe(1)
    expect(await rows.nth(2).locator('#bx-less, #bx-more').count()).toBe(2)
  }, 120_000)

  it('puts the preview beside the form at 1440 and under it at 390', async () => {
    for (const width of [1440, 390]) {
      await open('en', width)
      await readIt()
      const form = await app.page.locator('.bx-new').boundingBox()
      const preview = await app.page.locator('.bxp-preview').boundingBox()
      expect(form !== null && preview !== null).toBe(true)
      if (width === 1440) {
        expect(preview!.x, 'at 1440 the preview is not beside the form').toBeGreaterThanOrEqual(form!.x + form!.width)
        expect(Math.abs(preview!.y - form!.y), 'at 1440 the preview does not start level with the form').toBeLessThan(40)
      } else {
        expect(preview!.y, 'at 390 the preview is not under the form').toBeGreaterThanOrEqual(form!.y + form!.height)
      }
    }
  }, 120_000)

  it('has Copy the bundle as its one primary press, and it copies exactly what the preview shows', async () => {
    await app.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: app.site })
    await open('en', 1440)
    const primary = app.page.locator('.px-page .px-btn[data-variant="primary"]')
    expect(await primary.count(), 'the page has more or fewer than one primary press').toBe(1)
    expect((await primary.innerText()).trim()).toBe('Copy the bundle')
    // AT THE RIGHT OF THE TITLE (rule R5).
    const title = await app.page.locator('.px-page h1').boundingBox()
    const press = await primary.boundingBox()
    expect(press!.x, 'the primary press is not at the right of the title').toBeGreaterThan(title!.x + title!.width)

    // PRESSED BEFORE ANY READING, it reads the copy, draws it and copies that same text.
    for (const round of ['before a reading', 'after a reading']) {
      await app.page.evaluate(async () => navigator.clipboard.writeText('nothing has been copied yet'))
      await primary.click()
      await app.page.waitForSelector('.px-page .px-btn[data-variant="primary"]:has-text("Copied")', { timeout: 60_000 })
      const shown = (await app.page.locator('#bx-thetext').textContent()) ?? ''
      const copied = await app.page.evaluate(async () => navigator.clipboard.readText())
      expect(shown, `${round}: the preview shows no copy`).toContain('CONTEXT FROM MOLE OFFICE')
      expect(copied, `${round}: the clipboard does not hold what the preview shows`).toBe(shown)
    }
  }, 120_000)

  it('keeps a bundle with Keep it for later, and the kept list then shows it', async () => {
    await open('en', 1440)
    const name = KEPT_BY_THE_PAGE
    await app.page.fill('#bx-name', name)
    expect(await app.page.locator('.bx-row', { hasText: name }).count(), 'the bundle was kept before the press').toBe(0)
    await app.page.getByRole('button', { name: 'Keep it for later', exact: true }).click()
    await app.page.locator('.bx-said', { hasText: `Kept as “${name}”` }).waitFor({ timeout: 30_000 })
    const row = app.page.locator('.bxp-kept .bx-row', { hasText: name })
    await row.waitFor({ timeout: 30_000 })
    expect(await row.getByRole('button', { name: 'Copy it' }).count()).toBe(1)
    // AND THE OFFICE HOLDS IT, which is what the list is read from.
    const kept = (await request('/api/bundles')) as { bundles: { title: string }[] }
    expect(kept.bundles.map((one) => one.title)).toContain(name)
  }, 120_000)

})
