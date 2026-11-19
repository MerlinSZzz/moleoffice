// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Build the demonstration pipeline, its module boundary move and its lineage — as real
 * recorded history, in a database you name, with every record stamped `fixture`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round nine draws project evolution: a pipeline before and after, a module boundary moving, a
 * split that keeps its ancestor, and a walk backwards through what a composition was made of.
 * Measured on the corpus on 20 August 2026, there is almost nothing to draw: one live pipeline of
 * eleven has more than one revision, and the corpus contains ZERO module boundary moves — no
 * `implements` link has ever been removed, so no module has ever lost a block.
 *
 * A drawing built against a corpus that holds none of the shapes it draws is a drawing nobody has
 * tested. So this script writes the shapes, through the product's own write path, one act at a
 * time, in an order — which is what makes the result a HISTORY rather than a picture of one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES IT HONEST, AND IT IS ONE STORED FACT AND NOT A PROMISE IN A COMMENT
 * ---------------------------------------------------------------------------------------
 *
 * Every record this script writes carries `origin: 'fixture'` in the `records.origin` COLUMN.
 * `ORIGIN_MEANINGS.fixture` in shared/types.ts is the sentence that word means, and the browser
 * draws it as the chip `Made-up example` on the row and on the record's own page. That is Mole Office's
 * mark for how a record entered the corpus, it is exactly this question, and it is the one a
 * `dataPatch` cannot rewrite and an export cannot drop.
 *
 * `fixture` is reachable only in process — `createRecordWithReport`'s `origin` is deliberately not
 * on the HTTP body, because a request arriving with an actor on it is authored by definition. So
 * this script calls the same library functions the routes call, in the same transactions, with the
 * same validation, the same change rows and the same revisions. What it does NOT do is claim to be
 * a person: the actor is an agent named below, so every revision and every change row says an
 * agent called `demonstration-builder` did it. Nothing here is attributable to the owner.
 *
 * SECOND, VISIBLE HALF. The pipeline, the modules and every block title carry the words
 * `made-up example` — the same words the chip uses. This is not a second source of truth: the
 * column is the fact, the title is a courtesy for screens that do not draw the chip yet (the
 * evolution views of steps 45 to 48 do not exist), and `--check` below REFUSES if the two ever
 * disagree, which is what makes the pair a pair rather than two things that can drift.
 *
 * ---------------------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------------------
 *
 *   MOLE_OFFICE_DB=/path/to/a/copy.db npx tsx tools/demonstration-pipeline.ts
 *   MOLE_OFFICE_DB=/path/to/a/copy.db npx tsx tools/demonstration-pipeline.ts --check
 *
 * `--workspace <id>` builds it in another project (`greenhouse` by default) and `--pace <ms>` changes
 * the gap between acts (1100 ms by default, and PACE_MS below says why there is a gap at all).
 *
 * `MOLE_OFFICE_DB` must be set: this script never falls back to `./data/panelx.db`, because the file it
 * would fall back to is somebody's real work. It refuses a database that already holds the
 * demonstration rather than writing a second copy, and `--check` re-reads what was written and
 * reports what is wrong with it, by name, exiting non-zero.
 *
 * IT IS NOT A MIGRATION AND IT IS NOT `db:seed`. It writes new rows and touches nothing that was
 * there before. Everything it writes is soft-deletable through the ordinary routes.
 */
import { resolve } from 'node:path'
import type { Actor } from '../src/server/lib/records.ts'
import type { ItemState, PanelRecord } from '@shared/types.ts'
import { canonicalDatabasePath, settingValue, settingWasSet } from '../src/config/settings.mjs'

// ---------------------------------------------------------------------------- the database, first
//
// THE REFUSAL RUNS BEFORE ANYTHING OPENS A DATABASE, AND THAT IS WHY THE IMPORTS BELOW ARE
// DYNAMIC. `src/server/db/client.ts` opens its file the moment it is imported, WRITABLE, and an
// ordinary `import` at the top of this file would therefore have opened whatever `MOLE_OFFICE_DB` or
// `.env` names before one line of this script ran — including the owner's corpus, which is the one
// file this campaign may never write to. Type-only imports above are erased and open nothing.
//
// The same trap is documented in `src/server/db/client.ts` for tests, where it was measured: eight
// test files opened the operator's real corpus writable through a plain constant import.

