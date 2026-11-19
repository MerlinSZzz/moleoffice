// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT, FROM A MAP STAGED ONCE, RUN LAST AND ALONE. Wave 13s round 158, item 30c part 3. Every legacy agent
 * takes a minted id, as a data migration that rewrites stored values, run last and alone inside a merge's
 * backup-then-migrate step. Migration 0313 made the table it keeps its generation in.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS RUN: STAGE ONCE, THEN APPLY
 * ---------------------------------------------------------------------------------------
 *
 *   npm run db:migrate -- --stage-remint <file>
 *     writes the map planTheRemint makes (lib/registry-aliases/remint-map.ts) into a new file, readable only by its
 *     owner, with a digest of the migrations the store has applied and a fingerprint of its whole agents table. It
 *     writes nothing to the database. It refuses while any migration is pending, and it never overwrites a file.
 *   npm run db:migrate -- --remint <file>
 *     applies that map, after every other data step and in the same transaction, through writeTheRemint
 *     (lib/registry-aliases/remint-write.ts), then rewrites the history through rewriteTheHistory (./remint-history.ts)
 *     and the stored values outside the ledgers through rewriteTheStoredValues (the same file), and writes one row in
 *     registry_remint_generations and the rows of the kept lists.
 *   npm run db:migrate
 *     with no argument, does what it did before this step existed: this step reads and writes nothing.
 *
 * The map is drawn once, when it is staged. So a store and a copy of it, given the same file, give each agent the same
 * new id, and a retry after a failure applies the map the first try had.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES, WRITING NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * A refusal is thrown inside migrateInPlace's one transaction, so that run writes nothing at all. The apply refuses:
 *   - a run that applies a schema migration: the re-mint is the only change its run makes. Run npm run db:migrate
 *     first, then this;
 *   - a store that already applied another map. A store is re-minted once;
 *   - a store whose applied migrations are not the ones the map was staged at;
 *   - a store whose agents table changed after the map was staged: an agent made, renamed, retired or changed;
 *   - a store with a revision whose content hash is not the hash of what it holds, as the stage does;
 *   - a store with a record the revision ledger does not describe, as the stage does;
 *   - a store with a pin that names a revision the ledger does not hold, as the stage does;
 *   - a store with a seal whose pinned revision row no longer hashes to its pin, as the stage does;
 *   - a store whose revisions table has columns the last list of them does not name, as the stage does;
 *   - whatever writeTheRemint refuses;
 *   - a write of the agents that leaves a row of revisions or links not as it was before the write;
 *   - whatever the pass over the history refuses;
 *   - a pass that leaves a row of revisions or links not as it was, where the pass did not name that row;
 *   - after the pass, a wrong content hash, a pin the ledger does not hold or a seal pin that does not hold, read again;
 *   - whatever the rewrite of the stored values refuses;
 *   - after both, a stamp or an actor pair that names anyone but whom it named before the write.
 * A store that already applied this same map is not refused. The step writes nothing and says so.
 *
 * ---------------------------------------------------------------------------------------
 * A WRONG CONTENT HASH STOPS IT, AND IS NEVER MADE RIGHT
 * ---------------------------------------------------------------------------------------
 *
 * The plan for the re-mint keeps every stored hash as it is, and says that one already wrong before the re-mint stops
 * it or is accepted as a reviewed historical limitation. Nothing accepts one yet, so it stops. The stage and the apply
 * both work out each revision's hash from its content, with contentOf and versionOf (lib/version.ts), the routine
 * that wrote it, and compare it with the stored one. Neither writes a hash. The apply checks again because a hash can
 * be changed after the stage. The check reads every revision, twice, which a re-mint run can spend.
 *
 * ---------------------------------------------------------------------------------------
 * A GAP IN THE LEDGER STOPS IT, AND IS NEVER FILLED BY IT
 * ---------------------------------------------------------------------------------------
 *
 * A gap is a record with no revision at all, or a record whose newest revision does not hold what the record holds.
 * The ledger pass (./revision-backfill.ts) fills both on every run, with a baseline or a catch-up revision, earlier in
 * the same transaction as the apply. The plan says a gap found before the re-mint stops it or is accepted as a reviewed
 * historical limitation, and is never repaired by it. Nothing accepts one yet, so it stops. The stage finds the gaps as
 * that pass would, and stops. migrateInPlace reads them again in a --remint run, just before the pass, and the apply
 * refuses with them at the point where it refuses a wrong hash, so the rollback takes back what the pass wrote. A
 * --remint run that re-mints writes no catch-up or baseline revision; one that finds the map already applied re-mints
 * nothing and is a plain migrate.
 *
 * ---------------------------------------------------------------------------------------
 * A PIN TO A REVISION THE LEDGER DOES NOT HOLD STOPS IT, AND IS NEVER REPAIRED BY IT
 * ---------------------------------------------------------------------------------------
 *
 * A pin names one revision by its seq and its content hash. It holds when the ledger has that seq for the record it
 * names, with that hash. The plan's phase 1 checks the pins as they were before the re-mint and keeps them as they are,
 * so a pin that does not hold stops it, as a wrong hash does. Nothing accepts one yet. The stage and the apply read:
 *   - a short form's madeFrom, and the madeFrom of a report's parts, which name the record that holds them;
 *   - the revision of each stored context: a comment's context, a message's target, lead and quotes, a thread
 *     message's context and the quotes it carries, and a review's entry;
 *   - a flow run's flowRevision, which names its flow;
 *   - every object in a record's data whose keys are a record's id, a seq and a content hash and nothing else: an
 *     emergency push's message, the original and approval pins of the stable notices, a judged receipt and a
 *     main-suite fix's receipt.
 * Two kinds of pin are not read, because neither names a revision by both halves. Module planning keeps seqs only. A
 * context bundle export keeps content hashes only. A sealed manifest keeps a hash of a whole row, and the next section
 * reads it. The copies of these pins inside revisions and changes rows are not read yet either. The apply reads the
 * pins after the ledger pass. A record that pass gave a revision was a gap, and the gap stops the run first.
 *
 * ---------------------------------------------------------------------------------------
 * A SEAL'S PIN TO A ROW THAT CHANGED STOPS IT, AND IS NEVER REPAIRED BY IT
 * ---------------------------------------------------------------------------------------
 *
 * A records seal names each submitted record's revision before and after its run, and each record that depends on one,
 * by the revision's id and the sha256 of its whole row. The plan keeps every such pin as it is, so one that does not
 * hold before the re-mint stops it, as a wrong hash does. Nothing accepts one yet. A pin holds when the ledger has a
 * revision with its id, and that row hashes to the pin in the columns revisions had when the seal was made. Columns
 * were added to revisions after seals were made, so the row is read in each list of columns the table has had
 * (lib/the-hash-a-seal-pins-a-row-by.ts). A store whose revisions table has columns the last list does not name is
 * refused, because its rows could not be read as any seal read them. The pins a seal keeps of links are not read: a
 * link is deleted in ordinary use, and migrations have changed link rows, so a link pin that no longer holds is no fault
 * in the history.
 *
 * The write of the agents writes no revisions or links row. So the apply also reads every row of both tables before that
 * write and again after it, as a digest of each row's values in rowid order, and a row that is not as it was stops the
 * run. The pass over the history then rewrites rows of both, and names each row it rewrote. So the apply reads a digest
 * of each row of both tables, by its id, before the pass and again after it. A row that changed and that the pass did not
 * name stops the run, and so does a row gone or added. Then it reads every content hash, every pin and every seal pin
 * again, as it read them before the write. It rewrites the stored values outside the ledgers, which no seal pins, and then
 * reads whom each stamp and actor pair names (lib/registry-aliases/remint-stamps.ts). Each stops the run on its own
 * refusal.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: IT REWRITES STORED VALUES, AND SAYS SO HERE
 * ---------------------------------------------------------------------------------------
 *
 * There is no additive way to give an agent a new id. It rewrites agents.id, and every column whose foreign key ties
 * it to agents.id on each row that holds the old id. It rewrites an old id in the plain columns outside revisions and
 * links where one agent answers to it by that id (remint-plain.ts). It inserts an alias from each old id to the new one,
 * the generation row, and one agent-id row of the kept lists for each legacy agent, its old id and its new one. It
 * deletes nothing. The writes but the last two, the faces and the history below are writeTheRemint's, and its header
 * lists them. It renames each drawn face of a legacy agent to the key of its new id, and keeps the digest the face is
 * drawn from in assets.drawn_from (lib/registry-aliases/remint-faces.ts).
 *
 * It rewrites the history: every old id in revisions, links, records, changes, thread messages and reviews, by the same
 * rule the plain rewrite used, and every content hash, pin, seal and pin of a seal's own hash over what changed
 * (./remint-history.ts, whose header says which rule each position takes). It lifts the two guards of a sealed tip for
 * the pass alone and makes them again from their own text. It files the pass's pairs in the kept lists beside the
 * agent-id rows: each revision's old and new content hash, each seal pin's old and new row hash, each link pin's old and
 * new row hash, and each seal's old and new own hash.
 *
 * It rewrites every old id in the stored values outside revisions and changes, each JSON column the identity reader reads
 * (STORED_COLUMNS in lib/registry-aliases/open-shapes.ts), by the same rules the pass over the history uses.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { THE_MIGRATION_JOURNAL_TABLE } from '../../config/migration-look.mjs'
