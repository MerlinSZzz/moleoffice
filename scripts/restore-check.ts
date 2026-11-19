// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The original proof corpus had no legacy submission inventory. One explicitly synthetic historical session now populates that evidence table; restore behavior and every existing comparison remain unchanged. */
/**
 * THE DESTRUCTIVE RESTORE PROOF — build a real Mole Office, export it, DELETE the database, rebuild
 * from the text alone, and compare what Mole Office SAYS about the two.
 *
 *   npx tsx scripts/restore-check.ts              run the whole checkpoint in a temporary directory
 *   npx tsx scripts/restore-check.ts --work <dir> keep the evidence in <dir> instead
 *   npx tsx scripts/restore-check.ts --keep       do not delete the working directory afterwards
 *   npx tsx scripts/restore-check.ts --json       print the report as JSON
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS, AND WHY IT IS NOT A TEST OF THE EXPORTER
 * ---------------------------------------------------------------------------------------
 *
 * `tests/export-format.test.ts` asks whether the exporter writes what the format says, and
 * `tests/import-roundtrip.test.ts` asks whether the importer reads it back. Both are written by
 * the people who wrote the code they check, both run against a hand-built fixture, and neither
 * ever deletes anything. This asks a different question, from outside:
 *
 *     IF THE DISK HOLDING ./data/panelx.db DIED RIGHT NOW, WHAT WOULD COME BACK?
 *
 * So it uses the seeded corpus rather than a fixture, it runs the shipped commands rather than
 * calling the libraries, and it really deletes the file. A restore proof that never destroys
 * anything is a demonstration, not a proof.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPARISON IS NOT "EVERY FIELD EQUAL", AND IT NEVER SKIPS A COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * design/stages-audit/DECISIONS.md, decision 3: the durable format exports what HAPPENED to a
 * machine resource and never the machine facts — `pgid` and `os_started_at` — which are rebuilt by
 * scanning. So the restored side must have those columns NULL, and this ASSERTS that rather than
 * leaving them out of the comparison. A restore check that quietly ignores a column is how a
 * column stops round-tripping without anybody noticing, which is the failure this whole checkpoint
 * exists to catch.
 *
 * The same fear produces the second rule, which applies to every comparison here:
 *
 *     A COMPARISON THAT LOOKED AT NOTHING IS REPORTED AS VACUOUS, NEVER AS PASSED.
 *
 * Each comparison counts what it covered and the report prints that number beside the verdict, so
 * "held over 0 things" cannot be read as "held". A vacuous comparison fails the run.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY PHASE IS ITS OWN PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` opens `MOLE_OFFICE_DB` once, when it is first imported, and holds the
 * handle for the life of the process. Deleting the file underneath that handle does not close it:
 * on Linux the inode survives for as long as somebody has it open, so a process that kept reading
 * would be reading a database that no longer exists. This project has already paid for that once —
 * an orphaned server holding a deleted database served data into a diagnosis that was written down
 * and worked from — and a restore proof that reproduced it would be worse than no proof at all.
 *
 * So each phase runs as a child process with its own `MOLE_OFFICE_DB`, and a phase that must not see a
 * database does not import anything that could open one. That is also what a real restore is: you
 * run the exporter, you lose the disk, and later a different process runs the importer.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE EVER TOUCHES ./data/panelx.db
 * ---------------------------------------------------------------------------------------
 *
 * Every phase is given `MOLE_OFFICE_DB` explicitly, and `assertScratch` refuses any path that is not
 * inside this run's working directory. `.env` is never loaded, because `.env` names the real
 * database and this script's whole business is destroying the database it is pointed at.
 */

import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
// The one declaration of the separator a block title is qualified with (decision 2). Imported
// rather than retyped as `›`, because a check that hard-coded it would keep passing if the product
// changed it. src/shared/ is pure — nothing here reaches a database.
import { BLOCK_TITLE_SEPARATOR } from '@shared/blocks.ts'
// The one declaration of the workspace a request means when it names none, for the same reason.
import { DEFAULT_WORKSPACE, MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { canonicalDatabasePath, settings } from '../src/config/settings.mjs'
import { REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
// THE TABLES DECLARED IN A SCHEMA PART, read statically because the list of comparisons below names
// them. schema.ts and its parts declare tables and open nothing; a part's fill imports its writer
// only when it is called.
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { everyPartTable } from '../src/server/db/schema.ts'
import type { PartTable } from '../src/server/db/part-tables.ts'

// ============================================================================ what is compared

/**
 * Every comparison this check makes, named once, in the order the report prints them.
 *
 * DECLARED AS DATA rather than implied by which functions happen to be called, so that the report
 * can name a comparison that produced nothing. A list of checks that is only the list of checks
 * that ran is how a check disappears.
 */
const THE_FIXED_COMPARISONS = [
  'pixel appearances and office scene',
  'project boundaries',
  'records of every kind',
  'how each record got here',
  'links and backlinks',
  'inferred versus confirmed relationships',
  'block-to-module mappings',
  'gates, hard and partial',
  'presentation intent',
  'attention-relevant semantics',
  'sessions where they belong',
  'Unicode and Chinese text',
  'soft-deleted records with their recoverable history',
  'the change log itself',
  // Round eight. Its own comparison, and the one this file can least afford to skip: a revision is
  // the ONLY stored copy of what a record used to contain. `changes` says what changed and never
  // what it was — a create row keeps the title and nothing else — so a restore that lost a revision
  // has lost a state of the record that nothing in the database can rebuild.
  'the revision ledger',
  'reader anchors',
  // Round ten, wave 9. ONE TABLE AND THE ONLY AUTHORED ONE NOTHING CAN REBUILD FROM THE DISK. A scan
  // can always rebuild `source_files`, which is why the derived layer is excluded from an archive
  // outright; NO SCAN CAN REBUILD WHAT A SCAN ON TUESDAY SAW. So this is the one place where losing
  // rows in a restore would silently change the answer to "what has changed since this work domain
  // was accepted" for ever. The trap it watches is an emptied `hash`: the rows would all be there,
  // every count would match, and *changed* would stop being exact — which is the exact failure the
  // content hash was added to `source_file_hashes` to prevent, arriving one layer up.
  'what each scan saw about each file',
  // Round ten, wave 6. THREE TABLES AND ONE COMPARISON, because what is at risk is one fact spread
  // across them: a relationship names a repository and may name a code revision, and any of the
  // three coming back without the other two leaves a statement about code pointing at nothing. The
  // trap it watches is `accepted_by`: a row that says an agent proposed this AND a person accepted
  // it means something completely different from either half on its own, and `authorityOf` reads
  // the stored string — so a restore that lost the acceptance turns ownership back into a guess
  // with nothing saying so.
  'the implementation map, and what a guess became',
  // Round ten, window B. ONE TABLE AND ONE FACT, and the fact exists nowhere else: the field it was
  // read from — `annotation.data.state` — is deleted in the same commit that writes these rows, so a
  // restore that dropped this table would lose "these words had already gone out" with nothing left
  // to re-derive it from.
  'the markers on comments whose words had already gone out',
  // Migration 0173. ONE ROW, and it is what stops the measure-word step renaming the stored words a
  // second time: a stored `narrow` cannot say which name it was written under. A restore that
  // dropped it would leave the next migration renaming `narrow` to `narrowest` again.
  'the marker saying the reading-measure words were renamed',
  // Round ten, wave 8 built the writer; this comparison arrived with it. A row here says a
  // restriction reached one piece of work, BY WHICH PATH, at which distance, and what somebody has
  // said about it since. The path is frozen at the moment the row was written and the graph keeps
  // moving, so nothing can recompute one from today's links. The trap it watches is `state`: a
  // restore that put every row back reading `needs_review` would lose every re-check anybody had
  // done, with every row present and every count matching.
  'which work a restriction reached, and who re-checked it',
  'machine state, asserted absent',
  // The last clause of criterion P83's key work, the restore-time half. `held_keys` holds the
  // SHA-256 of every key the office issued, so a copy, a backup and an export carry no key.
  // An import never carries it; restoring a raw backup by file copy does.
  // The corpus holds one made-up hash on purpose, because an assertion over an empty table is
  // vacuous, never held.
  'key hashes, asserted absent',
  'visitor credentials without token hashes',
  // Wave 5. The only comparison here that is not scoped by project, because the planning tables it
  // reads have no project — a plan is a person-level overlay across workspace-owned work.
  // How many of them there are is PERSON_LEVEL_TABLES in db/schema.ts and is not counted here.
  'the plan',
  // The other half of planning, and person-level for the same reason: a plan is writing, and a
  // plan spans projects. It is its own comparison because the words are the thing being proved,
  // not the hours — a line that came back re-wrapped would be somebody's writing changed.
  'plans and their lines',
  // Round five. Person-level for the same reason, and its own comparison because what is being
  // proved is not the hours: it is somebody's words, and whether the reading Mole Office made of them
  // comes back as the same reading — including when the reading was nothing at all.
  'what somebody wrote about time',
  // Round seven. Person-level like the rest of planning. Its own comparison because a window is a
  // different fact from an allocation: it says WHEN somebody means to work on something and carries
  // no hours at all. Two dates and a state are the whole of it, so a restore that moved either day
  // by one, or turned a dropped span into a planned one, would change what a person's weeks say
  // while every row count still matched.
  'when somebody means to work',
  // Round seven, and the first comparison here that is scoped to a project THROUGH ANOTHER TABLE. A
  // conversation says which project it is about; a comment and a run belong to the project their
  // conversation names and carry no workspace of their own.
  //
  // ITS OWN COMPARISON BECAUSE WHAT IS AT RISK IS NOT THE WORDS. A review is one human act that goes
  // to several agents at once, and every comment carries who it was for, what it pointed at, and the
  // words it quoted. A restore that lost which comment went to whom would leave every comment
  // present, every row counted, and the review meaning something else.
  'a review, and who each comment went to',
  // Round eight. A review is now a row of its own, and this comparison is about the BOUNDARY rather
  // than the words: where somebody was standing when they started collecting, and what was inside
  // when they finished. Both are facts nothing else in the database can restate — what a review
  // collects is worked out from its entry on every read, and the relationships that answer went on
  // changing after collecting finished. NULL against an empty list is the trap it watches: one means
  // nobody has finished collecting, the other means somebody finished and it held nothing.
  'a review, and what was in it when collecting finished',
  // Wave 7, criteria CT2 and CT5 to CT7. ONE TABLE AND ONE FACT THAT IS STORED NOWHERE ELSE: a
  // counter's count and amount are added up from its rows since its last firing, so the rows ARE the
  // count. A restore that lost them would give back a counter whose record is whole and whose count
  // is zero, with nothing saying anything was lost. The traps it watches are `what` and `answer`: a
  // held-back row that came back as a firing would say the office had written a line it never wrote,
  // and a firing whose answer was emptied would lose the only record of what its action did.
  'counters, and what they counted',
  // The residents' migration follows a decision. A RESIDENCY IS A PRESS OF THE OWNER'S, and the
  // leave, the void marks and the writes in a space are each somebody's own act with who and when. Nothing can rebuild
  // any of them:
  // a restore that lost the residency would leave a space with no resident, and one that lost a void mark would
  // put a file the resident struck out back among the ones it reads.
  'permanent residents and their spaces',
  // Wave 13n round 45. A REQUEST FOR ONE PRESS IS THE ONLY RECORD THAT AN ACT RAN
  // ON THE PERSON'S PRESS. A restore that lost an answer would put a request the person had settled back in front of
  // the person, and one that lost the inputs would show a sentence whose act nobody could read.
  'requests for one press',
  // Wave 13s round 33, problem mR8vNPOVNQ_p. A RUN'S USES OF TOOLS ARE ROWS OF THEIR OWN, no longer in the run's
  // record. A restore that lost one would leave a run with a gap in its uses that no revision can fill.
  'tool uses',
  'test file results',
  // Wave 13k round 46, by two decisions. A HANDOVER IS WHAT AN AGENT'S NEXT
  // SESSION READS FIRST.
  // A restore that lost the newest one would hand the next session an older one as current, and one that lost who
  // wrote it would show the person's words as the agent's.
  'handovers',
  // Wave 13u round 13. A READINESS CHECKLIST AND ITS SIGNATURES ARE
  // THE ONLY RECORD THAT THOSE AN OPERATION AFFECTED AGREED TO IT. A restore that lost a signature would put back a
  // checklist waiting on somebody who had signed, and one that lost a withdrawal would count a signature its signer took back.
  'readiness checklists and their signatures',
  // A signing package and its items, migration 0270, from two decisions.
  'signing packages and their items',
  // Wave 13s round 2a, migration 0287. WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE: one row for every door the person
  // changed, with the answer, who changed it and when. A restore that lost a row would put the card's answer back where
  // the person had made a different one.
  'what the grant carries in this office',
  // Wave 13u round 21. THE PERSON'S LIST OF QUICK INPUTS AND EVERY ASK FOR ONE. A
  // fresh office starts with a list the migration wrote, so a restore that kept it over the archive's cleared list
  // would type from a list the person had cleared; one that lost an ask would let an agent ask again inside its ten
  // minutes.
  'quick inputs: the owner\'s list and every ask',
] as const

/**
 * The tables declared in a schema part that a restore compares, each one its own comparison after the
 * fixed ones. A line adding a table writes no line here: its `aPartTable` declaration says `compared`.
 */
const COMPARED_PART_TABLES: readonly PartTable[] = everyPartTable().filter((table) => table.says.restore === 'compared')

/** The name of the comparison of one table declared in a schema part. */
export function comparisonOfThePartTable(table: string): `the schema part table ${string}` {
  return `the schema part table ${table}`
}

export type ComparisonName = (typeof THE_FIXED_COMPARISONS)[number] | ReturnType<typeof comparisonOfThePartTable>

export const COMPARISON_NAMES: readonly ComparisonName[] = [
  ...THE_FIXED_COMPARISONS,
  ...COMPARED_PART_TABLES.map((table) => comparisonOfThePartTable(table.name)),
]

/**
 * Something that is KNOWN not to round-trip, with the reason and the repair.
 *
 * WHY DECLARED LOSSES ARE NOT FAILURES, AND ARE ALSO NOT SILENCE. A restore check that went red on
 * every known limitation would be red on every run and would be turned off within a week; one that
 * left them out of the report would be the silent skip this file exists to prevent. So each is
 * printed on every run, under its own heading, with what a person has to do about it.
 *
 * `explains` IS WHAT STOPS A DECLARATION BECOMING A DUMPING GROUND. A loss does not excuse a whole
 * table or a whole comparison: it names the exact differences it accounts for, and every difference
 * it does not name fails the run. So the third loss below can absorb "the same 97 keys in a
 * different order" and still fail if one of the keys changes.
 *
 * A declared loss that STOPS happening is printed too, as a note saying to delete the declaration.
 * It is not a failure: a check that goes red because something got better is a check people learn
 * to ignore.
 */
export interface DeclaredLoss {
  what: string
  why: string
  repair: string
  /** Given the two snapshots, did the loss happen at all? */
  happened: (before: Snapshot, after: Snapshot) => boolean
  /** Exactly which differences this loss accounts for. Everything else fails the run. */
  explains: (d: Difference) => boolean
}

export const DECLARED_LOSSES: readonly DeclaredLoss[] = [
  {
    what: 'the derived layer — source_files, source_index and source_file_hashes come back empty',
    why:
      'design/durability/FORMAT.md §2 excludes them by name: they are rebuilt by a scan, and a ' +
      'restored copy would describe the files of whichever machine the export was taken from.',
    repair: 'npx tsx scripts/reindex.ts, or POST /api/source/reindex on the restored server.',
    happened: (before, after) =>
      Object.values(before.derived).some((n) => n > 0) && Object.values(after.derived).every((n) => n === 0),
    // Nothing to absorb: no comparison above claims the derived tables round-trip, and this is
    // measured from the row counts instead.
    explains: () => false,
  },
  {
    what: 'pgid and os_started_at on every session_resources row come back NULL',
    why:
      'decision 3 in design/stages-audit/DECISIONS.md. The ledger exports what HAPPENED and never ' +
      'what is true on a machine right now; a restored pid with a three-week-old process group is ' +
      'exactly the stale reading this project already acted on once.',
    repair:
      'Nothing to repair — this is the decision working. A restored, still-unreleased process row ' +
      'is a pid with no anchor beside it, so src/server/lib/resources.ts reads its liveness as ' +
      'unknown and a release refuses to signal it, as FORMAT.md §11 asks. ' +
      'The session that registered the row can still close it without a signal.',
    happened: (before, after) =>
      before.ledger.some((r) => r.pgid !== null || r.osStartedAt !== null) &&
      after.ledger.every((r) => r.pgid === null && r.osStartedAt === null),
    // Also nothing to absorb, and that is the point: the comparison ASSERTS the absence and holds.
    explains: () => false,
  },
  // THE THIRD DECLARATION THAT USED TO BE HERE IS GONE, BECAUSE THE LOSS IT DECLARED WAS FIXED.
  //
  // It said that a restore lost the order the change log was appended in, because two readers used
  // SQLite's rowid as that order and the archive carried nothing that held it. The change log now
  // keeps the order in its own column, append_order, and the archive carries it (problem
  // BhszTJsVC8rF), so the anchor readings come back the same.
  //
  // THE FOURTH DECLARATION THAT USED TO BE HERE IS GONE, BECAUSE THE LOSS IT DECLARED WAS FIXED.
  //
  // It said: "the order of names inside one attention sentence, and the order of the three
  // unranked lists beside the ranked one". Its own `repair` field named the fix — sort the three
  // lists where `computeAttention()` builds them, and sort the standing titles — and said they
  // were in a file this check did not own. They are done, both in `src/shared/attention.ts`, and
  // the run that measured them is the one that removed this entry.
  //
  // A declaration is not a place to leave something. `tests/restore-semantics.test.ts` asserts that
  // every declared loss REALLY HAPPENS, so a declaration whose loss has been fixed turns the suite
  // red rather than sitting here excusing nothing — which is what it did, and is why this was
  // deleted rather than left as a comment inside the list.
  //
  // THE LOSSES THE SCHEMA PARTS DECLARE, one for each part table that says a restore may lose it.
  ...theLossesThePartTablesDeclare(),
]

// ============================================================================ the snapshot

/** One record, envelope and all, with `data` parsed so key order cannot produce a false failure. */
export interface SnapRecord {
  id: string
  workspaceId: string
  ownerId: string
  kind: string
  title: string
  summary: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  data: unknown
  /**
   * How the row entered the corpus: `authored`, `fixture`, or null for nobody has said.
   *
   * READ RAW, because `listRecords` hands back the shape the browser draws and that shape does not
   * carry `origin` yet. Reading it off the row is also the right thing on its own terms: origin is a
   * fact about the ROW, which is why decision 17 put it in a column rather than in `data`.
   *
   * NULL IS KEPT AS NULL, here and everywhere. A restore that turned an unstamped row into
   * `authored` would manufacture a judgement nobody made, in the one direction that makes fixture
   * content read as part of the project record.
   */
  origin: string | null
}

/**
 * One record's provenance, on its own, so the comparison for it can have its own requirements.
 *
 * A SECOND VIEW OF A COLUMN THAT IS ALREADY IN `SnapRecord`, and the duplication is the same one
 * `SnapDeleted` makes of `deletedAt`: the envelope comparison proves the value came back, and the
 * comparison beside it proves the CORPUS contained something worth proving that about. Without the
 * second, every record could be `fixture` and "authored survives a restore" would be a sentence
 * nothing had tested.
 */
export interface SnapOrigin {
  id: string
  title: string
  origin: string | null
  /** True when the stored word is one Mole Office knows. A word outside the two is carried, not blanked. */
  readable: boolean
}

/** A title or summary that is not plain ASCII, with its code points, so normalisation is visible. */
export interface SnapText {
  id: string
  where: 'title' | 'summary'
  text: string
  /** Code points, not bytes. NFC and NFD look identical in a terminal and differ here. */
  codePoints: number[]
}

export interface SnapLink {
  id: string
  workspaceId: string
  ownerId: string
  createdAt: string
  updatedAt: string
  fromId: string
  toId: string
  type: string
  inferred: boolean
  createdBy: string
  /** Whether a person, an agent or the office made the link; null on a row written before it was recorded. */
  createdByType: string | null
  gate: string | null
  gateUpTo: string | null
  /** Which sort of value gateUpTo is (item, block or words); null on a row written before it was recorded. */
  gateUpToSort: string | null
  /**
   * What moves along this edge, as JSON, or null because nobody said.
   *
   * NULL IS A REAL ANSWER AND IS NOT THE SAME AS AN EDGE THAT CARRIES NOTHING, so a restore that
   * dropped this column would turn "nobody described this" into "this was described as empty".
   */
  carries: string | null
}

/** Every link touching one record, as the record page gets it: both directions, already labelled. */
export interface SnapEnd {
  recordId: string
  links: {
    linkId: string
    type: string
    label: string
    isBacklink: boolean
    inferred: boolean
    broken: boolean
    otherId: string
    otherTitle: string
    gateLabel: string | null
    gateProblem: string | null
  }[]
}

/** One pipeline as `readPipelineBlocks` reads it: membership, order, carriers and dependencies. */
export interface SnapPipeline {
  pipelineId: string
  title: string
  storedIds: number
  undeclared: boolean
  problems: { at: number; blockId: string; problem: string }[]
  blocks: {
    id: string
    name: string
    title: string
    state: string
    measured: string | null
    modules: string[]
    moduleIds: string[]
    needs: { blockId: string; gate: string | null; upTo?: string; linkId: string }[]
    consequence: unknown
    pause: unknown
  }[]
}

export interface SnapIntent {
  workspaceId: string
  scope: string
  target: string
  intent: unknown
  updatedAt: string
  updatedBy: string
}

/**
 * One planning allocation, as the restore proof compares it.
 *
 * NO WORKSPACE, and that is the shape of the table rather than an omission here: a plan is a
 * person-level overlay across workspace-owned work. So the key is the allocation's own id, and the
 * comparison below is the only one in this file that is not scoped by project.
 *
 * `plannedHours` and `actualHours` are carried as `number | null` and compared as such. Null means
 * nobody said how long, which is a different fact from zero — a restore that turned one into the
 * other would be exactly the kind of quiet semantic change this whole script exists to catch.
 */
export interface SnapAllocation {
  id: string
  horizon: string
  period: string
  recordId: string
  plannedHours: number | null
  actualHours: number | null
  state: string
  note: string | null
  /** Which plan line put this time here. Provenance, and null when nobody planned it in a document. */
  fromPlanLine: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

/** One plan: a document somebody wrote. Its words are in its lines, never in the plan row. */
export interface SnapPlan {
  id: string
  title: string
  state: string
  readAt: string | null
  /** The secretary that marked it read under the person's grant, and the grant, or null for a person's mark. Migration 0295. */
  readByAgent: string | null
  readUnderGrant: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
  /**
   * The rough draft this plan was, or null. Migration 0196 wrote it, and it is the only record of which plan an
   * old draft id became, so a restore that lost it would leave a proposal about a draft pointing at nothing.
   */
  movedFromDraft: string | null
}

/**
 * One line of a plan, verbatim.
 *
 * The text is compared character for character, like a draft's body, because it is somebody's
 * writing and this archive is the only other copy of it. `recordId` is the record the line was
 * filed as: a restore that lost it would turn work somebody planned into work that came from
 * nowhere, and the line would read as never filed.
 */
export interface SnapPlanLine {
  id: string
  planId: string
  position: number
  text: string
  recordId: string | null
  remark: string | null
  updatedAt: string
  updatedBy: string
}

/**
 * ONE CHANGE TO A PLAN'S LINES, WITH THE REASON THE WRITER GAVE.
 *
 * Criterion P3, 16 September 2026. Adding, reordering or dropping a line writes one row here, and
 * the reason is required. It is carried for the reason the revision ledger is: the row is the ONLY
 * copy of why a plan changed — the line itself holds its text and its position and says nothing
 * about why it moved — so a restore that lost these rows would give back a plan whose history had
 * become a series of unexplained edits.
 */
export interface SnapPlanLineRevision {
  id: string
  planId: string
  lineId: string
  seq: number
  op: string
  reason: string
  at: string
  changedBy: string
}

/**
 * ONE ADDITION, FIRING OR HELD-BACK FIRING OF A COUNTER.
 *
 * Criteria CT2 and CT5 to CT7, migration 0172. A counter's count and amount are added up from these
 * rows since its last firing and are stored nowhere, so these rows ARE the count: a restore that
 * lost them would give back a counter that had never counted anything, with its own record whole and
 * nothing saying a thing was missing. `because` and `answer` carry what exists in no other row — the
 * caller's own reason for an addition, and what a firing's action answered.
 */
export interface SnapCounterRow {
  id: string
  workspaceId: string
  counterId: string
  seq: number
  what: string
  at: string
  /** The same moment as `at` with its offset, or null on a row written before migration 0299. */
  atInstant: string | null
  by: string | null
  eventKind: string | null
  eventId: string | null
  eventAt: string | null
  count: number
  amount: number | null
  because: string
  whichTrigger: number | null
  answer: string | null
}

/**
 * ONE READING OF SOMEBODY ELSE'S FOLDER, verbatim.
 *
 * `pieces` is compared as the stored text and not as a parsed object: it holds what an agent
 * proposed AND what a person decided about each piece, and the decisions are written down nowhere
 * else. A restore that brought the pieces back without them would put a person in front of choices
 * they had already made.
 */
export interface SnapFolderReading {
  id: string
  workspaceId: string
  ownerId: string
  ownerKind: string | null
  folder: string
  readBy: string
  readByKind: string | null
  note: string | null
  pieces: string
  createdAt: string
  updatedAt: string
}

/** One recurrence, as stored. A rule about when work comes round, never an occurrence of it. */
export interface SnapRecurrence {
  id: string
  recordId: string
  every: string
  days: string | null
  hoursEach: number | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

/**
 * One thing somebody wrote about time, as stored.
 *
 * `said` is compared character for character, like a draft's body and a plan line's text, because it
 * is what a person typed and this is the only other copy of it.
 *
 * `horizon`, `period` and `hours` are carried as nullable and compared as such. Null means Mole Office
 * read nothing from the words and invented nothing, which is a different fact from zero hours or
 * from a period nobody has chosen. A restore that filled one in would be claiming an interpretation
 * that never happened.
 *
 * `state` is the load-bearing one. Only `committed` is in any total, so a restore that turned a
 * `kept` row into a `committed` one — or the other way round — would change what every week adds up
 * to while the row count still matched.
 *
 * Called `SnapPlanningIntent` and not `SnapIntent`: `SnapIntent` is already the presentation-intent
 * row, which is a different table about how a drawing is arranged.
 */
export interface SnapPlanningIntent {
  id: string
  said: string
  recordId: string | null
  planLineId: string | null
  horizon: string | null
  period: string | null
  hours: number | null
  state: string
  createdAt: string
  createdBy: string
}

/**
 * One span of days somebody placed a piece of work on, as stored.
 *
 * `startsOn` and `endsOn` are both `YYYY-MM-DD` and BOTH DAYS ARE INCLUDED. They are compared as
 * they stand: a restore that moved either by one day would move somebody's week, and no row count
 * would notice.
 *
 * THERE ARE NO HOURS HERE ON PURPOSE. A window says when somebody means to work on something and
 * nothing about how much. The hours are in `allocations` and are compared there.
 *
 * `state` is the load-bearing one, as it is on an allocation: `planned`, `done` and `dropped` are
 * three different facts, and `dropped` — a span that did not happen — is not the same as a span
 * nobody ever planned.
 */
export interface SnapWorkWindow {
  id: string
  recordId: string
  startsOn: string
  endsOn: string
  note: string | null
  state: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

/**
 * One picture, as stored. An avatar, which is the only kind of asset there is today.
 *
 * `path` AND `bytes` ARE NULL FOR A PICTURE THIS PRODUCT DREW, because there is no file: the drawing
 * is worked out from the participant it belongs to. They are set for an upload, and the file itself
 * is under `data/` where no archive and no repository carries it — so this comparison is about the
 * ROW, and a restore that brought the row back without the file is a state the row itself declares.
 */
export interface SnapAsset {
  id: string
  kind: string
  origin: string
  path: string | null
  mime: string
  bytes: number | null
  createdAt: string
  createdByKind: string | null
  createdById: string | null
  licenceSource: string | null
  drawnFrom: string | null
}

/** One person of this installation, as stored. Installation-level: no project can hold it. */
export interface SnapPerson {
  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /** Whether they said they are here, and when. Null means they have never said. */
  presenceChoice: string | null
  presenceChoiceAt: string | null
  /**
   * The two settings they made about the chat button: how its number is drawn (M32) and which
   * picture it carries (M38). Null on either means they have never chosen, which a restore has to
   * carry as carefully as a choice — putting somebody back on a default is a claim they never made.
   */
  circleShows: string | null
  circlePicture: string | null
  /**
   * The two settings they made about a link in a message: which name it draws (M47) and where it
   * sits (M48). Null on either means they have never chosen, and a restore carries that as
   * carefully as a choice, for the reason the two above give.
   */
  messageLinkLevel: string | null
  messageLinkLayout: string | null
  /**
   * Whether a message says which project it is in (M73), and how a picture in a message is drawn
   * (M64, moved off the browser by decision rJphPkCG3l7X). Null on either means they have never
   * chosen, and a restore carries that as carefully as a choice, for the reason above.
   */
  messageProjectMark: string | null
  messagePictures: string | null
  /**
   * How big the chat's own text is (M112), and whether media a record or a message points at are
   * loaded at all (U5). Null on either means nobody has chosen, and a restore carries that as
   * carefully as a choice, for the reason above.
   *
   * BOTH WERE ON THE TABLE WITHOUT REACHING THIS SNAPSHOT. `chat_text_size` was added by migration
   * 0152 and left out of `schema.ts` until Cluster D wave 2 declared it; `media_load` was added by
   * that wave. `tests/restore-check.test.ts` reads every column of the declared table and asks
   * whether the comparison carries it, which is how both were found: a column this snapshot does
   * not read is a column a restore could drop without a word.
   */
  chatTextSize: string | null
  /** When the chat circle shows, and how the chat opens (migration 0340). Null on either means never chosen. */
  chatButtonStays: string | null
  chatOpensAs: string | null
  /** The person's own message labels, as stored JSON (migration 0341). Null means nobody made one. */
  chatLabels: string | null
  /** The person's own settings for the two shipped flags and 'No mark', as stored JSON (migration 0346). Null means nobody changed one. */
  shippedFlags: string | null
  /** The person's chosen look and the themes they made, as stored JSON (migration 0347). Null means nobody chose or made one. */
  themes: string | null
  /** How the person's chat is laid out (migration 0343). Null means never chosen. */
  chatLayout: string | null
  /** The person's own agent tags, as stored JSON (migration 0344). Null means nobody made one. */
  agentTags: string | null
  /** Which key sends a message. Null means they have never chosen. */
  sendKey: string | null
  /** Which keyboard shortcuts are on, as stored JSON. Null means never chosen. */
  shortcuts: string | null
  /** Whether this person owns the office, and where their name came from (the owner migration). Null means not the owner. */
  officeOwner: string | null
  language: string | null
  mediaLoad: string | null
  /**
   * The three things on their own role card: which card they hold (P46), what they do in their own
   * words (P45) and which of their three portraits is on it (P47). Null on any of them means nobody
   * has written one, and a restore carries that as carefully as a choice: putting a person back to
   * "no role set" would be undoing an act somebody made.
   */
  role: string | null
  occupation: string | null
  portrait: string | null
  createdAt: string
  createdByKind: string | null
  createdById: string | null
  /** Which world they are a citizen of, and since when. Null means nobody could say. */
  homeWorld: string | null
  homeInstallation: string | null
  citizenSince: string | null
  /** How they wish to be addressed, migration 0181. Null on a part means nobody set it. */
  addressName: string | null
  addressSecondPerson: string | null
  addressThirdPerson: string | null
  addressTitle: string | null
  addressSetByKind: string | null
  addressSetById: string | null
  addressSetAt: string | null
}

/** One durable agent of this installation, as stored. Installation-level, like a person. */
export interface SnapAgent {
  pixelAppearance: string | null
  pixelScale: string | null
  id: string
  name: string
  handle: string
  avatarAssetId: string
  state: string | null
  stateAt: string | null
  /** Who set the line. Null means nobody recorded it, which is not the same as the agent's own. */
  stateByKind: string | null
  stateById: string | null
  runtime: string | null
  /**
   * WHO STARTED IT, WHAT IT MAY DO, WHERE IT WORKS, WHAT IT WAS STARTED FOR, AND WHICH RUN DID IT.
   *
   * Migrations 0135 to 0137, criteria P1, P2, P43, P15 and P11. Every one is carried because nothing
   * can rebuild any of them: who started an agent is said once, by the run that did it, and a
   * restore that dropped it would leave a registry that cannot say who answers for anybody.
   */
  startedByKind: string | null
  startedById: string | null
  ownerId: string | null
  ownerKind: string | null
  role: string | null
  /**
   * WHO CHOSE THAT CARD, as stored. Migration 0146, criterion P75. Carried for the reason the card
   * beside it is: nothing can rebuild it. Whether the rule wrote the card or a starter chose it is
   * said once, at registration, and a restore that dropped it would turn every recorded choice into
   * "nobody recorded one" — which is a different fact and the honest reading of a row with none.
   */
  cardChosenBy: string | null
  /**
   * EVERY GRANT THE PERSON MADE THIS AGENT, as stored. Migration 0139, criterion P59. Carried
   * because nothing can rebuild it: it was given once, by pressing a button, and a restore that
   * dropped it would leave a registry that cannot say what an agent was allowed to do while it
   * wrote.
   */
  elevation: string | null
  workArea: string | null
  startedFor: string | null
  startedByRun: string | null
  /**
   * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, criterion P69, or null because it needed
   * none. Carried because a restore that dropped it would leave a registry that could not say which
   * rows came from another machine, and null would then read as "registered here".
   */
  credential: string | null
  retired: number
  retiredBecause: string | null
  /**
   * WHEN THE ROW WAS RETIRED AND BY WHOM, added by migration 0145 for problem zyCcJYCLsAe7.
   *
   * Carried because a restore that dropped them would leave a registry saying an agent was retired
   * and nothing saying who did it or when — which is the state that made the problem.
   */
  retiredAt: string | null
  retiredByKind: string | null
  retiredById: string | null
  createdAt: string
  createdByKind: string | null
  createdById: string | null
  homeWorld: string | null
  homeInstallation: string | null
  citizenSince: string | null
  /** How they wish to be addressed, migration 0181. Null on a part means nobody set it. */
  addressName: string | null
  addressSecondPerson: string | null
  addressThirdPerson: string | null
  addressTitle: string | null
  addressSetByKind: string | null
  addressSetById: string | null
  addressSetAt: string | null
  /** Whether it is a permanent resident, and its successor, from the residents' migration. Null: not one, none named. */
  residentSince: string | null
  residentProposal: string | null
  residentDecision: string | null
  residentConfirmedByKind: string | null
  residentConfirmedById: string | null
  successorId: string | null
  successorNamedAt: string | null
  successorNamedByKind: string | null
  successorNamedById: string | null
  /** When the confirm asked for its picture and name, and when and by whom they were marked chosen, migration 0233. */
  residentNamingAskedAt: string | null
  residentNamedAt: string | null
  residentNamedByKind: string | null
  residentNamedById: string | null
  /**
   * WHETHER IT READS A RELEASE FROM THE CHECK, with who said so, when and why, migration 0203. Carried as the text it is
   * stored as, like the grant above: it was said once, and nothing can rebuild it.
   */
  readsReleasesFromTheCheck: string | null
  /**
   * WHETHER IT WAS REGISTERED WITH NO KEY OF ITS OWN, migration 0273: 1 or 0. Nothing can rebuild it, and a restore that
   * lost it would let a write in the agent's name be taken without a run key again.
   */
  runKeysOnly: number
  /**
   * A SECRETARY'S OWN SLEEP TIME, migration 0330: the time of day it begins on the office's clock, how many minutes it
   * lasts, when it was set and whether the agent or the person set it. Nothing can rebuild it: it is somebody's word.
   */
  sleepTimeStarts: string | null
  sleepTimeMinutes: number | null
  sleepTimeSetAt: string | null
  sleepTimeSetBy: string | null
}

/** One leave a resident gave another agent to read its space, as stored. */
export interface SnapResidentReadGrant {
  id: string
  residentId: string
  readerId: string
  until: string
  givenAt: string
  givenByKind: string
  givenById: string
  endedAt: string | null
  endedByKind: string | null
  endedById: string | null
}

/** One file in a resident's space marked void, as stored. */
export interface SnapResidentVoidMark {
  id: string
  residentId: string
  path: string
  because: string
  markedAt: string
  markedByKind: string
  markedById: string
}

/** One file a resident wrote into its space, as stored. */
export interface SnapResidentSpaceWrite {
  id: string
  residentId: string
  path: string
  bytes: number
  sha256: string
  writtenAt: string
  writtenByKind: string
  writtenById: string
  /** The earlier version the write kept, or null for a new file. */
  replacedVersion: string | null
}

/**
 * One sleep or postponed sleep of a permanent resident, as stored (migration 0233), with when a sleep the office began at
 * a sleep time ends and the reminder it sent (migration 0330).
 */
export interface SnapResidentSleep {
  id: string
  agentId: string
  what: string
  beganAt: string
  endedAt: string | null
  because: string | null
  byKind: string
  byId: string
  sessionId: string | null
  wakesAt: string | null
  reminderId: string | null
}

/** Which registry agent one project record of kind `agent` is. Two columns and no more. */
export interface SnapAgentRecord {
  recordId: string
  agentId: string
}

/**
 * Which installation this database belongs to. One row, and it is compared because nothing can
 * rebuild it: the id was worked out from the declaration on the day this database was first
 * migrated, so working it out again after a restore would answer about a different machine.
 */
export interface SnapInstallation {
  onlyRow: number
  id: string
  how: string
  writtenAt: string
  /**
   * WHEN THE PERSON CLOSED THE ONE-VERSION KEY WINDOW, AND WHO. Criterion P83, point 6. Compared
   * because nothing can rebuild them: the close is one moment and one press, and a restore that
   * dropped it would hand the window back while the list still said it was shut.
   */
  windowClosedAt: string | null
  windowClosedByKind: string | null
  windowClosedById: string | null
  /**
   * WHAT THE OFFICE KEEPS. Criterion U6. Compared because the person's own choice exists nowhere
   * else: a restore that dropped it would put the office back on its defaults while the Settings
   * page still showed the numbers that had been chosen.
   */
  keepBackups: number | null
  untracedRequestDays: number | null
  tracedRequestDays: number | null
  /**
   * HOW FAR OUT A GOAL REACHES. Criterion P1, added by 0169. Compared for the same reason as the
   * three above: the person's own choice of the spans exists nowhere else. A distant goal has no
   * column and is not here.
   */
  goalShortDays: number | null
  goalMediumDays: number | null
  goalLongDays: number | null
  /**
   * WHETHER AGENTS MAY INJECT. Criterion M91, added by 0175. Compared for the same reason as the
   * settings above: the person's switch exists nowhere else. NULL is nobody having chosen.
   */
  agentsMayInject: number | null
  /**
   * WHICH ADDRESS IS WHICH MACHINE. Problem 8Kf0hCaK4lQY, added by 0187. Compared for the same reason as the
   * settings above: the names the person gave exist nowhere else. NULL is nobody having named any address.
   */
  machineNames: string | null
  /**
   * THE SECRETARY WHO TAKES THE DEAD LETTERS. Problem 0WUuvB0IhRfb, added by 0198. Compared for the same reason
   * as the settings above: the person's choice exists nowhere else. NULL is nobody having named one.
   */
  deadLetterSecretary: string | null
  /** Stored summary thresholds; null means no database choice. */
  deadLetterAfterDays: number | null
  deadLetterAfterCount: number | null
  /**
   * THE ONE ADDRESS A BROWSER IS SENT TO. Wave 13x round 7, added by 0207. Compared for the same reason as the
   * settings above: the person's choice exists nowhere else. NULL is nobody having set one.
   */
  addressForBrowsers: string | null
  /**
   * WHO OWNS THE MERGE QUEUE. Added by 0208. Compared for the same reason as the settings
   * above: the person's choice exists nowhere else. NULL is nobody having named one.
   */
  mergeQueueOwner: string | null
  /**
   * WHETHER THE RELATED TESTS RUN FIRST, as part B of a decision says; migration 0213 added it.
   * Compared for the same reason as the settings above: the choice exists nowhere else. NULL is nobody having chosen.
   */
  relatedTestsFirst: number | null
  /**
   * THE TOPS OF THE OFFICE'S LOAD RANGES, from a decision; migration 0230 added them. Compared
   * for the same reason as the settings above: the choice exists nowhere else. NULL is nobody having chosen.
   */
  loadReadMsTop: number | null
  loadCpuPercentTop: number | null
  loadMemoryMbTop: number | null
  /**
   * WHICH PLUGINS ARE SWITCHED ON. Wave 13x round 14, added by 0234. Compared for the same reason as the settings
   * above: the choice exists nowhere else. NULL is nobody having switched any plugin.
   */
  pluginSwitches: string | null
  /**
   * WHETHER CHECKS RUN IN MERGES-ONLY MODE, AND THE STALE FORK BASES. Wave 13j round loop-1, added by 0251. Compared for
   * the same reason as the settings above: the choice exists nowhere else. NULL is nobody having chosen.
   */
  checksInMergesOnly: number | null
  staleForkBases: string | null
  /**
   * WHEN THE MESSAGE WORKER FIRST TOOK A MESSAGE WRITTEN IN ANOTHER PROJECT. Wave 13y round 112, added by 0312.
   * Compared because nothing can recreate a moment: a restore that dropped it would take a new one at the next
   * reading of the queue, and a message written in between would wait for a press. NULL means the rule has not run.
   */
  otherProjectsMessagesSince: string | null
}

/** One visit: a citizen of one world working in another, and what they came to do. */
export interface SnapVisit {
  id: string
  visitorKind: string
  visitorId: string
  fromWorld: string
  toWorld: string
  since: string
  until: string | null
  why: string
  registeredAt: string
  reportedAt: string | null
}

/**
 * ONE VISITING AGENT'S CREDENTIAL. Criteria P24 to P30.
 *
 * `tokenHash` is read so the comparison can require REMOVED_MARK and the row's id after an import.
 * Every other field must come back unchanged. The visitor pairs again, as after a backup restore
 * .
 */
export interface SnapVisitorCredential {
  id: string
  handle: string
  name: string
  role: string
  tokenHash: string
  world: string | null
  machine: string | null
  machineHow: string
  conversationPath: string | null
  startDirectory: string | null
  runtime: string | null
  sessionRecord: string | null
  standing: string
  confirmedByKind: string | null
  confirmedById: string | null
  confirmedAt: string | null
  endsAt: string
  endedAt: string | null
  endedBecause: string | null
  issuedAt: string
}

/**
 * ONE REQUEST MADE UNDER A CREDENTIAL, and what was found when the facts were compared.
 *
 * These rows are the evidence the person's supervision of visitors is made of. A backup that dropped them would restore a
 * credential whose mismatch count was zero and whose history said nothing had ever been asked.
 */
export interface SnapVisitorRequest {
  id: string
  credentialId: string
  at: string
  method: string
  route: string
  operation: string | null
  wrote: number
  refusedBecause: string | null
  /** The facts that did not match, as the JSON list that was stored. Criterion P27. */
  mismatch: unknown
  /**
   * Whether it came from a machine this office trusts, added by migration 0144. Criterion P73.
   *
   * Three answers: 1, 0 and null, and null means nobody could tell which machine it was. A restore
   * that turned the third into the second would say the office had been asked and had refused.
   */
  fromATrustedMachine: number | null
}

/**
 * ONE MACHINE THIS OFFICE TRUSTS, or once trusted. Criterion P73, migration 0144.
 *
 * Carried whole because every field of it is a fact nobody can recreate: who pressed, when, why, and
 * whether the row came from a press, a credential's confirmation or the environment.
 */
export interface SnapTrustedMachine {
  id: string
  address: string
  note: string | null
  how: string
  credentialId: string | null
  addedAt: string
  addedByKind: string | null
  addedById: string | null
  removedAt: string | null
  removedByKind: string | null
  removedById: string | null
  removedBecause: string | null
}

/** One world the office knows: when it appeared, when it disappeared, and why. */
export interface SnapWorld {
  id: string
  name: string
  /** What the world is for, in its starter's words, or null because nobody recorded it. P87. */
  purpose: string | null
  /** The handback this world belongs to, by record id, or null because nobody tied it to one. C33. */
  handback: string | null
  kind: string
  startedByKind: string | null
  startedById: string | null
  checkout: string | null
  head: string | null
  databaseIdentity: string
  address: string | null
  /** Where another machine reaches it, or null because it serves only this computer. */
  addressForOtherMachines: string | null
  standing: string
  parentWorld: string | null
  bornAt: string
  diedAt: string | null
  diedBecause: string | null
  installation: string
  /**
   * The `held_keys` row of the key this world's reports carry, or null. Migration 0179. It is NOT in
   * the archive (export.ts NEVER_EXPORTED), because no archive carries `held_keys`; it is read here so
   * every column of the table is in the snapshot, and nothing compares it after a restore.
   */
  runKeyId: string | null
}

/** How far one message got with one of the people or agents it was sent to. */
/** One group: a conversation with several subscribers, as stored. */
export interface SnapGroup {
  id: string
  workspaceId: string
  name: string
  openedByKind: string
  openedById: string
  openedBecause: string
  openedAt: string
  about: string | null
}

/** One membership of a group, as stored. A row is kept after somebody leaves. */
export interface SnapGroupMember {
  id: string
  groupId: string
  memberKind: string
  memberId: string
  joinedAt: string
  joinedBecause: string
  leftAt: string | null
}

/** One work claim: what an agent said it was working on, as stored. */
export interface SnapWorkClaim {
  id: string
  workspaceId: string
  claimantKind: string
  claimantId: string
  run: string
  things: string
  openedAt: string
  renewedAt: string | null
  releasedAt: string | null
  releasedBecause: string | null
}

/** One hold on an agent handle: which session was answering as which agent, as stored. */
export interface SnapHandleHold {
  id: string
  agentId: string
  sessionRecordId: string
  machine: string
  runtime: string
  claimedAt: string
  lastHeardAt: string
  releasedAt: string | null
  releasedBecause: string | null
}

/** One dead-letter claim: which addressee was named in a broadcast, and who took it on, as stored. */
export interface SnapDeadLetterClaim {
  id: string
  workspaceId: string
  groupId: string
  agentId: string
  openedAt: string
  claimedByKind: string | null
  claimedById: string | null
  claimedAt: string | null
  claimedBecause: string | null
}

/** One contact group somebody made, renamed or moved, as stored. */
export interface SnapContactGroup {
  id: string
  ownerKind: string
  ownerId: string
  key: string
  /** Which top group it sits under; NULL on a row written before migration 0161. */
  side: string | null
  name: string
  at: number
  createdAt: string
}

/** Whether one person has folded one contact group away. Criterion M121, migration 0161. */
export interface SnapContactGroupCollapse {
  id: string
  ownerKind: string
  ownerId: string
  groupKey: string
  collapsed: number
  setAt: string
}

/** One use of a tool on a run, as stored (migration 0231, wave 13s round 33). */
export interface SnapToolUse {
  id: string
  workspaceId: string
  runId: string
  seq: number
  at: string
  tool: string
  said: string
  actorType: string | null
  actorId: string | null
  movedAt: string | null
  /** What the use door found when it checked the line's proof that tools/use-line.mjs sent it, migration 0300, or null. */
  proof: string | null
}

/** One file observation on a tool use, migration 0279. The use supplies the run and time. */
export interface SnapTestFileRun {
  id: string
  workspaceId: string
  useId: string
  file: string
  result: string
  seconds: number | null
  testFileHash: string | null
  treeCommit: string | null
  treeChange: string | null
}

/** One handover, as stored, from migration 0232 and two decisions. */
export interface SnapHandover {
  id: string
  agentId: string
  workspaceId: string
  text: string
  writtenAt: string
  writtenByKind: string
  writtenById: string
  sessionId: string | null
}

/** One request for one press, as stored, migration 0206. */
export interface SnapOnePressRequest {
  id: string
  workspaceId: string
  act: string
  inputs: string
  askedBy: string
  shows: string
  because: string | null
  state: string
  askedAt: string
  answeredAt: string | null
  answeredByKind: string | null
  answeredById: string | null
  outcome: string | null
}

/** One authored signing-package row, as stored (migration 0270). */
export interface SnapSigningPackage {
  id: string
  workspaceId: string
  broughtBy: string
  forAgent: string
  task: string
  state: string
  broughtAt: string
  answeredAt: string | null
  answeredByKind: string | null
  answeredById: string | null
  outcome: string | null
  holdEndsAt: string | null
  holdEndedAt: string | null
  holdEndedHow: string | null
}

/** One authored signing-package item, as stored (migration 0270). */
export interface SnapSigningPackageItem {
  id: string
  packageId: string
  position: number
  act: string
  inputs: string
  why: string
  shows: string
  changes: string
  undone: string
  state: string
  outcome: string | null
  doneAt: string | null
  carriedOut: string
  carriedOutBy: string | null
  carriedOutIn: string | null
}

/** One readiness checklist, as stored, migration 0252. */
export interface SnapReadinessChecklist {
  id: string
  workspaceId: string
  operation: string
  inputs: string
  onWhat: string
  shows: string
  level: string
  signers: string
  raisedByKind: string
  raisedById: string
  because: string | null
  state: string
  raisedAt: string
  endsAt: string
  closedAt: string | null
  closedByKind: string | null
  closedById: string | null
  outcome: string | null
}

/** One signature on one readiness checklist, as stored (migration 0252). */
export interface SnapReadinessSignature {
  id: string
  checklistId: string
  signerKind: string
  signerId: string
  onWhat: string
  signedAt: string
  withdrawnAt: string | null
}

/** One contact somebody moved into a group or ordered by hand, as stored. */
export interface SnapContactPlacement {
  id: string
  ownerKind: string
  ownerId: string
  contact: string
  groupKey: string | null
  at: number | null
  placedAt: string
}

/** One read of a conversation somebody was not part of, as stored. */
export interface SnapConversationRead {
  id: string
  workspaceId: string
  readerKind: string
  readerId: string
  pair: string
  asSide: string
  asSideKind: string | null
  at: string
}

export interface SnapMessageDelivery {
  id: string
  messageId: string
  recipientKind: string
  recipientId: string
  mark: string
  at: string
  /** Which migration worked this recipient out, or null when the writer named them. */
  inferredBy: string | null
  /** When the recipient last pressed Not now on the lead offer, or null. Migration 0200. */
  offerPutOffAt: string | null
  /** When Remind me later brings the message back to this recipient, or null. Migration 0205. */
  remindAt: string | null
  /** Who set that time: the actor's kind and id, or null because nobody recorded it. Migration 0288. */
  remindSetByKind: string | null
  remindSetById: string | null
  /** When the office brought it back, or null while it has not. Migration 0205. */
  remindedAt: string | null
  /** The message that carries this row's words to its recipient, or null because none does. Migration 0324. */
  carriedIn: string | null
}

/**
 * One conversation with an agent, as stored.
 *
 * IT IS THE ONLY ONE OF THE THREE THAT SAYS WHICH PROJECT IT IS ABOUT. A comment and a run belong to
 * the project their conversation names, which is why `WORKSPACE_COLUMN` in db/schema.ts answers for
 * those two with this table rather than with a column of their own.
 */
/**
 * One review, as stored: somebody started collecting remarks, from somewhere.
 *
 * READ STRAIGHT FROM SQL, for the reason `SnapAgentMessage` gives. The product's reader works out
 * what counts as inside on every request and, while a review is collecting, which remarks those
 * are. None of that is stored, and the stored columns are what a restore has to bring back.
 *
 * `entry` AND `frozen` ARE COMPARED AS THE TEXT THEY ARE. `entry` is where the review was started
 * from, and everything it collects is worked out from it, so a restore that dropped it would leave
 * a review that cannot say what it is about. `frozen` is the membership as it stood when collecting
 * finished — NULL while it is still collecting, and a list once it is not. Those two are different
 * facts, and a restore that wrote `[]` for NULL would turn "nobody has finished collecting" into "it
 * contained nothing" with every row still present and every count still matching.
 */
/**
 * ONE MARKER SAYING A COMMENT'S WORDS HAD GONE OUT BEFORE MOLE OFFICE RECORDED WHICH CONVERSATION.
 *
 * AUTHORED, though nothing a person types writes one: window B's annotation-state step writes it,
 * once, for a comment whose own `data.state` said its words had gone and which no message accounts
 * for. It is the ONLY surviving record of that fact — the field it was read from is deleted in the
 * same commit — so a restore that dropped this table would lose it with nothing left to re-derive
 * it from. That is why it is compared here rather than excused.
 */
export interface SnapAnnotationWordsFixed {
  annotationId: string
  fixedAt: string
  because: string
}

export interface SnapReview {
  id: string
  workspaceId: string
  entry: string
  /** `collecting`, `collected`, `organised` or `sent`. */
  state: string
  startedAt: string
  startedBy: string
  /** Null until somebody has finished collecting. */
  collectedAt: string | null
  /** Null while it is collecting; the written-down membership once it is not. */
  frozen: string | null
  /** The conversation a round-seven review's remarks are still in. Null on every newer review. */
  fromThreadId: string | null
  sentThreadId: string | null
  /**
   * What a reading said about several of this review's comments at once, as JSON, or null because
   * nothing has read them. It is stored nowhere else, so a restore that lost it would hand back a
   * review reading as though the reading had found nothing true of several at once.
   */
  readGroups: string | null
  sentAt: string | null
  /**
   * How wide the review is: `local` or `global`. The single stored answer.
   *
   * A restore that lost it would hand back a project-wide review reading as a local one, whose scope
   * is then worked out from an `entry` that was never meant to be read for it.
   */
  reach: string
  /** The agent that asked for this review, or null because nobody did. */
  startedByAgent: string | null
  /** The comments kept before the review that it took in when it started, as JSON, or null on an older review. */
  takenIn: string | null
  /** Who the review goes to, as JSON, or null because nobody chose and it goes to the page's writer. */
  goesTo: string | null
}

export interface SnapAgentThread {
  id: string
  workspaceId: string
  title: string
  /** `direct` or `review`. WHEN comments are sent, not what they may say. */
  mode: string
  /** `open`, `dispatched`, `answered` or `abandoned`. Nothing computes it. */
  state: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

/**
 * One thing said in a conversation, as stored.
 *
 * READ FROM SQL AND NOT THROUGH `readThread`, and the reason is the same one `SnapLedger` gives.
 * That reader folds the four recipient columns into one nested object, parses `context`, and
 * computes on every read whether what a comment points at is still there. None of those is what is
 * STORED, and the stored columns are what a restore has to bring back.
 *
 * `context` IS COMPARED AS THE TEXT IT IS. It holds what a comment points at, with any quoted words
 * kept — the whole reason the quote is stored is that a comment still says what it was about after
 * the text underneath it changes. Comparing the string rather than a parsed value is the stricter
 * test, and the column really is text.
 *
 * THE FOUR RECIPIENT COLUMNS ARE THE LOAD-BEARING ONES. A review is one human act that goes to
 * several agents; `recipientKind` says what was settled, `recipientSessionId` which run, and
 * `recipientSaid` and `recipientWhy` are the words somebody typed and the sentence saying how Mole Office
 * arrived at that choice. A restore that lost any of them would leave a review that no longer says
 * who it was addressed to, with every row still present and every count still matching.
 */
export interface SnapAgentMessage {
  id: string
  threadId: string
  position: number
  role: string
  intent: string
  body: string
  context: string | null
  /** `queued`, `sent` or `answered`. */
  state: string
  recipientKind: string | null
  recipientSessionId: string | null
  recipientSaid: string | null
  recipientWhy: string | null
  /** The run an agent's answer came out of. Null on everything a person wrote. */
  runId: string | null
  fromAnnotationId: string | null
  /** The comments one message of a sent review carries, with their quotes, as JSON. Migration 0185. */
  carries: string | null
  /**
   * WHERE THIS HAS GOT TO BETWEEN MOLE OFFICE AND ITS RECIPIENT, and how it got there.
   *
   * All ten are null on every message that exists today, because the dispatch ledger and the durable
   * agent identities that fill them are built after the migration that created the columns. They are
   * compared from the day the columns exist, so the wave that starts writing them cannot lose one in
   * a restore without this proof saying which.
   *
   * `sentAt` is the one that could not be recovered from anything else: it is when Send was pressed,
   * which is the moment a screen counts a wait from, and `createdAt` is when the words were written.
   */
  stateAt: string | null
  sentAt: string | null
  recipientAgentId: string | null
  takenByAgentId: string | null
  takenAt: string | null
  failedBecause: string | null
  handledNote: string | null
  handledBySession: string | null
  writtenByAgentId: string | null
  coordination: string | null
  /** How a key proved the request that wrote the words, as stored, or null. Migration 0178. */
  provedBy: string | null
  createdAt: string
  createdBy: string
}

/**
 * One bounded attempt to answer a conversation, as stored.
 *
 * `request` AND `result` ARE COMPARED PARSED, like `records.data` and for the same reason: key order
 * is not meaning, and the archive writes a document rather than the exact bytes of the column.
 *
 * `request` IS WRITTEN ONCE AND IS THE ONLY RECORD OF WHAT WAS ASKED. An answer is worth nothing
 * except read against the question that produced it, so a restore that lost it would leave results
 * nobody can check.
 *
 * The four stamps and `claimedBy` are null until a worker does each of those things, and null there
 * means nobody has picked this up — a real answer rather than a missing one.
 */
export interface SnapAgentRun {
  id: string
  threadId: string
  runtime: string
  /** `queued`, `claimed`, `running`, `finished`, `failed` or `declined`. */
  state: string
  /** The durable identity this run is for, or null because nothing recorded one. A session is not one. */
  agentId: string | null
  recipientSessionId: string | null
  resumeExternalId: string | null
  claimedBy: string | null
  claimedAt: string | null
  /** Which machine took it, or null because nobody has claimed it or nobody could tell. P23. */
  claimedFromMachine: string | null
  request: unknown
  result: unknown
  error: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

/** How many hours a period holds, as stored. Keyed by horizon and period, which is its primary key. */
export interface SnapCapacity {
  horizon: string
  period: string
  hours: number
  note: string | null
  updatedAt: string
  updatedBy: string
}

export interface SnapAnchor {
  workspaceId: string
  reader: string
  lastSeenAt: string
  lastChangeId: string | null
  /** What "since I last looked" answers with. Measured, because rowid order is not carried. */
  sinceAnchor: number | null
  sinceIds: string[]
  /**
   * WHERE THE ANCHORED ROW SITS IN ITS OWN PROJECT'S APPEND ORDER, and how long that order is.
   *
   * The two numbers exist so the reading above can be checked EXACTLY instead of being asserted to
   * be more than nothing. `readingSinceAnchor` counts the rows whose rowid is greater than the
   * anchored row's, so its answer is `rowsInLog - 1 - anchoredAt` and nothing else — before the
   * restore and after it, in whatever order the restore produced.
   *
   * WHY THAT MATTERS RATHER THAN BEING TIDIER. The restore appends in archive-key order and a
   * change id is a random nanoid, so which position the anchored row lands in is a DRAW.
   * tests/restore-semantics.test.ts asserted `sinceAnchor` was greater than zero after the
   * restore, which is true for 675 of the 676 places the row can land and false for the last one,
   * and the file went red about one run in seventy with the product working perfectly: problem
   * v2LRz8UOHOlh. Read against the position, the same claim needs no luck and says more — the
   * reading FOLLOWS the restored order, which is the finding this file is about.
   *
   * READ FROM PLAIN SQL over `rowid`, not from the product's query, so the two are independent
   * and agreeing means something.
   */
  anchoredAt: number | null
  rowsInLog: number
}

/**
 * One ledger row, RAW, with the two machine columns included.
 *
 * NOT THROUGH `listResources`, and that is the point rather than a shortcut. That function asks the
 * operating system whether each row is still alive, which is the state that must NOT be compared —
 * it is different on every run and it is the whole reason decision 3 exists. What is compared is
 * what is STORED, so this reads the stored row and nothing else.
 */
/** One repository. `root` is a path on the machine that made the archive and travels with it. */
export interface SnapRepository {
  id: string
  workspaceId: string
  name: string
  note: string | null
  root: string | null
  createdAt: string
  updatedAt: string
  createdBy: string
}

/** One stated relationship between a record and some code. */
export interface SnapImplementationRow {
  id: string
  workspaceId: string
  recordId: string
  repositoryId: string
  pattern: string
  relation: string
  provenance: string
  note: string | null
  revisionId: string | null
  statedAt: string
  statedBy: string
  acceptedAt: string | null
  acceptedBy: string | null
  deletedAt: string | null
}

/** One code revision identifier, exactly as it was supplied. */
export interface SnapCodeRevision {
  id: string
  workspaceId: string
  repositoryId: string
  ref: string
  label: string | null
  note: string | null
  statedAt: string
  statedBy: string
}

/**
 * ONE OBSERVATION: what a scan saw about one file at one moment.
 *
 * IT IS AUTHORED AND IT IS EXPORTED, and the reason is the sentence that decides everything about
 * this table: nothing can rebuild a dated observation. `source_files` describes the present and any
 * scan rebuilds it, so it is derived and is left out of an archive; a `file_observations` row is a
 * measurement of a moment that has passed.
 *
 * AND THAT ASYMMETRY IS WHY THE ROW CARRIES `firstScan`. This table comes back from a restore and
 * the three index tables do not, so the next rebuild after any restore sees no previous index and
 * writes the whole repository into this ledger as `added`. The flag is what stops a drift read
 * calling that a change.
 */
export interface SnapFileObservation {
  id: string
  workspaceId: string
  scanId: string
  repositoryId: string | null
  path: string
  change: string
  hash: string | null
  seenAt: string
  since: string | null
  firstScan: number
}

/**
 * ONE ROW SAYING A RESTRICTION REACHED ONE PIECE OF WORK, AND WHAT ANYBODY HAS SAID ABOUT IT.
 *
 * NOTHING ELSE IN THE DATABASE CAN REBUILD ONE. `reachedBy` and `distance` are the link graph AS IT
 * WAS at the moment the row was written, and the graph goes on changing afterwards, so a re-check
 * six weeks later reads a path today's links no longer make. `writtenBy` says which act froze it —
 * the resolution, or a later judgement about a record that became a dependency after it.
 *
 * `state`, `decidedBy`, `decidedAt` and `note` are somebody's judgement about their own work. A
 * restore that lost them would turn "I re-ran this and it holds" back into "nobody has looked",
 * which is the one direction this repository never lets a value move on its own.
 */
export interface SnapRevalidation {
  id: string
  workspaceId: string | null
  restrictionId: string
  recordId: string
  reachedBy: string
  distance: number
  writtenBy: string
  at: string
  state: string
  decidedBy: string | null
  decidedByKind: string | null
  callId: string | null
  decidedAt: string | null
  note: string | null
}

export interface SnapLedger {
  id: string
  workspaceId: string
  sessionRecordId: string
  type: string
  key: string
  detail: string
  registeredAt: string
  registeredBy: string
  releasedAt: string | null
  releasedBy: string | null
  releaseNote: string | null
  /** Machine columns. Expected non-null before, NULL after, and both are asserted. */
  pgid: number | null
  osStartedAt: string | null
  /**
   * What the row records about how it came to exist, both nullable and both exported.
   *
   * `world` is the repository, database, port and HEAD the resource served when the row was
   * written; `startedByTheProduct` is whether Mole Office itself started the process. Neither is a
   * reading of the machine NOW — which is what the two above are, and why those come back NULL.
   * NULL in either of these means nobody recorded it, and it survives a round trip as NULL.
   */
  world: string | null
  startedByTheProduct: number | null
}

/**
 * What "what needs me today" says, IN ONE PROJECT.
 *
 * `workspaceId` IS PART OF THE READING AND NOT A LABEL ON IT. Attention is scoped: the rule is asked
 * one project at a time and answers about that project alone. A snapshot that held one reading
 * would be describing part of a database while the report said it was describing all of it — which
 * is exactly what this file used to do, guarded by a `throw` that stopped the proof the day a second
 * workspace appeared. The guard was right about the danger and wrong about the remedy.
 */
export interface SnapAttention {
  workspaceId: string
  /** The ranked list, in order. This is the strongest single check in the whole file. */
  visibleKeys: string[]
  remainderKeys: string[]
  /** Every visible and remainder row in full, so a row can move without moving position. */
  rows: unknown[]
  counts: unknown
  unclassifiedKeys: string[]
  noStateKeys: string[]
  pausedKeys: string[]
  passedOver: { bucket: string; count: number; keys: string[] }[]
  remainderByGroup: unknown
  /** What the rule was given, so a short list can be told from a small database. */
  read: unknown
}

/** Everything one project says about its sessions. Scoped, for the reason `SnapAttention` gives. */
export interface SnapSessions {
  workspaceId: string
  /** Session records themselves: id, title and stored state. */
  records: { id: string; title: string; state: unknown; deleted: boolean }[]
  /** Every distinct value in `changes.session_id`, with its row count. */
  storedRefs: { stored: string; rows: number }[]
  /** Those values resolved to session records, which is "which session did this". */
  resolved: { stored: string; recordId: string | null; title: string | null; rows: number; unresolved: boolean }[]
  /** Records that declare a session name in their own data. */
  boundNames: { recordId: string; names: string[] }[]
  /** Ledger rows grouped under the session that owns them. */
  ledgerBySession: { sessionRecordId: string; resourceIds: string[] }[]
}

export interface SnapChange {
  id: string
  /**
   * Which project the change happened in, COPIED off the record it is about.
   *
   * NULL IS A REAL VALUE HERE and is carried as one. A change row whose `recordId` answers to
   * nothing has no record to read a project off, so nobody can say — and an archive that wrote
   * `default` there instead would state a judgement nobody made. Comparing it is what proves the
   * daily view can still be asked per project after a restore: `changes` is the largest table and
   * the one the attention rule and "what happened while I was away" both read.
   */
  workspaceId: string | null
  recordId: string
  op: string
  actorType: string
  actorId: string
  sessionId: string | null
  /** The row's place in the order the log was appended in; null only on a row nobody numbered. */
  appendOrder: number | null
  field: string | null
  oldValue: string | null
  newValue: string | null
  /**
   * THE PERSON'S OWN WORDS THIS WRITE WAS MADE ON, as stored, and null for every ordinary write.
   *
   * Compared, because a restore that dropped it would put back a governance act an agent made with
   * nothing beside it saying why it was allowed — which reads exactly like a hole in the guards.
   */
  warrant: string | null
  /**
   * THE ELEVATION THIS WRITE WAS MADE UNDER, as stored, and null for every ordinary write.
   *
   * Compared for the reason the warrant above it is compared: the two are the two keys to one door,
   * and a restore that kept one and dropped the other would put back half the acts an agent made for
   * the person with nothing beside them saying why. Criterion P59.
   */
  elevation: string | null
  /** The one signed package item that carried the act, as JSON text; NULL otherwise. */
  signed_item: string | null
  /**
   * WHO A KEY PROVED, where that is not the actor above, as stored, and null for every ordinary
   * write. Criterion P83, point 5.
   *
   * Compared because a restore that dropped it would put back a row whose key proved one holder
   * while the actor names another, with the proof gone and nothing saying it was ever there. It is
   * compared as a parsed value, like a record's `data`, so a re-serialisation in another key order
   * is not reported as a change nobody made.
   */
  provedHolder: unknown
  /**
   * HOW A KEY PROVED THE REQUEST, as stored, or null when no key proved it. Migration 0178. Compared
   * because a warrant written after the key window closed may cite only words the person's key proved,
   * and a restore that dropped this would put proved words back as words nobody recorded a proof for.
   */
  provedBy: string | null
  /**
   * THE PRESS FOR THE PERSON THAT WROTE THIS ROW, or null where no secretary pressed a door for the person. Migration
   * 0280. Compared because a restore that dropped it would leave a write under the person's grant with no reason and no
   * door the person can read.
   */
  pressId: string | null
  at: string
}

/**
 * One revision of one record: the ledger row, and the content it keeps.
 *
 * THIS IS THE REGION A RESTORE CAN LEAST AFFORD TO LOSE, and it is the newest reason this file
 * exists. Every other authored table can be read from something else if it has to be. A revision
 * holds the ONLY stored copy of what a record used to contain — `changes` says what changed and
 * never what it was, and a `create` row keeps the title and nothing else — so a restore that
 * dropped one has lost a state of the record that nothing can reconstruct.
 *
 * `data` IS COMPARED AS A PARSED VALUE, like a record's own, so a JSON document that came back
 * re-serialised in a different key order is not reported as a change nobody made. `contentHash` is
 * compared as the string it is: it is the compare-and-set token a read of the record hands back, so
 * a restore that changed it would break every write built from a revision.
 */
export interface SnapRevision {
  id: string
  recordId: string
  /** Copied off the record, and NULL when no record answers to `recordId`. See SnapChange. */
  workspaceId: string | null
  seq: number
  contentHash: string
  kind: string
  title: string
  summary: string | null
  data: unknown
  /** The record's soft-delete stamp AS IT WAS at this revision, not the state it is in now. */
  deletedAt: string | null
  op: string
  actorType: string
  actorId: string
  sessionId: string | null
  at: string
  note: string | null
  /** The words this revision was written on, as stored. Null for every ordinary write. */
  warrant: string | null
  /** The elevation it was written under, as stored. Null for every ordinary write. Criterion P59. */
  elevation: string | null
  /** The one signed package item that carried the act, as JSON text; NULL otherwise. */
  signed_item: string | null
  /**
   * WHO A KEY PROVED, where that is not the actor above, as stored, and null for every ordinary
   * write. The same column `changes.provedHolder` is, on the other ledger, compared for the same
   * reason. Criterion P83, point 5.
   */
  provedHolder: unknown
  /** How a key proved the request, as stored, or null. The same column `changes.provedBy` is. */
  provedBy: string | null
  /** Which earlier revision of this record this one took back, or null, which is nearly always. */
  revokesSeq: number | null
  /**
   * The places in `data` whose value another revision holds whole, and which revision, as stored.
   * Null when `data` is whole. A restore that dropped this would hold the hash where the chapters
   * were, so it is carried and compared like every other column of the ledger.
   */
  parts: Record<string, number> | null
}

/** A soft-deleted record with the history that makes it recoverable. */
export interface SnapDeleted {
  id: string
  title: string
  kind: string
  deletedAt: string
  data: unknown
  /** Every change row naming it, oldest first. This is what "recoverable" means. */
  history: { id: string; op: string; field: string | null; at: string; actorType: string; actorId: string }[]
  /** Links pointing at it, which must come back BROKEN rather than absent. */
  incoming: { linkId: string; fromId: string; type: string }[]
}

/**
 * One project boundary, exactly as the table holds it.
 *
 * IN THE SNAPSHOT BECAUSE IT IS AUTHORED. The titles and notes are somebody's words and exist
 * nowhere else — the corpus migration writes its own evidence into `note` — so a restore that lost
 * them would lose the only statement of why a project boundary exists. It is also the table every
 * other row's `workspaceId` points at, so a comparison that skipped it would be checking that 394
 * records name a project without ever checking that the project came back.
 */
export interface SnapWorkspace {
  id: string
  title: string
  note: string | null
  /** How much review a finished run in this project gets, or null because nobody has chosen. */
  reviewLevel: string | null
  /** The registry id of the secretary reminded about its modules, set on the Settings page, or null because nothing is set here (migration 0211). */
  moduleReminderSecretary: string | null
  /** The reason given with that choice, or null because none was given. */
  moduleReminderSecretaryBecause: string | null
  /** The record id of the project's master pipeline, or null because nobody has marked one (migration 0338). */
  masterPipeline: string | null
  /** Whether the project's handed-back package points are inspected, 1 or 0 as stored, or null because nobody has chosen (migration 0345). */
  packageInspection: number | null
  createdAt: string
  updatedAt: string
  /** Live records filed behind it, counted from `records` rather than stored. */
  records: number
}

export interface Snapshot {
  /**
   * The clock every reading was taken against, in milliseconds.
   *
   * FIXED BY THE CALLER AND PASSED TO BOTH SIDES. The attention rule scores how long a thing has
   * sat, so two snapshots taken five seconds apart differ for a reason that has nothing to do with
   * the restore. `compareSnapshots` refuses outright when the two clocks differ, rather than
   * reporting the passage of time as a round-trip failure.
   */
  now: number
  /** Row counts for the seven authored tables, straight from SQL. */
  tables: Record<string, number>
  /** Row counts for the three derived tables. Not expected to survive; measured so it is a number. */
  derived: Record<string, number>
  /**
   * Every row of every table a schema part declares `compared`, by table name, as SQLite stores it.
   * Read with `SELECT *`, so a column the part adds is compared the day it is declared.
   */
  partTables: Record<string, Record<string, unknown>[]>
  /**
   * The row count of every table a schema part declares, by table name. A part table a restore may
   * lose is measured here, so its declared loss is a count before and after and not a claim.
   */
  partTableCounts: Record<string, number>
  /**
   * Row counts for the tables a restore must not bring back. Zero on every restored side, and the
   * corpus deliberately holds a row so that "it comes back empty" is a measurement and not a claim.
   */
  notCarried: Record<string, number>
  /** Every project boundary, with how much is behind it. Compared like any other authored table. */
  workspaces: SnapWorkspace[]
  records: SnapRecord[]
  recordsByKind: Record<string, number>
  /** Every record's provenance, keyed by id. See SnapOrigin for why it is here as well. */
  origins: SnapOrigin[]
  text: SnapText[]
  links: SnapLink[]
  backlinks: SnapEnd[]
  pipelines: SnapPipeline[]
  intent: SnapIntent[]
  /**
   * What the presentation subsystem SAYS about each scope, beside the rows it stores.
   *
   * Kept as well as the rows rather than instead of them: a scope that stores rows and reads back
   * empty would otherwise pass a comparison of the table. Asked once per project, because
   * `listScopes` answers about one.
   */
  scopes: { workspaceId: string; scope: string; targets: number; hasDirection: boolean }[]
  anchors: SnapAnchor[]
  ledger: SnapLedger[]
  // `submissionEvents` STOOD HERE AND IS GONE with migration 0154 (criterion C34): it copied every
  // revision, change and link row the database already held, and a seal names them instead.
  submissionBaselines: { runId: string; watermark: number | null; recovered: string }[]
  legacyUnsealedRuns: { runId: string }[]
  /** The plan: what time was committed to which work, and how many hours each period holds. */
  allocations: SnapAllocation[]
  capacities: SnapCapacity[]
  folderReadings: SnapFolderReading[]
  recurrences: SnapRecurrence[]
  /** The plans, and their lines. Writing, which is the half of planning that has no hours in it. */
  plans: SnapPlan[]
  planLines: SnapPlanLine[]
  /** Why each line was added, reordered or dropped. The only copy of a plan's own reasons. */
  planLineRevisions: SnapPlanLineRevision[]
  /** What every counter counted, fired and held back. The only copy of a counter's count. */
  counterRows: SnapCounterRow[]
  /** What somebody wrote about time, before any of it is a fact. Person-level, like the rest. */
  planningIntents: SnapPlanningIntent[]
  /** The spans of days work was placed on. When, never how much. Person-level, like the rest. */
  workWindows: SnapWorkWindow[]
  /**
   * Who takes part, and the pictures they are drawn with.
   *
   * INSTALLATION-LEVEL rather than person-level, and the difference is worth the word: the owner is
   * the same person in every project on this machine and so is a durable agent, so none of these
   * rows can be placed in a project. `agentRecords` is the exception and is placed by the record it
   * names, which is why it belongs to a project and the registry row it points at does not.
   */
  assets: SnapAsset[]
  people: SnapPerson[]
  officeSceneSettings: Record<string, unknown>[]
  officeMapLayouts: Record<string, unknown>[]
  /** The model each run uses, set on the Settings page, criterion U2, migration 0176. */
  runModels: Record<string, unknown>[]
  /** The directories somebody added by hand as preview roots, criterion U4, migration 0165. */
  previewRootAdditions: Record<string, unknown>[]
  /** The price table the person set in Settings, criterion U3, migration 0177. */
  priceTable: Record<string, unknown>[]
  /** The Casting table and its history, migration 0189. */
  casting: Record<string, unknown>[]
  castingChanges: Record<string, unknown>[]
  /** Several castings for each role and their history, migration 0190, with probability from migration 0268. */
  castingRows: Record<string, unknown>[]
  castingRowChanges: Record<string, unknown>[]
  /** The Casting labels and their history, migration 0349. */
  castingLabels: Record<string, unknown>[]
  castingLabelChanges: Record<string, unknown>[]
  agents: SnapAgent[]
  agentRecords: SnapAgentRecord[]
  /** The one row saying which installation this database belongs to. */
  installation: SnapInstallation[]
  runtimeSettings: { name: string; value: string; until: string | null }[]
  officeRestartGrants: { agentId: string; decisionId: string }[]
  /** Every world the office knows, with its birth and its death. */
  officeWorlds: SnapWorld[]
  /** Every visit the office knows, open and ended. */
  officeVisits: SnapVisit[]
  /** Every visiting agent's credential, pending, trusted and ended. Keyed by its own id. */
  visitorCredentials: SnapVisitorCredential[]
  /** Every request made under one of them. Keyed by its own id. */
  visitorRequests: SnapVisitorRequest[]
  /** Every machine this office trusts or once trusted, keyed by its own id. Criterion P73. */
  trustedMachines: SnapTrustedMachine[]
  /** How far each message got with each recipient. Keyed by each row's own id. */
  messageDelivery: SnapMessageDelivery[]
  /** Who read a conversation they were not part of. Keyed by each row's own id. */
  conversationReads: SnapConversationRead[]
  /** Every group in this database, and every membership of one, each keyed by its own id. */
  groups: SnapGroup[]
  groupMembers: SnapGroupMember[]
  /** Every work claim, keyed by its own id. */
  workClaims: SnapWorkClaim[]
  /** Every hold on an agent handle, keyed by its own id. */
  handleHolds: SnapHandleHold[]
  /** Every addressee named in a dead-letter broadcast, keyed by its own id. Criterion M111. */
  deadLetterClaims: SnapDeadLetterClaim[]
  contactGroups: SnapContactGroup[]
  contactPlacements: SnapContactPlacement[]
  /** Every fold somebody set on one contact group, keyed by its own id. Criterion M121. */
  contactGroupCollapses: SnapContactGroupCollapse[]
  /** Every request an agent filed for one press, and the person's answer, keyed by its own id. */
  onePressRequests: SnapOnePressRequest[]
  /** Every use of a tool on a run, keyed by its own id. */
  toolUses: SnapToolUse[]
  /** Every named test file result, keyed by its own id. */
  testFileRuns: SnapTestFileRun[]
  /** Every handover written by an agent or by the person, keyed by its own id. */
  handovers: SnapHandover[]
  /** Every readiness checklist and every signature on one, each keyed by its own id. */
  readinessChecklists: SnapReadinessChecklist[]
  readinessSignatures: SnapReadinessSignature[]
  /**
   * Every signing package and ordered item, each keyed by its own id, migration 0270, from two
   * decisions.
   */
  signingPackages: SnapSigningPackage[]
  signingPackageItems: SnapSigningPackageItem[]
  /** The owner's list of quick inputs, one row, and every ask for one, keyed by its own id. Migration 0272. */
  quickInputList: Record<string, unknown>[]
  quickInputAsks: Record<string, unknown>[]
  /** Every answer this office's person gave about a door, keyed by the door. Migration 0287. */
  whatTheGrantCarries: Record<string, unknown>[]
  /** Every press a secretary made for the person under their grant, keyed by its own id. Migration 0280. */
  pressesForThePerson: Record<string, unknown>[]
  /** A resident's leave to read, void marks and writes, each keyed by its own id. */
  residentReadGrants: SnapResidentReadGrant[]
  residentVoidMarks: SnapResidentVoidMark[]
  residentSpaceWrites: SnapResidentSpaceWrite[]
  /** A resident's sleeps and postponed sleeps, keyed by their own id (migration 0233). */
  residentSleeps: SnapResidentSleep[]
  /**
   * Talking to an agent: the conversations, everything said in them, and every attempt to answer.
   *
   * NOT person-level and NOT scoped here either. A conversation names its project in a column; a
   * comment and a run belong to the project their conversation names, so they are keyed by their own
   * ids and the project is one join away — which is exactly what a project-scoped archive follows.
   */
  agentThreads: SnapAgentThread[]
  agentMessages: SnapAgentMessage[]
  agentRuns: SnapAgentRun[]
  /** The reviews: who started collecting remarks, from where, and what was in it when they stopped. */
  reviews: SnapReview[]
  /** One marker per comment whose words had gone out before anything recorded which conversation. */
  annotationWordsFixed: SnapAnnotationWordsFixed[]
  /** The one row saying the stored reading-measure words carry their new names, migration 0173. */
  measureWordsRenamed: Record<string, unknown>[]
  /** The repositories a path is resolved against, and the machine-local root of each. */
  repositories: SnapRepository[]
  /** What somebody stated about which code a record is, with its provenance and its acceptance. */
  implementationMap: SnapImplementationRow[]
  /** The code revision strings a caller supplied, which Mole Office stores and never resolves. */
  codeRevisions: SnapCodeRevision[]
  /** What each scan saw about each file. The one authored table nothing can rebuild from the disk. */
  fileObservations: SnapFileObservation[]
  /** Which work each restriction reached, the path it reached by, and who has re-checked it since. */
  revalidations: SnapRevalidation[]
  /**
   * The attention reading and the session reading OF EVERY PROJECT, one entry each.
   *
   * ARRAYS RATHER THAN ONE READING, and that is the whole of the multi-workspace repair. Both are
   * scoped reads; taking one and calling it the snapshot would have left every record in every other
   * project outside the strongest comparisons this file makes, silently, while the report said
   * "held".
   */
  attention: SnapAttention[]
  sessions: SnapSessions[]
  changes: SnapChange[]
  /**
   * Every revision of every record: what each one HELD, which the change log never stored.
   *
   * Compared in full, and one of the strongest comparisons in this file, because there is nothing
   * else in the database to rebuild it from.
   */
  revisions: SnapRevision[]
  /** Change ids in `rowid` order — the order they were APPENDED. Measured, never required. */
  changeAppendOrder: string[]
  deleted: SnapDeleted[]
}

/** Sort by a string key, by code unit, so no comparison depends on the machine's locale. */
function byKey<T>(rows: T[], keyOf: (row: T) => string): T[] {
  return [...rows].sort((a, b) => {
    const x = keyOf(a)
    const y = keyOf(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
}

const isAscii = (s: string): boolean => /^[\x20-\x7E\n\t]*$/.test(s)

/**
 * One project's scoped reading out of a snapshot, or a failure naming the projects that are there.
 *
 * EXPORTED FOR THE TESTS, and it exists so that a caller that wants "the attention list" has to say
 * WHICH PROJECT'S. `snapshot.attention` was one reading and is now one per project; a test reaching
 * for `[0]` would be pinning itself to whichever project the map happened to yield first, which is
 * the same class of accident as reading a scoped query at a hard-coded workspace.
 */
export function readingIn<T extends { workspaceId: string }>(
  rows: readonly T[],
  workspaceId: string,
  what: string,
): T {
  const found = rows.find((r) => r.workspaceId === workspaceId)
  if (found === undefined) {
    throw new Error(
      `this snapshot holds no ${what} for the project "${workspaceId}". It holds ` +
        `${rows.map((r) => r.workspaceId).join(', ') || 'none at all'}.`,
    )
  }
  return found
}

/**
 * The authored tables this proof does not carry, and why each one is out.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROOF PROMISES, AND WHY A LIST HAD TO EXIST BEFORE IT COULD BE KEPT
 * ---------------------------------------------------------------------------------------
 *
 * The promise is that every authored table holds rows in the corpus this builds, so that comparing
 * the database before and after a restore is comparing something. `fillEmptyTables` below exists
 * for exactly that: the seed leaves several tables empty and it fills them, through the product's
 * own routes wherever one exists.
 *
 * Round ten created six authored tables in one migration, several waves before the routes that
 * write them. While a table had no writer at all, the choice was between typing SQL into this corpus
 * and saying plainly that it was out. Saying it was out was the right answer, because a proof built
 * on rows nobody's product ever wrote is a proof about a shape rather than about work — this file's
 * whole argument is that it reads through the product's own readers.
 *
 * THE LIST WAS EMPTY from wave 8 until migration 0190. `revalidations` was the last name on it then, excused with the sentence
 * "Resolving a restriction writes these rows, and that path is not built yet." Wave 8 built that
 * path — `writeRevalidationRows` in lib/records/links.ts writes a row per record a resolution reached, and
 * `recordJudgement` in lib/revalidations.ts records what somebody decided about each — so the excuse
 * became false and the scan below went red naming both files. `fillEmptyTables` resolves a real
 * restriction and judges one of the records it reached, and the comparison
 * "which work a restriction reached, and who re-checked it" holds the rows.
 *
 * HOW A NAME GETS BACK ON THIS LIST. In three cases, and in no other:
 * - a new authored table with no writer anywhere in `src/` yet;
 * - a RETIRED authored table: one a later migration copied into a table that replaces it, and that
 *   is kept only for its history, with no writer anywhere in `src/` any more. Its rows are still in
 *   the snapshot and still compared, so a restore that lost one is noticed; only the corpus leaves it
 *   empty, because filling it would mean writing rows no product path writes, and this proof reads
 *   through the product's own writers;
 * - an authored table the owner took out of backups and exports, with no writer anywhere in `src/`:
 *   one on `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` in src/server/db/table-name-lists.ts. The table stays declared,
 *   but no archive carries its rows, so a restore through an archive cannot bring one back. Its rows
 *   are therefore not in the snapshot and not compared, and the corpus leaves it empty.
 * Each entry states, in more than sixty characters, why nothing can put a row in it; anything
 * shorter is a name being hidden rather than explained. The same scan below closes all three cases:
 * the day anything under `src/` writes a listed table again, it goes red naming the file.
 *
 * HOW IT CLOSES RATHER THAN SITTING HERE. `tests/restore-check.test.ts` reads this list twice: once
 * to say which tables need a snapshot section, and once to scan every file under `src/` for a writer
 * to any table named here. The day a wave writes one, that scan goes red naming the file, and the
 * wave has to fill the table and compare it before its own suite is green again. That is what
 * happened here.
 */
export const NOT_IN_THIS_PROOF: { table: string; why: string }[] = [
  // MIGRATION 0189'S TWO TABLES, RETIRED BY MIGRATION 0190. 0190 copies every row of
  // both into `casting_rows` and `casting_row_changes` and leaves them as they were, and nothing under src/
  // writes them after it. The snapshot still carries and compares them; only the corpus leaves them empty.
  {
    table: 'casting',
    why: 'Migration 0190 copied every row into casting_rows and kept this table as it was; nothing under src/ writes it any more.',
  },
  {
    table: 'casting_changes',
    why: 'Migration 0190 copied every row, with its id, into casting_row_changes and kept this table as it was; nothing under src/ writes it any more.',
  },
  // THE PANEL GRID'S TABLE, LEFT OUT OF BACKUPS AND EXPORTS because nothing writes it since the panel grid
  // was deleted, as a decision and problem _vHwDWnDLLGd record. It stays declared and nothing
  // is deleted from it; no archive carries it.
  {
    table: 'panel_layouts',
    why: 'Its only writer, PUT /api/layout/:id, was deleted with the panel grid on 10 August 2026, so no backup or export carries it.',
  },
  // THE SCHEMA PARTS' TABLES THAT SAY THEY ARE NOT IN THIS PROOF, each with the reason its declaration gives.
  ...thePartTablesNotInThisProof(),
]

/** True when this table is deliberately absent from the corpus this proof builds. */
export function outOfThisProof(table: string): boolean {
  return NOT_IN_THIS_PROOF.some((t) => t.table === table)
}

/**
 * Everything Mole Office says about the database this process has open.
 *
 * EVERY IMPORT IS DYNAMIC, for the reason in the file header: importing `client.ts` opens
 * `MOLE_OFFICE_DB`, and this module is also loaded by the orchestrator, which must not open anything.
 *
 * It reads through the PRODUCT'S OWN readers wherever one exists — `resolveLinks`,
 * `readPipelineBlocks`, `attentionNow`, `readingSinceAnchor` — rather than re-deriving the same
 * facts from the tables. A restore proof that rebuilt the answers itself would be comparing two
 * databases against a third implementation, and would pass while the product's own reading of them
 * disagreed.
 */
export async function buildSnapshot(now: number): Promise<Snapshot> {
  const { db, sqlite } = await import('../src/server/db/client.ts')
  const schema = await import('../src/server/db/schema.ts')
  const records = await import('../src/server/lib/records.ts')
  const blocks = await import('@shared/blocks.ts')
  const presentation = await import('../src/server/lib/presentation.ts')

  const count = (table: string): number => {
    const row = sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number } | undefined
    // A count query always answers. Reporting zero for a missing answer would read as an empty
    // table, which is the one wrong answer this whole file is about.
    if (row === undefined) throw new Error(`counting ${table} returned nothing; the database is not usable`)
    return Number(row.n)
  }

  const tables: Record<string, number> = {}
  for (const t of schema.AUTHORED_TABLES) tables[t] = count(t)
  const derived: Record<string, number> = {}
  for (const t of schema.DERIVED_TABLES) derived[t] = count(t)
  // THE TABLES A COPY MUST NOT CARRY, COUNTED SO THEIR ABSENCE IS A MEASUREMENT. `held_keys` is not
  // authored, so it is in none of the counts above and an import does not carry it. A restore by raw
  // file copy DOES bring it back, which is the reading the comparison below exists to notice.
  const notCarried: Record<string, number> = {}
  for (const t of schema.NOT_CARRIED_TABLES) notCarried[t] = count(t)

  // ---- the project boundaries, and the walk that makes every scoped read below honest
  //
  // Every read in the product answers about ONE workspace. This used to name `default` and THROW if
  // the database held anything else, and the throw was the right instinct with the wrong remedy: a
  // snapshot that named one project would have covered part of the database while the report said it
  // covered all of it, so stopping was better than lying. But it also meant the proof could only ever
  // run over a corpus with one project — which is why a multi-workspace archive was never
  // round-tripped here, and why the five cross-boundary links that made the real database
  // unrestorable from its own export were found by hand instead of by this.
  //
  // So it walks every workspace instead, and the per-project readings below are arrays. The
  // assertion that replaces the throw is stronger than the throw was: every record in the table must
  // be reachable through one of these workspaces, so a row filed behind a project that is not
  // declared stops the proof rather than disappearing out of the snapshot.
  const workspaceRows = sqlite
    .prepare(
      'SELECT id, title, note, review_level, module_reminder_secretary, module_reminder_secretary_because, master_pipeline, package_inspection, created_at, updated_at ' +
        'FROM workspaces ORDER BY id',
    )
    .all() as {
    id: string
    title: string
    note: string | null
    review_level: string | null
    module_reminder_secretary: string | null
    module_reminder_secretary_because: string | null
    master_pipeline: string | null
    package_inspection: number | null
    created_at: string
    updated_at: string
  }[]
  const liveByWorkspace = new Map(
    (
      sqlite
        .prepare('SELECT workspace_id AS w, count(*) AS n FROM records WHERE deleted_at IS NULL GROUP BY workspace_id')
        .all() as { w: string; n: number }[]
    ).map((r) => [r.w, Number(r.n)]),
  )
  const workspaces: SnapWorkspace[] = workspaceRows.map((row) => ({
    id: row.id,
    title: row.title,
    note: row.note,
    reviewLevel: row.review_level,
    moduleReminderSecretary: row.module_reminder_secretary,
    moduleReminderSecretaryBecause: row.module_reminder_secretary_because,
    masterPipeline: row.master_pipeline,
    packageInspection: row.package_inspection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    records: liveByWorkspace.get(row.id) ?? 0,
  }))
  if (workspaces.length === 0) {
    throw new Error(
      'This database declares no workspace at all, so every read in the product refuses and there is nothing ' +
        'for this proof to be about. A migrated database always has the default workspace.',
    )
  }
  const workspaceIds = workspaces.map((w) => w.id)

  // includeDeleted, always. A soft-deleted record is not an absence in Mole Office, and leaving it out
  // here would make the one class of row that is easiest to lose the one class nobody checked.
  //
  // ASKED ONCE PER PROJECT AND THEN JOINED, rather than read off the table, because `listRecords` is
  // the product's own reader and it answers about one project. The join is then checked against the
  // raw row count, which is the assertion that replaces the old throw and is stronger than it was: a
  // record behind a workspace nobody declared is unreachable by every request in the product, and it
  // would otherwise be absent from this snapshot on both sides and compare equal to itself.
  const byWorkspace = new Map(
    workspaceIds.map((id) => [id, records.listRecords({ workspaceId: id, includeDeleted: true })]),
  )
  // EACH RECORD ONCE, BY ID. A project's list holds its view of the message centre too, so a
  // message is met under the message centre and again under each project it was written in or is about.
  const all = [...new Map([...byWorkspace.values()].flat().map((one) => [one.id, one] as const)).values()]
  const storedRecordCount = count('records')
  if (all.length !== storedRecordCount) {
    const reachable = new Set(all.map((r) => r.id))
    const missed = (
      sqlite.prepare('SELECT id, workspace_id AS w FROM records').all() as { id: string; w: string }[]
    ).filter((r) => !reachable.has(r.id))
    // TWO DIFFERENT FAULTS REACH THIS LINE AND THEY ARE NOT THE SAME FAULT. Either the rows name a
    // project nobody declared — genuinely unreachable, a database to repair — or this walk did not
    // visit a project that IS declared, which is a fault in this file and not in the data. Naming
    // the first when the second is true would send a reader to look at the wrong thing, so the two
    // are told apart from what was measured rather than assumed.
    const visited = new Set(byWorkspace.keys())
    const undeclared = [...new Set(missed.map((r) => r.w))].filter((w) => !workspaceIds.includes(w))
    const unvisited = workspaceIds.filter((w) => !visited.has(w))
    throw new Error(
      `\`records\` holds ${storedRecordCount} rows and only ${all.length} are reachable through the projects ` +
        `this snapshot walked (${[...visited].join(', ') || 'none'}), out of ${workspaces.length} declared ` +
        `(${workspaceIds.join(', ')}).` +
        (undeclared.length > 0
          ? ` Some name a project that is not in \`workspaces\` — ${undeclared.join(', ')} — so no request in the ` +
            `product can ever answer about them.`
          : '') +
        (unvisited.length > 0
          ? ` This snapshot never asked about ${unvisited.join(', ')}, which IS declared: the walk is wrong rather ` +
            `than the database.`
          : '') +
        ` First few: ${missed.slice(0, 10).map((r) => `${r.id} (project "${r.w}")`).join(', ')}.`,
    )
  }
  // `origin` is not on the shape `listRecords` returns, so it is read off the rows themselves.
  const originOf = new Map<string, string | null>(
    (sqlite.prepare('SELECT id, origin FROM records').all() as { id: string; origin: string | null }[]).map((r) => [
      r.id,
      r.origin,
    ]),
  )
  const snapRecords: SnapRecord[] = byKey(
    all.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      ownerId: r.ownerId,
      kind: r.kind,
      title: r.title,
      summary: r.summary,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      data: r.data,
      origin: originOf.get(r.id) ?? null,
    })),
    (r) => r.id,
  )

  const { readOrigin } = await import('@shared/types.ts')
  const origins: SnapOrigin[] = byKey(
    snapRecords.map((r) => ({
      id: r.id,
      title: r.title,
      origin: r.origin,
      readable: readOrigin(r.origin) !== null,
    })),
    (r) => r.id,
  )

  const recordsByKind: Record<string, number> = {}
  for (const r of snapRecords) recordsByKind[r.kind] = (recordsByKind[r.kind] ?? 0) + 1

  const text: SnapText[] = []
  for (const r of snapRecords) {
    if (!isAscii(r.title)) text.push({ id: r.id, where: 'title', text: r.title, codePoints: [...r.title].map((c) => c.codePointAt(0) ?? 0) })
    if (r.summary !== null && !isAscii(r.summary)) {
      text.push({ id: r.id, where: 'summary', text: r.summary, codePoints: [...r.summary].map((c) => c.codePointAt(0) ?? 0) })
    }
  }

  const linkRows = db.select().from(schema.links).all()
  const snapLinks: SnapLink[] = byKey(
    linkRows.map((l) => ({
      id: l.id,
      workspaceId: l.workspaceId,
      ownerId: l.ownerId,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      fromId: l.fromId,
      toId: l.toId,
      type: l.type,
      inferred: l.inferred,
      createdBy: l.createdBy,
      createdByType: l.createdByType,
      gate: l.gate,
      gateUpTo: l.gateUpTo,
      gateUpToSort: l.gateUpToSort,
      carries: l.carries,
    })),
    (l) => l.id,
  )

  // Both ends of every link, read the way a record page reads them, for every record that has any.
  const touched = new Set<string>()
  for (const l of snapLinks) {
    touched.add(l.fromId)
    touched.add(l.toId)
  }
  const backlinks: SnapEnd[] = byKey(
    [...touched].map((recordId) => ({
      recordId,
      links: byKey(
        records.resolveLinks(recordId).map((g) => ({
          linkId: g.linkId,
          type: g.type,
          label: g.label,
          isBacklink: g.isBacklink,
          inferred: g.inferred,
          broken: g.broken,
          otherId: g.other.id,
          otherTitle: g.other.title,
          gateLabel: g.gateLabel,
          gateProblem: g.gateProblem,
        })),
        (g) => g.linkId,
      ),
    })),
    (e) => e.recordId,
  )

  const blockLinkRows = snapLinks.map((l) => ({
    id: l.id,
    fromId: l.fromId,
    toId: l.toId,
    type: l.type,
    gate: l.gate === 'hard' || l.gate === 'partial' ? (l.gate as 'hard' | 'partial') : null,
    upTo: l.gateUpTo,
    inferred: l.inferred,
  }))
  // READ INSIDE THE PIPELINE'S OWN PROJECT, not against every record in the database. A route hands
  // `readPipelineBlocks` the records of one workspace, so handing it all of them would let a
  // pipeline resolve a block that no page could ever show it — a reading nobody can get.
  const pipelines: SnapPipeline[] = byKey(
    [...byWorkspace.entries()]
      .flatMap(([workspaceId, here]) =>
        here.filter((r) => r.kind === 'pipeline').map((pipeline) => ({ pipeline, here, workspaceId })),
      )
      .map(({ pipeline, here }) => {
        const reading = blocks.readPipelineBlocks(pipeline, here, blockLinkRows)
        return {
          pipelineId: pipeline.id,
          title: pipeline.title,
          storedIds: reading.storedIds,
          undeclared: reading.undeclared,
          problems: reading.problems.map((p) => ({ at: p.at, blockId: p.blockId, problem: p.problem })),
          blocks: reading.blocks.map((b) => ({
            id: b.id,
            name: b.name,
            title: b.title,
            state: b.state,
            measured: b.measured,
            modules: b.modules,
            moduleIds: b.moduleIds,
            needs: b.needs.map((n) => ({ blockId: n.blockId, gate: n.gate, ...(n.upTo === undefined ? {} : { upTo: n.upTo }), linkId: n.linkId })),
            consequence: b.consequence,
            pause: b.pause,
          })),
        }
      }),
    (p) => p.pipelineId,
  )

  const intentRows = db.select().from(schema.presentationIntent).all()
  const intent: SnapIntent[] = byKey(
    intentRows.map((row) => ({
      workspaceId: row.workspaceId,
      scope: row.scope,
      target: row.target,
      // Drizzle parses this column already, so key order in the stored text cannot look like a
      // difference and nothing has to parse it a second time.
      intent: row.intent as unknown,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    })),
    (r) => `${r.workspaceId}\u0000${r.scope}\u0000${r.target}`,
  )
  // Read once through the product's own reader too, so a scope that stores rows but reads back
  // differently is caught. The rows above are what is stored; this is what a drawing is told. Asked
  // per project, and keyed by project, because `listScopes` answers about one.
  const scopes = byKey(
    workspaceIds.flatMap((workspaceId) =>
      presentation
        .listScopes(workspaceId)
        .map((s) => ({ workspaceId, scope: s.scope, targets: s.nodes, hasDirection: s.hasDirection })),
    ),
    (s) => `${s.workspaceId}\u0000${s.scope}`,
  )

  const anchorRows = db.select().from(schema.readerAnchors).all()
  // ASKED IN THE ANCHOR'S OWN PROJECT. This read `'default'` whatever the row said, so an anchor in
  // a second project would have been compared against a "what is new" answer computed from somebody
  // else's change log. The key below carries the project for the same reason: one reader has one
  // anchor PER PROJECT, and keying by the reader alone silently drops all but one of them.
  // Each project's change log in the order it was APPENDED, so an anchor's reading can be read
  // against the position of the row it is anchored on rather than against luck. Built once here
  // because `anchorRows` is a handful and the log is the biggest table.
  const appendOrderPerProject = new Map<string, string[]>()
  for (const row of sqlite.prepare('SELECT id, workspace_id FROM changes ORDER BY rowid ASC').all() as {
    id: string
    workspace_id: string | null
  }[]) {
    const project = row.workspace_id ?? ''
    const list = appendOrderPerProject.get(project)
    if (list === undefined) appendOrderPerProject.set(project, [row.id])
    else list.push(row.id)
  }

  const anchors: SnapAnchor[] = byKey(
    anchorRows.map((row) => {
      const reading = records.readingSinceAnchor(row.reader, row.workspaceId, { limit: 1000 })
      const order = appendOrderPerProject.get(row.workspaceId) ?? []
      const at = row.lastChangeId === null ? -1 : order.indexOf(row.lastChangeId)
      return {
        workspaceId: row.workspaceId,
        reader: row.reader,
        lastSeenAt: row.lastSeenAt,
        lastChangeId: row.lastChangeId,
        sinceAnchor: reading.counts.sinceAnchor,
        sinceIds: byKey((reading.changes ?? []).map((c) => c.id), (id) => id),
        // NULL AND NOT -1 when the row is not in this project's log at all, which is a different
        // fact from being at the start of it, and is what a reader anchored on nothing looks like.
        anchoredAt: at < 0 ? null : at,
        rowsInLog: order.length,
      }
    }),
    // U+0000 rather than a space, the way every other composite key in this file is built: a reader
    // name is free text and a space in one would make two different anchors share a key.
    (a) => `${a.workspaceId}\u0000${a.reader}`,
  )

  // THE PLAN. Read straight from SQL like the ledger below, and keyed by its own primary key
  // rather than by a project, because no table in the planning layer has one. A restore that lost them would
  // lose every hour the person had committed, and nothing else in this file would notice.
  const allocations: SnapAllocation[] = byKey(
    (sqlite.prepare('SELECT * FROM allocations').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      horizon: row['horizon'] as string,
      period: row['period'] as string,
      recordId: row['record_id'] as string,
      plannedHours: (row['planned_hours'] as number | null) ?? null,
      actualHours: (row['actual_hours'] as number | null) ?? null,
      state: row['state'] as string,
      note: (row['note'] as string | null) ?? null,
      fromPlanLine: (row['from_plan_line'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (a) => a.id,
  )

  const plans: SnapPlan[] = byKey(
    (sqlite.prepare('SELECT * FROM plans').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      title: row['title'] as string,
      state: row['state'] as string,
      readAt: (row['read_at'] as string | null) ?? null,
      readByAgent: (row['read_by_agent'] as string | null) ?? null,
      readUnderGrant: (row['read_under_grant'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
      movedFromDraft: (row['moved_from_draft'] as string | null) ?? null,
    })),
    (p) => p.id,
  )

  const planLines: SnapPlanLine[] = byKey(
    (sqlite.prepare('SELECT * FROM plan_lines').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      planId: row['plan_id'] as string,
      position: row['position'] as number,
      text: row['text'] as string,
      recordId: (row['record_id'] as string | null) ?? null,
      remark: (row['remark'] as string | null) ?? null,
      updatedAt: row['updated_at'] as string,
      updatedBy: row['updated_by'] as string,
    })),
    (l) => l.id,
  )
  const planLineRevisions: SnapPlanLineRevision[] = byKey(
    (sqlite.prepare('SELECT * FROM plan_line_revisions').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      planId: row['plan_id'] as string,
      lineId: row['line_id'] as string,
      seq: row['seq'] as number,
      op: row['op'] as string,
      reason: row['reason'] as string,
      at: row['at'] as string,
      changedBy: row['changed_by'] as string,
    })),
    (r) => r.id,
  )
  const counterRowsRead: SnapCounterRow[] = byKey(
    (sqlite.prepare('SELECT * FROM counter_rows').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      counterId: row['counter_id'] as string,
      seq: row['seq'] as number,
      what: row['what'] as string,
      at: row['at'] as string,
      atInstant: (row['at_instant'] as string | null) ?? null,
      by: (row['by'] as string | null) ?? null,
      eventKind: (row['event_kind'] as string | null) ?? null,
      eventId: (row['event_id'] as string | null) ?? null,
      eventAt: (row['event_at'] as string | null) ?? null,
      count: row['count'] as number,
      amount: (row['amount'] as number | null) ?? null,
      because: row['because'] as string,
      whichTrigger: (row['which_trigger'] as number | null) ?? null,
      answer: (row['answer'] as string | null) ?? null,
    })),
    (r) => r.id,
  )
  const capacities: SnapCapacity[] = byKey(
    (sqlite.prepare('SELECT * FROM planning_capacity').all() as Record<string, unknown>[]).map((row) => ({
      horizon: row['horizon'] as string,
      period: row['period'] as string,
      hours: row['hours'] as number,
      note: (row['note'] as string | null) ?? null,
      updatedAt: row['updated_at'] as string,
      updatedBy: row['updated_by'] as string,
    })),
    (c) => `${c.horizon}\u0000${c.period}`,
  )

  const folderReadings: SnapFolderReading[] = byKey(
    (sqlite.prepare('SELECT * FROM folder_readings').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      ownerId: row['owner_id'] as string,
      ownerKind: (row['owner_kind'] as string | null) ?? null,
      folder: row['folder'] as string,
      readBy: row['read_by'] as string,
      readByKind: (row['read_by_kind'] as string | null) ?? null,
      note: (row['note'] ?? null) as string | null,
      // The stored text, not a parsed object: what is being proved is that the bytes survive.
      pieces: typeof row['pieces'] === 'string' ? row['pieces'] : JSON.stringify(row['pieces']),
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    })),
    (f) => f.id,
  )

  // WHAT SOMEBODY WROTE ABOUT TIME. Read straight from SQL and keyed by its own id, like the rest of
  // the planning layer, because none of these tables has a project. A restore that lost these rows
  // would lose every loose plan a person had written down and nothing else here would notice.
  const planningIntents: SnapPlanningIntent[] = byKey(
    (sqlite.prepare('SELECT * FROM planning_intents').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      said: row['said'] as string,
      recordId: (row['record_id'] as string | null) ?? null,
      planLineId: (row['plan_line_id'] as string | null) ?? null,
      horizon: (row['horizon'] as string | null) ?? null,
      period: (row['period'] as string | null) ?? null,
      hours: (row['hours'] as number | null) ?? null,
      state: row['state'] as string,
      createdAt: row['created_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (i) => i.id,
  )

  // WHEN SOMEBODY MEANS TO WORK ON SOMETHING. Read straight from SQL and keyed by its own id, like
  // the rest of the planning layer, because none of these tables has a project. A restore that lost
  // these rows would empty every week a person had placed work on, and the hours would still be
  // there — so nothing else in this file would notice.
  const workWindows: SnapWorkWindow[] = byKey(
    (sqlite.prepare('SELECT * FROM work_windows').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      recordId: row['record_id'] as string,
      startsOn: row['starts_on'] as string,
      endsOn: row['ends_on'] as string,
      note: (row['note'] as string | null) ?? null,
      state: row['state'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (w) => w.id,
  )

  // WHO TAKES PART, AND THE PICTURES. Read straight from SQL and keyed by each table's own primary
  // key, because none of the three registry tables has a project to be keyed by. A restore that lost
  // these would leave every message addressed to nobody and every avatar drawn for nobody, and the
  // records they map to would still be there — so nothing else in this file would notice.
  const assets: SnapAsset[] = byKey(
    (sqlite.prepare('SELECT * FROM assets').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      kind: row['kind'] as string,
      origin: row['origin'] as string,
      path: (row['path'] as string | null) ?? null,
      mime: row['mime'] as string,
      bytes: (row['bytes'] as number | null) ?? null,
      createdAt: row['created_at'] as string,
      createdByKind: (row['created_by_kind'] as string | null) ?? null,
      createdById: (row['created_by_id'] as string | null) ?? null,
      licenceSource: (row['licence_source'] as string | null) ?? null,
      drawnFrom: (row['drawn_from'] as string | null) ?? null,
    })),
    (a) => a.id,
  )
  const people: SnapPerson[] = byKey(
    (sqlite.prepare('SELECT * FROM people').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      name: row['name'] as string,
      handle: row['handle'] as string,
      avatarAssetId: row['avatar_asset_id'] as string,
      state: (row['state'] as string | null) ?? null,
      stateAt: (row['state_at'] as string | null) ?? null,
      presenceChoice: (row['presence_choice'] as string | null) ?? null,
      presenceChoiceAt: (row['presence_choice_at'] as string | null) ?? null,
      circleShows: (row['circle_shows'] as string | null) ?? null,
      circlePicture: (row['circle_picture'] as string | null) ?? null,
      messageLinkLevel: (row['message_link_level'] as string | null) ?? null,
      messageLinkLayout: (row['message_link_layout'] as string | null) ?? null,
      messageProjectMark: (row['message_project_mark'] as string | null) ?? null,
      messagePictures: (row['message_pictures'] as string | null) ?? null,
      chatTextSize: (row['chat_text_size'] as string | null) ?? null,
      chatButtonStays: (row['chat_button_stays'] as string | null) ?? null,
      chatOpensAs: (row['chat_opens_as'] as string | null) ?? null,
      chatLabels: (row['chat_labels'] as string | null) ?? null,
      shippedFlags: (row['shipped_flags'] as string | null) ?? null,
      themes: (row['themes'] as string | null) ?? null,
      chatLayout: (row['chat_layout'] as string | null) ?? null,
      agentTags: (row['agent_tags'] as string | null) ?? null,
      sendKey: (row['send_key'] as string | null) ?? null,
      shortcuts: (row['shortcuts'] as string | null) ?? null,
      officeOwner: (row['office_owner'] as string | null) ?? null,
      language: (row['language'] as string | null) ?? null,
      mediaLoad: (row['media_load'] as string | null) ?? null,
      role: (row['role'] as string | null) ?? null,
      occupation: (row['occupation'] as string | null) ?? null,
      portrait: (row['portrait'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      createdByKind: (row['created_by_kind'] as string | null) ?? null,
      createdById: (row['created_by_id'] as string | null) ?? null,
      homeWorld: (row['home_world'] as string | null) ?? null,
      homeInstallation: (row['home_installation'] as string | null) ?? null,
      citizenSince: (row['citizen_since'] as string | null) ?? null,
      addressName: (row['address_name'] as string | null) ?? null,
      addressSecondPerson: (row['address_second_person'] as string | null) ?? null,
      addressThirdPerson: (row['address_third_person'] as string | null) ?? null,
      addressTitle: (row['address_title'] as string | null) ?? null,
      addressSetByKind: (row['address_set_by_kind'] as string | null) ?? null,
      addressSetById: (row['address_set_by_id'] as string | null) ?? null,
      addressSetAt: (row['address_set_at'] as string | null) ?? null,
    })),
    (p) => p.id,
  )
  const officeSceneSettings = sqlite.prepare('SELECT * FROM office_scene_settings ORDER BY only_row').all() as Record<string, unknown>[]
  const officeMapLayouts = sqlite.prepare('SELECT * FROM office_map_layouts ORDER BY configuration_key').all() as Record<string, unknown>[]
  const runModels = sqlite.prepare('SELECT * FROM run_models ORDER BY only_row').all() as Record<string, unknown>[]
  const previewRootAdditions = sqlite.prepare('SELECT * FROM preview_root_additions ORDER BY only_row').all() as Record<string, unknown>[]
  const priceTable = sqlite.prepare('SELECT * FROM price_table ORDER BY only_row').all() as Record<string, unknown>[]
  const quickInputList = sqlite.prepare('SELECT * FROM quick_input_list ORDER BY only_row').all() as Record<string, unknown>[]
  const quickInputAsks = sqlite.prepare('SELECT * FROM quick_input_asks ORDER BY id').all() as Record<string, unknown>[]
  const casting = sqlite.prepare('SELECT * FROM casting ORDER BY role, project').all() as Record<string, unknown>[]
  const castingChanges = sqlite.prepare('SELECT * FROM casting_changes ORDER BY id').all() as Record<string, unknown>[]
  const castingRows = sqlite.prepare('SELECT * FROM casting_rows ORDER BY id').all() as Record<string, unknown>[]
  const castingRowChanges = sqlite.prepare('SELECT * FROM casting_row_changes ORDER BY id').all() as Record<string, unknown>[]
  const castingLabels = sqlite.prepare('SELECT * FROM casting_labels ORDER BY id').all() as Record<string, unknown>[]
  const castingLabelChanges = sqlite.prepare('SELECT * FROM casting_label_changes ORDER BY id').all() as Record<string, unknown>[]
  const agents: SnapAgent[] = byKey(
    (sqlite.prepare('SELECT * FROM agents').all() as Record<string, unknown>[]).map((row) => ({
      pixelAppearance: (row['pixel_appearance'] as string | null) ?? null,
      pixelScale: (row['pixel_scale'] as string | null) ?? null,
      id: row['id'] as string,
      name: row['name'] as string,
      handle: row['handle'] as string,
      avatarAssetId: row['avatar_asset_id'] as string,
      state: (row['state'] as string | null) ?? null,
      stateAt: (row['state_at'] as string | null) ?? null,
      stateByKind: (row['state_by_kind'] as string | null) ?? null,
      stateById: (row['state_by_id'] as string | null) ?? null,
      runtime: (row['runtime'] as string | null) ?? null,
      startedByKind: (row['started_by_kind'] as string | null) ?? null,
      startedById: (row['started_by_id'] as string | null) ?? null,
      ownerId: (row['owner_id'] as string | null) ?? null,
      ownerKind: (row['owner_kind'] as string | null) ?? null,
      role: (row['role'] as string | null) ?? null,
      // AND WHO CHOSE THAT CARD, carried as the text it is stored as, for the reason the grant below
      // is: parsing it here would make the comparison about two readings of a string rather than
      // about the string. Criterion P75.
      cardChosenBy: (row['card_chosen_by'] as string | null) ?? null,
      // AND EVERY GRANT THE PERSON MADE IT, carried as the text it is stored as, for the reason the
      // work area below is: parsing it here would make the comparison about two readings of a string
      // rather than about the string. Criterion P59.
      elevation: (row['elevation'] as string | null) ?? null,
      // THE WORK AREA IS A JSON COLUMN AND IS CARRIED AS THE TEXT IT IS STORED AS. Parsing it here
      // would make the comparison about two readings of a string rather than about the string, and a
      // restore that changed the spacing inside it would then pass.
      workArea: (row['work_area'] as string | null) ?? null,
      startedFor: (row['started_for'] as string | null) ?? null,
      startedByRun: (row['started_by_run'] as string | null) ?? null,
      credential: (row['credential'] as string | null) ?? null,
      retired: row['retired'] as number,
      retiredBecause: (row['retired_because'] as string | null) ?? null,
      retiredAt: (row['retired_at'] as string | null) ?? null,
      retiredByKind: (row['retired_by_kind'] as string | null) ?? null,
      retiredById: (row['retired_by_id'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      createdByKind: (row['created_by_kind'] as string | null) ?? null,
      createdById: (row['created_by_id'] as string | null) ?? null,
      homeWorld: (row['home_world'] as string | null) ?? null,
      homeInstallation: (row['home_installation'] as string | null) ?? null,
      citizenSince: (row['citizen_since'] as string | null) ?? null,
      addressName: (row['address_name'] as string | null) ?? null,
      addressSecondPerson: (row['address_second_person'] as string | null) ?? null,
      addressThirdPerson: (row['address_third_person'] as string | null) ?? null,
      addressTitle: (row['address_title'] as string | null) ?? null,
      addressSetByKind: (row['address_set_by_kind'] as string | null) ?? null,
      addressSetById: (row['address_set_by_id'] as string | null) ?? null,
      addressSetAt: (row['address_set_at'] as string | null) ?? null,
      residentSince: (row['resident_since'] as string | null) ?? null,
      residentProposal: (row['resident_proposal'] as string | null) ?? null,
      residentDecision: (row['resident_decision'] as string | null) ?? null,
      residentConfirmedByKind: (row['resident_confirmed_by_kind'] as string | null) ?? null,
      residentConfirmedById: (row['resident_confirmed_by_id'] as string | null) ?? null,
      successorId: (row['successor_id'] as string | null) ?? null,
      successorNamedAt: (row['successor_named_at'] as string | null) ?? null,
      successorNamedByKind: (row['successor_named_by_kind'] as string | null) ?? null,
      successorNamedById: (row['successor_named_by_id'] as string | null) ?? null,
      residentNamingAskedAt: (row['resident_naming_asked_at'] as string | null) ?? null,
      residentNamedAt: (row['resident_named_at'] as string | null) ?? null,
      residentNamedByKind: (row['resident_named_by_kind'] as string | null) ?? null,
      residentNamedById: (row['resident_named_by_id'] as string | null) ?? null,
      readsReleasesFromTheCheck: (row['reads_releases_from_the_check'] as string | null) ?? null,
      runKeysOnly: row['run_keys_only'] as number,
      sleepTimeStarts: (row['sleep_time_starts'] as string | null) ?? null,
      sleepTimeMinutes: (row['sleep_time_minutes'] as number | null) ?? null,
      sleepTimeSetAt: (row['sleep_time_set_at'] as string | null) ?? null,
      sleepTimeSetBy: (row['sleep_time_set_by'] as string | null) ?? null,
    })),
    (a) => a.id,
  )
  const agentRecords: SnapAgentRecord[] = byKey(
    (sqlite.prepare('SELECT * FROM agent_records').all() as Record<string, unknown>[]).map((row) => ({
      recordId: row['record_id'] as string,
      agentId: row['agent_id'] as string,
    })),
    (m) => m.recordId,
  )
  const installation: SnapInstallation[] = (
    sqlite.prepare('SELECT * FROM installation').all() as Record<string, unknown>[]
  ).map((row) => ({
    onlyRow: row['only_row'] as number,
    id: row['id'] as string,
    how: row['how'] as string,
    writtenAt: row['written_at'] as string,
    windowClosedAt: (row['window_closed_at'] as string | null) ?? null,
    windowClosedByKind: (row['window_closed_by_kind'] as string | null) ?? null,
    windowClosedById: (row['window_closed_by_id'] as string | null) ?? null,
    keepBackups: (row['keep_backups'] as number | null) ?? null,
    untracedRequestDays: (row['untraced_request_days'] as number | null) ?? null,
    tracedRequestDays: (row['traced_request_days'] as number | null) ?? null,
    goalShortDays: (row['goal_short_days'] as number | null) ?? null,
    goalMediumDays: (row['goal_medium_days'] as number | null) ?? null,
    goalLongDays: (row['goal_long_days'] as number | null) ?? null,
    agentsMayInject: (row['agents_may_inject'] as number | null) ?? null,
    machineNames: (row['machine_names'] as string | null) ?? null,
    deadLetterSecretary: (row['dead_letter_secretary'] as string | null) ?? null,
    deadLetterAfterDays: (row['dead_letter_after_days'] as number | null) ?? null,
    deadLetterAfterCount: (row['dead_letter_after_count'] as number | null) ?? null,
    addressForBrowsers: (row['address_for_browsers'] as string | null) ?? null,
    mergeQueueOwner: (row['merge_queue_owner'] as string | null) ?? null,
    relatedTestsFirst: (row['related_tests_first'] as number | null) ?? null,
    loadReadMsTop: (row['load_read_ms_top'] as number | null) ?? null,
    loadCpuPercentTop: (row['load_cpu_percent_top'] as number | null) ?? null,
    loadMemoryMbTop: (row['load_memory_mb_top'] as number | null) ?? null,
    pluginSwitches: (row['plugin_switches'] as string | null) ?? null,
    checksInMergesOnly: (row['checks_in_merges_only'] as number | null) ?? null,
    staleForkBases: (row['stale_fork_bases'] as string | null) ?? null,
    otherProjectsMessagesSince: (row['other_projects_messages_since'] as string | null) ?? null,
  }))
  const officeWorlds: SnapWorld[] = byKey(
    (sqlite.prepare('SELECT * FROM worlds').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      name: row['name'] as string,
      // WHAT THE WORLD IS FOR, and WHICH HANDBACK IT BELONGS TO. Criteria P87 and C33, 12 September
      // 2026. A sentence somebody wrote about why a world existed cannot be worked out again from
      // anything else, so an archive that dropped them would lose them for good.
      purpose: (row['purpose'] as string | null) ?? null,
      handback: (row['handback'] as string | null) ?? null,
      kind: row['kind'] as string,
      startedByKind: (row['started_by_kind'] as string | null) ?? null,
      startedById: (row['started_by_id'] as string | null) ?? null,
      checkout: (row['checkout'] as string | null) ?? null,
      head: (row['head'] as string | null) ?? null,
      databaseIdentity: row['database_identity'] as string,
      address: (row['address'] as string | null) ?? null,
      addressForOtherMachines: (row['address_for_other_machines'] as string | null) ?? null,
      standing: row['standing'] as string,
      parentWorld: (row['parent_world'] as string | null) ?? null,
      bornAt: row['born_at'] as string,
      diedAt: (row['died_at'] as string | null) ?? null,
      diedBecause: (row['died_because'] as string | null) ?? null,
      installation: row['installation'] as string,
      runKeyId: (row['run_key_id'] as string | null) ?? null,
    })),
    (w) => w.id,
  )
  const officeVisits: SnapVisit[] = byKey(
    (sqlite.prepare('SELECT * FROM visits').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      visitorKind: row['visitor_kind'] as string,
      visitorId: row['visitor_id'] as string,
      fromWorld: row['from_world'] as string,
      toWorld: row['to_world'] as string,
      since: row['since'] as string,
      until: (row['until'] as string | null) ?? null,
      why: row['why'] as string,
      registeredAt: row['registered_at'] as string,
      reportedAt: (row['reported_at'] as string | null) ?? null,
    })),
    (v) => v.id,
  )
  const messageDelivery: SnapMessageDelivery[] = byKey(
    (sqlite.prepare('SELECT * FROM message_delivery').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      messageId: row['message_id'] as string,
      recipientKind: row['recipient_kind'] as string,
      recipientId: row['recipient_id'] as string,
      mark: row['mark'] as string,
      at: row['at'] as string,
      because: row['because'] as string | null,
      run: row['run'] as string | null,
      inferredBy: (row['inferred_by'] as string | null) ?? null,
      offerPutOffAt: (row['offer_put_off_at'] as string | null) ?? null,
      remindAt: (row['remind_at'] as string | null) ?? null,
      remindSetByKind: (row['remind_set_by_kind'] as string | null) ?? null,
      remindSetById: (row['remind_set_by_id'] as string | null) ?? null,
      remindedAt: (row['reminded_at'] as string | null) ?? null,
      carriedIn: (row['carried_in'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const groupRows: SnapGroup[] = byKey(
    (sqlite.prepare('SELECT * FROM groups').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      name: row['name'] as string,
      openedByKind: row['opened_by_kind'] as string,
      openedById: row['opened_by_id'] as string,
      openedBecause: row['opened_because'] as string,
      openedAt: row['opened_at'] as string,
      about: (row['about'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const groupMemberRows: SnapGroupMember[] = byKey(
    (sqlite.prepare('SELECT * FROM group_members').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      groupId: row['group_id'] as string,
      memberKind: row['member_kind'] as string,
      memberId: row['member_id'] as string,
      joinedAt: row['joined_at'] as string,
      joinedBecause: row['joined_because'] as string,
      leftAt: (row['left_at'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const workClaimRows: SnapWorkClaim[] = byKey(
    (sqlite.prepare('SELECT * FROM work_claims').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      claimantKind: row['claimant_kind'] as string,
      claimantId: row['claimant_id'] as string,
      run: row['run'] as string,
      things: row['things'] as string,
      openedAt: row['opened_at'] as string,
      renewedAt: (row['renewed_at'] as string | null) ?? null,
      releasedAt: (row['released_at'] as string | null) ?? null,
      releasedBecause: (row['released_because'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const handleHoldRows: SnapHandleHold[] = byKey(
    (sqlite.prepare('SELECT * FROM handle_holds').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      agentId: row['agent_id'] as string,
      sessionRecordId: row['session_record_id'] as string,
      machine: row['machine'] as string,
      runtime: row['runtime'] as string,
      claimedAt: row['claimed_at'] as string,
      lastHeardAt: row['last_heard_at'] as string,
      releasedAt: (row['released_at'] as string | null) ?? null,
      releasedBecause: (row['released_because'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const deadLetterClaimRows: SnapDeadLetterClaim[] = byKey(
    (sqlite.prepare('SELECT * FROM dead_letter_claims').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      groupId: row['group_id'] as string,
      agentId: row['agent_id'] as string,
      openedAt: row['opened_at'] as string,
      claimedByKind: (row['claimed_by_kind'] as string | null) ?? null,
      claimedById: (row['claimed_by_id'] as string | null) ?? null,
      claimedAt: (row['claimed_at'] as string | null) ?? null,
      claimedBecause: (row['claimed_because'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const contactGroupRows: SnapContactGroup[] = byKey(
    (sqlite.prepare('SELECT * FROM contact_groups').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      ownerKind: row['owner_kind'] as string,
      ownerId: row['owner_id'] as string,
      key: row['key'] as string,
      side: (row['side'] as string | null) ?? null,
      name: row['name'] as string,
      at: row['at'] as number,
      createdAt: row['created_at'] as string,
    })),
    (one) => one.id,
  )
  const contactPlacementRows: SnapContactPlacement[] = byKey(
    (sqlite.prepare('SELECT * FROM contact_placements').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      ownerKind: row['owner_kind'] as string,
      ownerId: row['owner_id'] as string,
      contact: row['contact'] as string,
      groupKey: (row['group_key'] as string | null) ?? null,
      at: (row['at'] as number | null) ?? null,
      placedAt: row['placed_at'] as string,
    })),
    (one) => one.id,
  )
  const contactGroupCollapseRows: SnapContactGroupCollapse[] = byKey(
    (sqlite.prepare('SELECT * FROM contact_group_collapses').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      ownerKind: row['owner_kind'] as string,
      ownerId: row['owner_id'] as string,
      groupKey: row['group_key'] as string,
      collapsed: row['collapsed'] as number,
      setAt: row['set_at'] as string,
    })),
    (one) => one.id,
  )
  const onePressRequestRows: SnapOnePressRequest[] = byKey(
    (sqlite.prepare('SELECT * FROM one_press_requests').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      act: row['act'] as string,
      inputs: row['inputs'] as string,
      askedBy: row['asked_by'] as string,
      shows: row['shows'] as string,
      because: (row['because'] as string | null) ?? null,
      state: row['state'] as string,
      askedAt: row['asked_at'] as string,
      answeredAt: (row['answered_at'] as string | null) ?? null,
      answeredByKind: (row['answered_by_kind'] as string | null) ?? null,
      answeredById: (row['answered_by_id'] as string | null) ?? null,
      outcome: (row['outcome'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const toolUseRows: SnapToolUse[] = byKey(
    (sqlite.prepare('SELECT * FROM tool_uses').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      runId: row['run_id'] as string,
      seq: row['seq'] as number,
      at: row['at'] as string,
      tool: row['tool'] as string,
      said: row['said'] as string,
      actorType: (row['actor_type'] as string | null) ?? null,
      actorId: (row['actor_id'] as string | null) ?? null,
      movedAt: (row['moved_at'] as string | null) ?? null,
      proof: (row['proof'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const testFileRows: SnapTestFileRun[] = byKey(
    (sqlite.prepare('SELECT * FROM test_file_runs').all() as Record<string, unknown>[]).map(row => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      useId: row['use_id'] as string,
      file: row['file'] as string,
      result: row['result'] as string,
      seconds: row['seconds'] as number | null,
      testFileHash: row['test_file_hash'] as string | null,
      treeCommit: row['tree_commit'] as string | null,
      treeChange: row['tree_change'] as string | null,
    })),
    row => row.id,
  )
  const handoverRows: SnapHandover[] = byKey(
    (sqlite.prepare('SELECT * FROM handovers').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      agentId: row['agent_id'] as string,
      workspaceId: row['workspace_id'] as string,
      text: row['text'] as string,
      writtenAt: row['written_at'] as string,
      writtenByKind: row['written_by_kind'] as string,
      writtenById: row['written_by_id'] as string,
      sessionId: (row['session_id'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const signingPackageRows: SnapSigningPackage[] = byKey(
    (sqlite.prepare('SELECT * FROM signing_packages').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      broughtBy: row['brought_by'] as string,
      forAgent: row['for_agent'] as string,
      task: row['task'] as string,
      state: row['state'] as string,
      broughtAt: row['brought_at'] as string,
      answeredAt: row['answered_at'] as string | null,
      answeredByKind: row['answered_by_kind'] as string | null,
      answeredById: row['answered_by_id'] as string | null,
      outcome: row['outcome'] as string | null,
      holdEndsAt: row['hold_ends_at'] as string | null,
      holdEndedAt: row['hold_ended_at'] as string | null,
      holdEndedHow: row['hold_ended_how'] as string | null,
    })),
    (one) => one.id,
  )
  const signingPackageItemRows: SnapSigningPackageItem[] = byKey(
    (sqlite.prepare('SELECT * FROM signing_package_items').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      packageId: row['package_id'] as string,
      position: row['position'] as number,
      act: row['act'] as string,
      inputs: row['inputs'] as string,
      why: row['why'] as string,
      shows: row['shows'] as string,
      changes: row['changes'] as string,
      undone: row['undone'] as string,
      state: row['state'] as string,
      outcome: row['outcome'] as string | null,
      doneAt: row['done_at'] as string | null,
      carriedOut: row['carried_out'] as string,
      carriedOutBy: row['carried_out_by'] as string | null,
      carriedOutIn: row['carried_out_in'] as string | null,
    })),
    (one) => one.id,
  )
  const readinessChecklistRows: SnapReadinessChecklist[] = byKey(
    (sqlite.prepare('SELECT * FROM readiness_checklists').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      operation: row['operation'] as string,
      inputs: row['inputs'] as string,
      onWhat: row['on_what'] as string,
      shows: row['shows'] as string,
      level: row['level'] as string,
      signers: row['signers'] as string,
      raisedByKind: row['raised_by_kind'] as string,
      raisedById: row['raised_by_id'] as string,
      because: (row['because'] as string | null) ?? null,
      state: row['state'] as string,
      raisedAt: row['raised_at'] as string,
      endsAt: row['ends_at'] as string,
      closedAt: (row['closed_at'] as string | null) ?? null,
      closedByKind: (row['closed_by_kind'] as string | null) ?? null,
      closedById: (row['closed_by_id'] as string | null) ?? null,
      outcome: (row['outcome'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const readinessSignatureRows: SnapReadinessSignature[] = byKey(
    (sqlite.prepare('SELECT * FROM readiness_signatures').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      checklistId: row['checklist_id'] as string,
      signerKind: row['signer_kind'] as string,
      signerId: row['signer_id'] as string,
      onWhat: row['on_what'] as string,
      signedAt: row['signed_at'] as string,
      withdrawnAt: (row['withdrawn_at'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const residentReadGrants: SnapResidentReadGrant[] = byKey(
    (sqlite.prepare('SELECT * FROM resident_read_grants').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      residentId: row['resident_id'] as string,
      readerId: row['reader_id'] as string,
      until: row['until'] as string,
      givenAt: row['given_at'] as string,
      givenByKind: row['given_by_kind'] as string,
      givenById: row['given_by_id'] as string,
      endedAt: (row['ended_at'] as string | null) ?? null,
      endedByKind: (row['ended_by_kind'] as string | null) ?? null,
      endedById: (row['ended_by_id'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const residentVoidMarks: SnapResidentVoidMark[] = byKey(
    (sqlite.prepare('SELECT * FROM resident_void_marks').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      residentId: row['resident_id'] as string,
      path: row['path'] as string,
      because: row['because'] as string,
      markedAt: row['marked_at'] as string,
      markedByKind: row['marked_by_kind'] as string,
      markedById: row['marked_by_id'] as string,
    })),
    (one) => one.id,
  )
  const residentSpaceWrites: SnapResidentSpaceWrite[] = byKey(
    (sqlite.prepare('SELECT * FROM resident_space_writes').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      residentId: row['resident_id'] as string,
      path: row['path'] as string,
      bytes: row['bytes'] as number,
      sha256: row['sha256'] as string,
      writtenAt: row['written_at'] as string,
      writtenByKind: row['written_by_kind'] as string,
      writtenById: row['written_by_id'] as string,
      replacedVersion: (row['replaced_version'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const residentSleeps: SnapResidentSleep[] = byKey(
    (sqlite.prepare('SELECT * FROM resident_sleeps').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      agentId: row['agent_id'] as string,
      what: row['what'] as string,
      beganAt: row['began_at'] as string,
      endedAt: (row['ended_at'] as string | null) ?? null,
      because: (row['because'] as string | null) ?? null,
      byKind: row['by_kind'] as string,
      byId: row['by_id'] as string,
      sessionId: (row['session_id'] as string | null) ?? null,
      wakesAt: (row['wakes_at'] as string | null) ?? null,
      reminderId: (row['reminder_id'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const conversationReads: SnapConversationRead[] = byKey(
    (sqlite.prepare('SELECT * FROM conversation_reads').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      readerKind: row['reader_kind'] as string,
      readerId: row['reader_id'] as string,
      pair: row['pair'] as string,
      asSide: row['as_side'] as string,
      asSideKind: (row['as_side_kind'] as string | null) ?? null,
      at: row['at'] as string,
    })),
    (one) => one.id,
  )

  // TALKING TO AN AGENT. Read straight from SQL for the reason `SnapAgentMessage` gives — the
  // product's own reader reshapes the recipient columns and computes a reading that is not stored —
  // and keyed by each row's own id. A comment and a run are scoped to a project through their
  // conversation, so nothing here is keyed by a workspace: the join is what a scoped ARCHIVE
  // follows, and this snapshot is over the whole database.
  const agentThreads: SnapAgentThread[] = byKey(
    (sqlite.prepare('SELECT * FROM agent_threads').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      title: row['title'] as string,
      mode: row['mode'] as string,
      state: row['state'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (t) => t.id,
  )

  const agentMessages: SnapAgentMessage[] = byKey(
    (sqlite.prepare('SELECT * FROM agent_messages').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      threadId: row['thread_id'] as string,
      position: row['position'] as number,
      role: row['role'] as string,
      intent: row['intent'] as string,
      body: row['body'] as string,
      context: (row['context'] as string | null) ?? null,
      state: row['state'] as string,
      recipientKind: (row['recipient_kind'] as string | null) ?? null,
      recipientSessionId: (row['recipient_session_id'] as string | null) ?? null,
      recipientSaid: (row['recipient_said'] as string | null) ?? null,
      recipientWhy: (row['recipient_why'] as string | null) ?? null,
      runId: (row['run_id'] as string | null) ?? null,
      // WHICH COMMENT THIS MESSAGE CAME FROM, added by migration 0100. It is what stops a second
      // Send writing a held comment's words into the conversation twice, so a restore that lost it
      // would give back a database where sending again duplicates somebody's writing.
      fromAnnotationId: (row['from_annotation_id'] as string | null) ?? null,
      carries: (row['carries'] as string | null) ?? null,
      stateAt: (row['state_at'] as string | null) ?? null,
      sentAt: (row['sent_at'] as string | null) ?? null,
      recipientAgentId: (row['recipient_agent_id'] as string | null) ?? null,
      takenByAgentId: (row['taken_by_agent_id'] as string | null) ?? null,
      takenAt: (row['taken_at'] as string | null) ?? null,
      failedBecause: (row['failed_because'] as string | null) ?? null,
      handledNote: (row['handled_note'] as string | null) ?? null,
      handledBySession: (row['handled_by_session'] as string | null) ?? null,
      writtenByAgentId: (row['written_by_agent_id'] as string | null) ?? null,
      coordination: (row['coordination'] as string | null) ?? null,
      provedBy: (row['proved_by'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (m) => m.id,
  )

  /** A stored JSON document as a value. A document that will not parse is a fault, not an absence. */
  const document = (value: unknown, what: string): unknown => {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') throw new Error(`${what} is stored as ${typeof value} and a JSON column is text`)
    try {
      return JSON.parse(value) as unknown
    } catch (err) {
      throw new Error(`${what} is not readable JSON (${(err as Error).message}), so this proof cannot compare it`)
    }
  }

  const agentRuns: SnapAgentRun[] = byKey(
    (sqlite.prepare('SELECT * FROM agent_runs').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      threadId: row['thread_id'] as string,
      runtime: row['runtime'] as string,
      state: row['state'] as string,
      agentId: (row['agent_id'] as string | null) ?? null,
      recipientSessionId: (row['recipient_session_id'] as string | null) ?? null,
      resumeExternalId: (row['resume_external_id'] as string | null) ?? null,
      claimedBy: (row['claimed_by'] as string | null) ?? null,
      claimedAt: (row['claimed_at'] as string | null) ?? null,
      claimedFromMachine: (row['claimed_from_machine'] as string | null) ?? null,
      request: document(row['request'], `agent_runs.request of ${String(row['id'])}`),
      result: document(row['result'], `agent_runs.result of ${String(row['id'])}`),
      error: (row['error'] as string | null) ?? null,
      startedAt: (row['started_at'] as string | null) ?? null,
      endedAt: (row['ended_at'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
    })),
    (r) => r.id,
  )

  const visitorCredentials: SnapVisitorCredential[] = byKey(
    (sqlite.prepare('SELECT * FROM visitor_credentials').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      handle: row['handle'] as string,
      name: row['name'] as string,
      role: row['role'] as string,
      tokenHash: row['token_hash'] as string,
      world: (row['world'] as string | null) ?? null,
      machine: (row['machine'] as string | null) ?? null,
      machineHow: row['machine_how'] as string,
      conversationPath: (row['conversation_path'] as string | null) ?? null,
      startDirectory: (row['start_directory'] as string | null) ?? null,
      runtime: (row['runtime'] as string | null) ?? null,
      sessionRecord: (row['session_record'] as string | null) ?? null,
      standing: row['standing'] as string,
      confirmedByKind: (row['confirmed_by_kind'] as string | null) ?? null,
      confirmedById: (row['confirmed_by_id'] as string | null) ?? null,
      confirmedAt: (row['confirmed_at'] as string | null) ?? null,
      endsAt: row['ends_at'] as string,
      endedAt: (row['ended_at'] as string | null) ?? null,
      endedBecause: (row['ended_because'] as string | null) ?? null,
      issuedAt: row['issued_at'] as string,
    })),
    (one) => one.id,
  )
  const visitorRequests: SnapVisitorRequest[] = byKey(
    (sqlite.prepare('SELECT * FROM visitor_requests').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      credentialId: row['credential_id'] as string,
      at: row['at'] as string,
      method: row['method'] as string,
      route: row['route'] as string,
      operation: (row['operation'] as string | null) ?? null,
      wrote: row['wrote'] as number,
      refusedBecause: (row['refused_because'] as string | null) ?? null,
      mismatch: document(row['mismatch'], `visitor_requests.mismatch of ${String(row['id'])}`),
      fromATrustedMachine: (row['from_a_trusted_machine'] as number | null) ?? null,
    })),
    (one) => one.id,
  )
  const trustedMachines: SnapTrustedMachine[] = byKey(
    (sqlite.prepare('SELECT * FROM trusted_machines').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      address: row['address'] as string,
      note: (row['note'] as string | null) ?? null,
      how: row['how'] as string,
      credentialId: (row['credential_id'] as string | null) ?? null,
      addedAt: row['added_at'] as string,
      addedByKind: (row['added_by_kind'] as string | null) ?? null,
      addedById: (row['added_by_id'] as string | null) ?? null,
      removedAt: (row['removed_at'] as string | null) ?? null,
      removedByKind: (row['removed_by_kind'] as string | null) ?? null,
      removedById: (row['removed_by_id'] as string | null) ?? null,
      removedBecause: (row['removed_because'] as string | null) ?? null,
    })),
    (one) => one.id,
  )
  const reviews: SnapReview[] = byKey(
    (sqlite.prepare('SELECT * FROM reviews').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      entry: row['entry'] as string,
      state: row['state'] as string,
      startedAt: row['started_at'] as string,
      startedBy: row['started_by'] as string,
      collectedAt: (row['collected_at'] as string | null) ?? null,
      frozen: (row['frozen'] as string | null) ?? null,
      fromThreadId: (row['from_thread_id'] as string | null) ?? null,
      // WHERE A SENT REVIEW WENT, AND WHEN, added by migration 0090. `from_thread_id` is where the
      // remarks were WRITTEN and these say where the review went; a restore that lost them would
      // give back a review saying it was sent and unable to say where to.
      sentThreadId: (row['sent_thread_id'] as string | null) ?? null,
      // WHAT WAS READ OF SEVERAL COMMENTS AT ONCE, added by migration 0110. There is no second copy
      // of it anywhere: it used to be written into the sentence beside each member and is not now.
      readGroups: (row['read_groups'] as string | null) ?? null,
      sentAt: (row['sent_at'] as string | null) ?? null,
      reach: row['reach'] as string,
      startedByAgent: (row['started_by_agent'] as string | null) ?? null,
      // WHAT IT TOOK IN AND WHO IT GOES TO, added by migration 0202 in wave 13r round 15. Neither is stored anywhere else.
      takenIn: (row['taken_in'] as string | null) ?? null,
      goesTo: (row['goes_to'] as string | null) ?? null,
    })),
    (r) => r.id,
  )

  const repositories: SnapRepository[] = byKey(
    (sqlite.prepare('SELECT * FROM repositories').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      name: row['name'] as string,
      note: (row['note'] as string | null) ?? null,
      root: (row['root'] as string | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (r) => r.id,
  )

  const implementationMap: SnapImplementationRow[] = byKey(
    (sqlite.prepare('SELECT * FROM implementation_map').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      recordId: row['record_id'] as string,
      repositoryId: row['repository_id'] as string,
      pattern: row['pattern'] as string,
      relation: row['relation'] as string,
      provenance: row['provenance'] as string,
      note: (row['note'] as string | null) ?? null,
      revisionId: (row['revision_id'] as string | null) ?? null,
      statedAt: row['stated_at'] as string,
      statedBy: row['stated_by'] as string,
      // THE TWO THAT CARRY THE WHOLE MEANING OF THE ROW. `authorityOf` reads `accepted_by` off the
      // stored string, so a restore that lost it turns ownership back into a guess silently.
      acceptedAt: (row['accepted_at'] as string | null) ?? null,
      acceptedBy: (row['accepted_by'] as string | null) ?? null,
      deletedAt: (row['deleted_at'] as string | null) ?? null,
    })),
    (r) => r.id,
  )

  const annotationWordsFixed: SnapAnnotationWordsFixed[] = byKey(
    (sqlite.prepare('SELECT * FROM annotation_words_fixed').all() as Record<string, unknown>[]).map((row) => ({
      annotationId: row['annotation_id'] as string,
      fixedAt: row['fixed_at'] as string,
      because: row['because'] as string,
    })),
    (r) => r.annotationId,
  )

  const measureWordsRenamed = sqlite
    .prepare('SELECT * FROM measure_words_renamed ORDER BY only_row')
    .all() as Record<string, unknown>[]

  const revalidationRows: SnapRevalidation[] = byKey(
    (sqlite.prepare('SELECT * FROM revalidations').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: (row['workspace_id'] as string | null) ?? null,
      restrictionId: row['restriction_id'] as string,
      recordId: row['record_id'] as string,
      // THE PATH AS IT WAS, carried as the stored text and never re-derived. Parsing it here and
      // comparing the parse would let a restore change the bytes and still hold.
      reachedBy: row['reached_by'] as string,
      distance: Number(row['distance']),
      writtenBy: row['written_by'] as string,
      at: row['at'] as string,
      state: row['state'] as string,
      decidedBy: (row['decided_by'] as string | null) ?? null,
      decidedByKind: (row['decided_by_kind'] as string | null) ?? null,
      callId: (row['call_id'] as string | null) ?? null,
      decidedAt: (row['decided_at'] as string | null) ?? null,
      note: (row['note'] as string | null) ?? null,
    })),
    (r) => r.id,
  )

  const fileObservations: SnapFileObservation[] = byKey(
    (sqlite.prepare('SELECT * FROM file_observations').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      scanId: row['scan_id'] as string,
      repositoryId: (row['repository_id'] as string | null) ?? null,
      path: row['path'] as string,
      change: row['change'] as string,
      hash: (row['hash'] as string | null) ?? null,
      seenAt: row['seen_at'] as string,
      since: (row['since'] as string | null) ?? null,
      firstScan: Number(row['first_scan']),
    })),
    (r) => r.id,
  )

  const codeRevisions: SnapCodeRevision[] = byKey(
    (sqlite.prepare('SELECT * FROM implementation_revisions').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      workspaceId: row['workspace_id'] as string,
      repositoryId: row['repository_id'] as string,
      ref: row['ref'] as string,
      label: (row['label'] as string | null) ?? null,
      note: (row['note'] as string | null) ?? null,
      statedAt: row['stated_at'] as string,
      statedBy: row['stated_by'] as string,
    })),
    (r) => r.id,
  )

  const recurrences: SnapRecurrence[] = byKey(
    (sqlite.prepare('SELECT * FROM planning_recurrences').all() as Record<string, unknown>[]).map((row) => ({
      id: row['id'] as string,
      recordId: row['record_id'] as string,
      every: row['every'] as string,
      days: (row['days'] as string | null) ?? null,
      hoursEach: (row['hours_each'] as number | null) ?? null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
      createdBy: row['created_by'] as string,
    })),
    (r) => r.id,
  )

  const ledgerRows = sqlite.prepare('SELECT * FROM session_resources').all() as {
    id: string
    workspace_id: string
    session_record_id: string
    type: string
    key: string
    pgid: number | null
    os_started_at: string | null
    detail: string
    registered_at: string
    registered_by: string
    released_at: string | null
    released_by: string | null
    release_note: string | null
    world: string | null
    started_by_the_product: number | null
  }[]
  const ledger: SnapLedger[] = byKey(
    ledgerRows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      sessionRecordId: row.session_record_id,
      type: row.type,
      key: row.key,
      detail: row.detail,
      registeredAt: row.registered_at,
      registeredBy: row.registered_by,
      releasedAt: row.released_at,
      releasedBy: row.released_by,
      releaseNote: row.release_note,
      pgid: row.pgid,
      osStartedAt: row.os_started_at,
      world: row.world,
      startedByTheProduct: row.started_by_the_product,
    })),
    (r) => r.id,
  )

  // `resources: []` on both sides, and said out loud rather than hidden: what is alive on this
  // machine is not in the database, so it cannot round-trip and is not what is being compared.
  //
  // ONE READING PER PROJECT. The rule is scoped; asking it once at `default` and calling the answer
  // "the attention list" would have left every ranked row of every other project untested by the
  // strongest comparison in this file.
  const attention: SnapAttention[] = workspaceIds.map((workspaceId) => {
    const reading = records.attentionNow({ workspaceId, resources: [], now })
    return {
      workspaceId,
      visibleKeys: reading.visible.map((r) => r.key),
      remainderKeys: reading.remainder.map((r) => r.key),
      rows: [...reading.visible, ...reading.remainder] as unknown[],
      counts: reading.counts,
      unclassifiedKeys: reading.unclassified.map((r) => r.key),
      noStateKeys: reading.noState.map((r) => r.key),
      pausedKeys: reading.paused.map((r) => r.key),
      passedOver: reading.passedOver.map((g) => ({ bucket: g.bucket, count: g.count, keys: g.keys })),
      remainderByGroup: reading.remainderByGroup,
      read: reading.read,
    }
  })

  const changeRows = db.select().from(schema.changes).all()
  const changes: SnapChange[] = byKey(
    changeRows.map((c) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      recordId: c.recordId,
      op: c.op,
      actorType: c.actorType,
      actorId: c.actorId,
      sessionId: c.sessionId,
      appendOrder: c.appendOrder,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      warrant: c.warrant,
      elevation: c.elevation,
      signed_item: c.signed_item,
      provedHolder: c.provedHolder,
      provedBy: c.provedBy,
      pressId: c.pressId,
      at: c.at,
    })),
    (c) => c.id,
  )
  const whatTheGrantCarries = byKey(
    db.select().from(schema.whatTheGrantCarries).all() as Record<string, unknown>[],
    (row) => String(row['door']),
  )
  const pressesForThePerson = byKey(
    db.select().from(schema.pressesForThePerson).all() as Record<string, unknown>[],
    (row) => String(row['id']),
  )
  const changeAppendOrder = (sqlite.prepare('SELECT id FROM changes ORDER BY rowid ASC').all() as { id: string }[]).map(
    (r) => r.id,
  )

  // The revision ledger, keyed by its own id like the change log. `data` comes back parsed, because
  // drizzle declares the column as JSON, so two archives holding one document in two key orders
  // compare equal — a re-serialisation is not a change anybody made.
  const revisions: SnapRevision[] = byKey(
    db
      .select()
      .from(schema.revisions)
      .all()
      .map((r) => ({
        id: r.id,
        recordId: r.recordId,
        workspaceId: r.workspaceId,
        seq: r.seq,
        contentHash: r.contentHash,
        kind: r.kind,
        title: r.title,
        summary: r.summary,
        data: r.data,
        deletedAt: r.deletedAt,
        op: r.op,
        actorType: r.actorType,
        actorId: r.actorId,
        sessionId: r.sessionId,
        at: r.at,
        note: r.note,
        warrant: r.warrant,
        elevation: r.elevation,
        signed_item: r.signed_item,
        provedHolder: r.provedHolder,
        provedBy: r.provedBy,
        revokesSeq: r.revokesSeq,
        parts: r.parts,
      })),
    (r) => r.id,
  )

  // ONE READING PER PROJECT, for the reason attention has one. `storedSessionRefs` and `sessionsIn`
  // both resolve a run name INSIDE one project — a session record's id means a session in that
  // project or it means nothing there — so a reading taken at `default` would have reported every
  // other project's sessions as unresolved names, on both sides, equally, and held.
  const sessions: SnapSessions[] = workspaceIds.map((workspaceId) => {
    const here = byWorkspace.get(workspaceId) ?? []
    const hereIds = new Set(here.map((r) => r.id))
    const bySession = new Map<string, string[]>()
    for (const row of ledger) {
      if (row.workspaceId !== workspaceId) continue
      const list = bySession.get(row.sessionRecordId)
      if (list === undefined) bySession.set(row.sessionRecordId, [row.id])
      else list.push(row.id)
    }
    return {
      workspaceId,
      records: byKey(
        here
          .filter((r) => r.kind === 'session')
          .map((r) => ({
            id: r.id,
            title: r.title,
            state: (r.data as { state?: unknown }).state ?? null,
            deleted: r.deletedAt !== null,
          })),
        (r) => r.id,
      ),
      storedRefs: byKey(records.storedSessionRefs(workspaceId), (r) => r.stored),
      resolved: byKey(
        records
          .sessionsIn(
            changeRows.filter((c) => c.workspaceId === workspaceId).map((c) => ({ sessionId: c.sessionId })),
            workspaceId,
          )
          .map((s) => ({
            stored: s.stored,
            recordId: s.recordId,
            title: s.title,
            rows: s.rows,
            unresolved: s.unresolved,
          })),
        (s) => s.stored,
      ),
      boundNames: byKey(
        here
          .map((r) => ({ recordId: r.id, names: records.sessionNamesOf(r.id) }))
          .filter((r) => r.names.length > 0),
        (r) => r.recordId,
      ),
      ledgerBySession: byKey(
        [...bySession.entries()]
          // A ledger row whose session record is in another project is a row the boundary should not
          // have allowed; it is left out of this project's grouping rather than reported as its own,
          // and `rowsNamingNoWorkspace`-style checks belong to the boundary comparison, not here.
          .filter(([sessionRecordId]) => hereIds.has(sessionRecordId))
          .map(([sessionRecordId, resourceIds]) => ({
            sessionRecordId,
            resourceIds: byKey(resourceIds, (id) => id),
          })),
        (s) => s.sessionRecordId,
      ),
    }
  })

  const incomingBy = new Map<string, { linkId: string; fromId: string; type: string }[]>()
  for (const l of snapLinks) {
    const list = incomingBy.get(l.toId)
    const entry = { linkId: l.id, fromId: l.fromId, type: l.type }
    if (list === undefined) incomingBy.set(l.toId, [entry])
    else list.push(entry)
  }
  const historyBy = new Map<string, SnapChange[]>()
  for (const c of changes) {
    const list = historyBy.get(c.recordId)
    if (list === undefined) historyBy.set(c.recordId, [c])
    else list.push(c)
  }
  const deleted: SnapDeleted[] = byKey(
    snapRecords
      .filter((r) => r.deletedAt !== null)
      .map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        // Narrowed by the filter above; the type does not follow a filter, so it is stated.
        deletedAt: r.deletedAt ?? '',
        data: r.data,
        history: byKey(historyBy.get(r.id) ?? [], (c) => `${c.at}\u0000${c.id}`).map((c) => ({
          id: c.id,
          op: c.op,
          field: c.field,
          at: c.at,
          actorType: c.actorType,
          actorId: c.actorId,
        })),
        incoming: byKey(incomingBy.get(r.id) ?? [], (l) => l.linkId),
      })),
    (r) => r.id,
  )

  return {
    now,
    tables,
    derived,
    partTables: readThePartTables(sqlite),
    partTableCounts: countThePartTables(sqlite),
    notCarried,
    workspaces,
    records: snapRecords,
    recordsByKind,
    origins,
    text,
    links: snapLinks,
    backlinks,
    pipelines,
    intent: intent.map((row) => ({ ...row })),
    anchors,
    ledger,
    submissionBaselines: db.select().from(schema.submissionBaselines).all(),
    legacyUnsealedRuns: db.select().from(schema.legacyUnsealedRuns).all(),
    allocations,
    capacities,
    folderReadings,
    recurrences,
    plans,
    planLines,
    planLineRevisions,
    counterRows: counterRowsRead,
    planningIntents,
    workWindows,
    assets,
    people,
    officeSceneSettings,
    officeMapLayouts,
    runModels,
    previewRootAdditions,
    priceTable,
    casting,
    castingChanges,
    castingRows,
    castingRowChanges,
    castingLabels,
    castingLabelChanges,
    agents,
    agentRecords,
    installation,
    runtimeSettings: sqlite.prepare('SELECT name,value,until FROM runtime_settings ORDER BY name').all() as {name:string;value:string;until:string|null}[],
    officeRestartGrants: (sqlite.prepare('SELECT agent_id AS agentId,decision_id AS decisionId FROM office_restart_grants ORDER BY agent_id').all()) as {agentId:string;decisionId:string}[],
    officeWorlds,
    officeVisits,
    visitorCredentials,
    visitorRequests,
    trustedMachines,
    messageDelivery,
    conversationReads,
    groups: groupRows,
    groupMembers: groupMemberRows,
    workClaims: workClaimRows,
    handleHolds: handleHoldRows,
    deadLetterClaims: deadLetterClaimRows,
    contactGroups: contactGroupRows,
    contactPlacements: contactPlacementRows,
    contactGroupCollapses: contactGroupCollapseRows,
    onePressRequests: onePressRequestRows,
    toolUses: toolUseRows,
    testFileRuns: testFileRows,
    handovers: handoverRows,
    signingPackages: signingPackageRows,
    signingPackageItems: signingPackageItemRows,
    readinessChecklists: readinessChecklistRows,
    readinessSignatures: readinessSignatureRows,
    quickInputList,
    quickInputAsks,
    whatTheGrantCarries,
    pressesForThePerson,
    residentReadGrants,
    residentVoidMarks,
    residentSpaceWrites,
    residentSleeps,
    agentThreads,
    agentMessages,
    agentRuns,
    reviews,
    repositories,
    implementationMap,
    codeRevisions,
    fileObservations,
    revalidations: revalidationRows,
    annotationWordsFixed,
    measureWordsRenamed,
    attention,
    sessions,
    changes,
    revisions,
    changeAppendOrder,
    deleted,
    scopes,
  }
}

// ============================================================================ the comparison

export interface Difference {
  /** Which thing differs, named so a person can go and look at it. */
  where: string
  before: string
  after: string
}

/**
 * Something the ORIGIN had to contain before this comparison could mean anything.
 *
 * SEPARATE FROM `differences`, and that separation is the whole idea. "There is no soft-deleted
 * record to check" is a statement about the corpus, not about the restore, and folding the two
 * together is how a comparison over nothing comes to look like a comparison that passed.
 */
export interface Need {
  what: string
  met: boolean
  /** What was actually measured, so an unmet need says how far short it fell. */
  measured: string
}

export interface Comparison {
  name: ComparisonName
  /** What it asks, in one sentence, so the report is readable without this file. */
  question: string
  /** How many things it looked at. Zero is reported as vacuous and never as passed. */
  covers: number
  /** What the corpus had to hold. An unmet need makes the comparison vacuous, not passed. */
  needs: Need[]
  differences: Difference[]
  verdict: 'held' | 'differs' | 'vacuous'
}

/** Structural equality, ignoring object key order, with no normalisation of any value. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((v, i) => same(v, b[i]))
  }
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  const rb = b as Record<string, unknown>
  return ka.every((k) => k in rb && same((a as Record<string, unknown>)[k], rb[k]))
}

/**
 * How many levels deep a JSON value nests.
 *
 * Only used to say whether the corpus is deep enough to be worth checking. A module's curated chart
 * reaches eight — data → summaryBlocks → [0] → spec → series → [0] → points → [0] → x — and a
 * format that flattened it would still pass over a corpus of one-level objects.
 */
function depthOf(value: unknown, level = 1): number {
  if (typeof value !== 'object' || value === null) return level - 1
  const children = Array.isArray(value) ? value : Object.values(value)
  if (children.length === 0) return level
  return Math.max(...children.map((child) => depthOf(child, level + 1)))
}

/** A value as a short readable string for a difference line. Never truncated in the middle of an id. */
function show(value: unknown): string {
  const text = value === undefined ? '(absent)' : JSON.stringify(value)
  if (text === undefined) return '(not JSON)'
  return text.length > 220 ? `${text.slice(0, 217)}...` : text
}

/**
 * Compare two keyed collections, field by field, in both directions.
 *
 * `covers` is the number of rows on the BEFORE side, because that is what the restore was asked to
 * bring back. A row that only exists after the restore is a difference of its own.
 */
function compareKeyed<T extends object>(
  label: string,
  before: readonly T[],
  after: readonly T[],
  keyOf: (row: T) => string,
  out: Difference[],
): number {
  const mb = new Map(after.map((r) => [keyOf(r), r]))
  const seen = new Set<string>()
  for (const row of before) {
    const key = keyOf(row)
    seen.add(key)
    const other = mb.get(key)
    if (other === undefined) {
      out.push({ where: `${label} ${key}`, before: 'present', after: 'MISSING after the restore' })
      continue
    }
    // Read as bags of fields, so a field ADDED on the restored side is a difference too. A
    // comparison that only walked the fields it expected would not notice a new column.
    const a = row as Record<string, unknown>
    const b = other as Record<string, unknown>
    for (const field of Object.keys(a)) {
      if (!same(a[field], b[field])) {
        out.push({ where: `${label} ${key} · ${field}`, before: show(a[field]), after: show(b[field]) })
      }
    }
    for (const field of Object.keys(b)) {
      if (!(field in a)) out.push({ where: `${label} ${key} · ${field}`, before: '(absent)', after: show(b[field]) })
    }
  }
  for (const row of after) {
    const key = keyOf(row)
    if (!seen.has(key)) out.push({ where: `${label} ${key}`, before: 'not there', after: 'APPEARED after the restore' })
  }
  return before.length
}

/**
 * Compare two ordered lists of strings.
 *
 * A list that holds the same members in a different order is reported as ONE difference saying so,
 * rather than as one line per moved position. That is not a softening: it is a different fact, it
 * is the fact a declared loss can name, and ninety-seven position lines would bury the case where a
 * member really did change.
 */
function compareOrder(label: string, before: readonly string[], after: readonly string[], out: Difference[]): number {
  if (before.length === after.length && before.every((v, i) => v === after[i])) return before.length

  const sameMembers =
    before.length === after.length && [...before].sort().join('\u0000') === [...after].sort().join('\u0000')
  if (sameMembers) {
    out.push({
      where: `${label} · order only`,
      before: `${before.length} keys, in one order`,
      after: `the same ${after.length} keys, in another order`,
    })
    return before.length
  }

  if (before.length !== after.length) {
    out.push({ where: `${label} · length`, before: String(before.length), after: String(after.length) })
  }
  const n = Math.min(before.length, after.length)
  for (let i = 0; i < n; i += 1) {
    if (before[i] !== after[i]) {
      out.push({ where: `${label} · position ${i + 1}`, before: String(before[i]), after: String(after[i]) })
    }
  }
  return before.length
}

/**
 * Walk two values together and report one difference per JSON path that differs.
 *
 * WHY NOT JUST SAY "THE ROW DIFFERS". An attention row is forty fields deep and the difference that
 * matters is which one moved: a changed score is a broken restore, and a reordered list of names
 * inside one explanatory sentence is not. A comparison that could only say "row 7 differs" would
 * have to be accepted or rejected whole, and would therefore be accepted.
 */
function comparePaths(label: string, before: unknown, after: unknown, out: Difference[]): void {
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (same(a, b)) return
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        out.push({ where: `${label} · ${path}.length`, before: String(a.length), after: String(b.length) })
        return
      }
      for (let i = 0; i < a.length; i += 1) walk(a[i], b[i], `${path}[${i}]`)
      return
    }
    const isPlain = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v)
    if (isPlain(a) && isPlain(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk(a[key], b[key], path === '' ? key : `${path}.${key}`)
      }
      return
    }
    out.push({ where: `${label} · ${path}`, before: show(a), after: show(b) })
  }
  walk(before, after, '')
}

/** Every comparison, in the declared order, over two snapshots taken against the same clock. */
export function compareSnapshots(before: Snapshot, after: Snapshot): Comparison[] {
  if (before.now !== after.now) {
    throw new Error(
      `The two snapshots were taken against different clocks (${before.now} and ${after.now}). The attention ` +
        'rule scores how long a thing has sat, so comparing them would report the passage of time as a ' +
        'round-trip failure. Both snapshots must be given the same `now`.',
    )
  }

  const made: Comparison[] = []
  const add = (
    name: ComparisonName,
    question: string,
    covers: number,
    needs: Need[],
    differences: Difference[],
  ): void => {
    made.push(judged(name, question, covers, needs, differences))
  }

  /** Small helper so every corpus requirement reads the same way in the report. */
  function need(what: string, met: boolean, measured: string): Need {
    return { what, met, measured }
  }

  {
    const diffs: Difference[] = []
    const appearances = (snapshot: Snapshot) => snapshot.agents.map(agent => ({ id: agent.id, pixelAppearance: agent.pixelAppearance, pixelScale: agent.pixelScale }))
    const covers = compareKeyed('pixel appearance', appearances(before), appearances(after), row => row.id, diffs)
      + compareKeyed('office scene', before.officeSceneSettings, after.officeSceneSettings, row => String(row['only_row']), diffs)
      + compareKeyed('saved office map', before.officeMapLayouts, after.officeMapLayouts, row => String(row['configuration_key']), diffs)
      + compareKeyed('the model each run uses', before.runModels, after.runModels, row => String(row['only_row']), diffs)
      + compareKeyed('office runtime choices', before.runtimeSettings, after.runtimeSettings, row => row.name, diffs)
      + compareKeyed('office restart grants', before.officeRestartGrants, after.officeRestartGrants, row => row.agentId, diffs)
      + compareKeyed('hand-added preview roots', before.previewRootAdditions, after.previewRootAdditions, row => String(row['only_row']), diffs)
      + compareKeyed('price table', before.priceTable, after.priceTable, row => String(row['only_row']), diffs)
      + compareKeyed('the Casting table', before.casting, after.casting, row => `${String(row['role'])}/${String(row['project'])}`, diffs)
      + compareKeyed('the Casting table history', before.castingChanges, after.castingChanges, row => String(row['id']), diffs)
      + compareKeyed('the castings', before.castingRows, after.castingRows, row => String(row['id']), diffs)
      + compareKeyed('the castings history', before.castingRowChanges, after.castingRowChanges, row => String(row['id']), diffs)
      + compareKeyed('the Casting labels', before.castingLabels, after.castingLabels, row => String(row['id']), diffs)
      + compareKeyed('the Casting labels history', before.castingLabelChanges, after.castingLabelChanges, row => String(row['id']), diffs)
    add('pixel appearances and office scene', 'Do chosen appearances, the shared scene and saved map positions survive exactly?', covers,
      [need('a saved mole appearance', before.agents.some(agent => agent.pixelAppearance !== null), String(before.agents.filter(agent => agent.pixelAppearance !== null).length)), need('a saved scene', before.officeSceneSettings.length > 0, String(before.officeSceneSettings.length)), need('saved map positions', before.officeMapLayouts.length > 0, String(before.officeMapLayouts.length)), need('a model set on the Settings page', before.runModels.length > 0, String(before.runModels.length)), need('a directory added by hand as a preview root', before.previewRootAdditions.length > 0, String(before.previewRootAdditions.length)), need('a price table', before.priceTable.length > 0, String(before.priceTable.length)), need('a casting', before.castingRows.length > 0, String(before.castingRows.length))], diffs)
  }

  // ---- the project boundaries
  //
  // FIRST, because every comparison after it is about rows that name one of these. A restore that
  // brought back 394 records and lost the workspace they all name would pass every other check in
  // this file — the `workspaceId` on each record would compare equal to itself — and leave a
  // database in which no request can reach any of them, because every read is scoped to a project
  // that is not declared.
  //
  // `records` IS COMPARED TOO, and it is a count of what is behind the boundary rather than a
  // column of it: a workspace that came back with its title and its note and nothing filed behind
  // it is the shape of failure a row-by-row comparison of the table cannot see.
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('workspace', before.workspaces, after.workspaces, (w) => w.id, diffs)

    // WHAT EACH PROJECT HOLDS, ROW BY ROW, ON BOTH SIDES. The registry rows coming back is not the
    // same fact as the rows behind them coming back into the SAME project: a restore that put every
    // record into `default` would leave the two workspace rows identical and every record's own
    // `workspaceId` compared against itself, so the comparison of the `records` table would hold too.
    // This is the reading that would not.
    const holdings = (s: Snapshot): { workspaceId: string; records: number; links: number; changes: number }[] => {
      const at = new Map(s.workspaces.map((w) => [w.id, { workspaceId: w.id, records: 0, links: 0, changes: 0 }]))
      const bump = (id: string | null, field: 'records' | 'links' | 'changes'): void => {
        if (id === null) return
        const row = at.get(id)
        if (row === undefined) return
        row[field] += 1
      }
      for (const r of s.records) bump(r.workspaceId, 'records')
      for (const l of s.links) bump(l.workspaceId, 'links')
      for (const c of s.changes) bump(c.workspaceId, 'changes')
      return [...at.values()]
    }
    compareKeyed('what is filed in', holdings(before), holdings(after), (h) => h.workspaceId, diffs)

    // THE DEFECT ITSELF, MEASURED ON BOTH SIDES AND REQUIRED TO BE ZERO ON BOTH.
    //
    // A link whose two ends are in different projects is what `createLink` refuses to make and what
    // `checkWorkspaces` in the importer refuses to restore, so an archive holding one cannot be
    // restored at all — the run would fail at the import step rather than here. This is the reading
    // that says WHY, in this report, rather than leaving a reader with a failed command. It is not a
    // check on the restore so much as a check on the corpus, which is exactly why it belongs beside
    // the needs below: a proof whose fixture cannot produce the state is a proof that never asks.
    const crossings = (s: Snapshot): string[] => {
      const at = new Map(s.records.map((r) => [r.id, r.workspaceId]))
      return s.links
        .filter((l) => {
          const from = at.get(l.fromId)
          const to = at.get(l.toId)
          // A LINK WITH A MESSAGE AT ONE END CROSSES NO BOUNDARY: a message belongs to no project.
          return from !== undefined && to !== undefined && from !== to && from !== MESSAGE_CENTRE && to !== MESSAGE_CENTRE
        })
        .map((l) => `${l.id} (${at.get(l.fromId) ?? '?'} → ${at.get(l.toId) ?? '?'})`)
    }
    const crossBefore = crossings(before)
    const crossAfter = crossings(after)
    if (crossBefore.length > 0) {
      diffs.push({
        where: 'links crossing a project boundary, before the export',
        before: crossBefore.slice(0, 5).join(', '),
        after: 'this archive cannot be restored at all — the importer refuses each of these by name',
      })
    }
    if (crossAfter.length > 0) {
      diffs.push({
        where: 'links crossing a project boundary, after the restore',
        before: 'none',
        after: crossAfter.slice(0, 5).join(', '),
      })
    }

    // A RECORD THAT CHANGED PROJECT, read out of the change log rather than out of a column, because
    // the column only says where it is now. `POST /api/records/:id/workspace` writes one row per
    // record it moves, and that row plus the record's whole relocated history is what has to come
    // back: the moved record, the links that moved with it, its change rows in their new project,
    // and the row saying the move happened.
    const moved = (s: Snapshot): string[] => s.changes.filter((c) => c.field === 'workspaceId').map((c) => c.recordId)
    const movedBefore = [...new Set(moved(before))]
    const inPlace = new Map(before.records.map((r) => [r.id, r.workspaceId]))
    const movedRowsInRightProject = before.changes.filter(
      (c) => c.field === 'workspaceId' && c.workspaceId === inPlace.get(c.recordId),
    ).length

    add(
      'project boundaries',
      'do the projects this installation holds come back — id, title, the note saying why the boundary ' +
        'exists, the records, links and change rows filed behind each, and no link joining two of them?',
      covers,
      [
        // THE RULE THIS FILE STATES ABOUT ITSELF, APPLIED TO ITSELF. A comparison that looked at
        // nothing is vacuous; a comparison of PROJECT BOUNDARIES that looked at one project is
        // barely better, because there is no boundary in a database with one project and every
        // sentence below would be true of a corpus that has never had a second. That is not a
        // hypothetical: this proof ran green over a one-workspace seed for as long as it existed,
        // while the real database held four and an archive of it would not import.
        need(
          'more than one project exists, or there is no boundary here to prove anything about',
          covers > 1,
          `${covers} project${covers === 1 ? '' : 's'}: ${before.workspaces.map((w) => w.id).join(', ') || 'none'}`,
        ),
        need(
          'records are filed behind at least two of them',
          before.workspaces.filter((w) => w.records > 0).length > 1,
          `${before.workspaces.map((w) => `${w.id}: ${w.records}`).join(', ') || 'none'}`,
        ),
        need(
          'a link is stored in a project other than the default one',
          before.links.some((l) => l.workspaceId !== DEFAULT_WORKSPACE),
          `${before.links.filter((l) => l.workspaceId !== DEFAULT_WORKSPACE).length} of ${before.links.length} links`,
        ),
        need(
          'no link joins two projects, which is the state that makes an archive unrestorable',
          crossBefore.length === 0,
          `${crossBefore.length} crossing link${crossBefore.length === 1 ? '' : 's'}`,
        ),
        need(
          'a record has been moved between projects, so the trail a move leaves is what round-trips',
          movedBefore.length > 0,
          `${movedBefore.length} record(s) carry a workspaceId change row`,
        ),
        need(
          "each move's own change row is filed in the project the record ended up in",
          movedRowsInRightProject > 0 && movedRowsInRightProject === before.changes.filter((c) => c.field === 'workspaceId').length,
          `${movedRowsInRightProject} of ${before.changes.filter((c) => c.field === 'workspaceId').length} move rows`,
        ),
      ],
      diffs,
    )
  }

  // ---- records of every kind
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('record', before.records, after.records, (r) => r.id, diffs)
    const kinds = new Set([...Object.keys(before.recordsByKind), ...Object.keys(after.recordsByKind)])
    for (const kind of [...kinds].sort()) {
      const a = before.recordsByKind[kind] ?? 0
      const b = after.recordsByKind[kind] ?? 0
      if (a !== b) diffs.push({ where: `records of kind ${kind}`, before: String(a), after: String(b) })
    }
    const kindCount = Object.keys(before.recordsByKind).length
    add(
      'records of every kind',
      'is every record back, of every kind, with its envelope and its whole `data` as stored?',
      covers,
      [
        need('the corpus is dense enough to judge a design on', before.records.length >= 200, `${before.records.length} records`),
        need('more than one kind is stored', kindCount > 1, `${kindCount} kinds`),
        need(
          'at least one record carries `data` nested several levels deep',
          before.records.some((r) => depthOf(r.data) >= 6),
          `deepest data is ${Math.max(0, ...before.records.map((r) => depthOf(r.data)))} levels`,
        ),
      ],
      diffs,
    )
  }

  // ---- how each record got here
  //
  // THE QUESTION IS NOT "DOES THE COLUMN SURVIVE", it is "does each of the THREE ANSWERS survive as
  // itself". `authored`, `fixture` and nothing-recorded are three different statements, and the only
  // one that can do damage by drifting is the third: a restore that turned an unstamped row into
  // `authored` would turn the absence of a judgement into a judgement, in the direction that makes
  // fixture content read as part of the project record. So the corpus is REQUIRED to contain all
  // three, and this comparison is vacuous — not held — if it does not.
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('record origin', before.origins, after.origins, (r) => r.id, diffs)
    const count = (rows: readonly SnapOrigin[], word: string | null): number =>
      rows.filter((r) => r.origin === word).length
    for (const word of ['authored', 'fixture', null]) {
      const a = count(before.origins, word)
      const b = count(after.origins, word)
      if (a !== b) {
        diffs.push({
          where: `records whose origin is ${word === null ? 'not recorded' : word}`,
          before: String(a),
          after: String(b),
        })
      }
    }
    add(
      'how each record got here',
      'does every record still say whether it came through the generated fixture or was filed as real work — ' +
        'and does a record nobody has said anything about still say nothing, rather than coming back as authored?',
      covers,
      [
        need(
          'some record is marked `fixture`, so the seeded corpus is distinguishable at all',
          count(before.origins, 'fixture') > 0,
          `${count(before.origins, 'fixture')} fixture`,
        ),
        need(
          'some record is marked `authored`, so "a real record survives a restore" is tested rather than assumed',
          count(before.origins, 'authored') > 0,
          `${count(before.origins, 'authored')} authored`,
        ),
        need(
          'some record carries no origin at all, so "nobody said" cannot quietly become "authored"',
          count(before.origins, null) > 0,
          `${count(before.origins, null)} with nothing recorded`,
        ),
      ],
      diffs,
    )
  }

  // ---- links and backlinks
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('link', before.links, after.links, (l) => l.id, diffs)
    compareKeyed('links on record', before.backlinks, after.backlinks, (e) => e.recordId, diffs)
    const backlinkCount = before.backlinks.reduce((n, e) => n + e.links.filter((l) => l.isBacklink).length, 0)
    const brokenCount = before.backlinks.reduce((n, e) => n + e.links.filter((l) => l.broken).length, 0)
    add(
      'links and backlinks',
      'is every stored link back, and does every record read the same links in both directions, with the ' +
        'same label and the same broken flag?',
      covers + before.backlinks.length,
      [
        need('links are stored', covers > 0, `${covers} links`),
        need('some record reads a link from the end that does not store it', backlinkCount > 0, `${backlinkCount} backlinks`),
        need('some link points at a deleted record, so `broken` is exercised', brokenCount > 0, `${brokenCount} broken`),
      ],
      diffs,
    )
  }

  // ---- inferred versus confirmed
  {
    const diffs: Difference[] = []
    const inferredBefore = before.links.filter((l) => l.inferred)
    const inferredAfter = new Set(after.links.filter((l) => l.inferred).map((l) => l.id))
    const humanBefore = before.links.filter((l) => !l.inferred)
    const humanAfter = new Set(after.links.filter((l) => !l.inferred).map((l) => l.id))
    for (const l of inferredBefore) {
      if (!inferredAfter.has(l.id)) {
        diffs.push({
          where: `link ${l.id} · inferred`,
          before: 'true — Mole Office worked it out',
          after: 'false or missing — it now reads as a human assertion',
        })
      }
    }
    for (const l of humanBefore) {
      if (!humanAfter.has(l.id)) {
        diffs.push({
          where: `link ${l.id} · inferred`,
          before: 'false — somebody asserted it',
          after: 'true or missing — it now reads as a guess',
        })
      }
    }
    add(
      'inferred versus confirmed relationships',
      'does a link Mole Office worked out still say so, and does one a person asserted still say that?',
      before.links.length,
      [
        need('some link is inferred', inferredBefore.length > 0, `${inferredBefore.length} inferred`),
        need('some link is not', humanBefore.length > 0, `${humanBefore.length} asserted`),
      ],
      diffs,
    )
  }

  // ---- block-to-module mappings
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('pipeline', before.pipelines, after.pipelines, (p) => p.pipelineId, diffs)
    const blockCount = before.pipelines.reduce((n, p) => n + p.blocks.length, 0)
    const carried = before.pipelines.reduce((n, p) => n + p.blocks.reduce((m, b) => m + b.moduleIds.length, 0), 0)
    const uncarried = before.pipelines.reduce((n, p) => n + p.blocks.filter((b) => b.moduleIds.length === 0).length, 0)
    add(
      'block-to-module mappings',
      'does every pipeline hold the same blocks in the same order, and does each block still name the ' +
        'same modules — by link, which is what the mapping became?',
      covers,
      [
        need('pipelines hold blocks', blockCount > 0, `${blockCount} blocks over ${covers} pipelines`),
        need('some block is carried by a module', carried > 0, `${carried} block-to-module links`),
        need(
          'some block is carried by nobody, which is a real answer and must survive as one',
          uncarried > 0,
          `${uncarried} blocks carried by no module`,
        ),
      ],
      diffs,
    )
  }

  // ---- gates
  {
    const diffs: Difference[] = []
    const tally = (s: Snapshot): Record<string, number> => {
      const t: Record<string, number> = { hard: 0, partial: 0, unqualified: 0, withUpTo: 0 }
      for (const l of s.links) {
        if (l.type !== 'blocks') continue
        if (l.gate === 'hard') t.hard = (t.hard ?? 0) + 1
        else if (l.gate === 'partial') t.partial = (t.partial ?? 0) + 1
        else t.unqualified = (t.unqualified ?? 0) + 1
        if (l.gateUpTo !== null) t.withUpTo = (t.withUpTo ?? 0) + 1
      }
      return t
    }
    const ta = tally(before)
    const tb = tally(after)
    for (const key of Object.keys(ta)) {
      if (ta[key] !== tb[key]) {
        diffs.push({ where: `blocks links with gate ${key}`, before: String(ta[key]), after: String(tb[key]) })
      }
    }
    // Per link as well as by tally, because two links could swap gates and leave the tally right.
    const afterById = new Map(after.links.map((l) => [l.id, l]))
    let gated = 0
    for (const l of before.links) {
      if (l.gate === null && l.gateUpTo === null) continue
      gated += 1
      const other = afterById.get(l.id)
      if (other === undefined) continue
      if (l.gate !== other.gate) diffs.push({ where: `link ${l.id} · gate`, before: show(l.gate), after: show(other.gate) })
      if (l.gateUpTo !== other.gateUpTo) {
        diffs.push({ where: `link ${l.id} · gateUpTo`, before: show(l.gateUpTo), after: show(other.gateUpTo) })
      }
    }
    const blockNeeds = before.pipelines.reduce((n, p) => n + p.blocks.reduce((m, b) => m + b.needs.length, 0), 0)
    add(
      'gates, hard and partial',
      'do all three gate states come back apart — hard, partial with the stage it stops at, and NULL, ' +
        'which means nobody said and is not hard?',
      gated,
      [
        need('some gate is hard', (ta.hard ?? 0) > 0, `${String(ta.hard)} hard`),
        need('some gate is partial', (ta.partial ?? 0) > 0, `${String(ta.partial)} partial`),
        need('some gate says how far it stops', (ta.withUpTo ?? 0) > 0, `${String(ta.withUpTo)} carry an upTo`),
        need(
          'some `blocks` link has no gate at all, because NULL is a third state and is not `hard`',
          (ta.unqualified ?? 0) > 0,
          `${String(ta.unqualified)} unqualified`,
        ),
        need('blocks wait on other blocks through gated links', blockNeeds > 0, `${blockNeeds} block dependencies`),
      ],
      diffs,
    )
  }

  // ---- presentation intent
  {
    const diffs: Difference[] = []
    const covers = compareKeyed(
      'intent',
      before.intent,
      after.intent,
      (r) => `${r.workspaceId}/${r.scope}/${r.target}`,
      diffs,
    )
    compareKeyed('scope as the drawing reads it', before.scopes, after.scopes, (s) => s.scope, diffs)
    add(
      'presentation intent',
      'does every stored arrangement come back, with the intent read as a value rather than as text?',
      covers,
      [
        need('an arrangement is stored', covers > 0, `${covers} intent rows`),
        need('the drawing can read it back', before.scopes.length > 0, `${before.scopes.length} scopes`),
      ],
      diffs,
    )
  }

  // ---- attention, ONE PROJECT AT A TIME
  //
  // The reading is scoped and so is the comparison. `covers` is the total over every project, and
  // the `needs` are measured over every project too: they ask whether the CORPUS is rich enough to
  // judge this design on, and a second, small project would otherwise make a corpus that is plenty
  // rich look thin. Every difference carries the project in its label, so a row that moved is
  // findable without guessing which list it was on.
  {
    const diffs: Difference[] = []
    const allBeforeRows: unknown[] = []
    let selected = 0
    let passedOverBuckets = 0
    for (const beforeReading of before.attention) {
      const w = beforeReading.workspaceId
      const afterReading = after.attention.find((a) => a.workspaceId === w)
      if (afterReading === undefined) {
        diffs.push({ where: `attention in ${w}`, before: 'a reading', after: 'MISSING after the restore' })
        continue
      }
      compareOrder(`the visible attention list in ${w}`, beforeReading.visibleKeys, afterReading.visibleKeys, diffs)
      compareOrder(`the attention remainder in ${w}`, beforeReading.remainderKeys, afterReading.remainderKeys, diffs)

      // Per JSON path, not per row: a changed score and a reordered list of names inside one sentence
      // are different facts and a comparison that could only say "row 7 differs" would have to accept
      // or reject both together.
      const bRows = beforeReading.rows
      const aRows = afterReading.rows
      for (let i = 0; i < Math.max(bRows.length, aRows.length); i += 1) {
        const key = (bRows[i] as { key?: string } | undefined)?.key ?? '(no row)'
        comparePaths(`attention row ${i + 1} in ${w} (${key})`, bRows[i], aRows[i], diffs)
      }
      comparePaths(`attention counts in ${w}`, beforeReading.counts, afterReading.counts, diffs)
      comparePaths(`what the rule was given in ${w}`, beforeReading.read, afterReading.read, diffs)
      comparePaths(`the remainder by group in ${w}`, beforeReading.remainderByGroup, afterReading.remainderByGroup, diffs)
      for (const [label, a, b] of [
        ['unclassified', beforeReading.unclassifiedKeys, afterReading.unclassifiedKeys],
        ['no state', beforeReading.noStateKeys, afterReading.noStateKeys],
        ['paused', beforeReading.pausedKeys, afterReading.pausedKeys],
      ] as const) {
        compareOrder(`the ${label} list in ${w}`, a, b, diffs)
      }
      compareKeyed(
        `passed over in ${w}`,
        beforeReading.passedOver.map((g) => ({ ...g, keys: [...g.keys].sort() })),
        afterReading.passedOver.map((g) => ({ ...g, keys: [...g.keys].sort() })),
        (g) => g.bucket,
        diffs,
      )
      allBeforeRows.push(...bRows)
      selected += beforeReading.visibleKeys.length + beforeReading.remainderKeys.length
      passedOverBuckets += beforeReading.passedOver.length
    }
    for (const afterReading of after.attention) {
      if (!before.attention.some((b) => b.workspaceId === afterReading.workspaceId)) {
        diffs.push({
          where: `attention in ${afterReading.workspaceId}`,
          before: 'no such project',
          after: 'APPEARED after the restore',
        })
      }
    }
    const safetyRows = allBeforeRows.filter((r) => (r as { safety?: unknown }).safety === true).length
    const kindsOnList = new Set(allBeforeRows.map((r) => (r as { recordKind?: string }).recordKind ?? '?'))
    add(
      'attention-relevant semantics',
      'does "what needs me today" hold the same records, in the same order, with the same reason and the ' +
        'same score on every row — asked once per project, because the rule is scoped and answers about one?',
      selected,
      [
        need('the ranked list is long enough to have an order worth checking', selected >= 10, `${selected} selected`),
        need('more than one kind of record reaches it', kindsOnList.size > 1, `${kindsOnList.size} kinds on the list`),
        need('a safety row is on it, which is the one row the rule floors', safetyRows > 0, `${safetyRows} safety rows`),
        need(
          'something was passed over, so the rule really ranked rather than accepted everything',
          passedOverBuckets > 0,
          `${passedOverBuckets} passed-over buckets`,
        ),
        need(
          'the rule was asked in more than one project, because a scoped read tested in one is untested',
          before.attention.length > 1,
          `${before.attention.length} projects asked`,
        ),
      ],
      diffs,
    )
  }

  // ---- sessions, ONE PROJECT AT A TIME, for the reason attention is
  {
    const diffs: Difference[] = []
    let sessionRecords = 0
    let storedRefs = 0
    let ledgerOwners = 0
    for (const beforeReading of before.sessions) {
      const w = beforeReading.workspaceId
      const afterReading = after.sessions.find((a) => a.workspaceId === w)
      if (afterReading === undefined) {
        diffs.push({ where: `sessions in ${w}`, before: 'a reading', after: 'MISSING after the restore' })
        continue
      }
      compareKeyed(`session record in ${w}`, beforeReading.records, afterReading.records, (r) => r.id, diffs)
      compareKeyed(`changes under session in ${w}`, beforeReading.storedRefs, afterReading.storedRefs, (r) => r.stored, diffs)
      compareKeyed(
        `session resolved from changes in ${w}`,
        beforeReading.resolved,
        afterReading.resolved,
        (r) => r.stored,
        diffs,
      )
      compareKeyed(
        `session name bound to record in ${w}`,
        beforeReading.boundNames,
        afterReading.boundNames,
        (r) => r.recordId,
        diffs,
      )
      compareKeyed(
        `ledger rows under session in ${w}`,
        beforeReading.ledgerBySession,
        afterReading.ledgerBySession,
        (r) => r.sessionRecordId,
        diffs,
      )
      sessionRecords += beforeReading.records.length
      storedRefs += beforeReading.storedRefs.length
      ledgerOwners += beforeReading.ledgerBySession.length
    }
    add(
      'sessions where they belong',
      'is every session record back, does every change row still name the session that wrote it, and does ' +
        'every ledger row still hang off the session that started it — inside the project both are filed in?',
      sessionRecords + storedRefs,
      [
        need('session records exist', sessionRecords > 0, `${sessionRecords} sessions`),
        need(
          'change rows name the session that wrote them',
          storedRefs > 0,
          `${storedRefs} distinct session refs in the log`,
        ),
        need('a ledger row hangs off a session', ledgerOwners > 0, `${ledgerOwners} sessions own a resource`),
        need(
          'more than one project holds a session, because a session that moved projects is the case that broke',
          before.sessions.filter((s) => s.records.length > 0).length > 1,
          `${before.sessions.filter((s) => s.records.length > 0).length} projects hold a session`,
        ),
      ],
      diffs,
    )
  }

  // ---- Unicode
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('non-ASCII text', before.text, after.text, (t) => `${t.id}/${t.where}`, diffs)
    const han = before.text.filter((t) => /[一-鿿]/.test(t.text)).length
    // U+203A USED TO BE IN EVERY BLOCK TITLE, because the server composed one out of its pipeline's
    // title and the block's name. A decision ended that on 6 September 2026. The character now
    // appears only where somebody typed it — a block whose own NAME carries one, which `splitBlockTitle` has always
    // allowed and the fixture holds one of on purpose. The check is unchanged: this character has to come back code
    // point for code point.
    const separator = before.records.filter((r) => r.title.includes(BLOCK_TITLE_SEPARATOR)).length
    const newlines = before.records.filter((r) => JSON.stringify(r.data).includes('\\n')).length
    add(
      'Unicode and Chinese text',
      'does every non-ASCII title and summary come back code point for code point, including the U+203A a ' +
        'block title is qualified with?',
      covers,
      [
        need('Chinese text is stored', han > 0, `${han} Chinese titles or summaries`),
        need('a title carries a U+203A', separator > 0, `${separator} titles hold one`),
        need('something stores a newline inside a string', newlines > 0, `${newlines} records with an embedded newline`),
      ],
      diffs,
    )
  }

  // ---- soft-deleted
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('soft-deleted record', before.deleted, after.deleted, (r) => r.id, diffs)
    const withHistory = before.deleted.filter((r) => r.history.length > 0).length
    const withIncoming = before.deleted.filter((r) => r.incoming.length > 0).length
    add(
      'soft-deleted records with their recoverable history',
      'does every soft-deleted record come back with its deletion stamp, its data, the change rows that ' +
        'record the deletion, and the links into it still marked broken?',
      covers,
      [
        need('something has been soft-deleted', covers > 0, `${covers} soft-deleted records`),
        need('a deleted record has history, which is what recoverable means', withHistory > 0, `${withHistory} with change rows`),
        need('something still links into a deleted record', withIncoming > 0, `${withIncoming} with links into them`),
      ],
      diffs,
    )
  }

  // ---- the change log
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('change', before.changes, after.changes, (c) => c.id, diffs)
    const ops = new Set(before.changes.map((c) => c.op))
    const actors = new Set(before.changes.map((c) => `${c.actorType}:${c.actorId}`))
    const wholeBlob = before.changes.filter((c) => c.field === 'data' && (c.oldValue?.length ?? 0) > 200).length
    // CRITERION P83, POINT 5. The column can round-trip as null and every other assertion would still
    // hold, so the proof needs one row that carries a value rather than a comparison over nulls.
    const provedHolder = before.changes.filter((c) => c.provedHolder !== null).length
    // MIGRATION 0280. A press for the person is one row, and the change rows it wrote name it. Both halves are compared
    // here, because a restore that kept one and lost the other would leave a press with no writes or writes with no press.
    compareKeyed('press for the person', before.pressesForThePerson, after.pressesForThePerson, (row) => String(row['id']), diffs)
    const pressIds = new Set(before.pressesForThePerson.map((row) => String(row['id'])))
    const pressed = before.changes.filter((c) => c.pressId !== null && pressIds.has(c.pressId)).length
    add(
      'the change log itself',
      'is every change row back, with its actor, its session, its field path and both values, unsplit and ' +
        'unparsed, and every press for the person that wrote one?',
      covers,
      [
        need('the log holds more than one operation', ops.size > 1, `${[...ops].sort().join(', ')}`),
        need('more than one actor wrote it', actors.size > 1, `${actors.size} distinct actors`),
        need(
          'some row carries a whole previous `data` blob, which is the value most likely to be mangled',
          wholeBlob > 0,
          `${wholeBlob} rows hold a long previous data blob`,
        ),
        need(
          'some row carries who a key proved, where the key proved somebody the headers did not name',
          provedHolder > 0,
          `${provedHolder} rows carry a proved holder`,
        ),
        need(
          'some row was written by a press for the person, and that press is there',
          pressed > 0,
          `${pressed} rows name one of ${pressIds.size} presses`,
        ),
      ],
      diffs,
    )
  }

  // ---- the revision ledger
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('revision', before.revisions, after.revisions, (r) => r.id, diffs)
    // Immutable submission evidence and the explicit historical inventory must round-trip too.
    compareKeyed('submission baseline', before.submissionBaselines, after.submissionBaselines, (r) => r.runId, diffs)
    compareKeyed('legacy unsealed run', before.legacyUnsealedRuns, after.legacyUnsealedRuns, (r) => r.runId, diffs)
    const ops = new Set(before.revisions.map((r) => r.op))
    const records = new Set(before.revisions.map((r) => r.recordId))
    const withData = before.revisions.filter((r) => JSON.stringify(r.data ?? {}).length > 2).length
    // THE OTHER LEDGER'S HALF OF CRITERION P83 POINT 5, for the reason the change-log need above
    // gives: without a non-null value this comparison would hold over a column of nulls.
    const provedHolder = before.revisions.filter((r) => r.provedHolder !== null).length
    add(
      'the revision ledger',
      'does every revision come back with the CONTENT it kept — the kind, title, summary, `data` and ' +
        'soft-delete stamp the record held at that moment — and with its number, its content hash and who ' +
        'wrote it?',
      covers,
      [
        need('something has a revision at all', covers > 0, `${covers} revisions`),
        need('more than one record has one', records.size > 1, `${records.size} records with a ledger`),
        need(
          'a revision holds a real `data` document, which is the value most likely to come back mangled',
          withData > 0,
          `${withData} revisions carry a non-empty data`,
        ),
        need(
          'some revision carries who a key proved, where the key proved somebody the headers did not name',
          provedHolder > 0,
          `${provedHolder} revisions carry a proved holder`,
        ),
        // NAMED RATHER THAN REQUIRED. A database whose every revision is a baseline is the ordinary
        // state the day after the ledger is built, and demanding an `update` here would make this
        // check fail on a corpus that is perfectly fine. What is worth seeing is which words are in
        // there, because a restore that lost every `delete` row would still satisfy a count.
        need('the ledger says what kind of write each revision came from', ops.size > 0, `${[...ops].sort().join(', ')}`),
      ],
      diffs,
    )
  }

  // ---- reader anchors
  //
  // `panel_layouts` was compared here beside them until it was left out of every backup and export,
  // because nothing writes it any more. It is on NOT_IN_THIS_PROOF, and a restore through an archive brings
  // none of its rows back.
  {
    const diffs: Difference[] = []
    // COMPARED IN FULL, including `sinceAnchor` and `sinceIds`, which are read from rowid order.
    // Dropping them would hide the one consequence of the append-order loss that a person can feel,
    // so they are compared and the declared loss accounts for them by name.
    const covers = compareKeyed('anchor', before.anchors, after.anchors, (a) => a.reader, diffs)
    add(
      'reader anchors',
      'does the table nothing can recompute come back — where each reader had read to?',
      covers,
      [need('a reader has an anchor', covers > 0, `${covers} anchors`)],
      diffs,
    )
  }

  // ---- what each scan saw, which nothing can rebuild
  {
    const diffs: Difference[] = []
    const covers = compareKeyed(
      'file observation',
      before.fileObservations,
      after.fileObservations,
      (r) => r.id,
      diffs,
    )
    // AND THE HASH IS COMPARED AS A VALUE, not counted. The whole point of this table is that a
    // domain accepted three scans ago can ask what changed since; a restore that brought back the
    // rows with the hashes emptied would satisfy every count and answer that question wrongly for
    // ever, because nothing can recompute a hash of a file as it was.
    const emptied = after.fileObservations.filter((row) => row.change !== 'removed' && row.hash === null)
    for (const row of emptied) {
      diffs.push({
        where: `file observation ${row.id} · hash`,
        before: 'a content hash',
        after: 'nothing, so what changed since can no longer be told',
      })
    }
    const firstScans = before.fileObservations.filter((r) => r.firstScan === 1).length
    const withAHash = before.fileObservations.filter((r) => r.hash !== null).length
    add(
      'what each scan saw about each file',
      'does the one authored table nothing can rebuild come back whole — every path, every change, and every ' +
        'content hash, which is what makes "changed" exact rather than approximate?',
      covers,
      [
        need('the ledger holds observations at all', covers > 0, `${String(covers)} observations`),
        need(
          'at least one carries a content hash, which is the value a restore could quietly empty',
          withAHash > 0,
          `${String(withAHash)} with a hash`,
        ),
        need(
          'at least one is flagged as a first scan, which is the row a drift read must not call a change',
          firstScans > 0,
          `${String(firstScans)} from a first scan`,
        ),
      ],
      diffs,
    )
  }

  // ---- the implementation map, and what a guess became
  {
    const diffs: Difference[] = []
    const repoCovers = compareKeyed('repository', before.repositories, after.repositories, (r) => r.id, diffs)
    const revisionCovers = compareKeyed('code revision', before.codeRevisions, after.codeRevisions, (r) => r.id, diffs)
    const mapCovers = compareKeyed(
      'implementation row',
      before.implementationMap,
      after.implementationMap,
      (r) => r.id,
      diffs,
    )
    // AND THE REFERENCES ARE FOLLOWED, not only compared as strings. A restore that put every row
    // back with a repository_id naming a repository that did not come back would satisfy every
    // equality above and leave a statement about code pointing at nothing.
    const repoIds = new Set(after.repositories.map((r) => r.id))
    const revisionIds = new Set(after.codeRevisions.map((r) => r.id))
    for (const row of after.implementationMap) {
      if (!repoIds.has(row.repositoryId)) {
        diffs.push({
          where: `implementation row ${row.id} · repository_id`,
          before: 'names a repository that is in the archive',
          after: `names ${row.repositoryId}, which did not come back`,
        })
      }
      if (row.revisionId !== null && !revisionIds.has(row.revisionId)) {
        diffs.push({
          where: `implementation row ${row.id} · revision_id`,
          before: 'names a code revision that is in the archive',
          after: `names ${row.revisionId}, which did not come back`,
        })
      }
    }
    const accepted = before.implementationMap.filter((r) => r.acceptedBy !== null).length
    const guessed = before.implementationMap.filter((r) => r.provenance === 'llm' && r.acceptedBy === null).length
    const withRevision = before.implementationMap.filter((r) => r.revisionId !== null).length
    const rootless = before.repositories.filter((r) => r.root === null).length
    add(
      'the implementation map, and what a guess became',
      'do the repositories, the relationships somebody stated and the code revisions come back together — ' +
        'with every reference between them still naming a row that is there, and with the acceptance that ' +
        'turned a guess into ownership still on the row that carries it?',
      repoCovers + revisionCovers + mapCovers,
      [
        need('a repository exists at all', repoCovers > 0, `${repoCovers} repositories`),
        need(
          'one of them has NO checkout on this machine, which is a real state an archive has to carry',
          rootless > 0,
          `${rootless} repositories with no root`,
        ),
        need('somebody has stated a relationship', mapCovers > 0, `${mapCovers} relationships`),
        need(
          'a guess has been accepted, or the acceptance columns prove nothing',
          accepted > 0,
          `${accepted} accepted rows`,
        ),
        need(
          'a guess is still waiting, so the difference between the two is visible',
          guessed > 0,
          `${guessed} un-accepted guesses`,
        ),
        need('a code revision is referenced by a relationship', withRevision > 0, `${withRevision} rows name one`),
      ],
      diffs,
    )
  }

  // ---- the markers on comments whose words had gone out before anything recorded where
  {
    const diffs: Difference[] = []
    const covers = compareKeyed(
      'words-fixed marker',
      before.annotationWordsFixed,
      after.annotationWordsFixed,
      (r) => r.annotationId,
      diffs,
    )
    // AND EVERY MARKER STILL NAMES A COMMENT THAT CAME BACK. A marker whose comment did not is a
    // sentence about a record that is not there, and it is the only place that fact is written down.
    const records = new Set(after.records.map((r) => r.id))
    for (const row of after.annotationWordsFixed) {
      if (!records.has(row.annotationId)) {
        diffs.push({
          where: `words-fixed marker ${row.annotationId}`,
          before: 'names a comment that is in the archive',
          after: `names ${row.annotationId}, which did not come back`,
        })
      }
    }
    add(
      'the markers on comments whose words had already gone out',
      'does the one-way marker window B writes — for a comment whose own field said its words had gone and ' +
        'which no message accounts for — come back with its moment and its sentence, still naming a comment ' +
        'that is here?',
      covers,
      [
        need('a marker exists at all, or this section proves nothing', covers > 0, `${covers} markers`),
        need(
          'every one of them names a comment that came back',
          after.annotationWordsFixed.every((r) => records.has(r.annotationId)),
          'each marker names a record in the archive',
        ),
      ],
      diffs,
    )
  }

  // ---- whether the stored reading-measure words carry their new names
  {
    const diffs: Difference[] = []
    const covers = compareKeyed(
      'measure-words marker',
      before.measureWordsRenamed,
      after.measureWordsRenamed,
      (r) => String(r['only_row']),
      diffs,
    )
    add(
      'the marker saying the reading-measure words were renamed',
      'does the one row that stops the measure-word step renaming the words a second time come back with its ' +
        'moment and its sentence?',
      covers,
      [need('the marker row exists, or this section proves nothing', covers > 0, `${covers} rows`)],
      diffs,
    )
  }

  // ---- which work a restriction reached, and who re-checked it
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('revalidation row', before.revalidations, after.revalidations, (r) => r.id, diffs)
    // AND BOTH ENDS ARE FOLLOWED. A row whose restriction or whose record did not come back is a
    // mark on work nobody can explain: the page that draws it reads both titles off those records.
    const records = new Set(after.records.map((r) => r.id))
    for (const row of after.revalidations) {
      if (!records.has(row.restrictionId)) {
        diffs.push({
          where: `revalidation row ${row.id} · restriction_id`,
          before: 'names a restriction that is in the archive',
          after: `names ${row.restrictionId}, which did not come back`,
        })
      }
      if (!records.has(row.recordId)) {
        diffs.push({
          where: `revalidation row ${row.id} · record_id`,
          before: 'names a record that is in the archive',
          after: `names ${row.recordId}, which did not come back`,
        })
      }
    }
    const judged = before.revalidations.filter((r) => r.decidedBy !== null).length
    const waiting = before.revalidations.filter((r) => r.decidedBy === null).length
    const fromAJudgement = before.revalidations.filter((r) => r.writtenBy === 'judgement').length
    const withAPath = before.revalidations.filter((r) => r.reachedBy !== '[]').length
    add(
      'which work a restriction reached, and who re-checked it',
      'do the rows a resolution wrote come back with the path they were written against, and with each ' +
        "person's judgement still on them — or does a restore quietly hand back work that says nobody has " +
        'looked at it?',
      covers,
      [
        need('a restriction reached something at all', covers > 0, `${String(covers)} rows`),
        need(
          'at least one has been judged, so `state`, `decided_by` and the note are not all absent',
          judged > 0,
          `${String(judged)} judged`,
        ),
        need(
          'at least one is still waiting, so the difference between judged and not is visible',
          waiting > 0,
          `${String(waiting)} still waiting`,
        ),
        need(
          'at least one was written by a judgement rather than by the resolution, or `written_by` has one value',
          fromAJudgement > 0,
          `${String(fromAJudgement)} written by a judgement`,
        ),
        need(
          'at least one carries a path, which is the value nothing can recompute',
          withAPath > 0,
          `${String(withAPath)} carry a path`,
        ),
      ],
      diffs,
    )
  }

  // ---- machine state, asserted absent
  {
    const diffs: Difference[] = []
    const authored = (r: SnapLedger): Record<string, unknown> => {
      // `pgid` and `osStartedAt` are taken out of the equality check HERE and asserted BELOW. They
      // are named in this line, rather than left out of the snapshot, so that a reader can see that
      // nothing was skipped — which is the whole difference between this and a check that passes.
      const { pgid, osStartedAt, ...rest } = r
      void pgid
      void osStartedAt
      return rest
    }
    const covers = compareKeyed('ledger row', before.ledger.map(authored), after.ledger.map(authored), (r) => String(r.id), diffs)

    for (const row of after.ledger) {
      if (row.pgid !== null) {
        diffs.push({ where: `ledger row ${row.id} · pgid`, before: 'must be NULL after a restore', after: show(row.pgid) })
      }
      if (row.osStartedAt !== null) {
        diffs.push({
          where: `ledger row ${row.id} · os_started_at`,
          before: 'must be NULL after a restore',
          after: show(row.osStartedAt),
        })
      }
    }
    const withMachineFacts = before.ledger.filter((r) => r.pgid !== null || r.osStartedAt !== null).length
    const released = before.ledger.filter((r) => r.releasedAt !== null).length
    add(
      'machine state, asserted absent',
      'do the authored ledger columns come back equal, AND are pgid and os_started_at NULL on every ' +
        'restored row — asserted, never skipped?',
      covers,
      [
        need('the ledger holds rows', covers > 0, `${covers} ledger rows`),
        need(
          'a row really carried a process group and a start time, or asserting their absence proves nothing',
          withMachineFacts > 0,
          `${withMachineFacts} rows carried machine facts before the export`,
        ),
        need('a row records a release, which is what the table is read for', released > 0, `${released} released rows`),
      ],
      diffs,
    )
  }

  // ---- key hashes, asserted absent
  //
  // A COPY, A BACKUP AND AN EXPORT CARRY NO KEY. `held_keys` holds the SHA-256 of every key the
  // office ever issued — agents' keys and the person's own devices' keys, live and revoked — and
  // none of them leaves, because a decision says so. An import carries no such
  // table, because it is not authored and not exported. Restoring a RAW BACKUP by file copy is the
  // other path, and it brings the whole file back; this is the comparison that notices.
  //
  // IT IS A COMPARISON AND NOT A DECLARED LOSS because bringing these rows back is not a known
  // limitation of the format, it is a failure: a restored database would prove a device the person
  // paired — or already ended — by a copied hash, with no way to take it back.
  {
    const diffs: Difference[] = []
    const tables = new Set([...Object.keys(before.notCarried), ...Object.keys(after.notCarried)])
    let covers = 0
    for (const table of tables) {
      const had = before.notCarried[table] ?? 0
      const brought = after.notCarried[table] ?? 0
      covers += had
      if (brought > 0) {
        diffs.push({
          where: `${table} after the restore`,
          before: 'no key hashes: a copy, a backup and an export carry no key',
          after: `${brought} key hash${brought === 1 ? '' : 'es'} came back`,
        })
      }
    }
    add(
      'key hashes, asserted absent',
      'does the office’s key store come back EMPTY, so a restored database proves nobody by a copied key?',
      covers,
      [
        need(
          'the corpus really held a key hash, or asserting its absence proves nothing',
          covers > 0,
          `${covers} key hash${covers === 1 ? '' : 'es'} before the export`,
        ),
      ],
      diffs,
    )
  }

  // ---- visitor credentials: keep the history, but no token hash
  {
    const diffs: Difference[] = []
    const expected = before.visitorCredentials.map((row) => ({ ...row, tokenHash: REMOVED_MARK + row.id }))
    const covers = compareKeyed('visitor credential', expected, after.visitorCredentials, (row) => row.id, diffs)
    add(
      'visitor credentials without token hashes',
      'does every visitor credential come back with its token hash replaced by the removal mark and its id, ' +
        'and every other field unchanged?',
      covers,
      [need('the corpus holds visitor credentials', before.visitorCredentials.length > 0, `${before.visitorCredentials.length} credentials`)],
      diffs,
    )
  }

  // ---- the plan
  {
    // THE ONE COMPARISON IN THIS FILE THAT IS NOT SCOPED BY PROJECT, because none of the planning
    // tables it reads has a project. A plan is a person-level overlay across workspace-owned work, so an
    // allocation is keyed by its own id and a capacity by the period it is about.
    //
    // The hours are what this is really watching. `plannedHours` may be null — nobody said how long
    // — and null is a different fact from zero, so a restore that turned one into the other would
    // change what every total means while every row count still matched.
    const diffs: Difference[] = []
    const covers = compareKeyed('allocation', before.allocations, after.allocations, (a) => a.id, diffs)
    const recurCovers = compareKeyed('recurrence', before.recurrences, after.recurrences, (r) => r.id, diffs)
    const capacityCovers = compareKeyed(
      'capacity',
      before.capacities,
      after.capacities,
      (c) => `${c.horizon}\u0000${c.period}`,
      diffs,
    )
    const unstated = before.allocations.filter((a) => a.plannedHours === null).length
    const stated = before.allocations.filter((a) => a.plannedHours !== null).length
    const horizons = new Set(before.allocations.map((a) => a.horizon)).size
    const crossProject = new Set(
      before.allocations
        .map((a) => before.records.find((r) => r.id === a.recordId)?.workspaceId)
        .filter((w): w is string => w !== undefined),
    ).size
    add(
      'the plan',
      'do the hours somebody committed come back — every allocation, every capacity, and an unstated ' +
        'number still unstated rather than zero?',
      covers + capacityCovers + recurCovers,
      [
        need('there are allocations to compare', covers > 0, `${covers} allocations`),
        need('something recurs, so the rule round-trips', recurCovers > 0, `${recurCovers} recurrences`),
        need('a period has a capacity', capacityCovers > 0, `${capacityCovers} capacity rows`),
        need(
          'an allocation states its hours, or comparing the number proves nothing',
          stated > 0,
          `${stated} state their hours`,
        ),
        need(
          'an allocation leaves its hours unstated, which is the value a restore is most likely to flatten',
          unstated > 0,
          `${unstated} leave them unstated`,
        ),
        need('more than one horizon is planned', horizons > 1, `${horizons} horizons`),
        need(
          'the plan spans more than one project, or it is not testing the thing that makes it person-level',
          crossProject > 1,
          `work in ${crossProject} projects`,
        ),
      ],
      diffs,
    )
  }

  // ---- the plans
  {
    // WHAT THIS IS WATCHING IS THE WORDS. A plan line is free text somebody typed, stored one row
    // per line, so a format that re-wrapped a line, trimmed a trailing space or dropped a blank one
    // would change what a person wrote while every row count still matched.
    //
    // The other half is the binding. `recordId` on a line is the record it was filed as, and
    // `fromPlanLine` on an allocation is the line that gave those hours. Either one lost turns
    // planned work into work that came from nowhere, and nothing else in this file would notice.
    const diffs: Difference[] = []
    const planCovers = compareKeyed('plan', before.plans, after.plans, (p) => p.id, diffs)
    const lineCovers = compareKeyed('plan line', before.planLines, after.planLines, (l) => l.id, diffs)
    const filed = before.planLines.filter((l) => l.recordId !== null).length
    const unfiled = before.planLines.filter((l) => l.recordId === null).length
    const blank = before.planLines.filter((l) => l.text.trim() === '').length
    const fromPlan = before.allocations.filter((a) => a.fromPlanLine !== null).length
    // A PLAN THAT WAS A ROUGH DRAFT. Its `movedFromDraft` is the one record of which plan an old draft id became,
    // and its lines are the draft's body, blank lines, Chinese and the empty last line included — the free text a
    // format is most likely to re-wrap or trim on the way through, which is what the draft comparison watched.
    const wasADraft = before.plans.filter((p) => p.movedFromDraft !== null).length
    add(
      'plans and their lines',
      'does the writing come back exactly as it was typed — every line, blank ones included — with each ' +
        'line still naming the record it was filed as?',
      planCovers + lineCovers,
      [
        need('there is a plan to compare', planCovers > 0, `${planCovers} plans`),
        need('it has lines, or the words are not being compared at all', lineCovers > 0, `${lineCovers} lines`),
        need('a line was filed as work, so the binding is compared', filed > 0, `${filed} filed`),
        need('a line was never filed, which is the ordinary case', unfiled > 0, `${unfiled} not filed`),
        need(
          'a blank line is in the plan, which is the line a line-oriented format drops',
          blank > 0,
          `${blank} blank`,
        ),
        need(
          'some hours record the plan line they came from',
          fromPlan > 0,
          `${fromPlan} allocations name a line`,
        ),
        need('a plan was a rough draft, so the mapping is compared', wasADraft > 0, `${wasADraft} moved from a draft`),
      ],
      diffs,
    )
  }

  // ---- what somebody wrote about time
  {
    // WHAT THIS IS WATCHING IS THE READING, NOT THE HOURS. `said` is what a person typed and is
    // compared character for character. Beside it, `period`, `horizon` and `hours` are what Mole Office
    // made of those words, and they are null whenever nothing could be made of them honestly.
    //
    // NULL IS THE VALUE MOST AT RISK. A restore that filled in a period would turn "sometime next
    // week" into a week somebody never named, and `state` would still say `kept` while the row now
    // carried a date nobody chose. A restore that changed `state` is worse: only `committed` is in
    // any total, so flipping one moves every week's arithmetic without changing a single count.
    const diffs: Difference[] = []
    const covers = compareKeyed('intent', before.planningIntents, after.planningIntents, (i) => i.id, diffs)
    const kept = before.planningIntents.filter((i) => i.state === 'kept').length
    const offered = before.planningIntents.filter((i) => i.state === 'offered').length
    const committed = before.planningIntents.filter((i) => i.state === 'committed').length
    const noPeriod = before.planningIntents.filter((i) => i.period === null).length
    const onALine = before.planningIntents.filter((i) => i.planLineId !== null && i.recordId === null).length
    add(
      'what somebody wrote about time',
      'do the words come back exactly as they were typed, with the reading Mole Office made of them — ' +
        'including where the reading was nothing, and including which ones are already scheduled?',
      covers,
      [
        need('there are intents to compare', covers > 0, `${covers} intents`),
        need(
          'one was kept as words with no period read, which is the value a restore is most likely to invent',
          kept > 0,
          `${kept} kept`,
        ),
        need('one carries a reading waiting for a person', offered > 0, `${offered} offered`),
        need(
          'one is already committed, or the state that enters arithmetic is never compared',
          committed > 0,
          `${committed} committed`,
        ),
        need('a period is null somewhere, so null is really being compared', noPeriod > 0, `${noPeriod} with no period`),
        need(
          'one was written on a plan line that is not filed as work, which is why it may name no record',
          onALine > 0,
          `${onALine} on a line and about no record`,
        ),
      ],
      diffs,
    )
  }

  // ---- when somebody means to work
  {
    // WHAT THIS IS WATCHING IS TWO DATES AND A STATE, AND THERE IS NOTHING ELSE IN THE ROW TO HIDE
    // BEHIND. A window carries no hours, so a restore that moved `startsOn` or `endsOn` by one day
    // would move somebody's week and every total in the product would still agree with itself.
    //
    // A ONE-DAY WINDOW AND A SPAN ARE BOTH NEEDED. Both days are INCLUDED, so a format that read
    // `endsOn` as exclusive would come back right for neither — but a corpus holding only one of the
    // two shapes could still pass while the other was broken.
    //
    // `state` MATTERS FOR THE SAME REASON IT DOES ON AN ALLOCATION. `dropped` is a span that did not
    // happen and `planned` is one still ahead; flipping either rewrites what a person did with a
    // week, and nothing counts windows.
    const diffs: Difference[] = []
    const covers = compareKeyed('window', before.workWindows, after.workWindows, (w) => w.id, diffs)
    const spans = before.workWindows.filter((w) => w.startsOn !== w.endsOn).length
    const oneDay = before.workWindows.filter((w) => w.startsOn === w.endsOn).length
    const withNote = before.workWindows.filter((w) => w.note !== null).length
    const noNote = before.workWindows.filter((w) => w.note === null).length
    const notPlanned = before.workWindows.filter((w) => w.state !== 'planned').length
    add(
      'when somebody means to work',
      'do the spans come back on the same days, both ends included, with the note and the state they ' +
        'were placed with?',
      covers,
      [
        need('there are windows to compare', covers > 0, `${covers} windows`),
        need(
          'one runs across several days, or a span is never compared at all',
          spans > 0,
          `${spans} across more than one day`,
        ),
        need(
          'one is a single day, which is the shape an exclusive end date comes back wrong for',
          oneDay > 0,
          `${oneDay} on one day`,
        ),
        need('one carries a note, so the words in it are really compared', withNote > 0, `${withNote} with a note`),
        need('one carries none, so null is compared as null', noNote > 0, `${noNote} with no note`),
        need(
          'one is done or dropped, or the state that says what happened is never compared',
          notPlanned > 0,
          `${notPlanned} done or dropped`,
        ),
      ],
      diffs,
    )
  }

  // ---- a review, and who each comment went to
  {
    // WHAT THIS IS WATCHING IS THE ADDRESSING, NOT THE WORDS. The words are compared too, and they
    // are the easy half: a comment is one string and a row count would notice it missing. What no
    // count would notice is a review that came back addressed differently.
    //
    // A REVIEW IS ONE HUMAN ACT THAT GOES TO SEVERAL AGENTS. Every comment carries its own
    // recipient, and dispatch writes one run per recipient. So the facts at risk are: which comment
    // was for which agent (`recipientKind` and `recipientSessionId`), how Mole Office arrived at that
    // (`recipientWhy`), what the person actually typed (`recipientSaid`), and which run carried
    // which comments (`request`). Lose any one and the review still has every comment in it and
    // means something else.
    //
    // `context` IS THE OTHER HALF, AND THE QUOTE IS WHY. A comment about a span of text stores the
    // words it quoted, so it still says what it was about after the text underneath it is rewritten.
    // A restore that dropped the quote would leave a comment pointing at an offset in a document
    // that has moved on, which is exactly the pretending this product refuses to do.
    //
    // `request` IS WRITTEN ONCE AND NEVER REWRITTEN. It is the only record of what a worker was
    // asked, and an answer read against a question nobody has is not evidence of anything.
    const diffs: Difference[] = []
    const threadCovers = compareKeyed('conversation', before.agentThreads, after.agentThreads, (t) => t.id, diffs)
    const messageCovers = compareKeyed('comment', before.agentMessages, after.agentMessages, (m) => m.id, diffs)
    const runCovers = compareKeyed('run', before.agentRuns, after.agentRuns, (r) => r.id, diffs)

    // WHICH PROJECT EACH COMMENT AND EACH RUN IS IN, WORKED OUT THE WAY A SCOPED ARCHIVE WORKS IT
    // OUT: through the conversation. Comparing the rows alone would hold if every comment came back
    // under a conversation in a different project — the comment's own columns carry no workspace, so
    // there is nothing on the row for that to change.
    const throughTheThread = (s: Snapshot): { key: string; workspaceId: string }[] => {
      const at = new Map(s.agentThreads.map((t) => [t.id, t.workspaceId]))
      return [
        ...s.agentMessages.map((m) => ({ key: `comment ${m.id}`, workspaceId: at.get(m.threadId) ?? '(no conversation has that id)' })),
        ...s.agentRuns.map((r) => ({ key: `run ${r.id}`, workspaceId: at.get(r.threadId) ?? '(no conversation has that id)' })),
      ]
    }
    compareKeyed('the project of', throughTheThread(before), throughTheThread(after), (r) => r.key, diffs)

    const reviews = before.agentThreads.filter((t) => t.mode === 'review').length
    const perThread = new Map<string, number>()
    for (const m of before.agentMessages) perThread.set(m.threadId, (perThread.get(m.threadId) ?? 0) + 1)
    const biggest = Math.max(0, ...perThread.values())
    const contexts = new Set(
      before.agentMessages
        .map((m) => {
          if (m.context === null) return null
          try {
            // WHAT KIND OF THING IT POINTS AT NOW LIVES ON `target`. Round seven put the kind at the
            // top of the stored context and wrapped a quoted span around it; round eight separated
            // the three facts — the target, the words, the revision — so the kind is one level in.
            return (JSON.parse(m.context) as { target?: { kind?: unknown } }).target?.kind
          } catch {
            return 'unreadable'
          }
        })
        .filter((kind): kind is string => typeof kind === 'string'),
    )
    const quoted = before.agentMessages.filter((m) => m.context !== null && m.context.includes('"quote"')).length
    const toASession = before.agentMessages.filter((m) => m.recipientKind === 'session').length
    const toANewAgent = before.agentMessages.filter((m) => m.recipientKind === 'new').length
    const withAReason = before.agentMessages.filter((m) => m.recipientWhy !== null).length
    const recipients = new Set(
      before.agentMessages
        .filter((m) => m.recipientKind !== null)
        .map((m) => `${m.recipientKind ?? ''}:${m.recipientSessionId ?? ''}`),
    ).size
    const answered = before.agentRuns.filter((r) => r.result !== null).length
    const waiting = before.agentRuns.filter((r) => r.claimedBy === null).length
    const resumable = before.agentRuns.filter((r) => r.resumeExternalId !== null).length
    add(
      'a review, and who each comment went to',
      'does the review come back as the same act — every comment with what it pointed at, the words it ' +
        'quoted, and the agent it was addressed to — with each run still holding the question it was given?',
      threadCovers + messageCovers + runCovers,
      [
        need('there is a conversation to compare', threadCovers > 0, `${threadCovers} conversations`),
        need('one of them is a review, which is the act this is about', reviews > 0, `${reviews} in review mode`),
        need(
          'a review holds more than one comment, or it is a message and not a review',
          biggest > 1,
          `the largest holds ${biggest}`,
        ),
        need(
          'the comments point at more than one kind of thing, so `context` is really being compared',
          contexts.size > 1,
          `${contexts.size} kinds: ${[...contexts].sort().join(', ') || 'none'}`,
        ),
        need('one quotes a span of text, so the stored words are compared', quoted > 0, `${quoted} carry a quote`),
        need('one is addressed to a run Mole Office can pick up again', toASession > 0, `${toASession} to a session`),
        need(
          'one is addressed to a new agent on purpose, which is a different answer from "a session"',
          toANewAgent > 0,
          `${toANewAgent} to a new agent`,
        ),
        need(
          'one review went to MORE THAN ONE recipient, or "which comment went to whom" has one answer and ' +
            'losing it changes nothing',
          recipients > 1,
          `${recipients} distinct recipients`,
        ),
        need(
          'a recipient carries the sentence saying how it was arrived at',
          withAReason > 0,
          `${withAReason} carry a reason`,
        ),
        need('a run was written, and it carries what the worker was asked', runCovers > 0, `${runCovers} runs`),
        need('one run has an answer on it', answered > 0, `${answered} answered`),
        need(
          'one run is still waiting, so the nulls a restore is most likely to fill in are compared',
          waiting > 0,
          `${waiting} nobody has picked up`,
        ),
        need(
          'one run carries the id a worker needs to pick that agent up again',
          resumable > 0,
          `${resumable} can be resumed`,
        ),
      ],
      diffs,
    )
  }

  // ---- a review: where it was started from, and what was in it when collecting finished
  {
    // WHAT THIS IS WATCHING IS THE BOUNDARY, and it is the one fact in the table that cannot be
    // recreated. `entry` is where somebody was standing; everything a review collects is worked out
    // from it on every read, so a restore that changed it would change what the review is about
    // with the row still present and the count still matching. `frozen` is what was inside at the
    // moment collecting finished, and after that moment nothing else in the database can say it: the
    // relationships it was worked out from go on changing.
    //
    // NULL AGAINST AN EMPTY LIST IS THE TRAP. `frozen: null` means nobody has finished collecting;
    // `frozen: []` means somebody finished and it held nothing. A format that wrote one for the
    // other would turn an afternoon somebody is still in the middle of into an afternoon that
    // produced nothing, and every count would agree.
    const diffs: Difference[] = []
    const covers = compareKeyed('review', before.reviews, after.reviews, (r) => r.id, diffs)
    const frozen = before.reviews.filter((r) => r.frozen !== null).length
    const collecting = before.reviews.filter((r) => r.frozen === null).length
    const members = before.reviews
      .filter((r) => r.frozen !== null)
      .reduce((most, r) => Math.max(most, (r.frozen ?? '').split('"id"').length - 1), 0)
    const entries = new Set(
      before.reviews.map((r) => {
        try {
          return String((JSON.parse(r.entry) as { target?: { kind?: unknown } }).target?.kind ?? 'none')
        } catch {
          return 'unreadable'
        }
      }),
    )
    add(
      'a review, and what was in it when collecting finished',
      'does each review come back started from the same place, with the membership it had written down still ' +
        'written down — and with nothing that was still collecting looking as though it had finished?',
      covers,
      [
        need('there are reviews to compare', covers > 0, `${covers} reviews`),
        need(
          'one has finished collecting, or the written-down membership is never compared',
          frozen > 0,
          `${frozen} have finished collecting`,
        ),
        need(
          'one is still collecting, which is the null a careless restore fills in',
          collecting > 0,
          `${collecting} still collecting`,
        ),
        need('a frozen membership holds at least one remark', members > 0, `the largest holds ${members}`),
        need(
          'the reviews were started from more than one kind of thing, so `entry` is really being compared',
          entries.size > 1,
          `${entries.size} kinds: ${[...entries].sort().join(', ') || 'none'}`,
        ),
      ],
      diffs,
    )
  }

  // ---- the counters, and what they counted
  {
    // WHAT THIS IS WATCHING IS THE COUNT, WHICH IS NOT STORED. A counter's count and amount are
    // added up from its rows since its last firing, so losing a row does not make a counter look
    // broken — it makes it look as though less had happened. Every count a page draws would still be
    // a number, and it would be the wrong one.
    //
    // THE THREE ROW KINDS ARE THREE DIFFERENT STATEMENTS and the corpus holds all three, so a
    // restore that flattened one into another is a difference rather than a pass: an addition is
    // somebody counting something, a firing is the office having acted, and a held-back row is the
    // office having DECIDED NOT TO act because of the limit. `answer` on a firing is the only copy
    // of what the action did — which message went out, which task was filed, what the job said.
    const diffs: Difference[] = []
    const covers = compareKeyed('counter row', before.counterRows, after.counterRows, (r) => r.id, diffs)
    const additions = before.counterRows.filter((r) => r.what === 'addition').length
    const firings = before.counterRows.filter((r) => r.what === 'firing').length
    const heldBack = before.counterRows.filter((r) => r.what === 'held back').length
    const answered = before.counterRows.filter((r) => r.answer !== null).length
    const withAnAmount = before.counterRows.filter((r) => r.amount !== null).length
    add(
      'counters, and what they counted',
      'does every addition, firing and held-back firing come back — with the reason it was written, the ' +
        'trigger that held and what the action answered — so that each counter adds up to the same count?',
      covers,
      [
        need('there are counter rows to compare', covers > 0, `${covers} rows`),
        need('something was added to a counter', additions > 0, `${additions} additions`),
        need('a counter fired, or no answer is ever compared', firings > 0, `${firings} firings`),
        need(
          'a firing was held back by the limit, which is the row a restore could turn into a firing',
          heldBack > 0,
          `${heldBack} held back`,
        ),
        need('a firing says what its action answered', answered > 0, `${answered} carry an answer`),
        need(
          'a row carries an amount as well as a count, or the second number is never compared',
          withAnAmount > 0,
          `${withAnAmount} carry an amount`,
        ),
      ],
      diffs,
    )
  }

  // ---- the permanent residents and their spaces
  {
    // THE RESIDENCY AND A SECRETARY'S SLEEP TIME ARE COLUMNS ON AN AGENT ROW, compared per agent, and the four tables row
    // by row. The trap it
    // watches is the void mark: a restore that lost it would hand a resident back a file it had struck out.
    const diffs: Difference[] = []
    const residency = (snapshot: Snapshot) =>
      snapshot.agents
        .filter((agent) => agent.residentSince !== null || agent.successorId !== null)
        .map((agent) => ({
          id: agent.id,
          residentSince: agent.residentSince,
          residentProposal: agent.residentProposal,
          residentDecision: agent.residentDecision,
          residentConfirmedByKind: agent.residentConfirmedByKind,
          residentConfirmedById: agent.residentConfirmedById,
          successorId: agent.successorId,
          successorNamedAt: agent.successorNamedAt,
          successorNamedByKind: agent.successorNamedByKind,
          successorNamedById: agent.successorNamedById,
          residentNamingAskedAt: agent.residentNamingAskedAt,
          residentNamedAt: agent.residentNamedAt,
          residentNamedByKind: agent.residentNamedByKind,
          residentNamedById: agent.residentNamedById,
          sleepTimeStarts: agent.sleepTimeStarts,
          sleepTimeMinutes: agent.sleepTimeMinutes,
          sleepTimeSetAt: agent.sleepTimeSetAt,
          sleepTimeSetBy: agent.sleepTimeSetBy,
        }))
    const covers =
      compareKeyed('residency', residency(before), residency(after), (row) => row.id, diffs) +
      compareKeyed('leave to read', before.residentReadGrants, after.residentReadGrants, (row) => row.id, diffs) +
      compareKeyed('void mark', before.residentVoidMarks, after.residentVoidMarks, (row) => row.id, diffs) +
      compareKeyed('write into a space', before.residentSpaceWrites, after.residentSpaceWrites, (row) => row.id, diffs) +
      compareKeyed('sleep', before.residentSleeps, after.residentSleeps, (row) => row.id, diffs)
    const residents = before.agents.filter((agent) => agent.residentSince !== null).length
    const successors = before.agents.filter((agent) => agent.successorId !== null).length
    add(
      'permanent residents and their spaces',
      'does every residency come back with its proposal, decision and the person who confirmed it, and every ' +
        'successor, leave to read, void mark and write, with who and when?',
      covers,
      [
        need('an agent is a permanent resident', residents > 0, `${residents} residents`),
        need('a retired resident has a successor', successors > 0, `${successors} successors`),
        need('a resident gave leave to read', before.residentReadGrants.length > 0, `${before.residentReadGrants.length} grants`),
        need('a file is marked void', before.residentVoidMarks.length > 0, `${before.residentVoidMarks.length} void marks`),
        need('a resident wrote a file', before.residentSpaceWrites.length > 0, `${before.residentSpaceWrites.length} writes`),
        need('a resident slept and woke', before.residentSleeps.some((row) => row.endedAt !== null), `${before.residentSleeps.length} sleep rows`),
        need('a resident postponed a sleep', before.residentSleeps.some((row) => row.what === 'postponed'), 'a postponed sleep'),
        need('a secretary set its own sleep time', before.agents.some((agent) => agent.sleepTimeSetAt !== null), 'a sleep time'),
        need(
          'the office began a sleep at a sleep time, sent its reminder and ended it',
          before.residentSleeps.some((row) => row.wakesAt !== null && row.reminderId !== null && row.endedAt !== null),
          'a sleep at a sleep time',
        ),
        need('a resident\'s picture and name were marked chosen', before.agents.some((agent) => agent.residentNamedAt !== null), 'a naming'),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ requests for one press
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('request for one press', before.onePressRequests, after.onePressRequests, (row) => row.id, diffs)
    const answered = before.onePressRequests.filter((row) => row.answeredAt !== null).length
    const waiting = before.onePressRequests.filter((row) => row.state === 'waiting').length
    add(
      'requests for one press',
      'does every request an agent filed for one press come back with its act, its inputs, the sentence it showed, ' +
        'where it stands, and who answered it and when?',
      covers,
      [
        need('a request was answered', answered > 0, `${answered} answered`),
        need('a request still waits', waiting > 0, `${waiting} waiting`),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ tool uses
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('use of a tool', before.toolUses, after.toolUses, (row) => row.id, diffs)
    const written = before.toolUses.filter((row) => row.movedAt === null).length
    const moved = before.toolUses.filter((row) => row.movedAt !== null).length
    const checked = before.toolUses.filter((row) => row.proof !== null).length
    add(
      'tool uses',
      'does every use of a tool come back on its run, at its place, with its time, its tool, what it said, who wrote ' +
        'it, and when migration 0231 moved it if it did?',
      covers,
      [
        need('a use was written by the use door', written > 0, `${written} written`),
        need('a use was moved out of a run\'s record', moved > 0, `${moved} moved`),
        need('a use holds what the use door found when it checked its proof', checked > 0, `${checked} checked`),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ named test file results
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('test file result', before.testFileRuns, after.testFileRuns, row => row.id, diffs)
    add(
      'test file results',
      'does every test file result come back on its use, with its project, path, result, seconds, file hash and tree?',
      covers,
      [need('a named run wrote file results', before.testFileRuns.length > 0, `${String(before.testFileRuns.length)} file results`)],
      diffs,
    )
  }

  // ------------------------------------------------------------------ handovers
  {
    const diffs: Difference[] = []
    const covers = compareKeyed('handover', before.handovers, after.handovers, (row) => row.id, diffs)
    const byAgent = before.handovers.filter((row) => row.writtenByKind === 'agent').length
    const byPerson = before.handovers.filter((row) => row.writtenByKind === 'person').length
    add(
      'handovers',
      'does every handover come back with its words, the agent it is for, who wrote it, when, and in which run?',
      covers,
      [
        need('an agent wrote one itself', byAgent > 0, `${byAgent} by an agent`),
        need('the person wrote one', byPerson > 0, `${byPerson} by the person`),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ readiness checklists and their signatures
  {
    const diffs: Difference[] = []
    const checklists = compareKeyed('readiness checklist', before.readinessChecklists, after.readinessChecklists, (row) => row.id, diffs)
    const signatures = compareKeyed('readiness signature', before.readinessSignatures, after.readinessSignatures, (row) => row.id, diffs)
    const closedBySomebody = before.readinessChecklists.filter((row) => row.closedAt !== null && row.closedById !== null).length
    const waiting = before.readinessChecklists.filter((row) => row.state === 'waiting').length
    const withdrawn = before.readinessSignatures.filter((row) => row.withdrawnAt !== null).length
    add(
      'readiness checklists and their signatures',
      'does every readiness checklist come back with its operation, its inputs, the sentence it showed, its level and ' +
        'signers, where it stands and who closed it, and every signature with who signed, when, on what, and whether ' +
        'it was taken back?',
      checklists + signatures,
      [
        need('a checklist was closed by somebody', closedBySomebody > 0, `${closedBySomebody} closed by somebody`),
        need('a checklist still waits', waiting > 0, `${waiting} waiting`),
        need('a signature was taken back', withdrawn > 0, `${withdrawn} withdrawn`),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ signing packages and their items
  {
    const diffs: Difference[] = []
    const packages = compareKeyed('signing package', before.signingPackages, after.signingPackages, row => row.id, diffs)
    const items = compareKeyed('signing package item', before.signingPackageItems, after.signingPackageItems, row => row.id, diffs)
    add('signing packages and their items', 'Does every package and ordered item return with its inputs, sentences, answer, outcome and times?', packages + items, [
      need('a package was answered', before.signingPackages.some(row => row.answeredAt !== null), 'an answered package'),
      need('an item was done', before.signingPackageItems.some(row => row.doneAt !== null), 'a done item'),
      need('an item still waits', before.signingPackageItems.some(row => row.state === 'waiting'), 'a waiting item'),
    ], diffs)
  }

  // ------------------------------------------------------------------ what the grant carries in this office
  {
    const diffs: Difference[] = []
    const answers = compareKeyed('answer about what the grant carries', before.whatTheGrantCarries, after.whatTheGrantCarries, (row) => String(row['door']), diffs)
    const changedByThePerson = before.whatTheGrantCarries.filter((row) => row['updatedByKind'] === 'human').length
    add(
      'what the grant carries in this office',
      'does every door this office\'s person changed come back with its answer, who changed it and when?',
      answers,
      [
        need('the person changed at least one door', changedByThePerson > 0, `${changedByThePerson} changed by the person`),
      ],
      diffs,
    )
  }

  // ------------------------------------------------------------------ quick inputs: the owner's list and every ask
  {
    const diffs: Difference[] = []
    const list = compareKeyed('the list of quick inputs', before.quickInputList, after.quickInputList, (row) => String(row['only_row']), diffs)
    const asks = compareKeyed('ask for a quick input', before.quickInputAsks, after.quickInputAsks, (row) => String(row['id']), diffs)
    const clearedBySomebody = before.quickInputList.filter((row) => row['inputs'] === null && row['updated_by_kind'] !== 'migration').length
    const typed = before.quickInputAsks.filter((row) => row['outcome'] === 'typed').length
    const refused = before.quickInputAsks.filter((row) => row['outcome'] !== 'typed').length
    add(
      'quick inputs: the owner\'s list and every ask',
      'does the owner\'s list of quick inputs come back as it was set or cleared, and by whom, over the list a fresh ' +
        'office starts with, and does every ask come back with its agent, run, terminal, input, outcome, sentence and ' +
        'who asked?',
      list + asks,
      [
        need('the list was cleared by somebody', clearedBySomebody > 0, `${clearedBySomebody} cleared by somebody`),
        need('an ask was typed', typed > 0, `${typed} typed`),
        need('an ask was refused', refused > 0, `${refused} refused`),
      ],
      diffs,
    )
  }

  made.push(...compareThePartTables(before.partTables, after.partTables))
  return made
}

/** A comparison with its verdict: vacuous unless it looked at something and the corpus held what it needs. */
function judged(name: ComparisonName, question: string, covers: number, needs: Need[], differences: Difference[]): Comparison {
  const looked = covers > 0 && needs.every((n) => n.met)
  return { name, question, covers, needs, differences, verdict: !looked ? 'vacuous' : differences.length === 0 ? 'held' : 'differs' }
}

// ============================================================================ the tables declared in a schema part

/** The SQL names of a part table's primary key, which is what a row is matched by. */
function primaryKeyOfThePartTable(table: PartTable): string[] {
  const config = getTableConfig(table.table)
  const composite = config.primaryKeys[0]
  const columns = composite === undefined ? config.columns.filter((c) => c.primary).map((c) => c.name) : composite.columns.map((c) => c.name)
  if (columns.length === 0) {
    throw new Error(`${table.name}, declared in ${table.part}, has no primary key, so a restored row cannot be matched to the row it was.`)
  }
  return columns
}

/** Every row of every compared part table, as SQLite stores it. */
export function readThePartTables(sqlite: { prepare(sql: string): { all(): unknown[] } }): Snapshot['partTables'] {
  const out: Snapshot['partTables'] = {}
  for (const table of COMPARED_PART_TABLES) out[table.name] = sqlite.prepare(`SELECT * FROM ${table.name}`).all() as Record<string, unknown>[]
  return out
}

/** One comparison for each compared part table: every row, every column, matched by its primary key. */
export function compareThePartTables(before: Snapshot['partTables'], after: Snapshot['partTables']): Comparison[] {
  return COMPARED_PART_TABLES.map((table) => {
    const key = primaryKeyOfThePartTable(table)
    const diffs: Difference[] = []
    const rows = compareKeyed(table.name, before[table.name] ?? [], after[table.name] ?? [], (row) => JSON.stringify(key.map((c) => row[c])), diffs)
    return judged(
      comparisonOfThePartTable(table.name),
      `does every row of ${table.name}, declared in ${table.part}, come back with every column as it was stored?`,
      rows,
      [{ what: `a row of ${table.name}`, met: rows > 0, measured: `${rows} row(s)` }],
      diffs,
    )
  })
}

/**
 * Fill every part table the proof needs rows in through its own `fillForTheProof`, and refuse a fill
 * that wrote no row. That is each table it compares, and each table a restore may lose. A comparison
 * over an empty table reads vacuous, and a loss of an empty table did not happen, so a proof whose
 * corpus could not hold a row of such a table is a proof that table never had.
 */
export async function fillThePartTables(): Promise<string[]> {
  const { sqlite } = await import('../src/server/db/client.ts')
  // Each file that gives a part its fill from above the database folder (`theFillGivenBy`), loaded so its fill is there.
  await import('../src/holder/notice-batches.ts')
  await import('../src/server/lib/agent-starter.ts')
  await import('../src/server/lib/the-provider-table.ts')
  await import('../src/server/lib/agent-names.ts')
  await import('../src/server/lib/keyrouter/provider-router.ts')
  const notes: string[] = []
  for (const table of everyPartTable()) {
    if (table.says.restore === 'not in this proof') continue
    const said = await table.says.fillForTheProof()
    const held = (sqlite.prepare(`SELECT count(*) AS n FROM ${table.name}`).get() as { n: number }).n
    if (held === 0) {
      throw new Error(
        `The restore proof filled ${table.name}, declared in ${table.part}, and it holds no row afterwards. Its fillForTheProof ` +
          'must write at least one row through the product\'s own writer.',
      )
    }
    notes.push(`${table.name} (${table.part}): ${said}`)
  }
  return notes
}

/** The row count of every table a schema part declares, by table name. */
export function countThePartTables(sqlite: { prepare(sql: string): { get(): unknown } }): Snapshot['partTableCounts'] {
  const out: Snapshot['partTableCounts'] = {}
  for (const table of everyPartTable()) out[table.name] = (sqlite.prepare(`SELECT count(*) AS n FROM ${table.name}`).get() as { n: number }).n
  return out
}

/**
 * One declared loss for each part table that says a restore may lose it, with the why and the repair
 * its declaration gives. It happened when the table held a row before and holds none after. It
 * explains no difference, because no comparison claims the table comes back.
 *
 * A FUNCTION DECLARATION, so `DECLARED_LOSSES` above can call it while this file loads.
 */
function theLossesThePartTablesDeclare(): DeclaredLoss[] {
  return everyPartTable().flatMap((table) => {
    const says = table.says
    if (says.restore !== 'may be lost') return []
    return [
      {
        what: `${table.name}, a table declared in ${table.part} as \`${table.binding}\`, comes back empty`,
        why: says.why,
        repair: says.repair,
        happened: (before: Snapshot, after: Snapshot) =>
          (before.partTableCounts[table.name] ?? 0) > 0 && (after.partTableCounts[table.name] ?? 0) === 0,
        explains: () => false,
      },
    ]
  })
}

/**
 * The part tables that say they are not in this proof, each with the reason its declaration gives.
 * A FUNCTION DECLARATION, so `NOT_IN_THIS_PROOF` can call it while this file loads.
 */
function thePartTablesNotInThisProof(): { table: string; why: string }[] {
  return everyPartTable().flatMap((table) => (table.says.restore === 'not in this proof' ? [{ table: table.name, why: table.says.why }] : []))
}

/** One declared loss, and exactly what it accounted for on this run. */
export interface LossOutcome {
  what: string
  why: string
  repair: string
  happened: boolean
  explained: Difference[]
}

/**
 * Every comparison, with each difference sorted into "explained by a declared loss" or "not".
 *
 * THIS IS THE ONE PLACE THE SORTING HAPPENS, so the command and the test suite cannot end up with
 * two ideas of what counts as a failure. A difference a loss NAMES moves out of `differences` and
 * into that loss; a difference no loss names stays, and fails the run. Nothing is dropped: every
 * difference is printed exactly once, under the comparison or under the loss.
 */
export function compareAccountingForLosses(
  before: Snapshot,
  after: Snapshot,
): { comparisons: Comparison[]; losses: LossOutcome[] } {
  const comparisons = compareSnapshots(before, after)
  const losses: LossOutcome[] = DECLARED_LOSSES.map((l) => ({
    what: l.what,
    why: l.why,
    repair: l.repair,
    happened: l.happened(before, after),
    explained: [],
  }))

  for (const comparison of comparisons) {
    const kept: Difference[] = []
    for (const difference of comparison.differences) {
      const at = DECLARED_LOSSES.findIndex((l) => l.explains(difference))
      const loss = at === -1 ? undefined : losses[at]
      if (loss === undefined) kept.push(difference)
      else loss.explained.push(difference)
    }
    comparison.differences = kept
    // A comparison whose every difference was accounted for HELD; it does not become vacuous,
    // because it did look, and `covers` still says at how much.
    if (comparison.verdict === 'differs' && kept.length === 0) comparison.verdict = 'held'
  }


  return { comparisons, losses }
}

// ============================================================================ filling the corpus

/**
 * A PORT NUMBER THE OPERATING SYSTEM JUST HANDED OUT, WHICH NOTHING IS LISTENING ON.
 *
 * This check registers a port in the resource ledger and releases it again, so the archive carries
 * one released row. It must never register a port something is actually using: releasing that row
 * would look at whatever is holding it, and the check would report on a stranger's process.
 *
 * IT USED TO PICK THE FIRST FREE NUMBER OUT OF FIVE — 39187 to 39191. That worked until this
 * campaign started running several isolated Mole Office instances at once, each taking two ports. Then
 * all five could be busy, and the check threw. Two test files went red inside a full run and passed
 * alone, and the message they printed was about restoring, which is a frightening thing to read for
 * a reason that has nothing to do with backups. Problem `ojglehiC0PP4`.
 *
 * Binding to port 0 asks the operating system for one out of its ephemeral range, which is a much
 * larger pool than five and is the same thing `tools/isolated-mole-office.mjs` already does. The socket
 * is closed straight away, so the number is free when it is registered. That leaves a gap between
 * closing and registering, which is why the listening set is checked as well and why it tries more
 * than once. If every attempt really is taken, the message says what happened rather than blaming
 * the restore.
 */
async function aPortNobodyIsListeningOn(resources: { osProbe: () => { listeningPorts: () => { port: number }[] } }): Promise<number> {
  const tried: number[] = []
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offered = await new Promise<number>((ok, no) => {
      const probe = createServer()
      probe.once('error', no)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        const port = typeof address === 'object' && address !== null ? address.port : 0
        probe.close(() => {
          ok(port)
        })
      })
    })
    tried.push(offered)
    const listening = new Set(resources.osProbe().listeningPorts().map((p) => p.port))
    if (offered !== 0 && !listening.has(offered)) return offered
  }
  throw new Error(
    `asked the operating system for a spare port five times and something was listening on every one of them ` +
      `(${tried.join(', ')}). Nothing is wrong with the backup or the restore; this check registers a port in the ` +
      `resource ledger and refuses to register one it cannot prove is free.`,
  )
}

/**
 * A real transcript for the run the seeded review is addressed to.
 *
 * Dispatch asks whether an addressed run can actually be picked up, and that reading looks for the
 * file. A path nothing wrote is a run Mole Office refuses to address — correctly, and proved in
 * tests/agent-dispatch.test.ts — which would stop this seed before it could plant anything.
 *
 * This is a script rather than a test, so it does not use tests/helpers.ts. It is the only copy
 * outside that file, and it exists because scripts/ may not import from tests/.
 *
 * IT IS WRITTEN INTO `scratch`, the folder whoever builds the database already owns and removes.
 * Until 29 September 2026 it went into a folder of its own in the system's temporary folder, which
 * nothing removed: one `mole-office-restore-check-run-` folder was left behind for every build, 235
 * of them on the owner's machine on 4 September (problem ToxCUBqVhdPI).
 */
function transcriptForTheSeededRun(scratch: string): string {
  const folder = join(scratch, 'the-seeded-run')
  mkdirSync(folder, { recursive: true })
  const at = join(folder, 'ffff9999.jsonl')
  writeFileSync(at, '{"type":"user","message":{"role":"user","content":"hello"}}\n')
  return at
}

/**
 * Put rows into every authored table the seed leaves empty.
 *
 * WHY THIS IS NOT OPTIONAL. `reader_anchors`, `presentation_intent`,
 * `session_resources`, the planning tables and now `plans` and `plan_lines` hold nothing after
 * `scripts/seed.ts` runs, and an empty table is a trap rather than a relief: a restore proof taken
 * against the seed alone would come back green while carrying none of them. design/durability/
 * FORMAT.md §8 says exactly this, and this function is the answer to it.
 *
 * EVERY ROW IS WRITTEN THROUGH THE PRODUCT'S OWN WRITE PATH. A row written straight into SQL is a
 * row no user could have made, and proving that one round-trips proves nothing about the ones they
 * can. `panel_layouts` was the one exception, written in SQL because its only writer went with the
 * panel grid on 2026-08-10. No backup or export carries it now,
 * so there is no round trip left to prove, and this function leaves it empty (NOT_IN_THIS_PROOF).
 *
 * The ledger row registers THIS PROCESS's own pid, so `pgid` and `os_started_at` are real values
 * read off the running machine. That is what makes "the machine columns are NULL after a restore"
 * an assertion rather than a tautology over two empty columns.
 *
 * `scratch` is a folder the caller owns and removes. The one file this writes outside the database,
 * the seeded run's transcript, goes in it.
 */
export async function fillEmptyTables(scratch: string): Promise<{ notes: string[] }> {
  const client = await import('../src/server/db/client.ts')
  const records = await import('../src/server/lib/records.ts')
  const presentation = await import('../src/server/lib/presentation.ts')
  const resources = await import('../src/server/lib/resources.ts')
  const notes: string[] = []

  // THE OFFICE'S OWNER, read from the scratch database this fills: the person its migrate marked, from
  // MOLE_OFFICE_OWNER_ID or `owner` when nothing said. Every act below that is a person's is this
  // owner's. It once named a fixed person, whom a fresh office does not hold (problem Nht4tEXhgM8B).
  const { theOfficeOwner } = await import('../src/server/lib/owner.ts')
  const owner = theOfficeOwner().id
  const thePerson = { kind: 'person' as const, id: owner }
  const actor = { type: 'human', id: owner } as const

  // ---- presentation_intent: a scope's own settings AND two nodes, so all three shapes are stored
  //
  // The `(scope)` sentinel row and a node row are different rows with different keys, and an export
  // that carried one and not the other would pass a check that only wrote one.
  const pipelines = records.listRecords({ workspaceId: 'default', kind: 'pipeline' })
  const pipeline = pipelines.find((p) => blockIdsOfSafely(p).length >= 2) ?? pipelines[0]
  if (pipeline === undefined) throw new Error('the corpus holds no pipeline, so no drawing can be arranged')
  const blocks = await import('@shared/blocks.ts')
  const blockIds = blocks.blockIdsOf(pipeline)
  const first = blockIds[0]
  const second = blockIds[1]
  if (first === undefined) throw new Error(`pipeline ${pipeline.id} holds no blocks, so no node can be arranged`)
  const scope = presentation.parseScope(`pipeline:${pipeline.id}`, 'default')
  presentation.writeScopeSettings(scope, { direction: 'right' }, actor)
  presentation.writeNodeIntent(scope, first, { lane: 'on the real bench', emphasis: 'blocked', order: 2 }, actor)
  if (second !== undefined) {
    presentation.writeNodeIntent(scope, second, { role: 'prominent', collapsed: false, near: first }, actor)
  }
  notes.push(`presentation_intent: ${scope.scope} arranged — a direction and ${second === undefined ? 1 : 2} node(s)`)

  // ---- session_resources, two rows: one still held with real machine facts, one released
  //
  // THE HELD ROW REGISTERS THIS PROCESS'S OWN PID, so `pgid` and `os_started_at` are read off the
  // running machine rather than invented. Without that, "the machine columns are NULL after a
  // restore" would be an assertion over two columns that were already null, which proves nothing.
  // Nothing ever releases it, so nothing is ever signalled.
  const sessions = records.listRecords({ workspaceId: 'default', kind: 'session' })
  const holder = sessions[0]
  if (holder === undefined) throw new Error('the corpus holds no session record, so nothing can own a ledger row')
  const held = resources.registerResource({
    workspaceId: 'default',
    sessionRecordId: holder.id,
    type: 'process',
    key: String(process.pid),
    detail: 'the restore check itself, registered so the ledger carries a real process group',
    actor,
  })
  if (held.pgid === null || held.osStartedAt === null) {
    throw new Error(
      'the ledger row for this process came back with no process group or no start time, so the machine ' +
        'columns cannot be asserted absent later. Nothing was hidden; this run cannot answer the question.',
    )
  }

  // The released row needs a session that has ENDED — releaseResource refuses to interrupt work in
  // progress — and a port nothing is listening on, so that releasing it signals nothing at all.
  //
  // ENDED MEANS WHAT `releaseResource` MEANS BY IT, read from the module that decides it. This line
  // used to carry its own list — finished, crashed OR ORPHANED — and `releaseResource` counts only
  // the first two. `listRecords` answers newest-written first and Mole Office's clock has second
  // resolution, so on a quick machine the seed's sessions were all written inside one tick and the
  // find returned a `finished` one, and on a busy machine the writes straddled a boundary, the
  // four `orphaned` sessions sorted in front, and the seed refused itself with "The session that
  // started this is still orphaned, so killing port ... would interrupt work in progress". The
  // whole restore proof went red before a single assertion ran, in a file that passes alone:
  // problem XWKLLcnJ2CWF. Importing the list rather than retyping it is what stops the two lists
  // drifting apart again.
  const ended = sessions.find((s) => {
    const state = (s.data as { state?: unknown }).state
    return typeof state === 'string' && (resources.TERMINAL_STATES as readonly string[]).includes(state)
  })
  if (ended === undefined) {
    const states = [...new Set(sessions.map((s) => String((s.data as { state?: unknown }).state)))].sort()
    throw new Error(
      `no session in the corpus is in a state releaseResource treats as over (${resources.TERMINAL_STATES.join(', ')}), ` +
        `so no ledger row can be released. The corpus holds ${sessions.length} sessions, in: ${states.join(', ')}.`,
    )
  }
  const free = await aPortNobodyIsListeningOn(resources)
  const released = resources.registerResource({
    workspaceId: 'default',
    sessionRecordId: ended.id,
    type: 'port',
    key: String(free),
    detail: 'a port this run never bound, recorded so the archive carries a released row',
    actor,
  })
  await resources.releaseResource(
    released.id,
    {
      actor,
      note: 'the restore check finished with it; nothing was listening, so nothing was signalled',
    },
    'default',
  )
  notes.push(
    `session_resources: ${held.id} still held with pgid ${String(held.pgid)} and start ${held.osStartedAt}, ` +
      `${released.id} released with a note`,
  )

  // ---- the two provenance answers the seed cannot produce
  //
  // WHY THIS IS NOT OPTIONAL, and it is the same argument as the four empty tables above. Everything
  // scripts/seed.ts writes is stamped `fixture`, so a proof taken against the seed alone would come
  // back green over a corpus with exactly one origin word in it — and the two answers that can
  // actually do damage by drifting are the other two. `authored` is the mark on the project's own
  // record, which is what a restore exists to bring back. NOTHING RECORDED is the dangerous one: it
  // is the honest answer for a row nobody has judged, and turning it into `authored` on the way
  // through would be the product inventing a judgement in the direction that makes fixture content
  // read as real work.
  //
  // `authored` NEEDS NO EXCEPTION ANY MORE. This used to write the stamp straight into SQL, because
  // `createRecord` took no origin and left every new row NULL. It takes one now and defaults to
  // `authored`, so filing a record through the product is all this needs — which is also the
  // stronger fixture: the row under test got its mark the way every real record now gets it.
  const authored = records.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'Restore check · a record filed as real work',
    summary: 'Stamped `authored`, so the restore proof can show a real record surviving beside the fixture.',
    data: { body: 'Written by the restore check so that `authored` is in the corpus at all. See fillEmptyTables.' },
    actor,
  })
  const { sqlite: originSqlite } = await import('../src/server/db/client.ts')
  const historicalSubmission = records.createRecord({ workspaceId: 'default', kind: 'session',
    title: 'Restore check · an explicitly historical unsealed finish', origin: 'fixture',
    data: { state: 'finished', runtime: 'historical-fixture' }, actor })
  originSqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(historicalSubmission.id)
  notes.push('legacy_unsealed_runs: synthetic historical session ' + historicalSubmission.id + ' remains unsealed')


  // AND ONE LEFT DELIBERATELY UNSTAMPED — WHICH IS NOW THE HALF THAT NEEDS SQL, and the swap is
  // worth reading. No product write path produces a NULL origin any more, so the only rows that
  // carry one are rows written before the column existed and rows edited by hand. That is exactly
  // what makes this case worth proving: it is unreachable through the product, it exists in the
  // real corpus, and a restore that turned it into `authored` would be inventing a judgement in the
  // direction that makes fixture content read as real work. The CONTENT goes through
  // `createRecord`; one envelope column is then cleared.
  const unstamped = records.createRecord({ workspaceId: 'default',
    kind: 'note',
    title: 'Restore check · a record nobody has said anything about',
    summary: 'No origin at all. Not authored, not fixture — nobody has recorded how it got here.',
    data: { body: 'Left unstamped on purpose. A restore that turned this into `authored` would be inventing one.' },
    actor,
  })
  originSqlite.prepare('update records set origin = null where id = ?').run(unstamped.id)
  const stampCheck = originSqlite
    .prepare('select id, origin from records where id in (?, ?)')
    .all(authored.id, unstamped.id) as { id: string; origin: string | null }[]
  const authoredRow = stampCheck.find((r) => r.id === authored.id)
  const unstampedRow = stampCheck.find((r) => r.id === unstamped.id)
  if (authoredRow?.origin !== 'authored' || unstampedRow?.origin !== null) {
    throw new Error(
      'the two provenance records did not come out as written — ' +
        `authored is ${JSON.stringify(authoredRow?.origin)} and the unstamped one is ` +
        `${JSON.stringify(unstampedRow?.origin)}. Without both, the origin comparison would run over one answer ` +
        'and report that it held.',
    )
  }
  notes.push(
    `records.origin: ${authored.id} stamped authored, ${unstamped.id} left with none, beside the seed's fixture rows`,
  )

  // ---- a write whose key proved a holder the headers did not name, so `provedHolder` is not null
  //
  // Migration 0168 put the column on `changes` and on `revisions`, and the export declares it on
  // both. Without a row carrying a value, the comparison would run over nothing but nulls and hold
  // whatever the archive did with them. The actor is handed the proved holder directly, because
  // `actorFrom`'s one job is working out whether the key's holder differs from the name the headers
  // gave, and this is the row where it did. `records.createRecord` is the product's own writer, so
  // the value reaches both ledgers in one transaction, exactly as a keyed request writes it.
  const provedActor = {
    type: 'agent',
    id: 'restore-check-writer',
    sessionId: null,
    provedHolder: { id: 'the-office', how: 'the-office-key', claimed: 'restore-check-writer' },
  } as const
  const provedWrite = records.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'Restore check · a write whose key proved a different holder',
    summary: 'Written with a non-null provedHolder so both ledgers carry one through the archive.',
    data: { body: 'The restore comparison reads who the key proved off this row and its revision.' },
    actor: provedActor,
  })
  notes.push(`changes/revisions provedHolder: ${provedWrite.id} written under a key that proved the-office`)

  // ---- conversation_reads: one read of a conversation the reader was not part of
  //
  // The seed writes messages and therefore delivery rows, and it writes no read of somebody else's
  // conversation, because that is an act a person takes in the browser. So this proof would compare
  // an empty table with an empty table and report that it held.
  //
  // THROUGH THE PRODUCT'S OWN WRITER, `recordThatSomebodyRead`, which is what the route calls. A row
  // put in with raw SQL would prove the archive can carry a shape rather than that the shape the
  // product writes survives.
  const messages = await import('../src/server/lib/messages.ts')
  const theRead = messages.recordThatSomebodyRead(
    thePerson,
    messages.pairKey({ kind: 'agent', id: 'restore-check-a' }, { kind: 'agent', id: 'restore-check-b' }),
    { kind: 'agent', id: 'restore-check-a' },
    'default',
  )
  notes.push(`conversation_reads: ${owner} read ${theRead.pair} as ${theRead.asSide} at ${theRead.at}`)

  // ---- groups and group_members: one group, with somebody in it and somebody who has left
  //
  // The seed opens no group, because opening one is an act somebody takes. THROUGH THE PRODUCT'S OWN
  // WRITERS, for the reason the read above gives: rows put in with raw SQL would prove the archive
  // can carry a shape rather than that the shape the product writes survives. A member who has left
  // is written too, because `left_at` is the one column a group with nothing but joins would never
  // fill, and an archive that dropped it would lose the fact that somebody was ever in the group.
  // AND THE AGENT THAT IS IN IT, filed as a record so that the registry row is written the way every
  // registry row is — `keepTheAgentRegistryInStep` inside the record's own write. A group may only
  // hold participants the registries answer for, so an invented id would be refused here, which is
  // the rule doing its job rather than something to work round.
  const theAgentRecordA = records.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Restore check A',
    summary: 'Filed by the restore check so that a durable agent can be in the group below.',
    // A WORK AREA, because since criterion P93 an agent with none may not start work, and the claim
    // filed below is starting work. The check is about what an archive carries, so the agent it
    // needs is an ordinary one: a worker with a folder, which is what P92's grain asks of a worker.
    data: { handle: 'restore-check-a', runtime: 'claude-code', state: 'active', workArea: ['src/server'] },
    actor,
  })
  // THE REGISTRY ID THE REGISTRATION GAVE IT, which is not its handle (criterion I1). Every call below
  // that takes a registry id is given this one; the handle is only for the calls that take a handle.
  const theRegistryIdOf = (recordId: string): string => {
    const row = originSqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(recordId) as
      | { id: string }
      | undefined
    if (row === undefined) throw new Error(`the agent record ${recordId} was filed and no registry row is mapped to it`)
    return row.id
  }
  const agentA = theRegistryIdOf(theAgentRecordA.id)
  const team = await import('../src/server/lib/groups.ts')
  const theGroup = team.openAGroup({
    workspaceId: 'default',
    name: 'The restore check',
    openedBy: thePerson,
    because: 'Opened by the restore check so that a group and its memberships are in the archive.',
    members: [
      { who: thePerson, because: 'They opened it.' },
      { who: { kind: 'agent', id: agentA }, because: 'It is one of the two agents above.' },
    ],
  })
  team.takeOutOfTheGroup(theGroup.id, { kind: 'agent', id: agentA }, thePerson)
  notes.push(`groups: ${theGroup.id} opened with two members, one of whom has since left`)

  // ---- work_claims: one claim, released, so both the open and the ended shapes are covered
  //
  // The seed files no claim, because filing one is an act an agent takes when it starts work. A
  // released claim is written rather than a live one, because `releasedAt` and `releasedBecause` are
  // the two columns a live claim never fills — and a restore that dropped them would lose the fact
  // that somebody said they had finished, which is the one ending that is written down at all.
  const claims = await import('../src/server/lib/claims.ts')
  const theRun = records.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Restore check · the run that claimed some work',
    data: { state: 'finished', runtime: 'claude-code' },
    actor,
  })
  const theClaim = claims.fileAClaim(
    {
      workspaceId: 'default',
      claimant: { kind: 'agent', id: agentA },
      run: theRun.id,
      things: [{ what: 'path', id: 'perception/calibration' }],
    },
    actor,
  )
  claims.releaseAClaim(theClaim.claim.id, 'default', { kind: 'agent', id: agentA }, 'The fit is done.')
  notes.push(`work_claims: ${theClaim.claim.id} filed for one folder and released`)

  // ---- handle_holds: one hold, released, so both the live and the ended shapes are covered
  //
  // The seed writes none, because a hold appears when somebody has an agent open in a terminal. A
  // released one is written rather than a live one, because `releasedAt` and `releasedBecause` are
  // the two columns a live hold never fills, and they carry the only stored account of why a session
  // stopped answering as an agent.
  const handles = await import('../src/server/lib/handles.ts')
  const theTerminal = records.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Restore check · the terminal that was answering as an agent',
    data: { state: 'finished', runtime: 'claude-code' },
    actor,
  })
  const theHold = handles.holdTheHandle({
    handle: 'restore-check-a',
    session: theTerminal.id,
    machine: 'a-machine',
    runtime: 'claude-code',
    workspaceId: 'default',
  })
  handles.letTheHandleGo('restore-check-a', theTerminal.id, 'the session stopped the waiter')
  notes.push(`handle_holds: ${theHold.hold.id} held for one session and let go`)

  // ---- dead_letter_claims: one addressee named in a broadcast and claimed, one left waiting
  //
  // The seed writes no message at all, so nothing in this corpus can be a dead letter until one is
  // filed here. THROUGH THE PRODUCT'S OWN WRITERS, for the reason every section gives: the sweep is
  // what the worker presses on a pass, the claim is what a secretary presses, and rows put in with
  // SQL would prove the archive can carry a shape rather than that the shape the product writes
  // survives. The message is filed by the door that writes its own delivery rows, which is what
  // makes those rows the real thing a dead letter is read from.
  //
  // ONE COLUMN IS PUT BACK BY HAND, and this is the stated reason. A dead letter's age is counted from
  // the message record's `created_at`, and it is the one column the broadcast threshold is measured
  // against — after a time, say a week, or a count. Filing the message and sweeping in
  // the same second would leave a letter no seconds old, under both thresholds, and the sweep would
  // do nothing. So the message record is put back nine days — a letter
  // that has been waiting is exactly the state the time threshold exists for — and the age is
  // computed from the current clock, so this does not depend on the calendar it runs on. The same
  // pattern as the unstamped origin above: the row comes from the product's own writer, one column
  // is then set to the shape the proof needs, and the block says so.
  const deadletters = await import('../src/server/lib/deadletters.ts')
  const { localStamp } = await import('@shared/time.ts')

  // THE SECRETARY FIRST, filed like restore-check-a was: a record of kind agent, which writes the
  // registry row the way every registration does. A broadcast with no secretary to name would write
  // nothing, and the proof needs the group the claims are announced in — and the addressing door
  // refuses a message to an id the registry does not answer for, so the recipient has to exist
  // before the message naming it is filed.
  const theSecretaryRecord = records.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Restore check · the secretary',
    summary: 'Holds the secretary card, so the dead-letter broadcast has somebody to reach and a claim to make.',
    data: { handle: 'restore-check-secretary', runtime: 'claude-code', state: 'active', role: 'secretary' },
    actor,
  })
  const theSecretary = theRegistryIdOf(theSecretaryRecord.id)
  const theUndeliverable = records.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'Restore check · a message the office could not hand over',
    data: {
      body: 'Filed by the restore check so a dead letter and its claims are in the archive. Both addressees are registered agents nothing is serving, so both deliveries stay queued.',
      to: [
        { kind: 'agent', id: agentA },
        { kind: 'agent', id: theSecretary },
      ],
    },
    actor,
  })
  const nineDaysAgo = localStamp(new Date(Date.now() - 9 * 24 * 60 * 60 * 1000))
  originSqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(nineDaysAgo, theUndeliverable.id)

  const swept = deadletters.sweepDeadLetters(actor)
  if (swept.groupId === null || swept.addressees.length !== 2) {
    throw new Error(
      `the dead-letter sweep broadcast ${JSON.stringify({ groupId: swept.groupId, addressees: swept.addressees })} ` +
        'and this proof needs one group naming both addressees. Without it, dead_letter_claims is empty in ' +
        'this corpus and nothing about it can be compared.',
    )
  }
  // AND ONE OF THE TWO IS CLAIMED, by the secretary, through the door the claim route calls. Both
  // shapes of the row are then in the corpus: claimed fills claimed_by_*, claimed_at and
  // claimed_because, which are the columns a claim nobody has taken never holds.
  const claimed = deadletters.claimDeadLetters(
    agentA,
    { kind: 'agent', id: theSecretary },
    'The letters for this agent are the restore check\'s own to read.',
  )
  if (claimed.claimedBy === null || claimed.claimedAt === null) {
    throw new Error(`claiming restore-check-a's dead letters came back unclaimed: ${JSON.stringify(claimed)}`)
  }
  notes.push(
    `dead_letter_claims: ${swept.addressees.length} addressees named by the sweep into group ${swept.groupId} — ` +
      `${claimed.id} claimed by the secretary, one left waiting. Written through sweepDeadLetters and ` +
      'claimDeadLetters, which are what the worker pass and the claim route call',
  )

  // ---- contact_groups, contact_placements and contact_group_collapses: a group somebody made
  //      under one side, a default one renamed, a contact moved into the made one, and a fold
  //
  // Four shapes rather than one, because the tables have four states between them and a restore
  // that dropped any of them would lose a different fact. A group somebody MADE carries `made`
  // true, a key nothing else knows and the side it was made under (criterion M119); a default one
  // they RENAMED carries `made` false and a name the declaration does not have, so a restore that
  // lost it would put the person's own word back to the product's; a placement carries the group they moved
  // somebody into; and a fold carries the one state that is a behaviour preference rather than a
  // group (criterion M121). The default arrangement is deliberately NOT written: it is a
  // declaration and not rows, so a fixture that seeded it would be proving the restore of
  // something no installation stores.
  const contacts = await import('../src/server/lib/contacts.ts')
  const arranger = thePerson
  const madeGroup = contacts.makeAContactGroup(arranger, 'Verifiers', 'agent')
  contacts.renameAContactGroup(arranger, 'worker', 'Builders')
  contacts.moveAContact(
    arranger,
    [{ key: `agent:${agentA}`, kind: 'agent', id: agentA, role: 'worker', retired: false }],
    `agent:${agentA}`,
    madeGroup.key,
  )
  contacts.setAContactGroupCollapsed(arranger, 'retired', false)
  notes.push(
    `contact_groups: ${madeGroup.key} made under agent and the default worker group renamed; ` +
      'contact_placements: one agent moved into the made group; contact_group_collapses: the person ' +
      'opened the retired group, written through setAContactGroupCollapsed',
  )

  // ---- a permanent resident, its space, its leave, a void mark, and a successor once it is retired
  //
  // Through the product's own writers, as the residents' doors call them: the secretary proposes with its own key,
  // the secretary proposes with its own key, a confirmation follows, the resident writes a file and gives leave with its own key, the person marks the file void
  // and ends the leave, and once the resident is retired the person names its successor. Every row of the three
  // tables and every residency column then has a value, so a restore that dropped one is a difference.
  const residents = await import('../src/server/lib/residents.ts')
  const { retireThisAgent } = await import('../src/server/lib/participants.ts')
  const anAgent = (handle: string, title: string): string =>
    theRegistryIdOf(
      records.createRecord({
        workspaceId: 'default',
        kind: 'agent',
        title,
        summary: 'Filed by the restore check so a permanent resident and its space are in the archive.',
        data: { handle, runtime: 'claude-code', state: 'active' },
        actor,
      }).id,
    )
  const theResident = anAgent('restore-check-resident', 'Restore check · the resident')
  const theReader = anAgent('restore-check-reader', 'Restore check · the reader')
  const theHeir = anAgent('restore-check-heir', 'Restore check · the successor')
  const byItsOwnKey = (handle: string, id: string) => ({ type: 'agent' as const, id: handle, provedBy: 'an-agent-key' as const, keyHolder: id })
  const proposal = residents.proposeAResident(
    { agentId: theResident, because: 'Filed by the restore check, so a residency is in the archive.' },
    byItsOwnKey('restore-check-secretary', theSecretary),
    'default',
  )
  residents.confirmAResident(proposal.id, actor)
  const residency = residents.residencyOf(theResident)
  if (residency === null) throw new Error('the restore check confirmed a resident and it reads back as none')
  residents.writeAFile(residency, 'memory/restore-check.md', Buffer.from('Written by the restore check.\n'), byItsOwnKey('restore-check-resident', theResident))
  // WRITTEN AGAIN, so a write row names the earlier version it kept.
  residents.writeAFile(residency, 'memory/restore-check.md', Buffer.from('Written again by the restore check.\n'), byItsOwnKey('restore-check-resident', theResident))
  residents.voidAFile(residency, 'memory/restore-check.md', 'Marked by the restore check, so a void mark is in the archive.', actor)
  const leave = residents.giveLeave(residency, { readerAgentId: theReader, until: '2099-01-01 12:00' }, byItsOwnKey('restore-check-resident', theResident))
  residents.endLeave(residency, leave.id, actor)
  // 0233: a sleep begun by the resident's own key and ended by the person, one postponed sleep, and the picture and
  // name marked chosen, so every column of resident_sleeps and the naming columns on agents has a value.
  residents.sleepAResident(residents.residencyOf(theResident)!, 'Asleep for the restore check.', byItsOwnKey('restore-check-resident', theResident))
  residents.wakeAResident(residents.residencyOf(theResident)!, actor)
  residents.postponeASleep(residents.residencyOf(theResident)!, 'Postponed for the restore check.', byItsOwnKey('restore-check-resident', theResident))
  residents.markTheResidentNamed(residents.residencyOf(theResident)!, actor)
  retireThisAgent(theResident, thePerson, 'Retired by the restore check, so a successor can be named.')
  const retired = residents.residencyOf(theResident)
  if (retired === null) throw new Error('the restore check retired a resident and it reads back as none')
  residents.nameASuccessor(retired, theHeir, actor)
  notes.push(
    'agents: restore-check-resident made a permanent resident through proposeAResident and confirmAResident, then ' +
      'retired, with restore-check-heir named its successor; resident_space_writes, resident_void_marks and ' +
      'resident_read_grants: one file written, written again (its earlier version kept), marked void, and one leave given and ended; ' +
      'resident_sleeps: one sleep begun and ended and one sleep postponed; its picture and name marked chosen',
  )

  // ---- 0330: a secretary's own sleep time, and one sleep the office began at it and ended
  //
  // A secretary made a permanent resident sets its own sleep time with its own key, through `setASleepTime` as its door
  // calls it. Two minutes of the product's own sleep clock are then run: one inside the time, which begins the sleep and
  // sends the reminder, and one after it, which ends the sleep. The time opens five minutes from now, so it was set
  // before it opened, as the clock asks. The four sleep-time columns on agents, and wakes_at and reminder_id on
  // resident_sleeps, then each have a value.
  const sleepClock = await import('../src/server/lib/sleep-windows.ts')
  const { stampInZone, theClockZone } = await import('@shared/time.ts')
  const theSleeper = theRegistryIdOf(
    records.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'Restore check · the secretary that sleeps at its own time',
      summary: 'Filed by the restore check so a sleep time and a sleep begun at it are in the archive.',
      data: { handle: 'restore-check-sleeper', runtime: 'claude-code', state: 'active', role: 'secretary' },
      actor,
    }).id,
  )
  const theSleepersProposal = residents.proposeAResident(
    { agentId: theSleeper, because: 'Filed by the restore check, so a sleep time is in the archive.' },
    byItsOwnKey('restore-check-secretary', theSecretary),
    'default',
  )
  residents.confirmAResident(theSleepersProposal.id, actor)
  const theSleepOpens = Date.now() + 5 * 60_000
  const theSleepersResidency = residents.residencyOf(theSleeper)
  if (theSleepersResidency === null) throw new Error('the restore check confirmed a sleeping secretary and it reads back as none')
  residents.setASleepTime(
    theSleepersResidency,
    { startsAt: stampInZone(theSleepOpens, theClockZone()).slice(11, 16), minutes: 15 },
    byItsOwnKey('restore-check-sleeper', theSleeper),
  )
  const theMinuteInside = sleepClock.aMinuteOfTheSleepClock(theSleepOpens + 60_000)
  const theMinuteAfter = sleepClock.aMinuteOfTheSleepClock(theSleepOpens + 16 * 60_000)
  if (!theMinuteInside.began.includes(theSleeper) || !theMinuteAfter.woke.includes(theSleeper)) {
    throw new Error('the restore check ran the sleep clock inside and after a sleep time, and it did not begin and end that sleep')
  }
  notes.push(
    'agents: restore-check-sleeper, a secretary made a permanent resident, set its own sleep time with its own key; ' +
      'resident_sleeps: one sleep the sleep clock began at that time, with its reminder, and ended when the time was over',
  )

  // ---- presses_for_the_person and changes.press_id: one press a secretary made for the person under their grant
  //
  // Migration 0280. The grant is written the way the raise door writes it, through the card door, because that door is a
  // route handler with no writer of its own to call. The press is the product's own: the secretary proposes a second
  // resident with its own key and, holding the grant, declines it for the person through `declineAResident`, which asks
  // `aRaiseCarriesIt` and writes the decision. So the press row and the change rows that name it come from logChange,
  // as a request's would. The grant is then ended, as the person's end does, so no later step here runs under it.
  const elevations = await import('../src/server/lib/elevation.ts')
  const theGrant = elevations.aGrant({ endsWhen: 'when you say', until: null, by: owner, reason: 'Given by the restore check, so a press for the person is in the archive.' })
  records.throughTheCardDoor(() => records.patchRecord(theSecretaryRecord.id, { dataPatch: { elevation: elevations.asStored([theGrant]) } }, actor))
  const toDecline = residents.proposeAResident(
    { agentId: theReader, because: 'Filed by the restore check, so a press for the person can decline it.' },
    byItsOwnKey('restore-check-secretary', theSecretary),
    'default',
  )
  const pressingActor = {
    ...byItsOwnKey('restore-check-secretary', theSecretary),
    sessionId: null,
    press: { operation: 'resident.decline', aRead: false, reason: 'Declined by the restore check, so a press for the person is in the archive.' },
  }
  residents.declineAResident(toDecline.id, 'Not now, said for the person by the restore check.', pressingActor)
  const pressRow = originSqlite.prepare('SELECT id FROM presses_for_the_person WHERE grant_id = ?').get(theGrant.id) as { id: string } | undefined
  if (pressRow === undefined) {
    throw new Error(`the restore check declined ${toDecline.id} under the grant ${theGrant.id} and no press for the person was written`)
  }
  records.throughTheCardDoor(() =>
    records.patchRecord(theSecretaryRecord.id, { dataPatch: { elevation: elevations.asStored([elevations.ended(theGrant, 'Ended by the restore check.')]) } }, actor),
  )
  notes.push(
    `presses_for_the_person: ${pressRow.id}, restore-check-secretary declining ${toDecline.id} for the person under the ` +
      'grant through declineAResident, with its reason; the grant then ended',
  )

  // ---- one_press_requests: one request that was agreed to, and one still waiting
  //
  // Through the product's own writers, as the doors call them: the reader files both with its own key, and the person
  // agrees to the first, so every answer column has a value and a restore that dropped one is a difference.
  const onePress = await import('../src/server/lib/one-press.ts')
  const aSettingRequest = (value: number) =>
    onePress.fileARequest({
      act: 'change-a-setting',
      inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value },
      because: 'Filed by the restore check, so a request for one press is in the archive.',
      actor: byItsOwnKey('restore-check-reader', theReader),
      workspaceId: 'default',
    })
  const agreedTo = onePress.agreeToARequest(aSettingRequest(12).id, actor)
  if (agreedTo.state !== 'done') throw new Error(`the restore check agreed to a request and it came back ${agreedTo.state}: ${agreedTo.outcome ?? ''}`)
  aSettingRequest(13)
  notes.push(
    'one_press_requests: restore-check-reader filed two with its own key through fileARequest, and the person agreed ' +
      'to the first through agreeToARequest',
  )

  // ---- tool_uses: two uses the use door wrote, and two moved out of a run's record by migration 0231's data step
  //
  // The door's rows go through writeAUse, as POST /api/toolset/uses calls it. The moved rows are a list put straight
  // into a run's data, as the door wrote it before round 33 of wave 13s, then moved by the step itself, so the
  // `moved_at` column has a value and a restore that dropped it is a difference.
  const toolset = await import('../src/server/lib/toolset.ts')
  const { moveToolUsesIntoTheirTable } = await import('../src/server/db/tool-uses-migration.ts')
  const { sqlite: theSqlite } = await import('../src/server/db/client.ts')
  const toolCategory = records.createRecord({
    workspaceId: 'default',
    kind: 'tool_category',
    title: 'Restore check · made-up tools',
    data: { says: 'Filed by the restore check, so a use of a tool is in the archive.' },
    actor,
  }).id
  records.createRecord({
    workspaceId: 'default',
    kind: 'tool',
    title: 'Restore check · a made-up tool',
    data: { entry: 'tool', slug: 'restore-check-tool', forWhom: 'developers', category: toolCategory, kept: 'in this repository', state: 'not built yet' },
    actor,
  })
  const usingRun = records.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Restore check · a run that used a tool',
    data: { state: 'running' },
    actor,
  }).id
  const asTheRun = { ...byItsOwnKey('restore-check-reader', theReader), sessionId: usingRun }
  toolset.writeAUse({ workspaceId: 'default', actor: asTheRun, tool: 'restore-check-tool', said: 'make: the first made-up use' })
  toolset.writeAUse({ workspaceId: 'default', actor: asTheRun, tool: 'restore-check-tool', said: 'open: the second made-up use' })
  // A use the door checked, as POST /api/toolset/uses checks each one since migration 0300: it came with no proof.
  toolset.writeAUse({ workspaceId: 'default', actor: asTheRun, tool: 'restore-check-tool', said: 'send: a made-up use with no proof', proof: { sent: undefined, keysHash: null } })
  notes.push('tool_uses: one use was written as the use door checks it since migration 0300, so its `proof` column holds an answer')
  // ---- test_file_runs: one named run, including a known time/hash and unknown values
  const { THE_TEST_FILES_TOOL, TEST_FILE_RESULTS, TEST_HASH_CHARACTERS, NO_UNCOMMITTED_CHANGE } = await import('../src/shared/toolset.ts')
  records.createRecord({
    workspaceId: 'default', kind: 'tool', title: 'Restore check · synthetic named tests',
    data: { entry: 'tool', slug: THE_TEST_FILES_TOOL, forWhom: 'developers', category: toolCategory, kept: 'in this repository', state: 'not built yet' },
    actor,
  })
  toolset.writeAUse({
    workspaceId: 'default', actor: asTheRun, tool: THE_TEST_FILES_TOOL, said: 'Synthetic file results for the restore proof.',
    files: [
      { file: 'tests/synthetic-passed.test.ts', result: TEST_FILE_RESULTS[0], seconds: 1.234, testFileHash: 'a'.repeat(TEST_HASH_CHARACTERS) },
      { file: 'tests/synthetic-unknown.test.ts', result: TEST_FILE_RESULTS[2], seconds: null, testFileHash: null },
    ],
    tree: { commit: 'a'.repeat(40), change: NO_UNCOMMITTED_CHANGE },
  })
  notes.push('test_file_runs: the use writer stored two synthetic named-test file results, with reported and unknown values')
  const oldRun = records.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'Restore check · a run from before round 33',
    data: { state: 'finished' },
    actor,
  }).id
  const oldList = [
    { at: '2026-10-01 10:00:00', tool: 'restore-check-tool', said: 'make: a made-up use kept in the record' },
    { at: '2026-10-01 10:00:05', tool: 'restore-check-tool', said: 'open: a second made-up use kept in the record' },
  ]
  theSqlite.prepare("UPDATE records SET data = json_set(data, '$.toolUses', json(?)) WHERE id = ?").run(JSON.stringify(oldList), oldRun)
  const movedUses = moveToolUsesIntoTheirTable(theSqlite)
  if (movedUses.rowsWritten !== oldList.length) throw new Error(`the restore check moved a list of ${oldList.length} uses and ${movedUses.rowsWritten} rows came out`)
  notes.push(
    'tool_uses: restore-check-reader wrote two uses on one run through writeAUse, and migration 0231\'s data step ' +
      'moved a list of two out of another run\'s record',
  )

  // ---- handovers: one the reader wrote with its own key in a run, and a newer one from the person
  //
  // Through the product's own writer, as the door calls it, so every column has a value and the second is current.
  const handoverLib = await import('../src/server/lib/handovers.ts')
  const participantsLib = await import('../src/server/lib/participants.ts')
  const theReaderRow = participantsLib.readParticipant({ kind: 'agent', id: theReader }) as import('../src/server/lib/participants.ts').RegisteredAgent | null
  if (theReaderRow === null) throw new Error('the restore check registered restore-check-reader and could not read it back')
  handoverLib.writeAHandover({
    agent: theReaderRow,
    text: 'Written by the restore check, so a handover by an agent is in the archive.',
    actor: { ...byItsOwnKey('restore-check-reader', theReader), sessionId: 'restore-check-run' },
    workspaceId: 'default',
  })
  handoverLib.writeAHandover({
    agent: theReaderRow,
    text: 'Written by the restore check, so a handover by the person is in the archive.',
    actor,
    workspaceId: 'default',
  })
  notes.push('handovers: restore-check-reader wrote one with its own key and the person wrote one, both through writeAHandover')

  // ---- quick_input_list and quick_input_asks: an ask kept as typed, the list cleared by the person, an ask refused
  //
  // Through the product's own writers, as the doors call them. The list is set and then CLEARED, so the archive holds
  // its row with no inputs, stamped by the person, and a restore into a fresh office, which migration 0272 starts with
  // /context and /compact, must carry the clear over that list (wave 13u round 21, the supervisor's 2m_VzXvGaM5-). No
  // holder runs here: the typed ask is kept as the door keeps it before it asks the holder to type.
  const quickInputs = await import('../src/server/lib/quick-inputs.ts')
  quickInputs.setTheQuickInputList(['/context'], actor)
  const theReadersAsk = (input: string) =>
    quickInputs.decideAnAsk({
      agentId: theReader,
      run: 'restore-check-run',
      terminal: 'restore-check-terminal',
      input,
      key: 'the-runs-own',
      askedBy: { kind: 'agent', id: 'restore-check-reader', provedBy: 'an-agent-key' },
    }).ask
  const typedAsk = theReadersAsk('/context')
  if (typedAsk.outcome !== 'typed') throw new Error(`the restore check asked for a quick input on the list and it was kept as ${typedAsk.outcome}`)
  quickInputs.clearTheQuickInputList(actor)
  const refusedAsk = theReadersAsk('/context')
  if (refusedAsk.outcome !== 'no-list') throw new Error(`the restore check asked for a quick input after the clear and it was kept as ${refusedAsk.outcome}`)
  notes.push(
    'quick_input_list and quick_input_asks: the person set the list through setTheQuickInputList, restore-check-reader ' +
      'asked for /context through decideAnAsk (kept as typed; no holder ran), the person cleared the list through ' +
      'clearTheQuickInputList, and the reader asked again (kept as no-list)',
  )

  // ---- what_the_grant_carries: one door this office's person changed
  //
  // Through the product's own writer, as the secretary's page calls it, so the row and its stamp are the ones the
  // door writes and a restore that dropped either is a difference.
  const grantCarries = await import('../src/server/lib/what-the-grant-carries.ts')
  grantCarries.setThisOfficesAnswer('office.set-quick-inputs', 'may-press', actor)
  notes.push(
    'what_the_grant_carries: the person changed office.set-quick-inputs to may-press through setThisOfficesAnswer',
  )

  // ---- A SECOND PROJECT, AND A RECORD MOVED INTO IT ACROSS THE BOUNDARY
  //
  // ---------------------------------------------------------------------------------------
  // WHY THIS IS NOT OPTIONAL EITHER, AND WHAT IT WOULD HAVE CAUGHT
  // ---------------------------------------------------------------------------------------
  //
  // `db:reset` + seed builds exactly ONE workspace, so until this existed the proof reported
  // "project boundaries — HELD over 1" on every run. A database with one project has no boundary in
  // it: nothing can cross what is not there. Meanwhile the real database held four projects and five
  // links joining two of them, written before `createLink` refused to make one — and
  // `npx tsx scripts/import.ts` would not restore that archive, naming each of the five. The whole
  // point of this proof is to answer "if the disk died right now, what would come back", and for the
  // real corpus the answer was NOTHING, while this ran green.
  //
  // What is built below is exactly that shape and the way out of it:
  //
  //   a second project, established through the product's own POST-equivalent;
  //   records filed IN it, so more than one project holds work and each is read on its own;
  //   a session in the first project, with a ledger row, MOVED into the second one — which is the
  //     shape all five real records had, and which carries a record's links, its whole change log
  //     and its ledger row across the boundary in one transaction;
  //   a record that has to move WITH it, so the archive holds a link whose two ends both changed
  //     project and the companion rule is what kept the archive importable.
  //
  // IF THE MOVE LEFT ONE END BEHIND, this run would fail at the import step rather than here, with
  // the importer's own refusal — which is the mechanism that was missing, and the reason the corpus
  // has to contain a move at all rather than two projects that were never connected.
  const workspaces = await import('../src/server/lib/workspaces.ts')
  const moving = await import('../src/server/lib/move.ts')
  const SECOND = 'second-project'
  workspaces.createWorkspace({
    id: SECOND,
    title: 'Second project · the boundary this proof needs',
    note:
      'Established by scripts/restore-check.ts. A restore proof over a database with one project reports ' +
      '"project boundaries — HELD over 1", which is a sentence about nothing: with one project no link can ' +
      'cross a boundary and no record can be filed behind the wrong one. This project exists so the archive ' +
      'carries two, so a record can be moved between them, and so the importer\'s cross-workspace refusal is ' +
      'a thing this run really passes rather than a thing it never reaches.',
  })

  const born = records.createRecord({
    workspaceId: SECOND,
    kind: 'note',
    title: 'Restore check · filed in the second project from the start',
    summary: 'Never moved. It is what makes "records are filed behind at least two projects" a measurement.',
    data: { body: 'Written straight into the second project, so the two are not one project and an empty label.' },
    actor,
  })

  // The pair that moves, filed in `default` and joined to each other there — which is the only way
  // the link can be made, because a link across the boundary is refused at the moment of creation.
  const movingSession = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'session',
    title: 'Restore check · a run filed in the wrong project',
    summary: 'Moved into the second project by POST /api/records/:id/workspace, with its ledger row and its log.',
    data: {
      state: 'finished',
      doing: 'standing in for the five real records that were filed without naming a workspace',
    },
    actor,
  })
  const movingNote = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'note',
    title: 'Restore check · what that run wrote',
    summary: 'Joined to the session by a link, so it is dragged across the boundary rather than left crossing it.',
    data: { body: 'If the move left this behind, the archive would hold a link the importer refuses by name.' },
    actor,
  })
  records.createLink({ fromId: movingSession.id, toId: movingNote.id, type: 'about', actor })
  // THE SAME RULE AS THE LEDGER ROW ABOVE, AND IT USED TO BE A HARD-CODED 39231. Releasing a port
  // row looks up whoever is holding that port and signals it, so a number nobody checked is a
  // stranger's process on a busy machine — the hazard `aPortNobodyIsListeningOn` was written for,
  // bypassed here. Nothing was ever observed going wrong; it is fixed because "this passes when
  // nothing else on the machine happens to hold 39231" is not a property a proof may rest on.
  const movedPort = await aPortNobodyIsListeningOn(resources)
  const movedLedger = resources.registerResource({
    workspaceId: DEFAULT_WORKSPACE,
    sessionRecordId: movingSession.id,
    type: 'port',
    key: String(movedPort),
    detail: 'a port this run never bound, registered so a ledger row crosses the boundary with its session',
    actor,
  })
  await resources.releaseResource(
    movedLedger.id,
    { actor, note: 'released before the move, so the archive carries a released row in the second project' },
    DEFAULT_WORKSPACE,
  )

  const moved = moving.moveRecordToWorkspace(
    movingSession.id,
    DEFAULT_WORKSPACE,
    { to: SECOND, also: [movingNote.id] },
    actor,
  )
  // Asserted rather than assumed, because everything this section is for depends on it having really
  // happened: a move that quietly did nothing would leave a corpus with two projects that were never
  // joined, and the comparison would hold over a question nobody asked.
  // THREE RECORDS AND TWO LINKS: the run, the note and the run's own flow run, which the office wrote beside the run
  // and which goes with it (wave 13p round 25), with the note's link and the flow run's.
  if (moved.rows.records !== 3 || moved.rows.links !== 2 || moved.rows.resources !== 1) {
    throw new Error(
      `the move carried ${JSON.stringify(moved.rows)} and this proof needs 3 records, 2 links and 1 ledger row. ` +
        'Without them the archive does not hold a boundary that was really crossed.',
    )
  }
  notes.push(
    `workspaces: "${SECOND}" established, ${born.id} filed in it, and ${movingSession.id} + ${movingNote.id} ` +
      `moved into it out of "${DEFAULT_WORKSPACE}" carrying ${moved.rows.links} link, ${moved.rows.changes} ` +
      `change rows and ${moved.rows.resources} ledger row`,
  )

  // ---- a plan, which is the writing half: a document, one line filed as work, one given hours
  //
  // BEFORE THE ANCHORS BELOW, because filing a line as work creates a record and therefore writes a
  // change row — and one of those anchors is the reader who has read everything, which would stop
  // being true the moment anything wrote after it was moved.
  //
  // EVERY SHAPE THE COMPARISON DECLARES A NEED FOR IS HERE, and each is here for a reason a restore
  // could break: a blank line is the line a line-oriented format drops, a line with trailing spaces
  // is what a format trims, a pipe table is what a Markdown reader would rewrite, a filed line is
  // the binding between the writing and the project, and an unfiled line is the ordinary case that
  // must not come back looking filed.
  const plans = await import('../src/server/lib/plans.ts')
  const written = plans.createPlan(
    {
      title: 'Restore check · ICRA submission, written out',
      body:
        '# ICRA submission\n\ntarget: September   \n\n## Must\n- [ ] baseline\n- [x] experiment design\n' +
        '- 数据采集\n\n| What | How big |\n|---|---|\n| baseline | 20h |\n\nMaybe: gaze\n',
    },
    actor,
  )
  const toFile = written.lines.find((line) => line.text === '- 数据采集')
  if (toFile === undefined) throw new Error('the plan just written has no line to file as work')
  const filed = plans.fileLineAsWork(
    written.plan.id,
    toFile.id,
    { kind: 'task', workspaceId: DEFAULT_WORKSPACE, summary: 'Filed from a plan line, which seeded this title once.' },
    actor,
  )
  const given = plans.giveLineTime(written.plan.id, toFile.id, { horizon: 'week', period: '2026-W34', plannedHours: 4 }, actor)
  // ---- and one line added after the plan was written, with the reason it was added
  //
  // Criterion P3, 16 September 2026. A change to a plan's lines keeps its reason, and that row is
  // the ONLY copy of why the plan changed: the line itself says what it says and never why it
  // arrived. So the corpus has to hold one, or the comparison for `plan_line_revisions` would pass
  // over an empty table and prove nothing about it — which is exactly the hole `work_windows` sat
  // in for a day.
  const added = plans.addLine(
    written.plan.id,
    { text: '- book the rig for the week', reason: 'The rig is shared and September is full.' },
    actor,
  )
  notes.push(
    `plan line ${added.id} was added after the plan was written, with the reason the writer gave, so the ` +
      `reasons table has a row to compare`,
  )
  notes.push(
    `plans: "${written.plan.title}" with ${written.lines.length} lines, blank lines and a table included; ` +
      `one line filed as ${filed.recordId} and given 4h in 2026-W34 (allocation ${given.allocationId}, which ` +
      `records the line it came from)`,
  )

  // ---- A REVIEW: one conversation, three comments about three different things, two agents
  //
  // ---------------------------------------------------------------------------------------
  // WHY A REVIEW AND NOT THREE UNRELATED ROWS
  // ---------------------------------------------------------------------------------------
  //
  // Three rows in three tables would make every comparison below non-vacuous and would prove almost
  // nothing. What the owner will really have is ONE REVIEW: they point at several things, write a
  // comment on each, says who each one is for, and presses Finish review once. Mole Office then writes
  // one run per recipient, all naming the same conversation.
  //
  // That shape is what makes "a restore that loses which comment went to whom" FAIL rather than
  // pass. With one recipient there is one answer to that question and losing it changes nothing
  // visible; with two, a comment that comes back under the other agent is a review that means
  // something else while every row is still present and every count still matches.
  //
  // So this writes, through the product's own doors and no others:
  //
  //   a record, a plan line and a span of text with its quote — the three shapes of context;
  //   two comments to a run Mole Office can pick up again, and one to a new agent on purpose;
  //   one dispatch, which writes one run per recipient — two runs from one human act;
  //   one of those runs claimed and answered, the other left waiting.
  //
  // BEFORE THE ANCHORS BELOW, for the reason the plan is: filing the session record writes a change
  // row in `default`, and one of those anchors is the reader who has read everything. Nothing else
  // here touches `changes` — the agent tables are not the change log and no write to them appears
  // in it, which is itself worth knowing when reading the archive.
  // Made-up restore corpus: both authored control tables need rows to make their comparison meaningful.
  client.sqlite.prepare('INSERT OR REPLACE INTO runtime_settings(name,value) VALUES (?,?)').run('MOLE_OFFICE_REPLY_REMINDER_MINUTES', '9')
  const restartAgent = client.sqlite.prepare('SELECT id FROM agents ORDER BY id LIMIT 1').get() as {id:string} | undefined
  const restartDecision = client.sqlite.prepare("SELECT id FROM records WHERE kind='decision' AND deleted_at IS NULL ORDER BY id LIMIT 1").get() as {id:string} | undefined
  if (!restartAgent || !restartDecision) throw new Error('The restore corpus has no agent or decision for its made-up restart grant.')
  client.sqlite.prepare('INSERT OR REPLACE INTO office_restart_grants(agent_id,decision_id) VALUES (?,?)').run(restartAgent.id, restartDecision.id)

  const agents = await import('../src/server/lib/agents.ts')

  // THE RECIPIENT: a run Mole Office has an id for. `stampOf` in lib/sessions.ts is the one reader of
  // that stamp, and a session it cannot read is REFUSED at dispatch by name — sending it anyway
  // would start an agent that has never heard of the work and report that as the answer. So the
  // fixture writes the stamp discovery writes, rather than a second idea of where a resume id lives.
  const recipient = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'session',
    title: 'Restore check · the run this review is addressed to',
    summary: 'Carries the discovery stamp, so Mole Office has an id for the conversation and dispatch can address it.',
    data: {
      state: 'idle',
      runtime: 'claude-code',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: 'ffff9999-0000-0000-0000-00000000ffff',
          logPath: transcriptForTheSeededRun(scratch),
          resumeCommand: 'claude --resume ffff9999-0000-0000-0000-00000000ffff',
          observedState: 'idle',
          stateReason: 'its log last grew 40 minutes ago and a process still names it',
          filesTouched: [],
          filesComplete: true,
          at: '2026-08-18 09:00:00',
        },
      },
    },
    actor,
  })

  const filedRecord = records.getRecord(filed.recordId)
  if (filedRecord === null || filedRecord.summary === null) {
    throw new Error(
      `the record filed from the plan line (${filed.recordId}) is not there or has no summary, so no comment can ` +
        'quote a span of its text and the quote would never be compared.',
    )
  }
  // A REAL SPAN OF REAL TEXT, with the offsets it really has. A quote stored against an offset
  // nobody checked would be a fixture pretending to be the thing it is testing.
  const quote = 'seeded this title once'
  const quoteAt = filedRecord.summary.indexOf(quote)
  if (quoteAt === -1) {
    throw new Error(
      `"${quote}" is not in the summary of ${filed.recordId} ("${filedRecord.summary}"), so this comment would ` +
        'store a quote that was never there.',
    )
  }
  const firstLine = written.lines[0]
  if (firstLine === undefined) throw new Error('the plan just written has no first line to comment on')

  const review = agents.createThread(
    {
      workspaceId: DEFAULT_WORKSPACE,
      title: 'Restore check · reading the calibration work again',
      mode: 'review',
    },
    actor,
  )
  const onARecord = agents.addMessage(
    review.id,
    DEFAULT_WORKSPACE,
    {
      intent: 'review',
      body: 'The evidence line says n=40 and the claim reads as settled. Say which run measured it.',
      context: { target: { kind: 'record', recordId: filed.recordId, workspaceId: DEFAULT_WORKSPACE } },
      recipient: {
        kind: 'session',
        sessionId: recipient.id,
        why: 'This run filed that record, so it is the one that knows what was measured.',
      },
    },
    actor,
  )
  const onAPlanLine = agents.addMessage(
    review.id,
    DEFAULT_WORKSPACE,
    {
      intent: 'change',
      body: 'This line is still the September heading. It needs the new date before the submission.',
      context: { target: { kind: 'planLine', planId: written.plan.id, lineId: firstLine.id } },
      recipient: {
        kind: 'session',
        sessionId: recipient.id,
        said: 'the run that has been working on the submission',
        why: 'Those words matched one run, and it is the one that wrote the plan.',
      },
    },
    actor,
  )
  const onASpanOfText = agents.addMessage(
    review.id,
    DEFAULT_WORKSPACE,
    {
      intent: 'ask',
      body: 'These words claim more than the plan line did. Rewrite them or say why they stand.',
      context: {
        target: { kind: 'record', recordId: filed.recordId, workspaceId: DEFAULT_WORKSPACE },
        span: { quote, from: quoteAt, to: quoteAt + quote.length, field: 'summary' },
      },
      recipient: {
        kind: 'new',
        said: 'somebody who has not read this yet',
        why: 'Asked for a fresh agent on purpose, so the answer is not the same run marking its own work.',
      },
    },
    actor,
  )

  // SENT BY THE PERSON'S PRESS, PROVED. Since wave 13n round 10 a dispatch to a new agent registers that agent and
  // mints its key on the person's proved press, so the dispatch door refuses an actor with no proof. This scratch
  // corpus's person is the synthetic actor above; here it is marked as proved by the person's key, the way the
  // tests send thePersonsKeyHeader(). Nothing of the live office is involved.
  const sent = agents.dispatchThread(review.id, DEFAULT_WORKSPACE, { ...actor, provedBy: 'the-person-key' })
  // ASSERTED RATHER THAN ASSUMED, because everything this section is for depends on it. One review
  // going to two agents is the whole shape; a dispatch that quietly produced one run would leave the
  // comparison holding over a question nobody asked.
  if (sent.runs.length !== 2 || sent.sent !== 3) {
    throw new Error(
      `the review dispatched ${sent.sent} comment(s) into ${sent.runs.length} run(s), and this proof needs 3 ` +
        'comments into 2 runs — one per recipient. Without two, "which comment went to whom" has one answer.',
    )
  }
  const toTheSession = sent.runs.find((r) => r.recipientSessionId === recipient.id)
  const toANewAgent = sent.runs.find((r) => r.recipientSessionId === null)
  if (toTheSession === undefined || toANewAgent === undefined) {
    throw new Error(
      'the two runs are not one to the addressed session and one to a new agent, so the corpus does not hold the ' +
        'two answers a recipient can have.',
    )
  }
  if (toTheSession.resume === null) {
    throw new Error(
      'the run addressed to a session carries no id for picking that conversation up again, so a restore could ' +
        'lose it without this proof noticing.',
    )
  }

  // ONE RUN ANSWERED AND ONE LEFT WAITING. The answered one carries a result document, a worker
  // name and every stamp; the waiting one carries null in all of them, and null there means nobody
  // has picked it up — which is the value a careless restore is most likely to fill in.
  // CLAIMED AS THE PROVED PERSON. Since wave 13n round 11 every dispatched run carries a key, and a claim reads
  // that key only for the office's key or the person's key. The same synthetic actor as the dispatch above.
  agents.claimRun(toTheSession.id, 'restore-check-worker', null, { ...actor, provedBy: 'the-person-key' })
  const answered = agents.finishRun(toTheSession.id, {
    result: {
      says: 'The claim was measured on 2026-08-12 with n=40. The evidence line is right and the run is named on it.',
      focus: { record: filed.recordId },
    },
    tookMs: 4200,
  })
  if (answered.run.state !== 'finished' || answered.run.result === null) {
    throw new Error(`the answered run came back as ${answered.run.state} with no result, so nothing was answered`)
  }
  notes.push(
    `agent_threads/messages/runs: one review "${review.title}" with 3 comments — ${onARecord.id} on a record, ` +
      `${onAPlanLine.id} on a plan line, ${onASpanOfText.id} on a quoted span of text — addressed to the run ` +
      `${recipient.id} (twice) and to a new agent (once). Finishing it wrote 2 runs: ${toTheSession.id} was ` +
      `claimed and answered, ${toANewAgent.id} is still waiting for a worker`,
  )

  // ---- reviews: one that has finished collecting and one that is still collecting
  //
  // TWO, BECAUSE THE TABLE HAS TWO SHAPES AND ONLY ONE OF THEM IS INTERESTING TO GET WRONG. A review
  // that has finished collecting stores `frozen` — the membership as it stood at that moment — and a
  // `collected_at`; one still collecting stores NULL in both. NULL there means "nobody has finished
  // collecting", which is a different fact from a review that collected nothing, and a restore that
  // wrote `[]` for either would turn one into the other with every row still present.
  //
  // THE REMARK IS WRITTEN THROUGH THE RECORD ROUTE, because a remark IS a record of kind
  // `annotation`. So the frozen membership names a real row, and a restore that lost the note would
  // leave a review saying it contained something the database does not have.
  const reviewsLib = await import('../src/server/lib/reviews.ts')
  const onTheRecord = reviewsLib.startReview(
    {
      workspaceId: DEFAULT_WORKSPACE,
      entry: { target: { kind: 'record', recordId: filed.recordId, workspaceId: DEFAULT_WORKSPACE } },
    },
    actor,
  )
  const remark = records.createRecord({
    kind: 'annotation',
    title: 'Restore check · a remark on the calibration record',
    workspaceId: DEFAULT_WORKSPACE,
    data: {
      body: 'This sentence claims more than the measurement supports. Which run measured it?',
      context: {
        target: { kind: 'record', recordId: filed.recordId, workspaceId: DEFAULT_WORKSPACE },
        span: { quote, from: quoteAt, to: quoteAt + quote.length, field: 'summary' },
      },
    },
    actor,
  })
  const collected = reviewsLib.finishCollecting(onTheRecord.review.id, DEFAULT_WORKSPACE, actor)
  if (collected.review.state !== 'collected' || !collected.review.membershipFrozen) {
    throw new Error(
      `the review ${onTheRecord.review.id} came back as ${collected.review.state} with its membership ` +
        `${collected.review.membershipFrozen ? 'written down' : 'not written down'}, so the frozen shape is not in ` +
        'this corpus and a restore of it would prove nothing.',
    )
  }
  if (!collected.members.some((m) => m.found && m.id === remark.id)) {
    throw new Error(
      `the remark ${remark.id} is not in the review that was collecting where it was written, so the frozen ` +
        'membership in this corpus is empty and nothing about it can be compared.',
    )
  }
  const stillCollecting = reviewsLib.startReview(
    // ASKED FOR AND NOT ARRIVED AT. A page names no place, so a review OF ONE PLACE cannot be
    // started from one and `startReview` refuses; a project-wide review can, and that is what a
    // review started from a page always was.
    { workspaceId: DEFAULT_WORKSPACE, entry: { target: { kind: 'page', route: '/records' } }, reach: 'global' },
    actor,
  )
  notes.push(
    `reviews: two — ${onTheRecord.review.id} started from the record ${filed.recordId}, holding the note ` +
      `${remark.id}, with its membership written down at ${collected.review.collectedAt ?? 'no moment'}; and ` +
      `${stillCollecting.review.id} started from a page, still collecting, with nothing written down`,
  )

  // ---- one marker on a comment whose words had already gone out
  //
  // WRITTEN BY THE MIGRATION THAT WRITES THEM, not by an INSERT that looks like one. Window B's
  // annotation-state step writes `annotation_words_fixed` for a comment whose own `data.state` said
  // its words had gone and which no message accounts for — and it deletes that field in the same
  // commit, so the marker is the ONLY surviving record of the fact. A corpus without one leaves that
  // comparison vacuous, which is the same as not making it.
  //
  // The old key goes in with SQL because the write door no longer takes it. That is exactly the
  // record the migration exists for: one written before the field went.
  {
    const gone = records.createRecord({
      kind: 'annotation',
      title: 'Restore check · a remark whose words had already gone out',
      workspaceId: DEFAULT_WORKSPACE,
      data: {
        body: 'Where did the 0.2 mm come from? Nothing in the report says.',
        context: {
          target: { kind: 'record', recordId: filed.recordId, workspaceId: DEFAULT_WORKSPACE },
          place: { at: 'surface' },
        },
      },
      actor,
    })
    const { sqlite } = await import('../src/server/db/client.ts')
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'sent') WHERE id = ?").run(gone.id)
    // AND A CHANGE ROW SAYS WHEN, which is where the migration finds the MOMENT the words went out.
    // It refuses to invent one — "`updated_at` is not an answer" — and it takes either of two
    // witnesses: a `changes` row naming `data.state`, or a revision whose stored data held the word.
    // THE CHANGE ROW IS THE ONE USED HERE, and deliberately: writing the revision instead would make
    // this file a writer of the revision ledger, and
    // `tests/revision-ledger-agrees-with-the-change-log.test.ts` keeps that list to four places in
    // the product for a reason that has nothing to do with this corpus.
    sqlite
      .prepare(
        'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, ' +
          "at, workspace_id) VALUES (?, ?, 'update', 'human', ?, NULL, 'data.state', 'queued', 'sent', ?, ?)",
      )
      .run(`chg-${gone.id.slice(0, 8)}`, gone.id, owner, '2026-08-18 09:41:00', DEFAULT_WORKSPACE)
    const words = await import('../src/server/db/annotation-state.ts')
    const written = words.migrateAnnotationStateActTwo(sqlite, words.readTheStoredWords(sqlite), words.countDispatch(sqlite))
    if (written.markersWritten !== 1) {
      throw new Error(
        `the annotation-state step wrote ${String(written.markersWritten)} markers into this corpus rather than 1, ` +
          'so the restore comparison for them would prove nothing.',
      )
    }
    // AND THE FIELD COMES BACK OFF, by the act that removes it, so the corpus is the shape a corpus
    // is AFTER window B rather than half way through it.
    words.migrateAnnotationStateActOne(sqlite, words.countAnnotationState(sqlite))
    notes.push(`words-fixed markers: one, on ${gone.id}, written by window B's annotation-state step`)
  }

  // ---- the implementation map, BEFORE the anchors below, because declaring a relationship
  //      appends a change row and one of those anchors is the reader who has read EVERYTHING.
  //      Writing these after it would leave that reader with six unread rows, which is the state
  //      the append-order comparison reads as the loss it is looking for.
  //
  //      A repository with a checkout, one WITHOUT, a code revision, a
  //      relationship somebody stated, a guess an agent made, and a guess a person accepted.
  //
  // SIX ROWS AND EVERY ONE OF THEM IS A CASE THE COMPARISON WOULD OTHERWISE NOT REACH. A repository
  // with no root is the state an archive restored on another machine is IN, so an export that
  // dropped a NULL root would look fine on this machine and be wrong on the next one. And the
  // acceptance is the whole point: an accepted guess and an un-accepted one differ by two columns,
  // and `authorityOf` reads them — so a restore that lost them turns ownership back into a guess
  // with nothing saying so.
  {
    const repositories = await import('../src/server/lib/repositories.ts')
    const implementation = await import('../src/server/lib/implementation.ts')
    const person = { type: 'human', id: owner, stated: true } as const
    const agent = { type: 'agent', id: 'claude-code' } as const

    const here = repositories.registerRepository({
      workspaceId: 'default',
      name: 'panelx',
      root: fileURLToPath(new URL('..', import.meta.url)),
      note: 'this checkout',
      actor: person,
    })
    const elsewhere = repositories.registerRepository({
      workspaceId: 'default',
      name: 'calibration',
      note: 'named here, and there is no checkout of it on this machine',
      actor: person,
    })
    const revision = implementation.recordRevision({
      workspaceId: 'default',
      repositoryId: here.id,
      ref: '9f3c1ab',
      label: 'R42',
      note: 'the build that ran on the arm',
      actor: person,
    })
    const module = records.listRecords({ workspaceId: 'default', kind: 'module' })[0]
    if (module === undefined) throw new Error('the corpus holds no module, so no code can be stated as its own')
    implementation.declareRelationship({
      workspaceId: 'default',
      recordId: module.id,
      repositoryId: here.id,
      pattern: 'src/server/lib',
      note: 'the write path lives here',
      revisionId: revision.id,
      actor: person,
    })
    implementation.declareRelationship({
      workspaceId: 'default',
      recordId: module.id,
      repositoryId: elsewhere.id,
      pattern: 'calib/intrinsics.yaml',
      proposing: true,
      actor: agent,
    })
    const toAccept = implementation.declareRelationship({
      workspaceId: 'default',
      recordId: module.id,
      repositoryId: here.id,
      pattern: 'src/shared/paths.ts',
      proposing: true,
      actor: agent,
    })
    implementation.acceptGuess(toAccept.row.id, 'default', person)
    notes.push(
      `implementation map: 2 repositories (one with no checkout here), 1 code revision, 3 relationships — one ` +
        `stated, one an un-accepted guess, one a guess ${person.id} accepted`,
    )
  }

  // ---- revalidations: one restriction resolved, and the work it reached judged one record at a time
  //
  // ---------------------------------------------------------------------------------------
  // WHY A WHOLE RESTRICTION AND NOT THREE ROWS
  // ---------------------------------------------------------------------------------------
  //
  // This table was the last name on NOT_IN_THIS_PROOF, excused because nothing wrote it. Wave 8
  // built the two writers, so the excuse became false. Rows typed straight into SQL would satisfy
  // the comparison and prove nothing, because what a restore has to bring back is not a row shape:
  // it is the PATH the restriction reached each record by, frozen as the graph stood at that moment,
  // and somebody's judgement about their own work.
  //
  // So this builds the real act, through `createLink` and `recordJudgement` and no other door:
  //
  //   a placeholder saying the wrist camera has never been calibrated, `stops_final`;
  //   the task it is declared about, and a claim that MEASURES that task — so the restriction
  //     reaches one record at distance 0 with no path and one at distance 1 with a real one;
  //   a `resolves` link, which writes both rows inside the link's own transaction;
  //   one of them judged `not_affected` WITH A REASON, which is the shape that carries `note`,
  //     `decided_by` and `decided_at` — and the other left waiting, so the two are told apart;
  //   a second claim linked AFTER the resolution and then judged, which is the only way a row with
  //     `written_by = 'judgement'` is made. Its path is the graph at the moment of the judgement,
  //     which is a different moment from the resolution — the distinction the column exists for.
  const revalidations = await import('../src/server/lib/revalidations.ts')
  const uncalibrated = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'placeholder',
    title: 'Restore check · the wrist camera intrinsics were never calibrated',
    summary: 'A deliberate unresolved slot, so this proof has a restriction that really reached work.',
    data: {
      what: "The wrist camera's intrinsics have never been measured on this camera.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — read off the sensor data sheet',
      resolved_when: 'A checkerboard calibration run on this wrist camera, with the numbers written down.',
      allowed_uses: ['pipeline plumbing', 'shape and interface testing'],
      disallowed_claims: ['any millimetre-level accuracy figure', 'production deployment validation'],
      severity: 'stops_final',
    },
    actor,
  })
  const restrictedTask = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'task',
    title: 'Restore check · reach the cube with the wrist camera guiding',
    summary: 'The declared scope of the restriction above. It is the row written at distance 0, with no path.',
    data: { state: 'doing', command: 'make reach-with-stand-in-intrinsics' },
    actor,
  })
  const restrictedClaim = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'claim',
    title: 'Restore check · the reach lands within 4 mm of the target',
    summary: 'Measured with the stand-in intrinsics, so the restriction reaches it one link away.',
    data: { state: 'measured', evidence: ['n=40 reaches, median 3.7 mm'] },
    actor,
  })
  records.createLink({ fromId: uncalibrated.id, toId: restrictedTask.id, type: 'about', actor })
  records.createLink({ fromId: restrictedClaim.id, toId: restrictedTask.id, type: 'measures', actor })

  const calibrated = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'claim',
    title: 'Restore check · the wrist camera has been calibrated',
    summary: 'What answers the placeholder. The `resolves` link out of it is what writes the rows.',
    data: { state: 'measured', evidence: ['checkerboard, 30 views, reprojection error 0.21 px'] },
    actor,
  })
  const resolution = records.createLink({ fromId: calibrated.id, toId: uncalibrated.id, type: 'resolves', actor })
  // Asserted rather than assumed. A resolution that quietly wrote nothing would leave this whole
  // section building records and no rows, and the comparison would report that it held over zero.
  if (resolution.revalidation === undefined || resolution.revalidation.written !== 2) {
    throw new Error(
      `resolving the placeholder wrote ${JSON.stringify(resolution.revalidation)} and this proof needs 2 rows — ` +
        'the declared scope at distance 0 and the claim that measures it at distance 1. Without both, the ' +
        'comparison runs over one shape and reports that it held.',
    )
  }
  revalidations.recordJudgement({
    restrictionId: uncalibrated.id,
    recordId: restrictedClaim.id,
    state: 'not_affected',
    note: 'The 4 mm figure is a repeatability number and never used the intrinsics, so recalibrating cannot move it.',
    workspaceId: DEFAULT_WORKSPACE,
    actor,
  })

  // THE ROW A JUDGEMENT MAKES, which no resolution wrote. This claim did not exist when the
  // placeholder was resolved; it measures the same task, so the restriction reaches it now.
  const laterClaim = records.createRecord({
    workspaceId: DEFAULT_WORKSPACE,
    kind: 'claim',
    title: 'Restore check · the reach is repeatable across ten sessions',
    summary: 'Written after the resolution, so its row is made by the judgement rather than by the resolution.',
    data: { state: 'measured', evidence: ['ten sessions, spread 1.1 mm'] },
    actor,
  })
  records.createLink({ fromId: laterClaim.id, toId: restrictedTask.id, type: 'measures', actor })
  const later = revalidations.recordJudgement({
    restrictionId: uncalibrated.id,
    recordId: laterClaim.id,
    state: 'checked',
    workspaceId: DEFAULT_WORKSPACE,
    actor,
  })
  if (!later.created || later.row.writtenBy !== 'judgement') {
    throw new Error(
      `judging ${laterClaim.id} was expected to CREATE a row written by the judgement and it returned ` +
        `${JSON.stringify({ created: later.created, writtenBy: later.row.writtenBy })}. Without it, ` +
        '`written_by` has one value in this corpus and a restore that flattened the two would hold.',
    )
  }
  notes.push(
    `revalidations: "${uncalibrated.title}" resolved by ${calibrated.id} — 2 rows written by the resolution ` +
      `(${restrictedTask.id} at distance 0 with no path, ${restrictedClaim.id} at distance 1 with one), ` +
      `${restrictedClaim.id} judged not_affected with a reason, ${restrictedTask.id} left waiting, and ` +
      `${laterClaim.id} judged checked AFTER the resolution, which is the one row written_by a judgement`,
  )

  // ---- folder_readings, BEFORE the anchors below, because accepting a piece writes a record and
  //      that appends a change row — and one of those anchors is the reader who has read
  //      everything, which would stop being true.
  //
  //      one reading of somebody else's folder, with a piece already decided.
  //
  // Written through `fileAFolderReading`, which is what POST /api/import/draft calls. It matters
  // that one piece is ACCEPTED and carries the record id it became: a restore that brought the
  // pieces back with their decisions gone would put a person back in front of choices they had
  // already made, and there is nowhere else in the database those decisions are written down.
  const folderLib = await import('../src/server/lib/folderreading.ts')
  const { nowStamp } = await import('@shared/time.ts')
  const reading = folderLib.fileAFolderReading({
    workspaceId: 'default',
    actorId: 'claude-code/the-restore-proof',
    actorKind: 'agent',
    folder: '/somewhere/a-folder-somebody-else-keeps',
    note: 'Read so that a restore has a reading to bring back.',
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
      {
        kind: 'note',
        title: 'A second thing the folder says',
        summary: null,
        data: {},
        from: ['GUIDE.md', 'run.py'],
        quote: 'Run it with python run.py.',
      },
    ],
  })
  const decided = (reading.pieces as { id: string; state: string; recordId: string | null; decidedAt: string | null; decidedBy: string | null; title: string; kind: string }[])[0]
  if (decided === undefined) throw new Error('the folder reading was stored with no pieces, so nothing can be decided')
  const madeFromIt = records.createRecord({
    kind: 'note',
    title: decided.title,
    workspaceId: 'default',
    actor,
    data: { source: `${reading.folder} — accepted from folder reading ${reading.id}` },
  })
  decided.state = 'accepted'
  decided.recordId = madeFromIt.id
  decided.decidedAt = nowStamp()
  decided.decidedBy = owner
  const { folderReadings } = await import('../src/server/db/schema.ts')
  const drizzle = await import('drizzle-orm')
  client.db
    .update(folderReadings)
    .set({ pieces: reading.pieces, updatedAt: nowStamp() })
    .where(drizzle.eq(folderReadings.id, reading.id))
    .run()
  notes.push(
    `folder_readings: one reading of ${reading.folder} with two pieces, one of them accepted into the record ` +
      `${madeFromIt.id}. Written through fileAFolderReading, which is what POST /api/import/draft calls`,
  )

  // ---- counter_rows: one counter that counted, fired once and had its next firing held back
  //
  // BEFORE THE ANCHORS BELOW, for the reason the folder reading is: a firing files a task, which is
  // a record, which appends a change row — and one of those anchors is the reader who has read
  // everything, which would stop being true the moment anything wrote after it was moved.
  //
  // THROUGH THE COUNTER'S OWN DOORS AND NO OTHERS, because a counter is written only that way and
  // rows typed into SQL would prove the format and not the product. The shape is chosen so that all
  // three kinds of row are in the corpus: two additions take it to its trigger and it FIRES, filing a
  // task and writing what that answered; two more take it there again inside its own limit, and that
  // firing is HELD BACK with the reason. A restore that flattened a held-back row into a firing, or
  // emptied an answer, is then a difference rather than a pass.
  //
  // THE EVENT COLUMNS ARE EMPTY IN THIS CORPUS and that is said rather than hidden: an addition made
  // by a person names no office event, and nothing here makes a landing, finishes a run in a pipeline
  // or writes into a followed group. What a restore could lose about those three columns is the same
  // thing it could lose about any other column of the row, and the rows are compared whole.
  const counters = await import('../src/server/lib/counters.ts')
  const counted = counters.makeACounter({
    workspaceId: DEFAULT_WORKSPACE,
    said: {
      title: 'Restore check · gripper trials since the last review',
      counts: 'Trials run on the gripper since somebody last looked at the numbers.',
      amountIs: 'grams of slip measured in each trial',
      triggers: [{ kind: 'count', n: 2 }],
      action: { kind: 'task', title: 'Restore check · look at the gripper numbers' },
    },
    actor,
  })
  const addOne = (because: string, amount: number): void => {
    counters.addToACounter({ workspaceId: DEFAULT_WORKSPACE, id: counted.id, said: { by: 1, amount, because }, actor })
  }
  addOne('The first trial of the morning, on the reprinted jaw.', 3)
  addOne('The second trial, same jaw, heavier load.', 5)
  addOne('A third trial after lunch.', 2)
  addOne('A fourth trial, which takes it to the trigger again inside its own limit.', 4)
  const ledger = counters.readOneCounter({ workspaceId: DEFAULT_WORKSPACE, id: counted.id })
  const kinds = new Set(ledger.rows.map((row) => row.what))
  if (!kinds.has('addition') || !kinds.has('firing') || !kinds.has('held back')) {
    throw new Error(
      `the counter corpus was meant to hold an addition, a firing and a held-back firing and it holds ` +
        `${[...kinds].join(', ') || 'nothing'}. Without all three the comparison passes over rows it never sees.`,
    )
  }
  notes.push(
    `counter_rows: the counter ${counted.id} with ${String(ledger.rows.length)} rows — four additions, one ` +
      `firing that filed a task, and one firing held back by its own limit with the reason`,
  )

  // ---- the plan: allocations across TWO projects, two horizons, and one with no hours stated
  //
  // ACROSS TWO PROJECTS ON PURPOSE. A plan that only ever named work in one would not be testing
  // the thing that makes planning person-level rather than workspace-owned, and the comparison
  // declares that as a corpus need so a future run cannot quietly stop testing it.
  //
  // ONE ALLOCATION LEAVES ITS HOURS UNSTATED. Null means nobody said how long, which is a different
  // fact from zero, and it is the value a careless restore is most likely to flatten — a row count
  // would still match while every total silently changed meaning.
  const planning = await import('../src/server/lib/planning.ts')
  const here = records
    .listRecords({ workspaceId: DEFAULT_WORKSPACE })
    .find((r) => (planning.ALLOCATABLE_KINDS as readonly string[]).includes(r.kind))
  if (here === undefined) {
    throw new Error(
      `the corpus holds no allocatable work in "${DEFAULT_WORKSPACE}", so no plan can be built against it`,
    )
  }
  // The second project's own work, CREATED here rather than looked for: everything it holds so far
  // is a note and a moved session, and neither is a kind a plan may give time to. This is also the
  // realistic shape — personal commitments live as ordinary records in their own project and
  // consume the same capacity as everything else.
  const elsewhere = records.createRecord({
    workspaceId: SECOND,
    kind: 'task',
    title: 'Restore check · work in the second project, so the plan spans two',
    summary: 'A plan is person-level. This is what makes that a measurement rather than a claim.',
    data: { state: 'todo', effort_hours: 4 },
    actor,
  })
  const week = planning.createAllocation(
    { horizon: 'week', period: '2026-W33', recordId: here.id, plannedHours: 6, note: 'the week this was written' },
    actor,
  )
  const day = planning.createAllocation(
    { horizon: 'day', period: '2026-08-12', recordId: here.id, plannedHours: 2.5 },
    actor,
  )
  const across = planning.createAllocation(
    // No hours: somebody committed to the work this week without saying how long for.
    { horizon: 'week', period: '2026-W33', recordId: elsewhere.id },
    actor,
  )
  planning.patchAllocation(day.id, { state: 'done', actualHours: 3 }, actor)
  planning.setCapacity('week', '2026-W33', 30, 'three teaching days', actor)
  planning.createRecurrence(
    { recordId: here.id, every: 'weekdays', days: '1,3,5', hoursEach: 0.5 },
    actor,
  )
  // A DRAFT WITH REAL SHAPE IN IT: blank lines, a list, a colon line and Chinese. A line-oriented
  // archive format that re-wrapped or trimmed any of it would change what somebody wrote, and the
  // comparison of plan lines below is over each line character for character.
  //
  // THE DRAFT IS A PLAN NOW, AND IT GETS THERE THE WAY THE OWNER'S DID: through migration 0196's own step, run on
  // a table built as 0008 built it. So the plan that comes out carries `moved_from_draft` and lines stamped by the
  // move, and the comparison of plans below proves a restore keeps both.
  {
    const move = await import('../src/server/db/drafts-into-plans-migration.ts')
    client.sqlite.exec(readFileSync(join(REPO_ROOT, move.THE_FILE_THAT_MADE_THE_DRAFTS_TABLE), 'utf8'))
    client.sqlite
      .prepare('INSERT INTO planning_drafts (id, title, body, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        'draft-icra',
        'ICRA submission — rough',
        'ICRA submission\ntarget: September\n\nMust\n- baseline\n- experiment design\n- 数据采集\n\n' +
          'Maybe\n- gaze\n- personalization\n',
        '2026-08-10 09:00:00',
        '2026-08-11 17:30:00',
        `${actor.type}:${actor.id}`,
      )
    const moved = move.moveDraftsIntoPlans(client.sqlite)
    if (moved.moved.length !== 1 || !moved.tableDropped) {
      throw new Error(`The draft fixture did not become one plan: ${move.describeTheDraftMove(moved)}`)
    }
  }
  planning.setCapacity('day', '2026-08-12', 6, null, actor)

  // ---- planning_intents: what somebody wrote about time, in all three states it can be in
  //
  // ALL THREE, ON PURPOSE, because they are three different facts and a restore can turn any one of
  // them into another. `kept` means the words are stored and Mole Office read nothing from them;
  // `offered` means it read something and a person has not accepted it; `committed` means it became
  // an allocation, and committed is the only state that is in any total.
  //
  // ONE OF THEM NAMES A PLAN LINE AND NO RECORD. That is the ordinary case the table was built for:
  // somebody writes time against a line before the line is filed as work, so there is nothing yet
  // for the hours to point at. A restore that dropped `planLineId` would leave those words attached
  // to nothing.
  //
  // THE WORDS THEMSELVES ARE WHAT IS PROVED. `said` is verbatim and includes non-ASCII text and
  // punctuation, so a format that re-encoded or trimmed it would be caught.
  const unfiledLine = written.lines.find((line) => line.text === 'Maybe: gaze')
  if (unfiledLine === undefined) {
    throw new Error('the plan just written has no unfiled line, so no intent can be written against one')
  }
  const keptWords = planning.createIntent(
    // No period is read from these words, and none is invented. That null is the value this whole
    // comparison watches hardest.
    { said: 'sometime next week, if 标定 is done', recordId: here.id },
    actor,
  )
  if (keptWords.intent.period !== null || keptWords.intent.state !== 'kept') {
    throw new Error(
      `"${keptWords.intent.said}" was read as ${String(keptWords.intent.period)} in state ` +
        `${keptWords.intent.state}, and this corpus needs it kept with no period. Without that, the ` +
        'restore proof never compares a null reading.',
    )
  }
  const onALine = planning.createIntent(
    { said: 'half a day on this, once the camera is back', planLineId: unfiledLine.id },
    actor,
  )
  const offered = planning.createIntent(
    // The caller speaks the canonical form, which is allowed and is never the requirement. It is
    // what makes this row `offered` rather than `kept`: there is a reading here to accept.
    { said: '15h in the week after the deadline', recordId: here.id, period: '2026-W36', hours: 15 },
    actor,
  )
  const toCommit = planning.createIntent(
    { said: 'six hours the week after next', recordId: here.id, period: '2026-W35', hours: 6 },
    actor,
  )
  const committed = planning.commitIntent(toCommit.intent.id, actor)
  notes.push(
    `planning_intents: 4 written — one kept with no period read ("${keptWords.intent.said}"), one ` +
      `(${onALine.intent.id}) on plan line ${unfiledLine.id} about no record at all, one offered for ` +
      `${String(offered.intent.period)}, and one committed into ${committed.allocation.period} as ` +
      `allocation ${committed.allocation.id}`,
  )

  // ---- work_windows: when somebody means to work, in the shapes a restore gets wrong
  //
  // FOUR OF THEM, AND EACH IS A DIFFERENT SHAPE THE COMPARISON NEEDS.
  //
  // One runs across a week boundary — Thursday to the following Wednesday — because that span is the
  // reason this table has two date columns instead of one period key, and a corpus of same-week
  // windows would never test it.
  //
  // One is a single day. Both days are INSIDE a window, so a format that read the end date as
  // exclusive comes back wrong for a one-day window in a way a multi-day one can hide.
  //
  // One carries a note and the rest do not, so null is compared as null and the words in a note are
  // compared as words.
  //
  // One is `done` and one is `dropped`. A dropped span did not happen, which is a different fact from
  // one nobody planned, and nothing else in this database counts windows — so a restore that flattened
  // the three states would change what a person's weeks say with every row count still matching.
  const windows = await import('../src/server/lib/windows.ts')
  const acrossWeeks = windows.createWindow(
    { recordId: here.id, startsOn: '2026-08-13', endsOn: '2026-08-19', note: 'Pot slips above 12N; recalibrate the clamp before the next run.' },
    actor,
  )
  const oneDay = windows.createWindow({ recordId: here.id, startsOn: '2026-08-24', endsOn: '2026-08-24' }, actor)
  const finished = windows.createWindow({ recordId: elsewhere.id, startsOn: '2026-08-10', endsOn: '2026-08-11' }, actor)
  const missed = windows.createWindow({ recordId: elsewhere.id, startsOn: '2026-08-17', endsOn: '2026-08-18' }, actor)
  windows.patchWindow(finished.id, { state: 'done' }, actor)
  windows.patchWindow(missed.id, { state: 'dropped' }, actor)
  notes.push(
    `work_windows: 4 placed — ${acrossWeeks.id} runs 2026-08-13 to 2026-08-19 across a week boundary and ` +
      `carries a note, ${oneDay.id} is a single day, ${finished.id} is done and ${missed.id} is ` +
      `dropped. None of them carries hours, and none of them is in any total`,
  )

  notes.push(
    `allocations: ${week.plannedHours}h on "${here.title}" in 2026-W33 and ${day.plannedHours}h on the day ` +
      `(completed, 3h actually spent), plus "${elsewhere.title}" in ${elsewhere.workspaceId} with no hours ` +
      `stated (${across.id}) — a plan across two projects, which is what makes it person-level. ` +
      `planning_capacity: 30h in the week, 6h in the day`,
  )

  // ---- file_observations, through the product's OWN writer for this table
  //
  // `appendFileObservations` is what a rebuild calls, inside the transaction that replaces the
  // index, and it is called here with what a scan saw rather than with SQL. A REBUILD ITSELF IS NOT
  // RUN, and that is deliberate: a rebuild would also replace the three DERIVED index tables with a
  // description of whatever directory this proof happened to point it at, which is a fact about this
  // machine rather than about the corpus — and the derived layer is excluded from an archive for
  // exactly that reason.
  //
  // THREE ROWS AND NOT ONE, because the three things a restore could quietly lose are different:
  // a content hash (which is what makes *changed* exact), a `removed` row (which has no hash at all
  // and must not gain one), and a first-scan row (which a drift read must never read as a change).
  const workdomain = await import('../src/server/lib/workdomain.ts')
  const firstScan = workdomain.appendFileObservations({
    workspaceId: 'default',
    repositoryId: null,
    seenAt: '2026-08-09 09:00:00',
    report: { firstScan: true, previousBuiltAt: null, added: ['src/shared/time.ts'], removed: [], changed: [], unchanged: 0 },
    hashes: new Map([['src/shared/time.ts', 'a'.repeat(64)]]),
  })
  const laterScan = workdomain.appendFileObservations({
    workspaceId: 'default',
    repositoryId: null,
    seenAt: '2026-08-10 09:00:00',
    report: {
      firstScan: false,
      previousBuiltAt: '2026-08-09 09:00:00',
      added: [],
      removed: ['src/shared/gone.ts'],
      changed: [{ path: 'src/shared/time.ts', what: 'contents changed, same size and shape' }],
      unchanged: 0,
    },
    hashes: new Map([['src/shared/time.ts', 'b'.repeat(64)]]),
  })
  notes.push(
    `file_observations: ${String(firstScan.rows + laterScan.rows)} observations over two scans — a first scan ` +
      `flagged as one, a content change whose size did not move, and a removal with no hash. Written through ` +
      `appendFileObservations, which is what a rebuild calls`,
  )

  // ---- worlds: the office, with a world that is alive and a world that has died
  //
  // WRITTEN THROUGH `registerWorldHere` AND `closeWorldHere`, which is what a server start and a
  // server stop call. Two rows, because a dead world is what carries `died_at` and `died_because`,
  // and a proof over live rows alone would round-trip two columns that are always null.
  const office = await import('../src/server/lib/office.ts')
  const home = office.registerWorldHere({
    name: 'my world',
    kind: 'home',
    startedBy: thePerson,
    checkout: '/srv/mole-office/checkout',
    head: '905d1df',
    databaseIdentity: 'a'.repeat(16),
    // NOT THE DECLARED ADDRESS. This is a fixture, and a port a fixture spells is a second place a
    // Mole Office port lives — which tests/one-configuration-source.test.ts refuses by name.
    address: 'http://127.0.0.1:41100',
    addressForOtherMachines: null,
    standing: 'canonical',
    parentWorld: null,
    installation: 'the-installation-this-corpus-belongs-to',
  })
  const gone = office.registerWorldHere({
    name: "builder-au's citizens",
    kind: 'agent-made',
    startedBy: { kind: 'agent', id: 'builder-au' },
    checkout: '/srv/mole-office/citizens',
    head: '91ad217',
    databaseIdentity: 'b'.repeat(16),
    address: 'http://127.0.0.1:41101',
    addressForOtherMachines: null,
    standing: 'scratch',
    parentWorld: home.id,
    installation: 'the-installation-this-corpus-belongs-to',
  })
  office.closeWorldHere(gone.id, 'the supervisor stopped its server')
  // AND TWO VISITS, one open and one ended, so both states of `until` round-trip.
  const visitsLib = await import('../src/server/lib/visits.ts')
  const openVisit = visitsLib.registerVisitHere({
    visitor: thePerson,
    fromWorld: 'a'.repeat(16),
    toWorld: 'b'.repeat(16),
    why: 'reading what the agent built',
  })
  const endedVisit = visitsLib.registerVisitHere({
    visitor: { kind: 'agent', id: 'builder-au' },
    fromWorld: 'b'.repeat(16),
    toWorld: 'a'.repeat(16),
    why: 'filing what it found',
  })
  visitsLib.endVisitHere(endedVisit.id)
  notes.push(
    `visits: two — ${openVisit.id}, still open, and ${endedVisit.id}, ended. Written through registerVisitHere ` +
      'and endVisitHere, which is what entering and returning call',
  )
  /**
   * AND TWO VISITING AGENTS' CREDENTIALS, one still waiting for the person and one confirmed and used, so
   * every state of `standing`, `confirmed_*` and `ended_*` round-trips — and so the request rows
   * under one of them do, including a mismatch, which is the evidence the person's supervision is made of.
   *
   * THROUGH THE PRODUCT'S OWN WRITERS. `issueACredential`, `confirmACredential` and
   * `recordARequestUnder` are what the Embassy and the credential gate call, so a restore is proved
   * against rows the product really writes rather than against rows this file invented.
   */
  const visitorsLib = await import('../src/server/lib/visitors.ts')
  const waiting = visitorsLib.issueACredential({
    handle: 'a-worker-on-another-machine',
    name: 'A worker on another machine',
    role: 'worker',
    world: null,
    machine: 'a-machine.example',
    machineHow: 'an address',
    facts: {
      conversationPath: '/transcripts/another-machine/4f10',
      startDirectory: '/work/another-machine',
      runtime: 'claude-code',
      sessionRecord: 'sess-visitor-1',
    },
  })
  const working = visitorsLib.issueACredential({
    handle: 'a-second-worker-on-another-machine',
    name: 'A second worker on another machine',
    role: 'worker',
    world: null,
    machine: 'a-machine.example',
    machineHow: 'an address',
    facts: {
      conversationPath: '/transcripts/another-machine/9b22',
      startDirectory: '/work/another-machine-two',
      runtime: 'claude-code',
      sessionRecord: 'sess-visitor-2',
    },
  })
  visitorsLib.confirmACredential(working.credential.id, thePerson)
  visitorsLib.recordARequestUnder(working.credential.id, {
    method: 'GET',
    route: '/api/agent/runs',
    operation: 'agent.runs',
    wrote: false,
    refusedBecause: null,
    mismatch: [],
    fromATrustedMachine: null,
  })
  visitorsLib.recordARequestUnder(working.credential.id, {
    method: 'GET',
    route: '/api/health',
    operation: 'runtime.health',
    wrote: false,
    refusedBecause: null,
    mismatch: [
      {
        said: 'the directory the run started in',
        issued: '/work/another-machine-two',
        sent: '/tmp/somewhere-else',
      },
    ],
    fromATrustedMachine: null,
  })

  /**
   * AND THE MACHINES THIS OFFICE TRUSTS. Criterion P73.
   *
   * Two rows, because the two states this table has are different facts and a restore that carried
   * only the live one would lose the record of who the office once let in. Written through
   * `trustThisMachine` and `stopTrustingThisMachine`, which are what the world's page presses call.
   */
  const trustedLib = await import('../src/server/lib/trustedmachines.ts')
  trustedLib.trustThisMachine('a-machine.example', thePerson, 'a press', 'the other box', null)
  const dropped = trustedLib.trustThisMachine('an-old-machine.example', thePerson, 'a press', null, null)
  trustedLib.stopTrustingThisMachine(dropped.id, thePerson, 'it is off for good')

  notes.push(
    `visitor_credentials: two — ${waiting.credential.id}, still waiting to be confirmed, and ` +
      `${working.credential.id}, confirmed and used. visitor_requests: two under the second, one of them a ` +
      'mismatch naming both facts. Written through issueACredential, confirmACredential and ' +
      'recordARequestUnder, which is what the Embassy and the credential gate call',
  )
  notes.push(
    `worlds: two — the home world ${home.id}, alive, and ${gone.id}, an agent-made world that died with its ` +
      'reason. Written through registerWorldHere and closeWorldHere, which is what a server start and a server ' +
      'stop call',
  )

  // ---- readiness_checklists and readiness_signatures: one checklist cancelled, and one still waiting with a
  //      signature taken back
  //
  // Through the product's own writers, as the doors call them, and so that NEITHER EVER RUNS: opening an install
  // terminal is not something a restore proof may do. Installing reaches everyone, so every secretary and the person
  // must sign. This checks that restore-check-secretary is among its signers before either is raised, because with no
  // secretary the person's signature alone would run it.
  //
  // The first: the person raises "install Codex", which writes the person's signature, and then cancels it, which
  // fills `closed_at`, `closed_by_*` and `outcome`.
  //
  // The second: the person raises "install Claude Code", and then takes the signature back, which fills
  // `withdrawn_at`. It cannot run while restore-check-secretary has not signed.
  const readiness = await import('../src/server/lib/readiness.ts')
  const everyone = readiness.theSignersFor({ level: 'everyone' })
  if (!everyone.some((one) => one.kind === 'agent' && one.id === theSecretary)) {
    throw new Error(
      `the office names ${JSON.stringify(everyone)} as everyone who signs, without restore-check-secretary, so the ` +
        "person's signature could run an install. Nothing was raised.",
    )
  }
  const toBeCancelled = await readiness.raiseOrSign({
    operation: 'harnesses.install',
    inputs: { harnesses: ['codex'] },
    because: 'Raised by the restore check, so a cancelled readiness checklist is in the archive.',
    minutes: null,
    actor,
    workspaceId: 'default',
  })
  if (toBeCancelled.ran || toBeCancelled.checklist === null) throw new Error('the restore check raised a checklist to install an agent tool and it ran')
  const cancelled = readiness.cancelAChecklist(toBeCancelled.checklist.id, actor)
  if (cancelled.state !== 'cancelled') throw new Error(`the restore check cancelled a readiness checklist and it came back ${cancelled.state}`)
  const toBeWithdrawn = await readiness.raiseOrSign({
    operation: 'harnesses.install',
    inputs: { harnesses: ['claude-code'] },
    because: 'Raised by the restore check, so a signature taken back is in the archive.',
    minutes: 7 * 24 * 60,
    actor,
    workspaceId: 'default',
  })
  if (toBeWithdrawn.ran || toBeWithdrawn.checklist === null) throw new Error('the restore check raised a checklist to install an agent tool and it ran')
  const withdrawn = readiness.withdrawASignature(toBeWithdrawn.checklist.id, actor)
  if (withdrawn.state !== 'waiting') throw new Error(`the restore check took back a signature and the checklist came back ${withdrawn.state}`)
  notes.push(
    'readiness_checklists: two through raiseOrSign, both raised by the person to install an agent tool — one the ' +
      'person cancelled through cancelAChecklist, and one that still waits for restore-check-secretary. ' +
      'readiness_signatures: the person\'s signature on each, the second taken back through withdrawASignature',
  )

  // A signed receipt, a refused package, and a package still waiting, through the real writers.
  const packages = await import('../src/server/lib/signing-packages.ts')
  const packageBody = { forAgent: agentA, task: 'Keep the restore proof copies', items: [
    { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 12 }, why: 'A receipt must return unchanged.' },
  ] }
  const secretaryActor = byItsOwnKey('restore-check-secretary', theSecretary)
  const toSign = packages.bringAPackage({ body: packageBody, actor: secretaryActor, workspaceId: 'default' })
  packages.signAPackage(toSign.id, [], actor)
  const toRefuse = packages.bringAPackage({ body: packageBody, actor: secretaryActor, workspaceId: 'default' })
  packages.refuseAPackage(toRefuse.id, actor)
  packages.bringAPackage({ body: packageBody, actor: secretaryActor, workspaceId: 'default' })
  notes.push('signing_packages and signing_package_items: signed, refused and waiting packages through their real writers, with a done item and its receipt.')

  // A signature held for its named agent, through the real carry-out door. Non-null values are
  // needed here: a comparison over nulls would not prove the signed item or its run survives.
  const heldAsk = records.createRecord({ workspaceId: 'default', kind: 'role_request',
    title: 'Restore check · a signed refusal at the door', actor,
    data: { asker: { kind: 'agent', id: agentA }, answersTo: thePerson, asking: 'supervisor', because: 'The restore comparison needs an attributed signed answer.' },
  })
  const heldRun = records.createRecord({ workspaceId: 'default', kind: 'session',
    title: 'Restore check · a fixture run carrying a signed item', actor,
    data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: 'restore-check-a' },
  })
  const heldPackage = packages.bringAPackage({ workspaceId: 'default', actor: secretaryActor, body: {
    forAgent: agentA, task: 'Carry out the signed restore-proof items', items: [
      { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 13 }, why: 'The signed item must survive the archive.', carriedOut: 'by-the-named-agent' },
      { act: 'answer-an-ask-at-the-door', inputs: { request: heldAsk.id, answer: 'refuse' }, why: 'Both ledgers must carry the signed item.', carriedOut: 'by-the-named-agent' },
    ],
  } })
  packages.signAPackage(heldPackage.id, [], actor)
  const carrying = { ...byItsOwnKey('restore-check-a', agentA), sessionId: heldRun.id }
  for (const item of heldPackage.items) packages.carryOutAHeldItem(heldPackage.id, item.id, carrying)
  const toTakeBack = packages.bringAPackage({ workspaceId: 'default', actor: secretaryActor, body: {
    ...packageBody, items: [{ ...packageBody.items[0], carriedOut: 'by-the-named-agent' }],
  } })
  packages.signAPackage(toTakeBack.id, [], actor)
  packages.takeBackAHold(toTakeBack.id, actor)
  notes.push('held signing items: a setting and a door answer carried out by the named agent’s fixture run, both ledgers naming the signed item, and a separate hold taken back before use.')

  const pixel = await import('../src/server/lib/pixel-office.ts')
  const pixelChoices = await import('../src/shared/pixel-office.ts')
  pixel.changePixelAppearance(agentA, pixelChoices.generatePixelAppearance('restore-check-pixel'), actor)
  pixel.changePixelSettings({ motion: false }, actor)
  // Nothing in the product writes saved map positions since wave 13y round 119 deleted the older built-in map, but a
  // restore must keep the rows an older office saved. So one is written here, laid out by the shared reconciler.
  const forest = await import('../src/shared/forest-map.ts')
  const mapSettings = { seed: 'restore-check-scene', grouping: 'shared' } as const
  const laidOut = forest.reconcileForestMap(null, [{ id: agentA, name: 'restore-check-a', zone: 'team', team: null, projects: [{ id: 'default', name: 'default' }] }], mapSettings)
  client.sqlite.prepare('INSERT INTO office_map_layouts (configuration_key, data, updated_at) VALUES (?, ?, ?)').run(forest.forestConfigurationKey(mapSettings), JSON.stringify(laidOut.state), nowStamp())
  notes.push('pixel office: one chosen mole appearance and the office map kept still, through the product writers, and one saved map layout an older office would have written.')

  /**
   * AND ONE MODEL SET ON THE SETTINGS PAGE, criterion U2, migration 0176.
   *
   * The store is a singleton row, so it has exactly one row to lose, and the fixture writes it
   * through the product's own `setTheRunModels`.
   */
  const runModelStore = await import('../src/server/lib/run-models.ts')
  runModelStore.setTheRunModels({ places: { conversation: { runtime: 'claude-code', model: 'the-restore-fixture-model' } } }, actor)
  notes.push('the model each run uses: one choice for a run answering a message, written through setTheRunModels.')

  /**
   * AND ONE CASTING, migration 0190, with probability from migration 0268, and a label from migration 0349 that it carries.
   * Written through the product's own `addACastingLabel` and `addACasting`, which also write their history rows, so all
   * four tables have a row to lose. The model and the label are made up for the proof and name no decision. The two
   * tables of migration 0189 are no longer written by anything, so they stay empty here.
   */
  const castingStore = await import('../src/server/lib/casting.ts')
  const labelStore = await import('../src/server/lib/casting-labels.ts')
  const label = labelStore.addACastingLabel({ name: 'the-restore-fixture-label' }, { by: castingStore.whoWrote(actor), authority: castingStore.authorityOf(actor) }).label
  castingStore.addACasting('worker', { project: null, cells: { program: { value: 'claude-code', decision: null }, model: { value: 'the-restore-fixture-model', decision: null }, probability: { value: '0.3', decision: null }, labels: { value: label.name, decision: null } } }, actor)
  notes.push('the Casting table and its labels: one made-up label, and one made-up casting for the worker card that carries it, with a probability, written through addACastingLabel and addACasting.')

  /**
   * AND ONE DIRECTORY ADDED BY HAND AS A PREVIEW ROOT, criterion U4, migration 0165.
   *
   * The store is a singleton row in the office_scene_settings shape, so it has exactly one row to
   * lose and the fixture writes it through the product's own `addPreviewRoot`. The directory is this
   * checkout, which exists on any machine the proof runs on.
   */
  const previewRoots = await import('../src/server/lib/preview-roots.ts')
  previewRoots.addPreviewRoot(
    { path: fileURLToPath(new URL('..', import.meta.url)), why: 'the restore fixture adds one by hand' },
    'default',
    actor,
  )
  notes.push('preview roots added by hand: one directory, written through addPreviewRoot.')

  /**
   * AND A PRICE TABLE, criterion U3, migration 0177. A singleton row like the one above, written
   * through the product's own `setThePriceTable`. The prices are made up for the proof.
   */
  const prices = await import('../src/server/lib/price-table.ts')
  prices.setThePriceTable({ currency: 'GBP', prices: { 'restore-check-model': { input: 3, output: 15, cachedInput: 0.3 } } }, actor)
  notes.push('price table: one made-up table with one model, written through setThePriceTable.')

  /**
   * AND ONE KEY HASH THAT MUST NOT COME BACK. The restore-time half of criterion P83's key work.
   *
   * A copy, a backup and an export carry no key. `held_keys` is measured,
   * not authored, so no import carries it and a corpus with nothing in it would make "it does not
   * come back" a comparison over nothing, which reads VACUOUS and never HELD. So the corpus holds ONE
   * made-up key hash on purpose, exactly as the derived layer is built on purpose above. The value is
   * made up and never printed; only its SHA-256 is stored, and the comparison asserts it is gone.
   */
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'restore-check-proof', keys.keyHash('made-up-key-for-the-restore-proof-only'), null)
  notes.push('held_keys: one made-up key hash, so the restore proof can prove a restore does NOT bring it back')

  // ---- the tables declared in a schema part, each by its own fill, before the readers are anchored
  notes.push(...(await fillThePartTables()))

  // ---- reader_anchors, LAST, because lastChangeId is a foreign key into changes
  //
  // Keep this block at the very end. A fixture placed after it that writes change rows leaves the
  // caught-up reader behind the newest row, and tests/restore-semantics.test.ts fails.
  //
  // TWO READERS, ON PURPOSE. One has read everything, which is the anchor whose "what is new since I
  // looked" answer should be nothing; the other is pinned to an older row, so the same question has
  // a non-empty answer. One of the two would have made the append-order finding invisible.
  const move = records.moveAnchor(`human:${owner}`, 'default')
  const log = records.listChanges({ workspaceId: 'default', limit: 400 })
  const older = log[Math.min(200, log.length - 1)]
  if (older === undefined) throw new Error('the change log is empty, so no reader can be anchored inside it')
  const pinned = records.moveAnchor('agent:claude-code', 'default', { lastChangeId: older.id })
  notes.push(
    `reader_anchors: human:${owner} anchored at ${move.anchor.lastSeenAt} on the newest row, ` +
      `agent:claude-code pinned to change ${pinned.anchor.lastChangeId ?? '(none)'}`,
  )
  return { notes }
}

/** A pipeline's block ids, or none when it stores no `blockIds` at all. Used only to pick one. */
function blockIdsOfSafely(pipeline: { data: unknown }): string[] {
  const data = pipeline.data
  if (typeof data !== 'object' || data === null) return []
  const ids = (data as { blockIds?: unknown }).blockIds
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
}

// ============================================================================ running one phase

/**
 * Refuse any database path outside this run's own working directory.
 *
 * Exported because it is a safety guard rather than plumbing, and a safety guard nobody tests is a
 * comment. This script deletes the database it is pointed at, and `./data/panelx.db` is the only
 * copy of everything Mole Office knows.
 */
export function assertScratch(file: string, work: string): void {
  const f = resolve(file)
  const w = resolve(work)

  // THE LIVE CORPUS BY NAME, FIRST, AND WHATEVER ANYBODY SAYS ABOUT DIRECTORIES.
  //
  // Containment on its own is not a guard, and an agent asked to break this proved it in one line:
  // every ANCESTOR of a path contains it, so `--scratch .` from the repository root satisfied the
  // test below and accepted `./data/panelx.db`. It reads as compliance. That is worse than no guard,
  // because the command looks careful. `--scratch /home` accepted anything under /home for the same
  // reason.
  //
  // So the rule that matters is about the thing being protected rather than about the directory:
  // this script may not be pointed at the database this checkout serves, however the point was made.
  // It is checked by resolved path, so a relative spelling, a symlink to it, or an ancestor named as
  // the working directory all land here.
  if (f === LIVE_CORPUS) {
    throw new Error(
      `${f} is this checkout's live database. This script DELETES the database it is pointed at, and that ` +
        `file is the only copy of everything Mole Office knows. Nothing about --scratch changes it: name a copy ` +
        `(npm run db:backup -- --to /tmp/somewhere/mole-office.db, which keeps what is still in the -wal file ` +
        `that a plain cp leaves out) and point MOLE_OFFICE_DB at that.`,
    )
  }

  // AND the working directory may not be an ancestor of this checkout, which is the other half of the
  // same mistake: a `--scratch` wide enough to contain the repository is one that contains every
  // database in it, including ones a later change might add beside the current one.
  if (REPO_ROOT === w || REPO_ROOT.startsWith(w + sep)) {
    throw new Error(
      `--scratch ${w} contains this checkout (${REPO_ROOT}), so it would accept any database inside it. ` +
        `This script deletes what it is pointed at; give it a directory it made, not one this repository ` +
        `lives in.`,
    )
  }

  if (f !== w && !f.startsWith(w + sep)) {
    throw new Error(
      `${f} is not inside this run's working directory (${w}). This script deletes the database it is ` +
        'pointed at, so it refuses to point at one it did not create.',
    )
  }
}

/**
 * This checkout's root, and the database it serves.
 *
 * The root is found from this file's own location. The database is read from the declaration and
 * never spelled here: it used to be `resolve(REPO_ROOT, 'data', 'panelx.db')`, which is the
 * declaration's default written a second time. Criterion G1, problem `XnEkXa6aq0Yn`.
 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const LIVE_CORPUS = canonicalDatabasePath()

/**
 * Apply every migration to the database this process has open.
 *
 * THE PRODUCT'S OWN MIGRATION PATH, not drizzle's `migrate` on its own — the same correction
 * tests/helpers.ts needed, and found here the same way: by a check that asked what state the
 * database was actually in. `migrateInPlace` runs the SQL migrations AND the data migrations, and
 * one of those is what declares that the default workspace exists. Running the SQL alone built a
 * database whose records all say `workspace_id = 'default'` and which has no workspace of that
 * name — a state `npm run db:migrate` cannot produce and every route now refuses. The proof would
 * then have been a proof about a database nobody can have.
 */
async function migrateHere(): Promise<void> {
  const { sqlite } = await import('../src/server/db/client.ts')
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(sqlite, fileURLToPath(new URL('../drizzle', import.meta.url)))
}

/**
 * READ THE ROLE CARDS, ONCE, AT THIS PROCESS'S START.
 *
 * The cards are read once, at a process's start, by `readTheRoleCards` in `buildApp` — asking
 * before that throws rather than loading them again, which src/server/lib/roles.ts explains. This
 * script is its own process: it builds a database and proves a restore, and its `fillEmptyTables`
 * presses the dead-letter sweep, which reads the declaration through `theRoleCards()`. A script
 * that builds its own database is such a process, so it reads them the same way the server does,
 * before it fills a table or sweeps anything. Loading them lazily here would be a second moment the
 * rules could come from, and an act nobody declared grants nobody anything.
 *
 * The input is copied from `buildApp`: the default file, and BOTH act keys of `GOVERNANCE_GUARDS` —
 * `actKey` and `personAct`. Copying only the first is what this call did until 13 September 2026,
 * and R1 of 12 September is when it started to matter: R1 declared ten of the person's own acts
 * with their own keys, carried on `personAct` and on no `actKey`, so this reader published none of
 * them and refused roles.json with ten complaints, one per act. Mole Office would not start under
 * a restore, and tests/restore-check, restore-command and restore-semantics were red on main for
 * it. One fact worked out in two places is the ninth invariant; the two places now read alike.
 * The imports are dynamic for the reason in this file's header — importing records.ts opens
 * `MOLE_OFFICE_DB`, so it may only happen once that variable names this run's scratch database.
 */
export async function readTheRoleCardsAtStart(): Promise<void> {
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}

/**
 * One phase, in its own process, with `MOLE_OFFICE_DB` already set by the parent.
 *
 * Everything here imports dynamically, and nothing here reads `.env`: the parent says which
 * database this is, in full, and a `.env` naming the real one would be the one way this script
 * could reach `./data/panelx.db`.
 */
async function runPhase(phase: string, args: Map<string, string>): Promise<void> {
  // A PHASE MIGRATES AND SEEDS, SO IT MAY ONLY RUN ON A DATABASE THIS RUN MADE.
  //
  // The orchestrator sets MOLE_OFFICE_DB and calls `assertScratch` before it spawns anything, and that
  // was read as covering the phases. It does not: a phase is an ordinary command line, and
  // `npx tsx scripts/restore-check.ts --phase migrate` from the repository root inherits nothing —
  // db/client.ts then DEFAULTS to ./data/panelx.db. Measured on a scratch copy 2026-08-12: exit 0,
  // no output at all, one schema migration applied and 1,134 change rows stamped. Silently.
  //
  // The file's own header says that not reading `.env` is what keeps this script away from the live
  // corpus. That is true of the path `.env` would name and says nothing about the default, which is
  // the same file. Same shape as the `npm run db:reset` default that was guarded on 2026-08-11.
  const scratch = args.get('scratch')
  if (scratch === undefined) {
    throw new Error(
      `--phase ${phase} needs --scratch <this run's working directory>, and it is not decoration: this phase ` +
        `migrates and may seed the database MOLE_OFFICE_DB names, and MOLE_OFFICE_DB defaults to ${LIVE_CORPUS} — the ` +
        'live corpus. The orchestrator passes it. If you are running a phase by hand, make a directory, put a ' +
        'copy of the database in it, and name that directory here.',
    )
  }
  assertScratch(settings().databasePath, scratch)

  // Before this phase builds, seeds or sweeps anything: the cards are this process's rules, read
  // once, here. See readTheRoleCardsAtStart just above for why.
  await readTheRoleCardsAtStart()

  if (phase === 'build') {
    await migrateHere()
    // Importing the seed RUNS it. It prints its own inventory, which is left on stdout because a
    // restore proof that hid what it started from would be asking to be trusted.
    await import('./seed.ts')
    // The derived layer is built ON PURPOSE, so that "it does not come back" is a measured number
    // rather than a claim. A restore proof taken against a database that never had a source index
    // could not tell an excluded table from a table nobody filled.
    const { rebuildIndex } = await import('../src/server/lib/sourceindex.ts')
    // The proof's database is the one a fresh `db:reset` + seed builds, which holds exactly one
    // workspace. The index is filed in it by name rather than by a default, so that the
    // "does it come back?" comparison is about a row whose workspace is stated.
    const index = rebuildIndex({ workspaceId: DEFAULT_WORKSPACE })
    const filled = await fillEmptyTables(scratch)
    const { sqlite } = await import('../src/server/db/client.ts')
    console.log(JSON.stringify({ indexedFiles: index.fileCount, notes: filled.notes }))
    sqlite.close()
    return
  }

  if (phase === 'migrate') {
    await migrateHere()
    const { sqlite } = await import('../src/server/db/client.ts')
    sqlite.close()
    return
  }

  if (phase === 'snapshot') {
    const nowRaw = args.get('now')
    const out = args.get('out')
    if (nowRaw === undefined || out === undefined) throw new Error('--phase snapshot needs --now and --out')
    const now = Number(nowRaw)
    // A clock that is not a number would give every age a NaN and the attention rule would score
    // every row zero, silently, on both sides — a comparison of two wrong answers that agreed.
    if (!Number.isFinite(now)) throw new Error(`--now must be a number of milliseconds, and it was "${nowRaw}".`)
    const snapshot = await buildSnapshot(now)
    writeFileSync(out, JSON.stringify(snapshot), 'utf8')
    const { sqlite } = await import('../src/server/db/client.ts')
    sqlite.close()
    return
  }

  throw new Error(`I do not know the phase "${phase}".`)
}

// ============================================================================ the orchestrator

export interface Step {
  what: string
  command: string
  ok: boolean
  ms: number
  /** Whatever the step wanted to say. Kept short; the full output goes to the working directory. */
  said: string
}

export interface RestoreCheckReport {
  work: string
  /** The fixed clock both snapshots were taken against. */
  now: number
  steps: Step[]
  /**
   * What the origin actually held, in the build phase's own words.
   *
   * Printed on every run. A restore proof that hid what it started from would be asking to be
   * trusted, and "which four tables did it fill, and with what" is the first thing a reader of a
   * green result should be able to check.
   */
  corpus: string[]
  /**
   * Every comparison, with each difference already sorted into explained or not.
   *
   * A difference a declared loss NAMES moves into that loss and out of `differences`. Anything left
   * in `differences` fails the run, so a loss can never quietly widen to cover something new.
   */
  comparisons: Comparison[]
  /** The declared losses, whether each happened, and exactly what each accounted for. */
  losses: LossOutcome[]
  /** Rows in the archive, from the export's own report. */
  archive: { files: number; bytes: number; counts: Record<string, number> }
  /** True when the second restore of the same archive changed nothing at all. */
  idempotent: boolean
  /** True when a second, independent restore produced the same database as the first. */
  repeatable: boolean
  /** True when exporting the restored database reproduced the archive byte for byte. */
  fixedPoint: boolean
  ok: boolean
}

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Run a command, capture everything, and refuse to continue when it fails.
 *
 * It hands back the step as well as the output, so a caller holding structured output can replace
 * the one-line summary with something a person can read. The default summary is the last line of
 * stdout, which for a `--json` command is a closing brace and says nothing.
 */
function run(
  what: string,
  argv: readonly string[],
  env: Record<string, string>,
  steps: Step[],
  logDir: string,
): { out: string; stdout: string; step: Step } {
  const started = Date.now()
  const r = spawnSync(argv[0] ?? '', argv.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    // No shell: a title holding a quote or a Chinese character can never become part of a command
    // line. Titles here include 地名与主题索引 and `Saturday batch › second reader checks the corrections`.
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
    env: { ...process.env, ...env },
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const slug = what.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  writeFileSync(join(logDir, `${slug}.log`), `$ ${argv.join(' ')}\n\n${out}`, 'utf8')
  const ok = r.status === 0
  const step: Step = {
    what,
    command: argv.join(' '),
    ok,
    ms: Date.now() - started,
    said: (r.stdout ?? '').trim().split('\n').slice(-1)[0] ?? '',
  }
  steps.push(step)
  if (!ok) {
    throw new Error(
      `${what} failed (exit ${String(r.status)}). The whole output is in ${join(logDir, `${slug}.log`)}:\n${out.slice(-4000)}`,
    )
  }
  return { out, stdout: r.stdout ?? '', step }
}

/**
 * The last JSON document a command printed on stdout, parsed.
 *
 * STDOUT ONLY, and the LAST one. Three of these commands print prose before their JSON, and stderr
 * is captured beside stdout for the log — reading the pair would let a warning containing a brace
 * decide what the report says.
 */
function lastJson<T>(stdout: string, what: string): T {
  const at = stdout.lastIndexOf('\n{')
  const start = at === -1 ? stdout.indexOf('{') : at + 1
  if (start === -1) throw new Error(`${what} printed no JSON, so this run cannot say what it did.`)
  try {
    return JSON.parse(stdout.slice(start)) as T
  } catch (err) {
    throw new Error(`${what} printed something that is not JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const TSX = join(ROOT, 'node_modules', '.bin', 'tsx')
const SELF = fileURLToPath(import.meta.url)

/** Every file in a tree, relative, with its sha-256, so "the archive is untouched" is checkable. */
function fingerprint(root: string): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '.git') continue
        walk(full)
      } else if (entry.isFile()) {
        out.set(relative(root, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex'))
      }
    }
  }
  walk(root)
  return out
}

function readSnapshot(file: string): Snapshot {
  return JSON.parse(readFileSync(file, 'utf8')) as Snapshot
}

/** The whole checkpoint, in order, refusing rather than continuing when a step fails. */
export function runCheck(work: string, options: { now?: number } = {}): RestoreCheckReport {
  mkdirSync(work, { recursive: true })
  const logs = join(work, 'logs')
  mkdirSync(logs, { recursive: true })

  const origin = join(work, 'origin.db')
  const mirror = join(work, 'mirror')
  const archive = join(work, 'archive')
  const restoredOne = join(work, 'restored-1.db')
  const restoredTwo = join(work, 'restored-2.db')
  const reexport = join(work, 're-export')
  assertScratch(origin, work)
  assertScratch(restoredOne, work)
  assertScratch(restoredTwo, work)

  // A working directory that already holds a database is refused outright. Step 5 deletes files in
  // here, and `--work ./data` would otherwise be one typo away from the only copy of everything.
  const existing = readdirSync(work).filter((name) => name.endsWith('.db'))
  if (existing.length > 0) {
    throw new Error(
      `${work} already holds ${existing.join(', ')}. This run deletes databases inside its working ` +
        'directory, so it refuses to work in one that already has any. Point --work somewhere empty.',
    )
  }

  // ONE CLOCK FOR EVERY SNAPSHOT. The attention rule scores how long a thing has sat, so a second
  // reading taken a few seconds later would differ for a reason that has nothing to do with the
  // restore. Chosen once, here, and handed to every phase.
  const now = options.now ?? Date.now()
  const steps: Step[] = []

  // 1 · a database holding realistic non-trivial data
  const built = run('1 build the origin database', [TSX, SELF, '--phase', 'build', '--scratch', work], { MOLE_OFFICE_DB: origin }, steps, logs)
  // The build phase prints the seed's own inventory and then one JSON line saying what it added to
  // the four tables the seed leaves empty. The prose stays in the log; the JSON becomes the report's
  // account of what the origin contained.
  const buildReport = lastJson<{ indexedFiles: number; notes: string[] }>(built.stdout, 'the build phase')
  const corpus = [`source index: ${buildReport.indexedFiles} files scanned`, ...buildReport.notes]
  built.step.said = `seeded, indexed and filled the tables the seed leaves empty`

  // 2 · what Mole Office says about it, before anything is exported
  const beforeFile = join(work, 'snapshot-before.json')
  run(
    '2 snapshot the origin',
    [TSX, SELF, '--phase', 'snapshot', '--now', String(now), '--out', beforeFile, '--scratch', work],
    { MOLE_OFFICE_DB: origin },
    steps,
    logs,
  )
  const before = readSnapshot(beforeFile)

  // 3 · export it, with the shipped command
  const exported = run(
    '3 export',
    [TSX, join(ROOT, 'scripts', 'export.ts'), '--to', mirror, '--no-commit', '--json'],
    { MOLE_OFFICE_DB: origin },
    steps,
    logs,
  )
  const exportReport = lastJson<{ files: number; bytes: number; counts: Record<string, number> }>(
    exported.stdout,
    'the export',
  )
  exported.step.said = `${exportReport.files} files, ${exportReport.bytes.toLocaleString('en-GB')} bytes`

  // 4 · preserve the durable representation somewhere the destruction cannot reach
  cpSync(mirror, archive, { recursive: true })
  const preserved = fingerprint(archive)
  steps.push({
    what: '4 preserve the archive',
    command: `cp -r ${mirror} ${archive}`,
    ok: true,
    ms: 0,
    said: `${preserved.size} files preserved`,
  })

  // 5 · DESTROY the database. Actually delete the file, and the two sidecars a write-ahead log
  //     leaves beside it — deleting the main file alone leaves SQLite a journal for a database
  //     that no longer exists.
  const removed: string[] = []
  for (const f of [origin, `${origin}-wal`, `${origin}-shm`, mirror]) {
    if (existsSync(f)) {
      rmSync(f, { recursive: true, force: true })
      removed.push(f)
    }
  }
  if (existsSync(origin)) throw new Error(`${origin} still exists after being deleted`)
  steps.push({
    what: '5 destroy the database and the mirror it was written to',
    command: `rm -rf ${removed.join(' ')}`,
    ok: true,
    ms: 0,
    said: `${removed.length} paths removed; only ${archive} is left`,
  })

  // 6 · rebuild from the preserved text alone
  run('6 migrate an empty database', [TSX, SELF, '--phase', 'migrate', '--scratch', work], { MOLE_OFFICE_DB: restoredOne }, steps, logs)
  run(
    '7 restore, first run',
    [TSX, join(ROOT, 'scripts', 'import.ts'), '--from', archive, '--apply'],
    { MOLE_OFFICE_DB: restoredOne },
    steps,
    logs,
  )
  const afterFile = join(work, 'snapshot-after.json')
  run(
    '8 snapshot the restored database',
    [TSX, SELF, '--phase', 'snapshot', '--now', String(now), '--out', afterFile, '--scratch', work],
    { MOLE_OFFICE_DB: restoredOne },
    steps,
    logs,
  )
  const after = readSnapshot(afterFile)

  // 7 · run the restore AGAIN over the same database. Idempotence is not a nicety here: a restore
  //     that is not idempotent cannot be retried after an interruption, and retrying after an
  //     interruption is the situation a restore exists for.
  const second = run(
    '9 restore again, same archive, same database',
    [TSX, join(ROOT, 'scripts', 'import.ts'), '--from', archive, '--apply', '--json'],
    { MOLE_OFFICE_DB: restoredOne },
    steps,
    logs,
  )
  const secondReport = lastJson<{
    inserts: Record<string, number>
    updates: Record<string, number>
    unchanged: Record<string, number>
  }>(second.stdout, 'the second restore')
  const total = (counts: Record<string, number>): number => Object.values(counts).reduce((n, v) => n + v, 0)
  const idempotent = total(secondReport.inserts) === 0 && total(secondReport.updates) === 0
  second.step.said =
    `${total(secondReport.inserts)} inserted, ${total(secondReport.updates)} updated, ` +
    `${total(secondReport.unchanged)} already identical`
  const twiceFile = join(work, 'snapshot-after-twice.json')
  run(
    '10 snapshot after the second restore',
    [TSX, SELF, '--phase', 'snapshot', '--now', String(now), '--out', twiceFile, '--scratch', work],
    { MOLE_OFFICE_DB: restoredOne },
    steps,
    logs,
  )
  const twice = readSnapshot(twiceFile)

  // 8 · and a THIRD time, into a database that has never seen this archive, to prove the result is
  //     a function of the archive rather than of the order things happened in.
  run('11 migrate a second empty database', [TSX, SELF, '--phase', 'migrate', '--scratch', work], { MOLE_OFFICE_DB: restoredTwo }, steps, logs)
  run(
    '12 restore into it from the same archive',
    [TSX, join(ROOT, 'scripts', 'import.ts'), '--from', archive, '--apply'],
    { MOLE_OFFICE_DB: restoredTwo },
    steps,
    logs,
  )
  const thirdFile = join(work, 'snapshot-independent.json')
  run(
    '13 snapshot the independent restore',
    [TSX, SELF, '--phase', 'snapshot', '--now', String(now), '--out', thirdFile, '--scratch', work],
    { MOLE_OFFICE_DB: restoredTwo },
    steps,
    logs,
  )
  const independent = readSnapshot(thirdFile)

  // 9 · export the restored database and compare the text. A value that survives into SQLite but
  //     not back out again would pass every comparison above and be lost on the next disk failure.
  run(
    '14 export the restored database',
    [TSX, join(ROOT, 'scripts', 'export.ts'), '--to', reexport, '--no-commit'],
    { MOLE_OFFICE_DB: restoredOne },
    steps,
    logs,
  )
  const again = fingerprint(reexport)
  let fixedPoint = again.size === preserved.size
  for (const [path, hash] of preserved) if (again.get(path) !== hash) fixedPoint = false

  // The archive must be exactly as it was left. If a phase wrote into it, every comparison above
  // is about something other than what was preserved.
  const now2 = fingerprint(archive)
  for (const [path, hash] of preserved) {
    if (now2.get(path) !== hash) throw new Error(`the preserved archive changed during the run: ${path}`)
  }
  if (now2.size !== preserved.size) throw new Error('the preserved archive gained or lost files during the run')

  const { comparisons, losses } = compareAccountingForLosses(before, after)

  // The two extra restores are compared on differences ONLY. Their `needs` are about what the
  // ORIGIN had to contain, and neither side of these two comparisons is the origin.
  const idempotenceDiffs = compareSnapshots(after, twice).filter((c) => c.differences.length > 0)
  const repeatDiffs = compareSnapshots(after, independent).filter((c) => c.differences.length > 0)

  const ok =
    comparisons.every((c) => c.verdict === 'held') &&
    idempotenceDiffs.length === 0 &&
    repeatDiffs.length === 0 &&
    idempotent &&
    fixedPoint

  if (idempotenceDiffs.length > 0) {
    steps.push({
      what: 'idempotence',
      command: '(comparison)',
      ok: false,
      ms: 0,
      said: `${idempotenceDiffs.length} comparison(s) differ after a second restore of the same archive`,
    })
  }
  if (repeatDiffs.length > 0) {
    steps.push({
      what: 'repeatability',
      command: '(comparison)',
      ok: false,
      ms: 0,
      said: `${repeatDiffs.length} comparison(s) differ between two independent restores`,
    })
  }

  return {
    work,
    now,
    steps,
    corpus,
    comparisons,
    losses,
    archive: { files: exportReport.files, bytes: exportReport.bytes, counts: exportReport.counts },
    idempotent,
    repeatable: repeatDiffs.length === 0,
    fixedPoint,
    ok,
  }
}

// ============================================================================ printing

/** How many difference lines to print per comparison before saying how many more there are. */
const SHOW_DIFFS = 8

export function printReport(report: RestoreCheckReport): void {
  console.log('')
  console.log('THE DESTRUCTIVE RESTORE PROOF')
  console.log(`working directory:  ${report.work}`)
  console.log(
    `archive:            ${report.archive.files} files, ${report.archive.bytes.toLocaleString('en-GB')} bytes — ` +
      Object.entries(report.archive.counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  )
  console.log('')
  console.log('WHAT THE ORIGIN CONTAINED')
  for (const line of report.corpus) console.log(`  ${line}`)

  console.log('')
  for (const step of report.steps) {
    console.log(`  ${step.ok ? 'ok  ' : 'FAIL'} ${step.what}  (${step.ms} ms)  ${step.said}`)
  }

  console.log('')
  console.log('WHAT WAS COMPARED')
  console.log('  Each line says how many things the comparison looked at. A comparison that looked at')
  console.log('  nothing reads VACUOUS, never HELD.')
  console.log('')
  for (const c of report.comparisons) {
    const verdict = c.verdict === 'held' ? 'HELD    ' : c.verdict === 'vacuous' ? 'VACUOUS ' : 'DIFFERS '
    console.log(`  ${verdict} ${c.name} — over ${c.covers}`)
    console.log(`           ${c.question}`)
    for (const n of c.needs) {
      console.log(`           ${n.met ? 'the corpus has' : 'THE CORPUS LACKS'} ${n.what} — ${n.measured}`)
    }
    for (const d of c.differences.slice(0, SHOW_DIFFS)) {
      console.log(`           · ${d.where}`)
      console.log(`               before: ${d.before}`)
      console.log(`               after:  ${d.after}`)
    }
    if (c.differences.length > SHOW_DIFFS) {
      console.log(`           · and ${c.differences.length - SHOW_DIFFS} more`)
    }
  }

  console.log('')
  console.log('RUNNING IT MORE THAN ONCE')
  console.log(`  ${report.idempotent ? 'ok  ' : 'FAIL'} a second restore of the same archive into the same database changed nothing`)
  console.log(`  ${report.repeatable ? 'ok  ' : 'FAIL'} a second, independent restore produced the same database`)
  console.log(`  ${report.fixedPoint ? 'ok  ' : 'FAIL'} exporting the restored database reproduced the archive byte for byte`)

  console.log('')
  console.log('WHAT DOES NOT ROUND-TRIP')
  console.log('  Declared in scripts/restore-check.ts, printed whether or not anybody asks. Each names the')
  console.log('  exact differences it accounts for; a difference no declaration names fails the run.')
  for (const loss of report.losses) {
    console.log('')
    if (!loss.happened) {
      console.log(`  · NO LONGER TRUE: ${loss.what}`)
      console.log('      This was declared as a known loss and it did not happen. Delete the declaration in')
      console.log('      scripts/restore-check.ts, or the next reader will believe something false.')
      continue
    }
    console.log(`  · ${loss.what}`)
    console.log(`      why:      ${loss.why}`)
    console.log(`      repair:   ${loss.repair}`)
    console.log(
      `      measured: ${loss.explained.length === 0 ? 'no comparison above claims this, so it accounts for none of them' : `it accounts for ${loss.explained.length} difference(s):`}`,
    )
    for (const d of loss.explained.slice(0, SHOW_DIFFS)) {
      console.log(`                  ${d.where} — ${d.before} -> ${d.after}`)
    }
    if (loss.explained.length > SHOW_DIFFS) {
      console.log(`                  and ${loss.explained.length - SHOW_DIFFS} more`)
    }
  }

  console.log('')
  console.log(
    report.ok
      ? 'The restore is faithful. Everything above that did not round-trip is named, with its reason.'
      : 'THE RESTORE IS NOT FAITHFUL. See DIFFERS, VACUOUS and FAIL above.',
  )
}

// ============================================================================ the command line

interface Options {
  work: string | null
  keep: boolean
  json: boolean
  phase: string | null
  extra: Map<string, string>
}

export function readOptions(argv: readonly string[]): Options | { help: string } {
  const options: Options = { work: null, keep: false, json: false, phase: null, extra: new Map() }
  const takesValue = new Set(['--work', '--phase', '--now', '--out', '--scratch'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--help' || arg === '-h') return { help: USAGE }
    if (arg === '--keep') {
      options.keep = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)
    if (!takesValue.has(name)) throw new Error(`I do not know the option ${arg}.\n\n${USAGE}`)
    let value: string | undefined
    if (eq === -1) {
      value = argv[i + 1]
      i += 1
    } else {
      value = arg.slice(eq + 1)
    }
    if (value === undefined || (eq === -1 && value.startsWith('--'))) {
      throw new Error(`${name} needs a value after it.\n\n${USAGE}`)
    }
    if (name === '--work') options.work = value
    else if (name === '--phase') options.phase = value
    else options.extra.set(name.slice(2), value)
  }
  return options
}

const USAGE = [
  'Build a real Mole Office, export it, delete the database, rebuild from the text, and compare.',
  '',
  '  npx tsx scripts/restore-check.ts [--work <dir>] [--keep] [--json]',
  '',
  '  --work <dir>  where the evidence goes. Default: a new directory under the system temp dir',
  '  --keep        do not delete the working directory afterwards',
  '  --json        print the report as JSON',
  '',
  'It exits non-zero when anything that must round-trip did not, when a comparison covered nothing,',
  'or when a second restore of the same archive was not a no-op.',
  '',
  'The format is specified in design/durability/FORMAT.md; what this proves is in',
  'design/durability/RESTORE.md.',
].join('\n')

/** Whether this file was started directly, rather than imported by a test. */
function startedDirectly(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  try {
    return statSync(entry).isFile() && resolve(entry) === resolve(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const parsed = readOptions(process.argv.slice(2))
  if ('help' in parsed) {
    console.log(parsed.help)
    return
  }

  if (parsed.phase !== null) {
    await runPhase(parsed.phase, parsed.extra)
    return
  }

  const work = parsed.work ?? mkdtempSync(join(tmpdir(), 'mole-office-restore-'))
  // Nothing catches a failure here on purpose: the working directory is only removed at the end of
  // a clean run, so a run that threw leaves every file it made where a person can read them.
  const report = runCheck(work)
  if (parsed.json) console.log(JSON.stringify(report, null, 2))
  else printReport(report)

  // The working directory survives any run that was not clean, whatever was asked for, because the
  // evidence is the point. The extra sentence is skipped under --json so the output stays parseable.
  if (!parsed.keep && report.ok) rmSync(work, { recursive: true, force: true })
  else if (!report.ok && !parsed.json) {
    console.log(`\nThe evidence is in ${work} — it was kept because the run was not clean.`)
  }

  if (!report.ok) process.exitCode = 1
}

if (startedDirectly()) {
  try {
    await main()
  } catch (err) {
    // A sentence and a non-zero exit, never a stack trace as the whole answer.
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}