/**
 * The corpus this campaign must never write to: the database this checkout calls canonical.
 *
 * READ FROM THE DECLARATION, NEVER SPELLED HERE. It used to be an absolute path under the home
 * folder, written into this file, so moving the corpus
 * would have left the guard guarding a file nobody uses while this script wrote to the real one.
 * Criterion G1, problem `XnEkXa6aq0Yn`.
 */
const THE_OWNERS_CORPUS = canonicalDatabasePath()

const ARGS = process.argv.slice(2)

function refuseTheWrongDatabase(): string {
  const named = settingWasSet('MOLE_OFFICE_DB') ? String(settingValue('MOLE_OFFICE_DB')) : undefined
  if (named === undefined || named.trim() === '') {
    console.error(
      'Say which database to write to: MOLE_OFFICE_DB=/path/to/a/copy.db npx tsx tools/demonstration-pipeline.ts\n' +
        `There is no default. The default would be ${THE_OWNERS_CORPUS}, which is somebody's real work.`,
    )
    process.exit(2)
  }
  const file = resolve(named)
  if (file === THE_OWNERS_CORPUS && !ARGS.includes('--yes-write-to-this-corpus')) {
    console.error(
      `MOLE_OFFICE_DB names ${file}, which is the working corpus this campaign is built from.\n` +
        'Nothing was written, and nothing was opened. Build it into a copy first:\n' +
        `  node -e "new (require('better-sqlite3'))('${THE_OWNERS_CORPUS}',{readonly:true}).exec(\\"VACUUM INTO '/tmp/copy.db'\\")"\n` +
        'If you are the operator and you mean this database, pass --yes-write-to-this-corpus.',
    )
    process.exit(2)
  }
  return file
}

const THE_DATABASE = refuseTheWrongDatabase()

const {
  createLink,
  createRecordWithReport,
  deleteLink,
  getRecord,
  getRecordByTitle,
  recordsByTitle,
  listChanges,
  allLinks,
  patchRecord,
} = await import('../src/server/lib/records.ts')
const { addBlock, patchBlock, removeBlock } = await import('../src/server/lib/blocks.ts')
const { blockIdsOf } = await import('@shared/blocks.ts')
const { readOrigin } = await import('@shared/types.ts')
const { listRevisions } = await import('../src/server/lib/revisions.ts')
const { databaseFileStatus } = await import('../src/server/db/client.ts')

/**
 * ASK THE CLIENT WHICH FILE IT ACTUALLY OPENED, rather than trusting that the refusal above ran
 * first. The guard depends on evaluation order, and evaluation order is exactly the kind of thing
 * a later edit reorders without noticing. This compares the answer with what was approved.
 */
function refuseADatabaseNobodyApproved(): void {
  const opened = databaseFileStatus().path
  if (opened !== THE_DATABASE) {
    console.error(
      `This script approved ${THE_DATABASE} and the database layer opened ${opened}. Nothing was written.`,
    )
    process.exit(2)
  }
}

// ---------------------------------------------------------------------------- what gets written

/**
 * The words that say what this is, in the title of every record written here.
 *
 * `Made-up example` is the browser's word for `origin: 'fixture'` (`originSaid` in
 * src/web/components/ui.tsx). The same words are used here on purpose: a reader who has seen the
 * chip anywhere in Mole Office reads the same thing in a graph node that has no chip on it yet.
 */
const MARK = 'made-up example'

/** The pipeline as it was first written, before the tray-marker rewrite. Nine steps, in that order. */
const FIRST_STEPS: readonly { name: string; state: ItemState }[] = [
  { name: 'LeafCam 2 frame', state: 'todo' },
  { name: 'Pot detector', state: 'todo' },
  { name: 'Leaf mask', state: 'todo' },
  { name: 'Cast to bench coordinates', state: 'todo' },
  { name: 'Clamp pose generation', state: 'todo' },
  { name: 'Clamp pose filtering', state: 'todo' },
  { name: 'Lane move planning', state: 'todo' },
  { name: 'Transplant', state: 'todo' },
  { name: 'Withdraw', state: 'todo' },
]

/** What replaces the camera side of it: the pose of a marker printed on the tray, and a preset clamp pose. */
const MARKER_STEPS: readonly { name: string; state: ItemState }[] = [
  { name: 'Tray marker pose', state: 'todo' },
  { name: 'Preset clamp pose', state: 'todo' },
]

