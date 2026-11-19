// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE macOS PROBE AND THE macOS PROCESS READER, AND THE CHOICE OF BOTH BY PLATFORM.
 *
 * src/server/lib/darwin-probe.ts reads processes and listening sockets through the macOS process
 * reader in src/config/process-reader.mjs, which runs `ps` and `lsof` and reads their lines. The
 * service lock, the worker and the session hook read processes through the same reader
 * (src/config/session-process.mjs). `theProbeForThisPlatform` in lib/resources.ts and
 * `theProcessReaderFor` choose them on 'darwin' and nowhere else.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURES WERE WRITTEN FROM THE DOCUMENTATION. THEY WERE NOT RECORDED ON A MAC.
 * ---------------------------------------------------------------------------------------
 *
 * Nobody working on this has a Mac yet. Every `ps` and `lsof` answer here is a file in
 * tests/fixtures/macos/, written in the format Apple's ps manual and source and lsof's manual give,
 * and tests/fixtures/macos/sources.json names, for each file, the command and the passage it rests
 * on. Until wave 13p round 18 the answers were hand-written text in this file with no source. They
 * prove the readers read that format. They do not prove a Mac answers in it.
 *
 * WHAT ONLY A REAL MAC CAN PROVE, for the day the owner's MacBook joins. Run each command there, save its
 * output over the fixture named, set `recorded` in sources.json, and run this file again:
 *   1. `LC_ALL=C ps -o pid=,ppid=,pgid=,stat=,lstart=,command= -p <pid>` prints one line in the order
 *      and the date format of ps-one-process.txt, and exits 0;
 *   2. the same for a pid nobody has prints nothing and exits 1 (Apple's ps.c says so; not seen);
 *   3. a process whose arguments ps may not read: `(name)`, as Apple's print.c prints, or `[name]`,
 *      as Apple's ps manual says (the reader takes both);
 *   4. `ps -o ucomm= -p <pid>` for a running Claude Code prints `claude`, so `isTheClaudeProgram`
 *      knows it by name;
 *   5. `lsof -a -p <pid> -d txt -Fn` lists the program's own file first, and for Claude Code that
 *      path has a segment `claude`;
 *   6. the lsof macOS ships prints the `f` field with `-Fn` (lsof 4.88 to 4.93.2 do; later ones do
 *      not, and the readers take both);
 *   7. a time zone with summer time: `lstart` read back through `new Date(y, m, d, ...)` names the
 *      same moment twice in a row, so the service lock keeps its own start time;
 *   8. the server starts, takes the service lock and lets it go on the Mac itself:
 *      tests/the-server-starts-on-a-mac-as-far-as-linux-can-tell.test.ts does this on Linux with a
 *      `ps` that answers in these formats, which is not the same as macOS answering.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE RUNS, recorded in the commit message with their logs under .logs/.
 * ---------------------------------------------------------------------------------------
 */

import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type DarwinLib = typeof import('../src/server/lib/darwin-probe.ts')
type WhatACommandDid = import('../src/server/lib/darwin-probe.ts').WhatACommandDid
type ReaderLib = typeof import('../src/config/process-reader.mjs')
type BorrowedByTheMac = import('../src/server/lib/darwin-probe.ts').BorrowedByTheMac

let t: TestDb
let res: ResourcesLib
let mac: DarwinLib
let reading: ReaderLib
let scratch: string

beforeAll(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  mac = await import('../src/server/lib/darwin-probe.ts')
  reading = await import('../src/config/process-reader.mjs')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'darwin-probe-test-'))
})

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true })
})

// ============================================================ the fixtures, written from the documentation

const FIXTURES = fileURLToPath(new URL('./fixtures/macos/', import.meta.url))
/** One answer from tests/fixtures/macos/, as the command named for it in sources.json prints it. */
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const SOURCES = JSON.parse(fixture('sources.json')) as { recorded: string | null; fixtures: Record<string, { command: string; source: string }> }

