// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST JOB DOOR. A running run asks for a registered host tool by name, with arguments of the tool's declared
 * shape; the office checks the ask and files it as a `host_job` record about the run. The runner on the host
 * (tools/run-the-host-jobs.mjs), holding the office's own key, takes the oldest asked job, runs the tool's fixed
 * program and answers into the same record. The office then tells the asking agent once.
 *
 * IT KEEPS THE OFFICE JOBS' IDEA AND NOT THEIR STORE (./office-jobs.ts). The office records what is wanted, the server
 * starts no process, and a program on the host does the work and answers through a door. A counter's firing has no
 * asker and no arguments, so a host job is its own kind with its own doors.
 *
 * THE TOOLS are in host-tools.json beside the office's keys file, never in the database, so a copy of the database
 * carries no permission to run programs. src/config/host-tools.mjs checks a declaration and its arguments, for the
 * door here and for the runner. A secretary registers, changes and takes off a tool, naming the owner's decision it
 * rests on.
 */
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SYSTEM_LINES } from '@shared/groups.ts'
import {
  AT_MOST_JOBS_OF_A_RUN,
  AT_MOST_JOBS_OF_A_TOOL,
  HOST_JOB_ENDINGS,
  HOST_JOB_HOLDINGS,
  HOST_JOB_KIND,
  HOST_JOB_WAITING,
  type AHostJobDigest,
  type HostJobState,
  type TheDigestsOfAHostJob,
} from '@shared/host-jobs.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { nowStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { actorTypeWord, kindWord } from '@shared/words.ts'
import { sqlite } from '../db/client.ts'
import { keysPathFrom } from '../../config/settings.mjs'
import { theHostToolsFileBeside } from '../../config/host-tools-file.mjs'
import {
  AT_MOST_LOG_CHARACTERS,
  AT_MOST_LOG_LINES,
  AT_MOST_OUTPUT_BYTES,
  maskedForAHostJob,
  readTheHostTools,
  theProgramOnDisk,
  theShapeWanted,
  whyADeclarationIsRefused,
  whyTheArgumentsAreRefused,
} from '../../config/host-tools.mjs'
import { writeASystemLineToOne } from './groups.ts'
import { asTheHostJobWriter } from './host-job-door.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { theSandboxTheOfficeVouchesFor } from './next-round.ts'
import { type RegisteredAgent } from './participants.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { theKeyProvesASecretary } from './the-key-proves-a-secretary.ts'
import { readParticipant } from '../db/read-participant.ts'
import { createRecordWithReport, getRecord, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { THE_OFFICE } from './the-office.ts'

/** One registered tool as the file holds it. */
interface Declaration {
  name: string
  what: string
  program: { path: string; sha256: string }
  argv: string[]
  arguments: Record<string, Record<string, unknown>>
  folder: string
  timeLimitSeconds: number
  outputs: { name: string; maxBytes: number }[]
  logLines: number
  mayAsk: { agents: string[]; sandboxes?: string[] }
  recovery?: { program: { path: string; sha256: string }; argv: string[] }
}
interface Registered {
  declaration: Declaration
  registered: { by: string; decision: string; at: string }
}

/** This office's file of host tools. */
export function theHostToolsFile(): string {
  return theHostToolsFileBeside(keysPathFrom(process.env))
}

/** The registered tools, or a refusal naming why none is used. */
function theRegisteredTools(): { tools: Registered[]; refusedTools: { name: string; why: string }[] } {
  const read = readTheHostTools(theHostToolsFile())
  if ('refused' in read) throw new PanelError(read.refused, 409)
  return { tools: read.tools as unknown as Registered[], refusedTools: read.refusedTools }
}

/**
 * ONE TOOL AS THE FILE REGISTERS IT NOW, or null when it is not registered. A door that files a job
 * for a tool it did not name itself, as the backup hand-over does, reads the declaration here and
 * puts the program's sha256 on the job, so the runner has something to check. A file that is not
 * used at all registers no tool, and the job carries no digest.
 */
export function theRegisteredHostTool(name: string): Declaration | null {
  const read = readTheHostTools(theHostToolsFile())
  if ('refused' in read) return null
  const found = (read.tools as unknown as Registered[]).find((one) => one.declaration.name === name)
  return found?.declaration ?? null
}

/** The registered tools in words: each name, and what it does. */
function theToolsInWords(tools: Registered[]): string {
  return tools.length === 0
    ? 'This office has no registered host tools.'
    : `The registered host tools are ${tools.map((one) => `${one.declaration.name} (${one.declaration.what})`).join('; ')}.`
}

/** Who may ask a tool, in words. */
function whoMayAsk(declaration: Declaration): string {
  const agents = declaration.mayAsk.agents.map((id) => {
    const row = readParticipant({ kind: 'agent', id }) as RegisteredAgent | null
    return row === null ? `${id} (no agent of this office has that id)` : `${row.handle} (${id})`
  })
  const sandboxes = declaration.mayAsk.sandboxes
  return `The agents that may ask ${declaration.name} are ${agents.join(', ')}` +
    (sandboxes === undefined ? '.' : `, from a run in the sandbox ${sandboxes.join(' or ')} as the office vouches for it.`)
}

/** GET /api/host-tools: what is registered, and any declaration in the file that is refused, with why. */
export function listTheHostTools(): { tools: Record<string, unknown>[]; refused: { name: string; why: string }[]; says: string } {
  const { tools, refusedTools } = theRegisteredTools()
  return {
    tools: tools.map(({ declaration, registered }) => ({
      name: declaration.name,
      what: declaration.what,
      arguments: theShapeWanted(declaration),
      timeLimitSeconds: declaration.timeLimitSeconds,
      outputs: declaration.outputs,
      mayAsk: whoMayAsk(declaration),
      registered,
    })),
    refused: refusedTools,
    says: theToolsInWords(tools),
  }
}

/** The jobs asked or running, of one tool or of one run. */
function theJobsWaiting(where: 'tool' | 'run', value: string): string[] {
  const path = where === 'tool' ? '$.tool' : '$.askedBy.run'
  const rows = sqlite
    .prepare(
      `SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, ?) = ?
         AND json_extract(data, '$.state') IN (${HOST_JOB_WAITING.map(() => '?').join(', ')}) ORDER BY created_at, id`,
    )
    .all(HOST_JOB_KIND, path, value, ...HOST_JOB_WAITING) as { id: string }[]
  return rows.map((row) => row.id)
}

/**
 * POST /api/host-jobs: ASK FOR A REGISTERED TOOL. The asker is a running run of this project, proved by its own run
 * key (`ownKeyRun`, which the door asks `actorFrom` for) and not acting for another, and the session header names that
 * run. An agent's lasting key is not a run's. Every refusal says what would be right, and writes nothing.
 */
export function askForAHostJob(input: { tool: unknown; arguments: unknown }, actor: Actor, workspaceId: string): PanelRecord {
  const agent = theAgentTheKeyProves(actor)
  const run = actor.ownKeyRun === undefined || actor.sessionId !== actor.ownKeyRun ? null : getRecord(actor.ownKeyRun)
  if (actor.type !== 'agent' || actor.provedHolder !== undefined || agent === null || run === null) {
    throw new PanelError(
      'A host tool is asked for by a running run, with its own run key, named in x-mole-office-session, and not for ' +
        'another. This request is not one. Nothing was written.',
      403,
    )
  }
  if (run.kind !== 'session' || run.workspaceId !== workspaceId || run.deletedAt !== null || run.data['state'] !== 'running' || theAgentARunServes(run.data)?.id !== agent) {
    throw new PanelError(`A host tool is asked for from a running run of the asking agent in this project, and ${run.id} is not one. Nothing was written.`, 403)
  }
  const { tools } = theRegisteredTools()
  const found = typeof input.tool === 'string' ? tools.find((one) => one.declaration.name === input.tool) : undefined
  if (found === undefined) {
    throw new PanelError(`${typeof input.tool === 'string' ? `"${input.tool}" is not a registered host tool.` : '"tool" must be the name of a registered host tool.'} ${theToolsInWords(tools)} Nothing was written.`, 400)
  }
  const { declaration } = found
  const why = whyTheArgumentsAreRefused(declaration, input.arguments)
  if (why !== null) throw new PanelError(`The arguments for ${declaration.name} are refused: ${why}. ${theShapeWanted(declaration)} Nothing was written.`, 400)
  if (!declaration.mayAsk.agents.includes(agent)) {
    throw new PanelError(`This agent may not ask ${declaration.name}. ${whoMayAsk(declaration)} Nothing was written.`, 403)
  }
  if (declaration.mayAsk.sandboxes !== undefined) {
    const sandbox = theSandboxTheOfficeVouchesFor(run)
    if (sandbox === null || !declaration.mayAsk.sandboxes.includes(sandbox.instance)) {
      throw new PanelError(
        `Run ${run.id} may not ask ${declaration.name}: ${sandbox === null ? 'it is in no sandbox the office vouches for' : `it is in the sandbox ${sandbox.instance}`}. ` +
          `${whoMayAsk(declaration)} Nothing was written.`,
        403,
      )
    }
  }
  const ofTheTool = theJobsWaiting('tool', declaration.name)
  if (ofTheTool.length >= AT_MOST_JOBS_OF_A_TOOL) {
    throw new PanelError(`${declaration.name} already has ${ofTheTool.length} jobs asked or running (${ofTheTool.join(', ')}), and it takes at most ${AT_MOST_JOBS_OF_A_TOOL}. Ask again when one has ended. Nothing was written.`, 409)
  }
  const ofTheRun = theJobsWaiting('run', run.id)
  if (ofTheRun.length >= AT_MOST_JOBS_OF_A_RUN) {
    throw new PanelError(`Run ${run.id} already has a host job asked or running (${ofTheRun.join(', ')}), and a run has at most ${AT_MOST_JOBS_OF_A_RUN}. Ask again when it has ended. Nothing was written.`, 409)
  }
  const made = sqlite.transaction(() =>
    asTheHostJobWriter(() =>
      createRecordWithReport({
        kind: HOST_JOB_KIND,
        title: `Host job: ${declaration.name}`,
        workspaceId,
        data: {
          tool: declaration.name,
          sha256: declaration.program.sha256,
          arguments: input.arguments as Record<string, unknown>,
          askedBy: { run: run.id, agent },
          state: 'asked' satisfies HostJobState,
          askedAt: nowStamp(),
        },
        links: [{ type: 'about', toId: run.id }],
        actor: THE_OFFICE,
        bindCallerSession: false,
        namesWhatIsAlreadyFiled: false,
      }),
    ),
  )()
  return made.record
}

/**
 * One host job of this project, or a refusal. `recordInWorkspace` comes first, so an id of another project is the
 * 404 any id it does not hold gets, before anything is read or written. A record of another kind is a 409 that says
 * what it is, as the counter door says it, and a deleted job is a 404.
 */
function theJob(id: string, workspaceId: string): PanelRecord {
  const job = recordInWorkspace(id, workspaceId)
  if (job.kind !== HOST_JOB_KIND) {
    throw new PanelError(`${id} is not a host job: it is a ${kindWord(job.kind).text}${quotedUnlessAMessage(job, ' called ', '')}. Nothing was written.`, 409)
  }
  if (job.deletedAt !== null) throw new PanelError(`No host job has the id ${id}: it was deleted.`, 404)
  return job
}

/**
 * GET /api/host-jobs/<id>: one job, as filed, and the digests the office computed. Anyone this office lets read
 * records reads it.
 *
 * THE DIGESTS ARE SHOWN IN BASE64. The record keeps each sha256 as 64 hexadecimal characters, and every reply an agent
 * reads through the office tool has such a run masked as a key, so a digest could not be read back and two outputs
 * could not be compared. Only the program's sha256, which the office checked, and each output's, which the runner
 * hashed, are shown. What a tool printed stays as `maskedForAHostJob` filed it, so a key a tool prints is not shown.
 *
 * A DIGEST IS TOLD APART FROM A KEY BY WHERE IT COMES FROM, not by its shape: a sha256 in base64 is padded as base64
 * is, and the mask hides a padded run whole, as a key. These are worked out here from the record's own hex and never
 * pass the mask. A digest a tool prints itself is masked in the log as a key is.
 */
export function readAHostJob(id: string, workspaceId: string): { job: PanelRecord; digests: TheDigestsOfAHostJob } {
  const job = theJob(id, workspaceId)
  const outputs = (job.data['outputs'] as { name: string; sha256?: unknown }[] | undefined) ?? []
  return {
    job,
    digests: {
      program: aDigestInBase64(job.data['sha256'], 'its program', job.id),
      outputs: outputs.filter((one) => one.sha256 !== undefined).map((one) => ({ name: one.name, ...aDigestInBase64(one.sha256, `the output ${one.name}`, job.id) })),
    },
  }
}

/**
 * A sha256 the record holds, in canonical base64. A JOB WITH NO DIGEST READS CLEANLY: the office files a
 * host job before its tool is registered, and such a job carries no sha256, so the answer says so in
 * words instead of failing. A string that is not 64 hexadecimal characters is a broken record, not an
 * absent digest, so the read fails as it did before.
 */
function aDigestInBase64(hex: unknown, what: string, id: string): AHostJobDigest {
  if (hex === undefined) return { sha256Base64: null, says: `This job holds no sha256 of ${what}, so there is no digest to show.` }
  if (typeof hex !== 'string' || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`The host job ${id} holds a sha256 of ${what} that is not 64 hexadecimal characters, so no digest of it is shown.`)
  }
  return { sha256Base64: Buffer.from(hex, 'hex').toString('base64') }
}

