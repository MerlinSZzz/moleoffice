// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN MAC PATHS: THE LOCK FOLDERS, THE TERMINAL'S SPAWN-HELPER, START AT LOGIN AND THE
 * SHIPPED NODE. Wave 13t, round 20 (report R99y24eUFjNK, block b-6). Each is asked with the platform stood
 * in as darwin:
 *
 *   1. where the "Running on this machine" list looks for lock files: /tmp and /var/lock on Linux; /tmp
 *      and the user's own temporary folder on a Mac, which has no /var/lock;
 *   2. node-pty on a Mac starts every shell through prebuilds/darwin-<processor>/spawn-helper: the bundle
 *      copies it, and refuses in words when it is missing or not a program its owner may run. Agreed with
 *      wave 13u, whose file scripts/the-terminal-in-a-bundle.mjs is, through the secretary (message 9aZCwfsVTCcX);
 *   3. start at login: on a Mac the Terminals page's systemd press names the menu-bar item and System
 *      Settings instead, and writes nothing. Also wave 13u's file, src/config/start-at-login.mjs, agreed
 *      the same way;
 *   4. the shipped Node's archive for darwin-arm64;
 *   5. the terminal holder's socket: a Unix socket's path may be 103 bytes on a Mac and 107 on Linux. On a
 *      Mac a path too long in the data folder moves to ~/.mole-office/terminals, then to $TMPDIR, which
 *      macOS may clean and which is said once in words, and a path too long in all three is refused in
 *      words. Linux's path is unchanged. Agreed with wave 13u (its messages Ux__34vHQle1, round 21, and
 *      rQhMphIycPVa, round 23).
 *
 * MUTATIONS, each red here and green again when put back:
 *   - theDefaultLockFolders gives Linux's list on a Mac: red, case 1;
 *   - thePtySpawnHelper gives null on a Mac: red, case 2;
 *   - whatThePtyLacks leaves out the check that the spawn-helper may run: red, case 2 (not a program);
 *   - theSystemdWayIsLinuxOnly says the Linux sentence on a Mac too: red, case 3;
 *   - theLongestSocketPathBytes gives Linux's 107 on a Mac: red, case 5.
 *   - theTerminalHolderSocket never moves to TMPDIR on a Mac: red, case 5.
 *   - theTerminalHolderSocket skips ~/.mole-office/terminals and goes straight to TMPDIR: red, case 5.
 *   - the TMPDIR sentence is not said, or is said on every call: red, case 5.
 */

