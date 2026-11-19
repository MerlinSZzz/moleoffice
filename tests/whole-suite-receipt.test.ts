// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KIND_SPECS, SHAPE_SPECS, validateData } from '../src/shared/kinds.ts'
import { RECORD_KINDS } from '../src/shared/types.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptCrossChecks, wholeSuiteReceiptIsGreen, type WholeSuiteReceipt } from '../src/shared/whole-suite-receipt.ts'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'

// All receipts in this file are made-up test data. Nothing is filed in the real office.
function complete(): WholeSuiteReceipt {
  return {
    version: 1, repository: '/srv/example/development', clone: '/srv/example/cloud-clone', commit: 'a'.repeat(40), tree: 'b'.repeat(40),
    startedAt: '2026-10-13 09:00:00', endedAt: '2026-10-13 09:20:00', where: 'cloud box',
    buildExitCode: 0, suiteExitCode: 0, failedFiles: [], failedTests: [],
    coverage: { expectedCount: 2505, observedCount: 2505, missing: [], unexpected: [] },
    artifacts: (['log', 'report', 'manifest', 'reads'] as const).map((name) => ({ name, path: `/srv/example/receipts/${name}.txt`, sha256Base64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' })),
  }
}

function refused(data: unknown): void {
  expect(wholeSuiteReceiptCrossChecks(data).length).toBeGreaterThan(0)
  expect(() => parseWholeSuiteReceipt(data)).toThrow()
  expect(wholeSuiteReceiptIsGreen(data)).toBe(false)
  expect(validateData('whole_suite_receipt', data).ok).toBe(false)
}

describe('whole-suite receipt evidence', () => {
  it('stores worker crashes separately from failed assertions and refuses unusable or contradictory crash facts', () => {
    const data = { ...complete(), suiteExitCode: 1, failedFiles: ['tests/forest-map.test.ts'], workerCrashes: [{ file: 'tests/forest-map.test.ts', unfinishedTests: 22 }] }
    expect(parseWholeSuiteReceipt(data)).toEqual(data)
    expect(validateData('whole_suite_receipt', data).ok).toBe(true)
    expect(SHAPE_SPECS.WholeSuiteWorkerCrash).toBeDefined()
    expect(wholeSuiteReceiptIsGreen(data)).toBe(false)
    for (const crash of [
      { file: '../escape.test.ts', unfinishedTests: 22 },
      { file: 'tests/forest-map.test.ts', unfinishedTests: 0 },
      { file: 'tests/forest-map.test.ts', unfinishedTests: 1.5 },
      { file: 'tests/forest-map.test.ts' },
      { file: 'tests/forest-map.test.ts', unfinishedTests: 22, madeUp: true },
    ]) refused({ ...data, workerCrashes: [crash] })
    refused({ ...data, workerCrashes: [...data.workerCrashes, ...data.workerCrashes] })
    refused({ ...data, failedFiles: [] })
    refused({ ...data, suiteExitCode: 0 })
    refused({ ...data, buildExitCode: 1 })
    refused({ ...data, workerCrashes: 'unknown' })
  })

  it('derives green from a complete receipt and publishes the same nested shapes', () => {
    const data = complete()
    expect(parseWholeSuiteReceipt(data)).toEqual(data)
    expect(wholeSuiteReceiptCrossChecks(data)).toEqual([])
    expect(wholeSuiteReceiptIsGreen(data)).toBe(true)
    expect(validateData('whole_suite_receipt', data)).toMatchObject({ ok: true, incomplete: [] })
    expect(RECORD_KINDS).toContain('whole_suite_receipt')
    const spec = KIND_SPECS.whole_suite_receipt
    expect(spec.whenToRecord).toContain('made up')
    expect(validateData('whole_suite_receipt', spec.example).ok).toBe(true)
    for (const type of ['WholeSuiteFailedTest', 'WholeSuiteCoverage', 'WholeSuiteArtifact']) expect(SHAPE_SPECS[type]).toBeDefined()
  })

  it('accepts office short forms as metadata without changing the evidence or green', () => {
    const data = complete()
    const labelled = { ...data, shortForms: { label: { text: 'Cloud suite evidence', madeFrom: { seq: 1, contentHash: 'made-up-revision' }, writtenBy: 'agent' } } }
    expect(validateData('whole_suite_receipt', labelled).ok).toBe(true)
    expect(parseWholeSuiteReceipt(labelled)).toEqual(data)
    expect(wholeSuiteReceiptIsGreen(labelled)).toBe(true)
    expect(wholeSuiteReceiptCrossChecks({ shortForms: {} })).toEqual([])
    expect(validateData('whole_suite_receipt', { shortForms: {} }).ok).toBe(true)
    refused({ ...data, shortForms: false })
  })

  it('keeps missing mandatory facts incomplete and never fabricates them', () => {
    expect(wholeSuiteReceiptCrossChecks({})).toEqual([])
    expect(validateData('whole_suite_receipt', {})).toMatchObject({ ok: true })
    for (const key of ['version', 'repository', 'clone', 'commit', 'tree', 'startedAt', 'endedAt', 'where', 'buildExitCode', 'artifacts']) {
      const data: Record<string, unknown> = { ...complete() }
      delete data[key]
      if (key === 'buildExitCode') for (const suite of ['suiteExitCode', 'failedFiles', 'failedTests', 'coverage']) delete data[suite]
      expect(() => parseWholeSuiteReceipt(data), key).toThrow(/Incomplete/)
      expect(wholeSuiteReceiptIsGreen(data), key).toBe(false)
      const result = validateData('whole_suite_receipt', data)
      expect(result.ok, key).toBe(true)
      if (result.ok) {
        expect(result.incomplete.map((item) => item.path), key).toContain(`data.${key}`)
        expect(result.data, key).not.toHaveProperty(key)
      }
    }
  })

  it('keeps absent suite evidence and absent artifact kinds non-green', () => {
    for (const key of ['suiteExitCode', 'failedFiles', 'failedTests', 'coverage']) {
      const data: Record<string, unknown> = { ...complete() }
      delete data[key]
      expect(parseWholeSuiteReceipt(data)).not.toHaveProperty(key)
      expect(validateData('whole_suite_receipt', data).ok).toBe(true)
      expect(wholeSuiteReceiptIsGreen(data), key).toBe(false)
    }
    for (const name of ['log', 'report', 'manifest', 'reads']) {
      const data = complete()
      data.artifacts = data.artifacts.filter((artifact) => artifact.name !== name)
      expect(validateData('whole_suite_receipt', data).ok).toBe(true)
      expect(wholeSuiteReceiptIsGreen(data), name).toBe(false)
    }
  })

  it('rejects exit-zero failure claims and invalid exit codes while keeping valid red facts', () => {
    for (const key of ['buildExitCode', 'suiteExitCode']) for (const code of [-1, 256, 1.5, '0', null, NaN, Infinity]) refused({ ...complete(), [key]: code })
    refused({ ...complete(), failedFiles: ['tests/a.test.ts'] })
    refused({ ...complete(), failedFiles: ['tests/a.test.ts'], failedTests: [{ file: 'tests/a.test.ts', name: 'fails' }] })
    const red = { ...complete(), suiteExitCode: 1, failedFiles: ['tests/a.test.ts'], failedTests: [{ file: 'tests/a.test.ts', name: 'fails' }] }
    expect(parseWholeSuiteReceipt(red)).toEqual(red)
    expect(validateData('whole_suite_receipt', red).ok).toBe(true)
    expect(wholeSuiteReceiptIsGreen(red)).toBe(false)
  })

  it('keeps failed builds with log evidence and refuses suite evidence before build success', () => {
    const { suiteExitCode, failedFiles, failedTests, coverage, ...build } = complete()
    void suiteExitCode; void failedFiles; void failedTests; void coverage
    build.buildExitCode = 1
    build.artifacts = build.artifacts.filter((artifact) => artifact.name === 'log')
    expect(parseWholeSuiteReceipt(build)).toEqual(build)
    expect(validateData('whole_suite_receipt', build).ok).toBe(true)
    expect(wholeSuiteReceiptIsGreen(build)).toBe(false)
    for (const [key, evidence] of Object.entries({ suiteExitCode: 0, failedFiles: [], failedTests: [], coverage: { expectedCount: 0, observedCount: 0, missing: [], unexpected: [] } })) refused({ ...build, [key]: evidence })
    refused({ ...build, artifacts: complete().artifacts })
    const { buildExitCode, ...stub } = build
    void buildExitCode
    refused({ ...stub, suiteExitCode: 0 })
  })

  it('accepts full lowercase Git hashes and rejects abbreviations, masks and invalid values', () => {
    for (const width of [40, 64]) {
      const data = { ...complete(), commit: 'c'.repeat(width), tree: 'd'.repeat(width) }
      expect(parseWholeSuiteReceipt(data)).toEqual(data)
      expect(wholeSuiteReceiptIsGreen(data)).toBe(true)
    }
    for (const key of ['commit', 'tree']) for (const hash of ['a'.repeat(39), 'b'.repeat(41), 'c'.repeat(63), 'd'.repeat(65), 'A'.repeat(40), 'g'.repeat(40), '[key masked]', '', null]) refused({ ...complete(), [key]: hash })
    refused({ ...complete(), version: 2 })
    refused({ ...complete(), where: 'local box' })
  })

  it('rejects unsafe paths, malformed digests and impossible wall-clock evidence', () => {
    for (const path of ['', '../outside.test.ts', '/tests/a.test.ts', './tests/a.test.ts', 'tests//a.test.ts', 'tests/../a.test.ts', 'tests\\a.test.ts', 'C:/a.test.ts', 'tests/a\u0000.test.ts']) {
      refused({ ...complete(), failedFiles: [path], suiteExitCode: 1 })
      refused({ ...complete(), coverage: { expectedCount: 1, observedCount: 0, missing: [path], unexpected: [] } })
      refused({ ...complete(), coverage: { expectedCount: 0, observedCount: 1, missing: [], unexpected: [path] } })
    }
    for (const key of ['repository', 'clone']) for (const path of ['relative/checkout', '/srv/../checkout', '/srv//checkout', '/srv/checkout\n']) refused({ ...complete(), [key]: path })
    for (const path of ['relative/log', '/srv/../log', '/srv//log', '/srv\\log']) {
      const data = complete(); data.artifacts[0]!.path = path; refused(data)
    }
    for (const digest of ['', 'a'.repeat(64), 'A'.repeat(43), 'A'.repeat(42) + 'B=', 'A'.repeat(42) + '_=', 'A'.repeat(44) + '=']) {
      const data = complete(); data.artifacts[0]!.sha256Base64 = digest; refused(data)
    }
    for (const stamp of ['2026-02-30 09:00:00', '2026-13-01 09:00:00', '2026-10-13 24:00:00', '2026-10-13 09:60:00', '2026-10-13 09:00:60', '2026-10-13', '2026-10-13T09:00:00Z']) refused({ ...complete(), startedAt: stamp })
    // A local clock can repeat an hour. These fields cannot establish elapsed-time order.
    const rollback = { ...complete(), startedAt: '2026-10-25 01:50:00', endedAt: '2026-10-25 01:10:00' }
    expect(parseWholeSuiteReceipt(rollback)).toEqual(rollback)
    expect(validateData('whole_suite_receipt', rollback).ok).toBe(true)
    expect(wholeSuiteReceiptIsGreen(rollback)).toBe(true)
  })

  it('preserves mismatched or empty coverage as valid incomplete success evidence', () => {
    for (const coverage of [
      { expectedCount: 2, observedCount: 2, missing: ['tests/b.test.ts'], unexpected: ['tests/c.test.ts'] },
      { expectedCount: 2, observedCount: 1, missing: ['tests/b.test.ts'], unexpected: [] },
      { expectedCount: 1, observedCount: 2, missing: [], unexpected: ['tests/b.test.ts'] },
      { expectedCount: 0, observedCount: 0, missing: [], unexpected: [] },
    ]) {
      const data = { ...complete(), coverage }
      expect(parseWholeSuiteReceipt(data)).toEqual(data)
      expect(validateData('whole_suite_receipt', data).ok).toBe(true)
      expect(wholeSuiteReceiptIsGreen(data)).toBe(false)
    }
    for (const key of ['expectedCount', 'observedCount']) for (const count of [-1, 1.5, '2', null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      refused({ ...complete(), coverage: { ...complete().coverage, [key]: count } })
    }
    for (const coverage of [
      { expectedCount: 2, observedCount: 1, missing: [], unexpected: [] },
      { expectedCount: 0, observedCount: 0, missing: ['tests/a.test.ts'], unexpected: ['tests/b.test.ts'] },
      { expectedCount: 1, observedCount: 1, missing: ['tests/a.test.ts'], unexpected: ['tests/a.test.ts'] },
    ]) refused({ ...complete(), coverage })
  })

  it('rejects inconsistent failing-test files and duplicate evidence without inventing missing lists', () => {
    const data = { ...complete(), suiteExitCode: 1, failedFiles: ['tests/a.test.ts'], failedTests: [{ file: 'tests/a.test.ts', name: 'fails' }] }
    refused({ ...data, failedFiles: [] })
    refused({ ...data, coverage: { expectedCount: 1, observedCount: 1, missing: ['tests/a.test.ts'], unexpected: ['tests/b.test.ts'] } })
    refused({ ...data, coverage: { expectedCount: 0, observedCount: 0, missing: [], unexpected: [] } })
    refused({ ...data, failedFiles: ['tests/a.test.ts', 'tests/a.test.ts'] })
    refused({ ...data, failedTests: [...data.failedTests, ...data.failedTests] })
    refused({ ...data, failedTests: [{ file: 'tests/a.test.ts', name: ' ' }] })
    refused({ ...data, coverage: { expectedCount: 2, observedCount: 0, missing: ['tests/a.test.ts', 'tests/a.test.ts'], unexpected: [] } })
    refused({ ...data, coverage: { expectedCount: 0, observedCount: 2, missing: [], unexpected: ['tests/a.test.ts', 'tests/a.test.ts'] } })
    refused({ ...data, artifacts: [...data.artifacts, data.artifacts[0]] })
    const { failedFiles, coverage, ...partial } = data
    void failedFiles; void coverage
    expect(parseWholeSuiteReceipt(partial)).toEqual(partial)
    expect(validateData('whole_suite_receipt', partial).ok).toBe(true)
    expect(wholeSuiteReceiptIsGreen(partial)).toBe(false)
  })

  it('rejects stored green, extra bags and unknown or half-written nested evidence', () => {
    refused({ ...complete(), green: true })
    refused({ ...complete(), green: false })
    refused({ ...complete(), extra: { green: true } })
    refused({ ...complete(), coverage: { expectedCount: 1 } })
    refused({ ...complete(), coverage: { expectedCount: 0, observedCount: 0, missing: [], unexpected: [], green: true } })
    refused({ ...complete(), suiteExitCode: 1, failedTests: [{ file: 'tests/a.test.ts' }] })
    refused({ ...complete(), artifacts: [{ name: 'log', path: '/srv/example/log.txt' }] })
    refused({ ...complete(), artifacts: [{ ...complete().artifacts[0], green: true }] })
    for (const data of [null, [], 'receipt', 0]) {
      expect(() => parseWholeSuiteReceipt(data)).toThrow()
      expect(wholeSuiteReceiptIsGreen(data)).toBe(false)
    }
  })
})

// Version 2: the whole run was red, and each red file was then run alone on the same box, commit and build.
function aloneArtifacts(n: number): { name: 'log' | 'report'; path: string; sha256Base64: string }[] {
  return [{ name: 'log', path: `/srv/example/receipts/alone/${n}/run.log`, sha256Base64: complete().artifacts[0]!.sha256Base64 }, { name: 'report', path: `/srv/example/receipts/alone/${n}/report.json`, sha256Base64: complete().artifacts[0]!.sha256Base64 }]
}
function redBesideOthers(): WholeSuiteReceipt {
  return {
    ...complete(), version: 2, suiteExitCode: 1, failedFiles: ['tests/a.test.ts', 'tests/b.test.ts'],
    failedTests: [{ file: 'tests/a.test.ts', name: 'fails beside others' }, { file: 'tests/b.test.ts', name: 'also fails beside others' }],
    errorsOutsideTests: 0,
    aloneRuns: [{ file: 'tests/a.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(1) }, { file: 'tests/b.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2) }],
  }
}
function withSecondAloneRun(run: Record<string, unknown>): Record<string, unknown> {
  const data = redBesideOthers()
  return { ...data, aloneRuns: [data.aloneRuns![0], { file: 'tests/b.test.ts', ...run }] }
}

describe('whole-suite receipt version 2: red files run alone', () => {
  it('is green when every file red beside others is named and was green alone, and keeps the whole run as it was', () => {
    const data = redBesideOthers()
    expect(parseWholeSuiteReceipt(data)).toEqual(data)
    expect(parseWholeSuiteReceipt(data).failedFiles).toEqual(['tests/a.test.ts', 'tests/b.test.ts'])
    expect(parseWholeSuiteReceipt(data).suiteExitCode).toBe(1)
    expect(wholeSuiteReceiptCrossChecks(data)).toEqual([])
    expect(wholeSuiteReceiptIsGreen(data)).toBe(true)
    expect(validateData('whole_suite_receipt', data)).toMatchObject({ ok: true, incomplete: [] })
    for (const type of ['WholeSuiteAloneRun', 'WholeSuiteAloneArtifact']) expect(SHAPE_SPECS[type]).toBeDefined()
    expect(KIND_SPECS.whole_suite_receipt.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['aloneRuns', 'errorsOutsideTests']))
  })

  it('keeps the receipt not green when a red file was red alone, gave no result alone or was not run alone', () => {
    const red = withSecondAloneRun({ outcome: 'red', exitCode: 1, artifacts: aloneArtifacts(2) })
    const noResult = withSecondAloneRun({ outcome: 'no result', exitCode: 124, because: 'the command was stopped before its end', artifacts: aloneArtifacts(2).slice(0, 1) })
    const notRun = withSecondAloneRun({ outcome: 'not run', because: 'the limit of 20 files run alone was reached', artifacts: [] })
    for (const [name, data] of Object.entries({ red, noResult, notRun })) {
      expect(parseWholeSuiteReceipt(data), name).toEqual(data)
      expect(validateData('whole_suite_receipt', data).ok, name).toBe(true)
      expect(wholeSuiteReceiptIsGreen(data), name).toBe(false)
    }
  })

  it('keeps the receipt not green when the whole run shows more than red files', () => {
    const { errorsOutsideTests, ...unread } = redBesideOthers()
    void errorsOutsideTests
    const { failedTests, ...noTests } = redBesideOthers()
    void failedTests
    for (const [name, data] of Object.entries({
      errorsOutsideTests: { ...redBesideOthers(), errorsOutsideTests: 1 },
      unread,
      noTests,
      exit: { ...redBesideOthers(), suiteExitCode: 137 },
      coverage: { ...redBesideOthers(), coverage: { expectedCount: 3, observedCount: 2, missing: ['tests/c.test.ts'], unexpected: [] } },
      manifest: { ...redBesideOthers(), artifacts: complete().artifacts.filter((artifact) => artifact.name !== 'manifest') },
    })) {
      expect(parseWholeSuiteReceipt(data), name).toEqual(data)
      expect(validateData('whole_suite_receipt', data).ok, name).toBe(true)
      expect(wholeSuiteReceiptIsGreen(data), name).toBe(false)
    }
  })

  it('refuses runs alone that do not match the red files one for one', () => {
    const data = redBesideOthers()
    refused({ ...data, aloneRuns: data.aloneRuns!.slice(0, 1) })
    refused({ ...data, aloneRuns: [...data.aloneRuns!, { file: 'tests/c.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(3) }] })
    refused({ ...data, aloneRuns: [data.aloneRuns![0], data.aloneRuns![0]] })
    const { aloneRuns, ...without } = data
    void aloneRuns
    refused(without)
    refused({ ...data, failedFiles: [], failedTests: [], aloneRuns: [] })
    const { failedFiles, ...unobserved } = data
    void failedFiles
    refused(unobserved)
    refused(withSecondAloneRun({ file: '../b.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2) }))
  })

  it('refuses a run alone that claims more than it shows', () => {
    for (const run of [
      { outcome: 'green', exitCode: 1, artifacts: aloneArtifacts(2) },
      { outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2).slice(0, 1) },
      { outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2).slice(1) },
      { outcome: 'green', artifacts: aloneArtifacts(2) },
      { outcome: 'green', exitCode: 0, because: 'it passed', artifacts: aloneArtifacts(2) },
      { outcome: 'red', exitCode: 1, artifacts: aloneArtifacts(2).slice(0, 1) },
      { outcome: 'not run', exitCode: 0, because: 'the time limit for runs alone was reached', artifacts: [] },
      { outcome: 'not run', because: 'the time limit for runs alone was reached', artifacts: aloneArtifacts(2) },
      { outcome: 'not run', artifacts: [] },
      { outcome: 'not run', because: ' ', artifacts: [] },
      { outcome: 'no result', exitCode: 124, artifacts: [] },
      { outcome: 'flaky', exitCode: 0, artifacts: aloneArtifacts(2) },
      { outcome: 'green', exitCode: 256, artifacts: aloneArtifacts(2) },
      { outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2), green: true },
      { outcome: 'green', exitCode: 0, artifacts: [...aloneArtifacts(2), aloneArtifacts(2)[0]] },
      { outcome: 'green', exitCode: 0, artifacts: [{ ...aloneArtifacts(2)[0], name: 'manifest' }, aloneArtifacts(2)[1]] },
      { outcome: 'green', exitCode: 0, artifacts: [{ ...aloneArtifacts(2)[0], path: 'alone/2/run.log' }, aloneArtifacts(2)[1]] },
      { outcome: 'green', exitCode: 0, artifacts: [{ ...aloneArtifacts(2)[0], sha256Base64: 'a'.repeat(64) }, aloneArtifacts(2)[1]] },
    ]) refused(withSecondAloneRun(run))
    for (const count of [-1, 1.5, '0', null, NaN, Number.MAX_SAFE_INTEGER + 1]) refused({ ...redBesideOthers(), errorsOutsideTests: count })
  })

  it('refuses the version 2 fields in a version 1 receipt, and any other version', () => {
    refused({ ...complete(), aloneRuns: [] })
    refused({ ...complete(), errorsOutsideTests: 0 })
    refused({ ...redBesideOthers(), version: 1 })
    refused({ ...redBesideOthers(), version: 3 })
    expect(wholeSuiteReceiptIsGreen(complete())).toBe(true)
  })
})

/**
 * THE COMPLETE HALF, SHARED WITH A JUDGED RECEIPT (wave 13q item 6). The six conditions of a complete receipt were moved
 * out of wholeSuiteReceiptIsGreen into wholeSuiteReceiptIsComplete, unchanged, so the judged-receipt rule reads the same
 * ones. Every receipt this file already uses is listed with the answer green gave before the move, and with the answer
 * the moved half gives.
 */
describe('a complete receipt, the half of green a judged receipt shares', () => {
  // Read by name, so this criterion compiles before the export is there.
  const modulePath = '../src/shared/whole-suite-receipt.ts'
  let wholeSuiteReceiptIsComplete: (data: unknown) => boolean
  beforeAll(async () => { ({ wholeSuiteReceiptIsComplete } = await import(modulePath) as { wholeSuiteReceiptIsComplete: typeof wholeSuiteReceiptIsComplete }) })
  function without(data: WholeSuiteReceipt, ...keys: string[]): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...data }
    for (const key of keys) delete copy[key]
    return copy
  }
  const lostArtifact = (name: string, data = complete()) => ({ ...data, artifacts: data.artifacts.filter((artifact) => artifact.name !== name) })
  const coverage = (value: WholeSuiteReceipt['coverage']) => ({ ...complete(), coverage: value })
  const build = { ...without(complete(), 'suiteExitCode', 'failedFiles', 'failedTests', 'coverage'), buildExitCode: 1, artifacts: complete().artifacts.filter((artifact) => artifact.name === 'log') }
  // [name, receipt, green as before the move, complete]
  const receipts: [string, unknown, boolean, boolean][] = [
    ['version 1 green', complete(), true, true],
    ['version 1 green with short forms', { ...complete(), shortForms: { label: { text: 'Cloud suite evidence', madeFrom: { seq: 1, contentHash: 'made-up-revision' }, writtenBy: 'agent' } } }, true, true],
    ['version 1 green, 64-character hashes', { ...complete(), commit: 'c'.repeat(64), tree: 'd'.repeat(64) }, true, true],
    ['version 1 green, a clock that went back', { ...complete(), startedAt: '2026-10-25 01:50:00', endedAt: '2026-10-25 01:10:00' }, true, true],
    ['version 1 red', { ...complete(), suiteExitCode: 1, failedFiles: ['tests/a.test.ts'], failedTests: [{ file: 'tests/a.test.ts', name: 'fails' }] }, false, true],
    ['version 1 without a suite exit code', without(complete(), 'suiteExitCode'), false, true],
    ['version 1 without failed files', without(complete(), 'failedFiles'), false, false],
    ['version 1 without failed tests', without(complete(), 'failedTests'), false, false],
    ['version 1 without coverage', without(complete(), 'coverage'), false, false],
    ['version 1 red without failed files or coverage', without({ ...complete(), suiteExitCode: 1, failedFiles: ['tests/a.test.ts'], failedTests: [{ file: 'tests/a.test.ts', name: 'fails' }] }, 'failedFiles', 'coverage'), false, false],
    ...(['log', 'report', 'manifest', 'reads'] as const).map((name): [string, unknown, boolean, boolean] => [`version 1 without its ${name}`, lostArtifact(name), false, false]),
    ['version 1, a build that failed', build, false, false],
    ['version 1, coverage that names a missing and an unexpected file', coverage({ expectedCount: 2, observedCount: 2, missing: ['tests/b.test.ts'], unexpected: ['tests/c.test.ts'] }), false, false],
    ['version 1, fewer files seen than expected', coverage({ expectedCount: 2, observedCount: 1, missing: ['tests/b.test.ts'], unexpected: [] }), false, false],
    ['version 1, more files seen than expected', coverage({ expectedCount: 1, observedCount: 2, missing: [], unexpected: ['tests/b.test.ts'] }), false, false],
    ['version 1, no files expected', coverage({ expectedCount: 0, observedCount: 0, missing: [], unexpected: [] }), false, false],
    ...['version', 'repository', 'clone', 'commit', 'tree', 'startedAt', 'endedAt', 'where', 'buildExitCode', 'artifacts'].map((key): [string, unknown, boolean, boolean] =>
      [`version 1 without ${key}`, key === 'buildExitCode' ? without(complete(), key, 'suiteExitCode', 'failedFiles', 'failedTests', 'coverage') : without(complete(), key), false, false]),
    ['a receipt that is refused, with a stored green', { ...complete(), green: true }, false, false],
    ['a receipt that is refused, version 2 in a version 1 receipt', { ...complete(), version: 2 }, false, false],
    ...([null, [], 'receipt', 0] as unknown[]).map((data): [string, unknown, boolean, boolean] => [`not a receipt: ${JSON.stringify(data)}`, data, false, false]),
    ['version 2, green alone', redBesideOthers(), true, true],
    ['version 2, red alone', withSecondAloneRun({ outcome: 'red', exitCode: 1, artifacts: aloneArtifacts(2) }), false, true],
    ['version 2, no result alone', withSecondAloneRun({ outcome: 'no result', exitCode: 124, because: 'the command was stopped before its end', artifacts: aloneArtifacts(2).slice(0, 1) }), false, true],
    ['version 2, not run alone', withSecondAloneRun({ outcome: 'not run', because: 'the limit of 20 files run alone was reached', artifacts: [] }), false, true],
    ['version 2, an error outside the tests', { ...redBesideOthers(), errorsOutsideTests: 1 }, false, true],
    ['version 2, errors outside the tests not read', without(redBesideOthers(), 'errorsOutsideTests'), false, true],
    ['version 2 without failed tests', without(redBesideOthers(), 'failedTests'), false, false],
    ['version 2, a suite that was killed', { ...redBesideOthers(), suiteExitCode: 137 }, false, true],
    ['version 2, coverage short of a file', { ...redBesideOthers(), coverage: { expectedCount: 3, observedCount: 2, missing: ['tests/c.test.ts'], unexpected: [] } }, false, false],
    ['version 2 without its manifest', lostArtifact('manifest', redBesideOthers()), false, false],
    ['a receipt that is refused, runs alone that miss a red file', { ...redBesideOthers(), aloneRuns: redBesideOthers().aloneRuns!.slice(0, 1) }, false, false],
  ]

  it('answers green exactly as before the move over every receipt this file uses, and complete as the six conditions say', () => {
    expect(receipts.length).toBeGreaterThan(40)
    for (const [name, data, green, whole] of receipts) {
      expect(wholeSuiteReceiptIsGreen(data), `green: ${name}`).toBe(green)
      expect(wholeSuiteReceiptIsComplete(data), `complete: ${name}`).toBe(whole)
      // Green is never more than complete.
      if (green) expect(wholeSuiteReceiptIsComplete(data), `green but not complete: ${name}`).toBe(true)
    }
  })

  it('takes one thing away from a complete receipt, and both answers go false together', () => {
    // A failed build cannot carry suite evidence, and coverage whose counts differ must name the files, so those two
    // conditions are also met by others here. Of the six, no files expected and a missing artifact stand alone.
    for (const [name, data] of Object.entries({
      'a build that failed': build,
      'no failed files read': without(complete(), 'failedFiles'),
      'no failed tests read': without(complete(), 'failedTests'),
      'no coverage read': without(complete(), 'coverage'),
      'no files expected': coverage({ expectedCount: 0, observedCount: 0, missing: [], unexpected: [] }),
      'fewer files seen than expected': coverage({ expectedCount: 2, observedCount: 1, missing: ['tests/b.test.ts'], unexpected: [] }),
      'a missing and an unexpected file': coverage({ expectedCount: 2, observedCount: 2, missing: ['tests/b.test.ts'], unexpected: ['tests/c.test.ts'] }),
      ...Object.fromEntries((['log', 'report', 'manifest', 'reads'] as const).map((artifact) => [`no ${artifact}`, lostArtifact(artifact)])),
    })) {
      expect(() => parseWholeSuiteReceipt(data), name).not.toThrow()
      expect(wholeSuiteReceiptIsComplete(data), name).toBe(false)
      expect(wholeSuiteReceiptIsGreen(data), name).toBe(false)
    }
  })
})

describe('the generic record write gate', () => {
  let db: TestDb
  let gate: typeof import('../src/server/lib/validate.ts')
  beforeAll(async () => { db = await freshDb(); gate = await import('../src/server/lib/validate.ts') })
  afterAll(() => db?.close())

  it('runs the shared cross-check on writes and keeps honest stubs and failed builds', () => {
    expect(gate.validateRecordData('whole_suite_receipt', complete())).toEqual([])
    expect(gate.validateRecordData('whole_suite_receipt', redBesideOthers())).toEqual([])
    const { clone, ...withoutClone } = complete()
    void clone
    expect(gate.validateRecordData('whole_suite_receipt', withoutClone).map((item) => item.path)).toContain('data.clone')
    expectPanelError(db, () => gate.validateRecordData('whole_suite_receipt', { ...complete(), clone: 'relative/checkout' }), 400)
    expect(gate.validateRecordData('whole_suite_receipt', {}).map((item) => item.path)).toContain('data.commit')
    const { suiteExitCode, failedFiles, failedTests, coverage, ...build } = complete()
    void suiteExitCode; void failedFiles; void failedTests; void coverage
    expect(gate.validateRecordData('whole_suite_receipt', { ...build, buildExitCode: 1, artifacts: [build.artifacts[0]] })).toEqual([])
    const contradictory = { ...complete(), failedFiles: ['tests/a.test.ts'] }
    expect(wholeSuiteReceiptCrossChecks(contradictory).length).toBeGreaterThan(0)
    expect(expectPanelError(db, () => gate.validateRecordData('whole_suite_receipt', contradictory), 400).message).toContain('exit-zero suite')
    expectPanelError(db, () => gate.validateRecordData('whole_suite_receipt', { ...complete(), green: true }), 400)
    expectPanelError(db, () => gate.validateRecordData('whole_suite_receipt', { ...complete(), commit: 'a'.repeat(39) }), 400)
  })
})
