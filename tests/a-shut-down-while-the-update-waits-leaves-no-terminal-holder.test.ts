// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHUT DOWN WHILE THE OFFICE WAITS FOR ITS UPDATE LEAVES NO TERMINAL HOLDER RUNNING.
 *
 * WHY. An installed office whose database is not up to date waits for its owner's press to back up and update, and
 * writes nothing meanwhile. So its process ledger has no row for the terminal holder `mole-office start` started, and a
 * stop, which ends only a holder it can prove, ended the server, left the holder and exited HOLDER_NOT_STOPPED. The
 * window then stayed open. Now the start ends the holder it started when the server answers that it waits, by what it
 * read of that holder when it started it. The server starts the holder after the press.
 *
 * WHAT IS CHECKED. `main(['start'])` and `main(['stop'])` run in this process, for a throwaway database. The terminal
 * holder is the real one. The server is a stand-in: a waiting node that takes this database's real service lock, as the
 * server takes it, and lets it go when it is asked to stop. What answers on the office's port is stood in, as the
 * server answers once it holds its lock, except in case 6, where the real reduced mode answers and the real self-check
 * reads it.
 *   1. While the office waits, the start says it ends the holder it started and ends it. The stop then ends the server,
 *      says no holder runs and exits 0, and neither the holder nor the server runs. With the code before this file, the
 *      stop exited HOLDER_NOT_STOPPED and the holder ran on.
 *   2. While the office waits, the start and the stop write nothing to the database: every table has as many rows as
 *      before, and the database's data_version is the same.
 *   3. When the office is up to date, the start keeps the holder it started, as before, and does not say it ends it.
 *      Once the server's start has recorded it, the stop ends it by its recorded group and exits 0.
 *   4. A holder this start did not start, with no ledger row, is left by the start and by the stop. The stop says why
 *      and exits HOLDER_NOT_STOPPED, and the holder still runs.
 *   5. With the system layer's Windows groups stood in, the start ends the holder it started while the office waits, by
 *      the Job Object named after the holder's parent. The start asks that group to stop, the holder ends, the group's
 *      end answers ESRCH, and the start says the holder stopped when asked and nothing was left.
 *   6. With the real reduced mode answering on a free port, the start reads through the real self-check that the
 *      office waits, and ends the holder it started. After the owner's press the server starts a holder, the server's
 *      start records it in the ledger, and a terminal opens in it. The stop then ends the server and that holder by its
 *      recorded group, and exits 0.
 *
 * WHAT ONLY WINDOWS CAN SHOW. Case 5 stands in for Windows as tests/the-holder-on-windows-ends-with-its-job-object.test.ts
 * does: what the Job Object answers, the ask on its stop pipe and its end are stand-ins, and the processes are read on
 * this machine. Only a Windows run shows that the installed office's start ends its holder there.
 *
 * MUTATIONS, after a control run, each restored:
 *   1. in src/config/the-service-command.mjs, endTheHolderWhileTheUpdateWaits returns at once, so a waiting office's
 *      stop leaves the holder as before: cases 1, 2, 5 and 6 go red;
 *   2. in src/server/lib/the-update.ts, the holder is not started after the press: case 6 goes red;
 *   3. in src/config/the-service-command.mjs, the stop asks a holder no ledger row names to stop, by its own number as
 *      its group, and says it was stopped: case 4 goes red;
 *   4. in src/config/the-service-command.mjs, the waiting office's start writes a session record for the holder before
 *      it ends it: case 2 goes red.
 */
import { type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { REPO_ROOT, howToStart, serviceLockPathFrom } from '../src/config/settings.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import {
  EXIT,
  main,
  NO_HOLDER_RUNS,
  THE_HOLDER_WAS_NOT_STOPPED,
  THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS,
  theHolderHasNoRecordedGroupWords,
  theHolderStoppedWhenAskedAndNothingWasLeftWords,
  theHolderWasStoppedWords,
} from '../src/config/the-service-command.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { askTheHolder, startATerminalHolder, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { aFreePort } from './terminal-holder-stand.ts'