import { chmodSync, cpSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { thePtySpawnHelper, whatThePtyLacks } from '../scripts/the-terminal-in-a-bundle.mjs'
import { theNodeArchive } from '../scripts/the-shipped-node.mjs'
import { theDefaultLockFolders, THE_SHIPPED_NODE_VERSION } from '../src/config/settings.mjs'
import { readStartAtLogin, turnStartAtLoginOn } from '../src/config/start-at-login.mjs'
import { forgetTheTemporaryPlaceWasSaid, theLongestSocketPathBytes, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { buildTheFirstOfficeInAHook, freshDb, TEST_DATABASE_PREFIX } from './helpers.ts'
import type { BorrowedByTheMac, DarwinProcessReader } from '../src/server/lib/darwin-probe.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const REPO = fileURLToPath(new URL('..', import.meta.url))
const PTY = join(REPO, 'node_modules', 'node-pty')
const scratch = mkdtempSync(`${TEST_DATABASE_PREFIX}on-a-mac-`)

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe("the office's own Mac paths", () => {
  it('the installed window can name its owner, but a proxy, another app or an unverified connection cannot', async () => {
    const db = await freshDb()
    const { DarwinProbe } = await import('../src/server/lib/darwin-probe.ts')
    try {
      const contents = '/Applications/Mole Office.app/Contents'
      const helper = join(contents, 'Frameworks', 'Mole Office Helper.app', 'Contents', 'MacOS', 'Mole Office Helper')
      const main = join(contents, 'MacOS', 'Mole Office')
      const uid = process.getuid!()
      const socket = `p42\nu${uid}\nf23\ntIPv4\nn127.0.0.1:60001->127.0.0.1:8787\n`
      let listed = socket
      let executable = helper
      let parentExecutable = main
      let parent: number | null = 41
      let confirmation = true
      const reader = {
        commands: {
          lsof: (args: readonly string[]) => ({ ran: true, status: 0, stdout: args.includes('-p') && !confirmation ? '' : listed, stderr: '', command: 'lsof' }),
        },
        executableOf: (pid: number) => pid === 42 ? executable : parentExecutable,
        parentOf: () => parent,
      } as unknown as DarwinProcessReader
      const shared = {} as BorrowedByTheMac
      const install = { from: 'bundle' as const, root: join(contents, 'Resources', 'office') }
      const probe = new DarwinProbe(shared, reader, install)
      const sender = () => probe.senderOfAConnection!({ address: '::ffff:127.0.0.1', port: 60001 }, { address: '127.0.0.1', port: 8787 })
      expect(sender()).toEqual({ uid, pid: 42, inAnotherContainer: false })
      // Matching a process name or uid is insufficient: Docker owns container connections on macOS.
      executable = '/Applications/Docker.app/Contents/MacOS/com.docker.backend'
      expect(sender()).toBeNull()
      executable = helper
      parentExecutable = '/usr/bin/false'
      expect(sender()).toBeNull()
      parentExecutable = main
      parent = null
      expect(sender()).toBeNull()
      parent = 41
      listed = socket.replace(`u${uid}`, `u${uid + 1}`)
      expect(sender()).toBeNull()
      listed = socket.replace(`u${uid}\n`, '')
      expect(sender()).toBeNull()
      listed = socket.replace(':8787', ':8788')
      expect(sender()).toBeNull()
      listed = socket + socket.replace('p42', 'p43')
      expect(sender()).toBeNull()
      listed = socket
      confirmation = false
      expect(sender()).toBeNull()
      confirmation = true
      expect(sender()).toEqual({ uid, pid: 42, inAnotherContainer: false })
      expect(probe.senderOfAConnection!({ address: '192.0.2.77', port: 60001 }, { address: '127.0.0.1', port: 8787 })).toBeNull()
      expect(new DarwinProbe(shared, reader, { from: 'checkout', root: install.root }).senderOfAConnection).toBeUndefined()
      expect(new DarwinProbe(shared, reader, { from: 'bundle', root: '/tmp/office' }).senderOfAConnection).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('1. the lock folders: /tmp and /var/lock on Linux, /tmp and the user’s temporary folder on a Mac', () => {
    expect(theDefaultLockFolders('linux', '/tmp')).toEqual(['/tmp', '/var/lock'])
    expect(theDefaultLockFolders('darwin', '/var/folders/ab/cd/T')).toEqual(['/tmp', '/var/folders/ab/cd/T'])
    expect(theDefaultLockFolders('darwin', '/tmp')).toEqual(['/tmp'])
  })

  it('2. on a Mac the bundle needs node-pty’s spawn-helper, and says so when it is missing or cannot run', () => {
    expect(thePtySpawnHelper('linux', 'x64')).toBeNull()
    expect(thePtySpawnHelper('darwin', 'arm64')).toBe(join('prebuilds', 'darwin-arm64', 'spawn-helper'))
    // This checkout's node-pty has the Mac's files, as npm installs them on every system.
    expect(whatThePtyLacks(PTY, 'darwin', 'arm64')).toEqual([])
    expect(whatThePtyLacks(PTY, 'linux', 'x64')).toEqual([])

    const copy = join(scratch, 'node-pty')
    cpSync(join(PTY, 'prebuilds', 'darwin-arm64'), join(copy, 'prebuilds', 'darwin-arm64'), { recursive: true })
    expect(whatThePtyLacks(copy, 'darwin', 'arm64')).toEqual([])
    chmodSync(join(copy, 'prebuilds', 'darwin-arm64', 'spawn-helper'), 0o644)
    expect(whatThePtyLacks(copy, 'darwin', 'arm64')).toEqual([
      "node-pty's prebuilds/darwin-arm64/spawn-helper is not marked as a program its owner may run, so no terminal could start. Reinstall it with npm ci.",
    ])
    rmSync(join(copy, 'prebuilds', 'darwin-arm64', 'spawn-helper'))
    expect(whatThePtyLacks(copy, 'darwin', 'arm64')).toEqual(['node-pty has no prebuilds/darwin-arm64/spawn-helper, the program it starts every shell through on a Mac.'])
  })

  it('3. on a Mac the systemd press names the menu-bar item and System Settings, and writes nothing', () => {
    const home = join(scratch, 'home')
    const office = { command: '/c', args: [] } as never
    const seen = readStartAtLogin({ home, office, platform: 'darwin', user: 'sam' })
    expect(seen.systemd).toBe('not linux')
    expect(seen.says).toContain('tick "Open at login" in the Mole Office menu in the menu bar')
    expect(seen.says).toContain('System Settings, under General, Login Items')
    const pressed = turnStartAtLoginOn({ home, office, platform: 'darwin' })
    expect(pressed).toMatchObject({ ok: false, code: 'startAtLoginNotLinux' })
    expect('says' in pressed ? pressed.says : '').toContain('Nothing was written.')
    // Any other system keeps the plain sentence.
    expect(readStartAtLogin({ home, office, platform: 'freebsd', user: 'sam' }).says).toBe('Starting at login is built for Linux only, and this computer runs freebsd.')
  })

  it('4. the shipped Node for a Mac is the darwin-arm64 archive', () => {
    expect(theNodeArchive('darwin', 'arm64')).toBe(`node-v${THE_SHIPPED_NODE_VERSION}-darwin-arm64`)
    expect(theNodeArchive('linux', 'x64')).toBe(`node-v${THE_SHIPPED_NODE_VERSION}-linux-x64`)
  })

  it('5. the terminal holder’s socket fits a Mac’s 103 bytes, or is refused in words; Linux’s is unchanged', () => {
    expect(theLongestSocketPathBytes('darwin')).toBe(103)
    expect(theLongestSocketPathBytes('linux')).toBe(107)
    const database = '/data/office.db'
    const bytes = (path: string): number => Buffer.byteLength(path)

    // A usual home: the socket stays in the data folder.
    const usual = theTerminalHolderSocket(database, { HOME: '/Users/sam', TMPDIR: '/var/folders/ab/cd/T/' }, 'darwin')
    expect(usual).toMatch(/^\/Users\/sam\/Library\/Application Support\/mole-office\/terminals\/[0-9a-f]{16}\.sock$/)
    expect(bytes(usual)).toBeLessThanOrEqual(103)

    // A home whose data-folder path is 126 bytes on a Mac and 106 on Linux: the socket moves to
    // ~/.mole-office/terminals, which macOS does not clean, and nothing is said.
    const home = `/Users/${'s'.repeat(47)}`
    const name = usual.slice(usual.lastIndexOf('/') + 1)
    const said: string[] = []
    const say = (words: string) => void said.push(words)
    forgetTheTemporaryPlaceWasSaid()
    const onLinux = theTerminalHolderSocket(database, { HOME: home, TMPDIR: '/var/folders/ab/cd/T/' }, 'linux', say)
    expect(onLinux).toBe(join(home, '.config', 'mole-office', 'terminals', name))
    expect(bytes(onLinux)).toBe(106)
    const inHome = theTerminalHolderSocket(database, { HOME: home, TMPDIR: '/var/folders/ab/cd/T/' }, 'darwin', say)
    expect(inHome).toBe(join(home, '.mole-office', 'terminals', name))
    expect(bytes(inHome)).toBe(99)
    expect(said).toEqual([])

    // A home too long for that as well: the socket moves to TMPDIR, and that is said once, in words.
    const longer = `/Users/${'s'.repeat(60)}`
    const moved = theTerminalHolderSocket(database, { HOME: longer, TMPDIR: '/var/folders/ab/cd/T/' }, 'darwin', say)
    expect(moved).toBe(join('/var/folders/ab/cd/T', 'mole-office-terminals', name))
    expect(bytes(moved)).toBeLessThanOrEqual(103)
    expect(said).toHaveLength(1)
    expect(said[0]).toContain(`The terminal holder's socket is ${moved}, in TMPDIR`)
    expect(said[0]).toContain('macOS may remove files in TMPDIR that have not been used for a while, even while the holder runs')
    theTerminalHolderSocket(database, { HOME: longer, TMPDIR: '/var/folders/ab/cd/T/' }, 'darwin', say)
    expect(said, 'the sentence is said once per process, not on every call').toHaveLength(1)
    forgetTheTemporaryPlaceWasSaid()

    // None fits, or there is no TMPDIR or HOME: refused in words naming each place, and nothing is guessed.
    expect(() => theTerminalHolderSocket(database, { HOME: longer, TMPDIR: `/var/${'t'.repeat(90)}` }, 'darwin', say)).toThrow(
      /is 139 bytes long, and on a Mac a Unix socket's path may be at most 103\. The place in HOME would be .*, which is 112 bytes long\. The place in TMPDIR would be .* None fits\. Nothing was started\./,
    )
    expect(() => theTerminalHolderSocket(database, { HOME: longer }, 'darwin', say)).toThrow(/TMPDIR is not set, so there is no shorter folder to use\. None fits\. Nothing was started\./)
  })
})
