// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A pipeline BLOCK: what its title is, and how to read one back out of records and links.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY THE WHOLE PRODUCT MOVED FOR IT
 * ---------------------------------------------------------------------------------------
 *
 * A block used to be a nested object inside `pipeline.data.steps[]`. It had an id nothing owned,
 * so nothing could point at it: `links.from_id` and `links.to_id` are foreign keys to `records.id`,
 * and a nested object has no row in `records`. That single fact cost four things that were all
 * measured on the real database rather than guessed at:
 *
 *   - A problem, a claim or an idea could not attach to a block. `POST /api/links` with a step id
 *     was answered 404, and the whole pipeline had to stand in for the one step that was wrong.
 *   - Two blocks could share one id, and did. The write path accepted it with a 201 and the
 *     attention list then served two rows carrying one key.
 *   - A step named the modules that carried it BY TITLE, while a parallel `implements` link named
 *     the same modules by id. One accepted rename broke ten mappings behind a 200: the links
 *     followed, the titles did not, and nothing reported the divergence.
 *   - A block had no history of its own. One edit wrote one change row holding the WHOLE array,
 *     so "what happened to this block" could not be answered and version comparison was
 *     impossible rather than merely missing.
 *
 * So a block is now a record of kind `block`, and the two representations become one:
 *
 *   the step's `name`      -> the record's `title`, qualified by its pipeline (see below)
 *   the step's `modules[]` -> `implements` links, module -> block
 *   the step's `needs[]`   -> `blocks` links, needed block -> waiting block, carrying the gate
 *   the pipeline's order   -> `pipeline.data.blockIds`, an ordered array of record ids
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING A LINK CANNOT SAY, STATED RATHER THAN HIDDEN
 * ---------------------------------------------------------------------------------------
 *
 * `needs` used to distinguish ABSENT ("nobody has written down what this waits on") from `[]`
 * ("recorded as waiting on nothing"). A link is a row: it exists or it does not, and there is no
 * third state. That distinction is therefore gone, and no reader may invent it back.
 *
 * What a reader must say instead is the honest half that survives: zero incoming `blocks` links
 * means NO DEPENDENCY HAS BEEN RECORDED, which is not the same sentence as "it waits on nothing"
 * and must not be printed as one. The same applies to `implements`: zero links means no module is
 * recorded as carrying this block, which is the answer the old `[]` already stood for.
 *
 * The migration reported every step whose `needs` key was absent, so the change was counted rather
 * than discovered later. In the corpus it converted 61 steps and none of them stored `needs: []`.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORD "BLOCK" IS NOW USED THREE WAYS IN THIS CODEBASE. THEY ARE DIFFERENT THINGS.
 * ---------------------------------------------------------------------------------------
 *
 *   1. A PIPELINE BLOCK -- this file. A record of kind `block`, one step of a pipeline.
 *   2. A SUMMARY BLOCK  -- `SUMMARY_BLOCK_TYPES` in ./types.ts. One element of a module's curated
 *      summary: a paragraph, a chart, an equation. Never a record.
 *   3. A HOME-PAGE PANEL -- a rectangle on a page, which `PanelGrid` calls a block. Never a
 *      record, and no longer a type: the reducer that defined `PanelGridItem` was deleted with the
 *      drag on 2026-08-10. The word survives in PanelGrid.tsx, so the collision is still real.
 *
 * Nothing here may be named plainly `Block` for that reason. Everything in this file says
 * `PipelineBlock`, or says `block` next to the word `pipeline` in the same sentence.
 */

import type { Consequence, Pause } from './work.ts'
import { readConsequence, readPause, type GateKind } from './work.ts'
import type { BlockData, ItemState, PanelRecord } from './types.ts'
import { ITEM_STATES } from './types.ts'

/** The record kind a pipeline block is stored as. One place, so nobody types the word twice. */
export const BLOCK_KIND = 'block'

// ============================================================================ the title

/**
 * What used to separate a pipeline's title from its block's name in the block's own title. U+203A.
 *
 * ---------------------------------------------------------------------------------------
 * A BLOCK'S TITLE IS ITS OWN NAME. THIS SEPARATOR IS ONLY EVER READ NOW, NEVER WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Until 26 August 2026 the server built a block's title as `<pipeline title> › <block name>`, so
 * that a bare block name could never mean two blocks at once and every block stayed linkable by
 * name. The cost was accepted with eyes open and it is the cost that ended it: renaming a pipeline
 * rewrote every one of its blocks' titles, and a block belonged to exactly one pipeline because its
 * title said which.
 *
 * A decision reversed that. A block's title is its own name, and several pipelines may list one
 * block.
 * The corpus was rewritten to match on 26 and 28 August; the write path was not, and the two
 * disagreed for eleven days with nothing failing. Problem `PYkkl-8BFRKM` has the count: 86 live
 * blocks, none of them carrying a separator, and a write path still building one.
 *
 * WHAT REPLACED THE UNIQUENESS THE PREFIX WAS BUYING. The rule is now stated where it was always
 * true: no two LIVE BLOCKS OF ONE PIPELINE share a title. `duplicateTitlesInPipeline` below is that
 * statement, and `refuseTakenName` in server/lib/blocks.ts is the write path asking it. Two blocks
 * called `Calibrate` in two different pipelines are two steps of two different pieces of work and
 * are allowed, which they were not before.
 *
 * THIS CONSTANT SURVIVES BECAUSE OLD TITLES DO. An archive written before 26 August, or an import
 * of one, still carries composed titles, and `splitBlockTitle` below is how a reader shows the name
 * out of one. Nothing in the product writes the separator into a title any more.
 */
export const BLOCK_TITLE_SEPARATOR = '›'

