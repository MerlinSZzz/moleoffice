// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOL REPORTS BUILDS, PATHS AND MERGE CLASSES.
 * Measures facts from two git ranges, a blob rather than a command, and the searchable expectation.
 * Mutations: read another range; omit build; omit database folders; claim unconditional class two.
 * No merger process or suite starts in this file.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { mergeClassAtResult, mergeClassLogLine } from '../tools/merge-tool/merge-class.mjs'
const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture() {
  const clone = mkdtempSync(join(tmpdir(), 'merge-class-tool-')); made.push(clone)
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
  git(clone, ['init', '-q', '-b', 'main']); git(clone, ['config', 'user.name', 'Synthetic fixture']); git(clone, ['config', 'user.email', 'fixture@example.invalid'])
  mkdirSync(join(clone, 'tests')); writeFileSync(join(clone, 'tests/red.test.ts'), 'red'); writeFileSync(join(clone, 'tests/house-rules.mjs'), 'export const HOUSE_RULES = {\n}\n')
  git(clone, ['add', '.']); git(clone, ['commit', '-qm', 'Main'])
  const M = git(clone, ['rev-parse', 'HEAD'])
  mkdirSync(join(clone, 'held-migrations')); writeFileSync(join(clone, 'held-migrations/change.sql'), 'change')
  git(clone, ['add', '.']); git(clone, ['commit', '-qm', 'Database entry'])
  const database = git(clone, ['rev-parse', 'HEAD'])
  writeFileSync(join(clone, 'tests/red.test.ts'), 'changed'); git(clone, ['commit', '-qam', 'Feature entry'])
  return { integrated: { clone, M: database, Cfinal: git(clone, ['rev-parse', 'HEAD']) }, git, M, database }
}
it('reads database paths from this entry own range, including held migrations', () => {
  const { integrated, git, M, database } = fixture()
  expect(mergeClassAtResult(integrated, ['tests/red.test.ts'], { passed: true }, git)).toMatchObject({ databasePaths: [], featureFiles: ['tests/red.test.ts'] })
  expect(mergeClassAtResult({ ...integrated, M, Cfinal: database }, ['tests/red.test.ts'], { passed: true }, git)).toMatchObject({ class: 3, cause: 6, databasePaths: ['held-migrations/change.sql'] })
})
it('names the file, count, build, paths and conditional class in one searchable line', () => {
  const { integrated, git } = fixture()
  const fact = mergeClassAtResult(integrated, ['tests/red.test.ts'], { passed: true }, git)
  expect(mergeClassLogLine(fact)).toBe('MERGE-CLASS: feature files (1): tests/red.test.ts; build passed; database paths: none; expects class 2 if the office allows the count and its line has a round open. The office decides by its own settings.')
  expect(mergeClassAtResult(integrated, ['npm test'], { passed: true }, git)).toMatchObject({ class: 3, cause: 3, featureFiles: [] })
})

it('runs every held repair file alone, treats no result as not passed and reports the elapsed cost', async () => {
  const { repairFiles } = await import('../tools/merge-tool/merge-class.mjs')
  const files = ['tests/passed.test.ts', 'tests/red.test.ts', 'tests/no-result.test.ts', 'tests/absent.test.ts'], ran: string[] = []
  let clock = 1000
  const result = await repairFiles({ repairOf: { problem: 'held-problem', files } }, async (file: string) => {
    ran.push(file); clock += 500
    return { absent: file === files[3], red: file === files[1], noResult: file === files[2] ? 'no report' : null }
  }, () => clock)
  expect(ran).toEqual(files)
  expect(result).toEqual({ fact: { problem: 'held-problem', files: files.map((file, index) => ({ file, passed: index === 0 })) }, seconds: 2 })
  expect(mergeClassLogLine({ featureFiles: [], class: 3, reason: 'No red file.', build: true, databasePaths: [] }, result)).toContain('Repair named-file runs took 2.000 seconds.')
})
