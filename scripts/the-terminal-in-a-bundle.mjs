// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE TERMINAL IN A BUNDLE: the terminal holder and its native pty library, put into a bundle folder, so
 * an installed office can hold terminals. Wave 13u's step 4 (the design, report 6NVaDzG7tyUB, block b-5:
 * Linux packaging with 13t's installers). Since wave 13t's round 17, `npm run bundle` (scripts/bundle.mjs)
 * calls `buildTheTerminalInto` itself, before its notices and its check for development material, so
 * every bundle carries the holder, not only the one scripts/package-linux.mjs packs (wave 13u's report
 * rJKD_1quy9KN, block b-10, item 4). scripts/package-linux.mjs then checks the bundle it packs with the
 * app's own program, run as Node (`theShellAnswersThroughThePty`). `putTheTerminalIn` does both steps on a folder of its own.
 *
 * WHAT IT ADDS TO THE BUNDLE FOLDER:
 *   - holder.mjs (THE_HOLDER_BUNDLE in src/config/settings.mjs): src/holder/index.mjs made into one
 *     ES module by esbuild. @xterm/headless and @xterm/addon-serialize are plain JavaScript and go
 *     inside it, with their licence comments at its end.
 *   - node_modules/node-pty: the one module kept outside, because it loads a native file. Its
 *     package.json, lib/, LICENSE and the one prebuilt native file for this system and processor
 *     are copied as they are. node-pty 1.2 loads prebuilds/<system>-<processor>/pty.node when it has
 *     no build/ of its own, so no rebuild is needed. On Linux it needs no spawn-helper. On a Mac it
 *     starts every shell through prebuilds/darwin-<processor>/spawn-helper, a small program beside
 *     pty.node, so that is copied too and must be one its owner may run (wave 13t, round 20, agreed
 *     with wave 13u through the secretary, message 9aZCwfsVTCcX).
 *   - On Windows (round W13, for a bundle made with --for win32-x64) node-pty loads conpty.node, and
 *     conpty_console_list.node in the small program it starts to list a terminal's processes, and it opens
 *     every shell through conpty/conpty.dll and conpty/OpenConsole.exe beside them. Those four are copied;
 *     the .pdb files beside them are debugging symbols and are not.
 *   - The page's terminal (@xterm/xterm and @xterm/addon-fit) needs nothing here: Vite builds it into
 *     dist/web, which the bundle already carries.
 *
 * THEN IT CHECKS, with the Node the installed office runs on: that Node loads the copied node-pty, opens a
 * shell through it and reads back what the shell printed. A file left out, or a native file that
 * Node cannot load, fails here loudly and nothing is packed. A bundle made for Windows on Linux cannot be
 * checked so, and scripts/bundle.mjs says that it was not.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { theCommentsStayOut } from './the-comments-stay-out.mjs'
import { REPO_ROOT, THE_HOLDER_BUNDLE, THE_HOLDER_ENTRY } from '../src/config/settings.mjs'

/** The native module the holder loads, kept outside its bundle. */
export const THE_PTY_MODULE = 'node-pty'

/** The parts of node-pty an installed office needs, beside its one native file. */
const PTY_PARTS = ['package.json', 'lib', 'LICENSE']

/**
 * The native file node-pty loads on this system and processor, relative to its folder.
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 */
export function thePtyNativeFile(platform = process.platform, arch = process.arch) {
  return join('prebuilds', `${platform}-${arch}`, platform === 'win32' ? 'conpty.node' : 'pty.node')
}

/**
 * The files node-pty needs beside its native file on Windows, relative to its folder, and none elsewhere.
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string[]}
 */
export function thePtyWindowsParts(platform = process.platform, arch = process.arch) {
  if (platform !== 'win32') return []
  return ['conpty_console_list.node', join('conpty', 'conpty.dll'), join('conpty', 'OpenConsole.exe')].map((file) => join('prebuilds', `${platform}-${arch}`, file))
}

/**
 * The program node-pty starts every shell through on a Mac, relative to its folder, or null on a system
 * where it starts the shell itself. node-pty's lib/unixTerminal.js looks for it beside the native file.
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 */
export function thePtySpawnHelper(platform = process.platform, arch = process.arch) {
  return platform === 'darwin' ? join('prebuilds', `${platform}-${arch}`, 'spawn-helper') : null
}

/**
 * What node-pty's folder `pty` lacks for this system and processor, one plain sentence each; empty when
 * nothing is missing. A spawn-helper its owner may not run is as missing as no spawn-helper: node-pty
 * would load, and every terminal would then fail to start.
 *
 * @param {string} pty node-pty's folder
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string[]}
 */
