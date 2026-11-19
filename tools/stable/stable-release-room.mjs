// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROOM A STABLE RELEASE NEEDS, worked out and watched. It decides nothing about the release itself: the caller
 * gives it the release case, the work folder, the database, the measured build and the floor, and it answers whether
 * the free space every file system reaches stays at or above that floor. It also watches the same reading while the
 * release waits, and keeps the lowest one with its path and time.
 *
 * It follows the release floor rule. A gigabyte here is 1,000,000,000 bytes, as the sandbox's own floor
 * counts them.
 */
import { existsSync, lstatSync, readdirSync, statfsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readSetting } from '../../src/config/settings.mjs'
import { THE_RELEASE_FLOOR_SETTING } from '../../src/config/stable-release-floor.mjs'

export const A_GIGABYTE = 1_000_000_000
export const THE_ROOM_IS_READ_EVERY_MS = 10_000

/**
 * The release floor as the setting reads it.
 * @param {Record<string, string | undefined>} env
 * @returns {{ gb: number, bytes: number, setting: string, source: string }}
 */
export function theReleaseFloor(env) {
  const reading = readSetting(THE_RELEASE_FLOOR_SETTING, env)
  const gb = Number(reading.value)
  return { gb, bytes: gb * A_GIGABYTE, setting: THE_RELEASE_FLOOR_SETTING, source: reading.source }
}

/**
 * The space this user may write on the file system holding `path`, and that file system's device number.
 * @param {string} path
 * @returns {{ bytes: number, device: number }}
 */
export function freeSpaceAt(path) {
  const fileSystem = statfsSync(path)
  return { bytes: fileSystem.bavail * fileSystem.bsize, device: statSync(path).dev }
}

/**
 * The space a folder or file takes on disk: allocated blocks summed over every entry. A symbolic link is not
 * followed, and a hard-linked inode is counted once. A missing path is an error naming it, never 0.
 * @param {string} path
 * @returns {number}
 */
export function bytesUnder(path) {
  const counted = new Set()
  let total = 0
  const add = (at) => {
    let stat
    try {
      stat = lstatSync(at)
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`The path ${at} does not exist, so the space it takes is unknown; it was not counted as 0.`)
      throw error
    }
    const inode = `${stat.dev}:${stat.ino}`
    if (!counted.has(inode)) {
      counted.add(inode)
      total += stat.blocks * 512
    }
    if (stat.isDirectory()) for (const name of readdirSync(at)) add(join(at, name))
  }
  add(path)
  return total
}

/**
 * The bytes of the candidate's install and build, the saved baseline artifacts, and the clone of the development
 * repository: twice the artifacts under `checkout`, plus the bytes of `gitFolder`.
 * @param {{ checkout: string, artifactPaths: readonly string[], gitFolder: string }} parts
 * @returns {{ artifacts: number, git: number, total: number }}
 */
export function theBuildBytes({ checkout, artifactPaths, gitFolder }) {
  const artifacts = artifactPaths.reduce((total, path) => total + bytesUnder(join(checkout, path)), 0)
  const git = bytesUnder(gitFolder)
  return { artifacts, git, total: 2 * artifacts + git }
}

/**
 * The estimate before the lock. The work folder's lowest point is its free space now, less one database copy in
 * case 2, less the build. When the database is on another device, that file system's free space now is a lowest
 * point of its own and must also stay at or above the floor.
 * @param {{
 *   releaseCase: 1 | 2,
 *   workFolder: string,
 *   database: string,
 *   build: { artifacts: number, git: number, total: number },
 *   floor: { bytes: number, setting: string },
 *   freeSpace?: (path: string) => { bytes: number, device: number },
 * }} parts
 * @returns {{
 *   case: 1 | 2,
 *   free: number,
 *   databaseBytes: number,
 *   copies: number,
 *   build: { artifacts: number, git: number, total: number },
 *   lowest: number,
 *   floor: { bytes: number, setting: string },
 *   databaseFileSystem: null | { free: number, lowest: number },
 *   enough: boolean,
 * }}
 */
export function theRoom({ releaseCase, workFolder, database, build, floor, freeSpace = freeSpaceAt }) {
  const work = freeSpace(workFolder)
  const databaseFileSystemReading = freeSpace(database)
  const wal = `${database}-wal`
  const databaseBytes = statSync(database).size + (existsSync(wal) ? statSync(wal).size : 0)
  const copies = releaseCase === 2 ? 1 : 0
  const lowest = work.bytes - copies * databaseBytes - build.total
  const databaseFileSystem = databaseFileSystemReading.device === work.device
    ? null
    : { free: databaseFileSystemReading.bytes, lowest: databaseFileSystemReading.bytes }
  const enough = lowest >= floor.bytes && (databaseFileSystem === null || databaseFileSystem.lowest >= floor.bytes)
  return { case: releaseCase, free: work.bytes, databaseBytes, copies, build, lowest, floor, databaseFileSystem, enough }
}

