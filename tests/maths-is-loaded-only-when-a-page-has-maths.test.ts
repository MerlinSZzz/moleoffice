// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * KATEX IS LOADED ONLY WHEN A PAGE HAS MATHS, AND ONLY FROM THE APP'S OWN SERVER.
 *
 * MathText draws with KaTeX, and KaTeX is a quarter of a megabyte of code, a stylesheet and a set of
 * fonts. A page with no maths on it should fetch none of that, so the drawing code is reached only
 * through a dynamic import in MathText, started the first time a formula is drawn. Mole Office runs on
 * the owner's own machine, which may have no internet, so what a page with maths fetches comes from
 * the app's own server and from nowhere else.
 *
 * TWO HALVES, as in tests/a-diagram-is-drawn-with-no-network.test.ts. The first reads the built app:
 * the files every page loads hold no KaTeX, and only the loader beside MathText imports it. The
 * second watches a browser open a report with no maths and then a report with maths, and then a
 * report with maths whose drawing code cannot be fetched.
 *
 * WHICH FILES ARE KATEX'S is read from what is in them, not from their names, which the build
 * chooses: its code says `KaTeX parse error` when it refuses something, its stylesheet declares the
 * `KaTeX_Main` font, and its fonts keep the names KaTeX gave them.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Request, Response } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import { THE_DRAWING_DID_NOT_LOAD } from '../src/web/components/MathText.tsx'
import { liveApp, THE_PAGE_BROWSER_TESTS_ARE_SERVED, waitForThePage, type LiveApp } from './helpers.ts'

const DIST = fileURLToPath(new URL('../dist/web', import.meta.url))
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const COMPONENTS = join(SRC, 'web', 'components')
const THE_LOADER = join(COMPONENTS, 'maths-drawing.ts')

const A_MARK_OF_KATEX_CODE = 'KaTeX parse error'
const A_MARK_OF_KATEX_STYLE = 'KaTeX_Main'
const A_KATEX_FONT = /^KaTeX_[A-Za-z0-9_-]+\.(woff2|woff|ttf)$/

type KatexPart = 'code' | 'style' | 'font'

/** Which part of KaTeX a built file is, or null when it is none. */
function katexPartOf(file: string): KatexPart | null {
  const name = file.split(sep).pop() ?? ''
  if (A_KATEX_FONT.test(name)) return 'font'
  if (name.endsWith('.js') && readFileSync(file, 'utf8').includes(A_MARK_OF_KATEX_CODE)) return 'code'
  if (name.endsWith('.css') && readFileSync(file, 'utf8').includes(A_MARK_OF_KATEX_STYLE)) return 'style'
  return null
}

function filesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full))
    else out.push(full)
  }
  return out
}

// ============================================================ half one: the built app

/**
 * WHICH BUILD THIS HALF READS, SAID WHEN IT IS MISSING. Only `vite build` writes dist/web, as the
 * second step of `npm run build`.
 */
const NO_BUILD = 'dist/web is not there. It is written by `vite build`, the second step of `npm run build`; run npm run build before this file'

/**
 * EVERY FILE THE PAGE LOADS BEFORE IT HAS DRAWN ANYTHING: what index.html names as a script, a
 * stylesheet or a preload, and every chunk those import statically, followed through the import
 * statements themselves. A dynamic `import(` is not followed, because that is the point of it.
 */
