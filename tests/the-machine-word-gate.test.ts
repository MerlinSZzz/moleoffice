// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE-WORD GATE: A STORED WORD CANNOT REACH A SCREEN UNREAD WITHOUT FAILING THE BUILD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office stores `worked_around`, `derived_from`, `wanna_try`, `human`. It prints "worked around",
 * "derived from", "worth a try", "person". `src/shared/words.ts` is the one table of readings and it
 * has been right for months. The defect was never a missing word: it was that a screen could get
 * the stored word WITHOUT ASKING.
 *
 * FIVE WAVES FIXED THIS ONE SITE AT A TIME AND A VERIFIER FOUND MORE EACH TIME. Wave 5 fixed nine
 * sites in the review path; its verifier then read `worked_around` off `#/records` and
 * `linked (derived_from)` off the home page, at first paint, in normal mode, at 1440 and at 390.
 * Both came from a fall-through — `shownState` answered from a five-word table of its own and
 * returned the stored token for everything else — and a fall-through has no site to fix.
 *
 * So this is the gate, in the shape the deleted sentence gate had: every place a stored word
 * can still reach prose is WRITTEN DOWN BY NAME in `tests/machine-word-allowlist.json`, and a new
 * one fails the build. `tests/machine-words.ts` is the scanner and the counting script.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS IT HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE READINGS COVER THE WHOLE VOCABULARY. Every kind, state, actor type, link type, progress
 *    word and implementation-map provenance source has a reading, and none of them is the stored
 *    token with an underscore still in it. The sixth vocabulary joined on 26 August 2026: its words
 *    reach a screen through a lookup table rather than as a literal, so nothing else here saw them.
 *    `tests/machine-words.ts` carries the mutation that proved it and what is still invisible.
 *
 * 2. NO READING FUNCTION HANDS BACK WHAT IT WAS GIVEN. A word no table knows comes back named out
 *    loud — "unknown state: chasing" — in both modes. This is the one that catches the fall-through,
 *    and no source scan can: a scanner reading `shownState(x)` sees a reading call whatever the
 *    function does inside.
 *
 * 3. NO RAW MACHINE WORD IN DRAWN TEXT. Written out, in a string or a run of JSX text a person
 *    reads. Two entries stand in the allowlist and both are the HTTP API describing its own wire
 *    format, where the machine word is the value the route accepts. Every file under src/ is read,
 *    so every wave's part of the word lists is too: on 6 October 2026 (wave 13j, round 41) the word
 *    'It is worked_around now' put into src/shared/words/en-wave-13k.ts turned this red.
 *
 * 4. WHAT REACHES DRAWN TEXT UNREAD MATCHES THE LIST, file by file. A value interpolated into drawn
 *    text with nothing on the line asking the table. Whether one is a defect depends on the value,
 *    which a text scanner cannot know, so they are listed rather than judged.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS GATE DOES NOT CATCH, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * THE LIST IN 4 IS A SET PER FILE, NOT A MULTISET. A second `{record.kind}` in a file that already
 * has one does not fail. A file's FIRST one does, and so does any expression the file did not have
 * before. The deleted sentence gate compared multisets and could afford to, because it was shrinking
 * to nothing; this list is not, and a red that only says "this line moved" would be spent on nothing.
 *
 * IT READS TEXT, NOT A SYNTAX TREE, for the reason `tests/sentences.ts` gives: the TypeScript
 * package here ships a compiler binary and no JavaScript parser API.
 *
 * IT CANNOT SEE A STORED WORD THAT READS AS ORDINARY ENGLISH — `human`, `system`, `block`,
 * `annotation` — written out as a literal, because it cannot tell that from prose. Those reach a
 * screen through a value, which check 4 covers, and through the components, which the last block
 * below renders and reads back.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import { PROVENANCES } from '../src/shared/implementation.ts'
import { ACTOR_TYPES, LINK_TYPES, RECORD_KINDS } from '../src/shared/types.ts'
import { PROGRESS, STATE_MEANING, progressOf } from '../src/shared/work.ts'
import {
  actorTypeWord,
  kindWord,
  linkWord,
  progressWord,
  readerWord,
  stateWord,
} from '../src/shared/words.ts'
import { drawnText } from './drawn.ts'
import {
  everyMachineWordSite,
  everyStoredWord,
  machineWordSitesIn,
  sourceFiles,
  unmistakableMachineWords,
} from './machine-words.ts'

