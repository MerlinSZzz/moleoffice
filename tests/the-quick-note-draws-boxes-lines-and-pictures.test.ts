// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IN A QUICK NOTE THE PERSON DRAWS BOXES AND WRITES IN THEM, JOINS THEM WITH LINES THAT STAY JOINED WHEN A BOX MOVES,
 * AND PASTES OR DROPS IN PICTURES AND FILMS, WHICH ARE KEPT.
 *
 * The note page (src/web/pages/QuickNotePage.tsx), with the note it draws (src/web/components/QuickNote.tsx) and its
 * sheet (src/web/components/QuickNoteSheet.tsx), is drawn in Chromium on a page of its own, from a bundle, with the
 * office's own style sheets and the doors it calls answered by hand. No office is involved, and every note, picture and
 * film in this file is made up: the pictures are drawn on a canvas in the page, and the film is recorded from one. The
 * page and its bundle are served over HTTP by this test process, on a port of its own.
 *
 * WHAT THIS FILE PROVES:
 *   - with Box chosen, a drag draws a box over the drag and a press makes a box where it lands; the new box opens to
 *     be written in, and its words are kept;
 *   - with Line chosen, a drag from one box to another joins them with a line that names the two boxes; with Box
 *     chosen, a drag moves a box, its line follows it while it moves, and the line is still joined once it is kept;
 *   - a line let go off a box, let go on the box it began on, or begun off a box draws nothing and sends nothing;
 *   - Escape during a drag that draws a box, draws a line or moves a box cancels it: nothing is drawn, the box is
 *     back where it was, and nothing is sent;
 *   - a pasted picture is stored, placed at the top left of the part of the sheet in view, drawn at its own size or
 *     smaller, never wider than the sheet in view and in its own shape, and kept; two are placed one below the other;
 *   - a dropped picture is placed where it is dropped, and the note says it is being added until it is stored;
 *   - Add a picture opens a chooser for pictures and films, and the picture chosen is kept;
 *   - a pasted film is kept as a film at its own size, under a film ending, and drawn as a film once it is kept; the
 *     film and the link that saves it whole are drawn inside the film's frame, and the link by the report's own style
 *     sheet;
 *   - a file that is not a picture or a film, a film in a format the office does not keep, a picture the browser
 *     cannot open and a file too big to keep are each refused with the reason, and nothing is stored;
 *   - the eraser takes a box away with its line, and Undo puts both back;
 *   - in a narrow note every tool drawn as a picture alone keeps its word as its name and its tip, and the tools do
 *     not run past the note's edge;
 *   - a box's words are drawn in the note's own type, the type of its words.
 *
 * THE MUTATIONS THAT TURN THIS RED, after a green control run:
 *   - in `escape` (src/web/components/QuickNoteSheet.tsx) cancel nothing, `return` at its start. The box being drawn
 *     then stays drawn after Escape, and the case about Escape turns red;
 *   - in `fitted` (src/web/components/quick-note-files.ts) draw a file at its own size, `return { width, height }`. The
 *     wide picture is then drawn wider than the sheet in view, and the case about a pasted picture turns red;
 *   - in `withTheBoxAt` (src/web/components/QuickNoteSheet.tsx) leave the box where it was, `return [...parts]`. The
 *     box then does not move, and the case about a line that follows a box turns red;
 *   - in the note's CSS (src/web/components/QuickNote.tsx) take `font-family: var(--font-read);` out of `.qn-box`. A
 *     box's words are then drawn in the type of the presses, and the case about a box's type turns red;
 *   - in `toolPress` (src/web/components/QuickNote.tsx) give a press no tip, by taking out `title={word}`. The case
 *     about a narrow note's tools turns red;
 *   - in the note's CSS (src/web/components/QuickNote.tsx) take `flex-direction: column;` out of the rule for a film's
 *     frame. The film and the link that saves it whole are then drawn side by side, past the frame, and the case about
 *     a pasted film turns red;
 *   - in `StoredFile` (src/web/components/QuickNoteSheet.tsx) take out `<SummaryStyle />`. No rule of the report's
 *     style sheet then draws the link that saves a film whole, and the case about a pasted film turns red.
 */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { sizeSaid } from '../src/shared/fileblocks.ts'
import { MAX_PREVIEW_BYTES } from '../src/shared/preview-limit.ts'
import { MEDIA_FORMATS } from '../src/shared/reportmedia.ts'
import { THE_QUICK_NOTE_SEGMENT } from '../src/config/the-quick-note-address.mjs'

