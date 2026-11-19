// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT'S PASS OVER THE HISTORY REWRITES EACH OLD ID IN PIN ORDER, AND REMAKES EVERY PIN AND SEAL OVER WHAT IT
 * CHANGED. Wave 13s round 257, piece 3b of the re-mint.
 *
 * A legacy agent's id is its handle. The re-mint gives it a new id, and the history still holds the old one: in a
 * revision's data, in its writer, in the key that proved the writer, and in the change rows. A revision's content hash
 * is over its content, a pin names a revision by its seq and that hash, and a seal pins a revision row and a link row by
 * the sha256 of the row. So a rewrite of one id in a revision moves its hash, and each pin to it, and each seal over it,
 * and each pin of that seal's own hash. src/server/db/remint-history.ts does that pass. The re-mint calls it inside
 * its own transaction; this test calls it alone.
 *
 * A throwaway office holds made-up agents: two legacy agents, each with its handle as its id, and one minted agent.
 * The rule the pass is given names a new id for each legacy agent, and a new id for one of them where a value holds
 * what was sent. It holds:
 *   - a note typed to one legacy agent, made by it, patched by the other, given an elevation by hand on its first
 *     revision and on one change row, and then a short form that pins its second revision;
 *   - a comment, made by the minted agent, pinned to the note's first revision;
 *   - an older note, made by a legacy agent, with no id in its data, pinned by a seal in the columns of 0060;
 *   - a comment put in by hand before the note it pins, so its revision comes first in rowid order;
 *   - two decisions, one made and recorded by each legacy agent;
 *   - a link made by a legacy agent;
 *   - three seals, put in by hand with a revision each and the shape the seal writer gives one: the first pins the
 *     note's first and third revisions, the comment's revision and the link; the second pins the older note's revision
 *     in the columns of 0060; the third pins the link by a hash that did not hold;
 *   - a merge entry and a run, each pinning the first seal's own hash, and a second run pinning it by a hash that did
 *     not hold; the first run's workers are keyed by agent id, one of them legacy;
 *   - a message whose dead-letter sweep waits on two letters, one for a legacy agent;
 *   - change rows by hand: an id typed to the note, the comment's pin, the merge entry's seal by its field and by a
 *     field written another way, the run's release, and a worker of the run by its key, written two ways;
 *   - a thread message whose context and quote pin the note's first revision, and a review whose entry pins its second;
 *   - a change row whose record has no record row and no revision, and a record that has been two kinds with a change
 *     row, each change pinning the first seal's own hash.
 * Each case opens a transaction, lifts the two guards of a sealed tip, runs the pass, makes the guards again, looks,
 * and rolls back. Cases:
 *   0. the fixture contract: every pin holds by this test's own reading but the third seal's link pin, which is the one
 *      theLinkPinsThatDoNotHold names, and it writes nothing; the hand comment's revision comes before its note's;
 *   1. data and stamp: the note's id typed to an agent takes the new id, its revision's writer and a decision's stamp
 *      take the rule's id, and each content hash is the hash of the new content;
 *   2. the rule: where the rule keeps a value as typed, the other legacy agent's stamps and writer keep its old id,
 *      while its id that a key proved takes its new id; a position that cannot be told takes the rule;
 *   3. record pins: the comment's pin, the short form's pin, the thread message's two pins and the review's pin each
 *      name the remade revision's new hash;
 *   4. order: the comment whose revision comes first pins the new hash of the note it comes before;
 *   5. cycle: two revisions that pin each other refuse the whole pass, which names both and writes nothing;
 *   6. seal pins: the first seal's pins name the new rows' hashes, and its own hash is remade;
 *   7. older column list: the second seal's pin is remade in the columns of 0060, not today's;
 *   8. links: the link's writer takes the rule's id, the first seal's pin to it is remade because it held, and the
 *      third seal's pin, which did not, keeps its bytes and is counted;
 *   9. what pins a seal's hash: the merge entry's seal and the run's release name the seal's new hash, and the second
 *      run's pin, whose hash was not the seal's, keeps its bytes;
 *  10. current data, changes and the other pins: each record's data is its newest revision's, the search text holds the
 *      new id and not the old one, a change's value takes the new id and its pin the new hash, and a record whose data
 *      is not its newest revision's is refused by name, with nothing written;
 *  11. kept lists: one content-hash row for each revision whose hash moved, one seal-hash row for each old row hash a
 *      seal pinned, one link-hash row for the link, and one seal-own-hash row for each seal whose own hash was remade,
 *      at the seal's record and seq, none with a generation;
 *  12. untouched rows keep every byte, and the rows the pass says it changed are the rows that changed;
 *  13. the guards: after they are made again, an update and a delete of a sealed tip are still refused; the search text
 *      trigger is never lifted; a missing guard is refused by name;
 *  14. outside a transaction the pass is refused and nothing is written;
 *  15. proved_holder and elevation: the id a key proved takes the new id, the name sent and the grant take the rule's,
 *      in revisions and changes, with the key order kept; changes.actor_id is left;
 *  16. a change's field: a key written in the path's own form takes the new id, and a key written another way is kept
 *      and returned with its row and why;
 *  17. the dead-letter key: the letter for the legacy agent is remade by the product's own function, the other is left;
 *  18. seal-hash pins in change values: the merge entry's seal and the run's release take the new hash, and a value the
 *      pass cannot place from its field keeps its bytes and is returned with its row and why;
 *  19. a map key: the run's worker keyed by the legacy agent takes the new id, and the keys keep their order;
 *  20. a stamp behind its pair: two tasks, put in by the case, each with an exporter of the agent type, one for each
 *      legacy agent. The first takes the rule's id and the second keeps its old id, as the rule keeps it as typed, and
 *      neither takes the new id an actor pair would take.
 *  21. the kind of a change's record: the change whose record has no row and the change whose record has been two
 *      kinds each keep their bytes, are counted once under their own reason, and their pins of the seal's hash are
 *      returned.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-remakes-the-history-in-pin-order.test.ts
 * After a green control, copy src/server/db/remint-history.ts, then make one of these changes in it:
 *   mut-actor: leave revisions.actor_id as it is: case 1 goes red;
 *   mut-rule: rewrite a stamp by the new ids in place of the per-value rule: case 2 goes red, and case 20;
 *   mut-key-order: rename a key by deleting the old one and adding the new one at the end: case 19 goes red;
 *   mut-pin: leave each record pin as it is: case 3 goes red;
 *   mut-order: remake the revisions in rowid order, without the pins' order: case 4 goes red;
 *   mut-cycle: skip the check for a cycle: case 5 goes red;
 *   mut-seal-list: hash a changed row in the last list of columns, not the list its pin held under: case 7 goes red;
 *   mut-seal-hash: leave a seal's own hash as it is: case 9 goes red, and case 6;
 *   mut-link: remake a link pin whether its old pin held or not: case 8 goes red;
 *   mut-records: leave each record's data as it is: case 10 goes red;
 *   mut-kept: return no seal-hash rows: case 11 goes red;
 *   mut-own: return no seal-own-hash rows: case 11 goes red;
 *   mut-guard: make makeTheGuardsAgain run nothing: case 13 goes red;
 *   mut-proved: leave proved_holder as it is: case 15 goes red;
 *   mut-elevation: leave the grant of an elevation as it is: case 15 goes red;
 *   mut-field: leave each change's field as it is: case 16 goes red;
 *   mut-dead-letter: leave the dead-letter key as it is: case 17 goes red;
 *   mut-seal-pin-list: skip merge_entry.seal: case 9 goes red, and case 18;
 *   mut-seal-pin-walk: make the walk of the declared shapes find no field: case 9 goes red, and case 18.
 * And in src/server/lib/registry-aliases/historical-reader.ts, which holds the one rule for the kind of a change's
 * record:
 *   mut-kind: give a record that has no kind the reason of a record that has been two kinds: case 21 goes red, and the
 *     census case of tests/registry-alias-historical-reader.test.ts.
 * Restore the file with cp after each change, check it with cmp, and run the command again for green.
 * Case 20 is also proved by a change in src/server/lib/registry-aliases/identity-positions.ts, restored the same way:
 *   mut-actor-pair: give BundleExporter.actorId back its actor-pair parse: case 20 goes red.
 * Every id, name and word here is made up, in a throwaway office.
 */
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ThePass = typeof import('../src/server/db/remint-history.ts')
type Did = ReturnType<ThePass['rewriteTheHistory']>
type Row = Record<string, unknown>

