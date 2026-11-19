// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Wave 13y round 41: the camera must see slow images and finite motion finished. */
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { takeReviewPicture, waitForReviewPage } from '../tools/review.mjs'

const require = createRequire(import.meta.url)
const { PNG } = require(join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js')) as {
  PNG: { sync: { read(bytes: Buffer): { width: number; data: Buffer } } }
}
const viewport = { width: 400, height: 300 }
const source = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')
const directory = mkdtempSync(join(tmpdir(), 'review-settled-'))
const requested: string[] = []
const timers = new Set<ReturnType<typeof setTimeout>>()
let server: Server
let browser: Browser
let site: string

function fixture(held: boolean): string {
  return `<!doctype html><html><head><style>
    body { margin: 0; background: white; }
    main { height: 6100px; }
    img, .finite, .endless { position: absolute; width: 64px; height: 64px; }
    .finite { left: 80px; top: 0; background: red; animation: finish 1s steps(1, end) forwards; }
    .endless { left: 160px; top: 0; background: black; animation: repeat .1s infinite; }
    @keyframes finish { to { background: blue; } }
    @keyframes repeat { to { opacity: .5; } }
  </style></head><body><main class="page">
    <img alt="invented slow green square" src="/${held ? 'held' : 'slow'}.svg" style="left:0;top:0">
    ${held ? '' : '<img alt="invented lazy green square" loading="lazy" src="/lazy.svg" style="left:0;top:6000px">'}
    <div class="finite"></div><div class="endless"></div>
    <p style="position:absolute;top:100px">This is invented content for the review camera criterion.</p>
  </main><script>document.documentElement.setAttribute('data-mole-office-ready', location.hash)</script></body></html>`
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? '/'
    requested.push(path)
    response.setHeader('cache-control', 'no-store')
    if (path === '/held.svg' || path === '/held.woff2') return
    if (path === '/broken.svg') { response.writeHead(404).end('Invented missing image.'); return }
    if (path.endsWith('.svg')) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        response.writeHead(200, { 'content-type': 'image/svg+xml' })
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path fill="#00ff00" d="M0 0h64v64H0z"/></svg>')
      }, 1500)
      timers.add(timer)
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(fixture(path === '/held').replace('src="/slow.svg"', path === '/broken' ? 'src="/broken.svg"' : 'src="/slow.svg"').replace('</style>', path === '/font'
      ? "@font-face { font-family: held; src: url('/held.woff2'); } p { font-family: held; }</style>"
      : '</style>'))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('The fixture has no loopback port.')
  site = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  for (const timer of timers) clearTimeout(timer)
  server?.closeAllConnections()
  server?.close()
  rmSync(directory, { recursive: true, force: true })
})

async function ready(path: string): Promise<Page> {
  const page = await browser.newPage({ viewport })
  await page.goto(`${site}${path}#/fixture`, { waitUntil: 'domcontentloaded' })
  await waitForReviewPage(page)
  return page
}

function rgb(bytes: Buffer, x: number, y: number): number[] {
  const png = PNG.sync.read(bytes)
  return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)]
}

function emptyShot() {
  return { page: 'invented fixture', address: '#/fixture', width: 400, viewportHeight: 300,
    theme: 'light', console: [], canvas: null, height: null, file: null, content: null,
    blank: null, error: null, notSettled: null as string | null }
}

it('without the wait the ready page is visibly unfinished, and capture does not finish its lazy image', async () => {
  const page = await ready('/early')
  try {
    expect(requested).not.toContain('/lazy.svg')
    const bytes = await page.screenshot({ fullPage: true })
    expect(rgb(bytes, 20, 20)).not.toEqual([0, 255, 0])
    expect(rgb(bytes, 100, 20)).toEqual([255, 0, 0])
    expect(await page.locator('img[loading]').evaluate((image: HTMLImageElement) => image.complete)).toBe(false)
  } finally { await page.close() }
})

it('the tool sees both images decoded and finite motion ended, while endless motion stays inside the cap', async () => {
  const page = await ready('/settled')
  try {
    const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: scrollY, page: document.documentElement.scrollHeight }))
    const shot = emptyShot()
    const started = performance.now()
    await takeReviewPicture(page, viewport, shot, 'settled.png', directory)
    const elapsed = performance.now() - started
    const bytes = readFileSync(join(directory, 'settled.png'))
    expect(rgb(bytes, 20, 20), 'the slow image was photographed before it loaded and decoded').toEqual([0, 255, 0])
    expect(rgb(bytes, 20, 6020), 'the below-screen lazy image was never requested before capture').toEqual([0, 255, 0])
    expect(rgb(bytes, 100, 20), 'the finite animation was still at its first frame').toEqual([0, 0, 255])
    expect(elapsed, 'an endless animation held the picture until the 5 second cap').toBeLessThan(4000)
    expect(shot.notSettled).toBeNull()
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scroll: scrollY, page: document.documentElement.scrollHeight }))).toEqual(layout)
    expect(await page.evaluate(() => document.getAnimations().some(animation => animation.effect?.getComputedTiming().endTime === Infinity))).toBe(true)
  } finally { await page.close() }
}, 15_000)

it('a complete broken image is named without spending the whole cap on a failure that has already ended', async () => {
  const page = await ready('/broken')
  try {
    const shot = emptyShot()
    const started = performance.now()
    await takeReviewPicture(page, viewport, shot, 'broken.png', directory)
    expect(performance.now() - started).toBeLessThan(3000)
    expect(shot.file).toBe('broken.png')
    expect(shot.error).toBeNull()
    expect(shot.notSettled).toMatch(/1 image.*1 failed to load or decode/)
  } finally { await page.close() }
}, 15_000)

it('a font held past the cap is still photographed and named, without a second fonts wait in the camera', async () => {
  const page = await ready('/font')
  try {
    page.setDefaultTimeout(1000)
    expect(await page.evaluate(() => document.fonts.status)).toBe('loading')
    const shot = emptyShot()
    const started = performance.now()
    await takeReviewPicture(page, viewport, shot, 'font.png', directory)
    expect(performance.now() - started).toBeLessThan(7000)
    expect(shot.file).toBe('font.png')
    expect(shot.error).toBeNull()
    expect(shot.notSettled).toContain('fonts')
  } finally { await page.close() }
}, 15_000)

it('at the cap the tool keeps the picture and names it not settled in its line and contact sheet', async () => {
  const page = await ready('/held')
  const said = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const shot = emptyShot()
    const started = performance.now()
    await takeReviewPicture(page, viewport, shot, 'held.png', directory)
    expect(performance.now() - started).toBeLessThan(7000)
    expect(shot.file).toBe('held.png')
    expect(shot.error).toBeNull()
    expect(shot.notSettled).toMatch(/1 image/)
    expect(said.mock.calls.flat().join('\n')).toMatch(/held.png.*not settled.*1 image/)
    // Read the tool's renderer, as the existing review tests read its other helpers.
    const render = runInNewContext(`(${/function contactSheet\([^]*?\n\}/.exec(source)?.[0]})`, {
      esc: (text: unknown) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      VIEWPORTS: [1440, 990, 660, 390], THEMES: ['light', 'dark'], LOOKS: { light: 'F', dark: 'H' },
    }) as (shots: unknown[], facts: object) => string
    expect(render([shot], {})).toMatch(/not settled[^]*1 image/)
  } finally { said.mockRestore(); await page.close() }
}, 15_000)
