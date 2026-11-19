// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS A CHECKOUT THAT ENDS IN A SEPARATOR IS THE SAME OFFICE. Wave 13t, round W42.
 *
 * The session hook of the installed Windows app refused to file a session. The office it asked named the
 * installation's folder with a trailing \, and the hook named the same folder without one. Each side writes its
 * checkout from the folder its own code was loaded from, and the self-check compared the two exactly. On Windows it now
 * compares each side's checkout without one trailing \ or /. On every other system a \ is part of a folder's name, and
 * a checkout is compared exactly as it was written, as before. Measured with literal worlds, with no server and no
 * write:
 *   1. on Windows, a trailing \ or / on one side only is the same office, whichever side has it;
 *   2. on Windows, two different folders still differ, and each is shown as its side wrote it;
 *   3. on Linux and on a Mac, a checkout is compared exactly as before, so a trailing / or \ is still a difference;
 *   4. the session hook's ask, and its reading of a header after a compaction, compare as the system they run on does.
 * Case 4 stands Windows in where the self-check learns which system it runs on: THIS_PLATFORM in
 * src/config/the-paths-of-a-system.mjs, read through a module stand-in. process.platform is never changed.
 *
 * MUTATIONS, in src/config/the-paths-of-a-system.mjs for the first four and src/config/the-self-check.mjs for the last
 * two:
 *   - nothing is dropped on Windows: case 1 goes red;
 *   - only a \ is dropped on Windows: case 1's / goes red;
 *   - the checkout is always the same on Windows: case 2 goes red;
 *   - the separator is dropped on every system: case 3 goes red;
 *   - the two callers compare as on Linux, whatever system they run on: case 4 goes red;
 *   - a difference names its key and not its plain words: cases 2 to 4 go red.
 */

import { describe, expect, it, vi } from 'vitest'
import { whatAWorldHeaderShows, whatAnswersForThisOffice, whatTheFactsShow } from '../src/config/the-self-check.mjs'
import { WORLD_FIELDS, WORLD_HEADER, formatWorldHeader, type WorldOnTheWire } from '../src/config/world-header.mjs'

const INSTALLED = 'C:\\Users\\somebody\\AppData\\Local\\Programs\\mole-office\\resources\\office'
const ANOTHER = 'C:\\Users\\somebody\\AppData\\Local\\Programs\\mole-office-2\\resources\\office'
const ON_LINUX = '/opt/mole-office/resources/office'
const ADDRESS = 'http://127.0.0.1:7832'

/** The world the installation declares, with its checkout as the hook names it: with no trailing separator. */
const EXPECTED: WorldOnTheWire = { database: '0123456789abcdef', repository: INSTALLED, port: '7832', head: '', standing: '' }

/** The world as the office answers it, with its own commit and standing, from the folder `repository`. */
const answeredFrom = (repository: string): WorldOnTheWire => ({ ...EXPECTED, repository, head: 'abc1234', standing: 'canonical' })

const THE_SAME = { differences: [], unknowns: [] }

/** The plain words for the checkout, as the self-check takes them from the list of a world's facts. */
const THE_CHECKOUTS_WORDS = WORLD_FIELDS.find((field) => field.key === 'repository')?.what
if (THE_CHECKOUTS_WORDS === undefined) throw new Error("src/config/world-header.mjs no longer lists a world's checkout.")

/** The one difference two checkouts make, each as its side wrote it. */
const theCheckoutDiffers = (expected: string, answered: string) => ({
  differences: [{ key: 'repository', what: THE_CHECKOUTS_WORDS, expected, answered }],
  unknowns: [],
})

/**
 * THE SYSTEM THE SELF-CHECK RUNS ON WHEN IT IS GIVEN NONE, stood in only while `layer.system` is set, for case 4. The
 * other cases give the system to the self-check.
 */
const layer = vi.hoisted(() => ({ system: null as null | NodeJS.Platform }))
vi.mock('../src/config/the-paths-of-a-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-paths-of-a-system.mjs')>()
  return {
    ...real,
    get THIS_PLATFORM() {
      return layer.system ?? real.THIS_PLATFORM
    },
  }
})

