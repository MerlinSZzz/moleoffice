// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE THINGS A REVIEW LIST COULD NOT DO, AND THE SERVER HALF OF EACH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND WHY EACH TEST IS SHAPED THE WAY IT IS
 * ---------------------------------------------------------------------------------------
 *
 * On 18 August 2026 a hostile reader did all seven required things, in a browser, and
 * the verdict was still not-usable on one clause of design/UX-CONTRACT.md — *the value works in one
 * view and disappears from the other*. Three of the four findings behind it are answered here:
 *
 *   NO COMMENT RECORDED THE REVISION IT WAS WRITTEN AGAINST, so the ledger built for exactly that
 *   could not be used and *changed since you wrote this* could not happen. The write path already
 *   accepted a revision and refused a pair the ledger does not hold; what was missing was a cheap
 *   way for a writer to know the pair. A read of a record now hands back the number beside the
 *   token it already handed back, and the whole path is exercised end to end below: read, write,
 *   change the text, read again, and get the old text back.
 *
 *   THE LIST NEVER SAID A QUOTE HAD GONE STALE. With two of seven quotes stale, all seven rows drew
 *   the quote and nothing else, because asking cost a request per row. One request answers for the
 *   whole list, and the test asks about a list holding both kinds.
 *
 *   A COMMENT COULD NOT TAKE YOU TO WHAT IT WAS ABOUT. A remark now answers with which record or
 *   plan it is in, which block, and which words.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE STALE HALF IS TESTED BY REWRITING REAL TEXT
 * ---------------------------------------------------------------------------------------
 *
 * A reading that always answered `there` would pass any test that only wrote remarks. So every test
 * about staleness edits the thing underneath afterwards, and requires the answer to move.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { Context } from '../src/shared/targets.ts'

type AnnotationsLib = typeof import('../src/server/lib/annotations.ts')
type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const WORKSPACE = 'default'

let t: TestDb
let annotations: AnnotationsLib
let revisions: RevisionsLib

beforeAll(async () => {
  t = await freshDb()
  annotations = (await import('../src/server/lib/annotations.ts')) as AnnotationsLib
  revisions = (await import('../src/server/lib/revisions.ts')) as RevisionsLib
}, 60_000)

afterAll(() => {
  t.close()
})

/** A report with one paragraph, which is the thing every test here points at. */
function report(text: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'report',
    title: 'What the calibration measured',
    data: { blocks: [{ id: 'b-what-broke', type: 'text', text }] },
    actor: HUMAN,
  }).id
}

function remark(title: string, context: Context): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'annotation',
    title,
    data: { body: `words about ${title}`, context },
    actor: HUMAN,
  }).id
}

// ============================================================================ the revision

