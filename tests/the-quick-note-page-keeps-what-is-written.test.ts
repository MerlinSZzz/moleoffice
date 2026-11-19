// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE QUICK NOTE PAGE OPENS READY TO WRITE, AND KEEPS WHAT IS WRITTEN AND DRAWN WITH NO PRESS TO SAVE.
 *
 * The note page (src/web/pages/QuickNotePage.tsx), with the note it draws (src/web/components/QuickNote.tsx), is drawn
 * in Chromium on a page of its own, from a bundle, with the doors it calls answered by hand. The note is also drawn
 * alone, as a box beside another page draws it. No office is involved, and every note and page in this file is made up.
 * The page and its bundle are served over HTTP by this test process, on a port of its own.
 *
 * WHAT THIS FILE PROVES:
 *   - `#/quick-note` and `#/quick-note/<id>` are the note page's addresses, built from the segment the window app
 *     opens, and a quick note's own address is its note page;
 *   - the page opens with the cursor in the note's first words and the pen chosen, and files nothing until the
 *     person writes, so an opening left empty leaves no empty note;
 *   - words typed are filed as one new note, the address then names it, and the foot says Saved only once the
 *     office has answered;
 *   - each opening with no note named is one new note: two openings, each written in, file two notes, and the second
 *     opening files nothing until it is written in;
 *   - a stroke drawn with the pen, in the colour chosen, is kept in the next save, built on the version the first
 *     one stored;
 *   - the eraser takes the stroke away, and Undo puts it back;
 *   - a note opened by its address draws what the office keeps, and sends nothing;
 *   - words written in a wider window are drawn only as wide as this sheet allows, so the small window never scrolls
 *     sideways to show them, and the width they were written at is kept as it was;
 *   - a note that keeps the page it was written from names that page in its foot, with the way back to it;
 *   - a new note given the page it is written from names that page before it is saved, and its first save keeps it;
 *   - a picture a kept note holds is asked for in the note's own project, which need not be the project the page is
 *     in, so a note moved into another project still shows its pictures;
 *   - a save the office refuses with 409 stops the saving and says the note was changed somewhere else.
 *
 * THE MUTATIONS THAT TURN THIS RED, after a green control run:
 *   - in `partsToKeep` (src/web/components/QuickNote.tsx) keep every part, `return [...parts]`. The page then files
 *     the empty words it opens with as a new note, and the case about an opening left empty turns red;
 *   - in `drawnWidthOf` (src/web/components/QuickNoteSheet.tsx) draw words at the width they were written at,
 *     `return part.width`. The words then run past the small window's edge, the sheet scrolls sideways, and the case
 *     about words from a wider window turns red;
 *   - in `send` (src/web/components/QuickNote.tsx) file a new note with its parts alone, `data: { parts: toKeep }`. The
 *     first save then leaves out the page, and the case about a new note given its page turns red;
 *   - in `holdTheStored` (src/web/components/QuickNote.tsx) keep no page, `setWrittenFrom(null)`. The foot then names
 *     no page, and the case about a kept note's page turns red;
 *   - in `StoredFile` (src/web/components/QuickNoteSheet.tsx) name no project, `usePictureBytes(part.path, true,
 *     undefined, …)`. The picture is then asked for in the page's project, and the case about a note in another
 *     project turns red.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { FLAT_ROUTES, parseRoute } from '../src/shared/addresses.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'
import { quickNotePath, recordPath } from '../src/web/components/router.tsx'
import { WORKSPACE_HEADER } from '../src/shared/request-headers.ts'

/** One door the page asked, as the stand-in doors below write it down. */
interface Asked {
  door: 'file' | 'change' | 'read'
  id?: string
  input?: { title: string; data: { parts: Record<string, unknown>[]; from_page?: { address: string; name: string } } }
  change?: { title?: string; parts: Record<string, unknown>[]; ifVersion: string }
}

