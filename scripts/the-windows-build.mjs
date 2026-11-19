// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT THE WINDOWS INSTALLER IS MADE FROM, in one place (wave 13t, round W13, item 18).
 * scripts/package-windows.mjs asks this, and tests/the-windows-package.test.ts reads it on Linux.
 *
 * The rules it follows: the Windows beta ships unsigned, with a one-page install note
 * it installs for one person, asks for no administrator, and the office runs from
 * sign-in to sign-out.
 *
 * The installer is made on Linux, by electron-builder's NSIS target with Mole Office's own script,
 * scripts/windows-installer.nsi, which says why it has its own. The facts that script needs and that are
 * decided elsewhere are written in front of it here (theInstallerFacts), so none of them is typed twice.
 */

import { readFileSync } from 'node:fs'
import { join, relative, sep, win32 } from 'node:path'
import { THE_BUNDLES, THE_COMMAND_ENTRY, settingNamed, thePerUserDataFolder, theShippedNodeIn } from '../src/config/settings.mjs'
import { EXIT, STOP_PIPE_WAIT_MS, STOP_WAIT_MS, THE_HOLDER_ENDS_WITHIN_MS } from '../src/config/the-service-command.mjs'
import { THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC, THE_LANGUAGES_CARRIED } from './the-packed-app.mjs'
import { theMapInTheOffice } from './the-office-map-part.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER } from '../src/config/systems/the-installer-of-a-folder.mjs'

/**
 * electron-builder's NSIS toolset: NSIS 3.12 for Linux, which electron-builder downloads and checks
 * against the SHA-256 it pins for it (app-builder-lib, toolsets/windows.js).
 */
export const THE_NSIS_TOOLSET = '1.2.1'

/**
 * The name a person reads: in the Start menu, on the Desktop, in Settings' Installed apps, and in what the
 * installer says. It is the name the window gives itself (app.setName in src/desktop/main.mjs).
 */
export const THE_PRODUCT_NAME = 'Mole Office'

/** The window's program in the installed folder, as electron-builder names it from the app's productName. */
export const THE_WINDOWS_EXECUTABLE = 'mole-office.exe'

/**
 * How much longer than the stop command's waits the installer waits for it: Node's own start, and the command's.
 * The waits are the one for the office's stop pipe to be there, the one for the office to end, and the one for the
 * holder to end.
 */
const THE_STOP_COMMANDS_START_MS = 15_000

/**
 * Why the Windows installer cannot be made on this machine, or null when it can. It is made on Linux on
 * a 64-bit Intel or AMD processor, the one machine it has been made and tried from.
 *
 * @param {{ platform: string, arch: string }} machine
 * @returns {string | null}
 */
export function theWindowsBuildRefusal({ platform, arch }) {
  if (platform !== 'linux') return `The Windows installer is made on Linux, and this machine is ${platform}.`
  if (arch !== 'x64') return `The Windows installer is made on Linux on an x64 processor, and this one is ${arch}.`
  return null
}

/**
 * Electron's Windows zip for the Electron the checkout has installed: its name, the address it is
 * downloaded from, and the SHA-256 the electron package pins for it in checksums.json.
 *
 * @param {string} electron the electron package's folder
 * @returns {{ name: string, url: string, digest: { algorithm: 'sha256', encoding: 'hex', value: string }, version: string }}
 */
export function theElectronZip(electron) {
  const { version } = /** @type {{ version: string }} */ (JSON.parse(readFileSync(join(electron, 'package.json'), 'utf8')))
  const name = `electron-v${version}-win32-x64.zip`
  const sums = /** @type {Record<string, unknown>} */ (JSON.parse(readFileSync(join(electron, 'checksums.json'), 'utf8')))
  const value = sums[name]
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${join(electron, 'checksums.json')} pins no SHA-256 for ${name}.`)
  return { name, version, url: `https://github.com/electron/electron/releases/download/v${version}/${name}`, digest: { algorithm: 'sha256', encoding: 'hex', value } }
}

/** Where the office's data folder is under %APPDATA% on Windows, from the function that decides it. */
function theDataFolderUnderAppData() {
  const base = 'APPDATA'
  return relative(base, thePerUserDataFolder({ APPDATA: base }, 'win32')).split(sep).join('\\')
}

/**
 * The default database, as the folder it is in under the per-user folder and its file name, from the setting
 * that decides it. With no `MOLE_OFFICE_DB` line the database is that file in that folder.
 */
function theDefaultDatabase() {
  const fallback = win32.normalize(String(settingNamed('MOLE_OFFICE_DB').fallback))
  return { folder: win32.dirname(fallback), file: win32.basename(fallback) }
}

/**
 * THE FACTS ABOVE THE INSTALLER'S SCRIPT, each from the place that decides it: where the office, the shipped
 * Node and the `mole-office` command are in the installed folder, where the office keeps its data under
 * %APPDATA%, the default data folder in it and the database's name, how long the stop command may take, and
 * the stop command's exit codes that let the installer go on.
 *
 * @returns {Record<string, string>}
 */
