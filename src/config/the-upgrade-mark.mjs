// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE MARK A STABLE UPGRADE KEEPS BESIDE THE DATABASE WHILE THE OFFICE IS CLOSED.
 *
 * tools/stable/upgrade-stable.criteria.md, "The mark, the start refusals and the resume", says why. A closed upgrade
 * writes it before it stops the first ordinary process, and clears it only when a verified generation opens. While it
 * is there, the server, tools/serve-dev.mjs and the service command (which the boot unit runs) refuse to start, so a
 * restart after a crash never serves a database nothing has verified. The refusal says which upgrade left the mark and
 * the command that resumes it. A start for the release check is not refused: the upgrade makes that start itself.
 *
 * IT READS AND WRITES FILES ONLY. A start meets this check before it opens the database or takes a port.
 */

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The mark's name: the database's own path and this ending. */
export const THE_UPGRADE_MARK_ENDING = '.upgrade-closed'

/**
 * @typedef {{ version: 1, from: string, to: string, tag: string, closedAt: string, lock: string, resume: string }} TheUpgradeMark
 */

/** @param {string} database */
export function theUpgradeMarkPath(database) {
  return database + THE_UPGRADE_MARK_ENDING
}

/**
 * The one command that goes on from a crashed upgrade: it resumes it, or rolls it back when the new version fails.
 * @param {string} stableCheckout
 * @param {string} lock
 */
export function theResumeCommand(stableCheckout, lock) {
  return `node ${join(stableCheckout, 'tools/stable/upgrade-stable.mjs')} --resume ${lock}`
}

/** @param {string} path */
function syncFolder(path) {
  const fd = openSync(path, 'r')
  try { fsyncSync(fd) } finally { closeSync(fd) }
}

/**
 * WRITTEN WHOLE: into a file beside it, synced, then renamed over the name a start reads.
 * @param {string} database
 * @param {Omit<TheUpgradeMark, 'version'>} mark
 */
export function writeTheUpgradeMark(database, mark) {
  const path = theUpgradeMarkPath(database), writing = `${path}.writing`
  const fd = openSync(writing, 'w', 0o600)
  try { writeSync(fd, JSON.stringify({ version: 1, ...mark }) + '\n'); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(writing, path)
  syncFolder(dirname(path))
  return path
}

/** @param {string} database */
export function clearTheUpgradeMark(database) {
  const path = theUpgradeMarkPath(database)
  rmSync(path, { force: true })
  syncFolder(dirname(path))
}

const FIELDS = ['version', 'from', 'to', 'tag', 'closedAt', 'lock', 'resume']

/**
 * @param {string} database
 * @returns {null | { mark: TheUpgradeMark } | { unreadable: string }}
 */
export function readTheUpgradeMark(database) {
  const path = theUpgradeMarkPath(database)
  if (!existsSync(path)) return null
  try {
    const mark = JSON.parse(readFileSync(path, 'utf8'))
    if (mark === null || typeof mark !== 'object' || Array.isArray(mark) || Object.keys(mark).length !== FIELDS.length || mark.version !== 1
      || FIELDS.slice(1).some((field) => typeof mark[field] !== 'string' || mark[field] === '')) return { unreadable: 'it is not a mark this version writes' }
    return { mark }
  } catch (error) {
    return { unreadable: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * WHY A START MAY NOT SERVE THIS DATABASE NOW, in one sentence, or null when no upgrade holds it closed.
 *
 * A MARK THAT CANNOT BE READ is named with the stable upgrade's own lock, in the Git folder of the stable checkout the
 * start's settings pair with, never with a lock in the checkout the start runs from: the boot unit runs the development
 * checkout's service command. Both checkouts read the same settings, so a start from either names the same lock. A start
 * whose settings pair with none is told so, and no lock is guessed for it.
 *
 * A RELEASE CHECK AND THIS MARK. `release-check` is the upgrade's own start on the closed database and
 * is the one mode let past: the upgrade makes that start itself. `release-check-live` IS held: a live trial of another
 * version on a database an upgrade has closed would mean something has gone wrong, so it is refused like an ordinary
 * start rather than reading a file the upgrade is part-way through. Only `release-check` is let through.
 *
 * @param {string} database the database the start would open
 * @param {string | null} stableCheckout the stable checkout the start's settings pair with (theStableCheckoutNamedIn in
 *   src/config/settings.mjs), or null when they pair with none
 * @param {string | undefined} mode the start mode; the upgrade's own `release-check` start is not refused, while
 *   `release-check-live` is held with every ordinary start
 * @returns {string | null}
 */
export function whyAnUpgradeKeepsTheOfficeClosed(database, stableCheckout, mode) {
  if (mode === 'release-check') return null
  const read = readTheUpgradeMark(database)
  if (read === null) return null
  if ('unreadable' in read) {
    const unread = `The office's database ${database} stays closed because its upgrade mark ${theUpgradeMarkPath(database)} cannot be read (${read.unreadable})`
    if (stableCheckout === null) {
      return `${unread}; the settings of this start pair with no stable checkout, so the upgrade lock it belongs with cannot be named here: that lock is stable-upgrade.lock in the Git folder of the stable checkout the upgrade ran on, and ${theResumeCommand('<that stable checkout>', '<that lock>')} resumes that upgrade or rolls it back.`
    }
    const lock = join(stableCheckout, '.git', 'stable-upgrade.lock')
    return `${unread}; it belongs with the upgrade lock ${lock}, and ${theResumeCommand(stableCheckout, lock)} resumes that upgrade or rolls it back.`
  }
  const { from, to, tag, closedAt, resume } = read.mark
  return `The office's database ${database} stays closed because the stable upgrade from ${from} to ${to} (tag ${tag}) closed it at ${closedAt} and did not finish; ${resume} resumes it, or rolls it back if the new version cannot be verified.`
}
