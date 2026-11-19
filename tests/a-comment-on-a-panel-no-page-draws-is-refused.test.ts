// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT ON A PANEL NO PAGE DRAWS IS REFUSED, AND THE PARTS UNDER IT ARE NOT.
 *
 * Problem zIdb10n9vao2. The Shorter forms panel was taken off the record page because it repeated
 * what the page showed above it and was not meant as ordinary interface.
 * Its section, `section.shortForms`, stayed declared, and the write door went on storing a comment
 * left on it: a comment nobody could find on any page or answer.
 *
 * The problem asks for a choice: may a comment be left on a place nothing draws? The answer built
 * is no, because item 3 of a decision lets a wave choose. The section is not
 * removed, because the written short forms and the parts of the by-part summary are regions under
 * it, and those are drawn (criterion M16). So the door refuses the section itself and nothing
 * under it.
 *
 * Every record here is made up by this test, in a database of its own.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { sectionRegionId, shortFormRegionId } from '../src/shared/regions.ts'
import { SHORT_FORMS_FIELD } from '../src/shared/zoom.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const WORKSPACE = 'default'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

/** A made-up report with one stored short form, written through its own door, so the label is a part the tree holds. */
async function aReport(): Promise<string> {
  const id = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'report',
    title: 'A made-up report',
    data: { date: '2026-09-30', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up sentence.' }] },
    actor: HUMAN,
  }).id
  const { listRevisions } = await import('../src/server/lib/revisions.ts')
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const newest = listRevisions(id).revisions[0]
  if (newest === undefined) throw new Error('the made-up report has no revision to write a short form from')
  writeShortForms(id, WORKSPACE, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: 'Made-up label' } }, HUMAN)
  return id
}

function commentOn(recordId: string, regionId: string): () => string {
  return () =>
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'annotation',
      title: `on ${regionId}`,
      data: { body: `A made-up remark about ${regionId}.`, context: { target: { kind: 'region', recordId, regionId } } },
      actor: HUMAN,
    }).id
}

function annotationsHeld(): number {
  return t.api.listRecords({ workspaceId: WORKSPACE, kind: 'annotation' }).length
}

describe('a comment on the Shorter forms panel', () => {
  it('is refused, and nothing is stored', async () => {
    const report = await aReport()
    // THE READING STAYS OVER EVERY COMMENT IN THE PROJECT, and what it must see is that this case
    // added none. Taken here, at the start of the case.
    const alreadyThere = annotationsHeld()
    expect(commentOn(report, sectionRegionId(SHORT_FORMS_FIELD))).toThrow(/No page draws/)
    expect(annotationsHeld(), 'the refused comment was stored all the same').toBe(alreadyThere)
  })

  it('does not refuse the written short form under it, which is still a place', async () => {
    const report = await aReport()
    const alreadyThere = annotationsHeld()
    expect(commentOn(report, shortFormRegionId('label'))).not.toThrow()
    expect(annotationsHeld() - alreadyThere).toBe(1)
  })

  it('refuses a review started on it too, through the same door', async () => {
    const reviews = await import('../src/server/lib/reviews.ts')
    const report = await aReport()
    expect(() =>
      reviews.startReview(
        {
          workspaceId: WORKSPACE,
          entry: { target: { kind: 'region', recordId: report, regionId: sectionRegionId(SHORT_FORMS_FIELD) } },
        },
        HUMAN,
      ),
    ).toThrow(/No page draws/)
  })
})
