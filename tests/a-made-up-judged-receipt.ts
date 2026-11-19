// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MADE-UP VERSION 2 RECEIPTS FOR A JUDGEMENT (wave 13q item 6). A whole run red in some files, each of them then run alone
 * with the outcome a case asks for. Nothing here is an observed suite: every path is under /srv/example and every hash is
 * a run of the letter A.
 */
import type { WholeSuiteReceipt } from '../src/shared/whole-suite-receipt.ts'

const HASH = 'A'.repeat(43) + '='
export type AloneOutcome = 'red' | 'green' | 'no result' | 'not run'

function aloneRun(file: string, outcome: AloneOutcome, n: number) {
  const artifacts = (['log', 'report'] as const).map(name => ({ name, path: `/srv/example/receipts/alone/${n}/${name === 'log' ? 'run.log' : 'report.json'}`, sha256Base64: HASH }))
  if (outcome === 'red') return { file, outcome, exitCode: 1, artifacts }
  if (outcome === 'green') return { file, outcome, exitCode: 0, artifacts }
  if (outcome === 'no result') return { file, outcome, exitCode: 124, because: 'the made-up command was stopped before its end', artifacts: artifacts.slice(0, 1) }
  return { file, outcome, because: 'the made-up limit of files run alone was reached', artifacts: [] }
}

/** A complete version 2 receipt of `commit` and `tree` whose whole run was red in each file named, with that file's run alone. */
export function aReceiptRedIn(commit: string, tree: string, alone: Record<string, AloneOutcome>): WholeSuiteReceipt {
  const files = Object.keys(alone)
  return {
    version: 2, repository: '/srv/example/development', clone: '/srv/example/cloud-clone', commit, tree,
    startedAt: '2026-10-26 09:00:00', endedAt: '2026-10-26 09:20:00', where: 'cloud box',
    buildExitCode: 0, suiteExitCode: 1, failedFiles: files,
    failedTests: files.map(file => ({ file, name: `Made-up assertion in ${file}` })),
    coverage: { expectedCount: 40, observedCount: 40, missing: [], unexpected: [] },
    artifacts: (['log', 'report', 'manifest', 'reads'] as const).map(name => ({ name, path: `/srv/example/receipts/${name}.txt`, sha256Base64: HASH })),
    errorsOutsideTests: 0,
    aloneRuns: files.map((file, i) => aloneRun(file, alone[file]!, i + 1)),
  } as WholeSuiteReceipt
}

/** The same receipt green: every file red beside others was green alone. */
export function aReceiptGreenAlone(commit: string, tree: string, files: string[]): WholeSuiteReceipt {
  return aReceiptRedIn(commit, tree, Object.fromEntries(files.map(file => [file, 'green' as const])))
}
