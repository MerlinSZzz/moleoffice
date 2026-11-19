// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `incident`, several defects acting together that caused a loss.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `INCIDENT_STATES` FROM ../incident.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
// THE FIVE WORDS AN INCIDENT'S OWN STATE MOVES THROUGH, criteria I1 and I2. One list, read here and
// by the server's close door, so the two cannot come to accept different words.
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { INCIDENT_STATES } from '../incident.ts'

export const incidentKind: KindSpec = {
    kind: 'incident',
    purpose:
      'Several defects acting together caused a large loss. Not a bigger problem: the scene reconstructed — ' +
      'what happened and when, the loss in the person\'s own words, expected against actual, the causes, responsibility ' +
      'weighed for the person, the agents and the office each with its uncertainty, the corrective actions, and ' +
      'whether the fix has been verified to hold.',
    whenToRecord:
      'When several defects acting together, not one thing wrong, produced a loss worth reconstructing — the ' +
      'kind of thing that would otherwise be scattered across a report, a handful of problems and a decision ' +
      'with nothing joining them into one account. Filed by a secretary or the person, never by any other ' +
      'agent: `checkWhoMayFileAnIncident` in src/server/lib/records/who-files-an-incident.ts refuses the create and refuses a kind ' +
      'change into `incident` alike. A worker that finds one prepares it — the evidence, the timeline moments, ' +
      'the fields it can honestly support — and asks a secretary or the person to file it.',
    humanOnly: false,
    fields: [
      {
        key: 'happened_at',
        type: 'IncidentSpan',
        required: true,
        description: 'A span: when it started and, where known, when it ended.',
        example: { from: '2026-09-09 14:02', to: '2026-09-09 16:40' },
      },
      {
        key: 'where',
        type: 'IncidentWhere',
        required: true,
        description: 'Where it happened: the project, the experiment or module, the machine.',
        example: { project: 'greenhouse', experimentOrModule: 'the fresh-activation check', machine: 'the bench transfer arm' },
      },
      {
        key: 'loss',
        type: 'string',
        required: true,
        description:
          'What was lost, in the words of the person where they said them. Quote them rather than summarise: a ' +
          'paraphrase of a loss is a second, weaker account standing beside their own. REQUIRED AT THE DOOR, not ' +
          'only for completeness: `checkTheIncidentHasLossAndTimeline` refuses a create with none.',
        example: 'Two near-misses: the arm moved at full speed with the operator believing the limit still held.',
      },
      {
        key: 'timeline',
        type: 'IncidentMoment[]',
        required: true,
        description:
          'What happened, in order, each moment with the record that is its evidence. REQUIRED AT THE DOOR: a ' +
          'create with none is refused by name. Written only through ' +
          'POST /api/records/:id/timeline, never by a record patch — `checkTheIncidentTimeline` refuses a ' +
          'direct write so every moment keeps the id, the door stamps and the evidence check that route gives ' +
          'it. Every agent may append one.',
        example: [
          {
            id: 'm-1',
            at: '2026-09-09 14:02',
            who: 'the operator',
            what: 'Re-armed the controller after a pause, believing the reduced speed limit from the prior session still held.',
            evidence: 'ax4NiWDsToFp',
          },
        ],
      },
      {
        key: 'expected',
        type: 'string',
        required: true,
        description: 'What was expected to happen.',
        example: 'The reduced speed limit carries across a pause and a resume.',
      },
      {
        key: 'actual',
        type: 'string',
        required: true,
        description: 'What actually happened.',
        example: 'The speed limit only latches on a fresh activation. A resume after a pause is not fresh, and the limit was lost.',
      },
      {
        key: 'direct_causes',
        type: 'IncidentCause[]',
        required: false,
        description: 'The direct causes, each one sentence, linked to the problem it is where one exists as its own record.',
        example: [{ id: 'c-1', text: 'The speed limit only latches on a fresh activation.', problemId: '2z7PiQtGZv92' }],
      },
      {
        key: 'contributing_factors',
        type: 'IncidentCause[]',
        required: false,
        description: 'What made it worse or made it more likely, without being the direct cause. Same shape as `direct_causes`.',
        example: [{ id: 'f-1', text: 'No check read the latched speed limit back before a resume.' }],
      },
      {
        key: 'responsibility',
        type: 'IncidentResponsibility',
        required: false,
        description:
          'Three sentences, each with its uncertainty: the person, the agents by handle, the office. Changing ' +
          'this once it is written is the secretary’s or the person’s, enforced by ' +
          '`checkTheIncidentResponsibility` on the patch path.',
        example: {
          person: { sentence: 'Approved the fresh-activation design without asking whether a resume was covered.', uncertainty: 'their own words, where they gave them' },
          agents: { sentence: 'No agent built or reviewed the controller session code that this incident found wrong.', uncertainty: 'measured against the commit history', handles: [] },
          office: { sentence: 'Nothing in the office re-read a latched safety limit before a resume.', uncertainty: 'measured: no such check existed' },
        },
      },
      {
        key: 'corrective_actions',
        type: 'IncidentCorrectiveAction[]',
        required: false,
        description:
          'Each linked to the decision, the problem or the criterion it became. Its own state (decided, built, ' +
          'verified) is read from the record it names, never stored here.',
        example: [{ id: 'ca-1', text: 'Latch the speed limit fresh on every resume, not only on first activation.', becameRecordId: '2z7PiQtGZv92', becameRecordKind: 'problem' }],
      },
      {
        key: 'verification',
        type: 'IncidentVerification',
        required: false,
        description: 'How the fix will be shown to hold, and whether it has been.',
        example: { how: 'Pause and resume a controller session and read the speed limit before the first move.', verified: true },
      },
      {
        key: 'state',
        type: unionOf(INCIDENT_STATES),
        required: true,
        description:
          'Where it has got to. Moves only by a deliberate write — never automatically because a linked problem ' +
          'went `fixed` — and closing is its own door: POST /api/records/:id/close-incident.',
        example: 'open',
      },
      {
        key: 'found_by',
        type: 'string',
        required: false,
        description: 'How it came to light — a test, a page, a person, a run.',
        example: 'the operator, during the bench session',
      },
      {
        key: 'closedWith',
        type: 'IncidentClosedWith',
        required: false,
        description:
          'Present once closed: the one line saying the corrective decisions are done, who, and when. Written ' +
          'only through POST /api/records/:id/close-incident. Nothing in the office is gated on ' +
          '`state`, so this field\'s only effect is the record of the closing itself.',
        example: { note: 'Every linked corrective decision is done and the fresh-activation check is verified.', by: 'owner', at: '2026-09-20 10:00:00' },
      },
      ...commonFields('incident'),
    ],
    rules: [
      'filed by a secretary or the person. Every other agent is refused, on the create path and on a kind ' +
        'change into `incident` alike.',
      'a create with no `loss` or no `timeline` is refused by name, before anything is written.',
      '`timeline` is written only through POST /api/records/:id/timeline. Every agent may append a moment; ' +
        'nobody may rewrite one through an ordinary patch.',
      '`responsibility` is written at filing and changed afterwards only by a secretary or the person.',
      'a problem linked `about` this incident going `fixed` changes nothing here but the line naming that ' +
        'problem, which now reads fixed. This incident’s own `state` moves only by its own deliberate write.',
      'closed only through POST /api/records/:id/close-incident, by a secretary or the person, carrying the ' +
        'one line that says the corrective decisions are done. Nothing in the office is gated on `state`.',
      'a corrective action’s state (decided, built, verified) is read from the record it names and is never ' +
        'stored on the incident.',
    ],
    example: {
      happened_at: { from: '2026-09-09 14:02', to: '2026-09-09 16:40' },
      where: { project: 'greenhouse', experimentOrModule: 'the fresh-activation check', machine: 'the bench transfer arm' },
      loss: 'Two near-misses: the arm moved at full speed with the operator believing the limit still held.',
      timeline: [
        {
          id: 'm-1',
          at: '2026-09-09 14:02',
          who: 'the operator',
          what: 'Re-armed the controller after a pause, believing the reduced speed limit from the prior session still held.',
          evidence: 'ax4NiWDsToFp',
        },
      ],
      expected: 'The reduced speed limit carries across a pause and a resume.',
      actual: 'The speed limit only latches on a fresh activation. A resume after a pause is not fresh, and the limit was lost.',
      direct_causes: [{ id: 'c-1', text: 'The speed limit only latches on a fresh activation.', problemId: '2z7PiQtGZv92' }],
      state: 'corrected',
      found_by: 'the operator, during the bench session',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const INCIDENT_SHAPES: Record<string, ShapeSpec> = {
  // ------------------------------------------------------------------------------- incident shapes
  //
  // THE NAMED SHAPES `incident` DECLARES BELOW, criteria I1 to I7. Declared here, beside every other
  // named shape, and not inside the kind's own block, for the reason `TimelineItem` and `Span` are
  // declared here rather than inside the kind that first used them: `checkValue` resolves a field's
  // `type` string against THIS object regardless of which kind wrote the field, so a shape used by
  // more than one field — `IncidentResponsibilityPart` is used by two of `responsibility`'s three
  // parts — is written once.

  IncidentSpan: {
    name: 'IncidentSpan',
    description:
      'A span of time, from and to. NOT the Span shape above, which is a quoted passage’s position inside a ' +
      'block of text and shares these two field names by accident and nothing else.',
    fields: [
      { key: 'from', type: 'string', required: true, description: 'When it started, kept exactly as written and never parsed.', example: '2026-09-09 14:02' },
      { key: 'to', type: 'string', required: false, description: 'When it ended, kept exactly as written. Left out where that is not yet known — an incident still open may have no end.', example: '2026-09-09 16:40' },
    ],
  },

  IncidentWhere: {
    name: 'IncidentWhere',
    description: 'Where it happened: the project, the experiment or module, and the machine.',
    fields: [
      { key: 'project', type: 'string', required: true, description: 'The project this incident belongs to.', example: 'greenhouse' },
      { key: 'experimentOrModule', type: 'string', required: false, description: 'The experiment or module the incident is about, when it is about one.', example: 'the seedling grasp experiment' },
      { key: 'machine', type: 'string', required: false, description: 'The machine it happened on, when it happened on one in particular.', example: 'the bench transfer arm' },
    ],
  },

  IncidentMoment: {
    name: 'IncidentMoment',
    description:
      'One moment on the timeline: a time, who or what, what happened, and the record that is the evidence. ' +
      'Written only through POST /api/records/:id/timeline, never by hand through a record ' +
      'patch, which `checkTheIncidentTimeline` in server/lib/records.ts refuses.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this incident. What an evidence press addresses.', example: 'm-fifth-start' },
      {
        key: 'at',
        type: 'string',
        required: true,
        description:
          'When it happened, kept exactly as written and never parsed into a date. The order of the moments is ' +
          'the order they were appended in — nothing sorts by this text.',
        example: '09:12, five minutes before the first start',
      },
      { key: 'who', type: 'string', required: true, description: 'Who or what did it: a name, an agent’s handle, or a mechanism. The subject of `what`, not who is typing this moment in.', example: 'the speed controller' },
      { key: 'what', type: 'string', required: true, description: 'What happened.', example: 'Sent a fresh-activation command with the old speed limit still latched.' },
      { key: 'evidence', type: 'string', required: true, description: 'The id of the record that is the evidence for this moment.', example: 'ax4NiWDsToFp' },
    ],
  },

  IncidentCause: {
    name: 'IncidentCause',
    description:
      'A direct cause or a contributing factor: one sentence, linked to the problem it is where one exists as ' +
      'its own record. One shape for both `direct_causes` and `contributing_factors` — the two lists differ ' +
      'only in which one a cause is placed on.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this incident.', example: 'c-stale-latch' },
      { key: 'text', type: 'string', required: true, description: 'The cause, as one sentence.', example: 'The speed limit only latches on a fresh activation, and the session was not fresh.' },
      { key: 'problemId', type: 'string', required: false, description: 'The problem this cause is, when one exists as its own record. Left out where none does.', example: '2z7PiQtGZv92' },
    ],
  },

  IncidentResponsibilityPart: {
    name: 'IncidentResponsibilityPart',
    description: 'A sentence weighing responsibility, with its uncertainty beside it in words.',
    fields: [
      { key: 'sentence', type: 'string', required: true, description: 'The sentence itself.', example: 'The office had nothing that stopped a design of this size before it was built.' },
      { key: 'uncertainty', type: 'string', required: true, description: 'How sure this sentence is, in words — not a number invariant 8 gives no warrant for.', example: 'measured: no gate existed to check against' },
    ],
  },

  IncidentAgentsResponsibilityPart: {
    name: 'IncidentAgentsResponsibilityPart',
    description: 'The agents’ share of responsibility: the sentence, its uncertainty, and who by handle.',
    fields: [
      { key: 'sentence', type: 'string', required: true, description: 'The sentence itself.', example: 'secretary-1 read the size of the design and approved it anyway.' },
      { key: 'uncertainty', type: 'string', required: true, description: 'How sure this sentence is, in words.', example: 'measured: the approval record carries the time and the size read' },
      { key: 'handles', type: 'string[]', required: true, description: 'The agents this sentence is about, by handle. Empty where no agent bears any part of it.', example: ['secretary-1'] },
    ],
  },

  IncidentResponsibility: {
    name: 'IncidentResponsibility',
    description:
      'Responsibility, in three parts: the person, the agents by handle, the office. Changing this is the ' +
      'secretary’s or the person’s and nobody else’s, enforced by ' +
      '`checkTheIncidentResponsibility` on the patch path.',
    fields: [
      { key: 'person', type: 'IncidentResponsibilityPart', required: true, description: 'The person’s own share, in their words where they gave them.', example: { sentence: 'I approved the plan without asking how big it was.', uncertainty: 'their own words, 11 September 2026' } },
      { key: 'agents', type: 'IncidentAgentsResponsibilityPart', required: true, description: 'The agents’ share, by handle.', example: { sentence: 'secretary-1 approved the design as drafts without reading its size against real incidents.', uncertainty: 'measured against the approval record of 8 September 14:50', handles: ['secretary-1'] } },
      { key: 'office', type: 'IncidentResponsibilityPart', required: true, description: 'The office’s own share: what nothing stopped.', example: { sentence: 'Nothing in the office stopped a design of this size before it was built.', uncertainty: 'measured: no design-and-criticism gate existed yet' } },
    ],
  },

  IncidentCorrectiveAction: {
    name: 'IncidentCorrectiveAction',
    description:
      'One corrective action: what it is, and the decision, the problem or the criterion it became. Its own ' +
      '"state" (decided, built, verified) is never stored here; the page reads it off the ' +
      'record this names.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'Unique within this incident.', example: 'ca-withdraw-the-grant-contract' },
      { key: 'text', type: 'string', required: true, description: 'What the corrective action is, as one sentence.', example: 'Withdraw the grant contract, the budget ladder and the step log.' },
      { key: 'becameRecordId', type: 'string', required: false, description: 'The record it became, when it became a decision or a problem. Sent together with `becameRecordKind`.', example: 'b51b32c6' },
      { key: 'becameRecordKind', type: unionOf(['decision', 'problem']), required: false, description: 'Which of the two `becameRecordId` names. Present exactly when `becameRecordId` is.', example: 'decision' },
      { key: 'becameCriterion', type: 'string', required: false, description: 'The criterion it became — e.g. "I6" — when it became one of those instead of a record. A criterion is a line in a design document, not a record, so there is nothing to link.', example: 'I6' },
    ],
  },

  IncidentVerification: {
    name: 'IncidentVerification',
    description: 'How the fix will be shown to hold, and whether it has been.',
    fields: [
      { key: 'how', type: 'string', required: true, description: 'How the fix will be shown to hold: the check, the measurement, the test.', example: 'Run the fresh-activation session again and read the speed limit before the first start.' },
      { key: 'verified', type: 'boolean', required: true, description: 'Whether it has been verified yet.', example: false },
    ],
  },

  IncidentClosedWith: {
    name: 'IncidentClosedWith',
    description:
      'What the closing door writes: one line saying the incident is closed. Written only through ' +
      'POST /api/records/:id/close-incident.',
    fields: [
      { key: 'note', type: 'string', required: true, description: 'The one line saying the corrective decisions are done.', example: 'Every linked corrective decision is done and the fresh-activation check is verified.' },
      { key: 'by', type: 'string', required: true, description: 'Who closed it: the person, or the secretary’s handle.', example: 'owner' },
      { key: 'at', type: 'string', required: true, description: 'When it was closed.', example: '2026-09-20 10:00:00' },
    ],
  },

}
