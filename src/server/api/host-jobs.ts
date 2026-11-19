// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST JOB DOOR, OVER HTTP.
 *
 *   GET   /api/host-tools                     the registered host tools, and any declaration refused, with why
 *   POST  /api/host-tools                     a secretary registers a tool, or changes one, naming the decision
 *   POST  /api/host-tools/take-off            a secretary takes a tool off, naming the decision
 *   POST  /api/host-jobs                      a running run asks for a registered tool
 *   GET   /api/host-jobs/:id                  one host job, as filed, and the digests the office computed, in base64
 *   POST  /api/host-jobs/take                 the runner, with the office key, takes the oldest asked job
 *   POST  /api/host-jobs/:id/answer           the runner, with the office key, says how a job ended
 *
 * THE RULES ARE IN src/server/lib/host-jobs.ts. What is here is the door: who may knock, what shape the body is, and
 * what comes back. Refusals are 400 for a shape, 403 for who is asking, 404 for an id this project does not hold, and
 * 409 for the state of the thing: a job not running, a tool with its jobs full, a file of tools the office refuses.
 */

import { nothingWrittenSentence } from '../lib/records/patching.ts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  answerAHostJob,
  answerTheJobsNoRunnerHolds,
  askForAHostJob,
  listTheHostTools,
  readAHostJob,
  registerAHostTool,
  takeOffAHostTool,
  takeTheOldestHostJob,
} from '../lib/host-jobs.ts'
import { whatTheHostJobRunnerIs } from '../lib/host-job-runner.ts'
import { HOST_JOB_ENDINGS, HOST_JOB_HOLDINGS } from '@shared/host-jobs.ts'
import { AT_MOST_REASON_CHARACTERS } from '../../config/host-tools.mjs'

// ============================================================================ the sentences

const LIST_NOTE =
  'THE REGISTERED HOST TOOLS: each name, what it does, the arguments it takes in words, its time limit, its outputs, ' +
  'who may ask it and who registered it on which decision. A declaration in the file that is refused is listed with why. ' +
  '`runner` says whether the office\'s host job runner runs, its process, and in words how it stands.'

const ASK_NOTE =
  'ASK FOR A REGISTERED HOST TOOL. Body {"tool","arguments"}. Only from a running run, with its own run key, and only ' +
  'a tool whose mayAsk names the agent (and the sandbox, when it names sandboxes). The office files a host job record ' +
  'about the run and answers 201 with it; the runner on the host runs the tool, and the office sends the agent one ' +
  'message when it ends. Read it with GET /api/host-jobs/<id>.'

const READ_NOTE =
  'ONE HOST JOB: the tool, its arguments, who asked, the state, and at the end the exit code, the outputs and the last ' +
  'lines of the log, masked. `digests` gives the sha256 of the program and of each output the runner hashed, in ' +
  'base64, since 64 hexadecimal characters are masked as a key on the way to an agent. A job filed before its tool ' +
  'was registered holds no program digest: `digests.program.sha256Base64` is null and `digests.program.says` says so ' +
  'in words.'

const REGISTER_NOTE =
  'REGISTER A HOST TOOL, OR CHANGE ONE. Body {"declaration","decision"}: the declaration whole, and the id of a ' +
  "decision the owner made that it rests on. A secretary's act, with the secretary's own key. The program must be there with the " +
  "sha256 given, this user's alone and outside the sandboxes folder, and its folder outside it too."

const TAKE_OFF_NOTE = 'TAKE A HOST TOOL OFF. Body {"name","decision"}. A secretary\'s act, naming a decision the owner made that it rests on.'

const TAKE_NOTE =
  "THE RUNNER TAKES THE OLDEST ASKED HOST JOB, with the office's own key. Body {} or {\"holding\": \"nothing\"}. A runner " +
  'that says it holds nothing has every job still running answered lost first, and their ids come back as `lost`. A ' +
  'job whose tool is not on the register, or whose program changed, is ended `could not start` and listed in `ended` ' +
  'with what its asker was told; the take then goes on to the next job. The job taken becomes running, and comes ' +
  'back with the tool\'s declaration as the office reads it now; {"job": null} when nothing is left to run.'

