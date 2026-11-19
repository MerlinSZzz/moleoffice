// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE IMPORTER DOES WHEN THE ARCHIVE AND THE DATABASE DISAGREE — every case, with the answer
 * stated and the reason for it.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, AND WHICH CASE GETS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * Every case below is answered by exactly one of: refuse the whole import; apply it and report it;
 * or apply it silently. The third is not used anywhere in this file, because there is nothing here
 * a person should have to discover later.
 *
 * REFUSE THE WHOLE IMPORT. A structural problem — something that would make the database
 * self-contradictory, or the archive is not whole. Refusing everything is the ONLY safe answer
 * available: an importer that half-applies and returns success produces an archive that looks
 * complete and is not, and nobody finds out until the missing half is needed.
 *
 * APPLY AND REPORT. An unrecognised value. Mole Office does not know it, but it is not wrong, and the
 * export already writes such a row out rather than dropping it on the stated ground that a backup
 * that loses what it does not recognise is worse than one that says so. Undoing that at the other
 * end would make the export's kindness a lie.
 *
 * The line between them, in one sentence: AN UNRECOGNISED VALUE IS REPORTED, A SELF-CONTRADICTORY
 * ONE IS REFUSED.
 *
 * ---------------------------------------------------------------------------------------
 * IDENTITY, WHICH IS THE HARD QUESTION
 * ---------------------------------------------------------------------------------------
 *
 * Ids are nanoids and several lookups are by exact title. Both cannot be the identity. FORMAT.md §10
 * answers it and these tests are what make the answer real: THE PRIMARY KEY IS THE IDENTITY.
 * Editing a title renames that record. Editing an id makes a different row.
 *
 * TWO RECORDS MAY HOLD ONE TITLE, SINCE 17 AUGUST 2026. `records_title_idx` was
 * `UNIQUE(workspace_id, title)` until `drizzle/0030_titles_may_repeat` made it plain, because the
 * owner settled that a title is presentation. The importer refused a repeated title for one day
 * after that and was narrowed to blocks on 18 August; the tests that pinned the old rule are still
 * below, rewritten to pin the new one.
 *
 * ONE COLLISION IS STILL REFUSED: two BLOCKS holding one title in one project. A block's title is
 * built by the server and a pipeline is read as an ordered list of those names. The check is on the
 * state the import would FINISH in, so a swap is legal and a collision is not.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { at, freshDb, one, type TestDb } from './helpers.ts'
import { AUTHORED_TABLES } from '../src/server/db/schema.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let lib: ImportLib
let exportLib: ExportLib
let root: string
const made: Record<string, string> = {}

/**
 * A small archive, exported from a small database.
 *
 * Deliberately not the eleven-item fixture of tests/import-roundtrip.test.ts. That file asks
 * whether every value survives; this one asks what happens when a file is wrong, and a wrong file
 * is easier to write and easier to read when there are four records rather than forty.
 */
beforeEach(async () => {
  t = await freshDb()
  exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  lib = (await import('../src/server/lib/import.ts')) as ImportLib
  root = mkdtempSync(join(tmpdir(), 'mole-office-conflict-'))

  const module = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Tray clamp', data: { context: 'the hand' }, actor: HUMAN })
  const problem = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'The pads slip', data: { state: 'open', symptom: 'it drops the cube' }, actor: HUMAN })
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Transplant v2', data: {}, actor: HUMAN })
  const block = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'done' }, HUMAN)
  made['module'] = module.id
  made['problem'] = problem.id
  made['pipeline'] = pipeline.id
  made['block'] = block.block.id
  t.api.createLink({ fromId: problem.id, toId: block.block.id, type: 'blocks', gate: { kind: 'hard' }, actor: HUMAN })

  exportLib.writeExport(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  t.close()
})

// -------------------------------------------------------------------------------- editing files

/** The path of one record's file inside the archive. */
function recordFile(kind: string, id: string): string {
  return join(root, 'records', kind, `${id}.md`)
}

/** Replace a substring in an archive file, refusing if it was not there — a test that edited nothing. */
function edit(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(from)) throw new Error(`this test meant to change ${JSON.stringify(from)} in ${file} and it is not there`)
  writeFileSync(file, text.replace(from, to), 'utf8')
}

/**
 * Replace a whole field line, so a test about a WRONG VALUE does not accidentally test broken JSON.
 *
 * `key` must appear on exactly one line of the file, which is checked: a helper that silently
 * edited the first of two would make a test pass for a reason nobody chose.
 */
function editLine(file: string, key: string, value: string): void {
  const lines = readFileSync(file, 'utf8').split('\n')
  const at = lines.map((line, i) => (line.startsWith(`${key}: `) ? i : -1)).filter((i) => i !== -1)
  if (at.length !== 1) throw new Error(`this test wanted one \`${key}:\` line in ${file} and there are ${at.length}`)
  lines[at[0] ?? 0] = `${key}: ${value}`
  writeFileSync(file, lines.join('\n'), 'utf8')
}

