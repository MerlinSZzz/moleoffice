// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * `npm run package:windows`: THE WINDOWS INSTALLER, ONE .exe THAT INSTALLS MOLE OFFICE FOR ONE PERSON,
 * CARRYING ITS OWN NODE. Wave 13t, round W13, item 18: the Windows beta ships
 * unsigned, with a one-page install note; it installs for one person and never asks for an
 * administrator, and the office runs from sign-in to sign-out.
 *
 *   node scripts/package-windows.mjs [--out <folder>] [--owner-content-verdict <file>]      default: dist/installers in this checkout
 *
 * It runs on Linux on an x64 processor (scripts/the-windows-build.mjs, theWindowsBuildRefusal). It needs
 * `npm run build` first, as `npm run bundle` does, and a network to nodejs.org, to GitHub for Electron's
 * Windows zip and electron-builder's NSIS toolset, and to npm's registry for the avatar codec's Windows
 * package. Every download is checked against a hash fixed before it: the SHA-256 in Node's SHASUMS256.txt,
 * the SHA-256 node_modules/electron/checksums.json pins, the sha512 package-lock.json locks, and the
 * SHA-256 electron-builder pins for its own toolsets. A download that does not match stops the build.
 *
 * IT WRITES INTO THE HOME FOLDER. It caches Electron's Windows zip under homedir()/.cache/mole-office/electron
 * (step 4), Node's Windows zip under homedir()/.cache/mole-office/node (scripts/the-shipped-node.mjs) and the avatar
 * codec's package under homedir()/.cache/mole-office/npm (scripts/bundle.mjs), and npx and electron-builder keep
 * their own caches there. So a run that must leave the person's home alone, such as a check of a clone, needs a
 * throw-away HOME. It needs no Electron runtime in node_modules/electron/dist: it packs from the zip.
 *
 * Step 0 checks the built page and runs every plain privacy file against this checkout before
 * bundling, as scripts/package-linux.mjs does, and for the same reason.
 *
 * With --owner-content-verdict, step 0 takes the host screen's verdict for the tree it packs. The
 * verdict lets through only a file whose every case was taken out because the owner's list was not
 * read, and a red file still refuses (scripts/the-owner-content-verdict.mjs).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN INSTALLED MOLE OFFICE IS
 * ---------------------------------------------------------------------------------------
 *
 * The same as on Linux (scripts/package-linux.mjs says it): one small loader, main.cjs, in app.asar, and
 * the office beside it in resources/office: the bundle `node scripts/bundle.mjs --for win32-x64` makes,
 * and the Node it runs on, node.exe, where theShippedNodeIn in src/config/settings.mjs says, with Node's
 * licence beside it. It installs into the folder the person chooses, by default
 * %LOCALAPPDATA%\Programs\mole-office, and an update into the folder already installed. It keeps its
 * data in %APPDATA%\mole-office (thePerUserDataFolder in src/config/settings.mjs).
 *
 * THE INSTALLER is electron-builder's NSIS target with Mole Office's own script,
 * scripts/windows-installer.nsi, which says what it does and why it is Mole Office's own. Its manifest
 * asks Windows for the rights of whoever starts it and no more ("asInvoker"), and this script reads that
 * back from the .exe it made.
 *
 * ELECTRON'S FUSES are the Linux installers' with RunAsNode off (scripts/the-packed-app.mjs,
 * THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC), read back from the packed mole-office.exe.
 *
 * THE OFFICE MAP is a part of its own on the installer's components page, unticked on a first install. This
 * script builds it with its own build and gives the installer its manifest and built folder
 * (scripts/the-office-map-part.mjs says why it is a choice, and windows-installer.nsi how the part works).
 *
 * WHAT CANNOT BE RUN HERE, because the programs are Windows programs: the shipped Node, the office's
 * database through better-sqlite3, and a shell through node-pty. This script says each is not run. They
 * are run on a Windows machine, by installing what this makes.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { developmentMaterialIn, theRefusal } from './no-development-material.mjs'
import { THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC, whatThePackedAppGetsWrong } from './the-packed-app.mjs'
import { REPO_ROOT, THE_HOLDER_BUNDLE, THE_INSTALL } from '../src/config/settings.mjs'
import { putTheShippedNodeInto } from './the-shipped-node.mjs'
import { thePtyNativeFile, thePtyWindowsParts, THE_PTY_MODULE } from './the-terminal-in-a-bundle.mjs'
import { missingWebBuild, THE_BUILT_PAGE } from '../src/config/the-built-page.mjs'
import { runTheOwnerContentStep } from './the-owner-content-verdict.mjs'
import { fetchChecked } from './checked-downloads.mjs'
import { THE_WINDOWS_TARGET, theTargetsName } from './the-bundle-target.mjs'
import { stageTheMap, whatThePluginsGetWrong } from './the-office-map-part.mjs'
import {
  THE_WINDOWS_EXECUTABLE,
  theElectronZip,
  theExecutionLevelsIn,
  theInstallerFacts,
  theInstallerScript,
  theMapFacts,
  theWindowsBuilderConfig,
  theWindowsBuildRefusal,
} from './the-windows-build.mjs'