export function whatThePtyLacks(pty, platform = process.platform, arch = process.arch) {
  const lacks = []
  const nativeFile = thePtyNativeFile(platform, arch)
  if (!existsSync(join(pty, nativeFile))) lacks.push(`${THE_PTY_MODULE} has no prebuilt native file ${nativeFile} for this system.`)
  const helper = thePtySpawnHelper(platform, arch)
  if (helper !== null) {
    if (!existsSync(join(pty, helper))) lacks.push(`${THE_PTY_MODULE} has no ${helper}, the program it starts every shell through on a Mac.`)
    else if ((statSync(join(pty, helper)).mode & 0o100) === 0) {
      lacks.push(`${THE_PTY_MODULE}'s ${helper} is not marked as a program its owner may run, so no terminal could start. Reinstall it with npm ci.`)
    }
  }
  for (const part of thePtyWindowsParts(platform, arch)) {
    if (!existsSync(join(pty, part))) lacks.push(`${THE_PTY_MODULE} has no ${part}, which it opens every shell through on Windows.`)
  }
  return lacks
}

/**
 * Build the holder into the bundle folder `office` and copy node-pty beside it, with the native files for
 * `platform` and `arch`. Throws, saying what is missing, when node-pty has no native file for them.
 *
 * @param {string} office a bundle folder
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {Promise<{ said: string[], sources: string[], pty: string }>} what it did, one line each; the
 *   source files esbuild compiled into holder.mjs, relative to the working folder; and node-pty's own folder
 *   in this checkout, whose licence the notices name
 */
export async function buildTheTerminalInto(office, platform = process.platform, arch = process.arch) {
  const said = []
  const made = await build({
    metafile: true,
    entryPoints: [join(REPO_ROOT, THE_HOLDER_ENTRY)],
    outfile: join(office, THE_HOLDER_BUNDLE),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    external: [THE_PTY_MODULE],
    banner: { js: "import { createRequire as __bundleRequire } from 'node:module'; const require = __bundleRequire(import.meta.url);" },
    // None of our comments goes in, as in the bundles of scripts/bundle.mjs.
    plugins: [theCommentsStayOut],
    logLevel: 'warning',
  })
  said.push(`Bundled ${THE_HOLDER_ENTRY} into ${join(office, THE_HOLDER_BUNDLE)}.`)

  const pty = join(REPO_ROOT, 'node_modules', THE_PTY_MODULE)
  const lacks = whatThePtyLacks(pty, platform, arch)
  if (lacks.length > 0) throw new Error(lacks.join(' '))
  const natives = [thePtyNativeFile(platform, arch), thePtySpawnHelper(platform, arch), ...thePtyWindowsParts(platform, arch)].filter((file) => file !== null)
  // cpSync keeps a file's mode, so the spawn-helper stays a program in the bundle.
  for (const part of [...PTY_PARTS, ...natives]) {
    cpSync(join(pty, part), join(office, 'node_modules', THE_PTY_MODULE, part), { recursive: true })
  }
  said.push(`Copied ${THE_PTY_MODULE} and its ${natives.join(' and ')} into ${join(office, 'node_modules', THE_PTY_MODULE)}.`)
  return { said, sources: Object.keys(made.metafile.inputs), pty }
}

/**
 * Put the holder and node-pty into the bundle folder `office`, then check them with `node`.
 * Throws, saying what is wrong, when either step fails.
 *
 * @param {string} office a bundle folder
 * @param {string} node the Node the installed office runs on
 * @returns {Promise<string[]>} what it did, one line each
 */
export async function putTheTerminalIn(office, node) {
  const { said } = await buildTheTerminalInto(office)
  const opened = theShellAnswersThroughThePty(office, node)
  if (!opened.ok) throw new Error(`The office's Node cannot open a shell through the ${THE_PTY_MODULE} beside the bundle: ${opened.said}`)
  said.push(`The office's Node opens a shell through ${THE_PTY_MODULE} and reads it back (${opened.said}).`)
  return said
}

/**
 * Whether `node` loads the node-pty in the bundle folder `office`, opens /bin/sh through it, and reads
 * back a line the shell worked out (so the line is the shell's answer, not the typed command's echo).
 * `environment` is what that Node needs set as well, as `theInstallsNode` in src/config/settings.mjs answers it.
 *
 * @param {string} office
 * @param {string} node
 * @param {Record<string, string>} [environment]
 * @returns {{ ok: boolean, said: string }}
 */
export function theShellAnswersThroughThePty(office, node, environment = {}) {
  const script = [
    'const pty = require(process.argv[1])',
    "const p = pty.spawn('/bin/sh', ['-c', 'echo pty-answers-$((6*7))'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: '/', env: { PATH: '/usr/bin:/bin' } })",
    "let out = ''",
    'p.onData((d) => { out += d })',
    "p.onExit(({ exitCode }) => { process.stdout.write(JSON.stringify({ exitCode, out })) })",
  ].join('\n')
  const ran = spawnSync(node, ['-e', script, resolve(office, 'node_modules', THE_PTY_MODULE)], { encoding: 'utf8', timeout: 15_000, env: { ...process.env, ...environment } })
  if (ran.status !== 0) return { ok: false, said: (ran.stderr || ran.stdout || `exit ${String(ran.status)}, signal ${String(ran.signal)}`).trim() }
  /** @type {{ exitCode: number, out: string }} */
  const result = JSON.parse(ran.stdout)
  if (result.exitCode !== 0 || !result.out.includes('pty-answers-42')) return { ok: false, said: `the shell printed ${JSON.stringify(result.out)} and ended with ${String(result.exitCode)}` }
  return { ok: true, said: 'pty-answers-42' }
}
