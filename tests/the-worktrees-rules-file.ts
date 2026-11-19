// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKTREE'S RULES FILE, READ BEFORE AND AFTER EVERY CASE, AND WHO WAS RUNNING WHEN IT CHANGED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A run started with the worktree as its folder writes AGENTS.md at the worktree's root, which git
 * ignores, so nothing else shows it (tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts says
 * how it happened). Until round 15 the gate held a digest of every test file measured not to write
 * it, and a change to any of those files turned the gate red until somebody ran the file alone again.
 * Round 15 measures the file itself instead, around every case of every test file:
 * tests/a-test-leaves-the-worktrees-rules-file-alone.ts reads it before the file's first case and
 * after each case, with the functions here, and fails the case after which it changed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A READING HOLDS, AND WHAT COUNTS AS A CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * A reading is one stat of the file: absent, or its size, its inode, its modification time and its
 * change time, to the nanosecond. Any difference between two readings is a change. The change time
 * cannot be set back by a program, so a write that puts the old modification time back is still seen.
 * The bytes are read only when the stat differs, to say whether the bytes changed too. The first
 * reading of a test file reads the bytes as well, so there is something to compare them with.
 *
 * ---------------------------------------------------------------------------------------
 * WHO WAS RUNNING, AND WHY ALL OF THEM ARE NAMED
 * ---------------------------------------------------------------------------------------
 *
 * The merge queue runs test files side by side, and a test file's process cannot see which of them
 * wrote the file. So every test process writes down its file's start and its end in one record per
 * run of vitest, tests/the-test-files-running-are-written-down.ts makes the record's folder, and a
 * failure names every test file that was running between the reading before and the reading after.
 * Every test file that was running then sees the same change and fails too. Each of them, run alone,
 * says whose it is: the writer fails alone and the others do not.
 *
 * NOTHING HERE WRITES THE RULES FILE. The only write is the line appended to the record, in the
 * record's own folder under the temporary directory.
 */

import { appendFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The folder of this run's record of which test files ran when, made by the global setup. */
    theTestFilesRunning: string
  }
}

/** The rules file at the root of the worktree these tests are in, which no test may write. */
export const THE_WORKTREES_RULES_FILE = fileURLToPath(new URL('../AGENTS.md', import.meta.url))

/** The record's one file inside its folder: one JSON line for each start and each end of a test file. */
export const THE_RECORD = 'test-files.jsonl'

/** One stat of the rules file. `bytes` is there only when the reading read them. */
export type AReading =
  | { readonly at: number; readonly absent: true }
  | {
      readonly at: number
      readonly absent: false
      readonly size: bigint
      readonly ino: bigint
      readonly mtimeNs: bigint
      readonly ctimeNs: bigint
      readonly bytes?: Buffer
    }

/** Reads the file at `path` with one stat, and its bytes as well when `withTheBytes` is true. */
export function readTheRulesFile(path: string, withTheBytes = false): AReading {
  const at = Date.now()
  const stat = statSync(path, { bigint: true, throwIfNoEntry: false })
  if (stat === undefined) return { at, absent: true }
  const reading = { at, absent: false as const, size: stat.size, ino: stat.ino, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs }
  return withTheBytes ? { ...reading, bytes: readFileSync(path) } : reading
}

/**
 * How the file changed between `before` and `after`, in words, or null when the two readings are the
 * same. When they differ and `before` holds its bytes, the bytes are read from `path` and compared.
 * Also returns the reading after, with its bytes when they were read, for the next comparison.
 */
export function howTheRulesFileChanged(before: AReading, after: AReading, path: string): { words: string; after: AReading } | null {
  if (before.absent && after.absent) return null
  if (!before.absent && !after.absent && before.size === after.size && before.ino === after.ino && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs) return null
  if (after.absent) return { words: `was there with ${String(before.absent ? 0 : before.size)} bytes, and is not there now`, after }
  const read = readTheRulesFile(path, true)
  const now = read.absent ? after : read
  if (before.absent) return { words: `was not there, and is there now with ${String(now.absent ? 0 : now.size)} bytes`, after: now }
  const bytesBefore = before.bytes
  const bytesNow = now.absent ? undefined : now.bytes
  if (bytesBefore === undefined || bytesNow === undefined) return { words: `was written: its stat changed, and its bytes before were not read`, after: now }
  if (bytesBefore.equals(bytesNow)) return { words: `was written again with the same ${String(bytesNow.length)} bytes`, after: now }
  return { words: `was written with other bytes: ${String(bytesBefore.length)} bytes before, ${String(bytesNow.length)} now`, after: now }
}

/** One line of the record: a test file's process started or ended, at a time in milliseconds. */
export interface AnEntry {
  readonly file: string
  readonly pid: number
  readonly is: 'start' | 'end'
  readonly at: number
}

/** Appends one line to the record in `folder`. This is the one write anything here makes. */
export function writeItDown(folder: string, entry: AnEntry): void {
  appendFileSync(join(folder, THE_RECORD), JSON.stringify(entry) + '\n')
}

/**
 * Every test file the record in `folder` says was running at any time from `from` to `to`, by name,
 * sorted. A file with a start and no end is read as still running, which is what a process killed
 * before its end looks like too.
 */
export function theTestFilesRunningBetween(folder: string, from: number, to: number): string[] {
  const lines = readFileSync(join(folder, THE_RECORD), 'utf8').split('\n').filter((line) => line !== '')
  const runs = new Map<string, { file: string; start: number; end: number | null }>()
  for (const line of lines) {
    const entry = JSON.parse(line) as AnEntry
    const key = `${String(entry.pid)} ${entry.file}`
    if (entry.is === 'start') runs.set(key, { file: entry.file, start: entry.at, end: null })
    else {
      const run = runs.get(key)
      if (run !== undefined) run.end = entry.at
    }
  }
  const running = [...runs.values()].filter((run) => run.start <= to && (run.end === null || run.end >= from)).map((run) => run.file)
  return [...new Set(running)].sort()
}

/** The failure a test file gets when the rules file changed while it ran, naming everybody who was running. */
export function whatTheGuardSays(path: string, words: string, after: string, from: number, to: number, running: readonly string[]): string {
  return [
    `The worktree's rules file ${path} ${words}. No test may write it.`,
    `It changed between ${new Date(from).toISOString()} and ${new Date(to).toISOString()}, ${after}.`,
    running.length === 1
      ? 'This test file was the only one running in that time, so it is the writer, or a program outside this run of the tests is:'
      : `These ${String(running.length)} test files were running in that time, and the writer is one of them, or a program outside this run of the tests:`,
    ...running.map((file) => `  ${file}`),
    'Run each alone to see which one writes it. A run started with the worktree as its folder writes this file; tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts says how a test gives its run a folder of its own.',
  ].join('\n')
}

/** The mark the setup file leaves in its test process, so a test can see that the guard is there. */
const THE_MARK = Symbol.for('mole-office.the-worktrees-rules-file-is-guarded')

/** Leaves the mark: the guard of `path` is installed in this process. */
export function markTheGuardInstalled(path: string): void {
  ;(globalThis as Record<symbol, unknown>)[THE_MARK] = path
}

