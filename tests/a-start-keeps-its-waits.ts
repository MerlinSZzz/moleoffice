// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Startup stages are written before work begins and carried by a failed hook's error and JSON. */
import { createHash } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Suite } from '@vitest/runner'
import { expect, inject } from 'vitest'

export interface Wait {
  who: string
  what: string
  at: number
}

const ROOT = join(import.meta.dirname, '..')

/** The existing per-run folder keeps parallel files and separate runs apart. */
function journal(file: string): { path: string; name: string } {
  const folder = inject('theTestFilesRunning')
  if (typeof folder !== 'string' || folder === '') throw new Error('The startup stage journal was given no test-run folder.')
  const name = `setup-waits-${createHash('sha256').update(file).digest('hex')}-${String(process.pid)}.jsonl`
  return { path: join(folder, name), name }
}

/** Synchronous on purpose: a timer or later promise is not evidence that a stage began. */
export function keepTheSetupWait(who: string, what: string): void {
  const file = expect.getState().testPath
  if (typeof file !== 'string' || file === '') throw new Error('The startup stage journal could not read its test file.')
  const row: Wait = { who, what, at: Date.now() }
  appendFileSync(journal(file).path, JSON.stringify(row) + '\n')
}

/** Every row this test file has kept so far, in the order it was written. */
export function theSetupWaitsKeptFor(file: string): Wait[] {
  const kept = journal(file)
  if (!existsSync(kept.path)) return []
  const text = readFileSync(kept.path, 'utf8').trim()
  return text === '' ? [] : text.split('\n').map((line) => JSON.parse(line) as Wait)
}

/**
 * Suite errors are hook errors. Walk nested suites too, since their beforeAll may fail while the file's own succeeds.
 * The original error and stack stay first; the added evidence is retained by the ordinary default and JSON reporters.
 */
export function keepTheWaitsOnHookFailure(file: Suite): void {
  const suites: Suite[] = [file]
  for (let at = 0; at < suites.length; at++) {
    for (const task of suites[at]!.tasks) if (task.type === 'suite') suites.push(task)
  }
  const errors = suites.flatMap((suite) => suite.result?.errors ?? [])
  if (errors.length === 0) return
  const kept = journal(file.file.filepath)
  const rows = theSetupWaitsKeptFor(file.file.filepath)
  if (rows.length === 0) return // No startup stage was begun by this file.
  const logs = join(ROOT, '.logs')
  mkdirSync(logs, { recursive: true })
  copyFileSync(kept.path, join(logs, kept.name))
  const evidence = '\n\nStartup stages begun in this file, each give-up and the end of each clearing up, in order (a stage may already have completed):\n' +
    rows.map((row) => `${String(row.at)} ${row.who}: ${row.what}`).join('\n') +
    `\nJournal: ${relative(ROOT, join(logs, kept.name))}`
  for (const error of errors) {
    error.message = (error.message ?? '') + evidence
    error.stack = (error.stack ?? '') + evidence
  }
  // The JSON reporter retains file errors only; keep the actual nested hook errors there too.
  if (file.result !== undefined && (file.result.errors?.length ?? 0) === 0) file.result.errors = errors
}
