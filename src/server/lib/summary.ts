// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The curated module summary, checked with zod at write time.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THIS SHAPE COMES FROM — READ THIS BEFORE CHANGING ANYTHING
 * ---------------------------------------------------------------------------------------
 *
 * The block model is NOT invented here. It is declared in `src/shared/types.ts` — SummaryBlock
 * and one interface per block type — which is the file both ends of the application read. This file
 * is the same contract expressed as zod schemas, so that the SERVER can refuse a bad block on an
 * HTTP write, and `blocksAgree` in lib/validate.ts is a compile-time proof that the type these
 * schemas produce and the one shared/types.ts declares are the same type in both directions.
 * Neither can move without the other.
 *
 * (The model used to be declared in `scripts/seed.ts`, and that is where this note used to point.
 * It was lifted to shared/ so the browser could read the same shape; a note still naming the seed
 * as the owner is how the next reader ends up editing the wrong file.)
 *
 * There are still TWO VALIDATORS for that one shape: these schemas, and the hand-written checker
 * in scripts/seed.ts that runs over the literals the seed writes. The remaining half of the fix
 * in api/index-additions.md is to have seed.ts call `validateSummaryBlocks` from here and delete
 * its own. Until that is done, do not "improve" a rule in one of the two files without doing the
 * other, or the seed will write data the API refuses. What stops that being silent is a test in
 * tests/summary-schema.test.ts, which runs every block the seed actually writes through these
 * schemas: the two cannot disagree about anything the seed contains without a red test.
 *
 * ---------------------------------------------------------------------------------------
 * WHY WRITE TIME AND NOT READ TIME
 * ---------------------------------------------------------------------------------------
 *
 * An agent that emits `{"type":"chart","spec":{"series":[]}}` has produced something that looks
 * like a summary and renders as a blank rectangle. Nobody notices for a month. Checking on the
 * way in means the agent that wrote it is told which block is wrong, by index and by field,
 * while it is still running and can fix it. Checking on the way out moves the error to whoever
 * opens the page later, who did not write it and cannot fix it, and leaves the bad data stored.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT CHECKED
 * ---------------------------------------------------------------------------------------
 *
 *  - Colour. No block carries one. Meaning is carried by `state`, which the renderer turns into
 *    --st-<state> plus a word and a shape. This is the token rule: if meaning lived in a colour,
 *    a theme swap could change what the colour MEANS.
 *  - Whether an image path exists on disk. Mole Office points at the archive, it does not own it, and
 *    a machine being switched off is not a reason to refuse a write. A missing file is shown as
 *    broken at read time, the way a link to a deleted record is.
 *  - Which LaTeX commands MathText supports. That list belongs to the renderer, which must show
 *    an unsupported expression as source rather than dropping it. Only whether the string is
 *    STRUCTURALLY closed is checked here — see `texProblem` and the note on it.
 *
 * ---------------------------------------------------------------------------------------
 * FOR THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The exported types are the contract SummaryBlocks.tsx, Chart.tsx and MathText.tsx build
 * against. Import them from browser code with `import type { ... }` only: a value import would
 * pull this module's import of records.ts, and through it better-sqlite3, into the bundle.
 */

import { WHERE_A_RULES_CHINESE_CAME_FROM } from '@shared/default-set.ts'
import { extname } from 'node:path'
import { z } from 'zod'
import { questionsIn } from '@shared/answers.ts'
import { AUDIENCES } from '@shared/audience.ts'
// ONE ANSWER TO "IS THIS AN OBJECT I CAN READ KEYS OFF", and it is already declared in shared/.
import { isPlainObject } from '@shared/fielddiff.ts'
import { A_QUOTE_MAY_NOT_BE_HIDDEN, blocksFieldOf } from '@shared/kinds.ts'
import { MAX_PROSE } from '@shared/prose-cap.ts'
// WHAT TO CALL A KIND OF RECORD TO A PERSON. One place, and it answers `.text`.
import { kindWord } from '@shared/words.ts'
// USED HERE AS WELL AS RE-EXPORTED: a re-export is not a binding in this module's own scope.
import { proseFieldsOfBlocks, proseOfBlocks } from '@shared/waitingclaims.ts'
import {
  PART_TEXTS,
  PART_TEXT_SPECS,
  SHORT_FORMS_FIELD,
  SHORT_FORM_SPECS,
  WORDS_THAT_MAKE_A_COPY,
  countWords,
  isCutOf,
  joined,
  readStoredParts,
  readStoredShortForms,
  sentencesOfProse,
  textsOfPart,
  areTheSameWords,
} from '@shared/zoom.ts'
import {
  MEASURE_PRESETS,
  MEASURE_RATIO_MAX,
  MEASURE_RATIO_MIN,
  PARTS_MAX,
  PARTS_MIN,
  SHARE_MAX,
  SHARE_MIN,
  canonicalRow,
  isShareProblem,
} from '@shared/beside.ts'
// WHAT A PART HOLDS, ASKED OF THE REGION TREE RATHER THAN OF THE BLOCK TYPES HERE. It is the one
// question `measure` depends on — a reading width is a statement about writing — and answering it
// again in this file would be the same fact worked out in two places.
import { leastNeededByBlocks } from '@shared/regions.ts'
import {
  CALLOUT_TONES,
  ITEM_STATES,
  PATH_KINDS,
  SUMMARY_BLOCK_TYPES,
  type SummaryBlock as SharedSummaryBlock,
  type SummaryBlockType,
} from '@shared/types.ts'
import { extensionsSaid, mediaFormatOf, type MediaBlockType } from '@shared/reportmedia.ts'
import { isAnAbsolutePath } from '../../config/the-paths-of-a-system.mjs'
import { PanelError } from './panel-error.ts'
import { HASH_CHARS } from './version.ts'

// ---------------------------------------------------------------------------- limits
//
// These caps are a design statement, not a technical one. explore.md records the split between
// the curated summary (here) and the full report (a path into the project directory), and says
// to reopen that decision if "the curated summary keeps growing until it is the full report".
// A cap makes that growth visible as a refused write rather than letting it happen quietly.
// They are far above anything the seed writes; tests/summary-schema.test.ts proves that.

// Longest prose in one text block or caption, about a page of writing: MAX_PROSE, declared in
// src/shared/prose-cap.ts so a writer can be told it before the write (problem jQayki_gIciU).
/** Longest LaTeX string. A displayed equation, not a derivation. */
const MAX_TEX = 2000
/** Most blocks in one summary. Past this it is a report, not a summary. */
const MAX_BLOCKS = 200
/** Most rows in one table, and most points in one chart series. */
const MAX_ROWS = 500
const MAX_POINTS = 2000

// ---------------------------------------------------------------------------- small pieces

/**
 * THE REFUSAL OF A STRING OVER ITS CAP, SAYING HOW FAR OVER. Every capped string in a block reads
 * this one, so THE_PROSE_CAP_SENTENCE's promise that a refusal names how many characters over is
 * true of all of them (a code block's code said only the cap until 5 October 2026).
 */
const tooLong =
  (field: string, max: number) =>
  (issue: { input?: unknown }): string =>
    `${field} must be ${max} characters or fewer` +
    (typeof issue.input === 'string' ? `; this one is ${issue.input.length}, ${issue.input.length - max} over` : '')

/**
 * A required string that is not blank.
 *
 * `.refine` rather than `.trim()`: trim is a TRANSFORM, and it would quietly rewrite what the
 * caller stored. Every schema in this file is non-transforming on purpose, so a block that
 * validates is byte-for-byte the block that was sent — see the note on validateSummaryBlocks.
 */
const text = (field: string, max = 200) =>
  z
    .string({ error: `${field} must be a non-empty string` })
    .max(max, { error: tooLong(field, max) })
    .refine((s) => s.trim() !== '', {
      error: `${field} must not be empty — a blank ${field} renders as a gap that reads as missing data`,
    })

/** Every block carries an id, like ProgressItem, ModulePart and PathRef already do. */
const id = text('id', 64)

/**
 * A finite number.
 *
 * zod 4 already rejects NaN and Infinity for z.number(), and JSON cannot carry either, so there
 * is no extra finiteness check. Do not add one back thinking it is missing. The reason it
 * matters is the one seed.ts gives: NaN plots as a gap that looks like missing data.
 */
const num = (field: string) => z.number({ error: `${field} must be a finite number` })

/**
 * The semantic state a series, row or block can carry.
 *
 * ITEM_STATES is reused rather than a second vocabulary being invented, because a chart series
 * saying a run FAILED and a checklist item saying the same thing must look the same and mean
 * the same. The renderer maps it to --st-<state> plus a word and a shape, never colour alone.
 */
const state = z.enum(ITEM_STATES, { error: `state must be one of: ${ITEM_STATES.join(', ')}` })

const caption = text('caption', MAX_PROSE).optional()

// ---------------------------------------------------------------------------- chart spec

export const CHART_KINDS = ['line', 'bar'] as const
export type ChartKind = (typeof CHART_KINDS)[number]

/**
 * An axis. `label` is required, for the reason seed.ts gives: an unlabelled axis is a number
 * with no unit, which is how a plot lies. `unit` is kept apart from the label so ticks can
 * carry it without repeating the word.
 */
const chartAxis = z.strictObject({
  label: text('label'),
  unit: text('unit', 32).optional(),
  min: num('min').optional(),
  max: num('max').optional(),
})

const chartPoint = z.strictObject({ x: num('x'), y: num('y') })

const chartSeries = z.strictObject({
  id: text('id', 64),
  name: text('name'),
  points: z
    .array(chartPoint, { error: 'points must be an array of {x, y}' })
    .min(1, {
      error:
        'a named series with no points puts a legend entry on the chart for a line that is not there',
    })
    .max(MAX_POINTS, { error: `a series may have at most ${MAX_POINTS} points` }),
  state: state.optional(),
  /** The non-colour channel: a dashed line still reads as "this one" in the mono theme. */
  dashed: z.boolean({ error: 'dashed must be true or false' }).optional(),
})

/** A reference line, e.g. the force a grasp has to reach. A line with no label is a mystery. */
const chartAnnotation = z.strictObject({
  id: text('id', 64),
  axis: z.enum(['x', 'y'], { error: 'axis must be "x" or "y"' }),
  value: num('value'),
  label: text('label'),
})

