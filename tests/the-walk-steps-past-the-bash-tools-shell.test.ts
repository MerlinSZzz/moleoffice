// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLAUDE PROGRAM IS KNOWN BY ITS OWN NAME AND EXECUTABLE, NEVER BY ITS COMMAND LINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Problem YJm0foMaxrZN, 24 September 2026. Claude Code's Bash tool runs every command inside a
 * shell whose command line carries the whole command: `/bin/bash -c source … && eval '<the
 * command>' && pwd -P …`. One agent started its waiter loop from that tool. The loop's parent was the
 * tool's shell, and a word of the command had a path segment `claude`. The walk took the first
 * process whose command line had such a segment, so it took the shell (pid 684407, a bash). The
 * waiter offered that shell to the office as its session's claude, and the office refused it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE STARTS, AND HOW IT STOPS THEM
 * ---------------------------------------------------------------------------------------
 *
 * Real processes, read through the real /proc. The claude program here is a script named `claude`
 * run by `/bin/sh`: its name (`/proc/<pid>/comm`) is `claude` and its executable is the shell's
 * file. That is the same stand-in tools/session-hook.mjs's own tests make. Under it is a bash shaped
 * like the Bash tool's shell, whose command line has the segment `claude`, and under that a loop.
 *
 * Each group is started with `detached`, which is a `setsid`, so its process group id is the pid of
 * what was started. It is written down as it starts and stopped by that group id and nothing else
 * (chapter 2, rule 1). Every file is under a folder this file made.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first, 24 September 2026.
 * ---------------------------------------------------------------------------------------
 *
 *   MUTATION 1. In theProcessBehindTheHook, decide by the command line again (a word with a path
 *   segment `claude`) instead of `isTheClaudeProgram`. "the loop under the Bash tool's shell" goes
 *   red: the walk answers the shell's pid.
 *   MUTATION 2. In theSessionProcessForTheWaiter, check CLAUDE_PID by the command line again.
 *   "a CLAUDE_PID naming a shell" goes red: the shell is recorded.
 *   MUTATION 3. In the office's door (lib/held-process.ts), check the process by the command line
 *   again. "the door refuses a process that only mentions claude" goes red.
 *   MUTATION 4. In isTheClaudeProgram, answer false instead of reading the executable. "a program
 *   whose name is not claude, by its executable" goes red.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import {
  isTheClaudeProgram,
  parentOf,
  theProcessBehindTheHook,
  theSessionProcessForTheWaiter,
} from '../src/config/session-process.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

/** Every folder this file made, removed at the end. */
const folders: string[] = []
/** Every process group this file started, stopped after each case. */
let groups: number[] = []

function aFolder(): string {
  // No segment of this path is exactly `claude`, so only the files named below put one on a
  // command line.
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-claude-walk-'))
  folders.push(folder)
  return folder
}

/** Start a program in a process group of its own, and write the group id down. */
function startAlone(file: string, args: string[] = []): number {
  const child = spawn(file, args, { detached: true, stdio: 'ignore' })
  const pid = child.pid
  if (typeof pid !== 'number' || pid <= 0) throw new Error(`${file} did not start`)
  child.unref()
  groups.push(pid)
  return pid
}

/** A script named `claude`, run by /bin/sh, whose body is `body`. */
function aFakeClaude(folder: string, body: string): string {
  const file = join(folder, 'claude')
  writeFileSync(file, `#!/bin/sh\n# A STAND-IN FOR THE claude PROGRAM, written by a test. It runs no model.\n${body}\n`, {
    mode: 0o755,
  })
  return file
}

/** Wait for a file one of the started processes writes its pid into. */
async function thePidIn(file: string): Promise<number> {
  for (let i = 0; i < 100; i += 1) {
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8').trim()
      if (/^\d+$/.test(text)) return Number(text)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`nothing wrote a pid into ${file} within five seconds`)
}

function theNameOf(pid: number): string {
  return readFileSync(`/proc/${String(pid)}/comm`, 'utf8').trim()
}

function theCommandLineOf(pid: number): string {
  return readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').join(' ').trim()
}

/**
 * Wait until a started process runs the program named `name`. A shell's `$!` names its child as soon as the child is
 * forked, while it is still the shell and before it has become the program it starts, so a read straight after `$!` can
 * find `sh` where the program will be. Five seconds, then it fails and says what the process still is.
 */
async function untilItRuns(pid: number, name: string): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (theNameOf(pid) === name) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`process ${String(pid)} is still named ${theNameOf(pid)} five seconds after it started, and never became ${name}`)
}

