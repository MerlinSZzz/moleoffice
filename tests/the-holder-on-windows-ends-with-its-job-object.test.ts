// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS THE STOP ASKS THE TERMINAL HOLDER TO STOP FIRST, WAITS FOR IT, AND THEN ENDS ITS JOB OBJECT.
 *
 * WHY. `mole-office stop`, and the owner's Shut down through the server's way out, end the terminal holder on Windows
 * by asking it on its group's stop pipe and then ending the group's Job Object. The holder listens for that request:
 * it answers `stopping`, tells its terminals to end, waits three seconds for them, closes and exits 0. A terminal that
 * did not end when asked is left in the Job Object, so the group is ended afterwards. Before this change the stop ended
 * the Job Object at once and the holder never heard a request. Case 4 is the check this file used to make, with the
 * refused ask now said before the end.
 *
 * WHAT IS CHECKED. The system layer's Windows groups are stood in: whether a Job Object holds a process, the ask on
 * the group's stop pipe, and the end of a group. A waiting node that answers the holder's hello for this database
 * stands in for the holder, and the ledger row is written as the server's ledger door writes it on Windows, with group
 * 0 and the start this machine reads.
 *   1. When the holder answers `stopping` and ends, the ask read exactly `stop\n`; the group is ended once, after the
 *      holder has ended, and its end answers ESRCH because nothing is left. The stop says the holder stopped when
 *      asked and nothing was left, and exits 0.
 *   2. The same, except that the group's end succeeds because a terminal is left: it was sent after the holder had
 *      ended, and the stop says every process left was ended after it, and exits 0.
 *   3. When the holder does not answer, the ask is refused after A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS. The stop says
 *      that refusal, then ends the group at once and says the Job Object was ended; it exits 0.
 *   4. When nothing is on the pipe, as for an older holder that does not listen, the stop says the refusal that it
 *      could not reach the address, then ends the group and says the Job Object was ended; it exits 0.
 *   5. When the holder is gone, the ask is refused and the group's end answers ESRCH: the stop says the refusal, then
 *      that the holder ended by itself before it was asked to stop; it exits 0.
 *   6. When Windows cannot say whether the Job Object holds the holder, or says that it does not, the stop asks
 *      nothing, ends nothing, says why and exits HOLDER_NOT_STOPPED, and the holder runs on.
 *   7. When no open ledger row names the holder, or its row names another start, the stop asks nothing, ends nothing,
 *      says why and exits HOLDER_NOT_STOPPED.
 *   8. The system layer reads that group, `readTheGroupItsParentNames` in src/config/systems/windows-groups.mjs. It
 *      answers the parent's number with what Windows said of that Job Object. For a parent number that is not a whole
 *      number above 0 it answers that there is no parent, and Windows is not asked.
 *   9. The window's wait for the service lock is STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS, and
 *      THE_HOLDER_ENDS_WITHIN_MS is at least A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS + 2 * HOLDER_STOP_WAIT_MS.
 *  10. When the holder answers `stopping`, keeps running, and the group's end refuses with EIO, the stop says it was
 *      still running after the wait, then gives the group's refusal and exits HOLDER_NOT_STOPPED.
 *  11. When the holder answers `stopping` and keeps running, and the group's end is sent and the holder ends, the stop
 *      says it was still running after the wait, then says the Job Object ended it, and exits 0.
 *
 * THE WAIT AFTER AN ANSWER THAT THE HOLDER IS STOPPING IS MADE TO PASS IN CASES 10 AND 11. Once the stand-in listener
 * has answered `stopping`, each Date.now() reading is HOLDER_STOP_WAIT_MS later than the one before, so the wait ends
 * after one poll. A stand-in process reader keeps the holder here, with its start, until the group end is called.
 *
 * WHAT ONLY WINDOWS CAN SHOW. Whether the holder's parent number still names its Job Object after the starter has
 * ended, whether that Job Object holds the holder's terminals, whether ending it ends them all, whether the real
 * holder's stop pipe answers on Windows, and whether its terminals end before the Job Object ends. The Win11 run after
 * the next package checks those.
 *
 * MUTATIONS, after a control run, each restored. In src/config/the-service-command.mjs:
 *   1. in endTheTerminalHolder, return EXIT.OK before endTheHoldersJobObject on Windows: cases 1 to 7 go red (nothing
 *      is asked or ended, and the holder runs on);
 *   2. in endTheHoldersJobObject, put `at.pid` in place of `at.ppid`: cases 1 to 6 go red (Windows is asked about the
 *      holder's own number, and that group is asked and ended);
 *   3. in endTheHoldersJobObject, put `if (false)` in place of `if (!holding.holds)`: case 6 goes red (a Job Object that
 *      does not hold the holder is asked and ended);
 *   4. in endTheHoldersJobObject, delete the line `if (notTheRecordedHolder !== null) return left(notTheRecordedHolder)`:
 *      case 7 goes red (a row of another start is taken, and Windows is asked);
 *   5. in endTheTerminalHolder, make `left` exit FAILED: cases 6 and 7 go red (exit code 1);
 *   6. the ask is not sent, so the stop goes straight to the end: cases 1 to 5, 10 and 11 go red;
 *   7. the group is ended without the wait after `stopping`: cases 1, 2, 10 and 11 go red (the group was ended while
 *      the holder still ran, or the sentence the wait says is missing);
 *   8. the group is not ended after the holder stopped when asked: cases 1 and 2 go red;
 *   9. the refusal's message is not told: cases 3, 4 and 5 go red;
 *  10. on ESRCH the stop tells `theHolderEndedByItselfWords` even when it answered stopping: case 1 goes red;
 *  11. the ask is moved above the holding check `if (!holding.holds)`: case 6 goes red (an unproved holder is asked);
 *  12. `stoppedWhenAsked` is set from the ask alone, so `theHolderWasStillRunningWords` is not told: cases 10 and 11 go
 *      red.
 * In src/config/systems/windows-groups.mjs:
 *  13. put `readHolds(pid, parent)` in place of `readHolds(parent, pid)`: cases 1 to 6 and 8 go red (Windows is asked
 *      about the holder's own number);
 *  14. delete the line that answers `{ noParent: true }`: case 8 goes red (Windows is asked about a number that names
 *      no group);
 *  15. answer `{ group: parent, holds: true }` whatever Windows said of the holding: cases 6 and 8 go red.
 * In src/desktop/what-the-shut-down-left.mjs:
 *  16. put THE_LOCK_GOES_WITHIN_MS back to STOP_WAIT_MS + HOLDER_STOP_WAIT_MS: case 9 goes red.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_TERMINAL_HOLDER } from '../src/config/own-rows.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import {
  A_REFUSED_STOP_REQUEST,
  A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS,
  THE_STOP_ANSWER,
  THE_STOP_REQUEST,
  readTheGroupItsParentNames,
  windowsGroups,
} from '../src/config/systems/windows-groups.mjs'
import {
  EXIT,
  HOLDER_STOP_WAIT_MS,
  STOP_WAIT_MS,
  THE_HOLDER_ENDS_WITHIN_MS,
  THE_HOLDER_WAS_NOT_STOPPED,
  endTheTerminalHolder,
  theHolderEndedByItselfWords,
  theHolderStoppedWhenAskedAndEveryProcessWasEndedWords,
  theHolderStoppedWhenAskedAndNothingWasLeftWords,
  theHolderStoppedWhenAskedWords,
  theHolderWasStillRunningWords,
  theHoldersJobObjectCouldNotBeEndedWords,
  theHoldersJobObjectWasEndedWords,
} from '../src/config/the-service-command.mjs'
import { theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_LOCK_GOES_WITHIN_MS } from '../src/desktop/what-the-shut-down-left.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Holding = Awaited<ReturnType<JobObjects['readHolds']>>

