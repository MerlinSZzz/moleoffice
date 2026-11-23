// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SOURCE FILE IN A REPORT IS DRAWN AS A FILE, AND ITS TEXT NEVER LANDS IN THE PAGE'S TEXT. This
 * follows a decision that a source file is not pasted into a report; in the current drawing a .md or
 * .json file is a shown kind, so its words are drawn in the page on the reader's press. Until that
 * press the page's own text never holds the file's words.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * A .md and a .json file block in a report draw the file's name, its size, the press that shows it
 * and the press that saves it, whatever the person's media choice is. The page's text holds none of
 * either file's text, and no GET request for either file's bytes reaches the server while the page
 * is drawn. A HEAD request is allowed: it reads the type and no bytes.
 *
 * IN THE CURRENT DRAWING BOTH FILES ARE SHOWN KINDS. Once the page has read the type, the block draws a
 * Show press, a Save link, and an Open link to the office's page for the file; the Show press draws
 * the file's own words in the report, with no frame. Under the person's choice "never" no type is
 * read, so the block keeps the older drawing with its Open press, and that case asks for the older
 * drawing.
 *
 * THE SAVE PRESS IS THE PLAIN READ. The browser asks the address "Save the file" carries and is
 * answered 200 with the file's exact bytes. The Show press asks the file door for the file's words.
 *
 * PICTURES ARE NOT CHANGED BY THAT DECISION. With the media choice 'with-page' the image block is
 * drawn with its picture, and a .png file block keeps its small picture beside its name.
 *
 * THE REPORT AND ITS FILES ARE MADE UP. It lives in a test office, in this checkout's .logs/
 * folder, which is a preview root, so the file door can serve them.
 *
 * Set W13R_FILE_ATTACH_SHOTS to a folder to photograph the report's four blocks with 'with-page'
 * at 1440, 990, 660 and 390 wide, in light and dark, in English.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { sizeSaid } from '../src/shared/fileblocks.ts'
import { t } from '../src/shared/i18n.ts'
import { recordPath, shownFilePath } from '../src/web/components/router.tsx'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

/** A real PNG, 320 by 180 and one colour, large enough to be seen beside a name and above a press. */
const A_PICTURE = aPng(320, 180, [91, 141, 239])

/** A PNG of one colour, written by hand so the test needs no picture on disk. */
function aPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(typed))
    return Buffer.concat([length, typed, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** One made-up sentence in each source file, so the page's text can be searched for it. */
const IN_THE_MARKDOWN = 'The made-up markdown sentence: the test kiln is warm today.'
const IN_THE_JSON = 'The made-up json sentence: the test kiln is cold today.'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

/** This file's own folder inside .logs/, made in beforeAll and removed in afterAll. */
let OURS = ''
let MD_PATH = ''
let JSON_PATH = ''
let PNG_PATH = ''
let MD_BYTES = Buffer.alloc(0)
let JSON_BYTES = Buffer.alloc(0)

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let recordId = ''

/** Every request this page makes for a file, by path and method, so "no GET" is measured. */
const asked: { path: string; method: string }[] = []

function hashOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 16)
}

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'source-file-attach-'))
  MD_PATH = join(OURS, 'runbook.md')
  JSON_PATH = join(OURS, 'settings.json')
  PNG_PATH = join(OURS, 'diagram.png')
  MD_BYTES = Buffer.from(`# Runbook\n\n${IN_THE_MARKDOWN}\n`, 'utf8')
  JSON_BYTES = Buffer.from(`{"note": "${IN_THE_JSON}"}\n`, 'utf8')
  writeFileSync(MD_PATH, MD_BYTES)
  writeFileSync(JSON_PATH, JSON_BYTES)
  writeFileSync(PNG_PATH, A_PICTURE)

  app = await liveApp({ opensAt: 'full', name: 'source-file-attach', viewport: { width: 1440, height: 1000 } })
  // THE LOOK COMES FROM THE STORED PRESET, and the query alone does not set it: this writes the
  // preset from the query before the app's own scripts run, as the role-cards test does.
  await app.page.addInitScript(() => {
    const look = new URLSearchParams(location.search).get('look') ?? 'light'
    localStorage.setItem('mole-office.preset.theme', look)
  })

  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report with a source file and a picture',
      summary: 'Four made-up blocks: a .md file, a .json file, a .png file and a .png picture.',
      data: {
        blocks: [
          { id: 'b-md', type: 'file', path: MD_PATH, name: 'runbook.md', size: MD_BYTES.length, hash: hashOf(MD_BYTES) },
          { id: 'b-json', type: 'file', path: JSON_PATH, name: 'settings.json', size: JSON_BYTES.length, hash: hashOf(JSON_BYTES) },
          { id: 'b-png-file', type: 'file', path: PNG_PATH, name: 'diagram.png', size: A_PICTURE.length, hash: hashOf(A_PICTURE) },
          { id: 'b-png-image', type: 'image', path: PNG_PATH, alt: 'A made-up picture of one colour, 320 by 180' },
        ],
      },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  recordId = ((await filed.json()) as { record: { id: string } }).record.id

  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/file') {
      asked.push({ path: url.searchParams.get('path') ?? '', method: request.method() })
    }
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