const chartSpec = z
  .strictObject({
    kind: z.enum(CHART_KINDS, { error: `chart kind must be one of: ${CHART_KINDS.join(', ')}` }),
    x: chartAxis,
    y: chartAxis,
    series: z
      .array(chartSeries, { error: 'series must be an array' })
      .min(1, {
        error:
          'a chart needs at least one series. Empty axes read as "we measured this and found nothing", when what happened is that nobody supplied the numbers',
      })
      .max(12, { error: 'a chart with more than 12 series is unreadable; split it' }),
    annotations: z.array(chartAnnotation, { error: 'annotations must be an array' }).max(20).optional(),
  })
  .superRefine((spec, ctx) => {
    // An inverted axis range draws the chart upside down, which reads as a real result rather
    // than as a mistake. This is the one chart rule here that seed.ts does not also have.
    for (const axis of ['x', 'y'] as const) {
      const a = spec[axis]
      if (a.min !== undefined && a.max !== undefined && a.min >= a.max) {
        ctx.addIssue({
          code: 'custom',
          path: [axis],
          message: `${axis}.min (${a.min}) must be less than ${axis}.max (${a.max}), or the chart is drawn inside out`,
        })
      }
    }
    // Duplicate series ids make the legend address the wrong line.
    const seen = new Map<string, number>()
    spec.series.forEach((s, i) => {
      const first = seen.get(s.id)
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['series', i, 'id'],
          message: `series id "${s.id}" is already used by series ${first}`,
        })
      } else seen.set(s.id, i)
    })
    // AND THE REFERENCE LINES, which had the same rule published and nothing enforcing it. It was
    // written down as a known hole in tests/an-id-names-one-thing.test.ts on 18 August 2026: the
    // shape says an annotation id is unique within the chart and no checker said so. Same fault as
    // a repeated series id and one line from the fix, so it is fixed rather than carried.
    const marks = new Map<string, number>()
    ;(spec.annotations ?? []).forEach((a, i) => {
      const first = marks.get(a.id)
      if (first !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['annotations', i, 'id'],
          message: `annotation id "${a.id}" is already used by annotation ${first}`,
        })
      } else marks.set(a.id, i)
    })
  })

export type ChartAxisSpec = z.output<typeof chartAxis>
export type ChartPoint = z.output<typeof chartPoint>
export type ChartSeries = z.output<typeof chartSeries>
export type ChartAnnotation = z.output<typeof chartAnnotation>
export type ChartSpec = z.output<typeof chartSpec>

// ---------------------------------------------------------------------------- LaTeX

/**
 * Structural problems in a LaTeX string, or null if there are none.
 *
 * WHAT THIS IS NOT: a check on which commands MathText can render. seed.ts states that rule and
 * it is right — an expression outside the renderer's subset must reach it intact and be shown
 * as source, never dropped. Nothing here looks at command names.
 *
 * What it does look at is whether the string is CLOSED: unbalanced braces, and an odd number of
 * unescaped dollar signs. Those are broken under every renderer, and both fail by swallowing
 * the rest of the expression rather than by complaining, which is why they are worth catching
 * on the way in. Escaped braces (\{ \}) and escaped dollars (\$) are literals and do not count.
 *
 * This is exported so MathText can use the same function to explain a rendering failure, and so
 * that if this rule is ever judged too strict it can be removed from the schema below in one
 * line without losing the helper.
 */
export function texProblem(tex: string): string | null {
  let depth = 0
  let dollars = 0
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]
    if (c === '\\') {
      i++ // whatever follows a backslash is escaped; skip it
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth < 0) return `there is a closing brace "}" at position ${i} with no matching "{"`
    } else if (c === '$') dollars++
  }
  if (depth > 0) {
    return depth === 1 ? 'one "{" was opened and never closed' : `${depth} "{" were opened and never closed`
  }
  if (dollars % 2 !== 0) return `there is an odd number of "$" (${dollars}); every "$" needs a partner`
  return null
}

const tex = text('tex', MAX_TEX).refine((t) => texProblem(t) === null, {
  error: (issue) => `tex is not closed: ${texProblem(String(issue.input))}`,
})

// ---------------------------------------------------------------------------- the blocks

/**
 * Every block a curated summary can be made of, RE-EXPORTED from the contract.
 *
 * It was a third hand-written copy of the same five words, with a note saying it had to stay
 * equal to a copy in scripts/seed.ts — which by then was not the owner either. The list belongs
 * to shared/types.ts, the discriminated union below is built from the same words, and this
 * re-export exists only so a server file that already imports this module does not need a second
 * import for the list it prints in an error message.
 */
export { SUMMARY_BLOCK_TYPES, type SummaryBlockType }

/**
 * THE AUDIENCE WORD, CHECKED. One enum, one message, twenty schemas.
 *
 * `projections.md` §4.3: every block schema is a `z.strictObject`, so a key nobody declared is a 400.
 * That refusal is the reason this spread exists — a block cannot carry `audience` until the checker
 * knows the word.
 */
const audience = z.enum(AUDIENCES, {
  error:
    `audience must be one of: ${AUDIENCES.join(', ')}. It says the least technical reader this block ` +
    'is for; left out, it is for everyone',
})

/**
 * WHAT EVERY BLOCK SCHEMA STARTS WITH. One declaration, spread into twenty.
 *
 * This half does NOT bind itself — a schema that dropped the spread would still compile and still
 * accept every block it accepts today. `tests/audience.test.ts` is what holds it, by building the
 * example for every name in `SUMMARY_BLOCK_TYPES` and marking it.
 */
/**
 * HOW WIDE THE WRITING INSIDE ONE THING READS. Layer 4 of the composition model, declared ONCE and
 * used in the two places a reading width may be stated: on a part of a composition, and on a block.
 *
 * THE TWO PLACES ARE TWO BOXES AND NOT TWO RULES. A part's measure is about every prose block in
 * that part; a block's measure is about that block. What a measure MEANS — the four names, the
 * ratio and its bounds, the maximum it becomes on a screen — is `src/shared/beside.ts` and is the
 * same answer for both. This schema is the door those values are written through, and there is one
 * of it, so the two places can never come to disagree about what may be stored.
 *
 * THE REFUSALS NAME NEITHER A PART NOR A BLOCK, because this one schema serves both. Where a part
 * or a block is worth naming, the rule that names it is a `superRefine` further down.
 */
const measureField = z
  .union(
    [
      z.enum(MEASURE_PRESETS),
      z
        .number()
        .min(MEASURE_RATIO_MIN, {
          error:
            `a measure below ${String(MEASURE_RATIO_MIN)} stops being about reading and becomes a way of writing ` +
            `a narrow column without saying so. How wide a column is, is what "share" says, on the parts of a ` +
            `composition`,
        })
        .max(MEASURE_RATIO_MAX, {
          error:
            `a measure is how much of the column the writing uses, so ${String(MEASURE_RATIO_MAX)} is all of it ` +
            `and there is nothing above that. To make a column wider, write "share" on the parts of a composition`,
        }),
    ],
    {
      error:
        `measure is how wide the writing inside this reads: one of ${MEASURE_PRESETS.join(', ')} (widest first), ` +
        `or a plain ratio between ${String(MEASURE_RATIO_MIN)} and ${String(MEASURE_RATIO_MAX)} meaning that much of the ` +
        `column. Never a width — no pixels, no percentage, no rem`,
    },
  )
  .optional()

/**
 * THIS BLOCK IS ADDRESSED TO THE OWNER, CHECKED. One declaration, spread into twenty-one.
 *
 * A boolean and not an enum, and the reasons for the name and the type are on `BlockCommon` in
 * `src/shared/types.ts`, which is where the field is declared. This half is only the door.
 *
 * IT IS ON EVERY BLOCK TYPE INCLUDING `quote`, unlike `audience`. The quote rule is about HIDING
 * somebody else's words; saying a quoted passage is addressed to the owner hides nothing and takes
 * nothing away from whoever said it.
 */
const forOwnerField = z
  .boolean({
    error:
      'forOwner is true or false. It says this block is addressed to the owner, so a projection of the report ' +
      'promotes it at every level of semantic zoom. Left out, the block is not addressed to anybody in particular',
  })
  .optional()

/**
 * `measure` IS ON EVERY BLOCK AND NOT ON THE SIX THAT HOLD WRITING, and the rule about which blocks
 * may carry one is a `superRefine` in `summaryBlocksSchema` that asks `leastNeededByBlocks`. Listing
 * the prose block types here would be a second answer to a question `src/shared/regions.ts` already
 * answers, and the two would be free to drift. See `BlockCommon` in src/shared/types.ts, which
 * declares the same keys for the same reason.
 */
const blockCommon = { id, audience: audience.optional(), forOwner: forOwnerField, measure: measureField }

/** Prose. The paragraph that says what happened, in the author's own words. */
const textBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('text'),
  heading: text('heading').optional(),
  text: text('text', MAX_PROSE),
  tone: z.enum(['normal', 'quiet'], { error: 'tone must be "normal" or "quiet"' }).optional(),
  // THE CHINESE OF THIS BLOCK, drawn on a Chinese page. On a chapter record, whether its
  // from names the English beside it is asked by the record door, through chineseNotFromThisEnglish
  // in @shared/office-rules.ts, because that needs the record before the write.
  zh: z
    .strictObject({ heading: text('zh.heading'), text: text('zh.text', MAX_PROSE), from: text('zh.from') })
    .optional(),
  // THE RULE IN NEUTRAL WORDS, read only on a chapter record: what the default
  // regulations give a new office, written beside the owner's own heading and text. src/shared/default-set.ts reads it.
  neutral: z
    .strictObject({
      heading: text('neutral.heading'),
      text: text('neutral.text', MAX_PROSE),
      // WHICH ENGLISH THE TWIN'S CHINESE WAS WRITTEN FROM: theEnglishHashOfARule of the twin's own heading and text. A twin
      // written before its Chinese named one has none; the record door asks whether it is right.
      zh: z.strictObject({
        heading: text('neutral.zh.heading'),
        text: text('neutral.zh.text', MAX_PROSE),
        from: text('neutral.zh.from').optional(),
      }),
      zhFrom: z.enum(WHERE_A_RULES_CHINESE_CAME_FROM, {
        error: `neutral.zhFrom must be one of: ${WHERE_A_RULES_CHINESE_CAME_FROM.join(', ')}`,
      }),
      // WHICH OF THE OWNER'S ENGLISH THE TWIN WAS WRITTEN FROM: theEnglishHashOfARule of this block's heading and text.
      from: text('neutral.from'),
    })
    .optional(),
})

/** A heading inside the writing. The record's own title is the page's first heading. */
const headingBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('heading'),
  text: text('text'),
  level: z
    .literal([2, 3], {
      error: 'level must be 2 or 3 — the record\'s title is the first heading and these step down from it',
    })
    .optional(),
})

/** The one sentence worth remembering, with its evidence under it. */
const findingBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('finding'),
  text: text('text', MAX_PROSE),
  detail: text('detail', MAX_PROSE).optional(),
  state: state.optional(),
})

/**
 * Something set apart from the writing, saying why it is set apart.
 *
 * `tone` IS REQUIRED, and that is the block. See CalloutBlock in shared/types.ts: without it this is
 * a `text` block, so a missing tone is the wrong block rather than a field to fill in later.
 */
const calloutBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('callout'),
  tone: z.enum(CALLOUT_TONES, {
    error:
      `tone must be one of: ${CALLOUT_TONES.join(', ')}. It says WHY this is set apart from the writing, and an ` +
      'aside that does not say that is a text block',
  }),
  title: text('title').optional(),
  text: text('text', MAX_PROSE),
})

const metricItem = z.strictObject({
  id: text('id', 64),
  label: text('label'),
  /**
   * A STRING, NOT A NUMBER, and that is the point of the block. "0.4", "not measured" and "12 of
   * 40" are all things somebody wants to put on this row, and forcing the first into a number would
   * make the second two impossible to say. Nothing adds these up.
   */
  value: text('value'),
  unit: text('unit', 32).optional(),
  note: text('note', MAX_PROSE).optional(),
  state: state.optional(),
})

const metricsBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('metrics'),
  items: z
    .array(metricItem, { error: 'items must be an array of {id, label, value}' })
    .min(1, { error: 'a row of measurements with no measurements in it is an empty box on the page' })
    .max(24, { error: 'more than 24 measurements in one row is a table; write a table block' }),
})

/** One named value. No unit and no state: see KeyValueBlock in shared/types.ts for why not. */
const keyValueItem = z.strictObject({
  id: text('id', 64),
  label: text('label'),
  /** Kept as written, like a metric's value, so a version string and a date are both sayable. */
  value: text('value', MAX_PROSE),
})

const keyValueBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('keyvalue'),
  items: z
    .array(keyValueItem, { error: 'items must be an array of {id, label, value}' })
    .min(1, { error: 'a list of named values with nothing in it is an empty box on the page' })
    .max(40, { error: 'more than 40 named values is a table; write a table block' }),
})

const listBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('list'),
  items: z
    .array(text('an item', MAX_PROSE), { error: 'items must be an array of strings' })
    .min(1, { error: 'a list with no items in it draws as nothing at all' })
    .max(MAX_ROWS, { error: `a list may have at most ${MAX_ROWS} items` }),
  ordered: z.boolean({ error: 'ordered must be true or false' }).optional(),
})

/**
 * One thing on a checklist.
 *
 * `state` IS REQUIRED, unlike everywhere else in this file, and that is the block: a checklist whose
 * items do not all say where they stand is a list, and a reader counting the ticks on one gets a
 * wrong answer. ITEM_STATES is reused rather than a second vocabulary being invented.
 */
const checklistItem = z.strictObject({
  id: text('id', 64),
  text: text('text', MAX_PROSE),
  state: z.enum(ITEM_STATES, {
    error:
      `every item of a checklist must say where it stands: one of ${ITEM_STATES.join(', ')}. A list whose items ` +
      'have no state is a `list` block',
  }),
  note: text('note', MAX_PROSE).optional(),
})

const checklistBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('checklist'),
  items: z
    .array(checklistItem, { error: 'items must be an array of {id, text, state}' })
    .min(1, { error: 'a checklist with nothing on it draws as nothing at all' })
    .max(MAX_ROWS, { error: `a checklist may have at most ${MAX_ROWS} items` }),
})

/** A block of code or of terminal output. */
const codeBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('code'),
  /**
   * NOT `text(...)`, because leading and trailing blank lines are part of what somebody pasted and
   * the emptiness rule would refuse a block of pure whitespace for no reason a reader would accept.
   * The length cap is the same one prose has.
   */
  code: z
    .string({ error: 'code must be a string' })
    .max(MAX_PROSE, { error: tooLong('code', MAX_PROSE) }),
  language: text('language', 32).optional(),
  caption,
})

/**
 * A QUOTE MAY NEVER BE MARKED FOR DEVELOPERS, FOR ANY WRITER, AND THIS OVERRIDE IS THE WHOLE RULE.
 *
 * `projections.md` §9.2 rule 2. A quote block is somebody else's words by construction, so hiding
 * one from a normal reader is classifying away the original words — the thing the owner's brief
 * forbids by name. A stack trace a developer wants tucked away goes in a `code` block, which may be
 * marked.
 *
 * IT IS A REFUSAL RATHER THAN A JUDGEMENT, and that is the value of it: it needs nobody to decide
 * whether this particular quote is safe to hide. The cost is stated in the design and it is real —
 * a quoted stack trace cannot be hidden.
 *
 * THE SERVED SCHEMA SAYS THE SAME THING. `QuoteBlock` in `src/shared/kinds/report-blocks.ts` does
 * NOT spread `BLOCK_COMMON_FIELDS`; it declares `audience` as `'everyone'` alone, with this reason
 * on it. Two declarations that disagree is this repository's named defect, so the pair is kept in
 * step.
 */
const quoteBlock = z.strictObject({
  ...blockCommon,
  // THE SENTENCE IS `A_QUOTE_MAY_NOT_BE_HIDDEN` AND IT IS NOT WRITTEN OUT AGAIN HERE. It used to
  // be, with a comment above asking whoever edited one copy to remember the other — one fact in two
  // places, which is this codebase's own named defect. The served schema in
  // `src/shared/kinds/report-blocks.ts` now declares it once, as the `refusal` on the same field,
  // and both this checker and the 400 that `validateRecordData` writes read it from there.
  audience: z.literal('everyone', { error: A_QUOTE_MAY_NOT_BE_HIDDEN }).optional(),
  type: z.literal('quote'),
  text: text('text', MAX_PROSE),
  source: text('source').optional(),
})

/** A pointer into the archive. The same idea as PathRef, as a block. */
const pathBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('path'),
  label: text('label'),
  path: text('path', 1000),
  kind: z.enum(PATH_KINDS, { error: `kind must be one of: ${PATH_KINDS.join(', ')}` }).optional(),
  machine: text('machine', 64).optional(),
})

/**
 * A TEST WORLD THE PERSON IS BEING ASKED TO GO AND LOOK AT, in a handback. Criterion C31.
 *
 * `ledgerRow` is optional because a world nobody registered is a real thing to describe, and the
 * page says so rather than drawing a world it cannot see as running.
 */
const worldBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('world'),
  label: text('label'),
  web: text('web', 1000),
  api: text('api', 1000).optional(),
  webForOtherMachines: text('webForOtherMachines', 1000).optional(),
  apiForOtherMachines: text('apiForOtherMachines', 1000).optional(),
  ledgerRow: text('ledgerRow', 128).optional(),
  because: text('because', 1000).optional(),
})

/**
 * THE THREE BLOCKS THE PERSON ANSWERS, AND THE BOX THAT GROUPS THEM. Two
 * decisions.
 * What is answered is kept in the report's `answers`, written by the answer door
 * (src/server/lib/answers.ts) and never in the blocks themselves, so these shapes hold only the
 * question.
 */
const choiceOption = z.strictObject({
  id,
  label: text('label', 300),
  recommended: z.boolean({ error: 'recommended must be true or false' }).optional(),
})

const choiceBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('choice'),
  question: text('question', 1000),
  options: z
    .array(choiceOption, { error: 'options must be an array of options, each with an id and a label' })
    .min(2, { error: 'a choice needs at least two options; a question with one answer is a button' })
    .max(4, { error: 'a choice may offer at most four options' }),
  many: z.boolean({ error: 'many must be true or false' }).optional(),
  about: text('about', 64).optional(),
})

const fillInBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('fillin'),
  asks: text('asks', 1000),
  lines: z.enum(['one', 'many'], { error: 'lines must be "one" or "many"' }).optional(),
  boxWidth: z.enum(['narrow', 'wide'], { error: 'boxWidth must be "narrow" or "wide"' }).optional(),
})

const buttonBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('button'),
  label: text('label', 200),
  confirm: text('confirm', 1000).optional(),
  to: text('to', 128).optional(),
})

/** One plotted line or bar set. Rendered by <Chart spec={block.spec}/>. */
const chartBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('chart'),
  spec: chartSpec,
  caption,
})

/** A LaTeX formula. Rendered by <MathText tex={block.tex}/>. */
const mathBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('math'),
  tex,
  caption,
})

const tableColumn = z.strictObject({
  label: text('label'),
  /** Numbers right, words left. Default is left. */
  align: z.enum(['left', 'right'], { error: 'align must be "left" or "right"' }).optional(),
})

const tableRow = z.strictObject({
  /**
   * Numbers stay numbers so the renderer can right-align and format them, and strings stay
   * strings because "n/a" and "not measured" are real cells that must not be forced into a
   * placeholder number.
   */
  cells: z.array(
    z.union([z.string(), num('a cell')], { error: 'every cell must be a string or a finite number' }),
    { error: 'cells must be an array' },
  ),
  /** Optional state for the whole row, e.g. a print attempt that failed. */
  state: state.optional(),
})

/** A small table of measurements. Not a spreadsheet — the raw data stays in the project. */
const tableBlock = z
  .strictObject({
    ...blockCommon,
    type: z.literal('table'),
    columns: z
      .array(tableColumn, { error: 'columns must be an array of {label}' })
      .min(1, { error: 'a table needs at least one column' })
      .max(20, { error: 'a table with more than 20 columns will not fit on a phone; split it' }),
    rows: z
      .array(tableRow, { error: 'rows must be an array of {cells}' })
      .min(1, { error: 'a table needs at least one row' })
      .max(MAX_ROWS, { error: `a table may have at most ${MAX_ROWS} rows` }),
    caption,
  })
  .superRefine((b, ctx) => {
    // A short row renders as a silently empty cell; a long one drops a value off the end of the
    // table. Both are the failure this project exists to stop, so the row is named.
    b.rows.forEach((row, i) => {
      if (row.cells.length !== b.columns.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i],
          message: `row ${i} has ${row.cells.length} cell${row.cells.length === 1 ? '' : 's'} but the table has ${b.columns.length} column${b.columns.length === 1 ? '' : 's'}`,
        })
      }
    })
  })

/**
 * One thing that happened, and when.
 *
 * `when` IS A STRING AND IS NEVER PARSED. "14 August", "2026-07" and "after the driver was rolled
 * back" are all real answers, and nothing sorts or counts by this field — the order of the items is
 * the order the writer put them in. See TimelineItem in shared/types.ts.
 */
const timelineItem = z.strictObject({
  id: text('id', 64),
  when: text('when'),
  text: text('text', MAX_PROSE),
  detail: text('detail', MAX_PROSE).optional(),
  state: state.optional(),
})

const timelineBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('timeline'),
  items: z
    .array(timelineItem, { error: 'items must be an array of {id, when, text}' })
    .min(1, { error: 'a timeline with nothing on it draws as an empty rail' })
    .max(MAX_ROWS, { error: `a timeline may have at most ${MAX_ROWS} items` }),
})

/** A picture that lives on disk. Mole Office points at it; it is never copied into the database. */
const imageBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('image'),
  /**
   * Absolute: a relative path means something different depending on where the server started. Absolute as this
   * server's system writes it, "/" here and a drive letter on Windows (src/config/the-paths-of-a-system.mjs).
   */
  path: text('path', 1000).refine((p) => isAnAbsolutePath(p), {
    error: (issue) =>
      `path must be absolute, got "${String(issue.input)}" — a relative path means something different depending on where the server was started from`,
  }),
  /** Required, not optional: a picture with no text alternative is invisible to a reader. */
  alt: text('alt', MAX_PROSE),
  caption,
  /** Which machine the file is on. Empty means this one. */
  machine: text('machine', 64).optional(),
})

/**
 * A FILE CARRIED AS A FILE, rather than as prose cut into pieces. Criterion R3.
 *
 * IT CARRIES NO PROSE. The paragraph a report writes ABOUT a file belongs in a text block beside it;
 * this block is the file. So the only field under the prose cap here is `caption`, exactly as on an
 * image, and the file itself is bounded by the store and not by MAX_PROSE.
 *
 * `size` AND `hash` ARE CHECKED FOR SHAPE AND NOT FOR AGREEMENT WITH THE FILE. The write door is a
 * pure shape check and may not read the disk; what makes them the bytes' own is that the store in
 * lib/reportfiles.ts works them out there and never takes a caller's number. What this schema can
 * do is refuse a value that could not have come from that store: a negative or fractional size, or
 * a hash that is not the short lowercase sha256 token `hashOfBytes` returns.
 */
