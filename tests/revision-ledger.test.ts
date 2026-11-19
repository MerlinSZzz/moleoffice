// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVISION LEDGER: what each record HELD, once per write.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `changes` says what changed about a record and never what it was. A `create` row stores the
 * record's TITLE and nothing else, so before the `revisions` table there was no starting point for
 * the later edits to be replayed onto, and nothing about a record's past could be reconstructed.
 *
 * The table only helps if three things are true, and each of them fails silently:
 *
 *   1. EVERY write to the `records` table writes a revision. A write path that forgets one leaves a
 *      hole in the ledger, and a hole looks exactly like a stretch of time when nobody edited the
 *      record.
 *   2. What a revision holds is what the record really held. A revision built from what a caller
 *      SENT rather than from what was STORED would be a claim about a state that never existed.
 *   3. Nothing is ever removed. A restore that rewrote history would produce a record whose past
 *      nobody could cite.
 *
 * So this file drives every write path the product has, and checks the stored rows against what
 * `GET /api/records/:id` served at the same moment — not against what this file asked for.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * The ledger agreeing with the change log is its own file,
 * tests/revision-ledger-agrees-with-the-change-log.test.ts, because that is a statement about two
 * tables rather than about this one. The backfill that gives records written before the ledger
 * existed their first revision is tests/revision-backfill.test.ts, for the same reason.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REVISION_OPS, type PanelRecord, type RevisionOp } from '../src/shared/types.ts'
import { AGENT, apiApp, at, expectPanelError, freshDb, one, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

let t: TestDb

/** The office is made once for the file; each case files the records whose ledger it reads. */
beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

/** The readers, loaded after `freshDb` has pointed MOLE_OFFICE_DB at a throwaway file. */
type Ledger = typeof import('../src/server/lib/revisions.ts')
const ledger = async (): Promise<Ledger> => await import('../src/server/lib/revisions.ts')

/**
 * One stored revision row, read with raw SQL.
 *
 * THROUGH SQL AND NOT THROUGH THE READER, on purpose. Most of this file asks what was STORED, and
 * going through the reader would let a reader that invented a value pass. `content_hash` in
 * particular is the whole identity of a revision and has to come off the row.
 */
interface StoredRevision {
  seq: number
  op: string
  content_hash: string
  workspace_id: string | null
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  actor_type: string
  actor_id: string
  note: string | null
  at: string
}

function stored(recordId: string): StoredRevision[] {
  return t.client.sqlite
    .prepare(
      'SELECT seq, op, content_hash, workspace_id, kind, title, summary, data, deleted_at, actor_type, ' +
        'actor_id, note, at FROM revisions WHERE record_id = ? ORDER BY seq',
    )
    .all(recordId) as StoredRevision[]
}

/** A second project to move records into. Written straight in, the way tests/guard-human-only.test.ts does. */
function makeSecondProject(): void {
  t.client.sqlite
    .prepare(
      'INSERT OR IGNORE INTO workspaces (id, title, note, created_at, updated_at) ' +
        "VALUES ('elsewhere', 'Elsewhere', NULL, '2026-08-12 00:00:00', '2026-08-12 00:00:00')",
    )
    .run()
}

/** A module with one checklist line, so the per-line write path has something to aim at. */
const CHECKLIST = {
  parts: [{ id: 'mount', name: 'Mount and extrinsics', items: [{ id: 'mount-1', text: 'Bolt it on', state: 'todo' }] }],
}

/** A different title for every record, so a failure can be read back to the test that caused it. */
let written = 0
function aModule(): PanelRecord {
  written += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: `ledger · module ${written}`,
    data: CHECKLIST,
    actor: t.api.HUMAN,
  })
}

// ============================================================ 1. every write path writes one

/**
 * ONE WAY THE `records` TABLE IS WRITTEN, and the whole ledger that way of writing should leave.
 *
 * `where` is the function in src/server/lib/records.ts that performs the write. It is a LABEL, so a
 * failure here names the function to open — it is not a claim about the source. The authoritative
 * list of write sites is in tests/revision-ledger-agrees-with-the-change-log.test.ts, which reads
 * them out of the source rather than being told them.
 *
 * `act` performs the writes and answers with the record whose ledger is being asserted. That is not
 * always the record the caller named: renaming a pipeline moves its blocks' titles, and the
 * revision that case is about is the BLOCK's.
 *
 * `ledgerAfter` is the WHOLE ledger, in order, so "exactly one revision per write" is a statement
 * about the list rather than about a count that a second revision could hide inside.
 */