/** The separator with the spaces around it, which is what actually appears in a stored title. */
const JOINER = ` ${BLOCK_TITLE_SEPARATOR} `

/**
 * Split a stored block title back into its two halves, or null when it is not qualified at all.
 *
 * Splits on the FIRST separator, so a block whose own name contains a `›` keeps it. A pipeline
 * title containing one would be split in the wrong place, which is why `blockNameIn` below takes
 * the pipeline's real title and is what every caller that has one should use.
 */
export function splitBlockTitle(title: string): { pipelineTitle: string; name: string } | null {
  const at = title.indexOf(JOINER)
  if (at === -1) return null
  return { pipelineTitle: title.slice(0, at), name: title.slice(at + JOINER.length) }
}

/**
 * The block's own name, given the pipeline it belongs to.
 *
 * EXACT, not a guess: it strips the prefix only when the title really begins with this pipeline's
 * title and the separator. A block whose title does not match returns the whole title unchanged,
 * because printing a truncated title would hide the fact that the two have come apart -- which is
 * the one thing the rename transaction exists to make impossible, and the one thing a reader must
 * show rather than paper over if it ever happens.
 */
export function blockNameIn(blockTitle_: string, pipelineTitle: string): string {
  const prefix = `${pipelineTitle.trim()}${JOINER}`
  return blockTitle_.startsWith(prefix) ? blockTitle_.slice(prefix.length) : blockTitle_
}

/** Two live blocks of one pipeline that would answer to one title, and where each one sits. */
export interface DuplicateTitleInPipeline {
  title: string
  /** Every block of this pipeline holding that title, with its 1-based place in the stored order. */
  blocks: { id: string; at: number }[]
}

/**
 * THE ONE STATEMENT OF THE BLOCK TITLE RULE: no two live blocks of one pipeline share a title.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS PER PIPELINE AND NOT PER PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * A block does not have a title anybody typed, and a pipeline is read as an ordered list of those
 * titles, so two live blocks of ONE pipeline answering to one name are two rows a reader cannot
 * tell apart on the page they both appear on. Two blocks in two different pipelines called
 * `Calibrate` are two different steps of two different pieces of work, and refusing that would
 * make Mole Office unable to import a backup of a corpus it is about to create.
 *
 * ---------------------------------------------------------------------------------------
 * IT HAS ONE CALLER TODAY, AND THAT IS SAID HERE RATHER THAN IMPLIED
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/migrations/block-identity.ts` calls it, to refuse a retitle that would leave a
 * pipeline holding two blocks with one name. The other doors onto the same rule have NOT been moved
 * to it and still say the old rule in their own words: `refuseTakenTitle` in server/lib/blocks.ts
 * refuses a block title any live record in the workspace holds, `checkBlockIds` in
 * server/lib/records/pipeline-blocks.ts refuses a block a second pipeline lists, and `checkTitles` in
 * server/lib/import.ts refuses two blocks sharing a title anywhere in a workspace. Until those
 * three call this, it is the one statement of the rule for one caller and not for the product.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT TAKES A LOOKUP RATHER THAN RECORDS
 * ---------------------------------------------------------------------------------------
 *
 * The callers it is written for hold titles in three different places. The write path has the
 * database, the importer has the state the import WOULD leave behind — the archive's title where
 * the archive names the row and the stored title otherwise — and the block-identity migration has
 * the title each block is ABOUT to be given. None of them can hand over records, and all three need
 * the same answer. `titleOf` returns null for an id this caller cannot resolve or that is not a
 * live block; those are left out, because a different rule already refuses them and reporting them
 * twice would send a reader to fix the wrong thing.
 *
 * @param blockIds one pipeline's stored order, in order.
 * @param titleOf the title each block will hold, or null to leave it out.
 */
export function duplicateTitlesInPipeline(
  blockIds: readonly string[],
  titleOf: (blockId: string) => string | null,
): DuplicateTitleInPipeline[] {
  const byTitle = new Map<string, { id: string; at: number }[]>()
  blockIds.forEach((id, index) => {
    const title = titleOf(id)
    if (title === null) return
    const list = byTitle.get(title)
    if (list === undefined) byTitle.set(title, [{ id, at: index + 1 }])
    else list.push({ id, at: index + 1 })
  })
  const found: DuplicateTitleInPipeline[] = []
  for (const [title, blocks] of byTitle) if (blocks.length > 1) found.push({ title, blocks })
  return found.sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
}

/** Whether a stored title is the correctly qualified title for this block name in this pipeline. */
export function blockTitleIsQualified(title: string, pipelineTitle: string): boolean {
  const split = splitBlockTitle(title)
  return split !== null && split.pipelineTitle === pipelineTitle.trim() && split.name.trim() !== ''
}

// ============================================================================ reading

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const STATE_NAMES: readonly string[] = ITEM_STATES

/**
 * The ordered block ids a pipeline record stores, and nothing else. `[]` when it stores none.
 *
 * USABLE IDS ONLY, and the entries it drops are NOT lost — `storedEntries` below keeps every one at
 * its stored position, and `readPipelineBlocks` reports each unusable one as a hole. This function
 * is for callers that want ids to look up; a caller that wants to know what the order really holds
 * wants the other one.
 */
export function blockIdsOf(pipeline: Pick<PanelRecord, 'data'>): string[] {
  return storedEntries(pipeline)
    .map((entry) => entry.id)
    .filter((id): id is string => id !== null)
}

