// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STABLE RELEASE KEEPS ROOM ABOVE ITS FLOOR (tools/stable/upgrade-stable.criteria.md, "A slimmer stable release", (4)).
 *
 * The release works out the lowest free space it reaches before it takes its lock: the free space now, less one
 * database copy in case 2, less the build it measures. The floor is the setting MOLE_OFFICE_STABLE_RELEASE_FLOOR_GB.
 * This file proves the setting, the two measures the build is made of, the estimate per case, its refusal, and the
 * watcher that reads free space while the release waits to stop the old version.
 *
 * All sizes and free space here are made up. No case reads this disk's free space as an expectation.
 *
 * MUTATIONS (each after a control run, then restored byte for byte): case 2 counts no database copy; the build counts
 * the artifacts once; `enough` uses `>` so exactly at the floor is refused; the watcher never calls onUnder; the
 * database's other file system is not checked; the setting's refusal call is removed from readSetting.
 */
import { linkSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSetting } from '../src/config/settings.mjs'
import { STABLE_RELEASE_FLOOR_SETTINGS, THE_RELEASE_FLOOR_SETTING, theStableReleaseFloorRefused } from '../src/config/stable-release-floor.mjs'
import {
  A_GIGABYTE,
  THE_ROOM_IS_READ_EVERY_MS,
  theBuildBytes,
  theReleaseFloor,
  theRoom,
  theRoomRefusal,
  bytesUnder,
  watchTheRoom,
} from '../tools/stable/stable-release-room.mjs'

/** The owner's chosen value. This file copies the number here once and nowhere else. */
const OWNER_DEFAULT_GB = 30

const folders: string[] = []

function aTemporaryFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-release-room-'))
  folders.push(folder)
  return folder
}

