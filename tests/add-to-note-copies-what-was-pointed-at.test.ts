// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ADD TO NOTE COPIES WHAT WAS POINTED AT, point QN-5 of the quick-notes package (wave 13y round 167).
 *
 * The point's words: "The right-click menu has Add to note everywhere it opens. Added: selected words in a report keep
 * their formatting and maths; a picture shows as the picture; a table row as the row; a record as its card; each with
 * a link in the note that opens the place it came from. A right-click on empty page puts the page's name as a link. The
 * added part is kept as it was when added, and stays after the source changes. By default it goes into the note last
 * written in, and the menu also offers a new note."
 *
 * TEST CHANGE (wave 13y round 169, point RC-1 of the right-click box). Send chooses between a contact and a note, and
 * a dropdown on its right picks a new note or an existing one. Nothing here goes through More. Contact is chosen at
 * open. With Note chosen, the press on its right names the note, and its list holds New note and
 * then the person's notes, the newest first, as many as one page of My notes holds, with a line saying how many older
 * ones are not listed. The note chosen first is the one the person last wrote in, or New note when there is none.
 * Which note is "last written in" is the office's answer, proved in
 * tests/add-to-note-goes-into-the-note-last-written-in.test.ts. Send then makes the requests Add to note made, and puts
 * in what was right-clicked, as Add to note did, and after it any words typed in the box. While the write waits the box
 * says so, with the loading light, and a write that fails is said in the box. The line saying where the words went
 * keeps its link, and the link opens the note floating over the page, as a card of My notes does.
 *
 * WHAT IS BEING PROVED, in Chromium on a test office of its own, in one world whose steps follow each other:
 *   1. Send offers Note beside Contact, with Contact chosen. Before the person has written in a note, Note chooses New
 *      note, its list holds only New note, and Send is on with nothing typed.
 *   2. Words selected across bold and maths in a report are added as the stored words, bold and maths kept, with the
 *      report as the page they came from, into the note the person last wrote in, which the press names.
 *   3. A picture is added as the picture block itself.
 *   4. A right-click on a cell adds the cell's row, as a table of that one row.
 *   5. A right-click on a record's row of a list adds the record as its card.
 *   6. A right-click on empty page adds the page, named as the page names itself.
 *   7. After the report changes, the note still holds the words as they were added. The note page draws every part,
 *      and a part's link opens the page it came from.
 *   8. The added table is placed below the added picture.
 *   9. Send to New note files a new note with the typed words below what was pointed at, empties the box, says so with
 *      a link, and opens no window. The link opens the note floating over the page, with no window and no new address.
 *      The next opening chooses that new note, named by its first line, and lists it first.
 *  10. While the write waits, the box says it is waiting and Send carries the loading light. A write refused with 409
 *      is said in the box, the words stay, and the note is as it was.
 *  11. With more notes than one page of My notes holds, the list holds that page, the newest first, and says how many
 *      older notes it does not list.
 *
 * MUTATION PROOF of round 167 (after a red control on the code as cut, where neither press existed), in
 * src/web/lib/add-to-a-note.ts:
 *   - Add the words as the page draws them, and not as they are stored: case 2 goes red.
 *   - Keep every row of the table, and not only the one pointed at: case 4 goes red.
 *   - Open the new note in a window of its own: case 9 goes red.
 *
 * THE PICTURES AND THE VIDEO are taken only when W13Y_QUICK_NOTE_PICTURES names a folder. They are of a made-up office,
 * and each picture carries the made-up label above the page.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import type { QuickNoteAdded, QuickNotePart, QuickNoteWords } from '../src/shared/kinds/quick-note.ts'
