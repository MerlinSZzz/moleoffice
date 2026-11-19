// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PROCESS THAT SHARES ITS FILES STARTS ONLY WHILE ENOUGH MEMORY IS FREE, AND SAYS SO WHEN IT WAITS.
 *
 * tests/a-test-process-starts-only-while-memory-is-free.ts reads the free memory from /proc and from the
 * control group files, and waits until it is at the floor. Here both are given a world of their own: a
 * made-up set of those files, and a clock that moves only when the wait sleeps. So nothing here depends
 * on how much memory this machine has.
 *
 * WHAT GOES RED. Read only /proc/meminfo, and the limit cases fail. Leave out `inactive_file`, and the
 * room under a limit is wrong. Walk the folders with `join` alone, and the root group `0::/` fails.
 * Say nothing while waiting, and the waiting case fails. Take the wait out of
 * tests/a-file-in-a-shared-process-starts-clean.ts, or stop awaiting it there, and the first-file case fails.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  freeMemory,
  LOOK_AGAIN_EVERY_MS,
  SAY_AGAIN_EVERY_MS,
  waitUntilMemoryIsFree,
  type FreeMemory,
  type ReadAFile,
} from './a-test-process-starts-only-while-memory-is-free.ts'

const GiB = 1024 * 1024 * 1024
const MB = 1024 * 1024

/** A memory.stat with the lines around `inactive_file` that a pattern could take by mistake. */
function aMemoryStat(inactiveFile: number): string {
  return `anon 1000\nfile 99999999\nactive_file 77777777\ninactive_file ${inactiveFile}\nshmem 0\n`
}

/** A machine with these files and no others. */
function aMachine(files: Record<string, string>): ReadAFile {
  return (path) => files[path] ?? null
}

/** A machine with control groups version 2, the process in `group`, and `available` kB in /proc/meminfo. */
function aMachineWithGroups(group: string, available: number, more: Record<string, string> = {}): ReadAFile {
  return aMachine({
    '/proc/meminfo': `MemTotal:       99999999 kB\nMemFree:         1000 kB\nMemAvailable:   ${available} kB\n`,
    '/proc/self/cgroup': `0::${group}\n`,
    '/sys/fs/cgroup/cgroup.controllers': 'cpu io memory pids\n',
    ...more,
  })
}

