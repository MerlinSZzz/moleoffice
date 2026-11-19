// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST RUN LEAVES A SERVER RUNNING ON THIS MACHINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A TEST AND NOT A NOTE IN A DOCUMENT
 * ---------------------------------------------------------------------------------------
 *
 * Eight test files start a real Mole Office server of their own, each in its own process group. A
 * detached child is not in its parent's group, so when the parent dies the child is sent nothing at
 * all — and on 18 August 2026 eleven of them were left running on this machine in one day, each
 * holding a port and a database, found four and a half hours after the run that made them.
 *
 * `tools/stray-servers.mjs` finds them. It existed before this test did and it found nothing all
 * day, because a tool is only run by somebody who remembers it. This is what makes it run: any test
 * run at all now sweeps the machine, and a leak fails the suite that made it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS DOES NOT FIRE ON HEALTHY SERVERS
 * ---------------------------------------------------------------------------------------
 *
 * The tool refuses to call a process a stray unless the thing that started it is GONE, and unless
 * it is older than a grace period. A server belonging to a browser test running right now has its
 * worker as a live parent, so it is spared and, with --verbose, says so.
 *
 * AND IT IS ASKED ONLY ABOUT SERVERS THE SUITE ITSELF MADE. This repository tells you to start a
 * server with `setsid`, which leaves a live, wanted server with no parent at all — the same shape
 * as a leak. Failing the suite for one of those would be this check failing an honest machine, and
 * it would be switched off within a day. What tells them apart is where the database is, so the
 * sweep is pointed at the path `liveApp` and `freshDb` build theirs under, and nothing else counts.
 * Somebody sweeping the machine by hand runs the tool with no argument and sees everything.
 *
 * The sparing rule has a test of its own below, and it is not a restatement of the comment: it
 * makes a process the tool must take for a server and checks that it is spared with the parent
 * named. Without it, the first test would pass on a machine with nothing running at all and fail
 * every parallel run.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SWEEPER = join(REPO, 'tools', 'stray-servers.mjs')

/** Run the sweeper over the databases this suite makes, and hand back what it said. */
function sweep(grace?: string): { status: number; said: string } {
  const run = spawnSync(process.execPath, [SWEEPER, '--verbose', `--database-prefix=${TEST_DATABASE_PREFIX}`], {
    cwd: REPO,
    encoding: 'utf8',
    env: grace === undefined ? process.env : { ...process.env, MOLE_OFFICE_STRAY_GRACE: grace },
  })
  if (run.error !== undefined) throw run.error
  return { status: run.status ?? -1, said: `${run.stdout}${run.stderr}` }
}

// Under the same path the suite's own databases live under, because that is what this sweep counts.
const scratch = mkdtempSync(`${TEST_DATABASE_PREFIX}sweep-`)
const standIns: { kill(): void }[] = []

afterAll(() => {
  for (const one of standIns) one.kill()
  rmSync(scratch, { recursive: true, force: true })
})

describe('nothing has left a Mole Office server running on this machine', () => {
  it('finds no server left behind by a test run', () => {
    const { status, said } = sweep()
    // The tool's own words are the failure message: it names each group, how old it is, which
    // database it holds, and the exact command to stop it.
    expect(status, said).toBe(0)
  }, 30_000)

  it('spares a server whose parent is alive, and says which parent', () => {
    /**
     * A PROCESS THE TOOL MUST TAKE FOR A SERVER, MADE ON PURPOSE.
     *
     * It is not a Mole Office server and does not pretend to be one to anybody but this tool. The tool
     * decides from three facts in /proc — the command line, the working directory and MOLE_OFFICE_DB —
     * and this process really has all three, which is what makes it the right stand-in: a real
     * server would take ten seconds to start and would prove exactly the same thing.
     *
     * The grace period is set to zero for this call, so the only reason left to spare it is the one
     * under test. With the default it would be spared for being young and the test would pass
     * without touching the rule it is about.
     */
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)', 'src/server/index.ts'], {
      cwd: REPO,
      env: { ...process.env, MOLE_OFFICE_DB: join(scratch, 'panelx.db') },
      stdio: 'ignore',
    })
    standIns.push(child)
    expect(child.pid, 'the stand-in process did not start').toBeDefined()

    // Only what the tool said about THIS process is checked. How the sweep ended is the first
    // test's business, and a real stray on the machine must not make this one fail as well —
    // two tests failing for one cause is two tests saying one thing.
    const { said } = sweep('0')
    expect(said, said).toContain(`pid ${String(child.pid)}, the API server`)
    expect(said, said).toContain(`its parent ${String(process.pid)} is a process that could still be waiting for it`)
  }, 30_000)
})