interface WritePath {
  what: string
  where: string
  ledgerAfter: RevisionOp[]
  act(): Promise<string> | string
}

const WRITE_PATHS: WritePath[] = [
  {
    what: 'filing a record',
    where: 'createRecordWithReport',
    ledgerAfter: ['create'],
    act: () => aModule().id,
  },
  {
    what: 'changing a record',
    where: 'patchRecord',
    ledgerAfter: ['create', 'update'],
    act: () => {
      const m = aModule()
      t.api.updateRecord(m.id, { summary: 'said out loud at last' }, t.api.HUMAN)
      return m.id
    },
  },
  {
    what: 'changing one checklist line',
    where: 'patchChecklistItem',
    ledgerAfter: ['create', 'update'],
    act: () => {
      const m = aModule()
      t.api.patchChecklistItem(m.id, 'mount-1', { state: 'done' }, t.api.HUMAN)
      return m.id
    },
  },
  {
    what: 'renaming a block through its pipeline',
    where: 'patchBlock',
    ledgerAfter: ['create', 'update'],
    act: () => {
      written += 1
      const pipeline = t.api.createRecord({
        workspaceId: 'default',
        kind: 'pipeline',
        title: `ledger · pipeline ${written}`,
        data: { blockIds: [] },
        actor: t.api.HUMAN,
      })
      const block = t.blocks.addBlock(pipeline.id, { name: 'the first step', state: 'todo' }, t.api.HUMAN).block
      // THIS CASE USED TO BE A PIPELINE RENAME, which wrote a revision on every block because a
      // block's title carried its pipeline's. A decision ended that, so the write that
      // leaves a block one revision is the block's own rename.
      t.blocks.patchBlock(pipeline.id, block.id, { name: `the first step ${written}` }, t.api.HUMAN)
      return block.id
    },
  },
  {
    what: 'deleting a record',
    where: 'deleteRecord',
    ledgerAfter: ['create', 'delete'],
    act: () => {
      const m = aModule()
      t.api.deleteRecord(m.id, t.api.HUMAN)
      return m.id
    },
  },
  {
    what: 'undoing a delete',
    where: 'restoreRecord',
    // `update` and not `restore`. In the ledger `restore` means an earlier revision's CONTENT was
    // put back; undoing a soft delete changes nothing else about the record, which is the ordinary
    // write the change row beside it already calls an update.
    ledgerAfter: ['create', 'delete', 'update'],
    act: () => {
      const m = aModule()
      t.api.deleteRecord(m.id, t.api.HUMAN)
      t.api.restoreRecord(m.id, t.api.HUMAN)
      return m.id
    },
  },
  {
    what: 'moving a record into another project',
    where: 'fileRecordsInWorkspace',
    ledgerAfter: ['create', 'update'],
    act: () => {
      makeSecondProject()
      const m = aModule()
      t.api.fileRecordsInWorkspace([m.id], 'elsewhere', t.api.HUMAN)
      return m.id
    },
  },
  {
    what: 'putting an earlier revision back',
    // Through `patchRecord`, which is the point: a restore is an ordinary edit carrying a label.
    where: 'patchRecord',
    ledgerAfter: ['create', 'update', 'restore'],
    act: async () => {
      const m = aModule()
      t.api.updateRecord(m.id, { summary: 'a summary somebody later regretted' }, t.api.HUMAN)
      ;(await ledger()).restoreRevision(m.id, 1, t.api.HUMAN)
      return m.id
    },
  },
]

describe('every way the records table is written', () => {
  for (const path of WRITE_PATHS) {
    it(`writes exactly one revision when ${path.what}, and says which kind of write it was`, async () => {
      const id = await path.act()
      expect(
        stored(id).map((r) => r.op),
        `${path.where} did not leave one revision per write`,
      ).toEqual(path.ledgerAfter)
    })
  }

  it('covers every word the ledger has for a write except the one no write makes', () => {
    // `baseline` is the only one no runtime write path produces: a migration writes it, and
    // tests/revision-backfill.test.ts is where that is proved. Read off REVISION_OPS rather than
    // typed out, so a sixth word fails here on the day it is added.
    const covered = [...new Set(WRITE_PATHS.flatMap((p) => p.ledgerAfter))].sort()
    expect(covered).toEqual([...REVISION_OPS].filter((op) => op !== 'baseline').sort())
  })
})

