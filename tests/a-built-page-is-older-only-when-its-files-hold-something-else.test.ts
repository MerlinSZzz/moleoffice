// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BUILT PAGE IS OLDER THAN THE CHECKOUT ONLY WHEN THE FILES IT IS BUILT FROM HOLD SOMETHING ELSE NOW.
 *
 * The owner's report of 26 October 2026 (wave 13y round 87): the line saying the page is behind the
 * checkout came back a few seconds after every load, a forced reload too. The page had been built at
 * 13:28:51 from the commit the office was serving. Some of the files it was built from were touched at
 * 13:31:31 and not changed. The page was judged by file times alone: a file newer than the build made
 * the page "behind", and no reload could change that, because a reload serves the same build.
 *
 * WHAT DECIDES NOW. A build records a digest of what it read: the path and the contents of every file
 * the page is built from (src/config/content-digest.mjs). The server works out the same digest from the
 * checkout as it is now. When both are known, a built page is behind when the two differ, and the
 * times do not matter. When one is not known, the times decide as before, and the row says so.
 *
 * A PAGE FROM A DEV SERVER IS STILL JUDGED BY TIMES, and that is right for it. Vite gives the page a
 * new stamp on every change to one of those files, a touch too, so its time is never older than the
 * file's for long.
 *
 * WHAT THIS FILE PROVES:
 *   1. the comparison on the page, without a browser: a touch after the build draws no row; another
 *      content draws one whatever the times say; a missing digest leaves the times to decide and says
 *      so on the row; a dev page is judged as before;
 *   2. the digest, on a small checkout made for this file: a touch leaves it, a changed byte or a new
 *      import changes it, and the same bytes give the same digest again;
 *   3. the server reports the digest of this checkout, in its freshness reading and in the part of the
 *      machine reading an open page is told about;
 *   4. the module Vite serves the page carries the digest in a build and none from a dev server.
 */
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { formatFreshnessHeader } from '../src/config/freshness-header.mjs'
import { forgetTheWalks } from '../src/config/import-graph.mjs'
import { THE_PAGES_ENTRY, newestSourceBuiltFrom } from '../src/config/newest-source.mjs'
import { REPO_ROOT } from '../src/config/settings.mjs'
import {
  THE_CODE_THIS_PAGE_IS_RUNNING,
  compareThisPageWith,
  forgetTheWorldOnThisPage,
  howOldTheServerSaysItIs,
  thisPageIsBehindTheCheckout,
  type RuntimeFactsForThePage,
} from '../src/web/lib/world.ts'

/** The moment every comparison below is measured against, so nothing here depends on the wall clock. */
const NOW = new Date('2026-10-26T13:35:00').getTime()
/** When the page was built. */
const BUILT_AT = '2026-10-26 13:28:51'
/** A file the page is built from, touched after the build. */
const TOUCHED_AT = '2026-10-26 13:31:31'
/** A file the page is built from, last changed before the build. */
const CHANGED_BEFORE = '2026-10-26 13:20:00'
const WHAT_THE_BUILD_READ = '0123456789abcdef'
const SOMETHING_ELSE = 'fedcba9876543210'
const PAGE_ADDRESS = 'http://127.0.0.1:5173'

