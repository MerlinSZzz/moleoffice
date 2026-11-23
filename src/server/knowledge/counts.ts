// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A reading of knowledge query, rating and seal rows for a chosen span. */
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { parseAnyStamp, parseStoredStamp } from '@shared/time.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from '../lib/panel-error.ts'
import { fewestRatings, queryRows, ratingRows, readIds } from './ratings.ts'

/** Both ends are inclusive. Record timestamps are the office's local stored stamps. */
export function knowledgeCounts(from: unknown, to: unknown) {
  if (typeof from !== 'string' || typeof to !== 'string' || !from.trim() || !to.trim()) throw new PanelError(w.countSpan, 400)
  const start = parseAnyStamp(from)?.getTime(), end = parseAnyStamp(to)?.getTime()
  if (start === undefined || end === undefined || start > end) throw new PanelError(w.countSpan, 400)
  const within = (stamp: string) => { const t = parseStoredStamp(stamp); return t !== null && t >= start && t <= end }
  const queries = queryRows(), ratings = ratingRows()
  const inSpan = queries.filter(q => within(q.createdAt))
  const rated = ratings.filter(r => within(r.createdAt))
  const runs = new Set(inSpan.map(q => q.data['run']).filter((run): run is string => typeof run === 'string' && run !== ''))
  const ways: Record<string, number> = Object.create(null)
  const entries = new Set<string>()
  let reads = 0, wordSearchesWithoutReads = 0
  const revisionsOf = sqlite.prepare('SELECT data, at FROM revisions WHERE record_id = ? ORDER BY seq DESC')
  for (const q of inSpan) {
    const snapshot = (revisionsOf.all(q.id) as { data: string; at: string }[]).find(row => { const at = parseStoredStamp(row.at); return at !== null && at <= end })
    const data = snapshot ? JSON.parse(snapshot.data) as Record<string, unknown> : q.data
    const way = data['way']
    if (typeof way === 'string') ways[way] = (ways[way] ?? 0) + 1
    const ids = readIds(data['readAfter'])
    reads += ids.length
    for (const id of ids) entries.add(id)
    if (way === 'words' && ids.length === 0) wordSearchesWithoutReads++
  }
  const spread: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const rating of rated) {
    const score = String(rating.data['score'])
    if (Object.hasOwn(spread, score)) spread[score] = (spread[score] ?? 0) + 1
  }
  const averages = new Map<string, { count: number; sum: number }>()
  for (const rating of ratings) {
    const at = parseStoredStamp(rating.createdAt)
    if (at === null || at > end || typeof rating.data['entry'] !== 'string' || typeof rating.data['score'] !== 'number') continue
    const group = averages.get(rating.data['entry']) ?? { count: 0, sum: 0 }
    group.count++; group.sum += rating.data['score']; averages.set(rating.data['entry'], group)
  }
  const minimum = fewestRatings()
  const entriesUnderFour = [...averages.values()].filter(a => a.count >= minimum && a.sum / a.count < 4).length
  // A seal's creation change names the run as session when the run sealed itself. Use the query
  // revisions and ratings no later than that seal, so later reads and ratings do not rewrite a miss.
  const seals = sqlite.prepare(`SELECT r.created_at, json_extract(r.data, '$.seal.run') AS run, v.rowid AS position
    FROM records r JOIN changes c ON c.record_id = r.id AND c.op = 'create'
    JOIN revisions v ON v.record_id = r.id AND v.op = 'create'
    WHERE r.kind = 'sealed_tip' AND r.deleted_at IS NULL AND c.session_id = json_extract(r.data, '$.seal.run')`).all() as { created_at: string; run: string; position: number }[]
  const revision = sqlite.prepare(`SELECT data FROM revisions WHERE record_id = ? AND rowid <= ? ORDER BY seq DESC LIMIT 1`)
  const ratingPosition = sqlite.prepare(`SELECT rowid AS position FROM revisions WHERE record_id = ? AND op = 'create' LIMIT 1`)
  const missedRuns = new Set<string>(), missedPairs = new Set<string>()
  for (const seal of seals) {
    if (!seal.run || !within(seal.created_at)) continue
    const sealedAt = parseStoredStamp(seal.created_at)!
    const read = new Set<string>()
    for (const q of queries) {
      const queriedAt = parseStoredStamp(q.createdAt)
      if (q.data['run'] !== seal.run || queriedAt === null || queriedAt > sealedAt) continue
      const row = revision.get(q.id, seal.position) as { data: string } | undefined
      if (!row) continue
      const data = JSON.parse(row.data) as Record<string, unknown>
      for (const id of readIds(data['readAfter'])) read.add(id)
    }
    for (const rating of ratings) {
      if (rating.data['run'] !== seal.run || typeof rating.data['entry'] !== 'string') continue
      const position = ratingPosition.get(rating.id) as { position: number } | undefined
      if (position && position.position <= seal.position) read.delete(rating.data['entry'])
    }
    if (read.size) missedRuns.add(seal.run)
    for (const id of read) missedPairs.add(JSON.stringify([seal.run, id]))
  }
  return { from, to, meanings: w.countMeanings, runsQueried: runs.size, queriesByWay: ways,
    entriesRead: { reads, distinct: entries.size }, ratings: { given: rated.length, byScore: spread },
    entriesUnderFour, wordSearchesWithoutReads, misses: { runs: missedRuns.size, pairs: missedPairs.size } }
}