/**
 * THE WINDOWS GROUPS, STOOD IN only while `standIn.on` is set, and only in `thisSystem`, which the stop reads. The
 * process reader stays this machine's, so the holder's parent is the process that started it here: this test. The ask
 * is stood in as well, because on Linux the real one sends SIGTERM to the group, and the group here is this test's own
 * pid. A case that should ask hands in the real Windows ask on a socket file, which records nothing by itself.
 */
const standIn = vi.hoisted(() => ({
  on: false,
  holding: { unknown: 'no case has said yet what Windows answers (a stand-in answer)' } as Holding,
  end: (_group: number): void => {
    throw new Error('no case has said yet what ending a group does')
  },
  ask: null as null | ((group: number) => Promise<void>),
  /** When set, a stand-in process reader answers for the holder: here while it runs, gone after the group end. */
  late: null as null | { running: boolean },
  asked: { holds: [] as [number, number][], toStop: [] as number[], ended: [] as [number, string | number][] },
}))
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
      if (!standIn.on) return system
      const signal = (group: number, signal: NodeJS.Signals | 0): void => {
        standIn.asked.ended.push([group, signal])
        standIn.end(group)
      }
      const askToStop = (group: number): Promise<void> => {
        standIn.asked.toStop.push(group)
        if (standIn.ask === null) return Promise.reject(new Error('no case has said what the ask does (a stand-in refusal)'))
        return standIn.ask(group)
      }
      const withTheAsk = { ...system, groups: { ...system.groups, jobObjects, signal, askToStop } }
      if (standIn.late === null) return withTheAsk
      const readTheRealProcess = (pid: number) =>
        system.processes.readProcessAt === undefined ? Promise.resolve(system.processes.processAt(pid)) : system.processes.readProcessAt(pid)
      return {
        ...withTheAsk,
        processes: {
          ...system.processes,
          readProcessAt: (pid: number) =>
            standIn.late?.running === true ? readTheRealProcess(pid) : Promise.resolve({ here: false as const }),
        },
      }
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