// ============================================================ 2. the numbering

describe('the number on a revision', () => {
  it('starts at 1, has no gaps, and is counted for each record on its own', () => {
    const first = aModule()
    const second = aModule()

    t.api.updateRecord(first.id, { summary: 'one' }, t.api.HUMAN)
    t.api.updateRecord(second.id, { summary: 'two' }, t.api.HUMAN)
    t.api.updateRecord(first.id, { summary: 'three' }, t.api.HUMAN)
    t.api.patchChecklistItem(first.id, 'mount-1', { state: 'done' }, t.api.HUMAN)
    t.api.deleteRecord(second.id, t.api.HUMAN)

    // The first record has had four writes and the second three, and neither counter knows anything
    // about the other.
    expect(stored(first.id).map((r) => r.seq)).toEqual([1, 2, 3, 4])
    expect(stored(second.id).map((r) => r.seq)).toEqual([1, 2, 3])
  })

  it('cannot be held by two revisions of one record, so a gap cannot be papered over', () => {
    const m = aModule()
    const row = one(stored(m.id), 'revision')
    // The unique index on (record_id, seq) is what makes this a ledger: "the one before this" has
    // exactly one answer. Written straight in, because no code path can be asked to do this.
    expect(() =>
      t.client.sqlite
        .prepare(
          'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, ' +
            "deleted_at, op, actor_type, actor_id, session_id, at, note) VALUES ('dupe12345678', ?, 'default', ?, " +
            `'x', 'module', 'a second revision one', NULL, '{}', NULL, 'update', 'human', '${THE_TEST_OFFICES_OWNER.id}', NULL, ?, NULL)`,
        )
        .run(m.id, row.seq, row.at),
    ).toThrow(/UNIQUE/)
  })
})

// ============================================================ 3. what a revision holds

describe('what a revision holds', () => {
  /**
   * THE COMPARISON IS AGAINST WHAT THE PRODUCT SERVED, not against what this file asked for.
   *
   * A revision built from a caller's request rather than from the stored row would agree with the
   * test and disagree with the database. `saveRevision` re-reading the record is what prevents
   * that, and reading the record back through HTTP is the only way to check it from outside.
   */
  it('is what a read of the record served at that moment, token and all', async () => {
    const built = await apiApp()
    const app = built.app
    try {
      const asHuman = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
      const m = aModule()

      /** What GET /api/records/:id says right now: the record as served, and its version token. */
      const read = async (): Promise<{ record: PanelRecord; version: string }> => {
        const res = await app.inject({ method: 'GET', url: `/api/records/${m.id}`, headers: asHuman })
        expect(res.statusCode, `GET /api/records/${m.id} answered ${res.statusCode}`).toBe(200)
        return res.json() as { record: PanelRecord; version: string }
      }

      // One read per write, taken immediately after it, in the order the ledger will hold them.
      const served = [await read()]
      t.api.updateRecord(m.id, { summary: 'a summary' }, t.api.HUMAN)
      served.push(await read())
      t.api.patchChecklistItem(m.id, 'mount-1', { state: 'done' }, t.api.HUMAN)
      served.push(await read())
      t.api.updateRecord(m.id, { title: 'ledger · renamed while being read' }, t.api.HUMAN)
      served.push(await read())
      t.api.deleteRecord(m.id, t.api.HUMAN)
      served.push(await read())
      t.api.restoreRecord(m.id, t.api.HUMAN)
      served.push(await read())

      const rows = stored(m.id)
      expect(rows.length, 'six writes should have left six revisions').toBe(served.length)

      rows.forEach((row, i) => {
        const then = at(served, i, 'read of the record')
        expect(
          {
            workspaceId: row.workspace_id,
            kind: row.kind,
            title: row.title,
            summary: row.summary,
            data: JSON.parse(row.data) as unknown,
            deletedAt: row.deleted_at,
          },
          `revision ${row.seq} does not hold what the record held when it was written`,
        ).toEqual({
          workspaceId: then.record.workspaceId,
          kind: then.record.kind,
          title: then.record.title,
          summary: then.record.summary,
          data: then.record.data,
          deletedAt: then.record.deletedAt,
        })
        // A revision's name and a stale-write token are the same string, deliberately, so the two
        // cannot drift apart — there is only one of them.
        expect(row.content_hash, `revision ${row.seq} is named by a token the API never served`).toBe(then.version)
      })
    } finally {
      await app.close()
    }
  })

  it('says who wrote it, and says the same as the change row written beside it', () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'ledger · written by an agent',
      actor: AGENT,
    })
    const row = one(stored(m.id), 'revision')
    expect({ actorType: row.actor_type, actorId: row.actor_id }).toEqual({ actorType: AGENT.type, actorId: AGENT.id })
    // Both tables derive the project and the session from one function, `attributionFor`. Nothing
    // here restates that rule; it asserts the two answers are the same.
    const change = one(
      t.api.listChanges({ workspaceId: 'default', recordId: m.id }),
      'change row for a freshly filed record',
    )
    expect(row.actor_type).toBe(change.actorType)
    expect(row.actor_id).toBe(change.actorId)
    expect(row.workspace_id).toBe(change.workspaceId)
  })

  it('carries no note on an ordinary edit, because nobody said why', () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'no explanation offered' }, t.api.HUMAN)
    expect(stored(m.id).map((r) => r.note)).toEqual([null, null])
  })
})