/**
 * THE FOUR FACTS OF A STORED FILE, as POST /api/report-files hands them back. A `file` block carries
 * them, and so do the `audio` and `video` blocks, which play the same kind of stored file.
 */
const storedFileFacts = {
  /** Absolute, for the same reason an image's path is: relative depends on where the server started. */
  path: text('path', 1000).refine((p) => isAnAbsolutePath(p), {
    error: (issue) =>
      `path must be absolute, got "${String(issue.input)}" — a relative path means something different depending on where the server was started from`,
  }),
  /** The file's own name. Kept as written, so the page can say what the file is called. */
  name: text('name', 512),
  /** Its own length in bytes, so a whole number of them and never a negative count. */
  size: z
    .number({ error: 'size must be the number of bytes in the file' })
    .int({ error: 'size must be a whole number of bytes' })
    .min(0, { error: 'size must not be negative; a file cannot be smaller than empty' }),
  /** The short sha256 token the store works out: lowercase hex, `hashOfBytes` in lib/version.ts. */
  hash: z
    .string({ error: 'hash must be the sha256 of the file, as text' })
    .regex(new RegExp(`^[0-9a-f]{${String(HASH_CHARS)}}$`), {
      error:
        `hash must be ${String(HASH_CHARS)} lowercase hexadecimal characters, the short sha256 token ` +
        'hashOfBytes in src/server/lib/version.ts gives the bytes. It is not a checksum somebody typed',
    }),
}

const fileBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('file'),
  ...storedFileFacts,
  caption,
  /** Which machine the file is on. Empty means this one. */
  machine: text('machine', 64).optional(),
})

/**
 * A SOUND OR A FILM THE REPORT PLAYS IN THE PAGE.
 *
 * The four facts of a stored file, and `alt`: what is heard or seen, in words, for a reader who
 * cannot hear or see it. Required for the reason an image's is.
 *
 * THE FORMAT IS CHECKED FROM THE PATH'S EXTENSION, against the one list in src/shared/reportmedia.ts.
 * This door may not read the disk. The upload door is what makes the extension true: it refuses a
 * file named as one of these formats whose first bytes are not that format.
 */
function mediaBlock<T extends MediaBlockType>(type: T) {
  return z
    .strictObject({
      ...blockCommon,
      type: z.literal(type),
      ...storedFileFacts,
      alt: text('alt', MAX_PROSE),
      caption,
      /** Which machine the file is on. Empty means this one. */
      machine: text('machine', 64).optional(),
    })
    .superRefine((b, ctx) => {
      const format = mediaFormatOf(b.path)
      if (format !== null && format.block === type) return
      const found = extname(b.path)
      const aBlock = (of: MediaBlockType): string => (of === 'audio' ? 'an audio block' : 'a video block')
      ctx.addIssue({
        code: 'custom',
        path: ['path'],
        message:
          `${aBlock(type)} plays a ${extensionsSaid(type)} file, and this path ` +
          (found === '' ? 'has no extension' : `ends in "${found}"`) +
          (format === null ? '' : `, which ${aBlock(format.block)} plays: write ${aBlock(format.block)} for it`) +
          '. A file of any other format goes in a "file" block',
      })
    })
}

const audioBlock = mediaBlock('audio')
const videoBlock = mediaBlock('video')

/**
 * HOW DEEP A REPORT MAY NEST, and why there is a limit at all.
 *
 * A section holding two columns holding blocks is three levels, and that is the deepest arrangement
 * anybody has asked for. Past it the writing is a tree somebody has to hold in their head rather
 * than a document somebody reads, and a path naming a block gets longer than the block. The refusal
 * says the number, so a writer who meant it can see what they hit.
 */
const MAX_NESTING = 3

/**
 * A titled run of blocks, and blocks side by side. THE TWO CONTAINERS, AND THEY ARE RECURSIVE.
 *
 * A getter is how zod is told about a shape that holds itself — the union below is not built yet
 * when these two are declared, and the getter is not read until something is parsed. The explicit
 * type annotation on `summaryBlockSchema` is what stops the inferred type from chasing its own tail.
 */
/**
 * WHERE THE SHAPE HOLDS ITSELF, AND THE ONE PLACE THE RECURSION IS WRITTEN DOWN.
 *
 * `z.lazy` is how zod is told about a shape that contains itself: the union below does not exist yet
 * when a container is declared, and the function is not called until something is parsed. The type
 * annotation is what stops TypeScript following the same circle — it names the shape from
 * `src/shared/types.ts`, which is the declaration this whole file is an expression of.
 */
const blockInside: z.ZodType<SharedSummaryBlock> = z.lazy(() => summaryBlockSchema)

/**
 * THE THINGS INSIDE ONE BLOCK THAT CARRY IDS OF THEIR OWN, and what to call one in a refusal.
 *
 * A measurement, a named value, an item of a checklist, an event on a timeline and a tab all carry
 * an id, and the id is how one of them is addressed: `data.blocks[#b-check].items[#c1].text` is the
 * path a comment stores, and it is also the key React draws the row under. Two of them sharing an
 * id makes the first ambiguous and the second draw the wrong row when one is edited — the same two
 * reasons the block-id rule below gives, one level down.
 *
 * NOTHING CHECKED THIS. `IDS_CHECKED_ELSEWHERE` in src/shared/kinds/ids-used-twice.ts stops the record-wide id rule
 * at `SummaryBlock`, correctly, because a block id is narrower than a record — and this file then
 * checked block ids and series ids and nothing else. So a module could store two measurements called
 * `m-error`, and tests/an-id-names-one-thing.test.ts, which exists to find exactly this, listed
 * MetricItem as checked here when it was not.
 *
 * WITHIN THE BLOCK AND NOT WITHIN THE SUMMARY, which is a narrower rule than MetricItem's published
 * description used to claim. Two checklists that both number their items 1, 2, 3 are ordinary
 * writing, and nothing addresses an item except through the block that holds it.
 */
function itemsWithIdsIn(block: SharedSummaryBlock): { key: string; what: string; ids: readonly string[] } | null {
  switch (block.type) {
    case 'metrics':
      return { key: 'items', what: 'measurement', ids: block.items.map((i) => i.id) }
    case 'keyvalue':
      return { key: 'items', what: 'named value', ids: block.items.map((i) => i.id) }
    case 'checklist':
      return { key: 'items', what: 'item', ids: block.items.map((i) => i.id) }
    case 'timeline':
      return { key: 'items', what: 'event', ids: block.items.map((i) => i.id) }
    case 'tabs':
      return { key: 'tabs', what: 'tab', ids: block.tabs.map((t) => t.id) }
    // A PART'S ID IS HOW A COMMENT FINDS ITS PART AGAIN after its siblings are reordered, so two
    // parts sharing one is the same fault as two tabs sharing one, and it is refused by the same
    // rule rather than by a second copy of it written beside the composition.
    case 'beside':
      return { key: 'parts', what: 'part', ids: block.parts.map((p) => p.id) }
    // AN OPTION'S ID IS WHAT AN ANSWER STORES, so two options sharing one would make an answer name both.
    case 'choice':
      return { key: 'options', what: 'option', ids: block.options.map((o) => o.id) }
    default:
      // A chart's series and reference lines are checked in `chartSpec` above, beside the rest of
      // what a chart means. Every other block holds nothing with an id of its own.
      return null
  }
}

/** The blocks one container holds. Named once so both containers say the same thing when empty. */
function blocksInside(what: string) {
  return z
    .array(blockInside, { error: `${what} must hold an array of blocks` })
    .min(1, { error: `${what} with nothing in it draws as an empty space on the page` })
    .max(MAX_BLOCKS, { error: `${what} may hold at most ${String(MAX_BLOCKS)} blocks` })
}

const sectionBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('section'),
  title: text('title').optional(),
  blocks: blocksInside('a section'),
})

const boxBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('box'),
  title: text('title').optional(),
  to: text('to', 128).optional(),
  blocks: blocksInside('a box'),
})

const columnsBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('columns'),
  columns: z
    .array(blocksInside('a column'), { error: 'columns must be an array of arrays of blocks' })
    .min(2, {
      error:
        'blocks side by side needs at least two columns. One column is the blocks themselves, so write them ' +
        'straight into the report instead',
    })
    .max(4, { error: 'more than four columns across is unreadable on any screen; write fewer' }),
})

/**
 * Many of the same kind of thing, across and then down. A gallery is one of these full of pictures.
 *
 * `across` is a CAP on how many go on a row, not a promise of how many will: two blocks with
 * `across: 4` are two blocks on the row, and a narrow screen fits fewer whatever this says. Left
 * out, as many fit as will stay readable.
 */
const gridBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('grid'),
  blocks: blocksInside('a grid'),
  across: z
    .literal([2, 3, 4], {
      error:
        'across must be 2, 3 or 4 — it is the most blocks Mole Office will put on one row. One across is the blocks ' +
        'themselves, and five across is unreadable on any screen',
    })
    .optional(),
})

/**
 * One thing shown and the rest put away.
 *
 * WHAT IS UNDER AN UNOPENED TAB IS NOT ON THE SCREEN, so this is for material a reader chooses
 * between and never for material a reader has to read. The refusals below say that rather than
 * leaving it to a comment: one tab is a section with a label on it, and an unlabelled tab is a
 * control nobody can choose.
 */
const tabPanel = z.strictObject({
  id: text('id', 64),
  label: text('label', 64),
  blocks: blocksInside('a tab'),
})

const tabsBlock = z.strictObject({
  ...blockCommon,
  type: z.literal('tabs'),
  tabs: z
    .array(tabPanel, { error: 'tabs must be an array of {id, label, blocks}' })
    .min(2, {
      error:
        'tabs needs at least two tabs. One tab is a titled run of blocks with everything in it hidden behind a ' +
        'control nobody has any reason to press — write a section instead',
    })
    .max(8, { error: 'more than eight tabs is a list of things to hunt through; write sections' }),
})

/**
 * ONE PART OF A COMPOSITION, IN THE FORM IT IS STORED IN.
 *
 * THIS SCHEMA CHECKS THE CANONICAL FORM AND NOT THE SPELLING THE AUTHOR USED. `canonicalise` at the
 * bottom of this file runs first, on the write path, and turns `"60%"` and `proportions: "3:2"`
 * into whole numbers on the parts; by the time a block reaches this schema a share is always a
 * whole number. That is invariant 8 of USER.md with the layers named: what the report wrote, what
 * Mole Office made of it, and what was committed. This is the third layer.
 *
 * WHEN NO SHARE IS WRITTEN, NO `share` KEY IS STORED, so "nobody said" and "somebody said and it
 * was adapted" stay two different facts in the row forever. Writing the chosen share into storage
 * would destroy the first of them.
 */
