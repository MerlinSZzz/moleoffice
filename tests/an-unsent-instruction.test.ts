// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTRUCTION NOBODY HAS SENT: kept through a reload, pointed at, and changed before it goes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The case: write an instruction to an agent, do NOT send it, select a phrase
 * inside what you have just written, point at that phrase, and say what it should mean instead.
 * Mole Office has to understand that the second act is about the pending instruction and not about the
 * report the first act was about.
 *
 * It is the test of whether the target model is right: if pointing at a draft needs
 * machinery of its own, the model is wrong. It did not. `askedChange` below is four lines of
 * reading which of the thirteen kinds a gesture turned out to be, and every other part of the
 * gesture — the listener, the walk up the document tree, the span arithmetic — is the one that was
 * already there for a paragraph of a report.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE AND WHAT IS PROVED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Everything here is arithmetic over plain values, so it needs no document. Whether a person can
 * actually perform the gesture — select inside the composer, get an offer, get a panel and not a
 * second composer, and keep the report anchor — is measured in Chromium by
 * tests/changing-an-instruction-before-it-goes.test.ts, because a test that read these functions
 * would pass on a screen nobody could reach. That failure has happened five times this campaign.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS THAT COULD GO WRONG WITH NOTHING FAILING
 * ---------------------------------------------------------------------------------------
 *
 * 1. A change quietly following the words it points at after the instruction is edited. Nothing
 *    would fail; Mole Office would just be claiming a position nobody measured.
 * 2. A change being dropped at the moment the instruction is finally written down, so the words a
 *    person typed reach nobody. Every press would still work.
 * 3. The words of an instruction being rewritten to fold a change into the sentence it is about.
 *    That is the eighth rule broken, and it reads as a tidy result.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { MessageContext } from '../src/web/components/agent/context.ts'

type Drafts = typeof import('../src/web/lib/drafts.ts')
type Layer = typeof import('../src/web/components/agent/PointingLayer.tsx')
type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')

let drafts: Drafts
let layer: Layer
let talk: Talk

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, and src/web/lib/drafts.ts reads this
  // browser's own store as it is imported, so the smallest stand-in goes in before anything is
  // imported. Copied from tests/the-composer-is-short.test.ts, which says the same thing.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  drafts = await import('../src/web/lib/drafts.ts')
  layer = await import('../src/web/components/agent/PointingLayer.tsx')
  talk = await import('../src/web/components/agent/TalkBox.tsx')
})

const INSTRUCTION = 'Investigate this number. If it is wrong, create a Problem and fix it.'
const PHRASE = 'create a Problem'
const INSTEAD = 'Do not create it automatically. Investigate first and only propose a Problem if confirmed.'

/** Where the phrase sits in the instruction, worked out here rather than typed in twice. */
const AT = INSTRUCTION.indexOf(PHRASE)

function aChange(over: Partial<import('../src/web/lib/drafts.ts').DraftChange> = {}) {
  return { id: 'c1', quote: PHRASE, from: AT, to: AT + PHRASE.length, said: INSTEAD, ...over }
}

// ============================================================ 1. pointing at it needs no machinery

