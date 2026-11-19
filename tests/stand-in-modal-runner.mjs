#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR tools/modal-tests.mjs, FOR TESTS ONLY. It takes the runner's words, calls no Modal and sends nothing
 * anywhere. What it answers is set by the test, in the environment:
 *
 *   STAND_IN_MODAL_SAYS   JSON {exit?, results}: `exit` 75 or 2 makes every call give no result or be refused;
 *                         otherwise `results[commit][file]`, then `results['*'][file]`, then `results['*']['*']` is
 *                         'passed' or 'failed' for each file, and the exit is 0 or 1 as the real runner's is.
 *   STAND_IN_MODAL_CALLS  a file each call appends one line to: the commit, the checkout and the files.
 *   STAND_IN_MODAL_USD    when set, each call appends a receipt of this many dollars where the real runner would.
 *
 * The report it writes has the real runner's shape: vitest's JSON report, each file named as the VM names it.
 */
import { appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { VM_CHECKOUT, appendReceipt, receiptsFile } from '../tools/modal-tests.mjs'
import { localStamp } from '../src/shared/time.ts'

const argv = process.argv.slice(2)
const options = {}
let files = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--') {
    files = argv.slice(i + 1)
    break
  }
  options[argv[i].slice(2)] = argv[i + 1]
  i += 1
}
if (!options.repo || !/^[a-f0-9]{40}$/u.test(options.commit ?? '') || !options.out || files.length === 0) {
  process.stderr.write('Modal tests refused: Name a checkout, commit, report path and test files, or --all.\n')
  process.exit(2)
}
const says = JSON.parse(process.env.STAND_IN_MODAL_SAYS ?? '{"results":{"*":{"*":"passed"}}}')
if (process.env.STAND_IN_MODAL_CALLS) appendFileSync(process.env.STAND_IN_MODAL_CALLS, `${JSON.stringify({ commit: options.commit, repo: resolve(options.repo), files })}\n`)
if (process.env.STAND_IN_MODAL_USD) {
  appendReceipt(receiptsFile(), { at: localStamp(new Date()), commit: options.commit, files: files.length, runtime: 'stand-in', cpu: 10, memoryMiB: 32768, sandboxSeconds: 1, estimatedUSD: Number(process.env.STAND_IN_MODAL_USD), outcome: 'stand-in', sandboxId: null })
}
if (says.exit === 2) {
  process.stderr.write('Modal tests refused: The Modal token file is missing.\n')
  process.exit(2)
}
if (says.exit === 75) {
  writeFileSync(resolve(options.out), 'null\n')
  process.stdout.write('Modal tests: no result.\n')
  process.exit(75)
}
const statusOf = (file) => says.results?.[options.commit]?.[file] ?? says.results?.['*']?.[file] ?? says.results?.['*']?.['*'] ?? 'passed'
const testResults = files.map((file) => ({ name: `${VM_CHECKOUT}/${file}`, status: statusOf(file), assertionResults: [{ status: statusOf(file) }] }))
const red = testResults.some((one) => one.status === 'failed')
writeFileSync(resolve(options.out), `${JSON.stringify({ success: !red, testResults })}\n`)
process.stdout.write(`Modal tests: ${red ? 'red' : 'passed'}.\n`)
process.exit(red ? 1 : 0)