const WHEN = '2026-11-12 08:00:00'
const PROJECT = 'default'
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

// Two made-up legacy agents, each with its handle as its id, and one minted one.
const STILT = 'legacy-stilt'
const WREN = 'legacy-wren'
const MINTED = { id: 'MintedHist01', handle: 'minted-hist' }
const NEW_STILT = 'NewStilt0001'
const NEW_WREN = 'NewWren00001'
/** The id the rule gives a value that holds what was sent, for the first legacy agent only. */
const RULED_STILT = 'RuledStilt01'
const RULE = {
  newIds: new Map([
    [STILT, NEW_STILT],
    [WREN, NEW_WREN],
  ]),
  underTheRule: (stored: string): string | null => (stored === STILT ? RULED_STILT : null),
}

/** A write by `id`, under a key that proved it, with the name it sent. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: id } })
const ELEVATION = JSON.stringify({ id: 'MadeUpElev01', grantedAt: WHEN, grantedBy: STILT })

/** The columns 0060 made revisions with, and the columns it has now, written out from the drizzle files. */
const THE_FIRST_LIST = ['id', 'record_id', 'workspace_id', 'seq', 'content_hash', 'kind', 'title', 'summary', 'data', 'deleted_at', 'op', 'actor_type', 'actor_id', 'session_id', 'at', 'note']
const THE_LAST_LIST = [...THE_FIRST_LIST, 'warrant', 'revokes_seq', 'elevation', 'proved_holder', 'proved_by', 'signed_item']
const A_LINK_ROW =
  'SELECT id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, gate, gate_up_to, gate_up_to_sort, carries FROM links WHERE id = ?'

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const cut = (row: Row, columns: readonly string[]): Row => Object.fromEntries(columns.map((column) => [column, row[column]]))
/** The sha256 of a row as JSON, worked out here and not by the code it checks. */
const theHashOf = (row: Row) => sha256(JSON.stringify(row))
const theContentHash = (kind: string, title: string, data: Row) => versionOf(contentOf({ kind, title, summary: null, data, deletedAt: null }))
/** A seal's own hash: the sha256 of its content as JSON, without the hash. */
function theSealsOwnHash(seal: Row): string {
  const { hash: _hash, ...content } = seal
  return sha256(JSON.stringify(content))
}

const one = (s: Database.Database, sql: string, ...args: unknown[]): unknown => s.prepare(sql).pluck().get(...args)
const theRevision = (s: Database.Database, record: string, seq: number) => s.prepare('SELECT * FROM revisions WHERE record_id = ? AND seq = ?').get(record, seq) as Row
const theDataOf = (row: Row) => JSON.parse(String(row['data'])) as Row
const theRecordsData = (s: Database.Database, id: string) => JSON.parse(one(s, 'SELECT data FROM records WHERE id = ?', id) as string) as Row
const theLinkRow = (s: Database.Database, id: string) => s.prepare(A_LINK_ROW).get(id) as Row
const theChange = (s: Database.Database, id: string) => s.prepare('SELECT * FROM changes WHERE id = ?').get(id) as Row
const at = (value: unknown, ...steps: (string | number)[]): unknown => steps.reduce<unknown>((into, step) => (into as Record<string | number, unknown>)[step], value)

/** Every row of the six tables the pass writes, as JSON, by table and id. */
const THE_TABLES = {
  links: 'SELECT * FROM links ORDER BY id',
  records: 'SELECT * FROM records ORDER BY id',
  revisions: 'SELECT * FROM revisions ORDER BY id',
  changes: 'SELECT * FROM changes ORDER BY id',
  agent_messages: 'SELECT * FROM agent_messages ORDER BY id',
  reviews: 'SELECT * FROM reviews ORDER BY id',
} as const
type Table = keyof typeof THE_TABLES
type TheRows = Record<Table, Record<string, string>>
function theRows(s: Database.Database): TheRows {
  const out = {} as TheRows
  for (const [table, sql] of Object.entries(THE_TABLES) as [Table, string][]) {
    out[table] = Object.fromEntries((s.prepare(sql).all() as Row[]).map((row) => [String(row['id']), JSON.stringify(row)]))
  }
  return out
}

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  for (const id of [STILT, WREN]) anAgent(id, id)
  anAgent(MINTED.id, MINTED.handle)
}

/** A made-up record put in by hand, with one revision written as the revision writer writes one. */
function putIn(s: Database.Database, id: string, kind: string, title: string, data: Row, writer: { type: 'agent' | 'human'; id: string }): void {
  const text = JSON.stringify(data)
  s.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')").run(
    id,
    PROJECT,
    HUMAN.id,
    WHEN,
    WHEN,
    kind,
    title,
    text,
  )
  s.prepare(
    "INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, 1, ?, ?, ?, NULL, ?, NULL, 'create', ?, ?, NULL, ?, NULL)",
  ).run(`${id}-r1`, id, PROJECT, theContentHash(kind, title, data), kind, title, text, writer.type, writer.id, WHEN)
}

/** A made-up seal with the shape sealFinishedRun gives one, and its own hash. */
function aSeal(id: string, records: Row[], dependencies: Row[], links: Row[]): Row {
  const content = {
    version: 1,
    run: `${id}-run`,
    execution: `${id}-execution`,
    attempt: `${id}-attempt`,
    area: ['made-up/'],
    sealedAt: WHEN,
    kind: 'records',
    git: null,
    records: { workspace: PROJECT, baseline: 1, through: 1000, records, dependencies, links, says: 'Made-up words, on a made-up seal.' },
  }
  return { seal: { ...content, hash: sha256(JSON.stringify(content)) } }
}

