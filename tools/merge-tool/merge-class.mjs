// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Observations only: the tool reads no feature-red gate, count or registry. */
import './a-library-is-not-a-program.mjs'
import { DATABASE_FOLDERS, classifyRedMerge, readMainHouseRules } from '../../src/shared/merge-class.ts'

/** A package with no build script already answers code 0: it counts as a passed build. */
export const buildFact = built => ({ passed: built.code === 0 })

export function mergeClassAtResult(integrated, redTests, build, git, changedBetween = (clone, from, to) => git(clone, ['diff', '--no-renames', '--name-only', '-z', from, to]).split('\0').filter(Boolean), green = false) {
  const house = readMainHouseRules(integrated.M, redTests, args => git(integrated.clone, args))
  const list = house.list.state === 'read' ? new Map(house.files.filter(one => one.class !== undefined).map(({ file, ...rule }) => [file, rule])) : null
  const redFiles = redTests.filter(file => { try { return git(integrated.clone, ['cat-file', '-t', `${integrated.Cfinal}:${file}`]).trim() === 'blob' } catch { return false } })
  let databasePaths = null, pathsProblem
  try { databasePaths = changedBetween(integrated.clone, integrated.M, integrated.Cfinal).filter(path => DATABASE_FOLDERS.some(folder => path.startsWith(folder))) }
  catch (error) { pathsProblem = error instanceof Error ? error.message : String(error) }
  const reading = classifyRedMerge({ redTests, list, redFiles, build: build?.passed, databasePaths, pathsProblem })
  return { ...reading, ...(green ? { green: true } : {}), mainAt: integrated.M, build: build?.passed, databasePaths }
}

export function mergeClassLogLine(facts, repair) {
  const expectation = facts.green === true ? 'green (no red class)' : facts.expectation ?? `class ${facts.class}${facts.class === 3 ? ` (${facts.reason})` : ''}`
  return `MERGE-CLASS: feature files (${facts.featureFiles.length}): ${facts.featureFiles.join(', ') || 'none'}; build ${facts.build === true ? 'passed' : facts.build === false ? 'failed' : 'not reported'}; database paths: ${facts.databasePaths === null ? 'unreadable' : facts.databasePaths.join(', ') || 'none'}; expects ${expectation}.${repair === undefined ? '' : ` Repair named-file runs took ${repair.seconds.toFixed(3)} seconds.`} The office decides by its own settings.`
}

/** No result alone has not passed. The caller supplies the existing one-file runner unchanged. */
export async function repairFiles(entry, run, clock = Date.now) {
  if (entry.repairOf === undefined) return undefined
  const start = clock(), files = []
  for (const [index, file] of entry.repairOf.files.entries()) {
    const result = await run(file, index)
    files.push({ file, passed: result.absent !== true && result.noResult === null && result.red === false })
  }
  return { fact: { problem: entry.repairOf.problem, files }, seconds: (clock() - start) / 1000 }
}
