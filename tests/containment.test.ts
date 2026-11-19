// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READER FOR CONTAINMENT, ACROSS THREE STORES THAT DO NOT KNOW ABOUT EACH OTHER.
 *
 * Mole Office stores "what is part of what" three ways: a pipeline's ordered `blockIds`, a module's JSON
 * checklist, and the `part_of` link. `src/shared/containment.ts` is the only code that knows there
 * is more than one, and these tests are about the four things that makes true:
 *
 *   1. THE PIPELINE STORE COUNTS. A block's parent is its pipeline even though no link says so, and
 *      a pipeline's parts come back in its stored order rather than sorted.
 *   2. A CHECKLIST ITEM IS NOT A RECORD AND IS NOT PRETENDED TO BE. A module's items cannot be
 *      listed as parts, so they are COUNTED and named. "No parts" about a module holding twelve
 *      items would be a false answer.
 *   3. NOTHING IS PICKED SILENTLY. Two parents means no parent and a sentence naming both. A walk
 *      that hits a loop, a missing record or the depth limit says the answer is short and why.
 *   4. A REFUSAL NAMES THE RECORDS. "Not allowed" with no names tells the reader nothing about what
 *      to do next, so every refusal carries the titles, the ids, and what to remove.
 *
 * Everything here is pure data in and data out. No database, no server, no clock.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import {
  MAX_CONTAINMENT_DEPTH,
  ancestorsOf,
  descendantsOf,
  hasParentAlready,
  parentOf,
  partsOf,
  unloadedRecordName,
  wouldMakeCycle,
  type ContainmentContext,
  type ContainmentLink,
} from '../src/shared/containment.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'

const STAMP = '2026-08-14 09:00'