/** A part of a note, as a save sends it. */
type Part = Record<string, unknown> & { id: string; type: string }

/** One door the page asked, as the stand-in doors below write it down. */
interface Asked {
  door: 'file' | 'change' | 'read' | 'store'
  id?: string
  name?: string
  input?: { title: string; data: { parts: Part[] } }
  change?: { title?: string; parts: Part[]; ifVersion: string }
}

/** A file the page makes for a case: a picture drawn on a canvas, a film recorded from one, or bytes of a given type. */
type Made =
  | { kind: 'picture'; name: string; width: number; height: number }
  | { kind: 'film'; name: string }
  | { kind: 'bytes'; name: string; type: string; text?: string; size?: number }

const B_ONE: Part = { id: 'b-one', type: 'box', x: 40, y: 140, width: 120, height: 60, text: 'Made-up one' }
const B_TWO: Part = { id: 'b-two', type: 'box', x: 240, y: 140, width: 120, height: 60, text: 'Made-up two' }
const L_ONE: Part = { id: 'l-one', type: 'line', from: 'b-one', to: 'b-two' }

const A_MADE_UP_NOTE_OF_TWO_BOXES = {
  id: 'MadeUpBoxes1',
  kind: 'quick_note',
  title: 'Made-up two boxes',
  data: { parts: [{ id: 'w-boxes', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up two boxes' }, B_ONE, B_TWO] },
}

const A_MADE_UP_NOTE_OF_TWO_JOINED_BOXES = {
  id: 'MadeUpJoined',
  kind: 'quick_note',
  title: 'Made-up joined boxes',
  data: { parts: [B_ONE, B_TWO, L_ONE] },
}

/** A note taller than the window, so its sheet scrolls. */
const A_MADE_UP_TALL_NOTE = {
  id: 'MadeUpTall01',
  kind: 'quick_note',
  title: 'Made-up tall note',
  data: {
    parts: [
      { id: 'w-top', type: 'words', x: 24, y: 16, width: 320, text: 'Made-up tall note' },
      { id: 'w-low', type: 'words', x: 24, y: 1400, width: 320, text: 'Made-up words far down' },
    ],
  },
}

let browser: Browser
let script = ''
let styles = ''
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
        // THE API IS ON THIS PAGE'S OWN ORIGIN, as for a page the server itself serves, so a picture the note asks for
        // goes to this page, where the case that serves it answers.
        theApiIsOnPort(null);
        const asked = [];
        const stored = new Map();
        const bytes = new Map();
        let version = 1;
        let files = 0;
        let stores = 0;
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
          version += 1;
          return answer({ version: 'v' + version, newSeq: version });
        };
        api.getRecord = (id) => {
          asked.push({ door: 'read', id });
          const record = stored.get(id);
          return record === undefined ? Promise.reject(new ApiError(404, 'No made-up record has that id.')) : Promise.resolve({ record, version: 'v' + version });
        };
        // THE FILE DOOR, standing in for POST /api/report-files: it keeps the bytes by the path it hands back, and the
        // case that serves /api/file reads them from here. The path keeps the name's ending, as the office's does.
        api.storeANoteFile = (base64, name) => {
          asked.push({ door: 'store', name });
          stores += 1;
          const path = '/made-up/report-files/' + stores + '-' + name;
          bytes.set(path, base64);
          return answer({ path, name, size: atob(base64).length, hash: 'made-up' });
        };
        // A FILE FOR A CASE, made in the page, where a File can be made.
        const aFile = async (one) => {
          if (one.kind === 'picture') {
            const canvas = Object.assign(document.createElement('canvas'), { width: one.width, height: one.height });
            const pen = canvas.getContext('2d');
            pen.fillStyle = '#d9822b';
            pen.fillRect(0, 0, one.width, one.height);
            pen.fillStyle = '#1f5fbf';
            pen.fillRect(0, 0, one.width / 2, one.height / 2);
            const blob = await new Promise((go) => canvas.toBlob(go, 'image/png'));
            return new File([blob], one.name, { type: 'image/png' });
          }
          if (one.kind === 'film') {
            const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
            const pen = canvas.getContext('2d');
            const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm' });
            const pieces = [];
            recorder.ondataavailable = (event) => pieces.push(event.data);
            const done = new Promise((go) => { recorder.onstop = go });
            recorder.start();
            for (let i = 0; i < 6; i++) {
              pen.fillStyle = i % 2 ? '#1f5fbf' : '#ffffff';
              pen.fillRect(0, 0, 320, 180);
              await new Promise((go) => setTimeout(go, 60));
            }
            recorder.stop();
            await done;
            return new File(pieces, one.name, { type: 'video/webm' });
          }
          return new File([one.text ?? new Uint8Array(one.size ?? 1)], one.name, { type: one.type });
        };
        const carrying = async (made) => {
          const data = new DataTransfer();
          for (const file of await Promise.all(made.map(aFile))) data.items.add(file);
          return data;
        };
        window.qn = {
          asked: () => asked,
          keep: (record) => { stored.set(record.id, record) },
          hold: () => { held = [] },
          release: () => { const waiting = held ?? []; held = null; for (const go of waiting) go() },
          open: () => createRoot(document.getElementById('app')).render(h(QuickNotePage)),
          bytesOf: (path) => bytes.get(path) ?? null,
          aPictureInBase64: (width, height) => {
            const canvas = Object.assign(document.createElement('canvas'), { width, height });
            const pen = canvas.getContext('2d');
            pen.fillStyle = '#1f5fbf';
            pen.fillRect(0, 0, width, height);
            return canvas.toDataURL('image/png').split(',')[1];
          },
          // A PASTE, sent where the browser sends one: to the element the focus is in. It says whether that is inside
          // the note.
          paste: async (made) => {
            const data = await carrying(made);
            const target = document.activeElement ?? document.body;
            const inTheNote = target.closest('.qn-note') !== null;
            target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
            return inTheNote;
          },
          // A DROP at a point of the screen, after the drag over it that asks whether it may be dropped there. It says
          // whether the page said yes.
          drop: async (made, x, y) => {
            const data = await carrying(made);
            const target = document.elementFromPoint(x, y);
            if (target === null) throw new Error('Nothing is drawn at the point of the drop.');
            const over = new DragEvent('dragover', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true });
            target.dispatchEvent(over);
            target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
            return over.defaultPrevented;
          },
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
  // THE OFFICE'S OWN STYLE SHEETS, so the note is drawn in the office's types and sizes, as in the app.
  styles = readFileSync('src/web/tokens.css', 'utf8') + readFileSync('src/web/styles.css', 'utf8').replace(/@import[^;]+;/g, '')
  // THE PAGE AND ITS BUNDLE ARE SERVED OVER HTTP FROM THIS PROCESS. The bundle is about 31 MB, and handed to each page
  // through Playwright it took 3.7 s a page; fetched by the page it takes 0.4 s. Every other address answers the empty
  // page, as the route that served the page before did, and nothing is kept in the browser's cache.
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
    hold(): void
    release(): void
    open(): void
    bytesOf(path: string): string | null
    aPictureInBase64(width: number, height: number): string
    paste(made: Made[]): Promise<boolean>
    drop(made: Made[], x: number, y: number): Promise<boolean>
  }
}

