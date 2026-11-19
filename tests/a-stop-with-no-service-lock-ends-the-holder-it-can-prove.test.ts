// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOP WITH NO SERVICE LOCK, OR WITH A STALE ONE, ENDS A TERMINAL HOLDER IT CAN PROVE IS THIS DATABASE'S.
 *
 * WHY. A server ended by a signal from elsewhere lets its lock go and keeps its terminal holder, and a start whose
 * server did not start leaves one. Before this file `mole-office stop` with no lock said there was nothing to stop and
 * exited NOT_RUNNING, and the holder ran on with its terminals. Only the Windows installer ended it then, by its path.
 * A stop that leaves a holder now exits HOLDER_NOT_STOPPED, which the installer accepts as it accepts NOT_RUNNING,
 * where FAILED would make it refuse.
 *
 * WHAT IS CHECKED. `main(['stop'])` runs in this process, for a throwaway database with no service lock, or with a
 * stale one. What answers on the office's port is stood in, so no port is asked. A waiting node that answers the
 * holder's hello for this database stands in for the holder, and its ledger row is written as the server's ledger door
 * writes it.
 *   1. When nothing answers on the port and no holder runs, the stop exits 0 and says that no holder runs.
 *   2. When nothing answers and the holder leads its own process group, as the server starts it, and one open ledger
 *      row names it with that group and its start, the stop ends that group, waits until the holder has ended, says
 *      what it ended and exits 0.
 *   3. When nothing answers and no ledger row names the holder, the stop ends nothing, names the holder's process and
 *      exits HOLDER_NOT_STOPPED.
 *   4. When this office answers on the port with no lock, the stop ends nothing, even a holder it could prove, and
 *      exits ANSWERING_WITHOUT_A_LOCK as before: that server still uses its holder.
 *   5. With the system layer's Windows groups stood in, when the Job Object named after the holder's parent holds it,
 *      the stop says the refused ask (there is no stop pipe), then ends that group, says so and exits 0.
 *   6. With the same stand-in, when Windows says that Job Object does not hold the holder, the stop ends nothing and
 *      exits HOLDER_NOT_STOPPED.
 *   7. When a restart reads a held lock and the lock goes before its stop reads it, the stop keeps a holder it could
 *      prove, stops nothing and exits NOT_RUNNING, and the restart starts nothing (round W40). A waiting node holds the
 *      lock, and the port's stand-in lets the lock go when the restart first asks the port, as a server that ended then
 *      would. Its start is closed by a stand-in upgrade mark, so a stop that went on could start nothing either.
 *   8. With a stale lock, when nothing answers on its port and the holder leads its own group with one open ledger row
 *      naming it, the stop says the lock is stale, ends that group, says what it ended and exits 0.
 *   9. With a stale lock and no holder, the stop says the lock is stale and that no holder runs, and exits 0.
 *  10. With a stale lock and no ledger row naming the holder, the stop ends nothing, names the holder's process and
 *      exits HOLDER_NOT_STOPPED.
 *  11. With a stale lock and this office answering on the port, the stop ends nothing, even a holder it could prove,
 *      says nothing was stopped and exits STALE.
 *  12. When a restart reads a held lock and the lock goes stale between that reading and its stop, the stop keeps
 *      the holder, stops nothing and exits STALE, and the restart starts nothing.
 *
 * WHAT IT DOES NOT SHOW. Nothing ran on Windows. What the Job Object answers there, and whether the installer then
 * ends the holder by its path, is the walk in briefs/NEXT.md for the infrastructure agent.
 *
 * MUTATIONS, after a control run, each restored, in src/config/the-service-command.mjs:
 *   1. the stop's branch with no lock back to saying NOTHING_WAS_STOPPED and exiting NOT_RUNNING: cases 1, 2, 3, 5
 *      and 6 go red;
 *   2. `stand.answer.ours ||` deleted from that branch: case 4 goes red (the holder is ended under a server that
 *      answers);
 *   3. endTheTerminalHolder's `left` exiting FAILED: cases 3 and 6 go red, and cases 2 and 3 of
 *      tests/the-holder-on-windows-ends-with-its-job-object.test.ts;
 *   4. `|| keepTheHolder` deleted from that branch: case 7 goes red (the restart's stop ends the holder);
 *   5. the stale branch back to saying NOTHING_WAS_STOPPED and exiting STALE in every case: cases 8, 9 and 10 go red;
 *   6. `stand.answer.ours ||` deleted from the stale branch: case 11 goes red;
 *   7. `|| keepTheHolder` deleted from the stale branch: case 12 goes red;
 *   8. the stale branch calling endTheTerminalHolder and then exiting STALE whatever it answered: cases 8 and 9 go red.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_TERMINAL_HOLDER } from '../src/config/own-rows.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import { A_REFUSED_STOP_REQUEST, windowsGroups } from '../src/config/systems/windows-groups.mjs'
