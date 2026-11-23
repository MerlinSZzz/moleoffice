// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PREVIEW BRINGS ONE PRESS AT A TIME, AND A PATH IS A ROW OF ITS OWN, in three more places than the data folder panel.
 * Each case runs at a desk's width, 1440, and a phone's, 390.
 *
 * WHAT THIS PROVES
 *
 *   1. The sidebar arrangement's editor, src/web/components/SidebarArrangement.tsx, draws one press at a time. First
 *      the preview alone, with no Apply and no reason. A preview that names a problem keeps the preview as the one
 *      press. Once a preview says the arrangement can be applied, the reason and Apply, and the preview is gone. A
 *      change to the arrangement brings the preview back and takes Apply away.
 *   2. The storage destinations panel, src/web/components/StorageDestinations.tsx, draws the credentials file as a row
 *      of its own, Credentials file, in the office's code style, and no sentence holds it. Before the file is made,
 *      the row says so with a state word after the file, and still no sentence.
 *   3. The gate-count spool block of the gates panel, src/web/components/GatesPanel.tsx, draws three rows in the code
 *      style, the spool's folder, the world it belongs to and this office's world, and no sentence holds the folder.
 *
 * THE WORLD. A throwaway office from tests/helpers.ts, its pages in the shared Chromium, in Normal mode and English.
 * Each case changes the answer of one door with page.route: the sidebar preview, the storage destinations reading or
 * the gates reading. The request still reaches the test's office, so the headers are its own, and only the body is the
 * test's. Nothing is written: a preview writes nothing, and no case presses Apply or a save. Every word is read by its key.
 * Where a place had a sentence holding a path, the sentence is gone and only the row is drawn; no sentence is added.
 */
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createI18n } from '../src/shared/i18n.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const en = createI18n('en')
const SIDEBAR = '[data-sidebar-arrangement]'
const STORAGE = '[data-storage-destinations]'
const CREDENTIALS = `${STORAGE} [data-storage-credentials]`
const SPOOL = '[data-target="uiSurface/settings.gates"] [data-gate-spool]'
const THE_SIDEBAR_PREVIEW = '**/api/sidebar/preview'
const THE_STORAGE_READING = '**/api/office/storage-destinations'
const THE_GATES_READING = '**/api/office/gates'
const A_CREDENTIALS_FILE = '/srv/made-up/storage-destination-secrets.env'
const A_SPOOL = { folder: '/srv/made-up/sandboxes/.gate-counts', itsWorld: 'made-up-world-of-another-office', thisWorld: 'made-up-world-of-this-office', mayPress: true }
/** The sidebar editor's presses that come before and after a preview, each by its word key. */
const THE_SIDEBAR_PRESSES = ['sidebarSetting.preview', 'sidebarSetting.apply'] as const

let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'one-press-and-paths-apart', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** A window of this test's own at one width, with the page at this address open and drawn. */
async function thePageAt(width: number, address: string, drawn: string, routes: (page: Page) => Promise<void>): Promise<Page> {
  const page = await app.context.newPage()
  page.setDefaultTimeout(30_000)
  await page.setViewportSize({ width, height: 1000 })
  await routes(page)
  await page.goto(`${app.site}/?lang=en&mode=normal#/${address}`)
  await waitForThePage(page, 60_000)
  await page.locator(drawn).first().waitFor({ timeout: 30_000 })
  return page
}

/** One of the sidebar editor's presses, by its word key. */
function aSidebarPress(page: Page, key: WordKey): Locator {
  return page.locator(SIDEBAR).getByRole('button', { name: en.t(key), exact: true })
}

/** The word keys of the sidebar editor's presses drawn now, in the order of THE_SIDEBAR_PRESSES. */
async function theSidebarPressesDrawn(page: Page): Promise<string[]> {
  const drawn: string[] = []
  for (const key of THE_SIDEBAR_PRESSES) if ((await aSidebarPress(page, key).count()) > 0) drawn.push(key)
  return drawn
}

/** Each label of the rows in this place, with the text of the first element on its row and that element's tag. */
async function theRows(place: Locator): Promise<{ label: string; path: string; tag: string }[]> {
  return place.evaluate((holder) =>
    [...holder.querySelectorAll('dt')].map((term) => {
      const path = term.nextElementSibling?.firstElementChild ?? null
      return { label: term.textContent ?? '', path: path?.textContent ?? '', tag: path?.tagName ?? 'none' }
    }),
  )
}

/** The text of each sentence in this place. */
async function theSentences(place: Locator): Promise<string[]> {
  return place.locator('p').allTextContents()
}

/** How a path is drawn: the element that holds exactly this text, its font, and the font a code element has there. */
async function howThePathIsDrawn(place: Locator, path: string): Promise<{ tag: string; font: string; codeFont: string }> {
  return place.evaluate((holder, text) => {
    const holders = [...holder.querySelectorAll('*')].filter((one) => one.children.length === 0 && one.textContent === text)
    const found = holders[0]
    const code = document.createElement('code')
    code.textContent = text
    holder.appendChild(code)
    const codeFont = getComputedStyle(code).fontFamily
    code.remove()
    return { tag: found?.tagName ?? 'none', font: found === undefined ? 'none' : getComputedStyle(found).fontFamily, codeFont }
  }, path)
}

/** The path on its own row under its label, in the code style and not in the font of the sentence above it. */
async function aRowOfItsOwn(place: Locator, label: WordKey, path: string, sentence: string): Promise<void> {
  expect(await theRows(place)).toContainEqual({ label: en.t(label), path, tag: 'CODE' })
  for (const said of await theSentences(place)) expect(said, 'a sentence holds the path').not.toContain(path)
  const drawn = await howThePathIsDrawn(place, path)
  const sentencesFont = await place.getByText(sentence, { exact: true }).evaluate((one) => getComputedStyle(one).fontFamily)
  expect(drawn.font, `${path} is not in the office's code font`).toBe(drawn.codeFont)
  expect(drawn.font, `${path} is drawn in the sentence's font`).not.toBe(sentencesFont)
}

