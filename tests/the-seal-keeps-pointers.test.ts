// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEAL KEEPS POINTERS AND HASHES, NEVER COPIES — AND THESE CASES MEASURE IT.
 *
 * Criterion C34 of design/rules/ACCEPTANCE.md, a decision on
 * the answer: a hash is the fingerprint of what was submitted and refuses no later change; the
 * seal's waste was copying every revision, change and link into `submission_events` when the
 * database already keeps every revision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED BEFORE, AND WHY THESE CASES COUNT BYTES RATHER THAN ASSERT A SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * Read-only on the live database on 11 September 2026 about 16:45: `submission_events` held 17,432
 * rows and 27,710,429 bytes of payload. 4,829 of those rows were whole revision copies totalling
 * 20,441,040 bytes, and the largest single copy was 1,663,972 bytes. What it cost downstream is
 * problem `JRY5OEjnrAPu`: an inspector's check died on a prompt of 2,964,703 bytes against a
 * 1,000,000-token limit and wrote no verdict.
 *
 * NOTHING IN THIS SUITE HAD EVER ASSERTED A BYTE COUNT before these cases. A structural assertion —
 * "the seal has no `snapshot` key" — would pass on a seal that had grown copies under another name,
 * which is how the first one arrived. So each case below measures, prints what it measured in its
 * failure message, and compares against the number the owner's criterion names.
 *
 * EACH CASE ALSO MEASURES WHAT THE COPIES WOULD HAVE WEIGHED, from the same rows, so the before and
 * the after are in one run rather than in a changelog. That number is the size of the revision rows
 * the seal used to carry, measured now — not a remembered figure from an old version.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - In `revision()` in src/server/lib/sealed-tip.ts, add `snapshot: row` back to the object it
 *     returns. The two byte cases go red and name the size they measured.
 *   - In `captureRecords`, return `before: null` for every record — delete the `beforeOf.get(...)`
 *     lookup — and "the seal names what a record was before the run" goes red.
 *   - In `captureRecords`, return no `links`, and "pins a link by its id and row hash" goes red.
 *   - In `whatTheInspectorReads` in src/server/lib/inspection.ts, drop the hash comparison before
 *     the pinned revision is read, and "a revision that no longer hashes to the seal is refused"
 *     goes red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let lib: typeof import('../src/server/lib/inspection.ts')

const WORKSPACE = 'default'
const actor = { type: 'agent' as const, id: 'pointer-worker' }
const headers = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'pointer-worker',
}

/** A body of the stated size, so a report's weight is a number this file chose. */
const bodyOf = (bytes: number, mark: string): string => `${mark} `.repeat(Math.ceil(bytes / (mark.length + 1)))

/** Thirty kilobytes of report, in blocks of under four thousand characters, which is the cap. */
const thirtyKilobytesOf = (mark: string): { id: string; type: string; text: string }[] =>
  Array.from({ length: 8 }, (_, n) => ({ id: `b-${String(n)}`, type: 'text', text: bodyOf(3_800, `${mark}${String(n)}`) }))

function run(data: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic pointer-seal run',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'pointer-worker', cutFrom: 'main', ...data },
  }).id
}

async function finish(id: string): Promise<void> {
  const reply = await app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { state: 'finished' } } })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The bytes the seal record itself holds. What the owner's criterion is about. */
function sealBytes(runId: string): number {
  const id = seals.readRunSeal(runId)!.id
  return (t.client.sqlite.prepare('SELECT length(data) AS n FROM records WHERE id = ?').get(id) as { n: number }).n
}

