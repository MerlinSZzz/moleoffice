// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { readHouseRules, classifyMerge } from '../src/shared/merge-class.ts'

const text = `export const HOUSE_RULES = {
  'tests/plain.test.ts': { class: 'H', kind: 'wording' },
  'tests/second.test.ts': { class: 'H', kind: 'naming' },
  'tests/borderline.test.ts': { class: 'H', kind: 'wording', mark: 'borderline' },
  'tests/mixed.test.ts': { class: 'H', kind: 'wording', mark: 'mixed' },
  'tests/privacy.test.ts': { class: 'P', kind: 'owner-content' },
  'tests/safety.test.ts': { class: 'S', kind: 'test-hygiene' },
  'tests/quality.test.ts': { class: 'Q', kind: 'other' },
  'tests/flow.test.ts': { class: 'F', kind: 'other' },
}`
const list = readHouseRules(text)
it('admits only a nonempty set of plain H files', () => {
  expect(classifyMerge(['tests/plain.test.ts', 'tests/second.test.ts'], list)).toMatchObject({ class: 1, files: [{ file: 'tests/plain.test.ts', class: 'H' }, { file: 'tests/second.test.ts', class: 'H' }] })
  expect(classifyMerge([], list).class).toBeNull()
})
it('names the first feature file even beside a plain house rule', () => {
  const found = classifyMerge(['tests/plain.test.ts', 'tests/feature.test.ts'], list)
  expect(found.class).toBeNull()
  expect(found.reason).toContain('tests/feature.test.ts')
  expect(found.reason).toContain('feature test')
})
for (const [file, reason] of [['borderline', 'borderline'], ['mixed', 'mixed'], ['privacy', 'class P'], ['safety', 'class S'], ['quality', 'class Q'], ['flow', 'class F']]) {
  it(`refuses ${file} with its reason`, () => {
    const found = classifyMerge([`tests/${file}.test.ts`], list)
    expect(found.class).toBeNull()
    expect(found.reason).toContain(reason)
  })
}
it('treats every file as a feature test when main has no list', () => {
  expect(classifyMerge(['tests/plain.test.ts'], readHouseRules(null))).toMatchObject({ class: null, files: [{ file: 'tests/plain.test.ts' }] })
})
it('refuses unreadable entry lines and unknown class or mark words without running text', () => {
  for (const line of ["'tests/x.test.ts': anything(),", "'tests/x.test.ts': { class: 'Z', kind: 'wording' },", "'tests/x.test.ts': { class: 'H', kind: 'wording', mark: 'unknown' },"]) {
    expect(() => readHouseRules(`export const HOUSE_RULES = {\n${line}\n}`)).toThrow(/line 2/)
  }
})
