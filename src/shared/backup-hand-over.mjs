// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE BACKUP HAND-OVER TO THE LAB SERVER: the names the door, the host tool and its recovery share.
 *
 * The door files a host job naming THE_HAND_OVER_TOOL with one argument, THE_HAND_OVER_ARGUMENT,
 * holding the backup's own name. The registered host tool reads the same names, so the door, the
 * runner and the tool cannot drift apart.
 *
 * THIS FILE IS JAVASCRIPT ON PURPOSE. The host tool is a program the runner starts directly, with
 * the person's own Node, and it cannot read TypeScript. So the names live here with `// @ts-check`,
 * and src/shared/backup-hand-over.ts re-exports them for the server.
 */

/** The registered host tool that hands a backup to the lab server. */
export const THE_HAND_OVER_TOOL = 'hand-over-a-backup'

/** The one argument that tool takes: the backup's own name, and nothing else. */
export const THE_HAND_OVER_ARGUMENT = 'backup'

/** The folder beside the backups folder, never inside it, that holds one hand-over's hard links. */
export const THE_HANDING_OVER_FOLDER = 'handover-staging'

/** The manifest the tool writes into the folder before the upload, so it is in the snapshot. */
export const THE_HAND_OVER_MANIFEST = 'MANIFEST.json'

/** The journal the tool fsyncs into the runner's own job folder before the upload. */
export const THE_HAND_OVER_JOURNAL = 'HANDOVER-JOURNAL.json'

/** The whole job is bounded at two hours, the tool's declaration and the runner's limit agreeing. */
export const THE_HAND_OVER_TIME_LIMIT_SECONDS = 2 * 60 * 60

/**
 * THE STAMP A BACKUP'S NAME ENDS WITH, which the server's name and the job folder are built from.
 * The name is the door's or the command's own, and the tool refuses a name of any other shape.
 */
const A_BACKUP_NAME = /^mole-office-(\d{8}-\d{6})(?:-(?:taken-at-the-door|before-the-update))?(?:-(?:[2-9]|[1-9]\d+))?\.db$/

/** Whether a name is one of this office's backups, and not a path or a substituted name. @param {unknown} name */
export function isABackupName(name) {
  return typeof name === 'string' && A_BACKUP_NAME.test(name)
}

/** The backup's own id: its name without the `.db`, which the folder and the server's name start from. @param {string} name */
export function theBackupId(name) {
  return name.endsWith('.db') ? name.slice(0, -'.db'.length) : name
}

/**
 * THE NAME THIS HAND-OVER HAS ON THE LAB SERVER. It is built from the backup's own id and date and
 * from nothing the request says, so every hand-over has a prefix of its own and no --link-dest to
 * another snapshot. @param {string} name
 */
export function theHandOverServerName(name) {
  return `office-handover-${theBackupId(name)}`
}

/**
 * The three things beside a backup: its name without `.db` starts the files folder and the
 * left-out list, exactly as src/shared/what-is-kept.ts says it. The host tool cannot read
 * TypeScript, so the rule is stated here too; a test holds the two answers together.
 * @param {string} copy
 */
function stemOfACopy(copy) {
  return copy.endsWith('.db') ? copy.slice(0, -'.db'.length) : copy
}

/** The folder holding a backup's copy of the report files and message pictures. @param {string} copy */
export function theFilesFolderOf(copy) {
  return `${stemOfACopy(copy)}.files`
}

/** The text file listing the files a backup left out because they were over the line. @param {string} copy */
export function theLeftOutListOf(copy) {
  return `${stemOfACopy(copy)}.left-out.txt`
}

/**
 * THE OWNER'S OWN TIME ZONE: the Vault window is their day, not the process's (chapter 4 rule 8).
 * The host runner gives every tool `TZ=UTC`, so the process cannot be asked for it.
 */
export const THE_OWNERS_TIME_ZONE = 'Europe/London'

/** The owner's wall clock, read as numbers; `hourCycle: 'h23'` makes midnight 00, never 24. */
const THE_OWNERS_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: THE_OWNERS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/**
 * THE WALL-CLOCK NUMBERS `at` READS ON THE OWNER'S CLOCK. `formatToParts` is used rather than a
 * formatted string, so no locale's separators can be mistaken for a number.
 * @param {Date} at
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
function theOwnersWallClock(at) {
  /** @type {Record<string, number>} */
  const numbers = {}
  for (const part of THE_OWNERS_CLOCK.formatToParts(at)) {
    if (part.type !== 'literal') numbers[part.type] = Number(part.value)
  }
  return {
    year: numbers['year'] ?? 0,
    month: numbers['month'] ?? 0,
    day: numbers['day'] ?? 0,
    hour: numbers['hour'] ?? 0,
    minute: numbers['minute'] ?? 0,
    second: numbers['second'] ?? 0,
  }
}

/**
 * THE INSTANT AT WHICH THE OWNER'S CLOCK READS THESE WALL-CLOCK NUMBERS. It starts with a UTC guess,
 * reads that guess back on the owner's clock, and corrects it by how wrong the reading was; two turns
 * are enough except across a DST change, and four are allowed.
 * @param {{ year: number, month: number, day: number, hour: number, minute: number, second: number }} wanted
 */
function theInstantOfTheOwnersWallClock(wanted) {
  const wantedAsUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second)
  let guess = wantedAsUtc
  for (let turn = 0; turn < 4; turn++) {
    const reads = theOwnersWallClock(new Date(guess))
    const readsAsUtc = Date.UTC(reads.year, reads.month - 1, reads.day, reads.hour, reads.minute, reads.second)
    const wrongBy = wantedAsUtc - readsAsUtc
    if (wrongBy === 0) break
    guess += wrongBy
  }
  return guess
}

/**
 * THE VAULT PUSH'S COPY, 01:00 TO 02:45 ON THE OWNER'S OWN CLOCK, as milliseconds to wait from `now`
 * before the hand-over may start. The window is the owner's day (chapter 4 rule 8) in
 * `THE_OWNERS_TIME_ZONE`, not the process's time zone: the host runner gives every tool `TZ=UTC`, and
 * in British Summer Time 01:00 London is 00:00 UTC. Outside the window the answer is 0. The wait is
 * the whole reason the tool may start after 02:45 rather than run beside it. @param {Date} now
 */
export function theWaitForTheVaultWindow(now) {
  const reads = theOwnersWallClock(now)
  const at = reads.hour * 3_600 + reads.minute * 60 + reads.second
  const start = 1 * 3_600
  const end = (2 * 60 + 45) * 60
  if (at < start || at >= end) return 0
  const endOfTheWindow = theInstantOfTheOwnersWallClock({ ...reads, hour: 2, minute: 45, second: 0 })
  return endOfTheWindow - now.getTime()
}
