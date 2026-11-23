// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NOTE LOOKS THE OWNER CHOSE, DRAWN IN A BROWSER.
 *
 * WHAT IS BEING PROVED, on the office's own pages in a test office of its own, at 1440 by 1000, in English:
 *   1. A note's tags are drawn under its title as filled colour tags, each in a colour of its own, and a tag added in
 *      the note's field is kept by the note's save. The tags are read back from the office.
 *   2. On My notes each card draws its note's tags as filled colour tags, and a tag has the same colour on the card as
 *      in the note.
 *   3. My notes sorts the notes newest first, or by their first tag from A to Z, with a note that has no tag last. It
 *      starts newest first. The press that chooses says which sort is chosen, by its words and by aria-pressed.
 *   4. In the right-click box, the New note row of the list of notes has a plus in a circle before its words, and the
 *      person's own notes have none. The note press shows the same mark while New note is chosen.
 *   5. The My notes row in the sidebar draws the writing board, and not the report icon that Reports draws.
 *
 * The office is this test's own. `liveApp` serves it on a database in its own temporary folder, and every record is
 * filed through the office's own doors, as a person's own writes are. Every title, word and tag says it is made up.
 */
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theClockZone } from '../src/shared/time.ts'
import type { MyNotesReply } from '../src/shared/my-notes.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { pathFor } from '../src/web/components/router.tsx'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_REPORT = 'Made-up report for the note looks'

/**
 * The made-up notes, filed oldest first, a second apart, so that newest first and tag A to Z put them in different
 * orders. The last has no tag, so it is first by newest and last by tag.
 */
const NOTES = [
  { title: 'Made-up note about a made-up apple', tags: ['made-up apple', 'made-up glaze'] },
  { title: 'Made-up note about a made-up cherry', tags: ['made-up cherry'] },
  { title: 'Made-up note about a made-up banana', tags: ['made-up banana', 'made-up glaze'] },
  { title: 'Made-up note with no made-up tag', tags: [] },
] as const

let live: LiveApp
let report = ''
const ids: string[] = []

