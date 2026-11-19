// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PERSON CAN POINT AT, DECLARED ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Round seven let a person point at three things: a record, a line of a plan, and a block on the
 * week. A fourth needed edits in about ten places — the stored shape, the shape that validates a
 * write, the reader that says whether the thing is still there, the key two comments about one
 * thing are grouped by, the words the screen draws, and the browser's own copy of all of it. So
 * nobody added a fourth, and the owner tried to point at a paragraph of a report and could not.
 *
 * This is the same fix `KIND_SPECS` in src/shared/kinds.ts already makes for records: ONE
 * DECLARATION, AND EVERYTHING ELSE DERIVED FROM IT. Each entry below says what identifies the
 * thing, whether it holds text somebody can quote, which record it lives in when it lives in one,
 * and what to call it in a sentence a person reads. From that one entry come:
 *
 *   · the TypeScript type of a stored target        — `Target` below, a mapped type over this object
 *   · the shape that validates a write              — `targetSchemas` in src/server/api/agents.ts
 *   · the shapes GET /api/kinds publishes           — `targetShapeSpecs` in src/shared/kinds/the-kinds-as-written.ts
 *   · the attribute an element on screen carries     — `targetAttributeValue` below
 *   · the key two comments about one thing share    — `targetKey` below
 *   · the reader that says whether it is still there — `TARGET_READERS` in src/server/lib/targets.ts
 *
 * ADDING A THING A PERSON CAN POINT AT IS ONE ENTRY HERE. The one other place it has to appear is
 * the server's reader map, which is a total map over the same union, so a missing reader is a
 * compile error rather than a target that silently resolves to nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A CONTEXT IS, AFTER THIS PASS
 * ---------------------------------------------------------------------------------------
 *
 * Three separable facts, not a union of four shapes with one nested inside another:
 *
 *     target      WHAT THING. One of the kinds below.
 *     span        WHICH WORDS, optionally: the quote, where it was, and which stored string.
 *     revision    WHEN, optionally: the revision the comment was written against.
 *
 * A comment on a whole report and a comment on eleven words of it are the same shape with one
 * field different. Round seven's `textSpan` wrapped one of the other three in an `inside` field,
 * which is why a span could only ever sit inside three things.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE MUST NOT REACH THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * It runs in the browser as well as on the server, exactly as src/shared/kinds.ts does. It knows
 * what a target IS and what to call it; it knows nothing about whether one is still there. That
 * question needs the database and is answered in src/server/lib/targets.ts.
 */

import { CUT_MARK } from './shortening.ts'
import { surfaceLabel, type SurfaceId } from './surfaces.ts'
import { content, readStoredWord } from './i18n.ts'
// WHICH FACTS A LINE OF A PLAN CARRIES, from the one list of what a line may say about itself.
// `PLAN_LINE_FACTS` below is that list without the note, which is written in the line's own words.
import { PLANNING_KEYS, type PlanningKey } from './planline.ts'
// HOW MUCH A REPORT SAID, from the one declaration of the detail ladder. `View` below records the
// rung a comment was written at, and a second spelling of those six words here is the defect this
// file's own header names. A TYPE-ONLY import: nothing of detail.ts is evaluated to load this file.
import type { Rung } from './detail.ts'

// ============================================================================ the declaration

/** One field that identifies a target. Plain data: safe to serve as JSON. */
export interface TargetIdentifier {
  key: string
  /** Plain English, for somebody who has never seen Mole Office. Says what to put here. */
  what: string
  /** A real value of the right shape. */
  example: string
  /**
   * TRUE WHERE THIS VALUE IS A POSITION A PERSON READS, NOT AN OPAQUE ID.
   *
   * It changes one thing: whether the value is taken out of a sentence drawn in Normal detail. Ids
   * are — a record id on screen is machinery, and docs/UX-CONTRACT.md puts it in Developer detail.
   * A ROW NUMBER IS NOT. Taking it out left the review pane saying "row , column of the table",
   * measured in Chromium on 18 August 2026 the first time a person could point at a cell.
   *
   * It is declared here, beside the value it is about, because `idsOfTarget` working it out from
   * the shape of the string would be the same fact in two places — and the one that guessed would
   * be the one drawing the sentence.
   */
  readonly isPosition?: true
  /**
   * TRUE WHERE THIS VALUE MAY BE ABSENT, AND ABSENCE IS A REAL ANSWER RATHER THAN A GAP.
   *
   * One value is declared this way: the project a `page` names. A comment written on a page is
   * about the project the reader is in, so nothing needs saying and nothing is written. A LEAD may
   * point at a page in ANOTHER project — criterion M60, whose own section says why — and then
   * the project has to be on the target, because the address of a page does not carry it (see the
   * header of src/web/lib/workspace.ts, which says why the project is deliberately not in the
   * address).
   *
   * WHAT IT COSTS THE THREE DERIVED THINGS. `targetAttributeValue` writes an empty part for an
   * absent optional value, so the number of parts still matches the declaration and the reader
   * still needs no second list of names. `targetFromAttributeValue` reads an empty part for an
   * optional key as ABSENT and leaves the key off, and goes on refusing an empty part for a
   * required one. The derived `Target` type marks the property optional.
   */
  readonly optional?: true
}

/** The values that identify one target, by key. */
export type TargetIds = Readonly<Record<string, string>>

/** Everything there is to know about one kind of thing a person can point at. */
export interface TargetSpecShape {
  /** What one of these is called, in a sentence a person reads. Lower case, no metaphors. */
  readonly noun: string
  /** What it is, in one sentence, for somebody who has never seen Mole Office. */
  readonly what: string
  /**
   * Whether this kind of thing holds text somebody can quote.
   *
   * A span may only be written against a target whose answer is true. A page is a route and holds
   * no stored string, so a quote inside one would name words nothing keeps.
   */
  readonly holdsText: boolean
  /**
   * Which of the identifiers below holds a RECORD id, or null when this thing is not part of a
   * record.
   *
   * It is what makes `context.revision` answerable: revisions are of records, so a target that
   * names no record cannot say which revision it was written against. A plan line and a block on
   * the week are the ordinary cases — neither is a record and neither has a ledger.
   */
  readonly recordIdentifier: string | null
  /** What identifies one, in the order it is written into the attribute an element carries. */
  readonly identifies: readonly TargetIdentifier[]
  /** How to name one in a sentence, from its ids alone, when nothing can be read about it. */
  readonly name: (ids: TargetIds) => string
}

/**
 * THE THINGS A PERSON CAN POINT AT.
 *
 * HOW MANY THERE ARE IS `TARGET_KINDS.length` AND IS NOT WRITTEN OUT HERE. This heading read
 * "the thirteen" while the list below held fifteen, and every other file that repeated the number
 * was wrong with it — a count in prose beside the list it counts is a fact in two places, and this
 * is the one that goes stale.
 *
 * The list comes from design/ROUND-EIGHT.md. Everything it asks to be able to point at
 * is one entry here, including the two that are self-referential — an annotation somebody has
 * already written, and an instruction nobody has sent yet. That those two need no machinery of
 * their own is the test of whether this model is right.
 *
 * NOT EVERY ENTRY CAN BE RESOLVED TODAY, and the ones that cannot say so out loud. `graphNode`,
 * `proposedAction` and `draft` name things Mole Office does not store yet, so a write against one is
 * REFUSED with a sentence naming what is missing. A refusal is the honest answer; storing a comment
 * Mole Office can never look up again would be silence dressed as success.
 */
