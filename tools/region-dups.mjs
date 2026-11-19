// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// EVERY REGION KEY DRAWN TWICE ON A RECORD PAGE, over as many pages as you hand it.
//
// Criterion B3 of design/pointing-reopened/ACCEPTANCE.md: no record page carries two elements with
// the same region key. This loads each page, opens every fold — a row inside a shut fold still
// carries a key and `document.querySelector` still finds it — and lists the region keys drawn more
// than once. It presses nothing, so it is much faster than the press census.
//
// usage: MOLE_OFFICE_URL=http://127.0.0.1:<web port> MOLE_OFFICE_WORKSPACE=<ws> \
//        node region-dups.mjs <out.json> <recordId> [<recordId> ...]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { whereIsTheWebApp, whichWorkspace } from './where-is-the-api.mjs'

const BASE = whereIsTheWebApp(undefined, { ifUnset: 'http://127.0.0.1:5199' })
const WORKSPACE = whichWorkspace()
const OUT = process.argv[2]
const IDS = process.argv.slice(3)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: 'light' })
await ctx.addInitScript((ws) => {
  window.localStorage.setItem('mole-office.workspace', ws)
  window.localStorage.setItem('mole-office.detail', 'full')
  window.localStorage.setItem('mole-office.pictures', 'drawn')
}, WORKSPACE)
const page = await ctx.newPage()
const writes = []
page.on('request', (r) => { if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`) })

const pages = []
for (const id of IDS) {
  await page.goto(`${BASE}/#/r/${id}`, { waitUntil: 'load', timeout: 60000 })
  await page.waitForSelector('.rd-report, .rd, main', { timeout: 30000 })
  // THE RECORD'S OWN CONTENT, NOT JUST THE SHELL. See the note in press-census.mjs: `main` is drawn
  // before the record is fetched, and a page counted then has no regions in it to be duplicated.
  await page.waitForSelector('[data-target^="region/"]', { timeout: 30000 })
  await page.waitForTimeout(700)
  await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true })
  await page.waitForTimeout(400)
  const found = await page.evaluate(() => {
    const byKey = new Map()
    for (const el of document.querySelectorAll('[data-target]')) {
      const key = el.getAttribute('data-target')
      byKey.set(key, (byKey.get(key) ?? 0) + 1)
    }
    const kind = document.querySelector('.rp-kind')?.textContent?.trim() ?? null
    const regions = [...byKey].filter(([k, n]) => k.startsWith('region/') && n > 1)
    const sections = regions.filter(([k]) => decodeURIComponent(k).includes('/section.'))
    return {
      kind,
      elements: byKey.size,
      dupRegions: regions.map(([k, n]) => ({ key: decodeURIComponent(k), drawn: n })),
      dupSections: sections.map(([k, n]) => ({ key: decodeURIComponent(k), drawn: n })),
    }
  })
  pages.push({ id, ...found })
  process.stderr.write(
    `${id.padEnd(14)} ${String(found.kind ?? '?').padEnd(18)} dupRegions=${String(found.dupRegions.length).padEnd(3)} dupSections=${String(found.dupSections.length)}\n`,
  )
}
await browser.close()
writeFileSync(OUT, JSON.stringify({ pages, writes }, null, 2))
const dupSections = pages.reduce((n, p) => n + p.dupSections.length, 0)
const dupRegions = pages.reduce((n, p) => n + p.dupRegions.length, 0)
const pagesWithSection = pages.filter((p) => p.dupSections.length > 0).length
console.log(
  `pages=${pages.length} pagesWithADuplicatedSection=${pagesWithSection} duplicatedSectionKeys=${dupSections} duplicatedRegionKeys=${dupRegions} writes=${writes.length}`,
)