/**
 * EVERY entry of a stored order, at its stored position, usable or not.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE `blockIdsOf`
 * ---------------------------------------------------------------------------------------
 *
 * `blockIdsOf` filters, which is right for a lookup and was silently wrong for a report. An agent
 * asked to break the pipeline reading imported an archive holding
 * `["…", 99999, "NOT-A-RECORD", "", "7YM…", "zvl…"]` and measured what came back: six entries
 * stored, `storedIds: 4`, three blocks and ONE problem. The number and the empty string appeared
 * nowhere, and `NOT-A-RECORD` — stored third — was reported at position two, because every position
 * was counted over the filtered array. So a five-step pipeline read as three steps and one hole,
 * and the one hole was in the wrong place.
 *
 * A stored order is a fact about the archive. Something has to hold every entry of it, at its own
 * position, or a reader cannot be told the truth about what is there.
 */
export function storedEntries(pipeline: Pick<PanelRecord, 'data'>): { id: string | null; raw: unknown }[] {
  const data = isObj(pipeline.data) ? pipeline.data : {}
  const raw = data['blockIds']
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => ({
    id: typeof entry === 'string' && entry.trim() !== '' ? entry.trim() : null,
    raw: entry,
  }))
}

/**
 * Whether a pipeline record stores a `blockIds` key at all. Absent is a stub; `[]` is a decision.
 *
 * A KEY THAT IS NOT AN ARRAY COUNTS AS DECLARED, which is the correction. It used to test
 * `Array.isArray`, so a `blockIds` holding the string `"omSaZ8GnA6Si"` answered `undeclared: true` —
 * "nobody has written this pipeline's blocks down" about a pipeline that stores a value. That is the
 * exact distinction this function exists to make, said backwards. What the stored value IS gets
 * reported as a problem by `readPipelineBlocks`; whether somebody wrote something is this.
 */
export function pipelineDeclaresBlocks(pipeline: Pick<PanelRecord, 'data'>): boolean {
  const data = isObj(pipeline.data) ? pipeline.data : {}
  return 'blockIds' in data
}

/**
 * One dependency read off the links: which block has to move first, and how hard the wait is.
 *
 * This is what `StepNeed` used to be, and the two columns it uses -- `links.gate` and
 * `links.gate_up_to` -- already existed and already meant exactly this. The dependency graph
 * stopped being two systems when this became a link; that is the one part of the whole change that
 * makes the model smaller rather than larger.
 */
export interface BlockNeed {
  /** The record id of the block this one waits on. It is a real row, and it is checked. */
  blockId: string
  /**
   * How hard the wait is. NULL MEANS NOBODY SAID, AND IS NOT `hard`.
   *
   * `StepNeed.gate` was required, so this is genuinely wider than what it replaces. It is wider
   * because a `blocks` link has always been allowed to say only that A blocks B, and the column
   * that carries the gate has always been nullable. Reading null as `hard` would make work that is
   * mostly doable look completely stuck, which is the exact mistake `partial` was added to stop.
   */
  gate: GateKind | null
  /** How far this block may get before the gate stops it. Present only on a partial gate. */
  upTo?: string
  /** The id of the `blocks` link this was read from, so a reader can point at the row itself. */
  linkId: string
}

/** One named thing that moves from a block's output into another block's input. The agents' words. */
export interface CarriedData {
  out: string
  in?: string
}

/**
 * One `feeds` link out of a step, and what the agents said moves along it.
 *
 * `blockId` is the step the data moves TO, so the reading is kept on the step it leaves. The port
 * names are the agents' own words and are never translated or looked up in a word list.
 */
export interface BlockMove {
  blockId: string
  linkId: string
  carries: CarriedData[]
}

/** A pipeline hung from a step: one with a `part_of` link to it. Its id and title, read from its record. */
export interface HungPipeline {
  id: string
  title: string
}

/**
 * Read the JSON stored in `links.carries`, keeping only the entries that name an out port.
 *
 * INVALID JSON AND A MISSING `out` ARE READ AS NO NAMES, not as a guess. The column is written by
 * an import or another program, so a malformed value is a real archive; the drawing shows the
 * arrow and says nothing about what moves, which is the honest half of what it knows.
 */
export function carriesOf(raw: string | null | undefined): CarriedData[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: CarriedData[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const outPort = str((entry as Record<string, unknown>)['out'])
    if (outPort === null) continue
    const inPort = str((entry as Record<string, unknown>)['in'])
    out.push(inPort === null ? { out: outPort } : { out: outPort, in: inPort })
  }
  return out
}

/**
 * One pipeline block, read back the way a page needs it: the record plus what the links say.
 *
 * DERIVED, NEVER STORED. Nothing writes this shape into the database, and nothing may. It exists
 * because five different files used to declare five different readings of one stored step -- two of
 * which invented an identity when the id was missing and one of which dropped the step entirely.
 * There is now one reading, here, and every page uses it.
 */