describe('a remark records the revision it was written against, and can say what that held', () => {
  it('a read of a record hands back the number that goes with the token it already hands back', () => {
    const id = report('The reprojection error was 0.4 px.')
    const record = t.api.getRecord(id)
    if (record === null) throw new Error('the report was not written')

    const seq = revisions.revisionHoldingContent(id, t.api.versionOf(record))
    // NOT A GUESS AND NOT "THE NEWEST ROW": it is the revision holding exactly what was just read.
    expect(seq).toBe(1)
  })

  it('the whole path accepts it, stores it, and answers what that revision held where the words were', () => {
    const id = report('The reprojection error was 0.4 px.')
    const first = t.api.getRecord(id)
    if (first === null) throw new Error('the report was not written')
    const seq = revisions.revisionHoldingContent(id, t.api.versionOf(first))
    if (seq === null) throw new Error('the ledger holds nothing with the content that was just read')

    const written = remark('the number', {
      target: { kind: 'reportBlock', recordId: id, blockId: 'b-what-broke' },
      span: { quote: '0.4 px', from: 26, to: 32, field: 'data.blocks[#b-what-broke].text' },
      revision: { seq, contentHash: t.api.versionOf(first) },
    })

    // THE TEXT MOVES UNDERNEATH IT. Without this the reading would answer `there` and the test
    // would pass with the ledger never read.
    t.api.patchRecord(
      id,
      { data: { blocks: [{ id: 'b-what-broke', type: 'text', text: 'The reprojection error was 1.9 px.' }] } },
      HUMAN,
    )

    const read = annotations.readAnnotation(written, WORKSPACE)
    expect(read.reading.state).toBe('changed')
    const against = read.reading.writtenAgainst
    if (against === undefined) throw new Error('the remark did not say which revision it was written against')
    expect(against.seq).toBe(seq)
    expect(against.inTheLedger).toBe(true)
    // WHAT THAT REVISION HELD AT THE FIELD THE WORDS CAME FROM. This is the sentence that turns
    // "these words are gone" into something somebody can act on.
    expect(against.heldThere).toBe('The reprojection error was 0.4 px.')
    expect(against.field).toBe('data.blocks[#b-what-broke].text')
  })

  it('refuses a pair the ledger does not hold, and stores nothing', () => {
    const id = report('The reprojection error was 0.4 px.')
    const record = t.api.getRecord(id)
    if (record === null) throw new Error('the report was not written')
    // THE READING STAYS OVER EVERY COMMENT IN THE PROJECT, and what it must see is that this case
    // added none. Taken here, at the start of the case.
    const alreadyThere = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'annotation' }).map((one) => one.id)

    let refused: unknown
    try {
      remark('a revision nobody has', {
        target: { kind: 'record', recordId: id, workspaceId: WORKSPACE },
        revision: { seq: 9, contentHash: t.api.versionOf(record) },
      })
    } catch (error) {
      refused = error
    }
    expect(String(refused)).toContain('has no revision 9')
    expect(
      t.api
        .listRecords({ workspaceId: WORKSPACE, kind: 'annotation' })
        .filter((one) => !alreadyThere.includes(one.id)),
    ).toEqual([])
  })
})

// ============================================================================ forty at once

describe('a list of remarks can ask in one request whether each has gone stale', () => {
  it('answers per remark, and the ones whose text moved say so', () => {
    const id = report('The reprojection error was 0.4 px, over forty frames.')
    const stillThere = remark('the frame count', {
      target: { kind: 'reportBlock', recordId: id, blockId: 'b-what-broke' },
      span: { quote: 'forty frames', from: 40, to: 52, field: 'data.blocks[#b-what-broke].text' },
    })
    const willGoStale = remark('the number', {
      target: { kind: 'reportBlock', recordId: id, blockId: 'b-what-broke' },
      span: { quote: '0.4 px', from: 26, to: 32, field: 'data.blocks[#b-what-broke].text' },
    })

    t.api.patchRecord(
      id,
      {
        data: {
          blocks: [{ id: 'b-what-broke', type: 'text', text: 'The reprojection error was 1.9 px, over forty frames.' }],
        },
      },
      HUMAN,
    )

    const answered = annotations.readAnnotations([stillThere, willGoStale], WORKSPACE)
    expect(answered.readings.map((r) => (r.found ? r.reading.state : 'not read'))).toEqual(['there', 'changed'])
    expect(answered.read).toBe(2)
    expect(answered.unread).toBe(0)
    expect(answered.says).toContain('1 of them point at something that has changed')
  })

  it('reports an id that answers nothing rather than shortening the list', () => {
    const id = report('The reprojection error was 0.4 px.')
    const written = remark('the number', { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } })

    const answered = annotations.readAnnotations([written, 'nOsUcHrEcOrD', id], WORKSPACE)
    // THREE IN, THREE OUT, IN THE ORDER ASKED. A caller comparing lengths learns nothing from a
    // list that quietly dropped the two it could not read.
    expect(answered.readings.map((r) => r.id)).toEqual([written, 'nOsUcHrEcOrD', id])
    expect(answered.readings.map((r) => r.found)).toEqual([true, false, false])
    const missing = answered.readings[1]
    const wrongKind = answered.readings[2]
    if (missing === undefined || missing.found) throw new Error('the id nobody has was not reported')
    if (wrongKind === undefined || wrongKind.found) throw new Error('the record of the wrong kind was not reported')
    expect(missing.says).toContain('There is no record')
    expect(wrongKind.says).toContain('is a report, not a comment')
  })
})

// ============================================================================ finding it again

