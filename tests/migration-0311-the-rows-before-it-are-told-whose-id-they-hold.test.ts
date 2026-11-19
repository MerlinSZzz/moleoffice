// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0311 TELLS THE ROWS WRITTEN BEFORE IT WHOSE ID THEY HOLD, WHERE THE REGISTRIES OR THE CONVERSATION SAY IT,
 * LEAVES EVERY OTHER ROW WITHOUT A KIND, WRITES NOTHING ELSE, AND DOES IT ONCE. Wave 13s round 155, item 30c part 3.
 *
 * 0311 adds a kind column, `person` or `agent`, beside four columns that hold the id of whoever did a thing. The data
 * step in src/server/db/kinds-beside-ids-migration.ts fills it for the rows already there. Here a database is built
 * from the migrations before 0311, made-up rows of every shape that matters are written into it, and then every
 * migration is applied:
 *
 *   - folder_readings.read_by, folder_readings.owner_id and revalidations.decided_by: an id or a handle in the people
 *     registry is told `person`; one in the agent registry, or an alias there, is told `agent`; one in both, or in
 *     neither, is left without a kind; a decided_by that holds nothing is left as it is and is not counted;
 *   - conversation_reads.as_side on a read of a conversation between two agents: `agent` when the side is one of the
 *     pair's two ids, registered or not; a side that is not one of them, or a pair that is not two ids, is left without
 *     a kind;
 *   - conversation_reads.as_side on a read of a group: the kind of that group's member rows with that id, left or not,
 *     when they all say one kind; a member with a person's row and an agent's row is left without a kind;
 *   - a read of a group as a side that no member row has: the row's own reader kind when the side is its reader, and
 *     otherwise the group's opener kind when the side is its opener, each only when that kind is `person` or `agent`
 *     and the id is not in both registries; any other side is left without a kind. The office does not write a read as
 *     its own reader to a group it is not in; the made-up office of tests/the-office-at-the-live-scale.ts does;
 *   - a read as neither side is left without a kind, and is not counted;
 *   - no other column of any table changes;
 *   - a later run of the migrations, which does not apply 0311, tells nothing, not even a row written since.
 *
 * The census that counts a row left without a kind is tested in tests/registry-alias-classified-id-columns.test.ts. It
 * is not taken here, because it loads src/server/lib/messages.ts, which opens the office's database.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/migration-0311-the-rows-before-it-are-told-whose-id-they-hold.test.ts
 * After a green control, copy src/server/db/kinds-beside-ids-migration.ts, then:
 *   1. in `theRegistryOf`, return `person ? 'person' : agent ? 'agent' : null`: an id in both registries is told
 *      `person`, and the first case goes red;
 *   2. put `true` in place of `theTwoSides(read.pair)?.includes(read.side) === true`: a side that is not one of the
 *      pair's ids is told `agent`, and the first case goes red;
 *   3. put `kinds[0]` in place of `kinds.length === 1 ? kinds[0] : undefined`: a member with two kinds is told one, and
 *      the first case goes red;
 *   4. under `report.ran = true`, add `sqlite.prepare("UPDATE folder_readings SET note = 'changed'").run()`: another
 *      column changes, and the second case goes red;
 *   5. in the line that returns when `applied` does not hold 0311, add before `) return report`:
 *      `&& sqlite.prepare("SELECT 1 FROM pragma_table_info('folder_readings') WHERE name = 'read_by_kind'").get() === undefined`.
 *      The step then runs whenever the columns are there, a later run tells a row written since, and the third case goes
 *      red. Deleting the line instead turns every case red, because the runs before 0311 then ask for its columns.
 *   6. put `false` in place of `read.side === read.reader`, which drops the reader's rule: the fourth case goes red;
 *   7. put `false` in place of `read.side === opener?.id`, which drops the opener's rule: the fifth case goes red;
 *   8. put `false` in place of `inBoth(read.side)`: an id in both registries is told, and the fourth and fifth cases go
 *      red;
 *   9. put `true` in place of `kinds.length === 0`: a side with member rows of two kinds is told by the reader or the
 *      opener, and the fourth and fifth cases go red.
 * Restore the file with cp after each, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up.
 */
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { THE_MIGRATION } from '../src/server/db/kinds-beside-ids-migration.ts'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { conversationReads, folderReadings, revalidations } from '../src/server/db/schema.ts'
import { NEITHER_SIDE } from '../src/shared/messages.ts'
import type { ParticipantKind } from '../src/shared/participants.ts'
import { MIGRATIONS, journal, partialMigrations, scratch } from './migration-fixtures.ts'

