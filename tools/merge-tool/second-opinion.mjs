// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECOND OPINION ON MODAL BEFORE AN ENTRY BOUNCES (the second-opinion rule, wave 13v round 21). A test file that stayed
 * red alone with an entry on this machine, and was green on main here, is run once more on a Modal VM with the
 * runner, tools/modal-tests.mjs: with the entry's tree, and with main's tree when the entry did not bring or change the
 * file. Green on both clears the file, which is kept on the entry as a load timeout with every run's log. Red on Modal,
 * no result, a refusal, or a run the month's budget cannot pay for leaves the file red, and `says` names why.
 *
 * THE SETTINGS DOOR PROTECTS THE BUDGET. The stored cap applies in each calendar month;
 * MODAL_MONTHLY_CAP_USD is its shipped value. Spending is counted from the runner's receipts. A run
 * is not started when the month's receipts and the most the run could cost would pass the cap.
 *
 * THIS MODULE IMPORTS NOTHING OF THE MERGE TOOL'S ARGUMENTS AND NO SETTINGS: its caller gives the parts of the Modal
 * runner it uses and the two settings reads, as testing.mjs passes arguments.mjs's THE_MODAL_PARTS. Part of the merge
 * tool, tools/the-merger.mjs; testing.mjs calls it.
 */

import './a-library-is-not-a-program.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { dollarsWithWholeCents } from '../../src/config/dollars.mjs'
import { carriesTheTestMark } from '../../src/config/the-test-mark.mjs'
import { localStamp } from '../../src/shared/time.ts'

/** The runner's exits, as its header says them. */
const NO_RESULT = 75
const REFUSED = 2

/** What a run on Modal said for a file, kept per tree, commit and file, so the related tests and the whole suite do not pay twice. */
const ALREADY = new Map()
/** How many runner calls this process has made, so each call's log and report have names of their own. */
let calls = 0

/** The sentence a caller is refused with when it does not give the parts of the Modal runner that the second opinion uses. */
export const A_SECOND_OPINION_NEEDS_THE_MODAL_PARTS = "aSecondOpinion and whetherASecondOpinionCanBeTaken need modal from their caller, holding VM_CHECKOUT, VM_DEFAULTS, VM_SANDBOX_GRACE_SECONDS, estimateUSD, readMonthReceipts, receiptsFile, validateToken, executable, runnerFiles, capAsWritten and capSetting, as testing.mjs passes arguments.mjs's THE_MODAL_PARTS, so that second-opinion.mjs reaches no office module itself."

/** Refuses a caller whose modal parts are missing or not what both functions use; it calls nothing it is given. */
function checkTheModalParts(modal) {
  const isFunction = (value) => typeof value === 'function'
  const isFiniteNumber = (value) => Number.isFinite(value)
  const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0
  if (
    typeof modal !== 'object' || modal === null ||
    !isFunction(modal.estimateUSD) || !isFunction(modal.readMonthReceipts) || !isFunction(modal.receiptsFile) ||
    !isFunction(modal.validateToken) || !isFunction(modal.executable) || !isFunction(modal.runnerFiles) ||
    !isFunction(modal.capAsWritten) ||
    !isNonEmptyString(modal.VM_CHECKOUT) || !isNonEmptyString(modal.capSetting) ||
    !isFiniteNumber(modal.VM_SANDBOX_GRACE_SECONDS) ||
    typeof modal.VM_DEFAULTS !== 'object' || modal.VM_DEFAULTS === null ||
    !isFiniteNumber(modal.VM_DEFAULTS.limitSeconds) || !isFiniteNumber(modal.VM_DEFAULTS.cpu) ||
    !isFiniteNumber(modal.VM_DEFAULTS.memoryMiB)
  ) throw new Error(A_SECOND_OPINION_NEEDS_THE_MODAL_PARTS)
}

/** The sentence saying why a run the test suite started never calls the real Modal runner. */
export const A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION = 'the test suite started this run, and a run the test suite started never calls the real Modal runner'

/**
 * WHETHER A SECOND OPINION CAN BE TAKEN AT ALL, and the cap it spends under. `off` is the sentence saying why not; it
 * names a refused file's path and its source, never the token's content.
 */
export function whetherASecondOpinionCanBeTaken({ runner, theRealRunner, env = process.env, modal }) {
  checkTheModalParts(modal)
  if (runner === theRealRunner && carriesTheTestMark(env)) {
    return { off: A_RUN_THE_SUITE_STARTED_TAKES_NO_SECOND_OPINION }
  }
  const files = modal.runnerFiles()
  const source = (file) => file.source === 'the default' ? `the default; ${file.name} is not set` : `the setting ${file.name}`
  try { modal.validateToken(files.token.path) }
  catch (error) {
    const at = `${files.token.path} (${source(files.token)})`
    if (error.message === 'The Modal token file is missing.') return { off: `there is no Modal token file at ${at}, so the Modal runner cannot start` }
    if (error.message === 'The Modal token file must be a regular file owned by this user with mode 0600.') return { off: `the Modal token file at ${at} must be a regular file owned by this user with mode 0600, so the Modal runner cannot start` }
    throw error
  }
  try { modal.executable(files.python.path) }
  catch (error) {
    if (error.message !== 'MOLE_OFFICE_MODAL_PYTHON does not name an executable.') throw error
    return { off: `there is no executable Python at ${files.python.path} (${source(files.python)}), so the Modal runner cannot start` }
  }
  const given = String(modal.capAsWritten() ?? '').trim()
  const cap = dollarsWithWholeCents(given)
  if (cap === null) return { off: `${modal.capSetting} is "${given}", which is not a number of dollars with whole cents within the safe integer limit, so no budget is known` }
  return { off: null, cap }
}

