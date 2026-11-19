// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOOK'S WALK ON WINDOWS READS THE PROCESSES ONCE, AND STOPS AT claude.exe. Wave 13t, round W45.
 *
 * Before its first request the session hook walks up its parent chain to the claude program, by
 * `theSessionProcessForTheWaiter` in src/config/session-process.mjs. On Windows each question about a process was one
 * PowerShell script of about a second, and the walk asks four questions about each process it passes. On the owner's
 * Windows 11 machine on 7 November 2026, the hook started as Claude Code starts it ran 13 scripts, one after another,
 * for 12.6 seconds before its first request. Its budget of 10 seconds was gone, so every read after the first failed.
 * The walk did not stop at claude.exe either. The check of the program's path split it at '/' only, so a Windows path
 * was one segment, and the walk went on to the end of the chain.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * The chain is modelled on a hook that claude.exe started through Git's bash.exe: bash.exe, claude.exe, Windows
 * Terminal, explorer.exe and userinit.exe. The reader is the real Windows reader, over a stand-in for PowerShell that
 * answers from that chain and counts each script both ways.
 *
 *   1. The walk stops at claude.exe and records it, with its start.
 *   2. Inside one reading of every process, the walk runs that one script, in the way that waits, and nothing else. A
 *      question asked after the walk runs a script of its own again.
 *   3. A reading of every process that failed is thrown at each question the walk asks. It is never read as "no
 *      process has that number". So is a reading with a row whose process number is not a whole number. A listing
 *      holds the System Idle Process as number 0, as Windows lists it, and that row is read.
 *   4. An act that waits is refused, because the reading answers it only while it runs.
 *   5. A process whose program is claude.exe at a Windows path is the claude program. Git's bash.exe is not, though its
 *      command line names claude.exe.
 *
 * WHY CASE 6 READS THE HOOK'S SOURCE. The hook is a script that runs its whole start when it is loaded, and here it
 * would read this machine's /proc. It cannot be run here as Windows. So the case reads the hook's one call of the walk.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { WhatACommandDid } from '../src/config/process-reader.mjs'
import * as sessionProcess from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { windowsProcessReader } from '../src/config/systems/windows-processes.mjs'

const { isTheClaudeProgram, theSessionProcessForTheWaiter } = sessionProcess

const AN_HOUR_AGO = Math.floor((Date.now() - 3_600_000) / 1000) * 1000

/** The processes of the chain, from the hook's parent up. */
const BASH = 9001
const CLAUDE = 9000
const TERMINAL = 8000
const EXPLORER = 700
const USERINIT = 600

/** One row as the reader's script prints it. */
interface ARow {
  ProcessId: number | null
  ParentProcessId: number
  CreationDate: number | null
  Name: string
  ExecutablePath: string | null
  CommandLine: string | null
}

const aRow = (pid: number, ppid: number, name: string, program: string, commandLine: string): ARow => ({
  ProcessId: pid,
  ParentProcessId: ppid,
  CreationDate: AN_HOUR_AGO,
  Name: name,
  ExecutablePath: program,
  CommandLine: commandLine,
})

const CLAUDE_ON_WINDOWS = 'C:\\Users\\a\\.local\\bin\\claude.exe'
const THE_CHAIN: readonly ARow[] = [
  aRow(BASH, CLAUDE, 'bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe', `bash.exe -c "node for-agents/session-hook.mjs" "${CLAUDE_ON_WINDOWS}"`),
  aRow(CLAUDE, TERMINAL, 'claude.exe', CLAUDE_ON_WINDOWS, `"${CLAUDE_ON_WINDOWS}" --resume`),
  aRow(TERMINAL, EXPLORER, 'WindowsTerminal.exe', 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsTerminal\\WindowsTerminal.exe', 'wt.exe'),
  aRow(EXPLORER, USERINIT, 'explorer.exe', 'C:\\Windows\\explorer.exe', 'C:\\Windows\\Explorer.EXE'),
  aRow(USERINIT, 4, 'userinit.exe', 'C:\\Windows\\System32\\userinit.exe', 'C:\\Windows\\system32\\userinit.exe'),
]
/** The two rows every listing of a Windows machine begins with, which no walk reaches: System, and the System Idle Process as 0. */
const THE_SYSTEMS_OWN: readonly ARow[] = [
  { ProcessId: 0, ParentProcessId: 0, CreationDate: null, Name: 'System Idle Process', ExecutablePath: null, CommandLine: null },
  { ProcessId: 4, ParentProcessId: 0, CreationDate: AN_HOUR_AGO, Name: 'System', ExecutablePath: null, CommandLine: null },
]

const printed = (stdout: string): WhatACommandDid => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })

/** What the script that reads every process prints when a case says it fails. */
let everyProcessFails: WhatACommandDid | null = null

