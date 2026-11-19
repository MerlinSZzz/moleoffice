// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BLOCK'S TITLE BECOMES ITS OWN NAME. ONE TRANSACTION, WRITTEN AND PROVED AND NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN THREE LINES
 * ---------------------------------------------------------------------------------------
 *
 *   "Transplant v2 › Sense the pot"  ->   "Sense the pot"
 *   a title with no pipeline prefix  ->   left exactly as it is
 *   any refusal                      ->   nothing is written at all
 *
 * A block's stored title carries its pipeline: `<pipeline title> › <block name>`. That string is
 * the only place a block's pipeline is written down as a fact about the block, and every reader
 * that shows a block outside its own pipeline throws half of it away. It is also what makes a block
 * belong to exactly one pipeline: two pipelines cannot both be in one string, so a rename of either
 * would fight over it. Undoing that is what this migration is.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT LIVES HERE AND NOT IN src/server/db/
 * ---------------------------------------------------------------------------------------
 *
 * It is NOT registered in `migrateInPlace`, and it must not be. `npm run db:migrate` runs on every
 * clone and on every server start, and this rewrites 89 rows of the owner's corpus. It is applied
 * by its own runner, `run-block-identity.mjs`, against a named database, which refuses the live
 * corpus by name. Round ten's window B is when it runs for real.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES A CORPUS IT HAS NOT MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Eleven counts are re-measured against the database in front of it and compared with what the
 * caller says it measured. Any difference and the whole thing refuses, naming each one. A migration
 * that runs against a corpus nobody counted is the fourth invariant broken — a broken assumption
 * carried quietly — and this one rewrites a primary display field on every block there is.
 *
 * THE COUNTS ARE A PARAMETER AND NOT A CONSTANT. The runner holds the corpus's numbers, with the
 * date they were taken. A test holds its own fixture's. Baking the corpus's numbers in here would
 * make the function untestable against anything else, and the first thing anybody would do is take
 * the check out.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE REFUSALS THAT ARE NOT ABOUT COUNTS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A new title that is empty. A block called nothing is not addressable at all.
 *   2. Two live blocks of one pipeline that would end with the same title. That is the state the
 *      write door refuses, so a migration must not create it. `duplicateTitlesInPipeline` in
 *      src/shared/blocks.ts is the one statement of that rule and this asks it rather than writing
 *      a second copy.
 *   3. A new title that still holds the separator. A block whose OWN name contains ` › ` would be
 *      cut again by a second run, so this rule could not be idempotent for it. Measured on the
 *      corpus copy on 25 August 2026: no block is in that state. It refuses rather than trusting
 *      that, because a second run that quietly shortened a title is unrecoverable.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES PER RETITLED BLOCK, AND THE FORK THAT IS STATED RATHER THAN HIDDEN
 * ---------------------------------------------------------------------------------------
 *
 *   - the new `records.title`;
 *   - one `changes` row: `op='update'`, `field='title'`, the old title and the new one, actor
 *     `system`. Without it the retitle is invisible in the change log, which is the one place a
 *     reader looks to ask "why is this called something else now";
 *   - one NEW revision: `op='update'`, actor `system`, a note naming this migration, `seq` one past
 *     the newest, `content_hash` from `versionOf` itself rather than a second hasher.
 *
 * THE BUILD PLAN'S STEP 1 SAYS RESTAMP THE NEWEST REVISION; `ontology.md` §9.3 SAYS WRITE ONE. They
 * are two different acts and this writes one, for a reason that is about what would be lost.
 * Restamping rewrites the newest revision's stored title in place. 60 of the 89 blocks in the
 * corpus have exactly one revision, so for those the composed title would be gone from the ledger
 * altogether — and the build plan's own step 4 keeps `splitBlockTitle` and `blockNameIn` **for
 * ever** on the grounds that "revisions written before the migration hold composed titles for
 * ever". Restamping is what would make that sentence false. A new revision keeps every old one
 * exactly as it is, and the agreement check below is satisfied either way.
 *
 * ---------------------------------------------------------------------------------------
 * THE LEDGER IS PUT RIGHT IN THE SAME TRANSACTION, AND RE-READ
 * ---------------------------------------------------------------------------------------
 *
 * A record's newest revision holds what the record holds, and its `content_hash` IS the token a
 * read hands back as `version` and a write has to send back to prove it is not stale. So after
 * every row has moved, every touched record is re-read and its newest revision's hash compared with
 * `versionOf` of what the record now holds. A disagreement throws from inside the transaction, so
 * the whole migration rolls back. Reporting it afterwards would be a repair nobody can make: the
 * write is already committed and the old content is gone.
 *
 * ---------------------------------------------------------------------------------------
 * IDEMPOTENT, AND HERE IS WHY
 * ---------------------------------------------------------------------------------------
 *
 * The new title is worked out by stripping the pipeline's own title and the separator, exactly, and
 * only when the stored title really begins with it. After one run no title begins with a pipeline's
 * title, so a second run computes the same title it already holds, writes nothing, and reports
 * `alreadyDone`. Refusal 3 above is what keeps that true for a block whose own name holds a
 * separator.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { blockNameIn, duplicateTitlesInPipeline, splitBlockTitle } from '../../shared/blocks.ts'
