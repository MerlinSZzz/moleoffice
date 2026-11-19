// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A MODULE SAYS IT IS RESPONSIBLE FOR, MOVED OFF THE RECORD AND INTO A ROW OF ITS OWN. One
 * transaction, written and proved and NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MOVES
 * ---------------------------------------------------------------------------------------
 *
 * Every string in a live module's `data.claims` becomes one `implementation_map` row:
 *
 *     records.data.claims = ["src/server/db/schema.ts", "tests/migration.test.ts", …]
 *       ->  one row per string, pattern VERBATIM, relation 'implements', provenance 'declared'
 *
 * and then the key leaves `data`, and the record's newest revision is restamped so the ledger still
 * names what the record holds.
 *
 * ---------------------------------------------------------------------------------------
 * HOW BIG IT IS, MEASURED RATHER THAN PLANNED
 * ---------------------------------------------------------------------------------------
 *
 * Re-measured on 26 August 2026 by `tools/count-the-map.ts` against a copy of the owner's corpus
 * made by SQLite's own backup, so the write-ahead log is included:
 *
 *     live modules ......................................  27
 *     modules with a non-empty data.claims ..............  15
 *     claim strings, which is the row count .............  152
 *     newest revisions the restamp would rewrite ........  15
 *     claim strings that point at tests/ ................  75
 *     claim strings repeated inside one module ..........  0
 *     claim strings that are not strings ................  0
 *     deleted modules holding claims ....................  0
 *
 * THE COUNTS ARE A PARAMETER AND NOT A CONSTANT HERE, for the reason ./block-identity.ts gives: a
 * function with the corpus's numbers baked in cannot be tested against anything else, and the first
 * thing anybody would do is take the check out. The runner holds the corpus's numbers with the date
 * they were taken; a test holds its fixture's. Any difference and the whole run refuses, naming
 * both — because a migration that runs against a corpus nobody counted is a broken assumption
 * carried quietly.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY CLAIM MIGRATES VERBATIM, AND `implements` IS WHAT ALL 152 SAY
 * ---------------------------------------------------------------------------------------
 *
 * 75 of the 152 claim strings point at `tests/`, and `RELATIONS` in src/shared/implementation.ts
 * has a word for exactly that — `tests`, "this code checks it" — with module `T_FNIYu56FnA` named
 * in its own comment as the measured instance. NONE OF THEM IS MIGRATED AS `tests`.
 *
 * A MIGRATION THAT IMPROVES THE DATA IS A MIGRATION THAT LIES ABOUT THE PAST. `data.claims` had one
 * word for all of it, and every one of those 152 strings was written by somebody who had no way to
 * say anything finer than "this module is responsible for this". Turning 75 of them into `tests`
 * would put a distinction into the corpus that nobody drew, dated to today, attributed to a
 * migration — and the first read of `T_FNIYu56FnA` would then report five relationships a person
 * would not recognise, with no way left to tell what the record actually said. The relation is a
 * thing a person changes afterwards, one row at a time, and the row is now the place to do it.
 *
 * VERBATIM MEANS UNTRIMMED TOO. `declareRelationship` trims what a caller sends; this does not,
 * because the string in the corpus is the statement and the migration is not the author of it. A
 * string the write door would refuse today is MIGRATED AND NAMED — `patternsTheWriteDoorWouldRefuse`
 * — rather than repaired or dropped. Measured on the corpus: none.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REPOSITORY, WHICH IS A QUESTION THE DATABASE CANNOT ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * `implementation_map.repository_id` is NOT NULL, and a claim is written relative to a repository
 * root. `data.claims` never said which root, because when it was designed there was only ever one.
 *
 * ON THE OWNER'S CORPUS THE TWO DO NOT LINE UP, and `tools/count-the-map.ts` prints it as a fork:
 * all 15 claim-holding modules are in the project `panelx`, the one `source_index` row is in the
 * project `default`, so minting repositories from the indexes mints nothing in `panelx` at all.
 * Which repository those 152 claims mean is a fact about this machine and not a fact in the
 * database. So this migration REFUSES rather than picking one, in the count tool's own words, and
 * the refusal names the project, the modules, the claims and the two ways to answer it.
 *
 * The caller may name one per project. Where the caller names none and the project holds EXACTLY
 * ONE repository, that one is used and the report says it was chosen that way — one candidate is
 * not a guess. Zero or several, and it refuses.
 *
 * ---------------------------------------------------------------------------------------
 * IT RESTAMPS, BECAUSE IT RUNS BELOW `migrateRevisions` IN WINDOW B
 * ---------------------------------------------------------------------------------------
 *
 * `design/ROUND-TEN-BUILD-PLAN.md`'s window-B ordering puts this step below `migrateRevisions`, so
 * no fresh backfill comes along afterwards to put right what it left. Every record it rewrites is
 * therefore restamped in the same transaction, the way
 * `design/round-nine/step20-bundle/place-migration.ts` does at its lines 308 and 347.
 *
 * A record's newest revision holds what the record holds, and its `content_hash` IS `versionOf()` —
 * the token a read hands back as `version` and a write has to send back to prove it is not stale.
 * KEY ORDER INSIDE `data` IS PART OF THAT HASH. A migration that rewrote `records.data` and left
 * the ledger alone would leave the newest revision stamped with a hash of content that is gone, and
 * every compare-and-set built from a read of that record would refuse every write for ever.
 *
 * WHY THIS RESTAMPS WHERE ./block-identity.ts WRITES A NEW REVISION, which is the same choice made
 * the other way. That migration argued that 60 of its 89 blocks have a single revision, so
 * restamping would delete the composed title from the ledger altogether and nothing else holds it.
 * HERE NOTHING IS LOST BY THE RESTAMP, and check 1 is what makes that a fact rather than a hope:
 * every claim string on the record is a row in `implementation_map` before the key is removed, and
 * the whole transaction rolls back if even one is not. The 15 modules do each hold exactly one
 * revision; what that revision stops holding is held better, 152 rows over, with a repository
 * beside it.
 *
 * NO `changes` ROW AND NO `updated_at`. A migration is not somebody saying something. The
 * revision's `note` is set instead, and only where it was empty, so the ledger says in words that a
 * migration moved this and that nobody chose it.
 *
 * ---------------------------------------------------------------------------------------
 * WHO THE ROW SAYS SAID IT, WHICH IS NOT A PERSON
 * ---------------------------------------------------------------------------------------
 *
 * `implementation_map.stated_by` is NOT NULL and spelled `${actor.type}:${actor.id}` everywhere
 * else. THE CORPUS CANNOT SAY WHO WROTE THESE STRINGS: the whole change log holds two rows naming
 * `data.claims`, for 15 modules and 152 claims, and every one of the 15 modules carries a single
 * baseline revision written by the backfill. Reaching for `records.owner_id` would put a person's
 * name against 152 statements on the strength of who owns the record, which is a different fact.
 *
 * So the row says what is true — `system:module-claims-migration`, the spelling ./block-identity.ts
 * already uses for a migration's own writes — and its `note` says where the string came from and
 * that the corpus does not record who wrote it. `provenance` stays `declared` because that is what
 * the string was: an explicit declaration, whoever made it, which is what `authorityOf` needs in
 * order to go on counting these as ownership.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR CHECKS, INSIDE THE TRANSACTION
 * ---------------------------------------------------------------------------------------
 *
 *   1. EVERY CLAIM STRING IS A ROW, READ BACK OUT OF `implementation_map` AND COMPARED VERBATIM.
 *      THIS IS THE ONE THAT CATCHES AN OFF-BY-ONE. A loop that starts at 1, or stops at
 *      `length - 1`, writes 151 rows and 15 emptied records, and every count in the report still
 *      looks plausible; the claim that is gone is gone from the ledger too, because the restamp
 *      rewrote the only revision that held it. So the comparison is against the strings the record
 *      HELD, per module, per string, and the whole transaction rolls back naming the module and the
 *      string that has no row.
 *   2. EVERY MODULE'S `data` IS WHAT IT WAS, MINUS ONE KEY. Re-read from the row and compared byte
 *      for byte with what was planned, so a rebuild that reordered the keys or dropped a second one
 *      is caught here rather than by a hash disagreement two floors away.
 *   3. EVERY TOUCHED RECORD'S NEWEST REVISION NAMES WHAT THE RECORD NOW HOLDS. Re-read, not
 *      assumed.
 *   4. NO LIVE MODULE IS LEFT HOLDING `data.claims`. Asked of the database afterwards, so "it is
 *      done" is a measurement rather than the absence of an error.
 *
 * All four throw from inside the transaction, so a disagreement rolls the whole thing back. The
 * alternative — reporting afterwards — is a repair nobody can make: the write is committed and the
 * old content is gone.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT NEVER GUESSES. It invents no relation, no repository, no author and no pattern. It writes no
 * `implementation_revisions` row: `implementation_map.revision_id` stays NULL because nobody named
 * a code revision, and "the +15 revisions" in the build plan are this migration's own restamp of
 * the Mole Office record ledger, which is a different table from the code-revision one and is worth
 * saying out loud once.
 *
 * IT LEAVES A DELETED MODULE ALONE. `declareRelationship` refuses a relationship on a deleted
 * record — "a relationship written onto a deleted record is a statement nothing draws" — so a
 * migration must not create one. A deleted module keeps its `data.claims` and is named in the
 * report. Measured on the corpus: none is in that state.
 *
 * IT TOUCHES `src/shared/kinds.ts` NOT AT ALL. `KIND_SPECS.module.fields.claims` stays declared and
 * optional, and `MOVED_OUT_OF_DATA` gains its entry in window B's commit, beside this migration.
 * Until then both answers are correct and neither is lost.
 *
 * IT IS SAFE TO RUN TWICE. A module with no `data.claims` is not a candidate, so a second run plans
 * nothing, writes nothing and reports `alreadyDone`. A row that is already in the map is counted
 * and not written again, so a half-finished run can be finished rather than started over.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES HERE AND IS NOT REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * It is NOT in `drizzle/meta/_journal.json` and NOT in `migrateInPlace`, and that is deliberate.
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. This
 * empties a field on 15 of the owner's records. It is applied by its own runner, `run-module-claims.mjs`,
 * against a database named on the command line, which refuses the live corpus by name. Window B is
 * when it runs for real, and there is no window B in this run.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { contentOf, versionOf } from './version.ts'