export interface PipelineBlockView {
  /** The block record's id. This IS the identity: it is a primary key and a link can point at it. */
  id: string
  /** The block's own name, with the pipeline prefix taken off. */
  name: string
  /** The full stored title, which is what you type to link to it. */
  title: string
  state: ItemState
  /** What was measured, as written. Null when nothing has been. */
  measured: string | null
  /**
   * The modules recorded as carrying it, each with the link that says so. `[]` means none is.
   *
   * THE SAME ELEMENTS `modulesCarrying(block.id, links, records)` ANSWERS WITH, in the same order.
   * Both are built from `carriesBlock` and sorted by `byCarrierTitleThenId`, so the per-pipeline
   * reader and the per-block reader cannot come to say different things about one block.
   */
  carriers: BlockCarrier[]
  /**
   * The `implements` links into this block whose from end is a record that is NOT a module, and so
   * are not counted in `carriers`. `[]` when there are none, which is every block the write door has
   * checked since wave 13s. Reported here rather than dropped in silence. Problem vgwYJm6SuPtF.
   */
  notCarriers: NotACarrier[]
  /**
   * The titles of the modules recorded as carrying it. `[]` means none is recorded.
   *
   * A PROJECTION OF `carriers`, computed from it in the same expression, so it cannot drift from
   * it. Where the caller did not hand this reader the module's record — a soft-deleted module, most
   * often — the entry is `unloadedModuleName(id)` and says so in words, rather than the bare id it
   * used to be.
   */
  modules: string[]
  /** The module record ids, in the same order. Also a projection of `carriers`. */
  moduleIds: string[]
  /** What it waits on, from the `blocks` links into it. `[]` means no dependency is recorded. */
  needs: BlockNeed[]
  /**
   * What moves OUT of this block to another step, from the `feeds` links whose from end is this
   * block. `[]` means no flow is recorded, which is not the same as recorded as moving nothing: a
   * feeds link with no `carries` says a flow exists and does not say what it is. The reader always
   * fills it; it is optional so a fixture built by hand need not repeat an empty list.
   */
  moves?: BlockMove[]
  /**
   * The pipelines hung from this block: each pipeline with a `part_of` link to it, in stored link
   * order (wave 13u round 216, package BV, point BV-5). The page names them on the step, and each
   * opens its own drawing. `[]` means no pipeline is part of this step. The reader always fills it;
   * it is optional for the reason `moves` gives.
   */
  hung?: HungPipeline[]
  /** Who is hurt if this block is left alone, as stored on the block. Never inferred. */
  consequence: Consequence | null
  /** Deliberately put down, with a reason. */
  pause: Pause | null
  /** The record itself, for a page that wants its stamps, its owner or its history. */
  record: PanelRecord
}

/**
 * One stored link, reduced to the six facts this reader needs.
 *
 * NOT A SECOND MODEL OF A LINK. It is the parameter shape, and it exists because the two callers
 * hold a link in two different forms: the server has the table row, and the browser has
 * `GraphLink`, whose gate has already been read into the five honest answers a drawing needs.
 * Both can produce this in one line, and neither has to learn the other's shape.
 */
export interface BlockLinkRow {
  id: string
  fromId: string
  toId: string
  type: string
  /** `hard`, `partial`, or null when nobody said how hard. NULL IS NOT `hard`. */
  gate: GateKind | null
  /** The stage a partial gate stops at, as written. Null when there is none. */
  upTo: string | null
  /**
   * WHAT MOVES ALONG THIS LINK, as the JSON text stored in `links.carries`, or null when nobody
   * said. Only a `feeds` link may carry it. Null is not an empty list: null means nobody said what
   * moves, and `[]` means somebody said nothing does.
   */
  carries?: string | null
  /**
   * True when Mole Office worked this link out itself rather than being told.
   *
   * REQUIRED, so that no caller can leave it out and have the answer default to "somebody said so".
   * The column is `links.inferred` and it has existed since the links table did.
   *
   * ONE PANEL ALREADY DRAWS IT AND THE BLOCK READER DID NOT CARRY IT, which is the narrower true
   * statement. `src/web/components/LinkPanel.tsx` gives an inferred link a dashed left edge, a mark
   * and `inferredNote` — *"1 of these 20 links was worked out by Mole Office and nobody has confirmed
   * it."* — over a record's whole link list. What could not be said was which CARRIER of a
   * particular block was a guess, because this reader dropped the row and kept the module id.
   * `ontology.md` §3.3 and its row 36 both say "nothing in `src/` reads it", and that is wrong: the
   * Links panel does.
   *
   * Both callers already hold it: the server has the table row and the browser's `GraphLink`
   * carries it.
   */
  inferred: boolean
}

/**
 * What stands in a block's `modules` list when the module record was not among the records loaded.
 *
 * IT USED TO BE THE BARE ID, and that was a fabricated title. A module id is a nanoid, so the
 * pipeline page drew a lane headed `ydDW3qsG8gYj` and the card said "1 module carries this step:
 * ydDW3qsG8gYj", which reads as a module somebody named that. Measured on 2026-08-10 by
 * soft-deleting a module that carried three blocks: all three said it.
 *
 * WHY THIS HAPPENS AT ALL, AND WHERE THE REAL FIX IS. `readPipelineBlocks` resolves a module id
 * against the records its caller handed it. A soft-deleted module is still a row with a title, and
 * `resolveLinks` on the block still reports the `implements` link with `broken: true` and the title
 * readable — so nothing is lost, and the identity is intact. What is missing is on the caller's
 * side: `PipelinePage.tsx` loads live records only, so the deleted module is not in the map. Passing
 * `includeDeleted` records there makes the title come back and this label disappear. That file is
 * not this one's to change, so this says plainly that the module was not loaded rather than
 * inventing a name for it.
 */
export function unloadedModuleName(moduleId: string): string {
  return `a module that was not loaded (${moduleId})`
}

/**
 * One module recorded as carrying one block, and the `implements` link that records it.
 *
 * IT CARRIES THE LINK AND NOT THE MODULE ALONE, and that is the whole point of the shape. The
 * `links.inferred` column says whether Mole Office worked a relationship out itself or was told, and
 * until this type existed nothing in `src/` read it: a module a resolver guessed at and a module
 * somebody filed were the same sentence on every screen. A reader that hands back records cannot
 * say which is which, so the fact would be unshowable rather than merely unshown.
 */
export interface BlockCarrier {
  /** The module's record id, which is what a link points at. */
  moduleId: string
  /**
   * The module record, when the caller loaded it. NULL MEANS NOT LOADED, NOT DELETED.
   *
   * A caller that loads live records only — `PipelinePage.tsx` does — hands this reader no record
   * for a soft-deleted module, and there is no way to tell that from a module in another project or
   * one the caller simply did not fetch. So this says "the caller did not give me one" and `title`
   * says so in words. A caller that loads deleted records too gets the record, and `carriesBlock`
   * then drops the carrier, because a deleted module carries nothing.
   */
  module: PanelRecord | null
  /** The module's title, or `unloadedModuleName(moduleId)` when the caller loaded no record. */
  title: string
  /** The id of the `implements` link, so a reader can point at the row that says this. */
  linkId: string
  /** True when Mole Office worked this link out itself rather than being told. */
  inferred: boolean
}

