// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH GROUP STOP THAT MOVED INTO THE SYSTEM LAYER SIGNALS THE SAME GROUP AS BEFORE. Wave 13t, round W1, item 2, and
 * round W4, item 5.
 *
 * Five files signalled a process group with process.kill(-group, signal) themselves. Since round W1 four of them ask
 * the layer, src/config/systems/the-system.mjs, and since round W4 the fifth does too. The layer does exactly that on
 * Linux and the Mac
 * (tests/one-interface-per-system.test.ts, case 2). Each file keeps its own handling of ESRCH and EPERM, and none of
 * them changes which group it signals. Here process.kill is spied on, and each call site must hand it exactly
 * (-group, signal):
 *
 *   1. endGroup in src/worker/runtimes/os.ts, with SIGTERM and SIGKILL: ESRCH answers false, and EPERM is thrown back;
 *   2. the terminal holder, src/holder/index.mjs, run in this process with the pty library stood in: closing a terminal
 *      and stopping the holder each send SIGHUP to the terminal's group; ESRCH is taken as gone, and EPERM makes the
 *      close refuse;
 *   3. the memory limit's press, src/config/sandbox-memory-cap.mjs, with a stand-in pkexec that never exits: SIGTERM to
 *      its group, then signal 0 to that group until it has gone. The spy passes each call on to the real process.kill;
 *
 * Mutations, in the commit message that moved the call sites:
 *   - endGroup hands the layer -pgid: red, case 1;
 *   - the holder hands the layer -t.pid: red, case 2;
 *   - the press hands the layer -group for signal 0: red, case 3.
 */

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { pressTheSandboxCap } from '../src/config/sandbox-memory-cap.mjs'
import { askTheGroupToStop } from '../src/config/the-service-command.mjs'
import { askTheHolder } from '../src/config/the-terminal-holder.mjs'
import { aHolder } from '../src/holder/index.mjs'
import { endGroup } from '../src/worker/runtimes/os.ts'
import { freshDb, type TestDb } from './helpers.ts'


afterEach(() => {
  vi.restoreAllMocks()
})

const anError = (code: string) => Object.assign(new Error(`made-up ${code}`), { code })