/** Found by its name, not its number, so a renumber is only the file name and the journal line. */
const TAG = journal(MIGRATIONS).find((entry) => entry.tag.endsWith('_four_ids_have_a_kind_beside_them'))?.tag
const INDEX = journal(MIGRATIONS).findIndex((entry) => entry.tag === TAG)
const THE_JOURNAL = '__drizzle_migrations'
const AT = '2026-10-01 09:00:00'
const PROJECT = 'default'

const READ_BY_KIND = folderReadings.readByKind.name
const OWNER_KIND = folderReadings.ownerKind.name
const DECIDED_BY_KIND = revalidations.decidedByKind.name
const AS_SIDE_KIND = conversationReads.asSideKind.name

/** The registries. The second person's id is the third agent's handle, so that name is in both. */
const A_PERSON = { id: 'a-made-up-person', handle: 'a-made-up-persons-handle' }
const IN_BOTH = 'a-made-up-name-in-both'
const A_SECOND_PERSON = { id: IN_BOTH, handle: 'a-second-made-up-persons-handle' }
const AN_AGENT = { id: 'MadeUpAgent1', handle: 'a-made-up-agents-handle' }
const A_TARGET = { id: 'MadeUpTarget', handle: 'a-made-up-targets-handle' }
const A_THIRD_AGENT = { id: 'MadeUpAgent3', handle: IN_BOTH }
const AN_OLD_ID = 'an-old-made-up-agent-id'
const NOBODY = 'nobody-registered-has-this'

const PAIR = `${AN_AGENT.id}~another-made-up-agent`
const GROUP = 'aMadeUpGrp12'
const TWO_KINDS = 'a-member-with-two-kinds'

type Kind = ParticipantKind | null

/** Each made-up folder reading: who owns it, who read it, and the kinds each should be told. */
const READINGS: { id: string; owner: string; readBy: string; ownerKind: Kind; readByKind: Kind }[] = [
  { id: 'reading-by-ids', owner: A_PERSON.id, readBy: AN_AGENT.id, ownerKind: 'person', readByKind: 'agent' },
  { id: 'reading-by-handles', owner: A_PERSON.handle, readBy: AN_AGENT.handle, ownerKind: 'person', readByKind: 'agent' },
  { id: 'reading-by-an-alias', owner: NOBODY, readBy: AN_OLD_ID, ownerKind: null, readByKind: 'agent' },
  { id: 'reading-in-both', owner: IN_BOTH, readBy: NOBODY, ownerKind: null, readByKind: null },
]

/** Each made-up judgement: who decided it, and the kind it should be told. */
const JUDGEMENTS: { id: string; decidedBy: string | null; kind: Kind }[] = [
  { id: 'judged-by-a-person', decidedBy: A_PERSON.id, kind: 'person' },
  { id: 'judged-by-an-agent', decidedBy: AN_AGENT.id, kind: 'agent' },
  { id: 'judged-in-both', decidedBy: IN_BOTH, kind: null },
  { id: 'judged-by-nobody-registered', decidedBy: NOBODY, kind: null },
  { id: 'judged-by-nobody', decidedBy: null, kind: null },
]