/** The runner's doors take the office's own key, and nothing else. */
function refuseAllButTheOfficeKey(actor: Actor): void {
  if (actor.provedBy !== 'the-office-key') {
    throw new PanelError("Only the host job runner, with the office's own key, takes and answers host jobs. Nothing was written.", 403)
  }
}

/** Why a job is lost when the runner that takes this office's jobs says it holds none. */
export const NO_RUNNER_HOLDS_IT =
  'No host job runner holds this job. The runner that took it stopped before it wrote down that it held it, or that note was removed, ' +
  'so whether the tool ran is not known. It is not run again by itself; ask again.'

/**
 * POST /api/host-jobs/take with {"holding": "nothing"}: EVERY JOB STILL RUNNING IS ANSWERED LOST, and their ids come
 * back. The office has one key and one runner's folder beside it, and a runner takes jobs only while it holds the lock
 * in that folder. So a runner that says, holding the lock, that it holds no job speaks for every runner that could have
 * taken one: a job still running was taken by a runner that stopped before it wrote the job down, or whose note of it
 * was removed.
 */
export function answerTheJobsNoRunnerHolds(actor: Actor): string[] {
  refuseAllButTheOfficeKey(actor)
  const rows = sqlite
    .prepare(`SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'running' ORDER BY created_at, id`)
    .all(HOST_JOB_KIND) as { id: string }[]
  for (const { id } of rows) endAHostJob(getRecord(id) as PanelRecord, { state: 'lost', why: NO_RUNNER_HOLDS_IT }, actor)
  return rows.map(({ id }) => id)
}