function whatEveryPageLoads(): string[] {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const named = new Set<string>()
  for (const m of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) named.add(m[1] ?? '')
  for (const m of html.matchAll(/<link[^>]*\bhref="([^"]+)"[^>]*>/g)) {
    if (/rel="(modulepreload|stylesheet|preload)"/.test(m[0])) named.add(m[1] ?? '')
  }
  const files = new Set<string>()
  const queue = [...named].filter((url) => !/^[a-z]+:/i.test(url)).map((url) => normalize(join(DIST, url.replace(/^\.?\//, ''))))
  while (queue.length > 0) {
    const file = queue.shift() as string
    if (files.has(file)) continue
    expect(existsSync(file), `index.html loads ${relative(DIST, file)}, which is not in the build`).toBe(true)
    files.add(file)
    if (!file.endsWith('.js')) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      queue.push(normalize(join(dirname(file), m[1] ?? '')))
    }
  }
  return [...files]
}

describe('the built app loads no KaTeX until it is asked for', () => {
  it('has a build to read at all, and one no older than MathText and its loader', () => {
    expect(existsSync(DIST), NO_BUILD).toBe(true)
    const built = filesUnder(DIST)
    expect(built.length, 'the build holds almost nothing').toBeGreaterThan(20)
    // A STALE BUILD IS THE ONE WAY THIS HALF LIES: a build made before the component changed answers
    // about code nobody is running, and a build that failed leaves the last good one in place.
    const newest = Math.max(...built.map((f) => statSync(f).mtimeMs))
    for (const source of [join(COMPONENTS, 'MathText.tsx'), THE_LOADER]) {
      expect(newest, `dist/web is older than ${relative(SRC, source)}, so this build is not the code under test`).toBeGreaterThanOrEqual(statSync(source).mtimeMs)
    }
  })

  it('holds KaTeX code, its stylesheet and its fonts, so the next case is about something that is there', () => {
    expect(existsSync(DIST), NO_BUILD).toBe(true)
    const parts = new Set(filesUnder(DIST).map(katexPartOf))
    expect([...parts].filter((p) => p !== null).sort()).toEqual(['code', 'font', 'style'])
  })

  it('loads none of it with index.html or anything index.html imports', () => {
    expect(existsSync(DIST), NO_BUILD).toBe(true)
    const first = whatEveryPageLoads()
    expect(first.filter((f) => f.endsWith('.js')).length, 'index.html loads no script at all').toBeGreaterThan(0)
    const katex = first.filter((f) => katexPartOf(f) !== null).map((f) => relative(DIST, f))
    expect(katex, 'every page loads KaTeX').toEqual([])
  })

  it('imports KaTeX and its stylesheet in one file only, the loader beside MathText', () => {
    const importers = filesUnder(SRC)
      .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f))
      .filter((f) => /(?:\bfrom\s*|\bimport\s*\(?\s*)["']katex(?:\/[^"']*)?["']/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f))
    expect(importers).toEqual([relative(SRC, THE_LOADER)])
  })
})

// ============================================================ half two: in a browser

/** A report with no maths in it, and one with maths both inside a sentence and as a maths block. */
const NO_MATHS = [{ id: 'b-1', type: 'text', heading: 'Words only', text: 'This report has no formula in it, only words.' }]
const SOME_MATHS = [
  { id: 'b-1', type: 'text', heading: 'Inside a sentence', text: 'The speed is $v = \\frac{d}{t}$ and the error stays below $\\epsilon \\le 0.1$.' },
  { id: 'b-2', type: 'math', tex: '\\sum_{i=1}^{n} \\bigl(x_i - \\bar x\\bigr)^2' },
]
const FORMULAS_IN_SOME_MATHS = 3