/** Change a count in MANIFEST.md, so a test about something else is not answered by the fence. */
function manifestCount(region: string, delta: number): void {
  const file = join(root, 'MANIFEST.md')
  const text = readFileSync(file, 'utf8')
  const match = new RegExp(`^${region}: (\\d+)$`, 'm').exec(text)
  if (match === null) throw new Error(`MANIFEST.md does not count ${region}`)
  writeFileSync(file, text.replace(match[0], `${region}: ${Number(match[1]) + delta}`), 'utf8')
}

/** Every refusal, as one string, so a test can say what it expects to read in it. */
function why(plan: { refusals: { path: string; line: number; problem: string }[] }): string {
  return plan.refusals.map((r) => `${r.path}:${r.line} ${r.problem}`).join('\n')
}

/** Apply, and hand back the refusal rather than the report. Fails the test if it was accepted. */
function refusal(): InstanceType<ImportLib['ImportRefused']> {
  try {
    lib.applyImport(root)
  } catch (err) {
    if (err instanceof lib.ImportRefused) return err
    throw err
  }
  throw new Error('the import was accepted, and this test exists because it must not be')
}

/**
 * What the database holds right now, so a test can prove a refusal wrote nothing.
 *
 * EVERY AUTHORED TABLE, FROM db/schema.ts. It was seven of them written out here, which was the
 * whole set on the day this was written and stopped being it when the planning layer arrived — so a
 * refusal that had written an allocation, a capacity row, a draft or a recurrence would have come
 * out of this function looking identical.
 */
function snapshot(): string {
  return JSON.stringify(AUTHORED_TABLES.map((table) => t.client.sqlite.prepare(`SELECT * FROM ${table}`).all()))
}

/**
 * Write one agent row directly, for the cases that need a state the front door cannot make yet.
 *
 * The two-live-agents case needs two live rows sharing a handle, which `agents_live_handle_idx`
 * refuses (migration 0174, criterion I3), so those cases drop that index first. The retired-plus-live
 * case is legal under the real index and drops nothing. Both are database setup, not behaviour under
 * test.
 */
function insertAgent(who: { id: string; handle: string; name: string; retired?: boolean; retiredAt?: string | null }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, who.retired ? 1 : 0, who.retiredAt ?? null, '2026-09-16 10:00:00')
}

// ================================================================================ 1 · already there

describe('the file names a record that already exists, with different content', () => {
  it('APPLIES it: a hand edit is what the archive is for, and the plan says which columns move', () => {
    // FORMAT.md §10 — "A person may edit an export while Mole Office is down, and G3 brings the edits
    // back." An import that refused an edited record would make the whole of §10 unreachable.
    edit(recordFile('module', made['module'] ?? ''), '"context": "the hand"', '"context": "the hand, recalibrated"')
    const plan = lib.planImport(root)
    expect(plan.ok).toBe(true)
    const change = at(plan.rows, 0, 'changed row')
    expect(change).toMatchObject({ region: 'records', key: made['module'], action: 'update', columns: ['data'] })
    // AND ONE ROW NOBODY WROTE INTO A FILE. The hand edit changes what the record holds, so the
    // record's newest revision stops describing it and the import writes a revision that does. See
    // `keepTheLedgerTrue` in lib/import.ts for why that is the rule and why it is attributed to
    // system:import rather than to whoever ran the restore.
    expect(at(plan.rows, 1, 'ledger row')).toMatchObject({ region: 'revisions', action: 'insert' })
    expect(plan.rows).toHaveLength(2)

    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const stored = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(made['module']) as { data: string }
    expect((JSON.parse(stored.data) as { context: string }).context).toBe('the hand, recalibrated')
  })

  it('writes NO change row of its own, which is what makes a second import a no-op', () => {
    // The change log is data the archive carries, not a log this operation appends to. A row saying
    // "the importer changed this" would make importing the same text twice produce two different
    // databases, and would attribute a hand edit to an actor nobody chose.
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    edit(recordFile('module', made['module'] ?? ''), '"context": "the hand"', '"context": "the hand, recalibrated"')
    lib.applyImport(root)
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  it('leaves a row the archive does not mention exactly where it is, and counts it', () => {
    // Absence from an archive means "this archive does not mention it", never "delete it".
    // Otherwise importing a week-old backup would destroy a week of work.
    const extra = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'written after the export', data: {}, actor: HUMAN })
    const report = lib.applyImport(root)
    expect(t.api.getRecord(extra.id)).not.toBeNull()
    expect(report.notInArchive['records']).toBe(1)
    expect(one(report.notes.filter((n) => n.includes('NO ROW WAS DELETED')), 'note about rows the archive does not mention')).toContain('1 records')
  })
})