const PS_ONE = fixture('ps-one-process.txt')
const PS_TABLE = fixture('ps-every-process.txt')
const PS_ENDED = fixture('ps-a-process-that-has-ended.txt')
const LSOF_CWDS = fixture('lsof-working-directories.txt')
const LSOF_LISTEN = fixture('lsof-listening-sockets.txt')
const LSOF_FILES = fixture('lsof-open-files.txt')
const LSOF_TXT = fixture('lsof-program-file.txt')
const PS_UCOMM = fixture('ps-ucomm.txt')
/** The first line of the table, launchd, as `ps -p 1` answers it. */
const PS_LAUNCHD = `${PS_TABLE.split('\n')[0] ?? ''}\n`

describe('the fixtures', () => {
  it('each name the command they answer and the source of their format, and say they were not recorded', () => {
    const files = readdirSync(FIXTURES).filter((name) => name !== 'sources.json').sort()
    expect(files.length).toBe(8)
    expect(Object.keys(SOURCES.fixtures).sort()).toEqual(files)
    for (const [name, one] of Object.entries(SOURCES.fixtures)) {
      expect(one.command, name).toMatch(/^(?:LC_ALL=C )?(?:ps|lsof) /u)
      expect(one.source.length, name).toBeGreaterThan(60)
    }
    // NOT RECORDED ON A MAC, and the file says so where it is read.
    expect(SOURCES.recorded).toBeNull()
  })
})

// ============================================================ a machine made of text

/** What a command did, before the test machine adds the command's name to it. */
type Answer = { ran: true; status: number; stdout: string; stderr: string } | { ran: false; reason: string }
const said = (stdout: string): Answer => ({ ran: true, status: 0, stdout, stderr: '' })
/** What ps and lsof both answer about a pid or a socket they did not find: exit 1 and nothing said. */
const NOTHING_MATCHED: Answer = { ran: true, status: 1, stdout: '', stderr: '' }
const NOT_RUN: Answer = { ran: false, reason: 'lsof could not be run: spawnSync lsof ENOENT' }

/**
 * A pair of commands that answers from a table keyed by the arguments, and records what it was asked.
 * `run` is the pair; `reader` is the macOS process reader over it, which is what the probe is given.
 */
function commands(answers: Record<string, Answer>) {
  const asked: string[] = []
  const answer = (name: string, args: readonly string[]): WhatACommandDid => {
    const key = `${name} ${args.join(' ')}`
    asked.push(key)
    const found = answers[key]
    if (found === undefined) throw new Error(`the test machine was asked something it has no answer for: ${key}`)
    return { command: name, ...found }
  }
  const run = { ps: (args: readonly string[]) => answer('ps', args), lsof: (args: readonly string[]) => answer('lsof', args) }
  return { asked, run, reader: reading.darwinProcessReader(run) }
}

/** The borrowed half, as a record of which methods were handed on. */
function sharedThatRecords(): { calls: string[]; shared: BorrowedByTheMac } {
  const calls: string[] = []
  const note = (what: string) => {
    calls.push(what)
  }
  const shared: BorrowedByTheMac = {
    checkout: () => (note('checkout'), { head: null, branch: null, dirty: null, isWorktree: null, couldNotRead: [] }),
    gpu: () => (note('gpu'), { available: false, reason: 'test' }),
    containers: () => (note('containers'), { available: false, reason: 'test' }),
    locks: () => (note('locks'), { files: [], unreadable: [] }),
    machineName: () => (note('machineName'), 'a-mac'),
    ownAddresses: () => (note('ownAddresses'), []),
    whatAnAgentToolSaysAboutItsKey: () => (note('key'), { state: 'nobody-has-looked', says: 'test', asked: 'test' }),
    startTheMessageWorker: () => (note('startTheMessageWorker'), { pid: 1, pgid: 1 }),
    startTheOverdueHandBackHelper: (script) => (note(`startTheOverdueHandBackHelper ${script}`), {} as ReturnType<BorrowedByTheMac['startTheOverdueHandBackHelper']>),
    tmuxPanes: (format) => (note(`tmuxPanes ${format}`), Promise.resolve({ ok: true, out: '' })),
    killProcessGroup: (pgid, signal) => note(`killProcessGroup ${pgid} ${signal}`),
    stopContainer: (name) => note(`stopContainer ${name}`),
    theVersionOfAProgram: (program) => (note(`theVersionOfAProgram ${program}`), Promise.resolve({ path: null, version: 'test', versionWasRead: false })),
  }
  return { calls, shared }
}

