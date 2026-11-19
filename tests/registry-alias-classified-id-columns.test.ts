// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY COLUMN THAT CAN HOLD AN AGENT'S ID IS IN THE REGISTER, WITH ITS CLASS AND ITS REASON (item 30c, part 3). Round
 * 152 read each column whose name says it may hold an agent's id from the code that writes it, and put it in one class:
 * it holds the agent's registry id; it holds the id the request sent, a handle or a registry id; it holds one from some
 * writers and the other from others; it holds a handle by design; or it is not read, because it is always empty, never
 * names an agent, or is not an identity. Round 154 traced the ones left "cannot tell" or "not traced", and the columns
 * found by a kind beside them or a comment that names an agent. A column with a kind beside it holds an agent's id only
 * when the kind says agent. A "type:id" column holds the writer's type, a colon and its id, and a "kind:id" column a
 * participant's kind, a colon and its id. A contact holds a participant's key, or the key of a writer no registry held.
 * A conversation is two agents' registry ids joined by a tilde, or a group's id, and the side it was read as is one of
 * the two, or neither, or a member of the group. One column holds the id of an agent record or an agent's registry id.
 * Round 155 put a kind beside the four columns that could not be told, and a row of one with no kind in it, written
 * before migration 0311 and not told by its data half, is counted by the census. The re-mint has to rewrite exactly the
 * rows that hold an old id, so the register has to be exact.
 *
 * Every agent, alias and row here is made up, in a throwaway office. A person's row below stores the spelling of an old
 * agent id on purpose, so that reading it as an agent's would show.
 *
 *   2. a column with a kind beside it is read only when the kind says agent: under every other word a participant or a
 *      writer can be, nothing is found and nothing blocks; a "type:id", "kind:id" or contact column is read only under
 *      a type or kind of agent, and a contact of a writer no registry held is not read;
 *   3. each column read for an agent reads an old id as its alias's agent; one read as a registry id takes an id no
 *      agent answers to as it is, and one that holds the id as sent or a handle is read through the one resolver, so
 *      that id blocks and the office's own writers are not read; a conversation reads both agents, and a group's id
 *      none; the side read as reads its agent, neither side nobody, and a group's member as it is, when its kind says
 *      agent; the id of an agent record is not read, and blocks when an agent answers to it too; a row of the four with
 *      no kind blocks as one that cannot be told on every value it holds, and a read as neither side does not;
 *   4. the census reads every table of the register, and a project's archive carries the alias of an old id an agent
 *      opened a group under or started a thread under, and not of the person's, names both columns in its note, and an
 *      office that holds the agents imports it and reads each old id back as its agent;
 *   5. the census counts the rows of the four columns that hold a value and no kind, and not a row with a kind, and in
 *      an office that has filed an alias a project's archive is refused while one is counted, naming each column and
 *      its rows; the whole office's archive, which carries every alias, is not.
 *
 * MUTATIONS, after a control run: read a column with a kind without asking the kind, and 2 goes red. Read a "type:id" column without asking its type,
 * and 2 and 4 go red. Read a column that holds the id as sent as a registry id, and 3 goes red. Read the id of an agent
 * record as a registry id, and 3 goes red. Read a row of the four with no kind as one that names nobody, and 3 and 5 go
 * red. Leave the register's tables out of the census, and 4 goes red. Let a project's archive go on while a row that
 * cannot be told is counted, and 5 goes red.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { aliasLibrary, inventedRegistry } from './registry-alias-fixture.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { PARTICIPANT_KINDS, THE_OFFICES_OWN_WRITER_IDS, type ParticipantKind } from '../src/shared/participants.ts'
import { ACTOR_TYPES } from '../src/shared/types.ts'
import { CASTING_CELLS } from '../src/shared/casting.ts'
import { NEITHER_SIDE, UNREGISTERED_PREFIX } from '../src/shared/messages.ts'
import type { PlainIdColumn } from '../src/server/lib/registry-aliases/identity-positions.ts'

// The separator of a conversation's two agents, read once the made-up office is open: its module opens the database.
let source: TestDb, restored: TestDb | undefined, archive: string, pairSeparator: string
beforeEach(async () => {
  source = await freshDb()
  inventedRegistry(source)
  archive = aTestDatabaseFolder('classified-id-columns')
  pairSeparator = (await import('../src/server/lib/messages.ts')).PAIR_SEPARATOR
})
afterEach(() => { source?.close(); restored?.close(); restored = undefined; if (archive) removeThisTestFolder(archive) })