type WhatAnswers = import('../src/config/the-self-check.mjs').WhatAnswers
type Holding = Awaited<ReturnType<JobObjects['readHolds']>>

/**
 * WHAT ANSWERS ON THE PORT, always stood in except in case 6. Until the server holds its lock nothing answers; then
 * the office answers as `standIn.port` says: as an office that waits for its update, as an up-to-date office, or by
 * the real self-check. And THE WINDOWS GROUPS, stood in only while `standIn.windows` is set, and only in `thisSystem`.
 * The process reader stays this machine's, so the holder's parent is the process that started it here: this test.
 */
const standIn = vi.hoisted(() => ({
  port: 'waiting' as 'waiting' | 'up to date' | 'the real self-check',
  /** Asked before the real self-check answers, so that case 6 can start the reduced mode once the lock is held. */
  beforeTheRealAsk: null as null | (() => Promise<void>),
  /** This database's service lock, which the stand-in server takes. */
  lockPath: '',
  windows: false,
  holding: { holds: true } as Holding,
  asked: { holds: [] as [number, number][], toStop: [] as number[], ended: [] as [number, string | number][] },
}))
vi.mock('../src/config/the-self-check.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-self-check.mjs')>()
  const { existsSync: there } = await import('node:fs')
  /** The world a stand-in answers with, which the command only says back. */
  const A_STAND_IN_WORLD = { database: 'unknown', repository: '/a-stand-in-checkout', port: 'unknown', head: 'unknown', standing: 'scratch' }
  return {
    ...real,
    whatAnswersForThisOffice: async (options: Parameters<typeof real.whatAnswersForThisOffice>[0]): Promise<WhatAnswers> => {
      const address = options?.address ?? ''
      if (standIn.port === 'the real self-check') {
        await standIn.beforeTheRealAsk?.()
        return real.whatAnswersForThisOffice(options)
      }
      if (!there(standIn.lockPath)) {
        return { answer: 'not-answering', address, failure: 'refused', why: 'nothing listens there (a stand-in answer)' }
      }
      if (standIn.port === 'up to date') return { answer: 'healthy', address, world: A_STAND_IN_WORLD, holder: null }
      return { answer: 'unhealthy', address, world: A_STAND_IN_WORLD, reasons: ['a database update waits (a stand-in answer)'], holder: null, updateWaiting: true }
    },
  }
})
/** THE SERVER, stood in: `howToStart('server')` names a waiting node that takes the real service lock. Every other program is the real one. */
vi.mock('../src/config/settings.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/settings.mjs')>()
  const A_SERVER_THAT_HOLDS_THE_LOCK = [
    'const [lockModule, lockPath, databasePath, port, checkout] = process.argv.slice(1)',
    'const { takeTheServiceLock, releaseTheServiceLock, readTheProcess } = await import(lockModule)',
    'const took = await takeTheServiceLock({ lockPath, databasePath, port: Number(port), checkout, pid: process.pid, readProcess: readTheProcess })',
    "if (!took.taken) { process.stderr.write(took.said + '\\n'); process.exit(1) }",
    'const end = () => { releaseTheServiceLock(lockPath, took.lock.token); process.exit(0) }',
    "process.on('SIGTERM', end)",
    "process.on('SIGINT', end)",
    "process.stdout.write('a stand-in server holds the lock\\n')",
    'setInterval(() => {}, 1000)',
  ].join('\n')
  const lockModule = new URL('../src/config/the-service-lock.mjs', import.meta.url).href
  return {
    ...real,
    howToStart: (program: Parameters<typeof real.howToStart>[0], platform?: NodeJS.Platform) => {
      if (program !== 'server') return real.howToStart(program, platform)
      const declared = real.settings()
      return {
        command: process.execPath,
        args: ['--input-type=module', '-e', A_SERVER_THAT_HOLDS_THE_LOCK, lockModule, declared.serviceLockPath, declared.databasePath, String(declared.apiPort), real.REPO_ROOT],
        environment: {},
      }
    },
  }
})
vi.mock('../src/config/systems/the-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/systems/the-system.mjs')>()
  const jobObjects: JobObjects = {
    theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
    readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
    holds: () => {
      throw new Error('the start asks whether a Job Object holds the holder without holding the thread')
    },
    readHolds: (group, pid) => {
      standIn.asked.holds.push([group, pid])
      return Promise.resolve(standIn.holding)
    },
    programsOfAStarter: () => {
      throw new Error('no case here asks what a starter started')
    },
    readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
  }
  return {
    ...real,
    thisSystem: () => {
      const system = real.thisSystem()
      if (!standIn.windows) return system
      // THE GROUP IS THIS TEST'S OWN NUMBER, the holder's parent, so neither stand-in signals it. The ask ends the
      // holder that answers on this database's socket, as the holder ends when its stop pipe asks it, and the group's
      // end answers that nothing was left.
      const askToStop = async (group: number): Promise<void> => {
        standIn.asked.toStop.push(group)
        // Imported when asked, because the holder's module imports this one.
        const holders = await import('../src/config/the-terminal-holder.mjs')
        const answered = await holders.askTheHolder(holders.theTerminalHolderSocket(String(process.env['MOLE_OFFICE_DB'])), { op: 'hello' })
        process.kill(Number(answered['pid']), 'SIGTERM')
      }
      const signal = (group: number, signal: NodeJS.Signals | 0): void => {
        standIn.asked.ended.push([group, signal])
        throw Object.assign(new Error(`No Job Object named Local\\mole-office-group-${String(group)} exists.`), { code: 'ESRCH' })
      }
      return { ...system, groups: { ...system.groups, jobObjects, signal, askToStop } }
    },
  }
})

