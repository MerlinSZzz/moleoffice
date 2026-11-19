// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * New and opened notes float over the office. A pop-out keeps the last words and drawing, and a blocked pop-out leaves
 * the note in place. The sidebar and right-click entries are exercised in Chromium on a made-up office.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { THE_SYSTEM_MARK, THE_WINDOW_MARK } from '../src/config/the-window-mark.mjs'
import { theQuickNoteKey } from '../src/desktop/the-quick-note.mjs'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'

const CALLED = 'a-quick-note-opens-from-the-sidebar-and-the-menu'
const PICTURES = process.env['W13Y_QUICK_NOTE_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const NEW_NOTE = '#shell-side [data-target="uiSurface/rail.quicknote"]'
const MY_NOTES = '#shell-side [data-target="uiSurface/rail.mynotes"]'
const BESIDE = '[data-quick-note-beside]'

let app: LiveApp
let reportId = ''
let noteId = ''
let theBrowsersUserAgent = ''
let selectionCode = ''

/** What the page asked window.open for, and whether it asked while a click was being handled. */
type Opening = { url: string; target: string; features: string; inAClick: boolean }

/**
 * WINDOW.OPEN, WATCHED. Every call is kept with whether a click was being handled when it came, and while the page sets
 * `theWindowIsBlocked` the call answers null, as a browser that blocks a window does.
 */
async function watchTheOpenings(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const kept = window as unknown as { theOpenings: Opening[]; theWindowIsBlocked: boolean }
    kept.theOpenings = []
    kept.theWindowIsBlocked = false
    const open = window.open.bind(window)
    window.open = (url?: string | URL, target?: string, features?: string) => {
      kept.theOpenings.push({ url: String(url ?? ''), target: target ?? '', features: features ?? '', inAClick: window.event?.type === 'click' })
      return kept.theWindowIsBlocked ? null : open(url, target, features)
    }
  })
}

const theOpenings = (page: Page): Promise<Opening[]> => page.evaluate(() => (window as unknown as { theOpenings: Opening[] }).theOpenings)

