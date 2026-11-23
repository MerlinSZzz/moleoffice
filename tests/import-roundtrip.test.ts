// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The every-authored-table fixture now includes an explicitly inventoried legacy run.
 * The existing nonempty-table and byte-for-byte roundtrip assertions are unchanged. */
/**
 * THE ROUND TRIP — export a database, import it into an empty one, and prove the two are the same
 * database; then prove that doing it again changes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `./data/panelx.db` is one gitignored SQLite file and it is the only copy of everything Mole Office
 * knows. The export is the second copy and the import is what makes the second copy worth having.
 * So the questions here are the ones a restore is judged by, and none of them is "does it run":
 *
 *   Does every authored table come back, including the four that are empty in the seeded corpus?
 *   Does every value come back EXACTLY — Chinese titles, a `›` in a block title, a soft-deleted
 *     record, an inferred link, a three-state gate, a `data` blob eight levels deep, a newline
 *     inside a stored string?
 *   Does a drawn face the re-mint renamed keep the digest it is drawn from, so it sends the same
 *     bytes after the restore as before the export?
 *   Are the two machine columns of the resource ledger NULL on the restored side — ASSERTED,
 *     never skipped, because a restore test that quietly ignores a column is how a column stops
 *     round-tripping without anybody noticing?
 *   Does importing the same text twice leave the same database?
 *   Do the two files the format calls reading aids really carry nothing? Deleting them before an
 *     import must produce exactly the same database.
 *
 * ---------------------------------------------------------------------------------------
 * THREE DATABASES, AND WHY THE IMPORTS ARE DYNAMIC
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` opens MOLE_OFFICE_DB once, when it is first imported, so a file that wants
 * two databases has to reset the module registry between them — which `freshDb()` does. The handles
 * captured before each reset stay open and usable, which is what lets the source database still be
 * read after the restored one exists.
 *
 *   source   the database the archive was taken from
 *   restored an empty database the archive was imported into
 *   aided    a second empty database, imported from a copy of the archive with README.md and
 *            INDEX.md deleted
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTRACT
 * ---------------------------------------------------------------------------------------
 *
 * design/durability/FORMAT.md, and §8 in particular, which was written before either side existed.
 * Where a test here and that document disagree, the document is right.
 */

