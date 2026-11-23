// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { localStamp } from '../../../shared/time.ts'
import { FOLDERS_A_BACKUP_ALWAYS_CARRIES, FOLDERS_A_BACKUP_CARRIES } from '../backup.ts'
import { installationOf } from '../../db/citizenship-migration.ts'
import { theStoreGivenToTheExport } from '../the-store-to-export.ts'
import { readMigrations, writeExport } from '../export.ts'
import { inspectPacks, followChain } from './chain.ts'
import { CHANGES, PACK_FORMAT, WHOLE, fingerprintOf, foldManifests, manifestBytes, type EntryLists, type NamedManifest, type PackEntry, type PackLink, type PackManifest } from './manifest.ts'
import { Zip64Reader, Zip64Writer } from './zip64.ts'

export const PACK_MARKER = '.pack-last'
const WORK = '.mole-office-pack-export'

export interface MadePack {
  name: string
  folder: string
  bytes: number
  sha256: string
  fingerprint: string
  previous: PackLink | null
  base: PackLink | null
  pack: typeof WHOLE | typeof CHANGES
  madeAt: string
  counts: Record<string, number>
  notes: string[]
}

/** The work folder belongs only to this writer. */
export function packWorkFolder(database: string): string { return join(dirname(resolve(database)), WORK) }

async function hashFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const part of createReadStream(path)) { const chunk = Buffer.from(part); bytes += chunk.length; hash.update(chunk) }
  return { sha256: hash.digest('hex'), bytes }
}

