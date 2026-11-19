// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PROCESS THAT SHARES ITS FILES IS GIVEN ANOTHER FILE ONLY WHILE IT HOLDS LESS THAN THE LIMIT.
 *
 * tests/a-shared-test-process-is-retired-at-a-size.ts answers vitest's question, between two files,
 * whether a process may take another. This checks the answer at the limit and on each side of it, and
 * that the size is read from the process itself.
 *
 * WHAT GOES RED. Let a process at the limit take another file (`<=` for `<`), and the first case fails.
 * Read a process that is gone as size 0, and the second case fails. Take `canReuse` out of the pool, or
 * let it compare with the limit it was not given, and the cases of the pool's answer fail.
 */
import { readFileSync } from 'node:fs'
import type { PoolOptions, PoolWorker } from 'vitest/node'
import { describe, expect, it } from 'vitest'
import {
  aPoolThatRetiresAProcessAt,
  mayTakeAnotherFile,
  residentBytes,
  RETIRE_AT_BYTES,
} from './a-shared-test-process-is-retired-at-a-size.ts'

describe('whether a shared test process takes another file', () => {
  it('takes one below the limit, and none at the limit or above it', () => {
    expect(mayTakeAnotherFile(RETIRE_AT_BYTES - 1)).toBe(true)
    expect(mayTakeAnotherFile(RETIRE_AT_BYTES)).toBe(false)
    expect(mayTakeAnotherFile(RETIRE_AT_BYTES + 1)).toBe(false)
    expect(mayTakeAnotherFile(999, 1_000)).toBe(true)
    expect(mayTakeAnotherFile(1_000, 1_000)).toBe(false)
  })

  it('takes none when the process is gone', () => {
    expect(mayTakeAnotherFile(null)).toBe(false)
    // No process can have a number above the largest the kernel gives.
    const gone = Number(readFileSync('/proc/sys/kernel/pid_max', 'utf8')) + 1
    expect(residentBytes(gone)).toBe(null)
  })

  it('reads the size of a running process from the process itself', () => {
    const held = residentBytes(process.pid)
    expect(held).toBeGreaterThan(0)
    expect((held ?? 1) % 1024).toBe(0)
  })
})

/**
 * What vitest does with the pool's answer, between two files in one process. This is vitest 4's own
 * test, `isEqualRunner`, which it does not export: a worker without `canReuse` takes another file
 * whenever the next file wants the same environment, as each file here does.
 */
function vitestGivesItAnotherFile(worker: PoolWorker): boolean {
  return worker.canReuse === undefined ? true : worker.canReuse({} as Parameters<NonNullable<PoolWorker['canReuse']>>[0])
}

/** The pool's worker, as vitest makes it, holding `fork` as the process it started. */
function aWorkerOf(pool: ReturnType<typeof aPoolThatRetiresAProcessAt>, fork: { pid?: number } | undefined): PoolWorker {
  // Made-up options: only what the forks worker reads when it is made. Nothing is started from them.
  const options = {
    execArgv: [],
    env: {},
    distPath: '/no-vitest-here',
    project: { vitest: { logger: { outputStream: process.stdout, errorStream: process.stderr } } },
  } as unknown as PoolOptions
  const worker = pool.createPoolWorker(options)
  if (fork !== undefined) (worker as unknown as { _fork: { pid?: number } })._fork = fork
  return worker
}

describe("the pool's answer, between two files in one process", () => {
  it('gives another file to a process below the limit it was made with, and none to one at or above it', () => {
    // This test process stands for the one the pool started. Its size is read here, so nothing depends on it.
    const holds = residentBytes(process.pid) ?? 0
    expect(holds).toBeGreaterThan(0)
    const thisProcess = { pid: process.pid }
    expect(vitestGivesItAnotherFile(aWorkerOf(aPoolThatRetiresAProcessAt(holds * 2), thisProcess))).toBe(true)
    expect(vitestGivesItAnotherFile(aWorkerOf(aPoolThatRetiresAProcessAt(Math.floor(holds / 2)), thisProcess))).toBe(false)
  })

  it('gives none to a process that is gone, or that it has no process for', () => {
    const gone = { pid: Number(readFileSync('/proc/sys/kernel/pid_max', 'utf8')) + 1 }
    expect(vitestGivesItAnotherFile(aWorkerOf(aPoolThatRetiresAProcessAt(), gone))).toBe(false)
    expect(vitestGivesItAnotherFile(aWorkerOf(aPoolThatRetiresAProcessAt(), undefined))).toBe(false)
  })
})