/** PowerShell is never run here: a stand-in that refuses says so if anything asks for it. */
const NO_POWERSHELL = {
  powershell: (): never => {
    throw new Error('PowerShell was asked for, and no case here runs it.')
  },
  startPowerShell: (): Promise<never> => Promise.reject(new Error('PowerShell was asked for, and no case here runs it.')),
}

/** What the stop adds when it leaves the holder running. */
const LEFT = ` ${THE_HOLDER_WAS_NOT_STOPPED}`

// The server's modules open a database when they load, so they are loaded after a throwaway one is named.
let t: TestDb
let folder = ''
let theProbeForThisPlatform: typeof import('../src/server/lib/resources.ts').theProbeForThisPlatform
let session = ''
const holders: ChildProcess[] = []
const opened: Server[] = []
beforeAll(async () => {
  t = await freshDb()
  ;({ theProbeForThisPlatform } = await import('../src/server/lib/resources.ts'))
  folder = mkdtempSync(join(tmpdir(), 'holder-on-windows-'))
  vi.stubEnv('XDG_CONFIG_HOME', folder)
  mkdirSync(join(folder, 'mole-office', 'terminals'), { recursive: true })
  session = t.api.createRecord({ kind: 'session', title: THE_TERMINAL_HOLDER, workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running' } }).id
}, 60_000)
afterEach(async () => {
  standIn.on = false
  standIn.ask = null
  standIn.late = null
  standIn.asked = { holds: [], toStop: [], ended: [] }
  for (const holder of holders.splice(0)) holder.kill('SIGKILL')
  await Promise.all(
    opened.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.close(() => done())
        }),
    ),
  )
  vi.restoreAllMocks()
})
afterAll(() => {
  vi.unstubAllEnvs()
  t.close()
  rmSync(folder, { recursive: true, force: true })
})

/** A stand-in holder of this database, once it listens. */
async function aHolder(): Promise<{ child: ChildProcess; pid: number }> {
  rmSync(theTerminalHolderSocket(t.file), { force: true })
  const child = spawn(process.execPath, ['-e', A_HOLDER_THAT_ANSWERS_HELLO, theTerminalHolderSocket(t.file), t.file], { stdio: ['ignore', 'pipe', 'inherit'] })
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

/** The holder's open row in the process ledger, as the ledger door writes it on Windows: group 0. */
function aLedgerRow(pid: number, startedAt: string): void {
  t.client.sqlite
    .prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail, registered_at, registered_by, started_by_the_product) VALUES (?, 'default', ?, 'process', ?, 0, ?, 'the Mole Office terminal holder', '2026-11-06 12:00:00', 'agent:fixture', 1)",
    )
    .run(`holder-${String(pid)}`, session, String(pid), startedAt)
}

/** The stop of the holder on Windows: its exit code and the lines it said. */
async function theStop(): Promise<{ code: number; said: string[] }> {
  const said: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    said.push(...String(chunk).split('\n').filter((line) => line !== ''))
    return true
  })
  standIn.on = true
  const code = await endTheTerminalHolder({ databasePath: t.file })
  vi.restoreAllMocks()
  return { code, said }
}

/** The real Windows ask on a socket file in the test's folder, where a listener stands in for the group's stop pipe. */
function windowsOnASocketFile(address: string) {
  const start = (): never => {
    throw new Error('No case here starts the helper.')
  }
  return windowsGroups(NO_POWERSHELL, () => address, start)
}