/** A note written past the door, so that the start check offers an update, as in tests/an-installed-office-updates-on-the-owners-press.test.ts. */
const PAST_THE_DOOR = 'written-past-the-door'

// The server's modules open a database when they load, so they are loaded after a throwaway one is named.
let t: TestDb
let folder = ''
/** Every process group a case started or found, ended after it whatever it showed. */
const groups = new Set<number>()
const children: ChildProcess[] = []
beforeAll(async () => {
  t = await freshDb()
  t.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, origin, kind, title, summary, data) ' +
        `VALUES (?, 'default', ?, '2026-10-10 09:00:00', '2026-10-10 09:00:00', 'authored', 'note', ?, NULL, ?)`,
    )
    .run(PAST_THE_DOOR, THE_TEST_OFFICES_OWNER.id, 'a note nothing filed', '{"body":"made-up test data"}')
  folder = mkdtempSync(join(tmpdir(), 'update-waits-'))
  vi.stubEnv('XDG_CONFIG_HOME', folder)
  vi.stubEnv('MOLE_OFFICE_DB', t.file)
  vi.stubEnv('MOLE_OFFICE_PORT', String(await aFreePort()))
  vi.stubEnv('MOLE_OFFICE_TERMINAL_HOLDER', 'on')
  mkdirSync(join(folder, 'mole-office', 'terminals'), { recursive: true })
  standIn.lockPath = theLockPath()
}, 60_000)
afterEach(() => {
  standIn.port = 'waiting'
  standIn.beforeTheRealAsk = null
  standIn.windows = false
  standIn.holding = { holds: true }
  standIn.asked = { holds: [], toStop: [], ended: [] }
  const lock = readTheServiceLock(theLockPath())
  if (lock.state === 'read') groups.add(lock.lock.pgid)
  for (const group of groups) {
    if (group <= 1 || group === process.pid) continue
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // The group has ended, which is what every case asks for.
    }
  }
  groups.clear()
  for (const child of children.splice(0)) child.kill('SIGKILL')
  rmSync(theLockPath(), { force: true })
  rmSync(theTerminalHolderSocket(t.file), { force: true })
  vi.restoreAllMocks()
})
afterAll(() => {
  vi.unstubAllEnvs()
  t.close()
  rmSync(folder, { recursive: true, force: true })
})