// ================================================================================ 2 · a dangling link

describe('a link names a record that is not in the import and not in the database', () => {
  it('REFUSES the whole import, and names the link, the file, the line and the missing id', () => {
    // Refusing the whole import rather than that one link: a dangling end is evidence the archive
    // is incomplete or was edited inconsistently — the usual cause is a record file somebody
    // deleted — and the things pointing at a deleted record are rarely just one. Dropping the link
    // instead would be silent data loss in the file whose whole job is to prevent it.
    edit(recordFile('problem', made['problem'] ?? ''), `toId: "${made['block'] ?? ''}"`, 'toId: "there-is-no-such-record"')
    const before = snapshot()
    const err = refusal()
    expect(err.message).toContain('there-is-no-such-record')
    expect(why(err.plan)).toContain('Both ends of a link must exist')
    expect(why(err.plan)).toMatch(/records\/problem\/\S+\.md:\d+/)
    expect(snapshot(), 'a refusal must write nothing at all').toBe(before)
  })

  it('accepts a link into a SOFT-DELETED record, because a soft-deleted record still has a row', () => {
    // A soft-deleted record is not an absence in Mole Office — a link into it is shown as broken rather
    // than vanishing — so its row is there and the reference resolves.
    const gone = t.api.createRecord({ workspaceId: 'default', kind: 'idea', title: 'An idea that was withdrawn', data: {}, actor: HUMAN })
    t.api.createLink({ fromId: made['problem'] ?? '', toId: gone.id, type: 'relates_to', actor: HUMAN })
    t.api.deleteRecord(gone.id, HUMAN)
    exportLib.writeExport(root)
    expect(lib.planImport(root).ok).toBe(true)
  })

  it('reports, and does not refuse, a change row naming a record that is nowhere', () => {
    // `changes.record_id` is deliberately NOT a foreign key, so the history of a record outlives
    // it. Refusing here would be the importer inventing a constraint the schema declined to have.
    const day = (t.client.sqlite.prepare('SELECT at FROM changes LIMIT 1').get() as { at: string }).at.slice(0, 10)
    const file = join(root, 'changes', `${day}.md`)
    writeFileSync(
      file,
      // EVERY COLUMN IS WRITTEN ON EVERY ROW, and the importer refuses a row that leaves one out
      // rather than guessing what absent means. `elevation` joined `warrant` in migration 0139, so
      // it is written here as null — nobody was acting for the person on this change. `provedHolder`
      // joined the two in migration 0168 and is null for the same kind of reason: no key proved a
      // holder different from the name on this row. `provedBy` joined them in migration 0178 and is
      // null because no key proved the request behind this row. Migration 0276 adds `signed_item`
      // on both ledgers. This ordinary row used no signed package item, so that field is null.
      `${readFileSync(file, 'utf8')}\n\`\`\`mole-office changes\nid: "a-change-with-no-record"\nworkspaceId: "default"\nrecordId: "a-record-that-is-gone"\nop: "update"\nactorType: "human"\nactorId: "${THE_TEST_OFFICES_OWNER.id}"\nsessionId: null\nfield: "title"\noldValue: "before"\nnewValue: "after"\nwarrant: null\nelevation: null\nsigned_item: null\nprovedHolder: null\nprovedBy: null\nat: "${day} 09:00:00"\n\`\`\`\n`,
      'utf8',
    )
    manifestCount('changes', 1)
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(one(report.notes.filter((n) => n.includes('deliberately not a foreign key')), 'note about orphan change rows')).toContain('1 change row')
  })
})

// ================================================================================ 3 · two claims