const ALLOWLIST = fileURLToPath(new URL('./machine-word-allowlist.json', import.meta.url))
const allowed = JSON.parse(readFileSync(ALLOWLIST, 'utf8')) as {
  aRawStoredWordIsWrittenIntoProse: Record<string, Record<string, string>>
  aValueReachesDrawnTextWithNothingReadingIt: Record<string, string[]>
}

// src/web/lib/workspace.ts and src/web/api.ts both read `window` at module scope, so the two
// components below cannot be imported without one. Same stand-in as the other web tests here.
let StoredState: typeof import('../src/web/components/ui.tsx')['StoredState']
let changeVerb: typeof import('../src/web/components/ChangeLog.tsx')['changeVerb']

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  StoredState = (await import('../src/web/components/ui.tsx')).StoredState
  changeVerb = (await import('../src/web/components/ChangeLog.tsx')).changeVerb
})

const SITES = everyMachineWordSite()
const RAW = SITES.filter((site) => site.rule === 'raw')
const UNREAD = SITES.filter((site) => site.rule === 'unread')

/** The unread expressions one file has, unique and sorted, so a file compares against its entry. */
function unreadIn(file: string): string[] {
  return [...new Set(UNREAD.filter((site) => site.file === file).map((site) => site.found))].sort()
}

// =========================================================================== the scanner itself

describe('the scanner reads what it says it reads', () => {
  it('finds a machine word written into a run of drawn text', () => {
    const found = machineWordSitesIn('x.tsx', `const a = <p>It is worked_around now</p>\n`)
    expect(found.map((one) => [one.rule, one.found])).toEqual([['raw', 'worked_around']])
  })

  it('leaves a comparison and an object key alone, which are not prose', () => {
    const found = machineWordSitesIn('x.tsx', `if (r.state === 'worked_around') go()\nconst t = { worked_around: 1 }\n`)
    expect(found.filter((one) => one.rule === 'raw')).toEqual([])
  })

  it('leaves a stylesheet selector alone', () => {
    const found = machineWordSitesIn('x.tsx', 'const css = `.chip[data-progress=\'in_flight\'] { color: red; }`\n')
    expect(found.filter((one) => one.rule === 'raw')).toEqual([])
  })

  it('does not read a comment, which is on nobody’s screen', () => {
    const found = machineWordSitesIn('x.tsx', `// It is worked_around now\nconst b = 'Save'\n`)
    expect(found).toEqual([])
  })

  it('finds a value reaching drawn text, and not the same value being compared', () => {
    const drawn = machineWordSitesIn('x.tsx', `const a = <p>{record.kind}</p>\n`)
    expect(drawn.map((one) => [one.rule, one.found])).toEqual([['unread', 'record.kind']])
    const compared = machineWordSitesIn('x.tsx', `if (record.kind === 'task') go()\n`)
    expect(compared).toEqual([])
  })

  it('reads a value as read when the line asks the table', () => {
    const found = machineWordSitesIn('x.tsx', `const a = <p>{kindWord(record.kind, mode).text}</p>\n`)
    expect(found).toEqual([])
  })

  it('is measured against every source file, not a sample', () => {
    expect(sourceFiles().length).toBeGreaterThan(150)
    expect(sourceFiles().every((file) => /\.tsx?$/.test(file))).toBe(true)
  })

  it('hunts for the machine words the vocabulary actually holds', () => {
    // Read out of the shared declarations, so a new underscored value joins by being declared.
    expect(unmistakableMachineWords()).toContain('worked_around')
    expect(unmistakableMachineWords()).toContain('derived_from')
    expect(unmistakableMachineWords()).toContain('todo')
    expect(unmistakableMachineWords().length).toBeGreaterThanOrEqual(11)
  })
})

// =========================================================================== 1. the whole vocabulary

