// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S MOVES THAT NEED NO RECORD ARE ONE PURE TABLE. Wave 11b, piece P3 of the measurement of
 * the merge queue as a tool.
 *
 * `theMoveAStepMakes` in src/shared/merge-queue.ts is the one place these moves are written. The office's
 * state machine calls it, and tests/merge-state-machine.test.ts proves the office still behaves as before.
 * This file proves the table itself, with no server and no database.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. Every step, from the state it is taken from, gives the move the table says; from any other state it
 *      is refused, naming the state it is taken from, and saying whether the entry is final.
 *   2. `main-moved` and `main-moved-while-testing` go back to judged while main has moved at most
 *      MAX_LANDING_ATTEMPTS times, and bounce as churn on the next move.
 *   3. A tool run that ended without moving the entry has the tool asked again below the limit; at the
 *      limit a landing entry stays for a person to look at, a resolving entry whose resolution waits for its
 *      check stays for its hour to decide, and an entry in any other state where the tool acts bounces as
 *      stalled. A state where the tool does not act stays, and so does a resolving entry with nothing to check.
 *   4. `tested` green stays; red bounces as red. A flaky run at block bounces as red even when green, and
 *      before every red admission; a repair that did not pass still bounces, and an undefined green still
 *      needs its answer.
 *   5. A red the server hands on to the entry's own line (`handsOnTheRed`) moves to resolving instead of
 *      bouncing. It never comes before a repair that did not pass, a flaky run at block, a take-back or an
 *      admission that lets the entry land, and a green run stays green.
 *   6. A red whose line has no run going, while the office asks for a fix round (`waitsForAFixRound`), stays in
 *      testing. It comes after a red the server hands on, and never before a repair that did not pass, a flaky run
 *      at block or a take-back. `fix-round-looked` is taken from testing, and what it makes rests on the records.
 *
 * MUTATIONS (each after a control run, each restored; the commit message records all three runs):
 *   - in `theMoveAStepMakes`, churn from `attempts > MAX_LANDING_ATTEMPTS` read as
 *     `attempts >= MAX_LANDING_ATTEMPTS`: cases 2 go red.
 *   - the landing exception taken out of the stalled rule: case 3 goes red.
 *   - the resolving exception taken out of the stalled rule: case 3 goes red.
 *   - the flaky-at-block line removed: the flaky case goes red.
 *   - the flaky-at-block line moved after `if (happened.green)`: the green flaky case goes red, and the
 *     red one still passes.
 *   - the last line of `tested` bouncing whatever `handsOnTheRed` says: case 5 goes red.
 *   - `handsOnTheRed` read before the take-back line: case 5 goes red.
 *   - the line of `tested` that keeps a waiting entry removed: case 6 goes red.
 *   - `waitsForAFixRound` read before the take-back line: case 6 goes red.
 */
import { describe, expect, it } from 'vitest'

import {
  A_STEP_IS_TAKEN_FROM,
  A_TOOL_RUN_ENDED,
  MERGE_STATES,
  MERGE_STATE_SPECS,
  MERGE_STEPS,
  theMoveAStepMakes,
  type MergeStep,
  type TheMoveAStepMakes,
  type WhatHappenedToAnEntry,
} from '../src/shared/merge-queue.ts'
import { gateNamed } from '../src/config/gates.mjs'
const MAX_LANDING_ATTEMPTS = Number(gateNamed('landing-attempts').defaults.ordinary)
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)

/** What each step makes from its own state, with the facts it needs. The table the brief of piece P3 names. */
const FROM_ITS_OWN_STATE: { readonly [S in MergeStep]: { happened: WhatHappenedToAnEntry; move: TheMoveAStepMakes } } = {
  pinned: { happened: { step: 'pinned' }, move: { move: 'rests-on-records' } },
  integrating: { happened: { step: 'integrating' }, move: { move: 'rests-on-records' } },
  integrated: { happened: { step: 'integrated' }, move: { move: 'rests-on-records' } },
  conflict: { happened: { step: 'conflict' }, move: { move: 'bounce', reason: 'conflict' } },
  'guard-failed': { happened: { step: 'guard-failed' }, move: { move: 'bounce', reason: 'guard' } },
  tested: { happened: { step: 'tested', green: true }, move: { move: 'stays', because: 'green' } },
  landing: { happened: { step: 'landing' }, move: { move: 'to', state: 'landing' } },
  'main-moved': { happened: { step: 'main-moved', attempts: 0 }, move: { move: 'to', state: 'judged', attempts: 1 } },
  'main-moved-while-testing': { happened: { step: 'main-moved-while-testing', attempts: 0 }, move: { move: 'to', state: 'judged', attempts: 1 } },
  'moved-past-documents': { happened: { step: 'moved-past-documents' }, move: { move: 'rests-on-records' } },
  landed: { happened: { step: 'landed' }, move: { move: 'to', state: 'merged' } },
  // SAID, AND NOT A MOVE (wave 13p round 19): no room in the sandbox launcher, and files red on
  // main alone. The entry stays where it is.
  'no-room-to-test': { happened: { step: 'no-room-to-test' }, move: { move: 'stays', because: 'said-and-not-moved' } },
  'no-room-to-integrate': { happened: { step: 'no-room-to-integrate' }, move: { move: 'stays', because: 'said-and-not-moved' } },
  'red-on-main': { happened: { step: 'red-on-main' }, move: { move: 'stays', because: 'said-and-not-moved' } },
  // THE CHECK OF A RESOLUTION: a pass pins the entry and a refusal keeps it resolving, both written by the state machine.
  'resolution-checked': { happened: { step: 'resolution-checked' }, move: { move: 'rests-on-records' } },
  // THE OFFICE LOOKS WHETHER THE FIX ROUND IT ASKED FOR HAS OPENED (wave 13u round 90): written by the state machine.
  ...{ 'fix-round-looked': { happened: { step: 'fix-round-looked' } as unknown as WhatHappenedToAnEntry, move: { move: 'rests-on-records' } as TheMoveAStepMakes } },
}

