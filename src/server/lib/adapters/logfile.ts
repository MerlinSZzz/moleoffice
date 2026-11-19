// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING THE END OF A BIG FILE WITHOUT READING THE FILE.
 *
 * Every adapter needs the same two things from a transcript on disk: the beginning of it (who
 * started this, where, and when) and the end of it (what has happened lately, and whether it is
 * still happening). Neither question needs the middle, and the middle is where all the bytes
 * are -- the largest Claude Code transcript on this machine is 13 MB and the second is 2.5 MB.
 *
 * So this file reads FIXED WINDOWS at each end with `readSync` and a file position, rather than
 * `readFileSync` and a slice. The difference is not a micro-optimisation: GET /api/sessions
 * touches every session on the machine, and doing that by loading each transcript whole would
 * turn a list page into hundreds of megabytes of allocation per request.
 *
 * THE PARTIAL LINE RULE. A window that starts or ends in the middle of a line will contain a
 * fragment, and a fragment of JSON parses as nothing or, far worse, as something. Both readers
 * below DROP the fragment at the cut and say how many bytes they read, so a caller can tell a
 * short file (read whole, nothing dropped) from a long one. Nothing is silently repaired.
 *
 * UTF-8 is handled by the same rule. A window can cut a multi-byte character in half; that
 * character can only ever be in the fragment line, which is dropped, so a mangled character
 * never reaches a caller.
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs'

/** How much of the start of a log is enough to say who started it, where and when. */
export const HEAD_WINDOW_BYTES = 128 * 1024

/** How much of the end of a log is enough to say what has happened lately. */
export const TAIL_WINDOW_BYTES = 512 * 1024

/** What a windowed read found. */
export interface LogWindow {
  /** Whole lines, in file order. The fragment at the cut, if any, is not among them. */
  lines: string[]
  /** How many bytes were read. */
  bytesRead: number
  /** The file's total size, so a caller can tell whether it saw all of it. */
  fileSize: number
  /** True when the window covered the entire file and no line was dropped. */
  complete: boolean
}

/** A file that could not be read, and why. Never confused with a file that was empty. */
export interface LogUnreadable {
  unreadable: true
  /** Plain English: "the file is not there", "permission denied", and so on. */
  reason: string
  /** True specifically when the path does not exist, which is a different story from a refusal. */
  missing: boolean
}

export type LogRead = LogWindow | LogUnreadable

export function isUnreadable<T extends object>(read: T | LogUnreadable): read is LogUnreadable {
  return 'unreadable' in read
}

