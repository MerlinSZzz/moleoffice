// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WRITE SHA256SUMS BESIDE THE RELEASE'S PACKAGES, AND CHECK A FOLDER AGAINST IT.
 *
 *   node scripts/write-the-checksums.mjs <folder>
 *   node scripts/write-the-checksums.mjs --check <folder>
 *
 * A person who downloads a package can check that it is the file that was published. The file holds
 * one line per package, in the form `sha256sum -c` reads: the SHA-256 hash, two spaces, and the file
 * name. The lines are sorted by file name. It runs on Linux and on a Mac with the Node the build uses,
 * and imports only Node's own modules.
 *
 * The Linux packages and the Windows installer are made on one machine, and the Mac disk images on a
 * Mac (scripts/build-on-a-mac.mjs). A second run over a folder that has gained the other machine's
 * packages writes every line again and says which lines were not in the SHA256SUMS that was there.
 * It also says which lines of the old file are no longer there, and why. A line goes when its
 * package is not in the folder, or when its hash changed.
 *
 * With --check it reads SHA256SUMS and says, for each line, whether the file matches. It exits 1 when
 * any file does not match, and 0 when every one does.
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** The file this writes and reads, beside the packages it covers. */
const THE_CHECKSUMS_FILE = 'SHA256SUMS'

/**
 * WHICH FILES ARE PACKAGES, written once. The Linux packages are a .deb and an AppImage, the Windows
 * installer is the -setup.exe, and the Mac has a .dmg and a .zip.
 */
const THE_PACKAGE_SUFFIXES = ['.deb', '.AppImage', '-setup.exe', '.dmg', '.zip']

/** Whether a file name is one of the release's packages. @param {string} name */
const isAPackage = (name) => THE_PACKAGE_SUFFIXES.some((suffix) => name.endsWith(suffix))

/** The words that name what a package is, for a refusal. */
const THE_PACKAGES_SAID = `${THE_PACKAGE_SUFFIXES.slice(0, -1).join(', ')} or ${THE_PACKAGE_SUFFIXES.at(-1)}`

/** The SHA-256 of a file, as 64 lower-case hex digits, read in pieces so a package of any size fits. @param {string} file */
function theSHA256Of(file) {
  return new Promise((done, failed) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('error', failed)
      .on('data', (piece) => hash.update(piece))
      .on('end', () => done(hash.digest('hex')))
  })
}

/** A folder's packages, by name, or a refusal in words. @param {string} folder */
function thePackagesIn(folder) {
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    return { refused: `The folder ${folder} is not there. Name the folder that holds the packages.` }
  }
  const names = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isAPackage(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (names.length === 0) {
    return { refused: `The folder ${folder} holds no package. A package is a file whose name ends with ${THE_PACKAGES_SAID}.` }
  }
  return { names }
}

/** The lines for a folder's packages, in the form `sha256sum -c` reads. @param {string} folder @param {string[]} names */
async function theChecksumLines(folder, names) {
  const lines = []
  for (const name of names) lines.push(`${await theSHA256Of(join(folder, name))}  ${name}`)
  return lines
}

/** The lines of a SHA256SUMS file, by the file name each line covers. @param {string[]} lines */
function theLinesByName(lines) {
  const byName = new Map()
  for (const line of lines) {
    if (/^[0-9a-f]{64}  .+$/.test(line)) byName.set(line.slice(66), line)
  }
  return byName
}

/** Write SHA256SUMS for a folder and say what was written and which lines were not there before. @param {string} folder */
async function writeTheChecksums(folder) {
  const packages = thePackagesIn(folder)
  if (packages.refused !== undefined) {
    process.stderr.write(`${packages.refused}\n`)
    process.exitCode = 1
    return
  }
  const lines = await theChecksumLines(folder, packages.names)
  const file = join(folder, THE_CHECKSUMS_FILE)
  const before = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
  writeFileSync(file, `${lines.join('\n')}\n`)
  process.stdout.write(`Wrote ${file} with ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}:\n`)
  for (const line of lines) process.stdout.write(`${line}\n`)
  const added = lines.filter((line) => !before.includes(line))
  if (added.length === 0) {
    process.stdout.write('No line is new since the SHA256SUMS that was there.\n')
  } else {
    process.stdout.write(`New since the SHA256SUMS that was there:\n`)
    for (const line of added) process.stdout.write(`${line}\n`)
  }
  const dropped = []
  for (const [name, line] of theLinesByName(before)) {
    if (lines.includes(line)) continue
    dropped.push(`${name}: ${packages.names.includes(name) ? 'its hash changed' : 'the package is not in the folder'}`)
  }
  if (dropped.length !== 0) {
    process.stdout.write('No longer in SHA256SUMS:\n')
    for (const one of dropped) process.stdout.write(`${one}\n`)
  }
}

/** Read SHA256SUMS and say whether every file matches, ending 1 when one does not. @param {string} folder */
async function checkTheChecksums(folder) {
  const file = join(folder, THE_CHECKSUMS_FILE)
  if (!existsSync(file)) {
    process.stderr.write(`The folder ${folder} holds no ${THE_CHECKSUMS_FILE} to check against.\n`)
    process.exitCode = 1
    return
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line !== '')
  if (lines.length === 0) {
    process.stderr.write(`${file} holds no line to check.\n`)
    process.exitCode = 1
    return
  }
  let wrong = 0
  for (const line of lines) {
    const wanted = line.slice(0, 64)
    const separator = line.slice(64, 66)
    const name = line.slice(66)
    if (!/^[0-9a-f]{64}$/.test(wanted) || separator !== '  ' || name === '') {
      process.stdout.write(`${line}: FAILED, this is not a line this file writes\n`)
      wrong += 1
      continue
    }
    const at = join(folder, name)
    const found = existsSync(at) && statSync(at).isFile() ? await theSHA256Of(at) : null
    if (found === wanted) {
      process.stdout.write(`${name}: OK\n`)
    } else {
      process.stdout.write(`${name}: FAILED${found === null ? ', the file is not there' : ''}\n`)
      wrong += 1
    }
  }
  if (wrong !== 0) {
    process.stderr.write(`${wrong} of ${lines.length} files ${wrong === 1 ? 'does' : 'do'} not match.\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`All ${lines.length} ${lines.length === 1 ? 'file matches' : 'files match'}.\n`)
}

const argumentsGiven = process.argv.slice(2)
const checking = argumentsGiven.includes('--check')
const namesGiven = argumentsGiven.filter((one) => one !== '--check')
const folder = namesGiven[0]
if (namesGiven.length !== 1 || folder === undefined) {
  process.stderr.write('Name one folder: node scripts/write-the-checksums.mjs [--check] <folder>\n')
  process.exitCode = 1
} else if (checking) {
  await checkTheChecksums(resolve(folder))
} else {
  await writeTheChecksums(resolve(folder))
}