/**
 * An `implements` link into a block from a record that is not a module. It is not counted as a
 * carrier, and it is reported with this, so a reader can see it and somebody can remove it.
 */
export interface NotACarrier {
  /** The id of the `implements` link. */
  linkId: string
  /** The record at the link's from end. */
  fromId: string
  /** What kind of record that is, as stored. */
  kind: string
  /** Its title. */
  title: string
}

/**
 * IS THE FROM END OF THIS `implements` LINK A LOADED RECORD THAT IS NOT A MODULE? Problem
 * vgwYJm6SuPtF.
 *
 * LINK_TYPES says an `implements` link runs from a module to a block, and the write door refuses any
 * other since wave 13s. A link written before that can still run from a task or a note. Such a link
 * does not make the block carried: `carriesBlock` drops it, and the readers report it with
 * `NotACarrier` rather than dropping it in silence. A from end the caller did not load is not known
 * to be anything, so it is not called a non-module here.
 */
export function fromEndIsNotAModule(link: BlockLinkRow, source: PanelRecord | undefined): boolean {
  return link.type === 'implements' && source !== undefined && source.kind !== 'module'
}

/**
 * THE ONE STATEMENT OF WHAT "A MODULE CARRIES THIS BLOCK" MEANS. Both readers call it.
 *
 * `readPipelineBlocks` asks it in one batched pass over a whole pipeline's links, and
 * `modulesCarrying` asks it about one block. Writing the test twice is the defect this repository
 * keeps producing: the pipeline page and the block page would then be free to disagree about who
 * carries a step, with nothing failing.
 *
 * THE LIVE-MODULE HALF IS HERE AND IS DELIBERATELY NARROW. A module the caller loaded and that has
 * been deleted carries nothing, so the link is dropped. A module the caller did NOT load is
 * unknown, not deleted, and the carrier is kept with `module: null` — see `BlockCarrier.module`.
 * Dropping the unknown case would delete a fact from the page of every caller that loads live
 * records only, which is most of them.
 *
 * @param module the record at the link's FROM end, when the caller loaded it.
 */
export function carriesBlock(
  link: BlockLinkRow,
  blockId: string,
  module: PanelRecord | undefined,
): boolean {
  if (link.type !== 'implements') return false
  if (link.toId !== blockId) return false
  if (fromEndIsNotAModule(link, module)) return false
  if (module !== undefined && module.deletedAt !== null) return false
  return true
}

/** The order both carrier readers answer in: by the title a reader sees, then by id. */
function byCarrierTitleThenId(a: BlockCarrier, b: BlockCarrier): number {
  if (a.title !== b.title) return a.title < b.title ? -1 : 1
  return a.moduleId < b.moduleId ? -1 : a.moduleId > b.moduleId ? 1 : 0
}

/** Build one carrier from a link whose from end has already passed `carriesBlock`. */
function carrierOf(link: BlockLinkRow, module: PanelRecord | undefined): BlockCarrier {
  return {
    moduleId: link.fromId,
    module: module ?? null,
    title: module?.title ?? unloadedModuleName(link.fromId),
    linkId: link.id,
    inferred: link.inferred,
  }
}

/**
 * Every module recorded as carrying this one block, with the link that records each.
 *
 * THE MODULE-SIDE TWIN OF `pipelinesHolding`. A block may be carried by several modules — measured
 * on the corpus on 21 August 2026: 33 blocks have no module, 35 have one, 20 have more than one and
 * the widest has eight — and until this function existed the only walk over those rows lived inside
 * `readPipelineBlocks`, which answers per pipeline. A caller holding one block and no pipeline had
 * nowhere to ask, so the next one would have written the walk a second time.
 *
 * `records` is everything the caller loaded; it is used to resolve each module and to apply the
 * live-module half of `carriesBlock`. `links` is every link the caller has, filtered here.
 */
export function modulesCarrying(
  blockId: string,
  links: readonly BlockLinkRow[],
  records: readonly PanelRecord[],
): BlockCarrier[] {
  const byId = new Map<string, PanelRecord>()
  for (const record of records) byId.set(record.id, record)
  const found: BlockCarrier[] = []
  for (const link of links) {
    const module = byId.get(link.fromId)
    if (!carriesBlock(link, blockId, module)) continue
    found.push(carrierOf(link, module))
  }
  return found.sort(byCarrierTitleThenId)
}

/** A block id the pipeline lists that could not be read, and why. Reported, never dropped. */
export interface BlockProblem {
  /** 1-based position in the stored `blockIds` array, so a sentence can point at it. */
  at: number
  blockId: string
  /**
   * WHAT IS WRONG, FOR SOMEBODY READING THE ARCHIVE OR FIXING IT: field names, ids, stored words.
   *
   * This is the wire half of the pair, and it stays exactly as it was. It is what an agent reads
   * and what Developer mode shows. See `said` for the other half.
   */
  problem: string
  /**
   * THE SAME FAULT IN A SENTENCE A PERSON CAN ACT ON. No field name, no id, no stored union.
   *
   * The pair is `error` and `detail` on PanelError, applied to a reading rather than a refusal:
   * both are built from the same facts in the same place, so the short one cannot come to say
   * something the long one does not. Home printed the long one, in a red panel, on the default page
   * of the default project: *"block 16 of 16 (lfLve4F30JIy): its state is undefined, which is not
   * one of todo, doing, done, failed, blocked."* Four pieces of database in one sentence, and
   * nothing in it a reader could do.
   */
  said: string
  /** The step's own title, where there is a record to read one from. For naming it in `said`. */
  title: string | null
}

