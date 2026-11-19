// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION G4: THE PAGE SHOUTS WHEN IT IS IN THE WRONG WORLD, AND SAYS NOTHING OTHERWISE.
 *
 * design/ground/ACCEPTANCE.md, and its shape is the answer chosen for F2:
 *
 *     the second option, nothing in normal use and a red banner only when wrong, with the page not
 *     usable at all: failing loudly is best, and the first option would let a user think all is well.
 *
 * Nothing on screen in normal use; a red banner nobody can miss when something is wrong; the page
 * unusable behind it. The always-visible version was refused because it would teach a reader that
 * the line is furniture.
 *
 * WHAT IS PROVED HERE, IN TWO HALVES.
 *
 * The three comparisons are proved against `src/web/lib/world.ts` directly, because they are
 * arithmetic on two values and a browser adds nothing to them. THE FOURTH CASE IS THE IMPORTANT
 * ONE: a scratch stack on its own address must draw NOTHING, or every browser test in this
 * repository would come up behind a red banner and the suite would be measuring the banner.
 *
 * The drawing, the blocking, the absence of any way past it and the "did not start" page are
 * proved in a real browser against a real server, because none of those is arithmetic.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Page } from 'playwright'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { formatWorldHeader, type WorldOnTheWire } from '../src/config/world-header.mjs'
import { formatFreshnessHeader } from '../src/config/freshness-header.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { en } from '../src/shared/words/en.ts'
import {
  LAST_WORLD_KEY,
  compareThisPageWith,
  forgetTheWorldOnThisPage,
  howLongUntilTheGraceRunsOut,
  howOldTheServerSaysItIs,
  theWorldThatAnswered,
  thisPageIsBehindTheCheckout,
  worldTrouble,
  type RuntimeFactsForThePage,
} from '../src/web/lib/world.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ------------------------------------------------------------------ the three comparisons

/** A world where everything agrees: the page is as new as the checkout and on its own address. */
function everythingAgrees(): RuntimeFactsForThePage {
  return {
    addresses: { canonicalWeb: 'http://127.0.0.1:5173', canonicalWebForOtherMachines: null },
    database: { path: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: true },
    freshness: { verdict: 'as new as the checkout', newestOnDisk: '2026-09-03 10:00:00', newestOnDiskFile: 'src/web/App.tsx', newestForThePage: '2026-09-03 10:00:00', newestFileForThePage: 'src/web/App.tsx' },
    supervisor: { failedStarts: null },
  }
}

/** The moment every reading below is measured against, so nothing here depends on the wall clock. */
const NOW = new Date('2026-09-03T10:05:00').getTime()

/**
 * Tell the page what the answering server says about the age of its own code.
 *
 * The grace arrives this way and no other: the page cannot read src/config/settings.mjs, which
 * imports node:fs. The header is built by its one writer rather than by hand here.
 */
function theServerSays(verdict: 'fresh' | 'stale' | 'unknown', staleFor: number | null, grace = 15): void {
  howOldTheServerSaysItIs(formatFreshnessHeader({ verdict, staleFor, grace }), NOW)
}

