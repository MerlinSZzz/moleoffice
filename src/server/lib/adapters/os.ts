// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROCESS TABLE, READ FROM THE MACHINE.
 *
 * THIS IS NOT AN AGENT-TOOL ADAPTER. Nothing here knows what Claude Code is, and nothing here
 * belongs in the `ADAPTERS` list next door. It sits in this directory for one reason, spelled out
 * below, and that reason is the only thing keeping it out of lib/resources.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * `OsProbe` in src/server/lib/resources.ts is the one interface Mole Office asks the operating system
 * through. `processTable()` is its method for "what is running on this machine right now". This
 * file holds two things and nothing else:
 *
 *   - `readLinuxProcessTable`, which is the body of `LINUX_PROBE.processTable()`;
 *   - the pointer to whichever probe is installed, so the session sweep reads the process table
 *     through the same seam the resource ledger reads every other machine fact through.
 *
 * That second part is what makes `useOsProbe(fake)` change what `GET /api/sessions` sees. Before
 * it existed, the sweep read /proc through a function of its own, which meant Mole Office had two
 * interfaces to one operating system: a Mac or Windows port would have had to find and implement
 * both, and session discovery could only ever be tested against whatever happened to be running.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT IN lib/resources.ts, WHERE THE REST OF THE OPERATING-SYSTEM LAYER LIVES
 * ---------------------------------------------------------------------------------------
 *
 * OS BOUNDARY EXCEPTION: this file reads /proc outside lib/resources.ts because importing that file
 * opens the database, and the session adapters have to stay importable without one. It is the body
 * of one OsProbe method and holds nothing else. It must not grow a second kind of machine access.
 *
 * Importing lib/resources.ts opens the database. It imports lib/records.ts, which imports
 * db/client.ts, whose module body runs `new Database(process.env.MOLE_OFFICE_DB ?? './data/panelx.db')`
 * the moment it is loaded.
 *
 * The adapter layer has to stay importable without a database. tests/config.test.ts imports
 * adapters/index.ts at the top of the file, before any test has pointed `MOLE_OFFICE_DB` at a throwaway
 * file — so an adapter module that reached lib/resources.ts would open the REAL `./data/panelx.db`
 * every time the suite ran. That database is the only copy of everything in this project and the
 * test suite has no business touching it.
 *
 * So the dependency runs one way: lib/resources.ts imports this file, and this file imports
 * nothing but node:fs and two type declarations. The type-only import of `OsProbe` below is erased
 * at compile time, so it is not a cycle at runtime.
 */

import { readFileSync, readdirSync, readlinkSync } from 'node:fs'
// Type-only, and therefore erased: this file must not pull lib/resources.ts in at runtime, for the
// database reason in the header above.
import type { OsProbe } from '../resources.ts'
import type { ProcessInfo, ProcessScan } from './types.ts'

/**
 * Every process on this machine, read straight out of /proc.
 *
 * This is `LINUX_PROBE.processTable()`. Call it through the probe rather than directly, so that
 * installing another probe really does change what the caller sees.
 *
 * /proc rather than spawning `ps` because GET /api/sessions asks for this on every request, and
 * forking a child process per request to parse its text output is both slower and one more thing
 * that can fail in a way nobody notices. Reading /proc needs no dependency and no subprocess.
 *
 * A failure comes back as `{ok:false, reason}` and is NEVER an empty list. The two are opposite
 * conclusions: an empty list means "nothing is running, so every session is dead", and a failure
 * means "I could not look". Collapsing them would mark every live session on the machine as
 * orphaned the first time /proc was unavailable — a page full of false alarms, which is the fastest
 * way to make somebody stop reading the page.
 */
export function readLinuxProcessTable(): ProcessScan {
  let entries: string[]
  try {
    entries = readdirSync('/proc')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: `/proc could not be listed (${message}); this build reads process state from /proc, which exists on Linux only`,
    }
  }

  const processes: ProcessInfo[] = []
  for (const entry of entries) {
    // /proc holds plenty that is not a process. Only the all-digit names are pids.
    if (!/^\d+$/.test(entry)) continue
    const pid = Number(entry)

    let command: string
    try {
      // cmdline separates arguments with NUL bytes and usually ends with one.
      command = readFileSync(`/proc/${entry}/cmdline`, 'utf8').replace(/\0+$/, '').split('\0').join(' ')
    } catch {
      // A process that exited between the readdir and this read is normal and not worth a word.
      continue
    }
    if (command === '') continue

    let cwd: string | null = null
    try {
      cwd = readlinkSync(`/proc/${entry}/cwd`)
    } catch {
      // Another user's process. Its command line was readable, its cwd is not; that is a partial
      // answer, not a failure, and the command line is what session matching actually needs.
      cwd = null
    }

    processes.push({ pid, command, cwd })
  }

  return { ok: true, processes }
}

/**
 * The part of an `OsProbe` the session sweep needs: what it is, and how it reads the process table.
 *
 * A `Pick` rather than the whole interface, because every other method on a probe is about one
 * process, one socket, one container or one lock, and the sweep asks none of those questions.
 * Narrowing it here also keeps the refusal below able to name the platform it is refusing for.
 */
export type ProcessTableSource = Pick<OsProbe, 'platform' | 'processTable'>

/**
 * The source in use until lib/resources.ts installs one.
 *
 * This is the same function `LINUX_PROBE.processTable()` calls, not a second reading of /proc, so
 * a process that never imports lib/resources.ts gets the same answer rather than a different one.
 */
const LINUX_TABLE: ProcessTableSource = { platform: 'linux', processTable: readLinuxProcessTable }

let source: ProcessTableSource = LINUX_TABLE

/**
 * Point the process table at a probe.
 *
 * Called by `useOsProbe` in lib/resources.ts and by nothing else. It is not the seam a caller
 * should reach for: `useOsProbe` is, and it calls this so that ONE call swaps the whole operating
 * system. Two seams that a caller had to remember to set together would be two things that can
 * disagree, which is the shape of every defect this codebase has produced.
 */
export function useProcessTableSource(probe: ProcessTableSource): void {
  source = probe
}

/**
 * The process table as the installed probe describes it.
 *
 * A probe with no `processTable` is not quietly rounded up to the real machine. It reports that it
 * could not look, and says which probe could not, so a test that installs half a machine gets
 * `unknown` sessions with a sentence explaining why — never a page of session states secretly read
 * from the computer the suite happens to be running on.
 */
export function currentProcessTable(): ProcessScan {
  const read = source.processTable
  if (read === undefined) {
    return {
      ok: false,
      reason:
        `the installed OsProbe (platform "${source.platform}") does not answer for the process table, ` +
        'so Mole Office could not look at what is running on this machine. A probe that describes a ' +
        'machine has to implement processTable().',
    }
  }
  return read.call(source)
}
