// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MODULE'S LIFECYCLE: four coarse words, and the flat table they had to fit into.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Twenty-six of twenty-seven modules sat permanently in the bucket labelled *nobody wrote a state
 * here*, and the twenty-seventh was elsewhere only because it was explicitly paused. That was
 * literally true — a module had no `state` field — and it told the reader nothing about any of them.
 *
 * A module now answers ONE question, coarsely: what is our posture toward this subsystem right now.
 * `active`, `paused`, `stable`, `retired`. It does NOT answer how much is done — that is counted
 * from the checklist items on every read — nor what might replace it, nor that somebody has had an
 * idea about it. Each of those is a separate fact with its own home, and a lifecycle word that
 * summarised any of them would be a hand-maintained second copy of something already derived.
 *
 * THE PART THIS FILE GUARDS HARDEST IS THE TABLE. `STATE_MEANING` is keyed by the word alone, on
 * purpose, so that one word cannot mean two things in one product. Two of these four words were
 * already in it. That is not a collision — a collision is one word with two MEANINGS, not one word
 * used by two kinds.
 *
 * NO DATABASE. A read of the declaration files, plus a `window` stand-in below and nowhere else in
 * this file.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { KIND_SPECS, MODULE_STATES, validateData } from '../src/shared/kinds.ts'
import { progressOf, stoppedShort } from '../src/shared/work.ts'

const stateField = KIND_SPECS.module.fields.find((field) => field.key === 'state')

// ModuleView reaches api.ts, which reads window.localStorage the moment it is imported. The
// smallest stand-in that lets the module load; nothing here is under test.
type MV = typeof import('../src/web/components/ModuleView.tsx')
let mv: MV

beforeAll(async () => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  mv = await import('../src/web/components/ModuleView.tsx')
})

describe('the four words', () => {
  it('are optional, because "nobody has said" is different from all four', () => {
    expect(stateField?.required).toBe(false)
    const result = validateData('module', { context: 'why this exists', parts: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.incomplete.map((i) => i.path), 'a module with no posture recorded is not incomplete, it is unstated').not.toContain('data.state')
  })

  it('are refused when the word is not one of the four', () => {
    const result = validateData('module', { context: 'why this exists', parts: [], state: 'mostly done' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.path)).toContain('data.state')
  })
})

describe('what each word means, read out of the one flat table', () => {
  it('reads active as work in flight and paused as put down on purpose', () => {
    expect(progressOf('active')).toBe('in_flight')
    expect(progressOf('paused')).toBe('paused')
  })

  it('reads stable and retired as work that reached its end', () => {
    // `stable` is finished because the work on it reached the end somebody chose for it. It is NOT
    // a claim that the subsystem can never change: a stable module that needs work again goes back
    // to active. The competing reading — a subsystem is never finished, so `stable` is in flight —
    // would leave every module in the product permanently in front of a person with nothing to do.
    expect(progressOf('stable')).toBe('finished')
    expect(progressOf('retired')).toBe('finished')
  })

  it('never says a module STOPPED SHORT because of its lifecycle word', () => {
    // A posture is not a failure. Nothing in this vocabulary should put a module on the list of
    // things that need somebody today; what does that for a module is a `paused` block that has run
    // out, or a consequence somebody stored, or a checklist item that failed.
    for (const word of MODULE_STATES) {
      expect(stoppedShort(word), `a module in state "${word}" is being reported as work that stopped short`).toBe(false)
    }
  })

})

