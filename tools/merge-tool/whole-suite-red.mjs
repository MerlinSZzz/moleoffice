// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read original command reports for the dormant queue gate; never make a release receipt. */
import './a-library-is-not-a-program.mjs'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'

/** A complete report must account for every assertion and have one result per named file. */
export function completeOriginalTestRun(run, report, tree, selected = null) {
  if (run.error !== undefined || run.timedOut || ![0, 1].includes(run.code)) return null
  let read
  try { read = JSON.parse(readFileSync(report, 'utf8')) } catch { return null }
  const files = read.testResults
  if (!Array.isArray(files) || files.length === 0 || files.some(one => typeof one.name !== 'string' || !['passed', 'failed'].includes(one.status) || !Array.isArray(one.assertionResults))) return null
  const names = files.map(one => relative(tree, one.name))
  if (new Set(names).size !== names.length || names.some(name => name === '' || name.startsWith('../'))) return null
  const assertions = files.flatMap(one => one.assertionResults)
  const counts = [read.numTotalTests, read.numPassedTests, read.numFailedTests, read.numPendingTests, read.numTodoTests]
  if (counts.some(n => !Number.isInteger(n) || n < 0) || counts[0] === 0 || counts[0] !== counts.slice(1).reduce((a, b) => a + b, 0) || assertions.length !== counts[0]) return null
  const count = status => assertions.filter(one => one.status === status).length
  if (count('passed') !== counts[1] || count('failed') !== counts[2] || count('pending') + count('skipped') !== counts[3] || count('todo') !== counts[4]) return null
  if (selected !== null) {
    const wanted = selected.map(file => relative(tree, file))
    if (wanted.length === 0 || wanted.length !== names.length || wanted.some(file => !names.includes(file))) return null
    if (run.code !== 0 || read.success !== true || counts[0] !== counts[1] || files.some(one => one.status !== 'passed')) return null
  } else if (run.code !== 1 || read.success !== false || !files.some(one => one.status === 'failed')) return null
  return { ran: counts[0], passed: counts[1], files: names, redTests: files.filter(one => one.status === 'failed').map(one => relative(tree, one.name)) }
}

/** Preserve the bisector's original indices beside the exact prefix each index names. */
export function observedBusCause(entry, integrated, bus, pairDecided, git) {
  const prefixes = [{ entry: entry.id, commit: integrated.Cfinal, clone: integrated.clone }, ...bus.riders.map(one => ({ entry: one.b.id, commit: one.T, clone: bus.clone }))]
  let before = integrated.M
  const order = prefixes.map(one => {
    const commits = git(one.clone, ['rev-list', '--reverse', `${before}..${one.commit}`]).split('\n').filter(Boolean)
    before = one.commit
    return { entry: one.entry, commit: one.commit, tree: git(one.clone, ['rev-parse', `${one.commit}^{tree}`]), commits }
  })
  return { mainAt: integrated.M, suite: { commit: bus.T, tree: bus.tree }, order, pairDecided }
}