function theLockPath(): string {
  return serviceLockPathFrom({ MOLE_OFFICE_DB: t.file })
}

/** One `mole-office` command for this database, run here: its exit code and the lines it said. */
async function theCommand(what: 'start' | 'stop'): Promise<{ code: number; said: string[] }> {
  const said: string[] = []
  const keep = (chunk: unknown): true => {
    said.push(...String(chunk).split('\n').filter((line) => line !== ''))
    return true
  }
  // ONLY THESE TWO ARE RESTORED after the command, so that case 6 keeps reading the server's own lines.
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(keep)
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(keep)
  let code: number
  try {
    code = await main([what])
  } finally {
    out.mockRestore()
    err.mockRestore()
    // THE SERVER AND THE HOLDER ARE RECORDED BEFORE ANYTHING IS ASSERTED, so that a case that fails ends them too.
    const lock = readTheServiceLock(theLockPath())
    if (lock.state === 'read') groups.add(lock.lock.pgid)
    const named = said.map((line) => /The terminal holder is process (\d+), in (?:process )?group (\d+)/.exec(line)).find((found) => found !== null)
    if (named !== undefined && named !== null) groups.add(Number(named[1]))
  }
  return { code, said }
}

/** The holder this start started, from what it said: its process number. */
function theHolderItStarted(said: string[]): number {
  const named = said.map((line) => /The terminal holder is process (\d+), in (?:process )?group (\d+)/.exec(line)).find((found) => found !== null)
  if (named === undefined || named === null) throw new Error(`the start named no terminal holder it started:\n${said.join('\n')}`)
  return Number(named[1])
}

