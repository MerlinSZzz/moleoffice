// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES THE PRODUCT OFFERS ARE DRAWN ON THE PAGES, READ FROM public/.
 *
 * FLO-51 (report X8UHfSEhYLn2) moved design/avatars/ to public/avatars/ and design/portraits/ to
 * public/portraits/, so that design/ can become a private folder. The server reads both folders and
 * the page asks the server for them, at /api/avatars/..., /api/portraits/... and
 * /api/chat-circle/.... A wrong path on the server does not break a page loudly: a portrait folder
 * that is not there is an empty list, and a picture that is not there is a broken image. So this
 * opens two pages in a real browser and checks that each picture from those folders arrived with
 * pixels behind it:
 *
 * - the Embassy, where a card holder's row draws its role card's portrait, a row with no card draws
 *   its avatar, and the corner draws the round chat button's picture;
 * - the roster's picture editor, which draws the whole avatar set.
 *
 * PICTURES. With W13P_ART_SHOTS set to a folder, it photographs both pages at 1440, 990, 660 and
 * 390 in light and dark, and at 1440 in Chinese, into that folder and nowhere else. Without it, it
 * photographs nothing and checks the light look alone: the dark look sets colour and shadow only, so
 * a check of pictures arriving learns nothing more from it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const looks: readonly ('light' | 'dark')[] = process.env['W13P_ART_SHOTS'] ? ['light', 'dark'] : ['light']
const widths = [1440, 990, 660, 390] as const

/** The three addresses the moved pictures are served at. */
const FROM_THE_MOVED_FOLDERS = ['/api/portraits/', '/api/avatars/', '/api/chat-circle/'] as const

interface DrawnPicture {
  src: string
  complete: boolean
  width: number
}

/** Every image on the page that comes from one of the moved folders, and whether it was drawn. */
async function thePicturesFromTheMovedFolders(): Promise<DrawnPicture[]> {
  await app.page.evaluate(() => {
    for (const img of document.querySelectorAll('img')) (img as HTMLImageElement).loading = 'eager'
  })
  await app.page.waitForFunction(
    () => Array.from(document.querySelectorAll('img')).every((one) => (one as HTMLImageElement).complete),
    undefined,
    { timeout: 60_000 },
  )
  const all = await app.page.$$eval('img', (images) =>
    images.map((one) => {
      const img = one as HTMLImageElement
      return { src: img.currentSrc || img.src, complete: img.complete, width: img.naturalWidth }
    }),
  )
  return all.filter((one) => FROM_THE_MOVED_FOLDERS.some((address) => one.src.includes(address)))
}

async function useLook(look: string): Promise<void> {
  await app.page.goto(`${app.site}/`)
  await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
}

async function openTheEmbassy(language: 'en' | 'zh' = 'en'): Promise<void> {
  await app.page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#/embassy`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.emb-list', { timeout: 30_000 })
  const everyone = await app.page.$('button.emb-show:has-text("Show everyone")')
  if (everyone !== null) await everyone.click()
  await app.page.waitForSelector('.emb-portrait', { timeout: 30_000 })
}

async function openThePicker(language: 'en' | 'zh' = 'en'): Promise<void> {
  await app.page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#/working`, { timeout: 60_000 })
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.agap-toggle', { timeout: 30_000 })
  if ((await app.page.$('.avp-grid')) === null) await app.page.click('.agap-toggle')
  await app.page.waitForSelector('.avp-one', { timeout: 30_000 })
}

/** Photograph the page as it stands, at every width, into the folder W13P_ART_SHOTS names. */
async function photograph(name: string, onlyWidths: readonly number[] = widths): Promise<void> {
  const folder = process.env['W13P_ART_SHOTS']
  if (!folder) return
  mkdirSync(folder, { recursive: true })
  for (const width of onlyWidths) {
    await app.page.setViewportSize({ width, height: 1000 })
    await thePicturesFromTheMovedFolders()
    await app.page.screenshot({ path: join(folder, `${name}-${String(width)}.png`), fullPage: true })
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'offered-pictures-from-public', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Builder X', data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // THE CORNER DRAWS ITS ROUND BUTTON ONLY WHILE A MESSAGE WAITS for the person, as the chat's design D
  // says, so one made-up message from the made-up agent waits through every look.
  const waiting = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-x' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up waiting line', data: { body: 'A made-up line waiting for the reader.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(waiting.status, await waiting.clone().text()).toBe(201)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Embassy draws the portraits, the avatars and the chat button from public/', () => {
  it.each(looks)('draws every one with pixels behind it, in the %s look', async (look) => {
    await useLook(look)
    await openTheEmbassy()
    const pictures = await thePicturesFromTheMovedFolders()
    const portraits = pictures.filter((one) => one.src.includes('/api/portraits/role/'))
    // THE CONTROL: a portrait is drawn at all. With none, the check below would hold over nothing.
    expect(portraits.length, 'the Embassy drew no role card portrait').toBeGreaterThan(0)
    expect(pictures.some((one) => one.src.includes('/api/chat-circle/')), 'the chat button drew no picture').toBe(true)
    const broken = pictures.filter((one) => !one.complete || one.width === 0).map((one) => one.src)
    expect(broken, `these pictures did not draw: ${broken.join(', ')}`).toEqual([])
    await photograph(`embassy-${look}`)
  }, 180_000)

  it('draws them in Chinese as well', async () => {
    await useLook('light')
    await openTheEmbassy('zh')
    const pictures = await thePicturesFromTheMovedFolders()
    expect(pictures.filter((one) => one.src.includes('/api/portraits/role/')).length).toBeGreaterThan(0)
    expect(pictures.filter((one) => !one.complete || one.width === 0).map((one) => one.src)).toEqual([])
    await photograph('embassy-zh', [1440])
  }, 180_000)
})

describe('the picture editor draws the whole avatar set from public/', () => {
  it.each(looks)('draws every one with pixels behind it, in the %s look', async (look) => {
    await useLook(look)
    await openThePicker()
    const pictures = await thePicturesFromTheMovedFolders()
    const offered = pictures.filter((one) => one.src.includes('/api/avatars/'))
    // THE CONTROL: the set is drawn at all, from both of its folders.
    expect(offered.some((one) => one.src.includes('/api/avatars/drawn/')), 'no drawn avatar was offered').toBe(true)
    expect(offered.some((one) => one.src.includes('/api/avatars/generated/')), 'no generated avatar was offered').toBe(true)
    const broken = pictures.filter((one) => !one.complete || one.width === 0).map((one) => one.src)
    expect(broken, `these pictures did not draw: ${broken.join(', ')}`).toEqual([])
    await photograph(`picker-${look}`)
  }, 180_000)

  it('draws them in Chinese as well', async () => {
    await useLook('light')
    await openThePicker('zh')
    const pictures = await thePicturesFromTheMovedFolders()
    expect(pictures.filter((one) => one.src.includes('/api/avatars/')).length).toBeGreaterThan(0)
    expect(pictures.filter((one) => !one.complete || one.width === 0).map((one) => one.src)).toEqual([])
    await photograph('picker-zh', [1440])
  }, 180_000)
})