import { claimProblem } from '../../shared/paths.ts'
import { nowStamp } from '../../shared/time.ts'
import type { Provenance, Relation } from '../../shared/implementation.ts'

/**
 * The one word all 152 rows carry, and the one place it is written.
 *
 * Named rather than typed at the insert so that the mutation "migrate `tests/` claims as `tests`"
 * has one place to happen and one test to catch it.
 */
export const THE_ONE_RELATION: Relation = 'implements'

/** What these rows say about where they came from: an explicit declaration, whoever made it. */
export const THE_ONE_PROVENANCE: Provenance = 'declared'

/** The spelling `stated_by` carries, in the `${actor.type}:${actor.id}` shape every table uses. */
export const MIGRATION_ACTOR = 'system:module-claims-migration'

/** What every row's `note` says, because the corpus cannot say who wrote the string. */
export const ROW_NOTE =
  'Carried over verbatim from `data.claims` on this module by the module-claims migration. The corpus does not ' +
  'record who wrote the string — the change log holds two rows naming that field for fifteen modules — so this ' +
  'row does not guess at a person. The relation is `implements` because that is the only thing `data.claims` ' +
  'could ever say; if this pattern is really a test or a configuration, change the relation on this row.'

/** What the restamped revision's `note` says, where it had none. */
export const REVISION_NOTE =
  'A migration moved what this module said it is responsible for out of `data.claims` and into the implementation ' +
  'map, one row per claim. Nobody chose it: the claims are the ones that were already stored, they are unchanged ' +
  'word for word, and this revision\'s time is the migration\'s moment rather than the moment somebody wrote.'