describe('two files claim the same id, or two blocks claim the same title', () => {
  it('REFUSES when two files claim one id, naming both files', () => {
    // Two files describing one row is two answers, and there is no rule for picking one. Not even
    // when they are identical: a duplicate is a copied file, and guessing that a copy is harmless
    // is exactly the guess this importer does not make.
    const file = recordFile('module', made['module'] ?? '')
    writeFileSync(join(root, 'records', 'module', 'a-copy-of-the-module.md'), readFileSync(file, 'utf8'), 'utf8')
    manifestCount('records', 1)
    manifestCount('recordFiles', 1)
    const err = refusal()
    expect(why(err.plan)).toContain('Two files describing one row is two answers')
    expect(why(err.plan)).toContain(made['module'] ?? '')
  })

  // ---------------------------------------------------------------------------------------
  // THE RULE THESE FOUR PIN CHANGED, AND THE OWNER CHANGED IT
  // ---------------------------------------------------------------------------------------
  //
  // The first two of these used to assert the opposite: that the import REFUSED any two records
  // that would end up holding one title. That was right while `records_title_idx` was
  // UNIQUE(workspace_id, title).
  //
  // It is settled: **ID is identity. Title is
  // presentation. Titles may repeat.** The owner met the old rule by deleting a Plan line and recreating
  // it, and being refused because work with that title already existed.
  // `drizzle/0030_titles_may_repeat` made the index plain the same day.
  //
  // The importer kept refusing for one more day, and the cost was measured: Mole Office could not import
  // a backup of its own database once two records shared a title. It was narrowed to blocks on
  // 18 August 2026 and these tests were rewritten to pin the rule that now holds, rather than
  // deleted — a test that changes its mind is worth more than one that disappears.
  //
  // THE BLOCK CASE SURVIVES AND IS NOT A LEFTOVER. A block's title is built by the server as
  // `<pipeline> › <name>` and a pipeline is read as an ordered list of those names, so two blocks
  // of one name read as the same step written twice. `refuseTakenTitle` in server/lib/blocks.ts
  // refuses it on the live path; the importer is a write path, so it refuses it too.
  it('ACCEPTS two records that would end up with one title, because a title is not an identity', () => {
    edit(recordFile('problem', made['problem'] ?? ''), 'title: "The pads slip"', 'title: "Tray clamp"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const byId = new Map(
      (t.client.sqlite.prepare('SELECT id, title FROM records').all() as { id: string; title: string }[]).map((r) => [r.id, r.title]),
    )
    // BOTH ROWS ARE THERE AND BOTH HOLD THE NAME. Counted, rather than inferred from the import
    // saying it worked: the failure this replaces would have been one row silently overwriting the
    // other, and `applied: true` says nothing about that.
    expect(byId.get(made['module'] ?? '')).toBe('Tray clamp')
    expect(byId.get(made['problem'] ?? '')).toBe('Tray clamp')
  })

  it('ACCEPTS an archived title that collides with a record already in the database', () => {
    t.api.createRecord({ workspaceId: 'default', kind: 'idea', title: 'A title nobody exported', data: {}, actor: HUMAN })
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: "A title nobody exported"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const holding = (
      t.client.sqlite.prepare('SELECT id FROM records WHERE title = ?').all('A title nobody exported') as { id: string }[]
    ).map((r) => r.id)
    expect(holding.length, 'the record already there and the imported one both hold the name').toBe(2)
    expect(holding).toContain(made['module'] ?? '')
  })

  it('REFUSES two BLOCKS that would end up with one title, naming both ids', () => {
    const second = t.blocks.addBlock(made['pipeline'] ?? '', { name: 'Close and hold', state: 'todo' }, HUMAN)
    exportLib.writeExport(root)
    edit(recordFile('block', second.block.id), 'title: "Close and hold"', 'title: "Sense the pot"')
    const err = refusal()
    expect(why(err.plan)).toContain('would end up with the title "Sense the pot"')
    expect(why(err.plan)).toContain(second.block.id)
    expect(why(err.plan)).toContain(made['block'] ?? '')
    expect(why(err.plan), 'the refusal has to say why a block is different').toContain('ordered list')
  })

  it('REFUSES a block title in the archive that collides with a block already in the database', () => {
    const second = t.blocks.addBlock(made['pipeline'] ?? '', { name: 'Close and hold', state: 'todo' }, HUMAN)
    // Exported BEFORE the second block existed, so the archive does not mention it: this is the
    // stored-side half of the check, which the archive-only case above cannot reach.
    edit(recordFile('block', made['block'] ?? ''), 'title: "Sense the pot"', 'title: "Close and hold"')
    const err = refusal()
    expect(why(err.plan)).toContain('already in the database')
    expect(why(err.plan)).toContain(second.block.id)
  })

  it('REFUSES when two links would say the same thing, which is what links_pair_idx means', () => {
    const file = recordFile('problem', made['problem'] ?? '')
    const text = readFileSync(file, 'utf8')
    const block = /```mole-office links\n[\s\S]*?\n```/.exec(text)
    if (block === null) throw new Error('the problem record has no link block to duplicate')
    writeFileSync(file, `${text}\n\n${block[0].replace(/id: "[^"]+"/, 'id: "a-second-link-id"')}\n`, 'utf8')
    manifestCount('links', 1)
    const err = refusal()
    expect(why(err.plan)).toContain('would say the same thing')
  })
})

// ================================================================================ 3b · two live agents, one handle