/** What one take answered: the runnable job, or none, and every job it ended on the way there. */
export interface AHostJobTake {
  job: PanelRecord | null
  declaration?: Declaration
  ended: AnEndedHostJob[]
}

/**
 * POST /api/host-jobs/take: THE RUNNER TAKES THE OLDEST ASKED JOB, which becomes `running`. It is handed the tool's
 * declaration as the office reads it now, for the runner to check against its own read of the file. A job whose
 * tool is not on the register, or whose program changed, cannot start: it is ended `could not start`, its asker is
 * told, and the take goes on to the next. `job` is null when nothing is left to run, and `ended` names every job
 * ended on the way.
 */
export function takeTheOldestHostJob(actor: Actor): AHostJobTake {
  refuseAllButTheOfficeKey(actor)
  const ended: AnEndedHostJob[] = []
  for (;;) {
    const row = sqlite
      .prepare(`SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'asked' ORDER BY created_at, id LIMIT 1`)
      .get(HOST_JOB_KIND) as { id: string } | undefined
    if (row === undefined) return { job: null, ended }
    const job = getRecord(row.id) as PanelRecord
    const found = theRegisteredTools().tools.find((one) => one.declaration.name === job.data['tool'])
    if (found === undefined || found.declaration.program.sha256 !== job.data['sha256']) {
      const why = found === undefined
        ? `The tool ${String(job.data['tool'])} was taken off the register after the job was asked.`
        : `The tool ${String(job.data['tool'])} was registered again with another program after the job was asked.`
      const done = endAHostJob(job, { state: 'could not start', why }, actor)
      ended.push({ id: job.id, told: done.told })
      continue
    }
    const written = asTheHostJobWriter(() => patchRecord(job.id, { dataPatch: { state: 'running', startedAt: nowStamp() } }, THE_OFFICE)).record
    return { job: written, declaration: found.declaration, ended }
  }
}

