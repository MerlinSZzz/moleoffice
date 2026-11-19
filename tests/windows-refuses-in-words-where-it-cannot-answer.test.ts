// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE MOLE OFFICE WOULD GIVE A WRONG ANSWER ON WINDOWS, IT REFUSES THERE IN WORDS (wave 13t, round 25; report
 * bknY4s0NBTAT, items 1, 3 and 10). Windows is stood in by naming 'win32'; process.platform is never changed.
 *
 * WHAT IS PROVED:
 *   1. a stop that asks a group to stop refuses on Windows rather than end it at once or answer that it is gone:
 *      the worker's endGroup and the server probe's killProcessGroup with SIGTERM. Since round W8, item 22,
 *      `mole-office stop` runs on Windows. It asks the group its service lock names only when that group's Job
 *      Object holds the lock's server. When that cannot be told it says why and exits 7. When the Job Object does not
 *      hold the server it says so and exits 8. Either way it asks nothing, and the lock stays. Here the system layer
 *      and the port's answer are stood in, and a waiting node stands in for the server: what Windows answers is
 *      proved only by the Win11 run;
 *   2. the message worker's probe on Windows refuses, in a 501 in its own words, what it cannot read there: the
 *      processes of a group, the server's own group and the listening ports. It reads one process through the
 *      Windows reader, which tests/the-message-workers-probe-on-windows.test.ts checks with PowerShell stood in;
 *   3. the sandbox logins' mode check says it cannot tell who may read a file on Windows, instead of calling
 *      every file there readable by others;
 *   4. on Linux each answers as before: endGroup on a group that is gone says false, and a file at 600 is safe.
 *
 * MUTATIONS, in the commit message, one per part. For the stop on Windows, in the commit message of round W8 that
 * made it run there.
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { WHAT_WINDOWS_NEEDS_TO_READ_PROCESSES, WINDOWS_HAS_NO_PROCESS_GROUPS } from '../src/config/process-reader.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import type { JobObjects } from '../src/config/systems/the-system.mjs'
import { theSignalIsRefusedWords, WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE } from '../src/config/systems/windows-groups.mjs'
import {
  ASKING_THAT_GROUP_COULD_REACH_ANOTHER_PROGRAM,
  main,
  NO_HOLDER_RUNS,
  NOTHING_WAS_STOPPED,
  theGroupWasAskedToStopWords,
  theLocksGroupCannotBeToldWords,
  theServerIsNotInTheLocksGroupWords,
  theServerStoppedWords,
} from '../src/config/the-service-command.mjs'
import { readTheServiceLock, takeTheServiceLock, theProcessReading } from '../src/config/the-service-lock.mjs'
import { theLongestSocketPathBytes, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { endGroup } from '../src/worker/runtimes/os.ts'
import { freshDb, type TestDb } from './helpers.ts'

/**
 * THE SYSTEM LAYER'S GROUPS AND THE PORT'S ANSWER, STOOD IN only while `standIn.groups` is set, for the case of
 * `mole-office stop` on Windows. Every other case reads the real layer. While it is set, the command's stop asks no
 * port: the self-check answers that this office is healthy there.
 */
const standIn = vi.hoisted(() => ({ groups: null as null | { jobObjects: JobObjects; askToStop: (group: number) => Promise<void> } }))
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

// The server's modules open a database when they load, so they are loaded after a throwaway one is named.
let t: TestDb
let theProbeForThisPlatform: typeof import('../src/server/lib/resources.ts').theProbeForThisPlatform
let theGroupWasNotStoppedWords: typeof import('../src/server/lib/resources.ts').theGroupWasNotStoppedWords
let theListReadsOnlyLinuxWords: typeof import('../src/server/lib/resources.ts').theListReadsOnlyLinuxWords
let whyItIsUnsafe: typeof import('../src/server/lib/sandbox-logins.ts').whyItIsUnsafe
let theModeCannotTellOnWindowsWords: typeof import('../src/server/lib/sandbox-logins.ts').theModeCannotTellOnWindowsWords
let othersCanReadTheFileWords: typeof import('../src/server/lib/sandbox-logins.ts').othersCanReadTheFileWords
let theGroupsProcessesCannotBeListedWords: typeof import('../src/server/lib/windows-probe.ts').theGroupsProcessesCannotBeListedWords
let THIS_SERVER_HAS_NO_GROUP_TO_NAME: typeof import('../src/server/lib/windows-probe.ts').THIS_SERVER_HAS_NO_GROUP_TO_NAME
let THE_PORTS_ARE_NOT_READ_ON_WINDOWS: typeof import('../src/server/lib/windows-probe.ts').THE_PORTS_ARE_NOT_READ_ON_WINDOWS
beforeAll(async () => {
  t = await freshDb()
  ;({ theProbeForThisPlatform, theGroupWasNotStoppedWords, theListReadsOnlyLinuxWords } = await import('../src/server/lib/resources.ts'))
  ;({ whyItIsUnsafe, theModeCannotTellOnWindowsWords, othersCanReadTheFileWords } = await import('../src/server/lib/sandbox-logins.ts'))
  ;({ theGroupsProcessesCannotBeListedWords, THIS_SERVER_HAS_NO_GROUP_TO_NAME, THE_PORTS_ARE_NOT_READ_ON_WINDOWS } = await import('../src/server/lib/windows-probe.ts'))
}, 60_000)
afterAll(() => {
  t.close()
})

/** A group id no process on this machine has: above the largest pid Linux hands out. */
const NO_SUCH_GROUP = 4_194_304 + 7

afterEach(() => {
  vi.restoreAllMocks()
})

describe('1. a stop that asks a group to stop refuses on Windows', () => {
  it("refuses SIGTERM in the worker's endGroup, and says false on Linux for a group that is gone", () => {
    expect(() => endGroup(NO_SUCH_GROUP, 'SIGTERM', 'win32')).toThrow(theSignalIsRefusedWords('SIGTERM', NO_SUCH_GROUP))
    expect(endGroup(NO_SUCH_GROUP, 'SIGTERM', 'linux')).toBe(false)
  })

  it("refuses SIGTERM in the server probe's killProcessGroup with a 501", () => {
    let refused: unknown = null
    try {
      theProbeForThisPlatform('win32').killProcessGroup(NO_SUCH_GROUP, 'SIGTERM')
    } catch (err) {
      refused = err
    }
    expect(refused).toMatchObject({ status: 501, message: theGroupWasNotStoppedWords(NO_SUCH_GROUP) })
  })

  it("asks the lock's group to stop on Windows only when its Job Object holds the lock's server, and says why not", async () => {
    const cannotReadTheGroup = 'Group 9000 could not be read (a stand-in answer).'
    const holdsOtherProcesses = 'it holds other processes (a stand-in answer)'
    const folder = mkdtempSync(join(tmpdir(), 'windows-stop-'))
    const database = join(folder, 'office.db')
    const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
    // A STAND-IN FOR THE SERVER: a node that waits, so that the lock names a process that runs.
    const server = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' })
    const said: string[] = []
    const asked: { holds: [number, number][]; toStop: number[] } = { holds: [], toStop: [] }
    try {
      const pid = server.pid ?? -1
      vi.stubEnv('MOLE_OFFICE_DB', database)
      // THE HOLDER IS LOOKED FOR IN A SHORT FOLDER OF THE TEST'S OWN. Under a deep home its socket path is longer than a
      // Unix socket path may be, Node cuts it, and a cut that names a folder is answered as refused rather than as no
      // holder, so what the stop says would depend on where the suite runs (problem wl62yFmfH9js).
      vi.stubEnv('XDG_CONFIG_HOME', join(folder, 'config'))
      expect(Buffer.byteLength(theTerminalHolderSocket(database)), 'the holder socket path fits').toBeLessThanOrEqual(theLongestSocketPathBytes())
      const taken = await takeTheServiceLock({ lockPath, databasePath: database, port: 9, checkout: folder, pid, readProcess: theProcessReading, group: { group: 9000 } })
      expect(taken.taken).toBe(true)
      let holding: ReturnType<JobObjects['holds']> = { unknown: cannotReadTheGroup }
      standIn.groups = {
        jobObjects: {
          theOneThisProgramWasStartedIn: () => ({ unknown: 'not asked here' }),
          readTheOneThisProgramWasStartedIn: () => Promise.resolve({ unknown: 'not asked here' }),
          holds: (group, of) => {
            asked.holds.push([group, of])
            return holding
          },
          readHolds: () => Promise.reject(new Error('no case here asks whether a group holds a process without holding the thread')),
          programsOfAStarter: () => {
            throw new Error('no case here asks what a starter started')
          },
          readProgramsOfAStarter: () => Promise.reject(new Error('no case here asks what a starter started')),
        },
        askToStop: (group) => {
          asked.toStop.push(group)
          server.kill()
          rmSync(lockPath)
          return Promise.resolve()
        },
      }
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        said.push(String(chunk))
        return true
      })
      expect(await main(['stop'])).toBe(7)
      expect(readTheServiceLock(lockPath).state).toBe('read')
      holding = { holds: false, why: holdsOtherProcesses }
      expect(await main(['stop'])).toBe(8)
      expect(readTheServiceLock(lockPath).state).toBe('read')
      expect(asked.toStop).toEqual([])
      holding = { holds: true }
      expect(await main(['stop'])).toBe(0)
      vi.restoreAllMocks()
      expect(asked.holds).toEqual([
        [9000, pid],
        [9000, pid],
        [9000, pid],
      ])
      expect(asked.toStop).toEqual([9000])
      expect(said.join('')).toBe(
        `${theLocksGroupCannotBeToldWords(pid, 9000, cannotReadTheGroup)}\n` +
          `${NOTHING_WAS_STOPPED}\n` +
          `${theServerIsNotInTheLocksGroupWords(pid, 9000, holdsOtherProcesses)}\n` +
          `${ASKING_THAT_GROUP_COULD_REACH_ANOTHER_PROGRAM}\n` +
          `${NOTHING_WAS_STOPPED}\n` +
          `${theGroupWasAskedToStopWords(9000)}\n` +
          `${theServerStoppedWords(pid)}\n` +
          `${NO_HOLDER_RUNS}\n`,
      )
    } finally {
      standIn.groups = null
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      server.kill()
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30_000)
})

describe("2. the message worker's probe on Windows refuses what it cannot read", () => {
  it('refuses the processes of a group, its own group and the listening ports, each in a 501 in its own words', () => {
    const probe = theProbeForThisPlatform('win32')
    const refusal = (ask: () => unknown): unknown => {
      try {
        ask()
      } catch (err) {
        return err
      }
      return null
    }
    expect(refusal(() => probe.processesInGroup(NO_SUCH_GROUP))).toMatchObject({
      status: 501,
      message: theGroupsProcessesCannotBeListedWords(NO_SUCH_GROUP),
    })
    expect(refusal(() => probe.ownProcessGroup())).toMatchObject({
      status: 501,
      message: THIS_SERVER_HAS_NO_GROUP_TO_NAME,
    })
    expect(refusal(() => probe.listeningPorts())).toMatchObject({
      status: 501,
      message: THE_PORTS_ARE_NOT_READ_ON_WINDOWS,
    })
  })

  it('says none of the Windows words on another system that is not Linux', () => {
    let refused: unknown = null
    try {
      theProbeForThisPlatform('freebsd').processById(1)
    } catch (err) {
      refused = err
    }
    expect((refused as Error).message).toBe(theListReadsOnlyLinuxWords('freebsd'))
    expect((refused as Error).message).not.toContain(WHAT_WINDOWS_NEEDS_TO_READ_PROCESSES)
    expect((refused as Error).message).not.toContain(WINDOWS_HAS_NO_PROCESS_GROUPS)
  })
})

describe("3. the sandbox logins' mode check on Windows", () => {
  it('says it cannot tell who may read the file, and says nothing of a file that is not there', () => {
    const folder = mkdtempSync(join(tmpdir(), 'windows-modes-'))
    try {
      const file = join(folder, 'claude-code.env')
      writeFileSync(file, 'CLAUDE_CODE_OAUTH_TOKEN=x\n')
      chmodSync(file, 0o600)
      expect(whyItIsUnsafe(file, 'C:\\Users\\jory\\claude-code.env', 'win32')).toBe(theModeCannotTellOnWindowsWords('C:\\Users\\jory\\claude-code.env'))
      expect(whyItIsUnsafe(join(folder, 'missing.env'), 'missing.env', 'win32')).toBeNull()
      // 4. Linux, as before: 600 is safe, and 644 is readable by others.
      expect(whyItIsUnsafe(file, 'claude-code.env', 'linux')).toBeNull()
      chmodSync(file, 0o644)
      expect(whyItIsUnsafe(file, 'claude-code.env', 'linux')).toBe(othersCanReadTheFileWords('claude-code.env', 0o644))
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
