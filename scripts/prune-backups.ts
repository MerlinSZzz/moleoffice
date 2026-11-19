// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `npm run db:prune-backups` — keep the newest N copies of the database and delete the rest.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE DECISION THIS CARRIES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U6 of design/settings/ACCEPTANCE.md. The rule of 13 September 2026, 11:48, comes from
 * the chat. Three copies of the database is enough by default. The
 * number lives in one place, `keep_backups` on the installation row, built by piece 3 and read here
 * so the setting stays one fact.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS COMMAND MAY AND MAY NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * Measured read-only on 13 September 2026: data/backups held 216 entries, 131 database copies,
 * 92.57 GB, on a disk 91 per cent full. The office keeps making copies and nothing removes them.
 * This is the command that removes them.
 *
 * Tests use ONLY temporary directories of made-up files. NqnE3EGs6FTF authorises a landing
 * to prune after each backup it takes, carrying a decision the owner made. Completeness
 * is shared with the backup floor under invariant 9, in src/server/lib/complete-backups.ts.
 *
 * THE INVARIANT THAT MATTERS MOST is that it never guesses. If the number to keep cannot be read,
 * it deletes nothing and exits 2. Not a default, not a warning followed by a deletion.
 *
 * IT DOES NOT IMPORT src/server/lib/what-is-kept.ts. That reader imports `sqlite` from
 * src/server/db/client.ts, and importing the client opens the database FOR WRITING and runs
 * `sqlite.pragma('journal_mode = WAL')` (client.ts:112 and :132). A command whose whole job is to
 * delete files must not change the database it is reading a setting from, so this opens the file the
 * way scripts/backup.ts does — read-only — and reads the one column itself. The size of a files
 * folder comes from src/server/lib/bytes-under.ts, which the panel reads too and which opens no
 * database.
 */

import Database from 'better-sqlite3'
import { readCompleteBackups, type BackupEntry } from '../src/server/lib/complete-backups.ts'
import { lstatSync, readdirSync, rmSync, type Stats } from 'node:fs'
import { join, resolve } from 'node:path'

import { bytesUnder } from '../src/server/lib/bytes-under.ts'
import { loadPanelEnv } from '../src/server/lib/env.ts'
import { THE_DEVELOPMENT_CHECKOUT, settings, whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { NothingWasRun, runInTheStableCheckout, stopAnUnpairedStableStart, thePairOfThisProcess } from '../src/config/the-office-tool-environment.mjs'
import {
  WHAT_IS_KEPT_DEFAULTS,
  WHAT_IS_KEPT_LABELS,
  bytesSaid,
  copyOfAFilesName,
  filesFolderOf,
  isAFilesFolderName,
  isALeftOutListName,
  isKeptNumber,
  leftOutListOf,
} from '../src/shared/what-is-kept.ts'

const HELP = `npm run db:prune-backups — keep the newest copies of the database and delete the rest.

  npm run db:prune-backups                     keep the newest N copies, where N is the office setting
  npm run db:prune-backups -- --say-only       print what it would do; delete nothing
  npm run db:prune-backups -- --directory <d>  look in this folder instead of the checkout's backups (for tests)
  npm run db:prune-backups -- --keep <n>       keep this many instead of the office setting (for tests)
  npm run db:prune-backups -- --json           also print one JSON line with the result
  npm run db:prune-backups -- --help

NEWEST IS BY THE STAMP IN mole-office-<stamp>.db, read back exactly as backup.ts writes it.
A complete copy is an ordinary SQLite file with its files folder or left-out list beside it.
Incomplete or unreadable copies, links and names that cannot be dated are named and left in place.
Only complete stamped copies and their companions directly inside this folder may be removed.
Links are never followed or removed. The newest complete copy is always kept.

A copy's -wal and -shm files, its folder of copied files (<name>.files) and its list of files left
out (<name>.left-out.txt) are deleted with it, or none of them is. They are deleted first, and the
copy only once all of them are gone, so a failure leaves the copy with what is left of them. Any of
them whose copy is gone is left alone. Any other file is left alone. Every file the tool leaves is
named with the reason.

The number to keep is read from the database this checkout serves. If that setting cannot be read,
the tool deletes nothing and exits 2.`

interface Options {
  directory: string | null
  keep: number | null
  sayOnly: boolean
  json: boolean
}

/**
 * Read the command line. An unknown option is refused rather than ignored, and the same shape as
 * scripts/backup.ts: the refusal is the help text with a line naming what was wrong.
 */
function readOptions(argv: readonly string[]): Options | { help: string } {
  const opts: Options = { directory: null, keep: null, sayOnly: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { help: HELP }
    else if (arg === '--json') opts.json = true
    else if (arg === '--say-only') opts.sayOnly = true
    else if (arg === '--directory' || arg === '--keep') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        return { help: `${arg} needs a value after it.\n\n${HELP}` }
      }
      if (arg === '--directory') {
        opts.directory = value
      } else {
        const number = Number(value)
        if (!isKeptNumber(number)) {
          return { help: `--keep needs a whole number from 1 upwards, not "${value}".\n\n${HELP}` }
        }
        opts.keep = number
      }
      i++
    } else return { help: `Unknown option "${arg}".\n\n${HELP}` }
  }
  return opts
}

