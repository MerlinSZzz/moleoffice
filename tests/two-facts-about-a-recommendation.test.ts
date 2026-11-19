// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECOMMENDATION WAS WRITTEN, AND PANELX CAN TELL WHICH OPTION IT POINTS AT. TWO FACTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 27 August 2026, 26 of the 27 forks in the owner's queue carried a written recommendation and
 * 2 were reported as having one. One field carried both facts under the name `hasRecommendation`,
 * and it meant the second while its name said the first — so 25 of 27 read on screen as though
 * nobody had a view on them.
 *
 * ---------------------------------------------------------------------------------------
 * THE DISTINCTION IS NOT DELETED, BECAUSE IT IS RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * `pickedOption` in src/shared/proposal.ts refuses to read a pick out of a sentence that does not
 * name one, and its argument is written at line 49 and stands. `acsi4ZoHx6ZB` stores
 * *"No recommendation. All three are defensible…"* — an agent declining to choose — and a field
 * that only asked "is the string non-empty" would badge that fork as decided.
 *
 * So both facts are drawn, separately, and neither pretends to be the other. `namesAnOption` is the
 * one that can offer a one-press settle. `recommendationWritten` is the one that says somebody
 * thought about it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb
let forks: typeof import('../src/server/lib/forks.ts')
let dec: typeof import('../src/web/components/home/decisions.ts')