const register = () => import('../src/server/lib/registry-aliases/identity-positions.ts')
const reader = () => import('../src/server/lib/registry-aliases/historical-reader.ts')
const at = '2026-01-01 00:00:00'
const AN_AGENT: Extract<ParticipantKind, 'agent'> = PARTICIPANT_KINDS[1]
const RECORD_OR_REGISTRY_ID: string[] = ['agent_messages.recipient_agent_id']
// The JSON columns read by their writer's type, beside the casting rows' eight, with that type.
const STORED: [string, string][] = [
  ['casting.program_from', 'CastingCellSource'], ['casting.model_from', 'CastingCellSource'], ['casting.effort_from', 'CastingCellSource'],
  ['casting.why_from', 'CastingCellSource'], ['agents.card_chosen_by', 'WhoChoseTheCard'], ['agents.elevation', 'Elevation[]'],
  ['agents.reads_releases_from_the_check', 'ReadsReleasesFromTheCheck'], ['changes.elevation', 'Elevation'], ['revisions.elevation', 'Elevation'],
  ['changes.proved_holder', 'ProvedHolder'], ['revisions.proved_holder', 'ProvedHolder'],
]

type Entry = PlainIdColumn
const theRead = async () => (await register()).PLAIN_ID_COLUMNS as readonly Entry[]
const columnOf = (site: string) => site.slice(site.indexOf('.') + 1)
// One old id for the readers, and one an agent opened a group under, one it started a thread under, and one the person's rows spell.
const OLD = { aliasId: 'stored-under-an-old-id', canonicalId: 'CanonicalA1' }
const OPENED = { aliasId: 'opened-a-group-under-an-old-id', canonicalId: 'CanonicalA1' }
const STARTED = { aliasId: 'started-a-thread-under-an-old-id', canonicalId: 'CanonicalB2' }
const THE_PERSONS = { aliasId: 'a-persons-row-spelled-like-an-old-id', canonicalId: 'CanonicalB2' }
// The other agent of a conversation, by its registry id, and a group's id.
const OTHER = 'CanonicalB2'
const A_GROUP = 'SyntheticGrp'
async function aliasesFiled(t: TestDb, aliases: { aliasId: string; canonicalId: string }[]) {
  ;(await aliasLibrary()).fileRegistryAliases(t.client.sqlite, aliases.map(one => ({ namespace: 'agent-registry', ...one })))
}
// The forms that start with a writer's type or a participant's kind, a colon and the id, each with the words it may start with.
const WORDED: Record<string, readonly string[]> = { 'type:id': ACTOR_TYPES, 'kind:id': PARTICIPANT_KINDS, contact: PARTICIPANT_KINDS }
/** A row of an entry's column holding `id`, under the word `kind` beside it or before it, written as the column writes it. */
function aRow(entry: Entry, id: string, kind: string | null = AN_AGENT): Record<string, unknown> {
  const column = columnOf(entry.site)
  const beside = entry.pair === undefined ? {} : { [entry.pair.field]: kind }
  if (entry.form === 'pair') return { [column]: `${id}${pairSeparator}${OTHER}`, ...beside }
  if (entry.form === 'side-of-pair') return { [column]: id, pair: `${id}${pairSeparator}${OTHER}`, ...beside }
  return { [column]: entry.form !== undefined && Object.hasOwn(WORDED, entry.form) ? `${String(kind)}:${id}` : id, ...beside }
}