/** What the runner answers about one job it ran. */
export interface AHostJobAnswer {
  state: (typeof HOST_JOB_ENDINGS)[number]
  why?: string
  exitCode?: number
  signal?: string
  heldBy?: (typeof HOST_JOB_HOLDINGS)[number]
  howItWasHeld?: string
  outputs?: { name: string; state: 'returned' | 'missing' | 'too large' | 'not a regular file'; size?: number; sha256?: string; text?: string }[]
  undeclaredFiles?: number
  logTail?: string
}

/**
 * POST /api/host-jobs/<id>/answer: THE RUNNER SAYS HOW A JOB IT TOOK ENDED. The reason, the log and each output's
 * text are masked here and only here, so what is filed is masked whoever wrote the answer, and the record says where.
 * The asking agent is told once.
 */
export function answerAHostJob(id: string, workspaceId: string, answer: AHostJobAnswer, actor: Actor): { job: PanelRecord; told: WhatTheAskerWasTold } {
  const job = theJob(id, workspaceId)
  refuseAllButTheOfficeKey(actor)
  if (job.data['state'] !== 'running') {
    throw new PanelError(`The host job ${id} is ${String(job.data['state'])}, not running, so it takes no answer. Nothing was written.`, 409)
  }
  return endAHostJob(job, answer, actor)
}

