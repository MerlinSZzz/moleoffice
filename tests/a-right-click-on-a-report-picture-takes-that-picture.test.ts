// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK ON A REPORT PICTURE NAMES THE PICTURE, wherever its image block is drawn.
 *
 * The report below is invented for this browser test. Its pictures cover the render paths that
 * can hold image blocks: the report body itself, a section, columns, a grid, tabs, and a beside
 * composition. The SVG is served by this test's page so the browser draws a real picture without
 * relying on a file on the machine running the test.
 *
 * Set PICTURE_POINT_SHOTS to a folder to photograph the open panel at 1440, 990, 660 and 390 in
 * both themes, and at 1440 in Chinese. The ordinary test run takes no pictures.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'

const REPORT_TITLE = 'A made-up report with several pictures'
const IMAGE_BASE = 'picture-point'
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#587b9b"/><circle cx="60" cy="40" r="22" fill="#f4ce77"/></svg>'
let picturesFolder = ''

function picturePath(slug: string): string {
  return join(picturesFolder, `${IMAGE_BASE}-${slug}.svg`)
}

interface PictureCase {
  shape: string
  slug: string
}

const PICTURES: PictureCase[] = [
  { shape: 'the report body', slug: 'body' },
  { shape: 'a section', slug: 'section' },
  { shape: 'columns', slug: 'columns' },
  { shape: 'a grid', slug: 'grid' },
  { shape: 'tabs', slug: 'tabs' },
  { shape: 'a beside composition', slug: 'beside' },
]

function image(slug: string) {
  return {
    id: `picture-${slug}`,
    type: 'image',
    path: picturePath(slug),
    alt: `Made-up picture ${slug}`,
  }
}

function blocksForReport() {
  return [
    image('body'),
    {
      id: 'section-holder',
      type: 'section',
      title: 'A made-up section',
      blocks: [image('section')],
    },
    {
      id: 'columns-holder',
      type: 'columns',
      columns: [[image('columns')], [{ id: 'column-note', type: 'text', text: 'A made-up note.' }]],
    },
    {
      id: 'grid-holder',
      type: 'grid',
      blocks: [image('grid'), { id: 'grid-note', type: 'text', text: 'Another made-up note.' }],
    },
    {
      id: 'tabs-holder',
      type: 'tabs',
      tabs: [
        { id: 'picture-tab', label: 'Picture', blocks: [image('tabs')] },
        { id: 'note-tab', label: 'Note', blocks: [{ id: 'tab-note', type: 'text', text: 'A tab note.' }] },
      ],
    },
    {
      id: 'beside-holder',
      type: 'beside',
      parts: [
        { id: 'beside-note', share: 2, blocks: [{ id: 'beside-text', type: 'text', text: 'Beside this note.' }] },
        { id: 'beside-picture', share: 1, blocks: [image('beside')] },
      ],
    },
  ]
}

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

let app: LiveApp
let reportId = ''

async function openReport(language: string | null = null): Promise<void> {
  await app.page.goto(`${app.site}/${language === null ? '' : `?lang=${language}`}#/r/${reportId}`, {
    timeout: 60_000,
  })
  await waitForThePage(app.page, 60_000)
}

async function pointAt(slug: string): Promise<{ kind: string; what: string }> {
  const picture = app.page.locator(`img[alt="Made-up picture ${slug}"]`).first()
  await picture.waitFor({ timeout: 20_000 })
  await picture.scrollIntoViewIfNeeded()
  await app.page.waitForFunction(
    (alt: string) => {
      const image = [...document.querySelectorAll<HTMLImageElement>('img')].find((one) => one.alt === alt)
      return image !== undefined && image.naturalWidth > 0
    },
    `Made-up picture ${slug}`,
    { timeout: 20_000 },
  )
  await picture.click({ button: 'right' })
  const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
  await talk.waitFor({ timeout: 15_000 })
  const kind = (await talk.locator('.px-talk-chip-kind').textContent())?.trim() ?? ''
  const what = (await talk.locator('.px-talk-chip-what').textContent())?.trim() ?? ''
  return { kind, what }
}

beforeAll(async () => {
  picturesFolder = mkdtempSync(join(tmpdir(), 'pp-'))
  mkdirSync(picturesFolder, { recursive: true })
  for (const { slug } of PICTURES) writeFileSync(picturePath(slug), SVG)
  const oldPreviewRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = picturesFolder
  try {
    app = await liveApp({
      name: 'right-click-report-picture',
      opensAt: 'full',
      viewport: { width: 1440, height: 1000 },
    })
  } finally {
    if (oldPreviewRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
    else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = oldPreviewRoots
  }

  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ kind: 'report', title: REPORT_TITLE, data: { blocks: blocksForReport() } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  reportId = ((await made.json()) as { record: { id: string } }).record.id
  await openReport()
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (picturesFolder !== '') rmSync(picturesFolder, { recursive: true, force: true })
}, 60_000)

describe('right-clicking a picture in a report', () => {
  it.each(PICTURES)('takes the picture held by $shape', async ({ slug }) => {
    await app.page.keyboard.press('Escape')
    const pointed = await pointAt(slug)
    expect(pointed.kind, `the panel named the ${slug} picture as something else`).toBe('Picture')
    // THE PICTURE IS CALLED BY ITS ALT TEXT since wave 13s round 12: a person no longer sees the file's
    // path, so the panel names the picture by what it shows rather than by its file name.
    expect(pointed.what, `the panel did not name the ${slug} picture`).toBe(`Made-up picture ${slug}`)
    expect(pointed.what, `the panel named the report instead of the ${slug} picture`).not.toContain(REPORT_TITLE)
  }, 60_000)

  it.skipIf(!process.env['PICTURE_POINT_SHOTS'])(
    'leaves a picture open for the light, dark, narrow and Chinese looks',
    async () => {
      const shots = process.env['PICTURE_POINT_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const takes: { width: number; theme: 'light' | 'dark'; language: string | null }[] = [
        ...[1440, 990, 660, 390].flatMap((width) =>
          (['light', 'dark'] as const).map((theme) => ({ width, theme, language: null })),
        ),
        { width: 1440, theme: 'light', language: 'zh' },
        { width: 1440, theme: 'dark', language: 'zh' },
      ]

      for (const take of takes) {
        await app.page.setViewportSize({ width: take.width, height: 1000 })
        await openReport(take.language)
        await app.page.evaluate((theme) => {
          localStorage.setItem('mole-office.preset.theme', theme)
          localStorage.setItem('mole-office.chat.size', '640x880')
        }, take.theme)
        await app.page.reload({ timeout: 60_000 })
        await waitForThePage(app.page, 60_000)
        expect(await app.page.locator('html').getAttribute('data-theme'), `${take.width}px ${take.theme}`).toBe(take.theme)
        const pointed = await pointAt('section')
        expect(pointed.what, `the ${take.language ?? 'English'} panel did not name the picture`).toBe(
          'Made-up picture section',
        )
        const language = take.language === null ? '' : `-${take.language}`
        await app.page.screenshot({
          path: `${shots}/picture-point-${String(take.width)}-${take.theme}${language}.png`,
          fullPage: false,
        })
        await app.page.keyboard.press('Escape')
      }
    },
    240_000,
  )
})
