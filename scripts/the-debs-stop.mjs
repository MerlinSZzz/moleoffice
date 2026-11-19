// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE STOP BOTH LINUX .debs RUN BEFORE DPKG CHANGES A FILE: the office's own .deb and the office map's .deb.
 * scripts/the-debs-stop.sh is the stop. This writes the facts it needs above it, each from the place that decides
 * it, and reads a built .deb's scripts back. tests/the-debs-stop-a-running-office.test.ts runs it.
 *
 * Both .debs run the same script as their preinst and their prerm. electron-builder makes the office's .deb, and is
 * given the two scripts as fpm's --before-install and --before-remove (theOfficesDebOptions). dpkg-deb makes the
 * map's .deb, and makeTheMapsDeb in scripts/the-office-map-part.mjs puts them in its DEBIAN folder (writeTheStop).
 *
 * The office's .deb also has a postrm of its own, scripts/the-debs-after-remove.sh. dpkg runs a new version's postrm
 * after its preinst refused, and electron-builder's own postrm would then remove the command and the AppArmor
 * profile of the version that stays installed.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THE_BUNDLES, THE_COMMAND_ENTRY, THE_SERVER_ENTRY } from '../src/config/settings.mjs'
import { EXIT, STOP_WAIT_MS, THE_HOLDER_ENDS_WITHIN_MS } from '../src/config/the-service-command.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER } from '../src/config/systems/the-installer-of-a-folder.mjs'

/** The stop, with no facts above it. */
export const THE_STOP = fileURLToPath(new URL('./the-debs-stop.sh', import.meta.url))

/** The office's .deb's postrm, as electron-builder's template for it: a guard, then electron-builder's own text. */
export const THE_AFTER_REMOVE = fileURLToPath(new URL('./the-debs-after-remove.sh', import.meta.url))

/** How much longer than the stop command's waits the stop waits for it: the start of the app's program run as Node, and the command's. */
const THE_STOP_COMMANDS_START_MS = 15_000

/** How long a process stopped by its path may take to end: once after SIGTERM, and once more after SIGKILL. */
export const THE_END_WAIT_SECONDS = 10

/**
 * THE FACTS ABOVE THE STOP, each from the place that decides it: the installed folder, where the office's command and
 * its server are in it, the stop command's exit codes that let the install go on, and how long the command may take.
 * The exit codes are the ones the Windows installer goes on after (theInstallerFacts in scripts/the-windows-build.mjs).
 *
 * @param {string} folder where the .deb installs the office's app, /opt/mole-office
 * @returns {Record<string, string>}
 */
export function theStopFacts(folder) {
  const office = THE_OFFICE_IN_THE_INSTALLED_FOLDER
  return {
    THE_FOLDER: folder,
    THE_COMMAND: [...office, THE_BUNDLES[THE_COMMAND_ENTRY]].join('/'),
    THE_SERVER: [...office, THE_BUNDLES[THE_SERVER_ENTRY]].join('/'),
    THE_ANSWERS_THAT_GO_ON: [EXIT.OK, EXIT.NOT_RUNNING, EXIT.STALE, EXIT.HOLDER_NOT_STOPPED].join(' '),
    THE_ASK_WAIT_SECONDS: String(Math.ceil((STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS + THE_STOP_COMMANDS_START_MS) / 1000)),
    THE_END_WAIT_SECONDS: String(THE_END_WAIT_SECONDS),
  }
}

/**
 * THE STOP AS A .deb RUNS IT: the stop's first line, the facts as shell lines, then the rest of the stop. A fact that
 * holds anything but letters, digits, spaces and . _ / - is refused, not escaped: the shell would read a quote as more
 * than its words, and find's pattern a star or a bracket.
 *
 * @param {Record<string, string>} facts theStopFacts, or the same names with values a test chooses
 * @returns {string}
 */
export function theStopScript(facts) {
  const [first, ...rest] = readFileSync(THE_STOP, 'utf8').split('\n')
  const lines = [String(first), '# THE FACTS ABOVE THIS SCRIPT, written by scripts/the-debs-stop.mjs (theStopFacts).']
  for (const [name, value] of Object.entries(facts)) {
    if (!/^[A-Z_]+$/.test(name)) throw new Error(`${name} is not a name the stop uses.`)
    if (!/^[\w ./-]+$/.test(value)) throw new Error(`The stop's fact ${name} holds ${JSON.stringify(value)}, which the stop would not read as it is.`)
    lines.push(`${name}='${value}'`)
  }
  return [...lines, ...rest].join('\n')
}

