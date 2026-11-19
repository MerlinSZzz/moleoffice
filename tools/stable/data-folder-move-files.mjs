// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Local file observations and fsynced recovery writes for one data-folder move. */
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { keysPathFrom } from '../../src/config/settings.mjs'
import { theDatabaseHolders, theFileHash } from '../database-holders.mjs'
import { moveFail } from './data-folder-move-preflight.mjs'

export const hashFile = (path, encoding = 'base64') => theFileHash(path, encoding).sha256
export function syncDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
export function savePrivate(path, value) { writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
export function canonicalFile(path) { return lstatSync(path).isFile() && realpathSync(path) === path }
export function envDatabaseDefinitions(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = /^\s*(?:export\s+)?MOLE_OFFICE_DB\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) return []
    const value = match[1]
    return [value.startsWith('"') || value.startsWith("'") ? value.slice(1, value.indexOf(value[0], 1)) : value.replace(/\s+#.*$/, '')]
  })
}
/** The key file's name inside `folder`, asked of the one function that says where it lives beside `database`. */
const keyFileIn = (folder, database) => relative(folder, keysPathFrom({ MOLE_OFFICE_DB: database }))
/**
 * Every name under `folder`, each with the identity of its file. A backup keeps an unchanged file as a hard link to the
 * previous backup's, so one file can have several names. The move carries the folder whole, so a file with several names
 * is accepted only when the walk meets every one of them inside the folder. It reads each file's details, never its bytes.
 */
export function dataFolderFiles(folder, database) {
  const names = [], files = new Map()
  function visit(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix + name, path = join(directory, name), stat = lstatSync(path)
      if (relative === basename(database) + '.service.json') continue
      if (stat.isDirectory()) visit(path, relative + '/')
      else {
        if (!stat.isFile()) moveFail('moveHashDiffers', 'move.hashDiffers')
        const identity = `${stat.dev}:${stat.ino}`, file = files.get(identity) ?? { path, links: stat.nlink, size: stat.size, found: 0 }
        file.found++; files.set(identity, file); names.push({ relative, path, identity })
      }
    }
  }
  visit(folder)
  for (const { path, links, found } of files.values()) {
    if (found !== links) moveFail('moveFileLinkedOutside', 'move.fileLinkedOutside', { values: { path, links, found }, facts: { path, links, found } })
  }
  if (!names.some(name => name.relative === keyFileIn(folder, database))) moveFail('moveHashDiffers', 'move.hashDiffers')
  return { names, files }
}
/** The walk alone, as the preflight runs it while the office still runs: what the move will carry. No file is read. */
export function inspectDataFolderFiles(folder, database) {
  const { names, files } = dataFolderFiles(folder, database), linked = [...files.values()].filter(file => file.links > 1)
  return { names: names.length, files: files.size, linkedFiles: linked.length, linkedNames: linked.reduce((sum, file) => sum + file.found, 0),
    bytes: [...files.values()].reduce((sum, file) => sum + file.size, 0) }
}
/** The hash of every name, by name. A file with several names is read once. */
export function fileManifest(folder, database) {
  const hashes = new Map(), result = {}
  for (const { relative, path, identity } of dataFolderFiles(folder, database).names) {
    if (!hashes.has(identity)) hashes.set(identity, hashFile(path))
    result[relative] = hashes.get(identity)
  }
  return result
}
export function compareManifest(folder, manifest, database, keysOnly = false) {
  const keys = keyFileIn(folder, database), hashes = new Map()
  for (const [name, hash] of Object.entries(manifest)) {
    if (keysOnly && name !== keys && !name.startsWith('agent-run-keys/')) continue
    const path = join(folder, name)
    if (!existsSync(path) || !canonicalFile(path)) moveFail('moveHashDiffers', 'move.hashDiffers')
    // Every name of one file has the same bytes, so the file is read once.
    const { dev, ino } = lstatSync(path), identity = `${dev}:${ino}`
    if (!hashes.has(identity)) hashes.set(identity, hashFile(path))
    if (hashes.get(identity) !== hash) moveFail('moveHashDiffers', 'move.hashDiffers')
  }
}
/** The one holder rule, read here so the move's file layer and the other tools share it. */
export function databaseHolderCheck(database) { return theDatabaseHolders(database) }

