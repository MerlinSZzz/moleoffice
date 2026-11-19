// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUTTING AN EARLIER REVISION BACK IS A SECOND DOOR INTO WRITES, AND IT MUST BE THE SAME DOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `restoreRevision` writes nothing itself. It calls `patchRecord`, the function an ordinary PATCH
 * calls, so every rule a patch is refused by refuses a restore too. That is the design, and it is
 * only worth anything if two things hold:
 *
 *   1. Every rule really is on `patchRecord`. A rule that lives on a route, or on the block verbs,
 *      or in the browser, is a rule the restore walks straight past. Three of the defects below are
 *      exactly that: a guard on `PUT /api/records/:id/blocks` that `patchRecord` did not have.
 *   2. The restore's REPLY says what really happened. It used to work out what changed by comparing
 *      the ledger with the ledger, throw away the list of block titles it had moved, say nothing
 *      about what the record still wanted, and claim a revision number on a write that did not
 *      happen.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * The ledger having one row per write is tests/revision-ledger.test.ts. The ledger agreeing with
 * the change log is tests/revision-ledger-agrees-with-the-change-log.test.ts. This file is about
 * the restore being refused what a patch is refused, and about its reply being true.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, apiApp, at, expectPanelError, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** The three headers the browser sends on every write. src/web/api.ts sets them. */
const asHuman = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'content-type': 'application/json',
}
/** A request that says nothing about who is asking. This is what owner decision §36 is about. */
const saysNothing = { 'x-mole-office-workspace': 'default', 'content-type': 'application/json' }

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

type Ledger = typeof import('../src/server/lib/revisions.ts')
const ledger = async (): Promise<Ledger> => await import('../src/server/lib/revisions.ts')

/** The revision rows of one record, read with SQL so a reader that invented one cannot pass. */
function stored(recordId: string): { seq: number; op: string; title: string }[] {
  return t.client.sqlite
    .prepare('SELECT seq, op, title FROM revisions WHERE record_id = ? ORDER BY seq')
    .all(recordId) as { seq: number; op: string; title: string }[]
}

function errorOf(res: { body: string }): string {
  return (JSON.parse(res.body) as { error?: string }).error ?? '(the reply carried no error key)'
}

/** The compare-and-set token a read of the record hands back, asked for the way a caller asks. */
async function versionOf(recordId: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: asHuman })
  return (res.json() as { version: string }).version
}

/** A pipeline with `count` blocks, and its own title, so a failure names the test that made it. */
function aPipelineWith(count: number, title: string): { pipeline: string; blocks: string[] } {
  const pipeline = t.api.createRecord({
    workspaceId: 'default',
    kind: 'pipeline',
    title,
    data: { blockIds: [] },
    actor: t.api.HUMAN,
  })
  const blocks: string[] = []
  for (let i = 0; i < count; i += 1) {
    blocks.push(t.blocks.addBlock(pipeline.id, { name: `step ${i + 1}`, state: 'todo' }, t.api.HUMAN).block.id)
  }
  return { pipeline: pipeline.id, blocks }
}

// ==================================================== 1. a pipeline's order keeps its blocks

