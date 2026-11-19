// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SYSTEM AND PROCESSOR A BUNDLE IS MADE FOR (wave 13t, round W13). `npm run bundle` makes a bundle for
 * the machine it runs on. `node scripts/bundle.mjs --for win32-x64` makes one for Windows on a 64-bit Intel
 * or AMD processor, which is what scripts/package-windows.mjs packs on Linux. The bundles themselves are
 * the same JavaScript on every system; what differs is the native files beside them, and the bundle copies
 * those for its target.
 *
 * Windows x64 is the one other target, because it is the one that has been tried on a real machine: the
 * office ran there from a bundle in rounds W9 to W12. Anything else asked for is refused, not guessed at.
 */

/** @typedef {{ platform: string, arch: string }} Target */

/** Windows on a 64-bit Intel or AMD processor, as Node names them. */
export const THE_WINDOWS_TARGET = Object.freeze({ platform: 'win32', arch: 'x64' })

/** @param {Target} target */
export const theTargetsName = (target) => `${target.platform}-${target.arch}`

/**
 * The target `argv` asks for with `--for`, or this machine's when it asks for none.
 *
 * @param {string[]} argv the script's arguments
 * @param {Target} machine the machine it runs on
 * @returns {{ target: Target } | { refused: string }}
 */
export function theBundleTarget(argv, machine) {
  const at = argv.indexOf('--for')
  const own = { platform: machine.platform, arch: machine.arch }
  if (at === -1) return { target: own }
  const asked = argv[at + 1] ?? ''
  const windows = theTargetsName(THE_WINDOWS_TARGET)
  if (asked === '' || asked.startsWith('--')) return { refused: `--for needs a target: ${windows}, or this machine's own, ${theTargetsName(own)}.` }
  if (asked === theTargetsName(own)) return { target: own }
  if (asked === windows) return { target: { ...THE_WINDOWS_TARGET } }
  return { refused: `A bundle is made for this machine, ${theTargetsName(own)}, or for ${windows}, and not for ${asked}.` }
}

/**
 * Whether a bundle for `target` runs on `machine`, so that what it carries can be run here as a check.
 *
 * @param {Target} target
 * @param {Target} machine
 */
export const isThisMachine = (target, machine) => target.platform === machine.platform && target.arch === machine.arch