/** A listener of the test's own on that socket file, which answers each connection as `answer` says. */
async function aStopPipeAt(address: string, answer: (socket: import('node:net').Socket) => void): Promise<Server> {
  rmSync(address, { force: true })
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    answer(socket)
    socket.resume()
  })
  opened.push(server)
  server.listen(address)
  await once(server, 'listening')
  return server
}

/** The real ask on a socket file, with the refusal it gave kept as the layer gave it. */
function theRefusalKept(refusal: { message?: string }, groups: ReturnType<typeof windowsOnASocketFile>) {
  return async (group: number): Promise<void> => {
    try {
      await groups.askToStop(group)
    } catch (err) {
      refusal.message = err instanceof Error ? err.message : String(err)
      throw err
    }
  }
}

/** A case's socket file, which no listener answers. */
function aSocketFileWithNothingOnIt(name: string): string {
  const address = join(folder, `${name}.sock`)
  rmSync(address, { force: true })
  return address
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

describe('on Windows the stop asks the terminal holder first and then ends its Job Object', () => {
  it("1: asks the holder on its group's stop pipe, waits until it has ended, and says nothing was left in its group", async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    const address = aSocketFileWithNothingOnIt('stop-1')
    const groups = windowsOnASocketFile(address)
    standIn.ask = (group) => groups.askToStop(group)
    const heard: string[] = []
    await aStopPipeAt(address, (socket) => {
      socket.on('data', (part: string) => {
        heard.push(part)
        socket.end(`${THE_STOP_ANSWER}\n`)
        setTimeout(() => holder.child.kill('SIGKILL'), 50)
      })
    })
    let runningWhenEnded: boolean | null = null
    standIn.end = () => {
      runningWhenEnded = isRunning(holder.pid)
      throw Object.assign(new Error(`No Job Object named Local\\mole-office-group-${String(process.pid)} exists.`), { code: 'ESRCH' })
    }
    const { code, said } = await theStop()
    expect(heard.join('')).toBe(`${THE_STOP_REQUEST}\n`)
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    expect(runningWhenEnded).toBe(false)
    expect(said).toEqual([theHolderStoppedWhenAskedAndNothingWasLeftWords(holder.pid, process.pid)])
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('2: says every process left in the group was ended after the holder stopped when it was asked', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    const address = aSocketFileWithNothingOnIt('stop-2')
    const groups = windowsOnASocketFile(address)
    standIn.ask = (group) => groups.askToStop(group)
    await aStopPipeAt(address, (socket) => {
      socket.on('data', () => {
        socket.end(`${THE_STOP_ANSWER}\n`)
        setTimeout(() => holder.child.kill('SIGKILL'), 50)
      })
    })
    let runningWhenEnded: boolean | null = null
    standIn.end = () => {
      runningWhenEnded = isRunning(holder.pid)
      holder.child.kill('SIGKILL')
    }
    const { code, said } = await theStop()
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    expect(runningWhenEnded).toBe(false)
    expect(said).toEqual([theHolderStoppedWhenAskedAndEveryProcessWasEndedWords(holder.pid, process.pid)])
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('3: says the refusal when the holder does not answer, then ends the group at once', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    const address = aSocketFileWithNothingOnIt('stop-3')
    const groups = windowsOnASocketFile(address)
    const refusal: { message?: string } = {}
    standIn.ask = theRefusalKept(refusal, groups)
    await aStopPipeAt(address, (socket) => {
      socket.on('data', () => {
        // SAY NOTHING: the ask is refused when its wait runs out.
      })
    })
    standIn.end = () => {
      holder.child.kill('SIGKILL')
    }
    const { code, said } = await theStop()
    expect(refusal.message).toContain(A_REFUSED_STOP_REQUEST.nothingAnswered(address))
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    expect(said).toEqual([refusal.message, theHoldersJobObjectWasEndedWords(holder.pid, process.pid)])
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('4: says the refusal when nothing is on the pipe, then ends the group, as an older holder that does not listen', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    const address = aSocketFileWithNothingOnIt('stop-4')
    const groups = windowsOnASocketFile(address)
    const refusal: { message?: string } = {}
    standIn.ask = theRefusalKept(refusal, groups)
    standIn.end = () => {
      holder.child.kill('SIGKILL')
    }
    const { code, said } = await theStop()
    expect(refusal.message).toContain(A_REFUSED_STOP_REQUEST.couldNotReach(address))
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    expect(said).toEqual([refusal.message, theHoldersJobObjectWasEndedWords(holder.pid, process.pid)])
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('5: says the refusal and that the holder ended by itself when its group is gone', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    const address = aSocketFileWithNothingOnIt('stop-5')
    const groups = windowsOnASocketFile(address)
    const refusal: { message?: string } = {}
    standIn.ask = theRefusalKept(refusal, groups)
    standIn.end = () => {
      holder.child.kill('SIGKILL')
      throw Object.assign(new Error(`No Job Object named Local\\mole-office-group-${String(process.pid)} exists.`), { code: 'ESRCH' })
    }
    const { code, said } = await theStop()
    expect(refusal.message).toContain(A_REFUSED_STOP_REQUEST.couldNotReach(address))
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
    expect(said[0]).toBe(refusal.message)
    expect(said).toHaveLength(2)
    expect(said[1]).toBe(theHolderEndedByItselfWords(holder.pid))
    expect(code).toBe(EXIT.OK)
    expect(await hasEnded(holder.pid)).toBe(true)
  }, 30_000)

  it('6: ends nothing, says why and exits HOLDER_NOT_STOPPED when Windows cannot say whether that Job Object holds the holder, or says it does not', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.end = () => {
      throw new Error('a group was ended')
    }
    standIn.holding = { unknown: 'Whether the Job Object Local\\mole-office-group-9000 holds a process is unknown: a stand-in answer.' }
    const unknown = await theStop()
    standIn.holding = { holds: false, why: 'the Job Object Local\\mole-office-group-9000 does not hold the process (a stand-in answer)' }
    const no = await theStop()
    expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid], [process.pid, holder.pid]], toStop: [], ended: [] })
    expect(unknown).toEqual({
      code: EXIT.HOLDER_NOT_STOPPED,
      said: [
        `Whether the terminal holder, process ${String(holder.pid)}, runs in group ${String(process.pid)}, the Job Object named after its parent, ` +
          `cannot be told: Whether the Job Object Local\\mole-office-group-9000 holds a process is unknown: a stand-in answer.${LEFT}`,
      ],
    })
    expect(no).toEqual({
      code: EXIT.HOLDER_NOT_STOPPED,
      said: [
        `The terminal holder, process ${String(holder.pid)}, does not run in group ${String(process.pid)}, the Job Object named after its parent: ` +
          "the Job Object Local\\mole-office-group-9000 does not hold the process (a stand-in answer). So Mole Office's starter did not start it, " +
          `and ending that group could reach another program.${LEFT}`,
      ],
    })
    expect(isRunning(holder.pid)).toBe(true)
  }, 30_000)

  it('7: asks Windows nothing and ends nothing when no open ledger row names the holder, or its row names another start', async () => {
    const unrecorded = await aHolder()
    const none = await theStop()
    unrecorded.child.kill('SIGKILL')
    const another = await aHolder()
    aLedgerRow(another.pid, '2020-01-01 00:00:00')
    standIn.holding = { holds: true }
    standIn.end = () => {
      throw new Error('a group was ended')
    }
    const otherStart = await theStop()
    expect(standIn.asked).toEqual({ holds: [], toStop: [], ended: [] })
    expect(none).toEqual({
      code: EXIT.HOLDER_NOT_STOPPED,
      said: [`Whether process ${String(unrecorded.pid)} is the terminal holder the office recorded cannot be told: no open row in the office's process ledger records it.${LEFT}`],
    })
    expect(otherStart).toEqual({
      code: EXIT.HOLDER_NOT_STOPPED,
      said: [
        `Process ${String(another.pid)} started at ${theStartOf(another.pid)}, but the office's process ledger recorded the terminal holder ` +
          `starting at 2020-01-01 00:00:00, so it may be another program.${LEFT}`,
      ],
    })
    expect(isRunning(another.pid)).toBe(true)
  }, 30_000)

  it("8: the system layer answers the parent's number with what Windows said of its Job Object, and asks nothing for no parent", async () => {
    const asked: [number, number][] = []
    let answer: Holding = { holds: true }
    const jobObjects: JobObjects = {
      theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
      readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
      holds: () => {
        throw new Error('the layer asks whether a Job Object holds a program without holding the thread')
      },
      readHolds: (group, pid) => {
        asked.push([group, pid])
        return Promise.resolve(answer)
      },
      programsOfAStarter: () => {
        throw new Error('no case here asks what a starter started')
      },
      readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
    }
    for (const parent of [0, -4, 1.5, Number.NaN, undefined as unknown as number]) {
      expect(await readTheGroupItsParentNames(jobObjects, 4321, parent), String(parent)).toEqual({ noParent: true })
    }
    expect(asked).toEqual([])
    const read = async (holding: Holding) => {
      answer = holding
      return readTheGroupItsParentNames(jobObjects, 4321, 9000)
    }
    expect(await read({ holds: true })).toEqual({ group: 9000, holds: true })
    expect(await read({ holds: false, why: 'the Job Object does not hold it (a stand-in answer)' })).toEqual({
      group: 9000,
      holds: false,
      why: 'the Job Object does not hold it (a stand-in answer)',
    })
    expect(await read({ unknown: 'Windows refused access (a stand-in answer).' })).toEqual({ group: 9000, unknown: 'Windows refused access (a stand-in answer).' })
    expect(asked).toEqual([
      [9000, 4321],
      [9000, 4321],
      [9000, 4321],
    ])
  })

  it('9: the window waits for the lock as long as the stop can take to ask the holder, end it and end its group', () => {
    expect(THE_LOCK_GOES_WITHIN_MS).toBe(STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS)
    expect(THE_HOLDER_ENDS_WITHIN_MS).toBeGreaterThanOrEqual(A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS + 2 * HOLDER_STOP_WAIT_MS)
  })

  it('10: says the holder was still running when it answered stopping and the group could not be ended, and exits HOLDER_NOT_STOPPED', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    standIn.late = { running: true }
    const address = aSocketFileWithNothingOnIt('stop-10')
    const groups = windowsOnASocketFile(address)
    standIn.ask = (group) => groups.askToStop(group)
    const realNow = Date.now.bind(Date)
    let offset = 0
    let late = false
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + (late ? (offset += HOLDER_STOP_WAIT_MS) : 0))
    await aStopPipeAt(address, (socket) => {
      socket.on('data', () => {
        socket.end(`${THE_STOP_ANSWER}\n`)
        late = true
      })
    })
    standIn.end = () => {
      throw Object.assign(new Error('EIO: the Job Object could not be read (a stand-in error).'), { code: 'EIO' })
    }
    try {
      const { code, said } = await theStop()
      expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
      expect(said).toHaveLength(2)
      expect(said[0]).toBe(theHolderWasStillRunningWords(holder.pid))
      expect(said[1]).toBe(
        `${theHoldersJobObjectCouldNotBeEndedWords(process.pid, 'EIO: the Job Object could not be read (a stand-in error).')}${LEFT}`,
      )
      expect(said[1]?.endsWith(LEFT)).toBe(true)
      expect(said.some((line) => line.startsWith(theHolderStoppedWhenAskedWords(holder.pid)))).toBe(false)
      expect(code).toBe(EXIT.HOLDER_NOT_STOPPED)
      expect(isRunning(holder.pid)).toBe(true)
    } finally {
      clock.mockRestore()
    }
  }, 30_000)

  it('11: says the holder was still running when it answered stopping, then says the group ended it, and exits 0', async () => {
    const holder = await aHolder()
    aLedgerRow(holder.pid, theStartOf(holder.pid))
    standIn.holding = { holds: true }
    standIn.late = { running: true }
    const address = aSocketFileWithNothingOnIt('stop-11')
    const groups = windowsOnASocketFile(address)
    standIn.ask = (group) => groups.askToStop(group)
    const realNow = Date.now.bind(Date)
    let offset = 0
    let late = false
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + (late ? (offset += HOLDER_STOP_WAIT_MS) : 0))
    await aStopPipeAt(address, (socket) => {
      socket.on('data', () => {
        socket.end(`${THE_STOP_ANSWER}\n`)
        late = true
      })
    })
    standIn.end = () => {
      standIn.late = { running: false }
      holder.child.kill('SIGKILL')
    }
    try {
      const { code, said } = await theStop()
      expect(standIn.asked).toEqual({ holds: [[process.pid, holder.pid]], toStop: [process.pid], ended: [[process.pid, 'SIGKILL']] })
      expect(said).toHaveLength(2)
      expect(said[0]).toBe(theHolderWasStillRunningWords(holder.pid))
      expect(said[1]).toBe(theHoldersJobObjectWasEndedWords(holder.pid, process.pid))
      expect(said.some((line) => line.startsWith(theHolderStoppedWhenAskedWords(holder.pid)))).toBe(false)
      expect(code).toBe(EXIT.OK)
      expect(await hasEnded(holder.pid)).toBe(true)
    } finally {
      clock.mockRestore()
    }
  }, 30_000)
})