/** A value in force and where it came from, or a refusal with the sentence that names what was found. */
type SettingReading =
  | { refused: false; value: number; from: "the person's setting" | 'the default' }
  | { refused: true; sentence: string }

/**
 * THE ONE NUMBER, READ FROM THE DATABASE THIS CHECKOUT SERVES, READ-ONLY.
 *
 * The column is `keep_backups` on the installation singleton row. A NULL means nobody has chosen,
 * and then the default applies — that is not a refusal. A value that is present and is not a number
 * the office may store is a refusal that names the setting, and it is never quietly replaced by the
 * default. A database that cannot be opened, or that has no such column, is the same refusal.
 */
function readTheSetting(databasePath: string): SettingReading {
  const label = WHAT_IS_KEPT_LABELS.keepBackups
  let db: Database.Database
  try {
    db = new Database(databasePath, { readonly: true, fileMustExist: true })
  } catch (err) {
    return { refused: true, sentence: `${label} could not be read from ${databasePath}: ${(err as Error).message}. Nothing is deleted.` }
  }
  let raw: unknown
  try {
    const row = db
      .prepare('SELECT keep_backups FROM installation WHERE only_row = 1')
      .get() as Record<string, unknown> | undefined
    raw = row?.['keep_backups'] ?? null
  } catch (err) {
    return { refused: true, sentence: `${label} could not be read from ${databasePath}: ${(err as Error).message}. Nothing is deleted.` }
  } finally {
    db.close()
  }
  if (raw === null || raw === undefined) {
    return { refused: false, value: WHAT_IS_KEPT_DEFAULTS.keepBackups, from: 'the default' }
  }
  if (!isKeptNumber(raw)) {
    return {
      refused: true,
      sentence:
        `${label} holds a value this office cannot read: ${JSON.stringify(raw)}. ` +
        'The default is not used, and nothing has been changed.',
    }
  }
  return { refused: false, value: raw, from: "the person's setting" }
}

/** Whether a name ends with a copy's companion suffix. */
function isCompanionName(name: string): boolean {
  return name.endsWith('-wal') || name.endsWith('-shm')
}

/** The copy a companion belongs to, worked out from the companion's own name. */
function copyOfCompanion(name: string): string {
  return isCompanionName(name) ? name.slice(0, name.length - 4) : name
}

/** The copy a -wal, -shm, files folder or left-out list would belong to, from its own name. */
function copyOfItsName(name: string): string {
  return isCompanionName(name) ? copyOfCompanion(name) : copyOfAFilesName(name)
}

