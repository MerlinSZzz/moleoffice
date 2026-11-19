// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORD THAT IS NOT A RECORD KIND IS REFUSED RATHER THAN ALLOWED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * There were two lists, both called work, and they disagreed about four kinds:
 *
 *   `KIND_FAMILIES.work` in src/shared/work.ts          task, obligation, purchase, problem
 *   `ALLOCATABLE_KINDS` in src/server/lib/planning.ts   task, block, obligation, direction, problem
 *
 * Neither derived from the other and nothing failed when they disagreed, which is the recurring
 * defect CLAUDE.md names: the same fact worked out in two places, so the two can drift.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 * 4. The refusal names the word it refuses, rather than giving a general sentence.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  planHoursRuleOf,
} from '../src/shared/work.ts'
import { freshDb, type TestDb } from './helpers.ts'

// src/server/lib/planning.ts opens MOLE_OFFICE_DB the moment it is imported, so it is imported inside a
// test and only after `freshDb` has pointed that at a throwaway file. A top-level import here would
// open the operator's real database just to read a constant out of the module.
let t: TestDb
beforeAll(async () => {
  t = await freshDb()
}, 60_000)
afterAll(() => {
  t.close()
})

describe('one declaration of which kinds a plan may give hours to', () => {
  it('refuses a word that is not a record kind, rather than allowing it', () => {
    // Absence beats a guess, in the direction that does not write bad data.
    const rule = planHoursRuleOf('sprint')
    expect(rule.mayHaveHours).toBe(false)
    expect(rule.why).toContain('sprint')
  })
})

