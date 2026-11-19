// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER IN tools/kit/ IS FOUND BY ITS SESSION'S CLAUDE PROCESS: by walking up, and then by `CLAUDE_PID`.
 *
 * This is the first part of tests/the-waiter-finds-its-sessions-claude.test.ts, with the kit's chain
 * naming `tools/kit/waiter.sh`, the copy with no personal default, where that
 * file names design/agents/kit/waiter.sh. The reading itself is done by the hold tool, through
 * `theSessionProcessForTheWaiter` in src/config/session-process.mjs, whichever copy of the waiter
 * runs it. The other two parts of that file are about the command line and the record, not the
 * waiter, and are not repeated here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A durable agent's letters were sent to the owner twice — on 23 September 2026 and again on
 * 24 September — because the record holding the agent's handle named no process, so the office read
 * the waiting session as nobody. The waiter is what knows which record it holds for, and until now
 * it could not say which process its session is.
 *
 * WALKING UP IS NOT ENOUGH FROM A WAITER. Measured on 24 September 2026: all three of the kit's
 * waiters are children of `systemd --user`, because the kit starts them with `setsid nohup … &
 * disown` and the shell that started them exits. So the second reading is `CLAUDE_PID`, which Claude
 * Code puts in every shell it starts and which survives `setsid`. It is read and then CHECKED — a
 * waiter that outlived its session carries a number that is no longer a claude process, and this is
 * where that is caught.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROCESS TABLE IS THE TEST'S OWN, AND NOT THIS MACHINE'S
 * ---------------------------------------------------------------------------------------
 *
 * `theSessionProcessForTheWaiter` takes the readings it makes as an argument, exactly as
 * `theProcessBehindTheHook` does, so a chain can be measured without starting one. The chains below
 * are the two that were really measured: a session's own shell with claude a few steps above it, and
 * the kit's loop under `systemd --user` with claude nowhere in its parents at all.
 *
 * NOTHING HERE READS THE REAL /proc AND NOTHING HERE STARTS A PROCESS. The environment is handed in
 * too, so no case depends on how the runner was started; `tests/the-agents-variables.ts` takes the
 * two claude variables out of every test's environment for the same reason.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first; see the commit message.
 * ---------------------------------------------------------------------------------------
 *
 *   MUTATION. Take the `CLAUDE_PID` reading out of `theSessionProcessForTheWaiter` — make it
 *   return the walk's own answer — and "the kit's chain" case goes red: the waiter finds nothing.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'

import { theSessionProcessForTheWaiter } from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'

/**
 * One process in a table this test made up. `name` and `exe` are what decide whether it is the
 * claude program; `cmd` is only what gets written on the record.
 */
interface Made {
  cmd: string | null
  name: string
  exe: string
  parent: number | null
  started?: Date
}

/** The claude program as the owner's machine runs it: a versioned file, started as `claude`. */
const CLAUDE = { name: 'claude', exe: `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.281` }
/** Two shells and systemd, as their name and executable read. */
const BASH = { name: 'bash', exe: '/usr/bin/bash' }
const SH = { name: 'sh', exe: '/usr/bin/dash' }
const SYSTEMD = { name: 'systemd', exe: '/usr/lib/systemd/systemd' }

/** When every process in these tables began, so one expected stamp serves every case. */
const BEGAN = new Date('2026-09-24 09:02:39')

/** The process table as the walk sees it, built from a plain object. */
function aProcessTable(rows: Record<number, Made>): {
  commandLineOf: (pid: number) => string | null
  nameOf: (pid: number) => string | null
  executableOf: (pid: number) => string | null
  parentOf: (pid: number) => number | null
  startTimeOf: (pid: number) => Date | null
} {
  return {
    commandLineOf: (pid) => rows[pid]?.cmd ?? null,
    nameOf: (pid) => rows[pid]?.name ?? null,
    executableOf: (pid) => rows[pid]?.exe ?? null,
    parentOf: (pid) => rows[pid]?.parent ?? null,
    startTimeOf: (pid) => {
      const row = rows[pid]
      if (row === undefined || row.cmd === null) return null
      // `started: undefined` on a row that exists means "this process is here and its start time
      // will not read", which is a reading of its own and one of the cases below.
      return row.started ?? null
    },
  }
}

/** A session's own shell: the waiter started by hand, with claude three shells above it. */
const A_SESSIONS_SHELL = aProcessTable({
  10: { cmd: '/bin/bash -c node tools/hold-the-handle.mjs --session abc', ...BASH, parent: 11, started: BEGAN },
  11: { cmd: '/bin/sh -c the-second-shell', ...SH, parent: 12, started: BEGAN },
  12: { cmd: '/bin/bash --login', ...BASH, parent: 13, started: BEGAN },
  13: { cmd: 'claude --resume 32444539-7b2c-4f1a-9d3e-0a1b2c3d4e5f', ...CLAUDE, parent: 14, started: BEGAN },
  14: { cmd: '/usr/lib/systemd/systemd --user', ...SYSTEMD, parent: 1, started: BEGAN },
})