describe('in a browser, KaTeX is fetched only for a page with maths, and from its own server', () => {
  let app: LiveApp
  let page: Page
  let site: string
  let noMaths: string
  let someMaths: string
  const asked: string[] = []
  const answered = new Map<string, number>()
  let askedForNoMaths: string[] = []

  /** Which part of KaTeX an address on this test's page server is, or null. */
  const katexPartAt = (url: string): KatexPart | null => {
    if (!url.startsWith(`${site}/`)) {
      // Off this server, a file named as KaTeX's font is still KaTeX's, which the case below names.
      return A_KATEX_FONT.test(new URL(url).pathname.split('/').pop() ?? '') ? 'font' : null
    }
    const file = normalize(join(THE_PAGE_BROWSER_TESTS_ARE_SERVED, decodeURIComponent(new URL(url).pathname)))
    if (!file.startsWith(`${THE_PAGE_BROWSER_TESTS_ARE_SERVED}${sep}`) || !existsSync(file) || !statSync(file).isFile()) return null
    return katexPartOf(file)
  }

  const file = async (title: string, blocks: unknown[]): Promise<string> => {
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'report', title, summary: 'A made-up report, so what the page fetches can be counted.', data: { blocks } }),
    })
    if (!res.ok) throw new Error(`filing the report answered ${String(res.status)}: ${await res.text()}`)
    return ((await res.json()) as { record: { id: string } }).record.id
  }

  beforeAll(async () => {
    app = await liveApp({ opensAt: 'full', name: 'maths-loaded-when-needed', viewport: { width: 1440, height: 1000 } })
    page = app.page
    site = app.site
    page.on('request', (req: Request) => void asked.push(req.url()))
    page.on('response', (res: Response) => void answered.set(res.url(), res.status()))
    noMaths = await file('A report with words only', NO_MATHS)
    someMaths = await file('A report with three formulas', SOME_MATHS)

    await page.goto(`${site}/#/r/${noMaths}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.getByText('only words').waitFor({ timeout: 60_000 })
    // THE IMPORT WOULD START IN THE RENDER THAT DREW THE WORDS, so its request would be asked for
    // in the same moment. One second past the words being there covers it with room to spare.
    await page.waitForTimeout(1000)
    askedForNoMaths = [...asked]

    await page.goto(`${site}/#/r/${someMaths}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.katex').nth(FORMULAS_IN_SOME_MATHS - 1).waitFor({ timeout: 60_000 })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('asked for no KaTeX file while it showed a report with no maths', () => {
    expect(askedForNoMaths.some((url) => url.startsWith(`${site}/`)), 'the page asked its server for nothing').toBe(true)
    expect(askedForNoMaths.filter((url) => katexPartAt(url) !== null)).toEqual([])
  })

  it("asked for KaTeX's code, stylesheet and fonts for a report with maths, every one from its own server", () => {
    const katex = asked.filter((url) => katexPartAt(url) !== null)
    expect([...new Set(katex.map(katexPartAt))].sort()).toEqual(['code', 'font', 'style'])
    expect(katex.filter((url) => !url.startsWith(`${site}/`)), 'KaTeX came from somewhere else').toEqual([])
    expect(katex.filter((url) => answered.get(url) !== 200), 'a KaTeX file was not answered 200').toEqual([])
  })

  it("drew every formula with KaTeX and KaTeX's own fonts, and no marked box", async () => {
    expect(await page.locator('.katex').count()).toBe(FORMULAS_IN_SOME_MATHS)
    expect(await page.getByText(t('pageWords.MathText.001')).count()).toBe(0)
    const loaded = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')),
    )
    expect(loaded).toEqual(expect.arrayContaining(['KaTeX_Main', 'KaTeX_Math']))
  })

  it('asked nothing of any address but its own two servers', () => {
    const mine = [site, app.api]
    const away = asked.filter((url) => !mine.some((where) => url.startsWith(`${where}/`)))
    expect(away, `the page went off this machine for ${away.join(', ')}`).toEqual([])
  })

  it('shows every formula in the marked box, saying the drawing code did not load, when it cannot be fetched', async () => {
    const other = await app.context.newPage()
    try {
      await other.route((url) => katexPartAt(url.href) === 'code', (route) => route.abort())
      await other.goto(`${site}/#/r/${someMaths}`, { timeout: 60_000 })
      await waitForThePage(other, 60_000)
      const boxes = other.getByText(t('pageWords.MathText.001'))
      await boxes.nth(FORMULAS_IN_SOME_MATHS - 1).waitFor({ timeout: 60_000 })
      expect(await boxes.count()).toBe(FORMULAS_IN_SOME_MATHS)
      expect(await other.locator('.katex').count()).toBe(0)
      const reasons = await other.locator('.mt-unsupported-why').allTextContents()
      expect(reasons).toHaveLength(FORMULAS_IN_SOME_MATHS)
      for (const reason of reasons) expect(reason.startsWith(`${THE_DRAWING_DID_NOT_LOAD}: `), reason).toBe(true)
      expect(await other.locator('.mt-unsupported-src').allTextContents()).toEqual(['v = \\frac{d}{t}', '\\epsilon \\le 0.1', '\\sum_{i=1}^{n} \\bigl(x_i - \\bar x\\bigr)^2'])
    } finally {
      await other.close()
    }
  }, 120_000)
})
