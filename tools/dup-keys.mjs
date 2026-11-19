// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// EVERY RECORD PAGE IN A PROJECT, at one reading length: how many data-target elements, and which
// REGION keys appear on more than one element (criterion B3 of design/pointing-reopened/ACCEPTANCE.md).
// Folds are left as the page draws them; tools/region-dups.mjs opens every fold on a chosen set of
// pages instead. Writes nothing.
// usage: MOLE_OFFICE_API=… MOLE_OFFICE_URL=… [MOLE_OFFICE_WORKSPACE=panelx] [ONLY_KINDS=report,module] node tools/dup-keys.mjs [full|brief|…] [out.json]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { whereIsTheApi, whereIsTheWebApp, whichWorkspace } from './where-is-the-api.mjs'
import { refuseAStaleWorld } from './freshness.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
const API = whereIsTheApi()
const BASE = whereIsTheWebApp(undefined, { ifUnset: 'http://127.0.0.1:5199' })
// THE NAME THE REST OF MOLE OFFICE USES FOR THIS, AND THE ONE .env.example DOCUMENTS. It used to be
// spelt with WS in place of WORKSPACE, which is a second name for one setting. tests/config.test.ts
// said so out loud -- every setting name the code reads has to be in the template, and that spelling
// never was. Renamed 2 September 2026; nothing but this file had ever read the old one.
const WS = whichWorkspace()
const rung = process.argv[2] ?? 'full'
const OUT = process.argv[3] ?? `dup-keys-${rung}.json`
// THIS READS EVERY KIND OF RECORD PAGE, AND ONLY REPORT PAGES HAVE A FLOOR. Criterion A19, the
// owner's decision of 3 September 2026: a reader goes no lower than the conclusion. A module page
// or a list still draws the label, so a census at level 1 is still worth taking — but the report
// pages in it were read at the conclusion, and that goes on the census rather than being left for
// somebody to work out. It is a warning and not a refusal, because most of the run is still true.
const { READER_FLOOR, isReaderRung } = await import('../src/shared/detail.ts')
const reportsDrewInstead = isReaderRung(rung) ? null : READER_FLOOR
if (reportsDrewInstead !== null) {
  process.stderr.write(
    `dup-keys: asked for ${rung}; report pages do not draw it and were read at ${reportsDrewInstead} ` +
      `(criterion A19). Every other kind of page was read at ${rung}.\n`,
  )
}
// The caller's own key and name when it holds a key; 'claude-code/dup-keys-census' when it holds none.
const H = { 'x-mole-office-workspace': WS, ...anAgentsToolHeaders({ withoutAKey: 'claude-code/dup-keys-census' }), 'x-mole-office-session': 'sb5lkfnwYiux', 'x-mole-office-trace': 'pointing-census', 'x-mole-office-purpose': 'module-work' }
// REFUSE TO MEASURE A STALE WORLD, BEFORE ANYTHING IS MEASURED. Criterion G6 of
// design/ground/ACCEPTANCE.md. Two whole gate runs were invalidated by a browser serving a
// seven-hour-old transform of src/shared and nothing said the code was old; a live API served stale
// code through an entire gate. A sweep of a stale world produces numbers that look like
// measurements and are measurements of code nobody has any more. tools/freshness.mjs asks the
// server, because only the server knows what it loaded.
await refuseAStaleWorld(API, 'tools/dup-keys.mjs')

const kinds = Object.keys((await (await fetch(`${API}/api/project/bootstrap`, { headers: H })).json()).project.byKind)
const records = []
for (const kind of kinds) {
  const listed = await (await fetch(`${API}/api/records?kind=${kind}`, { headers: H })).json()
  for (const r of (listed.records ?? listed.rows ?? [])) records.push({ id: r.id, kind: r.kind ?? kind })
}
const ONLY = process.env.ONLY_KINDS ? process.env.ONLY_KINDS.split(',') : null
const chosen = ONLY === null ? records : records.filter((r) => ONLY.includes(r.kind))
process.stderr.write(`${chosen.length} record pages of ${records.length}\n`)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: 'light' })
await ctx.addInitScript(({ r, ws }) => { window.localStorage.setItem('mole-office.workspace', ws); window.localStorage.setItem('mole-office.detail', r); window.localStorage.setItem('mole-office.pictures', 'drawn') }, { r: rung, ws: WS })
const page = await ctx.newPage()
const rows = []
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
for (const r of chosen) {
  try {
    await page.goto(`${BASE}/#/r/${r.id}`, { waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('main', { timeout: 20000 })
    await page.waitForTimeout(900)
    const seen = await page.evaluate(() => {
      const keys = [...document.querySelectorAll('[data-target]')].map((el) => el.getAttribute('data-target'))
      const count = new Map()
      for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1)
      const dupRegions = [...count].filter(([k, n]) => n > 1 && k.startsWith('region/')).map(([k, n]) => `${k} x${n}`)
      const dupOther = [...count].filter(([k, n]) => n > 1 && !k.startsWith('region/') && !k.startsWith('record/')).map(([k, n]) => `${k} x${n}`)
      return { targets: keys.length, dupRegions, dupOther }
    })
    rows.push({ id: r.id, kind: r.kind, ...seen })
    if (seen.dupRegions.length > 0) process.stderr.write(`${r.kind} ${r.id} dupRegions=${seen.dupRegions.join(' | ')}\n`)
  } catch (e) {
    rows.push({ id: r.id, kind: r.kind, error: String(e).slice(0, 160) })
    process.stderr.write(`${r.kind} ${r.id} ERROR ${String(e).slice(0, 80)}\n`)
  }
}
await browser.close()
writeFileSync(OUT, JSON.stringify({ rung, reportsDrewInstead, errs, rows }, null, 1))
const withDup = rows.filter((x) => x.dupRegions && x.dupRegions.length > 0).length
console.log(`pages=${rows.length} withDuplicatedRegionKeys=${withDup} errors=${rows.filter((x) => x.error).length} pageErrors=${errs.length}`)
