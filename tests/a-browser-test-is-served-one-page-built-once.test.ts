// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BROWSER TEST IS SERVED ONE PAGE BUILT ONCE, AND SHARES ONE CHROMIUM WITH ITS WORKER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT, AND WHAT IT COST NOT TO HAVE
 * ---------------------------------------------------------------------------------------
 *
 * At the landing of 23 September 2026 the whole suite took 31.6 minutes at four workers, and the
 * 268 files that call `liveApp` were 21% of the files and 59% of the time. Each of them started a
 * Vite dev server of its own and a Chromium of its own. A Vite is a dependency pre-bundle and a
 * transform of every module the page imports, paid again on the first page load of every file; a
 * build of the same page takes about a second and one build serves the whole run.
 *
 * So the page is built once, each test is served it by a small server inside the test process, and
 * each worker starts one Chromium that every test in it takes a context from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAD TO KEEP WORKING, WHICH IS WHAT THIS FILE ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * A page built once cannot know the port of an API started minutes later, and criterion R1 of
 * design/ground/ACCEPTANCE.md says the page reads the API address from where it was served and
 * never from a guess. So the server handing the page over writes the port into the page, and
 * `src/web/lib/the-port-written-into-this-page.ts` reads it. The first section below is that whole
 * road end to end: a record filed in ONE test's database, drawn by a page that something else
 * served.
 *
 * A context is the isolation a fresh browser was buying — its own cookies, its own storage — so the
 * third section writes into one stack's storage and asks the other stack whether it is there.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE EACH OF THESE
 * ---------------------------------------------------------------------------------------
 *
 * Each was run on 23 September 2026, after a control run of this file green three times.
 *
 *   write no tag in `theBuiltPageWithTheApiPortInIt` in tests/helpers.ts → *was told this test API
 *     port* goes red: the page falls back to its own origin, which is the page server and not the
 *     API, so the record it was sent to draw never arrives.
 *   `theApiIsOnPort(apiPortInDevelopment)` in src/web/lib/api-port.ts → the same test goes red, from
 *     the page's own side of the same road.
 *   take the refusal out of `theApiPortWrittenIntoThisPage` → *is a refusal when what was written is
 *     not a port* goes red.
 *   `chromium.launch()` in `startTheStack` in place of `theBrowserThisWorkerShares()` → *gives two
 *     stacks in one worker the same browser* goes red.
 *   one context on `globalThis` shared by every stack → this file goes red, and it goes red before
 *     the storage test: the second stack cannot open a page in a context the first stack's `stop()`
 *     has closed. That is what sharing a context costs, said by the run rather than by this comment.
 *   build the page at the top of `theBuiltPage`, on every call → *built the page at most once* goes
 *     red, with the storage test red beside it.
 *   ignore `theDevServerBecause` in `startTheStack` → *gets one, and its page did not come out of a
 *     build* goes red: a file that asked for a dev server is served the build instead.
 *
 * Two more were run on 25 September 2026, each after a control run of this file green:
 *
 *   take `NODE_ENV: wanted.nodeEnv` out of the build's environment in `buildThePageForTests`, so the
 *     build inherits the test runner's `test` → *is a production build* goes red: the bundle calls
 *     `jsxDEV`. A build already on disk is not built again by that edit alone, so the run moved the
 *     time of the newest source file to make the harness build.
 *   take `said.nodeEnv === wanted.nodeEnv` out of `theNoteSaysItIsTheBuildWanted` → *is built again
 *     when its note says a development build, or says nothing about the mode* goes red.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  howManyTimesThisWorkerBuiltThePage,
  liveApp,
  THE_PAGE_BROWSER_TESTS_ARE_SERVED,
  theNoteSaysItIsTheBuildWanted,
  waitForThePage,
  whatThePageWouldBeBuiltFrom,
  type LiveApp,
  governsTheWholeProject,
} from './helpers.ts'
import {
  THE_API_PORT_TAG,
  theApiPortWrittenIntoThisPage,
} from '../src/web/lib/the-port-written-into-this-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** What a page knows about the age of the code it is running. `src/web/lib/served.ts` writes it. */
interface ServedCode {
  fromABuild: boolean
}

const AS_THEM = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** File one decision in a stack's own database and hand back its id. */
async function fileADecisionIn(app: LiveApp, title: string): Promise<string> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THEM,
    body: JSON.stringify({
      kind: 'decision',
      title,
      data: { ...governsTheWholeProject(), replaces: [], because: 'A browser test filed it to see whether the page reads this database.' },
    }),
  })
  const said = (await filed.json()) as { record?: { id: string } }
  expect(filed.status, JSON.stringify(said)).toBe(201)
  return (said.record as { id: string }).id
}

function whatThePageSaysAboutItsOwnAge(app: LiveApp): Promise<ServedCode | null> {
  return app.page.evaluate(
    () => (window as unknown as { moleOfficeServedCode?: ServedCode }).moleOfficeServedCode ?? null,
  )
}