describe('two live agents claim one handle', () => {
  it('REFUSES the whole import, naming the handle and both agents', () => {
    // Two live agents cannot share a handle through the front door, but this is the state an archive
    // edited by hand could describe, and the importer is a write path. The index is dropped only so
    // the setup can make the rows; the refusal happens before any write.
    t.client.sqlite.prepare('DROP INDEX IF EXISTS agents_live_handle_idx').run()
    insertAgent({ id: 'Aa1Bb2Cc3Dd4', handle: 'shared-handle', name: 'First Claimant' })
    insertAgent({ id: 'Ee5Ff6Gg7Hh8', handle: 'shared-handle', name: 'Second Claimant' })
    exportLib.writeExport(root)
    const before = snapshot()
    const err = refusal()
    expect(why(err.plan)).toContain('live agents would end up with the handle "shared-handle"')
    expect(why(err.plan)).toContain('Aa1Bb2Cc3Dd4')
    expect(why(err.plan)).toContain('Ee5Ff6Gg7Hh8')
    expect(why(err.plan), 'the refusal says what a handle is for').toContain('how a message names an agent')
    expect(snapshot(), 'a refusal must write nothing at all').toBe(before)
  })

  it('REFUSES an archived live agent colliding with a live agent already stored', () => {
    // The stored-side half of the check. The archive was taken before the second agent existed, so
    // the claim it does not mention comes from the database and not from the files.
    insertAgent({ id: 'Ii9Jj0Kk1Ll2', handle: 'stored-collision', name: 'Already Stored' })
    exportLib.writeExport(root)
    t.client.sqlite.prepare('DROP INDEX IF EXISTS agents_live_handle_idx').run()
    insertAgent({ id: 'Mm3Nn4Oo5Pp6', handle: 'stored-collision', name: 'Added After The Archive' })
    const err = refusal()
    expect(why(err.plan)).toContain('live agents would end up with the handle "stored-collision"')
    expect(why(err.plan)).toContain('Mm3Nn4Oo5Pp6')
    expect(why(err.plan)).toContain('already in the database')
  })

  it('IMPORTS a retired agent and a live agent that share one handle', () => {
    // A retired agent releases its handle, so a retired-plus-live pair is legal, and the real index
    // (live rows only since migration 0174) accepts it with nothing dropped.
    insertAgent({ id: 'Qq7Rr8Ss9Tt0', handle: 'freed-handle', name: 'The Retired One', retired: true, retiredAt: '2026-09-01 08:30:00' })
    insertAgent({ id: 'Uu1Vv2Ww3Xx4', handle: 'freed-handle', name: 'The Live One' })
    exportLib.writeExport(root)
    // Take the two rows back out, so the import really writes them rather than finding them already
    // there. The archive keeps them.
    t.client.sqlite.prepare('DELETE FROM agents WHERE id IN (?, ?)').run('Qq7Rr8Ss9Tt0', 'Uu1Vv2Ww3Xx4')
    t.client.sqlite.prepare('DELETE FROM assets WHERE id IN (?, ?)').run('avatar-default-agent-Qq7Rr8Ss9Tt0', 'avatar-default-agent-Uu1Vv2Ww3Xx4')

    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const rows = t.client.sqlite.prepare('SELECT id, retired FROM agents WHERE handle = ? ORDER BY id').all('freed-handle') as { id: string; retired: number }[]
    expect(rows.map((r) => r.id)).toEqual(['Qq7Rr8Ss9Tt0', 'Uu1Vv2Ww3Xx4'])
    expect(rows.map((r) => r.retired)).toEqual([1, 0])
  })
})

// ================================================================================ 4 · malformed