import { contentOf, versionOf } from './version.ts'
import { nowStamp } from '../../shared/time.ts'

/** The separator, read from the shared reader rather than typed again. */
const JOINER = ' › '

/**
 * The eleven counts this migration re-measures before it writes anything.
 *
 * Every one of them is a fact the retitle depends on. They are named rather than numbered so that a
 * refusal says which one moved, and so that adding a twelfth is a compile error at every caller
 * rather than an array that quietly got longer.
 */
export interface BlockIdentityCounts {
  /** Every record of kind `block`, deleted or not. */
  blockRecords: number
  liveBlocks: number
  deletedBlocks: number
  /** Blocks whose stored title carries the separator. These are the ones that would move. */
  composedTitles: number
  livePipelines: number
  deletedPipelines: number
  /** Live blocks no LIVE pipeline lists. Their prefix comes off a soft-deleted pipeline. */
  liveBlocksInNoLivePipeline: number
  /** Live blocks more than one live pipeline lists. The write door refuses this today. */
  liveBlocksInMoreThanOneLivePipeline: number
  /** Blocks whose new title would be the empty string. Anything above zero is a refusal. */
  blocksWhoseNewTitleWouldBeEmpty: number
  /** Live pipelines that would hold two live blocks with one title. Above zero is a refusal. */
  pipelinesThatWouldHoldTwoBlocksWithOneTitle: number
  /** How many different titles the live blocks would end up with. */
  distinctNewTitlesAmongLiveBlocks: number
}

/** One block this migration would rename. */
export interface BlockRetitle {
  id: string
  workspaceId: string
  from: string
  to: string
  /** Which rule produced the new title. */
  by: 'the pipeline that lists it' | 'the first separator in the title'
  /** The pipeline whose title was stripped, when one was. */
  pipelineId: string | null
}

/** One row this migration will not touch, and why. Reported, never silently skipped. */
export interface BlockIdentityRefusal {
  blockId: string
  title: string
  reason: string
}

export interface BlockIdentityReport {
  /** True when no title carried a pipeline prefix, so this run wrote nothing. */
  alreadyDone: boolean
  counts: BlockIdentityCounts
  retitled: number
  /** Of those, how many took their name off a pipeline that lists them. */
  fromTheirPipeline: number
  /** Of those, how many had no pipeline at all and were cut at the first separator. */
  fromTheSeparator: number
  changeRows: number
  revisions: number
  /** How many blocks already held a bare title and were left alone. */
  alreadyBare: number
}

interface BlockRow {
  id: string
  workspace_id: string
  title: string
  deleted_at: string | null
}

interface PipelineRow {
  id: string
  workspace_id: string
  title: string
  deleted_at: string | null
  data: string
}

interface FullRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string
}