/**
 * THE SECOND OPINION ON `stillRed`, the files comparedWithMain left red with the entry on `tree`, whose main is `M`.
 * `run` and `git` are the merge tool's own (git.mjs), or a test's. Answers the load timeouts it cleared, the files it
 * left red, and one sentence for the entry's `says`.
 */
export async function aSecondOpinion({ tree, M, stillRed, runner, theRealRunner, outFolder, run, git, log, env = process.env, modal, now = () => new Date() }) {
  checkTheModalParts(modal)
  if (stillRed.length === 0) return { cleared: [], kept: stillRed, says: '' }
  const can = whetherASecondOpinionCanBeTaken({ runner, theRealRunner, env, modal })
  if (can.off !== null) {
    const says = ` No second opinion on Modal was taken: ${can.off}.`
    log(says.trim())
    return { cleared: [], kept: stillRed, says }
  }
  const head = git(tree, ['rev-parse', '--verify', 'HEAD^{commit}'])
  const why = new Map()
  // A FILE MAIN WAS NOT GREEN ON HERE is not a load timeout, whatever Modal says (the brief: green on main here as well).
  const asked = []
  for (const one of stillRed) {
    if (one.pair !== null && one.pair.main.failing.length > 0) why.set(one.file, `it was not green on main here either (${String(one.pair.main.failing.length)} test(s) failed there), so Modal was not asked`)
    else asked.push(one)
  }
  const onTheEntry = await theRunsOf({ commit: head, files: asked.map((one) => one.file), label: 'modal-entry', tree, runner, outFolder, run, log, cap: can.cap, now, modal })
  // A FILE THE ENTRY BROUGHT OR CHANGED is run on main's tree to no purpose: main's copy is not the one that was red.
  const theEntrysOwn = (one) => one.pair === null || changedByTheEntry(git, tree, M, head, one.file)
  const toMain = asked.filter((one) => onTheEntry.get(one.file).said === 'green' && !theEntrysOwn(one))
  const onMain = await theRunsOf({ commit: M, files: toMain.map((one) => one.file), label: 'modal-main', tree, runner, outFolder, run, log, cap: can.cap, now, modal })
  const cleared = []
  for (const one of asked) {
    const entryRun = onTheEntry.get(one.file)
    if (entryRun.said !== 'green') {
      why.set(one.file, entryRun.said === 'red' ? `red on Modal with this entry too (log ${entryRun.log})` : `no second opinion: ${entryRun.why}`)
      continue
    }
    const mainRun = onMain.get(one.file)
    if (mainRun !== undefined && mainRun.said !== 'green') {
      why.set(one.file, mainRun.said === 'red' ? `green on Modal with this entry, but red on Modal on main ${M.slice(0, 12)} (log ${mainRun.log}), so it is not only this machine` : `green on Modal with this entry, and main's run on Modal gave no answer: ${mainRun.why}`)
      continue
    }
    cleared.push({
      file: one.file,
      mainAt: M,
      here: { ...(one.pair?.entry.log ? { entryLog: one.pair.entry.log } : {}), ...(one.pair?.main.log ? { mainLog: one.pair.main.log } : {}) },
      modal: { entry: { commit: head, log: entryRun.log, report: entryRun.report }, ...(mainRun === undefined ? {} : { main: { commit: M, log: mainRun.log, report: mainRun.report } }) },
    })
  }
  const kept = stillRed.filter((one) => !cleared.some((gone) => gone.file === one.file))
  const parts = []
  if (cleared.length > 0) {
    parts.push(
      ` ${String(cleared.length)} file(s) red alone here were green on a Modal VM, and are kept as load timeouts, not held against this entry: ` +
        cleared.map((one) => `${one.file} (Modal with this entry: log ${one.modal.entry.log}${one.modal.main === undefined ? '; this entry brought or changed it, so main was not run on Modal' : `; Modal on main ${M.slice(0, 12)}: log ${one.modal.main.log}`})`).join('; ') +
        '.',
    )
  }
  if (kept.length > 0) parts.push(` The second opinion on Modal did not clear: ${kept.map((one) => `${one.file} (${why.get(one.file)})`).join('; ')}.`)
  const says = parts.join('')
  log(`second opinion on Modal:${says}`)
  return { cleared, kept, says }
}

