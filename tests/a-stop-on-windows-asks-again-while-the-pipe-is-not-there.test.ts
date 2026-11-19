// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOP ON WINDOWS ASKS AGAIN WHILE THE OFFICE'S STOP PIPE IS NOT THERE YET, AND A REFUSED ASK IS SAID, NOT THROWN.
 * Wave 13t, round W19.
 *
 * WHY. On the Windows 11 machine the uninstaller ran `mole-office stop` about a second after a restarted office had
 * recorded its terminal holder. The office answered on its port, and the command ended with exit code 1 and no
 * sentence of its own, so the uninstaller refused. The same command, run 35 seconds later, stopped the office. The
 * office makes its stop pipe last in its start, through a PowerShell helper that took 0.9 seconds to listen in an
 * earlier run there. So the times point to an ask that found no pipe, whose refusal was thrown and not said. Only a
 * run on Windows can show that this was the cause.
 *
 * This file checks:
 *   1. on Windows an ask of a group whose pipe is not there is refused with `thePipeIsNotThere`, and with no code; a
 *      pipe that answers another line is refused without it, and so is a refused signal on Linux and the Mac;
 *   2. `mole-office stop` on Windows asks again while the pipe is not there, stops the office once the pipe answers,
 *      and says how many tries it took;
 *   3. when the pipe is still not there after STOP_PIPE_WAIT_MS, it says the refusal and that it asked no more, and
 *      ends with exit code 1; the office and its lock are left as they were;
 *   4. every other refusal is said at once, with no second ask, and ends with exit code 1;
 *   5. on Linux and the Mac a refused signal is said, and ends with exit code 1.
 *
 * The pipe cannot be opened on Linux: a socket file stands in for it, behind the real Windows groups. The Job Object
 * and the port's answer are stood in, as in tests/windows-refuses-in-words-where-it-cannot-answer.test.ts, and a
 * waiting node stands in for the server. What Windows does is proved only by the Win11 run.
 *
 * MUTATIONS, in the commit message.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serviceLockPathFrom, serviceLogPathFrom } from '../src/config/settings.mjs'
import { posixGroups } from '../src/config/systems/posix-groups.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import { THE_STOP_ANSWER, THE_STOP_REQUEST, windowsGroups } from '../src/config/systems/windows-groups.mjs'
import { STOP_PIPE_WAIT_MS, main } from '../src/config/the-service-command.mjs'
import { readTheServiceLock, takeTheServiceLock, theProcessReading } from '../src/config/the-service-lock.mjs'
import { theLongestSocketPathBytes, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'

/**
 * THE SYSTEM LAYER'S GROUPS AND THE PORT'S ANSWER, STOOD IN only while `standIn.groups` is set. While it is set, the
 * command's stop asks no port: the self-check answers that this office is healthy there.
 */
const standIn = vi.hoisted(() => ({ groups: null as null | { jobObjects: JobObjects | null; askToStop: (group: number) => Promise<void> } }))
vi.mock('../src/config/systems/the-system.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/systems/the-system.mjs')>()
  const withTheStandIn = (system: ReturnType<typeof real.thisSystem>) =>
    standIn.groups === null ? system : { ...system, groups: { ...system.groups, ...standIn.groups } }
  return {
    ...real,
    thisSystem: () => withTheStandIn(real.thisSystem()),
    theSystemFor: (platform: string) =>
      platform === process.platform ? withTheStandIn(real.theSystemFor(platform)) : real.theSystemFor(platform),
  }
})
vi.mock('../src/config/the-self-check.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-self-check.mjs')>()
  return {
    ...real,
    whatAnswersForThisOffice: (options: Parameters<typeof real.whatAnswersForThisOffice>[0]) =>
      standIn.groups === null
        ? real.whatAnswersForThisOffice(options)
        : Promise.resolve({ answer: 'healthy', address: options?.address ?? '', world: null, holder: null }),
  }
})

/** PowerShell is never run here: a stand-in that refuses says so if anything asks for it. */
const NO_POWERSHELL = {
  powershell: (): never => {
    throw new Error('PowerShell was asked for, and no case here runs it.')
  },
  startPowerShell: (): Promise<never> => Promise.reject(new Error('PowerShell was asked for, and no case here runs it.')),
}

/** The group the stand-in office's lock names on Windows. */
const GROUP = 9000

let scratch = ''
const opened: Server[] = []
const servers: ChildProcess[] = []

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'a-stop-asks-again-'))
})

afterEach(async () => {
  standIn.groups = null
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const server of servers.splice(0)) server.kill('SIGKILL')
  await Promise.all(opened.splice(0).map((server) => new Promise((done) => server.close(done))))
  rmSync(scratch, { recursive: true, force: true })
})

