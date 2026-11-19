// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE KIND IN A FILE OF ITS OWN: `context_bundle`, what somebody wanted a copy of.
 *
 * It was moved out of src/shared/kinds.ts with no change of behaviour: the same purpose,
 * whenToRecord, humanOnly, fields, rules and example, and the same place in the kind list.
 *
 * NO CALLER CHANGED. src/shared/kinds.ts hands this file on with `export *`, and every caller
 * still imports the kind from kinds.ts.
 *
 * THIS FILE IMPORTS `commonFields` AND `unionOf` AND THE `KindSpec` AND `ShapeSpec` TYPES FROM
 * ./kind-common.ts, AND ITS PRESET AND RUNG WORDS FROM ../bundles.ts. IT IMPORTS NOTHING FROM
 * ../types.ts. NO DECLARATION MOVED WITH THIS KIND; `CONTEXT_BUNDLE_SHAPES` holds the shapes
 * moved out of ../kinds.ts, with their comments and text unchanged.
 */
// THE PRESETS A BUNDLE MAY BE ASKED FOR, from the one place they are declared. The `context_bundle`
// kind's `preset` field is built from this list through `unionOf`, so what an agent reads at
// GET /api/kinds/context_bundle is the same set the bundle routes refuse against. It used to be a
// union typed out by hand here, and it went stale the day `owner_governance` was added: the kind
// published six presets and the routes took seven, so nobody reading the schema could learn the
// seventh. Problem `l2FKzRcOdhzf`.
import { commonFields, unionOf, type KindSpec, type ShapeSpec } from './kind-common.ts'
import { BUNDLE_PRESET_NAMES, BUNDLE_RUNGS } from '../bundles.ts'

