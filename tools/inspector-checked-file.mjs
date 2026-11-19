// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE INSPECTOR READS A FILE IN A CHECK'S HOME ONLY AS THE FILE IT CHECKED, THROUGH THE ONE DESCRIPTOR IT OPENED.
 *
 * A dsh check's transcript is in the check's private home, where the model has a shell, and the inspector reads it on
 * the host (theDshChecksTranscript in tools/the-inspector.mjs). Review OcaFB-eOWjWp, point 1, asks that the
 * file read is the file that was looked at, even when a folder on the way is swapped for a link after the look.
 *
 * LINUX ONLY, AND KEPT OUT OF src/ FOR THAT REASON. Only /proc/self/fd can say where an open descriptor really is, and
 * /proc is Linux's. A7's rule lets nothing under src/ read a kernel filesystem outside the
 * OS layer, so that a port to another system finds every such read in one place. The rule leaves tools/ out on
 * purpose. Only the inspector reads a check's transcript, and a dsh check runs in a Docker check view on Linux, so this
 * read is here (2yXdQzePCu05). Where /proc/self/fd cannot be asked, nothing is read and the answer says why. It
 * never guesses where the file is.
 */

import { closeSync, constants, fstatSync, openSync, readlinkSync, readSync } from 'node:fs'
import { sep } from 'node:path'

import { codeOf, THE_MOST_OF_A_LOG_READ } from '../src/config/a-runs-own-log.mjs'

/**
 * THE BYTES OF THE FILE THAT WAS CHECKED, read whole through the one descriptor it is opened as, or why it was not read
 * (condition 5 of src/config/a-runs-own-log.mjs, review OcaFB-eOWjWp, point 1). O_NOFOLLOW guards only the
 * last name, so a folder on the way can be swapped for a link after the caller looked. So the opened file must be the
 * one `checked` describes (its device and inode), and /proc/self/fd must say it is inside `realRoot`. `realRoot` is
 * the real path of the folder the file must be in, worked out by the caller from nothing the file's writer can change.
 * Linux only: with no /proc/self/fd, nothing is read.
 * @param {string} path
 * @param {{ dev: number, ino: number }} checked
 * @param {string} realRoot
 * @param {{ most?: number }} [limits]
 * @returns {{ ok: true, bytes: Buffer } | { ok: false, why: string }}
 */
export function theFileThatWasChecked(path, checked, realRoot, { most = THE_MOST_OF_A_LOG_READ } = {}) {
  let fd
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    return { ok: false, why: `it could not be opened (${codeOf(error)})` }
  }
  try {
    const opened = fstatSync(fd)
    if (opened.dev !== checked.dev || opened.ino !== checked.ino) return { ok: false, why: 'the file opened is not the file that was checked, so it was not read' }
    let where
    try {
      where = readlinkSync(`/proc/self/fd/${String(fd)}`)
    } catch (error) {
      return { ok: false, why: `where the opened file is could not be asked of /proc/self/fd (${codeOf(error)}), so it was not read` }
    }
    if (!where.startsWith(realRoot + sep)) return { ok: false, why: 'the file opened is outside its own folder, so it was not read' }
    if (!opened.isFile()) return { ok: false, why: 'it is not a regular file' }
    if (opened.size > most) return { ok: false, why: `it is ${String(opened.size)} bytes, more than the ${String(most)} this tool reads` }
    const bytes = Buffer.alloc(opened.size)
    let at = 0
    while (at < bytes.length) {
      const got = readSync(fd, bytes, at, bytes.length - at, at)
      if (got === 0) break
      at += got
    }
    return { ok: true, bytes: bytes.subarray(0, at) }
  } catch (error) {
    return { ok: false, why: `it could not be read (${codeOf(error)})` }
  } finally {
    closeSync(fd)
  }
}
