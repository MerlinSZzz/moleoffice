// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE BLOCK IS A RECORD, AND THIS IS WHAT THAT BOUGHT AND WHAT IT COST.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS TRUE BEFORE, MEASURED ON THE REAL DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * A step was an object nested inside `pipeline.data.steps[]`. `links.from_id` and `links.to_id` are
 * foreign keys to `records.id`, so nothing could point at one. Four things followed, and each one is
 * a test in this file or in tests/block-attachments.test.ts:
 *
 *   - `POST /api/links` with a step id came back 404 and the whole pipeline had to stand in for the
 *     one step that was wrong.
 *   - Two steps could share one id. The write path accepted it with a 201, and the attention API
 *     then served two rows carrying one key.
 *   - A step named its modules by TITLE while a parallel `implements` link named the same modules
 *     by id. One accepted module rename broke ten mappings behind a 200 and nothing reported it.
 *   - A step had no history of its own: one edit wrote one change row holding the whole array.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE COST, WHICH IS THE HALF WORTH TESTING HARDEST
 * ---------------------------------------------------------------------------------------
 *
 * A block's title is `<its pipeline's title> › <its own name>`, so that block names need not be
 * unique across the workspace while every block stays linkable by typing its name. That means
 * RENAMING A PIPELINE REWRITES ITS BLOCKS' TITLES — one write silently changing records the request
 * never named, which is exactly the class of defect this codebase keeps finding. It is accepted
 * with eyes open and it is built to four rules, all of them below: one transaction, one attributed
 * change row per rewritten title, a refusal rather than a half-application on a collision, and
 * nothing at all changed when it refuses.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import { BLOCK_TITLE_SEPARATOR, blockIdsOf, titleOptions } from '../src/shared/blocks.ts'

let t: TestDb
/** Each case works in its own project, so the counts and title lists it takes see only its own rows. */
let HERE = 'default'
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  HERE = `blocks-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: HERE, title: `Blocks case ${String(caseNumber)}` })
})

/** A pipeline with no blocks yet, which is what `POST /api/records {"kind":"pipeline"}` makes. */
function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: HERE, kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}

const AGENT = { type: 'agent', id: 'claude-code' } as const

// ============================================================ filing a block

describe('a block is filed through its pipeline, and only through it', () => {
  it('refuses a bare create, and the refusal is the route that works', () => {
    // THE ONE KIND THAT CANNOT BE FILED ON ITS OWN, and refused rather than given a default
    // pipeline: there is no default pipeline, and picking one would invent a fact about the work.
    const err = (() => {
      try {
        t.api.createRecord({ workspaceId: HERE, kind: 'block', title: 'Close and hold', actor: t.api.HUMAN })
        return null
      } catch (e) {
        return e as Error
      }
    })()
    expect(err).not.toBeNull()
    expect(err?.message).toContain('POST /api/records/<pipeline id>/blocks')
    expect(err?.message).toContain('"name":"Close and hold"')
    // Nothing was stored on the way to the refusal.
    expect(t.api.listRecords({ workspaceId: HERE, kind: 'block' })).toHaveLength(0)
  })

  it('builds the title from the pipeline, and appends the id to the order in one write', () => {
    const p = pipeline('Transplant v2')
    const first = t.blocks.addBlock(p.id, { name: 'Sense the pot', state: 'done' }, t.api.HUMAN)
    const second = t.blocks.addBlock(p.id, { name: 'Plan the approach', state: 'blocked' }, t.api.HUMAN)

    expect(first.block.title).toBe('Sense the pot')
    expect(blockIdsOf(second.pipeline)).toEqual([first.block.id, second.block.id])
    // The block is a record like any other: it has its own row, its own stamps and its own history.
    expect(t.api.getRecord(first.block.id)?.kind).toBe('block')
    expect(t.api.listChanges({ workspaceId: HERE, recordId: first.block.id }).some((row) => row.op === 'create')).toBe(true)
  })

  it('puts a block where the caller asked, and refuses a position past the end', () => {
    const p = pipeline('Transplant v2')
    const a = t.blocks.addBlock(p.id, { name: 'A', state: 'done' }, t.api.HUMAN)
    const c = t.blocks.addBlock(p.id, { name: 'C', state: 'todo' }, t.api.HUMAN)
    const b = t.blocks.addBlock(p.id, { name: 'B', state: 'todo', at: 1 }, t.api.HUMAN)
    expect(blockIdsOf(b.pipeline)).toEqual([a.block.id, b.block.id, c.block.id])

    // CLAMPING WOULD ANSWER 201 AND FILE IT SOMEWHERE ELSE, which looks exactly like a write that
    // worked. Refusing says which positions there are.
    expect(() => t.blocks.addBlock(p.id, { name: 'D', state: 'todo', at: 9 }, t.api.HUMAN)).toThrow(/from 0 to 3/)
  })

  it('lets two pipelines each have a step with the same name, and they hold the same title', () => {
    // "Plan the approach" is a name two DIFFERENT pipelines are entitled to use, and until 6
    // September 2026 they held it as two different titles because the server put each pipeline's
    // name in front. A decision reversed that: both blocks are called what they are called.
    // Typing the name now names two records, and every lookup that meets two refuses and says both rather than picking
    // one.
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const one_ = t.blocks.addBlock(a.id, { name: 'Plan the approach', state: 'todo' }, t.api.HUMAN)
    const two = t.blocks.addBlock(b.id, { name: 'Plan the approach', state: 'todo' }, t.api.HUMAN)
    expect(one_.block.title).toBe('Plan the approach')
    expect(two.block.title).toBe('Plan the approach')
    expect(one_.block.id).not.toBe(two.block.id)
    expect(t.api.recordsByTitle('Plan the approach', HERE)).toHaveLength(2)
  })

  it('refuses two blocks of ONE pipeline with the same name, rather than storing a duplicate', () => {
    // THE ONE THING THAT SURVIVED THE REVERSAL. Every other kind of record may share a title; two
    // live blocks of one pipeline may not, because a pipeline is READ as an ordered list of their
    // names and two of one name read as the same step twice.
    const p = pipeline('Transplant v2')
    t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)
    expect(() => t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)).toThrow(
      /already has a live block called/,
    )
  })
})

