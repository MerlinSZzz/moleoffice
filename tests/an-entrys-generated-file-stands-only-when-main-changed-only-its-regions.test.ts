// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENTRY'S VERSION OF A GENERATED FILE STANDS ON MAIN'S ONLY WHEN MAIN CHANGED ONLY ITS GENERATED REGIONS.
 *
 * tools/merge-tool/generated-regions.mjs answers one question for the merge queue's bus: given the base, the entry's
 * and main's text of a generated file, may the entry's version stand without a new check? It says yes only when
 * (a) the three hold the same balanced marker pairs, by name and order, (b) the entry changed nothing inside a pair
 * and main changed nothing outside them, and (c) git merge-file merges the three without a conflict. These are the
 * conditions the merge tool's keeper set, wave 13p round 29.
 *
 * Every document here is synthetic and says so. MUTATION PROOFS: one per behaviour, kept with the round's report.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { whetherTheEntrysVersionStands } from '../tools/merge-tool/generated-regions.mjs'
import { endMarker, startMarker } from '../tools/test-audit-table-markers.mjs'

/** A synthetic generated document: two regions, and hand-written lines before, between and after them. */
const BASE = [
  '# A synthetic generated document',
  '',
  'Hand-written opening line.',
  '',
  startMarker('alpha'),
  '| a | 1 |',
  '| b | 2 |',
  '| c | 3 |',
  endMarker('alpha'),
  '',
  'Hand-written middle line.',
  '',
  startMarker('beta'),
  '| d | 4 |',
  '| e | 5 |',
  '| f | 6 |',
  endMarker('beta'),
  '',
  'Hand-written closing line.',
  '',
].join('\n')

/** `text` with its one `from` replaced by `to`; a fixture that does not hold `from` exactly once is a broken test. */
function edit(text: string, from: string, to: string): string {
  expect(text.split(from).length - 1, `the fixture holds ${JSON.stringify(from)} once`).toBe(1)
  return text.replace(from, to)
}

/** The entry's ordinary change: a hand-written line. */
const byTheEntry = (text: string) => edit(text, 'Hand-written opening line.', 'Hand-written opening line, edited by the entry.')
/** Main's ordinary change: a generated row, as the generator rewrites it. */
const byMain = (text: string) => edit(text, '| e | 5 |', '| e | 50 |')

/**
 * `call`, WITH TMPDIR NAMING `folder`. The tool makes its folder in os.tmpdir(), which reads TMPDIR at each call, so a
 * test can point it at a folder the test made and list only that one, not the machine's whole temporary folder.
 */
function withTmpdir<T>(folder: string, call: () => T): T {
  const was = process.env['TMPDIR']
  process.env['TMPDIR'] = folder
  try {
    return call()
  } finally {
    if (was === undefined) delete process.env['TMPDIR']
    else process.env['TMPDIR'] = was
  }
}