const A_MADE_UP_NOTE = {
  id: 'MadeUpKept01',
  kind: 'quick_note',
  title: 'Made-up kept words',
  data: {
    parts: [
      { id: 'w-kept', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up kept words' },
      { id: 's-kept', type: 'stroke', colour: 'blue', width: 2.5, points: [40, 120, 80, 140, 120, 130] },
    ],
  },
}

/** Words written in a window wider than the small one: as wide as words are ever started. */
const A_MADE_UP_WIDE_NOTE = {
  id: 'MadeUpWide01',
  kind: 'quick_note',
  title: 'Made-up wide words',
  data: {
    parts: [
      {
        id: 'w-wide',
        type: 'words',
        x: 24,
        y: 16,
        width: 560,
        text: 'Made-up wide words, written in a window wider than this one, and long enough to need more than one line here.',
      },
    ],
  },
}

/** A page of the office a note is written from, as the page names itself. */
const A_MADE_UP_PAGE = { address: '#/records', name: 'Made-up page' }

const A_MADE_UP_NOTE_FROM_A_PAGE = {
  id: 'MadeUpFrom01',
  kind: 'quick_note',
  title: 'Made-up words from a page',
  data: {
    parts: [{ id: 'w-from', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up words from a page' }],
    from_page: A_MADE_UP_PAGE,
  },
}

/** A made-up picture, one pixel, as the file door would answer it. */
const A_MADE_UP_PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** A kept note in a project the page is not in, as after a move, holding one picture the office keeps. */
const A_MADE_UP_NOTE_IN_ANOTHER_PROJECT = {
  id: 'MadeUpElse01',
  kind: 'quick_note',
  workspaceId: 'made-up-other-project',
  title: 'Made-up note in another project',
  data: {
    parts: [
      {
        id: 'p-else',
        type: 'picture',
        x: 24,
        y: 16,
        width: 120,
        height: 60,
        path: '/made-up/report-files/made-up-picture.png',
        name: 'made-up-picture.png',
        size: A_MADE_UP_PICTURE.length,
        hash: 'made-up',
      },
    ],
  },
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
        import { theApiIsOnPort } from './src/web/lib/api-address.ts';
        import { QuickNotePage } from './src/web/pages/QuickNotePage.tsx';
        import { QuickNote } from './src/web/components/QuickNote.tsx';
        // THE API IS ON THIS PAGE'S OWN ORIGIN, as for a page the server itself serves, so a picture the note asks for
        // by hand goes to this page, where the case that serves it answers.
        theApiIsOnPort(null);
        const asked = [];
        const stored = new Map();
        let version = 1;
        let files = 0;
        let refuse = false;
        let held = null;
        const answer = (value) => held === null ? Promise.resolve(value) : new Promise((go) => { held.push(() => go(value)) });
        api.fileAQuickNote = (input) => {
          asked.push({ door: 'file', input: structuredClone(input) });
          files += 1;
          const record = { id: 'MadeUpNote0' + files, kind: 'quick_note', title: input.title, data: input.data };
          stored.set(record.id, record);
          return answer({ record, incomplete: [], version: 'v' + version });
        };
        api.changeAQuickNote = (id, change) => {
          asked.push({ door: 'change', id, change: structuredClone(change) });
          if (refuse) return Promise.reject(new ApiError(409, 'Made-up refusal: the note holds another version now.'));
          version += 1;
          return answer({ version: 'v' + version, newSeq: version });
        };
        api.getRecord = (id) => {
          asked.push({ door: 'read', id });
          const record = stored.get(id);
          return record === undefined ? Promise.reject(new ApiError(404, 'No made-up record has that id.')) : Promise.resolve({ record, version: 'v' + version });
        };
        window.qn = {
          asked: () => asked,
          keep: (record) => { stored.set(record.id, record) },
          refuse: () => { refuse = true },
          hold: () => { held = [] },
          release: () => { const waiting = held ?? []; held = null; for (const go of waiting) go() },
          open: () => createRoot(document.getElementById('app')).render(h(QuickNotePage)),
          openPart: (props) => createRoot(document.getElementById('app')).render(h('div', { style: { height: '100vh' } }, h(QuickNote, props))),
        };`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    // A MODULE, because a page part finds its pictures beside its own code (`import.meta.url`), which a script
    // that is not a module does not have.
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  // THE PAGE AND ITS BUNDLE ARE SERVED OVER HTTP FROM THIS PROCESS. The bundle is over 31 MB, and handed to each page
  // through Playwright it took over 3 s a page; fetched by the page it takes well under one. Every other address
  // answers the empty page, as the route that served the page before did, and nothing is kept in the browser's cache.
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

type TheStand = {
  qn: {
    asked(): Asked[]
    keep(record: unknown): void
    refuse(): void
    hold(): void
    release(): void
    open(): void
    openPart(props: { writtenFrom?: { address: string; name: string } }): void
  }
}

/** A page of its own at an address, with the note page drawn on it, or with what `draw` draws. */
async function aNotePage(
  address: string,
  before?: (page: Page) => Promise<void>,
  draw: (page: Page) => Promise<void> = (page) => page.evaluate(() => (window as unknown as TheStand).qn.open()),
): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 420, height: 520 } })
  await page.goto(`${site}/${address}`)
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'qn' in window, undefined, { timeout: 10_000 })
  if (before !== undefined) await before(page)
  await draw(page)
  return page
}

const asked = (page: Page): Promise<Asked[]> => page.evaluate(() => (window as unknown as TheStand).qn.asked())

/** Wait until the page has asked a door this many times, and hand back what it asked. */
async function askedAt(page: Page, count: number): Promise<Asked[]> {
  await page.waitForFunction((n) => (window as unknown as TheStand).qn.asked().length >= n, count, { timeout: 10_000 })
  return asked(page)
}

/** A stroke drawn with the mouse, from one point of the sheet to another and back down. */
async function drawAStroke(page: Page): Promise<void> {
  const sheet = await page.locator('.qn-paper').boundingBox()
  if (sheet === null) throw new Error('The sheet is not drawn.')
  await page.mouse.move(sheet.x + 60, sheet.y + 200)
  await page.mouse.down()
  await page.mouse.move(sheet.x + 140, sheet.y + 240, { steps: 12 })
  await page.mouse.move(sheet.x + 220, sheet.y + 200, { steps: 12 })
  await page.mouse.up()
}

describe('the note page has its own address, the one the window app opens', () => {
  it('reads #/quick-note as a new note and #/quick-note/<id> as one note, and nothing longer', () => {
    expect(FLAT_ROUTES[THE_QUICK_NOTE_SEGMENT]).toBe('quickNote')
    expect(parseRoute(`#/${THE_QUICK_NOTE_SEGMENT}`)).toEqual({ name: 'quickNote' })
    expect(parseRoute(`#/${THE_QUICK_NOTE_SEGMENT}/MadeUpNote01`)).toEqual({ name: 'quickNote', id: 'MadeUpNote01' })
    expect(parseRoute(`#/${THE_QUICK_NOTE_SEGMENT}/MadeUpNote01/more`).name).toBe('unknown')
  })

  it('builds the note page as a quick note\'s own address', () => {
    expect(quickNotePath()).toBe(`/${THE_QUICK_NOTE_SEGMENT}`)
    expect(parseRoute(`#${quickNotePath('MadeUpNote01')}`)).toEqual({ name: 'quickNote', id: 'MadeUpNote01' })
    expect(recordPath('MadeUpNote01', 'quick_note')).toBe(quickNotePath('MadeUpNote01'))
  })
})

