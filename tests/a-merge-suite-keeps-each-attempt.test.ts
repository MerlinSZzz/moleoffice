// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The merge tool runs against a throwaway office and a synthetic test command which never starts a suite. */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { aRealOfficeForTheMerger, mainCheckout, submitGit, write, runTheTool, released, workdirOf, factsOf } from './the-merger-fixture.ts'
import { runRetainedSuite } from '../tools/merge-tool/suite-attempt.mjs'

aRealOfficeForTheMerger('tests/a-merge-suite-keeps-each-attempt.test.ts')
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('keeps the production cloud and local paths separate, including the optional box report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'retained-suite-'))
  roots.push(root)
  const working = join(root, 'working')
  const kept = join(root, 'kept')
  mkdirSync(working); mkdirSync(kept)
  const report = join(working, 'suite.json'), log = join(working, 'suite.log')
  const reads = join(working, 'reads'), door = join(root, 'synthetic-door')
  writeFileSync(door, 'stand-in')
  const copy = (from: string, name: string) => {
    const to = join(kept, name)
    rmSync(to, { force: true })
    if (existsSync(from)) copyFileSync(from, to)
    return to
  }
  const commit = 'a'.repeat(40)
  const first = await runRetainedSuite({ workdir: kept, label: 'suite', written: report, keepTheReport: copy,
    box: { clone: root, commit, report, reads, suiteLog: log, timeoutSec: 2 },
    door, theRealDoor: 'not-the-synthetic-door', hereIs: 'synthetic', log: () => {},
    here: async () => { throw new Error('the first attempt should use the box') },
    run: async () => {
      mkdirSync(reads, { recursive: true }); writeFileSync(join(reads, 'read'), 'synthetic reads')
      writeFileSync(report, JSON.stringify({ testResults: [{ name: join(root, 'tests/one.test.ts'), status: 'failed', assertionResults: [] }] }))
      writeFileSync(log, 'first suite log')
      const doorLog = join(working, 'door.log')
      writeFileSync(doorLog, JSON.stringify({ ran: true, code: 1, commit, wallSec: 1, workers: 1, failed: ['tests/one.test.ts'] }))
      return { code: 1, outFile: doorLog }
    },
  })
  expect(first.ran.where).toBe('box')
  const folder = join(kept, readdirSync(kept)[0]!)
  const paths = ['suite.json', 'suite.log', 'suite-door.log', 'suite.on-the-box.json'].map(name => join(folder, name))
  const before = paths.map(path => readFileSync(path, 'utf8'))
  expect(first.kept).toBe(paths[0]); expect(first.ran.outFile).toBe(paths[1]); expect(first.ran.box.doorLog).toBe(paths[2])
  const second = await runRetainedSuite({ workdir: kept, label: 'suite', written: report, keepTheReport: copy,
    box: { why: 'synthetic local attempt' }, door, theRealDoor: door, hereIs: 'synthetic', log: () => {},
    run: async () => { throw new Error('the second attempt does not call the box') },
    here: async () => { writeFileSync(report, 'second report'); writeFileSync(log, 'second suite log'); return { code: 0, outFile: log } },
  })
  expect(second.ran.where).toBe('here')
  expect(paths.map(path => readFileSync(path, 'utf8'))).toEqual(before)
  expect(readFileSync(second.kept, 'utf8')).toBe('second report')
  expect(readFileSync(second.ran.outFile, 'utf8')).toBe('second suite log')
  expect(existsSync(join(kept, readdirSync(kept).find(name => join(kept, name) !== folder)!, 'suite.on-the-box.json'))).toBe(false)
  expect(second.ran.box.doorLog).toBeNull()
})

// The first rerun returns no report, forcing the merger to stop and retry the same entry. The second rerun passes.
// Every invocation is this small synthetic writer, not Vitest or a whole suite.
const SYNTHETIC = `import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const report = process.argv.find(x => x.startsWith('--outputFile.json='))?.slice('--outputFile.json='.length)
if (!report) throw Error('missing report path')
const suite = report.endsWith('/suite.json')
const countFile = '.synthetic-suite-count'
const count = existsSync(countFile) ? Number(readFileSync(countFile, 'utf8')) : 0
if (suite) writeFileSync(countFile, String(count + 1))
if (!suite && count === 1) { console.log('synthetic rerun has no result'); process.exit(1) }
const failed = suite
const marker = suite ? 'suite-attempt-' + String(count + 1) : 'rerun-passed'
console.log(marker)
if (failed) console.log(' FAIL  tests/one.test.ts > synthetic changed answer\\nAssertionError: synthetic failure ' + String(count + 1))
writeFileSync(report, JSON.stringify({ numTotalTests: 1, numPassedTests: failed ? 0 : 1, numFailedTests: failed ? 1 : 0,
  testResults: [{ name: process.cwd() + '/tests/one.test.ts', status: failed ? 'failed' : 'passed', assertionResults: [{ status: failed ? 'failed' : 'passed', fullName: 'synthetic changed answer', failureMessages: failed ? ['AssertionError: synthetic failure ' + String(count + 1)] : [] }] }] }))
process.exit(failed ? 1 : 0)
`

it('keeps the first suite report and log after the next attempt and uses the latter for changed-answer evidence', async () => {
  const pkg = JSON.stringify({ name: 'synthetic-retention', private: true, type: 'module', scripts: { build: 'node tools/build.mjs', test: 'node tools/synthetic-test.mjs' } })
  const main = mainCheckout('retention', { 'package.json': pkg, 'tools/synthetic-test.mjs': SYNTHETIC })
  const { entry } = await submitGit(main, 'retention', dir => write(dir, { 'src/a.txt': 'synthetic change\n' }))
  const pin = await runTheTool(entry)
  expect(pin.code, pin.err + pin.out).toBe(0)
  await released(entry)
  const first = await runTheTool(entry)
  expect(first.code).not.toBe(0)
  const root = workdirOf(entry)
  const firstDir = readdirSync(root).find(name => /^suite-/.test(name))!
  expect(firstDir).toBeTruthy()
  const firstLog = join(root, firstDir, 'suite.log')
  const firstReport = join(root, firstDir, 'suite.json')
  const before = [readFileSync(firstLog, 'utf8'), readFileSync(firstReport, 'utf8')]
  expect(before[0]).toContain('suite-attempt-1')
  expect(before[1]).toContain('synthetic failure 1')
  const second = await runTheTool(entry)
  expect(second.code, second.err + second.out).toBe(0)
  const dirs = readdirSync(root).filter(name => /^suite-/.test(name))
  expect(dirs).toHaveLength(2)
  const secondDir = dirs.find(name => name !== firstDir)!
  const secondLog = join(root, secondDir, 'suite.log')
  expect(readFileSync(firstLog, 'utf8')).toBe(before[0])
  expect(readFileSync(firstReport, 'utf8')).toBe(before[1])
  expect(readFileSync(secondLog, 'utf8')).toContain('suite-attempt-2')
  expect(readFileSync(join(root, secondDir, 'suite.json'), 'utf8')).toContain('synthetic failure 2')
  expect(existsSync(join(root, secondDir, 'suite.on-the-box.json'))).toBe(false)
  const tested = factsOf(second, 'tested')!
  expect(tested.log).toBe(secondLog)
  expect(tested.changedTheirAnswer).toEqual([expect.objectContaining({ file: 'tests/one.test.ts', how: 'green-alone', failureLines: expect.objectContaining({ log: secondLog, found: 'blocks' }) })])
}, 240_000)