const PS = '-o pid=,ppid=,pgid=,stat=,lstart=,command='
const PS_ALL = 'ps -axo pid=,ppid=,pgid=,stat=,lstart=,command='

// ============================================================ the readers

describe('reading a line of ps', () => {
  it('reads a normal process, with its state and its start time in local time to the second', () => {
    const one = reading.aProcessFromAPsLine(PS_ONE.trimEnd())
    expect(one).toEqual({
      pid: 4242,
      ppid: 1,
      pgid: 4242,
      state: 'Ss',
      command: '/usr/local/bin/node /Volumes/Work/mole-office/src/server/index.ts --port 39017',
      startedAt: new Date(2026, 8, 30, 9, 14, 7),
    })
    // AND THE PROBE WRITES IT IN THE STAMP THE LINUX PROBE WRITES.
    expect(mac.anOsProcess(one!).startedAt).toBe('2026-09-30 09:14:07')
  })

  it('keeps a command with spaces and brackets whole, and a day of one digit', () => {
    const rows = reading.processesFromPs(PS_TABLE)
    expect(rows.map((r) => r.command)).toEqual([
      '/sbin/launchd',
      '(WindowServer)',
      '/usr/local/bin/node /Volumes/Work/mole-office/src/server/index.ts --port 39017',
      '/usr/local/bin/node /Volumes/Work/mole-office/node_modules/.bin/vite',
      '/bin/sh -c echo (done)',
      '/Applications/Visual Studio Code.app/Contents/MacOS/Electron --type=renderer (helper)',
      '<defunct>',
    ])
    expect(mac.anOsProcess(rows[0]!).startedAt).toBe('2026-09-02 08:01:55')
    expect(mac.anOsProcess(rows[5]!).startedAt).toBe('2026-10-01 10:00:00')
    expect(rows[6]?.state).toBe('Z')
  })

  it('refuses a line it cannot read, rather than leave the process out', () => {
    expect(reading.aProcessFromAPsLine('  4242 1 4242 Ss yesterday /bin/sh')).toBeNull()
    expect(reading.aProcessFromAPsLine(' 4242     1  4242 Ss   Wed Sep 31 09:14:07 2026     /bin/sh')).toBeNull()
    expect(() => reading.processesFromPs(`${PS_ONE}garbage\n`)).toThrow(/cannot read: "garbage"/)
  })

  it('reads lsof names with or without the f field, which lsof 4.88 to 4.93.2 add and later ones do not', () => {
    expect(reading.namesByProcess(LSOF_CWDS).get(4243)).toEqual(['/Volumes/Work/mole-office'])
    expect(reading.namesByProcess('p4243\nn/Volumes/Work/mole-office\n').get(4243)).toEqual(['/Volumes/Work/mole-office'])
  })
})