/** The six blocks the tray-marker rewrite takes out of the pipeline, in the order they are removed. */
const REPLACED = ['LeafCam 2 frame', 'Pot detector', 'Leaf mask', 'Cast to bench coordinates', 'Clamp pose generation', 'Clamp pose filtering']

/** The two blocks that leave the Perception module when the boundary moves. */
const MOVED_OUT = ['Clamp pose generation', 'Clamp pose filtering']

const PIPELINE_TITLE = `Camera-led transplant — ${MARK}`
const DESCENDANT_TITLE = `Camera-led transplant, camera route kept — ${MARK}`
const PERCEPTION = `Perception — ${MARK}`
const CLAMP_PLANNING = `Clamp planning — ${MARK}`
const PLANNING = `Planning — ${MARK}`
const EXECUTION = `Execution — ${MARK}`

/**
 * Who did it. An agent, and one whose name says what it was doing.
 *
 * NOT `HUMAN`. Every revision and every change row stores the actor, and the history screens draw
 * it. Writing this with the owner's own name would put that name on nine changes they did not make, which is
 * the fabricated-evidence rule broken in the one place it is most expensive: the ledger.
 */
const BUILDER: Actor = { type: 'agent', id: 'demonstration-builder' }

/**
 * HOW LONG TO WAIT BETWEEN ACTS, AND WHY WAITING AT ALL IS THE HONEST CHOICE.
 *
 * Mole Office stamps every revision, change row and link with a LOCAL wall clock at one-second
 * resolution. A build that runs flat out writes sixty acts inside one second, and the history that
 * comes out is real but unreadable: every version of the pipeline says the same time, so a reader
 * asking "what was this made of on the way through" gets one instant with everything in it, and a
 * projection keyed on a time cannot separate two events at all.
 *
 * So the acts are spaced far enough apart to land in different seconds. NOTHING IS BACKDATED and
 * nothing is written into the timestamp columns by hand: the times are simply when this script
 * really did each thing. `--pace 0` turns the wait off, and the demonstration then has a history
 * one second wide, which is worth knowing before you build one that way.
 */
const PACE_MS = (() => {
  const at = ARGS.indexOf('--pace')
  if (at === -1) return 1100
  const given = Number(ARGS[at + 1])
  if (!Number.isFinite(given) || given < 0) {
    console.error(`--pace wants a number of milliseconds and was given ${JSON.stringify(ARGS[at + 1])}.`)
    process.exit(2)
  }
  return given
})()

/** Wait, synchronously, so the next act lands in a later second than this one. */
function pause(): void {
  if (PACE_MS === 0) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PACE_MS)
}

/** Do one act and leave a gap after it. Every write below goes through this. */
function act<T>(what: () => T): T {
  const done = what()
  pause()
  return done
}

// ---------------------------------------------------------------------------- small helpers

interface Written {
  pipeline: string
  descendant: string
  blocks: Record<string, string>
  descendantBlocks: Record<string, string>
  modules: Record<string, string>
}

function file(kind: 'pipeline' | 'module', title: string, summary: string, data: Record<string, unknown>): PanelRecord {
  const { record } = act(() => createRecordWithReport({
    kind,
    title,
    summary,
    data,
    workspaceId: WORKSPACE,
    actor: BUILDER,
    // THE STAMP. Written by the thing that wrote the record, which is the only evidence this word
    // is ever allowed to rest on. Nothing below infers an origin from a title or a date.
    origin: 'fixture',
  }))
  return record
}

function implementsLink(moduleId: string, blockId: string): void {
  act(() => createLink({ fromId: moduleId, toId: blockId, type: 'implements', actor: BUILDER }))
}

function unimplementLink(moduleId: string, blockId: string): void {
  const link = allLinks(WORKSPACE).find((l) => l.fromId === moduleId && l.toId === blockId && l.type === 'implements')
  if (!link) throw new Error(`No implements link from ${moduleId} to ${blockId} to remove.`)
  act(() => deleteLink(link.id, BUILDER, WORKSPACE))
}

