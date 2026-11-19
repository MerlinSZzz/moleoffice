// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * `npm run package:mac`: THE MAC APP, SIGNED AND NOTARISED, AS A dmg AND A zip, FOR APPLE SILICON
 * (wave 13t, round 20). Beside scripts/package-linux.mjs, and built the same way: the same bundle, its own
 * Node, the same loader and the same fuses. The owner runs it through scripts/build-on-a-mac.mjs, which
 * checks their Mac first and builds the page before it.
 *
 *   node scripts/package-mac.mjs [--out <folder>] [--local] [--owner-content-verdict <file>]      default: dist/mac in this checkout
 *   --local keeps Developer ID signing, skips notarisation/stapling/Gatekeeper, and is for this Mac only.
 *   --with-the-map makes the second app, which carries the office map, and names its dmg and zip
 *   mole-office-<version>-arm64-with-the-map (scripts/the-office-map-part.mjs says why it is a second app).
 *   --owner-content-verdict takes the host screen's verdict for the tree this build packs.
 *
 * It needs `npm run build` first, Apple's command-line tools, one Developer ID Application certificate in
 * the keychain and, for a full build, the keychain profile mole-office-notary (scripts/the-mac-build.mjs
 * checks what the selected mode needs and says how to make what is missing), and a network to nodejs.org, to Apple's notary service and to the
 * places electron-builder fetches its own tools from.
 *
 * WHAT IT DOES, IN ORDER. Each step that fails stops it, says why, and leaves no dmg or zip behind.
 *   0. Check the built page, then run every plain privacy file against this checkout before bundling.
 *      Two privacy files start the bundle themselves, so putting this check inside bundle.mjs would
 *      start a loop. Only the packagers run this check; npm run bundle remains a bundle alone.
 *      With --owner-content-verdict, the check accepts the host screen's verdict for this tree. The
 *      verdict lets through only a file whose every case was taken out because the owner's list was
 *      not read, and a red file still refuses (scripts/the-owner-content-verdict.mjs).
 *   1. The bundle, as on Linux (scripts/bundle.mjs).
 *   2. The shipped Node for darwin-arm64 (scripts/the-shipped-node.mjs), and a shell opened through the
 *      bundle's node-pty with it, which on a Mac goes through node-pty's spawn-helper.
 *   3. The app folder: the loader main.cjs, as on Linux; the icon, their logo on a 512-pixel square; and the
 *      entitlements the hardened runtime needs (THE_ENTITLEMENTS).
 *   4. electron-builder makes Mole Office.app, then osx-sign signs it with the hardened runtime and their
 *      certificate held only in memory. It signs every program and native file inside the app, the office's own Node,
 *      better-sqlite3, node-pty and its spawn-helper among them. Mach-O headers distinguish code from
 *      binary resources such as images; those resources are sealed by the enclosing app's signature.
 *   5. Every Mach-O file in the app is read back: signed, with the hardened runtime, by their team.
 *   6. The app is sent to Apple's notary service and waited for; then the ticket is stapled to it.
 *   7. The zip, made with ditto from the stapled app, as Apple asks a zip of an app to be made.
 *   8. The dmg: the stapled app and a link to Applications, signed, notarised and stapled itself.
 *   9. Gatekeeper's own answer read back for the app and the dmg (spctl), and the staples (stapler validate).
 *  10. The fuses read back from Electron's framework, the version from app.asar, and the licences.
 *
 * The output folder then holds the dmg and the zip and nothing else; electron-builder's working files
 * stay in a staging folder that is removed at the end.
 */

import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { REPO_ROOT, THE_HOLDER_BUNDLE, THE_INSTALL } from '../src/config/settings.mjs'
import { readTheFuses } from './electron-fuses.mjs'
import { developmentMaterialIn, theRefusal } from './no-development-material.mjs'
import { aFileInTheAsar, THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC } from './the-packed-app.mjs'
import {
  checkThisMac,
  configureMacBuildEnvironment,
  isMachO,
  onASquare,
  readAPng,
  THE_ENTITLEMENTS,
  THE_MAC_ARCH,
  THE_MAC_ICON_SIDE,
  THE_NOTARY_PROFILE,
  theMacBuilderConfig,
  theNotaryVerdict,
  theRefusalSaid,
  theSignatureProblems,
  writeAPng,
} from './the-mac-build.mjs'
import { putTheShippedNodeInto } from './the-shipped-node.mjs'
import { theShellAnswersThroughThePty } from './the-terminal-in-a-bundle.mjs' // wave 13u: the terminal
import { THE_NOTICES_FILE } from './third-party-notices.mjs'
import { missingWebBuild, THE_BUILT_PAGE } from '../src/config/the-built-page.mjs'
import { runTheOwnerContentStep } from './the-owner-content-verdict.mjs'
import { stageTheMap, theMapInTheOffice, whatThePluginsGetWrong } from './the-office-map-part.mjs'