/** What the copies would have weighed: the revision rows the old seal carried, measured now. */
function whatTheCopiesWouldWeigh(recordIds: string[]): number {
  let bytes = 0
  for (const id of recordIds) {
    const rows = t.client.sqlite.prepare('SELECT * FROM revisions WHERE record_id = ?').all(id) as Record<string, unknown>[]
    // The old shape carried the whole row for `before` and for `after`, so two of them per record.
    const newest = rows.at(-1)
    const earliest = rows.at(0)
    bytes += JSON.stringify(newest ?? {}).length + JSON.stringify(earliest ?? {}).length
  }
  return bytes
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  lib = await import('../src/server/lib/inspection.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'pointer-starter', name: 'Synthetic starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'pointer-starter' },
    payload: { handle: 'pointer-worker', name: 'Synthetic pointer worker', workArea: [] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a seal is kilobytes, because it names its work instead of copying it', () => {
  it('seals a run that wrote a 30 KB report three times in under 5 KB', async () => {
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Synthetic thirty-kilobyte report',
      workspaceId: WORKSPACE,
      actor,
      origin: 'fixture',
      // EIGHT BLOCKS BECAUSE ONE MAY HOLD 4,000 CHARACTERS. Thirty kilobytes is the size the owner's
      // criterion names and a report holds it the way a report holds anything.
      data: { for: 'nobody', date: '2026-09-11', blocks: thirtyKilobytesOf('first') },
    })
    const id = run({ submission: { kind: 'records', records: [report.id] } })
    // WROTE IT THREE TIMES, which is what the owner's criterion says: three revisions of thirty kilobytes.
    for (const round of ['second', 'third']) {
      t.api.patchRecord(
        report.id,
        { dataPatch: { blocks: thirtyKilobytesOf(round) } },
        { ...actor, sessionId: id },
      )
    }
    const revisions = t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(report.id) as { n: number }
    expect(revisions.n, 'the fixture wrote three revisions of the report').toBe(3)

    await finish(id)

    const measured = sealBytes(id)
    const wouldHave = whatTheCopiesWouldWeigh([report.id])
    expect(
      measured,
      `the seal holds ${String(measured)} bytes; the copies it used to carry would have been ${String(wouldHave)}`,
    ).toBeLessThan(5 * 1024)
    // AND THE BEFORE IS A REAL NUMBER, not a remembered one: a seal that copied these rows could not
    // have been under five kilobytes, and this says by how much.
    expect(wouldHave, 'the copies this seal no longer carries').toBeGreaterThan(60_000)
  })

  it('names the revision each record was at before the run, and the revision it is at now', async () => {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic before and after', workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} })
    const id = run({ submission: { kind: 'records', records: [record.id] } })
    t.api.patchRecord(record.id, { summary: 'What this run wrote' }, { ...actor, sessionId: id })
    await finish(id)

    const held = seals.readRunSeal(id)!.seal.records!
    const one = held.records[0]!
    expect(one.before, 'the revision it was at when the run was filed').not.toBeNull()
    expect(one.before!.seq).toBe(1)
    expect(one.after.seq).toBe(2)
    // POINTERS AND NOTHING ELSE. Four keys, and none of them is a row.
    expect(Object.keys(one.after).sort()).toEqual(['hash', 'id', 'record', 'seq'])
    expect(Object.keys(one.before!).sort()).toEqual(['hash', 'id', 'record', 'seq'])
    // AND THE BASELINE IS A POSITION IN THE REVISIONS LEDGER, which is where `before` was read from.
    expect(typeof held.baseline).toBe('number')
    expect(held.says).toContain('names the revision it was at')
  })

  it('pins a link by its id and row hash, copies no link and no ledger operation, and the seal says what it names', async () => {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic link evidence', workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} })
    const other = t.api.createRecord({ kind: 'note', title: 'Synthetic link evidence, the other end', workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} })
    const id = run({ submission: { kind: 'records', records: [record.id] } })
    const link = t.api.createLink({ fromId: record.id, toId: other.id, type: 'about', actor: { ...actor, sessionId: id } })
    await finish(id)
    const held = seals.readRunSeal(id)!.seal.records!
    expect(Object.keys(held).sort()).toEqual(['baseline', 'dependencies', 'links', 'records', 'says', 'through', 'workspace'])
    // A POINTER AND A HASH, AS A REVISION IS PINNED, and never the row (round BM, item 2aq).
    expect(held.links?.map((one) => one.id)).toEqual([link.id])
    expect(Object.keys(held.links![0]!).sort()).toEqual(['hash', 'id', 'inferred'])
  })
})

