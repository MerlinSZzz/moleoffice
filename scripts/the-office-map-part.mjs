// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OFFICE MAP AS A CHOICE AT INSTALL. The office map is a plugin, plugins/office-map, and the office's own
 * installers do not put it in the office. Each offers it beside the office instead:
 *   - Windows: a part of its own on the installer's components page, unticked on a first install
 *     (scripts/windows-installer.nsi, which scripts/package-windows.mjs gives the map's files);
 *   - Linux: a .deb of its own, mole-office-map, which needs the same version of mole-office. The AppImage
 *     carries no map (scripts/package-linux.mjs).
 *   - the Mac: a second app and dmg that carry the map, made by `package-mac.mjs --with-the-map`, because a file
 *     put into a signed app after it is signed breaks its signature.
 * An installed map is off until it is switched on in Settings, under Tools, in Plugins (readThePlugins in
 * src/server/lib/plugins.ts reads a plugin nobody switched as off).
 *
 * Every installer takes the same two things from the plugin, after the plugin's own build
 * (plugins/office-map/tools/build.mjs): its manifest and its built folder. The rest of the plugin's folder is its
 * sources, tests and notes, and none of it goes in.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { REPO_ROOT, THE_PLUGINS_FOLDER } from '../src/config/settings.mjs'
import { PLUGIN_BUILT_FOLDER, PLUGIN_MANIFEST_FILE } from '../src/shared/plugin-change.ts'
import { theDebianVersion, theDebsFiles } from './the-packed-app.mjs'
import { theInstalledFolder, writeTheStop } from './the-debs-stop.mjs'

/** The plugin the installers offer, by its id, which is also its folder's name. */
export const THE_MAP = 'office-map'

/** What an installer takes from the plugin's folder: its manifest and its built folder, and nothing else. */
export const THE_MAPS_FILES = Object.freeze([PLUGIN_MANIFEST_FILE, PLUGIN_BUILT_FOLDER])

/** The map's own folder in this checkout. */
const THE_MAPS_SOURCE = join(THE_PLUGINS_FOLDER, THE_MAP)

/** The .deb's package name, and the package it needs. */
export const THE_MAPS_PACKAGE = 'mole-office-map'
const THE_OFFICES_PACKAGE = 'mole-office'

/**
 * What the map's .deb says it is. Its last sentence names the place in Settings by the words the Settings page
 * draws, which tests/the-office-map-part.test.ts checks.
 */
export const THE_MAPS_DESCRIPTION = [
  'The office map for Mole Office',
  'The office map shows the office as a map of its people, agents and work. It only reads, and changes nothing.',
  'It is off until it is switched on: open Settings, then Tools, then Plugins.',
]

/** Where the map goes in an office folder, as the parts of its path: the plugins folder the office reads, then the map's id. */
export const theMapInTheOffice = () => [...relative(REPO_ROOT, THE_PLUGINS_FOLDER).split(sep), THE_MAP]

/**
 * Copies the map's manifest and built folder from `from` into `to`, which is emptied first, and nothing else of
 * `from`. Either one missing is refused, naming it, before anything is copied.
 *
 * @param {{ from: string, to: string }} where
 * @returns {string} `to`
 */
export function copyTheMap({ from, to }) {
  for (const name of THE_MAPS_FILES) {
    if (!existsSync(join(from, name))) throw new Error(`${join(from, name)} is not there, so the office map cannot be packed.`)
  }
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  for (const name of THE_MAPS_FILES) cpSync(join(from, name), join(to, name), { recursive: true })
  return to
}

/**
 * WHAT A PACKED OFFICE'S PLUGINS GET WRONG. An office packed without the map holds no plugins folder. One packed
 * with it holds the map alone in that folder, as its manifest and built folder. An empty list means nothing was
 * found wrong.
 *
 * @param {{ office: string, withTheMap: boolean }} what `office` is the packed office folder, resources/office
 * @returns {string[]}
 */
export function whatThePluginsGetWrong({ office, withTheMap }) {
  const plugins = join(office, ...theMapInTheOffice().slice(0, -1))
  if (!existsSync(plugins)) return withTheMap ? [`${office} holds no plugins folder, so it carries no office map.`] : []
  if (!withTheMap) return [`${plugins} is in the packed office, and an office packed without the map carries no plugin.`]
  const held = readdirSync(plugins).sort()
  if (held.join() !== THE_MAP) return [`${plugins} holds ${held.join(', ') || 'nothing'}, not the office map alone.`]
  const files = readdirSync(join(plugins, THE_MAP)).sort()
  if (files.join() !== [...THE_MAPS_FILES].sort().join()) return [`${join(plugins, THE_MAP)} holds ${files.join(', ') || 'nothing'}, not the map's ${THE_MAPS_FILES.join(' and ')} alone.`]
  return []
}

/**
 * Builds the map with its own build, then copies what an installer takes into `to` (copyTheMap). A build that
 * fails is refused, and nothing is copied.
 *
 * @param {string} to
 * @returns {string} `to`
 */
export function stageTheMap(to) {
  const built = spawnSync(process.execPath, [join(THE_MAPS_SOURCE, 'tools', 'build.mjs')], { cwd: REPO_ROOT, stdio: 'inherit' })
  if (built.error) throw built.error
  if (built.status !== 0) throw new Error(`The office map's build (plugins/${THE_MAP}/tools/build.mjs) ended with ${String(built.status ?? built.signal)}; it says why above.`)
  return copyTheMap({ from: THE_MAPS_SOURCE, to })
}

/**
 * The Debian name of a Node processor name, for a .deb's Architecture line and file name.
 * @param {string} arch
 */
export function theDebianArchitecture(arch) {
  if (arch === 'x64') return 'amd64'
  if (arch === 'arm64') return 'arm64'
  throw new Error(`The office map's .deb is made for x64 or arm64, and not for ${arch}.`)
}

/** @param {string} folder @returns {number} the bytes of every file under `folder` */
function theBytesUnder(folder) {
  let bytes = 0
  for (const name of readdirSync(folder, { recursive: true })) {
    const found = statSync(join(folder, String(name)))
    if (found.isFile()) bytes += found.size
  }
  return bytes
}

/**
 * The folder the office is in, in the office's own .deb, as the parts of its path: the folder that holds the
 * bundle's `command`, read from the .deb's list of files.
 *
 * @param {string} deb the office's .deb
 * @param {string} command the bundle's command file, THE_BUNDLES[THE_COMMAND_ENTRY] in src/config/settings.mjs
 * @returns {string[]}
 */
export function theOfficeInTheDeb(deb, command) {
  const found = theDebsFiles(deb).filter((path) => path.endsWith(`/${command}`))
  if (found.length !== 1) throw new Error(`${deb} holds ${String(found.length)} files named ${command}, so where the office is in it is not known.`)
  return String(found[0]).split('/').slice(1, -1)
}

/**
 * MAKES THE MAP'S .deb with dpkg-deb, from the staged map: mole-office-map-<version>-<architecture>.deb in `out`,
 * which needs mole-office at that same version and installs the map into the office's plugins folder. Every
 * folder in it is 0755 and every file 0644, and root owns them all.
 * Its preinst and prerm are the stop scripts/the-debs-stop.mjs writes, as the office's own .deb's are: they stop an
 * office that runs from the installed folder before dpkg changes a file in it.
 * Those two scripts are 0755, the one exception to the files' 0644.
 *
 * @param {{ staged: string, version: string, arch: string, office: string[], work: string, out: string }} what
 *   `office` is where the office is in the office's .deb (theOfficeInTheDeb); `work` is a folder of the caller's
 * @returns {string} the .deb
 */
export function makeTheMapsDeb({ staged, version, arch, office, work, out }) {
  const architecture = theDebianArchitecture(arch)
  const debian = theDebianVersion(version)
  const tree = join(work, 'map-deb')
  rmSync(tree, { recursive: true, force: true })
  copyTheMap({ from: staged, to: join(tree, ...office, ...theMapInTheOffice()) })
  const installedKilobytes = Math.ceil(theBytesUnder(tree) / 1024)
  mkdirSync(join(tree, 'DEBIAN'))
  const [synopsis, ...description] = THE_MAPS_DESCRIPTION
  writeFileSync(
    join(tree, 'DEBIAN', 'control'),
    [
      `Package: ${THE_MAPS_PACKAGE}`,
      `Version: ${debian}`,
      `Architecture: ${architecture}`,
      'Maintainer: Mole Office',
      `Installed-Size: ${String(installedKilobytes)}`,
      `Depends: ${THE_OFFICES_PACKAGE} (= ${debian})`,
      'Section: misc',
      'Priority: optional',
      `Description: ${String(synopsis)}`,
      ...description.map((line) => ` ${line}`),
      '',
    ].join('\n'),
  )
  chmodSync(tree, 0o755)
  for (const name of readdirSync(tree, { recursive: true })) {
    const path = join(tree, String(name))
    chmodSync(path, statSync(path).isDirectory() ? 0o755 : 0o644)
  }
  // After the modes above, so the two scripts stay 0755.
  writeTheStop({ folder: theInstalledFolder(office), into: join(tree, 'DEBIAN') })
  // Named in the pattern of the office's own .deb (artifactName in scripts/package-linux.mjs), so the two read alike.
  const deb = join(out, `${THE_MAPS_PACKAGE}-${version}-${architecture}.deb`)
  // Compressed with xz, as electron-builder compresses the office's own .deb, so a dpkg that installs one reads both.
  execFileSync('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', tree, deb], { stdio: 'pipe' })
  rmSync(tree, { recursive: true, force: true })
  return deb
}