// ============================================================ 4. a soft delete

describe('a soft delete', () => {
  it('writes a revision carrying the deletion stamp, so the deleted state can be read back', () => {
    const m = aModule()
    t.api.deleteRecord(m.id, t.api.HUMAN)

    const rows = stored(m.id)
    expect(rows.map((r) => r.op)).toEqual(['create', 'delete'])
    const deleted = at(rows, 1, 'revision')
    expect(deleted.deleted_at, 'the delete revision does not say the record was deleted').not.toBeNull()
    expect(deleted.deleted_at).toBe(t.api.getRecord(m.id)?.deletedAt)
    // And the revision before it says the record was live, which is the state a restore needs.
    expect(at(rows, 0, 'revision').deleted_at).toBeNull()
  })

  it('can be the revision somebody puts back, and the content comes back with the stamp left alone', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'the summary it had when it was deleted' }, t.api.HUMAN)
    t.api.deleteRecord(m.id, t.api.HUMAN)
    t.api.restoreRecord(m.id, t.api.HUMAN)
    t.api.updateRecord(m.id, { summary: 'written after it came back' }, t.api.HUMAN)

    const deletedSeq = one(
      stored(m.id).filter((r) => r.op === 'delete'),
      'revision written by the delete',
    ).seq
    const put = (await ledger()).restoreRevision(m.id, deletedSeq, t.api.HUMAN)

    expect(t.api.getRecord(m.id)?.summary).toBe('the summary it had when it was deleted')
    // The stamp is NOT put back, and the reply says so rather than doing it silently either way.
    // Deleting has its own verb and a patch can neither set nor clear the stamp.
    expect(t.api.getRecord(m.id)?.deletedAt).toBeNull()
    expect(put.deletedStateUntouched?.record).toBeNull()
    expect(put.deletedStateUntouched?.revision).not.toBeNull()
    expect(put.note).toContain('SOFT-DELETE STAMP WAS NOT TOUCHED')
    expect(put.deletedStateUntouched?.whatToSend).toBe(`DELETE /api/records/${m.id}`)
  })
})

// ============================================================ 5. putting an earlier revision back

