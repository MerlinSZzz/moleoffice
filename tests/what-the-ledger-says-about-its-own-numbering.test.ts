// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE SHAPES A LEDGER CAN HAVE, AND THE ONE SENTENCE THAT IS TRUE OF EACH.
 *
 * A ledger this server writes starts at 1 and has no gaps. A ledger it is HANDED — through a
 * project-scoped archive, whose rows are filtered by a column — can be neither. Two facts got
 * folded into one flag called `gapless`, and a run of revisions numbered 3 and 4 was therefore
 * described as having a hole in it. Nothing is missing between 3 and 4. The sentence was false in
 * exactly the case it was written for.
 *
 * The two facts are now separate: whether anything is missing BETWEEN the ends, and whether the
 * oldest one here is number 1. Three shapes fall out, and this file pins the sentence for each,
 * because each is a claim a person reads about whether they are looking at the whole history.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)
afterAll(() => {
  t.close()
})

/** Delete revisions by number, the way a scoped archive leaves them behind. */
function keepOnlyRevisions(recordId: string, keep: number[]): void {
  t.client.sqlite
    .prepare(`DELETE FROM revisions WHERE record_id = ? AND seq NOT IN (${keep.map(() => '?').join(',')})`)
    .run(recordId, ...keep)
}

async function aRecordWithFourRevisions(): Promise<string> {
  const made = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'first',
    data: { body: 'one' },
    actor: t.api.HUMAN,
  })
  for (const title of ['second', 'third', 'fourth']) {
    t.api.patchRecord(made.id, { title }, t.api.HUMAN)
  }
  return made.id
}

describe('what the list says about whether it is the whole history', () => {
  it('says every revision is here when the ledger starts at 1 with nothing missing', async () => {
    const id = await aRecordWithFourRevisions()
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const note = listRevisions(id).note
    expect(note).toContain('Every version this record has is here')
    expect(note).not.toContain('HOLE')
    expect(note).not.toContain('STARTS AT')
  })

  it('says where the history starts, and does not call it a hole, when nothing is missing between the ends', async () => {
    const id = await aRecordWithFourRevisions()
    keepOnlyRevisions(id, [3, 4])
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const note = listRevisions(id).note

    // THE DEFECT THIS TEST EXISTS FOR. 3 and 4 are consecutive; nothing is missing between them.
    expect(note, 'a run of consecutive numbers was called a hole').not.toContain('HOLE')
    expect(note).toContain("THIS RECORD'S HISTORY STARTS AT 3 HERE")
    expect(note).toContain('The versions before 3 are not in this database')
  })

  it('says a hole is a hole when a number really is missing inside the run', async () => {
    const id = await aRecordWithFourRevisions()
    keepOnlyRevisions(id, [1, 2, 4])
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const note = listRevisions(id).note

    expect(note).toContain('THIS HISTORY HAS A HOLE IN IT')
    expect(note).toContain('the numbers run 1 to 4 and there are only 3')
    expect(note).not.toContain('STARTS AT')
  })

  it('counts the revisions once, so the count and the numbering cannot disagree', async () => {
    const id = await aRecordWithFourRevisions()
    keepOnlyRevisions(id, [2, 3])
    const { listRevisions } = await import('../src/server/lib/revisions.ts')
    const listing = listRevisions(id)
    // The count used to come from one statement and the lowest and highest from another. Two
    // statements against a table that a delete can change between them is the recurring defect in
    // this repository; this asserts they now describe the same two rows.
    expect(listing.count).toBe(2)
    expect(listing.revisions.map((r) => r.seq).sort((a, b) => a - b)).toEqual([2, 3])
  })
})

describe('the served content and the hash that names it read the same fields', () => {
  it('reads a revision through the same function the hash is built from', async () => {
    const id = await aRecordWithFourRevisions()
    const { getRevision } = await import('../src/server/lib/revisions.ts')
    const { versionOf } = await import('../src/server/lib/version.ts')

    // There used to be a second reader of the five fields inside lib/revisions.ts. It agreed with
    // the canonical one on the fields and disagreed about an absent `data`, so the content a caller
    // was served and the hash naming it were worked out by different code.
    const revision = getRevision(id, 4)
    expect(versionOf(revision.content)).toBe(revision.contentHash)
  })

  it('reports no project at all, because a revision is not where the record lives now', async () => {
    const id = await aRecordWithFourRevisions()
    const { getRevision } = await import('../src/server/lib/revisions.ts')
    expect(Object.keys(getRevision(id, 1).content).sort()).toEqual([
      'data',
      'deletedAt',
      'kind',
      'summary',
      'title',
    ])
  })
})