export const contextBundleKind: KindSpec = {
    kind: 'context_bundle',
    purpose:
      'WHAT SOMEBODY WANTED A COPY OF: a scope, one of the presets below, and a list of what was actually handed over. ' +
      'It holds no project content. The text is resolved from the records the scope names every time it is asked ' +
      'for, so a bundle read a week later is a reading of the project as it is a week later, not a copy of how it ' +
      'was. What it does keep is what LEFT: each export records the record ids and the `contentHash` each held at ' +
      'that moment, so what an outside agent was handed is answerable exactly.',
    whenToRecord:
      'When you are about to hand project context to an agent Mole Office does not run — a chat window, another tool, ' +
      'somebody else\'s machine. File the bundle, then export it; the export is the act that produces text.',
    humanOnly: false,
    fields: [
      {
        key: 'scope',
        type: "'project' | 'record'",
        required: true,
        description: 'What the bundle is about: the whole project, or one record named in `scopeRecordId`.',
        example: 'record',
      },
      {
        key: 'scopeRecordId',
        type: 'string',
        required: false,
        description: 'The record this bundle is about. Required when `scope` is "record", and meaningless otherwise.',
        example: 'jT4UYozpfgVQ',
      },
      {
        key: 'preset',
        // BUILT FROM `BUNDLE_PRESET_NAMES`, never typed out. See the import at the head of this file.
        type: unionOf(BUNDLE_PRESET_NAMES),
        required: true,
        description:
          'Which reading of the project this is. Each preset declares which record kinds it is offered on, and the ' +
          'menu on a record page is built from that declaration rather than from a list written anywhere else.',
        example: 'continue',
      },
      {
        key: 'slots',
        type: 'string[]',
        required: false,
        description:
          'Only when `preset` is "custom": the parts to include, from objective, openLoops, howItStands, ' +
          'importantContext, whatWasTried, validityLimits. On the other five presets it is ignored, because a ' +
          'preset that could be edited part by part is a custom bundle wearing a preset\'s name.',
        example: ['objective', 'openLoops', 'validityLimits'],
      },
      {
        key: 'reach',
        type: 'number',
        required: false,
        description: 'How far from the scope record to reach, in links: 1, 2 or 3. Meaningless for a project scope.',
        example: 2,
      },
      {
        key: 'modulesAndPipelines',
        type: 'string[]',
        required: false,
        description:
          'WHICH MODULES AND PIPELINES GO IN, by id. Only when the copy carries the part that draws them; sent ' +
          'beside a copy that does not, it is REFUSED rather than ignored. Left out, the copy carries every module ' +
          'and every pipeline in the project, which is what it did before this key existed. An empty list is not ' +
          '"all of them": it is somebody naming none, and it is refused. An id that names no module and no ' +
          'pipeline in this project is refused by name.',
        example: ['ypqv7MUMUFyj'],
      },
      {
        key: 'additionalRecords',
        type: 'string[]',
        required: false,
        description:
          'RECORDS SOMEBODY NAMED BY HAND, by id, carried under a part of their own on top of whatever the ' +
          'subject of the copy already carries. Naming any puts that part in, whichever preset the copy uses, so ' +
          'a person does not have to pick a preset that happens to declare it. Left out, the copy carries none of ' +
          'them and prints no heading for them. An empty list is not "none": it is somebody naming none, and it ' +
          'is refused. An id that names no live record in this project is refused by name.',
        example: ['ypqv7MUMUFyj'],
      },
      {
        key: 'detail',
        // BUILT FROM THE FIVE A COPY OFFERS, never typed out. See the import at the head of this file.
        type: unionOf(BUNDLE_RUNGS),
        required: false,
        description:
          'HOW DETAILED EACH RECORD IN THE COPY IS, as one position of the product\'s seven-level ladder. Five of ' +
          'the seven: a title; a title and the conclusion; a title and each child\'s title; a title and each ' +
          'child\'s title and conclusion; the whole thing. Left out, it is the whole thing. A record with nothing ' +
          'under it has neither of the two middle positions, and one asked for a position nobody wrote falls back ' +
          'to the shorter one that is written — the copy says at the top how many did. THIS IS NOT THE SIZE: ' +
          '`budgetBytes` is a ceiling on the whole text and this is how much each record says.',
        example: 'gist',
      },
      {
        key: 'shift',
        type: 'number',
        required: false,
        description:
          'HOW FAR THE PERSON MOVED EVERY PART FROM THE LEVEL ITS SHARE OF THE SIZE CHOSE, as the Less and More ' +
          'presses left it: a whole number from -4 to 4, negative for less and positive for more, one level a press. ' +
          'Left out or 0, every part stays where its share put it. Stored so that a copy filed after Less or More is ' +
          'the copy the person was reading, and the same copy can be made again later. ' +
          'NEVER A SHIFT OTHER THAN 0 TOGETHER WITH `detail`: one names a level for the whole copy and the other ' +
          'moves every part\'s level, and a bundle carrying both is refused when it is read, never ranked.',
        example: -1,
      },
      {
        key: 'budgetBytes',
        type: 'number',
        required: false,
        description:
          'The ceiling for the whole text, in bytes. Left out it is 16384, which is what an agent can read at the ' +
          'start of a run without the corpus arriving with it. The reply always says whether the text fitted.',
        example: 16384,
      },
      {
        key: 'exports',
        type: 'BundleExport[]',
        required: false,
        description:
          'WHAT ACTUALLY LEFT, one entry per export, written by the server and never by a caller. Each carries the ' +
          'number an answer quotes back, when it went, who exported it, how large the text was, its hash, every ' +
          'record it carried with the version that record held, every restriction that went with it, and what was ' +
          'left out. A caller that sends this key is refused: an export is an act, not a claim.',
        example: [],
      },
      // EVERY KIND CARRIES THESE TWO, and a kind that does not is one that DISCARDS what a record
      // held when somebody changes its kind — which `tests/kind-can-change.test.ts` sweeps over every
      // pair and fails. Found by that sweep, not by a reader.
      ...commonFields('context bundle'),
    ],
    rules: [
      'A BUNDLE NEVER CARRIES A VALUE WHOSE VALIDITY RESTRICTION IT DROPPED. Every restriction reaching a record ' +
        'the text carries rides inside that record\'s own entry and is printed whole near the top as well. If a ' +
        'restriction cannot be read for a record in scope, the export is REFUSED — 409, nothing written, nothing ' +
        'copied — because text that leaves the building with a temporary value and without its limit is the one ' +
        'failure this kind exists to prevent.',
      'A BUNDLE SAYS HOW MANY THINGS IT LEFT OUT AND OF WHAT KIND. Never a bare count.',
      'AN EXPORT IS WRITTEN BY THE SERVER. A create or a patch carrying `exports` is refused, because an export is ' +
        'the only evidence of what was handed to an outside agent and a caller could otherwise claim one it never made. ' +
        'AND NO WRITE MAY CHANGE THE LIST BY ANY OTHER ROUTE: a wholesale `data` that simply leaves `exports` out drops ' +
        'it, and changing the kind sets it aside under `extra` — both are refused while the list has anything in it, ' +
        'and so is turning a record that carries an `exports` key in `extra` into a context bundle. Send `dataPatch` ' +
        'naming only the fields you mean to change, and the list stays where it is. This one is refused to a person ' +
        'too: there is no honest way to type an export by hand, which is why deleting an exported bundle is a person\'s ' +
        'to do and writing an export is nobody\'s.',
      'A BUNDLE THAT HAS EXPORTED MAY NOT BE DELETED BY AN AGENT. Filing one is not an act Mole Office refuses; deleting ' +
        'one that has exported destroys the record of what left the building. A person may delete it.',
    ],
    example: {
      scope: 'record',
      scopeRecordId: 'jT4UYozpfgVQ',
      preset: 'continue',
      reach: 2,
      budgetBytes: 16384,
    },
}

