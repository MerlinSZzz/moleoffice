// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPE HELPERS THE REPORT'S BLOCKS ARE BUILT FROM.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. They live here because a kind's shapes are built when its
 * file loads, before kinds.ts's body, so a helper a shape calls at load cannot stay in the central
 * file.
 *
 * THIS FILE IMPORTS ONLY DECLARATIONS OUTSIDE THE CENTRAL FILE, AND NOTHING FROM ../kinds.ts, so it
 * makes no runtime cycle through it.
 */
import { unionOf, type FieldSpec, type ShapeSpec } from './kind-common.ts'
import { MEASURE_PRESETS, MEASURE_RATIO_MAX, MEASURE_RATIO_MIN } from '../beside.ts'
import { MEDIA_FORMATS, extensionsSaid, type MediaBlockType } from '../reportmedia.ts'
// THE TWO WAYS A SUBAGENT'S RUN MAY END, from the one place they are declared, so the `how` field
// of a Release is built from that list rather than from a copy of it.
import { TRACED_HOW } from '../releasing.ts'

/**
 * THE FIELDS EVERY BLOCK SHAPE PUBLISHES, spread into all twenty of them.
 *
 * WHY THIS IS ONE FIELD AND NOT TWO, WHICH NARROWS `projections.md` §4.3 AND SAYS SO. That section
 * writes `BLOCK_COMMON_FIELDS` with `id` in it as well, each of the twenty dropping its own `id`
 * line. The twenty `id` lines in this file do not say the same thing — `b-what-broke`, `b-part-a`,
 * `b-shell-crack` — and their descriptions differ too, so collapsing them would rewrite twenty
 * published examples in `GET /api/kinds` to buy nothing. `id` was already on every one of the
 * twenty; `audience` was on none. The declaration-once property that section is protecting is the
 * one that matters here, and this holds it for the field that needed it.
 *
 * WITHOUT THIS, an agent reading `GET /api/kinds` for `ImageBlock` finds no `audience` and correctly
 * concludes it cannot mark a picture for developers, while the zod checker would have accepted one.
 * Three declarations, two bound, is this repository's named defect.
 * `tests/audience.test.ts` asserts every block shape carries the key.
 */
export const BLOCK_COMMON_FIELDS: readonly FieldSpec[] = [
  {
    key: 'audience',
    type: "'everyone' | 'developers'",
    required: false,
    description:
      'Who this block is for, at least. Left out, everyone. "developers" means a normal reader does not see it ' +
      'on screen, a developer does, and an agent receives it either way. A `quote` block may never be marked, ' +
      'for any writer: quoted words are somebody else\'s. An agent may mark blocks it is creating and may never ' +
      'add the mark to a block that is already stored.',
    example: 'developers',
  },
  {
    key: 'forOwner',
    type: 'boolean',
    required: false,
    description:
      'True when this block is addressed to the owner — a question for them, a decision only they can make, a ' +
      'thing waiting on them. A projection of the report promotes a marked block at EVERY level of semantic zoom, ' +
      'including the lowest, so it survives however far the detail is turned down. Left out, the block is not ' +
      'addressed to anybody in particular. Mark blocks as you write them, and mark the ones that would be the ' +
      'point of the report to somebody who read nothing else.',
    example: true,
    refusal:
      'it says WHO the block is addressed to, which is a different question from "audience". "audience" is the ' +
      'least technical reader a block is for, and "developers" there keeps a block off a normal reader\'s screen. ' +
      'A block may carry both',
  },
  {
    key: 'measure',
    type: `number | ${unionOf(MEASURE_PRESETS)}`,
    required: false,
    description:
      'How wide the WRITING inside this block reads. ONLY ON A BLOCK THAT HOLDS WRITING \u2014 a text, heading, ' +
      'finding, callout, list or quote block, or a section or tabs block with writing somewhere inside it. On a ' +
      'table, a picture, a chart, a row of measurements or a comparison it is a 400, because there is no writing ' +
      'in them for it to be about. Where a block holds writing AND something else \u2014 a section holding a ' +
      'table beside its prose \u2014 it narrows the writing and leaves the rest alone: it never narrows the ' +
      'block, which owns its space. Either one of the four widths, widest first, ' +
      `\u2014 ${MEASURE_PRESETS.join(', ')} \u2014 or a plain ratio between ${String(MEASURE_RATIO_MIN)} and ` +
      `${String(MEASURE_RATIO_MAX)} meaning that much of the column. Left out, the writing uses the whole column, ` +
      'which is what `full` means. This is the same field `BesidePart` carries one level up: written on a part it ' +
      'is about every prose block in that part, written on a block it is about that block, and the nearer ' +
      'statement is the one drawn.',
    example: 'narrow',
    refusal:
      'it narrows the TEXT INSIDE the block and never the box the block stands in, so it is a name or a ratio ' +
      'and never a width \u2014 no pixels, no percentage, no rem. How wide a COLUMN is, is "share" on the parts ' +
      'of a composition',
  },
]