describe('every step, from its own state and from every other', () => {
  for (const step of MERGE_STEPS) {
    const from = A_STEP_IS_TAKEN_FROM[step]
    const { happened, move } = FROM_ITS_OWN_STATE[step]

    it(`"${step}" from ${from} makes the move the table says`, () => {
      expect(theMoveAStepMakes(from, happened)).toEqual(move)
    })

    it(`"${step}" from any other state is refused, naming ${from}`, () => {
      for (const state of MERGE_STATES.filter((one) => one !== from)) {
        expect(theMoveAStepMakes(state, happened), `from ${state}`).toEqual({ move: 'refused', takenFrom: from, final: MERGE_STATE_SPECS[state].final })
      }
    })
  }

  it('asked with the step alone, a step whose move needs a fact is not refused from its own state, and names the fact', () => {
    expect(theMoveAStepMakes('testing', { step: 'tested' })).toEqual({ move: 'needs', fact: 'green' })
    expect(theMoveAStepMakes('landing', { step: 'main-moved' })).toEqual({ move: 'needs', fact: 'attempts' })
    expect(theMoveAStepMakes('testing', { step: 'main-moved-while-testing' })).toEqual({ move: 'needs', fact: 'attempts' })
    expect(theMoveAStepMakes('judged', { step: 'tested' })).toEqual({ move: 'refused', takenFrom: 'testing', final: false })
  })
})

describe('main moved: back to judged up to MAX_LANDING_ATTEMPTS, then churn', () => {
  for (const [step, from] of [
    ['main-moved', 'landing'],
    ['main-moved-while-testing', 'testing'],
  ] as const) {
    it(`"${step}" at ${String(MAX_LANDING_ATTEMPTS - 1)} earlier moves goes back to judged, and at ${String(MAX_LANDING_ATTEMPTS)} bounces as churn`, () => {
      expect(theMoveAStepMakes(from, { step, attempts: MAX_LANDING_ATTEMPTS - 1 })).toEqual({ move: 'to', state: 'judged', attempts: MAX_LANDING_ATTEMPTS })
      expect(theMoveAStepMakes(from, { step, attempts: MAX_LANDING_ATTEMPTS })).toEqual({ move: 'bounce', reason: 'churn', attempts: MAX_LANDING_ATTEMPTS + 1 })
    })
  }
})

