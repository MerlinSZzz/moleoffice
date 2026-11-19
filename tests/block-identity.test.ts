// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BLOCK'S NAME IS A LOCATOR. ITS RECORD ID IS ITS IDENTITY. THIS FILE HOLDS THE TWO APART.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND THE FOUR THINGS THAT HAVE TO BE TRUE FOR IT TO HOLD
 * ---------------------------------------------------------------------------------------
 *
 * A block record's id never changes. Its qualified title — `<pipeline> › <name>` — is how a person
 * or an agent addresses it BY NAME, without first looking up an id. Two different jobs, and the
 * whole of the block migration rests on nothing ever confusing them:
 *
 *   - Renaming a pipeline moves every one of its blocks' LOCATORS. It must move no id and touch no
 *     link, and it must refuse rather than half-apply when a new title is taken.
 *   - Renaming a module must be incapable of breaking anything, because a module is named by id
 *     from a block and by nothing else. Before the migration a step named its modules by TITLE
 *     while a parallel `implements` link named the same modules by ID, and one accepted rename
 *     broke ten mappings behind an HTTP 200 with nothing reporting the divergence.
 *   - Deleting a block must leave what pointed at it VISIBLE AND BROKEN rather than vanishing,
 *     because a link is by id and an id survives a soft delete.
 *   - Restoring one must put it back in its pipeline's order, in the place it came from, and must
 *     rebuild its locator if the pipeline was renamed while it was gone.
 *
 * tests/blocks.test.ts covers filing, ordering and the rename's own four rules. This file covers
 * what those rules are FOR: that identity and locator never trade places.
 *
 * ---------------------------------------------------------------------------------------
 * THREE THINGS THIS FILE MEASURED AND CLOSED
 * ---------------------------------------------------------------------------------------
 *
 *   1. `POST /api/records/<block>/restore` undeleted the row and stopped. The block came back live,
 *      in no pipeline's order, carrying a title qualified by whatever the pipeline used to be
 *      called — invisible on every page and refused by its own edit route. `restoreBlock` in
 *      server/lib/blocks.ts is what closes it.
 *   2. Renaming one block to a sibling's name reached the UNIQUE index and came back as
 *      `SqliteError: UNIQUE constraint failed`, a 500 carrying a database sentence. Adding a second
 *      block with that name had always been refused properly; renaming into it had not.
 *   3. A soft-deleted module was printed as its own nanoid where a module title belongs — "1 module
 *      carries this step: ydDW3qsG8gYj". A fabricated name, on three blocks at once.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import { blockIdsOf, readPipelineBlocks, unloadedModuleName, type BlockLinkRow } from '../src/shared/blocks.ts'

let t: TestDb
/** The project this case files into, made fresh so no case meets another's titles or blocks. */
let PROJECT = 'default'
let caseNumber = 0
let makeWorkspace: (input: { id: string; title: string }) => unknown

beforeAll(async () => {
  t = await freshDb()
  ;({ createWorkspace: makeWorkspace } = await import('../src/server/lib/workspaces.ts'))
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  PROJECT = `block-identity-case-${String(caseNumber)}`
  makeWorkspace({ id: PROJECT, title: `Block identity case ${String(caseNumber)}` })
})

const AGENT = { type: 'agent', id: 'claude-code' } as const

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: PROJECT, kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}

/** File a block into a pipeline and hand back its record. */
function block(pipelineId: string, name: string, state = 'todo') {
  return t.blocks.addBlock(pipelineId, { name, state: state as 'todo' }, t.api.HUMAN).block
}

function module_(title: string) {
  return t.api.createRecord({ workspaceId: PROJECT, kind: 'module', title, actor: t.api.HUMAN })
}

function link(fromId: string, toId: string, type: 'implements' | 'blocks' | 'measures', gate?: { kind: 'hard' | 'partial'; upTo?: string }) {
  return t.api.createLink({ fromId, toId, type, ...(gate === undefined ? {} : { gate }), actor: t.api.HUMAN })
}

/** The pipeline record as it stands now. Every test that checks an order re-reads it. */
const live = (id: string) => {
  const record = t.api.getRecord(id)
  if (record === null) throw new Error(`no record ${id}`)
  return record
}

const orderOf = (pipelineId: string) => blockIdsOf(live(pipelineId))