/** A page of its own at an address, with the note page drawn on it. */
async function aNotePage(
  address: string,
  before?: (page: Page) => Promise<void>,
  viewport: { width: number; height: number } = { width: 420, height: 520 },
): Promise<Page> {
  const page = await browser.newPage({ viewport })
  await page.goto(`${site}/${address}`)
  await page.addStyleTag({ content: styles })
  await page.addScriptTag({ url: `${site}/page.js`, type: 'module' })
  await page.waitForFunction(() => 'qn' in window, undefined, { timeout: 10_000 })
  if (before !== undefined) await before(page)
  await page.evaluate(() => (window as unknown as TheStand).qn.open())
  return page
}

/** Before the note is drawn: the office keeps this note. */
const keeping = (record: { id: string }) => (page: Page) => page.evaluate((one) => (window as unknown as TheStand).qn.keep(one), record)

/**
 * Before the note is drawn: the file door serves what the stand-in door stored, by the path asked for, as a picture or
 * a film by the path's ending.
 */
async function servingFiles(page: Page, records?: (string | null)[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/file',
    async (route) => {
      const address = new URL(route.request().url())
      records?.push(address.searchParams.get('record'))
      const path = address.searchParams.get('path') ?? ''
      const said = await page.evaluate((one) => (window as unknown as TheStand).qn.bytesOf(one), path)
      if (said === null) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'No made-up file is stored there.' })
      return route.fulfill({ contentType: path.endsWith('.webm') ? 'video/webm' : 'image/png', body: Buffer.from(said, 'base64') })
    },
  )
}

const asked = (page: Page): Promise<Asked[]> => page.evaluate(() => (window as unknown as TheStand).qn.asked())