const besidePart = z.strictObject({
  id: text('id', 64),
  share: z
    .number({ error: 'a share is a whole number saying what this part is worth beside the others' })
    .int({ error: 'a share is a whole number. Write 3 and 2 rather than 0.6 and 0.4 — they mean the same thing' })
    .min(SHARE_MIN, { error: 'a part worth nothing is a part that should not be written' })
    // WHAT REPLACES THE WITHDRAWN SENTENCE. It used to say "write 3 and 2 rather than 60 and 40",
    // which now teaches an author away from a spelling the owner has allowed: 60 and 40 are stored
    // as 3 and 2 before this schema sees them. What is left out of range after reducing is a ratio
    // with no common factor and a term above SHARE_MAX, like 101 to 2.
    .max(SHARE_MAX, {
      error:
        `a share is a ratio between the parts, so it is stored with the common factor taken out — 60 and 40 are ` +
        `stored as 3 and 2. This one is over ${String(SHARE_MAX)} with no common factor left to take out. Write ` +
        `a proportion a person would say out loud: "3:2", "60/40" or "50/50"`,
    })
    .optional(),
  // THE SAME FIELD AS A BLOCK'S, ONE LEVEL UP. It says how wide the writing in every prose block of
  // this part reads; a block inside the part may say it again about itself, and the nearer statement
  // is the one the browser applies.
  measure: measureField,
  blocks: blocksInside('a part'),
})

/**
 * PARTS OF ONE THING, SEEN BESIDE EACH OTHER.
 *
 * WHY A LOPSIDED SHARE IS NOT REFUSED HERE. The layout system is responsible for keeping every part
 * readable and for adapting ratios, and an Agent's proportions are preferences within a valid
 * composition, not absolute pixel or percentage commands. A 400 that threw away a whole report because
 * one picture was asked to be a tenth of a row would make the preference MORE command-like than that,
 * not less. So 9 to 1 is stored, drawn adapted, and
 * reported back in words. Only a share that is not a share — nothing, negative, fractional, out of
 * range, or written on some parts and not others — is refused.
 */
const besideBlock = z
  .strictObject({
    ...blockCommon,
    type: z.literal('beside'),
    // THE AUTHOR'S OWN SPELLING OF THE PROPORTION, KEPT BESIDE THE SHARES IT REDUCES TO. A report
    // may write it INSTEAD of the shares — `proportions: "3:2"` is the one-statement form — and
    // `canonicalise` then writes the shares onto the parts. What is checked here is only that it is
    // a string that reads as a proportion of this row; `canonicalRow` is the one authority, and it
    // is asked in the refinement below rather than restated as a regular expression here.
    proportions: z
      .string({
        error:
          'proportions is one string saying what the whole row is divided into: "3:2", "60/40", "50/50". To say ' +
          'it part by part instead, write "share" on every part',
      })
      .optional(),
    parts: z
      .array(besidePart, { error: 'parts must be an array of {id, blocks}' })
      // THE TWO BOUNDS ARE READ FROM src/shared/beside.ts AND NOT SPELLED OUT HERE. `columns` above
      // writes "at least two" and "more than four" as words beside its own 2 and 4, so its refusal
      // and its rule are two statements of one fact. This one has one.
      .min(PARTS_MIN, {
        error:
          `parts seen beside each other needs at least ${String(PARTS_MIN)} parts. One part is the blocks ` +
          `themselves, so write them straight into the report instead`,
      })
      .max(PARTS_MAX, {
        error: `more than ${String(PARTS_MAX)} parts across is unreadable on any screen; write fewer`,
      }),
  })
  .superRefine((b, ctx) => {
    // EITHER EVERY PART SAYS WHAT IT IS WORTH OR NONE DOES. A half-stated preference is not a
    // preference, and filling the gap for the author would be Mole Office guessing what somebody
    // meant and then storing the guess as though they had written it.
    // WHAT THE ROW SAYS IT IS DIVIDED INTO, AND WHAT ITS PARTS SAY, ASKED OF THE ONE FUNCTION THAT
    // DECIDES. On the write path `canonicalise` has already made these agree, so this fires for a
    // block that reached this schema another way — a test calling `validateSummaryBlocks`, a stored
    // row being read back — and it fires with the same sentence the write door uses, because it is
    // the same function.
    const row = canonicalRow(
      { ...(b.proportions === undefined ? {} : { proportions: b.proportions }), shares: b.parts.map((p) => p.share) },
      `the composition "${b.id}"`,
    )
    if (row !== null && isShareProblem(row)) {
      ctx.addIssue({ code: 'custom', path: ['proportions'], message: row.problem })
    }

    const asked = b.parts.filter((p) => p.share !== undefined)
    const silent = b.parts.filter((p) => p.share === undefined)
    const first = asked[0]
    if (first !== undefined && silent.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['parts'],
        message:
          `${silent.map((p) => `part "${p.id}"`).join(' and ')} says nothing about what it is worth, while part ` +
          `"${first.id}" asks for ${String(first.share)}. Either every part says what it is worth against the ` +
          `others, or none does and Mole Office chooses from what each part holds`,
      })
    }

    // A READING WIDTH IS A STATEMENT ABOUT WRITING. On a part holding a picture or a table there is
    // no reading width to set, so the key would be stored and could never do anything — which is
    // the silent no-op this product refuses rather than accepts.
    b.parts.forEach((part, i) => {
      if (part.measure === undefined) return
      if (leastNeededByBlocks(part.blocks) === 'sentence') return
      ctx.addIssue({
        code: 'custom',
        path: ['parts', i, 'measure'],
        message:
          `part "${part.id}" holds no writing, so there is no reading width to set. "measure" says how wide the ` +
          `writing inside a part reads; leave it out here. To say how much of the row this part is worth beside ` +
          `the others, write "share"`,
      })
    })
  })

/** One block. The discriminator is `type`, so an unknown type names the ones that exist. */
export const summaryBlockSchema = z.discriminatedUnion(
  'type',
  [
    textBlock,
    headingBlock,
    findingBlock,
    calloutBlock,
    metricsBlock,
    keyValueBlock,
    listBlock,
    checklistBlock,
    codeBlock,
    quoteBlock,
    pathBlock,
    chartBlock,
    mathBlock,
    tableBlock,
    timelineBlock,
    imageBlock,
    fileBlock,
    audioBlock,
    videoBlock,
    sectionBlock,
    columnsBlock,
    gridBlock,
    tabsBlock,
    besideBlock,
    worldBlock,
    choiceBlock,
    fillInBlock,
    buttonBlock,
    boxBlock,
  ],
  { error: `Mole Office cannot render that block. Valid types: ${SUMMARY_BLOCK_TYPES.join(', ')}` },
)

export const summaryBlocksSchema = z
  .array(summaryBlockSchema, { error: 'a curated summary must be an array of blocks' })
  .max(MAX_BLOCKS, { error: `a summary may have at most ${MAX_BLOCKS} blocks` })
  .superRefine((blocks, ctx) => {
    // Ids are what a reorder, an edit, a scroll-to anchor and a comment on one block all address.
    // Duplicates also make React reuse the wrong element, so editing one block visibly changes
    // another — a symptom that is very hard to trace back to its cause, and trivial to refuse here.
    //
    // THE WHOLE TREE, NOT THE TOP ROW. A block inside a section is still a block somebody points at
    // by its id, so two of them sharing one is the same fault one level down.
    const seen = new Map<string, string>()
    // THE BOX A BLOCK SITS IN, carried down the walk. As a decision says, a
    // block sits in one box
    // only, so each answer leaves from one place. A box inside a box would put its questions in two.
    let inBox: { id: string; said: string } | null = null
    const walk = (held: readonly SharedSummaryBlock[], depth: number, path: (string | number)[], where: string): void => {
      if (depth > MAX_NESTING) {
        ctx.addIssue({
          code: 'custom',
          path,
          message:
            `this is nested ${String(depth)} deep and a report may nest ${String(MAX_NESTING)}. Past that the ` +
            `writing is a tree somebody has to hold in their head rather than a document somebody reads`,
        })
        return
      }
      held.forEach((block, i) => {
        const at = [...path, i]
        const said = where === '' ? `block ${String(i)}` : `${where}, block ${String(i)}`
        const first = seen.get(block.id)
        if (first !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'id'],
            message: `id "${block.id}" is already used by ${first}; ids must be unique within a summary`,
          })
        } else seen.set(block.id, said)

        // A READING WIDTH IS A STATEMENT ABOUT WRITING, and this is the rule for a block. The same
        // sentence is the rule for a part of a composition, twenty lines up in `besideBlock`, and
        // both ask `leastNeededByBlocks` rather than either of them listing which blocks hold
        // writing. On a table, a picture or a chart there is no reading width to set, so the key
        // would be stored and could never do anything — the silent no-op this product refuses.
        //
        // A CONTAINER IS REFUSED TOO, and the message says where the width of a column comes from.
        // A `columns`, `grid` or `beside` block puts its children across the page; how wide each of
        // those is, is layer 3 and is `share`, not this.
        if (block.measure !== undefined && leastNeededByBlocks([block]) !== 'sentence') {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'measure'],
            message:
              `${said} is a ${block.type} block, which holds no writing, so there is no reading width to set. ` +
              `"measure" says how wide the writing inside a block reads; leave it out here. How wide a COLUMN is ` +
              `is a different question, and its answer is "share" on the parts of a composition`,
          })
        }

        // AND THE THINGS INSIDE THIS BLOCK THAT CARRY IDS. Scoped to the block, so the map is made
        // here rather than outside the walk: see `itemsWithIdsIn` for why within the block is the
        // right width.
        const held = itemsWithIdsIn(block)
        if (held !== null) {
          const used = new Map<string, number>()
          held.ids.forEach((id, n) => {
            const first = used.get(id)
            if (first !== undefined) {
              ctx.addIssue({
                code: 'custom',
                path: [...at, held.key, n, 'id'],
                message:
                  `${said}: two ${held.what}s share the id "${id}" — this one and ${held.what} ${String(first)}. ` +
                  `The id is how one of them is addressed on its own, so give one of them a different id`,
              })
            } else used.set(id, n)
          })
        }

        // THE QUESTIONS AND THEIR BOXES.
        if (block.type === 'choice' && block.many !== true && block.options.filter((o) => o.recommended === true).length > 1) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'options'],
            message: `${said} is a choice of one option and marks more than one option as recommended. Mark one, or set "many": true`,
          })
        }
        if (block.type === 'box' && inBox !== null) {
          ctx.addIssue({
            code: 'custom',
            path: at,
            message:
              `${said} is a box inside the box at ${inBox.said}. A block sits in one box only, so a question in it ` +
              `would be sent by two submits. Put the inner box beside the outer one instead`,
          })
        }
        if (block.type === 'button' && inBox !== null) {
          ctx.addIssue({
            code: 'custom',
            path: at,
            message:
              `${said} is a button inside the box at ${inBox.said}. A button is sent by its own press, so it would ` +
              `sit in two scopes. Put it outside the box`,
          })
        }
        if (block.type === 'box' && questionsIn(block.blocks).every((one) => one.block.type === 'button')) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'blocks'],
            message: `${said} is a box with no choice and no fill-in box in it, so its submit would have nothing to send`,
          })
        }

        // THE CONTAINERS. A block held by any of them is still a block somebody points at by its id,
        // so a duplicate one level down is the same fault, and the depth cap is the same cap.
        if (block.type === 'box') {
          const outer = inBox
          inBox = outer ?? { id: block.id, said }
          walk(block.blocks, depth + 1, [...at, 'blocks'], said)
          inBox = outer
        }
        if (block.type === 'section') walk(block.blocks, depth + 1, [...at, 'blocks'], said)
        if (block.type === 'grid') walk(block.blocks, depth + 1, [...at, 'blocks'], said)
        if (block.type === 'columns') {
          block.columns.forEach((column, c) => walk(column, depth + 1, [...at, 'columns', c], said))
        }
        if (block.type === 'tabs') {
          block.tabs.forEach((tab, t) => walk(tab.blocks, depth + 1, [...at, 'tabs', t, 'blocks'], said))
        }
        if (block.type === 'beside') {
          block.parts.forEach((part, p) => walk(part.blocks, depth + 1, [...at, 'parts', p, 'blocks'], said))
        }
      })
    }
    walk(blocks, 1, [], '')
  })

