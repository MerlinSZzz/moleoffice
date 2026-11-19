// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PICTURES FOR THE UX REVIEW, taken from the running product.
 *
 *     npm run dev            # in another terminal
 *     node tools/ux-review-shots.mjs
 *
 * Twelve pictures: ten taken at an address, in the order `design/OWNER-REVIEW-UX.md` walks through
 * them, and two reached by clicking from Home because the page they show has no address.
 *
 * WHY IT IS NOT tools/review.mjs. That one photographs EVERY page at both widths in both themes and
 * runs three proofs over the result; it is what catches layout defects while building, and it seeds
 * its own throwaway database so the pictures never change. This one runs against the REAL corpus,
 * because the question the owner is being asked is whether the product works on their own data, and
 * a fixture week with tidy numbers cannot answer it.
 *
 * WHY IT IS NOT tools/owner-review-shots.mjs. That is the previous gate's package and is left alone
 * so the document it belongs to still regenerates.
 *
 * It asserts only what a reader would notice: no console error, and no page that scrolls sideways.
 * `design/**\/*.png` is gitignored — no picture in this repository is source, and every one of them
 * is rebuilt from the tool beside it.
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'

const OUT = 'design/ux-review'
const WEB = whereIsTheWebApp()

/**
 * Each picture names the address, the project it is taken in, and the size.
 *
 * `mode` goes in the QUERY STRING, before the hash, which is how src/web/lib/mode.ts reads it. That
 * is the whole reason the override exists: a picture can name the detail level it shows instead of
 * describing which buttons to press to reach it, and the override is never saved, so taking a
 * picture never changes what the next reader sees.
 *
 * THERE WAS A SECOND OVERRIDE, `ux`, AND IT IS GONE. It picked one of two designs for a surface
 * while the designs were being compared. Every question it asked has been answered, the losing designs
 * and the registry that held them are deleted, and an address naming one now draws the one design
 * there is.
 */
const SHOTS = [
  // HOME HAS ONE DECISION VIEW NOW. There were three pictures here, one per design the owner was
  // comparing; the question they were asking has been answered, and the two losing components were
  // deleted. The numbers of the pictures after this one are unchanged, because the review document
  // refers to them by number.
  { file: '01-home.png', at: '#/', ws: 'panelx', w: 1440, h: 1200 },
  { file: '02-decisions.png', at: '#/decisions', ws: 'panelx', w: 1440, h: 1200 },
  // 03 AND 04 WERE THE WEEK'S TWO DESIGNS, DIRECT AND GUIDED, AND BOTH ARE GONE FROM THIS LIST.
  // Direct won and Guided is deleted, so 04 would have been the direct week under a filename saying
  // guided — a picture that lies about itself. 03 would have been the same week as picture 13, at
  // the same address and the same size. The week is 13 and 14 now, reading and editing.
  { file: '05-plan-today.png', at: '#/plan/today', ws: 'panelx', w: 1440, h: 1000 },
  { file: '06-work.png', at: '#/work', ws: 'greenhouse', w: 1440, h: 1000 },
  { file: '07-findings.png', at: '#/findings', ws: 'panelx', w: 1440, h: 1000 },
  // THE TWO STAGES, SIDE BY SIDE, WHICH IS THE WHOLE OF THIS ROUND. Planning is writing and
  // scheduling is giving hours, and the owner should be able to see that from two pictures without
  // reading a sentence. The plans page carries no hours box anywhere and the schedule carries no
  // writing box anywhere.
  //
  // 12 IS THE EMPTY SCREEN AND THAT IS DELIBERATE. This installation holds no plan, because a plan
  // is the owner's own writing and nothing should invent one in their corpus to make a picture look
  // fuller. The empty screen is also the first thing any stranger meets, so it is worth seeing.
  // A plan with words in it is photographed by tools/review.mjs against its own throwaway database.
  { file: '12-plans.png', at: '#/plans', ws: 'panelx', w: 1440, h: 1000 },
  // 13 AND 14 ARE ONE PAGE IN ITS TWO STATES: what you get when you arrive, and what you get after
  // pressing Edit. The claim is that arriving shows no boxes at all.
  { file: '13-week-reading.png', at: '#/plan/2026-W33', ws: 'panelx', w: 1440, h: 1200 },
  { file: '14-week-editing.png', at: '#/plan/2026-W33/edit', ws: 'panelx', w: 1440, h: 1200 },
  { file: '08-home-phone.png', at: '#/', ws: 'panelx', w: 390, h: 1100 },
  { file: '09-home-dark.png', at: '#/', ws: 'panelx', w: 1440, h: 1200, theme: 'dark' },
]