function orderOf(row: PipelineRow): string[] {
  let data: unknown
  try {
    data = JSON.parse(row.data)
  } catch {
    return []
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const raw = (data as Record<string, unknown>)['blockIds']
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').map((entry) => entry.trim())
}

/**
 * What this migration would do, worked out and nothing written.
 *
 * DELETED PIPELINES ARE READ HERE and `pipelinesHolding` does not read them. That is deliberate and
 * it is why this walk is its own: three live blocks in the corpus are listed only by pipelines
 * somebody soft-deleted on 12 August, and their titles carry those pipelines' names. Taking the
 * prefix off by the exact reader that put it on is the only way to get their real names back.
 */
export function planBlockIdentity(sqlite: Database.Database): {
  retitles: BlockRetitle[]
  refusals: BlockIdentityRefusal[]
  counts: BlockIdentityCounts
  alreadyBare: number
} {
  const blocks = sqlite.prepare("SELECT id, workspace_id, title, deleted_at FROM records WHERE kind = 'block'").all() as BlockRow[]
  const pipelines = sqlite
    .prepare("SELECT id, workspace_id, title, deleted_at, data FROM records WHERE kind = 'pipeline'")
    .all() as PipelineRow[]

  const holders = new Map<string, PipelineRow[]>()
  for (const pipeline of pipelines) {
    for (const blockId of orderOf(pipeline)) {
      const list = holders.get(blockId)
      if (list === undefined) holders.set(blockId, [pipeline])
      else list.push(pipeline)
    }
  }
  // Live pipelines first, so a block a live pipeline and a deleted one both list takes its name
  // from the live one.
  const holdersOf = (blockId: string): PipelineRow[] => {
    const found = holders.get(blockId) ?? []
    return [...found].sort((a, b) => (a.deleted_at === null ? 0 : 1) - (b.deleted_at === null ? 0 : 1))
  }

  const retitles: BlockRetitle[] = []
  const refusals: BlockIdentityRefusal[] = []
  const newTitle = new Map<string, string>()
  let alreadyBare = 0

  for (const block of blocks) {
    let to: string | null = null
    let by: BlockRetitle['by'] = 'the first separator in the title'
    let pipelineId: string | null = null
    for (const pipeline of holdersOf(block.id)) {
      const stripped = blockNameIn(block.title, pipeline.title)
      if (stripped !== block.title) {
        to = stripped
        by = 'the pipeline that lists it'
        pipelineId = pipeline.id
        break
      }
    }
    if (to === null) to = splitBlockTitle(block.title)?.name ?? block.title
    newTitle.set(block.id, to)
    if (to === block.title) {
      alreadyBare += 1
      continue
    }
    if (to.trim() === '') {
      refusals.push({
        blockId: block.id,
        title: block.title,
        reason:
          'its whole title is its pipeline\'s title and the separator, so taking the prefix off leaves nothing. ' +
          'A block called nothing cannot be addressed by name at all.',
      })
      continue
    }
    if (to.includes(JOINER)) {
      refusals.push({
        blockId: block.id,
        title: block.title,
        reason:
          `its own name still holds the separator after the prefix comes off ("${to}"), so a second run of this ` +
          'migration would cut it again. This rule has to be idempotent, and for this row it would not be.',
      })
      continue
    }
    retitles.push({ id: block.id, workspaceId: block.workspace_id, from: block.title, to, by, pipelineId })
  }

  // The collision check, over the state this migration would LEAVE BEHIND, per live pipeline.
  const livePipelines = pipelines.filter((p) => p.deleted_at === null)
  const liveBlockIds = new Set(blocks.filter((b) => b.deleted_at === null).map((b) => b.id))
  let collidingPipelines = 0
  for (const pipeline of livePipelines) {
    const found = duplicateTitlesInPipeline(orderOf(pipeline), (blockId) =>
      liveBlockIds.has(blockId) ? (newTitle.get(blockId) ?? null) : null,
    )
    if (found.length === 0) continue
    collidingPipelines += 1
    for (const collision of found) {
      for (const held of collision.blocks) {
        refusals.push({
          blockId: held.id,
          title: collision.title,
          reason:
            `after this migration, ${collision.blocks.length} live blocks of the pipeline "${pipeline.title}" ` +
            `(${pipeline.id}) would all be called "${collision.title}" — at ${collision.blocks
              .map((b) => `position ${String(b.at)} (${b.id})`)
              .join(', ')}. That is the state the write door refuses, so this will not create it.`,
        })
      }
    }
  }

  const live = blocks.filter((b) => b.deleted_at === null)
  const counts: BlockIdentityCounts = {
    blockRecords: blocks.length,
    liveBlocks: live.length,
    deletedBlocks: blocks.length - live.length,
    composedTitles: blocks.filter((b) => b.title.includes(JOINER)).length,
    livePipelines: livePipelines.length,
    deletedPipelines: pipelines.length - livePipelines.length,
    liveBlocksInNoLivePipeline: live.filter((b) => holdersOf(b.id).filter((p) => p.deleted_at === null).length === 0).length,
    liveBlocksInMoreThanOneLivePipeline: live.filter((b) => holdersOf(b.id).filter((p) => p.deleted_at === null).length > 1).length,
    blocksWhoseNewTitleWouldBeEmpty: blocks.filter((b) => (newTitle.get(b.id) ?? b.title).trim() === '').length,
    pipelinesThatWouldHoldTwoBlocksWithOneTitle: collidingPipelines,
    distinctNewTitlesAmongLiveBlocks: new Set(live.map((b) => newTitle.get(b.id) ?? b.title)).size,
  }

  return { retitles, refusals, counts, alreadyBare }
}

/** Every count that differs between what the caller measured and what is in front of it. */
function countsThatMoved(expected: BlockIdentityCounts, found: BlockIdentityCounts): string[] {
  const moved: string[] = []
  for (const key of Object.keys(expected) as (keyof BlockIdentityCounts)[]) {
    if (expected[key] !== found[key]) moved.push(`${key}: measured ${String(expected[key])}, found ${String(found[key])}`)
  }
  return moved
}

/**
 * Do it. One transaction: either every block is renamed and the ledger agrees, or nothing moves.
 *
 * @param expected the eleven counts the caller measured. The whole migration refuses on any
 *   difference, because a migration that runs against a corpus it has not counted is a broken
 *   assumption carried quietly.
 */
export function migrateBlockIdentity(sqlite: Database.Database, expected: BlockIdentityCounts): BlockIdentityReport {
  const { retitles, refusals, counts, alreadyBare } = planBlockIdentity(sqlite)

  const moved = countsThatMoved(expected, counts)
  if (moved.length > 0) {
    throw new Error(
      'The block-identity migration was measured against a different database from the one in front of it, so it ' +
        'has written nothing. ' +
        moved.join('; ') +
        '. Re-measure with planBlockIdentity() and re-read what changed before running this again.',
    )
  }

  if (refusals.length > 0) {
    throw new Error(
      `The block-identity migration refuses ${String(refusals.length)} block${refusals.length === 1 ? '' : 's'} and ` +
        'has written nothing at all — not the ones it could have renamed either, because half a corpus of renamed ' +
        'blocks is worse than none. ' +
        refusals.map((r) => `${r.blockId} ("${r.title}"): ${r.reason}`).join(' | '),
    )
  }

  const report: BlockIdentityReport = {
    alreadyDone: retitles.length === 0,
    counts,
    retitled: 0,
    fromTheirPipeline: 0,
    fromTheSeparator: 0,
    changeRows: 0,
    revisions: 0,
    alreadyBare,
  }
  if (retitles.length === 0) return report

  const setTitle = sqlite.prepare('UPDATE records SET title = ? WHERE id = ?')
  const readRow = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?')
  const newestSeq = sqlite.prepare('SELECT max(seq) as seq FROM revisions WHERE record_id = ?')
  const addChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, workspace_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const addRevision = sqlite.prepare(
    'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, ' +
      'actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )

  const NOTE =
    'The block-identity migration took the pipeline\'s title off this block\'s own. Nobody chose it: the name is ' +
    'the one that was already inside the stored title, and its time is this migration\'s moment rather than the ' +
    'moment somebody wrote. Every earlier revision still holds the composed title.'

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const retitle of retitles) {
      setTitle.run(retitle.to, retitle.id)
      report.retitled += 1
      if (retitle.by === 'the pipeline that lists it') report.fromTheirPipeline += 1
      else report.fromTheSeparator += 1

      addChange.run(anOfficeId(), retitle.id, 'update', 'system', 'block-identity-migration', null, 'title', retitle.from, retitle.to, at, retitle.workspaceId)
      report.changeRows += 1
    }

    // THE LEDGER, AFTER EVERY TITLE HAS MOVED, so the content each revision is stamped from is the
    // final one.
    for (const retitle of retitles) {
      const row = readRow.get(retitle.id) as FullRow | undefined
      if (row === undefined) throw new Error(`Record ${retitle.id} went between planning this migration and running it.`)
      const content = contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: JSON.parse(row.data) as Record<string, unknown>,
        deletedAt: row.deleted_at,
      })
      const seq = ((newestSeq.get(retitle.id) as { seq: number | null } | undefined)?.seq ?? 0) + 1
      addRevision.run(
        anOfficeId(),
        retitle.id,
        row.workspace_id,
        seq,
        versionOf(content),
        row.kind,
        row.title,
        row.summary,
        JSON.stringify(content.data),
        row.deleted_at,
        'update',
        'system',
        'block-identity-migration',
        null,
        at,
        NOTE,
      )
      report.revisions += 1
    }

    checkTheLedger(sqlite, retitles)
  })

  run()
  return report
}

