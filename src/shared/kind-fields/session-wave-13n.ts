// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FieldsOfALine, ValidationError } from '../kinds.ts'
import { A_CHECK_NOTHING_STARTS, A_MARK_IS, NOBODY_CHOSE_TO_RUN_CHECKS, theMarkAsStored } from '../whether-a-check-would-start.ts'

/**
 * WHAT A RUN'S cutFromCommit MUST BE, in the one sentence the record door says when it refuses any other value and the
 * office says when a run stored before that refusal holds one (theBaseARunNames in src/server/lib/sealed-tip.ts).
 */
export const A_CUT_FROM_COMMIT_IS =
  "The run's cutFromCommit must contain named and commit as strings, and commit must be a full 40-character lowercase hexadecimal commit hash."

/**
 * WHY A RUN'S cutFrom MAY NOT START WITH -, in the one sentence the record door says when it refuses one. git would read
 * such a name as an option, not a branch or a commit.
 */
export const A_CUT_FROM_MAY_NOT_START_WITH_A_DASH = "The run's cutFrom names a branch or commit, and a branch or commit name may not start with -."

/** Whether a recorded cutFromCommit has the shape A_CUT_FROM_COMMIT_IS says. */
export function aCutFromCommitHasItsShape(recorded: unknown): recorded is { named: string; commit: string } {
  if (typeof recorded !== 'object' || recorded === null || Array.isArray(recorded)) return false
  const { named, commit } = recorded as Record<string, unknown>
  return typeof named === 'string' && typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit)
}

/**
 * THE LINE 13n'S CHECKS ON A SESSION THAT A FIELD'S TYPE CANNOT SAY. `validateData` in
 * src/shared/kinds/validation.ts runs them from `CROSS_CHECKS` in src/shared/kinds/cross-checks.ts. A
 * cutFromCommit of another shape is refused when it is written, so the mistake shows where it was made. Stored, it would
 * show only when the run ended, as an account of the round that the office could not write. A cutFrom that starts with
 * - is refused the same way, so no reader of the run hands git an option for its base. So is a mark of a check nothing
 * would start of another shape, so the minute pass never meets one it cannot read.
 */
export function sessionWave13nCrossChecks(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = []
  const cutFrom = data['cutFrom']
  if (typeof cutFrom === 'string' && cutFrom.startsWith('-')) errors.push({ path: 'data.cutFrom', message: A_CUT_FROM_MAY_NOT_START_WITH_A_DASH })
  const recorded = data['cutFromCommit']
  if (recorded !== undefined && !aCutFromCommitHasItsShape(recorded)) errors.push({ path: 'data.cutFromCommit', message: A_CUT_FROM_COMMIT_IS })
  const mark = data[A_CHECK_NOTHING_STARTS]
  if (mark !== undefined && theMarkAsStored(mark) === null) errors.push({ path: `data.${A_CHECK_NOTHING_STARTS}`, message: A_MARK_IS })
  return errors
}

/**
 * THE FIELDS THE LINE 13n ADDS TO THE SESSION KIND. The head comment of src/shared/kinds.ts says how this file is joined
 * to the kind's own fields.
 */
