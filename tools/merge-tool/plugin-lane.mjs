// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN-ONLY CHANGE IS TESTED BY THE PLUGIN'S OWN CHECK, THE SECRET SCAN OF ITS FOLDER AND THE PRIVACY GATE, AND NOT
 * BY THE OFFICE'S SUITE. Wave 13x round 16, step 4 of the plugin pipeline, as the
 * Checks block of the plugin-lane plan says under the plugin-lane rule. Part of the merge tool,
 * tools/the-merger.mjs.
 *
 * A change is plugin-only when every file it changes is inside one plugin's folder, by the one rule `aPluginOnlyChange`
 * in src/shared/plugin-change.ts. The office reads the same rule off the paths the integrate step recorded, which are
 * these same paths on top of the same main, and refuses the result otherwise.
 * The integration's build still runs before this, as for every git entry; the office's build reads nothing in plugins/.
 *
 * The three commands run in the entry's sandbox, in the integrated clone, one after the other, and all three run even
 * when one is red, so the bounce names everything that is wrong at once:
 *   1. `node tools/check-a-plugin.mjs <id> --json`: the plugin's manifest, views, imports, types, tests, build and size.
 *   2. `node tools/secret-scan.mjs plugins/<id> --json`: a key in the plugin's folder. It says what it could not look at,
 *      which in a sandbox is usually the office's database and this machine's own secrets, and that is said on the entry.
 *   3. The privacy gate, by `npm test`: every plain P file of main's house-rule list, run against the integrated clone.
 *      The list is read from main with git, because a plugin-only change cannot change tests/house-rules.mjs. No copy
 *      of the names is kept here; src/shared/the-plain-privacy-files.ts names them from the list's text.
 * A run that gave no result stops the tool, as everywhere in this tool: it is not counted as red. An integrated tree
 * with no built page stops the lane that way too, and not as red, because the plain privacy files cannot run without
 * the page. The sentence says so in the lane's own log.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

import { HOUSE_RULES_PATH } from '../../src/shared/merge-class.ts'
import { thePlainPrivacyFiles } from '../../src/shared/the-plain-privacy-files.ts'
import { aPluginOnlyChange, PLUGINS_FOLDER } from '../../src/shared/plugin-change.ts'
import { LOG, SCRIPT_TIMEOUT_MS, THIS_CHECKOUT } from './arguments.mjs'
import { changedBetween } from './git.mjs'
import { fail, log } from './log-and-state.mjs'
import { NOT_RED, redFilesIn, whatTheRunSaid, whyARunGaveNoResult } from './red-files.mjs'

/** What theBuiltPageProblem says when its caller gives it no page or no check. */
export const THE_BUILT_PAGE_PROBLEM_NEEDS_THE_PAGE_AND_ITS_CHECK = "theBuiltPageProblem needs builtPage, the built page's folder, and missingWebBuild from its caller, as testAPlugin passes what testing.mjs gives it from the-built-page.mjs, so that plugin-lane.mjs reaches no office module itself."

/** What testAPlugin says when its caller leaves out one of the five things it needs. */
export const TEST_A_PLUGIN_NEEDS_WHAT_ITS_CALLER_GIVES = "testAPlugin needs inATestBatchSeat, runInSandbox and keepTheReport from its caller, as testing.mjs passes office-keeper.mjs's, and builtPage and missingWebBuild, as testing.mjs passes the-built-page.mjs's THE_BUILT_PAGE and missingWebBuild, so that plugin-lane.mjs reaches no office module itself."

/**
 * THE SENTENCE SAYING THE INTEGRATED TREE HAS NO BUILT PAGE, or null when it has one. The page's folder is the one
 * the caller gives as `builtPage`, as testing.mjs gives THE_BUILT_PAGE from the-built-page.mjs, and it is read inside
 * the clone, so no second copy of its name is written. The caller also gives `missingWebBuild`, the check from
 * the-built-page.mjs.
 */
export function theBuiltPageProblem(clone, { builtPage, missingWebBuild } = {}) {
  if (typeof builtPage !== 'string' || builtPage === '' || typeof missingWebBuild !== 'function') throw new Error(THE_BUILT_PAGE_PROBLEM_NEEDS_THE_PAGE_AND_ITS_CHECK)
  const page = join(clone, relative(THIS_CHECKOUT, builtPage))
  const missing = missingWebBuild(page)
  return missing === null ? null : `The integrated tree ${clone} has no built page at ${page}, so the plain privacy files cannot run: ${missing} ${NOT_RED}`
}

/** The plugin a change between two commits of `repo` changes alone, or null when it is not plugin-only. */
export function thePluginOnlyChangeOf(repo, from, to) {
  return aPluginOnlyChange(changedBetween(repo, from, to))
}

