// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Turn every stored pipeline step into a block record. One transaction, or nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES, IN THE ORDER IT DOES IT
 * ---------------------------------------------------------------------------------------
 *
 *   1. Reads every pipeline that still stores `data.steps`.
 *   2. PLANS the whole change and collects every refusal, without writing anything.
 *   3. If there is a refusal, writes NOTHING and throws with all of them listed.
 *   4. Otherwise, in ONE transaction: creates one `block` record per step, rewrites the pipeline's
 *      `data.steps` to `data.blockIds`, turns `modules[]` into `implements` links, turns `needs[]`
 *      into `blocks` links carrying the gate, re-files the step-shaped change rows under the blocks
 *      they are about, and rewrites `presentation_intent` targets.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: THIS IS AN EXPLICIT NAMED EXCEPTION, AND HERE IS WHAT IT REWRITES
 * ---------------------------------------------------------------------------------------
 *
 * Decision 13 says a migration should normally preserve rows without rewriting them, that one which
 * MUST rewrite is an explicit named exception, and that there is no hidden migration rewrite. This
 * file ran before that decision was written down; the rule has caught up with it. Named:
 *
 *   `records.data` AND `records.updated_at` on the pipelines it migrates. `changes.field`,
 *   `changes.old_value` and `changes.new_value` on the `field = 'data.steps'` rows. And
 *   `presentation_intent.target` on the rows storing `step:<id>`. It also INSERTS records, links and
 *   changes, and DELETES the `implements` links the block-level ones replace, which is a deletion of
 *   a link rather than of a record and is reported by name in the run.
 *
 * WHY IT MUST REWRITE. A step was a nested object with no row of its own, and a block is a record.
 * The three reference spaces that pointed at a step have to point at the record instead, and the
 * pipeline's `data.steps` has to go, because keeping it beside `blockIds` would be two statements of
 * one fact with nothing making them agree. There is no additive form of that change.
 *
 * The list this is held to is DATA_MIGRATIONS in tests/migration.test.ts, which compares every cell
 * of every table before and after a real migration run against exactly the paragraph above.
 *
 * ---------------------------------------------------------------------------------------
 * THE BLOCK'S RECORD ID IS THE AUTHOR-WRITTEN STEP ID, VERBATIM
 * ---------------------------------------------------------------------------------------
 *
 * This is the first of the seven risks the audit ranked, and it is the one that cannot be undone
 * later. A step's whole history today is `changes` rows with `field = 'data.steps'` whose value is
 * the ENTIRE array; nothing in such a row identifies a step except the ids inside the JSON. So if
 * the ids are renumbered, "what happened to block hv2-04" becomes unanswerable from anything, and
 * B5 exists precisely to make that answerable.
 *
 * Preserving the id in a `legacyId` field would satisfy the letter of that. Making it the record id
 * satisfies it completely: every one of the four reference spaces that pointed at a step —
 * `needs[].stepId`, `presentation_intent.target`, `links.gate_up_to`, and the change-log JSON — goes
 * on naming the same string, and three of them need no rewriting at all.
 *
 * WHAT THAT COSTS, AND WHY IT IS STILL RIGHT. Record ids are nanoids everywhere else, so a block's
 * id looks different from every other record's. That is a cosmetic difference against a permanent
 * one. And the id has to be AVAILABLE: if a step id is already some other record's id, or two steps
 * share one, this REFUSES and names them. It does not mint a substitute, because a substitute is
 * exactly the renumbering the risk is about. Blocks created after the migration get ordinary
 * nanoids like every other record; nothing here applies to them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO GUESS, AND REPORTS INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 *   - A `modules[]` title naming no module. Dropping it loses recorded work; inventing the module
 *     invents an owner, which the brief forbids outright — "a step carried by no module at all is a
 *     real and useful answer". So it is REPORTED, by pipeline and step, and the block is filed with
 *     one fewer `implements` link than the step claimed. This is the only case that is reported and
 *     still applied, because the alternative is refusing to migrate a database over a typo in a
 *     module name.
 *   - A `links.gate_up_to` that does not resolve. It is free text nothing ever checked, so a gate
 *     naming a step of the WRONG pipeline is indistinguishable from a stage named in words. Every
 *     one is classified and reported: resolved, prose, or unresolvable. NOTHING IS REWRITTEN — the
 *     block's id is the step id, so a gate that resolved goes on resolving, and one that did not is
 *     left exactly as its author wrote it. At least one legitimate prose gate is expected to survive
 *     as prose, and the report says which.
 *   - A `field = 'data.steps'` change row mentioning a step id no block was made for. That row is
 *     the only record that step ever existed, so it is LEFT WHERE IT IS, on the pipeline, and
 *     reported by change id. Re-filing it would need a block to file it under, and inventing one
 *     would invent a step.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline with no `data.steps` key is already migrated and is skipped. So a second run over a
 * migrated database plans nothing, writes nothing, and reports zero of everything. `migrateInPlace`
 * calls it after the schema migrations for that reason: there is no journal row to add and nothing
 * to keep in step.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE AGAINST A DATABASE SOMEBODY HAS ALREADY HALF-MOVED
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline can be holding `blockIds` AND still storing `steps`, because the API refuses the key
 * `steps` outright and the obvious repair is to edit `data` by hand. This used to OVERWRITE the
 * held ids with whatever `steps` produced — nine live blocks replaced by an empty array, orphaned,
 * behind an exit code of 0 — and the plan phase now reads what is there before it writes. Where
 * both lists have content it REFUSES, because `blockIds` is the only statement of the pipeline's
 * ORDER and only its author can say where the remaining steps belong in it. See the block marked
 * `blockIds: READ what is already there before writing anything`.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { BLOCK_TITLE_SEPARATOR } from '@shared/blocks.ts'