afterEach(() => {
  for (const group of groups) {
    // BY THE GROUP ID AND NEVER BY A PATTERN. A group of zero is never signalled: `kill(-0)` would
    // mean this runner's own group.
    if (!Number.isInteger(group) || group <= 0) continue
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  groups = []
})

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

describe('the rule, one process at a time', () => {
  /** One process as the rule reads it: a name and an executable, and no command line at all. */
  function aProcess(name: string | null, executable: string | null): Parameters<typeof isTheClaudeProgram>[1] {
    return {
      commandLineOf: () => null,
      nameOf: () => name,
      executableOf: () => executable,
      parentOf: () => null,
      startTimeOf: () => null,
    }
  }

  it('takes the claude program as it was measured in this sandbox and as the owner runs it', () => {
    // MEASURED IN SANDBOX w11c, 24 September 2026.
    expect(isTheClaudeProgram(1234, aProcess('claude', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'))).toBe(true)
    // THE OWNER'S FORM, a versioned file under a folder named claude.
    expect(isTheClaudeProgram(1234, aProcess('claude', `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.281`))).toBe(true)
  })

  it('takes a program whose name is not claude, by its executable', () => {
    // If the kernel names the owner's program after its versioned file, the executable still has
    // the segment `claude`; and this sandbox's file is named `claude.exe`.
    expect(isTheClaudeProgram(1234, aProcess('2.1.281', `${THE_TEST_FIXTURE_ROOT}/.local/share/claude/versions/2.1.281`))).toBe(true)
    expect(isTheClaudeProgram(1234, aProcess('node', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe'))).toBe(true)
  })

  it('refuses a shell, node, and a process it cannot read', () => {
    expect(isTheClaudeProgram(1234, aProcess('bash', '/usr/bin/bash'))).toBe(false)
    expect(isTheClaudeProgram(1234, aProcess('sh', '/usr/bin/dash'))).toBe(false)
    expect(isTheClaudeProgram(1234, aProcess('node', '/usr/local/bin/node'))).toBe(false)
    // `.claude` and `claude-code` are not the segment `claude`.
    expect(isTheClaudeProgram(1234, aProcess('node', `${THE_TEST_FIXTURE_ROOT}/.claude/bin/node`))).toBe(false)
    expect(isTheClaudeProgram(1234, aProcess('node', '/opt/claude-code/node'))).toBe(false)
    expect(isTheClaudeProgram(1234, aProcess(null, null))).toBe(false)
  })
})

describe("the walk steps past the Bash tool's shell", () => {
  it("finds the claude program above the loop under the Bash tool's shell, not the shell", async () => {
    const folder = aFolder()
    // THE LOOP. It writes its pid down and waits, as the kit's waiter loop does.
    writeFileSync(join(folder, 'loop.sh'), `echo $$ > '${folder}/loop.pid'\nwhile :; do sleep 1; done\n`)
    // THE BASH TOOL'S SHELL, as Claude Code writes it: the command inside an `eval`, joined with
    // `&&`, so bash stays in place as the loop's parent. The last word has the segment `claude`.
    const claude = aFakeClaude(
      folder,
      `/bin/bash -c "true && eval 'sh ${folder}/loop.sh' && echo ${folder}/kit/claude/waiter.sh >/dev/null"`,
    )
    const claudePid = startAlone(claude)
    const loopPid = await thePidIn(join(folder, 'loop.pid'))
    const shellPid = parentOf(loopPid)

    // THE FIXTURE IS WHAT IT SAYS. The loop's parent is a bash whose command line has the segment
    // `claude`, and that bash's parent is the stand-in, named `claude`.
    expect(shellPid).not.toBeNull()
    expect(theNameOf(shellPid as number)).toBe('bash')
    expect(theCommandLineOf(shellPid as number)).toContain('/kit/claude/waiter.sh')
    expect(parentOf(shellPid as number)).toBe(claudePid)
    expect(theNameOf(claudePid)).toBe('claude')

    const found = theSessionProcessForTheWaiter(loopPid, {})

    expect(found.recorded, String(found.why)).toBe(true)
    expect(found.pid).toBe(claudePid)
    expect(found.pid).not.toBe(shellPid)
    expect(found.foundBy).toBe('the walk')
  })

  it("records the hook's stand-in, a script named claude run by /bin/sh, by its name", () => {
    // tools/session-hook.mjs's tests make exactly this, and the hook must still record it.
    const folder = aFolder()
    const claudePid = startAlone(aFakeClaude(folder, 'while :; do sleep 1; done'))

    expect(theNameOf(claudePid)).toBe('claude')
    expect(isTheClaudeProgram(claudePid)).toBe(true)
    const found = theProcessBehindTheHook(claudePid)
    expect(found.recorded, String(found.why)).toBe(true)
    expect(found.pid).toBe(claudePid)
  })
})

describe('CLAUDE_PID answers only when it names the claude program', () => {
  /**
   * A bash whose command line has the segment `claude`, with no claude program above it. It is
   * started by a shell that exits at once, so it is handed to pid 1 and the walk ends there.
   */
  async function aShellWithNothingAbove(): Promise<number> {
    const folder = aFolder()
    startAlone('/bin/sh', [
      '-c',
      `/bin/bash -c "sleep 600 && echo ${folder}/kit/claude/waiter.sh" & echo $! > '${folder}/shell.pid'`,
    ])
    const shellPid = await thePidIn(join(folder, 'shell.pid'))
    await untilItRuns(shellPid, 'bash')
    // THE FIXTURE IS WHAT IT SAYS: a bash, mentioning claude, and nothing the walk takes above it.
    expect(theNameOf(shellPid)).toBe('bash')
    expect(theCommandLineOf(shellPid)).toContain('/kit/claude/waiter.sh')
    expect(theProcessBehindTheHook(shellPid).recorded).toBe(false)
    return shellPid
  }

  it('reads CLAUDE_PID when the walk from that shell finds nothing', async () => {
    const shellPid = await aShellWithNothingAbove()
    const claudePid = startAlone(aFakeClaude(aFolder(), 'while :; do sleep 1; done'))

    const found = theSessionProcessForTheWaiter(shellPid, { CLAUDE_PID: String(claudePid) })

    expect(found.recorded, String(found.why)).toBe(true)
    expect(found.pid).toBe(claudePid)
    expect(found.foundBy).toBe('CLAUDE_PID')
  })

  it('refuses a CLAUDE_PID naming a shell, and says so', async () => {
    const shellPid = await aShellWithNothingAbove()

    const found = theSessionProcessForTheWaiter(shellPid, { CLAUDE_PID: String(shellPid) })

    expect(found.recorded).toBe(false)
    expect(found.pid).toBeNull()
    expect(found.why).toContain(`CLAUDE_PID names ${String(shellPid)}, which is not a running claude program`)
  })
})

// ============================================================ the office's door

let t: TestDb
let app: FastifyInstance
let machines: typeof import('../src/server/lib/machines.ts')
let records: typeof import('../src/server/lib/records.ts')

const CONVERSATION = '32444539-7b2c-4f1a-9d3e-0a1b2c3d4e5f'
const AS_ARGUS = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
}

/** When a process began, read from `ps` rather than from the module this file measures. */
function theStartStampOf(pid: number): string {
  const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim()
  return localStamp(new Date(out))
}

describe("the office's door reads the process itself", () => {
  beforeAll(async () => {
    t = await freshDb()
    machines = await import('../src/server/lib/machines.ts')
    records = await import('../src/server/lib/records.ts')
    const built = await apiApp()
    app = built.app
    await app.ready()
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: THE_TEST_OFFICES_SECRETARY.name,
      data: { handle: THE_TEST_OFFICES_SECRETARY.handle, runtime: 'claude-code', state: 'active' },
      actor: { type: 'human', id: THE_PERSON },
    })
  })

  afterAll(async () => {
    await app.close()
    t.close()
  })

  it('refuses a process that only mentions claude, and takes one named claude past that check', async () => {
    const folder = aFolder()
    const transcript = join(folder, 'transcript.jsonl')
    writeFileSync(transcript, '')
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'A terminal somebody opened',
      data: {
        state: 'running',
        runtime: 'claude-code',
        extra: { discovered: { tool: 'claude-code', externalId: CONVERSATION, logPath: transcript } },
      },
      actor: { type: 'human', id: THE_PERSON },
    }).id
    const held = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`,
      headers: AS_ARGUS,
      payload: { session, machine: machines.thisMachine(), runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body).toBe(201)
    const before = JSON.stringify(records.getRecord(session)?.data)

    // A NODE WHOSE COMMAND LINE HAS THE SEGMENT `claude`. Its name and executable are node's.
    const mentionsPid = startAlone(process.execPath, [
      '-e',
      'setInterval(() => {}, 1_000_000)',
      `${folder}/kit/claude/waiter.sh`,
    ])
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(theNameOf(mentionsPid)).toBe('node')
    expect(theCommandLineOf(mentionsPid)).toContain('/kit/claude/waiter.sh')

    const mentions = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/process`,
      headers: AS_ARGUS,
      payload: { session, pid: mentionsPid, pidStartedAt: theStartStampOf(mentionsPid) },
    })
    expect(mentions.statusCode).toBe(409)
    expect((mentions.json() as { error: string }).error).toBe(
      `Process ${String(mentionsPid)} is not the claude program. Nothing was written.`,
    )

    // THE STAND-IN NAMED `claude` PASSES THIS CHECK and is refused by the next one: nothing ties it
    // to the record's conversation.
    const claudePid = startAlone(aFakeClaude(folder, 'while :; do sleep 1; done'))
    await new Promise((resolve) => setTimeout(resolve, 200))
    const named = await app.inject({
      method: 'POST',
      url: `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/process`,
      headers: AS_ARGUS,
      payload: { session, pid: claudePid, pidStartedAt: theStartStampOf(claudePid) },
    })
    expect(named.statusCode).toBe(409)
    expect((named.json() as { error: string }).error).toContain(
      `Nothing Mole Office can read ties process ${String(claudePid)} to the conversation`,
    )

    expect(JSON.stringify(records.getRecord(session)?.data)).toBe(before)
  })
})