/** The last line of a run's output that is a JSON object `isIt` accepts, or null when there is none. */
function theJsonLineOf(run, isIt) {
  const text = existsSync(run.outFile) ? readFileSync(run.outFile, 'utf8') : ''
  for (const line of text.split('\n').reverse()) {
    if (!line.startsWith('{')) continue
    try {
      const value = JSON.parse(line)
      if (value !== null && typeof value === 'object' && isIt(value)) return value
    } catch {
      // Output that only starts like JSON, such as a test's own print. The line asked for is looked for further up.
    }
  }
  return null
}

/** Stops the tool when a run gave no result: the launcher never started it, or it was cut off. */
function stopOnNoResult(run, what, sandbox) {
  const why = whyARunGaveNoResult(run)
  if (why !== null) fail(`${what} gave no result in sandbox ${sandbox.name}: ${why}; ${whatTheRunSaid(run)} (log ${run.outFile}). ${NOT_RED}`)
}

/**
 * TEST A PLUGIN-ONLY CHANGE AND REPORT THE `tested` STEP. `change` is what `aPluginOnlyChange` read of the integrated
 * tree; `clone` is that tree, inside the entry's `sandbox`, and `reports` is where a run writes its report there.
 * `list` is main's house-rule list as `houseRuleListAtMain` read it. The caller passes office-keeper.mjs's
 * inATestBatchSeat, runInSandbox and keepTheReport, and the-built-page.mjs's THE_BUILT_PAGE as builtPage and its
 * missingWebBuild; the lane reaches no office module itself.
 */