/** Masked text, and where it was masked. */
function masked(text: string, where: string, places: string[]): string {
  const done = maskedForAHostJob(text)
  if (done.masked) places.push(where)
  return done.text
}

/** The last lines of a log, at most the tool's number of lines and the office's number of characters. */
function theLastLines(log: string, lines: number): string {
  const kept = lines === 0 ? '' : log.split('\n').slice(-lines - (log.endsWith('\n') ? 1 : 0)).join('\n')
  return kept.length > AT_MOST_LOG_CHARACTERS ? kept.slice(-AT_MOST_LOG_CHARACTERS) : kept
}

/** Whom the office told that a job ended, or that there was nobody to tell and why. */
export interface WhatTheAskerWasTold {
  to: { kind: 'person' | 'agent'; id: string } | null
  says: string
}

/** A job that ended on the way to another one, and what its asker was told. */
export interface AnEndedHostJob {
  id: string
  told: WhatTheAskerWasTold
}

/** An asker as the end path reads it: the run shape, the person or secretary shape, or nobody. */
function theAskerToTell(askedBy: unknown): { to: { kind: 'person' | 'agent'; id: string }; about?: { run: string } } | { to: null; says: string } {
  if (askedBy !== null && typeof askedBy === 'object' && !Array.isArray(askedBy)) {
    const asked = askedBy as Record<string, unknown>
    if (typeof asked['run'] === 'string' && typeof asked['agent'] === 'string') {
      return { to: { kind: 'agent', id: asked['agent'] }, about: { run: asked['run'] } }
    }
    if ((asked['kind'] === 'person' || asked['kind'] === 'agent') && typeof asked['id'] === 'string' && asked['id'] !== '') {
      return { to: { kind: asked['kind'], id: asked['id'] } }
    }
  }
  return { to: null, says: 'The office told nobody the job ended: its askedBy is neither {run, agent} nor {kind, id}.' }
}