/** Everything one pipeline's blocks add up to, including what could not be read. */
export interface PipelineBlockReading {
  blocks: PipelineBlockView[]
  problems: BlockProblem[]
  /** How many ids the stored array held, including the ones that could not be read. */
  storedIds: number
  /** True when the pipeline stores no `blockIds` key at all, which is a stub rather than empty. */
  undeclared: boolean
}

/**
 * Read one pipeline's blocks, in the order the pipeline stores them.
 *
 * THE ONLY READER. `records` is everything the caller has loaded and `links` is every link it has;
 * both are filtered here rather than by the caller, so no page can accidentally read a different
 * subset and get a different answer.
 *
 * A block id that names nothing, names a deleted record, or names a record that is not a block is
 * REPORTED and left out of `blocks`. It is never silently skipped and never invented: an ordered
 * list with a hole in it is a fact about the archive and a page has to be able to say so.
 */
export function readPipelineBlocks(
  pipeline: PanelRecord,
  records: readonly PanelRecord[],
  links: readonly BlockLinkRow[],
): PipelineBlockReading {
  const entries = storedEntries(pipeline)
  const ids = entries.map((e) => e.id).filter((id): id is string => id !== null)
  const byId = new Map<string, PanelRecord>()
  for (const record of records) byId.set(record.id, record)

  const wanted = new Set(ids)
  // Only the links that touch a block of THIS pipeline, gathered once rather than per block.
  //
  // THE BATCHED PASS STAYS BATCHED and the FILTER is what is shared. Calling `modulesCarrying` in a
  // loop would undo the reason this pass exists — one walk over the workspace's links for a whole
  // pipeline rather than one per step — so it calls `carriesBlock`, which is the one statement of
  // the rule, and builds the same element with the same `carrierOf`.
  const implementsIn = new Map<string, BlockCarrier[]>()
  const notCarriersIn = new Map<string, NotACarrier[]>()
  const blocksIn = new Map<string, BlockNeed[]>()
  const movesOut = new Map<string, BlockMove[]>()
  const hungIn = new Map<string, HungPipeline[]>()
  for (const link of links) {
    if (!wanted.has(link.toId)) continue
    if (link.type === 'implements') {
      const module = byId.get(link.fromId)
      if (module !== undefined && fromEndIsNotAModule(link, module)) {
        const dropped: NotACarrier = { linkId: link.id, fromId: link.fromId, kind: module.kind, title: module.title }
        const list = notCarriersIn.get(link.toId)
        if (list === undefined) notCarriersIn.set(link.toId, [dropped])
        else list.push(dropped)
        continue
      }
      if (!carriesBlock(link, link.toId, module)) continue
      const carrier = carrierOf(link, module)
      const list = implementsIn.get(link.toId)
      if (list === undefined) implementsIn.set(link.toId, [carrier])
      else list.push(carrier)
    } else if (link.type === 'blocks' && wanted.has(link.fromId)) {
      // A `blocks` link from something that is NOT a block of this pipeline is a real dependency
      // and is drawn as one, but it is not one of this pipeline's internal edges, so it is left to
      // the graph rather than folded in here as though it were a step-to-step wait.
      const gate = link.gate === 'hard' || link.gate === 'partial' ? link.gate : null
      const upTo = str(link.upTo)
      const need: BlockNeed = upTo === null ? { blockId: link.fromId, gate, linkId: link.id } : { blockId: link.fromId, gate, upTo, linkId: link.id }
      const list = blocksIn.get(link.toId)
      if (list === undefined) blocksIn.set(link.toId, [need])
      else list.push(need)
    } else if (link.type === 'feeds' && wanted.has(link.fromId) && wanted.has(link.toId)) {
      // A FLOW BETWEEN TWO OF THIS PIPELINE'S STEPS. Both ends are steps of this pipeline, so the
      // drawing can place the arrow; a feeds link with an end outside it belongs to the graph that
      // holds both records, not to this pipeline's rows. What moves is read as stored, and the port
      // names are the agents' own words.
      const move: BlockMove = { blockId: link.toId, linkId: link.id, carries: carriesOf(link.carries) }
      const list = movesOut.get(link.fromId)
      if (list === undefined) movesOut.set(link.fromId, [move])
      else list.push(move)
    } else if (link.type === 'part_of') {
      // A PIPELINE HUNG FROM ONE OF THIS PIPELINE'S STEPS. A `part_of` link from any other kind
      // (a run filed under the step, say) is not a pipeline to open, so it is left to the record page.
      const from = byId.get(link.fromId)
      if (from === undefined || from.kind !== 'pipeline') continue
      const hung: HungPipeline = { id: from.id, title: from.title }
      const list = hungIn.get(link.toId)
      if (list === undefined) hungIn.set(link.toId, [hung])
      else list.push(hung)
    }
  }

  const blocks: PipelineBlockView[] = []
  const problems: BlockProblem[] = []
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const at = index + 1
    // AN ENTRY THAT IS NOT AN ID AT ALL. It used to be filtered out before this loop ever ran, so a
    // stored `[…, 99999, "NOT-A-RECORD", "", …]` came back as three blocks and ONE hole — the number
    // and the empty string named nowhere, and `NOT-A-RECORD` reported at position 2 when it is
    // stored third. A hole in an ordered list is a fact about the archive; a hole nobody is told
    // about is a shorter pipeline.
    if (entry.id === null) {
      problems.push({
        at,
        blockId: '',
        title: null,
        problem:
          `position ${at} of the stored order holds ${JSON.stringify(entry.raw)}, which is not a block id. ` +
          `Only POST /api/records/<pipeline>/blocks may write this array; a value like this reaches it through ` +
          `an import or a row written before that was checked.`,
        said: `Step ${at} of this pipeline is not a step at all. Something that names nothing is stored in its place.`,
      })
      return
    }
    const id = entry.id
    // THE SAME ID TWICE. `POST` and `PATCH` both refuse it, so this is an archive that already holds
    // one — and drawing it as two live steps is the defect the block model was built to end: two
    // rows carrying one key, which is what `data.steps` used to do.
    if (seen.has(id)) {
      problems.push({
        at,
        blockId: id,
        title: byId.get(id)?.title ?? null,
        problem: `that block is already at position ${entries.findIndex((e) => e.id === id) + 1} of this order, and a block is at one position or it is nowhere`,
        said: `One step of this pipeline is listed twice, at ${entries.findIndex((e) => e.id === id) + 1} and at ${at}. A step is in one place or it is nowhere.`,
      })
      return
    }
    seen.add(id)
    const record = byId.get(id)
    if (record === undefined) {
      problems.push({
        at,
        blockId: id,
        title: null,
        problem: 'no record has that id — it was not loaded, or it is not there any more',
        said: `Step ${at} of this pipeline points at something that is not there.`,
      })
      return
    }
    if (record.kind !== BLOCK_KIND) {
      problems.push({
        at,
        blockId: id,
        title: record.title,
        problem: `that record is a ${record.kind}, not a block`,
        said: `Step ${at} of this pipeline points at “${record.title}”, which is not a step.`,
      })
      return
    }
    if (record.deletedAt !== null) {
      problems.push({
        at,
        blockId: id,
        title: record.title,
        problem: 'that block has been deleted, and the pipeline still lists it',
        said: `The step “${blockNameIn(record.title, pipeline.title)}” has been deleted, and this pipeline still lists it.`,
      })
      return
    }
    const data = isObj(record.data) ? record.data : {}
    const state = str(data['state'])
    if (state === null || !STATE_NAMES.includes(state)) {
      problems.push({
        at,
        blockId: id,
        title: record.title,
        problem: `its state is ${JSON.stringify(data['state'])}, which is not one of ${STATE_NAMES.join(', ')}`,
        said: `Nobody has said where the step “${blockNameIn(record.title, pipeline.title)}” stands, so this pipeline cannot be drawn.`,
      })
      return
    }
    const carriers = (implementsIn.get(id) ?? []).sort(byCarrierTitleThenId)
    blocks.push({
      id,
      name: blockNameIn(record.title, pipeline.title),
      title: record.title,
      state: state as ItemState,
      measured: str(data['measured']),
      carriers,
      notCarriers: notCarriersIn.get(id) ?? [],
      moduleIds: carriers.map((carrier) => carrier.moduleId),
      modules: carriers.map((carrier) => carrier.title),
      needs: blocksIn.get(id) ?? [],
      moves: movesOut.get(id) ?? [],
      hung: hungIn.get(id) ?? [],
      consequence: readConsequence(data),
      pause: readPause(data),
      record,
    })
  })

  // `storedIds` COUNTS WHAT THE ORDER HOLDS, usable or not. It counted the filtered list, so a
  // pipeline storing six entries answered four and a reader comparing it against `blocks.length`
  // saw no discrepancy to ask about.
  return { blocks, problems, storedIds: entries.length, undeclared: !pipelineDeclaresBlocks(pipeline) }
}

