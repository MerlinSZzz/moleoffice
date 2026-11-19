// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The one holder rule on a made-up /proc: readable descriptors, lock rows, and what is set aside. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, linkSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aTestDatabaseFolder } from './a-test-folder.ts'

/**
 * A FOLDER LISTED IN ORDER, AND A DESCRIPTOR THAT GOES AFTER THE LIST. For a fd folder a case names
 * here, the listing comes back in number order, as the real /proc gives it, and the case's `then` runs
 * after the real listing and before the holder rule reads any entry. A `then` that removes an entry
 * makes the readlink meet a real ENOENT. Every other listing is the real one, untouched.
 */
const { planted } = vi.hoisted(() => ({ planted: new Map<string, { then?: () => void }>() }))
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const readdirSync = ((path: Parameters<typeof real.readdirSync>[0], ...rest: unknown[]) => {
    const names = (real.readdirSync as (...args: unknown[]) => unknown)(path, ...rest)
    const plant = planted.get(String(path))
    if (!plant || !Array.isArray(names)) return names
    planted.delete(String(path))
    plant.then?.()
    return [...names].sort((a, b) => Number(a) - Number(b))
  }) as typeof real.readdirSync
  return { ...real, readdirSync, default: { ...real, readdirSync } }
})

const implementation = new URL('../tools/database-holders.mjs', import.meta.url).href
const load = (): Promise<any> => import(/* @vite-ignore */ implementation)
const folders: string[] = []
const unreadableFolders: string[] = []
const selfUid = process.getuid?.() ?? -1
const asRoot = selfUid === 0
const rootSkip = asRoot ? ' [skipped as root: a mode 000 folder does not stop root reading it]' : ''