/** The electron-builder this script runs, through npx, so the checkout's node_modules is not changed. */
const ELECTRON_BUILDER = 'electron-builder@26.15.3'

/** @param {string} line */
const say = (line) => process.stdout.write(`${line}\n`)

/** A refusal: it is thrown, so the staging folder is still removed, and said once at the bottom. */
class Refused extends Error {}

/** @param {string} line @returns {never} */
function fail(line) {
  throw new Refused(line)
}

/** The stand-in homepage of scripts/package-linux.mjs, which says why it is one. */
const HOMEPAGE = 'https://mole-office.invalid/'

/** The installers electron-builder writes, by the name theWindowsBuilderConfig's artifactName gives them. */
const MADE = /^mole-office-.*-setup\.exe$/

process.on('uncaughtException', (err) => {
  process.stderr.write(`${err instanceof Refused ? err.message : String(err.stack ?? err)}\nNo installer was made.\n`)
  process.exit(1)
})

if (THE_INSTALL.from !== 'checkout') fail('Installers are made from a checkout, and this is not one.')
const refusal = theWindowsBuildRefusal({ platform: process.platform, arch: process.arch })
if (refusal !== null) fail(refusal)

const at = process.argv.indexOf('--out')
const out = at === -1 ? join(REPO_ROOT, 'dist', 'installers') : resolve(String(process.argv[at + 1] ?? ''))
if (at !== -1 && (process.argv[at + 1] ?? '') === '') fail('--out needs a folder.')
const verdictAt = process.argv.indexOf('--owner-content-verdict')
const verdictFile = verdictAt === -1 ? null : resolve(String(process.argv[verdictAt + 1] ?? ''))
if (verdictAt !== -1 && (process.argv[verdictAt + 1] ?? '') === '') fail('--owner-content-verdict needs a file.')
mkdirSync(out, { recursive: true })
const work = mkdtempSync(join(out, '.work-'))
const office = join(work, 'office')
const app = join(work, 'app')

/** Removes every installer this script made in `out`, when what it made must not ship. */
const removeTheInstallers = () => {
  for (const file of readdirSync(out)) if (MADE.test(file) || /^mole-office-.*-setup\.exe\.blockmap$/.test(file)) rmSync(join(out, file))
}