describe('the register of the columns that can hold an agent id', () => {
  it('reads a column with a kind beside it only when the kind says agent, and one that starts with a type or a kind only under one of agent', async () => {
    await aliasesFiled(source, [OLD])
    const readOne = (await reader()).aPlainIdReader(source.client.sqlite)
    // A kind beside a column is a participant's kind or a writer's type; a worded column starts with the words of its form.
    const others = (words: readonly string[]) => [...new Set(words)].filter(word => word !== AN_AGENT)
    const wordsOf = (one: Entry) => (one.form !== undefined && Object.hasOwn(WORDED, one.form) ? WORDED[one.form] : undefined)
    const gated = (await theRead()).filter(one => one.pair !== undefined || wordsOf(one) !== undefined)
    expect(gated.length).toBeGreaterThan(60)
    for (const entry of gated) {
      expect(readOne(entry, aRow(entry, OLD.aliasId)).found.map(one => one.canonical), entry.site).toEqual([OLD.canonicalId])
      for (const word of others(wordsOf(entry) ?? [...PARTICIPANT_KINDS, ...ACTOR_TYPES])) expect(readOne(entry, aRow(entry, OLD.aliasId, word)), `${entry.site} under ${word}`).toEqual({ found: [], blocks: [] })
    }
    // A contact of a writer no registry held keeps the id the writer claimed, or the line it typed, and is not read.
    const contacts = gated.filter(one => one.form === 'contact')
    expect(contacts.map(one => one.site)).toEqual(['contact_placements.contact'])
    for (const entry of contacts) {
      for (const key of [`${UNREGISTERED_PREFIX}who/${AN_AGENT}:${OLD.aliasId}`, `${UNREGISTERED_PREFIX}typed/A made-up line`]) {
        expect(readOne(entry, { [columnOf(entry.site)]: key }), `${entry.site} holding ${key}`).toEqual({ found: [], blocks: [] })
      }
    }
  })

  it('reads an old id as its agent in each column, a registry id as it is, an id as sent or a handle through the one resolver, and blocks a row that cannot be told', async () => {
    await aliasesFiled(source, [OLD])
    const db = source.client.sqlite
    const readOne = (await reader()).aPlainIdReader(db)
    const ANOTHER = 'an-id-no-agent-answers-to'
    for (const entry of await theRead()) {
      const column = columnOf(entry.site)
      // A row with nothing in the kind beside it blocks whatever id it holds, where the register says it cannot be told.
      if (entry.pair?.untoldWithoutIt === true) {
        for (const id of [OLD.aliasId, ANOTHER, OTHER]) {
          expect(readOne(entry, aRow(entry, id, null)), `${entry.site} holding ${id} with no kind`).toEqual({ found: [], blocks: [{ path: column, reason: 'untold', why: expect.any(String) }] })
        }
      }
      // A conversation of two agents reads the other agent too, by its registry id.
      const theOther = entry.form === 'pair' ? [[column, OTHER, OTHER, entry.site]] : []
      const old = readOne(entry, aRow(entry, OLD.aliasId))
      expect(old.found.map(one => [one.path, one.stored, one.canonical, one.site]), entry.site).toEqual([[column, OLD.aliasId, OLD.canonicalId, entry.site], ...theOther])
      expect(old.blocks, entry.site).toEqual([])
      const nobody = readOne(entry, aRow(entry, ANOTHER))
      if (entry.holds === 'registry-id' || entry.holds === 'record-or-registry-id') {
        expect(nobody.found.map(one => one.canonical), entry.site).toEqual([ANOTHER, ...theOther.map(one => one[2])])
      } else {
        expect(nobody, entry.site).toEqual({ found: [], blocks: [{ path: column, reason: 'names-no-agent', why: expect.any(String) }] })
        for (const writer of THE_OFFICES_OWN_WRITER_IDS) expect(readOne(entry, aRow(entry, writer)), `${entry.site} by ${writer}`).toEqual({ found: [], blocks: [] })
      }
      if (entry.form !== undefined && Object.hasOwn(WORDED, entry.form)) expect(readOne(entry, { [column]: OLD.aliasId }).blocks.map(one => one.reason), entry.site).toEqual(['wrong-type'])
    }

    // A conversation is a pair of agents or a group's id; anything else with a tilde in it is not a conversation the office writes.
    const pairs = (await theRead()).filter(one => one.form === 'pair')
    expect(pairs.map(one => one.site)).toEqual(['conversation_reads.pair'])
    for (const entry of pairs) {
      const column = columnOf(entry.site)
      expect(readOne(entry, { [column]: A_GROUP }), entry.site).toEqual({ found: [], blocks: [] })
      const three = [OLD.aliasId, OTHER, ANOTHER].join(pairSeparator)
      expect(readOne(entry, { [column]: three }).blocks.map(one => one.reason), entry.site).toEqual(['wrong-type'])
    }
    // The side a conversation was read as is one of its two agents, or neither; the side of a group's read is a member,
    // read when its kind says agent. A read as neither side names nobody, whatever its kind.
    const sides = (await theRead()).filter(one => one.form === 'side-of-pair')
    expect(sides.map(one => one.site)).toEqual(['conversation_reads.as_side'])
    for (const entry of sides) {
      const column = columnOf(entry.site)
      const kind = entry.pair!.field
      const pair = `${OLD.aliasId}${pairSeparator}${OTHER}`
      expect(readOne(entry, { [column]: OTHER, pair, [kind]: AN_AGENT }).found.map(one => one.canonical), entry.site).toEqual([OTHER])
      for (const beside of [AN_AGENT, null]) expect(readOne(entry, { [column]: NEITHER_SIDE, pair, [kind]: beside }), `${entry.site} with ${String(beside)}`).toEqual({ found: [], blocks: [] })
      expect(readOne(entry, { [column]: ANOTHER, pair, [kind]: AN_AGENT }).blocks.map(one => one.reason), entry.site).toEqual(['wrong-type'])
      expect(readOne(entry, { [column]: OLD.aliasId, pair: A_GROUP, [kind]: AN_AGENT }).found.map(one => one.canonical), entry.site).toEqual([OLD.canonicalId])
      expect(readOne(entry, { [column]: OLD.aliasId, pair: A_GROUP, [kind]: PARTICIPANT_KINDS[0] }), entry.site).toEqual({ found: [], blocks: [] })
      expect(readOne(entry, { [column]: OLD.aliasId, pair: A_GROUP, [kind]: null }), entry.site).toEqual({ found: [], blocks: [{ path: column, reason: 'untold', why: expect.any(String) }] })
    }
    // A recipient is an agent record's id or an agent's registry id: the record's is not read, and one that names both blocks.
    const record = db.prepare('INSERT INTO records (id, workspace_id, owner_id, kind, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    record.run('SyntheticAgentRecord', 'default', THE_TEST_OFFICES_OWNER.id, AN_AGENT, 'A made-up agent record', '{}', at, at)
    record.run(OTHER, 'default', THE_TEST_OFFICES_OWNER.id, AN_AGENT, 'A made-up agent record with an agent id', '{}', at, at)
    const recipients = (await theRead()).filter(one => one.holds === 'record-or-registry-id')
    expect(recipients.length).toBe(RECORD_OR_REGISTRY_ID.length)
    for (const entry of recipients) {
      const column = columnOf(entry.site)
      expect(readOne(entry, { [column]: 'SyntheticAgentRecord' }), entry.site).toEqual({ found: [], blocks: [] })
      expect(readOne(entry, { [column]: OTHER }), entry.site).toEqual({ found: [], blocks: [{ path: column, reason: 'cannot-tell', why: expect.any(String) }] })
    }
  })
})

describe('the census and the archive of the classified columns', () => {
  it("reads every table of the register, and an archive carries the alias of an agent's old id in a group and a thread, not of the person's", async () => {
    const { IDENTITY_CENSUS_COLUMNS, takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const read = await theRead()
    expect(IDENTITY_CENSUS_COLUMNS).toEqual(expect.arrayContaining([...read.map(one => one.site), ...CASTING_CELLS.map(cell => `casting_rows.${cell}_from`), ...STORED.map(([site]) => site)]))
    const tables = [...new Set(read.map(one => one.site.slice(0, one.site.indexOf('.'))))]
    expect(Object.keys(takeIdentityCensus(source.client.sqlite).read)).toEqual(expect.arrayContaining(tables))

    await aliasesFiled(source, [OPENED, STARTED, THE_PERSONS])
    const db = source.client.sqlite
    const group = db.prepare('INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    group.run('SyntheticGroupByAnAgent', 'default', 'A made-up group', AN_AGENT, OPENED.aliasId, 'A made-up reason', at)
    group.run('SyntheticGroupByThePerson', 'default', 'Another made-up group', PARTICIPANT_KINDS[0], THE_PERSONS.aliasId, 'A made-up reason', at)
    const thread = db.prepare('INSERT INTO agent_threads (id, workspace_id, title, mode, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    thread.run('SyntheticThreadByAnAgent', 'default', 'A made-up thread', 'chat', at, at, `${AN_AGENT}:${STARTED.aliasId}`)
    thread.run('SyntheticThreadByThePerson', 'default', 'Another made-up thread', 'chat', at, at, `${ACTOR_TYPES[0]}:${THE_PERSONS.aliasId}`)

    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive, { workspaceId: 'default' })
    const { counts, notes } = exporter.buildExport({ workspaceId: 'default' }).report
    expect(counts['registry_aliases']).toBe(2)
    const said = notes.join('\n')
    expect(said).toMatch(/carries 2 of the 3 permanent registry aliases/)
    for (const site of ['groups.opened_by_id', 'agent_threads.created_by']) expect(said, site).toContain(site)

    restored = await freshDb()
    inventedRegistry(restored)
    const importer = await import('../src/server/lib/import.ts')
    expect(importer.planImport(archive).refusals).toEqual([])
    importer.applyImport(archive)
    expect(restored.client.sqlite.prepare('SELECT alias_id AS aliasId, canonical_id AS canonicalId FROM registry_aliases ORDER BY alias_id').all()).toEqual([OPENED, STARTED])
    const { theAgentAStoredIdNames } = await import('../src/server/lib/participants.ts')
    for (const one of [OPENED, STARTED]) expect(theAgentAStoredIdNames(one.aliasId)?.id, one.aliasId).toBe(one.canonicalId)
  })

  it("counts the rows with no kind beside an id, and not one with a kind, and refuses a project's archive while one is counted, naming each column and its rows", async () => {
    await aliasesFiled(source, [OPENED])
    const db = source.client.sqlite
    db.prepare('INSERT INTO groups (id, workspace_id, name, opened_by_kind, opened_by_id, opened_because, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(A_GROUP, 'default', 'A made-up group', AN_AGENT, OPENED.aliasId, 'A made-up reason', at)
    // Each column of the four has one row with no kind and one row with a kind: only the row with no kind is counted.
    const reading = db.prepare('INSERT INTO folder_readings (id, workspace_id, owner_id, owner_kind, folder, read_by, read_by_kind, pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    reading.run('SyntheticReading', 'default', OPENED.aliasId, null, 'a/made/up/folder', OPENED.aliasId, null, '[]', at, at)
    reading.run('SyntheticToldReading', 'default', OPENED.aliasId, AN_AGENT, 'another/made/up/folder', OPENED.aliasId, AN_AGENT, '[]', at, at)
    const judged = db.prepare("INSERT INTO revalidations (id, workspace_id, restriction_id, record_id, reached_by, distance, written_by, at, state, decided_by, decided_by_kind) VALUES (?, 'default', ?, ?, '[]', 0, 'judgement', ?, 'checked', ?, ?)")
    judged.run('SyntheticJudgement', 'SyntheticRestriction', 'SyntheticRecordA', at, OPENED.aliasId, null)
    judged.run('SyntheticToldJudgement', 'SyntheticRestriction', 'SyntheticRecordB', at, OPENED.aliasId, AN_AGENT)
    const conversationRead = db.prepare('INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, as_side_kind, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    conversationRead.run('SyntheticGroupRead', 'default', PARTICIPANT_KINDS[0], THE_TEST_OFFICES_OWNER.id, A_GROUP, OPENED.aliasId, null, at)
    conversationRead.run('SyntheticPairRead', 'default', PARTICIPANT_KINDS[0], THE_TEST_OFFICES_OWNER.id, `${OPENED.aliasId}${pairSeparator}${OTHER}`, OPENED.aliasId, AN_AGENT, at)

    const { takeIdentityCensus } = await import('../src/server/lib/registry-aliases/census.ts')
    const census = takeIdentityCensus(db)
    const UNTOLD_HERE = ['folder_readings.read_by', 'folder_readings.owner_id', 'revalidations.decided_by', 'conversation_reads.as_side']
    expect(census.untold).toEqual(Object.fromEntries(UNTOLD_HERE.map(site => [site, 1])))
    expect(census.blocks.map(one => one.reason)).not.toContain('untold')

    const exporter = await import('../src/server/lib/export.ts')
    const refused = (() => {
      try {
        exporter.buildExport({ workspaceId: 'default' })
        return null
      } catch (error) {
        return error
      }
    })()
    // A refusal, so the caller is told which columns and how many rows, and not only that something went wrong.
    const { PanelError } = await import('../src/server/lib/panel-error.ts')
    expect(refused).toBeInstanceOf(PanelError)
    expect((refused as InstanceType<typeof PanelError>).status).toBe(409)
    for (const site of UNTOLD_HERE) expect((refused as Error).message, site).toContain(`1 in ${site}`)
    expect(() => exporter.buildExport({})).not.toThrow()

    db.prepare("DELETE FROM folder_readings WHERE id = 'SyntheticReading'").run()
    db.prepare("DELETE FROM revalidations WHERE id = 'SyntheticJudgement'").run()
    db.prepare("DELETE FROM conversation_reads WHERE id = 'SyntheticGroupRead'").run()
    expect(takeIdentityCensus(db).untold).toEqual({})
    expect(exporter.buildExport({ workspaceId: 'default' }).report.counts['registry_aliases']).toBe(1)
  })
})