describe('the note page opens ready to write and keeps what is written', () => {
  it('opens with the cursor in the first words and the pen chosen, and files nothing until the person writes', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    expect(await page.evaluate(() => document.activeElement?.classList.contains('qn-field'))).toBe(true)
    expect(await page.getAttribute('.qn-field', 'placeholder')).toBe(t('quickNote.placeholder'))
    expect(await page.getAttribute(`.qn-tools button[title="${t('quickNote.pen')}"]`, 'aria-pressed')).toBe('true')
    // Longer than a save waits, so a save the opening started would have been asked by now.
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'an opening left empty files a note').toEqual([])
    expect(new URL(page.url()).hash).toBe(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.close()
  }, 60_000)

  it('files words as one new note, names it in the address, and says Saved only once the office answered', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`, (one) => one.evaluate(() => (window as unknown as TheStand).qn.hold()))
    await page.waitForSelector('.qn-field')
    await page.keyboard.type('Made-up words')
    const [filed] = await askedAt(page, 1)
    expect(filed?.door).toBe('file')
    expect(filed?.input?.title).toBe('Made-up words')
    expect(filed?.input?.data.parts).toEqual([expect.objectContaining({ type: 'words', text: 'Made-up words' })])
    // THE ANSWER IS HELD, and the foot says the note is being saved, not that it is saved.
    await expect.poll(() => page.locator('.qn-foot').innerText()).toContain(t('quickNote.saving'))
    await page.evaluate(() => (window as unknown as TheStand).qn.release())
    await page.waitForFunction(() => window.location.hash === '#/quick-note/MadeUpNote01', undefined, { timeout: 10_000 })
    await expect.poll(() => page.locator('.qn-foot').innerText()).toContain(t('quickNote.saved', { time: '' }).trim())
    expect(await page.locator('.qn-where').innerText()).toContain(t('quickNote.myNotes'))
    expect((await asked(page)).filter((one) => one.door === 'file'), 'one note is filed').toHaveLength(1)
    await page.close()
  }, 60_000)

  it('files one new note for each opening with no note named, once each is written in', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    await page.keyboard.type('Made-up first')
    await askedAt(page, 1)
    await page.waitForFunction(() => window.location.hash === '#/quick-note/MadeUpNote01', undefined, { timeout: 10_000 })
    // THE SECOND OPENING, in the same tab, as a link to the note page opens it.
    await page.evaluate((segment) => {
      window.location.hash = `#/${segment}`
    }, THE_QUICK_NOTE_SEGMENT)
    await page.waitForFunction(() => {
      const field = document.activeElement
      return field instanceof HTMLTextAreaElement && field.classList.contains('qn-field') && field.value === ''
    }, undefined, { timeout: 10_000 })
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'the second opening, left empty, files nothing').toHaveLength(1)
    await page.keyboard.type('Made-up second')
    const [first, second] = await askedAt(page, 2)
    expect([first?.door, second?.door]).toEqual(['file', 'file'])
    expect([first?.input?.title, second?.input?.title]).toEqual(['Made-up first', 'Made-up second'])
    await page.waitForFunction(() => window.location.hash === '#/quick-note/MadeUpNote02', undefined, { timeout: 10_000 })
    await page.close()
  }, 60_000)

  it('keeps a stroke in the chosen colour on the version the first save stored, and erases it and takes the erasing back', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    await page.keyboard.type('Made-up words')
    await askedAt(page, 1)
    await page.click(`.qn-colour[aria-label="${t('quickNote.colour.red')}"]`)
    await drawAStroke(page)
    const [, drawn] = await askedAt(page, 2)
    expect(drawn?.door).toBe('change')
    expect(drawn?.id).toBe('MadeUpNote01')
    expect(drawn?.change?.ifVersion).toBe('v1')
    expect(drawn?.change?.parts.map((part) => part['type'])).toEqual(['words', 'stroke'])
    expect(drawn?.change?.parts[1]).toEqual(expect.objectContaining({ colour: 'red' }))
    expect(await page.locator('.qn-stroke').count()).toBe(1)
    // THE ERASER, drawn across the same stroke.
    await page.click(`.qn-tools button[title="${t('quickNote.eraser')}"]`)
    await drawAStroke(page)
    const [, , erased] = await askedAt(page, 3)
    expect(erased?.change?.parts.map((part) => part['type'])).toEqual(['words'])
    expect(erased?.change?.ifVersion).toBe('v2')
    expect(await page.locator('.qn-stroke').count()).toBe(0)
    // UNDO puts the stroke back, and that is kept too.
    await page.click(`.qn-tools button[aria-label="${t('quickNote.undo')}"]`)
    const [, , , undone] = await askedAt(page, 4)
    expect(undone?.change?.parts.map((part) => part['type'])).toEqual(['words', 'stroke'])
    expect(await page.locator('.qn-stroke').count()).toBe(1)
    await page.close()
  }, 60_000)

  it('draws a note opened by its address as the office keeps it, and sends nothing back', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE.id}`, (one) =>
      one.evaluate((record) => (window as unknown as TheStand).qn.keep(record), A_MADE_UP_NOTE),
    )
    await page.waitForSelector('.qn-written')
    expect(await page.locator('.qn-written').first().innerText()).toBe('Made-up kept words')
    expect(await page.locator('.qn-stroke').count()).toBe(1)
    await page.waitForTimeout(1_500)
    expect(await asked(page)).toEqual([{ door: 'read', id: A_MADE_UP_NOTE.id }])
    await page.close()
  }, 60_000)

  it('draws words written in a wider window as wide as this sheet allows, and keeps the width they were written at', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_WIDE_NOTE.id}`, (one) =>
      one.evaluate((record) => (window as unknown as TheStand).qn.keep(record), A_MADE_UP_WIDE_NOTE),
    )
    await page.waitForSelector('.qn-written')
    const sideways = () =>
      page.evaluate(() => {
        const sheet = document.querySelector('.qn-sheet')
        return sheet === null ? null : sheet.scrollWidth - sheet.clientWidth
      })
    await expect.poll(sideways, { message: 'the sheet scrolls sideways to show the words' }).toBe(0)
    // NOTHING IS SENT, so the width the words were written at stays as the office keeps it.
    await page.waitForTimeout(1_500)
    expect(await asked(page)).toEqual([{ door: 'read', id: A_MADE_UP_WIDE_NOTE.id }])
    await page.close()
  }, 60_000)

  it('names the page a kept note was written from in its foot, with the way back to it', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_FROM_A_PAGE.id}`, (one) =>
      one.evaluate((record) => (window as unknown as TheStand).qn.keep(record), A_MADE_UP_NOTE_FROM_A_PAGE),
    )
    await page.waitForSelector('.qn-written')
    expect(await page.locator('.qn-where').innerText()).toContain(t('quickNote.writtenFrom', { page: A_MADE_UP_PAGE.name }))
    expect(await page.locator('.qn-where a').getAttribute('href')).toBe(A_MADE_UP_PAGE.address)
    await page.close()
  }, 60_000)

  it('names the page a new note is written from before it is saved, and keeps that page in its first save', async () => {
    // THE NOTE ALONE, as a box beside another page draws it, told the page it is written from.
    const page = await aNotePage(A_MADE_UP_PAGE.address, undefined, (one) =>
      one.evaluate((from) => (window as unknown as TheStand).qn.openPart({ writtenFrom: from }), A_MADE_UP_PAGE),
    )
    await page.waitForSelector('.qn-field')
    expect(await page.locator('.qn-where').innerText()).toContain(t('quickNote.writtenFrom', { page: A_MADE_UP_PAGE.name }))
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'a note given its page files nothing until it is written in').toEqual([])
    await page.keyboard.type('Made-up words from a page')
    const [filed] = await askedAt(page, 1)
    expect(filed?.door).toBe('file')
    expect(filed?.input?.data.from_page).toEqual(A_MADE_UP_PAGE)
    expect(await page.locator('.qn-where').innerText()).toContain(t('quickNote.writtenFrom', { page: A_MADE_UP_PAGE.name }))
    await page.close()
  }, 60_000)

  it('asks for a kept picture in the note\'s own project, not in the project the page is in', async () => {
    const projects: (string | null)[] = []
    const records: (string | null)[] = []
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_IN_ANOTHER_PROJECT.id}`, async (one) => {
      await one.route((url) => url.pathname === '/api/file', (route) => {
        projects.push(route.request().headers()[WORKSPACE_HEADER] ?? null)
        records.push(new URL(route.request().url()).searchParams.get('record'))
        return route.fulfill({ contentType: 'image/png', body: A_MADE_UP_PICTURE })
      })
      await one.evaluate((record) => (window as unknown as TheStand).qn.keep(record), A_MADE_UP_NOTE_IN_ANOTHER_PROJECT)
    })
    await page.locator('.qn-file img').waitFor({ timeout: 10_000 })
    expect(projects).toEqual([A_MADE_UP_NOTE_IN_ANOTHER_PROJECT.workspaceId])
    // THE NOTE'S OWN RECORD, named to the door, so it does not search the project for the picture.
    expect(records).toEqual([A_MADE_UP_NOTE_IN_ANOTHER_PROJECT.id])
    await page.close()
  }, 60_000)

  it('stops saving a note changed somewhere else, and says so', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE.id}`, async (one) => {
      await one.evaluate((record) => (window as unknown as TheStand).qn.keep(record), A_MADE_UP_NOTE)
      await one.evaluate(() => (window as unknown as TheStand).qn.refuse())
    })
    await page.waitForSelector('.qn-written')
    await drawAStroke(page)
    await askedAt(page, 2)
    await page.getByRole('alert').filter({ hasText: t('quickNote.changedElsewhere') }).waitFor({ timeout: 10_000 })
    // A LATER CHANGE IS NOT SENT, so the note kept somewhere else is not written over.
    await drawAStroke(page)
    await page.waitForTimeout(1_500)
    expect((await asked(page)).filter((one) => one.door === 'change')).toHaveLength(1)
    await page.close()
  }, 60_000)
})
