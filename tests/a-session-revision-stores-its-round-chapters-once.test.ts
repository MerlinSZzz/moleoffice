// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SESSION'S ROUND CHAPTERS ARE STORED ONCE, AND EVERY REVISION STILL READS BACK WHOLE.
 *
 * A session record carries the chapters its round was given at `data.extra.roundChapters`, a value of hundreds of
 * kilobytes that rarely changes. Every write to a record stores the whole record again as a revision, so the same
 * chapters were stored once per write, and most of the database's growth was copies of them. Now the first revision
 * that holds a value of the chapters stores it whole, and each later revision with the same value stores, at that
 * place, the sha256 of the value's JSON. `revisions.parts` names the paths that hold such a hash, each with the number
 * of the revision that holds the value whole; NULL means the data is stored whole, as every revision written before
 * this is.
 *
 * What must not change is what a reader is given. So this file reads every revision back through the product's own
 * readers and compares it with what the record held at that write, read from the record at the time: the content, its
 * hash, the history list's changes, a restore, the export, and an import of that export, both again into the same office
 * and into a fresh one. One case stores a later revision in the old way, whole, and reads it back unchanged. The
 * re-mint reads such a revision's hash as right and rebuilds its whole content before rewriting and hashing it.
 *
 * The chapters here are made up and say so (`madeUp: true`), and every record is filed with origin `fixture`.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let ledger: typeof import('../src/server/lib/revisions.ts')
let version: typeof import('../src/server/db/version.ts')
let fielddiff: typeof import('../src/shared/fielddiff.ts')

