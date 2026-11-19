// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Copy the pinned codec, this platform's npm binaries and their runtime dependencies. No downloads.
 * A bundle for another system (scripts/bundle.mjs --for win32-x64) is given that system's package, already
 * fetched at the version package-lock.json locks (scripts/checked-downloads.mjs), and it is copied as it is.
 */
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const libraryLicences = fileURLToPath(new URL('./avatar-codec-licences.txt', import.meta.url))

function packageFolder(name, from) {
  for (const suffix of ['/package.json', '/package', '']) {
    let entry
    try { entry = from.resolve(name + suffix) } catch { continue }
    for (let folder = dirname(entry); folder !== parse(folder).root; folder = dirname(folder)) {
      const path = join(folder, 'package.json')
      if (existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).name === name) return folder
    }
  }
  throw new Error(`The avatar codec runtime package ${name} is not installed. Install the lockfile with npm ci --ignore-scripts.`)
}

/**
 * Whether the npm package carries libvips's own library binaries: the libvips package on Linux and a Mac,
 * and on Windows sharp's package itself, whose lib/ holds libvips's DLLs.
 */
const carriesLibvips = (name) => name.startsWith('@img/sharp-libvips-') || name.startsWith('@img/sharp-win32-')

/**
 * The npm binary carries its library/version list in README, but no licence file of the library's own.
 * Keep that upstream list and the complete LGPL/GPL terms beside the shared library and in the existing
 * notice writer's input; never call the packaging scripts' Apache licence the licence of the library binary.
 */
const writeTheLibraryNotices = (source, destination) => writeFileSync(join(destination, 'LICENSE-LIBRARY-NOTICES.txt'),
  readFileSync(join(source, 'README.md'), 'utf8') + '\n\n' + readFileSync(libraryLicences, 'utf8'))

/** The codec's npm package of native files for a system and processor, as sharp names it. */
export const theAvatarCodecPackageFor = (platform, arch) => `@img/sharp-${platform}-${arch}`

/**
 * @param {string} out the bundle folder
 * @param {{ platform: string, arch: string, folder: string, version: string }} [foreign] another system's
 *   package of native files, unpacked in `folder`, at the `version` the lockfile locks
 */
export function copyAvatarCodecInto(out, foreign) {
  const copied = new Map()
  const copy = (name, from) => {
    if (copied.has(name)) return
    const source = packageFolder(name, from)
    const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    const destination = join(out, 'node_modules', name)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(source, destination, { recursive: true, dereference: true })
    if (carriesLibvips(name)) writeTheLibraryNotices(source, destination)
    copied.set(name, destination)
    const own = createRequire(join(source, 'package.json'))
    for (const dependency of Object.keys(pkg.dependencies ?? {})) copy(dependency, own)
    for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) {
      if (name !== 'sharp' && dependency.startsWith('@img/sharp-libvips-')) copy(dependency, own)
    }
  }
  copy('sharp', require)
  const codec = packageFolder('sharp', require)
  const from = createRequire(join(codec, 'package.json'))
  if (foreign !== undefined) {
    const name = theAvatarCodecPackageFor(foreign.platform, foreign.arch)
    const pkg = JSON.parse(readFileSync(join(foreign.folder, 'package.json'), 'utf8'))
    if (pkg.name !== name || pkg.version !== foreign.version) throw new Error(`${foreign.folder} holds ${pkg.name}@${pkg.version}, not ${name}@${foreign.version}.`)
    if (Object.keys(pkg.dependencies ?? {}).length > 0) throw new Error(`${name} depends on ${Object.keys(pkg.dependencies).join(', ')}, which a bundle for another system is not given.`)
    const destination = join(out, 'node_modules', name)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(foreign.folder, destination, { recursive: true })
    if (carriesLibvips(name)) writeTheLibraryNotices(foreign.folder, destination)
    copied.set(name, destination)
  } else {
    const platform = process.platform === 'linux' && from('detect-libc').familySync() === 'musl' ? 'linuxmusl' : process.platform
    copy(theAvatarCodecPackageFor(platform, process.arch), from)
  }
  return { packages: [...copied.keys()].sort(), folders: [...copied.values()].sort() }
}