describe('the macOS process reader, which the lock, the worker and the hook read through', () => {
  it('reads one process, a process that has ended, and a pid nobody has', () => {
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: said(PS_ONE),
      [`ps ${PS} -p 7311`]: said(PS_ENDED),
      [`ps ${PS} -p 999`]: NOTHING_MATCHED,
    })
    expect(reader.processAt(4242)).toEqual({ here: true, pid: 4242, ppid: 1, pgid: 4242, state: 'Ss', startedAt: new Date(2026, 8, 30, 9, 14, 7) })
    expect(reader.processAt(999)).toEqual({ here: false })
    expect(reader.startTimeOf(4242)).toEqual(new Date(2026, 8, 30, 9, 14, 7))
    expect(reader.parentOf(4242)).toBe(1)
    expect(reader.startTimeOf(999)).toBeNull()
  })

  it('answers the service lock as Linux does: running with its start and group, ended, or gone', async () => {
    const { theProcessAt } = await import('../src/config/session-process.mjs')
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: said(PS_ONE),
      [`ps ${PS} -p 7311`]: said(PS_ENDED),
      [`ps ${PS} -p 999`]: NOTHING_MATCHED,
    })
    expect(theProcessAt(4242, reader)).toEqual({ here: true, startedAt: new Date(2026, 8, 30, 9, 14, 7).toISOString(), pgid: 4242 })
    expect(theProcessAt(7311, reader)).toEqual({ here: false })
    expect(theProcessAt(999, reader)).toEqual({ here: false })
  })

  it('throws, and never answers gone, when ps cannot answer', () => {
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: { ran: false, reason: 'ps could not be run: spawnSync ps ENOENT' },
      [`ps ${PS} -p 4243`]: { ran: true, status: 1, stdout: '', stderr: 'ps: illegal option -- o' },
    })
    expect(() => reader.processAt(4242)).toThrow(/Whether process 4242 is running is unknown: ps could not be run/)
    expect(() => reader.startTimeOf(4243)).toThrow(/ps exited 1: ps: illegal option/)
  })

  it('reads the name, the program file and the command line a session check needs, and the walk over every process', async () => {
    const { isTheClaudeProgram, theLiveCodexProcessFor } = await import('../src/config/session-process.mjs')
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: said(PS_ONE),
      [`ps ${PS} -p 611`]: said(`${PS_TABLE.split('\n')[1] ?? ''}\n`),
      'ps -o ucomm= -p 4242': said(PS_UCOMM),
      'lsof -a -p 4242 -d txt -Fn': said(LSOF_TXT),
      'ps -o ucomm= -p 999': NOTHING_MATCHED,
      'lsof -a -p 999 -d txt -Fn': NOTHING_MATCHED,
      [PS_ALL]: said(PS_TABLE),
    })
    expect(reader.nameOf(4242)).toBe('node')
    expect(reader.executableOf(4242)).toBe('/usr/local/bin/node')
    expect(reader.commandLineOf(4242)).toBe('/usr/local/bin/node /Volumes/Work/mole-office/src/server/index.ts --port 39017')
    // A COMMAND ps COULD NOT READ is an absence, as on Linux.
    expect(reader.commandLineOf(611)).toBeNull()
    expect(isTheClaudeProgram(4242, reader)).toBe(false)
    expect(isTheClaudeProgram(999, reader)).toBe(false)
    expect(reader.everyCommandLine()?.map((one) => one.pid)).toEqual([1, 4242, 4243, 4244, 7310, 7311])
    expect(theLiveCodexProcessFor('a-thread', reader)).toBeNull()
  })

  // WAVE 13p ROUND 18b, check 0wESpxEOzWlO: the program file answered null when lsof could not look, so a
  // process nobody could see read as "not the claude program" and nothing failed. Both cases name a node
  // process, so `isTheClaudeProgram` has to ask lsof for its program file.
  it('throws, and never answers "not the claude program", when lsof cannot be run', async () => {
    const { isTheClaudeProgram } = await import('../src/config/session-process.mjs')
    const { reader } = commands({ 'ps -o ucomm= -p 4242': said(PS_UCOMM), 'lsof -a -p 4242 -d txt -Fn': NOT_RUN })
    expect(() => reader.executableOf(4242)).toThrow(/The program file of process 4242 is unknown: lsof could not be run/)
    expect(() => isTheClaudeProgram(4242, reader)).toThrow(/lsof could not be run: spawnSync lsof ENOENT/)
  })

  it('throws, and never answers "not the claude program", when lsof exits 1 with words on its error stream', async () => {
    const { isTheClaudeProgram } = await import('../src/config/session-process.mjs')
    const { reader } = commands({
      'ps -o ucomm= -p 4242': said(PS_UCOMM),
      'lsof -a -p 4242 -d txt -Fn': { ran: true, status: 1, stdout: '', stderr: 'lsof: WARNING: can not read process 4242' },
    })
    expect(() => reader.executableOf(4242)).toThrow(/The program file of process 4242 is unknown: lsof exited 1: lsof: WARNING/)
    expect(() => isTheClaudeProgram(4242, reader)).toThrow(/lsof exited 1/)
  })
})

