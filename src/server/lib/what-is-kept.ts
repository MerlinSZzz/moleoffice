// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE OFFICE KEEPS: THE THREE NUMBERS READ AND WRITTEN, AND THE BACKUPS FOLDER READ.
 * Criterion U6.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE NUMBERS LIVE
 * ---------------------------------------------------------------------------------------
 *
 * Three columns on the installation singleton row: `keep_backups`, `untraced_request_days` and
 * `traced_request_days`. NULL means nobody has chosen, and then the default in
 * `@shared/what-is-kept.ts` is in force and the reader is told so. A value that is present and
 * cannot be read is `unreadable`: a refusal that names the setting, never a quiet default.
 *
 * ---------------------------------------------------------------------------------------
 * THE READERS THAT CANNOT CONTINUE FAIL LOUDLY
 * ---------------------------------------------------------------------------------------
 *
 * `theKeptNumberInForce` and `theRequestWindows` throw `KeptSettingCannotBeRead` when a value is
 * present and unreadable. The prune and the Usage page call those, so a bad value stops them and
 * says which setting it was, rather than letting a made-up window delete rows. The Settings panel
 * calls `whatTheOfficeKeeps`, which does not throw: it carries the refusal in the reading so the
 * section can draw it while the other numbers stay readable.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE IS CACHED
 * ---------------------------------------------------------------------------------------
 *
 * Every read goes to the row and, for the folder, to the directory at the moment somebody asks. A
 * remembered folder reading would be a number that goes stale while the page says it is current,
 * which is the thing `at request time` in criterion U6 exists to forbid.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { settings } from '../../config/settings.mjs'
import { bytesUnder } from './bytes-under.ts'
import { localStamp } from '@shared/time.ts'
import { z } from 'zod'
import {
  KEPT_NUMBER_HIGHEST,
  KEPT_NUMBER_LOWEST,
  KEPT_SETTING_KEYS,
  WHAT_A_BACKUP_IS,
  WHAT_IS_KEPT_DEFAULTS,
  WHAT_IS_KEPT_LABELS,
  WHAT_IS_KEPT_MEANS,
  backupsFolderHolds,
  bytesSaid as bytesSaidValue,
  isAFilesFolderName,
  isALeftOutListName,
  isKeptNumber,
  theBackupsFolderIsNotThereYet,
  type KeptNumberOnScreen,
  type KeptSettingKey,
  type TheBackupsFolder,
  type WhatTheOfficeKeeps,
} from '@shared/what-is-kept.ts'
import { sqlite } from '../db/client.ts'

/**
 * THE CHECK ON A CHANGE TO THE THREE NUMBERS: the Settings page's own, and the one a request for one press asks
 * (src/server/lib/one-press.ts), so a request cannot set a value the page would refuse. Only the keys the body names
 * are written.
 */
export const WHAT_IS_KEPT_CHECK = z
  .strictObject({
    keepBackups: z.number().int().min(KEPT_NUMBER_LOWEST).max(KEPT_NUMBER_HIGHEST).nullable().optional(),
    untracedRequestDays: z.number().int().min(KEPT_NUMBER_LOWEST).max(KEPT_NUMBER_HIGHEST).nullable().optional(),
    tracedRequestDays: z.number().int().min(KEPT_NUMBER_LOWEST).max(KEPT_NUMBER_HIGHEST).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'name at least one of the three numbers to set; an empty body would change nothing.',
  })

/**
 * THE THREE NUMBERS AS CHOSEN, which is what the change log keeps (problem 4f6oWJdzJbnk): each number the person
 * chose, null where nobody chose, and "unreadable" where a stored value cannot be read. Not the whole reading, which
 * also holds the backups folder as it was listed at that moment and would make a press that changed nothing look like
 * a change.
 */
export function theChosenNumbers(reading: WhatTheOfficeKeeps): Record<string, number | null | 'unreadable'> {
  return Object.fromEntries(
    reading.numbers.map((one) => [one.key, one.nobodyChose ? null : one.from === 'unreadable' ? 'unreadable' : one.inForce]),
  )
}

/** The column each setting is stored in, worked out once. */
const COLUMNS: Readonly<Record<KeptSettingKey, string>> = {
  keepBackups: 'keep_backups',
  untracedRequestDays: 'untraced_request_days',
  tracedRequestDays: 'traced_request_days',
}

