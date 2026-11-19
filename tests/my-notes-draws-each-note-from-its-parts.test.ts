// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MY NOTES DRAWS EACH NOTE FROM ITS OWN PARTS, point QN-3 of the quick-notes package (wave 13y round 167).
 *
 * WHAT IS BEING PROVED.
 *   1. My notes has an address of its own, beside the other pages.
 *   2. Each card's small picture is worked out from the note's stored parts each time it is drawn, never kept as a
 *      picture, so it cannot go stale. Its strokes, boxes and lines are the note's own. A line joins the middles of
 *      the two boxes it names, and the picture's frame holds every part it draws.
 *   3. A note with nothing drawn has no small picture, and the card can say what else the note holds.
 *   4. The card's first words are the note's title, by the kind's own rule, and the lines after it.
 *
 * The runner is `node`, with no DOM. The functions read here are the ones the page draws with. Every note here is made
 * up, and its words say so.
 */
import { describe, expect, it } from 'vitest'
import { FLAT_ROUTES, parseRoute } from '../src/shared/addresses.ts'
import { quickNoteTitleOf, type QuickNotePart } from '../src/shared/kinds/quick-note.ts'
import { theFirstWordsOf, theSmallPictureOf, whatTheSmallPictureLeavesOut } from '../src/web/components/NoteSmallPicture.tsx'

const FILE = { path: '/srv/made-up/report-files/made-up.png', name: 'made-up.png', size: 10, hash: '0123456789abcdef' }

/** A made-up note with words, two boxes joined by a line, and one red stroke. */
const DRAWN: QuickNotePart[] = [
  { id: 'w-first', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up words: ask about the **second** clamp.' },
  { id: 'b-first', type: 'box', x: 40, y: 180, width: 160, height: 72, text: 'Made-up step one' },
  { id: 'b-second', type: 'box', x: 280, y: 180, width: 160, height: 72 },
  { id: 'l-first', type: 'line', from: 'b-first', to: 'b-second' },
  { id: 's-first', type: 'stroke', colour: 'red', width: 2, points: [40, 120, 52, 124, 70, 131] },
]

/** A made-up note that holds no drawing: words, a picture, a film and a thing added from a page. */
const UNDRAWN: QuickNotePart[] = [
  { id: 'w-first', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up words with nothing drawn.' },
  { id: 'p-first', type: 'picture', x: 40, y: 100, width: 200, height: 120, ...FILE },
  { id: 'v-first', type: 'video', x: 40, y: 240, width: 200, height: 120, ...FILE, path: '/srv/made-up/report-files/made-up.mp4', name: 'made-up.mp4' },
  {
    id: 'a-first',
    type: 'added',
    x: 40,
    y: 380,
    width: 320,
    at: '2026-11-15 00:00:00',
    from: { address: '#/records', name: 'Everything' },
    copy: { type: 'page' },
  },
]

describe('the My notes page', () => {
  it('has an address of its own beside the other pages', () => {
    expect(FLAT_ROUTES['my-notes']).toBe('myNotes')
    expect(parseRoute('#/my-notes')).toEqual({ name: 'myNotes' })
  })
})

describe('a note’s small picture, worked out from its parts', () => {
  it('draws the note’s own strokes, boxes and lines, and nothing else', () => {
    const picture = theSmallPictureOf(DRAWN)
    expect(picture).not.toBeNull()
    if (picture === null) return
    expect(picture.strokes).toEqual([{ id: 's-first', colour: 'red', width: 2, points: '40,120 52,124 70,131' }])
    expect(picture.boxes).toEqual([
      { id: 'b-first', x: 40, y: 180, width: 160, height: 72 },
      { id: 'b-second', x: 280, y: 180, width: 160, height: 72 },
    ])
    // A LINE JOINS THE MIDDLES OF ITS TWO BOXES. The boxes are drawn over it, so it is seen from edge to edge.
    expect(picture.lines).toEqual([{ id: 'l-first', x1: 120, y1: 216, x2: 360, y2: 216 }])
  })

  it('frames every part it draws', () => {
    const picture = theSmallPictureOf(DRAWN)
    if (picture === null) throw new Error('the drawn note has no small picture')
    const { x, y, width, height } = picture.frame
    // The stroke's left edge is half its width left of its first point, and the second box ends at 440 by 252.
    expect(x).toBeLessThanOrEqual(39)
    expect(y).toBeLessThanOrEqual(119)
    expect(x + width).toBeGreaterThanOrEqual(440)
    expect(y + height).toBeGreaterThanOrEqual(252)
  })

  it('moves with the parts, because nothing of it is kept', () => {
    const moved = DRAWN.map((part) => (part.id === 'b-second' ? { ...part, x: 520, y: 400 } : part))
    const picture = theSmallPictureOf(moved)
    expect(picture?.lines).toEqual([{ id: 'l-first', x1: 120, y1: 216, x2: 600, y2: 436 }])
    expect(picture?.boxes[1]).toEqual({ id: 'b-second', x: 520, y: 400, width: 160, height: 72 })
  })

  it('has no small picture for a note with nothing drawn, and counts what the note holds besides', () => {
    expect(theSmallPictureOf(UNDRAWN)).toBeNull()
    expect(theSmallPictureOf([])).toBeNull()
    expect(whatTheSmallPictureLeavesOut(UNDRAWN)).toEqual({ pictures: 1, videos: 1, added: 1 })
    expect(whatTheSmallPictureLeavesOut(DRAWN)).toEqual({ pictures: 0, videos: 0, added: 0 })
  })
})

describe('a note’s first words', () => {
  it('are its title, by the kind’s own rule, and the lines after it with their marks taken off', () => {
    const parts: QuickNotePart[] = [
      { id: 'w-first', type: 'words', x: 0, y: 0, width: 300, text: '# Made-up heading\n\n- a made-up **first** point\n> a made-up quote' },
      { id: 'b-first', type: 'box', x: 0, y: 200, width: 100, height: 40, text: 'Made-up box' },
    ]
    expect(theFirstWordsOf(parts)).toEqual({
      title: quickNoteTitleOf(parts),
      after: 'a made-up first point a made-up quote Made-up box',
    })
    expect(theFirstWordsOf(parts).title).toBe('Made-up heading')
  })

  it('are nothing for a note with no words, so the card says the note has none', () => {
    expect(theFirstWordsOf(DRAWN.filter((part) => part.type !== 'words' && part.type !== 'box'))).toEqual({ title: null, after: '' })
  })
})