/**
 * WHICH PROJECT IT IS BUILT IN. `greenhouse` unless `--workspace <id>` says otherwise.
 *
 * NOT AN ENVIRONMENT VARIABLE, and that was found by a test rather than by thinking. It was one for
 * a draft, and `tests/config.test.ts` failed: every setting whose name begins with this product's
 * prefix has to be documented in `.env.example`, which is a file this step does not own. The test
 * scans for the name as TEXT, so even writing it in this comment fails the run — which is the test
 * being conservative on purpose, and is why the name is not written here. A one-off builder wants
 * an argument anyway: the setting belongs to the run, not to the machine.
 *
 * `greenhouse` is where it belongs. That project holds the seeded demo corpus, so a made-up
 * pipeline sits among made-up rows rather than among somebody's real work. The corpus measured when
 * this was written had 187 of its 188 rows stamped `fixture`. That corpus has been replaced since,
 * so the count is a fact about the old one.
 */
const WORKSPACE = (() => {
  const at = ARGS.indexOf('--workspace')
  if (at === -1) return 'greenhouse'
  const given = ARGS[at + 1]
  if (given === undefined || given.startsWith('--')) {
    console.error('--workspace wants the id of a project, for example --workspace greenhouse.')
    process.exit(2)
  }
  return given
})()

// ---------------------------------------------------------------------------- the build

/**
 * The whole demonstration, as a sequence of acts in the order they would really have happened.
 *
 * EACH LINE IS ONE PRODUCT ACTION. The pipeline's revisions are the revisions those actions wrote;
 * the block edits are child revisions in a recorded order, which is what a step-back walk reads;
 * the two link removals are the first module boundary move in this corpus.
 */
