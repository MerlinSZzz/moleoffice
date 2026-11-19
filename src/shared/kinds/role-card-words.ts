// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `role_card_words`, one role card in words.
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

export const roleCardWordsKind: KindSpec = {
    kind: 'role_card_words',
    purpose:
      'THE WORDS OF ONE ROLE CARD, AS THIS OFFICE HOLDS THEM. A card is its powers and its words. The powers, and ' +
      'what decides them, are the declaration in `src/config/roles.json`, or for a card added on the Roles page ' +
      'its checked row there, and never this record. The words are this ' +
      'record: what the card says its role does, whom it answers to, what ends it, its flow, the sentence its ' +
      'work-area refusal gives, and its handbook in English and Chinese. Change a field here and every place the ' +
      'office shows that card shows the new words.',
    whenToRecord:
      'Never by hand on a fresh office. The office files one per declared card at its first start, copied from ' +
      'the declaration, and says so in one line of its log. It files nothing for a role that has ever had one, ' +
      'deleted ones included, so a record somebody deleted is not filed again. The Roles page writes the record of a ' +
      'card added there together with the card, and removes it when the card is removed. Change the words by editing ' +
      'this record on its page. The owner changes them freely. An agent creates, changes, deletes or restores one only ' +
      'with a warrant: the person\'s words copied whole from a message the person wrote, cited as message:<its id>, and a ' +
      'live decision of the owner\'s resting on that message. Without both it is refused and nothing is written. ' +
      'Its short forms need neither.',
    humanOnly: false,
    fields: [
      {
        key: 'roleName',
        type: 'string',
        required: true,
        description:
          'THE WORD ON THE CARD THESE ARE THE WORDS OF. It has to be a card the office holds, declared or added on ' +
          'the Roles page, and an office ' +
          'holds one live record per card: a second would be two accounts of one card with nothing saying which ' +
          'one the office shows.',
        example: 'administrator',
      },
      {
        key: 'duties',
        type: 'string',
        required: false,
        description:
          'WHAT AN AGENT OR PERSON HOLDING THIS CARD IS FOR, in a few sentences. It is the first thing the message ' +
          'giving the card says, and the line under the card on every page that draws it.',
        example: 'Does the work it is given, in the folders it registered.',
      },
      {
        key: 'reportsTo',
        type: 'string',
        required: false,
        description:
          'WHOM THE HOLDER ANSWERS TO, in words. Shown wherever the card is drawn. On a card the office ships, ' +
          'the reporting chain the office works out is read from the declaration, so changing this changes only ' +
          'what is shown. On a card a person added on the Roles page, the card is read in these words, so ' +
          'changing this also changes who is added above the holder when two work areas overlap.',
        example: 'Its starter.',
      },
      {
        key: 'whatEndsIt',
        type: 'string',
        required: false,
        description:
          'WHAT ENDS THE HOLDER\'S WORK, in words. Shown wherever the card is drawn.',
        example: 'Its task is done, or its starter ends it.',
      },
      {
        key: 'standing',
        type: 'string',
        required: false,
        description:
          'WHERE A PERSON HOLDING THIS CARD STANDS HERE, in one line. Only a person\'s card has one; on an agent\'s ' +
          'card this field is left empty and nothing reads it.',
        example: 'Manages this office.',
      },
      {
        key: 'flow',
        type: 'string',
        required: false,
        description:
          'WHAT THE HOLDER DOES FIRST WHEN GIVEN THE CARD, in words. On a card the office ships, which first ' +
          'task the office sends is read from the flow codes in the declaration, so changing this changes only ' +
          'what is shown. On a card a person added on the Roles page, the card is read in these words, so ' +
          'changing this also changes which first task the office names for the holder.',
        example: 'Reads its task, then registers its folders.',
      },
      {
        key: 'workAreaSays',
        type: 'string',
        required: false,
        description:
          'THE SENTENCE A REFUSED WORK AREA GIVES, for a card with a work area. When an agent of this card names a ' +
          'work area the card does not allow, the refusal says this. Which areas are refused is still the declaration.',
        example: 'A worker registers folders, one or more.',
      },
      {
        key: 'howItWorks',
        type: 'string',
        required: false,
        description:
          'HOW THE ROLE WORKS, IN ENGLISH. Half of the card\'s handbook, which the office sends with the card. It is ' +
          'read only together with `howItWorksZh`: a handbook part is shown in every language or the declaration\'s ' +
          'is shown instead.',
        example: 'A worker is given one task and the folders to do it in.',
      },
      {
        key: 'howItWorksZh',
        type: 'string',
        required: false,
        description:
          'HOW THE ROLE WORKS, IN CHINESE. The other half of `howItWorks`, and read only with it.',
        example: '工作者领到一个任务，以及完成它所用的文件夹。',
      },
      {
        key: 'inPractice',
        type: 'string',
        required: false,
        description:
          'THE PRACTICAL PART OF THE HANDBOOK, IN ENGLISH, for a card that has one. Read only together with ' +
          '`inPracticeZh`, for the reason `howItWorks` gives.',
        example: 'Answer the person in the language they wrote in.',
      },
      {
        key: 'inPracticeZh',
        type: 'string',
        required: false,
        description:
          'THE PRACTICAL PART OF THE HANDBOOK, IN CHINESE. The other half of `inPractice`, and read only with it.',
        example: '用对方写信时的语言回答。',
      },
      {
        key: 'copiedFrom',
        type: 'string',
        required: false,
        description:
          'Where these words were copied from when the office filed this record: the declaration\'s file, or the ' +
          'stored row of a card added on the Roles page before its words had a record. A press that copies the ' +
          'shipped words onto the record later writes the declaration\'s file here again. Absent on a record somebody ' +
          'filed by hand or the Roles page wrote.',
        example: 'src/config/roles.json',
      },
      {
        key: 'copiedFromCommit',
        type: 'string',
        required: false,
        description:
          'THE COMMIT OF THE CHECKOUT THE WORDS WERE COPIED FROM, in full, by the filing or by the latest press that ' +
          'copied the shipped words. Absent when the office could not read one, and then the line it wrote to its ' +
          'log says why.',
        example: '4b8c76218a1b2c3d4e5f60718293a4b5c6d7e8f9',
      },
      {
        key: 'copiedAt',
        type: 'date',
        required: false,
        description: 'When the office copied the words, by the filing or by the latest press that copied the shipped words, in local wall clock.',
        example: '2026-10-13 09:00:00',
      },
      ...commonFields('role_card_words'),
    ],
    rules: [
      'one live record per card, in the whole office. A second is refused, and so is a record for a card the ' +
        'office does not hold.',
      'only words. Nothing here can give a card a power, a rung, a reader or a work area: those are read from the ' +
        'declaration or the Roles page and never from this record, and a field this kind does not declare is refused.',
      'an empty field shows the declaration\'s words for that part, and GET /api/roles names the parts that are ' +
        'still the declaration\'s.',
      'a card added on the Roles page has no declaration behind it, so this record holds its only words. A write ' +
        'that would leave that card without a part it needs is refused, and so is deleting the record or naming ' +
        'another card in it while the card is in use.',
    ],
    // THE EXAMPLE IS A PERSON'S CARD, the one a person with no role reads as, so it shows `standing`, which
    // only a person's card has. It is not the worker card, because the role card copy's example names the
    // worker, and an office holds one words record per card.
    example: {
      roleName: 'administrator',
      standing: 'Manages this office.',
      duties: 'Decides what the office keeps and who works in it.',
      reportsTo: 'Nobody in this office.',
      whatEndsIt: 'Nothing the office does; the person holds the card for as long as they use the office.',
      copiedFrom: 'src/config/roles.json',
      copiedAt: '2026-10-13 09:00:00',
    },
}
