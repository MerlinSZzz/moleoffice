// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `role_card`, one role card copied from the declaration.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND THE `KindSpec` TYPE FROM ./kind-common.ts. IT IMPORTS
 * NOTHING FROM ../types.ts. NO DECLARATION MOVED WITH THIS KIND.
 */
import { commonFields, type KindSpec } from './kind-common.ts'

export const roleCardKind: KindSpec = {
    kind: 'role_card',
    purpose:
      'ONE ROLE CARD, COPIED FROM THE DECLARATION so that it can be read in Mole Office rather than only in a ' +
      'checkout. What an agent of a role may do is `src/config/roles.json` and nothing else; this is a ' +
      'copy of one card in that file.',
    // The owner switched `POST /api/roles/cards` off.
    whenToRecord:
      'Through one door and never by hand. `POST /api/roles/mirror` writes one of these per DECLARED card ' +
      'and rewrites it when the declaration changes, and `GET /api/roles` says which copies are out of date. ' +
      '`POST /api/roles/cards` wrote a card somebody defined in Mole Office itself, marked `madeHere`, until the ' +
      'owner switched it off. It now refuses every write, and the cards it wrote are kept. An office ' +
      'role is added on the Role cards page instead, and it is an office setting, not one of these. ' +
      'A card filed straight through POST /api/records is neither, and it is refused: it would be a ' +
      'permission nothing enforces sitting in the one place a reader trusts to say what the rules are, with ' +
      'nothing on it saying which of the two it is.',
    humanOnly: false,
    fields: [
      {
        key: 'roleName',
        type: 'string',
        required: true,
        description:
          'THE WORD ON THE CARD, which is the word stored on an agent\'s registry row. One word, and it is what ' +
          'joins this record to the declaration it was copied from.',
        example: 'worker',
      },
      {
        key: 'card',
        type: 'Record<string, unknown>',
        required: true,
        description:
          'THE WHOLE CARD, AS THE OFFICE READS IT: the declaration\'s card, in the words of the office\'s ' +
          '`role_card_words` record of it where it holds one. It is one field and not nine because the card\'s ' +
          'shape is declared in that file, and restating it here would be the same shape in two places — which is ' +
          'the defect this repository keeps producing. It is copied and never edited: `GET /api/roles` compares ' +
          'this to the card as the office reads it and says when the two have come apart.',
        example: { name: 'worker', rung: 1, reportsTo: 'Its starter.' },
      },
      {
        key: 'copiedFrom',
        type: 'string',
        required: false,
        description:
          'The file this card was copied from, so a reader can go and check it. ABSENT ON A CARD SOMEBODY WROTE ' +
          'IN MOLE OFFICE, which was copied from nothing: `madeHere` below is what says so, and a ' +
          'card carrying neither is one nobody has said anything about.',
        example: 'src/config/roles.json',
      },
      {
        key: 'copiedAt',
        type: 'date',
        required: false,
        description:
          'When the copy was taken, in local wall clock. It is what makes "this copy is older than the ' +
          'declaration" a fact rather than a guess. Absent on a card written here, which was never copied.',
        example: '2026-09-06 14:00:00',
      },
      {
        key: 'madeHere',
        type: 'boolean',
        required: false,
        description:
          'TRUE ON A CARD SOMEBODY WROTE IN MOLE OFFICE rather than copied from the declaration. ' +
          'No new one is written: the door that wrote them refuses every write. ' +
          'NOTHING ENFORCES SUCH A CARD: the refusals in this product are built from ' +
          'src/config/roles.json, read once when the server starts, and no refusal has ever read a ' +
          'record. The page says that on the card in one line, because a card that looked like a declared one ' +
          'and granted nothing would be worse than no card at all. Absent means this is a copy of a declared ' +
          'card, which is what `copiedFrom` above names. Written by POST /api/roles/cards before it was switched off.',
        example: true,
      },
      {
        key: 'madeAt',
        type: 'date',
        required: false,
        description:
          'WHEN A CARD WRITTEN HERE WAS WRITTEN, in local wall clock. It is the counterpart of ' +
          '`copiedAt` above for a card that was copied from nothing, and it is absent on a copy for the same ' +
          'reason `copiedAt` is absent on a card written here: the two are different events.',
        example: '2026-09-06 20:15:00',
      },
      {
        key: 'portrait',
        type: 'string',
        required: false,
        description:
          'THE PICTURE ON THIS CARD, by the address it is served at. There are three portraits per role, in one ' +
          'style, and the person or agent holding the card picks one of their role\'s three. ABSENT MEANS ' +
          'NOBODY HAS CHOSEN ONE, which is every card until the portraits are painted; the card page says so ' +
          'in words and draws no picture, because a stand-in picture would be a choice nobody made. It is not ' +
          'copied from the declaration: the declaration says what a role may do and says nothing about ' +
          'pictures, so the mirror leaves this field alone.',
        example: '/api/assets/8f2c1d0e',
      },
      ...commonFields('role_card'),
    ],
    rules: [
      'one record per role in a project. A second copy of one card is two accounts of one rule, and the mirror ' +
        'route rewrites the record it already made rather than filing another.',
      'the declaration is the authority and this is the copy. Editing this record changes no permission, and ' +
        'the next mirror overwrites it. What to change is the file for a power, or the card\'s `role_card_words` ' +
        'record for its words.',
      '`portrait` is the one field the mirror does not touch. Everything else here is copied from the ' +
        'declaration and rewritten when the declaration changes; the picture is a choice somebody made and ' +
        'the declaration holds no pictures, so a mirror leaves it exactly as it found it.',
    ],
    example: {
      roleName: 'worker',
      card: { name: 'worker', rung: 1, reportsTo: 'Its starter.' },
      copiedFrom: 'src/config/roles.json',
      copiedAt: '2026-09-06 14:00:00',
    },
}