describe('a file is malformed, or a field has the wrong type', () => {
  it('REFUSES the whole import on a field line that is not JSON, naming the file and the line', () => {
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: Tray clamp')
    const err = refusal()
    expect(why(err.plan)).toContain('is not JSON')
  })

  it('REFUSES a value of the wrong type for its column, which SQLite would have stored happily', () => {
    // SQLite puts a number in a TEXT column without complaint, so nothing here can be left to the
    // database to catch. A stamp stored as 5 is a stamp nothing can read.
    editLine(recordFile('module', made['module'] ?? ''), 'createdAt', '5')
    const err = refusal()
    expect(why(err.plan)).toContain('it has to be text')
  })

  it('REFUSES null in a column that may not be null', () => {
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: null')
    const err = refusal()
    expect(why(err.plan)).toContain('A row with a hole in it is not a row')
  })

  it('REFUSES a key that is not a column of its table', () => {
    edit(recordFile('module', made['module'] ?? ''), 'kind: "module"', 'kind: "module"\nauthor: "somebody"')
    const err = refusal()
    expect(why(err.plan)).toContain('`author` is not a column of records')
  })

  it('REFUSES a region name it does not know', () => {
    writeFileSync(join(root, 'records', 'module', 'invented.md'), '```mole-office inventions\nid: "x"\n```\n', 'utf8')
    const err = refusal()
    expect(why(err.plan)).toContain('is not a region this format knows')
  })

  it('REFUSES a record file with no data block, because absent and empty are different facts', () => {
    const file = recordFile('module', made['module'] ?? '')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/```json mole-office records\.data\n[\s\S]*?\n```/, ''), 'utf8')
    const err = refusal()
    expect(why(err.plan)).toContain('json mole-office records.data')
  })

  it('REFUSES a machine column that somebody typed back in', () => {
    // `pgid` and `osStartedAt` are absent by decision, not by accident. Finding one in a file means
    // somebody has restored machine state by hand, which is the stale reading this split prevents.
    const file = join(root, 'resources.md')
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n\`\`\`mole-office session_resources\nid: "r1"\nworkspaceId: "default"\nsessionRecordId: "${made['pipeline'] ?? ''}"\ntype: "process"\nkey: "4242"\npgid: 4240\ndetail: "a server"\nregisteredAt: "2026-08-10 10:00:00"\nregisteredBy: "human:${THE_TEST_OFFICES_OWNER.id}"\nreleasedAt: null\nreleasedBy: null\nreleaseNote: null\n\`\`\`\n`, 'utf8')
    manifestCount('session_resources', 1)
    const err = refusal()
    expect(why(err.plan)).toContain('a column this format deliberately does not carry')
  })

  it('REFUSES when the manifest and the files disagree, and says both numbers', () => {
    manifestCount('records', 1)
    const err = refusal()
    expect(why(err.plan)).toContain('the manifest says records:')
    expect(why(err.plan)).toContain('were read out of the files')
  })

  it('REFUSES a format version it does not know', () => {
    edit(join(root, 'MANIFEST.md'), 'format: "mole-office-export/2"', 'format: "mole-office-export/9"')
    const err = refusal()
    expect(why(err.plan)).toContain('this importer reads "mole-office-export/2" and "panelx-export/1"')
  })

  it('REFUSES an archive taken from a schema this database has not caught up with', () => {
    // BREAKS `when`, NOT `hash`, AND THAT IS THE POINT. A migration is identified by the timestamp
    // out of the drizzle journal, which drizzle stores and which is the same on every machine.
    // This test used to break the hash, which made it pass for the wrong reason and hid a defect
    // that closed the disaster path on the real corpus: `0007_planning.sql` was edited after it
    // had been applied, so the live database's archive was refused by every freshly migrated
    // database with "run the migrations first" — already done, and no help. A hash that differs
    // under a `when` that is applied is now a loud note, asserted in tests/import-governance.test.ts.
    // BOTH identifiers, because either one alone satisfies the fence: an archive whose migration
    // this database applied under the same bytes is applied, whatever its `when` says.
    edit(join(root, 'MANIFEST.md'), 'when: ', 'when: 99')
    edit(join(root, 'MANIFEST.md'), 'hash: "', 'hash: "not-applied-here-')
    const err = refusal()
    expect(why(err.plan)).toContain('Run the migrations first')
  })

  it('REFUSES when there is no archive at the path at all, rather than importing nothing quietly', () => {
    const plan = lib.planImport(join(root, 'a-directory-that-is-not-there'))
    expect(plan.ok).toBe(false)
    expect(why(plan)).toContain('there is no directory at')
  })
})

// ================================================================================ 5 · a broken gate

describe('a gate is partial and does not say how far', () => {
  it('REFUSES the whole import, in the words the product publishes', () => {
    // An importer is a write path, and `POST /api/links` refuses exactly this. A rule enforced
    // there and not here would be a back door into the one column the audit found nothing had ever
    // checked. `gateFault` in shared/work.ts is the one declaration, and both callers use it.
    edit(recordFile('problem', made['problem'] ?? ''), 'gate: "hard"', 'gate: "partial"')
    const err = refusal()
    expect(why(err.plan)).toContain('a partial gate that does not say how far is a hard gate that is lying')
  })

  it('REFUSES a hard gate that names a stage, which is the other half of the same rule', () => {
    edit(recordFile('problem', made['problem'] ?? ''), 'gateUpTo: null', 'gateUpTo: "halfway"')
    const err = refusal()
    expect(why(err.plan)).toContain('a `hard` gate must NOT carry `upTo`')
  })

  it('accepts a gate of NULL, which is a real answer and is not "hard"', () => {
    edit(recordFile('problem', made['problem'] ?? ''), 'gate: "hard"', 'gate: null')
    expect(lib.planImport(root).ok).toBe(true)
  })

  it('ACCEPTS a place on a node, because a node may say where somebody put it', () => {
    // CRITERION D19: the earlier rule that a block's position is never stored and is drawn afresh
    // each time is void. `x` and `y` on a NODE are intent now, so an import carrying
    // them is a legitimate import rather than a refusal. Every other geometry spelling is still
    // refused by name, which is the case below.
    const presentation = join(root, 'presentation.md')
    writeFileSync(
      presentation,
      `${readFileSync(presentation, 'utf8')}\n\`\`\`mole-office presentation_intent\nworkspaceId: "default"\nscope: "pipeline:${made['pipeline'] ?? ''}"\ntarget: "${made['block'] ?? ''}"\nintent: {"x":420,"y":180}\nupdatedAt: "2026-08-10 18:40:02"\nupdatedBy: "human:${THE_TEST_OFFICES_OWNER.id}"\n\`\`\`\n`,
      'utf8',
    )
    manifestCount('presentation_intent', 1)
    expect(lib.planImport(root).ok, 'a place somebody put a node at was refused').toBe(true)
  })

  it('REFUSES a geometry key in presentation intent, by name, with the reason', () => {
    const presentation = join(root, 'presentation.md')
    writeFileSync(
      presentation,
      `${readFileSync(presentation, 'utf8')}\n\`\`\`mole-office presentation_intent\nworkspaceId: "default"\nscope: "pipeline:${made['pipeline'] ?? ''}"\ntarget: "${made['block'] ?? ''}"\nintent: {"width":420,"zIndex":180}\nupdatedAt: "2026-08-10 18:40:02"\nupdatedBy: "human:${THE_TEST_OFFICES_OWNER.id}"\n\`\`\`\n`,
      'utf8',
    )
    manifestCount('presentation_intent', 1)
    const err = refusal()
    expect(why(err.plan)).toContain('is drawing geometry and is never stored')
  })
})

