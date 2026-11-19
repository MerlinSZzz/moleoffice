// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT `createLink` REFUSES TO STORE AS A `part_of` LINK.
 *
 * `part_of` is the one link that says a record is INSIDE another — "part of" read forward, "has
 * part" read back. `design/ROUND-FOUR-BUILD.md` decision 3 settles what may not be written:
 *
 *   1. A LOOP. Two records each inside the other is not a shape anything can be scheduled, totalled
 *      or drawn from, and every walk over containment would have to defend itself against it.
 *   2. A SECOND PARENT. A record is part of one thing. Hours go to a piece of work or to its parts,
 *      and a record with two parents makes "which total holds this" unanswerable.
 *
 * THE QUESTIONS ARE ASKED OF `@shared/containment.ts`, which is the one reader of all three
 * containment stores — a pipeline's ordered `blockIds`, a module's JSON checklist, and this link.
 * tests/containment.test.ts proves those functions against data in memory. THESE tests are about
 * the write path: that `createLink` asks them at all, that it asks them of the real stores, and
 * that a refusal names the records rather than saying "not allowed".
 *
 * The pipeline test is the one that would catch the plausible mistake. A block is a step of its
 * pipeline with NO LINK SAYING SO, so a rule written from the links table alone would let a block
 * be given a second parent and report it as its first.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(() => {
  t.close()
})

function record(kind: 'module' | 'task' | 'pipeline' | 'note', title: string): string {
  return t.api.createRecord({ workspaceId: 'default', kind, title, actor: t.api.HUMAN }).id
}

function partOf(fromId: string, toId: string): { id: string } {
  return t.api.createLink({ fromId, toId, type: 'part_of', actor: t.api.HUMAN })
}

/**
 * Every stored link row, straight out of the table, so a refusal cannot be believed on trust.
 *
 * SORTED HERE. The order rows come back in is SQLite's and is not a fact the product states, so a
 * test that compared the list as it arrived would pass or fail on something nobody decided.
 */
function storedLinks(): { from_id: string; to_id: string; type: string }[] {
  const rows = t.client.sqlite.prepare('SELECT from_id, to_id, type FROM links').all() as {
    from_id: string
    to_id: string
    type: string
  }[]
  return rows.sort((a, b) => `${a.from_id}${a.to_id}`.localeCompare(`${b.from_id}${b.to_id}`))
}

/**
 * The rows that were not in the table when this case began. A shared office keeps every earlier
 * case's links, so a case reads the whole table and takes what its own writes added, rather than
 * adding a filter to the reading.
 */
function linksAddedSince(before: ReturnType<typeof storedLinks>): ReturnType<typeof storedLinks> {
  const key = (link: { from_id: string; to_id: string; type: string }): string => `${link.from_id} ${link.to_id} ${link.type}`
  const was = new Set(before.map(key))
  return storedLinks().filter((link) => !was.has(key(link)))
}

describe('an ordinary part_of link is still written', () => {
  it('files a task inside a module, and another task inside the same module', () => {
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const mount = record('task', 'Print the mount')
    const wiring = record('task', 'Run the wiring')

    partOf(mount, gripper)
    partOf(wiring, gripper)

    expect(linksAddedSince(before)).toEqual(
      [
        { from_id: mount, to_id: gripper, type: 'part_of' },
        { from_id: wiring, to_id: gripper, type: 'part_of' },
      ].sort((a, b) => `${a.from_id}${a.to_id}`.localeCompare(`${b.from_id}${b.to_id}`)),
    )
  })

  it('answers the same link asked for twice with the one row, rather than refusing it', () => {
    // THE ORDER OF THE CHECKS, PROVED. Asking again is idempotent and was before this pass. If the
    // containment questions were asked before the "this link already exists" branch, the second
    // request would be refused for a parent the record got from the very link being asked for.
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const mount = record('task', 'Print the mount')
    const first = partOf(mount, gripper)
    const again = partOf(mount, gripper)
    expect(again.id).toBe(first.id)
    expect(linksAddedSince(before)).toHaveLength(1)
  })

  it('leaves every other kind of link alone', () => {
    // Only `part_of` means containment. A record may relate to as many things as it likes.
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const arm = record('module', 'Arm')
    const mount = record('task', 'Print the mount')
    t.api.createLink({ fromId: mount, toId: gripper, type: 'relates_to', actor: t.api.HUMAN })
    t.api.createLink({ fromId: mount, toId: arm, type: 'relates_to', actor: t.api.HUMAN })
    expect(linksAddedSince(before)).toHaveLength(2)
  })
})

