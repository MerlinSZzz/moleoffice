// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOL READS HOUSE RULES FROM MAIN.
 * WHAT IS MEASURED: throwaway git commits distinguish main's inventory from an entry's additions
 * and edits, absence, malformed text, and git failures. Commands are feature tests too.
 * MUTATION: read Cfinal instead of M and the entry-list cases go red. No merger process starts.
 * BOTH READERS: one case pins houseRuleListAtMain's text and why for a list, no list, failed git and malformed text, beside houseRulesAtMain's state on the same main.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { houseRuleListAtMain, houseRulesAtMain, houseRulesLogLine } from '../tools/merge-tool/house-rules.mjs'
const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture(text: string | null) {
  const clone = mkdtempSync(join(tmpdir(), 'house-rule-tool-')); made.push(clone)
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(clone, ['init', '-q', '-b', 'main']); git(clone, ['config', 'user.name', 'Synthetic fixture']); git(clone, ['config', 'user.email', 'fixture@example.invalid'])
  mkdirSync(join(clone, 'tests')); writeFileSync(join(clone, 'baseline'), 'baseline')
  if (text !== null) writeFileSync(join(clone, 'tests/house-rules.mjs'), text)
  git(clone, ['add', '.']); git(clone, ['commit', '-qm', 'Synthetic main'])
  const M = git(clone, ['rev-parse', 'HEAD'])
  writeFileSync(join(clone, 'tests/house-rules.mjs'), inventory('H', true))
  git(clone, ['add', '.']); git(clone, ['commit', '-qm', 'Synthetic entry list'])
  return { integrated: { clone, M, Cfinal: git(clone, ['rev-parse', 'HEAD']) }, git }
}
const inventory = (klass: string, extra = false) => `export const HOUSE_RULES = {\n  'tests/red.test.ts': { class: '${klass}', kind: 'wording' },\n${extra ? "  'tests/feature.test.ts': { class: 'H', kind: 'wording' },\n" : ''}}`
it('follows main when the entry changes the class and adds its own red file', () => {
  const { integrated, git } = fixture(inventory('P'))
  const found = houseRulesAtMain(integrated, ['tests/red.test.ts', 'tests/feature.test.ts'], git)
  expect(found).toMatchObject({ mainAt: integrated.M, list: { state: 'read' }, class: null, files: [{ file: 'tests/red.test.ts', class: 'P' }, { file: 'tests/feature.test.ts' }] })
  expect(found.files[1]).not.toHaveProperty('class')
})
it('reports plain H from main and a searchable expectation line', () => {
  const { integrated, git } = fixture(inventory('H'))
  const found = houseRulesAtMain(integrated, ['tests/red.test.ts'], git)
  expect(found.class).toBe(1)
  expect(found.files[0]).not.toHaveProperty('mark')
  expect(houseRulesLogLine(found)).toBe('HOUSE-RULES: tests/red.test.ts: class H, no mark; expects class 1. The office decides by its own setting.')
  expect(houseRulesAtMain(integrated, ['npm run build'], git).class).toBeNull()
})
it('reports an absent main list without trusting the entry addition', () => {
  const { integrated, git } = fixture(null)
  expect(houseRulesAtMain(integrated, ['tests/red.test.ts'], git)).toMatchObject({ list: { state: 'absent' }, class: null, files: [{ file: 'tests/red.test.ts' }] })
})
it('reports malformed main text or failed git and expects nothing', () => {
  const { integrated, git } = fixture("export const HOUSE_RULES = {\n  'tests/red.test.ts': nonsense,\n}")
  expect(houseRulesAtMain(integrated, ['tests/red.test.ts'], git)).toMatchObject({ list: { state: 'unreadable', reason: expect.stringContaining('line 2') }, class: null })
  expect(houseRulesAtMain({ ...integrated, M: 'no-such-commit' }, ['tests/red.test.ts'], git).list.state).toBe('unreadable')
})
it('reads main text and tells the three answers, agreeing with the classifying reader', () => {
  const listed = fixture(inventory('P'))
  const read = houseRuleListAtMain(listed.integrated, listed.git)
  expect(read).toEqual({ mainAt: listed.integrated.M, text: inventory('P'), why: null })
  expect(read.text).not.toContain('tests/feature.test.ts')
  expect(houseRulesAtMain(listed.integrated, ['tests/red.test.ts'], listed.git).list.state).toBe('read')

  const absent = fixture(null)
  expect(houseRuleListAtMain(absent.integrated, absent.git)).toEqual({ mainAt: absent.integrated.M, text: null, why: null })
  expect(houseRulesAtMain(absent.integrated, ['tests/red.test.ts'], absent.git).list.state).toBe('absent')

  const failed = fixture(inventory('H'))
  const broken = { ...failed.integrated, M: 'no-such-commit' }
  const failure = houseRuleListAtMain(broken, failed.git)
  expect(failure.text).toBeNull()
  expect(failure.why).toContain('tests/house-rules.mjs')
  expect(failure.why).toContain('no-such-commit')
  expect(houseRulesAtMain(broken, ['tests/red.test.ts'], failed.git).list.state).toBe('unreadable')

  const malformedText = "export const HOUSE_RULES = {\n  'tests/red.test.ts': nonsense,\n}"
  const malformed = fixture(malformedText)
  // This reader does not parse, so malformed text still comes back with no why. Parsing is left to
  // the plain privacy files; houseRulesAtMain calling the same text unreadable is the intended difference.
  expect(houseRuleListAtMain(malformed.integrated, malformed.git)).toEqual({ mainAt: malformed.integrated.M, text: malformedText, why: null })
  expect(houseRulesAtMain(malformed.integrated, ['tests/red.test.ts'], malformed.git).list.state).toBe('unreadable')
})