describe('a tool run that ended without moving the entry', () => {
  const below = MAX_TOOL_RUNS_IN_ONE_PLACE - 2
  const atTheLimit = MAX_TOOL_RUNS_IN_ONE_PLACE - 1
  const toolActs = MERGE_STATES.filter((state) => MERGE_STATE_SPECS[state].theMergeToolActs && !MERGE_STATE_SPECS[state].final)

  it('below the limit, has the tool asked again in the state the entry is in', () => {
    for (const state of toolActs) {
      expect(theMoveAStepMakes(state, { step: A_TOOL_RUN_ENDED, runs: below }), state).toEqual({ move: 'to', state, runs: below + 1 })
    }
  })

  it('at the limit, leaves a landing entry landing for a person to look at, and bounces a testing entry as stalled', () => {
    expect(theMoveAStepMakes('landing', { step: A_TOOL_RUN_ENDED, runs: atTheLimit })).toEqual({ move: 'stays', because: 'a-person-must-look', runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
    expect(theMoveAStepMakes('testing', { step: A_TOOL_RUN_ENDED, runs: atTheLimit })).toEqual({ move: 'bounce', reason: 'stalled', runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
    for (const state of toolActs.filter((one) => one !== 'landing')) {
      expect(theMoveAStepMakes(state, { step: A_TOOL_RUN_ENDED, runs: atTheLimit }), state).toEqual({ move: 'bounce', reason: 'stalled', runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
    }
  })

  it('in a final state or one whose next move is not the tool, stays, and needs no count', () => {
    for (const state of MERGE_STATES.filter((one) => !toolActs.includes(one))) {
      const because = MERGE_STATE_SPECS[state].final ? 'final' : 'the-tool-does-not-act-here'
      expect(theMoveAStepMakes(state, { step: A_TOOL_RUN_ENDED }), state).toEqual({ move: 'stays', because })
    }
  })

  it('in resolving, has the tool asked again only while a resolution waits for its check, and at the limit leaves it to the hour', () => {
    expect(theMoveAStepMakes('resolving', { step: A_TOOL_RUN_ENDED, runs: below })).toEqual({ move: 'stays', because: 'the-tool-does-not-act-here' })
    expect(theMoveAStepMakes('resolving', { step: A_TOOL_RUN_ENDED, runs: below, aResolutionWaits: true })).toEqual({ move: 'to', state: 'resolving', runs: below + 1 })
    expect(theMoveAStepMakes('resolving', { step: A_TOOL_RUN_ENDED, runs: atTheLimit, aResolutionWaits: true })).toEqual({ move: 'stays', because: 'the-check-gave-no-result', runs: MAX_TOOL_RUNS_IN_ONE_PLACE })
  })

  it('in a state where the tool acts, needs the count', () => {
    expect(theMoveAStepMakes('testing', { step: A_TOOL_RUN_ENDED })).toEqual({ move: 'needs', fact: 'runs' })
  })
})

describe('tested', () => {
  it('green stays in testing, and red bounces as red', () => {
    expect(theMoveAStepMakes('testing', { step: 'tested', green: true })).toEqual({ move: 'stays', because: 'green' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false })).toEqual({ move: 'bounce', reason: 'red' })
  })

  it('at block, a flaky run bounces as red even when green, and before every red admission', () => {
    expect(theMoveAStepMakes('testing', { step: 'tested', green: true, flakyAtBlock: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, flakyAtBlock: true, admittedForFixRound: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, flakyAtBlock: true, onlyHouseRulesRed: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, flakyAtBlock: true, handedBack: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', flakyAtBlock: true })).toEqual({ move: 'needs', fact: 'green' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: true, flakyAtBlock: true, repairPassed: false })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: true, flakyAtBlock: false })).toEqual({ move: 'stays', because: 'green' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, flakyAtBlock: false })).toEqual({ move: 'bounce', reason: 'red' })
  })

  it('a red the server hands on goes to resolving, and never before a repair that did not pass, a flaky run at block, a take-back or an admission', () => {
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true })).toEqual({ move: 'to', state: 'resolving' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: false })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, repairPassed: false })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, flakyAtBlock: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, takeBack: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, admittedForFixRound: true })).toEqual({ move: 'stays', because: 'admitted-for-fix-round' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, onlyHouseRulesRed: true })).toEqual({ move: 'stays', because: 'only-house-rules-red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, handedBack: true })).toEqual({ move: 'stays', because: 'handed-back' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: false, handsOnTheRed: true, wideRed: true })).toEqual({ move: 'stays', because: 'wide-red' })
    expect(theMoveAStepMakes('testing', { step: 'tested', green: true, handsOnTheRed: true })).toEqual({ move: 'stays', because: 'green' })
  })

  it('a red that waits for a fix round stays in testing, after a red the server hands on, and never before a repair that did not pass, a flaky run at block or a take-back', () => {
    const waits = (more: Record<string, unknown>) => theMoveAStepMakes('testing', { step: 'tested', green: false, waitsForAFixRound: true, ...more } as unknown as WhatHappenedToAnEntry)
    expect((MERGE_STEPS as readonly string[]).includes('fix-round-looked')).toBe(true)
    expect(Reflect.get(A_STEP_IS_TAKEN_FROM, 'fix-round-looked')).toBe('testing')
    expect(waits({})).toEqual({ move: 'stays', because: 'waits-for-a-fix-round' })
    expect(waits({ waitsForAFixRound: false })).toEqual({ move: 'bounce', reason: 'red' })
    expect(waits({ repairPassed: false })).toEqual({ move: 'bounce', reason: 'red' })
    expect(waits({ flakyAtBlock: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(waits({ takeBack: true })).toEqual({ move: 'bounce', reason: 'red' })
    expect(waits({ handsOnTheRed: true })).toEqual({ move: 'to', state: 'resolving' })
    expect(waits({ handedBack: true })).toEqual({ move: 'stays', because: 'handed-back' })
    expect(waits({ green: true })).toEqual({ move: 'stays', because: 'green' })
  })
})