import { MY_NOTES_PAGE_SIZE, type MyNotesReply } from '../src/shared/my-notes.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'add-to-note-copies-what-was-pointed-at'
const PICTURES = process.env['W13Y_QUICK_NOTE_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const REPORT_TITLE = 'Made-up glaze report'
const WORDS = 'Made-up glaze test: **cone 6** held, and $x^2$ rose fast.'
/** The stored words from "glaze" to "rose", which a selection between them covers. */
const SELECTED = 'glaze test: **cone 6** held, and $x^2$ rose'
const TABLE = {
  id: 'b-3',
  type: 'table',
  caption: 'Made-up shelf heats',
  columns: [{ label: 'Shelf' }, { label: 'Made-up heat' }],
  rows: [{ cells: ['Top', 'Made-up 1220'] }, { cells: ['Bottom', 'Made-up 1180'] }],
}
const NOTE_TITLE = 'Made-up glaze notebook'
/** Words typed in the box before a send to a new note, and the title their first line gives the note. */
const TYPED = 'Made-up second look at the top shelf\nMade-up: the bottom shelf ran cooler.'
const TYPED_TITLE = 'Made-up second look at the top shelf'

let app: LiveApp
let reportId = ''
let picture: Record<string, unknown> = {}
let noteId = ''
/** The parts of the person's note, as each case added them, in order. */
const added: QuickNoteAdded[] = []

async function send(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method, headers: AS_THE_PERSON, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${path}: ${text.slice(0, 300)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, unknown>
}

/** A note's record, as the office holds it. */
async function theNote(id: string): Promise<{ workspaceId: string; kind: string; parts: QuickNotePart[] }> {
  const record = (await send('GET', `/api/records/${id}`))['record'] as { workspaceId: string; kind: string; data: { parts: QuickNotePart[] } }
  return { workspaceId: record.workspaceId, kind: record.kind, parts: record.data.parts }
}

/** The note's parts added from a page, in order. */
async function theAddedParts(id: string): Promise<QuickNoteAdded[]> {
  return (await theNote(id)).parts.filter((part): part is QuickNoteAdded => part.type === 'added')
}

/** What window.open was asked for, kept by the page. */
async function watchTheOpenings(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const kept = window as unknown as { theOpenings: string[] }
    kept.theOpenings = []
    const open = window.open.bind(window)
    window.open = (url?: string | URL, target?: string, features?: string) => {
      kept.theOpenings.push(String(url ?? ''))
      return open(url, target, features)
    }
  })
}

const theOpenings = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { theOpenings: string[] }).theOpenings)

/** A window with its stored choices set before the app runs, and window.open watched. */
async function aWindow(look: { width?: number; theme?: 'light' | 'dark'; video?: string } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const height = width <= 390 ? 844 : 900
  const context = await app.browser.newContext({
    viewport: { width, height },
    ...(look.video === undefined ? {} : { recordVideo: { dir: look.video, size: { width, height } } }),
  })
  await context.addInitScript((theme) => {
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
  }, look.theme ?? 'light')
  await openRecordPagesAt(context, 'full')
  await watchTheOpenings(context)
  return { context, page: await context.newPage() }
}

async function go(page: Page, hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

async function thePanelIsDrawn(page: Page): Promise<void> {
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
  await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
}

/** Select the report's words from "glaze" to "rose", across the bold and the maths, and right-click them. */
async function rightClickTheWords(page: Page): Promise<void> {
  await go(page, `/r/${reportId}`)
  const runs = '[data-text-field="data.blocks[#b-1].text"]'
  await page.locator(runs).first().waitFor({ timeout: 30_000 })
  await page.locator(runs).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await page.evaluate((sel) => {
    const all = [...document.querySelectorAll<HTMLElement>(sel)]
    const textOf = (el: HTMLElement | undefined): Text | null => (el === undefined ? null : (document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text | null))
    const first = textOf(all.find((el) => el.textContent?.includes('glaze') === true))
    const last = textOf([...all].reverse().find((el) => el.textContent?.includes('rose') === true))
    if (first === null || last === null) throw new Error('the words are not drawn in runs')
    const range = document.createRange()
    range.setStart(first, first.data.indexOf('glaze'))
    range.setEnd(last, last.data.indexOf('rose') + 'rose'.length)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, runs)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await thePanelIsDrawn(page)
}

/** Right-click the middle of one thing on the page. */
async function rightClickOn(page: Page, thing: Locator): Promise<void> {
  await thing.waitFor({ timeout: 30_000 })
  await thing.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const box = await thing.boundingBox()
  if (box === null) throw new Error('the thing is not drawn')
  await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), { button: 'right' })
  await thePanelIsDrawn(page)
}

