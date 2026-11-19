#!/usr/bin/env -S node --import tsx
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Independent physical inventory command. No office client, records or revisions. */
import Database from 'better-sqlite3'
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync, writeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORAGE_CATEGORIES, STORAGE_STORES, type StorageCategory } from '../../src/shared/storage/categories.ts'
import { measureStorageFile, registerStorageFile, storageMeasurement, storagePath, STORAGE_BATCH_SIZE, STORAGE_IO_BYTES, type MeasuredFile } from '../../src/server/lib/storage/inventory.ts'

export const PLAN_LINE_BYTES = 32 * 1024
export const STORAGE_DIRECTORY_DEPTH = 64
export const STORAGE_DIRECTORY_BUFFER = 16
interface Header { type: 'plan'; version: 1; root: string; database: string; identity: string; generation: number }
interface FileLine extends MeasuredFile { type: 'file' }
interface SkipLine { type: 'skip'; path: string; reason: string }
interface End { type: 'end'; files: number; skipped: number; manifest: string }
type Entry = FileLine | SkipLine
const line = (value: unknown): string => `${JSON.stringify(value)}\n`
const identity = (database: string): string => { const s = lstatSync(database, { bigint: true }); return `${s.dev}:${s.ino}` }

/** Directory handles and one entry per depth; never readdir-all or an array of paths. */
function* walk(root: string, folder: string, depth = 0): Generator<Entry> {
  const key = folder.slice(root.length + 1).split('\\').join('/')
  let dir: ReturnType<typeof opendirSync>
  try {
    const stat = lstatSync(folder)
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(folder) !== resolve(folder)) {
      yield { type: 'skip', path: key, reason: 'linked-or-non-directory-store' }; return
    }
    if (depth >= STORAGE_DIRECTORY_DEPTH) { yield { type: 'skip', path: key, reason: 'directory-depth-limit' }; return }
    dir = opendirSync(folder, { bufferSize: STORAGE_DIRECTORY_BUFFER })
  } catch (error) {
    yield { type: 'skip', path: key, reason: `unreadable-directory:${(error as NodeJS.ErrnoException).code ?? 'unknown'}` }; return
  }
  try {
    for (;;) {
      const entry = dir.readSync()
      if (entry === null) break
      const path = join(folder, entry.name)
      if (entry.isDirectory()) { yield* walk(root, path, depth + 1); continue }
      try { yield { type: 'file', ...measureStorageFile(root, path) } } catch (error) {
        yield { type: 'skip', path: storagePath(root, path), reason: (error as Error).message }
      }
    }
  } finally { dir.closeSync() }
}
function* physicalFiles(root: string): Generator<Entry> {
  for (const store of STORAGE_STORES) yield* walk(root, join(root, store))
}
const categoryReaders = new WeakMap<Database.Database, Database.Statement>()
function retainCategory(sqlite: Database.Database, file: FileLine): FileLine {
  let statement = categoryReaders.get(sqlite)
  if (statement === undefined) {
    statement = sqlite.prepare('SELECT category,bytes,fingerprint FROM storage_files WHERE path = ?')
    categoryReaders.set(sqlite, statement)
  }
  const old = statement.get(file.path) as
    { category: StorageCategory; bytes: number; fingerprint: string } | undefined
  return old?.fingerprint === file.fingerprint && old.bytes === file.bytes ? { ...file, category: old.category } : file
}
/** A commutative hash permits streamed directory order without sorting a folder into memory. */
class Manifest {
  private value = Buffer.alloc(32)
  files = 0
  skipped = 0
  add(entry: Entry): void {
    const hash = createHash('sha256').update(line(entry)).digest()
    for (let i = 0; i < this.value.length; i++) this.value[i] = this.value[i]! ^ hash[i]!
    if (entry.type === 'file') this.files++; else this.skipped++
  }
  end(): End { return { type: 'end', files: this.files, skipped: this.skipped, manifest: this.value.toString('hex') } }
}