/** Turn a filesystem exception into a sentence, keeping "not there" apart from "not allowed". */
function describeFsError(err: unknown, path: string): LogUnreadable {
  const code = (err as { code?: unknown }).code
  if (code === 'ENOENT') {
    return { unreadable: true, missing: true, reason: `there is no file at ${path}` }
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return { unreadable: true, missing: false, reason: `permission denied reading ${path}` }
  }
  if (code === 'EISDIR') {
    return { unreadable: true, missing: false, reason: `${path} is a directory, not a log file` }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { unreadable: true, missing: false, reason: `${path} could not be read: ${message}` }
}

/** When the file was last written, in epoch milliseconds, or null when it cannot be stat'd. */
export function modifiedAt(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/**
 * The first `maxBytes` of a file, as whole lines.
 *
 * The final line is dropped when the window did not reach the end of the file, because it is a
 * fragment. A caller that wants the whole of a short file gets it: `complete` says which
 * happened.
 */
export function readHead(path: string, maxBytes = HEAD_WINDOW_BYTES): LogRead {
  let fd: number | null = null
  try {
    const size = statSync(path).size
    fd = openSync(path, 'r')
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    const bytesRead = length === 0 ? 0 : readSync(fd, buffer, 0, length, 0)
    const complete = bytesRead >= size
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const lines = text.split('\n')

    // The last element of a split is either the fragment at the cut, or the empty string after a
    // trailing newline. Dropping it is right in both cases; keeping it would hand back half a
    // JSON object for a caller to misparse.
    if (!complete || !text.endsWith('\n')) lines.pop()

    return { lines: lines.filter((l) => l !== ''), bytesRead, fileSize: size, complete }
  } catch (err) {
    return describeFsError(err, path)
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * The last `maxBytes` of a file, as whole lines, in file order.
 *
 * The FIRST line is dropped when the window did not reach the start of the file: it is the
 * fragment the cut landed in the middle of.
 */
export function readTail(path: string, maxBytes = TAIL_WINDOW_BYTES): LogRead {
  let fd: number | null = null
  try {
    const size = statSync(path).size
    fd = openSync(path, 'r')
    const length = Math.min(size, maxBytes)
    const start = size - length
    const buffer = Buffer.alloc(length)
    const bytesRead = length === 0 ? 0 : readSync(fd, buffer, 0, length, start)
    const complete = start <= 0
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const lines = text.split('\n')

    if (!complete) lines.shift()

    return { lines: lines.filter((l) => l !== ''), bytesRead, fileSize: size, complete }
  } catch (err) {
    return describeFsError(err, path)
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * The last `wanted` whole lines of a file, growing the window until it has them.
 *
 * A single line here can be a whole assistant turn -- tens of kilobytes -- so a fixed window is
 * not enough to promise a line count. This doubles the window until it either has enough lines
 * or has read the whole file, and stops at `maxBytes` so that asking for a thousand lines of a
 * 13 MB transcript cannot pull the whole thing into memory. Hitting that ceiling returns fewer
 * lines than were asked for, which the caller can see by counting them.
 */
export function readLastLines(
  path: string,
  wanted: number,
  maxBytes = TAIL_WINDOW_BYTES * 8,
): LogRead {
  let window = 64 * 1024
  let last: LogRead = readTail(path, window)

  while (!isUnreadable(last) && last.lines.length < wanted && !last.complete && window < maxBytes) {
    window = Math.min(window * 4, maxBytes)
    last = readTail(path, window)
  }

  if (isUnreadable(last)) return last
  return { ...last, lines: last.lines.slice(-wanted) }
}

/** What a read from a byte offset found. */
export interface LogFrom {
  /** Whole lines from the offset on, in file order. A line still being written is not among them. */
  lines: string[]
  /** Where the next read starts: just past the last whole line read here. */
  next: number
  /** The file's total size when it was read. */
  fileSize: number
  /**
   * Bytes passed over without being read as lines: the rest of a line an offset fell inside, or one line longer than
   * the window, which is stepped over rather than held in memory.
   */
  skipped: number
}

/**
 * THE WHOLE LINES WRITTEN SINCE A BYTE OFFSET, at most `maxBytes` of them, for a reader that comes back for more
 * (wave 13u, round 10, way C: a sandboxed run's steps read every few seconds).
 *
 * The partial line rule holds at both ends. An offset that is not at the start of a line drops the rest of that line,
 * and the line still being written at the end is left for the next read, which `next` points at. An offset past the
 * end of the file reads nothing; the caller compares it with `fileSize` and says what it does about that.
 */
export function readFrom(path: string, from: number, maxBytes = TAIL_WINDOW_BYTES): LogFrom | LogUnreadable {
  let fd: number | null = null
  try {
    const size = statSync(path).size
    fd = openSync(path, 'r')
    if (from >= size) return { lines: [], next: from, fileSize: size, skipped: 0 }
    const length = Math.min(size - from, maxBytes)
    const buffer = Buffer.alloc(length)
    const bytesRead = readSync(fd, buffer, 0, length, from)
    const read = buffer.subarray(0, bytesRead)

    let start = 0
    if (from > 0) {
      const before = Buffer.alloc(1)
      readSync(fd, before, 0, 1, from - 1)
      if (before[0] !== 0x0a) {
        // A WINDOW THAT IS ALL FRAGMENT is passed over whole; the next read goes on dropping to the line's end.
        const end = read.indexOf(0x0a)
        start = end === -1 ? bytesRead : end + 1
      }
    }
    const last = read.lastIndexOf(0x0a)
    if (last >= start) {
      const lines = read.subarray(start, last).toString('utf8').split('\n').filter((l) => l !== '')
      return { lines, next: from + last + 1, fileSize: size, skipped: start }
    }
    // NO WHOLE LINE IN A FULL WINDOW: one line longer than the window. It is stepped over, chunk by chunk, to the
    // newline that ends it; while that line is still being written, nothing is read and the offset stays.
    if (bytesRead < maxBytes) return { lines: [], next: from + start, fileSize: size, skipped: start }
    let at = from + bytesRead
    const chunk = Buffer.alloc(maxBytes)
    while (at < size) {
      const got = readSync(fd, chunk, 0, Math.min(maxBytes, size - at), at)
      const end = chunk.subarray(0, got).indexOf(0x0a)
      if (end !== -1) return { lines: [], next: at + end + 1, fileSize: size, skipped: at + end + 1 - from }
      at += got
    }
    return { lines: [], next: from + start, fileSize: size, skipped: start }
  } catch (err) {
    return describeFsError(err, path)
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