describe('the readings cover the whole vocabulary, not six words', () => {
  it('has a reading for every stored word in all six vocabularies', () => {
    const words = everyStoredWord()
    expect(words.filter((word) => word.vocabulary === 'kind')).toHaveLength(RECORD_KINDS.length)
    expect(words.filter((word) => word.vocabulary === 'state')).toHaveLength(Object.keys(STATE_MEANING).length)
    expect(words.filter((word) => word.vocabulary === 'actor')).toHaveLength(ACTOR_TYPES.length)
    expect(words.filter((word) => word.vocabulary === 'link')).toHaveLength(Object.keys(LINK_TYPES).length)
    expect(words.filter((word) => word.vocabulary === 'progress')).toHaveLength(PROGRESS.length)
    expect(words.filter((word) => word.vocabulary === 'provenance')).toHaveLength(PROVENANCES.length)
    for (const word of words) expect(word.reading, word.stored).not.toBe('')
  })

  /**
   * THE VOCABULARY THAT REACHES A SCREEN THROUGH A LOOKUP TABLE, PINNED SO IT CANNOT LEAVE QUIETLY.
   *
   * A provenance value is never written out as a literal. It is stored in a column, looked up in
   * `PROVENANCE`, and drawn as that row's `reading`. The verifier of wave 6 replaced one row's
   * reading with its own stored token and this gate stayed green, because `everyStoredWord()` read
   * five vocabularies and this was not one of them. It reads six now. This test is what says so,
   * and the underscore test above is what reddens when the table is broken again.
   */
  it('knows the nine sources, which reach a screen through a table and never as a literal', () => {
    const sources = everyStoredWord().filter((word) => word.vocabulary === 'provenance')
    expect(sources.map((word) => word.stored).sort()).toEqual([...PROVENANCES].sort())
    expect(sources.find((word) => word.stored === 'observed_write')?.reading).toBe('files seen changing')
    // And the raw rule hunts for the three that hold an underscore, so a literal one is a red too.
    expect(unmistakableMachineWords()).toContain('observed_write')
    expect(unmistakableMachineWords()).toContain('build_graph')
    expect(unmistakableMachineWords()).toContain('launch_config')
  })

  it('gives no reading that still holds an underscore', () => {
    // The whole vocabulary, not the ten this scanner hunts for as literals: an underscore in a
    // reading is a stored word that got through wearing the table's clothes.
    const wearing = everyStoredWord().filter((word) => word.reading.includes('_'))
    expect(wearing.map((word) => `${word.vocabulary} ${word.stored} -> ${word.reading}`)).toEqual([])
  })

  it('reads both ends of every link, so a reverse reading is never the stored row', () => {
    for (const type of Object.keys(LINK_TYPES)) {
      expect(linkWord(type, 'forward').text, type).not.toContain('_')
      expect(linkWord(type, 'reverse').text, type).not.toContain('_')
    }
  })
})

// =========================================================================== 2. no fall-through

describe('no reading hands back the word it was given', () => {
  /**
   * THIS IS THE CHECK THE SOURCE SCAN CANNOT MAKE. `shownState(x)` reads as a reading call whatever
   * it does inside, and for five waves what it did inside was `?? word`.
   */
  it('names a value no table knows, in both modes, for every vocabulary', () => {
    const nobodysWord = 'chasing'
    for (const mode of ['normal', 'inspect'] as const) {
      expect(kindWord(nobodysWord, mode).text).toBe(`unknown kind: ${nobodysWord}`)
      expect(stateWord(nobodysWord, mode).text).toBe(`unknown state: ${nobodysWord}`)
      expect(actorTypeWord(nobodysWord, mode).text).toBe(`unknown actor: ${nobodysWord}`)
      expect(linkWord(nobodysWord, 'forward', mode).text).toBe(`unknown link: ${nobodysWord}`)
      expect(progressWord(nobodysWord, mode).text).toBe(`unknown progress: ${nobodysWord}`)
      expect(readerWord(nobodysWord, mode).text).toBe(`unknown word: ${nobodysWord}`)
    }
  })

  it('never answers with the bare stored value for a word it does not have', () => {
    for (const nobodysWord of ['chasing', 'half_done', 'AWAITING_REVIEW', '重印中']) {
      for (const answer of [
        kindWord(nobodysWord),
        stateWord(nobodysWord),
        actorTypeWord(nobodysWord),
        linkWord(nobodysWord, 'forward'),
        progressWord(nobodysWord),
        readerWord(nobodysWord),
      ]) {
        expect(answer.text, nobodysWord).not.toBe(nobodysWord)
        expect(answer.standing).toBe('unknown')
      }
    }
  })
})

