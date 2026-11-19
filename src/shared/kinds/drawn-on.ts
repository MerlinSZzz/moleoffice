// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPES OF WHAT SOMEBODY DREW ON: the thing a note points at, the mark drawn on it, the
 * position it was read at, who an annotation was chosen for, and the words a note quotes.
 *
 * They were moved out of src/shared/kinds.ts with no change of behaviour: the same shapes, the
 * same comments and the same values. `CHOSEN_RECIPIENT_KINDS` moved here with them because the
 * `ChosenRecipient` shape is built from it.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `ShapeSpec` TYPE FROM ./kind-common.ts, `DRAWINGS`,
 * `PICTURE_SETTINGS` AND `TEXT_SIZES` FROM ../targets.ts, AND `RUNGS` FROM ../detail.ts. IT
 * IMPORTS NOTHING FROM ../kinds.ts, so it makes no runtime cycle through it.
 */
import { unionOf, type ShapeSpec } from './kind-common.ts'
import { DRAWINGS, PICTURE_SETTINGS, TEXT_SIZES } from '../targets.ts'
// THE SIX POSITIONS OF THE DETAIL LADDER, from the one place they are declared. A stored view
// naming a rung that does not exist is refused by the same list the ladder itself is built from,
// and a seventh position is accepted here the day it is declared there.
import { RUNGS } from '../detail.ts'

/**
 * The four answers to "who is this comment for", when somebody has chosen.
 *
 * `agent` is a durable agent, named by its record id. It is the one choice that survives the death
 * of whatever process was running: a run ends, and the identity it ran as does not. `session` is a
 * run already working on this, and it resolves to that run's durable identity when it is sent.
 * `new` is deliberately a fresh agent, which is the one choice that is never a substitution.
 * `unresolved` is words that named more than one agent or none — a real answer that stops a
 * dispatch rather than sending it somewhere.
 *
 * PINNED TO `RECIPIENT_KINDS` BY A TEST rather than imported from it, for the reason the paragraph
 * above `ANNOTATION_STATES` gives: that list lives in a server file that opens the database and
 * this file runs in the browser. tests/annotation.test.ts is the test.
 */
export const CHOSEN_RECIPIENT_KINDS = ['agent', 'session', 'new', 'unresolved'] as const

