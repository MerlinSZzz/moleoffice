#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MODEL'S STEPS, for a program that ends a check and is not the message worker: the same answer the worker writes on
 * the check's session as `theModelsSteps`, from `theModelsSteps` in src/config/inspection-ending.mjs, and the same file of
 * every step in the check's out folder.
 *
 *   node tools/inspector-the-models-steps.mjs --said <file> --folder <folder>
 *
 * - `--said` names a file holding what the check tool printed on its standard output. It may be left out, and is then
 *   read as nothing kept. A file that is named and cannot be read is refused, with exit 2 and a sentence on the error
 *   stream, because reading it as nothing kept would be a guess.
 * - `--folder` names the check's out folder, where the file of every step is written. It must be given.
 *
 * It prints the answer as JSON and talks to no office. The program that runs it writes the answer to the session, as
 * `dataPatch: { theModelsSteps: <the answer> }`, with the run's own headers and key, once. The office merges a dataPatch
 * into what is stored, so a second answer would keep the keys of the first that it does not hold.
 */
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

import { theModelsSteps } from '../src/config/inspection-ending.mjs'

/**
 * @param {string} sentence
 * @returns {never}
 */
function refuse(sentence) {
  process.stderr.write(`inspector-the-models-steps: ${sentence}\n`)
  process.exit(2)
}

/** @type {{ values: { said?: string, folder?: string } }} */
let given
try {
  given = parseArgs({ options: { said: { type: 'string' }, folder: { type: 'string' } }, strict: true })
} catch (error) {
  refuse(`${/** @type {Error} */ (error).message}. It takes --said <file> and --folder <folder>.`)
}

const folder = given.values.folder ?? refuse('--folder must name the check\'s out folder, where the file of every step is written.')
let said = null
if (given.values.said !== undefined) {
  try {
    said = readFileSync(given.values.said, 'utf8')
  } catch (error) {
    refuse(`--said names ${given.values.said}, which could not be read: ${/** @type {Error} */ (error).message}`)
  }
}

process.stdout.write(`${JSON.stringify(theModelsSteps({ said, folder }), null, 2)}\n`)
