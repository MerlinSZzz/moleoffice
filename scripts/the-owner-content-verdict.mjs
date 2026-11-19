// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE READER FOR THE HOST SCREEN'S OWNER-CONTENT VERDICT, AND WHAT IT LETS A PACKAGE BUILD PACK.
 *
 * The owner's content list never reaches a build of a line's commit. A whole-tree screen on the host
 * holds the list, screens the commit that will be packed, and writes one JSON file. A package script
 * names that file with --owner-content-verdict, and this module reads and judges it for all of them.
 *
 * THE FILE is one JSON object with exactly these five keys:
 *   - commit: 40 lower-case hex characters, the commit the screen read;
 *   - tree: 40 lower-case hex characters, that commit's tree;
 *   - madeAt: local wall-clock time, YYYY-MM-DD HH:MM:SS;
 *   - screen: a non-empty string, the screen's own words for what screened it;
 *   - found: an array of findings, and [] when the screen found nothing.
 *
 * THE REFUSALS, each in the words the build prints, and it packs nothing:
 *   - the file is missing or cannot be read, or is not JSON;
 *   - the object does not have that shape, and the refusal names the key that is wrong;
 *   - found is not empty, and the refusal says how many findings there are and prints each one;
 *   - the checkout is not a git checkout, or git status --porcelain shows a change or an untracked file;
 *   - tree is not the checkout's own git rev-parse HEAD^{tree}.
 *
 * THE TREE DECIDES, NOT THE COMMIT. A commit that differs from HEAD goes on when the tree is the same,
 * and the log names both commits. The build does not judge how old madeAt is, and prints it.
 *
 * WITH AN ACCEPTED VERDICT the build still runs every plain privacy file. A red file still refuses. A
 * file with no result is let through only when every one of its cases was taken out because the owner's
 * list was not read. tests/the-owners-content-list.ts writes that reason into a case's meta as
 * takenOutWithoutTheOwnersContent, and vitest's JSON report writes the meta, so the test is exact and
 * needs no owner's list.
 *
 * IN THE CLEAN VERSION, with no verdict, the build judges by the same test. A checkout that carries the
 * clean version's mark and is not the clean version is refused first (scripts/the-clean-version-mark.mjs).
 * In the clean version no list of the owner's content is read, so the screen that needs it is not
 * repeated; a red file still refuses, and the log names every file whose missing result it covered.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { runThePlainPrivacyFiles } from './the-plain-privacy-run.mjs'
import { isTheCleanVersion, THE_CLEAN_VERSION_MARK, whyThisIsNotTheCleanVersion } from './the-clean-version-mark.mjs'

/** The file's five keys, and no others. */
const THE_KEYS = ['commit', 'tree', 'madeAt', 'screen', 'found']

/** A commit or a tree: exactly 40 lower-case hex characters. */
const FORTY_LOWER_HEX = /^[0-9a-f]{40}$/

/** Local wall-clock time, YYYY-MM-DD HH:MM:SS. How old it is is not judged. */
const LOCAL_WALL_CLOCK = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

/**
 * @typedef {{ commit: string, tree: string, madeAt: string, screen: string, found: unknown[] }} TheVerdict
 * @typedef {{ name?: unknown, assertionResults?: unknown }} AFileResult
 * @typedef {{ status?: unknown, meta?: unknown }} ACaseResult
 */

/** One refusal from the reader, or the verdict it accepted with the commit at HEAD. */
/**
 * @typedef {{ refused: string, verdict: null, headCommit: null }
 *   | { refused: null, verdict: TheVerdict, headCommit: string }} AVerdictReading
 */

/** One refusal from the step, or what it let through. */
/**
 * @typedef {{ refused: string, privacy: ReturnType<typeof runThePlainPrivacyFiles> | null, covered: string[] }
 *   | { refused: null, privacy: ReturnType<typeof runThePlainPrivacyFiles>, covered: string[] }} AStepAnswer
 */

/** A value as a refusal writes it: JSON when JSON gives it words, and its JavaScript form otherwise. */
/** @param {unknown} value */
function said(value) {
  const text = JSON.stringify(value)
  return text === undefined ? String(value) : text
}