/** The Windows groups, with a socket file in scratch in place of each group's pipe. */
function windowsOnASocketFile() {
  const at = (group: number) => join(scratch, `stop-${String(group)}.sock`)
  const start = (): never => {
    throw new Error('No case here starts the helper.')
  }
  return { groups: windowsGroups(NO_POWERSHELL, at, start), at }
}

/** A refusal for an ask of a socket file that is not there. */
const nothingIsThereAt = (address: string, group: number) =>
  new RegExp(
    `^The stop request could not reach ${address.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}: .*ENOENT.*\\. So group ${String(group)} was not asked to stop, and it may still be running\\.$`,
    'u',
  )

/** What an ask rejected with. */
async function theRefusalOf(asking: Promise<void>): Promise<Error & { code?: unknown; thePipeIsNotThere?: unknown }> {
  try {
    await asking
  } catch (error) {
    return error as Error & { code?: unknown; thePipeIsNotThere?: unknown }
  }
  throw new Error('The ask was not refused.')
}

/** A program of the test's own on a socket file, which answers each connection as `answer` says. */
async function aListenerOfItsOwn(path: string, answer: (socket: import('node:net').Socket) => void): Promise<Server> {
  const server = createServer((socket) => {
    socket.setEncoding('utf8')
    answer(socket)
    // Read to the end, so that the socket closes when the other side does and the server can be closed.
    socket.resume()
  })
  opened.push(server)
  server.listen(path)
  await once(server, 'listening')
  return server
}

/**
 * A STAND-IN OFFICE: a node that waits, which the service lock names as the server of a database in scratch. On
 * Windows the lock names `GROUP`; on Linux and the Mac the node leads a group of its own, as a started server does.
 */
async function anOffice(on: 'windows' | 'posix') {
  const database = join(scratch, 'office.db')
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
  const server = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore', detached: on === 'posix' })
  servers.push(server)
  const pid = server.pid ?? -1
  vi.stubEnv('MOLE_OFFICE_DB', database)
  // THE HOLDER IS LOOKED FOR IN A SHORT FOLDER OF THE TEST'S OWN. Under a deep home its socket path is longer than a
  // Unix socket path may be, Node cuts it, and a cut that names a folder is answered as refused rather than as no
  // holder, so what the stop says would depend on where the suite runs (problem deY5bZxwxjkG).
  vi.stubEnv('XDG_CONFIG_HOME', join(scratch, 'config'))
  expect(Buffer.byteLength(theTerminalHolderSocket(database)), 'the holder socket path fits').toBeLessThanOrEqual(theLongestSocketPathBytes())
  const taken = await takeTheServiceLock({
    lockPath,
    databasePath: database,
    port: 9,
    checkout: scratch,
    pid,
    readProcess: theProcessReading,
    group: on === 'windows' ? { group: GROUP } : null,
  })
  expect(taken.taken).toBe(true)
  const said: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    said.push(String(chunk))
    return true
  })
  return {
    pid,
    lockPath,
    logPath: serviceLogPathFrom({ MOLE_OFFICE_DB: database }),
    said: () => said.join('').split('\n').slice(0, -1),
    /** What the office does when it hears the request: it ends, and its lock goes. */
    stops: () => {
      server.kill()
      rmSync(lockPath)
    },
    runs: () => theProcessReading(pid).here,
  }
}

/** A Job Object that holds the lock's server. */
const holdingTheServer: JobObjects = {
  theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
  readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
  holds: () => ({ holds: true }),
  readHolds: () => Promise.reject(new Error('no case here asks whether a group holds a process without holding the thread')),
  programsOfAStarter: () => {
    throw new Error('no case here asks what a starter started')
  },
  readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
}

