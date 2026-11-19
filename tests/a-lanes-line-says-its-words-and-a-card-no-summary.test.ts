// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LANES LINE SAYS IN WORDS WHAT IT CARRIES, AND THE LANES DRAWING DRAWS NO SUMMARY. Wave 13u round 230.
 *
 * Two faults of the drawing in areas on a filed pipeline's page, found on look 2b:
 *   1. A feeds line drew what it carries as the office stores it: JSON text, braces and all, on the line and in the
 *      outline's words list. The words for it are `carriedWords(carriesOf(...))`, as the block map's lines say them.
 *   2. A card drew its record's whole summary under its title, and so did an area's head and the outline, so a long
 *      summary filled the card. Round 230's step 1c takes that line out of the drawing.
 *
 * WHAT THIS FILE PROVES, in Chromium, with the drawing on a page of its own and no server, office or port. A made-up
 * office of one pipeline, three steps, one module and two feeds links is read by `lanesInputFor`
 * (src/web/components/graph/lanes/from-records.ts), the way the page reads what it loaded, and drawn by `LanesDrawing`,
 * wide at 1440 and as the outline at 390. Each link's carries is JSON text, as the office keeps it. The module heads the
 * one stored lane.
 *   1. The line that carries `[{"out":"uses"}]` says "uses" on the line at 1440 and in the words list at 390. The line
 *      that carries `[{"out":"a","in":"b"}]` says "a → b" in both places. No "{" is in the drawing's text at either width.
 *   2. The first step and the module each have a long summary, and none of its words is in the drawing's text at 1440 or
 *      in the outline's at 390.
 *
 * MUTATIONS, each red, each restored with cp and checked with cmp:
 *   1. pass `row.carries` raw as a link's carries in from-records.ts: case 1 goes red.
 *   2. draw `record.summary` as a card's line again: case 2 goes red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import type { PanelRecord } from '../src/shared/types.ts'
import { pipelineScope } from '../src/shared/presentation.ts'
import type { GraphLink } from '../src/web/components/graph/model.ts'
import { bundlePageCode } from './a-bundle-of-page-code.ts'

const AT = '2026-08-01 09:00:00'

/** Made-up words, none of which the drawing says for any other reason. */
const SUMMARY_WORDS = ['quillwort', 'marrowfat', 'samphire', 'purslane', 'chervil', 'lovage', 'comfrey', 'yarrow']
const SUMMARY = `${SUMMARY_WORDS.join(' ')}, ${SUMMARY_WORDS.join(' ')}, ${SUMMARY_WORDS.join(' ')}, a made-up summary.`

function record(id: string, kind: string, title: string, data: Record<string, unknown> = {}, summary: string | null = null): PanelRecord {
  return { id, kind, title, summary, data, createdAt: AT, updatedAt: AT, deletedAt: null } as unknown as PanelRecord
}

function link(id: string, fromId: string, toId: string): GraphLink {
  return { linkId: id, fromId, toId, type: 'feeds', inferred: false, broken: false, gate: { at: 'not-a-dependency' } } as GraphLink
}

const PIPELINE = 'made-up-pipeline'
const LANE = 'A made-up lane'

/** The made-up office the page loaded. Every id and title is made up. */
const OFFICE = {
  pipeline: PIPELINE,
  records: [
    record(PIPELINE, 'pipeline', 'A made-up pipeline', { blockIds: ['made-up-first', 'made-up-second', 'made-up-third'] }),
    record('made-up-first', 'block', 'First made-up step', { state: 'todo' }, SUMMARY),
    record('made-up-second', 'block', 'Second made-up step', { state: 'todo' }),
    record('made-up-third', 'block', 'Third made-up step', { state: 'todo' }),
    record('made-up-module', 'module', 'A made-up module', {}, SUMMARY),
  ],
  links: [link('made-up-uses', 'made-up-first', 'made-up-second'), link('made-up-a-to-b', 'made-up-second', 'made-up-third')],
  carries: [['made-up-uses', '[{"out":"uses"}]'], ['made-up-a-to-b', '[{"out":"a","in":"b"}]']],
  stored: {
    scope: pipelineScope(PIPELINE),
    intent: {
      lanes: [{ name: LANE, arrange: 'stack', head: 'made-up-module' }],
      nodes: { 'made-up-first': { lane: LANE }, 'made-up-second': { lane: LANE }, 'made-up-third': { lane: LANE } },
    },
    targets: [], report: {}, note: '',
  },
}