describe('the free memory', () => {
  it("is the machine's available memory when no group has a limit", () => {
    const read = aMachineWithGroups('/user/test', 8_000_000, {
      '/sys/fs/cgroup/user/test/memory.max': 'max\n',
      '/sys/fs/cgroup/user/memory.max': 'max\n',
    })
    expect(freeMemory(read)).toEqual<FreeMemory>({ bytes: 8_000_000 * 1024, limitedBy: 'the machine' })
  })

  it('is the room under the tightest limit, less the file cache the kernel can drop at once', () => {
    const groups = {
      '/sys/fs/cgroup/box/memory.max': `${16 * GiB}\n`,
      '/sys/fs/cgroup/box/memory.current': `${10 * GiB}\n`,
      '/sys/fs/cgroup/box/memory.stat': aMemoryStat(0),
      '/sys/fs/cgroup/box/run/memory.max': `${4 * GiB}\n`,
      '/sys/fs/cgroup/box/run/memory.current': `${3 * GiB}\n`,
      '/sys/fs/cgroup/box/run/memory.stat': aMemoryStat(1 * GiB),
    }
    // 4 GiB less (3 GiB used less 1 GiB of cache) is 2 GiB; the outer group has 6 GiB of room.
    expect(freeMemory(aMachineWithGroups('/box/run', 76_000_000, groups))).toEqual<FreeMemory>({
      bytes: 2 * GiB,
      limitedBy: '/sys/fs/cgroup/box/run',
    })
    // With the outer group nearly full, it is the outer one that sets the room.
    const outerFull = { ...groups, '/sys/fs/cgroup/box/memory.current': `${15 * GiB}\n` }
    expect(freeMemory(aMachineWithGroups('/box/run', 76_000_000, outerFull))).toEqual<FreeMemory>({
      bytes: 1 * GiB,
      limitedBy: '/sys/fs/cgroup/box',
    })
  })

  it('reads the limit of a process in the root group, written 0::/, as in a container', () => {
    const read = aMachineWithGroups('/', 76_000_000, {
      '/sys/fs/cgroup/memory.max': `${16 * GiB}\n`,
      '/sys/fs/cgroup/memory.current': `${5 * GiB}\n`,
      '/sys/fs/cgroup/memory.stat': aMemoryStat(1 * GiB),
    })
    expect(freeMemory(read)).toEqual<FreeMemory>({ bytes: 12 * GiB, limitedBy: '/sys/fs/cgroup' })
  })

  it('fails on a machine without control groups version 2, rather than start against a limit it cannot see', () => {
    const noVersion2 = 'This machine does not have control groups version 2 at /sys/fs/cgroup'
    const noControllers = aMachine({ '/proc/meminfo': 'MemAvailable: 1000 kB\n', '/proc/self/cgroup': '0::/\n' })
    expect(() => freeMemory(noControllers)).toThrow(noVersion2)
    const version1Only = aMachine({
      '/proc/meminfo': 'MemAvailable: 1000 kB\n',
      '/proc/self/cgroup': '12:memory:/box\n4:cpu:/box\n',
      '/sys/fs/cgroup/cgroup.controllers': 'memory\n',
    })
    expect(() => freeMemory(version1Only)).toThrow(noVersion2)
  })

  it('fails when /proc/meminfo has no MemAvailable, or a limited group has no memory.current', () => {
    expect(() => freeMemory(aMachine({ '/proc/meminfo': 'MemTotal: 1000 kB\n' }))).toThrow('/proc/meminfo names no MemAvailable')
    const noCurrent = aMachineWithGroups('/box', 76_000_000, {
      '/sys/fs/cgroup/box/memory.max': `${4 * GiB}\n`,
      '/sys/fs/cgroup/box/memory.stat': aMemoryStat(0),
    })
    expect(() => freeMemory(noCurrent)).toThrow('/sys/fs/cgroup/box has a memory limit but no memory.current or memory.stat')
  })
})

/** A world whose clock moves only when the wait sleeps, and whose free memory comes from a list. */
function aWaitingWorld(floor: number, frees: number[]) {
  let now = 0
  let reads = 0
  const said: string[] = []
  const world = {
    floor,
    free: (): FreeMemory => {
      const bytes = frees[Math.min(reads++, frees.length - 1)]
      if (bytes === undefined) throw new Error('This made-up world was given no free memory to read.')
      return { bytes, limitedBy: '/sys/fs/cgroup' }
    },
    sleep: async (ms: number) => {
      now += ms
    },
    now: () => now,
    say: (line: string) => {
      said.push(line)
    },
  }
  return { world, said, reads: () => reads }
}

