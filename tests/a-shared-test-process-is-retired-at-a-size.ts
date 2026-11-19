// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PROCESS THAT SHARES ITS FILES IS RETIRED BETWEEN FILES ONCE IT HOLDS 1,000 MB.
 *
 * When MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS is on, vitest.config.ts uses this pool. It is vitest's own
 * `forks` pool, with one change: before a process that has finished a file is given the next one, the
 * pool reads how much memory the process holds. At `RETIRE_AT_BYTES` or more, vitest is told the process
 * cannot take another file, so vitest ends it the way it ends any idle process and starts a new one. A
 * process is never stopped while it runs a file.
 *
 * vitest asks a pool whether a process can take another file only when two or more files may run at
 * once. With one worker, vitest gives every file to one process and never asks.
 */
import type { ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { ForksPoolWorker, type PoolOptions } from 'vitest/node'

/**
 * THE LIMIT: 1,000 MB. On the cloud box, with 20 workers, the whole suite with files sharing processes
 * took swap to 12.7 GB at a limit of 2,000 MB (13 November 2026), and added none at 1,000 MB (14 November).
 * At 1,000 MB, vitest's own duration was 2,114 s, against 2,324 s with a process for each file.
 *
 * The limit was 2,000 MB before. Wave 13n round H tried that with two workers on 100 files: the runs
 * took 30.8 % less time than with a process for each file, and every answer was the same. The largest
 * process held 2,577 to 2,683 MB at its peak, because a process grows inside a file and is retired only
 * after it.
 */
export const RETIRE_AT_BYTES = 1_000 * 1024 * 1024

const NAME = 'forks-retired-at-a-size'

/** How much memory a process holds, in bytes, or null when the process is gone. */
export function residentBytes(pid: number): number | null {
  let status: string
  try {
    status = readFileSync(`/proc/${pid}/status`, 'utf8')
  } catch {
    return null
  }
  const kb = /^VmRSS:\s+(\d+) kB$/m.exec(status)
  if (kb === null) throw new Error(`/proc/${pid}/status names no VmRSS, so a shared test process cannot be retired at a size.`)
  return Number(kb[1]) * 1024
}

/** Can a process that holds this much take another file? Not when it is gone, and not at the limit. */
export function mayTakeAnotherFile(holds: number | null, limit: number = RETIRE_AT_BYTES): boolean {
  return holds !== null && holds < limit
}

/** vitest's `forks` pool, with a process retired between files once it holds `bytes`. */
export function aPoolThatRetiresAProcessAt(bytes: number = RETIRE_AT_BYTES) {
  if (residentBytes(process.pid) === null) {
    throw new Error('This machine has no /proc/<pid>/status, so a shared test process cannot be retired at a size.')
  }
  class ForksRetiredAtASize extends ForksPoolWorker {
    override readonly name = NAME
    canReuse(): boolean {
      // vitest keeps the child process in `_fork` and gives no other way to its pid.
      const pid = (this as unknown as { _fork?: ChildProcess })._fork?.pid
      if (pid === undefined) return false
      return mayTakeAnotherFile(residentBytes(pid), bytes)
    }
  }
  return { name: NAME, createPoolWorker: (options: PoolOptions) => new ForksRetiredAtASize(options) }
}
