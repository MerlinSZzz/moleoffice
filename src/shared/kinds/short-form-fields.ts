// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HELPERS THE SHORT-FORMS SHAPES AND EVERY KIND'S SHORT-FORMS FIELD ARE BUILT FROM, AND THOSE
 * SHAPES. The five shapes are `SHORT_FORM_SHAPES` at the foot of this file, which ../kinds.ts
 * spreads into SHAPE_SPECS.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same declarations,
 * the same comments and the same values. They live here because a kind's shapes are built when its
 * file loads, before kinds.ts's body, so a helper a shape calls at load cannot stay in the central
 * file.
 *
 * THIS FILE IMPORTS ONLY DECLARATIONS OUTSIDE THE CENTRAL FILE, AND NOTHING FROM ../kinds.ts, so it
 * makes no runtime cycle through it.
 */
import type { FieldSpec, ShapeSpec } from './kind-common.ts'
// THE SHORTER FORMS OF ONE PIECE OF WRITING, DECLARED ONCE, in ../zoom.ts. The shapes below are
// BUILT from that declaration — see `shortFormShapeFields` — so the word budgets a caller reads at
// GET /api/kinds and the budgets a write is refused against are the same numbers, and changing a
// length is one entry there.
import {
  PARTS_KEY,
  PART_TEXT_SPECS,
  RETIRED_SHORT_FORM_KEYS,
  SHORT_FORMS_FIELD,
  SHORT_FORM_SPECS,
  STORED_SHORT_FORM_LEVELS,
} from '../zoom.ts'

/**
 * THE EXAMPLE REVISION every short form example says it was made from.
 *
 * One constant, because the same pair is written into six examples and a caller who copies one
 * should see the same two numbers each time. It matches the `Revision` shape's own example, which
 * is the shape this field is typed as.
 */
export const EXAMPLE_MADE_FROM = { seq: 4, contentHash: '9f2c1ab0d3e4' }

/**
 * The fields of the `ShortForms` shape, one per length, BUILT from the declaration in ./zoom.ts.
 *
 * Typing them out would be the word budgets written twice — once in the sentence a caller reads and
 * once in the check that refuses their write — which is the defect this codebase keeps finding, in
 * the one place where the sentence and the check are supposed to be the same rule.
 *
 * `withParts` IS FALSE FOR EVERY KIND THAT HOLDS NO BLOCKS, and that is the whole difference between
 * the two shapes below. Levels 4, 5 and 6 are written by part, and a part carries the ids of the
 * blocks it covers, so a kind with no blocks has nothing for a part to cover. Declaring `parts` on
 * a task would publish a field whose coverage rule could never be checked.
 */