describe('putting an earlier revision back', () => {
  it('adds a revision and takes none away, so the count only ever goes up', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { title: 'ledger · the second title', summary: 'the second summary' }, t.api.HUMAN)
    t.api.updateRecord(m.id, { summary: 'the third summary' }, t.api.HUMAN)

    const before = stored(m.id)
    const put = (await ledger()).restoreRevision(m.id, 1, t.api.HUMAN, 'the first one was right')
    const after = stored(m.id)

    expect(after.length, 'a restore must add a revision').toBe(before.length + 1)
    expect(put.newSeq).toBe(after.length)
    // Every revision that was there before is still there, unchanged, down to the content hash.
    expect(after.slice(0, before.length)).toEqual(before)

    const newest = at(after, after.length - 1, 'revision')
    const oldest = at(before, 0, 'revision')
    expect(newest.op).toBe('restore')
    expect(newest.title).toBe(oldest.title)
    expect(newest.summary).toBe(oldest.summary)
    expect(newest.content_hash).toBe(oldest.content_hash)
    // The row says which version it put back and why, in words: a restore with no note is a row
    // that cannot say what it restored.
    expect(newest.note).toContain('version 1')
    expect(newest.note).toContain('the first one was right')
    expect(put.putBack).toBe(1)
  })

  it('is refused to an agent on a decision\'s core, in the very words an ordinary edit is refused in', async () => {
    const d = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: `ledger · a decision only ${THE_TEST_OFFICES_OWNER.id} may write`,
      data: { decided_on: '2026-08-14', because: 'it was the cheapest of the three' },
      actor: t.api.HUMAN,
    })
    // THE TITLE, AND NOT THE SUMMARY, IS WHAT THIS CASE MOVES NOW. It used to move `summary`, on the
    // older rule that a decision was refused to an agent whole. Criterion P76 of 13 September 2026
    // splits a decision in two — the decision itself (the option taken, the words why, the title,
    // the words added after the press) against the notes around it (when to revisit, what was
    // rejected, links, provenance) — and a summary is one of the notes, so an agent may now write
    // one. P76 supersedes the older rule because the older one refused an agent work that changing
    // it was never a decision: what this file is about is that a RESTORE is not a second door, and
    // that statement needs a write the gate really refuses, which is a core field.
    t.api.updateRecord(d.id, { title: 'ledger · the owner changed their mind' }, t.api.HUMAN)
    const beforeTheAttempt = stored(d.id)

    const patching = expectPanelError(
      t,
      () => t.api.updateRecord(d.id, { title: 'ledger · an agent tries' }, AGENT),
      403,
    )
    const L = await ledger()
    // Revision 1 carries the FIRST title, so putting it back rewrites the core just as the PATCH
    // above would have. That is what makes the two comparable at all.
    const restoring = expectPanelError(t, () => L.restoreRevision(d.id, 1, AGENT), 403)

    // WORD FOR WORD, out of the same line of code. A restore that reached round the human-only gate
    // would be a second door past the only access control this product has, and a restore refused
    // in DIFFERENT words would be a second copy of the rule.
    expect(restoring.message).toBe(patching.message)
    // And the attempt wrote nothing.
    expect(stored(d.id)).toEqual(beforeTheAttempt)
    expect(t.api.getRecord(d.id)?.title).toBe('ledger · the owner changed their mind')
  })

  it('is open to an agent on a decision\'s notes, and the row it adds says who put it back', async () => {
    const d = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'ledger · a decision whose notes anyone may tidy',
      data: { decided_on: '2026-08-14', because: 'it was the cheapest of the three' },
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(d.id, { summary: 'a summary somebody wrote and regretted' }, t.api.HUMAN)
    const before = stored(d.id)

    // THE OTHER HALF OF CRITERION P76, and the half the case above cannot show. The summary is one
    // of the notes around the decision, so an agent may put back a revision that only moves it —
    // and the ledger is the reason that is safe: the row says who and when, so a note an agent
    // changed can always be told from one the person changed.
    const L = await ledger()
    const put = L.restoreRevision(d.id, 1, AGENT, 'the first wording was the honest one')

    expect(put.putBack).toBe(1)
    expect(put.changed.map((c) => c.path)).toEqual(['summary'])
    expect(t.api.getRecord(d.id)?.summary).toBeNull()

    const added = at(stored(d.id), before.length, 'revision')
    expect(added.op).toBe('restore')
    expect(added.actor_type).toBe(AGENT.type)
    expect(added.actor_id).toBe(AGENT.id)
    expect(added.note).toContain('the first wording was the honest one')
    // And the core is where the person left it.
    expect(t.api.getRecord(d.id)?.title).toBe('ledger · a decision whose notes anyone may tidy')
  })

  it('is refused for a revision number the record does not have, and says how many it has', async () => {
    const m = aModule()
    const L = await ledger()
    const err = expectPanelError(t, () => L.restoreRevision(m.id, 9, t.api.HUMAN), 404)
    expect(err.message).toContain('no version 9')
    expect(err.message).toContain('It has 1')
  })
})

// ============================================================ 6. comparing two