describe('the wait for free memory', () => {
  // The floor of this made-up world, and not the real one.
  const FLOOR = 1_000 * MB

  it('says nothing and does not wait when the free memory is at the floor', async () => {
    const { world, said, reads } = aWaitingWorld(FLOOR, [FLOOR])
    expect(await waitUntilMemoryIsFree(world)).toEqual({ waitedMs: 0 })
    expect(said).toEqual([])
    expect(reads()).toBe(1)
  })

  it('waits below the floor, says why, says so again each minute, and says when it starts', async () => {
    // Below the floor for two whole minutes of reads and the one after them, then at the floor.
    const below = (2 * SAY_AGAIN_EVERY_MS) / LOOK_AGAIN_EVERY_MS + 1
    const { world, said } = aWaitingWorld(FLOOR, [...Array<number>(below).fill(FLOOR - 1), FLOOR])
    const waited = below * LOOK_AGAIN_EVERY_MS
    expect(await waitUntilMemoryIsFree(world)).toEqual({ waitedMs: waited })

    const pid = process.pid
    expect(said.map((line) => line.slice(0, line.indexOf(':')))).toEqual([
      `Test process ${pid} waits to start`,
      `Test process ${pid} is still waiting after ${SAY_AGAIN_EVERY_MS / 1000} s`,
      `Test process ${pid} is still waiting after ${(2 * SAY_AGAIN_EVERY_MS) / 1000} s`,
      `Test process ${pid} starts after waiting ${waited / 1000} s`,
    ])
    // Each line says how much is free, which limit set it, and the floor.
    expect(said[0]).toBe(
      `Test process ${pid} waits to start: 999 MB free (limited by /sys/fs/cgroup), and a test process that shares its files ` +
        `starts only at 1,000 MB or more. It reads the free memory again every ${LOOK_AGAIN_EVERY_MS / 1000} s.`,
    )
  })
})

/**
 * THE WAIT HOLDS BACK A NEW PROCESS'S FIRST FILE. When test files share processes, vitest.config.ts names
 * tests/a-file-in-a-shared-process-starts-clean.ts first among the setup files, and vitest starts no test
 * file until its setup files have finished. Here that setup file is loaded as it is before the first file
 * of a process, with the wait made up: it ends only when this case ends it.
 */
describe('the first file of a process that shares its files', () => {
  const THE_SETUP_FILE = './a-file-in-a-shared-process-starts-clean.ts'
  const THE_WAIT = './a-test-process-starts-only-while-memory-is-free.ts'
  /** Where the setup file writes down the process as it was before its first file. Unset, the next file is the first. */
  const records = process as unknown as { __moleOfficeBeforeTheFirstFile?: unknown }

  it('does not start until the wait for free memory has ended', async () => {
    // When this file itself runs in a shared process, the setup file has written this down already. It is put back below.
    const kept = Object.getOwnPropertyDescriptor(records, '__moleOfficeBeforeTheFirstFile')
    delete records.__moleOfficeBeforeTheFirstFile
    const asked: unknown[][] = []
    let endTheWait = (): void => {
      throw new Error('The setup file never asked for the wait.')
    }
    let reached = (): void => {}
    const waitReached = new Promise<'waiting'>((done) => {
      reached = () => done('waiting')
    })
    vi.doMock(THE_WAIT, () => ({
      waitUntilMemoryIsFree: (...args: unknown[]) => {
        asked.push(args)
        reached()
        return new Promise((done) => {
          endTheWait = () => done({ waitedMs: 0 })
        })
      },
    }))
    try {
      // A query of its own, so the setup file is run again even in a process that has loaded it.
      const setUp = import(/* @vite-ignore */ `${THE_SETUP_FILE}?the-first-file-of-a-new-process`)
      let finished = false
      void setUp.then(
        () => (finished = true),
        () => (finished = true),
      )
      expect(await Promise.race([waitReached, setUp.then(() => 'finished without waiting')])).toBe('waiting')
      // After the wait was asked for, only promises are left to settle, and they all settle before this.
      await new Promise((done) => setImmediate(done))
      expect(finished, 'the setup file finished while the wait had not ended').toBe(false)

      endTheWait()
      await setUp
      // It went on to write down the process as it was, which it does only before a first file.
      expect(records.__moleOfficeBeforeTheFirstFile).toBeDefined()
      // It waited once, and gave the wait nothing of its own: the real floor, on the real machine.
      expect(asked).toEqual([[]])
    } finally {
      vi.doUnmock(THE_WAIT)
      delete records.__moleOfficeBeforeTheFirstFile
      if (kept !== undefined) Object.defineProperty(records, '__moleOfficeBeforeTheFirstFile', kept)
    }
  })
})