import { nowStamp } from '@shared/time.ts'

/** A row of `records`, as this file needs it. Read with raw SQL, so the JSON is still text. */
interface RecordRow {
  id: string
  kind: string
  workspace_id: string
  owner_id: string
  title: string
  data: string
  deleted_at: string | null
  /**
   * Read because a block inherits its pipeline's stamps rather than the migration's clock. See the
   * note beside the block insert: stamping a block with "now" erases the age the attention rule
   * ranks on, and nothing in the database can recover it afterwards.
   */
  created_at: string
  updated_at: string
}

/** One step as the pipeline stored it, with nothing assumed about it. */
interface StoredStep {
  id?: unknown
  name?: unknown
  state?: unknown
  modules?: unknown
  measured?: unknown
  needs?: unknown
  consequence?: unknown
  paused?: unknown
}

/** A refusal: something the migration will not guess at, and will not proceed past. */
export interface BlockMigrationRefusal {
  /** What kind of refusal, so a caller can group them. */
  kind: 'duplicate_step_id' | 'id_taken' | 'title_taken' | 'unreadable_step' | 'no_step_id' | 'blocks_already_held'
  pipelineId: string
  pipelineTitle: string
  detail: string
}

/** Something the migration did that a person needs to know about, having done it. */
export interface BlockMigrationNote {
  kind:
    | 'module_not_found'
    | 'pipeline_implements_dropped'
    | 'pipeline_implements_kept'
    | 'gate_resolved'
    | 'gate_prose'
    | 'gate_unresolvable'
    | 'needs_absent'
    | 'history_left_on_pipeline'
    | 'intent_retargeted'
    | 'intent_unresolvable'
  detail: string
}