/**
 * EVERY pipeline whose stored order lists this block, in title-then-id order.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT ANSWERS WITH A LIST, AND WHAT IS STILL TRUE OF THE LIVE CORPUS TODAY
 * ---------------------------------------------------------------------------------------
 *
 * This replaced `pipelineOfBlock`, which answered with the FIRST pipeline it found, and
 * `pipelinesListing` in ./containment.ts, which called that function in a loop, took the answer
 * out of the records and asked again. Two functions for one question, and the looping one was the
 * only caller that could ever see a second pipeline.
 *
 * **The write door has not moved yet.** `checkBlockIds` in server/lib/records/pipeline-blocks.ts still refuses an
 * order that names a block another live pipeline lists, so on the owner's corpus this function
 * answers with nothing or with one pipeline and never with two — measured 21 August 2026: 0 live
 * blocks are listed by more than one live pipeline. It is a list because membership is a list in
 * the data — `blockIds` is an array on every pipeline record and nothing on the block says which
 * pipeline it is in — and because a caller reading an archive, a soft-deleted pipeline or an
 * imported corpus can already meet a block that two orders name. It is not a claim that the
 * product accepts one today.
 *
 * ---------------------------------------------------------------------------------------
 * WHY MEMBERSHIP IS NOT ALSO STORED ON THE BLOCK
 * ---------------------------------------------------------------------------------------
 *
 * The pipeline's ordered `blockIds` is the ONE statement of both membership and order. A
 * `pipelineId` on the block would be a second statement of the same fact with nothing making the
 * two agree, and two statements of one fact that can drift is the defect this whole change exists
 * to remove -- it is precisely what `modules[]` titles beside `implements` links already was.
 *
 * The cost is this lookup, which is a scan over the pipeline records. There are eleven of them.
 * DELETED PIPELINES ARE NOT FILTERED HERE: the caller decides what it loaded, exactly as
 * `pipelineOfBlock` did, and three live blocks in the corpus are listed only by pipelines somebody
 * soft-deleted on 12 August.
 */
export function pipelinesHolding(
  blockId: string,
  records: readonly PanelRecord[],
  byBlock: PipelinesByBlock = pipelinesByBlock(records),
): PanelRecord[] {
  return [...(byBlock.get(blockId) ?? [])]
}

