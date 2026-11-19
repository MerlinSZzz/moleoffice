// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED CHAT DRAFT IS THE DRAFT AS IT WAS TYPED, whatever order the person types and edits in, from wave 13w round
 * 10.
 *
 * The chat keeps each draft in session storage, through `theDraftAsTheStoreKeepsIt` (src/web/lib/the-kept-chat-draft.ts).
 * From round 40 of wave 13n to round 9 of wave 13w the stored copy left out every piece that looked like a key and every
 * word still being written, so a reload lost them. The owner called that leaving-out redundant: a person is asked once
 * before a send instead. Here the person's typing is played one key at a time, as the box hands
 * it on, and the stored copy is read after every key.
 *
 * The key is made up and put together when the test runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · half a key typed at the end, then a letter typed at the start and in another word: every stored copy is the
 *     draft at that moment.
 *   · a whole key typed into the middle of a draft, then the start edited: the same.
 *   · a whole key followed by a space: the same, and the store holds the key.
 *   · an ordinary draft, typed one letter at a time or pasted: the same, the last word included.
 *     MUTATION: `theDraftAsTheStoreKeepsIt` leaves out what `whatLooksLikeASecret` finds. The second and third go red;
 *     the first does not, because half a key is not a key to the rule. MUTATION: it keeps the word still being written
 *     out again (the stored copy ends at the last space). All four go red.
 */
import { describe, expect, it } from 'vitest'
import { theDraftAsTheStoreKeepsIt } from '../src/web/lib/the-kept-chat-draft.ts'

const KEY = '0123456789abcdef'.repeat(4)
const HALF = KEY.slice(0, 8)

/** A chat box, played one change at a time as the box hands each change on, with every stored copy it wrote. */
class TheBox {
  draft = ''
  writing: string[] = []
  stored = ''
  /** Each change, as the draft and the copy the store kept of it. */
  everyChange: { draft: string; kept: string }[] = []

  private change(next: string): void {
    const keeps = theDraftAsTheStoreKeepsIt(this.draft, next, this.writing)
    this.draft = next
    this.writing = keeps.writing
    this.stored = keeps.kept
    this.everyChange.push({ draft: next, kept: keeps.kept })
  }

  /** Type `text` one character at a time at `at`, or at the end. */
  type(text: string, at = this.draft.length): this {
    let where = at
    for (const letter of text) {
      this.change(this.draft.slice(0, where) + letter + this.draft.slice(where))
      where += 1
    }
    return this
  }

  /** Paste `text` at the end in one change. */
  paste(text: string): this {
    this.change(this.draft + text)
    return this
  }

  /** The first change whose stored copy was not the draft, or null. */
  firstDifference(): { draft: string; kept: string } | null {
    return this.everyChange.find((one) => one.kept !== one.draft) ?? null
  }
}

describe('the stored chat draft', () => {
  it('is the draft after every key, when half a key is typed and another word is edited', () => {
    const box = new TheBox().type('Test: the key is ').type(HALF)
    box.type('X', 0)
    box.type('y', 'XTest: the'.length)
    expect(box.draft).toBe(`XTest: they key is ${HALF}`)
    expect(box.firstDifference()).toBe(null)
  })

  it('is the draft after every key, when a whole key is typed into the middle and the start is edited', () => {
    const box = new TheBox().type('Test: hello there friend ')
    const middle = 'Test: hello '.length
    box.type(KEY + ' ', middle)
    box.type('Y', 0)
    expect(box.draft).toBe(`YTest: hello ${KEY} there friend `)
    expect(box.firstDifference()).toBe(null)
  })

  it('holds a whole key followed by a space, as typed', () => {
    const box = new TheBox().type('Test: the key is ').type(KEY).type(' ')
    expect(box.stored).toBe(`Test: the key is ${KEY} `)
    expect(box.writing, 'no word is held back as still being written').toEqual([])
    expect(box.firstDifference()).toBe(null)
  })

  it('keeps an ordinary draft whole, typed one letter at a time or pasted, the last word included', () => {
    const typed = new TheBox().type('Test: see you at noon')
    expect(typed.stored).toBe('Test: see you at noon')
    typed.type('X', 0)
    expect(typed.stored).toBe('XTest: see you at noon')
    expect(typed.firstDifference()).toBe(null)

    const pasted = new TheBox().paste('Test: lunch at one,\nthen the review.\n')
    expect(pasted.stored).toBe('Test: lunch at one,\nthen the review.\n')
  })
})
