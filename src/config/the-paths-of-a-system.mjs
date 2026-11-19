// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW ONE SYSTEM WRITES A PATH: what an absolute path looks like there, its root, its home, and the folder a
 * program keeps its own local files in. Wave 13t, round 25 (report bknY4s0NBTAT, items 7 and 8).
 *
 * WHY THIS IS ITS OWN MODULE. The checks that ask for an absolute path used to say "begins with /" each in its
 * own words, and Windows writes an absolute path with a drive letter. They all ask here now, so a Windows path
 * is accepted in every place or in none.
 *
 * EVERY ANSWER TAKES THE SYSTEM AS A PARAMETER. A test stands Windows in by naming 'win32'; it never changes
 * `process.platform`, which would make the native parts load another system's binary. Linux and the Mac answer
 * exactly as they did before this module: an absolute path begins with "/".
 *
 * ONLY A DRIVE-LETTER PATH IS ABSOLUTE ON WINDOWS HERE. Windows also has paths that begin with one "\" (on
 * whichever drive is current) and network paths that begin with "\\". The first means a different folder
 * depending on where a program started, which is the reason a relative path is refused. The second has never
 * been asked for. Both are refused in the same words as a relative path.
 */
import { posix, win32 } from 'node:path'

/**
 * THE SYSTEM THIS PROCESS RUNS ON, read here once. Every answer below takes it as its default, so a file that only
 * asks how a path is written does not branch on the platform itself, and this file is
 * the one a port reads for all of it.
 */
export const THIS_PLATFORM = process.platform

/**
 * The path functions of one system: Windows' for 'win32', and the POSIX ones for every other.
 * @param {string} [platform] a value of `process.platform`
 */
export function thePathsOf(platform = THIS_PLATFORM) {
  return platform === 'win32' ? win32 : posix
}

/**
 * Whether `written` is an absolute path on that system: "C:\" or "C:/" and more on Windows, "/" and more elsewhere.
 * @param {string} written
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function isAnAbsolutePath(written, platform = THIS_PLATFORM) {
  return platform === 'win32' ? /^[A-Za-z]:[\\/]/u.test(written) : written.startsWith('/')
}

/**
 * HOW A FULL PATH IS WRITTEN ON THAT SYSTEM, for the sentence that refuses one that is not: "such as
 * C:\Users\<you>\<name>" on Windows, and "starting with /, such as /home/<you>/<name>" on Linux, with /Users on the
 * Mac. The person's own folder is written <you>, so that no example names a folder of somebody's.
 * @param {string} name the last part of the example: the file or folder that is asked for
 * @param {string} [platform] a value of `process.platform`
 * @returns {string}
 */
export function howAFullPathIsWritten(name, platform = THIS_PLATFORM) {
  if (platform === 'win32') return `such as C:\\Users\\<you>\\${name}`
  return `starting with /, such as ${platform === 'darwin' ? '/Users' : '/home'}/<you>/${name}`
}

/**
 * Whether `folder` is the root of a drive on Windows ("C:\") or the root of the machine elsewhere ("/").
 * @param {string} folder a folder with its trailing separators gone, as the callers store it
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function isTheRoot(folder, platform = THIS_PLATFORM) {
  return platform === 'win32' ? /^[A-Za-z]:[\\/]?$/u.test(folder) : folder === '/'
}

/**
 * Two spellings of a folder compared the way that system compares them: Windows ignores case in a path, and
 * Linux and the Mac are compared exactly, as they always were here.
 * @param {string} one
 * @param {string} other
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function theSameSpelling(one, other, platform = THIS_PLATFORM) {
  return platform === 'win32' ? one.toLowerCase() === other.toLowerCase() : one === other
}

/**
 * Two programs' checkouts compared the way the self-check compares them. On Windows one \ or / at the end of either is
 * left out, because the two programs of one installation end the same folder differently there: the session hook
 * writes it with no separator at the end, and the office with a \. Linux and the Mac are compared exactly, as they
 * always were here: both programs already end the folder the same way, and a \ is a character a folder's name may hold.
 * @param {string} one
 * @param {string} other
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function theSameCheckout(one, other, platform = THIS_PLATFORM) {
  if (platform !== 'win32') return one === other
  const withoutTheLastSeparator = (/** @type {string} */ folder) => folder.replace(/[\\/]$/u, '')
  return withoutTheLastSeparator(one) === withoutTheLastSeparator(other)
}

/**
 * THE NAMES IN A PATH, as that system separates them: the strings between its separators, in order.
 *
 * ON WINDOWS BOTH "\" AND "/" SEPARATE NAMES, because Windows reads either one as a folder boundary. On Linux
 * and the Mac a "\" may be part of a name, so only "/" separates there. A first name that is empty is kept,
 * because a path that begins with a separator begins at the root. Every other empty name is dropped, so a
 * doubled separator and a separator at the end are not names.
 *
 * @param {string} path
 * @param {string} [platform] a value of `process.platform`
 * @returns {string[]}
 */