// The runner's environment is `node` and this project has ruled out jsdom. src/web/api.ts reads
// window.localStorage at module scope, so a window stand-in goes in before the browser module is
// loaded — the same way tests/home-bands.test.ts does it.
beforeAll(async () => {
  t = await freshDb()
  forks = await import('../src/server/lib/forks.ts')
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  dec = await import('../src/web/components/home/decisions.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

const AGENT = { type: 'agent' as const, id: 'claude-code' }

const fork = (title: string, recommendation: string | undefined): string =>
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'proposal',
    title,
    data: {
      question: `${title}?`,
      options: ['a — the first way', 'b — the second way', 'c — leave it open'],
      ...(recommendation === undefined ? {} : { recommendation }),
    },
    actor: AGENT,
  }).id

const read = (id: string) => forks.readForks().open.find((one) => one.recordId === id)

describe('the two facts, on the reading every surface uses', () => {
  it('a recommendation that names an option is both facts', () => {
    const id = fork('Take the first', 'Take (a), because it is the only one that keeps the key stable.')
    expect(read(id)?.recommendationWritten).toBe(true)
    expect(read(id)?.namesAnOption).toBe(true)
  })

  it('a recommendation written in words is the first fact and not the second', () => {
    // THE CASE THAT WAS INVISIBLE. 25 of the owner's 27 forks were in this state and every one of
    // them read as though nobody had a view.
    const id = fork(
      'Which repository do the module claims belong to',
      'I would keep the index where it is and point the other project at it, because moving 152 claims ' +
        'costs a migration window and nothing is waiting on the move.',
    )
    expect(read(id)?.recommendationWritten, 'a written recommendation was reported as none').toBe(true)
    expect(read(id)?.namesAnOption, 'Mole Office claimed to know which option this points at').toBe(false)
  })

  it('an agent explicitly declining to choose is neither', () => {
    // The distinction that already existed, kept. A field that only asked "is it non-empty" would
    // badge this fork as the most decided one in the queue.
    const id = fork('Which of the three', 'No recommendation. All three are defensible and it is your call.')
    expect(read(id)?.recommendationWritten).toBe(true)
    expect(read(id)?.namesAnOption).toBe(false)
  })

  it('no recommendation at all is neither, and an empty one is not a recommendation', () => {
    const none = fork('Nobody has a view', undefined)
    expect(read(none)?.recommendationWritten).toBe(false)
    expect(read(none)?.namesAnOption).toBe(false)
    // A BLANK ONE, WRITTEN ROUND THE GATE ON PURPOSE. `validateData` refuses a whitespace-only
    // recommendation, so this state cannot be MADE through any route — and an imported corpus can
    // still carry it, which is why the reader has to defend itself rather than trust the gate.
    const blank = fork('A field somebody left blank', 'placeholder')
    writeDataBypassingTheGate(t, blank, {
      question: 'A field somebody left blank?',
      options: ['a — the first way', 'b — the second way'],
      recommendation: '   ',
    })
    expect(read(blank)?.recommendationWritten, 'whitespace was counted as somebody having a view').toBe(false)
  })

  it('the two are never collapsed: naming an option implies one was written', () => {
    for (const one of forks.readForks().open) {
      if (one.namesAnOption) expect(one.recommendationWritten, `${one.recordId} names an option and wrote none`).toBe(true)
    }
  })
})

describe('the screen says which of the three states a fork is in', () => {
  it('has a phrase for each, and none of them says "no recommendation" about a written one', () => {
    expect(dec.optionChip(3, { written: true, namesAnOption: true })).toBe('3 options · recommends one of them')
    expect(dec.optionChip(3, { written: true, namesAnOption: false })).toBe('3 options · recommended in words')
    expect(dec.optionChip(3, { written: false, namesAnOption: false })).toBe('3 options · no recommendation written')
  })

  it('counts both facts separately on the band', () => {
    const before = dec.tallyDecisions(dec.readDecisions(forks.readForks().open, Date.now(), forks.readForks().leftTheQueue))
    fork('Names one', 'Take (a).')
    fork('In words', 'I would keep it where it is.')
    fork('Nothing', undefined)
    const tally = dec.tallyDecisions(dec.readDecisions(forks.readForks().open, Date.now(), forks.readForks().leftTheQueue))
    expect(tally.total - before.total).toBe(3)
    expect(tally.recommended - before.recommended, 'somebody had a view on two of these').toBe(2)
    expect(tally.namingAnOption - before.namingAnOption, 'only one of them can be settled in one press').toBe(1)
  })

  it('puts the one-press fork first, and the browser does not decide that', () => {
    /**
     * WHAT THIS ASSERTED UNTIL 27 AUGUST 2026, AND WHY IT CHANGED.
     *
     * It read: *"orders the one-press fork first, then the one somebody has a view on, then the
     * rest"*, and it asserted the whole order `[named, words, nothing]` off `readDecisions`, which
     * sorted the served list again on two keys of its own.
     *
     * That browser re-sort is deleted. Two reasons. The owner's round-eleven brief, section 7:
     * *"Default ordering should put the most consequential items first"*, and a re-sort by whether
     * a recommendation parses puts convenience above consequence. And the order was worked out in
     * two places — `readForks()` in src/server/lib/forks.ts and `readDecisions` in the browser — so
     * the two could disagree with nothing failing, which is this repository's named recurring
     * defect. They had already drifted: the browser's own comment described the server as ordering
     * "by how much work each is holding up and then by age", which stopped being true when the
     * priority model landed.
     *
     * WHAT IS STILL ASSERTED HERE. That the one-press fork comes first, which is the fact this file
     * is about, and that all three are returned. The middle case — a written recommendation Mole Office
     * cannot parse — is still told apart by the chip above, which is the other half of this file.
     * The full ordering, all seven keys of it, is pinned in tests/priority-is-several-facts.test.ts
     * against the projection that decides it.
     */
    const started = new Set(forks.readForks().open.map((one) => one.recordId))
    const words = fork('In words', 'I would keep it where it is.')
    const nothing = fork('Nothing', undefined)
    const named = fork('Names one', 'Take (a).')
    const read = forks.readForks()
    const order = dec.readDecisions(read.open, Date.now(), read.leftTheQueue).map((row) => row.recordId)
    const added = order.filter((id) => !started.has(id))
    expect(added[0], 'the fork that can be settled in one press is not first').toBe(named)
    expect([...added].sort()).toEqual([named, words, nothing].sort())
    // AND THE BROWSER IS NOT THE ONE DECIDING IT. The rows come back in the order the projection
    // sent them, so a change to the priority model reaches every surface at once.
    expect(order).toEqual(read.open.map((one) => one.recordId))
  })
})