async function go(page: Page, hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Select words of the report's second paragraph, right-click them, and wait for the panel to be drawn. */
async function openTheMenu(page: Page): Promise<void> {
  await go(page, `/r/${reportId}`)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await page.locator(run).waitFor({ timeout: 30_000 })
  await page.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.addScriptTag({ content: selectionCode })
  const at = await page.evaluate((sel) => (window as unknown as { selectMadeUpWords(selector: string): { x: number; y: number } }).selectMadeUpWords(sel), run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
}

/**
 * THE RIGHT-CLICK BOX'S WAY TO A NOTE. Test change (wave 13y round 169, point RC-1 of the right-click box): More no
 * longer holds New quick note. Send goes to Note and New note, which files a new note holding what was right-clicked,
 * and the line that says so links to the note. The link is pressed, and it opens the note floating over the page.
 */
async function sendToANewNoteAndOpenIt(page: Page): Promise<void> {
  await page.locator('.px-talk [role="radio"][data-send-to="note"]').click({ timeout: 20_000 })
  await page.locator('.px-talk .px-talk-note-btn').click()
  await page.locator('.px-talk .px-talk-notes:not([aria-busy="true"])').getByRole('option', { name: sayInEnglish('talk.note.new'), exact: true }).click()
  await page.locator('.px-talk .px-talk-do > button').first().click()
  await page
    .locator('.px-talk [role="status"]', { hasText: sayInEnglish('talk.addedToANewNote') })
    .getByRole('link', { name: sayInEnglish('talk.addToNote.open'), exact: true })
    .click()
}

/** A window with its stored choices set before the app runs, and window.open watched. */
async function aWindow(look: { width?: number; theme?: 'light' | 'dark'; narrowed?: boolean; userAgent?: string } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const context = await app.browser.newContext({
    viewport: { width, height: width <= 390 ? 844 : 900 },
    ...(look.userAgent === undefined ? {} : { userAgent: look.userAgent }),
  })
  await context.addInitScript(({ theme, narrowed, key }) => {
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, narrowed ? 'collapsed' : 'expanded')
  }, { theme: look.theme ?? 'light', narrowed: look.narrowed ?? false, key: SIDEBAR_KEY })
  await openRecordPagesAt(context, 'full')
  await watchTheOpenings(context)
  return { context, page: await context.newPage() }
}

beforeAll(async () => {
  const bundle = await bundlePageCode({
    stdin: { contents: `window.selectMadeUpWords = (selector) => {
      const el = document.querySelector(selector);
      if (el === null) throw new Error('the paragraph is not drawn');
      const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 20);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const rect = range.getClientRects()[0];
      if (rect === undefined) throw new Error('the words have no box');
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    }`, resolveDir: process.cwd(), loader: 'js' },
    bundle: true, write: false, platform: 'browser',
  })
  selectionCode = bundle.outputFiles[0]!.text
  app = await liveApp({ name: 'quick-note-entries', viewport: { width: 1440, height: 900 } })
  theBrowsersUserAgent = await app.page.evaluate(() => navigator.userAgent)
  const report = {
    kind: 'report',
    title: 'Made-up kiln firing report',
    data: {
      for: 'Made-up kiln team',
      date: '2026-11-14',
      blocks: [
        { id: 'b-1', type: 'text', heading: 'What was fired', text: 'A made-up load of forty bowls.' },
        { id: 'b-2', type: 'text', heading: 'What moved', text: 'The made-up top shelf ran hotter than the bottom one.' },
      ],
    },
  }
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(report) })
  const text = await res.text()
  expect(res.status, text).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, report))
  reportId = (JSON.parse(text) as { record: { id: string } }).record.id
  const note = { kind: 'quick_note', title: 'Made-up existing note', data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up existing note' }] } }
  const noteResponse = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(note) })
  const noteBody = await noteResponse.text()
  expect(noteResponse.status, noteBody).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, note))
  noteId = (JSON.parse(noteBody) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Draw a note, then move it into one window with its last edits. */
async function popOutAndCheck(context: BrowserContext, page: Page): Promise<void> {
  const beside = page.locator(BESIDE)
  const noteBox = await beside.boundingBox()
  const pageBox = await page.locator('#main').boundingBox()
  if (noteBox === null || pageBox === null) throw new Error('The note or page is not drawn')
  expect(noteBox.x).toBeLessThan(pageBox.x + pageBox.width)
  expect(noteBox.x + noteBox.width).toBeGreaterThan(pageBox.x)
  await beside.locator('.qn-field').fill('Made-up words and drawing')
  const sheet = await beside.locator('.qn-paper').boundingBox()
  if (sheet === null) throw new Error('The sheet is not drawn')
  await page.mouse.move(sheet.x + 60, sheet.y + 180)
  await page.mouse.down()
  await page.mouse.move(sheet.x + 140, sheet.y + 220, { steps: 8 })
  await page.mouse.up()
  await beside.locator('.qn-stroke').waitFor()
  expect(await theOpenings(page), 'no window before pop-out').toEqual([])
  expect(context.pages()).toHaveLength(1)
  // The last edit is made immediately before the press, inside the save debounce interval.
  await beside.locator('.qn-written').first().click()
  await beside.locator('.qn-field').fill('Made-up last words and drawing')
  const [note] = await Promise.all([
    context.waitForEvent('page', { timeout: 20_000 }),
    beside.locator('[data-part="pop-out"]').click(),
  ])
  await note.waitForURL((url) => url.hash.startsWith(`#/${THE_QUICK_NOTE_SEGMENT}/`), { timeout: 30_000 })
  await note.locator('.qn-stroke').waitFor({ timeout: 30_000 })
  await expect.poll(() => note.locator('.qn-note').innerText(), { timeout: 30_000 }).toContain('Made-up last words and drawing')
  await beside.waitFor({ state: 'detached', timeout: 20_000 })
  expect((await theOpenings(page)).map((opening) => opening.inAClick)).toEqual([true])
  expect(context.pages()).toHaveLength(2)
}

describe('in a browser', () => {
  it('opens a floating note from the sidebar and keeps words and a stroke when it is popped out', async () => {
    for (const narrowed of [false, true]) {
      const { context, page } = await aWindow({ narrowed })
      try {
        await go(page, '/')
        const press = page.locator(NEW_NOTE)
        await press.waitFor({ timeout: 30_000 })
        expect(await press.textContent()).toContain(sayInEnglish('nav.newNote'))
        expect(await press.textContent()).not.toContain(theQuickNoteKey('linux').said)
        await press.click()
        await page.locator(`${BESIDE} .qn-field`).waitFor({ timeout: 20_000 })
        await popOutAndCheck(context, page)
      } finally { await context.close() }
    }
  }, 180_000)

  it('keeps the floating note if the browser blocks pop-out', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/r/${reportId}`)
      await page.locator(NEW_NOTE).click()
      const beside = page.locator(BESIDE)
      await beside.locator('.qn-field').fill('Made-up words remain here')
      await page.evaluate(() => { (window as unknown as { theWindowIsBlocked: boolean }).theWindowIsBlocked = true })
      await beside.locator('[data-part="pop-out"]').click()
      expect(await theOpenings(page)).toHaveLength(1)
      expect(context.pages()).toHaveLength(1)
      await beside.locator('.qn-note').waitFor()
      expect(await beside.innerText()).toContain(sayInEnglish('quickNotes.windowWasBlocked'))
      await expect.poll(() => beside.locator('.qn-note').innerText(), { timeout: 30_000 }).toContain('Made-up words remain here')
    } finally { await context.close() }
  }, 180_000)

  it('gives the floating note room at narrow widths', async () => {
    for (const width of [990, 660, 390]) {
      const { context, page } = await aWindow({ width })
      try {
        await go(page, `/r/${reportId}`)
        await page.locator('.shell-menu').click()
        await page.locator('#shell-side[data-drawer="open"]').waitFor()
        await page.locator(NEW_NOTE).click()
        await page.locator(`${BESIDE} .qn-sheet`).waitFor({ timeout: 20_000 })
        const size = await page.locator(`${BESIDE} .qn-sheet`).boundingBox()
        expect(size?.height ?? 0).toBeGreaterThan(200)
        expect(size?.width ?? 0).toBeGreaterThan(250)
      } finally { await context.close() }
    }
  }, 180_000)

  // THE POP-OUT IS PROVED FROM THE SIDEBAR ALONE: it is the floating note's own press, the same however the note was
  // opened. From the right-click box the note opened holds what was right-clicked, and the case proves it opens floating.
  it('opens the note the right-click box sent to floating over the page, from the link in its line', async () => {
    const { context, page } = await aWindow()
    try {
      await openTheMenu(page)
      await sendToANewNoteAndOpenIt(page)
      await expect.poll(() => page.locator(`${BESIDE} .qn-added`).count(), { timeout: 30_000 }).toBe(1)
      expect(new URL(page.url()).hash, 'the page stays where it was').toBe(`#/r/${reportId}`)
      expect(await theOpenings(page)).toEqual([])
      expect(context.pages()).toHaveLength(1)
    } finally { await context.close() }
  }, 180_000)
})