export function shortFormShapeFields(withParts: boolean): FieldSpec[] {
  return [
    // ONE FIELD, AND IT USED TO BE THREE. `STORED_SHORT_FORM_LEVELS` is what a writer can still put
    // under `data.shortForms`: the label. Levels 2 and 3 are the record's own `title` and `summary`
    // columns since 3 September 2026, so `title` and `gist` are declared below with the retired
    // keys — the schema still names them, because records in this project hold text under them.
    ...STORED_SHORT_FORM_LEVELS.map((level): FieldSpec => {
      const spec = SHORT_FORM_SPECS[level]
      return {
        key: level,
        type: 'ShortForm',
        required: false,
        description:
          `${spec.what} ${spec.minWords} to ${spec.maxWords} words. Leave it out when nobody has written one at ` +
          `this length: that is the ordinary answer, Mole Office says it out loud, and it is better than a longer ` +
          `form shortened into the gap.`,
        example: { text: spec.example, madeFrom: EXAMPLE_MADE_FROM, writtenBy: 'agent' },
      }
    }),
    ...(!withParts ? [] : [{
      key: PARTS_KEY,
      type: 'ReportParts',
      required: false,
      description:
        'THE THREE READING LENGTHS THAT ARE WRITTEN BY PART — levels 4, 5 and 6 — in one structure. For each ' +
        "part of the report: a heading of at most 10 words that is that part's one-sentence summary, a text of " +
        'at most 30 words, a text of at most 120 words, and the ids of the blocks the part covers. Level 4 draws ' +
        'the headings alone, level 5 each heading with its 30-word text, level 6 each heading with its 120-word ' +
        'text, so the same part is the same part at all three. EVERY BLOCK OF THE REPORT MUST BE COVERED BY ' +
        'EXACTLY ONE PART and the write door refuses anything else, which is what makes it impossible for a ' +
        'level to leave a part of the report out without saying so. Leave it out when nobody has written one: ' +
        'the report then falls back to its gist at those three lengths and says so.',
      example: {
        madeFrom: EXAMPLE_MADE_FROM,
        writtenBy: 'agent',
        parts: [
          {
            id: 'p-1',
            heading: PART_TEXT_SPECS.heading.example,
            text30: PART_TEXT_SPECS.text30.example,
            text120: PART_TEXT_SPECS.text120.example,
            covers: ['b-1', 'b-2'],
          },
        ],
      },
    } satisfies FieldSpec]),
    ...RETIRED_SHORT_FORM_KEYS.map((key): FieldSpec => ({
      key,
      type: 'ShortForm',
      required: false,
      description:
        `RETIRED. \`card\`, \`brief\` and \`account\` went on 2 September 2026, when levels 4, 5 and 6 became ` +
        `the by-part structure in \`${PARTS_KEY}\` above; \`title\` and \`gist\` went on 3 September, when ` +
        `levels 2 and 3 became the record's own \`title\` and \`summary\` columns — a report is filed with a ` +
        `title of at most 15 words and a summary of 20 to 60 words, and those two ARE those two lengths. ` +
        `A NEW WRITE TO THIS KEY IS REFUSED and nothing on any screen draws it. New means words no version ` +
        `of the record ever held: putting back a version that carried one is its own history coming back, so it ` +
        `goes through. It is still declared here because records in this project hold text under it: deleting ` +
        `the name would make those records unwritable — every key a kind does not declare is refused — and would ` +
        `take somebody's writing out of the schema without taking it off the disk. What is stored stays exactly ` +
        `as it is. It is declared on every kind rather than only on the two that ever held it, because a record ` +
        `changing kind carries the fields it stored, and a shape that refused them would trap it in the kind it ` +
        `has.`,
      example: { text: SHORT_FORM_SPECS.gist.example, madeFrom: EXAMPLE_MADE_FROM, writtenBy: 'agent' },
    })),
  ]
}

/**
 * THE RULES OF THE SHORT-FORMS SHAPES, IN ENGLISH, WRITTEN ONCE FOR BOTH SHAPES.
 *
 * A caller reading the schema over HTTP cannot see the functions that enforce these, so they are
 * spelled out. The two shapes below are the same shape with and without `parts`, and every rule
 * holds for both — two copies would be one rule free to disagree with itself.
 */
export const SHORT_FORMS_RULES: string[] = [
  'no short form may be made by cutting a longer one. A form whose whole text is the opening of a longer ' +
    "form, or of the record's own words, is refused, and so is one that ends in an ellipsis. A cut keeps " +
    'whichever words came first rather than the ones worth keeping, which is usually the conclusion.',
  'each length has a word budget and both ends of it are enforced. A one-word gist is a label written in the ' +
    "gist's place, and a screen that asked for the useful conclusion would be handed a name with nothing " +
    'saying so. Words are counted by splitting on spaces, so a text written without any is judged by its ' +
    'character count at both ends instead of being refused for having one word.',
  "no reading level may say more than the record itself. A level longer in words than the record's own " +
    'content is refused and the refusal names both lengths, because a shorter form longer than the thing it ' +
    'shortens is not a shorter form of it. A record whose own content is already as short as a level has no ' +
    'levels above that one, and no screen offers one.',
]

