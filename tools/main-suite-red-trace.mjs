// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Bounded attribution of original main-suite reds. Tests inject runAlone; importing this module starts nothing. */
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { aPassedFile } from './a-passed-test-file.mjs'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const hash = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
const safeFile = value => typeof value === 'string' && value.startsWith('tests/') && value.endsWith('.test.ts') && !/[\\\0]/.test(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
const cap = (value, most) => Number.isSafeInteger(value) && value > 0 ? Math.min(value, most) : most
const dataOf = receipt => object(receipt?.data) ? receipt.data : null
/** A reason with one more sentence after it. */
const andThen = (reason, more) => reason ? `${reason}${/[.!?]$/.test(reason) ? '' : '.'} ${more}` : more

/** Reserve before starting a run, so even an interrupted call consumes the same receipt's bounded allowance. */
function reserveAloneRun(identity, workdir, file, mostRuns) {
  mkdirSync(workdir, { recursive: true })
  const path = join(workdir, `trace-budget-${createHash('sha256').update(identity.receipt).digest('hex')}.json`)
  const named = JSON.stringify(identity)
  let budget = { identity: named, counts: {} }
  if (existsSync(path)) {
    try { budget = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error('The tracing run budget is unreadable; its remaining allowance is unknown.') }
    if (!object(budget) || budget.identity !== named || !object(budget.counts)) throw new Error('The tracing run budget names different receipt facts; its remaining allowance is unknown.')
  }
  const reserved = budget.counts[file] ?? 0
  if (!Number.isSafeInteger(reserved) || reserved < 0) throw new Error('The tracing run count is unreadable; its remaining allowance is unknown.')
  if (reserved >= mostRuns) throw new Error(`the ${mostRuns} runs-alone limit was reached, including earlier tracing attempts`)
  budget.counts[file] = reserved + 1
  const next = `${path}.${randomUUID()}.new`
  writeFileSync(next, `${JSON.stringify(budget)}\n`, { flag: 'wx', mode: 0o600 })
  renameSync(next, path)
}

async function ask(officeRequest, method, path, body) {
  const reply = await officeRequest({ method, path, ...(body === undefined ? {} : { body }) })
  if (!object(reply) || reply.cut !== false || reply.location != null) throw new Error('The office reply was cut, redirected or unavailable.')
  let value
  try { value = typeof reply.body === 'string' ? JSON.parse(reply.body) : reply.body } catch { throw new Error('The office reply was unreadable.') }
  if (!object(value)) throw new Error('The office reply named no result.')
  if (reply.status < 200 || reply.status >= 300) throw new Error(`The office refused (${reply.status}): ${value.error ?? 'no reason was given'}`)
  return value
}

const A_GAP = 'The landing range has a gap; no landing covers it.'
const PUSH_HAND_BACK = '/api/merge-queue/emergency-pushes/hand-back-from-the-main-suite'

/** A page of this range that names its gaps. An emergency push moves main with no landing, so it leaves a gap. */
const namesAGap = (page, repository, from, to) => page.repository === repository && page.from === from && page.to === to &&
  Array.isArray(page.landings) && page.landings.length <= 200 && Array.isArray(page.gaps) && page.gaps.length > 0

/** The emergency pushes a page of this range lists, each with the files it changed, as the push door reads them. */
function pushesOf(page, repository, from, to) {
  const readable = push => object(push) && typeof push.id === 'string' && push.id !== '' && Array.isArray(push.files) && push.files.every(file => typeof file === 'string')
  if (page.repository !== repository || page.from !== from || page.to !== to || !Array.isArray(page.pushes) || !page.pushes.every(readable)) throw new Error('The landing range was unidentified, or did not list its emergency pushes.')
  return page.pushes
}

function boundariesOf(page, repository, from, to) {
  if (page.repository !== repository || page.from !== from || page.to !== to || !Array.isArray(page.landings) || page.landings.length === 0 || page.landings.length > 200 || !Array.isArray(page.gaps)) throw new Error('The landing range was unidentified, empty or unbounded.')
  if (page.tiled !== true || page.gaps.length > 0) throw new Error(A_GAP)
  let last = from
  const ids = new Set(), commits = [from]
  for (const landing of page.landings) {
    if (!object(landing) || typeof landing.id !== 'string' || !landing.id || ids.has(landing.id) || landing.mainBefore !== last || !hash(landing.mainAfter) || commits.includes(landing.mainAfter)) throw new Error('The landing boundaries have a gap, overlap or unreadable entry.')
    ids.add(landing.id); last = landing.mainAfter; commits.push(last)
  }
  if (last !== to) throw new Error('The landing boundaries have a gap at the receipt commit.')
  return commits
}

/**
 * receipt and previousReceipt are original create records {id,data}; the job obtains both through original revisions.
 * Limits include confirming runs. Known endpoints come from the receipts; unvisited boundaries are disclosed.
 */
export async function traceMainSuiteReds({ receipt, previousReceipt, repository, workdir, officeRequest, runAlone, limits = {} }) {
  const current = dataOf(receipt), previous = dataOf(previousReceipt)
  const files = [], groups = new Map(), askable = []
  const mostFiles = cap(limits.files, 5), mostRuns = cap(limits.runs, 8)
  let attempted = 0, rangePromise
  const theRange = () => rangePromise ??= ask(officeRequest, 'GET', `/api/merge-queue/landed-between?repository=${encodeURIComponent(repository)}&from=${previous.commit}&to=${current.commit}`)
  const runner = runAlone ?? makeMainSuiteAloneRunner({ repository, workdir })
  for (const file of current?.failedFiles ?? []) {
    const result = { file, status: 'not traced', runs: [], unvisited: [] }
    files.push(result)
    if (current.version === 2 && current.aloneRuns?.find(one => one.file === file)?.outcome !== 'red') {
      const outcome = current.aloneRuns?.find(one => one.file === file)?.outcome ?? 'no result'
      result.reason = `whole-run red, ${outcome} alone; not traced`; continue
    }
    if (previous === null) { result.reason = 'no earlier receipt'; continue }
    if (previous.repository !== repository || !Array.isArray(previous.failedFiles) || !hash(previous.commit)) { result.reason = 'no earlier receipt with observed failures for this repository'; continue }
    if (previous.failedFiles.includes(file)) { result.reason = `red since at least ${previousReceipt.id}`; continue }
    // A FILE THAT GETS THIS FAR may be asked of the emergency pushes, past the file limit as well.
    if (current.repository === repository && hash(current.commit) && typeof receipt.id === 'string' && safeFile(file)) askable.push(result)
    if (attempted >= mostFiles) { result.reason = `the ${mostFiles} file limit was reached`; continue }
    attempted++
    try {
      if (current.repository !== repository || !hash(current.commit) || typeof receipt.id !== 'string' || !safeFile(file)) throw new Error('The receipt, repository or failed file is unreadable.')
      const page = await theRange()
      if (namesAGap(page, repository, previous.commit, current.commit)) throw new Error(A_GAP)
      const boundaries = boundariesOf(page, repository, previous.commit, current.commit)
      const observed = new Map([[0, 'green'], [boundaries.length - 1, 'red']]), cached = new Map()
      const sample = async (index, again = false) => {
        if (!again && cached.has(index)) return cached.get(index)
        reserveAloneRun({ receipt: receipt.id, repository, from: previous.commit, to: current.commit, previousReceipt: previousReceipt.id, files: current.failedFiles }, workdir, file, mostRuns)
        const ran = await runner({ commit: boundaries[index], file })
        result.runs.push({ commit: boundaries[index], ...ran, confirmation: again })
        result.unvisited = boundaries.filter(commit => !result.runs.some(run => run.commit === commit))
        if (!object(ran) || !['green', 'red'].includes(ran.outcome)) throw new Error(`no result at ${boundaries[index]}`)
        if (!Number.isInteger(ran.exit) || ran.exit < 0 || ran.exit > 255 || typeof ran.log !== 'string' || !ran.log || (ran.outcome === 'green' ? ran.exit !== 0 : ran.exit === 0)) throw new Error(`no result: inconsistent exit or missing log at ${boundaries[index]}`)
        if (observed.has(index) && observed.get(index) !== ran.outcome) throw new Error(`not monotone: the answer changed at ${boundaries[index]}`)
        observed.set(index, ran.outcome)
        let red = false
        for (const [, outcome] of [...observed].sort(([a], [b]) => a - b)) {
          if (red && outcome === 'green') throw new Error('not monotone: a red boundary precedes a green boundary')
          if (outcome === 'red') red = true
        }
        cached.set(index, ran); return ran
      }
      result.unvisited = [...boundaries]
      let lo = 0, hi = boundaries.length - 1
      while (hi - lo > 1) {
        const middle = Math.floor((lo + hi) / 2)
        const answer = await sample(middle)
        if (answer.outcome === 'green') lo = middle; else hi = middle
      }
      // Both sides are actually observed, including when an endpoint was known only from a receipt.
      await sample(hi); await sample(lo)
      const withLanding = await sample(hi, true)
      const withoutLanding = await sample(lo, true)
      const landing = page.landings[hi - 1]
      const group = groups.get(landing.id) ?? { landing, results: [], with: [], without: [] }
      group.results.push(result); group.with.push(withLanding); group.without.push(withoutLanding)
      groups.set(landing.id, group)
      result.status = 'confirmed'
    } catch (error) {
      result.status = 'unknown'; result.reason = error instanceof Error ? error.message : String(error)
    }
  }
  for (const group of groups.values()) {
    const { landing, results } = group
    try {
      mkdirSync(workdir, { recursive: true })
      const prefix = join(workdir, `trace-${randomUUID()}`)
      const proof = side => {
        const log = `${prefix}-${side}.json`
        writeFileSync(log, `${JSON.stringify({ receipt: receipt.id, landing: landing.id, side, files: results.map((result, i) => ({ file: result.file, runs: result.runs, unvisited: result.unvisited, confirmingRun: group[side][i] })) }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
        return { commit: side === 'with' ? landing.mainAfter : landing.mainBefore, exit: side === 'with' ? group.with[0].exit : 0, log }
      }
      const body = { receipt: receipt.id, files: results.map(result => result.file), with: proof('with'), without: proof('without') }
      const answer = await ask(officeRequest, 'POST', `/api/merge-queue/${encodeURIComponent(landing.id)}/hand-back-from-the-main-suite`, body)
      if (typeof answer.problem !== 'string' || !answer.problem || !Array.isArray(answer.unnamedFiles)) throw new Error('The hand-back answer did not identify its problem and unnamed files.')
      for (const result of results) {
        result.landing = landing.id; result.problem = answer.problem
        result.status = answer.unnamedFiles.includes(result.file) ? 'not held' : 'traced'
        if (result.status === 'not held') result.reason = `existing problem ${answer.problem} does not name this file`
      }
    } catch (error) {
      for (const result of results) { result.status = 'refused'; result.landing = landing.id; result.reason = error instanceof Error ? error.message : String(error) }
    }
  }
  // A RED FILE AN EMERGENCY PUSH CHANGED IS ASKED OF THE PUSH DOOR once, wherever it sits in the range: in a gap, beside a
  // landing, or past the file limit. A file no push the page lists changed is not asked. The door hands each file a push
  // changed back to that push, and the file is traced to it; a file already traced keeps its trace, and the push is named.
  if (askable.length > 0) {
    let asked = []
    try {
      const pushes = pushesOf(await theRange(), repository, previous.commit, current.commit)
      asked = askable.filter(result => pushes.some(push => push.files.includes(result.file)))
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      for (const result of askable) result.reason = result.reason === why ? andThen(why, 'No emergency push was asked.') : andThen(result.reason, `No emergency push was asked: ${why}`)
    }
    if (asked.length > 0) {
      try {
        const answer = await ask(officeRequest, 'POST', PUSH_HAND_BACK, { receipt: receipt.id, files: asked.map(result => result.file) })
        const readable = one => object(one) && typeof one.push === 'string' && one.push !== '' && typeof one.problem === 'string' && one.problem !== '' && Array.isArray(one.files) && Array.isArray(one.unnamedFiles)
        if (!Array.isArray(answer.handedBack) || !answer.handedBack.every(readable) || !Array.isArray(answer.notThePushes)) throw new Error('The emergency push hand-back answer did not name its pushes, problems and files.')
        for (const handed of answer.handedBack) {
          for (const result of asked.filter(one => handed.files.includes(one.file))) {
            // A file traced to a landing, or to an earlier push, keeps that trace, and this push is named beside it.
            if (result.push !== undefined || result.landing !== undefined) { result.reason = andThen(result.reason, `Emergency push ${handed.push} changed it too, in problem ${handed.problem}.`); continue }
            result.push = handed.push; result.problem = handed.problem
            result.status = handed.unnamedFiles.includes(result.file) ? 'not held' : 'traced'
            result.reason = result.status === 'not held' ? `existing problem ${handed.problem} does not name this file` : `handed back to emergency push ${handed.push} in problem ${handed.problem}`
          }
        }
      } catch (error) {
        for (const result of asked) result.reason = andThen(result.reason, `The emergency pushes could not be asked: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return { receipt: receipt?.id, previousReceipt: previousReceipt?.id ?? null, files }
}

/** Production only: independent throwaway clone, dependencies linked from the repository, one exact named file. */
export function makeMainSuiteAloneRunner({ repository, workdir, timeoutSeconds = 590 }) {
  return async ({ commit, file }) => {
    if (!isAbsolute(repository) || !isAbsolute(workdir) || !hash(commit) || !safeFile(file)) return { outcome: 'no result', exit: 125, log: '', reason: 'invalid runner input' }
    const rel = relative(resolve(repository), resolve(workdir))
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) return { outcome: 'no result', exit: 125, log: '', reason: 'work directory is inside the repository' }
    mkdirSync(workdir, { recursive: true })
    const folder = mkdtempSync(join(workdir, 'alone-')), clone = join(folder, 'clone'), home = join(folder, 'home'), log = join(folder, 'run.log')
    mkdirSync(home)
    const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }
    let exit = 125
    try {
      const git = args => execFileSync('git', args, { encoding: 'utf8', env, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] })
      git(['clone', '--no-local', '--no-checkout', '--', repository, clone])
      git(['-C', clone, 'checkout', '--detach', commit])
      symlinkSync(join(repository, 'node_modules'), join(clone, 'node_modules'), 'dir')
      const fd = openSync(log, 'wx', 0o600)
      try {
        exit = await new Promise((resolveRun, reject) => {
          const child = spawn(process.execPath, [join(repository, 'tools/run-named-tests.mjs'), '--root', clone, file], { cwd: clone, env, detached: true, stdio: ['ignore', fd, fd] })
          const group = child.pid
          let timedOut = false, force
          const signal = how => { if (group !== undefined) { try { process.kill(-group, how) } catch (error) { if (error.code !== 'ESRCH') throw error } } }
          const timer = setTimeout(() => { timedOut = true; signal('SIGTERM'); force = setTimeout(() => signal('SIGKILL'), 5000) }, timeoutSeconds * 1000)
          child.once('error', error => { clearTimeout(timer); clearTimeout(force); reject(error) })
          child.once('close', (code, signal) => { clearTimeout(timer); clearTimeout(force); resolveRun(timedOut ? 124 : code ?? (signal === 'SIGTERM' ? 143 : 137)) })
        })
      } finally { closeSync(fd) }
      if ([124, 137, 143].includes(exit)) return { outcome: 'no result', exit, log }
      const logs = join(clone, '.logs')
      const reports = existsSync(logs) ? readdirSync(logs).filter(name => /^named-tests-.*\.json$/.test(name)) : []
      if (reports.length !== 1) return { outcome: 'no result', exit, log }
      const reportPath = join(logs, reports[0]), report = JSON.parse(readFileSync(reportPath, 'utf8'))
      copyFileSync(reportPath, join(folder, 'report.json'))
      const named = report.testResults?.filter(one => one.name === join(clone, file))
      if (!Array.isArray(named) || named.length !== 1 || report.testResults.length !== 1) return { outcome: 'no result', exit, log }
      return { outcome: exit === 0 && aPassedFile(named[0]) ? 'green' : 'red', exit, log }
    } catch (error) {
      writeFileSync(log, `${error instanceof Error ? error.message : String(error)}\n`, { flag: 'a', mode: 0o600 })
      return { outcome: 'no result', exit, log }
    } finally { rmSync(clone, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }) }
  }
}
