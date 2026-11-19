// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE FOLDER A DURABLE AGENT'S SESSIONS START IN, AND THE ONE RULE FOR HOW IT IS STORED.
 *
 * Part (c) of a decision says registering a durable agent records the folder its sessions start in, so the session hook
 * can name the agent when neither the session's environment nor a `.env` does. The folder is a
 * field on the `agent` record, `startFolder`.
 *
 * WHY THIS IS ITS OWN MODULE. Two files need the same answer and neither may import the other:
 * `src/server/lib/records.ts` checks the field on every write path, and
 * `src/server/lib/participants.ts` normalises what a door was handed and looks agents up by folder.
 * `participants.ts` already imports `records.ts`, so the rule cannot live in either of them without
 * a cycle. One fact is worked out in one place, which is this file.
 *
 * LOOSE INPUT AT THE DOOR, STRICT STORAGE, AND THE STORED FORM SHOWN BACK. A person or a tool may
 * write `/srv/work/` with a trailing slash; this answers the folder as it is stored, with the
 * trailing slashes gone, and the registration reply prints that stored form back. The check on the
 * record itself refuses anything that is not already in this form, so there is exactly one spelling
 * of one folder in the corpus.
 *
 * WHAT IS REFUSED, AND WHY EACH IS. A relative path means nothing to a hook that runs in some other
 * directory. `.` and `..` in the middle of a path make two spellings of one folder, and the match is
 * on the spelling. The root of the machine and a home folder are refused on the answer to open
 * question 14: a start folder is compared against the directory a session started in, and `/` or a
 * home folder would match nearly every session on the machine and hand them somebody else's name.
 *
 * NO SYMLINK IS FOLLOWED AND NOTHING IS ASKED ABOUT WHETHER THE FOLDER EXISTS. The answer to
 * open question 10: the match is on the exact folder after normalising, because the hook is handed
 * the directory Claude Code says the session started in and that is a spelling, not a real location.
 * A files area resolves its folders (`src/config/files-area.mjs`) because a file has to be found on
 * disk; a start folder is only ever compared with another spelling. The folder may also be on a
 * machine this office is not running on, so an existence check here would refuse a correct answer.
 */
import { homedir } from 'node:os'
import { readdirSync } from 'node:fs'
import { whereTheHomesAre } from './files-area.mjs'
import { isAnAbsolutePath, isTheRoot, theSameSpelling, thePathsOf } from './the-paths-of-a-system.mjs'

/**
 * A folder with its trailing slashes gone, and `/` left as `/` so the root is refused as the root. On Windows a
 * backslash is a separator too, and a drive's root keeps its one backslash: "C:\" stays "C:\".
 * @param {string} written
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {string}
 */
function trailingSlashesGone(written, platform = process.platform) {
  if (platform === 'win32') {
    const cut = written.replace(/[\\/]+$/u, '')
    return /^[A-Za-z]:$/u.test(cut) ? `${cut}\\` : cut
  }
  const cut = written.replace(/\/+$/u, '')
  return cut === '' ? '/' : cut
}

/**
 * THE HOMES A START FOLDER MAY NOT BE, as spellings rather than as real locations.
 *
 * Every folder directly under the folder homes are made in (/home on Linux, /Users on macOS, C:\Users on
 * Windows), root's home where the system has one, and the home this process runs in; `whereTheHomesAre` in
 * src/config/files-area.mjs says which.
 * `theHomes` there answers the same folders with every link followed, because a files area is about
 * where a file really is; this one is about what a folder is called, so nothing is resolved. A machine
 * with no folder of homes answers the other two.
 *
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @param {string} [home] the home this process runs in, `os.homedir()` unless a test names another
 * @param {Record<string, string | undefined>} [env] where Windows' folder of homes is read from
 * @returns {string[]}
 */