async function noSideways(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

for (const width of [1440, 390]) {
  describe(`one press at a time and each path apart, at ${String(width)} wide`, () => {
    it('the sidebar editor shows the preview alone, then Apply alone once a preview says it can be applied', async () => {
      let refuse = true
      const page = await thePageAt(width, 'sidebar-arrangement/edit', `${SIDEBAR} [data-sidebar-group] select`, async (page) => {
        await page.route(THE_SIDEBAR_PREVIEW, async (route) => {
          const response = await route.fetch()
          const reply = (await response.json()) as { problems: string[] }
          await route.fulfill({ response, json: refuse ? { ...reply, problems: ['The test refuses this arrangement.'] } : { ...reply, problems: [] } })
        })
      })
      try {
        const reason = page.locator(SIDEBAR).getByLabel(en.t('sidebarSetting.reason'), { exact: true })
        // THE FIRST STEP: the preview alone, with no reason to give yet.
        expect(await theSidebarPressesDrawn(page)).toEqual(['sidebarSetting.preview'])
        expect(await reason.count()).toBe(0)

        // A PREVIEW THAT NAMES A PROBLEM IS NOT A DONE STEP: the preview stays the one press.
        await aSidebarPress(page, 'sidebarSetting.preview').click()
        await page.locator(SIDEBAR).getByText(en.t('sidebarSetting.refused'), { exact: true }).waitFor()
        expect(await theSidebarPressesDrawn(page)).toEqual(['sidebarSetting.preview'])
        expect(await reason.count()).toBe(0)

        // A PREVIEW THAT SAYS IT CAN BE APPLIED IS THE DONE STEP: the reason and Apply, and the preview is gone.
        refuse = false
        await aSidebarPress(page, 'sidebarSetting.preview').click()
        await page.locator(SIDEBAR).getByText(en.t('sidebarSetting.valid'), { exact: true }).waitFor()
        expect(await theSidebarPressesDrawn(page)).toEqual(['sidebarSetting.apply'])
        expect(await reason.count()).toBe(1)
        await noSideways(page)

        // A CHANGE TO THE ARRANGEMENT is a new arrangement, so the preview comes back and Apply goes.
        await page.locator(`${SIDEBAR} [data-sidebar-group] [data-sidebar-page]`).first().locator('.sa-controls button').nth(1).click()
        expect(await theSidebarPressesDrawn(page)).toEqual(['sidebarSetting.preview'])
        expect(await reason.count()).toBe(0)
      } finally {
        await page.close()
      }
    }, 120_000)

    it('the storage destinations panel draws the credentials file on its own row, and no sentence holds it', async () => {
      let exists = true
      const page = await thePageAt(width, 'settings/storage', CREDENTIALS, async (page) => {
        await page.route(THE_STORAGE_READING, async (route) => {
          if (route.request().method() !== 'GET') { await route.continue(); return }
          const response = await route.fetch()
          const reply = (await response.json()) as Record<string, unknown>
          await route.fulfill({ response, json: { ...reply, credentials: { file: A_CREDENTIALS_FILE, from: 'data-folder', exists, usable: true, refused: null, modeSaysWhoMayRead: true } } })
        })
      })
      try {
        const where = page.locator(CREDENTIALS)
        const notMadeYet = where.getByText(en.t('storageDestinations.row.notMadeYet'), { exact: true })
        const aSentence = en.t('storageDestinations.fromDataFolder')
        await where.locator('dd code').waitFor()
        await aRowOfItsOwn(where, 'storageDestinations.row.credentialsFile', A_CREDENTIALS_FILE, aSentence)
        expect(await notMadeYet.count()).toBe(0)
        await noSideways(page)

        // BEFORE THE FILE IS MADE the row says so with a state word, and no sentence is added.
        exists = false
        await page.reload()
        await waitForThePage(page, 60_000)
        await notMadeYet.waitFor()
        await aRowOfItsOwn(where, 'storageDestinations.row.credentialsFile', A_CREDENTIALS_FILE, aSentence)
        expect(await where.locator('p').allTextContents()).not.toContain(en.t('storageDestinations.row.notMadeYet'))
        await noSideways(page)
      } finally {
        await page.close()
      }
    }, 120_000)

    it("the spool block draws the spool's folder and the two worlds as rows, and no sentence holds the folder", async () => {
      const page = await thePageAt(width, 'settings/gates', SPOOL, async (page) => {
        await page.route(THE_GATES_READING, async (route) => {
          const response = await route.fetch()
          await route.fulfill({ response, json: { ...(await response.json()), spool: A_SPOOL } })
        })
      })
      try {
        const spool = page.locator(SPOOL)
        await spool.locator('dd code').first().waitFor()
        expect(await theRows(spool)).toEqual([
          { label: en.t('gates.spool.row.folder'), path: A_SPOOL.folder, tag: 'CODE' },
          { label: en.t('gates.spool.row.belongsTo'), path: A_SPOOL.itsWorld, tag: 'CODE' },
          { label: en.t('gates.spool.row.thisOffice'), path: A_SPOOL.thisWorld, tag: 'CODE' },
        ])
        await aRowOfItsOwn(spool, 'gates.spool.row.folder', A_SPOOL.folder, en.t('gates.spool.what'))
        await noSideways(page)
      } finally {
        await page.close()
      }
    }, 120_000)
  })
}
