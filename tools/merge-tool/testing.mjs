// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TESTING A GIT ENTRY: related-only coverage or the whole suite under the full-suite seat, each red file run again
 * alone, what the suite read, and each file still red compared with main. Part of the merge tool, tools/the-merger.mjs.
 */

import './a-library-is-not-a-program.mjs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

import { whatTheCodeNames } from '../what-tests-name.mjs'
import { LOG, MODAL_RUNNER, SCRIPT_TIMEOUT_MS, SUITE_TIMEOUT_MS, THE_BUS_READS, THE_MODAL_PARTS, THE_REAL_MODAL_RUNNER, THE_SUITE_WORKERS_READS, THIS_CHECKOUT, WORKDIR, chosen, withThePairing } from './arguments.mjs'
import { fail, log, readState, stamp } from './log-and-state.mjs'
import { checkBeforeATool, cleanEnvironment, changedBetween, git, linkNodeModules, packageScripts, run, tryGit } from './git.mjs'
import {
  ask,
  acquireFullSuiteSeat,
  keepTheReport,
  releaseSeat,
  runInSandbox,
  sleep,
  step,
  theOfficeHealthWhile,
  theOfficesRuntime,
  theRelatedTestsFirstSetting,
  countAGateMet,
  inATestBatchSeat,
  theLane,
  theSandbox,
} from './office-keeper.mjs'
import { aMoveOfOnlyDocuments, theReadsFile, theSuiteWorkers } from './documents.mjs'
import { sayThePushesThatMovedMain } from './emergency-push.mjs'
import { NOT_RED, aGreenRun, noResultIn, passedFilesIn, redFilesIn, runAlone, theFilesAWorkerExitLeftUnfinished, whatTheRunSaid, whyARunGaveNoResult } from './red-files.mjs'
import { aBusFor, aCollisionNaming, aResultToBorrow, whatTheBusDecides } from './pairs.mjs'
import { testAPlugin, thePluginOnlyChangeOf } from './plugin-lane.mjs'
import { aSecondOpinion } from './second-opinion.mjs'
import { runRetainedSuite } from './suite-attempt.mjs'
import { relatedTestsOnlyPosition } from '../../src/config/related-tests-only.mjs'
import { missingWebBuild, THE_BUILT_PAGE } from '../../src/config/the-built-page.mjs'
import { wholeSuitePathCases, relatedOnlyWords } from './whole-suite-cases.mjs'
import { THE_PROGRAMS_RESTARTED_WITH_THE_SERVER } from '../files-that-restart-the-server.mjs'
import { wholeSuiteFixRoundIsOn } from '../../src/config/whole-suite-red.mjs'
import { testedClonePosition } from '../../src/config/integration-guards.mjs'
import { mergeClassAtResult, mergeClassLogLine, buildFact, repairFiles } from './merge-class.mjs'
import { houseRuleListAtMain, houseRulesAtMain, houseRulesLogLine } from './house-rules.mjs'
import { filesThatChangedTheirAnswer } from './changed-their-answer.mjs'
import { theRedOnMainFiles, withTheirFailureLines } from './the-failure-lines.mjs'
import { theBoxLock, theInstalledLock, theLocksCompared } from './installed-lock.mjs'
import { completeOriginalTestRun, observedBusCause } from './whole-suite-red.mjs'
import { MERGE_WORKERS_BOUNDS } from '../../src/config/settings.mjs'

// ============================================================================ testing

/** THE LONGEST SINGLE ARGUMENT LINUX GIVES A PROGRAM IT STARTS, in bytes, less the zero byte that ends it (32 pages of 4,096 bytes). A longer one fails with E2BIG, and npm then exits 249. */
const THE_LONGEST_ARGUMENT = 32 * 4096 - 1

/**
 * HOW LONG THE ONE ARGUMENT IS THAT npm 10 MAKES OF A SCRIPT AND THE WORDS AFTER `--`. npm runs the script with `sh -c`
 * and one argument: the script, then each word after a space, quoted when it holds a character the shell reads
 * (@npmcli/promise-spawn, escape.sh). npm's last tidying of the quotes can only shorten it, and is not counted, so the
 * count is never less than npm's.
 */