/** @param {string} refused @returns {AVerdictReading} */
function verdictRefused(refused) {
  return { refused, verdict: null, headCommit: null }
}

/**
 * What is wrong with the parsed object, in the words the build prints, or null when it has the shape.
 * @param {unknown} value
 * @param {string} path
 * @returns {string | null}
 */
function whatIsWrongWithTheVerdict(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `The owner-content verdict at ${path} is not one JSON object, so nothing was packed.`
  }
  const object = /** @type {Record<string, unknown>} */ (value)
  const keys = Object.keys(object)
  for (const key of THE_KEYS) {
    if (!keys.includes(key)) return `The owner-content verdict at ${path} has no key ${key}, so nothing was packed.`
  }
  const extra = keys.filter((key) => !THE_KEYS.includes(key))
  if (extra.length > 0) {
    return `The owner-content verdict at ${path} has the key ${extra.join(', ')}, which is not one of the five keys commit, tree, madeAt, screen and found, so nothing was packed.`
  }
  const commit = object['commit']
  if (typeof commit !== 'string' || !FORTY_LOWER_HEX.test(commit)) {
    return `The owner-content verdict at ${path} has commit ${said(commit)}, and the key commit must be 40 lower-case hex characters, so nothing was packed.`
  }
  const tree = object['tree']
  if (typeof tree !== 'string' || !FORTY_LOWER_HEX.test(tree)) {
    return `The owner-content verdict at ${path} has tree ${said(tree)}, and the key tree must be 40 lower-case hex characters, so nothing was packed.`
  }
  const madeAt = object['madeAt']
  if (typeof madeAt !== 'string' || !LOCAL_WALL_CLOCK.test(madeAt)) {
    return `The owner-content verdict at ${path} has madeAt ${said(madeAt)}, and the key madeAt must be local wall-clock time, YYYY-MM-DD HH:MM:SS, so nothing was packed.`
  }
  const screen = object['screen']
  if (typeof screen !== 'string' || screen.trim() === '') {
    return `The owner-content verdict at ${path} has screen ${said(screen)}, and the key screen must be a non-empty string naming what screened the tree, so nothing was packed.`
  }
  const found = object['found']
  if (!Array.isArray(found)) {
    return `The owner-content verdict at ${path} has found ${said(found)}, and the key found must be an array, so nothing was packed.`
  }
  if (found.length > 0) {
    const findings = found.map((finding, index) => `  ${String(index + 1)}. ${typeof finding === 'string' ? finding : said(finding)}`)
    return `The owner-content verdict at ${path} found ${String(found.length)} finding${found.length === 1 ? '' : 's'}, so nothing was packed:\n${findings.join('\n')}`
  }
  return null
}

/** What one git command answered, and why it did not answer when it did not. */
/** @typedef {{ ok: true, out: string } | { ok: false, why: string }} AGitAnswer */

/**
 * Ask git one question in a folder, without a shell.
 * @param {string} root
 * @param {string[]} args
 * @returns {AGitAnswer}
 */
function askGit(root, args) {
  const ran = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 60_000 })
  if (ran.error !== undefined) return { ok: false, why: ran.error.message }
  if (ran.status !== 0) {
    const said = `${ran.stderr ?? ''}${ran.stdout ?? ''}`.trim()
    return { ok: false, why: said === '' ? `git exited ${String(ran.status)}` : said }
  }
  return { ok: true, out: (ran.stdout ?? '').trim() }
}

/**
 * Read and judge the verdict file against a checkout. The tree decides, not the commit.
 * @param {{ root: string, path: string }} options
 * @returns {AVerdictReading}
 */
