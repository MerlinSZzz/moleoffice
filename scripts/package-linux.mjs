// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * `npm run package:linux`: THE LINUX INSTALLERS, A .deb AND AN AppImage, WHOSE APP IS ALSO THE OFFICE'S NODE.
 * Packaging step 2 of the closed-beta plan (record l1RSxzw-j4P7, block b-8, row 3) and the
 * build-shape decision zjs1me8BC6UQ: esbuild bundles on a shipped Node, electron-builder, Linux first.
 *
 *   node scripts/package-linux.mjs [--out <folder>] [--owner-content-verdict <file>]      default: dist/installers in this checkout
 *
 * It needs `npm run build` first, as `npm run bundle` does; `ar` from binutils, with which the .deb is
 * written; `dpkg-deb`, with which its version is read back; and a network to the places electron-builder fetches its own packaging
 * tools from. Electron 44 has no install hook, so after `npm ci` its runtime is not in node_modules; step 2 puts it in
 * with Electron's own installer when it is missing, and says so (scripts/the-electron-runtime.mjs).
 *
 * Step 0 checks the built page and runs every plain privacy file against this checkout before
 * bundling. Two privacy files start the bundle themselves, so running them inside bundle.mjs
 * would start a loop. Only the packagers run this check; npm run bundle remains a bundle alone.
 *
 * With --owner-content-verdict, step 0 takes the host screen's verdict for the tree it packs. The
 * verdict lets through only a file whose every case was taken out because the owner's list was not
 * read, and a red file still refuses (scripts/the-owner-content-verdict.mjs).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN INSTALLED MOLE OFFICE IS
 * ---------------------------------------------------------------------------------------
 *
 * Electron's app folder holds one small loader, main.cjs, and nothing else. The office itself is
 * beside it, as an extra resource, `resources/office/`, copied as it is:
 *
 *   - the bundle `npm run bundle` makes (scripts/bundle.mjs), with its stamp, so the office knows it
 *     runs from a bundle and keeps its data in the per-user data folder (src/config/settings.mjs,
 *     THE INSTALL AND ITS DATA).
 *
 * The loader imports `resources/office/window.mjs`, the bundled window. The window runs the bundled
 * `mole-office` command with the app's own program, told to run as Node by ELECTRON_RUN_AS_NODE=1
 * (`theInstallsNode` in src/config/settings.mjs), never a Node on PATH. The service and the worker run
 * on it too, and the installers carry no other Node.
 *
 * WHY THE OFFICE IS NOT INSIDE THE APP FOLDER. electron-builder rebuilds the app folder from its
 * package.json, and drops any node_modules that package.json does not declare. The office needs its
 * better-sqlite3 exactly as the bundle copied it, so the office is an extra resource, which
 * electron-builder copies byte for byte.
 *
 * THE OFFICE MAP'S .deb. Beside the office's own .deb this makes mole-office-map-<version>-amd64.deb on an x64
 * machine, which puts the office map into resources/office/plugins and needs mole-office at the same version. It
 * is made with dpkg-deb, from the map's own build (scripts/the-office-map-part.mjs says why the map is a package
 * of its own). The AppImage carries no map.
 *
 * ---------------------------------------------------------------------------------------
 * ELECTRON'S FUSES
 * ---------------------------------------------------------------------------------------
 *
 * Set as the beta plan l1RSxzw-j4P7, item 4 asks, and read back from the packed binary after the
 * installers are made (scripts/the-packed-app.mjs, THE_FUSES_SET):
 *   - RunAsNode ON. The installers carry no Node of their own, so the office runs on the app's own
 *     program, told to run as Node. Any program of the same user can then run a script with the app's
 *     rights. The Windows and Mac installers carry a Node, and keep this fuse off.
 *   - NODE_OPTIONS OFF: nothing in the app reads it.
 *   - Node's inspector arguments OFF (--inspect and its kin), so no program can attach to the window's
 *     main process. The container test of the installed window needs them, so it drives a copy of the
 *     binary with that one fuse turned back on (tests/installed/run-in-a-container.sh), never the
 *     binary that ships.
 *   - The asar integrity check ON, and only load the app from its asar ON. The loader is in app.asar;
 *     nothing else is the app. On Linux, Electron 44 does not check the archive against its hash even
 *     with the fuse on: a changed app.asar still ran in a trial (wave 13t, round 15). So on Linux the
 *     integrity fuse is set, as asked, but protects nothing yet.
 *
 * The bundled office under resources/office/ is not covered by any fuse. Signing is a later round.
 *
 * ar and dpkg-deb are looked up in the whole environment by `whereIsThisTool` (src/config/runtimes.mjs), which reads
 * `PATH` alone on Linux.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { whereIsThisTool } from '../src/config/runtimes.mjs'
