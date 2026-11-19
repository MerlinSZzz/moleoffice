// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NODE AN INSTALLED OFFICE RUNS ON, put into a bundle folder where theShippedNodeIn in
 * src/config/settings.mjs says (runtime/bin/node, and runtime/node.exe on Windows), with Node's licence
 * beside it as runtime/LICENSE. scripts/package-mac.mjs and
 * scripts/package-windows.mjs both ask this, so the download, its SHA-256 check and the version check are
 * written once (wave 13t, round 20; before that they were steps of the Linux script).
 *
 * The Linux installers carry no Node: there the office runs on the app's own program, told to run as Node
 * (`theInstallsNode` in src/config/settings.mjs).
 *
 * The archive is downloaded once into ~/.cache/mole-office/node, which is the cache of the person
 * running the build, and checked every time against the SHA-256 that nodejs.org's SHASUMS256.txt for the
 * release gives it, which is read before the archive is.
 *
 * ON WINDOWS (round W13) the archive is a zip, made on Linux, so its node.exe cannot be run here to say
 * its version. Which Node it is rests on the SHA-256 alone, from the SHASUMS256.txt of the release
 * THE_SHIPPED_NODE_VERSION names, and the script says so.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { crc32, inflateRawSync } from 'node:zlib'
import { THE_SHIPPED_NODE_VERSION, theShippedNodeIn } from '../src/config/settings.mjs'
import { fetchChecked } from './checked-downloads.mjs'

/**
 * The name nodejs.org gives the archive of the shipped Node for a system and a processor, without its
 * `.tar.xz` or `.zip`. Node calls a Mac `darwin`, as `process.platform` does, and Windows `win`, where
 * `process.platform` says `win32`.
 *
 * @param {'linux' | 'darwin' | 'win32'} system
 * @param {'x64' | 'arm64'} arch
 */
export function theNodeArchive(system, arch) {
  return `node-v${THE_SHIPPED_NODE_VERSION}-${system === 'win32' ? 'win' : system}-${arch}`
}

/**
 * One file's bytes from a zip archive, read through its central directory, with its CRC-32 checked.
 * Throws when the archive holds no such file, is a zip64 archive (which Node's zips are not), keeps the
 * file in a way other than stored or deflated, or the file's bytes do not match their CRC-32.
 *
 * @param {Buffer} zip
 * @param {string} path inside the archive, with / between names
 * @returns {Buffer}
 */
export function aFileInTheZip(zip, path) {
  // The end of the central directory: its signature, at most a 64 KiB comment from the end.
  let end = -1
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at -= 1) {
    if (zip.readUInt32LE(at) === 0x06054b50) {
      end = at
      break
    }
  }
  if (end === -1) throw new Error('This is not a zip archive: it has no end of a central directory.')
  const entries = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  if (entries === 0xffff || at === 0xffffffff) throw new Error('This is a zip64 archive, which is not read here.')
  for (let entry = 0; entry < entries; entry += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`The zip's central directory is broken at byte ${String(at)}.`)
    const method = zip.readUInt16LE(at + 10)
    const crc = zip.readUInt32LE(at + 16)
    const packed = zip.readUInt32LE(at + 20)
    const size = zip.readUInt32LE(at + 24)
    const nameLength = zip.readUInt16LE(at + 28)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    if (name === path) {
      const local = zip.readUInt32LE(at + 42)
      if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error(`The zip's entry for ${path} points at no file.`)
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const stored = zip.subarray(start, start + packed)
      if (method !== 0 && method !== 8) throw new Error(`The zip keeps ${path} with method ${String(method)}, which is not read here.`)
      const bytes = method === 0 ? Buffer.from(stored) : inflateRawSync(stored)
      if (bytes.length !== size || crc32(bytes) !== crc) throw new Error(`${path} in the zip does not match its CRC-32.`)
      return bytes
    }
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
  }
  throw new Error(`The zip holds no file ${path}.`)
}

/**
 * Download (once), check and unpack the shipped Node into `office`/runtime. Throws, saying what is
 * wrong, when nodejs.org does not answer, the archive does not match its checksum, or the Node in it
 * says another version. A download that does not match is removed.
 *
 * @param {string} office a bundle folder
 * @param {'linux' | 'darwin' | 'win32'} system
 * @param {'x64' | 'arm64'} arch
 * @param {(line: string) => void} say
 * @returns {Promise<string>} the unpacked node
 */
export async function putTheShippedNodeInto(office, system, arch, say) {
  const name = theNodeArchive(system, arch)
  const release = `https://nodejs.org/dist/v${THE_SHIPPED_NODE_VERSION}`
  // THE HOME FROM THE SYSTEM, os.homedir(): HOME where it is set, and the system's own answer where it is not.
  const cache = join(homedir(), '.cache', 'mole-office', 'node')
  mkdirSync(cache, { recursive: true })
  const file = `${name}.${system === 'win32' ? 'zip' : 'tar.xz'}`
  const archive = join(cache, file)
  // The sums first, so the archive is checked against a SHA-256 read before it was downloaded.
  const sums = await fetch(`${release}/SHASUMS256.txt`)
  if (!sums.ok) throw new Error(`nodejs.org answered ${String(sums.status)} for SHASUMS256.txt.`)
  const expected = (await sums.text()).split('\n').find((line) => line.endsWith(`  ${file}`))?.split(/\s+/)[0]
  if (expected === undefined) throw new Error(`SHASUMS256.txt of ${release} does not list ${file}.`)
  const bytes = await fetchChecked({ url: `${release}/${file}`, file: archive, digest: { algorithm: 'sha256', encoding: 'hex', value: expected }, say })
  const runtime = join(office, 'runtime')
  if (system === 'win32') {
    const node = join(office, ...theShippedNodeIn('win32'))
    mkdirSync(dirname(node), { recursive: true })
    writeFileSync(node, aFileInTheZip(bytes, `${name}/node.exe`))
    writeFileSync(join(runtime, 'LICENSE'), aFileInTheZip(bytes, `${name}/LICENSE`))
    say(`Put Node v${THE_SHIPPED_NODE_VERSION} for Windows (SHA-256 checked) and its licence into ${runtime}. Its --version was not run: node.exe is a Windows program.`)
    return node
  }
  mkdirSync(join(runtime, 'bin'), { recursive: true })
  // GNU tar on Linux and bsdtar on a Mac both read .tar.xz with -J and take --strip-components.
  execFileSync('tar', ['-xJf', archive, '-C', runtime, '--strip-components=1', `${name}/bin/node`, `${name}/LICENSE`])
  const node = join(office, ...theShippedNodeIn(system))
  chmodSync(node, 0o755)
  const version = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim()
  if (version !== `v${THE_SHIPPED_NODE_VERSION}`) throw new Error(`The shipped Node says it is ${version}, not v${THE_SHIPPED_NODE_VERSION}.`)
  say(`Put Node ${version} (SHA-256 checked) and its licence into ${runtime}.`)
  return node
}
