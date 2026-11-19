// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD NAME THAT ARRIVES BETWEEN A DRAWING AND ITS LISTENING IS STILL DRAWN. Problem OsSkG2fDk9aL, round 40 of wave 13n.
 *
 * `useRecordNames` in src/web/lib/titles.ts read the names it held while the page drew, and only began to listen for
 * new names afterwards, in an effect. A name another drawing's read brought back in between was stored and told to
 * the drawings already listening. The new drawing was not one of them, and when it began to listen it saw the name was
 * read and asked for nothing. So it was never drawn again and showed the bare id for good. Wave 13x's round 1 named this
 * as a possible cause of the chat-panel timeout; this file shows it is a real fault.
 *
 * WHAT THIS FILE PROVES, in Chromium, with the hook drawn on a page of its own and the names door answered by hand:
 *   a first drawing asks for a record's name and its read is held open. A second drawing of the same record is drawn,
 *   and the held read is answered after that drawing and before its effects run. The second drawing then shows the
 *   name. Three records, one after another, so a lucky order of tasks does not pass it.
 * The gap is made certain, not hoped for: the answer is given in a layout effect that then holds the page for 50 ms,
 * so React's scheduler yields before it runs the effects, and the read's reply is stored in that yield.
 * MUTATION: put back the hook that keeps a counter in state and listens only in its effect. Red.
 *
 * No server, port or office is involved. The record ids and names are made up.
 */
import { bundlePageCode } from './a-bundle-of-page-code.ts'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'

let browser: Browser
let script = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h, Fragment, useLayoutEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { api } from './src/web/api.ts';
        import { useRecordNames } from './src/web/lib/titles.ts';
        const held = new Map();
        const asked = [];
        api.shortFormRows = (ids, level) => {
          asked.push(ids.join(','));
          return new Promise((answer) => { for (const id of ids) held.set(id, () => answer({ level, rows: [{ recordId: id, text: 'Test name of ' + id }], asked: 1, note: '' })) });
        };
        function Named({ id, where }) {
          const name = useRecordNames([id], 'label').get(id);
          return h('span', { id: where, 'data-named': name === undefined ? 'no' : name.text }, name === undefined ? id : name.text);
        }
        function AnswerAfterTheDrawing({ id }) {
          useLayoutEffect(() => {
            held.get(id)();
            const until = performance.now() + 50;
            while (performance.now() < until) {}
          }, [id]);
          return null;
        }
        const root = createRoot(document.getElementById('app'));
        window.r40 = {
          asked: () => asked.length,
          first: (id) => root.render(h(Named, { id, where: 'first-' + id })),
          second: (id) => root.render(h(Fragment, null,
            h(Named, { id, where: 'first-' + id }),
            h(Named, { id, where: 'second-' + id }),
            h(AnswerAfterTheDrawing, { id }))),
        };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  script = built.outputFiles[0]?.text ?? ''
  if (script === '') throw new Error('The test page did not build.')
  browser = await chromium.launch()
}, 120_000)

afterAll(async () => {
  await browser?.close()
})

it('draws a name that came back after the drawing and before it listened', async () => {
  const page = await browser.newPage()
  await page.route('http://names.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  await page.goto('http://names.test/')
  await page.addScriptTag({ content: script })
  for (const [n, id] of ['test-rec-a', 'test-rec-b', 'test-rec-c'].entries()) {
    await page.evaluate((one) => (window as unknown as { r40: { first: (id: string) => void } }).r40.first(one), id)
    // The first drawing's read is out and held.
    await page.waitForFunction((count) => (window as unknown as { r40: { asked: () => number } }).r40.asked() === count, n + 1, { timeout: 5_000 })
    await page.evaluate((one) => (window as unknown as { r40: { second: (id: string) => void } }).r40.second(one), id)
    await page.waitForFunction((one) => document.getElementById(`first-${one}`)?.dataset.named !== 'no', id, { timeout: 5_000 })
    // Give the second drawing every chance to draw again before it is read.
    await page.waitForTimeout(300)
    expect(await page.getAttribute(`#second-${id}`, 'data-named'), `the second drawing of ${id} shows its name`).toBe(`Test name of ${id}`)
  }
  // ONE READ PER RECORD: the second drawing did not ask again, so the name it shows is the one the first read brought.
  expect(await page.evaluate(() => (window as unknown as { r40: { asked: () => number } }).r40.asked())).toBe(3)
  await page.close()
}, 120_000)