/** Right-click the empty page under the settings page's last panel, found as tests/the-menu-is-never-refused.test.ts finds it. */
async function rightClickTheEmptyPage(page: Page): Promise<void> {
  await go(page, '/settings')
  const at = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    const panels = [...document.querySelectorAll<HTMLElement>('#main [data-target], #main [data-settings-panel]')]
    const last = panels[panels.length - 1]
    if (last === undefined) return null
    const box = last.getBoundingClientRect()
    const x = Math.round(box.left + 40)
    for (let y = Math.round(box.bottom) + 2; y < window.innerHeight - 2; y += 2) {
      const under = document.elementFromPoint(x, y)
      if (under === null) continue
      const says = under.closest('[data-target]')?.getAttribute('data-target') ?? ''
      if (says.startsWith('page/')) return { x, y }
    }
    return null
  })
  if (at === null) throw new Error('no pixel under the last panel answers with the page')
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await thePanelIsDrawn(page)
}

/** One side of the choice of what Send goes to. */
const theChoice = (page: Page, to: 'contact' | 'note'): Locator => page.locator(`.px-talk [role="radio"][data-send-to="${to}"]`)

/** The press on the right of the choice that names the note and opens the list of notes. */
const theNotePress = (page: Page): Locator => page.locator('.px-talk .px-talk-note-btn')

/** Send, which is always the first press of the row. */
const theSend = (page: Page): Locator => page.locator('.px-talk .px-talk-do > button').first()

/** The note the press on the right names, without its arrow. */
const theChosenNote = async (page: Page): Promise<string> => (await theNotePress(page).innerText()).replace(/\s*[▾▴]\s*$/u, '').replace(/\s+/g, ' ').trim()

/** Choose Note, and wait until it is chosen and the press on its right is drawn. */
async function chooseNote(page: Page): Promise<void> {
  await theChoice(page, 'note').click({ timeout: 20_000 })
  await expect.poll(() => theChoice(page, 'note').getAttribute('aria-checked'), { timeout: 10_000 }).toBe('true')
  await theNotePress(page).waitFor({ timeout: 10_000 })
}

