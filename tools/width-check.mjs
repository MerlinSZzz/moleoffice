// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MEASURE THE REPORT'S WIDTHS AND PHOTOGRAPH IT.
 *
 * Opens one record page in the panelx project at the widths given, reads the drawn width of the
 * page, the report body, every passage and the first paragraph, and writes a picture.
 *
 *   node tools/width-check.mjs <label> <recordId> [width,width]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { whereIsTheWebApp } from './where-is-the-api.mjs'

const label = process.argv[2]
const recordId = process.argv[3]
// Missing names would write undefined pictures or open the wrong page (problem ycuCb5UvwVXg).
if (!label || !recordId) {
  console.error('Give a label and a record id: node tools/width-check.mjs <label> <recordId> [width,width]')
  process.exit(2)
}
const widths = (process.argv[4] ?? '1440,390').split(',').map(Number)
const base = process.argv[5] ?? whereIsTheWebApp()
// Pictures belong to this checkout, wherever the tool runs (problem ycuCb5UvwVXg).
const OUT = fileURLToPath(new URL('../design/round-eleven/wave-a/width-shots/', import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => {
    window.localStorage.setItem('mole-office.workspace', 'panelx')
    window.localStorage.setItem('mole-office.mode', 'normal')
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}/#/r/${recordId}`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForSelector('.sb-block', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const seen = await page.evaluate(() => {
    const w = (el) => (el === null ? null : Math.round(el.getBoundingClientRect().width))
    const all = (sel) => [...document.querySelectorAll(sel)].map((el) => Math.round(el.getBoundingClientRect().width))
    const uniq = (xs) => [...new Set(xs)].sort((a, b) => a - b)
    return {
      window: window.innerWidth,
      page: w(document.querySelector('.page')),
      fit: w(document.querySelector('.sb-fit')),
      body: w(document.querySelector('.sb-reads')),
      firstParagraph: w(document.querySelector('.sb-p')),
      paragraphs: uniq(all('.sb-p')),
      passages: uniq(all('.sb-text')),
      sections: uniq(all('.sb-section')),
      tables: uniq(all('.sb-block.sb-table')),
      callouts: uniq(all('.sb-callout')),
      lists: uniq(all('.sb-block.sb-list')),
      findings: uniq(all('.sb-finding')),
      code: uniq(all('.sb-code-fig')),
      images: uniq(all('.sb-block.sb-image')),
      columns: uniq(all('.sb-columns')),
      scrollWidth: document.documentElement.scrollWidth,
      blocks: document.querySelectorAll('.sb-block').length,
    }
  })
  const file = `${OUT}/${label}-${width}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(`${label} @${width}  ${JSON.stringify(seen)}`)
  if (errors.length) console.error(`  page errors:`, errors.slice(0, 3))
  console.log(`  wrote ${file}`)
  await ctx.close()
}
await browser.close()
