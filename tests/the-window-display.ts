// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A WINDOW TEST KNOWS IT RUNS UNDER A VIRTUAL DISPLAY.
 *
 * `node tools/run-named-tests.mjs --list window` starts vitest inside `dbus-run-session -- xvfb-run -a`:
 * a virtual display and a session bus of its own. It then sets `WINDOW_DISPLAY_VARIABLE` to
 * `WINDOW_DISPLAY_VALUE` for vitest. A window test opens a real window only when it finds that value.
 * Run any other way, it skips and says why. So a window test never opens a window on a person's own
 * screen, even where a real display is set.
 *
 * The runner removes this variable from what it passes on, and sets it only when it has started the
 * virtual display itself, so a caller cannot set it by hand and get past the check.
 *
 * Both the runner and the window tests read these three values from here, so they cannot disagree.
 * The window tests also find Electron's binary here, and the one sentence that says why a window
 * cannot open, so every window test skips for the same reasons in the same words.
 */

import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** The programs the window list runs vitest inside, in order, before Node. */
export const THE_VIRTUAL_DISPLAY_COMMAND: readonly string[] = ['dbus-run-session', '--', 'xvfb-run', '-a']

/** The variable the runner sets for vitest when it started the virtual display. */
export const WINDOW_DISPLAY_VARIABLE = 'MOLE_OFFICE_UNDER_A_VIRTUAL_DISPLAY'

/** The value it sets: the command it ran vitest inside, so a reader of the environment can see it. */
export const WINDOW_DISPLAY_VALUE = THE_VIRTUAL_DISPLAY_COMMAND.join(' ')

const requireHere = createRequire(import.meta.url)

/**
 * WHERE ELECTRON'S BINARY IS, OR WHY THERE IS NONE, for every window test.
 *
 * The electron package writes the binary's place inside its own folder into `path.txt` once
 * install.js has fetched it. Both the package and that binary must be there.
 */
export function electronsBinary(): { path: string } | { missing: string } {
  const fetchIt = 'The coordinator fetches it on the host, in the main checkout, with node node_modules/electron/install.js.'
  let folder: string
  try {
    folder = join(requireHere.resolve('electron/package.json'), '..')
  } catch {
    return { missing: `Electron is not installed in node_modules, so its binary is missing: npm install puts the package there, and ${fetchIt}` }
  }
  const pathFile = join(folder, 'path.txt')
  const binary = existsSync(pathFile) ? join(folder, 'dist', readFileSync(pathFile, 'utf8').trim()) : null
  if (binary === null || !existsSync(binary)) {
    return { missing: `Electron's binary is not in ${join(folder, 'dist')}: ${fetchIt}` }
  }
  return { path: binary }
}

/** The one sentence that says why a window test cannot open a window here, or null when it can. */
export function whyNoWindowOpensHere(): string | null {
  const binary = electronsBinary()
  if ('missing' in binary) return binary.missing
  if (process.env[WINDOW_DISPLAY_VARIABLE] !== WINDOW_DISPLAY_VALUE) {
    return 'This test opens a real window, so it runs only under the virtual display that node tools/run-named-tests.mjs --list window starts, and it was not started that way.'
  }
  return null
}

/**
 * WHETHER A WINDOW A TEST STARTED IS STILL RUNNING, read from the process the test kept at launch.
 *
 * Playwright's `app.process()` stops answering once Electron has exited: it gives undefined. A test's
 * clean-up that asks `app.process().exitCode` after a shutdown then throws, after every step passed
 * (wave 13u found it on main 50b7a4708). So a window test keeps the process `app.process()` gave it at
 * launch, while Playwright still answered, and its clean-up asks this, which is also safe when no
 * process was given at all.
 */
export function stillRunning(child: ChildProcess | undefined): child is ChildProcess {
  return child !== undefined && child.exitCode === null && child.signalCode === null
}

/**
 * THE OFFICE'S OWN BACKGROUND IN EACH LOOK, read from --bg in src/web/tokens.css and given as a page
 * reports a colour. The window's check page reads the same tokens (round 14), so it is drawn in these.
 */
export function theOfficesBackground(look: 'light' | 'dark'): string {
  const tokens = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'tokens.css'), 'utf8')
  const block = new RegExp(`:root\\[data-theme='${look}'\\] \\{[^}]*?--bg: #([0-9a-f]{6});`).exec(tokens)
  const hex = block?.[1]
  if (hex === undefined) throw new Error(`src/web/tokens.css names no --bg for the ${look} look.`)
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`
}