describe('an order that leaves out a live block is refused, whichever door it comes through', () => {
  it('refuses a restore that would drop the blocks a pipeline holds now', async () => {
    // Revision 1 is the pipeline with an empty order. Two blocks were added after it, so putting
    // revision 1 back means writing an order that names neither.
    const { pipeline, blocks } = aPipelineWith(2, 'H3 pipe')
    const before = stored(pipeline)

    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${pipeline}/revisions/1/restore`,
      headers: asHuman,
      payload: {},
    })

    expect(res.statusCode, 'a restore emptied a pipeline and left its blocks behind').toBe(400)
    expect(errorOf(res)).toContain('leaves out 2 of this pipeline')
    for (const id of blocks) expect(errorOf(res)).toContain(`DELETE /api/records/${pipeline}/blocks/${id}`)
    // NOTHING WAS WRITTEN. The refusal happens before the write, and the whole restore is one
    // transaction, so the order, the blocks and the ledger are all exactly as they were.
    expect(t.api.getRecord(pipeline)?.data).toEqual({ blockIds: blocks })
    expect(stored(pipeline)).toEqual(before)
    for (const id of blocks) expect(t.api.getRecord(id)?.deletedAt).toBeNull()
  })

  it('refuses the same drop through the ordinary PATCH door, in the same words', async () => {
    // The restore is a patch underneath, so this is the same rule reached the other way. Both
    // sentences come from one function; if they ever differ, one of them is a copy.
    const { pipeline, blocks } = aPipelineWith(2, 'H3 patch')

    const wholesale = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline}`,
      headers: asHuman,
      payload: { data: { blockIds: [] } },
    })
    const merged = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline}`,
      headers: asHuman,
      payload: { dataPatch: { blockIds: [blocks[0]] } },
    })

    expect(wholesale.statusCode).toBe(400)
    expect(errorOf(wholesale)).toContain('leaves out 2 of this pipeline')
    // A MERGE PATCH IS THE SAME WRITE. Checking the wholesale path only would leave a second way in.
    expect(merged.statusCode).toBe(400)
    expect(errorOf(merged)).toContain('leaves out 1 of this pipeline')
    expect(t.api.getRecord(pipeline)?.data).toEqual({ blockIds: blocks })
  })

  it('refuses a write that removes the order altogether, which leaves out every block', async () => {
    // The check used to run only when the arriving `data` carried a `blockIds` ARRAY, so a write
    // that took the key away entirely walked past it. Both of these emptied a pipeline with a 200
    // and left its blocks alive and listed by nothing.
    const { pipeline, blocks } = aPipelineWith(2, 'H3 no order at all')

    const wholesale = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline}`,
      headers: asHuman,
      payload: { data: {} },
    })
    const removedByMerge = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline}`,
      headers: asHuman,
      payload: { dataPatch: { blockIds: null } },
    })

    expect(wholesale.statusCode, 'a data with no order in it emptied the pipeline').toBe(400)
    expect(errorOf(wholesale)).toContain('leaves out 2 of this pipeline')
    expect(removedByMerge.statusCode, 'a merge that deleted the order emptied the pipeline').toBe(400)
    expect(errorOf(removedByMerge)).toContain('leaves out 2 of this pipeline')
    expect(t.api.getRecord(pipeline)?.data).toEqual({ blockIds: blocks })
  })

  it('leaves a badly shaped order to the field check, which names the field', async () => {
    // A `blockIds` that is not a list of ids is a shape mistake. Answering it with "you left out 2
    // blocks" would send the reader to the wrong problem, so the field check speaks instead.
    const { pipeline } = aPipelineWith(1, 'H3 wrong shape')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipeline}`,
      headers: asHuman,
      payload: { data: { blockIds: 'nope' } },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('data.blockIds must be a list of string')
  })

  it('still lets the block verb take a block out, because that verb deletes it', async () => {
    // The rule refuses leaving a block ALIVE and unlisted. Removing one does both halves in one
    // transaction, so it is not the act the rule is about — and if this ever fails, the fix above
    // has made removing a block impossible rather than making it honest.
    const { pipeline, blocks } = aPipelineWith(2, 'H3 remove')

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/records/${pipeline}/blocks/${blocks[1]}`,
      headers: asHuman,
    })

    expect(res.statusCode, errorOf(res)).toBe(200)
    expect(t.api.getRecord(pipeline)?.data).toEqual({ blockIds: [blocks[0]] })
    expect(t.api.getRecord(String(blocks[1]))?.deletedAt).not.toBeNull()
  })

  it('checks the order a KIND CHANGE installs, which is the kind the record is becoming', async () => {
    // The check used to ask about the kind the record HAS, so a record turning INTO a pipeline
    // never reached it and brought whatever `blockIds` it was carrying with it.
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note carrying an order',
      data: { body: 'a', extra: { blockIds: ['a-record-that-does-not-exist'] } },
      actor: t.api.HUMAN,
    })

    const becoming = await app.inject({
      method: 'PATCH',
      url: `/api/records/${note.id}`,
      headers: asHuman,
      payload: { kind: 'pipeline' },
    })

    expect(becoming.statusCode, 'a kind change installed an order nothing checked').toBe(400)
    expect(errorOf(becoming)).toContain('a-record-that-does-not-exist')
    expect(errorOf(becoming)).toContain('no record has that id')
    // Nothing was written: it is still a note, with the data it had.
    const after = t.api.getRecord(note.id)
    expect(after?.kind).toBe('note')
    expect(after?.data).toEqual({ body: 'a', extra: { blockIds: ['a-record-that-does-not-exist'] } })
  })
})

// ==================================================== 2. the reply says what really happened

describe('what a restore answers with', () => {
  it('moves no block title, because putting a pipeline title back is one record changing', async () => {
    // THIS TEST SAID THE OPPOSITE UNTIL 6 SEPTEMBER 2026. A block's title carried its pipeline's,
    // so putting an earlier pipeline title back rewrote every block title with it, and the reply
    // had to name all of them. A decision reversed that: a block's title is its own
    // name and a pipeline rename drags nothing along.
    const { pipeline, blocks } = aPipelineWith(2, 'H3 titles')
    const beforeRename = stored(pipeline).length
    t.api.patchRecord(pipeline, { title: 'H3 titles renamed' }, t.api.HUMAN)
    expect(t.api.getRecord(String(blocks[0]))?.title).toBe('step 1')

    const put = (await ledger()).restoreRevision(pipeline, beforeRename, t.api.HUMAN)

    expect(t.api.getRecord(pipeline)?.title).toBe('H3 titles')
    expect(t.api.getRecord(String(blocks[0]))?.title).toBe('step 1')
    expect(t.api.getRecord(String(blocks[1]))?.title).toBe('step 2')
    expect(put.note).not.toContain('block title')
  })

  it('says what the record still wants, as every other write path does', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'a module with no reason yet',
      data: { parts: [] },
      actor: t.api.HUMAN,
    })
    // Revision 2 fills the missing field in. Putting revision 1 back takes it out again.
    const filled = t.api.patchRecord(m.id, { dataPatch: { context: 'why this module exists at all' } }, t.api.HUMAN)
    expect(filled.incomplete).toEqual([])

    const put = (await ledger()).restoreRevision(m.id, 1, t.api.HUMAN)

    expect(put.incomplete.map((i) => i.path)).toEqual(['data.context'])
    expect(put.note).toContain('INCOMPLETE')
    expect(put.note).toContain('data.context')
    // The reply describes the record that ended up stored, not what the restore was asked for. A
    // read of the record answers with the same list, out of the same function.
    const read = await app.inject({ method: 'GET', url: `/api/records/${m.id}`, headers: asHuman })
    expect((read.json() as { incomplete: { path: string }[] }).incomplete.map((i) => i.path)).toEqual([
      'data.context',
    ])
  })

  it('works out what changed from the RECORD, never from the ledger against itself', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note',
      summary: 'the wording the record really holds',
      data: { body: 'x' },
      actor: t.api.HUMAN,
    })
    // A LEDGER ROW THAT DOES NOT DESCRIBE THE RECORD, written straight into the table the way
    // tests/helpers.ts builds a settling link the gate refuses. An import, an archive restored over
    // the database and a raw-SQL data migration all produce this, and two of them exist today.
    const stamp = t.api.localStamp(new Date())
    t.client.sqlite
      .prepare(
        'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, op, actor_type, actor_id, ' +
          'session_id, at, note, kind, title, summary, data, deleted_at) VALUES ' +
          `(?, ?, 'default', 2, 'deadbeef', 'update', 'human', '${THE_TEST_OFFICES_OWNER.id}', NULL, ?, NULL, 'note', ?, ?, ?, NULL)`,
      )
      .run('rev-by-hand', m.id, stamp, 'a note', 'a wording the record never held', JSON.stringify({ body: 'x' }))

    const put = (await ledger()).restoreRevision(m.id, 1, t.api.HUMAN)

    // Revision 1 is what the record holds, so nothing moved. The old reading compared the newest
    // ROW with the newest row and reported `summary` as moved, naming a `before` value the record
    // never held at any moment.
    expect(put.changed).toEqual([])
    expect(put.note).not.toContain('a wording the record never held')
    expect(t.api.getRecord(m.id)?.summary).toBe('the wording the record really holds')
  })

  it('counts the revisions it wrote rather than assuming a kind change writes two', async () => {
    // Restoring across a kind change sends the kind first and the content second, so it CAN write
    // two revisions — and whether the second one writes anything at all depends on what the kind
    // change left behind. The number is therefore a measurement. It used to be the constant 2.
    //
    // BOTH CASES ARE HERE, because one of them alone would let the constant pass. A note carrying a
    // `body` has that field moved into `extra` on the way to a task and brought home on the way
    // back, so the content write really happens; a note carrying nothing has no field to move, so
    // the kind write is the only one and the constant would say two.
    async function restoreAcrossAKindChange(data: Record<string, unknown>, title: string): Promise<number> {
      const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title, data, actor: t.api.HUMAN })
      t.api.patchRecord(note.id, { kind: 'task' }, t.api.HUMAN)
      const before = stored(note.id).length

      const put = (await ledger()).restoreRevision(note.id, 1, t.api.HUMAN)

      const written = stored(note.id).length - before
      expect(put.revisionsWritten, 'the reply must count what the ledger really gained').toBe(written)
      expect(put.newSeq).toBe(at(stored(note.id), stored(note.id).length - 1, 'revision').seq)
      expect(put.throughKindChange).toEqual({ from: 'task', to: 'note' })
      expect(t.api.getRecord(note.id)?.kind).toBe('note')
      return written
    }

    expect(await restoreAcrossAKindChange({ body: 'the body' }, 'a note with a body')).toBe(2)
    expect(await restoreAcrossAKindChange({}, 'a note with nothing in it')).toBe(1)
  })
})

// ==================================================== 3. a restore that changes nothing

describe('a restore that changes nothing', () => {
  it('writes nothing at all and does not move the record up the recently-changed lists', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note nobody has edited',
      data: { body: 'x' },
      actor: t.api.HUMAN,
    })
    const before = t.api.getRecord(m.id)
    const rows = stored(m.id)

    const put = (await ledger()).restoreRevision(m.id, 1, AGENT)

    // `updatedAt` is the answer to "when did this last change" and the order the home page lists
    // things in. A restore that changed nothing used to stamp it, so an agent could push any record
    // to the top of every list, any number of times, while the reply said nothing had moved.
    expect(t.api.getRecord(m.id)?.updatedAt).toBe(before?.updatedAt)
    expect(stored(m.id), 'a write that changed nothing wrote a revision').toEqual(rows)
    expect(put.revisionsWritten).toBe(0)
    expect(put.newSeq).toBeNull()
    expect(put.changed).toEqual([])
    expect(put.note).toContain('NOTHING WAS WRITTEN')
    // AND THE REPLY DOES NOT THEN CONTRADICT ITSELF. It used to end "The ledger records it as: …"
    // beside its own sentence saying nothing was written, quoting a note prepared for a write that
    // never happened. Two sentences, one of them false.
    expect(put.note, 'the reply says nothing was written and then quotes the ledger row').not.toContain(
      'The ledger records it as',
    )
  })

  it('says the same through the ordinary PATCH door', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note',
      summary: 'a summary',
      data: { body: 'x' },
      actor: t.api.HUMAN,
    })
    const before = t.api.getRecord(m.id)
    const rows = stored(m.id)

    // The wholesale path used to be exempt from this rule, on the ground that a caller sending
    // `data` should see the behaviour it always had. That is one rule with two answers, and the
    // restore is the write that made the difference visible.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${m.id}`,
      headers: asHuman,
      payload: { title: 'a note', summary: 'a summary', data: { body: 'x' } },
    })

    expect(res.statusCode).toBe(200)
    expect(t.api.getRecord(m.id)?.updatedAt).toBe(before?.updatedAt)
    expect(stored(m.id)).toEqual(rows)

    // AND THE REPLY SAYS WHICH OF THE TWO IT WAS. Not writing is right; saying nothing about it is
    // not. These two replies used to be byte-identical, so a caller could not tell "I set the title
    // to B" from "the title was already B". `newSeq` is the word the restore reply already uses for
    // this fact, so there is one vocabulary rather than two.
    expect((res.json() as { newSeq: number | null }).newSeq, 'a PATCH that wrote nothing claimed a revision').toBeNull()

    const wrote = await app.inject({
      method: 'PATCH',
      url: `/api/records/${m.id}`,
      headers: asHuman,
      payload: { title: 'a note, renamed' },
    })
    expect(wrote.statusCode).toBe(200)
    expect(
      (wrote.json() as { newSeq: number | null }).newSeq,
      'a PATCH that really wrote did not name the revision it wrote',
    ).toBe(at(stored(m.id), stored(m.id).length - 1, 'revision').seq)
  })
})