/**
 * WRITES THE STOP AS preinst AND prerm into a folder, each 0755, as dpkg-deb wants a DEBIAN folder's scripts.
 *
 * @param {{ folder: string, into: string }} where `folder` is the installed folder, `into` the folder written to
 * @returns {{ preinst: string, prerm: string }}
 */
export function writeTheStop({ folder, into }) {
  mkdirSync(into, { recursive: true })
  const script = theStopScript(theStopFacts(folder))
  const written = { preinst: join(into, 'preinst'), prerm: join(into, 'prerm') }
  for (const path of Object.values(written)) {
    writeFileSync(path, script)
    chmodSync(path, 0o755)
  }
  return written
}

/**
 * WHAT ELECTRON-BUILDER IS GIVEN FOR THE OFFICE'S .deb, beside what it is given already: the stop as fpm's
 * --before-install and --before-remove, written into `into`, and the postrm's template.
 *
 * @param {{ folder: string, into: string }} where as for writeTheStop
 * @returns {{ fpm: string[], afterRemove: string }}
 */
export function theOfficesDebOptions({ folder, into }) {
  const { preinst, prerm } = writeTheStop({ folder, into })
  return { fpm: ['--before-install', preinst, '--before-remove', prerm], afterRemove: THE_AFTER_REMOVE }
}

/**
 * THE INSTALLED FOLDER, from where a .deb puts the office: that path without THE_OFFICE_IN_THE_INSTALLED_FOLDER at
 * its end. A path that does not end in it is refused.
 *
 * @param {string[]} office where the office is in the office's .deb (theOfficeInTheDeb in scripts/the-office-map-part.mjs)
 * @returns {string}
 */
export function theInstalledFolder(office) {
  const end = THE_OFFICE_IN_THE_INSTALLED_FOLDER
  const at = office.length - end.length
  if (at < 1 || end.some((name, i) => office[at + i] !== name)) {
    throw new Error(`The office is at /${office.join('/')} in the .deb, which does not end in ${end.join('/')}, so the folder the stop reads is not known.`)
  }
  return `/${office.slice(0, at).join('/')}`
}

/**
 * WHAT A BUILT .deb's SCRIPTS GET WRONG, read back from it with dpkg-deb: its preinst and its prerm must each be the
 * stop for `folder`, as theStopScript writes it. With `postrm`, its postrm must begin with the guard
 * scripts/the-debs-after-remove.sh begins with. An empty list means nothing was found wrong.
 *
 * @param {{ deb: string, folder: string, postrm?: boolean }} what
 * @returns {string[]}
 */
export function whatTheDebsScriptsGetWrong({ deb, folder, postrm = false }) {
  const wrong = []
  const wanted = theStopScript(theStopFacts(folder))
  /** @param {string} member */
  const read = (member) => {
    const got = spawnSync('dpkg-deb', ['--info', deb, member], { encoding: 'utf8' })
    return got.status === 0 ? got.stdout : null
  }
  for (const member of ['preinst', 'prerm']) {
    const script = read(member)
    if (script === null) wrong.push(`${deb} has no ${member}, so it does not stop a running office before dpkg changes a file.`)
    else if (script !== wanted) wrong.push(`${deb}'s ${member} is not the stop for ${folder} that scripts/the-debs-stop.mjs writes.`)
  }
  if (postrm) {
    const script = read('postrm')
    const guard = theAfterRemovesGuard()
    if (script === null) wrong.push(`${deb} has no postrm.`)
    else if (!script.split('\n').slice(1).join('\n').startsWith(guard)) wrong.push(`${deb}'s postrm does not begin with the guard that leaves a refused install's older version as it was.`)
  }
  return wrong
}

/** The postrm's guard: the text of scripts/the-debs-after-remove.sh from its second line to the line `esac`, that one included. */
export function theAfterRemovesGuard() {
  const lines = readFileSync(THE_AFTER_REMOVE, 'utf8').split('\n').slice(1)
  const end = lines.indexOf('esac')
  if (end < 0) throw new Error(`${THE_AFTER_REMOVE} has no line esac, so where its guard ends is not known.`)
  return `${lines.slice(0, end + 1).join('\n')}\n`
}