it('opens an existing note from My notes floating over the page', async () => {
  const { context, page } = await aWindow()
  try {
    await go(page, '/my-notes')
    await page.locator(`[data-note="${noteId}"] [data-part="open"]`).click()
    const beside = page.locator(BESIDE)
    await beside.locator('.qn-note').waitFor({ timeout: 30_000 })
    await expect.poll(() => beside.innerText(), { timeout: 30_000 }).toContain('Made-up existing note')
    expect(new URL(page.url()).hash).toBe('#/my-notes')
    expect(await theOpenings(page)).toEqual([])
    expect(context.pages()).toHaveLength(1)
  } finally { await context.close() }
}, 120_000)

describe('in the window app', () => {
  it('opens floating first from both entries and draws the key on the sidebar press', async () => {
    const { context, page } = await aWindow({ userAgent: `${theBrowsersUserAgent} ${THE_WINDOW_MARK} ${THE_SYSTEM_MARK}linux` })
    try {
      await go(page, '/')
      const press = page.locator(NEW_NOTE)
      await press.waitFor({ timeout: 30_000 })
      expect(await press.innerText()).toContain(theQuickNoteKey('linux').said)
      await press.click()
      await page.locator(`${BESIDE} .qn-note`).waitFor({ timeout: 20_000 })
      expect(await theOpenings(page)).toEqual([])
      await page.locator(BESIDE).getByRole('button', { name: sayInEnglish('quickNote.done'), exact: true }).click()
      await openTheMenu(page)
      await sendToANewNoteAndOpenIt(page)
      await page.locator(`${BESIDE} .qn-note`).waitFor({ timeout: 20_000 })
      expect(await theOpenings(page)).toEqual([])
      expect(context.pages()).toHaveLength(1)
    } finally { await context.close() }
  }, 180_000)
})