async function file(body: { kind: string; title: string; data: Record<string, unknown> }): Promise<string> {
  const filed = await fetch(`${live.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(filed.status, `POST /api/records: ${await filed.clone().text()}`).toBe(201)
  return ((await filed.json()) as { record: { id: string } }).record.id
}

/** The tags the office holds for a note. */
async function theStoredTags(id: string): Promise<unknown> {
  const read = await fetch(`${live.api}/api/records/${encodeURIComponent(id)}`, { headers: PERSON })
  expect(read.status, `GET the note: ${await read.clone().text()}`).toBe(200)
  return ((await read.json()) as { record: { data: Record<string, unknown> } }).record.data['tags']
}

/** Every note, as the my-notes door lists them, the newest started first. */
async function theDoorsNotes(): Promise<MyNotesReply['notes']> {
  const query = new URLSearchParams({ only: 'all', zone: theClockZone(), limit: '25', offset: '0' })
  const read = await fetch(`${live.api}/api/records/my-notes?${query.toString()}`, { headers: PERSON })
  expect(read.status, `GET my-notes: ${await read.clone().text()}`).toBe(200)
  return ((await read.json()) as MyNotesReply).notes
}

beforeAll(async () => {
  live = await liveApp({ name: 'the-note-looks-the-owner-chose', viewport: { width: 1440, height: 1000 }, workspace: WORKSPACE, opensAt: 'full' })
  report = await file({
    kind: 'report',
    title: THE_REPORT,
    data: { for: 'Made-up reader', date: '2026-11-21', blocks: [{ id: 'b-1', type: 'text', heading: 'Made-up part', text: 'Made-up paragraph.' }] },
  })
  for (const [at, note] of NOTES.entries()) {
    if (at > 0) await new Promise((done) => setTimeout(done, 1100))
    ids.push(
      await file({
        kind: 'quick_note',
        title: note.title,
        data: { parts: [{ id: 'w-1', type: 'words', x: 24, y: 16, width: 280, text: `${note.title}.` }], ...(note.tags.length === 0 ? {} : { tags: [...note.tags] }) },
      }),
    )
  }
}, 300_000)

afterAll(async () => {
  await live?.stop()
}, 60_000)

/** A window of its own, in English and in the light theme, with the chat closed and the sidebar open. */
async function aWindow(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await live.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(
    ([sidebarKey]) => {
      try {
        localStorage.setItem('mole-office.preset.theme', 'light')
        localStorage.setItem('mole-office.language', 'en')
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
        localStorage.setItem(sidebarKey, 'expanded')
      } catch {
        // A blank page has no storage of the office's, and the next page sets it.
      }
    },
    [SIDEBAR_KEY] as const,
  )
  await openRecordPagesAt(context, 'full')
  return { context, page: await context.newPage() }
}

async function go(page: Page, path: string): Promise<void> {
  await page.goto(`${live.site}/?lang=en&mode=normal#${path}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** What a tag is drawn as: its words, its colour's name, its class and its filled ground. */
async function howATagIsDrawn(tag: Locator): Promise<{ words: string; colour: string | null; inked: boolean; ground: string }> {
  return tag.evaluate((element) => ({
    words: (element.querySelector('.qn-tag-word, .mn-tag-word') ?? element).textContent?.trim() ?? '',
    colour: element.getAttribute('data-colour'),
    inked: element.classList.contains('px-label-ink'),
    ground: getComputedStyle(element).backgroundColor,
  }))
}

const UNFILLED = ['transparent', 'rgba(0, 0, 0, 0)']

describe('the note looks the owner chose', () => {
  it('draws a note\'s tags as filled colour tags, and keeps a tag added in the note', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/${THE_QUICK_NOTE_SEGMENT}/${ids[0]!}`)
      const tags = page.locator('.qn-note .qn-tags').first()
      const drawn = tags.locator('.qn-tag')
      await drawn.nth(1).waitFor({ timeout: 30_000 })
      for (const [at, tag] of NOTES[0].tags.entries()) {
        const one = await howATagIsDrawn(drawn.nth(at))
        expect(one.words).toBe(tag)
        expect(one.inked, `${tag} is not drawn as a colour tag`).toBe(true)
        expect(one.colour, `${tag} has no colour`).not.toBeNull()
        expect(UNFILLED, `${tag} is not filled`).not.toContain(one.ground)
      }
      // A TAG ADDED IN THE FIELD IS SAVED with the note, and the office holds it after the tags it had.
      const saved = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/records/${ids[0]!}` && response.status() === 200,
        { timeout: 30_000 },
      )
      const field = tags.getByRole('textbox', { name: t('quickNote.addATag'), exact: true })
      await field.fill('made-up clay')
      await field.press('Enter')
      await saved
      await expect.poll(() => theStoredTags(ids[0]!), { timeout: 10_000 }).toEqual([...NOTES[0].tags, 'made-up clay'])
      expect((await howATagIsDrawn(drawn.nth(2))).words).toBe('made-up clay')
    } finally {
      await context.close()
    }
  }, 180_000)

  it('draws each card\'s tags on My notes as filled colour tags, in the colour the note gives the tag', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, `/${THE_QUICK_NOTE_SEGMENT}/${ids[2]!}`)
      const inTheNote = page.locator('.qn-note .qn-tags .qn-tag')
      await inTheNote.nth(1).waitFor({ timeout: 30_000 })
      const noted = new Map<string, Awaited<ReturnType<typeof howATagIsDrawn>>>()
      for (let at = 0; at < 2; at += 1) {
        const one = await howATagIsDrawn(inTheNote.nth(at))
        noted.set(one.words, one)
      }
      await go(page, pathFor('myNotes'))
      const card = page.locator(`#main .mn-card[data-note="${ids[2]!}"]`)
      const onTheCard = card.locator('.mn-card-tags .mn-tag')
      await onTheCard.nth(1).waitFor({ timeout: 30_000 })
      for (const tag of NOTES[2].tags) {
        const one = await howATagIsDrawn(onTheCard.filter({ hasText: tag }).first())
        expect(one.inked, `${tag} is not drawn as a colour tag on the card`).toBe(true)
        expect(UNFILLED, `${tag} is not filled on the card`).not.toContain(one.ground)
        expect(one.colour, `${tag} has another colour on the card`).toBe(noted.get(tag)?.colour)
        expect(one.ground, `${tag} has another ground on the card`).toBe(noted.get(tag)?.ground)
      }
      // THE TAG TWO NOTES SHARE has one colour on both cards.
      const shared = async (id: string) => howATagIsDrawn(page.locator(`#main .mn-card[data-note="${id}"] .mn-card-tags .mn-tag`).filter({ hasText: 'made-up glaze' }).first())
      expect((await shared(ids[0]!)).colour).toBe((await shared(ids[2]!)).colour)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('sorts My notes newest first, or by tag from A to Z, and the press says which', async () => {
    const { context, page } = await aWindow()
    try {
      const door = await theDoorsNotes()
      const newest = door.map((note) => note.id)
      const firstTagOf = (note: (typeof door)[number]): string | null => {
        const tags = note.data['tags']
        return Array.isArray(tags) && typeof tags[0] === 'string' ? tags[0] : null
      }
      const byTag = door
        .map((note, at) => ({ id: note.id, at, tag: firstTagOf(note) }))
        .sort((a, b) => (a.tag === null ? 1 : 0) - (b.tag === null ? 1 : 0) || (a.tag ?? '').localeCompare(b.tag ?? '') || a.at - b.at)
        .map((one) => one.id)
      expect(byTag, 'the made-up notes do not tell the two sorts apart').not.toEqual(newest)

      await go(page, pathFor('myNotes'))
      const cards = page.locator('#main .mn-card[data-note]')
      await cards.nth(door.length - 1).waitFor({ timeout: 30_000 })
      const order = () => cards.evaluateAll((all) => all.map((one) => one.getAttribute('data-note')))
      const sorts = page.locator('#main').getByRole('group', { name: t('myNotes.sortBy'), exact: true })
      const newestFirst = sorts.getByRole('button', { name: t('myNotes.newestFirst'), exact: true })
      const tagAToZ = sorts.getByRole('button', { name: t('myNotes.tagAToZ'), exact: true })
      await expect.poll(() => sorts.textContent(), { timeout: 10_000 }).toContain(t('myNotes.sortBy'))

      // IT STARTS NEWEST FIRST, and says so.
      expect(await newestFirst.getAttribute('aria-pressed')).toBe('true')
      expect(await tagAToZ.getAttribute('aria-pressed')).toBe('false')
      expect(await order()).toEqual(newest)

      await tagAToZ.click()
      await expect.poll(() => tagAToZ.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
      expect(await newestFirst.getAttribute('aria-pressed')).toBe('false')
      expect(await order()).toEqual(byTag)

      await newestFirst.click()
      await expect.poll(() => newestFirst.getAttribute('aria-pressed'), { timeout: 10_000 }).toBe('true')
      expect(await order()).toEqual(newest)
    } finally {
      await context.close()
    }
  }, 180_000)

  it('puts a plus in a circle before New note in the right-click box', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/records')
      const row = page.locator(`#main [data-target^="record/${report}/"]`).first()
      await row.waitFor({ timeout: 30_000 })
      await row.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      const box = await row.boundingBox()
      expect(box, 'the made-up report is not drawn').not.toBeNull()
      await page.mouse.click(Math.round(box!.x + box!.width / 2), Math.round(box!.y + box!.height / 2), { button: 'right' })
      await page.locator('.px-talk-do:not([aria-busy="true"])').waitFor({ timeout: 20_000 })
      const toANote = page.locator('.px-talk [role="radio"][data-send-to="note"]')
      await toANote.click({ timeout: 20_000 })
      await expect.poll(() => toANote.getAttribute('aria-checked'), { timeout: 10_000 }).toBe('true')
      const notePress = page.locator('.px-talk .px-talk-note-btn:not([aria-busy="true"])')
      await notePress.waitFor({ timeout: 20_000 })
      const theNotes = page.locator('.px-talk .px-talk-notes:not([aria-busy="true"])')
      if ((await notePress.getAttribute('aria-expanded')) !== 'true') await notePress.click()
      await theNotes.locator('[role="option"][data-note]').first().waitFor({ timeout: 20_000 })

      /** Whether a press holds a plus in a circle, drawn before its words and hidden from a reader. */
      const theMarkComesFirst = (press: Locator) =>
        press.evaluate((element, words) => {
          const mark = element.querySelector('svg')
          if (mark === null || mark.querySelector('circle') === null || mark.querySelector('path') === null) return 'no plus in a circle'
          if (mark.getAttribute('aria-hidden') !== 'true') return 'the mark is not hidden from a reader'
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let text: Node | null = walker.nextNode()
          while (text !== null && !(text.textContent ?? '').includes(words)) text = walker.nextNode()
          if (text === null) return 'no words'
          if (!(mark.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING)) return 'the mark is not before the words'
          const range = document.createRange()
          range.selectNodeContents(text)
          return mark.getBoundingClientRect().right <= range.getBoundingClientRect().left + 1 ? 'first' : 'the mark is not drawn before the words'
        }, t('talk.note.new'))

      const newNote = theNotes.getByRole('option', { name: t('talk.note.new'), exact: true })
      expect(await theMarkComesFirst(newNote)).toBe('first')
      const theirs = theNotes.locator('[role="option"][data-note]')
      for (let at = 0; at < (await theirs.count()); at += 1) {
        expect(await theirs.nth(at).locator('svg').count(), 'a note of the person\'s has a mark').toBe(0)
      }
      // CHOOSING NEW NOTE CLOSES THE LIST, and the press then shows the same mark before New note.
      await newNote.click()
      await expect.poll(() => notePress.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('false')
      expect(await theMarkComesFirst(notePress)).toBe('first')
    } finally {
      await context.close()
    }
  }, 180_000)

  it('draws the writing board beside My notes, and not the report icon of Reports', async () => {
    const { context, page } = await aWindow()
    try {
      await go(page, '/records')
      const icon = (surface: string) => page.locator(`#shell-side a.shell-link[data-target="uiSurface/${surface}"] svg.shell-ico`).first()
      await icon('rail.mynotes').waitFor({ timeout: 30_000 })
      await icon('rail.notes').waitFor({ timeout: 30_000 })
      expect(await icon('rail.mynotes').getAttribute('data-icon')).toBe('writingBoard')
      expect(await icon('rail.notes').getAttribute('data-icon')).toBe('notes')
      const drawing = (surface: string) => icon(surface).evaluate((element) => element.innerHTML)
      expect(await drawing('rail.mynotes')).not.toBe(await drawing('rail.notes'))
    } finally {
      await context.close()
    }
  }, 180_000)
})