// ================================================================================ 6 · interrupted

describe('the import is interrupted halfway', () => {
  it('leaves the database exactly as it was, because there is no halfway', () => {
    // Everything is one SQLite transaction and the plan is built inside it, so a refusal, a crash
    // or a SIGKILL rolls back — the last of those on the next open, which is what the journal is
    // for. This drives it with a refusal placed AFTER rows that would otherwise have been written.
    const before = snapshot()
    edit(recordFile('module', made['module'] ?? ''), '"context": "the hand"', '"context": "edited, and this edit must not survive"')
    edit(recordFile('problem', made['problem'] ?? ''), `toId: "${made['block'] ?? ''}"`, 'toId: "there-is-no-such-record"')
    refusal()
    expect(snapshot(), 'a refusal after a would-be write must leave nothing behind').toBe(before)
  })

  it('rolls back everything when a write fails partway through', () => {
    // A failure nobody predicted, rather than one the checks caught: the table is dropped out from
    // under the transaction so the last statement throws. What must survive is the earlier rows
    // NOT being there.
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
    const fresh = mkdtempSync(join(tmpdir(), 'mole-office-halfway-'))
    exportLib.writeExport(fresh)
    t.client.sqlite.exec('DELETE FROM links; DELETE FROM changes; DELETE FROM reader_anchors; DELETE FROM records')
    t.client.sqlite.exec('DROP TABLE session_resources')
    expect(() => lib.applyImport(fresh)).toThrow()
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }
    expect(after.n, 'the records were written and then not rolled back').toBe(0)
    expect(before.n).toBeGreaterThan(0)
    rmSync(fresh, { recursive: true, force: true })
  })
})

// ================================================================================ 7 · unclassified