/** What the caller says it measured. Re-measured here and compared; any difference refuses. */
export interface MeasuredClaims {
  /** Live modules holding a non-empty `data.claims`. */
  modules: number
  /** Claim strings across all of them, which is the row count. */
  claims: number
}

/** Which repository a project's claims are relative to, and how that was decided. */
export interface RepositoryChosen {
  workspaceId: string
  repositoryId: string
  /** What a person reads, from `repositories.name`. */
  name: string
  how: 'named by the caller' | 'the only repository in that project'
}

/** A project holding claims that nothing here can place. The whole run refuses on any of these. */
export interface Unanswered {
  workspaceId: string
  modules: number
  claims: number
  why: string
}

/** One module this migration would move, with everything the write and the checks need. */
export interface ModuleMove {
  recordId: string
  workspaceId: string
  title: string
  repositoryId: string
  /**
   * The claim strings this module held, in the order it held them, byte for byte, with repeats
   * folded — the unique index is keyed on the pattern, so one string is one row however many times
   * the array says it.
   */
  claims: string[]
  /** How many entries were folded away as repeats of a string already in `claims`. */
  repeats: number
  /**
   * Patterns already keyed in the map from an earlier run, counted and not written again.
   *
   * READ THE WAY THE UNIQUE INDEX IS KEYED, AND `deleted_at` IS NOT IN IT
   * (`implementation_map_one_idx`, schema.ts:1262). A row somebody retired is still keyed, so
   * writing that claim again would not make a second row — it would fail the index and take the
   * whole transaction down with it.
   */
  alreadyThere: string[]
  /**
   * Of those, the ones somebody has since retired.
   *
   * A MIGRATION DOES NOT RESURRECT A DELETION. Somebody removed that statement on purpose, and
   * writing it again because the record still carried the old field would undo their act silently.
   * The claim still counts as accounted for by check 1 — the row is in the corpus and findable, it
   * is simply not live, which is a thing the map can say and `data.claims` never could.
   */
  retiredEarlier: string[]
  /** The record's `data` with `claims` removed and every other key in the order it was in. */
  data: string
}