afterEach(() => {
  planted.clear()
  for (const folder of unreadableFolders.splice(0)) chmodSync(folder, 0o700)
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function world() {
  const root = aTestDatabaseFolder('holders')
  folders.push(root)
  const data = join(root, 'data'), proc = join(root, 'proc')
  mkdirSync(data); mkdirSync(proc)
  const database = join(data, 'made-up.db')
  writeFileSync(database, 'made-up database bytes\n')
  for (const suffix of ['-wal', '-shm', '-journal']) writeFileSync(database + suffix, `made-up ${suffix} bytes\n`)
  return { root, data, proc, database, inode: (suffix = '') => lstatSync(database + suffix).ino }
}

let nextPid = 4000

/**
 * One process under the made-up proc root. `readable: false` makes its fd folder mode 000.
 * `listedOnly: true` makes it mode 444: the folder lists, and every readlink in it is refused.
 * The stat line carries the start time at field 22 exactly as the real one does.
 */
function processAt(proc: string, options: {
  name?: string, uid?: number, state?: string, startTime?: string,
  fds?: Array<[string, string]>, readable?: boolean, listedOnly?: boolean, writeStatus?: boolean,
} = {}) {
  const pid = nextPid++
  const name = options.name ?? `fixture-${pid}`
  const uid = options.uid ?? selfUid
  const startTime = options.startTime ?? String(100000 + pid)
  const folder = join(proc, String(pid))
  mkdirSync(folder)
  if (options.writeStatus !== false) writeFileSync(join(folder, 'status'), `Name:\t${name}\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\nGid:\t${uid}\t${uid}\t${uid}\t${uid}\n`)
  const afterState = ['1', String(pid), ...Array(14).fill('0'), '1', '0', startTime, '0']
  writeFileSync(join(folder, 'stat'), `${pid} (${name}) ${options.state ?? 'S'} ${afterState.join(' ')}\n`)
  const fd = join(folder, 'fd')
  mkdirSync(fd)
  for (const [number, target] of options.fds ?? []) symlinkSync(target, join(fd, number))
  if (options.readable === false) { chmodSync(fd, 0o000); unreadableFolders.push(fd) }
  if (options.listedOnly) { chmodSync(fd, 0o444); unreadableFolders.push(fd) }
  return { pid, name, startTime, folder, fd }
}

function lockLine(options: {
  id?: number, type?: string, mode?: string, operation?: string, pid: number,
  inode: number, device?: string, waiter?: boolean,
}) {
  const at = `${options.device ?? '00:00'}:${options.inode}`
  return `${options.id ?? 1}: ${options.waiter ? '-> ' : ''}${options.type ?? 'POSIX'}  ${options.mode ?? 'ADVISORY'}  ${options.operation ?? 'READ'} ${options.pid} ${at} 0 EOF`
}

function locksAt(proc: string, lines: string[]) {
  writeFileSync(join(proc, 'locks'), lines.join('\n') + '\n')
}

describe('the readable process rule', () => {
  it('counts a readable descriptor that names the database path', async () => {
    const w = world(), p = processAt(w.proc, { name: 'reader', fds: [['3', w.database]] })
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([{ pid: p.pid, ppid: 1, pgid: p.pid, startTime: p.startTime, state: 'S', name: 'reader', how: 'fd' }])
    expect(result.setAside).toEqual([]); expect(result.otherUsersUnreadable).toBe(0); expect(result.unnamedLocks).toEqual([])
  })

  it('counts a readable descriptor on a hard link to the -shm by inode', async () => {
    const w = world(), hard = join(w.data, 'invented-shm-link')
    linkSync(w.database + '-shm', hard)
    const p = processAt(w.proc, { name: 'hard-link-user', fds: [['4', hard]] })
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toHaveLength(1)
    expect(result.holders[0]).toMatchObject({ pid: p.pid, name: 'hard-link-user', how: 'fd' })
  })

  it('does not need /proc/locks when every process is readable', async () => {
    const w = world()
    processAt(w.proc, { name: 'readable-one', fds: [['3', join(w.data, 'some-other-file')]] })
    writeFileSync(join(w.data, 'some-other-file'), 'not the database\n')
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result).toEqual({ holders: [], setAside: [], otherUsersUnreadable: 0, unnamedLocks: [] })
  })
})

describe('the unreadable process rule', () => {
  it.skipIf(asRoot)('sets aside an unreadable process of this user with no lock row' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'quiet-one', readable: false })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([])
    expect(result.setAside).toEqual([{ pid: p.pid, name: 'quiet-one', startTime: p.startTime, says: `could not read process ${p.pid} (quiet-one); it holds no lock on the database` }])
    expect(result.otherUsersUnreadable).toBe(0); expect(result.unnamedLocks).toEqual([])
  })

  for (const [label, options] of [
    ['a POSIX row on the -shm inode', { suffix: '-shm', type: 'POSIX' }],
    ['a POSIX row on the -wal inode', { suffix: '-wal', type: 'POSIX' }],
    ['a POSIX row on the database inode', { suffix: '', type: 'POSIX' }],
    ['an FLOCK row on the database inode', { suffix: '', type: 'FLOCK' }],
  ] as const) {
    it.skipIf(asRoot)(`counts an unreadable process holding ${label}` + rootSkip, async () => {
      const w = world(), p = processAt(w.proc, { name: 'lock-holder', readable: false })
      const line = lockLine({ type: options.type, pid: p.pid, inode: w.inode(options.suffix) })
      locksAt(w.proc, [line])
      const result = await (await load()).theDatabaseHolders(w.database, w.proc)
      expect(result.holders).toEqual([{ pid: p.pid, ppid: 1, pgid: p.pid, startTime: p.startTime, state: 'S', name: 'lock-holder', how: line }])
      expect(result.setAside).toEqual([]); expect(result.otherUsersUnreadable).toBe(0)
    })
  }

  it.skipIf(asRoot)('counts a blocked waiter row for an unreadable process' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'waiting-holder', readable: false })
    const line = lockLine({ pid: p.pid, inode: w.inode('-shm'), waiter: true, operation: 'WRITE' })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toHaveLength(1); expect(result.holders[0]).toMatchObject({ pid: p.pid, name: 'waiting-holder', how: line })
  })

  it.skipIf(asRoot)('counts a row that differs only in the device field' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'other-device', readable: false })
    const line = lockLine({ pid: p.pid, inode: w.inode(), device: 'ff:ff' })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toHaveLength(1); expect(result.holders[0]).toMatchObject({ pid: p.pid, how: line })
  })

  it.skipIf(asRoot)('does not count a row on another inode' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'other-inode', readable: false })
    locksAt(w.proc, [lockLine({ pid: p.pid, inode: w.inode() + 1000 })])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([]); expect(result.setAside).toHaveLength(1)
    expect(result.setAside[0].says).toBe(`could not read process ${p.pid} (other-inode); it holds no lock on the database`)
  })

  it.skipIf(asRoot)('counts another user\'s unreadable process with no row, and does not list it' + rootSkip, async () => {
    const w = world(), other = selfUid + 1
    processAt(w.proc, { name: 'someone-else', uid: other, readable: false })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([]); expect(result.setAside).toEqual([]); expect(result.otherUsersUnreadable).toBe(1)
  })

  it.skipIf(asRoot)('counts another user\'s unreadable process as a holder when it has a row' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'someone-else-holder', uid: selfUid + 1, readable: false })
    const line = lockLine({ pid: p.pid, inode: w.inode('-journal') })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toHaveLength(1); expect(result.holders[0]).toMatchObject({ pid: p.pid, name: 'someone-else-holder', how: line })
    expect(result.setAside).toEqual([]); expect(result.otherUsersUnreadable).toBe(0)
  })

  it.skipIf(asRoot)('skips a zombie with an unreadable fd folder' + rootSkip, async () => {
    const w = world()
    processAt(w.proc, { name: 'ended-zombie', state: 'Z', readable: false })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result).toEqual({ holders: [], setAside: [], otherUsersUnreadable: 0, unnamedLocks: [] })
  })

  it.skipIf(asRoot)('skips a process whose status vanished without throwing' + rootSkip, async () => {
    const w = world()
    processAt(w.proc, { name: 'no-status', readable: false, writeStatus: false })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result).toEqual({ holders: [], setAside: [], otherUsersUnreadable: 0, unnamedLocks: [] })
  })

  it.skipIf(asRoot)('throws, naming the process, when /proc/locks is missing and an unreadable process needs it' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'needs-locks', readable: false })
    const { theDatabaseHolders } = await load()
    expect(() => theDatabaseHolders(w.database, w.proc)).toThrow(`could not read process ${p.pid} (needs-locks); /proc/locks could not be read (ENOENT)`)
  })
})