/**
 * Every stored link, in the shape `readPipelineBlocks` takes.
 *
 * Built from `resolveLinks` rather than from `allLinks`, because `allLinks` deliberately drops the
 * gate — the attention rule asks WHETHER something blocks, not how hard — and half these tests are
 * about a gate surviving something.
 */
function blockLinkRows(): BlockLinkRow[] {
  const rows = new Map<string, BlockLinkRow>()
  for (const record of t.api.listRecords({ workspaceId: PROJECT, includeDeleted: true })) {
    for (const l of t.api.resolveLinks(record.id)) {
      rows.set(l.linkId, {
        id: l.linkId,
        fromId: l.isBacklink ? l.other.id : record.id,
        toId: l.isBacklink ? record.id : l.other.id,
        type: l.type,
        gate: l.gate?.kind ?? null,
        upTo: l.gate?.upTo ?? null,
        inferred: l.inferred,
      })
    }
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Read one pipeline the way every page reads it: its record, the records loaded, and the links. */
function reading(pipelineId: string, opts: { includeDeleted?: boolean } = {}) {
  return readPipelineBlocks(
    live(pipelineId),
    t.api.listRecords({ workspaceId: PROJECT, includeDeleted: opts.includeDeleted === true }),
    blockLinkRows(),
  )
}

const titleOf = (id: string) => t.api.getRecord(id)?.title

// ============================================================ renaming the pipeline

describe('renaming a pipeline moves every locator and no identity', () => {
  /** A pipeline with three blocks, a module carrying one, a dependency, and a problem attached. */
  function scene() {
    const p = pipeline('Transplant v2')
    const sense = block(p.id, 'Sense the pot', 'done')
    const plan = block(p.id, 'Plan the approach', 'doing')
    const hold = block(p.id, 'Close and hold', 'blocked')
    const gripper = module_('Tray clamp')
    const problem = t.api.createRecord({ workspaceId: PROJECT, kind: 'problem', title: 'The gel lags the pull', data: { state: 'open' }, actor: t.api.HUMAN })
    link(gripper.id, hold.id, 'implements')
    link(sense.id, plan.id, 'blocks', { kind: 'partial', upTo: 'the dry run' })
    link(problem.id, hold.id, 'blocks', { kind: 'hard' })
    return { p, blocks: [sense, plan, hold], gripper, problem }
  }

  it('changes no block id, and does not touch one link', () => {
    const { p, blocks } = scene()
    const idsBefore = orderOf(p.id)
    const linksBefore = blockLinkRows()

    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    // THE IDENTITY IS UNMOVED. Every id in the order is the same id, in the same place, and every
    // block still answers to it.
    expect(orderOf(p.id)).toEqual(idsBefore)
    for (const b of blocks) expect(t.api.getRecord(b.id)?.id).toBe(b.id)

    // AND SO IS EVERY LINK — same row ids, same ends, same types, same gates. This is the half that
    // makes the rename safe to do at all: a link points at an id, so a locator moving under it
    // costs nothing. Deep equality, not a count: a rename that rewrote a link's ends to keep up
    // would leave the count identical and the archive wrong.
    expect(blockLinkRows()).toEqual(linksBefore)
  })

  it('leaves the block titles and the pipeline’s own order alone', () => {
    // THIS TEST SAID "rewrites only the locators" UNTIL 6 SEPTEMBER 2026. A block's title carried
    // its pipeline's, so a rename rewrote every one of them. A decision reversed that:
    // a rename is one record changing and no others.
    const { p, blocks } = scene()
    const orderRowsBefore = t.api.listChanges({ workspaceId: PROJECT, recordId: p.id }).filter((row) => row.field === 'data.blockIds').length

    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    for (const b of blocks) expect(titleOf(b.id)).toBe(b.title)
    // A rename is not an order change. If it wrote the order too, "what happened to this pipeline"
    // would report a reordering that never happened.
    const orderRowsAfter = t.api.listChanges({ workspaceId: PROJECT, recordId: p.id }).filter((row) => row.field === 'data.blockIds').length
    expect(orderRowsAfter).toBe(orderRowsBefore)
  })

  it('cannot collide, because it touches nothing but the pipeline', () => {
    // THE COLLISION THIS TEST WAS ABOUT NO LONGER EXISTS. A rename could refuse because one of the
    // block titles it was about to write was taken; nothing is written to a block now, so a record
    // called anything at all cannot stop a pipeline being renamed.
    const { p, blocks } = scene()
    const idsBefore = orderOf(p.id)
    const linksBefore = blockLinkRows()
    t.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'Plan the approach', actor: t.api.HUMAN })

    t.api.patchRecord(p.id, { title: 'Handover v3' }, AGENT)

    expect(titleOf(p.id)).toBe('Handover v3')
    for (const b of blocks) expect(titleOf(b.id)).toBe(b.title)
    expect(orderOf(p.id)).toEqual(idsBefore)
    expect(blockLinkRows()).toEqual(linksBefore)
  })

  it('keeps every block addressable by the name it always had', () => {
    const { p } = scene()
    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    // The name is what an agent types to attach something without looking up an id, and renaming
    // the pipeline no longer moves it.
    expect(t.api.getRecordByTitle('Close and hold', PROJECT)).not.toBeNull()
    expect(t.api.getRecordByTitle('Handover v3 › Close and hold', PROJECT)).toBeNull()
  })
})

