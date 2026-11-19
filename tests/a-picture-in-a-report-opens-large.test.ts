// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PICTURE IN A REPORT OPENS LARGE WHEN IT IS PRESSED, AND THE TALK BOX FINDS IT ON THE PAGE.
 *
 * Problem T3yQblhc2A28. On 3 October 2026 the owner pressed a picture in report O_wVUc-0nhOy
 * to look at it closely and got the talk box's 「…不在这个页面上」 ("Not on this page") instead.
 *
 * WHAT A PRESS DID BEFORE THIS FIX, measured by this file's first version on a fresh test office:
 *   - an ordinary press on the picture did nothing at all;
 *   - a right-click, and a press while "Ask agent" marks what can be talked about, opened the talk box
 *     about "Picture <path>", and the box said "Not on this page". A press on a picture names the
 *     region `<block>.path`, and no element on the page answered to that name.
 *
 * WHAT THIS FILE HOLDS, in a real browser on a fresh test office of its own:
 *   - an ordinary press on an image block shows the picture large, at 1440, 990, 660 and 390; Escape
 *     closes it, and so does a press outside the picture;
 *   - a right-click on a picture, and a press on it in the "Ask agent" mode, open the talk box about
 *     the picture, and the talk box does not say "Not on this page";
 *   - a file block whose file is a picture shows a small one beside its name and its open press, and
 *     pressing that opens it large; a file that is not a picture shows no small picture. In the
 *     current drawing a PDF is drawn by FileShownHere, so its press is "Show it here" and it saves beside it.
 *
 * AND, SINCE ROUND 12 (the secretary's review of round 11's pictures, report NswdOyB8lM-U):
 *   - a file block that still draws an open link says "Open the file" in the page's language:
 *     打开文件, and the PDF's size is said in the page's language too, 44 字节. The PDF's own press
 *     is the Show press, whose word has no Chinese at this tip, so the language check is made on
 *     the open link of the picture file block;
 *   - on a narrow screen a wide picture opens at its own pixels with one press, "Full size", and the
 *     view scrolls both ways; a press on the picture goes back to fitted;
 *   - a closed picture carries a quiet mark that it opens, without hover, and the keyboard opens it;
 *   - a person sees no path, no stored file name and no hash; developer mode (?mode=inspect) sees them.
 *
 * AND, SINCE ROUND 13 (the secretary's review of round 12's pictures, report 8eIIwl4erxDt):
 *   - at 390 the picked picture's outline passes under the phone's top bar;
 *   - at 390 the talk box is a sheet from the bottom, and the picked picture sits whole above it;
 *   - where the fitted view would add almost nothing (990, 660, 390), one press opens at full size;
 *   - a picture drawn narrower than 720 px carries the ⤢ mark alone, which leaves its bottom edge clear;
 *   - Escape, Close and a press outside close the view by mouse, keyboard and touch.
 *
 * AND, SINCE ROUND 13B (the check K7gPORymm8MT): the talk box's sheet switches at NARROW_QUERY, the one
 * place in src/web/components/ui.tsx that writes down a phone's width, and not one pixel wider.
 * Every test picture has words in its four corners and along its bottom edge, so a picture can show
 * what a mark covers; one is tall, so a full-size picture can be shown scrolled to a corner.
 * With TEST_SHOTS set, the report is photographed at the four widths, light and dark, in English and
 * Chinese: the picture block whole, the files, the first press, full size, the tall picture scrolled
 * to its bottom-right corner, and the talk box picking a picture by its own gesture.
 *
 * WHAT IS REAL HERE. The server, the upload door (POST /api/report-files), the file door the pictures
 * come back through, the report page and the talk box. The pictures are drawn by this browser for the
 * test and say nothing about anything; the office is a throwaway, and nothing reaches the live office.
 */
import { readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/** THE PHONE'S WIDTH, read from the one place it is written: NARROW_QUERY in src/web/components/ui.tsx. */
const NARROW_WIDTH = (() => {
  const source = readFileSync(resolve('src/web/components/ui.tsx'), 'utf8')
  const said = /export const NARROW_QUERY = '\(max-width: (\d+)px\)'/.exec(source)
  if (said === null) throw new Error('NARROW_QUERY in src/web/components/ui.tsx is not a max-width in px any more.')
  return Number(said[1])
})()

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Stored { path: string; name: string; size: number; hash: string }

const ONE = 'Test picture one, a PNG'
const TWO = 'Test picture two, a JPG'
const NESTED = 'Test picture three, inside a section'
const TALL = 'Test picture four, a tall PNG'
const WIDTHS = [1440, 990, 660, 390] as const

let app: LiveApp
let folder = ''
let previousRoots: string | undefined
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
let report = ''

async function store(name: string, bytes: Buffer): Promise<Stored> {
  const answer = await fetch(`${app.api}/api/report-files`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ bytes: bytes.toString('base64'), name }),
  })
  expect(answer.status, await answer.clone().text()).toBe(201)
  return ((await answer.json()) as { file: Stored }).file
}