/** The pinned electron-builder installed in this build's staging folder. */
const ELECTRON_BUILDER = 'electron-builder@26.15.3'

/** What the app is called on the Mac: the name in Finder, the Dock and the menu bar. */
const THE_APP = 'Mole Office.app'

/** @param {string} line */
const say = (line) => process.stdout.write(`${line}\n`)

/** A refusal: it is thrown, so the staging folder is still removed, and said once at the bottom. */
class Refused extends Error {}

/** @param {string} line @returns {never} */
function fail(line) {
  throw new Refused(line)
}

process.on('uncaughtException', (err) => {
  process.stderr.write(`${err instanceof Refused ? err.message : String(err.stack ?? err)}\nNo dmg or zip was made.\n没有生成 dmg 或 zip。\n`)
  process.exit(1)
})

/**
 * Run one of Apple's tools and stop, with what it printed, when it fails.
 * @param {string} what
 * @param {string} command
 * @param {string[]} args
 * @param {number} [minutes]
 * @returns {string} what it printed on stdout and stderr
 */
function mustRun(what, command, args, minutes = 10) {
  const ran = spawnSync(command, args, { encoding: 'utf8', timeout: minutes * 60_000 })
  const said = `${ran.stdout ?? ''}${ran.stderr ?? ''}`.trim()
  if (ran.status !== 0) fail(`${what} failed (${ran.error?.message ?? `exit ${String(ran.status)}`}): ${said}`)
  return said
}

/**
 * Send a file to Apple's notary service, wait for its verdict, and staple the ticket to `staple`.
 * @param {string} file the file sent: a zip of the app, or the dmg
 * @param {string} staple what the ticket is stapled to
 */
function notarise(file, staple) {
  say(`Sending ${file} to Apple's notary service and waiting for its answer; this usually takes a few minutes.`)
  const ran = spawnSync('xcrun', ['notarytool', 'submit', file, '--keychain-profile', THE_NOTARY_PROFILE, '--wait', '--output-format', 'json'], { encoding: 'utf8', timeout: 90 * 60_000 })
  const verdict = theNotaryVerdict(ran.stdout ?? '')
  if (!verdict.accepted) {
    const log = verdict.id === null ? '' : mustRun("Reading the notary service's log", 'xcrun', ['notarytool', 'log', verdict.id, '--keychain-profile', THE_NOTARY_PROFILE])
    fail(`Apple's notary service did not accept ${file}: ${verdict.status}. ${(ran.stderr ?? '').trim()}\n${log}`)
  }
  say(`Apple accepted ${file} (submission ${String(verdict.id)}).`)
  mustRun('Stapling the ticket', 'xcrun', ['stapler', 'staple', staple])
  say(`Stapled the ticket to ${staple}.`)
}

/**
 * Every Mach-O file under a folder, by its first four bytes.
 * @param {string} folder
 * @returns {string[]}
 */
function machOFilesIn(folder) {
  /** @type {string[]} */
  const found = []
  for (const entry of readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    const head = Buffer.alloc(4)
    const fd = openSync(path, 'r')
    const read = readSync(fd, head, 0, 4, 0)
    closeSync(fd)
    if (isMachO(head.subarray(0, read))) found.push(path)
  }
  return found
}

if (THE_INSTALL.from !== 'checkout') fail('The Mac app is made from a checkout, and this is not one.')
configureMacBuildEnvironment()
const localBuild = process.argv.includes('--local')
const withTheMap = process.argv.includes('--with-the-map')
const checked = checkThisMac({ local: localBuild })
if (checked.refused !== null) fail(theRefusalSaid(checked.refused).trim())
const id = checked.id
const safeSigningError = (/** @type {unknown} */ error) => {
  let message = error instanceof Error ? error.message : String(error)
  for (const value of [id.name, id.hash, id.team]) message = message.split(value).join('[signing identity]')
  return message
}

