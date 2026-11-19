// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE REPORT, PHOTOGRAPHED AT EVERY READING LENGTH, so the ladder can be looked at rather than
 * counted. Usage: node tools/shot-levels.mjs <recordId> [width] [theme] [rung ...]
 */
import { chromium } from 'playwright'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { settingValue } from '../src/config/settings.mjs'
// WHICH INSTANCE IS PHOTOGRAPHED, AND NOT ALWAYS THE ONE ON THE USUAL PORT. It was the literal
// 5173 until 3 September 2026, so an agent working in a worktree against a copy of the database had
// no way to photograph its own server without editing this file — and the safe thing it would have
// photographed by mistake is the owner's live one. `MOLE_OFFICE_URL` is the same name the sweep
// already reads, and `MOLE_OFFICE_SHOTS` says where the pictures go.
const BASE = whereIsTheWebApp()
const SHOTS = settingValue('MOLE_OFFICE_SHOTS')
const PICTURES = settingValue('MOLE_OFFICE_PICTURES')
const id = process.argv[2] ?? 'OOOt4Kouc5dT'
const width = Number(process.argv[4] ?? 1440)
const theme = process.argv[3] ?? 'light'
// THE SEVEN POSITIONS, READ OFF THE DECLARATION. It was a copied list of six, missing one of the
// lengths the product had; a copy is how an instrument comes to photograph a ladder nobody has.
const { RUNGS, READER_RUNGS, isReaderRung } = await import('../src/shared/detail.ts')
const rungs = process.argv.length > 5 ? process.argv.slice(5) : READER_RUNGS
// IT REFUSES A POSITION A REPORT PAGE DOES NOT DRAW, RATHER THAN PHOTOGRAPHING ANOTHER ONE.
//
// Criterion A19, from 3 September 2026: a reader goes no lower than the
// conclusion, so asking a report page for level 1 or 2 draws the conclusion. This tool names its
// files after the position it asked for, so without this it would write lvl-<id>-label-1440.png
// holding a picture of the conclusion — a file somebody reads later as evidence about a level it
// is not about. The default is the five a report page draws; naming one of the other two is an
// error and says what to do instead.
const unreachable = [...rungs].filter((r) => !isReaderRung(r))
if (unreachable.length > 0) {
  throw new Error(
    `a report page does not draw ${unreachable.join(', ')}: a reader goes no lower than the ` +
      `conclusion (criterion A19), so the page would draw the conclusion and this would name the ` +
      `picture after a level it is not of. The five it does draw are ${[...READER_RUNGS].join(', ')}. ` +
      `What is stored at ${unreachable.join(' and ')} is on GET /api/records/<id>/short-forms, and ` +
      `tools/zoom-sweep.mjs reads it from there.`,
  )
}
void RUNGS
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width, height: 1200 }, colorScheme: theme })
// WHETHER THE PICTURES ARE DRAWN IS A SECOND DIMENSION and it has to be settable, because at
// reading levels 5 and 6 a part's charts and pictures are drawn only when it is on.
await ctx.addInitScript((on) => { window.localStorage.setItem('mole-office.pictures', on) }, PICTURES)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(String(e)))
for (const r of rungs) {
  await p.goto(`${BASE}/#/r/${id}`, { waitUntil: 'domcontentloaded' })
  await p.evaluate((x) => window.localStorage.setItem('mole-office.detail', x), r)
  await p.reload({ waitUntil: 'load' })
  await p.waitForSelector('.rd-report')
  await p.waitForTimeout(600)
  const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  await p.screenshot({ path: `${SHOTS}/lvl-${id}-${r}-${width}-${theme}.png`, fullPage: true })
  console.log(`${r} ${width} ${theme} horizontal-overflow=${over}`)
}
await b.close()
if (errs.length) console.error('PAGE ERRORS:', errs.slice(0, 8))
