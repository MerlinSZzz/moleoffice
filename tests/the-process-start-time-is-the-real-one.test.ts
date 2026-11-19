// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A PROCESS STARTED, READ FROM THE THING THAT KNOWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Until 3 September 2026 `LinuxProbe.processById` read the modification time of the `/proc/<pid>`
 * directory and its comment said that was the moment the process started. It is not. The GROUND
 * verifier measured four processes at once and got errors of 1 second, 48 seconds, 7 minutes and
 * 39.6 hours: a supervisor that had been up since the previous morning read as three minutes old,
 * and three unrelated processes read as having started in the same second. Problem `iyfCrVB7iFkW`.
 *
 * The number matters because it is the only thing that tells a registered process from a different
 * program that has since been given the same pid. Everything that decides whether a row is alive,
 * whether a port has changed hands, and whether a process group may be signalled reads it.
 *
 * ---------------------------------------------------------------------------------------
 * THE REAL READING, AND WHAT IT IS CHECKED AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Field 22 of `/proc/<pid>/stat` is the start time in clock ticks since the machine booted;
 * `btime` in `/proc/stat` says when that was; `getconf CLK_TCK` says how long a tick is. The sum is
 * what `ps -o lstart=` computes, so `ps` is what the first test here compares against — on every
 * process this machine will let it read, not on a sample chosen by the test.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ROWS THAT WERE ALREADY WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Every ledger row written before the fix holds the old reading in `os_started_at`. Comparing those
 * against the corrected reading would report every registered process on this machine as a recycled
 * pid — which is the sentence Mole Office uses for something it must not touch. So a row that does
 * not match the real start time is compared once more against the old reading, and matching that is
 * not a guess: it is the same process, described by the method that wrote the row. The last three
 * tests are about that, and the last one is about the check still biting on a pid that really has
 * come round again.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync, spawn } from 'node:child_process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

let t: TestDb
let res: ResourcesLib

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
}, 60_000)

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
})

afterAll(() => {
  t.close()
})

/** One of our own stamps as milliseconds. `ps` writes its own format, so both are parsed here. */
function ms(stamp: string): number {
  return new Date(stamp.replace(' ', 'T')).getTime()
}