async function main(): Promise<void> {
  const parsed = readOptions(process.argv.slice(2))
  if ('help' in parsed) {
    console.log(parsed.help)
    return
  }

  // Before the database path is read, and the script reads it itself rather than through
  // db/client.ts, which would open the file for writing and force WAL mode. See the header.
  loadPanelEnv()
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(settings().databasePath)
  // A DEVELOPMENT CHECKOUT WHOSE .env NAMES THE STABLE CHECKOUT prunes through it (wave 13q, part d), as db:backup does.
  if (refusal !== null && THE_DEVELOPMENT_CHECKOUT === null && thePairOfThisProcess() !== null) {
    try {
      process.exitCode = runInTheStableCheckout('scripts/prune-backups.ts', process.argv.slice(2), 'prune-backups')
      return
    } catch (error) {
      if (error instanceof NothingWasRun) throw new Error(`${refusal} ${error.message}`)
      throw error
    }
  }
  if (refusal !== null) throw new Error(refusal)

  const keepWasGiven = parsed.keep !== null
  if (keepWasGiven) {
    // ON THE FIRST LINE, as the ruling requires: a reader must know the number is not their setting.
    console.log(
      `prune-backups: --keep ${String(parsed.keep)} overrides the setting. ` +
        'It is for tests, and it is not the person\'s choice.',
    )
  }

  const directory = resolve(parsed.directory ?? settings().backupsDirectory)

  let keep: number
  let from: "the person's setting" | 'the default' | 'the --keep option'
  if (keepWasGiven) {
    keep = parsed.keep as number
    from = 'the --keep option'
  } else {
    const reading = readTheSetting(settings().databasePath)
    if (reading.refused) {
      console.error(`prune-backups: ${reading.sentence}`)
      if (parsed.json) console.log(JSON.stringify({ removed: [], kept: [], left: [], wouldRemove: [], bytes: 0, freedBytes: 0, sayOnly: parsed.sayOnly, refused: reading.sentence }))
      process.exitCode = 2
      return
    }
    keep = reading.value
    from = reading.from
  }

  const answer: {
    removed: { name: string; ageMinutes: number; bytes: number; freedBytes: number }[]
    kept: { name: string }[]
    left: { name: string; reason: string }[]
    wouldRemove: { name: string; ageMinutes: number; bytes: number; freedBytes: number }[]
    bytes: number
    freedBytes: number
    sayOnly: boolean
    refused?: string
    failed?: string
  } = { removed: [], kept: [], left: [], wouldRemove: [], bytes: 0, freedBytes: 0, sayOnly: parsed.sayOnly }
  const printJson = (): void => { if (parsed.json) console.log(JSON.stringify(answer)) }
  let found: ReturnType<typeof readCompleteBackups>
  try {
    found = readCompleteBackups(directory)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`prune-backups: there is no backups folder at ${directory}, so there is nothing to prune.`)
    } else {
      answer.failed = `the backups folder ${directory} could not be read: ${(err as Error).message}`
      console.error(`prune-backups: ${answer.failed}.`)
      process.exitCode = 1
    }
    printJson()
    return
  }

  const { entries, backups } = found
  const copies = backups.flatMap((one) => one.complete ? [one] : [])
    .sort((a, b) => b.time - a.time || b.entry.name.localeCompare(a.entry.name))
  const kept = new Set(copies.slice(0, Math.max(1, keep)).map((one) => one.entry.name))
  const companionsOf = (copy: string): string[] => [
    `${copy}-wal`, `${copy}-shm`, filesFolderOf(copy), leftOutListOf(copy),
  ]
  const accounted = new Set<string>()
  // Problem ALuP6FvWOQfD: a dry run must account for links earlier entries would remove too.
  const wouldUnlink = new Map<string, number>()
  let failures = 0
  const leave = (entry: BackupEntry, reason: string): void => {
    accounted.add(entry.name)
    answer.left.push({ name: entry.name, reason })
    const size = entry.stat === null || entry.stat.isDirectory() ? 'size unknown' : `${String(entry.stat.size)} bytes`
    console.log(`prune-backups: left ${entry.path} (${size}): ${reason}.`)
  }

  console.log(
    `prune-backups: keeping the newest ${String(keep)} database copies in ${directory} ` +
      `(${from === 'the --keep option' ? 'that number overrides the setting' : `from ${from}`}).`,
  )
  for (const one of backups) if (!one.complete) leave(one.entry, one.reason)

  for (const one of copies) {
    const copy = one.entry
    const companions = companionsOf(copy.name).flatMap((name) => {
      const entry = entries.get(name)
      return entry === undefined ? [] : [entry]
    })
    if (kept.has(copy.name)) {
      answer.kept.push({ name: copy.name })
      accounted.add(copy.name)
      console.log(`prune-backups: left ${copy.path} (${String(copy.stat!.size)} bytes): it is one of the newest ${String(keep)} copies, so it is kept.`)
      for (const entry of companions) leave(entry, entry.stat?.isSymbolicLink()
        ? 'a link; it is never followed or removed' : `it goes with the copy ${copy.name}, which is kept`)
      continue
    }
    const group = [...companions, copy]
    const sizes = new Map<string, number>()
    const files = new Map<string, Stats[]>()
    let unsafe: string | null = null
    for (const entry of group) {
      try {
        if (entry.stat === null) throw new Error(`unreadable: ${entry.error}`)
        if (entry.stat.isSymbolicLink()) throw new Error('a link; it is never followed or removed')
        if (entry.name === filesFolderOf(copy.name)) {
          if (!entry.stat.isDirectory()) throw new Error('incomplete: its files companion is not a folder')
          // bytesUnder follows links for its panel reader. Prove there are none before using the
          // shared size reader here; even a link inside a companion folder must stay in place.
          files.set(entry.name, requireNoLinksUnder(entry.path))
          sizes.set(entry.name, bytesUnder(entry.path))
        } else {
          if (!entry.stat.isFile()) throw new Error('incomplete: its companion is not an ordinary file')
          sizes.set(entry.name, entry.stat.size)
          files.set(entry.name, [entry.stat])
        }
      } catch (err) {
        unsafe = `${entry.name}: ${(err as Error).message}`
        break
      }
    }
    if (unsafe !== null) {
      for (const entry of group) leave(entry, unsafe)
      continue
    }
    const report = { name: copy.name, ageMinutes: (Date.now() - one.time) / 60_000,
      bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0), freedBytes: 0 }
    accounted.add(copy.name)
    if (parsed.sayOnly) {
      answer.wouldRemove.push(report)
      for (const entry of group) {
        accounted.add(entry.name)
        const freed = freedByUnlinking(files.get(entry.name)!, wouldUnlink)
        console.log(`prune-backups: would delete ${entry.path} (${String(sizes.get(entry.name))} bytes in size, ${String(freed)} bytes would be freed).`)
        answer.bytes += sizes.get(entry.name)!
        answer.freedBytes += freed
        report.freedBytes += freed
      }
      continue
    }
    // Companions first. Any failure keeps the database with the companions that remain.
    let allGone = true
    for (const entry of group) {
      if (entry === copy && !allGone) {
        leave(copy, 'something that goes with it could not be deleted')
        break
      }
      try {
        // Check again at the act: a name replaced by a link since the plan is left in place.
        const stat = lstatSync(entry.path)
        if (stat.isSymbolicLink()) throw new Error('a link; it is never followed or removed')
        const unlinked = entry.stat!.isDirectory() ? requireNoLinksUnder(entry.path) : [stat]
        const freed = freedByUnlinking(unlinked)
        rmSync(entry.path, { recursive: entry.stat!.isDirectory() })
        accounted.add(entry.name)
        console.log(`prune-backups: deleted ${entry.path} (${String(sizes.get(entry.name))} bytes in size, ${String(freed)} bytes freed).`)
        answer.bytes += sizes.get(entry.name)!
        answer.freedBytes += freed
        report.freedBytes += freed
        if (entry === copy) answer.removed.push(report)
      } catch (err) {
        failures += 1
        allGone = false
        leave(entry, `could not delete it: ${(err as Error).message}`)
      }
    }
  }
  for (const entry of entries.values()) {
    if (accounted.has(entry.name)) continue
    const companion = isCompanionName(entry.name) || isAFilesFolderName(entry.name) || isALeftOutListName(entry.name)
    leave(entry, entry.stat?.isSymbolicLink() ? 'a link; it is never followed or removed'
      : entry.error !== null ? `unreadable: ${entry.error}`
      : companion ? `it goes with ${copyOfItsName(entry.name)}, which is left in place or absent, so there is nothing to delete it with`
      : !entry.stat?.isFile() ? 'it is not an ordinary file, so the tool leaves it alone'
      : 'its name does not match the backup pattern, so the tool leaves it alone')
  }
  console.log(parsed.sayOnly
    ? `prune-backups: would remove ${String(answer.bytes)} bytes of files (${bytesSaid(answer.bytes)}), of which ${String(answer.freedBytes)} bytes (${bytesSaid(answer.freedBytes)}) would be freed, because --say-only was given.`
    : `prune-backups: removed ${String(answer.bytes)} bytes of files (${bytesSaid(answer.bytes)}), of which ${String(answer.freedBytes)} bytes (${bytesSaid(answer.freedBytes)}) were freed.`)
  if (failures > 0) {
    answer.failed = `${String(failures)} entries could not be deleted`
    process.exitCode = 1
  }
  printJson()
}