import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { fakeTranscript, freshDb, one, theOfficesOwnId, type TestDb } from './helpers.ts'
import { ARCHIVED_TABLES, MIGRATION_DECLARED_TABLES } from '../src/server/db/schema.ts'
import { COLUMNS_A_COPY_CLEARS, REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'

type ExportLib = typeof import('../src/server/lib/export.ts')
type ImportLib = typeof import('../src/server/lib/import.ts')
type PresentationLib = typeof import('../src/server/lib/presentation.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const AGENT = { type: 'agent', id: 'claude-code', sessionId: 'sess-import' } as const

let source: TestDb
let restored: TestDb
let aided: TestDb
let archive: string
let archiveWithoutAids: string
/** Where the restored database exports to, for the byte comparison that proves the fixed point. */
let reexport: string
let firstReport: Awaited<ReturnType<ImportLib['applyImport']>>
let secondReport: Awaited<ReturnType<ImportLib['applyImport']>>
/** The restored office's own row and its picture, drawn when it was migrated, read before the restore. */
let restoredOwn: { id: string; avatar: string }
const made: Record<string, string> = {}

/**
 * A `data` blob eight levels deep, which is what a module's curated chart really is:
 * data → summaryBlocks → [0] → spec → series → [0] → points → [0] → x.
 */
const DEEP = {
  context: 'A module whose curated summary carries a chart.',
  parts: [{ id: 'p1', name: '标定', items: [{ id: 'i1', text: 'Bolt it on', state: 'done', hours: 2 }] }],
  summaryBlocks: [
    {
      id: 'b1',
      type: 'chart',
      spec: {
        kind: 'line',
        x: { label: 'range', unit: 'm' },
        y: { label: '深度误差', unit: 'mm' },
        series: [{ id: 's1', name: '深度误差', state: 'done', points: [{ x: 1, y: 3.1 }, { x: 2, y: 9.4 }] }],
      },
    },
  ],
}

/**
 * An agent whose registry id differs from its handle, written directly.
 *
 * The registration door sets an agent's id to its handle until piece I-1b mints a separate one, so
 * no door can make this row yet. The round trip is the point: the archive must carry the id, the
 * importer must match on it, and the restore must bring the pair back together.
 */
const MINTED_AGENT = { id: 'Zt4Yb7Nc2Qw9', handle: 'roundtrip-minted', name: 'Round Trip Agent' }
/** The made-up id the minted agent had before the re-mint, which its renamed drawn face is still drawn from. */
const EARLIER_ID = 'roundtrip-earlier'

/** One agent row written directly, idle. Database setup, not behaviour under test. */
function insertAgent(t: TestDb, who: { id: string; handle: string; name: string }): void {
  // A map size is written like the migration writes one, so the import has nothing to generate and
  // the fixed-point export is byte-identical. A null size would be replaced by a generated one on
  // the way back in, which is the importer's rule and would break the comparison for a reason that
  // is not this test's subject.
  const pixelScale = JSON.stringify(generatePixelScale(who.id, null))
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, pixel_scale, retired, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, pixelScale, '2026-09-16 10:00:00')
}

/** Everything the fixture writes, through the product's own paths wherever there is one. */
async function seed(t: TestDb): Promise<void> {
  const presentation = (await import('../src/server/lib/presentation.ts')) as PresentationLib

  const gripper = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: '夹具标定', summary: '把 effort 值标定成实际夹持力', data: DEEP, actor: HUMAN })
  made['gripper'] = gripper.id
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Transplant v2', data: {}, actor: HUMAN })
  made['pipeline'] = pipeline.id
  const first = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'done', measured: 'p50 42 ms · n=400' }, HUMAN)
  const second = t.blocks.addBlock(pipeline.id, { name: 'Plan the approach', state: 'blocked' }, AGENT)
  made['block'] = first.block.id
  made['block2'] = second.block.id

  // A string with a newline in it. Two of 290 corpus blobs have one; rare enough to be missed in
  // testing and common enough to break a line-oriented format.
  const noted = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A note with a newline in its body', data: { body: 'first line\nsecond line' }, actor: HUMAN })
  made['note'] = noted.id

  // A MESSAGE THE OWNER WAS SENT, so `message_delivery` has a row for the restore to prove. How far
  // a message got is not a field of the record, so a restore that carried the record and lost the
  // row would say every message in the archive had reached nobody.
  const said = t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'A message with somebody to reach',
    data: { body: 'The sweep is holding until you say.', to: [{ kind: 'person', id: THE_PERSON }] },
    actor: HUMAN,
  })
  made['message'] = said.id

  // AND A REMINDER ON THAT MESSAGE, WITH WHO SET IT, so `message_delivery` has a row with the columns migration 0288
  // adds filled. Written straight into the table, like the press above; the times and the secretary are made up for
  // the fixture. The row must be there, or the round trip would prove a column with a value nobody wrote.
  const reminded = t.client.sqlite
    .prepare(
      "UPDATE message_delivery SET remind_at = '2026-10-21 12:00:00', reminded_at = '2026-10-21 12:05:00', " +
        "remind_set_by_kind = 'agent', remind_set_by_id = 'roundtrip-secretary' WHERE message_id = ?",
    )
    .run(said.id).changes
  if (reminded !== 1) throw new Error(`the message ${said.id} has ${String(reminded)} delivery rows, and this fixture needs one`)

  // AND ONE READ OF A CONVERSATION THE READER WAS NOT PART OF, so `conversation_reads` has a row for
  // the restore to prove. It is the record that criterion M12's read happened, and it exists to
  // outlive things — an archive that lost it would be the fortnight problem again with more steps.
  const messages = await import('../src/server/lib/messages.ts')
  messages.recordThatSomebodyRead(
    { kind: 'person', id: THE_PERSON },
    messages.pairKey({ kind: 'agent', id: 'roundtrip-a' }, { kind: 'agent', id: 'roundtrip-b' }),
    { kind: 'agent', id: 'roundtrip-a' },
    'default',
  )

  // AND ONE GROUP WITH SOMEBODY IN IT AND SOMEBODY WHO HAS LEFT, so `groups` and `group_members`
  // have rows for the restore to prove. A membership that has ended is the one shape a group with
  // nothing but joins would never write, and an archive that dropped it would lose the fact that
  // somebody was ever in the group — which is what a reader of an old conflict needs.
  const durable = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Roundtrip A',
    data: { handle: 'roundtrip-a', runtime: 'claude-code', state: 'active', workArea: ['src'] },
    actor: HUMAN,
  })
  made['agent'] = durable.id
  // THE REGISTRY ID IT WAS GIVEN, which is not its handle. A library call below is handed a stored
  // reference, and a stored reference is the id.
  const roundtripA = (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'roundtrip-a'").get() as { id: string }).id
  // Non-default choices make a lost scene or appearance differ in the existing all-row comparison.
  const pixel = await import('../src/server/lib/pixel-office.ts')
  const pixelChoices = await import('../src/shared/pixel-office.ts')
  pixel.changePixelAppearance('roundtrip-a', pixelChoices.generatePixelAppearance('roundtrip-appearance'), HUMAN)
  pixel.changePixelSettings({ motion: false }, HUMAN)
  // AND ONE MODEL SET ON THE SETTINGS PAGE, criterion U2, migration 0176. The store is a singleton
  // row, so a restore that dropped it would lose the only record of the press.
  const runModelStore = await import('../src/server/lib/run-models.ts')
  runModelStore.setTheRunModels({ places: { conversation: { runtime: 'claude-code', model: 'the-roundtrip-fixture-model' } } }, HUMAN)
  // AND ONE CASTING, migration 0190, which writes a history row beside it.
  // THE ROLE CARDS ARE READ ONCE, as buildApp reads them, because the Casting writer checks the role against them.
  const roleCards = await import('../src/server/lib/roles.ts')
  if (!roleCards.theRoleCardsAreRead()) {
    const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
    roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  }
  // A label and its history must both survive the same whole-database round trip as the row carrying it.
  const castingLabels = await import('../src/server/lib/casting-labels.ts')
  castingLabels.addACastingLabel({ name: 'roundtrip-label', meaning: { value: 'Work in the roundtrip fixture' } }, { by: { kind: 'human', id: THE_TEST_OFFICES_OWNER.id }, authority: null })
  const castingStore = await import('../src/server/lib/casting.ts')
  castingStore.addACasting('worker', { project: null, cells: { model: { value: 'the-roundtrip-fixture-model', decision: null }, labels: { value: 'roundtrip-label', decision: null } } }, HUMAN)
  // AND ONE ROW IN EACH OF MIGRATION 0189'S TWO TABLES, which migration 0190 kept as they were and nothing in the product
  // writes since. A database made before 0190 may hold such rows, so the archive must still carry them. Written in 0189's
  // shape, by hand, because no product path remains; the model is the fixture's own.
  t.client.sqlite.prepare(
    `INSERT INTO casting (role, project, model, model_from, changed_at, changed_by_kind, changed_by_id) VALUES ('secretary', '', 'the-0189-fixture-model', ?, '2026-09-29 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}')`,
  ).run(JSON.stringify({ at: '2026-09-29 10:00:00', by: { kind: 'human', id: THE_TEST_OFFICES_OWNER.id }, decision: null, moved: false }))
  t.client.sqlite.prepare(
    `INSERT INTO casting_changes (role, project, at, by_kind, by_id, decisions, after) VALUES ('secretary', '', '2026-09-29 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}', '[]', '{}')`,
  ).run()
  // AND ONE DIRECTORY ADDED BY HAND AS A PREVIEW ROOT, criterion U4, migration 0165. The store is a
  // singleton row, so a restore that dropped it would lose the only record of the press. The
  // directory is the throwaway database's own directory, which exists for the life of this test.
  const previewRoots = await import('../src/server/lib/preview-roots.ts')
  previewRoots.addPreviewRoot({ path: join(t.file, '..'), why: 'the roundtrip fixture adds one by hand' }, 'default', HUMAN)
  // AND A PRICE TABLE, criterion U3, migration 0177. A singleton row too, written through the
  // product's own writer. The prices are made up for the fixture.
  const prices = await import('../src/server/lib/price-table.ts')
  prices.setThePriceTable({ currency: 'GBP', prices: { 'roundtrip-model': { input: 3, output: 15, cachedInput: 0.3 } } }, HUMAN)
  // AND THE OWNER'S LIST OF QUICK INPUTS, migration 0272, SET AND THEN CLEARED. A singleton row too, written through the
  // product's own writers. A clear keeps the row with no inputs, stamped by the person, and the fresh office the archive
  // is restored into starts with the migration's /context and /compact; so the restore must write the archive's NULL
  // over that list, or the restored office would type from a list the person had cleared.
  const quickInputs = await import('../src/server/lib/quick-inputs.ts')
  quickInputs.setTheQuickInputList(['/compact', '/roundtrip'], HUMAN)
  quickInputs.clearTheQuickInputList(HUMAN)
  const team = await import('../src/server/lib/groups.ts')
  const group = team.openAGroup({
    workspaceId: 'default',
    name: 'The gripper calibration',
    openedBy: { kind: 'person', id: THE_PERSON },
    because: 'Two of us are on the gripper and this is where it is talked about.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'The owner opened it.' },
      { who: { kind: 'agent', id: roundtripA }, because: 'It is doing the calibration.' },
    ],
  })
  made['group'] = group.id
  team.takeOutOfTheGroup(group.id, { kind: 'agent', id: roundtripA }, { kind: 'person', id: THE_PERSON })

  // AND ONE WORK CLAIM, RELEASED, so `work_claims` has a row for the restore to prove with both the
  // columns a live claim never fills. `releasedAt` and `releasedBecause` are the one ending that is
  // written down — every other ending is read from the run — so an archive that dropped them would
  // lose the only stored fact about how a claim finished.
  const theRun = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The run that claimed the calibration',
    data: { state: 'finished', runtime: 'claude-code' },
    actor: HUMAN,
  })
  const claims = await import('../src/server/lib/claims.ts')
  const theClaim = claims.fileAClaim(
    {
      workspaceId: 'default',
      claimant: { kind: 'agent', id: roundtripA },
      run: theRun.id,
      things: [{ what: 'path', id: 'perception/calibration' }],
    },
    HUMAN,
  )
  made['claim'] = theClaim.claim.id
  claims.releaseAClaim(theClaim.claim.id, 'default', { kind: 'agent', id: roundtripA }, 'The fit is done.')

  // AND ONE HOLD ON AN AGENT HANDLE, RELEASED, so `handle_holds` has a row for the restore to prove
  // with both the columns a live hold never fills. A hold that has ended is the shape that matters:
  // it is the only stored account of a session having answered as an agent and of why it stopped.
  const handles = await import('../src/server/lib/handles.ts')
  const theTerminal = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The terminal that was answering as roundtrip-a',
    data: { state: 'finished', runtime: 'claude-code' },
    actor: HUMAN,
  })
  handles.holdTheHandle({
    handle: 'roundtrip-a',
    session: theTerminal.id,
    machine: 'a-machine',
    runtime: 'claude-code',
    workspaceId: 'default',
  })
  handles.letTheHandleGo('roundtrip-a', theTerminal.id, 'the session stopped the waiter')

  // AND ONE CONTACT GROUP THE OWNER MADE, ONE OF THE THREE RENAMED, AND A CONTACT MOVED INTO THE MADE ONE,
  // so both tables migration 0127 adds have rows. Three shapes rather than one: a group somebody
  // made carries a key nothing else knows, a built-in one they renamed carries the owner's own word for it,
  // and a placement carries the group the owner moved somebody into. An archive that dropped the rename
  // would put the owner's word back to the product's.
  const contacts = await import('../src/server/lib/contacts.ts')
  const arranger = { kind: 'person' as const, id: THE_PERSON }
  const arranged = contacts.makeAContactGroup(arranger, 'Verifiers', 'agent')
  contacts.renameAContactGroup(arranger, 'worker', 'Builders')
  contacts.moveAContact(
    arranger,
    [{ key: 'agent:roundtrip-a', kind: 'agent', id: 'roundtrip-a', role: 'worker', retired: false }],
    'agent:roundtrip-a',
    arranged.key,
  )
  // AND ONE FOLD, so `contact_group_collapses` has a row to come back. Criterion M121.
  contacts.setAContactGroupCollapsed(arranger, 'retired', false)
  made['contactGroup'] = arranged.key

  // AND A PERMANENT RESIDENT'S LEAVE, VOID MARK AND WRITE, one row each, so the three tables the residents'
  // migration adds have rows. Written straight into the tables: the fixture is about what an archive carries.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare("INSERT INTO resident_read_grants (id, resident_id, reader_id, until, given_at, given_by_kind, given_by_id) VALUES ('grant-1', ?, ?, '2099-01-01 12:00:00', '2026-09-16 10:00:00', 'agent', ?)").run(someAgent, someAgent, someAgent)
    t.client.sqlite.prepare(`INSERT INTO resident_void_marks (id, resident_id, path, because, marked_at, marked_by_kind, marked_by_id) VALUES ('void-1', ?, 'memory/a.md', 'A made-up reason.', '2026-09-16 10:00:00', 'person', '${THE_TEST_OFFICES_OWNER.id}')`).run(someAgent)
    t.client.sqlite.prepare("INSERT INTO resident_space_writes (id, resident_id, path, bytes, sha256, written_at, written_by_kind, written_by_id) VALUES ('write-1', ?, 'memory/a.md', 3, 'abc', '2026-09-16 10:00:00', 'agent', ?)").run(someAgent, someAgent)
    t.client.sqlite.prepare("INSERT INTO resident_sleeps (id, agent_id, what, began_at, ended_at, because, by_kind, by_id, session_id) VALUES ('sleep-1', ?, 'slept', '2026-09-16 22:00:00', '2026-09-17 06:00:00', 'A made-up night.', 'agent', ?, NULL)").run(someAgent, someAgent)
  }

  // AND A REQUEST FOR ONE PRESS THE PERSON AGREED TO, so `one_press_requests` has a row with every column filled.
  // Written straight into the table, like the residents' rows above.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare(`INSERT INTO one_press_requests (id, workspace_id, act, inputs, asked_by, shows, because, state, asked_at, answered_at, answered_by_kind, answered_by_id, outcome) VALUES ('press-1', 'default', 'change-a-setting', '{"panel":"settings.whatiskept","setting":"keepBackups","value":12}', ?, 'Change "Backups to keep" from 30 to 12.', 'A made-up reason.', 'done', '2026-09-16 10:00:00', '2026-09-16 10:05:00', 'person', '${THE_TEST_OFFICES_OWNER.id}', '"Backups to keep" is now 12.')`).run(someAgent)
  }

  // AND A USE OF A TOOL WITH EVERY COLUMN FILLED, so `tool_uses` has a row for the restore to prove. A row the use door
  // writes has no `moved_at`, and a moved row has no writer, so no real row fills both; this one is written straight
  // into the table so a restore that dropped either column is a difference.
  {
    const someRecord = (t.client.sqlite.prepare('SELECT id FROM records ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare("INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id, moved_at) VALUES ('use-1', 'default', ?, 1, '2026-09-16 10:00:00', 'data-copy', 'make: a made-up use', 'agent', 'a-made-up-agent', '2026-09-16 10:05:00')").run(someRecord)
  }

  // A named test file's result belongs to its use, and every column must survive the round trip.
  t.client.sqlite.prepare("INSERT INTO test_file_runs (id, workspace_id, use_id, file, result, seconds, test_file_hash, tree_commit, tree_change) VALUES ('file-run-1', 'default', 'use-1', 'tests/made-up.test.ts', 'passed', 1.234, '0123456789abcdef', ?, 'fedcba9876543210')").run('a'.repeat(40))

  // AND A HANDOVER THE PERSON WROTE FOR AN AGENT IN A RUN, so `handovers` has a row with every column filled.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare(`INSERT INTO handovers (id, agent_id, workspace_id, text, written_at, written_by_kind, written_by_id, session_id) VALUES ('handover-1', ?, 'default', 'A made-up handover: the next step is the export.', '2026-09-16 10:00:00', 'person', '${THE_TEST_OFFICES_OWNER.id}', 'a-made-up-run')`).run(someAgent)
  }

  // AND A READINESS CHECKLIST THE PERSON CANCELLED, WITH A SIGNATURE TAKEN BACK, so `readiness_checklists` and
  // `readiness_signatures` each have a row with every column filled. Written straight into the tables, like the
  // request for one press above.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare(`INSERT INTO readiness_checklists (id, workspace_id, operation, inputs, on_what, shows, level, signers, raised_by_kind, raised_by_id, because, state, raised_at, ends_at, closed_at, closed_by_kind, closed_by_id, outcome) VALUES ('ready-1', 'default', 'harnesses.install', '{"harnesses":["claude-code"]}', 'a-made-up-hash', 'Install or upgrade Claude Code, which every agent that runs on it uses.', 'everyone', ?, 'person', '${THE_TEST_OFFICES_OWNER.id}', 'A made-up reason.', 'cancelled', '2026-09-16 10:00:00', '2026-09-16 11:00:00', '2026-09-16 10:10:00', 'person', '${THE_TEST_OFFICES_OWNER.id}', 'The person cancelled it. Nothing ran.')`).run(JSON.stringify([{ kind: 'agent', id: someAgent, why: 'a-secretary' }, { kind: 'person', id: THE_TEST_OFFICES_OWNER.id, why: 'the-person' }]))
    t.client.sqlite.prepare(`INSERT INTO readiness_signatures (id, checklist_id, signer_kind, signer_id, on_what, signed_at, withdrawn_at) VALUES ('signature-1', 'ready-1', 'agent', ?, 'a-made-up-hash', '2026-09-16 10:02:00', '2026-09-16 10:05:00')`).run(someAgent)
  }

  // A SIGNED PACKAGE AND A DONE ITEM: every column reaches the archive and returns unchanged.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare(`INSERT INTO signing_packages (id, workspace_id, brought_by, for_agent, task, state, brought_at, answered_at, answered_by_kind, answered_by_id, outcome, hold_ends_at, hold_ended_at, hold_ended_how) VALUES ('package-1', 'default', ?, ?, 'A fixture task', 'signed', '2026-09-16 10:00:00', '2026-09-16 10:05:00', 'person', '${THE_TEST_OFFICES_OWNER.id}', 'A fixture outcome', '2026-09-17 10:05:00', '2026-09-16 10:06:00', 'all-carried-out')`).run(someAgent, someAgent)
    t.client.sqlite.prepare(`INSERT INTO signing_package_items (id, package_id, position, act, inputs, why, shows, changes, undone, state, outcome, done_at, carried_out, carried_out_by, carried_out_in) VALUES ('package-item-1', 'package-1', 1, 'change-a-setting', '{"panel":"settings.whatiskept","setting":"keepBackups","value":12}', 'A fixture reason', 'Change backups to keep to 12.', 'Changes the number kept.', 'Change it on Settings.', 'done', 'The number is now 12.', '2026-09-16 10:05:00', 'by-the-named-agent', ?, 'fixture-package-run')`).run(someAgent)
    for (const table of ['changes', 'revisions']) t.client.sqlite.prepare(`UPDATE ${table} SET signed_item = ? WHERE rowid = (SELECT MIN(rowid) FROM ${table})`).run(JSON.stringify({ package: 'package-1', item: 'package-item-1' }))
  }

  // AND AN ASK FOR A QUICK INPUT, so `quick_input_asks` has a row with every column filled. Written straight into the
  // table, like the request for one press above; the run and the terminal are made up for the fixture.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare("INSERT INTO quick_input_asks (id, at_ms, agent_id, run, terminal, input, outcome, says, asked_by_kind, asked_by_id, proved_by) VALUES ('ask-1', 1789552800000, ?, 'a-made-up-run', 'a-made-up-terminal', '/compact', 'too-soon', 'A made-up sentence.', 'agent', 'roundtrip-a', 'an-agent-key')").run(someAgent)
  }

  // AND A PRESS FOR THE PERSON, so `presses_for_the_person` has a row with every column filled and one change row names
  // it in `press_id`. Written straight into the tables, like the ask above; the grant and the session are made up.
  {
    const someAgent = (t.client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as { id: string }).id
    t.client.sqlite.prepare("INSERT INTO presses_for_the_person (id, workspace_id, agent_id, session_id, grant_id, operation, reason, at) VALUES ('press-1', 'default', ?, 'a-made-up-session', 'elevation-a-made-up-grant', 'resident.decline', 'A made-up reason.', '2026-09-16 10:07:00')").run(someAgent)
    t.client.sqlite.prepare("UPDATE changes SET press_id = 'press-1' WHERE rowid = (SELECT MAX(rowid) FROM changes)").run()
  }

  // AND AN ANSWER THIS OFFICE'S PERSON CHANGED, so `what_the_grant_carries` has a row with every column filled.
  // Written straight into the table, like the press above; the door and the person are made up for the fixture.
  t.client.sqlite
    .prepare("INSERT INTO what_the_grant_carries (door, answer, updated_at, updated_by_kind, updated_by_id) VALUES ('office.set-quick-inputs', 'may-press', '2026-09-16 10:08:00', 'human', 'owner')")
    .run()

  // AND TWO WORLDS, ONE ALIVE AND ONE THAT DIED, so `worlds` has a row for the restore to prove with
  // both the columns a live world never fills. A world appearing and a world disappearing are
  // moments, and an archive that dropped the dead one would keep the less interesting half.
  const office = await import('../src/server/lib/office.ts')
  const home = office.registerWorldHere({
    name: 'my world',
    kind: 'home',
    startedBy: { kind: 'person', id: THE_PERSON },
    checkout: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
    head: '905d1df',
    databaseIdentity: 'd'.repeat(16),
    address: 'http://127.0.0.1:41200',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'the-installation-this-corpus-belongs-to',
  })
  const ended = office.registerWorldHere({
    name: "roundtrip-a's calibration",
    kind: 'agent-made',
    startedBy: { kind: 'agent', id: 'roundtrip-a' },
    checkout: `${THE_TEST_FIXTURE_ROOT}/px-citizens`,
    head: '91ad217',
    databaseIdentity: 'e'.repeat(16),
    address: 'http://127.0.0.1:41201',
    addressForOtherMachines: null,
    standing: 'scratch',
    parentWorld: home.id,
    installation: 'the-installation-this-corpus-belongs-to',
  })
  office.closeWorldHere(ended.id, 'the supervisor stopped its server')

  // AND TWO VISITS, one open and one ended, so both states of `until` round-trip and the archive is
  // proved to carry what somebody said they came to do.
  const visitsLib = await import('../src/server/lib/visits.ts')
  visitsLib.registerVisitHere({
    visitor: { kind: 'person', id: THE_PERSON },
    fromWorld: 'd'.repeat(16),
    toWorld: 'e'.repeat(16),
    why: 'reading what the agent built',
  })
  const wentBack = visitsLib.registerVisitHere({
    visitor: { kind: 'agent', id: 'roundtrip-a' },
    fromWorld: 'e'.repeat(16),
    toWorld: 'd'.repeat(16),
    why: 'filing what it found',
  })
  visitsLib.endVisitHere(wentBack.id)

  // AND TWO VISITING AGENTS' CREDENTIALS, one still waiting for the owner and one confirmed and used, so
  // every state of `standing` round-trips — and two requests under the second, one of them a
  // mismatch, because that JSON list is the evidence the owner's supervision is made of and an archive that
  // dropped it would restore a credential with nothing to look at. Criteria P24 to P30.
  const visitorsLib = await import('../src/server/lib/visitors.ts')
  visitorsLib.issueACredential({
    handle: 'roundtrip-visitor',
    name: 'A worker on another machine',
    role: 'worker',
    world: null,
    machine: 'a-machine.example',
    machineHow: 'an address',
    facts: {
      conversationPath: '/transcripts/another-machine/4f10',
      startDirectory: '/work/another-machine',
      runtime: 'claude-code',
      sessionRecord: null,
    },
  })
  const usedOne = visitorsLib.issueACredential({
    handle: 'roundtrip-visitor-two',
    name: 'A second worker on another machine',
    role: 'worker',
    world: null,
    machine: 'a-machine.example',
    machineHow: 'an address',
    facts: {
      conversationPath: '/transcripts/another-machine/9b22',
      startDirectory: '/work/another-machine-two',
      runtime: 'claude-code',
      sessionRecord: null,
    },
  })
  visitorsLib.confirmACredential(usedOne.credential.id, { kind: 'person', id: THE_PERSON })
  visitorsLib.recordARequestUnder(usedOne.credential.id, {
    method: 'GET',
    route: '/api/agent/runs',
    operation: 'agent.runs',
    wrote: false,
    refusedBecause: null,
    mismatch: [],
    fromATrustedMachine: null,
  })
  visitorsLib.recordARequestUnder(usedOne.credential.id, {
    method: 'GET',
    route: '/api/health',
    operation: 'runtime.health',
    wrote: false,
    refusedBecause: null,
    mismatch: [
      { said: 'the directory the run started in', issued: '/work/another-machine-two', sent: '/tmp/somewhere-else' },
    ],
    fromATrustedMachine: null,
  })

  /**
   * AND THE MACHINES THIS OFFICE TRUSTS. Criterion P73.
   *
   * TWO ROWS, ONE OF THEM REMOVED, because the two states are different facts and an archive that
   * carried only the live one would lose the record of who the office once let in. Written through
   * the two presses at the world's page.
   */
  const trustedLib = (await import('../src/server/lib/trustedmachines.ts')) as typeof import('../src/server/lib/trustedmachines.ts')
  trustedLib.trustThisMachine('a-machine.example', { kind: 'person', id: THE_PERSON }, 'a press', 'the other box', null)
  const noLonger = trustedLib.trustThisMachine('an-old-machine.example', { kind: 'person', id: THE_PERSON }, 'a press', null, null)
  trustedLib.stopTrustingThisMachine(noLonger.id, { kind: 'person', id: THE_PERSON }, 'it is off for good')

  // A state word STATE_MEANING does not classify, WHICH IS NOW A WORD FROM AN OLDER VOCABULARY
  // RATHER THAN A DECLARED ONE. This was `ordered` until `ordered` was classified; the ten declared
  // words that the reading side could not read are all classified now, so the only records left in
  // that group are ones filed before a vocabulary moved under them.
  //
  // THAT MAKES THIS CASE MORE IMPORTANT TO THE ARCHIVE, NOT LESS. An archive outlives the schema
  // that wrote it, so a file written last year holds words this year's kinds no longer declare, and
  // an importer that refused them would refuse exactly the old archives a restore exists for. The
  // row is written through the gate and the word is then put in the row, because the gate refuses
  // it — which is the whole reason a live database can only get one this way.
  const parked = t.api.createRecord({ workspaceId: 'default',
    kind: 'purchase',
    title: 'A gripper pad nobody has classified the state of',
    data: { state: 'ordered', why: 'the current pads slip at effort 12', cost: 40, currency: 'EUR' },
    actor: HUMAN,
  })
  t.client.sqlite
    .prepare('UPDATE records SET data = ? WHERE id = ?')
    .run(JSON.stringify({ state: 'chasing', why: 'the current pads slip at effort 12', cost: 40, currency: 'EUR' }), parked.id)
  made['parked'] = parked.id

  // A record that is soft-deleted, and therefore only recoverable through its change rows.
  const doomed = t.api.createRecord({ workspaceId: 'default',
    kind: 'claim',
    title: 'A claim that was withdrawn',
    data: { state: 'retracted', evidence: ['one run'], retracted_because: 'the bed was not level' },
    actor: HUMAN,
  })
  made['deleted'] = doomed.id
  t.api.deleteRecord(doomed.id, HUMAN)

  // links: one inferred, one hard gate, one partial gate with an upTo, one unqualified
  t.api.createLink({ fromId: gripper.id, toId: first.block.id, type: 'implements', inferred: true, actor: HUMAN })
  t.api.createLink({ fromId: first.block.id, toId: second.block.id, type: 'blocks', gate: { kind: 'hard' }, actor: HUMAN })
  t.api.createLink({ fromId: gripper.id, toId: second.block.id, type: 'blocks', gate: { kind: 'partial', upTo: first.block.id }, actor: AGENT })
  t.api.createLink({ fromId: noted.id, toId: gripper.id, type: 'discusses', actor: HUMAN })

  // the five tables the seeded corpus leaves empty. panel_layouts is one of them, and no archive carries it
  // its row is here so that "the restore brings none back" is said of a real row.
  t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, 'default')
  presentation.writeNodeIntent(presentation.parseScope(`pipeline:${pipeline.id}`, 'default'), first.block.id, { lane: 'on the real arm', emphasis: 'blocked' }, HUMAN)
  t.client.sqlite
    .prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?,?,?,?,?)')
    .run('default', 'home', JSON.stringify({ columns: 2, blocks: [{ id: 'attention', span: 2 }] }), '2026-08-10 18:40:02', `human:${THE_TEST_OFFICES_OWNER.id}`)
  t.client.sqlite
    .prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?,?,?)')
    .run(
      JSON.stringify([1, 'shared']),
      JSON.stringify({
        version: 1, seed: 'default', grouping: 'shared',
        regions: [{
          id: 'secretary', groupKey: 'secretary', zone: 'secretary', workspaceId: null, teamId: null,
          origin: { x: 0, y: 0 }, profile: 'hub', cells: [{ x: 0, y: 0 }], slots: [{ x: 0, y: 0 }], door: { x: 0, y: 0 },
        }],
        assignments: {}, roads: [],
      }),
      '2026-08-10 18:40:02',
    )
  // AND ONE ADDRESSEE NAMED IN A BROADCAST AND THEN CLAIMED, so `dead_letter_claims` has a row for
  // the restore to prove with both the columns a fresh broadcast leaves empty. `sweepDeadLetters`
  // names an addressee with `opened_at`; `claimDeadLetters` is the only writer of `claimed_at` and
  // the claimer. An archive that dropped the claim would lose the only stored fact about who took
  // those letters on.
  t.client.sqlite
    .prepare(
      'INSERT INTO dead_letter_claims (id, workspace_id, group_id, agent_id, opened_at, claimed_by_kind, claimed_by_id, claimed_at, claimed_because) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .run('roundtrip-dead-letter-claim', 'default', group.id, 'roundtrip-a', '2026-08-10 18:41:03', 'person', THE_PERSON, '2026-08-10 19:02:11', 'I took the calibration letters on.')
  // Raw SQL for the ledger, and only for the ledger. `registerResource` reads the live machine
  // through OsProbe to find a pid's start time, and this file is about the FORMAT.
  const ledger = t.client.sqlite.prepare(
    `INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, pgid, os_started_at, detail,
        registered_at, registered_by, released_at, released_by, release_note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  ledger.run('res-1', 'default', pipeline.id, 'port', '39187', 3_314_755, '2026-08-10 14:29:03', 'the audit server', '2026-08-10 14:29:03', 'agent:claude-code', '2026-08-10 15:02:11', `human:${THE_TEST_OFFICES_OWNER.id}`, 'killed by process group')
  // Still held, and with an `os_started_at` deliberately different from `registered_at`, so a test
  // asserting it is gone cannot pass by accident on a string that is legitimately somewhere else.
  ledger.run('res-2', 'default', pipeline.id, 'process', '424242', 424_240, '2026-08-10 15:59:01', 'a server nobody stopped', '2026-08-10 16:00:00', 'agent:claude-code', null, null, null)

  // the plan: two horizons, and one allocation that deliberately states NO hours
  //
  // The unstated one is the point. `plannedHours: null` means somebody committed to the work in
  // this period without saying how long for, which is a different fact from zero — and it is the
  // value a careless round trip is most likely to flatten, while every row count still matches.
  const planning = (await import('../src/server/lib/planning.ts')) as typeof import('../src/server/lib/planning.ts')
  const week = planning.createAllocation(
    { horizon: 'week', period: '2026-W33', recordId: first.block.id, plannedHours: 6, note: 'the week it was written' },
    HUMAN,
  )
  planning.createAllocation({ horizon: 'day', period: '2026-08-12', recordId: first.block.id, plannedHours: 2.5 }, HUMAN)
  planning.createAllocation({ horizon: 'week', period: '2026-W34', recordId: second.block.id }, HUMAN)
  planning.patchAllocation(week.id, { state: 'done', actualHours: 7 }, HUMAN)
  planning.setCapacity('week', '2026-W33', 30, 'three teaching days', HUMAN)
  planning.setCapacity('day', '2026-08-12', 6, null, HUMAN)

  // when somebody means to work on something — a span, a single day, a note, and a state that is
  // not `planned`
  //
  // A WINDOW CARRIES NO HOURS, so nothing else in this archive disagrees when one comes back wrong.
  // The span crosses a week boundary, which is the reason the table stores two dates rather than one
  // period key. The single day is the shape an end date read as EXCLUSIVE comes back wrong for. The
  // note is verbatim words a person wrote for their next self. `dropped` is a span that did not
  // happen, which is a different fact from one nobody planned.
  const windows = (await import('../src/server/lib/windows.ts')) as typeof import('../src/server/lib/windows.ts')
  windows.createWindow(
    {
      recordId: first.block.id,
      startsOn: '2026-08-13',
      endsOn: '2026-08-19',
      note: 'Grip slips above 15N; recalibrate before the next run.',
    },
    HUMAN,
  )
  windows.createWindow({ recordId: second.block.id, startsOn: '2026-08-24', endsOn: '2026-08-24' }, HUMAN)
  const missed = windows.createWindow({ recordId: first.block.id, startsOn: '2026-08-10', endsOn: '2026-08-11' }, HUMAN)
  windows.patchWindow(missed.id, { state: 'dropped' }, HUMAN)

  planning.createRecurrence({ recordId: first.block.id, every: 'weekly', hoursEach: 1 }, HUMAN)
  // a draft, with the shape a line-oriented format is most likely to damage — moved into a plan by migration 0196's
  // own step, the way every draft became one, so the plan's `moved_from_draft` and the lines the move stamped are
  // in the archive and must come back
  {
    const move = await import('../src/server/db/drafts-into-plans-migration.ts')
    t.client.sqlite.exec(readFileSync(join(import.meta.dirname, '..', move.THE_FILE_THAT_MADE_THE_DRAFTS_TABLE), 'utf8'))
    t.client.sqlite
      .prepare('INSERT INTO planning_drafts (id, title, body, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        'draft-icra',
        'ICRA submission — rough',
        'ICRA submission\ntarget: September\n\nMust\n- baseline\n- 数据采集\n\nMaybe\n- gaze\n',
        '2026-08-10 09:00:00',
        '2026-08-11 17:30:00',
        `human:${THE_TEST_OFFICES_OWNER.id}`,
      )
    const moved = move.moveDraftsIntoPlans(t.client.sqlite)
    expect(moved.moved.length, move.describeTheDraftMove(moved)).toBe(1)
  }

  // a plan, stored one row per line, with a line filed as work and given hours
  //
  // THE SHAPES A LINE-ORIENTED FORMAT DAMAGES: a blank line, a line with trailing spaces, a pipe
  // table and Chinese. One line is filed as work, so the binding between the writing and the
  // project is in the archive; the rest are not, which is the ordinary case and must come back
  // that way rather than looking filed.
  const plans = (await import('../src/server/lib/plans.ts')) as typeof import('../src/server/lib/plans.ts')
  const written = plans.createPlan(
    {
      title: 'ICRA submission — written out',
      body: '# ICRA submission\n\ntarget: September   \n- [ ] baseline\n- 数据采集\n\n| What | How big |\n|---|---|\n| baseline | 20h |\n',
    },
    HUMAN,
  )
  const line = written.lines.find((l) => l.text === '- 数据采集')
  if (line === undefined) throw new Error('the plan just written has no line to file as work')
  plans.fileLineAsWork(written.plan.id, line.id, { kind: 'task', workspaceId: 'default' }, HUMAN)
  plans.giveLineTime(written.plan.id, line.id, { horizon: 'week', period: '2026-W35', plannedHours: 3 }, HUMAN)
  // AND ONE LINE ADDED AFTERWARDS, WITH ITS REASON. Criterion P3, 16 September 2026: a change to a
  // plan's lines keeps why it was made, and that row is the only copy of it — the line says what it
  // says and never why it arrived. Without one here the archive would carry an empty table and the
  // restore would prove nothing about it.
  plans.addLine(written.plan.id, { text: '- book the rig', reason: 'The rig is shared and the week is full.' }, HUMAN)
  // AND THE PLAN MARKED AS READ BY A SECRETARY UNDER THE PERSON'S GRANT, so `plans` has a row with the columns
  // migration 0295 adds filled. Written straight into the table, like the reminder above; the time, the secretary and
  // the grant are made up for the fixture.
  const markedRead = t.client.sqlite
    .prepare(
      "UPDATE plans SET read_at = '2026-10-21 12:10:00', read_by_agent = 'roundtrip-secretary', " +
        "read_under_grant = 'roundtrip-grant' WHERE id = ?",
    )
    .run(written.plan.id).changes
  if (markedRead !== 1) throw new Error(`the plan ${written.plan.id} was not marked as read, and this fixture needs it marked`)

  // a counter that counted, fired once and had its next firing held back by its own limit
  //
  // ALL THREE KINDS OF ROW, because they are three different statements — somebody counted
  // something, the office acted, the office decided not to act — and an archive that flattened one
  // into another would still restore the right number of rows. A counter's count is not stored
  // anywhere: it is added up from these rows, so an archive without them restores a counter that
  // never counted anything, with its own record whole.
  const counters = (await import('../src/server/lib/counters.ts')) as typeof import('../src/server/lib/counters.ts')
  const counter = counters.makeACounter({
    workspaceId: 'default',
    said: {
      title: 'Gripper trials since the last review',
      counts: 'Trials run on the gripper since somebody last looked at the numbers.',
      amountIs: 'grams of slip measured in each trial',
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'task', title: 'Look at the gripper numbers' },
    },
    actor: HUMAN,
  })
  for (const [because, amount] of [
    ['The first trial of the morning.', 3],
    ['The second trial, heavier load.', 5],
    ['A third trial after lunch.', 2],
    ['A fourth trial, which reaches the trigger again inside the limit.', 4],
  ] as const) {
    counters.addToACounter({ workspaceId: 'default', id: counter.id, said: { by: 1, amount, because }, actor: HUMAN })
  }

  // what somebody wrote about time, in all three states the row can be in
  //
  // ALL THREE, BECAUSE THEY ARE THREE DIFFERENT FACTS. `kept` means the words are stored and nothing
  // was read from them; `offered` means a reading was made and waits for a person; `committed` means
  // it became an allocation, and committed is the only state that is in any total. A format that
  // flattened one into another would move every week's arithmetic while the row count still matched.
  //
  // THE KEPT ONE IS THE SHAPE MOST AT RISK: its `period`, `horizon` and `hours` are all null, meaning
  // Mole Office read nothing and invented nothing, and null is what a careless round trip fills in.
  const unfiled = written.lines.find((l) => l.text === '- [ ] baseline')
  if (unfiled === undefined) throw new Error('the plan just written has no unfiled line to write an intent on')
  const kept = planning.createIntent({ said: 'sometime next week, if 标定 is done', recordId: first.block.id }, HUMAN)
  if (kept.intent.period !== null || kept.intent.state !== 'kept') {
    throw new Error(
      `"${kept.intent.said}" was read as ${String(kept.intent.period)} in state ${kept.intent.state}, and this ` +
        'corpus needs it kept with no period, or the round trip never carries a null reading.',
    )
  }
  // On a line that was never filed as work, so it names a line and no record at all. That is the
  // ordinary case: somebody writes time against a line before deciding it is work.
  planning.createIntent({ said: 'half a day, once the rig is free', planLineId: unfiled.id }, HUMAN)
  planning.createIntent(
    { said: '15h the week after the deadline', recordId: first.block.id, period: '2026-W36', hours: 15 },
    HUMAN,
  )
  const toCommit = planning.createIntent(
    { said: 'six hours the week after next', recordId: second.block.id, period: '2026-W36', hours: 6 },
    HUMAN,
  )
  planning.commitIntent(toCommit.intent.id, HUMAN)

  // talking to an agent: one review that went to three agents, and one conversation nothing was
  // sent from
  //
  // A REVIEW IS ONE HUMAN ACT AND IT DOES NOT GO TO ONE PLACE. Every comment carries who it is for,
  // and finishing the review writes one run per recipient — so the fact most at risk in this archive
  // is not the words, it is which comment went to whom. Three recipients, because with one there is
  // one answer to that question and losing it changes nothing visible.
  //
  // ALL FOUR SHAPES OF CONTEXT ARE HERE: a record, a line of a plan, a block on the week, and a span
  // of text WITH THE WORDS IT QUOTED. The quote is the reason a comment still says what it was about
  // after somebody rewrites the paragraph under it, so an archive that lost it would leave a comment
  // pointing at an offset in a document that has moved on.
  //
  // AND EVERY NULLABLE COLUMN ON A RUN IS FILLED ON ONE ROW AND NULL ON ANOTHER: one run was
  // answered, one was declined by a worker that could not serve it, and one is still waiting with
  // every stamp null — which is what a careless import fills in.
  //
  // AND EACH RUN SAYS WHICH AGENT IT WORKED AS, the way the office records it: an agent record filed
  // for that run, named in the run's `ranAs` for its own project. A comment addressed to a run that
  // names no agent is refused before anything is written, so without this the two comments below
  // are never stored. The agent record holds what the door used to make from a run's title: a
  // handle, the state active and the run's runtime.
  const agents = (await import('../src/server/lib/agents.ts')) as typeof import('../src/server/lib/agents.ts')
  const workedAs = (title: string, handle: string): string =>
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title,
      data: { handle, state: 'active', runtime: 'claude-code' },
      actor: HUMAN,
    }).id
  const stamped = (title: string, externalId: string, agentId: string): string =>
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title,
      data: {
        state: 'idle',
        runtime: 'claude-code',
        ranAs: [{ workspaceId: 'default', agentId }],
        // What discovery stamps on a session record. `stampOf` in lib/sessions.ts is the one reader
        // of it, and a session Mole Office has no id for is refused at dispatch by name.
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId,
            // A real file: addressing a comment to a run asks whether it can be picked up.
            logPath: fakeTranscript(externalId),
            resumeCommand: `claude --resume ${externalId}`,
            observedState: 'idle',
            stateReason: 'its log last grew 40 minutes ago',
            filesTouched: [],
            filesComplete: true,
            at: '2026-08-18 09:00:00',
          },
        },
      },
      actor: HUMAN,
    }).id
  const calibrationRun = stamped(
    'The run that measured the gripper',
    'aaaa1111-0000-0000-0000-00000000aaaa',
    workedAs('Roundtrip calibration', 'roundtrip-calibration'),
  )
  const writingRun = stamped(
    'The run that wrote the submission plan',
    'bbbb2222-0000-0000-0000-00000000bbbb',
    workedAs('Roundtrip writing', 'roundtrip-writing'),
  )
  made['calibrationRun'] = calibrationRun
  made['writingRun'] = writingRun

  const body = 'first line\nsecond line'
  const quote = 'second line'
  const quoteAt = body.indexOf(quote)
  if (quoteAt === -1) throw new Error('the note this comment quotes does not contain the words it quotes')

  const review = agents.createThread(
    { workspaceId: 'default', title: 'Round seven, read again', mode: 'review' },
    HUMAN,
  )
  made['review'] = review.id
  agents.addMessage(
    review.id,
    'default',
    {
      intent: 'review',
      body: 'The effort figure here is the one from before the pads were changed.',
      context: { target: { kind: 'record', recordId: gripper.id, workspaceId: 'default' } },
      recipient: {
        kind: 'session',
        sessionId: calibrationRun,
        why: 'This run measured the gripper, so it is the one that knows what the figure came from.',
      },
    },
    HUMAN,
  )
  agents.addMessage(
    review.id,
    'default',
    {
      intent: 'change',
      body: 'This line still says baseline. Say what is left of it.',
      context: { target: { kind: 'planLine', planId: written.plan.id, lineId: unfiled.id } },
      recipient: {
        kind: 'session',
        sessionId: writingRun,
        said: 'the run that has been writing the plan',
        why: 'Those words matched one run, and it is the one that wrote this plan.',
      },
    },
    HUMAN,
  )
  agents.addMessage(
    review.id,
    'default',
    {
      intent: 'ask',
      body: 'These words claim more than the note does. Rewrite them or say why they stand.',
      context: {
        target: { kind: 'record', recordId: noted.id, workspaceId: 'default' },
        span: { quote, from: quoteAt, to: quoteAt + quote.length, field: 'data.body' },
      },
      recipient: {
        kind: 'new',
        said: 'somebody who has not read this yet',
        why: 'Asked for a fresh agent on purpose, so the answer is not a run marking its own work.',
      },
    },
    HUMAN,
  )

  const sent = agents.dispatchThread(review.id, 'default', { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' })
  if (sent.runs.length !== 3) {
    throw new Error(
      `finishing the review wrote ${sent.runs.length} run(s) and this archive needs 3 — one per recipient. With ` +
        'fewer, "which comment went to whom" has fewer answers than the review has recipients.',
    )
  }
  const answeredRun = one(sent.runs.filter((r) => r.recipientSessionId === calibrationRun), 'the run for the calibration agent')
  const declinedRun = one(sent.runs.filter((r) => r.recipientSessionId === writingRun), 'the run for the writing agent')
  const waitingRun = one(sent.runs.filter((r) => r.recipientSessionId === null), 'the run for a new agent')
  made['answeredRun'] = answeredRun.id
  made['declinedRun'] = declinedRun.id
  made['waitingRun'] = waitingRun.id

  agents.claimRun(answeredRun.id, 'worker-a', null, { type: 'agent', id: 'mole-office-agent-worker', provedBy: 'the-office-key' })
  agents.finishRun(answeredRun.id, {
    result: { says: 'Measured again at effort 13 with the new pads. The figure stands.', focus: { record: gripper.id } },
    tookMs: 4200,
  })
  // A DECLINE IS NOT A FAILURE. A worker looked at this and could not serve it — the agent it names
  // can only be picked up where its transcript lives — so the run goes back to waiting with the
  // reason on it. That is the one run in this archive carrying an `error` and no result.
  agents.claimRun(declinedRun.id, 'worker-b', null, { type: 'agent', id: 'mole-office-agent-worker', provedBy: 'the-office-key' })
  agents.finishRun(declinedRun.id, {
    declined: true,
    error: 'That conversation is on another machine, so this worker cannot pick it up.',
  })

  // A conversation nothing was ever sent from, so the archive holds an open thread, a comment
  // nobody addressed, and a run table that says nothing about either.
  const direct = agents.createThread(
    { workspaceId: 'default', title: 'A question about the gripper pads', mode: 'direct' },
    HUMAN,
  )
  made['direct'] = direct.id
  agents.addMessage(
    direct.id,
    'default',
    {
      intent: 'discuss',
      body: 'Are these the days you meant, or was that the week before?',
      context: { target: { kind: 'scheduleBlock', windowId: missed.id } },
    },
    HUMAN,
  )

  // ---- two reviews: one that has finished collecting and one that is still collecting
  //
  // BOTH SHAPES, because the table has two and only one of them is interesting to get wrong. A
  // review that has finished collecting stores `frozen` — the membership as it stood at that
  // moment — and a `collectedAt`; one still collecting stores null in both. Null there means
  // "nobody has finished collecting", which is a different fact from a review that collected
  // nothing, and a format that wrote `[]` for null would turn one into the other.
  const reviews = (await import('../src/server/lib/reviews.ts')) as typeof import('../src/server/lib/reviews.ts')
  const onTheModule = reviews.startReview(
    { workspaceId: 'default', entry: { target: { kind: 'record', recordId: gripper.id, workspaceId: 'default' } } },
    HUMAN,
  )
  made['review'] = onTheModule.review.id
  const remark = t.api.createRecord({
    workspaceId: 'default',
    kind: 'annotation',
    title: 'A remark on the gripper module',
    data: {
      body: 'This effort number does not match the one in the run log. Which was measured?',
      context: { target: { kind: 'record', recordId: gripper.id, workspaceId: 'default' } },
    },
    actor: HUMAN,
  })
  made['remark'] = remark.id
  const frozen = reviews.finishCollecting(onTheModule.review.id, 'default', HUMAN)
  if (!frozen.members.some((m) => m.found && m.id === remark.id)) {
    throw new Error(
      `the remark ${remark.id} is not in the review that was collecting where it was written, so the frozen ` +
        'membership in this corpus is empty and nothing about it can be compared.',
    )
  }
  const stillCollecting = reviews.startReview(
    // ASKED FOR AND NOT ARRIVED AT. A page names no place, so a review OF ONE PLACE cannot be
    // started from one and `startReview` refuses; a project-wide review can, and that is what a
    // review started from a page always was.
    { workspaceId: 'default', entry: { target: { kind: 'page', route: '/records' } }, reach: 'global' },
    HUMAN,
  )
  made['collecting'] = stillCollecting.review.id

  // ---- the six authored tables round ten added, with raw SQL, because nothing writes them yet
  //
  // RAW SQL AND NOT A PRODUCT CALL, for the reason the resource ledger above gives for itself: there
  // is no route to call. These tables were created by one migration and the waves that write them
  // are not built. The rows are still worth having HERE and nowhere else, because this file is the
  // one that proves the FORMAT: that every authored row leaves the database, lands in the archive and
  // comes back exactly. A table with no rows passes that comparison by having nothing to compare, and
  // `work_windows` spent a day out of every backup in exactly that way.
  //
  // WHEN A ROUTE EXISTS, these become product calls like everything above, and the values stop being
  // invented. Until then they are shaped like real rows on purpose: a repository with no checkout on
  // this machine, a relationship an agent guessed that nobody has accepted, an observation from a
  // scan that had nothing to compare against, a re-check nobody has answered, and a comment whose
  // words went out before Mole Office kept a word for it.
  const raw = t.client.sqlite
  raw
    .prepare('INSERT INTO repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run('repo-panelx', 'default', 'panelx', 'The checkout this server is pointed at.', `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`, '2026-08-20 09:15:00', '2026-08-20 09:15:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
  // A second one with NO root: named, and there is no checkout of it on this machine. Null there is
  // a real answer and it is the value a careless restore is most likely to fill in.
  raw
    .prepare('INSERT INTO repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run('repo-calibration', 'default', 'calibration', null, null, '2026-08-20 09:16:00', '2026-08-20 09:16:00', 'agent:claude-code')
  raw
    .prepare('INSERT INTO implementation_revisions (id, workspace_id, repository_id, ref, label, note, stated_at, stated_by) VALUES (?,?,?,?,?,?,?,?)')
    .run('irev-1', 'default', 'repo-panelx', '4d82b53', 'R42', 'The revision the gripper figure was measured against.', '2026-08-20 09:20:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
  raw
    .prepare(
      `INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note,
         revision_id, stated_at, stated_by, accepted_at, accepted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('imap-1', 'default', gripper.id, 'repo-panelx', 'src/server/lib/sourceindex.ts', 'implements', 'declared', 'The scanner this module is about.', 'irev-1', '2026-08-20 09:21:00', `human:${THE_TEST_OFFICES_OWNER.id}`, null, null, null)
  // The same pattern, guessed rather than stated, and NOT accepted. Two rows about one pattern is
  // what `provenance` being in the unique index is for: a person's statement and an agent's guess
  // coexist and neither overwrites the other, so an archive that merged them would lose an answer.
  raw
    .prepare(
      `INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note,
         revision_id, stated_at, stated_by, accepted_at, accepted_by, deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('imap-2', 'default', gripper.id, 'repo-panelx', 'src/server/lib/sourceindex.ts', 'implements', 'llm', null, null, '2026-08-20 09:22:00', 'agent:claude-code', null, null, null)
  raw
    .prepare(
      `INSERT INTO file_observations (id, workspace_id, scan_id, repository_id, path, change, hash, seen_at, since, first_scan)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('fobs-1', 'default', 'scan-1', 'repo-panelx', 'src/server/lib/sourceindex.ts', 'changed', 'a3f1c0de', '2026-08-20 10:00:00', '2026-08-19 18:00:00', 0)
  // The first scan of a repository: everything reads as added, which is true and is not a day's
  // work. `first_scan` is what says so, and `since` is null because there was nothing to compare to.
  raw
    .prepare(
      `INSERT INTO file_observations (id, workspace_id, scan_id, repository_id, path, change, hash, seen_at, since, first_scan)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('fobs-2', 'default', 'scan-0', null, 'src/server/db/schema.ts', 'added', 'b17e00d1', '2026-08-19 18:00:00', null, 1)
  raw
    .prepare(
      `INSERT INTO revalidations (id, workspace_id, restriction_id, record_id, reached_by, distance, written_by, at,
         state, decided_by, call_id, decided_at, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('reval-1', 'default', noted.id, gripper.id, JSON.stringify([{ linkId: 'lnk-1', type: 'discusses', recordId: gripper.id }]), 1, 'resolution', '2026-08-20 11:00:00', 'needs_review', null, null, null, null)
  // One somebody has answered, so both states are in the archive: what the machine wrote and what a
  // person decided are different facts and only one of them can be recomputed.
  raw
    .prepare(
      `INSERT INTO revalidations (id, workspace_id, restriction_id, record_id, reached_by, distance, written_by, at,
         state, decided_by, call_id, decided_at, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('reval-2', 'default', noted.id, noted.id, JSON.stringify([]), 0, 'judgement', '2026-08-20 11:01:00', 'not_affected', THE_TEST_OFFICES_OWNER.id, null, '2026-08-21 08:30:00', 'The pads never came into this one.')
  raw
    .prepare('INSERT INTO annotation_words_fixed (annotation_id, fixed_at, because) VALUES (?,?,?)')
    .run(
      remark.id,
      '2026-08-20 12:00:00',
      'These words had already gone to somebody when Mole Office stopped storing a word for it, and no conversation ' +
        'recorded which comment they came from.',
    )

  // A READING OF SOMEBODY ELSE'S FOLDER, with one piece already accepted, so `folder_readings` has a
  // row for the restore to prove. A draft holds both what an agent proposed and what a person
  // decided about each piece, and the decisions are written down nowhere else: an archive that
  // brought back the pieces without them would put a person in front of choices they had made.
  const folderLib = await import('../src/server/lib/folderreading.ts')
  const readInto = folderLib.fileAFolderReading({
    workspaceId: 'default',
    actorId: 'roundtrip-a',
    actorKind: 'agent',
    folder: '/somewhere/a-folder-somebody-else-keeps',
    note: 'Read so the archive has a reading to carry.',
    couldNotTell: [{ what: 'Who wrote it', because: 'No file in the folder names anybody.' }],
    pieces: [
      {
        kind: 'note',
        title: 'The folder holds a script and a guide to it',
        summary: 'What the guide says it is for.',
        data: {},
        from: ['GUIDE.md'],
        quote: 'This folder holds one script and a guide to running it.',
      },
    ],
  })
  const onePiece = (readInto.pieces as { id: string; state: string; recordId: string | null; decidedAt: string | null; decidedBy: string | null }[])[0]
  if (onePiece === undefined) throw new Error('the folder reading was stored with no pieces')
  const fromThePiece = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'The folder holds a script and a guide to it',
    data: { source: `${readInto.folder} — accepted from folder reading ${readInto.id}` },
    actor: HUMAN,
  })
  onePiece.state = 'accepted'
  onePiece.recordId = fromThePiece.id
  onePiece.decidedAt = '2026-09-06 01:00:00'
  onePiece.decidedBy = THE_PERSON
  const schemaForReadings = await import('../src/server/db/schema.ts')
  const drizzleForReadings = await import('drizzle-orm')
  const clientForReadings = await import('../src/server/db/client.ts')
  clientForReadings.db
    .update(schemaForReadings.folderReadings)
    .set({ pieces: readInto.pieces, updatedAt: '2026-09-06 01:00:00' })
    .where(drizzleForReadings.eq(schemaForReadings.folderReadings.id, readInto.id))
    .run()

  // ---- an agent whose registry id is not its handle, so the archive, the import and the restore
  //      all have to carry the id rather than reading the handle as one.
  insertAgent(t, MINTED_AGENT)
}

// -------------------------------------------------------------------------------- comparing

/** The two columns the format deliberately never carries, by their SQL names. */
const MACHINE_COLUMNS = new Set(['pgid', 'os_started_at'])

/**
 * Columns whose stored text is a JSON document, compared parsed so key order cannot fail a test.
 *
 * NAMED `table.column`, AND THAT IS NOT TIDINESS. This was a set of bare column names — `data`,
 * `layout`, `intent` — and `agent_messages.intent` is a WORD, one of ask, discuss, review, change or
 * start. The moment that table had a row this test threw `"review" is not valid JSON` out of the
 * comparison, on 18 August 2026, and a set keyed by bare name would go on colliding with the next
 * table that reuses one of these three names.
 *
 * `agent_runs.request` and `agent_runs.result` are deliberately NOT here. Both are documents, and
 * both round-trip as the exact bytes: the product writes them compact, the archive pretty-prints on
 * the way out, and the importer writes compact again from the same key order. Comparing them as text
 * is the stricter test and it is the one that holds.
 */
const JSON_COLUMNS = new Set(['records.data', 'presentation_intent.intent'])

/**
 * Every table an archive carries, of one database, as comparable values. `panel_layouts` is authored
 * and carried by no archive, so it is not here; a test below says what a
 * restore leaves in it.
 *
 * `data` and the two other JSON columns are parsed, because key order is not meaning. With
 * `clearedColumns`, the source snapshot expects the copy's removal marks. The restored side keeps
 * its actual values. Stamps stay as stored: they are local wall-clock strings.
 */
function snapshot(t: TestDb, opts: { machineColumns: boolean; clearedColumns?: boolean }): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const table of ARCHIVED_TABLES) {
    const rows = (t.client.sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]).map((raw) => {
      const row: Record<string, unknown> = {}
      for (const [column, value] of Object.entries(raw)) {
        if (!opts.machineColumns && MACHINE_COLUMNS.has(column)) continue
        if (opts.clearedColumns && COLUMNS_A_COPY_CLEARS.some((cleared) => cleared.table === table && cleared.column === column)) {
          row[column] = REMOVED_MARK + String(raw['id'])
          continue
        }
        row[column] =
          JSON_COLUMNS.has(`${table}.${column}`) && typeof value === 'string' ? (JSON.parse(value) as unknown) : value
      }
      return row
    })
    out[table] = rows.map((row) => JSON.stringify(row, Object.keys(row).sort())).sort()
  }
  return out
}

/** Every file under a directory, as text, keyed by its path relative to the root. */
function files(root: string): Map<string, string> {
  const out = new Map<string, string>()
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else out.set(relative(root, full).split(sep).join('/'), readFileSync(full, 'utf8'))
    }
  }
  visit(root)
  return out
}

beforeAll(async () => {
  archive = mkdtempSync(join(tmpdir(), 'mole-office-archive-'))
  archiveWithoutAids = mkdtempSync(join(tmpdir(), 'mole-office-archive-bare-'))
  reexport = mkdtempSync(join(tmpdir(), 'mole-office-reexport-'))

  // ---- the source database, and the archive taken from it
  source = await freshDb()
  const exportLib = (await import('../src/server/lib/export.ts')) as ExportLib
  await seed(source)
  // A drawn face as the re-mint leaves it: its key names the minted id, and it is drawn from the id the agent had before.
  const { theDigestADrawingIsMadeOf } = await import('../src/server/lib/avatar-drawing.ts')
  const planted = source.client.sqlite
    .prepare('UPDATE assets SET drawn_from = ? WHERE id = ?')
    .run(theDigestADrawingIsMadeOf({ kind: 'agent', id: EARLIER_ID }), `avatar-default-agent-${MINTED_AGENT.id}`)
  if (planted.changes !== 1) throw new Error('the minted agent has no drawn face to plant a digest on')
  // Made-up non-default choices prove that both columns survive, rather than matching null defaults.
  source.client.sqlite.prepare('UPDATE installation SET dead_letter_after_days = 2, dead_letter_after_count = 30 WHERE only_row = 1').run()
  // Made-up runtime choices and an explicit grant must survive both imports.
  source.client.sqlite.prepare('INSERT INTO runtime_settings (name,value) VALUES (?,?)').run('MOLE_OFFICE_REPLY_REMINDER_MINUTES','9')
  source.client.sqlite.prepare('INSERT INTO office_restart_grants (agent_id,decision_id) VALUES (?,?)').run(made['agent'], source.api.createRecord({kind:'decision',title:'Made-up restart permission',data:{replaces:[]},workspaceId:'default',actor:HUMAN,origin:'fixture'}).id)
  const legacy = source.api.createRecord({ kind: 'session', title: 'Synthetic legacy archive inventory', data: { state: 'finished' }, workspaceId: 'default', actor: { type: 'agent', id: 'archive-fixture' }, origin: 'fixture' })
  source.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(legacy.id)
  exportLib.writeExport(archive)

  cpSync(archive, archiveWithoutAids, { recursive: true })
  rmSync(join(archiveWithoutAids, 'README.md'))
  rmSync(join(archiveWithoutAids, 'INDEX.md'))

  // ---- an empty database, restored from the archive, then re-exported and imported again
  restored = await freshDb()
  restoredOwn = restored.client.sqlite.prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE id = ?').get(theOfficesOwnId(restored)) as { id: string; avatar: string }
  const importLib = (await import('../src/server/lib/import.ts')) as ImportLib
  firstReport = importLib.applyImport(archive)
  secondReport = importLib.applyImport(archive)
  const restoredExport = (await import('../src/server/lib/export.ts')) as ExportLib
  restoredExport.writeExport(reexport)

  // ---- a second empty database, restored from the archive with both reading aids deleted
  aided = await freshDb()
  const aidedImport = (await import('../src/server/lib/import.ts')) as ImportLib
  aidedImport.applyImport(archiveWithoutAids)
})

afterAll(() => {
  for (const dir of [archive, archiveWithoutAids, reexport]) rmSync(dir, { recursive: true, force: true })
  aided.close()
  restored.close()
  source.close()
})

// ================================================================================ it restored

describe('an empty database restored from the archive is the database the archive came from', () => {
  it('applied, in one transaction, and said so', () => {
    expect(firstReport.applied).toBe(true)
    expect(firstReport.ok).toBe(true)
    expect(firstReport.refusals).toEqual([])
  })

  it('carries every authored row, with cleared token hashes and all other values equal', () => {
    // Compare every table. Only the source side expects removal marks; the restored values must
    // match them. Machine columns are excluded here and asserted separately below.
    expect(snapshot(restored, { machineColumns: false })).toEqual(snapshot(source, { machineColumns: false, clearedColumns: true }))
  })

  it('restored every table an archive carries, including the ones the seeded corpus leaves empty', () => {
    for (const table of ARCHIVED_TABLES) {
      const rows = restored.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
      expect(rows.n, `${table} came back empty, so this restore proves nothing about it`).toBeGreaterThan(0)
    }
  })

  // This test cites a decision.
  it('brings back no panel_layouts row, because no archive carries that table', () => {
    const count = (t: TestDb): number => (t.client.sqlite.prepare('SELECT count(*) AS n FROM panel_layouts').get() as { n: number }).n
    expect(count(source), 'the source held no layout, so this proves nothing').toBe(1)
    expect(count(restored)).toBe(0)
  })

  it('keeps an agent whose id differs from its handle, under its id', () => {
    // The archive heads and orders agents by id and writes the handle in the block; the importer
    // matches on id. A restore that matched on handle, or that read the handle as the id, would put
    // this row somewhere else or lose it.
    const page = readFileSync(join(archive, 'participants.md'), 'utf8')
    expect(page, 'the archive heads the agent by its registry id').toContain(`### ${MINTED_AGENT.id} — ${MINTED_AGENT.name}`)
    expect(page, 'the handle is still written inside the agent block').toContain(`handle: "${MINTED_AGENT.handle}"`)
    const row = restored.client.sqlite.prepare('SELECT id, handle, name FROM agents WHERE id = ?').get(MINTED_AGENT.id) as
      | { id: string; handle: string; name: string }
      | undefined
    expect(row).toEqual(MINTED_AGENT)
    const byHandle = restored.client.sqlite.prepare('SELECT count(*) AS n FROM agents WHERE handle = ?').get(MINTED_AGENT.handle) as { n: number }
    expect(byHandle.n, 'the minted id is the identity and the handle is not a second row').toBe(1)
  })

  it('keeps what a drawn face is drawn from, so a face the re-mint renamed sends the same bytes as before the export', async () => {
    const { drawDefaultAvatar, whatAnAssetRowSends } = await import('../src/server/lib/avatar-drawing.ts')
    const face = `avatar-default-agent-${MINTED_AGENT.id}`
    const read = (t: TestDb) => {
      const row = t.client.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(face) as Record<string, unknown> | undefined
      return { drawnFrom: row?.['drawn_from'], sent: whatAnAssetRowSends(row, face, dirname(t.file)) }
    }
    const [before, after] = [read(source), read(restored)]
    expect(after.drawnFrom, 'the round trip lost what the face is drawn from').toBe(before.drawnFrom)
    expect(after.sent).toEqual(before.sent)
    const earlier = drawDefaultAvatar({ kind: 'agent', id: EARLIER_ID })
    expect(before.sent).toMatchObject({ drawing: earlier })
    expect(earlier, 'the earlier id and the minted id draw the same face, so this proves nothing').not.toBe(drawDefaultAvatar({ kind: 'agent', id: MINTED_AGENT.id }))
  })

  it('brought back the soft-deleted record, and its deletion stamp', () => {
    const row = restored.client.sqlite.prepare('SELECT title, deleted_at FROM records WHERE id = ?').get(made['deleted']) as
      | { title: string; deletedAt?: string; deleted_at: string | null }
      | undefined
    expect(row?.title).toBe('A claim that was withdrawn')
    expect(row?.deleted_at, 'a soft-deleted record is not an absence in Mole Office; the stamp is what makes it recoverable').not.toBeNull()
  })

  it('brought back the block title, the Chinese title and the embedded newline', () => {
    const titles = (restored.client.sqlite.prepare('SELECT title FROM records').all() as { title: string }[]).map((r) => r.title)
    expect(titles).toContain('Sense the pot')
    expect(titles).toContain('夹具标定')
    const note = restored.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(made['note']) as { data: string }
    expect((JSON.parse(note.data) as { body: string }).body).toBe('first line\nsecond line')
  })

  it('brought back the inferred flag as a boolean, not as a human assertion', () => {
    // A quarter of the corpus's links are inferred. An import that lost the flag would turn
    // Mole Office's own guess into something a person said, and the record page draws the two
    // differently and says so.
    const inferred = restored.client.sqlite.prepare('SELECT count(*) AS n FROM links WHERE inferred = 1').get() as { n: number }
    expect(inferred.n).toBe(1)
  })

  it('brought back all three gate states, and NULL is one of them', () => {
    const gates = (restored.client.sqlite.prepare('SELECT gate, gate_up_to FROM links ORDER BY gate').all() as
      { gate: string | null; gate_up_to: string | null }[])
    // Three: the `implements` link, the `discusses` link, and the `about` link from the task a
    // counter filed when it fired to the counter that filed it (criterion CT4). None of the three is
    // a dependency at all, so none of them carries a gate.
    // AND ONE MORE FOR EACH RUN SINCE 4 OCTOBER 2026: the office files a flow run beside every run, linked `about` it
    // (wave 1 of the office flow, M1), and that link is not a dependency either.
    const flowRuns = (restored.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow_run'").get() as { n: number }).n
    const runs = (restored.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
    expect(flowRuns, 'every run came back with its flow run').toBe(runs)
    expect(gates.filter((g) => g.gate === null).length, 'NULL means nobody said how hard, and reading it as hard makes doable work look stuck').toBe(3 + flowRuns)
    expect(gates.filter((g) => g.gate === 'hard' && g.gate_up_to === null).length).toBe(1)
    expect(gates.filter((g) => g.gate === 'partial' && g.gate_up_to === made['block']).length).toBe(1)
  })

  it('brought back the pipeline\'s blockIds, which is the only statement of membership and order', () => {
    const row = restored.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(made['pipeline']) as { data: string }
    expect((JSON.parse(row.data) as { blockIds: string[] }).blockIds).toEqual([made['block'], made['block2']])
  })
})

// ================================================================================ machine columns

describe('the machine columns are absent on the restored side, and the test says so out loud', () => {
  it('writes pgid and os_started_at as NULL on every restored ledger row', () => {
    const rows = restored.client.sqlite.prepare('SELECT id, pgid, os_started_at FROM session_resources ORDER BY id').all() as
      { id: string; pgid: number | null; os_started_at: string | null }[]
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row.pgid, `${row.id} came back carrying a pgid — a pid is meaningless after a reboot`).toBeNull()
      expect(row.os_started_at, `${row.id} came back carrying an os_started_at, which is the anti-reuse anchor`).toBeNull()
    }
  })

  it('and the source really had them, so the assertion above is not vacuous', () => {
    const rows = source.client.sqlite.prepare('SELECT pgid, os_started_at FROM session_resources ORDER BY id').all() as
      { pgid: number | null; os_started_at: string | null }[]
    expect(rows.every((r) => r.pgid !== null && r.os_started_at !== null)).toBe(true)
  })

  it('keeps every authored ledger column, including who released it and what they said', () => {
    const released = restored.client.sqlite
      .prepare('SELECT released_by, release_note, detail, registered_by FROM session_resources WHERE id = ?')
      .get('res-1') as { released_by: string; release_note: string; detail: string; registered_by: string }
    expect(released).toEqual({
      released_by: `human:${THE_TEST_OFFICES_OWNER.id}`,
      release_note: 'killed by process group',
      detail: 'the audit server',
      registered_by: 'agent:claude-code',
    })
  })

  it('says in words how many still-held rows it restored, because the ledger now describes a machine that may be gone', () => {
    const said = firstReport.notes.filter((n) => n.includes('still showing as HELD'))
    expect(one(said, 'note about restored held rows')).toContain('1 resource-ledger row')
  })
})

// ================================================================================ idempotency

describe('importing the same text twice leaves the same database', () => {
  it('changes nothing the second time', () => {
    const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
    expect(total(secondReport.inserts), 'the second import inserted rows, so the first one did not finish').toBe(0)
    expect(total(secondReport.updates), 'the second import updated rows, so a value is not surviving the round trip').toBe(0)
    // Everything the first run WROTE OR RECOGNISED, not just what it inserted. The `default`
    // workspace row is in the target database before either import runs — `migrateInPlace`
    // declares it, because a database that has records and no workspace is a state no route will
    // answer for — so the archive's copy of it is `unchanged` on the first pass as well as the
    // second. Comparing against inserts alone would fail for the one row that was already right.
    expect(total(secondReport.unchanged)).toBe(
      total(firstReport.inserts) + total(firstReport.unchanged) + total(firstReport.updates),
    )
  })

  it('and the first import really did all the work, so that is not a comparison of two zeroes', () => {
    const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
    expect(total(firstReport.inserts)).toBeGreaterThan(20)
    // NOT `total(updates) === 0`, which was FLAKY and was caught by running the suite seven times
    // rather than by reading it. `migrateInPlace` declares the `default` workspace in BOTH
    // databases, each stamped with the second it ran in, so the archive's copy of that row is an
    // update whenever the two migrations straddled a second boundary and unchanged when they did
    // not. The claim worth making is the stronger one anyway: restoring into an empty database
    // updates nothing that carries work, because an update there would mean a value did not
    // survive the round trip.
    for (const [table, n] of Object.entries(firstReport.updates)) {
      // Every table a migration fills itself is exempt for the reason above and for no other. Read
      // from the schema, so the owner's row and the picture drawn for it — both written by
      // `migrateParticipants` and both stamped with the second it ran in — are covered by the same
      // argument the `default` workspace is, rather than by a second exemption typed here.
      if ((MIGRATION_DECLARED_TABLES as readonly string[]).includes(table)) continue
      expect(n, `${table} was UPDATED by a restore into an empty database, so a value did not round-trip`).toBe(0)
    }
    // TWO ROWS, EACH STAMPED WITH THE SECOND ITS MIGRATION RAN IN: the `default` workspace and, since a decision,
    // the message centre's row, which the move into the message centre writes.
    expect(firstReport.updates['workspaces'] ?? 0).toBeLessThanOrEqual(2)
  })

  it('exports byte-identically from the restored database', () => {
    // The strongest statement available: export → import → export is a fixed point, file by file
    // and byte by byte. If any value were normalised on the way in — a stamp, a key order, a
    // boolean — this is where it would show.
    const before = files(archive)
    const after = files(reexport)
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort())
    for (const [path, text] of before) {
      expect(after.get(path), `${path} differs after a round trip`).toBe(text)
    }
  })
})

// ================================================================================ the reading aids

describe('README.md and INDEX.md carry nothing, and deleting them proves it', () => {
  it('produces exactly the same database without them', () => {
    // FORMAT.md §6: both are derived from the record files, so they are a second statement of facts
    // already written down — the defect this codebase keeps finding — and the fence against it is
    // this test rather than care.
    expect(snapshot(aided, { machineColumns: true })).toEqual(snapshot(restored, { machineColumns: true }))
  })

  it('and both files really were there to delete', () => {
    expect(statSync(join(archive, 'README.md')).size).toBeGreaterThan(0)
    expect(statSync(join(archive, 'INDEX.md')).size).toBeGreaterThan(0)
  })
})

// ================================================================================ what it reported

describe('the report says what happened rather than leaving it to be discovered', () => {
  it('names the state word nobody has classified, and imported the record anyway', () => {
    const said = one(firstReport.notes.filter((n) => n.includes('nobody has classified')), 'note about unclassified states')
    expect(said).toContain('chasing')
    const stored = restored.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(made['parked']) as { data: string }
    expect((JSON.parse(stored.data) as { state: string }).state).toBe('chasing')
  })

  it('counts every row it wrote, per table, and every row it left alone', () => {
    for (const table of ARCHIVED_TABLES) {
      expect(firstReport.read[table], `${table} was not counted in the report`).toBeGreaterThan(0)
      // EVERY ROW READ IS ACCOUNTED FOR, as an insert or as a row that was already exactly right.
      // `workspaces` is the one table where the second is not zero on a fresh restore: the target
      // database is migrated before the import runs, and migrating declares the default workspace,
      // so the archive's copy of that row matches what is already there. Asserting inserts alone
      // would have made "the importer silently skipped a table" and "one row was already correct"
      // the same failure.
      expect(
        (firstReport.inserts[table] ?? 0) + (firstReport.unchanged[table] ?? 0) + (firstReport.updates[table] ?? 0),
      ).toBe(firstReport.read[table])
      expect(firstReport.notInArchive[table], 'an empty database has nothing the archive does not mention').toBe(0)
    }
  })

  it('names every row it would change, with the file it came from', () => {
    const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
    // THE RESTORED OFFICE'S OWN ROW AND ITS PICTURE ARE THE ONLY ROWS DELETED. That office drew its own row when it was
    // migrated, and the archive carries the source's, so the restore deletes the first two to make way for the third.
    const deleted = firstReport.rows.filter((row) => row.action === 'delete')
    expect(deleted.map((row) => `${row.region} ${row.key}`).sort()).toEqual([`agents ${restoredOwn.id}`, `assets ${restoredOwn.avatar}`].sort())
    expect(firstReport.rows.length).toBe(total(firstReport.inserts) + total(firstReport.updates) + deleted.length)
    for (const row of firstReport.rows) {
      // A deleted row has no file behind it, because nobody typed it into an archive. The two are checked above.
      if (row.action === 'delete') continue
      // Restoring into an empty database is all inserts, except in the tables a migration fills
      // itself: the `default` workspace, the owner's own row and the picture drawn for it.
      // `migrateInPlace` writes all three in the target before the import runs — a database with
      // records and no workspace is a state no route will answer for, and a database with no owner
      // is one nothing can be addressed to — so the archive's copies meet rows that are already
      // there. Whether a `createdAt` differs comes down to whether the two databases happened to be
      // migrated in the same second, so this states both outcomes instead of depending on the clock.
      // READ FROM `MIGRATION_DECLARED_TABLES` rather than named, so the next such table is covered
      // the day it is declared instead of turning this red for the right reason and the wrong one.
      if ((MIGRATION_DECLARED_TABLES as readonly string[]).includes(row.region)) {
        expect(['insert', 'update']).toContain(row.action)
      } else expect(row.action).toBe('insert')
      expect(row.path, 'a row with no file behind it cannot be checked by a person').not.toBe('')
    }
  })
})
