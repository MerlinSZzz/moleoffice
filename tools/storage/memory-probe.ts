// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A made-up physical office and a large irrelevant corpus, measured under a heap limit. */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { STORAGE_STORES } from '../../src/shared/storage/categories.ts'
import { readStorageCategories, STORAGE_BATCH_SIZE } from '../../src/server/lib/storage/inventory.ts'
import { applyStoragePlan, planStorage } from './backfill.ts'

const root = resolve(process.argv[2]!)
mkdirSync(root, { recursive: true })
const database = join(root, 'synthetic.db')
const sqlite = new Database(database)
migrate(drizzle(sqlite), { migrationsFolder: new URL('../../drizzle/', import.meta.url).pathname })
const fakeRowBytes = 1024 * 1024
const fakeRows = 96
sqlite.transaction(() => {
  const records = sqlite.prepare("INSERT INTO records(id,owner_id,created_at,updated_at,kind,title,data) VALUES (?, 'synthetic-owner', '2000-01-01 12:00:00', '2000-01-01 12:00:00', 'report', ?, json_object('payload', hex(zeroblob(? / 2))))")
  const revisions = sqlite.prepare("INSERT INTO revisions(id,record_id,seq,content_hash,kind,title,data,op,actor_type,actor_id,at) VALUES (?, ?, 1, 'synthetic-hash', 'report', 'Synthetic report', json_object('payload', hex(zeroblob(? / 2))), 'create', 'agent', 'synthetic-agent', '2000-01-01 12:00:00')")
  for (let i = 0; i < fakeRows; i++) { records.run(`record-${i}`, `Report ${i}`, fakeRowBytes); revisions.run(`revision-${i}`, `record-${i}`, fakeRowBytes) }
})()
for (const store of STORAGE_STORES) mkdirSync(join(root, store))
const files = STORAGE_BATCH_SIZE * 96
for (let i = 0; i < files; i++) writeFileSync(join(root, 'report-files', `file-${i}.md`), 'synthetic file\n')
let peakHeap = 0
let peakRss = 0
const sample = (): void => { const m = process.memoryUsage(); peakHeap = Math.max(peakHeap, m.heapUsed); peakRss = Math.max(peakRss, m.rss) }
if (global.gc) global.gc()
const baselineRss = process.memoryUsage().rss
const baselineHeap = process.memoryUsage().heapUsed
const plan = join(root, 'review.jsonl')
const fd = openSync(plan, 'w')
let planLines = 0
let planned: ReturnType<typeof planStorage>
try { planned = planStorage(database, bytes => { writeSync(fd, bytes); planLines++; if (planLines % STORAGE_BATCH_SIZE === 0) sample() }) } finally { closeSync(fd) }
const applied = applyStoragePlan(database, plan, planned!.digest, sample)
sample()
let queries = 0
let resultRows = 0
const bounded = { prepare(sql: string) {
  queries++
  if (!/^SELECT .+ FROM storage_(totals|measurement)\b/.test(sql)) throw new Error(`Unbounded page query: ${sql}`)
  const statement = sqlite.prepare(sql)
  return { all() { const result = statement.all(); resultRows += result.length; return result }, get() { const result = statement.get(); resultRows += result ? 1 : 0; return result } }
} }
const summary = readStorageCategories(bounded as never)
sqlite.close()
writeSync(1, JSON.stringify({ files, fakeCorpusBytes: fakeRowBytes * fakeRows * 2, baselineHeap, baselineRss, rssGrowth: peakRss - baselineRss, peakHeap, heapGrowth: peakHeap - baselineHeap, peakRss,
  maxRssKiB: process.resourceUsage().maxRSS, queries, resultRows, planLines, batches: applied.batches, countedFiles: summary.categories.reduce((n, row) => n + row.files, 0) }) + '\n')
