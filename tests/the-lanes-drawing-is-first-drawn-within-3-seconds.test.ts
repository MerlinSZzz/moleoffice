// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S LANES DRAWING IS FIRST DRAWN WITHIN 3 SECONDS OF THE END OF THE LOADING SCREEN, ON A MADE-UP REEL PAGE
 * AND ON A MADE-UP MASTER OF 54 BOXES, AT 1440, IN A PRODUCTION BUILD. Wave 13u round 231, PV-R2: the pipeline
 * drawing's first drawing in under 3 seconds.
 *
 * WHY. On round 230's made-up office copy, on 16 November 2026 at main 98fa95452, the reel's page took 12.5, 11.1,
 * 10.9, 11.1 and 11.0 s to draw from asking for the page, in five fresh opens of the production build at 1440. Each
 * open chose one plan, at one card width, in one long task of about 10 s. Most of that task was spent routing lines,
 * in routeAll in src/web/components/graph/lanes/engine.ts.
 *
 * WHAT IS TIMED. Each open is timed twice. The first time, ms, is from asking for the page to the last data-fit of
 * the drawing the page keeps, and it includes the loading screen. The second time, ownMs, is from the end of the
 * loading screen to the same last data-fit, and it is the page's own time. Before the app renders, src/web/main.tsx
 * waits for window.moleBoot.finish(), which plays the loading mole's end frames, about 590 ms. Those frames are the
 * person's design and stay, so the 3 s bound applies to ownMs, not to ms. Each case prints both numbers and both
 * medians, and only the median of ownMs is asserted.
 *
 * THE OFFICE AND THE PAGE are those of tests/the-lanes-drawing-draws-every-link-of-a-reel-page-and-a-master-of-54-boxes.test.ts,
 * which the suite runs and which says what the two drawings are. tests/a-made-up-reel-page-and-master-opened-fresh.ts
 * says how an open is made, timed and read.
 *
 * IT IS TO RUN ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says. Its control and its mutations are run by name before it is put on that list, and
 * their dates, numbers and loads are written here when it is.
 *
 * WHAT IS PROVED, case by case, for the reel page and for the master, in 5 fresh opens each:
 *   - the areas of that pipeline were stored;
 *   - every open is whole, as the file beside it proves for one open, because the time of a drawing that leaves a
 *     link or a card out does not count;
 *   - the median of the 5 page's own times, from the end of the loading screen, is under 3,000 ms.
 * Each case prints its five times from asking for the page, its five page's own times from the end of the loading
 * screen, both medians, the one-minute load at each open, how many drawings began and how many plans were chosen, the
 * fit, and how many cards and links were drawn. In the timing group it also writes that line to the results file the
 * group names.
 *
 * THE OLD CODE, at main 98fa95452, timed from asking for the page by this method with a script outside the repository
 * on 16 November 2026, in a throwaway office holding the same two files:
 *   - the reel page: 11,737, 11,023, 11,999, 11,317 and 11,378 ms, median 11,378 ms, at a one-minute load of 9.1 to
 *     10.4;
 *   - the master: 6,317, 6,276, 6,373, 7,062 and 6,265 ms, median 6,317 ms, at a load of 10.0 to 12.4.
 * In every open one drawing began and one plan was chosen, at one card width.
 *
 * AT THE ROUND'S TIP, this file was run by name with tools/run-named-tests.mjs before it was put on the list: on 17
 * November 2026 from 04:54:08, on the join branch w13u-pv3-speed-r231-join at c7a12db44, in a production build:
 *   - the reel page: 8,111, 6,661, 6,572, 6,721 and 6,456 ms, median 6,661 ms, at a one-minute load of 9.65 to
 *     11.11;
 *   - the master: 3,952, 3,804, 3,913, 3,923 and 3,824 ms, median 3,913 ms, at a load of 8.81 to 9.42.
 * Every time above is from asking for the page, because that is what was timed then; it is not the page's own time
 * from the end of the loading screen. Every open was whole, and in every open one drawing began and one plan was
 * chosen. The load was above a quarter of the machine's 20 processors, so the timing group would have called the
 * machine busy. Whether the page's own time is under the bound at this tip is not claimed here.
 */
import { appendFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { theAreasWereStored, type Attempt } from './a-made-up-office-drawn-in-lanes.ts'
import type { Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'
import {
  DRAWINGS,
  ONE_OPEN_AT_MOST,
  openOnce,
  setTheMasterAndStoreTheAreas,
  storeTheTwoDrawings,
  theOpenIsWhole,
  whatItDrew,
  type AnOpen,
  type Drawing,
} from './a-made-up-reel-page-and-master-opened-fresh.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

const PROJECT = { id: 'test-lanes-timing', title: 'Example office of a reel page and a master of 54 boxes (made up)' }

/** The criterion, in milliseconds: the median of the page's own times, from the end of the loading screen, is under it. */
const FIRST_DRAWN_WITHIN = 3_000
const OPENS = 5

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let db: TestDb
let app: LiveApp
let stored: Record<Drawing, Stored>
let areasStored: Record<Drawing, Attempt> = {
  reel: { ok: false, status: 0, text: 'not tried' },
  master: { ok: false, status: 0, text: 'not tried' },
}

beforeAll(async () => {
  db = await freshDb()
  stored = await storeTheTwoDrawings(db, PROJECT)
  app = await liveApp({ name: 'lanes-timing', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  areasStored = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

function said(what: string): void {
  console.log(what)
  if (OUT !== '') appendFileSync(`${OUT}.lanes-first-drawing.log`, `${what}\n`)
}

for (const drawing of DRAWINGS) {
  it(`the ${drawing.name}'s first drawing is finished within 3 s of the end of the loading screen, as the median of ${String(OPENS)} fresh opens at 1440, and each open is whole`, async () => {
    theAreasWereStored(areasStored[drawing.key], `the ${drawing.name}`)
    const one = stored[drawing.key]
    const opens: AnOpen[] = []
    for (let n = 1; n <= OPENS; n += 1) opens.push(await openOnce(app, PROJECT.id, one, drawing.key, n))
    const times = opens.map((open) => open.ms)
    const ownTimes = opens.map((open) => open.ownMs)
    const median = [...times].sort((a, b) => a - b)[Math.floor(OPENS / 2)]!
    const ownMedian = [...ownTimes].sort((a, b) => a - b)[Math.floor(OPENS / 2)]!
    said(
      `the ${drawing.name}: from asking for the page ${times.join(', ')} ms, median ${String(median)} ms; ` +
        `from the end of the loading screen ${ownTimes.join(', ')} ms, median ${String(ownMedian)} ms; at a one-minute load of ` +
        `${opens.map((open) => open.load.toFixed(2)).join(', ')}; ${whatItDrew(opens, one)}`,
    )
    for (const [n, open] of opens.entries()) theOpenIsWhole(open, `open ${String(n + 1)} of the ${drawing.name}`)
    expect(ownMedian, `the median of ${String(OPENS)} first drawings of the ${drawing.name} from the end of the loading screen, in milliseconds, under ${String(FIRST_DRAWN_WITHIN)}`).toBeLessThan(FIRST_DRAWN_WITHIN)
  }, OPENS * ONE_OPEN_AT_MOST)
}
