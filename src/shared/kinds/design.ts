// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `design`, the candidates for one piece of method work and the one chosen.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { commonFields, type KindSpec, type ShapeSpec } from './kind-common.ts'
export const designKind: KindSpec = {
    kind: 'design',
    purpose:
      'THE CANDIDATES FOR ONE PIECE OF METHOD WORK, AND THE ONE CHOSEN: what it is for and who asked for it, how many ' +
      'candidates were asked for and why, the candidates and the table that judges them, the pilot, the sources, the ' +
      'thresholds it sets and where their numbers come from, the evidence accounts, and the questions still open. Its ' +
      'reviews are design reviews, each tied to one revision of it.',
    whenToRecord:
      'Before method work starts, when the work asks for a choice between ways of doing it. File it with ' +
      'POST /api/records, kind "design", and ask the agent it answers to for a review with ' +
      'POST /api/designs/<id>/reviews.',
    humanOnly: false,
    fields: [
      { key: 'purpose', type: 'string', required: true, description: 'WHAT THE WORK IS FOR, in a sentence or two.', example: 'Teach the arm to pick up cups and cloths.' },
      {
        key: 'assignedBy',
        type: 'ParticipantRef',
        required: true,
        description:
          'WHO ASKED FOR THE DESIGN: the person or the agent, as a registry reference, kind "person" or "agent" and its ' +
          'registry id, never a handle. Its review counts from the agent this one answers to, or from the person.',
        example: { kind: 'agent', id: 'Ag1e2n3t4i5d' },
      },
      { key: 'candidatesAsked', type: 'number', required: true, description: 'HOW MANY CANDIDATES WERE ASKED FOR.', example: 3 },
      { key: 'candidatesWhy', type: 'string', required: true, description: 'WHY THAT MANY CANDIDATES WERE ASKED FOR.', example: 'Three ways are known, and each fails differently.' },
      { key: 'candidates', type: 'DesignCandidate[]', required: true, description: 'THE CANDIDATES, each with its name and what it is.', example: [{ name: 'A', summary: 'Learn the grasp from forty demonstrations.' }] },
      { key: 'chosen', type: 'string', required: false, description: 'THE NAME OF THE CANDIDATE CHOSEN. Absent while nothing is chosen.', example: 'A' },
      {
        key: 'evaluation',
        type: 'DesignEvaluation[]',
        required: true,
        description: 'THE EVALUATION TABLE: one row for each candidate, judged in words on feasibility, novelty, difficulty, risk and fit.',
        example: [{ candidate: 'A', feasibility: 'Yes: the arm and the camera are here.', novelty: 'Little: it follows the 2025 paper.', difficulty: 'Two weeks of work.', risk: 'Forty demonstrations may be too few.', fit: 'Good for the cups, poor for the cloths.' }],
      },
      { key: 'pilot', type: 'string', required: true, description: 'THE PILOT: the small first run that tests the chosen candidate, and what it would show.', example: 'Ten grasps of one cup, filmed.' },
      { key: 'sources', type: 'string[]', required: true, description: 'THE SOURCES the design draws on: papers, records and measurements, one each.', example: ['The 2025 grasp benchmark.'] },
      { key: 'thresholds', type: 'DesignThreshold[]', required: false, description: 'THE NEW THRESHOLDS OR GATES IT SETS, each with where its number comes from. Absent means it sets none.', example: [{ what: 'A grasp passes at 8 successes in 10 trials.', source: 'The 2025 grasp benchmark, table 3.' }] },
      { key: 'evidence', type: 'DesignEvidence[]', required: false, description: 'THE EVIDENCE ACCOUNTS, each named the way a rule asks for it, with the record that holds it. Absent means nobody named one.', example: [{ name: 'grasp_trials', record: 'Ev1i2d3e4n5c', shows: 'Ten trials of each candidate on the cups.' }] },
      { key: 'openQuestions', type: 'string[]', required: false, description: 'THE QUESTIONS STILL OPEN, one each. Absent means nobody wrote one.', example: ['Do cloths need a second camera?'] },
      ...commonFields('design'),
    ],
    rules: [
      'Who asked for it is named by kind and registry id, never by a handle.',
      "A review counts from the agent the design's asker answers to, or from the person, and only for the revision it names.",
    ],
    example: {
      purpose: 'Teach the arm to pick up cups and cloths.',
      assignedBy: { kind: 'agent', id: 'Ag1e2n3t4i5d' },
      candidatesAsked: 3,
      candidatesWhy: 'Three ways are known, and each fails differently.',
      candidates: [{ name: 'A', summary: 'Learn the grasp from forty demonstrations.' }],
      chosen: 'A',
      evaluation: [{ candidate: 'A', feasibility: 'Yes: the arm and the camera are here.', novelty: 'Little: it follows the 2025 paper.', difficulty: 'Two weeks of work.', risk: 'Forty demonstrations may be too few.', fit: 'Good for the cups, poor for the cloths.' }],
      pilot: 'Ten grasps of one cup, filmed.',
      sources: ['The 2025 grasp benchmark.'],
      thresholds: [{ what: 'A grasp passes at 8 successes in 10 trials.', source: 'The 2025 grasp benchmark, table 3.' }],
      evidence: [{ name: 'grasp_trials', record: 'Ev1i2d3e4n5c', shows: 'Ten trials of each candidate on the cups.' }],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const DESIGN_SHAPES: Record<string, ShapeSpec> = {
  // A DESIGN'S CANDIDATES, ITS EVALUATION TABLE, ITS THRESHOLDS AND ITS EVIDENCE (the design-first build).
  DesignCandidate: {
    name: 'DesignCandidate',
    description: 'ONE CANDIDATE A DESIGN COMPARED: its name and what it is.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'A short name, unique within the design.', example: 'A' },
      { key: 'summary', type: 'string', required: true, description: 'What the candidate is, in a sentence or two.', example: 'Learn the grasp from forty demonstrations.' },
    ],
  },

  DesignEvaluation: {
    name: 'DesignEvaluation',
    description: 'ONE ROW OF A DESIGN\'S EVALUATION TABLE: one candidate, judged in words on five questions.',
    fields: [
      { key: 'candidate', type: 'string', required: true, description: 'The name of the candidate this row judges.', example: 'A' },
      { key: 'feasibility', type: 'string', required: true, description: 'Whether it can be built with what there is.', example: 'Yes: the arm and the camera are here.' },
      { key: 'novelty', type: 'string', required: true, description: 'What is new in it.', example: 'Little: it follows the 2025 paper.' },
      { key: 'difficulty', type: 'string', required: true, description: 'How hard it is to build.', example: 'Two weeks of work.' },
      { key: 'risk', type: 'string', required: true, description: 'What could go wrong.', example: 'Forty demonstrations may be too few.' },
      { key: 'fit', type: 'string', required: true, description: 'How well it answers the purpose.', example: 'Good for the cups, poor for the cloths.' },
    ],
  },

  DesignThreshold: {
    name: 'DesignThreshold',
    description: 'ONE NEW THRESHOLD OR GATE A DESIGN SETS, and where its number comes from.',
    fields: [
      { key: 'what', type: 'string', required: true, description: 'The threshold or gate and its number.', example: 'A grasp passes at 8 successes in 10 trials.' },
      { key: 'source', type: 'string', required: false, description: 'Where the number comes from: a paper, a measurement, or a record id. Absent means the design names no source, which the threshold check reminds of.', example: 'The 2025 grasp benchmark, table 3.' },
    ],
  },

  DesignEvidence: {
    name: 'DesignEvidence',
    description: 'ONE EVIDENCE ACCOUNT A DESIGN NAMES: its name, the record that holds it, and what it shows.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'The account\'s name, as a rule asks for it: lower-case letters, digits and underscores.', example: 'grasp_trials' },
      { key: 'record', type: 'string', required: true, description: 'The id of the record that holds the account. A record the office cannot read counts as missing, and is named.', example: 'Ev1i2d3e4n5c' },
      { key: 'shows', type: 'string', required: false, description: 'What the account shows, in a sentence.', example: 'Ten trials of each candidate on the cups.' },
    ],
  },

}
