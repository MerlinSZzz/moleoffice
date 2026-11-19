// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Private artifact and SQLite copies, called only after real execution is selected. */
import { createHash } from 'node:crypto'
import { chmodSync, closeSync, createReadStream, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { readTheBuildStamp } from '../../src/config/build-stamp.mjs'
import { PLUGINS_FOLDER, PLUGIN_MANIFEST_FILE, PLUGIN_BUILT_FOLDER, PLUGIN_ID } from '../../src/shared/plugin-change.ts'
import { artifactIdentity, backupSqliteInOneStep, copyArtifactTree, requireIndependentArtifactHardLinks, requireIndependentArtifactTargets, requireInstalledPackagesMatchTheLock } from '../independent-storage.mjs'
import { bootstrapFail as fail, bootstrapGit as git } from './stable-bootstrap-support.mjs'


export function syncBootstrapDirectory(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
export function syncBootstrapFile(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) } }
export function syncBootstrapTree(path) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return
  if (stat.isDirectory()) { for (const name of readdirSync(path)) syncBootstrapTree(join(path, name)); syncBootstrapDirectory(path) }
  else if (stat.isFile()) syncBootstrapFile(path)
  else fail('A retained artifact has a special filesystem type.')
}
export async function bootstrapFileHash(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

export async function inspectArtifacts(root, commit) {
  const pluginFiles = git(root, ['ls-tree', '-r', '--name-only', commit, '--', PLUGINS_FOLDER]).split('\n').filter(path => {
    const pieces = path.split('/')
    return pieces.length === 3 && pieces[0] === PLUGINS_FOLDER && PLUGIN_ID.test(pieces[1]) && pieces[2] === PLUGIN_MANIFEST_FILE
  })
  const plugins = pluginFiles.map(path => path.split('/')[1])
  const paths = ['node_modules', 'dist', ...plugins.map(name => `${PLUGINS_FOLDER}/${name}/${PLUGIN_BUILT_FOLDER}`)]
  requireIndependentArtifactHardLinks(paths.map(path => join(root, path)))
  requireIndependentArtifactTargets(root, paths)
  const identities = {}
  for (const path of paths) {
    const full = join(root, path)
    if (!existsSync(full) || !lstatSync(full).isDirectory() || realpathSync(full) !== full || readdirSync(full).length === 0 || git(root, ['ls-files', '--', path])) fail('A required private artifact is absent, linked, empty or tracked.')
    identities[path] = artifactIdentity(full, root, paths.map(name => join(root, name)))
  }
  if (!existsSync(join(root, 'dist/web/index.html')) || readTheBuildStamp(join(root, 'dist/web')).commit !== commit) fail('The prepared web build stamp does not identify the exact commit.')
  for (const name of plugins) {
    const manifest = JSON.parse(readFileSync(join(root, PLUGINS_FOLDER, name, PLUGIN_MANIFEST_FILE), 'utf8'))
    if (!Array.isArray(manifest.pages) || !manifest.pages.length || manifest.pages.some(page => !/^[a-z0-9][a-z0-9-]*$/.test(page.slug) || !existsSync(join(root, PLUGINS_FOLDER, name, PLUGIN_BUILT_FOLDER, `${page.slug}.html`)))) fail('A declared plugin page is not built.')
  }
  requireInstalledPackagesMatchTheLock(root)
  return { paths, plugins, identities }
}

export async function copyAndVerifyArtifacts(source, destination, artifacts) {
  requireIndependentArtifactHardLinks(artifacts.paths.map(path => join(source, path)))
  for (const path of artifacts.paths) {
    const target = join(destination, path)
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    copyArtifactTree(join(source, path), target)
    if (artifactIdentity(target, destination) !== artifacts.identities[path]) fail(`A retained artifact copy differs from its original identity: ${path}.`)
    syncBootstrapTree(target); syncBootstrapDirectory(dirname(target))
  }
}

export async function verifyRetainedArtifacts(root, artifacts) {
  const actual = Object.fromEntries(artifacts.paths.map(path => [path, artifactIdentity(join(root, path), root, artifacts.paths.map(name => join(root, name)))]))
  if (!isDeepStrictEqual(actual, artifacts.identities)) fail('Retained artifacts changed from their recorded identities.')
}

export async function checkpointBootstrapDatabase(file) {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(file, { fileMustExist: true })
  try {
    if (db.pragma('wal_checkpoint(TRUNCATE)').some(row => row.busy)) fail('A database writer prevented checkpointing.')
    if (db.pragma('journal_mode = DELETE', { simple: true }) !== 'delete') fail('The write-excluded check needs checkpointed DELETE journal mode.')
  } finally { db.close() }
  syncBootstrapFile(file); syncBootstrapDirectory(dirname(file))
}

export async function copyAndVerifySqlite(source, target) {
  const { default: Database } = await import('better-sqlite3')
  const fd = openSync(target, 'wx', 0o600); closeSync(fd)
  await backupSqliteInOneStep(source, target)
  chmodSync(target, 0o600)
  await checkpointBootstrapDatabase(target)
  const copy = new Database(target, { readonly: true, fileMustExist: true })
  try {
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok' || !copy.prepare("SELECT name FROM sqlite_master WHERE name='records'").get()) fail('The private SQLite copy is not an intact Office database.')
  } finally { copy.close() }
  syncBootstrapFile(target); syncBootstrapDirectory(dirname(target))
  return { path: target, sha256: await bootstrapFileHash(target) }
}
