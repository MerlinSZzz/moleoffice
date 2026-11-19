// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Inode checks, and the artifact and database copies that keep what they read, shared by release preparation and evidence readers. */
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export function requireSingleFileName(path, stat = lstatSync(path)) {
  if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Independent storage requires an ordinary file without hard links: ${path}`)
}

export function requireIndependentGitObjects(gitDirectory) {
  function visit(path) {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`Independent Git objects cannot contain symbolic links: ${path}`)
    if (stat.isDirectory()) for (const child of readdirSync(path)) visit(join(path, child))
    else requireSingleFileName(path, stat)
  }
  const objects = join(gitDirectory, 'objects')
  if (!lstatSync(objects).isDirectory()) throw new Error(`Independent Git objects need an ordinary directory: ${objects}`)
  visit(objects)
}

/** Both activation and ordinary upgrades require this storage, using their own Git reader. */
export function requireStorageTheUpgradeAccepts(developmentRepository, stableCheckout, git) {
  const devGit = realpathSync(resolve(developmentRepository, git(developmentRepository, ['rev-parse', '--git-common-dir'])))
  const stableGit = realpathSync(resolve(stableCheckout, git(stableCheckout, ['rev-parse', '--git-common-dir'])))
  if (inside(devGit, stableGit) || inside(stableGit, devGit) || !lstatSync(join(stableCheckout, '.git')).isDirectory()) fail('Stable must have independent Git storage, not a shared worktree.')
  for (const metadata of [devGit, stableGit]) if (existsSync(join(metadata, 'objects/info/alternates'))) fail('Shared Git object alternates are refused.')
  requireIndependentGitObjects(stableGit)
  return stableGit
}

/**
 * TWO FOLDERS IN node_modules THAT TOOLS WRITE WHILE ANYTHING RUNS FROM A CHECKOUT THAT USES IT, a sandbox checkout
 * whose node_modules is a link to this one included. Vitest writes its results cache, .vite/vitest/<hash>/results.json,
 * after every test run, and Vite writes a bundled config into .vite-temp and deletes it once loaded. The office reads
 * neither, and both are made again when absent, so a rollback does not need them. An artifact's identity, its checks
 * and its retained copy leave out these two, directly under an artifact folder named node_modules, and nothing else.
 */
const TOOL_CACHES_IN_NODE_MODULES = ['.vite', '.vite-temp']
export function isAToolCache(artifactRoot, path) {
  return basename(artifactRoot) === 'node_modules' && dirname(path) === artifactRoot && TOOL_CACHES_IN_NODE_MODULES.includes(basename(path))
}

/** Count real names only: symbolic aliases cannot account for an external hard link. */
export function requireIndependentArtifactHardLinks(roots) {
  const seen = new Set(), groups = new Map()
  function visit(path) {
    if (roots.some((root) => isAToolCache(root, path))) return
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) return
    const actual = realpathSync(path)
    if (seen.has(actual)) return
    seen.add(actual)
    if (stat.isDirectory()) for (const child of readdirSync(path)) visit(join(path, child))
    else if (stat.isFile()) {
      const key = `${stat.dev}:${stat.ino}`
      const group = groups.get(key) ?? { names: 0, links: stat.nlink, path }
      if (stat.nlink !== group.links) throw new Error(`Artifact hard links changed during inspection: ${path}`)
      group.names++; groups.set(key, group)
    } else throw new Error(`An artifact is not an ordinary file or directory: ${path}`)
  }
  for (const root of roots) visit(root)
  for (const group of groups.values()) if (group.names !== group.links) throw new Error(`Artifact hard links have names outside the retained roots: ${group.path}`)
}

/** Validate live link destinations; a dormant backup only preserves link identity. */
export function requireIndependentArtifactTargets(checkout, artifacts) {
  const roots = artifacts.map((path) => join(checkout, path))
  requireIndependentArtifactHardLinks(roots)
  const contains = (root, path) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
  const seen = new Set()
  function visit(path) {
    if (roots.some((root) => isAToolCache(root, path))) return
    const actual = realpathSync(path)
    if (!contains(checkout, actual)) throw new Error(`An artifact target resolves outside its checkout: ${path}`)
    const stat = lstatSync(actual)
    if (!stat.isFile() && !stat.isDirectory()) throw new Error(`An artifact target is not an ordinary file or directory: ${path}`)
    if (!roots.some((root) => contains(root, actual))) throw new Error(`An artifact target is outside the retained artifact roots: ${path}`)
    if (seen.has(actual)) return
    seen.add(actual)
    if (stat.isDirectory()) for (const child of readdirSync(actual)) visit(join(actual, child))
  }
  for (const root of roots) visit(root)
}

/**
 * The packages installed under `root` are exactly the ones its package-lock.json pins. Each package's own package.json
 * says what is installed. npm's node_modules/.package-lock.json is only npm's note of its last install and goes stale
 * when anything else changes the folder, so it is not read. An optional package may be absent, as npm leaves out one
 * built for another machine. A package must be an ordinary folder, not a link.
 */
export function requireInstalledPackagesMatchTheLock(root) {
  const locked = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages
  if (!locked) fail('Installed dependencies have no locked manifest.')
  const differs = (path, what) => fail(`Installed dependencies differ from the exact package lock: ${path} ${what}.`)
  for (const [path, wanted] of Object.entries(locked)) {
    if (!path.startsWith('node_modules/')) continue
    const folder = join(root, path), stat = lstatSync(folder, { throwIfNoEntry: false })
    if (!stat) { if (wanted.optional === true) continue; differs(path, 'is not installed') }
    if (!stat.isDirectory()) differs(path, 'is not an ordinary folder')
    const manifest = join(folder, 'package.json')
    if (!existsSync(manifest)) differs(path, 'has no package.json')
    const installed = JSON.parse(readFileSync(manifest, 'utf8'))
    const name = wanted.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    if (installed.name !== name) differs(path, `is ${installed.name}, not ${name}`)
    if (installed.version !== wanted.version) differs(path, `is at ${installed.version}, not ${wanted.version}`)
  }
  for (const path of installedPackagePaths(root)) if (!locked[path]) fail(`Installed dependencies contain an unpinned package: ${path}.`)
}

/** Every package folder, or link to a folder, under root's node_modules, nested ones included, as the lock names them. Files, links to files and dot-names are not packages. */
function installedPackagePaths(root) {
  const paths = []
  function modules(folder, prefix) {
    for (const name of readdirSync(folder).sort()) {
      if (name.startsWith('.')) continue
      const at = join(folder, name)
      if (name.startsWith('@') && lstatSync(at).isDirectory()) { for (const inner of readdirSync(at).sort()) if (!inner.startsWith('.')) onePackage(join(at, inner), `${prefix}${name}/${inner}`) }
      else onePackage(at, prefix + name)
    }
  }
  function onePackage(at, path) {
    const stat = lstatSync(at)
    if (!stat.isDirectory() && !statSync(at, { throwIfNoEntry: false })?.isDirectory()) return
    paths.push(path)
    const nested = join(at, 'node_modules')
    if (stat.isDirectory() && lstatSync(nested, { throwIfNoEntry: false })?.isDirectory()) modules(nested, `${path}/node_modules/`)
  }
  const top = join(root, 'node_modules')
  if (lstatSync(top, { throwIfNoEntry: false })?.isDirectory()) modules(top, 'node_modules/')
  return paths
}

const fail = (s) => { throw new Error(s) }
const inside = (parent, child) => child === parent || child.startsWith(parent + sep)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** Includes bytes, modes and link targets, but not the tool caches above; never follows a link outside this checkout. */
export function artifactIdentity(path, root = path, retainedRoots = [path]) {
  requireIndependentArtifactHardLinks(retainedRoots)
  const rows = []
  function visit(at) {
    if (isAToolCache(path, at)) return
    const s = lstatSync(at)
    const name = relative(path, at)
    if (s.isSymbolicLink()) {
      const target = readlinkSync(at)
      if (isAbsolute(target) || !inside(root, resolve(dirname(at), target))) fail(`Artifact link escapes its checkout: ${at}`)
      rows.push([name, 'link', target])
    } else if (s.isDirectory()) {
      rows.push([name, 'directory', s.mode & 0o777])
      for (const entry of readdirSync(at).sort()) visit(join(at, entry))
    } else if (s.isFile()) {
      rows.push([name, 'file', s.mode & 0o777, hash(readFileSync(at))])
    }
    else fail(`Artifact is not an ordinary file, directory or internal link: ${at}`)
  }
  visit(path)
  return hash(JSON.stringify(rows))
}

/**
 * Back up a SQLite database in one step. SQLite restarts a stepped backup whenever another connection writes the
 * source between steps, and the live office writes every few seconds, so 100 pages a step never finished a copy of
 * its 4 GB database. better-sqlite3 turns a negative page count into 0, so "every page" is the largest count it takes.
 */
export async function backupSqliteInOneStep(source, target) {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(source, { readonly: true, fileMustExist: true })
  try { await db.backup(target, { progress: () => 0x7fffffff }) } finally { db.close() }
}

/**
 * Copy one artifact with what artifactIdentity reads: bytes, modes and link targets, without the tool caches above.
 * Node 22.23.2's cpSync keeps each file's mode but gives every folder it makes the mode the umask allows. Under umask
 * 0002 that turned 68 of the live node_modules' 755 folders into 775, and the bootstrap refused its own copy. So each
 * folder takes its original's mode afterwards, deepest first.
 */
export function copyArtifactTree(from, to) {
  cpSync(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, force: false, errorOnExist: true, filter: (source) => !isAToolCache(from, source) })
  function visit(source, target) {
    if (isAToolCache(from, source)) return
    const s = lstatSync(source)
    if (!s.isDirectory()) return
    for (const entry of readdirSync(source)) visit(join(source, entry), join(target, entry))
    chmodSync(target, s.mode & 0o777)
  }
  visit(from, to)
}