/** Say which answer the person has chosen, and load the report again holding it. */
async function choose(choice: string): Promise<void> {
  await app.page.goto('about:blank')
  const set = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: choice }),
  })
  expect(set.status, await set.clone().text()).toBe(200)
  asked.length = 0
  await app.page.goto(`${app.site}/#${recordPath(recordId)}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await waitForTheImageBlock()
}

/**
 * Wait for the picture block to settle, whichever way it went.
 *
 * SETTLED MEANS THE PERSON'S CHOICE HAS BEEN READ. The figure draws a held stand before the row is
 * read, with `data-media-load="not-read"`, and that is not a state this test may read: it is the
 * moment before the answer. So the wait ignores it and wants either a real image or a held stand
 * that names the choice in force.
 */
async function waitForTheImageBlock(): Promise<void> {
  await app.page.waitForSelector('.sb-image', { timeout: 30_000 })
  await app.page.waitForFunction(
    () => {
      const box = document.querySelector('figure.sb-image')
      if (box === null) return false
      const held = box.querySelector('.sb-image-held')
      if (held !== null) return held.getAttribute('data-media-load') !== 'not-read'
      const media = box.querySelector('img, video')
      if (media !== null) return true
      const stand = box.querySelector('.sb-image-stand')
      if (stand === null) return false
      const phase = stand.getAttribute('data-preview')
      return phase !== 'asking' && phase !== 'not-asked'
    },
    undefined,
    { timeout: 30_000 },
  )
}

/** The figure of the file block whose name this is. */
function figureFor(name: string) {
  return app.page.locator('figure.sb-file').filter({ hasText: name })
}

/** How many GET requests for this file's bytes the page made since the last reading. */
function getsFor(path: string): number {
  return asked.filter((one) => one.path === path && one.method === 'GET').length
}

/**
 * What both source files must draw under the choice that reads no type: the older drawing, with
 * the name, the size, the Open press and the Save link. The half that matters: no GET asked the
 * door for their bytes. A HEAD for the type is not counted, because it reads the type and no bytes.
 */
async function expectBothSourceFilesDrawAsAttachedFiles(): Promise<void> {
  for (const [name, size] of [['runbook.md', MD_BYTES.length], ['settings.json', JSON_BYTES.length]] as const) {
    const figure = figureFor(name)
    await figure.waitFor({ timeout: 30_000 })
    expect(await figure.locator('.sb-file-name').innerText(), name).toBe(name)
    expect(await figure.locator('.sb-file-size').innerText(), name).toBe(sizeSaid(size))
    expect(await figure.locator('.sb-file-open').innerText(), name).toBe(t('sb.file.open'))
    expect(await figure.locator('.sb-file-save').innerText(), name).toBe(t('sb.file.save'))
    expect(await figure.locator('.sb-file-code').count(), `${name} drew a code box`).toBe(0)
  }
  // AND NEITHER FILE'S TEXT IS IN THE PAGE.
  const text = await app.page.locator('body').innerText()
  expect(text, 'the markdown file text was copied into the page').not.toContain(IN_THE_MARKDOWN)
  expect(text, 'the json file text was copied into the page').not.toContain(IN_THE_JSON)
  expect(getsFor(MD_PATH), 'a GET asked the door for the markdown file bytes').toBe(0)
  expect(getsFor(JSON_PATH), 'a GET asked the door for the json file bytes').toBe(0)
}

/**
 * What both source files must draw once their type is read: the name, the size, the Show press, the
 * Save link, and the Open press to the office's page for the file. The same half matters: no GET for
 * their bytes has been asked.
 */
async function expectBothSourceFilesDrawAsShownFiles(): Promise<void> {
  for (const [name, size, path] of [['runbook.md', MD_BYTES.length, MD_PATH], ['settings.json', JSON_BYTES.length, JSON_PATH]] as const) {
    const figure = figureFor(name)
    await figure.waitFor({ timeout: 30_000 })
    expect(await figure.locator('.sb-file-name').innerText(), name).toBe(name)
    expect(await figure.locator('.sb-file-size').innerText(), name).toBe(sizeSaid(size))
    expect(await figure.locator('button.sb-file-show').innerText(), name).toBe(t('sb.file.show'))
    expect(await figure.locator('.sb-file-save').innerText(), name).toBe(t('sb.file.save'))
    expect(await figure.locator('.sb-file-open').innerText(), name).toBe(t('sb.file.open'))
    expect(await figure.locator('.sb-file-open').getAttribute('href'), name).toBe(`#${shownFilePath(recordId, path)}`)
    expect(await figure.locator('.sb-file-code').count(), `${name} drew a code box`).toBe(0)
  }
  // AND NEITHER FILE'S TEXT IS IN THE PAGE.
  const text = await app.page.locator('body').innerText()
  expect(text, 'the markdown file text was copied into the page').not.toContain(IN_THE_MARKDOWN)
  expect(text, 'the json file text was copied into the page').not.toContain(IN_THE_JSON)
  expect(getsFor(MD_PATH), 'a GET asked the door for the markdown file bytes').toBe(0)
  expect(getsFor(JSON_PATH), 'a GET asked the door for the json file bytes').toBe(0)
}