/** Reject a folder containing links without following any, including links to outside this folder. */
function requireNoLinksUnder(folder: string, files: Stats[] = []): Stats[] {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error(`a link at ${path}; it is never followed or removed`)
    if (stat.isDirectory()) requireNoLinksUnder(path, files)
    else if (!stat.isFile()) throw new Error(`not an ordinary file at ${path}`)
    else files.push(stat)
  }
  return files
}

/**
 * Problem ALuP6FvWOQfD: sizes count paths, but freed bytes count each inode once, only when all
 * its remaining hard links go. Real removals read current nlink; a dry run subtracts its earlier
 * planned unlinks. Device belongs in the key because inode numbers are local to a device.
 */
function freedByUnlinking(files: Stats[], wouldUnlink?: Map<string, number>): number {
  const inodes = new Map<string, { size: number; nlink: number; held: number }>()
  for (const file of files) {
    const key = `${String(file.dev)}:${String(file.ino)}`
    const inode = inodes.get(key) ?? { size: file.size, nlink: file.nlink, held: 0 }
    inode.held++
    inodes.set(key, inode)
  }
  let freed = 0
  for (const [key, inode] of inodes) {
    const earlier = wouldUnlink?.get(key) ?? 0
    if (inode.held === inode.nlink - earlier) freed += inode.size
    wouldUnlink?.set(key, earlier + inode.held)
  }
  return freed
}

// THE START CHECK (wave 13q), before the options are read.
stopAnUnpairedStableStart()
await main()