export type TextBlock = z.output<typeof textBlock>
export type HeadingBlock = z.output<typeof headingBlock>
export type FindingBlock = z.output<typeof findingBlock>
export type CalloutBlock = z.output<typeof calloutBlock>
export type MetricItem = z.output<typeof metricItem>
export type MetricsBlock = z.output<typeof metricsBlock>
export type KeyValueItem = z.output<typeof keyValueItem>
export type KeyValueBlock = z.output<typeof keyValueBlock>
export type ListBlock = z.output<typeof listBlock>
export type ChecklistItem = z.output<typeof checklistItem>
export type ChecklistBlock = z.output<typeof checklistBlock>
export type CodeBlock = z.output<typeof codeBlock>
export type QuoteBlock = z.output<typeof quoteBlock>
export type PathBlock = z.output<typeof pathBlock>
export type ChartBlock = z.output<typeof chartBlock>
export type MathBlock = z.output<typeof mathBlock>
export type TableColumn = z.output<typeof tableColumn>
export type TableRow = z.output<typeof tableRow>
export type TableBlock = z.output<typeof tableBlock>
export type TimelineItem = z.output<typeof timelineItem>
export type TimelineBlock = z.output<typeof timelineBlock>
export type ImageBlock = z.output<typeof imageBlock>
export type FileBlock = z.output<typeof fileBlock>
export type AudioBlock = z.output<typeof audioBlock>
export type VideoBlock = z.output<typeof videoBlock>
export type SectionBlock = z.output<typeof sectionBlock>
export type ColumnsBlock = z.output<typeof columnsBlock>
export type GridBlock = z.output<typeof gridBlock>
export type TabPanel = z.output<typeof tabPanel>
export type TabsBlock = z.output<typeof tabsBlock>
export type BesidePart = z.output<typeof besidePart>
export type BesideBlock = z.output<typeof besideBlock>
export type SummaryBlock = z.output<typeof summaryBlockSchema>

// ---------------------------------------------------------------------------- the message

/**
 * The declared type of a raw block, for the error message.
 *
 * Read from the INPUT rather than from the parsed output, because the block being complained
 * about is by definition one that did not parse.
 */
function declaredType(raw: unknown): string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw === null ? 'null' : Array.isArray(raw) ? 'an array' : `a ${typeof raw}`
  }
  const t = (raw as { type?: unknown }).type
  return typeof t === 'string' && t.length > 0 ? t : 'no type'
}

/**
 * Turn zod's issues into sentences naming the block index, the block type and the field.
 *
 * The house error style is one plain sentence you can act on. For an array of a dozen blocks
 * that has to say WHICH block: "must be a finite number" on its own is unactionable when there
 * are forty numbers on the page.
 */
function explainBlocks(error: z.ZodError, input: unknown): string {
  const raw = Array.isArray(input) ? input : []
  const lines = error.issues.map((issue) => {
    const [head, ...rest] = issue.path
    // An issue with no index belongs to the array itself, e.g. "at most 200 blocks".
    if (typeof head !== 'number') return issue.message
    const where = rest.join('.')
    const at = `summary block ${head} (${declaredType(raw[head])})`
    return where ? `${at}: ${where} — ${issue.message}` : `${at}: ${issue.message}`
  })
  // One bad block can raise several issues; de-duplicate so the message stays readable.
  return [...new Set(lines)].join('; ')
}

/**
 * Check a curated summary, or throw a PanelError (400) the writer can act on.
 *
 * The parsed blocks are returned so a caller gets the narrowed type, but NOTHING is normalised,
 * trimmed or filled in here: every schema above is strict and non-transforming, so a block that
 * validates is the block that was sent.
 *
 * THE SENTENCE THAT FOLLOWED IS WITHDRAWN, 29 August 2026. It said *"rewriting a caller's stored
 * JSON behind their back is exactly the quiet substitution this project bans"*, as a rule about the
 * whole write path. The owner has since written that *"canonical storage may normalize percentages
 * into relative shares"*, so one rewrite is now asked for by name. This function still does none of
 * it — it checks the canonical form and nothing else — and the commit after this one says where the
 * rewrite happens instead.
 */
export function validateSummaryBlocks(value: unknown): SummaryBlock[] {
  const result = summaryBlocksSchema.safeParse(value)
  if (result.success) return result.data
  throw new PanelError(`The curated summary is not usable: ${explainBlocks(result.error, value)}`)
}

// ---------------------------------------------------------------------------- the words a reader reads

/**
 * THE PROSE OF A BODY, AND THE COUNT-OF-WHAT-WAITS READING, ARE IN src/shared/waitingclaims.ts.
 *
 * THEY MOVED, THEY WERE NOT COPIED. Wave 5 step 16 draws the count guard's other half — a mark
 * beside a block whose stated count contradicts the one reading — and that is drawn in a browser.
 * A browser cannot import this file, which reaches the database through ./records.ts. If the mark
 * found a claim in a second way, it would appear beside sentences the write door never saw and stay
 * away from ones it did, which is one rule written twice and free to disagree.
 *
 * THEY ARE RE-EXPORTED FROM HERE rather than every caller being rewritten, for the reason
 * src/web/lib/words.ts gives about the reading table: the import site is not the fact, and moving
 * eleven imports to prove a file moved is churn a reader has to undo to see what changed.
 */
export {
  NAMING_NOUNS,
  NUMBER_WORDS,
  QUANTITY_SPAN_IN_WORDS,
  RESERVED_WAITING_PHRASES,
  countOfWhatIsWaitingIn,
  proseFieldsOfBlocks,
  proseOfBlocks,
  type CountOfWhatIsWaiting,
  type ProseField,
} from '@shared/waitingclaims.ts'


/**
 * NO SHORT FORM MAY BE THE OPENING OF THE BODY IT DESCRIBES.
 *
 * The five lengths are five jobs — a label tells one record apart from its neighbours, a gist is the
 * useful conclusion — and none of them is the body with the end taken off. A cut keeps whichever
 * words came first, which on a report is usually the setup rather than the result.
 *
 * THE OTHER HALF OF THIS RULE IS IN src/shared/kinds/short-form-fields.ts, on the `ShortForms` shape: that one
 * compares the five with EACH OTHER and enforces the word budgets, and it runs in the browser too.
 * This one is the half that needs the body, and the body is a different field on every kind that has
 * one, which is why it is here where blocks are already understood.
 *
 * A short form is passed over rather than complained about when it is not whole. Its own shape
 * check has already refused that, and running two checks over one fault gives a caller two
 * sentences about it.
 */
export function checkShortFormsAgainstBody(stored: unknown, body: readonly SummaryBlock[]): void {
  const forms = readStoredShortForms(stored)
  const prose = proseOfBlocks(body)
  if (prose === '') return
  for (const [level, form] of Object.entries(forms)) {
    if (!isCutOf(form.text, prose)) continue
    const spec = SHORT_FORM_SPECS[level as keyof typeof SHORT_FORM_SPECS]
    throw new PanelError(
      `The ${spec.noun} in \`${SHORT_FORMS_FIELD}.${level}\` is the opening of what this record says, so it was made by ` +
        `cutting rather than written. ${spec.what} A cut keeps whichever words came first, which is usually the ` +
        `setup rather than the result. Write it from the whole of the record, at the length it is for. Nothing ` +
        `was stored.\n\n` +
        `How the comparison is made: it reads the prose a person reads — headings, paragraphs, findings, list ` +
        `items, quotes, captions, table words and a picture's text alternative — and compares the two as ` +
        `sequences of words, lower case, with the punctuation at each end of every word taken off. So adding a ` +
        `full stop to the end of a cut does not get past it.\n\n` +
        `What it cannot see: change one of those words and Mole Office cannot tell the result from writing. Nothing ` +
        `here reads for meaning, and repeated opening words are the only trace a cut leaves. Passing this check ` +
        `is not evidence that a short form was written rather than cut.`,
    )
  }
}


/**
 * THE HALF OF THE BY-PART DOOR THAT NEEDS THE REPORT: which blocks each part covers, and whether a
 * part's writing is a cut of the report's own prose.
 *
 * ---------------------------------------------------------------------------------------
 * THE COVERAGE RULE, AND WHY IT IS THE POINT OF THE WHOLE STRUCTURE
 * ---------------------------------------------------------------------------------------
 *
 * EVERY BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART. A block covered by nothing, a block
 * covered twice, and an id the report does not hold are all refused, and the refusal names the ids.
 *
 * A reader must be able to tell which parts are missing. A selection that admits it is a selection
 * does not cure that, and relabelling it would be deception. This rule is what makes the state
 * impossible: a summary written
 * by part cannot leave a part of the report out, because the write is refused until every block has
 * a part standing for it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE TOP-LEVEL BLOCKS THAT ARE COVERED, AND THAT IS THE UNIT THE PAGE DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * A section, a set of columns and a grid hold blocks of their own, and those inner blocks are drawn
 * by the block that holds them rather than on their own. `reportAt` in src/shared/reportrungs.ts
 * chooses among the top-level blocks and nothing else, so covering an inner block would name
 * something no reading length can draw. A part covering the container covers what is inside it.
 *
 * ---------------------------------------------------------------------------------------
 * MEDIA IS COVERED LIKE ANYTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * A picture and a chart never count as words and are covered all the same, because coverage is
 * about which part of the report a part stands for, not about how long the writing is. A report
 * whose chart belonged to no part would be a report with a hole in it at levels 4 to 6.
 */
/**
 * WHAT A COPY IS, IN THE REFUSAL'S OWN WORDS, and what the check cannot see.
 *
 * One sentence, written once, so the rule a writer reads is the rule the code applies. It says the
 * number out of `WORDS_THAT_MAKE_A_COPY` rather than repeating it, for the reason this repository
 * keeps saying: a number written twice is a number free to disagree with itself.
 */
