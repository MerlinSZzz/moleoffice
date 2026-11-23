// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE MAP AS A CHOICE AT INSTALL: WHAT THE INSTALLERS TAKE OF THE MAP, AND THE MAP'S OWN .deb
 * (scripts/the-office-map-part.mjs, which scripts/package-linux.mjs, scripts/package-windows.mjs and
 * scripts/package-mac.mjs use). The Windows installer's part is read in tests/the-windows-package.test.ts.
 *
 *   1. An installer takes the map's manifest and built folder from the plugin's folder, and nothing else of it.
 *      A folder that lacks either is refused, naming it, before anything is copied or removed.
 *   2. The map's .deb, made here with dpkg-deb from an invented map, is mole-office-map at the version given, in a
 *      file named as the office's own .deb is named. It depends on mole-office at exactly that version, and holds
 *      the manifest and the built folder in the office's plugins folder, under the folder the office's own .deb
 *      puts the office in, and nothing else. A .deb made by hand that depends on any later mole-office, holds
 *      another file or lacks the built folder is named.
 *   3. A packed office is read for its plugins: the office's own installers carry no plugins folder, and the Mac's
 *      second app carries the map alone, as its manifest and built folder.
 *
 * MUTATIONS, each red here and green again when put back:
 *   - makeTheMapsDeb depends on mole-office at that version or later: red, case 2;
 *   - copyTheMap copies the whole of the plugin's folder: red, cases 1 and 2;
 *   - whatTheMapsDebGetsWrong takes a file that is not the map's: red, case 2;
 *   - makeTheMapsDeb names its file mole-office-map_<version>_amd64.deb, with underscores: red, case 2.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  THE_MAP,
  THE_MAPS_DESCRIPTION,
  THE_MAPS_FILES,
  THE_MAPS_PACKAGE,
  copyTheMap,
  makeTheMapsDeb,
  theMapInTheOffice,
  theOfficeInTheDeb,
  whatTheMapsDebGetsWrong,
  whatThePluginsGetWrong,
} from '../scripts/the-office-map-part.mjs'
import { theDebsFiles } from '../scripts/the-packed-app.mjs'
import { THE_PLUGINS_FOLDER } from '../src/config/settings.mjs'
import { PLUGIN_BUILT_FOLDER, PLUGIN_MANIFEST_FILE } from '../src/shared/plugin-change.ts'
import { en } from '../src/shared/words/en.ts'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const folders: string[] = []
const aFolder = (name: string): string => {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

/** Every file under `folder`, by its path from there with /, in order. */
const everyFileIn = (folder: string): string[] =>
  readdirSync(folder, { recursive: true })
    .map(String)
    .filter((name) => statSync(join(folder, name)).isFile())
    .map((name) => name.split(sep).join('/'))
    .sort()

/** AN INVENTED MAP: a manifest, a built folder with a folder in it, and the sources and notes an installer leaves out. */
const anInventedMap = (): string => {
  const folder = aFolder('a-map')
  writeFileSync(join(folder, PLUGIN_MANIFEST_FILE), `${JSON.stringify({ id: THE_MAP, note: 'An invented manifest for a test.' })}\n`)
  mkdirSync(join(folder, PLUGIN_BUILT_FOLDER, 'assets'), { recursive: true })
  writeFileSync(join(folder, PLUGIN_BUILT_FOLDER, 'main.html'), '<p>An invented page.</p>\n')
  writeFileSync(join(folder, PLUGIN_BUILT_FOLDER, 'assets', 'main.js'), '// Invented.\n')
  mkdirSync(join(folder, 'src'))
  writeFileSync(join(folder, 'src', 'main.ts'), '// An invented source.\n')
  writeFileSync(join(folder, 'README.md'), 'Invented notes.\n')
  return folder
}

/** Where the office's own .deb puts the office, as theOfficeInTheDeb reads it from that .deb. */
const THE_OFFICE = ['opt', 'mole-office', 'resources', 'office']

/** AN INVENTED .deb made by hand: the control lines and the files given, packed by dpkg-deb. */
const aDebByHand = (name: string, control: string[], files: Record<string, string>): string => {
  const folder = aFolder(`deb-${name}`)
  const root = join(folder, 'root')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(join(root, 'DEBIAN'), { recursive: true })
  writeFileSync(join(root, 'DEBIAN', 'control'), [...control, 'Architecture: amd64', 'Maintainer: An invented maintainer', 'Description: An invented package for a test', ''].join('\n'))
  // mkdtemp makes a folder only its owner may read, and dpkg-deb refuses a DEBIAN folder like that.
  for (const made of [root, join(root, 'DEBIAN')]) chmodSync(made, 0o755)
  const deb = join(folder, `${name}.deb`)
  execFileSync('dpkg-deb', ['--build', '--root-owner-group', root, deb], { stdio: 'pipe' })
  return deb
}

describe('the office map as a choice at install', () => {
  it("1. takes the map's manifest and built folder and nothing else, and refuses a folder that lacks either before it changes anything", () => {
    expect(THE_MAPS_FILES).toEqual([PLUGIN_MANIFEST_FILE, PLUGIN_BUILT_FOLDER])
    const from = anInventedMap()
    const to = join(aFolder('a-copy'), THE_MAP)
    mkdirSync(to)
    writeFileSync(join(to, 'left-from-before.txt'), 'Invented.\n')
    expect(copyTheMap({ from, to })).toBe(to)
    expect(everyFileIn(to), "the copy holds more than the map's manifest and built folder").toEqual(['dist/assets/main.js', 'dist/main.html', 'plugin.json'])

    rmSync(join(from, PLUGIN_BUILT_FOLDER), { recursive: true })
    expect(() => copyTheMap({ from, to })).toThrow(`${join(from, PLUGIN_BUILT_FOLDER)} is not there, so the office map cannot be packed.`)
    expect(everyFileIn(to), 'a refused copy changed the folder it was to copy into').toEqual(['dist/assets/main.js', 'dist/main.html', 'plugin.json'])
  })

  it("2. makes the map's .deb at the version given, needing mole-office at exactly that version, with the map alone in the office's plugins folder", () => {
    const staged = copyTheMap({ from: anInventedMap(), to: join(aFolder('staged'), THE_MAP) })
    const out = aFolder('out')
    const work = aFolder('work')
    const deb = makeTheMapsDeb({ staged, version: '9.9.9-test.1', arch: 'x64', office: THE_OFFICE, work, out })
    // Named as the office's own .deb is named, mole-office-<version>-amd64.deb, so a person sees the two side by side.
    expect(deb, "the map's .deb is not named <package>-<version>-<architecture>.deb, as the office's own .deb is").toBe(join(out, `${THE_MAPS_PACKAGE}-9.9.9-test.1-amd64.deb`))
    expect(readdirSync(out), "the out folder holds something other than the map's .deb").toEqual([`${THE_MAPS_PACKAGE}-9.9.9-test.1-amd64.deb`])
    expect(readdirSync(work), "the .deb's tree was left in the work folder").toEqual([])

    const field = (name: string): string => execFileSync('dpkg-deb', ['-f', deb, name], { encoding: 'utf8' }).trim()
    expect(field('Package')).toBe('mole-office-map')
    expect(field('Version')).toBe('9.9.9~test.1')
    expect(field('Architecture')).toBe('amd64')
    expect(field('Depends'), 'the map does not need mole-office at exactly its own version').toBe('mole-office (= 9.9.9~test.1)')
    expect(field('Description')).toBe([THE_MAPS_DESCRIPTION[0], ...THE_MAPS_DESCRIPTION.slice(1).map((line) => ` ${line}`)].join('\n'))
    // The description names the place in Settings by the words the Settings page draws.
    expect(THE_MAPS_DESCRIPTION.at(-1), "the .deb's description names a place the Settings page does not draw").toBe(
      `It is off until it is switched on: open ${en['nav.settings']}, then ${en['settingsCats.cat.tools']}, then ${en['settingsPanel.title.plugins']}.`,
    )

    const map = `./${[...THE_OFFICE, ...relative(REPO, THE_PLUGINS_FOLDER).split(sep), THE_MAP].join('/')}/`
    expect(theDebsFiles(deb).filter((path) => path.startsWith(map)).sort(), "the map's .deb holds more than the map's manifest and built folder").toEqual([
      map,
      `${map}dist/`,
      `${map}dist/assets/`,
      `${map}dist/assets/main.js`,
      `${map}dist/main.html`,
      `${map}plugin.json`,
    ])
    expect(theDebsFiles(deb).filter((path) => !path.startsWith(map) && !map.startsWith(path)), "the map's .deb holds a file outside the map's folder").toEqual([])
    expect(whatTheMapsDebGetsWrong({ deb, version: '9.9.9-test.1', office: THE_OFFICE })).toEqual([])
    expect(whatTheMapsDebGetsWrong({ deb, version: '9.9.10-test.1', office: THE_OFFICE }), 'a .deb of another version was taken').toEqual([
      `${deb} is version 9.9.9~test.1, not 9.9.10~test.1.`,
      `${deb} depends on "mole-office (= 9.9.9~test.1)", not on mole-office at exactly 9.9.10~test.1.`,
    ])

    // A .deb made by hand that takes any later office, carries the map's sources and lacks its built folder.
    const byHand = aDebByHand('by-hand', ['Package: mole-office-map', 'Version: 9.9.9~test.1', 'Depends: mole-office (>= 9.9.9~test.1)'], {
      [`${map}plugin.json`]: '{}\n',
      [`${map}src/main.ts`]: '// An invented source.\n',
    })
    expect([...whatTheMapsDebGetsWrong({ deb: byHand, version: '9.9.9-test.1', office: THE_OFFICE })].sort(), 'a wrong .deb made by hand was taken').toEqual(
      [
        `${byHand} depends on "mole-office (>= 9.9.9~test.1)", not on mole-office at exactly 9.9.9~test.1.`,
        `${byHand} holds ${map}src/, which is not the map's plugin.json or dist in ${map}.`,
        `${byHand} holds ${map}src/main.ts, which is not the map's plugin.json or dist in ${map}.`,
        `${byHand} holds no ${map}dist.`,
      ].sort(),
    )

    // Where the office is, read from the office's own .deb by the file the bundle's command is in.
    const office = aDebByHand('the-office', ['Package: mole-office', 'Version: 9.9.9~test.1'], { [`${THE_OFFICE.join('/')}/mole-office.mjs`]: '// Invented.\n' })
    expect(theOfficeInTheDeb(office, 'mole-office.mjs')).toEqual(THE_OFFICE)
    expect(() => theOfficeInTheDeb(office, 'another.mjs')).toThrow(`${office} holds 0 files named another.mjs, so where the office is in it is not known.`)
  }, 60_000)

  it('3. reads a packed office for its plugins: none in the office\'s own installers, and the map alone in the second app', () => {
    const office = aFolder('packed-office')
    const plugins = join(office, ...relative(REPO, THE_PLUGINS_FOLDER).split(sep))
    expect(join(office, ...theMapInTheOffice())).toBe(join(plugins, THE_MAP))
    expect(whatThePluginsGetWrong({ office, withTheMap: false })).toEqual([])
    expect(whatThePluginsGetWrong({ office, withTheMap: true })).toEqual([`${office} holds no plugins folder, so it carries no office map.`])

    copyTheMap({ from: anInventedMap(), to: join(plugins, THE_MAP) })
    expect(whatThePluginsGetWrong({ office, withTheMap: true })).toEqual([])
    expect(whatThePluginsGetWrong({ office, withTheMap: false }), "an office installer's plugin was taken").toEqual([
      `${plugins} is in the packed office, and an office packed without the map carries no plugin.`,
    ])
    writeFileSync(join(plugins, THE_MAP, 'README.md'), 'Invented notes.\n')
    expect(whatThePluginsGetWrong({ office, withTheMap: true }), "a map with its notes in it was taken").toEqual([
      `${join(plugins, THE_MAP)} holds README.md, dist, plugin.json, not the map's plugin.json and dist alone.`,
    ])
    rmSync(join(plugins, THE_MAP, 'README.md'))
    mkdirSync(join(plugins, 'another-plugin'))
    expect(whatThePluginsGetWrong({ office, withTheMap: true }), 'a second app with another plugin was taken').toEqual([`${plugins} holds another-plugin, office-map, not the office map alone.`])
  })
})
