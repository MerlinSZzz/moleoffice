// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `notebook`, one secretary's notes kept under its name.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields`, `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND `NOTEBOOK_ENTRY_KIND_KEYS` FROM ../notebook.ts. IT IMPORTS NOTHING FROM
 * ../types.ts.
 */
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { NOTEBOOK_ENTRY_KIND_KEYS } from '../notebook.ts'

export const notebookKind: KindSpec = {
    kind: 'notebook',
    purpose:
      'ONE SECRETARY\'S NOTES, kept by the office under that agent\'s name. A person reads this kind as ' +
      '"secretary notes", in Chinese 秘书笔记; the stored kind ' +
      'and the door addresses keep the word `notebook`. It holds how this person works, ' +
      'how they want to be answered, what the secretary may settle alone, what is theirs to do, dated summaries of ' +
      'the work, and \u2014 in the secretary\'s own name \u2014 what it felt at work, what its character is and how it ' +
      'replies. Every secretary has a notebook of its own, under its own name. It works like a soul file: even ' +
      'when the model changes, the secretary can quickly recover how to work with the person and its own character. A run reads the whole of it before ' +
      'anything else, on every runtime and every model: GET /api/brief carries it first.',
    whenToRecord:
      'Through the notebook doors and not by hand. POST /api/agents/<handle>/notebook/entries writes the first ' +
      'entry and makes the notebook if there is not one yet; PATCH and DELETE on one entry change and remove it. ' +
      'The person writes the first entries, and the secretary adds its own ' +
      'afterwards. A second notebook for one agent is refused, and so is a notebook for an agent that does not ' +
      'hold the secretary card; `checkTheNotebook` in src/server/lib/records/notebook-entries.ts refuses both on both write paths.',
    humanOnly: false,
    fields: [
      {
        key: 'agentHandle',
        type: 'string',
        required: true,
        description:
          'THE HANDLE OF THE SECRETARY THIS NOTEBOOK BELONGS TO. One notebook per agent, and the agent must hold ' +
          'the card `elevation.onlyThisCardCanHoldIt` names in src/config/roles.json \u2014 the word is read ' +
          'from that file rather than written here, so changing the card the file names moves the refusal with it. ' +
          'IT IS `agentHandle` AND NOT `agent`, measured on 11 September 2026: `work_domain.agent` is the ID of an ' +
          'agent RECORD, and one key meaning a handle on one kind and a record id on another is the drift this ' +
          'file exists to prevent. A kind change carries the value across, so the two would meet.',
        example: 'secretary-1',
      },
      {
        key: 'entries',
        type: 'NotebookEntry[]',
        required: true,
        description:
          'THE DATED ENTRIES, each saying who wrote it, when, which of the eight kinds it is, and the words. An ' +
          'empty list is a real answer: it is a notebook nobody has written in yet, and the opening a run reads ' +
          'says so rather than inventing a character.',
        example: [
          {
            id: 'entry-20260911-154000',
            writtenByKind: 'person',
            writtenById: 'owner',
            at: '2026-09-11 15:40',
            entryKind: 'how-they-want-answers',
            text: 'Conclusion first, then the reasons. Chinese when the answer is long.',
          },
        ],
      },
      ...commonFields('notebook'),
    ],
    rules: [
      'one notebook per secretary agent. A second one for the same agent is two accounts of one working ' +
        'relationship, and the door refuses it by name rather than filing it.',
      'only an agent holding the secretary card has one. The card is read from src/config/roles.json, ' +
        'which is the only place saying what a role is.',
      'who wrote an entry is never rewritten. The person editing an entry keeps the original writer and adds ' +
        '`changedByThePerson` with when.',
      'the person may write and change any entry; the secretary may write entries in its own name and change ' +
        'only its own; nobody else may write in it at all.',
      'the numbers on the role card are counted from `entries` on every read and are stored nowhere.',
    ],
    example: {
      agentHandle: 'secretary-1',
      entries: [
        {
          id: 'entry-20260911-154000',
          writtenByKind: 'person',
          writtenById: 'owner',
          at: '2026-09-11 15:40',
          entryKind: 'how-they-want-answers',
          text: 'Conclusion first, then the reasons. Chinese when the answer is long.',
        },
      ],
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const NOTEBOOK_SHAPES: Record<string, ShapeSpec> = {
  NotebookChange: {
    name: 'NotebookChange',
    description:
      'THE PERSON CHANGED AN ENTRY SOMEBODY HAD ALREADY WRITTEN, and when. An edit keeps who wrote ' +
      'the original and records that the person changed it. It is on the entry rather than replacing the writer, ' +
      'because who wrote a thing and who last touched it are two facts and overwriting one with the other loses ' +
      'the first. WHAT WAS CHANGED is not stored here: the record keeps every revision, so a second copy of the ' +
      'old text here would be one more thing that can disagree with the ledger.',
    fields: [
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When the person changed it, in local wall clock.',
        example: '2026-09-11 15:40',
      },
    ],
  },

  NotebookEntry: {
    name: 'NotebookEntry',
    description:
      'ONE DATED ENTRY IN A SECRETARY\'S NOTEBOOK: who wrote it, when, which of the eight kinds it is, and the ' +
      'words. `src/shared/notebook.ts` holds the eight kinds and what belongs under each.',
    fields: [
      {
        key: 'id',
        type: 'string',
        required: true,
        description:
          'This entry\'s id, unique inside this notebook. It is what an edit and a removal address, so it never ' +
          'changes once written.',
        example: 'entry-20260911-154000',
      },
      {
        key: 'writtenByKind',
        type: unionOf(['person', 'agent']),
        required: true,
        description:
          'WHO WROTE IT, and it is never rewritten \u2014 an edit by the person leaves this exactly as it was and adds ' +
          '`changedByThePerson` instead.',
        example: 'person',
      },
      {
        key: 'writtenById',
        type: 'string',
        required: true,
        description: 'The person\'s name, or the agent\'s handle. The same pair every other authored thing here carries.',
        example: 'owner',
      },
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When it was written, in local wall clock. The page and the opening both read newest first.',
        example: '2026-09-11 15:40',
      },
      {
        key: 'entryKind',
        type: unionOf(NOTEBOOK_ENTRY_KIND_KEYS),
        required: true,
        description:
          'WHICH OF THE EIGHT KINDS IT IS. The words and what belongs under each are declared once in ' +
          'src/shared/notebook.ts; five are about the person and three are the ' +
          'secretary\'s own (a feeling at work, its character, how it replies).',
        example: 'the-persons-preferences',
      },
      {
        key: 'text',
        type: 'string',
        required: true,
        description:
          'The words of the entry, as they were written. `string` and not `text` because this is a field inside a ' +
          'declared shape, and the long-text hint is only read on a kind\'s own fields; the page draws it in a ' +
          'text area either way.',
        example: 'They read the conclusion first when the answer is long. Put the conclusion first.',
      },
      {
        key: 'changedByThePerson',
        type: 'NotebookChange',
        required: false,
        description:
          'SET WHEN THE PERSON EDITED THIS ENTRY, with when. ABSENT MEANS THE PERSON NEVER CHANGED IT, which is not ' +
          'the same as nobody having changed it: the secretary may edit its own entries, and that is on the ' +
          'record\'s revisions rather than here. The card\'s "changed by the person" number counts entries ' +
          'carrying this.',
        example: { at: '2026-09-11 16:02' },
      },
    ],
  },

}
