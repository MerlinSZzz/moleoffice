// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ELECTRON'S LINUX RUNTIME, PUT IN WHERE THE LINUX BUILD FIRST NEEDS IT: step 2 of scripts/package-linux.mjs, where the
 * app's own program becomes the office's Node.
 *
 * Electron 44 declares no install hook, so `npm ci` in a fresh clone leaves node_modules/electron/dist without the
 * runtime. When the runtime is missing, this runs Electron's own installer, node_modules/electron/install.js, with the
 * Node that runs the build, and says so. The installer downloads the runtime into an electron folder in the user's
 * cache folder (XDG_CACHE_HOME, or .cache in the home folder), unless electron_config_cache names another, checks it
 * against Electron's checksums.json, and unpacks it into dist. A failure is refused in the installer's own words, and
 * the runtime is looked for again after an installer that ended well.
 *
 * The Windows build needs no runtime here: it packs from Electron's Windows zip (scripts/the-windows-build.mjs).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Electron's own installer, from the checkout's root. */
export const THE_ELECTRON_INSTALL = join('node_modules', 'electron', 'install.js')

/** The Linux runtime Electron's installer puts in, from the checkout's root. */
export const THE_ELECTRON_RUNTIME = join('node_modules', 'electron', 'dist', 'electron')

/** How long the installer may take, download included, before it is stopped. */
const TEN_MINUTES = 600_000

/**
 * Null when the runtime is in the checkout at `root`, there before or put in now. Otherwise the refusal, in the
 * installer's own words where it gave any. `timeout` is in milliseconds, and a test gives a short one.
 * @param {{ root: string, say: (line: string) => void, timeout?: number }} options
 * @returns {string | null}
 */
export function putInElectronsRuntime({ root, say, timeout = TEN_MINUTES }) {
  if (existsSync(join(root, THE_ELECTRON_RUNTIME))) return null
  say(`Electron's runtime, ${THE_ELECTRON_RUNTIME}, is not there, so it is put in now with: node ${THE_ELECTRON_INSTALL}`)
  const ran = spawnSync(process.execPath, [join(root, THE_ELECTRON_INSTALL)], { cwd: root, encoding: 'utf8', timeout })
  const words = `${ran.stderr ?? ''}\n${ran.stdout ?? ''}`.trim()
  const it = `Electron's runtime could not be put in: node ${THE_ELECTRON_INSTALL}`
  if (ran.error !== undefined && /** @type {NodeJS.ErrnoException} */ (ran.error).code === 'ETIMEDOUT') {
    return `${it} did not end within ${String(timeout / 1000)} seconds, and was stopped.`
  }
  if (ran.error !== undefined) return `${it} could not be started: ${ran.error.message}`
  const ended = ran.status === null ? `was stopped by ${String(ran.signal)}` : `ended with exit ${String(ran.status)}`
  if (ran.status !== 0) return `${it} ${ended}, and said: ${words === '' ? 'nothing' : words}`
  if (!existsSync(join(root, THE_ELECTRON_RUNTIME))) {
    return `${it} ${ended}, and ${THE_ELECTRON_RUNTIME} is still not there. ${words === '' ? 'It said nothing.' : `It said: ${words}`}`
  }
  say(`Electron's runtime is in: ${THE_ELECTRON_RUNTIME}.`)
  return null
}
