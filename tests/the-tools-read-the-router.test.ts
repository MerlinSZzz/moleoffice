// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLS THAT DRIVE A BROWSER READ THE RECORD PAGE'S ADDRESS OUT OF THE ROUTER, AND THIS FAILS
 * IN A SECOND WHEN THEY CANNOT.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT WENT WRONG, AND WHY A FAST TEST IS THE FIX
 * ------------------------------------------------------------------------------------------
 *
 * tools/legibility.mjs, tools/review.mjs and tools/accept.mjs each drive a browser at a record
 * page, so each needs to know that a record page lives at `/r/<id>`. None of them may write that
 * down: `recordPath` in src/web/components/router.tsx is the function the app itself navigates
 * with, and a second copy of the address in a tool is a second place to keep in step. So each of
 * them read the address out of the router's source — with its own copy of the same regular
 * expression.
 *
 * Wave 5 step 3 (`c3b3b5d`) gave `recordPath` a second argument and a conditional body. All three
 * patterns stopped matching on the same day. The cost was not the three throws; it was that
 * `node tools/review.mjs` throws before it photographs anything, so the four-width screen review
 * did not run for a whole round and nobody looked at 990 or 660 on any screen wave 5 or wave 6
 * built. The three tools take minutes each and are run by hand, so nothing said.
 *
 * There is one parser now, in tools/read-the-router.mjs, and this file runs it against the real
 * router on every suite run. Two things are asserted, and the second is the one that keeps the
 * first honest.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { recordPath } from '../src/web/components/router.tsx'
import { MESSAGE_SEGMENT, PROBLEM_SEGMENT, SESSION_SEGMENT } from '../src/shared/addresses.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const routerFile = `${root}src/web/components/router.tsx`

/**
 * The parser, loaded at run time.
 *
 * IT IS IMPORTED THROUGH A VARIABLE ON PURPOSE. The tools are plain `.mjs` files with no types and
 * this project does not compile JavaScript, so a literal `import` of one would not typecheck. The
 * shape it is used at is written out below, which is the only thing this test needs of it.
 */
type ReadTheRouter = {
  recordPrefixFrom: (source: string, routerFile: string) => string
  segmentFrom: (source: string, declaration: string, file: string, page: string) => string
  visitorSegmentFrom: (source: string, file: string) => string
  profileSegmentFrom: (source: string, file: string) => string
}
const load = async (): Promise<ReadTheRouter> =>
  (await import(new URL('../tools/read-the-router.mjs', import.meta.url).href)) as ReadTheRouter

describe('the browser tools read the record page address out of the router', () => {
  it('reads a prefix the router itself agrees with', async () => {
    const { recordPrefixFrom } = await load()
    const prefix = recordPrefixFrom(readFileSync(routerFile, 'utf8'), routerFile)

    // THE EXPECTATION IS DERIVED FROM `recordPath`, NOT TYPED HERE. Writing `/r/` into this file
    // would make it a fourth place holding the address, which is the defect under test.
    const id = 'an-id-with-nothing-special-in-it'
    expect(prefix).not.toBe('')
    expect(recordPath(id)).toBe(`${prefix}${id}`)
  })

  it('says which file it could not read, rather than guessing an address', async () => {
    const { recordPrefixFrom } = await load()
    // A router whose `recordPath` this cannot read. The tool that gets an address out of this is
    // the tool that photographs the wrong page and reports what it saw there.
    const unreadable = 'export const recordPath = (id: string) => addressOf(id)\n\n'
    expect(() => recordPrefixFrom(unreadable, '/somewhere/router.tsx')).toThrow(/\/somewhere\/router\.tsx/)
    expect(() => recordPrefixFrom('nothing like it at all', '/somewhere/router.tsx')).toThrow(/recordPath/)
  })

  it('reads the message, problem and session address segments from their declarations', async () => {
    const { segmentFrom } = await load()
    const addressesFile = `${root}src/shared/addresses.ts`
    const source = readFileSync(addressesFile, 'utf8')
    expect(segmentFrom(source, 'MESSAGE_SEGMENT', addressesFile, "a message's own page")).toBe(MESSAGE_SEGMENT)
    expect(segmentFrom(source, 'PROBLEM_SEGMENT', addressesFile, "a problem's own page")).toBe(PROBLEM_SEGMENT)
    expect(segmentFrom(source, 'SESSION_SEGMENT', addressesFile, "an agent run's own page")).toBe(SESSION_SEGMENT)
  })

  it('names the page whose address it could not read', async () => {
    // WHAT THIS CATCHES. The three readers of a segment declaration became one, and the first
    // version of that one said "this page's address segment" for every page. A person reading the
    // error could no longer tell which page the tool had failed to reach.
    const { segmentFrom, visitorSegmentFrom, profileSegmentFrom } = await load()
    const nothing = 'no declaration in here'
    expect(() => visitorSegmentFrom(nothing, '/somewhere/visitors.ts')).toThrow(
      "Could not read `VISITOR_SEGMENT` out of /somewhere/visitors.ts, which is where the address of a visiting agent's credential page is declared.",
    )
    expect(() => profileSegmentFrom(nothing, '/somewhere/profile.ts')).toThrow(
      "Could not read `PROFILE_SEGMENT` out of /somewhere/profile.ts, which is where the address of a participant's page is declared.",
    )
    expect(() => segmentFrom(nothing, 'SESSION_SEGMENT', '/somewhere/addresses.ts', "an agent run's own page")).toThrow(
      "which is where the address of an agent run's own page is declared.",
    )
  })

})