export interface BlockMigrationReport {
  /** True when there was nothing left to migrate. A second run always reports this. */
  alreadyDone: boolean
  pipelines: number
  blocks: number
  implementsLinks: number
  blocksLinks: number
  /** Module -> pipeline `implements` links deleted because the block-level ones now say it better. */
  pipelineImplementsDropped: number
  changeRowsRefiled: number
  intentRowsRewritten: number
  refusals: BlockMigrationRefusal[]
  notes: BlockMigrationNote[]
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The plan for one step: everything the write phase needs, decided before anything is written. */
interface PlannedBlock {
  /** The block's record id, which IS the author-written step id. */
  id: string
  title: string
  name: string
  data: Record<string, unknown>
  /** Module record ids to link from, resolved by title. */
  moduleIds: string[]
  /** `blocks` links to create: this block waits on these. */
  needs: { fromId: string; gate: string; upTo: string | null }[]
}

interface PlannedPipeline {
  record: RecordRow
  blocks: PlannedBlock[]
  /** The pipeline's `data` with `steps` gone and `blockIds` in its place. */
  data: Record<string, unknown>
}

/**
 * Work out the whole change without writing any of it.
 *
 * Exported so an operator can see what would happen before it does — and so the test can assert on
 * a refusal without needing a database it is willing to lose.
 */
export function planBlockMigration(sqlite: Database.Database): {
  plan: PlannedPipeline[]
  refusals: BlockMigrationRefusal[]
  notes: BlockMigrationNote[]
} {
  const refusals: BlockMigrationRefusal[] = []
  const notes: BlockMigrationNote[] = []

  const allRecords = sqlite.prepare('SELECT * FROM records').all() as RecordRow[]
  const byId = new Map(allRecords.map((r) => [r.id, r]))
  const titles = new Map(allRecords.map((r) => [`${r.workspace_id}\u0000${r.title}`, r]))
  const moduleByTitle = new Map<string, RecordRow>()
  for (const record of allRecords) {
    if (record.kind === 'module' && record.deleted_at === null) moduleByTitle.set(record.title, record)
  }

  const plan: PlannedPipeline[] = []
  // Every id this migration is about to claim, so two pipelines cannot both take one. Step ids were
  // measured as unique across the corpus, but that is luck rather than a rule: the browser's
  // `freeStepId` minted `step-<n>` per pipeline, so the first block created in two pipelines through
  // the UI would have been `step-1` twice.
  const claimingIds = new Map<string, string>()
  const claimingTitles = new Map<string, string>()

  for (const record of allRecords) {
    if (record.kind !== 'pipeline') continue
    let data: unknown
    try {
      data = JSON.parse(record.data)
    } catch {
      refusals.push({
        kind: 'unreadable_step',
        pipelineId: record.id,
        pipelineTitle: record.title,
        detail: 'its `data` column is not readable JSON, so its steps cannot be read at all',
      })
      continue
    }
    if (!isObj(data)) continue
    // Already migrated, or a pipeline that never had steps. Both are left exactly as they are.
    if (!Array.isArray(data['steps'])) continue

    const steps = data['steps'] as unknown[]
    const blocks: PlannedBlock[] = []
    const seenStepIds = new Map<string, number>()

    steps.forEach((raw, index) => {
      const at = index + 1
      if (!isObj(raw)) {
        refusals.push({
          kind: 'unreadable_step',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail: `step ${at} is ${raw === null ? 'null' : typeof raw}, not an object, so there is nothing to make a block from`,
        })
        return
      }
      const step = raw as StoredStep
      const id = str(step.id)
      if (id === null) {
        refusals.push({
          kind: 'no_step_id',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail:
            `step ${at} has no \`id\`. The id becomes the block's record id, and minting one would be the ` +
            `renumbering that makes the pre-migration history unreadable. Give it an id first.`,
        })
        return
      }
      const already = seenStepIds.get(id)
      if (already !== undefined) {
        refusals.push({
          kind: 'duplicate_step_id',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail:
            `steps ${already} and ${at} both have the id "${id}". Keying on the step id would merge two blocks ` +
            `into one and silently lose whichever came second, so nothing is migrated until one of them is ` +
            `given a different id.`,
        })
        return
      }
      seenStepIds.set(id, at)

      const takenBy = byId.get(id)
      if (takenBy !== undefined) {
        refusals.push({
          kind: 'id_taken',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail:
            `step ${at}'s id "${id}" is already the id of a ${takenBy.kind} called "${takenBy.title}". The block ` +
            `must keep the author-written id verbatim, and minting a different one would make this step's ` +
            `pre-migration history unreadable, so this is refused rather than worked around.`,
        })
        return
      }
      const claimedBy = claimingIds.get(id)
      if (claimedBy !== undefined) {
        refusals.push({
          kind: 'duplicate_step_id',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail: `step ${at}'s id "${id}" is also a step id in the pipeline "${claimedBy}". Record ids are unique across the workspace, so one of the two has to change.`,
        })
        return
      }
      claimingIds.set(id, record.title)

      const name = str(step.name)
      if (name === null) {
        refusals.push({
          kind: 'unreadable_step',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail: `step "${id}" has no \`name\`, and the name becomes the block's title. There is nothing to call it.`,
        })
        return
      }
      const state = str(step.state)
      if (state === null) {
        refusals.push({
          kind: 'unreadable_step',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail: `step "${id}" has no \`state\`, and a block requires one.`,
        })
        return
      }

      // THE TITLE THIS MIGRATION WROTE WHEN IT RAN, and it is deliberately still composed. A block's
      // title is its own name now. But this migration is a record of what
      // happened in August, and `block-identity.ts` is the later migration that renamed these rows.
      // Writing the new shape here would make the pair of migrations describe a past that never was.
      const title = `${record.title.trim()} ${BLOCK_TITLE_SEPARATOR} ${name.trim()}`
      const key = `${record.workspace_id}\u0000${title}`
      const clash = titles.get(key)
      if (clash !== undefined) {
        refusals.push({
          kind: 'title_taken',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail: `step "${id}" would become the record titled "${title}", and a ${clash.kind} already has that title (${clash.id}).`,
        })
        return
      }
      const claimedTitle = claimingTitles.get(key)
      if (claimedTitle !== undefined) {
        refusals.push({
          kind: 'title_taken',
          pipelineId: record.id,
          pipelineTitle: record.title,
          detail:
            `steps "${claimedTitle}" and "${id}" have the same name, so both would become the record titled ` +
            `"${title}". Two steps of one pipeline with one name were legal before and are not now, because a ` +
            `block is addressed by its title. Rename one of them.`,
        })
        return
      }
      claimingTitles.set(key, id)

      const blockData: Record<string, unknown> = { state }
      const measured = str(step.measured)
      if (measured !== null) blockData['measured'] = measured
      if (isObj(step.consequence)) blockData['consequence'] = step.consequence
      if (isObj(step.paused)) blockData['paused'] = step.paused

      // ---- modules[] -> implements links, by title -------------------------------------------
      const moduleIds: string[] = []
      const moduleTitles = Array.isArray(step.modules) ? step.modules : []
      for (const raw2 of moduleTitles) {
        const moduleTitle = str(raw2)
        if (moduleTitle === null) continue
        const module = moduleByTitle.get(moduleTitle)
        if (module === undefined) {
          // REPORTED AND APPLIED WITHOUT IT. See the header: dropping loses recorded work and
          // inventing invents an owner, so the third answer is to say so, loudly, by name.
          notes.push({
            kind: 'module_not_found',
            detail:
              `"${record.title}" step "${id}" names the module "${moduleTitle}", and no live module has that ` +
              `title. No \`implements\` link was made for it. This is recorded work that has lost its owner: ` +
              `either the module was renamed and the step was not, or it never existed. Nothing was invented.`,
          })
          continue
        }
        if (!moduleIds.includes(module.id)) moduleIds.push(module.id)
      }

      // ---- needs[] -> blocks links ------------------------------------------------------------
      const needs: PlannedBlock['needs'] = []
      if (!Array.isArray(step.needs)) {
        notes.push({
          kind: 'needs_absent',
          detail:
            `"${record.title}" step "${id}" stored no \`needs\` key. A link exists or it does not, so the old ` +
            `difference between "nobody wrote down what this waits on" and "recorded as waiting on nothing" ` +
            `cannot survive. This block has no incoming \`blocks\` link, which a reader must print as "no ` +
            `dependency has been recorded" and never as "it waits on nothing".`,
        })
      } else {
        for (const raw2 of step.needs) {
          if (!isObj(raw2)) continue
          const stepId = str(raw2['stepId'])
          const gate = str(raw2['gate'])
          if (stepId === null || (gate !== 'hard' && gate !== 'partial')) continue
          needs.push({ fromId: stepId, gate, upTo: str(raw2['upTo']) })
        }
      }

      blocks.push({ id, title, name, data: blockData, moduleIds, needs })
    })

    // ---- blockIds: READ what is already there before writing anything ------------------------
    //
    // THE DEFECT THIS REPLACES. These three lines used to be `nextData['blockIds'] = blocks.map(…)`
    // with the stored value never read at all. A pipeline holding `steps: []` beside nine live
    // `blockIds` came out of `npm run db:migrate` holding ZERO blockIds, its nine block records
    // orphaned, and nothing anywhere could tell you: the row-count guard in migrate.ts compares
    // whole tables and the loss is inside a JSON column, so records, links and changes were all
    // identical, and the command exited 0 saying it had nothing to do. `blockIds` is the ONE
    // statement of both membership and order — see PipelineData in shared/types.ts — so emptying it
    // is not a cosmetic loss, it is the pipeline.
    //
    // Reaching that state needs a half-finished hand edit, which is exactly what somebody repairing
    // a pre-block pipeline does: today's API refuses the key `steps` outright, so the obvious repair
    // is to edit `data` directly, and a repair interrupted half way is this.
    const stored = data['blockIds']
    if (stored !== undefined && !Array.isArray(stored)) {
      refusals.push({
        kind: 'blocks_already_held',
        pipelineId: record.id,
        pipelineTitle: record.title,
        detail:
          `it stores \`steps\` and also a \`blockIds\` key that is ${stored === null ? 'null' : typeof stored}, not an ` +
          `array. Overwriting it would throw away whatever somebody meant by it, and this migration cannot read it. ` +
          `Make \`blockIds\` an array of block record ids, or remove it, and run this again.`,
      })
      continue
    }
    const held = Array.isArray(stored) ? stored : []
    const heldIds = new Set(held.filter((v): v is string => typeof v === 'string').map((v) => v.trim()))
    // Blocks this migration would add that the pipeline is not already holding. A step whose id is
    // already a RECORD is refused above as `id_taken`, so an overlap here is a blockIds entry that
    // names nothing yet — dangling — and the step is what will finally make it real.
    const arriving = blocks.map((b) => b.id).filter((id) => !heldIds.has(id))

    if (held.length > 0 && arriving.length > 0) {
      // BOTH LISTS HAVE CONTENT AND ONLY THE AUTHOR KNOWS HOW THEY INTERLEAVE. Appending the new
      // blocks after the held ones is the likeliest reading and it is still a guess about ORDER,
      // and order here is content rather than a sort — a pipeline is the order the work happens in.
      // So this refuses, in the same voice as every other thing this file will not guess at, and
      // writes nothing at all. A refusal costs somebody a decision; a wrong order is silent.
      refusals.push({
        kind: 'blocks_already_held',
        pipelineId: record.id,
        pipelineTitle: record.title,
        detail:
          `it already holds ${held.length} \`blockIds\` and still stores ${arriving.length} step` +
          `${arriving.length === 1 ? '' : 's'} that ${arriving.length === 1 ? 'is' : 'are'} not among them ` +
          `(${arriving.slice(0, 4).map((id) => `"${id}"`).join(', ')}${arriving.length > 4 ? ', …' : ''}). This ` +
          `pipeline was migrated half way by hand. Where those steps belong in the order is a statement only ` +
          `their author can make, so nothing has been written. Finish the move by hand — put every id in ` +
          `\`blockIds\` in the order the work happens and delete \`steps\` — or delete \`blockIds\` and let this ` +
          `migration build it from \`steps\`.`,
      })
      continue
    }

    const nextData: Record<string, unknown> = { ...data }
    delete nextData['steps']
    // Only ONE of the two lists has content here, and each case writes the one that does. When the
    // pipeline was already holding blocks, `data.blockIds` is left EXACTLY as it was — the spread
    // above already carries it — including anything unreadable inside it. Rewriting a stored list
    // to a tidied copy of itself is a silent edit, and this migration is not the thing that should
    // make it.
    if (held.length === 0) nextData['blockIds'] = arriving
    plan.push({ record, blocks, data: nextData })
  }

  // NO BLOCKS TO MIGRATE MEANS NOTHING TO REPORT. Without this the gate classification below runs
  // with nothing to resolve against, finds no block for any `gate_up_to`, and reports every gate in
  // the workspace as prose — a report that is wrong and looks like work.
  //
  // THE TEST IS ON BLOCKS, NOT ON PIPELINES, and it used to be `plan.length === 0`. A pipeline that
  // stores `steps: []` is planned with ZERO blocks, so the plan was not empty and the classification
  // ran anyway: on a copy of the live database that reported four live block records as stages named
  // in words, among nine sentences that were true. That case is now the ordinary one — it is exactly
  // what a pipeline looks like after somebody deletes the last step by hand — so the guard has to
  // ask the question it was always about.
  if (plan.every((p) => p.blocks.length === 0)) return { plan, refusals, notes }

  // ---- gate_up_to, classified rather than rewritten -------------------------------------------
  //
  // Nothing is rewritten, because the block id IS the step id. What this does is TELL somebody what
  // each free-text gate turned out to be, which nothing has ever been able to do: until now a gate
  // naming a step of the wrong pipeline and a stage named in words were the same thing to every
  // reader, both drawn as prose behind a 201.
  const plannedById = new Map<string, { pipeline: PlannedPipeline; block: PlannedBlock }>()
  for (const pipeline of plan) for (const block of pipeline.blocks) plannedById.set(block.id, { pipeline, block })

  const gated = sqlite
    .prepare("SELECT id, from_id, to_id, gate, gate_up_to FROM links WHERE gate_up_to IS NOT NULL AND gate_up_to != ''")
    .all() as { id: string; from_id: string; to_id: string; gate: string | null; gate_up_to: string }[]
  for (const link of gated) {
    const upTo = link.gate_up_to.trim()
    const found = plannedById.get(upTo)
    if (found === undefined) {
      notes.push({
        kind: 'gate_prose',
        detail:
          `link ${link.id} stops at "${upTo}", and no block has that id, so it is a stage named in words and ` +
          `stays exactly as written.`,
      })
      continue
    }
    // The gate is on a link INTO something. When that something is the block's own pipeline the
    // reference resolves the way its author meant. When it is not, the gate names a real step of a
    // pipeline this link has nothing to do with — which used to be indistinguishable from prose.
    if (link.to_id === found.pipeline.record.id) {
      notes.push({
        kind: 'gate_resolved',
        detail: `link ${link.id} stops at the block "${found.block.title}", which is in the pipeline the link points at. It resolves.`,
      })
    } else {
      const target = byId.get(link.to_id)
      notes.push({
        kind: 'gate_unresolvable',
        detail:
          `link ${link.id} points at ${target === undefined ? link.to_id : `"${target.title}"`} but stops at ` +
          `"${upTo}", which is a block of a DIFFERENT pipeline, "${found.pipeline.record.title}". Nothing was ` +
          `changed: only the person who wrote it knows whether they meant that block or a stage they named in ` +
          `words, and guessing either way would put a word in their mouth.`,
      })
    }
  }

  return { plan, refusals, notes }
}

/**
 * Apply the plan. One transaction, and it either all lands or none of it does.
 *
 * `dryRun` runs the plan and reports, and writes nothing. That is what an operator should run first
 * against a copy, and what the migration script's `--report` flag calls.
 */
export function migrateBlocks(
  db: BetterSQLite3Database<Record<string, never>>,
  sqlite: Database.Database,
  opts: { dryRun?: boolean } = {},
): BlockMigrationReport {
  void db
  const { plan, refusals, notes } = planBlockMigration(sqlite)

  const report: BlockMigrationReport = {
    alreadyDone: plan.length === 0,
    pipelines: plan.length,
    blocks: plan.reduce((n, p) => n + p.blocks.length, 0),
    implementsLinks: 0,
    blocksLinks: 0,
    pipelineImplementsDropped: 0,
    changeRowsRefiled: 0,
    intentRowsRewritten: 0,
    refusals,
    notes,
  }
  // A REFUSAL IS CHECKED BEFORE AN EMPTY PLAN, and the order used to be the other way round.
  //
  // Every refusal is recorded before the pipeline it is about reaches `plan`, so a database whose
  // ONLY problem is a refused pipeline plans nothing — and the old order returned on the empty plan
  // and dropped the refusals on the floor, printing "blocks: nothing to migrate" and exiting 0.
  // "Nothing to migrate" was untrue: something was refused and the operator was never told.
  //
  // It matters more now than it did. The `blocks_already_held` refusal above fires on a pipeline
  // that was migrated half way by hand, and on a corpus where that is the only pipeline still
  // holding `steps` the plan is empty by construction — so in the exact case that refusal exists
  // for, the old order would have said nothing at all.
  if (refusals.length > 0) {
    const lines = refusals.map((r) => `  - ${r.pipelineTitle} (${r.pipelineId}): ${r.detail}`)
    throw new Error(
      `The block migration refused, and NOTHING has been written.\n\n` +
        `${refusals.length} thing${refusals.length === 1 ? '' : 's'} it will not guess at:\n${lines.join('\n')}\n\n` +
        `Each of these is a decision somebody has to make about their own data. Fix them in the database, or ` +
        `through the API, and run the migration again.`,
    )
  }
  // Nothing refused and nothing planned: every pipeline is already migrated. This is the success
  // case on every run after the first, and `alreadyDone` above is what makes the report say so.
  if (plan.length === 0) return report
  if (opts.dryRun === true) return report

  const at = nowStamp()
  // Read once here rather than reaching back into the plan, because the write phase needs the
  // TITLES of records the plan only holds ids for.
  const byId = new Map((sqlite.prepare('SELECT * FROM records').all() as RecordRow[]).map((r) => [r.id, r]))
  const insertRecord = sqlite.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at) ' +
      'VALUES (@id, @workspace_id, @owner_id, @created_at, @updated_at, @kind, @title, NULL, @data, NULL)',
  )
  const insertLink = sqlite.prepare(
    'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, gate, gate_up_to) ' +
      'VALUES (@id, @workspace_id, @owner_id, @created_at, @updated_at, @from_id, @to_id, @type, 0, @created_by, @gate, @gate_up_to)',
  )
  // `workspace_id` IS DERIVED HERE, IN THE STATEMENT, RATHER THAN LEFT NULL FOR A LATER PASS.
  // A change row's project is the project of the record it is about — the column exists to keep that
  // derivation, and `logChange` in lib/records.ts refuses a parameter for it for the same reason.
  // These rows used to be written NULL and stamped afterwards by `migrateWorkspaces`, which runs
  // later in the same command. That covered the ordinary `npm run db:migrate`, and nothing else: a
  // caller running this migration on its own left rows the daily page filters out, because it
  // selects by project and NULL is not a project. The subquery reads the record this row is about,
  // in the same transaction, at the moment the row is written.
  const insertChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) ' +
      'VALUES (@id, @record_id, (SELECT r.workspace_id FROM records r WHERE r.id = @record_id), ' +
      '@op, @actor_type, @actor_id, @session_id, @field, @old_value, @new_value, @at)',
  )
  const updateRecordData = sqlite.prepare('UPDATE records SET data = @data, updated_at = @at WHERE id = @id')

  const hasIntentTable =
    sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='presentation_intent'").get() as {
      n: number
    }

  const run = sqlite.transaction(() => {
    for (const pipeline of plan) {
      for (const block of pipeline.blocks) {
        // A BLOCK INHERITS ITS PIPELINE'S TIMESTAMPS. IT MUST NOT BE STAMPED WITH THE MIGRATION'S.
        //
        // These two lines used to read `created_at: at, updated_at: at`, and that was a real data
        // loss rather than a cosmetic one. The attention rule ranks on how long a thing has sat:
        // `stopped_short` work is scored partly by its age, so a block blocked since 19 July and a
        // block blocked this morning are meant to be different rows. Stamping every block with the
        // moment the migration ran collapses that to zero — an independent reviewer measured six of
        // the nine stopped blocks dropping from score 15 or 12 to 5 or 0, in the same minute, and
        // there is nothing left in the database to recover the real dates from afterwards.
        //
        // The pipeline's own stamps are the honest answer available. They are not perfect — a
        // pipeline's `updated_at` moves when ANY of its steps changed, so a block inherits the most
        // recent edit to its siblings rather than to itself — but they are evidence, and the
        // migration's clock is not evidence of anything about the work. Where a step's own history
        // survives in the change rows re-filed below, that history is the finer answer and the one
        // a reader following "what happened to this block" actually lands on.
        insertRecord.run({
          id: block.id,
          workspace_id: pipeline.record.workspace_id,
          owner_id: pipeline.record.owner_id,
          created_at: pipeline.record.created_at,
          updated_at: pipeline.record.updated_at,
          kind: 'block',
          title: block.title,
          data: JSON.stringify(block.data),
        })
        // The block's create row, so its history starts where the block does rather than nowhere.
        insertChange.run({
          id: anOfficeId(),
          record_id: block.id,
          op: 'create',
          actor_type: 'system',
          actor_id: 'block-migration',
          session_id: null,
          field: null,
          old_value: null,
          new_value: block.title,
          at,
        })
      }
    }

    // Links are created after ALL the block records exist, because a `blocks` link between two
    // blocks needs both ends present and the foreign keys are enforced.
    for (const pipeline of plan) {
      for (const block of pipeline.blocks) {
        for (const moduleId of block.moduleIds) {
          insertLink.run({
            id: anOfficeId(),
            workspace_id: pipeline.record.workspace_id,
            owner_id: pipeline.record.owner_id,
            created_at: at,
            updated_at: at,
            from_id: moduleId,
            to_id: block.id,
            type: 'implements',
            created_by: 'block-migration',
            gate: null,
            gate_up_to: null,
          })
          report.implementsLinks++
        }
        for (const need of block.needs) {
          insertLink.run({
            id: anOfficeId(),
            workspace_id: pipeline.record.workspace_id,
            owner_id: pipeline.record.owner_id,
            created_at: at,
            updated_at: at,
            from_id: need.fromId,
            to_id: block.id,
            type: 'blocks',
            created_by: 'block-migration',
            gate: need.gate,
            gate_up_to: need.upTo,
          })
          report.blocksLinks++
        }
      }
      updateRecordData.run({ id: pipeline.record.id, data: JSON.stringify(pipeline.data), at })
    }

    // ---- the pipeline-level `implements` links, which are now a lossy projection ---------------
    //
    // "This module implements this pipeline" was the only way to record which module carried which
    // work, because a step could not be an end of a link. It is strictly less than what the block
    // links now say: "the LeafCam 2 implements Transplant v2" cannot tell you it carries steps 1, 2
    // and 3 and not 4 to 9.
    //
    // A LINK IS ONLY DROPPED WHERE THE BLOCK LINKS REALLY DO REPLACE IT. If a module implements a
    // pipeline but carries none of its blocks, deleting would remove the only record that the module
    // has anything to do with that pipeline — recorded work, lost to tidiness. Those are KEPT and
    // reported, because "the step lists said nothing about this module" is a fact somebody should
    // look at.
    const pipelineIds = new Set(plan.map((p) => p.record.id))
    const carriedBlocks = new Map<string, Set<string>>()
    for (const pipeline of plan) {
      for (const block of pipeline.blocks) {
        for (const moduleId of block.moduleIds) {
          const key = `${moduleId} ${pipeline.record.id}`
          const set = carriedBlocks.get(key)
          if (set === undefined) carriedBlocks.set(key, new Set([block.id]))
          else set.add(block.id)
        }
      }
    }
    const oldImplements = sqlite
      .prepare("SELECT id, from_id, to_id FROM links WHERE type = 'implements'")
      .all() as { id: string; from_id: string; to_id: string }[]
    for (const link of oldImplements) {
      if (!pipelineIds.has(link.to_id)) continue
      const module = byId.get(link.from_id)
      const pipelineRecord = byId.get(link.to_id)
      const carried = carriedBlocks.get(`${link.from_id} ${link.to_id}`)
      const moduleName = module === undefined ? link.from_id : module.title
      const pipelineName = pipelineRecord === undefined ? link.to_id : pipelineRecord.title
      if (carried === undefined || carried.size === 0) {
        notes.push({
          kind: 'pipeline_implements_kept',
          detail:
            `"${moduleName}" implements the pipeline "${pipelineName}", and none of that pipeline's steps named ` +
            `it, so there is no block-level link to replace it with. The pipeline-level link is KEPT: dropping it ` +
            `would delete the only record that this module has anything to do with this pipeline. Somebody should ` +
            `say which of its blocks the module carries.`,
        })
        continue
      }
      sqlite.prepare('DELETE FROM links WHERE id = @id').run({ id: link.id })
      insertChange.run({
        id: anOfficeId(),
        record_id: link.from_id,
        op: 'unlink',
        actor_type: 'system',
        actor_id: 'block-migration',
        session_id: null,
        field: 'implements',
        old_value: link.to_id,
        new_value: null,
        at,
      })
      report.pipelineImplementsDropped++
      notes.push({
        kind: 'pipeline_implements_dropped',
        detail:
          `"${moduleName}" implemented the pipeline "${pipelineName}"; it now implements the ${carried.size} block` +
          `${carried.size === 1 ? '' : 's'} of it that named it. The pipeline-level link said less than the block ` +
          `ones do and is gone.`,
      })
    }

    // ---- the change log -----------------------------------------------------------------------
    //
    // A `field = 'data.steps'` row holds the WHOLE array on both sides. It is not one fact, it is
    // as many facts as the array has steps plus one about the list itself. So it is EXPLODED: one
    // new row per block whose stored object actually differs, filed under that block, keeping the
    // original actor, session and stamp — and the original row is rewritten to `data.blockIds`,
    // which is the part of it that really was about the pipeline.
    //
    // A row mentioning a step no block was made for is LEFT ALONE and reported. It is the only
    // record that step existed, and there is nowhere to file it that would not invent a block.
    const stepRows = sqlite
      .prepare("SELECT * FROM changes WHERE field = 'data.steps'")
      .all() as {
      id: string
      record_id: string
      op: string
      actor_type: string
      actor_id: string
      session_id: string | null
      old_value: string | null
      new_value: string | null
      at: string
    }[]

    const blockIds = new Set<string>()
    for (const pipeline of plan) for (const block of pipeline.blocks) blockIds.add(block.id)

    const parseArray = (value: string | null): Map<string, string> => {
      const out = new Map<string, string>()
      if (value === null) return out
      let parsed: unknown
      try {
        parsed = JSON.parse(value)
      } catch {
        return out
      }
      if (!Array.isArray(parsed)) return out
      for (const entry of parsed) {
        if (!isObj(entry)) continue
        const id = str(entry['id'])
        if (id === null) continue
        out.set(id, JSON.stringify(entry))
      }
      return out
    }

    for (const row of stepRows) {
      const before = parseArray(row.old_value)
      const after = parseArray(row.new_value)
      const mentioned = new Set([...before.keys(), ...after.keys()])
      const unknownIds = [...mentioned].filter((id) => !blockIds.has(id))
      if (unknownIds.length > 0) {
        notes.push({
          kind: 'history_left_on_pipeline',
          detail:
            `change row ${row.id} (${row.at}) names ${unknownIds.map((id) => `"${id}"`).join(', ')}, which no block ` +
            `was made for — the step was removed before the migration ran. The row is the only record that step ` +
            `existed, so it is left filed under the pipeline exactly as it was, rather than being split and half ` +
            `lost. Read it as JSON.`,
        })
        continue
      }
      for (const id of mentioned) {
        const oldOne = before.get(id) ?? null
        const newOne = after.get(id) ?? null
        if (oldOne === newOne) continue
        insertChange.run({
          id: anOfficeId(),
          record_id: id,
          op: row.op,
          actor_type: row.actor_type,
          actor_id: row.actor_id,
          session_id: row.session_id,
          field: 'data',
          old_value: oldOne,
          new_value: newOne,
          at: row.at,
        })
        report.changeRowsRefiled++
      }
      sqlite
        .prepare('UPDATE changes SET field = @field, old_value = @old_value, new_value = @new_value WHERE id = @id')
        .run({
          id: row.id,
          field: 'data.blockIds',
          old_value: JSON.stringify([...before.keys()]),
          new_value: JSON.stringify([...after.keys()]),
        })
    }

    // ---- presentation intent ------------------------------------------------------------------
    if (hasIntentTable.n > 0) {
      const intentRows = sqlite
        .prepare("SELECT rowid AS rid, scope, target FROM presentation_intent WHERE target LIKE 'step:%'")
        .all() as { rid: number; scope: string; target: string }[]
      for (const row of intentRows) {
        const stepId = row.target.slice('step:'.length)
        if (!blockIds.has(stepId)) {
          notes.push({
            kind: 'intent_unresolvable',
            detail:
              `presentation intent in scope "${row.scope}" is stored for "${row.target}", and no block has the id ` +
              `"${stepId}". It is left exactly as written: this is data a person typed, and rewriting it to a ` +
              `guess would lose what they meant.`,
          })
          continue
        }
        sqlite.prepare('UPDATE presentation_intent SET target = @target WHERE rowid = @rid').run({ rid: row.rid, target: stepId })
        report.intentRowsRewritten++
        notes.push({
          kind: 'intent_retargeted',
          detail: `presentation intent in scope "${row.scope}" moved from "${row.target}" to the block record "${stepId}".`,
        })
      }
    }
  })

  run()
  return report
}