// ============================================================ the order

describe('the order is one statement of membership and position', () => {
  it('refuses a `blockIds` naming something that is not a live block', () => {
    const p = pipeline('Transplant v2')
    const task = t.api.createRecord({ workspaceId: HERE, kind: 'task', title: 'not a block', actor: t.api.HUMAN })
    expect(() => t.api.patchRecord(p.id, { dataPatch: { blockIds: ['nothing'] } }, t.api.HUMAN)).toThrow(
      /no record has that id/,
    )
    expect(() => t.api.patchRecord(p.id, { dataPatch: { blockIds: [task.id] } }, t.api.HUMAN)).toThrow(/not a block/)
  })

  it('refuses the same block twice, which is the duplicate the old model accepted with a 201', () => {
    const p = pipeline('Transplant v2')
    const a = t.blocks.addBlock(p.id, { name: 'A', state: 'todo' }, t.api.HUMAN)
    expect(() => t.api.patchRecord(p.id, { dataPatch: { blockIds: [a.block.id, a.block.id] } }, t.api.HUMAN)).toThrow(
      /twice/,
    )
  })

  it('lets a second pipeline list a block the first one already lists', () => {
    // THIS RULE WAS REVERSED.
    // A block used to belong to exactly one pipeline and this write was refused, with the reason
    // that a block's title carries its pipeline's name. That reason had stopped being true: the
    // retitle in src/server/db/block-identity.ts gave every block its own name. The aim now is a
    // rough set of clusters in the pipeline and the detailed work in the plan, sharing a step.
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const block = t.blocks.addBlock(a.id, { name: 'Sense the pot', state: 'done' }, t.api.HUMAN)

    const second = t.api.patchRecord(b.id, { dataPatch: { blockIds: [block.block.id] } }, t.api.HUMAN)

    // BOTH PIPELINES LIST IT, and the first one was not changed by the second one's write.
    expect(blockIdsOf(second.record)).toEqual([block.block.id])
    const first = t.api.getRecord(a.id)
    expect(first === null ? [] : blockIdsOf(first)).toEqual([block.block.id])
  })

  it('names every pipeline holding a shared block when it refuses to delete it', () => {
    // A REFUSAL THAT NAMED ONE OF TWO would send somebody to take the block out of that pipeline
    // and meet the same refusal again from the other, with no way to see the second coming.
    const a = pipeline('Transplant v2')
    const b = pipeline('Model-to-bench growth check')
    const block = t.blocks.addBlock(a.id, { name: 'Sense the pot', state: 'done' }, t.api.HUMAN)
    t.api.patchRecord(b.id, { dataPatch: { blockIds: [block.block.id] } }, t.api.HUMAN)

    expect(() => t.api.deleteRecord(block.block.id, t.api.HUMAN)).toThrow(/Transplant v2/)
    expect(() => t.api.deleteRecord(block.block.id, t.api.HUMAN)).toThrow(/Model-to-bench growth check/)
  })

  it('applies all three rules on the way IN as well, which is the path that used to answer 201', () => {
    // THE MEASUREMENT. The three rules above were published in `GET /api/kinds/pipeline` and
    // enforced on `PATCH` only. Re-measured against the live server on 2026-08-12: four ids nothing
    // answered to → **201 with `incomplete: []`**; a module's id → 201; another pipeline's block →
    // 201. Only the duplicate was refused, and by a different check.
    //
    // WHAT IT COST. A pipeline filed that way can then never be given a block at all —
    // `POST /api/records/:id/blocks` refuses to append to an order it cannot read — so the 201 was
    // not merely wrong, it was terminal. And the worked example `GET /api/kinds/pipeline` serves is
    // itself one of these, so a caller copying the documentation exactly produced the defect and
    // was told it had worked. The three refusal sentences already existed; nothing called them.
    const held = pipeline('Transplant v2')
    const block = t.blocks.addBlock(held.id, { name: 'Sense the pot', state: 'done' }, t.api.HUMAN)
    const notABlock = t.api.createRecord({
      workspaceId: HERE,
      kind: 'task',
      title: 'a task somebody listed as a block',
      actor: t.api.HUMAN,
    })
    const create = (blockIds: string[]) =>
      t.api.createRecord({
        workspaceId: HERE,
        kind: 'pipeline',
        title: `filed with ${blockIds.join('+')}`,
        data: { blockIds },
        actor: t.api.HUMAN,
      })

    expect(() => create(['nothing-holds-this'])).toThrow(/no record has that id/)
    expect(() => create([notABlock.id])).toThrow(/not a block/)
    expect(() => create([block.block.id, block.block.id])).toThrow(/twice/)
    // A BLOCK ANOTHER PIPELINE HOLDS IS NOT ONE OF THEM ANY MORE. It was the third rule until 6
    // September 2026; the test above this one is what it became.

    // AND NOTHING WAS STORED. A refusal that left the pipeline behind would be the same defect one
    // step later: a record whose order nobody can read, filed under a title that is now taken.
    expect(t.api.listRecords({ workspaceId: HERE, kind: 'pipeline' }).map((r) => r.title)).toEqual([
      'Transplant v2',
    ])

    // The way that works, which the refusal names: an empty order, then the block route.
    const good = create([])
    expect(blockIdsOf(good)).toEqual([])
    const added = t.blocks.addBlock(good.id, { name: 'Plan it', state: 'todo' }, t.api.HUMAN)
    expect(blockIdsOf(added.pipeline)).toEqual([added.block.id])
  })

  it('reorders in one write and one change row, and refuses a list that leaves a block out', () => {
    const p = pipeline('Transplant v2')
    const a = t.blocks.addBlock(p.id, { name: 'A', state: 'done' }, t.api.HUMAN)
    const b = t.blocks.addBlock(p.id, { name: 'B', state: 'todo' }, t.api.HUMAN)
    const before = t.api.listChanges({ workspaceId: HERE, recordId: p.id }).filter((row) => row.field === 'data.blockIds').length

    const after = t.blocks.reorderBlocks(p.id, [b.block.id, a.block.id], t.api.HUMAN)
    expect(blockIdsOf(after.pipeline)).toEqual([b.block.id, a.block.id])
    // ONE CHANGE ROW FOR THE WHOLE REORDER. That is why the order lives on the pipeline rather than
    // as a number on each block: a reorder is one write and cannot half-apply.
    const now = t.api.listChanges({ workspaceId: HERE, recordId: p.id }).filter((row) => row.field === 'data.blockIds')
    expect(now.length - before).toBe(1)

    // A caller that has not seen a block somebody added a minute ago would otherwise remove it by
    // saying nothing about it, and be answered 200.
    expect(() => t.blocks.reorderBlocks(p.id, [a.block.id], t.api.HUMAN)).toThrow(/leaves out 1/)
  })

  it('takes a block out of the order and deletes it in one call, and refuses a bare delete', () => {
    const p = pipeline('Transplant v2')
    const a = t.blocks.addBlock(p.id, { name: 'A', state: 'done' }, t.api.HUMAN)

    // Deleting the record on its own would leave the order naming a row that is gone — a hole a
    // person then repairs by hand.
    expect(() => t.api.deleteRecord(a.block.id, t.api.HUMAN)).toThrow(/DELETE \/api\/records\/.+\/blocks\//)

    const after = t.blocks.removeBlock(p.id, a.block.id, t.api.HUMAN)
    expect(blockIdsOf(after.pipeline)).toEqual([])
    expect(t.api.getRecord(a.block.id)?.deletedAt).not.toBeNull()
  })
})

// ============================================================ the rename

describe('renaming a pipeline rewrites its blocks’ titles', () => {
  /** A pipeline with three blocks, which is what the rename has to move together. */
  function withBlocks(title: string) {
    const p = pipeline(title)
    const blocks = ['Sense the pot', 'Plan the approach', 'Close and hold'].map(
      (name) => t.blocks.addBlock(p.id, { name, state: 'todo' }, t.api.HUMAN).block,
    )
    return { p, blocks }
  }

  it('leaves every one of them exactly as it was, because a block is called by its own name', () => {
    // THIS TEST SAID THE OPPOSITE UNTIL 6 SEPTEMBER 2026. A pipeline rename used to rewrite every
    // one of its blocks' titles, because a block's title carried its pipeline's. That was reversed,
    // so a rename is now one record changing and no others.
    const { p, blocks } = withBlocks('Transplant v2')
    const before = blocks.map((block) => t.api.getRecord(block.id)?.title)
    const result = t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    expect(result.record.title).toBe('Handover v3')
    expect(before).toEqual(['Sense the pot', 'Plan the approach', 'Close and hold'])
    expect(blocks.map((block) => t.api.getRecord(block.id)?.title)).toEqual(before)
  })

  it('writes no change row on any block, because no block title moved', () => {
    // THE OTHER HALF OF THE SAME REVERSAL. A pipeline rename used to write an attributed title
    // change row on every block it dragged along; there is nothing to attribute now, and a row
    // saying a title moved when none did would be a write nobody made.
    const { p, blocks } = withBlocks('Transplant v2')
    t.api.patchRecord(p.id, { title: 'Handover v3' }, AGENT)

    for (const block of blocks) {
      expect(
        t.api.listChanges({ workspaceId: HERE, recordId: block.id }).filter((change) => change.field === 'title'),
      ).toEqual([])
    }
  })

  it('REFUSES on a collision, names it, and leaves the pipeline and every block untouched', () => {
    // THIS TEST USED TO BE ABOUT A COLLISION and there is no longer one to have. A rename could
    // refuse because it rewrote every block title with the pipeline's, and one of those new titles
    // could be taken. That rewrite was ended, so a pipeline rename cannot
    // collide with anything and cannot half-apply. What is left to prove is that it writes nothing
    // else.
    const { p, blocks } = withBlocks('Transplant v2')
    const note = t.api.createRecord({
      workspaceId: HERE,
      kind: 'note',
      title: 'Plan the approach',
      actor: t.api.HUMAN,
    })

    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)

    expect(t.api.getRecord(p.id)?.title).toBe('Handover v3')
    for (const block of blocks) expect(t.api.getRecord(block.id)?.title).toBe(block.title)
    expect(t.api.getRecord(note.id)?.title).toBe('Plan the approach')
    // And no change row was written on any block, for a rewrite that no longer happens.
    for (const block of blocks) {
      expect(t.api.listChanges({ workspaceId: HERE, recordId: block.id }).filter((c) => c.field === 'title')).toHaveLength(0)
    }
  })

  it('leaves every block addressable by its own name after the pipeline is renamed', () => {
    const { p } = withBlocks('Transplant v2')
    t.api.patchRecord(p.id, { title: 'Handover v3' }, t.api.HUMAN)
    expect(t.api.getRecordByTitle('Sense the pot', HERE)).not.toBeNull()
    expect(t.api.getRecordByTitle('Handover v3 › Sense the pot', HERE)).toBeNull()
  })
})

