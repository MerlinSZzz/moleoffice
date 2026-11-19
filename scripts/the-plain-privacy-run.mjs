// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * Run the plain privacy files against the checkout an installer is built from.
 * The packagers call this before bundling: two privacy files start the bundle themselves,
 * so calling this inside the bundle would start a loop.
 *
 * The report and the child's own home are made under work, in a fresh folder per call.
 * The packagers remove work in their finally blocks, including this folder and its contents.
 * A test caller removes its own work folder. This module never exits the process.
 *
 * THE BROWSER. A file that imports playwright needs a browser. Playwright looks for one where
 * PLAYWRIGHT_BROWSERS_PATH says, and otherwise under the home, and the child's home here is a fresh
 * folder that never holds one. So the child gets PLAYWRIGHT_BROWSERS_PATH=0 when this process sets
 * none: Playwright then looks in the checkout's own node_modules, as the Mac build does
 * (scripts/the-mac-build.mjs), and nothing is written there. A folder this process names is kept.
 * Before the runner starts, the browser is started once and closed, the way such a file starts it; when
 * it cannot start, nothing runs and the refusal says how to install one.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { thePlainPrivacyFiles } from '../src/shared/the-plain-privacy-files.ts'

/** An import of playwright, or of a part of it, in a file's text. */
const AN_IMPORT_OF_PLAYWRIGHT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]playwright(?:\/[^'"]*)?['"]/

/** What Node is given, with PLAYWRIGHT_BROWSERS_PATH=0, to install a browser where the child looks when this process names no folder. */
export const THE_BROWSER_INSTALL_ARGUMENTS = Object.freeze(['node_modules/playwright/cli.js', 'install', 'chromium'])

/** The command that installs a browser where the child looks when this process names no folder. */
export const THE_BROWSER_INSTALL = `PLAYWRIGHT_BROWSERS_PATH=0 node ${THE_BROWSER_INSTALL_ARGUMENTS.join(' ')}`

/** Starts the browser once and closes it, the way a plain privacy file starts it, from the checkout's playwright. */
const THE_BROWSER_START = [
  "const { chromium } = require(require.resolve('playwright', { paths: [process.cwd()] }))",
  'chromium.launch().then((browser) => browser.close()).then(',
  '  () => process.exit(0),',
  '  (error) => { process.stderr.write(String(error instanceof Error ? error.message : error)); process.exit(1) },',
  ')',
].join('\n')

/** @typedef {{ file: string, firstFailedCase: string }} RedFile */
/** @typedef {{ file: string, reason: string }} NoResult */
/** @typedef {{ status?: string, fullName?: string, title?: string }} CaseResult */
/** @typedef {{ name?: string, status?: string, assertionResults?: CaseResult[] }} FileResult */

/**
 * One vitest invocation, with every file accounted for by both its report and its exit code.
 * Red files and files without a result are returned for the caller to refuse by name.
 * Missing inputs, and a browser that a file needs and that cannot start, throw before the runner starts.
 * @param {{ root: string, work: string, say: (line: string) => void, vitest?: string }} options
 * @returns {{ files: string[], red: RedFile[], noResult: NoResult[], report: string }}
 */
export function runThePlainPrivacyFiles({ root, work, say, vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs') }) {
  const list = join(root, 'tests', 'house-rules.mjs')
  const files = thePlainPrivacyFiles(existsSync(list) ? readFileSync(list, 'utf8') : null)
  const absent = files.filter(file => !existsSync(join(root, file)) || !statSync(join(root, file)).isFile())
  if (absent.length > 0) throw new Error(`The plain privacy files ${absent.join(', ')} are not files on disk, so no privacy file ran.`)

  const folder = mkdtempSync(join(work, 'plain-privacy-'))
  const home = join(folder, 'home')
  const report = join(folder, 'report.json')
  mkdirSync(home)
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (name.startsWith('MOLE_OFFICE_') || name === 'MOLE_AGENT_KEY') delete env[name]
  }
  env.HOME = home
  if (!env.PLAYWRIGHT_BROWSERS_PATH) env.PLAYWRIGHT_BROWSERS_PATH = '0'
  const needABrowser = files.filter(file => AN_IMPORT_OF_PLAYWRIGHT.test(readFileSync(join(root, file), 'utf8')))
  if (needABrowser.length > 0) {
    const started = spawnSync(process.execPath, ['-e', THE_BROWSER_START], { cwd: root, env, encoding: 'utf8', timeout: 120_000 })
    if (started.status !== 0) {
      const words = (started.stderr ?? '').trim()
      const missing = /Executable doesn't exist at (\S+)/.exec(words)
      const why = missing !== null
        ? `no browser is installed where the run will look (${missing[1]})`
        : `the browser could not be started (${started.error?.message ?? (words.split(/\r?\n/).slice(0, 4).join(' ').slice(0, 400) || `exit ${String(started.status)}`)})`
      const which = needABrowser.length === 1 ? `file ${needABrowser[0]} needs` : `files ${needABrowser.join(', ')} need`
      const named = env.PLAYWRIGHT_BROWSERS_PATH === '0' ? '' : ` PLAYWRIGHT_BROWSERS_PATH names ${env.PLAYWRIGHT_BROWSERS_PATH} now, so build with it unset or 0.`
      throw new Error(`The plain privacy ${which} a browser, and ${why}, so no privacy file ran. Install one with: ${THE_BROWSER_INSTALL}.${named}`)
    }
    say(`A browser starts for ${needABrowser.join(', ')} (PLAYWRIGHT_BROWSERS_PATH=${env.PLAYWRIGHT_BROWSERS_PATH}).`)
  }
  const ran = spawnSync(process.execPath, [
    vitest, 'run', '--root', root, '--no-file-parallelism', '--reporter=json', `--outputFile=${report}`,
    ...files.map(file => resolve(root, file)),
  ], { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })

  /** @type {FileResult[]} */
  let results = []
  let reportProblem = ''
  try {
    const read = /** @type {{ testResults?: FileResult[] } | null} */ (JSON.parse(readFileSync(report, 'utf8')))
    if (!Array.isArray(read?.testResults)) reportProblem = `The report ${report} has no file results.`
    else results = read.testResults
  } catch (error) {
    reportProblem = `The report ${report} is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`
  }
  if (reportProblem !== '') {
    const words = ((ran.stderr ?? '').trim() || (ran.stdout ?? '').trim()).split(/\r?\n/).slice(-4).join(' ').slice(-400)
    if (words !== '') reportProblem += ` Runner's words: ${words}`
  }

  /** @type {RedFile[]} */
  const red = []
  /** @type {Map<string, string>} */
  const missing = new Map()
  for (const file of files) {
    const named = results.filter(row => typeof row?.name === 'string' && resolve(root, row.name) === resolve(root, file))
    if (reportProblem !== '') {
      missing.set(file, reportProblem)
      continue
    }
    if (named.length !== 1) {
      missing.set(file, `The report ${report} does not name ${file} exactly once.`)
      continue
    }
    const row = /** @type {FileResult} */ (named[0])
    const cases = Array.isArray(row.assertionResults) ? row.assertionResults : []
    const failed = cases.find(test => test?.status === 'failed')
    if (failed !== undefined) {
      red.push({ file, firstFailedCase: failed.fullName ?? failed.title ?? 'an unnamed failed case' })
    } else if (cases.length === 0 || !cases.some(test => test?.status === 'passed')) {
      missing.set(file, `The report ${report} gives ${file} no loaded case result.`)
    } else if (row.status !== 'passed') {
      missing.set(file, `The report ${report} gives ${file} no complete passed result.`)
    }
  }

  // The exit code is a second answer. A disagreement invalidates every apparent pass;
  // known red cases remain red, and are also named among the files with no reliable result.
  if (ran.status === null || ran.error !== undefined || (ran.status === 0) !== (red.length === 0)) {
    const reason = `The runner exit ${String(ran.status)} disagrees with ${red.length} red files or is missing${ran.error ? `: ${ran.error.message}` : ''}.`
    for (const file of files) missing.set(file, [missing.get(file), reason].filter(Boolean).join(' '))
  }
  const noResult = [...missing].map(([file, reason]) => ({ file, reason }))
  for (const file of files) {
    const failed = red.find(item => item.file === file)
    const reason = missing.get(file)
    if (reason !== undefined) say(`no result: ${file}: ${reason}${failed ? ` Red: ${failed.firstFailedCase}.` : ''}`)
    else if (failed !== undefined) say(`red: ${file}: ${failed.firstFailedCase}`)
    else say(`passed: ${file}`)
  }
  const passed = files.filter(file => !missing.has(file) && !red.some(item => item.file === file)).length
  say(`Plain privacy files: ${passed} passed, ${red.length} red, ${noResult.length} no result.`)
  return { files, red, noResult, report }
}
