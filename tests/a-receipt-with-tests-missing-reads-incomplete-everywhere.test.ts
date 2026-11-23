// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A whole-suite receipt's outcome is worked out in one place, wholeSuiteReceiptOutcome, in this order: build-failed when
 * the build exit is a number other than 0; else incomplete when wholeSuiteReceiptIsComplete says the receipt is not
 * complete; else green when wholeSuiteReceiptIsGreen says so; else red when the suite exit is a number other than 0;
 * else incomplete. The guard on a repair's verification and the stable upgrade's verifier both read it. Before, each kept
 * its own order, and a receipt whose suite exited 1 with a test file never seen read red in the guard and incomplete in
 * the verifier.
 *
 * The cases are numbered as the criterion numbers them, and cases 8 and 9 are the rows the decision added after: complete,
 * not green, and no suite exit, with no failed file and with one. Cases 1 to 4, 8 and 9 are here, and case 9 is against
 * the function alone. Case 5, and the guard's half of case 7, are at the end of
 * tests/main-suite-fix-records.test.ts. Case 6, and the verifier's half of case 7, are at the end of
 * tests/the-stable-upgrade-verifies-original-evidence.test.ts. Each half holds the receipts of cases 1 to 4 and 8 that its
 * side can be given, and names the ones it cannot. Case 10, at the end of that file, pins a receipt with partial coverage
 * to the verifier's answer before this change.
 *
 * Every receipt here is made up, and nothing is filed.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mainSuiteFixSchema } from '../src/shared/main-suite-fix.ts'
import { parseWholeSuiteReceipt, wholeSuiteReceiptCrossChecks, wholeSuiteReceiptIsComplete, wholeSuiteReceiptIsGreen, type WholeSuiteReceipt } from '../src/shared/whole-suite-receipt.ts'

// The words a repair's verification may store as its outcome.
const OUTCOMES: readonly string[] = mainSuiteFixSchema.shape.verification.unwrap().shape.outcome.unwrap().options
const DIGEST = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