/** The parts the last save sent, or null before any save. */
async function keptParts(page: Page): Promise<Part[] | null> {
  const saves = (await asked(page)).filter((one) => one.door === 'file' || one.door === 'change')
  const last = saves[saves.length - 1]
  return last === undefined ? null : (last.input?.data.parts ?? last.change?.parts ?? null)
}

const ofType = (type: string) => (parts: Part[] | null): Part[] => (parts ?? []).filter((part) => part.type === type)

/** Where the sheet is on the screen. */
async function theSheet(page: Page): Promise<{ x: number; y: number }> {
  const sheet = await page.locator('.qn-paper').boundingBox()
  if (sheet === null) throw new Error('The sheet is not drawn.')
  return sheet
}

/** Choose a tool by its word. */
const choose = (page: Page, word: string) => page.locator(`.qn-tools button[title="${word}"]`).click({ timeout: 5_000 })

/** A drag with the mouse from one point of the sheet to another, and `beforeUp` while the button is still down. */
async function drag(page: Page, from: [number, number], to: [number, number], beforeUp?: () => Promise<void>): Promise<void> {
  const sheet = await theSheet(page)
  await page.mouse.move(sheet.x + from[0], sheet.y + from[1])
  await page.mouse.down()
  await page.mouse.move(sheet.x + to[0], sheet.y + to[1], { steps: 10 })
  if (beforeUp !== undefined) await beforeUp()
  await page.mouse.up()
}

/** A part is placed at this rectangle, to the pixel the screen rounds to. */
function expectPlaced(part: Part | undefined, place: { x?: number; y?: number; width?: number; height?: number }): void {
  expect(part, 'the part is kept').toBeDefined()
  for (const [key, value] of Object.entries(place)) {
    expect(Math.abs(Number(part?.[key]) - value), `the part's ${key} is ${String(part?.[key])}, not ${String(value)}`).toBeLessThanOrEqual(1)
  }
}