/** One module or one claim string this migration would not touch, and why. */
export interface SkipNote {
  kind: 'deleted_module' | 'claims_not_an_array' | 'claim_not_a_string' | 'unreadable_data'
  recordId: string
  detail: string
}

/** A claim string that migrates and that `POST /api/implementation` would refuse if it were sent today. */
export interface PatternTheDoorWouldRefuse {
  recordId: string
  pattern: string
  problem: string
}

export interface Report {
  /** True when no live module holds a claim, so this run wrote nothing. */
  alreadyDone: boolean
  /** How many modules were emptied. */
  modules: number
  /** How many `implementation_map` rows were written. */
  rows: number
  /** Of those, how many name a path under `tests/` and still say `implements`. */
  rowsPointingAtTests: number
  /** Rows that were already keyed in the map from an earlier run, counted and not written again. */
  rowsAlreadyThere: number
  /** Of those, how many somebody had retired. Named, because a migration does not undo a deletion. */
  rowsRetiredEarlier: number
  /** Claim strings folded away because the same module listed them twice. */
  repeatsFolded: number
  /** How many newest revisions were rewritten so their hash still names what the record holds. */
  ledgerRestamped: number
  /** Which repository each project's claims went into, and how that was decided. */
  repositories: RepositoryChosen[]
  /** Claims that migrate and that the write door would refuse today. Migrated, never repaired. */
  patternsTheWriteDoorWouldRefuse: PatternTheDoorWouldRefuse[]
  /** Every module or claim string this would not guess at. */
  notes: SkipNote[]
}

/** As much of a record row as this file reads. */
interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string
}

/** Whether a table is there at all. A fresh database, or one migrated part-way, may not have it. */
function tableIsThere(sqlite: Database.Database, name: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

/**
 * WHAT IS IN THE OLD SHAPE, ASKED OF THE DATABASE.
 *
 * Used twice: once before anything is written, to compare against what the caller says it measured;
 * and once inside the transaction as check 4, where both answers must be zero. Asking the database
 * rather than counting the plan is the point — "it is done" is then a measurement rather than the
 * absence of an error.
 *
 * LIVE MODULES ONLY, because a deleted one is deliberately left as it is, and a count that included
 * it could never reach zero.
 */
export function countModuleClaims(sqlite: Database.Database): MeasuredClaims {
  if (!tableIsThere(sqlite, 'records')) return { modules: 0, claims: 0 }
  const row = sqlite
    .prepare(
      "SELECT count(*) AS modules, coalesce(sum(json_array_length(data, '$.claims')), 0) AS claims FROM records " +
        "WHERE kind = 'module' AND deleted_at IS NULL AND json_type(data, '$.claims') = 'array' " +
        "AND json_array_length(data, '$.claims') > 0",
    )
    .get() as { modules: number; claims: number }
  return { modules: row.modules, claims: row.claims }
}

/** Every repository row, as little of it as this file needs. */
function repositoriesIn(sqlite: Database.Database, workspaceId: string): { id: string; name: string }[] {
  if (!tableIsThere(sqlite, 'repositories')) return []
  return sqlite
    .prepare('SELECT id, name FROM repositories WHERE workspace_id = ? ORDER BY name')
    .all(workspaceId) as { id: string; name: string }[]
}

/**
 * WHICH REPOSITORY EACH PROJECT'S CLAIMS ARE RELATIVE TO.
 *
 * `named` is what the caller decided, keyed on the workspace id. Where it says nothing and the
 * project holds exactly one repository, that one is used: one candidate is the only answer there
 * is, not a guess between several. Zero or more than one and the project is UNANSWERED, which
 * refuses the whole run.
 *
 * Separated from the planning below so that a caller can ask what it would do — and so that the
 * refusal can be read without a database that is ready to be written to.
 */
export function chooseRepositories(
  sqlite: Database.Database,
  workspaces: readonly { workspaceId: string; modules: number; claims: number }[],
  named: Readonly<Record<string, string>>,
): { chosen: RepositoryChosen[]; unanswered: Unanswered[] } {
  const chosen: RepositoryChosen[] = []
  const unanswered: Unanswered[] = []
  for (const holder of workspaces) {
    const here = repositoriesIn(sqlite, holder.workspaceId)
    const askedFor = named[holder.workspaceId]
    if (askedFor !== undefined) {
      const found = here.find((one) => one.id === askedFor)
      if (found === undefined) {
        unanswered.push({
          workspaceId: holder.workspaceId,
          modules: holder.modules,
          claims: holder.claims,
          why:
            `you named repository ${askedFor} for this project and there is no repository of that id in it. ` +
            (here.length === 0
              ? 'It holds none at all.'
              : `It holds ${here.map((one) => `${one.name} (${one.id})`).join(', ')}.`),
        })
        continue
      }
      chosen.push({
        workspaceId: holder.workspaceId,
        repositoryId: found.id,
        name: found.name,
        how: 'named by the caller',
      })
      continue
    }
    const only = here[0]
    if (here.length === 1 && only !== undefined) {
      chosen.push({
        workspaceId: holder.workspaceId,
        repositoryId: only.id,
        name: only.name,
        how: 'the only repository in that project',
      })
      continue
    }
    unanswered.push({
      workspaceId: holder.workspaceId,
      modules: holder.modules,
      claims: holder.claims,
      why:
        here.length === 0
          ? 'it holds no repository at all, so there is no tree for a repository-relative pattern to be relative to. ' +
            'Register one — POST /api/implementation/repositories — or name an existing one from another project.'
          : `it holds ${String(here.length)} repositories — ${here
              .map((one) => `${one.name} (${one.id})`)
              .join(', ')} — and which of them a claim written before repositories existed meant is a fact about ` +
            'this machine rather than a fact in the database. Name one.',
    })
  }
  return { chosen, unanswered }
}

/**
 * `data` with `claims` taken out and EVERY OTHER KEY IN THE ORDER IT WAS IN.
 *
 * The record's own key order is preserved because it is part of the content hash: rebuilding the
 * object in a different order would change the token on every module for no reason, and every open
 * editor holding one would be refused as stale.
 */
function dataWithoutClaims(data: string): string {
  const read = JSON.parse(data) as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(read)) {
    if (key === 'claims') continue
    next[key] = value
  }
  return JSON.stringify(next)
}

