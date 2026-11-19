// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S EMPTY TIME IS A DIMMED DASH, AND NO ORPHANS IS SAID ONCE (wave 13y round 146, item 84). Two parts of the
 * Sessions page said an ordinary empty answer in words.
 *
 * (a) A run with no clock said "no clock" in its time slot. An empty time slot is ordinary emptiness, which is a
 *     dimmed dash and never a sentence. The words stay on the dash, for hover and a screen reader, and the opened
 *     row's Last activity still says the gap in words.
 * (b) This machine's panel, with no orphans, drew a lone "none" at its foot, under a corner that already says
 *     "0 orphaned". The foot draws nothing now. Its sentence stays there for a screen reader only.
 *
 * The page is drawn in a browser from made-up runs, in Developer mode, where the machine panel is drawn. Nothing of
 * this machine is read, so no real process is drawn.
 *
 * 1. AT 1440 AND 390, THE RUN WITH NO CLOCK draws the dash in its time slot, dimmed, with "no clock" on it.
 * 2. AT 1440 AND 390, THE MACHINE PANEL with no orphans says "0 orphaned" in its corner and draws no mark at its foot.
 *    The sweep's own "Nothing unclaimed" above the foot is a different fact, and it stays.
 *
 * Set W13Y_ITEM_84_SHOTS to a folder outside the checkout, and W13Y_ITEM_84_LOOK to light or dark, to photograph the
 * page at 1440, 990, 660 and 390 in that look. One run takes one look, in a browser of its own. The ordinary run takes
 * none. Every run here is made up, and every picture says so above the page.
 *
 * MUTATIONS: the time slot draws the words again, and 1 goes red; the foot draws its "none" again, and 2 goes red.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'

let browser: Browser
let page: Page
let errors: string[] = []

const shots = process.env['W13Y_ITEM_84_SHOTS']
/** The one look a picture run takes. */
const look = process.env['W13Y_ITEM_84_LOOK']
const MADE_UP = 'Made-up data — invented runs on an invented machine, not real office data'

/** The run with no clock. */
const NO_CLOCK = 'Compare the sample colours'

const BOARD = `
import './tests/a-page-of-a-test-office.ts';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {setWordLanguage} from './src/shared/i18n.ts';
import {setMode} from './src/web/lib/mode.ts';
import {theApiIsOnPort} from './src/web/lib/api-address.ts';
theApiIsOnPort(47320);
import {SessionsView} from './src/web/pages/SessionsPage.tsx';
import {readOrphansPayload, SESSIONS_CSS} from './src/web/components/SessionPanel.tsx';
import {UI_CSS} from './src/web/components/ui.tsx';
const root=createRoot(document.getElementById('test'));
const now=new Date('2026-09-26T12:00:00Z').getTime();
const read={at:now,inFlight:false,failed:null,onReadAgain:()=>{}};
const fern={id:'module-fern',title:'Fern samples',kind:'module'};
const moss={id:'module-moss',title:'Moss survey',kind:'module'};
const placed=(project)=>({kind:'in',primary:{project,evidence:{how:'link',word:'part of'},support:1,sentence:'A link joins this run and the module.'},also:[]});
const base={recordId:null,origin:'authored',stateReason:null,purpose:null,doing:null,tool:'claude-code',recordedAgent:null,cwd:null,workspace:null,
  lastOutputAt:'2026-09-26 11:58:00',lastActivityFrom:null,resumeCommand:null,logPath:null,itsProcess:null,detail:null,
  written:{kind:'classified',word:'running',progress:'in_flight'}};
const lines=[
  {...base,id:'run-a',recordId:'record-a',title:${JSON.stringify(NO_CLOCK)},state:'running',tool:'unrecorded',lastOutputAt:null,
    doing:'Reading the sample notes',placement:placed(fern)},
  {...base,id:'run-b',title:'Count the fern fronds',state:'running',placement:placed(fern)},
  {...base,id:'run-c',recordId:'record-c',title:'Photograph the moss beds',state:'finished',lastOutputAt:'2026-09-20 09:00:00',
    written:{kind:'classified',word:'finished',progress:'done'},placement:placed(moss)},
];
const clean=readOrphansPayload({orphans:[],unclaimed:{summary:null,searched:['every listening socket on this machine — 12 sockets'],skipped:[],unchecked:[],resources:[]},
  searched:['the process table (/proc)']}).unclaimed;
window.board={
  draw(){
    setWordLanguage('en');setMode('inspect');
    flushSync(()=>root.render(<><style>{UI_CSS}</style><style>{SESSIONS_CSS}</style>
      <SessionsView lines={lines} orphans={[]} unclaimed={clean} problems={[]} now={now} read={read} onRelease={async()=>{throw Error('fixture only')}} onReread={()=>{}}/></>));
  }
};
`