export function theNamesInAPath(path, platform = THIS_PLATFORM) {
  const names = path.split(platform === 'win32' ? /[\\/]/u : '/')
  return names.filter((name, index) => name !== '' || index === 0)
}

/**
 * The environment variable that names the home: USERPROFILE on Windows, HOME on Linux and the Mac.
 * @param {string} [platform] a value of `process.platform`
 * @returns {'USERPROFILE' | 'HOME'}
 */
export function theHomeVariable(platform = THIS_PLATFORM) {
  return platform === 'win32' ? 'USERPROFILE' : 'HOME'
}

/**
 * THE HOME FOLDER A PROGRAM WITH THIS ENVIRONMENT WOULD BE GIVEN, or null when the environment names none.
 *
 * HOME on Linux and the Mac. On Windows it is USERPROFILE, which is where Node's `os.homedir()` looks there,
 * because Windows usually sets no HOME. This is for another program's environment; this process's own home is
 * `os.homedir()`.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} [platform] a value of `process.platform`
 * @returns {string | null}
 */
export function theHomeNamedIn(env, platform = THIS_PLATFORM) {
  const named = env[theHomeVariable(platform)]
  return typeof named === 'string' && named !== '' ? named : null
}

/**
 * WHERE ONE USER'S PROGRAMS KEEP THEIR OWN LOCAL FILES ON WINDOWS: %LOCALAPPDATA%, and the folder Windows
 * gives it by default, AppData\Local under the home, when it is not set. This is Windows' counterpart of
 * XDG_STATE_HOME and its default ~/.local/state, which the mail tool's folder reads on Linux.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} home
 * @returns {string}
 */
export function theLocalAppDataFolder(env, home) {
  const named = env['LOCALAPPDATA']
  return typeof named === 'string' && named !== '' ? named : win32.join(home, 'AppData', 'Local')
}

/**
 * EVERY CANDIDATE ABSOLUTE PATH IN A TEXT, as one system writes them: a pattern for `matchAll`, made new on each call
 * because a global pattern keeps its place. src/server/lib/screening.ts reads it to find paths under the home.
 *
 * ON LINUX AND THE MAC, a "/" not immediately preceded by a letter, digit, underscore or "." — which is what keeps a
 * repository-relative path such as "src/server/lib/bundle.ts" from ever starting a match (every "/" in it follows a
 * letter), and what keeps a path written "../somewhere" from starting one at its first "/" (which follows "."), and
 * greedy enough to swallow the rest of a URL's path after its scheme, so "https://example.com/one/two" is read as the
 * one token "/example.com/one/two" — which does not start with the home directory — rather than as a path under it.
 *
 * ON WINDOWS, a drive letter, a colon and a separator, "C:\work\notes.txt" or "C:/work", where the letter
 * does not follow a letter, digit, underscore or "." either.
 *
 * @param {string} [platform] a value of `process.platform`
 * @returns {RegExp}
 */
export function theAbsolutePathsInAText(platform = THIS_PLATFORM) {
  return platform === 'win32' ? /(?<![\w.])[A-Za-z]:[\\/][^\s'"`<>|)\]}]*/g : /(?<![\w.])\/[^\s'"`<>|)\]}]+/g
}

/**
 * WHETHER `candidate` IS AN ABSOLUTE PATH AT OR UNDER `folder`, judged by spelling alone.
 *
 * Resolved lexically first — `node:path`'s `resolve`, which touches no file and asks the operating system nothing — so
 * a path written as "<folder>/one/../../etc/passwd" is judged as the "/etc/passwd" it really names rather than by the
 * folder it happens to start with. Windows reads "/" as "\" too, and ignores case, because it reads "C:\WORK\Notes"
 * as the same folder as "C:\work\notes".
 *
 * @param {string} candidate
 * @param {string} folder
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function isAtOrUnder(candidate, folder, platform = THIS_PLATFORM) {
  if (platform === 'win32') {
    if (!isAnAbsolutePath(candidate, platform)) return false
    const resolved = win32.resolve(candidate).toLowerCase()
    const home = win32.resolve(folder).replace(/\\$/u, '').toLowerCase()
    return resolved === home || resolved.startsWith(`${home}\\`)
  }
  if (!candidate.startsWith('/')) return false
  const resolved = posix.resolve(candidate)
  const home = folder.endsWith('/') && folder !== '/' ? folder.slice(0, -1) : folder
  return resolved === home || resolved.startsWith(`${home}/`)
}

/**
 * WHETHER A FILE'S MODE SAYS WHO MAY READ IT on that system. On Linux and the Mac it does. On Windows Node reports every
 * file as mode 666, and who may read a file is kept in its access list instead, which nothing in Mole Office reads.
 * @param {string} [platform] a value of `process.platform`
 * @returns {boolean}
 */
export function aFileModeSaysWhoMayRead(platform = THIS_PLATFORM) {
  return platform !== 'win32'
}