/** The kit's loop: `setsid nohup … & disown`, so its parents end at `systemd --user`. */
const THE_KITS_CHAIN = aProcessTable({
  20: { cmd: '/bin/bash tools/kit/waiter.sh', ...BASH, parent: 21, started: BEGAN },
  21: { cmd: '/bin/bash tools/kit/waiter.sh', ...BASH, parent: 22, started: BEGAN },
  22: { cmd: '/usr/lib/systemd/systemd --user', ...SYSTEMD, parent: 1, started: BEGAN },
  // The session that started the loop, reachable only through CLAUDE_PID.
  30: { cmd: 'claude --resume 99faaeef-1111-2222-3333-444455556666', ...CLAUDE, parent: 22, started: BEGAN },
  // A shell, which is what an out-of-date CLAUDE_PID names once its session has gone and the number
  // has been handed to something else.
  31: { cmd: '/bin/bash -i', ...BASH, parent: 22, started: BEGAN },
  // A process that is claude and whose start time will not read.
  32: { cmd: 'claude --resume 99faaeef-1111-2222-3333-444455556666', ...CLAUDE, parent: 22 },
})

describe('the waiter in tools/kit is found by the claude process its session is', () => {
  it('walks up through three shells to the claude program, and says the walk found it', () => {
    const found = theSessionProcessForTheWaiter(10, {}, A_SESSIONS_SHELL)

    expect(found.recorded).toBe(true)
    expect(found.pid).toBe(13)
    expect(found.foundBy).toBe('the walk')
    expect(found.pidStartedAt).toBe(localStampOf(BEGAN))
    expect(found.pidCommand).toBe('claude --resume 32444539-7b2c-4f1a-9d3e-0a1b2c3d4e5f')
    expect(found.why).toBeNull()
  })

  it("reads CLAUDE_PID when the kit's chain ends at systemd, and says that is what found it", () => {
    const found = theSessionProcessForTheWaiter(20, { CLAUDE_PID: '30' }, THE_KITS_CHAIN)

    expect(found.recorded).toBe(true)
    expect(found.pid).toBe(30)
    expect(found.foundBy).toBe('CLAUDE_PID')
    expect(found.pidStartedAt).toBe(localStampOf(BEGAN))
  })

  it('takes the walk over CLAUDE_PID when the walk answers, so a session is never named by a stale variable', () => {
    // BOTH ARE SET AND THEY NAME DIFFERENT PROCESSES. The walk is what this waiter is under right
    // now; CLAUDE_PID is what the shell it was started from was told, and a loop keeps that value
    // for its whole life. The one that is measured from this process wins.
    const found = theSessionProcessForTheWaiter(10, { CLAUDE_PID: '30' }, A_SESSIONS_SHELL)

    expect(found.pid).toBe(13)
    expect(found.foundBy).toBe('the walk')
  })

  it('records nothing when CLAUDE_PID names a number that is not a claude process, and says so', () => {
    const found = theSessionProcessForTheWaiter(20, { CLAUDE_PID: '31' }, THE_KITS_CHAIN)

    expect(found.recorded).toBe(false)
    expect(found.pid).toBeNull()
    expect(found.foundBy).toBeNull()
    expect(found.why).toContain('CLAUDE_PID names 31, which is not a running claude program')
    // THE WALK'S OWN SENTENCE IS STILL THERE, naming every process it looked at, because "nothing
    // was found" is two readings and a reader needs both.
    expect(found.why).toContain('systemd --user')
  })

  it('records nothing when CLAUDE_PID names no process at all', () => {
    const found = theSessionProcessForTheWaiter(20, { CLAUDE_PID: '99999' }, THE_KITS_CHAIN)

    expect(found.recorded).toBe(false)
    expect(found.why).toContain('CLAUDE_PID names 99999, which is not a running claude program')
  })

  it('records nothing, and says the start time could not be read, when that is what happened', () => {
    // A CLAUDE PROCESS WHOSE START TIME WILL NOT READ IS NOT "not a claude program", and saying so
    // would be false. It is its own sentence, because the office compares that start time later and
    // a process it cannot be taken from cannot be recorded.
    const found = theSessionProcessForTheWaiter(20, { CLAUDE_PID: '32' }, THE_KITS_CHAIN)

    expect(found.recorded).toBe(false)
    expect(found.why).toContain('CLAUDE_PID names 32, and when that process began could not be read')
  })

  it('records nothing and says CLAUDE_PID is not set when neither reading answers', () => {
    const found = theSessionProcessForTheWaiter(20, {}, THE_KITS_CHAIN)

    expect(found.recorded).toBe(false)
    expect(found.why).toContain('CLAUDE_PID is not set')
  })

  it('has no parent to walk up from, and says that rather than reading CLAUDE_PID as the answer', () => {
    // A waiter reparented to pid 1 has no chain at all. The environment is still read, because that
    // is the whole point of the second reading.
    const found = theSessionProcessForTheWaiter(1, { CLAUDE_PID: '30' }, THE_KITS_CHAIN)

    expect(found.recorded).toBe(true)
    expect(found.foundBy).toBe('CLAUDE_PID')
  })
})