const TARGET_SPECS = {
  record: {
    noun: 'record',
    what:
      'A record in Mole Office — a report, a module, a pipeline, a finding, a decision, a task. Anything with a ' +
      'record id.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the record', example: 'PtnsAZ3meHwk' },
      { key: 'workspaceId', what: 'the project the record is filed in', example: 'panelx' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.record', { recordId: content(ids['recordId'] ?? '') }),
  },

  plan: {
    noun: 'plan',
    what: 'A whole plan. A plan belongs to a person rather than to a project, so it carries no project id.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [{ key: 'planId', what: 'the id of the plan', example: 'mJoNrYYP2XUb' }],
    name: (ids: TargetIds) => readStoredWord('targets.name.plan', { planId: content(ids['planId'] ?? '') }),
  },

  reportBlock: {
    noun: 'block of a report',
    what:
      'One block of a report or of a module\'s curated summary: a paragraph, a chart, an equation, a table or a ' +
      'picture. The block carries its own id inside the record.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the report or module the block is in', example: 'PtnsAZ3meHwk' },
      { key: 'blockId', what: 'the block\'s own id, unique inside that record', example: 'b-what-broke' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.reportBlock', { blockId: content(ids['blockId'] ?? ''), recordId: content(ids['recordId'] ?? '') }),
  },

  /**
   * A PART OF A REPORT. `regionId` IS DELIBERATELY NOT MARKED `isPosition`, and the reason matters.
   *
   * `isPosition` says the value is a position a person reads, and it does two things: it keeps the
   * value in a sentence drawn at Normal detail, and it tells `quoteWhatItHolds` to measure and
   * store what the thing held. A region id is neither. It is a stored path with machinery in it —
   * `data.blocks[#b-5].text@412` — so it belongs in Developer detail with every other id, and the
   * question "have these characters changed" is answered for a region by the reader resolving by
   * containment, not by a quote written beside the target. Marking it would put the whole
   * paragraph into the comment's place as a `words` span, over the top of the `surface` place the
   * browser stored, which is the region saying one thing and the place saying another.
   */
  region: {
    // IT USED TO READ `part of a report`, AND THAT WORD IS WHAT A PERSON SEES. The composer prints
    // this noun above whatever they pointed at, so on the day sections landed on all 26 kinds a
    // press on a decision's *Alternatives rejected* was labelled "Part of a report" — on a page
    // with no report on it. The regions are the same regions; the word was narrower than they were.
    noun: 'part of a record',
    what:
      'One meaningful part of a record: a section of its page — its consequence, its history, what is still ' +
      'open around it — or, inside a report or a module\'s curated summary, a paragraph, a bullet, a table, a ' +
      'row, a cell, a caption, a block of code. It is named by the stored path of what it draws, so nothing is ' +
      'written into any record to make one addressable.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the report or module the part is in', example: 'PtnsAZ3meHwk' },
      {
        key: 'regionId',
        what:
          'WHICH PART, as the stored path of what it draws: `data.blocks[#b-5]` for a whole block, ' +
          '`data.blocks[#b-5].text@412` for the paragraph starting at character 412 of that block\'s text. The ' +
          'grammar is declared in src/shared/regions.ts and derived by `regionsOf`; nothing here restates it.',
        example: 'data.blocks[#b-5].text@412',
      },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.region', { regionId: content(ids['regionId'] ?? ''), recordId: content(ids['recordId'] ?? '') }),
  },

  /**
   * ONE WRITE TO ONE FIELD OF ONE RECORD, AS THE LEDGER KEPT IT.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A CHANGE IS A THING A PERSON CAN POINT AT, MEASURED
   * ---------------------------------------------------------------------------------------
   *
   * Measured on 31 August 2026 across the eight record pages the re-gate read: 585 presses inside
   * the change log answered the whole record, eight to fifteen levels up. Every diff path, every
   * old and new value, every arrow. The rows are a person's own reading matter — they are the
   * answer to *who touched this and what did they do* — and the owner's order says the root is the LAST
   * answer, not the answer for anything the page had no name for.
   *
   * ONE ROW IS ONE FIELD, AND THAT IS WHY THIS KIND NEEDS NO THIRD IDENTIFIER. The server writes
   * one change row per changed field — see `logChange` — so *the change* and *the field it changed*
   * are the same object, and naming the change names the field. A separate target for the diff
   * line inside a row would be a second name for one thing.
   *
   * IT HOLDS TEXT, AND THE TEXT IS THE TWO STORED VALUES. `old_value` and `new_value` are columns
   * of `changes`, so a quote taken from one can be read back out of the corpus rather than being
   * evidence that immediately starts drifting.
   */
  change: {
    noun: 'change to a record',
    what:
      'One write to one field of one record, kept in the ledger: who did it, when, in which session, what the ' +
      'field held before and what it holds now. One row per changed field, so a change names the field it ' +
      'changed.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the record that was changed', example: 'PtnsAZ3meHwk' },
      { key: 'changeId', what: 'the id of the change row in the ledger', example: 'xK2mQ7pLd91a' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.change', { changeId: content(ids['changeId'] ?? ''), recordId: content(ids['recordId'] ?? '') }),
  },

  tableRow: {
    noun: 'row of a table',
    what: 'One row of a table block, counted from 1. See the note on `rowKey` for why it is a number today.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the record the table is in', example: 'PtnsAZ3meHwk' },
      { key: 'blockId', what: 'the id of the table block', example: 'b-effort-table' },
      {
        key: 'rowKey',
        isPosition: true,
        what:
          'WHICH ROW, counted from 1 as a string. It is a position and not an identity, because a stored table ' +
          'row has no id of its own — see TableRow in src/shared/kinds/report-blocks.ts. So a row inserted above this one moves ' +
          'it, and Mole Office reports that the row now holds something else rather than pretending the comment ' +
          'followed it. Giving TableRow an `id` is what would change this, and it would change only this entry.',
        example: '2',
      },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.tableRow', { rowKey: content(ids['rowKey'] ?? ''), blockId: content(ids['blockId'] ?? '') }),
  },

  tableCell: {
    noun: 'cell of a table',
    what: 'One cell of a table block: a row and a column, both counted from 1.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the record the table is in', example: 'PtnsAZ3meHwk' },
      { key: 'blockId', what: 'the id of the table block', example: 'b-effort-table' },
      {
        key: 'rowKey',
        isPosition: true,
        what: 'which row, counted from 1 as a string. A position, as on tableRow.',
        example: '2',
      },
      {
        key: 'columnKey',
        isPosition: true,
        what:
          'WHICH COLUMN, counted from 1 as a string. A position for the same reason a row key is one: a stored ' +
          'column carries a label and no id, and two columns may carry the same label.',
        example: '2',
      },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.tableCell', { rowKey: content(ids['rowKey'] ?? ''), columnKey: content(ids['columnKey'] ?? ''), blockId: content(ids['blockId'] ?? '') }),
  },

  planLine: {
    noun: 'line of a plan',
    what: 'One line of one plan. Neither id is a record id: a plan belongs to a person, not to a project.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [
      { key: 'planId', what: 'the id of the plan', example: 'mJoNrYYP2XUb' },
      { key: 'lineId', what: 'the id of the line inside that plan', example: 'He5aXRn5kzyH' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.planLine', { lineId: content(ids['lineId'] ?? ''), planId: content(ids['planId'] ?? '') }),
  },

  /**
   * ONE FACT DRAWN BESIDE A LINE OF A PLAN: its size, the time given to it, or its project.
   *
   * The plan table draws these in cells beside the line, and a right-click on one used to answer
   * the whole line, so nobody could say which fact a question was about (problem ON-vXSmgokHf).
   * A fact has no id of its own. It is read on every read of the plan, from the line's own words
   * or from the work the line is filed as, so it is named by the line and by which fact it is.
   * `PLAN_LINE_FACTS` below is the list of those words, taken from the line's own planning keys.
   *
   * IT HOLDS NO TEXT OF ITS OWN. What a fact says is worked out and is in no stored string, so the
   * words somebody points at are kept as a quote, exactly as they were drawn.
   */
  planLineFact: {
    noun: 'fact about a line of a plan',
    what:
      'One fact drawn beside a line of a plan: its size, the time given to it, or its project. A fact has no id ' +
      'of its own, because it is read from the line or from the work the line is filed as, so it is named by the ' +
      'line and by which fact it is.',
    holdsText: false,
    recordIdentifier: null,
    identifies: [
      { key: 'planId', what: 'the id of the plan', example: 'mJoNrYYP2XUb' },
      { key: 'lineId', what: 'the id of the line inside that plan', example: 'He5aXRn5kzyH' },
      { key: 'fact', what: 'which fact: size, time or project', example: 'project' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.planLineFact', { fact: content(ids['fact'] ?? ''), lineId: content(ids['lineId'] ?? ''), planId: content(ids['planId'] ?? '') }),
  },

  scheduleBlock: {
    noun: 'block on the week',
    what: 'The days somebody means to work on one thing: one window on the schedule.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [{ key: 'windowId', what: 'the id of the window on the schedule', example: 'w7dQ2Kx1mBvA' }],
    name: (ids: TargetIds) => readStoredWord('targets.name.scheduleBlock', { windowId: content(ids['windowId'] ?? '') }),
  },

  graphNode: {
    noun: 'node of a drawing',
    what: 'One node of a graph or an outline, and the drawing it is in.',
    holdsText: true,
    recordIdentifier: 'recordId',
    identifies: [
      { key: 'recordId', what: 'the id of the record the node stands for', example: 'PtnsAZ3meHwk' },
      { key: 'drawing', what: 'which drawing it is in, e.g. the plan graph or a module\'s structure', example: 'plan-graph' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.graphNode', { recordId: content(ids['recordId'] ?? ''), drawing: content(ids['drawing'] ?? '') }),
  },

  agentMessage: {
    noun: 'message in a conversation',
    what: 'One thing said in a conversation with an agent — by a person, or by the agent answering.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [{ key: 'messageId', what: 'the id of the message', example: 'mGYhhpVnfVbZ' }],
    name: (ids: TargetIds) => readStoredWord('targets.name.agentMessage', { messageId: content(ids['messageId'] ?? '') }),
  },

  annotation: {
    noun: 'note left on something',
    what:
      'One annotation: a person pointed at something and said something. It is a record of kind `annotation`, so ' +
      'its id is a record id and it has a revision ledger like every other record.',
    holdsText: true,
    recordIdentifier: 'annotationId',
    identifies: [{ key: 'annotationId', what: 'the record id of the annotation', example: 'aN0t4t10nId1' }],
    name: (ids: TargetIds) => readStoredWord('targets.name.annotation', { annotationId: content(ids['annotationId'] ?? '') }),
  },

  proposedAction: {
    noun: 'proposed action',
    what: 'One action inside an organised reading of what somebody wrote — a thing Mole Office proposes doing about it.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [
      { key: 'interpretationId', what: 'the id of the organised reading', example: 'iNt3rPr3t8n1' },
      { key: 'actionId', what: 'the id of the one action inside it', example: 'a-2' },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.proposedAction', { actionId: content(ids['actionId'] ?? ''), interpretationId: content(ids['interpretationId'] ?? '') }),
  },

  draft: {
    noun: 'instruction not yet sent',
    what:
      'An agent instruction somebody is still writing. Pointing at one is how a person revises what they are ' +
      'about to say before anybody acts on it.',
    holdsText: true,
    recordIdentifier: null,
    identifies: [{ key: 'draftId', what: 'the id of the unsent instruction', example: 'dR4fT1nStRu' }],
    name: (ids: TargetIds) => readStoredWord('targets.name.draft', { draftId: content(ids['draftId'] ?? '') }),
  },

  uiSurface: {
    noun: "part of Mole Office's own screen",
    what: "A named part of Mole Office's own screen.",
    holdsText: false,
    recordIdentifier: null,
    identifies: [
      {
        key: 'surfaceId',
        isPosition: true,
        what: 'WHICH PART OF THE SCREEN, as a name declared in src/shared/surfaces.ts.',
        example: 'rail.modules',
      },
    ],
    name: (ids: TargetIds) => surfaceLabel(ids['surfaceId'] as SurfaceId),
  },

  page: {
    noun: 'page',
    what:
      'A whole page, which is what a comment points at when nothing more precise was under the pointer. A page is ' +
      'a route and holds no stored text, so nothing can be quoted from one.',
    holdsText: false,
    recordIdentifier: null,
    identifies: [
      { key: 'route', what: 'the address of the page, as the browser holds it', example: '/records' },
      {
        key: 'workspaceId',
        optional: true,
        what:
          'THE PROJECT THE PAGE IS IN, and only where that has to be said. A comment on a page is about the ' +
          'project the person is reading, so nothing is written. A lead offering to take somebody to a page in ' +
          'ANOTHER project says which, because the address of a page does not carry the project.',
        example: 'greenhouse',
      },
    ],
    name: (ids: TargetIds) => readStoredWord('targets.name.page', { route: content(ids['route'] ?? '') }),
  },
} as const satisfies Record<string, TargetSpecShape>

/** Every kind of thing a person can point at. */
export type TargetKind = keyof typeof TARGET_SPECS

/** The declaration, readable as data. */
export const TARGET_SPECS_BY_KIND: Readonly<Record<TargetKind, TargetSpecShape>> = TARGET_SPECS

/** The kinds, in declaration order, so every list built from them reads the same way twice. */
export const TARGET_KINDS = Object.keys(TARGET_SPECS) as readonly TargetKind[]

/**
 * ONE STORED TARGET — derived from the declaration above rather than typed out beside it.
 *
 * `Extract<Target, {kind:'tableCell'}>` is `{kind:'tableCell', recordId:string, blockId:string,
 * rowKey:string, columnKey:string}`, and it is that because `identifies` says so. There is no second
 * list of field names anywhere that could disagree with it.
 *
 * AN IDENTIFIER MARKED `optional` BECOMES AN OPTIONAL PROPERTY, which is the whole of what that
 * mark does to the type. See `TargetIdentifier.optional` for what it does to the two derived
 * strings.
 */
type IdentifiersOf<K extends TargetKind> = (typeof TARGET_SPECS)[K]['identifies'][number]

export type Target = {
  [K in TargetKind]: { kind: K } & {
    [F in Exclude<IdentifiersOf<K>, { readonly optional: true }>['key']]: string
  } & {
    [F in Extract<IdentifiersOf<K>, { readonly optional: true }>['key']]?: string
  }
}[TargetKind]

/** The spec for one kind, by its own kind word. */
export function targetSpec(kind: TargetKind): TargetSpecShape {
  return TARGET_SPECS_BY_KIND[kind]
}

/** True when this word is one of the kinds declared above. */
export function isTargetKind(word: string): word is TargetKind {
  return Object.prototype.hasOwnProperty.call(TARGET_SPECS, word)
}

/**
 * A fact a `planLineFact` target can name.
 *
 * WHICH PLANNING VALUES CAN BE READ BACK OUT OF A RECORD. The note is not one of them: it never
 * moves, so it is always in the line's own words and never has to be read back from anywhere.
 */
export type PlanLineFact = Exclude<PlanningKey, 'note'>

/**
 * THE FACTS DRAWN BESIDE A LINE OF A PLAN, which a `planLineFact` target may name.
 *
 * They are the line's own planning keys less the note. A note is written in the line's own words, so
 * pointing at it is pointing at the line. The server uses the same `PlanLineFact` type for its
 * `derived` values of a line.
 */
export const PLAN_LINE_FACTS: readonly PlanLineFact[] = PLANNING_KEYS.filter(
  (key): key is PlanLineFact => key !== 'note',
)

/** True when this word names a fact a `planLineFact` target can point at. */
export function isPlanLineFact(word: string): word is PlanLineFact {
  return (PLAN_LINE_FACTS as readonly string[]).includes(word)
}

// ============================================================================ what a context is

/**
 * WHICH WORDS, inside the target, WITH THE WORDS KEPT.
 *
 * THE QUOTE IS STORED, and that is the point of this shape. A comment about a paragraph still says
 * what it was about after somebody rewrites the paragraph, so Mole Office can say *the text has changed*
 * instead of pretending an offset still holds.
 *
 * `from` and `to` ARE HINTS AND ARE NEVER REPAIRED. They are where the words were when the comment
 * was written. Nothing moves them, and nothing re-attaches a comment to similar-but-different text.
 *
 * `field` names WHICH STORED STRING the words were in — `summary`, `data.blocks[#b-1].text`. When it
 * is absent Mole Office looks through every string the target holds, and the reading says which of the
 * two it did rather than implying more precision than it had.
 *
 * A QUOTE COMES FROM ONE OF TWO PLACES, AND BOTH ARE MEASUREMENTS. Usually somebody selected the
 * words, and then the quote is what they selected. When somebody points at a thing named by WHERE IT
 * SITS — a cell of a table, which has no id of its own — and selects nothing, Mole Office reads what that
 * cell holds at the moment of the write and keeps it here. Without it there is nothing to compare a
 * cell with later, so every reading of such a comment had to answer `unknown`. See `quoteWhatItHolds`
 * in src/server/lib/targets.ts, which is the only place that happens and which never touches words a
 * person chose.
 */
export interface Span {
  /** The opening words, or all the words when the span has no cut flag on its place. */
  quote: string
  /** Where the whole selection started inside the stored string. */
  from: number
  /** Where the whole selection ended inside the stored string. */
  to: number
  field?: string
}

/** A span read for a person, with a visible mark when its stored words are only an opening. */
export interface NamedSpan extends Span {
  cut?: true
}

/**
 * WHICH REVISION the comment was written against.
 *
 * Only a target that names a record can carry one — `recordIdentifier` above says which do — because
 * the revision ledger is of records. Both halves are stored: `seq` is the number in that record's
 * ledger and `contentHash` is the token `versionOf` computes, which is also the stale-write token, so
 * a reader can check that the two still name the same revision.
 *
 * IT IS SUPPLIED BY THE WRITER AND CHECKED, NEVER FILLED IN BY MOLE OFFICE. Stamping "the newest revision
 * as of now" would claim the author had read the newest revision, and nothing measured that: somebody
 * commenting on a page opened an hour ago wrote against what they were looking at. See
 * `checkContextRevision` in src/server/lib/targets.ts, which refuses a pair the ledger does not hold.
 */
export interface Revision {
  seq: number
  contentHash: string
}

/**
 * WHERE THE PERSON WAS INSIDE THE THING, as one shape with five members.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REPLACES AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * Three separate things used to answer this question and none of them answered it fully: a boolean
 * called `wordsNotPlaced`, which carried three different facts at once and could not say which;
 * a browser-side `SelectedWords`; and a browser-side reading called `whatBecameOfTheWords`. A
 * boolean cannot tell "the words are in one stored string" from "the words are in two" from "the
 * words are on screen and in no stored string at all", and those are three different things to
 * write on a review row.
 *
 * ONE OF THESE IS ALWAYS TRUE. `surface` is the honest floor: it means nothing finer than the thing
 * itself was recorded, which is a real answer and not an absence.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH MEMBERS ARE LEGAL ON WHICH KIND
 * ---------------------------------------------------------------------------------------
 *
 * `words`, `across` and `run` all name positions inside a stored string, so they need a kind whose
 * `holdsText` is true. `quote` and `surface` are legal on EVERY kind, including the ones that hold
 * no text — and that is the point of `quote`. Somebody who selects six words of a note Mole Office draws
 * from its own code keeps those six words, because the place carries them. `placeNeedsText` below
 * is the rule and `checkPlace` in src/server/lib/targets.ts is where it binds.
 */
export type Place =
  /** Both ends of the selection in ONE run. With `cut`, the span keeps the whole range and its quote the opening. */
  | { at: 'words'; span: Span; cut?: true }
  /**
   * Both ends in runs, but different runs. Two exact ends, and how many things lay between them.
   *
   * `parts` and `partWord` are a measurement taken in the browser at the moment of pointing —
   * "3 blocks", "2 rows" — because nothing on the server can see what lay between two runs on
   * somebody's screen. `partWord` is the plural noun for whatever those things were.
   */
  | { at: 'across'; from: Span; to: Span; parts: number; partWord: string; cut?: true }
  /** Words on screen that no stored string can be shown to hold. With `cut`, only the opening is kept. */
  | { at: 'quote'; words: string; cut?: true }
  /** No selection. The run of stored text under the pointer, named by where that run starts. */
  | { at: 'run'; field: string; offset: number }
  /** Nothing under the pointer holds text. The thing itself is the whole answer. */
  | { at: 'surface' }

/** The five members, in order, so every list built from them reads the same way twice. */
export const PLACES = ['words', 'across', 'quote', 'run', 'surface'] as const

/** Where somebody was, as a word. */
export type PlaceAt = (typeof PLACES)[number]

/**
 * Does this place name a position inside a stored string?
 *
 * True for the three that do, so they may only be written against a kind that holds text. False for
 * `quote`, which keeps words nothing stored, and for `surface`, which names no position at all.
 */
export function placeNeedsText(place: Place): boolean {
  return place.at === 'words' || place.at === 'across' || place.at === 'run'
}

/**
 * THE SPAN A PLACE HAS, OR NULL. THE ONE FUNCTION THAT DERIVES ONE.
 *
 * A place is stored. A span is worked out from it. Storing both would be the same fact in two
 * fields, which is the defect this repository keeps producing, and it would be worse here than
 * usual: the two would be free to name different words.
 *
 * `across` RETURNS NULL, DELIBERATELY. An earlier draft joined the two ends into one span reading
 * `<the first words>…<the last words>`, with offsets into two different stored strings. That string
 * was never on anybody's screen, and src/server/lib/annotations.ts would have printed it as "the
 * words it was left on are …" — Mole Office presenting a sentence it made up as the words a person
 * chose. The two-ended case is a thing a reader is told about, not a span.
 */
export function spanOf(place: Place): Span | null {
  return place.at === 'words' ? place.span : null
}

/** Add the visible stop mark to a stored prefix, keeping its original range beside it. */
export function spanShownAsCut(span: Span): NamedSpan {
  return { ...span, quote: `${span.quote}${CUT_MARK}`, cut: true }
}

/** The displayed span a place names, when it has one. */
export function namedSpanOf(place: Place): NamedSpan | null {
  const span = spanOf(place)
  if (span === null || place.at !== 'words' || place.cut !== true) return span
  return spanShownAsCut(span)
}

/**
 * WHAT WAS ON THE SCREEN WHEN SOMEBODY POINTED. A MEASUREMENT, NEVER AN IDENTITY.
 *
 * A part of Mole Office's own screen draws words that live in a .tsx file and in no record. Nothing can
 * read them back later, so the only honest evidence is what was measured at the moment of pointing.
 *
 * IT IS EVIDENCE AND NOT IDENTITY, and the difference decides what a comment is filed against. The
 * route is here rather than in the target because the left rail is the same rail on every page: put
 * the route in the name and one part of the screen becomes sixteen different things, none of which
 * a mark can be drawn on.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR FIELDS, AND THEY ARE THE FOUR THE WRITE DOOR TAKES
 * ---------------------------------------------------------------------------------------
 *
 * There was a fifth until 25 August 2026, `inside`, holding the record the address said the person
 * was in. It was written by nothing, read by nothing, and — measured against a running server that
 * day — could not have been stored by anything: `SHAPE_SPECS.Context` in src/shared/kinds/drawn-on.ts did
 * not declare `seen` at all, so every context carrying one came back
 * *"unknown key \"seen\" — a Context has no field by that name"*. This whole shape was a promise the
 * product could not keep. The door is open now and it is open on exactly these four, so what a
 * caller may send and what this file declares are one list rather than two.
 *
 * `inside` is not among them for a second reason of its own: its own comment said it was DERIVED
 * FROM THE ROUTE, and the route is stored two lines above it. One fact in two fields is the defect
 * `checkPlace` refuses a span-and-place pair over; storing it here would have been the same defect
 * with nobody refusing it.
 */
export interface Seen {
  /** Where the person was, as the browser held the address. */
  route: string
  /**
   * The words the part of the screen drew, with runs of whitespace collapsed to single spaces.
   *
   * IT IS LEFT OUT WHERE THE SCREEN DREW NONE, and it used to be declared `quote: string` with the
   * words "it may be empty, and that is a real answer". The write door disagrees, in the one
   * sentence it says about every blank string Mole Office takes: *"A blank value renders as a gap that
   * reads as missing data; leave the key out instead."* So an empty quote was a value the type
   * promised and the door refused, and absence is now the way to say the screen drew nothing.
   */
  quote?: string
  /**
   * The words were longer than the stored bound, and `quote` is the first whole words of them.
   *
   * The bound itself is NOT declared here. It lives with the rest of the rules about how much text
   * a surface shows, because a character limit declared privately by one module is how this product
   * ended up with ten of them. This flag is a fact about the stored value rather than a choice about
   * presentation, which is why it is stored beside it.
   */
  cut?: true
  /**
   * The commit the screen was built from, or `unknown`, which is a real answer. Never drawn.
   *
   * IT IS "unknown" FROM EVERY BROWSER TODAY, AND THAT IS WRITTEN HERE RATHER THAN LEFT TO BE
   * DISCOVERED. Nothing in this repository's build passes a commit to the client: `vite.config.ts`
   * says in its own words that nothing it reads is handed to `define`, so none of it reaches the
   * browser. The field stays, because the day a build stamp exists this is where it goes, and the
   * line above already calls `unknown` a real answer. What must not happen is a screen inventing
   * one.
   */
  build: string
}

/**
 * WHEN EVIDENCE OF WHAT WAS ON SCREEN IS REQUIRED, AND WHEN IT IS REFUSED. One rule, read off
 * `holdsText`, so there is nothing to keep in step.
 *
 * REQUIRED where the kind holds no stored text, because there is no original for a copy to go stale
 * against — the copy IS the only evidence there will ever be.
 *
 * REFUSED everywhere else, because the words are in the corpus and can be read at any time. A copy
 * taken at the moment of writing is a second version of a string Mole Office already has, and it starts
 * drifting immediately. src/server/api/agents.ts names that defect by hand for targets.
 *
 * WHAT ENFORCES IT TODAY IS ONLY THE REFUSAL HALF. See `checkSeen` in src/server/lib/targets.ts:
 * nothing in the product measures a `Seen` yet, so requiring one would refuse writes the product
 * makes today. The requirement lands with the code that measures it, and not before.
 */
export function seenRuleFor(kind: TargetKind): 'required' | 'refused' {
  return targetSpec(kind).holdsText ? 'refused' : 'required'
}

/**
 * HOW A CONTEXT READS NOW — the one union, and the only vocabulary for "the thing is not there".
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT ON THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * Four of these five are decided on the server and one is decided in the browser, so the union
 * belongs to neither and is declared where both can read it. Three separate browser components had
 * invented their own words for the same question, which is how the same comment could read one way
 * in the review column and another way on the page it points at.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH ONE MEANS
 * ---------------------------------------------------------------------------------------
 *
 *   there     — the thing is there and the place still holds.
 *   changed   — the thing is there and the words moved, doubled or left the field.
 *   gone      — the record was deleted, or the name of the part of the screen is not in the
 *               registry. MOLE OFFICE LOOKED, in src/shared/surfaces.ts, which is the only place such a
 *               name lives. That is what separates it from `unknown`.
 *   unknown   — Mole Office has not been taught to look. Nobody looked, which is not the same as
 *               nothing being there, and USER.md's fifth invariant is that the two never draw
 *               alike.
 *   notDrawn  — the name is a real one and nothing on this screen carries it. It is decided in the
 *               browser, after it has waited, and it is the ordinary case rather than a rare one:
 *               the composer's own parts exist only while a composer is open.
 *
 * The words a person reads for these are not here. They are in the state vocabulary, with the words
 * for every other state in the product, so that no component can draw a state word that nobody
 * wrote down.
 */
export const CONTEXT_READINGS = ['there', 'changed', 'gone', 'unknown', 'notDrawn'] as const

/** How a context reads. See `CONTEXT_READINGS`. */
export type ContextReadingState = (typeof CONTEXT_READINGS)[number]

// ============================================================================ the view it was read at

/**
 * WHAT A READER WAS LOOKING AT WHEN THEY WROTE A COMMENT, IN WORDS, SO IT CAN BE HONESTLY DRAWN
 * SOMEWHERE ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS STORED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A report is not one drawing. The detail ladder selects which blocks are on the page, so a comment
 * written on the fourth paragraph of a section — at `full`, where that paragraph is drawn — is a
 * comment about characters that a reader at `gist` never sees. Both readers are looking at the same
 * record and only one of them can be shown where the comment was made.
 *
 * Without this field Mole Office has two ways to answer and both are lies. It can draw the mark anyway,
 * on whatever ancestor happens to be on screen, which says *the comment is about this* about a
 * thing it is not about. Or it can draw nothing, which says *there is no comment here* about a
 * comment that is there. The truthful answer needs one fact nobody stored: WHAT THE WRITER COULD
 * SEE. That is this.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS EVIDENCE, SO IT IS CANONICAL AND IT IS NEVER RECOMPUTED
 * ---------------------------------------------------------------------------------------
 *
 * A view is a fact about a moment on somebody's screen. Nothing can derive it afterwards, and a
 * server that stamped "the newest settings" on a stored comment would be inventing an observation
 * about a person's reading — the same refusal `checkContextRevision` already makes about revisions,
 * for the same reason. So the writer sends what it read, and `checkView` refuses a writer that has
 * no screen to read.
 *
 * OPTIONAL, BECAUSE NOBODY RECORDED IT UNTIL NOW. Measured on a copy of the corpus on 25 August
 * 2026: 7 of 7 live annotations carry a `target`, 5 carry a `place`, 4 carry a `revision` and NONE
 * carries a view. *Nobody looked* is a real answer and it is a different one from *there was
 * nothing to see*; §9.7's fifth invariant is that distinction and this field is where it starts.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS CALLED `View` AND NOT `Presentation`, AND THAT IS NOT A PREFERENCE
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/presentation.ts` owns the word `presentation` for stored AUTHORED presentation intent
 * — which lane a graph node stands in, its order, whether a group is folded — and validates it at
 * presentation.ts:207. Two meanings for one word in one codebase is the defect CLAUDE.md names.
 * The brief offers both words in one line, so `view` is a word of the brief too.
 */
export interface View {
  /**
   * HOW MUCH THE REPORT SAID. The six-position detail ladder in src/shared/detail.ts.
   *
   * REQUIRED, because a reader has always chosen one: `detailFor` in src/web/lib/detailchoice.ts
   * answers for every surface, so there is no moment when a browser cannot say what this was. It is
   * also the dimension that does the work here — the ladder is what decides which blocks, and
   * therefore which regions, are drawn at all.
   */
  detail: Rung
  /**
   * WHETHER PICTURES WERE DRAWN.
   *
   * OPTIONAL, AND THE REASON IS AN ORDERING RULE RATHER THAN A DOUBT. There is no control that
   * turns pictures off today — it arrives with wave 5 step 10, which declares the two dimensions
   * and the four presets — so no reader has ever chosen a value for this. A browser that wrote
   * `'drawn'` here would be filing evidence about a setting nobody has, which is the third
   * engineering rule broken in the one field whose whole purpose is not to break it.
   *
   * THE SHAPE DOES NOT CHANGE WHEN THAT CONTROL LANDS. The writer starts filling it in; every
   * context stored before then keeps the honest gap, exactly as `place` and `seen` do.
   */
  pictures?: 'drawn' | 'left out'
  /**
   * HOW LARGE THE WRITING WAS SET. Three positions.
   *
   * Optional for the same reason as `pictures`, and it is the one of the three that never changes
   * WHICH regions exist — only how big they are drawn. It is recorded because restoring the
   * writer's view means restoring what they saw, and a paragraph at `large` wraps where a paragraph
   * at `small` does not.
   */
  size?: 'small' | 'default' | 'large'
}

/** The two words `pictures` may be, in order, so every list built from them reads the same way. */
export const PICTURE_SETTINGS = ['drawn', 'left out'] as const

/** The three positions `size` may be, in order. */
export const TEXT_SIZES = ['small', 'default', 'large'] as const

/**
 * WHO MAY WRITE A VIEW: whoever has a screen, which today means the browser and nobody else.
 *
 * `seenRuleFor` above refuses stored screen evidence wherever the corpus already holds the words,
 * *precisely so nobody files a claim about a screen they did not see*. This is the same rule
 * pointing at a different writer. An agent reaches every door a browser reaches — the annotation
 * route, the message route, the review entry — and an agent has no screen: it never rendered a
 * report, never chose a rung, and cannot have read one. A view stored by one would be a fabricated
 * observation about somebody's reading, and every drawing downstream would trust it.
 *
 * IT IS A FUNCTION AND NOT A CONSTANT so the day an agent genuinely renders a report — there is no
 * such agent, and invariant six says not to build that door until there is — this is the one line
 * that changes, with the thing that measured it named beside it.
 */
export function viewRuleFor(writtenBy: 'human' | 'agent'): 'allowed' | 'refused' {
  return writtenBy === 'agent' ? 'refused' : 'allowed'
}

/**
 * What a comment, a message or an annotation points at.
 *
 * `place` and `seen` are new and both are optional, because nothing measures either of them yet.
 * They are declared here so that the code that will measure them has one shape to write into, and
 * so that the checks that hold them to their rules can be written and proved before the first one
 * is ever sent. `span` is what the product writes today; it is what `place` replaces, and the two
 * may never both be stored on one context — `checkPlace` in src/server/lib/targets.ts refuses that
 * pair, because one fact in two fields is exactly how the two come to disagree.
 */
/**
 * THE REGION OF SOMEBODY ELSE'S PAGE A THING WAS DRAWN IN, when the thing is not part of that page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A linked record reference stays identifiable as a linked semantic object and carries enough context
 * for a recipient or an agent's suggestion.
 * > enough context for recipient/Agent suggestion.
 *
 * A link row on a report draws ANOTHER record's title, and from 30 August 2026 a press on it names
 * that record — which is the first half of that sentence. The second half is the context: WHICH
 * relation this record was met through, and on whose page. Both are one fact, and the fact is the
 * region the row was drawn inside: `section.subject of` of the report the row is printed on.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT A SECOND WAY OF SAYING WHAT THE COMMENT IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `target` says that, and nothing here changes it. This says where the writer met the thing. The
 * two name two different records on purpose: the comment is about the linked record, and it was
 * written on the page of the record that links to it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ONLY EVER WRITTEN WHERE IT CANNOT BE DERIVED
 * ---------------------------------------------------------------------------------------
 *
 * A paragraph of a report is drawn inside a section of that same report, and that ancestry is
 * already in the region id and in the region tree. Storing it here as well would be one fact in two
 * fields, free to disagree — the defect CLAUDE.md names. So the browser records this only when the
 * region belongs to a DIFFERENT record from the one the target names, which is exactly the case
 * nothing can derive afterwards.
 */
export interface DrawnIn {
  /** The record whose page this was drawn on. Not the record the comment is about. */
  recordId: string
  /** The region of that record's page: `section.subject of`, `section.openAround`. */
  regionId: string
}

/**
 * WHICH DRAWING A CARD WAS ON WHEN SOMEBODY COMMENTED ON IT, AND WHAT IT SAT INSIDE.
 *
 * ---------------------------------------------------------------------------------------
 * THE ANCESTOR CHAIN THAT SECTION 4 ASKS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A right-click anchor preserves the exact visible place when possible, the current projection, the
 * underlying stable Semantic Region and the ancestor chain.
 *
 * A comment on a card stored the record and the level and nothing above them. The same module is on
 * the module drawing and inside a pipeline's, and the same block is on two pipeline drawings, so
 * two comments written in two places read identically. This is the part nothing else carries.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS TWO FIELDS AND NOT A LIST
 * ---------------------------------------------------------------------------------------
 *
 * A drawing is two levels deep and no more: the drawing, and the box a card sits in. `drawing` says
 * which drawing — every module of the project, or one pipeline — and `inside` says which pipeline
 * box a step card was in. A list would be a shape for a depth this product has never had, which is
 * the sixth engineering rule.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT A SECOND WAY OF SAYING WHAT THE COMMENT IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `target` says that and nothing here changes it. A step card's target is the step's own record;
 * `inside` is the pipeline that step is drawn in, which is a different record. `view` says how much
 * the card was saying. This says where the reader was standing when they said it, and it is what
 * takes them back there.
 */
export interface DrawnOn {
  /**
   * WHICH DRAWING. `modules` is the project's module drawing — every module of the project;
   * `pipeline` is one pipeline drawn with its steps.
   *
   * The two are one component with one prop between them, so this is that prop and not a name for a
   * page. A third drawing configured from the same component adds a word here.
   */
  drawing: DrawingWord
  /** The pipeline the drawing draws, where `drawing` is `pipeline`. Absent on the module drawing. */
  pipelineId?: string
  /**
   * THE RECORD THIS CARD WAS DRAWN INSIDE: the pipeline box a step card sits in.
   *
   * Absent for a card at the top of the drawing, which is every card on the module drawing and the
   * pipeline boxes themselves. It is NOT derivable afterwards — a block belongs to its pipeline in
   * the corpus, but a pipeline drawing can draw several, and which box the reader was looking at is
   * a fact about their screen.
   */
  inside?: string
}

/**
 * The drawings this component draws. One word each, and they are the prop, not a page name.
 *
 * `plan` is the third. It is the drawing on the planning page — what this period is working toward
 * — and it is the same component under a different configuration, which is why it is a word here
 * rather than a second implementation. Its subject is a period rather than a record, so a card on
 * it carries no `pipelineId`.
 */
export const DRAWINGS = ['modules', 'pipeline', 'plan'] as const

/** One of `DRAWINGS`. */
export type DrawingWord = (typeof DRAWINGS)[number]

/** True when this word is one of the drawings. Used on a value read back off a page or a row. */
export function isDrawingWord(word: unknown): word is DrawingWord {
  return typeof word === 'string' && (DRAWINGS as readonly string[]).includes(word)
}

export interface Context {
  target: Target
  span?: Span
  place?: Place
  seen?: Seen
  revision?: Revision
  /**
   * WHERE THE WRITER MET THIS THING, when they met it on somebody else's page. See `DrawnIn`.
   *
   * OPTIONAL AND USUALLY ABSENT. Most presses are on a thing that is part of the page it is drawn
   * on, and for those this is derivable and is left off rather than written twice.
   */
  drawnIn?: DrawnIn
  /**
   * WHAT THE WRITER COULD SEE. Optional, canonical, and written by a browser only — see `View`.
   *
   * It is not a sixth way of saying what the comment is about. `target` and `place` say that. This
   * says which drawing those two were read off, so a reader at another drawing can be told the
   * truth about whether the place is on their screen instead of being shown a mark that is not.
   */
  view?: View
  /**
   * WHICH DRAWING THE CARD WAS ON, AND WHAT IT SAT INSIDE. See `DrawnOn`.
   *
   * OPTIONAL AND ABSENT EVERYWHERE BUT A DRAWING. A press on a record page, a row of the rail or a
   * line of a plan was not on a drawing at all, and there is nothing to record.
   */
  drawnOn?: DrawnOn
}

/**
 * THE SPAN A CONTEXT NAMES, WHEREVER IT IS WRITTEN DOWN. THE ONE ACCESSOR BOTH HALVES USE.
 *
 * A context written from now on carries a `place`, and the span is worked out from it — which is
 * why the two are never stored side by side. A context written before Mole Office measured where
 * somebody was carries a bare `span` and no place. Both are real.
 *
 * EVERY READER ASKS THIS AND NOTHING READS `context.span` DIRECTLY. A reader that read the field
 * would go quiet on every comment written after the change of shape: no highlight on the words, no
 * word on the object saying the words moved, and a reading that answers `there` about words that
 * have gone. That is the product telling somebody their comment still points at what it pointed at,
 * which is the one thing this whole feature promises.
 *
 * IT LIVES IN THE SHARED FILE BECAUSE BOTH HALVES ASK IT. The server reads it to say whether the
 * words are still there; the browser reads it to light them. Two copies of this rule would be the
 * defect CLAUDE.md names, and the failure would be silent on one side only.
 *
 * Returning null means NO WORDS WERE NAMED, which is a different thing from words that have since
 * gone. `across` is null on purpose — see `spanOf`.
 */
export function spanNamedBy(context: Context): NamedSpan | null {
  if (context.span !== undefined) return context.span
  const place = context.place
  return place === undefined ? null : namedSpanOf(place)
}

/** The words to look for in stored text, without the display mark added by `spanNamedBy`. */
export function wordsInNamedSpan(span: NamedSpan): string {
  if (span.cut !== true || !span.quote.endsWith(CUT_MARK)) return span.quote
  return span.quote.slice(0, -CUT_MARK.length)
}

/**
 * THE PLACE A CONTEXT ALREADY NAMES, WRITTEN DOWN. THE ONE RULE, AND IT IS NOT A GUESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A WRITE PATH NEEDS THIS AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * `place` is optional in the shape and it may not be optional in the database. A stored context
 * that names a target and carries no place is what src/server/db/contexts-to-regions.ts counts as
 * pending migration work, and `prepareToServe` in src/server/db/migrate.ts then REFUSES TO SERVE
 * the file at the next start. Under `tsx watch` the next start is the next time anybody saves a
 * server file, so one ordinary write through one ordinary door leaves Mole Office unable to come up.
 * Measured on a copy of the live corpus on 31 August 2026: a review started at a region target, a
 * comment written at one, and a message carrying one each stored a place-less row, and a server
 * started on that copy refused with *give 3 stored context(s) the place they point at*.
 *
 * So every door completes the row it writes, and this is the value it completes it with.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH ANSWERS ARE ALREADY TRUE OF THE CONTEXT, WHICH IS WHY THIS IS NOT A DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 *     a span is there  ->  {at: 'words', span}, and the span moves INSIDE the place
 *     no span          ->  {at: 'surface'}
 *
 * A context carrying a span already says the words somebody was on; moving it into the place says
 * the same thing in the one field a place lives in, and `spanNamedBy` above hands back the same
 * span either way. A context carrying no span already says nothing finer than the thing itself was
 * recorded, and `surface` is the word for that — the `Place` declaration calls it "the honest
 * floor: it means nothing finer than the thing itself was recorded, which is a real answer and not
 * an absence". Neither branch invents a position, a field or a quote, so no reader is told
 * something nobody measured.
 *
 * THE SPAN IS REMOVED WHEN IT MOVES, because `checkPlace` in src/server/lib/targets.ts refuses a
 * context carrying both: they are one fact in two fields and free to name different words.
 *
 * A CONTEXT THAT ALREADY CARRIES A PLACE IS HANDED BACK UNTOUCHED. Nothing here overwrites a place
 * anybody chose.
 *
 * IT IS THE SAME RULE THE MIGRATION APPLIES TO THE ROWS ALREADY STORED, and it is written here
 * once: `withPlace` in src/server/db/contexts-to-regions.ts calls this rather than restating it, so
 * a door and the migration behind it cannot drift apart.
 */
export function withThePlaceItNames(context: Context): Context {
  if (context.place !== undefined) return context
  const { span, ...rest } = context
  if (span === undefined) return { ...rest, place: { at: 'surface' } }
  return { ...rest, place: { at: 'words', span } }
}

/**
 * THE WORDS A CONTEXT NAMES, FROM EITHER OF THE TWO PLACES THAT HOLD WORDS. ONE ACCESSOR.
 *
 * Two of the five places hold the words somebody was on. `words` holds them as a span of a stored
 * string; `quote` holds them verbatim because nothing stored can be shown to hold them. They are
 * the same fact to a reader — these are the words this comment is about — so one function answers
 * for both and a screen never has to know which kind it got.
 *
 * WHAT WENT WRONG WITHOUT IT. Only the span was read, so the composer drew the whole panel's name
 * over words the person had selected. Measured on 21 August 2026: fourteen characters selected on
 * Home, stored on the comment as a quote, and the composer's subject line read `Today and this
 * week`.
 *
 * Null means no words were named, which is different from words that have since gone.
 */
export function wordsNamedBy(context: Context): string | null {
  const span = spanNamedBy(context)
  if (span !== null) return span.quote
  if (context.place !== undefined && context.place.at === 'quote') {
    return context.place.cut === true ? `${context.place.words}${CUT_MARK}` : context.place.words
  }
  return null
}

// ============================================================================ the DOM contract

/**
 * THE ATTRIBUTE AN ELEMENT CARRIES TO SAY WHAT IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * THE WHOLE CONTRACT, IN THREE ATTRIBUTES
 * ---------------------------------------------------------------------------------------
 *
 *     data-target="reportBlock/LKJQbOhAK3kz/b-what-broke"
 *         WHAT THIS ELEMENT IS. The kind, then the identifying values in the order `identifies`
 *         lists them, separated by "/", each one percent-encoded so a value containing "/" — a page
 *         route, for instance — cannot break the shape. Walking up from the pointer or from a
 *         selection finds the nearest one, then the one above it, and so on to the page: that walk
 *         IS the priority rule, and it falls out of the document tree rather than being maintained.
 *
 *     data-text-field="data.blocks[#b-what-broke].text"
 *         WHICH STORED STRING the text drawn inside this element came from. It is a field path on
 *         the NEAREST `data-target` ancestor, and it is what a span stores as `field`.
 *
 *     data-text-offset="0"
 *         WHERE THIS ELEMENT'S FIRST CHARACTER SITS in that stored string, counted in characters
 *         from 0. Rendered Markdown is not the string it was rendered from, so a selection can only
 *         be mapped back to a source range by arithmetic: the offset of the element, plus the
 *         characters before the selection inside it. Without this a quote taken off the screen has
 *         to be SEARCHED for in the source, which is guessing when the same words appear twice.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ONE ATTRIBUTE AND NOT ONE PER FIELD
 * ---------------------------------------------------------------------------------------
 *
 * A `data-target-kind` beside a `data-record-id` beside a `data-block-id` is the same fact spread
 * across three attributes, and an element carrying two of the three is a half-wired element that
 * nothing can detect. One attribute is either there and complete or not there at all.
 */
export const TARGET_ATTRIBUTE = 'data-target'

/** Which stored string the text inside this element came from. See `TARGET_ATTRIBUTE`. */
export const TEXT_FIELD_ATTRIBUTE = 'data-text-field'

/** Where this element's first character sits in that string, counted from 0. */
export const TEXT_OFFSET_ATTRIBUTE = 'data-text-offset'

/** The attribute a run drawn across line breaks carries, read by `linesOfARun`. */
export const TEXT_LINES_ATTRIBUTE = 'data-text-lines'

/**
 * WHERE THE THING DRAWN HERE IS STORED — the path, and nothing about offsets.
 *
 * IT IS NOT `TEXT_FIELD_ATTRIBUTE` AND THE TWO MUST NOT MERGE. That one promises the element's
 * text IS the stored string, starting at the offset beside it, and the comment machinery checks a
 * quote against exactly that. A block is not one string: it is an object with a title, a body, rows
 * and cells. So a block says WHERE IT IS and says nothing about characters.
 *
 * It exists because a page that says less has to be checkable. A test can read the set of paths a
 * report drew at each of the six positions and hold it to being a different set every time. A
 * character count cannot tell "fewer things drawn" from "the same things cut shorter", and that
 * difference is the whole of what the detail ladder is for.
 */
export const DRAWN_FROM_ATTRIBUTE = 'data-drawn-from'

/** `{'data-drawn-from': path}`, for an element drawing something stored at `path`. */
export function drawnFrom(path: string): Record<string, string> {
  return { [DRAWN_FROM_ATTRIBUTE]: path }
}

/** The separator between the kind and its values inside `data-target`. */
const PART = '/'

/**
 * A CSS SELECTOR FOR EVERY ELEMENT THAT POINTS AT A THING OF ONE KIND.
 *
 * Built from the two spellings above rather than typed out, so a caller cannot invent a third way
 * of writing what `targetAttributes` writes. The region walk in SummaryBlocks.tsx uses it to find
 * the parts of a report a keyboard can step through.
 */
export function selectorForKind(kind: TargetKind): string {
  return `[${TARGET_ATTRIBUTE}^="${kind}${PART}"]`
}

/**
 * The value an element's `data-target` carries.
 *
 * The values are written in the order `identifies` declares them, so the reader below can put them
 * back without a second list of names. Each is percent-encoded: a page route holds slashes, and a
 * title typed by a person can hold anything at all.
 */
export function targetAttributeValue(target: Target): string {
  const spec = targetSpec(target.kind)
  const ids = target as unknown as TargetIds
  const parts = spec.identifies.map((field) => encodeURIComponent(ids[field.key] ?? ''))
  return [target.kind, ...parts].join(PART)
}

/** `{ 'data-target': '…' }`, ready to spread onto the element that IS the thing. */
export function targetAttributes(target: Target): Record<string, string> {
  return { [TARGET_ATTRIBUTE]: targetAttributeValue(target) }
}

/** The two attributes an element holding rendered text carries. See `TARGET_ATTRIBUTE`. */
export function textAttributes(field: string, offset: number): Record<string, string> {
  return { [TEXT_FIELD_ATTRIBUTE]: field, [TEXT_OFFSET_ATTRIBUTE]: String(offset) }
}

/**
 * Read a `data-target` value back into a target, or say why it cannot be read.
 *
 * A PROBLEM IS RETURNED, NEVER GUESSED AT. An attribute with the wrong number of parts names a
 * different thing from the one the element meant, and the browser walking the tree has to be able
 * to skip it and say so rather than opening a composer pointed at a record id that is really a
 * block id.
 */
export function targetFromAttributeValue(value: string): { target: Target } | { problem: string } {
  const parts = value.split(PART)
  const kind = parts[0] ?? ''
  if (!isTargetKind(kind)) {
    return {
      problem:
        `"${kind}" is not a thing anybody can point at. The kinds are: ${TARGET_KINDS.join(', ')}. The value of ` +
        `${TARGET_ATTRIBUTE} is the kind, then the values that identify it, separated by "${PART}".`,
    }
  }
  const spec = targetSpec(kind)
  const values = parts.slice(1)
  if (values.length !== spec.identifies.length) {
    return {
      problem:
        `A ${spec.noun} is identified by ${spec.identifies.length} value${spec.identifies.length === 1 ? '' : 's'} — ` +
        `${spec.identifies.map((f) => f.key).join(', ')} — and this ${TARGET_ATTRIBUTE} carries ${values.length}: ` +
        `"${value}". Nothing has been guessed at.`,
    }
  }
  const ids: Record<string, string> = { kind }
  for (const [n, field] of spec.identifies.entries()) {
    const raw = values[n] ?? ''
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      return { problem: `The ${field.key} in "${value}" is not readable: "${raw}" is not percent-encoded text.` }
    }
    if (decoded === '') {
      // AN EMPTY PART IS ABSENCE WHERE THE DECLARATION SAYS THE VALUE MAY BE ABSENT, and a refusal
      // everywhere else. `targetAttributeValue` writes an empty part for an optional value nobody
      // set, so the number of parts still matches the declaration; reading it back as the key set
      // to "" would store a project id that is not a project.
      if (field.optional === true) continue
      return { problem: `A ${spec.noun} needs a ${field.key} — ${field.what} — and "${value}" leaves it blank.` }
    }
    ids[field.key] = decoded
  }
  return { target: ids as unknown as Target }
}

/**
 * THE KEY TWO COMMENTS ABOUT ONE THING SHARE.
 *
 * It is the same string `data-target` carries, and that is deliberate: a page looking up whether the
 * thing it is drawing has a comment waiting compares the key it builds for that thing with the key
 * the server sends, and there is exactly ONE spelling of a key in this product. Two spellings, one
 * on each side, is the defect this repository keeps finding, and the failure is silent — every mark
 * simply stops being drawn.
 */
export function targetKey(target: Target): string {
  return targetAttributeValue(target)
}

/** The key for the thing a whole context points at. A comment on a few words is a comment on the thing. */
export function contextKey(context: Context): string {
  return targetKey(context.target)
}

/**
 * WHICH RECORD A TARGET IS INSIDE, or null when it is not inside one.
 *
 * A block of a report, a row of its table and a region of it all name the record they are part of,
 * each under the identifier its own spec declares. A page, a plan line and a part of Mole Office's
 * own screen name none, and null is the honest answer for those rather than an empty string.
 *
 * It is here rather than worked out per caller because three now ask it: the channel event saying a
 * comment was placed, the page deciding whether a comment is about what it is showing, and the
 * offer to take somebody to a record.
 */
export function recordNamedByTarget(target: Target): string | null {
  const key = targetSpec(target.kind).recordIdentifier
  if (key === null) return null
  const held = (target as unknown as Record<string, unknown>)[key]
  return typeof held === 'string' && held !== '' ? held : null
}

/**
 * WHICH PROJECT A TARGET SAYS IT IS IN, or null because the target does not say.
 *
 * TWO KINDS SAY, AND THE REST DO NOT. A `record` always carries its project; a `page` carries one
 * only when it has to (see `TargetIdentifier.optional`). Everything else lives inside a record and
 * has its project read off that record on the server, which the browser cannot do.
 *
 * NULL IS "THE TARGET DID NOT SAY", NEVER "THIS PROJECT". A caller that wants a project for a
 * target that names none has to say out loud which project it is assuming and why. That is the
 * difference between this and a function that would helpfully return the current one.
 *
 * WHO ASKS. The offer to take somebody to a page: a lead may cross projects (criterion M60), so the
 * press has to know whether it is moving the reader's project as well as their page.
 */
export function projectNamedByTarget(target: Target): string | null {
  const held = (target as unknown as Record<string, unknown>)['workspaceId']
  return typeof held === 'string' && held !== '' ? held : null
}

/**
 * WHERE A LEAD SHOULD PUT THE READER'S BROWSER, as an address, or null when the target names no
 * page anybody can go to.
 *
 * A `page` target IS an address and is taken as one. Everything that lives in a record goes to that
 * record's page, and the part inside it is boxed separately by the mark layer. The kinds that name
 * neither — a plan, a part of Mole Office's own screen — answer null, and a caller that gets null
 * must not move anybody.
 *
 * IT IS HERE RATHER THAN IN THE BROWSER because the same question is asked by the browser taking a
 * reader somewhere and by the words a message draws about where it offers to take them.
 */
export function pageNamedByTarget(target: Target): string | null {
  if (target.kind === 'page') return target.route === '' ? null : target.route
  return null
}

// ============================================================================ words

/** How to name one target in a sentence, from its ids alone. Used when nothing can be read about it. */
export function nameTarget(target: Target): string {
  return targetSpec(target.kind).name(target as unknown as TargetIds)
}

/**
 * Every OPAQUE ID a target names. Used to keep ids off the screen in Normal mode, and nowhere else.
 *
 * A position is not one, and leaving positions in is the point: a sentence with the record id taken
 * out still reads, and one with the row number taken out says "row , column of the table". See
 * `isPosition` on the declaration above.
 */
export function idsOfTarget(target: Target): string[] {
  const ids = target as unknown as TargetIds
  return targetSpec(target.kind)
    .identifies.filter((field) => field.isPosition !== true)
    .map((field) => ids[field.key] ?? '')
    .filter((v) => v !== '')
}

/**
 * A SENTENCE THAT NAMES A TARGET, WITH THE TARGET'S IDS TAKEN OUT: what Normal mode shows.
 *
 * This only removes the exact id strings the target names, then the comma and the space each one
 * leaves behind: *the note "Pump notes", FvaQVqKscC-D* becomes *the note "Pump notes"*. A record id
 * belongs in Developer detail. The browser uses it on the server's sentences
 * (`withoutIds` in src/web/components/agent/context.ts).
 *
 * WORDS INSIDE QUOTES ARE NEVER TOUCHED. A record target's ids include the project's workspace id,
 * which is an ordinary word, so removing it everywhere turned the note "robotics bench plan" in
 * project robotics into the note " bench plan" (check Sn7v_9uljg7T). A title is quoted in every
 * sentence that names one, so only the text outside "…" and “…” is read for ids.
 *
 * NOTHING STORED IS BUILT WITH THIS. The numbered quote line of a sent review names what it quotes
 * from its kind and whole title instead (`whatItWasLeftOn` in src/server/lib/reviews.ts).
 */
export function withoutIdsOf(sentence: string, target: Target | null): string {
  const ids = target === null ? [] : idsOfTarget(target).filter((id) => id !== '')
  // Split into the quoted parts, kept as they are, and the parts between them, which lose their ids.
  const parts = sentence.split(/("[^"]*"|“[^”]*”)/)
  const out = parts
    .map((part, at) => {
      if (at % 2 === 1) return part
      let plain = part
      for (const id of ids) plain = plain.split(id).join('')
      return plain
    })
    .join('')
  return out
    .replace(/,\s*(?=[.,;]|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ============================================================================ the two nothing holds

/**
 * WHY AN UNSENT INSTRUCTION CANNOT BE LOOKED UP, in one place, because three screens and two server
 * files were each saying it in their own words and one of those words was wrong.
 *
 * All five used to promise, with the word "yet", that Mole Office would keep an unsent instruction one
 * day. That reads as a gap somebody is going to close. It is not one. An instruction nobody has sent is kept in the browser it
 * is being written in and never reaches the network, and that is the whole of the rule that no agent
 * may start work before the instruction is finally sent. `src/web/lib/drafts.ts` is where it lives
 * and says the same thing at length.
 *
 * The sentence each caller writes still differs, because the verbs differ — one cannot look a draft
 * up, one cannot start a review from it, one has no page to open. What they share is the reason, and
 * the reason is here.
 */
/**
 * THE TWO KINDS THAT NAME NO PLACE IN THE PROJECT, in one statement both sides read.
 *
 * A PAGE is what a comment points at when nothing more precise was under the pointer. A PART OF
 * MOLE OFFICE'S OWN SCREEN — the rail, the top bar, the composer — is on every page. Neither of them is a
 * thing in the project, so neither can be the scope of a review OF ONE PLACE: `SCOPE_READERS` in
 * src/server/lib/reviews.ts refuses both, and says to ask for a project-wide review instead.
 *
 * WHY IT IS HERE AND NOT IN THE SERVER'S OWN FILE. Two screens have to know it before they draw a
 * press — the composer, so it does not offer a control the server will refuse, and the review
 * column, whose own press starts a review about whatever the page is about and is standing on one
 * of these on most routes. A browser copy of the list would be free to disagree with the arms that
 * refuse. The arms themselves stay written out, because each of them owes the reader its own
 * sentence, and `tests/a-project-wide-review-is-asked-for.test.ts` holds both to the same answer.
 */
export function namesNoPlace(kind: TargetKind): boolean {
  return kind === 'page' || kind === 'uiSurface'
}

export const WHY_A_DRAFT_IS_NOT_ON_THE_SERVER =
  'An unsent instruction is kept only in the browser it is written in, and never reaches the server. ' +
  'That is deliberate: an unsent instruction arriving here could start work before it was meant to.'

/**
 * WHY ONE ACTION INSIDE AN ORGANISED READING CANNOT BE POINTED AT.
 *
 * This one changed when Phase 6 landed and two of the three copies were corrected and one was not.
 * Mole Office does keep a reading of a comment now — one sentence, in `annotation.interpretation`, beside
 * the words it is about. What it does not keep is that reading broken into separately numbered
 * actions, so a single action inside it has no identity for anything to name.
 */
export const WHY_AN_ACTION_INSIDE_A_READING_HAS_NO_IDENTITY =
  'A reading of a comment is kept as one sentence beside the words, and a single action inside it has no ' +
  'identity of its own.'