function endAHostJob(job: PanelRecord, answer: AHostJobAnswer, actor: Actor): { job: PanelRecord; told: WhatTheAskerWasTold } {
  void actor
  const places: string[] = []
  const declaration = theRegisteredTools().tools.find((one) => one.declaration.name === job.data['tool'])?.declaration
  const lines = Math.min(declaration?.logLines ?? AT_MOST_LOG_LINES, AT_MOST_LOG_LINES)
  // A BLANK TEXT IS LEFT OUT, as the kind wants: an empty output says so by its size 0, and an empty log by no logTail.
  const outputs = answer.outputs?.map(({ text: given, ...output }) => {
    const text = given === undefined || given === '' || given.length > AT_MOST_OUTPUT_BYTES ? undefined : masked(given, output.name, places)
    return { ...output, ...(text === undefined ? {} : { text }) }
  })
  const logTail = answer.logTail === undefined ? '' : theLastLines(answer.logTail, lines)
  const data = {
    state: answer.state,
    endedAt: nowStamp(),
    ...(answer.why === undefined ? {} : { why: masked(answer.why, 'the reason', places) }),
    ...(answer.exitCode === undefined ? {} : { exitCode: answer.exitCode }),
    ...(answer.signal === undefined ? {} : { signal: answer.signal }),
    ...(answer.heldBy === undefined ? {} : { heldBy: answer.heldBy }),
    ...(answer.howItWasHeld === undefined ? {} : { howItWasHeld: masked(answer.howItWasHeld, 'how it was held', places) }),
    ...(outputs === undefined ? {} : { outputs }),
    ...(answer.undeclaredFiles === undefined ? {} : { undeclaredFiles: answer.undeclaredFiles }),
    ...(logTail === '' ? {} : { logTail: masked(logTail, 'the log', places) }),
  }
  const written = asTheHostJobWriter(() =>
    patchRecord(job.id, { dataPatch: { ...data, ...(places.length === 0 ? {} : { masked: places }) } }, THE_OFFICE),
  ).record
  // THE ENDING GOES TO WHOEVER ASKED, in either shape the kind declares. A person or a secretary
  // is told once, with no run beside the line because neither has a run. When the asker names
  // nobody this office holds, nothing is written and the answer says why.
  const asker = theAskerToTell(job.data['askedBy'])
  let told: WhatTheAskerWasTold
  if (asker.to === null) {
    told = { to: null, says: asker.says }
  } else if (readParticipant(asker.to) === null) {
    told = { to: null, says: `The office told nobody the job ended: no ${actorTypeWord(asker.to.kind).text} of this office has the id ${asker.to.id}.` }
  } else {
    writeASystemLineToOne(
      asker.to,
      job.workspaceId,
      SYSTEM_LINES.aHostJobEnded(job.id, String(job.data['tool']), answer.state),
      { type: 'system', id: moleOffice().id },
      asker.about,
    )
    told = { to: asker.to, says: `The office told the ${actorTypeWord(asker.to.kind).text} ${asker.to.id} that the job ended.` }
  }
  return { job: written, told }
}

/**
 * A secretary's registration names an owner's decision of this office that it rests on: a live decision whose
 * `decided_by` is THE_OWNER, the word the decision kind declares for them.
 */