function build(): Written {
  const written: Written = { pipeline: '', descendant: '', blocks: {}, descendantBlocks: {}, modules: {} }

  // ---- 1. The pipeline as first understood, one block at a time.
  const pipeline = file(
    'pipeline',
    PIPELINE_TITLE,
    `A made-up example, written to give Mole Office's evolution screens a pipeline with a real history to draw. ` +
      `It is a camera-led transplant: an overhead frame, a pot detector, a leaf mask, bench coordinates, ` +
      `clamp pose generation and filtering, then lane planning, the transplant and the withdrawal. ` +
      `It is not a record of work anybody did.`,
    { blockIds: [] },
  )
  written.pipeline = pipeline.id
  for (const step of FIRST_STEPS) {
    const { block } = act(() => addBlock(pipeline.id, { name: step.name, state: step.state, origin: 'fixture' }, BUILDER))
    written.blocks[step.name] = block.id
  }

  // ---- 2. The modules, and the boundary as it first stood: Perception holds all six camera-side steps.
  const perception = file(
    'module',
    PERCEPTION,
    'A made-up example. The perception subsystem as it was first drawn, holding everything from the camera frame to the filtered clamp poses.',
    {
      context:
        'A made-up example, not a real subsystem. It exists so that a module boundary can be seen to MOVE: it starts ' +
        'holding the camera frame, the pot detector, the leaf mask, the bench coordinates and both clamp pose steps.',
      parts: [],
    },
  )
  written.modules[PERCEPTION] = perception.id
  for (const name of ['LeafCam 2 frame', 'Pot detector', 'Leaf mask', 'Cast to bench coordinates', 'Clamp pose generation', 'Clamp pose filtering']) {
    implementsLink(perception.id, written.blocks[name]!)
  }

  const planning = file('module', PLANNING, 'A made-up example. The planning side of the same pipeline.', {
    context: 'A made-up example. It carries the lane move planning step, so the pipeline has more than one module to draw.',
    parts: [],
  })
  written.modules[PLANNING] = planning.id
  implementsLink(planning.id, written.blocks['Lane move planning']!)

  const execution = file('module', EXECUTION, 'A made-up example. The execution side of the same pipeline.', {
    context: 'A made-up example. It carries the transplant and withdraw steps.',
    parts: [],
  })
  written.modules[EXECUTION] = execution.id
  implementsLink(execution.id, written.blocks['Transplant']!)
  implementsLink(execution.id, written.blocks['Withdraw']!)

  // ---- 3. Work happens, one child at a time, in a recorded order.
  //
  // THIS IS WHAT A STEP-BACK WALK READS. Seven edits to four blocks, two of them to the same block,
  // so the walk has a `C → C1 → C2` in it and not only a row of single changes.
  const edits: readonly { name: string; patch: { state?: ItemState; measured?: string } }[] = [
    { name: 'LeafCam 2 frame', patch: { state: 'doing' } },
    { name: 'LeafCam 2 frame', patch: { state: 'done' } },
    { name: 'Pot detector', patch: { state: 'doing' } },
    { name: 'Pot detector', patch: { state: 'done' } },
    { name: 'Leaf mask', patch: { state: 'doing' } },
    { name: 'Cast to bench coordinates', patch: { state: 'doing' } },
    { name: 'Clamp pose generation', patch: { state: 'blocked' } },
  ]
  for (const edit of edits) act(() => patchBlock(pipeline.id, written.blocks[edit.name]!, edit.patch, BUILDER))

  // ---- 4. THE BOUNDARY MOVES. The move the corpus shows, and the first one it holds.
  //
  // Perception should end at the bench coordinates; the two clamp pose steps belong outside it.
  // Three recorded facts, which is what the drawing needs: the old grouping (the links written in
  // step 2 and the `link` change rows behind them), the boundary change (these two `unlink` rows
  // and the module's own new revision), and the new grouping (the two links below).
  const clampPlanning = file(
    'module',
    CLAMP_PLANNING,
    'A made-up example. The module the two clamp pose steps moved into when the perception boundary was redrawn.',
    {
      context:
        'A made-up example. It exists because the boundary moved: clamp pose generation and clamp pose filtering ' +
        'were inside Perception and are now their own subsystem.',
      parts: [],
    },
  )
  written.modules[CLAMP_PLANNING] = clampPlanning.id
  for (const name of MOVED_OUT) unimplementLink(perception.id, written.blocks[name]!)
  for (const name of MOVED_OUT) implementsLink(clampPlanning.id, written.blocks[name]!)
  act(() => patchRecord(
    perception.id,
    {
      dataPatch: {
        context:
          'A made-up example, not a real subsystem. It ENDS AT THE BENCH COORDINATES. It held the two clamp pose ' +
          'steps until the boundary was redrawn; they are now in the clamp planning module. The change is what this ' +
          'example is for.',
      },
    },
    BUILDER,
  ))

  // ---- 5. The descendant, taken BEFORE the rewrite, so the camera route survives it.
  //
  // The split: a pipeline may split into descendants, and neither pretends to
  // have owned the other's history. The descendant carries a `derived_from` link to the ancestor.
  // WHICH REVISION IT WAS TAKEN AT IS NOT STORED, and cannot be: `links` has no column for it until
  // step 42's generic ancestor-revision columns land. The number is written into the summary as
  // PROSE so that nothing reads it as a stored fact.
  const ancestorRevisions = listRevisions(pipeline.id).count
  const descendant = file(
    'pipeline',
    DESCENDANT_TITLE,
    `A made-up example. The camera route, kept as its own pipeline when the tray-marker rewrite replaced it in ` +
      `"${PIPELINE_TITLE}". It was taken from that pipeline at its revision ${ancestorRevisions}; that number is ` +
      `written here as prose because nothing in Mole Office stores the revision a link was taken at yet.`,
    { blockIds: [] },
  )
  written.descendant = descendant.id
  for (const step of FIRST_STEPS) {
    const { block } = act(() => addBlock(descendant.id, { name: step.name, state: step.state, origin: 'fixture' }, BUILDER))
    written.descendantBlocks[step.name] = block.id
  }
  act(() => createLink({ fromId: descendant.id, toId: pipeline.id, type: 'derived_from', actor: BUILDER }))

  // ---- 6. The rewrite. The tray marker pose and the preset clamp pose go in at the front, and
  // the six camera-side steps come out — one act each, so the before and the after are both
  // reachable and every removed block is still readable as a soft-deleted record.
  let at = 0
  for (const step of MARKER_STEPS) {
    const { block } = act(() => addBlock(pipeline.id, { name: step.name, state: step.state, at, origin: 'fixture' }, BUILDER))
    written.blocks[step.name] = block.id
    at += 1
  }
  for (const name of REPLACED) act(() => removeBlock(pipeline.id, written.blocks[name]!, BUILDER))
  implementsLink(perception.id, written.blocks['Tray marker pose']!)
  implementsLink(clampPlanning.id, written.blocks['Preset clamp pose']!)

  return written
}

// ---------------------------------------------------------------------------- the check

