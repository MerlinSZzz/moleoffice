// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUICK NOTE HOLDS ITS PARTS IN THE ORDER THE PERSON PLACED THEM, AND THE DOOR CHECKS EACH ONE ON THE WAY IN.
 *
 * A quick note is a record of its own kind, `quick_note`. It holds written words, pen strokes, boxes, lines that join
 * two boxes by their ids, pictures and films kept by the path the report-files door handed back, and copies added
 * from a page. Each part's shape is checked, and a part the door cannot read is refused with words that name the part
 * by its place, its type and its id, and say why. The kind is in no family, so it is never listed under Reports, and
 * it is read on its own note page.
 *
 * Every note in this file is made up. Nothing is filed in an office.
 *
 * THE MUTATION THAT TURNS THIS RED, after a green control run: in `quickNoteCrossChecks`
 * (src/shared/kinds/quick-note.ts) skip the line's ends with `if (part['type'] === 'line' && false)`. The three
 * cases about a line to a missing box, to a picture and to itself turn red, because no refusal names the line.
 *
 * The last cases are about the title a note's own words give it, which the note page shows and files.
 */
import { describe, expect, it } from 'vitest'
import { validateData, type ValidationError } from '../src/shared/kinds.ts'
import { familyOf, noHeadingHolds, thePageAKindIsReadOn } from '../src/shared/work.ts'
import { quickNoteTitleOf, type QuickNotePart } from '../src/shared/kinds/quick-note.ts'

const PICTURE = '/srv/made-up-office/data/report-files/MadeUpPic001.png'
const FILM = '/srv/made-up-office/data/report-files/MadeUpFilm01.mp4'

/** One part of every type, in the order a person might have placed them. */
function everyPart(): Record<string, unknown>[] {
  return [
    { id: 'w-1', type: 'words', x: 24, y: 16, width: 360, text: 'Made-up words, with **bold** and $x^2$ in them.' },
    { id: 'b-1', type: 'box', x: 24, y: 120, width: 120, height: 60, text: 'Made-up first box' },
    { id: 'b-2', type: 'box', x: 220, y: 120, width: 120, height: 60 },
    { id: 'l-1', type: 'line', from: 'b-1', to: 'b-2' },
    { id: 's-1', type: 'stroke', colour: 'blue', width: 2, points: [10, 10, 14, 12, 20, 18] },
    { id: 'p-1', type: 'picture', x: 24, y: 220, width: 160, height: 90, path: PICTURE, name: 'made-up.png', size: 2048, hash: '0123456789abcdef', alt: 'A made-up sketch' },
    { id: 'v-1', type: 'video', x: 200, y: 220, width: 160, height: 90, path: FILM, name: 'made-up.mp4', size: 40960, hash: 'fedcba9876543210' },
    {
      id: 'a-1', type: 'added', x: 24, y: 330, width: 320, at: '2026-11-14 21:40:00',
      from: { address: '#/records/MadeUpRec001', name: 'A made-up report', recordId: 'MadeUpRec001' },
      copy: {
        type: 'blocks',
        blocks: [
          { id: 'c-1', type: 'text', text: 'Made-up words with $E = mc^2$, copied as they were drawn.' },
          { id: 'c-2', type: 'image', path: PICTURE, alt: 'A made-up picture, copied' },
        ],
      },
    },
    {
      id: 'a-2', type: 'added', x: 24, y: 420, width: 320, at: '2026-11-14 21:41:00',
      from: { address: '#/records/MadeUpRec002', name: 'A made-up task', recordId: 'MadeUpRec002' },
      copy: { type: 'card', recordId: 'MadeUpRec002', kind: 'task', title: 'A made-up task', summary: 'Made-up words.' },
    },
    {
      id: 'a-3', type: 'added', x: 24, y: 480, width: 320, at: '2026-11-14 21:42:00',
      from: { address: '#/plans', name: 'Plans' },
      copy: { type: 'page' },
    },
  ]
}

