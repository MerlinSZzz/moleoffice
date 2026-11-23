// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NOTE ASKS FOR ITS TITLE, IN A FIELD THAT IS EMPTY AND SHOWS AS A HINT THE TITLE IT WOULD GET. Point NT-3 of the
 * notes after the person's use of 20 November: a saved note's title was its first typed text, and nothing asked him.
 *
 * A note saves itself half a second after each change, so the asking is a field at the note's head, read at each save.
 * The note page is drawn in Chromium from a bundle, with the doors it calls answered by hand. No office is involved, and
 * every note in this file is made up.
 *
 * WHAT THIS FILE PROVES:
 *   - a new note's title field is empty, and its hint is the title the note's words would give it;
 *   - with the field left empty, the note is filed with that title, by the rule it had before;
 *   - a title typed in the field is the title saved, and words written after it do not change it;
 *   - a kept note with a title of its own shows it in the field, and emptying the field gives the note its words'
 *     title again;
 *   - two notes may be given the same title, and each is filed with it and said to be saved;
 *   - a card in My notes shows a title the person gave, with the note's first line after it, and otherwise the title
 *     the words give.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { QuickNotePart } from '../src/shared/kinds/quick-note.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { theCardWordsOf } from '../src/web/components/NoteSmallPicture.tsx'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

/** One save the page asked, with the title it sent. A change that leaves the title as it was sends none. */
interface Asked { door: 'file' | 'change'; title?: string }
type TheStand = { titled: { asked(): Asked[]; titleOf(id: string): string | undefined; keep(record: unknown): void; open(): void } }

const KEPT = {
  id: 'MadeUpTitled09', kind: 'quick_note', title: 'Made-up given title',
  data: { parts: [{ id: 'w-1', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up kept words' }] },
}

let browser: Browser
let script = ''
let server: Server | undefined
let site = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { api, ApiError } from './src/web/api.ts';
        import { QuickNotePage } from './src/web/pages/QuickNotePage.tsx';
        const asked = [];
        const stored = new Map();
        let version = 1;
        let files = 0;
        api.fileAQuickNote = async (input) => {
          asked.push({ door: 'file', title: input.title });
          files += 1;
          const record = { id: 'MadeUpTitled0' + files, kind: 'quick_note', title: input.title, data: input.data };
          stored.set(record.id, record);
          return { record, incomplete: [], version: 'v' + version };
        };
        api.changeAQuickNote = async (id, change) => {
          asked.push(change.title === undefined ? { door: 'change' } : { door: 'change', title: change.title });
          const record = stored.get(id);
          if (record !== undefined && change.title !== undefined) record.title = change.title;
          version += 1;
          return { version: 'v' + version, newSeq: version };
        };
        api.getRecord = async (id) => {
          const record = stored.get(id);
          if (record === undefined) throw new ApiError(404, 'No made-up record has that id.');
          return { record: structuredClone(record), version: 'v' + version };
        };
        window.titled = {
          asked: () => asked,
          titleOf: (id) => stored.get(id)?.title,
          keep: (record) => { stored.set(record.id, record) },
          open: () => createRoot(document.getElementById('app')).render(h(QuickNotePage)),
        };`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  const serving = createServer((asked, answer) => {
    const theScript = asked.url === '/page.js'
    answer.writeHead(200, { 'content-type': theScript ? 'text/javascript' : 'text/html', 'cache-control': 'no-store' })
    answer.end(theScript ? script : '<!doctype html><div id="app"></div>')
  })
  await new Promise<void>((resolve) => serving.listen(0, '127.0.0.1', resolve))
  server = serving
  site = `http://127.0.0.1:${String((serving.address() as AddressInfo).port)}`
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
  const serving = server
  serving?.closeAllConnections()
  if (serving !== undefined) await new Promise<void>((resolve) => serving.close(() => resolve()))
})

const theTitleField = (page: Page) => page.getByRole('textbox', { name: sayInEnglish('quickNote.titleField'), exact: true })
/** The words being written, while they are a field. */
const theWords = (page: Page) => page.locator('.qn-field').first()

/** The note page at an address, with the made-up kept note in its stand-in office. */
async function aNotePage(address: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 420, height: 520 } })
  await page.goto(`${site}/${address}`)
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'titled' in window, undefined, { timeout: 10_000 })
  await page.evaluate((kept) => {
    const stand = (window as unknown as TheStand).titled
    stand.keep(kept)
    stand.open()
  }, KEPT)
  await theTitleField(page).waitFor()
  return page
}

const asked = (page: Page): Promise<Asked[]> => page.evaluate(() => (window as unknown as TheStand).titled.asked())
/** Wait until the page has asked for this many saves, and hand back what it asked. */
async function askedAt(page: Page, count: number): Promise<Asked[]> {
  await page.waitForFunction((n) => (window as unknown as TheStand).titled.asked().length >= n, count, { timeout: 10_000 })
  return asked(page)
}