/** What this migration would do, without doing any of it. The preview, the runner and the test read this. */
export function planModuleClaims(
  sqlite: Database.Database,
  named: Readonly<Record<string, string>> = {},
): {
  moves: ModuleMove[]
  notes: SkipNote[]
  unanswered: Unanswered[]
  repositories: RepositoryChosen[]
  patternsTheWriteDoorWouldRefuse: PatternTheDoorWouldRefuse[]
} {
  const notes: SkipNote[] = []
  if (!tableIsThere(sqlite, 'records')) {
    return { moves: [], notes, unanswered: [], repositories: [], patternsTheWriteDoorWouldRefuse: [] }
  }

  const rows = sqlite
    .prepare("SELECT id, workspace_id, title, data, deleted_at FROM records WHERE kind = 'module' ORDER BY id")
    .all() as { id: string; workspace_id: string; title: string; data: string; deleted_at: string | null }[]

  /** One candidate module, before a repository has been chosen for its project. */
  interface Candidate {
    recordId: string
    workspaceId: string
    title: string
    claims: string[]
    repeats: number
    data: string
  }
  const candidates: Candidate[] = []

  for (const row of rows) {
    let read: unknown
    try {
      read = JSON.parse(row.data)
    } catch {
      notes.push({
        kind: 'unreadable_data',
        recordId: row.id,
        detail: 'the stored JSON does not parse, so nothing here knows what it was meant to say',
      })
      continue
    }
    if (typeof read !== 'object' || read === null || Array.isArray(read)) continue
    const held = (read as Record<string, unknown>)['claims']
    if (held === undefined) continue
    if (!Array.isArray(held)) {
      notes.push({
        kind: 'claims_not_an_array',
        recordId: row.id,
        detail: `data.claims is a ${typeof held} and a list of patterns is what this migration knows how to move`,
      })
      continue
    }
    if (held.length === 0) continue

    // A DELETED MODULE IS LEFT EXACTLY AS IT IS. `declareRelationship` refuses a relationship on a
    // deleted record, so a migration must not create one behind its back.
    if (row.deleted_at !== null) {
      notes.push({
        kind: 'deleted_module',
        recordId: row.id,
        detail:
          `it was deleted on ${row.deleted_at} and still holds ${String(held.length)} claims. A relationship ` +
          'written onto a deleted record is a statement nothing draws, so its claims stay where they are. Restore ' +
          'it and run this again if they should move.',
      })
      continue
    }

    const claims: string[] = []
    let repeats = 0
    for (const claim of held) {
      if (typeof claim !== 'string') {
        notes.push({
          kind: 'claim_not_a_string',
          recordId: row.id,
          detail: `one entry of data.claims is a ${typeof claim} and a pattern is a string, so it is left as it is`,
        })
        continue
      }
      // THE UNIQUE INDEX IS KEYED ON THE PATTERN, so one string is one row however many times the
      // stored array names it. Folded here rather than at the insert, so the count in the report is
      // the count of rows and the check below compares like with like.
      if (claims.includes(claim)) {
        repeats += 1
        continue
      }
      claims.push(claim)
    }

    // A module every one of whose entries was refused above has nothing to move and its `claims`
    // key is left alone, because emptying it would throw away the entries this file would not read.
    if (claims.length === 0) continue

    candidates.push({
      recordId: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      claims,
      repeats,
      data: dataWithoutClaims(row.data),
    })
  }

  const perWorkspace = new Map<string, { workspaceId: string; modules: number; claims: number }>()
  for (const candidate of candidates) {
    const held = perWorkspace.get(candidate.workspaceId) ?? {
      workspaceId: candidate.workspaceId,
      modules: 0,
      claims: 0,
    }
    held.modules += 1
    held.claims += candidate.claims.length
    perWorkspace.set(candidate.workspaceId, held)
  }
  const { chosen, unanswered } = chooseRepositories(sqlite, [...perWorkspace.values()], named)
  const repositoryOf = new Map(chosen.map((one) => [one.workspaceId, one.repositoryId]))

  // NO `deleted_at` CLAUSE, because `implementation_map_one_idx` has none either. What is keyed is
  // what cannot be written again, whether or not somebody has retired it.
  const existing = tableIsThere(sqlite, 'implementation_map')
    ? sqlite.prepare(
        'SELECT pattern, deleted_at FROM implementation_map WHERE workspace_id = ? AND record_id = ? ' +
          'AND repository_id = ? AND relation = ? AND provenance = ?',
      )
    : null

  const moves: ModuleMove[] = []
  const patternsTheWriteDoorWouldRefuse: PatternTheDoorWouldRefuse[] = []
  for (const candidate of candidates) {
    const repositoryId = repositoryOf.get(candidate.workspaceId)
    // No repository for this project: it is already in `unanswered`, which refuses the whole run.
    // Planning a move against a repository id nothing chose would be the guess this refuses to make.
    if (repositoryId === undefined) continue
    const keyed =
      existing === null
        ? []
        : (
            existing.all(
              candidate.workspaceId,
              candidate.recordId,
              repositoryId,
              THE_ONE_RELATION,
              THE_ONE_PROVENANCE,
            ) as { pattern: string; deleted_at: string | null }[]
          ).filter((one) => candidate.claims.includes(one.pattern))
    const alreadyThere = keyed.map((one) => one.pattern)
    const retiredEarlier = keyed.filter((one) => one.deleted_at !== null).map((one) => one.pattern)
    for (const claim of candidate.claims) {
      const problem = claimProblem(claim)
      if (problem !== null) patternsTheWriteDoorWouldRefuse.push({ recordId: candidate.recordId, pattern: claim, problem })
    }
    moves.push({
      recordId: candidate.recordId,
      workspaceId: candidate.workspaceId,
      title: candidate.title,
      repositoryId,
      claims: candidate.claims,
      repeats: candidate.repeats,
      alreadyThere,
      retiredEarlier,
      data: candidate.data,
    })
  }

  return { moves, notes, unanswered, repositories: chosen, patternsTheWriteDoorWouldRefuse }
}