describe('a stop on Windows', () => {
  it('1: is refused with thePipeIsNotThere when the pipe is not there, and only then', async () => {
    const { groups, at } = windowsOnASocketFile()
    const notThere = await theRefusalOf(groups.askToStop(41))
    expect(notThere.message).toMatch(nothingIsThereAt(at(41), 41))
    expect(notThere.thePipeIsNotThere).toBe(true)
    expect(notThere.code).toBeUndefined()

    await aListenerOfItsOwn(at(42), (socket) => socket.end('no\n'))
    const another = await theRefusalOf(groups.askToStop(42))
    expect(another.message).toBe(
      `The program on ${at(42)} answered "no", not ${JSON.stringify(THE_STOP_ANSWER)}. So group 42 was not asked to stop, and it may still be running.`,
    )
    expect(another).not.toHaveProperty('thePipeIsNotThere')

    // A group that is not there, on Linux and the Mac: what the signal throws comes back as it is.
    const signal = await theRefusalOf(posixGroups().askToStop(4_194_304 + 7))
    expect(signal).toMatchObject({ code: 'ESRCH' })
    expect(signal).not.toHaveProperty('thePipeIsNotThere')
  })

  it('2: asks again while the pipe is not there, stops the office once it answers, and says how many tries it took', async () => {
    const office = await anOffice('windows')
    const { groups, at } = windowsOnASocketFile()
    const asks: number[] = []
    standIn.groups = {
      jobObjects: holdingTheServer,
      askToStop: (group) => {
        asks.push(group)
        return groups.askToStop(group)
      },
    }
    // The office makes its pipe after it has begun to answer, as the real one does.
    const heard: string[] = []
    const late = setTimeout(() => {
      void aListenerOfItsOwn(at(GROUP), (socket) => {
        socket.on('data', (part: string) => {
          heard.push(part)
          socket.end(`${THE_STOP_ANSWER}\n`)
          office.stops()
        })
      })
    }, 700)
    try {
      expect(await main(['stop'])).toBe(0)
    } finally {
      clearTimeout(late)
    }
    expect(heard).toEqual([`${THE_STOP_REQUEST}\n`])
    expect(asks.length).toBeGreaterThanOrEqual(2)
    expect(asks.every((group) => group === GROUP)).toBe(true)
    const said = office.said()
    const tries = /^Group 9000's stop pipe was not there yet, so the request was sent again until it was: (\d+) tries in (\d+) ms\.$/u.exec(said[0] ?? '')
    expect(tries, said[0]).not.toBeNull()
    expect(Number(tries?.[1])).toBe(asks.length)
    expect(Number(tries?.[2])).toBeGreaterThanOrEqual(600)
    expect(said.slice(1)).toEqual([
      `Asked group ${String(GROUP)} to stop, with a stop request on its pipe.`,
      `Mole Office stopped: process ${String(office.pid)} has ended, and the service lock is gone.`,
      'No terminal holder runs for this database, so none was stopped.',
    ])
  })

  it('3: says the refusal and asks no more when the pipe is still not there after STOP_PIPE_WAIT_MS, and leaves the office', async () => {
    const office = await anOffice('windows')
    const { groups, at } = windowsOnASocketFile()
    // Each ask moves the clock on by a third of the wait, so the wait is over after a few tries.
    const realNow = Date.now.bind(Date)
    let ahead = 0
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ahead)
    const asks: number[] = []
    standIn.groups = {
      jobObjects: holdingTheServer,
      askToStop: (group) => {
        asks.push(group)
        ahead += STOP_PIPE_WAIT_MS / 3
        return groups.askToStop(group)
      },
    }
    expect(await main(['stop'])).toBe(1)
    const said = office.said()
    expect(said).toHaveLength(3)
    expect(said[0]).toMatch(nothingIsThereAt(at(GROUP), GROUP))
    expect(asks.length).toBeGreaterThanOrEqual(2)
    expect(said.slice(1)).toEqual([
      `The pipe was not there at any of the ${String(asks.length)} tries in ${String(STOP_PIPE_WAIT_MS / 1000)} seconds.`,
      `Nothing more was sent to it. Its output is in ${office.logPath}.`,
    ])
    expect(office.runs()).toBe(true)
    expect(readTheServiceLock(office.lockPath).state).toBe('read')
  })

  it('4: says every other refusal at once, with no second ask', async () => {
    const office = await anOffice('windows')
    const { groups, at } = windowsOnASocketFile()
    await aListenerOfItsOwn(at(GROUP), (socket) => socket.end('no\n'))
    const asks: number[] = []
    standIn.groups = {
      jobObjects: holdingTheServer,
      askToStop: (group) => {
        asks.push(group)
        return groups.askToStop(group)
      },
    }
    expect(await main(['stop'])).toBe(1)
    expect(asks).toEqual([GROUP])
    expect(office.said()).toEqual([
      `The program on ${at(GROUP)} answered "no", not ${JSON.stringify(THE_STOP_ANSWER)}. So group ${String(GROUP)} was not asked to stop, and it may still be running.`,
      `Nothing more was sent to it. Its output is in ${office.logPath}.`,
    ])
    expect(office.runs()).toBe(true)
    expect(readTheServiceLock(office.lockPath).state).toBe('read')
  })
})

describe('a stop on Linux and the Mac', () => {
  it('5: says a refused signal, and ends with exit code 1', async () => {
    const office = await anOffice('posix')
    const asks: number[] = []
    standIn.groups = {
      jobObjects: null,
      askToStop: (group) => {
        asks.push(group)
        return Promise.reject(Object.assign(new Error('kill EPERM (a stand-in refusal)'), { code: 'EPERM' }))
      },
    }
    expect(await main(['stop'])).toBe(1)
    expect(asks).toEqual([office.pid])
    expect(office.said()).toEqual(['kill EPERM (a stand-in refusal)', `Nothing more was sent to it. Its output is in ${office.logPath}.`])
    expect(office.runs()).toBe(true)
  })
})