/** A value and where it came from, for a reader that must not be handed a guess. */
export interface KeptNumberInForce {
  value: number
  from: "the person's setting" | 'the default'
}

/** A present value that cannot be read. The sentence names the setting and refuses the default. */
export class KeptSettingCannotBeRead extends Error {
  constructor(sentence: string) {
    super(sentence)
    this.name = 'KeptSettingCannotBeRead'
  }
}

/** How the three columns read, exactly as SQLite hands them over, or null because there is no row. */
function theRawRow(): Record<string, unknown> | null {
  const row = sqlite
    .prepare(
      'SELECT keep_backups, untraced_request_days, traced_request_days FROM installation WHERE only_row = 1',
    )
    .get() as Record<string, unknown> | undefined
  return row ?? null
}

/** The value the row holds for one setting, or null because nobody has chosen or there is no row. */
function rawValueFor(key: KeptSettingKey): unknown {
  const row = theRawRow()
  if (row === null) return null
  return row[COLUMNS[key]] ?? null
}

/** One number as the screen reads it, including a refusal when the stored value cannot be read. */
export function readingOf(key: KeptSettingKey): KeptNumberOnScreen {
  const raw = rawValueFor(key)
  const label = WHAT_IS_KEPT_LABELS[key]
  const means = WHAT_IS_KEPT_MEANS[key]

  // NOBODY HAS CHOSEN. The default is in force and the reader is told that, rather than being
  // handed the default as though it were the person's own choice.
  if (raw === null || raw === undefined) {
    const theDefault = WHAT_IS_KEPT_DEFAULTS[key]
    return {
      key,
      label,
      means,
      nobodyChose: true,
      inForce: theDefault,
      from: 'the default',
      says: `Nobody has chosen, so the default of ${String(theDefault)} is in force.`,
    }
  }

  // PRESENT AND UNREADABLE. A refusal that names the setting. The default is NOT substituted: a
  // value the office itself wrote and can no longer read is not nobody having chosen.
  if (!isKeptNumber(raw)) {
    return {
      key,
      label,
      means,
      nobodyChose: false,
      inForce: null,
      from: 'unreadable',
      says:
        `${label} holds a value this office cannot read: ${JSON.stringify(raw)}. ` +
        'The default is not used, and nothing has been changed.',
    }
  }

  return {
    key,
    label,
    means,
    nobodyChose: false,
    inForce: raw,
    from: "the person's setting",
    says: `You chose ${String(raw)}, and that is what is in force.`,
  }
}

/**
 * ONE NUMBER IN FORCE, FOR A READER THAT CANNOT CONTINUE WITHOUT IT.
 *
 * Throws `KeptSettingCannotBeRead` when the value is present and unreadable, so the prune and the
 * Usage page stop and say which setting it was. A NULL column is not a refusal: it is nobody having
 * chosen, and the default applies.
 */
export function theKeptNumberInForce(key: KeptSettingKey): KeptNumberInForce {
  const reading = readingOf(key)
  if (reading.from === 'unreadable') throw new KeptSettingCannotBeRead(reading.says)
  return { value: reading.inForce as number, from: reading.from }
}

/** The two request windows the prune and the Usage page read, with where each came from. */
export function theRequestWindows(): {
  untraced: KeptNumberInForce
  traced: KeptNumberInForce
} {
  return {
    untraced: theKeptNumberInForce('untracedRequestDays'),
    traced: theKeptNumberInForce('tracedRequestDays'),
  }
}

/**
 * THE BACKUPS FOLDER, READ FROM THE DIRECTORY NOW.
 *
 * ONE ROW PER ORDINARY FILE, directly in the folder: its count and its size, and the newest one's
 * moment. A backup's files folder — `<name>.files`, where scripts/backup.ts copies the report files
 * and message pictures — is counted apart, and the bytes of everything in it are added to the total,
 * because they are part of the backup. A backup's list of what it left out — `<name>.left-out.txt`,
 * an ordinary file scripts/backup.ts writes when the files are over the line — is counted apart too,
 * as a list and not as a backup file. Its bytes are in the total, because the total is what the
 * whole folder takes on disk. It is not read for the newest moment, which is the newest of the
 * files counted. Any other name that is not an ordinary file — another
 * subdirectory, a link — is not a backup copy and is left out of the arithmetic rather than silently
 * counted as one.
 *
 * ABSENCE IS TWO DIFFERENT ANSWERS. A folder that could not be listed at all is `readable: false`
 * with the reason; a folder that was listed and holds no file is `readable: true` with a count of
 * zero. Only the second is "there are none".
 *
 * A FOLDER THAT IS NOT THERE YET IS THE SECOND ANSWER, because the first backup makes it. It is
 * `readable: true` with every count at zero, and its sentence says the folder is not there yet. The
 * backups door reads it the same way: `theBackupsInTheFolder` in src/server/lib/backup.ts answers
 * `folderExists: false` with no backups. The reader makes no folder.
 */