interface Complaint {
  what: string
  found: string
}

/**
 * Read back what is there and say what is wrong with it. Nothing here trusts the build's own
 * variables: every id is found again by title, the way a reader would find it.
 *
 * IT IS THE PART THAT MATTERS. A demonstration that loses its mark is worse than no demonstration,
 * because it is made-up content reading as a record of real work — so this refuses to report
 * success unless the stamp, the visible words and the history are all there, together.
 */
function check(): Complaint[] {
  const complaints: Complaint[] = []
  const say = (what: string, found: string) => complaints.push({ what, found })

  const pipeline = getRecordByTitle(PIPELINE_TITLE, WORKSPACE)
  if (!pipeline) {
    say(`the pipeline "${PIPELINE_TITLE}" exists`, 'no record of that title')
    return complaints
  }
  const descendant = getRecordByTitle(DESCENDANT_TITLE, WORKSPACE)
  // THE MODULES ARE FOUND THROUGH THE LINKS, NOT BY THEIR TITLES, and the difference is the whole
  // point of the check. Looked up by title, a module whose title had lost the mark would come back
  // as "no record of that title" — the mark reported as an absent record, which is the wrong fault
  // and reads as a build that never ran. Followed through `implements`, the module is found and the
  // missing mark is reported as a missing mark.
  const liveBlockIds = blockIdsOf(pipeline)
  const carriers = allLinks(WORKSPACE).filter((l) => l.type === 'implements' && liveBlockIds.includes(l.toId))
  const modules = [...new Set(carriers.map((l) => l.fromId))]
    .map((id) => getRecord(id))
    .filter((r): r is PanelRecord => r !== null)
  if (modules.length !== 4) say('four modules carry this pipeline', `${modules.length} do`)
  /** The module carrying a named block of this pipeline, found the way a reader would follow it. */
  const carrierOf = (blockName: string): PanelRecord | undefined => {
    // A BLOCK'S TITLE IS ITS OWN NAME. This used to look for the
    // pipeline's title in front of it.
    const blockId = liveBlockIds.find((id) => getRecord(id)?.title === blockName)
    const link = carriers.find((l) => l.toId === blockId)
    return modules.find((m) => m.id === link?.fromId)
  }

  // 1. THE MARK, on every record this script writes, read from the column.
  const mine: PanelRecord[] = [pipeline, ...modules]
  if (descendant) mine.push(descendant)
  for (const id of blockIdsOf(pipeline)) {
    const b = getRecord(id)
    if (b) mine.push(b)
  }
  if (descendant) {
    for (const id of blockIdsOf(descendant)) {
      const b = getRecord(id)
      if (b) mine.push(b)
    }
  }
  for (const r of mine) {
    const origin = readOrigin(r.origin)
    if (origin !== 'fixture') say(`"${r.title}" is stamped fixture`, `origin is ${JSON.stringify(r.origin)}`)
    // THE PAIRING, CHECKED IN BOTH DIRECTIONS. The column is the fact and the words are the
    // courtesy, and a courtesy that can go missing without anything failing is how the two drift.
    if (!r.title.toLowerCase().includes(MARK)) say(`"${r.title}" says "${MARK}" in its title`, 'it does not')
  }

  // 2. THE HISTORY. Revisions written by acts, not by one write pretending to be many.
  const ledger = listRevisions(pipeline.id, 200)
  if (ledger.count < 15) say('the pipeline has at least 15 revisions', `it has ${ledger.count}`)
  // THE HISTORY IS NOT ONE INSTANT. A ledger whose eighteen versions all say the same second is a
  // real history that no time-keyed reading can separate, and the evolution steps read one.
  const stamps = new Set(ledger.revisions.map((r) => r.at))
  if (PACE_MS > 0 && stamps.size < ledger.revisions.length) {
    say('every revision has a time of its own', `${stamps.size} distinct times over ${ledger.revisions.length} revisions`)
  }
  const byAPerson = ledger.revisions.filter((r) => r.who.actorType === 'human')
  if (byAPerson.length > 0) {
    say('no revision claims a person made it', `${byAPerson.length} of ${ledger.revisions.length} say a human did`)
  }

  // 3. THE BOUNDARY MOVE. Unlink rows on `implements`, which is the only evidence a module ever
  // lost a block, and the whole reason this script exists.
  const perception = carrierOf('Tray marker pose')
  if (!perception) say('the perception module still carries the first step', 'no module carries it')
  else {
    const unlinks = listChanges({ recordId: perception.id, workspaceId: WORKSPACE, limit: 200 }).filter(
      (c) => c.op === 'unlink' && c.field === 'implements',
    )
    if (unlinks.length !== MOVED_OUT.length) {
      say(`the perception module lost ${MOVED_OUT.length} blocks`, `${unlinks.length} unlink rows on implements`)
    }
    const clampPlanning = carrierOf('Preset clamp pose')
    if (!clampPlanning) say('a module carries the preset clamp pose', 'none does')
    else {
      const gained = allLinks(WORKSPACE).filter((l) => l.fromId === clampPlanning.id && l.type === 'implements')
      if (gained.length < MOVED_OUT.length) {
        say(`the two moved blocks arrived somewhere`, `${gained.length} implements links out of the new module`)
      }
    }
    if (listRevisions(perception.id).count < 2) {
      say('the perception module has a revision of its own from the boundary change', 'it has one revision')
    }
  }

  // 4. THE REWRITE. The current order is the rewritten one, and every replaced block is still readable.
  const order = blockIdsOf(pipeline).map((id) => getRecord(id)?.title ?? '(missing)')
  const wanted = ['Tray marker pose', 'Preset clamp pose', 'Lane move planning', 'Transplant', 'Withdraw']
  if (order.join(' → ') !== wanted.join(' → ')) say(`the pipeline now reads ${wanted.join(' → ')}`, order.join(' → '))
  for (const name of REPLACED) {
    const found = recordsByTitle(name, WORKSPACE)
    const gone = found[0]
    if (found.length !== 1 || gone === undefined) {
      say(`the removed block "${name}" is still readable`, `${found.length} records answer to that title`)
    } else if (gone.deletedAt === null) {
      say(`the removed block "${name}" is out of the pipeline`, 'it is still live')
    }
  }

  // 5. THE LINEAGE. The descendant names its ancestor, and the ancestor's own ledger says nothing
  // about the descendant — which is the rule step 47 is built on.
  if (!descendant) say(`the descendant "${DESCENDANT_TITLE}" exists`, 'no record of that title')
  else {
    const lineage = allLinks(WORKSPACE).filter(
      (l) => l.fromId === descendant.id && l.toId === pipeline.id && l.type === 'derived_from',
    )
    if (lineage.length !== 1) say('the descendant is derived_from the ancestor', `${lineage.length} such links`)
  }

  return complaints
}