/**
 * EVERY RETITLED BLOCK'S NEWEST REVISION NAMES WHAT THE RECORD NOW HOLDS. Re-read, not assumed.
 *
 * Thrown from inside the transaction, so a disagreement rolls the whole migration back rather than
 * leaving a corpus whose compare-and-set token refuses every write.
 */
function checkTheLedger(sqlite: Database.Database, retitles: readonly BlockRetitle[]): void {
  const readRow = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?')
  const newest = sqlite.prepare('SELECT content_hash, title FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
  const wrong: string[] = []
  for (const retitle of retitles) {
    const row = readRow.get(retitle.id) as FullRow | undefined
    if (row === undefined) continue
    const held = newest.get(retitle.id) as { content_hash: string; title: string } | undefined
    if (held === undefined) {
      wrong.push(`${retitle.id} holds "${row.title}" and has no revision at all`)
      continue
    }
    const want = versionOf(
      contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: JSON.parse(row.data) as Record<string, unknown>,
        deletedAt: row.deleted_at,
      }),
    )
    if (held.content_hash !== want) wrong.push(`${retitle.id} holds ${want} and its newest revision says ${held.content_hash}`)
    if (held.title !== row.title) wrong.push(`${retitle.id} is called "${row.title}" and its newest revision says "${held.title}"`)
  }
  if (wrong.length > 0) {
    throw new Error(
      'The block-identity migration would have left the revision ledger naming content that is no longer there, ' +
        'which is the token every write compares against: ' +
        wrong.join('; ') +
        '. Nothing has been written — the whole transaction is rolled back.',
    )
  }
}

/** The report a runner prints. */
export function describeBlockIdentity(report: BlockIdentityReport): string {
  if (report.alreadyDone) {
    return `block identity: nothing to retitle (${String(report.alreadyBare)} of ${String(report.counts.blockRecords)} already hold their own name)`
  }
  return (
    `block identity: ${String(report.retitled)} retitled — ${String(report.fromTheirPipeline)} by the pipeline that lists them, ` +
    `${String(report.fromTheSeparator)} at the first separator; ${String(report.changeRows)} change rows and ` +
    `${String(report.revisions)} revisions written; ${String(report.alreadyBare)} already held their own name`
  )
}