import { planTheRemint, theAgentsTablesFingerprint, type RemintMap } from './registry-aliases/remint-map.ts'
import { THE_TABLES_SEALS_PIN, theRemintRule } from './registry-aliases/remint-plain.ts'
import { A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT, whereAStampNamesAnyoneElse } from './registry-aliases/remint-stamps.ts'
import { writeTheRemint } from './registry-aliases/remint-write.ts'
import { renameTheDrawnFaces, theDrawnFacesToRename } from './registry-aliases/remint-faces.ts'
import { sealHash, THE_LISTS_OF_REVISION_COLUMNS, theListARevisionRowHashesUnder } from './the-hash-a-seal-pins-a-row-by.ts'
import { HASH_CHARS, contentOf, versionOf } from './version.ts'
import { revisionsReaderOf, wholeRevisionData } from './revision-stored-once.ts'
import { isTargetKind, recordNamedByTarget, type Target } from '../../shared/targets.ts'
import { PARTS_KEY, SHORT_FORMS_FIELD, STORED_SHORT_FORM_LEVELS, readStoredParts, readStoredShortForms } from '../../shared/zoom.ts'
import { liftTheSealedTipGuards, makeTheGuardsAgain, planTheHistoryPass, rewriteTheHistory, rewriteTheStoredValues, type WhatThePassDid } from './remint-history.ts'
import { planManifestEvidence, fileManifestEvidence } from './remint-manifest-evidence.ts'
import { planRevisionBaselines, planStaleLedgers } from './revision-backfill.ts'

/** The migration that made the generation table. The merge queue renames it here if it renumbers the migration. */
export const THE_MIGRATION = '0313_a_remint_keeps_the_map_it_applied'

/** The table that keeps which staged map was applied. */
export const THE_GENERATIONS = 'registry_remint_generations'

/** The table that keeps the old-to-new lists the rewrite applied. */
export const THE_KEPT_LISTS = 'registry_remint_kept_lists'

/** What --stage-remint writes, and all that --remint reads. */
export interface StagedRemint {
  /** The digest of the migrations the store had applied when the map was staged. */
  schema: string
  /** The fingerprint of the whole agents table when the map was staged. */
  agentsTable: string
  map: RemintMap
}