/**
 * DO IT. One transaction: every claim becomes a row, every module loses one key, the ledger agrees
 * — or nothing moves at all.
 *
 * @param measured what the caller says it counted. Re-measured here and compared before a single
 *   row is written; any difference refuses the whole run, naming both numbers.
 * @param named which repository each project's claims are relative to, keyed on the workspace id.
 *   A project this cannot answer for refuses the whole run rather than being placed by a guess.
 */
export function migrateModuleClaims(
  sqlite: Database.Database,
  measured: MeasuredClaims,
  named: Readonly<Record<string, string>> = {},
): Report {
  const here = countModuleClaims(sqlite)
  const wrong: string[] = []
  if (here.modules !== measured.modules) {
    wrong.push(`you measured ${measured.modules} live modules holding claims; this database holds ${here.modules}`)
  }
  if (here.claims !== measured.claims) {
    wrong.push(`you measured ${measured.claims} claim strings; this database holds ${here.claims}`)
  }
  if (wrong.length > 0) {
    throw new Error(
      `This is not the corpus that was counted, so nothing was written.\n  ${wrong.join('\n  ')}\n` +
        'Re-run `MOLE_OFFICE_DB=<copy> npx tsx tools/count-the-map.ts` against this database and hand the runner what ' +
        'it prints. A migration that runs against a corpus nobody counted is a broken assumption carried quietly.',
    )
  }

  const planned = planModuleClaims(sqlite, named)
  if (planned.unanswered.length > 0) {
    throw new Error(
      'Nothing was written, because this migration will not decide which repository a claim is relative to.\n' +
        planned.unanswered
          .map(
            (one) =>
              `  project "${one.workspaceId}" holds ${String(one.modules)} modules and ${String(one.claims)} ` +
              `claims, and ${one.why}`,
          )
          .join('\n') +
        '\nA claim is written relative to a repository root and `data.claims` never said which root, because when ' +
        'it was written there was only ever one. Which one those strings mean is a fact about this machine and ' +
        'not a fact in the database, so it is answered by a person once rather than picked here.',
    )
  }

  const report: Report = {
    alreadyDone: planned.moves.length === 0,
    modules: 0,
    rows: 0,
    rowsPointingAtTests: 0,
    rowsAlreadyThere: 0,
    rowsRetiredEarlier: 0,
    repeatsFolded: 0,
    ledgerRestamped: 0,
    repositories: planned.repositories,
    patternsTheWriteDoorWouldRefuse: planned.patternsTheWriteDoorWouldRefuse,
    notes: planned.notes,
  }
  if (planned.moves.length === 0) return report

  const addRow = sqlite.prepare(
    'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, ' +
      'note, revision_id, stated_at, stated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const readRecord = sqlite.prepare(
    'SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?',
  )
  const newestRevision = sqlite.prepare(
    'SELECT id, seq, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1',
  )
  const restamp = sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
  const ledgerIsThere = tableIsThere(sqlite, 'revisions')

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const move of planned.moves) {
      for (const pattern of move.claims) {
        if (move.alreadyThere.includes(pattern)) {
          report.rowsAlreadyThere += 1
          if (move.retiredEarlier.includes(pattern)) report.rowsRetiredEarlier += 1
          continue
        }
        addRow.run(
          anOfficeId(),
          move.workspaceId,
          move.recordId,
          move.repositoryId,
          // VERBATIM. Not trimmed, not normalised, not reclassified. The string in the corpus is
          // the statement and this migration is not its author.
          pattern,
          THE_ONE_RELATION,
          THE_ONE_PROVENANCE,
          ROW_NOTE,
          null,
          at,
          MIGRATION_ACTOR,
        )
        report.rows += 1
        if (pattern.startsWith('tests/')) report.rowsPointingAtTests += 1
      }
      setData.run(move.data, move.recordId)
      report.modules += 1
      report.repeatsFolded += move.repeats
    }

    // ---- THE LEDGER, AFTER EVERY RECORD HAS MOVED, so the content it is stamped from is the final
    // one.
    if (ledgerIsThere) {
      for (const move of planned.moves) {
        const row = readRecord.get(move.recordId) as RecordRow | undefined
        if (row === undefined) {
          throw new Error(`Record ${move.recordId} went between planning this migration and running it.`)
        }
        const newest = newestRevision.get(move.recordId) as { id: string; seq: number; note: string | null } | undefined
        if (newest === undefined) continue
        const content = contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        })
        restamp.run(JSON.stringify(content.data), versionOf(content), newest.note ?? REVISION_NOTE, newest.id)
        report.ledgerRestamped += 1
      }
    }

    checkEverything(sqlite, planned.moves)
  })

  run()
  return report
}