/** Run `read` while the self-check is told that it runs on `platform`, and stop telling it after. */
async function on<T>(platform: NodeJS.Platform, read: () => Promise<T> | T): Promise<T> {
  layer.system = platform
  try {
    return await read()
  } finally {
    layer.system = null
  }
}

describe('a checkout that ends in a separator, on Windows and elsewhere', () => {
  it('1: on Windows, a trailing \\ or / on one side only is the same office, whichever side has it', () => {
    expect(whatTheFactsShow(EXPECTED, answeredFrom(`${INSTALLED}\\`), 'win32')).toEqual(THE_SAME)
    expect(whatTheFactsShow({ ...EXPECTED, repository: `${INSTALLED}\\` }, answeredFrom(INSTALLED), 'win32')).toEqual(THE_SAME)
    const forward = INSTALLED.replaceAll('\\', '/')
    expect(whatTheFactsShow({ ...EXPECTED, repository: forward }, answeredFrom(`${forward}/`), 'win32')).toEqual(THE_SAME)
    expect(whatTheFactsShow({ ...EXPECTED, repository: `${forward}/` }, answeredFrom(forward), 'win32')).toEqual(THE_SAME)
    expect(whatTheFactsShow(EXPECTED, answeredFrom(INSTALLED), 'win32')).toEqual(THE_SAME)
  })

  it('2: on Windows, two different folders still differ, and each is shown as its side wrote it', () => {
    expect(whatTheFactsShow(EXPECTED, answeredFrom(`${ANOTHER}\\`), 'win32')).toEqual(theCheckoutDiffers(INSTALLED, `${ANOTHER}\\`))
    expect(whatTheFactsShow(EXPECTED, answeredFrom(ANOTHER), 'win32')).toEqual(theCheckoutDiffers(INSTALLED, ANOTHER))
    const below = `${INSTALLED}\\old\\`
    expect(whatTheFactsShow(EXPECTED, answeredFrom(below), 'win32')).toEqual(theCheckoutDiffers(INSTALLED, below))
  })

  it('3: on Linux and on a Mac, a checkout is compared exactly as before', () => {
    const declared: WorldOnTheWire = { ...EXPECTED, repository: ON_LINUX }
    for (const platform of ['linux', 'darwin'] as const) {
      expect(whatTheFactsShow(declared, answeredFrom(ON_LINUX), platform)).toEqual(THE_SAME)
      for (const answered of [`${ON_LINUX}/`, `${ON_LINUX}\\`]) {
        expect(whatTheFactsShow(declared, answeredFrom(answered), platform)).toEqual(theCheckoutDiffers(ON_LINUX, answered))
      }
    }
    // WITH TWO ARGUMENTS IT COMPARES AS THIS SYSTEM DOES, and this one is not Windows.
    expect(process.platform).not.toBe('win32')
    expect(whatTheFactsShow(declared, answeredFrom(`${ON_LINUX}/`))).toEqual(theCheckoutDiffers(ON_LINUX, `${ON_LINUX}/`))
    expect(whatTheFactsShow(EXPECTED, answeredFrom(`${INSTALLED}\\`))).toEqual(theCheckoutDiffers(INSTALLED, `${INSTALLED}\\`))
  })

  it("4: the session hook's ask and its reading of a header compare as the system they run on does", async () => {
    const office = answeredFrom(`${INSTALLED}\\`)
    const header = formatWorldHeader(office)
    const ask = () =>
      whatAnswersForThisOffice({
        address: ADDRESS,
        expected: EXPECTED,
        asks: 1,
        fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { headers: { [WORLD_HEADER]: header } }),
      })
    const read = () => whatAWorldHeaderShows(header, ADDRESS, EXPECTED)
    expect((await on('win32', ask)).answer).toBe('healthy')
    expect((await on('win32', read)).answer).toBe('same-world')
    const differs = { answer: 'wrong-world', differences: theCheckoutDiffers(INSTALLED, `${INSTALLED}\\`).differences }
    expect(await on('linux', ask)).toMatchObject(differs)
    expect(await on('linux', read)).toMatchObject(differs)
  })
})