const HOW_A_COPY_IS_READ =
  `A copy is the same run of ${String(WORDS_THAT_MAKE_A_COPY)} or more words in the same order: the whole of what ` +
  `was written here is words the report already had, in the order it had them. The words are compared lower case ` +
  `with the punctuation at each end of each word taken off, so a full stop added at the end does not get past it. ` +
  `What it cannot see: change one word and Mole Office cannot tell the result from writing, and a summary that ` +
  `repeats only part of a sentence is not read as a copy at all. Passing this is not evidence that a summary was ` +
  `written rather than cut.`

export function checkPartsAgainstBody(stored: unknown, body: readonly SummaryBlock[], kind: string): void {
  // WHAT TO CALL THE RECORD AND WHERE ITS BLOCKS ARE, read off the declaration. Every sentence
  // below used to say "the report", because `report` was the only kind that held blocks when they
  // were written. A module holds them in `summaryBlocks` and carries the same by-part levels, so a
  // module's writer was told about a report they had not written, and pointed at a field their
  // record has not got. `blocksFieldOf` is the one function that names a record's block field and
  // `kindWord` is the one place a kind has a word for a person.
  const word = kindWord(kind).text
  const field = blocksFieldOf(kind) ?? 'blocks'
  const written = readStoredParts(stored)
  if (written === null) return

  // NO PART'S WRITING MAY BE THE OPENING OF THE REPORT. The same rule the whole-record forms are
  // held to, over the same comparison, applied to all three texts of every part.
  const prose = proseOfBlocks(body)
  if (prose !== '') {
    // AND NO PART'S WRITING MAY OPEN AS A BLOCK OPENS, OR WITH A SENTENCE OF THE REPORT.
    //
    // The rule above compares against the opening of the WHOLE report, so it caught a heading cut
    // from the report's first line and nothing else. Measured on 3 September 2026 by the fifth
    // verification: a heading set to the first nine words of the BODY of the report's first block —
    // "Yes, the old name ships. **17,808 occurrences across 1,563" — was stored, 200. That is a cut,
    // and the rule that was meant to catch cuts did not look there. Problem `IQgOSySmbyOh`.
    //
    // WHAT COUNTS AS A COPY: the WHOLE of what was written is words the report already had, in that
    // order, and there are at least eight of them. Both halves matter.
    //
    //   THE WHOLE OF IT, because a summary of a one-sentence finding honestly begins the way the
    //   finding begins. Measured: a rule that fired on a shared OPENING of eight words refused
    //   "Nobody has pulled the aluminium mount, because the blanks have not been bought and nothing
    //   else waits on it" for standing beside a block that reads "Nobody has pulled the aluminium
    //   mount, because the blanks are not bought". That is a summary, not a cut, and refusing it
    //   would be this rule doing the harm it was written to prevent.
    //
    //   EIGHT WORDS, because shorter runs are what two people write by accident. Below eight, the
    //   whole-report rule above is still the one that fires, at any length.
    //
    // EACH PROSE FIELD OF A BLOCK IS ASKED ON ITS OWN, AND SO IS THE BLOCK'S PROSE WHOLE.
    //
    // The first arm was written against `proseOfBlocks([block])`, which joins ALL of a block's
    // prose fields in order, so it caught a copy only where the copy began at the block's FIRST
    // field. Measured on 3 September 2026 by the fifth verification, on report `FPf58Hfk7_z_`: the
    // first nine words of the TEXT of a callout titled "The short answer" were stored, 200, because
    // the callout's prose opens with its title and the copy started three words in. The same held
    // for a finding's `detail`. Problem `PaZ8ijY_4moz`.
    //
    // SO BOTH ARE ASKED, and they catch different things. A copy that begins inside a block — its
    // text, its detail, its caption — is the opening of one FIELD. A copy that runs from a block's
    // heading into its paragraph is the opening of neither field alone and is the opening of the
    // block's prose whole. Dropping either would put back a hole.
    //
    // THE FIELD IS ASKED FIRST because its refusal is the more useful one: it names the block AND
    // which of its fields the words were taken from.
    //
    // Measured on 3 September 2026 against a copy of the live database, by
    // `scripts/corpus-cut-sweep.ts`: of the 747 stored part texts across the 27 reports this
    // project holds, none is refused by any of the three arms. The sweep carries its own control —
    // a text it knows is a copy — so 0 cannot mean "nothing was checked".
    const fields = proseFieldsOfBlocks(body)
    const openings = body.map((block) => ({ id: block.id, prose: proseOfBlocks([block]) }))
    const sentences = sentencesOfProse(prose)
    for (const part of written.parts) {
      const texts = textsOfPart(part)
      for (const which of PART_TEXTS) {
        const spec = PART_TEXT_SPECS[which]
        if (isCutOf(texts[which], prose)) {
          throw new PanelError(
            `The ${spec.noun} of part "${part.id}" is the opening of what this record says, so it was made by ` +
              `cutting rather than written. ${spec.what} A cut keeps whichever words came first, which is usually ` +
              `the setup rather than the result. Write it from the part it is about, at the length it is for. ` +
              `Nothing was stored.`,
          )
        }
        const words = countWords(texts[which])
        if (words < WORDS_THAT_MAKE_A_COPY) continue

        // ONE: IT IS THE OPENING OF ONE PROSE FIELD OF A BLOCK — a heading, a paragraph, a
        // finding's detail, a callout's text, a caption, a row of a table. This is the case the
        // fifth verification measured twice.
        const copiedField = fields.find((one) => isCutOf(texts[which], one.text))
        if (copiedField !== undefined) {
          throw new PanelError(
            `The ${spec.noun} of part "${part.id}" is the opening of the ${copiedField.field} of the block ` +
              `"${copiedField.blockId}", so it was made by cutting rather than written. ${spec.what} ` +
              `${HOW_A_COPY_IS_READ} Write it from the part it is about, at the length it is for. Nothing was ` +
              `stored.`,
          )
        }

        // TWO: IT IS THE OPENING OF A BLOCK'S PROSE WHOLE, which is a copy that runs from one of
        // its fields into the next — a callout's title and then the first words of its text.
        const copiedBlock = openings.find((block) => isCutOf(texts[which], block.prose))
        if (copiedBlock !== undefined) {
          throw new PanelError(
            `The ${spec.noun} of part "${part.id}" is the opening of the block "${copiedBlock.id}", so it was ` +
              `made by cutting rather than written. ${spec.what} ${HOW_A_COPY_IS_READ} Write it from the part it ` +
              `is about, at the length it is for. Nothing was stored.`,
          )
        }

        // THREE: IT IS A WHOLE SENTENCE OF THE REPORT, from anywhere in it. The rule above only ever
        // looked at the report's first words, which is why a sentence lifted from the middle went
        // through.
        const copiedSentence = sentences.find(
          (sentence) =>
            countWords(sentence) === words && areTheSameWords(texts[which], sentence),
        )
        if (copiedSentence !== undefined) {
          throw new PanelError(
            `The ${spec.noun} of part "${part.id}" is a sentence of this ${word}, word for word — "${copiedSentence}" ` +
              `— so it was made by cutting rather than written. ${spec.what} ${HOW_A_COPY_IS_READ} Write it from ` +
              `the part it is about, at the length it is for. Nothing was stored.`,
          )
        }
      }
    }
  }

  // WHICH BLOCKS THE REPORT HAS, in the order it holds them, and only the top-level ones.
  const held = body.map((block) => block.id)
  const heldSet = new Set(held)

  // A RECORD LEFT WITH NO BLOCKS AT ALL, ITS PARTS STILL STANDING, GETS ITS OWN SENTENCE.
  //
  // This is the write that takes the body away: a wholesale `data` with no `blocks` key, or a patch
  // clearing it. The unknown-id refusal below would name every covered id and then end with "this
  // record's blocks are" and nothing, which tells a reader the shape of the code rather than what
  // happened.
  if (held.length === 0) {
    throw new PanelError(
      `This write would leave the record with no blocks at all, and ${String(written.parts.length)} ` +
        `${written.parts.length === 1 ? 'part' : 'parts'} of \`${SHORT_FORMS_FIELD}.parts\` still standing for ` +
        `blocks it would no longer hold: ${quoted([...new Set(written.parts.flatMap((part) => part.covers))])}. ` +
        `A summary written by part covers the blocks of this ${word}, so parts left behind by it are a ` +
        `summary of nothing, and levels 4, 5 and 6 would draw them beside a record whose writing has gone. Send ` +
        `the body with this write, or take \`${SHORT_FORMS_FIELD}.parts\` out in the same write. Nothing was stored.`,
    )
  }
  const covering = new Map<string, string[]>()
  const unknown: string[] = []
  for (const part of written.parts) {
    for (const id of part.covers) {
      if (!heldSet.has(id)) {
        if (!unknown.includes(id)) unknown.push(id)
        continue
      }
      covering.set(id, [...(covering.get(id) ?? []), part.id])
    }
  }
  if (unknown.length > 0) {
    throw new PanelError(
      `${unknown.length === 1 ? 'The block' : 'The blocks'} ${quoted(unknown)} ` +
        `${unknown.length === 1 ? 'is' : 'are'} named in \`covers\` and this record has no such block. A part ` +
        `covers blocks by their own id, and only the blocks this ${word} holds at the top level: a block inside a ` +
        `section, a set of columns or a grid is drawn by the block that holds it, so covering the container ` +
        `covers what is inside it. This ${word} keeps its blocks in \`data.${field}\`, and they are ${quoted(held)}. ` +
        `Nothing was stored.`,
    )
  }
  const twice = [...covering.entries()].filter(([, parts]) => parts.length > 1).map(([id]) => id)
  if (twice.length > 0) {
    throw new PanelError(
      `${twice.length === 1 ? 'The block' : 'The blocks'} ${quoted(twice)} ` +
        `${twice.length === 1 ? 'is' : 'are'} covered by more than one part: ` +
        `${twice.map((id) => `"${id}" by ${quoted(covering.get(id) ?? [])}`).join('; ')}. Every block of this ` +
        `${word} belongs to exactly one part, so that a reader moving between levels 4, 5 and 6 meets each part ` +
        `of it once. Nothing was stored.`,
    )
  }
  const uncovered = held.filter((id) => !covering.has(id))
  if (uncovered.length > 0) {
    throw new PanelError(
      `${uncovered.length === 1 ? 'The block' : 'The blocks'} ${quoted(uncovered)} ` +
        `${uncovered.length === 1 ? 'is' : 'are'} covered by no part, so levels 4, 5 and 6 would leave ` +
        `${uncovered.length === 1 ? 'it' : 'them'} out of this ${word} with nothing saying so. Every block is ` +
        `covered by exactly one part, pictures and charts included: a picture never counts as words, and it is ` +
        `still a part of this ${word} a reader is entitled to know about. Add ` +
        `${uncovered.length === 1 ? 'it' : 'them'} to the part ${uncovered.length === 1 ? 'it belongs' : 'they belong'} ` +
        `to, or write another part. Nothing was stored.`,
    )
  }
}

/** A list of ids in a sentence, each quoted: `"b-1", "b-2" and "b-3"`. */
function quoted(ids: readonly string[]): string {
  return joined(ids.map((id) => `"${id}"`))
}

// ------------------------------------------------------- what the report wrote, made canonical

