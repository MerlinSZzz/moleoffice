// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE SOMEBODY WAS WHEN THEY POINTED, AND WHAT WAS ON THEIR SCREEN.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO DEFECTS THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * 1. ONE FACT IN TWO FIELDS. A place says where somebody was; a span is worked out from it. If both
 *    were stored, the two would be free to name different words, and the one drawn on screen would
 *    be whichever the drawing code reached for. `spanOf` is the one derivation and `checkPlace` is
 *    what refuses the pair.
 *
 * 2. A SENTENCE PANELX MADE UP, PRESENTED AS THE WORDS A PERSON CHOSE. An earlier draft joined the
 *    two ends of a selection that ran across two stored strings into a single span reading
 *    `<first words>…<last words>`, with offsets into two different strings. Nobody ever saw that
 *    string on a screen, and src/server/lib/annotations.ts prints a stored quote as "the words it
 *    was left on are …". So `spanOf` returns null for that case, and the test below is what keeps
 *    it null.
 *
 * ---------------------------------------------------------------------------------------
 * AND ONE THING THIS STEP MUST NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * Nothing in the product measures a place or what was on screen yet. So none of the new rules may
 * refuse a write the product makes today. The last group of tests here is the whole point of the
 * step: an ordinary comment, an ordinary message and an ordinary review still go through, including
 * the ones written against a page, which holds no text and records no evidence.
 *
 * Every failing case below was proved by mutation, with a control run of this file first.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import {
  CONTEXT_READINGS,
  PLACES,
  TARGET_KINDS,
  TARGET_SPECS_BY_KIND,
  placeNeedsText,
  seenRuleFor,
  spanOf,
  type Context,
  type ContextReadingState,
  type Place,
  type Seen,
  type TargetKind,
} from '../src/shared/targets.ts'
import type { ContextReading } from '../src/server/lib/agents.ts'

// ============================================================================ the reading union

/**
 * THE ONE VOCABULARY FOR "THE THING IS NOT THERE", PINNED AT COMPILE TIME.
 *
 * The server decides four of the five and the browser decides the fifth, so the union is declared
 * in src/shared/targets.ts where both can read it. This is what stops the two drifting: the server's
 * own union must be a subset of the shared one, and the shared one must add exactly `notDrawn` and
 * nothing else. Add a word to either without the other and this file stops compiling.
 *
 * It is a type check rather than a test body because a union has no run-time value to compare.
 */
type ServerReading = ContextReading['state']
type OnlyNew = Exclude<ContextReadingState, ServerReading>
const _serverWordsAreAllInTheSharedUnion: ServerReading extends ContextReadingState ? true : false = true
const _theSharedUnionAddsExactlyOneWord: 'notDrawn' extends OnlyNew ? (OnlyNew extends 'notDrawn' ? true : false) : false = true

// ============================================================================ where somebody was

const WORDS: Place = { at: 'words', span: { quote: 'holds calibration', from: 10, to: 27, field: 'summary' } }
const ACROSS: Place = {
  at: 'across',
  from: { quote: 'holds calibration', from: 10, to: 27, field: 'data.blocks[#b-1].text' },
  to: { quote: 'through a handover', from: 0, to: 18, field: 'data.blocks[#b-2].text' },
  parts: 2,
  partWord: 'blocks',
}
const QUOTE: Place = { at: 'quote', words: 'How much each thing says' }
const RUN: Place = { at: 'run', field: 'data.blocks[#b-1].text', offset: 0 }
const SURFACE: Place = { at: 'surface' }

describe('a place says where somebody was, and a span is worked out from it', () => {
  it('really covers all five, so a test that found nothing cannot pass quietly', () => {
    expect(PLACES.length).toBe(5)
    expect([...PLACES].sort()).toEqual(['across', 'quote', 'run', 'surface', 'words'])
    for (const place of [WORDS, ACROSS, QUOTE, RUN, SURFACE]) {
      expect(PLACES, `${place.at} is not one of the five`).toContain(place.at)
    }
  })

  it('hands back the exact words when both ends were in one stored string', () => {
    const span = spanOf(WORDS)
    expect(span).not.toBeNull()
    expect(span?.quote).toBe('holds calibration')
    expect(span?.from).toBe(10)
    expect(span?.to).toBe(27)
    expect(span?.field).toBe('summary')
  })

  it('hands back nothing at all when the selection ran across two stored strings', () => {
    // THE ONE THAT MATTERS. A joined span would read "holds calibration…through a handover" with
    // offsets into two different strings, and would then be printed to a person as the words they
    // chose. Nobody ever saw those words together.
    expect(spanOf(ACROSS)).toBeNull()
  })

  it('hands back nothing for the three places that name no position in a stored string', () => {
    expect(spanOf(QUOTE)).toBeNull()
    expect(spanOf(RUN)).toBeNull()
    expect(spanOf(SURFACE)).toBeNull()
  })

  it('says which places need a thing that holds text, and which are honest on anything', () => {
    expect(placeNeedsText(WORDS)).toBe(true)
    expect(placeNeedsText(ACROSS)).toBe(true)
    expect(placeNeedsText(RUN)).toBe(true)
    // The two that are legal everywhere. `quote` is how somebody keeps the words they selected off
    // a part of the screen Mole Office draws from its own code and stores nowhere.
    expect(placeNeedsText(QUOTE)).toBe(false)
    expect(placeNeedsText(SURFACE)).toBe(false)
  })
})