/** Each made-up read: the conversation, the side it was read as, and the kind it should be told. */
const READS: { id: string; pair: string; side: string; kind: Kind }[] = [
  { id: 'pair-read-as-a-registered-side', pair: PAIR, side: AN_AGENT.id, kind: 'agent' },
  { id: 'pair-read-as-the-other-side', pair: PAIR, side: 'another-made-up-agent', kind: 'agent' },
  { id: 'pair-read-as-no-side-of-it', pair: PAIR, side: A_PERSON.id, kind: null },
  { id: 'pair-read-as-neither', pair: `${A_TARGET.id}~another-made-up-agent`, side: NEITHER_SIDE, kind: null },
  { id: 'pair-that-is-not-two-ids', pair: 'one~two~three', side: 'one', kind: null },
  { id: 'group-read-as-a-person', pair: GROUP, side: A_PERSON.id, kind: 'person' },
  { id: 'group-read-as-a-member-who-left', pair: GROUP, side: AN_AGENT.id, kind: 'agent' },
  { id: 'group-read-as-a-member-who-came-back', pair: GROUP, side: A_TARGET.id, kind: 'agent' },
  { id: 'group-read-as-two-kinds', pair: GROUP, side: TWO_KINDS, kind: null },
  { id: 'group-read-as-no-member', pair: GROUP, side: NOBODY, kind: null },
  { id: 'group-read-as-neither', pair: GROUP, side: NEITHER_SIDE, kind: null },
]

function writeTheMadeUpRows(db: Database.Database): void {
  const asset = db.prepare(
    'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
      "VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
  )
  const person = db.prepare('INSERT INTO people (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const one of [A_PERSON, A_SECOND_PERSON]) {
    asset.run(`avatar-of-${one.id}`, AT)
    person.run(one.id, `Made-up ${one.handle}`, one.handle, `avatar-of-${one.id}`, AT)
  }
  const agent = db.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, ?, ?)')
  for (const one of [AN_AGENT, A_TARGET, A_THIRD_AGENT]) {
    asset.run(`avatar-of-${one.id}`, AT)
    agent.run(one.id, `Made-up ${one.handle}`, one.handle, `avatar-of-${one.id}`, AT)
  }
  db.prepare("INSERT INTO registry_aliases (namespace, alias_id, canonical_id) VALUES ('agent-registry', ?, ?)").run(AN_OLD_ID, A_TARGET.id)

  db.prepare('INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    GROUP, PROJECT, 'A made-up group', 'person', A_PERSON.id, 'A made-up reason', AT,
  )
  const member = db.prepare('INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  member.run('member-a-person', GROUP, 'person', A_PERSON.id, AT, 'opened', null)
  member.run('member-who-left', GROUP, 'agent', AN_AGENT.id, AT, 'added', '2026-10-02 09:00:00')
  member.run('member-who-left-first', GROUP, 'agent', A_TARGET.id, AT, 'added', '2026-10-02 09:00:00')
  member.run('member-who-came-back', GROUP, 'agent', A_TARGET.id, '2026-10-03 09:00:00', 'added', null)
  member.run('member-as-a-person', GROUP, 'person', TWO_KINDS, AT, 'added', null)
  member.run('member-as-an-agent', GROUP, 'agent', TWO_KINDS, AT, 'added', null)

  const reading = db.prepare("INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)")
  for (const one of READINGS) reading.run(one.id, PROJECT, one.owner, `/made/up/${one.id}`, one.readBy, AT, AT)
  const judgement = db.prepare(
    "INSERT INTO revalidations (id, workspace_id, restriction_id, record_id, reached_by, distance, written_by, at, state, decided_by) VALUES (?, ?, ?, ?, '[]', 0, 'judgement', ?, 'checked', ?)",
  )
  for (const one of JUDGEMENTS) judgement.run(one.id, PROJECT, `restriction-of-${one.id}`, `record-of-${one.id}`, AT, one.decidedBy)
  const read = db.prepare("INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, 'person', ?, ?, ?, ?)")
  for (const one of READS) read.run(one.id, PROJECT, `reader-of-${one.id}`, one.pair, one.side, AT)
}

type Row = Record<string, unknown>
const columnsOf = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((one) => one.name)
const theTables = (db: Database.Database): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map((one) => one.name)
    .filter((name) => name !== THE_JOURNAL)
const kindsOf = (db: Database.Database, table: string, column: string): Record<string, unknown> =>
  Object.fromEntries((db.prepare(`SELECT id, "${column}" AS kind FROM "${table}" ORDER BY id`).all() as { id: string; kind: unknown }[]).map((one) => [one.id, one.kind]))

/**
 * EVERY TABLE THAT WAS THERE BEFORE 0311, READ THROUGH THE COLUMNS IT HELD THEN. The four kind columns did not exist
 * before 0311, so they are not read here, and a migration after 0311 may add a table or a column that 0311 did not
 * write. A column that was there before and is gone after still fails, because it reads as undefined.
 */
