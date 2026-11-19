// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real merger lands an exact entry tree after its build and related tests, without lending partial evidence. */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aRealOfficeForTheMerger, t, office, base, mainCheckout, submitGit, runTheTool, factsOf, detailOf, readingOf, stateOf, sandboxCallsOf, write } from './the-merger-fixture.ts'
import { WITH_LISTS, RECORDER, change, suitesOf, filesNamed, leftOutOf, judged, position } from './related-only-merger-fixture.ts'

aRealOfficeForTheMerger('tests/the-queue-tests-an-entry-with-its-related-tests.test.ts')

it('lands a green entry with one related run, no reads, and no bus or borrowed result', async () => position('1', async () => {
  const main = mainCheckout('related-green', { ...WITH_LISTS, ...RECORDER })
  const { entry } = await submitGit(main, 'related-green', change)
  await judged(entry)
  const rider = await submitGit(main, 'related-rider', dir => write(dir, { 'src/a.txt': 'changed\n' }))
  await judged(rider.entry)
  const { gateCountsReading } = await import('../src/server/lib/gate-counts.ts')
  const earlierCount = gateCountsReading().get('related-tests-only')?.sinceCountingBegan.wouldStop ?? 0
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(suitesOf(entry).map(filesNamed)).toEqual([['tests/one.test.ts', 'tests/thing.test.ts']])
  expect(leftOutOf(suitesOf(entry)[0]!)).toEqual([])
  expect(readFileSync(done.log, 'utf8').match(/running build:/g)).toHaveLength(1)
  expect(gateCountsReading().get('related-tests-only')?.sinceCountingBegan.wouldStop).toBe(earlierCount + 1)
  const facts = factsOf(done, 'tested')!
  expect(facts['relatedOnly']).toMatchObject({ files: 2, related: 2, every: 12, leftOutSlow: [] })
  expect(facts['wholeSuiteBecause']).toBeUndefined()
  expect(facts['testedWith']).toBeUndefined()
  expect(facts['borrowedFrom']).toBeUndefined()
  expect(detailOf(entry, 'tested')['reads']).toBeUndefined()
  expect(readingOf(entry).machine?.tested).toMatchObject({ relatedOnly: facts['relatedOnly'] })
  expect(facts['says']).toMatch(/build and the 2 related tests passed on the exact tree that lands/)
  expect(facts['says']).toContain('whole suite was not run')
  expect(facts['says']).toContain('next main suite')
  expect(facts['says']).toContain('fix round did not apply')
  expect(stateOf(rider.entry)).toBe('judged')
  const next = await runTheTool(rider.entry)
  expect(next.code, next.err + next.out).toBe(0)
  expect(factsOf(next, 'tested')!['borrowedFrom']).toBeUndefined()
  expect(suitesOf(rider.entry)).toHaveLength(1)
}), 90_000)