describe('comparing two revisions', () => {
  it('names every field that moved between them and no field that did not', async () => {
    const m = aModule()
    const firstTitle = m.title
    t.api.updateRecord(m.id, { title: 'ledger · a new title', summary: 'a summary it did not have' }, t.api.HUMAN)
    t.api.patchChecklistItem(m.id, 'mount-1', { state: 'done' }, t.api.HUMAN)

    const compared = (await ledger()).compareRevisions(m.id, 1, 3)
    const paths = compared.differences.map((d) => d.path).sort()

    // Three things moved between the first revision and the third. The kind, the project and the
    // deletion stamp did not, and none of them is named.
    expect(paths).toEqual(['data.parts[#mount].items[#mount-1].state', 'summary', 'title'])
    const title = one(
      compared.differences.filter((d) => d.path === 'title'),
      'difference in the title',
    )
    expect({ before: title.before, after: title.after }).toEqual({
      before: firstTitle,
      after: 'ledger · a new title',
    })
  })

  it('answers with nothing at all when the two hold the same content', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'there and back' }, t.api.HUMAN)
    const L = await ledger()
    L.restoreRevision(m.id, 1, t.api.HUMAN)
    // Revision 1 and revision 3 hold the same content: the third put the first one back.
    const compared = L.compareRevisions(m.id, 1, 3)
    expect(compared.differences).toEqual([])
    expect(compared.note).toContain('exactly the same content')
  })

  it('compares in the order it was asked, so asking backwards is a different answer', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'later' }, t.api.HUMAN)
    const L = await ledger()
    const forwards = one(L.compareRevisions(m.id, 1, 2).differences, 'difference')
    const backwards = one(L.compareRevisions(m.id, 2, 1).differences, 'difference')
    // The summary was stored as a real null and then became a string, so both answers print the
    // null as the JSON word `null`. That is not the same as the `before: null` this shape uses for
    // a key that was NOT THERE, and the two must not be confused — hence the exact strings here.
    expect({ before: forwards.before, after: forwards.after }).toEqual({ before: 'null', after: 'later' })
    expect({ before: backwards.before, after: backwards.after }).toEqual({ before: 'later', after: 'null' })
  })
})

// ============================================================ 7. the list

describe('the list of revisions a record has', () => {
  it('says how many there are and whether any were left out of the answer', async () => {
    const m = aModule()
    for (let i = 0; i < 4; i += 1) t.api.updateRecord(m.id, { summary: `edit ${i}` }, t.api.HUMAN)

    const L = await ledger()
    const whole = L.listRevisions(m.id)
    expect(whole.count).toBe(5)
    expect(whole.revisions.length).toBe(5)
    expect(whole.truncated).toBe(false)
    expect(whole.note).toContain('Every version this record has is here')

    // Cut to two, and it says so rather than answering as though that were all of them. GET
    // /api/records/:id serves a record's whole change log with no flag at all, which is a known
    // defect and is deliberately not copied here.
    const cut = L.listRevisions(m.id, 2)
    expect(cut.count).toBe(5)
    expect(cut.revisions.length).toBe(2)
    expect(cut.truncated).toBe(true)
    expect(cut.limit).toBe(2)
    expect(cut.note).toContain('2 are listed here')
  })

  it('declares the versions its row limit left out, by id, through the shared check (Z_CDV9sFsogl)', async () => {
    const m = aModule()
    for (let i = 0; i < 4; i += 1) t.api.updateRecord(m.id, { summary: `edit ${i}` }, t.api.HUMAN)
    const L = await ledger()
    const whole = L.listRevisions(m.id)
    const allIds = whole.revisions.map((one) => one.id)

    // NOTHING LEFT OUT IS SAID AS ZERO, NOT AS SILENCE.
    expect(whole.subtraction).toEqual({ candidates: 5, carried: 5, leftOut: 0, shortened: 0 })
    expect(whole.leftOutGroups).toEqual([{ cause: 'budget', bucket: 'row_limit', count: 0, ids: [] }])
    expect(whole.says).toBeNull()

    // CUT TO TWO: the three older versions are named by id, in the one group, and said in words.
    const cut = L.listRevisions(m.id, 2)
    expect(cut.subtraction).toEqual({ candidates: 5, carried: 2, leftOut: 3, shortened: 0 })
    expect(cut.leftOutGroups).toEqual([{ cause: 'budget', bucket: 'row_limit', count: 3, ids: allIds.slice(2) }])
    expect([...cut.revisions.map((one) => one.id), ...(cut.leftOutGroups[0]?.ids ?? [])]).toEqual(allIds)
    expect(cut.says).toBe('Older versions of this record left out beyond this reply’s row limit: 3.')
  })

  it('is newest first, and says what moved into each entry from the one before it', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'the only edit' }, t.api.HUMAN)
    const listed = (await ledger()).listRevisions(m.id).revisions
    expect(listed.map((r) => r.seq)).toEqual([2, 1])
    expect(one(at(listed, 0, 'entry').changed ?? [], 'difference').path).toBe('summary')
    // NULL AND NOT AN EMPTY LIST on the oldest one: there is nothing earlier to compare with, which
    // is a different fact from "nothing changed".
    expect(at(listed, 1, 'entry').changed).toBeNull()
  })

  it('says a record it has nothing for has nothing, rather than answering as though it did', async () => {
    const empty = (await ledger()).listRevisions('no-such-rec')
    expect(empty.count).toBe(0)
    expect(empty.revisions).toEqual([])
    expect(empty.note).toContain('no record has that id')
  })
})

