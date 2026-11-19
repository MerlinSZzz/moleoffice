// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MAY NOT TAKE SOMEBODY'S EXISTING WRITING OFF A NORMAL READER'S SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE RULE IS SHAPED LIKE THIS
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/projections.md` §9.2 rule 3. `audience` is a way of taking a paragraph
 * off a page. A `report` is not a human-only kind — the owner's own criticism of this product's
 * direction is stored as one — so any caller with the three write headers can patch it. The rule is
 * monotone rather than a ban: an agent may mark blocks it is CREATING, anybody may REMOVE a mark,
 * and a person may do either.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTS, AND THE DIRECTION IT ASSERTS IN BOTH WAYS
 * ---------------------------------------------------------------------------------------
 *
 * A refusal that refuses everything is not a rule, it is an outage. So every refusal below has a
 * partner going the other way: the agent's own new marked block is stored, the removal is stored,
 * the person's raise is stored, and the restore is stored.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

const AGENT = { type: 'agent', id: 'claude-code' } as const
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

const block = (id: string, text: string, audience?: 'everyone' | 'developers') => ({
  id,
  type: 'text',
  text,
  ...(audience === undefined ? {} : { audience }),
})

const OWNERS_WORDS = 'The direction is wrong and here is what I actually asked for.'

/** A report a person wrote, with two blocks and no marks on either. */
function aReportSomebodyWrote(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: "What I think of this product's direction",
    data: { blocks: [block('b-owner', OWNERS_WORDS), block('b-detail', 'The second thing I asked for.')] },
    actor: PERSON,
  }).id
}

/** The blocks as they are stored right now. */
function storedBlocks(id: string): { id: string; audience?: string }[] {
  const rec = t.api.getRecord(id) as unknown as { data: { blocks: { id: string; audience?: string }[] } }
  return rec.data.blocks
}

describe('the write-path floor', () => {
  it('refuses an agent adding the mark to a block that is already stored', () => {
    const id = aReportSomebodyWrote()
    const error = expectPanelError(
      t,
      () =>
        t.api.patchRecord(
          id,
          // `dataPatch` AND NOT `data`. `data` replaces the whole bag, so a 200 there would prove
          // nothing about a merge patch, which is the door an agent actually uses.
          { dataPatch: { blocks: [block('b-owner', OWNERS_WORDS, 'developers'), block('b-detail', 'The second thing I asked for.')] } },
          AGENT,
        ),
      400,
    )
    expect(error.message).toContain('b-owner')
    // The refusal says what to do instead, in plain words, and says the reverse is always allowed.
    expect(error.message).toContain('Nothing was written')
    expect(error.message).toContain('removing a mark is always allowed')
    expect(storedBlocks(id)[0]?.audience).toBeUndefined()
  })

  it('refuses it through the wholesale door as well, not only through a merge patch', () => {
    const id = aReportSomebodyWrote()
    expectPanelError(
      t,
      () =>
        t.api.patchRecord(
          id,
          { data: { blocks: [block('b-owner', OWNERS_WORDS, 'developers'), block('b-detail', 'The second thing I asked for.')] } },
          AGENT,
        ),
      400,
    )
    expect(storedBlocks(id)[0]?.audience).toBeUndefined()
  })

  it('refuses a raise on a block nested inside a section, not only at the top level', () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report with a section in it',
      data: {
        blocks: [{ id: 'b-sec', type: 'section', title: 'How', blocks: [block('b-deep', OWNERS_WORDS)] }],
      },
      actor: PERSON,
    }).id
    const error = expectPanelError(
      t,
      () =>
        t.api.patchRecord(
          id,
          {
            dataPatch: {
              blocks: [{ id: 'b-sec', type: 'section', title: 'How', blocks: [block('b-deep', OWNERS_WORDS, 'developers')] }],
            },
          },
          AGENT,
        ),
      400,
    )
    expect(error.message).toContain('b-deep')
  })

  it('lets an agent mark a block it is writing in the same request', () => {
    const id = aReportSomebodyWrote()
    t.api.patchRecord(
      id,
      {
        dataPatch: {
          blocks: [
            block('b-owner', OWNERS_WORDS),
            block('b-detail', 'The second thing I asked for.'),
            block('b-new-machinery', 'The resolver reads the ladder and hands back a rung.', 'developers'),
          ],
        },
      },
      AGENT,
    )
    expect(storedBlocks(id).find((b) => b.id === 'b-new-machinery')?.audience).toBe('developers')
  })

  it('lets an agent create a whole record with marked blocks, because nothing was there before', () => {
    const made = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'What an agent wrote about its own machinery',
      data: { blocks: [block('b-said', 'What happened.'), block('b-machinery', 'How it is wired.', 'developers')] },
      actor: AGENT,
    })
    expect(storedBlocks(made.id)[1]?.audience).toBe('developers')
  })

  it('lets anybody REMOVE a mark, including an agent', () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report with a marked block',
      data: { blocks: [block('b-machinery', 'How it is wired.', 'developers')] },
      actor: PERSON,
    }).id
    t.api.patchRecord(id, { dataPatch: { blocks: [block('b-machinery', 'How it is wired.')] } }, AGENT)
    expect(storedBlocks(id)[0]?.audience).toBeUndefined()
  })

  it('lets a person raise a mark on writing that already exists', () => {
    const id = aReportSomebodyWrote()
    t.api.patchRecord(
      id,
      { dataPatch: { blocks: [block('b-owner', OWNERS_WORDS, 'developers'), block('b-detail', 'The second thing I asked for.')] } },
      PERSON,
    )
    expect(storedBlocks(id)[0]?.audience).toBe('developers')
  })

  it('lets an agent leave an existing mark exactly where it is while editing something else', () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report with a marked block',
      data: { blocks: [block('b-machinery', 'How it is wired.', 'developers')] },
      actor: PERSON,
    }).id
    t.api.patchRecord(id, { dataPatch: { blocks: [block('b-machinery', 'How it is wired, corrected.', 'developers')] } }, AGENT)
    expect(storedBlocks(id)[0]?.audience).toBe('developers')
  })

  it('lets an agent put back a revision in which a block was marked, because a restore is not a raise', async () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A report whose machinery was marked and then unmarked',
      data: { blocks: [block('b-machinery', 'How it is wired.', 'developers')] },
      actor: PERSON,
    }).id
    // Revision 2 takes the mark off. Putting revision 1 back brings it with it, and to a check
    // comparing against the record AS IT STANDS NOW that looks exactly like an agent raising one.
    t.api.patchRecord(id, { dataPatch: { blocks: [block('b-machinery', 'How it is wired.')] } }, PERSON)
    const revisions = await import('../src/server/lib/revisions.ts')
    const listing = revisions.listRevisions(id)
    const first = listing.revisions[listing.revisions.length - 1]
    expect(first, 'the record must have a first revision to put back').toBeDefined()
    revisions.restoreRevision(id, Number(first?.seq), AGENT, 'Putting back what the report said before the mark came off.')
    expect(storedBlocks(id)[0]?.audience).toBe('developers')
  })

  it('says nothing about a kind that has no blocks at all', () => {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'A problem has no blocks',
      data: { symptom: 'It broke.' },
      actor: PERSON,
    }).id
    t.api.patchRecord(id, { dataPatch: { symptom: 'It broke again.' } }, AGENT)
    expect((t.api.getRecord(id) as unknown as { data: { symptom: string } }).data.symptom).toBe('It broke again.')
  })
})