describe('the table that held the copies is gone', () => {
  it('has no submission_events table, and a write still leaves a revision behind', () => {
    const table = t.client.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'submission_events'")
      .get()
    expect(table, 'migration 0154 drops the table that held the copies').toBeUndefined()

    // AND THE SIX TRIGGERS THAT FILLED IT ARE GONE WITH IT, while the ones that are not part of the
    // copying design stand. The decision drops the copies, not the immutability of what remains.
    const triggers = new Set(
      (t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as { name: string }[]).map((one) => one.name),
    )
    for (const gone of [
      'submission_revisions_insert',
      'submission_changes_insert',
      'submission_links_insert',
      'submission_links_delete',
      'submission_links_update',
      'submission_links_before_update',
      'submission_events_no_update',
      'submission_events_no_delete',
    ]) {
      expect(triggers.has(gone), `${gone} copies rows and should be gone`).toBe(false)
    }
    for (const stays of [
      'submission_run_baseline',
      'submission_baselines_no_update',
      'submission_baselines_no_delete',
      'legacy_unsealed_runs_no_update',
      'legacy_unsealed_runs_no_delete',
      'sealed_tip_no_update',
      'sealed_tip_no_delete',
    ]) {
      expect(triggers.has(stays), `${stays} is not part of the copying design and should stand`).toBe(true)
    }
  })

  it('writes a baseline as a position in the revisions ledger, and says how that value came to be', () => {
    const before = (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM revisions').get() as { n: number }).n
    const id = run()
    const row = t.client.sqlite.prepare('SELECT watermark, recovered FROM submission_baselines WHERE run_id = ?').get(id) as
      | { watermark: number | null; recovered: string }
      | undefined
    expect(row?.watermark).toBe(before)
    expect(row?.recovered, 'a row this database wrote itself, rather than one converted from the old ledger').toBe('live')
  })
})

describe('an old seal keeps what it proves and loses its copies', () => {
  it('rewrites a seal written in the copying shape, keeps its hash under reduced.was, and still verifies', async () => {
    // A RECORD WITH REAL CONTENT IN IT, because the whole point of the old shape was that it copied
    // the row. A seal of an empty record shrinks by nothing and would prove nothing.
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic old-shape content', workspaceId: WORKSPACE, actor, origin: 'fixture', data: { body: bodyOf(30_000, 'old') } })
    const id = run({ submission: { kind: 'records', records: [record.id] } })
    t.api.patchRecord(record.id, { summary: 'What the old seal copied' }, { ...actor, sessionId: id })
    await finish(id)

    const sealId = seals.readRunSeal(id)!.id
    const after = seals.readRunSeal(id)!.seal.records!.records[0]!.after
    const revision = t.client.sqlite.prepare('SELECT * FROM revisions WHERE id = ?').get(after.id) as Record<string, unknown>

    // THE SEAL IS PUT BACK INTO THE SHAPE IT HAD BEFORE 11 SEPTEMBER 2026: whole rows inside the
    // seal, whole link rows, whole ledger events. This is what the live database holds today and
    // what migration 0154's data half has to be able to read.
    const oldShape = {
      version: 1,
      run: id,
      execution: id,
      attempt: 'synthetic-old-attempt',
      area: [],
      sealedAt: '2026-09-10 12:00:00',
      kind: 'records',
      git: null,
      records: {
        workspace: WORKSPACE,
        baseline: 41,
        through: 99,
        records: [{ id: record.id, before: null, after: { id: after.id, seq: after.seq, hash: after.hash, snapshot: revision } }],
        dependencies: [],
        links: { before: [], after: [{ id: 'synthetic-link', from_id: record.id, to_id: record.id, type: 'about' }] },
        operations: [{ watermark: 98, kind: 'patch', payload: { id: 'synthetic-change' }, hash: 'f'.repeat(64) }],
      },
      hash: 'a'.repeat(64),
    }
    t.client.sqlite.exec('DROP TRIGGER IF EXISTS sealed_tip_no_update')
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ seal: oldShape }), sealId)
    t.client.sqlite.exec(
      "CREATE TRIGGER sealed_tip_no_update BEFORE UPDATE ON records WHEN OLD.kind = 'sealed_tip' " +
        "BEGIN SELECT RAISE(ABORT, 'A sealed tip is immutable'); END",
    )
    const before = (t.client.sqlite.prepare('SELECT length(data) AS n FROM records WHERE id = ?').get(sealId) as { n: number }).n

    const { migrateSealCopiesToPointers } = await import('../src/server/db/seal-copies-to-pointers.ts')
    const report = migrateSealCopiesToPointers(t.client.sqlite)
    expect(report.rewritten, report.says).toBe(1)
    expect(report.unreadable).toEqual([])
    expect(report.bytes.after, `${String(before)} bytes became ${String(report.bytes.after)}`).toBeLessThan(before)

    // WHAT IT KEPT. The pointer, the hash of the revision, and the hash the whole seal had before.
    const now = seals.readRunSeal(id)!.seal
    expect(now.records!.records[0]!.after).toEqual({ record: record.id, id: after.id, seq: after.seq, hash: after.hash })
    expect(now.reduced?.was, 'the hash the seal carried before its copies were dropped').toBe('a'.repeat(64))
    expect(now.reduced?.by).toBe('0154')
    expect(now.reduced?.dropped).toContain('links')
    expect(now.reduced?.dropped).toContain('operations')

    // AND IT STILL VERIFIES AGAINST ITSELF. `readRunSeal` re-hashes the content and refuses a seal
    // that has changed; a rewritten seal that did not hash to its own `hash` would be unreadable
    // from this moment on, which is why the rewrite is TypeScript and not SQL.
    expect(seals.readRunSeal(id)!.seal.hash).not.toBe('a'.repeat(64))

    // AND THE IMMUTABILITY OF A SEAL IS BACK UP. The rewrite drops and re-creates it in one
    // transaction; it never leaves a boot on which a seal can be changed and nothing says so.
    expect(() =>
      t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('Changed after the rewrite', sealId),
    ).toThrow(/A sealed tip is immutable/)

    // RUNNING IT AGAIN DOES NOTHING, because the seal now holds pointers.
    const again = migrateSealCopiesToPointers(t.client.sqlite)
    expect(again.rewritten, again.says).toBe(0)
  })
})