/**
 * A TEST PICTURE drawn by this browser, 1600 by 1000 unless asked otherwise: wider than any report column it
 * is drawn in. It carries words in its four corners and a row of numbers along its bottom edge, where a
 * chart keeps its axis labels, so a picture of it shows what anything drawn over it covers.
 */
async function aTestPicture(type: 'image/png' | 'image/jpeg', colour: string, width = 1600, height = 1000): Promise<Buffer> {
  const url = await app.page.evaluate(
    ({ type, colour, width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = colour
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#f4ce77'
      context.beginPath()
      context.arc(width / 2, height / 2, Math.min(width, height) * 0.3, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#ffffff'
      context.font = 'bold 56px sans-serif'
      context.textBaseline = 'top'
      context.textAlign = 'left'
      context.fillText('TEST top left', 24, 24)
      context.textAlign = 'right'
      context.fillText('TEST top right', width - 24, 24)
      context.textBaseline = 'bottom'
      context.fillText('bottom right', width - 24, height - 24)
      context.textAlign = 'left'
      context.fillText('bottom left', 24, height - 24)
      // AN AXIS ALONG THE BOTTOM EDGE: the numbers a corner mark could cover.
      context.font = '40px sans-serif'
      context.textAlign = 'center'
      for (let at = 1; at < 10; at += 1) context.fillText(String(at * 10), (width * at) / 10, height - 96)
      return canvas.toDataURL(type)
    },
    { type, colour, width, height },
  )
  return Buffer.from(url.split(',')[1] ?? '', 'base64')
}

beforeAll(async () => {
  // OUTSIDE THE CHECKOUT: an office refuses to keep its database inside a git worktree, and every wave runs this file
  // in one (13n rounds 52b and 52c). The pictures are stored beside the database, so this folder is named as a
  // preview root, beside the checkout, as tests/a-picture-is-sent-in-a-message.test.ts does.
  folder = aTestDatabaseFolder('picture-opens-large')
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${folder}`
  app = await liveApp({
    name: 'picture-opens-large',
    opensAt: 'full',
    database: join(folder, 'panelx.db'),
    viewport: { width: 1440, height: 1000 },
  })
  const setting = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ mediaLoad: 'with-page' }),
  })
  expect(setting.status, await setting.clone().text()).toBe(200)
  await app.page.goto(`${app.site}/`)
  const png = await store('test-picture-one.png', await aTestPicture('image/png', '#587b9b'))
  const jpg = await store('test-picture-two.jpg', await aTestPicture('image/jpeg', '#7b5b9b'))
  const nested = await store('test-picture-three.png', await aTestPicture('image/png', '#5b9b7b'))
  // TEST AGENTS, so the talk box's contact list has rows to open.
  for (const [title, handle] of [['Test agent one', 'test-agent-one'], ['Test agent two', 'test-agent-two'], ['Test agent three', 'test-agent-three'], ['Test agent four', 'test-agent-four']] as const) {
    const agent = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(agent.status, await agent.clone().text()).toBe(201)
  }
  const tall = await store('test-picture-four.png', await aTestPicture('image/png', '#9b6b5b', 1000, 2600))
  const notAPicture = await store('test-notes.pdf', Buffer.from('%PDF-1.4\n% a test file, not a real document\n'))
  const blocks = [
    { id: 'b1', type: 'text', text: 'A test report holding test pictures. Nothing in it is a real observation.' },
    { id: 'i1', type: 'image', path: png.path, alt: ONE },
    { id: 'i2', type: 'image', path: jpg.path, alt: TWO },
    { id: 's1', type: 'section', title: 'A test section', blocks: [{ id: 'i3', type: 'image', path: nested.path, alt: NESTED }] },
    // THE SAME FILE AS i2, carried as a file, as the report of 3 October carries its pictures.
    { id: 'f1', type: 'file', ...jpg, caption: 'Test picture two, carried as a file' },
    { id: 'f2', type: 'file', ...notAPicture, caption: 'A test file that is not a picture' },
    { id: 'i4', type: 'image', path: tall.path, alt: TALL },
  ]
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'report', title: 'A test report with test pictures', data: { blocks } }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
}, 60_000)

async function openTheReport(width: number, lang: 'en' | 'zh' = 'en', scheme: 'light' | 'dark' = 'light', developer = false): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.emulateMedia({ colorScheme: scheme })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}${developer ? '&mode=inspect' : ''}#/r/${report}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** The picture with this description, once its bytes have arrived and it has drawn. */
async function drawnPicture(alt: string, within = 'main') {
  const picture = app.page.locator(`${within} img[alt="${alt}"]`).first()
  await picture.waitFor({ timeout: 20_000 })
  await picture.scrollIntoViewIfNeeded()
  await app.page.waitForFunction(
    ({ alt, within }) => {
      const image = [...document.querySelectorAll<HTMLImageElement>(`${within} img`)].find((one) => one.alt === alt)
      return image !== undefined && image.complete && image.naturalWidth > 0
    },
    { alt, within },
    { timeout: 20_000 },
  )
  return picture
}

const LARGE = '.sb-picture-large'

/** The large picture's box, once it is open and drawn. */
async function theLargePicture(alt: string): Promise<{ width: number; height: number; x: number; y: number }> {
  const large = await drawnPicture(alt, LARGE)
  const box = await large.boundingBox()
  if (box === null) throw new Error(`The large picture "${alt}" has no box on the page.`)
  return box
}

describe('pressing a picture in a report (problem T3yQblhc2A28)', () => {
  it.each(WIDTHS)('opens it at %i, fitted where that shows it larger and at full size where it would not, and Escape, Close and a press outside close it', async (width) => {
    await openTheReport(width)
    const small = await drawnPicture(ONE)
    const smallBox = await small.boundingBox()
    await small.click()
    const box = await theLargePicture(ONE)
    const view = app.page.locator(LARGE)
    // The same bytes the report drew, and no second request.
    expect(await app.page.locator(`${LARGE} img`).getAttribute('src')).toBe(await small.getAttribute('src'))
    if (width === 1440) {
      // FITTED, because that is larger than the page draws it: the test picture is larger than the window,
      // so the large one fills the window's width or its height, less the margins, and stays inside it.
      expect(await view.getAttribute('data-size')).toBe('fitted')
      const fillsTheWidth = box.width >= width - 16 - 2
      const fillsTheHeight = box.height >= 1000 - 56 - 2
      expect(fillsTheWidth || fillsTheHeight, `at ${String(width)} the large picture is ${String(box.width)} by ${String(box.height)}`).toBe(true)
      expect(box.width).toBeGreaterThan((smallBox?.width ?? 0) * 1.1)
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5)
    } else {
      // ONE PRESS IS FULL SIZE: fitted would have drawn it no larger than the page already does.
      expect(await view.getAttribute('data-size'), `at ${String(width)} the first press did not open at full size`).toBe('full')
      expect(box.width).toBeGreaterThan(1599)
    }
    // A press on the picture itself switches its size, and closes nothing.
    await app.page.locator(`${LARGE} img`).click()
    await expect.poll(() => view.count()).toBe(1)
    // ESCAPE closes it.
    await app.page.keyboard.press('Escape')
    await expect.poll(() => view.count()).toBe(0)

    // A PRESS OUTSIDE THE PICTURE closes it: the backdrop, at its top-left corner, with the picture fitted.
    await small.click()
    await theLargePicture(ONE)
    if ((await view.getAttribute('data-size')) === 'full') await app.page.locator('.sb-picture-large-size').click()
    await expect.poll(() => view.getAttribute('data-size')).toBe('fitted')
    await app.page.mouse.click(4, 60)
    await expect.poll(() => view.count()).toBe(0)

    // CLOSE, from the keyboard: it has the focus when the view opens, and Enter presses it.
    await small.click()
    await theLargePicture(ONE)
    await app.page.keyboard.press('Enter')
    await expect.poll(() => view.count()).toBe(0)
    // Nothing was opened about the picture by the ordinary press.
    expect(await app.page.locator('.px-talk').count()).toBe(0)
  }, 120_000)

  it('opens the talk box about the picture on a right-click, and the talk box finds it on the page', async () => {
    await openTheReport(1440)
    for (const alt of [ONE, NESTED]) {
      await app.page.keyboard.press('Escape')
      const picture = await drawnPicture(alt)
      await picture.click({ button: 'right' })
      const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
      await talk.waitFor({ timeout: 15_000 })
      expect((await talk.locator('.px-talk-chip-kind').textContent())?.trim()).toBe('Picture')
      // CALLED BY WHAT IT SHOWS (round 12): its alt text, and not the mark's words or its path.
      expect((await talk.locator('.px-talk-chip-what').textContent())?.trim()).toBe(alt)
      expect(await app.page.locator(LARGE).count(), 'a right-click opened the picture large').toBe(0)
      // THE SENTENCE THE OWNER GOT. It must not be drawn for a picture that is on the page.
      expect(await talk.locator('.px-talk-chip-away').count(), `the talk box said "${alt}" is not on this page`).toBe(0)
      await app.page.keyboard.press('Escape')
      await app.page.mouse.click(4, 400)
      await expect.poll(() => app.page.locator('.px-talk').count()).toBe(0)
    }
  }, 120_000)

  it('keeps a press in the "Ask agent" mode for the talk box, which also finds the picture', async () => {
    await openTheReport(1440)
    const picture = await drawnPicture(TWO)
    await app.page.getByRole('button', { name: 'Ask agent' }).first().click()
    await picture.click()
    const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
    await talk.waitFor({ timeout: 15_000 })
    expect((await talk.locator('.px-talk-chip-kind').textContent())?.trim()).toBe('Picture')
    expect(await talk.locator('.px-talk-chip-away').count()).toBe(0)
    expect(await app.page.locator(LARGE).count(), 'the mode\'s press opened the picture large').toBe(0)
  }, 120_000)

  it('on a phone opens the talk box as a sheet from the bottom, with the picked picture whole above it', async () => {
    await openTheReport(390)
    const picture = await drawnPicture(TWO)
    // THE PICTURE STARTS LOW ON THE SCREEN, where the sheet will rise, so it has to be moved above it.
    const low = await picture.boundingBox()
    await app.page.mouse.wheel(0, (low?.y ?? 0) - 720)
    await expect.poll(async () => ((await picture.boundingBox())?.y ?? 0) > 650, { message: 'the picture did not start low' }).toBe(true)
    await picture.click({ button: 'right', position: { x: 40, y: 20 } })
    const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
    await talk.waitFor({ timeout: 15_000 })
    expect(await talk.getAttribute('data-sheet'), 'at 390 the talk box is not a sheet').toBe('1')
    const sheet = await talk.boundingBox()
    // A SHEET: the whole width, along the bottom of the window.
    expect(sheet !== null && sheet.x <= 0.5 && sheet.width >= 389 && sheet.y + sheet.height >= 999).toBe(true)
    // THE PICKED PICTURE IS WHOLE ABOVE IT, under the phone's top bar.
    const bar = await app.page.locator('.shell-bar').boundingBox()
    await expect.poll(async () => {
      const at = await picture.boundingBox()
      return at !== null && sheet !== null && bar !== null && at.y >= bar.y + bar.height - 0.5 && at.y + at.height <= sheet.y + 0.5
    }, { message: 'the picked picture is not whole between the top bar and the sheet' }).toBe(true)
    expect((await talk.locator('.px-talk-chip-what').textContent())?.trim()).toBe(TWO)
    await app.page.keyboard.press('Escape')
  }, 120_000)

  it(`opens the talk box as a sheet at NARROW_QUERY's width (${String(NARROW_WIDTH)} px) and as a box one pixel wider`, async () => {
    for (const [width, sheet] of [[NARROW_WIDTH, '1'], [NARROW_WIDTH + 1, null]] as const) {
      await openTheReport(width)
      const picture = await drawnPicture(TWO)
      await picture.click({ button: 'right' })
      const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
      await talk.waitFor({ timeout: 15_000 })
      expect(await talk.getAttribute('data-sheet'), `at ${String(width)} px`).toBe(sheet)
      await app.page.keyboard.press('Escape')
    }
  }, 120_000)

  it('on a phone draws the picked picture\'s outline under the top bar, not over it', async () => {
    await openTheReport(390)
    const picture = await drawnPicture(TWO)
    await picture.click({ button: 'right' })
    await app.page.locator('.px-talk[data-target="uiSurface/composer"]').waitFor({ timeout: 15_000 })
    await app.page.locator('.px-subject > i').first().waitFor({ state: 'attached', timeout: 15_000 })
    // THE PICTURE GOES UP UNDER THE BAR, as a person scrolling the page sends it.
    const bar = await app.page.locator('.shell-bar').boundingBox()
    if (bar === null) throw new Error('The phone has no top bar to measure.')
    const at = await picture.boundingBox()
    await app.page.mouse.wheel(0, (at?.y ?? 0) - bar.y - bar.height / 2)
    await expect.poll(async () => {
      const now = await picture.boundingBox()
      return now !== null && now.y < bar.y + bar.height && now.y + now.height > bar.y + bar.height
    }, { message: 'the picture did not go under the bar' }).toBe(true)
    // THE BAR LOOKS THE SAME WITH THE OUTLINE AND WITHOUT IT: the outline passes under it.
    const clip = { x: 0, y: bar.y, width: 390, height: bar.height }
    await app.page.waitForTimeout(200)
    const withTheMark = await app.page.screenshot({ clip })
    await app.page.addStyleTag({ content: '.px-subject { visibility: hidden !important; }' })
    const withoutIt = await app.page.screenshot({ clip })
    expect(withTheMark.equals(withoutIt), 'the outline is drawn over the top bar').toBe(true)
  }, 120_000)

  it('shows a small picture beside a picture file, which opens large; a file that is not a picture shows none', async () => {
    await openTheReport(1440)
    const file = app.page.locator('figure.sb-file').filter({ hasText: 'test-picture-two.jpg' })
    const preview = await drawnPicture('test-picture-two.jpg', 'figure.sb-file .sb-file-preview')
    // Beside its name and its open press, which are still there.
    expect(await file.locator('.sb-file-name').innerText()).toBe('test-picture-two.jpg')
    expect(await file.locator('.sb-file-open').count()).toBe(1)
    const box = await preview.boundingBox()
    expect(box?.width ?? 0).toBeLessThanOrEqual(161)
    await preview.click()
    await theLargePicture('test-picture-two.jpg')
    await app.page.keyboard.press('Escape')
    await expect.poll(() => app.page.locator(LARGE).count()).toBe(0)
    // A FILE THAT IS NOT A PICTURE DRAWS NO SMALL PICTURE. In the current drawing a PDF is a shown kind:
    // its press is the Show press, its Save link sits beside it, and it has no Open link.
    const other = app.page.locator('figure.sb-file').filter({ hasText: 'test-notes.pdf' })
    expect(await other.locator('.sb-file-show').count()).toBe(1)
    expect(await other.locator('.sb-file-save').count()).toBe(1)
    expect(await other.locator('.sb-file-open').count()).toBe(0)
    expect(await other.locator('.sb-file-preview').count()).toBe(0)
  }, 120_000)

  it("draws a file box's open press and the PDF's size in the page's language", async () => {
    for (const [lang, open, size] of [['en', 'Open the file', '44 bytes'], ['zh', '打开文件', '44 字节']] as const) {
      await openTheReport(1440, lang)
      // THE OPEN LINK'S WORD, on a file block that still draws one: the picture file beside its
      // small picture. The PDF's press is the Show press in the current drawing, and that word has no
      // Chinese at this tip, so a Chinese check of it would only read the English fallback.
      const picture = app.page.locator('figure.sb-file').filter({ hasText: 'test-picture-two.jpg' })
      await picture.waitFor({ timeout: 20_000 })
      expect(await picture.locator('.sb-file-open').innerText(), lang).toBe(open)
      // THE SIZE, on the PDF block.
      const pdf = app.page.locator('figure.sb-file').filter({ hasText: 'test-notes.pdf' })
      await pdf.waitFor({ timeout: 20_000 })
      expect(await pdf.locator('.sb-file-size').innerText(), lang).toBe(size)
    }
  }, 120_000)

  it('shows a wide picture at its own pixels on a narrow screen with one press, scrolling both ways', async () => {
    await openTheReport(390)
    await (await drawnPicture(ONE)).click()
    // AT ITS OWN PIXELS FROM THE FIRST PRESS: the test picture is 1600 by 1000, and the view scrolls both ways.
    await expect.poll(async () => (await app.page.locator(`${LARGE} img`).boundingBox())?.width ?? 0).toBeGreaterThan(1599)
    const scrolls = await app.page.locator(LARGE).evaluate((el) => ({
      across: el.scrollWidth > el.clientWidth,
      down: el.scrollHeight > el.clientHeight,
      atTheMiddle: el.scrollLeft > 0,
    }))
    expect(scrolls).toEqual({ across: true, down: true, atTheMiddle: true })
    // THE EDGES THE PICTURE CARRIES ON PAST ARE MARKED, as every scrolling box's are. Opened at the
    // middle, it carries on past all four.
    await expect.poll(() => app.page.locator('.sb-picture-large-holder').getAttribute('data-more')).toBe('left right up down')
    const size = app.page.locator('.sb-picture-large-size')
    expect(await size.innerText()).toBe('Fit to the window')
    // THE KEYBOARD SCROLLS IT: the view takes the focus, and the arrow keys move it.
    const before = await app.page.locator(LARGE).evaluate((el) => el.scrollTop)
    await app.page.locator(LARGE).focus()
    await app.page.keyboard.press('ArrowDown')
    await expect.poll(() => app.page.locator(LARGE).evaluate((el) => el.scrollTop)).toBeGreaterThan(before)
    // A PRESS ON THE PICTURE goes back to fitted, and closes nothing; "Full size" brings it back.
    await app.page.locator(`${LARGE} img`).click()
    await expect.poll(async () => (await app.page.locator(`${LARGE} img`).boundingBox())?.width ?? 0).toBeLessThanOrEqual(390)
    expect(await app.page.locator(LARGE).count()).toBe(1)
    expect(await size.innerText()).toBe('Full size')
    await app.page.keyboard.press('Escape')
  }, 120_000)

  it('opens a tall picture at full size and scrolls it to its corners', async () => {
    await openTheReport(390)
    await (await drawnPicture(TALL)).click()
    // 1000 by 2600: fitted to 390 by 1000 it would be smaller than the page draws it.
    await expect.poll(() => app.page.locator(LARGE).getAttribute('data-size')).toBe('full')
    await expect.poll(async () => (await app.page.locator(`${LARGE} img`).boundingBox())?.height ?? 0).toBeGreaterThan(2599)
    const corner = await app.page.locator(LARGE).evaluate((el) => {
      el.scrollTo({ left: el.scrollWidth, top: el.scrollHeight })
      return { left: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1, down: el.scrollTop + el.clientHeight >= el.scrollHeight - 1 }
    })
    expect(corner).toEqual({ left: true, down: true })
    await expect.poll(() => app.page.locator('.sb-picture-large-holder').getAttribute('data-more')).toBe('left up')
    await app.page.keyboard.press('Escape')
  }, 120_000)

  it('closes by touch: a tap on Close, and a tap outside the picture', async () => {
    const context = await app.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    const tab = await context.newPage()
    try {
      await tab.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
      await waitForThePage(tab, 60_000)
      const small = tab.locator(`main img[alt="${ONE}"]`).first()
      await small.waitFor({ timeout: 20_000 })
      await small.scrollIntoViewIfNeeded()
      await tab.waitForFunction((alt) => [...document.querySelectorAll<HTMLImageElement>('main img')].some((one) => one.alt === alt && one.naturalWidth > 0), ONE, { timeout: 20_000 })
      await small.tap()
      await tab.locator(LARGE).waitFor({ timeout: 15_000 })
      expect(await tab.locator(LARGE).getAttribute('data-size')).toBe('full')
      await tab.locator('.sb-picture-large-close').tap()
      await expect.poll(() => tab.locator(LARGE).count()).toBe(0)
      await small.tap()
      await tab.locator('.sb-picture-large-size').tap()
      await expect.poll(() => tab.locator(LARGE).getAttribute('data-size')).toBe('fitted')
      await tab.touchscreen.tap(4, 60)
      await expect.poll(() => tab.locator(LARGE).count()).toBe(0)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('marks a closed picture as one that opens, without hover, in both languages, and the keyboard opens it', async () => {
    for (const [lang, word] of [['en', 'Show this picture large'], ['zh', '放大看这张图片']] as const) {
      await openTheReport(990, lang)
      const picture = await drawnPicture(ONE)
      await app.page.mouse.move(2, 2)
      const opens = app.page.locator('button.sb-image-opens').filter({ has: app.page.locator(`img[alt="${ONE}"]`) })
      const hint = opens.locator('.sb-image-hint')
      // DRAWN WITHOUT HOVER, which is what a touch screen has.
      expect(await hint.isVisible(), lang).toBe(true)
      expect((await hint.innerText()).replace(/\s+/g, ' ').trim(), lang).toBe(`⤢ ${word}`)
      const box = await hint.boundingBox()
      const pictureBox = await picture.boundingBox()
      expect(box !== null && pictureBox !== null && box.x + box.width <= pictureBox.x + pictureBox.width + 0.5, 'the mark sits on the picture').toBe(true)
    }
    // NARROWER THAN 720 PX THE MARK IS THE ⤢ ALONE, which leaves the picture's bottom edge clear: with its
    // words it covered 47% of that edge at 390 and 27% at 660.
    for (const width of [660, 390]) {
      await openTheReport(width, 'zh')
      const picture = await drawnPicture(ONE)
      const opens = app.page.locator('button.sb-image-opens').filter({ has: app.page.locator(`img[alt="${ONE}"]`) })
      await expect.poll(() => opens.getAttribute('data-narrow')).toBe('1')
      const hint = opens.locator('.sb-image-hint')
      expect((await hint.innerText()).trim(), String(width)).toBe('⤢')
      const covers = ((await hint.boundingBox())?.width ?? 0) / ((await picture.boundingBox())?.width ?? 1)
      expect(covers, `at ${String(width)} the mark covers ${String(Math.round(covers * 100))}% of the bottom edge`).toBeLessThan(0.1)
    }
    // THE KEYBOARD: the picture takes the focus, and Enter opens it.
    await openTheReport(990)
    await drawnPicture(ONE)
    const opens = app.page.locator('button.sb-image-opens').first()
    await opens.focus()
    await app.page.keyboard.press('Enter')
    await theLargePicture(ONE)
    await app.page.keyboard.press('Escape')
    await expect.poll(() => app.page.locator(LARGE).count()).toBe(0)
  }, 120_000)

  it('shows a person no path, stored file name or hash, and developer mode shows them', async () => {
    const machinery = () =>
      app.page.evaluate(() => ({
        paths: document.querySelectorAll('main .sb-path, main .sb-file-path').length,
        hashes: document.querySelectorAll('main .sb-file-hash').length,
        storedNames: (document.querySelector('main')?.innerText.match(/report-files\//g) ?? []).length,
      }))
    await openTheReport(1440)
    await drawnPicture(ONE)
    await app.page.locator('figure.sb-file').first().waitFor({ timeout: 20_000 })
    expect(await machinery()).toEqual({ paths: 0, hashes: 0, storedNames: 0 })
    // The person still sees each file's own name and its size.
    const pdf = app.page.locator('figure.sb-file').filter({ hasText: 'test-notes.pdf' })
    expect(await pdf.locator('.sb-file-name').innerText()).toBe('test-notes.pdf')
    expect(await pdf.locator('.sb-file-size').innerText()).toBe('44 bytes')
    await openTheReport(1440, 'en', 'light', true)
    await drawnPicture(ONE)
    await app.page.locator('figure.sb-file').first().waitFor({ timeout: 20_000 })
    const seen = await machinery()
    // Four image blocks and two files: six paths, two hashes.
    expect(seen.paths).toBe(6)
    expect(seen.hashes).toBe(2)
    expect(seen.storedNames).toBeGreaterThanOrEqual(5)
  }, 120_000)

  // THE SECRETARY'S REVIEW OF ROUND 13'S PICTURES (report lzQD05ovq3WN) owed two pictures
  // at 390: the picked picture's outline where it meets the top bar, and the sheet with More and the
  // contacts open and Send in view. This case holds what each must show, every run, and takes the two
  // pictures in both themes and both languages when TEST_SHOTS names a folder.
  it('at 390 the outline meets the top bar and passes under it, and with More and the contacts open Send is in view', async () => {
    const shots = process.env['TEST_SHOTS'] ? testShots('a-picture-in-a-report-opens-large') : null
    const looks = shots === null
      ? ([['en', 'light']] as const)
      : ([['en', 'light'], ['en', 'dark'], ['zh', 'light'], ['zh', 'dark']] as const)
    for (const [lang, scheme] of looks) {
      const at = `390-${lang}-${scheme}`
      await openTheReport(390, lang, scheme)
      const picture = await drawnPicture(TWO)
      await picture.scrollIntoViewIfNeeded()
      await picture.click({ button: 'right' })
      const talk = app.page.locator('.px-talk[data-target="uiSurface/composer"]')
      await talk.waitFor({ timeout: 15_000 })
      await app.page.locator('.px-subject > i').first().waitFor({ state: 'attached', timeout: 15_000 })
      // THE OUTLINE AT THE TOP BAR: the picked picture scrolled up until its top is under the bar and its
      // body below it, so the picture shows the outline going under the bar.
      const bar = await app.page.locator('.shell-bar').boundingBox()
      if (bar === null) throw new Error('The phone has no top bar to measure.')
      const now = await picture.boundingBox()
      await app.page.mouse.wheel(0, (now?.y ?? 0) - bar.y - bar.height / 2)
      await expect.poll(async () => {
        const box = await picture.boundingBox()
        return box !== null && box.y < bar.y + bar.height && box.y + box.height > bar.y + bar.height
      }, { message: `${at}: the picked picture does not meet the bar` }).toBe(true)
      await app.page.waitForTimeout(250)
      if (shots !== null) await app.page.screenshot({ path: join(shots, `report-${at}-talk-box-at-the-bar.png`) })
      // THE SHEET WITH MORE AND THE CONTACTS OPEN, and Send whole inside the sheet and the window.
      await app.page.locator('.px-talk-more-btn').click()
      await expect.poll(() => app.page.locator('.px-talk-more-btn').getAttribute('aria-expanded')).toBe('true')
      await app.page.locator('.px-talk-to-btn').click()
      await app.page.locator('.px-talk-contact').first().waitFor({ timeout: 20_000 })
      await app.page.waitForTimeout(500)
      const send = talk.locator('.px-talk-do button').first()
      await expect.poll(async () => {
        const [box, sheet] = [await send.boundingBox(), await talk.boundingBox()]
        return box !== null && sheet !== null && box.y >= sheet.y && box.y + box.height <= Math.min(sheet.y + sheet.height, 1000) + 0.5
      }, { message: `${at}: Send is not in view with More and the contacts open` }).toBe(true)
      if (shots !== null) await app.page.screenshot({ path: join(shots, `report-${at}-talk-box-more-and-contacts.png`) })
      await app.page.keyboard.press('Escape')
    }
  }, 300_000)

  it.skipIf(!process.env['TEST_SHOTS'])('photographs the closed, open, full-size, corner and talk-box looks, at four widths, light and dark, English and Chinese', async () => {
    const shots = testShots('a-picture-in-a-report-opens-large')
    const shot = (name: string) => app.page.screenshot({ path: join(shots, name) })
    for (const lang of ['en', 'zh'] as const) {
      for (const width of WIDTHS) {
        for (const scheme of ['light', 'dark'] as const) {
          const at = `${String(width)}-${lang}-${scheme}`
          await openTheReport(width, lang, scheme)
          const picture = await drawnPicture(TWO)
          // THE PICTURE BLOCK WHOLE, closed, with its mark.
          await app.page.locator('figure.sb-image').filter({ has: app.page.locator(`img[alt="${TWO}"]`) }).evaluate((el) => {
            el.scrollIntoView({ block: 'center' })
          })
          await shot(`report-${at}-closed-picture.png`)
          // THE FILES: the picture file with its small picture, and the PDF.
          await drawnPicture('test-picture-two.jpg', 'figure.sb-file .sb-file-preview')
          await app.page.locator('figure.sb-file').first().evaluate((el) => {
            el.scrollIntoView({ block: 'center' })
          })
          await shot(`report-${at}-closed-files.png`)
          // THE FIRST PRESS: fitted at 1440, full size where fitted would add nothing.
          await picture.scrollIntoViewIfNeeded()
          await picture.click()
          await theLargePicture(TWO)
          await shot(`report-${at}-open.png`)
          // FULL SIZE, opened at the middle; the edge marks follow the scroll one frame later.
          if ((await app.page.locator(LARGE).getAttribute('data-size')) !== 'full') await app.page.locator('.sb-picture-large-size').click()
          await expect.poll(async () => (await app.page.locator(`${LARGE} img`).boundingBox())?.width ?? 0).toBeGreaterThan(1599)
          await expect.poll(() => app.page.locator('.sb-picture-large-holder').getAttribute('data-more')).toBe('left right up down')
          await shot(`report-${at}-full-size.png`)
          await app.page.keyboard.press('Escape')
          // THE TALL PICTURE AT FULL SIZE, SCROLLED TO ITS BOTTOM-RIGHT CORNER.
          const tall = await drawnPicture(TALL)
          await tall.click()
          if ((await app.page.locator(LARGE).getAttribute('data-size')) !== 'full') await app.page.locator('.sb-picture-large-size').click()
          await expect.poll(async () => (await app.page.locator(`${LARGE} img`).boundingBox())?.height ?? 0).toBeGreaterThan(2599)
          await app.page.locator(LARGE).evaluate((el) => {
            el.scrollTo({ left: el.scrollWidth, top: el.scrollHeight })
          })
          await expect.poll(() => app.page.locator('.sb-picture-large-holder').getAttribute('data-more')).toMatch(/up/)
          await app.page.waitForTimeout(100)
          await shot(`report-${at}-full-size-corner.png`)
          await app.page.keyboard.press('Escape')
          // THE TALK BOX PICKING THE PICTURE, by its own gesture: a right-click.
          await picture.scrollIntoViewIfNeeded()
          await picture.click({ button: 'right' })
          await app.page.locator('.px-talk[data-target="uiSurface/composer"]').waitFor({ timeout: 15_000 })
          await app.page.waitForTimeout(150)
          await shot(`report-${at}-talk-box.png`)
          await app.page.keyboard.press('Escape')
        }
      }
    }
  }, 900_000)
})