describe('an instruction nobody has sent is read by the reader every other thing is read by', () => {
  /**
   * A `Pointed` carries the element it was read off, and nothing in `askedChange` looks at it.
   * There is no document in this runner, so the field is filled with a value that would throw if
   * anything touched it — which is the assertion, made by construction rather than by a mock.
   */
  const noElement = null as unknown as HTMLElement

  function pointedAt(context: MessageContext) {
    // `place` and `kept` are the two fields step 19 put on a `Pointed`, and `askedChange` reads
    // neither of them. `surface` is the honest floor — no place finer than the thing — and a
    // gesture with no selection keeps no range, so both are the values a press on a whole thing
    // really produces. Handed over as design/round-nine/step19-an-unsent-instruction.patch, and
    // made here as well because a type error in the shared checkout blocks every other agent.
    return { element: noElement, context, about: '', place: { at: 'surface' } as const, kept: null, problems: [] }
  }

  it('says nothing about a gesture on a report, which is every other gesture in the product', () => {
    const onAReport: MessageContext = {
      target: { kind: 'reportBlock', recordId: 'LKJQbOhAK3kz', blockId: 'b-1' },
      span: { quote: 'fifteen newtons', from: 40, to: 55, field: 'data.blocks[#b-1].text' },
    }
    expect(layer.askedChange(pointedAt(onAReport), { x: 10, y: 10 })).toBe(null)
  })

  it('names the instruction and the exact phrase inside it', () => {
    const onTheDraft: MessageContext = {
      target: { kind: 'draft', draftId: 'dABC1' },
      span: { quote: PHRASE, from: AT, to: AT + PHRASE.length, field: 'body' },
    }
    expect(layer.askedChange(pointedAt(onTheDraft), { x: 10, y: 20 })).toEqual({
      draftId: 'dABC1',
      span: { quote: PHRASE, from: AT, to: AT + PHRASE.length },
      at: { x: 10, y: 20 },
    })
  })

  it('says no phrase when the whole instruction was pointed at, rather than inventing one', () => {
    const wholeThing: MessageContext = { target: { kind: 'draft', draftId: 'dABC1' } }
    expect(layer.askedChange(pointedAt(wholeThing), { x: 0, y: 0 })?.span).toBe(null)
  })
})

// ============================================================ 2. the words a change points at

describe('where the words a change points at are now', () => {
  /**
   * OFFSETS ARE EVIDENCE AND ARE NEVER REPAIRED. It is the same rule the server keeps for a quote
   * taken off a report, and it matters more here: a person edits their own instruction constantly,
   * so the case where the numbers stop landing on the words is the ordinary case rather than a rare
   * one. Following the words would make Mole Office claim a position nobody measured.
   */
  it('says the words are there while the instruction still holds them where they were', () => {
    expect(drafts.whereTheChangeIs(INSTRUCTION, aChange())).toBe('there')
  })

  it('says they moved rather than moving them', () => {
    const edited = `First: ${INSTRUCTION}`
    expect(drafts.whereTheChangeIs(edited, aChange())).toBe('moved')
  })

  it('says they are gone when the instruction no longer holds them at all', () => {
    const edited = 'Investigate this number and tell me what you find.'
    expect(drafts.whereTheChangeIs(edited, aChange())).toBe('gone')
  })

  it('says nothing on the screen while the words are there, and says something when they are not', () => {
    expect(drafts.whereTheChangeIsWords('there')).toBe(null)
    expect(drafts.whereTheChangeIsWords('moved')).toContain('in another place')
    expect(drafts.whereTheChangeIsWords('gone')).toContain('no longer in it')
    // Two different situations, so two different sentences. One sentence for both would be a
    // reader told the words have gone when they are still in front of them.
    expect(drafts.whereTheChangeIsWords('moved')).not.toBe(drafts.whereTheChangeIsWords('gone'))
  })
})

// ============================================================ 3. what is finally sent