/**
 * One sentence for the refusal, or null when the room is enough. Every size is in gigabytes with one decimal.
 * @param {{
 *   case: number,
 *   free: number,
 *   copies: number,
 *   build: { total: number },
 *   lowest: number,
 *   floor: { bytes: number, setting: string },
 *   databaseFileSystem: null | { free: number, lowest: number },
 *   enough: boolean,
 * }} room
 * @returns {string | null}
 */
export function theRoomRefusal(room) {
  if (room.enough) return null
  const size = (bytes) => `${(bytes / A_GIGABYTE).toFixed(1)} GB`
  const copies = `${room.copies} database ${room.copies === 1 ? 'copy' : 'copies'}`
  const otherFileSystem = room.databaseFileSystem === null
    ? ''
    : `; the database's file system has ${size(room.databaseFileSystem.free)} free, a lowest point of ${size(room.databaseFileSystem.lowest)}`
  return `The stable release has ${size(room.free)} free, and case ${room.case} with ${copies} and a build of ${size(room.build.total)} leaves a lowest point of ${size(room.lowest)}${otherFileSystem}, under the floor of ${size(room.floor.bytes)} set by ${room.floor.setting}. Nothing was changed.`
}

/**
 * A reading of the room that was taken: the path read, the free bytes on its file system, that file system's
 * device number, and the time it was read.
 * @typedef {object} AReadingTaken
 * @property {string} path
 * @property {number} bytes
 * @property {number} device
 * @property {Date} at
 */

/**
 * A reading that failed: the path that could not be read, the time it failed and the error. `bytes` and `device`
 * are null because no free space was read.
 * @typedef {object} AReadingFailed
 * @property {string} path
 * @property {null} bytes
 * @property {null} device
 * @property {Date} at
 * @property {unknown} error
 */

/**
 * Read the free space of each distinct file system among `paths` at once and then every `everyMs`. The lowest
 * reading is kept with its path and time. The first reading under `floor.bytes` is kept as `under`, and `onUnder`
 * is called once. A reading that throws stops the watch and is kept as `under` with its error, because an unknown
 * free space is not enough free space.
 * @param {{
 *   paths: readonly string[],
 *   floor: { bytes: number },
 *   everyMs?: number,
 *   freeSpace?: (path: string) => { bytes: number, device: number },
 *   now?: () => Date,
 *   onUnder: (reading: AReadingTaken | AReadingFailed) => void,
 *   timers?: { setInterval: (callback: () => void, everyMs: number) => unknown, clearInterval: (timer: unknown) => void },
 * }} parts
 * @returns {{ lowest: () => AReadingTaken | null, under: () => AReadingTaken | AReadingFailed | null, stop: () => AReadingTaken | null }}
 */
export function watchTheRoom({
  paths,
  floor,
  everyMs = THE_ROOM_IS_READ_EVERY_MS,
  freeSpace = freeSpaceAt,
  now = () => new Date(),
  onUnder,
  timers = { setInterval, clearInterval },
}) {
  let lowest = null
  let under = null
  let stopped = false
  let timer = null

  const stopTheTimer = () => {
    if (timer === null) return
    timers.clearInterval(timer)
    timer = null
  }

  const keep = (reading) => {
    if (lowest === null || reading.bytes < lowest.bytes) lowest = reading
    if (under === null && reading.bytes < floor.bytes) {
      under = reading
      onUnder(reading)
    }
  }

  const take = () => {
    if (stopped) return
    const at = now()
    const devices = new Set()
    for (const path of paths) {
      let space
      try {
        space = freeSpace(path)
      } catch (error) {
        stopped = true
        stopTheTimer()
        const failed = { path, bytes: null, device: null, at, error }
        if (under === null) onUnder(failed)
        under = failed
        return
      }
      if (devices.has(space.device)) continue
      devices.add(space.device)
      keep({ path, bytes: space.bytes, device: space.device, at })
    }
  }

  take()
  if (!stopped && paths.length > 0) timer = timers.setInterval(take, everyMs)
  return {
    lowest: () => lowest,
    under: () => under,
    stop: () => {
      stopped = true
      stopTheTimer()
      return lowest
    },
  }
}
