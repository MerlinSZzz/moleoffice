// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD WHOSE TITLE IS NOT READ IS CALLED A RECORD. ONLY ONE THIS PROJECT DOES NOT HOLD IS SAID TO BE MISSING.
 *
 * `titleOrSentence` in src/web/lib/titles.ts names the record a chat quote points at, and the message, messages and
 * run pages name records with it too. It said "somewhere this project does not hold" while a record's title was still
 * being read, and again after a read that failed. Neither is known to be missing: nobody has looked yet, or the look
 * did not come back. Only the door's answer that this project holds no such record says that.
 *
 * WHAT THIS FILE PROVES, in Chromium, with a quote's name and a gate's mark drawn on a page of their own and the
 * titles door answered by hand:
 *   (a) while the read is out, the quote names the record word;
 *   (b) once the door answers that this project holds no such record, the quote says so in the sentence;
 *   (c) once the read has failed, the quote names the record word, and the lead offer is given no title for it;
 *   (d) a partial gate whose stage is a record whose read failed says the step could not be named, and does not say
 *       that the name is still being read.
 *
 * No server, port or office is involved. The record ids are made up.
 */
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

let browser: Browser
let script = ''

/** The page's own doors for these cases, as the bundle below gives them to the window. */
type Door = 'asked' | 'drawings' | 'quote' | 'gate' | 'notHeld' | 'fails'
type Words = { aRecord: string; notHeld: string; unnamed: string; reading: string }

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { api } from './src/web/api.ts';
        import { t } from './src/shared/i18n.ts';
        import { LEADING } from './src/shared/messages.ts';
        import { knownTitleOf, titleOrSentence, useRecordTitles } from './src/web/lib/titles.ts';
        import { GateMark } from './src/web/components/ui.tsx';
        const held = new Map();
        let drawings = 0;
        api.shortFormRows = (ids, level) => new Promise((answer, fail) => {
          for (const id of ids) held.set(id, {
            notHeld: () => answer({ level, rows: [], asked: ids.length, note: '' }),
            fails: () => fail(new Error('The made-up read did not come back.')),
          });
        });
        function Quoted({ id }) {
          const titles = useRecordTitles([id]);
          drawings += 1;
          return h('span', { id: 'quoted', 'data-lead-title': String(knownTitleOf(titles, id)) }, titleOrSentence(titles, id));
        }
        const root = createRoot(document.getElementById('app'));
        window.titlesTest = {
          words: () => ({
            aRecord: LEADING.aRecord,
            notHeld: LEADING.somewhereUnknown,
            unnamed: t('unlistedWords.gate.stageUnnamed'),
            reading: t('unlistedWords.gate.stageReading'),
          }),
          asked: (id) => held.has(id),
          drawings: () => drawings,
          quote: (id) => root.render(h(Quoted, { id })),
          gate: (id) => root.render(h(GateMark, { gate: { kind: 'partial', upTo: id } })),
          notHeld: (id) => held.get(id).notHeld(),
          fails: (id) => held.get(id).fails(),
        };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    // A MODULE, because ui.tsx works out its mark's address from import.meta.url as it loads, which a script that is
    // not a module does not have: the page threw "Invalid URL" before it could start.
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
})

/** A page of its own for one case, so no title read in another case is still held in this one. */
async function aPage(): Promise<Page> {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('http://titles.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto('http://titles.test/')
  await page.addScriptTag({ content: script, type: 'module' })
  await page.waitForFunction(() => (window as unknown as { titlesTest?: unknown }).titlesTest !== undefined, undefined, { timeout: 10_000 })
    .catch(() => { throw new Error(`The test page did not start: ${errors.join('; ') || 'it threw nothing'}`) })
  return page
}

/** Ask one of the page's doors about one made-up record. */
function call(page: Page, door: Door, id: string): Promise<unknown> {
  return page.evaluate(
    ([name, one]) => (window as unknown as { titlesTest: Record<string, (id: string) => unknown> }).titlesTest[name]?.(one),
    [door, id] as const,
  )
}

/** The words the page draws, read in the page so they are in its language. */
function wordsOf(page: Page): Promise<Words> {
  return page.evaluate(() => (window as unknown as { titlesTest: { words: () => Words } }).titlesTest.words())
}

/** Wait until the page's read of one record's title is out and held. */
async function itIsAsked(page: Page, id: string): Promise<void> {
  await expect.poll(() => call(page, 'asked', id), { timeout: 5_000, message: `the title of ${id} was never asked for` }).toBe(true)
}

/** Draw the quote's name for a record, and wait until its title read is out and held. */
async function aQuoteOf(page: Page, id: string): Promise<void> {
  await call(page, 'quote', id)
  await itIsAsked(page, id)
}

/** Answer the held read, and wait until the quote is drawn again with what came back. */
async function answered(page: Page, id: string, how: 'notHeld' | 'fails'): Promise<void> {
  const before = Number(await call(page, 'drawings', id))
  await call(page, how, id)
  await expect.poll(async () => Number(await call(page, 'drawings', id)) > before, {
    timeout: 5_000, message: `the quote of ${id} was not drawn again after its read was answered`,
  }).toBe(true)
}

it('(a) names the record word while the title is still being read', async () => {
  const page = await aPage()
  const words = await wordsOf(page)
  await aQuoteOf(page, 'madeUpRec0a1')
  expect(await page.textContent('#quoted'), 'the quote while its title is being read').toBe(words.aRecord)
  expect(await page.getAttribute('#quoted', 'data-lead-title'), 'the lead offer is given no title yet').toBe('null')
  await page.close()
}, 60_000)

it('(b) says this project does not hold the record once the door answers so', async () => {
  const page = await aPage()
  const words = await wordsOf(page)
  await aQuoteOf(page, 'madeUpRec0b1')
  await answered(page, 'madeUpRec0b1', 'notHeld')
  expect(await page.textContent('#quoted'), 'the quote of a record this project does not hold').toBe(words.notHeld)
  expect(await page.getAttribute('#quoted', 'data-lead-title'), 'the lead offer is given no title').toBe('null')
  await page.close()
}, 60_000)

it('(c) names the record word after the read failed, and gives the lead offer no title', async () => {
  const page = await aPage()
  const words = await wordsOf(page)
  await aQuoteOf(page, 'madeUpRec0c1')
  await answered(page, 'madeUpRec0c1', 'fails')
  expect(await page.textContent('#quoted'), 'the quote of a record whose title read failed').toBe(words.aRecord)
  expect(await page.getAttribute('#quoted', 'data-lead-title'), 'the lead offer is given no title').toBe('null')
  await page.close()
}, 60_000)

it('(d) a gate whose stage is a record whose read failed says the step could not be named', async () => {
  const page = await aPage()
  const words = await wordsOf(page)
  await call(page, 'gate', 'madeUpRec0d1')
  await itIsAsked(page, 'madeUpRec0d1')
  expect(await page.getAttribute('.px-mark', 'title'), 'the gate while its stage is being read').toBe(words.reading)
  await call(page, 'fails', 'madeUpRec0d1')
  await expect.poll(() => page.getAttribute('.px-mark', 'title'), {
    timeout: 5_000, message: 'the gate still says its stage is being read after the read failed',
  }).not.toBe(words.reading)
  expect(await page.textContent('.px-mark .px-chip-count'), 'the stage of a gate whose record read failed').toBe(words.unnamed)
  await page.close()
}, 60_000)
