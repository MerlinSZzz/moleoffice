// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FEW FEATURE REDS HAVE A CLASS AND A CAUSE.
 * Measures the pure class reader, ordered refusal causes, and exact stored landing authority.
 * Mutations: count H toward the limit; allow N + 1; assume an absent build passed; reorder causes;
 * accept a blocked position or mismatching stored file. Each breaks the corresponding case below.
 */
import { expect, it } from 'vitest'
import { classifyMerge, classifyRedMerge, redMergeAuthorizesLanding, type RedMergeInput, type HouseRule } from '../src/shared/merge-class.ts'
const feature = ['tests/one.test.ts', 'tests/two.test.ts', 'tests/three.test.ts', 'tests/four.test.ts']
const list = new Map<string, HouseRule>([
  ['tests/house.test.ts', { class: 'H', kind: 'wording' }],
  ['tests/marked.test.ts', { class: 'H', kind: 'wording', mark: 'mixed' }],
  ['tests/safety.test.ts', { class: 'S', kind: 'safety' }],
  ['tests/privacy.test.ts', { class: 'P', kind: 'privacy' }],
  ['tests/quality.test.ts', { class: 'Q', kind: 'quality' }],
  ['tests/feature.test.ts', { class: 'F', kind: 'feature' }],
])
const base = (redTests = feature.slice(0, 1)): RedMergeInput => ({ redTests, list, redFiles: redTests, build: true, databasePaths: [], roundOpen: { open: true, starter: 'starter', run: 'round' }, fewRedFiles: 3 })
const classify = (more: Partial<RedMergeInput> = {}, files?: string[]) => classifyRedMerge({ ...base(files), ...more })
it('admits one and N feature files as class two', () => {
  for (const n of [1, 3]) expect(classify({}, feature.slice(0, n))).toMatchObject({ class: 2, featureFiles: feature.slice(0, n) })
})
it('names cause seven for N plus one and both numbers', () => {
  expect(classify({}, feature)).toMatchObject({ class: 3, cause: 7, reason: expect.stringContaining('4 feature test files') })
  expect(classify({}, feature).reason).toContain('MOLE_OFFICE_FEW_RED_FILES allows 3')
})
it.each([
  [{ build: false }, 1, 'build failed'], [{ build: undefined }, 2, 'does not say whether the build passed'],
  [{ redFiles: [] }, 3, 'without naming a file'],
  [{ redTests: ['tests/safety.test.ts'], redFiles: ['tests/safety.test.ts'] }, 4, 'tests/safety.test.ts'],
  [{ redTests: ['tests/privacy.test.ts'], redFiles: ['tests/privacy.test.ts'] }, 5, 'tests/privacy.test.ts'],
  [{ databasePaths: ['drizzle/change.sql'] }, 6, 'drizzle/change.sql'],
  [{ databasePaths: ['held-migrations/change.sql'] }, 6, 'held-migrations/change.sql'],
  [{ roundOpen: { open: false, reason: 'the starter is retired' } }, 8, 'starter is retired'],
] as const)('names the ordered cause %#', (more, cause, words) => {
  expect(classify(more as Partial<RedMergeInput>)).toMatchObject({ class: 3, cause, reason: expect.stringContaining(words) })
})
it('does not count plain H beside feature reds, but counts marked H, Q, F and unknown files', () => {
  expect(classify({ fewRedFiles: 1 }, [feature[0]!, 'tests/house.test.ts'])).toMatchObject({ class: 2, featureFiles: [feature[0]], houseRuleFiles: ['tests/house.test.ts'] })
  for (const file of ['tests/marked.test.ts', 'tests/quality.test.ts', 'tests/feature.test.ts', feature[0]!]) expect(classify({}, [file])).toMatchObject({ class: 2, featureFiles: [file] })
})
it('keeps class one unchanged even without new build and registry facts', () => {
  const old = classifyMerge(['tests/house.test.ts'], list)
  expect(classify({ build: undefined, roundOpen: undefined }, ['tests/house.test.ts'])).toMatchObject({ class: old.class, reason: old.reason })
})
it('chooses the first cause when several hold', () => {
  expect(classify({ build: false, redFiles: [], databasePaths: ['drizzle/change.sql'] })).toMatchObject({ class: 3, cause: 1 })
  expect(classify({ build: undefined, redFiles: [] })).toMatchObject({ cause: 2 })
  expect(classify({ redFiles: [], databasePaths: ['drizzle/change.sql'] })).toMatchObject({ cause: 3 })
  expect(classify({ databasePaths: ['drizzle/change.sql'], fewRedFiles: 1 }, feature)).toMatchObject({ cause: 6 })
})
it('never admits unreadable main or changed paths', () => {
  expect(classify({ list: null })).toMatchObject({ class: 3, reason: expect.stringContaining("could not read main's") })
  expect(classify({ databasePaths: null })).toMatchObject({ class: 3, reason: expect.stringContaining('could not read the changed paths') })
})
it('authorizes only a parsed class two decision at its exact tip and exact red names with both gates allowing it', () => {
  const redTests = [feature[0]!, 'tests/house.test.ts']
  const mergeClass = { ...classify({}, redTests), mainAt: 'main', build: true, databasePaths: [], roundOpen: { open: true, starter: 'starter', run: 'round' }, fewRedFiles: 3, position: 'remind', houseRulesPosition: 'remind' }
  const tested = { green: false, tip: 'tip', redTests, mergeClass }
  expect(redMergeAuthorizesLanding(tested, 'tip')).toBe(true)
  for (const change of [{ green: true }, { tip: 'other' }, { redTests: redTests.slice(0, 1) }, { redTests: [redTests[0], redTests[0]] }, { mergeClass: { ...mergeClass, position: 'block' } }, { mergeClass: { ...mergeClass, houseRulesPosition: 'block' } }, { mergeClass: { ...mergeClass, build: false } }]) expect(redMergeAuthorizesLanding({ ...tested, ...change }, 'tip')).toBe(false)
})