// ============================================================ renaming a module

describe('renaming a module cannot break the mapping, because the mapping is by id', () => {
  it('follows the rename on nine blocks across two pipelines, with nothing to keep in step', () => {
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const gripper = module_('Tray clamp')
    const carried = [
      ...['s1', 's2', 's3', 's4', 's5'].map((n) => block(a.id, n)),
      ...['r1', 'r2', 'r3', 'r4'].map((n) => block(b.id, n)),
    ]
    for (const c of carried) link(gripper.id, c.id, 'implements')
    const linksBefore = blockLinkRows()

    // THE RENAME THAT USED TO BREAK TEN MAPPINGS BEHIND A 200.
    t.api.patchRecord(gripper.id, { title: '夹具标定' }, t.api.HUMAN)

    // All nine still name it, by id, and the id did not move.
    for (const view of [...reading(a.id).blocks, ...reading(b.id).blocks]) {
      expect(view.moduleIds).toEqual([gripper.id])
      // And the TITLE they print is the new one, because it is looked up rather than stored.
      expect(view.modules).toEqual(['夹具标定'])
    }
    // Not one link row moved. There is only one statement of this fact now, so there is nothing
    // that could have failed to follow.
    expect(blockLinkRows()).toEqual(linksBefore)
  })

  it('refuses to store a module title on a block at all, so a second copy cannot exist', () => {
    // THIS IS THE STRUCTURAL HALF, and it is the one that makes the drift impossible rather than
    // merely absent. `modules: ["Tray clamp"]` on a step was the second statement of the fact the
    // `implements` link already carried. A block record does not declare that field, so the write
    // path refuses it and there is nowhere for a stale title to live.
    const p = pipeline('Transplant v2')
    const b = block(p.id, 'Sense the pot')
    expect(() => t.api.patchRecord(b.id, { dataPatch: { modules: ['Tray clamp'] } }, t.api.HUMAN)).toThrow(/modules/)
    expect(() => t.api.patchRecord(b.id, { dataPatch: { needs: [{ stepId: 'x' }] } }, t.api.HUMAN)).toThrow(/needs/)
  })

  it('leaves no block anywhere holding the module’s old title as text', () => {
    const p = pipeline('Transplant v2')
    const gripper = module_('Tray clamp')
    const blocks = ['a', 'b', 'c'].map((n) => block(p.id, n))
    for (const b of blocks) link(gripper.id, b.id, 'implements')

    t.api.patchRecord(gripper.id, { title: 'Tray clamp mk2' }, t.api.HUMAN)

    // The whole corpus, not the three blocks: a stale copy anywhere is the defect, and searching
    // for the old string is the only way to prove there is none.
    const stored = t.api
      .listRecords({ workspaceId: PROJECT, kind: 'block', includeDeleted: true })
      .map((record) => JSON.stringify(record.data))
    expect(stored.filter((json) => json.includes('Tray clamp'))).toEqual([])
  })
})

// ============================================================ deleting a block