beforeAll(async () => {
  t = await freshDb()
  ledger = await import('../src/server/lib/revisions.ts')
  version = await import('../src/server/db/version.ts')
  fielddiff = await import('../src/shared/fielddiff.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

/** Made-up chapters of about 60 kB, different for each `seed`, in the shape a round's saved chapters have. */
function madeUpChapters(seed: string): Record<string, unknown> {
  const text = (n: number): string => Array.from({ length: n }, (_, i) => `${seed} made-up line ${String(i)}.`).join('\n')
  return {
    madeUp: true,
    version: 1,
    sources: { code: { bytes: 4000, text: text(150) }, line: { bytes: 3000, text: text(120) } },
    chapters: Array.from({ length: 14 }, (_, i) => ({ chapter: i + 1, level: 'full', text: text(60) })),
    brief: { text: text(200) },
  }
}

/** The JSON of a value as stored, and its full sha256, which is what a revision stores in the value's place. */
function sha256OfJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

interface StoredRow {
  seq: number
  content_hash: string
  data: string
  parts: string | null
}

function storedRevisions(recordId: string): StoredRow[] {
  return t.client.sqlite
    .prepare('SELECT seq, content_hash, data, parts FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(recordId) as StoredRow[]
}

/** The five fields a revision stores, as the record held them. */
function contentOfTheRecord(record: PanelRecord): Record<string, unknown> {
  return { kind: record.kind, title: record.title, summary: record.summary, data: record.data, deletedAt: record.deletedAt }
}

/**
 * A session with chapters, and the writes a run makes after: the office and the agent change other fields, then the
 * chapters change once. Answers with what the record held after each write, read back from the record itself.
 */
function aSessionAndItsWrites(title: string): { id: string; held: PanelRecord[]; first: Record<string, unknown>; second: Record<string, unknown> } {
  const first = madeUpChapters(`${title} first`)
  const second = madeUpChapters(`${title} second`)
  const created = t.api.createRecord({
    kind: 'session',
    title,
    workspaceId: 'default',
    actor: t.api.HUMAN,
    origin: 'fixture',
    data: { state: 'running', doing: 'starting', extra: { roundChapters: first } },
  })
  const held: PanelRecord[] = [created]
  for (const doing of ['reading the brief', 'writing the test', 'running the test']) {
    held.push(t.api.patchRecord(created.id, { dataPatch: { doing } }, t.api.HUMAN).record)
  }
  held.push(t.api.patchRecord(created.id, { dataPatch: { extra: { roundChapters: second } } }, t.api.HUMAN).record)
  held.push(t.api.patchRecord(created.id, { dataPatch: { doing: 'after the chapters changed' } }, t.api.HUMAN).record)
  return { id: created.id, held, first, second }
}

describe('a session revision stores its round chapters once', () => {
  it('stores each value of the chapters whole once, in the first revision that holds it, and its hash in each later one', () => {
    const { id, held, first, second } = aSessionAndItsWrites('Made-up round, stored once')
    const rows = storedRevisions(id)
    expect(rows.map((row) => row.seq)).toEqual(held.map((_, i) => i + 1))
    // Revision 1 holds the first value whole, and revision 5, the write that changed the chapters, holds the second.
    const holderOf = [1, 1, 1, 1, 5, 5]
    for (const [i, row] of rows.entries()) {
      const chapters = (held[i]!.data['extra'] as Record<string, unknown>)['roundChapters']
      const data = JSON.parse(row.data) as { extra: { roundChapters: unknown } }
      if (holderOf[i] === row.seq) {
        expect(row.parts, `revision ${String(row.seq)}: nothing named elsewhere`).toBeNull()
        expect(data.extra.roundChapters, `revision ${String(row.seq)}: the chapters whole`).toEqual(chapters)
        continue
      }
      expect(JSON.parse(row.parts ?? 'null'), `revision ${String(row.seq)}: the revision that holds the chapters`).toEqual({ 'extra.roundChapters': holderOf[i] })
      expect(data.extra.roundChapters, `revision ${String(row.seq)}: the hash in the chapters' place`).toBe(sha256OfJson(chapters))
    }
    expect(sha256OfJson(first)).not.toBe(sha256OfJson(second))
    // What the six revisions store in all is one copy of each value of the chapters, where it was six copies. The
    // rest of each revision's data is under 1,000 bytes.
    const storedBytes = rows.reduce((sum, row) => sum + row.data.length, 0)
    expect(storedBytes).toBeLessThan(JSON.stringify(first).length + JSON.stringify(second).length + rows.length * 1000)
  })

  it('reads every revision back whole, under the hash the record had at that write', () => {
    const { id, held } = aSessionAndItsWrites('Made-up round, read back')
    const rows = storedRevisions(id)
    for (const [i, record] of held.entries()) {
      const seq = i + 1
      const read = ledger.getRevision(id, seq)
      expect(read.content, `revision ${String(seq)}: the content`).toEqual(contentOfTheRecord(record))
      expect(JSON.stringify(read.content.data), `revision ${String(seq)}: the key order`).toBe(JSON.stringify(record.data))
      expect(read.contentHash, `revision ${String(seq)}: the hash`).toBe(version.versionOf(record))
      expect(rows[i]!.content_hash).toBe(version.versionOf(record))
      expect(version.versionOf(read.content)).toBe(version.versionOf(record))
    }
  })

  it('lists the same changes as a comparison of the whole contents', () => {
    const { id, held } = aSessionAndItsWrites('Made-up round, history')
    const listing = ledger.listRevisions(id)
    const bySeq = new Map(listing.revisions.map((entry) => [entry.seq, entry.changed]))
    expect(bySeq.get(1)).toBeNull()
    for (let seq = 2; seq <= held.length; seq += 1) {
      const expected = fielddiff.fieldsThatDiffer(contentOfTheRecord(held[seq - 2]!), contentOfTheRecord(held[seq - 1]!))
      expect(bySeq.get(seq), `the changes at revision ${String(seq)}`).toEqual(expected)
      expect(ledger.compareRevisions(id, seq - 1, seq).differences).toEqual(expected)
    }
    // The write that changed the chapters is listed as changing them, and the others are not.
    const changedTheChapters = [...bySeq.entries()].filter(([, changed]) => (changed ?? []).some((diff) => diff.path.includes('extra.roundChapters'))).map(([seq]) => seq)
    expect(changedTheChapters).toEqual([5])
  })

  it('reads a later revision stored whole, the way every earlier revision is, unchanged', () => {
    const { id, held } = aSessionAndItsWrites('Made-up round, an old row')
    // Revision 2 as a revision written before the change stores it: the data whole, and nothing named elsewhere.
    t.client.sqlite
      .prepare('UPDATE revisions SET data = ?, parts = NULL WHERE record_id = ? AND seq = 2')
      .run(JSON.stringify(held[1]!.data), id)
    const read = ledger.getRevision(id, 2)
    expect(read.content).toEqual(contentOfTheRecord(held[1]!))
    expect(read.contentHash).toBe(version.versionOf(held[1]!))
    const listing = ledger.listRevisions(id).revisions
    for (const seq of [2, 3]) {
      expect(listing.find((entry) => entry.seq === seq)?.changed, `the changes at revision ${String(seq)}`).toEqual(
        fielddiff.fieldsThatDiffer(contentOfTheRecord(held[seq - 2]!), contentOfTheRecord(held[seq - 1]!)),
      )
    }
  })

  it('puts the whole chapters back when an earlier revision is restored', () => {
    const { id, held, first } = aSessionAndItsWrites('Made-up round, restored')
    ledger.restoreRevision(id, 4, t.api.HUMAN, 'a made-up restore')
    const record = t.api.getRecord(id)!
    expect((record.data['extra'] as Record<string, unknown>)['roundChapters']).toEqual(first)
    expect(version.versionOf(record)).toBe(version.versionOf(held[3]!))
  })

  it('keeps the data whole in a session with no chapters', () => {
    const created = t.api.createRecord({ kind: 'session', title: 'Made-up round, no chapters', workspaceId: 'default', actor: t.api.HUMAN, origin: 'fixture', data: { state: 'running', extra: { madeUp: true } } })
    const [row] = storedRevisions(created.id)
    expect(row!.parts).toBeNull()
    expect(JSON.parse(row!.data)).toEqual(created.data)
  })

  it('plans whole revision content and its hash when chapters are stored once', async () => {
    const chapters = madeUpChapters('Made-up round, re-minted')
    const oldId = 'made-up-old-agent'
    const newId = 'made-up-new-agent'
    const created = t.api.createRecord({
      kind: 'session', title: 'Made-up round, re-minted', workspaceId: 'default', actor: t.api.HUMAN, origin: 'fixture',
      data: { state: 'running', doing: 'first', servingAgentId: oldId, extra: { roundChapters: chapters } },
    })
    t.api.patchRecord(created.id, { dataPatch: { doing: 'second' } }, t.api.HUMAN)
    const migration = await import('../src/server/db/remint-migration.ts')
    const history = await import('../src/server/db/remint-history.ts')
    const storedOnce = await import('../src/server/db/revision-stored-once.ts')
    expect(migration.theRevisionsWhoseHashIsWrong(t.client.sqlite).filter((one) => one.recordId === created.id)).toEqual([])
    const original = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(created.id) as Record<string, unknown>[]
    expect(original).toHaveLength(2)
    expect(original[1]!['parts']).not.toBeNull()
    const plan = history.planTheHistoryPass(t.client.sqlite, { newIds: new Map([[oldId, newId]]), underTheRule: (id) => id === oldId ? newId : null })
    const projected = original.map((row) => ({ ...row, ...plan.writes.revisions.find((write) => write.id === row['id'])?.set }))
    const read = (_recordId: string, seq: number) => {
      const row = projected.find((one) => one['seq'] === seq)
      return row === undefined ? undefined : { data: JSON.parse(String(row['data'])), parts: row['parts'] as string | null }
    }
    for (const row of projected) {
      const fragment = JSON.parse(String(row['data'])) as Record<string, unknown>
      const data = storedOnce.wholeRevisionData({ recordId: created.id, seq: Number(row['seq']), data: fragment, parts: row['parts'] as string | null }, read)
      expect(data['servingAgentId']).toBe(newId)
      expect((data['extra'] as Record<string, unknown>)['roundChapters']).toEqual(chapters)
      const content = { kind: String(row['kind']) as PanelRecord['kind'], title: String(row['title']), summary: row['summary'] as string | null, data, deletedAt: row['deleted_at'] as string | null }
      expect(row['content_hash']).toBe(version.versionOf(content))
      if (row['parts'] !== null) expect(row['content_hash']).not.toBe(version.versionOf({ ...content, data: fragment }))
    }
    expect(projected.map((row) => row['id'])).toEqual(original.map((row) => row['id']))
    expect(projected[1]!['parts']).toBe(original[1]!['parts'])
  })

  it('the identity census reads an agent in a chapter held by an earlier revision', async () => {
    const oldId = 'made-up-delegated-agent'
    const chapters = { ...madeUpChapters('census'), delegations: { tasks: [{ inside: { takenBy: { kind: 'agent', id: oldId } } }] } }
    const created = t.api.createRecord({ kind: 'session', title: 'Made-up census round', workspaceId: 'default', actor: t.api.HUMAN, origin: 'fixture', data: { state: 'running', doing: 'first', extra: { roundChapters: chapters } } })
    t.api.patchRecord(created.id, { dataPatch: { doing: 'second' } }, t.api.HUMAN)
    const rows = t.client.sqlite.prepare('SELECT id, data, parts FROM revisions WHERE record_id = ? ORDER BY seq').all(created.id) as { id: string; data: string; parts: string | null }[]
    expect(rows[1]!.parts).not.toBeNull()
    expect(rows[1]!.data).not.toContain(oldId)
    const { takeIdentityCensus } = await import('../src/server/db/registry-aliases/census.ts')
    const found: import('../src/server/db/registry-aliases/census.ts').AnIdentityAt[] = []
    takeIdentityCensus(t.client.sqlite, undefined, undefined, found)
    expect(found.filter(one => one.table === 'revisions' && one.row === rows[1]!.id && one.stored === oldId)).toHaveLength(1)
  })

  it('writes every revision into an export as it is stored, so each value of the chapters is in it once', async () => {
    const title = 'Made-up round, exported'
    const { id } = aSessionAndItsWrites(title)
    const rows = storedRevisions(id)
    const lib = await import('../src/server/lib/export.ts')
    const root = aTestDatabaseFolder('export')
    lib.writeExport(root)
    let pagesWithTheFirstChapters = 0
    for (const row of rows) {
      const page = readFileSync(join(root, 'revisions', id, `${String(row.seq)}.md`), 'utf8')
      const block = /```json mole-office revisions\.data\n([\s\S]*?)\n```/.exec(page)
      expect(block, `revision ${String(row.seq)}: the data block`).not.toBeNull()
      expect(JSON.parse(block![1]!), `revision ${String(row.seq)}: the data`).toEqual(JSON.parse(row.data))
      const parts = /^parts: (.*)$/m.exec(page)
      expect(parts, `revision ${String(row.seq)}: the parts line`).not.toBeNull()
      expect(JSON.parse(parts![1]!), `revision ${String(row.seq)}: the parts`).toEqual(JSON.parse(row.parts ?? 'null'))
      if (page.includes(`${title} first made-up line 0.`)) pagesWithTheFirstChapters += 1
    }
    // The record now holds the second value, so the first is only in the revision that holds it whole.
    expect(pagesWithTheFirstChapters).toBe(1)
  })

  // LAST, because it opens a fresh office in place of the one every case above uses.
  it('imports the archive back: again into this office with no change, and into a fresh office whole', async () => {
    const { id, held } = aSessionAndItsWrites('Made-up round, imported')
    const root = aTestDatabaseFolder('import')
    ;(await import('../src/server/lib/export.ts')).writeExport(root)
    const before = storedRevisions(id)

    // The same office: the archive's whole revisions are the stored ones, so nothing is refused and nothing written.
    const here = await import('../src/server/lib/import.ts')
    const again = here.planImport(root)
    expect(again.refusals).toEqual([])
    expect(again.inserts['revisions'] ?? 0).toBe(0)
    expect(again.updates['revisions'] ?? 0).toBe(0)
    expect(here.applyImport(root).applied).toBe(true)
    expect(storedRevisions(id)).toEqual(before)

    // A fresh office: every revision reads back as the record held it, under the same hash.
    t.close()
    t = await freshDb()
    const fresh = await import('../src/server/lib/import.ts')
    expect(fresh.applyImport(root).applied).toBe(true)
    const readBack = await import('../src/server/lib/revisions.ts')
    for (const [i, record] of held.entries()) {
      const read = readBack.getRevision(id, i + 1)
      expect(read.content, `revision ${String(i + 1)}: the content`).toEqual(contentOfTheRecord(record))
      expect(read.contentHash, `revision ${String(i + 1)}: the hash`).toBe(version.versionOf(record))
    }
  }, 120_000)
})
