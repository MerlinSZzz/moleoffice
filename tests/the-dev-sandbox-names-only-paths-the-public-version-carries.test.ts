// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEV SANDBOX NAMES ONLY PATHS THE PUBLIC VERSION CARRIES: sandboxes/mole-office-dev/sandbox.json.
 *
 * The public version carries the dev sandbox. Its sandbox.json offered an agent a message tool under design/, and named
 * a file under design/ as the place of the secretary's card. The public version leaves design/ out, and that card's
 * file was not in the repository at all. So an agent in a sandbox made from the public tree was told to run a file
 * that is not there.
 *
 * The file is read whole, as text, and not as a list of known keys, so a path written into any field is checked. A
 * word is a run of text between white space, quotes, backticks and round brackets, with a closing `.`, `,`, `:` or `;`
 * taken off. It is taken as a path when it begins with a folder the repository tracks at its top and a slash, as
 * `tools/` does. The folders are read from git, not written here. A bare folder name is not taken, because "out",
 * "public" and "docs" are English words.
 *
 *   1. Every path the file names is there in the checkout, and it names at least one.
 *   2. The public version leaves none of them out, as scripts/clean-version.mjs decides. A path naming a folder is
 *      asked with and without its closing slash. The public version leaves that tool out, so there this case is
 *      taken out and says why.
 *
 * The Dockerfile beside the file is not read here.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_FILE = 'sandboxes/mole-office-dev/sandbox.json'
const text = readFileSync(join(REPO, THE_FILE), 'utf8')

/** The folders the repository tracks at its top: the first part of every tracked path that holds a slash. */
const TOP_FOLDERS = new Set(
  execFileSync('git', ['ls-files', '-z', '--cached'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((path) => path.includes('/'))
    .map((path) => path.slice(0, path.indexOf('/'))),
)

/** Every path the file names: each word that begins with a top folder and a slash, once. */
const PATHS = [
  ...new Set(
    text
      .split(/[\s'"`()]+/)
      .map((word) => word.replace(/[.,:;]+$/, ''))
      .filter((word) => word.includes('/') && TOP_FOLDERS.has(word.slice(0, word.indexOf('/')))),
  ),
]

/** Whether `path` names a folder: it ends with a slash, or a folder is there by that name. */
const namesAFolder = (path: string) => path.endsWith('/') || (existsSync(join(REPO, path)) && statSync(join(REPO, path)).isDirectory())

describe(`the paths ${THE_FILE} names`, () => {
  it('are each there in the checkout', () => {
    expect(PATHS.length, `${THE_FILE} was read for paths, and at least one was taken`).toBeGreaterThan(0)
    expect(PATHS.filter((path) => !existsSync(join(REPO, path)))).toEqual([])
  })

  it('are none of them left out of the public version', async (context) => {
    if (isTheCleanVersion(REPO)) {
      const reason =
        'This checkout is the clean version, and it leaves scripts/clean-version.mjs out, so what that tool leaves out cannot be asked here. ' +
        'The case before this one shows that every path the file names is there, which in the clean version means it was carried.'
      context.task.meta.takenOut = reason
      context.skip(`taken out: ${reason}`)
      return
    }
    // By a path worked out here, as other tests do: the clean version leaves the tool out, and its type check would
    // refuse a literal one.
    const tool = await import(pathToFileURL(join(REPO, 'scripts', 'clean-version.mjs')).href)
    const theRuleLeavingOut = Reflect.get(tool, 'theRuleLeavingOut') as (path: string) => { path: string; why: string } | null
    const asked = PATHS.flatMap((path) => (namesAFolder(path) ? [path.replace(/\/$/, ''), path.replace(/\/?$/, '/')] : [path]))
    const leftOut = asked.flatMap((path) => {
      const rule = theRuleLeavingOut(path)
      return rule === null ? [] : [`${path}: left out by the entry ${rule.path}, because ${rule.why}`]
    })
    expect(leftOut).toEqual([])
  }, 60_000)
})