beforeAll(async () => {
  const bundled = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'item-84-board.tsx', loader: 'tsx', contents: BOARD },
    loader: { '.css': 'empty' },
    write: false,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'image'
      ? route.fulfill({ path: join(process.cwd(), 'src/web/logo/mole-office-mark-40.png'), contentType: 'image/png' })
      : route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main id="test" style="padding:24px;max-width:1200px;margin:auto"></main></body></html>' }),
  )
  await page.goto('http://sessions.test/')
  const css = ['src/web/components/pixel-office/pixel-office.css', 'src/web/tokens.css', 'src/web/styles.css']
    .map((one) => readFileSync(join(process.cwd(), one), 'utf8'))
    .join('\n')
    .replace(/@import[^;]+;/g, '')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ type: 'module', content: bundled.outputFiles[0]!.text })
  await page.waitForFunction(() => Boolean((window as unknown as { board?: unknown }).board), undefined, { timeout: 10_000 })
  expect(errors).toEqual([])
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

async function drawAt(width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
  errors = []
  await page.evaluate(() => (window as unknown as { board: { draw: () => void } }).board.draw())
  expect(errors).toEqual([])
}

/** What a part draws for the eye: its text without the screen-reader-only sentences. */
const drawnWords = (selector: string) =>
  page.locator(selector).first().evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement
    for (const one of copy.querySelectorAll('.px-sr')) one.remove()
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })

it('1. at 1440 and 390, the run with no clock draws a dimmed dash in its time slot, with "no clock" on it', async () => {
  for (const width of [1440, 390]) {
    await drawAt(width)
    const slot = `.px-scan:has-text(${JSON.stringify(NO_CLOCK)}) .px-scan-age`
    expect(await drawnWords(slot), `at ${String(width)}, the time slot`).toBe(en['absence.mark'])
    const dash = page.locator(`${slot} .px-absent`).first()
    expect(await dash.getAttribute('title'), `at ${String(width)}, the dash's hover`).toBe(en['g6a.sessions.noClock'])
    expect(await dash.locator('.px-sr').innerText(), `at ${String(width)}, what a screen reader hears`).toBe(en['g6a.sessions.noClock'])
    const [dim, ordinary] = await dash.evaluate((node) => [getComputedStyle(node).color, getComputedStyle(node.closest('.px-scan')!).color])
    expect(dim, `at ${String(width)}, the dash is not dimmed`).not.toBe(ordinary)
  }
}, 60_000)

it('2. at 1440 and 390, the machine panel with no orphans says 0 orphaned in its corner and draws no mark at its foot', async () => {
  for (const width of [1440, 390]) {
    await drawAt(width)
    const panel = page.locator('section.px-panel').filter({ has: page.locator('.px-tag', { hasText: en['g6a.sessions.orphaned'] }) }).first()
    expect(await panel.count(), `at ${String(width)}, the machine panel`).toBe(1)
    const corner = (await panel.locator('.px-tag', { hasText: en['g6a.sessions.orphaned'] }).first().innerText()).replace(/\s+/g, ' ').trim()
    expect(corner).toBe(`0 ${en['g6a.sessions.orphaned']}`)
    // The sweep's own "Nothing unclaimed" is a different fact, which the corner does not say, and it stays.
    expect(await panel.locator('.sx-unclaimed .px-absent').count(), `at ${String(width)}, the sweep's mark`).toBe(1)
    const marks = await panel
      .locator('.px-absent')
      .evaluateAll((nodes) => nodes.filter((node) => node.closest('.sx-unclaimed') === null).map((node) => (node as HTMLElement).innerText.trim()))
    expect(marks, `at ${String(width)}, a mark at the machine panel's foot`).toEqual([])
  }
}, 60_000)

it.runIf(shots)('3. photographs the page at 1440, 990, 660 and 390 in one look', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_ITEM_84_SHOTS')
  if (look !== 'light' && look !== 'dark') throw new Error('the pictures need W13Y_ITEM_84_LOOK, light or dark')
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    await drawAt(width)
    await page.evaluate((theme) => {
      document.documentElement.dataset['theme'] = theme
    }, look)
    // THE ROWS ARE OPENED, so the run with no clock shows its Last activity, which says the gap in words.
    await page.locator('#test details').evaluateAll((nodes) => {
      for (const node of nodes) (node as HTMLDetailsElement).open = true
    })
    await putTheMadeUpLabelIn(page, MADE_UP, page.locator('#test > :not(style)'), `item-84-${look}-${String(width)}`)
    await page.screenshot({ path: join(shots, `item-84-${look}-${String(width)}.png`), fullPage: true })
    await takeTheMadeUpLabelOut(page)
  }
}, 120_000)