export interface Report {
  /** The digest of the staged map this run was given, or null when it was given none. */
  digest: string | null
  /** True when the store had already applied this map, so nothing was written. */
  alreadyDone: boolean
  /** The agents whose id changed. */
  agents: number
  /** The rows rewritten in each column with a key to agents.id, by its table, a dot and the column. */
  columns: Record<string, number>
  /** The held_keys rows whose holder became the id the map gives its agent. */
  heldKeys: number
  /** The rows rewritten at each plain site, by its table, a dot and the column. */
  plain: Record<string, number>
  /** The aliases filed. */
  aliases: number
  /** The drawn faces renamed to the key of their agent's new id. */
  faces: number
  /** The generation rows written. */
  generations: number
  /** The rows written in the kept lists: one agent-id row for each legacy agent, and each pair the pass over the history kept. */
  keptLists: number
  /** The rows the pass over the history rewrote, by the table. Empty when no pass ran. */
  history: Record<string, number>
  /** The rows rewritten in each stored column outside the ledgers, by its table, a dot and the column. Empty when no pass ran. */
  stored: Record<string, number>
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const A_DIGEST = /^[0-9a-f]{64}$/u
const isAnObject = (one: unknown): one is Record<string, unknown> => typeof one === 'object' && one !== null && !Array.isArray(one)

/** The digest of the migrations this store has applied: the SHA-256 of their hashes, in order. */
export function theAppliedMigrationsDigest(sqlite: Database.Database): string {
  const rows = sqlite.prepare(`SELECT hash FROM "${THE_MIGRATION_JOURNAL_TABLE}" ORDER BY hash`).all() as { hash: string }[]
  return sha256(JSON.stringify(rows.map((row) => row.hash)))
}

/** How the refusal of a store whose history already holds a wrong content hash begins. */
export const A_WRONG_HASH_STOPS_THE_REMINT = 'The re-mint keeps every content hash as it is and repairs none, so it stops on a history that already holds a wrong one.'

/** A revision whose stored content hash is not the hash of what it holds. `holds` is null when its data is not JSON. */
interface AWrongHash {
  id: string
  recordId: string
  seq: number
  stored: string
  holds: string | null
}

/** Every revision whose stored content hash is not the hash of its content, in record and seq order. It writes nothing. */
export function theRevisionsWhoseHashIsWrong(sqlite: Database.Database): AWrongHash[] {
  type ARow = { id: string; record_id: string; seq: number; content_hash: string; kind: string; title: string; summary: string | null; data: string; deleted_at: string | null; parts: string | null }
  const rows = sqlite
    .prepare('SELECT id, record_id, seq, content_hash, kind, title, summary, data, deleted_at, parts FROM revisions ORDER BY record_id, seq')
    .iterate() as IterableIterator<ARow>
  const wrong: AWrongHash[] = []
  const check = (row: ARow, data: Record<string, unknown>): void => {
    const holds = versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data, deletedAt: row.deleted_at }))
    if (holds !== row.content_hash) wrong.push({ id: row.id, recordId: row.record_id, seq: row.seq, stored: row.content_hash, holds })
  }
  // THE HASH IS OF THE WHOLE CONTENT, so a revision that stores a value once is put back together first, after the
  // walk, because the walk holds the connection. One that cannot be put back together throws, naming it.
  const storedOnce: { row: ARow; stored: Record<string, unknown> }[] = []
  for (const row of rows) {
    let data: Record<string, unknown>
    try {
      data = JSON.parse(row.data) as Record<string, unknown>
    } catch {
      wrong.push({ id: row.id, recordId: row.record_id, seq: row.seq, stored: row.content_hash, holds: null })
      continue
    }
    if (row.parts === null) check(row, data)
    else storedOnce.push({ row, stored: data })
  }
  const read = revisionsReaderOf(sqlite)
  for (const { row, stored } of storedOnce) check(row, wholeRevisionData({ recordId: row.record_id, seq: row.seq, data: stored, parts: row.parts }, read))
  wrong.sort((a, b) => (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : a.seq - b.seq))
  return wrong
}

/** The refusal of a store with these wrong hashes, naming the first five, and ending with what was not done. */
function aWrongHashRefusal(wrong: readonly AWrongHash[], nothing: string): string {
  const named = wrong.slice(0, 5).map((one) =>
    one.holds === null
      ? `revision ${String(one.seq)} of record ${one.recordId} carries ${one.stored}, and its data is not JSON`
      : `revision ${String(one.seq)} of record ${one.recordId} carries ${one.stored}, and what it holds hashes to ${one.holds}`,
  )
  const more = wrong.length > named.length ? `, and ${String(wrong.length - named.length)} more` : ''
  return (
    `${A_WRONG_HASH_STOPS_THE_REMINT} ${String(wrong.length)} revision(s) carry a content hash that is not the hash of what they hold: ` +
    `${named.join('; ')}${more}. Nothing yet accepts a wrong hash as a reviewed historical limitation. ${nothing}`
  )
}

/** How the refusal of a store with a record the revision ledger does not describe begins. */
export const A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT = 'The re-mint adds no revision and fills no gap in the revision ledger, so it stops on a record the ledger does not describe.'

/** A record with no revision, when `newestSeq` is null, or whose newest revision, `newestSeq`, does not hold what it holds. */
export interface AGapInTheLedger {
  recordId: string
  newestSeq: number | null
}

/** Every record the ledger pass would give a baseline or a catch-up revision, found as that pass finds them. It writes nothing. */
export function theGapsInTheLedger(sqlite: Database.Database): AGapInTheLedger[] {
  const none = planRevisionBaselines(sqlite).records.map((row) => ({ recordId: row.id, newestSeq: null }))
  const stale = planStaleLedgers(sqlite).records.map((row) => ({ recordId: row.id, newestSeq: row.newest_seq }))
  return [...none, ...stale]
}

/** The refusal of a store with these gaps, naming the first five, and ending with what was not done. */
function aGapRefusal(gaps: readonly AGapInTheLedger[], nothing: string): string {
  const named = gaps.slice(0, 5).map((one) =>
    one.newestSeq === null
      ? `record ${one.recordId} has no revision`
      : `the newest revision of record ${one.recordId}, ${String(one.newestSeq)}, does not hold what the record holds`,
  )
  const more = gaps.length > named.length ? `, and ${String(gaps.length - named.length)} more` : ''
  return (
    `${A_GAP_IN_THE_LEDGER_STOPS_THE_REMINT} ${String(gaps.length)} record(s) have no revision, or a newest revision that does not hold what they hold: ` +
    `${named.join('; ')}${more}. Nothing yet accepts a gap in the ledger as a reviewed historical limitation. ${nothing}`
  )
}

/** How the refusal of a store with a pin to a revision the ledger does not hold begins. */
export const A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT =
  'The re-mint keeps every pin to a revision as it is and repairs none, so it stops on a pin that names a revision the ledger does not hold.'

/** A pin as it is stored: where in its row, the record it names, or null when it names something that is not one, and its two halves. */
export interface AStoredPin {
  path: string
  recordId: string | null
  seq: unknown
  contentHash: unknown
}

/** A pin the ledger does not hold: the row that stores it, the pin, and the hash the ledger holds at its seq, or null when it holds none. */
export interface APinTheLedgerDoesNotHold extends AStoredPin {
  table: 'records' | 'agent_messages' | 'reviews'
  rowId: string
  holds: string | null
}

/** The pin at `path`, naming `recordId`, read from `revision`, which should be a seq and a content hash. */
function aPin(path: string, recordId: string | null, revision: unknown): AStoredPin {
  const held = isAnObject(revision) ? revision : {}
  return { path, recordId, seq: held['seq'], contentHash: held['contentHash'] }
}

/** The pin of a stored context at `path`, naming the record its target names, or none when it carries no revision. */
export function theContextsPin(context: unknown, path: string): AStoredPin[] {
  if (!isAnObject(context) || context['revision'] === undefined) return []
  const target = context['target']
  const named = isAnObject(target) && typeof target['kind'] === 'string' && isTargetKind(target['kind']) ? recordNamedByTarget(target as unknown as Target) : null
  return [aPin(`${path}.revision`, named, context['revision'])]
}