import { developmentMaterialIn, theRefusal } from './no-development-material.mjs'
import { THE_APPIMAGE_TOOLSET, THE_ICON_THEMES_SIZES, THE_LANGUAGES_CARRIED, whatThePackedAppGetsWrong } from './the-packed-app.mjs'
import { onASquare, readAPng, writeAPng } from './the-mac-build.mjs'
import { REPO_ROOT, THE_BUNDLES, THE_COMMAND_ENTRY, THE_HOLDER_BUNDLE, THE_INSTALL, theInstallsNode } from '../src/config/settings.mjs'
import { theShellAnswersThroughThePty } from './the-terminal-in-a-bundle.mjs' // wave 13u: the terminal
import { missingWebBuild, THE_BUILT_PAGE } from '../src/config/the-built-page.mjs'
import { runTheOwnerContentStep } from './the-owner-content-verdict.mjs'
import { putInElectronsRuntime } from './the-electron-runtime.mjs'
import { makeTheMapsDeb, stageTheMap, theOfficeInTheDeb, whatTheMapsDebGetsWrong, whatThePluginsGetWrong } from './the-office-map-part.mjs'
import { theInstalledFolder, theOfficesDebOptions, whatTheDebsScriptsGetWrong } from './the-debs-stop.mjs'

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

/**
 * THE PACKAGE'S HOMEPAGE, which a .deb must name. Mole Office has no public page yet, so this is a
 * reserved address that can never be a real site (RFC 2606) and says so by its ending. It is a
 * stand-in until the product has a page, not a page.
 */
const HOMEPAGE = 'https://mole-office.invalid/'

/**
 * THE NAME THE PACKAGE INSTALLS UNDER, with no space: the .deb installs to /opt/<this>. With the name
 * "Mole Office" it installed to "/opt/Mole Office", and where Ubuntu refuses user namespaces Chromium's
 * setuid sandbox helper cut that path at the space and the window never opened (a container test
 * of 4 October 2026). What a person reads stays "Mole Office": the desktop entry's Name below, and the
 * name the window gives itself (app.setName in src/desktop/main.mjs).
 */
const PACKAGE_NAME = 'mole-office'

/** Where the .deb installs the app, and where its stop looks for a running office (scripts/the-debs-stop.mjs). */
const THE_INSTALLED_FOLDER = `/opt/${PACKAGE_NAME}`

/**
 * WHAT THE .deb DEPENDS ON: electron-builder's own list for Electron (FpmTarget.getDefaultDepends in
 * electron-builder 26.15.3), and ALSA, which Electron loads at start and that list leaves out. Without
 * it a minimal Ubuntu 24.04 installs the package and then cannot start it ("libasound.so.2", a
 * container test). libasound2t64 is its name from Ubuntu 24.04 on; libasound2 before.
 */
const DEB_DEPENDS = [
  'libgtk-3-0',
  'libnotify4',
  'libnss3',
  'libxss1',
  'libxtst6',
  'xdg-utils',
  'libatspi2.0-0',
  'libuuid1',
  'libsecret-1-0',
  'libasound2t64 | libasound2',
]

/**
 * WHAT THE .deb RECOMMENDS, which apt installs by default: electron-builder's own (the tray's
 * libappindicator3-1), and a font with Chinese in it. On a clean Ubuntu 24.04 with no such font every
 * Chinese character of the window and the office was drawn as a box (a container test of 4 October
 * 2026). It is a recommendation, not a dependency, because a machine may have another Chinese font.
 */
const DEB_RECOMMENDS = ['libappindicator3-1', 'fonts-noto-cjk']

process.on('uncaughtException', (err) => {
  process.stderr.write(`${err instanceof Refused ? err.message : String(err.stack ?? err)}\nNo installer was made.\n`)
  process.exit(1)
})

if (THE_INSTALL.from !== 'checkout') fail('Installers are made from a checkout, and this is not one.')
if (process.platform !== 'linux') fail('This makes the Linux installers, and runs only on Linux.')
const ARCH = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null
if (ARCH === null) fail(`Node publishes no Linux build for the processor ${process.arch}.`)
// electron-builder's fpm writes the .deb with ar, from binutils. Without it the .deb cannot be made,
// so this stops before anything is built rather than half way through.
if (whereIsThisTool('ar', process.env) === null) fail('The .deb is written with ar, and no ar is on PATH. Install binutils.')
// The .deb's version is read back from it with dpkg-deb, after it is made (step 7).
if (whereIsThisTool('dpkg-deb', process.env) === null) fail("The .deb's version is read back with dpkg-deb, and no dpkg-deb is on PATH. Install dpkg.")

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