/** The shapes of this kind, moved out of ../kinds.ts with their comments unchanged. */
export const CONTEXT_BUNDLE_SHAPES: Record<string, ShapeSpec> = {
  // ------------------------------------------------------------------------ context bundle
  //
  // EVERY SHAPE FOR ONE FIELD, and each one is published rather than opaque. `exports` is the only
  // evidence Mole Office has of what was handed to an agent it does not run, so an agent reading the
  // served schema has to be able to see its structure — an `unknown[]` there would make the most
  // consequential field in the kind the least documented one.

  BundleExport: {
    name: 'BundleExport',
    description:
      'ONE EXPORT: what was handed over, at a moment, exactly. Written by the server on POST /api/bundles/export ' +
      'and never by a caller. It is not a copy of the text and it is not a claim that anybody read it.',
    fields: [
      { key: 'n', type: 'number', required: true, description: '1-based and gapless. It is what an answer quotes back.', example: 1 },
      { key: 'at', type: 'string', required: true, description: 'Local wall clock, never UTC.', example: '2026-08-26 19:04:11' },
      { key: 'by', type: 'BundleExporter', required: true, description: 'Who produced the text.', example: { actorType: 'human', actorId: 'owner' } },
      { key: 'characters', type: 'number', required: true, description: 'How many characters the text was.', example: 8763 },
      { key: 'bytes', type: 'number', required: true, description: 'How many bytes the text was.', example: 8891 },
      { key: 'textHash', type: 'string', required: true, description: 'Sixteen hex characters over the exported text, so two exports can be told apart.', example: '3f1c9a02b7de4415' },
      { key: 'carried', type: 'CarriedRecord[]', required: true, description: 'Every record the text carried, with the version it held at that moment.', example: [{ recordId: 'jT4UYozpfgVQ', contentHash: '3f1c9a02b7de4415' }] },
      { key: 'restrictions', type: 'CarriedRestriction[]', required: true, description: 'Every validity restriction that went into the text, with the version it held.', example: [{ restrictionId: 'p17aBcDeFgHi', contentHash: '9b2e77c10da34456' }] },
      { key: 'leftOut', type: 'BundleSubtraction[]', required: true, description: 'What was considered and not carried, by bucket, each saying what it was.', example: [] },
      { key: 'fits', type: 'boolean', required: true, description: 'True when the whole text came in under the budget.', example: true },
      {
        key: 'files',
        type: 'BundleExportFiles',
        required: false,
        description:
          'WHAT WENT WITH THE TEXT, when the caller asked for the related files. Each file that went, each named ' +
          'file that was not on disk and why, each file left out and why, and the size and hash of the zip. Absent ' +
          'when only the text left, and then this entry is exactly what it was before a zip was offered.',
        example: {
          included: [{ name: 'summary.ts', bytes: 4210, sha256: '3f1c9a02b7de4415b8d0d2ec0f7b6a5e5d4c3b2a1908070605040302010f0e0d', records: [{ recordId: 'made-up-record', recordTitle: 'The wrist camera module' }] }],
          missing: [],
          leftOut: [],
          zipBytes: 12000,
          zipHash: '9b2e77c10da34456a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef',
        },
      },
      {
        key: 'screening',
        type: 'BundleExportScreening',
        required: false,
        description:
          'WHAT THE OUTSIDE-TEXT SCREEN SAID BEFORE A ZIP LEFT, recorded on the zip press so the page can draw ' +
          'the same look-before-you-paste findings a text press draws. Absent on a text press, whose reply already ' +
          'carries the screen\'s answer and whose entry is exactly what it was before this field existed.',
        example: {
          findings: [{ check: 'email_address', severity: 'look_before_you_paste', where: { line: 3, startColumn: 9, endColumn: 30 }, says: 'An email address on line 3 of the text. Not refused: look at it before you paste.' }],
          ranChecks: ['key_in_text', 'email_address'],
          summary: 'Mole Office ran the screen over the whole text. It found one thing to look at before pasting, and nothing that stops the text leaving.',
        },
      },
    ],
  },

  CarriedRecord: {
    name: 'CarriedRecord',
    description:
      'One record an export carried, and the version it held then. `contentHash` is already a revision\'s identity ' +
      'and already the compare-and-set token every write uses, so this pair cannot drift from the ledger.',
    fields: [
      { key: 'recordId', type: 'string', required: true, description: 'The record.', example: 'jT4UYozpfgVQ' },
      { key: 'contentHash', type: 'string', required: true, description: 'The version it held at the moment of the export.', example: '3f1c9a02b7de4415' },
    ],
  },

  CarriedRestriction: {
    name: 'CarriedRestriction',
    description: 'One validity restriction an export carried, and the version the restriction record held.',
    fields: [
      { key: 'restrictionId', type: 'string', required: true, description: 'The record that carries the limit: a deliberate unresolved slot, or a step that ran a different method from the one it declares.', example: 'p17aBcDeFgHi' },
      { key: 'contentHash', type: 'string', required: true, description: 'The version it held at the moment of the export.', example: '9b2e77c10da34456' },
    ],
  },

  BundleExportFiles: {
    name: 'BundleExportFiles',
    description:
      'WHAT WENT WITH THE TEXT WHEN A ZIP WAS ASKED FOR: the files the carried records named, the named files ' +
      'that were not on disk, the files left out, and the zip itself. The same three lists are in the zip\'s ' +
      'manifest; this is the record of what left, so the bytes and the record cannot come apart.',
    fields: [
      {
        key: 'included',
        type: 'BundleExportFile[]',
        required: true,
        description: 'Every file that went into the zip, with its name, size, full sha256 and every record that named it.',
        example: [{ name: 'summary.ts', bytes: 4210, sha256: '3f1c9a02b7de4415b8d0d2ec0f7b6a5e5d4c3b2a1908070605040302010f0e0d', records: [{ recordId: 'made-up-record', recordTitle: 'The wrist camera module' }] }],
      },
      {
        key: 'missing',
        type: 'BundleExportMissing[]',
        required: true,
        description: 'Every named file that was not on disk as an ordinary readable file, with the record and the reason.',
        example: [],
      },
      {
        key: 'leftOut',
        type: 'BundleExportLeftOut[]',
        required: true,
        description: 'Every file that was there and was not carried: over the size line, past the file count, holding a key hash, or a name a zip cannot carry.',
        example: [],
      },
      { key: 'zipBytes', type: 'number', required: true, description: 'How many bytes the zip was that left.', example: 12000 },
      { key: 'zipHash', type: 'string', required: true, description: 'Sixty-four hex characters: the SHA-256 of the zip that left.', example: '9b2e77c10da34456a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef' },
    ],
  },

  BundleExportScreening: {
    name: 'BundleExportScreening',
    description:
      'WHAT THE OUTSIDE-TEXT SCREEN SAID BEFORE A ZIP EXPORT LEFT. The page draws this after a zip press, so a ' +
      'person who chose the zip sees the same look-before-you-paste findings as one who chose the text. The ' +
      'words are the screen\'s own, and the page reads each check through the one word list.',
    fields: [
      {
        key: 'findings',
        type: 'BundleExportScreeningFinding[]',
        required: true,
        description: 'Every thing the screen found, in the order it found them. A clean answer may still hold the one disclosure that other people\'s names were not checked.',
        example: [{ check: 'email_address', severity: 'look_before_you_paste', where: { line: 3, startColumn: 9, endColumn: 30 }, says: 'An email address on line 3 of the text. Not refused: look at it before you paste.' }],
      },
      {
        key: 'ranChecks',
        type: 'string[]',
        required: true,
        description: 'The substantive checks that ran to completion, in the order they ran. A check that did not finish is named by a finding instead and is absent here.',
        example: ['key_in_text', 'email_address'],
      },
      {
        key: 'summary',
        type: 'string',
        required: true,
        description: 'One paragraph naming what was found and which checks ran, so a reader who reads only this still knows the shape of the answer rather than reading a clean run as more than it is.',
        example: 'Mole Office ran the screen over the whole text. It found one thing to look at before pasting, and nothing that stops the text leaving.',
      },
    ],
  },

  BundleExportScreeningFinding: {
    name: 'BundleExportScreeningFinding',
    description:
      'ONE THING THE SCREEN FOUND BEFORE A ZIP EXPORT LEFT. `check` and `severity` are the screen\'s own stored ' +
      'words, which the page reads through the word list rather than printing. A finding about a key never ' +
      'carries the key\'s value.',
    fields: [
      { key: 'check', type: 'string', required: true, description: 'Which check found it, as the screen names its checks.', example: 'email_address' },
      { key: 'severity', type: 'string', required: true, description: 'Whether it stops the text leaving or only asks the person to look before pasting.', example: 'look_before_you_paste' },
      { key: 'where', type: 'BundleExportScreeningPlace | null', required: true, description: 'Where in the text it sits: a one-based line and inclusive columns. Null for a finding about the whole text.', example: { line: 3, startColumn: 9, endColumn: 30 } },
      { key: 'says', type: 'string', required: true, description: 'What the screen found, in words. Never the value a key finding matched.', example: 'An email address on line 3 of the text. Not refused: look at it before you paste.' },
    ],
  },

  BundleExportScreeningPlace: {
    name: 'BundleExportScreeningPlace',
    description:
      'WHERE IN THE TEXT ONE FINDING SITS: the one-based line, and the inclusive columns of the first and ' +
      'last character within that line. It is the place a person looks at, not an offset into the file.',
    fields: [
      { key: 'line', type: 'number', required: true, description: 'The one-based line number, where the first line of the text is line 1.', example: 3 },
      { key: 'startColumn', type: 'number', required: true, description: 'The one-based column of the finding\'s first character within its line.', example: 9 },
      { key: 'endColumn', type: 'number', required: true, description: 'The one-based column of the finding\'s last character within its line, inclusive.', example: 30 },
    ],
  },

  BundleExportFile: {
    name: 'BundleExportFile',
    description:
      'ONE FILE THAT WENT INTO A ZIP EXPORT. Its name is the name its record gives it, never a path on the ' +
      'office\'s disk. The size and SHA-256 are over the bytes that really went, and the records are every record ' +
      'in the export that named the file, because one file may be named twice.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'The file\'s own name as its record gives it, never the stored name or a path on disk.', example: 'summary.ts' },
      { key: 'bytes', type: 'number', required: true, description: 'How many bytes the file was.', example: 4210 },
      { key: 'sha256', type: 'string', required: true, description: 'Sixty-four hex characters: the SHA-256 of the bytes that went.', example: '3f1c9a02b7de4415b8d0d2ec0f7b6a5e5d4c3b2a1908070605040302010f0e0d' },
      { key: 'records', type: 'BundleExportFileRecord[]', required: true, description: 'Every record in the export that named this file, by id and title.', example: [{ recordId: 'made-up-record', recordTitle: 'The wrist camera module' }] },
    ],
  },

  BundleExportFileRecord: {
    name: 'BundleExportFileRecord',
    description: 'ONE RECORD THAT NAMED A FILE IN AN EXPORT: its record id, which a record page answers, and its title, so a reader knows what they are looking at. The keys are `recordId` and `recordTitle`, not `id` and `title`, because one record may name several files and the same record then appears in several entries.',
    fields: [
      { key: 'recordId', type: 'string', required: true, description: 'The record\'s id, which a record page answers.', example: 'made-up-record' },
      { key: 'recordTitle', type: 'string', required: true, description: 'The record\'s title at the moment of the export, so a reader knows what they are looking at.', example: 'The wrist camera module' },
    ],
  },

  BundleExportMissing: {
    name: 'BundleExportMissing',
    description:
      'ONE NAMED FILE THAT DID NOT GO INTO A ZIP EXPORT because it was not on disk as an ordinary readable ' +
      'file. The reason says which of those it was: no file, a directory, a link, or a read that failed.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'The file\'s own name as its record gives it.', example: 'clamp.png' },
      { key: 'records', type: 'BundleExportFileRecord[]', required: true, description: 'Every record in the export that named this file, by id and title.', example: [{ recordId: 'made-up-record', recordTitle: 'The wrist camera module' }] },
      { key: 'because', type: 'string', required: true, description: 'Why the file did not go, in one plain sentence.', example: 'there is no file at that path on this machine' },
    ],
  },

  BundleExportLeftOut: {
    name: 'BundleExportLeftOut',
    description:
      'ONE FILE THAT WAS THERE AND DID NOT GO INTO A ZIP EXPORT. It was left out by the export\'s size line, ' +
      'by its file count, because its bytes hold a key hash this office issued, or because its name cannot be an ' +
      'entry in a zip. It is named with its size and the reason, never dropped in silence.',
    fields: [
      { key: 'name', type: 'string', required: true, description: 'The file\'s own name as its record gives it.', example: 'archive.zip' },
      { key: 'bytes', type: 'number', required: true, description: 'How many bytes the file was.', example: 900000000 },
      { key: 'records', type: 'BundleExportFileRecord[]', required: true, description: 'Every record in the export that named this file, by id and title.', example: [{ recordId: 'made-up-record', recordTitle: 'The wrist camera module' }] },
      { key: 'because', type: 'string', required: true, description: 'Why the file did not go, in one plain sentence.', example: 'including it would take the export\'s file bytes past its line of 268435456' },
    ],
  },

  BundleSubtraction: {
    name: 'BundleSubtraction',
    description:
      'SOMETHING CONSIDERED AND NOT CARRIED. A count with what it was, never a bare number: "12 left out" tells a ' +
      'reader how many things they are missing and nothing about what they are.',
    fields: [
      { key: 'bucket', type: 'string', required: true, description: 'Which subtraction this is, in the words the reader that made it uses.', example: 'over_the_budget' },
      { key: 'count', type: 'number', required: true, description: 'How many.', example: 3 },
      { key: 'says', type: 'string', required: true, description: 'What was dropped, in words. Never only a number.', example: '3 open loops did not fit in the size this text was asked to come in under.' },
    ],
  },
}