describe('the page a browser test is served', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({ name: 'one-page-built-once', viewport: { width: 1440, height: 990 } })
  })

  afterAll(async () => {
    await app?.stop()
  })

  it('came out of a build, served on a port that is not the API', async () => {
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page)
    expect((await whatThePageSaysAboutItsOwnAge(app))?.fromABuild).toBe(true)
    expect(app.webPort).not.toBe(app.apiPort)
  })

  it('was told this test API port, and reads this test own database through it', async () => {
    const title = 'A decision only this test database holds'
    const id = await fileADecisionIn(app, title)
    await app.page.goto(`${app.site}/#/r/${id}`)
    await waitForThePage(app.page)
    await app.page.getByText(title, { exact: true }).first().waitFor({ timeout: 10_000 })
    const written = await app.page.evaluate(
      (name) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null,
      THE_API_PORT_TAG,
    )
    expect(written).toBe(String(app.apiPort))
  })

  /**
   * `jsxDEV` is what React's development build of JSX calls, and the production build never does.
   * The page this test was just served is in this folder, so the folder holds a build by now.
   */
  it('is a production build, as `npm run build` makes: its code calls no jsxDEV', () => {
    const assets = join(THE_PAGE_BROWSER_TESTS_ARE_SERVED, 'assets')
    const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'))
    expect(scripts.length, `no script in ${assets}`).toBeGreaterThan(0)
    const callingJsxDev = scripts.filter((name) => readFileSync(join(assets, name), 'utf8').includes('jsxDEV'))
    expect(callingJsxDev, 'these scripts of the page were built by React for development').toEqual([])
  })
})

describe('the note beside the page a browser test is served', () => {
  const wanted = whatThePageWouldBeBuiltFrom()

  it('says the build is the one wanted when it names the same source and production', () => {
    expect(wanted.nodeEnv).toBe('production')
    expect(theNoteSaysItIsTheBuildWanted({ ...wanted }, wanted)).toBe(true)
  })

  it('is built again when its note says a development build, or says nothing about the mode', () => {
    expect(theNoteSaysItIsTheBuildWanted({ ...wanted, nodeEnv: 'development' }, wanted)).toBe(false)
    expect(theNoteSaysItIsTheBuildWanted({ ...wanted, nodeEnv: 'test' }, wanted)).toBe(false)
    // The note every build wrote before 25 September 2026: the source, and nothing about the mode.
    const fromBefore = { newestSourceFile: wanted.newestSourceFile, newestSourceAt: wanted.newestSourceAt }
    expect(theNoteSaysItIsTheBuildWanted(fromBefore, wanted)).toBe(false)
  })
})

describe('what a page makes of the port written into it', () => {
  const aPageSaying = (content: string | null): Pick<Document, 'querySelector'> => ({
    querySelector: () => (content === null ? null : ({ getAttribute: () => content } as unknown as Element)),
  })

  it('is nothing when nobody wrote a port into the page', () => {
    expect(theApiPortWrittenIntoThisPage(aPageSaying(null))).toBeNull()
  })

  it('is the port when somebody did', () => {
    expect(theApiPortWrittenIntoThisPage(aPageSaying('41731'))).toBe(41_731)
  })

  it('is a refusal when what was written is not a port, not a page calling its own server', () => {
    for (const nonsense of ['the api', '0', '70000', '80.5', '']) {
      expect(() => theApiPortWrittenIntoThisPage(aPageSaying(nonsense))).toThrow(/is not a port/)
    }
  })
})

describe('one Chromium for the worker, one context for the test', () => {
  let first: LiveApp
  let second: LiveApp

  beforeAll(async () => {
    first = await liveApp({ name: 'shares-a-browser-one', viewport: { width: 1440, height: 990 } })
    second = await liveApp({ name: 'shares-a-browser-two', viewport: { width: 1440, height: 990 } })
  })

  afterAll(async () => {
    await first?.stop()
    await second?.stop()
  })

  it('gives two stacks in one worker the same browser and not the same context', () => {
    expect(second.browser).toBe(first.browser)
    expect(second.context).not.toBe(first.context)
  })

  it('keeps what one stack stored out of the other', async () => {
    await first.page.goto(`${first.site}/#/`)
    await waitForThePage(first.page)
    await first.page.evaluate(() => {
      window.localStorage.setItem('a-thing-the-first-stack-stored', 'yes')
    })
    await second.page.goto(`${second.site}/#/`)
    await waitForThePage(second.page)
    const seen = await second.page.evaluate(() =>
      window.localStorage.getItem('a-thing-the-first-stack-stored'),
    )
    expect(seen).toBeNull()
  })

  it('built the page at most once, however many stacks this worker started', () => {
    expect(howManyTimesThisWorkerBuiltThePage()).toBeLessThanOrEqual(1)
  })
})

describe('a test that asks for the dev server by name', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({
      name: 'asks-for-the-dev-server',
      viewport: { width: 1440, height: 990 },
      theDevServerBecause: 'this file is about what only a dev server serves, which is this option itself',
    })
  })

  afterAll(async () => {
    await app?.stop()
  })

  it('gets one, and its page did not come out of a build', async () => {
    await app.page.goto(`${app.site}/#/`)
    await waitForThePage(app.page)
    expect((await whatThePageSaysAboutItsOwnAge(app))?.fromABuild).toBe(false)
  })
})