// =========================================================================== 3 and 4. the gate

describe('every place a stored word can reach prose is written down', () => {
  it('has no raw machine word in drawn text that the list does not name', () => {
    const unnamed = RAW.filter(
      (site) => allowed.aRawStoredWordIsWrittenIntoProse[site.file]?.[site.found] === undefined,
    ).map((site) => `src/${site.file}:${site.line} — ${site.found} — ${site.text}`)
    expect(unnamed, 'a stored word is written out where a person reads it').toEqual([])
  })

  it('has no entry in the raw list that the tree no longer holds', () => {
    const stale: string[] = []
    for (const [file, words] of Object.entries(allowed.aRawStoredWordIsWrittenIntoProse)) {
      for (const word of Object.keys(words)) {
        if (!RAW.some((site) => site.file === file && site.found === word)) stale.push(`${file}: ${word}`)
      }
    }
    expect(stale, 'these entries name nothing — delete them').toEqual([])
  })

  it('gives a reason for every raw word it allows, in words a person can weigh', () => {
    for (const [file, words] of Object.entries(allowed.aRawStoredWordIsWrittenIntoProse)) {
      for (const [word, why] of Object.entries(words)) {
        expect(why.split(' ').length, `${file}: ${word} has no reason worth reading`).toBeGreaterThan(12)
      }
    }
  })

  it('has no file in the list that reaches prose nowhere', () => {
    const stale = Object.keys(allowed.aValueReachesDrawnTextWithNothingReadingIt).filter(
      (file) => unreadIn(file).length === 0,
    )
    expect(stale, 'these files are in the allowlist and have no such site — delete the entries').toEqual([])
  })

  it('has no file reaching prose that the list does not name', () => {
    const missing = [...new Set(UNREAD.map((site) => site.file))].filter(
      (file) => !(file in allowed.aValueReachesDrawnTextWithNothingReadingIt),
    )
    expect(missing, 'these files let a value reach drawn text and are not in the allowlist').toEqual([])
  })

  it('matches the tree, file by file, expression for expression', () => {
    // The whole gate, in one assertion per file. A new expression and a deleted one both land here.
    for (const file of Object.keys(allowed.aValueReachesDrawnTextWithNothingReadingIt)) {
      expect(unreadIn(file), `src/${file} no longer matches tests/machine-word-allowlist.json`).toEqual(
        (allowed.aValueReachesDrawnTextWithNothingReadingIt[file] ?? []).slice().sort(),
      )
    }
  })
})

// =========================================================================== what a component drew

describe('what the components actually draw, read back off the markup', () => {
  /**
   * THE OTHER INSTRUMENT. Everything above reads SOURCE. This renders and reads the text a person
   * sees, which is the only thing that answers for a word arriving through three helpers. It is the
   * same split `tests/drawn.ts` describes beside the source scanner.
   */
  it('draws no underscore for any state word there is, on any kind', () => {
    for (const state of Object.keys(STATE_MEANING)) {
      const html = renderToStaticMarkup(h(StoredState, { state, progress: progressOf(state) }))
      expect(drawnText(html), `the chip for ${state}`).not.toContain('_')
    }
  })

  it('draws the reader word and not the stored one for the words that differ', () => {
    const chip = (state: string, kind?: string) =>
      drawnText(renderToStaticMarkup(h(StoredState, { state, progress: progressOf(state), kind })))
    expect(chip('worked_around')).toContain('worked around')
    expect(chip('todo')).toContain('to do')
    expect(chip('idle')).toContain('waiting for you')
    expect(chip('handled')).toContain('dealt with')
    expect(chip('proposed', 'claim')).toContain('not measured')
  })

  it('draws no underscore in a change verb for any link type there is', () => {
    for (const type of Object.keys(LINK_TYPES)) {
      for (const op of ['link', 'unlink'] as const) {
        const change = {
          id: 'c1',
          recordId: 'r1',
          origin: null,
          op,
          actorType: 'agent' as const,
          actorId: 'a',
          sessionId: null,
          field: type,
          oldValue: null,
          newValue: null,
          at: '2026-08-25T10:00:00',
        }
        expect(changeVerb(change), `${op} ${type}`).not.toContain('_')
      }
    }
  })
})