import {
  EXIT,
  main,
  NO_HOLDER_RUNS,
  NOTHING_WAS_STOPPED,
  theHolderWasStoppedWords,
  theLockIsStale,
  theNoServiceLockToStopWords,
} from '../src/config/the-service-command.mjs'
import { theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { theProcessReading } from '../src/config/the-service-lock.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Holding = Awaited<ReturnType<JobObjects['readHolds']>>

/**
 * WHAT ANSWERS ON THE PORT, always stood in, so no case asks a port: nothing, or this office. And THE WINDOWS GROUPS,
 * stood in only while `standIn.windows` is set, and only in `thisSystem`, which the stop reads. The process reader stays
 * this machine's, so the holder's parent is the process that started it here: this test.
 */
const standIn = vi.hoisted(() => ({
  port: 'nothing' as 'nothing' | 'this office',
  windows: false,
  holding: { unknown: 'no case has said yet what Windows answers (a stand-in answer)' } as Holding,
  end: (_group: number): void => {
    throw new Error('no case has said yet what ending a group does')
  },
  ask: null as null | ((group: number) => Promise<void>),
  asked: { holds: [] as [number, number][], toStop: [] as number[], ended: [] as [number, string | number][] },
  /** What happens when the port is asked, before it answers: nothing, unless a case says. */
  onAsk: null as null | (() => void),
  /** Whether a stand-in upgrade mark closes the office, so that a start starts nothing. */
  closed: false,
}))
vi.mock('../src/config/the-upgrade-mark.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-upgrade-mark.mjs')>()
  return {
    ...real,
    whyAnUpgradeKeepsTheOfficeClosed: (...args: Parameters<typeof real.whyAnUpgradeKeepsTheOfficeClosed>) =>
      standIn.closed ? 'A stand-in upgrade mark keeps the office closed, so this start starts nothing.' : real.whyAnUpgradeKeepsTheOfficeClosed(...args),
  }
})
vi.mock('../src/config/the-self-check.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-self-check.mjs')>()
  /** The world a healthy stand-in answers with, which the stop only says back. */
  const A_STAND_IN_WORLD = { database: 'unknown', repository: '/a-stand-in-checkout', port: 'unknown', head: 'unknown', standing: 'scratch' }
  return {
    ...real,
    whatAnswersForThisOffice: (options: Parameters<typeof real.whatAnswersForThisOffice>[0]) => {
      standIn.onAsk?.()
      return Promise.resolve(
        standIn.port === 'this office'
          ? { answer: 'healthy', address: options?.address ?? '', world: A_STAND_IN_WORLD, holder: null }
          : { answer: 'not-answering', address: options?.address ?? '', failure: 'refused', why: 'nothing listens there (a stand-in answer)' },
      )
    },
  }
})
vi.mock('../src/config/systems/the-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/systems/the-system.mjs')>()
  const jobObjects: JobObjects = {
    theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
    readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
    holds: () => {
      throw new Error('the stop asks whether a Job Object holds the holder without holding the thread')
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
      const signal = (group: number, signal: NodeJS.Signals | 0): void => {
        standIn.asked.ended.push([group, signal])
        standIn.end(group)
      }
      const askToStop = (group: number): Promise<void> => {
        standIn.asked.toStop.push(group)
        if (standIn.ask === null) return Promise.reject(new Error('no case has said what the ask does (a stand-in refusal)'))
        return standIn.ask(group)
      }
      return { ...system, groups: { ...system.groups, jobObjects, signal, askToStop } }
    },
  }
})

/** A holder that answers the hello, as the holder answers it, for one database, and waits. */
const A_HOLDER_THAT_ANSWERS_HELLO = [
  "const { createServer } = require('node:net')",
  'const [socketPath, database] = process.argv.slice(1)',
  'createServer((socket) => {',
  "  socket.setEncoding('utf8')",
  "  socket.once('data', (heard) => socket.end(JSON.stringify({ id: JSON.parse(heard).id, ok: true, pid: process.pid, database }) + '\\n'))",
  "}).listen(socketPath, () => process.stdout.write('listening\\n'))",
].join('\n')