/** A context that pins revision `seq` of `record` with `contentHash`. */
const aContext = (record: string, seq: number, contentHash: string) => ({ target: { kind: 'record', recordId: record, workspaceId: PROJECT }, revision: { seq, contentHash } })

interface TheFixture {
  note: string
  comment: string
  older: string
  /** The comment put in before the note it pins, and that note. */
  pinner: string
  pinned: string
  decisions: { stilt: string; wren: string }
  link: string
  seals: { first: string; older: string; badLink: string }
  /** The first seal's own hash before the pass. */
  firstSealsHash: string
  merge: string
  released: string
  refused: string
  letter: string
  changes: { typedTo: string; context: string; mergeSeal: string; release: string; anotherField: string; worker: string; workerByHash: string; elevated: string; noRecord: string; twoKinds: string }
  /** The record a change row names that has no record row and no revision, and a record that has been two kinds. */
  noRecord: string
  twoKinds: string
  thread: string
  message: string
  review: string
}

const SEAL_TITLE = 'A made-up seal'
const PINNED_TITLE = 'A made-up note put in by hand'
const PINNED_DATA = { body: 'Made-up words, by hand.', typed_to_agent: STILT }

async function writeTheHistory(test: TestDb): Promise<TheFixture> {
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const s = test.client.sqlite
  const api = test.api
  const hashAt = (record: string, seq: number) => one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?', record, seq) as string

  const note = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up note typed to an agent', data: { body: 'Made-up words, first.', typed_to_agent: STILT }, actor: by(STILT) }).id
  api.patchRecord(note, { data: { body: 'Made-up words, second.', typed_to_agent: STILT } }, by(WREN))
  s.prepare('UPDATE revisions SET elevation = ? WHERE record_id = ? AND seq = 1').run(ELEVATION, note)
  const elevated = one(s, 'SELECT id FROM changes WHERE record_id = ? ORDER BY rowid LIMIT 1', note) as string
  s.prepare('UPDATE changes SET elevation = ? WHERE id = ?').run(ELEVATION, elevated)
  writeShortForms(note, PROJECT, { madeFrom: { seq: 2, contentHash: hashAt(note, 2) }, forms: { label: 'Made-up history label' } }, by(MINTED.id))

  const comment = api.createRecord({
    workspaceId: PROJECT,
    kind: 'annotation',
    title: 'A made-up remark on the first words',
    data: { body: 'Made-up remark.', context: aContext(note, 1, hashAt(note, 1)) },
    actor: by(MINTED.id),
  }).id
  const older = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'A made-up older note', data: { body: 'Made-up words, older.' }, actor: by(STILT) }).id

  // THE COMMENT GOES IN FIRST, pinning the note put in after it by the hash that note will have.
  const pinner = 'MadeUpPinner'
  const pinned = 'MadeUpPinned'
  putIn(s, pinner, 'annotation', 'A made-up remark put in first', { body: 'Made-up remark, first.', context: aContext(pinned, 1, theContentHash('note', PINNED_TITLE, PINNED_DATA)) }, { type: 'agent', id: MINTED.id })
  putIn(s, pinned, 'note', PINNED_TITLE, PINNED_DATA, { type: 'agent', id: MINTED.id })

  const decisions = { stilt: 'MadeUpDecS01', wren: 'MadeUpDecW01' }
  putIn(s, decisions.stilt, 'decision', 'A made-up decision by one agent', { decided_by: STILT, recorded_by: STILT }, { type: 'agent', id: MINTED.id })
  putIn(s, decisions.wren, 'decision', 'A made-up decision by the other agent', { decided_by: WREN, recorded_by: WREN }, { type: 'agent', id: MINTED.id })

  const link = api.createLink({ fromId: note, toId: comment, type: 'relates_to', actor: by(STILT) }).id

  const aPin = (record: string, seq: number, columns: readonly string[]) => {
    const row = theRevision(s, record, seq)
    return { record, id: String(row['id']), seq, hash: theHashOf(cut(row, columns)) }
  }
  const seals = { first: 'MadeUpSeal01', older: 'MadeUpSeal02', badLink: 'MadeUpSeal03' }
  const first = aSeal(seals.first, [{ id: note, before: aPin(note, 1, THE_LAST_LIST), after: aPin(note, 3, THE_LAST_LIST) }], [aPin(comment, 1, THE_LAST_LIST)], [
    { id: link, hash: theHashOf(theLinkRow(s, link)), inferred: false },
  ])
  putIn(s, seals.first, 'sealed_tip', SEAL_TITLE, first, HUMAN)
  putIn(s, seals.older, 'sealed_tip', SEAL_TITLE, aSeal(seals.older, [{ id: older, before: null, after: aPin(older, 1, THE_FIRST_LIST) }], [], []), HUMAN)
  putIn(s, seals.badLink, 'sealed_tip', SEAL_TITLE, aSeal(seals.badLink, [], [], [{ id: link, hash: 'e'.repeat(64), inferred: false }]), HUMAN)
  const firstSealsHash = String((first['seal'] as Row)['hash'])

  const merge = 'MadeUpMerge1'
  const released = 'MadeUpRun001'
  const refused = 'MadeUpRun002'
  putIn(s, merge, 'merge_entry', 'A made-up merge entry', { run: released, seal: { id: seals.first, hash: firstSealsHash } }, { type: 'agent', id: MINTED.id })
  putIn(
    s,
    released,
    'session',
    'A made-up released run',
    { released: { read: { sealId: seals.first, sealHash: firstSealsHash } }, workerRuns: { [STILT]: { state: 'wanted' }, [MINTED.id]: { state: 'wanted' } } },
    { type: 'agent', id: MINTED.id },
  )
  putIn(s, refused, 'session', 'A made-up refused run', { refused: { read: { sealId: seals.first, sealHash: 'f'.repeat(64) } } }, { type: 'agent', id: MINTED.id })

  const letter = 'MadeUpLetter'
  putIn(s, letter, 'message', 'A made-up message', { body: 'Made-up words.', deadLetterSweep: { waiting: [`MadeUpMsg001~${STILT}`, `MadeUpMsg002~${MINTED.id}`] } }, { type: 'agent', id: MINTED.id })

  const changes = {
    typedTo: 'MadeUpChg001',
    context: 'MadeUpChg002',
    mergeSeal: 'MadeUpChg003',
    release: 'MadeUpChg004',
    anotherField: 'MadeUpChg005',
    worker: 'MadeUpChg006',
    workerByHash: 'MadeUpChg007',
    elevated,
    noRecord: 'MadeUpChg008',
    twoKinds: 'MadeUpChg009',
  }
  const aChange = (id: string, record: string, field: string, newValue: string) =>
    s
      .prepare("INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, ?, 'update', 'agent', ?, ?, NULL, ?, ?)")
      .run(id, record, PROJECT, MINTED.id, field, newValue, WHEN)
  aChange(changes.typedTo, note, 'data.typed_to_agent', STILT)
  aChange(changes.context, comment, 'data.context', JSON.stringify(aContext(note, 1, hashAt(note, 1))))
  aChange(changes.mergeSeal, merge, 'data.seal', JSON.stringify({ id: seals.first, hash: firstSealsHash }))
  aChange(changes.release, released, 'data.released', JSON.stringify({ read: { sealId: seals.first, sealHash: firstSealsHash } }))
  aChange(changes.anotherField, merge, 'data["seal"]', JSON.stringify({ id: seals.first, hash: firstSealsHash }))
  aChange(changes.worker, released, `data.workerRuns["${STILT}"]`, JSON.stringify({ state: 'wanted' }))
  aChange(changes.workerByHash, released, `data.workerRuns[#${STILT}]`, JSON.stringify({ state: 'wanted' }))

  // A CHANGE WHOSE RECORD NOTHING HOLDS, AND A RECORD THAT HAS BEEN TWO KINDS: a note whose second revision, and the
  // record row, say it is a comment. Neither change can be placed by its record's kind.
  const noRecord = 'MadeUpNoRecd'
  const twoKinds = 'MadeUpTwoKnd'
  const TWO_KINDS_TITLE = 'A made-up note that became a remark'
  const TWO_KINDS_DATA = { body: 'Made-up words, of two kinds.' }
  putIn(s, twoKinds, 'note', TWO_KINDS_TITLE, TWO_KINDS_DATA, { type: 'agent', id: MINTED.id })
  s.prepare(
    "INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, 2, ?, 'annotation', ?, NULL, ?, NULL, 'update', 'agent', ?, NULL, ?, NULL)",
  ).run(`${twoKinds}-r2`, twoKinds, PROJECT, theContentHash('annotation', TWO_KINDS_TITLE, TWO_KINDS_DATA), TWO_KINDS_TITLE, JSON.stringify(TWO_KINDS_DATA), MINTED.id, WHEN)
  s.prepare("UPDATE records SET kind = 'annotation' WHERE id = ?").run(twoKinds)
  aChange(changes.noRecord, noRecord, 'data.seal', JSON.stringify({ id: seals.first, hash: firstSealsHash }))
  aChange(changes.twoKinds, twoKinds, 'data.seal', JSON.stringify({ id: seals.first, hash: firstSealsHash }))

  const thread = 'MadeUpThread'
  const message = 'MadeUpMsgRow'
  const review = 'MadeUpReview'
  s.prepare('INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    thread,
    PROJECT,
    'A made-up thread',
    'direct',
    'open',
    WHEN,
    WHEN,
    `human:${HUMAN.id}`,
  )
  s.prepare('INSERT INTO agent_messages (id, thread_id, position, role, intent, body, context, carries, state, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    message,
    thread,
    1,
    'human',
    'ask',
    'Made-up words, asked.',
    JSON.stringify(aContext(note, 1, hashAt(note, 1))),
    JSON.stringify([{ quote: aContext(note, 1, hashAt(note, 1)) }]),
    'queued',
    WHEN,
    `human:${HUMAN.id}`,
  )
  s.prepare('INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, reach) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    review,
    PROJECT,
    JSON.stringify(aContext(note, 2, hashAt(note, 2))),
    'collecting',
    WHEN,
    `human:${HUMAN.id}`,
    'local',
  )
  return { note, comment, older, pinner, pinned, decisions, link, seals, firstSealsHash, merge, released, refused, letter, changes, noRecord, twoKinds, thread, message, review }
}