// ==================================================== 4. the caller may ask for the strict door

describe('a caller that wants the compare-and-set can ask for it', () => {
  it('takes ifVersion in the body and refuses a restore built against a version that has moved', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a contested note',
      data: { body: 'first' },
      actor: t.api.HUMAN,
    })
    t.api.patchRecord(m.id, { data: { body: 'second' } }, t.api.HUMAN)
    const stale = await versionOf(m.id)
    // Somebody else writes between the caller's read and its restore.
    t.api.patchRecord(m.id, { data: { body: 'somebody else wrote this' } }, t.api.HUMAN)

    const refused = await app.inject({
      method: 'POST',
      url: `/api/records/${m.id}/revisions/1/restore`,
      headers: asHuman,
      payload: { ifVersion: stale },
    })

    expect(refused.statusCode, 'a stale restore was allowed to overwrite a write it never saw').toBe(409)
    expect(errorOf(refused)).toContain('has changed since you read it')
    expect(t.api.getRecord(m.id)?.data).toEqual({ body: 'somebody else wrote this' })

    // With the version the record really holds, the same request goes through.
    const fresh = await versionOf(m.id)
    const allowed = await app.inject({
      method: 'POST',
      url: `/api/records/${m.id}/revisions/1/restore`,
      headers: asHuman,
      payload: { ifVersion: fresh },
    })
    expect(allowed.statusCode, errorOf(allowed)).toBe(200)
    expect(t.api.getRecord(m.id)?.data).toEqual({ body: 'first' })
  })

  it('still refuses a key that is not part of a restore, so the body stays closed', async () => {
    const m = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note',
      data: { body: 'x' },
      actor: t.api.HUMAN,
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${m.id}/revisions/1/restore`,
      headers: asHuman,
      payload: { data: { body: 'anything I like' } },
    })
    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('data')
  })
})

// ==================================================== 5. the gate, asked once and in one place

describe('who may write a decision, asked by one function', () => {
  /**
   * A decision with two revisions, so there is an earlier one to put back, AND THE TWO DIFFER IN
   * THE CORE.
   *
   * The second revision used to change the summary. Criterion P76 of 13 September makes the summary
   * one of the notes around a decision, open to any agent, so putting the earlier version back
   * moved nothing an agent may not move and was rightly allowed — which left the case below
   * asserting a refusal the product no longer owes. The second revision now changes the words why,
   * which is the decision itself, so the restore really does reach for the core.
   */
  function aDecision(): string {
    const d = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'a decision only a person may write',
      data: { decided_on: '2026-08-14', because: 'it was the cheapest of the three' },
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(d.id, { data: { decided_on: '2026-08-14', because: 'and the jig was already cut' } }, t.api.HUMAN)
    return d.id
  }

  /** A decision whose two revisions differ only in a note, which any agent may put back. */
  function aDecisionWhoseNotesMoved(): string {
    const d = t.api.createRecord({
      workspaceId: 'default',
      kind: 'decision',
      title: 'a decision whose notes somebody tidied',
      data: { decided_on: '2026-08-14', because: 'it was the cheapest of the three' },
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(d.id, { summary: 'the reason, written out' }, t.api.HUMAN)
    return d.id
  }

  it('refuses a request that sends no actor headers, on the restore route and on PATCH alike', async () => {
    const id = aDecision()
    const rows = stored(id)

    const restoring = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/1/restore`,
      headers: saysNothing,
      payload: {},
    })
    const patching = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: saysNothing,
      payload: { summary: 'written by nobody in particular' },
    })
    const deleting = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: saysNothing })

    // Owner decision §36: an absent header is not evidence that a person made the write, and a
    // decision is a governance act. The DELETE has always said so; the other two used to answer 200
    // because `patchRecord` had its own copy of the rule with this half missing.
    expect(restoring.statusCode, 'a header-less request rewrote a decision through the restore route').toBe(403)
    expect(patching.statusCode, 'a header-less request rewrote a decision through PATCH').toBe(403)
    expect(deleting.statusCode).toBe(403)
    // ONE SENTENCE, OUT OF ONE FUNCTION. If these ever differ, the rule has been written twice again.
    expect(errorOf(restoring)).toBe(errorOf(deleting))
    expect(errorOf(patching)).toBe(errorOf(deleting))
    expect(errorOf(restoring)).toContain('sent no actor headers')
    expect(stored(id)).toEqual(rows)
    // NOTHING MOVED. The fixture's second revision changes the words why, so this is the field to
    // read back: a header-less write that got through would have put the first version's words here.
    expect((t.api.getRecord(id)?.data as { because: string }).because).toBe('and the jig was already cut')
  })

  it('refuses a header-less request on the three paths that used to ask about actor.type alone', async () => {
    // MEASURED BEFORE THE FIX: this exact POST answered 201, so a decision could be filed with
    // nothing in the log saying who filed it. `createRecordWithReport`, `patchChecklistItem` and
    // `restoreRecord` each carried their own copy of the human-only rule, and each copy asked only
    // whether the actor was human — which a request that sends no actor headers is. Owner decision
    // §36: an absent header is not evidence that a person made the write.
    const filing = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: saysNothing,
      payload: { kind: 'decision', title: 'filed by nobody' },
    })
    expect(filing.statusCode, 'a header-less request filed a decision').toBe(403)
    expect(errorOf(filing)).toContain('sent no actor headers')

    // The checklist door. A decision holds no checklist, so this request cannot succeed either way —
    // what changed is the ANSWER, from "only a module has a checklist" to "you have not said who is
    // asking", which is the question that has to be settled first.
    const id = aDecision()
    const ticking = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}/checklist/anything`,
      headers: saysNothing,
      payload: { state: 'done' },
    })
    expect(ticking.statusCode, 'a header-less request reached the checklist write on a decision').toBe(403)
    expect(errorOf(ticking)).toContain('sent no actor headers')

    // AND THE UNDELETE, ASKED OF THE LIBRARY. The route has its own `assertMayWrite` before its
    // no-op shortcut, so over HTTP this was already refused; the copy inside `restoreRecord` was the
    // one still short of half the rule, and the seed, the importer and the tests reach it directly.
    t.api.deleteRecord(id, t.api.HUMAN)
    const undoing = expectPanelError(
      t,
      () => t.api.restoreRecord(id, { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: false }),
      403,
    )
    expect(undoing.message).toContain('sent no actor headers')
    expect(t.api.getRecord(id)?.deletedAt, 'a refused restore brought the decision back anyway').not.toBeNull()
  })

  it('refuses a header-less request turning an ordinary record INTO a decision', async () => {
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note somebody wants filed as a decision',
      data: { body: 'x' },
      actor: t.api.HUMAN,
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${note.id}`,
      headers: saysNothing,
      payload: { kind: 'decision' },
    })

    expect(res.statusCode, 'a header-less request filed a decision by changing a kind').toBe(403)
    expect(errorOf(res)).toContain('sent no actor headers')
    expect(t.api.getRecord(note.id)?.kind).toBe('note')
  })

  it('does not lock the browser out: the headers it sends are accepted', async () => {
    // src/web/api.ts sets x-mole-office-actor-type and x-mole-office-actor-id on every request. If this test
    // ever fails, the rule above has stopped the owner editing their own decisions.
    const id = aDecision()
    const res = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/1/restore`,
      headers: asHuman,
      payload: { note: 'the summary was written too early' },
    })
    expect(res.statusCode, errorOf(res)).toBe(200)
    expect(t.api.getRecord(id)?.summary).toBeNull()
  })

  it('still refuses an agent that DID say who it is, which is the older half of the rule', async () => {
    const id = aDecision()
    const L = await ledger()
    const refusal = expectPanelError(t, () => L.restoreRevision(id, 1, AGENT), 403)
    expect(refusal.message).toContain('agent')
    // THE SAME WORDS AN ORDINARY EDIT IS REFUSED IN, from the same line of code — asked through the
    // title, which is the core. Criterion P76 split a decision into the decision itself and the
    // notes around it, and the summary this case used to use is one of the notes, open to any agent
    // now. Putting a whole earlier revision back moves the core, so it stays refused, and the point
    // of this case — one rule, one line, one sentence — is unchanged.
    const patching = expectPanelError(t, () => t.api.updateRecord(id, { title: 'an agent tries' }, AGENT), 403)
    expect(refusal.message).toBe(patching.message)
  })

  it('lets an agent put back a version that moves only the notes, which is the other half of P76', async () => {
    // THE NEW TRUTH BESIDE THE OLD ONE. The notes around a decision are open to any agent, so a
    // restore that moves only a note is not a reach for the core and is not refused. Without this
    // case the pair above would pass just as well if the guard refused every restore.
    const id = aDecisionWhoseNotesMoved()
    const L = await ledger()
    L.restoreRevision(id, 1, AGENT)
    // The note went back and the core never moved, which is why nothing refused it.
    expect(t.api.getRecord(id)?.summary).toBeNull()
    expect((t.api.getRecord(id)?.data as { because: string }).because).toBe('it was the cheapest of the three')
  })
})
