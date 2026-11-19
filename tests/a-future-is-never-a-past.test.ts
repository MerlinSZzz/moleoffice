// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLANNED THING NEVER READS AS SOMETHING THAT HAPPENED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office now holds two worlds. `trajectory`, `planned_state` and `goal` records say what is
 * INTENDED; everything else in the product is a record of something that exists or happened. The
 * whole risk of putting them in one store is that a reader — or a drawing, or a count — takes one
 * for the other.
 *
 * The mechanisms that stop it are enforced in different files, so this file asks each one where it
 * lives rather than testing a doctrine. Each `it` names the mechanism it carries.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DRAWING CLAUSE IS THE ONE WORTH READING TWICE
 * ---------------------------------------------------------------------------------------
 *
 * `supersedes` is kept for one plan replacing another AND is used between four pairs of ordinary
 * records in the owner's corpus. One type, two worlds. Its family is `builds`, whose key label
 * reads **leads to**, so `trj2 supersedes trj1` drawn off the type alone reads as *trj2 leads to
 * trj1* — backwards, and in the language of things that happened.
 *
 * That is why `linkFamilyOf` takes the ENDS. Drop the argument and the drawing is wrong in a way
 * nothing else in this repository fails on.
 */

import { describe, expect, it } from 'vitest'
import { RECORD_KINDS, LINK_TYPES } from '../src/shared/types.ts'
import { INTENDED_KINDS, isIntended, worldOf } from '../src/shared/world.ts'
import {
  LINE_FAMILY_STYLE,
  LINK_FAMILIES,
  LINK_FAMILY_OF,
  lineFamiliesAreOrdered,
  linkFamilyOf,
  unclassifiedLinkTypes,
} from '../src/web/components/graph/lines.ts'

describe('M5 — which world a record is in is derived from its kind, in one function', () => {
  it('answers for every kind, and only the three intended kinds are intended', () => {
    // THE ONLY LINE HERE THAT A WRONG LIST FAILS ON. Everything else in this test is walked over
    // `INTENDED_KINDS` or over `isIntended`, and both of those ARE the list — `isIntended` is
    // defined as `worldOf(kind) === 'intended'` and `INTENDED_KINDS.includes` is the whole body of
    // `worldOf` — so they pass for any implementation that reads it. A twenty-seventh kind added to
    // the list by mistake passes the walk below in silence and fails right here.
    //
    // THREE SINCE 16 SEPTEMBER 2026, on a decision. A goal has not happened: it is
    // what work is FOR, and `serves` is already drawn in the intent family for that reason. The list is
    // the whole of the intended world, and a goal belongs in it.
    expect([...INTENDED_KINDS]).toEqual(['trajectory', 'planned_state', 'goal'])
    const intended = RECORD_KINDS.filter((kind) => worldOf(kind) === 'intended')
    expect([...intended].sort()).toEqual([...INTENDED_KINDS].sort())
    // AND EVERY OTHER KIND IS ACTUAL. Walked over the whole list rather than over the two, because
    // the mutation the plan names is *make worldOf return actual for a trajectory*. The walk holds
    // that mutation and not the list one; see the line above.
    for (const kind of RECORD_KINDS) {
      expect(worldOf(kind), kind).toBe(isIntended(kind) ? 'intended' : 'actual')
      if (!(INTENDED_KINDS as readonly string[]).includes(kind)) expect(worldOf(kind), kind).toBe('actual')
    }
    expect(worldOf('trajectory')).toBe('intended')
    expect(worldOf('planned_state')).toBe('intended')
    expect(worldOf('goal')).toBe('intended')
  })
})