describe('the macOS probe, driven by text', () => {
  it('reads one process, and the same stamp on two reads', () => {
    const { reader } = commands({ [`ps ${PS} -p 4242`]: said(PS_ONE) })
    const probe = new mac.DarwinProbe(sharedThatRecords().shared, reader)
    const first = probe.processById(4242)
    expect(first?.pgid).toBe(4242)
    expect(first?.startedAt).toBe('2026-09-30 09:14:07')
    expect(probe.processById(4242)?.startedAt).toBe(first?.startedAt)
  })

  it('answers null for a pid that is gone', () => {
    const { reader } = commands({ [`ps ${PS} -p 999`]: NOTHING_MATCHED })
    expect(new mac.DarwinProbe(sharedThatRecords().shared, reader).processById(999)).toBeNull()
  })

  it('refuses, and does not answer gone, when ps fails', () => {
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: { ran: false, reason: 'ps could not be run: spawnSync ps EACCES' },
      [`ps ${PS} -p 4243`]: { ran: true, status: 1, stdout: '', stderr: 'ps: illegal option -- o' },
    })
    const probe = new mac.DarwinProbe(sharedThatRecords().shared, reader)
    expect(() => probe.processById(4242)).toThrow(/Whether process 4242 is running is unknown: ps could not be run/)
    expect(() => probe.processById(4243)).toThrow(/ps exited 1: ps: illegal option/)
  })

  it('lists a process group, and refuses rather than answer an empty group when ps fails', () => {
    const ok = new mac.DarwinProbe(sharedThatRecords().shared, commands({ [PS_ALL]: said(PS_TABLE) }).reader)
    expect(ok.processesInGroup(4242).map((p) => p.pid)).toEqual([4242, 4243, 4244])
    const broken = new mac.DarwinProbe(sharedThatRecords().shared, commands({ [PS_ALL]: { ran: true, status: 1, stdout: '', stderr: 'ps: fail' } }).reader)
    expect(() => broken.processesInGroup(4242)).toThrow(/The processes in group 4242 are unknown/)
  })

  it('reads the process table with working directories, and null where lsof gave none', () => {
    const { reader } = commands({ [PS_ALL]: said(PS_TABLE), 'lsof -a -d cwd -Fpn': said(LSOF_CWDS) })
    const scan = new mac.DarwinProbe(sharedThatRecords().shared, reader).processTable()
    if (!scan.ok) throw new Error(scan.reason)
    expect(scan.processes).toHaveLength(7)
    expect(scan.processes.find((p) => p.pid === 4243)?.cwd).toBe('/Volumes/Work/mole-office')
    expect(scan.processes.find((p) => p.pid === 611)?.cwd).toBeNull()
  })

  it('reports a process table it could not read as {ok:false}, never as an empty list', () => {
    const noPs = new mac.DarwinProbe(sharedThatRecords().shared, commands({ [PS_ALL]: { ran: false, reason: 'ps could not be run: x' } }).reader)
    expect(noPs.processTable()).toEqual({ ok: false, reason: 'the processes on this machine could not be listed: ps could not be run: x' })
    const noLsof = new mac.DarwinProbe(sharedThatRecords().shared, commands({ [PS_ALL]: said(PS_TABLE), 'lsof -a -d cwd -Fpn': NOT_RUN }).reader)
    const scan = noLsof.processTable()
    expect(scan.ok).toBe(false)
    if (!scan.ok) expect(scan.reason).toMatch(/working directories .* could not be read: lsof could not be run/)
  })

  it('reads IPv4 and IPv6 listeners with the pid holding each, one row per socket', () => {
    const { reader } = commands({ 'lsof -nP -iTCP -sTCP:LISTEN -Fptn': said(LSOF_LISTEN) })
    expect(new mac.DarwinProbe(sharedThatRecords().shared, reader).listeningPorts()).toEqual([
      { port: 5173, address: '0.0.0.0', protocol: 'tcp', pid: 4243 },
      { port: 5173, address: '::', protocol: 'tcp6', pid: 4243 },
      { port: 9229, address: 'fe80:1::1', protocol: 'tcp6', pid: 7310 },
      { port: 39017, address: '127.0.0.1', protocol: 'tcp', pid: 4242 },
      { port: 39017, address: '::1', protocol: 'tcp6', pid: 4242 },
    ])
  })

  it('answers no listeners only when lsof says it matched none, and refuses when lsof fails', () => {
    const none = new mac.DarwinProbe(sharedThatRecords().shared, commands({ 'lsof -nP -iTCP -sTCP:LISTEN -Fptn': NOTHING_MATCHED }).reader)
    expect(none.listeningPorts()).toEqual([])
    const missing = new mac.DarwinProbe(sharedThatRecords().shared, commands({ 'lsof -nP -iTCP -sTCP:LISTEN -Fptn': NOT_RUN }).reader)
    expect(() => missing.listeningPorts()).toThrow(/The listening ports are unknown: lsof could not be run/)
    const denied = new mac.DarwinProbe(
      sharedThatRecords().shared,
      commands({ 'lsof -nP -iTCP -sTCP:LISTEN -Fptn': { ran: true, status: 1, stdout: '', stderr: 'lsof: WARNING: can not read' } }).reader,
    )
    expect(() => denied.listeningPorts()).toThrow(/lsof exited 1: lsof: WARNING/)
  })

  it("reads a process's parent, directory and databases, and says the environment was not read", () => {
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: said(PS_ONE),
      [`ps ${PS} -p 1`]: said(PS_LAUNCHD),
      // The directory is one this test made, so it exists on disk.
      'lsof -a -p 4242 -d cwd -Fn': said(`p4242\nfcwd\nn${scratch}\n`),
      'lsof -p 4242 -Fn': said(LSOF_FILES),
    })
    const facts = new mac.DarwinProbe(sharedThatRecords().shared, reader).processFacts(4242)
    expect(facts).toMatchObject({
      pid: 4242,
      parentPid: 1,
      parent: { pid: 1, command: '/sbin/launchd' },
      workingDirectory: scratch,
      workingDirectoryDeleted: false,
      openDatabases: ['/Volumes/Work/mole-office/data/panelx.db'],
      databaseAsked: null,
    })
    expect(facts?.couldNotRead).toEqual([
      'this probe does not read the environment of a process on macOS, so MOLE_OFFICE_DB is unknown',
    ])
  })

  it('names what lsof could not read instead of answering an empty list, and a missing directory as deleted', () => {
    const { reader } = commands({
      [`ps ${PS} -p 4242`]: said(PS_ONE),
      [`ps ${PS} -p 1`]: said(PS_LAUNCHD),
      'lsof -a -p 4242 -d cwd -Fn': said(`p4242\nfcwd\nn${join(scratch, 'removed')}\n`),
      'lsof -p 4242 -Fn': NOT_RUN,
    })
    const facts = new mac.DarwinProbe(sharedThatRecords().shared, reader).processFacts(4242)
    expect(facts?.workingDirectoryDeleted).toBe(true)
    expect(facts?.openDatabases).toEqual([])
    expect(facts?.couldNotRead).toContain(
      'the open files could not be listed (lsof could not be run: spawnSync lsof ENOENT), so no database can be named',
    )
  })

  it('answers null for the facts of a pid that is gone', () => {
    const { reader } = commands({ [`ps ${PS} -p 999`]: NOTHING_MATCHED })
    expect(new mac.DarwinProbe(sharedThatRecords().shared, reader).processFacts(999)).toBeNull()
  })

  it('leaves out what macOS cannot answer, and hands the rest to the Linux probe', () => {
    const { calls, shared } = sharedThatRecords()
    const probe = new mac.DarwinProbe(shared, commands({}).reader)
    expect(probe.platform).toBe('darwin')
    const asAProbe: import('../src/server/lib/resources.ts').OsProbe = probe
    expect(asAProbe.pidNamespaceOf).toBeUndefined()
    expect(asAProbe.containerFirstProcess).toBeUndefined()
    expect(asAProbe.senderOfAConnection).toBeUndefined()
    expect(asAProbe.sweepCheckWorktrees).toBeUndefined()
    probe.killProcessGroup(4242, 'SIGTERM')
    probe.stopContainer('box')
    expect(probe.machineName()).toBe('a-mac')
    void probe.theVersionOfAProgram('codex', { PATH: '' })
    void probe.tmuxPanes('#{pane_id}')
    probe.startTheOverdueHandBackHelper('the script')
    expect(calls).toEqual(['killProcessGroup 4242 SIGTERM', 'stopContainer box', 'machineName', 'theVersionOfAProgram codex', 'tmuxPanes #{pane_id}', 'startTheOverdueHandBackHelper the script'])
  })
})