describe('what the page compares, and what it says about each', () => {
  beforeEach(() => {
    // Every comparison below needs a grace, and a grace only reaches the page on a reply.
    theServerSays('fresh', null)
  })

  afterEach(() => {
    forgetTheWorldOnThisPage()
  })

  it('says nothing at all when the code is as new as the checkout and the database is the real one', () => {
    const found = compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', { servedAt: '2026-09-03 10:00:00' }, NOW)
    expect(found).toEqual([])
  })

  it('names the code, with both times and how long, when this page is behind the checkout', () => {
    // THE FIRST LOOK STARTS THE CLOCK AND DRAWS NOTHING. The grace runs from when the page was
    // first found behind, so the banner belongs to the look after it, not to this one.
    const page = { servedAt: '2026-09-03 09:00:00' }
    expect(compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', page, NOW)).toEqual([])

    const found = compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', page, NOW + 16_000)
    expect(found.length).toBe(1)
    expect(found[0]?.what).toBe('the code this page is running')
    expect(found[0]?.onThisPage).toContain('2026-09-03 09:00:00')
    // HOW LONG IT HAS BEEN BEHIND, which is what says this is not a save being picked up. Sixteen
    // seconds between the first look and this one.
    expect(found[0]?.onThisPage).toContain('has been behind the checkout for 16 seconds')
    expect(found[0]?.onTheServer).toContain('2026-09-03 10:00:00')
    expect(found[0]?.onTheServer).toContain('src/web/App.tsx')
  })

  it('still names this page when the server is behind the checkout as well', () => {
    // IT USED TO SAY NOTHING HERE, on the reasoning that the page and the server agree with each
    // other so nothing a reader sees is inconsistent. That silenced the OTHER direction completely:
    // problem `JoI0x23xXBRK`, where a page newer than its API drew nothing at all. The real reason
    // for the old condition was a false banner during the suite, and the grace answers that.
    const bothBehind: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: { verdict: 'older than the checkout', newestOnDisk: '2026-09-03 10:00:00', newestOnDiskFile: 'src/shared/time.ts', newestForThePage: '2026-09-03 10:00:00', newestFileForThePage: 'src/shared/time.ts' },
    }
    const page = { servedAt: '2026-09-03 09:00:00' }
    expect(compareThisPageWith(bothBehind, 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    const found = compareThisPageWith(bothBehind, 'http://127.0.0.1:5173', page, NOW + 16_000)
    expect(found.map((one) => one.what)).toEqual(['the code this page is running'])
  })

  it('draws nothing about this page while it has been behind for less than the grace', () => {
    // A SAVE BEING PICKED UP. Vite hands the page new code a moment after a file changes, and a
    // banner in that window would be the product shouting about its own reload. Ten seconds into a
    // fifteen-second grace.
    const justSaved: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: { verdict: 'as new as the checkout', newestOnDisk: '2026-09-03 10:04:50', newestOnDiskFile: 'src/web/App.tsx', newestForThePage: '2026-09-03 10:04:50', newestFileForThePage: 'src/web/App.tsx' },
    }
    const page = { servedAt: '2026-09-03 10:00:00' }
    expect(compareThisPageWith(justSaved, 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    const found = compareThisPageWith(justSaved, 'http://127.0.0.1:5173', page, NOW + 10_000)
    expect(found).toEqual([])
    // AND IT SAYS THAT IT IS BEHIND AND OWED ANOTHER LOOK. One read is not enough: the clock starts
    // at the first look, so without this the page would draw nothing however long it stayed behind.
    // WrongWorld.tsx reads these two and asks once more.
    expect(thisPageIsBehindTheCheckout()).toBe(true)
    expect(howLongUntilTheGraceRunsOut()).toBe(6000)
  })

  it('draws it on the second look, once the grace has run out', () => {
    // The same reading, asked again sixteen seconds later, which is what the component does.
    const justSaved: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: { verdict: 'as new as the checkout', newestOnDisk: '2026-09-03 10:04:50', newestOnDiskFile: 'src/web/App.tsx', newestForThePage: '2026-09-03 10:04:50', newestFileForThePage: 'src/web/App.tsx' },
    }
    const page = { servedAt: '2026-09-03 10:00:00' }
    expect(compareThisPageWith(justSaved, 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    const later = compareThisPageWith(justSaved, 'http://127.0.0.1:5173', page, NOW + 16_000)
    expect(later.map((one) => one.what)).toEqual(['the code this page is running'])
    expect(howLongUntilTheGraceRunsOut()).toBe(0)
  })

  /**
   * CONTINUOUS EDITING DOES NOT RESTART THE GRACE. Problem `PxJuVufHG6A2`.
   *
   * How long this page had been behind used to be counted from `newestOnDisk`, the modification
   * time of the newest file in the checkout. Every save moved that forward, so the count went back
   * to nearly nothing each time somebody pressed save and the grace never ran out. A page running
   * old code while its author works is exactly the case the banner exists for.
   */
  it('draws it after the grace even while files keep changing, because the clock is not the newest file', () => {
    const page = { servedAt: '2026-09-03 10:00:00' }
    const savedAt = (stamp: string): RuntimeFactsForThePage => ({
      ...everythingAgrees(),
      freshness: {
        verdict: 'as new as the checkout',
        newestOnDisk: stamp,
        newestOnDiskFile: 'src/web/App.tsx',
        newestForThePage: stamp,
        newestFileForThePage: 'src/web/App.tsx',
      },
    })

    // The first look: behind, and the clock starts.
    expect(compareThisPageWith(savedAt('2026-09-03 10:04:59'), 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    // Eight seconds later, with a file saved one second ago. The old count would read one second.
    expect(compareThisPageWith(savedAt('2026-09-03 10:05:07'), 'http://127.0.0.1:5173', page, NOW + 8_000)).toEqual([])
    // Sixteen seconds in, with another save one second ago. The banner comes anyway.
    const found = compareThisPageWith(savedAt('2026-09-03 10:05:15'), 'http://127.0.0.1:5173', page, NOW + 16_000)
    expect(found.map((one) => one.what)).toEqual(['the code this page is running'])
    expect(found[0]?.onThisPage).toContain('has been behind the checkout for 16 seconds')
  })

  it('starts the clock again after the page catches up, so an old staleness is not carried forward', () => {
    const behind = { servedAt: '2026-09-03 10:00:00' }
    expect(compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', behind, NOW)).toEqual([])

    // A RELOAD: the page is served the newest code, so it is level with the checkout and the clock
    // is cleared. Nothing is drawn, and nothing is owed.
    const caughtUp = { servedAt: '2026-09-03 10:05:00' }
    expect(compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', caughtUp, NOW + 1_000)).toEqual([])
    expect(thisPageIsBehindTheCheckout()).toBe(false)

    // It falls behind again half a minute later. The count runs from THAT moment, so nothing is
    // drawn until the grace has run from there — the earlier staleness ended and does not add on.
    const later: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: { verdict: 'as new as the checkout', newestOnDisk: '2026-09-03 10:05:31', newestOnDiskFile: 'src/web/App.tsx', newestForThePage: '2026-09-03 10:05:31', newestFileForThePage: 'src/web/App.tsx' },
    }
    expect(compareThisPageWith(later, 'http://127.0.0.1:5173', caughtUp, NOW + 32_000)).toEqual([])
    const found = compareThisPageWith(later, 'http://127.0.0.1:5173', caughtUp, NOW + 48_000)
    expect(found.map((one) => one.what)).toEqual(['the code this page is running'])
    expect(found[0]?.onThisPage).toContain('has been behind the checkout for 16 seconds')
  })

  /**
   * A CHANGE UNDER src/server DOES NOT MAKE THE PAGE'S CODE OLD.
   *
   * Problem `2hadqssN_rc4`. The page was compared against the newest file anywhere under `src/`,
   * which includes the server. So a server-only merge put a red sheet over the owner's live page a
   * minute later, about a page whose modules were as new as they could be. The page is compared
   * against the three folders it is built from — `src/web`, `src/shared`, `src/config` — and
   * against nothing else.
   */
  it('says nothing when the only new file is one the page is not built from', () => {
    const serverOnly: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: {
        verdict: 'as new as the checkout',
        // The checkout has moved, and it moved under src/server.
        newestOnDisk: '2026-09-03 10:04:55',
        newestOnDiskFile: 'src/server/lib/health.ts',
        // Nothing the page is built from has changed since it was served.
        newestForThePage: '2026-09-03 09:59:00',
        newestFileForThePage: 'src/web/App.tsx',
      },
    }
    const page = { servedAt: '2026-09-03 10:00:00' }
    expect(compareThisPageWith(serverOnly, 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    // Not "not yet": the page is not behind at all, so nothing is owed and no later look draws it.
    expect(thisPageIsBehindTheCheckout()).toBe(false)
    expect(compareThisPageWith(serverOnly, 'http://127.0.0.1:5173', page, NOW + 600_000)).toEqual([])
  })

  it('and does say something when the new file IS one the page is built from', () => {
    const pagesOwn: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      freshness: {
        verdict: 'as new as the checkout',
        newestOnDisk: '2026-09-03 10:04:55',
        newestOnDiskFile: 'src/server/lib/health.ts',
        newestForThePage: '2026-09-03 10:04:50',
        newestFileForThePage: 'src/shared/kinds.ts',
      },
    }
    const page = { servedAt: '2026-09-03 10:00:00' }
    expect(compareThisPageWith(pagesOwn, 'http://127.0.0.1:5173', page, NOW)).toEqual([])
    const found = compareThisPageWith(pagesOwn, 'http://127.0.0.1:5173', page, NOW + 16_000)
    expect(found.map((one) => one.what)).toEqual(['the code this page is running'])
    // AND IT NAMES THE PAGE'S OWN FILE, not the newest file in the checkout.
    expect(found[0]?.onTheServer).toContain('src/shared/kinds.ts')
    expect(found[0]?.onTheServer).not.toContain('src/server')
  })

  it('names the database when a scratch one is answering on the address of the real Mole Office', () => {
    const scratch: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
    }
    const found = compareThisPageWith(scratch, 'http://127.0.0.1:5173', { servedAt: '2026-09-03 10:00:00' }, NOW)
    expect(found.length).toBe(1)
    expect(found[0]?.what).toBe('the database behind this page')
    expect(found[0]?.onTheServer).toContain('/tmp/copy/panelx.db')
    expect(found[0]?.onTheServer).toContain(`${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`)
  })

  /**
   * A PAGE ON A REGISTERED TRIP MEANT TO BE THERE, AND THE BANNER MUST NOT TRAP IT.
   *
   * Criterion C7. Entering another world IS reading a scratch database from the address this
   * checkout calls the real one, so the third check's sentence is not true of a page holding a
   * trip. It was drawn anyway, and the banner blocks every press: the citizens verifier measured
   * the Return home button unpressable from http://127.0.0.1:29845 — Playwright reported the
   * banner's own text intercepting every click — thirteen seconds after Enter and still there, with
   * the only way out being to clear the browser's storage. Problem `plIxEJLvVmJM`.
   */
  it('says nothing about the database while this page is on a registered trip', () => {
    const scratch: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
    }
    const trapped = compareThisPageWith(scratch, 'http://127.0.0.1:5173', { servedAt: '2026-09-03 10:00:00' }, NOW)
    expect(trapped.length, 'the reading this test is about is not being made at all').toBe(1)
    const visiting = compareThisPageWith(
      scratch,
      'http://127.0.0.1:5173',
      { servedAt: '2026-09-03 10:00:00' },
      NOW,
      true,
    )
    expect(visiting).toEqual([])
  })

  it('still draws old code and a supervisor that cannot start while this page is on a trip', () => {
    // A TRIP SAYS NOTHING ABOUT THE CODE OR THE MACHINE. Turning the whole banner off while visiting
    // would hide the two faults that have nothing to do with which world a person meant to be in.
    const alsoBroken: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
      supervisor: {
        failedStarts: {
          count: 4,
          lastExit: '2026-09-04 12:00:00',
          says: 'the server has failed to start four times',
          supervisor: { pgid: 4242 },
        },
      },
    }
    const found = compareThisPageWith(
      alsoBroken,
      'http://127.0.0.1:5173',
      { servedAt: '2026-09-03 10:00:00' },
      NOW,
      true,
    )
    expect(found.map((one) => one.what)).toEqual(['the server this page talks to'])
  })

  it('says nothing about a scratch database on an address nobody calls the real one', () => {
    // SOMEBODY WHO OPENED A SCRATCH STACK ON ITS OWN PORT HAS NOT MADE A MISTAKE. This repository
    // starts fifty-odd of them in one suite run; calling each of them wrong would put a red banner
    // over every browser test in the project and the suite would be measuring the banner.
    const scratch: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
    }
    const found = compareThisPageWith(scratch, 'http://127.0.0.1:41733', { servedAt: '2026-09-03 10:00:00' }, NOW)
    expect(found).toEqual([])
  })

  /**
   * AND THE SAME CHECK OVER THE ADDRESS OTHER MACHINES REACH THIS COMPUTER AT. Criterion R4.
   *
   * There can be two addresses this checkout calls the real one, and until 4 September 2026 only the
   * loopback one was compared. A page opened over the tailnet and answered end to end by a copy of
   * the database drew NOTHING, which the negative control's own remote case found the first time it
   * ran. The reader it was silent for is the one furthest from the machine.
   */
  const alsoOnTheTailnet = (): RuntimeFactsForThePage => ({
    ...everythingAgrees(),
    addresses: { canonicalWeb: 'http://127.0.0.1:5173', canonicalWebForOtherMachines: 'http://192.0.2.10:5173' },
    database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
  })

  it('names the database on the address other machines reach the real Mole Office at', () => {
    const found = compareThisPageWith(
      alsoOnTheTailnet(),
      'http://192.0.2.10:5173',
      { servedAt: '2026-09-03 10:00:00' },
      NOW,
    )
    expect(found.length, 'a page opened from another machine was told nothing about a scratch database').toBe(1)
    expect(found[0]?.what).toBe('the database behind this page')
    expect(found[0]?.onThisPage).toContain('192.0.2.10')
    expect(found[0]?.onTheServer).toContain('/tmp/copy/panelx.db')
  })

  it('still names it on the loopback address when a second one is declared', () => {
    // The second address is added to the first and never instead of it.
    const found = compareThisPageWith(
      alsoOnTheTailnet(),
      'http://127.0.0.1:5173',
      { servedAt: '2026-09-03 10:00:00' },
      NOW,
    )
    expect(found.length).toBe(1)
  })

  it('says nothing on a scratch port even while a second canonical address is declared', () => {
    const found = compareThisPageWith(
      alsoOnTheTailnet(),
      'http://192.0.2.10:41733',
      { servedAt: '2026-09-03 10:00:00' },
      NOW,
    )
    expect(found, 'a scratch stack on its own port over the tailnet is nobody\'s mistake either').toEqual([])
  })
})

/**
 * THE OTHER DIRECTION: THE SERVER THIS PAGE TALKS TO IS BEHIND THE CHECKOUT.
 *
 * The GROUND verifier measured the miss on 3 September 2026. The API had loaded `src/` at 23:20:53
 * and the page was served at 23:21:41, so the two halves of one stack were running different code.
 * `GET /api/runtime/freshness` said "older than the checkout" and two measuring tools refused to
 * measure. The page drew nothing at all, because `compareThisPageWith` only ever compared the page
 * with the checkout. Problem `JoI0x23xXBRK`.
 *
 * The server says how old its code is on every reply now, and this is what the page makes of it.
 */
describe('the page shouts when the server it talks to is behind the checkout', () => {
  afterEach(() => {
    forgetTheWorldOnThisPage()
  })

  it('says nothing while the server says its code is current', () => {
    theServerSays('fresh', null)
    expect(worldTrouble()).toEqual([])
  })

  it('says nothing while the server has been behind for less than the grace', () => {
    // Two seconds, which is about what a tsx watch restart takes.
    theServerSays('stale', 2)
    expect(worldTrouble()).toEqual([])
  })

  it('shouts once the server has been behind for longer than the grace, and says how long', () => {
    theServerSays('stale', 240)
    const trouble = worldTrouble()
    expect(trouble.map((one) => one.what)).toEqual(['the code the server is running'])
    expect(trouble[0]?.onTheServer).toContain('4 minutes')
    expect(trouble[0]?.doThis).toContain('Restart it')
  })

  it('says it once, not once a reply, because the number grows every second', () => {
    theServerSays('stale', 240)
    theServerSays('stale', 241)
    theServerSays('stale', 242)
    expect(worldTrouble().length).toBe(1)
  })

  it('says nothing at all about a reply that carries no readable reading', () => {
    // A server too old to send the header, or something that is not a Mole Office. Reading silence
    // as "the code is current" would be the page making a claim nobody made.
    expect(howOldTheServerSaysItIs(null, NOW)).toBeNull()
    expect(howOldTheServerSaysItIs('verdict=maybe; staleFor=1; grace=15', NOW)).toBeNull()
    expect(worldTrouble()).toEqual([])
  })

  it('takes the grace from the server rather than holding one of its own', () => {
    // The declaration is the only place the number lives. A page that held a copy would be one
    // setting in two places, free to disagree, which is the defect CLAUDE.md names at the top.
    theServerSays('stale', 30, 60)
    expect(worldTrouble()).toEqual([])
    forgetTheWorldOnThisPage()
    theServerSays('stale', 30, 5)
    expect(worldTrouble().map((one) => one.what)).toEqual(['the code the server is running'])
  })
})

/**
 * THE BANNER GOES WHEN THE WORLD IS RIGHT AGAIN, WITH NOTHING RELOADED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `6LQMP7FiQlrt`. `alsoWrong` only ever added to the list of disagreements and nothing ever
 * removed one, so a page that had been in the wrong world for one moment stayed blocked until
 * somebody reloaded it. The GROUND verifier switched the API under an open page, watched the banner
 * appear, put the right API back, and read three more right-world replies with no reload at all — a
 * marker set on `window` when the page opened was still there — and the banner and the sheet were
 * both still up. The banner told the reader to reload, which is a way past the sheet that also
 * throws away whatever they were doing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Each check replaces its own rows every time it looks, so finding nothing clears them and leaves
 * every other check's alone. Wrong then right clears. Right, wrong, right clears. And one check
 * clearing does not silence another that is still finding something.
 */
describe('the banner goes when the world is right again, without a reload', () => {
  afterEach(() => {
    forgetTheWorldOnThisPage()
  })

  /** The world this page opened against, as it arrives: a header on a reply. */
  const opened: WorldOnTheWire = {
    database: '1111111111111111',
    repository: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    port: String(settingNamed('MOLE_OFFICE_PORT').fallback),
    head: 'abc1234',
    standing: 'canonical',
  }
  /** Somebody else's, on the same address. */
  const somebodyElses: WorldOnTheWire = { ...opened, database: '9999999999999999' }

  function replyFrom(world: WorldOnTheWire): void {
    theWorldThatAnswered(formatWorldHeader(world))
  }

  it('clears when the world this page opened against answers again', () => {
    replyFrom(opened)
    expect(worldTrouble()).toEqual([])

    replyFrom(somebodyElses)
    expect(worldTrouble().map((one) => one.what)).toEqual(['the database'])

    // THE RIGHT SERVER IS BACK. Three more replies, and no reload: the page is usable again.
    replyFrom(opened)
    replyFrom(opened)
    replyFrom(opened)
    expect(worldTrouble()).toEqual([])
  })

  it('clears again after a second round of wrong, so nothing is remembered from the first', () => {
    replyFrom(opened)
    replyFrom(somebodyElses)
    expect(worldTrouble().length).toBe(1)
    replyFrom(opened)
    expect(worldTrouble()).toEqual([])
    replyFrom(somebodyElses)
    expect(worldTrouble().length).toBe(1)
    replyFrom(opened)
    expect(worldTrouble()).toEqual([])
  })

  it('clears the server-is-old row when the server says it is current again', () => {
    theServerSays('fresh', null)
    expect(worldTrouble()).toEqual([])
    theServerSays('stale', 240)
    expect(worldTrouble().map((one) => one.what)).toEqual(['the code the server is running'])
    // A RESTART, AND THE NEXT REPLY SAYS SO. Nothing was reloaded on this side.
    theServerSays('fresh', null)
    expect(worldTrouble()).toEqual([])
  })

  it('clears one check without silencing another that is still finding something', () => {
    replyFrom(opened)
    theServerSays('stale', 240)
    replyFrom(somebodyElses)
    expect(worldTrouble().map((one) => one.what).sort()).toEqual([
      'the code the server is running',
      'the database',
    ])

    // The right server is back, but it is STILL running old code. One row goes, one stays.
    replyFrom(opened)
    expect(worldTrouble().map((one) => one.what)).toEqual(['the code the server is running'])

    // And when it has been restarted, the last row goes too.
    theServerSays('fresh', null)
    expect(worldTrouble()).toEqual([])
  })

  it('clears the page-against-the-world rows when the page catches up', () => {
    theServerSays('fresh', null)
    const scratch: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
    }
    expect(
      compareThisPageWith(scratch, 'http://127.0.0.1:5173', { servedAt: '2026-09-03 10:00:00' }, NOW).map((one) => one.what),
    ).toEqual(['the database behind this page'])
    expect(worldTrouble().length).toBe(1)

    // The real server is back on that address, so the same look finds nothing and says so.
    expect(compareThisPageWith(everythingAgrees(), 'http://127.0.0.1:5173', { servedAt: '2026-09-03 10:00:00' }, NOW)).toEqual([])
    expect(worldTrouble()).toEqual([])
  })

  it('tells the reader to put the world right, never to reload the page', () => {
    // A banner that says "reload" offers a way past the sheet that also throws away what the reader
    // was doing, and it is not what makes any of these faults go.
    replyFrom(opened)
    replyFrom(somebodyElses)
    theServerSays('stale', 240)
    const scratch: RuntimeFactsForThePage = {
      ...everythingAgrees(),
      database: { path: '/tmp/copy/panelx.db', canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`, canonical: false },
    }
    compareThisPageWith(scratch, 'http://127.0.0.1:5173', { servedAt: '2026-09-03 09:00:00' }, NOW)
    compareThisPageWith(scratch, 'http://127.0.0.1:5173', { servedAt: '2026-09-03 09:00:00' }, NOW + 16_000)
    const rows = worldTrouble()
    expect(rows.length).toBeGreaterThan(2)
    for (const one of rows) {
      expect(one.doThis.toLowerCase(), `"${one.what}" still tells the reader to reload`).not.toContain('reload')
    }
  })
})

/**
 * THERE IS NO WAY PAST THE BANNER, AND THIS FILE USED TO ASSERT THERE WAS.
 *
 * It carried a block headed "the press that dismisses it covers what was dismissed and nothing
 * else", which proved that a press was remembered for one disagreement and not the next. That was
 * a careful test of a thing that should not exist. The GROUND verifier measured what the press
 * did: banner gone, sheet gone, a click on a link went through, 697 elements drawn, and a reload in
 * the same tab drew nothing. The page then read and could write the wrong database in silence.
 * Problem `gYBEA5B6KC9h`.
 *
 * The criterion says the page is not usable behind the banner. The F2 answer says the same: not
 * usable at all. So the dismissal is gone, and this is what stands in its place: the code that
 * offered it is not there, and nothing writes a dismissal into any browser store.
 */
describe('nothing offers a way past the banner', () => {
  const source = (path: string) => readFileSync(`${repo}${path}`, 'utf8')

  /**
   * THE ONE PRESS THE BANNER HAS SINCE 4 SEPTEMBER 2026, and why it is not what this block forbids.
   *
   * Criterion C7 gives it "I am visiting on purpose". That press registers a VISIT with the world
   * that is answering and reloads: it does not hide the banner, it makes the banner untrue, and the
   * strip that appears afterwards says where the page is for as long as it is away. The dismissal
   * this block exists to keep out did the opposite — it left the page in the wrong world with
   * nothing on screen saying so, which is problem `gYBEA5B6KC9h`.
   */
  it('has one press on the banner and it registers a visit rather than dismissing anything', () => {
    const drawing = source('src/web/components/WrongWorld.tsx')
    // TWO CONTROLS IN THE FILE AND EXACTLY ONE ON SCREEN. One registers a visit with the world that
    // is answering; the other comes home from a trip. Each renders only in the state the other
    // cannot be in — `trip === null` and `trip !== null` — and neither hides anything, which is what
    // the block below is about. Problem `gAVABjZo2OHq` is why the second exists: the banner blocks
    // every control outside itself, so a page that had walked into another world and then found
    // that world running old code had no way back at all.
    expect(drawing.match(/<button/g)?.length ?? 0).toBe(2)
    // THE TWO PRESSES' WORDS ARE READ FROM THE WORD LISTS (plan 7FEOshq3mBGG, row F1), so the file
    // names their keys and the English list says what they are. The visit's stored reason, which
    // the server keeps, is still the English words in this file.
    const words = en as Readonly<Record<string, unknown>>
    expect(drawing).toContain("t('frameFiles.wrongWorld.visitingOnPurpose')")
    expect(words['frameFiles.wrongWorld.visitingOnPurpose']).toBe('I am visiting on purpose')
    expect(drawing).toContain("'I am visiting on purpose'")
    expect(drawing).toContain('enterAWorld')
    expect(drawing).toContain("t('frameFiles.wrongWorld.returnHome')")
    expect(words['frameFiles.wrongWorld.returnHome']).toBe('Return home')
    expect(drawing).toContain('api.returnHome()')
    expect(drawing).not.toContain('Let me use it anyway')
    expect(drawing).not.toContain('px-ww-dismiss')
    // AND IT HIDES NOTHING. No state in this file that takes the banner off the screen, and no write
    // into any browser store from it: the banner goes when the world it names stops disagreeing.
    // COMMENTS ARE STRIPPED FIRST, because this file's own header tells the story of the dismissal
    // that was removed and names the store it was kept in.
    const code = drawing.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(code).not.toContain('setDismissed')
    expect(code).not.toContain('localStorage')
    expect(code).not.toContain('sessionStorage')
  })

  it('keeps no dismissal in any browser store, and has no reader for one', () => {
    const machinery = source('src/web/lib/world.ts')
    expect(machinery).not.toContain('mole-office.world.dismissed')
    expect(machinery).not.toContain('alreadyDismissed')
    expect(machinery).not.toContain('export function dismiss')
    // The one thing it does keep there is which world last answered, for the "did not start" page.
    expect(machinery).toContain(LAST_WORLD_KEY)
  })

  it('and the whole browser app has no dismissal of a wrong world anywhere in it', () => {
    // Not only the two files above: a press added to any other component would put the door back.
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
      }
      return out
    }
    const offenders = walk(`${repo}src/web`).filter((file) =>
      readFileSync(file, 'utf8').includes('mole-office.world.dismissed'),
    )
    expect(offenders).toEqual([])
  })
})

describe('the failure page and the app agree about where the last world is kept', () => {
  it('names the same storage key in index.html as lib/world.ts writes', () => {
    // THE ONE FACT THIS FILE CANNOT DELETE FROM ONE OF ITS TWO PLACES. The notice in index.html is
    // plain HTML on purpose — it has to work when the app's modules do not — so it cannot import
    // the key, and a key in two places that can disagree is the defect CLAUDE.md names at the top.
    // Making this test fail when they disagree is the option that document offers instead.
    const html = readFileSync(`${repo}src/web/index.html`, 'utf8')
    expect(html).toContain(LAST_WORLD_KEY)
  })
})

// ------------------------------------------------------------------ the banner, in a browser

describe('the banner in a real browser, over a real server', () => {
  let app: LiveApp
  let page: Page

  beforeAll(async () => {
    app = await liveApp({
      name: 'wrong-world-banner',
      viewport: { width: 1440, height: 900 },
      // THE DEV SERVER, because this file stops the app starting by refusing one named module —
      // `main.tsx` — and then reads the notice that names it. A build has no `main.tsx`: its
      // modules are one hashed bundle, so there is no module to refuse by name and no name for the
      // notice to carry.
      theDevServerBecause: 'it stops the app starting by refusing main.tsx by name, which only a dev server serves',
    })
    page = app.page
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('draws nothing about the world on a page that is where it thinks it is', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1500)
    const drawn = await page.evaluate(() => ({
      banner: document.querySelector('.px-ww') !== null,
      blocked: document.querySelector('.px-ww-block') !== null,
      // The machinery IS loaded — this is what says the silence is the feature and not a page that
      // never ran the check.
      stamped: typeof window.moleOfficeServedCode?.servedAt === 'string',
    }))
    expect(drawn).toEqual({ banner: false, blocked: false, stamped: true })
  }, 60_000)

  it('shouts, blocks the page and names both values when a reply comes from another world', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1000)
    // The page has read its world. Now something else starts answering — the same shape of reply,
    // from another database, which is what a swapped server looks like from in here.
    const elsewhere: WorldOnTheWire = {
      database: 'eeeeeeeeeeeeeeee',
      repository: `${THE_TEST_FIXTURE_ROOT}/somebody-elses-checkout`,
      port: '8787',
      head: 'deadbee',
      standing: 'scratch',
    }
    await page.route('**/api/**', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, headers: { ...response.headers(), 'x-mole-office-world': formatWorldHeader(elsewhere) } })
    })
    await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.px-ww', { timeout: 30_000 })

    const said = await page.evaluate(() => ({
      text: document.querySelector('.px-ww')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      blocked: document.querySelector('.px-ww-block') !== null,
      // THE PAGE IS NOT USABLE BEHIND IT: what a press at the middle of the window lands on is the
      // sheet, not the page. Asked of the browser rather than worked out from a rectangle.
      whatAPressWouldHit:
        document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.className ?? 'nothing',
    }))
    expect(said.blocked).toBe(true)
    // WHAT A PRESS LANDS ON IS THE BANNER OR THE SHEET, never the page beneath. It was the sheet
    // alone until 4 September 2026, when criterion C7 gave the banner one more line and the banner
    // grew past the middle of the window. Which of the two it is was never the point; the point is
    // that it is not the page, and that is what this asks now.
    expect(said.whatAPressWouldHit).toMatch(/^px-ww/)
    expect(said.text).toContain('eeeeeeeeeeeeeeee')
    expect(said.text).toContain('the database')

    /**
     * AND THERE IS NOTHING ON IT THAT DISMISSES IT.
     *
     * ONE PRESS SINCE 4 SEPTEMBER 2026 AND IT IS NOT A DISMISSAL. Criterion C7 of
     * design/messages/ACCEPTANCE.md section 8: *the wrong-world banner of G4 gets one more line, "I
     * am visiting on purpose", which is exactly an Enter (a registered visit) and replaces nothing
     * else about the banner.* Pressing it registers a visit with the world that is answering and
     * reloads; after that the page is deliberately in that world and a strip says so the whole time
     * it is there. The banner is not hidden by it — it is no longer true.
     *
     * WHAT THIS TEST STILL HOLDS, and it is the half the incident was about: there is exactly one
     * press, it is that one, and pressing the sheet changes nothing at all.
     */
    const presses = page.locator('.px-ww button')
    expect(await presses.count()).toBe(1)
    expect(await presses.first().getAttribute('class')).toBe('px-ww-visit-do')
    await page.mouse.click(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2)
    await sleep(400)
    const afterAPress = await page.evaluate(() => ({
      banner: document.querySelector('.px-ww') !== null,
      blocked: document.querySelector('.px-ww-block') !== null,
      whatAPressWouldHit:
        document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.className ?? 'nothing',
      // Nothing about a dismissal is kept anywhere, in either store.
      kept: [...Object.keys(window.sessionStorage), ...Object.keys(window.localStorage)].filter((key) =>
        key.includes('dismiss'),
      ),
    }))
    expect(afterAPress.banner).toBe(true)
    expect(afterAPress.blocked).toBe(true)
    expect(afterAPress.whatAPressWouldHit).toMatch(/^px-ww/)
    expect(afterAPress.kept).toEqual([])
    await page.unroute('**/api/**')
  }, 60_000)

  /**
   * AND IT GOES AGAIN WHEN THE RIGHT WORLD COMES BACK, WITH NOTHING RELOADED.
   *
   * Problem `6LQMP7FiQlrt`, proved the way the GROUND verifier measured it: a marker written on
   * `window` when the page opens. A reload replaces the document and takes the marker with it, so a
   * marker that is still there at the end is proof that this page was never reloaded.
   */
  it('clears itself when the right world answers again, and the page was never reloaded', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(1000)
    // The marker. It is gone the moment anything reloads this document.
    await page.evaluate(() => {
      ;(window as unknown as { neverReloaded?: string }).neverReloaded = 'the document this test opened'
    })

    const elsewhere: WorldOnTheWire = {
      database: 'ffffffffffffffff',
      repository: `${THE_TEST_FIXTURE_ROOT}/somebody-elses-checkout`,
      port: '8787',
      head: 'deadbee',
      standing: 'scratch',
    }
    await page.route('**/api/**', async (route) => {
      try {
        const response = await route.fetch()
        await route.fulfill({ response, headers: { ...response.headers(), 'x-mole-office-world': formatWorldHeader(elsewhere) } })
      } catch {
        // The page keeps asking while the banner is up, so a request can still be in flight when
        // this route is taken off below. Playwright then refuses the fulfil, and the request goes
        // through unchanged — which is the state this half of the test wants anyway.
      }
    })
    // Something to make a request with, without leaving this document: the hash changes and the app
    // reads what the new page needs.
    await page.evaluate(() => { window.location.hash = '#/records' })
    await page.waitForSelector('.px-ww', { timeout: 30_000 })
    expect(await page.evaluate(() => document.querySelector('.px-ww-block') !== null)).toBe(true)

    // THE RIGHT SERVER IS BACK. Nothing is reloaded and nothing is pressed; the page's own requests
    // are what notice.
    await page.unroute('**/api/**')
    await page.waitForSelector('.px-ww', { state: 'detached', timeout: 30_000 })

    const after = await page.evaluate(() => ({
      banner: document.querySelector('.px-ww') !== null,
      blocked: document.querySelector('.px-ww-block') !== null,
      marker: (window as unknown as { neverReloaded?: string }).neverReloaded ?? null,
      // AND THE PAGE IS USABLE AGAIN: a press at the middle of the window lands on the page.
      whatAPressWouldHit:
        document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.className ?? 'nothing',
    }))
    expect(after.banner).toBe(false)
    expect(after.blocked).toBe(false)
    expect(after.marker, 'the page was reloaded, so this proves nothing').toBe('the document this test opened')
    expect(after.whatAPressWouldHit).not.toContain('px-ww-block')
  }, 90_000)

  it('names the module that failed, the API it expected and the last world it saw, when the app does not start', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await sleep(800)
    // What a failure to start looks like to the browser: the app's first module does not arrive.
    await page.route('**/main.tsx*', (route) => route.abort('failed'))
    await page.reload({ waitUntil: 'load', timeout: 60_000 })
    // The notice is hidden for two and a half seconds by styles.css, so that an ordinary load never
    // flashes it. Waiting past that is waiting for the page a person would actually see.
    await sleep(3500)
    const said = await page.evaluate(() => {
      const text = (id: string) => document.getElementById(id)?.textContent?.trim() ?? ''
      return { module: text('boot-module'), api: text('boot-api'), world: text('boot-world') }
    })
    expect(said.module).toContain('main.tsx')
    expect(said.api).toContain('/api')
    expect(said.world).toContain('checkout')
    await page.unroute('**/main.tsx*')
  }, 60_000)
})

/**
 * A PAGE ON A TRIP IS NEVER TRAPPED BEHIND THE BANNER. Problem `gAVABjZo2OHq`.
 *
 * In a test of worlds, after a switch the banner "This is not the Mole Office you think
 * you are looking at." and large words under it came up; nothing else could be pressed, and there was no way back.
 *
 * Measured in a browser in the owner's shape — the browser app on the address this checkout calls the real
 * one, a rich home world, Enter into an empty second world whose server had been running since
 * before the last merge. The banner drew at once with one row, *the code the server is running*;
 * the sheet blocked the page; the visiting strip was on screen and its Return home could not be
 * pressed, because the sheet swallows the press. The only way out was clearing browser storage.
 */
describe('the banner always has exactly one way out, whichever side of a trip the page is on', () => {
  // `source` in the block above is local to it, so this reads the file the same way it does.
  const file = (): string => readFileSync(`${repo}src/web/components/WrongWorld.tsx`, 'utf8')

  function bodyOf(name: string): string {
    const s = file()
    const at = s.indexOf(`function ${name}(`)
    expect(at, `${name} is not in this file`).toBeGreaterThan(-1)
    return s.slice(at, s.indexOf('\n}', at)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  }

  it('offers coming home only while this page holds a trip', () => {
    const code = bodyOf('ComeHomeFromHere')
    expect(code).toContain('if (trip === null) return null')
    expect(code).toContain('api.returnHome()')
    expect(code, 'the way home goes through the visit door').not.toContain('enterAWorld')
  })

  it('offers registering a visit only while this page holds none, so exactly one is ever drawn', () => {
    const code = bodyOf('IAmVisitingOnPurpose')
    expect(code).toContain('trip !== null')
    expect(code).toContain('enterAWorld')
    expect(code, 'the two controls could be on screen together').not.toContain('returnHome')
  })

  it('draws both inside the banner, which is the only thing that can be pressed while it is up', () => {
    const s = file()
    const banner = s.slice(s.indexOf('<div className="px-ww"'), s.indexOf('</div>\n    </>'))
    expect(banner).toContain('<IAmVisitingOnPurpose />')
    expect(banner).toContain('<ComeHomeFromHere />')
  })

  it('still hides nothing and still blocks the page', () => {
    // THE LINE THIS FILE HAS HELD SINCE `gYBEA5B6KC9h`. Coming home makes the banner untrue; it does
    // not dismiss it. Nothing here takes the sheet off the screen or writes a dismissal anywhere.
    const code = file().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(code).toContain('px-ww-block')
    expect(code).not.toContain('setDismissed')
    expect(code).not.toContain('localStorage')
    expect(code).not.toContain('sessionStorage')
  })
})
