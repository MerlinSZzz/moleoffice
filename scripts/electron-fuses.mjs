// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ELECTRON'S FUSES, READ FROM A BINARY'S OWN BYTES (wave 13t, round 15). Electron keeps its fuses as a
 * wire of bytes after a fixed sentinel: a version byte, a length byte, then one byte per fuse, '0' off,
 * '1' on, 'r' removed, in the order FUSE_ORDER gives (@electron/fuses, FuseV1Options).
 *
 * scripts/the-packed-app.mjs reads the packed binary with this after the installers are made.
 *
 * It is also a command, run on the installation's own Node in the container test of the installers
 * (tests/installed/run-in-a-container.sh), which is why it imports nothing of the office's:
 *
 *   node electron-fuses.mjs read <binary>                 prints the binary's fuses, one per line
 *   node electron-fuses.mjs inspectable <binary> <copy>   writes a copy with the inspector fuse turned on
 *
 * WHY A COPY WITH THE INSPECTOR ON. The installers ship with Node's inspector arguments turned off, so
 * nothing can attach to the window's main process. The container test drives the installed window
 * through that inspector (tests/installed/drive-the-window.mjs), because a machine with no Node has no
 * Playwright. So it drives a copy that differs from the shipped binary in that one byte, and says so;
 * the shipped binary is read, never changed.
 */

import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** What Electron writes before the fuse wire. */
const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX')

/** Each fuse's place in the wire, as @electron/fuses' FuseV1Options numbers them. */
export const FUSE_ORDER = Object.freeze([
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
  'EnableWasmTrapHandlers',
])

/**
 * Where the fuse wire starts in a binary, after its version and length bytes. Throws when the binary
 * has no wire, or more than one, or one of a version this cannot read.
 *
 * @param {Buffer} binary
 * @returns {{ start: number, length: number }}
 */
function theWire(binary) {
  const at = binary.indexOf(SENTINEL)
  if (at === -1) throw new Error('The binary carries no fuse wire.')
  if (binary.indexOf(SENTINEL, at + 1) !== -1) throw new Error('The binary carries more than one fuse wire.')
  const version = binary[at + SENTINEL.length]
  if (version !== 1) throw new Error(`The binary's fuse wire is of version ${String(version)}, and only version 1 can be read.`)
  return { start: at + SENTINEL.length + 2, length: binary[at + SENTINEL.length + 1] ?? 0 }
}

/**
 * The fuses a binary carries, by name: 'on', 'off' or 'removed'. A byte that is none of the three is
 * said, never guessed.
 *
 * @param {Buffer} binary
 * @returns {Record<string, 'on' | 'off' | 'removed'>}
 */
export function readTheFuses(binary) {
  const { start, length } = theWire(binary)
  /** @type {Record<string, 'on' | 'off' | 'removed'>} */
  const fuses = {}
  for (const [i, byte] of [...binary.subarray(start, start + length).toString('latin1')].entries()) {
    const name = FUSE_ORDER[i] ?? `fuse ${String(i)}`
    if (byte === '1') fuses[name] = 'on'
    else if (byte === '0') fuses[name] = 'off'
    else if (byte === 'r') fuses[name] = 'removed'
    else throw new Error(`The binary's fuse ${name} reads ${JSON.stringify(byte)}, which is none of on, off or removed.`)
  }
  return fuses
}

/**
 * A copy of a binary with Node's inspector arguments turned on and every other byte the same.
 * Throws when that fuse was removed, since it cannot then be turned on.
 *
 * @param {Buffer} binary
 * @returns {Buffer}
 */
export function anInspectableCopy(binary) {
  const { start } = theWire(binary)
  const at = start + FUSE_ORDER.indexOf('EnableNodeCliInspectArguments')
  if (binary[at] === 'r'.charCodeAt(0)) throw new Error("The binary's inspector fuse was removed, so no copy can turn it on.")
  const copy = Buffer.from(binary)
  copy[at] = '1'.charCodeAt(0)
  return copy
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [what, binary, copy] = process.argv.slice(2)
  if (what === 'read' && binary !== undefined) {
    for (const [name, state] of Object.entries(readTheFuses(readFileSync(binary)))) process.stdout.write(`${name} ${state}\n`)
  } else if (what === 'inspectable' && binary !== undefined && copy !== undefined) {
    writeFileSync(copy, anInspectableCopy(readFileSync(binary)))
    chmodSync(copy, 0o755)
    process.stdout.write(`Wrote ${copy}: ${binary} with only Node's inspector arguments turned on.\n`)
  } else {
    process.stderr.write('Use: node electron-fuses.mjs read <binary> | inspectable <binary> <copy>\n')
    process.exit(2)
  }
}