export function readTheOwnerContentVerdict({ root, path }) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const code = /** @type {NodeJS.ErrnoException} */ (error).code ?? 'an error with no code'
    return verdictRefused(`The owner-content verdict at ${path} could not be read (${code}), so nothing was packed.`)
  }
  /** @type {unknown} */
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    return verdictRefused(`The owner-content verdict at ${path} is not JSON (${error instanceof Error ? error.message : String(error)}), so nothing was packed.`)
  }
  const wrong = whatIsWrongWithTheVerdict(value, path)
  if (wrong !== null) return verdictRefused(wrong)
  const verdict = /** @type {TheVerdict} */ (value)

  const inside = askGit(root, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || inside.out !== 'true') {
    return verdictRefused(`The checkout ${root} is not a git checkout, so the verdict cannot be checked against the tree it would pack, and nothing was packed.`)
  }
  const status = askGit(root, ['status', '--porcelain'])
  if (!status.ok) {
    return verdictRefused(`The checkout ${root} could not be read with git status (${status.why}), so nothing was packed.`)
  }
  if (status.out !== '') {
    const lines = status.out.split('\n').map((line) => `  ${line}`).join('\n')
    return verdictRefused(`The checkout ${root} has changes or untracked files, so the verdict does not name what would be packed, and nothing was packed:\n${lines}`)
  }
  const head = askGit(root, ['rev-parse', 'HEAD'])
  const headTree = askGit(root, ['rev-parse', 'HEAD^{tree}'])
  if (!head.ok || !headTree.ok) {
    return verdictRefused(`The checkout ${root} has no commit at HEAD, so there is no tree to compare the verdict with, and nothing was packed.`)
  }
  if (headTree.out !== verdict.tree) {
    return verdictRefused(
      `The owner-content verdict is for tree ${verdict.tree} (commit ${verdict.commit}), and the checkout's HEAD tree is ${headTree.out} (commit ${head.out}), so the tree that would be packed is not the tree that was screened, and nothing was packed.`,
    )
  }
  return { refused: null, verdict, headCommit: head.out }
}

/** One plain privacy file's report row, or null when the value is not a row. */
/** @param {unknown} value @returns {AFileResult | null} */
function asAFileResult(value) {
  return typeof value === 'object' && value !== null ? /** @type {AFileResult} */ (value) : null
}

/** One case's report row, or an empty row when the value is not one. */
/** @param {unknown} value @returns {ACaseResult} */
function asACaseResult(value) {
  return typeof value === 'object' && value !== null ? /** @type {ACaseResult} */ (value) : {}
}

/** The report's file rows, or why it could not be read. */
/**
 * @param {string} path
 * @returns {{ refused: string, results: AFileResult[] } | { refused: null, results: AFileResult[] }}
 */
function readAPrivacyReport(path) {
  /** @type {unknown} */
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return { refused: `The report ${path} could not be read (${error instanceof Error ? error.message : String(error)}).`, results: [] }
  }
  if (typeof value !== 'object' || value === null || !Array.isArray(/** @type {{ testResults?: unknown }} */ (value).testResults)) {
    return { refused: `The report ${path} has no file results.`, results: [] }
  }
  const rows = /** @type {{ testResults: unknown[] }} */ (value).testResults.map(asAFileResult).filter((row) => row !== null)
  return { refused: null, results: rows }
}

/**
 * Why the report does not show that every case of this file was taken out because the owner's list was
 * not read, or null when it does. This is the exact test the verdict lets a missing result through by.
 * @param {string} file
 * @param {AFileResult[]} results
 * @param {string} root
 * @returns {string | null}
 */
function whatTheReportSaysAbout(file, results, root) {
  const named = results.filter((row) => typeof row.name === 'string' && resolve(row.name) === resolve(root, file))
  if (named.length !== 1) return `the report does not name ${file} exactly once.`
  const row = named[0]
  if (row === undefined) return `the report does not name ${file} exactly once.`
  const cases = Array.isArray(row.assertionResults) ? row.assertionResults : []
  if (cases.length === 0) return 'the report gives it no case at all.'
  const notSkipped = cases.map(asACaseResult).filter((one) => one.status !== 'skipped')
  if (notSkipped.length > 0) return `${String(notSkipped.length)} of its ${String(cases.length)} cases were not taken out.`
  const notTheOwnerList = cases.map(asACaseResult).filter((one) => {
    const meta = typeof one.meta === 'object' && one.meta !== null ? /** @type {Record<string, unknown>} */ (one.meta) : {}
    return meta['takenOutWithoutTheOwnersContent'] !== true
  })
  if (notTheOwnerList.length > 0) return `${String(notTheOwnerList.length)} of its ${String(cases.length)} cases were not taken out because the owner's list was not read.`
  return null
}