/**
 * THE PUBLISHED SHAPE OF AN `audio` OR A `video` BLOCK.
 *
 * One function for both, because the two differ only in which formats they play and in what `alt`
 * describes. The formats come from the one list in ./reportmedia.ts, which the record door checks
 * against too.
 */
export function mediaBlockShape(type: MediaBlockType): ShapeSpec {
  const audio = type === 'audio'
  const name = audio ? 'AudioBlock' : 'VideoBlock'
  const ending = MEDIA_FORMATS.find((format) => format.block === type)!.extension
  return {
    name,
    description: audio
      ? 'A SOUND THE REPORT PLAYS IN THE PAGE, from a file the office keeps, as an image block shows a picture. ' +
        'Store the file with POST /api/report-files first, and copy the four facts it hands back into this block. ' +
        `The file is a ${extensionsSaid('audio')} file. The page plays it from the file door, which streams it, ` +
        'lets the reader move to any point in it, and offers the whole file to save.'
      : 'A FILM THE REPORT PLAYS IN THE PAGE, from a file the office keeps, as an image block shows a picture. ' +
        'Store the file with POST /api/report-files first, and copy the four facts it hands back into this block. ' +
        `The file is a ${extensionsSaid('video')} file. The page plays it from the file door, which streams it, ` +
        'lets the reader move to any point in it, and offers the whole file to save.',
    fields: [
      ...BLOCK_COMMON_FIELDS,
      { key: 'id', type: 'string', required: true, description: 'Unique within this summary.', example: audio ? 'b-voice-sample' : 'b-sample-film' },
      { key: 'type', type: `'${type}'`, required: true, description: `Always the string "${type}".`, example: type },
      {
        key: 'path',
        type: 'string',
        required: true,
        description:
          `An absolute path on disk, as POST /api/report-files hands it back. It ends in ${extensionsSaid(type)}; ` +
          'a path ending in anything else is refused with the reason, and a file of another format goes in a ' +
          '"file" block.',
        example: `/srv/mole-office-fixtures/mole-office/data/report-files/V1StGXR8Z5jd${ending}`,
      },
      {
        key: 'name',
        type: 'string',
        required: true,
        description: "The file's own name, as a person would say it, never the stored name on disk.",
        example: audio ? `voice-sample-zh${ending}` : `sample-film${ending}`,
      },
      {
        key: 'size',
        type: 'number',
        required: true,
        description: 'How many bytes the file is, as POST /api/report-files measured it.',
        example: audio ? 1764044 : 4194304,
      },
      {
        key: 'hash',
        type: 'string',
        required: true,
        description: 'Sixteen hex characters of the sha256 of the bytes, as POST /api/report-files worked it out.',
        example: audio ? '5b0e7c21d9a4f316' : 'a41c07e9b2d85f60',
      },
      {
        key: 'alt',
        type: 'string',
        required: true,
        description: audio
          ? 'What is heard, in words, for a reader who cannot hear it. Required, as an image\'s alt is.'
          : 'What is seen and heard, in words, for a reader who cannot see it. Required, as an image\'s alt is.',
        example: audio
          ? 'A woman reads the opening line of the programme in Chinese, calmly, for about 20 seconds.'
          : 'A hand picks up a red cube and puts it in a box. No speech.',
      },
      {
        key: 'caption',
        type: 'string',
        required: false,
        description: 'One line under the player. Prose, and under the prose cap.',
        example: audio ? 'Voice B, Chinese.' : 'The first sample film.',
      },
      { key: 'machine', type: 'string', required: false, description: 'Which machine the file is on. Leave it out when it is this one.', example: 'lab-pc' },
    ],
  }
}

/** The same trace field is published on a release and a refusal. */
// oj9CRzzB2_8m; chapter 7 rule 5; item 6, step 3 of a decision.
export const tracedField: FieldSpec = {
  key: 'traced',
  type: 'Record<string, unknown>[]',
  required: false,
  description: 'Each changed path traced to the person: {paths, to, how, said}. A line may cover several paths. ' +
    'The door requires every judged path on a release and a record that exists; the inspector judges whether its words cover the change.',
  example: [{ paths: ['src/server/lib/inspection.ts'], to: 'Madeup100001', how: TRACED_HOW[0], said: 'Check each change against the person’s words or delegated engineering judgment.' }],
}