describe('a descriptor refused or gone after the list', () => {
  it.skipIf(asRoot)('sets aside a process whose fd folder lists but refuses its readlink, naming the descriptor' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'turned-away', fds: [['3', w.database]], listedOnly: true })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([])
    expect(result.setAside).toEqual([{ pid: p.pid, name: 'turned-away', startTime: p.startTime, says: `could not read descriptor 3 of process ${p.pid} (turned-away); it holds no lock on the database` }])
    expect(result.otherUsersUnreadable).toBe(0); expect(result.unnamedLocks).toEqual([])
  })

  it.skipIf(asRoot)('counts a process whose readlink is refused as a holder when it has a lock row' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'turned-away-holder', fds: [['3', w.database]], listedOnly: true })
    const line = lockLine({ pid: p.pid, inode: w.inode('-shm') })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([{ pid: p.pid, ppid: 1, pgid: p.pid, startTime: p.startTime, state: 'S', name: 'turned-away-holder', how: line }])
    expect(result.setAside).toEqual([])
  })

  it.skipIf(asRoot)('counts another user\'s process whose readlink is refused, and does not list it' + rootSkip, async () => {
    const w = world()
    processAt(w.proc, { name: 'someone-else-turned-away', uid: selfUid + 1, fds: [['3', w.database]], listedOnly: true })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([]); expect(result.setAside).toEqual([]); expect(result.otherUsersUnreadable).toBe(1)
  })

  it.skipIf(asRoot)('reads on past a refused stat, and counts a later descriptor that names the database' + rootSkip, async () => {
    const w = world(), shut = join(w.root, 'shut')
    mkdirSync(shut); writeFileSync(join(shut, 'inside'), 'not the database\n'); chmodSync(shut, 0o000); unreadableFolders.push(shut)
    const p = processAt(w.proc, { name: 'one-refused-one-held', fds: [['3', join(shut, 'inside')], ['4', w.database]] })
    planted.set(p.fd, {})
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(planted.has(p.fd)).toBe(false)
    expect(result.holders).toEqual([{ pid: p.pid, ppid: 1, pgid: p.pid, startTime: p.startTime, state: 'S', name: 'one-refused-one-held', how: 'fd' }])
    expect(result.setAside).toEqual([])
  })

  it.skipIf(asRoot)('sets aside a process whose only refused descriptor is refused at the stat, naming it' + rootSkip, async () => {
    const w = world(), shut = join(w.root, 'shut')
    mkdirSync(shut); writeFileSync(join(shut, 'inside'), 'not the database\n'); chmodSync(shut, 0o000); unreadableFolders.push(shut)
    const p = processAt(w.proc, { name: 'stat-refused', fds: [['5', join(shut, 'inside')]] })
    locksAt(w.proc, [])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.holders).toEqual([])
    expect(result.setAside).toEqual([{ pid: p.pid, name: 'stat-refused', startTime: p.startTime, says: `could not read descriptor 5 of process ${p.pid} (stat-refused); it holds no lock on the database` }])
  })

  it.skipIf(asRoot)('throws, naming the descriptor, when /proc/locks is missing and a refused readlink needs it' + rootSkip, async () => {
    const w = world(), p = processAt(w.proc, { name: 'needs-locks-too', fds: [['3', w.database]], listedOnly: true })
    const { theDatabaseHolders } = await load()
    expect(() => theDatabaseHolders(w.database, w.proc)).toThrow(`could not read descriptor 3 of process ${p.pid} (needs-locks-too); /proc/locks could not be read (ENOENT)`)
  })

  it('skips a descriptor that goes between the list and the readlink, without throwing or setting anything aside', async () => {
    const w = world(), other = join(w.data, 'some-other-file')
    writeFileSync(other, 'not the database\n')
    const p = processAt(w.proc, { name: 'closed-its-database', fds: [['3', w.database], ['4', other]] })
    planted.set(p.fd, { then: () => unlinkSync(join(p.fd, '3')) })
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(planted.has(p.fd)).toBe(false)
    expect(result).toEqual({ holders: [], setAside: [], otherUsersUnreadable: 0, unnamedLocks: [] })
  })

  it('reads on past a descriptor that went after the list, and counts a later one that names the database', async () => {
    const w = world(), other = join(w.data, 'some-other-file')
    writeFileSync(other, 'not the database\n')
    const p = processAt(w.proc, { name: 'still-holds-it', fds: [['3', other], ['4', w.database]] })
    planted.set(p.fd, { then: () => unlinkSync(join(p.fd, '3')) })
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(planted.has(p.fd)).toBe(false)
    expect(result.holders).toEqual([{ pid: p.pid, ppid: 1, pgid: p.pid, startTime: p.startTime, state: 'S', name: 'still-holds-it', how: 'fd' }])
    expect(result.setAside).toEqual([])
  })
})

describe('the unnamed lock rule', () => {
  it('reports an OFDLCK row with pid -1 on the database inode', async () => {
    const w = world()
    const line = lockLine({ type: 'OFDLCK', pid: -1, inode: w.inode() })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.unnamedLocks).toEqual([line]); expect(result.holders).toEqual([]); expect(result.setAside).toEqual([])
  })

  it('reports a row on the database inode whose pid has no folder', async () => {
    const w = world()
    const line = lockLine({ pid: 999999, inode: w.inode('-wal') })
    locksAt(w.proc, [line])
    const result = await (await load()).theDatabaseHolders(w.database, w.proc)
    expect(result.unnamedLocks).toEqual([line])
  })
})