function theLengthNpmMakesOf(script, words) {
  return words.reduce((bytes, word) => bytes + 1 + (word === '' ? 2 : /[\t\n\r "#$&'()*;<>?\\`|~]/.test(word) ? Buffer.byteLength(word) + 2 + 3 * (word.split("'").length - 1) : Buffer.byteLength(word)), Buffer.byteLength(script))
}

/**
 * THE WORDS npm test IS GIVEN AFTER `--`, in one place, so the length checked before a run is the length of the run. Each
 * test file is named relative to `cwd`. vitest 4 selects the same files by that name as by the full path, and the full
 * paths of 1,127 files once made an argument of about 146 KB, which the sandbox could not run.
 */
function theTestWords({ cwd, workers, written, files, leftOut }) {
  return [`--maxWorkers=${String(workers)}`, '--reporter=default', '--reporter=json', `--outputFile.json=${written}`, ...files.map((file) => relative(cwd, file)), ...leftOut.flatMap((file) => ['--exclude', file])]
}

/**
 * ONE FILE RUN AGAIN ALONE, IN WORDS, with the load as it started, and, for a file green alone, whether it had the
 * installed packages of the run it was red in, `theRun`, whose lock is `lock` (installed-lock.mjs).
 */
function theRerunSaid(one, theRun, lock) {
  return `${one.file} ${one.alone} alone (load ${String(one.load1)}/${String(one.load5)}/${String(one.load15)})${one.alone === 'green' ? `, and ${theLocksCompared(theRun, lock, one.lock)}` : ''}`
}

/**
 * THE RERUNS OF ONE RUN'S RED FILES ON `tree`, AS filesThatChangedTheirAnswer READS THEM, each marked `unfinished` when a
 * worker exit left it so in that run (theFilesAWorkerExitLeftUnfinished), because that run gave it no answer.
 */
function theRerunsOn(tree, reruns, unfinished) {
  return reruns.map((one) => ({ ...one, tree, unfinished: unfinished.some((other) => other.file === one.file) }))
}

/**
 * WHAT A WORKER EXIT IN `theRun` LEFT UNFINISHED, IN WORDS, or nothing when it left nothing. The
 * entry's sentence and the tool's log both say it, so the file the exited worker held is named where the run is read.
 */
function theWorkerExitSaid(theRun, unfinished) {
  if (unfinished.length === 0) return ''
  const files = unfinished.map((one) => `${String(one.tests)} test(s) of ${one.file}`).join(', ')
  const one = unfinished.length === 1
  return ` A vitest worker exited unexpectedly in ${theRun} and left ${files} unfinished. So ${theRun} gave ${one ? 'that file' : 'those files'} no answer: ${one ? 'its' : "each one's"} run alone decides it, and a green run alone is not counted as a changed answer.`
}

/** HOW MANY FILES OF A RUN DID NOT PASS, IN WORDS: the red ones, and apart from them those a worker exit left unfinished. */
function theFilesThatDidNotPass(failed, unfinished) {
  return unfinished.length === 0 ? `${String(failed)} red file(s)` : `${String(failed - unfinished.length)} red file(s) and ${String(unfinished.length)} file(s) a worker exit left unfinished`
}

/**
 * THE FACTS OF THE `tested` STEP, as the step door reads them, from what this tool measured. `redTests`
 * names what stayed red on its own; a build that failed or a suite that left no report has no test to
 * name, so the command that failed is named in its place and `says` says so.
 */
function testedFacts(measured, commit) {
  const counts = measured.files === null ? {} : { ...(measured.files.tests.total === null ? {} : { ran: measured.files.tests.total }), ...(measured.files.tests.passed === null ? {} : { passed: measured.files.tests.passed }) }
  const said = measured.workersSaid === undefined ? measured.says : `${String(measured.says ?? '')} ${measured.workersSaid}`.trim()
  const coverage = measured.relatedOnly === undefined
    ? measured.wholeSuiteBecause === undefined ? '' : ` ${measured.wholeSuiteBecause.map(one => one.says).join(' ')}${measured.relatedListNotWorkedOut ? ` ${relatedOnlyWords('noPathList')}` : ''}`
    : ` ${measured.green && measured.files?.failed === 0 ? `${relatedOnlyWords('green', { files: measured.relatedOnly.files })} ` : ''}${relatedOnlyWords(measured.green ? 'coverage' : 'redCoverage')} ${measured.relatedOnly.says}${measured.relatedOnly.leftOutSlow.map(one => ` ${relatedOnlyWords('slow', one)}`).join('')}`
  return {
    green: measured.green,
    build: measured.build,
    ...(measured.green ? {} : { redTests: measured.stillRed.length > 0 ? measured.stillRed : [measured.failedCommand] }),
    // THE TESTS RED ONLY WITH THIS ENTRY (wave 13u round 63): the office may hand them to the entry's own supervisor to fix
    // instead of bouncing it. Named only when every red test is one, measured on the entry's own tree and not a bus's.
    ...(!measured.green && (measured.redOnlyWithIt ?? []).length > 0 ? { redOnlyWithIt: measured.redOnlyWithIt } : {}),
    log: measured.log,
    tip: commit,
    ...counts,
    // A SETTING THE SUITE COULD NOT USE IS SAID ON THE ENTRY'S OWN RECORD as well as in the log, and
    // so are the owner-content gate's reminders (wave 13v round 30).
    says: withTheReminders(coverage === '' ? said : `${said ?? ''}${coverage}`.trim(), measured.ownerContentSaid),
    // HOW FAST THE OFFICE ANSWERED WHILE THE SUITE RAN, kept on the entry (acceptance finding 64).
    ...(measured.officeHealth === undefined ? {} : { officeHealth: measured.officeHealth }),
    ...(measured.testedWith === undefined ? {} : { testedWith: measured.testedWith }),
    // THE FILES A SECOND OPINION ON MODAL CLEARED, with every run that decided each (the second-opinion rule).
    ...(measured.loadTimeouts === undefined || measured.loadTimeouts.length === 0 ? {} : { loadTimeouts: measured.loadTimeouts }),
    // THE FILES THAT CHANGED THEIR ANSWER ON THIS TREE (wave 13u round 51), left out when there are none.
    ...(measured.changedTheirAnswer === undefined || measured.changedTheirAnswer.length === 0 ? {} : { changedTheirAnswer: measured.changedTheirAnswer }),
    ...(measured.wholeSuiteRed === undefined ? {} : { wholeSuiteRed: measured.wholeSuiteRed }),
    ...(measured.busCause === undefined ? {} : { busCause: measured.busCause }),
    ...(measured.relatedOnly === undefined ? {} : { relatedOnly: measured.relatedOnly }),
    ...(measured.wholeSuiteBecause === undefined ? {} : { wholeSuiteBecause: measured.wholeSuiteBecause }),
  }
}

/**
 * WHAT A TESTED STEP SAYS, WITH THE OWNER-CONTENT GATE'S REMINDERS for this entry after it (wave 13v round 30). Integrate
 * keeps them in the state as `ownerContent`, or null when there were none; an entry integrated before the gate has none.
 */
function withTheReminders(says, reminders) {
  return typeof reminders === 'string' && reminders !== '' ? `${String(says ?? '')} ${reminders}`.trim() : says
}

/** ONE LOG LINE NAMING EACH FILE THAT CHANGED ITS ANSWER, how, and the commit's twelve characters (wave 13u round 51). */
function changedTheirAnswerLogLine(files) {
  return `FILES THAT CHANGED THEIR ANSWER: ${files.map((one) => `${one.file} ${one.how} at ${one.commit.slice(0, 12)}`).join('; ')}.`
}

/**
 * THE ENVIRONMENT OF THIS CHECKOUT'S OWN TEST TOOLS, tools/modal-tests.mjs and tools/run-named-tests.mjs. They read the
 * office's settings, so they are handed the pairing (arguments.mjs), while the tree they test is another folder.
 */
export function theStableToolsEnvironment() {
  return withThePairing(cleanEnvironment())
}

/**
 * THE SECOND OPINION ON MODAL for the files still red with the entry (the second-opinion rule), with this tool's runner,
 * folder, log and process groups. tools/merge-tool/second-opinion.mjs says what it decides.
 */
function theSecondOpinion(tree, M, stillRed) {
  checkBeforeATool(tree)
  return aSecondOpinion({
    tree,
    M,
    stillRed,
    runner: MODAL_RUNNER,
    theRealRunner: THE_REAL_MODAL_RUNNER,
    outFolder: WORKDIR,
    run: (label, command, args, options) => run(label, command, args, { ...options, env: theStableToolsEnvironment() }),
    git,
    log,
    modal: THE_MODAL_PARTS,
  })
}

export async function testGit(entry) {
  const state = readState()
  const integrated = state.integrated
  // THE TESTED CLONE IS THE INTEGRATED RESULT, block only: each of the three refusals below is counted where it stops.
  if (!integrated || !existsSync(integrated.clone)) {
    await countAGateMet('tested-clone-is-the-integrated-result', testedClonePosition())
    fail(`Nothing integrated is on disk for entry ${chosen.entry} under ${WORKDIR}; it has to be integrated again before it can be tested.`)
  }
  const clone = integrated.clone
  const head = git(clone, ['rev-parse', '--verify', 'HEAD^{commit}'])
  if (head !== integrated.Cfinal) {
    await countAGateMet('tested-clone-is-the-integrated-result', testedClonePosition())
    fail(`The clone ${clone} is at ${head}, not at the integrated result ${integrated.Cfinal}.`)
  }
  const scripts = packageScripts(clone)
  const root = entry.changeset.root
  const sandbox = await theSandbox(root)
  if (!within(clone, sandbox.folder)) {
    await countAGateMet('tested-clone-is-the-integrated-result', testedClonePosition())
    fail(`The clone ${clone} is not inside the entry's sandbox folder ${sandbox.folder}, so its tests cannot run there; it has to be integrated again.`)
  }
  const reports = join(sandbox.folder, 'work', 'reports')
  mkdirSync(reports, { recursive: true })
  const facts = { tree: clone, commit: integrated.Cfinal, sandbox: sandbox.name, ran: {}, slot: null, green: false, files: null, red: [], stillRed: [], redOnMainToo: [], changedTheirAnswer: [], failedCommand: 'npm test', log: null, ownerContentSaid: integrated.ownerContent ?? undefined }
  let fixRound = wholeSuiteFixRoundIsOn()
  const gitReading = (cwd, args) => {
    const result = tryGit(cwd, args)
    if (!result.ok) throw new Error(result.stderr || `git ${args.join(' ')} failed`)
    return result.stdout
  }
  // THE COMMIT OF THE TREE A RUN HAPPENED ON, read with the tool's own git helper (wave 13u round 51).
  const commitOfTree = (tree) => git(tree, ['rev-parse', 'HEAD'])
  const report = async (tested = testedFacts(facts, integrated.Cfinal), detail = facts) => {
    if (Array.isArray(tested.changedTheirAnswer) && tested.changedTheirAnswer.length > 0) log(changedTheirAnswerLogLine(tested.changedTheirAnswer))
    // a repair's files run in the full-suite seat when one is held, and otherwise each in a test-batches seat
    const repair = await repairFiles(entry, (file, index) => {
      const runs = () => runAlone(sandbox, facts.tree, file, `hand-back-repair-${index + 1}`, reports, { noResult: 'answer', runInSandbox, keepTheReport })
      return facts.slot === null ? inATestBatchSeat(`the merge queue entry ${String(entry.id)}'s hand-back repair: ${file}`, runs) : runs()
    })
    if (repair !== undefined) {
      tested = { ...tested, repair: repair.fact }
      log(`Repair ${repair.fact.problem}: named-file runs took ${repair.seconds.toFixed(3)} seconds; ${repair.fact.files.map(one => `${one.file}: ${one.passed ? 'passed' : 'did not pass'}`).join('; ')}.`)
    }
    if (!fixRound) {
      if (!tested.green) {
        const houseRules = houseRulesAtMain(integrated, tested.redTests, gitReading)
        log(houseRulesLogLine(houseRules))
        tested = { ...tested, houseRules }
      }
      const mergeClass = mergeClassAtResult(integrated, tested.redTests ?? [], tested.build, gitReading, changedBetween, tested.green)
      log(mergeClassLogLine(mergeClass, repair))
      tested = { ...tested, mergeClass }
    }
    return step('tested', tested, detail)
  }

  // AN INTEGRATED TREE THAT DID NOT BUILD (wave 13r round L): the integrated-tree-builds gate was at off, so the integrate
  // step let the entry go on and kept its failed build. It is red here on that build, before a pair's result, a
  // documentation entry or a plugin could call it built; nothing is built, run or borrowed again.
  if (integrated.build?.passed === false) {
    facts.build = { passed: false }
    facts.log = integrated.build.log
    facts.failedCommand = 'npm run build'
    facts.says = `The integrated tree's npm run build exited ${String(integrated.build.exit)} when it was integrated (log ${String(integrated.build.log)}). The integrated-tree-builds gate was at off, so the entry was not sent back then. It is red here, and nothing was built or run again.`
    return report()
  }

  // A RESULT BORROWED FROM A PAIR'S SUITE: an entry of this lane ran its suite
  // with this one and decided something for it on exactly this tree, so nothing is run again. The office takes it only
  // against that entry's own facts. This entry's own owner-content reminders follow what that suite said.
  const borrowed = fixRound || entry.repairOf !== undefined ? null : await aResultToBorrow(entry, integrated, { theLane })
  if (borrowed !== null) return report({ ...borrowed.facts, says: withTheReminders(borrowed.facts.says, integrated.ownerContent) }, borrowed.detail)

  // A DOCUMENTATION ENTRY HAS NO SUITE TO RUN (the documentation-entry rule): no test reads any file it changes, which main's
  // record said at its pin step and again when it was integrated.
  if (entry.machine?.documents !== undefined) {
    return report(
      {
        green: true,
        build: { passed: true },
        log: LOG,
        tip: integrated.Cfinal,
        says: withTheReminders(
          `A documentation entry: every file it changes is a document that no test reads, by main's record on tree ${String(entry.machine.documents.tree).slice(0, 12)}, so there is no suite to run (the documentation-entry rule).`,
          integrated.ownerContent,
        ),
      },
      { documents: entry.machine.documents },
    )
  }

  // A PLUGIN-ONLY CHANGE IS TESTED BY THE PLUGIN'S OWN CHECK (the plugin-lane rule): the
  // check, the secret scan of its folder and the privacy gate, and not the office's suite. tools/merge-tool/plugin-lane.mjs.
  // Its privacy gate runs every plain P file of MAIN'S house-rule list, which a plugin-only change cannot change.
  const plugin = thePluginOnlyChangeOf(clone, integrated.M, integrated.Cfinal)
  if (plugin !== null) return testAPlugin(plugin, { sandbox, clone, reports, tip: integrated.Cfinal, scripts, report, list: houseRuleListAtMain(integrated, gitReading), inATestBatchSeat, runInSandbox, keepTheReport, builtPage: THE_BUILT_PAGE, missingWebBuild })

  // Read once for this entry, after the existing shortcuts and before any bus can be formed.
  const position = relatedTestsOnlyPosition()
  await countAGateMet('related-tests-only', position)
  let relatedOnly = null
  if (position === '1') {
    const cases = wholeSuitePathCases(changedBetween(clone, integrated.M, integrated.Cfinal), THE_PROGRAMS_RESTARTED_WITH_THE_SERVER)
    if (cases.length > 0) facts.relatedListNotWorkedOut = true
    else {
      const setting = await theRelatedTestsFirstSetting()
      const list = theRelatedList(clone, integrated.M, setting.leaveOutSlowerThanSeconds, { atMostHalf: true })
      if (list.files === null) cases.push({ case: list.overHalf ? 6 : 5, says: relatedOnlyWords(list.overHalf ? 'case6' : 'case5', { reason: list.says }) })
      else {
        // A LIST TOO LONG FOR ONE ARGUMENT runs the whole suite. A shorter list would leave tests out, and npm cannot run this one.
        const bytes = theLengthNpmMakesOf(String(scripts.test ?? ''), theTestWords({ cwd: clone, workers: MERGE_WORKERS_BOUNDS.most, written: join(reports, 'related-only.json'), files: list.files, leftOut: [] }))
        if (bytes > THE_LONGEST_ARGUMENT) {
          cases.push({ case: 7, says: relatedOnlyWords('case7', { files: list.files.length, bytes, most: THE_LONGEST_ARGUMENT }) })
          log(`the related tests do not run alone: ${cases.at(-1).says}`)
        } else {
          relatedOnly = list
          facts.relatedOnly = { files: 0, ...list.counts, says: `${list.says}${setting.leaveOutSlowerThanSeconds === null ? ` ${relatedOnlyWords('noSlowBound')}` : ''}` }
          // Partial coverage cannot supply original whole-suite evidence for a fix-round admission.
          fixRound = false
        }
      }
    }
    if (cases.length > 0) facts.wholeSuiteBecause = cases
  }

  // THE BUS (the bus rule): the lane's next judged entries are tested with this one, on the tree landing them in
  // order would make, when they may be; otherwise this entry is tested alone, as before. It is formed before the
  // full-suite seat is asked for, because the bus may wait for riders, and a seat held while it waits would keep every
  // other suite of the office waiting with it.
  let pair = relatedOnly !== null ? { none: relatedOnlyWords('alone') } : entry.repairOf === undefined ? await aBusFor(entry, integrated, sandbox, { theLane, sleep, countAGateMet, theOfficesRuntime, runInSandbox, reads: THE_BUS_READS }) : { none: 'a hand-back repair is tested on its own tree' }
  const busIds = () => pair.riders.map((one) => one.b.id)
  const busWords = () => (pair.riders.length === 1 ? `merge entry ${pair.b.id}` : `merge entries ${busIds().join(', ')}`)
  log(pair.b === undefined ? `tested alone: ${pair.none}` : `tested with ${busWords()} in one suite, on the ${pair.riders.length === 1 ? "pair's" : "bus's"} tree ${pair.tree}`)

  const slot = await acquireFullSuiteSeat()
  facts.slot = { id: slot.id, seat: slot.seat }
  // each return below awaits the report, so the seat is given back only after the report's repair runs have ended
  try {
    if (typeof scripts.test !== 'string') fail(`${clone} has no test script in package.json, so nothing can say whether it is green.`)
    const build = async (cwd, label) => {
      // No build script is a passed build, as it was before build became an explicit report fact.
      if (typeof scripts.build !== 'string') return { code: 0, outFile: null, says: 'no build script in package.json, so nothing was built' }
      return runInSandbox(sandbox, label, 'npm', ['run', 'build'], { cwd, timeoutMs: SCRIPT_TIMEOUT_MS })
    }
    // A BUILD THAT GAVE NO RESULT IS NOT A FAILED BUILD (finding 80): the launcher never started it, or it was cut off.
    // The tool stops; a build that ran to its end and failed is red, as before.
    const stopOnABuildWithNoResult = (built) => {
      const why = whyARunGaveNoResult(built)
      if (why !== null) fail(`npm run build gave no result in sandbox ${sandbox.name}: ${why}; ${whatTheRunSaid(built)} (log ${built.outFile}). Nothing says whether the tree builds. ${NOT_RED}`)
    }
    // An admission needs the entry's own build, even when a bus builds a different tree.
    let originalBuild = null
    let ownEvidence = null
    const exactEntryTree = () => git(clone, ['rev-parse', 'HEAD']) === integrated.Cfinal && git(clone, ['status', '--porcelain', '--untracked-files=no']) === ''
    if (fixRound) {
      if (!exactEntryTree()) fail('The affected tests need the exact clean integrated entry tree; nothing was reported as tested.')
      originalBuild = await build(clone, 'fix-round-build')
      facts.build = buildFact(originalBuild)
      if (originalBuild.code !== 0) {
        stopOnABuildWithNoResult(originalBuild)
        facts.log = originalBuild.outFile
        facts.failedCommand = 'npm run build'
        facts.says = 'The original entry build failed; a whole-suite red cannot be deferred.'
        return await report()
      }
      if (originalBuild.outFile !== null && whyARunGaveNoResult(originalBuild) === null && exactEntryTree()) {
        ownEvidence = { build: { source: 'original', tip: integrated.Cfinal, tree: git(clone, ['rev-parse', 'HEAD^{tree}']), exit: 0, log: originalBuild.outFile } }
      }
    }
    // A BUS'S TREE THAT DOES NOT BUILD, or whose suite leaves no report, is not this entry's to answer for: it is then
    // tested alone.
    let tree = pair.b === undefined ? clone : pair.clone
    let built = pair.b === undefined && originalBuild !== null ? originalBuild : await build(tree, pair.b === undefined ? 'build' : 'pair-build')
    if (pair.b !== undefined && built.code !== 0) {
      log(`the bus's tree does not build (exit ${String(built.code)}); this entry is tested alone`)
      pair = { none: `the bus's tree with ${busIds().join(', ')} did not build (${String(built.outFile)})` }
      tree = clone
      built = await build(tree, 'build')
    }
    facts.build = buildFact(built)
    facts.ran.build = built.outFile === null ? { exit: null, says: built.says } : { exit: built.code, log: built.outFile }
    if (built.code !== 0) {
      stopOnABuildWithNoResult(built)
      facts.log = built.outFile
      facts.failedCommand = 'npm run build'
      facts.says = `npm run build exited ${String(built.code)} in sandbox ${sandbox.name}; the suite did not run.`
      return await report()
    }
    // WHAT THE SUITE READS IS RECORDED AS IT RUNS (the suite-reads rule), when the tree under test carries the
    // recorder: every node process of the run loads it through NODE_OPTIONS and writes its lines into one folder.
    // THE RELATED TESTS RUN THE SAME WAY, given their files, and record their reads into the whole suite's folder: a file
    // they passed is left out of the whole suite, so main's record of what the suite reads is the two runs together.
    // THE WHOLE SUITE IS ASKED OF THE CLOUD BOX FIRST (the cloud-suite rule), with the same report and
    // reads, and runs here when the box does not run it; cloud-suite-door.mjs says when that is. The box runs at its own
    // worker count, which the queue does not pass, so the count here is chosen, and said,
    // only for a run here. The related tests run here.
    const runTheSuite = async (cwd, label, { files = null, readsOf = label, leftOut = [] } = {}) => {
      const written = join(reports, `${label}.json`)
      rmSync(written, { force: true })
      const recorder = join(cwd, 'tools', 'record-what-tests-read.mjs')
      const reads = existsSync(recorder) ? join(reports, `${readsOf}-reads`) : null
      if (reads !== null && leftOut.length === 0) rmSync(reads, { recursive: true, force: true })
      const box =
        files !== null ? null
          // THE DOOR TAKES NO FILE TO LEAVE OUT, so a suite that leaves out what the related tests passed runs here.
          : leftOut.length > 0 ? { why: `this suite leaves out the ${String(leftOut.length)} files the related tests passed on this tree, and the door takes no files to leave out` }
            : reads === null ? { why: `this tree has no ${relative(cwd, recorder)}, so nothing records what the suite reads, which the door is asked to hand back` }
              // AN ENTRY THAT NAMES ITS OWN SUITE WORKERS runs at that count (the suite-workers rule), and the box would not.
              : entry?.suiteWorkers !== undefined ? { why: `merge entry ${String(entry.id)} names its own ${String(entry.suiteWorkers.count)} suite workers (the suite-workers rule), and the box runs the suite at its own count, which the queue does not pass` }
                : { clone: cwd, commit: git(cwd, ['rev-parse', '--verify', 'HEAD^{commit}']), report: written, reads, suiteLog: join(reports, `${label}.log`), timeoutSec: SUITE_TIMEOUT_MS / 1000 }
      const health = theOfficeHealthWhile()
      if (box?.clone !== undefined) checkBeforeATool(box.clone)
      const { ran, kept } = await runRetainedSuite({
        workdir: WORKDIR, label, written, keepTheReport,
        box,
        here: () => {
          const workers = theSuiteWorkers(entry, THE_SUITE_WORKERS_READS)
          if (workers.said !== null) facts.workersSaid = workers.said
          const test = ['npm', 'test', '--', ...theTestWords({ cwd, workers: workers.count, written, files: files ?? [], leftOut })]
          const [command, ...args] = reads === null ? test : ['env', `NODE_OPTIONS=--import=${recorder}`, `TEST_READ_ROOT=${cwd}`, `TEST_READ_RECORD=${reads}`, ...test]
          return runInSandbox(sandbox, label, command, args, { cwd, timeoutMs: SUITE_TIMEOUT_MS })
        },
        hereIs: `in sandbox ${sandbox.name}`,
        door: THE_CLOUD_SUITE_DOOR,
        theRealDoor: THE_CLOUD_SUITE_DOOR,
        run: (name, program, words, options) => run(name, program, words, { ...options, env: cleanEnvironment() }),
        log,
      })
      facts.officeHealth = await health.stop()
      log(`the office's health while the suite ran: ${String(facts.officeHealth.answered)} of ${String(facts.officeHealth.samples)} asks answered, median ${String(facts.officeHealth.medianMs)} ms, slowest ${String(facts.officeHealth.maxMs)} ms, ${String(facts.officeHealth.over10s)} over 10 seconds`)
      log(`this machine while the suite ran${ran.where === 'box' ? ' on the cloud box' : ''}: 1-minute load median ${String(facts.officeHealth.load1Median)}, highest ${String(facts.officeHealth.load1Max)}, on ${String(facts.officeHealth.cpus)} CPUs; available memory median ${String(facts.officeHealth.availableMemoryMiBMedian)} MiB, lowest ${String(facts.officeHealth.availableMemoryMiBLowest)} MiB, of ${String(facts.officeHealth.memoryMiB)} MiB`)
      // THE INSTALLED LOCK WHERE THE SUITE RAN, kept beside it: on the box, the one the box's answer gives.
      const lock = ran.where === 'box' ? theBoxLock(ran.box, cwd) : theInstalledLock(cwd)
      return { run: ran, kept, read: redFilesIn(kept, cwd), written, reads, lock }
    }
    // MAIN IS READ BEFORE A RED FILE IS RUN AGAIN, AND AGAIN BEFORE THE COMPARISON WITH MAIN (acceptance finding 54,
    // the secretary's step): a main that moved while the suite ran means this tree can no longer land,
    // so nothing more is run on it and the office sends the entry back for its lane. A suite with no red file goes
    // on to ask to land, where landing's compare-and-swap reads main anyway.
    const movedWhileTesting = async (when) => {
      const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}'])
      if (head === integrated.M) return null
      // A MOVE MADE ONLY BY DOCUMENTATION LANDINGS leaves the tree under test what will land (the documentation-lane rule).
      if ((await aMoveOfOnlyDocuments(root, integrated.M, head, { theLane })) !== null) {
        log(`main moved to ${head} only by documentation landings, ${when}; the tree under test stays what will land`)
        return null
      }
      log(`main is at ${head}, not at ${integrated.M} as when this entry was integrated, ${when}`)
      // AN EMERGENCY PUSH IN BETWEEN IS NAMED, as a landing names it (wave 13u round 83, item 16).
      await sayThePushesThatMovedMain(root, integrated.M, head, { ask })
      return step('main-moved-while-testing', { mainAt: head }, { expected: integrated.M, found: head, when, suite: facts.ran.test, red: facts.red })
    }
    if (fixRound) {
      const list = theRelatedList(clone, integrated.M, null)
      facts.ran.affected = { selection: list.files === null ? 'unknown' : 'complete', says: list.says }
      if (list.files !== null) {
        const affected = await runTheSuite(clone, 'fix-round-affected', { files: list.files })
        facts.ran.affected = { ...facts.ran.affected, log: affected.run.outFile, report: affected.kept, exit: affected.run.code }
        const complete = completeOriginalTestRun(affected.run, affected.kept, clone, list.files)
        if (complete !== null && whyARunGaveNoResult(affected.run) === null && ownEvidence !== null && exactEntryTree()) {
          ownEvidence.affected = { source: 'original', tip: integrated.Cfinal, tree: ownEvidence.build.tree, selection: 'complete', exit: 0, files: complete.files, ran: complete.ran, passed: complete.passed, log: affected.run.outFile, report: affected.kept }
        } else {
          facts.log = affected.run.outFile
          facts.stillRed = affected.read?.failed ?? []
          facts.failedCommand = 'affected tests'
          facts.says = 'The complete affected selection did not pass on the exact entry tree; a whole-suite red cannot be deferred.'
          return await report()
        }
      }
    }
    // THE RELATED TESTS FIRST (the related-tests rule, part B). The test files the tree's change from main can
    // break, as `run-named-tests --list related` works them out with its quarter bound, run before the whole suite. A
    // file red there is run again alone and compared with main, as a file red in the whole suite is. A file that still
    // fails with this entry bounces it at once, with that log, and the whole suite is not run for it. On a bus, such a
    // file bounces only the entries it belongs to: when this entry is not one of them the bus goes on to its whole
    // suite, as before. A list that is refused, or any run here that answers nothing, leaves it to the whole suite.
    // A FILE THE RELATED TESTS PASSED IS NOT RUN AGAIN (round 17b): the whole suite on the same tree leaves it out, and
    // its result is carried into the suite's, with its log. A file red there runs in the whole suite as before, even
    // when it passed alone.
    // ONLY WHEN THE OFFICE'S SETTING IS ON (round 17c). It made a green entry slower when measured, and the owner was
    // told it would not go live until it no longer slows anything, so it is off until somebody
    // switches it on (GET /api/office/related-tests-first). When on, a related file whose longest recorded time is over
    // the setting's bound is left out of the related run and runs in the whole suite.
    let carried = null
    // THE FILES THAT CHANGED THEIR ANSWER, kept here so the related tests' files survive their path answering null and
    // the whole suite running next (wave 13u round 51).
    let changedTheirAnswer = []
    const first = fixRound || position === '1' ? null : await theRelatedTestsFirst()
    if (first !== null) return first
    async function theRelatedTestsFirst() {
      const label = pair.b === undefined ? 'related' : 'pair-related'
      const suiteLabel = pair.b === undefined ? 'suite' : 'pair-suite'
      const setting = await theRelatedTestsFirstSetting()
      if (setting.on !== true) {
        facts.ran.related = { off: true, says: setting.says }
        log(`the related tests are not run first, because the office's setting is off: ${setting.says} The whole suite runs, as before.`)
        return null
      }
      const list = theRelatedList(tree, integrated.M, setting.leaveOutSlowerThanSeconds)
      facts.ran.related = { says: list.says }
      if (list.files === null) {
        log(`the related tests are not run first: ${list.says} The whole suite runs, as before.`)
        return null
      }
      log(`the related tests run first: ${list.says}`)
      const ran = await runTheSuite(tree, label, { files: list.files, readsOf: suiteLabel })
      facts.ran.related = { ...facts.ran.related, files: list.files.length, exit: ran.run.code, log: ran.run.outFile, report: ran.kept, timedOut: ran.run.timedOut, lock: ran.lock }
      if (ran.read === null) {
        log(`the related tests left no readable report (${whatTheRunSaid(ran.run)}, log ${ran.run.outFile}); the whole suite runs, as before`)
        return null
      }
      // ONLY A RUN THAT ENDED ON ITS OWN, AND WHOSE EXIT ITS RED FILES EXPLAIN, IS CARRIED: a run cut off, or one that
      // failed with no red file, says nothing sure about the files it called passed.
      const passed = whyARunGaveNoResult(ran.run) === null && (ran.run.code === 0 || ran.read.failed.length > 0) ? passedFilesIn(ran.kept, tree) : null
      if (passed !== null && passed.files.length > 0) carried = { tree, ...passed, log: ran.run.outFile, report: ran.kept }
      if (ran.read.failed.length === 0) {
        log(`the related tests were green: ${String(ran.read.passed)} files passed${ran.run.code === 0 ? '' : `, though npm test exited ${String(ran.run.code)}`}; the whole suite runs without them`)
        return null
      }
      const moved = await movedWhileTesting('after the related tests, before their red files were run again alone')
      if (moved !== null) return moved
      const unfinished = theFilesAWorkerExitLeftUnfinished(ran.read, ran.run)
      if (unfinished.length > 0) log(theWorkerExitSaid('the related tests', unfinished).trim())
      // ITS RERUNS ARE KEPT APART from the whole suite's, which would run next on the same tree.
      const reran = []
      const redAlone = []
      for (const [index, file] of ran.read.failed.entries()) {
        const load = loadavg().map((one) => Math.round(one * 100) / 100)
        const alone = await runAlone(sandbox, tree, file, `related-rerun-${String(index + 1)}`, reports, { noResult: 'answer', runInSandbox, keepTheReport })
        const said = alone.noResult !== null ? 'no result' : alone.red ? 'red' : 'green'
        reran.push({ file, alone: said, load1: load[0], load5: load[1], load15: load[2], log: alone.log, report: alone.report, lock: alone.lock })
        log(`${file}, red in the related tests, is ${said} alone${alone.noResult === null ? '' : `: ${alone.noResult}`}${said === 'green' ? `, and ${theLocksCompared('the related tests', ran.lock, alone.lock)}` : ''} (log ${String(alone.log)})`)
        if (alone.noResult === null && alone.red) redAlone.push({ file, report: alone.report })
      }
      // A FILE GREEN ALONE HERE CHANGED ITS ANSWER, kept even when no file is red alone and this path hands over to
      // the whole suite. Its reruns happened on `tree`. It carries the failure lines of the related tests' run, where it
      // was red.
      changedTheirAnswer = withTheirFailureLines(filesThatChangedTheirAnswer(theRerunsOn(tree, reran, unfinished), [], commitOfTree), reran, ran.run.outFile)
      if (redAlone.length === 0) {
        log('no file red in the related tests is red alone; the whole suite runs')
        return null
      }
      const movedAgain = await movedWhileTesting('after the related tests\' red files were run again alone, before they were compared with main')
      if (movedAgain !== null) return movedAgain
      const compared = await comparedWithMain(sandbox, root, integrated.M, scripts, redAlone, tree)
      // A FILE THE PAIR CLEARED HERE CHANGED ITS ANSWER TOO, named where it was first met among the reruns, with the
      // failure lines of its own run alone, where it was red.
      changedTheirAnswer = withTheirFailureLines(filesThatChangedTheirAnswer(theRerunsOn(tree, reran, unfinished), compared.map((one) => ({ ...one, tree })), commitOfTree), reran, ran.run.outFile)
      let stillRed = compared.filter((one) => one.noResult === null && !one.onMainToo && !one.clearedByThePair)
      // A FILE RED ONLY HERE IS ASKED ABOUT ON MODAL before the entry bounces for it (the second-opinion rule).
      const second = await theSecondOpinion(tree, integrated.M, stillRed)
      if (stillRed.length > 0 && second.kept.length === 0) {
        log(`every file red alone in the related tests and not on main was green on Modal; the whole suite runs`)
        return null
      }
      stillRed = second.kept
      if (stillRed.length === 0) {
        log(`no file red alone in the related tests fails with this entry in a way main does not (${compared.map((one) => `${one.file}: ${one.noResult !== null ? `no result, ${one.noResult}` : one.onMainToo ? 'red on main too' : one.why}`).join('; ')}); the whole suite runs`)
        return null
      }
      let busSays = ''
      if (pair.b !== undefined) {
        const decided = await whatTheBusDecides({ sandbox, root, integrated, reports, bus: pair, stillRed: stillRed.map((one) => one.file), build, meaningful: true, greenMayBeDecided: false, runInSandbox, keepTheReport })
        if (decided.theseRed.length === 0) {
          log(`the files still red in the related tests on the bus's tree are not this entry's: ${decided.says} The bus goes on to its whole suite, which decides for every rider.`)
          return null
        }
        stillRed = stillRed.filter((one) => decided.theseRed.includes(one.file))
        facts.build = { passed: decided.aloneBuilt }
        facts.testedWith = decided.testedWith
        facts.pairDecided = decided.detail
        facts.busCause = observedBusCause(entry, integrated, pair, decided.detail, git)
        facts.tree = tree
        facts.pair = { with: pair.b.id, bus: busIds(), commit: pair.T, tree: pair.tree, ...(pair.passed.length === 0 ? {} : { passed: pair.passed }), ...(pair.stopped === null ? {} : { stopped: pair.stopped }) }
        busSays = ` ${decided.says}`
      } else busSays = await aCollisionNaming(entry, stillRed.map((one) => one.file), { theLane })
      facts.red = reran
      facts.log = ran.run.outFile
      facts.compared = compared
      facts.changedTheirAnswer = changedTheirAnswer
      facts.redOnMainToo = compared.filter((one) => one.noResult === null && one.onMainToo).map(({ file, mainLog, failing, measuredBy }) => ({ file, mainAt: integrated.M, log: mainLog, failing, measuredBy }))
      facts.clearedByThePair = compared.filter((one) => one.noResult === null && one.clearedByThePair).map(({ file, pair: runs, why }) => ({ file, pair: runs, why }))
      facts.stillRed = stillRed.map((one) => one.file)
      // A BUS DECIDED ON ITS OWN TREES, and the clean copy of a fix replays the entry onto main alone, so a bus's red is
      // not named as red only with the entry.
      if (pair.b === undefined) facts.redOnlyWithIt = facts.stillRed
      facts.loadTimeouts = second.cleared
      facts.green = false
      const reruns = reran.map((one) => theRerunSaid(one, 'the related tests', ran.lock)).join('; ')
      facts.says =
        `${String(stillRed.length)} file(s) of the ${String(list.files.length)} related tests fail with this entry in a way main does not: ${stillRed.map((one) => `${one.file} (${one.why})`).join('; ')}. ` +
        `So the whole suite was not run for it (the related-tests rule). ${reruns}.${theWorkerExitSaid('the related tests', unfinished)}${second.says}${busSays}`
      if (facts.redOnMainToo.length > 0) {
        await step('red-on-main', { mainAt: integrated.M, files: theRedOnMainFiles(facts.redOnMainToo) }, { redOnMainToo: facts.redOnMainToo })
      }
      return report()
    }
    let carrying = carried !== null && carried.tree === tree
    if (carrying) log(`the whole suite leaves out the ${String(carried.files.length)} files the related tests passed on this tree, and counts them from that run (log ${carried.log})`)
    let suite = relatedOnly !== null
      ? await runTheSuite(clone, 'related-only', { files: relatedOnly.files })
      : await runTheSuite(tree, pair.b === undefined ? 'suite' : 'pair-suite', { leftOut: carrying ? carried.files : [] })
    if (pair.b !== undefined && suite.read === null) {
      log(`the bus's suite left no readable report; this entry is tested alone`)
      pair = { none: `the suite on the bus's tree with ${busIds().join(', ')} left no readable report` }
      tree = clone
      const again = await build(tree, 'build')
      facts.build = buildFact(again)
      if (again.code !== 0) {
        stopOnABuildWithNoResult(again)
        facts.ran.build = { exit: again.code, log: again.outFile }
        facts.log = again.outFile
        facts.failedCommand = 'npm run build'
        facts.says = `npm run build exited ${String(again.code)} in sandbox ${sandbox.name}; the suite did not run.`
        return await report()
      }
      // THE RELATED TESTS RAN ON THE BUS'S TREE, so nothing of theirs is carried to this one.
      carrying = false
      suite = await runTheSuite(tree, 'suite')
    }
    if (pair.b !== undefined) {
      facts.tree = tree
      facts.pair = { with: pair.b.id, bus: busIds(), commit: pair.T, tree: pair.tree, ...(pair.passed.length === 0 ? {} : { passed: pair.passed }), ...(pair.stopped === null ? {} : { stopped: pair.stopped }) }
    }
    facts.ran.test = {
      exit: suite.run.code,
      log: suite.run.outFile,
      report: suite.kept,
      timedOut: suite.run.timedOut,
      // WHERE THE SUITE RAN, HOW LONG IT TOOK, and, when the cloud box did not run it, why (cloud-suite-door.mjs).
      where: suite.run.where,
      wallSec: suite.run.wallSec,
      ...(suite.run.box === undefined ? {} : { box: suite.run.box }),
      // THE INSTALLED PACKAGE LOCK WHERE IT RAN (installed-lock.mjs), which each red file's run alone keeps too.
      lock: suite.lock,
      ...(carrying ? { carried: { files: carried.files.length, tests: carried.tests.total, passed: carried.tests.passed, log: carried.log, report: carried.report } } : {}),
    }
    facts.log = suite.run.outFile
    const read = suite.read
    // A SUITE THAT GAVE NO RESULT IS NOT RED (finding 80): it could not start, was cut off, or left no report, and
    // nothing says which files were red. The tool stops, and the office asks for it again.
    if (read === null) {
      fail(`npm test gave no result in sandbox ${sandbox.name}: it left no readable report at ${suite.written}; ${whatTheRunSaid(suite.run)} (log ${suite.run.outFile}). Nothing says which files were red. ${NOT_RED}`)
    }
    if (relatedOnly !== null) facts.relatedOnly.files = read.names.length
    // A FILE CARRIED IS COUNTED ONCE, from the related tests. One the suite ran all the same would have two results,
    // and the tool does not choose between them.
    const twice = carrying ? carried.files.filter((file) => read.names.includes(file)) : []
    if (twice.length > 0) {
      fail(`${String(twice.length)} test file(s) the related tests passed ran again in the whole suite, though the suite was told to leave them out: ${twice.join(', ')}. Each has two results, so the suite's count would be wrong. ${NOT_RED}`)
    }
    const plus = (one, other) => (one === null ? null : one + other)
    facts.files = carrying
      ? { passed: read.passed + carried.files.length, failed: read.failed.length, tests: { total: plus(read.tests.total, carried.tests.total), failed: read.tests.failed, passed: plus(read.tests.passed, carried.tests.passed) }, carried: carried.files.length }
      : { passed: read.passed, failed: read.failed.length, tests: read.tests }
    // KEPT ONLY FOR THE TREE THE SUITE RAN ON. A pair's first entry lands a tree of its own (main plus it), which has no
    // record until the second lands on the pair's tree: that moment is unrecorded, and errs toward testing.
    if (relatedOnly === null && suite.reads !== null) facts.reads = keepWhatTheSuiteRead(suite.reads, tree, [git(tree, ['rev-parse', 'HEAD^{tree}'])])
    if (read.failed.length > 0) {
      const moved = await movedWhileTesting('after the suite, before its red files were run again alone')
      if (moved !== null) return moved
    }
    const unfinished = theFilesAWorkerExitLeftUnfinished(read, suite.run)
    if (unfinished.length > 0) log(theWorkerExitSaid('the suite', unfinished).trim())
    // A RED FILE IS RUN AGAIN ALONE, AT ONCE, ON THE SAME TREE, and the load at that moment is written
    // beside the result (ACCEPTANCE item 23): green alone passes.
    // A rerun that gave no result is neither red nor green: every red file is still run, and then the tool stops,
    // naming each file whose run gave no result (finding 80).
    const redAlone = []
    const noResultAlone = []
    for (const [index, file] of read.failed.entries()) {
      const load = loadavg().map((one) => Math.round(one * 100) / 100)
      const alone = await runAlone(sandbox, tree, file, `rerun-${String(index + 1)}`, reports, { noResult: 'answer', runInSandbox, keepTheReport })
      facts.red.push({ file, alone: alone.noResult !== null ? 'no result' : alone.red ? 'red' : 'green', load1: load[0], load5: load[1], load15: load[2], log: alone.log, report: alone.report, lock: alone.lock })
      if (alone.noResult !== null) {
        log(`${file} gave no result when run alone: ${alone.noResult} (log ${String(alone.log)})`)
        noResultAlone.push({ file, said: alone.noResult })
      } else if (alone.red) redAlone.push({ file, report: alone.report })
    }
    // THE WHOLE SUITE'S GREEN-ALONE FILES, after any the related tests already named on their own tree. Only the suite's
    // own files read their failure lines from the suite's runs; one the related tests named keeps what it carries.
    const namedBeforeTheSuite = changedTheirAnswer
    const withTheSuitesLines = (named) => [...namedBeforeTheSuite, ...withTheirFailureLines(named.slice(namedBeforeTheSuite.length), facts.red, suite.run.outFile)]
    changedTheirAnswer = withTheSuitesLines(filesThatChangedTheirAnswer(theRerunsOn(tree, facts.red, unfinished), [], commitOfTree, namedBeforeTheSuite))
    if (redAlone.length > 0 || noResultAlone.length > 0) {
      const moved = await movedWhileTesting('after its red files were run again alone, before they were compared with main')
      if (moved !== null) return moved
    }
    if (noResultAlone.length > 0) {
      fail(`${String(noResultAlone.length)} of the ${String(read.failed.length)} test file(s) red in the whole suite gave no result when run again alone, so nothing says whether they fail with this entry: ${eachWithWhatItSaid(noResultAlone)}. ${NOT_RED}`)
    }
    // A FILE RED ALONE IS COMPARED WITH MAIN, test by test (acceptance finding 18).
    const compared = redAlone.length === 0 ? [] : await comparedWithMain(sandbox, root, integrated.M, scripts, redAlone, tree)
    // A FILE THE PAIR CLEARED BECAUSE A TEST PASSED WITH THE ENTRY CHANGED ITS ANSWER TOO.
    changedTheirAnswer = withTheSuitesLines(filesThatChangedTheirAnswer(theRerunsOn(tree, facts.red, unfinished), compared.map((one) => ({ ...one, tree })), commitOfTree, namedBeforeTheSuite))
    const noResultOnMain = compared.filter((one) => one.noResult !== null)
    if (noResultOnMain.length > 0) {
      fail(`${String(noResultOnMain.length)} test file(s) red alone with this entry could not be compared with main ${integrated.M.slice(0, 12)}, because a run the comparison needs gave no result: ${eachWithWhatItSaid(noResultOnMain.map(({ file, noResult }) => ({ file, said: noResult })))}. So nothing says whether they fail only with this entry. ${NOT_RED}`)
    }
    facts.redOnMainToo = compared.filter((one) => one.onMainToo).map(({ file, mainLog, failing, measuredBy }) => ({ file, mainAt: integrated.M, log: mainLog, failing, measuredBy }))
    // A FILE THE PAIR OF RUNS CLEARED is not this entry's either (finding 81), and is said with the pair's times and loads.
    facts.clearedByThePair = compared.filter((one) => one.clearedByThePair).map(({ file, pair: runs, why }) => ({ file, pair: runs, why }))
    let stillRed = compared.filter((one) => !one.onMainToo && !one.clearedByThePair)
    // A FILE RED ONLY HERE IS ASKED ABOUT ON MODAL before the entry bounces for it (the second-opinion rule).
    const second = await theSecondOpinion(tree, integrated.M, stillRed)
    stillRed = second.kept
    facts.loadTimeouts = second.cleared
    facts.compared = compared
    facts.changedTheirAnswer = changedTheirAnswer
    const suiteCode = suite.run.code
    facts.green = suiteCode === 0 ? true : stillRed.length === 0 && read.failed.length > 0
    if (suiteCode !== 0 && read.failed.length === 0) facts.green = false
    // WHOSE A FILE STILL RED IN A BUS'S SUITE IS: each is run alone on the bus's trees in landing order until the entry
    // that broke it is found, and the bus's facts carry what was decided for each rider (the bus rule).
    let pairSays = ''
    if (pair.b !== undefined) {
      const meaningful = !(suiteCode !== 0 && read.failed.length === 0)
      const decided = await whatTheBusDecides({ sandbox, root, integrated, reports, bus: pair, stillRed: stillRed.map((one) => one.file), build, meaningful, runInSandbox, keepTheReport })
      facts.build = { passed: decided.aloneBuilt }
      facts.testedWith = decided.testedWith
      facts.pairDecided = decided.detail
      facts.busCause = observedBusCause(entry, integrated, pair, decided.detail, git)
      if (stillRed.length > 0) {
        facts.green = decided.theseRed.length === 0 && decided.aloneBuilt
        stillRed = stillRed.filter((one) => decided.theseRed.includes(one.file))
      }
      pairSays = ` ${decided.says}`
    } else {
      pairSays = await aCollisionNaming(entry, stillRed.map((one) => one.file), { theLane })
    }
    facts.stillRed = stillRed.map((one) => one.file)
    // RED ONLY WITH THIS ENTRY, on its own tree and not a bus's, as in the related tests above.
    if (!facts.green && pair.b === undefined && stillRed.length > 0) facts.redOnlyWithIt = facts.stillRed
    const reruns = facts.red.map((one) => theRerunSaid(one, 'the suite', suite.lock)).join('; ')
    const exitSays = theWorkerExitSaid('the suite', unfinished)
    const onMain = facts.redOnMainToo.map((one) => one.file)
    const mainSays =
      onMain.length === 0
        ? ''
        : ` ${String(onMain.length)} file(s) were red alone, and every test failing in them fails on main ${integrated.M.slice(0, 12)} alone too, run in the same sandbox or read back from an earlier entry's run on that main, so they are not this entry's doing: ${onMain.join(', ')}.`
    const clearedSays =
      facts.clearedByThePair.length === 0
        ? ''
        : ` ${String(facts.clearedByThePair.length)} file(s) were red alone and are not this entry's doing: ${facts.clearedByThePair.map((one) => `${one.file} (${one.why})`).join('; ')}.`
    const carriedSays = carrying
      ? ` ${String(carried.files.length)} test files, with ${String(carried.tests.total)} tests, passed in the related tests just before, on the same tree, and were not run again in the whole suite: their result is counted from that run (log ${carried.log}).`
      : ''
    const ranAt = suite.run.where === 'box' ? 'on the cloud box' : `in sandbox ${sandbox.name}`
    const where = pair.b === undefined ? ranAt : `${ranAt}, run once for this entry and ${busWords()} together on the ${pair.riders.length === 1 ? "pair's" : "bus's"} tree ${pair.tree.slice(0, 12)}`
    facts.says =
      (facts.green
        ? read.failed.length === 0
          ? `npm test was green ${where}: ${String(facts.files.passed)} files passed.`
          : facts.clearedByThePair.length === 0 && facts.loadTimeouts.length === 0
            ? `npm test had ${theFilesThatDidNotPass(read.failed.length, unfinished)} ${where}, and no test in them fails with this entry that main does not fail as well; the run passes. ${reruns}.${exitSays}${mainSays}`
            : `npm test had ${theFilesThatDidNotPass(read.failed.length, unfinished)} ${where}, and none of them is held against this entry; the run passes. ${reruns}.${exitSays}${mainSays}${clearedSays}`
        : stillRed.length > 0
          ? `${String(stillRed.length)} file(s) fail with this entry in a way main does not: ${stillRed.map((one) => `${one.file} (${one.why})`).join('; ')}. ${reruns}.${exitSays}${mainSays}${clearedSays}`
          : `npm test exited ${String(suiteCode)} ${where} and its report names no red file, so the run is red.`) +
      second.says +
      carriedSays +
      pairSays
    if (relatedOnly === null && (suiteCode !== 0 || read.failed.length > 0)) await countAGateMet('whole-suite-fix-round', fixRound ? '1' : '0')
    if (fixRound && (suiteCode !== 0 || read.failed.length > 0)) {
      // Retain the suite's actual red even when reruns or the bus clear this entry's blame.
      facts.green = false
      facts.stillRed = read.failed
      // A FIX ROUND'S RED IS THE WHOLE SUITE'S, not only this entry's, so none is named as red only with it.
      delete facts.redOnlyWithIt
      const complete = carrying ? null : completeOriginalTestRun(suite.run, suite.kept, tree)
      if (complete !== null && ownEvidence?.affected !== undefined && exactEntryTree()) {
        facts.wholeSuiteRed = {
          outcome: 'admitted-for-fix-round', ...ownEvidence,
          suite: { source: 'original', tip: git(tree, ['rev-parse', 'HEAD']), tree: git(tree, ['rev-parse', 'HEAD^{tree}']), complete: true, exit: suiteCode, ran: complete.ran, passed: complete.passed, redTests: complete.redTests, log: suite.run.outFile, report: suite.kept },
        }
        facts.says = `The original whole suite was red. The original build and complete affected selection passed on the exact entry tree; the entry is admitted for a fix round.${pairSays}`
      } else facts.says = 'The whole suite was red, and complete original evidence does not authorize a fix-round admission.'
    }
    // A FILE RED ON MAIN ALONE BELONGS TO NO ENTRY, and goes to the build sheriff (decision, item 4): the
    // office files a problem for each one not already open, and tells the secretary. The entry is not moved by it.
    if (facts.redOnMainToo.length > 0) {
      await step('red-on-main', { mainAt: integrated.M, files: theRedOnMainFiles(facts.redOnMainToo) }, { redOnMainToo: facts.redOnMainToo })
    }
    return await report()
  } finally {
    await releaseSeat(slot)
  }
}

/**
 * THE RELATED TESTS OF A TREE'S CHANGE FROM MAIN, as `node tools/run-named-tests.mjs --list related` works them out
 * (wave 13j, with the whole-tree list and its quarter bound), from this tool's own checkout. `files` are absolute
 * paths, which the command names relative to the tree (theTestWords); `files` is null when the list was refused or
 * could not be worked out, and `says` is what the tool said either way. With atMostHalf, exit 3 distinguishes a wide
 * selection from an unavailable one, and RELATED_TESTS_FACTS supplies pre-omission counts and the slow files without
 * parsing prose.
 *
 * A FILE SLOWER THAN `slowerThan` SECONDS IS LEFT OUT (round 17c), by the longest time run-named-tests finds for it.
 * It reads those times from this tool's suite reports too: every entry's work folder sits in the folder above this
 * one's, and keeps its suites' reports there.
 */
function theRelatedList(tree, base, slowerThan, { atMostHalf = false } = {}) {
  if (slowerThan !== null && (!Number.isInteger(slowerThan) || slowerThan < 1)) fail(`The office's related-tests-first setting is on and gives ${JSON.stringify(slowerThan)} as its bound, which is not a whole number of seconds. ${NOT_RED}`)
  const bound = slowerThan === null ? [] : ['--leave-out-slower-than', String(slowerThan), '--times', dirname(WORKDIR)]
  checkBeforeATool(tree)
  const ran = spawnSync(process.execPath, [join(THIS_CHECKOUT, 'tools', 'run-named-tests.mjs'), '--list', 'related', '--print', '--root', tree, '--base', base, ...bound, ...(atMostHalf ? ['--at-most-half'] : [])], {
    cwd: tree,
    env: theStableToolsEnvironment(),
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  })
  const lines = `${ran.stderr ?? ''}`.split('\n').map(line => line.trim()).filter(line => line !== '')
  const prefix = 'RELATED_TESTS_FACTS '
  let counts = null
  if (atMostHalf) {
    try {
      counts = JSON.parse(lines.find(line => line.startsWith(prefix))?.slice(prefix.length))
      if (!Number.isInteger(counts.related) || counts.related < 1 || !Number.isInteger(counts.every) || counts.every < counts.related || !Array.isArray(counts.leftOutSlow) || counts.leftOutSlow.some(one => typeof one.file !== 'string' || !Number.isFinite(one.seconds) || one.seconds < 0)) counts = null
    } catch { counts = null }
  }
  const said = lines.filter(line => !atMostHalf || !line.startsWith(prefix)).join(' ')
  if (ran.error !== undefined || ran.status !== 0) {
    const how = ran.error !== undefined ? `could not be started (${ran.error.message})` : ran.status === 2 ? 'refused it' : `exited ${String(ran.status ?? ran.signal)}`
    return { files: null, overHalf: atMostHalf && ran.error === undefined && ran.status === 3, says: `run-named-tests ${how}: ${said || 'it said nothing'}` }
  }
  const files = ran.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  if (files.length === 0) return { files: null, says: `run-named-tests listed no file: ${said || 'it said nothing'}` }
  if (atMostHalf && (counts === null || counts.related !== files.length + counts.leftOutSlow.length)) return { files: null, says: relatedOnlyWords('noFacts', { reason: said || 'it said nothing' }) }
  return { files, says: said, ...(atMostHalf ? { counts } : {}) }
}

/**
 * WHAT THE SUITE READ, from every process's lines and the floor of what the code names, kept under each tree given. A
 * file read is kept as a file; a folder listed, or given to a program, reads everything under it. The floor is the files
 * the code names and the folders it names below the top level. Says
 * what was kept, for the step's detail.
 */
function keepWhatTheSuiteRead(readsFolder, cwd, trees) {
  const files = new Set()
  const folders = new Set()
  // A LISTING SEES NAMES, NOT CONTENTS (the measurement of 23 September): kept apart, it counts only for a path an
  // entry adds, deletes or renames.
  const listed = new Set()
  const listedWhole = new Set()
  // THE PROGRAMS LET THROUGH AS READING NOTHING because they named no path, with how many processes each.
  const namedNoPath = new Map()
  // A PROCESS MAY WRITE TWO FILES, its own and its imports' (`<name>-imports.txt`), on a Node without registerHooks or
  // from a tree whose recorder is older, so a process is counted by its name.
  const names = new Set()
  for (const name of existsSync(readsFolder) ? readdirSync(readsFolder) : []) {
    names.add(name.replace(/-imports\.txt$/u, '').replace(/\.txt$/u, ''))
    for (const line of readFileSync(join(readsFolder, name), 'utf8').split('\n')) {
      const kind = line.slice(0, 1)
      const path = line.slice(2)
      if (path === '' || !['R', 'L', 'C', 'T', 'N'].includes(kind)) continue
      if (kind === 'N') namedNoPath.set(path, (namedNoPath.get(path) ?? 0) + 1)
      else if (kind === 'L') listed.add(path)
      else if (kind === 'T') listedWhole.add(path)
      else if (kind === 'R') files.add(path)
      else {
        let isAFolder = false
        try {
          isAFolder = statSync(join(cwd, path)).isDirectory()
        } catch {
          isAFolder = false
        }
        ;(isAFolder ? folders : files).add(path)
      }
    }
  }
  const processes = names.size
  checkBeforeATool(cwd)
  const floor = whatTheCodeNames(cwd)
  for (const file of floor.files) files.add(file)
  for (const folder of floor.folders) if (folder.includes('/')) folders.add(folder)
  const letThrough = Object.fromEntries([...namedNoPath.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
  const kept = { files: [...files].sort(), folders: [...folders].sort(), listed: [...listed].sort(), listedWhole: [...listedWhole].sort(), namedNoPath: letThrough, processes, floor: { files: floor.files.length, folders: floor.folders.filter((one) => one.includes('/')).length }, entry: chosen.entry, at: stamp() }
  for (const tree of trees) {
    mkdirSync(dirname(theReadsFile(tree)), { recursive: true })
    writeFileSync(theReadsFile(tree), JSON.stringify({ tree, ...kept }, null, 1))
  }
  log(`the suite read ${String(kept.files.length)} files and the contents of ${String(kept.folders.length)} folders, and listed ${String(kept.listed.length)} folders (${String(processes)} processes recorded, floor included); kept for tree ${trees.join(', ')}`)
  const through = Object.entries(letThrough)
  if (through.length > 0) log(`counted as reading nothing because they named no path: ${through.map(([program, count]) => `${program} (${String(count)})`).join(', ')}`)
  return { trees, files: kept.files.length, folders: kept.folders.length, listed: kept.listed.length, processes }
}

/** The door to the cloud box, which runs the whole suite there (cloud-suite-door.mjs). */
const THE_CLOUD_SUITE_DOOR = join(THIS_CHECKOUT, 'tools', 'cloud-suite.mjs')

/** Files grouped by what their runs said, for one sentence: "a, b: <said>; c: <said>". */
function eachWithWhatItSaid(runs) {
  const files = new Map()
  for (const { file, said } of runs) files.set(said, [...(files.get(said) ?? []), file])
  return [...files.entries()].map(([said, named]) => `${named.join(', ')}: ${said}`).join('; ')
}

/** The name a file's own failure goes by, when it failed with no failed test: it did not load, or a hook threw. */
const THE_FILE_ITSELF = '(the file itself: it did not load, or a hook failed)'

/**
 * THE TESTS A VITEST JSON REPORT SAYS FAILED, by full name, or null when there is no readable report.
 * A file that failed with no failed test adds THE_FILE_ITSELF.
 */
function failedTestsIn(reportFile) {
  if (!existsSync(reportFile)) return null
  let report
  try {
    report = JSON.parse(readFileSync(reportFile, 'utf8'))
  } catch {
    return null
  }
  const failed = new Set()
  for (const file of Array.isArray(report.testResults) ? report.testResults : []) {
    const names = (Array.isArray(file.assertionResults) ? file.assertionResults : [])
      .filter((one) => one.status === 'failed')
      .map((one) => String(one.fullName ?? one.title))
    for (const name of names) failed.add(name)
    if (file.status !== 'passed' && names.length === 0) failed.add(THE_FILE_ITSELF)
  }
  return failed
}

/**
 * The name a run's own failure goes by, when vitest ended it red and its report names no failed test and no failed
 * file. A test that never finished, as when the worker running it died, leaves its tests pending in a file called
 * passed; an error thrown outside any test leaves every test passed. Both exit 1 (measured with vitest 4.1.10, wave 13y
 * round 54).
 */
const THE_RUN_ITSELF = '(the run itself: vitest failed with no failed test named, so a test did not finish or an error came from outside any test)'

/**
 * THE TESTS ONE RED OR GREEN RUN FAILED, by full name, or null when there is no readable report: `failedTestsIn`, and
 * THE_RUN_ITSELF when the run was red and that names nothing. So a red run never fails an empty list of tests. An empty
 * list is contained in every other, and a file red alone with this entry was counted as failing on main too, with
 * main's own run of it green (wave 13y round 54).
 */
function failingOf(reportFile, red) {
  const failed = failedTestsIn(reportFile)
  if (failed !== null && red && failed.size === 0) failed.add(THE_RUN_ITSELF)
  return failed
}

/**
 * MAIN'S OWN RESULT FOR ONE TEST FILE, KEPT PER MAIN COMMIT. Item 5 of 23 September 2026 (the queue's
 * speed): every entry compared its red files with main by running them
 * alone on main, about four minutes an entry, although main had not moved between entries. So a file's
 * failing tests on main M are kept under M, beside every entry's workdir, and a later entry on the same M
 * reads them back. A result counts only for its own main commit and its own file; a result for another
 * commit, or one that cannot be read, counts for nothing and main is run again.
 */
function mainsResultFile(M, file) {
  return join(dirname(chosen.workdir), 'main-alone', M, `${createHash('sha256').update(file).digest('hex').slice(0, 32)}.json`)
}

/** Main's kept result for this file at this commit, or null. */
function theKnownResultOnMain(M, file) {
  try {
    const known = JSON.parse(readFileSync(mainsResultFile(M, file), 'utf8'))
    return known?.mainAt === M && known?.file === file && Array.isArray(known.failing) ? known : null
  } catch {
    return null
  }
}

/** Keeps main's result for this file at this commit, with the entry that measured it and its log. */
function keepTheResultOnMain(M, file, failing, log) {
  const at = mainsResultFile(M, file)
  mkdirSync(dirname(at), { recursive: true })
  writeFileSync(at, JSON.stringify({ mainAt: M, file, failing: [...failing].sort(), log, measuredBy: chosen.entry, at: stamp() }, null, 2))
}

/**
 * EACH FILE RED ALONE, COMPARED WITH THAT FILE ALONE ON MAIN AT M. Main's result is read back when an earlier
 * entry on the same M kept it; otherwise the file is run alone on main in the same sandbox, in a clone of its
 * own at <folder>/work/main, built first, and the result is kept for the next entry. Main is cloned and built
 * only when some file needs a run on main. A test that fails on main as well, by a kept result or a run, is not
 * the entry's.
 *
 * THE ENTRY IS BLAMED ONLY ON A PAIR OF RUNS MADE ONE STRAIGHT AFTER THE OTHER (finding 81, block f-81 of the report).
 * On 25 September 2026 an entry was blamed for two files that timed out with it at a load of
 * 35 to 38 and passed on main two minutes later at a load near 24. So a test that failed with the entry and not on
 * main is run again as a pair: the file alone on main, and straight after, alone with the entry on `tree`, with the
 * time and the 1-minute load written beside each. When main's result was just run for this file, that run is the
 * pair's first half; a result kept from another time is never one, so main is run again. The entry is blamed for a
 * test only when, in the pair, it fails with the entry and passes on main. A file the pair clears is
 * `clearedByThePair`. The pair's run on main is kept, as any run on main is: a kept result only ever clears.
 *
 * Answers, per file: `onMainToo`, `clearedByThePair`, the failing tests, the pair, which entry measured main,
 * and why. A file main does not have is red. A run on main or of the pair that gave no result — main's build did
 * not succeed, or a run left no readable report naming the file — is neither red nor green: its `noResult` says
 * why, and the caller stops the tool (finding 80).
 */
async function comparedWithMain(sandbox, root, M, scripts, redAlone, tree) {
  const mainClone = join(sandbox.folder, 'work', 'main')
  const reports = join(sandbox.folder, 'work', 'reports')
  const known = new Map(redAlone.map(({ file }) => [file, theKnownResultOnMain(M, file)]))
  // MAIN IS CLONED AND BUILT ONCE, the first time a file needs a run on main.
  let mainBuilt = null
  const mainIsReady = async () => {
    if (mainBuilt !== null) return mainBuilt
    mainBuilt = { ok: true, says: null }
    if (!existsSync(mainClone) || tryGit(mainClone, ['rev-parse', '--verify', 'HEAD^{commit}']).stdout !== M) {
      rmSync(mainClone, { recursive: true, force: true })
      git(root, ['clone', '--quiet', '--shared', '--no-checkout', root, mainClone])
      git(mainClone, ['checkout', '--quiet', '--detach', M])
      linkNodeModules(root, mainClone)
      log(`main as it stood at ${M} is checked out at ${mainClone}, to compare the files red alone with`)
    }
    if (typeof scripts.build === 'string' && typeof packageScripts(mainClone).build === 'string') {
      const build = await runInSandbox(sandbox, 'main-build', 'npm', ['run', 'build'], { cwd: mainClone, timeoutMs: SCRIPT_TIMEOUT_MS })
      if (build.code !== 0) mainBuilt = { ok: false, says: `main's own npm run build did not succeed (log ${build.outFile}): ${whatTheRunSaid(build)}; so main's tests did not run` }
    }
    return mainBuilt
  }
  // WHETHER MAIN CAN RUN THIS FILE: a file main does not have is red, and main's build not succeeding is no result.
  const mainCanRun = async (one) => {
    const built = await mainIsReady()
    if (!existsSync(join(mainClone, one.file))) {
      one.why = 'main has no such file: it comes with this entry'
      return false
    }
    if (!built.ok) {
      one.noResult = built.says
      return false
    }
    return true
  }
  const out = []
  for (const [index, { file, report }] of redAlone.entries()) {
    const n = String(index + 1)
    // runAlone answered a result for every file given here, so its report is readable and names the file, and that
    // result was red.
    const withTheEntry = failingOf(report, true)
    if (withTheEntry === null) fail(`The report of ${file} run alone with this entry (${report}) was readable when it was written and is not now, so it cannot be compared with main.`)
    const one = { file, onMainToo: false, clearedByThePair: false, failing: [...withTheEntry].sort(), onMain: null, mainLog: null, measuredBy: null, pair: null, why: '', noResult: null }
    out.push(one)
    const remembered = known.get(file)
    // THE RUN ON MAIN THAT CAN BE THE PAIR'S FIRST HALF: one made here, for this file, with nothing run since.
    let mainRun = null
    let onMain
    if (remembered !== null) {
      onMain = new Set(remembered.failing)
      one.mainLog = remembered.log
      one.measuredBy = remembered.measuredBy
    } else {
      if (!(await mainCanRun(one))) continue
      mainRun = await aRunAloneOnMain(sandbox, mainClone, reports, file, `main-rerun-${n}`)
      one.mainLog = mainRun.log
      if (mainRun.noResult !== null) {
        one.noResult = mainRun.noResult
        continue
      }
      onMain = mainRun.failing
      keepTheResultOnMain(M, file, onMain, mainRun.log)
      one.measuredBy = chosen.entry
    }
    one.onMain = [...onMain].sort()
    const onlyWithTheEntry = [...withTheEntry].filter((test) => !onMain.has(test)).sort()
    if (onlyWithTheEntry.length === 0) {
      const whose = remembered === null ? '' : ` (main's result read back from entry ${String(remembered.measuredBy)}'s run on the same main)`
      one.onMainToo = true
      one.why = `every failing test fails on main ${M.slice(0, 12)} too${whose}`
      continue
    }
    // THE PAIR: main alone, then at once this entry alone.
    if (mainRun === null) {
      if (!(await mainCanRun(one))) continue
      mainRun = await aRunAloneOnMain(sandbox, mainClone, reports, file, `pair-main-${n}`)
      if (mainRun.noResult !== null) {
        one.noResult = `in the pair, ${mainRun.noResult}`
        continue
      }
      keepTheResultOnMain(M, file, mainRun.failing, mainRun.log)
      one.mainLog = mainRun.log
      one.measuredBy = chosen.entry
    }
    const entryAt = { at: stamp(), load1: theLoadNow() }
    const entryRun = await runAlone(sandbox, tree, file, `pair-entry-${n}`, reports, { noResult: 'answer', runInSandbox, keepTheReport })
    if (entryRun.noResult !== null) {
      one.noResult = `in the pair, its run alone with this entry gave no result: ${entryRun.noResult} (log ${String(entryRun.log)})`
      continue
    }
    const withTheEntryInThePair = failingOf(entryRun.report, entryRun.red)
    const blamed = onlyWithTheEntry.filter((test) => withTheEntryInThePair.has(test) && !mainRun.failing.has(test))
    one.pair = {
      main: { at: mainRun.at, load1: mainRun.load1, log: mainRun.log, failing: [...mainRun.failing].sort() },
      entry: { at: entryAt.at, load1: entryAt.load1, log: entryRun.log, failing: [...withTheEntryInThePair].sort() },
    }
    const thePair = `in a pair of runs one straight after the other, on main at ${mainRun.at} (1-minute load ${String(mainRun.load1)}) and with this entry at ${entryAt.at} (1-minute load ${String(entryAt.load1)})`
    log(`${file}, ${thePair}: failing on main ${JSON.stringify(one.pair.main.failing)}, failing with this entry ${JSON.stringify(one.pair.entry.failing)}`)
    if (blamed.length > 0) {
      one.why = `${String(blamed.length)} test(s) fail only with this entry: ${blamed.slice(0, 5).join(' | ')}${blamed.length > 5 ? ' | …' : ''} (${thePair})`
    } else {
      one.clearedByThePair = true
      const passedWithIt = onlyWithTheEntry.filter((test) => !withTheEntryInThePair.has(test))
      const failedOnMain = onlyWithTheEntry.filter((test) => withTheEntryInThePair.has(test))
      // KEPT ON THE CLEARED ROW, so the files that changed their answer can be named from them (wave 13u round 51).
      one.passedWithIt = passedWithIt
      one.failedOnMain = failedOnMain
      one.why =
        `no test fails only with this entry ${thePair}` +
        (passedWithIt.length === 0 ? '' : `; passed with this entry there: ${passedWithIt.slice(0, 5).join(' | ')}${passedWithIt.length > 5 ? ' | …' : ''}`) +
        (failedOnMain.length === 0 ? '' : `; failed on main there too: ${failedOnMain.slice(0, 5).join(' | ')}${failedOnMain.length > 5 ? ' | …' : ''}`)
    }
  }
  return out
}

/** The machine's 1-minute load average now, to two places. */
function theLoadNow() {
  return Math.round(loadavg()[0] * 100) / 100
}

/**
 * ONE TEST FILE RUN ALONE ON MAIN'S CLONE, with the time and the 1-minute load as it started. Answers the failing
 * tests, or `noResult` with the reason when the run left no readable report naming the file.
 */
async function aRunAloneOnMain(sandbox, mainClone, reports, file, label) {
  const at = stamp()
  const load1 = theLoadNow()
  const name = `${label}.json`
  const written = join(reports, name)
  rmSync(written, { force: true })
  const run = await runInSandbox(sandbox, label, 'npm', ['test', '--', '--no-file-parallelism', '--reporter=default', '--reporter=json', `--outputFile.json=${written}`, file], {
    cwd: mainClone,
    singleFile: file,
  })
  const kept = keepTheReport(written, name)
  const why = noResultIn(kept, mainClone, file, run)
  if (why !== null) return { at, load1, log: run.outFile, failing: null, noResult: `its run alone on main gave no result: ${why} (log ${run.outFile}); ${whatTheRunSaid(run)}` }
  return { at, load1, log: run.outFile, failing: failingOf(kept, !aGreenRun(run, redFilesIn(kept, mainClone))), noResult: null }
}

/** Whether `inner` is `outer` or somewhere below it. */
function within(inner, outer) {
  const rel = relative(resolve(outer), resolve(inner))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))
}