describe('each group stop that moved into the system layer', () => {
  it('1: endGroup in the worker signals -pgid, answers ESRCH as false, and throws EPERM back', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    expect(endGroup(4321, 'SIGTERM', 'linux')).toBe(true)
    expect(endGroup(4321, 'SIGKILL', 'darwin')).toBe(true)
    expect(kill.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4321, 'SIGKILL'],
    ])
    kill.mockImplementation(() => {
      throw anError('ESRCH')
    })
    expect(endGroup(4321, 'SIGTERM', 'linux')).toBe(false)
    const eperm = anError('EPERM')
    kill.mockImplementation(() => {
      throw eperm
    })
    expect(() => endGroup(4321, 'SIGTERM', 'linux')).toThrow(eperm)
  })

  it('2: the terminal holder sends SIGHUP to the group of a terminal it closes, and of every terminal when it stops', async () => {
    const pty = (await import('node-pty')).default
    let nextPid = 987_650
    const ends: ((e: { exitCode: number; signal?: number }) => void)[] = []
    vi.spyOn(pty, 'spawn').mockImplementation(
      () =>
        ({
          pid: nextPid++,
          write: vi.fn(),
          resize: vi.fn(),
          onData: vi.fn(),
          onExit: vi.fn((ended: (e: { exitCode: number; signal?: number }) => void) => ends.push(ended)),
        }) as never,
    )
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const home = mkdtempSync(join(tmpdir(), 'each-group-stop-holder-'))
    const holder = aHolder({ database: join(home, 'office.db'), env: { HOME: home, XDG_CONFIG_HOME: join(home, 'c') } })
    let stopped = false
    try {
      expect(await holder.listen()).toBe('listening')
      const open = async (): Promise<string> => {
        const opened = (await askTheHolder(holder.socketPath, {
          op: 'open',
          command: '/made-up/shell',
          args: [],
          folder: home,
          project: 'made-up-project',
          cols: 80,
          rows: 24,
          env: {},
          keeping: false,
        })) as { ok: boolean; terminal: { id: string } }
        expect(opened.ok, JSON.stringify(opened)).toBe(true)
        return opened.terminal.id
      }
      const close = async (terminal: string) => ((await askTheHolder(holder.socketPath, { op: 'close', terminal })) as { ok: boolean }).ok

      expect(await close(await open())).toBe(true)
      expect(kill.mock.calls).toEqual([[-987_650, 'SIGHUP']])

      kill.mockImplementation(() => {
        throw anError('ESRCH')
      })
      expect(await close(await open()), 'a group that has gone is closed').toBe(true)

      const kept = await open()
      kill.mockImplementation(() => {
        throw anError('EPERM')
      })
      expect(await close(kept), 'a group that is not ours to signal is refused').toBe(false)

      kill.mockClear()
      kill.mockImplementation(() => true)
      const stopping = holder.stop()
      stopped = true
      expect(kill.mock.calls).toEqual([[-987_652, 'SIGHUP']])
      ends[2]!({ exitCode: 0 })
      expect((await stopping).stillRunning).toEqual([])
    } finally {
      if (!stopped) {
        for (const terminal of holder.terminals.values()) terminal.exit ??= { code: 0, signal: null }
        await holder.stop()
      }
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)

  it('3: the memory limit press sends SIGTERM, then signal 0, to the group of a pkexec that never answers', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'each-group-stop-cap-'))
    const pidFile = join(scratch, 'pid')
    const programs = { pkexec: join(scratch, 'pkexec'), systemctl: join(scratch, 'systemctl') }
    writeFileSync(
      programs.pkexec,
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))\nsetInterval(() => {}, 1000)\n`,
    )
    writeFileSync(programs.systemctl, `#!${process.execPath}\nprocess.stdout.write('infinity\\n')\n`)
    chmodSync(programs.pkexec, 0o755)
    chmodSync(programs.systemctl, 0o755)
    const realKill = process.kill.bind(process)
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => realKill(pid, signal))
    try {
      const said = await pressTheSandboxCap(true, { programs, platform: 'linux', waitMs: 2_000 })
      expect(said).toMatchObject({ outcome: 'no dialog' })
      const pid = Number(readFileSync(pidFile, 'utf8'))
      const toIt = kill.mock.calls.filter(([to]) => Math.abs(to) === pid)
      expect(toIt[0]).toEqual([-pid, 'SIGTERM'])
      expect(toIt.length).toBeGreaterThan(1)
      expect(toIt.slice(1)).toEqual(toIt.slice(1).map(() => [-pid, 0]))
    } finally {
      kill.mockRestore()
      rmSync(scratch, { recursive: true, force: true })
    }
  }, 30_000)


  it("6: the service command's ask sends (-group, 'SIGTERM') on Linux and the Mac, and refuses a group below 2", async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    await askTheGroupToStop(4321, 'linux')
    await askTheGroupToStop(4322, 'darwin')
    expect(kill.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4322, 'SIGTERM'],
    ])
    const gone = anError('ESRCH')
    kill.mockImplementation(() => {
      throw gone
    })
    await expect(askTheGroupToStop(4321, 'linux')).rejects.toBe(gone)
    kill.mockClear()
    for (const group of [0, 1, -5]) {
      await expect(askTheGroupToStop(group, 'linux')).rejects.toThrow(
        `Refusing to ask process group ${String(group)} to stop. That is init, or every process there is.`,
      )
    }
    for (const group of [Number.NaN, 1.5]) {
      await expect(askTheGroupToStop(group, 'darwin')).rejects.toThrow(
        `Refusing to ask process group ${String(group)} to stop. A process group is a whole number above 1.`,
      )
    }
    expect(kill).not.toHaveBeenCalled()
  })

})

describe("the server's group stop, moved into the layer in round W4", () => {
  // lib/resources.ts opens a database when it loads, so it is loaded after a throwaway one is named.
  let t: TestDb
  let res: typeof import('../src/server/lib/resources.ts')
  beforeAll(async () => {
    t = await freshDb()
    res = await import('../src/server/lib/resources.ts')
  }, 60_000)
  afterAll(() => {
    t.close()
  })

  it("5: killProcessGroup signals -pgid on Linux and through the Mac's probe, and throws ESRCH and EPERM back", () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    res.LINUX_PROBE.killProcessGroup(4321, 'SIGTERM')
    res.LINUX_PROBE.killProcessGroup(4321, 'SIGKILL')
    res.theProbeForThisPlatform('darwin').killProcessGroup(4322, 'SIGTERM')
    expect(kill.mock.calls).toEqual([
      [-4321, 'SIGTERM'],
      [-4321, 'SIGKILL'],
      [-4322, 'SIGTERM'],
    ])
    for (const code of ['ESRCH', 'EPERM']) {
      const thrown = anError(code)
      kill.mockImplementation(() => {
        throw thrown
      })
      expect(() => res.LINUX_PROBE.killProcessGroup(4321, 'SIGTERM')).toThrow(thrown)
    }
  })
})
