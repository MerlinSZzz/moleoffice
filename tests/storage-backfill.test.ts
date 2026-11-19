// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { closeSync, existsSync, linkSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { CLASSIFY_PREFIX_BYTES, STORAGE_STORES } from '../src/shared/storage/categories.ts'
import { applyStoragePlan, planStorage, PLAN_LINE_BYTES } from '../tools/storage/backfill.ts'
import { registerStorageFile, STORAGE_BATCH_SIZE, STORAGE_IO_BYTES } from '../src/server/lib/storage/inventory.ts'
let t: TestDb
let root: string
let plan: string
beforeEach(async () => {
  t = await freshDb(); root = dirname(t.file); plan = join(root, 'checked-plan.jsonl')
  for (const store of STORAGE_STORES) mkdirSync(join(root, store), { recursive: true })
})
afterEach(() => t?.close())
function file(name: string, bytes: Buffer | string = 'made-up text'): string {
  const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); return path
}
function planned() {
  const fd = openSync(plan, 'w')
  try { return planStorage(t.file, bytes => { writeSync(fd, bytes) }) } finally { closeSync(fd) }
}
const count = (): number => (t.client.sqlite.prepare('SELECT count(*) n FROM storage_files').get() as { n: number }).n
it('the default independent command is read-only and walks physical stores without needing references', () => {
  for (const store of STORAGE_STORES) file(`${store}/orphan.md`)
  const before = createHash('sha256').update(readFileSync(t.file)).digest('hex')
  const run = spawnSync(process.execPath, ['--import','tsx', resolve('tools/storage/backfill.ts'),'--database',t.file], { encoding: 'utf8', timeout: 20_000 })
  expect(run.status, run.stderr).toBe(0)
  expect(JSON.parse(run.stderr).readOnly).toBe(true)
  expect(run.stdout.split('\n').filter(line => line.includes('"type":"file"'))).toHaveLength(STORAGE_STORES.length)
  expect(count()).toBe(0)
  expect(createHash('sha256').update(readFileSync(t.file)).digest('hex')).toBe(before)
})
it('requires a checked digest, applies all stores once and safely reruns unchanged plans', () => {
  for (const store of STORAGE_STORES) file(`${store}/orphan.md`)
  const review = planned()
  expect(() => applyStoragePlan(t.file, plan, '')).toThrow(/checked plan digest/)
  expect(() => applyStoragePlan(t.file, plan, '0'.repeat(64))).toThrow(/digest/)
  expect(count()).toBe(0)
  expect(applyStoragePlan(t.file, plan, review.digest).files).toBe(STORAGE_STORES.length)
  const totals = t.client.sqlite.prepare('SELECT * FROM storage_totals').all()
  applyStoragePlan(t.file, plan, review.digest)
  expect(count()).toBe(STORAGE_STORES.length)
  expect(t.client.sqlite.prepare('SELECT * FROM storage_totals').all()).toEqual(totals)
})
it('refuses changed bytes beyond the classification prefix, missing files and new paths before writes', () => {
  const path = file('report-files/big.txt', Buffer.alloc(CLASSIFY_PREFIX_BYTES + STORAGE_IO_BYTES, 65))
  let review = planned()
  const changed = Buffer.alloc(CLASSIFY_PREFIX_BYTES + STORAGE_IO_BYTES, 65); changed[changed.length - 1] = 66; writeFileSync(path, changed)
  expect(() => applyStoragePlan(t.file, plan, review.digest)).toThrow(/changed/); expect(count()).toBe(0)
  review = planned(); rmSync(path)
  expect(() => applyStoragePlan(t.file, plan, review.digest)).toThrow(); expect(count()).toBe(0)
  file('report-files/one.txt'); review = planned(); file('report-files/two.txt')
  expect(() => applyStoragePlan(t.file, plan, review.digest)).toThrow(/stale/); expect(count()).toBe(0)
})
it('refuses stale inventory, unsafe paths, oversized and changed checked plans', () => {
  file('report-files/one.txt'); const review = planned()
  registerStorageFile(t.client.sqlite, { path: 'report-files/unrelated.txt', category: 'text', bytes: 1, fingerprint: 'unrelated' })
  expect(() => applyStoragePlan(t.file, plan, review.digest)).toThrow(/stale/)
  const lines = readFileSync(plan, 'utf8').trimEnd().split('\n')
  const entry = JSON.parse(lines[1]!); entry.path = '../escape.txt'; lines[1] = JSON.stringify(entry)
  writeFileSync(plan, `${lines.join('\n')}\n`)
  expect(() => applyStoragePlan(t.file, plan, createHash('sha256').update(readFileSync(plan)).digest('hex'))).toThrow(/outside|unsafe/)
  writeFileSync(plan, 'a'.repeat(PLAN_LINE_BYTES + 1))
  expect(() => applyStoragePlan(t.file, plan, review.digest)).toThrow(/oversized/)
})
it('reports missing stores, symbolic links and hard links as incomplete without following them', () => {
  rmSync(join(root, 'avatars'), { recursive: true })
  const target = file('report-files/source.txt')
  symlinkSync(target, join(root, 'message-pictures/link.txt'))
  linkSync(target, join(root, 'returned-files/hard.txt'))
  symlinkSync(join(root, 'report-files'), join(root, 'personal-spaces/linked-folder'))
  const review = planned()
  expect(review.skipped).toBeGreaterThanOrEqual(4)
  expect(readFileSync(plan, 'utf8')).toContain('skip')
  applyStoragePlan(t.file, plan, review.digest)
  expect(count()).toBe(0)
  expect(existsSync(target)).toBe(true)
})
it('resumes bounded committed batches without double counting and preserves an unchanged stored kind', () => {
  for (let i = 0; i < STORAGE_BATCH_SIZE + 3; i++) file(`report-files/${i}.txt`)
  const review = planned()
  expect(() => applyStoragePlan(t.file, plan, review.digest, () => { throw new Error('synthetic interruption') })).toThrow('synthetic interruption')
  expect(count()).toBe(STORAGE_BATCH_SIZE)
  applyStoragePlan(t.file, plan, review.digest)
  expect(count()).toBe(review.files)
  const total = t.client.sqlite.prepare('SELECT bytes FROM storage_totals WHERE category=?').get('text')
  applyStoragePlan(t.file, plan, review.digest)
  expect(t.client.sqlite.prepare('SELECT bytes FROM storage_totals WHERE category=?').get('text')).toEqual(total)
  t.client.sqlite.prepare("UPDATE storage_files SET category='other' WHERE path='report-files/0.txt'").run()
  const next = planned(); applyStoragePlan(t.file, plan, next.digest)
  expect(t.client.sqlite.prepare("SELECT category FROM storage_files WHERE path='report-files/0.txt'").get()).toEqual({ category: 'other' })
})
