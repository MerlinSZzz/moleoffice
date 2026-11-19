// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST JOB: one ask from a running run for a registered host tool, and what came of it. The office files the record
 * at the ask, linked about the asking run; the host job runner (tools/run-the-host-jobs.mjs) runs the tool and answers
 * into the same record. Only the host-job doors write this kind (src/server/lib/host-job-door.ts).
 *
 * The tools themselves are declared in src/config/host-tools.mjs, which both the door and the runner check with.
 */
import type { FieldSpec } from './kinds.ts'
import { HOST_JOB_HOLDINGS } from './host-job-holdings.mjs'

export { HOST_JOB_HOLDINGS }

export const HOST_JOB_KIND = 'host_job'

/** Where a job stands. The first two wait or run; the other four are how it ended. */
export const HOST_JOB_STATES = ['asked', 'running', 'finished', 'ended at its time limit', 'could not start', 'lost'] as const
export type HostJobState = (typeof HOST_JOB_STATES)[number]
export const HOST_JOB_ENDINGS = ['finished', 'ended at its time limit', 'could not start', 'lost'] as const satisfies readonly HostJobState[]
/** The states a job holds a place in: asked or running. */
export const HOST_JOB_WAITING: readonly HostJobState[] = ['asked', 'running']

/**
 * ONE DIGEST GET /api/host-jobs/<id> SHOWS BESIDE THE JOB, a sha256 in canonical base64. A job filed
 * before its tool was registered holds no program digest, so `sha256Base64` is null and `says` gives
 * the reason in words.
 */
export interface AHostJobDigest {
  sha256Base64: string | null
  says?: string
}

/** The digests GET /api/host-jobs/<id> shows beside the job. */
export interface TheDigestsOfAHostJob {
  program: AHostJobDigest
  outputs: ({ name: string } & AHostJobDigest)[]
}

/**
 * THE TWO HALVES A DIGEST IS DRAWN IN on a host job's page, the first the longer when the length is odd (wave 13q round
 * 62). The page lets the line break only between them, so a digest's "=" never stands alone on a line.
 */
export function theHalvesOfADigest(digest: string): [string, string] {
  const half = Math.ceil(digest.length / 2)
  return [digest.slice(0, half), digest.slice(half)]
}

/** At most this many jobs of one tool are asked or running, and at most this many of one run. */
export const AT_MOST_JOBS_OF_A_TOOL = 3
export const AT_MOST_JOBS_OF_A_RUN = 1

export const THE_HOST_JOB_DOORS =
  'GET /api/host-tools lists the registered tools. POST /api/host-jobs with {tool, arguments} asks for one, from a ' +
  'running run with its own run key. GET /api/host-jobs/<id> reads a job. The runner on the host takes and answers jobs ' +
  'with the office key only.'

export const A_HOST_JOB_IS_WRITTEN_BY_ITS_DOORS =
  'A host job is written only by the host-job doors: the ask, and the runner\'s take and answer. Nothing was written. ' +
  `${THE_HOST_JOB_DOORS}`

/** One field, in the shape src/shared/kinds.ts reads. */
function field(key: string, type: string, required: boolean, description: string, example: unknown): FieldSpec {
  return { key, type, required, description, example }
}

const STATES = HOST_JOB_STATES.map((one) => `'${one}'`).join(' | ')

export const HOST_JOB_PURPOSE =
  'ONE ASK FOR A REGISTERED HOST TOOL, AND WHAT CAME OF IT: the tool, its arguments, who asked, the state, and at the end ' +
  'the exit code, the declared outputs and the last lines of the log, masked. The office runs only tools registered in ' +
  'its host-tools.json, with arguments of their declared shape, and never a command line an agent wrote.'

export const HOST_JOB_WHEN =
  'Never by hand, and never through POST /api/records: ask with POST /api/host-jobs {tool, arguments} from a running run, ' +
  'and the office files it. Read it with GET /api/host-jobs/<id>. The office sends the asking agent one message when it ends.'