/** The server the lock names, while the lock is there. */
function theServerTheLockNames(): number {
  const lock = readTheServiceLock(theLockPath())
  if (lock.state !== 'read') throw new Error(`the service lock ${theLockPath()} could not be read: ${lock.state}`)
  return lock.lock.pid
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Whether the process has ended, asked again for up to five seconds: an ended child is reaped a moment after. */
async function hasEnded(pid: number): Promise<boolean> {
  const deadline = Date.now() + 5_000
  while (isRunning(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  return !isRunning(pid)
}

/** Every table and its row count, read from the file, and the database's data_version, which another connection's write changes. */
function everyCount(sqlite: Database.Database): { tables: Record<string, number>; version: unknown } {
  const tables = (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name)
  return {
    tables: Object.fromEntries(tables.map((table) => [table, (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n])),
    version: sqlite.pragma('data_version', { simple: true }),
  }
}

/** The server's start recording the holder, as src/server/index.ts records it once it serves. */
async function theServersStartRecordsTheHolder(): Promise<void> {
  const { recordTheHolderAtStart } = await import('../src/server/lib/terminals.ts')
  const lines: string[] = []
  await recordTheHolderAtStart({ info: (line) => lines.push(line), warn: (line) => lines.push(line) })
  expect(lines.some((line) => line.includes('it is in the process ledger')), lines.join('\n')).toBe(true)
}

/** The holder's open rows in the process ledger: their groups. */
function theLedgersGroupsFor(pid: number): (number | null)[] {
  const rows = t.client.sqlite
    .prepare("SELECT pgid FROM session_resources WHERE type = 'process' AND key = ? AND released_at IS NULL")
    .all(String(pid)) as { pgid: number | null }[]
  return rows.map((row) => row.pgid)
}

describe('a shut down while the office waits for its update leaves no terminal holder', () => {
  it('1: while the office waits, the start ends the holder it started, and the stop ends the server and exits 0', async () => {
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    const holder = theHolderItStarted(started.said)
    const server = theServerTheLockNames()
    const stopped = await theCommand('stop')
    expect(stopped.code, `${started.said.join('\n')}\n---\n${stopped.said.join('\n')}`).toBe(EXIT.OK)
    expect(await hasEnded(holder), 'the holder still runs').toBe(true)
    expect(await hasEnded(server), 'the stand-in server still runs').toBe(true)
    expect(started.said).toContain(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
    expect(stopped.said).toContain(NO_HOLDER_RUNS)
    expect(existsSync(theTerminalHolderSocket(t.file)), "the holder's socket is still there").toBe(false)
  }, 60_000)

  it('2: while the office waits, the start and the stop write nothing to the database', async () => {
    const before = everyCount(t.client.sqlite)
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    const holder = theHolderItStarted(started.said)
    const stopped = await theCommand('stop')
    expect(everyCount(t.client.sqlite), 'something was written while the office waits').toEqual(before)
    expect(stopped.code, stopped.said.join('\n')).toBe(EXIT.OK)
    expect(await hasEnded(holder), 'the holder still runs').toBe(true)
  }, 60_000)

  it('3: when the office is up to date, the start keeps its holder, and the stop ends it by its recorded group', async () => {
    standIn.port = 'up to date'
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    const holder = theHolderItStarted(started.said)
    expect(started.said).not.toContain(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
    expect(started.said).toContain(
      `The terminal holder is process ${String(holder)}, in process group ${String(holder)}. It keeps running when the server restarts, and the stop command ends it.`,
    )
    expect((await askTheHolder(theTerminalHolderSocket(t.file), { op: 'hello' }))['pid'], 'the start ended its holder').toBe(holder)
    await theServersStartRecordsTheHolder()
    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.said.join('\n')).toBe(EXIT.OK)
    expect(stopped.said).toContain(theHolderWasStoppedWords(holder, holder))
    expect(await hasEnded(holder), 'the holder still runs').toBe(true)
  }, 60_000)

  it('4: a holder this start did not start, with no ledger row, is left by the start and by the stop', async () => {
    const earlier = await startATerminalHolder({ databasePath: t.file, how: howToStart('holder'), cwd: REPO_ROOT })
    if (earlier.outcome !== 'started') throw new Error(`the earlier holder did not start: ${JSON.stringify(earlier)}`)
    groups.add(earlier.group)
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    expect(started.said).toContain(`The terminal holder is already running: process ${String(earlier.pid)}. It was left as it is.`)
    expect(started.said).not.toContain(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.said.join('\n')).toBe(EXIT.HOLDER_NOT_STOPPED)
    expect(stopped.said).toContain(`${theHolderHasNoRecordedGroupWords(earlier.pid, "no open row in the office's process ledger records it.")} ${THE_HOLDER_WAS_NOT_STOPPED}`)
    expect(isRunning(earlier.pid), 'the holder no row names was ended').toBe(true)
  }, 60_000)

  it('5: on Windows, stood in, the start ends its holder by the Job Object named after its parent', async () => {
    standIn.windows = true
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    const holder = theHolderItStarted(started.said)
    expect(await hasEnded(holder), 'the holder still runs').toBe(true)
    expect(started.said).toContain(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
    expect(started.said).toContain(theHolderStoppedWhenAskedAndNothingWasLeftWords(holder, process.pid))
    expect(standIn.asked.toStop).toEqual([process.pid])
    expect(standIn.asked.ended).toEqual([[process.pid, 'SIGKILL']])
    // THE STOP RUNS ON THIS MACHINE AS ITSELF: the stand-in server holds a Linux group.
    standIn.windows = false
    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.said.join('\n')).toBe(EXIT.OK)
    expect(stopped.said).toContain(NO_HOLDER_RUNS)
  }, 60_000)

  it("6: the real reduced mode: the start ends its holder, and after the owner's press the server's holder is recorded, opens a terminal and is ended by the stop", async () => {
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const { waitForThePress } = await import('../src/server/lib/the-update.ts')
    const { whichWorldAnswered } = await import('../src/server/lib/world.ts')
    const { ensureKeysExist } = await import('../src/server/lib/keys.ts')
    const sqlite = t.client.sqlite
    const decision = prepareToServe(sqlite, MIGRATIONS)
    // THE CONTROL: the start check refuses this file and carries what the update needs.
    if (decision.serve || decision.update === undefined) throw new Error(`the start check did not offer an update: ${decision.serve ? decision.report : decision.refusal}`)
    const backups = join(dirname(t.file), 'backups')
    mkdirSync(backups, { recursive: true })
    const offer = { file: t.file, holds: decision.update.holds, wouldWrite: decision.update.wouldWrite, measuredOn: decision.update.measuredOn, backups }
    const port = Number(process.env['MOLE_OFFICE_PORT'])
    const said: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      said.push(String(line))
    })
    // THE REDUCED MODE ANSWERS ONCE THE SERVER HOLDS ITS LOCK, as the server serves it after taking the lock.
    let waiting: Promise<void> | null = null
    standIn.port = 'the real self-check'
    standIn.beforeTheRealAsk = async () => {
      if (waiting !== null || readTheServiceLock(theLockPath()).state !== 'read') return
      waiting = waitForThePress({
        sqlite,
        offer,
        migrationsFolder: MIGRATIONS,
        port,
        host: '127.0.0.1',
        headers: whichWorldAnswered,
        whenAStopIsAsked: () => {},
      })
      const deadline = Date.now() + 10_000
      while (!said.some((line) => line.startsWith("Mole Office is waiting for its owner's press")) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    const started = await theCommand('start')
    expect(started.code, started.said.join('\n')).toBe(EXIT.OK)
    const first = theHolderItStarted(started.said)
    expect(started.said).toContain(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
    expect(await hasEnded(first), 'the holder the start started still runs').toBe(true)
    expect(waiting, 'the reduced mode never answered').not.toBeNull()

    // THE OWNER'S PRESS, with the owner's key from the key file beside the database.
    ensureKeysExist()
    const key = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string }).person
    const pressed = await fetch(`http://127.0.0.1:${String(port)}/api/office/the-update`, { method: 'POST', headers: { 'x-mole-office-key': key } })
    expect(pressed.status, await pressed.clone().text()).toBe(200)
    await waiting
    const after = said.map((line) => /^The terminal holder was started after the press: process (\d+)\.$/.exec(line)).find((found) => found !== null)
    expect(after, said.join('\n')).toBeDefined()
    const holder = Number(after?.[1])
    groups.add(holder)
    expect(prepareToServe(sqlite, MIGRATIONS).serve, 'the press did not update the database').toBe(true)

    // THE SERVER'S START RECORDS IT, and a terminal opens in it.
    await theServersStartRecordsTheHolder()
    expect(theLedgersGroupsFor(holder)).toEqual([holder])
    const opened = await askTheHolder(theTerminalHolderSocket(t.file), {
      op: 'open',
      who: { kind: 'person', id: 'a-test' },
      project: 'default',
      command: '/bin/bash',
      args: ['--noprofile', '--norc'],
      folder,
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: folder, TERM: 'xterm-256color', HISTFILE: '/dev/null' },
      cols: 80,
      rows: 24,
      keeping: false,
    })
    const terminal = (opened['terminal'] as { pid: number } | undefined)?.pid
    expect(terminal, JSON.stringify(opened)).toBeTypeOf('number')
    groups.add(terminal as number)

    // THE STOP, once the server serves as an up-to-date office: it ends the server and then the holder by its row.
    standIn.port = 'up to date'
    const stopped = await theCommand('stop')
    expect(stopped.code, stopped.said.join('\n')).toBe(EXIT.OK)
    expect(stopped.said).toContain(theHolderWasStoppedWords(holder, holder))
    expect(await hasEnded(holder), 'the holder started after the press still runs').toBe(true)
    expect(await hasEnded(terminal as number), "the holder's terminal still runs").toBe(true)
  }, 120_000)
})