/** Block id -> every pipeline in the records whose stored order names it, sorted by title then id. */
export type PipelinesByBlock = ReadonlyMap<string, readonly PanelRecord[]>

/**
 * `pipelinesHolding` for every block at once: one scan over the records instead of one per block.
 *
 * This is where the rule is written, and `pipelinesHolding` reads its answer from here. A caller
 * that asks about many blocks over the same records builds this once and passes it in; the
 * containment reader does, because GET /api/work asks about every piece of work and every level
 * above it, and a scan of every record for each of those was a large part of that door's time
 * (problem zo_hyUBLSAVJ, 25 September 2026). A pipeline that names one block twice holds it once.
 */
export function pipelinesByBlock(records: readonly PanelRecord[]): PipelinesByBlock {
  const found = new Map<string, PanelRecord[]>()
  for (const record of records) {
    if (record.kind !== 'pipeline') continue
    for (const blockId of new Set(blockIdsOf(record))) {
      const holders = found.get(blockId)
      if (holders === undefined) found.set(blockId, [record])
      else holders.push(record)
    }
  }
  for (const holders of found.values()) {
    holders.sort((a, b) => {
      if (a.title !== b.title) return a.title < b.title ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }
  return found
}

/**
 * Where the pipeline is standing: the first failed, else blocked, else doing, else todo.
 *
 * The same rule the home page has always used, moved here so the home page and the pipeline page
 * cannot answer it differently. Null means every block is done.
 */
export function pipelinePosition<T extends { state: ItemState }>(blocks: readonly T[]): T | null {
  return (
    blocks.find((b) => b.state === 'failed') ??
    blocks.find((b) => b.state === 'blocked') ??
    blocks.find((b) => b.state === 'doing') ??
    blocks.find((b) => b.state === 'todo') ??
    null
  )
}

/** A block's stored data, read defensively off a record whose `data` is a JSON column. */
export function readBlockData(record: Pick<PanelRecord, 'data'>): Partial<BlockData> {
  const data = isObj(record.data) ? record.data : {}
  const state = str(data['state'])
  const measured = str(data['measured'])
  const consequence = readConsequence(data)
  const pause = readPause(data)
  return {
    ...(state !== null && STATE_NAMES.includes(state) ? { state: state as ItemState } : {}),
    ...(measured !== null ? { measured } : {}),
    ...(consequence !== null ? { consequence } : {}),
    ...(pause !== null ? { paused: pause } : {}),
  }
}

// ============================================================ telling two records of one name apart

/**
 * What a picker draws beside a title that more than one record answers to.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A picker offers the project's record titles and a person types or chooses one. Titles may repeat
 * — the owner settled that on 16 August 2026 — so two rows in that list can read identically and
 * the person has nothing to choose between them.
 *
 * IT MATTERS MOST FOR BLOCKS, and that is why it lives in this file. A block's title used to carry
 * its pipeline's name inside it, so two steps called "Calibrate" were two different strings and the
 * picker told them apart for free. The retitle in server/db/block-identity.ts took the pipeline out
 * of the title, and the owner then allowed one block to be listed by more than one pipeline on 6 September
 * 2026. Both of those make the picker's job real: a block's own
 * name is all it has, and the thing that tells two of them apart is which pipeline each is in.
 *
 * IT SAYS SOMETHING ONLY WHERE THERE IS A CHOICE TO MAKE. A title only one record answers to gets no
 * note at all, because a note on every row is a note nobody reads.
 */
export interface TitleOption {
  /** The record's title, exactly. This is what a person picking the row is choosing. */
  value: string
  /** The record whose title this is. Two options may share a `value` and never an `id`. */
  id: string
  /**
   * What tells this one apart from the others of the same name, or null when nothing has to.
   *
   * For a block it is the pipeline or pipelines listing it. For anything else it is the kind. Null
   * when this title belongs to one record, which is almost every row.
   */
  note: string | null
}

/**
 * Every pipeline title that lists each block, worked out from the pipelines' own orders.
 *
 * `blockIds` on the pipeline is the one statement of membership, so this reads it rather than
 * anything on the block — the same rule the server's `pipelinesHolding` follows, for the same
 * reason. A block no pipeline lists is absent from the map, which is not the same as an empty list.
 */
export function pipelineTitlesByBlock<T extends Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data'>>(
  records: readonly T[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const record of records) {
    if (record.kind !== 'pipeline') continue
    for (const blockId of blockIdsOf(record)) {
      const held = out.get(blockId) ?? []
      held.push(record.title)
      out.set(blockId, held)
    }
  }
  return out
}

/**
 * The rows a picker draws, with a note on each row a person could otherwise not tell apart.
 *
 * Order is the order the records came in; nothing is sorted or dropped here, because a picker that
 * quietly left one of two identical rows out would be the defect this function is for, wearing a
 * different coat.
 */
export function titleOptions<T extends Pick<PanelRecord, 'id' | 'kind' | 'title' | 'data'>>(
  records: readonly T[],
): TitleOption[] {
  const howMany = new Map<string, number>()
  for (const record of records) howMany.set(record.title, (howMany.get(record.title) ?? 0) + 1)
  const pipelines = pipelineTitlesByBlock(records)
  return records.map((record) => {
    if ((howMany.get(record.title) ?? 0) < 2) return { value: record.title, id: record.id, note: null }
    if (record.kind !== BLOCK_KIND) return { value: record.title, id: record.id, note: record.kind }
    const holders = pipelines.get(record.id) ?? []
    if (holders.length === 0) return { value: record.title, id: record.id, note: 'a step in no pipeline' }
    return { value: record.title, id: record.id, note: `a step of ${holders.join(' and ')}` }
  })
}
