// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH INSTALLER MADE A FOLDER: ASKED OF THE INSTALLER, NEVER READ FROM THE FOLDER'S NAME OR ITS PATH.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * An installed office has a build stamp and no .git, and so has a copy of one. Only the installer can tell them apart,
 * because only the installer keeps a record of what it put where. The entry press (../install-the-entry.mjs) asks this
 * about a folder with a build stamp and no .git, and links the skill only into an office an installer made.
 *
 *   - On Linux the .deb's files are in dpkg's file list. `dpkg-query -S <file>` names the package that holds the file,
 *     ends with 1 when no package holds it, and with 2 on an error. The file asked about is the folder's build stamp.
 *   - On Linux an AppImage runs from a folder of its own: with FUSE a mount at a new folder each time it starts, and
 *     with APPIMAGE_EXTRACT_AND_RUN a temporary folder it unpacked itself to. It sets APPIMAGE and APPDIR for what it
 *     runs. A folder inside APPDIR is in the AppImage's own folder, and dpkg is not asked.
 *   - On Windows the installer writes an entry in this user's list of installed apps, under
 *     HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall, with the folder it installed into as InstallLocation.
 *     The office is resources\office inside that folder (THE_OFFICE_IN_THE_INSTALLED_FOLDER, which the Windows build
 *     reads too). One PowerShell script reads every entry's InstallLocation, and writes nothing.
 *   - On the Mac, and on any other system, nothing is asked yet, and the answer says so.
 *
 * THE QUESTION WAITS FOR ITS ANSWER, AND THE THREAD IS FREE MEANWHILE. The entry press asks it on the server's thread,
 * and one PowerShell script takes about a second on Windows 11 (./windows-commands.mjs). So dpkg-query and PowerShell
 * are both started by the way that waits, and the answer is a promise.
 *
 * WHEN THE INSTALLER CANNOT BE ASKED, THE ANSWER IS UNKNOWN, WITH THE REASON. A dpkg-query that is not there or ends
 * with an error, and a PowerShell that did not run, ended with an error or did not finish its list, are each a question
 * nobody answered. They are not read as "no installer made it" and not as "an installer made it".
 *
 * The Linux question is read on Linux with a stand-in dpkg-query, and the Windows one with a stand-in for PowerShell,
 * in tests/an-installed-office-makes-the-skill-entry.test.ts. Both have run against a real installed office in wave 13t,
 * round W16: the Linux one in a container with the round's .deb, and the Windows one on a Windows 11 machine with the
 * round's installer.
 */

import { spawn } from 'node:child_process'
import { isAbsolute, relative, win32 } from 'node:path'

import { theRealWindowsCommands } from './windows-commands.mjs'

/**
 * @typedef {import('./windows-commands.mjs').WindowsCommands} WindowsCommands
 */

/**
 * WHAT MADE A FOLDER. `by-dpkg` names the package that holds the file asked about; `by-windows` names the entry of
 * Installed apps that holds the folder; `in-an-appimage` names the AppImage's own folder, APPDIR; `by-none` means
 * the installer was asked and holds no such file or folder; `unknown` names what could not be asked, and why.
 * @typedef {{ made: 'by-dpkg', package: string }
 *   | { made: 'by-windows', entry: string }
 *   | { made: 'in-an-appimage', folder: string }
 *   | { made: 'by-none' }
 *   | { made: 'unknown', couldNotAsk: string, because: string }} WhatMadeAFolder
 */

/**
 * The question for one system: what made `folder`, asked by `aFileInIt` where the installer keeps a list of files.
 * @typedef {(folder: string, aFileInIt: string) => Promise<WhatMadeAFolder>} AnInstallerMade
 */

/** Where the office is inside the folder the Windows installer installs into. */
export const THE_OFFICE_IN_THE_INSTALLED_FOLDER = Object.freeze(['resources', 'office'])

/** How long dpkg-query may take before it is a question that could not be asked. */
const THE_LONGEST_DPKG_TAKES = 20_000

/** The line the Windows script prints last, so a list cut short is not read as a whole one. */
const THE_LIST_IS_WHOLE = 'listed'

/** The first line of what a command wrote to its error stream, or `fallback` when it wrote none. */
const theFirstLineOf = (/** @type {string} */ stderr, /** @type {string} */ fallback) =>
  (stderr.split(/\r?\n/u).find((line) => line.trim() !== '') ?? fallback).trim().slice(0, 300)

/**
 * THE APPIMAGE'S OWN FOLDER THAT HOLDS A FOLDER, from APPIMAGE and APPDIR as they are when it is asked, or null when
 * the folder is in no AppImage's folder. That folder is a mount with FUSE, and a folder the AppImage unpacked itself to
 * with APPIMAGE_EXTRACT_AND_RUN. Nothing is run. The office's start asks only this (../install-the-entry.mjs), so a
 * start outside an AppImage never asks dpkg.
 * @param {string} folder
 * @returns {string | null}
 */
export function theAppImageFolderHolding(folder) {
  const image = process.env['APPIMAGE'] ?? ''
  const own = process.env['APPDIR'] ?? ''
  if (image === '' || own === '') return null
  const inside = relative(own, folder)
  return inside !== '..' && !inside.startsWith('../') && !isAbsolute(inside) ? own : null
}

/**
 * `dpkg-query -S <file>`, started by the way that waits. The answer is what it printed and how it ended, or why it
 * could not be run, or why it did not finish.
 * @param {string} aFileInIt
 * @returns {Promise<{ couldNotRun: string } | { didNotFinish: string } | { status: number, stdout: string, stderr: string }>}
 */
