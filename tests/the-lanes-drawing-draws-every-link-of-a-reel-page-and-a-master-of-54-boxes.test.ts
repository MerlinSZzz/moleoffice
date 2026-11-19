// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LANES DRAWING OF A MADE-UP REEL PAGE AND OF A MADE-UP MASTER OF 54 BOXES DRAWS EVERY LINK AND EVERY CARD THE OLD
 * CODE DREW, AT 1440. Wave 13u round 231, PV-R2: the pipeline drawing's first drawing in under 3 seconds.
 *
 * WHY THIS FILE IS APART FROM THE TIMING. tests/the-lanes-drawing-is-first-drawn-within-3-seconds.test.ts times the
 * same two drawings, and it is to run only in the timing group, on a quiet machine, as tests/the-timing-tests.ts says.
 * This file runs in the suite, so the merge queue catches a change that makes the drawing faster by leaving a link or
 * a card out, however busy the machine is.
 *
 * THE OFFICE holds two made-up drawings, from tests/fixtures/a-made-up-reel-page-with-other-pipelines-steps.json and
 * tests/fixtures/a-made-up-master-of-54-boxes-and-60-links.json. They are stored by
 * tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts, whose head says what each file holds and how it is stored:
 *   - the reel page has the shape of round 230's made-up office copy's reel page: 12 steps and 8 modules in 6 areas,
 *     and the 20 steps of 5 other pipelines, each in an area headed by its pipeline. It has 66 links, and 34 of them
 *     are implements links, which are drawn only for a selection;
 *   - the master is round 230's made-up master (tests/fixtures/a-made-up-master-and-reel-in-lanes.json), grown from 34
 *     boxes and 25 links to 54 boxes and 60 links, in its 8 areas.
 * Once the server is up, the master is set, and each pipeline's areas and places are stored through their doors, as
 * the person. tests/a-made-up-reel-page-and-master-opened-fresh.ts opens each page and reads it.
 *
 * WHAT IS PROVED, for the reel page and for the master, in one fresh open each at 1440:
 *   - the areas of that pipeline were stored;
 *   - no link is named in data-not-drawn;
 *   - every link of the file's `links` list either has a line at rest and is named in data-drawn-links, or is named
 *     for a selection in data-on-selection;
 *   - every record the old code drew as a card is drawn as a card, and no other card is drawn. Which records those are
 *     is said beside `cards` in tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts.
 * Each case prints the time the drawing took, the load, the fit, and how many cards and links it drew. The time is
 * printed and not judged here.
 *
 * THE OLD CODE, at main 98fa95452 on 16 November 2026, read by the same method by a script outside the repository:
 *   - the reel page: 40 cards, and all 66 links, 32 at rest and 34 for a selection. Card 188 at zoom 1;
 *   - the master: 61 cards, 54 boxes and 7 modules, and all 60 links at rest. Card 128 at zoom 0.9231.
 *
 * MUTATIONS, each after a control run. The round's report names each one, its red case and its log.
 */
import { afterAll, beforeAll, it } from 'vitest'

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
  type Drawing,
} from './a-made-up-reel-page-and-master-opened-fresh.ts'

const PROJECT = { id: 'test-lanes-whole', title: 'Example office of a reel page and a master of 54 boxes (made up)' }

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
  app = await liveApp({ name: 'lanes-whole', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
  areasStored = await setTheMasterAndStoreTheAreas(app, db, PROJECT.id, stored)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

for (const drawing of DRAWINGS) {
  it(`the ${drawing.name}'s drawing, opened fresh at 1440, draws every link and every card the old code drew, and no other card`, async () => {
    theAreasWereStored(areasStored[drawing.key], `the ${drawing.name}`)
    const one = stored[drawing.key]
    const open = await openOnce(app, PROJECT.id, one, drawing.key, 1)
    console.log(`the ${drawing.name}: drawn in ${String(open.ms)} ms at a one-minute load of ${open.load.toFixed(2)}; ${whatItDrew([open], one)}`)
    theOpenIsWhole(open, `the ${drawing.name}`)
  }, ONE_OPEN_AT_MOST + 30_000)
}