export const HOST_JOB_FIELDS: FieldSpec[] = [
  field('tool', 'string', true, 'The registered name of the tool asked for.', 'stand-in'),
  field('sha256', 'string', false, "The sha256 the tool's program was registered with. The runner runs it only when the file still has it. Absent on a job filed before its tool was registered, such as the backup hand-over's; such a job starts nothing.", 'a'.repeat(64)),
  field('arguments', 'Record<string, unknown>', true, 'The named values asked with, each of the shape the tool declares.', { pack: 'blue' }),
  field('askedBy', 'Record<string, unknown>', true, 'The caller, in one of two shapes: {run, agent} for a job a running agent run asked for, proved by its own run key, or {kind, id} for a job the office files for the person or a secretary. Every reader of this kind reads both shapes.', { run: 'Rn3madeUp001', agent: 'Ag3madeUp001' }),
  field('state', STATES, true, `Where the job stands: ${HOST_JOB_STATES.join(', ')}.`, 'finished'),
  field('askedAt', 'string', true, 'When the office filed the ask, by its own clock.', '2026-11-07 09:00:00'),
  field('startedAt', 'string', false, 'When the runner took it. Absent while it is asked.', '2026-11-07 09:00:30'),
  field('endedAt', 'string', false, 'When it ended. Absent while it is asked or running.', '2026-11-07 09:01:10'),
  field('exitCode', 'number', false, 'The exit code of the program. Absent when it was ended by a signal, did not start, or was lost.', 0),
  field('signal', 'string', false, 'The signal that ended the program, when one did.', 'SIGTERM'),
  field('why', 'string', false, 'In words, why it ended as it did, when it did not simply finish: the time limit, what stopped the start, or that the runner stopped while it ran.', 'It was ended at its time limit of 60 seconds.'),
  field('outputs', 'Record<string, unknown>[]', false, "Each declared output: {name, state, size?, sha256?, text?}. The state is 'returned', 'missing', 'too large' or 'not a regular file'; text is there when it is UTF-8 within its declared size.", [{ name: 'RESULT.json', state: 'returned', size: 12, sha256: 'b'.repeat(64), text: '{"ok": true}' }]),
  field('heldBy', HOST_JOB_HOLDINGS.map((one) => `'${one}'`).join(' | '), false, `Which way held the tool's processes while it ran: ${HOST_JOB_HOLDINGS.join(', or ')}. A scope ends every process in it; a process group only does not end a process that left the group. Absent when the job did not start, or when the runner said nothing of it.`, HOST_JOB_HOLDINGS[0]),
  field('howItWasHeld', 'string', false, 'In words, how the job was held: the scope by its name, or why only its process group held it.', 'It was held in its own scope, mole-office-host-job-Jb3madeUp001.scope. When the job ends the runner stops the scope, and every process still in it is ended, also one that left the tool\'s process group.'),
  field('undeclaredFiles', 'number', false, 'How many other files the tool left in its output folder. They are not read.', 0),
  field('logTail', 'string', false, 'The last lines of the log, at most the declared number of lines and 8000 characters, masked.', 'done\n'),
  field('masked', 'string[]', false, 'Where something was masked before filing: "the reason", "how it was held", "the log", or an output\'s name. Absent when nothing was.', ['the log']),
]

export const HOST_JOB_RULES = [
  'Only the host-job doors write it.',
  '`endedAt` is present exactly when the state is one of the four endings.',
  '`askedBy` is either {run, agent}, for a job a running agent run asked for, or {kind, id}, for a job the office files for the person or a secretary.',
]

export const HOST_JOB_EXAMPLE = {
  tool: 'stand-in',
  sha256: 'a'.repeat(64),
  arguments: { pack: 'blue' },
  askedBy: { run: 'Rn3madeUp001', agent: 'Ag3madeUp001' },
  state: 'finished',
  askedAt: '2026-11-07 09:00:00',
  startedAt: '2026-11-07 09:00:30',
  endedAt: '2026-11-07 09:01:10',
  exitCode: 0,
  heldBy: HOST_JOB_HOLDINGS[0],
  howItWasHeld: 'It was held in its own scope, mole-office-host-job-Jb3madeUp001.scope. When the job ends the runner stops the scope, and every process still in it is ended, also one that left the tool\'s process group.',
  outputs: [{ name: 'RESULT.json', state: 'returned', size: 12, sha256: 'b'.repeat(64), text: '{"ok": true}' }],
  undeclaredFiles: 0,
  logTail: 'done\n',
}