// ============================================================================ what was on screen

describe('evidence about what was on screen is kept exactly where there is no original to read', () => {
  it('is refused for every kind that holds its own words, and required for every kind that does not', () => {
    const refused: TargetKind[] = []
    const required: TargetKind[] = []
    for (const kind of TARGET_KINDS) {
      ;(seenRuleFor(kind) === 'refused' ? refused : required).push(kind)
    }
    // Read off `holdsText` rather than listed here, so the two can never say different things.
    expect(refused.length + required.length).toBe(TARGET_KINDS.length)
    for (const kind of refused) expect(TARGET_SPECS_BY_KIND[kind].holdsText).toBe(true)
    for (const kind of required) expect(TARGET_SPECS_BY_KIND[kind].holdsText).toBe(false)
    // Naming them is what makes the count above mean something. A fact beside a plan line has no
    // stored text of its own, a part of Mole Office's screen is written in a .tsx file, and a page
    // is an address. In declaration order, which is the order TARGET_KINDS is built in.
    expect(required).toEqual(['planLineFact', 'uiSurface', 'page'])
  })
})

// ============================================================================ what the write path does

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: 'owner' } as const

let t: TestDb
let targets: typeof import('../src/server/lib/targets.ts')

/**
 * ONE OFFICE FOR THE FILE. Each case files its own report or reads the shared vocabulary, and no
 * case counts what the office holds.
 */
beforeAll(async () => {
  t = await freshDb()
  targets = await import('../src/server/lib/targets.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

function report(): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'report',
    title: 'Round eight, what the review found',
    data: {
      blocks: [{ id: 'b-1', type: 'text', text: 'The mount holds calibration through a full handover.' }],
    },
    actor: HUMAN,
  }).id
}

const onPage = (route = '/plan'): Context => ({ target: { kind: 'page', route } })
const seenOn = (route = '/plan'): Seen => ({ route, quote: 'How much each thing says', build: 'unknown' })