/** The shapes of what somebody drew on, moved out of ../kinds.ts with their comments unchanged. */
export const DRAWN_ON_SHAPES: Record<string, ShapeSpec> = {
  Context: {
    name: 'Context',
    description:
      'WHAT SOMETHING POINTS AT: the thing, optionally the exact words inside it, and optionally the revision it ' +
      'was written against. Three separable facts. A note on a whole report and a note on eleven words of it are ' +
      'this same shape with one field different.',
    fields: [
      {
        key: 'target',
        type: 'Target',
        required: true,
        description: 'What thing. See the Target shape for the thirteen and what identifies each.',
        example: { kind: 'record', recordId: 'PtnsAZ3meHwk', workspaceId: 'greenhouse' },
      },
      {
        key: 'span',
        type: 'Span',
        required: false,
        description:
          'The exact words inside it, when somebody quoted some. Leave it out for a note on the whole thing.',
        example: { quote: 'the mast was knocked', from: 41, to: 61, field: 'data.blocks[#b-1].text' },
      },
      {
        key: 'place',
        type: 'Place',
        required: false,
        description:
          'WHERE the person was inside that thing: the words they chose, the run under the pointer, or the word ' +
          'that means no place finer than the thing itself was recorded. One of the five is always true, so a ' +
          'context written from now on always carries one. It is optional here because contexts written before ' +
          'Mole Office measured this have none, and "nobody recorded this" is a real answer.',
        example: { at: 'surface' },
      },
      {
        key: 'revision',
        type: 'Revision',
        required: false,
        description:
          'Which revision of the record this was written against. Only a target that names a record can carry ' +
          'one, because revisions are of records. Leave it out when nobody recorded which version was on screen ' +
          '— that is honest and it is what everything written before this existed holds.',
        example: { seq: 4, contentHash: '9f2c1ab0d3e4' },
      },
      {
        key: 'seen',
        type: 'Seen',
        required: false,
        description:
          'WHAT WAS ON THE SCREEN WHEN SOMEBODY POINTED, for a thing that holds no stored text of its own — a ' +
          'part of Mole Office\'s own screen, or a whole page. It is EVIDENCE and never identity: the route in it says ' +
          'where the person was standing, not what the comment is about. It is REFUSED on anything that holds its ' +
          'own words, because a copy taken now starts disagreeing with the original at the next edit. Leave it out ' +
          'when nothing measured a screen — everything written before 25 August 2026 has none.',
        example: { route: '/plan', quote: 'Find work below and choose a day for it.', build: 'unknown' },
      },
      {
        key: 'view',
        type: 'View',
        required: false,
        description:
          'WHICH DRAWING OF THE RECORD THE WRITER WAS LOOKING AT. A report is not one drawing: the detail ladder ' +
          'decides which blocks are on the page, so a comment written on a paragraph that only the fullest view ' +
          'draws is about characters a shorter view never shows. This is the one fact that lets Mole Office tell a ' +
          'reader at another view the truth — that the place is real and is not on their screen — instead of ' +
          'drawing a mark on the wrong thing or nothing at all. It is EVIDENCE about a moment on a screen, so ' +
          'nothing recomputes it and AN AGENT MAY NOT SEND ONE: an agent has no screen, never chose a rung, and ' +
          'a view stored by one would be an invented observation about somebody else\'s reading. Leave it out ' +
          'when nothing measured a screen — every context written before 25 August 2026 has none.',
        example: { detail: 'full' },
      },
      {
        key: 'drawnIn',
        type: 'DrawnIn',
        required: false,
        description:
          'WHERE THE WRITER MET THIS THING, when they met it on ANOTHER record\'s page. A link row on a report ' +
          'draws the title of the record it names, and a press on it is about that record — so the page it was ' +
          'read on, and which relation it was drawn under, is a fact nothing else carries. It is not a second way ' +
          'of saying what the comment is about: `target` says that. Leave it out for a press on something that is ' +
          'part of the page it is drawn on, where the ancestry is already in the region tree and storing it here ' +
          'would be one fact in two fields.',
        example: { recordId: 'jT4UYozpfgVQ', regionId: 'section.subject of' },
      },
      {
        key: 'drawnOn',
        type: 'DrawnOn',
        required: false,
        description:
          'WHICH DRAWING THE CARD WAS ON, for a press on a drawing. The anchor rule asks an anchor to keep the ' +
          'ancestor chain, and a card on a drawing had none: the same module is on the module drawing and inside ' +
          'a pipeline\'s, so two comments written in two places read identically. It is not a second way of ' +
          'saying what the comment is about — `target` says that, and a step card\'s target is the step\'s own ' +
          'record while `inside` is the pipeline it was drawn in. Leave it out for a press that was not on a ' +
          'drawing, which is most of them.',
        example: { drawing: 'pipeline', pipelineId: 'f5BLz9ndVUsu', inside: 'f5BLz9ndVUsu' },
      },
    ],
  },

  DrawnOn: {
    name: 'DrawnOn',
    description:
      'THE DRAWING A CARD WAS ON, AND THE BOX IT SAT IN. A drawing is two levels deep and no more, so this is ' +
      'two fields rather than a list: which drawing, and which pipeline box the card was inside. The module ' +
      'drawing and the pipeline drawing are one component with one prop between them, and `drawing` is that ' +
      'prop. Mole Office checks that the records named exist and never fills either in.',
    fields: [
      {
        key: 'drawing',
        type: unionOf(DRAWINGS),
        required: true,
        description:
          'Which drawing: "modules" is the project\'s module drawing, every module of the project; "pipeline" is ' +
          'one pipeline drawn with its steps.',
        example: 'pipeline',
      },
      {
        key: 'pipelineId',
        type: 'string',
        required: false,
        description:
          'The pipeline the drawing draws, where `drawing` is "pipeline". Left out on the module drawing, which ' +
          'draws no single record.',
        example: 'f5BLz9ndVUsu',
      },
      {
        key: 'inside',
        type: 'string',
        required: false,
        description:
          'The record this card was drawn INSIDE: the pipeline box a step card sits in. Left out for a card at ' +
          'the top of the drawing, which is every card on the module drawing and the pipeline boxes themselves. ' +
          'It is not derivable afterwards: a pipeline drawing can draw several pipelines, and which box the ' +
          'reader was looking at is a fact about their screen.',
        example: 'f5BLz9ndVUsu',
      },
    ],
  },

  DrawnIn: {
    name: 'DrawnIn',
    description:
      'ONE REGION OF ONE RECORD\'S PAGE, named as the place something else was drawn in. Both halves are needed ' +
      'and neither is derivable from the other: a region id says which part of a page, and the record says whose ' +
      'page. Mole Office checks the pair resolves and never fills it in.',
    fields: [
      {
        key: 'recordId',
        type: 'string',
        required: true,
        description: 'The record whose page this was drawn on — NOT the record the comment is about.',
        example: 'jT4UYozpfgVQ',
      },
      {
        key: 'regionId',
        type: 'string',
        required: true,
        description:
          'The region of that page: "section.subject of", "section.openAround". It is read by the one parser of ' +
          'the region grammar, and a name nobody can read is refused rather than stored.',
        example: 'section.subject of',
      },
    ],
  },

  View: {
    name: 'View',
    description:
      'HOW MUCH OF A RECORD WAS BEING DRAWN, AND HOW. Three settings read together, not a rendering mode and not ' +
      'a fifth reading style. `detail` and `pictures` change WHICH parts of a record are on the page at all; ' +
      '`size` never does, and is kept because restoring somebody\'s view means restoring what they saw.',
    fields: [
      {
        key: 'detail',
        type: unionOf(RUNGS),
        required: true,
        description:
          `Which position on the detail ladder the record was drawn at, one of: ${RUNGS.join(', ')}. Required, ` +
          'because a reader has always chosen one — there is no moment when a browser cannot say what this was.',
        example: 'full',
      },
      {
        key: 'pictures',
        type: unionOf(PICTURE_SETTINGS),
        required: false,
        description:
          '"drawn" or "left out". Leave it out: there is no control that turns pictures off yet, so no reader has ' +
          'chosen a value and a browser that sent one would be filing evidence about a setting nobody has.',
        example: 'drawn',
      },
      {
        key: 'size',
        type: unionOf(TEXT_SIZES),
        required: false,
        description:
          '"small", "default" or "large". Leave it out for the same reason as `pictures`: the control arrives with ' +
          'the reading presets and until it does there is nothing to record.',
        example: 'default',
      },
    ],
  },

  Seen: {
    name: 'Seen',
    description:
      'WHAT A SCREEN DREW AT THE MOMENT SOMEBODY POINTED AT IT. A MEASUREMENT, NEVER AN IDENTITY. A part of ' +
      "Mole Office's own screen draws words that live in a .tsx file and in no record, so nothing can read them back " +
      'later and the only honest evidence is what was measured then. The route says which page it was seen on; a ' +
      'reader may offer to go back there and must say it is where the comment was SEEN and not what it is ABOUT.',
    fields: [
      {
        key: 'route',
        type: 'string',
        required: true,
        description:
          'The address the browser held, as it held it — "/plan", "/r/FZnpnyoVSpf9". Blank is refused: evidence ' +
          'about what was on screen says which page it was on.',
        example: '/plan',
      },
      {
        key: 'quote',
        type: 'string',
        required: false,
        description:
          'The words that part of the screen drew, whitespace collapsed. Leave it out when it drew none — some ' +
          'parts of the screen draw no words at all, and that is a real answer rather than a blank one.',
        example: 'Find work below and choose a day for it.',
      },
      {
        key: 'cut',
        type: 'boolean',
        required: false,
        description:
          'True when the words were longer than what a screen shows and `quote` holds the first whole words of ' +
          'them. Leave it out otherwise. It is a fact about the stored value, so a reader never has to guess ' +
          'whether a quote that stops was a quote that ended.',
        example: true,
      },
      {
        key: 'build',
        type: 'string',
        required: true,
        description:
          'The commit the screen was built from, or "unknown" — which is a real answer and is what every browser ' +
          'sends today, because nothing in this build passes a commit to the client. A blank one is refused: ' +
          '"unknown" says nobody could read it, and blank says nobody wrote the field.',
        example: 'unknown',
      },
    ],
  },

  ChosenRecipient: {
    name: 'ChosenRecipient',
    description:
      'WHO SOMEBODY CHOSE THIS COMMENT TO GO TO. A DECISION AND NOT A HINT, which is what separates it from ' +
      '`recipientHint`: the hint is the words a person wrote about who they meant, and this is the agent they ' +
      'picked from the list. It is the same four fields a message stores about who it is for, so choosing and ' +
      'sending do not describe the choice in two different shapes.',
    fields: [
      {
        key: 'kind',
        type: unionOf(CHOSEN_RECIPIENT_KINDS),
        required: true,
        description:
          '"agent" is a durable agent, named by agentId — the choice that still means something after the run ' +
          'that was serving it has ended. "session" is a run already working on this, named by sessionId. "new" ' +
          'is deliberately a fresh agent. "unresolved" is words that named more than one agent or none, kept so ' +
          'the refusal is readable beside the comment later.',
        example: 'agent',
      },
      {
        key: 'agentId',
        type: 'string',
        required: false,
        description:
          'Which durable agent, when the kind is "agent". It is the id of a record of kind "agent". Leave it out ' +
          'for every other kind, because there is no durable identity behind any of them.',
        example: 'aGtxQ1xBvNa2',
      },
      {
        key: 'sessionId',
        type: 'string',
        required: false,
        description:
          'Which run, when the kind is "session". Leave it out for a new agent and for words nobody could ' +
          'resolve, because there is no run behind either.',
        example: 'r7K2mQ1xBvNa',
      },
      {
        key: 'said',
        type: 'string',
        required: false,
        description:
          'The words the person typed, when the choice came from saying who they meant rather than pressing a ' +
          'name in the list. Kept exactly, and never rewritten into the sentence beside it.',
        example: 'whoever ran the calibration on Tuesday',
      },
      {
        key: 'why',
        type: 'string',
        required: false,
        description:
          "Mole Office's own sentence about how this agent was arrived at, stored beside the choice and never instead " +
          'of it. A new agent has no such sentence, because nothing was worked out to reach it.',
        example: 'It has touched the record this comment points at, twice this week.',
      },
    ],
  },

  Span: {
    name: 'Span',
    description:
      'THE EXACT WORDS SOMEBODY POINTED AT, KEPT. The quote is stored, so a note still says what it was about ' +
      'after somebody rewrites the text — and Mole Office can then say the text has changed instead of pretending an ' +
      'offset still holds. `from` and `to` are HINTS: they are where the words were when this was written and ' +
      'nothing ever moves them.',
    fields: [
      {
        key: 'quote',
        type: 'string',
        required: true,
        description:
          'The words, exactly as they were on screen. This is the evidence; the two numbers below are only ' +
          'where they used to be.',
        example: 'the mast was knocked',
      },
      {
        key: 'from',
        type: 'number',
        required: true,
        description: 'Where the words started inside the stored string, counted from 0.',
        example: 41,
      },
      { key: 'to', type: 'number', required: true, description: 'Where they ended, counted from 0.', example: 61 },
      {
        key: 'field',
        type: 'string',
        required: false,
        description:
          'WHICH STORED STRING the words were in, as a path from the record down: "summary", ' +
          '"data.blocks[#b-1].text". Leave it out when nothing knew, and Mole Office then looks through every string ' +
          'the thing holds and SAYS that it did rather than implying more precision than it had.',
        example: 'data.blocks[#b-1].text',
      },
    ],
    rules: ['`to` may not be before `from`. A span that ends before it starts is a mistake in the request.'],
  },

  Revision: {
    name: 'Revision',
    description:
      'WHICH REVISION something was written against. Both halves are stored: the number in that record\'s ledger ' +
      'and the content hash of it, which is the same token a read of the record hands back as `version`. Mole Office ' +
      'CHECKS the pair against the ledger and never fills it in — stamping "the newest revision as of now" would ' +
      'claim the author had read the newest revision, and nothing measured that.',
    fields: [
      {
        key: 'seq',
        type: 'number',
        required: true,
        description: 'The revision number, 1 being the oldest. GET /api/records/<id>/revisions lists them.',
        example: 4,
      },
      {
        key: 'contentHash',
        type: 'string',
        required: true,
        description:
          'The content hash of that same revision, from the same entry of the same list. A pair that does not ' +
          'match the ledger is refused rather than half-believed.',
        example: '9f2c1ab0d3e4',
      },
    ],
  },
}