describe('a second parent is refused, and the refusal says what to remove', () => {
  it('names the record, the thing already holding it, and the link id', () => {
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const arm = record('module', 'Arm')
    const mount = record('task', 'Print the mount')
    const first = partOf(mount, gripper)

    const err = expectPanelError(t, () => partOf(mount, arm), 409)
    expect(err.message).toContain(`"Print the mount" (${mount})`)
    expect(err.message).toContain(`"Tray clamp" (${gripper})`)
    expect(err.message).toContain(first.id)
    expect(err.message).toContain('A record is part of one thing.')
    // Nothing was written: the first link, and only the first link.
    expect(linksAddedSince(before)).toEqual([{ from_id: mount, to_id: gripper, type: 'part_of' }])
  })

  it('counts a pipeline’s stored order as the first parent, though no link says so', () => {
    const before = storedLinks()
    const handover = record('pipeline', 'Transplant v2')
    const step = t.blocks.addBlock(handover, { name: 'Sense the pot', state: 'todo' }, t.api.HUMAN)
    const gripper = record('module', 'Tray clamp')

    const err = expectPanelError(t, () => partOf(step.block.id, gripper), 409)
    expect(err.message).toContain(`"Transplant v2" (${handover})`)
    expect(err.message).toContain('step 1')
    expect(linksAddedSince(before)).toEqual([])
  })

  it('says so when the thing already holding it has been deleted', () => {
    // Deleting never removes anything, so the containment is still stored and still counts. A
    // refusal naming a record the reader cannot find would be the puzzling half of that.
    const gripper = record('module', 'Tray clamp')
    const arm = record('module', 'Arm')
    const mount = record('task', 'Print the mount')
    partOf(mount, gripper)
    t.api.deleteRecord(gripper, t.api.HUMAN)

    const err = expectPanelError(t, () => partOf(mount, arm), 409)
    expect(err.message).toContain('has been deleted')
    expect(err.message).toContain(gripper)
  })
})

describe('a loop is refused, and the refusal names the whole ring', () => {
  it('refuses the link that would put two records inside each other', () => {
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const mount = record('task', 'Print the mount')
    partOf(mount, gripper)

    const err = expectPanelError(t, () => partOf(gripper, mount), 409)
    expect(err.message).toContain('would make a loop')
    expect(err.message).toContain(`"Print the mount" (${mount})`)
    expect(err.message).toContain(`"Tray clamp" (${gripper})`)
    expect(linksAddedSince(before)).toHaveLength(1)
  })

  it('refuses a ring three records long', () => {
    const before = storedLinks()
    const arm = record('module', 'Arm')
    const gripper = record('module', 'Tray clamp')
    const mount = record('task', 'Print the mount')
    partOf(mount, gripper)
    partOf(gripper, arm)

    const err = expectPanelError(t, () => partOf(arm, mount), 409)
    expect(err.message).toContain('would make a loop')
    expect(err.message).toContain(arm)
    expect(err.message).toContain(gripper)
    expect(err.message).toContain(mount)
    expect(linksAddedSince(before)).toHaveLength(2)
  })

  it('reports the loop when the same link is also a second parent', () => {
    // Both refusals are true of this link. The loop is the bigger fact and is the one reported:
    // told only about the second parent, the reader would remove one link and still have the ring.
    const before = storedLinks()
    const gripper = record('module', 'Tray clamp')
    const arm = record('module', 'Arm')
    const mount = record('task', 'Print the mount')
    partOf(arm, gripper)
    partOf(mount, arm)

    const err = expectPanelError(t, () => partOf(arm, mount), 409)
    expect(err.message).toContain('would make a loop')
    expect(linksAddedSince(before)).toHaveLength(2)
  })
})