/**
 * The proposal page is a JOURNEY rather than an address, and that is the point of it: the owner's
 * standing rule is that a required human action must be reachable without hunting an id, so the
 * picture has to be taken by clicking from Home. Two of them — one in each mode — because the
 * Normal/Inspect split is the thing this pass added and a picture of one half proves nothing.
 */
const JOURNEY = [
  { file: '10-decision.png', mode: 'normal' },
  { file: '11-decision-inspect.png', mode: 'inspect' },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let bad = 0

/** One context with the project and theme already remembered, exactly as the app stores them. */
async function open(shot) {
  const ctx = await browser.newContext({ viewport: { width: shot.w ?? 1440, height: shot.h ?? 1000 } })
  await ctx.addInitScript(
    ([ws, theme]) => {
      window.localStorage.setItem('mole-office.workspace', ws)
      window.localStorage.setItem('mole-office.preset.theme', theme)
    },
    [shot.ws ?? 'panelx', shot.theme ?? 'light'],
  )
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return { ctx, page, errors }
}

function report(file, page, errors, overflow, extra = '') {
  const ok = errors.length === 0 && !overflow
  if (!ok) bad += 1
  console.log(
    `${file.padEnd(26)} ${overflow ? 'SCROLLS SIDEWAYS' : 'fits'}${extra}` +
      `${errors.length === 0 ? '' : ` · ${errors.length} console error(s): ${errors[0]}`}`,
  )
}

for (const shot of SHOTS) {
  const { ctx, page, errors } = await open(shot)
  const query = shot.mode ? `mode=${shot.mode}` : ''
  await page.goto(`${WEB}/${query === '' ? '' : `?${query}`}${shot.at}`)
  await waitForThePage(page)
  // The plan page draws a graph after its own fetch and a layout pass; a picture taken before that
  // shows "working out where everything goes", which is true and useless in a review package.
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  await page.screenshot({ path: `${OUT}/${shot.file}` })
  report(shot.file, page, errors, overflow)
  await ctx.close()
}

for (const shot of JOURNEY) {
  const { ctx, page, errors } = await open({ ws: 'panelx', w: 1440, h: 1400 })
  await page.goto(`${WEB}/?mode=${shot.mode}#/`)
  await waitForThePage(page)
  await page.waitForTimeout(2000)
  // THE DECISION BAND'S OWN CONTROL, BY ITS OWN CLASS.
  //
  // This used to match /review|open|decide|settle/ over every button and link in `main`, which was
  // loose enough to hit the word "open" somewhere else on the page: the journey clicked through to
  // the catalogue and then reported that a decision page had no options on it. The tool was wrong,
  // not the product, and it said so in a way that read like a regression.
  //
  // It is also a different journey now. Pressing "Decide it" no longer goes anywhere — the owner
  // asked for the choices to open where the decision is listed, so the whole point is that the
  // address does not change. That is what this asserts.
  const act = page.locator('main .dq-decide-sum').locator('visible=true')
  const found = await act.count()
  if (found === 0) {
    console.log(`${shot.file.padEnd(26)} SKIPPED — nothing on Home opens a decision, so there is nothing to photograph`)
    bad += 1
    await ctx.close()
    continue
  }
  const before = await page.evaluate(() => window.location.hash)
  await act.first().click()
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => window.location.hash)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  const text = await page.evaluate(() => document.body.innerText)
  await page.screenshot({ path: `${OUT}/${shot.file}` })
  // Two claims, and the second is the one this round added. The choices are on the screen, and
  // getting to them did not take the reader off the page they started on.
  const readsAsADecision = /option/i.test(text)
  const stayedPut = before === after
  if (!readsAsADecision || !stayedPut) bad += 1
  const note =
    (readsAsADecision ? '' : ' · NO OPTIONS ON THE PAGE') +
    (stayedPut ? '' : ` · LEFT HOME (${before} -> ${after}), and deciding here is meant to stay put`)
  report(shot.file, page, errors, overflow, note)
  await ctx.close()
}

await browser.close()
console.log(bad === 0 ? `\nall ${SHOTS.length + JOURNEY.length} pictures fit and nothing errored` : `\n${bad} picture(s) have a problem above`)
process.exit(bad === 0 ? 0 : 1)