async function filesUnder(root: string, folder: string): Promise<string[]> {
  let info
  try { info = await lstat(folder) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  if (!info.isDirectory()) throw new Error(`${folder} is not a folder`)
  const found: string[] = []
  for (const name of (await readdir(folder)).sort()) {
    const at = join(folder, name)
    const entry = await lstat(at)
    if (entry.isDirectory()) for (const path of await filesUnder(root, at)) found.push(path)
    else if (entry.isFile()) found.push(relative(root, at).split(sep).join('/'))
    else throw new Error(`${at} is not an ordinary file or folder`)
  }
  return found
}

async function entry(root: string, path: string): Promise<PackEntry> {
  return { path, ...await hashFile(join(root, ...path.split('/'))) }
}

function same(a: PackEntry | undefined, b: PackEntry): boolean { return a?.sha256 === b.sha256 && a.bytes === b.bytes }
function link(pack: NamedManifest): PackLink { return { name: pack.name, manifestSha256: pack.fingerprint } }

/** Make one checked pack from the export and the file folders beside the store. */
export async function makePack(options: { to: string; database: string; now?: Date; whole?: boolean }): Promise<MadePack> {
  const folder = resolve(options.to)
  const database = resolve(options.database)
  const work = packWorkFolder(database)
  const officeFolder = dirname(database)
  for (const protectedFolder of [work, ...[...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES].map((name) => join(officeFolder, name))]) {
    const inside = relative(protectedFolder, folder)
    if (inside === '' || (!inside.startsWith(`..${sep}`) && inside !== '..' && !inside.startsWith(sep))) throw new Error(`${folder}: the pack folder is inside a folder the pack reads`)
  }
  await mkdir(folder, { recursive: true })
  await mkdir(work, { recursive: true })
  const found = await inspectPacks(folder)
  const notes = [...found.notes]
  let chain: NamedManifest[] = []
  for (const candidate of [...found.packs].reverse()) {
    try { chain = followChain(candidate, found.packs); break }
    catch (error) { notes.push(error instanceof Error ? error.message : String(error)) }
  }
  const now = options.now ?? new Date()
  const stamp = localStamp(now)
  const date = stamp.slice(0, 10)
  const day = new Date(`${date}T12:00:00`).getDay()
  const kind = options.whole === true || day === 0 || chain.length === 0 ? WHOLE : CHANGES
  if (chain.length === 0) notes.push('No readable pack chain was found, so this pack is whole.')
  const newest = chain.at(-1)
  const prior = foldManifests(chain)
  let marker = ''
  try { marker = (await readFile(join(work, PACK_MARKER), 'utf8')).trim() } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  // Once the export starts, the work folder no longer necessarily describes the marked pack.
  await rm(join(work, PACK_MARKER), { force: true })
  const report = writeExport(work)
  for (const note of report.notes) notes.push(note)
  const fast = kind === CHANGES && newest !== undefined && marker === newest.fingerprint
  if (kind === CHANGES && !fast) notes.push(marker === '' ? 'The export marker is missing, so every export file was compared.' : 'The export marker does not name the newest pack, so every export file was compared.')
  const lists: EntryLists = { export: [], files: [] }
  const added: EntryLists = { export: [], files: [] }
  const changed: EntryLists = { export: [], files: [] }
  const removed = { export: [] as string[], files: [] as string[] }
  if (fast) {
    for (const path of report.written) {
      const next = await entry(work, path)
      const old = prior.export.get(path)
      if (old === undefined) added.export.push(next)
      else if (!same(old, next)) changed.export.push(next)
    }
    for (const path of report.removed) if (prior.export.has(path)) removed.export.push(path)
  } else {
    for (const path of await filesUnder(work, work)) {
      if (path === PACK_MARKER) continue
      const next = await entry(work, path)
      lists.export.push(next)
      const old = prior.export.get(path)
      if (old === undefined) added.export.push(next)
      else if (!same(old, next)) changed.export.push(next)
    }
    if (kind === CHANGES) {
      const seen = new Set(lists.export.map((one) => one.path))
      for (const path of prior.export.keys()) if (!seen.has(path)) removed.export.push(path)
    }
  }
  for (const name of [...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES]) {
    for (const path of await filesUnder(officeFolder, join(officeFolder, name))) {
      const next = await entry(officeFolder, path)
      lists.files.push(next)
      const old = prior.files.get(path)
      if (old === undefined) added.files.push(next)
      else if (!same(old, next)) changed.files.push(next)
    }
  }
  if (kind === CHANGES) {
    const seen = new Set(lists.files.map((one) => one.path))
    for (const path of prior.files.keys()) if (!seen.has(path)) removed.files.push(path)
  }
  // This is the export's own choice of store. Opening the normal client during a command would write to the source.
  const store = theStoreGivenToTheExport() ?? (await import('../../db/client.ts')).sqlite
  const sourceOffice = installationOf(store)
  if (sourceOffice === null) notes.push('Nothing has written which installation this database belongs to.')
  const newestMigration = readMigrations().rows.at(-1) ?? null
  const name = `mole-office-pack-${stamp.slice(0, 10).replaceAll('-', '')}-${stamp.slice(11, 19).replaceAll(':', '')}-${kind}.zip`
  const previous = kind === CHANGES ? link(newest!) : null
  const base = kind === CHANGES ? link(chain[0]!) : null
  const currentEntries = kind === WHOLE ? lists : { export: [...added.export, ...changed.export], files: [...added.files, ...changed.files] }
  const blobPaths = new Map<string, string>()
  for (const file of currentEntries.files) if ((kind === WHOLE || !prior.blobs.has(file.sha256)) && !blobPaths.has(file.sha256)) blobPaths.set(file.sha256, file.path)
  const counts = { exportFiles: currentEntries.export.length, filePaths: currentEntries.files.length, blobs: blobPaths.size, removedExport: removed.export.length, removedFiles: removed.files.length }
  const manifest: PackManifest = { format: PACK_FORMAT, exportFormat: report.format, pack: kind, scope: { kind: 'office' }, madeAt: stamp, sourceOffice, newestMigration, previous, base, ...(kind === WHOLE ? { entries: lists } : { added, changed, removed }), counts, notes }
  const manifestData = manifestBytes(manifest)
  const fingerprint = fingerprintOf(manifestData)
  const expected = new Map<string, string>()
  const partial = join(folder, `${name}.partial`)
  const final = join(folder, name)
  let writer: Zip64Writer | null = null
  let createdPartial = false
  try {
    try { await lstat(final); throw new Error(`${name} already exists`) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    writer = await Zip64Writer.create(partial)
    createdPartial = true
    for (const item of currentEntries.export) {
      const key = `export/${item.path}`
      const result = await writer.add(key, createReadStream(join(work, ...item.path.split('/'))), 'deflate')
      if (result.sha256 !== item.sha256 || result.bytes !== item.bytes) throw new Error(`${name}: ${key} changed while it was packed`)
      expected.set(key, item.sha256)
    }
    for (const [sha, path] of blobPaths) {
      const key = `files/${sha}`
      const result = await writer.add(key, createReadStream(join(officeFolder, ...path.split('/'))), 'store')
      if (result.sha256 !== sha) throw new Error(`${name}: ${key} changed while it was packed`)
      expected.set(key, sha)
    }
    await writer.add('manifest.json', Readable.from([manifestData]), 'deflate')
    expected.set('manifest.json', fingerprint)
    await writer.close()
    writer = null
    const reader = await Zip64Reader.open(partial)
    try {
      if (reader.names().length !== expected.size) throw new Error(`${name}: the entry count does not match`)
      for (const [key, hash] of expected) {
        const digest = createHash('sha256')
        for await (const chunk of reader.read(key)) digest.update(chunk)
        if (digest.digest('hex') !== hash) throw new Error(`${name}: ${key} did not pass read-back`)
      }
    } finally { await reader.close() }
    await rename(partial, final)
    await writeFile(join(work, PACK_MARKER), `${fingerprint}\n`)
  } catch (error) {
    if (writer !== null) await writer.abort().catch(() => {})
    if (createdPartial) await rm(partial, { force: true })
    throw error
  }
  const file = await hashFile(final)
  return { name, folder, bytes: (await stat(final)).size, sha256: file.sha256, fingerprint, previous, base, pack: kind, madeAt: stamp, counts, notes }
}