let t: TestDb
let f: TheFixture
beforeAll(async () => {
  t = await freshDb()
  theAgents(t.client.sqlite)
  f = await writeTheHistory(t)
}, 240_000)
afterAll(() => t?.close())

/** Run the pass on the fixture inside a transaction, with the guards lifted and made again, give `look` what it did and the rows before it, and roll it back. */
async function afterThePass(look: (did: Did, before: TheRows, s: Database.Database) => void | Promise<void>): Promise<void> {
  const pass = await import('../src/server/db/remint-history.ts')
  const s = t.client.sqlite
  const before = theRows(s)
  s.exec('BEGIN')
  try {
    const lifted = pass.liftTheSealedTipGuards(s)
    const did = pass.rewriteTheHistory(s, RULE)
    pass.makeTheGuardsAgain(s, lifted)
    await look(did, before, s)
  } finally {
    s.exec('ROLLBACK')
  }
}

const theSeal = (s: Database.Database, id: string, seq = 1) => theDataOf(theRevision(s, id, seq))['seal'] as Row
const theSealsRecords = (seal: Row) => seal['records'] as { records: Row[]; dependencies: Row[]; links: Row[] }

describe("the re-mint's pass over the history", () => {
  it('0. the fixture contract: every pin holds but the third seal link pin, which is the one theLinkPinsThatDoNotHold names, and it writes nothing', async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    const before = theRows(s)
    expect(pass.theLinkPinsThatDoNotHold(s)).toEqual([expect.objectContaining({ seal: f.seals.badLink, link: f.link, hash: 'e'.repeat(64) })])
    expect(theRows(s)).toEqual(before)

    expect(one(s, 'SELECT COUNT(*) FROM revisions WHERE record_id = ?', f.note)).toBe(3)
    expect(one(s, 'SELECT rowid FROM revisions WHERE record_id = ?', f.pinner) as number).toBeLessThan(one(s, 'SELECT rowid FROM revisions WHERE record_id = ?', f.pinned) as number)
    expect(theChange(s, f.changes.elevated)['elevation']).toBe(ELEVATION)
    const first = theSeal(s, f.seals.first)
    expect(theSealsOwnHash(first)).toBe(first['hash'])
    const pins = theSealsRecords(first)
    expect(pins.records[0]?.['before']).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.note, 1), THE_LAST_LIST)) }))
    expect(pins.records[0]?.['after']).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.note, 3), THE_LAST_LIST)) }))
    expect(pins.dependencies[0]).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.comment, 1), THE_LAST_LIST)) }))
    expect(pins.links[0]?.['hash']).toBe(theHashOf(theLinkRow(s, f.link)))
    expect(theSealsRecords(theSeal(s, f.seals.older)).records[0]?.['after']).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.older, 1), THE_FIRST_LIST)) }))
    expect(at(theDataOf(theRevision(s, f.pinner, 1)), 'context', 'revision', 'contentHash')).toBe(theRevision(s, f.pinned, 1)['content_hash'])
    expect(at(theDataOf(theRevision(s, f.note, 3)), 'shortForms', 'label', 'madeFrom', 'contentHash')).toBe(theRevision(s, f.note, 2)['content_hash'])
    for (const id of [f.note, f.comment, f.pinner, f.pinned, f.merge, f.released, f.seals.first]) {
      const newest = s.prepare('SELECT data, content_hash, kind, title FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as Row
      expect(one(s, 'SELECT data FROM records WHERE id = ?', id)).toBe(newest['data'])
      expect(theContentHash(String(newest['kind']), String(newest['title']), theDataOf(newest))).toBe(newest['content_hash'])
    }
  })

  it("1. data and stamp: the id typed to an agent takes its new id, the writer and a decision's stamp take the rule's id, and each content hash is the new content's", async () => {
    await afterThePass((_did, _before, s) => {
      for (const seq of [1, 2, 3]) {
        const row = theRevision(s, f.note, seq)
        expect(theDataOf(row)['typed_to_agent']).toBe(NEW_STILT)
        expect(row['content_hash']).toBe(theContentHash(String(row['kind']), String(row['title']), theDataOf(row)))
      }
      expect(theRevision(s, f.note, 1)['actor_id']).toBe(RULED_STILT)
      expect(theRevision(s, f.older, 1)['actor_id']).toBe(RULED_STILT)
      expect(theDataOf(theRevision(s, f.decisions.stilt, 1))['decided_by']).toBe(RULED_STILT)
      expect(theDataOf(theRevision(s, f.pinned, 1))['typed_to_agent']).toBe(NEW_STILT)
    })
  })

  it('2. the rule: a value the rule keeps as typed keeps its old id, an id a key proved takes its new id, and a position that cannot be told takes the rule', async () => {
    await afterThePass((did, _before, s) => {
      expect(theRevision(s, f.note, 2)['actor_id']).toBe(WREN)
      expect(theDataOf(theRevision(s, f.decisions.wren, 1))).toEqual({ decided_by: WREN, recorded_by: WREN })
      expect(JSON.parse(String(theRevision(s, f.note, 2)['proved_holder']))).toEqual(expect.objectContaining({ id: NEW_WREN, claimed: WREN }))
      expect(theDataOf(theRevision(s, f.decisions.stilt, 1))['recorded_by']).toBe(RULED_STILT)
      expect(theRevision(s, f.comment, 1)['actor_id']).toBe(MINTED.id)
      expect(did.counts.positionsRewritten).toBeGreaterThan(0)
      expect(did.counts.positionsKeptAsTyped).toBeGreaterThan(0)
      expect(did.counts.blocks['cannot-tell']).toBeGreaterThanOrEqual(3)
    })
  })

  it("3. record pins: the comment's, the short form's, the thread message's two and the review's each name the remade revision's new hash", async () => {
    await afterThePass((did, _before, s) => {
      const first = theRevision(s, f.note, 1)['content_hash']
      const second = theRevision(s, f.note, 2)['content_hash']
      expect(at(theDataOf(theRevision(s, f.comment, 1)), 'context', 'revision')).toEqual({ seq: 1, contentHash: first })
      expect(at(theDataOf(theRevision(s, f.note, 3)), 'shortForms', 'label', 'madeFrom')).toEqual({ seq: 2, contentHash: second })
      const message = s.prepare('SELECT context, carries FROM agent_messages WHERE id = ?').get(f.message) as { context: string; carries: string }
      expect(at(JSON.parse(message.context), 'revision', 'contentHash')).toBe(first)
      expect(at(JSON.parse(message.carries), 0, 'quote', 'revision', 'contentHash')).toBe(first)
      expect(at(JSON.parse(one(s, 'SELECT entry FROM reviews WHERE id = ?', f.review) as string), 'revision', 'contentHash')).toBe(second)
      expect(did.counts.pinsRemade).toBe(6)
    })
  })

  it('4. order: the comment whose revision comes first pins the new hash of the note it comes before', async () => {
    await afterThePass((_did, before, s) => {
      const pinned = theRevision(s, f.pinned, 1)['content_hash']
      expect(pinned).not.toBe((JSON.parse(String(before.revisions[`${f.pinned}-r1`])) as Row)['content_hash'])
      expect(at(theDataOf(theRevision(s, f.pinner, 1)), 'context', 'revision', 'contentHash')).toBe(pinned)
    })
  })

  it('5. cycle: two revisions that pin each other refuse the whole pass, which names both and writes nothing', async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    s.exec('BEGIN')
    try {
      putIn(s, 'MadeUpCycleX', 'annotation', 'A made-up remark in a cycle', { body: 'Made-up remark, X.', context: aContext('MadeUpCycleY', 1, 'a'.repeat(16)) }, { type: 'agent', id: MINTED.id })
      putIn(s, 'MadeUpCycleY', 'annotation', 'A made-up remark in a cycle', { body: 'Made-up remark, Y.', context: aContext('MadeUpCycleX', 1, 'b'.repeat(16)) }, { type: 'agent', id: MINTED.id })
      const lifted = pass.liftTheSealedTipGuards(s)
      const before = theRows(s)
      let refusal = ''
      try {
        pass.rewriteTheHistory(s, RULE)
      } catch (error) {
        refusal = (error as Error).message
      }
      expect(pass.A_CYCLE_OF_PINS_STOPS_THE_PASS.length).toBeGreaterThan(20)
      expect(refusal).toContain(pass.A_CYCLE_OF_PINS_STOPS_THE_PASS)
      expect(refusal).toContain('MadeUpCycleX-r1')
      expect(refusal).toContain('MadeUpCycleY-r1')
      expect(theRows(s)).toEqual(before)
      pass.makeTheGuardsAgain(s, lifted)
    } finally {
      s.exec('ROLLBACK')
    }
  })

  it("6. seal pins: the first seal's pins name the new rows' hashes, and its own hash is remade", async () => {
    await afterThePass((did, _before, s) => {
      const seal = theSeal(s, f.seals.first)
      const pins = theSealsRecords(seal)
      expect(pins.records[0]?.['before']).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.note, 1), THE_LAST_LIST)) }))
      expect(pins.records[0]?.['after']).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.note, 3), THE_LAST_LIST)) }))
      expect(pins.dependencies[0]).toEqual(expect.objectContaining({ hash: theHashOf(cut(theRevision(s, f.comment, 1), THE_LAST_LIST)) }))
      expect(seal['hash']).not.toBe(f.firstSealsHash)
      expect(seal['hash']).toBe(theSealsOwnHash(seal))
      const row = theRevision(s, f.seals.first, 1)
      expect(row['content_hash']).toBe(theContentHash('sealed_tip', SEAL_TITLE, theDataOf(row)))
      expect(did.counts.sealPinsRemade).toBe(4)
      expect(did.counts.sealsRemade).toBe(2)
    })
  })

  it("7. older column list: the second seal's pin is remade in the columns of 0060, not today's", async () => {
    await afterThePass((_did, before, s) => {
      const row = theRevision(s, f.older, 1)
      const pin = theSealsRecords(theSeal(s, f.seals.older)).records[0]?.['after'] as Row
      const old = theSealsRecords(JSON.parse(String((JSON.parse(String(before.revisions[`${f.seals.older}-r1`])) as Row)['data']))['seal'] as Row).records[0]?.['after'] as Row
      expect(pin['hash']).not.toBe(old['hash'])
      expect(pin['hash']).toBe(theHashOf(cut(row, THE_FIRST_LIST)))
      expect(pin['hash']).not.toBe(theHashOf(cut(row, THE_LAST_LIST)))
      expect(theSeal(s, f.seals.older)['hash']).toBe(theSealsOwnHash(theSeal(s, f.seals.older)))
    })
  })

  it("8. links: the link's writer takes the rule's id, a pin that held is remade, and a pin that did not keeps its bytes and is counted", async () => {
    await afterThePass((did, before, s) => {
      const link = theLinkRow(s, f.link)
      expect(link['created_by']).toBe(RULED_STILT)
      expect(link['from_id']).toBe(f.note)
      expect(link['to_id']).toBe(f.comment)
      expect(theSealsRecords(theSeal(s, f.seals.first)).links[0]).toEqual({ id: f.link, hash: theHashOf(link), inferred: false })
      expect(theSealsRecords(theSeal(s, f.seals.badLink)).links[0]).toEqual({ id: f.link, hash: 'e'.repeat(64), inferred: false })
      const now = theRows(s)
      expect(now.records[f.seals.badLink]).toBe(before.records[f.seals.badLink])
      expect(now.revisions[`${f.seals.badLink}-r1`]).toBe(before.revisions[`${f.seals.badLink}-r1`])
      expect(did.counts.linkPinsThatDidNotHold).toBe(1)
    })
  })

  it("9. what pins a seal's hash: the merge entry's seal and the run's release name the new hash, and a pin whose hash was not the seal's keeps its bytes", async () => {
    await afterThePass((did, before, s) => {
      const hash = theSeal(s, f.seals.first)['hash']
      expect(hash).not.toBe(f.firstSealsHash)
      expect(at(theDataOf(theRevision(s, f.merge, 1)), 'seal')).toEqual({ id: f.seals.first, hash })
      expect(at(theRecordsData(s, f.merge), 'seal')).toEqual({ id: f.seals.first, hash })
      expect(at(theDataOf(theRevision(s, f.released, 1)), 'released', 'read')).toEqual({ sealId: f.seals.first, sealHash: hash })
      expect(at(theRecordsData(s, f.released), 'released', 'read')).toEqual({ sealId: f.seals.first, sealHash: hash })
      const now = theRows(s)
      expect(now.records[f.refused]).toBe(before.records[f.refused])
      expect(now.revisions[`${f.refused}-r1`]).toBe(before.revisions[`${f.refused}-r1`])
      expect(did.counts.sealHashPinsRemade).toBe(4)
      expect(did.counts.sealHashPinsKept).toBeGreaterThanOrEqual(2)
    })
  })

  it("10. current data, changes and the other pins: each record's data is its newest revision's, and the search text holds the new id and not the old one", async () => {
    const { theRecordsThatMayHoldOneOf } = await import('../src/server/lib/record-text-index.ts')
    expect(theRecordsThatMayHoldOneOf([STILT])).toContain(f.note)
    await afterThePass((did, _before, s) => {
      for (const id of did.changed.records) {
        expect(one(s, 'SELECT data FROM records WHERE id = ?', id)).toBe(one(s, 'SELECT data FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1', id))
      }
      expect(did.changed.records).toEqual(expect.arrayContaining([f.note, f.comment, f.pinner, f.pinned, f.decisions.stilt, f.merge, f.released, f.letter, f.seals.first, f.seals.older]))
      expect(theRecordsData(s, f.note)['typed_to_agent']).toBe(NEW_STILT)
      expect(at(theRecordsData(s, f.note), 'shortForms', 'label', 'madeFrom', 'contentHash')).toBe(theRevision(s, f.note, 2)['content_hash'])
      expect(theRecordsThatMayHoldOneOf([NEW_STILT])).toContain(f.note)
      expect(theRecordsThatMayHoldOneOf([STILT])).not.toContain(f.note)
      expect(theChange(s, f.changes.typedTo)['new_value']).toBe(NEW_STILT)
      expect(at(JSON.parse(String(theChange(s, f.changes.context)['new_value'])), 'revision', 'contentHash')).toBe(theRevision(s, f.note, 1)['content_hash'])
      expect(did.counts.changePositionsRewritten).toBeGreaterThan(0)
      expect(did.counts.changePinsRemade).toBeGreaterThan(0)
    })
  })

  it('10. a record whose data is not its newest revision is refused by name, and nothing is written', async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    s.exec('BEGIN')
    try {
      s.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify({ body: 'Made-up words, by hand.', typed_to_agent: STILT }), f.note)
      const lifted = pass.liftTheSealedTipGuards(s)
      const before = theRows(s)
      let refusal = ''
      try {
        pass.rewriteTheHistory(s, RULE)
      } catch (error) {
        refusal = (error as Error).message
      }
      expect(pass.A_RECORD_WHOSE_DATA_IS_NOT_ITS_NEWEST_REVISION_STOPS_THE_PASS.length).toBeGreaterThan(20)
      expect(refusal).toContain(pass.A_RECORD_WHOSE_DATA_IS_NOT_ITS_NEWEST_REVISION_STOPS_THE_PASS)
      expect(refusal).toContain(f.note)
      expect(theRows(s)).toEqual(before)
      pass.makeTheGuardsAgain(s, lifted)
    } finally {
      s.exec('ROLLBACK')
    }
  })

  it('11. kept lists: a content-hash row for each revision whose hash moved, a seal-hash row for each old row hash a seal pinned, a link-hash row, and a seal-own-hash row for each remade seal, none with a generation', async () => {
    await afterThePass((did, before, s) => {
      const moved = Object.values(before.revisions)
        .map((text) => JSON.parse(text) as Row)
        .flatMap((was) => {
          const now = s.prepare('SELECT content_hash FROM revisions WHERE id = ?').pluck().get(was['id']) as string
          return now === was['content_hash'] ? [] : [{ list: 'content_hash', recordId: was['record_id'], seq: was['seq'], old: was['content_hash'], new: now }]
        })
      const byList = (list: string) => did.keptLists.filter((row) => row.list === list).map((row) => ({ ...row }))
      expect(byList('content_hash').map(({ linkId: _linkId, ...rest }) => rest)).toEqual(expect.arrayContaining(moved))
      expect(byList('content_hash')).toHaveLength(moved.length)
      const oldSeal = (id: string) => theSealsRecords(JSON.parse(String((JSON.parse(String(before.revisions[`${id}-r1`])) as Row)['data']))['seal'] as Row)
      const newSeal = theSealsRecords(theSeal(s, f.seals.first))
      const sealHash = (record: string, seq: number, was: Row, now: Row) => ({ list: 'seal_hash', recordId: record, seq, old: was['hash'], new: now['hash'] })
      const seals = byList('seal_hash').map(({ linkId: _linkId, ...rest }) => rest)
      expect(seals).toEqual(
        expect.arrayContaining([
          sealHash(f.note, 1, oldSeal(f.seals.first).records[0]?.['before'] as Row, newSeal.records[0]?.['before'] as Row),
          sealHash(f.note, 3, oldSeal(f.seals.first).records[0]?.['after'] as Row, newSeal.records[0]?.['after'] as Row),
          sealHash(f.comment, 1, oldSeal(f.seals.first).dependencies[0] as Row, newSeal.dependencies[0] as Row),
          sealHash(f.older, 1, oldSeal(f.seals.older).records[0]?.['after'] as Row, theSealsRecords(theSeal(s, f.seals.older)).records[0]?.['after'] as Row),
        ]),
      )
      expect(seals).toHaveLength(4)
      expect(byList('link_hash')).toEqual([
        { list: 'link_hash', recordId: null, seq: null, linkId: f.link, old: oldSeal(f.seals.first).links[0]?.['hash'], new: newSeal.links[0]?.['hash'] },
      ])
      expect(byList('agent_id')).toEqual([])

      // A SEAL WHOSE OWN HASH WAS REMADE keeps its old own hash and its new one, at its record and its one revision.
      // The third seal held no pin the pass remade, so it keeps its own hash and has no row.
      const theSealBefore = (id: string) => JSON.parse(String((JSON.parse(String(before.revisions[`${id}-r1`])) as Row)['data']))['seal'] as Row
      const ownHash = (id: string) => ({ list: 'seal_own_hash', recordId: id, seq: 1, old: theSealBefore(id)['hash'], new: theSeal(s, id)['hash'] })
      const owns = byList('seal_own_hash').map(({ linkId: _linkId, ...rest }) => rest)
      expect(ownHash(f.seals.first).old).toBe(f.firstSealsHash)
      expect(owns).toEqual(expect.arrayContaining([ownHash(f.seals.first), ownHash(f.seals.older)]))
      expect(owns).toHaveLength(2)
      expect(theSeal(s, f.seals.badLink)['hash']).toBe(theSealBefore(f.seals.badLink)['hash'])

      // NO ROW IS OF ANOTHER LIST.
      expect(did.keptLists).toHaveLength(moved.length + seals.length + byList('link_hash').length + owns.length)
      for (const row of did.keptLists) expect(Object.keys(row)).not.toContain('generation')
    })
  })

  it('12. untouched rows keep every byte, and the rows the pass says it changed are the rows that changed', async () => {
    await afterThePass((did, before, s) => {
      const now = theRows(s)
      for (const table of Object.keys(THE_TABLES) as Table[]) {
        const differ = Object.keys(before[table]).filter((id) => now[table][id] !== before[table][id])
        expect(Object.keys(now[table]).sort()).toEqual(Object.keys(before[table]).sort())
        expect([...did.changed[table]].sort()).toEqual(differ.sort())
      }
      expect(did.changed.records).not.toContain(f.seals.badLink)
      expect(did.changed.records).not.toContain(f.refused)
      expect(did.changed.records).not.toContain(f.decisions.wren)
      expect(did.changed.revisions).not.toContain(`${f.decisions.wren}-r1`)
    })
  })

  it('13. the guards: after they are made again a sealed tip still refuses an update and a delete, the search text trigger is never lifted, and a missing guard is refused by name', async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    const triggers = () => s.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all() as { name: string; sql: string }[]
    const guards = () => triggers().filter((one) => one.name === 'sealed_tip_no_update' || one.name === 'sealed_tip_no_delete')
    const all = triggers()
    const theGuards = guards()
    expect(theGuards.map((one) => one.name)).toEqual(['sealed_tip_no_delete', 'sealed_tip_no_update'])
    const refusal = /RAISE\s*\(\s*ABORT\s*,\s*'([^']+)'/u.exec(theGuards[0]?.sql ?? '')?.[1] ?? 'no words were read from the guard'
    s.exec('BEGIN')
    try {
      const lifted = pass.liftTheSealedTipGuards(s)
      expect(guards()).toEqual([])
      expect(triggers()).toEqual(all.filter((one) => !theGuards.some((guard) => guard.name === one.name)))
      expect(triggers().map((one) => one.name)).toContain('record_text_on_update')
      pass.rewriteTheHistory(s, RULE)
      pass.makeTheGuardsAgain(s, lifted)
      expect(triggers()).toEqual(all)
      expect(() => s.prepare("UPDATE records SET title = 'Made-up words, changed.' WHERE id = ?").run(f.seals.first)).toThrow(refusal)
      expect(() => s.prepare('DELETE FROM records WHERE id = ?').run(f.seals.first)).toThrow(refusal)
    } finally {
      s.exec('ROLLBACK')
    }
    s.exec('BEGIN')
    try {
      s.exec('DROP TRIGGER sealed_tip_no_delete')
      let said = ''
      try {
        pass.liftTheSealedTipGuards(s)
      } catch (error) {
        said = (error as Error).message
      }
      expect(pass.A_MISSING_GUARD_STOPS_THE_PASS.length).toBeGreaterThan(20)
      expect(said).toContain(pass.A_MISSING_GUARD_STOPS_THE_PASS)
      expect(said).toContain('sealed_tip_no_delete')
      expect(guards().map((one) => one.name)).toEqual(['sealed_tip_no_update'])
    } finally {
      s.exec('ROLLBACK')
    }
    expect(triggers()).toEqual(all)
  })

  it('14. outside a transaction the pass is refused and nothing is written', async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    const before = theRows(s)
    expect(s.inTransaction).toBe(false)
    expect(pass.THE_PASS_RUNS_ONLY_INSIDE_A_TRANSACTION.length).toBeGreaterThan(20)
    expect(() => pass.rewriteTheHistory(s, RULE)).toThrow(pass.THE_PASS_RUNS_ONLY_INSIDE_A_TRANSACTION)
    expect(theRows(s)).toEqual(before)
  })

  it('15. proved_holder and elevation: the id a key proved takes the new id, the name sent and the grant take the rule, with the key order kept, and changes.actor_id is left', async () => {
    await afterThePass((_did, before, s) => {
      const was = (table: Table, id: string) => JSON.parse(String(before[table][id])) as Row
      const remade = (text: unknown, change: Row) => JSON.stringify({ ...(JSON.parse(String(text)) as Row), ...change })
      const first = was('revisions', String(theRevision(s, f.note, 1)['id']))
      expect(theRevision(s, f.note, 1)['proved_holder']).toBe(remade(first['proved_holder'], { id: NEW_STILT, claimed: RULED_STILT }))
      expect(theRevision(s, f.note, 1)['elevation']).toBe(remade(ELEVATION, { grantedBy: RULED_STILT }))
      const second = was('revisions', String(theRevision(s, f.note, 2)['id']))
      expect(theRevision(s, f.note, 2)['proved_holder']).toBe(remade(second['proved_holder'], { id: NEW_WREN }))
      expect(theChange(s, f.changes.elevated)['elevation']).toBe(remade(ELEVATION, { grantedBy: RULED_STILT }))
      const ours = (s.prepare('SELECT id FROM changes WHERE record_id = ? AND proved_holder IS NOT NULL ORDER BY rowid').pluck().all(f.note) as string[]).filter(
        (id) => (was('changes', id)['actor_id'] as string) !== MINTED.id,
      )
      expect(ours.length).toBeGreaterThan(0)
      for (const id of ours) {
        const old = was('changes', id)
        const proved = JSON.parse(String(old['proved_holder'])) as Row
        expect(theChange(s, id)['proved_holder']).toBe(remade(old['proved_holder'], { id: RULE.newIds.get(String(proved['id'])), ...(proved['claimed'] === STILT ? { claimed: RULED_STILT } : {}) }))
        expect(theChange(s, id)['actor_id']).toBe(old['actor_id'])
      }
    })
  })

  it("16. a change's field: a key written in the path's own form takes the new id, and a key written another way is kept and returned with its row and why", async () => {
    await afterThePass((did, _before, s) => {
      expect(theChange(s, f.changes.worker)['field']).toBe(`data.workerRuns.${NEW_STILT}`)
      expect(theChange(s, f.changes.workerByHash)['field']).toBe(`data.workerRuns[#${STILT}]`)
      expect(did.keptChangeFields).toEqual(expect.arrayContaining([{ changeId: f.changes.workerByHash, field: `data.workerRuns[#${STILT}]`, why: expect.any(String) }]))
      expect(theChange(s, f.changes.typedTo)['field']).toBe('data.typed_to_agent')
    })
  })

  it("17. the dead-letter key: the letter for the legacy agent is remade by the product's own function, and the other is left", async () => {
    const { aDeadLetterKey } = await import('../src/server/lib/dead-letter-key.ts')
    await afterThePass((_did, _before, s) => {
      const waiting = [aDeadLetterKey('MadeUpMsg001', NEW_STILT), `MadeUpMsg002~${MINTED.id}`]
      expect(at(theDataOf(theRevision(s, f.letter, 1)), 'deadLetterSweep', 'waiting')).toEqual(waiting)
      expect(at(theRecordsData(s, f.letter), 'deadLetterSweep', 'waiting')).toEqual(waiting)
    })
  })

  it('18. seal-hash pins in change values: the merge entry seal and the release take the new hash, and a value the pass cannot place keeps its bytes and is returned', async () => {
    await afterThePass((did, before, s) => {
      const hash = theSeal(s, f.seals.first)['hash']
      expect(JSON.parse(String(theChange(s, f.changes.mergeSeal)['new_value']))).toEqual({ id: f.seals.first, hash })
      expect(JSON.parse(String(theChange(s, f.changes.release)['new_value']))).toEqual({ read: { sealId: f.seals.first, sealHash: hash } })
      expect(theRows(s).changes[f.changes.anotherField]).toBe(before.changes[f.changes.anotherField])
      expect(did.keptSealHashPins).toEqual(expect.arrayContaining([expect.objectContaining({ changeId: f.changes.anotherField, why: expect.any(String) })]))
    })
  })

  it("19. a map key: the run's worker keyed by the legacy agent takes its new id, and the keys keep their order", async () => {
    await afterThePass((_did, _before, s) => {
      expect(Object.keys(at(theDataOf(theRevision(s, f.released, 1)), 'workerRuns') as Row)).toEqual([NEW_STILT, MINTED.id])
      expect(Object.keys(at(theRecordsData(s, f.released), 'workerRuns') as Row)).toEqual([NEW_STILT, MINTED.id])
    })
  })

  it("20. a stamp behind its pair: a task's exporter of the agent type takes the rule's id, or keeps its old id where the rule keeps it as typed", async () => {
    const pass = await import('../src/server/db/remint-history.ts')
    const s = t.client.sqlite
    s.exec('BEGIN')
    try {
      const exportedBy = (id: string) => ({ package: { by: { actorType: 'agent', actorId: id } } })
      putIn(s, 'MadeUpTaskS1', 'task', 'A made-up task', exportedBy(STILT), HUMAN)
      putIn(s, 'MadeUpTaskW1', 'task', 'A made-up task', exportedBy(WREN), HUMAN)
      const lifted = pass.liftTheSealedTipGuards(s)
      pass.rewriteTheHistory(s, RULE)
      pass.makeTheGuardsAgain(s, lifted)
      expect(at(theDataOf(theRevision(s, 'MadeUpTaskS1', 1)), 'package', 'by', 'actorId')).toBe(RULED_STILT)
      expect(at(theDataOf(theRevision(s, 'MadeUpTaskW1', 1)), 'package', 'by', 'actorId')).toBe(WREN)
    } finally {
      s.exec('ROLLBACK')
    }
  })

  it("21. the kind of a change's record: a change whose record has no row and one whose record has been two kinds keep their bytes, are counted under their own reason, and their pins of the seal's hash are returned", async () => {
    const s = t.client.sqlite
    // THE KINDS OF EACH CHANGE'S RECORD, read here from its record row and its revisions.
    const kinds = (record: string) =>
      new Set(s.prepare('SELECT kind FROM records WHERE id = ? UNION SELECT kind FROM revisions WHERE record_id = ?').pluck().all(record, record) as string[])
    const changeRows = s.prepare('SELECT id, record_id FROM changes ORDER BY rowid').all() as { id: string; record_id: string }[]
    const ofNoKind = changeRows.filter((row) => kinds(row.record_id).size === 0).map((row) => row.id)
    const ofTwoKinds = changeRows.filter((row) => kinds(row.record_id).size > 1).map((row) => row.id)
    expect(ofNoKind).toEqual([f.changes.noRecord])
    expect(ofTwoKinds).toEqual([f.changes.twoKinds])
    expect([...kinds(f.twoKinds)].sort()).toEqual(['annotation', 'note'])
    expect(theRecordsData(s, f.twoKinds)).toEqual(theDataOf(theRevision(s, f.twoKinds, 2)))

    await afterThePass((did, before, after) => {
      const now = theRows(after)
      for (const id of [f.changes.noRecord, f.changes.twoKinds]) {
        expect(now.changes[id], id).toBe(before.changes[id])
        expect(did.keptSealHashPins, id).toEqual(expect.arrayContaining([expect.objectContaining({ changeId: id, sealId: f.seals.first, hash: f.firstSealsHash, why: expect.any(String) })]))
      }
      expect(did.counts.changeBlocks['no-kind']).toBe(ofNoKind.length)
      expect(did.counts.changeBlocks['kind-changed']).toBe(ofTwoKinds.length)
      const why = (id: string) => did.keptSealHashPins.find((one) => one.changeId === id)?.why
      expect(why(f.changes.noRecord)).not.toBe(why(f.changes.twoKinds))
      expect(did.changed.records).not.toContain(f.twoKinds)
    })
  })
})