/** Every object at `path` and below whose keys are a record's id, a seq and a content hash, and nothing else. */
function theRecordPinsIn(value: unknown, path: string): AStoredPin[] {
  if (Array.isArray(value)) return value.flatMap((one, at) => theRecordPinsIn(one, `${path}[${String(at)}]`))
  if (!isAnObject(value)) return []
  const keys = Object.keys(value).sort().join(' ')
  if (keys === 'contentHash id seq' || keys === 'contentHash recordId seq') {
    const named = value['id'] ?? value['recordId']
    return [aPin(path, typeof named === 'string' ? named : null, value)]
  }
  return Object.entries(value).flatMap(([key, one]) => theRecordPinsIn(one, `${path}.${key}`))
}

/** Every pin the data of record `id`, of `kind`, holds, each read where the office stores it. */
export function thePinsARecordHolds(id: string, kind: string, data: Record<string, unknown>): AStoredPin[] {
  const forms = readStoredShortForms(data[SHORT_FORMS_FIELD])
  const parts = readStoredParts(data[SHORT_FORMS_FIELD])
  const quotes = kind === 'message' && Array.isArray(data['quotes']) ? (data['quotes'] as unknown[]) : []
  return [
    ...STORED_SHORT_FORM_LEVELS.flatMap((level) => (forms[level] === undefined ? [] : [aPin(`data.${SHORT_FORMS_FIELD}.${level}.madeFrom`, id, forms[level].madeFrom)])),
    ...(parts === null ? [] : [aPin(`data.${SHORT_FORMS_FIELD}.${PARTS_KEY}.madeFrom`, id, parts.madeFrom)]),
    ...(kind === 'annotation' ? theContextsPin(data['context'], 'data.context') : []),
    ...(kind === 'message' ? theContextsPin(data['target'], 'data.target') : []),
    ...(kind === 'message' ? theContextsPin(data['lead'], 'data.lead') : []),
    ...quotes.flatMap((quote, at) => theContextsPin(quote, `data.quotes[${String(at)}]`)),
    ...(kind === 'flow_run' && data['flowRevision'] !== undefined ? [aPin('data.flowRevision', typeof data['flow'] === 'string' ? data['flow'] : null, data['flowRevision'])] : []),
    ...theRecordPinsIn(data, 'data'),
  ]
}

/**
 * Every pin to a revision that the ledger does not hold, in records, thread messages and reviews, each table in id
 * order. A pin holds when the ledger has its seq for the record it names, with its content hash. It writes nothing.
 */
export function thePinsTheLedgerDoesNotHold(sqlite: Database.Database): APinTheLedgerDoesNotHold[] {
  const theLedger = sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').pluck()
  const notHeld: APinTheLedgerDoesNotHold[] = []
  const check = (table: APinTheLedgerDoesNotHold['table'], rowId: string, pins: readonly AStoredPin[]) => {
    for (const pin of pins) {
      const readable = pin.recordId !== null && typeof pin.seq === 'number' && typeof pin.contentHash === 'string'
      const holds = readable ? ((theLedger.get(pin.recordId, pin.seq) as string | undefined) ?? null) : null
      if (holds !== pin.contentHash) notHeld.push({ table, rowId, ...pin, holds })
    }
  }
  const records = sqlite.prepare('SELECT id, kind, data FROM records ORDER BY id').all() as { id: string; kind: string; data: string }[]
  for (const row of records) check('records', row.id, thePinsARecordHolds(row.id, row.kind, JSON.parse(row.data) as Record<string, unknown>))
  const messages = sqlite.prepare('SELECT id, context, carries FROM agent_messages ORDER BY id').all() as { id: string; context: string | null; carries: string | null }[]
  for (const row of messages) {
    check('agent_messages', row.id, theContextsPin(row.context === null ? undefined : JSON.parse(row.context), 'context'))
    const carried = row.carries === null ? [] : (JSON.parse(row.carries) as unknown[])
    check('agent_messages', row.id, carried.flatMap((one, at) => theContextsPin(isAnObject(one) ? one['quote'] : undefined, `carries[${String(at)}].quote`)))
  }
  const reviews = sqlite.prepare('SELECT id, entry FROM reviews ORDER BY id').all() as { id: string; entry: string }[]
  for (const row of reviews) check('reviews', row.id, theContextsPin(JSON.parse(row.entry), 'entry'))
  return notHeld
}

/** The refusal of a store with these pins, naming the first five, and ending with what was not done. */
function aPinRefusal(pins: readonly APinTheLedgerDoesNotHold[], nothing: string): string {
  const named = pins.slice(0, 5).map((one) => {
    const where = `${one.path} of ${one.table} row ${one.rowId}`
    if (one.recordId === null) return `${where} names a revision of something that is not a record`
    if (typeof one.seq !== 'number' || typeof one.contentHash !== 'string') return `${where} does not name a revision of record ${one.recordId} by a seq and a content hash`
    const pinned = `${where} names revision ${String(one.seq)} of record ${one.recordId} with ${one.contentHash}`
    return one.holds === null ? `${pinned}, and the ledger has no such revision` : `${pinned}, and the ledger holds ${one.holds} at that revision`
  })
  const more = pins.length > named.length ? `, and ${String(pins.length - named.length)} more` : ''
  return (
    `${A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT} ${String(pins.length)} pin(s) name a revision the ledger does not hold: ` +
    `${named.join('; ')}${more}. Nothing yet accepts such a pin as a reviewed historical limitation. ${nothing}`
  )
}

/** How the refusal of a store with a seal whose pinned revision row no longer hashes to its pin begins. */
export const A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT =
  'The re-mint keeps every seal as it is and repairs none, so it stops on a seal that pins a revision row which no longer hashes to its pin.'

/** How the refusal of a revisions table whose columns cannot be read safely begins. */
export const A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT =
  "The re-mint reads a seal's revision rows in the columns revisions has had, so it stops on a revisions table whose columns it cannot safely read."

/** A pin of a seal that does not hold: the seal, where in its data, the revision id and hash it names, and whether the ledger holds that revision. */
export interface ASealPinThatDoesNotHold {
  seal: string
  path: string
  revision: unknown
  hash: unknown
  /** True when the ledger holds a revision with that id, whose row then hashes to the pin in none of the lists. */
  found: boolean
}

