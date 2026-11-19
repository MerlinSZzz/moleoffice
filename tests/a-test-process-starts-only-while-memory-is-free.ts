// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST PROCESS THAT SHARES ITS FILES STARTS ONLY WHILE ENOUGH MEMORY IS FREE.
 *
 * When MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS is on, one process runs file after file. It is retired
 * between files once it holds the limit in tests/a-shared-test-process-is-retired-at-a-size.ts, but
 * inside a file it can grow past that limit. So before a new process takes its first file, it waits
 * until the machine has `FREE_MEMORY_FLOOR_BYTES` free. While it waits, it says so on its standard
 * error, which vitest writes to the run's own log. Nothing here stops a process that is running.
 *
 * The wait is in the process itself, in tests/a-file-in-a-shared-process-starts-clean.ts, and not in
 * the pool. vitest gives a pool's start 90 seconds and then fails the file. A process waiting in a
 * setup file has no such limit.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * THE FLOOR: 2,700 MB. With the limit then at 2,000 MB per process and two processes, the largest process
 * measured in wave 13n round H reached 2,583, 2,683 and 2,577 MB in its three runs. 2,700 MB is the
 * largest of those, rounded up, so a new process starts only when there is room for it to reach that
 * size. The floor does not keep room for the processes already running to grow, and it does not count
 * what a browser or a server that a test starts may take.
 */
export const FREE_MEMORY_FLOOR_BYTES = 2_700 * 1024 * 1024

/** How often a waiting process reads the free memory again. */
export const LOOK_AGAIN_EVERY_MS = 5_000

/** How often a waiting process says again that it is still waiting. */
export const SAY_AGAIN_EVERY_MS = 60_000

/** What the free memory is, and which limit set it. */
export interface FreeMemory {
  bytes: number
  /** `the machine`, or the control group folder whose limit is the tightest. */
  limitedBy: string
}

/** A file's text, or null when the file is not there. */
export type ReadAFile = (path: string) => string | null

function readIfThere(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** One `name: number` line of a /proc or cgroup file, as a number. */
function aNumberIn(text: string, name: string, file: string): number {
  const found = new RegExp(`^${name}:?\\s+(\\d+)`, 'm').exec(text)
  if (found === null) throw new Error(`${file} names no ${name}, so the free memory for a test process cannot be read.`)
  return Number(found[1])
}

/**
 * THE MEMORY A NEW TEST PROCESS COULD USE: the smaller of the machine's available memory and the room
 * left under each control group limit this process is in.
 *
 * A container sees the whole machine's memory in /proc/meminfo, so that alone is not enough: this
 * sandbox's /proc/meminfo says 76 GB are available under a limit of 16 GiB. The room under a control
 * group limit is the limit less what the group uses, where what it uses does not count the file cache
 * the kernel can drop at once (`inactive_file`). Only control groups version 2 are read. On a machine
 * with version 1 this fails, rather than start processes against a limit it cannot see.
 */
export function freeMemory(read: ReadAFile = readIfThere): FreeMemory {
  const meminfo = read('/proc/meminfo')
  if (meminfo === null) throw new Error('This machine has no /proc/meminfo, so the free memory for a test process cannot be read.')
  let free: FreeMemory = { bytes: aNumberIn(meminfo, 'MemAvailable', '/proc/meminfo') * 1024, limitedBy: 'the machine' }

  const groups = read('/proc/self/cgroup')
  const line = groups?.split('\n').find((one) => one.startsWith('0::'))
  if (groups === null || line === undefined || read('/sys/fs/cgroup/cgroup.controllers') === null) {
    throw new Error(
      'This machine does not have control groups version 2 at /sys/fs/cgroup, so the memory limit a test process runs under cannot be read.',
    )
  }
  // `resolve` drops the slash that `join` keeps when the group is the root one, written `0::/`.
  let folder = resolve(join('/sys/fs/cgroup', line.slice('0::'.length)))
  for (;;) {
    const max = read(join(folder, 'memory.max'))?.trim()
    if (max !== undefined && max !== 'max') {
      const current = read(join(folder, 'memory.current'))
      const stat = read(join(folder, 'memory.stat'))
      if (current === null || stat === null) {
        throw new Error(`${folder} has a memory limit but no memory.current or memory.stat, so the free memory for a test process cannot be read.`)
      }
      const used = Number(current.trim()) - aNumberIn(stat, 'inactive_file', join(folder, 'memory.stat'))
      const room = Number(max) - used
      if (room < free.bytes) free = { bytes: room, limitedBy: folder }
    }
    if (folder === '/sys/fs/cgroup') break
    const up = dirname(folder)
    if (up === folder) throw new Error(`The walk up from ${line} did not reach /sys/fs/cgroup, so the memory limits above a test process cannot be read.`)
    folder = up
  }
  return free
}

const MB = 1024 * 1024
const inMB = (bytes: number): string => `${Math.floor(bytes / MB).toLocaleString('en-GB')} MB`

/** What the wait needs from the world, so a test can give it its own. */
export interface WaitingWorld {
  floor: number
  free: () => FreeMemory
  sleep: (ms: number) => Promise<void>
  now: () => number
  say: (line: string) => void
}

const THE_REAL_WORLD: WaitingWorld = {
  floor: FREE_MEMORY_FLOOR_BYTES,
  free: () => freeMemory(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  now: () => Date.now(),
  say: (line) => {
    process.stderr.write(`${line}\n`)
  },
}

/**
 * WAIT UNTIL THE FREE MEMORY IS AT THE FLOOR OR ABOVE IT. Says nothing when there is room at once. When
 * there is not, it says so, says so again each minute, and says when it goes on. It has no limit of its
 * own: a run whose memory never comes free waits, and its log says why each minute.
 */
export async function waitUntilMemoryIsFree(given: Partial<WaitingWorld> = {}): Promise<{ waitedMs: number }> {
  const world = { ...THE_REAL_WORLD, ...given }
  const started = world.now()
  let saidAt: number | null = null
  for (;;) {
    const free = world.free()
    const why = `${inMB(free.bytes)} free (limited by ${free.limitedBy}), and a test process that shares its files starts only at ${inMB(world.floor)} or more`
    if (free.bytes >= world.floor) {
      const waitedMs = world.now() - started
      if (saidAt !== null) world.say(`Test process ${process.pid} starts after waiting ${Math.round(waitedMs / 1000)} s: ${why}.`)
      return { waitedMs }
    }
    if (saidAt === null) {
      world.say(`Test process ${process.pid} waits to start: ${why}. It reads the free memory again every ${LOOK_AGAIN_EVERY_MS / 1000} s.`)
      saidAt = world.now()
    } else if (world.now() - saidAt >= SAY_AGAIN_EVERY_MS) {
      world.say(`Test process ${process.pid} is still waiting after ${Math.round((world.now() - started) / 1000)} s: ${why}.`)
      saidAt = world.now()
    }
    await world.sleep(LOOK_AGAIN_EVERY_MS)
  }
}
