// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS, A ROW ABOUT A STARTER THAT HAS ENDED IS ALIVE WHILE THE PROGRAM IT STARTED RUNS IN ITS JOB OBJECT.
 *
 * On Windows this office starts a program through a starter (src/config/systems/windows-starts.mjs). The starter makes
 * the Job Object named for its own pid, starts the program in it and waits for it. The pid a row records is the
 * starter's. The starter ends when the program that asked for the start ends, and the program goes on. On a Windows 11
 * machine (wave 13t, round W9, the third label) the message worker's run outlived the server and the worker. At the next
 * start the starter's pid read as gone, its row was released, and the run was marked as crashed, with "nothing is
 * running for it", while the run's program still ran.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * Through the ledger's own reading, with a stand-in Windows machine whose starter has ended:
 *
 *   1. A row this office started is alive while a child of the starter runs in the starter's Job Object. Its detail
 *      names the starter's end, the program's pid and its command. The run is read as still running.
 *   2. It is gone, in the words used before, when the starter's Job Object holds no child of the starter, or does not
 *      exist. The worker's own starter is this case: the worker's run is the worker's child, not the starter's.
 *   3. It is gone when the only child in the Job Object started more than a second before the row's process.
 *   4. It is unknown when the Job Object cannot be read, and the reason is shown.
 *   5. A row this office did not start is gone, in the words used before, and no Job Object is read.
 *   6. On a machine whose probe cannot read a Job Object (Linux, the Mac) the row is gone, in the words used before.
 *
 * Through the Windows probe, with a stand-in for PowerShell:
 *
 *   7. It runs one script, which opens the Job Object named for the starter with the right to ask and no other. It
 *      answers the starter's children that the Job Object holds, with their start and command line, or their name in
 *      brackets when Windows gave no command line.
 *   8. A Job Object that does not exist is an empty list.
 *   9. A refusal, a failure, a script that did not run, an answer it does not know, a row about a process whose parent
 *      is another, and a child in the Job Object with no start are each a failure to read, with the reason, and never
 *      an empty list.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - the ledger does not ask the probe, as before this file: cases 1, 2 and 4 go red;
 *   - the ledger takes a program that started before the row: case 3 goes red;
 *   - the ledger asks about a row this office did not start: case 5 goes red;
 *   - the probe keeps every child of the starter, in the Job Object or not: case 7 goes red;
 *   - the probe does not check a row's parent: case 9 goes red;
 *   - the probe answers a refused Job Object as an empty list: case 9 goes red.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type MergeQueueLib = typeof import('../src/server/lib/merge-queue.ts')
type WindowsProbeLib = typeof import('../src/server/lib/windows-probe.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>
type ProgramsRead = ReturnType<NonNullable<OsProbe['programsOfAnEndedStarter']>>
type SharedWithLinux = ConstructorParameters<WindowsProbeLib['WindowsProbe']>[0]
type ProcessReader = ConstructorParameters<WindowsProbeLib['WindowsProbe']>[1]
type Did = ReturnType<NonNullable<ConstructorParameters<WindowsProbeLib['WindowsProbe']>[2]>['powershell']>

let t: TestDb
let res: ResourcesLib
let queue: MergeQueueLib
let windows: WindowsProbeLib

const STARTER = 7100
const PROGRAM = 7200

const aProcess = (pid: number, ppid: number, command: string, startedAt: string): OsProcess => ({ pid, pgid: 0, ppid, command, startedAt })

/** The stamp one minute before another, in the same local form. */
function aMinuteBefore(stamp: string): string {
  const at = new Date(stamp.replace(' ', 'T'))
  at.setMinutes(at.getMinutes() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/** Every starter the Job Objects were asked about, in order. */
let askedAbout: number[] = []

/**
 * A machine on which `running` is running, and which answers `jobObject` about a starter's Job Object. Without
 * `jobObject` the probe has no way to read one, as on Linux and the Mac.
 */
function aMachine(platform: string, running: OsProcess[], jobObject?: (starter: number) => ProgramsRead): OsProbe {
  const live = new Map(running.map((p) => [p.pid, p]))
  const nothing = (): never => {
    throw new Error('this stand-in machine answers only who a process is')
  }
  return {
    platform,
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: nothing,
    listeningPorts: () => [],
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: () => {
      throw new Error('this test never signals a process')
    },
    stopContainer: nothing,
    ...(jobObject === undefined
      ? {}
      : {
          programsOfAnEndedStarter: (starter: number) => {
            askedAbout.push(starter)
            return jobObject(starter)
          },
        }),
  }
}

/** A run's session and its starter's row, registered while the starter ran, as the worker registers it. */
function aRunsRow(startedByTheProduct: boolean): { session: string; row: string; startedAt: string } {
  const filed = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'the session of a run the message worker started',
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true },
    actor: t.api.HUMAN,
  })
  const startedAt = filed.createdAt
  res.useOsProbe(aMachine('win32', [aProcess(STARTER, 7001, "powershell.exe -EncodedCommand the run's starter", startedAt)]))
  const row = res.registerResource({
    workspaceId: 'default',
    sessionRecordId: filed.id,
    type: 'process',
    key: String(STARTER),
    detail: 'a claude-code run answering a message',
    ...(startedByTheProduct ? { startedByTheProduct: true } : {}),
    actor: t.api.HUMAN,
  })
  return { session: filed.id, row: row.id, startedAt }
}