export async function testAPlugin(change, { sandbox, clone, reports, tip, scripts, report, list, inATestBatchSeat, runInSandbox, keepTheReport, builtPage, missingWebBuild }) {
  if (typeof inATestBatchSeat !== 'function' || typeof runInSandbox !== 'function' || typeof keepTheReport !== 'function' || typeof builtPage !== 'string' || builtPage === '' || typeof missingWebBuild !== 'function') throw new Error(TEST_A_PLUGIN_NEEDS_WHAT_ITS_CALLER_GIVES)
  const folder = `${PLUGINS_FOLDER}/${change.id}`
  const red = []
  const said = []
  log(`a plugin-only change: every file it changes is under ${folder}, so it is tested by that plugin's own check, the secret scan of its folder and the privacy gate, and not by the office's suite`)

  // 1. THE PLUGIN'S OWN CHECK.
  const checkCommand = `node tools/check-a-plugin.mjs ${change.id}`
  // the check runs the plugin's tests, and the privacy gate below runs test files, so each sits in a test-batches seat
  const check = await inATestBatchSeat(`the plugin ${change.id}'s own check`, () =>
    runInSandbox(sandbox, 'plugin-check', 'node', ['tools/check-a-plugin.mjs', change.id, '--json'], { cwd: clone, timeoutMs: SCRIPT_TIMEOUT_MS }),
  )
  stopOnNoResult(check, checkCommand, sandbox)
  const checked = theJsonLineOf(check, (one) => one.plugin === change.id && Array.isArray(one.steps))
  if ((check.code !== 0 && check.code !== 1) || checked === null || checked.passed !== (check.code === 0)) {
    fail(
      `${checkCommand} could not say whether the plugin passes: ${whatTheRunSaid(check)}, ` +
        `${checked === null ? 'and it printed no line of its answer' : `and its answer says passed is ${String(checked.passed)}`} (log ${check.outFile}). Exit 0 is passed and exit 1 is failed; nothing else is a verdict. ${NOT_RED}`,
    )
  }
  if (checked.passed) said.push(`The plugin's own check passed its ${String(checked.steps.length)} steps.`)
  else {
    red.push(checkCommand)
    const failed = checked.steps.filter((one) => one.outcome !== 'passed')
    said.push(`The plugin's own check did not pass: ${failed.map((one) => `${String(one.step)}: ${String(one.says)}`).join('; ')} (log ${check.outFile}).`)
  }

  // 2. THE SECRET SCAN OF ITS FOLDER. It never prints a key: only how many of each kind, and in which file.
  const scanCommand = `node tools/secret-scan.mjs ${folder}`
  const scan = await runInSandbox(sandbox, 'plugin-secrets', 'node', ['tools/secret-scan.mjs', folder, '--json'], { cwd: clone, timeoutMs: SCRIPT_TIMEOUT_MS })
  stopOnNoResult(scan, scanCommand, sandbox)
  const scanned = theJsonLineOf(scan, (one) => typeof one.found === 'object' && Array.isArray(one.couldNotLookAt))
  const kinds = scanned === null ? [] : Object.entries(scanned.found)
  if ((scan.code !== 0 && scan.code !== 1) || scanned === null || (kinds.length === 0) !== (scan.code === 0)) {
    fail(`${scanCommand} could not say whether the folder holds a key: ${whatTheRunSaid(scan)}, ${scanned === null ? 'and it printed no line of its answer' : `and its answer names ${String(kinds.length)} kinds`} (log ${scan.outFile}). ${NOT_RED}`)
  }
  if (kinds.length > 0) {
    red.push(scanCommand)
    said.push(`The secret scan found ${kinds.map(([kind, count]) => `${String(count)} ${kind}`).join(', ')} in ${scanned.files.map((one) => one.file).join(', ')}.`)
  } else said.push(`The secret scan read ${String(scanned.filesRead)} files and found nothing that looks like a key.`)
  if (scanned.couldNotLookAt.length > 0) said.push(`It could not look at: ${scanned.couldNotLookAt.join('; ')}.`)

  // 3. THE PRIVACY GATE: every plain P file of MAIN'S house-rule list, run against the integrated clone.
  if (typeof scripts.test !== 'string') fail(`${clone} has no test script in package.json, so the privacy gate cannot run.`)
  if (list.why !== null) fail(`The plain privacy files cannot be named: ${list.why}. ${NOT_RED}`)
  let plain
  try {
    plain = thePlainPrivacyFiles(list.text)
  } catch (error) {
    fail(`The plain privacy files cannot be named: ${error instanceof Error ? error.message : String(error)} ${NOT_RED}`)
  }
  log(`the privacy gate runs ${String(plain.length)} plain privacy files from main's ${HOUSE_RULES_PATH} at ${list.mainAt.slice(0, 12)}: ${plain.join(', ')}`)
  // A TREE WITH NO BUILT PAGE CANNOT RUN THEM, and that is not red: two of the files build an installer bundle, which
  // needs the page. The sentence names the tree, the page it looked for and why, and ends with NOT_RED.
  const pageProblem = theBuiltPageProblem(clone, { builtPage, missingWebBuild })
  if (pageProblem !== null) fail(pageProblem)
  const written = join(reports, 'plugin-gates.json')
  rmSync(written, { force: true })
  // SCRIPT_TIMEOUT_MS is fifteen minutes, more than ten times the seventy seconds the plain privacy files took together
  // when measured, so the run has the time it needs and is not cut off.
  const gates = await inATestBatchSeat(`the privacy gate's ${String(plain.length)} plain privacy files for the plugin ${change.id}`, () =>
    runInSandbox(sandbox, 'plugin-gates', 'npm', ['test', '--', '--no-file-parallelism', '--reporter=default', '--reporter=json', `--outputFile.json=${written}`, ...plain], {
      cwd: clone,
      timeoutMs: SCRIPT_TIMEOUT_MS,
    }),
  )
  stopOnNoResult(gates, 'The privacy gate', sandbox)
  const kept = keepTheReport(written, 'plugin-gates.json')
  const read = redFilesIn(kept, clone)
  const unnamed = read === null ? plain : plain.filter((file) => !read.names.includes(file))
  if (read === null || unnamed.length > 0 || (gates.code !== 0) !== (read.failed.length > 0)) {
    fail(`The privacy gate could not say whether the plugin passes: ${read === null ? `it left no readable report at ${written}` : unnamed.length > 0 ? `its report does not name ${unnamed.join(', ')}` : `npm test exited ${String(gates.code)} and its report names ${String(read.failed.length)} red files`}; ${whatTheRunSaid(gates)} (log ${gates.outFile}). ${NOT_RED}`)
  }
  const { total, passed } = read.tests
  const skipped = total === null || passed === null ? null : total - passed - (read.tests.failed ?? 0)
  const counts = total === null || passed === null ? '' : ` ${String(passed)} of its ${String(total)} tests passed${skipped === null || skipped === 0 ? '' : `, and ${String(skipped)} were skipped`}.`
  if (read.failed.length > 0) {
    red.push(...read.failed)
    said.push(`The privacy gate is red in ${read.failed.join(', ')} (log ${gates.outFile}).${counts}`)
  } else said.push(`The privacy gate ran all ${String(plain.length)} plain privacy files from main's ${HOUSE_RULES_PATH} at ${list.mainAt.slice(0, 12)} and every one passed.${counts}`)

  const green = red.length === 0
  const manifest = change.manifest ? ', its manifest included' : ', and none of them is its manifest'
  const says =
    `A plugin-only change: every file it changes is under ${folder}${manifest}, so it was tested by that plugin's own check, the secret scan of its folder and the privacy gate, ` +
    `and not by the office's suite (the plugin-lane rule). ${said.join(' ')}`
  const runs = { check: { code: check.code, log: check.outFile }, secrets: { code: scan.code, log: scan.outFile }, gates: { code: gates.code, log: gates.outFile, report: kept } }
  return report({ green, build: { passed: true }, ...(green ? {} : { redTests: red }), log: LOG, tip, says, plugin: change }, { plugin: change, runs })
}