try {
  // 0. THE BUILT PAGE, THEN EVERY PLAIN PRIVACY FILE AGAINST THIS CHECKOUT.
  const missingPage = missingWebBuild(THE_BUILT_PAGE)
  if (missingPage !== null) fail(missingPage)
  const ownerContent = runTheOwnerContentStep({ root: REPO_ROOT, work, say, verdictPath: verdictFile })
  if (ownerContent.refused !== null) fail(ownerContent.refused)

  // 1. THE BUNDLE.
  const bundled = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'bundle.mjs'), '--out', office], { stdio: 'inherit' })
  if (bundled.status !== 0) fail('npm run bundle failed; it says why above.')

  // 2. NO NODE IS PUT IN: the office's Node is the app's own program. Before packing, that program is Electron's
  // binary in node_modules, which electron-builder copies into the app. It is first needed here, so a fresh clone's
  // missing runtime is put in here.
  const runtime = putInElectronsRuntime({ root: REPO_ROOT, say })
  if (runtime !== null) fail(runtime)
  const node = theInstallsNode({ from: 'bundle', platform: 'linux', execPath: join(REPO_ROOT, 'node_modules', 'electron', 'dist', 'electron') })

  // 2a. THE TERMINAL (wave 13u): the bundle carries the terminal holder and node-pty (scripts/bundle.mjs puts
  // them in), and the app's own program, run as Node, opens a shell through that node-pty.
  if (!existsSync(join(office, THE_HOLDER_BUNDLE))) fail(`The bundle holds no ${THE_HOLDER_BUNDLE}, so the installed office could not hold terminals.`)
  const terminal = theShellAnswersThroughThePty(office, node.program, node.environment)
  if (!terminal.ok) fail(`The app's own program, run as Node, cannot open a shell through the node-pty in the bundle: ${terminal.said}`)
  say(`The app's own program, run as Node, opens a shell through the node-pty in the bundle (${terminal.said}).`)

  // 3. THE APP: one loader that imports the bundled window from resources/office.
  const own = /** @type {{ version: string, description: string, license: string }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')))
  mkdirSync(app)
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'mole-office', productName: PACKAGE_NAME, desktopName: 'mole-office.desktop', version: own.version, description: own.description, license: own.license, homepage: HOMEPAGE, author: { name: 'Mole Office' }, main: 'main.cjs' }, null, 2)}\n`,
  )
  writeFileSync(
    join(app, 'main.cjs'),
    [
      '// The window of an installed Mole Office. The office itself is beside this app, in resources/office:',
      '// its bundles and its build stamp. scripts/package-linux.mjs in the checkout made both.',
      "const { join } = require('node:path')",
      "const { pathToFileURL } = require('node:url')",
      "import(pathToFileURL(join(process.resourcesPath, 'office', 'window.mjs')).href)",
      '',
    ].join('\n'),
  )

  // 4. THE INSTALLERS.
  // THE ICON, ON A SQUARE THE ICON THEME LISTS (round W30). electron-builder installs a single PNG in
  // hicolor/WxW/apps, W its width. The logo is not square, and its width is no size the theme lists, so the
  // first beta's menu and dock drew a generic icon. The logo goes unscaled and centred on the theme's largest
  // square, as the Mac icon does, and the packed app's check reads the .deb's icon back.
  const icon = join(work, 'mole-office.png')
  writeFileSync(icon, writeAPng(onASquare(readAPng(readFileSync(join(REPO_ROOT, 'assets', 'mole-office.png'))), Math.max(...THE_ICON_THEMES_SIZES))))
  const electron =/** @type {{ version: string }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')))
  const config = {
    appId: 'office.mole.desktop',
    productName: PACKAGE_NAME,
    artifactName: 'mole-office-${version}-${arch}.${ext}',
    directories: { app, output: out },
    electronVersion: electron.version,
    electronDist: join(REPO_ROOT, 'node_modules', 'electron', 'dist'),
    asar: true,
    npmRebuild: false,
    // COPIED FROM THE STAGING FOLDER, NOT FROM office/ ITSELF: electron-builder's copy filter always
    // drops a node_modules at the root of what it copies, and keeps one further down (app-builder-lib,
    // util/filter.js). So office/node_modules is one level down here, and it lands in resources/office.
    extraResources: [{ from: work, to: '.', filter: ['office/**/*'] }],
    // ELECTRON'S LANGUAGES: the ten THE_LANGUAGES_CARRIED in scripts/the-packed-app.mjs names, and no other. The
    // packed app's check reads the locales folder back (step 7).
    electronLanguages: [...THE_LANGUAGES_CARRIED],
    linux: {
      target: ['deb', 'AppImage'],
      category: 'Office',
      icon,
      executableName: 'mole-office',
      maintainer: 'Mole Office',
      synopsis: own.description,
      desktop: { entry: { Name: 'Mole Office' } },
    },
    // THE STOP (scripts/the-debs-stop.mjs): the .deb's preinst and prerm stop every office that runs from the
    // installed folder before dpkg changes a file in it, and its postrm leaves an older version as it was when the
    // stop refused. electron-builder's own postinst is kept, with what it does for Chromium's sandbox and AppArmor.
    deb: { depends: DEB_DEPENDS, recommends: DEB_RECOMMENDS, ...theOfficesDebOptions({ folder: THE_INSTALLED_FOLDER, into: join(work, 'deb-scripts') }) },
    // THE AppImage RUNS WITHOUT libfuse (wave 13t, round 16). electron-builder's default toolset puts the
    // AppImage runtime that loads libfuse.so.2 in front of the app, and Ubuntu 22.04 and later do not
    // install libfuse.so.2, so a double click did nothing. Toolset 1.0.3 carries the static runtime
    // (AppImage's runtime of 8 November 2025), which needs no FUSE library on the machine. The packed
    // app's check reads the runtime back (scripts/the-packed-app.mjs, theAppImageRuntime).
    toolsets: { appimage: THE_APPIMAGE_TOOLSET },
    electronFuses: {
      runAsNode: true,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
    },
  }
  const configFile = join(work, 'electron-builder.json')
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  const built = spawnSync('npx', ['--yes', ELECTRON_BUILDER, '--linux', `--${ARCH}`, '--config', configFile, '--projectDir', app], {
    stdio: 'inherit',
    timeout: 20 * 60_000,
  })
  if (built.status !== 0) fail(`${ELECTRON_BUILDER} failed; it says why above.`)

  // 5. WHAT WAS PACKED RUNS: the packed app's own program, run as Node, opens a database with the shipped
  // better-sqlite3, from the unpacked app the installers were made from. A file left out of the package, or
  // the RunAsNode fuse left off, fails here, loudly.
  const packed = join(out, `linux-${ARCH === 'x64' ? '' : `${ARCH}-`}unpacked`, 'resources', 'office')
  const packedNode = theInstallsNode({ from: 'bundle', platform: 'linux', execPath: join(packed, '..', '..', 'mole-office') })
  const opened = spawnSync(
    packedNode.program,
    ['-e', "const D = require(process.argv[1]); const db = new D(':memory:'); process.stdout.write(String(db.prepare('select 1 as one').get().one))", join(packed, 'node_modules', 'better-sqlite3')],
    { encoding: 'utf8', env: { ...process.env, ...packedNode.environment } },
  )
  if (opened.status !== 0 || opened.stdout !== '1') {
    fail(`The packed office cannot open a database with its own Node and better-sqlite3: ${opened.stderr || opened.stdout}`)
  }
  say(`The packed office opens a database with its own Node, the app's own program run as Node (${packed}).`)
  // The terminal (wave 13u): the packed office's Node opens a shell through its own node-pty.
  const shell = theShellAnswersThroughThePty(packed, packedNode.program, packedNode.environment)
  if (!shell.ok) fail(`The packed office cannot open a shell through its own node-pty: ${shell.said}`)
  say(`The packed office opens a shell through its own node-pty (${packed}).`)

  // 6. NO DEVELOPMENT MATERIAL in what was packed: the office beside the app and the app itself
  // (scripts/no-development-material.mjs). The bundle was checked as it was made; this reads what the
  // packager put in the installers. Installers that carry any are removed, since they must never ship.
  const carried = [...developmentMaterialIn({ root: REPO_ROOT, folder: packed }), ...developmentMaterialIn({ root: REPO_ROOT, folder: app })]
  if (carried.length > 0) {
    // The installers electron-builder just wrote, by the name artifactName gives them.
    for (const file of readdirSync(out)) if (/^mole-office-.*\.(deb|AppImage)$/.test(file)) rmSync(join(out, file))
    fail(`${theRefusal('The installers', carried)} The installers just made were removed.`)
  }
  say(`The packed app carries nothing from tests/, tools/ or design/ (${packed} and the app folder were read).`)

  // 7. WHAT THE PACKED APP CARRIES, read back: its fuses from the binary, its version in app.asar and in
  // the .deb, the AppImage's runtime and the licences (scripts/the-packed-app.mjs). Installers that get any
  // of it wrong are removed.
  const deb = readdirSync(out).find((file) => file.startsWith(`mole-office-${own.version}-`) && file.endsWith('.deb'))
  if (deb === undefined) fail(`${ELECTRON_BUILDER} made no .deb in ${out}.`)
  const appImage = readdirSync(out).find((file) => file.startsWith(`mole-office-${own.version}-`) && file.endsWith('.AppImage'))
  if (appImage === undefined) fail(`${ELECTRON_BUILDER} made no AppImage in ${out}.`)
  const wrong = whatThePackedAppGetsWrong({ unpacked: join(packed, '..', '..'), root: REPO_ROOT, version: own.version, deb: join(out, deb), appImage: join(out, appImage) })
  if (wrong.length > 0) {
    for (const file of readdirSync(out)) if (/^mole-office-.*\.(deb|AppImage)$/.test(file)) rmSync(join(out, file))
    fail(`${wrong.join(' ')} The installers just made were removed.`)
  }
  say(`The packed app carries the fuses it was made with, version ${own.version}, Mole Office's LICENSE and NOTICE, the third-party notices, and Electron's and Chromium's licences.`)

  // 8. THE OFFICE MAP'S .deb (scripts/the-office-map-part.mjs). The office's own .deb and the AppImage were made
  // from the unpacked app, which must hold no plugins folder. The map is built with its own build and read for
  // development material, then packed into the folder the office's .deb puts the office in, and read back. When
  // any of it fails, the installers just made are removed, the map's .deb with them.
  /** @param {string} line @returns {never} */
  const refuseTheMap = (line) => {
    for (const file of readdirSync(out)) if (/^mole-office-.*\.(deb|AppImage)$/.test(file)) rmSync(join(out, file))
    fail(`${line} The installers just made were removed.`)
  }
  const pluginsWrong = whatThePluginsGetWrong({ office: packed, withTheMap: false })
  if (pluginsWrong.length > 0) refuseTheMap(pluginsWrong.join(' '))
  const map = join(work, 'office-map')
  try {
    stageTheMap(map)
  } catch (err) {
    refuseTheMap(err instanceof Error ? err.message : String(err))
  }
  const mapsMaterial = developmentMaterialIn({ root: REPO_ROOT, folder: map })
  if (mapsMaterial.length > 0) refuseTheMap(theRefusal("The office map's .deb", mapsMaterial))
  let officeInTheDeb = /** @type {string[]} */ ([])
  let mapsDeb = ''
  try {
    officeInTheDeb = theOfficeInTheDeb(join(out, deb), THE_BUNDLES[THE_COMMAND_ENTRY])
    mapsDeb = makeTheMapsDeb({ staged: map, version: own.version, arch: ARCH, office: officeInTheDeb, work, out })
  } catch (err) {
    refuseTheMap(err instanceof Error ? err.message : String(err))
  }
  const mapsWrong = whatTheMapsDebGetsWrong({ deb: mapsDeb, version: own.version, office: officeInTheDeb })
  if (mapsWrong.length > 0) refuseTheMap(mapsWrong.join(' '))
  say(`The office's own installers carry no plugin, and ${mapsDeb} holds only the map's manifest and built folder and needs mole-office at version ${own.version}.`)

  // 9. THE STOP, read back from both .debs (scripts/the-debs-stop.mjs): each one's preinst and prerm stop an office
  // that runs from the folder the office's .deb installs it in, and the office's postrm begins with its guard. When
  // any of it is wrong, the installers just made are removed.
  const stopsWrong = [
    ...(theInstalledFolder(officeInTheDeb) === THE_INSTALLED_FOLDER ? [] : [`The office's .deb puts the office in /${officeInTheDeb.join('/')}, and its stop looks in ${THE_INSTALLED_FOLDER}.`]),
    ...whatTheDebsScriptsGetWrong({ deb: join(out, deb), folder: THE_INSTALLED_FOLDER, postrm: true }),
    ...whatTheDebsScriptsGetWrong({ deb: mapsDeb, folder: THE_INSTALLED_FOLDER }),
  ]
  if (stopsWrong.length > 0) refuseTheMap(stopsWrong.join(' '))
  say(`Both .debs stop an office that runs from ${THE_INSTALLED_FOLDER} before dpkg changes a file in it.`)

  for (const file of readdirSync(out)) {
    if (/\.(deb|AppImage)$/.test(file)) say(`Made ${join(out, file)}: ${String(statSync(join(out, file)).size)} bytes.`)
  }
} finally {
  // The staging folder is this script's own, made above; the installers stay.
  rmSync(work, { recursive: true, force: true })
}
