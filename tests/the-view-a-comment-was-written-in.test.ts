// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH DRAWING OF A RECORD A COMMENT WAS WRITTEN OFF, AND WHO IS ALLOWED TO SAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A report is not one drawing. The detail ladder decides which blocks are on the page, so the
 * fourth paragraph of a section is on a reader's screen at `full` and is not on it at `gist`. A
 * comment written on that paragraph is about characters the second reader cannot see.
 *
 * Without a stored view Mole Office has two answers and both are false. Draw the mark anyway, on
 * whichever ancestor happens to be on screen — that says *this comment is about this* about a thing
 * it is not about. Or draw nothing — that says *there is no comment here* about a comment that is
 * there. `Context.view` is the one fact that makes a third, true answer possible: *the place is
 * real, and it is not on your screen.*
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ONE RULE ABOUT WHO MAY WRITE ONE
 * ---------------------------------------------------------------------------------------
 *
 * A view is EVIDENCE about a moment on somebody's screen. An agent reaches every door a browser
 * reaches and an agent has no screen: it never drew the report, never chose a rung, and cannot have
 * read one. A view stored by an agent would be an invented observation about a person's reading,
 * and — this is the part that matters — nothing downstream could tell it from a measured one. So it
 * is refused at the door, in the same shape `checkSeen` already refuses screen evidence about words
 * the corpus holds.
 *
 * `system` is NOT refused, and that is not a hole: a system write is a restore or a migration
 * moving a context Mole Office already holds. Refusing there would make an honest stored comment
 * unrestorable BECAUSE it carries honest evidence.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT ASSERTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * That `pictures` and `size` are written. They are declared optional and NOTHING measures them:
 * there is no control that turns pictures off and none that sets the writing larger, so no reader
 * has chosen a value. A browser that sent one would be filing a setting nobody has. The day those
 * controls exist, this file gains the cases and the shape does not change.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import {
  PICTURE_SETTINGS,
  TEXT_SIZES,
  viewRuleFor,
  type Context,
  type View,
} from '../src/shared/targets.ts'
import { RUNGS, type Rung } from '../src/shared/detail.ts'
import { SHAPE_SPECS } from '../src/shared/kinds.ts'
import { placeFallsInside, regionsOf, findRegion, type Region } from '../src/shared/regions.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let targets: typeof import('../src/server/lib/targets.ts')
let record: { id: string }

/** Two blocks: a long one with three paragraphs, and a second nobody reads at a short rung. */
const BLOCKS: SummaryBlock[] = [
  {
    id: 'b-1',
    type: 'text',
    text: 'The mast was knocked at the third pass.\n\nA second paragraph, further down the field.\n\nA third, further still.',
  } as SummaryBlock,
  { id: 'b-2', type: 'text', text: 'A second block entirely.' } as SummaryBlock,
]

beforeAll(async () => {
  t = await freshDb()
  targets = await import('../src/server/lib/targets.ts')
}, 60_000)

afterAll(() => t.close())

beforeEach(() => {
  record = t.api.createRecord({
    kind: 'report',
    title: 'The view test report',
    workspaceId: WORKSPACE,
    data: { blocks: BLOCKS },
    actor: HUMAN,
  })
})

/** A comment on the second paragraph of b-1, written at whichever view is named. */
function commentAt(view: View | undefined): Record<string, unknown> {
  const context: Context = {
    target: { kind: 'region', recordId: record.id, regionId: 'data.blocks[#b-1]' },
    place: { at: 'quote', words: 'A second paragraph' },
    ...(view === undefined ? {} : { view }),
  }
  return { body: 'This paragraph is the one I mean.', context }
}

// ============================================================================ the shape

describe('the view is declared where every other part of a context is declared', () => {
  it('is an optional field on Context, and names the View shape rather than restating it', () => {
    const context = SHAPE_SPECS['Context']
    expect(context).toBeDefined()
    const view = context?.fields.find((f) => f.key === 'view')
    expect(view, 'Context has no `view` field').toBeDefined()
    // OPTIONAL, because every context written before this has none and "nobody recorded this" is a
    // real answer. Required would refuse every comment the product has ever written.
    expect(view?.required).toBe(false)
    // AND IT POINTS AT THE SHAPE rather than spelling the three settings a second time here.
    expect(view?.type).toBe('View')
    expect(SHAPE_SPECS['View'], 'Context names a shape that is not declared').toBeDefined()
  })

  it('declares detail as the one required setting, and the other two as things nobody has yet', () => {
    const view = SHAPE_SPECS['View']
    const keys = view?.fields.map((f) => f.key) ?? []
    expect(keys).toEqual(['detail', 'pictures', 'size'])
    // `detail` IS REQUIRED because a reader has always chosen one: there is no moment when a
    // browser cannot say what rung a record was drawn at.
    expect(view?.fields.find((f) => f.key === 'detail')?.required).toBe(true)
    // THE OTHER TWO ARE NOT, because the controls that set them do not exist. A browser that sent
    // one would be filing evidence about a setting nobody has.
    expect(view?.fields.find((f) => f.key === 'pictures')?.required).toBe(false)
    expect(view?.fields.find((f) => f.key === 'size')?.required).toBe(false)
    // The two closed lists are declared beside the shape and are not retyped in prose anywhere.
    expect([...PICTURE_SETTINGS]).toEqual(['drawn', 'left out'])
    expect([...TEXT_SIZES]).toEqual(['small', 'default', 'large'])
  })
})