/** The four checks, in order, all thrown from inside the transaction. */
function checkEverything(sqlite: Database.Database, moves: readonly ModuleMove[]): void {
  const readRecord = sqlite.prepare(
    'SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?',
  )
  // KEYED THE WAY `implementation_map_one_idx` IS KEYED, with no `deleted_at` clause. A claim whose
  // row somebody retired is accounted for: the row is in the corpus and findable. Writing it again
  // would undo a deletion somebody made on purpose, which is worse than the field going away.
  const patternsOf = sqlite.prepare(
    'SELECT pattern FROM implementation_map WHERE workspace_id = ? AND record_id = ? AND repository_id = ? ' +
      'AND relation = ? AND provenance = ?',
  )

  // ---- CHECK 1. EVERY CLAIM STRING IS A ROW, READ BACK OUT OF THE TABLE AND COMPARED VERBATIM.
  // THIS IS THE ONE THAT CATCHES AN OFF-BY-ONE. A loop one short writes 151 rows and empties all 15
  // records, and every count in the report still looks plausible — while the claim with no row is
  // gone from the ledger too, because the restamp rewrote the only revision that held it.
  for (const move of moves) {
    const stored = new Set(
      (
        patternsOf.all(
          move.workspaceId,
          move.recordId,
          move.repositoryId,
          THE_ONE_RELATION,
          THE_ONE_PROVENANCE,
        ) as { pattern: string }[]
      ).map((one) => one.pattern),
    )
    for (const claim of move.claims) {
      if (stored.has(claim)) continue
      throw new Error(
        `Check 1 failed and nothing was written. Module ${move.recordId} ("${move.title}") held the claim ` +
          `${JSON.stringify(claim)} and no row of the implementation map says it. ${String(stored.size)} of its ` +
          `${String(move.claims.length)} claims are there. The key is removed in this same transaction and these ` +
          'modules hold one revision each, so a claim with no row is a claim gone from the corpus altogether.',
      )
    }
  }

  // ---- CHECK 2. EVERY MODULE'S `data` IS WHAT IT WAS, MINUS ONE KEY. Re-read from the row and
  // compared byte for byte, so a rewrite that reordered the keys or dropped a second one is caught
  // here rather than by a hash disagreement two floors away.
  for (const move of moves) {
    const row = readRecord.get(move.recordId) as RecordRow | undefined
    if (row === undefined) throw new Error(`Record ${move.recordId} went while this migration was running.`)
    if (row.data !== move.data) {
      throw new Error(
        `Check 2 failed and nothing was written. Module ${move.recordId} ("${move.title}") was meant to hold ` +
          `${move.data} and holds ${row.data}. Every key but \`claims\` should be exactly where it was, in the ` +
          'order it was in, because that order is part of the content hash.',
      )
    }
    if ((JSON.parse(row.data) as Record<string, unknown>)['claims'] !== undefined) {
      throw new Error(
        `Check 2 failed and nothing was written. Module ${move.recordId} ("${move.title}") still holds a \`claims\` ` +
          'key, so the field was copied rather than moved and the same statement now lives in two places, free to ' +
          'disagree with itself the first time either is edited.',
      )
    }
  }

  // ---- CHECK 3. EVERY TOUCHED RECORD'S NEWEST REVISION NAMES WHAT THE RECORD NOW HOLDS. Re-read,
  // not assumed.
  if (tableIsThere(sqlite, 'revisions')) {
    const newestHash = sqlite.prepare(
      'SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1',
    )
    for (const move of moves) {
      const row = readRecord.get(move.recordId) as RecordRow | undefined
      if (row === undefined) continue
      const held = newestHash.get(move.recordId) as { content_hash: string } | undefined
      if (held === undefined) continue
      const want = versionOf(
        contentOf({
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          data: JSON.parse(row.data) as Record<string, unknown>,
          deletedAt: row.deleted_at,
        }),
      )
      if (held.content_hash !== want) {
        throw new Error(
          `Check 3 failed and nothing was written. Module ${move.recordId}'s newest revision is stamped ` +
            `${held.content_hash} and the record now hashes to ${want}. Left as it was, every write to that ` +
            'record would be refused as stale, for ever.',
        )
      }
    }
  }

  // ---- CHECK 4. NO LIVE MODULE IS LEFT HOLDING `data.claims`, asked of the DATABASE rather than
  // counted off the plan.
  const left = countModuleClaims(sqlite)
  if (left.modules !== 0 || left.claims !== 0) {
    throw new Error(
      `Check 4 failed and nothing was written. After the run this database still holds ${left.modules} live ` +
        `modules carrying ${left.claims} claims. "It is done" has to be a measurement rather than the absence of ` +
        'an error.',
    )
  }
}