describe("the check's prompt carries pointers and reads a revision when it needs one", () => {
  it('assembles a record-heavy run into a prompt under 300 KB', async () => {
    const ids: string[] = []
    for (let n = 0; n < 40; n += 1) {
      ids.push(
        t.api.createRecord({
          kind: 'note',
          title: `Synthetic heavy record ${String(n)}`,
          workspaceId: WORKSPACE,
          actor,
          origin: 'fixture',
          data: { body: bodyOf(10_000, `heavy${String(n)}`) },
        }).id,
      )
    }
    const id = run({ submission: { kind: 'records', records: ids } })
    for (const one of ids) t.api.patchRecord(one, { title: `Rewritten by the run: ${one}` }, { ...actor, sessionId: id })
    await finish(id)

    const wouldHave = whatTheCopiesWouldWeigh(ids)
    expect(wouldHave, 'the run really is record-heavy: this is what its copies would have weighed').toBeGreaterThan(400_000)

    const reads = lib.whatTheInspectorReads(id, WORKSPACE)
    const prompt = lib.assembleTheInspectorsPrompt({
      reads,
      changes: lib.changesInTheWorkArea([], []),
      workspaceId: WORKSPACE,
    })
    expect(
      prompt.bytes,
      `the prompt is ${String(prompt.bytes)} bytes; the copies it no longer carries would have been ${String(wouldHave)}`,
    ).toBeLessThan(300 * 1024)

    // AND THE CONTENT REALLY IS THERE, read from the revisions table by the seal's own pointers.
    expect(reads.wrote.map((one) => one.id).sort()).toEqual([...ids].sort())
    expect(
      reads.wrote.every((one) => one.title === `Rewritten by the run: ${one.id}`),
      'every pinned record was read back by its pointer, holding the title this run wrote',
    ).toBe(true)
  })

  it('refuses to read a pinned revision whose row no longer hashes to what the seal recorded', async () => {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic tampered revision', workspaceId: WORKSPACE, actor, origin: 'fixture', data: {} })
    const id = run({ submission: { kind: 'records', records: [record.id] } })
    t.api.patchRecord(record.id, { summary: 'What the run submitted' }, { ...actor, sessionId: id })
    await finish(id)

    const pinned = seals.readRunSeal(id)!.seal.records!.records[0]!.after.id
    // THE ROW THE POINTER NAMES IS CHANGED UNDER IT. Nothing in the product does this; the point is
    // that the hash is what notices, and the check refuses rather than handing over work nobody sent.
    t.client.sqlite.prepare('UPDATE revisions SET summary = ? WHERE id = ?').run('Changed after the seal', pinned)
    expect(() => lib.whatTheInspectorReads(id, WORKSPACE)).toThrow(/does not hash to what seal/)
  })
})