/** Ask the address a press carries, in this browser, and hand back the answer. */
async function pressIt(figure: ReturnType<typeof figureFor>, press: string) {
  const href = await figure.locator(press).getAttribute('href')
  if (href === null) throw new Error(`the ${press} press has no address`)
  return app.page.request.get(new URL(href, app.site).toString())
}

it('with the page, draws both source files as shown files, quotes neither, and both presses read them', async () => {
  await choose('with-page')
  await expectBothSourceFilesDrawAsShownFiles()

  // THE SAVE PRESS IS THE PLAIN READ: 200, and the file's exact bytes.
  for (const [name, bytes] of [['runbook.md', MD_BYTES], ['settings.json', JSON_BYTES]] as const) {
    const answer = await pressIt(figureFor(name), '.sb-file-save')
    expect(answer.status(), name).toBe(200)
    expect(Buffer.from(await answer.body()), name).toEqual(bytes)
  }

  // THE SHOW PRESS DRAWS THE FILE'S OWN WORDS IN THE REPORT, with no frame. The Markdown file is
  // drawn as Markdown, so its '#' line is a heading.
  for (const [name, inTheFile] of [['runbook.md', IN_THE_MARKDOWN], ['settings.json', IN_THE_JSON]] as const) {
    const figure = figureFor(name)
    await figure.locator('button.sb-file-show').click()
    const reader = figure.locator('.sb-file-words')
    await reader.waitFor({ timeout: 30_000 })
    await expect.poll(async () => reader.innerText(), { timeout: 30_000 }).toContain(inTheFile)
    expect(await figure.locator('iframe').count(), name).toBe(0)
  }
  expect(await figureFor('runbook.md').locator('.sb-file-words h3').innerText()).toBe('Runbook')
}, 240_000)

it('with the page, leaves the pictures as they were: the image block loads and the .png file keeps its small picture', async () => {
  await choose('with-page')

  // THE IMAGE BLOCK IS DRAWN AND ITS PICTURE LOADS.
  await app.page.waitForFunction(
    () => {
      const img = document.querySelector('figure.sb-image img')
      return img !== null && (img as HTMLImageElement).naturalWidth > 0
    },
    undefined,
    { timeout: 20_000 },
  )
  // THE .PNG FILE BLOCK DRAWS ITS SMALL PICTURE BESIDE ITS NAME.
  const png = figureFor('diagram.png')
  await png.locator('.sb-file-preview img').waitFor({ timeout: 20_000 })
  expect(
    await png.locator('.sb-file-preview img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    'the small picture beside the .png file did not load',
  ).toBeGreaterThan(0)
}, 240_000)

it('with never, still draws both source files as attached files with their Open press and asks for no bytes', async () => {
  await choose('never')
  await expectBothSourceFilesDrawAsAttachedFiles()
}, 180_000)

it('with on a press, still draws both source files as shown files and asks for no bytes', async () => {
  await choose('on-press')
  await expectBothSourceFilesDrawAsShownFiles()
}, 180_000)

// PUT IT BACK, so a run of this file twice starts from the same place.
it('takes the choice away again, and the default is with the page', async () => {
  const cleared = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: '' }),
  })
  expect(cleared.status, await cleared.clone().text()).toBe(200)
})

it.skipIf(process.env['W13R_FILE_ATTACH_SHOTS'] === undefined)(
  'photographs the report at four widths in both looks, in English',
  async () => {
    const folder = process.env['W13R_FILE_ATTACH_SHOTS'] as string
    mkdirSync(folder, { recursive: true })
    await choose('with-page')
    for (const width of [1440, 990, 660, 390]) {
      let light: Buffer | null = null
      for (const theme of ['light', 'dark'] as const) {
        await app.page.setViewportSize({ width, height: 1000 })
        await app.page.goto(`${app.site}/?lang=en&look=${theme}#${recordPath(recordId)}`, { timeout: 60_000 })
        await waitForThePage(app.page, 60_000)
        await waitForTheImageBlock()
        await app.page.waitForFunction(
          () => {
            const img = document.querySelector('figure.sb-image img')
            return img !== null && (img as HTMLImageElement).naturalWidth > 0
          },
          undefined,
          { timeout: 20_000 },
        )
        // THE LABEL GOES INTO THE PICTURE'S OWN FLOW, above the report's first block, before the
        // picture is taken.
        await putTheMadeUpLabelIn(app.page, 'Made-up data — a report in a test office', app.page.locator('#main > *').first(), 'the report page')
        const shot = await app.page.screenshot({ fullPage: true })
        writeFileSync(join(folder, `source-file-attach-${width}-${theme}.png`), shot)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `fits ${width}`).toBe(true)
        // THE TWO LOOKS MUST BE TWO PICTURES. A theme the page never took would give the same bytes
        // twice, and this is the one place a fault in the photograph would show.
        if (theme === 'light') light = shot
        else expect(light !== null && light.equals(shot), `the dark picture at ${width} is the light one`).toBe(false)
      }
    }
  },
  600_000,
)