describe('deleting a block leaves what pointed at it visible and broken', () => {
  function scene() {
    const p = pipeline('Transplant v2')
    const first = block(p.id, 'Sense the pot', 'done')
    const doomed = block(p.id, 'Plan the approach', 'failed')
    const last = block(p.id, 'Close and hold', 'blocked')
    const gripper = module_('Tray clamp')
    const problem = t.api.createRecord({ workspaceId: PROJECT, kind: 'problem', title: 'The CaP IK lands 4 mm out', data: { state: 'open' }, actor: t.api.HUMAN })
    link(gripper.id, doomed.id, 'implements')
    link(problem.id, doomed.id, 'blocks', { kind: 'hard' })
    link(doomed.id, last.id, 'blocks', { kind: 'partial', upTo: 'the dry run' })
    return { p, first, doomed, last, gripper, problem }
  }

  it('takes it out of the order and marks the row, in one call', () => {
    const { p, first, doomed, last } = scene()
    const result = t.blocks.removeBlock(p.id, doomed.id, t.api.HUMAN)

    // It says where it was, so the caller holds the one number a restore needs.
    expect(result.at).toBe(1)
    expect(orderOf(p.id)).toEqual([first.id, last.id])
    expect(t.api.getRecord(doomed.id)?.deletedAt).not.toBeNull()
    // NO HOLE. The order does not name a row that is gone, so nothing has to be repaired by hand,
    // and the reading has nothing to report.
    const after = reading(p.id)
    expect(after.problems).toEqual([])
    expect(after.blocks.map((view) => view.id)).toEqual([first.id, last.id])
  })

  it('keeps the problem and the module pointing at it, marked broken, with the title readable', () => {
    const { p, doomed, gripper, problem } = scene()
    const linksBefore = blockLinkRows()
    t.blocks.removeBlock(p.id, doomed.id, t.api.HUMAN)

    // NOT ONE LINK ROW WAS DELETED. A dependency somebody recorded is a fact about the archive even
    // after the thing it pointed at is gone — and it survives because it points at an ID, which a
    // soft delete does not take away.
    expect(blockLinkRows()).toEqual(linksBefore)

    const fromTheProblem = one(t.api.resolveLinks(problem.id), 'the problem’s one link')
    expect(fromTheProblem.broken).toBe(true)
    expect(fromTheProblem.other.title).toBe('Plan the approach')
    expect(fromTheProblem.gate).toEqual({ kind: 'hard' })

    const fromTheModule = one(t.api.resolveLinks(gripper.id), 'the module’s one link')
    expect(fromTheModule.broken).toBe(true)
    expect(fromTheModule.other.title).toBe('Plan the approach')
  })

  it('keeps the block’s own history, which is the reason it was made a record', () => {
    const { p, doomed } = scene()
    t.blocks.patchBlock(p.id, doomed.id, { measured: 'the gel lags the pull by 180 ms' }, t.api.HUMAN)
    t.blocks.removeBlock(p.id, doomed.id, t.api.HUMAN)

    const fields = t.api.listChanges({ workspaceId: PROJECT, recordId: doomed.id }).map((row) => row.field)
    expect(fields).toContain('data.measured')
    expect(t.api.listChanges({ workspaceId: PROJECT, recordId: doomed.id }).some((row) => row.op === 'delete')).toBe(true)
  })

  it('leaves the block that waited on it waiting on something broken, not on nothing', () => {
    const { p, doomed, last } = scene()
    t.blocks.removeBlock(p.id, doomed.id, t.api.HUMAN)

    // The dependency is still recorded. `readPipelineBlocks` only folds in waits from blocks THIS
    // pipeline still lists, so the wait is no longer an internal edge — but the link is there and
    // the record page says so, which is the difference between "it waits on something that is gone"
    // and "it waits on nothing".
    const waiting = one(
      t.api.resolveLinks(last.id).filter((l) => l.isBacklink && l.type === 'blocks'),
      'a blocks link into the last block',
    )
    expect(waiting.broken).toBe(true)
    expect(waiting.gate).toEqual({ kind: 'partial', upTo: 'the dry run' })
    expect(reading(p.id).blocks.find((view) => view.id === last.id)?.needs).toEqual([])
  })
})

// ============================================================ restoring a block