describe('what is finally sent carries the instruction and every change made to it', () => {
  it('is the instruction exactly, character for character, when nothing was changed', () => {
    expect(drafts.instructionToSend({ body: INSTRUCTION, changes: [] })).toBe(INSTRUCTION)
  })

  /**
   * THE INSTRUCTION IS NEVER REWRITTEN. The tempting thing is to fold the change into the sentence
   * it is about — to replace "create a Problem" with what the person said instead. That is Mole Office
   * editing somebody's words, and the agent reading it would have no way to tell which half was
   * typed by whom. So the instruction comes first and untouched, and the changes are added under it.
   */
  it('keeps the instruction first and untouched, and adds the change under it', () => {
    const sent = drafts.instructionToSend({ body: INSTRUCTION, changes: [aChange()] })
    expect(sent.startsWith(INSTRUCTION)).toBe(true)
    expect(sent).toContain(`"${PHRASE}"`)
    expect(sent).toContain(INSTEAD)
  })

  /**
   * A CHANGE WHOSE WORDS ARE GONE STILL GOES, AND SAYS SO. Dropping it would lose words a person
   * wrote, which is the one thing this whole round exists to stop. Sending it in silence would have
   * an agent hunting a phrase that is not in the instruction above it.
   */
  it('says when a change points at words the instruction no longer holds', () => {
    const edited = 'Investigate this number and tell me what you find.'
    const sent = drafts.instructionToSend({ body: edited, changes: [aChange()] })
    expect(sent).toContain(INSTEAD)
    expect(sent).toContain('no longer in the instruction above')
  })

  it('says nothing of the kind while the words are still there', () => {
    const sent = drafts.instructionToSend({ body: INSTRUCTION, changes: [aChange()] })
    expect(sent).not.toContain('no longer in the instruction above')
  })
})

// ============================================================ 4. kept in this browser

describe('an instruction is kept in this browser, with an id, so it can be pointed at', () => {
  it('reads back what it wrote, by the thing it is about and by its own id', () => {
    const id = drafts.newDraftId()
    drafts.keepDraft({ id, key: 'record/r1/panelx', intent: 'ask', body: INSTRUCTION, changes: [] })
    expect(drafts.draftAbout('record/r1/panelx')?.body).toBe(INSTRUCTION)
    expect(drafts.draftById(id)?.body).toBe(INSTRUCTION)
    drafts.forgetDraft(id)
    expect(drafts.draftById(id)).toBe(undefined)
  })

  it('keeps a change with the instruction it belongs to', () => {
    const id = drafts.newDraftId()
    drafts.keepDraft({ id, key: 'record/r2/panelx', intent: 'ask', body: INSTRUCTION, changes: [aChange()] })
    expect(drafts.draftById(id)?.changes[0]?.said).toBe(INSTEAD)
    drafts.forgetDraft(id)
  })

  it('gives every instruction a different id, because two of them naming one thing names neither', () => {
    const many = new Set(Array.from({ length: 200 }, () => drafts.newDraftId()))
    expect(many.size).toBe(200)
  })

  it('makes an id that can be written into the attribute an element carries', () => {
    // The parts of `data-target` are separated by a slash, and a blank one is refused by the
    // reader. Both are properties of the id itself rather than of the element that carries it.
    for (let n = 0; n < 50; n += 1) {
      const id = drafts.newDraftId()
      expect(id).not.toBe('')
      expect(id).toMatch(/^[a-z0-9]+$/)
    }
  })
})

describe('a stored list written by an older build', () => {
  /**
   * THIS TEST WOULD HAVE FAILED BEFORE THE PRODUCT GOT MORE HONEST, and it is worth saying which
   * way round. The build before this one stored `{ key, intent, body }`, and that is what is in the
   * owner's browser right now holding whatever they had started typing. Refusing it would have been
   * strict and would have thrown their words away. A missing `changes` is not a guess — that build
   * had none — and a missing id is given one, because an id is this browser's handle for the words
   * rather than a claim about them.
   */
  it('is read rather than thrown away, and the words survive the upgrade', () => {
    const older = JSON.stringify([{ key: 'record/r1/panelx', intent: 'ask', body: 'half a thought' }])
    const read = drafts.draftsFromStored(older)
    expect(read?.length).toBe(1)
    expect(read?.[0]?.body).toBe('half a thought')
    expect(read?.[0]?.changes).toEqual([])
    expect(read?.[0]?.id).not.toBe('')
  })

  it('is still refused outright when this build has no meaning for it', () => {
    expect(drafts.draftsFromStored('not json at all')).toBe(null)
    expect(drafts.draftsFromStored('{"key":"r1"}')).toBe(null)
    expect(drafts.draftsFromStored(JSON.stringify([{ key: 'r1', body: 'x' }]))).toBe(null)
    expect(drafts.draftsFromStored(JSON.stringify([{ key: 'r1', intent: 'ponder', body: 'x' }]))).toBe(null)
  })

  it('refuses a change it cannot read, rather than half-restoring the instruction it belongs to', () => {
    const broken = JSON.stringify([
      { key: 'r1', intent: 'ask', body: 'x', changes: [{ id: 'c1', quote: 'a', said: 'b', from: 'nought', to: 1 }] },
    ])
    expect(drafts.draftsFromStored(broken)).toBe(null)
  })
})