export const sessionWave13n: FieldsOfALine = {
  kind: 'session',
  fields: [
    {
      key: 'cutFromCommit',
      type: 'Record<string, unknown>',
      required: false,
      description: `THE COMMIT THE RUN WAS CUT FROM: register-a-run writes named as the exact cutFrom and commit as the full commit hash it resolved to in the worktree when the run was filed. Absent means the run was filed before this field existed, the office it was filed with did not declare it, or the name did not resolve at filing. Any other value is refused: ${A_CUT_FROM_COMMIT_IS}`,
      example: { named: 'main', commit: '0123456789abcdef0123456789abcdef01234567' },
    },
    {
      key: 'whyTheCheckCrashed',
      type: 'CheckCrash',
      required: false,
      description:
        "WHY A CHECK CRASHED: the stage it reached, how its process ended, and the launcher's refusal or the last lines of " +
        'its error stream, masked. Written on a check\'s session by whatever ends the check, when the check ended without ' +
        'an answer, through whyTheCheckCrashed in src/config/inspection-ending.mjs: the message worker calls it, and any ' +
        'other program can run tools/inspector-why-it-crashed.mjs. ABSENT MEANS NOBODY WROTE IT: the check answered, it is ' +
        'still running, it ended before this field existed (wave 13n round AJ), or what ended it does not write it.',
      example: {
        stage: 'during the model',
        stageSays: "The process row of the model's command, claude, was still open when the record was read.",
        code: null,
        signal: 'SIGKILL',
        exitSays: "The check's process was ended by the signal SIGKILL.",
        errorStreamSays: 'lastLines is the whole error stream, masked.',
        lastLines: 'Error: the model stopped answering',
        leftOut: 0,
      },
    },
    {
      key: 'theModelsSteps',
      type: 'ModelSteps',
      required: false,
      description:
        "THE MODEL'S STEPS: how many tool calls a check's model made, their times added up, how long at least one was " +
        'running, and the ten longest, each with its start, end and command, masked and cut at 200 characters. Read only ' +
        "from the tool calls OpenCode printed, which the check tool hands on, so no model is asked again. Every call is in " +
        "a file in the check's out folder, which file names; the session holds only this summary. Written on a check's " +
        'session by whatever ends the check, through theModelsSteps in src/config/inspection-ending.mjs: the message worker ' +
        'calls it, and any other program can run tools/inspector-the-models-steps.mjs. A model that ran in another runtime, ' +
        'or output that could not be read, gives only says, saying why. ABSENT MEANS NOBODY WROTE IT: the check is still ' +
        'running, it ended before this field existed (wave 13n round AK), or what ended it does not write it.',
      example: {
        says: "OpenCode's output holds 2 tool calls by the model. Their times add up to 9.2 seconds. At least one of them was running for 8.7 seconds. longest holds the 2 longest, longest first. The file holds all 2, in the order OpenCode printed them.",
        count: 2,
        totalMs: 9_239,
        whileAnyRanMs: 8_653,
        longest: [
          { tool: 'bash', status: 'completed', start: '2026-10-17T16:13:49.024Z', end: '2026-10-17T16:13:57.677Z', ms: 8_653, command: 'npx tsc --noEmit -p .' },
          { tool: 'read', status: 'completed', start: '2026-10-17T16:13:50.000Z', end: '2026-10-17T16:13:50.586Z', ms: 586, command: 'read {"filePath":"src/worker/index.ts"}' },
        ],
        file: '/srv/mole-office-fixtures/.logs/runs/a-check/the-models-steps.json',
      },
    },
    {
      key: 'heldByItsFiler',
      type: 'boolean',
      required: false,
      description:
        "THE OFFICE'S OWN KEY FILED THIS SESSION UNDER THE NAME OF AN AGENT, AND THAT AGENT'S OWN KEY HOLDS IT. The " +
        "session hook writes it when it knows the session's agent by name and does not have the agent's key. It does one " +
        'thing: the agent named in the first revision may name this run in x-mole-office-session with its own key ' +
        '(src/server/lib/the-run-a-key-holds.ts). It is not `servingAgent`: the session is not work handed in, the office ' +
        'does not seal it, and nobody is told when it ends. Taken only as true, only from the office\'s own key, and only ' +
        'in the write that files the session. No later write may set, change or drop it. ABSENT MEANS the session was ' +
        'filed some other way, or before this field existed.',
      example: true,
    },
    {
      key: A_CHECK_NOTHING_STARTS,
      type: 'Record<string, unknown>',
      required: false,
      description:
        'A CHECK THE OFFICE QUEUED THAT NOTHING IN THE OFFICE WOULD START, AT THE TIME IT WAS ASKED. The office writes it ' +
        "beside theCheck when it queues a check and the message worker's mode and the checks switch say nothing would start " +
        'it (src/shared/whether-a-check-would-start.ts). After tellAfterMs the minute pass writes told, when it told the ' +
        "run's starter, once, or notTold, with why nobody was told. ABSENT MEANS something in the office would have started " +
        'the check, no check was queued, or it was queued before this field existed (wave 13n round DP), and then nobody is ' +
        `told. Any other shape is refused: ${A_MARK_IS}`,
      example: { message: 'the-message-that-asked', askedAt: '2026-11-08 04:22:13', inspector: 'the-inspector', because: NOBODY_CHOSE_TO_RUN_CHECKS, tellAfterMs: 1_794_115_333_000 },
    },
  ],
}