function throughTheColumnsBefore(db: Database.Database, columns: Record<string, string[]>): Record<string, Row[]> {
  return Object.fromEntries(
    Object.entries(columns).map(([table, these]) => [
      table,
      // Ordered by every column read, because a table kept without a rowid has none to order by.
      db.prepare(`SELECT ${these.map((one) => `"${one}"`).join(', ')} FROM "${table}" ORDER BY ${these.map((_, i) => String(i + 1)).join(', ')}`).all() as Row[],
    ]),
  )
}

/**
 * A database before 0311 with the made-up rows in it, what it held, and the same database after every migration. `more`
 * writes a case's own rows after the shared ones.
 */
function migrateTheMadeUpOffice(more: (db: Database.Database) => void = () => {}): {
  db: Database.Database
  outcome: ReturnType<typeof migrateInPlace>
  before: Record<string, Row[]>
  columnsBefore: Record<string, string[]>
} {
  if (TAG === undefined || INDEX <= 0) throw new Error('drizzle/meta/_journal.json has no migration tagged *_four_ids_have_a_kind_beside_them')
  const s = scratch('kinds-beside-ids')
  const before0311 = partialMigrations(INDEX)
  migrateInPlace(s.db, before0311)
  // THE FIXTURE IS BEFORE 0311, or every case below would be measuring nothing.
  expect(columnsOf(s.db, 'folder_readings')).not.toContain(READ_BY_KIND)
  expect(columnsOf(s.db, 'conversation_reads')).not.toContain(AS_SIDE_KIND)
  writeTheMadeUpRows(s.db)
  more(s.db)
  // THE STEPS THAT RUN ON EVERY START fill some columns of a registry row written straight at the table, such as its
  // home world. They run once more before 0311 here, so what changes after it is the work of the run that applies 0311.
  migrateInPlace(s.db, before0311)
  const columnsBefore = Object.fromEntries(theTables(s.db).map((table) => [table, columnsOf(s.db, table)]))
  const before = throughTheColumnsBefore(s.db, columnsBefore)
  const outcome = migrateInPlace(s.db, MIGRATIONS)
  return { db: s.db, outcome, before, columnsBefore }
}

const byId = <T extends { id: string }>(rows: readonly T[], kind: (row: T) => Kind): Record<string, Kind> =>
  Object.fromEntries(rows.map((row) => [row.id, kind(row)]))
const counted = (kinds: readonly Kind[]) => ({
  person: kinds.filter((one) => one === 'person').length,
  agent: kinds.filter((one) => one === 'agent').length,
  untold: kinds.filter((one) => one === null).length,
})