afterEach(() => {
  vi.useRealTimers()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function aMadeUpFloor(gb = 10): { gb: number; bytes: number; setting: string; source: string } {
  return { gb, bytes: gb * A_GIGABYTE, setting: THE_RELEASE_FLOOR_SETTING, source: 'made up by the test' }
}

function aMadeUpBuild(): { artifacts: number; git: number; total: number } {
  const artifacts = 2 * A_GIGABYTE
  const git = A_GIGABYTE
  return { artifacts, git, total: 2 * artifacts + git }
}

/** A database file with a WAL companion, so its made-up bytes are the sum of both files. */
function aDatabase(): { folder: string; database: string; bytes: number } {
  const folder = aTemporaryFolder()
  const database = join(folder, 'the-database.sqlite')
  writeFileSync(database, Buffer.alloc(40_960, 1))
  writeFileSync(`${database}-wal`, Buffer.alloc(8_192, 2))
  return { folder, database, bytes: statSync(database).size + statSync(`${database}-wal`).size }
}

const gigabytes = (bytes: number): string => (bytes / A_GIGABYTE).toFixed(1)

describe('the stable release floor setting', () => {
  it('is the owner\'s default when absent, and takes a whole number of gigabytes from 1', () => {
    expect(STABLE_RELEASE_FLOOR_SETTINGS.map((setting) => setting.name)).toEqual([THE_RELEASE_FLOOR_SETTING])
    expect(STABLE_RELEASE_FLOOR_SETTINGS[0]?.fallback).toBe(String(OWNER_DEFAULT_GB))
    expect(theReleaseFloor({})).toEqual({
      gb: OWNER_DEFAULT_GB,
      bytes: OWNER_DEFAULT_GB * A_GIGABYTE,
      setting: THE_RELEASE_FLOOR_SETTING,
      source: 'the built-in default',
    })
    for (const gb of [1, 120]) {
      expect(theStableReleaseFloorRefused(THE_RELEASE_FLOOR_SETTING, String(gb))).toBeNull()
      expect(theReleaseFloor({ [THE_RELEASE_FLOOR_SETTING]: String(gb) })).toEqual({
        gb,
        bytes: gb * A_GIGABYTE,
        setting: THE_RELEASE_FLOOR_SETTING,
        source: 'the environment',
      })
    }
    expect(theStableReleaseFloorRefused(THE_RELEASE_FLOOR_SETTING, undefined)).toBeNull()
  })

  it.each(['0', '-1', '1.5', '80GB', 'abc', ''])('refuses %j with the sentence the declaration gives, through readSetting', (raw) => {
    const sentence = theStableReleaseFloorRefused(THE_RELEASE_FLOOR_SETTING, raw)
    expect(typeof sentence, 'the declaration refuses this value').toBe('string')
    expect(sentence).toContain(THE_RELEASE_FLOOR_SETTING)
    expect(sentence).toContain(`"${raw}"`)
    expect(() => readSetting(THE_RELEASE_FLOOR_SETTING, { [THE_RELEASE_FLOOR_SETTING]: raw })).toThrow(sentence as string)
  })
})

describe('the bytes a build is made of', () => {
  it('counts each artifact once on the disk, and makes the build twice the artifacts plus the git folder', () => {
    const checkout = aTemporaryFolder()
    mkdirSync(join(checkout, 'node_modules'))
    writeFileSync(join(checkout, 'node_modules', 'a.bin'), Buffer.alloc(131_072, 1))
    mkdirSync(join(checkout, 'dist'))
    writeFileSync(join(checkout, 'dist', 'b.bin'), Buffer.alloc(65_536, 2))
    mkdirSync(join(checkout, 'the-git-folder'))
    writeFileSync(join(checkout, 'the-git-folder', 'pack.bin'), Buffer.alloc(32_768, 3))
    const artifactPaths = ['node_modules', 'dist']
    // Read each made-up part through the same measure the module uses, so no disk size is typed in here.
    const artifacts = artifactPaths.reduce((total, path) => total + bytesUnder(join(checkout, path)), 0)
    const git = bytesUnder(join(checkout, 'the-git-folder'))
    expect(theBuildBytes({ checkout, artifactPaths, gitFolder: join(checkout, 'the-git-folder') })).toEqual({
      artifacts,
      git,
      total: 2 * artifacts + git,
    })
  })

  it('refuses a missing artifact rather than counting it as nothing', () => {
    const checkout = aTemporaryFolder()
    mkdirSync(join(checkout, 'node_modules'))
    mkdirSync(join(checkout, 'the-git-folder'))
    expect(() => theBuildBytes({ checkout, artifactPaths: ['node_modules', 'an-absent-artifact'], gitFolder: join(checkout, 'the-git-folder') })).toThrow('an-absent-artifact')
    expect(() => bytesUnder(join(checkout, 'another-absent-path'))).toThrow('another-absent-path')
  })

  it('counts a hard-linked inode once, and does not follow a link out of the folder', () => {
    const folder = aTemporaryFolder()
    mkdirSync(join(folder, 'both'))
    writeFileSync(join(folder, 'both', 'one.bin'), Buffer.alloc(98_304, 4))
    const beforeTheLink = bytesUnder(join(folder, 'both'))
    linkSync(join(folder, 'both', 'one.bin'), join(folder, 'both', 'two.bin'))
    expect(bytesUnder(join(folder, 'both')), 'the second name is the same inode, counted once').toBe(beforeTheLink)

    writeFileSync(join(folder, 'the-target.bin'), Buffer.alloc(245_760, 5))
    mkdirSync(join(folder, 'links'))
    mkdirSync(join(folder, 'copies'))
    symlinkSync(join(folder, 'the-target.bin'), join(folder, 'links', 'a-link'))
    writeFileSync(join(folder, 'copies', 'a-copy.bin'), Buffer.alloc(245_760, 5))
    expect(bytesUnder(join(folder, 'links')), 'the link is not its target').toBeLessThan(bytesUnder(join(folder, 'copies')))
  })
})

describe('the room a release needs', () => {
  it('counts no database copy in case 1 and one in case 2', () => {
    const { folder, database, bytes: databaseBytes } = aDatabase()
    const build = aMadeUpBuild()
    const floor = aMadeUpFloor()
    const free = floor.bytes + build.total
    const freeSpace = () => ({ bytes: free, device: 1 })
    const case1 = theRoom({ releaseCase: 1, workFolder: folder, database, build, floor, freeSpace })
    expect(case1).toMatchObject({ case: 1, free, databaseBytes, copies: 0, build, lowest: floor.bytes, floor, databaseFileSystem: null, enough: true })
    const case2 = theRoom({ releaseCase: 2, workFolder: folder, database, build, floor, freeSpace })
    expect(case2).toMatchObject({ case: 2, free, databaseBytes, copies: 1, build, lowest: floor.bytes - databaseBytes, floor, databaseFileSystem: null, enough: false })
  })

  it('is enough exactly at the floor and not enough one byte under', () => {
    const { folder, database } = aDatabase()
    const build = aMadeUpBuild()
    const floor = aMadeUpFloor()
    const exactly = theRoom({ releaseCase: 1, workFolder: folder, database, build, floor, freeSpace: () => ({ bytes: floor.bytes + build.total, device: 1 }) })
    expect(exactly.lowest).toBe(floor.bytes)
    expect(exactly.enough).toBe(true)
    const oneUnder = theRoom({ releaseCase: 1, workFolder: folder, database, build, floor, freeSpace: () => ({ bytes: floor.bytes + build.total - 1, device: 1 }) })
    expect(oneUnder.lowest).toBe(floor.bytes - 1)
    expect(oneUnder.enough).toBe(false)
  })

  it('checks the database\'s own file system when it is another device', () => {
    const { folder, database } = aDatabase()
    const build = aMadeUpBuild()
    const floor = aMadeUpFloor()
    const workFree = floor.bytes + build.total + 10
    const onTwoDevices = (databaseFree: number) => (path: string) =>
      path === database ? { bytes: databaseFree, device: 2 } : { bytes: workFree, device: 1 }
    const under = theRoom({ releaseCase: 1, workFolder: folder, database, build, floor, freeSpace: onTwoDevices(floor.bytes - 1) })
    expect(under.lowest).toBe(floor.bytes + 10)
    expect(under.databaseFileSystem).toEqual({ free: floor.bytes - 1, lowest: floor.bytes - 1 })
    expect(under.enough).toBe(false)
    const atTheFloor = theRoom({ releaseCase: 1, workFolder: folder, database, build, floor, freeSpace: onTwoDevices(floor.bytes) })
    expect(atTheFloor.databaseFileSystem).toEqual({ free: floor.bytes, lowest: floor.bytes })
    expect(atTheFloor.enough).toBe(true)
  })

  it('says every figure and the setting in one refusal sentence, and says nothing when there is room', () => {
    const floor = aMadeUpFloor(90)
    const room = {
      case: 2,
      free: 100 * A_GIGABYTE,
      databaseBytes: 5 * A_GIGABYTE,
      copies: 1,
      build: { artifacts: 5 * A_GIGABYTE, git: 0, total: 10 * A_GIGABYTE },
      lowest: 85 * A_GIGABYTE,
      floor,
      databaseFileSystem: null,
      enough: false,
    }
    const sentence = theRoomRefusal(room)
    expect(typeof sentence, 'a room under the floor is refused').toBe('string')
    expect(sentence).toContain(gigabytes(room.free))
    expect(sentence).toContain(`case ${room.case}`)
    expect(sentence).toContain(`${room.copies} database copy`)
    expect(sentence).toContain(gigabytes(room.build.total))
    expect(sentence).toContain(gigabytes(room.lowest))
    expect(sentence).toContain(gigabytes(room.floor.bytes))
    expect(sentence).toContain(room.floor.setting)
    expect(sentence?.endsWith('Nothing was changed.')).toBe(true)
    expect(theRoomRefusal({ ...room, enough: true })).toBeNull()

    const otherFilesystem = theRoomRefusal({ ...room, databaseFileSystem: { free: 70 * A_GIGABYTE, lowest: 70 * A_GIGABYTE } })
    expect(otherFilesystem).toContain(gigabytes(70 * A_GIGABYTE))
  })
})

describe('watching the room while the release waits', () => {
  const floor = aMadeUpFloor(1)

  it('calls onUnder once at the first reading under the floor, keeps the lowest with its time, and stops reading', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
    const answers = [floor.bytes + 5, floor.bytes + 3, floor.bytes - 1, floor.bytes - 2, floor.bytes + 9]
    let reads = 0
    const freeSpace = () => ({ bytes: answers[Math.min(reads++, answers.length - 1)]!, device: 1 })
    const onUnder = vi.fn()
    const watch = watchTheRoom({ paths: ['/made-up/work'], floor, onUnder, freeSpace })
    expect(onUnder, 'a reading above the floor calls nothing').not.toHaveBeenCalled()
    expect(watch.lowest()?.bytes).toBe(floor.bytes + 5)
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS)
    expect(watch.lowest()?.bytes).toBe(floor.bytes + 3)
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS)
    expect(onUnder).toHaveBeenCalledTimes(1)
    const firstUnder = onUnder.mock.calls[0]?.[0]
    expect(firstUnder).toMatchObject({ path: '/made-up/work', bytes: floor.bytes - 1 })
    expect(watch.under()).toBe(firstUnder)
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS)
    expect(watch.lowest()?.bytes).toBe(floor.bytes - 2)
    expect(watch.lowest()?.at).toEqual(new Date('2026-11-11T00:00:30Z'))
    expect(watch.under(), 'the first under stays the one that was kept').toBe(firstUnder)
    expect(onUnder).toHaveBeenCalledTimes(1)
    const stopped = watch.stop()
    expect(stopped).toBe(watch.lowest())
    const readsAtTheStop = reads
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS * 3)
    expect(reads, 'stop ends the readings').toBe(readsAtTheStop)
  })

  it('keeps one reading for each distinct file system in a pass', () => {
    vi.useFakeTimers()
    const freeSpace = (path: string) => {
      if (path === 'the-same-disk-again') return { bytes: floor.bytes + 1, device: 1 }
      if (path === 'the-other-disk') return { bytes: floor.bytes + 20, device: 2 }
      return { bytes: floor.bytes + 10, device: 1 }
    }
    const watch = watchTheRoom({ paths: ['the-work-disk', 'the-same-disk-again', 'the-other-disk'], floor, onUnder: vi.fn(), freeSpace })
    expect(watch.lowest(), 'the second path on the same disk is the same reading').toMatchObject({ path: 'the-work-disk', device: 1 })
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS)
    expect(watch.lowest()).toMatchObject({ path: 'the-work-disk', device: 1 })
    watch.stop()
  })

  it('stops the watch and keeps a reading that throws as the under reading', () => {
    vi.useFakeTimers()
    const refused = new Error('the made-up file system could not be read')
    let reads = 0
    const freeSpace = () => {
      reads += 1
      if (reads === 1) return { bytes: floor.bytes + 10, device: 1 }
      throw refused
    }
    const onUnder = vi.fn()
    const watch = watchTheRoom({ paths: ['/made-up/work'], floor, onUnder, freeSpace })
    expect(watch.under()).toBeNull()
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS)
    expect(watch.under()).toMatchObject({ path: '/made-up/work', error: refused })
    expect(onUnder).toHaveBeenCalledTimes(1)
    const readsAfterTheError = reads
    vi.advanceTimersByTime(THE_ROOM_IS_READ_EVERY_MS * 3)
    expect(reads, 'an unknown free space stops the readings').toBe(readsAfterTheError)
    expect(watch.stop()?.bytes).toBe(floor.bytes + 10)
  })
})