// ============================================================================ who may write one

describe('a view is evidence about a screen, so a writer with no screen may not send one', () => {
  it('states the rule in one function, for both kinds of writer', () => {
    expect(viewRuleFor('human')).toBe('allowed')
    expect(viewRuleFor('agent')).toBe('refused')
  })

  it('refuses an agent that files a view, and says why in words a person reads', () => {
    const err = expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'annotation',
          title: 'An agent claiming a screen',
          workspaceId: WORKSPACE,
          data: commentAt({ detail: 'full' }),
          actor: AGENT,
        }),
      400,
    )
    // The refusal names the thing that is missing rather than shrugging, and it says what to do.
    expect(err.message).toContain('no screen')
    expect(err.message).toContain('view')
  })

  it('takes the same comment from a person, and stores the view exactly as it was sent', () => {
    const written = t.api.createRecord({
      kind: 'annotation',
      title: 'A person who was reading it',
      workspaceId: WORKSPACE,
      data: commentAt({ detail: 'gist' }),
      actor: HUMAN,
    })
    const back = t.api.getRecord(written.id)
    const stored = (back?.data as Record<string, unknown>)['context'] as Context
    expect(stored.view).toEqual({ detail: 'gist' })
  })

  it('takes a comment from an agent that leaves the view off, because that is the honest one', () => {
    const written = t.api.createRecord({
      kind: 'annotation',
      title: 'An agent saying nothing about a screen',
      workspaceId: WORKSPACE,
      data: commentAt(undefined),
      actor: AGENT,
    })
    const back = t.api.getRecord(written.id)
    const stored = (back?.data as Record<string, unknown>)['context'] as Context
    // ABSENT, not blank and not a guess. "The view this was written in was not recorded" is what
    // a reader will be told, and it is true.
    expect('view' in stored).toBe(false)
  })

  it('refuses an agent that adds a view to a comment on the second write path too', () => {
    // THE AGENT WRITES THE NOTE ITSELF, because a note somebody else wrote is refused by a
    // DIFFERENT rule — what a person wrote is theirs — and that refusal would pass this test while
    // saying nothing about views. The agent owns this one, so the only thing left to refuse is the
    // field.
    const written = t.api.createRecord({
      kind: 'annotation',
      title: 'Added afterwards',
      workspaceId: WORKSPACE,
      data: commentAt(undefined),
      actor: AGENT,
    })
    // A rule enforced on create and not on patch is not a rule. This is the patch door.
    const err = expectPanelError(
      t,
      () => t.api.patchRecord(written.id, { data: commentAt({ detail: 'full' }) }, AGENT),
      400,
    )
    expect(err.message).toContain('no screen')
  })

  it('lets a system write carry a view, because a restore moves what is already stored', () => {
    // ASKED OF THE CHECK ITSELF AND NOT THROUGH A RECORD WRITE, and that is deliberate. A restore
    // patches a note it did not write, and the note-ownership gate in lib/records.ts refuses that
    // for its own reasons — a rule about authorship, not about screens. Driving this through
    // `patchRecord` would prove that the ownership gate exists, which some other test already does.
    // What is under test here is the ONE refusal this step added, and whether it fires on `system`.
    const context: Context = {
      target: { kind: 'region', recordId: record.id, regionId: 'data.blocks[#b-1]' },
      place: { at: 'quote', words: 'A second paragraph' },
      view: { detail: 'full' },
    }
    // Refusing here would make an honest comment unrestorable BECAUSE it carries honest evidence.
    expect(() => targets.checkView(context, 'system')).not.toThrow()
    expect(() => targets.checkContext(context, WORKSPACE, 'system')).not.toThrow()
    // And the agent is still refused by the same call, so the allowance above is about `system`
    // and not about the function having stopped checking.
    expectPanelError(t, () => targets.checkView(context, 'agent'), 400)
  })

  it('refuses a rung that is not one of the six, from anybody, as a matter of shape', () => {
    // NOT A SECOND COPY OF THE LADDER. The six live in src/shared/detail.ts and the shape checker
    // reads them; this asserts the door is closed, not what the list holds.
    expectPanelError(
      t,
      () =>
        t.api.createRecord({
          kind: 'annotation',
          title: 'A rung nobody has',
          workspaceId: WORKSPACE,
          data: commentAt({ detail: 'enormous' as unknown as Rung }),
          actor: HUMAN,
        }),
      400,
    )
    // And every real one goes through, so the refusal above is about the word and not about the key.
    for (const rung of RUNGS) {
      expect(() =>
        t.api.createRecord({
          kind: 'annotation',
          title: `Written at ${rung}`,
          workspaceId: WORKSPACE,
          data: commentAt({ detail: rung }),
          actor: HUMAN,
        }),
      ).not.toThrow()
    }
  })
})