/** Every pin of a seal's records part, with where it is: each submitted record's revision before and after, and each dependency's. */
export function thePinsASealHolds(records: unknown): { path: string; pin: unknown }[] {
  if (!isAnObject(records)) return []
  const submitted = Array.isArray(records['records']) ? (records['records'] as unknown[]) : []
  const dependencies = Array.isArray(records['dependencies']) ? (records['dependencies'] as unknown[]) : []
  return [
    ...submitted.flatMap((one, at) => {
      const held = isAnObject(one) ? one : {}
      const path = `data.seal.records.records[${String(at)}]`
      return [...(held['before'] === null ? [] : [{ path: `${path}.before`, pin: held['before'] }]), { path: `${path}.after`, pin: held['after'] }]
    }),
    ...dependencies.map((pin, at) => ({ path: `data.seal.records.dependencies[${String(at)}]`, pin })),
  ]
}

/**
 * Every pin of a seal that does not hold, in seal id order. A pin names a revision by its id and the hash of its row. It
 * holds when the ledger has a revision with that id whose row hashes to the pin in one of the lists of columns revisions
 * has had (lib/the-hash-a-seal-pins-a-row-by.ts). It writes nothing. It refuses a revisions table whose columns are not
 * any known list, because a row of that table could then not be read as any seal read it. This read-only check also
 * works before an older store is upgraded; the remint itself separately requires the current schema.
 */
export function theSealPinsThatDoNotHold(sqlite: Database.Database): ASealPinThatDoesNotHold[] {
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('revisions') ORDER BY cid").pluck().all() as string[]
  if (!THE_LISTS_OF_REVISION_COLUMNS.some((list) => JSON.stringify(columns) === JSON.stringify(list.columns))) {
    throw new Error(
      `${A_REVISIONS_TABLE_THE_LISTS_DO_NOT_NAME_STOPS_THE_REMINT} This store's revisions table has ${columns.join(', ')}. ` +
        `A migration that adds a column to revisions adds its entry to THE_COLUMNS_REVISIONS_HAS_HAD. Nothing was written.`,
    )
  }
  const theRow = sqlite.prepare('SELECT * FROM revisions WHERE id = ?')
  const notHeld: ASealPinThatDoesNotHold[] = []
  const seals = sqlite.prepare("SELECT id, data FROM records WHERE kind = 'sealed_tip' ORDER BY id").all() as { id: string; data: string }[]
  for (const seal of seals) {
    const data = JSON.parse(seal.data) as Record<string, unknown>
    for (const { path, pin } of thePinsASealHolds(isAnObject(data['seal']) ? data['seal']['records'] : undefined)) {
      const held = isAnObject(pin) ? pin : {}
      const row = typeof held['id'] === 'string' ? (theRow.get(held['id']) as Record<string, unknown> | undefined) : undefined
      if (row !== undefined && typeof held['hash'] === 'string' && theListARevisionRowHashesUnder(row, held['hash']) !== null) continue
      notHeld.push({ seal: seal.id, path, revision: held['id'], hash: held['hash'], found: row !== undefined })
    }
  }
  return notHeld
}

/** The refusal of a store with these pins of a seal, naming the first five, and ending with what was not done. */
function aSealPinRefusal(pins: readonly ASealPinThatDoesNotHold[], nothing: string): string {
  const named = pins.slice(0, 5).map((one) => {
    const where = `${one.path} of seal ${one.seal}`
    if (typeof one.revision !== 'string' || typeof one.hash !== 'string') return `${where} does not name a revision by an id and a hash`
    const pinned = `${where} names revision ${one.revision} with ${one.hash}`
    return one.found
      ? `${pinned}, and that row hashes to it in none of the ${String(THE_LISTS_OF_REVISION_COLUMNS.length)} lists of columns revisions has had`
      : `${pinned}, and the ledger has no such revision`
  })
  const more = pins.length > named.length ? `, and ${String(pins.length - named.length)} more` : ''
  return (
    `${A_SEALED_ROW_THAT_CHANGED_STOPS_THE_REMINT} ${String(pins.length)} pin(s) of a seal do not hold: ` +
    `${named.join('; ')}${more}. Nothing yet accepts such a pin as a reviewed historical limitation. ${nothing}`
  )
}

/** How the refusal of a re-mint whose write of the agents changed a revisions or links row begins. */
export const A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT =
  "The re-mint's write of the agents writes no revisions or links row, so it stops when that write leaves a row of either not as it was."

/** How the refusal of a pass over the history that changed a revisions or links row it did not name begins. */
export const A_PASS_THAT_CHANGED_A_ROW_IT_DID_NOT_NAME_STOPS_THE_REMINT =
  'The pass over the history names each revisions and links row it rewrites, so the re-mint stops when a row of either is not as it was and the pass did not name it.'

/** A digest of every row of `table` up to rowid `through`, in rowid order, each with its rowid and as JSON of the values SQLite returns, as a seal reads a row. */
function theRowsUpTo(sqlite: Database.Database, table: (typeof THE_TABLES_SEALS_PIN)[number], through: number): string {
  const digest = createHash('sha256')
  for (const row of sqlite.prepare(`SELECT rowid AS "rowid", * FROM "${table}" WHERE rowid <= ? ORDER BY rowid`).iterate(through)) digest.update(`${JSON.stringify(row)}\n`)
  return digest.digest('hex')
}

/** A digest of each row of `table`, by its id: the sha256 of the JSON of its rowid and the values SQLite returns. */
function theRowsById(sqlite: Database.Database, table: (typeof THE_TABLES_SEALS_PIN)[number]): Map<string, string> {
  const rows = new Map<string, string>()
  for (const row of sqlite.prepare(`SELECT rowid AS "rowid", * FROM "${table}" ORDER BY rowid`).iterate() as IterableIterator<Record<string, unknown>>) {
    rows.set(String(row['id']), sha256(JSON.stringify(row)))
  }
  return rows
}

/** Each row of a table a seal pins that is not as it was before the pass and that the pass did not name, or that is gone or added, in words. */
function theRowsThePassDidNotName(sqlite: Database.Database, before: readonly { table: (typeof THE_TABLES_SEALS_PIN)[number]; rows: Map<string, string> }[], did: WhatThePassDid): string[] {
  return before.flatMap(({ table, rows }) => {
    const named = new Set(did.changed[table])
    const now = theRowsById(sqlite, table)
    const changed = [...rows].flatMap(([id, digest]) => {
      const after = now.get(id)
      if (after === undefined) return [`the row ${JSON.stringify(id)} of ${table} is gone`]
      return after !== digest && !named.has(id) ? [`the row ${JSON.stringify(id)} of ${table} changed, and the pass did not name it`] : []
    })
    const added = [...now.keys()].filter((id) => !rows.has(id)).map((id) => `the row ${JSON.stringify(id)} of ${table} was added`)
    return [...changed, ...added]
  })
}