describe('the checks learn the new shapes without refusing anything the product writes today', () => {
  it('refuses a context carrying both a place and a span, because the two could name different words', () => {
    const recordId = report()
    const both: Context = {
      target: { kind: 'record', recordId, workspaceId: WORKSPACE },
      span: { quote: 'holds calibration', from: 10, to: 27 },
      place: WORDS,
    }
    const err = expectPanelError(t, () => targets.checkContext(both, WORKSPACE, 'human'), 400)
    expect(err.message).toContain('not two')
  })

  it('refuses a position inside stored text on a thing that holds none', () => {
    const err = expectPanelError(t, () => targets.checkContext({ ...onPage(), place: WORDS }, WORKSPACE, 'human'), 400)
    expect(err.message).toContain('no stored text')
    // AND SAYS WHAT TO SEND INSTEAD, because a refusal that names no way forward is a shrug.
    expect(err.message).toContain('quote')
  })

  it('keeps the words somebody selected off a thing that stores none of them', () => {
    // THE CASE THE OLD SHAPE COULD NOT HOLD. A page holds no text, so it could carry no span, so
    // six words a person selected and right-clicked were thrown away. The place carries them.
    expect(() => targets.checkContext({ ...onPage(), place: QUOTE }, WORKSPACE, 'human')).not.toThrow()
    expect(() => targets.checkContext({ ...onPage(), place: SURFACE }, WORKSPACE, 'human')).not.toThrow()
  })

  it('refuses an empty quote, which would be found wherever it was looked for', () => {
    const empty: Context = { ...onPage(), place: { at: 'quote', words: '' } }
    const err = expectPanelError(t, () => targets.checkContext(empty, WORKSPACE, 'human'), 400)
    expect(err.message).toContain('empty quote')
  })

  it('refuses a two-ended place that does not say what lay between the ends', () => {
    const recordId = report()
    const on = { kind: 'record', recordId, workspaceId: WORKSPACE } as const
    const noWord: Context = { target: on, place: { ...ACROSS, partWord: '' } as Place }
    expectPanelError(t, () => targets.checkContext(noWord, WORKSPACE, 'human'), 400)
    const notTwo: Context = { target: on, place: { ...ACROSS, parts: 1 } as Place }
    expectPanelError(t, () => targets.checkContext(notTwo, WORKSPACE, 'human'), 400)
    // The whole of it, sound, goes through.
    expect(() => targets.checkContext({ target: on, place: ACROSS }, WORKSPACE, 'human')).not.toThrow()
  })

  it('refuses a copy of words the corpus already holds', () => {
    const recordId = report()
    const copied: Context = { target: { kind: 'record', recordId, workspaceId: WORKSPACE }, seen: seenOn() }
    const err = expectPanelError(t, () => targets.checkContext(copied, WORKSPACE, 'human'), 400)
    expect(err.message).toContain('reads them from it')
  })

  it('keeps evidence for a thing that has no stored words to read', () => {
    expect(() => targets.checkContext({ ...onPage(), seen: seenOn() }, WORKSPACE, 'human')).not.toThrow()
    // A build nobody could read is "unknown", which is a real answer. A blank one is not.
    const blank: Context = { ...onPage(), seen: { ...seenOn(), build: '' } }
    expectPanelError(t, () => targets.checkContext(blank, WORKSPACE, 'human'), 400)
  })

  it('still lets a page be pointed at with no evidence at all, which is what the product writes today', () => {
    // THE ACCEPTANCE OF THIS WHOLE STEP, AND IT IS AN ASSERTION RATHER THAN AN ASSUMPTION. A page
    // holds no text, so the rule above says evidence is REQUIRED for one. Nothing measures any yet,
    // and starting a review from a page that is about no record writes exactly this context. If the
    // requirement were turned on now, that write would start failing.
    //
    // The day the browser measures it, this test is changed deliberately. That is the point of it.
    expect(seenRuleFor('page')).toBe('required')
    expect(() => targets.checkContext(onPage(), WORKSPACE, 'human')).not.toThrow()
    expect(() => targets.checkContext(onPage('/sessions'), WORKSPACE, 'human')).not.toThrow()
  })

  it('still lets an ordinary comment be written on words of a report', () => {
    const recordId = report()
    const written: Context = {
      target: { kind: 'reportBlock', recordId, blockId: 'b-1' },
      span: { quote: 'holds calibration', from: 10, to: 27, field: 'data.blocks[#b-1].text' },
    }
    expect(() => targets.checkContext(written, WORKSPACE, 'human')).not.toThrow()
    const note = t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'annotation',
      title: 'this number looks wrong',
      data: { body: 'this number looks wrong', context: written },
      actor: HUMAN,
    })
    expect(note.id).not.toBe('')
  })

  it('still lets a comment go to an agent, and a review be started from one', async () => {
    const agents = await import('../src/server/lib/agents.ts')
    const reviews = await import('../src/server/lib/reviews.ts')
    const recordId = report()
    const thread = agents.createThread({ workspaceId: WORKSPACE, title: 'About the mount', mode: 'review' }, HUMAN)
    const message = agents.addMessage(
      thread.id,
      WORKSPACE,
      {
        intent: 'review',
        body: 'this number looks wrong',
        context: { target: { kind: 'record', recordId, workspaceId: WORKSPACE } },
      },
      AGENT,
    )
    expect(message.id).not.toBe('')
    const started = reviews.startReview(
      { workspaceId: WORKSPACE, entry: { target: { kind: 'record', recordId, workspaceId: WORKSPACE } } },
      HUMAN,
    )
    expect(started.review.id).not.toBe('')
  })
})

// ============================================================================ the union, at run time

describe('there is one vocabulary for the thing not being there', () => {
  it('holds five words, four of which the server already decided', () => {
    expect(CONTEXT_READINGS.length).toBe(5)
    expect([...CONTEXT_READINGS]).toEqual(['there', 'changed', 'gone', 'unknown', 'notDrawn'])
    // `notDrawn` is the one the browser decides, and it is the ordinary case rather than a rare
    // one: the composer's own parts are on screen only while a composer is open.
    expect(CONTEXT_READINGS).toContain('notDrawn')
    // The compile-time pin at the top of this file is what holds it to the server's own union.
    expect(_serverWordsAreAllInTheSharedUnion && _theSharedUnionAddsExactlyOneWord).toBe(true)
  })
})