describe('a stored state word the product does not classify', () => {
  it('APPLIES it and names the word, because an unclassified word is a question and not a fault', () => {
    // `progressOf` answers `unclassified` and `STATE_MEANING` says so in its own header: a kind
    // whose words are not classified reports it loudly on every record until somebody says what
    // they mean. Refusing would make a normal database unrestorable.
    edit(recordFile('problem', made['problem'] ?? ''), '"state": "open"', '"state": "gnawing"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(one(report.notes.filter((n) => n.includes('nobody has classified')), 'note about unclassified state')).toContain('gnawing')
  })

  it('APPLIES a record of a kind Mole Office does not know, and names the kind', () => {
    edit(recordFile('module', made['module'] ?? ''), 'kind: "module"', 'kind: "widget"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(one(report.notes.filter((n) => n.includes('Mole Office does not know')), 'note about unknown kinds')).toContain('widget')
  })

  it('APPLIES a link of a type Mole Office does not know, and names the type', () => {
    edit(recordFile('problem', made['problem'] ?? ''), 'type: "blocks"', 'type: "annoys"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    expect(one(report.notes.filter((n) => n.includes('link(s) of')), 'note about unknown link types')).toContain('annoys')
  })
})

// ================================================================================ the change log

describe('the change log is append-only, and an edited one is a rewritten past', () => {
  it('REFUSES a change row that is already stored with different content', () => {
    const row = t.client.sqlite.prepare('SELECT id, at, field FROM changes WHERE field IS NOT NULL LIMIT 1').get() as
      | { id: string; at: string; field: string }
      | undefined
    expect(row, 'the fixture wrote no change row with a field, so this test would prove nothing').toBeDefined()
    if (row === undefined) return
    edit(join(root, 'changes', `${row.at.slice(0, 10)}.md`), `actorId: "${THE_TEST_OFFICES_OWNER.id}"`, 'actorId: "somebody-else"')
    const err = refusal()
    expect(why(err.plan)).toContain('The change log is append-only history')
  })

  it('accepts a change row that is already stored and identical, which is every re-import', () => {
    expect(lib.planImport(root).ok).toBe(true)
    expect(lib.planImport(root).unchanged['changes']).toBeGreaterThan(0)
  })
})

// ================================================================================ identity

describe('the id is the identity and the title is the name', () => {
  it('a changed title RENAMES that record; it does not make a second one', () => {
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: "Tray clamp v3 shell"')
    lib.applyImport(root)
    const rows = t.client.sqlite.prepare('SELECT id, title FROM records WHERE kind = ?').all('module') as { id: string; title: string }[]
    expect(rows).toEqual([{ id: made['module'], title: 'Tray clamp v3 shell' }])
  })

  it('a changed id makes a DIFFERENT row, and the old one stays where it was', () => {
    // This is the cost of the answer, and it is stated rather than hidden: an id is what four other
    // tables point at, so a renumbered id is a new row by definition. The export's own README says
    // "do not renumber ids" for exactly this reason.
    const file = recordFile('module', made['module'] ?? '')
    edit(file, `id: "${made['module'] ?? ''}"`, 'id: "a-hand-typed-id"')
    edit(file, 'title: "Tray clamp"', 'title: "Tray clamp, retyped"')
    // No manifest change: the archive still describes four records, and one of them now names a
    // row that is not there. That is the whole point — a retyped id is a new row.
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const ids = (t.client.sqlite.prepare('SELECT id FROM records WHERE kind = ? ORDER BY id').all('module') as { id: string }[]).map((r) => r.id)
    expect(ids.sort()).toEqual([made['module'], 'a-hand-typed-id'].sort())
  })

  it('lets two records SWAP titles in one edit, which a row-by-row import once could not', () => {
    // WHY THE IMPORT DOES THIS IN TWO PASSES. `records_title_idx` was UNIQUE until
    // `0030_titles_may_repeat`, and a unique index is checked per statement, so a swap applied one
    // row at a time failed halfway through. Every existing record whose title changes is still
    // parked on a staging title first, inside the same transaction.
    //
    // THE INDEX IS PLAIN NOW, SO THE PARKING PREVENTS NOTHING and this test would pass without it.
    // What it still proves is that a swap imports and that both rows end up on the right names,
    // which is the behaviour somebody depends on. `stagingTitle` in lib/import.ts says what taking
    // the parking out would take.
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: "The pads slip"')
    edit(recordFile('problem', made['problem'] ?? ''), 'title: "The pads slip"', 'title: "Tray clamp"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const byId = new Map(
      (t.client.sqlite.prepare('SELECT id, title FROM records').all() as { id: string; title: string }[]).map((r) => [r.id, r.title]),
    )
    expect(byId.get(made['module'] ?? '')).toBe('The pads slip')
    expect(byId.get(made['problem'] ?? '')).toBe('Tray clamp')
  })

  it('REFUSES rather than parking a rename on a title somebody already holds', () => {
    // Pure defence, and it is tested so that it is not dead code: the staging title is argued to be
    // untypeable, and the argument is checked instead of trusted. Before
    // `0030_titles_may_repeat` the failure without this branch would have been a UNIQUE constraint
    // naming a title that looks nothing like the one being written. THE INDEX IS PLAIN NOW, so
    // there is no failure left to prevent — this refusal is kept only while the parking it guards
    // is kept, and lib/import.ts says so beside both.
    t.api.createRecord({ workspaceId: 'default', kind: 'note', title: lib.stagingTitle(made['module'] ?? ''), data: {}, actor: HUMAN })
    edit(recordFile('module', made['module'] ?? ''), 'title: "Tray clamp"', 'title: "Tray clamp v3 shell"')
    const err = refusal()
    expect(why(err.plan)).toContain('which this import needs to park the renamed record')
  })

  it('renames a pipeline and one of its blocks in one import, without tripping the unique index', () => {
    // THIS USED TO BE ONE RENAME DRAGGING EVERY BLOCK WITH IT. A block's title carried its
    // pipeline's, so a renamed pipeline arrived in the archive with every block row rewritten too.
    // That was ended. Two independent renames in one archive is still the
    // case worth proving, because the unique index sees them together either way.
    edit(recordFile('pipeline', made['pipeline'] ?? ''), 'title: "Transplant v2"', 'title: "Handover v3"')
    edit(recordFile('block', made['block'] ?? ''), 'title: "Sense the pot"', 'title: "Sense the pot again"')
    const report = lib.applyImport(root)
    expect(report.applied).toBe(true)
    const titles = (t.client.sqlite.prepare('SELECT title FROM records WHERE kind IN (?,?) ORDER BY kind').all('block', 'pipeline') as { title: string }[]).map((r) => r.title)
    expect(titles).toEqual(['Sense the pot again', 'Handover v3'])
  })
})
