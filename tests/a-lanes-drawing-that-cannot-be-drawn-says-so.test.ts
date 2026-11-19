// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LANES DRAWING THAT CANNOT BE DRAWN SAYS SO IN ITS PLACE, IN THE ERROR'S OWN WORDS. Wave 13u round 230.
 *
 * On a filed pipeline's page the drawing in areas threw: the engine's `drawTree` (src/web/components/graph/lanes/engine.ts)
 * met an area headed by a record that was not among the drawing's records. `LanesDrawing` called it with no catch, so the
 * page showed an empty frame and nobody saw the error. Invariant 4 says a broken assumption fails loudly.
 *
 * WHAT THIS FILE PROVES, in Chromium, with the drawing on a page of its own and no server, office or port: the drawing is
 * handed a made-up tree whose one area is headed by a record that is not in its records. The engine's own message for
 * that tree is read first, from `drawTree` itself, so this file never writes that message out. Then `LanesDrawing` draws
 * the same input, and its place says the sentence `lanes.couldNotDraw` with that message in it.
 *
 * The sentence's word comes with the code, so it is read from the wave's word file by its key, and this file is red at
 * its Criterion commit because nothing on the page says the drawing failed.
 *
 * MUTATION: take the catch for a rejected `drawTree` out of src/web/components/graph/lanes/LanesDrawing.tsx, and the
 * case goes red: the drawing's place says nothing.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import type { DrawnRecord, LanesInput } from '../src/web/components/graph/lanes/tree.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const KEY = 'lanes.couldNotDraw'

// Without `line`, and cast, because round 230's step 1c took `line` off a drawn record and this file changed first.
const STEP: Omit<DrawnRecord, 'line'> = {
  id: 'made-up-step', kind: 'block', title: 'A made-up step', role: 'step', state: 'todo', number: '01', badges: [],
  counts: { carries: null, carriedBy: null, holds: null }, href: null,
}

/** One step, in one area whose head names a record the input does not hold. Every id and title is made up. */
const INPUT: LanesInput = {
  pipeline: { id: 'made-up-pipeline', title: 'A made-up pipeline' },
  records: [STEP as DrawnRecord],
  links: [],
  tree: {
    level: 'steps',
    direction: 'down',
    areas: [{
      key: 'made-up-area', heading: { text: 'A made-up area', record: 'made-up-missing-head' }, arrange: 'row', columns: null, beside: null, tint: null,
      items: [{ record: 'made-up-step' }],
    }],
    notPlaced: [],
  },
}

interface ThePage {
  engineSays: (input: LanesInput) => Promise<string | null>
  draw: (input: LanesInput) => void
}

let browser: Browser
let script = ''

beforeAll(async () => {
  const built = await bundlePageCode({
    stdin: {
      contents: `import './tests/a-page-of-a-test-office.ts';
        import { createElement as h } from 'react';
        import { createRoot } from 'react-dom/client';
        import { LanesDrawing } from './src/web/components/graph/lanes/LanesDrawing.tsx';
        import { drawTree } from './src/web/components/graph/lanes/engine.ts';
        window.lanesFault = {
          engineSays: async (input) => {
            const slot = document.createElement('div');
            document.body.append(slot);
            try {
              await drawTree(slot, input, input.tree, { width: 1200 });
              return null;
            } catch (error) {
              return error instanceof Error ? error.message : String(error);
            } finally {
              slot.remove();
            }
          },
          draw: (input) => createRoot(document.getElementById('app')).render(h(LanesDrawing, { input, onSays: () => {} })),
        };`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    // A module, so a page module that finds a file beside itself by `import.meta.url` has an address to find it from.
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

it('says in the drawing\'s place that it could not be drawn, with the engine\'s own message', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.route('http://lanes.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
    const thrown: string[] = []
    page.on('pageerror', (error) => thrown.push(error.message))
    await page.goto('http://lanes.test/')
    await page.addScriptTag({ type: 'module', content: script })
    await page.waitForFunction(() => 'lanesFault' in window, undefined, { timeout: 10_000 })
    expect(thrown.join('\n'), 'the test page loaded with no error').toBe('')

    // The control: the engine refuses this tree, and its message is what the page must show.
    const message = await page.evaluate((input) => (window as unknown as { lanesFault: ThePage }).lanesFault.engineSays(input), INPUT)
    expect(message, 'the engine draws a tree whose area is headed by a record it does not hold').not.toBeNull()
    expect(message).toContain('made-up-missing-head')

    await page.evaluate((input) => (window as unknown as { lanesFault: ThePage }).lanesFault.draw(input), INPUT)
    const said = () => page.evaluate(() => document.querySelector('.lanes-drawing')?.textContent ?? '')
    await expect.poll(said, { timeout: 15_000, message: "the drawing's place says the engine's message" }).toContain(message!)

    const words = await import('../src/shared/words/en-wave-13u.ts')
    const word = Reflect.get(words.enWave13u, KEY) as unknown
    expect(typeof word, `${KEY} is a word`).toBe('string')
    const sentence = (word as string).replace('{problem}', message!)
    const alert = page.locator('.lanes-drawing [role="alert"]')
    expect(await alert.count(), 'one sentence says the drawing failed').toBe(1)
    expect((await alert.textContent())?.trim()).toBe(sentence)
  } finally {
    await page.close()
  }
}, 60_000)