// The server's modules open a database when they load, so they are loaded after a throwaway one is named.
let t: TestDb
let folder = ''
let theProbeForThisPlatform: typeof import('../src/server/lib/resources.ts').theProbeForThisPlatform
let session = ''
const holders: ChildProcess[] = []
beforeAll(async () => {
  t = await freshDb()
  ;({ theProbeForThisPlatform } = await import('../src/server/lib/resources.ts'))
  folder = mkdtempSync(join(tmpdir(), 'stop-with-no-lock-'))
  vi.stubEnv('XDG_CONFIG_HOME', folder)
  vi.stubEnv('MOLE_OFFICE_DB', t.file)
  mkdirSync(join(folder, 'mole-office', 'terminals'), { recursive: true })
  session = t.api.createRecord({ kind: 'session', title: THE_TERMINAL_HOLDER, workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running' } }).id
}, 60_000)
afterEach(() => {
  standIn.port = 'nothing'
  standIn.windows = false
  standIn.ask = null
  standIn.asked = { holds: [], toStop: [], ended: [] }
  standIn.onAsk = null
  standIn.closed = false
  rmSync(serviceLockPathFrom({ MOLE_OFFICE_DB: t.file }), { force: true })
  for (const holder of holders.splice(0)) holder.kill('SIGKILL')
  rmSync(theTerminalHolderSocket(t.file), { force: true })
  vi.restoreAllMocks()
})
afterAll(() => {
  vi.unstubAllEnvs()
  t.close()
  rmSync(folder, { recursive: true, force: true })
})

/** A stand-in holder of this database, once it listens; with `ownGroup`, it leads its own process group, as the server starts it. */
async function aHolder(ownGroup: boolean): Promise<{ child: ChildProcess; pid: number }> {
  rmSync(theTerminalHolderSocket(t.file), { force: true })
  const child = spawn(process.execPath, ['-e', A_HOLDER_THAT_ANSWERS_HELLO, theTerminalHolderSocket(t.file), t.file], {
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: ownGroup,
  })
  holders.push(child)
  await once(child.stdout as NodeJS.ReadableStream, 'data')
  return { child, pid: child.pid ?? -1 }
}

/** The holder's start, as the ledger door reads it on this machine. */
function theStartOf(pid: number): string {
  const read = theProbeForThisPlatform(process.platform).processById(pid)
  if (read === null) throw new Error(`process ${String(pid)} could not be read`)
  return read.startedAt
}

/** The holder's open row in the process ledger: with its group on Linux, and group 0 as on Windows. */
function aLedgerRow(pid: number, pgid: number): void {
  t.client.sqlite
    .prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, started_by_the_product) VALUES (?, 'default', ?, 'process', ?, ?, ?, 'the Mole Office terminal holder', '2026-11-06 12:00:00', 'agent:fixture', 1)",
    )
    .run(`holder-${String(pid)}`, session, String(pid), pgid, theStartOf(pid))
}

/** A waiting node as case 7 starts, read and then ended: its pid and start, for a lock that names a process that has gone. */
async function anEndedProcess(): Promise<{ pid: number; startedAt: string }> {
  const ended = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
  holders.push(ended)
  const pid = ended.pid ?? -1
  const reading = theProcessReading(pid)
  const startedAt = reading.here ? reading.startedAt : null
  if (startedAt === null) throw new Error(`the process that was to end for the stale lock, ${String(pid)}, could not be read`)
  ended.kill('SIGKILL')
  await once(ended, 'exit')
  const deadline = Date.now() + 2_000
  while (theProcessReading(pid).here && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  if (theProcessReading(pid).here) throw new Error(`process ${String(pid)} is still read after it ended, so no stale lock can name it`)
  return { pid, startedAt }
}

/** The service lock a server ended by SIGKILL leaves: it names a process that has gone. Its pid and its stale sentence. */
async function aStaleLock(): Promise<{ pid: number; said: string }> {
  const gone = await anEndedProcess()
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: t.file })
  writeFileSync(lockPath, JSON.stringify({ token: 'a-stand-in-token', pid: gone.pid, pgid: gone.pid, port: 1, processStartedAt: gone.startedAt }))
  return { pid: gone.pid, said: theLockIsStale(lockPath, gone.pid, 'gone') }
}

/** `mole-office stop` for this database: its exit code and the lines it said. */
async function theStop(): Promise<{ code: number; said: string[] }> {
  expect(existsSync(serviceLockPathFrom({ MOLE_OFFICE_DB: t.file })), 'the case needs no service lock').toBe(false)
  return theCommand('stop')
}