/**
 * WHAT THE MAP'S .deb GETS WRONG, read back from it with dpkg-deb: its name, its version, the package and
 * version it needs, and its files, which must be the map's manifest and built folder in the office's plugins
 * folder and nothing else. An empty list means nothing was found wrong.
 *
 * @param {{ deb: string, version: string, office: string[] }} what
 * @returns {string[]}
 */
export function whatTheMapsDebGetsWrong({ deb, version, office }) {
  const debian = theDebianVersion(version)
  /** @param {string} name */
  const field = (name) => execFileSync('dpkg-deb', ['-f', deb, name], { encoding: 'utf8' }).trim()
  const wrong = []
  const [called, numbered, needs] = [field('Package'), field('Version'), field('Depends')]
  if (called !== THE_MAPS_PACKAGE) wrong.push(`${deb} is the package ${called}, not ${THE_MAPS_PACKAGE}.`)
  if (numbered !== debian) wrong.push(`${deb} is version ${numbered}, not ${debian}.`)
  if (needs !== `${THE_OFFICES_PACKAGE} (= ${debian})`) wrong.push(`${deb} depends on "${needs}", not on ${THE_OFFICES_PACKAGE} at exactly ${debian}.`)
  // The map's folder, and each folder above it, as dpkg-deb lists a folder: from ./ and with a slash at its end.
  const map = `./${[...office, ...theMapInTheOffice()].join('/')}/`
  const above = map.split('/').slice(1, -2).map((_, at, parts) => `./${parts.slice(0, at + 1).join('/')}/`)
  const files = theDebsFiles(deb)
  for (const path of files) {
    if (path === './' || path === map || above.includes(path)) continue
    const inside = path.startsWith(map) ? path.slice(map.length) : null
    const taken = inside !== null && THE_MAPS_FILES.some((name) => inside === name || inside.startsWith(`${name}/`))
    if (!taken) wrong.push(`${deb} holds ${path}, which is not the map's ${THE_MAPS_FILES.join(' or ')} in ${map}.`)
  }
  for (const name of THE_MAPS_FILES) {
    if (!files.some((path) => path === `${map}${name}` || path.startsWith(`${map}${name}/`))) wrong.push(`${deb} holds no ${map}${name}.`)
  }
  return wrong
}