describe("whether an entry's version of a generated file stands", () => {
  it('stands when the entry changed only hand-written lines and main changed only generated ones', () => {
    expect(whetherTheEntrysVersionStands({ base: BASE, entry: byTheEntry(BASE), main: byMain(BASE) })).toEqual({ stands: true })
  })

  it('does not stand when the entry changed a line inside a region', () => {
    const entry = edit(byTheEntry(BASE), '| b | 2 |', '| b | 20 |')
    expect(whetherTheEntrysVersionStands({ base: BASE, entry, main: byMain(BASE) })).toEqual({
      stands: false,
      why: 'The entry changed lines inside region alpha, which only the generator writes.',
    })
  })

  it('does not stand when main changed a hand-written line', () => {
    const main = edit(byMain(BASE), 'Hand-written closing line.', 'Hand-written closing line, edited on main.')
    expect(whetherTheEntrysVersionStands({ base: BASE, entry: byTheEntry(BASE), main })).toEqual({
      stands: false,
      why: 'Main changed hand-written lines after region beta.',
    })
  })

  it('does not stand when the entry and main both changed lines inside one region, even lines git could merge', () => {
    const entry = edit(byTheEntry(BASE), '| a | 1 |', '| a | 10 |')
    const main = edit(BASE, '| c | 3 |', '| c | 30 |')
    expect(whetherTheEntrysVersionStands({ base: BASE, entry, main })).toEqual({
      stands: false,
      why: 'The entry changed lines inside region alpha, which only the generator writes.',
    })
  })

  /** The three versions with `change` made to `which` alone; the other two carry the ordinary changes. */
  const withOneChanged = (which: 'base' | 'entry' | 'main', change: (text: string) => string) => {
    const base = which === 'base' ? change(BASE) : BASE
    const entry = which === 'entry' ? change(byTheEntry(BASE)) : byTheEntry(BASE)
    const main = which === 'main' ? change(byMain(BASE)) : byMain(BASE)
    return whetherTheEntrysVersionStands({ base, entry, main })
  }

  it.each(['base', 'entry', 'main'] as const)('does not stand when a marker pair is renamed in %s', (which) => {
    const renamed = (text: string) => edit(edit(text, startMarker('alpha'), startMarker('gamma')), endMarker('alpha'), endMarker('gamma'))
    const answer = withOneChanged(which, renamed)
    expect(answer.stands).toBe(false)
    expect(answer.why).toBe(
      which === 'base'
        ? 'The marker pairs differ: the base holds gamma, beta, and entry holds alpha, beta.'
        : `The marker pairs differ: the base holds alpha, beta, and ${which} holds gamma, beta.`,
    )
  })

  it.each(['base', 'entry', 'main'] as const)('does not stand when a marker pair is added in %s', (which) => {
    const added = (text: string) => edit(text, 'Hand-written closing line.\n', `Hand-written closing line.\n${startMarker('gamma')}\n| g | 7 |\n${endMarker('gamma')}\n`)
    const answer = withOneChanged(which, added)
    expect(answer.stands).toBe(false)
    expect(answer.why).toBe(
      which === 'base'
        ? 'The marker pairs differ: the base holds alpha, beta, gamma, and entry holds alpha, beta.'
        : `The marker pairs differ: the base holds alpha, beta, and ${which} holds alpha, beta, gamma.`,
    )
  })

  it.each(['base', 'entry', 'main'] as const)('does not stand when a marker is moved in %s', (which) => {
    // THE START OF REGION BETA MOVES UP ONE LINE, so a hand-written line passes inside it.
    const moved = (text: string) => edit(text, `Hand-written middle line.\n\n${startMarker('beta')}\n`, `${startMarker('beta')}\nHand-written middle line.\n\n`)
    expect(withOneChanged(which, moved)).toEqual({
      stands: false,
      why: which === 'main' ? 'Main changed hand-written lines between regions alpha and beta.' : 'The entry changed lines inside region beta, which only the generator writes.',
    })
  })

  it.each(['base', 'entry', 'main'] as const)('does not stand when a pair is left open, or closed twice, in %s', (which) => {
    const leftOpen = (text: string) => edit(text, `${endMarker('beta')}\n`, '')
    expect(withOneChanged(which, leftOpen)).toEqual({ stands: false, why: `In ${which}, ${startMarker('beta')} has no end marker.` })
    const closedTwice = (text: string) => edit(text, 'Hand-written closing line.\n', `Hand-written closing line.\n${endMarker('alpha')}\n`)
    expect(withOneChanged(which, closedTwice)).toEqual({ stands: false, why: `In ${which}, ${endMarker('alpha')} closes a region that was never opened.` })
    const crossed = (text: string) => edit(text, endMarker('beta'), endMarker('alpha'))
    expect(withOneChanged(which, crossed)).toEqual({ stands: false, why: `In ${which}, ${startMarker('beta')} is closed by ${endMarker('alpha')}.` })
  })

  it("does not stand when git cannot put the entry's hand-written words beside a line main changed", () => {
    // HAND-WRITTEN WORDS ON A MARKER'S OWN LINE: the entry changes them, and main changes the first generated row
    // under that line. Each change keeps to its own side of the marker, so (a) and (b) hold, and git still cannot merge.
    const base = edit(BASE, `${startMarker('alpha')}\n`, `Totals by hand: ${startMarker('alpha')}\n`)
    const entry = edit(base, 'Totals by hand:', 'Totals, written by hand:')
    const main = edit(base, '| a | 1 |', '| a | 10 |')
    expect(whetherTheEntrysVersionStands({ base, entry, main })).toEqual({
      stands: false,
      why: "git merge-file found 1 conflict between the entry's lines and main's, so they are too close to put together.",
    })
    // A DOCUMENT THAT ENDS ON AN END MARKER WITH NO NEWLINE: the entry adds a hand-written line after it, which changes
    // that last line, and main adds a generated row just above it.
    const ending = `${BASE}${startMarker('gamma')}\n| g | 7 |\n${endMarker('gamma')}`
    expect(
      whetherTheEntrysVersionStands({
        base: ending,
        entry: `${ending}\nHand-written line after the last table.\n`,
        main: edit(ending, '| g | 7 |\n', '| g | 7 |\n| h | 8 |\n'),
      }),
    ).toEqual({ stands: false, why: "git merge-file found 1 conflict between the entry's lines and main's, so they are too close to put together." })
  })

  it('merges in the temporary folder TMPDIR names, and removes the folder it made there', () => {
    const own = mkdtempSync(join(tmpdir(), 'an-entrys-merge-'))
    try {
      // A FILE WHERE TMPDIR POINTS: the tool cannot make its folder in a file, so the merge fails. That shows the
      // tool makes its folder where TMPDIR says, so the folder listed below is the one it used.
      const aFile = join(own, 'a-file')
      writeFileSync(aFile, 'Synthetic: a file, not a folder.\n')
      expect(() => withTmpdir(aFile, () => whetherTheEntrysVersionStands({ base: BASE, entry: byTheEntry(BASE), main: byMain(BASE) }))).toThrow(/ENOTDIR/)
      rmSync(aFile)
      expect(withTmpdir(own, () => whetherTheEntrysVersionStands({ base: BASE, entry: byTheEntry(BASE), main: byMain(BASE) }).stands)).toBe(true)
      expect(readdirSync(own)).toEqual([])
    } finally {
      rmSync(own, { recursive: true, force: true })
    }
  })
})