/**
 * STAGE THE MAP: write it into `file`, which must not exist, and return it. `pending` is every migration this store has
 * not applied; a map is staged only when it is empty. `draw` makes one new id; it is the mint unless a test gives
 * another. It writes nothing to the database.
 */
export function stageTheRemint(sqlite: Database.Database, file: string, pending: readonly string[], draw?: () => string): StagedRemint {
  if (pending.length > 0) {
    throw new Error(
      `A re-mint map is staged only when every migration is applied, and ${String(pending.length)} ${pending.length === 1 ? 'is' : 'are'} not: ` +
        `${pending.join(', ')}. Run npm run db:migrate first. Nothing was staged.`,
    )
  }
  // One read transaction, so the digest, the fingerprint, the hashes, gaps and pins checked and the map are of the same moment.
  const read = sqlite.transaction(() => ({
    schema: theAppliedMigrationsDigest(sqlite),
    agentsTable: theAgentsTablesFingerprint(sqlite),
    wrong: theRevisionsWhoseHashIsWrong(sqlite),
    gaps: theGapsInTheLedger(sqlite),
    pins: thePinsTheLedgerDoesNotHold(sqlite),
    seals: theSealPinsThatDoNotHold(sqlite),
    plan: planTheRemint(sqlite, draw),
  }))()
  if (read.wrong.length > 0) throw new Error(aWrongHashRefusal(read.wrong, 'Nothing was staged.'))
  if (read.gaps.length > 0) throw new Error(aGapRefusal(read.gaps, 'Nothing was staged.'))
  if (read.pins.length > 0) throw new Error(aPinRefusal(read.pins, 'Nothing was staged.'))
  if (read.seals.length > 0) throw new Error(aSealPinRefusal(read.seals, 'Nothing was staged.'))
  if ('refused' in read.plan) throw new Error(`The re-mint map could not be made, so nothing was staged. ${read.plan.refused.join(' ')}`)
  const staged: StagedRemint = { schema: read.schema, agentsTable: read.agentsTable, map: read.plan.map }
  try {
    writeFileSync(file, `${JSON.stringify(staged, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${file} already exists. A staged map is never overwritten, so every run of the re-mint applies the same one. Apply that file, or name a new one.`)
    }
    throw error
  }
  return staged
}

/** What --stage-remint says after it staged a map in `file`. */
export function describeTheStagedRemint(staged: StagedRemint, file: string): string {
  const legacy = staged.map.entries.filter((entry) => entry.from === 'legacy').length
  return (
    `re-mint map ${staged.map.digest} staged in ${file}: ${String(legacy)} legacy agent(s) take a new id, and ` +
    `${String(staged.map.entries.length - legacy)} minted agent(s) keep theirs. Nothing was written to the database. ` +
    `Apply it with npm run db:migrate -- --remint ${file}`
  )
}

/** Everything that makes `value` not what --stage-remint writes, or an empty list. */
function whatIsWrongWith(value: unknown): string[] {
  const keysAre = (one: Record<string, unknown>, keys: readonly string[]) => JSON.stringify(Object.keys(one).sort()) === JSON.stringify([...keys].sort())
  if (!isAnObject(value) || !keysAre(value, ['schema', 'agentsTable', 'map'])) return ['it is not an object with exactly schema, agentsTable and map']
  const wrong: string[] = []
  if (typeof value['schema'] !== 'string' || !A_DIGEST.test(value['schema'])) wrong.push('schema is not a digest')
  if (typeof value['agentsTable'] !== 'string' || !A_DIGEST.test(value['agentsTable'])) wrong.push('agentsTable is not a digest')
  const map = value['map']
  if (!isAnObject(map) || !keysAre(map, ['entries', 'digest'])) return [...wrong, 'map is not an object with exactly entries and digest']
  if (typeof map['digest'] !== 'string' || !A_DIGEST.test(map['digest'])) wrong.push("the map's digest is not a digest")
  if (!Array.isArray(map['entries'])) return [...wrong, "the map's entries are not a list"]
  map['entries'].forEach((entry: unknown, at: number) => {
    const fine =
      isAnObject(entry) &&
      keysAre(entry, ['oldId', 'newId', 'handle', 'retired', 'from', 'fingerprint']) &&
      typeof entry['oldId'] === 'string' &&
      typeof entry['newId'] === 'string' &&
      typeof entry['handle'] === 'string' &&
      typeof entry['retired'] === 'boolean' &&
      (entry['from'] === 'minted' || entry['from'] === 'legacy') &&
      typeof entry['fingerprint'] === 'string' &&
      A_DIGEST.test(entry['fingerprint'])
    if (!fine) wrong.push(`entry ${String(at)} is not an entry of a map`)
  })
  return wrong
}

/** READ A STAGED MAP, or throw a sentence that names the file and what is wrong with it. It reads only the file. */
export function readTheStagedRemint(file: string): StagedRemint {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`The staged re-mint map ${file} could not be read: ${(error as Error).message}. Nothing was written.`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`The staged re-mint map ${file} is not JSON. Nothing was written.`)
  }
  const wrong = whatIsWrongWith(value)
  if (wrong.length > 0) throw new Error(`${file} is not a map that --stage-remint writes: ${wrong.join('; ')}. Nothing was written.`)
  return value as StagedRemint
}

/** Write one generation row. The re-mint is its writer, and the restore proof files a made-up one through it. */
export function fileTheRemintGeneration(sqlite: Database.Database, row: { digest: string; schema: string; agents: number }): void {
  sqlite.prepare(`INSERT INTO ${THE_GENERATIONS} (digest, schema_digest, agents) VALUES (?, ?, ?)`).run(row.digest, row.schema, row.agents)
}

/** One old-to-new pair of one of the five lists, in one generation. */
export interface AKeptListRow {
  /**
   * Which list the pair belongs to: an agent id, a revision's content hash, the hash a seal pinned its row by, a link's
   * row hash, or a seal's own hash.
   */
  list: 'agent_id' | 'content_hash' | 'seal_hash' | 'link_hash' | 'seal_own_hash'
  /** The revision the pair is about, the seal's own revision on a `seal_own_hash` row, and null on an `agent_id` or `link_hash` row. */
  recordId: string | null
  /** The revision's 1-based seq, and null on an `agent_id` or `link_hash` row. */
  seq: number | null
  /** The link a `link_hash` row is about; absent or null on the other four lists. */
  linkId?: string | null
  /** The value before the rewrite. */
  old: string
  /** The value the rewrite gave it. */
  new: string
}