/**
 * SHORTER FORMS OF WHAT THIS RECORD SAYS, for the surfaces that have no room for the whole thing.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY KIND HAS IT, SINCE 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * It used to be on the two kinds that hold a BODY — a module's curated summary and a report — on the
 * argument that a task has a title and a one-line summary and nothing else, so a shorter form of it
 * would be another way of writing the title.
 *
 * THE DECISION WENT THE OTHER WAY. A shorter form should have been allowed all along, and it is
 * best if every module has reading levels below the length of its own content. That is a decision
 * from proposal `dYDv5is4UTUJ`. It is meant for a short NAME: a link in the
 * chat reads *level-1 name #id*, and a link to a problem read a twenty-word title because a problem
 * had no place for a name.
 *
 * SO EVERY KIND CARRIES THE LEVEL-1 LABEL and the field is added to every kind at once, below
 * `KIND_SPECS`, rather than typed into twenty-six field lists.
 *
 * `parts` IS STILL ONLY ON THE KINDS THAT HOLD BLOCKS. Levels 4, 5 and 6 are written by part and a
 * part names the blocks it covers, so a kind with no blocks has nothing for a part to cover and its
 * shape is `ShortForms` rather than `ShortFormsWithParts`.
 *
 * WHAT THIS COSTS AN `annotation`, WRITTEN DOWN BECAUSE IT USED TO BE THE ONE DELIBERATE EXCEPTION.
 * An annotation is what a person wrote, kept exactly, and it is never rewritten. The argument for
 * leaving it out was that a shortened version stored beside somebody's own words would be read as a
 * replacement. That decision covers every kind, and the level-1 label is a NAME for the annotation
 * rather than a shortening of it — the annotation's own text is untouched and is still what every
 * screen draws. Nothing writes one by itself; a person or an agent writes it or the record has none.
 *
 * `tests/zoom.test.ts` holds the pairing: every kind declares this field, and the kinds whose shape
 * carries `parts` are exactly the kinds that hold a body.
 */
export const shortFormsField = (kind: string, withParts: boolean, summaryGuidance?: string): FieldSpec => ({
  key: SHORT_FORMS_FIELD,
  type: withParts ? 'ShortFormsWithParts' : 'ShortForms',
  required: false,
  description:
    `Shorter forms of what this ${kind} says, for lists, cards, chat links and pickers that have no room for ` +
    `the whole thing. THE READING LADDER HAS SEVEN POSITIONS AND ONLY ` +
    `${withParts ? 'TWO' : 'ONE'} OF THEM ${withParts ? 'ARE' : 'IS'} WRITTEN HERE. Level 1 is the ` +
    `\`label\` below, ${SHORT_FORM_SPECS.label.minWords} to ${SHORT_FORM_SPECS.label.maxWords} words: the short ` +
    `NAME this ${kind} is listed and linked under. ` +
    `LEVEL 2 IS THIS ${kind.toUpperCase()}'S OWN \`title\`, at most ${SHORT_FORM_SPECS.title.maxWords} words, ` +
    `and LEVEL 3 IS ITS OWN \`summary\`, ${SHORT_FORM_SPECS.gist.minWords} to ` +
    `${SHORT_FORM_SPECS.gist.maxWords} words — you write both when you file the record, and there is no ` +
    `separate title form and no gist any more. Those two numbers are TARGETS: nothing is refused for its ` +
    `length, and going over by a little does not matter. ` +
    // WHAT THIS KIND'S SUMMARY IS FOR. Appended here rather than kept beside the kind, because an
    // agent reading GET /api/kinds/<kind> learns what level 3 is from this sentence and nowhere else.
    (summaryGuidance === undefined ? '' : `${summaryGuidance} `) +
    (withParts
      ? `Levels 4, 5 and 6 are \`${PARTS_KEY}\` below, written by part. Level 7 is the ${kind} itself. `
      : `Levels 4, 5 and 6 are written by part and a ${kind} holds no blocks for a part to cover, so it has no ` +
        `place for them and none is declared here. `) +
    `NO WRITTEN LEVEL MAY SAY MORE THAN THE ${kind.toUpperCase()} ITSELF: a level longer in words than this ` +
    `${kind}'s own content is refused, naming both lengths, and a ${kind} whose own content is already as short ` +
    `as a level has no levels above that one. ` +
    `THE LABEL${withParts ? ' AND THE PARTS ARE' : ' IS'} DERIVED AND ` +
    `THE ${kind.toUpperCase()}'S OWN CONTENT IS WHAT IS AUTHORED — ` +
    `${withParts ? 'each one names' : 'it names'} the revision it was made from, so Mole Office can say a short ` +
    'form went out of date when the record moved rather than drawing it as current. NONE OF THEM MAY BE MADE BY ' +
    'CUTTING: a form that is the opening of a longer one, or of the record\'s own words, or that ends in an ' +
    'ellipsis, is refused, because a cut ' +
    'keeps whichever words came first rather than the ones worth keeping. Write them through ' +
    'POST /api/records/<id>/short-forms, which checks the revision against the ledger. Leave out any length ' +
    'nobody has written — GET /api/records/<id>/short-forms says which of them exist and which have gone ' +
    'out of date.',
  example: {
    label: { text: SHORT_FORM_SPECS.label.example, madeFrom: EXAMPLE_MADE_FROM, writtenBy: 'agent' },
  },
})

