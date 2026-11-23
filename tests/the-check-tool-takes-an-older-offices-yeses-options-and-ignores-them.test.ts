// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK TOOL TAKES THE YESES OPTIONS AN OLDER OFFICE GIVES, AND IGNORES THEM.
 *
 * Until 12 November 2026 the office gave tools/the-inspector.mjs one of --yeses <file>, --yeses-of <run> and
 * --no-yeses <why>, and the tool read them into each path's why. That code is deleted, and this revision reads no
 * yeses. An office of an older revision may still start this tool with them. The tool must not stop on an option it
 * does not know, and must not read or pass on what the options hold. So it takes all three, ignores what they hold,
 * and writes one line saying which of them it was given and that it ignores them.
 *
 * The office is the fixture's stand-in, every check is --dry, and no model runs. The file given to --yeses does not
 * exist, so a tool that tried to read it would say so.
 *
 * Mutations, each after a control run, then restored:
 *   1. The parsing of --yeses-of taken out. The tool stops on an option it does not know, and the cases that give
 *      --yeses-of go red.
 *   2. The line taken out. Every case that gives an option goes red.
 *   3. The line names the options in the order they were given. The case with all three goes red.
 */
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BECAUSE_THIS_REVISION_READS_NO_YESES, THE_YESES_OPTIONS, theYesesOptionsAreIgnored } from '../src/config/inspection-ending.mjs'
import { inspectorFixture } from './inspector-tool-fixture.ts'

// THE LINE, read from src/config/inspection-ending.mjs, where the tool takes it.
const GIVEN_ALL_THREE = theYesesOptionsAreIgnored(THE_YESES_OPTIONS)
const GIVEN_ONE = (option: string) => theYesesOptionsAreIgnored([option])
/** The words every form of the line ends with, to see that no line was written. */
const ANY_LINE = BECAUSE_THIS_REVISION_READS_NO_YESES
const AN_UNKNOWN_OPTION = 'I do not know the option'

/** A run id that names no run, and a sentence nobody wrote, both made up for this test. */
const ANOTHER_RUN = 'madeUpOthr01'
const A_REASON = 'A made-up reason that no yeses file was handed over.'

let fixture: Awaited<ReturnType<typeof inspectorFixture>>
/** A file the --yeses option names, which nobody wrote. */
let aMissingFile: string
beforeEach(async () => {
  fixture = await inspectorFixture()
  aMissingFile = join(fixture.home, 'a-file-nobody-wrote.json')
})
afterEach(async () => {
  await fixture.close()
})

/** How many times `part` appears in `text`. */
const timesIn = (text: string, part: string) => text.split(part).length - 1

describe('the check tool takes an older office\'s yeses options and ignores them', () => {
  it('writes no line about yeses when it is given none of the options', async () => {
    const result = await fixture.inspect([])
    expect(result.code, result.err).toBe(0)
    expect(result.out).not.toContain(ANY_LINE)
    expect(result.err).not.toContain(ANY_LINE)
  })

  it('takes all three, says once that it ignores them, and reads, sends and writes nothing of what they hold', async () => {
    const result = await fixture.inspect(['--no-yeses', A_REASON, '--yeses', aMissingFile, '--yeses-of', ANOTHER_RUN])
    expect(result.code, result.err).toBe(0)
    expect(result.err).not.toContain(AN_UNKNOWN_OPTION)
    expect(timesIn(result.out, GIVEN_ALL_THREE), result.out).toBe(1)
    expect(timesIn(result.out + result.err, ANY_LINE), result.out).toBe(1)
    const assembled = fixture.state.writes.filter((one) => one.path === `/api/checks/${fixture.run}/assembled`)
    expect(assembled).toHaveLength(1)
    const everything = result.out + result.err + JSON.stringify(fixture.state.writes) + JSON.stringify(fixture.state.requests)
    for (const held of ['a-file-nobody-wrote', ANOTHER_RUN, A_REASON]) expect(everything, held).not.toContain(held)
    expect(fixture.state.requests.filter((one) => one.path.includes('yeses'))).toEqual([])
  })

  it.each([
    ['--yeses-of', (): string => ANOTHER_RUN],
  ] as const)('takes %s alone and names only it in its line', async (option, value) => {
    const result = await fixture.inspect([option, value()])
    expect(result.code, result.err).toBe(0)
    expect(result.err).not.toContain(AN_UNKNOWN_OPTION)
    expect(timesIn(result.out, GIVEN_ONE(option)), result.out).toBe(1)
    expect(timesIn(result.out + result.err, ANY_LINE), result.out).toBe(1)
    expect(result.out + result.err).not.toContain(value())
  })
})