function record(id: string, kind: RecordKind, title: string, data: Record<string, unknown> = {}): PanelRecord {
  return {
    id,
    kind,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title,
    summary: null,
    data,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

/** A `part_of` row: `from` is the part, `to` is what it is part of. The way the link is stored. */
function partOf(id: string, fromId: string, toId: string): ContainmentLink {
  return { id, fromId, toId, type: 'part_of' }
}

function context(records: PanelRecord[], links: ContainmentLink[] = []): ContainmentContext {
  return { records, links }
}

// ============================================================ the part_of store

describe('the part_of link', () => {
  it('names the one thing a record is part of', () => {
    const task = record('t1', 'task', 'Print the mount')
    const module_ = record('m1', 'module', 'Tray clamp')
    const reading = parentOf(task, context([task, module_], [partOf('L1', 't1', 'm1')]))
    expect(reading.parent?.id).toBe('m1')
    expect(reading.parent?.title).toBe('Tray clamp')
    expect(reading.parent?.via).toBe('part of link')
    expect(reading.parent?.linkId).toBe('L1')
    expect(reading.conflict).toBeNull()
  })

  it('answers "nothing" when nothing says so, rather than guessing at a project or a kind', () => {
    const task = record('t1', 'task', 'Print the mount')
    const reading = parentOf(task, context([task, record('m1', 'module', 'Tray clamp')]))
    expect(reading.parents).toEqual([])
    expect(reading.parent).toBeNull()
    expect(reading.conflict).toBeNull()
  })

  it('reads the backlinks as the parts', () => {
    const module_ = record('m1', 'module', 'Tray clamp')
    const one = record('t1', 'task', 'Print the mount')
    const two = record('t2', 'task', 'Cut the plate')
    const reading = partsOf(
      module_,
      context([module_, one, two], [partOf('L1', 't1', 'm1'), partOf('L2', 't2', 'm1')]),
    )
    expect(reading.parts.map((p) => p.id)).toEqual(['t2', 't1'])
    expect(reading.gaps).toEqual([])
  })

  it('gives the same order whichever order the caller passes its links in', () => {
    const module_ = record('m1', 'module', 'Tray clamp')
    const kids = ['b', 'a', 'c'].map((name, at) => record(`t${String(at)}`, 'task', name))
    const links = kids.map((kid, at) => partOf(`L${String(at)}`, kid.id, 'm1'))
    const forward = partsOf(module_, context([module_, ...kids], links))
    const backward = partsOf(module_, context([module_, ...kids].reverse(), [...links].reverse()))
    expect(forward.parts.map((p) => p.title)).toEqual(['a', 'b', 'c'])
    expect(backward.parts.map((p) => p.title)).toEqual(forward.parts.map((p) => p.title))
  })

  it('says a record was not loaded rather than inventing a title for it', () => {
    const task = record('t1', 'task', 'Print the mount')
    const reading = parentOf(task, context([task], [partOf('L1', 't1', 'm1')]))
    expect(reading.parent?.title).toBe(unloadedRecordName('m1'))
    expect(reading.parent?.record).toBeNull()
    expect(reading.parent?.deleted).toBeNull()
  })
})

// ============================================================ the pipeline store

describe("a pipeline's stored order is containment too", () => {
  const pipeline = record('p1', 'pipeline', 'Baseline', { blockIds: ['b1', 'b2', 'b3'] })
  const blocks = [
    record('b1', 'block', 'Baseline › zebra'),
    record('b2', 'block', 'Baseline › apple'),
    record('b3', 'block', 'Baseline › middle'),
  ]

  it('makes the pipeline a block’s parent with no link stored at all', () => {
    const reading = parentOf(blocks[1]!, context([pipeline, ...blocks]))
    expect(reading.parent?.id).toBe('p1')
    expect(reading.parent?.via).toBe('pipeline order')
    expect(reading.parent?.linkId).toBeNull()
    expect(reading.parent?.position).toBe(2)
  })

  it('returns the steps in the stored order and not in title order', () => {
    const reading = partsOf(pipeline, context([pipeline, ...blocks]))
    expect(reading.parts.map((p) => p.id)).toEqual(['b1', 'b2', 'b3'])
    expect(reading.parts.map((p) => p.position)).toEqual([1, 2, 3])
  })

  it('counts a step whose record was not loaded, and never drops it', () => {
    const reading = partsOf(pipeline, context([pipeline, blocks[0]!, blocks[2]!]))
    expect(reading.parts.map((p) => p.id)).toEqual(['b1', 'b2', 'b3'])
    expect(reading.parts[1]!.title).toBe(unloadedRecordName('b2'))
  })

  it('names a hole in the stored order instead of shortening the pipeline', () => {
    const holed = record('p2', 'pipeline', 'Holed', { blockIds: ['b1', 99999, 'b1'] })
    const reading = partsOf(holed, context([holed, ...blocks]))
    expect(reading.parts.map((p) => p.id)).toEqual(['b1'])
    expect(reading.gaps).toHaveLength(2)
    expect(reading.gaps[0]!.reason).toContain('Position 2')
    expect(reading.gaps[0]!.reason).toContain('99999')
    expect(reading.gaps[1]!.reason).toContain('Position 3')
  })

  it('counts a part_of link into a pipeline that its order does not mention', () => {
    const note = record('n1', 'note', 'What this pipeline is for')
    const reading = partsOf(pipeline, context([pipeline, ...blocks, note], [partOf('L1', 'n1', 'p1')]))
    expect(reading.parts.map((p) => p.id)).toEqual(['b1', 'b2', 'b3', 'n1'])
    expect(reading.parts[3]!.via).toBe('part of link')
  })

  it('counts a step once when the order and a link both say it', () => {
    const reading = partsOf(pipeline, context([pipeline, ...blocks], [partOf('L1', 'b2', 'p1')]))
    expect(reading.parts.map((p) => p.id)).toEqual(['b1', 'b2', 'b3'])
  })
})

// ============================================================ the checklist that is not records

describe('a module’s checklist items are counted, never listed and never ignored', () => {
  const module_ = record('m1', 'module', 'Tray clamp', {
    parts: [
      { id: 'p1', name: 'Mount', items: [{ id: 'i1', text: 'print it', state: 'done' }, { id: 'i2', text: 'fit it', state: 'todo' }] },
      { id: 'p2', name: 'Wiring', items: [{ id: 'i3', text: 'solder', state: 'todo' }] },
    ],
  })

  it('says how many it could not count, and why, when there are no parts at all', () => {
    const reading = partsOf(module_, context([module_]))
    expect(reading.parts).toEqual([])
    expect(reading.gaps).toHaveLength(1)
    expect(reading.gaps[0]!.count).toBe(3)
    expect(reading.gaps[0]!.reason).toContain('3 checklist items')
    expect(reading.gaps[0]!.reason).toContain('2 parts')
    expect(reading.gaps[0]!.reason).toContain('not a record')
    expect(reading.gaps[0]!.recordIds).toEqual([])
  })

  it('still counts them when the module does have real parts', () => {
    const task = record('t1', 'task', 'Print the mount')
    const reading = partsOf(module_, context([module_, task], [partOf('L1', 't1', 'm1')]))
    expect(reading.parts.map((p) => p.id)).toEqual(['t1'])
    expect(reading.gaps[0]!.count).toBe(3)
  })

  it('says nothing about a checklist that is not there', () => {
    const empty = record('m2', 'module', 'Bare', { parts: [] })
    expect(partsOf(empty, context([empty])).gaps).toEqual([])
  })

  it('carries the count up through a walk down the tree', () => {
    const pipeline = record('p1', 'pipeline', 'Baseline', { blockIds: ['b1'] })
    const block = record('b1', 'block', 'Baseline › build')
    const ctx = context([pipeline, block, module_], [partOf('L1', 'm1', 'b1')])
    const walk = descendantsOf(pipeline, ctx)
    expect(walk.complete).toBe(true)
    expect(walk.steps.map((s) => [s.id, s.depth])).toEqual([['b1', 1], ['m1', 2]])
    expect(walk.gaps).toHaveLength(1)
    expect(walk.gaps[0]!.count).toBe(3)
  })
})

// ============================================================ two parents

describe('two things claiming one record is answered with both names, never with a pick', () => {
  it('refuses to choose between two links', () => {
    const task = record('t1', 'task', 'Print the mount')
    const one = record('m1', 'module', 'Tray clamp')
    const two = record('m2', 'module', 'Arm')
    const reading = parentOf(
      task,
      context([task, one, two], [partOf('L1', 't1', 'm1'), partOf('L2', 't1', 'm2')]),
    )
    expect(reading.parents).toHaveLength(2)
    expect(reading.parent).toBeNull()
    expect(reading.conflict).toContain('Arm')
    expect(reading.conflict).toContain('Tray clamp')
    expect(reading.conflict).toContain('m1')
    expect(reading.conflict).toContain('m2')
  })

  it('refuses to choose between the pipeline store and the link store', () => {
    const pipeline = record('p1', 'pipeline', 'Baseline', { blockIds: ['b1'] })
    const block = record('b1', 'block', 'Baseline › build')
    const module_ = record('m1', 'module', 'Tray clamp')
    const reading = parentOf(
      block,
      context([pipeline, block, module_], [partOf('L1', 'b1', 'm1')]),
    )
    expect(reading.parent).toBeNull()
    expect(reading.conflict).toContain('Baseline')
    expect(reading.conflict).toContain('Tray clamp')
  })
})

// ============================================================ walking up and down

describe('the chains, with a limit and an honest answer on a loop', () => {
  it('walks up through both stores in one chain', () => {
    const pipeline = record('p1', 'pipeline', 'Baseline', { blockIds: ['b1'] })
    const block = record('b1', 'block', 'Baseline › build')
    const task = record('t1', 'task', 'Print the mount')
    const walk = ancestorsOf(task, context([pipeline, block, task], [partOf('L1', 't1', 'b1')]))
    expect(walk.complete).toBe(true)
    expect(walk.steps.map((s) => [s.id, s.depth, s.via])).toEqual([
      ['b1', 1, 'part of link'],
      ['p1', 2, 'pipeline order'],
    ])
  })

  it('stops on a loop that is already stored, and says which record closed it', () => {
    const a = record('a', 'task', 'A')
    const b = record('b', 'task', 'B')
    const walk = ancestorsOf(a, context([a, b], [partOf('L1', 'a', 'b'), partOf('L2', 'b', 'a')]))
    expect(walk.complete).toBe(false)
    if (walk.complete) throw new Error('unreachable')
    expect(walk.stopped).toContain('loop')
    expect(walk.stopped).toContain('"A" (a)')
    expect(walk.steps.map((s) => s.id)).toEqual(['b'])
  })

  it('stops at the depth limit and says the answer is short', () => {
    const deep: PanelRecord[] = []
    const links: ContainmentLink[] = []
    const rungs = MAX_CONTAINMENT_DEPTH + 3
    for (let at = 0; at < rungs; at += 1) {
      deep.push(record(`r${String(at)}`, 'task', `rung ${String(at)}`))
      if (at > 0) links.push(partOf(`L${String(at)}`, `r${String(at - 1)}`, `r${String(at)}`))
    }
    const walk = ancestorsOf(deep[0]!, context(deep, links))
    expect(walk.complete).toBe(false)
    if (walk.complete) throw new Error('unreachable')
    expect(walk.steps).toHaveLength(MAX_CONTAINMENT_DEPTH)
    expect(walk.stopped).toContain(String(MAX_CONTAINMENT_DEPTH))
    expect(walk.stopped).toContain('not complete')
  })

  it('stops when a record above was not handed in, rather than reporting the top', () => {
    const task = record('t1', 'task', 'Print the mount')
    const walk = ancestorsOf(task, context([task], [partOf('L1', 't1', 'm1')]))
    expect(walk.complete).toBe(false)
    if (walk.complete) throw new Error('unreachable')
    expect(walk.stopped).toContain('not handed to this reader')
    expect(walk.steps.map((s) => s.id)).toEqual(['m1'])
  })

  it('walks down depth first and stops on a loop below', () => {
    const a = record('a', 'module', 'A')
    const b = record('b', 'task', 'B')
    const walk = descendantsOf(a, context([a, b], [partOf('L1', 'b', 'a'), partOf('L2', 'a', 'b')]))
    expect(walk.complete).toBe(false)
    if (walk.complete) throw new Error('unreachable')
    expect(walk.stopped).toContain('loop')
    expect(walk.steps.map((s) => s.id)).toEqual(['b'])
  })
})

// ============================================================ the two write questions

describe('a part_of write is refused with a sentence that names the records', () => {
  it('refuses a record being made part of itself', () => {
    const task = record('t1', 'task', 'Print the mount')
    const check = wouldMakeCycle('t1', 't1', context([task]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('itself')
    expect(check.sentence).toContain('"Print the mount" (t1)')
  })

  it('refuses the link that closes a loop, naming every record in it', () => {
    const a = record('a', 'module', 'Arm')
    const b = record('b', 'module', 'Tray clamp')
    const c = record('c', 'task', 'Print the mount')
    // c is part of b, b is part of a. Making a part of c would close the ring.
    const ctx = context([a, b, c], [partOf('L1', 'c', 'b'), partOf('L2', 'b', 'a')])
    const check = wouldMakeCycle('a', 'c', ctx)
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('loop')
    expect(check.sentence).toContain('"Print the mount" (c)')
    expect(check.sentence).toContain('"Tray clamp" (b)')
    expect(check.sentence).toContain('"Arm" (a)')
    expect(check.recordIds).toEqual(['c', 'b', 'a'])
  })

  it('allows a link that makes no loop', () => {
    const a = record('a', 'module', 'Arm')
    const b = record('b', 'task', 'Print the mount')
    expect(wouldMakeCycle('b', 'a', context([a, b]))).toEqual({ refuse: false })
  })

  it('refuses rather than allows when it could not check', () => {
    const a = record('a', 'module', 'Arm')
    const check = wouldMakeCycle('b', 'a', context([a]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('not checked')
    expect(check.recordIds).toEqual(['b'])
  })

  it('refuses when the records above the far end are not all known', () => {
    const a = record('a', 'module', 'Arm')
    const b = record('b', 'task', 'Print the mount')
    // Arm is part of something nobody handed in, so nothing can say what is above it.
    const check = wouldMakeCycle('b', 'a', context([a, b], [partOf('L1', 'a', 'gone')]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('not checked')
    expect(check.sentence).toContain('not handed to this reader')
  })

  it('refuses a second parent, naming the link to remove', () => {
    const task = record('t1', 'task', 'Print the mount')
    const module_ = record('m1', 'module', 'Tray clamp')
    const check = hasParentAlready('t1', context([task, module_], [partOf('L1', 't1', 'm1')]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('second parent')
    expect(check.sentence).toContain('"Print the mount" (t1)')
    expect(check.sentence).toContain('"Tray clamp" (m1)')
    expect(check.sentence).toContain('L1')
    expect(check.recordIds).toEqual(['t1', 'm1'])
  })

  it('refuses a second parent when the first is a pipeline’s stored order', () => {
    const pipeline = record('p1', 'pipeline', 'Baseline', { blockIds: ['x', 'b1'] })
    const block = record('b1', 'block', 'Baseline › build')
    const check = hasParentAlready('b1', context([pipeline, block]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.sentence).toContain('step 2 of the pipeline "Baseline" (p1)')
    expect(check.sentence).toContain("Take it out of that pipeline's steps first.")
  })

  it('says the parent is deleted when it is, because the containment is still stored', () => {
    const task = record('t1', 'task', 'Print the mount')
    const gone = { ...record('m1', 'module', 'Tray clamp'), deletedAt: STAMP }
    const check = hasParentAlready('t1', context([task, gone], [partOf('L1', 't1', 'm1')]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.sentence).toContain('has been deleted')
  })

  it('allows a first parent', () => {
    const task = record('t1', 'task', 'Print the mount')
    expect(hasParentAlready('t1', context([task]))).toEqual({ refuse: false })
  })

  it('refuses rather than allows when the record itself was not handed in', () => {
    const check = hasParentAlready('t1', context([]))
    expect(check.refuse).toBe(true)
    if (!check.refuse) throw new Error('unreachable')
    expect(check.why).toBe('not checked')
  })
})