// ---------------------------------------------------------------------------- run

function main(): void {
  refuseADatabaseNobodyApproved()
  const db = THE_DATABASE
  const checkOnly = ARGS.includes('--check')

  if (!checkOnly) {
    const already = getRecordByTitle(PIPELINE_TITLE, WORKSPACE)
    if (already) {
      console.error(
        `${db} already holds "${PIPELINE_TITLE}" (${already.id}). Nothing was written.\n` +
          'This script builds a history once; running it again would file a second copy of a made-up example, ' +
          'and the two would then be indistinguishable on every screen. Delete the first through the ordinary ' +
          'routes, or run --check to read what is there.',
      )
      process.exit(2)
    }
    const written = build()
    console.log(
      `Written to ${db}: pipeline ${written.pipeline}, descendant ${written.descendant}, ` +
        `${Object.keys(written.blocks).length + Object.keys(written.descendantBlocks).length} blocks, ` +
        `${Object.keys(written.modules).length} modules — every one stamped fixture, by ${BUILDER.id}.`,
    )
  }

  const complaints = check()
  if (complaints.length > 0) {
    console.error(`\nThe demonstration in ${db} is not honest yet. ${complaints.length} thing(s) wrong:`)
    for (const c of complaints) console.error(`  - expected: ${c.what}\n    found:    ${c.found}`)
    process.exit(1)
  }
  const pipeline = getRecordByTitle(PIPELINE_TITLE, WORKSPACE)!
  console.log(
    `Checked: ${listRevisions(pipeline.id).count} pipeline revisions, every record stamped fixture and saying ` +
      `"${MARK}" in its title, the boundary move recorded as ${MOVED_OUT.length} unlink rows, and the descendant ` +
      `naming its ancestor.`,
  )
}

main()