function askDpkg(aFileInIt) {
  return new Promise((answer) => {
    const child = spawn('dpkg-query', ['-S', aFileInIt], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (/** @type {string} */ chunk) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (/** @type {string} */ chunk) => { stderr += chunk })
    let tooLong = false
    const timer = setTimeout(() => {
      tooLong = true
      child.kill('SIGKILL')
    }, THE_LONGEST_DPKG_TAKES)
    // A program that cannot be started gives 'error' and may give 'close' after it; only the first is answered.
    let answered = false
    child.once('error', (e) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      answer({ couldNotRun: e.message })
    })
    child.once('close', (status, signal) => {
      if (answered) return
      answered = true
      clearTimeout(timer)
      if (tooLong) answer({ didNotFinish: `stopped, because it ran longer than ${String(THE_LONGEST_DPKG_TAKES)} ms` })
      else if (status === null) answer({ didNotFinish: `killed by ${String(signal)}` })
      else answer({ status, stdout, stderr })
    })
  })
}

/**
 * THE LINUX QUESTION. The AppImage's own folder is looked at first (theAppImageFolderHolding); then dpkg is asked about
 * the file.
 * @param {string} folder
 * @param {string} aFileInIt
 * @returns {Promise<WhatMadeAFolder>}
 */
export async function linuxInstallerMade(folder, aFileInIt) {
  const own = theAppImageFolderHolding(folder)
  if (own !== null) return { made: 'in-an-appimage', folder: own }
  const r = await askDpkg(aFileInIt)
  if ('couldNotRun' in r) return { made: 'unknown', couldNotAsk: 'dpkg', because: `dpkg-query could not be run: ${r.couldNotRun}` }
  if ('didNotFinish' in r) return { made: 'unknown', couldNotAsk: 'dpkg', because: `dpkg-query did not finish (${r.didNotFinish})` }
  if (r.status === 1) return { made: 'by-none' }
  if (r.status !== 0) return { made: 'unknown', couldNotAsk: 'dpkg', because: theFirstLineOf(r.stderr, `dpkg-query ended with ${String(r.status)}`) }
  // A line names the packages that hold the file, as "<packages>: <file>". A diversion's lines name the file too.
  const holds = r.stdout.split('\n').find((line) => line.endsWith(`: ${aFileInIt}`) && !line.startsWith('diversion '))
  if (holds === undefined) {
    return { made: 'unknown', couldNotAsk: 'dpkg', because: `dpkg-query ended with 0 and named no package that holds ${aFileInIt}` }
  }
  return { made: 'by-dpkg', package: holds.slice(0, holds.length - `: ${aFileInIt}`.length) }
}

/**
 * The script that prints `entry<TAB><key><TAB><InstallLocation>` for each entry of this user's Installed apps that has
 * one, and then `listed`. It reads the list and writes nothing.
 * @returns {string}
 */
export function theScriptThatListsTheInstalledApps() {
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    "  $list = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'",
    '  if (Test-Path -LiteralPath $list) {',
    '    foreach ($key in Get-ChildItem -LiteralPath $list) {',
    "      $location = $key.GetValue('InstallLocation')",
    "      if ($location -is [string] -and $location -ne '') { \"entry`t$($key.PSChildName)`t$location\" }",
    '    }',
    '  }',
    `  '${THE_LIST_IS_WHOLE}'`,
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\n')
}

/**
 * A WINDOWS PATH AS WINDOWS COMPARES IT: one spelling of its separators, no backslash at its end, any case of letters.
 * This is the one place it is worked out. The installer's question below compares the installed folder by it, and the
 * Windows probe compares the installed app's program by it (src/server/lib/windows-probe.ts).
 * @param {string} path a Windows path, in any spelling
 * @returns {string}
 */
export function theWindowsSpelling(path) {
  return win32.normalize(path).replace(/\\+$/u, '').toLowerCase()
}

/**
 * THE WINDOWS QUESTION. The folder is the office an installer made when an entry's InstallLocation, with
 * resources\office joined to it, is the folder. Windows reads a path in any case, so the case is not compared.
 * @param {WindowsCommands} [commands] the PowerShell to run, which a test stands in
 * @returns {AnInstallerMade}
 */
export function windowsInstallerQuestion(commands = theRealWindowsCommands()) {
  const couldNotAsk = "Windows's list of installed apps"
  return async (folder) => {
    const did = await commands.startPowerShell(theScriptThatListsTheInstalledApps())
    if (!did.ran) return { made: 'unknown', couldNotAsk, because: did.reason }
    if (did.status !== 0) return { made: 'unknown', couldNotAsk, because: theFirstLineOf(did.stderr, `PowerShell ended with ${String(did.status)}`) }
    const lines = did.stdout.split(/\r?\n/u).filter((line) => line !== '')
    if (lines.at(-1) !== THE_LIST_IS_WHOLE) return { made: 'unknown', couldNotAsk, because: 'PowerShell ended with 0 but did not finish the list' }
    const wanted = theWindowsSpelling(folder)
    for (const line of lines) {
      const [word, entry, ...location] = line.split('\t')
      if (word !== 'entry' || entry === undefined || location.length === 0) continue
      if (theWindowsSpelling(win32.join(location.join('\t'), ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)) === wanted) return { made: 'by-windows', entry }
    }
    return { made: 'by-none' }
  }
}

/**
 * THE MAC'S ANSWER, and any other system's but Linux and Windows: nothing is asked, and the answer says so.
 * @param {string} system the system's name in the answer, such as "the Mac"
 * @returns {AnInstallerMade}
 */
export function noInstallerQuestion(system) {
  return async () => ({ made: 'unknown', couldNotAsk: system, because: `no way to ask ${system} is written yet` })
}
