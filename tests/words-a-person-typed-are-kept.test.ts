// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NOTHING A PERSON TYPES INTO THE COMPOSER IS LOST WITHOUT BEING SAID.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LOSSES THIS FILE IS AIMED AT, ALL THREE MEASURED ON 19 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1. A HALF-WRITTEN CHANGE WAS THROWN AWAY IN SILENCE. The panel that changes an instruction held
 *    its words in its own state, so pressing the page closed both boxes and the sentence typed into
 *    the panel was gone. The composer then said "What you had started writing here is back" and
 *    listed no change and no warning — the one loss in this feature that was not announced, in a
 *    file whose own header says a browser refusing the store, an unreadable stored list and an
 *    evicted instruction are all said out loud.
 *
 * 2. A KEPT INSTRUCTION COULD ONLY BE FOUND BY REPRODUCING A CHARACTER OFFSET. The draft was held
 *    under the target AND the character the selection started at, so an instruction kept under
 *    `reportBlock/…/b-prose:4` was invisible to a selection starting at character 34 of the same
 *    paragraph: the composer opened empty and said nothing. Nothing in Mole Office lists unsent
 *    instructions, so there was no other way back to them.
 *
 * 3. AN EVICTION ON AN EARLIER VISIT WAS SILENT. Twenty are kept and the oldest goes, and the count
 *    of what was dropped can only speak for the current visit because nothing writes an eviction
 *    down. What CAN be said at any moment is that the store is full, and it is the same warning one
 *    step earlier.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE AND WHAT IS PROVED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Everything here is arithmetic over plain values and this browser's own store, so it needs no
 * document. Whether a PERSON can perform any of it — press the offer beside their own words, get
 * the panel, close it and get the sentence back — is measured in Chromium by
 * tests/pressing-the-offer-keeps-the-composer.test.ts. A test that read only these functions would
 * pass on a screen nobody could reach, which is the failure this campaign has produced five times.
 */

import { beforeAll, describe, expect, it } from 'vitest'

type Drafts = typeof import('../src/web/lib/drafts.ts')

let drafts: Drafts

beforeAll(async () => {
  // src/web/lib/drafts.ts reads this browser's own store as it is imported, so the smallest
  // stand-in goes in before anything is imported. Copied from tests/an-unsent-instruction.test.ts.
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
})

const INSTRUCTION = 'Investigate this number. If it is wrong, create a Problem and fix it.'
const PHRASE = 'create a Problem'
const AT = INSTRUCTION.indexOf(PHRASE)
const HALF = 'Half a sentence nobody finished'

function aChange(over: Partial<import('../src/web/lib/drafts.ts').DraftChange> = {}) {
  return { id: 'c1', quote: PHRASE, from: AT, to: AT + PHRASE.length, said: HALF, ...over }
}

// ============================================================ 1. a change being written is kept

describe('a change somebody is still writing is kept with the instruction it belongs to', () => {
  it('survives the panel closing, and reads back under the same words', () => {
    const id = drafts.newDraftId()
    drafts.keepDraft({
      id,
      key: 'record/kept1/panelx',
      intent: 'ask',
      body: INSTRUCTION,
      changes: [],
      beingWritten: [aChange()],
      startedOn: null,
    })
    const back = drafts.draftById(id)
    expect(back?.beingWritten?.[0]?.said, 'the half-written change was thrown away').toBe(HALF)
    expect(back?.beingWritten?.[0]?.quote).toBe(PHRASE)
    drafts.forgetDraft(id)
  })

  it('keeps an instruction alive that holds nothing but a change being written', () => {
    // The words are the point, wherever they were typed. An instruction with an empty box and a
    // half-written change is still words somebody typed.
    const id = drafts.newDraftId()
    drafts.keepDraft({
      id,
      key: 'record/kept2/panelx',
      intent: 'ask',
      body: '',
      changes: [],
      beingWritten: [aChange()],
      startedOn: null,
    })
    expect(drafts.draftById(id)?.beingWritten?.length).toBe(1)
    drafts.forgetDraft(id)
  })

  it('forgets one that holds nothing at all', () => {
    const id = drafts.newDraftId()
    drafts.keepDraft({ id, key: 'record/kept3/panelx', intent: 'ask', body: '', changes: [], beingWritten: [] })
    expect(drafts.draftById(id)).toBe(undefined)
  })

  /**
   * A CHANGE NOBODY MADE NEVER REACHES AN AGENT. That is why it is a second list and not a flag on
   * the first: what is finally sent reads `changes`, and it cannot see these at all. With one list
   * and a flag, handing an agent words the person abandoned would be one forgotten filter away.
   */
  it('is not part of what is finally sent', () => {
    expect(drafts.instructionToSend({ body: INSTRUCTION, changes: [] })).toBe(INSTRUCTION)
    const sent = drafts.instructionToSend({ body: INSTRUCTION, changes: [aChange({ said: 'this one was made' })] })
    expect(sent).toContain('this one was made')
    expect(sent).not.toContain(HALF)
  })

  it('is read back from a stored list, and refused when it cannot be read', () => {
    const stored = JSON.stringify([
      { id: 'd1', key: 'r1', intent: 'ask', body: 'x', changes: [], beingWritten: [aChange()] },
    ])
    expect(drafts.draftsFromStored(stored)?.[0]?.beingWritten?.[0]?.said).toBe(HALF)
    const broken = JSON.stringify([
      { id: 'd1', key: 'r1', intent: 'ask', body: 'x', beingWritten: [{ id: 'c', quote: 'a', said: 'b', from: 'no' }] },
    ])
    expect(drafts.draftsFromStored(broken), 'a change it cannot read was half-restored').toBe(null)
  })

  it('is nothing at all on a row an older build wrote, which had none', () => {
    const older = JSON.stringify([{ key: 'record/r1/panelx', intent: 'ask', body: 'half a thought' }])
    expect(drafts.draftsFromStored(older)?.[0]?.beingWritten).toEqual([])
  })
})