/** Writes a reviewable JSONL plan and returns the exact digest the reviewer must explicitly supply. */
export function planStorage(database: string, write: (bytes: string) => void): { digest: string; files: number; skipped: number } {
  database = realpathSync(database)
  const root = dirname(database)
  const sqlite = new Database(database, { readonly: true, fileMustExist: true })
  try {
    const header: Header = { type: 'plan', version: 1, database, root, identity: identity(database), generation: storageMeasurement(sqlite)?.generation ?? 0 }
    const hash = createHash('sha256')
    const emit = (value: unknown): void => {
      const bytes = line(value)
      if (Buffer.byteLength(bytes) > PLAN_LINE_BYTES) throw new Error('A plan line exceeds the bounded line limit.')
      hash.update(bytes); write(bytes)
    }
    emit(header)
    const manifest = new Manifest()
    for (const raw of physicalFiles(root)) {
      const entry = raw.type === 'file' ? retainCategory(sqlite, raw) : raw
      manifest.add(entry); emit(entry)
    }
    if ((storageMeasurement(sqlite)?.generation ?? 0) !== header.generation) throw new Error('The inventory changed while planning. Discard this plan.')
    const end = manifest.end(); emit(end)
    return { digest: hash.digest('hex'), files: end.files, skipped: end.skipped }
  } finally { sqlite.close() }
}

/** The plan itself cannot allocate an unbounded JSON string or follow a link. */
function* planLines(plan: string): Generator<string> {
  const fd = openSync(plan, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!fstatSync(fd).isFile()) throw new Error('The checked plan must be a regular file.')
    const buffer = Buffer.alloc(STORAGE_IO_BYTES)
    let pending = Buffer.alloc(0)
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null)
      if (n === 0) break
      const bytes = Buffer.concat([pending, buffer.subarray(0, n)])
      let start = 0
      for (;;) {
        const end = bytes.indexOf(10, start)
        if (end === -1) break
        if (end - start + 1 > PLAN_LINE_BYTES) throw new Error('The checked plan has an oversized line.')
        yield bytes.subarray(start, end + 1).toString('utf8')
        start = end + 1
      }
      pending = Buffer.from(bytes.subarray(start))
      if (pending.length > PLAN_LINE_BYTES) throw new Error('The checked plan has an oversized line.')
    }
    if (pending.length !== 0) throw new Error('The checked plan is truncated.')
  } finally { closeSync(fd) }
}
function checkedHeader(value: unknown, database: string): Header {
  const h = value as Header
  if (h?.type !== 'plan' || h.version !== 1 || h.database !== database || h.root !== dirname(database) ||
      h.identity !== identity(database) || !Number.isSafeInteger(h.generation) || h.generation < 0) throw new Error('The checked plan names a different database or unsupported header.')
  return h
}
function checkedEntry(value: unknown, root: string): Entry {
  const e = value as Entry
  const skippedRoot = e?.type === 'skip' && (STORAGE_STORES as readonly string[]).includes(e.path)
  if (typeof e?.path !== 'string' || (!skippedRoot && e.path !== storagePath(root, join(root, e.path)))) throw new Error('The checked plan has an unsafe storage path.')
  if (e.type === 'skip' && typeof e.reason === 'string') return e
  if (e.type !== 'file' || !STORAGE_CATEGORIES.includes(e.category) || !Number.isSafeInteger(e.bytes) || e.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(e.fingerprint) || typeof e.stamp !== 'string') throw new Error('The checked plan has an invalid file entry.')
  return e
}
function generationAllowed(sqlite: Database.Database, header: Header, digest: string): number {
  const state = storageMeasurement(sqlite)
  const generation = state?.generation ?? 0
  const resumable = state?.plan_digest === digest && state.checked_generation === generation
  if (generation !== header.generation && !resumable) throw new Error('The checked plan is stale: the inventory changed.')
  return generation
}

