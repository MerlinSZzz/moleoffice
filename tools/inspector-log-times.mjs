// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TIME AT THE START OF EVERY LINE THE INSPECTOR WRITES.
 *
 * One stamp per line, taken once per write, so a live check's log can be split against the model's
 * own times. A line's stamp is written with its first bytes; a write that continues a line adds
 * nothing. The machine line is left exactly as written, because inspectionUsageIn reads only a line
 * that starts with its marker.
 */
import { clockStamp } from '../src/shared/time.ts'
import { CLAUDE_USAGE_LINE, INSPECTION_USAGE_LINE } from '../src/config/usage.mjs'

const THE_MACHINE_LINES = [INSPECTION_USAGE_LINE, CLAUDE_USAGE_LINE]
const THE_STATE = new WeakMap()

/** Replace this stream's write once, so every later write and console.log is stamped. */
export function stampEachLine(stream, clock = () => new Date()) {
  if (THE_STATE.has(stream)) return stream
  const state = { atLineStart: true }
  THE_STATE.set(stream, state)
  const write = stream.write
  stream.write = function (chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding
      encoding = undefined
    }
    if (empty(chunk)) return write.call(stream, chunk, encoding, callback)
    const stamp = `${clockStamp(clock).instant} `
    const stamped = typeof chunk === 'string' ? stampTheText(chunk, stamp, state) : stampTheBytes(chunk, stamp, state)
    return write.call(stream, stamped, encoding, callback)
  }
  return stream
}

function empty(chunk) {
  if (typeof chunk === 'string') return chunk.length === 0
  return chunk instanceof Uint8Array && chunk.byteLength === 0
}

function isAMachineLine(text) {
  return THE_MACHINE_LINES.some((line) => text.startsWith(line))
}

function stampTheText(text, stamp, state) {
  let out = ''
  let from = 0
  while (from < text.length) {
    const newline = text.indexOf('\n', from)
    const end = newline === -1 ? text.length : newline + 1
    const piece = text.slice(from, end)
    if (state.atLineStart && !isAMachineLine(piece)) out += stamp
    out += piece
    state.atLineStart = piece.endsWith('\n')
    if (newline === -1) break
    from = end
  }
  return out
}

function beginsWithAMachineLine(bytes, from, end) {
  return THE_MACHINE_LINES.some((line) => {
    if (end - from < line.length) return false
    for (let at = 0; at < line.length; at += 1) if (bytes[from + at] !== line.charCodeAt(at)) return false
    return true
  })
}

function stampTheBytes(chunk, stamp, state) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  const stampBytes = Buffer.from(stamp, 'utf8')
  const pieces = []
  let from = 0
  while (from < bytes.length) {
    const newline = bytes.indexOf(0x0a, from)
    const end = newline === -1 ? bytes.length : newline + 1
    if (state.atLineStart && !beginsWithAMachineLine(bytes, from, end)) pieces.push(stampBytes)
    pieces.push(bytes.subarray(from, end))
    state.atLineStart = newline !== -1
    if (newline === -1) break
    from = end
  }
  return pieces.length === 0 ? chunk : Buffer.concat(pieces)
}

/** The shape clockStamp writes, built from its own output and kept as a source string. */
const THE_STAMP_AT_THE_START = clockStamp(() => new Date(0)).instant
  .replace('.', '\\.')
  .replace(/([+-])(?=\d\d:\d\d$)/, '[+-]')
  .replace(/\d/g, '\\d')

/** Remove the stamp and its space from the start of each line, and change nothing else. */
export function withoutTheTimes(text) {
  return text.replace(new RegExp(`^${THE_STAMP_AT_THE_START} `, 'gm'), '')
}