/**
 * Write these kept-list rows in this generation, through one prepared statement. It opens no transaction: its caller
 * runs inside the transaction the rewrite already opened, as the generation writer's caller does.
 */
export function fileTheKeptLists(sqlite: Database.Database, generation: string, rows: readonly AKeptListRow[]): void {
  const insert = sqlite.prepare(`INSERT INTO ${THE_KEPT_LISTS} (generation, list, record_id, seq, link_id, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  for (const row of rows) insert.run(generation, row.list, row.recordId, row.seq, row.linkId ?? null, row.old, row.new)
}

/**
 * APPLY A STAGED MAP, inside migrateInPlace's transaction and after every other step. `applied` is the migrations this
 * run applied. `gaps` is what theGapsInTheLedger found in this run, before the ledger pass filled them. Given no map, it
 * reads and writes nothing. A refusal is thrown, and the caller's rollback writes nothing.
 */
export function applyTheStagedRemint(
  sqlite: Database.Database,
  staged: StagedRemint | null,
  applied: readonly string[],
  gaps: readonly AGapInTheLedger[],
): Report {
  const report: Report = { digest: null, alreadyDone: false, agents: 0, columns: {}, heldKeys: 0, plain: {}, aliases: 0, faces: 0, generations: 0, keptLists: 0, history: {}, stored: {} }
  if (staged === null) return report
  report.digest = staged.map.digest
  if (applied.length > 0) {
    throw new Error(
      `The re-mint runs alone, and this run would apply ${String(applied.length)} migration(s) first: ${applied.join(', ')}. ` +
        'Run npm run db:migrate without --remint, then run it again with --remint.',
    )
  }
  const generations = (sqlite.prepare(`SELECT digest FROM ${THE_GENERATIONS} ORDER BY digest`).all() as { digest: string }[]).map((row) => row.digest)
  if (generations.includes(staged.map.digest)) {
    report.alreadyDone = true
    return report
  }
  if (generations.length > 0) {
    throw new Error(`This store already applied another re-mint map, ${generations.join(', ')}, and a store is re-minted once. The staged map ${staged.map.digest} is refused.`)
  }
  if (theAppliedMigrationsDigest(sqlite) !== staged.schema) {
    throw new Error('The migrations this store has applied are not the ones the map was staged at. Stage a new map on this store.')
  }
  if (theAgentsTablesFingerprint(sqlite) !== staged.agentsTable) {
    throw new Error('The agents table changed after the map was staged: an agent was made, renamed, retired or changed. Stage a new map.')
  }
  const wrong = theRevisionsWhoseHashIsWrong(sqlite)
  if (wrong.length > 0) throw new Error(aWrongHashRefusal(wrong, 'Nothing was written.'))
  if (gaps.length > 0) throw new Error(aGapRefusal(gaps, 'Nothing was written.'))
  const pins = thePinsTheLedgerDoesNotHold(sqlite)
  if (pins.length > 0) throw new Error(aPinRefusal(pins, 'Nothing was written.'))
  const seals = theSealPinsThatDoNotHold(sqlite)
  if (seals.length > 0) throw new Error(aSealPinRefusal(seals, 'Nothing was written.'))
  // EVERY ROW A SEAL COULD PIN IS READ BEFORE THE WRITE AND AGAIN AFTER IT, a second guard beside the check of the pins.
  const before = THE_TABLES_SEALS_PIN.map((table) => {
    const through = sqlite.prepare(`SELECT COALESCE(MAX(rowid), 0) FROM "${table}"`).pluck().get() as number
    return { table, through, digest: theRowsUpTo(sqlite, table, through) }
  })
  // Read and validate the original history before the registry or any plain column changes.
  const originalRule = theRemintRule(sqlite, staged.map)
  const originalHistory = planTheHistoryPass(sqlite, originalRule)
  const manifestEvidence = planManifestEvidence(sqlite, originalRule, originalHistory)
  const written = writeTheRemint(sqlite, staged.map)
  if ('refused' in written) throw new Error(`The re-mint refused the staged map. ${written.refused.join(' ')}`)
  const faces = theDrawnFacesToRename(sqlite, staged.map)
  if ('refused' in faces) throw new Error(`The re-mint refused the staged map. ${faces.refused.join(' ')}`)
  const renamed = renameTheDrawnFaces(sqlite, faces.faces)
  const changed = before.filter((one) => theRowsUpTo(sqlite, one.table, one.through) !== one.digest).map((one) => one.table)
  if (changed.length > 0) {
    throw new Error(`${A_WRITE_THAT_CHANGED_A_ROW_A_SEAL_PINS_STOPS_THE_REMINT} Its write changed a row of ${changed.join(' and ')} that was there before it. Nothing was written.`)
  }
  // THE PASS OVER THE HISTORY, by the rule the write decided, with the guards of a sealed tip lifted for it alone. Each
  // row of the tables a seal pins is read by its id before it and again after it.
  const rowsBefore = THE_TABLES_SEALS_PIN.map((table) => ({ table, rows: theRowsById(sqlite, table) }))
  const lifted = liftTheSealedTipGuards(sqlite)
  const did = rewriteTheHistory(sqlite, written.rule)
  makeTheGuardsAgain(sqlite, lifted)
  const unnamed = theRowsThePassDidNotName(sqlite, rowsBefore, did)
  if (unnamed.length > 0) throw new Error(`${A_PASS_THAT_CHANGED_A_ROW_IT_DID_NOT_NAME_STOPS_THE_REMINT} After the pass, ${unnamed.join('; ')}. Nothing was written.`)
  const wrongAfter = theRevisionsWhoseHashIsWrong(sqlite)
  if (wrongAfter.length > 0) throw new Error(aWrongHashRefusal(wrongAfter, 'The pass over the history left them so. Nothing was written.'))
  const pinsAfter = thePinsTheLedgerDoesNotHold(sqlite)
  if (pinsAfter.length > 0) throw new Error(aPinRefusal(pinsAfter, 'The pass over the history left them so. Nothing was written.'))
  const sealsAfter = theSealPinsThatDoNotHold(sqlite)
  if (sealsAfter.length > 0) throw new Error(aSealPinRefusal(sealsAfter, 'The pass over the history left them so. Nothing was written.'))
  // THE STORED VALUES OUTSIDE THE LEDGERS, by the same rule. No seal pins them, so they are written after the checks above,
  // and the stamp check below reads them too.
  const stored = rewriteTheStoredValues(sqlite, written.rule)
  const named = whereAStampNamesAnyoneElse(sqlite, written.stamps, written.rule.newIds)
  if (named.length > 0) throw new Error(`${A_STAMP_THAT_NAMES_ANYONE_ELSE_STOPS_THE_REMINT} After the pass over the history: ${named.join(' ')} Nothing was written.`)
  fileTheRemintGeneration(sqlite, { digest: staged.map.digest, schema: staged.schema, agents: written.written.agents })
  const legacy = staged.map.entries.filter((entry) => entry.from === 'legacy')
  const kept: AKeptListRow[] = [...legacy.map((entry) => ({ list: 'agent_id' as const, recordId: null, seq: null, old: entry.oldId, new: entry.newId })), ...did.keptLists]
  fileTheKeptLists(sqlite, staged.map.digest, kept)
  fileManifestEvidence(sqlite, staged.map.digest, manifestEvidence)
  const history = Object.fromEntries(Object.entries(did.changed).map(([table, ids]) => [table, ids.length]))
  return { ...report, ...written.written, faces: renamed, generations: 1, keptLists: kept.length, history, stored }
}

/** The rows rewritten in the columns with a key to agents.id. */
function theKeysRewritten(report: Report): number {
  return Object.values(report.columns).reduce((sum, rows) => sum + rows, 0)
}

/** The rows rewritten at the plain sites. */
function thePlainRewritten(report: Report): number {
  return Object.values(report.plain).reduce((sum, rows) => sum + rows, 0)
}

/** The rows of the history the pass rewrote. */
function theHistoryRewritten(report: Report): number {
  return Object.values(report.history).reduce((sum, rows) => sum + rows, 0)
}

/** The rows of the stored columns outside the ledgers the stored step rewrote. */
function theStoredRewritten(report: Report): number {
  return Object.values(report.stored).reduce((sum, rows) => sum + rows, 0)
}

/** The rows this step wrote. */
export function rowsTheRemintWrote(report: Report): number {
  return (
    report.agents +
    theKeysRewritten(report) +
    report.heldKeys +
    thePlainRewritten(report) +
    report.aliases +
    report.faces +
    report.generations +
    report.keptLists +
    theHistoryRewritten(report) +
    theStoredRewritten(report)
  )
}

/** What it did, in one sentence without the step's name: the line the preview puts after that name. */
export function whatTheRemintDid(report: Report): string {
  if (report.digest === null && rowsTheRemintWrote(report) === 0) return 'this run was given no staged map, so nothing was read or written'
  if (report.alreadyDone) return `this store had already applied the staged map ${String(report.digest)}, so nothing was written`
  const keys = Object.entries(report.columns).map(([site, rewritten]) => `${site} ${String(rewritten)}`)
  // Only the plain sites it wrote are named, because there are more than a hundred.
  const plain = Object.entries(report.plain).filter(([, rewritten]) => rewritten > 0).map(([site, rewritten]) => `${site} ${String(rewritten)}`)
  // Only the tables of the history the pass wrote are named.
  const history = Object.entries(report.history).filter(([, rewritten]) => rewritten > 0).map(([table, rewritten]) => `${table} ${String(rewritten)}`)
  // Only the stored columns it wrote are named.
  const stored = Object.entries(report.stored).filter(([, rewritten]) => rewritten > 0).map(([site, rewritten]) => `${site} ${String(rewritten)}`)
  return (
    `gave ${String(report.agents)} legacy agent(s) the new id the staged map ${report.digest ?? 'with no digest'} gives them, ` +
    `rewrote ${String(theKeysRewritten(report))} key(s) to them (${keys.length === 0 ? 'no key column' : keys.join(', ')}), ` +
    `moved ${String(report.heldKeys)} held_keys row(s) to them, ` +
    `rewrote ${String(thePlainRewritten(report))} old id(s) in the plain columns (${plain.length === 0 ? 'no plain column held one' : plain.join(', ')}), ` +
    `renamed ${String(report.faces)} drawn face(s) to the key of their new id, ` +
    `and filed ${String(report.aliases)} alias(es) and ${String(report.generations)} generation row(s); ` +
    (history.length === 0 ? '' : `its pass over the history rewrote ${String(theHistoryRewritten(report))} row(s) (${history.join(', ')}); `) +
    (stored.length === 0 ? '' : `it rewrote ${String(theStoredRewritten(report))} stored value(s) outside the ledgers (${stored.join(', ')}); `) +
    `it kept ${String(report.keptLists)} old-to-new pair(s) in the kept lists`
  )
}

/** The report as a person reads it. */
export function describeTheRemint(report: Report): string {
  return `re-mint: ${whatTheRemintDid(report)}`
}

/** Only the synthetic restore corpus calls this: one made-up generation row, of a map that was never applied. */
export async function fillTheRemintGenerationProof(): Promise<string> {
  const { sqlite } = await import('./client.ts')
  fileTheRemintGeneration(sqlite, { digest: sha256('a made-up re-mint map for the restore proof'), schema: theAppliedMigrationsDigest(sqlite), agents: 0 })
  return 'registry_remint_generations: one made-up generation row, of a map that was never applied, filed through its writer'
}

/** Only the synthetic restore corpus calls this: a made-up generation and one made-up row of each kept list. */
export async function fillTheKeptListsProof(): Promise<string> {
  const { sqlite } = await import('./client.ts')
  const generation = sha256('a made-up re-mint generation for the kept lists of the restore proof')
  fileTheRemintGeneration(sqlite, { digest: generation, schema: theAppliedMigrationsDigest(sqlite), agents: 0 })
  fileTheKeptLists(sqlite, generation, [
    { list: 'agent_id', recordId: null, seq: null, old: 'a-made-up-old-agent', new: sha256('a made-up new agent id').slice(0, 12) },
    { list: 'content_hash', recordId: 'a-made-up-record', seq: 1, old: sha256('a made-up old content').slice(0, HASH_CHARS), new: sha256('a made-up new content').slice(0, HASH_CHARS) },
    { list: 'seal_hash', recordId: 'a-made-up-record', seq: 1, old: sha256('a made-up old seal row'), new: sha256('a made-up new seal row') },
    { list: 'link_hash', recordId: null, seq: null, linkId: 'a-made-up-link', old: sha256('a made-up old link row'), new: sha256('a made-up new link row') },
    { list: 'seal_own_hash', recordId: 'a-made-up-record', seq: 1, old: sealHash('a made-up old seal content'), new: sealHash('a made-up new seal content') },
  ])
  return 'registry_remint_kept_lists: one made-up generation row and one made-up row of each of the agent-id, content-hash, seal-hash, link-hash and seal-own-hash lists, filed through their writers'
}