describe('migration 0311 on an office whose rows hold ids with no kind beside them', () => {
  it('tells each row the registries or its conversation can tell, and leaves every other row without a kind', () => {
    expect(THE_MIGRATION).toBe(TAG)
    const { db, outcome } = migrateTheMadeUpOffice()
    expect(kindsOf(db, 'folder_readings', READ_BY_KIND)).toEqual(byId(READINGS, (one) => one.readByKind))
    expect(kindsOf(db, 'folder_readings', OWNER_KIND)).toEqual(byId(READINGS, (one) => one.ownerKind))
    expect(kindsOf(db, 'revalidations', DECIDED_BY_KIND)).toEqual(byId(JUDGEMENTS, (one) => one.kind))
    expect(kindsOf(db, 'conversation_reads', AS_SIDE_KIND)).toEqual(byId(READS, (one) => one.kind))

    // A DECIDED_BY THAT HOLDS NOTHING AND A READ AS NEITHER SIDE NAME NOBODY, so neither is counted.
    const decided = JUDGEMENTS.filter((one) => one.decidedBy !== null)
    const sides = READS.filter((one) => one.side !== NEITHER_SIDE)
    const report = outcome.kindsBesideIds
    expect(report.ran).toBe(true)
    expect(report.told).toEqual({
      'folder_readings.read_by': counted(READINGS.map((one) => one.readByKind)),
      'folder_readings.owner_id': counted(READINGS.map((one) => one.ownerKind)),
      'revalidations.decided_by': counted(decided.map((one) => one.kind)),
      'conversation_reads.as_side': counted(sides.map((one) => one.kind)),
    })
    expect(report.told['conversation_reads.as_side']).toEqual({ person: 1, agent: 4, untold: 4 })
    const told = [...READINGS.flatMap((one) => [one.readByKind, one.ownerKind]), ...JUDGEMENTS.map((one) => one.kind), ...READS.map((one) => one.kind)]
    expect(report.rowsWritten).toBe(told.filter((one) => one !== null).length)
    expect(report.rowsWritten).toBe(12)
  })

  it('writes nothing but the four kind columns', () => {
    const { db, before, columnsBefore } = migrateTheMadeUpOffice()
    const after = throughTheColumnsBefore(db, columnsBefore)
    for (const table of Object.keys(before)) expect(after[table], table).toEqual(before[table])
    // THE FOUR ARE NEW, and no other column was added to these three tables by 0311.
    for (const [table, added] of [['folder_readings', [READ_BY_KIND, OWNER_KIND]], ['revalidations', [DECIDED_BY_KIND]], ['conversation_reads', [AS_SIDE_KIND]]] as const) {
      expect(columnsOf(db, table).filter((one) => !columnsBefore[table]!.includes(one)), table).toEqual(added)
    }
  })

  it('a later run of the migrations tells nothing, not even a row written since with an id the registries know', () => {
    const { db } = migrateTheMadeUpOffice()
    db.prepare("INSERT INTO folder_readings (id, workspace_id, owner_id, folder, read_by, pieces, created_at, updated_at) VALUES ('reading-since', ?, ?, '/made/up/since', ?, '[]', ?, ?)").run(
      PROJECT, A_PERSON.id, AN_AGENT.id, AT, AT,
    )
    db.prepare("INSERT INTO revalidations (id, workspace_id, restriction_id, record_id, reached_by, distance, written_by, at, state, decided_by) VALUES ('judged-since', ?, 'restriction-since', 'record-since', '[]', 0, 'judgement', ?, 'checked', ?)").run(
      PROJECT, AT, AN_AGENT.id,
    )
    db.prepare("INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES ('read-since', ?, 'person', 'reader-since', ?, ?, ?)").run(
      PROJECT, PAIR, AN_AGENT.id, AT,
    )
    const again = migrateInPlace(db, MIGRATIONS)
    expect(again.kindsBesideIds).toEqual({ ran: false, told: {}, rowsWritten: 0 })
    expect(kindsOf(db, 'folder_readings', READ_BY_KIND)['reading-since']).toBeNull()
    expect(kindsOf(db, 'folder_readings', OWNER_KIND)['reading-since']).toBeNull()
    expect(kindsOf(db, 'revalidations', DECIDED_BY_KIND)['judged-since']).toBeNull()
    expect(kindsOf(db, 'conversation_reads', AS_SIDE_KIND)['read-since']).toBeNull()
  })

  it('tells a group read as its own reader, when no member row has that id, by the kind stored beside the reader', () => {
    const OTHER_GROUP = 'aMadeUpGrp34'
    const BOTH_KINDS = 'a-reader-with-two-member-rows'
    // Each made-up read: who read it and as which kind, the side, and the kind the side should be told. The group was
    // opened by the first made-up person, so no side here is its opener.
    const reads: { id: string; readerKind: string; reader: string; side: string; kind: Kind }[] = [
      { id: 'read-as-its-agent-reader', readerKind: 'agent', reader: 'MadeUpReader', side: 'MadeUpReader', kind: 'agent' },
      { id: 'read-as-its-person-reader', readerKind: 'person', reader: 'a-made-up-reader', side: 'a-made-up-reader', kind: 'person' },
      { id: 'read-as-its-reader-of-no-kind', readerKind: '', reader: 'a-reader-of-no-kind', side: 'a-reader-of-no-kind', kind: null },
      { id: 'read-as-its-reader-in-both', readerKind: 'agent', reader: IN_BOTH, side: IN_BOTH, kind: null },
      { id: 'read-as-its-reader-with-two-kinds', readerKind: 'agent', reader: BOTH_KINDS, side: BOTH_KINDS, kind: null },
      { id: 'read-as-somebody-else', readerKind: 'agent', reader: 'MadeUpReader2', side: 'another-made-up-side', kind: null },
    ]
    const { db, outcome } = migrateTheMadeUpOffice((db) => {
      db.prepare('INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        OTHER_GROUP, PROJECT, 'Another made-up group', 'person', A_PERSON.id, 'A made-up reason', AT,
      )
      const member = db.prepare('INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      member.run('reader-as-a-person', OTHER_GROUP, 'person', BOTH_KINDS, AT, 'added', null)
      member.run('reader-as-an-agent', OTHER_GROUP, 'agent', BOTH_KINDS, AT, 'added', null)
      const read = db.prepare('INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const one of reads) read.run(one.id, PROJECT, one.readerKind, one.reader, OTHER_GROUP, one.side, AT)
    })
    const kinds = kindsOf(db, 'conversation_reads', AS_SIDE_KIND)
    expect(Object.fromEntries(reads.map((one) => [one.id, kinds[one.id]]))).toEqual(byId(reads, (one) => one.kind))
    // THE SHARED ROWS ARE TOLD AS THE FIRST CASE SAYS, and these rows add their own counts to theirs.
    const sides = READS.filter((one) => one.side !== NEITHER_SIDE)
    expect(outcome.kindsBesideIds.told['conversation_reads.as_side']).toEqual(counted([...sides, ...reads].map((one) => one.kind)))
  })

  it('tells a group read as the group\'s opener, when no member row has that id, by the kind stored beside the opener', () => {
    // Each made-up group with no member row of its opener: the opener's kind and id, and the kind its side should be told.
    const groups: { id: string; openerKind: string; opener: string; side: string; kind: Kind }[] = [
      { id: 'aMadeUpGrp56', openerKind: 'agent', opener: 'MadeUpOpener', side: 'MadeUpOpener', kind: 'agent' },
      { id: 'aMadeUpGrp57', openerKind: 'person', opener: 'a-made-up-opener', side: 'a-made-up-opener', kind: 'person' },
      { id: 'aMadeUpGrp58', openerKind: '', opener: 'an-opener-of-no-kind', side: 'an-opener-of-no-kind', kind: null },
      { id: 'aMadeUpGrp59', openerKind: 'person', opener: IN_BOTH, side: IN_BOTH, kind: null },
      { id: 'aMadeUpGrp60', openerKind: 'person', opener: 'an-opener-with-two-member-rows', side: 'an-opener-with-two-member-rows', kind: null },
      { id: 'aMadeUpGrp61', openerKind: 'agent', opener: 'MadeUpOpener', side: 'not-its-made-up-opener', kind: null },
    ]
    const { db, outcome } = migrateTheMadeUpOffice((db) => {
      const group = db.prepare('INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const one of groups) group.run(one.id, PROJECT, `Made-up group ${one.id}`, one.openerKind, one.opener, 'A made-up reason', AT)
      const member = db.prepare('INSERT INTO group_members (id, group_id, member_kind, member_id, joined_at, joined_because, left_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      member.run('opener-as-a-person', 'aMadeUpGrp60', 'person', 'an-opener-with-two-member-rows', AT, 'opened', null)
      member.run('opener-as-an-agent', 'aMadeUpGrp60', 'agent', 'an-opener-with-two-member-rows', AT, 'added', null)
      // READ BY SOMEBODY WHO IS NOT THE SIDE, so the reader's rule cannot tell any of them.
      const read = db.prepare("INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, 'person', ?, ?, ?, ?)")
      for (const one of groups) read.run(`read-of-${one.id}`, PROJECT, `reader-of-${one.id}`, one.id, one.side, AT)
    })
    const kinds = kindsOf(db, 'conversation_reads', AS_SIDE_KIND)
    expect(Object.fromEntries(groups.map((one) => [one.id, kinds[`read-of-${one.id}`]]))).toEqual(byId(groups, (one) => one.kind))
    const sides = READS.filter((one) => one.side !== NEITHER_SIDE)
    expect(outcome.kindsBesideIds.told['conversation_reads.as_side']).toEqual(counted([...sides, ...groups].map((one) => one.kind)))
  })
})