export function theInstallerFacts() {
  const office = THE_OFFICE_IN_THE_INSTALLED_FOLDER
  return {
    THE_NAME: THE_PRODUCT_NAME,
    THE_DATA_FOLDER: theDataFolderUnderAppData(),
    THE_DEFAULT_DATA_FOLDER: theDefaultDatabase().folder,
    THE_DATABASE: theDefaultDatabase().file,
    THE_OFFICE: office.join('\\'),
    THE_NODE: [...office, ...theShippedNodeIn('win32')].join('\\'),
    THE_COMMAND: [...office, THE_BUNDLES[THE_COMMAND_ENTRY]].join('\\'),
    THE_STOP_WAIT_MS: String(STOP_PIPE_WAIT_MS + STOP_WAIT_MS + THE_HOLDER_ENDS_WITHIN_MS + THE_STOP_COMMANDS_START_MS),
    THE_STOPPED: String(EXIT.OK),
    THE_NOT_RUNNING: String(EXIT.NOT_RUNNING),
    THE_STALE: String(EXIT.STALE),
    THE_HOLDER_NOT_STOPPED: String(EXIT.HOLDER_NOT_STOPPED),
  }
}

/**
 * The installer's script: the facts as NSIS !define lines, then the script. A fact NSIS would read as more
 * than its words (a quote, a dollar sign, the end of a line) is refused, not escaped.
 *
 * @param {string} template scripts/windows-installer.nsi
 * @param {Record<string, string>} facts
 */
export function theInstallerScript(template, facts) {
  const lines = ['; THE FACTS ABOVE THIS SCRIPT, written by scripts/the-windows-build.mjs (theInstallerFacts).']
  for (const [name, value] of Object.entries(facts)) {
    if (!/^[A-Z_]+$/.test(name)) throw new Error(`${name} is not a name the installer's script uses.`)
    if (/["$\r\n`']/.test(value)) throw new Error(`The installer's fact ${name} holds ${JSON.stringify(value)}, which NSIS would not read as it is.`)
    lines.push(`!define ${name} "${value}"`)
  }
  return `${lines.join('\n')}\n\n${template}`
}

/**
 * THE OFFICE MAP'S FACTS ABOVE THE INSTALLER'S SCRIPT, beside theInstallerFacts: where the map goes in the installed
 * folder, from the place the office reads its plugins (scripts/the-office-map-part.mjs, theMapInTheOffice), and the
 * folder the map's files are taken from while the installer is made, which scripts/package-windows.mjs stages.
 *
 * @param {string} staged
 * @returns {Record<string, string>}
 */
export function theMapFacts(staged) {
  return {
    THE_MAP: [...THE_OFFICE_IN_THE_INSTALLED_FOLDER, ...theMapInTheOffice()].join('\\'),
    THE_MAP_FILES: staged,
  }
}

/** @param {string} state a fuse's state in THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC */
const isOn = (state) => state === 'on'

/**
 * electron-builder's configuration for the Windows installer: the per-user NSIS target, unsigned, with
 * Mole Office's own script and the fuses the Linux installers have, but with RunAsNode off.
 *
 * @param {{ app: string, out: string, work: string, electronVersion: string, electronZip: string, script: string, icon: string }} where
 */
export function theWindowsBuilderConfig({ app, out, work, electronVersion, electronZip, script, icon }) {
  return {
    appId: 'office.mole.desktop',
    productName: 'mole-office',
    artifactName: 'mole-office-${version}-${arch}-setup.${ext}',
    directories: { app, output: out },
    electronVersion,
    // THE ZIP ITSELF, downloaded and checked by scripts/package-windows.mjs, so electron-builder downloads no Electron.
    electronDist: electronZip,
    asar: true,
    npmRebuild: false,
    // From the staging folder, not office/ itself, as on Linux (scripts/package-linux.mjs says why).
    extraResources: [{ from: work, to: '.', filter: ['office/**/*'] }],
    // ELECTRON'S LANGUAGES: the ten THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs names, and no other.
    electronLanguages: [...THE_LANGUAGES_CARRIED],
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      icon,
      // UNSIGNED: electron-builder neither signs nor asks for a certificate.
      signExecutable: false,
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      allowElevation: false,
      packElevateHelper: false,
      // MOLE OFFICE'S OWN SCRIPT, with its facts in front (theInstallerScript). Given a script, electron-builder
      // runs no first installer under wine to write the uninstaller.
      script,
      differentialPackage: false,
    },
    toolsets: { nsis: THE_NSIS_TOOLSET },
    electronFuses: {
      runAsNode: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.RunAsNode),
      enableNodeOptionsEnvironmentVariable: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableNodeOptionsEnvironmentVariable),
      enableNodeCliInspectArguments: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableNodeCliInspectArguments),
      enableEmbeddedAsarIntegrityValidation: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.EnableEmbeddedAsarIntegrityValidation),
      onlyLoadAppFromAsar: isOn(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC.OnlyLoadAppFromAsar),
    },
  }
}

/**
 * Every execution level a Windows program's manifest asks for, read from its bytes: "asInvoker" runs it
 * with the rights of whoever starts it, and "requireAdministrator" or "highestAvailable" make Windows ask
 * for an administrator. A program with no manifest asks for none.
 *
 * @param {Buffer} program
 * @returns {string[]}
 */
export function theExecutionLevelsIn(program) {
  const text = program.toString('latin1')
  return [...text.matchAll(/requestedExecutionLevel\s+level\s*=\s*["']([A-Za-z]+)["']/g)].map((found) => String(found[1]))
}
