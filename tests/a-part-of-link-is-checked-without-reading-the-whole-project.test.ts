// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A `part_of` LINK IS CHECKED WITHOUT READING THE WHOLE PROJECT, AND IS ANSWERED AS IT WAS.
 *
 * `createLink` asks two questions of a `part_of` link before it writes it, `wouldMakeCycle` and `hasParentAlready` in
 * src/shared/containment.ts. It used to hand them every record of the project, deleted ones too, with its data, and every
 * link of the project. It now hands them only what they read: the project's `part_of` links, the project's pipelines
 * with their `blockIds`, and the id, kind, title and deleted mark of each record the two walks reach.
 *
 * WHAT IS HELD HERE.
 *   1. The answers. For each link a case tries, the answer the two checks give over the whole project is worked out
 *      first, as `createLink` used to work it out: `listRecords({ workspaceId, includeDeleted: true })` and `allLinks`.
 *      Each case also holds that this answer is the refusal it was set up to make, so a case cannot pass by making
 *      nothing. Then `createLink` must refuse with 409 and that sentence, writing nothing, or write the link when the
 *      checks pass. The cases: a loop through links; a loop through a pipeline's order; a second parent by a link; a
 *      second parent by a pipeline's order, and by a deleted pipeline's order; a deleted parent; a chain that reaches a
 *      record in another project; two parents with the same title; a loop already stored; a chain 20 levels high and
 *      one 19 levels high; and links that pass, one of them through the marked records below.
 *   2. What is handed back. Marked records sit beside the cases and are never changed by them: two notes and a module
 *      with a marker in their data, a pipeline with a marker beside its `blockIds`, and two `relates_to` links whose ids
 *      are markers. The module and the pipeline are on one case's walk; the rest are on none. Every row a statement hands
 *      back while a tried link write runs is looked at as it comes back, and none may hold a marker.
 *
 * IT FAILS BEFORE THE FIX, at ed492a844, in the last case alone: every tried link write handed back every marked
 * record's data from `listRecords` and both `relates_to` links from `allLinks`. The answers were the same then.
 *
 * MUTATIONS, each in `whatTheContainmentChecksRead` in src/server/lib/records/links.ts:
 *   1. The pipelines left out of the narrow read (hand in no pipeline): the loop through a pipeline's order passes, and
 *      the two second parents by a pipeline's order pass.
 *   2. The deleted records left out (`includeDeleted: false` in both reads): the deleted parent is named as a record that
 *      was not loaded, and the deleted pipeline's step passes.
 *   3. The project rule taken out (`workspaceId: ACROSS_WORKSPACES` in the read by ids): the chain that reaches the other
 *      project is walked through it and the link passes.
 *   4. The titles left out (each record handed in with its id for its title): every refusal names its records wrongly.
 *   5. The walk cut at ten levels: the chain 20 levels high is refused as reaching a record that was not loaded, rather
 *      than as too deep, and the chain 19 levels high is refused rather than passing.
 *   6. Each record read with its whole data (the data expression of either read taken out): the last case.
 *
 * WHAT IT DOES NOT HOLD. How long a link write takes, or how much it reads: the supervisor measures that. An id with no
 * record at all is not tried, because the links table's foreign keys refuse to store one.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. A shape the write door now refuses (a
 * second parent, an end in another project, a stored loop) is made by writing an ordinary link through the door and
 * then pointing one of its ends elsewhere in the table, as data stored before a rule existed would hold it. The markers
 * are written straight into the stored data, so no kind's field rules decide where they may go.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasParentAlready, MAX_CONTAINMENT_DEPTH, type PartOfCheck, type RefusalReason, wouldMakeCycle } from '../src/shared/containment.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'made-up-other-project'

let t: TestDb

/** Every marker: the strings written into stored data, and the ids of the links of another type. */
const MARKERS: string[] = []
/** What each tried link write handed back that held a marker, with the statement that handed it back. */
const HANDED_BACK: { link: string; source: string; markers: string[] }[] = []
/** How many link writes were watched, so the last case cannot pass by watching none. */
let watched = 0

type Kind = 'module' | 'task' | 'pipeline' | 'note'

function record(kind: Kind, title: string, workspaceId = HERE): string {
  return t.api.createRecord({ workspaceId, kind, title, actor: t.api.HUMAN }).id
}

function partOf(fromId: string, toId: string): { id: string } {
  return t.api.createLink({ fromId, toId, type: 'part_of', actor: t.api.HUMAN })
}

/** A pipeline with one step, and that step's id. */
function aPipelineWithAStep(title: string, step: string): { pipeline: string; step: string } {
  const pipeline = record('pipeline', title)
  return { pipeline, step: t.blocks.addBlock(pipeline, { name: step, state: 'todo' }, t.api.HUMAN).block.id }
}

/** Points one end of a stored link at another record, in the table, past the write door's checks. */
function pointTheStoredLink(linkId: string, end: 'from_id' | 'to_id', recordId: string): void {
  const changed = t.client.sqlite.prepare(`UPDATE links SET ${end} = ? WHERE id = ?`).run(recordId, linkId)
  expect(changed.changes).toBe(1)
}