export function readTheBackupsFolder(directory: string): TheBackupsFolder {
  const refused = (err: unknown): TheBackupsFolder => ({
    directory,
    readable: false,
    whyUnreadable: (err as Error).message,
    count: 0,
    filesFolders: 0,
    leftOutLists: 0,
    totalBytes: 0,
    newestAt: null,
    says: `The backups folder ${directory} could not be read: ${(err as Error).message}.`,
  })

  let names: string[]
  try {
    names = readdirSync(directory)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        directory,
        readable: true,
        whyUnreadable: null,
        count: 0,
        filesFolders: 0,
        leftOutLists: 0,
        totalBytes: 0,
        newestAt: null,
        says: theBackupsFolderIsNotThereYet(directory),
      }
    }
    return refused(err)
  }

  let count = 0
  let filesFolders = 0
  let leftOutLists = 0
  let totalBytes = 0
  let newestMs = 0
  try {
    for (const name of names) {
      const at = join(directory, name)
      const stat = statSync(at)
      if (stat.isDirectory() && isAFilesFolderName(name)) {
        filesFolders += 1
        totalBytes += bytesUnder(at)
        continue
      }
      if (!stat.isFile()) continue
      if (isALeftOutListName(name)) {
        leftOutLists += 1
        totalBytes += stat.size
        continue
      }
      count += 1
      totalBytes += stat.size
      if (stat.mtimeMs > newestMs) newestMs = stat.mtimeMs
    }
  } catch (err) {
    return refused(err)
  }

  const newestAt = newestMs === 0 ? null : localStamp(new Date(newestMs))
  return {
    directory,
    readable: true,
    whyUnreadable: null,
    count,
    filesFolders,
    leftOutLists,
    totalBytes,
    newestAt,
    // "No backup" is said only when the folder holds nothing counted here. A folder holding only a
    // list of what was left out, or only a files folder, is named as what it holds: the list is
    // there, and saying "no backup" alone would hide it.
    says:
      count === 0 && filesFolders === 0 && leftOutLists === 0
        ? `No backup is in ${directory} yet.`
        : `${backupsFolderHolds(count, filesFolders, leftOutLists)} in ${directory}, ${bytesSaidValue(totalBytes)} in all.`,
  }
}

/** The folder the backups live in, worked out in the one declaration that works out paths. */
export function theBackupsDirectory(): string {
  return settings().backupsDirectory
}

/** Everything the what-is-kept section draws: the three numbers and the folder as it stands now. */
export function whatTheOfficeKeeps(): WhatTheOfficeKeeps {
  return {
    whatABackupIs: WHAT_A_BACKUP_IS,
    numbers: KEPT_SETTING_KEYS.map(readingOf),
    backups: readTheBackupsFolder(theBackupsDirectory()),
  }
}

/**
 * WRITE ONE OR MORE OF THE NUMBERS, AND ANSWER WITH THE WHOLE READING.
 *
 * Only the settings the caller named are written, so a person changing one number does not rewrite
 * the other two. A named value of null takes the choice away again, which is how the person returns
 * a number to nobody-having-chosen. The reply is read fresh from the row, so what the screen draws
 * afterwards is what is stored.
 */
export function setWhatTheOfficeKeeps(
  change: Partial<Record<KeptSettingKey, number | null>>,
): WhatTheOfficeKeeps {
  const sets: string[] = []
  const values: (number | null)[] = []
  for (const key of KEPT_SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(change, key)) continue
    sets.push(`${COLUMNS[key]} = ?`)
    values.push(change[key] ?? null)
  }
  if (sets.length > 0) {
    sqlite
      .prepare(`UPDATE installation SET ${sets.join(', ')} WHERE only_row = 1`)
      .run(...values)
  }
  return whatTheOfficeKeeps()
}