describe('M8 — no planned thing is drawn in the language of things that happened', () => {
  it('classifies every link type, so a new one fails rather than landing in `related`', () => {
    expect(unclassifiedLinkTypes(Object.keys(LINK_TYPES))).toEqual([])
  })

  it('draws the four intended types in the intent family and nothing else in it', () => {
    const inIntent = Object.entries(LINK_FAMILY_OF)
      .filter(([, family]) => family === 'intent')
      .map(([type]) => type)
      .sort()
    // FOUR SINCE 15 SEPTEMBER 2026, when `serves` landed with the goal kind, criterion P1 of
    // design/planning/ACCEPTANCE.md. A goal has not happened: `serves` runs from work at the goal
    // that work is meant to bring about, so drawing it in the `builds` family would say the goal is
    // a thing that exists, which is the one thing this file is here to stop.
    expect(inIntent).toEqual(['instead_of', 'plans_for', 'realises', 'serves'])
    expect([...LINK_FAMILIES]).toContain('intent')
  })

  /**
   * THE ONE THE PLAN NAMES BY ITS MUTATION: drop the `ends` argument and `trj2 supersedes trj1`
   * draws as *trj2 leads to trj1*, backwards.
   */
  it('a relation between two intentions is drawn as intent, whatever the type says', () => {
    const bothIntended = { from: 'intended', to: 'intended' } as const
    expect(linkFamilyOf('supersedes', bothIntended)).toBe('intent')
    // AND THE FALLBACK IS UNCHANGED, so no existing caller moved. The four `supersedes` rows in the
    // owner's corpus have neither end in the planned world.
    expect(linkFamilyOf('supersedes')).toBe('builds')
    expect(linkFamilyOf('supersedes', { from: 'actual', to: 'actual' })).toBe('builds')
    // ONE END INTENDED IS NOT ENOUGH, and that is deliberate: `realises` runs from a thing that
    // happened to a thing that has not, and it is in the intent family by its own row in the table,
    // not by this rule.
    expect(linkFamilyOf('supersedes', { from: 'actual', to: 'intended' })).toBe('builds')
    expect(linkFamilyOf('realises', { from: 'actual', to: 'intended' })).toBe('intent')
    // A type nobody classified is still null with ends given. The ends rule may not invent a family
    // for a type the table has no opinion about, unless both ends really are intentions.
    expect(linkFamilyOf('wibble', { from: 'actual', to: 'intended' })).toBeNull()
    expect(linkFamilyOf('wibble', bothIntended)).toBe('intent')
  })

  it('draws an intent line lighter than a builds line, and never dashed', () => {
    expect(lineFamiliesAreOrdered()).toEqual([])
    expect(LINE_FAMILY_STYLE.intent.dash).toBeNull()
    expect(LINE_FAMILY_STYLE.intent.width).toBeLessThan(LINE_FAMILY_STYLE.builds.width)
    // The rule states itself when broken, rather than failing on a number.
    const heavier = { ...LINE_FAMILY_STYLE, intent: { ...LINE_FAMILY_STYLE.intent, width: 3 } }
    expect(lineFamiliesAreOrdered(heavier).join(' ')).toContain('cannot be drawn at or above the weight')
    const dashed = { ...LINE_FAMILY_STYLE, intent: { ...LINE_FAMILY_STYLE.intent, dash: '3 4' } }
    expect(lineFamiliesAreOrdered(dashed).join(' ')).toContain('nobody confirmed it')
  })
})

describe('M3 — the two orders have different names, and each sends the author to the other', () => {
  it('refuses blockIds on a trajectory by naming plannedStateIds, and the reverse', async () => {
    const { validateData } = await import('../src/shared/kinds.ts')
    // ASSERTED ON THE SUGGESTION, NOT ON THE WHOLE REPLY. The refusal also prints the list of keys
    // the kind DOES take, so `toContain('plannedStateIds')` over the whole message passes with the
    // table entry deleted — measured: removing it left this test green. What has to be true is that
    // the author is SENT to the other key by name.
    const onTrajectory = validateData('trajectory', { blockIds: ['a'], plannedStateIds: [] })
    expect(onTrajectory.ok).toBe(false)
    expect(onTrajectory.ok === false ? onTrajectory.errors.map((e) => e.message) : []).toEqual([
      'unknown key "blockIds" — did you mean "plannedStateIds"?',
    ])

    const onPipeline = validateData('pipeline', { plannedStateIds: ['a'] })
    expect(onPipeline.ok).toBe(false)
    expect(onPipeline.ok === false ? onPipeline.errors.map((e) => e.message) : []).toEqual([
      'unknown key "plannedStateIds" — did you mean "blockIds"?',
    ])
  })
})

describe('M4 — the ledger has no word for an intention', () => {
  it('keeps the revision ops to the five that describe something that happened', async () => {
    const { REVISION_OPS } = await import('../src/shared/types.ts')
    expect([...REVISION_OPS].sort()).toEqual(['baseline', 'create', 'delete', 'restore', 'update'])
    for (const op of REVISION_OPS) expect(op, 'a revision op names an intention').not.toContain('plan')
  })
})