describe('the start time this product reads is the one the machine reports', () => {
  /**
   * THE MEASUREMENT, AGAINST `ps`.
   *
   * `ps -o lstart=` computes the same sum from the same two files, so agreement is real evidence
   * rather than two readings of one cache. A second's tolerance is for the rounding: `ps` prints
   * whole seconds and the tick arithmetic produces fractions.
   *
   * IT STARTS THREE PROCESSES OF ITS OWN, AND EACH ONE MUST BE READ AND AGREE WITH `ps`. A test
   * that read none would pass silently, which is the failure the control in CLAUDE.md is about,
   * so one of its own processes that is not read is a failure here. They are sleepers started 1.6
   * seconds apart, so the first and the last started more than three seconds apart. No single
   * time is within a second of both, so a reading that gave every process the same time cannot
   * pass. That is how the old reading failed: three unrelated processes read as having started in
   * the same second.
   *
   * IT ALSO READS EVERY OTHER PROCESS IT CAN, and every one it reads must agree with `ps`. It
   * does not demand a number of them. Until 1 October 2026 it demanded more than ten, and that
   * number measured how busy the machine was, not the reading: a quiet sandbox container shows
   * about nine processes, and the test failed there with nothing wrong (problem `GPvbzAerkTiU`).
   */
  it('agrees with ps about every process on this machine it can read', async () => {
    const probe = res.LINUX_PROBE

    // THE TEST'S OWN PROCESSES. Each sleeper is started in its own process group, so its pid is
    // its group id, and the finally below stops each group by the pid taken from the start.
    const own: number[] = []
    try {
      for (let n = 0; n < 3; n += 1) {
        if (n > 0) await new Promise((done) => setTimeout(done, 1600))
        const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
        child.unref()
        expect(child.pid, 'a sleeper did not start, so it cannot be measured').toBeDefined()
        own.push(child.pid as number)
      }

      // ONE `ps`, NOT ONE PER PID. Reading the whole table once is a single subprocess; asking about
      // four hundred pids one at a time was four hundred, and under a loaded suite that ran past the
      // test timeout. The reading is the same either way.
      const table = execFileSync('ps', ['-eo', 'pid=,lstart='], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))

      const disagreed: string[] = []
      const ownRead = new Set<number>()
      for (const line of table) {
        if (line === null) continue
        const pid = Number(line[1])
        const fromPs = (line[2] ?? '').trim()
        if (fromPs === '') continue
        let mine: OsProcess | null
        try {
          mine = probe.processById(pid)
        } catch {
          continue
        }
        if (mine === null) continue
        if (own.includes(pid)) ownRead.add(pid)
        const gap = Math.abs(new Date(fromPs).getTime() - ms(mine.startedAt))
        if (gap > 1000) disagreed.push(`pid ${pid}: ps says ${fromPs}, this reads ${mine.startedAt}`)
      }

      expect(
        own.filter((pid) => !ownRead.has(pid)),
        'these processes the test started itself were not read, so the reading was not measured on them',
      ).toEqual([])
      expect(disagreed).toEqual([])
    } finally {
      for (const pid of own) {
        try {
          process.kill(-pid, 'SIGTERM')
        } catch (err) {
          // ESRCH: the group is already gone, which is what this step wants. Anything else is loud.
          if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
        }
      }
    }
  }, 30_000)

  /**
   * The two readings are kept apart and both are reported. The old one is still read, because it is
   * the only way to recognise a row written before the fix, and a reader has to be able to see that
   * it is a different number from the start time.
   */
  it('reports the /proc directory time separately, and never as the start time', () => {
    const me = res.LINUX_PROBE.processById(process.pid)
    expect(me).not.toBeNull()
    expect(me?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(me?.directoryChangedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    const fromPs = execFileSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8' }).trim()
    expect(Math.abs(new Date(fromPs).getTime() - ms(me?.startedAt ?? ''))).toBeLessThanOrEqual(1000)
  })
})

describe('a row written before the fix is not read as a recycled pid', () => {
  /** The four numbers below are the verifier's own measurement of the supervisor that read 39.6 hours young. */
  const REAL_START = '2026-09-02 07:39:20'
  const THE_OLD_READING = '2026-09-03 23:17:56'

  const live = (startedAt: string, directoryChangedAt: string | null): OsProcess => ({
    pid: 2969880,
    pgid: 2969880,
    ppid: 1,
    command: 'npm run dev:server',
    startedAt,
    directoryChangedAt,
  })

  it('says a row holding the real start time is about this process', () => {
    const answer = res.theRowIsAboutThisProcess(REAL_START, live(REAL_START, THE_OLD_READING))
    expect(answer.same).toBe(true)
    expect(answer.same === true && answer.stampedTheOldWay).toBe(false)
  })

  it('recognises a row holding the reading used before 3 September 2026, and says so in words', () => {
    const answer = res.theRowIsAboutThisProcess(THE_OLD_READING, live(REAL_START, THE_OLD_READING))
    expect(answer.same).toBe(true)
    expect(answer.same === true && answer.stampedTheOldWay).toBe(true)
    const says = answer.same === true && answer.stampedTheOldWay ? answer.says : ''
    expect(says).toContain(THE_OLD_READING)
    expect(says).toContain(REAL_START)
  })

  it('still says a pid that really has come round again is a different process', () => {
    const answer = res.theRowIsAboutThisProcess('2026-08-01 10:00:00', live(REAL_START, THE_OLD_READING))
    expect(answer.same).toBe(false)
  })

  it('says nothing was recorded rather than yes or no, when the row carries no start time', () => {
    expect(res.theRowIsAboutThisProcess(null, live(REAL_START, THE_OLD_READING)).same).toBe('nothing recorded')
  })

  /**
   * THE ONE THE FIX IS FOR. A row is registered while the machine is being read the old way, the
   * reading is then corrected, and the row must still be about the process it is about — and must
   * come back re-stamped, so the correction happens once rather than on every read.
   */
  it('keeps a registered row alive across the correction, and re-stamps it with the real time', () => {
    const sessionId = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the session that started the supervisor',
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    }).id

    const machine = (startedAt: string, directoryChangedAt: string | null): OsProbe => ({
      platform: 'fake',
      processById: (pid: number) => (pid === 2969880 ? live(startedAt, directoryChangedAt) : null),
      processesInGroup: () => [live(startedAt, directoryChangedAt)],
      listeningPorts: () => [],
      gpu: () => ({ available: true, processes: [] }),
      containers: () => ({ available: true, containers: [] }),
      locks: () => ({ files: [], unreadable: [] }),
      ownProcessGroup: () => 999_999,
      killProcessGroup: () => {
        throw new Error('this test never signals anything')
      },
      stopContainer: () => {
        throw new Error('this test never stops anything')
      },
    })

    // Registered while the product still read the /proc directory's modification time.
    res.useOsProbe(machine(THE_OLD_READING, null))
    const row = res.registerResource({
      workspaceId: 'default',
      sessionRecordId: sessionId,
      type: 'process',
      key: '2969880',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    })
    expect(row.osStartedAt).toBe(THE_OLD_READING)

    // The reading is corrected. The same process is now described by both numbers.
    res.useOsProbe(machine(REAL_START, THE_OLD_READING))
    const [after] = res.listResources({ workspaceId: 'default' })
    expect(after?.liveness.state).toBe('alive')
    expect(after?.liveness.state === 'alive' ? after.liveness.detail : '').toContain('re-stamped')

    // Read again: the row now holds the real start time and nothing says anything about the old one.
    const [again] = res.listResources({ workspaceId: 'default' })
    expect(again?.osStartedAt).toBe(REAL_START)
    expect(again?.liveness.state === 'alive' ? again.liveness.detail : '').not.toContain('re-stamped')
  })
})