// ============================================================ what reads /proc outside the probe, on a Mac

describe('what Linux reads from /proc outside the probe says unknown on a Mac, and never guesses', () => {
  // Wave 13t, round 21. MUTATIONS, each red here and green again when put back: the guard in
  // startingEnvironmentValue made false (it reads this Linux machine's /proc and answers PATH): red, case 1;
  // the guard in inAFolderHeldOpen taken out (it hands a /proc/self/fd name to the caller): red, case 2;
  // DarwinProbe's theVersionOfAProgram taken out: red, case 3 and the case above.
  it('1. the starting environment of a process is unknown on a Mac, said in words, and never null', () => {
    expect(() => res.startingEnvironmentValue(process.pid, 'PATH', 'darwin')).toThrow(
      `PATH in the starting environment of process ${String(process.pid)} is unknown: on darwin Mole Office cannot read the environment a process was started with without guessing where its arguments end.`,
    )
    expect(res.startingEnvironmentValue(process.pid, 'PATH', 'linux')).not.toBeNull()
  })

  it('2. a folder is not held open on a Mac: the caller is told why, and what it would do is not done', () => {
    let used = 0
    const onAMac = res.inAFolderHeldOpen(scratch, [], () => (used += 1), 'darwin')
    expect(onAMac).toEqual({ notHeld: 'darwin has no /proc/self/fd to hold a folder open by, so nothing was done' })
    expect(used).toBe(0)
    expect(res.inAFolderHeldOpen(scratch, [], (inside) => inside('a-file'), 'linux')).toMatch(/^\/proc\/self\/fd\/\d+\/a-file$/)
  })

  it('3. the macOS probe reads a program’s version, so the harness list does not say it cannot', async () => {
    const probe = res.theProbeForThisPlatform('darwin')
    expect(probe.theVersionOfAProgram).toBeTypeOf('function')
    // A program on no PATH is answered as not found, without starting anything.
    const read = await probe.theVersionOfAProgram?.('no-such-program-anywhere', { PATH: scratch })
    expect(read?.path).toBeNull()
  })
})