/** What one script asks, in words, and what it prints about the chain. */
function whatAScriptAsks(script: string): { asks: string; answer: WhatACommandDid } {
  const one = /-Filter "ProcessId = (\d+)"/u.exec(script)
  if (one !== null) {
    const row = THE_CHAIN.find((each) => each.ProcessId === Number(one[1]))
    return { asks: `process ${one[1]}`, answer: printed(`${JSON.stringify(row === undefined ? [] : [row])}\r\n`) }
  }
  if (script.includes('Get-CimInstance -ClassName Win32_Process |') && script.includes('Name = $_.Name')) {
    return { asks: 'every process', answer: everyProcessFails ?? printed(`${JSON.stringify([...THE_SYSTEMS_OWN, ...THE_CHAIN])}\r\n`) }
  }
  throw new Error(`This stand-in for PowerShell does not know the script that begins ${JSON.stringify(script.slice(0, 160))}.`)
}

/** What each script asked: run in the way that holds the thread, and run in the way that waits for it. */
const held: string[] = []
const waited: string[] = []

const commands = {
  powershell: (script: string): WhatACommandDid => {
    const { asks, answer } = whatAScriptAsks(script)
    held.push(asks)
    return answer
  },
  startPowerShell: async (script: string): Promise<WhatACommandDid> => {
    const { asks, answer } = whatAScriptAsks(script)
    waited.push(asks)
    await new Promise((later) => setImmediate(later))
    return answer
  },
}

let reader = windowsProcessReader(commands)

/** The one reading the walk is made inside, which session-process.mjs must export for these cases to run. */
type ReadEveryProcessFirst = <T>(act: () => T, reads?: typeof reader) => Promise<T>
function theOneReading(): ReadEveryProcessFirst {
  const exported = (sessionProcess as unknown as Record<string, unknown>)['readEveryProcessFirst']
  expect(typeof exported, 'src/config/session-process.mjs exports no readEveryProcessFirst, so the walk cannot be made inside one reading').toBe('function')
  return exported as ReadEveryProcessFirst
}

beforeEach(() => {
  held.length = 0
  waited.length = 0
  everyProcessFails = null
  reader = windowsProcessReader(commands)
})

describe("the hook's walk on Windows", () => {
  it('1. stops at claude.exe and records it, with its start', () => {
    const facts = theSessionProcessForTheWaiter(BASH, {}, reader)
    expect(facts, `the walk ran ${String(held.length)} scripts: ${held.join(', ')}`).toMatchObject({
      recorded: true,
      pid: CLAUDE,
      pidStartedAt: localStampOf(new Date(AN_HOUR_AGO)),
      foundBy: 'the walk',
    })
  })

  it('2. inside one reading of every process, runs that one script, in the way that waits, and nothing else', async () => {
    const readEveryProcessFirst = theOneReading()
    const facts = await readEveryProcessFirst(() => theSessionProcessForTheWaiter(BASH, {}, reader), reader)
    expect(held, 'these scripts held the thread').toEqual([])
    expect(waited).toEqual(['every process'])
    expect(facts).toMatchObject({ recorded: true, pid: CLAUDE, pidStartedAt: localStampOf(new Date(AN_HOUR_AGO)) })
    // The reading answered only while the walk ran.
    expect(reader.commandLineOf(CLAUDE)).toBe(THE_CHAIN[1]?.CommandLine)
    expect(held).toEqual([`process ${String(CLAUDE)}`])
  })

  it('3. a reading of every process that failed is thrown at each question, never read as no process', async () => {
    const readEveryProcessFirst = theOneReading()
    everyProcessFails = { command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Access is denied.' }
    // The words are the stand-in's own, so the failure reached the question as the script said it.
    await expect(readEveryProcessFirst(() => theSessionProcessForTheWaiter(BASH, {}, reader), reader)).rejects.toThrow('Access is denied.')
    await expect(readEveryProcessFirst(() => reader.processAt(USERINIT), reader)).rejects.toThrow('Access is denied.')
    expect(held).toEqual([])
  })

  it('3b. a reading with a row whose process number is not a whole number is thrown at each question too', async () => {
    const readEveryProcessFirst = theOneReading()
    everyProcessFails = printed(`${JSON.stringify([...THE_SYSTEMS_OWN, ...THE_CHAIN, { ...THE_CHAIN[0], ProcessId: null }])}\r\n`)
    await expect(readEveryProcessFirst(() => theSessionProcessForTheWaiter(BASH, {}, reader), reader)).rejects.toThrow()
    await expect(readEveryProcessFirst(() => reader.processAt(USERINIT), reader)).rejects.toThrow()
    expect(held).toEqual([])
  })

  it('4. an act that waits is refused', async () => {
    const readEveryProcessFirst = theOneReading()
    await expect(readEveryProcessFirst(() => Promise.resolve(reader.parentOf(BASH)), reader)).rejects.toThrow()
    // And the reading is not lent after it.
    held.length = 0
    expect(reader.parentOf(BASH)).toBe(CLAUDE)
    expect(held).toEqual([`process ${String(BASH)}`])
  })

  it('5. knows claude.exe at a Windows path for the claude program, and not the bash.exe that names it', () => {
    expect(isTheClaudeProgram(CLAUDE, reader), CLAUDE_ON_WINDOWS).toBe(true)
    expect(isTheClaudeProgram(BASH, reader), String(THE_CHAIN[0]?.CommandLine)).toBe(false)
  })

})
