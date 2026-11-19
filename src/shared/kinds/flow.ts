// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `flow`, the procedure the office runs as itself.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, `FLOW_RUNNERS` FROM ../flow.ts, `FLOW_ENDING_EVENTS` FROM ../flow-run.ts, AND
 * `FLOW_SCOPES` FROM ../flow-applies-to.ts AND `RETIRED_WHY_MOST` FROM ../flow-retired.ts. IT
 * IMPORTS NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND; `FLOW_SHAPES` holds the
 * shapes moved out of ../kinds.ts, with their comments and text unchanged.
 */
// THE WORDS FOR WHO RUNS A FLOW. Proposal 1LaCQBRYRjls option A; ./flow.ts is the only place they
// live, and this declaration reads them rather than repeating them.
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { FLOW_RUNNERS } from '../flow.ts'
import { FLOW_ENDING_EVENTS } from '../flow-run.ts'
import { FLOW_SCOPES } from '../flow-applies-to.ts'
import { RETIRED_WHY_MOST } from '../flow-retired.ts'
export const flowKind: KindSpec = {
    kind: 'flow',
    purpose:
      'ONE OFFICE FLOW AS ONE RECORD: what actually happens when the office does something again and again. ' +
      'It says the flow\'s name, where it is declared, who runs it, what it leaves behind, and whether code governs ' +
      'it — so the three-day inventory reads the office instead of re-reading the repository, and so a flow ' +
      'written nowhere today ("only in a person\'s head") is written somewhere at last. A flow is NOT a task and ' +
      'not a pipeline: a task is the work of one piece, a pipeline is structure the project builds, and a flow ' +
      'is the procedure the office runs as itself.',
    whenToRecord:
      'When a procedure turns out to be one nobody has written down, or one declared in a file whose words have ' +
      'drifted from what actually happens. Read the flow against reality and write what happens NOW, with ' +
      '`reviewed_at` as the date of that reading; retune it whenever the next look finds it changed. Filing one ' +
      'blocks nothing and the office checks no work against it. Each step must say its reason, so the ' +
      'record itself is checked in three ways: a step added or changed must say `why` and name its `sources`, and ' +
      'such a write adds an entry naming its `cause` to `step_changes`. A step nobody has touched is not refused.',
    humanOnly: false,
    fields: [
      {
        key: 'declared_in',
        type: 'string',
        required: true,
        description:
          'WHERE THE FLOW IS WRITTEN TODAY: a file path, a tool, a card, or the plain sentence "only in a ' +
          'person\'s head". One place, so a drift between the words two documents keep about one flow shows ' +
          'itself. When the answer is that no document holds it, say exactly that — absence of a declaration is ' +
          'a finding, not shame.',
        example: 'design/flows/ACCEPTANCE.md line 91, and the secretary card',
      },
      {
        key: 'runs',
        type: 'string',
        required: true,
        description:
          'WHO RUNS THE FLOW, in words. The usual words are: ' +
          FLOW_RUNNERS.join(', ') +
          ' — and two of them at once are allowed, because "the secretary starts it and the supervisor runs it" is the ' +
          'truth about more than one flow. Written free rather than closed, because a vocabulary that refuses ' +
          'the honest sentence invites a coded one.',
        example: 'secretary',
      },
      {
        key: 'trigger',
        type: 'string',
        required: true,
        description:
          'WHAT STARTS THE FLOW, one sentence: the event, the hour, the press, or the message that begins it. ' +
          'Not the mechanism — when the answer is really "a hook fires at 07:00", write the sentence a reader ' +
          'acts on: that the office asks the workers for their nights.',
        example: 'Every time an agent session starts, the office asks the hook.',
      },
      {
        key: 'stages',
        type: 'FlowStep[]',
        required: true,
        description:
          'THE STEPS IN ORDER, each a FlowStep: what it does and what record or file proves it ran. Every step ' +
          'one may be seen to be true, and a step nobody can point at carries no evidence yet — which is a real ' +
          'state a reader can act on.',
        example: [
          {
            n: 1,
            does: 'The hook files the session record and prints its id.',
            evidence: 'a session record',
            why: 'Without the session record nobody can tell which run did the work, so a finished run looks like nobody\'s.',
          },
        ],
      },
      {
        key: 'leaves_behind',
        type: 'string',
        required: true,
        description:
          'WHAT THE FLOW LEAVES BEHIND: the record kinds it files, the files it writes, the merge it lands. What ' +
          'the inventory counts when it asks what the flow is for.',
        example: 'a merge commit, a report record, a handback',
      },
      {
        key: 'governed_by',
        type: 'string',
        required: false,
        description:
          'THE CODE THAT RUNS OR CHECKS THE FLOW: a path, a script, a hook. Leave the key out while NOTHING ' +
          'governs it — absence is the null the proposal wrote, and it is the answer the inventory reads to ask ' +
          '"is this flow words or a gate". An unenforced flow is a real state and is recorded as one; there is ' +
          'no gate on this kind to dress it up as enforced.',
        example: 'for-agents/hold-the-handle.mjs',
      },
      {
        key: 'ends_on',
        type: unionOf(FLOW_ENDING_EVENTS),
        required: false,
        description:
          'THE EVENT THAT ENDS THE FLOW FOR AN AGENT THAT ENTERED IT, one of: ' +
          FLOW_ENDING_EVENTS.join(', ') +
          '. When an agent enters the flow with POST /api/flows/<id>/enter, the office puts an item on its checklist, and ' +
          'ticks it itself when this event happens on the run that entered. Leave it out when nothing the office sees ends ' +
          'the flow: then the agent or the person ticks the item by hand.',
        example: 'the run is sealed',
      },
      {
        key: 'reviewed_at',
        type: 'date',
        required: false,
        description:
          'THE LAST TIME SOMEBODY READ THE RECORD AGAINST WHAT ACTUALLY HAPPENS, local wall clock. Leave it out ' +
          'until such a reader has happened — an undated flow has not been checked, and that must stay visible.',
        example: '2026-09-16',
      },
      {
        key: 'applies_to',
        type: 'FlowAppliesTo',
        required: false,
        description:
          'WHOM THE FLOW IS FOR, a FlowAppliesTo: general or special to one project, the role cards that follow it, and ' +
          'an optional rung. The Flows page stands a general flow under General, and `GET /api/flows?role=` reads it. ' +
          'Leave it out until somebody has read the flow and decided; an unclassified flow is counted as one.',
        example: { scope: 'general', roles: ['worker'], rung: 2 },
      },
      {
        key: 'retired',
        type: 'FlowRetired',
        required: false,
        description:
          'WHY THE FLOW IS NO LONGER FOLLOWED, when no other flow replaced it, a FlowRetired: why, the day, who retired ' +
          'it, and a record or a file and a line in its place. The Flows page folds it with the replaced flows and shows ' +
          '"Retired: <why>". Leave it out while the flow is followed; a flow another flow replaces needs a supersedes link instead.',
        example: { why: 'Holding a handle is not a flow; it became one line in a brief.', at: '2026-10-11', by: 'the secretary, on a proposal', file: 'briefs/COMMON.md', line: 12 },
      },
      {
        key: 'step_changes',
        type: 'FlowChange[]',
        required: false,
        description:
          'THE RECORD OF CHANGES TO THE STEPS, oldest first, each a FlowChange: when, what, why and the record that ' +
          'caused it. A write that adds, changes or removes a step adds one entry ' +
          'to the end in the same write; earlier entries stay as they are. Absent means no step has changed since ' +
          'the record was made. Second-level content: a reply hands it to an agent only when asked with ?secondLevel=show.',
        example: [{ at: '2026-10-08', what: 'Step 2 gained its reason.', why: 'Every step must say its reason.', cause: 'Madeup100002' }],
      },
      ...commonFields('flow'),
    ],
    example: {
      declared_in: 'only in a person\'s head until today',
      runs: 'the office itself',
      trigger: 'An agent session starts.',
      stages: [
        {
          n: 1,
          does: 'The hook files the session record and prints a line beginning MOLE OFFICE.',
          evidence: 'a session record filed by src/worker/session-hook.mjs',
          why: 'Without it a run starts with no record, so nobody can see that it ran or find the work it did.',
          sources: ['Madeup100002'],
        },
      ],
      leaves_behind: 'a session record and, through it, where the run landed',
      governed_by: 'src/worker/session-hook.mjs',
      reviewed_at: '2026-09-16',
      source: 'the steward\'s first inventory of the office flows',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const FLOW_SHAPES: Record<string, ShapeSpec> = {
  /**
   * ONE STEP OF ONE FLOW. Proposal 1LaCQBRYRjls option A.
   *
   * A flow's `stages` is a list of these. Each stage says what it does and what proves it ran —
   * evidence first, because a stage nobody can point at is a stage the office only believes. A SHAPE
   * AND NOT AN OPEN BAG, because all three keys are read: `n` puts the stages in order, `does` is
   * the stage itself, and `evidence` is where the steward reads that it happened. An `evidence`
   * named for a step that has not been observed yet is a real state — leave the key out rather
   * than inventing a path, and the reader reads absence as "nobody recorded this".
   */
  FlowStep: {
    name: 'FlowStep',
    description:
      'ONE STEP OF ONE OFFICE FLOW, with what it does and what record or file proves it ran. A flow\'s `stages` ' +
      'is a list of these. `n` orders the stages; `does` is the stage in one sentence. `evidence` is absent until ' +
      'somebody has seen the step run — absence is a real answer and means "nobody recorded this".',
    fields: [
      {
        key: 'n',
        type: 'number',
        required: true,
        description: 'Which step of the flow this is, counting from 1. Read back in this order.',
        example: 1,
      },
      {
        key: 'does',
        type: 'string',
        required: true,
        description:
          'What the step DOES, one sentence, in plain language. This is the step a reader follows, so it says the ' +
          'action, not the mechanism: what happens, to what, done by whom.',
        example: 'The hook files the session record and prints its id.',
      },
      {
        key: 'evidence',
        type: 'string',
        required: false,
        description:
          'WHAT PROVES THE STEP RAN: a record kind or id, a file path, a printed line. What the steward of the ' +
          'inventory reads to see it happened. Leave it out while nothing has been seen — absence means nobody ' +
          'has recorded it, and that is an honest answer.',
        example: 'a session record filed by src/worker/session-hook.mjs',
      },
      {
        key: 'why',
        type: 'string',
        required: false,
        description:
          'WHY THE STEP IS THERE, in one or two sentences: what goes wrong without it. ' +
          'A step added or changed since steps began to carry their reasons is refused without one; a step nobody has ' +
          'touched since may still lack it, and a reader is told the reason is not written yet. It is second-level ' +
          'content: a reply hands it to an agent only when asked with ?secondLevel=show.',
        example: 'Without the session record nobody can tell which run did the work, so a finished run looks like nobody\'s.',
      },
      {
        key: 'sources',
        type: 'string[]',
        required: false,
        description:
          'THE RECORDS THE STEP RESTS ON, by id: the person\'s decisions, an agent\'s explanation, a report that ' +
          'compared the choices. At least one on a step added or changed since steps began to carry their reasons, and each a ' +
          'record that is there. Second-level content, like `why`.',
        example: ['Madeup100002'],
      },
      {
        key: 'standing',
        type: 'boolean',
        required: false,
        description:
          'TRUE WHEN THE STEP IS A STANDING RULE: every round and every worker the flow applies to is given the ' +
          'step\'s words when it starts, read from the flow then, whatever its brief says. Left out, the step is not ' +
          'given to anyone.',
        example: true,
      },
    ],
  },

  /**
   * ONE CHANGE TO AN OFFICE FLOW'S STEPS. Each flow keeps a record of when its steps changed, what changed, why, and
   * which record caused it. A flow's `changes` is a list of these, oldest first, and a write
   * may only add to the end of it.
   */
  FlowChange: {
    name: 'FlowChange',
    description:
      'ONE CHANGE TO A FLOW\'S STEPS: when, what changed, why, and the record that caused it. A write that adds, ' +
      'changes or removes a step adds one of these to the end of `changes` in the same write, and is refused ' +
      'without it. Earlier entries are never changed or removed.',
    fields: [
      { key: 'at', type: 'date', required: true, description: 'When the change was made, local wall clock.', example: '2026-10-08' },
      {
        key: 'what',
        type: 'string',
        required: true,
        description: 'What changed, in one sentence: which step was added, changed or removed, and how.',
        example: 'Step 3 now waits for the check before the merge.',
      },
      {
        key: 'why',
        type: 'string',
        required: true,
        description: 'Why it changed, in one or two sentences.',
        example: 'Two merges landed unchecked work in one week.',
      },
      {
        key: 'cause',
        type: 'string',
        required: true,
        description:
          'THE RECORD THAT CAUSED THE CHANGE, by id: a decision, a problem, a report, a message. It must be a record ' +
          'that is there. A change with no cause is refused.',
        example: 'Madeup100002',
      },
    ],
  },

  /**
   * WHOM ONE OFFICE FLOW IS FOR, in fields the office can filter on. Wave 13p round 40, proposal Ink4403JeASI part 5,
   * gap 2. The server's check is `whyTheAppliesToIsUnreadable` in shared/flow-applies-to.ts.
   */
  FlowAppliesTo: {
    name: 'FlowAppliesTo',
    description:
      'WHOM A FLOW IS FOR: general to every project or special to one, the role cards whose holders follow it, and ' +
      'optionally a rung of the power tree from which every role follows it. A department is named by its project; ' +
      'the office has no department record.',
    fields: [
      {
        key: 'scope',
        // TEXT HERE, AND THE TWO WORDS ARE CHECKED BY `whyTheAppliesToIsUnreadable`, so a scope that is neither meets the
        // one coded refusal of whom a flow is for rather than the shape's uncoded one.
        type: 'string',
        required: true,
        description: `${FLOW_SCOPES.join(' or ')}. general: every project follows it, and the Flows page stands it under General. special: one project only.`,
        example: 'general',
      },
      {
        key: 'roles',
        type: 'string[]',
        required: true,
        description: 'THE ROLE CARDS WHOSE HOLDERS FOLLOW IT, by the card\'s name in src/config/roles.json. At least one, each once.',
        example: ['worker'],
      },
      {
        key: 'rung',
        type: 'number',
        required: false,
        description:
          'A RUNG OF THE POWER TREE. Every role at this rung or above follows the flow as well as the roles named. ' +
          'Leave it out when only the named roles follow it.',
        example: 2,
      },
      {
        key: 'project',
        type: 'string',
        required: false,
        description: 'THE PROJECT A SPECIAL FLOW IS FOR, by id. Required on a special flow and refused on a general one.',
        example: 'release',
      },
    ],
  },

  /**
   * A FLOW THAT IS RETIRED, NOT REPLACED: why, when, by whom, and what took its place. Wave 13p round 40b. The server's
   * check is `whyTheRetiredMarkIsUnreadable` in shared/flow-retired.ts.
   */
  FlowRetired: {
    name: 'FlowRetired',
    description:
      'WHY A FLOW IS NO LONGER FOLLOWED, when no other flow replaced it: why, the day, who retired it, and what took ' +
      'its place, either a record or a file and a line. The Flows page folds a retired flow with the replaced ones.',
    fields: [
      { key: 'why', type: 'string', required: true, description: `WHY THE FLOW IS NO LONGER FOLLOWED, in words, at most ${RETIRED_WHY_MOST} characters. The Flows page shows it as "Retired: <why>".`, example: 'Holding a handle is not a flow; it became one line in a brief.' },
      { key: 'at', type: 'date', required: true, description: 'THE DAY IT WAS RETIRED, YYYY-MM-DD.', example: '2026-10-11' },
      { key: 'by', type: 'string', required: true, description: 'WHO RETIRED IT, in words.', example: 'the secretary, on a proposal' },
      {
        key: 'record',
        type: 'string',
        required: false,
        description: 'WHAT TOOK ITS PLACE, as the id of a record the office has. Send this, or file and line, not both.',
        example: 'aBcDeFgHiJkL',
      },
      {
        key: 'file',
        type: 'string',
        required: false,
        description: 'WHAT TOOK ITS PLACE, as a file, with line. The office does not check that the file is there, because it may be outside the checkout.',
        example: 'briefs/COMMON.md',
      },
      { key: 'line', type: 'number', required: false, description: 'THE LINE OF file that took its place, 1 or more.', example: 12 },
    ],
  },
}