describe('restoring a deleted block puts it back where it was', () => {
  function four() {
    const p = pipeline('Transplant v2')
    const ids = ['A', 'B', 'C', 'D'].map((n) => block(p.id, n))
    return { p, ids }
  }

  it('goes back between the neighbours it had, even after another block was added', () => {
    const { p, ids } = four()
    const [a, b, c, d] = ids as [typeof ids[0], typeof ids[0], typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    const e = block(p.id, 'E')
    expect(orderOf(p.id)).toEqual([a.id, c.id, d.id, e.id])

    const back = t.blocks.restoreBlock(p.id, b.id, {}, t.api.HUMAN)

    expect(back.at).toBe(1)
    expect(orderOf(p.id)).toEqual([a.id, b.id, c.id, d.id, e.id])
    expect(t.api.getRecord(b.id)?.deletedAt).toBeNull()
    // Same id, same title, same links: a restore is not a new block.
    expect(back.block.id).toBe(b.id)
    expect(back.block.title).toBe('B')
  })

  it('goes back to the front when it was the first block', () => {
    const { p, ids } = four()
    const [a, b] = ids as [typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, a.id, t.api.HUMAN)
    expect(orderOf(p.id)[0]).toBe(b.id)

    const back = t.blocks.restoreBlock(p.id, a.id, {}, t.api.HUMAN)
    expect(back.at).toBe(0)
    expect(orderOf(p.id)).toEqual(ids.map((r) => r.id))
  })

  it('goes back after the last neighbour that is still there', () => {
    // A, B, C, D. B goes, then A goes. B's neighbour A is gone, so nothing before it survives and
    // it goes first — which is the only answer left and is the right one.
    const { p, ids } = four()
    const [a, b, c, d] = ids as [typeof ids[0], typeof ids[0], typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    t.blocks.removeBlock(p.id, a.id, t.api.HUMAN)
    expect(orderOf(p.id)).toEqual([c.id, d.id])

    expect(t.blocks.restoreBlock(p.id, b.id, {}, t.api.HUMAN).at).toBe(0)
    expect(orderOf(p.id)).toEqual([b.id, c.id, d.id])
  })

  it('comes back under its own name when the pipeline was renamed while it was away', () => {
    // THIS TEST SAID THE OPPOSITE UNTIL 6 SEPTEMBER 2026: a block's title carried its pipeline's,
    // so a pipeline renamed while a block was deleted left that block to be requalified on the way
    // back. A decision reversed that. A block's title is its own name, a pipeline
    // rename moves nothing, and a restore therefore has nothing to rebuild.
    const { p, ids } = four()
    const [, b] = ids as [typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)
    expect(titleOf(b.id)).toBe('B')

    const back = t.blocks.restoreBlock(p.id, b.id, {}, AGENT)

    expect(back.block.title).toBe('B')
    // AND NO TITLE CHANGE ROW AT ALL, on the block or on its siblings: nothing about their names
    // moved, so a ledger row saying one did would be a write nobody made.
    expect(
      t.api.listChanges({ workspaceId: PROJECT, recordId: b.id }).filter((change) => change.field === 'title'),
    ).toEqual([])
    // And it is still addressable by the name it has always had.
    expect(t.api.getRecordByTitle('B', PROJECT)?.id).toBe(b.id)
  })

  it('refuses, and writes nothing, when a sibling took its name while it was away', () => {
    // THE NAME IS TAKEN BY A BLOCK OF THIS PIPELINE, and that is now the whole of the rule. It used
    // to be any live record in the project, which was affordable only while every block title
    // carried its pipeline's; a note called "B" is not a step of this pipeline and no longer stops
    // one coming back.
    const { p, ids } = four()
    const [a, b] = ids as [typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    const note = t.api.createRecord({ workspaceId: PROJECT, kind: 'note', title: 'B', actor: t.api.HUMAN })
    const squatter = block(p.id, 'B')

    expect(() => t.blocks.restoreBlock(p.id, b.id, {}, t.api.HUMAN)).toThrow(/already has a live block called/)

    // NOTHING HALF-APPLIED: still deleted, still out of the order, still holding its own name.
    expect(t.api.getRecord(b.id)?.deletedAt).not.toBeNull()
    expect(orderOf(p.id)).not.toContain(b.id)
    expect(titleOf(b.id)).toBe('B')
    expect(titleOf(squatter.id)).toBe('B')
    expect(titleOf(note.id)).toBe('B')
    expect(orderOf(p.id)[0]).toBe(a.id)
  })

  it('refuses a block this pipeline never held, so a restore cannot move a block', () => {
    // Restoring is not a way of filing a block somewhere new. Membership is proved from this
    // pipeline's own order history, not from the block's title — otherwise deleting a block and
    // restoring it elsewhere would be a move that no route offers and nothing reviewed.
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const stray = block(a.id, 'Sense the pot')
    t.blocks.removeBlock(a.id, stray.id, t.api.HUMAN)

    expect(() => t.blocks.restoreBlock(b.id, stray.id, {}, t.api.HUMAN)).toThrow(/never shows it holding/)
    expect(orderOf(b.id)).toEqual([])
    expect(t.api.getRecord(stray.id)?.deletedAt).not.toBeNull()
  })

  it('asks rather than picks when its history does not settle where it goes', () => {
    const { p, ids } = four()
    const [a, b, c] = ids as [typeof ids[0], typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    // Put it back somewhere else on purpose, then take it out again. Two removals, two answers.
    t.blocks.restoreBlock(p.id, b.id, { at: 3 }, t.api.HUMAN)
    expect(orderOf(p.id)[3]).toBe(b.id)
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)

    expect(() => t.blocks.restoreBlock(p.id, b.id, {}, t.api.HUMAN)).toThrow(/does not settle where it goes/)
    // The caller is told the candidates and can choose one.
    const chosen = t.blocks.restoreBlock(p.id, b.id, { at: 1 }, t.api.HUMAN)
    expect(chosen.at).toBe(1)
    expect(orderOf(p.id)).toEqual([a.id, b.id, c.id, ids[3]?.id])
  })

  it('refuses a position past the end rather than clamping it', () => {
    const { p, ids } = four()
    const [, b] = ids as [typeof ids[0], typeof ids[0]]
    t.blocks.removeBlock(p.id, b.id, t.api.HUMAN)
    expect(() => t.blocks.restoreBlock(p.id, b.id, { at: 9 }, t.api.HUMAN)).toThrow(/from 0 to 3/)
    expect(orderOf(p.id)).not.toContain(b.id)
  })

  it('refuses a block that is already there, rather than listing it twice', () => {
    const { p, ids } = four()
    const [a] = ids as [typeof ids[0]]
    expect(() => t.blocks.restoreBlock(p.id, a.id, {}, t.api.HUMAN)).toThrow(/nothing to restore/)
    expect(orderOf(p.id).filter((id) => id === a.id)).toHaveLength(1)
  })

  it('brings back everything that pointed at it, unbroken again', () => {
    const p = pipeline('Transplant v2')
    const first = block(p.id, 'A')
    const doomed = block(p.id, 'B')
    const problem = t.api.createRecord({ workspaceId: PROJECT, kind: 'problem', title: 'The gel lags', data: { state: 'open' }, actor: t.api.HUMAN })
    link(problem.id, doomed.id, 'blocks', { kind: 'hard' })
    const linksBefore = blockLinkRows()

    t.blocks.removeBlock(p.id, doomed.id, t.api.HUMAN)
    t.blocks.restoreBlock(p.id, doomed.id, {}, t.api.HUMAN)

    expect(blockLinkRows()).toEqual(linksBefore)
    const attached = one(t.api.resolveLinks(problem.id), 'the problem’s one link')
    expect(attached.broken).toBe(false)
    expect(attached.other.id).toBe(doomed.id)
    expect(orderOf(p.id)).toEqual([first.id, doomed.id])
  })
})

// ============================================================ many to many

describe('one module carries many blocks, one block is carried by many, and some by nobody', () => {
  it('counts both directions off the links, with no list of titles anywhere', () => {
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const gripper = module_('Tray clamp')
    const zed = module_('ZED depth')
    const sense = block(a.id, 'Sense the pot')
    const plan = block(a.id, 'Plan the approach')
    const reach = block(b.id, 'Reach for it')
    const alone = block(a.id, 'Write it up')

    // ONE MODULE, THREE BLOCKS, ACROSS TWO PIPELINES.
    for (const id of [sense.id, plan.id, reach.id]) link(gripper.id, id, 'implements')
    // ONE BLOCK, TWO MODULES. A step is not a module, and one step can be carried by several.
    link(zed.id, sense.id, 'implements')

    const inA = reading(a.id).blocks
    const inB = reading(b.id).blocks
    const byId = new Map([...inA, ...inB].map((view) => [view.id, view]))

    expect(byId.get(sense.id)?.moduleIds.sort()).toEqual([gripper.id, zed.id].sort())
    expect(byId.get(sense.id)?.modules.sort()).toEqual(['Tray clamp', 'ZED depth'])
    expect(byId.get(reach.id)?.moduleIds).toEqual([gripper.id])

    // The other direction, asked of the links rather than of any stored list.
    const carried = t.api
      .resolveLinks(gripper.id)
      .filter((l) => l.type === 'implements')
      .map((l) => l.other.id)
      .sort()
    expect(carried).toEqual([sense.id, plan.id, reach.id].sort())

    // A BLOCK CARRIED BY NOBODY IS A REAL ANSWER, not a gap and not an error. `[]` here means no
    // module is RECORDED as carrying it, which is the sentence the pipeline page prints.
    expect(byId.get(alone.id)?.modules).toEqual([])
    expect(byId.get(alone.id)?.moduleIds).toEqual([])
    // And it is a different thing from a block that could not be read at all, which is reported.
    expect(reading(a.id).problems).toEqual([])
  })

  it('does not fold a module’s carrying into the wrong pipeline', () => {
    // The reader filters the links itself, so a module carrying blocks in two pipelines cannot
    // leak one pipeline's blocks into the other's reading.
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const gripper = module_('Tray clamp')
    const here = block(a.id, 'Sense the pot')
    const there = block(b.id, 'Reach for it')
    link(gripper.id, here.id, 'implements')
    link(gripper.id, there.id, 'implements')

    expect(reading(a.id).blocks.map((view) => view.id)).toEqual([here.id])
    expect(reading(b.id).blocks.map((view) => view.id)).toEqual([there.id])
  })
})

// ============================================================ what happened when I attacked it

describe('the attacks, and what they answered', () => {
  it('will not let two blocks of one pipeline share a title, from either direction', () => {
    const p = pipeline('Transplant v2')
    block(p.id, 'Close and hold')
    const other = block(p.id, 'Sense the pot')

    // ADDING a second one is refused. Until 17 August 2026 that happened by accident: `addBlock`
    // never asked, and `createRecord` refused EVERY repeated title. That refusal is gone — titles
    // may repeat — so `addBlock` asks the block question itself now, and this is what proves it.
    expect(() => t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)).toThrow(
      /already has a live block called/,
    )

    // RENAMING one into it used to reach the UNIQUE index and come back as
    // `SqliteError: UNIQUE constraint failed: records.workspace_id, records.title` — a 500 carrying
    // a database sentence on a request that is just asking for a name that is taken.
    const err = (() => {
      try {
        t.blocks.patchBlock(p.id, other.id, { name: 'Close and hold' }, t.api.HUMAN)
        return null
      } catch (e) {
        return e as Error
      }
    })()
    expect(err).toBeInstanceOf(t.api.PanelError)
    expect(err?.message).toContain('already has a live block called')
    expect(err?.message).toContain('"Close and hold"')
    expect(titleOf(other.id)).toBe('Sense the pot')
  })

  /**
   * THIS TEST PINNED THE OPPOSITE RULE UNTIL 17 AUGUST 2026, and the owner is who changed it.
   *
   * It was called "will not let a block take a title a DELETED record still holds", and it was true:
   * a soft-deleted record kept its name for ever and nothing else could take it. That is the exact
   * shape of the defect the owner met — they deleted something, wrote it again, and Mole Office said the
   * name was taken — so it is now allowed, and this test pins the allowing.
   */
  it('lets a block take a name only a DELETED block of its pipeline holds', () => {
    const p = pipeline('Transplant v2')
    const b = block(p.id, 'Sense the pot')
    const gone = block(p.id, 'Close and hold')
    t.blocks.removeBlock(p.id, gone.id, t.api.HUMAN)

    t.blocks.patchBlock(p.id, b.id, { name: 'Close and hold' }, t.api.HUMAN)

    expect(titleOf(b.id)).toBe('Close and hold')
    // And the deleted record is untouched: it keeps the name it was deleted under.
    expect(titleOf(gone.id)).toBe('Close and hold')
  })

  /**
   * THIS TEST PINNED THE OPPOSITE RULE UNTIL 17 AUGUST 2026, and the owner is who changed it.
   *
   * It was called "refuses to rename a pipeline onto another pipeline's name before any block is
   * touched". A pipeline's title is one somebody typed, so it is presentation like any other, and
   * two pipelines may now be called the same thing. What is still refused is a BLOCK title landing
   * on one a live record holds, and the second half of this test is that.
   */
  it('lets a pipeline take another pipeline’s name, and every block keeps its own', () => {
    const a = pipeline('Transplant v2')
    const b = pipeline('Handover v3')
    const blocks = ['A', 'B'].map((n) => block(a.id, n))

    t.api.patchRecord(a.id, { title: 'Handover v3' }, t.api.HUMAN)

    expect(titleOf(a.id)).toBe('Handover v3')
    expect(titleOf(b.id)).toBe('Handover v3')
    // No block moved. A block's title is its own name.
    for (const block_ of blocks) expect(titleOf(block_.id)).toBe(block_.title)

    // AND THE SECOND PIPELINE MAY HAVE A STEP CALLED "A" TOO, which is the half that changed: the
    // rule is about two live blocks of ONE pipeline, and these are in two.
    const alsoA = t.blocks.addBlock(b.id, { name: 'A', state: 'todo' }, t.api.HUMAN).block
    expect(alsoA.title).toBe('A')
    expect(() => t.blocks.addBlock(b.id, { name: 'A', state: 'todo' }, t.api.HUMAN)).toThrow(
      /already has a live block called/,
    )
  })

  it('deleting a module that carries three blocks costs the blocks nothing', () => {
    const p = pipeline('Transplant v2')
    const gripper = module_('Tray clamp')
    const carried = ['A', 'B', 'C'].map((n) => block(p.id, n))
    for (const c of carried) link(gripper.id, c.id, 'implements')

    t.api.deleteRecord(gripper.id, t.api.HUMAN)

    // The pipeline is untouched: same order, same blocks, no problem to report.
    expect(orderOf(p.id)).toEqual(carried.map((c) => c.id))
    expect(reading(p.id).problems).toEqual([])
    // Every link is still there, still naming the module by id, and marked broken at the block end.
    for (const c of carried) {
      const l = one(t.api.resolveLinks(c.id), 'the one link on the block')
      expect(l.broken).toBe(true)
      expect(l.other.title).toBe('Tray clamp')
      expect(l.other.id).toBe(gripper.id)
    }
    // Read with the deleted record loaded, the module is NOT listed as carrying the block.
    //
    // THIS ASSERTION CHANGED ON 25 AUGUST 2026 AND IT USED TO READ `toEqual(['Tray clamp'])`. The
    // reason is `carriesBlock` in src/shared/blocks.ts, which is now the one statement of what "a
    // module carries this block" means and holds a live-module half: a module the caller loaded and
    // that has been soft-deleted carries nothing, so it is not in the carrier list. A module the
    // caller did NOT load is unknown rather than deleted, and the test below is that case and is
    // unchanged. Nothing is lost by this: the `implements` link is still there, still names the
    // module by id, and is still reported broken — which the three assertions above are about.
    for (const view of reading(p.id, { includeDeleted: true }).blocks) {
      expect(view.modules).toEqual([])
      expect(view.carriers).toEqual([])
    }
  })

  it('says the module was not loaded rather than printing its id as a name', () => {
    // MEASURED BEFORE THIS WAS CLOSED: with only live records loaded — which is what the pipeline
    // page passes — all three blocks reported `modules: ["ydDW3qsG8gYj"]`, so the drawing headed a
    // lane with a nanoid and the card said "1 module carries this step: ydDW3qsG8gYj". A name
    // nobody gave it.
    const p = pipeline('Transplant v2')
    const gripper = module_('Tray clamp')
    const carried = ['A', 'B', 'C'].map((n) => block(p.id, n))
    for (const c of carried) link(gripper.id, c.id, 'implements')
    t.api.deleteRecord(gripper.id, t.api.HUMAN)

    for (const view of reading(p.id).blocks) {
      expect(view.modules).toEqual([unloadedModuleName(gripper.id)])
      // The identity is untouched either way — that is the half that was always right.
      expect(view.moduleIds).toEqual([gripper.id])
      // And the phrase is a sentence, not an id pretending to be a title.
      expect(view.modules[0]).toContain('was not loaded')
    }
  })
})
