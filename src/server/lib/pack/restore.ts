// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { FOLDERS_A_BACKUP_ALWAYS_CARRIES, FOLDERS_A_BACKUP_CARRIES } from '../backup.ts'
import { inspectPacks, followChain, PACK_NAME } from './chain.ts'
import { CHANGES, WHOLE, foldManifests, type EntryLists, type NamedManifest, type PackEntry } from './manifest.ts'
import { Zip64Reader } from './zip64.ts'

export const RESTORED_DATABASE_NAME = 'mole-office.db'
export const RESTORED_EXPORT_FOLDER = 'export'

function checkedPath(path: string, allowed?: readonly string[]): string {
  if (typeof path !== 'string' || path === '' || path.includes('\\') || path.includes('\0') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error(`Invalid path ${String(path)}`)
  if (allowed !== undefined && !allowed.includes(path.split('/')[0]!)) throw new Error(`Invalid file folder in ${path}`)
  return path
}

function checkEntry(entry: PackEntry, allowed?: readonly string[]): void {
  if (entry === null || typeof entry !== 'object') throw new Error('Invalid manifest entry')
  checkedPath(entry.path, allowed)
  if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error(`Invalid size or hash for ${entry.path}`)
}

async function verifyChain(folder: string, chain: NamedManifest[]): Promise<void> {
  const allowed: readonly string[] = [...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES]
  for (let i = 0; i < chain.length; i += 1) {
    const current = chain[i]!
    try {
    const prior = foldManifests(chain.slice(0, i))
    const manifest = current.manifest
    const lists: EntryLists = manifest.pack === WHOLE ? manifest.entries! : {
      export: [...manifest.added!.export, ...manifest.changed!.export],
      files: [...manifest.added!.files, ...manifest.changed!.files],
    }
    const expected = new Map<string, { sha256: string; bytes: number }>()
    for (const item of lists.export) {
      checkEntry(item)
      const name = `export/${item.path}`
      if (expected.has(name)) throw new Error(`${current.name}: duplicate ${name}`)
      expected.set(name, item)
    }
    for (const item of lists.files) {
      checkEntry(item, allowed)
      if (manifest.pack === WHOLE || !prior.blobs.has(item.sha256)) {
        const name = `files/${item.sha256}`
        const old = expected.get(name)
        if (old !== undefined && old.bytes !== item.bytes) throw new Error(`${current.name}: conflicting size for ${name}`)
        expected.set(name, item)
      }
    }
    if (manifest.pack === CHANGES) {
      for (const path of manifest.removed!.export) checkedPath(path)
      for (const path of manifest.removed!.files) checkedPath(path, allowed)
    }
    const reader = await Zip64Reader.open(join(folder, current.name))
    try {
      const names = reader.names()
      if (names.length !== expected.size + 1 || names.at(-1) !== 'manifest.json') throw new Error(`${current.name}: archive entries do not match the manifest`)
      for (const [name, item] of expected) {
        const hash = createHash('sha256')
        let bytes = 0
        for await (const chunk of reader.read(name)) { hash.update(chunk); bytes += chunk.length }
        if (hash.digest('hex') !== item.sha256 || bytes !== item.bytes) throw new Error(`${current.name}: ${name} does not match its manifest`)
      }
      const hash = createHash('sha256')
      for await (const chunk of reader.read('manifest.json')) hash.update(chunk)
      if (hash.digest('hex') !== current.fingerprint) throw new Error(`${current.name}: manifest.json changed while it was read`)
    } finally { await reader.close() }
    } catch (error) {
      throw new Error(`${current.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

async function extract(reader: Zip64Reader, pack: string, name: string, target: string, expected: PackEntry): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const hash = createHash('sha256')
  let bytes = 0
  const checked = async function* (): AsyncGenerator<Buffer> {
    for await (const chunk of reader.read(name)) { hash.update(chunk); bytes += chunk.length; yield chunk }
    if (hash.digest('hex') !== expected.sha256 || bytes !== expected.bytes) throw new Error(`${pack}: ${name} does not match its manifest`)
  }
  await pipeline(Readable.from(checked()), createWriteStream(target, { flags: 'wx' }))
}

/** The caller starts migration and import as separate processes against this database. */
export async function restorePack(options: {
  from: string
  into: string
  upTo?: string
  runPhases: (database: string, exportFolder: string) => Promise<void>
}): Promise<{ folder: string; name: string; fingerprint: string; notes: string[] }> {
  const folder = resolve(options.from)
  const target = resolve(options.into)
  const partial = `${target}.partial`
  for (const path of [target, partial]) {
    try { await lstat(path); throw new Error(`${path} already exists`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const found = await inspectPacks(folder)
  const name = options.upTo ?? found.names.filter((item) => PACK_NAME.test(item)).at(-1)
  if (name === undefined) throw new Error(`${folder}: no pack was found. ${found.notes.join(' ')}`)
  const newest = found.packs.find((one) => one.name === name)
  if (newest === undefined) throw new Error(`${name}: the pack is missing or unreadable. ${found.notes.join(' ')}`)
  const chain = followChain(newest, found.packs)
  await verifyChain(folder, chain)
  const state = foldManifests(chain)
  await mkdir(partial)
  try {
    const exportFolder = join(partial, RESTORED_EXPORT_FOLDER)
    await mkdir(exportFolder)
    for (const name of [...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES]) await mkdir(join(partial, name), { recursive: true })
    const readers = new Map<string, Zip64Reader>()
    try {
      for (const item of chain) readers.set(item.name, await Zip64Reader.open(join(folder, item.name)))
      for (const [path, item] of state.export) await extract(readers.get(item.pack)!, item.pack, `export/${path}`, join(exportFolder, ...checkedPath(path).split('/')), item)
      for (const [path, item] of state.files) {
        const pack = state.blobs.get(item.sha256)
        if (pack === undefined) throw new Error(`${newest.name}: no pack holds files/${item.sha256}`)
        await extract(readers.get(pack)!, pack, `files/${item.sha256}`, join(partial, ...checkedPath(path, [...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES]).split('/')), item)
      }
    } finally { for (const reader of readers.values()) await reader.close() }
    try { await options.runPhases(join(partial, RESTORED_DATABASE_NAME), exportFolder) }
    catch (error) { throw new Error(`${newest.name}: restore failed: ${error instanceof Error ? error.message : String(error)}`) }
    await rename(partial, target)
  } catch (error) {
    await rm(partial, { recursive: true, force: true })
    throw error
  }
  return { folder: target, name: newest.name, fingerprint: newest.fingerprint, notes: ['No later pack checks the newest manifest. Its pack record holds its fingerprint.'] }
}
