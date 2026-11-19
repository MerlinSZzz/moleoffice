// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPES SHARED BY MORE THAN ONE KIND, in a file of their own.
 *
 * They were moved out of src/shared/kinds.ts with their comments unchanged, and SHAPE_SPECS
 * spreads them where the first of them stood.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `ShapeSpec` TYPE FROM ./kind-common.ts, AND
 * `PARTICIPANT_KINDS` FROM ../participants.ts, AND `CONSEQUENCE_BEARERS` FROM ../work.ts. IT
 * IMPORTS NOTHING FROM THE CENTRAL FILE.
 */
import { unionOf, type ShapeSpec } from './kind-common.ts'
import { PARTICIPANT_KINDS } from '../participants.ts'
import { CONSEQUENCE_BEARERS } from '../work.ts'
export const SHARED_SHAPES: Record<string, ShapeSpec> = {
  PlanChecklistItem: {
    name: 'PlanChecklistItem',
    description: 'ONE ITEM OF ONE CHECKLIST, by the checklist record\'s id and the item\'s id in it.',
    fields: [
      { key: 'checklist', type: 'string', required: true, description: 'The checklist record\'s id.', example: 'Ck3checklist' },
      { key: 'item', type: 'string', required: true, description: 'The item\'s id in that checklist.', example: 'i-4' },
    ],
  },

  ParticipantRef: {
    name: 'ParticipantRef',
    description:
      'ONE PERSON OR ONE DURABLE AGENT, named by which of the two it is and by its id in that registry. The people ' +
      'and the durable agents of this installation are listed at GET /api/participants; a handle is not an id.',
    fields: [
      {
        key: 'kind',
        type: unionOf(PARTICIPANT_KINDS),
        required: true,
        description: 'Which registry the id is in: a person, or a durable agent.',
        example: 'agent',
      },
      {
        key: 'id',
        type: 'string',
        required: true,
        description: 'The id that registry holds. GET /api/participants lists both registries with the id of each row.',
        example: 'builder-aa',
      },
    ],
  },

  /**
   * ONE STEP OF A QUESTION ON ITS WAY UP TO THE PERSON. Criterion P55.
   *
   * An agent that says `whose_move: person` hands the question to whoever started it, and the
   * starter hands it on again until it reaches an agent the person started. Each hand-on is one of
   * these, and the list is the whole path — kept rather than overwritten, so the record says WHO
   * passed it on and not only that somebody did.
   */
  PassedItOn: {
    name: 'PassedItOn',
    description:
      'ONE AGENT, OR THE PERSON, PASSING A QUESTION ONE RUNG UP. Written when whoever the question is with decides ' +
      'it really is for the person. It is never rewritten: the list of these on a record is the path the question ' +
      'took to reach them.',
    fields: [
      {
        key: 'who',
        type: 'ParticipantRef',
        required: true,
        description: 'Who passed it on. It has to be whoever the question is with now; anybody else is refused.',
        example: { kind: 'agent', id: 'secretary-1' },
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When they passed it on, in local wall clock.',
        example: '2026-09-06 20:15:00',
      },
    ],
  },

  // THERE IS NO `PipelineStep` AND NO `StepNeed` SHAPE ANY MORE, and their absence is the point of
  // the change that removed them. A pipeline block is a record of kind `block`, so its fields are a
  // KindSpec below rather than a nested shape here; what it waits on is a `blocks` link carrying the
  // gate, so the gate's rules are published on the link and not on a nested object. Both used to be
  // published here, and both were unreachable from a link because a nested object has no row in
  // `records`. See shared/blocks.ts for the whole reason.

  // ------------------------------------------- who is hurt, and what is waiting on purpose
  //
  // Both shapes are DECLARED here and DEFINED in shared/work.ts, which is where what a bearer
  // claims and what a pause means are written down. These specs are the storage contract and the
  // words an agent reads over HTTP; work.ts is the authority on the meanings, and its readers
  // (`readConsequence`, `readPause`) are what everything else uses. tests/kinds.test.ts pins the
  // two together in both directions, so neither can gain a word the other has not heard of.

  Consequence: {
    name: 'Consequence',
    description:
      'What goes wrong if a record is left alone, and who it happens to. Stored on the record, never worked ' +
      'out from its title.',
    fields: [
      {
        key: 'bearer',
        type: unionOf(CONSEQUENCE_BEARERS),
        required: true,
        description:
          'Who bears it, worst first. person = somebody could be physically hurt; the rig moves, and this is ' +
          'the ONLY word that marks a safety-critical record. outside = a person or body outside this project ' +
          'is waiting and will be let down. property = money, hardware or data is at risk. dependent = other ' +
          'recorded work depends on this and is wrong or stuck without it. owner = only your own plans. ' +
          'none = nothing follows from leaving it, which is a real answer and the one that makes a list ' +
          'shorter honestly. Leaving the whole `consequence` out is different from writing "none": one is a ' +
          'gap and the other is a judgement somebody made.',
        example: 'person',
      },
      {
        key: 'what',
        type: 'string',
        required: true,
        description:
          'What actually goes wrong, in one sentence and in your own words. It is shown on the row, so it is ' +
          'the sentence that decides whether anybody reads further. Write the outcome, not the category.',
        example: 'The rig keeps moving after the stop button is pressed, and somebody stands next to it during transplant trials.',
      },
    ],
  },

  Pause: {
    name: 'Pause',
    description:
      'A deliberate postponement: when it was put down, why, and what should bring it back. A paused record ' +
      'has not stopped short — it is waiting on purpose — and that difference is the whole reason this exists.',
    fields: [
      {
        key: 'since',
        type: 'date',
        required: true,
        description:
          'When it was put down, as "2026-08-01" or "2026-08-01 09:30". This is what makes an old pause ' +
          'visible as an old one, which a bare flag cannot do.',
        example: '2026-08-01',
      },
      {
        key: 'why',
        type: 'string',
        required: true,
        description:
          'Why it was put down, in your own words. REQUIRED, and it is the field that makes a pause a pause: ' +
          'one with no reason is indistinguishable from abandonment a month later, so a reader who finds it ' +
          'cannot tell whether to pick the work back up or write it off.',
        example: 'The force gauge went back to the metrology lab, so nothing can be measured until the replacement arrives.',
      },
      {
        key: 'until',
        type: 'PauseUntil',
        required: false,
        description:
          'What should end the pause: a date, a condition in words, or the record whose finishing resumes it. ' +
          'Leave it out entirely when there is no idea when — that is honest and common, and the pause is then ' +
          'reported as open-ended rather than as though it were still waiting on something. Written at all, it ' +
          'has to say at least one of the three.',
        example: { condition: 'the replacement 50 N gauge is on the bench' },
      },
    ],
  },

  PauseUntil: {
    name: 'PauseUntil',
    description:
      'What should bring a paused record back. Write whichever of the three you actually know; `recordId` is ' +
      'the one Mole Office can check for itself, so prefer it where there is one. THE SAME SHAPE IS WHAT AN ' +
      '`obligation` PUTS IN `due` when it comes due on something other than a date — "what has to happen before ' +
      'this matters again" is one idea, and one shape for it beats two that would drift. The name is where the ' +
      'shape started rather than a limit on where it is used. On an obligation, note that only the `date` form ' +
      'can ever make it overdue.',
    fields: [
      {
        key: 'date',
        type: 'date',
        required: false,
        description: 'The pause ends on this date, as "2026-09-01" or "2026-09-01 09:00". A stamp, so it can be checked.',
        example: '2026-09-01',
      },
      {
        key: 'condition',
        type: 'string',
        required: false,
        description:
          'What has to become true, in words, when it is not something Mole Office can check. It is read by a ' +
          'person and never evaluated, so write it as a thing somebody could look at and answer yes or no.',
        example: 'the replacement 50 N gauge is on the bench',
      },
      {
        key: 'recordId',
        type: 'string',
        required: false,
        description:
          'The id of the record whose finishing should end this pause. Checkable, and therefore preferred over ' +
          'the same sentence written as a condition.',
        example: 'rec_01J9ZQ8N6R7T2X4V',
      },
    ],
    rules: [
      '`until` must say at least one of `date`, `condition` or `recordId`. An empty object is refused: it stores nothing ' +
        'anybody can read and makes an open-ended pause look like one that is waiting on something. Leave `until` out instead.',
    ],
  },

  BundleExporter: {
    name: 'BundleExporter',
    description: 'Who produced an export. The attribution every write in this product already carries.',
    fields: [
      { key: 'actorType', type: "'human' | 'agent' | 'system'", required: true, description: 'Which kind of writer.', example: 'human' },
      { key: 'actorId', type: 'string', required: true, description: 'Which one.', example: 'owner' },
    ],
  },
}