interface ThePage {
  draw: (office: typeof OFFICE) => { links: string[]; said: string[] }
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
        import { lanesInputFor } from './src/web/components/graph/lanes/from-records.ts';
        window.lanesWords = {
          draw: (office) => {
            const pipeline = office.records.find((one) => one.id === office.pipeline);
            const loaded = { records: office.records, links: office.links, linkCarries: new Map(office.carries) };
            const reading = lanesInputFor(loaded, null, pipeline, 'steps', office.stored);
            createRoot(document.getElementById('app')).render(h(LanesDrawing, { input: reading.input, onSays: () => {} }));
            return { links: reading.input.links.map((one) => one.id), said: reading.said };
          },
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

const DRAWING = '[data-drawing="lanes"]'

/** The made-up office drawn at one width: wide, or as the outline at 390. */
async function drawnAt(width: number): Promise<{ page: Page; text: () => Promise<string> }> {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 1000 } })
  await page.route('http://lanes.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="app"></div>' }))
  const thrown: string[] = []
  page.on('pageerror', (error) => thrown.push(error.message))
  await page.goto('http://lanes.test/')
  await page.addScriptTag({ type: 'module', content: script })
  await page.waitForFunction(() => 'lanesWords' in window, undefined, { timeout: 10_000 })
  expect(thrown.join('\n'), 'the test page loaded with no error').toBe('')
  const read = await page.evaluate((office) => (window as unknown as { lanesWords: ThePage }).lanesWords.draw(office), OFFICE)
  expect(read.links.sort(), `both feeds links are drawn (the reading said: ${read.said.join(' | ')})`).toEqual(['made-up-a-to-b', 'made-up-uses'])
  await page.locator(width < 600 ? `${DRAWING} .e-outline .e-card` : `${DRAWING}[data-drawn-links]`).first().waitFor({ timeout: 30_000 })
  expect(thrown.join('\n'), 'the drawing was drawn with no error').toBe('')
  return { page, text: async () => (await page.locator(DRAWING).textContent()) ?? '' }
}

it('1. a feeds line says what it carries in words, on the line at 1440 and in the words list at 390, and no "{"', async () => {
  const wide = await drawnAt(1440)
  try {
    const word = (id: string) => wide.page.locator(`${DRAWING} .e-pill[data-link="${id}"] .e-pill-word`).textContent()
    expect(await word('made-up-uses'), 'the line that carries [{"out":"uses"}]').toBe('uses')
    expect(await word('made-up-a-to-b'), 'the line that carries [{"out":"a","in":"b"}]').toBe('a → b')
    expect(await wide.text(), 'the drawing at 1440 says no "{"').not.toContain('{')
  } finally {
    await wide.page.close()
  }
  const narrow = await drawnAt(390)
  try {
    const listed = await narrow.page.locator(`${DRAWING} .e-outline .e-said li`).allTextContents()
    expect(listed.filter((one) => one.endsWith(': uses')).length, `the words list says "uses" at both ends: ${listed.join(' | ')}`).toBe(2)
    expect(listed.filter((one) => one.endsWith(': a → b')).length, `the words list says "a → b" at both ends: ${listed.join(' | ')}`).toBe(2)
    expect(await narrow.text(), 'the outline at 390 says no "{"').not.toContain('{')
  } finally {
    await narrow.page.close()
  }
}, 60_000)

it("2. no word of a record's long summary is in the drawing at 1440 or in the outline at 390", async () => {
  for (const width of [1440, 390]) {
    const drawn = await drawnAt(width)
    try {
      const text = (await drawn.text()).toLowerCase()
      expect(text, `the drawing at ${String(width)} draws the step and the module`).toContain('first made-up step')
      expect(text).toContain('a made-up module')
      expect(SUMMARY_WORDS.filter((word) => text.includes(word)), `summary words drawn at ${String(width)}`).toEqual([])
    } finally {
      await drawn.page.close()
    }
  }
}, 60_000)