// ============================================================================ is the place drawn here

describe('whether the characters a comment was written on are part of what a view drew', () => {
  const tree = (): Region => regionsOf({ field: 'blocks', blocks: BLOCKS })
  const paragraph = (): Region => {
    const found = tree().children[0]?.children.find((r) => r.text.startsWith('A second paragraph'))
    expect(found, 'the second paragraph is not a region').toBeDefined()
    return found as Region
  }

  it('says a place with no words is drawn, because the region is the whole of what it names', () => {
    // `undefined` is not "no answer": it means nothing finer than the region was recorded, so
    // there is nothing that could be missing from the drawing.
    expect(placeFallsInside(paragraph(), undefined)).toBe(true)
    expect(placeFallsInside(paragraph(), { at: 'surface' })).toBe(true)
  })

  it('answers a quote by looking for its characters, which is the only question a quote has', () => {
    // MOST OF WHAT IS STORED IS A QUOTE. Counted on a copy of the corpus, of the annotations that
    // carry a place the majority carry `{at:'quote'}` — words kept verbatim because nothing stored
    // can be shown to hold them. A quote names characters and not an offset, so an offset test
    // would have no answer at all for them.
    expect(placeFallsInside(paragraph(), { at: 'quote', words: 'A second paragraph' })).toBe(true)
    expect(placeFallsInside(paragraph(), { at: 'quote', words: 'The mast was knocked' })).toBe(false)
    // An empty quote is found everywhere it is looked for, so it is never "drawn here".
    expect(placeFallsInside(paragraph(), { at: 'quote', words: '' })).toBe(false)
  })

  it('answers an offset by containment, and the FIELD has to match as well as the number', () => {
    const second = paragraph()
    const at = second.range?.from ?? -1
    expect(at).toBeGreaterThan(0)
    expect(placeFallsInside(second, { at: 'run', field: second.field as string, offset: at })).toBe(true)
    // The same number, in another stored string. Two blocks each have a character 41 and a region
    // of one says nothing whatever about the other.
    expect(placeFallsInside(second, { at: 'run', field: 'data.blocks[#b-2].text', offset: at })).toBe(false)
    // And an offset below the region's own start is outside it.
    expect(placeFallsInside(second, { at: 'run', field: second.field as string, offset: 0 })).toBe(false)
  })

  it('requires BOTH ends of a two-ended place, so a subject running off the drawing is not "here"', () => {
    const second = paragraph()
    const inside = { quote: 'A second', from: second.range?.from ?? 0, to: (second.range?.from ?? 0) + 8 }
    const outside = { quote: 'The mast', from: 0, to: 8 }
    expect(placeFallsInside(second, { at: 'across', from: inside, to: inside, parts: 1, partWord: 'paragraphs' })).toBe(true)
    // One end in and one end out. Saying this is drawn here would be saying the comment is smaller
    // than it is.
    expect(placeFallsInside(second, { at: 'across', from: outside, to: inside, parts: 2, partWord: 'paragraphs' })).toBe(false)
  })

  it('is the question a reader at another view actually asks, over a real region tree', () => {
    // The whole point, driven end to end: a comment written on the second paragraph, asked about
    // two regions of the same record. The paragraph holds it; its sibling does not.
    const root = tree()
    const block = findRegion(root, 'data.blocks[#b-2]')
    expect(block).not.toBeNull()
    const place = { at: 'quote' as const, words: 'A second paragraph' }
    expect(placeFallsInside(paragraph(), place)).toBe(true)
    expect(placeFallsInside(block as Region, place)).toBe(false)
  })
})
