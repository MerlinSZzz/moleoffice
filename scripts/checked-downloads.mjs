// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A DOWNLOAD CHECKED AGAINST A HASH THAT WAS FIXED BEFORE IT (wave 13t, round W13). The Windows package is
 * made on Linux, so the files only a Windows machine would have installed are fetched: the avatar codec's
 * Windows package, at the version and sha512 package-lock.json gives it, and Electron's Windows zip, at the
 * SHA-256 node_modules/electron/checksums.json gives it. A file that does not match is removed and named,
 * and nothing is used in its place.
 *
 * A file is downloaded once into a cache folder the caller names, and checked every time it is used.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** @typedef {{ algorithm: 'sha256' | 'sha512', encoding: 'hex' | 'base64', value: string }} Digest */

/** Where the lockfile's packages must come from. A package resolved anywhere else is not fetched. */
const THE_REGISTRY = 'https://registry.npmjs.org/'

/** @param {Buffer} bytes @param {Digest} digest */
const digestOf = (bytes, digest) => createHash(digest.algorithm).update(bytes).digest(digest.encoding)

/**
 * The bytes of `url`, from `file` when an earlier run downloaded them, and checked against `digest`
 * either way. Throws, naming the file, when the server does not answer or the bytes do not match; a
 * file that does not match is removed.
 *
 * @param {{ url: string, file: string, digest: Digest, say: (line: string) => void }} what
 * @returns {Promise<Buffer>}
 */
export async function fetchChecked({ url, file, digest, say }) {
  if (!existsSync(file)) {
    say(`Downloading ${url}.`)
    const got = await fetch(url)
    if (!got.ok) throw new Error(`${url} answered ${String(got.status)}, so ${basename(file)} was not downloaded.`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(await got.arrayBuffer()))
  }
  const bytes = readFileSync(file)
  const actual = digestOf(bytes, digest)
  if (actual !== digest.value) {
    rmSync(file)
    throw new Error(`${basename(file)} does not match its ${digest.algorithm} (${actual}, expected ${digest.value}); the file was removed and nothing was used in its place.`)
  }
  say(`${basename(file)} matches its ${digest.algorithm}, ${digest.value}, fixed before it was downloaded.`)
  return bytes
}

/**
 * What package-lock.json says of the package `name`: its version, the address it was resolved from and
 * its sha512. Throws when the lockfile does not have it, has it from anywhere but npm's registry, or
 * gives it no sha512.
 *
 * @param {{ packages?: Record<string, { version?: unknown, resolved?: unknown, integrity?: unknown }> }} lock
 * @param {string} name
 * @returns {{ name: string, version: string, url: string, digest: Digest }}
 */
export function theLockedPackage(lock, name) {
  const entry = lock.packages?.[`node_modules/${name}`]
  if (entry === undefined) throw new Error(`package-lock.json does not lock ${name}.`)
  const { version, resolved, integrity } = entry
  if (typeof version !== 'string' || typeof resolved !== 'string' || !resolved.startsWith(THE_REGISTRY)) {
    throw new Error(`package-lock.json locks ${name} from ${String(resolved)}, not from ${THE_REGISTRY}.`)
  }
  if (typeof integrity !== 'string' || !integrity.startsWith('sha512-')) throw new Error(`package-lock.json gives ${name} no sha512.`)
  return { name, version, url: resolved, digest: { algorithm: 'sha512', encoding: 'base64', value: integrity.slice('sha512-'.length) } }
}

/**
 * The package `name` as package-lock.json locks it, downloaded once into `cache`, checked against its
 * sha512 and unpacked into a folder of its own there. Throws when it cannot be.
 *
 * @param {string} name
 * @param {{ lock: Parameters<typeof theLockedPackage>[0], cache: string, say: (line: string) => void }} where
 * @returns {Promise<{ folder: string, version: string, url: string, digest: Digest }>} the unpacked package
 */
export async function fetchTheLockedPackage(name, { lock, cache, say }) {
  const locked = theLockedPackage(lock, name)
  const tarball = join(cache, basename(new URL(locked.url).pathname))
  await fetchChecked({ url: locked.url, file: tarball, digest: locked.digest, say })
  // npm's tarballs hold the package under package/. It is unpacked again on every run, from the checked file.
  const folder = join(cache, `${basename(tarball, '.tgz')}-unpacked`)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  execFileSync('tar', ['-xzf', tarball, '-C', folder, '--strip-components=1', '--no-same-owner'])
  const unpacked = /** @type {{ name?: unknown, version?: unknown }} */ (JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')))
  if (unpacked.name !== name || unpacked.version !== locked.version) {
    throw new Error(`${basename(tarball)} holds ${String(unpacked.name)}@${String(unpacked.version)}, not ${name}@${locked.version}.`)
  }
  return { folder, version: locked.version, url: locked.url, digest: locked.digest }
}
