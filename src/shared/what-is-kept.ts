// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OFFICE KEEPS: HOW MANY BACKUPS, AND HOW LONG THE TWO KINDS OF REQUEST ROW SURVIVE.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U6 of design/settings/ACCEPTANCE.md. This belongs in the settings, so the person may
 * adjust it themselves, and three copies of the database are enough by
 * default.
 *
 * THREE NUMBERS AND NO MORE:
 *
 *   1. how many backups to keep;
 *   2. how many days an untraced request row is kept; and
 *   3. how many days a traced one is kept.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT A SETTINGS TABLE, AND THERE IS NO SETTINGS STORE
 * ---------------------------------------------------------------------------------------
 *
 * These three numbers belong to the OFFICE rather than to a person, so they are columns on the
 * installation singleton — the same row P83 put the key window's moment and who on. drizzle/0152
 * states the rule in the repository's own words: a settings table would be a place for any future
 * setting to go, which is invariant 6 of USER.md. Each setting is a column where it belongs.
 *
 * ---------------------------------------------------------------------------------------
 * NULL MEANS NOBODY HAS CHOSEN, AND A PRESENT VALUE THAT CANNOT BE READ IS A REFUSAL
 * ---------------------------------------------------------------------------------------
 *
 * A NULL column means nobody has chosen, so the default below is in force and a reader is TOLD that
 * nobody chose rather than handed the default as though it were the person's choice. That is invariant 5 of
 * USER.md, and it is the pattern `media_load` sets.
 *
 * A value that is PRESENT and cannot be read is a different thing. It is a refusal that names the
 * setting, never a quiet default: this file marks such a reading `unreadable`, and the readers that
 * cannot honestly continue — the prune and the Usage page — fail loudly with its sentence. A value
 * smaller than one or larger than the ceiling below is unreadable for the same reason a word that is
 * not a choice is: the office cannot store anything else and it will not guess.
 */

/** The three settings, in the order they are drawn and read. */
export const KEPT_SETTING_KEYS = ['keepBackups', 'untracedRequestDays', 'tracedRequestDays'] as const

/** One of the three. */
export type KeptSettingKey = (typeof KEPT_SETTING_KEYS)[number]

/**
 * WHAT IS IN FORCE WHEN NOBODY HAS CHOSEN.
 *
 * The backup count is three, which is enough by default. The untraced
 * window is the seven days U6 names. The traced window is the 180 the old constant held, because
 * the criterion does not change it and six months of recoveries is what the series is made of.
 */
export const WHAT_IS_KEPT_DEFAULTS: Readonly<Record<KeptSettingKey, number>> = {
  keepBackups: 3,
  untracedRequestDays: 7,
  tracedRequestDays: 180,
}

/**
 * THE SMALLEST AND LARGEST A NUMBER MAY HONESTLY BE.
 *
 * One is the smallest: keeping no backups, or no days of request rows, is not a retention rule and
 * the office refuses to store it. The ceiling is a guard against arithmetic that overflows a day
 * count, and it is generous — a hundred thousand days is more than a lifetime of history.
 */
export const KEPT_NUMBER_LOWEST = 1
export const KEPT_NUMBER_HIGHEST = 100_000

/** What each number is called on the screen. A name, not a field and not a sentence. */
export const WHAT_IS_KEPT_LABELS: Readonly<Record<KeptSettingKey, string>> = {
  keepBackups: 'Backups to keep',
  untracedRequestDays: 'Days an untraced request is kept',
  tracedRequestDays: 'Days a traced request is kept',
}

/** What each number means, in one plain sentence. Sent with each number by GET /api/office/what-is-kept; no page draws it. */
export const WHAT_IS_KEPT_MEANS: Readonly<Record<KeptSettingKey, string>> = {
  keepBackups:
    'The office keeps this many of the newest full copies of its database and lets older ones go.',
  untracedRequestDays:
    'A request row that carries no trace of a piece of work is deleted after this many days.',
  tracedRequestDays:
    'A trace of one piece of work is kept whole for this many days, then summarised and deleted.',
}

/**
 * WHAT A BACKUP IS, in plain sentences the panel draws.
 *
 * It names the thing a reader keeps, and it does not promise that every file in the folder has been
 * verified — the section reports what the folder holds. The last sentence is there because backups
 * taken before scripts/backup.ts copied the files hold the database alone, and the folder may still
 * hold some.
 */
