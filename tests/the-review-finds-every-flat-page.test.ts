// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW FINDS EVERY FLAT PAGE THE ROUTER DECLARES, HOWEVER ITS KEY IS WRITTEN.
 *
 * tools/review.mjs reads the list of pages to photograph out of FLAT_ROUTES in
 * src/shared/addresses.ts, as text (it is a script, and the router is TypeScript). On 28 September
 * 2026 Settings' key there became `[SETTINGS_SEGMENT]`, a key named by a constant, when its address
 * learnt to name one panel. The review's pattern read only a key written out, so Settings dropped
 * out of its pages and its own coverage check stopped every run with "Never reached: settings".
 * tools/legibility.mjs broke the same way, and the merge queue caught that one (entry H6Ks96nYBxGP).
 * Nothing caught the review, because no test ran its discovery.
 *
 * So this runs `pagesFrom` itself, lifted out of tools/review.mjs the way
 * tests/review-counts-chinese-by-characters.test.ts lifts `wordsIn`, over the real addresses file,
 * and compares what it found with FLAT_ROUTES as the app itself imports it. A page the router
 * declares and the review never finds fails here, by name, before the queue.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { FLAT_ROUTES, settingsPath } from '../src/shared/addresses.ts'
import { segmentFrom } from '../tools/read-the-router.mjs'

const review = readFileSync(new URL('../tools/review.mjs', import.meta.url), 'utf8')
const addressesFile = fileURLToPath(new URL('../src/shared/addresses.ts', import.meta.url))
const workFile = fileURLToPath(new URL('../src/shared/work.ts', import.meta.url))

/** One top-level function of tools/review.mjs, by name, as written there. */
function lifted(name: string): string {
  const found = new RegExp(`^function ${name}\\([^]*?\\n\\}\\n`, 'm').exec(review)?.[0]
  expect(found, `${name} is missing from tools/review.mjs`).toBeDefined()
  return found as string
}

type Page = { name: string; address: string; route?: string }

/** tools/review.mjs's own page discovery, run over the real addresses file. */
function pagesTheReviewFinds(): Page[] {
  const code = `${lifted('renamedSegments')}\n${lifted('familyKeys')}\n${lifted('pagesFrom')}\npagesFrom(source)`
  return runInNewContext(code, {
    source: readFileSync(addressesFile, 'utf8'),
    addressesFile,
    workFile,
    readFileSync,
    segmentFrom,
  }) as Page[]
}

it('finds every page FLAT_ROUTES maps to, whether its key is written out or named by a constant', () => {
  const found = new Set(pagesTheReviewFinds().map((page) => page.name))
  const declared = [...new Set(Object.values(FLAT_ROUTES))]
  const dropped = declared.filter((name) => !found.has(name))
  expect(dropped, 'pages the router declares and tools/review.mjs never photographs').toEqual([])
})

it('reaches Settings at the address the app builds for it', () => {
  const settings = pagesTheReviewFinds().find((page) => page.name === 'settings')
  expect(settings?.address).toBe(`#${settingsPath()}`)
})
