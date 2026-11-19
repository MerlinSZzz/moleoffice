// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NAMED TEST FILE RESULTS AND THE CATCH RULE, read by the toolset file door.
 * The order (wave 13n round C): flaky, test changed, mutation proof, then catch.
 * Earlier rows on runs represented in the window supply context; only window rows count.
 */
import { medianOf } from '@shared/median.ts'
import { THE_TEST_FILES_TOOL, type TestFileResult } from '@shared/toolset.ts'
import { sqlite } from '../db/client.ts'

interface FileRow {
  use: string
  run: string
  seq: number
  at: string
  file: string
  result: TestFileResult
  seconds: number | null
  hash: string | null
  commit: string | null
  change: string | null
}
interface Side { seq: number; at: string; commit: string; change: string }
interface FileReading {
  file: string
  runs: number
  reds: number
  catches: number
  flaky: number
  testChanged: number
  mutationProofs: number
  notComparable: number
  medianSeconds: number | null
  secondsKnown: number
  caught: { run: string; red: Side; green: Side }[]
}

/** Read stored observations without requiring a catalogue record for the named-tests tool. Writes nothing. */
export function readTestFileCatches(input: { workspaceId: string; from: string; to: string }) {
  const { workspaceId, from, to } = input
  const start = `${from} 00:00:00`
  const end = `${to} 00:00:00`
  const linesStoredSince = (sqlite.prepare(`
    SELECT min(u.at) AS at FROM tool_uses u JOIN test_file_runs f ON f.use_id = u.id
    WHERE u.workspace_id = ? AND f.workspace_id = ? AND u.tool = ?
  `).get(workspaceId, workspaceId, THE_TEST_FILES_TOOL) as { at: string | null }).at
  const rows = sqlite.prepare(`
    WITH window_runs AS (
      SELECT DISTINCT u.run_id FROM tool_uses u JOIN test_file_runs f ON f.use_id = u.id
      WHERE u.workspace_id = ? AND f.workspace_id = ? AND u.tool = ? AND u.at >= ? AND u.at < ?
    )
    SELECT u.id AS use, u.run_id AS run, u.seq, u.at, f.file, f.result, f.seconds,
      f.test_file_hash AS hash, f.tree_commit AS "commit", f.tree_change AS change
    FROM tool_uses u JOIN test_file_runs f ON f.use_id = u.id
    JOIN window_runs w ON w.run_id = u.run_id
    WHERE u.workspace_id = ? AND f.workspace_id = ? AND u.tool = ? AND u.at < ?
    ORDER BY u.at, u.seq, u.run_id, f.file
  `).all(workspaceId, workspaceId, THE_TEST_FILES_TOOL, start, end, workspaceId, workspaceId, THE_TEST_FILES_TOOL, end) as FileRow[]

  const files = new Map<string, FileReading>()
  const seconds = new Map<string, number[]>()
  const runs = new Set<string>()
  const uses = new Set<string>()
  let windowRows = 0
  // One last open red suffices: a green closes every open red and pairs with only the last.
  const reds = new Map<string, { row: FileRow; order: number }>()
  const greens = new Map<string, Map<string, number>>()
  const side = (row: FileRow): Side => ({ seq: row.seq, at: row.at, commit: row.commit!, change: row.change! })
  for (const [order, row] of rows.entries()) {
    const inWindow = row.at >= start && row.at < end
    let file = files.get(row.file)
    if (inWindow) {
      if (file === undefined) {
        file = { file: row.file, runs: 0, reds: 0, catches: 0, flaky: 0, testChanged: 0, mutationProofs: 0, notComparable: 0, medianSeconds: null, secondsKnown: 0, caught: [] }
        files.set(row.file, file)
        seconds.set(row.file, [])
      }
      runs.add(row.run)
      uses.add(row.use)
      windowRows++
      file.runs++
      if (row.result === 'failed') file.reds++
      if ((row.result === 'passed' || row.result === 'failed') && row.seconds !== null) seconds.get(row.file)!.push(row.seconds)
    }
    if (row.result === 'no result') continue
    if (row.hash === null || row.commit === null || row.change === null) {
      if (inWindow) file!.notComparable++
      continue
    }
    const scope = JSON.stringify([row.run, row.file])
    const tree = JSON.stringify([row.commit, row.change])
    if (row.result === 'failed') {
      reds.set(scope, { row, order })
      continue
    }
    const red = reds.get(scope)
    if (red !== undefined) {
      reds.delete(scope)
      if (inWindow) {
        if (row.commit === red.row.commit && row.change === red.row.change) file!.flaky++
        else if (row.hash !== red.row.hash) file!.testChanged++
        else if ((greens.get(scope)?.get(tree) ?? Infinity) < red.order) file!.mutationProofs++
        else {
          file!.catches++
          file!.caught.push({ run: row.run, red: side(red.row), green: side(row) })
        }
      }
    }
    let prior = greens.get(scope)
    if (prior === undefined) { prior = new Map(); greens.set(scope, prior) }
    if (!prior.has(tree)) prior.set(tree, order)
  }
  for (const file of files.values()) {
    const known = seconds.get(file.file)!
    file.medianSeconds = medianOf(known)
    file.secondsKnown = known.length
  }
  return {
    workspaceId, from, to, linesStoredSince,
    read: { runs: runs.size, uses: uses.size, rows: windowRows },
    files: [...files.values()].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0),
  }
}
