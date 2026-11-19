// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE FILES ONE PROGRAM IS BUILT FROM HOLD, AS ONE SHORT DIGEST.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The owner's report of 26 October 2026 (wave 13y round 87). The line saying the page is behind the
 * checkout came back after every load, a forced reload too. The page had been built at 13:28:51 from
 * the commit the office was serving, and files it is built from were touched at 13:31:31 without being
 * changed. The page was judged by file times alone, so it was "behind" for as long as that build
 * was served, and a reload serves the same build.
 *
 * A time says when a file was last written. It does not say whether the file holds anything else: a
 * checkout of another branch and back, a copy, a formatter that changes nothing and a touch all move
 * it. What the page was built from is the contents, so the contents decide.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The files are the ones src/config/import-graph.mjs walks from the entry, the same set the times are
 * read from. For each file, in the order of their paths: its path relative to the checkout, a NUL
 * character, the sha256 of its bytes, and a newline. The digest is the sha256 of all of that, cut to
 * its first 16 hexadecimal characters. The path is in it, so a renamed file changes it, and so does a
 * file that joins or leaves the set.
 *
 * The build records it (`serveTheSourceStamp` in vite.config.ts) and the server works it out again
 * from the checkout as it is now (`freshness` in src/server/lib/runtime.ts). The two are equal when
 * the files hold what the build read. The build records it twice, from the one digest: in the page,
 * which judges itself by it, and in THE_RECORD_OF_WHAT_A_BUILD_READ beside the page, which the
 * server's verdict on the built page reads (wave 13y round 91, item 11c).
 *
 * ---------------------------------------------------------------------------------------
 * EVERY FILE IS READ FOR EVERY DIGEST
 * ---------------------------------------------------------------------------------------
 *
 * Measured in wave 13y round 87 on this checkout: 660 files, 19 MB, 10 to 16 ms for the whole digest
 * in a warm process. The server works it out on its look at the machine, every 15 seconds while a
 * page is open, and on each read of the runtime record, which takes far longer than that on its own.
 *
 * A digest kept for each file by its times and size would miss two writes of the same size within
 * one tick of the file system's clock, and that is the fault the times have.
 *
 * A FILE THAT CANNOT BE READ IS AN ERROR, thrown with the file's name. A digest of the files that
 * could be read is a digest of another program, and it would tell the page that nothing changed when
 * nobody knows.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { theFilesBuiltFrom } from './import-graph.mjs'
import { REPO_ROOT } from './settings.mjs'

/**
 * THE DIGEST OF WHAT THE PROGRAM AT `entry` IS BUILT FROM, AND HOW MANY FILES THAT IS.
 *
 * @param {string} entry the entry file, relative to the checkout
 * @param {string} [root] the checkout
 * @returns {{ digest: string, files: number }}
 */
export function digestOfTheFilesBuiltFrom(entry, root = REPO_ROOT) {
  const { files } = theFilesBuiltFrom(entry, root)
  const all = createHash('sha256')
  for (const file of [...files].sort()) {
    let sha256
    try {
      sha256 = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')
    } catch (err) {
      throw new Error(
        `The contents of ${file}, one of the files ${entry} is built from, could not be read ` +
          `(${err instanceof Error ? err.message : String(err)}), so what those files hold is not known.`,
        { cause: err },
      )
    }
    all.update(`${file}\0${sha256}\n`)
  }
  return { digest: all.digest('hex').slice(0, 16), files: files.length }
}

/** THE FILE A BUILD WRITES WHAT IT READ INTO, in the built page's own folder, beside its stamp. */
export const THE_RECORD_OF_WHAT_A_BUILD_READ = 'content-digest.json'

/**
 * WHAT A BUILD RECORDED THAT THE FILES IT READ HELD, read back from the built page's folder.
 *
 * `none` is a build that recorded nothing, as every build before wave 13y round 91 did. A file that is
 * there and cannot be read is `unreadable`, with why, and never read as a digest.
 *
 * @param {string} webDir the built page's folder
 * @returns {{ state: 'none' } | { state: 'unreadable', why: string } | { state: 'read', digest: string }}
 */
export function readWhatABuildRead(webDir) {
  const path = join(webDir, THE_RECORD_OF_WHAT_A_BUILD_READ)
  if (!existsSync(path)) return { state: 'none' }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    return { state: 'unreadable', why: `${path} could not be read as JSON (${err instanceof Error ? err.message : String(err)})` }
  }
  const digest = parsed !== null && typeof parsed === 'object' ? /** @type {Record<string, unknown>} */ (parsed).contentDigest : undefined
  if (typeof digest !== 'string' || !/^[0-9a-f]{16}$/.test(digest)) {
    return { state: 'unreadable', why: `${path} does not hold a digest of 16 hexadecimal characters` }
  }
  return { state: 'read', digest }
}
