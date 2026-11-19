// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The backup floor and the prune share what a complete backup means (invariant 9).
 * This belongs beside the two scripts: it reads files only and opens no database, so either
 * command can import it without changing the installation it reads. NqnE3EGs6FTF carries
 * the owner’s decision on retention. Unreadable or incomplete copies are never pruned.
 */
import { closeSync, constants, lstatSync, openSync, readSync, readdirSync, type Stats } from 'node:fs'
import { join } from 'node:path'
import { filesFolderOf, leftOutListOf } from '../../shared/what-is-kept.ts'

/** A filename-safe moment: `20260812-142009`, local time, same clock the records use. */
export function fileStamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * WHAT MADE A BACKUP IS IN ITS NAME, and the names are written and read only here. Each of the
 * three makers writes `mole-office-<stamp><ending>.db` through `backupNameFor`, and the list of
 * backups reads the maker back with `whatMadeTheBackup`. A name that is none of the three, such as
 * one given with `npm run db:backup -- --to`, has no maker: nobody can tell from it what made it.
 */
export const BACKUP_NAME_ENDINGS = {
  'the-backup-command': '',
  'the-door': '-taken-at-the-door',
  'the-update': '-before-the-update',
} as const
export type BackupMaker = keyof typeof BACKUP_NAME_ENDINGS

/**
 * A SECOND PRESS OF THE DOOR IN ONE SECOND has the same stamp, so its name has a number after the ending: `-2`, `-3`
 * and up (`nth`). Only the door's names take one. The command refuses a name that is taken and says to name another
 * with --to, and the update takes one backup.
 */
export const backupNameFor = (maker: BackupMaker, d = new Date(), nth = 1): string =>
  `mole-office-${fileStamp(d)}${BACKUP_NAME_ENDINGS[maker]}${maker === 'the-door' && nth > 1 ? `-${String(nth)}` : ''}.db`

const MADE_BY = /^mole-office-\d{8}-\d{6}(-taken-at-the-door|-before-the-update)?(-(?:[2-9]|[1-9]\d+))?\.db$/
export function whatMadeTheBackup(name: string): BackupMaker | null {
  const match = MADE_BY.exec(name)
  if (match === null) return null
  const ending = match[1] ?? ''
  if (match[2] !== undefined && ending !== BACKUP_NAME_ENDINGS['the-door']) return null
  return (Object.keys(BACKUP_NAME_ENDINGS) as BackupMaker[]).find((maker) => BACKUP_NAME_ENDINGS[maker] === ending) ?? null
}

/**
 * THE PRUNE AND THE FLOOR DATE A BACKUP BY ITS NAME when the command or the door took it. Both take
 * the same backup with the same code, so the owner's number of backups to keep counts both. The
 * update's backups are left as they were: the prune never deletes them.
 */
const BACKUP_NAME = /^mole-office-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:(-taken-at-the-door)(?:-(\d+))?)?\.db$/
/** The stamp’s shape; calendar validity is decided by the exact round trip below. */
export const isBackupName = (name: string): boolean => BACKUP_NAME.test(name)

/** Read only a local stamp that reads back exactly as fileStamp writes it. */
export function timeInBackupName(name: string): number | null {
  const match = BACKUP_NAME.exec(name)
  if (match === null) return null
  const d = new Date(0)
  d.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  d.setHours(Number(match[4]), Number(match[5]), Number(match[6]), 0)
  return backupNameFor(match[7] === undefined ? 'the-backup-command' : 'the-door', d, Number(match[8] ?? 1)) === name ? d.getTime() : null
}

/** An unreadable header throws, so it is distinguished from readable non-SQLite bytes. */
function hasSqliteHeader(file: string): boolean {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const head = Buffer.alloc(16)
    return readSync(fd, head, 0, 16, 0) === 16 && head.toString('latin1') === 'SQLite format 3\u0000'
  } finally {
    closeSync(fd)
  }
}

export interface BackupEntry {
  name: string
  path: string
  stat: Stats | null
  error: string | null
}
export type BackupReading = { entry: BackupEntry } & (
  | { complete: true; time: number; ageFrom: 'name' | 'mtime' }
  | { complete: false; reason: string }
)

/**
 * Each top-level entry is listed and lstat-ed once. Stamped backups and custom --to .db names
 * use the same content and companion check. Only the latter retain the floor’s mtime fallback;
 * the prune never relies on them. Links, including linked companions, prove no completeness.
 */
export function readCompleteBackups(directory: string): {
  entries: Map<string, BackupEntry>
  backups: BackupReading[]
  unstamped: BackupReading[]
} {
  const entries = new Map<string, BackupEntry>()
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    try {
      entries.set(name, { name, path, stat: lstatSync(path), error: null })
    } catch (err) {
      entries.set(name, { name, path, stat: null, error: (err as Error).message })
    }
  }
  function read(entry: BackupEntry, stamped: boolean): BackupReading {
    const left = (reason: string): BackupReading => ({ entry, complete: false, reason })
    const stat = entry.stat
    if (stat === null) return left(`unreadable: ${entry.error}`)
    if (stat.isSymbolicLink()) return left('a link; it is never followed or removed')
    if (!stat.isFile()) return left('incomplete: it is not an ordinary file')
    const time = stamped ? timeInBackupName(entry.name) : stat.mtimeMs
    if (time === null) return left('a name that cannot be dated: its stamp does not read back exactly')
    try {
      if (!hasSqliteHeader(entry.path)) return left('incomplete: it is not a SQLite database')
    } catch (err) {
      return left(`unreadable: ${(err as Error).message}`)
    }
    const folder = entries.get(filesFolderOf(entry.name))
    const list = entries.get(leftOutListOf(entry.name))
    const complete = folder?.stat?.isDirectory() === true || list?.stat?.isFile() === true
    if (!complete) {
      const unreadable = [folder, list].find((one) => one?.error !== null && one?.error !== undefined)
      return left(unreadable === undefined
        ? 'incomplete: neither a files folder nor a left-out list is beside it'
        : `unreadable companion: ${unreadable.error}`)
    }
    return { entry, complete: true, time, ageFrom: stamped ? 'name' : 'mtime' }
  }
  const backups: BackupReading[] = []
  const unstamped: BackupReading[] = []
  for (const entry of entries.values()) {
    if (isBackupName(entry.name)) backups.push(read(entry, true))
    else if (entry.name.endsWith('.db')) unstamped.push(read(entry, false))
  }
  return { entries, backups, unstamped }
}