describe('My notes', () => {
  it('is a row after Reports that opens #/my-notes and marks itself there', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/')
      const row = page.locator(MY_NOTES)
      await row.waitFor({ timeout: 30_000 })
      expect(await row.getAttribute('href')).toBe('#/my-notes')
      expect(await row.innerText()).toContain(sayInEnglish('myNotes.title'))
      const order = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#shell-side .shell-link[data-target]')].map((one) => one.getAttribute('data-target')),
      )
      expect(order.indexOf('uiSurface/rail.mynotes'), 'right after Reports').toBe(order.indexOf('uiSurface/rail.notes') + 1)
      await row.click()
      await page.waitForFunction(() => window.location.hash === '#/my-notes', null, { timeout: 10_000 })
      await expect.poll(() => row.getAttribute('aria-current'), { timeout: 10_000 }).toBe('page')
    } finally {
      await context.close()
    }
  }, 180_000)
})

it.skipIf(PICTURES === undefined)('takes the floating note and note-page pictures', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  const chatChoice = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_PERSON, body: JSON.stringify({ chatButtonStays: 'always' }),
  })
  expect(chatChoice.status, await chatChoice.clone().text()).toBe(200)
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      const { context, page } = await aWindow({ width, theme })
      try {
        const name = (what: string): string => join(folder, `${what}-${String(width)}-${theme}.png`)
        await go(page, '/my-notes')
        expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme)
        const card = page.locator(`[data-note="${noteId}"] [data-part="open"]`)
        await card.waitFor({ timeout: 20_000 })
        await putTheMadeUpLabelIn(page, LABEL, page.locator('#main h1'), CALLED)
        await page.mouse.move(-1, -1)
        await page.waitForTimeout(600)
        await page.screenshot({ path: name('my-notes') })
        await takeTheMadeUpLabelOut(page)
        await card.click()
        await page.locator(`${BESIDE} .qn-note`).waitFor({ timeout: 20_000 })
        await page.locator('.px-chat-circle').waitFor({ timeout: 20_000 })
        await putTheMadeUpLabelIn(page, LABEL, page.locator(`${BESIDE} .qn-beside-head`), CALLED)
        await page.mouse.move(-1, -1)
        await page.waitForTimeout(600)
        await page.screenshot({ path: name('quick-note-floating') })
        await go(page, `/${THE_QUICK_NOTE_SEGMENT}`)
        expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme)
        await page.locator('.qn-head').waitFor({ timeout: 20_000 })
        await putTheMadeUpLabelIn(page, LABEL, page.locator('.qn-head'), CALLED)
        await page.mouse.move(-1, -1)
        await page.waitForTimeout(600)
        await page.screenshot({ path: name('quick-note-page') })
      } finally {
        await context.close()
      }
      const windowApp = await aWindow({ width, theme, userAgent: `${theBrowsersUserAgent} ${THE_WINDOW_MARK} ${THE_SYSTEM_MARK}linux` })
      try {
        await go(windowApp.page, `/${THE_QUICK_NOTE_SEGMENT}`)
        expect(await windowApp.page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme)
        await windowApp.page.locator('.qn-head').waitFor({ timeout: 20_000 })
        await putTheMadeUpLabelIn(windowApp.page, LABEL, windowApp.page.locator('.qn-head'), CALLED)
        await windowApp.page.mouse.move(-1, -1)
        await windowApp.page.waitForTimeout(600)
        await windowApp.page.screenshot({ path: join(folder, `quick-note-window-page-${String(width)}-${theme}.png`) })
      } finally {
        await windowApp.context.close()
      }
    }
  }
}, 600_000)
