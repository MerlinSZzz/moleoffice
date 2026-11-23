// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTE LOOKS THE OWNER CHOSE, DRAWN FOR HIM AS PICTURES.
 *
 * WITH TEST_SHOTS SET it opens the office's own pages in windows 1440, 990, 660 and 390 pixels wide, in the light theme
 * and in the dark one, in English and in normal mode, and takes the places below in each. Each picture is named after
 * its window's width, its theme and its place:
 *   - `<width>-<theme>-<place>-window.png`, the whole window, with the made-up label drawn as a strip along the top;
 *   - `<width>-<theme>-<place>-clip.png`, a clip around the place's small point with room round it, with the made-up
 *     label put in the page's flow just above it.
 *
 * THE PLACES:
 *   1. newnote: the right-click box, opened by a right-click on a made-up report in the list of records, as a person
 *      opens it, with Note chosen and the list of notes open, so the New note row and its plus in a circle show above
 *      the person's notes. The clip is the box.
 *   2. note-tags: a made-up note opened on its own page, with its three made-up tags under its title as filled colour
 *      tags, and the field that adds one. The clip is the row of tags.
 *   3. mynotes-newest: My notes with four made-up notes, sorted newest first, as it starts. Each card shows its tags.
 *      The clip is the sort press and the first two cards.
 *   4. mynotes-by-tag: the same, sorted by tag from A to Z. The clip is the sort press and the first two cards.
 *
 * THE STRIP IS REFUSED WHERE AN ELEMENT FIXED TO THE WINDOW LIES UNDER IT, as the right-click box is. Then the label
 * is put in the page's flow, above the head of the box. The helper's words are written to
 * `<name>-window-strip-refused.txt`, and the test's output says so. Where the helper refuses that too, or refuses the
 * label above a clip, that picture is not taken: its words are written to `<name>-<picture>-refused.txt` and the output
 * says so.
 *
 * IT CHECKS ONLY WHAT THE PICTURES NEED. It fails when a page is not drawn in the theme asked for, when a write that
 * fills the office is refused, or when a part or a press it needs is not there.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` serves it on a database in its own temporary folder, and everything in it is
 * filed through the office's own doors, as a person's own writes are: one made-up report, and four made-up notes with
 * their made-up tags. Every title, word and tag says it is made up, and every picture holds the made-up label.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { pathFor } from '../src/web/components/router.tsx'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { liveApp, openRecordPagesAt, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut, THE_MADE_UP_LABEL_MARKER } from './the-made-up-label-above-the-page.ts'
import { TEST_SHOTS, testShots } from './where-shots-go.ts'

const SHOTS = (process.env[TEST_SHOTS] ?? '') === '' ? null : testShots('the-note-looks-pictures')

/** One line at 1440, so the strip is about 34 pixels tall. */
const THE_LABEL = 'Made-up data, in a test office.'
/** The room left round a small point in a clip, in pixels. */
const ROOM = 48
const SIZES = [
  { width: 1440, height: 1000 },
  { width: 990, height: 1000 },
  { width: 660, height: 900 },
  { width: 390, height: 844 },
] as const
const THEMES = ['light', 'dark'] as const

const WORKSPACE = 'default'
const THE_REPORT = 'Made-up report for the note looks pictures'
/** The made-up notes, oldest first, so that newest first and tag A to Z put them in different orders. */
const NOTES = [
  { title: 'Made-up note about a made-up kiln', words: 'Made-up words about a made-up kiln, fired for six made-up hours.', tags: ['made-up kiln', 'made-up glaze', 'made-up clay'] },
  { title: 'Made-up note about a made-up glaze', words: 'Made-up words about a made-up blue glaze.', tags: ['made-up glaze'] },
  { title: 'Made-up note about made-up tiles', words: 'Made-up words about forty made-up tiles.', tags: ['made-up tiles', 'made-up blue'] },
  { title: 'Made-up note about a made-up order', words: 'Made-up words about a made-up order of cups.', tags: ['made-up order'] },
] as const

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * The block a strip is put above: the page's first heading. It is never an element fixed to the window, because the
 * helper gives the block a margin at its top to clear the bars, and on a fixed element that margin would move the
 * element itself.
 */
const theHeading = (page: Page): Locator => page.locator('#main').getByRole('heading').first()

type Size = (typeof SIZES)[number]
type Theme = (typeof THEMES)[number]
type Picture = 'window' | 'clip'
interface Box { x: number; y: number; width: number; height: number }

let live: LiveApp
let report = ''
/** The first made-up note, with three tags, which note-tags opens. */
let theNoteWithThreeTags = ''

/** One record through the office's own door, and its id. */
async function file(body: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const filed = await fetch(`${live.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(filed.status, `POST /api/records: ${await filed.clone().text()}`).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** The person's theme, set through the office's door for the person's look, which wins over the look the browser stored. */
async function chooseTheTheme(theme: Theme): Promise<void> {
  const headers = { ...PERSON, ...thePersonsKeyHeader(join(live.dir, 'keys.json')) }
  const kept = await fetch(`${live.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ themes: { chosen: theme, own: [] } }) })
  expect(kept.status, `PATCH the person's look: ${await kept.clone().text()}`).toBe(200)
}

beforeAll(async () => {
  live = await liveApp({ name: 'the-note-looks-pictures', viewport: { width: 1440, height: 1000 }, workspace: WORKSPACE, opensAt: 'full' })
  const blocks = [1, 2, 3].map((n) => ({
    id: `b-${String(n)}`,
    type: 'text',
    heading: `Made-up part ${String(n)}`,
    text: `Made-up paragraph ${String(n)}. The made-up glaze for part ${String(n)} was fired for six hours.`,
  }))
  report = await file({ kind: 'report', title: THE_REPORT, data: { for: 'Made-up reader', date: '2026-11-21', blocks } })
  for (const [at, note] of NOTES.entries()) {
    // A SECOND APART, so the newest is told by its time.
    if (at > 0) await new Promise((done) => setTimeout(done, 1100))
    const id = await file({
      kind: 'quick_note',
      title: note.title,
      data: { parts: [{ id: 'words-1', type: 'words', x: 24, y: 16, width: 280, text: note.words }], tags: [...note.tags] },
    })
    if (at === 0) theNoteWithThreeTags = id
  }
}, 300_000)

afterAll(async () => {
  await live?.stop()
}, 60_000)

/** A picture's name: its window's width, its theme and its place. */
const nameOf = (size: Size, theme: Theme, place: string): string => `${String(size.width)}-${theme}-${place}`

/** A window of its own, with the choices the browser stores set before the page reads them. The chat is closed. */
async function aWindow(size: Size, theme: Theme): Promise<{ context: BrowserContext; page: Page }> {
  const context = await live.browser.newContext({ viewport: { width: size.width, height: size.height } })
  await context.addInitScript(
    ([sidebarKey, chosen]) => {
      try {
        localStorage.setItem('mole-office.preset.theme', chosen)
        localStorage.setItem('mole-office.language', 'en')
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
        localStorage.setItem('mole-office.chat.split-side', 'right')
        localStorage.setItem(sidebarKey, 'expanded')
      } catch {
        // A blank page has no storage of the office's, and the next page sets it.
      }
    },
    [SIDEBAR_KEY, theme] as const,
  )
  await openRecordPagesAt(context, 'full')
  return { context, page: await context.newPage() }
}

/** Open a page of the office in English and in normal mode, and fail when it is not in the theme asked for. */
async function go(page: Page, theme: Theme, path: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${live.site}/?lang=en&mode=normal#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme), { message: `${path}: the page is not in the ${theme} theme`, timeout: 10_000 })
    .toBe(theme)
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.first().boundingBox()
  if (box === null) throw new Error('A part the picture needs is not drawn.')
  return box
}

/** The one box around every box that is drawn, or null when none is. */
function around(boxes: readonly (Box | null)[]): Box | null {
  const drawn = boxes.filter((one): one is Box => one !== null)
  if (drawn.length === 0) return null
  const left = Math.min(...drawn.map((one) => one.x))
  const top = Math.min(...drawn.map((one) => one.y))
  const right = Math.max(...drawn.map((one) => one.x + one.width))
  const bottom = Math.max(...drawn.map((one) => one.y + one.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Whether an error is the label helper's refusal, which is written down rather than thrown. */
const aRefusal = (error: unknown): error is Error => error instanceof Error && error.message.startsWith('putTheMadeUpLabelIn(')

/** Write down the helper's refusals of the label for a picture that is therefore not taken. */
function refused(name: string, picture: Picture, words: readonly string[]): void {
  if (SHOTS === null) return
  writeFileSync(join(SHOTS, `${name}-${picture}-refused.txt`), `${words.join('\n')}\n`)
  console.warn(`${name}: the helper refused the made-up label, so the ${picture} picture is not taken: ${words.join(' | ')}`)
}

/**
 * THE WHOLE WINDOW, with the made-up label as a strip along the top. Where the helper refuses the strip, the label goes
 * into the page's flow above the first of `inTheFlow` that the helper takes.
 */
async function photographTheWindow(page: Page, name: string, block: Locator, inTheFlow: readonly Locator[]): Promise<void> {
  if (SHOTS === null) return
  try {
    await putTheMadeUpLabelIn(page, THE_LABEL, block, `${name} window`, { stripOutsideThePage: true })
  } catch (error) {
    if (!aRefusal(error)) throw error
    await takeTheMadeUpLabelOut(page)
    const words = [error.message]
    let placed = false
    for (const [at, above] of inTheFlow.entries()) {
      try {
        await putTheMadeUpLabelIn(page, THE_LABEL, above, `${name} window, in the page's flow, place ${String(at + 1)}`)
        placed = true
        break
      } catch (next) {
        if (!aRefusal(next)) throw next
        await takeTheMadeUpLabelOut(page)
        words.push(next.message)
      }
    }
    writeFileSync(join(SHOTS, `${name}-window-strip-refused.txt`), `${words.join('\n')}\n`)
    if (!placed) {
      refused(name, 'window', words)
      return
    }
    console.log(`${name}: the helper refused the strip, so the made-up label is in the page's flow: ${error.message}`)
  }
  await page.mouse.move(-1, -1)
  await page.screenshot({ path: join(SHOTS, `${name}-window.png`) })
  await takeTheMadeUpLabelOut(page)
}

/**
 * A CLIP AROUND A SMALL POINT, with the made-up label in the page's flow just above `above`. The point is read once the
 * label is in, because the label moves what is under it. The clip holds the label and the point, with room round both.
 */
async function photographTheClip(page: Page, name: string, above: Locator, point: () => Promise<Box | null>): Promise<void> {
  if (SHOTS === null) return
  try {
    await putTheMadeUpLabelIn(page, THE_LABEL, above, `${name} clip`)
  } catch (error) {
    if (!aRefusal(error)) throw error
    await takeTheMadeUpLabelOut(page)
    refused(name, 'clip', [error.message])
    return
  }
  await page.mouse.move(-1, -1)
  const label = await page.locator(THE_MADE_UP_LABEL_MARKER).first().boundingBox()
  expect(label, `${name}: the made-up label has no box`).not.toBeNull()
  const subject = await point()
  const boxes = subject === null ? [label!] : [label!, subject]
  const size = page.viewportSize()!
  const left = Math.max(0, Math.floor(Math.min(...boxes.map((one) => one.x)) - ROOM))
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((one) => one.y)) - ROOM))
  const right = Math.min(size.width, Math.ceil(Math.max(...boxes.map((one) => one.x + one.width)) + ROOM))
  const bottom = Math.min(size.height, Math.ceil(Math.max(...boxes.map((one) => one.y + one.height)) + ROOM))
  await page.screenshot({ path: join(SHOTS, `${name}-clip.png`), clip: { x: left, y: top, width: right - left, height: bottom - top } })
  await takeTheMadeUpLabelOut(page)
}

/** 1. The right-click box with Note chosen and the list of notes open, New note and its plus first. */
async function theNewNoteRow(page: Page, size: Size, theme: Theme): Promise<void> {
  const name = nameOf(size, theme, 'newnote')
  await go(page, theme, '/records')
  const row = page.locator(`#main [data-target^="record/${report}/"]`).first()
  await row.waitFor({ timeout: 30_000 })
  await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const at = await boxOf(row)
  await page.mouse.click(Math.round(at.x + at.width / 2), Math.round(at.y + at.height / 2), { button: 'right' })
  const box = page.locator('.px-talk').first()
  await box.waitFor({ timeout: 20_000 })
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
  const toANote = page.locator('.px-talk [role="radio"][data-send-to="note"]')
  await toANote.click({ timeout: 20_000 })
  await expect.poll(() => toANote.getAttribute('aria-checked'), { timeout: 10_000 }).toBe('true')
  // THE PRESS IS BUSY while the office is asked which note was last written in.
  const notePress = page.locator('.px-talk .px-talk-note-btn:not([aria-busy="true"])')
  await notePress.waitFor({ timeout: 20_000 })
  const theNotes = page.locator('.px-talk .px-talk-notes:not([aria-busy="true"])')
  if ((await notePress.getAttribute('aria-expanded')) !== 'true') await notePress.click()
  await theNotes.getByRole('option', { name: t('talk.note.new'), exact: true }).locator('svg').waitFor({ timeout: 20_000 })
  await theNotes.locator('[role="option"][data-note]').nth(1).waitFor({ timeout: 20_000 })
  await page.mouse.move(-1, -1)
  const head = page.locator('.px-talk .px-talk-head')
  await photographTheWindow(page, name, row, [head])
  await photographTheClip(page, name, head, () => box.boundingBox())
}

/** 2. A made-up note opened on its own page, with three made-up tags under its title and the field that adds one. */
async function theTagsOfANote(page: Page, size: Size, theme: Theme): Promise<void> {
  const name = nameOf(size, theme, 'note-tags')
  await go(page, theme, `/${THE_QUICK_NOTE_SEGMENT}/${theNoteWithThreeTags}`)
  const note = page.locator('.qn-note').first()
  await note.waitFor({ timeout: 30_000 })
  const tags = note.locator('.qn-tags').first()
  await tags.locator('.qn-tag.px-label-ink').nth(2).waitFor({ timeout: 20_000 })
  await tags.locator('.qn-tag-field').waitFor({ timeout: 20_000 })
  await page.mouse.move(-1, -1)
  await photographTheWindow(page, name, note, [tags])
  await photographTheClip(page, name, tags, () => tags.boundingBox())
}

/** 3 and 4. My notes with four made-up notes, sorted newest first as it starts, or by tag from A to Z. */
async function myNotesSorted(page: Page, size: Size, theme: Theme, sort: 'newest' | 'by-tag'): Promise<void> {
  const name = nameOf(size, theme, `mynotes-${sort}`)
  await go(page, theme, pathFor('myNotes'))
  const bar = page.locator('#main .mn-tag-bar').first()
  await bar.waitFor({ timeout: 30_000 })
  const cards = page.locator('#main .mn-card')
  await cards.nth(NOTES.length - 1).waitFor({ timeout: 30_000 })
  const press = bar.getByRole('button', { name: t(sort === 'newest' ? 'myNotes.newestFirst' : 'myNotes.tagAToZ'), exact: true }).first()
  if ((await press.getAttribute('aria-pressed')) !== 'true') await press.click({ timeout: 20_000 })
  await expect.poll(() => press.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
  await page.mouse.move(-1, -1)
  await photographTheWindow(page, name, theHeading(page), [theHeading(page), bar])
  await photographTheClip(page, name, bar, async () => around([await bar.boundingBox(), await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()]))
}

const PLACES: readonly { says: string; take: (page: Page, size: Size, theme: Theme) => Promise<void> }[] = [
  { says: 'New note with its plus in a circle in the right-click box', take: theNewNoteRow },
  { says: 'a note with its colour tags', take: theTagsOfANote },
  { says: 'My notes sorted newest first', take: (page, size, theme) => myNotesSorted(page, size, theme, 'newest') },
  { says: 'My notes sorted by tag from A to Z', take: (page, size, theme) => myNotesSorted(page, size, theme, 'by-tag') },
]

// EACH THEME IS CHOSEN ONCE, through the person's look, before every picture in it is taken.
for (const theme of THEMES) {
  for (const size of SIZES) {
    it(`draws the note looks at ${String(size.width)} by ${String(size.height)} in the ${theme} theme`, async () => {
      await chooseTheTheme(theme)
      for (const { says, take } of PLACES) {
        const { context, page } = await aWindow(size, theme)
        try {
          await take(page, size, theme)
        } catch (error) {
          throw new Error(`${says}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
        } finally {
          await context.close()
        }
      }
    }, 600_000)
  }
}
