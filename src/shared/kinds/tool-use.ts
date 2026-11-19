// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPES OF A TOOL'S USE, in a file of their own.
 *
 * They were moved out of src/shared/kinds.ts with their comments unchanged, and SHAPE_SPECS
 * spreads them where the first of them stood.
 *
 * THIS FILE IMPORTS THE `ShapeSpec` TYPE FROM ./kind-common.ts, AND `THE_TEST_FILES_TOOL` AND
 * `TOOL_USE_MOST_CHARACTERS` FROM ../toolset.ts. IT IMPORTS NOTHING FROM THE CENTRAL FILE.
 */
import { type ShapeSpec } from './kind-common.ts'
import { THE_TEST_FILES_TOOL, TOOL_USE_MOST_CHARACTERS } from '../toolset.ts'
export const TOOL_USE_SHAPES: Record<string, ShapeSpec> = {
  ToolUse: {
    name: 'ToolUse',
    description:
      'ONE USE OF ONE TOOL, as a row against the run that used it: when, which tool, and what the use did. ' +
      'A use of a tool is one row in the tool_uses table, never a record of its own and never part of the run\'s ' +
      'record, so tool uses do not crowd the record list or the run\'s revisions. Written by POST /api/toolset/uses, ' +
      'which takes the time from the office\'s clock, and read by GET /api/toolset/runs/<run id>/uses. Until ' +
      'migration 0231 the lines were kept in the run\'s data.toolUses, and old revisions still hold them there. ' +
      `Only a use of ${THE_TEST_FILES_TOOL} also takes files and tree together, storing each file result in test_file_runs ` +
      'in the same transaction. The reply counts the stored files; the use line keeps its shape.',
    fields: [
      {
        key: 'at',
        type: 'date',
        required: true,
        description: 'When the use was written, in the office\'s local wall-clock time. The office writes it.',
        example: '2026-09-25 21:10:00',
      },
      {
        key: 'tool',
        type: 'string',
        required: true,
        description: 'The slug of the tool that was used, as its catalogue entry names it.',
        example: 'data-copy',
      },
      {
        key: 'said',
        type: 'string',
        required: true,
        description: `What the use did, in one line of at most ${String(TOOL_USE_MOST_CHARACTERS)} characters.`,
        example: 'make: copied the office database for the sandbox w13n',
      },
    ],
  },

  CheckCrash: {
    name: 'CheckCrash',
    description: "WHY A CHECK CRASHED, as whyTheCheckCrashed in src/config/inspection-ending.mjs worked it out from the check's session record, its exit file and its error stream.",
    fields: [
      { key: 'stage', type: "'before the first process row' | 'during the checkout' | 'after the checkout' | 'during the model' | 'after the model' | 'not known'", required: true, description: "How far the check got, read from the process rows of its commands on its session record. 'before the first process row' is also a check that ran on the host, where no such row is written. 'not known' is a record that was not read, or was cut before any such row.", example: 'during the model' },
      { key: 'stageSays', type: 'string', required: true, description: 'The same, in words, with what it was read from.', example: "The process row of the model's command, claude, was still open when the record was read." },
      { key: 'code', type: 'number | null', required: true, description: 'The exit code, when the process exited. Null when a signal ended it, or nothing recorded how it ended.', example: null },
      { key: 'signal', type: 'string | null', required: true, description: 'The signal that ended the process, when one did. Null otherwise.', example: 'SIGKILL' },
      { key: 'exitSays', type: 'string', required: true, description: 'How the process ended, in words, or that nothing recorded it.', example: "The check's process was ended by the signal SIGKILL." },
      { key: 'errorStreamSays', type: 'string', required: true, description: "What was taken from the error stream, in words: the launcher's refusal, all of the stream or its last bytes, or that the stream was empty, or that nothing kept it.", example: 'lastLines is the whole error stream, masked.' },
      { key: 'refusal', type: 'string', required: false, description: "The launcher's own sentence, when it started nothing: for the disk floor, for free space it could not read, or for no free seat, which names E2BIG when an argument was too long. The last such sentence on the error stream, masked. Present only when there is one, and then lastLines is absent.", example: 'No codex seat was given (tools/slot.mjs could not be started: E2BIG, the error Linux gives for arguments that are too long; one argument may hold at most 131,071 bytes).' },
      { key: 'lastLines', type: 'string | null', required: false, description: 'The end of the error stream when it holds no refusal: masked as a printed line is, then cut to at most 2,048 bytes, from the start of a line. Null when nothing kept the error stream. Absent when the stream was empty or blank, since an empty string is not stored.', example: 'Error: the model stopped answering' },
      { key: 'leftOut', type: 'number', required: false, description: 'How many bytes of the masked error stream came before lastLines and were left out. Present when lastLines is a string.', example: 0 },
    ],
  },

  ModelSteps: {
    name: 'ModelSteps',
    description: "THE MODEL'S STEPS IN A CHECK, as theModelsSteps in src/config/inspection-ending.mjs read them from the tool calls OpenCode printed: a summary, the longest calls, and the file that holds every call.",
    fields: [
      { key: 'says', type: 'string', required: true, description: 'What was read, in words: the calls and their times, and where the rest is. Or why nothing was read: nothing kept the output, the model ran in another runtime, or a call could not be read. Then no other field is present.', example: "OpenCode's output holds 92 tool calls by the model. Their times add up to 37.4 seconds. At least one of them was running for 36.6 seconds. longest holds the 10 longest, longest first. The file holds all 92, in the order OpenCode printed them." },
      { key: 'count', type: 'number', required: false, description: 'How many tool calls OpenCode printed.', example: 92 },
      { key: 'totalMs', type: 'number', required: false, description: "The calls' times added up, in milliseconds.", example: 37362 },
      { key: 'whileAnyRanMs', type: 'number', required: false, description: 'How long at least one call was running, in milliseconds. OpenCode runs calls at the same time, so this is less than totalMs when two of them overlap.', example: 36616 },
      { key: 'longest', type: 'ModelStep[]', required: false, description: 'The ten longest calls, longest first. Two of the same length keep the order OpenCode printed them in.', example: [{ tool: 'bash', status: 'completed', start: '2026-10-17T16:13:49.024Z', end: '2026-10-17T16:13:57.677Z', ms: 8653, command: 'npx tsc --noEmit -p .' }] },
      { key: 'file', type: 'string', required: false, description: "The file in the check's out folder that holds every call, in the order OpenCode printed them, as JSON. Absent when it could not be written, and then says names the file and why it could not be.", example: '/srv/mole-office-fixtures/.logs/runs/a-check/the-models-steps.json' },
    ],
  },

  ModelStep: {
    name: 'ModelStep',
    description: 'ONE TOOL CALL OF A CHECK\'S MODEL, as OpenCode printed it when the call ended.',
    fields: [
      { key: 'tool', type: 'string', required: true, description: 'The tool, as OpenCode named it: bash, read, edit, grep, or an office tool.', example: 'bash' },
      { key: 'status', type: 'string', required: true, description: 'How the call ended, as OpenCode wrote it: completed, or error.', example: 'completed' },
      { key: 'start', type: 'string', required: true, description: 'When the call started, in UTC, to the millisecond.', example: '2026-10-17T16:13:49.024Z' },
      { key: 'end', type: 'string', required: true, description: 'When the call ended, in UTC, to the millisecond.', example: '2026-10-17T16:13:57.677Z' },
      { key: 'ms', type: 'number', required: true, description: 'How long the call ran, in milliseconds.', example: 8653 },
      { key: 'command', type: 'string', required: true, description: "A bash call's command line, or the tool's name and its input as JSON. Masked as every printed line is, and then cut at 200 characters.", example: 'npx tsc --noEmit -p .' },
      { key: 'leftOut', type: 'number', required: false, description: 'How many characters of the masked command were cut off. Present only when some were.', example: 231 },
    ],
  },
}