/** Writes a marker into a record's stored data, beside whatever it holds. */
function mark(recordId: string, marker: string): void {
  const changed = t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.markerNoCheckReads', ?) WHERE id = ?").run(marker, recordId)
  expect(changed.changes).toBe(1)
  MARKERS.push(marker)
}

/** The answer the two checks give over the whole project, as `createLink` worked it out before it read narrowly. */
function theWholeProjectsAnswer(fromId: string, toId: string): PartOfCheck {
  const context = {
    records: t.api.listRecords({ workspaceId: HERE, includeDeleted: true }),
    links: t.api.allLinks(HERE),
  }
  const loop = wouldMakeCycle(fromId, toId, context)
  if (loop.refuse) return loop
  return hasParentAlready(fromId, context)
}

/** The stored `part_of` rows, sorted, so a refusal cannot be believed on trust. */
function storedPartOfLinks(): string[] {
  const rows = t.client.sqlite.prepare("SELECT from_id, to_id FROM links WHERE type = 'part_of'").all() as { from_id: string; to_id: string }[]
  return rows.map((row) => `${row.from_id} ${row.to_id}`).sort()
}

/** Runs `work` with every statement's rows looked at as they come back, and keeps each one that holds a marker. */
function watchingWhatIsHandedBack<T>(link: string, work: () => T): T {
  const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => object }
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, (...args: unknown[]) => unknown>
  const look = (source: string, rows: unknown): void => {
    const text = String(JSON.stringify(rows, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value)))
    const markers = MARKERS.filter((marker) => text.includes(marker))
    if (markers.length > 0) HANDED_BACK.push({ link, source, markers })
  }
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  for (const name of ['get', 'all']) {
    const original = prototype[name]!
    originals.set(name, original)
    prototype[name] = function (this: { source: string }, ...args: unknown[]) {
      const rows = original.apply(this, args)
      look(this.source, rows)
      return rows
    }
  }
  const iterate = prototype['iterate']!
  originals.set('iterate', iterate)
  prototype['iterate'] = function* (this: { source: string }, ...args: unknown[]) {
    for (const row of iterate.apply(this, args) as Iterable<unknown>) {
      look(this.source, row)
      yield row
    }
  }
  watched += 1
  try {
    return work()
  } finally {
    for (const [name, original] of originals) prototype[name] = original
  }
}

/**
 * Tries one link: works out the whole project's answer, holds that it is the answer the case was set up for, and
 * holds that `createLink` gives it, writing nothing on a refusal and the link on a pass.
 */
function tryTheLink(fromId: string, toId: string, expected: RefusalReason | 'passes'): PartOfCheck {
  const answer = theWholeProjectsAnswer(fromId, toId)
  expect(answer.refuse ? answer.why : 'passes', answer.refuse ? answer.sentence : 'the checks pass').toBe(expected)
  const before = storedPartOfLinks()
  const link = `${fromId} part of ${toId}`
  if (answer.refuse) {
    const err = watchingWhatIsHandedBack(link, () => expectPanelError(t, () => partOf(fromId, toId), 409))
    expect(err.message).toBe(answer.sentence)
    expect(storedPartOfLinks()).toEqual(before)
  } else {
    watchingWhatIsHandedBack(link, () => partOf(fromId, toId))
    expect(storedPartOfLinks()).toEqual([...before, `${fromId} ${toId}`].sort())
  }
  return answer
}

/** The marked pipeline's step, which the one case whose walk goes through the marked records links to. */
let marked: { step: string }

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'A made-up second project' })

  // ON NO CASE'S WALK: two notes with a marker each, and a link of another type between them.
  const first = record('note', 'Marked note, first')
  const second = record('note', 'Marked note, second')
  mark(first, 'marker-in-the-first-note')
  mark(second, 'marker-in-the-second-note')
  MARKERS.push(t.api.createLink({ fromId: first, toId: second, type: 'relates_to', actor: t.api.HUMAN }).id)

  // ON ONE CASE'S WALK: a step of a pipeline whose data holds a marker beside its order, inside a module whose data holds
  // one, and a link of another type from that module to a note.
  const { pipeline, step } = aPipelineWithAStep('Marked pipeline', 'Marked step')
  const module = record('module', 'Marked module')
  partOf(pipeline, module)
  mark(pipeline, 'marker-beside-the-pipelines-order')
  mark(module, 'marker-in-the-module-on-the-walk')
  MARKERS.push(t.api.createLink({ fromId: module, toId: first, type: 'relates_to', actor: t.api.HUMAN }).id)
  marked = { step }
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(() => {
  t.close()
})