describe('a person draws boxes, writes in them and joins them with lines', () => {
  it('draws a box over a drag and where a press lands, opens it to be written in, and keeps its words', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    await choose(page, t('quickNote.box'))
    await drag(page, [40, 120], [240, 200])
    await page.locator('.qn-box .qn-field').waitFor({ timeout: 5_000 })
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(t('quickNote.boxWords'))
    await page.keyboard.type('Made-up box words')
    await expect.poll(() => keptParts(page).then(ofType('box')).then((boxes) => boxes[0]?.['text'])).toBe('Made-up box words')
    expectPlaced(ofType('box')(await keptParts(page))[0], { x: 40, y: 120, width: 200, height: 80 })
    // A PRESS WITH BOX CHOSEN makes a box where it lands, ready to be written in. The press is inside the sheet in
    // view: below the tools, which take two rows in a note this narrow, and above the foot.
    const sheet = await theSheet(page)
    await page.mouse.click(sheet.x + 300, sheet.y + 250)
    await expect.poll(() => keptParts(page).then(ofType('box'))).toHaveLength(2)
    const pressed = ofType('box')(await keptParts(page))[1]!
    const [x, y, width, height] = [pressed['x'], pressed['y'], pressed['width'], pressed['height']].map(Number) as [number, number, number, number]
    expect(width > 0 && height > 0, 'the box has a size').toBe(true)
    expect(x <= 300 && 300 <= x + width && y <= 250 && 250 <= y + height, 'the box holds the point pressed').toBe(true)
    await page.locator(`.qn-box[data-part="${pressed.id}"] .qn-field`).waitFor({ timeout: 5_000 })
    await page.close()
  }, 60_000)

  it('joins two boxes with a line drawn from one to the other, and the line follows a box that moves and stays joined', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_OF_TWO_BOXES.id}`, keeping(A_MADE_UP_NOTE_OF_TWO_BOXES))
    await page.waitForSelector('.qn-box')
    await choose(page, t('quickNote.line'))
    await drag(page, [100, 170], [300, 170])
    await expect.poll(() => keptParts(page)).toEqual([
      ...A_MADE_UP_NOTE_OF_TWO_BOXES.data.parts,
      { id: expect.any(String), type: 'line', from: 'b-one', to: 'b-two' },
    ])
    const line = page.locator('.qn-line:not([data-shaping])')
    await line.waitFor({ timeout: 5_000 })
    const lineBefore = await line.boundingBox()
    const two = page.locator('.qn-box[data-part="b-two"]')
    const boxBefore = await two.boundingBox()
    // WITH BOX CHOSEN, a drag on a box moves it, and its line is drawn to it as it goes.
    await choose(page, t('quickNote.box'))
    let during: { box: { y: number } | null; line: { height: number } | null } = { box: null, line: null }
    await drag(page, [300, 170], [300, 330], async () => {
      during = { box: await two.boundingBox(), line: await line.boundingBox() }
    })
    expect((during.box?.y ?? 0) - (boxBefore?.y ?? 0), 'the box is drawn where it is dragged').toBeGreaterThan(140)
    expect(during.line?.height ?? 0, 'the line follows the box as it moves').toBeGreaterThan((lineBefore?.height ?? 0) + 60)
    await expect.poll(() => keptParts(page).then((parts) => (parts ?? []).find((part) => part.id === 'b-two')?.['y'])).not.toBe(B_TWO['y'])
    const kept = (await keptParts(page)) ?? []
    expectPlaced(kept.find((part) => part.id === 'b-two'), { x: Number(B_TWO['x']), y: Number(B_TWO['y']) + 160, width: 120, height: 60 })
    expect(kept.find((part) => part.type === 'line'), 'the line still joins the two boxes').toEqual(expect.objectContaining({ from: 'b-one', to: 'b-two' }))
    expect((await line.boundingBox())?.height ?? 0, 'the line is drawn to where the box is kept').toBeGreaterThan((lineBefore?.height ?? 0) + 60)
    await page.close()
  }, 60_000)

  it('draws no line let go off a box, let go on the box it began on, or begun off a box', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_OF_TWO_BOXES.id}`, keeping(A_MADE_UP_NOTE_OF_TWO_BOXES))
    await page.waitForSelector('.qn-box')
    await choose(page, t('quickNote.line'))
    await drag(page, [100, 170], [200, 330])
    await drag(page, [100, 170], [130, 185])
    await drag(page, [200, 330], [300, 170])
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'nothing is sent').toEqual([{ door: 'read', id: A_MADE_UP_NOTE_OF_TWO_BOXES.id }])
    expect(await page.locator('.qn-line').count(), 'no line is drawn').toBe(0)
    await page.close()
  }, 60_000)

  it('cancels with Escape a box being drawn, a line being drawn and a box being moved, and sends nothing', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_OF_TWO_BOXES.id}`, keeping(A_MADE_UP_NOTE_OF_TWO_BOXES))
    await page.waitForSelector('.qn-box')
    const shaping = () => page.locator('[data-shaping]').count()
    await choose(page, t('quickNote.box'))
    await drag(page, [60, 260], [200, 340], async () => {
      expect(await shaping(), 'the box is drawn as the drag goes').toBe(1)
      await page.keyboard.press('Escape')
      expect(await shaping(), 'Escape takes the box being drawn away').toBe(0)
    })
    await choose(page, t('quickNote.line'))
    await drag(page, [100, 170], [300, 170], async () => {
      expect(await shaping(), 'the line is drawn as the drag goes').toBe(1)
      await page.keyboard.press('Escape')
      expect(await shaping(), 'Escape takes the line being drawn away').toBe(0)
    })
    await choose(page, t('quickNote.box'))
    const two = page.locator('.qn-box[data-part="b-two"]')
    const at = (await two.boundingBox())?.y ?? 0
    await drag(page, [300, 170], [300, 290], async () => {
      expect((await two.boundingBox())?.y ?? 0, 'the box moves as the drag goes').toBeGreaterThan(at + 100)
      await page.keyboard.press('Escape')
      expect((await two.boundingBox())?.y ?? 0, 'Escape puts the box back').toBe(at)
    })
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'nothing is sent').toEqual([{ door: 'read', id: A_MADE_UP_NOTE_OF_TWO_BOXES.id }])
    expect(await page.locator('.qn-box').count()).toBe(2)
    expect(await page.locator('.qn-line').count()).toBe(0)
    await page.close()
  }, 60_000)

  it('takes a box away with the eraser, with its line, and puts both back with Undo', async () => {
    const page = await aNotePage(
      `#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_OF_TWO_JOINED_BOXES.id}`,
      keeping(A_MADE_UP_NOTE_OF_TWO_JOINED_BOXES),
    )
    await page.waitForSelector('.qn-line')
    await choose(page, t('quickNote.eraser'))
    const sheet = await theSheet(page)
    await page.mouse.click(sheet.x + 100, sheet.y + 170)
    await expect.poll(() => keptParts(page)).toEqual([B_TWO])
    expect(await page.locator('.qn-line').count()).toBe(0)
    await page.click(`.qn-tools button[aria-label="${t('quickNote.undo')}"]`)
    await expect.poll(() => keptParts(page)).toEqual([B_ONE, B_TWO, L_ONE])
    expect(await page.locator('.qn-line').count()).toBe(1)
    await page.close()
  }, 60_000)

  it('draws a box\'s words in the note\'s own type, the type of its words', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_NOTE_OF_TWO_BOXES.id}`, keeping(A_MADE_UP_NOTE_OF_TWO_BOXES))
    await page.waitForSelector('.qn-box .qn-written')
    const typeOf = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((node) => {
          const drawn = getComputedStyle(node)
          return { family: drawn.fontFamily, size: drawn.fontSize, lineHeight: drawn.lineHeight }
        })
    const words = await typeOf('.qn-words .qn-written')
    expect(await typeOf('.qn-box .qn-written')).toEqual(words)
    // AND NOT THE TYPE OF THE PRESSES, so the comparison above is between two types that could differ.
    expect((await typeOf('.qn-tools .qn-tool')).family).not.toBe(words.family)
    await page.close()
  }, 60_000)

  for (const width of [420, 390]) {
    it(`keeps each tool's word as its name and its tip at ${String(width)} pixels, and the tools stay inside the note`, async () => {
      const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`, undefined, { width, height: 700 })
      await page.waitForSelector('.qn-field')
      const tools = page.locator('.qn-tools')
      for (const word of [t('quickNote.pen'), t('quickNote.eraser'), t('quickNote.box'), t('quickNote.line')]) {
        const press = tools.getByRole('button', { name: word, exact: true })
        expect(await press.count(), `one press is named ${word}`).toBe(1)
        expect(await press.getAttribute('title'), `the tip of ${word}`).toBe(word)
        const shown = await press.locator('.qn-tool-word').boundingBox()
        expect(shown?.width ?? 0, `${word} is drawn as a picture alone`).toBeLessThanOrEqual(1)
      }
      await tools.getByRole('button', { name: t('quickNote.addAPicture'), exact: true }).waitFor({ state: 'visible', timeout: 5_000 })
      const sideways = await page.evaluate(() => {
        const row = document.querySelector('.qn-tools')
        return row === null ? null : [row.scrollWidth - row.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth]
      })
      expect(sideways, 'the tools run past the note\'s edge').toEqual([0, 0])
      await page.close()
    }, 60_000)
  }
})

describe('a person pastes or drops in a picture or a film, and it is kept', () => {
  it('stores a pasted picture, places it at the top left of the sheet in view, draws it no wider than the view in its own shape, and keeps it', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}/${A_MADE_UP_TALL_NOTE.id}`, async (one) => {
      await servingFiles(one)
      await keeping(A_MADE_UP_TALL_NOTE)(one)
    })
    await page.waitForSelector('.qn-written')
    const view = await page.evaluate(() => {
      const sheet = document.querySelector('.qn-sheet')
      if (sheet === null) return null
      sheet.scrollTop = 600
      return { left: sheet.scrollLeft, top: sheet.scrollTop, width: sheet.clientWidth, height: sheet.clientHeight }
    })
    if (view === null) throw new Error('The sheet is not drawn.')
    expect(view.top, 'the sheet scrolls').toBeGreaterThan(0)
    const inTheNote = await page.evaluate(() =>
      (window as unknown as TheStand).qn.paste([
        { kind: 'picture', name: 'made-up-wide.png', width: 1600, height: 800 },
        { kind: 'picture', name: 'made-up-small.png', width: 120, height: 90 },
      ]),
    )
    expect(inTheNote, 'the paste goes where the focus is, and that is inside the note').toBe(true)
    await expect.poll(() => keptParts(page).then(ofType('picture'))).toHaveLength(2)
    const [wide, small] = ofType('picture')(await keptParts(page)) as [Part, Part]
    expect((await asked(page)).filter((one) => one.door === 'store').map((one) => one.name)).toEqual(['made-up-wide.png', 'made-up-small.png'])
    expect(wide).toEqual(expect.objectContaining({ name: 'made-up-wide.png', path: expect.stringMatching(/^\/made-up\/report-files\//u), hash: 'made-up' }))
    const [x, y, w, h] = [wide['x'], wide['y'], wide['width'], wide['height']].map(Number) as [number, number, number, number]
    expect(x >= view.left && x < view.left + view.width / 4, `the picture starts at ${String(x)}, at the left of the view`).toBe(true)
    expect(y >= view.top && y < view.top + view.height / 4, `the picture starts at ${String(y)}, at the top of the view`).toBe(true)
    expect(x + w, 'the picture is drawn no wider than the sheet in view').toBeLessThanOrEqual(view.left + view.width)
    expect(Math.abs(h * 2 - w), `the picture is drawn ${String(w)} by ${String(h)}, in its own shape`).toBeLessThanOrEqual(2)
    expectPlaced(small, { width: 120, height: 90 })
    expect(Number(small['y']), 'the second picture is placed below the first').toBeGreaterThanOrEqual(y + h)
    // DRAWN ONCE THE SAVE HOLDING IT IS ANSWERED, from the bytes the file door keeps. Its width is read again until the
    // picture has loaded, because an element in the page may still be loading its bytes.
    await page.locator('.qn-file img').nth(1).waitFor({ timeout: 10_000 })
    await expect
      .poll(() => page.locator('.qn-file img').first().evaluate((node) => (node as HTMLImageElement).naturalWidth), { timeout: 10_000 })
      .toBe(1600)
    await page.close()
  }, 60_000)

  it('asks for a new note\'s first picture only after the first save names the note', async () => {
    const records: (string | null)[] = []
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`, (one) => servingFiles(one, records))
    await page.waitForSelector('.qn-field')
    const inTheNote = await page.evaluate(() =>
      (window as unknown as TheStand).qn.paste([{ kind: 'picture', name: 'made-up-first.png', width: 160, height: 80 }]),
    )
    expect(inTheNote, 'the paste goes inside the note').toBe(true)
    await expect.poll(async () => (await asked(page)).filter((one) => one.door === 'store').length).toBe(1)
    // BEFORE THE FIRST SAVE the note has no record, so it names none and asks the file door for nothing.
    expect(records).toEqual([])
    // AFTER THE FIRST SAVE the picture is asked for by the note the office has just filed.
    await page.locator('.qn-file img').waitFor({ timeout: 10_000 })
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) expect(record).toBe('MadeUpNote01')
    await page.close()
  }, 60_000)

  it('places a dropped picture where it is dropped, and says it is being added until it is stored', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`, (one) => one.evaluate(() => (window as unknown as TheStand).qn.hold()))
    await page.waitForSelector('.qn-field')
    const sheet = await theSheet(page)
    const taken = await page.evaluate(
      ([x, y]) => (window as unknown as TheStand).qn.drop([{ kind: 'picture', name: 'made-up-dropped.png', width: 200, height: 100 }], x, y),
      [sheet.x + 60, sheet.y + 200] as const,
    )
    expect(taken, 'the sheet takes a file dropped on it').toBe(true)
    await page.getByRole('status').filter({ hasText: t('quickNote.picture.adding', { name: 'made-up-dropped.png' }) }).waitFor({ timeout: 5_000 })
    await page.evaluate(() => (window as unknown as TheStand).qn.release())
    await expect.poll(() => keptParts(page).then(ofType('picture'))).toHaveLength(1)
    expectPlaced(ofType('picture')(await keptParts(page))[0], { x: 60, y: 200, width: 200, height: 100 })
    await page.close()
  }, 60_000)

  it('opens a chooser for pictures and films from Add a picture, and keeps the picture chosen', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    const bytes = Buffer.from(await page.evaluate(() => (window as unknown as TheStand).qn.aPictureInBase64(80, 40)), 'base64')
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5_000 }),
      page.locator('.qn-tools').getByRole('button', { name: t('quickNote.addAPicture'), exact: true }).click({ timeout: 5_000 }),
    ])
    const accepts = ((await chooser.element().getAttribute('accept')) ?? '').split(',').map((one) => one.trim())
    expect(accepts).toEqual(expect.arrayContaining(['image/*', 'video/*']))
    await chooser.setFiles({ name: 'made-up-chosen.png', mimeType: 'image/png', buffer: bytes })
    await expect.poll(() => keptParts(page).then(ofType('picture'))).toHaveLength(1)
    expect(ofType('picture')(await keptParts(page))[0]).toEqual(expect.objectContaining({ name: 'made-up-chosen.png', width: 80, height: 40 }))
    await page.close()
  }, 60_000)

  it('keeps a pasted film as a film at its own size, under a film ending, and draws it as a film inside its frame once it is kept', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`, servingFiles)
    await page.waitForSelector('.qn-field')
    await page.evaluate(() => (window as unknown as TheStand).qn.paste([{ kind: 'film', name: 'made-up-film.webm' }]))
    await expect.poll(() => keptParts(page).then(ofType('video'))).toHaveLength(1)
    const [film] = ofType('video')(await keptParts(page))
    expect(film).toEqual(expect.objectContaining({ name: 'made-up-film.webm', width: 320, height: 180 }))
    expect(String(film?.['path']).endsWith('.webm'), 'the film is kept under a film ending').toBe(true)
    await page.locator('.qn-file video').waitFor({ timeout: 10_000 })
    // THE FILM AND THE LINK THAT SAVES IT WHOLE ARE DRAWN INSIDE THE FRAME the film was given, so neither stands over the
    // sheet beside it. The link is the report's own, so a rule of the report's style sheet draws it: no other style
    // sheet names its class.
    const frame = page.locator('.qn-file')
    const save = frame.getByRole('link', { name: t('sb.saveWholeVideo'), exact: true })
    await save.waitFor({ timeout: 10_000 })
    const edgesOf = async (drawn: Locator) => {
      const box = await drawn.boundingBox()
      if (box === null) throw new Error('a part of the film is not drawn')
      return { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
    }
    const outer = await edgesOf(frame)
    for (const [what, drawn] of [['the film', frame.locator('video')], ['the link that saves it whole', save]] as const) {
      const inner = await edgesOf(drawn)
      expect(inner.left, `${what} begins inside its frame`).toBeGreaterThanOrEqual(outer.left - 0.5)
      expect(inner.top, `${what} begins below the top of its frame`).toBeGreaterThanOrEqual(outer.top - 0.5)
      expect(inner.right, `${what} ends inside its frame`).toBeLessThanOrEqual(outer.right + 0.5)
      expect(inner.bottom, `${what} ends above the foot of its frame`).toBeLessThanOrEqual(outer.bottom + 0.5)
    }
    const drawnByTheReport = await save.evaluate((link) =>
      [...document.styleSheets].some((sheet) =>
        [...sheet.cssRules].some((rule) => rule instanceof CSSStyleRule && rule.selectorText.includes('sb-video-save') && link.matches(rule.selectorText)),
      ),
    )
    expect(drawnByTheReport, "a rule of the report's style sheet draws the link that saves the film whole").toBe(true)
    await page.close()
  }, 60_000)

  it('refuses a file that is not a picture or a film, a film the office does not keep, a picture that does not open and a file too big, and stores nothing', async () => {
    const page = await aNotePage(`#/${THE_QUICK_NOTE_SEGMENT}`)
    await page.waitForSelector('.qn-field')
    await page.evaluate(
      (big) =>
        (window as unknown as TheStand).qn.paste([
          { kind: 'bytes', name: 'made-up-words.txt', type: 'text/plain', text: 'Made-up words, not a picture.' },
          { kind: 'bytes', name: 'made-up-film.mov', type: 'video/quicktime', size: 64 },
          { kind: 'bytes', name: 'made-up-broken.png', type: 'image/png', text: 'Made-up bytes that are not a picture.' },
          { kind: 'bytes', name: 'made-up-big.png', type: 'image/png', size: big },
        ]),
      MAX_PREVIEW_BYTES + 1,
    )
    const refused = (name: string, reason: string) => t('quickNote.picture.refused', { name, reason })
    const tooBig = refused('made-up-big.png', t('quickNote.picture.tooBig', { size: sizeSaid(MAX_PREVIEW_BYTES + 1), most: sizeSaid(MAX_PREVIEW_BYTES) }))
    const said = () => page.getByRole('alert').allInnerTexts().then((texts) => texts.join('\n'))
    await expect.poll(said, { timeout: 10_000 }).toContain(tooBig)
    const all = await said()
    expect(all).toContain(refused('made-up-words.txt', t('quickNote.picture.notAPictureOrFilm')))
    expect(all).toContain(refused('made-up-broken.png', t('quickNote.picture.unreadable')))
    const film = all.split('\n').find((line) => line.startsWith('made-up-film.mov')) ?? ''
    expect(film).toContain(refused('made-up-film.mov', '').trim())
    for (const format of MEDIA_FORMATS.filter((one) => one.block === 'video')) expect(film, 'the refusal names the formats kept').toContain(format.extension)
    await page.waitForTimeout(1_500)
    expect(await asked(page), 'nothing is stored, and no note is filed').toEqual([])
    await page.close()
  }, 60_000)
})
