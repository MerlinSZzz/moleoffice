// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A BACKUP UNDER THE FIRST NAME NOTHING HAS, AND ITS REMOVAL WHEN THE PRESS IS REFUSED (wave 13t, rounds W24 and W26).
 *
 * Every press that changes a file the person keeps copies the file first: the entry press's settings file and its
 * AGENTS.md (src/config/install-the-entry.mjs), and the systemd units of the mail tool (src/config/the-mail-tool.mjs)
 * and of start at login (src/config/start-at-login.mjs). The copy goes to `<file>.mole-office-backup`, then `-2`, `-3`
 * and on, and only where nothing is. So no press writes over a backup, and the person's first backup stays as it was.
 *
 * EACH ACT HAS TWO FORMS. The entry press runs on the server's thread, so it copies and removes by promises
 * and leaves the thread free. The other presses copy by the calls that hold the thread until they are done. Both forms
 * take their names from `theNameAt` and stop on the same errors.
 */
import { constants, copyFileSync, unlinkSync } from 'node:fs'
import { copyFile, unlink } from 'node:fs/promises'

/**
 * The name the copy takes at try `n`: `first`, then `first-2`, `first-3` and on.
 * @param {string} first
 * @param {number} n
 */
const theNameAt = (first, n) => (n === 1 ? first : `${first}-${String(n)}`)

/**
 * Whether a copy failed only because its name is taken, by a file, a folder or a link. Then the next name is tried.
 * @param {unknown} err
 */
const theNameIsTaken = (err) => /** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST'

/**
 * The sentence a refusal adds when the copy could not be removed.
 * @param {string} copy
 * @param {unknown} err
 */
const theCopyIsStillThere = (copy, err) => ` The copy of it this press made could not be removed, and is still at ${copy} (${String(err)}).`

/**
 * Copy `source` to `first`, or to the first of `first-2`, `first-3` and on that nothing has. A name that is taken, by a
 * file, a folder or a link, moves the copy to the next. Any other failure stops it.
 * @param {string} source
 * @param {string} first
 * @returns {{ path: string } | { path: string, failed: unknown }} where the copy is, or the name it failed at and why
 */
export function copyUnderAFreeName(source, first) {
  for (let n = 1; ; n += 1) {
    const path = theNameAt(first, n)
    try {
      copyFileSync(source, path, constants.COPYFILE_EXCL)
      return { path }
    } catch (err) {
      if (!theNameIsTaken(err)) return { path, failed: err }
    }
  }
}

/**
 * `copyUnderAFreeName`, by promises, so the thread is free while the file is copied.
 * @param {string} source
 * @param {string} first
 * @returns {Promise<{ path: string } | { path: string, failed: unknown }>}
 */
export async function copyUnderAFreeNameWithoutHoldingTheThread(source, first) {
  for (let n = 1; ; n += 1) {
    const path = theNameAt(first, n)
    try {
      await copyFile(source, path, constants.COPYFILE_EXCL)
      return { path }
    } catch (err) {
      if (!theNameIsTaken(err)) return { path, failed: err }
    }
  }
}

/**
 * Remove the copy a refused press made. It was made where nothing was, so it is the press's own to remove.
 * @param {string} copy
 * @returns {string} nothing when the copy is gone, or the sentence a refusal adds to say where it still is
 */
export function takeTheCopyAway(copy) {
  try {
    unlinkSync(copy)
    return ''
  } catch (err) {
    return theCopyIsStillThere(copy, err)
  }
}

/**
 * `takeTheCopyAway`, by a promise, so the thread is free while the copy is removed.
 * @param {string} copy
 * @returns {Promise<string>}
 */
export async function takeTheCopyAwayWithoutHoldingTheThread(copy) {
  try {
    await unlink(copy)
    return ''
  } catch (err) {
    return theCopyIsStillThere(copy, err)
  }
}