/** The report as a person reads it. Every number the transaction produced, and nothing invented. */
export function describeModuleClaims(report: Report): string {
  if (report.alreadyDone) {
    const why =
      report.notes.length === 0
        ? 'no live module holds a `data.claims` this migration can move.'
        : `no live module holds a \`data.claims\` this migration can move; ${report.notes.length} were left as they are.`
    return `module claims: Nothing to do: ${why}`
  }
  const lines = [
    `module claims: ${report.rows} implementation map rows written from ${report.modules} modules, and the key is off all of them.`,
    `  every row says relation "${THE_ONE_RELATION}" and provenance "${THE_ONE_PROVENANCE}", including the ` +
      `${report.rowsPointingAtTests} that point at tests/ — \`data.claims\` had one word for all of it and a ` +
      'migration that improves the data is a migration that lies about the past.',
    `  ${report.ledgerRestamped} newest revisions restamped, so no touched record is left unwritable.`,
  ]
  for (const repository of report.repositories) {
    lines.push(`  project "${repository.workspaceId}" -> repository "${repository.name}" (${repository.how}).`)
  }
  if (report.rowsAlreadyThere > 0) {
    lines.push(
      `  ${report.rowsAlreadyThere} rows were already keyed in the map from an earlier run and were not written ` +
        `again; ${report.rowsRetiredEarlier} of those had been retired, and a migration does not undo a deletion.`,
    )
  }
  if (report.repeatsFolded > 0) {
    lines.push(
      `  ${report.repeatsFolded} claim strings were listed twice by one module and are one row each, because the ` +
        'unique index is keyed on the pattern.',
    )
  }
  for (const refused of report.patternsTheWriteDoorWouldRefuse) {
    lines.push(
      `  MIGRATED AND NAMED — ${refused.recordId} claims ${JSON.stringify(refused.pattern)}, which ` +
        `${refused.problem}. It is carried over as it is, because repairing it here would be this migration ` +
        'inventing a statement.',
    )
  }
  for (const note of report.notes) lines.push(`  LEFT AS IT IS — module ${note.recordId}: ${note.detail}`)
  return lines.join('\n')
}