/** One `mole-office` command for this database, run here: its exit code and the lines it said. */
async function theCommand(what: 'stop' | 'restart'): Promise<{ code: number; said: string[] }> {
  const said: string[] = []
  const keep = (chunk: unknown): true => {
    said.push(...String(chunk).split('\n').filter((line) => line !== ''))
    return true
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(keep)
  vi.spyOn(process.stderr, 'write').mockImplementation(keep)
  const code = await main([what])
  vi.restoreAllMocks()
  return { code, said }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Whether the process has ended, asked again for up to two seconds: an ended child is reaped a moment after. */
async function hasEnded(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000
  while (isRunning(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  return !isRunning(pid)
}

/** PowerShell is never run here: a stand-in that refuses says so if anything asks for it. */
const NO_POWERSHELL = {
  powershell: (): never => {
    throw new Error('PowerShell was asked for, and no case here runs it.')
  },
  startPowerShell: (): Promise<never> => Promise.reject(new Error('PowerShell was asked for, and no case here runs it.')),
}

/** The real Windows ask on a socket file in the test's folder, where nothing listens. */
function windowsOnASocketFile(address: string) {
  const start = (): never => {
    throw new Error('No case here starts the helper.')
  }
  return windowsGroups(NO_POWERSHELL, () => address, start)
}

describe("a stop with no service lock ends a terminal holder it can prove is this database's", () => {
  it('1: exits 0 and says no holder runs when nothing answers and no holder runs', async () => {
    const { code, said } = await theStop()
    expect(said).toContain(NO_HOLDER_RUNS)
    expect(code).toBe(EXIT.OK)
  }, 30_000)

  it('2: ends the holder by its recorded group when nothing answers, says what it ended, and exits 0', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    const { code, said } = await theStop()
    expect(said).toContain(theHolderWasStoppedWords(holder.pid, holder.pid))
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('3: ends nothing, names the holder and exits HOLDER_NOT_STOPPED when no ledger row names it', async () => {
    const holder = await aHolder(true)
    const { code, said } = await theStop()
    expect(said.some((line) => line.includes(`process ${String(holder.pid)}`)), said.join('\n')).toBe(true)
    expect(code).toBe(EXIT.HOLDER_NOT_STOPPED)
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it('4: ends nothing and exits ANSWERING_WITHOUT_A_LOCK when this office answers on the port, even with a holder it could prove', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    standIn.port = 'this office'
    const { code, said } = await theStop()
    expect(said.some((line) => line.includes(String(holder.pid))), said.join('\n')).toBe(false)
    expect(code).toBe(EXIT.ANSWERING_WITHOUT_A_LOCK)
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it("5: on Windows says the refused ask and ends the Job Object named after the holder's parent when it holds the holder, and exits 0", async () => {
    const holder = await aHolder(false)
    aLedgerRow(holder.pid, 0)
    standIn.windows = true
    standIn.holding = { holds: true }
    const address = join(folder, `no-stop-pipe-${String(process.pid)}.sock`)
    rmSync(address, { force: true })
    const groups = windowsOnASocketFile(address)
    let refusal = ''
    standIn.ask = async (group) => {
      try {
        await groups.askToStop(group)
      } catch (err) {
        refusal = err instanceof Error ? err.message : String(err)
        throw err
      }
    }
    standIn.end = () => {
      holder.child.kill('SIGKILL')
    }
    const { code, said } = await theStop()
    expect(said).toContain(refusal)
    expect(refusal).toContain(A_REFUSED_STOP_REQUEST.couldNotReach(address))
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    const ended = said.filter((line) => line.includes(`process ${String(holder.pid)}`))
    expect(ended.length === 1 && ended[0]?.includes(`group ${String(process.pid)}`), said.join('\n')).toBe(true)
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('6: on Windows ends nothing and exits HOLDER_NOT_STOPPED when Windows says that Job Object does not hold the holder', async () => {
    const holder = await aHolder(false)
    aLedgerRow(holder.pid, 0)
    standIn.windows = true
    standIn.holding = { holds: false, why: 'the Job Object does not hold the process (a stand-in answer)' }
    standIn.end = () => {
      throw new Error('a group was ended')
    }
    const { code } = await theStop()
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [], ended: [] })
    expect(code).toBe(EXIT.HOLDER_NOT_STOPPED)
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it('7: a restart whose lock goes between its reading and its stop keeps the holder, stops nothing and exits NOT_RUNNING', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    // A WAITING NODE HOLDS THE LOCK, read as the lock's own process: the server that is about to let it go.
    const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
    holders.push(server)
    const serverPid = server.pid ?? -1
    const reading = theProcessReading(serverPid)
    const started = reading.here ? reading.startedAt : null
    expect(started, 'the waiting node could not be read').not.toBeNull()
    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: t.file })
    writeFileSync(lockPath, JSON.stringify({ token: 'a-stand-in-token', pid: serverPid, pgid: serverPid, port: 1, processStartedAt: started }))
    let asked = 0
    standIn.onAsk = () => {
      asked += 1
      if (asked === 1) rmSync(lockPath)
    }
    standIn.closed = true
    const { code, said } = await theCommand('restart')
    expect(asked, 'the restart did not ask the port after its stop read the lock again').toBeGreaterThanOrEqual(2)
    expect(said, said.join('\n')).toContain(theNoServiceLockToStopWords(lockPath))
    expect(said, said.join('\n')).toContain(NOTHING_WAS_STOPPED)
    expect(said.some((line) => line.includes(String(holder.pid))), said.join('\n')).toBe(false)
    expect(code, said.join('\n')).toBe(EXIT.NOT_RUNNING)
    expect(isRunning(holder.pid), 'the restart ended the holder').toBe(true)
    expect(isRunning(serverPid), 'the restart signalled the process that held the lock').toBe(true)
  }, 30_000)
})

describe("a stop with a stale service lock ends a terminal holder it can prove is this database's", () => {
  it('8: with a stale lock, ends the holder by its recorded group when nothing answers, says the lock is stale and what it ended, and exits 0', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    const stale = await aStaleLock()
    const { code, said } = await theCommand('stop')
    expect(said, said.join('\n')).toContain(stale.said)
    expect(said).toContain(theHolderWasStoppedWords(holder.pid, holder.pid))
    expect(said).not.toContain(NOTHING_WAS_STOPPED)
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('9: with a stale lock and no holder, says the lock is stale and that no holder runs, and exits 0', async () => {
    const stale = await aStaleLock()
    const { code, said } = await theCommand('stop')
    expect(said).toContain(stale.said)
    expect(said).toContain(NO_HOLDER_RUNS)
    expect(code).toBe(EXIT.OK)
  }, 30_000)

  it('10: with a stale lock, ends nothing, names the holder and exits HOLDER_NOT_STOPPED when no ledger row names it', async () => {
    const holder = await aHolder(true)
    const stale = await aStaleLock()
    const { code, said } = await theCommand('stop')
    expect(said).toContain(stale.said)
    expect(said.some((line) => line.includes(`process ${String(holder.pid)}`)), said.join('\n')).toBe(true)
    expect(code).toBe(EXIT.HOLDER_NOT_STOPPED)
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it('11: with a stale lock, ends nothing and exits STALE when this office answers on the port, even with a holder it could prove', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    const stale = await aStaleLock()
    standIn.port = 'this office'
    const { code, said } = await theCommand('stop')
    expect(said).toContain(stale.said)
    expect(said).toContain(NOTHING_WAS_STOPPED)
    expect(code).toBe(EXIT.STALE)
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it('12: a restart whose lock goes stale between its reading and its stop keeps the holder, stops nothing and exits STALE', async () => {
    const holder = await aHolder(true)
    aLedgerRow(holder.pid, holder.pid)
    // A WAITING NODE HOLDS THE LOCK when the restart reads it, and has gone by the time its stop reads it.
    const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
    holders.push(server)
    const serverPid = server.pid ?? -1
    const reading = theProcessReading(serverPid)
    const started = reading.here ? reading.startedAt : null
    expect(started, 'the waiting node could not be read').not.toBeNull()
    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: t.file })
    writeFileSync(lockPath, JSON.stringify({ token: 'a-stand-in-token', pid: serverPid, pgid: serverPid, port: 1, processStartedAt: started }))
    const gone = await anEndedProcess()
    let asked = 0
    standIn.onAsk = () => {
      asked += 1
      if (asked === 1) {
        writeFileSync(lockPath, JSON.stringify({ token: 'a-stand-in-token', pid: gone.pid, pgid: gone.pid, port: 1, processStartedAt: gone.startedAt }))
      }
    }
    standIn.closed = true
    const { code, said } = await theCommand('restart')
    expect(asked, 'the restart did not ask the port after its stop read the lock again').toBeGreaterThanOrEqual(2)
    expect(said, said.join('\n')).toContain(theLockIsStale(lockPath, gone.pid, 'gone'))
    expect(said, said.join('\n')).toContain(NOTHING_WAS_STOPPED)
    expect(said.some((line) => line.includes(String(holder.pid))), said.join('\n')).toBe(false)
    expect(code, said.join('\n')).toBe(EXIT.STALE)
    expect(isRunning(holder.pid), 'the restart ended the holder').toBe(true)
    expect(isRunning(serverPid), 'the restart signalled the waiting node').toBe(true)
  }, 30_000)
})