describe('a note asks for its title', () => {
  it('shows an empty field with the title its words would give as a hint, and files that title while it is empty', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    try {
      await expect(theTitleField(page).inputValue()).resolves.toBe('')
      expect(await theTitleField(page).getAttribute('placeholder')).toBe(sayInEnglish('quickNote.untitled'))
      await theWords(page).fill('Made-up first words')
      const [filed] = await askedAt(page, 1)
      expect(filed).toEqual({ door: 'file', title: 'Made-up first words' })
      expect(await theTitleField(page).inputValue(), 'the field stays empty once the note is saved').toBe('')
      expect(await theTitleField(page).getAttribute('placeholder')).toBe('Made-up first words')
    } finally { await page.close() }
  }, 60_000)

  it('saves a title typed in the field, and keeps it when more words are written', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    try {
      await theWords(page).fill('Made-up first words')
      await askedAt(page, 1)
      await theTitleField(page).fill('Made-up given title')
      const [, named] = await askedAt(page, 2)
      expect(named).toEqual({ door: 'change', title: 'Made-up given title' })
      // A PRESS ON THE WORDS WRITES IN THEM AGAIN, once the title field has taken the cursor from them.
      await page.locator('.qn-written').first().click()
      await theWords(page).fill('Made-up other words')
      const [, , later] = await askedAt(page, 3)
      expect(later, 'words written after a title was given leave the title as it is').toEqual({ door: 'change' })
      expect(await theTitleField(page).inputValue()).toBe('Made-up given title')
    } finally { await page.close() }
  }, 60_000)

  it('shows a kept note\'s own title in the field, and gives the note its words\' title again when the field is emptied', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${KEPT.id}`)
    try {
      await expect.poll(() => theTitleField(page).inputValue()).toBe('Made-up given title')
      await page.waitForTimeout(1_000)
      expect(await asked(page), 'a note opened is not saved before it is changed').toEqual([])
      await theTitleField(page).fill('')
      const [emptied] = await askedAt(page, 1)
      expect(emptied).toEqual({ door: 'change', title: 'Made-up kept words' })
      expect(await theTitleField(page).getAttribute('placeholder')).toBe('Made-up kept words')
    } finally { await page.close() }
  }, 60_000)

  it('files two notes given the same title, each with that title, and says each is saved', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    try {
      for (const [at, words] of [[1, 'Made-up first note'], [2, 'Made-up second note']] as const) {
        // THE SECOND OPENING, in the same tab, as a link to the note page opens it.
        if (at === 2) {
          await page.evaluate((segment) => { window.location.hash = `#/${segment}` }, THE_QUICK_NOTE_SEGMENT)
          await expect.poll(() => theWords(page).inputValue()).toBe('')
          expect(await theTitleField(page).inputValue(), 'a new note asks for its own title').toBe('')
        }
        await theWords(page).fill(words)
        await theTitleField(page).fill('Made-up shared title')
        const id = `MadeUpTitled0${String(at)}`
        await page.waitForFunction((own) => window.location.hash === `#/quick-note/${own}`, id, { timeout: 10_000 })
        await expect.poll(() => page.evaluate((own) => (window as unknown as TheStand).titled.titleOf(own), id)).toBe('Made-up shared title')
        await expect.poll(() => page.locator('.qn-foot').innerText()).toContain(sayInEnglish('quickNote.saved', { time: '' }).trim())
      }
      expect((await asked(page)).filter((one) => one.door === 'file'), 'two notes are filed').toHaveLength(2)
      const titles = await page.evaluate(() => ['MadeUpTitled01', 'MadeUpTitled02'].map((own) => (window as unknown as TheStand).titled.titleOf(own)))
      expect(titles).toEqual(['Made-up shared title', 'Made-up shared title'])
    } finally { await page.close() }
  }, 60_000)
})

describe('a card in My notes', () => {
  const parts: QuickNotePart[] = [{ id: 'w-1', type: 'words', x: 0, y: 0, width: 320, text: 'Made-up first line\nMade-up second line' }]

  it('shows the title the words give, and the lines after the first, when the note was given no title', () => {
    expect(theCardWordsOf('Made-up first line', parts)).toEqual({ title: 'Made-up first line', after: 'Made-up second line' })
  })

  it('shows a title the person gave, with every line of the words after it', () => {
    expect(theCardWordsOf('Made-up given title', parts)).toEqual({ title: 'Made-up given title', after: 'Made-up first line Made-up second line' })
  })

  it('says a note with no words has none, when it was given no title', () => {
    expect(theCardWordsOf(sayInEnglish('quickNote.untitled'), [])).toEqual({ title: null, after: '' })
  })
})
