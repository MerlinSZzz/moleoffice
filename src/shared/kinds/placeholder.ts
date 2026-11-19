// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `placeholder`, a slot in the work that is deliberately unresolved.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE ALSO HOLDS `restrictionFields`, THE ONE HELPER `placeholder` AND `ran_instead` SHARE,
 * because a file that imported it from kinds.ts would make the central file and this one load each
 * other. `ran-instead.ts` imports it from here. THIS FILE IMPORTS `commonFields`, `unionOf`, THE
 * `FieldSpec` TYPE AND THE `KindSpec` TYPE FROM ./kind-common.ts, AND `RESTRICTION_SEVERITY` FROM
 * ../restriction.ts. IT IMPORTS NOTHING FROM ../types.ts.
 */
// THE THREE WORDS A RESTRICTION'S SEVERITY MAY BE, from the one place they are declared. The two
// restriction kinds' `severity` field is built from this list through `unionOf`, so the type an
// agent reads at GET /api/kinds and the values a write is refused against are the same array.
import { commonFields, unionOf, type FieldSpec, type KindSpec } from './kind-common.ts'
import { RESTRICTION_SEVERITY } from '../restriction.ts'

/**
 * `allowed_uses`, `disallowed_claims` and `severity`, given to the two kinds that restrict.
 *
 * DECLARED ONCE, the way `commonFields` and `attentionFields` in `./kinds/kind-common.ts` are declared once, and for the
 * same reason: two copies of a field description agree on the day they are written and drift after.
 *
 * THIS IS THE ONE THING `placeholder` AND `ran_instead` SHARE, and sharing it is not the collapse
 * the owner's G.2 forbids. What is shared is three fields and one drawing vocabulary. What is not
 * shared is the kind, the field list, the lifecycle, the create route, the governance rule and the
 * screen word. There is no type either object is an instance of and no enum naming an epistemic
 * phenomenon anywhere — see `src/shared/restriction.ts`.
 *
 * THE SECOND KEY IS SHORTER THAN THE FIELD AND THAT IS ON PURPOSE. The owner's own phrase is
 * "disallowed uses/claims" — two things. The key is `disallowed_claims`, because four sibling
 * designs had already written `disallowedClaims` in their signatures before this was named, and a
 * fifth spelling would be the defect this campaign is about. **The key is not the definition.**
 * The description below carries both halves, and this comment exists so that nobody later reads
 * the key and narrows the field to claims alone. The fix, if the key ever bothers anybody, is to
 * rename it everywhere at once, never to shrink the field.
 */
export const restrictionFields = (kind: string): FieldSpec[] => [
  {
    key: 'allowed_uses',
    type: 'string[]',
    required: true,
    description:
      `What work stays valid while this ${kind} is here, one short entry each, in your own words. These are ` +
      'carried unchanged to every record that depends on this one — Mole Office never re-words them and never ' +
      'summarises them. Write what somebody may still conclude, not what the mechanism is. Leave the list empty ' +
      'ONLY when severity is "harmless", which already says nothing is restricted.',
    example: ['pipeline plumbing', 'shape/interface testing', 'execution-path integration'],
  },
  {
    key: 'disallowed_claims',
    type: 'string[]',
    required: true,
    description:
      `What may NOT be claimed while this ${kind} is here, AND what the work may not be used for, one short ` +
      'entry each, in your own words. Both halves belong here: "do not deploy this to production" is a ' +
      'disallowed USE and goes in this list beside "geometric accuracy claims", which is a disallowed CLAIM. ' +
      'The key is shorter than the field and the key is not the definition. This is the most important field on ' +
      'the record: the question it answers is "what work remains valid while this exists, and what claims may ' +
      'not be made?". These strings travel to every dependent record unchanged. An empty list means nothing is ' +
      'forbidden and is only valid with severity "harmless".',
    example: ['geometric accuracy claims', 'final performance comparison', 'production deployment validation'],
  },
  {
    key: 'severity',
    type: unionOf(RESTRICTION_SEVERITY),
    required: true,
    description:
      '"stops_final" — something cannot be called finished or final while this is here. "limits_claims" — work ' +
      'continues and some claims cannot be made. "harmless" — nothing rests on it; it does not travel to any ' +
      'other record and it writes nothing when it is resolved. YOU choose this word; Mole Office never works it out. ' +
      'A guessed severity would be a guess about consequence, and this product does not guess about consequence.',
    example: 'stops_final',
  },
]

