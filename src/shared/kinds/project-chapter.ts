// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `project_chapter`, one project's own chapter of rules.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM ./kind-common.ts,
 * AND `PROJECT_RULE_CHECK_NAMES`, `PROJECT_RULE_EFFECTS` AND `PROJECT_RULE_TRIGGERS` FROM
 * ../project-rules.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
import { unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { PROJECT_RULE_CHECK_NAMES, PROJECT_RULE_EFFECTS, PROJECT_RULE_TRIGGERS } from '../project-rules.ts'
export const projectChapterKind: KindSpec = {
    kind: 'project_chapter',
    purpose:
      "ONE PROJECT'S OWN CHAPTER OF RULES: the rules this project keeps beside the office's general chapters. Each rule " +
      'names one check from a closed list and only reminds. It belongs to the project it is filed in, and the office-wide ' +
      'chapters never read it as one of theirs.',
    whenToRecord:
      'Never through POST /api/records: every write to this kind is refused there, the person\'s included. Read it with ' +
      'GET /api/office-regulations/projects/current/chapters, try a change with POST ' +
      '/api/office-regulations/projects/current/chapters/preview, and write one with POST ' +
      '/api/office-regulations/projects/current/chapters. Only the person or the project\'s own secretary writes it.',
    humanOnly: false,
    fields: [
      {
        key: 'rules',
        type: 'ProjectRule[]',
        required: true,
        description: 'The rules, in the order the project keeps them. An empty list is a chapter with no rule yet.',
        example: [
          {
            id: 'reviewed-design',
            heading: 'Method work starts from a reviewed design',
            text: 'A method run links a design its reviewer approved.',
            reason: 'Two pilots were started from a design nobody had read.',
            source: 'Dc1e2c3i4s5n',
            trigger: 'method-work',
            check: { name: 'reviewed-design-linked' },
            effect: 'remind',
            on: true,
            revision: 3,
          },
        ],
      },
    ],
    rules: [
      'Only its own doors write a project chapter. Every other create, change, kind change, delete, restore and move is refused, whoever asks.',
      "Only the person or the project's own secretary writes a rule or turns one on or off, and every write says why and keeps a revision.",
      'A rule names one check from the closed list and only reminds. A rule that would set a general rule aside, or that names a program, is refused.',
    ],
    example: {
      rules: [
        {
          id: 'reviewed-design',
          heading: 'Method work starts from a reviewed design',
          text: 'A method run links a design its reviewer approved.',
          reason: 'Two pilots were started from a design nobody had read.',
          source: 'Dc1e2c3i4s5n',
          trigger: 'method-work',
          check: { name: 'reviewed-design-linked' },
          effect: 'remind',
          on: true,
          revision: 3,
        },
      ],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const PROJECT_CHAPTER_SHAPES: Record<string, ShapeSpec> = {
  // ONE RULE OF A PROJECT'S OWN CHAPTER, and the check it names (the design-first build of wave 13s's requirements).
  // src/shared/project-rules.ts holds the closed lists and the one reader of a rule.
  ProjectRule: {
    name: 'ProjectRule',
    description:
      "ONE RULE OF A PROJECT'S OWN CHAPTER: its words, why it is there and the record it comes from, when it is asked, " +
      'the one check it names from the closed list, and its one effect, a reminder. Written only through ' +
      'POST /api/office-regulations/projects/current/chapters.',
    fields: [
      { key: 'id', type: 'string', required: true, description: 'A stable id, unique within the chapter, written by whoever writes the rule.', example: 'reviewed-design' },
      { key: 'heading', type: 'string', required: true, description: 'The rule in a few words.', example: 'Method work starts from a reviewed design' },
      { key: 'text', type: 'string', required: true, description: 'The rule in full, in plain words. It is stored as written and not read for its meaning.', example: 'A method run links a design its reviewer approved.' },
      { key: 'reason', type: 'string', required: true, description: 'Why the project keeps the rule.', example: 'Two pilots were started from a design nobody had read.' },
      { key: 'source', type: 'string', required: true, description: "The id of the record the rule comes from, such as the person's decision. A write naming no live record is refused.", example: 'Dc1e2c3i4s5n' },
      { key: 'trigger', type: unionOf(PROJECT_RULE_TRIGGERS), required: true, description: 'When the rule is asked: at method work, or at the go for a pilot.', example: 'method-work' },
      { key: 'check', type: 'ProjectRuleCheck', required: true, description: 'The one check the rule names, from the closed list. No project writes a check.', example: { name: 'reviewed-design-linked' } },
      { key: 'effect', type: unionOf(PROJECT_RULE_EFFECTS), required: true, description: 'What the rule does when its check is not met. A reminder is its only effect.', example: 'remind' },
      { key: 'on', type: 'boolean', required: true, description: 'Whether the rule is asked. A rule turned off answers "off" and reminds of nothing.', example: true },
      { key: 'revision', type: 'number', required: true, description: "The chapter's revision at which this rule last changed, written by the door and refused from a body.", example: 3 },
    ],
  },

  ProjectRuleCheck: {
    name: 'ProjectRuleCheck',
    description: 'THE CHECK ONE RULE NAMES: one of the closed list, and the evidence account it asks for where it asks for one.',
    fields: [
      { key: 'name', type: unionOf(PROJECT_RULE_CHECK_NAMES), required: true, description: 'Which check, from the closed list.', example: 'evidence-linked' },
      { key: 'evidence', type: 'string', required: false, description: 'With "evidence-linked" only: the name of the evidence account the design must name, in lower-case letters, digits and underscores.', example: 'grasp_trials' },
    ],
  },

}
