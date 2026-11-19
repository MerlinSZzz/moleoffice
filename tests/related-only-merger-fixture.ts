// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic main and command readers shared by the related-only queue criteria. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import { REPO, PASSING_TEST, sandboxCallsOf, runTheTool, released, write } from './the-merger-fixture.ts'

export const WITH_LISTS: Record<string, string> = {
  'tests/the-test-lists.ts': "if (process.argv[2] === 'whole-tree') console.log('tests/one.test.ts')\n",
  'src/thing.ts': 'export const answer = 1\n',
  'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => { expect(answer).toBeGreaterThan(0) })\n",
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tests/plain-${i + 1}.test.ts`, PASSING_TEST])),
}
export const RECORDER = Object.fromEntries(['tools/record-what-tests-read.mjs', 'tools/record-what-tests-read-hooks.mjs'].map(file => [file, readFileSync(join(REPO, file), 'utf8')]))
export const change = (dir: string) => write(dir, { 'src/thing.ts': 'export const answer = 2\n' })
export const testFile = (word: string) => word.slice(word.lastIndexOf('/tests/') + 1)
export const suitesOf = (entry: string) => sandboxCallsOf(entry).filter(one => one['verb'] === 'exec' && (one['command'] as string[]).some(word => word.startsWith('--maxWorkers=')))
export const filesNamed = (call: Record<string, any>) => (call['command'] as string[]).filter((word, i, all) => word.endsWith('.test.ts') && all[i - 1] !== '--exclude').map(testFile)
export const leftOutOf = (call: Record<string, any>) => (call['command'] as string[]).filter((_, i, all) => all[i - 1] === '--exclude').map(testFile)
export async function judged(entry: string) {
  const run = await runTheTool(entry)
  expect(run.code, run.err + run.out).toBe(0)
  await released(entry)
}
export async function position<T>(value: string | undefined, work: () => Promise<T>): Promise<T> {
  const saved = process.env['MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY']
  if (value === undefined) delete process.env['MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY']
  else process.env['MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY'] = value
  try { return await work() } finally {
    if (saved === undefined) delete process.env['MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY']
    else process.env['MOLE_OFFICE_QUEUE_RELATED_TESTS_ONLY'] = saved
  }
}
