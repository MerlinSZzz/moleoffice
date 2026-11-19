#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHY A CHECK CRASHED, for a program that ends a check and is not the message worker: the same answer the worker writes
 * on the check's session as `whyTheCheckCrashed`, from `whyTheCheckCrashed` in src/config/inspection-ending.mjs.
 *
 *   node tools/inspector-why-it-crashed.mjs --record <file> --exit <text> --error-stream <file>
 *
 * - `--record` names a file holding the reply of GET /api/records/<the check's session>.
 * - `--exit` is the text of the exit file the check's process left: `N`, or `signal:SIGNAME`.
 * - `--error-stream` names a file holding what the check's process wrote on its error stream.
 *
 * Each flag may be left out, and a flag left out is read as nothing recorded. A file that is named and cannot be read is
 * refused, with exit 2 and a sentence on the error stream, because reading it as nothing recorded would be a guess.
 *
 * It prints the answer as JSON and talks to no office. The program that runs it writes the answer to the session, as
 * `dataPatch: { whyTheCheckCrashed: <the answer> }`, with the run's own headers and key, once. The office merges a
 * dataPatch into what is stored, so a second answer would keep the keys of the first that it does not hold, and a null
 * in it would delete one.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { whyTheCheckCrashed } from '../src/config/inspection-ending.mjs'

/**
 * @param {string} sentence
 * @returns {never}
 */
function refuse(sentence) {
  process.stderr.write(`inspector-why-it-crashed: ${sentence}\n`)
  process.exit(2)
}

/**
 * @param {string} flag
 * @param {string} file
 * @returns {string}
 */
function theTextOf(flag, file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    return refuse(`${flag} names ${file}, which could not be read: ${/** @type {Error} */ (error).message}`)
  }
}

/** @type {{ values: { record?: string, exit?: string, 'error-stream'?: string } }} */
let given
try {
  given = parseArgs({ options: { record: { type: 'string' }, exit: { type: 'string' }, 'error-stream': { type: 'string' } }, strict: true })
} catch (error) {
  refuse(`${/** @type {Error} */ (error).message}. It takes --record <file>, --exit <text> and --error-stream <file>.`)
}

let record = null
if (given.values.record !== undefined) {
  const text = theTextOf('--record', given.values.record)
  try {
    record = JSON.parse(text)
  } catch (error) {
    refuse(`--record names ${given.values.record}, which is not JSON: ${/** @type {Error} */ (error).message}`)
  }
}
const exit = given.values.exit ?? null
const errorStream = given.values['error-stream'] === undefined ? null : theTextOf('--error-stream', given.values['error-stream'])

process.stdout.write(`${JSON.stringify(whyTheCheckCrashed({ record, exit, errorStream }), null, 2)}\n`)
