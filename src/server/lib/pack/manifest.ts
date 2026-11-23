// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'

export const PACK_FORMAT = 'mole-office-pack/1'
export const WHOLE = 'whole'
export const CHANGES = 'changes'

export interface PackLink { name: string; manifestSha256: string }
export interface PackEntry { path: string; sha256: string; bytes: number }
export interface EntryLists { export: PackEntry[]; files: PackEntry[] }
export interface RemovedLists { export: string[]; files: string[] }
export interface PackManifest {
  format: typeof PACK_FORMAT
  exportFormat: string
  pack: typeof WHOLE | typeof CHANGES
  scope: { kind: 'office' }
  madeAt: string
  sourceOffice: string | null
  newestMigration: { hash: string; when: number; tag: string | null } | null
  previous: PackLink | null
  base: PackLink | null
  entries?: EntryLists
  added?: EntryLists
  changed?: EntryLists
  removed?: RemovedLists
  counts: Record<string, number>
  notes: string[]
}
export interface NamedManifest { name: string; fingerprint: string; manifest: PackManifest }
export interface PackState {
  export: Map<string, PackEntry & { pack: string }>
  files: Map<string, PackEntry>
  blobs: Map<string, string>
}

export function manifestBytes(manifest: PackManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest)}\n`)
}

export function fingerprintOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Derive the state once, for both the writer and the restore. */
export function foldManifests(chain: readonly NamedManifest[]): PackState {
  const state: PackState = { export: new Map(), files: new Map(), blobs: new Map() }
  for (let i = 0; i < chain.length; i += 1) {
    const item = chain[i]!
    const manifest = item.manifest
    if (manifest.format !== PACK_FORMAT) throw new Error(`${item.name}: unknown pack format`)
    if (i === 0) {
      if (manifest.pack !== WHOLE || manifest.previous !== null || manifest.base !== null || manifest.entries === undefined) throw new Error(`${item.name}: the base is not a whole pack`)
    } else {
      const previous = chain[i - 1]!
      const base = chain[0]!
      if (manifest.pack !== CHANGES || manifest.previous?.name !== previous.name || manifest.previous.manifestSha256 !== previous.fingerprint || manifest.base?.name !== base.name || manifest.base.manifestSha256 !== base.fingerprint || manifest.added === undefined || manifest.changed === undefined || manifest.removed === undefined) throw new Error(`${item.name}: its chain does not match`)
    }
    const apply = (lists: EntryLists): void => {
      for (const entry of lists.export) state.export.set(entry.path, { ...entry, pack: item.name })
      for (const entry of lists.files) {
        state.files.set(entry.path, entry)
        if (!state.blobs.has(entry.sha256)) state.blobs.set(entry.sha256, item.name)
      }
    }
    if (manifest.pack === WHOLE) apply(manifest.entries!)
    else {
      for (const path of manifest.removed!.export) state.export.delete(path)
      for (const path of manifest.removed!.files) state.files.delete(path)
      apply(manifest.added!)
      apply(manifest.changed!)
    }
  }
  return state
}