// ============================================================ the block's own title

describe('a block’s title is its own name', () => {
  it('takes a plain title PATCH, which used to be refused for every block there was', () => {
    // THIS DOOR REFUSED EVERY BLOCK IN THE CORPUS until 6 September 2026. It required
    // `<pipeline> › <name>`, and the corpus had been renamed away from that shape on 26 August, so
    // no stored title could satisfy it — problem `PYkkl-8BFRKM`.
    const p = pipeline('Transplant v2')
    const block = t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'doing' }, t.api.HUMAN).block
    expect(block.title).toBe('Close and hold')

    const after = t.api.patchRecord(block.id, { title: 'Close and hold, harder' }, t.api.HUMAN)
    expect(after.record.title).toBe('Close and hold, harder')
  })

  it('refuses a title a live block of the same pipeline already holds', () => {
    // THE ONE THING THE PREFIX WAS BUYING: a pipeline is read as an ordered list of its blocks'
    // names, so two of them reading the same is two rows nobody can tell apart.
    const p = pipeline('Transplant v2')
    const one_ = t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'doing' }, t.api.HUMAN).block
    t.blocks.addBlock(p.id, { name: 'Sense the pot', state: 'todo' }, t.api.HUMAN)

    let message = ''
    try {
      t.api.patchRecord(one_.id, { title: 'Sense the pot' }, t.api.HUMAN)
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('already has a live block called "Sense the pot"')
    expect(t.api.getRecord(one_.id)?.title).toBe('Close and hold')
  })

  it('renames through the pipeline route, which writes the name as the title', () => {
    const p = pipeline('Transplant v2')
    const block = t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'doing' }, t.api.HUMAN).block
    const after = t.blocks.patchBlock(p.id, block.id, { name: 'Close, hold and let go' }, t.api.HUMAN)
    expect(after.record.title).toBe('Close, hold and let go')
  })

  it('changes a block’s state with the ordinary record machinery, change rows and all', () => {
    const p = pipeline('Transplant v2')
    const block = t.blocks.addBlock(p.id, { name: 'Sense the pull', state: 'doing' }, t.api.HUMAN).block
    t.blocks.patchBlock(p.id, block.id, { state: 'failed', measured: 'the gel lags the pull by 180 ms' }, t.api.HUMAN)

    const after = t.api.getRecord(block.id)
    expect(after?.data['state']).toBe('failed')
    // ITS OWN HISTORY, AT THE GRAIN OF THE FIELD THAT MOVED. This is what "comparing versions is
    // impossible, not merely missing" was about: one edit used to write one row holding the whole
    // step array, so "what happened to this block" could not be answered at all.
    const fields = t.api.listChanges({ workspaceId: HERE, recordId: block.id }).map((row) => row.field)
    expect(fields).toContain('data.state')
    expect(fields).toContain('data.measured')
  })
})