export function theHomeFolderSpellings(platform = process.platform, home = homedir(), env = process.env) {
  const where = whereTheHomesAre(platform, env)
  const homes = new Set(where.root === null ? [home] : [where.root, home])
  if (where.under !== null) {
    try {
      for (const name of readdirSync(where.under)) homes.add(thePathsOf(platform).join(where.under, name))
    } catch {
      // No folder of homes on this machine: the other two stand.
    }
  }
  return [...homes].filter((one) => isAnAbsolutePath(one, platform)).map((one) => trailingSlashesGone(one, platform))
}

/**
 * ONE START FOLDER, AS IT IS STORED, OR THE REASON IT IS REFUSED.
 *
 * `folder` is the folder to store and `because` is null; or `folder` is null and `because` is one
 * plain sentence saying what is wrong with what was written. The sentence is written here, once, so
 * the registration door, the change door and the record check all refuse in the same words.
 *
 * NOTHING HERE THROWS. This is plain JavaScript and the office's `PanelError` is TypeScript, so each
 * caller wraps the sentence in the refusal its own door answers with.
 *
 * ON WINDOWS a start folder begins with a drive letter, "C:\work", and is written with backslashes; the root it
 * refuses is a drive's, and a home is matched whatever its case, because Windows reads "C:\USERS\owner" as the
 * same folder. Linux and the Mac answer as they always did.
 *
 * @param {unknown} written what a caller wrote
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @param {string[]} [homes] the home folders' spellings, `theHomeFolderSpellings(platform)` unless a test names others
 * @returns {{ folder: string | null, because: string | null }}
 */
export function theStartFolderAsItIsStored(written, platform = process.platform, homes = undefined) {
  /** @param {string} because @returns {{ folder: null, because: string }} */
  const refuse = (because) => ({ folder: null, because })
  if (typeof written !== 'string') {
    return refuse('A start folder is written as text, and this is not text.')
  }
  const paths = thePathsOf(platform)
  const folder = trailingSlashesGone(written.trim(), platform)
  if (folder === '') {
    return refuse('A start folder was asked for and nothing was written. Leave it out rather than sending an empty one.')
  }
  if (!isAnAbsolutePath(folder, platform)) {
    return refuse(
      `"${folder}" is not an absolute path. A start folder is compared with the directory the session hook says a ` +
        'session started in, and a relative path means nothing to a hook running in some other directory. Write it ' +
        `from the root, beginning with ${platform === 'win32' ? 'a drive letter, as "C:\\"' : '"/"'}.`,
    )
  }
  if (paths.normalize(folder) !== folder || folder.split(platform === 'win32' ? /[\\/]/u : '/').includes('..')) {
    return refuse(
      `"${folder}" is not written plainly. A folder is matched on its exact spelling, so "." or ".." in the middle ` +
        `of one would make two spellings of one folder. Write it as "${trailingSlashesGone(paths.normalize(folder), platform)}".`,
    )
  }
  if (isTheRoot(folder, platform)) {
    return refuse(
      'The root of the machine is not a start folder. Every session on this machine started somewhere under it, so ' +
        "the hook would hand this agent's name to sessions that are nobody's but their own.",
    )
  }
  if ((homes ?? theHomeFolderSpellings(platform)).some((home) => theSameSpelling(home, folder, platform))) {
    return refuse(
      `"${folder}" is a home folder on this machine, and a home folder is not a start folder. Nearly every session ` +
        "a person starts starts in one, so the hook would hand this agent's name to sessions that are not its. Name " +
        'the folder the work is in instead.',
    )
  }
  return { folder, because: null }
}

/**
 * WHETHER TWO FOLDERS ARE THE SAME START FOLDER: the exact spelling, after trailing slashes go.
 *
 * The answer to open question 10. A subfolder is NOT a match and no link is followed. The reason
 * is the danger this piece is built against: one folder can hold the session records of several
 * conversations and only one of them is the registered agent's, so a rule that matched anything
 * under a registered folder would name other people's sessions.
 *
 * @param {string} registered the folder stored on an agent record
 * @param {string} started the directory a session says it started in
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {boolean}
 */
export function theSameStartFolder(registered, started, platform = process.platform) {
  return theSameSpelling(trailingSlashesGone(registered.trim(), platform), trailingSlashesGone(started.trim(), platform), platform)
}