export const WHAT_A_BACKUP_IS =
  'A backup is a full copy of the office database and its report files, message pictures and uploaded pictures, to restore from. ' +
  'A file the last backup holds unchanged is linked, not copied. ' +
  'When the new files come to more than 10 GB, they are listed and not copied. ' +
  'Residents’ personal spaces are always copied whole. ' +
  'An older backup may hold the database alone.'

/**
 * THE LINE FOR NEW FILE BYTES ONE BACKUP WRITES: 10 GiB. Linked files count nothing.
 *
 * Decision YBUxSiGdDrB_ limits new bytes to 10737418240; over it, the backup links unchanged files
 * and lists the new ones as left out. It stands under a decision. The
 * earlier line was 2 GB for the total files, set on 16 September 2026 under a
 * decision. There is no setting for it. Tests hand a smaller line to
 * carryTheFiles; the command uses this one.
 */
export const BACKUP_FILES_LINE_BYTES = 10737418240

const FILES_FOLDER_ENDING = '.files'
const LEFT_OUT_LIST_ENDING = '.left-out.txt'

/** A backup copy's name without its `.db`, which the names of the things beside it start from. */
function stemOfACopy(copy: string): string {
  return copy.endsWith('.db') ? copy.slice(0, -'.db'.length) : copy
}

/**
 * The folder that holds a backup's copy of the report files and message pictures:
 * `mole-office-<stamp>.files` beside `mole-office-<stamp>.db`. Works on a name or a whole path.
 */
export function filesFolderOf(copy: string): string {
  return `${stemOfACopy(copy)}${FILES_FOLDER_ENDING}`
}

/**
 * The text file that lists the files a backup left out because they were over the line:
 * `mole-office-<stamp>.left-out.txt` beside `mole-office-<stamp>.db`. Works on a name or a whole path.
 */
export function leftOutListOf(copy: string): string {
  return `${stemOfACopy(copy)}${LEFT_OUT_LIST_ENDING}`
}

/** The three kinds of thing the backups folder is counted in. */
export type BackupsFolderKind = 'files' | 'filesFolders' | 'leftOutLists'

/** One count that is said about the backups folder: which kind, and how many. */
export interface BackupsFolderPart {
  what: BackupsFolderKind
  n: number
}

/** Whether the backups folder holds nothing that is counted: no file, no files folder and no list. */
export function backupsFolderIsEmpty(files: number, filesFolders: number, leftOutLists: number): boolean {
  return files === 0 && filesFolders === 0 && leftOutLists === 0
}

/**
 * WHICH COUNTS ARE SAID ABOUT THE BACKUPS FOLDER, AND IN WHAT ORDER.
 *
 * This is the one place that decides it. The server's English sentence and the Settings panel,
 * which says it in the page's language, both build their words from this list.
 *
 * A count of zero folders or lists is not said. The file count is said when it is above zero, and
 * also when nothing else is, so the list is never empty.
 */
export function backupsFolderParts(files: number, filesFolders: number, leftOutLists: number): BackupsFolderPart[] {
  const parts: BackupsFolderPart[] = []
  if (files > 0 || (filesFolders === 0 && leftOutLists === 0)) parts.push({ what: 'files', n: files })
  if (filesFolders > 0) parts.push({ what: 'filesFolders', n: filesFolders })
  if (leftOutLists > 0) parts.push({ what: 'leftOutLists', n: leftOutLists })
  return parts
}

/** Each kind's words in English, for one and for more than one. */
const BACKUPS_FOLDER_NOUNS: Readonly<Record<BackupsFolderKind, readonly [string, string]>> = {
  files: ['file', 'files'],
  filesFolders: ['folder of copied files', 'folders of copied files'],
  leftOutLists: ['list of what was left out', 'lists of what was left out'],
}

/**
 * WHAT THE BACKUPS FOLDER HOLDS, AS COUNTS A PERSON READS: "3 files, 1 folder of copied files and
 * 1 list of what was left out". The server's folder sentence is built with this. The counts it says
 * come from `backupsFolderParts`.
 */