/** What the server says of the files the page is built from: the newest time, and the digest of what they hold. */
function theCheckout(newest: string, content: string | null): RuntimeFactsForThePage {
  return {
    addresses: { canonicalWeb: PAGE_ADDRESS, canonicalWebForOtherMachines: null },
    database: {
      path: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`,
      canonicalPath: `${THE_TEST_FIXTURE_ROOT}/panelx/data/panelx.db`,
      canonical: true,
    },
    freshness: {
      verdict: 'as new as the checkout',
      newestOnDisk: newest,
      newestOnDiskFile: 'src/web/App.tsx',
      newestForThePage: newest,
      newestFileForThePage: 'src/web/App.tsx',
      contentForThePage: content,
    },
    supervisor: { failedStarts: null },
  }
}

/**
 * The comparison twice, the second after the grace, as the page makes it. Returns the row about this
 * page's own code from the second, or undefined when there is none.
 */
function judged(facts: RuntimeFactsForThePage, page: { servedAt: string; fromABuild: boolean; contentDigest: string | null }) {
  howOldTheServerSaysItIs(formatFreshnessHeader({ verdict: 'fresh', staleFor: null, grace: 15 }), NOW)
  compareThisPageWith(facts, PAGE_ADDRESS, page, NOW)
  return compareThisPageWith(facts, PAGE_ADDRESS, page, NOW + 16_000).find((one) => one.what === THE_CODE_THIS_PAGE_IS_RUNNING)
}

describe('the comparison on the page', () => {
  afterEach(() => {
    forgetTheWorldOnThisPage()
  })

  it('a built page whose files were touched after the build and hold what the build read is not behind', () => {
    const row = judged(theCheckout(TOUCHED_AT, WHAT_THE_BUILD_READ), {
      servedAt: BUILT_AT,
      fromABuild: true,
      contentDigest: WHAT_THE_BUILD_READ,
    })
    expect(row, 'a touch without a change made the built page behind').toBeUndefined()
    expect(thisPageIsBehindTheCheckout(), 'the page counts itself behind').toBe(false)
  })

  it('a built page whose files hold something else now is behind, whatever their times say', () => {
    const row = judged(theCheckout(CHANGED_BEFORE, SOMETHING_ELSE), {
      servedAt: BUILT_AT,
      fromABuild: true,
      contentDigest: WHAT_THE_BUILD_READ,
    })
    expect(row, 'a changed file drew no row because its time was older than the build').toBeDefined()
    expect(row?.onTheServer).toContain('hold something other than')
  })

  it('a built page is judged by the times when the server does not say what the files hold, and the row says so', () => {
    const row = judged(theCheckout(TOUCHED_AT, null), {
      servedAt: BUILT_AT,
      fromABuild: true,
      contentDigest: WHAT_THE_BUILD_READ,
    })
    expect(row, 'with no digest from the server, a newer file drew no row').toBeDefined()
    expect(row?.doThis).toContain("judged by the files' times alone, because the server did not say what those files hold")
  })

  it('a page from a build that recorded no digest is judged by the times, and the row says so', () => {
    const row = judged(theCheckout(TOUCHED_AT, WHAT_THE_BUILD_READ), {
      servedAt: BUILT_AT,
      fromABuild: true,
      contentDigest: null,
    })
    expect(row, 'with no digest from the build, a newer file drew no row').toBeDefined()
    expect(row?.doThis).toContain("judged by the files' times alone, because this page's build did not record what it read")
  })

  it('a page from a dev server is judged by the times, as before, and the row adds nothing about it', () => {
    const page = { servedAt: BUILT_AT, fromABuild: false, contentDigest: null }
    const behind = judged(theCheckout(TOUCHED_AT, SOMETHING_ELSE), page)
    expect(behind, 'a dev page served before a newer file drew no row').toBeDefined()
    expect(behind?.doThis).not.toContain('times alone')
    forgetTheWorldOnThisPage()
    expect(judged(theCheckout(CHANGED_BEFORE, SOMETHING_ELSE), page), 'a dev page as new as its files drew a row').toBeUndefined()
  })
})

describe('the digest of what a page is built from', () => {
  let root = ''
  const write = (file: string, text: string): void => {
    writeFileSync(join(root, file), text)
  }
  /**
   * A WRITE WITH A TIME OF ITS OWN, so the times run forward as they do on a machine. This file's
   * writes land within one tick of the file system's clock, and the import graph walks the files again
   * only for a time newer than its last walk's newest, so two writes in one tick would look like one.
   */
  const writeAt = (secondsAgo: number, file: string, text: string): void => {
    write(file, text)
    const at = new Date(Date.now() - secondsAgo * 1000)
    utimesSync(join(root, file), at, at)
  }

  beforeAll(() => {
    root = aTestDatabaseFolder('content-digest')
    mkdirSync(join(root, 'src/web'), { recursive: true })
    write(THE_PAGES_ENTRY, '<!doctype html>\n<script type="module" src="./main.tsx"></script>\n')
    write('src/web/main.tsx', "import { said } from './a.ts'\nconsole.log(said)\n")
    write('src/web/a.ts', "export const said = 'one'\n")
    write('src/web/b.ts', "export const more = 'two'\n")
    // THE TIMES RUN FORWARD: the files are two minutes old, the touch below is a minute old, and each
    // later write is ten seconds newer than the one before.
    const past = new Date(Date.now() - 120_000)
    for (const file of [THE_PAGES_ENTRY, 'src/web/main.tsx', 'src/web/a.ts', 'src/web/b.ts']) utimesSync(join(root, file), past, past)
  })

  afterAll(() => {
    removeThisTestFolder(root)
  })

  it('is the same after a touch, another after a changed byte or a new import, and the same again for the same bytes', async () => {
    const { digestOfTheFilesBuiltFrom } = await import('../src/config/content-digest.mjs')
    forgetTheWalks()
    const first = digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, root)
    expect(first.digest).toMatch(/^[0-9a-f]{16}$/)
    expect(first.files, 'the digest is not over the three files the page is built from').toBe(3)

    // A TOUCH. The times say the page's files are newer than they were; the digest says they hold the same.
    const before = newestSourceBuiltFrom(THE_PAGES_ENTRY, root)
    const later = new Date(Date.now() - 60_000)
    for (const file of [THE_PAGES_ENTRY, 'src/web/main.tsx', 'src/web/a.ts']) utimesSync(join(root, file), later, later)
    const touched = newestSourceBuiltFrom(THE_PAGES_ENTRY, root)
    expect(touched?.at.getTime(), 'the touch did not move the newest time').toBeGreaterThan(before?.at.getTime() ?? Infinity)
    expect(digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, root).digest, 'a touch changed the digest').toBe(first.digest)

    // ONE BYTE, the length kept, so the size alone cannot tell.
    writeAt(50, 'src/web/a.ts', "export const said = 'One'\n")
    expect(digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, root).digest, 'a changed byte left the digest').not.toBe(first.digest)
    writeAt(40, 'src/web/a.ts', "export const said = 'one'\n")
    expect(digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, root).digest, 'the same bytes again gave another digest').toBe(first.digest)

    // A NEW IMPORT brings a file into the set.
    writeAt(30, 'src/web/main.tsx', "import { said } from './a.ts'\nimport { more } from './b.ts'\nconsole.log(said, more)\n")
    const grown = digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, root)
    expect(grown.files, 'the new import did not bring b.ts into the set').toBe(4)
    expect(grown.digest, 'a new import left the digest').not.toBe(first.digest)
  })
})

describe('what the server and the build say', () => {
  let t: TestDb

  beforeAll(async () => {
    t = await freshDb()
  }, 60_000)

  afterAll(() => {
    t.close()
  })

  it('the server reports the digest of the files this checkout builds the page from', async () => {
    const { digestOfTheFilesBuiltFrom } = await import('../src/config/content-digest.mjs')
    const { Gaps, freshness, whatAPageHoldsOfTheMachine } = await import('../src/server/lib/runtime.ts')
    const expected = digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, REPO_ROOT).digest
    expect(freshness(new Gaps()).contentForThePage, 'the freshness reading').toBe(expected)
    // An open page is told the machine moved when this part moves, so the digest is in it.
    expect(JSON.parse(whatAPageHoldsOfTheMachine().freshness), 'the part an open page is told about').toContain(expected)
  })

  it('the module Vite serves the page carries the digest in a build and none from a dev server', async () => {
    const { digestOfTheFilesBuiltFrom } = await import('../src/config/content-digest.mjs')
    const { serveTheSourceStamp } = await import('../vite.config.ts')
    const expected = digestOfTheFilesBuiltFrom(THE_PAGES_ENTRY, REPO_ROOT).digest
    const served = (command: 'build' | 'serve'): string => {
      const plugin = serveTheSourceStamp()
      ;(plugin.configResolved as (config: { command: string }) => void)({ command })
      const id = (plugin.resolveId as (id: string) => string | null)('virtual:mole-office-served')
      if (id === null) throw new Error('the plugin does not resolve the served module')
      return String((plugin.load as (id: string) => string | null)(id))
    }
    expect(served('build'), 'a build').toContain(`export const contentDigest = ${JSON.stringify(expected)}`)
    expect(served('serve'), 'a dev server').toContain('export const contentDigest = null')
  })
})
