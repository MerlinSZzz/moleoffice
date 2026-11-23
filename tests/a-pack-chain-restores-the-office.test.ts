// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { Readable } from 'node:stream'
import { expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'
import { FOLDERS_A_BACKUP_ALWAYS_CARRIES, FOLDERS_A_BACKUP_CARRIES } from '../src/server/lib/backup.ts'
import { CHANGES, WHOLE, type PackManifest } from '../src/server/lib/pack/manifest.ts'
import { Zip64Reader, Zip64Writer } from '../src/server/lib/pack/zip64.ts'

buildTheFirstOfficeInAHook()
const actor = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const day = (n: number) => new Date(2026, 10, n, 9, 0, 0)

async function manifest(path: string): Promise<PackManifest> {
  const reader = await Zip64Reader.open(path)
  try {
    const chunks: Buffer[] = []
    for await (const chunk of reader.read('manifest.json')) chunks.push(chunk)
    return JSON.parse(Buffer.concat(chunks).toString()) as PackManifest
  } finally { await reader.close() }
}

function command(args: string[], database: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], { encoding: 'utf8', env: { ...process.env, MOLE_OFFICE_DB: database }, maxBuffer: 32 * 1024 * 1024 })
}

function files(root: string, folder = root): Record<string, string> {
  const result: Record<string, string> = {}
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, item.name)
    if (item.isDirectory()) Object.assign(result, files(root, path))
    else result[relative(root, path)] = readFileSync(path).toString('base64')
  }
  return result
}