const at = process.argv.indexOf('--out')
const out = at === -1 ? join(REPO_ROOT, 'dist', 'mac') : resolve(String(process.argv[at + 1] ?? ''))
if (at !== -1 && (process.argv[at + 1] ?? '') === '') fail('--out needs a folder.')
const verdictAt = process.argv.indexOf('--owner-content-verdict')
const verdictFile = verdictAt === -1 ? null : resolve(String(process.argv[verdictAt + 1] ?? ''))
if (verdictAt !== -1 && (process.argv[verdictAt + 1] ?? '') === '') fail('--owner-content-verdict needs a file.')
mkdirSync(out, { recursive: true })
const own = /** @type {{ version: string, description: string, license: string }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')))
const suffix = `${withTheMap ? '-with-the-map' : ''}${localBuild ? '-local' : ''}`
const zip = join(out, `mole-office-${own.version}-${THE_MAC_ARCH}${suffix}.zip`)
const dmg = join(out, `mole-office-${own.version}-${THE_MAC_ARCH}${suffix}.dmg`)
for (const made of [zip, dmg]) rmSync(made, { force: true })
const work = mkdtempSync(join(out, '.work-'))
const office = join(work, 'office')
const app = join(work, 'app')
const built = join(work, 'built')
let finished = false

try {
  // 0. THE BUILT PAGE, THEN EVERY PLAIN PRIVACY FILE AGAINST THIS CHECKOUT.
  const missingPage = missingWebBuild(THE_BUILT_PAGE)
  if (missingPage !== null) fail(missingPage)
  const ownerContent = runTheOwnerContentStep({ root: REPO_ROOT, work, say, verdictPath: verdictFile })
  if (ownerContent.refused !== null) fail(ownerContent.refused)

  // 1. THE BUNDLE.
  const bundled = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'bundle.mjs'), '--out', office], { stdio: 'inherit' })
  if (bundled.status !== 0) fail('npm run bundle failed; it says why above.')

  // 1a. THE OFFICE MAP, in the second app only: built with its own build and put into the bundle's plugins folder,
  // so it is in the app before the app is signed (scripts/the-office-map-part.mjs).
  if (withTheMap) {
    try {
      say(`The office map is in ${stageTheMap(join(office, ...theMapInTheOffice()))}.`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  }

  // 2. THE SHIPPED NODE, and the terminal through it (on a Mac, through node-pty's spawn-helper).
  /** @type {string} */
  let node = ''
  try {
    node = await putTheShippedNodeInto(office, 'darwin', THE_MAC_ARCH, say)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
  if (!existsSync(join(office, THE_HOLDER_BUNDLE))) fail(`The bundle holds no ${THE_HOLDER_BUNDLE}, so the installed office could not hold terminals.`)
  const terminal = theShellAnswersThroughThePty(office, node)
  if (!terminal.ok) fail(`The shipped Node cannot open a shell through the node-pty in the bundle: ${terminal.said}`)
  say(`The shipped Node opens a shell through the node-pty in the bundle (${terminal.said}).`)

  // 3. THE APP FOLDER: the loader, the icon and the entitlements.
  mkdirSync(app)
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'mole-office', productName: 'Mole Office', version: own.version, description: own.description, license: own.license, author: { name: 'Mole Office' }, main: 'main.cjs' }, null, 2)}\n`,
  )
  writeFileSync(
    join(app, 'main.cjs'),
    [
      '// The window of an installed Mole Office. The office itself is beside this app, in resources/office:',
      '// its bundles, its own Node and its build stamp. scripts/package-mac.mjs in the checkout made both.',
      "const { join } = require('node:path')",
      "const { pathToFileURL } = require('node:url')",
      "import(pathToFileURL(join(process.resourcesPath, 'office', 'window.mjs')).href)",
      '',
    ].join('\n'),
  )
  const icon = join(work, 'mole-office-icon.png')
  writeFileSync(icon, writeAPng(onASquare(readAPng(readFileSync(join(REPO_ROOT, 'assets', 'mole-office.png'))), THE_MAC_ICON_SIDE)))
  const entitlements = join(work, 'entitlements.plist')
  writeFileSync(entitlements, THE_ENTITLEMENTS)

  // 4. THE SIGNED APP.
  const electron = /** @type {{ version: string }} */ (JSON.parse(readFileSync(join(REPO_ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')))
  const config = theMacBuilderConfig({
    app,
    work,
    output: built,
    version: own.version,
    electron: electron.version,
    electronDist: join(REPO_ROOT, 'node_modules', 'electron', 'dist'),
    // The configuration written to disk contains no identity read from the keychain.
    // Signing happens separately through osx-sign, with the selected identity held only in memory.
    identity: null,
    entitlements,
    icon,
  })
  const configFile = join(work, 'electron-builder.json')
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  const tools = join(work, 'tools')
  const installed = spawnSync('npm', ['install', '--prefix', tools, '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', ELECTRON_BUILDER], {
    stdio: 'inherit',
    timeout: 30 * 60_000,
  })
  if (installed.status !== 0) fail('Installing the Mac packaging tools failed; it says why above.')
  const requireTool = createRequire(join(tools, 'package.json'))
  const packed = spawnSync(process.execPath, [join(tools, 'node_modules', 'electron-builder', 'cli.js'), '--mac', `--${THE_MAC_ARCH}`, '--config', configFile, '--projectDir', app], {
    stdio: 'inherit', timeout: 30 * 60_000, env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  })
  if (packed.status !== 0) fail(`${ELECTRON_BUILDER} failed; it says why above.`)
  const theApp = join(built, `mac-${THE_MAC_ARCH}`, THE_APP)
  if (!existsSync(theApp)) fail(`${ELECTRON_BUILDER} made no ${THE_APP} in ${join(built, `mac-${THE_MAC_ARCH}`)}.`)
  const programs = machOFilesIn(theApp)
  const codeFiles = new Set(programs)
  const { signAsync } = requireTool('@electron/osx-sign')
  try {
    await signAsync({
      // checkThisMac already validated the single identity; codesign accepts its SHA-1 directly.
      app: theApp, identity: id.hash, identityValidation: false, platform: 'darwin', type: 'distribution', version: electron.version,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false,
      // osx-sign also discovers PNGs and other binary data. Only code needs its own signature;
      // keep app/framework directories so their signatures seal all enclosed resources.
      ignore: (/** @type {string} */ file) => statSync(file).isFile() && !codeFiles.has(file),
      optionsForFile: () => ({ entitlements, hardenedRuntime: true }),
    })
  } catch (error) {
    fail(`Signing the Mac app failed: ${safeSigningError(error)}`)
  }
  say(`Made and signed ${theApp}.`)

  // 5. EVERY PROGRAM IN THE APP IS SIGNED, WITH THE HARDENED RUNTIME, BY THEIR TEAM.
  mustRun('Checking the signature of the whole app', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', theApp])
  const unsigned = programs.flatMap((file) => {
    const ran = spawnSync('codesign', ['-dv', '--verbose=2', file], { encoding: 'utf8' })
    return theSignatureProblems(relative(theApp, file), `${ran.stdout}${ran.stderr}`, id.team)
  })
  if (unsigned.length > 0) fail(safeSigningError(unsigned.join('\n')))
  say(`All ${String(programs.length)} programs and native files in the app are signed with the hardened runtime by the selected signing team.`)

  // 6. THE APP NOTARISED AND STAPLED. The notary service takes a zip of the app, made with ditto.
  if (!localBuild) {
    const forTheNotary = join(work, 'for-the-notary.zip')
    mustRun('Zipping the app for the notary service', 'ditto', ['-c', '-k', '--keepParent', theApp, forTheNotary])
    notarise(forTheNotary, theApp)
  }

  // 7. THE ZIP, of the signed app (also stapled in a full build).
  mustRun('Making the zip', 'ditto', ['-c', '-k', '--keepParent', theApp, `${zip}.part`])
  renameSync(`${zip}.part`, zip)
  say(`Made ${zip}.`)

  // 8. THE dmg: the app and a link to Applications, so the person drags one onto the other.
  const volume = join(work, 'dmg')
  mkdirSync(volume)
  mustRun('Copying the app for the dmg', 'ditto', [theApp, join(volume, THE_APP)])
  symlinkSync('/Applications', join(volume, 'Applications'))
  mustRun('Making the dmg', 'hdiutil', ['create', '-volname', 'Mole Office', '-srcfolder', volume, '-ov', '-format', 'UDZO', `${dmg}.part.dmg`])
  renameSync(`${dmg}.part.dmg`, dmg)
  try {
    mustRun('Signing the dmg', 'codesign', ['--sign', id.hash, '--timestamp', dmg])
  } catch (error) {
    fail(safeSigningError(error))
  }
  if (!localBuild) notarise(dmg, dmg)
  say(`Made ${dmg}.`)

  // 9. GATEKEEPER'S OWN ANSWER, as the second Mac will ask it.
  if (!localBuild) {
    mustRun('Asking Gatekeeper about the app', 'spctl', ['--assess', '--type', 'execute', '--verbose=2', theApp])
    mustRun('Asking Gatekeeper about the dmg', 'spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg])
    mustRun('Checking the app is stapled', 'xcrun', ['stapler', 'validate', theApp])
    mustRun('Checking the dmg is stapled', 'xcrun', ['stapler', 'validate', dmg])
    say('Gatekeeper accepts the app and the dmg, and both carry their notarisation ticket.')
  }

  // 10. WHAT THE PACKED APP CARRIES: the fuses, the version, the licences, no development material, and
  // a database opened with the packed office's own Node.
  const resources = join(theApp, 'Contents', 'Resources')
  /** @type {string[]} */
  const wrong = []
  const fuses = readTheFuses(readFileSync(join(theApp, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework')))
  for (const [name, wanted] of Object.entries(THE_FUSES_SET_FOR_WINDOWS_AND_THE_MAC)) {
    if (fuses[name] !== wanted) wrong.push(`The fuse ${name} is ${fuses[name] ?? 'missing'} in the packed framework, not ${wanted}.`)
  }
  const packedApp = /** @type {{ version?: unknown }} */ (JSON.parse(aFileInTheAsar(readFileSync(join(resources, 'app.asar')), 'package.json')))
  if (packedApp.version !== own.version) wrong.push(`The packed app's package.json says version ${String(packedApp.version)}, not ${own.version}.`)
  const packedOffice = join(resources, 'office')
  for (const name of ['LICENSE', 'NOTICE']) {
    if (!existsSync(join(packedOffice, name))) wrong.push(`The packed office carries no ${name}.`)
    else if (!readFileSync(join(packedOffice, name)).equals(readFileSync(join(REPO_ROOT, name)))) wrong.push(`The packed office's ${name} is not the checkout's.`)
  }
  if (!existsSync(join(packedOffice, THE_NOTICES_FILE))) wrong.push(`The packed office carries no ${THE_NOTICES_FILE}.`)
  const carried = [...developmentMaterialIn({ root: REPO_ROOT, folder: packedOffice }), ...developmentMaterialIn({ root: REPO_ROOT, folder: app })]
  if (carried.length > 0) wrong.push(theRefusal('The Mac app', carried))
  // The office map: the second app carries the map alone, and the first carries no plugin.
  wrong.push(...whatThePluginsGetWrong({ office: packedOffice, withTheMap }))
  const opened = spawnSync(
    join(packedOffice, 'runtime', 'bin', 'node'),
    ['-e', "const D = require(process.argv[1]); const db = new D(':memory:'); process.stdout.write(String(db.prepare('select 1 as one').get().one))", join(packedOffice, 'node_modules', 'better-sqlite3')],
    { encoding: 'utf8' },
  )
  if (opened.status !== 0 || opened.stdout !== '1') wrong.push(`The packed office cannot open a database with its own Node and better-sqlite3: ${opened.stderr || opened.stdout}`)
  const shell = theShellAnswersThroughThePty(packedOffice, join(packedOffice, 'runtime', 'bin', 'node'))
  if (!shell.ok) wrong.push(`The packed office cannot open a shell through its own node-pty: ${shell.said}`)
  for (const { source, carried } of [
    { source: 'LICENSE', carried: 'LICENSE.electron.txt' },
    { source: 'LICENSES.chromium.html', carried: 'LICENSES.chromium.html' },
  ]) {
    const path = join(resources, carried)
    if (!existsSync(path)) wrong.push(`The packed app carries no ${carried}.`)
    else if (!readFileSync(path).equals(readFileSync(join(REPO_ROOT, 'node_modules', 'electron', 'dist', source)))) wrong.push(`The packed app's ${carried} is not the Electron runtime's.`)
  }
  if (wrong.length > 0) fail(wrong.join('\n'))
  say(`The packed app carries the fuses it was made with, version ${own.version}, Mole Office's LICENSE and NOTICE and the third-party notices, nothing from tests/, tools/ or design/, and its own Node opens a database and a shell.`)
  say('Electron and Chromium licences are in Contents/Resources and match the shipped runtime.')

  finished = true
  say('')
  for (const made of [dmg, zip]) say(`Made ${made}: ${String(statSync(made).size)} bytes.`)
  say(`The dmg and the zip are in ${out}.`)
  say(`dmg 和 zip 在这个文件夹里：${out}`)
  if (localBuild) {
    say('LOCAL BUILD: for this Mac only. It is not notarised and will be blocked on another Mac.')
    say('本机构建：仅供这台 Mac 使用。未经 Apple 公证，在另一台 Mac 上会被阻止打开。')
  }
} finally {
  // The staging folder is this script's own, made above. A run that did not finish leaves no dmg or zip.
  rmSync(work, { recursive: true, force: true })
  if (!finished) for (const made of [zip, dmg, `${zip}.part`, `${dmg}.part.dmg`]) rmSync(made, { force: true })
}
