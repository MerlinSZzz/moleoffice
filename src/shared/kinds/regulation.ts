// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `regulation`, a person's constraint on themselves in their own words.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `REGULATION_BINDS_KINDS` FROM ../regulation.ts. IT IMPORTS NOTHING FROM
 * ../types.ts.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { REGULATION_BINDS_KINDS } from '../regulation.ts'

export const regulationKind: KindSpec = {
    kind: 'regulation',
    purpose:
      'A PERSON’S CONSTRAINT ON THEMSELVES, in their own words, kept where the office reads it back to them before they ' +
      'ask for something one of them says they should not. A regulation binds ' +
      'whom it says: the person themselves, or bound to a role, the office. It is not a chapter: a chapter (a `module` ' +
      'record carrying `extra.chapter`) binds the agents it names and any agent may reword it; a regulation binds the ' +
      'person or a role. The person may revoke one, or a secretary using its own key may carry the person’s written ' +
      'words for that revocation on a change. The grant never revokes, and an agent never files one already revoked.',
    whenToRecord:
      'When the person states a constraint on their own future action, or agrees that one an agent proposed states ' +
      'one. An agent may file one on the person\'s own quoted words — a warrant — or file a `proposal` and let them decide; ' +
      'an agent with neither gets the ordinary 403 a human-only kind gives, the same one `decision` gives. Never ' +
      'invent one from what an agent inferred the person would want: a regulation is the person\'s own words, and an inferred one is not.',
    humanOnly: true,
    fields: [
      {
        key: 'sentence',
        type: 'string',
        required: true,
        description:
          'THE CONSTRAINT, IN THE PERSON’S OWN WORDS, COPIED EXACTLY. Never a paraphrase and never a summary — the same rule ' +
          'a warrant’s own `words` carries, and for the same reason: the whole value of keeping their sentence is that ' +
          'they can read it beside the record and say it is not what they said.',
        example: 'I do not start a new experiment on a Friday afternoon.',
      },
      {
        key: 'binds',
        type: unionOf(REGULATION_BINDS_KINDS),
        required: true,
        description:
          '"person" when the constraint binds the person themselves. "role" when it ' +
          'binds a role by name instead, and then `role` below names which one.',
        // "role", NOT "person", SO THE FIELD'S OWN EXAMPLE VALIDATES ALONE. Paired with `role`'s own example
        // ("secretary"), the two agree; paired with "person" they would not, and the kind's own top-level
        // `example` below — binds: "person", no role — is where the "person" case is shown complete.
        example: 'role',
      },
      {
        key: 'role',
        type: 'string',
        required: false,
        description:
          'WHICH ROLE THIS BINDS, when `binds` is "role". A role name from src/config/roles.json, in the ' +
          'declaration’s own word for it — nothing here checks the role still exists, the way nothing checks a ' +
          '`module.extra.chapter` number still has a chapter either. Leave it out when `binds` is "person": naming a ' +
          'role there would say two things about whom this binds.',
        example: 'secretary',
      },
      {
        key: 'since',
        type: 'date',
        required: true,
        description: 'Since when this binds. The date, or the local wall-clock stamp, they said it.',
        example: '2026-09-11',
      },
      {
        key: 'revoked_at',
        type: 'date',
        required: false,
        description:
          'WHEN THIS WAS REVOKED. Absent means it still stands. The person may write this, or on a change a ' +
          'secretary using its own key and carrying the person’s written words naming regulation.revoke:<id> and ' +
          'the record id. The grant never revokes. An agent never creates a regulation already revoked. ' +
          '`assertMayRevokeARegulation` in src/server/lib/regulations.ts guards both write paths.',
        example: '2026-10-01',
      },
      {
        key: 'revoked_because',
        type: 'string',
        required: false,
        description:
          'WHY IT WAS REVOKED, IN THE PERSON’S OWN WORDS. The person or a secretary carrying written words for that ' +
          'revocation on a change may write it, as for `revoked_at`. The grant never revokes. It is ' +
          'required together with it — the pairing `claim.retracted_because` already uses, for the same reason: a ' +
          'stamp with no reason is a fact nobody can check and a reason with no stamp is a regulation the record ' +
          'still calls standing.',
        example: 'The bench now has a weekend watch, so the rule is no longer needed.',
      },
      {
        key: 'zh',
        type: 'RegulationChinese',
        required: false,
        description:
          'The Chinese of the title, which the office regulations page draws in Chinese. The sentence stays in their ' +
          'own words. A write that changes the title and leaves this with a from that is not the hash of the new ' +
          'title is refused, and nothing is written.',
        example: { title: '周五下午不开始新实验', from: '656eb835c8d14f20' },
      },
      ...commonFields('regulation'),
    ],
    rules: [
      'role is required when binds is "role", and refused when binds is "person" — the two say whom this binds ' +
        'and may not disagree with each other.',
      'revoked_because is required when revoked_at is set, and refused without it, the pairing claim.retracted_because ' +
        'already uses.',
    ],
    example: {
      sentence: 'I do not start a new experiment on a Friday afternoon.',
      binds: 'person',
      since: '2026-09-11',
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const REGULATION_SHAPES: Record<string, ShapeSpec> = {
  RegulationChinese: {
    name: 'RegulationChinese',
    description:
      'The Chinese of a regulation\'s title. The sentence is the person\'s own words and is never translated. A write ' +
      'that changes the title must set this in the same write, with from naming the new title, or it is refused.',
    fields: [
      { key: 'title', type: 'string', required: true, description: 'The regulation\'s title in Chinese.', example: '周五下午不开始新实验' },
      {
        key: 'from',
        type: 'string',
        required: true,
        description:
          'Which English this was written from: englishHash([title]) of the record, 16 hex characters. ' +
          'src/shared/english-hash.ts defines it.',
        example: '656eb835c8d14f20',
      },
    ],
  },

}