export function backupsFolderHolds(files: number, filesFolders: number, leftOutLists: number): string {
  const parts = backupsFolderParts(files, filesFolders, leftOutLists).map(
    ({ what, n }) => `${String(n)} ${BACKUPS_FOLDER_NOUNS[what][n === 1 ? 0 : 1]}`,
  )
  const last = parts.pop() as string
  return parts.length === 0 ? last : `${parts.join(', ')} and ${last}`
}

/** What the server says about a backups folder that is not there yet, because no backup has made it. */
export function theBackupsFolderIsNotThereYet(directory: string): string {
  return `There is no backups folder at ${directory} yet. The first backup makes it.`
}

/** Whether a name in the backups folder is the name a backup's files folder is given. */
export function isAFilesFolderName(name: string): boolean {
  return name.endsWith(FILES_FOLDER_ENDING)
}

/** Whether a name in the backups folder is the name a backup's left-out list is given. */
export function isALeftOutListName(name: string): boolean {
  return name.endsWith(LEFT_OUT_LIST_ENDING)
}

/** The database copy a files folder or a left-out list would belong to, from its own name. */
export function copyOfAFilesName(name: string): string {
  const ending = isAFilesFolderName(name) ? FILES_FOLDER_ENDING : LEFT_OUT_LIST_ENDING
  return `${name.slice(0, -ending.length)}.db`
}

/** One of the three numbers as a screen reads it. */
export interface KeptNumberOnScreen {
  key: KeptSettingKey
  /** What the number is called on the screen. */
  label: string
  /** What the number means, in one plain sentence. */
  means: string
  /** True when nobody has chosen, so the default is in force. */
  nobodyChose: boolean
  /** The value in force, or null because a present value could not be read. */
  inForce: number | null
  /** Where the value in force came from. */
  from: "the person's setting" | 'the default' | 'unreadable'
  /** What a reader is told: which default, whose choice, or the refusal. */
  says: string
}

/** What a folder of backups holds, read from the directory at the moment somebody asks. */
export interface TheBackupsFolder {
  /** The folder the backups live in, absolute. */
  directory: string
  /** Whether the folder could be listed. Also true when it is not there yet, because no backup has made it, and then it holds none. */
  readable: boolean
  /** Why it could not be listed, when it could not. */
  whyUnreadable: string | null
  /** How many ordinary files are in the folder, not counting the lists of what was left out. */
  count: number
  /** How many backups' files folders (`<name>.files`) are in the folder. */
  filesFolders: number
  /** How many lists of what a backup left out (`<name>.left-out.txt`) are in the folder. */
  leftOutLists: number
  /** The total size in bytes of those files, of everything inside those folders, and of those lists. */
  totalBytes: number
  /** The newest of those files' local stamp, or null because the folder holds none. */
  newestAt: string | null
  /** One sentence about the folder, or the refusal. */
  says: string
}

/** Everything the what-is-kept section draws. */
export interface WhatTheOfficeKeeps {
  /** What a backup is, in one sentence. */
  whatABackupIs: string
  /** The three numbers, in declaration order. */
  numbers: KeptNumberOnScreen[]
  /** The backups folder as it stands at the moment this was read. */
  backups: TheBackupsFolder
}

/** Whether a value that came out of a row is a number the office may store. */
export function isKeptNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= KEPT_NUMBER_LOWEST &&
    value <= KEPT_NUMBER_HIGHEST
  )
}

/** Whether a value is one of the three keys. */
export function isKeptSettingKey(value: unknown): value is KeptSettingKey {
  return typeof value === 'string' && (KEPT_SETTING_KEYS as readonly string[]).includes(value)
}

/**
 * WHAT THE CONTROL SAYS WHEN WHAT WAS TYPED IS NOT A NUMBER THE OFFICE MAY STORE.
 *
 * It is here rather than in the panel so the bounds and the sentence that names them are one fact.
 * The panel calls it; it holds no sentence of its own.
 */
export function keptNumberRangeSays(): string {
  return (
    `Enter a whole number from ${String(KEPT_NUMBER_LOWEST)} to ${String(KEPT_NUMBER_HIGHEST)}, ` +
    'or leave it as it is.'
  )
}

/**
 * A SIZE A PERSON READS.
 *
 * Bytes up to a kilobyte, then one decimal place until the number is large enough that a decimal
 * is noise. Drawn beside a count, never as a sentence.
 */
export function bytesSaid(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit] ?? 'PB'}`
}