/** Open the list of notes, wait until it has read them, and give the names it draws, in order. */
async function theNotesListed(page: Page): Promise<string[]> {
  if ((await theNotePress(page).getAttribute('aria-expanded')) !== 'true') await theNotePress(page).click()
  await page.locator('.px-talk .px-talk-notes:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
  return (await page.locator('.px-talk .px-talk-notes [role="option"]').allInnerTexts()).map((one) => one.replace(/\s+/g, ' ').trim())
}

/** Choose one note from the list by the name it draws, and wait until the press names it. */
async function pickTheNote(page: Page, name: string): Promise<void> {
  await theNotesListed(page)
  await page.locator('.px-talk .px-talk-notes').getByRole('option', { name, exact: true }).click()
  await expect.poll(() => theChosenNote(page), { timeout: 10_000 }).toBe(name)
}

/** The page's own name, as the page draws it on its floor. */
const thePagesName = (page: Page): Promise<string | null> => page.evaluate(() => document.querySelector('.shell')?.getAttribute('data-name') ?? null)

/** Send what was pointed at to the note chosen first, wait for the box to say it was added, and give the part the note gained. */
async function addToTheNote(page: Page): Promise<QuickNoteAdded> {
  const before = (await theAddedParts(noteId)).length
  await chooseNote(page)
  await expect.poll(() => theChosenNote(page), { timeout: 20_000 }).toBe(NOTE_TITLE)
  await expect.poll(() => theSend(page).getAttribute('aria-disabled'), { timeout: 20_000 }).toBe(null)
  await theSend(page).click()
  const said = page.locator('.px-talk [role="status"]', { hasText: sayInEnglish('talk.addedToNote', { name: NOTE_TITLE }) })
  await said.waitFor({ timeout: 20_000 })
  expect(await said.locator(`a[href="#/${THE_QUICK_NOTE_SEGMENT}/${noteId}"]`).count(), 'the line links to the note').toBe(1)
  const parts = await theAddedParts(noteId)
  expect(parts.length, 'one part added').toBe(before + 1)
  const part = parts[parts.length - 1]!
  expect(part.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u)
  added.push(part)
  return part
}

beforeAll(async () => {
  app = await liveApp({ name: 'add-to-note', viewport: { width: 1440, height: 900 } })
  await app.page.goto(`${app.site}/`)
  await waitForThePage(app.page)
  const drawn = await app.page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 320
    const pen = canvas.getContext('2d')
    if (pen === null) return ''
    pen.fillStyle = '#587b9b'
    pen.fillRect(0, 0, 640, 320)
    return canvas.toDataURL('image/png')
  })
  expect(drawn, 'the browser drew the made-up picture').not.toBe('')
  const stored = (await send('POST', '/api/report-files', { bytes: drawn.split(',')[1], name: 'a-made-up-blue-picture.png' }))['file'] as { path: string }
  picture = { id: 'b-2', type: 'image', path: stored.path, alt: 'A made-up blue picture' }
  const report = (await send('POST', '/api/records', {
    kind: 'report',
    title: REPORT_TITLE,
    data: { for: 'Made-up glaze team', date: '2026-11-15', blocks: [{ id: 'b-1', type: 'text', text: WORDS }, picture, TABLE] },
  }))['record'] as { id: string }
  reportId = report.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('Send to a note, in the right-click box', () => {
  it('offers Note beside Contact, and with no note written in chooses New note, lists only it, and is on with nothing typed', async () => {
    const { context, page } = await aWindow()
    try {
      await rightClickTheWords(page)
      expect(await theChoice(page, 'contact').getAttribute('aria-checked'), 'Contact is chosen at open').toBe('true')
      expect((await theChoice(page, 'contact').innerText()).trim()).toBe(sayInEnglish('talk.sendTo.contact'))
      expect((await theChoice(page, 'note').innerText()).trim()).toBe(sayInEnglish('talk.sendTo.note'))
      expect(await theNotePress(page).count(), 'no note press while Contact is chosen').toBe(0)
      expect(await theSend(page).getAttribute('aria-disabled'), 'to a contact, with nothing typed, Send is off').toBe('true')
      await chooseNote(page)
      expect(await page.locator('.px-talk .px-talk-to-btn').count(), 'the note press is drawn in the contact press’s place').toBe(0)
      await expect.poll(() => theChosenNote(page), { timeout: 20_000 }).toBe(sayInEnglish('talk.note.new'))
      expect(await theNotesListed(page)).toEqual([sayInEnglish('talk.note.new')])
      await expect.poll(() => theSend(page).getAttribute('aria-disabled'), { timeout: 20_000 }).toBe(null)
      await theChoice(page, 'contact').click()
      await page.locator('.px-talk .px-talk-to-btn').waitFor({ timeout: 10_000 })
      expect(await theNotePress(page).count(), 'Contact again draws the contact press').toBe(0)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('adds words selected across bold and maths as they are stored, into the note the person last wrote in, which it names', async () => {
    const parts: QuickNotePart[] = [{ id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: `${NOTE_TITLE}\nThings to look at again.` }]
    noteId = String(((await send('POST', '/api/records', { kind: 'quick_note', title: NOTE_TITLE, data: { parts } }))['record'] as { id: string }).id)
    const { context, page } = await aWindow()
    try {
      await rightClickTheWords(page)
      const part = await addToTheNote(page)
      expect(part.copy).toEqual({ type: 'blocks', blocks: [{ id: 'b-1', type: 'text', text: SELECTED }] })
      expect(part.from).toEqual({ address: `#/r/${reportId}`, name: REPORT_TITLE, recordId: reportId })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('adds a picture as the picture', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/r/${reportId}`)
      const shown = page.locator('#main figure.sb-image img')
      await shown.waitFor({ timeout: 30_000 })
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('#main figure.sb-image img')].some((one) => one.complete && one.naturalWidth > 0), null, { timeout: 30_000 })
      await rightClickOn(page, shown.first())
      const part = await addToTheNote(page)
      expect(part.copy).toEqual({ type: 'blocks', blocks: [picture] })
      expect(part.from).toEqual({ address: `#/r/${reportId}`, name: REPORT_TITLE, recordId: reportId })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('adds a table row as the row, from a right-click on one of its cells', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/r/${reportId}`)
      await rightClickOn(page, page.locator(`#main [data-target^="tableCell/${reportId}/b-3/2/"]`).first())
      const part = await addToTheNote(page)
      expect(part.copy).toEqual({ type: 'blocks', blocks: [{ ...TABLE, rows: [TABLE.rows[1]] }] })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('adds a record from a list as its card, from the list’s page', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/records')
      await rightClickOn(page, page.locator(`#main [data-target^="record/${reportId}/"]`).first())
      const part = await addToTheNote(page)
      expect(part.copy).toMatchObject({ type: 'card', recordId: reportId, kind: 'report', title: REPORT_TITLE })
      const name = await thePagesName(page)
      expect(name, 'the page draws its name').not.toBe(null)
      expect(part.from).toEqual({ address: '#/records', name })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('adds the page itself, by its name, from a right-click on empty page', async () => {
    const { context, page } = await aWindow()
    try {
      await rightClickTheEmptyPage(page)
      const part = await addToTheNote(page)
      expect(part.copy).toEqual({ type: 'page' })
      const name = await thePagesName(page)
      expect(name, 'the settings page is named as its sidebar row').toBe(sayInEnglish('nav.settings'))
      expect(part.from).toEqual({ address: '#/settings', name })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('keeps each part as it was added after the report changes, and the note draws them with a link back', async () => {
    const read = await send('GET', `/api/records/${reportId}`)
    const blocks = ((read['record'] as { data: { blocks: Record<string, unknown>[] } }).data.blocks).map((block) =>
      // The new words still hold "glaze" and "rose", so the cases after this one can still select between them.
      block['id'] === 'b-1' ? { ...block, text: 'Made-up words written after the note was added to: the glaze ran and the colour rose.' } : block,
    )
    await send('PATCH', `/api/records/${reportId}`, { ifVersion: read['version'], dataPatch: { blocks } })
    expect(await theAddedParts(noteId), 'the note holds what was added, as it was').toEqual(added)

    const { context, page } = await aWindow()
    try {
      await go(page, `/${THE_QUICK_NOTE_SEGMENT}/${noteId}`)
      const parts = page.locator('.qn-added')
      await expect.poll(() => parts.count(), { timeout: 30_000 }).toBe(added.length)
      const words = parts.nth(0)
      expect(await words.locator('strong').first().innerText()).toBe('cone 6')
      expect(await words.locator('.katex').count(), 'the maths is drawn as maths').toBeGreaterThan(0)
      expect(await parts.nth(1).locator('img').count(), 'the picture is drawn as the picture').toBe(1)
      expect(await parts.nth(2).locator('tbody tr').count(), 'one row').toBe(1)
      expect(await parts.nth(2).innerText()).toContain('Made-up 1180')
      expect(await parts.nth(3).innerText()).toContain(REPORT_TITLE)
      expect(await parts.nth(4).locator('.qn-added-from a').innerText(), 'the page, by its name').toBe(added[4]?.from.name)
      await words.locator('.qn-added-from a').click()
      await page.waitForFunction((hash) => window.location.hash === hash, `#/r/${reportId}`, { timeout: 10_000 })
      await page.locator('[data-text-field="data.blocks[#b-1].text"]', { hasText: 'written after the note' }).first().waitFor({ timeout: 30_000 })
    } finally {
      await context.close()
    }
  }, 180_000)

  it('places the added table below the added picture at wide and narrow widths', async () => {
    const gaps: number[] = []
    for (const width of [1440, 390]) {
      const { context, page } = await aWindow({ width })
      try {
        await go(page, `/${THE_QUICK_NOTE_SEGMENT}/${noteId}`)
        const parts = page.locator('.qn-added')
        const picture = parts.nth(1)
        const table = parts.nth(2)
        await picture.locator('img').waitFor({ timeout: 30_000 })
        await table.locator('tbody tr').waitFor({ timeout: 30_000 })
        const pictureBox = await picture.boundingBox()
        const tableBox = await table.boundingBox()
        expect(pictureBox, `picture at ${String(width)}px`).not.toBeNull()
        expect(tableBox, `table at ${String(width)}px`).not.toBeNull()
        gaps.push(tableBox!.y - (pictureBox!.y + pictureBox!.height))
      } finally {
        await context.close()
      }
    }
    expect(Math.min(...gaps), `table-to-picture gaps at 1440px and 390px: ${gaps.join(', ')}`).toBeGreaterThanOrEqual(0)
  }, 180_000)

  it('sends to a new note with the typed words below what was pointed at, links to it, and the link opens it floating over the page', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/r/${reportId}`)
      await rightClickOn(page, page.locator(`#main [data-target^="tableCell/${reportId}/b-3/1/"]`).first())
      await page.locator('.px-talk textarea').fill(TYPED)
      await chooseNote(page)
      await pickTheNote(page, sayInEnglish('talk.note.new'))
      await theSend(page).click()
      const said = page.locator('.px-talk [role="status"]', { hasText: sayInEnglish('talk.addedToANewNote') })
      await said.waitFor({ timeout: 20_000 })
      const link = said.locator(`a[href^="#/${THE_QUICK_NOTE_SEGMENT}/"]`)
      const href = await link.getAttribute('href')
      const newId = decodeURIComponent((href ?? '').slice(`#/${THE_QUICK_NOTE_SEGMENT}/`.length))
      expect(newId, 'the line links to the new note').not.toBe('')
      expect(newId).not.toBe(noteId)
      const note = await theNote(newId)
      expect(note.kind).toBe('quick_note')
      expect(note.workspaceId, 'filed in the project the switcher is on').toBe('default')
      expect(note.parts.map((part) => part.type), 'what was pointed at, then the typed words').toEqual(['added', 'words'])
      const [pointed, words] = note.parts as [QuickNoteAdded, QuickNoteWords]
      expect(pointed.copy).toEqual({ type: 'blocks', blocks: [{ ...TABLE, rows: [TABLE.rows[0]] }] })
      expect(words.text).toBe(TYPED)
      expect(words.y, 'the typed words are below what was pointed at').toBeGreaterThan(pointed.y)
      expect(await page.locator('.px-talk textarea').inputValue(), 'the box is emptied').toBe('')
      await expect.poll(() => theChosenNote(page), { timeout: 10_000 }).toBe(TYPED_TITLE)
      expect(await theOpenings(page), 'no window opened').toEqual([])
      expect(await page.locator('[data-quick-note-beside]').count(), 'nothing opened beside the page').toBe(0)
      expect(context.pages().length, 'no second page').toBe(1)
      expect(await theAddedParts(noteId), 'the older note is as it was').toEqual(added)

      // THE LINK OPENS THE NOTE FLOATING OVER THE PAGE, as a card of My notes does: no window and no new address.
      await link.click()
      await expect.poll(() => page.locator('[data-quick-note-beside] .qn-added').count(), { timeout: 30_000 }).toBe(1)
      expect(await page.evaluate(() => window.location.hash), 'the page stays where it was').toBe(`#/r/${reportId}`)
      expect(await theOpenings(page), 'no window opened').toEqual([])
      expect(context.pages().length, 'no second page').toBe(1)

      // THE NEXT OPENING CHOOSES THE NOTE LAST WRITTEN IN, named by its first line, and lists it first.
      await rightClickTheWords(page)
      await chooseNote(page)
      await expect.poll(() => theChosenNote(page), { timeout: 20_000 }).toBe(TYPED_TITLE)
      expect(await theNotesListed(page)).toEqual([sayInEnglish('talk.note.new'), TYPED_TITLE, NOTE_TITLE])
    } finally {
      await context.close()
    }
  }, 180_000)

  it('says it is waiting while the write waits, and says why in the box when the write is refused', async () => {
    const { context, page } = await aWindow()
    try {
      await rightClickTheWords(page)
      await page.locator('.px-talk textarea').fill(TYPED)
      await chooseNote(page)
      await pickTheNote(page, NOTE_TITLE)
      const before = (await theNote(noteId)).parts
      // ONE ANSWER IS HELD: the write into the note. Every read goes through as it is.
      let held: () => void = () => {}
      const release = new Promise<void>((resolve) => {
        held = resolve
      })
      let asked = false
      const theWriteIntoTheNote = (url: URL): boolean => url.pathname === `/api/records/${noteId}`
      await page.route(
        theWriteIntoTheNote,
        async (route) => {
          if (route.request().method() !== 'PATCH') return route.fallback()
          asked = true
          await release
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Made-up refusal: the test answered 409 for this write.' }) })
        },
      )
      await theSend(page).click()
      await expect.poll(() => asked, { timeout: 20_000 }).toBe(true)
      const waiting = page.locator('.px-talk .px-talk-do [role="status"]', { hasText: sayInEnglish('talk.addToNote.adding') })
      await waiting.waitFor({ timeout: 10_000 })
      expect(await theSend(page).getAttribute('data-pending'), 'Send is waiting').toBe('1')
      await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000 }).toBeGreaterThan(0)
      held()
      await page.locator('.px-talk .px-error', { hasText: sayInEnglish('talk.addToNote.changedElsewhere') }).waitFor({ timeout: 20_000 })
      expect(await waiting.count(), 'the waiting line goes with the wait').toBe(0)
      expect(await page.locator('.px-talk textarea').inputValue(), 'the words stay in the box').toBe(TYPED)
      expect((await theNote(noteId)).parts, 'the note is as it was').toEqual(before)
      await page.unroute(theWriteIntoTheNote)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('lists one page of My notes, the newest first, and says how many older notes it does not list', async () => {
    for (let n = 1; n <= MY_NOTES_PAGE_SIZE; n++) {
      const parts: QuickNotePart[] = [{ id: 'w-1', type: 'words', x: 40, y: 32, width: 320, text: `Made-up note ${String(n)}` }]
      await send('POST', '/api/records', { kind: 'quick_note', title: `Made-up note ${String(n)}`, data: { parts } })
    }
    const door = (await send('GET', `/api/records/my-notes?only=all&zone=UTC&limit=${String(MY_NOTES_PAGE_SIZE)}&offset=0`)) as unknown as MyNotesReply
    // MORE NOTES THAN ONE PAGE HOLDS: the note of the first cases and the 25 here, and the one case 9 sends to when it
    // passes. The count is the door's, so this case leans on no earlier case.
    expect(door.left, 'the notes the first page does not hold').toBeGreaterThan(0)
    const { context, page } = await aWindow()
    try {
      await rightClickTheWords(page)
      await chooseNote(page)
      expect(await theNotesListed(page)).toEqual([sayInEnglish('talk.note.new'), ...door.notes.map((one) => one.title)])
      expect(door.notes.map((one) => one.title).sort()).toEqual(Array.from({ length: MY_NOTES_PAGE_SIZE }, (_, i) => `Made-up note ${String(i + 1)}`).sort())
      expect((await page.locator('.px-talk .px-talk-notes-left').innerText()).trim()).toBe(sayInEnglish('talk.note.left', { n: door.left }))
    } finally {
      await context.close()
    }
  }, 180_000)
})

it.skipIf(PICTURES === undefined)('takes the pictures of the menu and of the note, and a video of three things added and a link back', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      const { context, page } = await aWindow({ width, theme })
      try {
        const name = (what: string): string => join(folder, `${what}-${String(width)}-${theme}.png`)
        await go(page, `/r/${reportId}`)
        expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe(theme)
        await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), CALLED)
        await rightClickTheWords(page)
        await chooseNote(page)
        await theNotesListed(page)
        await page.mouse.move(0, 0)
        await page.waitForTimeout(600)
        await page.screenshot({ path: name('add-to-note-menu') })
        await page.keyboard.press('Escape')
        await go(page, `/${THE_QUICK_NOTE_SEGMENT}/${noteId}`)
        await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), CALLED)
        await page.locator('.qn-added').first().waitFor({ timeout: 30_000 })
        await page.mouse.move(0, 0)
        await page.waitForTimeout(600)
        await page.screenshot({ path: name('add-to-note-the-note') })
      } finally {
        await context.close()
      }
    }
  }

  // THE VIDEO: three kinds of thing added to a new note of its own, and a link back clicked.
  const { context, page } = await aWindow({ video: folder })
  try {
    await go(page, `/r/${reportId}`)
    await rightClickTheWords(page)
    await chooseNote(page)
    await pickTheNote(page, sayInEnglish('talk.note.new'))
    await theSend(page).click()
    const said = page.locator('.px-talk [role="status"]', { hasText: sayInEnglish('talk.addedToANewNote') })
    await said.waitFor({ timeout: 20_000 })
    const href = (await said.locator(`a[href^="#/${THE_QUICK_NOTE_SEGMENT}/"]`).getAttribute('href')) ?? ''
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await rightClickOn(page, page.locator('#main figure.sb-image img').first())
    await chooseNote(page)
    await theSend(page).click()
    await page.locator('.px-talk [role="status"]').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await rightClickOn(page, page.locator(`#main [data-target^="tableCell/${reportId}/b-3/2/"]`).first())
    await chooseNote(page)
    await theSend(page).click()
    await page.locator('.px-talk [role="status"]').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await go(page, href.slice(1))
    await page.locator('.qn-added').nth(2).waitFor({ timeout: 30_000 })
    await page.waitForTimeout(1500)
    await page.locator('.qn-added').nth(1).locator('.qn-added-from a').click()
    await page.waitForFunction((hash) => window.location.hash === hash, `#/r/${reportId}`, { timeout: 10_000 })
    await page.waitForTimeout(1500)
  } finally {
    await context.close()
  }
}, 900_000)
