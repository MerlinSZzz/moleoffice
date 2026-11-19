// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF A SMALL REGULAR FILE, OPENED ONCE, WITHOUT WAITING AND WITHOUT FOLLOWING A LINK.
 *
 * Problem PrEssiyVNlf_, found by the check of run DI7UltQUKPPK (29 September 2026): the office's check for key files left
 * in a sandbox (lib/key-files.ts) checked a file's size on its path and then read the path again. A file swapped for a
 * named pipe between the two would have held the live office's event loop on the read, until something wrote to the
 * pipe. So the file is opened once, in a way that never waits (O_NONBLOCK) and never follows a link (O_NOFOLLOW), and what
 * was opened is judged and read from that same descriptor: a regular file of at most `most` bytes, and nothing else.
 *
 * ITS OWN FILE, IMPORTING NOTHING OF THE OFFICE'S, so a test can run it in a process of its own and bound it by time: a
 * read that waited would hold that process, not the test that asked.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'

/**
 * The file's words, or null because what the path names is not a regular file of at most `most` bytes, or 'unread'
 * because it could not be opened or read (a link met at the open is one of those).
 */
export function theWordsOfASmallFile(path: string, most: number): string | null | 'unread' {
  const read = aSmallFileAndWhichItIs(path, most)
  return read === null || read === 'unread' ? read : read.words
}

/**
 * THE SAME, AND WHICH FILE IT WAS: the device and inode of what was opened and read, so a later step can ask whether a
 * name still leads to that very file (lib/key-files.ts, before it removes a revoked key's file).
 */
export function aSmallFileAndWhichItIs(path: string, most: number): { words: string; dev: number; ino: number } | null | 'unread' {
  let fd: number | null = null
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    const opened = fstatSync(fd)
    if (!opened.isFile() || opened.size > most) return null
    const buffer = Buffer.alloc(most + 1)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    return read > most ? null : { words: buffer.subarray(0, read).toString('utf8'), dev: opened.dev, ino: opened.ino }
  } catch {
    return 'unread'
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
