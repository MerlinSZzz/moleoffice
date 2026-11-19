// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The related-only switch keeps the whole suite for paths and selections that need its coverage. */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aRealOfficeForTheMerger, base, mainCheckout, submitGit, runTheTool, factsOf, readingOf, stateOf, pressedToLand, write } from './the-merger-fixture.ts'
import { WITH_LISTS, change, suitesOf, filesNamed, judged, position } from './related-only-merger-fixture.ts'

aRealOfficeForTheMerger('tests/some-entries-still-get-the-whole-suite-at-related-only.test.ts')

const groups = [
  { case: 1, paths: ['tools/merge-tool/testing.mjs'] },
  { case: 2, paths: ['drizzle/synthetic.sql', 'held-migrations/synthetic.sql', 'src/server/db/synthetic.ts'] },
  { case: 3, paths: ['tools/stable/upgrade-stable.mjs', 'tools/stable/bootstrap-stable.mjs', 'tools/stable/stable-upgrade-synthetic.mjs', 'tools/stable/stable-bootstrap-synthetic.mjs', 'tools/stable/stable-release-policy.mjs', 'tools/stable/stable-service-settings.mjs', 'src/shared/whole-suite-receipt.ts', 'src/shared/stable-upgrade-notices.ts'] },
  { case: 4, paths: ['src/server/index.ts', 'src/worker/index.ts', 'tools/serve-dev.mjs', 'tools/files-that-restart-the-server.mjs'] },
]
for (const group of groups) it(`runs the whole suite for path case ${group.case} without working out the related list`, async () => position('1', async () => {
  const main = mainCheckout(`whole-case-${group.case}`, { ...WITH_LISTS, 'tests/the-test-lists.ts': "throw new Error('do not work out this list')\n" })
  const { entry } = await submitGit(main, `whole-case-${group.case}`, dir => write(dir, Object.fromEntries(group.paths.map(path => [path, '// synthetic change\n']))))
  await judged(entry)
  if (group.case === 2) await pressedToLand(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
  const facts = factsOf(done, 'tested')!
  expect(readingOf(entry).machine?.tested?.wholeSuiteBecause).toEqual(facts['wholeSuiteBecause'])
  expect(facts['relatedOnly']).toBeUndefined()
  expect(facts['wholeSuiteBecause']).toEqual(expect.arrayContaining([expect.objectContaining({ case: group.case, paths: [...group.paths].sort() })]))
  expect(facts['says']).toContain(`Case ${group.case}`)
  expect(facts['says']).toContain('related list was not worked out')
  expect(readFileSync(done.log, 'utf8')).not.toContain('do not work out this list')
}), 50_000)

it('names every matching path case, limits paths to twenty, and counts the rest in its sentence', async () => position('1', async () => {
  const paths = Array.from({ length: 23 }, (_, i) => `src/server/db/synthetic-${i}.ts`)
  const main = mainCheckout('whole-many-paths', WITH_LISTS)
  const { entry } = await submitGit(main, 'whole-many-paths', dir => write(dir, Object.fromEntries([...paths, 'tools/merge-tool/testing.mjs', 'src/server/index.ts'].map(path => [path, '// synthetic\n']))))
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  const reasons = factsOf(done, 'tested')!['wholeSuiteBecause'] as { case: number; paths: string[]; says: string }[]
  expect(reasons.map(one => one.case)).toEqual([1, 2, 4])
  expect(reasons[1]!.paths).toHaveLength(20)
  expect(reasons[1]!.says).toContain('3 more paths')
  for (const one of reasons) expect(factsOf(done, 'tested')!['says']).toContain(one.says)
  expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
}), 50_000)

it('runs the whole suite for case 5 when the list script fails and keeps its sentence', async () => position('1', async () => {
  const main = mainCheckout('whole-no-list', { ...WITH_LISTS, 'tests/the-test-lists.ts': "throw new Error('synthetic list failure')\n" })
  const { entry } = await submitGit(main, 'whole-no-list', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
  expect(factsOf(done, 'tested')!['wholeSuiteBecause']).toEqual([expect.objectContaining({ case: 5, says: expect.stringContaining('synthetic list failure') })])
  expect(factsOf(done, 'tested')!['says']).toContain('Case 5')
}), 45_000)

it('runs the whole suite for case 5 when every related file was left out as slow', async () => position('1', async () => {
  const recorded = join(base, 'work', 'earlier-all-slow')
  mkdirSync(recorded, { recursive: true })
  writeFileSync(join(recorded, 'suite.json'), JSON.stringify({ testResults: ['one', 'thing'].map(name => ({ name: `/elsewhere/clone/tests/${name}.test.ts`, startTime: 0, endTime: 200_000 })) }))
  try {
    const main = mainCheckout('whole-all-slow', WITH_LISTS)
    const { entry } = await submitGit(main, 'whole-all-slow', change)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
    expect(factsOf(done, 'tested')!['wholeSuiteBecause']).toEqual([expect.objectContaining({ case: 5, says: expect.stringContaining('left out every file of --list related') })])
  } finally { rmSync(recorded, { recursive: true, force: true }) }
}), 45_000)

it('uses the half bound: over half gets case 6, while between a quarter and half gets related only', async () => position('1', async () => {
  for (const importers of [7, 3]) {
    const main = mainCheckout(`whole-bound-${importers}`, {
      ...WITH_LISTS,
      ...Object.fromEntries(Array.from({ length: importers - 1 }, (_, i) => [`tests/plain-${i + 1}.test.ts`, WITH_LISTS['tests/thing.test.ts']!])),
    })
    const { entry } = await submitGit(main, `whole-bound-${importers}`, change)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    const facts = factsOf(done, 'tested')!
    if (importers === 7) {
      expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
      expect(facts['relatedOnly']).toBeUndefined()
      expect(facts['wholeSuiteBecause']).toEqual([expect.objectContaining({ case: 6, says: expect.stringContaining('12 test files') })])
      expect(facts['says']).toContain('Case 6')
    } else {
      expect(suitesOf(entry)).toHaveLength(1)
      expect(filesNamed(suitesOf(entry)[0]!).sort()).toEqual(['tests/one.test.ts', 'tests/plain-1.test.ts', 'tests/plain-2.test.ts', 'tests/thing.test.ts'])
      expect(facts['relatedOnly']).toMatchObject({ files: 4, related: 4, every: 12 })
      expect(facts['wholeSuiteBecause']).toBeUndefined()
    }
  }
}), 70_000)

it('keeps the legacy affected run and fix-round admission when a path case requires the whole suite', async () => position('1', async () => {
  const saved = process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  try {
    const main = mainCheckout('whole-path-fix-round', {
      ...WITH_LISTS,
      'tests/plain-1.test.ts': "import { expect, it } from 'vitest'\nit('synthetic unrelated red', () => expect(false).toBe(true))\n",
    })
    const { entry } = await submitGit(main, 'whole-path-fix-round', dir => write(dir, { 'tools/merge-tool/testing.mjs': '// synthetic queue change\n' }))
    await judged(entry)
    const { gateCountsReading } = await import('../src/server/lib/gate-counts.ts')
    const before = gateCountsReading().get('whole-suite-fix-round')?.sinceCountingBegan.wouldStop ?? 0
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(suitesOf(entry).map(filesNamed)).toEqual([['tests/one.test.ts'], []])
    const facts = factsOf(done, 'tested')!
    expect(facts['wholeSuiteBecause']).toEqual([expect.objectContaining({ case: 1, paths: ['tools/merge-tool/testing.mjs'] })])
    expect(facts['wholeSuiteRed']).toMatchObject({ outcome: 'admitted-for-fix-round', affected: { selection: 'complete', exit: 0 }, suite: { exit: 1 } })
    expect(facts['relatedOnly']).toBeUndefined()
    expect(facts['says']).toContain('for related-only selection')
    expect(facts['says']).not.toContain('fix round did not apply')
    expect(gateCountsReading().get('whole-suite-fix-round')?.sinceCountingBegan.wouldStop).toBe(before + 1)
    expect(stateOf(entry)).toBe('merged')
  } finally {
    if (saved === undefined) delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
    else process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = saved
  }
}), 90_000)