// ============================================================ 2. found again, and said honestly

describe('an instruction is found again by the thing it is about', () => {
  it('is held under the target and not under one selection inside it', () => {
    const id = drafts.newDraftId()
    drafts.keepDraft({
      id,
      key: 'reportBlock/abc/b-1',
      intent: 'ask',
      body: INSTRUCTION,
      changes: [],
      beingWritten: [],
      startedOn: 'the gripper let go',
    })
    // The composer builds this key from the target alone. A key carrying the offset would be a
    // different string for every selection, which is exactly what made these words unreachable.
    expect(drafts.draftAbout('reportBlock/abc/b-1')?.body).toBe(INSTRUCTION)
    drafts.forgetDraft(id)
  })

  it('says only that the words came back when they came back beside the words they were begun on', () => {
    expect(drafts.whatCameBack('the gripper let go', 'the gripper let go')).toBe(
      'What you had started writing here is back.',
    )
    expect(drafts.whatCameBack(null, null)).toBe('What you had started writing here is back.')
  })

  it('says which words it was begun about when they are not the words selected now', () => {
    const said = drafts.whatCameBack('the gripper let go', '37% of runs')
    expect(said).toContain('is back')
    expect(said, 'the reader is not told which words it was begun about').toContain('the gripper let go')
    expect(said).toContain('the words you have selected now')
  })

  it('tells the two directions apart, because they are two different situations', () => {
    // Begun about the whole thing, now about a phrase — and the other way round.
    expect(drafts.whatCameBack(null, '37% of runs')).toContain('You began it about the whole thing')
    expect(drafts.whatCameBack('37% of runs', null)).toContain('this comment will be about the whole thing')
  })

  /**
   * A ROW AN OLDER BUILD WROTE RECORDED NOTHING, and nothing is claimed about it. Reading a missing
   * value as "the whole thing" would put a sentence on the screen about a measurement nobody took.
   */
  it('says nothing extra when nothing recorded what it was begun about', () => {
    expect(drafts.whatCameBack(undefined, '37% of runs')).toBe('What you had started writing here is back.')
    const older = JSON.stringify([{ key: 'record/r1/panelx', intent: 'ask', body: 'half a thought' }])
    expect(drafts.draftsFromStored(older)?.[0]?.startedOn).toBe(undefined)
  })

  it('refuses a stored value it has no meaning for rather than half-reading it', () => {
    const broken = JSON.stringify([{ key: 'r1', intent: 'ask', body: 'x', startedOn: 12 }])
    expect(drafts.draftsFromStored(broken)).toBe(null)
  })
})

// ============================================================ 3. a full store says so

describe('what the box says about the words that are not a comment yet', () => {
  it('says they are kept, and says nothing else while there is nothing else to say', () => {
    const said = drafts.whatKeepsTheWords(null, 0, 0)
    expect(said).toContain('Kept here')
    expect(said).not.toContain('dropped')
    expect(said).not.toContain('holding')
  })

  it('says when an older instruction was dropped while this page has been open', () => {
    expect(drafts.whatKeepsTheWords(null, 1, 20)).toContain('dropped to make room')
    expect(drafts.whatKeepsTheWords(null, 3, 20)).toContain('3 oldest were dropped')
  })

  /**
   * THE STORE IS FULL, SAID BEFORE THE NEXT INSTRUCTION PUSHES SOMETHING OUT.
   *
   * Nothing writes an eviction down, so a count can only ever speak for the visit it happened in —
   * an instruction dropped yesterday is a thing this browser cannot report today. Being full needs
   * nothing stored and is true at any moment, and it warns the person one step earlier.
   */
  it('says the store is full while it is full, whether or not anything was dropped this visit', () => {
    const said = drafts.whatKeepsTheWords(null, 0, drafts.KEEP_AT_MOST)
    expect(said, 'a full store said nothing about being full').toContain('which is all it keeps')
    expect(said).toContain(String(drafts.KEEP_AT_MOST))
  })

  it('says nothing about being full while there is room', () => {
    expect(drafts.whatKeepsTheWords(null, 0, drafts.KEEP_AT_MOST - 1)).not.toContain('which is all it keeps')
  })

  it('does not say both, because a reader told one was dropped knows the store is full', () => {
    expect(drafts.whatKeepsTheWords(null, 1, drafts.KEEP_AT_MOST)).not.toContain('which is all it keeps')
  })

  it('still says the words will not survive a reload when this browser refuses the store', () => {
    const said = drafts.whatKeepsTheWords('storage is disabled in this profile', 0, drafts.KEEP_AT_MOST)
    expect(said).toContain('will be lost on a reload')
    expect(said).toContain('which is all it keeps')
  })
})