/** Whether `file` differs between main and the entry's tip, by git's own word. */
function changedByTheEntry(git, tree, M, head, file) {
  return git(tree, ['diff', '--name-only', M, head, '--', file]) !== ''
}

/**
 * ONE RUNNER CALL FOR `files` ON `commit`, or none when the budget cannot pay for it. Answers, per file, what Modal
 * said: green, red, or none with why.
 */
async function theRunsOf({ commit, files, label, tree, runner, outFolder, run, log, cap, now, modal }) {
  const out = new Map()
  const toRun = []
  for (const file of files) {
    const known = ALREADY.get(`${tree}\0${commit}\0${file}`)
    if (known === undefined) toRun.push(file)
    else out.set(file, known)
  }
  if (toRun.length === 0) return out
  const none = (whyNot) => {
    for (const file of toRun) out.set(file, { said: 'none', why: whyNot })
    return out
  }
  // THE BUDGET, before the call: what this month's receipts already hold, and the most this call could be billed.
  let spent
  try {
    spent = modal.readMonthReceipts(modal.receiptsFile(), localStamp(now()).slice(0, 7))
  } catch (error) {
    return none(`the runner's receipts for this month could not be read (${error instanceof Error ? error.message : String(error)}), so the budget is not known`)
  }
  const most = modal.estimateUSD(modal.VM_DEFAULTS.limitSeconds + modal.VM_SANDBOX_GRACE_SECONDS, modal.VM_DEFAULTS.cpu, modal.VM_DEFAULTS.memoryMiB)
  if (spent + most > cap) {
    return none(`this month's receipts hold ${spent.toFixed(2)} dollars, and a run could cost up to ${most.toFixed(2)}, which would pass the cap of ${String(cap)} dollars`)
  }
  calls += 1
  const n = String(calls)
  /** How long one runner call may take before its process group is stopped: the VM's limit, its grace, and an hour for the image and the snapshot. */
  const aCallMayTakeMs = (modal.VM_DEFAULTS.limitSeconds + modal.VM_SANDBOX_GRACE_SECONDS + 3600) * 1000
  const report = join(outFolder, `${label}-${n}.json`)
  const ran = await run(`${label}-${n}`, process.execPath, [runner, '--repo', tree, '--commit', commit, '--out', report, '--', ...toRun], { cwd: tree, timeoutMs: aCallMayTakeMs })
  const said = (file, value) => {
    const one = { ...value, log: ran.outFile, report }
    if (value.said !== 'none') ALREADY.set(`${tree}\0${commit}\0${file}`, one)
    out.set(file, one)
  }
  if (ran.code === REFUSED) {
    const line = theRefusalIn(ran.outFile)
    for (const file of toRun) said(file, { said: 'none', why: `the Modal runner refused: ${line} (log ${ran.outFile})` })
    return out
  }
  if (ran.code !== 0 && ran.code !== 1) {
    const how = ran.code === NO_RESULT ? 'the Modal runner gave no result (exit 75)' : ran.timedOut ? `the Modal runner was stopped after ${String(aCallMayTakeMs / 60000)} minutes` : `the Modal runner ended with ${String(ran.code ?? ran.signal)}`
    for (const file of toRun) said(file, { said: 'none', why: `${how} (log ${ran.outFile})` })
    return out
  }
  const results = theResultsIn(report)
  for (const file of toRun) {
    const result = results.get(`${modal.VM_CHECKOUT}/${file}`)
    if (result === undefined) said(file, { said: 'none', why: `the Modal runner's report does not name it (exit ${String(ran.code)}, log ${ran.outFile})` })
    else if (result === 'failed') said(file, { said: 'red' })
    else if (result === 'passed') said(file, { said: 'green' })
    else said(file, { said: 'none', why: `the Modal runner's report says it ${result} (log ${ran.outFile})` })
  }
  log(`${label} on ${commit.slice(0, 12)}: exit ${String(ran.code)}; ${toRun.map((file) => `${file} ${out.get(file).said}`).join(', ')} (log ${ran.outFile})`)
  return out
}

/** Each file's status in the runner's report, by the name the VM gave it; a test that failed makes its file failed. */
function theResultsIn(report) {
  const out = new Map()
  if (!existsSync(report)) return out
  let read
  try {
    read = JSON.parse(readFileSync(report, 'utf8'))
  } catch {
    return out
  }
  if (read === null || !Array.isArray(read.testResults)) return out
  for (const file of read.testResults) {
    const failed = file.status === 'failed' || (Array.isArray(file.assertionResults) && file.assertionResults.some((test) => test.status === 'failed'))
    out.set(file.name, failed ? 'failed' : String(file.status))
  }
  return out
}

/** The runner's own refusal line. It never prints the token's content. */
function theRefusalIn(logFile) {
  const text = existsSync(logFile) ? readFileSync(logFile, 'utf8') : ''
  const line = text.split('\n').find((one) => one.startsWith('Modal tests refused:'))
  return line === undefined ? 'it printed no reason' : line.slice('Modal tests refused:'.length).trim()
}
