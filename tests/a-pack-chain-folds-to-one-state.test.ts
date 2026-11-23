// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { CHANGES, PACK_FORMAT, WHOLE, fingerprintOf, foldManifests, manifestBytes, type NamedManifest, type PackEntry, type PackManifest } from '../src/server/lib/pack/manifest.ts'

function entry(path: string, text: string): PackEntry {
  return { path, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) }
}

function named(name: string, manifest: PackManifest): NamedManifest {
  return { name, manifest, fingerprint: fingerprintOf(manifestBytes(manifest)) }
}

it('folds removals and changes while retaining the pack holding each blob', () => {
  const original = entry('one', 'first')
  const shared = entry('file-a', 'same file')
  const first = named('first.zip', {
    format: PACK_FORMAT, exportFormat: 'test format', pack: WHOLE, scope: { kind: 'office' },
    madeAt: '2026-11-23 09:00:00', sourceOffice: null, newestMigration: null, previous: null, base: null,
    entries: { export: [original], files: [shared] }, counts: {}, notes: [],
  })
  const second = named('second.zip', {
    format: PACK_FORMAT, exportFormat: 'test format', pack: CHANGES, scope: { kind: 'office' },
    madeAt: '2026-11-24 09:00:00', sourceOffice: null, newestMigration: null,
    previous: { name: first.name, manifestSha256: first.fingerprint },
    base: { name: first.name, manifestSha256: first.fingerprint },
    added: { export: [entry('two', 'next')], files: [{ ...shared, path: 'file-b' }] },
    changed: { export: [], files: [] }, removed: { export: ['one'], files: ['file-a'] }, counts: {}, notes: [],
  })
  const state = foldManifests([first, second])
  expect([...state.export.keys()]).toEqual(['two'])
  expect(state.export.get('two')?.pack).toBe(second.name)
  expect([...state.files.keys()]).toEqual(['file-b'])
  expect(state.blobs.get(shared.sha256)).toBe(first.name)
  expect(() => foldManifests([second])).toThrow(second.name)
  expect(() => foldManifests([first, { ...second, manifest: { ...second.manifest, previous: { name: first.name, manifestSha256: 'wrong' } } }])).toThrow(second.name)
})