// ============================================================ 8. through HTTP, where a reader stands

/**
 * THE FOUR ROUTES, DRIVEN AS A CALLER DRIVES THEM.
 *
 * tests/by-id-boundary.test.ts already sends each of these with an id from another project and
 * requires a 404. Its control only asks that the same request from the right project is NOT a 404,
 * which a 500 satisfies — that is the correct control for the question that file asks, and it means
 * NOTHING in the suite would notice one of these routes answering 500 to an ordinary request.
 *
 * The lesson is tests/human-only-http.test.ts's, and it was learnt from a real defect: a guard can be
 * right in lib/ and the answer still wrong at the route. So the refusal below is asked HERE, where a
 * caller stands, and not only of the library.
 */
describe('reading the ledger over HTTP', () => {
  const asHuman = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const asAgent = { 'x-mole-office-actor-type': AGENT.type, 'x-mole-office-actor-id': AGENT.id }

  let app: Awaited<ReturnType<typeof apiApp>>['app']
  beforeAll(async () => {
    app = (await apiApp()).app
  }, 60_000)
  afterAll(async () => {
    await app.close()
  })

  it('lists what a record used to hold, newest first, with a sentence saying what the list is', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'edited once' }, t.api.HUMAN)

    const res = await app.inject({ method: 'GET', url: `/api/records/${m.id}/revisions`, headers: asHuman })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { count: number; truncated: boolean; note: string; revisions: { seq: number }[] }
    expect(body.count).toBe(2)
    expect(body.truncated).toBe(false)
    expect(body.revisions.map((r) => r.seq)).toEqual([2, 1])
    expect(body.note.length, 'a route in this repository answers with a sentence saying what it gave you').toBeGreaterThan(0)
  })

  it('serves one revision whole, and refuses a number that is not one', async () => {
    const m = aModule()
    const ok = await app.inject({ method: 'GET', url: `/api/records/${m.id}/revisions/1`, headers: asHuman })
    expect(ok.statusCode).toBe(200)
    const body = ok.json() as { seq: number; content: { title: string }; contentHash: string }
    expect(body.seq).toBe(1)
    expect(body.content.title).toBe(m.title)

    // Zero is refused as a bad URL rather than answered "this record has no revision 0", because
    // revisions are counted from 1 and 0 is not a number one could ever have.
    const zero = await app.inject({ method: 'GET', url: `/api/records/${m.id}/revisions/0`, headers: asHuman })
    expect(zero.statusCode).toBe(400)
    const missing = await app.inject({ method: 'GET', url: `/api/records/${m.id}/revisions/7`, headers: asHuman })
    expect(missing.statusCode).toBe(404)
  })

  it('says what is different between two revisions, in the order the URL asked', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'the later summary' }, t.api.HUMAN)
    const res = await app.inject({
      method: 'GET',
      url: `/api/records/${m.id}/revisions/1/compare/2`,
      headers: asHuman,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { differences: { path: string; after: string | null }[] }
    expect(body.differences.map((d) => d.path)).toEqual(['summary'])
    expect(one(body.differences, 'difference').after).toBe('the later summary')
  })

  it('puts a revision back and answers with which one it was and what number the new one has', async () => {
    const m = aModule()
    t.api.updateRecord(m.id, { summary: 'a summary somebody regretted' }, t.api.HUMAN)

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${m.id}/revisions/1/restore`,
      headers: asHuman,
      payload: { note: 'the summary was wrong' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { putBack: number; newSeq: number; changed: { path: string }[] }
    expect({ putBack: body.putBack, newSeq: body.newSeq }).toEqual({ putBack: 1, newSeq: 3 })
    expect(body.changed.map((c) => c.path)).toEqual(['summary'])
    expect(t.api.getRecord(m.id)?.summary).toBeNull()
    // The reason the caller gave is on the row, beside the sentence naming the revision put back.
    expect(at(stored(m.id), 2, 'revision').note).toContain('the summary was wrong')
  })

  it('refuses an agent putting back a decision, in the very words a PATCH refuses one in', async () => {
    const d = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'ledger · a decision over HTTP',
      data: { decided_on: '2026-08-14', because: 'it was the cheapest of the three' },
      actor: t.api.HUMAN,
    })
    // THE TITLE FOR THE SAME REASON AS THE IN-PROCESS CASE ABOVE: criterion P76 opened the summary
    // to agents, and this case is about the restore route sharing one line of code with PATCH,
    // which only a write the gate really refuses can show.
    t.api.updateRecord(d.id, { title: 'ledger · the owner changed their mind' }, t.api.HUMAN)
    const before = stored(d.id)

    const patching = await app.inject({
      method: 'PATCH',
      url: `/api/records/${d.id}`,
      headers: asAgent,
      payload: { title: 'ledger · an agent tries' },
    })
    const restoring = await app.inject({
      method: 'POST',
      url: `/api/records/${d.id}/revisions/1/restore`,
      headers: asAgent,
      payload: {},
    })

    expect(patching.statusCode).toBe(403)
    expect(restoring.statusCode, 'an agent was allowed to put back a decision').toBe(403)
    // The same sentence, out of the same line of code. There is no second copy of this rule, and a
    // restore route with a pre-check of its own would be the worst instance of this codebase's
    // recurring defect: a permission rule written down twice.
    const refusal = (patching.json() as { error?: string }).error
    // Asked before the comparison, because two replies with no `error` key at all would compare
    // equal and this test would prove nothing.
    expect(refusal, 'a 403 came back with no sentence in it').toBeTruthy()
    expect(refusal).toContain('decision')
    expect(refusal).toContain(AGENT.id)
    expect((restoring.json() as { error?: string }).error).toBe(refusal)
    expect(stored(d.id), 'the refused restore wrote a revision').toEqual(before)
  })
})

// ============================================================ 9. a write that fails

describe('a write that throws', () => {
  it('leaves no revision, because the revision is written inside the same transaction', () => {
    // ADDING A BLOCK IS TWO WRITES IN ONE TRANSACTION: the block's own record, then the pipeline's
    // order. The second is refused when the order names something that is not a live block, and by
    // then the block's row and its revision are written. That is what makes this the case that
    // proves the rollback rather than a case where nothing was ever attempted.
    //
    // IT USED TO BE A PIPELINE RENAME, refused when one of the block titles it rewrote was taken.
    // That write no longer exists: a block's title is its own name since a
    // decision.
    const pipeline = t.api.createRecord({
      workspaceId: 'default',
      kind: 'pipeline',
      title: 'Pipe A',
      data: { blockIds: [] },
      actor: t.api.HUMAN,
    })
    const block = t.blocks.addBlock(pipeline.id, { name: 'first step', state: 'todo' }, t.api.HUMAN).block
    writeDataBypassingTheGate(t, pipeline.id, { blockIds: [block.id, 'a-block-that-is-not-there'] })

    const before = { pipeline: stored(pipeline.id), block: stored(block.id) }
    const wereRecords = t.client.sqlite.prepare('SELECT count(*) as n FROM records').get() as { n: number }
    expectPanelError(t, () => t.blocks.addBlock(pipeline.id, { name: 'second step', state: 'todo' }, t.api.HUMAN), 400)

    expect(stored(pipeline.id), 'a rolled-back add left a revision behind').toEqual(before.pipeline)
    expect(stored(block.id), 'a rolled-back add left a revision on the block beside it').toEqual(before.block)
    expect(
      (t.client.sqlite.prepare('SELECT count(*) as n FROM records').get() as { n: number }).n,
      'the block record survived a transaction that rolled back',
    ).toBe(wereRecords.n)
  })
})
