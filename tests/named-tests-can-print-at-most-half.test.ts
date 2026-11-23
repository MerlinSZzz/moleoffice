// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A print-only half bound for the queue, with machine-readable counts and slow omissions. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
const TOOL = join(import.meta.dirname, '..', 'tools/run-named-tests.mjs')
const PREFIX = 'RELATED_TESTS_FACTS '
let root = ''
function put(file: string, text: string) {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), text)
}
function git(...args: string[]) {
  return execFileSync('git', ['-C', root, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], { encoding: 'utf8' }).trim()
}
function commit() { git('add', '-A'); git('commit', '-qm', 'synthetic change') }
function run(...args: string[]) { return spawnSync(process.execPath, [TOOL, '--root', root, ...args], { cwd: root, encoding: 'utf8' }) }
function facts(stderr: string) { return JSON.parse(stderr.split('\n').find(line => line.startsWith(PREFIX))!.slice(PREFIX.length)) }
function change() { put('src/thing.ts', 'export const answer = 2\n'); commit() }
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'half-related-'))
  git('init', '-qb', 'main')
  put('package.json', '{"type":"module"}\n')
  put('src/thing.ts', 'export const answer = 1\n')
  put('tests/the-test-lists.ts', "console.log('tests/whole.test.ts')\n")
  put('tests/whole.test.ts', 'test("whole", () => {})\n')
  for (let i = 0; i < 11; i++) put(`tests/plain-${i}.test.ts`, i < 3 ? "import { answer } from '../src/thing.ts'\ntest('answers', () => expect(answer).toBeGreaterThan(0))\n" : 'test("plain", () => {})\n')
  commit()
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('refuses the option unless both the related list and print are asked for, before running anything', () => {
  for (const args of [['--print', 'tests/whole.test.ts'], ['--list', 'related']]) {
    const ran = run('--at-most-half', ...args)
    expect(ran.status, ran.stderr).toBe(2)
    expect(ran.stdout).toBe('')
    expect(ran.stderr).toContain('--at-most-half needs --list related and --print')
  }
}, 15_000)

it('prints a list between a quarter and a half with counts that include the whole-tree list', () => {
  change()
  const ran = run('--list', 'related', '--print', '--at-most-half')
  expect(ran.status, ran.stderr).toBe(0)
  expect(ran.stdout.trim().split('\n')).toHaveLength(4)
  expect(facts(ran.stderr)).toEqual({ related: 4, every: 12, leftOutSlow: [] })
}, 15_000)

it('refuses over half with exit three and both counts, before applying the slow bound', () => {
  for (let i = 3; i < 7; i++) put(`tests/plain-${i}.test.ts`, "import { answer } from '../src/thing.ts'\ntest('answers', () => expect(answer).toBeGreaterThan(0))\n")
  commit(); git('update-ref', 'refs/remotes/origin/main', 'HEAD'); change()
  const ran = run('--list', 'related', '--print', '--at-most-half', '--leave-out-slower-than', '1')
  expect(ran.status, ran.stderr).toBe(3)
  expect(ran.stdout).toBe('')
  expect(ran.stderr).toContain('8')
  expect(ran.stderr).toContain('12 test files')
  expect(facts(ran.stderr)).toEqual({ related: 8, every: 12, leftOutSlow: [] })
}, 15_000)

it('refuses every file with exit three even if the numerical half check were missing', () => {
  put('vitest.config.ts', 'export default { test: {} }\n'); commit()
  const ran = run('--list', 'related', '--print', '--at-most-half')
  expect(ran.status, ran.stderr).toBe(3)
  expect(ran.stdout).toBe('')
  expect(ran.stderr).toContain('every one of the 12 test files')
  expect(facts(ran.stderr)).toMatchObject({ related: 12, every: 12 })
}, 15_000)

it('reports every slow file with its longest time in seconds and keeps the pre-omission counts', () => {
  change()
  put('times/first.json', JSON.stringify({ testResults: [{ name: '/other/tests/plain-0.test.ts', startTime: 0, endTime: 200_000 }] }))
  put('times/second.json', JSON.stringify({ testResults: [{ name: '/other/tests/plain-0.test.ts', startTime: 0, endTime: 190_000 }] }))
  const ran = run('--list', 'related', '--print', '--at-most-half', '--leave-out-slower-than', '100', '--times', join(root, 'times'))
  expect(ran.status, ran.stderr).toBe(0)
  expect(ran.stdout.trim().split('\n')).toHaveLength(3)
  expect(ran.stdout).not.toContain('plain-0.test.ts')
  expect(facts(ran.stderr)).toEqual({ related: 4, every: 12, leftOutSlow: [{ file: 'tests/plain-0.test.ts', seconds: 200 }] })
}, 15_000)

it('keeps ordinary list output byte for byte and its quarter refusal at exit two', () => {
  change()
  const ordinary = run('--list', 'related', '--print')
  expect(ordinary.status).toBe(2)
  expect(ordinary.stdout).toBe('')
  const base = git('rev-parse', 'origin/main').slice(0, 12), tip = git('rev-parse', 'HEAD').slice(0, 12)
  expect(ordinary.stderr).toBe(`run-named-tests refused one thing, and ran nothing:\n  - The change ${base}..${tip} reaches 3 test files, 4 with the whole-tree list, and --list related runs at most a quarter of the 12 test files (3). Name the files you know it touches, with --list whole-tree; the merge queue runs the rest. The test files that reach the change only by starting the whole server or building the whole page were not counted, because the list is refused.\n`)
}, 15_000)