function theRowsLiveness(session: string) {
  const [row, ...more] = res.listResources({ workspaceId: 'default', sessionRecordId: session })
  expect(more).toEqual([])
  return row!.liveness
}

const THE_OLD_WORDS = { state: 'gone', detail: `Nothing is running as pid ${STARTER}.` }

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  queue = await import('../src/server/lib/merge-queue.ts')
  windows = await import('../src/server/lib/windows-probe.ts')
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  askedAbout = []
})

afterAll(() => {
  t.close()
})

describe('a row this office started, whose starter has ended, on Windows', () => {
  it('1: is alive while a child of the starter runs in its Job Object, and the run is read as still running', () => {
    const run = aRunsRow(true)
    const program = aProcess(PROGRAM, STARTER, 'node.exe stand-in-run.mjs', run.startedAt)
    res.useOsProbe(aMachine('win32', [], () => ({ read: true, programs: [program] })))
    const liveness = theRowsLiveness(run.session)
    expect(liveness.state).toBe('alive')
    expect(liveness).toMatchObject({ detail: expect.stringContaining(`Pid ${STARTER}, the starter`) })
    expect(liveness).toMatchObject({ detail: expect.stringContaining(`pid ${PROGRAM}`) })
    expect(liveness).toMatchObject({ detail: expect.stringContaining('node.exe stand-in-run.mjs') })
    expect(askedAbout).toEqual([STARTER])
    expect(queue.theLastToolRunStillRuns('default', { session: run.session })).not.toBeNull()
  })

  it("2: is gone, in the words used before, when the Job Object holds no child of the starter, as for the worker's starter", () => {
    const run = aRunsRow(true)
    res.useOsProbe(aMachine('win32', [], () => ({ read: true, programs: [] })))
    expect(theRowsLiveness(run.session)).toEqual(THE_OLD_WORDS)
    expect(askedAbout).toEqual([STARTER])
    expect(queue.theLastToolRunStillRuns('default', { session: run.session })).toBeNull()
  })

  it("3: is gone when the only child in the Job Object started more than a second before the row's process", () => {
    const run = aRunsRow(true)
    const older = aProcess(PROGRAM, STARTER, 'node.exe an-older-run.mjs', aMinuteBefore(run.startedAt))
    res.useOsProbe(aMachine('win32', [], () => ({ read: true, programs: [older] })))
    expect(theRowsLiveness(run.session)).toEqual(THE_OLD_WORDS)
  })

  it('4: is unknown, with the reason, when the Job Object cannot be read', () => {
    const run = aRunsRow(true)
    res.useOsProbe(aMachine('win32', [], () => ({ read: false, reason: 'Windows refused access to the Job Object.' })))
    const liveness = theRowsLiveness(run.session)
    expect(liveness.state).toBe('unknown')
    expect(liveness).toMatchObject({ reason: expect.stringContaining('Windows refused access to the Job Object.') })
    expect(liveness).toMatchObject({ reason: expect.stringContaining(`Nothing is running as pid ${STARTER}`) })
  })
})

describe('a row whose pid has ended, read as before', () => {
  it('5: a row this office did not start is gone, in the words used before, and no Job Object is read', () => {
    const run = aRunsRow(false)
    const program = aProcess(PROGRAM, STARTER, 'node.exe stand-in-run.mjs', run.startedAt)
    res.useOsProbe(aMachine('win32', [], () => ({ read: true, programs: [program] })))
    expect(theRowsLiveness(run.session)).toEqual(THE_OLD_WORDS)
    expect(askedAbout).toEqual([])
  })

  it.each(['linux', 'darwin'])('6: on a machine that cannot read a Job Object (%s), the row is gone, in the words used before', (platform) => {
    const run = aRunsRow(true)
    res.useOsProbe(aMachine(platform, []))
    expect(theRowsLiveness(run.session)).toEqual(THE_OLD_WORDS)
    expect(queue.theLastToolRunStillRuns('default', { session: run.session })).toBeNull()
  })
})

// ---------------------------------------------------------------------------- the Windows probe's reading