// ============================================================ the choice by platform

/** Runs `fn` while this process says it runs on `platform`, and puts the real value back. */
function onPlatform<T>(platform: string, fn: () => T): T {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')
  if (real === undefined) throw new Error('process.platform has no descriptor to put back')
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
}

/** A process group no process can have: pids on Linux are below pid_max, so pid_max itself is never one. */
function aGroupThatCannotExist(): number {
  return Number(readFileSync('/proc/sys/kernel/pid_max', 'utf8').trim())
}

describe('the probe chosen by platform', () => {
  it('gives LINUX_PROBE itself on linux, and it is the probe installed here', () => {
    expect(res.theProbeForThisPlatform('linux')).toBe(res.LINUX_PROBE)
    expect(res.osProbe()).toBe(res.LINUX_PROBE)
  })

  it('gives the macOS probe on darwin', () => {
    const probe = res.theProbeForThisPlatform('darwin')
    expect(probe).toBeInstanceOf(mac.DarwinProbe)
    expect(probe.platform).toBe('darwin')
    expect(probe.pidNamespaceOf).toBeUndefined()
  })

  it('gives the Windows probe on win32', async () => {
    // Wave 13t, round W4: Windows has a probe of its own. Nothing here runs PowerShell; what it reads, and what it
    // refuses, is in tests/the-message-workers-probe-on-windows.test.ts.
    const { WindowsProbe } = await import('../src/server/lib/windows-probe.ts')
    const probe = res.theProbeForThisPlatform('win32')
    expect(probe).toBeInstanceOf(WindowsProbe)
    expect(probe.platform).toBe('win32')
    expect(probe.pidNamespaceOf).toBeUndefined()
  })

  it("lets the macOS probe's borrowed Linux methods run on darwin, and LINUX_PROBE's still refuse there", () => {
    // kill(2) on a group that cannot exist signals nothing and answers ESRCH. The point is which
    // answer comes back: ESRCH means the method ran; a 501 means the platform check refused it.
    const nobody = aGroupThatCannotExist()
    const darwin = res.theProbeForThisPlatform('darwin')
    const fromMac = onPlatform('darwin', () => {
      try {
        darwin.killProcessGroup(nobody, 'SIGTERM')
        return null
      } catch (err) {
        return err as { code?: unknown; status?: unknown }
      }
    })
    expect(fromMac?.code).toBe('ESRCH')
    const fromLinux = onPlatform('darwin', () => {
      try {
        res.LINUX_PROBE.killProcessGroup(nobody, 'SIGTERM')
        return null
      } catch (err) {
        return err as { code?: unknown; status?: unknown }
      }
    })
    expect(fromLinux?.status).toBe(501)
  })

  // The overdue hand-back reader asks the probe for its git helper. Before 10 November 2026 only the Linux probe
  // had the method, so on a Mac the reader answered unavailable and GET /api/worker/merges answered 503.
  it("starts the overdue hand-back reader's helper on darwin, which runs git and then stops its own group", async () => {
    const { guardedGitArguments } = await import('../src/config/guarded-git.mjs')
    const darwin = res.theProbeForThisPlatform('darwin')
    const helper = onPlatform('darwin', () => darwin.startTheOverdueHandBackHelper?.(res.THE_OVERDUE_HAND_BACK_HELPER))
    expect(helper).toBeDefined()
    const child = helper!
    try {
      const answer = await new Promise<unknown>((resolve, reject) => {
        child.once('message', resolve)
        child.once('error', reject)
        child.send({ args: guardedGitArguments(tmpdir(), ['version']) })
      })
      expect(answer).toMatchObject({ status: 0, stdout: expect.stringMatching(/^git version /) })
      const ended = new Promise<NodeJS.Signals | null>((resolve) => child.once('exit', (_code, signal) => resolve(signal)))
      child.send('stop')
      expect(await ended).toBe('SIGKILL')
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
  })

  it('lets the overdue hand-back reader read git with the macOS probe installed, rather than answer unavailable', async () => {
    const { GitSession } = await import('../src/server/lib/async-take-back.ts')
    const { performance } = await import('node:perf_hooks')
    res.useOsProbe(res.theProbeForThisPlatform('darwin'))
    const session = new GitSession()
    try {
      expect(await session.read(tmpdir(), ['version'], performance.now() + 10_000)).toMatch(/^git version /)
    } finally {
      session.close()
      res.useOsProbe(res.LINUX_PROBE)
    }
  })
})

// ============================================================ one rule for both probes

describe('what counts as a database file', () => {
  it('is the same for the Linux probe reading /proc and the macOS probe reading lsof', () => {
    // Real files, held open by this test's own process, so the Linux probe reads them from /proc.
    // The macOS probe is given the same names as lsof would list them (text in lsof's -F format).
    const names = ['a.db', 'a.db-wal', 'a.db-shm', 'b.sqlite', 'c.sqlite3', 'd.sqlite-journal', 'e.txt'].map((n) => join(scratch, n))
    const held = names.map((name) => openSync(name, 'w'))
    try {
      const fromLinux = res.LINUX_PROBE.processFacts?.(process.pid)?.openDatabases.filter((f) => f.startsWith(scratch))
      const lsofFiles = ['p4242', ...names.flatMap((name, i) => [`f${String(30 + i)}`, `n${name}`]), ''].join('\n')
      const { reader } = commands({
        [`ps ${PS} -p 4242`]: said(PS_ONE),
        [`ps ${PS} -p 1`]: said(PS_LAUNCHD),
        'lsof -a -p 4242 -d cwd -Fn': said(`p4242\nfcwd\nn${scratch}\n`),
        'lsof -p 4242 -Fn': said(lsofFiles),
      })
      const fromMac = new mac.DarwinProbe(sharedThatRecords().shared, reader).processFacts(4242)?.openDatabases
      const theRule = names.filter((name) => mac.isADatabaseFile(name)).sort()
      expect(theRule).toEqual([join(scratch, 'a.db'), join(scratch, 'b.sqlite'), join(scratch, 'c.sqlite3')])
      expect(fromLinux).toEqual(theRule)
      expect(fromMac).toEqual(theRule)
    } finally {
      for (const fd of held) closeSync(fd)
    }
  })
})