function theDecisionItRestsOn(decision: unknown): string {
  const record = typeof decision === 'string' && decision !== '' ? getRecord(decision) : null
  if (record === null || record.kind !== 'decision' || record.deletedAt !== null) {
    throw new PanelError(
      `"decision" must be the id of a decision the owner made that this rests on, and ${typeof decision === 'string' ? `${decision} is no decision of this office` : 'none was given'}. Nothing was written.`,
      400,
    )
  }
  if (record.data['decided_by'] !== THE_OWNER) {
    const decidedBy = record.data['decided_by']
    throw new PanelError(
      `"decision" must be the id of a decision the owner made, which says decided_by "${THE_OWNER}", and ${record.id} says ` +
        `${typeof decidedBy === 'string' && decidedBy.trim() !== '' ? `"${decidedBy}"` : 'nobody'}. Nothing was written.`,
      400,
    )
  }
  return record.id
}

/** Only a secretary registers, changes or takes off a host tool, with its own key. */
function refuseAllButASecretary(actor: Actor): string {
  const agent = theAgentTheKeyProves(actor)
  if (agent === null || !theKeyProvesASecretary(actor)) {
    throw new PanelError(
      "Registering, changing or taking off a host tool is a secretary's act, on a decision of the owner's that covers it, " +
        "with the secretary's own key. Nothing was written.",
      403,
    )
  }
  return agent
}

/** Write the file whole, mode 600, through a file beside it, so a reader never meets half of it. */
function writeTheHostTools(tools: Registered[]): void {
  const file = theHostToolsFile()
  mkdirSync(dirname(file), { recursive: true })
  const next = `${file}.${process.pid}.next`
  writeFileSync(next, JSON.stringify({ tools }, null, 2) + '\n', { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, file)
}

/**
 * POST /api/host-tools: A SECRETARY REGISTERS A TOOL, OR CHANGES ONE BY REGISTERING IT AGAIN UNDER ITS NAME. The
 * declaration is checked in words and on disk: the program is a regular file outside the sandboxes folder with the
 * sha256 given, this user's alone in a folder that is this user's alone, and its folder is a folder outside the
 * sandboxes folder.
 */
export function registerAHostTool(input: { declaration: unknown; decision: unknown }, actor: Actor): { tool: Registered; says: string } {
  const by = refuseAllButASecretary(actor)
  const decision = theDecisionItRestsOn(input.decision)
  const why = whyADeclarationIsRefused(input.declaration)
  if (why !== null) throw new PanelError(`The declaration is refused: ${why}. Nothing was written.`, 400)
  const declaration = input.declaration as Declaration
  const onDisk = theProgramOnDisk(declaration)
  if ('refused' in onDisk) throw new PanelError(`The declaration is refused: ${onDisk.refused}. Nothing was written.`, 400)
  if (declaration.recovery !== undefined) {
    const recovery = theProgramOnDisk({ program: declaration.recovery.program, folder: declaration.folder })
    if ('refused' in recovery) throw new PanelError(`The declaration is refused: its recovery program is not the one it names: ${recovery.refused}. Nothing was written.`, 400)
  }
  const { tools } = theRegisteredTools()
  const tool: Registered = { declaration, registered: { by, decision, at: nowStamp() } }
  const before = tools.some((one) => one.declaration.name === declaration.name)
  writeTheHostTools([...tools.filter((one) => one.declaration.name !== declaration.name), tool])
  return { tool, says: `${declaration.name} is ${before ? 'registered again, and its new declaration is the one used' : 'registered'}, on the decision ${decision}.` }
}

/** POST /api/host-tools/take-off: a secretary takes a tool off the register. A job already asked of it does not start. */
export function takeOffAHostTool(input: { name: unknown; decision: unknown }, actor: Actor): { says: string } {
  refuseAllButASecretary(actor)
  const decision = theDecisionItRestsOn(input.decision)
  const { tools } = theRegisteredTools()
  if (typeof input.name !== 'string' || !tools.some((one) => one.declaration.name === input.name)) {
    throw new PanelError(`${typeof input.name === 'string' ? `"${input.name}" is not a registered host tool.` : '"name" must name a registered host tool.'} ${theToolsInWords(tools)} Nothing was written.`, 400)
  }
  writeTheHostTools(tools.filter((one) => one.declaration.name !== input.name))
  return { says: `${input.name} is taken off the register, on the decision ${decision}. A job already asked of it will not start.` }
}