/** Validates the entire checked manifest before the first write, then commits bounded, resumable batches. */
export function applyStoragePlan(database: string, plan: string, checkedDigest: string, receipt: (bytes: string) => void = () => {}): { files: number; skipped: number; batches: number } {
  if (!/^[a-f0-9]{64}$/.test(checkedDigest)) throw new Error('Apply requires the exact checked plan digest.')
  database = realpathSync(database)
  const planStamp = (): string => { const s = lstatSync(plan, { bigint: true }); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}` }
  const originalPlan = planStamp()
  const assertPlan = (): void => { if (planStamp() !== originalPlan) throw new Error('The checked plan changed during apply.') }
  const sqlite = new Database(database, { fileMustExist: true })
  try {
    const hash = createHash('sha256')
    const expected = new Manifest()
    let header: Header | undefined
    let end: End | undefined
    for (const bytes of planLines(plan)) {
      hash.update(bytes)
      const value: unknown = JSON.parse(bytes)
      if (header === undefined) { header = checkedHeader(value, database); continue }
      if (end !== undefined) throw new Error('The checked plan has entries after its end.')
      if ((value as End)?.type === 'end') { end = value as End; continue }
      const entry = checkedEntry(value, header.root)
      if (entry.type === 'file') {
        const actual = retainCategory(sqlite, { type: 'file', ...measureStorageFile(header.root, join(header.root, entry.path)) })
        if (line(actual) !== line(entry)) throw new Error(`The checked file changed: ${entry.path}`)
      }
      expected.add(entry)
    }
    if (hash.digest('hex') !== checkedDigest) throw new Error('The checked plan digest does not match.')
    if (header === undefined || end === undefined || line(end) !== line(expected.end())) throw new Error('The checked plan is incomplete or its manifest differs.')
    let generation = generationAllowed(sqlite, header, checkedDigest)
    const current = new Manifest()
    for (const raw of physicalFiles(header.root)) current.add(raw.type === 'file' ? retainCategory(sqlite, raw) : raw)
    if (line(current.end()) !== line(end)) throw new Error('The checked plan is stale: physical files or skipped entries changed.')
    const h = header
    const beginCheckpoint = sqlite.prepare(`INSERT INTO storage_measurement(id,generation,phase,plan_digest,skipped,checked_generation)
      VALUES(1,0,'applying',?,?,0) ON CONFLICT(id) DO UPDATE SET phase='applying',plan_digest=excluded.plan_digest,skipped=excluded.skipped`)
    const endCheckpoint = sqlite.prepare('UPDATE storage_measurement SET checked_generation=generation WHERE id=1')
    const checkpoint = (): void => {
      beginCheckpoint.run(checkedDigest, end!.skipped)
      endCheckpoint.run()
      generation = storageMeasurement(sqlite)!.generation
    }
    const assertGeneration = (): void => {
      if ((storageMeasurement(sqlite)?.generation ?? 0) !== generation) throw new Error('The inventory changed during apply. Make a fresh checked plan.')
    }
    sqlite.transaction(() => { assertGeneration(); assertPlan(); checkpoint() }).immediate()
    const batch: FileLine[] = []
    let batches = 0
    const flush = (): void => {
      if (batch.length === 0) return
      sqlite.transaction(() => {
        assertGeneration(); assertPlan()
        for (const file of batch) {
          const actual = measureStorageFile(h.root, join(h.root, file.path))
          if (actual.stamp !== file.stamp || actual.fingerprint !== file.fingerprint) throw new Error(`The checked file changed during apply: ${file.path}`)
          registerStorageFile(sqlite, file, checkedDigest)
        }
        checkpoint()
      }).immediate()
      batches++; receipt(line({ type: 'batch', files: batch.length, batch: batches, digest: checkedDigest }))
      batch.length = 0
    }
    for (const bytes of planLines(plan)) {
      const raw = JSON.parse(bytes) as { type: string }
      if (raw.type !== 'file') continue
      const entry = checkedEntry(raw, h.root)
      if (entry.type !== 'file') continue
      batch.push(entry)
      if (batch.length === STORAGE_BATCH_SIZE) flush()
    }
    flush()
    sqlite.transaction(() => {
      assertGeneration(); assertPlan()
      // Unknown subtrees may still contain earlier inventory. Retain it and expose incomplete coverage.
      if (end!.skipped === 0) sqlite.prepare('DELETE FROM storage_files WHERE seen_plan IS NOT ?').run(checkedDigest)
      sqlite.prepare("UPDATE storage_measurement SET phase='incomplete',checked_generation=generation WHERE id=1").run()
    }).immediate()
    receipt(line({ type: 'receipt', digest: checkedDigest, files: end.files, skipped: end.skipped, complete: false }))
    return { files: end.files, skipped: end.skipped, batches }
  } finally { sqlite.close() }
}

function main(): void {
  const args = process.argv.slice(2)
  const take = (key: string): string | undefined => { const at = args.indexOf(key); return at === -1 ? undefined : args[at + 1] }
  const database = take('--database')
  const apply = take('--apply')
  if (!database || args.some((arg, i) => i % 2 === 0 && !['--database', '--apply', '--checked-digest'].includes(arg)) || args.length % 2 !== 0) {
    throw new Error('Use --database <file> for a read-only plan, or add --apply <plan.jsonl> --checked-digest <sha256>.')
  }
  if (apply === undefined) {
    if (take('--checked-digest')) throw new Error('A checked digest needs --apply.')
    const result = planStorage(database, bytes => { writeSync(1, bytes) })
    writeSync(2, line({ type: 'plan-digest', ...result, readOnly: true }))
  } else {
    applyStoragePlan(database, apply, take('--checked-digest') ?? '', bytes => { writeSync(1, bytes) })
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { writeSync(2, `${(error as Error).message}\n`); process.exitCode = 1 }
}