// ============================================================ 5. where the panel opens

describe('the panel opens beside the composer and not on top of it', () => {
  /**
   * Every other popup in this product opens at the pointer. This one may not, and the reason was
   * photographed at 1440 on 19 August 2026: the pointer is INSIDE the composer, so a panel placed
   * there covered the instruction it exists to change.
   */
  it('sits just past the right edge of the composer, level with its top', () => {
    const composer = { getBoundingClientRect: () => ({ right: 886, top: 420, width: 384, height: 470 }) }
    expect(talk.besideTheComposer(composer as unknown as HTMLElement, { x: 540, y: 640 })).toEqual({ x: 894, y: 420 })
  })

  it('falls back to the pointer when there is nothing measured to sit beside', () => {
    expect(talk.besideTheComposer(null, { x: 540, y: 640 })).toEqual({ x: 540, y: 640 })
    const unmeasured = { getBoundingClientRect: () => ({ right: 0, top: 0, width: 0, height: 0 }) }
    expect(talk.besideTheComposer(unmeasured as unknown as HTMLElement, { x: 5, y: 7 })).toEqual({ x: 5, y: 7 })
  })
})

// ============================================================ 6. what the panel refuses

describe('what the box says about words nobody has written down', () => {
  /**
   * IT IS ONE SHORT LINE NOW, and this test is the reason it is safe to shorten. The composer must
   * not explain itself in paragraphs, and this sentence is drawn under the
   * press on every keystroke. It still says both of the things a person needs — the words are kept,
   * and they are not a comment yet — and the promise it makes is still the true one.
   */
  it('says the words survive a reload, in under a dozen words', () => {
    const said = drafts.whatKeepsTheWords(null)
    expect(said).toContain('reload')
    expect(said.split(' ').length).toBeLessThan(12)
  })

  it('says out loud when this browser will not remember them, and takes as many words as it needs', () => {
    const said = drafts.whatKeepsTheWords('storage is disabled in this profile')
    expect(said).toContain('will not remember it (storage is disabled in this profile)')
    expect(said).not.toBe(drafts.whatKeepsTheWords(null))
  })
})

describe('why a change cannot be made', () => {
  /**
   * THE SECOND ARGUMENT IS WHETHER THERE ARE WORDS TO CHANGE, and it used to be the words
   * themselves. It changed on 20 August 2026 with the panel that reads it: in the
   * whole-instruction case the panel is no longer handed the instruction at all, so that it cannot
   * draw a cut of somebody's own sentence back at them as the phrase they aimed at. The three
   * cases below are the same three; what each one says is unchanged.
   */
  it('asks for the instruction first when there is nothing to point at', () => {
    expect(talk.whyNotChangeIt(INSTEAD, false)).toContain('Write the instruction first')
  })

  it('asks what should happen instead, which is the one thing the panel is for', () => {
    expect(talk.whyNotChangeIt('   ', true)).toBe('Say what should happen instead.')
  })

  /**
   * WHO THE MESSAGE IS FOR IS NOT ON THIS LIST, and that is the owner's twelfth condition seen from
   * the other side: changing a phrase of an instruction neither asks about the recipient nor
   * touches it. A refusal that mentioned one would be this panel holding an opinion about a field
   * it cannot set.
   */
  it('refuses nothing else, so nothing about the recipient can hold a change up', () => {
    expect(talk.whyNotChangeIt(INSTEAD, true)).toBe(null)
  })
})