/**
 * Run the plain privacy files after judging the verdict, and refuse what the verdict does not let through.
 *
 * With no verdict path this is what every package script did before: every red file and every file with
 * no result refuses the build. With an accepted verdict, a red file still refuses, and a file with no
 * result is let through only when every one of its cases was taken out because the owner's list was not
 * read. The log names the verdict and every file whose missing result it covered. With no verdict
 * path in the clean version, the same: the log says the tree is the clean version instead.
 *
 * `run` is the privacy runner, and a test gives a stand-in here instead of starting vitest.
 * `ownersContent` is what was read of the owner's list, this process's reading when not given.
 *
 * @param {{ root: string, work: string, say: (line: string) => void, verdictPath: string | null, run?: typeof runThePlainPrivacyFiles, ownersContent?: { content: unknown } }} options
 * @returns {AStepAnswer}
 */
export function runTheOwnerContentStep({ root, work, say, verdictPath, run = runThePlainPrivacyFiles, ownersContent }) {
  const notTheCleanVersion = whyThisIsNotTheCleanVersion(root, ownersContent)
  if (notTheCleanVersion !== null) return { refused: notTheCleanVersion, privacy: null, covered: [] }
  const inTheCleanVersion = verdictPath === null && isTheCleanVersion(root)
  /** @type {TheVerdict | null} */
  let verdict = null
  /** @type {string | null} */
  let headCommit = null
  if (verdictPath !== null) {
    const reading = readTheOwnerContentVerdict({ root, path: verdictPath })
    if (reading.refused !== null) return { refused: reading.refused, privacy: null, covered: [] }
    verdict = reading.verdict
    headCommit = reading.headCommit
  }

  const privacy = run({ root, work, say })
  if (verdict === null && !inTheCleanVersion) {
    const refusedFiles = [...new Set([...privacy.red, ...privacy.noResult].map((item) => item.file))]
    if (refusedFiles.length > 0) {
      return { refused: `The plain privacy files are red or gave no result in ${refusedFiles.join(', ')}, so nothing was packed.`, privacy, covered: [] }
    }
    return { refused: null, privacy, covered: [] }
  }

  const coveredBy = verdict === null ? 'the clean version' : 'the owner-content verdict'
  if (privacy.red.length > 0) {
    const red = privacy.red.map((item) => `${item.file} (${item.firstFailedCase})`).join(', ')
    return { refused: `The plain privacy files are red in ${red}, so nothing was packed, even ${verdict === null ? 'in' : 'with'} ${coveredBy}.`, privacy, covered: [] }
  }
  /** @type {string[]} */
  const covered = []
  if (privacy.noResult.length > 0) {
    const report = readAPrivacyReport(privacy.report)
    for (const item of privacy.noResult) {
      const wrong = report.refused !== null ? report.refused : whatTheReportSaysAbout(item.file, report.results, root)
      if (wrong !== null) {
        return {
          refused: `The plain privacy files gave no result in ${item.file} (${item.reason}), and ${coveredBy} does not cover it: ${wrong} Nothing was packed.`,
          privacy,
          covered: [],
        }
      }
      covered.push(item.file)
    }
  }

  if (verdict === null) {
    say(
      `This checkout is the clean version: it carries the mark ${THE_CLEAN_VERSION_MARK}, has no design/ folder, and no list of the owner's content was read, ` +
        "so the screen for the owner's content was not repeated.",
    )
  } else {
    const head =
      verdict.commit === headCommit
        ? `The checkout's HEAD is the same commit, ${String(headCommit)}.`
        : `The checkout's HEAD is ${String(headCommit)}, and its tree is the same ${verdict.tree}.`
    say(`The owner-content verdict was used: commit ${verdict.commit}, tree ${verdict.tree}, madeAt ${verdict.madeAt}, screen ${JSON.stringify(verdict.screen)}. ${head}`)
  }
  say(covered.length === 0 ? 'It covered no missing result.' : `It covered the missing result in ${covered.join(', ')}.`)
  return { refused: null, privacy, covered }
}