function complete(): WholeSuiteReceipt {
  return {
    version: 1, repository: '/srv/example/development', clone: '/srv/example/cloud-clone', commit: 'a'.repeat(40), tree: 'b'.repeat(40),
    startedAt: '2026-10-13 09:00:00', endedAt: '2026-10-13 09:20:00', where: 'cloud box',
    buildExitCode: 0, suiteExitCode: 0, failedFiles: [], failedTests: [],
    coverage: { expectedCount: 2, observedCount: 2, missing: [], unexpected: [] },
    artifacts: (['log', 'report', 'manifest', 'reads'] as const).map((name) => ({ name, path: `/srv/example/receipts/${name}.txt`, sha256Base64: DIGEST })),
  }
}
function without(data: WholeSuiteReceipt, ...keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...data }
  for (const key of keys) delete copy[key]
  return copy
}
function aloneArtifacts(n: number): { name: 'log' | 'report'; path: string; sha256Base64: string }[] {
  return [{ name: 'log', path: `/srv/example/receipts/alone/${n}/run.log`, sha256Base64: DIGEST }, { name: 'report', path: `/srv/example/receipts/alone/${n}/report.json`, sha256Base64: DIGEST }]
}
/** Version 2: the whole run was red in two files, and each was green when run alone. */
function greenAlone(): WholeSuiteReceipt {
  return {
    ...complete(), version: 2, suiteExitCode: 1, failedFiles: ['tests/one.test.ts', 'tests/two.test.ts'],
    failedTests: [{ file: 'tests/one.test.ts', name: 'fails beside others' }, { file: 'tests/two.test.ts', name: 'also fails beside others' }],
    errorsOutsideTests: 0,
    aloneRuns: [{ file: 'tests/one.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(1) }, { file: 'tests/two.test.ts', outcome: 'green', exitCode: 0, artifacts: aloneArtifacts(2) }],
  }
}

describe('a whole-suite receipt has one outcome', () => {
  // Read by name, so this criterion compiles before the export is there.
  const modulePath = '../src/shared/whole-suite-receipt.ts'
  let wholeSuiteReceiptOutcome: (data: unknown) => string
  beforeAll(async () => { ({ wholeSuiteReceiptOutcome } = await import(modulePath) as { wholeSuiteReceiptOutcome: typeof wholeSuiteReceiptOutcome }) })
  const outcomeOf = (receipt: unknown, name: string): string => {
    const outcome = wholeSuiteReceiptOutcome(receipt)
    expect(OUTCOMES, `${name}: a word a repair's verification may store`).toContain(outcome)
    return outcome
  }

  it("1. reads a receipt whose build exited 0 and whose suite exited 1, with its one test file never seen, as incomplete", () => {
    const receipt = { ...complete(), suiteExitCode: 1, coverage: { expectedCount: 1, observedCount: 0, missing: ['tests/one.test.ts'], unexpected: [] } }
    expect(() => parseWholeSuiteReceipt(receipt), 'the store takes this receipt').not.toThrow()
    expect(wholeSuiteReceiptIsComplete(receipt)).toBe(false)
    expect(outcomeOf(receipt, "the problem's case")).toBe('incomplete')
  })

  it('2. reads a build that exited other than 0 as build-failed, whether the coverage is whole or not', () => {
    const failedBuild = (coverage: WholeSuiteReceipt['coverage']) => ({ ...complete(), buildExitCode: 1, coverage })
    const receipts: [string, Record<string, unknown>][] = [
      ['coverage whole', failedBuild({ expectedCount: 2, observedCount: 2, missing: [], unexpected: [] })],
      ['coverage not whole', failedBuild({ expectedCount: 2, observedCount: 1, missing: ['tests/two.test.ts'], unexpected: [] })],
    ]
    for (const [name, receipt] of receipts) {
      // The store refuses a failed build that carries suite evidence, so neither the guard nor the verifier can be given these two.
      expect(wholeSuiteReceiptCrossChecks(receipt).length, `${name}: refused by the store`).toBeGreaterThan(0)
      expect(outcomeOf(receipt, name), name).toBe('build-failed')
    }
    // A failed build as the producer writes it: no suite evidence, and only its log.
    const asWritten = { ...without(complete(), 'suiteExitCode', 'failedFiles', 'failedTests', 'coverage'), buildExitCode: 17, artifacts: complete().artifacts.filter((artifact) => artifact.name === 'log') }
    expect(() => parseWholeSuiteReceipt(asWritten), 'the store takes a failed build as the producer writes it').not.toThrow()
    expect(outcomeOf(asWritten, 'no coverage, as the producer writes it')).toBe('build-failed')
  })

  it('3. reads a complete receipt as green or red by wholeSuiteReceiptIsGreen, in version 1 and version 2', () => {
    const receipts: [string, WholeSuiteReceipt, string][] = [
      ['version 1 with no failures', complete(), 'green'],
      ['version 2 with every run alone green', greenAlone(), 'green'],
      ['version 1 with a failed file', { ...complete(), suiteExitCode: 1, failedFiles: ['tests/one.test.ts'], failedTests: [{ file: 'tests/one.test.ts', name: 'fails' }] }, 'red'],
      ['version 2 with a run alone not green', { ...greenAlone(), aloneRuns: [greenAlone().aloneRuns![0]!, { file: 'tests/two.test.ts', outcome: 'red', exitCode: 1, artifacts: aloneArtifacts(2) }] }, 'red'],
    ]
    for (const [name, receipt, outcome] of receipts) {
      expect(wholeSuiteReceiptIsComplete(receipt), `${name} is complete`).toBe(true)
      expect(outcomeOf(receipt, name), name).toBe(outcome)
      expect(wholeSuiteReceiptIsGreen(receipt), `${name}: green is the one rule's green`).toBe(outcome === 'green')
    }
  })

  it('4. reads a suite that exited 0, with whole coverage and an artifact missing, as incomplete and never red', () => {
    for (const name of complete().artifacts.map((artifact) => artifact.name)) {
      const receipt = { ...complete(), artifacts: complete().artifacts.filter((artifact) => artifact.name !== name) }
      expect(() => parseWholeSuiteReceipt(receipt), `without its ${name}: the store takes it`).not.toThrow()
      expect(outcomeOf(receipt, `without its ${name}`)).toBe('incomplete')
    }
  })

  it('8. reads a complete receipt that is not green and has no suite exit as incomplete, never red', () => {
    const receipt = without(complete(), 'suiteExitCode')
    expect(() => parseWholeSuiteReceipt(receipt), 'the store takes this receipt').not.toThrow()
    expect(wholeSuiteReceiptIsComplete(receipt), 'complete does not ask for the suite exit').toBe(true)
    expect(wholeSuiteReceiptIsGreen(receipt)).toBe(false)
    expect(outcomeOf(receipt, 'no suite exit')).toBe('incomplete')
  })

  it('9. reads a complete receipt with a failed file listed and no suite exit as incomplete, in version 1 and version 2', () => {
    const receipts: [string, Record<string, unknown>][] = [
      ['version 1 with a failed file', without({ ...complete(), suiteExitCode: 1, failedFiles: ['tests/one.test.ts'], failedTests: [{ file: 'tests/one.test.ts', name: 'fails' }] }, 'suiteExitCode')],
      ['version 2 with every run alone green', without(greenAlone(), 'suiteExitCode')],
    ]
    for (const [name, receipt] of receipts) {
      expect(() => parseWholeSuiteReceipt(receipt), `${name}: the store takes this receipt`).not.toThrow()
      expect(wholeSuiteReceiptIsComplete(receipt), `${name} is complete`).toBe(true)
      expect(wholeSuiteReceiptIsGreen(receipt), name).toBe(false)
      expect(outcomeOf(receipt, `${name}, no suite exit`)).toBe('incomplete')
    }
  })
})
