// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STAND-IN RUNTIMES A TEST OFFICE STARTED, AND STOPPING THEM WHEN A CASE ENDS. Wave 13s round 21, piece 3.
 *
 * tests/a-shutdown-pauses-the-runs-at-work.test.ts and tests/an-interrupted-run-resumes-with-one-press.test.ts start
 * real offices whose worker runs tests/fake-runtime.mjs. The office starts each run in a process group of its own, so a
 * run outlives its office by design. Those files stopped the groups they had recorded only once, after the last case,
 * and a run the office started after the case last asked for it was never recorded: the resumed run of resume-runner
 * and the carried-on run of crash-runner were left waiting until the fake runtime gave up a minute later (problem
 * jgGgPp02B97q's fix). A stopped-processes log saw them.
 *
 * Each case now ends with `stopTheGroups`, pass or fail, and then `theRuntimesOf` must be empty. A runtime is this
 * office's when its office's ledger names its pid, its command line names the fake runtime and its MOLE_OFFICE_API is
 * the office's address, which is a port this test chose. The worker writes every run into that ledger before the run
 * is used, and stops a run it could not write down. This module reads the ledger and then /proc only for the pids the
 * ledger names, so it reads no other process, except one that has since been given one of those pids, and the command
 * line check then leaves that one out. It stops nothing it finds; what is stopped is the groups the test recorded, so
 * a runtime the test never recorded is reported, not killed. A run its office started and never wrote down is not
 * seen here.
 *
 * Both files also wait for one whole pass of the office's worker, to show that the pass left a paused run alone. That
 * pass is read from the office's own request log by `aWholePassSince`, here, so the two files read it the same way.
 */

import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'

import { aGroupIsHere } from './a-group-is-here.ts'

/** An office a test made: the database that holds its ledger, and its address. */
interface ATestOffice {
  database: string
  api: string
}

/** The pids the office's ledger names as processes, released or not: a released row whose process is still here counts. */
function thePidsItsLedgerNames(database: string): number[] {
  // AN OFFICE WITH NO DATABASE NEVER STARTED, so it wrote nothing down and its worker started nothing.
  if (!existsSync(database)) return []
  const db = new Database(database, { readonly: true, fileMustExist: true })
  try {
    const keys = db.prepare("SELECT DISTINCT key FROM session_resources WHERE type = 'process'").all() as { key: string }[]
    return keys.map(({ key }) => {
      if (!/^\d+$/.test(key)) throw new Error(`The ledger in ${database} names a process by ${JSON.stringify(key)}, which is not a pid.`)
      return Number(key)
    })
  } finally {
    db.close()
  }
}

/** Every process the office's ledger names that is still running `fake` with MOLE_OFFICE_API set to its address. */
export function theRuntimesOf(office: ATestOffice, fake: string): { pid: number; pgid: number; command: string }[] {
  const found: { pid: number; pgid: number; command: string }[] = []
  for (const pid of thePidsItsLedgerNames(office.database)) {
    let command: string
    let environment: string
    let stat: string
    try {
      command = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8')
      if (!command.includes(fake)) continue
      environment = readFileSync(`/proc/${String(pid)}/environ`, 'utf8')
      stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
    } catch {
      // It has ended, or the pid is now another user's process.
      continue
    }
    if (!environment.split('\0').includes(`MOLE_OFFICE_API=${office.api}`)) continue
    // Field 5 of stat is the group; the command in field 2 may hold spaces, so the fields are counted after its ')'.
    const pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
    found.push({ pid, pgid, command: command.split('\0').join(' ').trim() })
  }
  return found
}

/**
 * WHEN THE OFFICE'S WORKER ENDED ONE WHOLE PASS THAT BEGAN AT OR AFTER `since`, from the office's own request log, read
 * only. A pass of src/worker/index.ts begins with the worker's post of the gate runs that ran out and ends with its read
 * of the queue; between them it picks up the runs already going and starts the resumes the person requested. Neither
 * request is one a test makes. Null while no such pass is logged.
 */
export function aWholePassSince(office: ATestOffice, since: number): number | null {
  const db = new Database(office.database, { readonly: true, fileMustExist: true })
  try {
    const row = db.prepare(`
      SELECT MIN(q.at_ms) AS at FROM api_calls q
      WHERE q.method = 'GET' AND q.route = '/api/worker/queue'
        AND q.at_ms >= (SELECT MIN(s.at_ms) FROM api_calls s
                        WHERE s.method = 'POST' AND s.route = '/api/worker/gates/run-out' AND s.at_ms >= ?)`).get(since) as { at: number | null }
    return row.at
  } finally {
    db.close()
  }
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Stop every recorded group still here: SIGTERM, up to fifteen seconds' wait, then SIGKILL. Empties `groups`. */
export async function stopTheGroups(groups: Set<number>): Promise<void> {
  const running = [...groups].filter(aGroupIsHere)
  groups.clear()
  for (const group of running) {
    try {
      process.kill(-group, 'SIGTERM')
    } catch {
      // Ended between the look and the signal.
    }
  }
  const deadline = Date.now() + 15_000
  while (running.some(aGroupIsHere) && Date.now() < deadline) await sleep(200)
  for (const group of running.filter(aGroupIsHere)) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Ended at the last moment.
    }
  }
}
