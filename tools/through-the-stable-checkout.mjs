#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * RUNS ONE OFFICE TOOL FROM THE STABLE CHECKOUT, PAIRED WITH THIS DEVELOPMENT CHECKOUT (wave 13q).
 *
 *   node tools/through-the-stable-checkout.mjs <tool> [args]
 *
 * A development checkout whose .env names MOLE_OFFICE_STABLE_CHECKOUT may not open the office's database
 * (whyThisCheckoutMayNotOpenTheDatabase in src/config/settings.mjs), and the stable checkout's tools refuse to start
 * unpaired at a dated stable tag (stopAnUnpairedStableStart). This runs the stable checkout's own copy of the tool with
 * the same arguments, paired through MOLE_OFFICE_DEVELOPMENT_CHECKOUT, as the stable office runs it. The environment
 * comes from theOfficeToolEnvironment (src/config/the-office-tool-environment.mjs).
 *
 * ONLY THE TOOLS ON THE LIST BELOW ARE RUN. Any other is refused by name, and nothing is run.
 */

import { isTheProgramRun } from '../src/config/settings.mjs'
import { NothingWasRun, runInTheStableCheckout } from '../src/config/the-office-tool-environment.mjs'

/** The tools this runs, by their file in the checkout. */
const THE_LIST = Object.freeze([
  'tools/office-copy.mjs',
  'scripts/backup.ts',
  'tools/sandbox.mjs',
  'tools/the-inspector.mjs',
  'tools/run-the-timing-job.mjs',
  'tools/run-the-login-reading.mjs',
  'tools/run-the-test-catches-job.mjs',
  'tools/periodic-main-suite.mjs',
])

/**
 * Run `tool` with `args` from the stable checkout, and give back its exit code.
 * @param {string[]} words the tool, then its arguments
 * @returns {number}
 */
export function throughTheStableCheckout(words) {
  const [tool, ...args] = words
  const usage = `node tools/through-the-stable-checkout.mjs <tool> [args], where the tool is one of ${THE_LIST.join(', ')}.`
  if (tool === '--help' || tool === '-h') {
    console.log(`Runs one office tool from the stable checkout, paired with this development checkout:\n  ${usage}`)
    return 0
  }
  try {
    if (tool === undefined) throw new NothingWasRun(`Say which tool to run: ${usage} Nothing was run.`)
    if (!THE_LIST.includes(tool)) {
      throw new NothingWasRun(`${tool} is not one of the tools this runs from the stable checkout, which are ${THE_LIST.join(', ')}. Nothing was run.`)
    }
    return runInTheStableCheckout(tool, args, 'through-the-stable-checkout')
  } catch (error) {
    const refused = error instanceof NothingWasRun
    console.error(`through-the-stable-checkout: ${refused ? 'refused' : 'FAILED'}: ${error instanceof Error ? error.message : String(error)}`)
    return refused ? 2 : 1
  }
}

if (isTheProgramRun(import.meta.url, 'tools/through-the-stable-checkout.mjs')) process.exitCode = throughTheStableCheckout(process.argv.slice(2))