/** The five short-form shapes, moved out of ../kinds.ts with their comments unchanged. */
export const SHORT_FORM_SHAPES: Record<string, ShapeSpec> = {
  ShortForm: {
    name: 'ShortForm',
    description:
      'ONE SHORTER FORM OF A RECORD\'S BODY, at one of five lengths. It is DERIVED: the body is the only thing ' +
      'anybody authors, and this is written from it. It carries the revision it was made from, which is what lets ' +
      'Mole Office say it went out of date when the body moved instead of drawing it as though it were current.',
    fields: [
      {
        key: 'text',
        type: 'string',
        required: true,
        description:
          'The words at this length, written for what this length is for. Not the body with the end cut off: a ' +
          'form that is the opening of a longer one, or that ends in an ellipsis, is refused.',
        example: SHORT_FORM_SPECS.gist.example,
      },
      {
        key: 'madeFrom',
        type: 'Revision',
        required: true,
        description:
          'Which revision of this record the words were written from: the seq and the content hash from the same ' +
          'entry of GET /api/records/<id>/revisions. It is what makes going out of date arithmetic rather than ' +
          'something somebody has to remember. Mole Office checks the pair against the ledger when you write through ' +
          'POST /api/records/<id>/short-forms, and checks it again on every read — a pair the ledger does not hold ' +
          'is reported as one Mole Office cannot check, never quietly believed.',
        example: EXAMPLE_MADE_FROM,
      },
      {
        key: 'writtenBy',
        type: "'agent' | 'human'",
        required: true,
        description:
          'Who wrote these words. "human" means a person wrote this length by hand, which OVERRIDES what would ' +
          'otherwise be derived, and every surface says so rather than showing it as an ordinary derived form. ' +
          'There is no "system": Mole Office writes no short form itself and never will invent one. YOU DO NOT CHOOSE ' +
          'THIS: it is read from the actor headers on the request that stores the words, on every write path, and ' +
          'whatever is sent here is replaced. Who wrote a thing is Mole Office\'s record of the write, not a claim the ' +
          'writer makes about itself.',
        example: 'agent',
      },
      {
        key: 'by',
        type: 'string',
        required: false,
        description:
          'WHICH agent or person wrote these words, by the actor id on the request that stored them — ' +
          '"claude-code/short-form-writer", "owner". writtenBy beside it says WHAT KIND of writer it was, and ' +
          'that is what decides the override; this says which one, which is a different fact and is not ' +
          'derivable from it. YOU DO NOT CHOOSE THIS EITHER: both write doors overwrite it with the actor from ' +
          'the request headers, for the same reason writtenBy is overwritten. It is absent on every form stored ' +
          'before 2 September 2026, and absent when a request stated no actor at all — the identity is then ' +
          'defaulted, and filing a default as the writer would put a name on words nobody said they wrote. ' +
          'Absent means nobody recorded a writer, and nothing is filled in: the composer then says nothing ' +
          'about who wrote the form rather than saying that nobody knows.',
        example: 'claude-code/short-form-writer',
      },
      {
        key: 'at',
        type: 'date',
        required: false,
        description:
          'When these words were stored, in local wall-clock time: "2026-09-02 10:14:03". A DIFFERENT FACT FROM ' +
          'madeFrom beside it: madeFrom names the revision somebody READ, this is when the words were WRITTEN ' +
          'DOWN, and a form written today from a revision filed last week carries both a week apart. Mole Office ' +
          'writes it on every write and whatever is sent here is replaced. Absent on every form stored before ' +
          '2 September 2026, and never filled in from the record\'s updatedAt, which is the time of the last ' +
          'write of any kind.',
        example: '2026-09-02 10:14:03',
      },
      {
        key: 'session',
        type: 'string',
        required: false,
        description:
          'THE RUN THAT WROTE THESE WORDS, as the id of its session record — "QMB3PKzXLrgE". by beside it says ' +
          'WHICH actor wrote them; this says which RUN it was doing, and the record page links straight to it. ' +
          'YOU DO NOT CHOOSE THIS EITHER: both write doors read x-mole-office-session off the request, resolve it ' +
          'to the session record of this project it names — the same resolution the revision ledger does — and ' +
          'store that, replacing whatever is sent here. It is absent where the request named no session, and ' +
          'absent where it named a run nobody has filed as a session record: a name nothing answers to would be ' +
          'a link to nowhere. It is absent on every form stored before 3 September 2026, nothing fills those in, ' +
          'and the revision ledger is where the run behind an older write is read.',
        example: 'QMB3PKzXLrgE',
      },
      {
        key: 'standsFor',
        type: 'string[]',
        required: false,
        description:
          'WHICH PARTS OF THIS RECORD THESE WORDS STAND FOR, by stored path — ["data.blocks[#b-1]", ' +
          '"section.openAround"]. A DIFFERENT FACT FROM madeFrom beside it: madeFrom names WHEN somebody read the ' +
          'record, this names WHICH PARTS the words stand in place of. Leave it out and the form carries no ' +
          'recorded source parts, and a whole-record form with no recorded parts stands for the whole record by ' +
          'rule — recorded parts are optional provenance, not a requirement. Nothing ' +
          'derives it: a guess presented as a record of what somebody did is the one answer this field forbids. ' +
          'Every path is checked against the parts this record really has when you write through ' +
          'POST /api/records/<id>/short-forms, so a name nothing holds is refused rather than stored.',
        example: ['data.blocks[#b-1]'],
      },
    ],
  },

  ShortForms: {
    name: 'ShortForms',
    description:
      'THE SHORTER FORMS OF WHAT ONE RECORD SAYS, on a kind that holds no blocks. One of them is written here: ' +
      'the `label`, reading length 1, the short NAME the record is listed and linked under. Reading length 2 is ' +
      "the record's own `title` and length 3 is its own `summary`, so neither is written here. Lengths 4, 5 and " +
      '6 are written by part and a part names the blocks it covers, so a kind with no blocks has no place for ' +
      'them — `ShortFormsWithParts` is the shape on the kinds that do. The label may be absent and usually is. ' +
      '`title`, `gist`, `card`, `brief` and `account` are retired, draw nowhere, and refuse a new write.',
    fields: shortFormShapeFields(false),
    rules: SHORT_FORMS_RULES,
  },

  ShortFormsWithParts: {
    name: 'ShortFormsWithParts',
    description:
      'THE SHORTER FORMS OF ONE RECORD\'S BODY, on a kind that holds blocks. The `label` is reading length 1, ' +
      'one text about the whole record. Reading length 2 is the record\'s own `title` and length 3 is its own ' +
      '`summary`. The next three reading lengths — the outline, the sketch and the digest — are written BY PART ' +
      'and share the one structure under `parts`. Any of them may be absent and usually most of ' +
      'them are. They are different jobs rather than different sizes of one text: see each field for what its ' +
      'length is for. `card`, `brief` and `account` are retired, draw nowhere, and refuse a new write.',
    fields: shortFormShapeFields(true),
    rules: SHORT_FORMS_RULES,
  },

  ReportParts: {
    name: 'ReportParts',
    description:
      "THE REPORT SPLIT INTO PARTS, WRITTEN ONCE AND DRAWN AT THREE READING LENGTHS. Level 4 draws each part's " +
      'heading alone, level 5 the heading with its 30-word text, level 6 the heading with its 120-word text. ' +
      'It carries the same five provenance fields one short form carries and they mean the same thing.',
    fields: [
      {
        key: 'madeFrom',
        type: 'Revision',
        required: true,
        description:
          'Which revision of this record the parts were written from: the seq and the content hash from the same ' +
          'entry of GET /api/records/<id>/revisions. Checked against the ledger on every write and on every read, ' +
          'exactly as a short form is, so parts written before the report moved are reported as out of date ' +
          'rather than drawn as current.',
        example: EXAMPLE_MADE_FROM,
      },
      {
        key: 'writtenBy',
        type: "'agent' | 'human'",
        required: true,
        description:
          'Whether a person or an agent wrote these. YOU DO NOT CHOOSE THIS: it is read from the actor headers ' +
          'on the request that stores them and whatever is sent here is replaced, exactly as on one short form.',
        example: 'agent',
      },
      {
        key: 'by',
        type: 'string',
        required: false,
        description:
          'WHICH agent or person wrote them, by the actor id on the request. Overwritten from the actor headers ' +
          'like writtenBy, and absent when a request stated no actor at all.',
        example: 'claude-code/short-form-writer',
      },
      {
        key: 'at',
        type: 'date',
        required: false,
        description:
          'When they were stored, in local wall-clock time. A different fact from madeFrom beside it, which ' +
          'names the revision somebody read.',
        example: '2026-09-02 10:14:03',
      },
      {
        key: 'session',
        type: 'string',
        required: false,
        description:
          'The run that wrote them, as the id of its session record. Read from x-mole-office-session and resolved ' +
          'to the session record it names, exactly as on one short form; absent where the request named no ' +
          'session or named a run nobody has filed.',
        example: 'QMB3PKzXLrgE',
      },
      {
        key: PARTS_KEY,
        type: 'ReportPart[]',
        required: true,
        description:
          'The parts, in the order they are drawn. A part is a headed section where the report has headings and ' +
          'a group of paragraphs where it has none — the writer decides, and records which blocks each part ' +
          'covers. EVERY BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART: a block covered twice, a block ' +
          'covered by nothing, and a block id the report does not hold are all refused, and the refusal names ' +
          'the ids. An empty list is refused too — leave the whole structure out instead.',
        example: [
          {
            id: 'p-1',
            heading: PART_TEXT_SPECS.heading.example,
            text30: PART_TEXT_SPECS.text30.example,
            text120: PART_TEXT_SPECS.text120.example,
            covers: ['b-1', 'b-2'],
          },
        ],
      },
    ],
  },

  ReportPart: {
    name: 'ReportPart',
    description:
      'ONE PART OF A REPORT, at the three lengths it is written in. All three texts are written together, ' +
      'because they are three lengths of ONE part: a part that had only some of them would vanish from the page ' +
      'when the reader asked for more.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description:
          'A stable id, unique within the record. It is what makes this the same part at levels 4, 5 and 6 — ' +
          'right-clicking the part builds an address from it, so the same part pressed at two levels names one ' +
          'thing. Renumbering the parts loses that.',
        example: 'p-1',
      },
      {
        key: 'heading',
        type: 'string',
        required: true,
        description:
          `This part of the report summarised in one sentence, ${String(PART_TEXT_SPECS.heading.minWords)} to ` +
          `${String(PART_TEXT_SPECS.heading.maxWords)} words. It is the same sentence at all three lengths, and ` +
          `at level 4 it is the whole of what the page draws for this part. It is not the report's own heading ` +
          `copied across: a text that is the opening of the report's prose is refused as a cut.`,
        example: PART_TEXT_SPECS.heading.example,
      },
      {
        key: 'text30',
        type: 'string',
        required: true,
        description:
          `What this part of the report says, in at most ${String(PART_TEXT_SPECS.text30.maxWords)} words. Drawn ` +
          `under the heading at level 5.`,
        example: PART_TEXT_SPECS.text30.example,
      },
      {
        key: 'text120',
        type: 'string',
        required: true,
        description:
          `What this part of the report says, in at most ${String(PART_TEXT_SPECS.text120.maxWords)} words. Drawn ` +
          `under the heading at level 6.`,
        example: PART_TEXT_SPECS.text120.example,
      },
      {
        key: 'covers',
        type: 'string[]',
        required: true,
        description:
          'The ids of the report blocks this part covers — ["b-1","b-2"]. BLOCK IDS, not stored paths: a block\'s ' +
          'own id is what the report stores, so a reader needs nothing but the record to find what a part stands ' +
          'for. Media blocks are covered like any other. A part covering nothing is refused, because a part that ' +
          'stands for no part of the report is not a summary of anything.',
        example: ['b-1', 'b-2'],
      },
    ],
  },

}