describe('a remark can be found from its own id, with enough to go to what it is about', () => {
  it('says which record, which block and which words', () => {
    const id = report('The reprojection error was 0.4 px.')
    const written = remark('the number', {
      target: { kind: 'reportBlock', recordId: id, blockId: 'b-what-broke' },
      span: { quote: '0.4 px', from: 26, to: 32, field: 'data.blocks[#b-what-broke].text' },
    })

    const read = annotations.readAnnotation(written, WORKSPACE)
    // IT WAS WRITTEN AS A `reportBlock` AND IT IS STORED AS THE PART OF THE RECORD THAT BLOCK IS.
    // The door spells it that way — `theRegionItNames` in src/server/lib/targets.ts — so that a
    // stored comment cannot stop the server coming up. The block, the record and the words are the
    // same three facts this test was always about; only the name of the first one changed.
    expect(read.where.targetKind).toBe('region')
    expect(read.where.record).toEqual({
      id,
      kind: 'report',
      title: 'What the calibration measured',
      workspaceId: WORKSPACE,
    })
    // NO `blockId`, AND THAT IS THE HONEST ANSWER RATHER THAN A LOSS. `blockId` is read off the
    // stored target's own identifiers, and a region identifies itself by the path of what it draws.
    // The block is named in that path, which the assertion below reads.
    expect(read.where.blockId).toBeNull()
    expect(read.where.ids['regionId']).toBe('data.blocks[#b-what-broke]')
    expect(read.where.quote).toEqual({
      words: '0.4 px',
      from: 26,
      to: 32,
      field: 'data.blocks[#b-what-broke].text',
    })
    // THE SAME STRING AN ADDRESSABLE ELEMENT ON SCREEN CARRIES. One spelling of a key in the whole
    // product; two, one on each side, and every mark simply stops being drawn.
    // PERCENT-ENCODED, because a key holds each identifying value encoded so that one containing a
    // "/" cannot break the shape — `targetAttributeValue` in src/shared/targets.ts says so, and a
    // region id holds brackets and a hash. This is the string an element carries, character for
    // character, which is the whole reason to assert it here.
    expect(read.where.key).toBe(`region/${id}/${encodeURIComponent('data.blocks[#b-what-broke]')}`)
  })

  it('names the plan when the remark is on a line of one', async () => {
    const plans = (await import('../src/server/lib/plans.ts')) as typeof import('../src/server/lib/plans.ts')
    const written = plans.createPlan({ title: 'This week', body: 'finish the calibration' }, HUMAN)
    const line = written.lines[0]
    if (line === undefined) throw new Error('the plan has no line')

    const left = remark('the line', { target: { kind: 'planLine', planId: written.plan.id, lineId: line.id } })
    const read = annotations.readAnnotation(left, WORKSPACE)

    expect(read.where.record).toBeNull()
    expect(read.where.plan).toEqual({ id: written.plan.id, title: 'This week' })
    expect(read.where.says).toContain('in the plan "This week"')
  })

  it('says who wrote it, from the ledger rather than from the record row', () => {
    const id = report('The reprojection error was 0.4 px.')
    const written = remark('the number', { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } })

    // NOT `ownerId`. That column holds the owner's own name whenever an agent wrote the row, so
    // reading an author off it would attribute an agent's work to a person.
    expect(annotations.readAnnotation(written, WORKSPACE).createdBy).toBe(`human:${THE_TEST_OFFICES_OWNER.id}`)
  })

  it('says plainly that nothing has organised the words', () => {
    const id = report('The reprojection error was 0.4 px.')
    const written = remark('the number', { target: { kind: 'record', recordId: id, workspaceId: WORKSPACE } })

    const read = annotations.readAnnotation(written, WORKSPACE)
    expect(read.interpretation).toBeNull()
    expect(read.says).toContain('Nothing has organised these words yet')
  })

  it('refuses a record that is not a remark, naming what it is instead', () => {
    const id = report('The reprojection error was 0.4 px.')
    let refused: unknown
    try {
      annotations.readAnnotation(id, WORKSPACE)
    } catch (error) {
      refused = error
    }
    expect(String(refused)).toContain('is a report, not a comment somebody left on something')
  })
})