/**
 * THE PROPORTIONS A WRITE ASKED FOR, TURNED INTO THE ONE FORM THAT IS STORED. THE ONLY PLACE THAT
 * REWRITES ANYTHING A CALLER SENT.
 *
 * Canonical storage may turn percentages into relative shares, and this is where it does. It is the
 * middle layer of invariant 8 of USER.md — the report says
 * what it means, Mole Office says what it made of it, and what is committed is canonical and strict.
 *
 * WHAT IT DOES, AND IT IS THE WHOLE LIST:
 *
 *   `proportions: "60/40"` on a row     -> `share: 3` and `share: 2` on its parts, `proportions` kept
 *   `share: "60%"` / `share: "40%"`     -> `share: 3` and `share: 2`, `proportions: "60%/40%"` added
 *   `share: 60` / `share: 40`           -> `share: 3` and `share: 2`, `proportions: "60/40"` added
 *   `share: 3` / `share: 2`             -> unchanged, `proportions: "3/2"` added
 *   nothing stated                      -> UNTOUCHED. Nobody asked, so nothing is written.
 *
 * NOTHING ELSE IN ANY RECORD IS TOUCHED. It walks to the compositions and back, and every object it
 * does not change it returns by identity, so a patch that changed nothing still compares equal to
 * what is stored and writes nothing at all.
 *
 * WHY THE SPELLING IS KEPT. The shares alone cannot say which spelling produced them — 60/40, 6/4
 * and 3:2 all reduce to 3 and 2 — so storing only the shares would lose what the author asked for,
 * and the answer for a write could no longer say *you asked for 60/40 and this is drawn 74/26*. The
 * reducing is lossless only because both are kept.
 *
 * IT REFUSES RATHER THAN RESCALING. Percentages that do not add up to 100, a ratio that cannot be
 * written in whole numbers, a row and its parts asking for different things: each throws, with the
 * sentence `canonicalRow` wrote, and nothing is stored.
 */
export function canonicalise(kind: string, data: unknown): unknown {
  const field = blocksFieldOf(kind)
  if (field === null || !isPlainObject(data)) return data
  const blocks = data[field]
  if (!Array.isArray(blocks)) return data
  const next = canonicalBlocks(blocks)
  return next === blocks ? data : { ...data, [field]: next }
}

/**
 * EVERY BLOCK IN A LIST, MADE CANONICAL. The same array comes back when none of them changed.
 *
 * IT WALKS BY KEY AND NOT BY BLOCK TYPE. Four keys hold blocks — `blocks` on a section, a grid, a
 * tab and a part; `columns` on a comparison; `tabs`; `parts` — and a walk that listed block TYPES
 * would be a second answer to "what holds blocks", free to fall behind the schemas above. A key
 * holding something that is not a list of blocks is left alone: this function checks nothing, and
 * the schemas that do run straight after it.
 */
function canonicalBlocks(blocks: readonly unknown[]): readonly unknown[] {
  return mapKeeping(blocks, canonicalBlock)
}

/** Every entry through `fn`, and THE SAME ARRAY BACK when every entry came back unchanged. */
function mapKeeping(list: readonly unknown[], fn: (one: unknown) => unknown): readonly unknown[] {
  const out = list.map(fn)
  return out.every((one, i) => one === list[i]) ? list : out
}

function canonicalBlock(block: unknown): unknown {
  if (!isPlainObject(block)) return block
  let out = block

  // DOWN FIRST, so a composition inside a section, a tab or another composition's part is reached.
  // A tab and a part are not blocks — each is an object with a `blocks` array in it — and both are
  // walked by `canonicalBlock` anyway, which finds that array by the same key a section uses.
  for (const key of ['blocks', 'tabs', 'parts'] as const) {
    const held = out[key]
    if (!Array.isArray(held)) continue
    const next = mapKeeping(held, canonicalBlock)
    if (next !== held) out = { ...out, [key]: next }
  }
  const columns = out['columns']
  if (Array.isArray(columns)) {
    const next = mapKeeping(columns, (column) => (Array.isArray(column) ? canonicalBlocks(column) : column))
    if (next !== columns) out = { ...out, columns: next }
  }

  if (out['type'] !== 'beside') return out
  const parts = out['parts']
  if (!Array.isArray(parts)) return out

  const row = canonicalRow(
    {
      ...(out['proportions'] === undefined ? {} : { proportions: out['proportions'] }),
      shares: parts.map((part) => (isPlainObject(part) ? part['share'] : undefined)),
    },
    `the composition "${typeof out['id'] === 'string' ? out['id'] : 'with no id'}"`,
  )
  // NOTHING TO DO. Either nobody asked for a proportion, or what a part wrote is a number some
  // other refusal already owns — 0, 2.5, 101 — and answering it here would be one rule twice.
  if (row === null) return out
  if (isShareProblem(row)) throw new PanelError(`The curated summary is not usable: ${row.problem}`)
  return {
    ...out,
    proportions: row.askedAs,
    parts: parts.map((part, i) => (isPlainObject(part) ? { ...part, share: row.shares[i] } : part)),
  }
}

/**
 * THE BODY THIS WRITE IS ABOUT TO STORE, VALIDATED — or null when this write has no body in it.
 *
 * Null covers three different absences and none of them is a body: the kind holds no blocks at all,
 * the write does not mention the field, or the write clears it. A caller that wants to tell those
 * apart has `blocksFieldOf` and the `data` it already holds.
 *
 * IT IS ONE READING BECAUSE TWO CHECKS NEED IT. The short-form rule below and the count-of-what-is-
 * waiting guard in lib/records.ts both need the body a write is about to store, and both need it
 * read the same way — which field the kind keeps it in, and what "not touching it" means.
 *
 * ONLY WHEN THE BODY IS PART OF THIS WRITE. A patch that does not send the body is not touching it,
 * and reading the stored one here would answer a question about a report somebody else wrote last
 * month. That is the rule validate.ts already states about `data`.
 */
export function bodyBeingWritten(kind: string, data: Record<string, unknown> | undefined): SummaryBlock[] | null {
  // TWO KINDS HOLD BLOCKS, UNDER TWO FIELD NAMES, AND THE NAMES ARE READ OFF THE DECLARATION rather
  // than written out here. A module keeps a curated summary of how a subsystem stands now, in
  // `summaryBlocks`; a report is a dated piece of writing for a person and its whole body is
  // `blocks`. They used to be a ternary on this line, and the same pair was written out again in the
  // server's target readers and again in the browser, so three places knew one fact.
  const field = blocksFieldOf(kind)
  if (field === null || data === undefined) return null
  if (!(field in data)) return null
  const blocks = data[field]
  // Clearing the curated summary is a legitimate edit, and both spellings of "no value" mean it.
  if (blocks === undefined || blocks === null) return null
  return validateSummaryBlocks(blocks)
}

/**
 * THE BODY THE RECORD WILL STAND ON AFTER THIS WRITE — or null when this kind holds no body at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SECOND READING AND NOT A CHANGE TO THE ONE ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * `bodyBeingWritten` answers *is this write touching the body*, which is the right question for a
 * guard: an agent marking the owner's report read may not be refused for words it does not touch.
 * This one answers *what body will the record have when this write lands*, which is the right
 * question for an invariant. The two differ on exactly one write — the one that takes the body away
 * — and that write is where the invariant was lost.
 *
 * `data` IS ALWAYS THE WHOLE RECORD AS IT WILL STAND. A merge patch is validated as the record it
 * produces (lib/records.ts hands `merged.data` here), and a wholesale `data` write replaces the
 * record's fields. So a body missing from `data` is a body the record will not have, and an empty
 * list is the honest reading of it.
 *
 * MEASURED, 3 SEPTEMBER 2026, before this existed: `PATCH /api/records/<report> {"data": <its own
 * data with the blocks key removed>}` answered 200 and left a report with no blocks whose parts
 * still covered the ids it used to hold. `dataPatch: {"blocks": null}` did the same. Neither
 * reached the coverage rules, because both leave the body out and the reading above then says
 * "not touching it". Problem `IQgOSySmbyOh`.
 */
export function bodyAfterThisWrite(kind: string, data: Record<string, unknown> | undefined): SummaryBlock[] | null {
  if (blocksFieldOf(kind) === null || data === undefined) return null
  return bodyBeingWritten(kind, data) ?? []
}

/**
 * The gate on a record write.
 *
 * Called with the kind of the record being written and the `data` about to be stored. It does
 * something only for a module whose data carries `summaryBlocks` — the field name seed.ts
 * already writes.
 *
 * `ModuleData.summary` is a different thing and is not touched here: that is the one-line
 * generated summary, a plain string. Blocks live in `summaryBlocks`.
 *
 * A `summaryBlocks` that is present but is not an array is refused rather than stored. Stored,
 * it would render as nothing at all, and "nothing at all" is indistinguishable from "no summary
 * yet", which is the confusion this whole file exists to prevent.
 */
export function checkModuleSummary(kind: string, data: Record<string, unknown> | undefined): void {
  // TWO KINDS HOLD BLOCKS AND BOTH GET THE SAME CHECKING — `bodyBeingWritten` above is where that
  // is read, and its note says how.
  //
  // This function checked `kind !== 'module'` and returned, so every deep rule here was skipped for
  // a report. Nothing failed: kinds.ts still caught the structure, so a broken chart was stored and
  // drew as nothing. That is the gap between "it validated" and "it is right".
  const body = bodyAfterThisWrite(kind, data)
  if (body === null || data === undefined) return

  // A QUESTION IS ANSWERED IN A REPORT, and nowhere else: only a report keeps answers and has the
  // door that sends them. On a module it would draw a question nobody can answer.
  if (kind !== 'report') {
    const asked = questionsIn(body)
    if (asked.length > 0) {
      throw new PanelError(
        `A ${kindWord(kind).text} cannot hold a question for the person: block "${asked[0]!.block.id}" is a ${asked[0]!.block.type}. ` +
          'Choices, fill-in boxes and buttons are answered only in a report, which keeps the answers and sends them. Nothing was stored.',
      )
    }
  }

  // AND THE SHORT FORMS OF THAT BODY, WHILE THE BODY IS IN HAND.
  //
  // This is the one place on the write path that holds both a record's body and the shorter forms
  // somebody wrote from it, so it is the only place the rule "no short form is a cut of the body"
  // can be enforced. Its other half — the word budgets, and no short form being a cut of a LONGER
  // SHORT FORM — is on the `ShortForms` shape in src/shared/kinds/short-form-fields.ts, because
  // those need no body and the browser needs the same answer.
  //
  // IT IS ASKED OF THE RECORD AS IT WILL STAND, not of the write on its own — see
  // `bodyAfterThisWrite` for why the two readings differ and on which write. A record left with no
  // body has no prose, so there is nothing for a short form to be a cut of and this check finds
  // nothing; the coverage rules below are the ones that fire, and they are the invariant.
  checkShortFormsAgainstBody(data[SHORT_FORMS_FIELD], body)
  // AND THE BY-PART STRUCTURE, WHICH NEEDS THE SAME BODY. Its coverage rules cannot be asked
  // anywhere else: which blocks the report holds is the one thing `shortForms` does not carry.
  checkPartsAgainstBody(data[SHORT_FORMS_FIELD], body, kind)
}