function refusals(parts: unknown[]): ValidationError[] {
  const result = validateData('quick_note', { parts })
  return result.ok ? [] : result.errors
}

/** The refusal at one path, which must name the part's id when the part has one. */
function refusalAt(parts: unknown[], path: string, id: string | null): ValidationError | undefined {
  const found = refusals(parts).find((error) => error.path === path)
  if (found !== undefined && id !== null) expect(found.message, `the refusal at ${path} does not name the part`).toContain(`"${id}"`)
  return found
}

describe('a quick note holds its parts in the order they were placed', () => {
  it('stores a new note with no parts yet, and asks for nothing more', () => {
    const result = validateData('quick_note', { parts: [] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.incomplete).toEqual([])
  })

  it('stores one part of every type, in the order sent, exactly as sent', () => {
    const data = { parts: everyPart(), from_page: { address: '#/records/MadeUpRec001', name: 'A made-up report', recordId: 'MadeUpRec001' } }
    const result = validateData('quick_note', data)
    expect(result.ok ? [] : result.errors).toEqual([])
    if (result.ok) expect(result.data).toEqual({ parts: everyPart(), from_page: data.from_page })
  })

  it('refuses a part of a type it does not know, and says which types there are', () => {
    const found = refusalAt([{ id: 'x-1', type: 'sticker', x: 1, y: 1 }], 'data.parts[0].type', null)
    expect(found?.message).toContain('sticker')
    for (const type of ['words', 'stroke', 'box', 'line', 'picture', 'video', 'added']) expect(found?.message).toContain(type)
  })

  it('refuses a part that leaves out what its type needs, and names the key', () => {
    const parts = everyPart()
    delete parts[1]!['height']
    expect(refusalAt(parts, 'data.parts[1].height', null)).toBeDefined()
  })

  it('refuses two parts that share an id, even of two types, and names both places', () => {
    const parts = everyPart()
    parts[4]!['id'] = 'b-1'
    const found = refusalAt(parts, 'data.parts[4].id', 'b-1')
    expect(found?.message).toContain('data.parts[1].id')
  })

  it('refuses a width or a height that is not above 0', () => {
    const parts = everyPart()
    parts[1]!['width'] = 0
    parts[5]!['height'] = -4
    expect(refusalAt(parts, 'data.parts[1].width', 'b-1')).toBeDefined()
    expect(refusalAt(parts, 'data.parts[5].height', 'p-1')).toBeDefined()
  })

  it('refuses a stroke whose points are not x and y pairs', () => {
    const parts = everyPart()
    parts[4]!['points'] = [10, 10, 14]
    expect(refusalAt(parts, 'data.parts[4].points', 's-1')).toBeDefined()
    parts[4]!['points'] = []
    expect(refusalAt(parts, 'data.parts[4].points', 's-1')).toBeDefined()
  })

  it('refuses a pen colour given as a colour value, so each theme draws its own', () => {
    const parts = everyPart()
    parts[4]!['colour'] = '#ff0000'
    expect(refusalAt(parts, 'data.parts[4].colour', null)).toBeDefined()
  })
})

describe('a line joins two boxes of the same note, so it stays joined when a box moves', () => {
  it('refuses a line to a box the note does not hold', () => {
    const parts = everyPart()
    parts[3]!['to'] = 'b-9'
    expect(refusalAt(parts, 'data.parts[3].to', 'l-1')?.message).toContain('"b-9"')
  })

  it('refuses a line to a part that is not a box, and says what that part is', () => {
    const parts = everyPart()
    parts[3]!['from'] = 'p-1'
    expect(refusalAt(parts, 'data.parts[3].from', 'l-1')?.message).toContain('picture')
  })

  it('refuses a line that joins a box to itself', () => {
    const parts = everyPart()
    parts[3]!['to'] = 'b-1'
    expect(refusalAt(parts, 'data.parts[3]', 'l-1')).toBeDefined()
  })

  it('takes a line placed before the boxes it joins, because the order is the order of drawing', () => {
    const parts = everyPart()
    const [line] = parts.splice(3, 1)
    parts.unshift(line!)
    expect(refusals(parts)).toEqual([])
  })
})

describe('a picture or a film is kept by its stored path, never by its bytes', () => {
  it('refuses a picture whose path is a data address holding the bytes', () => {
    const parts = everyPart()
    parts[5]!['path'] = 'data:image/png;base64,iVBORw0KGgo='
    expect(refusalAt(parts, 'data.parts[5].path', 'p-1')?.message).toContain('/api/report-files')
  })

  it('refuses a picture whose path opens only in the tab that made it', () => {
    const parts = everyPart()
    parts[5]!['path'] = 'blob:http://127.0.0.1/0f1e2d3c'
    expect(refusalAt(parts, 'data.parts[5].path', 'p-1')).toBeDefined()
  })

  it('refuses the bytes sent beside the path, as a key the part does not have', () => {
    const parts = everyPart()
    parts[5]!['bytes'] = 'iVBORw0KGgo='
    expect(refusalAt(parts, 'data.parts[5].bytes', null)).toBeDefined()
  })

  it('refuses a film whose file is not a film the page can play', () => {
    const parts = everyPart()
    parts[6]!['path'] = '/srv/made-up-office/data/report-files/MadeUpFilm01.mov'
    expect(refusalAt(parts, 'data.parts[6].path', 'v-1')).toBeDefined()
  })
})

describe('an added part keeps what was copied, as it was drawn', () => {
  it('refuses a copied block the office does not know, and names where it is', () => {
    const parts = everyPart()
    const copy = parts[7]!['copy'] as { blocks: Record<string, unknown>[] }
    copy.blocks[0]!['type'] = 'sparkle'
    expect(refusalAt(parts, 'data.parts[7].copy.blocks[0].type', null)).toBeDefined()
  })

  it('refuses an added part that does not say where it came from', () => {
    const parts = everyPart()
    delete parts[9]!['from']
    expect(refusalAt(parts, 'data.parts[9].from', null)).toBeDefined()
  })
})

describe('a quick note is not a report', () => {
  it('is in no family, so it is never listed under Reports, and is read on its own note page', () => {
    expect(familyOf('quick_note')).toBeNull()
    expect(thePageAKindIsReadOn('quick_note')).toBe('quickNote')
    expect(noHeadingHolds('quick_note')).toBe(false)
  })
})

describe('a note takes its title from its own first words', () => {
  it('takes the first line of the first part holding words, without its marks', () => {
    const parts = [
      { id: 's-1', type: 'stroke', colour: 'ink', width: 2, points: [1, 1, 4, 4] },
      { id: 'b-1', type: 'box', x: 0, y: 0, width: 80, height: 40 },
      { id: 'w-1', type: 'words', x: 0, y: 60, width: 200, text: '\n## Made-up **plan** for `Monday`\nThe second line' },
      { id: 'w-2', type: 'words', x: 0, y: 160, width: 200, text: 'Made-up later words' },
    ] as QuickNotePart[]
    expect(quickNoteTitleOf(parts)).toBe('Made-up plan for Monday')
  })

  it('cuts a long first line at a word, and marks the cut', () => {
    const line = `Made-up ${'words that go on '.repeat(8)}to the end`
    const title = quickNoteTitleOf([{ id: 'w-1', type: 'words', x: 0, y: 0, width: 200, text: line }])
    expect(title?.endsWith('…')).toBe(true)
    expect(title!.length).toBeLessThanOrEqual(80)
    expect(line.startsWith(title!.slice(0, -1))).toBe(true)
    expect(line[title!.length - 1]).toBe(' ')
  })

  it('has no title while it holds no words, so the page says it has none', () => {
    expect(quickNoteTitleOf([])).toBeNull()
    expect(
      quickNoteTitleOf([
        { id: 'w-1', type: 'words', x: 0, y: 0, width: 200, text: '  \n  ' },
        { id: 'b-1', type: 'box', x: 0, y: 40, width: 80, height: 40, text: '' },
      ]),
    ).toBeNull()
  })
})