const ANSWER_NOTE =
  "THE RUNNER SAYS HOW A HOST JOB ENDED, with the office's own key and the job's project. Body {\"state\",\"why\"?," +
  '"exitCode"?,"signal"?,"heldBy"?,"howItWasHeld"?,"outputs"?,"undeclaredFiles"?,"logTail"?}. `heldBy` is ' +
  `${HOST_JOB_HOLDINGS.map((one) => `"${one}"`).join(' or ')}, the way that held the tool's processes, and \`howItWasHeld\` says it in words. ` +
  'The text is masked again before it is filed. `told` says whom the office told the job ended, or why it told nobody.'

// ============================================================================ the shapes

const anAsk = z.object({ tool: z.unknown(), arguments: z.unknown() }).strict()
const aRegistration = z.object({ declaration: z.unknown(), decision: z.unknown() }).strict()
const aTakingOff = z.object({ name: z.unknown(), decision: z.unknown() }).strict()
const aTake = z.object({ holding: z.literal('nothing').optional() }).strict()
const whichJob = z.object({ id: z.string().min(1) }).strict()
const anOutput = z
  .object({
    name: z.string().min(1).max(100),
    state: z.enum(['returned', 'missing', 'too large', 'not a regular file']),
    size: z.number().int().min(0).optional(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    text: z.string().optional(),
  })
  .strict()
const anAnswer = z
  .object({
    state: z.enum(HOST_JOB_ENDINGS),
    why: z.string().min(1).max(AT_MOST_REASON_CHARACTERS).optional(),
    exitCode: z.number().int().optional(),
    signal: z.string().min(1).max(40).optional(),
    heldBy: z.enum(HOST_JOB_HOLDINGS).optional(),
    howItWasHeld: z.string().min(1).max(AT_MOST_REASON_CHARACTERS).optional(),
    outputs: z.array(anOutput).max(8).optional(),
    undeclaredFiles: z.number().int().min(0).optional(),
    logTail: z.string().optional(),
  })
  .strict()

// ============================================================================ the doors

export async function hostJobRoutes(app: FastifyInstance): Promise<void> {
  app.get('/host-tools', route('host-tool.list', 'remote', LIST_NOTE), async () => ({ ...listTheHostTools(), runner: whatTheHostJobRunnerIs() }))

  app.post('/host-tools', route('host-tool.register', 'remote', REGISTER_NOTE), async (req, reply) => {
    const said = parse(aRegistration, req.body, 'The registration')
    const done = registerAHostTool(said, actorFrom(req))
    void reply.code(201)
    return done
  })

  app.post('/host-tools/take-off', route('host-tool.take-off', 'remote', TAKE_OFF_NOTE), async (req) => {
    const said = parse(aTakingOff, req.body, 'The tool to take off')
    return takeOffAHostTool(said, actorFrom(req))
  })

  app.post('/host-jobs', route('host-job.ask', 'remote', ASK_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const said = parse(anAsk, req.body, 'The ask')
    const job = askForAHostJob(said, actorFrom(req, { proveOwnRun: true }), workspaceId)
    void reply.code(201)
    return { job }
  })

  app.post('/host-jobs/take', route('host-job.take', 'remote', TAKE_NOTE), async (req) => {
    const said = parse(aTake, req.body, 'The take')
    const actor = actorFrom(req)
    const lost = said.holding === 'nothing' ? answerTheJobsNoRunnerHolds(actor) : undefined
    const taken = takeTheOldestHostJob(actor)
    return { ...taken, ...(lost === undefined ? {} : { lost }), ...(taken.job === null && taken.ended.length === 0 && (lost === undefined || lost.length === 0) ? { nothingWritten: nothingWrittenSentence({ kind: 'no-job-waiting' }) } : {}) }
  })

  app.get('/host-jobs/:id', route('host-job.read', 'remote', READ_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichJob, req.params, 'The host job to read')
    return readAHostJob(id, workspaceId)
  })

  app.post('/host-jobs/:id/answer', route('host-job.answer', 'remote', ANSWER_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(whichJob, req.params, 'The host job to answer')
    const said = parse(anAnswer, req.body, 'The answer')
    return answerAHostJob(id, workspaceId, said, actorFrom(req))
  })
}