export const placeholderKind: KindSpec = {
    kind: 'placeholder',
    purpose:
      'A slot in the work that is deliberately unresolved, and what that stops the project claiming. This is the ' +
      "owner's Placeholder: a deliberate unresolved slot, optionally carrying a temporary substitute, whose " +
      'incompleteness and validity boundaries are explicit. It does not require a fake substitute — a deliberate ' +
      'empty slot is one too.',
    whenToRecord:
      'When you decide to continue past something that is not settled or not measured — a value you have made up ' +
      'to get the pipeline running, a section left until the hardware trial, an implementation nobody has chosen. ' +
      'File it at the moment you decide to continue, not later. What it is about is a link: POST /api/links ' +
      '{"fromId":"<this placeholder>","toId":"<the block or claim>","type":"about"}.',
    humanOnly: false,
    fields: [
      {
        key: 'what',
        type: 'string',
        required: true,
        description:
          'What is unresolved, in one sentence, naming the thing rather than the feeling. Not "the calibration is ' +
          'a mess" — "the second camera\'s intrinsics have never been calibrated".',
        example: "The second camera's intrinsics have never been calibrated.",
      },
      {
        key: 'slot',
        type: "'empty' | 'stand_in'",
        required: true,
        description:
          'Whether anything is in the slot right now. "stand_in" means a temporary value is in use and `substitute` ' +
          'says what it is. "empty" means the slot is deliberately left open and nothing is standing in it — a ' +
          'legitimate placeholder that carries no made-up value at all. This field exists because guessing which ' +
          'of the two it is would be exactly the substitution this product refuses to make.',
        example: 'stand_in',
      },
      {
        key: 'substitute',
        type: 'string',
        required: false,
        description:
          'The temporary value in use, in your own words. REQUIRED when `slot` is "stand_in" and REFUSED when it ' +
          'is "empty". It lives here and nowhere else: it is never written into the field it stands in for, and no ' +
          'read that answers "what is the value" returns it. That is what stops a temporary option becoming ' +
          'canonical merely because work continued with it.',
        example: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
      },
      {
        key: 'holds_field',
        type: 'string',
        required: false,
        description:
          'The field key on the record this is about, when it holds ONE field rather than the whole record — ' +
          '"method", "measured", "numbers". It is stored, returned on that record\'s restrictions, and NAMED in the ' +
          'restrictions panel at the head of that record\'s page. Nothing yet draws a mark beside the value itself, ' +
          'which is what this field is for and is not what happens today.',
        example: 'method',
      },
      {
        key: 'because',
        type: 'string',
        required: false,
        description: 'Why it is unresolved, and why work continued anyway.',
        example: 'The calibration rig is on loan and the pipeline had to run this week.',
      },
      {
        key: 'resolved_when',
        type: 'string',
        required: true,
        description:
          'What would END it — the resolution condition. NOT `revisit_when`, which means the opposite: that ' +
          'reopens a question already settled, and this closes one that is open. A placeholder with no condition ' +
          'is a slot nobody can ever tell is filled.',
        example: 'A calibration run on the second camera, with the residuals recorded.',
      },
      ...restrictionFields('placeholder'),
      ...commonFields('placeholder'),
    ],
    rules: [
      'what this placeholder is about is a LINK and never a field: POST /api/links ' +
        '{"fromId":"<this placeholder>","toId":"<the record>","type":"about"}. One with no such link restricts ' +
        'nothing, reaches nobody and appears on no record page. It is still listed on the Placeholders surface, ' +
        'which says in words that it is about nothing yet.',
      '`substitute` is REQUIRED when `slot` is "stand_in" and REFUSED when `slot` is "empty". A stand-in with no ' +
        'value stored is a value nobody can see; an empty slot with one is not empty.',
      'severity "harmless" requires `allowed_uses` and `disallowed_claims` to be EMPTY, and the other two ' +
        'severities require at least one entry in each. A harmless restriction that forbids something is a ' +
        'contradiction, and a "stops_final" one that names nothing it stops is a mark with nothing behind it.',
      'it is RESOLVED when the record that answers it links to it with `resolves` — POST /api/links ' +
        '{"fromId":"<the answering record>","toId":"<this placeholder>","type":"resolves"}. There is no ' +
        '`resolved` field and there must not be one, for the reason `proposal` gives: two statements of one fact ' +
        'eventually disagree.',
      'resolving it makes NOTHING valid. It writes one re-validation row per affected record, and the ' +
        'restriction keeps travelling — reading "resolved, not re-checked" — until somebody judges each record.',
      'a placeholder may not settle a fork. While a live `proposal` blocks it and no decision has answered that ' +
        'proposal, the `resolves` link is refused — to a person as well as to an agent. The temporary option does ' +
        'not become canonical merely because work continued with it.',
    ],
    example: {
      what: "The second camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600, cx = 320, cy = 240 — guessed from the sensor data sheet',
      holds_field: 'method',
      because: 'The calibration rig is on loan and the pipeline had to run this week.',
      resolved_when: 'A calibration run on the second camera, with the residuals recorded.',
      allowed_uses: ['pipeline plumbing', 'shape/interface testing', 'execution-path integration'],
      disallowed_claims: [
        'geometric accuracy claims',
        'final performance comparison',
        'production deployment validation',
      ],
      severity: 'stops_final',
    },
}
