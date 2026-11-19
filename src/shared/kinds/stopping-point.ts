// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `stopping_point`, where a piece of work stopped.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { commonFields, type KindSpec, type ShapeSpec } from './kind-common.ts'

export const stoppingPointKind: KindSpec = {
    kind: 'stopping_point',
    purpose:
      'WHERE A STRETCH OF WORK STOPPED, written so the next stretch can pick it up: what was being done, what the ' +
      'next safe action is, and what changed, is unfinished, failed or was learned on the way.',
    whenToRecord:
      'When a stretch of work stops — at the end of a session, before a long wait, or at any point where somebody ' +
      'else would have to reconstruct where things stand. Link it to the task, problem, pipeline, module or block ' +
      'it is about with an `about` link; one with no such link is about the project.',
    humanOnly: false,
    fields: [
      {
        key: 'doing',
        type: 'string',
        required: true,
        description: 'What this stretch of work was trying to do. One or two plain sentences.',
        example: 'Moving the dispatch lifecycle onto one column so a comment cannot read sent on one screen and queued on another.',
      },
      {
        key: 'next',
        type: 'string',
        required: true,
        description:
          'THE NEXT SAFE ACTION, in one sentence. Safe means it can be done without re-reading everything first. ' +
          'If the next action is blocked by a fork somebody has to settle, say so here AND write the `blocks` ' +
          'link from that proposal, because a sentence is not a record and nothing can read one.',
        example: 'Run the two-process durability proof against a copy of the corpus before touching the routes.',
      },
      { key: 'changed', type: 'string', required: false, description: 'What actually changed. Leave it out when nothing did.', example: 'agent_messages.state now carries six words instead of three.' },
      { key: 'remains', type: 'string', required: false, description: 'What is unfinished, and would otherwise have to be rediscovered.', example: 'The continuation envelope and the agent page are not built.' },
      { key: 'failed', type: 'string', required: false, description: 'What failed, and what was tried. An empty field is not the same as nothing having failed.', example: 'The first source scan went green under an aliased update, so the scan alone is not the guard.' },
      { key: 'learned', type: 'string', required: false, description: 'What was learned that the next stretch would otherwise have to learn again.', example: 'A runtime wrapper only fires on a line the control run actually executes.' },
      { key: 'drifted', type: 'string', required: false, description: 'How the plan changed and why. Leave it out when it did not.', example: 'Step 4 moved earlier: the gates cannot be re-pointed until the composer stores which comment a message carried.' },
      {
        key: 'stoppedAtRevision',
        type: 'string',
        required: false,
        description:
          'A CODE REVISION MARKER THE WRITER CHOSE — a commit, a tag, "R42". Mole Office stores it and never resolves ' +
          'it: it is a revision of somebody\'s source, and `revisions` in this product is the ledger of record ' +
          'versions, which is a different thing wearing the same word.',
        example: '593353e',
      },
      {
        key: 'stoppedAtEntries',
        type: 'SourceEntry[]',
        required: false,
        description: 'Where in the source work stopped. Printed, never verified — see the SourceEntry shape.',
        example: [{ repository: 'mole-office', path: 'src/server/lib/dispatch.ts', line: 412 }],
      },
      {
        key: 'stoppedAtRecord',
        type: 'string',
        required: false,
        description:
          'ONE RECORD ID — the task, problem or block work stopped inside. Resolved when this record is read, and ' +
          'reported gone rather than quietly dropped.',
        example: 'Hz2z2c8gCUmk',
      },
      {
        key: 'stoppedAtStep',
        type: 'string',
        required: false,
        description: 'A step in somebody\'s plan, in one plain sentence. A step genuinely is prose, so it stays prose.',
        example: 'Step 5 of wave 3 — sendMessages, before the routes.',
      },
      ...commonFields('stopping_point'),
    ],
    rules: [
      'what this stopping point is about is a LINK and never a field: POST /api/links ' +
        '{"fromId":"<this stopping point>","toId":"<the task or problem>","type":"about"}. One with no such link ' +
        'is about the project.',
      'when the next action is blocked by a fork nobody has settled, write the `blocks` link from that proposal ' +
        'to this stopping point. The sentence in `next` is what a person reads; the link is what a reader can act ' +
        'on, and an owner\'s fork must never be handed to an agent as its next task through free text.',
    ],
    example: {
      doing: 'Moving the dispatch lifecycle onto one column.',
      next: 'Run the two-process durability proof against a copy of the corpus.',
      changed: 'agent_messages.state now carries six words instead of three.',
      remains: 'The continuation envelope and the agent page are not built.',
      stoppedAtRevision: '593353e',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const STOPPING_POINT_SHAPES: Record<string, ShapeSpec> = {
  SourceEntry: {
    name: 'SourceEntry',
    description:
      'A PLACE IN SOMEBODY ELSE\'S SOURCE: a repository name and a path inside it, and optionally a line. Mole Office ' +
      'PRINTS IT AND NEVER VERIFIES IT. A file is not a record, so there is nothing here to link to and nothing ' +
      'here goes stale silently — it is what the writer said, kept as they said it.',
    fields: [
      {
        key: 'repository',
        type: 'string',
        required: true,
        description: 'What the writer calls the repository. Not checked against anything.',
        example: 'mole-office',
      },
      {
        key: 'path',
        type: 'string',
        required: true,
        description: 'The path inside it, as the writer wrote it. Not checked against anything.',
        example: 'src/server/lib/dispatch.ts',
      },
      {
        key: 'line',
        type: 'number',
        required: false,
        description: 'Which line, when the writer named one. Leave it out when the file is the whole answer.',
        example: 412,
      },
    ],
  },

}
