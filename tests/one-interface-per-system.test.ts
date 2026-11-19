// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE INTERFACE PER SYSTEM, AND ITS FIRST THREE PIECES. Wave 13t, round W1, item 2.
 *
 * There is one interface per system, with Windows as a line of its own.
 * src/config/systems/the-system.mjs is that interface. Its first three pieces are the reader of processes, the signal
 * to a process group, and the address the terminal holder listens on. This file checks:
 *
 *   1. Linux, the Mac and Windows each get the three pieces, and each says which system it is for;
 *   2. on Linux and the Mac a group's signal is exactly process.kill(-group, signal), signal 0 included, and what
 *      process.kill throws is thrown back as it is, so each caller keeps its own ESRCH and EPERM;
 *   3. on Windows a group's signal never does nothing: a signal no Job Object can carry is refused in words, before
 *      anything is run and without process.kill;
 *   4. the holder's address is the socket file in its folder on Linux and the Mac, and a named pipe on Windows, from
 *      the same name, and theTerminalHolderSocket gives that pipe on Windows;
 *   5. theProcessReaderFor('win32') is the Windows reader;
 *   6. the system this process runs on reads processes with the reader the rest of the program reads them with, so a
 *      reading the Windows reader keeps of this process is made once for the whole program (round W10, item 2).
 *
 * Nothing here runs on Windows, and nothing here proves anything about Windows: the Windows pieces are read on Linux.
 * tests/the-windows-side-of-the-system-layer.test.ts checks them with stand-ins for PowerShell.
 *
 * Mutations, in the commit message that added this file:
 *   - the layer signals the positive pid: red, case 2;
 *   - the layer catches what process.kill throws: red, case 2;
 *   - the Windows layer sends nothing for SIGTERM and returns: red, case 3;
 *   - the Windows holder address is a .sock file: red, case 4.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { theProcessReader, theProcessReaderFor } from '../src/config/process-reader.mjs'
import { theSystemFor, thisSystem } from '../src/config/systems/the-system.mjs'
import { WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE } from '../src/config/systems/windows-groups.mjs'
import { theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('one interface per system', () => {
  it('1: gives Linux, the Mac and Windows each a reader of processes, a group signal and a holder address', () => {
    for (const platform of ['linux', 'darwin', 'win32']) {
      const system = theSystemFor(platform)
      expect(system.platform).toBe(platform)
      expect(system.processes.platform).toBe(platform)
      expect(typeof system.groups.signal).toBe('function')
      expect(typeof system.holderAddress).toBe('function')
    }
    expect(thisSystem().platform).toBe(process.platform)
  })

  it('2: on Linux and the Mac signals a group exactly as process.kill(-group, signal), and throws back what it throws', () => {
    for (const platform of ['linux', 'darwin']) {
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
      const { groups } = theSystemFor(platform)
      for (const signal of ['SIGTERM', 'SIGKILL', 'SIGHUP', 0] as const) groups.signal(4321, signal)
      expect(kill.mock.calls, platform).toEqual([
        [-4321, 'SIGTERM'],
        [-4321, 'SIGKILL'],
        [-4321, 'SIGHUP'],
        [-4321, 0],
      ])
      for (const code of ['ESRCH', 'EPERM']) {
        const thrown = Object.assign(new Error(`kill ${code}`), { code })
        kill.mockImplementation(() => {
          throw thrown
        })
        let caught: unknown = null
        try {
          groups.signal(4321, 0)
        } catch (err) {
          caught = err
        }
        expect(caught, `${platform}, ${code}`).toBe(thrown)
      }
      kill.mockRestore()
    }
  })

  it('3: on Windows refuses in words a signal no Job Object can carry, and runs nothing', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const { groups } = theSystemFor('win32')
    for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT'] as const) {
      expect(() => groups.signal(4321, signal), signal).toThrow(WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE)
    }
    expect(kill).not.toHaveBeenCalled()
  })

  it('4: puts the holder at the socket file in its folder on Linux and the Mac, and at a named pipe on Windows', () => {
    const name = '0123456789abcdef'
    expect(theSystemFor('linux').holderAddress(name, '/srv/sam/.config/mole-office/terminals')).toBe(
      '/srv/sam/.config/mole-office/terminals/0123456789abcdef.sock',
    )
    expect(theSystemFor('darwin').holderAddress(name, '/srv/sam/.mole-office/terminals')).toBe(
      '/srv/sam/.mole-office/terminals/0123456789abcdef.sock',
    )
    expect(theSystemFor('win32').holderAddress(name, 'C:\\Users\\sam\\AppData\\Roaming\\mole-office\\terminals')).toBe(
      '\\\\.\\pipe\\mole-office-terminals-0123456789abcdef',
    )

    const database = '/srv/an-office/office.db'
    const onLinux = theTerminalHolderSocket(database, { HOME: '/srv/sam' }, 'linux')
    expect(onLinux).toMatch(/^\/srv\/sam\/\.config\/mole-office\/terminals\/[0-9a-f]{16}\.sock$/)
    const hash = /([0-9a-f]{16})\.sock$/.exec(onLinux)![1]!
    expect(theTerminalHolderSocket(database, { APPDATA: 'C:\\Users\\sam\\AppData\\Roaming' }, 'win32')).toBe(
      `\\\\.\\pipe\\mole-office-terminals-${hash}`,
    )
  })

  it('5: reads processes on Windows with the Windows reader', () => {
    expect(theProcessReaderFor('win32').platform).toBe('win32')
    expect(theProcessReaderFor('darwin').platform).toBe('darwin')
    expect(theProcessReaderFor('linux').platform).toBe('linux')
  })

  it("6: reads this process's own system with the program's one reader", () => {
    expect(theSystemFor(process.platform).processes).toBe(theProcessReader())
    expect(thisSystem().processes).toBe(theProcessReader())
  })
})