try {
  // 0. THE BUILT PAGE, THEN EVERY PLAIN PRIVACY FILE AGAINST THIS CHECKOUT.
  const missingPage = missingWebBuild(THE_BUILT_PAGE)
  if (missingPage !== null) fail(missingPage)
  const ownerContent = runTheOwnerContentStep({ root: REPO_ROOT, work, say, verdictPath: verdictFile })
  if (ownerContent.refused !== null) fail(ownerContent.refused)

  // 1. THE BUNDLE, FOR WINDOWS x64.
  const bundled = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'bundle.mjs'), '--out', office, '--for', theTargetsName(THE_WINDOWS_TARGET)], { stdio: 'inherit' })
  if (bundled.status !== 0) fail('The bundle for Windows failed; it says why above.')

  // 2. THE SHIPPED NODE, node.exe from Node's Windows zip, checked against its SHA-256 (scripts/the-shipped-node.mjs).
  try {
    await putTheShippedNodeInto(office, 'win32', 'x64', say)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  // 2a. THE TERMINAL: the bundle carries the holder and node-pty's Windows files. No shell can be opened through them here.
  if (!existsSync(join(office, THE_HOLDER_BUNDLE))) fail(`The bundle holds no ${THE_HOLDER_BUNDLE}, so the installed office could not hold terminals.`)
  for (const part of [thePtyNativeFile('win32', 'x64'), ...thePtyWindowsParts('win32', 'x64')]) {
    if (!existsSync(join(office, 'node_modules', THE_PTY_MODULE, part))) fail(`The bundle's ${THE_PTY_MODULE} has no ${part}, so the installed office could not open a terminal.`)
  }
  say(`NOT RUN: no shell was opened through the bundle's ${THE_PTY_MODULE}, whose files are for Windows. A terminal is opened in the installed office on Windows.`)

  // 3. THE APP: one loader that imports the bundled window from resources/office.
  const own = /** @type {{ version: string, description: string, license: string }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')))
  mkdirSync(app)
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'mole-office', productName: 'mole-office', version: own.version, description: own.description, license: own.license, homepage: HOMEPAGE, author: { name: 'Mole Office' }, main: 'main.cjs' }, null, 2)}\n`,
  )
  writeFileSync(
    join(app, 'main.cjs'),
    [
      '// The window of an installed Mole Office. The office itself is beside this app, in resources/office:',
      '// its bundles, its own Node and its build stamp. scripts/package-windows.mjs in the checkout made both.',
      "const { join } = require('node:path')",
      "const { pathToFileURL } = require('node:url')",
      "import(pathToFileURL(join(process.resourcesPath, 'office', 'window.mjs')).href)",
      '',
    ].join('\n'),
  )

  // 4. ELECTRON'S WINDOWS ZIP, downloaded once into ~/.cache/mole-office/electron and checked every time.
  const zip = theElectronZip(join(REPO_ROOT, 'node_modules', 'electron'))
  const electronZip = join(homedir(), '.cache', 'mole-office', 'electron', zip.name)
  try {
    await fetchChecked({ url: zip.url, file: electronZip, digest: zip.digest, say })
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  // 4a. THE OFFICE MAP, built and staged beside office/, so it is not one of the extra resources: the installer's own
  // part carries it (scripts/the-office-map-part.mjs).
  const map = join(work, 'office-map')
  try {
    stageTheMap(map)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }

  // 5. THE INSTALLER: the script with its facts in front, then electron-builder.
  const script = join(work, 'windows-installer.nsi')
  writeFileSync(script, theInstallerScript(readFileSync(join(REPO_ROOT, 'scripts', 'windows-installer.nsi'), 'utf8'), { ...theInstallerFacts(), ...theMapFacts(map) }))
  const config = theWindowsBuilderConfig({ app, out, work, electronVersion: zip.version, electronZip, script, icon: join(REPO_ROOT, 'assets', 'mole-office.png') })
  const configFile = join(work, 'electron-builder.json')
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  const built = spawnSync('npx', ['--yes', ELECTRON_BUILDER, '--win', '--x64', '--config', configFile, '--projectDir', app], {
    stdio: 'inherit',
    timeout: 20 * 60_000,
  })
  if (built.status !== 0) fail(`${ELECTRON_BUILDER} failed; it says why above.`)
  const installer = readdirSync(out).find((file) => MADE.test(file) && file.startsWith(`mole-office-${own.version}-`))
  if (installer === undefined) fail(`${ELECTRON_BUILDER} made no installer in ${out}.`)

  // 6. WHAT WAS PACKED IS WHOLE: every file the installer's script looks for after unpacking is in win-unpacked.
  const unpacked = join(out, 'win-unpacked')
  const facts = theInstallerFacts()
  for (const file of [THE_WINDOWS_EXECUTABLE, join('resources', 'app.asar'), String(facts['THE_NODE']), String(facts['THE_COMMAND'])]) {
    if (!existsSync(join(unpacked, ...file.split('\\')))) {
      removeTheInstallers()
      fail(`The packed app has no ${file}. The installer just made was removed.`)
    }
  }
  say(`NOT RUN: the packed office's Node did not open a database, because node.exe and better-sqlite3's win32-x64 file are Windows programs.`)

  // 7. NO DEVELOPMENT MATERIAL in what was packed (scripts/no-development-material.mjs), as on Linux.
  const packed = join(unpacked, 'resources', 'office')
  const carried = [...developmentMaterialIn({ root: REPO_ROOT, folder: packed }), ...developmentMaterialIn({ root: REPO_ROOT, folder: app })]
  // The office map's part is in the installer and not in win-unpacked, so its staged files are read too.
  carried.push(...developmentMaterialIn({ root: REPO_ROOT, folder: map }))
  if (carried.length > 0) {
    removeTheInstallers()
    fail(`${theRefusal('The installer', carried)} The installer just made was removed.`)
  }
  say(`The packed app carries nothing from tests/, tools/ or design/ (${packed} and the app folder were read).`)
  say(`The office map's part carries nothing from tests/, tools/ or design/ (${map} was read).`)

  // 8. WHAT THE PACKED APP CARRIES, read back: its fuses from mole-office.exe, its version in app.asar and
  // the licences (scripts/the-packed-app.mjs); and that the installer asks Windows for no administrator.
  const wrong = whatThePackedAppGetsWrong({ unpacked, root: REPO_ROOT, version: own.version, executable: THE_WINDOWS_EXECUTABLE, fuses: THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC })
  const levels = theExecutionLevelsIn(readFileSync(join(out, installer)))
  if (levels.length !== 1 || levels[0] !== 'asInvoker') wrong.push(`The installer's manifest asks for ${levels.length === 0 ? 'no execution level' : levels.join(' and ')}, not asInvoker alone, so Windows could ask for an administrator.`)
  // The office map is the installer's own part, so the packed office carries no plugin (scripts/the-office-map-part.mjs).
  wrong.push(...whatThePluginsGetWrong({ office: packed, withTheMap: false }))
  if (wrong.length > 0) {
    removeTheInstallers()
    fail(`${wrong.join(' ')} The installer just made was removed.`)
  }
  say(`The packed app carries the fuses it was made with, version ${own.version}, Mole Office's LICENSE and NOTICE, the third-party notices, and Electron's and Chromium's licences. The installer asks for asInvoker alone.`)
  say(`The packed office carries no plugin; the office map is the installer's own part.`)

  say(`Made ${join(out, installer)}: ${String(statSync(join(out, installer)).size)} bytes. It is not signed.`)
} finally {
  // The staging folder is this script's own, made above; the installer stays.
  rmSync(work, { recursive: true, force: true })
}