it('bounces a red related file after its rerun and main comparison even with fix rounds on', async () => position('1', async () => {
  const saved = process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
  process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = '1'
  try {
    const main = mainCheckout('related-red', { ...WITH_LISTS, 'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => expect(answer).toBe(1))\n" })
    const { entry } = await submitGit(main, 'related-red', change)
    await judged(entry)
    const { gateCountsReading } = await import('../src/server/lib/gate-counts.ts')
    const countsBefore = gateCountsReading().get('whole-suite-fix-round')
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(entry)).toBe('bounced')
    expect(suitesOf(entry).map(filesNamed)).toEqual([['tests/one.test.ts', 'tests/thing.test.ts']])
    expect(factsOf(done, 'tested')).toMatchObject({ green: false, redTests: ['tests/thing.test.ts'] })
    expect(factsOf(done, 'tested')!['wholeSuiteRed']).toBeUndefined()
    expect(readingOf(entry).machine?.tested?.relatedOnly).toEqual(factsOf(done, 'tested')!['relatedOnly'])
    const detail = detailOf(entry, 'tested')
    expect(detail['red']).toMatchObject([{ file: 'tests/thing.test.ts', alone: 'red' }])
    expect(detail['compared']).toMatchObject([{ file: 'tests/thing.test.ts', onMainToo: false }])
    expect(detail['ran']['affected']).toBeUndefined()
    expect(detail['ran']['related']).toBeUndefined()
    expect(gateCountsReading().get('whole-suite-fix-round')).toEqual(countsBefore)
    expect(factsOf(done, 'tested')!['says']).toContain('fix round did not apply')
  } finally {
    if (saved === undefined) delete process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND']
    else process.env['MOLE_OFFICE_WHOLE_SUITE_FIX_ROUND'] = saved
  }
}), 65_000)

it('names a related file left out for its longest recorded time while the switch for running related first is off', async () => position('1', async () => {
  const recorded = join(base, 'work', 'earlier-slow-entry')
  mkdirSync(recorded, { recursive: true })
  writeFileSync(join(recorded, 'suite.json'), JSON.stringify({ testResults: [{ name: '/elsewhere/clone/tests/thing.test.ts', startTime: 0, endTime: 200_000 }] }))
  try {
    const main = mainCheckout('related-slow', WITH_LISTS)
    const { entry } = await submitGit(main, 'related-slow', change)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    expect(suitesOf(entry).map(filesNamed)).toEqual([['tests/one.test.ts']])
    expect(factsOf(done, 'tested')!['relatedOnly']).toMatchObject({ files: 1, related: 2, every: 12, leftOutSlow: [{ file: 'tests/thing.test.ts', seconds: 200 }] })
    expect(factsOf(done, 'tested')!['says']).toContain('tests/thing.test.ts (200 s)')
    expect(factsOf(done, 'tested')!['says']).toContain('next main suite runs it')
  } finally { rmSync(recorded, { recursive: true, force: true }) }
}), 45_000)

for (const value of ['0', undefined]) it(`keeps today's whole suite at ${value ?? 'the absent setting'} without asking for a list`, async () => position(value, async () => {
  const main = mainCheckout(`related-off-${value ?? 'absent'}`, { ...WITH_LISTS, 'tests/the-test-lists.ts': "throw new Error('the list must not be asked for')\n" })
  const { entry } = await submitGit(main, `related-off-${value ?? 'absent'}`, change)
  await judged(entry)
  const door = await import('../src/server/lib/merge-entry-door.ts')
  door.asTheMergeQueue(() => t.api.patchRecord(entry, { dataPatch: { tested: { green: true, log: 'synthetic earlier test', relatedOnly: { files: 1, related: 2, every: 12, leftOutSlow: [{ file: 'tests/old.test.ts', seconds: 200 }], says: 'Earlier partial run.' }, wholeSuiteBecause: [{ case: 5, says: 'Earlier missing list.' }] } } }, office))
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(readingOf(entry).machine?.tested?.relatedOnly).toBeUndefined()
  expect(readingOf(entry).machine?.tested?.wholeSuiteBecause).toBeUndefined()
  expect(suitesOf(entry).map(filesNamed)).toEqual([[]])
  expect(factsOf(done, 'tested')!['relatedOnly']).toBeUndefined()
  expect(factsOf(done, 'tested')!['wholeSuiteBecause']).toBeUndefined()
  expect(readFileSync(done.log, 'utf8')).not.toContain('the list must not be asked for')
  expect(existsSync(join(detailOf(entry, 'tested')['tree'], '.logs'))).toBe(false)
}), 45_000)

it('stops on a switch value other than zero or one before any build or test', async () => position('unknown-position', async () => {
  const main = mainCheckout('related-invalid', WITH_LISTS)
  const { entry } = await submitGit(main, 'related-invalid', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code).not.toBe(0)
  expect(done.err + done.out + readFileSync(done.log, 'utf8')).toContain('unknown-position')
  expect(factsOf(done, 'tested')).toBeNull()
  expect(suitesOf(entry)).toEqual([])
  expect(readFileSync(done.log, 'utf8')).not.toContain('running build:')
}), 45_000)


it('keeps a red testing build red and records zero related files run', async () => position('1', async () => {
  const mark = join(base, 'build-ran-once')
  const main = mainCheckout('related-build-red', {
    ...WITH_LISTS,
    'tools/build.mjs': `import { existsSync, writeFileSync } from 'node:fs'\nconst mark = ${JSON.stringify(mark)}\nconst again = existsSync(mark)\nwriteFileSync(mark, 'built')\nprocess.exit(again ? 1 : 0)\n`,
  })
  const { entry } = await submitGit(main, 'related-build-red', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('bounced')
  expect(suitesOf(entry)).toEqual([])
  expect(factsOf(done, 'tested')).toMatchObject({ green: false, build: { passed: false }, relatedOnly: { files: 0, related: 2, every: 12 } })
  expect(detailOf(entry, 'tested')['reads']).toBeUndefined()
}), 45_000)

it('clears a related red that also fails on main without claiming the original files all passed', async () => position('1', async () => {
  const main = mainCheckout('related-main-red', {
    ...WITH_LISTS,
    'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('synthetic main red', () => expect(answer).toBe(0))\n",
  })
  const { entry } = await submitGit(main, 'related-main-red', change)
  await judged(entry)
  const done = await runTheTool(entry)
  expect(done.code, done.err + done.out).toBe(0)
  expect(stateOf(entry)).toBe('merged')
  expect(suitesOf(entry).map(filesNamed)).toEqual([['tests/one.test.ts', 'tests/thing.test.ts']])
  expect(detailOf(entry, 'tested')['redOnMainToo']).toMatchObject([{ file: 'tests/thing.test.ts' }])
  const facts = factsOf(done, 'tested')!
  expect(facts).toMatchObject({ green: true, relatedOnly: { files: 2 } })
  expect(facts['says']).toContain('no test in them fails with this entry that main does not fail as well')
  expect(facts['says']).not.toContain('2 related tests passed')
  expect(facts['says']).toContain('whole suite was not run')
}), 60_000)