it('makes changes, restores both points, and refuses a broken chain', async () => {
  const office = await freshDb()
  try {
    const { makePack, packWorkFolder, PACK_MARKER } = await import('../src/server/lib/pack/make.ts')
    const { RESTORED_DATABASE_NAME, RESTORED_EXPORT_FOLDER } = await import('../src/server/lib/pack/restore.ts')
    const { writeExport } = await import('../src/server/lib/export.ts')
    const root = dirname(office.file)
    const packs = join(root, 'packs')
    const folders = [...FOLDERS_A_BACKUP_CARRIES, ...FOLDERS_A_BACKUP_ALWAYS_CARRIES]
    for (const name of folders) { mkdirSync(join(root, name), { recursive: true }); writeFileSync(join(root, name, 'initial'), `initial ${name}`) }
    const one = office.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'First note', data: { body: 'first' }, actor })
    const removed = office.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Removed note', data: { body: 'old' }, actor })
    const first = await makePack({ to: packs, database: office.file, now: day(23), whole: true })
    expect(first.pack).toBe(WHOLE)
    office.api.updateRecord(one.id, { data: { body: 'second' } }, actor)
    office.api.deleteRecord(removed.id, actor)
    office.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Second note', data: { body: 'new' }, actor })
    const middleBytes = 'a unique middle file'
    writeFileSync(join(root, folders[0]!, 'middle'), middleBytes)
    const middle = await makePack({ to: packs, database: office.file, now: day(24) })
    expect(middle.pack).toBe(CHANGES)
    expect(middle.previous?.manifestSha256).toBe(first.fingerprint)
    const midExport = join(root, 'expected-middle')
    writeExport(midExport)
    const midExportByNode = join(root, 'expected-middle-by-node')
    const midExportedByNode = command(['scripts/export.ts', '--to', midExportByNode, '--no-commit'], office.file)
    expect(midExportedByNode.status, midExportedByNode.stdout + midExportedByNode.stderr).toBe(0)
    const midFiles = folders.map((name) => files(join(root, name)))
    office.api.updateRecord(one.id, { data: { body: 'third' } }, actor)
    writeFileSync(join(root, folders[0]!, 'last'), 'a unique last file')
    const last = await makePack({ to: packs, database: office.file, now: day(25) })
    expect(last.pack).toBe(CHANGES)
    expect(last.previous?.manifestSha256).toBe(middle.fingerprint)
    const lastExport = join(root, 'expected-last')
    writeExport(lastExport)
    const lastExportByNode = join(root, 'expected-last-by-node')
    const lastExportedByNode = command(['scripts/export.ts', '--to', lastExportByNode, '--no-commit'], office.file)
    expect(lastExportedByNode.status, lastExportedByNode.stdout + lastExportedByNode.stderr).toBe(0)
    const lastFiles = folders.map((name) => files(join(root, name)))
    for (const pack of [middle, last]) {
      const reader = await Zip64Reader.open(join(packs, pack.name))
      try {
        const names = reader.names()
        expect(names.at(-1)).toBe('manifest.json')
        expect(names.filter((name) => name.startsWith('files/'))).toHaveLength(1)
        const m = await manifest(join(packs, pack.name))
        expect(names.filter((name) => name.startsWith('export/')).sort()).toEqual([...m.added!.export, ...m.changed!.export].map((item) => `export/${item.path}`).sort())
      } finally { await reader.close() }
    }
    for (const [pack, expectedExport, expectedFiles, exportByNode] of [[middle, midExport, midFiles, midExportByNode], [last, lastExport, lastFiles, lastExportByNode]] as const) {
      const target = join(root, `restore-${pack.name}`)
      const restored = command(['scripts/pack.ts', 'restore', '--from', packs, '--into', target, '--up-to', pack.name], office.file)
      expect(restored.status, restored.stdout + restored.stderr).toBe(0)
      expect(files(join(target, RESTORED_EXPORT_FOLDER))).toEqual(files(expectedExport))
      for (let i = 0; i < folders.length; i += 1) expect(files(join(target, folders[i]!))).toEqual(expectedFiles[i])
      const again = join(root, `again-${pack.name}`)
      const exported = command(['scripts/export.ts', '--to', again, '--no-commit'], join(target, RESTORED_DATABASE_NAME))
      expect(exported.status, exported.stdout + exported.stderr).toBe(0)
      // The part tables in an export follow the schema module namespace, which is declared under
      // vitest and sorted by name under node. So this compares against an export scripts/export.ts wrote.
      expect(files(again)).toEqual(files(exportByNode))
    }
    const comparison = join(root, 'comparison')
    cpSync(packs, comparison, { recursive: true })
    office.api.updateRecord(one.id, { data: { body: 'changed for both comparisons' } }, actor)
    const fast = await makePack({ to: packs, database: office.file, now: day(26) })
    rmSync(join(packWorkFolder(office.file), PACK_MARKER))
    const slow = await makePack({ to: comparison, database: office.file, now: day(26) })
    const fastManifest = await manifest(join(packs, fast.name))
    const slowManifest = await manifest(join(comparison, slow.name))
    expect(slow.notes.join(' ')).toContain('marker is missing')
    expect({ added: slowManifest.added, changed: slowManifest.changed, removed: slowManifest.removed }).toEqual({ added: fastManifest.added, changed: fastManifest.changed, removed: fastManifest.removed })

    const broken = join(root, 'broken')
    cpSync(packs, broken, { recursive: true })
    renameSync(join(broken, middle.name), join(root, 'held-pack'))
    const missingTarget = join(root, 'missing-restore')
    const missing = command(['scripts/pack.ts', 'restore', '--from', broken, '--into', missingTarget, '--up-to', last.name], office.file)
    expect(missing.status).not.toBe(0)
    expect(missing.stderr).toContain(middle.name)
    expect(existsSync(missingTarget) || existsSync(`${missingTarget}.partial`)).toBe(false)
    renameSync(join(root, 'held-pack'), join(broken, middle.name))
    const middlePath = join(broken, middle.name)
    const bytes = readFileSync(middlePath)
    const offset = bytes.indexOf(Buffer.from(middleBytes))
    expect(offset).toBeGreaterThanOrEqual(0)
    bytes[offset] = bytes[offset]! ^ 1
    writeFileSync(middlePath, bytes)
    const corruptTarget = join(root, 'corrupt-restore')
    const corrupt = command(['scripts/pack.ts', 'restore', '--from', broken, '--into', corruptTarget, '--up-to', last.name], office.file)
    expect(corrupt.status).not.toBe(0)
    expect(corrupt.stderr).toContain(middle.name)
    expect(corrupt.stderr).toContain(`files/${createHash('sha256').update(middleBytes).digest('hex')}`)
    expect(existsSync(corruptTarget) || existsSync(`${corruptTarget}.partial`)).toBe(false)

    cpSync(join(packs, middle.name), middlePath)
    const replacement = `${middlePath}.replacement`
    const reader = await Zip64Reader.open(middlePath)
    const writer = await Zip64Writer.create(replacement)
    for (const name of reader.names()) {
      const chunks: Buffer[] = []
      for await (const chunk of reader.read(name)) chunks.push(chunk)
      const content = Buffer.concat(chunks)
      await writer.add(name, Readable.from([name === 'manifest.json' ? Buffer.concat([content, Buffer.from(' ')]) : content]), 'store')
    }
    await reader.close()
    await writer.close()
    renameSync(replacement, middlePath)
    const altered = command(['scripts/pack.ts', 'restore', '--from', broken, '--into', join(root, 'altered-restore'), '--up-to', last.name], office.file)
    expect(altered.status).not.toBe(0)
    expect(altered.stderr).toContain(last.previous!.manifestSha256)
    expect(altered.stderr).toContain(middle.name)
  } finally { office.close() }
}, 300_000)
