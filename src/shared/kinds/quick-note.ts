// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `quick_note`, a note the person writes and draws in.
 *
 * A QUICK NOTE IS NOT A `note`, and that is why it is a kind of its own. A `note` is in the "Reports and notes"
 * family, so it is listed under Reports, and a quick note is not. A note's words are one plain string, and a quick
 * note holds parts in the order the person placed them, each checked on the way in. The `note` kind also carries
 * other meanings already: words typed in a terminal, and words prepared for the person to file. A quick note is in
 * no family. It is read on its own page, which `THE_PAGE_A_KIND_IS_READ_ON` in ../work.ts names.
 *
 * NO BYTES ARE KEPT IN THE RECORD. A picture or a film is stored first with POST /api/report-files, and its part
 * keeps the four facts that door hands back. The file door finds a stored path by walking a record's data for
 * `path`, as it finds a report's picture, so it serves a note's pictures with no list of its own.
 *
 * A LINE NAMES THE TWO BOXES IT JOINS, never two points, so it stays joined when a box moves.
 *
 * THIS FILE IMPORTS TYPES FROM ../kinds.ts, WHICH THE COMPILER ERASES, and values only from ./kind-common.ts and
 * ../reportmedia.ts, so this folder makes no runtime cycle through the central file.
 */
import type { ValidationError } from '../kinds.ts'
import { commonFields, unionOf, type FieldSpec, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { extensionsSaid, mediaFormatOf } from '../reportmedia.ts'

/** The kind, as RECORD_KINDS spells it. */
export const QUICK_NOTE_KIND = 'quick_note'

/** The types of part a note holds, in the order the shape's variants list them. */
export const QUICK_NOTE_PART_TYPES = ['words', 'stroke', 'box', 'line', 'picture', 'video', 'added'] as const
export type QuickNotePartType = (typeof QUICK_NOTE_PART_TYPES)[number]

/**
 * THE PEN'S COLOURS, AS WORDS AND NEVER AS COLOUR VALUES, so each theme draws them in its own colours. `ink` is the
 * colour of the writing: dark on a light page and light on a dark one.
 */
export const QUICK_NOTE_COLOURS = ['ink', 'red', 'blue'] as const
export type QuickNoteColour = (typeof QUICK_NOTE_COLOURS)[number]

/** Where a note was started, when it was started from a page of the office. */
export interface QuickNotePage {
  address: string
  name: string
  recordId?: string
}

/**
 * Written words, in markdown, placed on the sheet. WORDS KEPT WITH AN ADDED PART are the part straight after an added
 * part, at its x and 20 pixels under its y. The sheet draws them 20 pixels under the added part as it is drawn, however
 * tall its copy is, so a program that writes words in the same write as an added part keeps them there. Any other words
 * are drawn at their own x and y. The 20 is the sheet's MARGIN, and whereWordsWithAnAddedPartGo gives the place (both
 * in src/web/components/QuickNoteSheet.tsx).
 */
export interface QuickNoteWords { id: string; type: 'words'; x: number; y: number; width: number; text: string }
/** One line drawn with the pen: x and y pairs, in the order they were drawn. */
export interface QuickNoteStroke { id: string; type: 'stroke'; colour: QuickNoteColour; width: number; points: number[] }
/** A box, with words in it or none yet. */
export interface QuickNoteBox { id: string; type: 'box'; x: number; y: number; width: number; height: number; text?: string }
/** A line joining two boxes of the same note, by their ids. */
export interface QuickNoteLine { id: string; type: 'line'; from: string; to: string }
/** A picture or a film the office keeps, by the four facts POST /api/report-files hands back. */
export interface QuickNoteFile {
  id: string
  x: number
  y: number
  width: number
  height: number
  path: string
  name: string
  size: number
  hash: string
}
export interface QuickNotePicture extends QuickNoteFile { type: 'picture'; alt?: string }
export interface QuickNoteVideo extends QuickNoteFile { type: 'video' }
/** What was copied into a note from a page, as it was drawn there when it was added. */
export type QuickNoteCopy =
  | { type: 'blocks'; blocks: Record<string, unknown>[] }
  | { type: 'card'; recordId: string; kind: string; title: string; summary?: string }
  | { type: 'page' }
export interface QuickNoteAdded {
  id: string
  type: 'added'
  x: number
  y: number
  width: number
  /** How tall it is drawn, once the person has resized it; without it, as tall as what it holds. */
  height?: number
  at: string
  from: QuickNotePage
  copy: QuickNoteCopy
}
export type QuickNotePart =
  | QuickNoteWords
  | QuickNoteStroke
  | QuickNoteBox
  | QuickNoteLine
  | QuickNotePicture
  | QuickNoteVideo
  | QuickNoteAdded

/** How many tags a note holds at most, and how many characters one tag holds at most. */
export const A_NOTE_HOLDS_TAGS = 12
export const A_TAG_HOLDS = 40

/** THE TAGS A NOTE IS GROUPED BY, in the order the person gave them, or none. The door has checked each one. */
export function quickNoteTagsOf(data: Record<string, unknown>): string[] {
  const tags = data['tags']
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []
}

/** How many characters a title made from a note's words holds, with the mark of a cut. */
const A_TITLE_HOLDS = 80

/**
 * THE TITLE A NOTE'S OWN WORDS GIVE IT: the first line of the first part holding words, written words or a box's, with
 * its heading, list, quote and emphasis marks taken off. A line longer than a title holds is cut at a word and ends in
 * "…". Null while the note holds no words, so the page says the note has none rather than inventing a title.
 */
export function quickNoteTitleOf(parts: readonly QuickNotePart[]): string | null {
  for (const part of parts) {
    if (part.type !== 'words' && part.type !== 'box') continue
    const line = (part.text ?? '')
      .split('\n')
      .map((one) => one.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|>\s*|\d+[.)]\s+)/u, '').replace(/\*+|~~|`/gu, '').trim())
      .find((one) => one !== '')
    if (line === undefined) continue
    if (line.length <= A_TITLE_HOLDS) return line
    const cut = line.slice(0, A_TITLE_HOLDS - 1)
    const space = cut.lastIndexOf(' ')
    return `${(space > A_TITLE_HOLDS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
  }
  return null
}

const field = (key: string, type: string, required: boolean, description: string, example: unknown): FieldSpec =>
  ({ key, type, required, description, example })

// ---------------------------------------------------------------------------------------------- the made-up example

const MADE_UP_PICTURE = '/srv/mole-office-fixtures/mole-office/data/report-files/V1StGXR8Z5jd.png'
const MADE_UP_FILM = '/srv/mole-office-fixtures/mole-office/data/report-files/V1StGXR8Z5je.mp4'
const MADE_UP_PAGE: QuickNotePage = { address: '#/records', name: 'Everything' }

const idField = (example: string): FieldSpec =>
  field('id', 'string', true, 'The part\'s own id, unique among the parts of this note. A line names the boxes it joins by these ids.', example)
const typeField = (type: QuickNotePartType): FieldSpec =>
  field('type', `'${type}'`, true, `Always the string "${type}".`, type)
const placeFields = (x: number, y: number): FieldSpec[] => [
  field('x', 'number', true, 'How far right of the sheet\'s first point the part starts, in pixels of the sheet at its own size. Below 0 is left of that point, where the sheet grew as the person drew.', x),
  field('y', 'number', true, 'How far below the sheet\'s first point the part starts, in pixels of the sheet at its own size. Below 0 is above that point, where the sheet grew as the person drew.', y),
]
const widthField = (description: string, example: number): FieldSpec => field('width', 'number', true, description, example)
const heightField = (example: number): FieldSpec => field('height', 'number', true, 'How tall it is, in pixels of the sheet. Above 0.', example)
const fileFields = (path: string, name: string, size: number, hash: string): FieldSpec[] => [
  field('path', 'string', true, 'The absolute path POST /api/report-files handed back. Never the bytes themselves, and never an address that lives only in one browser tab.', path),
  field('name', 'string', true, 'The file\'s own name, as a person would say it, never the stored name on disk.', name),
  field('size', 'number', true, 'How many bytes the file is, as POST /api/report-files measured it.', size),
  field('hash', 'string', true, 'Sixteen hex characters of the sha256 of the bytes, as POST /api/report-files worked it out.', hash),
]

export const QUICK_NOTE_SHAPES: Record<string, ShapeSpec> = {
  QuickNotePart: {
    name: 'QuickNotePart',
    description:
      `One part of a quick note, of one of these types: ${QUICK_NOTE_PART_TYPES.join(', ')}. The \`type\` key decides ` +
      'what the rest of the object has to contain. The parts are kept in the order the person placed them, and a ' +
      'later part is drawn over an earlier one.',
    discriminator: {
      key: 'type',
      variants: {
        words: 'QuickNoteWords',
        stroke: 'QuickNoteStroke',
        box: 'QuickNoteBox',
        line: 'QuickNoteLine',
        picture: 'QuickNotePicture',
        video: 'QuickNoteVideo',
        added: 'QuickNoteAdded',
      },
    },
    fields: [],
  },
  QuickNoteWords: {
    name: 'QuickNoteWords',
    description: 'Written words placed on the sheet, with their formatting, in markdown as a report\'s text is written.',
    fields: [
      idField('w-first'),
      typeField('words'),
      ...placeFields(40, 32),
      widthField('How wide the words may run before they wrap, in pixels of the sheet. Above 0.', 320),
      field('text', 'string', true, 'The words, in markdown: **bold**, *slanted*, lists and headings draw as themselves. A part with no words is left out rather than kept empty.', 'Made-up words: ask about the **second** clamp.'),
    ],
  },
  QuickNoteStroke: {
    name: 'QuickNoteStroke',
    description: 'One line drawn freely with the pen, from the moment it touched the sheet to the moment it left it.',
    fields: [
      idField('s-first'),
      typeField('stroke'),
      field('colour', unionOf(QUICK_NOTE_COLOURS), true, 'The pen\'s colour, as a word. Ink is the colour of the writing in each theme.', 'red'),
      field('width', 'number', true, 'How thick the line is, in pixels of the sheet. Above 0.', 2),
      field('points', 'number[]', true, 'The points the pen passed through, in the order it passed them, as x then y for each point, in pixels of the sheet. So the list holds an even count of numbers, and at least one point.', [40, 120, 52, 124, 70, 131]),
    ],
  },
  QuickNoteBox: {
    name: 'QuickNoteBox',
    description: 'A box on the sheet, with words in it or none yet. A line can join it to another box.',
    fields: [
      idField('b-first'),
      typeField('box'),
      ...placeFields(40, 180),
      widthField('How wide the box is, in pixels of the sheet. Above 0.', 160),
      heightField(72),
      field('text', 'string', false, 'The words in the box, in markdown. Left out while the box has none.', 'Made-up step one'),
    ],
  },
  QuickNoteLine: {
    name: 'QuickNoteLine',
    description: 'A line joining two boxes of this note. It names the boxes and not two points, so it stays joined when either box moves.',
    fields: [
      idField('l-first'),
      typeField('line'),
      field('from', 'string', true, 'The id of the box the line starts at, a box of this note.', 'b-first'),
      field('to', 'string', true, 'The id of the box the line ends at, another box of this note.', 'b-second'),
    ],
  },
  QuickNotePicture: {
    name: 'QuickNotePicture',
    description: 'A picture the office keeps, pasted or dropped into the note. Store the file with POST /api/report-files first, and copy the four facts it hands back here.',
    fields: [
      idField('p-first'),
      typeField('picture'),
      ...placeFields(240, 180),
      widthField('How wide the picture is drawn, in pixels of the sheet. Above 0.', 200),
      heightField(150),
      ...fileFields(MADE_UP_PICTURE, 'made-up-picture.png', 48213, '3f1c9a02b7de4415'),
      field('alt', 'string', false, 'What the picture shows, in words, when the person wrote it. Left out, the page says the file\'s name.', 'A made-up sketch of a clamp'),
    ],
  },
  QuickNoteVideo: {
    name: 'QuickNoteVideo',
    description: `A film the office keeps, pasted or dropped into the note, played in the page. Store the file with POST /api/report-files first, and copy the four facts it hands back here. It is a ${extensionsSaid('video')} file.`,
    fields: [
      idField('v-first'),
      typeField('video'),
      ...placeFields(240, 360),
      widthField('How wide the film is drawn, in pixels of the sheet. Above 0.', 240),
      heightField(135),
      ...fileFields(MADE_UP_FILM, 'made-up-film.mp4', 4194304, 'a41c07e9b2d85f60'),
    ],
  },
  QuickNoteAdded: {
    name: 'QuickNoteAdded',
    description:
      'Something copied into the note from a page, as it was drawn there when it was added, with the way back to where ' +
      'it came from. It stays as it was when added, even after the thing it was copied from changes.',
    fields: [
      idField('a-first'),
      typeField('added'),
      ...placeFields(40, 300),
      widthField('How wide the copy is drawn, in pixels of the sheet. Above 0.', 360),
      field('height', 'number', false, 'How tall the copy is drawn, in pixels of the sheet, once the person has resized it. Above 0. Without it, the copy is as tall as what it holds.', 240),
      field('at', 'date', true, 'When it was added, as local wall time YYYY-MM-DD HH:MM:SS.', '2026-11-14 21:40:00'),
      field('from', 'QuickNotePage', true, 'The page it was copied from, as that page was named when it was copied.', { ...MADE_UP_PAGE, recordId: 'MadeUpRec001' }),
      field('copy', 'QuickNoteCopy', true, 'What was copied, kept whole.', { type: 'card', recordId: 'MadeUpRec001', kind: 'task', title: 'A made-up task' }),
    ],
  },
  QuickNotePage: {
    name: 'QuickNotePage',
    description: 'A page of the office, by its address and by the name it was drawn with at the time.',
    fields: [
      field('address', 'string', true, 'The page\'s address in the office, as its own links write it, beginning with #/.', MADE_UP_PAGE.address),
      field('name', 'string', true, 'The page\'s name as it was drawn at the time, in the language it was drawn in.', MADE_UP_PAGE.name),
      field('recordId', 'string', false, 'The id of the record the page is about, when it is about one.', 'MadeUpRec001'),
    ],
  },
  QuickNoteCopy: {
    name: 'QuickNoteCopy',
    description: 'What was copied into a note from a page. The `type` key decides what the rest of the object has to contain.',
    discriminator: {
      key: 'type',
      variants: { blocks: 'QuickNoteCopiedBlocks', card: 'QuickNoteCopiedCard', page: 'QuickNoteCopiedPage' },
    },
    fields: [],
  },
  QuickNoteCopiedBlocks: {
    name: 'QuickNoteCopiedBlocks',
    description: 'Formatted words with their maths, a picture or a table row, as the blocks a report draws them with.',
    fields: [
      field('type', "'blocks'", true, 'Always the string "blocks".', 'blocks'),
      field('blocks', 'SummaryBlock[]', true, 'The blocks, copied whole. A picture in them keeps its path, and never its bytes.', [{ id: 'c-words', type: 'text', text: 'Made-up words, copied.' }]),
    ],
  },
  QuickNoteCopiedCard: {
    name: 'QuickNoteCopiedCard',
    description: 'A record\'s card: its kind, its title and its summary as they were when it was added.',
    fields: [
      field('type', "'card'", true, 'Always the string "card".', 'card'),
      field('recordId', 'string', true, 'The id of the record the card is of.', 'MadeUpRec001'),
      field('kind', 'string', true, 'The record\'s kind when it was added, as Mole Office stores it.', 'task'),
      field('title', 'string', true, 'The record\'s title when it was added.', 'A made-up task'),
      field('summary', 'string', false, 'The record\'s summary when it was added. Left out when it had none.', 'A made-up summary.'),
    ],
  },
  QuickNoteCopiedPage: {
    name: 'QuickNoteCopiedPage',
    description: 'A page\'s name. The name and the address are the ones the part\'s `from` keeps.',
    fields: [field('type', "'page'", true, 'Always the string "page".', 'page')],
  },
}

// ---------------------------------------------------------------------------------------------- the rules across parts

const QUICK_NOTE_RULES = [
  'No two parts of one note share an id, whatever their types, because a line names the boxes it joins by their ids.',
  'A line joins two different boxes of the same note: its from and its to each name a box part of this note.',
  'A stroke\'s points are x and y pairs, so it holds an even count of numbers, and at least one point.',
  'Every width and height is above 0.',
  'A picture or a film keeps the path POST /api/report-files handed back, never its bytes and never an address that lives only in one browser tab. A film\'s path ends in one of the film endings.',
  `A tag is 1 to ${String(A_TAG_HOLDS)} characters with no space at either end. A note holds at most ${String(A_NOTE_HOLDS_TAGS)} tags, and no two are the same apart from capitals.`,
]

/** An object, read as one, or null. */
const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** The part as a person reads it in a refusal: its type and its id. */
const named = (part: Record<string, unknown>): string => `the ${String(part['type'])} "${String(part['id'])}"`

/** An address that holds the file's bytes in itself, and one that only the browser tab that made it can open. */
const HOLDS_THE_BYTES = /^data:/iu
const ONLY_ONE_TAB_OPENS = /^blob:/iu

/**
 * THE RULES THAT NEED MORE THAN ONE PART, OR MORE THAN ONE KEY OF ONE. Every part has passed its own shape by now,
 * because the kind's cross-checks run only on sound fields, so each part's keys are the types its shape declares.
 */
export function quickNoteCrossChecks(data: Record<string, unknown>): ValidationError[] {
  const parts = Array.isArray(data['parts']) ? data['parts'] : []
  const errors: ValidationError[] = []
  const firstWithId = new Map<string, number>()
  const boxes = new Set<string>()
  parts.forEach((value, index) => {
    const part = asObject(value)
    if (part === null) return
    const id = String(part['id'])
    const earlier = firstWithId.get(id)
    if (earlier === undefined) firstWithId.set(id, index)
    else {
      errors.push({
        path: `data.parts[${index}].id`,
        message:
          `data.parts[${index}].id is ${JSON.stringify(id)}, and data.parts[${earlier}].id is ${JSON.stringify(id)} too. ` +
          'Two parts of one note may not share an id, whatever their types, because a line names the boxes it joins ' +
          'by their ids. Give one of them a different id.',
      })
    }
    if (part['type'] === 'box') boxes.add(id)
  })
  parts.forEach((value, index) => {
    const part = asObject(value)
    if (part === null) return
    const at = `data.parts[${index}]`
    for (const key of ['width', 'height'] as const) {
      const size = part[key]
      if (typeof size === 'number' && size <= 0) {
        errors.push({ path: `${at}.${key}`, message: `${at}.${key} is ${String(size)}, on ${named(part)}. Every width and height in a note is above 0.` })
      }
    }
    if (part['type'] === 'line') {
      for (const end of ['from', 'to'] as const) {
        const box = String(part[end])
        if (boxes.has(box)) continue
        const other = firstWithId.get(box)
        const otherType = other === undefined ? null : asObject(parts[other])?.['type']
        errors.push({
          path: `${at}.${end}`,
          message:
            (otherType === null || otherType === undefined
              ? `${at}.${end} is ${JSON.stringify(box)}, on ${named(part)}, and no part of this note has that id.`
              : `${at}.${end} is ${JSON.stringify(box)}, on ${named(part)}, and that part is a ${String(otherType)}, not a box.`) +
            ' A line joins two boxes of the same note, by their ids, so that it stays joined when a box moves.',
        })
      }
      if (part['from'] === part['to'] && boxes.has(String(part['from']))) {
        errors.push({ path: at, message: `${at}, ${named(part)}, joins the box ${JSON.stringify(part['from'])} to itself. A line joins two different boxes.` })
      }
    }
    if (part['type'] === 'stroke' && Array.isArray(part['points'])) {
      const count = part['points'].length
      if (count < 2 || count % 2 !== 0) {
        errors.push({
          path: `${at}.points`,
          message: `${at}.points holds ${String(count)} numbers, on ${named(part)}. A stroke's points are x and y pairs, so the list holds an even count of numbers, and at least one point.`,
        })
      }
    }
    if ((part['type'] === 'picture' || part['type'] === 'video') && typeof part['path'] === 'string') {
      const path = part['path']
      if (HOLDS_THE_BYTES.test(path) || ONLY_ONE_TAB_OPENS.test(path)) {
        errors.push({
          path: `${at}.path`,
          message:
            `${at}.path, on ${named(part)}, is not a stored file. ` +
            (HOLDS_THE_BYTES.test(path)
              ? 'It is a data: address, which holds the bytes of the file, and a note never keeps the bytes of a file. '
              : 'It is a blob: address, which only the browser tab that made it can open. ') +
            'Store the file with POST /api/report-files first, and keep the path it hands back.',
        })
      } else if (part['type'] === 'video' && mediaFormatOf(path)?.block !== 'video') {
        errors.push({
          path: `${at}.path`,
          message: `${at}.path, on ${named(part)}, does not end in ${extensionsSaid('video')}, so the page cannot play it as a film. A film is kept only in one of those formats.`,
        })
      }
    }
  })
  const tags = Array.isArray(data['tags']) ? data['tags'] : []
  if (tags.length > A_NOTE_HOLDS_TAGS) {
    errors.push({ path: 'data.tags', message: `data.tags holds ${String(tags.length)} tags. A note holds at most ${String(A_NOTE_HOLDS_TAGS)}.` })
  }
  const firstTag = new Map<string, number>()
  tags.forEach((tag, index) => {
    if (typeof tag !== 'string') return
    const at = `data.tags[${index}]`
    if (tag.trim() !== tag || tag === '' || tag.length > A_TAG_HOLDS) {
      errors.push({ path: at, message: `${at} is ${JSON.stringify(tag)}. A tag is 1 to ${String(A_TAG_HOLDS)} characters, with no space at either end.` })
    }
    const same = tag.toLowerCase()
    const earlier = firstTag.get(same)
    if (earlier === undefined) firstTag.set(same, index)
    else errors.push({ path: at, message: `${at} is ${JSON.stringify(tag)}, and data.tags[${earlier}] is the same tag. A note holds each tag once.` })
  })
  return errors
}

// ---------------------------------------------------------------------------------------------- the kind

export const quickNoteKind: KindSpec = {
  kind: QUICK_NOTE_KIND,
  purpose:
    'A note the person writes and draws in, opened from the window app\'s tray or key or from a page: words, free ' +
    'drawing, boxes joined by lines, pictures, and things copied in from pages.',
  whenToRecord:
    'The note page files one when the person first writes or draws in a note opened with no note named, so an ' +
    'opening left empty files nothing. It keeps the note as the person writes, with no Save press. The example below ' +
    'is made up and is never a real observation.',
  humanOnly: false,
  fields: [
    field('parts', 'QuickNotePart[]', true, 'The note\'s parts, in the order the person placed them. A new note holds none yet.', [
      { id: 'w-first', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up words: ask about the **second** clamp.' },
      { id: 'b-first', type: 'box', x: 40, y: 180, width: 160, height: 72, text: 'Made-up step one' },
      { id: 'b-second', type: 'box', x: 280, y: 180, width: 160, height: 72 },
      { id: 'l-first', type: 'line', from: 'b-first', to: 'b-second' },
      { id: 's-first', type: 'stroke', colour: 'red', width: 2, points: [40, 120, 52, 124, 70, 131] },
    ]),
    field(
      'tags',
      'string[]',
      false,
      'Words the person groups and sorts the note by, beside the week it was started in, in the order they were given. ' +
        'Left out, or an empty list, while the note has none.',
      ['made-up tag'],
    ),
    field(
      'from_page',
      'QuickNotePage',
      false,
      'The page the person was on when they started the note. Left out when it was started from no page: from the ' +
        'window app\'s tray or key, or by its address alone.',
      MADE_UP_PAGE,
    ),
    ...commonFields(QUICK_NOTE_KIND),
  ],
  rules: QUICK_NOTE_RULES,
  example: {
    parts: [
      { id: 'w-first', type: 'words', x: 40, y: 32, width: 320, text: 'Made-up words: ask about the **second** clamp.' },
      { id: 'b-first', type: 'box', x: 40, y: 180, width: 160, height: 72, text: 'Made-up step one' },
      { id: 'b-second', type: 'box', x: 280, y: 180, width: 160, height: 72, text: 'Made-up step two' },
      { id: 'l-first', type: 'line', from: 'b-first', to: 'b-second' },
    ],
    from_page: MADE_UP_PAGE,
  },
}