describe('the same answer as the checks give over the whole project', () => {
  it('refuses a loop through links', () => {
    const shelf = record('module', 'Shelf')
    const box = record('module', 'Box')
    const label = record('task', 'Put on the label')
    partOf(label, box)
    partOf(box, shelf)
    tryTheLink(shelf, label, 'loop')
  })

  it('refuses a loop through a pipeline\'s order', () => {
    const { pipeline, step } = aPipelineWithAStep('Morning post', 'Open the letters')
    const task = record('task', 'File the letters')
    partOf(task, step)
    const answer = tryTheLink(pipeline, task, 'loop')
    expect(answer.refuse && answer.recordIds).toEqual([task, step, pipeline])
  })

  it('refuses a second parent by a link', () => {
    const tray = record('module', 'Tray')
    const lid = record('module', 'Lid')
    const cups = record('task', 'Wash the cups')
    partOf(cups, tray)
    tryTheLink(cups, lid, 'second parent')
  })

  it('refuses a second parent by a pipeline\'s order', () => {
    const { step } = aPipelineWithAStep('Laundry', 'Fold the shirts')
    const cupboard = record('module', 'Cupboard')
    tryTheLink(step, cupboard, 'second parent')
  })

  it('refuses a second parent by a deleted pipeline\'s order', () => {
    const { pipeline, step } = aPipelineWithAStep('Old laundry', 'Count the socks')
    t.api.deleteRecord(pipeline, t.api.HUMAN)
    const drawer = record('module', 'Drawer')
    const answer = tryTheLink(step, drawer, 'second parent')
    expect(answer.refuse && answer.sentence).toContain('has been deleted')
  })

  it('refuses a second parent that has been deleted, and says so', () => {
    const frame = record('module', 'Frame')
    const stand = record('module', 'Stand')
    const picture = record('task', 'Choose the picture')
    partOf(picture, frame)
    t.api.deleteRecord(frame, t.api.HUMAN)
    const answer = tryTheLink(picture, stand, 'second parent')
    expect(answer.refuse && answer.sentence).toContain('has been deleted')
  })

  it('refuses, as not checked, a chain that reaches a record in another project', () => {
    const away = record('module', 'Away module', ELSEWHERE)
    const near = record('module', 'Near module')
    const task = record('task', 'Write the letter')
    const sub = record('task', 'Sign the letter')
    pointTheStoredLink(partOf(task, near).id, 'to_id', away)
    const answer = tryTheLink(sub, task, 'not checked')
    expect(answer.refuse && answer.sentence).toContain(away)
  })

  it('names two parents with the same title in order of their ids', () => {
    const one = record('module', 'Same title')
    const two = record('module', 'Same title')
    const held = record('task', 'Held twice')
    const other = record('task', 'Held once')
    partOf(held, one)
    pointTheStoredLink(partOf(other, two).id, 'from_id', held)
    const third = record('module', 'Third')
    const below = record('task', 'Below the one held twice')
    const asParent = tryTheLink(held, third, 'second parent')
    const asWalk = tryTheLink(below, held, 'not checked')
    const [first, second] = [one, two].sort()
    for (const answer of [asParent, asWalk]) {
      const sentence = answer.refuse ? answer.sentence : ''
      const firstAt = sentence.indexOf(`"Same title" (${first!})`)
      expect(firstAt, sentence).toBeGreaterThanOrEqual(0)
      expect(sentence.indexOf(`"Same title" (${second!})`), sentence).toBeGreaterThan(firstAt)
    }
  })

  it('refuses, as not checked, a walk that meets a loop already stored', () => {
    const left = record('module', 'Left')
    const right = record('module', 'Right')
    const spare = record('module', 'Spare')
    const below = record('task', 'Below the loop')
    partOf(left, right)
    pointTheStoredLink(partOf(right, spare).id, 'to_id', left)
    tryTheLink(below, left, 'not checked')
  })

  it(`refuses, as too deep, a chain ${String(MAX_CONTAINMENT_DEPTH)} levels high, and passes one a level lower`, () => {
    const chain = Array.from({ length: MAX_CONTAINMENT_DEPTH + 1 }, (_, at) => record('module', `Level ${String(at)}`))
    // From the bottom up, so each link's far end has nothing above it yet when it is written.
    for (let at = 0; at < MAX_CONTAINMENT_DEPTH; at += 1) partOf(chain[at]!, chain[at + 1]!)
    const answer = tryTheLink(record('task', 'Below the whole chain'), chain[0]!, 'not checked')
    expect(answer.refuse && answer.sentence).toContain(`walks ${String(MAX_CONTAINMENT_DEPTH)} levels and no further`)
    tryTheLink(record('task', 'Below the second level'), chain[1]!, 'passes')
  })

  it('passes a link, and one whose walk goes through the marked records', () => {
    const cabinet = record('module', 'Cabinet')
    tryTheLink(record('task', 'Hang the door'), cabinet, 'passes')
    tryTheLink(record('task', 'Below the marked step'), marked.step, 'passes')
  })
})

describe('what the link writes hand back', () => {
  it('no statement any tried link write runs hands back a marker, so none read a record or a link it does not need', () => {
    expect(watched).toBeGreaterThan(10)
    expect(MARKERS).toHaveLength(6)
    expect(HANDED_BACK.map((one) => `${one.link}: ${one.markers.join(', ')} from ${one.source}`)).toEqual([])
  })
})