// ============================================================ telling two steps of one name apart

describe('the picker tells two records of one name apart', () => {
  const pipeline = (title: string, blockIds: string[]) => ({
    id: `p-${title}`,
    kind: 'pipeline' as const,
    title,
    data: { blockIds } as Record<string, unknown>,
  })
  const block = (id: string, title: string) => ({ id, kind: 'block' as const, title, data: {} as Record<string, unknown> })

  it('says nothing at all about a title only one record answers to', () => {
    // A NOTE ON EVERY ROW IS A NOTE NOBODY READS. This is the case for almost every record there is.
    const options = titleOptions([block('b1', 'Calibrate'), pipeline('Perception', ['b1'])])
    expect(options.find((one) => one.id === 'b1')?.note).toBeNull()
  })

  it('names the pipeline each of two same-named steps is in', () => {
    // WHAT THE END OF THE ONE-PIPELINE RULE NEEDS: a block's
    // title is its own name now, so two steps called "Calibrate" read identically in a picker and
    // the thing that tells them apart is which pipeline each is in.
    const options = titleOptions([
      block('b1', 'Calibrate'),
      block('b2', 'Calibrate'),
      pipeline('Perception', ['b1']),
      pipeline('Object recognition', ['b2']),
    ])
    expect(options.find((one) => one.id === 'b1')?.note).toBe('a step of Perception')
    expect(options.find((one) => one.id === 'b2')?.note).toBe('a step of Object recognition')
  })

  it('names both pipelines when one block is in two of them', () => {
    const options = titleOptions([
      block('b1', 'Calibrate'),
      block('b2', 'Calibrate'),
      pipeline('Perception', ['b1']),
      pipeline('Object recognition', ['b1']),
    ])
    expect(options.find((one) => one.id === 'b1')?.note).toBe('a step of Perception and Object recognition')
  })

  it('says which kind two same-named records that are not blocks are', () => {
    const options = titleOptions([
      { id: 'm1', kind: 'module' as const, title: 'Grippers', data: {} as Record<string, unknown> },
      { id: 'c1', kind: 'claim' as const, title: 'Grippers', data: {} as Record<string, unknown> },
    ])
    expect(options.map((one) => one.note)).toEqual(['module', 'claim'])
  })

  it('says so rather than nothing when a same-named step is in no pipeline at all', () => {
    // A HOLE IN SOME PIPELINE'S ORDER, and the picker says that instead of drawing two identical
    // rows. Absence beats a guess, and the two rows are still told apart.
    const options = titleOptions([block('b1', 'Calibrate'), block('b2', 'Calibrate'), pipeline('Perception', ['b1'])])
    expect(options.find((one) => one.id === 'b2')?.note).toBe('a step in no pipeline')
  })
})
