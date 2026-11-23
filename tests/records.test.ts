// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Records: creating, naming, permissions, and the trail every write leaves behind.
 *
 * These call src/server/lib/records.ts directly. There is no HTTP here on purpose — if one of
 * these fails, the fault is in the core, not in a route or in the browser.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT, expectPanelError, freshDb, one, type TestDb } from './helpers.ts'
import type { PanelRecord } from '@shared/types.ts'
// Whether a promise is kept is decided in one place. These tests read the result back through it
// rather than through their own idea of what `done` means.
import { readFulfilment } from '@shared/work.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let workspaces: typeof import('../src/server/lib/workspaces.ts')

/**
 * EACH CASE GETS ITS OWN PROJECT, so a count or a list a case reads is its own. The one exception
 * is the seed script, which writes into the default project; those three cases say so.
 */
let WORKSPACE = 'default'
let caseNumber = 0
/** The office the file shares. The seed script needs a database nobody has written in, below. */
let theFilesOffice: TestDb

beforeAll(async () => {
  t = await freshDb()
  theFilesOffice = t
  workspaces = await import('../src/server/lib/workspaces.ts')
}, 60_000)

afterAll(() => {
  theFilesOffice.close()
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `records-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: WORKSPACE, title: `Records case ${String(caseNumber)}` })
})

describe('creating a record', () => {
  it('writes a create row in the change log, attributed to whoever did it', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'note',
      title: 'Tray clamp reprint at effort 12',
      summary: 'Reprinted the v3 shell after the effort 15 failure.',
      actor: AGENT,
    })

    const row = one(t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }), 'change row')
    expect(row.op).toBe('create')
    expect(row.actorType).toBe('agent')
    expect(row.actorId).toBe('claude-code')
    // The session is what lets a page link back to the agent run that touched it.
    expect(row.sessionId).toBe('sess-test')
    expect(row.newValue).toBe('Tray clamp reprint at effort 12')
  })

  it('records the human as the actor when the human does it', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const row = one(t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }), 'change row')
    expect(row.actorType).toBe('human')
    expect(row.actorId).toBe(THE_TEST_OFFICES_OWNER.id)
    expect(row.sessionId).toBeNull()
  })

  it('refuses an empty title, because a title is how a record is addressed', () => {
    const err = expectPanelError(t, () => t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: '   ', actor: t.api.HUMAN }), 400)
    expect(err.message).toMatch(/title/i)
  })
})

/**
 * THIS BLOCK PINNED THE OPPOSITE RULE UNTIL 17 AUGUST 2026.
 *
 * It was headed "titles are unique in a workspace" and its first test asserted that a second record
 * with a title another record already held came back a 400 saying so. The rule changed:
 * **ID is identity. Title is presentation. Titles may repeat.** The test is rewritten rather than
 * deleted, so the file says what the rule is now instead of falling silent about it.
 * `tests/title-identity.test.ts` holds the whole of the new rule; this keeps the part that belongs
 * beside the other create tests.
 */
describe('a title says what a record is called, and an id says which record it is', () => {
  it('files a second record with the same title, and says what else is called that', () => {
    const first = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Close-up camera',
      actor: t.api.HUMAN,
    })

    const second = t.api.createRecordWithReport({
      workspaceId: WORKSPACE,
      kind: 'task',
      title: 'Close-up camera',
      data: { state: 'todo' },
      actor: t.api.HUMAN,
    })

    // Written, and a different record. Nothing was merged into anything.
    expect(second.record.id).not.toBe(first.id)
    // And the caller is told, by id and kind, which is all that can tell them apart.
    expect(second.sameTitle?.map((r) => r.id)).toEqual([first.id])
    expect(second.sameTitle?.[0]?.kind).toBe('module')

    expect(t.api.listRecords({ workspaceId: WORKSPACE }).map((r) => r.title)).toEqual([
      'Close-up camera',
      'Close-up camera',
    ])
  })

  it('lets the same title exist in a different workspace', () => {
    t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const other = t.api.createRecord({
      kind: 'module',
      title: 'Tray clamp',
      workspaceId: 'personal',
      actor: t.api.HUMAN,
    })
    expect(other.workspaceId).toBe('personal')
  })
})

describe('decisions are human-only', () => {
  it('refuses to let an agent create one, with 403 and an explanation', () => {
    const err = expectPanelError(
      t,
      () => t.api.createRecord({ workspaceId: WORKSPACE, kind: 'decision', title: 'Keep the CaP planner IK', actor: AGENT }),
      403,
    )
    // The refusal states the rule rather than just reporting a status, and it names the thing an
    // agent CAN do — filing the fork. Without that, a refused agent goes looking for a proposal
    // endpoint that has never existed.
    //
    // THE RULE CHANGED ON 27 AUGUST 2026 AND THIS CALL IS STILL REFUSED. It used to read "only the
    // human may create a decision"; an agent may now write one it can cite authority for, and this
    // one cites none — it sends no data at all. See tests/an-agent-may-decide-what-it-can-cite.ts.
    expect(err.message).toMatch(/`authority` is missing/i)
    expect(err.message).toContain('"kind":"proposal"')
    expect(t.api.listRecords({ workspaceId: WORKSPACE, kind: 'decision' })).toHaveLength(0)
  })

  it('refuses to let an agent change its core, with 403, and leaves it untouched', () => {
    const d = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Keep the recipe planner placement solver until the clamp reprint lands',
      summary: 'Do not swap the IK stack mid-experiment.',
      actor: t.api.HUMAN,
    })

    // THE TITLE IS THE CORE, and the core of a decision the person made is closed to every agent.
    // Criterion P76: the decision itself is the option taken, the words why, the title, and the
    // words added after the press. This case used to change the summary, which was refused when a
    // decision was one flat object; the summary is one of the notes now, so the refusal this case
    // is about is asked through the title.
    expectPanelError(t, () => t.api.updateRecord(d.id, { title: 'renamed by an agent' }, AGENT), 403)

    expect(t.api.getRecord(d.id)?.title).toBe('Keep the recipe planner placement solver until the clamp reprint lands')
    // The refused write left no change row either.
    expect(t.api.listChanges({ workspaceId: WORKSPACE, recordId: d.id })).toHaveLength(1)
  })

  it('lets an agent change the notes around one, and the change says who', () => {
    // THE OTHER HALF OF P76: the notes around a decision may be changed by any
    // agent, and every such change says who and when. The summary is a note.
    const d = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Keep the clamp reprint on the old jig',
      summary: 'Written by the owner.',
      actor: t.api.HUMAN,
    })

    t.api.updateRecord(d.id, { summary: 'an agent added where this was measured' }, AGENT)

    expect(t.api.getRecord(d.id)?.summary).toBe('an agent added where this was measured')
    const changes = t.api.listChanges({ workspaceId: WORKSPACE, recordId: d.id })
    expect(changes).toHaveLength(2)
    expect(JSON.stringify(changes)).toContain(AGENT.id)
  })

  /**
   * THE TWO CASES THIS BLOCK USED TO STOP SHORT OF.
   *
   * Until 2026-08-10 the rule was enforced on create and on change, and not on delete or restore.
   * The stages audit sent DELETE on a decision written by the person, as an agent, and got HTTP 200
   * with a change row reading `delete agent:audit-matrix`. The gap in the code and the gap in this
   * file were the same gap: these tests asserted create and change and stopped, so nothing failed.
   *
   * Soft delete is a write. The record leaves every listing and every page it is meant to be read
   * on, and only the change log still says it was ever there.
   */
  function humanDecision(): PanelRecord {
    return t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'decision',
      title: 'Stay on position control until the reprint is measured',
      summary: 'Changing controller and hardware in the same week makes a regression impossible to attribute.',
      actor: t.api.HUMAN,
    })
  }

  it('refuses to let an agent delete one, with 403, and leaves it readable', () => {
    const d = humanDecision()

    const err = expectPanelError(t, () => t.api.deleteRecord(d.id, AGENT), 403)
    expect(err.message).toMatch(/only the human may delete a decision/i)
    // The refusal is usable, not just a status: it carries the note request and the id to link it to.
    expect(err.message).toContain('"kind":"proposal"')
    expect(err.message).toContain(`"toId":"${d.id}"`)

    expect(t.api.getRecord(d.id)?.deletedAt).toBeNull()
    expect(t.api.listRecords({ workspaceId: WORKSPACE, kind: 'decision' })).toHaveLength(1)
    // And no `delete agent:…` row on a decision the human wrote, which is what the audit measured.
    expect(t.api.listChanges({ workspaceId: WORKSPACE, recordId: d.id }).filter((c) => c.op === 'delete')).toHaveLength(0)
  })

  it('refuses to let an agent restore one the human deleted, and it stays deleted', () => {
    const d = humanDecision()
    t.api.deleteRecord(d.id, t.api.HUMAN)
    const deletedAt = t.api.getRecord(d.id)?.deletedAt

    const err = expectPanelError(t, () => t.api.restoreRecord(d.id, AGENT), 403)
    expect(err.message).toMatch(/only the human may restore a decision/i)

    // Still deleted, with the same stamp: a restore that half-happened would put a decision the
    // human withdrew back in front of the reader as current.
    expect(t.api.getRecord(d.id)?.deletedAt).toBe(deletedAt)
    expect(t.api.listRecords({ workspaceId: WORKSPACE, kind: 'decision' })).toHaveLength(0)
  })

  it('refuses an agent deleting one that is ALREADY deleted, rather than answering that it worked', () => {
    const d = humanDecision()
    t.api.deleteRecord(d.id, t.api.HUMAN)

    // deleteRecord returns quietly when there is nothing to do. That return sits AFTER the guard on
    // purpose: whether a caller is allowed and whether the call would change anything are two
    // questions, and answering the second one first tells an agent it may delete decisions. The
    // next decision it meets would be a live one.
    expectPanelError(t, () => t.api.deleteRecord(d.id, AGENT), 403)
  })

  it('lets the human create, change, delete and restore one', () => {
    const d = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'decision', title: 'Use FAST-LIO2 for SLAM', actor: t.api.HUMAN })
    const updated = t.api.updateRecord(d.id, { summary: 'Chosen 2026-03: the IMU path is already validated.' }, t.api.HUMAN)
    expect(updated.summary).toMatch(/^Chosen 2026-03/)

    // The rule is about who is asking, not about the kind. A guard that refused everybody would
    // pass every assertion above and leave the human unable to withdraw their own decision.
    t.api.deleteRecord(d.id, t.api.HUMAN)
    expect(t.api.getRecord(d.id)?.deletedAt).not.toBeNull()
    expect(t.api.restoreRecord(d.id, t.api.HUMAN).deletedAt).toBeNull()
  })
})

describe('updating', () => {
  it('writes one change row per field changed', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'Tray clamp', summary: 'old summary', actor: t.api.HUMAN })

    t.api.updateRecord(rec.id, { title: 'Tray clamp (v3 shell)', summary: 'new summary' }, t.api.HUMAN)

    const updates = t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }).filter((c) => c.op === 'update')
    expect(updates).toHaveLength(2)
    // One row per field, so "what changed about this module" is answerable without diffing.
    expect(updates.map((c) => c.field).sort()).toEqual(['summary', 'title'])

    const titleRow = one(
      updates.filter((c) => c.field === 'title'),
      'title change row',
    )
    expect(titleRow.oldValue).toBe('Tray clamp')
    expect(titleRow.newValue).toBe('Tray clamp (v3 shell)')
  })

  it('writes nothing when a field is set to the value it already has', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: 'Run the rig_60mm wizard', actor: t.api.HUMAN })
    t.api.updateRecord(rec.id, { title: 'Run the rig_60mm wizard' }, t.api.HUMAN)
    expect(t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }).filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('records a data change as a single row holding the whole JSON', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'module',
      title: 'Close-up camera',
      data: { context: 'ZED mini on the right wrist', parts: [], paths: [] },
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(rec.id, { data: { context: 'ZED mini on the right wrist', parts: [], paths: [], summary: 'calibrated' } }, AGENT)

    const row = one(
      t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }).filter((c) => c.field === 'data'),
      'data change row',
    )
    expect(row.newValue).toContain('calibrated')
    expect(row.actorType).toBe('agent')
  })

  it('reports a missing record as 404 rather than pretending to succeed', () => {
    expectPanelError(t, () => t.api.updateRecord('no-such-id', { summary: 'x' }, t.api.HUMAN), 404)
  })
})

describe('soft delete', () => {
  it('hides the record from listings but keeps it retrievable, and logs who deleted it', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'claim', title: 'Effort 12 grip force is enough', actor: t.api.HUMAN })

    t.api.deleteRecord(rec.id, t.api.HUMAN)

    expect(t.api.listRecords({ workspaceId: WORKSPACE })).toHaveLength(0)
    expect(t.api.listRecords({ workspaceId: WORKSPACE, includeDeleted: true })).toHaveLength(1)
    expect(t.api.getRecord(rec.id)?.deletedAt).not.toBeNull()

    const del = one(
      t.api.listChanges({ workspaceId: WORKSPACE, recordId: rec.id }).filter((c) => c.op === 'delete'),
      'delete change row',
    )
    expect(del.oldValue).toBe('Effort 12 grip force is enough')
  })

  it('brings the record back on restore', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'claim', title: 'Effort 12 grip force is enough', actor: t.api.HUMAN })
    t.api.deleteRecord(rec.id, t.api.HUMAN)
    const back = t.api.restoreRecord(rec.id, t.api.HUMAN)
    expect(back.deletedAt).toBeNull()
    expect(t.api.listRecords({ workspaceId: WORKSPACE })).toHaveLength(1)
  })
})

describe('listing', () => {
  it('filters by kind and puts the most recently touched first', () => {
    // EACH WRITE IN A SECOND OF ITS OWN, so the order is the clock's and not the ids' (wave 13y round 38).
    // updated_at is kept to the second, and the list puts records changed in the same second in id order.
    // The ids here are random, so when every write fell in one second the order was a coin toss.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 15, 9, 0, 0))
      const a = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
      vi.setSystemTime(new Date(2026, 9, 15, 9, 0, 1))
      t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: '夹具标定', actor: t.api.HUMAN })
      t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: 'Run the rig_60mm wizard', actor: t.api.HUMAN })

      const before = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'module' })
      expect(before.map((one) => one.title)).toEqual(['夹具标定', 'Tray clamp'])

      vi.setSystemTime(new Date(2026, 9, 15, 9, 0, 2))
      t.api.updateRecord(a.id, { summary: 'touched last' }, t.api.HUMAN)
      const modules = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'module' })
      expect(modules.map((one) => one.title)).toEqual(['Tray clamp', '夹具标定'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a non-Latin title exactly as written', () => {
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'module', title: '夹具标定', actor: t.api.HUMAN })
    expect(t.api.getRecordByTitle('夹具标定', WORKSPACE)?.id).toBe(rec.id)
  })
})

/**
 * Where a reader got to.
 *
 * The HTTP side is in tests/reading-api.test.ts. What is here is the one case that needs a
 * database with NOTHING in it: a reader who looks at an empty log. `lastChangeId` is null then,
 * and null there means "they looked and there was nothing to see", which is a different fact from
 * having no anchor at all. A reader that collapsed the two would tell somebody who has read
 * everything that they have read nothing.
 */
describe('an anchor taken when nothing has been written yet', () => {
  it('stores null for the last change seen, which is not the same as having no anchor', () => {
    expect(t.api.listChanges({ workspaceId: WORKSPACE })).toHaveLength(0)
    expect(t.api.getAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)).toBeNull()

    const moved = t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    expect(moved.anchor.lastChangeId).toBeNull()
    expect(moved.previous).toBeNull()

    // The row exists now, and it is not the same answer as before it existed.
    const stored = t.api.getAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    expect(stored?.lastChangeId).toBeNull()
    expect(stored?.lastSeenAt).toBe(moved.anchor.lastSeenAt)

    const reading = t.api.readingSinceAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    expect(reading.anchor).not.toBeNull()
    // An empty list, and it means "nothing has been written since" — which the note says in words
    // rather than leaving a reader to guess which kind of emptiness this is.
    expect(reading.changes).toEqual([])
    expect(reading.counts.sinceAnchor).toBe(0)
    expect(reading.note).toContain('nothing has been written since')
  })

  it('counts everything written afterwards, because all of it came after they looked', () => {
    t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    const rec = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'written after the anchor', actor: AGENT })

    const reading = t.api.readingSinceAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    expect(reading.counts.sinceAnchor).toBe(1)
    expect(one(reading.changes ?? [], 'change row since the anchor').recordId).toBe(rec.id)
  })

  it('keeps one anchor per reader, and nobody reads anybody else\'s', () => {
    t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    t.api.createRecord({ workspaceId: WORKSPACE, kind: 'note', title: 'written between two readers looking', actor: AGENT })
    t.api.moveAnchor('agent:claude-code', WORKSPACE)

    expect(t.api.readingSinceAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE).counts.sinceAnchor).toBe(1)
    expect(t.api.readingSinceAnchor('agent:claude-code', WORKSPACE).counts.sinceAnchor).toBe(0)
    // Moving one twice does not make two of it: the anchor is keyed by the reader.
    const second = t.api.moveAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE)
    expect(second.previous).not.toBeNull()
    expect(t.api.readingSinceAnchor(`human:${THE_TEST_OFFICES_OWNER.id}`, WORKSPACE).counts.sinceAnchor).toBe(0)
  })
})

/**
 * Recording that a promise was kept.
 *
 * THE FIELD ALWAYS EXISTED AND NOTHING EVER WROTE IT. `data.done` is declared in shared/kinds.ts
 * and read by every rule that decides what is still owed, and no interface, script or seed ever
 * set it — so every obligation in the database looked permanent, and an analysis of the product
 * concluded there was no way to record a kept promise at all. These tests are about the action
 * that writes it, and they read the result back through `readFulfilment` in shared/work.ts rather
 * than through their own idea of what "discharged" means.
 */
describe('discharging an obligation', () => {
  /** An obligation somebody outside is waiting for, still open. */
  function owed(title = 'Send the ESA milestone 2 section'): PanelRecord {
    return t.api.createRecord({ workspaceId: WORKSPACE,
      kind: 'obligation',
      title,
      data: { due: '2026-08-14', owedTo: 'the ESA grant review', state: 'open' },
      actor: t.api.HUMAN,
    })
  }

  it('writes done, fulfilledAt and fulfilledNote together, and the state that agrees with them', () => {
    const record = owed()
    const result = t.api.dischargeObligation(
      record.id,
      { note: 'Both pages are in the shared drive and the reviewer acknowledged them.', at: '2026-08-12 16:40' },
      t.api.HUMAN,
    )

    const data = result.record.data
    expect(data['done']).toBe(true)
    expect(data['fulfilledAt']).toBe('2026-08-12 16:40')
    expect(data['fulfilledNote']).toBe('Both pages are in the shared drive and the reviewer acknowledged them.')
    // `state` is written with them because shared/kinds.ts refuses a record where the two
    // disagree: `done: true` beside `state: "open"` is two opposite claims about one obligation.
    expect(data['state']).toBe('fulfilled')

    // And the shared reader — the one every panel uses — says the promise is kept.
    expect(readFulfilment(data)).toEqual({
      done: true,
      at: '2026-08-12 16:40',
      note: 'Both pages are in the shared drive and the reviewer acknowledged them.',
    })
    expect(result.alreadyDischarged).toBe(false)
  })

  it('leaves an ordinary trail: one change row per path that moved, attributed', () => {
    const record = owed()
    t.api.dischargeObligation(record.id, { note: 'Delivered on the 12th.' }, AGENT)

    const fields = t.api
      .listChanges({ workspaceId: WORKSPACE, recordId: record.id })
      .filter((row) => row.op === 'update')
      .map((row) => row.field)
    expect(fields.sort()).toEqual(['data.done', 'data.fulfilledAt', 'data.fulfilledNote', 'data.state'])

    const row = one(
      t.api.listChanges({ workspaceId: WORKSPACE, recordId: record.id }).filter((r) => r.field === 'data.done'),
      'the change row for data.done',
    )
    expect(row.actorType).toBe('agent')
    expect(row.newValue).toBe('true')
  })

  it('stamps the moment itself when the caller does not say when', () => {
    const record = owed()
    const result = t.api.dischargeObligation(record.id, { note: 'Handed over at the bench.' }, t.api.HUMAN)
    const at = result.fulfilment.at
    if (at === null) throw new Error('a discharge with no date is the thing this endpoint exists to write')
    // The stored local form, from the one stamp helper. Never a hand-built string.
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('says it stopped being owed, which is not the same as it having been met', () => {
    const record = owed()
    const result = t.api.dischargeObligation(
      record.id,
      { note: 'The review was cancelled, so nobody is waiting for it.', state: 'cancelled' },
      t.api.HUMAN,
    )
    expect(result.record.data['state']).toBe('cancelled')
    // Both words discharge it — that is readFulfilment's rule, not this file's.
    expect(readFulfilment(result.record.data).done).toBe(true)
  })

  it('writes nothing the second time, and says when it was discharged instead', () => {
    const record = owed()
    t.api.dischargeObligation(record.id, { note: 'Delivered.', at: '2026-08-12 16:40' }, t.api.HUMAN)
    const rowsAfterFirst = t.api.listChanges({ workspaceId: WORKSPACE, recordId: record.id }).length

    const again = t.api.dischargeObligation(record.id, { note: 'Delivered again?' }, t.api.HUMAN)

    expect(again.alreadyDischarged).toBe(true)
    expect(again.dataPatch).toBeNull()
    // The date of a promise kept last week is the one fact about it worth keeping, so a second
    // discharge does not move it to today.
    expect(again.record.data['fulfilledAt']).toBe('2026-08-12 16:40')
    expect(again.note).toContain('2026-08-12 16:40')
    expect(t.api.listChanges({ workspaceId: WORKSPACE, recordId: record.id })).toHaveLength(rowsAfterFirst)
  })

  it('refuses a record that is not an obligation, naming what it is', () => {
    const task = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'task', title: 'Run the rig_60mm wizard', actor: t.api.HUMAN })
    const err = expectPanelError(
      t,
      () => t.api.dischargeObligation(task.id, { note: 'done it' }, t.api.HUMAN),
      400,
    )
    expect(err.message).toContain('task')
    expect(t.api.getRecord(task.id)?.data['done']).toBeUndefined()
  })

  it('refuses a discharge with nothing said about what settled it', () => {
    const record = owed()
    const err = expectPanelError(
      t,
      () => t.api.dischargeObligation(record.id, { note: '   ' }, t.api.HUMAN),
      400,
    )
    expect(err.message).toContain('what settled it')
    // Nothing written: a discharge that half-happened would read as kept with no proof.
    expect(readFulfilment(t.api.getRecord(record.id)?.data).done).toBe(false)
  })

  it('refuses an id that names nothing, rather than answering cheerfully', () => {
    expectPanelError(t, () => t.api.dischargeObligation('nope', { note: 'x' }, t.api.HUMAN), 404)
  })
})

/**
 * The seed script lives in scripts/. That running it twice duplicates nothing is held by
 * tests/seed.test.ts, which runs it twice on a database of its own.
 *
 * Importing scripts/seed.ts runs the seed once; that is deliberate, it is a script.
 */
describe('the seed script', () => {
  /**
   * THE SEED NEEDS A DATABASE NOBODY HAS WRITTEN IN. It refuses to add its fixture content to a
   * database that already holds authored records, wherever they are filed, so these two cases
   * keep their own start. The block runs after the one before it has closed, and hands the file's
   * own office back when it ends.
   */
  beforeEach(async () => {
    t = await freshDb()
    WORKSPACE = 'default'
  })

  afterEach(() => {
    t.close()
  })

  afterAll(() => {
    t = theFilesOffice
  })

  it('preserves the seed’s explicit person move for an agent’s problem with unmade options', async () => {
    await import('../scripts/seed.ts')
    const problem = t.api.getRecordByTitle(
      'OCR runs out of memory on the 1889 double-width broadsheet pages, because each page is scanned as one image 14,000 pixels wide',
      WORKSPACE,
    )
    expect(problem?.data['whose_move']).toBe('person')
    expect(problem?.data['options']).toEqual(['split each double-width page into two before OCR', 'run OCR on tiles and join the text'])
    expect(t.api.listChanges({ workspaceId: WORKSPACE, recordId: problem!.id }).find((row) => row.op === 'create')).toMatchObject({
      actorType: 'agent',
      actorId: 'claude-code',
    })
  })

  it('produces the content the checkpoint review expects', async () => {
    await import('../scripts/seed.ts')

    const scanner = t.api.getRecordByTitle('Microfilm scanner station', WORKSPACE)
    expect(scanner?.kind).toBe('module')
    expect(JSON.stringify(scanner?.data)).toContain('R-1923-04 skipped 31 frames; rescan it after the spring is fitted')
    expect(JSON.stringify(scanner?.data)).toContain('/srv/courier-archive/scans/raw/')

    expect(t.api.getRecordByTitle('地名与主题索引', WORKSPACE)?.kind).toBe('module')
    expect(JSON.stringify(t.api.getRecordByTitle('Public search site', WORKSPACE)?.data)).toContain('Search by place, with the results on a map')

    // The retracted claim is deleted, not removed, so the link to it can be shown as broken.
    const retracted = t.api.getRecordByTitle('Default OCR settings reach 90 % word accuracy on every decade', WORKSPACE)
    expect(retracted?.deletedAt).not.toBeNull()

    // Both link queries have something to say about the seeded data.
    expect(t.api.unconsumed(WORKSPACE).map((r) => r.title)).toContain('Volunteers proofread 41 pages an hour on average')
    expect(t.api.unmetDependencies(WORKSPACE).map((u) => u.consumer.title)).toContain('Choose the confidence threshold for sending pages to proofreading')
  })
})