const STARTED_MS = 1_793_350_000_000
const printed = (stdout: string): Did => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })
const aRow = (pid: number, ppid: number, command: string | null, name = 'node.exe') => ({
  ProcessId: pid,
  ParentProcessId: ppid,
  CreationDate: STARTED_MS,
  Name: name,
  CommandLine: command,
})

/** A Windows probe over a stand-in for PowerShell. Only the Job Object's reading is asked of it. */
function aWindowsProbe(answer: Did): { probe: InstanceType<WindowsProbeLib['WindowsProbe']>; scripts: string[] } {
  const scripts: string[] = []
  const notAsked = new Proxy({}, {
    get: (_target, name) => {
      throw new Error(`this test does not ask the probe's ${String(name)}`)
    },
  })
  const powershell = (script: string): Did => {
    scripts.push(script)
    return answer
  }
  // The way that waits for PowerShell answers as the way that holds the thread does.
  const commands = { powershell, startPowerShell: async (script: string): Promise<Did> => powershell(script) }
  return { probe: new windows.WindowsProbe(notAsked as SharedWithLinux, notAsked as ProcessReader, commands), scripts }
}

describe("the Windows probe's reading of a starter's Job Object", () => {
  it("7: runs one script that opens the starter's Job Object to ask only, and answers the starter's children in it", () => {
    const { probe, scripts } = aWindowsProbe(
      printed(
        `{"job":"there","pids":[${PROGRAM},7300,7400]}\r\n` +
          `${JSON.stringify([aRow(PROGRAM, STARTER, 'node.exe stand-in-run.mjs'), aRow(7500, STARTER, null, 'conhost.exe')])}\r\n`,
      ),
    )
    const read = probe.programsOfAnEndedStarter(STARTER)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain(`Local\\mole-office-group-${STARTER}`)
    expect(scripts[0]).toContain('OpenJobObjectW(4, false, name)')
    expect(scripts[0]).toContain(`ParentProcessId = ${STARTER}`)
    expect(read).toEqual({
      read: true,
      programs: [
        expect.objectContaining({ pid: PROGRAM, ppid: STARTER, pgid: 0, command: 'node.exe stand-in-run.mjs', startedInstant: expect.any(String) }),
      ],
    })
    if (!read.read) throw new Error('unreachable')
    expect(new Date(read.programs[0]!.startedInstant!).getTime()).toBe(STARTED_MS)
  })

  it('7b: shows the name in brackets for a child in the Job Object whose command line Windows did not give', () => {
    const { probe } = aWindowsProbe(printed(`{"job":"there","pids":[${PROGRAM}]}\r\n${JSON.stringify([aRow(PROGRAM, STARTER, null)])}\r\n`))
    expect(probe.programsOfAnEndedStarter(STARTER)).toEqual({ read: true, programs: [expect.objectContaining({ pid: PROGRAM, command: '[node.exe]' })] })
  })

  it('8: answers an empty list when no such Job Object exists', () => {
    const { probe } = aWindowsProbe(printed('{"job":"missing"}\r\n'))
    expect(probe.programsOfAnEndedStarter(STARTER)).toEqual({ read: true, programs: [] })
  })

  it.each<[string, Did, string]>([
    ['a refused Job Object', printed('{"job":"refused"}\r\n'), 'Windows refused access to it'],
    ['a failed reading', printed('{"job":"failed","error":234}\r\n'), 'Windows error 234'],
    ['a script that did not run', { command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run' }, 'powershell.exe could not be run'],
    ['a script that failed', { command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Access denied.\r\n' }, 'Access denied.'],
    ['an answer that is not JSON', printed('not JSON\r\n'), 'was not JSON'],
    ['a list with no rows after it', printed(`{"job":"there","pids":[${PROGRAM}]}\r\n`), 'not a list of rows'],
    ['a row about a process whose parent is another', printed(`{"job":"there","pids":[${PROGRAM}]}\r\n${JSON.stringify([aRow(PROGRAM, 7001, 'x')])}\r\n`), 'whose parent is 7001'],
    ['a child in the Job Object with no start', printed(`{"job":"there","pids":[${PROGRAM}]}\r\n[{"ProcessId":${PROGRAM},"ParentProcessId":${STARTER},"CreationDate":null,"Name":"node.exe","CommandLine":"x"}]\r\n`), 'no start'],
  ])('9: answers %s as a failure to read, with the reason, never an empty list', (_what, did, said) => {
    const { probe } = aWindowsProbe(did)
    const read = probe.programsOfAnEndedStarter(STARTER)
    expect(read.read).toBe(false)
    expect(read).toMatchObject({ reason: expect.stringContaining(said) })
    expect(read).toMatchObject({ reason: expect.stringContaining(`Local\\mole-office-group-${STARTER}`) })
  })
})
