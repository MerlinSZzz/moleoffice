// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NINE PICTURES IN THE OWNER REVIEW PACKAGE, taken from the running product.
 *
 * `design/**\/*.png` is gitignored on purpose — this repository generates a lot of pictures and none
 * of them is source. So the package's pictures are not committed; this script is, and it rebuilds
 * them from whatever the product is today. A picture in a document nobody can regenerate is a claim
 * about a version that may no longer exist.
 *
 * WHAT IT IS NOT. `tools/review.mjs` photographs EVERY page at both widths in both themes and runs
 * three proofs over the result; it is the tool that catches layout defects and it is what you run
 * while building. This one takes nine specific pictures, in the order `design/OWNER-REVIEW.md`
 * walks through them, and asserts only what a reader would notice: no console error, and no page
 * that scrolls sideways.
 *
 *     npm run dev            # in another terminal
 *     node tools/owner-review-shots.mjs
 *
 * It writes into `design/owner-review/` and prints one line per picture. A non-zero exit means a
 * page errored or overflowed, and the package should not be handed over until that is fixed.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'

const OUT = 'design/owner-review'
const WEB = whereIsTheWebApp()

/**
 * Which project and which theme each picture is taken in.
 *
 * Both are read from localStorage by the app itself — the workspace under `mole-office.workspace` and
 * the theme under `mole-office.preset.theme` — so this sets them the way the app stores them rather than
 * driving the menus. The period is fixed at 2026-W33 because that is the week Mole Office's own campaign
 * is planned into, and a picture of an empty week would show nothing about planning.
 */
const SHOTS = [
  { file: '01-home-decisions.png', hash: '#/', ws: 'panelx', w: 1440, h: 1250, theme: 'light' },
  { file: '02-home-dark.png', hash: '#/', ws: 'panelx', w: 1440, h: 1250, theme: 'dark' },
  { file: '03-home-phone.png', hash: '#/', ws: 'panelx', w: 390, h: 1100, theme: 'light' },
  { file: '04-plan-week.png', hash: '#/plan/2026-W33', ws: 'panelx', w: 1440, h: 1500, theme: 'light' },
  { file: '05-plan-month.png', hash: '#/plan/2026-08', ws: 'panelx', w: 1440, h: 1400, theme: 'light' },
  { file: '06-plan-phone-dark.png', hash: '#/plan/2026-W33', ws: 'panelx', w: 390, h: 1100, theme: 'dark' },
  { file: '07-queries.png', hash: '#/queries', ws: 'panelx', w: 1440, h: 1250, theme: 'light' },
  { file: '08-modules.png', hash: '#/modules', ws: 'greenhouse', w: 1440, h: 1100, theme: 'light' },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let bad = 0

for (const shot of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: shot.w, height: shot.h } })
  await ctx.addInitScript(([ws, theme]) => {
    window.localStorage.setItem('mole-office.workspace', ws)
    window.localStorage.setItem('mole-office.preset.theme', theme)
  }, [shot.ws, shot.theme])
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${WEB}/${shot.hash}`)
  await waitForThePage(page)
  // The plan page draws a graph after its own fetch and a layout pass; a picture taken before that
  // shows "working out where everything goes", which is true and useless in a review package.
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  await page.screenshot({ path: `${OUT}/${shot.file}` })
  if (errors.length > 0 || overflow) bad += 1
  console.log(
    `${shot.file.padEnd(26)} ${String(shot.w).padStart(4)}px ${shot.theme.padEnd(5)} ` +
      `${overflow ? 'SCROLLS SIDEWAYS' : 'fits'} ${errors.length === 0 ? '' : `· ${errors.length} console error(s): ${errors[0]}`}`,
  )
  await ctx.close()
}

/**
 * The ninth picture is a JOURNEY rather than a page, and that is the point of it: the owner's
 * standing rule is that a required human action must be reachable without hunting an id, so the
 * picture has to be taken by clicking from Home rather than by opening the record's address.
 */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
await ctx.addInitScript(() => {
  window.localStorage.setItem('mole-office.workspace', 'panelx')
  window.localStorage.setItem('mole-office.preset.theme', 'light')
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
await page.goto(`${WEB}/#/`)
await waitForThePage(page)
await page.waitForTimeout(2000)
const review = page.locator('button:has-text("Review")')
const forks = await review.count()
if (forks === 0) {
  console.log('09-fork-and-changeset.png  SKIPPED — no fork is waiting, so there is nothing to photograph')
} else {
  // The fork carrying a change set, which is the one worth a picture: the delta is what makes
  // "human approval" mean something more than a button.
  const carrying = page.locator('text=would mean as project structure').first()
  const index = (await carrying.count()) > 0 ? forks - 1 : 0
  await review.nth(index).click()
  await page.waitForTimeout(2500)
  const text = await page.evaluate(() => document.body.innerText)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  await page.screenshot({ path: `${OUT}/09-fork-and-changeset.png` })
  const carriesDelta = text.includes('change set') || text.includes('CREATE RECORD')
  if (errors.length > 0 || overflow || !carriesDelta) bad += 1
  console.log(
    `09-fork-and-changeset.png  1440px light ${overflow ? 'SCROLLS SIDEWAYS' : 'fits'} · ` +
      `${carriesDelta ? 'the change set is on the page' : 'NO CHANGE SET ON THE PAGE'}` +
      `${errors.length === 0 ? '' : ` · ${errors.length} console error(s)`}`,
  )
}
await ctx.close()
await browser.close()

console.log(bad === 0 ? '\nall pictures fit and nothing errored' : `\n${bad} picture(s) have a problem above`)
process.exit(bad === 0 ? 0 : 1)
